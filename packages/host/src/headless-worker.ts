/**
 * PLAN 0.30.0 P5 HeadlessDispatcher.
 * D2, D4–D9, D11, R5, R6, R48-H1/L1/M3, UK-4.
 * Resume and adopt read the durable session record. A live pid whose
 * `ps -o lstart=` matches `procStartedAt` is adopted — never spawned beside.
 * `resultSent=true` is written only after composeAndSend returns.
 */
import { execFileSync, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, sep } from "node:path";
import { truncateTail, wrapDispatchedPrompt } from "@loom/protocol";
import {
  ARGV_TEMPLATE_VERSION,
  HEADLESS_WORKER_HINT,
  RESUME_CONTINUATION_MESSAGE,
  buildAgentArgv,
  promptFingerprint,
  validateWorkerConfig,
  type AgentKind,
  type WorkerConfig,
} from "./agent-argv";
import { parseAgentStream, type ParsedAgentStream } from "./agent-stream-parsers";
import {
  cardKeyHash,
  listCardSessions,
  readCardSession,
  writeCardSession,
  type CardSessionRecord,
} from "./card-session-store";
import {
  killProcessGroup,
  processGroupAlive,
  spawnDetachedWorker,
  type SpawnedWorker,
} from "./process-group";

const OUTPUT_CAP = 200_000;
const SUMMARY_CAP = 900;
const DEFAULT_TIMEOUT_MS = 7_200_000;
const GROUP_KILL_GRACE_MS = 10_000;
const MAX_ATTEMPTS = 2;

export type HeadlessFlight = {
  workerId: string;
  cardId: string;
  agent: AgentKind;
  pid?: number;
  pgid?: number;
};

export type HeadlessDispatchCard = {
  roomId: string;
  cardId: string;
  agent: AgentKind;
  prompt: string;
  fromPeerId: string;
  dispatchHandoffId: string;
  /** Absent → worker config cwd. Realpath must sit under allowedRoots. */
  cwd?: string;
};

export type HeadlessResultFields = {
  status: "failed";
  reason: string;
  output: string;
  truncated: boolean;
  summary: string;
  note?: string;
};

type HeadlessCommand = { bin: string; args: string[] };

type ResultTarget = {
  cardId: string;
  fromPeerId: string;
  dispatchHandoffId: string;
  startedAt: string;
  paneId?: string;
};

type HeadlessDeps = {
  config: WorkerConfig;
  loomDir: string;
  node: string;
  commands: Record<AgentKind, HeadlessCommand>;
  sink: {
    composeAndSend: (
      target: ResultTarget,
      fields: HeadlessResultFields,
      opts?: { node: string },
    ) => Promise<unknown>;
  };
};

type LaunchMode = "fresh" | "resume" | "adopt" | "cwd_mismatch" | "give_up" | "busy";

type CardOwner = {
  handoffId: string;
  done: Promise<void>;
  resolve: () => void;
  abandoned: boolean;
  abandon: () => void;
  abandonedPromise: Promise<void>;
};

type SpawnPlan = {
  sessionId: string;
  attempts: number;
  resumeSessionId?: string;
  startedAt: string;
};

type SpawnOutcome =
  | { kind: "abandon" }
  | { kind: "spawn_error"; message: string }
  | { kind: "setup_failed"; message: string }
  | { kind: "cwd_denied" }
  | {
      kind: "done";
      timedOut: boolean;
      finished: boolean;
      parsed: ParsedAgentStream;
      raw: string;
      transcriptPath: string;
      record: CardSessionRecord;
      sessionId: string;
    };

const AGENTS: readonly AgentKind[] = ["claude", "codex", "grok"];

class Semaphore {
  private held = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  get running(): number {
    return this.held;
  }

  get depth(): number {
    return this.waiters.length;
  }

  acquire(): Promise<void> {
    if (this.held < this.limit) {
      this.held += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.waiters.push(() => {
        this.held += 1;
        resolve();
      });
    });
  }

  release(): void {
    if (this.held > 0) this.held -= 1;
    const next = this.waiters.shift();
    if (next) next();
  }
}

