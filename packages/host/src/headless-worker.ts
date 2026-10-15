/**
 * PLAN 0.30.0 P5 HeadlessDispatcher.
 * D2, D4–D9, D11, R5, R6, R48-H1/L1/M3, UK-4.
 * Resume and adopt read the durable session record. A live pid whose
 * `ps -o lstart=` matches `procStartedAt` is adopted — never spawned beside.
 * `resultSent=true` is written only after composeAndSend returns.
 */
import { execFile, execFileSync, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { realpathSync, statSync } from "node:fs";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, sep } from "node:path";
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
  cardSessionPath,
  listCardSessions,
  readCardSessionAsync,
  writeCardSessionAsync,
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
const MAX_UNKNOWN_PROBES = 5;

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
  timedOut?: boolean;
};

type HeadlessCommand = { bin: string; args: string[] };

type ResultTarget = {
  roomId: string;
  cardId: string;
  fromPeerId: string;
  dispatchHandoffId: string;
  startedAt: string;
  paneId?: string;
};

type HeadlessDeps = {
  config: WorkerConfig;
  loomDir: string;
  localPeerId: string;
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

type CardOwner = {
  handoffId: string;
  done: Promise<void>;
  resolve: () => void;
  abandoned: boolean;
  abandon: () => void;
  abandonedPromise: Promise<void>;
};

type SpawnPlan = {
  cwd: string;
  completedHandoffIds: string[];
  sessionId: string;
  attempts: number;
  resumeSessionId?: string;
  startedAt: string;
};

type SpawnOutcome =
  | { kind: "abandon" }
  | { kind: "setup_failed"; message: string; record?: CardSessionRecord }
  | { kind: "cwd_denied"; changed?: boolean; record?: CardSessionRecord }
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

async function mkdir0700(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700);
}

