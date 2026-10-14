/**
 * PLAN 0.30.0 P4 HeadlessDispatcher (D2, D4, D5, D7–D9, D11, R5, R48-H1/L1).
 * Resume, adopt, and card_already_running land in P5; session records are
 * written now so that phase can decide from disk.
 */
import { type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, sep } from "node:path";
import { truncateTail, wrapDispatchedPrompt } from "@loom/protocol";
import {
  ARGV_TEMPLATE_VERSION,
  HEADLESS_WORKER_HINT,
  buildAgentArgv,
  promptFingerprint,
  validateWorkerConfig,
  type AgentKind,
  type WorkerConfig,
} from "./agent-argv";
import { parseAgentStream } from "./agent-stream-parsers";
import {
  cardKeyHash,
  readCardSession,
  writeCardSession,
  type CardSessionRecord,
} from "./card-session-store";
import { killProcessGroup, spawnDetachedWorker, type SpawnedWorker } from "./process-group";

const OUTPUT_CAP = 200_000;
const SUMMARY_CAP = 900;
const DEFAULT_TIMEOUT_MS = 7_200_000;
const GROUP_KILL_GRACE_MS = 10_000;

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

type LaunchPlan = {
  sessionId: string;
  attempts: number;
  resumeSessionId?: string;
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

/** Inherited env minus every LOOM_* and FABLE_* key, then LOOM_CARD only. */
function scrubWorkerEnv(cardId: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value !== "string") continue;
    if (key.startsWith("LOOM_") || key.startsWith("FABLE_")) continue;
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
  for (const root of config.allowedRoots) {
    if (!root || !isAbsolute(root)) continue;
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

function readTranscript(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
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

/**
 * P4 always starts a new session. P5 chooses resume or adopt from `existing`
 * (same fingerprint, recorded cwd, live pid, attempts < 2).
 */
function planFreshLaunch(_existing: CardSessionRecord | null): LaunchPlan {
  return { sessionId: randomUUID(), attempts: 1 };
}

function waitChild(child: ChildProcess): Promise<number | null> {
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

export class HeadlessDispatcher {
  private readonly active: HeadlessFlight[] = [];
  private readonly lanes: Record<AgentKind, Semaphore>;

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

  /** Does not kill workers. A later process can adopt a live group (P5). */
  async close(): Promise<void> {}

  async dispatch(card: HeadlessDispatchCard): Promise<void> {
    const resolved = resolveWorkerCwd(card.cwd, this.deps.config);
    if (!resolved.ok) {
      await this.deliver(card, new Date().toISOString(), {
        status: "failed",
        reason: "cwd_not_allowed",
        output: "",
        truncated: false,
        summary: "",
        note: "cwd realpath is outside worker.allowedRoots",
      });
      return;
    }
    const lane = this.lanes[card.agent];
    await lane.acquire();
    try {
      await this.runCard(card, resolved.cwd);
    } finally {
      lane.release();
    }
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

  private async runCard(card: HeadlessDispatchCard, cwd: string): Promise<void> {
    const startedAt = new Date().toISOString();
    const existing = readCardSession({
      loomDir: this.deps.loomDir,
      roomId: card.roomId,
      agent: card.agent,
      cardId: card.cardId,
    });
    const plan = planFreshLaunch(existing);
    const dir = join(
      this.deps.loomDir,
      "cards",
      cardKeyHash(card.roomId, card.agent, card.cardId),
    );
    mkdirSync(dir, { recursive: true });
    const transcriptPath = join(dir, `transcript-${plan.attempts}.jsonl`);
    const stderrPath = join(dir, `transcript-${plan.attempts}.stderr`);
    const wrapped = wrapDispatchedPrompt(card.prompt);
    const promptFile = this.writeGrokPrompt(card.agent, dir, wrapped);
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
    let spawned: SpawnedWorker;
    try {
      spawned = spawnDetachedWorker({
        bin: command.bin,
        args: [...command.args, ...built.argv],
        cwd,
        env: scrubWorkerEnv(card.cardId),
        stdoutPath: transcriptPath,
        stderrPath: stderrPath,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.deliver(card, startedAt, {
        status: "failed",
        reason: "needs_verification",
        output: "",
        truncated: false,
        summary: "",
        note: message.slice(0, 500),
      });
      return;
    }

    const exitPromise = waitChild(spawned.child);
    const flight: HeadlessFlight = {
      workerId: plan.sessionId,
      cardId: card.cardId,
      agent: card.agent,
      pid: spawned.pid,
      pgid: spawned.pgid,
    };
    this.active.push(flight);
    const record: CardSessionRecord = {
      agent: card.agent,
      cwd,
      sessionId: plan.sessionId,
      promptFingerprint: promptFingerprint(
        HEADLESS_WORKER_HINT,
        this.deps.config.permissions,
        ARGV_TEMPLATE_VERSION,
      ),
      attempts: plan.attempts,
      pid: spawned.pid,
      pgid: spawned.pgid,
      startedAt,
      state: "running",
      resultSent: false,
      roomId: card.roomId,
      cardId: card.cardId,
      fromPeerId: card.fromPeerId,
      dispatchHandoffId: card.dispatchHandoffId,
      procStartedAt: startedAt,
    };
    writeCardSession({ loomDir: this.deps.loomDir }, record);
    const stdin = spawned.child.stdin;
    if (stdin) {
      stdin.on("error", () => {
        /* child exited before stdin finished */
      });
      stdin.end(built.promptTransport === "stdin" ? wrapped : "");
    }

    let timedOut = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => {
      timedOut = true;
      killProcessGroup(spawned.pgid, "SIGTERM");
      killTimer = setTimeout(() => {
        killProcessGroup(spawned.pgid, "SIGKILL");
      }, GROUP_KILL_GRACE_MS);
    }, timeoutMsOf(this.deps.config));

    try {
      try {
        await exitPromise;
      } catch {
        /* spawn failure still proposes from whatever transcript was written */
      }
      const raw = readTranscript(transcriptPath);
      const parsed = parseAgentStream(card.agent, raw);
      if (parsed.sessionId) record.sessionId = parsed.sessionId;
      const fullText = timedOut && parsed.finalText.length === 0 ? raw : parsed.finalText;
      const capped = truncateTail(fullText, OUTPUT_CAP);
      const note = truncationNote(capped.truncated, transcriptPath, fullText);
      record.state = "exited";
      record.resultSent = false;
      writeCardSession({ loomDir: this.deps.loomDir }, record);
      await this.deliver(card, startedAt, {
        status: "failed",
        reason: timedOut ? "timeout" : "needs_verification",
        output: capped.text,
        truncated: capped.truncated,
        summary: summaryLine(capped.text),
        ...(note ? { note } : {}),
      });
      record.resultSent = true;
      writeCardSession({ loomDir: this.deps.loomDir }, record);
    } finally {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      const index = this.active.indexOf(flight);
      if (index >= 0) this.active.splice(index, 1);
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