function concurrencyLimit(config: WorkerConfig, agent: AgentKind): number {
  const raw = config.maxConcurrent[agent];
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 1) return 1;
  return Math.floor(raw);
}

function timeoutMsOf(config: WorkerConfig): number {
  const value = config.timeoutMs;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  return DEFAULT_TIMEOUT_MS;
}

function summaryLine(text: string): string {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length > 0) return trimmed.slice(0, SUMMARY_CAP);
  }
  return "";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Inherited env minus every key whose uppercased name starts with LOOM_ or
 * FABLE_ (`loom_secret` and `Fable_Token` included), then LOOM_CARD only.
 */
function scrubWorkerEnv(cardId: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value !== "string") continue;
    const upper = key.toUpperCase();
    if (upper.startsWith("LOOM_") || upper.startsWith("FABLE_")) continue;
    env[key] = value;
  }
  env.LOOM_CARD = cardId;
  return env;
}

function isPathInside(root: string, target: string): boolean {
  if (target === root) return true;
  const prefix = root.endsWith(sep) ? root : `${root}${sep}`;
  return target.startsWith(prefix);
}

function mkdir0700(dir: string): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
}

function resolveWorkerCwd(
  cardCwd: string | undefined,
  config: WorkerConfig,
): { ok: true; cwd: string } | { ok: false } {
  const requested = cardCwd && cardCwd.length > 0 ? cardCwd : config.cwd;
  if (!requested || !isAbsolute(requested)) return { ok: false };
  let realCwd: string;
  try {
    if (!statSync(requested).isDirectory()) return { ok: false };
    realCwd = realpathSync(requested);
  } catch {
    return { ok: false };
  }
  // Missing allowedRoots is an empty allowlist, not a throw.
  const roots = Array.isArray(config.allowedRoots) ? config.allowedRoots : [];
  for (const root of roots) {
    if (typeof root !== "string" || !root || !isAbsolute(root)) continue;
    let realRoot: string;
    try {
      realRoot = realpathSync(root);
    } catch {
      continue;
    }
    if (isPathInside(realRoot, realCwd)) return { ok: true, cwd: realCwd };
  }
  return { ok: false };
}

function sameCwd(recorded: string, current: string): boolean {
  if (recorded === current) return true;
  try {
    return realpathSync(recorded) === realpathSync(current);
  } catch {
    return false;
  }
}