function resolveWorkerCwd(
  cardCwd: string | undefined,
  config: WorkerConfig,
): { ok: true; cwd: string } | { ok: false } {
  const requested = cardCwd ?? config.cwd;
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

async function readTranscript(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

const STDERR_LINE_CAP = 300;

/** Last non-empty stderr line: controls stripped, trimmed, capped. */
function lastStderrLine(raw: string): string {
  const lines = raw.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const cleaned = lines[i]!.replace(/\p{Cc}/gu, "").trim();
    if (cleaned.length > 0) return cleaned.slice(0, STDERR_LINE_CAP);
  }
  return "";
}

async function readStableTranscript(path: string): Promise<string> {
  let last = await readTranscript(path);
  for (let i = 0; i < 6; i++) {
    await sleep(20);
    const next = await readTranscript(path);
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

/** A failed ps observation is unknown, never proof of death. */
function processLstart(pid: number): string | null {
  if (!Number.isInteger(pid) || pid <= 1) return null;
  try {
    const out = execFileSync("/bin/ps", ["-o", "lstart=", "-p", String(pid)], {
      encoding: "utf8",
      timeout: 2_000,
      stdio: ["ignore", "pipe", "ignore"],
      env: { ...process.env, LC_ALL: "C", LANG: "C", TZ: "UTC" },
    });
    const text = out.trim();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

type Liveness = "alive" | "dead" | "unknown";

function processLiveness(record: CardSessionRecord): Liveness {
  // Never probe pid 0/1, and terminal records do not identify live workers.
  if (record.state === "exited" || !(record.pid > 1)) return "dead";
  try {
    process.kill(record.pid, 0);
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "ESRCH" ? "dead" : "unknown";
  }
  const live = processLstart(record.pid);
  const normalize = (value: string): number | null => {
    const text = value.trim().replace(/\s+/g, " ");
    const parts = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2}) (\d{2}):(\d{2}):(\d{2}) (\d{4})$/.exec(text);
    if (!parts) return null;
    const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(parts[1]!);
    const day = Number(parts[2]), hour = Number(parts[3]), minute = Number(parts[4]);
    const second = Number(parts[5]), year = Number(parts[6]);
    const date = new Date(Date.UTC(year, month, day, hour, minute, second));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day ||
      date.getUTCHours() !== hour || date.getUTCMinutes() !== minute || date.getUTCSeconds() !== second) return null;
    return date.getTime();
  };
  const expected = normalize(record.procStartedAt);
  const observed = live ? normalize(live) : null;
  if (expected === null || observed === null) return "unknown";
  return expected === observed ? "alive" : "dead";
}

async function captureLstart(pid: number, child: ChildProcess): Promise<string> {
  for (let i = 0; i < 25; i++) {
    // Startup observation may wait on ps without blocking dispatch/status work.
    // The pid/pgid have already been synchronously committed by the caller.
    const started = await new Promise<string | null>((resolve) => {
      execFile("/bin/ps", ["-o", "lstart=", "-p", String(pid)], {
        encoding: "utf8", timeout: 2_000,
        env: { ...process.env, LC_ALL: "C", LANG: "C", TZ: "UTC" },
      }, (err, stdout) => resolve(err ? null : stdout.trim() || null));
    });
    if (started) return started;
    if (child.exitCode !== null || child.signalCode !== null) break;
    await sleep(20);
  }
  return "";
}

/** Terminal event presence is independent of usage and session metadata.
 * Scan complete JSON values, tolerating the raw C0 controls the CLI emits.
 * Keep this local because the shared parser's public result has no event flag.
 */
function streamFinished(agent: AgentKind, raw: string): boolean {
  const terminal = agent === "claude" ? "result" : agent === "codex" ? "turn.completed" : "end";
  for (let i = 0; i < raw.length; i++) {
    if (/\s/.test(raw[i]!)) continue;
    if (raw[i] !== "{" && raw[i] !== "[") {
      while (i < raw.length && raw[i] !== "\n") i++;
      continue;
    }
    let depth = 0;
    let inString = false;
    let escaped = false;
    let json = "";
    let end = i;
    for (; end < raw.length; end++) {
      const ch = raw[end]!;
      if (inString && !escaped && ch.charCodeAt(0) <= 0x1f) {
        json += `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`;
        continue;
      }
      json += ch;
      if (escaped) { escaped = false; continue; }
      if (inString && ch === "\\") { escaped = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === "{" || ch === "[") depth++;
      if (ch === "}" || ch === "]") depth--;
      if (depth === 0) break;
    }
    if (depth !== 0) break;
    try {
      const event = JSON.parse(json);
      if (event?.type === terminal) return true;
    } catch { /* non-JSON noise is not completion */ }
    i = end;
  }
  return false;
}

function currentFingerprint(config: WorkerConfig): string {
  return promptFingerprint(HEADLESS_WORKER_HINT, config.permissions, ARGV_TEMPLATE_VERSION);
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
    if (!deps.localPeerId) throw new Error("localPeerId is required");
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

  /** In-flight (b). Cleared when that wave settles so a later recover() can scan again. */
  private recoveryInFlight: Promise<void> | null = null;

  /**
   * (a) Scan unfinished records and register byCard ownership. Each
   * dispatchOwned call registers the owner before its first await, and that
   * call decides adopt / resume / give-up. (b) Monitoring and result delivery
   * stay on the returned promise.
   */
  private ensureRecovery(): Promise<void> {
    if (this.recoveryInFlight) return this.recoveryInFlight;
    const pending: Promise<void>[] = [];
    for (const record of listCardSessions(this.deps.loomDir, this.deps.localPeerId)) {
      if (record.resultSent) continue;
      if (!isAgent(record.agent)) continue;
      pending.push(
        this.dispatchOwned({
          roomId: record.roomId,
          cardId: record.cardId,
          agent: record.agent,
          prompt: "",
          fromPeerId: record.fromPeerId,
          dispatchHandoffId: record.dispatchHandoffId,
          cwd: record.requestedCwd === null ? undefined : record.requestedCwd,
        }, true).catch((err: unknown) => {
          // One broken record or sink must not reject recovery of its peers.
          const message = err instanceof Error ? err.message : String(err);
          process.stderr.write(`[headless] recovery failed (${record.cardId}): ${message.replace(/[\r\n]/g, " ")}\n`);
        }),
      );
    }
    const done = Promise.all(pending).then(() => undefined);
    this.recoveryInFlight = done;
    void done.finally(() => {
      if (this.recoveryInFlight === done) this.recoveryInFlight = null;
    });
    return done;
  }

  /**
   * Startup hook (D6), registration only. Ownership is visible to a later
   * inbox drain before this resolves. Does not wait for a live worker.
   * close() still abandons that monitoring without signalling the worker.
   */
  async registerRecovery(): Promise<void> {
    void this.ensureRecovery();
  }

  /** registerRecovery plus awaiting monitoring and result delivery. */
  async recover(): Promise<void> {
    await this.ensureRecovery();
  }

  /** Does not kill workers. In-flight runs relinquish the result to a later adopt. */
  async close(): Promise<void> {
    const pending = [...this.byCard.values()];
    for (const owner of pending) owner.abandon();
    await Promise.allSettled(pending.map((owner) => owner.done));
  }

  async dispatch(card: HeadlessDispatchCard): Promise<void> {
    return this.dispatchOwned(card, false);
  }

  private async dispatchOwned(card: HeadlessDispatchCard, recovering: boolean): Promise<void> {
    const key = cardKeyHash(card.roomId, card.agent, card.cardId);
    const existing = this.byCard.get(key);
    if (existing) {
      if (existing.handoffId !== card.dispatchHandoffId) {
        // The completed-history decision precedes even the in-memory busy path.
        const saved = await readCardSessionAsync({ loomDir: this.deps.loomDir,
          localPeerId: this.deps.localPeerId, ...card });
        if (saved?.completedHandoffIds.includes(card.dispatchHandoffId)) return;
        await this.deliver(card, new Date().toISOString(), this.alreadyRunningFields());
        return;
      }
      await existing.done;
      return;
    }
    const owner = createOwner(card.dispatchHandoffId);
    this.byCard.set(key, owner);
    try {
      await this.lead(card, owner, recovering);
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
        roomId: card.roomId,
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
    record: CardSessionRecord,
    fields: HeadlessResultFields,
    opts: { allowPersistenceFailure?: boolean; preserveWorkerState?: boolean } = {},
  ): Promise<void> {
    // Reporting a refusal/uncertainty is not proof of exit. Retain a possibly
    // live identity so a later dispatch still gets the R48-M3 guard.
    if (!opts.preserveWorkerState) record.state = "exited";
    record.pendingResult ??= { ...structuredClone(fields), timedOut: fields.timedOut ?? false };
    record.resultSent = false;
    record.sendAttempts += 1;
    const persist = async (): Promise<void> => {
      try {
        await writeCardSessionAsync({ loomDir: this.deps.loomDir, localPeerId: this.deps.localPeerId }, record);
      } catch (err) {
        if (!opts.allowPersistenceFailure) throw err;
        // Setup already killed the worker; still report the setup failure
        // when the same filesystem failure prevents marking its record.
      }
    };
    await persist();
    await this.deliver({ ...record, prompt: "" }, record.startedAt, structuredClone(record.pendingResult));
    record.resultSent = true;
    record.completedHandoffIds = [...record.completedHandoffIds.filter(id => id !== record.dispatchHandoffId),
      record.dispatchHandoffId].slice(-16);
    await persist();
  }

  /** The only resume gate, including after an adopted or local worker exits. */
  private async nextPlan(
    card: HeadlessDispatchCard,
    record: CardSessionRecord,
  ): Promise<SpawnPlan | null> {
    const current = resolveWorkerCwd(card.cwd, this.deps.config);
    // Compare the stored realpath literally: re-resolving it could conceal a
    // symlink replacement at the old path.
    if (!current.ok || record.cwd !== current.cwd) {
      await this.sendAndMark(record, {
        status: "failed",
        reason: "needs_verification",
        output: `recorded cwd ${record.cwd} does not match current worker cwd ${current.ok ? current.cwd : "(not allowed)"}`,
        truncated: false,
        summary: "cwd changed",
        note: "cwd_changed; needs_verification; not resuming",
      });
      return null;
    }
    if (record.attempts >= MAX_ATTEMPTS) {
      await this.sendGiveUp(record);
      return null;
    }
    const unchanged = record.promptFingerprint === currentFingerprint(this.deps.config);
    return {
      cwd: current.cwd,
      completedHandoffIds: record.completedHandoffIds,
      sessionId: unchanged ? record.sessionId : randomUUID(),
      attempts: record.attempts + 1,
      ...(unchanged ? { resumeSessionId: record.sessionId } : {}),
      startedAt: record.startedAt,
    };
  }

  private async lead(card: HeadlessDispatchCard, owner: CardOwner, recovering: boolean): Promise<void> {
    const lane = this.lanes[card.agent];
    await lane.acquire();
    try {
      if (owner.abandoned) return;
      const existing = await readCardSessionAsync({
        loomDir: this.deps.loomDir,
        localPeerId: this.deps.localPeerId,
        roomId: card.roomId,
        agent: card.agent,
        cardId: card.cardId,
      });
      let plan: SpawnPlan;
      let runCard = card;
      if (existing && (existing.completedHandoffIds.includes(card.dispatchHandoffId) ||
        (existing.resultSent && existing.dispatchHandoffId === card.dispatchHandoffId))) {
        process.stderr.write(`[headless] already_completed (${existing.cardId})\n`);
        return;
      }
      // These decisions precede every liveness probe: no pid cannot prove that
      // exec did not happen, and a reserved result must never be reconstructed.
      if (existing && !existing.resultSent && existing.pendingResult) {
        if (existing.sendAttempts < 2) await this.sendAndMark(existing, existing.pendingResult,
          { preserveWorkerState: existing.state !== "exited" });
        return;
      }
      if (existing?.state === "spawning" && !(existing.pid > 1)) {
        await this.sendAndMark(existing, {
          status: "failed", reason: "spawn_state_unknown", output: "", truncated: false,
          summary: "spawn state unknown",
          note: "bridge stopped before worker identity was saved; exec may have happened; not spawning",
        });
        return;
      }
      if (recovering && existing && existing.promptFingerprint !== currentFingerprint(this.deps.config)) {
        await this.sendAndMark(existing, {
          status: "failed", reason: "needs_verification", output: "", truncated: false,
          summary: "fingerprint changed", note: "fingerprint_changed; not resuming",
        }, { preserveWorkerState: processLiveness(existing) !== "dead" });
        return;
      }
      if (existing && (!existing.resultSent || processLiveness(existing) !== "dead")) {
        if (existing.dispatchHandoffId !== card.dispatchHandoffId && processLiveness(existing) !== "dead") {
          await this.deliver(card, new Date().toISOString(), this.alreadyRunningFields());
          return;
        }
        // Original dispatch identity owns every adopted/recovered result.
        runCard = { ...card, roomId: existing.roomId, cardId: existing.cardId,
          fromPeerId: existing.fromPeerId, dispatchHandoffId: existing.dispatchHandoffId };
        if (existing.state === "exited") {
          if (existing.sendAttempts >= 2) return;
          const path = this.transcriptPath(existing, existing.attempts);
          const raw = await readStableTranscript(path);
          await this.sendParsed(existing, { timedOut: false,
            parsed: parseAgentStream(existing.agent, raw), raw, transcriptPath: path });
          return;
        }
        let raw: string;
        if (processLiveness(existing) !== "dead") {
          const watched = await this.watchAdopted(existing, owner);
          if (watched.kind === "abandon" || owner.abandoned) return;
          if (watched.kind === "unknown") {
            await this.sendAndMark(existing, {
              status: "failed", reason: "liveness_unknown", output: "",
              truncated: false, summary: "liveness unknown",
              note: "could not establish worker identity; not spawning or signaling",
            }, { preserveWorkerState: true });
            return;
          }
          raw = watched.raw;
          if (watched.timedOut) {
            await this.sendParsed(existing, { timedOut: true,
              parsed: parseAgentStream(existing.agent, raw), raw,
              transcriptPath: this.transcriptPath(existing, existing.attempts) });
            return;
          }
        } else {
          raw = await readStableTranscript(this.transcriptPath(existing, existing.attempts));
        }
        const parsed = parseAgentStream(existing.agent, raw);
        if (parsed.sessionId) existing.sessionId = parsed.sessionId;
        // Always inspect the latest transcript before deciding to resume.
        if (streamFinished(existing.agent, raw)) {
          await this.sendParsed(existing, { timedOut: false, parsed, raw,
            transcriptPath: this.transcriptPath(existing, existing.attempts) });
          return;
        }
        const next = await this.nextPlan(runCard, existing);
        if (!next) return;
        plan = next;
      } else {
        const checked = resolveWorkerCwd(card.cwd, this.deps.config);
        if (!checked.ok) {
          await this.deliver(card, new Date().toISOString(), this.cwdDeniedFields());
          return;
        }
        plan = { cwd: checked.cwd, completedHandoffIds: existing?.completedHandoffIds ?? [],
          sessionId: randomUUID(), attempts: 1, startedAt: new Date().toISOString() };
      }

      for (;;) {
        if (owner.abandoned) return;
        const outcome = await this.spawnOnce(runCard, owner, plan);
        if (outcome.kind === "abandon") return;
        if (outcome.kind === "cwd_denied") {
          const fields = this.cwdDeniedFields();
          if (outcome.changed) fields.note = "cwd_changed_before_spawn";
          if (outcome.record) await this.sendAndMark(outcome.record, fields);
          else await this.deliver(runCard, plan.startedAt, fields);
          return;
        }
        if (outcome.kind === "setup_failed") {
          const fields: HeadlessResultFields = {
            status: "failed", reason: "spawn_setup_failed", output: "",
            truncated: false, summary: "", note: outcome.message.slice(0, 500),
          };
          if (outcome.record) await this.sendAndMark(outcome.record, fields, { allowPersistenceFailure: true });
          else await this.deliver(runCard, plan.startedAt, fields);
          return;
        }
        if (owner.abandoned) return;
        if (outcome.timedOut || outcome.finished) {
          await this.sendParsed(outcome.record, outcome);
          return;
        }
        const next = await this.nextPlan(runCard, outcome.record);
        if (!next) return;
        plan = next;
      }
    } finally {
      lane.release();
    }
  }

  private async sendGiveUp(
    record: CardSessionRecord,
  ): Promise<void> {
    const transcriptPath = this.transcriptPath(record, record.attempts);
    const raw = await readTranscript(transcriptPath);
    const parsed = parseAgentStream(record.agent, raw);
    if (parsed.sessionId) record.sessionId = parsed.sessionId;
    const fullText = parsed.finalText.length > 0 ? parsed.finalText : raw;
    const capped = truncateTail(fullText, OUTPUT_CAP);
    const truncated = truncationNote(capped.truncated, transcriptPath, fullText);
    const attemptsNote = `attempts ${record.attempts} exhausted; not resuming`;
    const stderrLine = lastStderrLine(
      await readTranscript(join(this.cardDir(record), `transcript-${record.attempts}.stderr`)),
    );
    const withStderr = stderrLine ? `${attemptsNote}; last stderr: ${stderrLine}` : attemptsNote;
    await this.sendAndMark(record, {
      status: "failed",
      reason: "needs_verification",
      output: capped.text,
      truncated: capped.truncated,
      summary: summaryLine(capped.text),
      note: truncated ? `${withStderr}; ${truncated}`.slice(0, 500) : withStderr,
    });
  }

  private async sendParsed(
    record: CardSessionRecord,
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
    await this.sendAndMark(record, {
      status: "failed",
      reason: outcome.timedOut ? "timeout" : "needs_verification",
      timedOut: outcome.timedOut,
      output: capped.text,
      truncated: capped.truncated,
      summary,
      ...(note ? { note } : {}),
    });
  }

  private cardDir(card: Pick<HeadlessDispatchCard, "roomId" | "agent" | "cardId">): string {
    return dirname(cardSessionPath({ loomDir: this.deps.loomDir, localPeerId: this.deps.localPeerId, ...card }));
  }

  private transcriptPath(card: Pick<HeadlessDispatchCard, "roomId" | "agent" | "cardId">, attempts: number): string {
    return join(this.cardDir(card), `transcript-${attempts}.jsonl`);
  }

  private async persistSessionId(record: CardSessionRecord, raw: string): Promise<void> {
    const sessionId = parseAgentStream(record.agent, raw).sessionId;
    if (sessionId && sessionId !== record.sessionId) {
      record.sessionId = sessionId;
      await writeCardSessionAsync({ loomDir: this.deps.loomDir, localPeerId: this.deps.localPeerId }, record);
    }
  }

  /** Poll identity, never equating a failed observation with death. */
  private async watchAdopted(
    record: CardSessionRecord,
    owner: CardOwner,
  ): Promise<{ kind: "abandon" } | { kind: "unknown" } | { kind: "exited"; timedOut: boolean; raw: string }> {
    const flight: HeadlessFlight = {
      workerId: record.sessionId,
      cardId: record.cardId,
      agent: record.agent,
      pid: record.pid,
      pgid: record.pgid,
    };
    this.active.push(flight);
    try {
      const timeoutMs = timeoutMsOf(this.deps.config);
      const startedMs = Date.parse(record.startedAt);
      const deadline = Number.isFinite(startedMs) ? startedMs + timeoutMs : Date.now() + timeoutMs;
      let timedOut = false;
      let unknownProbes = 0;
      while (!owner.abandoned) {
        const liveness = processLiveness(record);
        await this.persistSessionId(record, await readTranscript(this.transcriptPath(record, record.attempts)));
        if (liveness === "dead") break;
        if (liveness === "unknown") {
          if (++unknownProbes >= MAX_UNKNOWN_PROBES) return { kind: "unknown" };
          await sleep(50);
          continue;
        }
        if (Date.now() >= deadline) {
          timedOut = true;
          // Only start the kill when the recorded leader is still that
          // process. Once SIGTERM is sent, reap the group even if the
          // leader exits and a grandchild ignores SIGTERM.
          const confirmed = processLiveness(record);
          if (confirmed === "unknown") {
            if (++unknownProbes >= MAX_UNKNOWN_PROBES) return { kind: "unknown" };
            await sleep(50);
            continue;
          }
          if (confirmed === "alive") {
            this.signalTracked(flight, "SIGTERM");
            await this.reapGroup(record.pgid, flight, owner, Date.now());
          }
          break;
        }
        unknownProbes = 0;
        await sleep(50);
      }
      if (owner.abandoned) return { kind: "abandon" };
      const raw = await readStableTranscript(this.transcriptPath(record, record.attempts));
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
    let record: CardSessionRecord | undefined;
    let tailStopped = false;
    let stopTail = (): void => { tailStopped = true; };
    let tailPromise: Promise<void> | undefined;
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
      await mkdir0700(dir);
      const transcriptPath = join(dir, `transcript-${plan.attempts}.jsonl`);
      const stderrPath = join(dir, `transcript-${plan.attempts}.stderr`);
      const wrapped = wrapDispatchedPrompt(card.prompt);
      const promptBody = plan.resumeSessionId
        ? `${RESUME_CONTINUATION_MESSAGE}\n\n${wrapped}`
        : wrapped;
      const promptFile = await this.writeGrokPrompt(card.agent, dir, promptBody);
      const cwd = plan.cwd;
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
      // Write-ahead: a crash from this point consumes this attempt. There is
      // still a residual orphan window between spawn and the pid write; a
      // spawning record without a pid cannot prove whether exec happened.
      record = {
        agent: card.agent, cwd, requestedCwd: card.cwd ?? null,
        sessionId: plan.sessionId,
        promptFingerprint: currentFingerprint(this.deps.config),
        attempts: plan.attempts, pid: 0, pgid: 0,
        startedAt: plan.startedAt, state: "spawning", resultSent: false,
        roomId: card.roomId, cardId: card.cardId, fromPeerId: card.fromPeerId,
        dispatchHandoffId: card.dispatchHandoffId, procStartedAt: "", sendAttempts: 0,
        completedHandoffIds: [...plan.completedHandoffIds],
      };
      await writeCardSessionAsync({ loomDir: this.deps.loomDir, localPeerId: this.deps.localPeerId }, record);
      if (owner.abandoned) return { kind: "abandon" };
      // Last path check after all setup awaits. Passing the pinned canonical
      // path also avoids following a changed requested symlink in the child.
      // Residual race at the canonical path itself needs fd-relative chdir.
      const checked = resolveWorkerCwd(card.cwd, this.deps.config);
      if (!checked.ok || checked.cwd !== plan.cwd) {
        return { kind: "cwd_denied", changed: true, record };
      }
      spawned = spawnDetachedWorker({
        bin: command.bin,
        args: [...command.args, ...built.argv],
        cwd,
        env: scrubWorkerEnv(card.cardId),
        stdoutPath: transcriptPath,
        stderrPath: stderrPath,
      });
      record.pid = spawned.pid;
      record.pgid = spawned.pgid;
      // No await between spawn returning and the atomic pid/pgid write.
      writeCardSession({ loomDir: this.deps.loomDir, localPeerId: this.deps.localPeerId }, record);
      const child = spawned.child;
      const exitPromise = waitChild(child);
      exitPromise.catch(() => {
        /* abandon can leave this pending until the child exits */
      });
      const leaderGone = (): boolean => child.exitCode !== null || child.signalCode !== null;
      // Register before any async persistence: fast exits/errors may occur
      // while the pid write is in progress.
      const onLeaderExit = (): void => {
        if (!timedOut) disarmTimeout();
      };
      if (leaderGone()) onLeaderExit();
      else child.once("exit", onLeaderExit);
      if (spawned.pid <= 1) throw new Error("worker did not start");
      record.procStartedAt = await captureLstart(spawned.pid, child);
      record.state = "running";
      writeCardSession({ loomDir: this.deps.loomDir, localPeerId: this.deps.localPeerId }, record);
      const tracked: HeadlessFlight = {
        workerId: plan.sessionId,
        cardId: card.cardId,
        agent: card.agent,
        pid: spawned.pid,
        pgid: spawned.pgid,
      };
      flight = tracked;
      this.active.push(tracked);

      const runningRecord = record;
      let wakeTail = (): void => {};
      stopTail = () => { tailStopped = true; wakeTail(); };
      tailPromise = (async () => {
        while (!tailStopped && !owner.abandoned) {
          const raw = await new Promise<string | null>((resolve) => {
            wakeTail = () => resolve(null);
            void readTranscript(transcriptPath).then(resolve);
            if (tailStopped || owner.abandoned) wakeTail();
          });
          if (raw === null || tailStopped || owner.abandoned) return;
          await this.persistSessionId(runningRecord, raw);
          // Explicit cancellation wakes a parked poll immediately on exit or
          // close; do not make result delivery depend on the next timer/IO wake.
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, 50);
            wakeTail = () => { clearTimeout(timer); resolve(); };
            if (tailStopped || owner.abandoned) wakeTail();
          });
        }
      })();
      // Observe errors immediately; the main path awaits this before sending.
      tailPromise.catch(() => {});

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
      stopTail();
      await tailPromise;
      const raw = await readStableTranscript(transcriptPath);
      const parsed = parseAgentStream(card.agent, raw);
      const sessionId = parsed.sessionId ?? plan.sessionId;
      record.sessionId = sessionId;
      await writeCardSessionAsync({ loomDir: this.deps.loomDir, localPeerId: this.deps.localPeerId }, record);
      return {
        kind: "done",
        timedOut,
        finished: streamFinished(card.agent, raw),
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
      return { kind: "setup_failed", message, record };
    } finally {
      stopTail();
      await tailPromise?.catch(() => {});
      disarmTimeout();
      if (flight) {
        const index = this.active.indexOf(flight);
        if (index >= 0) this.active.splice(index, 1);
      }
    }
  }

  private async writeGrokPrompt(agent: AgentKind, dir: string, wrapped: string): Promise<string | undefined> {
    if (agent !== "grok") return undefined;
    const promptFile = join(dir, "prompt.txt");
    await writeFile(promptFile, wrapped, { encoding: "utf8", mode: 0o600 });
    await chmod(promptFile, 0o600);
    return promptFile;
  }
}