function readTranscript(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

async function readStableTranscript(path: string): Promise<string> {
  let last = readTranscript(path);
  for (let i = 0; i < 6; i++) {
    await sleep(20);
    const next = readTranscript(path);
    if (next.length > 0 && next === last) return next;
    last = next;
  }
  return last;
}

function truncationNote(
  truncated: boolean,
  transcriptPath: string,
  fullText: string,
): string | undefined {
  if (!truncated) return undefined;
  const bytes = Buffer.byteLength(fullText);
  return `transcript ${transcriptPath} (${bytes} bytes)`.slice(0, 500);
}

/** UK-4. `ps -o lstart=` trimmed. null when the pid is gone. */
function processLstart(pid: number): string | null {
  if (!Number.isInteger(pid) || pid <= 1) return null;
  try {
    const out = execFileSync("/bin/ps", ["-o", "lstart=", "-p", String(pid)], {
      encoding: "utf8",
      timeout: 2_000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const text = out.trim();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

function pidAlive(pid: number, procStartedAt: string): boolean {
  const recorded = procStartedAt.trim();
  if (!recorded) return false;
  const live = processLstart(pid);
  return live !== null && live === recorded;
}

async function captureLstart(pid: number, child: ChildProcess): Promise<string> {
  for (let i = 0; i < 25; i++) {
    const live = processLstart(pid);
    if (live) return live;
    if (child.exitCode !== null || child.signalCode !== null) return "";
    await sleep(20);
  }
  return "";
}

/**
 * Claude init/assistant events carry a session id before the result, so a
 * session id alone is not completion. A result event and codex
 * turn.completed both record usage. Codex resume may omit thread.started.
 * Grok finishes on the end event (session id).
 */
function streamFinished(agent: AgentKind, parsed: ParsedAgentStream): boolean {
  if (agent === "grok") return parsed.sessionId !== null;
  return parsed.usage != null;
}

function currentFingerprint(config: WorkerConfig): string {
  return promptFingerprint(HEADLESS_WORKER_HINT, config.permissions, ARGV_TEMPLATE_VERSION);
}

function decideLaunch(
  record: CardSessionRecord | null,
  cwd: string,
  fingerprint: string,
  alive: boolean,
  handoffId: string,
): LaunchMode {
  if (!record || record.resultSent) return "fresh";
  if (record.state === "running" && alive) {
    return record.dispatchHandoffId === handoffId ? "adopt" : "busy";
  }
  if (!sameCwd(record.cwd, cwd)) return "cwd_mismatch";
  if (record.promptFingerprint !== fingerprint) return "fresh";
  if (record.attempts < MAX_ATTEMPTS && record.sessionId.length > 0) return "resume";
  return "give_up";
}

function createOwner(handoffId: string): CardOwner {
  let resolveDone: () => void = () => {};
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });
  let resolveAbandon: () => void = () => {};
  const abandonedPromise = new Promise<void>((resolve) => {
    resolveAbandon = resolve;
  });
  const owner: CardOwner = {
    handoffId,
    done,
    resolve: resolveDone,
    abandoned: false,
    abandon() {
      if (owner.abandoned) return;
      owner.abandoned = true;
      resolveAbandon();
    },
    abandonedPromise,
  };
  return owner;
}

function waitChild(child: ChildProcess): Promise<number | null> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(child.exitCode);
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    child.once("error", (err: Error) => {
      if (settled) return;
      settled = true;
      reject(err);
    });
    child.once("exit", (code) => {
      if (settled) return;
      settled = true;
      resolve(code);
    });
  });
}

function detachChild(child: ChildProcess): void {
  try {
    child.unref();
  } catch {
    /* already exited */
  }
}

function isAgent(value: string): value is AgentKind {
  return value === "claude" || value === "codex" || value === "grok";
}

export class HeadlessDispatcher {
  private readonly active: HeadlessFlight[] = [];
  private readonly lanes: Record<AgentKind, Semaphore>;
  private readonly byCard = new Map<string, CardOwner>();

  constructor(private readonly deps: HeadlessDeps) {
    validateWorkerConfig(deps.config);
    this.lanes = {
      claude: new Semaphore(concurrencyLimit(deps.config, "claude")),
      codex: new Semaphore(concurrencyLimit(deps.config, "codex")),
      grok: new Semaphore(concurrencyLimit(deps.config, "grok")),
    };
  }

  flights(): HeadlessFlight[] {
    return this.active.map((flight) => ({ ...flight }));
  }

  /** Counts only. Card ids never appear here. */
  status(): {
    running: Record<AgentKind, number>;
    queueDepth: Record<AgentKind, number>;
  } {
    const running = {} as Record<AgentKind, number>;
    const queueDepth = {} as Record<AgentKind, number>;
    for (const agent of AGENTS) {
      running[agent] = this.lanes[agent].running;
      queueDepth[agent] = this.lanes[agent].depth;
    }
    return { running, queueDepth };
  }

  /**
   * Startup hook (D6). Scans session records with state running and
   * resultSent false, then adopts, resumes, or gives up. Does not kill
   * a live worker. Not invoked from the constructor — bridge startup calls it.
   */
  async recover(): Promise<void> {
    const pending: Promise<void>[] = [];
    for (const record of listCardSessions(this.deps.loomDir)) {
      if (record.state !== "running" || record.resultSent) continue;
      if (!isAgent(record.agent)) continue;
      pending.push(
        this.dispatch({
          roomId: record.roomId,
          cardId: record.cardId,
          agent: record.agent,
          prompt: "",
          fromPeerId: record.fromPeerId,
          dispatchHandoffId: record.dispatchHandoffId,
          cwd: record.cwd,
        }),
      );
    }
    await Promise.all(pending);
  }

  /** Does not kill workers. In-flight runs relinquish the result to a later adopt. */
  async close(): Promise<void> {
    const pending = [...this.byCard.values()];
    for (const owner of pending) owner.abandon();
    await Promise.allSettled(pending.map((owner) => owner.done));
  }

  async dispatch(card: HeadlessDispatchCard): Promise<void> {
    const resolved = resolveWorkerCwd(card.cwd, this.deps.config);
    if (!resolved.ok) {
      await this.deliver(card, new Date().toISOString(), this.cwdDeniedFields());
      return;
    }
    const key = cardKeyHash(card.roomId, card.agent, card.cardId);
    const existing = this.byCard.get(key);
    if (existing) {
      if (existing.handoffId !== card.dispatchHandoffId) {
        await this.deliver(card, new Date().toISOString(), this.alreadyRunningFields());
        return;
      }
      await existing.done;
      return;
    }
    const owner = createOwner(card.dispatchHandoffId);
    this.byCard.set(key, owner);
    try {
      await this.lead(card, owner);
    } finally {
      if (this.byCard.get(key) === owner) this.byCard.delete(key);
      owner.resolve();
    }
  }

  private cwdDeniedFields(): HeadlessResultFields {
    return {
      status: "failed",
      reason: "cwd_not_allowed",
      output: "",
      truncated: false,
      summary: "",
      note: "cwd realpath is outside worker.allowedRoots",
    };
  }

  private alreadyRunningFields(): HeadlessResultFields {
    return {
      status: "failed",
      reason: "card_already_running",
      output: "",
      truncated: false,
      summary: "",
      note: "card already running",
    };
  }

  private async deliver(
    card: HeadlessDispatchCard,
    startedAt: string,
    fields: HeadlessResultFields,
  ): Promise<void> {
    await this.deps.sink.composeAndSend(
      {
        cardId: card.cardId,
        fromPeerId: card.fromPeerId,
        dispatchHandoffId: card.dispatchHandoffId,
        startedAt,
      },
      fields,
      { node: this.deps.node },
    );
  }

  /** resultSent flips true only after composeAndSend resolves. */
  private async sendAndMark(
    card: HeadlessDispatchCard,
    record: CardSessionRecord,
    startedAt: string,
    fields: HeadlessResultFields,
  ): Promise<void> {
    record.state = "exited";
    record.resultSent = false;
    writeCardSession({ loomDir: this.deps.loomDir }, record);
    await this.deliver(card, startedAt, fields);
    record.resultSent = true;
    writeCardSession({ loomDir: this.deps.loomDir }, record);
  }

  private async lead(card: HeadlessDispatchCard, owner: CardOwner): Promise<void> {
    const lane = this.lanes[card.agent];
    await lane.acquire();
    try {
      if (owner.abandoned) return;
      // Again after the semaphore wait: the path checked before the wait
      // may have been replaced while this card was queued.
      const fresh = resolveWorkerCwd(card.cwd, this.deps.config);
      if (!fresh.ok) {
        await this.deliver(card, new Date().toISOString(), this.cwdDeniedFields());
        return;
      }
      const cwd = fresh.cwd;
      const fingerprint = currentFingerprint(this.deps.config);
      const existing = readCardSession({
        loomDir: this.deps.loomDir,
        roomId: card.roomId,
        agent: card.agent,
        cardId: card.cardId,
      });
      const alive = existing
        ? pidAlive(existing.pid, existing.procStartedAt)
        : false;
      const mode = decideLaunch(
        existing,
        cwd,
        fingerprint,
        alive,
        card.dispatchHandoffId,
      );
      if (mode === "busy") {
        await this.deliver(card, new Date().toISOString(), this.alreadyRunningFields());
        return;
      }
      if (mode === "cwd_mismatch" && existing) {
        await this.sendAndMark(card, existing, existing.startedAt, {
          status: "failed",
          reason: "needs_verification",
          output: `recorded cwd ${existing.cwd} does not match worker cwd ${cwd}`,
          truncated: false,
          summary: "cwd mismatch",
          note: "recorded cwd mismatch; not resuming",
        });
        return;
      }
      if (mode === "give_up" && existing) {
        await this.sendGiveUp(card, existing);
        return;
      }
      if (owner.abandoned) return;

      let plan: SpawnPlan;
      if (mode === "adopt" && existing) {
        const watched = await this.watchAdopted(card, existing, owner);
        if (watched.kind === "abandon" || owner.abandoned) return;
        const parsed = parseAgentStream(card.agent, watched.raw);
        if (parsed.sessionId) existing.sessionId = parsed.sessionId;
        const finished = streamFinished(card.agent, parsed);
        if (watched.timedOut || finished || existing.attempts >= MAX_ATTEMPTS) {
          await this.sendParsed(card, existing, existing.startedAt, {
            timedOut: watched.timedOut,
            parsed,
            raw: watched.raw,
            transcriptPath: this.transcriptPath(card, existing.attempts),
          });
          return;
        }
        plan = {
          sessionId: existing.sessionId,
          attempts: existing.attempts + 1,
          resumeSessionId: existing.sessionId,
          startedAt: existing.startedAt,
        };
      } else if (mode === "resume" && existing) {
        plan = {
          sessionId: existing.sessionId,
          attempts: existing.attempts + 1,
          resumeSessionId: existing.sessionId,
          startedAt: existing.startedAt,
        };
      } else {
        plan = {
          sessionId: randomUUID(),
          attempts: 1,
          startedAt: new Date().toISOString(),
        };
      }

      for (;;) {
        const outcome = await this.spawnOnce(card, owner, plan);
        if (outcome.kind === "abandon") return;
        if (outcome.kind === "spawn_error") {
          await this.deliver(card, plan.startedAt, {
            status: "failed",
            reason: "needs_verification",
            output: "",
            truncated: false,
            summary: "",
            note: outcome.message.slice(0, 500),
          });
          return;
        }
        if (outcome.kind === "cwd_denied") {
          await this.deliver(card, plan.startedAt, this.cwdDeniedFields());
          return;
        }
        if (outcome.kind === "setup_failed") {
          await this.deliver(card, plan.startedAt, {
            status: "failed",
            reason: "spawn_setup_failed",
            output: "",
            truncated: false,
            summary: "",
            note: outcome.message.slice(0, 500),
          });
          return;
        }
        if (owner.abandoned) return;
        plan.sessionId = outcome.sessionId;
        if (outcome.timedOut || outcome.finished || plan.attempts >= MAX_ATTEMPTS) {
          await this.sendParsed(card, outcome.record, plan.startedAt, outcome);
          return;
        }
        plan.attempts += 1;
        plan.resumeSessionId = outcome.sessionId;
      }
    } finally {
      lane.release();
    }
  }

  private async sendGiveUp(
    card: HeadlessDispatchCard,
    record: CardSessionRecord,
  ): Promise<void> {
    const transcriptPath = this.transcriptPath(card, record.attempts);
    const raw = readTranscript(transcriptPath);
    const parsed = parseAgentStream(card.agent, raw);
    if (parsed.sessionId) record.sessionId = parsed.sessionId;
    const fullText = parsed.finalText.length > 0 ? parsed.finalText : raw;
    const capped = truncateTail(fullText, OUTPUT_CAP);
    const truncated = truncationNote(capped.truncated, transcriptPath, fullText);
    const attemptsNote = `attempts ${record.attempts} exhausted; not resuming`;
    await this.sendAndMark(card, record, record.startedAt, {
      status: "failed",
      reason: "needs_verification",
      output: capped.text,
      truncated: capped.truncated,
      summary: summaryLine(capped.text),
      note: truncated ? `${attemptsNote}; ${truncated}`.slice(0, 500) : attemptsNote,
    });
  }

  private async sendParsed(
    card: HeadlessDispatchCard,
    record: CardSessionRecord,
    startedAt: string,
    outcome: {
      timedOut: boolean;
      parsed: ParsedAgentStream;
      raw: string;
      transcriptPath: string;
    },
  ): Promise<void> {
    if (outcome.parsed.sessionId) record.sessionId = outcome.parsed.sessionId;
    // Timeout keeps the whole partial transcript. Parsed finalText alone
    // drops the remainder once any text has been parsed.
    const fullText = outcome.timedOut ? outcome.raw : outcome.parsed.finalText;
    const summary = summaryLine(fullText);
    const capped = truncateTail(fullText, OUTPUT_CAP);
    const note = truncationNote(capped.truncated, outcome.transcriptPath, fullText);
    await this.sendAndMark(card, record, startedAt, {
      status: "failed",
      reason: outcome.timedOut ? "timeout" : "needs_verification",
      output: capped.text,
      truncated: capped.truncated,
      summary,
      ...(note ? { note } : {}),
    });
  }

  private cardDir(card: HeadlessDispatchCard): string {
    return join(
      this.deps.loomDir,
      "cards",
      cardKeyHash(card.roomId, card.agent, card.cardId),
    );
  }

  private transcriptPath(card: HeadlessDispatchCard, attempts: number): string {
    return join(this.cardDir(card), `transcript-${attempts}.jsonl`);
  }

  /** Poll the recorded pid. Mismatched lstart is death — do not kill that pid. */
  private async watchAdopted(
    card: HeadlessDispatchCard,
    record: CardSessionRecord,
    owner: CardOwner,
  ): Promise<{ kind: "abandon" } | { kind: "exited"; timedOut: boolean; raw: string }> {
    const flight: HeadlessFlight = {
      workerId: record.sessionId,
      cardId: card.cardId,
      agent: card.agent,
      pid: record.pid,
      pgid: record.pgid,
    };
    this.active.push(flight);
    try {
      const timeoutMs = timeoutMsOf(this.deps.config);
      const startedMs = Date.parse(record.startedAt);
      const deadline = Number.isFinite(startedMs) ? startedMs + timeoutMs : Date.now() + timeoutMs;
      let timedOut = false;
      while (!owner.abandoned) {
        if (Date.now() >= deadline) {
          timedOut = true;
          // Only start the kill when the recorded leader is still that
          // process. Once SIGTERM is sent, reap the group even if the
          // leader exits and a grandchild ignores SIGTERM.
          if (pidAlive(record.pid, record.procStartedAt)) {
            this.signalTracked(flight, "SIGTERM");
            await this.reapGroup(record.pgid, flight, owner, Date.now());
          }
          break;
        }
        if (!pidAlive(record.pid, record.procStartedAt)) break;
        await sleep(50);
      }
      if (owner.abandoned) return { kind: "abandon" };
      const raw = await readStableTranscript(this.transcriptPath(card, record.attempts));
      return { kind: "exited", timedOut, raw };
    } finally {
      const index = this.active.indexOf(flight);
      if (index >= 0) this.active.splice(index, 1);
    }
  }

  /** Signal only while this flight is tracked and the group probe succeeds. */
  private signalTracked(flight: HeadlessFlight, signal: "SIGTERM" | "SIGKILL"): void {
    const pgid = flight.pgid ?? 0;
    if (!this.active.includes(flight)) return;
    if (!processGroupAlive(pgid)) return;
    killProcessGroup(pgid, signal);
  }

  /**
   * After SIGTERM, wait out the grace period even if the leader has exited.
   * SIGKILL follows when the group is still there. The permit stays held
   * until this returns (the caller releases it afterwards).
   */
  private async reapGroup(
    pgid: number,
    flight: HeadlessFlight,
    owner: CardOwner,
    sigtermAt: number,
  ): Promise<void> {
    const killAt = sigtermAt + GROUP_KILL_GRACE_MS;
    while (Date.now() < killAt && !owner.abandoned && processGroupAlive(pgid)) {
      await sleep(50);
    }
    if (!owner.abandoned && this.active.includes(flight) && processGroupAlive(pgid)) {
      killProcessGroup(pgid, "SIGKILL");
      const giveUp = Date.now() + 1_000;
      while (Date.now() < giveUp && processGroupAlive(pgid)) await sleep(30);
    }
  }

  private async spawnOnce(
    card: HeadlessDispatchCard,
    owner: CardOwner,
    plan: SpawnPlan,
  ): Promise<SpawnOutcome> {
    let spawned: SpawnedWorker | undefined;
    let flight: HeadlessFlight | undefined;
    let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    let disarmed = false;
    let sigtermAt = 0;
    const disarmTimeout = (): void => {
      disarmed = true;
      if (timeoutTimer) clearTimeout(timeoutTimer);
      timeoutTimer = undefined;
    };
    try {
      const dir = this.cardDir(card);
      mkdir0700(dir);
      const transcriptPath = join(dir, `transcript-${plan.attempts}.jsonl`);
      const stderrPath = join(dir, `transcript-${plan.attempts}.stderr`);
      const wrapped = wrapDispatchedPrompt(card.prompt);
      const promptBody = plan.resumeSessionId
        ? `${RESUME_CONTINUATION_MESSAGE}\n\n${wrapped}`
        : wrapped;
      const promptFile = this.writeGrokPrompt(card.agent, dir, promptBody);
      // Re-checked after the permit wait, immediately before spawn.
      // Residual TOCTOU: the directory can still be replaced by a symlink
      // between this realpath and the child's execve. Closing that window
      // needs an fd-relative chdir; spawn's cwd is only a path string.
      const checked = resolveWorkerCwd(card.cwd, this.deps.config);
      if (!checked.ok) return { kind: "cwd_denied" };
      const cwd = checked.cwd;
      const built = buildAgentArgv({
        agent: card.agent,
        cwd,
        sessionId: plan.sessionId,
        resumeSessionId: plan.resumeSessionId,
        hint: HEADLESS_WORKER_HINT,
        prompt: card.prompt,
        promptFile,
        permissions: this.deps.config.permissions,
      });
      const command = this.deps.commands[card.agent];
      spawned = spawnDetachedWorker({
        bin: command.bin,
        args: [...command.args, ...built.argv],
        cwd,
        env: scrubWorkerEnv(card.cardId),
        stdoutPath: transcriptPath,
        stderrPath: stderrPath,
      });
      const child = spawned.child;
      const leaderGone = (): boolean => child.exitCode !== null || child.signalCode !== null;
      // Normal exit disarms the timeout synchronously, before any await,
      // so a recycled pgid is not signaled during result delivery.
      const onLeaderExit = (): void => {
        if (!timedOut) disarmTimeout();
      };
      if (leaderGone()) onLeaderExit();
      else child.once("exit", onLeaderExit);

      const exitPromise = waitChild(child);
      exitPromise.catch(() => {
        /* abandon can leave this pending until the child exits */
      });

      const tracked: HeadlessFlight = {
        workerId: plan.sessionId,
        cardId: card.cardId,
        agent: card.agent,
        pid: spawned.pid,
        pgid: spawned.pgid,
      };
      flight = tracked;
      this.active.push(tracked);

      const stdin = child.stdin;
      if (stdin) {
        stdin.on("error", () => {
          /* child exited before stdin finished */
        });
        const payload =
          built.promptTransport === "stdin"
            ? built.continuationMessage
              ? `${built.continuationMessage}\n\n${wrapped}`
              : wrapped
            : "";
        try {
          stdin.end(payload);
        } catch (err) {
          // A leader that has already exited closes the pipe. A live leader
          // whose stdin write throws is a setup failure: the catch kills it.
          if (!leaderGone()) throw err;
        }
      }

      let markTimedOut: () => void = () => {};
      const timedOutPromise = new Promise<void>((resolve) => {
        markTimedOut = resolve;
      });
      if (!disarmed && !leaderGone()) {
        timeoutTimer = setTimeout(() => {
          if (disarmed || owner.abandoned || !this.active.includes(tracked)) return;
          if (!processGroupAlive(tracked.pgid ?? 0)) return;
          timedOut = true;
          sigtermAt = Date.now();
          this.signalTracked(tracked, "SIGTERM");
          markTimedOut();
        }, timeoutMsOf(this.deps.config));
      }

      const procStartedAt = await captureLstart(spawned.pid, child);
      // Let a queued exit event disarm the timeout before the running
      // record is persisted. One turn; not a grace period.
      await sleep(0);
      const record: CardSessionRecord = {
        agent: card.agent,
        cwd,
        sessionId: plan.sessionId,
        promptFingerprint: currentFingerprint(this.deps.config),
        attempts: plan.attempts,
        pid: spawned.pid,
        pgid: spawned.pgid,
        startedAt: plan.startedAt,
        state: "running",
        resultSent: false,
        roomId: card.roomId,
        cardId: card.cardId,
        fromPeerId: card.fromPeerId,
        dispatchHandoffId: card.dispatchHandoffId,
        procStartedAt,
      };
      writeCardSession({ loomDir: this.deps.loomDir }, record);

      if (owner.abandoned) {
        detachChild(child);
        return { kind: "abandon" };
      }
      const winner = await Promise.race([
        exitPromise.then(
          (code) => ({ kind: "exit" as const, code }),
          () => ({ kind: "exit" as const, code: null as number | null }),
        ),
        owner.abandonedPromise.then(() => ({ kind: "abandon" as const })),
        timedOutPromise.then(() => ({ kind: "timeout" as const })),
      ]);
      if (winner.kind === "abandon" || owner.abandoned) {
        detachChild(child);
        return { kind: "abandon" };
      }
      if (timedOut) {
        await this.reapGroup(tracked.pgid ?? 0, tracked, owner, sigtermAt || Date.now());
      }
      if (owner.abandoned) {
        detachChild(child);
        return { kind: "abandon" };
      }
      if (!leaderGone()) {
        await Promise.race([
          exitPromise.then(
            () => undefined,
            () => undefined,
          ),
          sleep(1_000),
        ]);
      }
      const raw = readTranscript(transcriptPath);
      const parsed = parseAgentStream(card.agent, raw);
      const sessionId = parsed.sessionId ?? plan.sessionId;
      record.sessionId = sessionId;
      writeCardSession({ loomDir: this.deps.loomDir }, record);
      return {
        kind: "done",
        timedOut,
        finished: streamFinished(card.agent, parsed),
        parsed,
        raw,
        transcriptPath,
        record,
        sessionId,
      };
    } catch (err) {
      if (spawned && processGroupAlive(spawned.pgid)) {
        killProcessGroup(spawned.pgid, "SIGKILL");
      }
      const message = err instanceof Error ? err.message : String(err);
      return { kind: "setup_failed", message };
    } finally {
      disarmTimeout();
      if (flight) {
        const index = this.active.indexOf(flight);
        if (index >= 0) this.active.splice(index, 1);
      }
    }
  }

  private writeGrokPrompt(agent: AgentKind, dir: string, wrapped: string): string | undefined {
    if (agent !== "grok") return undefined;
    const promptFile = join(dir, "prompt.txt");
    writeFileSync(promptFile, wrapped, { encoding: "utf8", mode: 0o600 });
    chmodSync(promptFile, 0o600);
    return promptFile;
  }
}
