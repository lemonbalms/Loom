/**
 * PLAN 0.30.0 P5 HeadlessDispatcher.
 * D2, D4–D9, D11, R5, R6, R48-H1/L1/M3, UK-4.
 * Resume and adopt read the durable session record. A live pid whose
 * `ps -o lstart=` matches `procStartedAt` is adopted — never spawned beside.
 * `resultSent=true` is written only after composeAndSend returns.
 *
 * PLAN 0.31.0 P4 (D3 · D4 · D5 · D11 · R6 · R49-M3). With `worker.skills.enabled`:
 * a fresh first turn materializes the room's skills into the card copy under the
 * per-card lock (after the live-group check, before the write-ahead record); claude
 * gets `--plugin-dir` when at least one skill is available, codex/grok get the
 * listing, and all three get unavailable lines — before the dispatched-task marker,
 * first turn only. The record fingerprint carries the copy's manifest hash. Resume
 * and recovery re-hash the copy (verifyCardSkillsCopy, under the lock, no source
 * read): an invalid copy or a different hash is fingerprint_changed →
 * needs_verification. A live pid is never killed for it; its result is pre-empted.
 * Disabled = the 0.30.0/P2 argv, prompt, and fingerprint (manifest hash "").
 *
 * PLAN 0.36.0 P2 (D2 · D4 · D5 · D8 · D11 · R2 · R7 · R8 · R13 · R14). With `deps.memory.enabled`
 * (bridge `worker.memory.enabled`, default off), a fresh first turn reads the memory snapshot
 * under the per-card lock (after the skills step, before composing), redacts env values outside
 * the reader, fences it with a per-card nonce drawn after the read, writes the exact fence bytes
 * to `<cardDir>/memory-snapshot.md` (0600, atomic, before the write-ahead record) and records
 * sha256(file bytes) as `memorySnapshotHash` + the 6th fingerprint input. The block goes right
 * below the dispatched-task marker on stdin / grok prompt.txt; argv is unchanged. Off = no
 * reader call and no filesystem access: 0.35 stdin, prompt.txt, argv, record and fingerprint.
 *
 * PLAN 0.36.0 P3 (D3 · D9 · D11 · R3 · R9–R12 · R18 · R54-L2). Resume, recovery and adoption
 * share one gate, decided by the record value only (never the current memory flag or the live
 * store): record-field shape → skills copy → memory-snapshot.md bytes (regular file, no
 * symlink, ≤1 MiB, sha256 = recorded hash) → fingerprint. Any failure is fingerprint_changed →
 * needs_verification, with skills on or off (D9: a skills-off mismatch no longer starts a fresh
 * session). The resume turn carries no fence (R3); its write-ahead keeps the recorded hash (R10).
 *
 * PLAN 0.37.0 P2 (D2 · D3 · D4(c) · D9 · R4 · R5 · R8–R12). The same fence now carries, in order,
 * the policy notice (`deps.policyGaps`, the card agent's gaps only — omitted = none, R4), the
 * standing rules (`deps.rules.enabled`) and memory, composed by `composeFenceText`, env-redacted
 * once over the whole text (R9) and fenced as before. The step runs on a fresh first turn only
 * when memory, rules or an own gap is on (R10) — otherwise no reader call and no filesystem
 * access (0.36 bytes). A block over 1 MiB is a setup failure (R8). D9: the memory_snapshot line
 * reports read_errors / entries_oversize even when the text is empty. `worker.maxConcurrent
 * .<agent>: 0` is `agent_disabled` after the claim, under the card lock: a new card before the
 * cwd check, an existing unsent record pre-empted like fingerprint_changed (no kill, no spawn).
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { execFile, type ChildProcess } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { constants as fsConstants, realpathSync, statSync } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, sep } from "node:path";
import { truncateTail, wrapDispatchedPrompt } from "@loom/protocol";
import {
  HEADLESS_WORKER_HINT,
  RESUME_CONTINUATION_MESSAGE,
  buildAgentArgv,
  effectiveWorkerPolicy,
  validateWorkerConfig,
  workerFingerprint,
  workerSkillsEnabled,
  type AgentKind,
  type BuiltAgentArgv,
  type WorkerConfig,
} from "./agent-argv";
import { parseAgentStream, type ParsedAgentStream } from "./agent-stream-parsers";
import {
  cardKeyHash,
  cardSessionPath,
  listCardSessions,
  MEMORY_PROPOSED_MAX,
  readCardSession,
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
import {
  composeFenceText,
  composeMemoryWrapped,
  MEMORY_SNAPSHOT_FILE,
  type MemoryInjectFlags,
  renderMemoryBlock,
  renderRulesSection,
} from "./memory-inject";
import { parseMemoryCandidates } from "./memory-candidates";
import { neutralizeCardPrompt } from "./marker-fold";
import { loadMemorySnapshot } from "./memory-snapshot";
import {
  agentKeyFor,
  appendMemoryEntriesAsync,
  type CardDropCounts,
  cardMemorySource,
} from "./memory-store";
import { type Gap, renderPolicyNotice } from "./policy-gaps";
import { parseLstart, readProcessLstart } from "./process-lstart";
import { writePrivateFileAtomic } from "./prompt-record";
import { redactSecrets } from "./redact";
import { roomKey } from "./room-event-log";
import { loadRules } from "./rules-store";
import { materializeCardSkills, verifyCardSkillsCopy } from "./skill-materialize";
import { composeFirstTurnPrompt, renderSkillListing } from "./skill-prompt";

const OUTPUT_CAP = 200_000;
const SUMMARY_CAP = 900;
const DEFAULT_TIMEOUT_MS = 7_200_000;
const GROUP_KILL_GRACE_MS = 10_000;
const MAX_ATTEMPTS = 2;
const MAX_UNKNOWN_PROBES = 5;
/** R18: a memory-snapshot.md above this is corrupt (the snapshot itself is ≈48 KiB at most). */
const MEMORY_SNAPSHOT_MAX_BYTES = 1024 * 1024;
/** D11 · R54-L2: a recorded memorySnapshotHash is "" (no block) or 64 lowercase hex. */
const MEMORY_SNAPSHOT_HASH_RE = /^[0-9a-f]{64}$/;
/** 0.38.0 D15: the redacted copy of a card's final output, beside `skills/` (never read back). */
export const CARD_NOTES_FILE = "notes.md";
/** 0.38.0 D4: the builtin forced into a fresh first spawn's copy while cardWrites is on. */
const MEMORY_CANDIDATES_SKILL = "loom-memory-candidates";

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
  /** Claim the relay entry only once a lane permit is held. Recovery omits this. */
  claim?: () => Promise<boolean>;
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
  /** 0.36.0 D8: the bridge's already-resolved profile (agentKeyFor). Default "default". */
  profile?: string;
  /**
   * 0.36.0 D5: memory injection; only `{enabled: true}` turns it on (omitted = off).
   * 0.38.0 D3: `cardWrites: true` turns on card candidates → `proposed` + notes.md (omitted = 0.37).
   */
  memory?: { enabled: boolean; cardWrites?: true };
  /** 0.36.0 test seam: the per-card fence nonce. Default 32 lowercase hex from randomBytes(16). */
  memoryNonce?: () => string;
  /**
   * 0.37.0 D3 · R4: the bridge's policy gaps, computed once at start. Omitted = [] = no notice.
   * A card gets only its own agent's gaps.
   */
  policyGaps?: readonly Gap[];
  /** 0.37.0 D3: standing rules in the fence; only `{enabled: true}` turns them on. */
  rules?: { enabled: boolean };
  /** Maximum wait for abandoned owners during close(). Default: 10_000 ms. */
  closeDeadlineMs?: number;
  /** must not await dispatch() for the same card; it runs under the per-card transition lock */
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

/** 0.31.0 P4. What the card copy contributes to one spawn. */
type CardSkills = {
  /** D11 fingerprint input. "" while skills are disabled. */
  manifestHash: string;
  /** claude `--plugin-dir`; null when disabled, not claude, or nothing available. */
  pluginDir: string | null;
  /** First-turn listing (R6); "" on resume or when nothing is listed. */
  listing: string;
};

const NO_SKILLS: CardSkills = Object.freeze({ manifestHash: "", pluginDir: null, listing: "" });

type SpawnPlan = {
  cwd: string;
  completedHandoffIds: string[];
  sessionId: string;
  attempts: number;
  resumeSessionId?: string;
  startedAt: string;
  /** Resume with skills enabled: the copy verified under the card lock (nextPlan). */
  skills?: CardSkills;
  /** Resume: the record's memorySnapshotHash that passed the gate (R10); "" = no block. */
  memorySnapshotHash?: string;
};

type SpawnOutcome =
  | { kind: "abandon" }
  | { kind: "group_alive"; record: CardSessionRecord }
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

class UnsentResultError extends Error {}

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

type SendAndMarkOptions = {
  allowPersistenceFailure?: boolean;
  preserveWorkerState?: boolean;
  /** 0.38.0 R9: add this card-candidate key to `memoryProposed` in the first persist. */
  memoryProposedKey?: string;
};

function oneLine(text: string): string {
  return text.replace(/[\r\n]/g, " ");
}

/** 0.38.0 R21: an error as one line of at most 200 characters. */
function errorLine(err: unknown): string {
  return oneLine(err instanceof Error ? err.message : String(err)).slice(0, 200);
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

function defaultMemoryNonce(): string {
  return randomBytes(16).toString("hex");
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

/** Last non-empty stderr line: controls stripped, trimmed, secrets redacted, then capped. */
function lastStderrLine(raw: string): string {
  const lines = raw.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const cleaned = lines[i]!.replace(/\p{Cc}/gu, "").trim();
    if (cleaned.length > 0) return redactSecrets(cleaned).slice(0, STDERR_LINE_CAP);
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

function denialNote(parsed: ParsedAgentStream): string | undefined {
  if (parsed.denials.length === 0) return undefined;
  const tools = [
    ...new Set(
      parsed.denials.flatMap(({ toolName }) => {
        const name = toolName
          ? redactSecrets(toolName.replace(/\p{Cc}/gu, "").trim()).slice(0, 64)
          : "";
        return name ? [name] : [];
      }),
    ),
  ];
  const listed = tools.slice(0, 5);
  if (tools.length > 5) listed.push("…");
  return `denials: ${parsed.denials.length}${listed.length ? ` (${listed.join(", ")})` : ""}`;
}

type Liveness = "alive" | "dead" | "unknown";

function observeProcess(record: CardSessionRecord): { liveness: Liveness; leaderExited: boolean } {
  // Never probe pid 0/1, and terminal records do not identify live workers.
  if (record.state === "exited" || !(record.pid > 1)) {
    return { liveness: "dead", leaderExited: false };
  }
  try {
    process.kill(record.pid, 0);
  } catch (err) {
    const leaderExited = (err as NodeJS.ErrnoException).code === "ESRCH";
    return { liveness: leaderExited ? "dead" : "unknown", leaderExited };
  }
  const live = readProcessLstart(record.pid);
  const expected = parseLstart(record.procStartedAt);
  const observed = live ? parseLstart(live) : null;
  if (expected === null || observed === null) return { liveness: "unknown", leaderExited: false };
  return { liveness: expected === observed ? "alive" : "dead", leaderExited: false };
}

function processLiveness(record: CardSessionRecord): Liveness {
  return observeProcess(record).liveness;
}

async function captureLstart(pid: number, child: ChildProcess): Promise<string> {
  for (let i = 0; i < 25; i++) {
    // Startup observation may wait on ps without blocking dispatch/status work.
    // The pid/pgid have already been synchronously committed by the caller.
    const started = await new Promise<string | null>((resolve) => {
      execFile(
        "/bin/ps",
        ["-o", "lstart=", "-p", String(pid)],
        {
          encoding: "utf8",
          timeout: 2_000,
          env: { ...process.env, LC_ALL: "C", LANG: "C", TZ: "UTC" },
        },
        (err, stdout) => resolve(err ? null : stdout.trim() || null),
      );
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
      if (escaped) {
        escaped = false;
        continue;
      }
      if (inString && ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === "{" || ch === "[") depth++;
      if (ch === "}" || ch === "]") depth--;
      if (depth === 0) break;
    }
    if (depth !== 0) break;
    try {
      const event = JSON.parse(json);
      if (event?.type === terminal) return true;
    } catch {
      /* non-JSON noise is not completion */
    }
    i = end;
  }
  return false;
}

function fingerprintChangedFields(): HeadlessResultFields {
  return {
    status: "failed",
    reason: "needs_verification",
    output: "",
    truncated: false,
    summary: "fingerprint changed",
    note: "fingerprint_changed; not resuming",
  };
}

/** 0.37.0 D4(c): `worker.maxConcurrent.<agent>` is 0 — the card is never spawned. */
function agentDisabledFields(agent: AgentKind): HeadlessResultFields {
  return {
    status: "failed",
    reason: "agent_disabled",
    output: "",
    truncated: false,
    summary: "",
    note: `worker.maxConcurrent.${agent} is 0 (agent disabled)`,
  };
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
  // Never reconstructed from a saved numeric pgid alone.
  private readonly verifiedFlights = new Set<HeadlessFlight>();
  private readonly lanes: Record<AgentKind, Semaphore>;
  private readonly byCard = new Map<string, CardOwner>();
  // Includes distinct handoffs waiting to report an in-memory busy card.
  private readonly owners = new Set<CardOwner>();
  private readonly recordTails = new Map<string, Promise<void>>();
  /** Per-branch sink ancestry: immutable list; a frame counts only while its sink call is active. */
  private readonly sinkCards = new AsyncLocalStorage<readonly { key: string; active: boolean }[]>();

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
        this.dispatchOwned(
          {
            roomId: record.roomId,
            cardId: record.cardId,
            agent: record.agent,
            prompt: "",
            fromPeerId: record.fromPeerId,
            dispatchHandoffId: record.dispatchHandoffId,
            cwd: record.requestedCwd === null ? undefined : record.requestedCwd,
          },
          true,
        ).catch((err: unknown) => {
          // One broken record or sink must not reject recovery of its peers.
          const message = err instanceof Error ? err.message : String(err);
          process.stderr.write(
            `[headless] recovery failed (${record.cardId}): ${message.replace(/[\r\n]/g, " ")}\n`,
          );
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
    const pending = [...this.owners];
    for (const owner of pending) owner.abandon();
    if (pending.length === 0) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.allSettled(pending.map((owner) => owner.done)),
        new Promise<void>((resolve) => {
          timer = setTimeout(() => {
            const count = pending.filter((owner) => this.owners.has(owner)).length;
            if (count > 0) {
              process.stderr.write(`[headless] close deadline: ${count} owners still pending\n`);
            }
            resolve();
          }, this.deps.closeDeadlineMs ?? 10_000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    // Late successful claims still take the abandoned owner's guarded reservation
    // path while this process is alive. Known limit: if it exits first, the
    // handoff can be claimed without any durable session record.
  }

  async dispatch(card: HeadlessDispatchCard): Promise<void> {
    return this.dispatchOwned(card, false);
  }

  private async dispatchOwned(card: HeadlessDispatchCard, recovering: boolean): Promise<void> {
    const dir = this.cardDir(card);
    if (this.sinkCards.getStore()?.some((frame) => frame.active && frame.key === dir)) {
      throw new Error("re-entrant dispatch from result sink");
    }
    const key = cardKeyHash(card.roomId, card.agent, card.cardId);
    const existing = this.byCard.get(key);
    if (existing && existing.handoffId !== card.dispatchHandoffId && !card.claim) {
      const saved = await readCardSessionAsync({
        loomDir: this.deps.loomDir,
        localPeerId: this.deps.localPeerId,
        ...card,
      });
      if (saved?.completedHandoffIds.includes(card.dispatchHandoffId)) return;
      await this.deliver(card, new Date().toISOString(), this.alreadyRunningFields());
      return;
    }
    if (existing?.handoffId === card.dispatchHandoffId) {
      await existing.done;
      return;
    }
    const owner = createOwner(card.dispatchHandoffId);
    if (!existing) this.byCard.set(key, owner);
    this.owners.add(owner);
    try {
      await this.lead(card, owner, recovering, !!existing);
    } finally {
      if (this.byCard.get(key) === owner) this.byCard.delete(key);
      this.owners.delete(owner);
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

  // Only record transitions take this lock; lane waits and worker monitoring do not.
  private async withCardLock<T>(
    card: Pick<HeadlessDispatchCard, "roomId" | "agent" | "cardId">,
    action: () => Promise<T>,
  ): Promise<T> {
    const key = this.cardDir(card);
    const previous = this.recordTails.get(key) ?? Promise.resolve();
    const result = previous.then(action);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.recordTails.set(key, tail);
    try {
      return await result;
    } finally {
      if (this.recordTails.get(key) === tail) this.recordTails.delete(key);
    }
  }

  private readRecord(card: Pick<HeadlessDispatchCard, "roomId" | "agent" | "cardId">) {
    return readCardSessionAsync({
      loomDir: this.deps.loomDir,
      localPeerId: this.deps.localPeerId,
      ...card,
    });
  }

  /** Caller holds the card lock. Every record writer, including pendingResult, comes here. */
  private async updateRecordLocked(
    card: Pick<HeadlessDispatchCard, "roomId" | "agent" | "cardId">,
    update: (current: CardSessionRecord | null) => CardSessionRecord,
    synchronous = false,
  ): Promise<CardSessionRecord> {
    const key = { loomDir: this.deps.loomDir, localPeerId: this.deps.localPeerId, ...card };
    // The synchronous branch preserves the no-await spawn -> pid-write fence.
    const current = synchronous ? readCardSession(key) : await this.readRecord(card);
    if (synchronous && !current) throw new Error("missing or invalid worker session record");
    const next = update(current);
    if (
      current?.pendingResult &&
      !current.resultSent &&
      current.dispatchHandoffId !== next.dispatchHandoffId
    )
      throw new UnsentResultError("shutdown reservation would overwrite an unsent result");
    if (next === current) return next;
    const opts = { loomDir: this.deps.loomDir, localPeerId: this.deps.localPeerId };
    if (synchronous) writeCardSession(opts, next);
    else await writeCardSessionAsync(opts, next);
    return next;
  }

  private async sendOrphanGroup(
    card: HeadlessDispatchCard,
    record: CardSessionRecord,
  ): Promise<void> {
    await this.withCardLock(card, () => this.sendOrphanGroupLocked(card, record));
  }

  private async sendOrphanGroupLocked(
    card: HeadlessDispatchCard,
    record: CardSessionRecord,
  ): Promise<void> {
    // Keep the old worker identity so later handoffs cannot spawn beside it.
    await this.sendAndMarkLocked(
      { ...record, fromPeerId: card.fromPeerId, dispatchHandoffId: card.dispatchHandoffId },
      {
        status: "failed",
        reason: "orphan_group_alive",
        output: "",
        truncated: false,
        summary: "needs_verification",
        note: "needs_verification; previous worker processes may still be running; not resuming",
      },
      { preserveWorkerState: true },
    );
  }

  private async reserveShutdownAfterClaim(card: HeadlessDispatchCard): Promise<void> {
    await this.withCardLock(card, () => this.reserveShutdownAfterClaimLocked(card));
  }

  private async reserveShutdownAfterClaimLocked(card: HeadlessDispatchCard): Promise<void> {
    await this.updateRecordLocked(card, (existing) => {
      const checked = resolveWorkerCwd(card.cwd, this.deps.config);
      return {
        ...(existing ?? {
          roomId: card.roomId,
          cardId: card.cardId,
          agent: card.agent,
          cwd: checked.ok ? checked.cwd : (card.cwd ?? this.deps.config.cwd),
          requestedCwd: card.cwd ?? null,
          sessionId: randomUUID(),
          // Never spawned: no card copy belongs to this record (manifest hash "").
          promptFingerprint: workerFingerprint(this.deps.config, ""),
          attempts: 1,
          pid: 0,
          pgid: 0,
          procStartedAt: "",
          startedAt: new Date().toISOString(),
          state: "exited",
          completedHandoffIds: [],
        }),
        fromPeerId: card.fromPeerId,
        dispatchHandoffId: card.dispatchHandoffId,
        resultSent: false,
        sendAttempts:
          existing?.dispatchHandoffId === card.dispatchHandoffId ? existing.sendAttempts : 0,
        pendingResult:
          existing?.dispatchHandoffId === card.dispatchHandoffId && existing.pendingResult
            ? existing.pendingResult
            : {
                status: "failed",
                reason: "bridge_shutdown_after_claim",
                output: "",
                truncated: false,
                summary: "needs_verification",
                note: "needs_verification; bridge shut down after claiming the handoff; worker not started",
                timedOut: false,
              },
      };
    });
  }

  private async deliver(
    card: HeadlessDispatchCard,
    startedAt: string,
    fields: HeadlessResultFields,
  ): Promise<void> {
    const frame = { key: this.cardDir(card), active: true };
    const ancestry = [...(this.sinkCards.getStore() ?? []), frame];
    try {
      await this.sinkCards.run(ancestry, () =>
        this.deps.sink.composeAndSend(
          {
            roomId: card.roomId,
            cardId: card.cardId,
            fromPeerId: card.fromPeerId,
            dispatchHandoffId: card.dispatchHandoffId,
            startedAt,
          },
          fields,
          { node: this.deps.node },
        ),
      );
    } finally {
      frame.active = false;
    }
  }

  /** resultSent flips true only after composeAndSend resolves. */
  private async sendAndMark(
    record: CardSessionRecord,
    fields: HeadlessResultFields,
    opts: SendAndMarkOptions = {},
  ): Promise<void> {
    await this.withCardLock(record, () => this.sendAndMarkLocked(record, fields, opts));
  }

  private async sendAndMarkLocked(
    record: CardSessionRecord,
    fields: HeadlessResultFields,
    opts: SendAndMarkOptions = {},
  ): Promise<void> {
    const proposedKey = opts.memoryProposedKey;
    const persist = async (update: (current: CardSessionRecord) => CardSessionRecord) => {
      try {
        Object.assign(
          record,
          await this.updateRecordLocked(record, (current) => {
            if (!current) throw new Error("missing worker session record");
            return update(current);
          }),
        );
      } catch (err) {
        if (!opts.allowPersistenceFailure) throw err;
        // A slot conflict is never a filesystem failure we may bypass.
        if (err instanceof UnsentResultError) throw err;
        // Setup already killed the worker; still report the setup failure
        // when the same filesystem failure prevents marking its record.
        Object.assign(record, update(record));
      }
    };
    await persist((current) => {
      const sameHandoff = current.dispatchHandoffId === record.dispatchHandoffId;
      return {
        ...current,
        fromPeerId: record.fromPeerId,
        dispatchHandoffId: record.dispatchHandoffId,
        // A refusal/uncertainty is not proof of exit.
        state: opts.preserveWorkerState ? current.state : "exited",
        pendingResult: (sameHandoff && current.pendingResult) || {
          ...structuredClone(fields),
          timedOut: fields.timedOut ?? false,
        },
        resultSent: false,
        sendAttempts: (sameHandoff ? current.sendAttempts : 0) + 1,
        // 0.38.0 R9: the card-candidate key rides the first persist (under this lock).
        ...(proposedKey
          ? {
              memoryProposed: [
                ...(current.memoryProposed ?? []).filter((k) => k !== proposedKey),
                proposedKey,
              ].slice(-MEMORY_PROPOSED_MAX),
            }
          : {}),
      };
    });
    // Sending under the lock prevents another handoff reserving the slot
    // between the write-ahead result and its successful-delivery persist.
    await this.deliver(
      { ...record, prompt: "" },
      record.startedAt,
      structuredClone(record.pendingResult!),
    );
    await persist((current) => ({
      ...current,
      // The first persist may have failed before writing. These are the
      // exact reservation fields built under this lock and just delivered.
      fromPeerId: record.fromPeerId,
      dispatchHandoffId: record.dispatchHandoffId,
      state: opts.preserveWorkerState ? current.state : "exited",
      pendingResult: record.pendingResult,
      sendAttempts: record.sendAttempts,
      resultSent: true,
      completedHandoffIds: [
        ...current.completedHandoffIds.filter((id) => id !== record.dispatchHandoffId),
        record.dispatchHandoffId,
      ].slice(-16),
    }));
  }

  /** The only resume gate, including after an adopted or local worker exits. */
  private async nextPlan(
    card: HeadlessDispatchCard,
    record: CardSessionRecord,
  ): Promise<SpawnPlan | null> {
    return this.withCardLock(card, async () => {
      const latest = await this.readRecord(record);
      if (!latest) throw new Error("missing worker session record");
      record = latest;
      const current = resolveWorkerCwd(card.cwd, this.deps.config);
      // Compare the stored realpath literally: re-resolving it could conceal a
      // symlink replacement at the old path.
      if (!current.ok || record.cwd !== current.cwd) {
        await this.sendAndMarkLocked(record, {
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
        await this.sendGiveUpLocked(record);
        return null;
      }
      // D3 / R49-M3 / 0.36.0 D9: resume only on the verified, unchanged card copy and memory
      // snapshot file, skills on or off. A mismatch never starts a fresh session.
      // R54-L2: not `?? ""` — a tampered null must fail the shape check, not read as "no block".
      const expected = record.memorySnapshotHash === undefined ? "" : record.memorySnapshotHash;
      const copy = await this.cardFingerprintLocked(record, expected);
      if (!copy || copy.fingerprint !== record.promptFingerprint) {
        await this.sendAndMarkLocked(record, fingerprintChangedFields());
        return null;
      }
      return {
        cwd: current.cwd,
        completedHandoffIds: record.completedHandoffIds,
        sessionId: record.sessionId,
        attempts: record.attempts + 1,
        resumeSessionId: record.sessionId,
        startedAt: record.startedAt,
        skills: copy.skills,
        memorySnapshotHash: expected,
      };
    });
  }

  private async lead(
    card: HeadlessDispatchCard,
    owner: CardOwner,
    recovering: boolean,
    busy = false,
  ): Promise<void> {
    const lane = this.lanes[card.agent];
    await lane.acquire();
    try {
      if (owner.abandoned) return;
      const prepared = await this.withCardLock(card, async () => {
        if (owner.abandoned) return;
        const existing = await this.readRecord(card);
        // Discharge the card's reserved result before claiming another handoff.
        // D1 replay needs no D2 claim, and close can still leave D2 in the inbox.
        if (existing && !existing.resultSent && existing.pendingResult) {
          const sameHandoff = existing.dispatchHandoffId === card.dispatchHandoffId;
          const exhausted = existing.sendAttempts >= 2;
          try {
            if (exhausted) {
              throw new Error("pending result replay budget exhausted");
            }
            await this.sendAndMarkLocked(existing, existing.pendingResult, {
              preserveWorkerState: existing.state !== "exited",
            });
          } catch (err) {
            process.stderr.write(`[headless] replay_exhausted ${existing.cardId}\n`);
            if (card.claim) return;
            if (sameHandoff) {
              if (exhausted) return;
              throw err;
            }
            // Preserve D1's reserved result; a direct D2 refusal cannot overwrite it.
            await this.deliver(card, new Date().toISOString(), {
              status: "failed",
              reason: "needs_verification",
              output: "",
              truncated: false,
              summary: "pending result replay failed",
              note: "previous handoff result replay failed or exhausted; not starting this handoff",
            });
            return;
          }
          // sendAndMarkLocked updated resultSent/state/history on this same object.
        }
        if (owner.abandoned) return;
        // The single result slot is still owed to this owner, even before it
        // has reserved output (or written its first spawning record).
        if (
          card.claim &&
          (busy ||
            (existing &&
              !existing.resultSent &&
              existing.dispatchHandoffId !== card.dispatchHandoffId))
        )
          return;
        // Keep the pre-claim check valid through the network call and the
        // post-claim decision. Connection setup can outlast close's deadline;
        // the abandoned owner must remain here to reserve a late successful claim.
        try {
          if (card.claim && !(await card.claim())) return;
        } catch {
          // Another bridge won, or the entry cannot currently be claimed.
          return;
        }
        let runCard = card;
        if (
          existing &&
          (existing.completedHandoffIds.includes(card.dispatchHandoffId) ||
            (existing.resultSent && existing.dispatchHandoffId === card.dispatchHandoffId))
        ) {
          process.stderr.write(`[headless] already_completed (${existing.cardId})\n`);
          return;
        }
        if (owner.abandoned) {
          if (card.claim) await this.reserveShutdownAfterClaimLocked(card);
          return;
        }
        if (busy) {
          await this.deliver(card, new Date().toISOString(), this.alreadyRunningFields());
          return;
        }
        // These decisions precede every liveness probe: no pid cannot prove that
        // exec did not happen, and a reserved result must never be reconstructed.
        // D11 / R49-M3: recovery compares against the config and the card copy
        // re-hashed now (it also decides skipWatch). Every adoption re-checks at the
        // adoption branch below, independent of any liveness snapshot taken here.
        const fingerprintChanged =
          recovering && existing ? await this.fingerprintChangedLocked(existing) : false;
        if (existing) {
          const liveness = processLiveness(existing);
          const skipWatch =
            existing.dispatchHandoffId !== card.dispatchHandoffId || fingerprintChanged;
          if (
            processGroupAlive(existing.pgid) &&
            (liveness === "dead" || (liveness === "unknown" && skipWatch))
          ) {
            await this.sendOrphanGroupLocked(card, existing);
            return;
          }
        }
        if (existing?.state === "spawning" && !(existing.pid > 1)) {
          await this.sendAndMarkLocked(existing, {
            status: "failed",
            reason: "spawn_state_unknown",
            output: "",
            truncated: false,
            summary: "spawn state unknown",
            note: "bridge stopped before worker identity was saved; exec may have happened; not spawning",
          });
          return;
        }
        if (existing && !existing.resultSent && this.deps.config.maxConcurrent[card.agent] === 0) {
          // 0.37.0 D4(c) · R12: a disabled agent's record is never adopted or resumed; a live
          // worker is not killed (R49-M3 form) and its result is pre-empted.
          await this.sendAndMarkLocked(existing, agentDisabledFields(card.agent), {
            preserveWorkerState: processLiveness(existing) !== "dead",
          });
          return;
        }
        if (existing && fingerprintChanged) {
          // R49-M3: a live worker is not killed and not watched; its result is pre-empted.
          await this.sendAndMarkLocked(existing, fingerprintChangedFields(), {
            preserveWorkerState: processLiveness(existing) !== "dead",
          });
          return;
        }
        if (existing && (!existing.resultSent || processLiveness(existing) !== "dead")) {
          if (
            existing.dispatchHandoffId !== card.dispatchHandoffId &&
            processLiveness(existing) !== "dead"
          ) {
            await this.deliver(card, new Date().toISOString(), this.alreadyRunningFields());
            return;
          }
          // About to adopt → verify → adopt or pre-empt (R49-M3). Liveness may have
          // changed since any earlier probe, so this check does not depend on one.
          if (await this.fingerprintChangedLocked(existing)) {
            await this.sendAndMarkLocked(existing, fingerprintChangedFields(), {
              preserveWorkerState: processLiveness(existing) !== "dead",
            });
            return;
          }
          // Original dispatch identity owns every adopted/recovered result.
          runCard = {
            ...card,
            roomId: existing.roomId,
            cardId: existing.cardId,
            fromPeerId: existing.fromPeerId,
            dispatchHandoffId: existing.dispatchHandoffId,
          };
          return { existing, runCard };
        }
        // 0.37.0 D4(c) · R12: concurrencyLimit turns 0 into a lane of 1, so check explicitly.
        if (this.deps.config.maxConcurrent[card.agent] === 0) {
          await this.deliver(card, new Date().toISOString(), agentDisabledFields(card.agent));
          return;
        }
        const checked = resolveWorkerCwd(card.cwd, this.deps.config);
        if (!checked.ok) {
          await this.deliver(card, new Date().toISOString(), this.cwdDeniedFields());
          return;
        }
        return {
          runCard,
          plan: {
            cwd: checked.cwd,
            completedHandoffIds: existing?.completedHandoffIds ?? [],
            sessionId: randomUUID(),
            attempts: 1,
            startedAt: new Date().toISOString(),
          },
        };
      });
      if (!prepared) return;
      let plan: SpawnPlan;
      const runCard = prepared.runCard;
      if (prepared.existing) {
        const existing = prepared.existing;
        if (existing.state === "exited") {
          if (existing.sendAttempts >= 2) return;
          const path = this.transcriptPath(existing, existing.attempts);
          const raw = await readStableTranscript(path);
          await this.sendParsed(existing, {
            timedOut: false,
            parsed: parseAgentStream(existing.agent, raw),
            raw,
            transcriptPath: path,
          });
          return;
        }
        const watched = await this.watchAdopted(existing, owner);
        if (watched.kind === "abandon" || owner.abandoned) return;
        if (watched.kind === "group_alive") {
          await this.sendOrphanGroup(card, existing);
          return;
        }
        if (watched.kind === "unknown") {
          await this.sendAndMark(
            existing,
            {
              status: "failed",
              reason: "liveness_unknown",
              output: "",
              truncated: false,
              summary: "liveness unknown",
              note: "could not establish worker identity; not spawning or signaling",
            },
            { preserveWorkerState: true },
          );
          return;
        }
        const raw = watched.raw;
        if (watched.timedOut) {
          await this.sendParsed(existing, {
            timedOut: true,
            parsed: parseAgentStream(existing.agent, raw),
            raw,
            transcriptPath: this.transcriptPath(existing, existing.attempts),
          });
          return;
        }
        const parsed = parseAgentStream(existing.agent, raw);
        await this.persistSessionId(existing, raw);
        // Always inspect the latest transcript before deciding to resume.
        if (streamFinished(existing.agent, raw)) {
          await this.sendParsed(existing, {
            timedOut: false,
            parsed,
            raw,
            transcriptPath: this.transcriptPath(existing, existing.attempts),
          });
          return;
        }
        const next = await this.nextPlan(runCard, existing);
        if (!next) return;
        plan = next;
      } else {
        plan = prepared.plan!;
      }

      for (;;) {
        if (owner.abandoned) {
          if (card.claim) await this.reserveShutdownAfterClaim(card);
          return;
        }
        const outcome = await this.spawnOnce(runCard, owner, plan);
        if (outcome.kind === "abandon") return;
        if (outcome.kind === "group_alive") {
          await this.sendOrphanGroup(runCard, outcome.record);
          return;
        }
        if (outcome.kind === "cwd_denied") {
          const fields = this.cwdDeniedFields();
          if (outcome.changed) fields.note = "cwd_changed_before_spawn";
          if (outcome.record) await this.sendAndMark(outcome.record, fields);
          else await this.deliver(runCard, plan.startedAt, fields);
          return;
        }
        if (outcome.kind === "setup_failed") {
          const fields: HeadlessResultFields = {
            status: "failed",
            reason: "spawn_setup_failed",
            output: "",
            truncated: false,
            summary: "",
            note: outcome.message.slice(0, 500),
          };
          if (outcome.record)
            await this.sendAndMark(outcome.record, fields, { allowPersistenceFailure: true });
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

  private async sendGiveUpLocked(record: CardSessionRecord): Promise<void> {
    const transcriptPath = this.transcriptPath(record, record.attempts);
    const raw = await readTranscript(transcriptPath);
    const parsed = parseAgentStream(record.agent, raw);
    if (parsed.sessionId) {
      Object.assign(
        record,
        await this.updateRecordLocked(record, (current) => {
          if (!current) throw new Error("missing worker session record");
          return { ...current, sessionId: parsed.sessionId! };
        }),
      );
    }
    const fullText = parsed.finalText.length > 0 ? parsed.finalText : raw;
    // 0.38.0 D5 · D15: the give-up path writes notes.md only (already under the card lock).
    if (this.deps.memory?.cardWrites === true) await this.writeCardNotes(record, fullText);
    const capped = truncateTail(fullText, OUTPUT_CAP);
    const truncated = truncationNote(capped.truncated, transcriptPath, fullText);
    const attemptsNote = `attempts ${record.attempts} exhausted; not resuming`;
    const stderrLine = lastStderrLine(
      await readTranscript(join(this.cardDir(record), `transcript-${record.attempts}.stderr`)),
    );
    const note = [
      denialNote(parsed),
      attemptsNote,
      stderrLine ? `last stderr: ${stderrLine}` : undefined,
      truncated,
    ]
      .filter(Boolean)
      .join("; ")
      .slice(0, 500);
    await this.sendAndMarkLocked(record, {
      status: "failed",
      reason: "needs_verification",
      output: capped.text,
      truncated: capped.truncated,
      summary: summaryLine(capped.text),
      note,
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
    await this.persistSessionId(record, outcome.raw);
    // Timeout keeps the whole partial transcript. Parsed finalText alone
    // drops the remainder once any text has been parsed.
    const fullText = outcome.timedOut ? outcome.raw : outcome.parsed.finalText;
    // 0.38.0 ② result-path steps, before sendAndMark and outside the card lock (D11):
    // ① notes.md ② propose (not on timeout) ③ the stderr line (inside ②) ④ sendAndMark + key.
    let memoryProposedKey: string | undefined;
    if (this.deps.memory?.cardWrites === true) {
      await this.writeCardNotes(record, fullText);
      if (!outcome.timedOut) {
        memoryProposedKey = await this.proposeCardMemory(record, outcome.parsed.finalText);
      }
    }
    const summary = summaryLine(fullText);
    const capped = truncateTail(fullText, OUTPUT_CAP);
    const note = [
      denialNote(outcome.parsed),
      truncationNote(capped.truncated, outcome.transcriptPath, fullText),
    ]
      .filter(Boolean)
      .join("; ")
      .slice(0, 500);
    await this.sendAndMark(
      record,
      {
        status: "failed",
        reason: outcome.timedOut ? "timeout" : "needs_verification",
        timedOut: outcome.timedOut,
        output: capped.text,
        truncated: capped.truncated,
        summary,
        ...(note ? { note } : {}),
      },
      memoryProposedKey ? { memoryProposedKey } : {},
    );
  }

  /**
   * 0.38.0 D15 · R15: `<cardDir>/notes.md` = the env-redacted, capped copy of `fullText` (0600,
   * same-directory temp file → rename). Empty text writes nothing and keeps an older file. A
   * failure is one stderr line and never blocks delivery.
   */
  private async writeCardNotes(record: CardSessionRecord, fullText: string): Promise<void> {
    if (fullText === "") return;
    const dir = this.cardDir(record);
    const tmp = join(dir, `.${CARD_NOTES_FILE}.tmp.${process.pid}.${randomUUID()}`);
    const target = join(dir, CARD_NOTES_FILE);
    try {
      const text = truncateTail(redactSecrets(fullText, process.env), OUTPUT_CAP).text;
      await writeFile(tmp, text, { encoding: "utf8", mode: 0o600, flag: "wx" });
      await rename(tmp, target);
      await chmod(target, 0o600);
    } catch (err) {
      await rm(tmp, { force: true }).catch(() => {});
      process.stderr.write(
        `[headless] card_notes (${oneLine(record.cardId)}): failed — ${errorLine(err)}\n`,
      );
    }
  }

  /**
   * 0.38.0 D5 · D11 · D13 · D14 · R9 · R13 · R21 — card candidates of a non-timeout final text →
   * `proposed` in the bridge profile's store (room scope). Outside the card lock. Writes exactly
   * one stderr line. Returns the record key to persist when the store finished its under-lock
   * step (or the record already had it); undefined on busy, IO error, no block or no profile.
   * Never throws.
   */
  private async proposeCardMemory(
    record: CardSessionRecord,
    finalText: string,
  ): Promise<string | undefined> {
    const write = (body: string) =>
      process.stderr.write(`[headless] memory_propose (${oneLine(record.cardId)}): ${body}\n`);
    const profile = this.deps.profile;
    if (!profile) {
      write("skipped — no profile");
      return undefined;
    }
    try {
      const handoff = createHash("sha256")
        .update(record.dispatchHandoffId)
        .digest("hex")
        .slice(0, 16);
      const key = `${handoff}.${record.attempts}`;
      const parsed = parseMemoryCandidates(finalText);
      const dropped: CardDropCounts = { secret: 0, marker: 0, cap: 0, busy: 0, dup: 0, invalid: 0 };
      let proposed = 0;
      let result: string | undefined;
      if ((record.memoryProposed ?? []).includes(key)) {
        // Fast path (R9): this attempt already finished the store step — no store access.
        dropped.dup = parsed.candidates.length;
        result = key;
      } else if (parsed.block) {
        dropped.invalid += parsed.invalid;
        dropped.cap += parsed.overflow;
        const room = roomKey(record.roomId);
        const r = await appendMemoryEntriesAsync(
          this.deps.loomDir,
          agentKeyFor(profile, record.agent),
          {
            source: cardMemorySource({
              room,
              card: cardKeyHash(record.roomId, record.agent, record.cardId),
              handoff,
              attempt: record.attempts as 1 | 2,
              by: record.fromPeerId,
            }),
            appliesTo: `room:${room}`,
            candidates: parsed.candidates,
          },
          { env: process.env },
        );
        proposed = r.proposed;
        for (const k of Object.keys(dropped) as (keyof CardDropCounts)[]) dropped[k] += r.dropped[k];
        // R9: the key only when the store finished its under-lock step (proposed · dup · cap are
        // its only under-lock outcomes); a busy drop leaves it off so a later reprocess may retry.
        if (r.dropped.busy === 0 && r.proposed + r.dropped.dup + r.dropped.cap > 0) result = key;
      }
      const m = Object.values(dropped).reduce((a, b) => a + b, 0);
      write(
        `proposed ${proposed} · dropped ${m} (secret ${dropped.secret} · marker ${dropped.marker} · cap ${dropped.cap} · busy ${dropped.busy} · dup ${dropped.dup} · invalid ${dropped.invalid})`,
      );
      return result;
    } catch (err) {
      write(`failed — ${errorLine(err)}`);
      return undefined;
    }
  }

  private skillsKey(card: Pick<HeadlessDispatchCard, "roomId" | "agent" | "cardId">) {
    return {
      loomDir: this.deps.loomDir,
      localPeerId: this.deps.localPeerId,
      roomId: card.roomId,
      agent: card.agent,
      cardId: card.cardId,
    };
  }

  /**
   * Caller holds the card lock. D11 / R49-M3 / 0.36.0 D3 · R11: the card's fingerprint now,
   * from the config, the card copy re-hashed in place (no source read) and the recorded memory
   * snapshot hash `expected` re-derived from `<cardDir>/memory-snapshot.md` (never the live
   * store, never the current memory flag). Order: 1) `expected` is "" or 64 hex 2) skills copy
   * (when enabled) 3) the snapshot file, when `expected` is not "" 4) fingerprint. null = a
   * check failed. Skills disabled → manifest hash "".
   */
  private async cardFingerprintLocked(
    card: Pick<HeadlessDispatchCard, "roomId" | "agent" | "cardId">,
    expected: string,
  ): Promise<{ fingerprint: string; skills: CardSkills } | null> {
    const id = card.cardId.replace(/[\r\n]/g, " ");
    const memoryFailed = (reason: string): null => {
      process.stderr.write(`[headless] memory snapshot check failed (${id}): ${reason}\n`);
      return null;
    };
    if (
      typeof expected !== "string" ||
      (expected !== "" && !MEMORY_SNAPSHOT_HASH_RE.test(expected))
    ) {
      return memoryFailed("bad record field");
    }
    let manifestHash = "";
    let skills: CardSkills = NO_SKILLS;
    if (workerSkillsEnabled(this.deps.config)) {
      const verified = await verifyCardSkillsCopy(this.skillsKey(card));
      if (!verified.ok) {
        process.stderr.write(
          `[headless] skills copy check failed (${id}): ${verified.reason.replace(/[\r\n]/g, " ")}\n`,
        );
        return null;
      }
      manifestHash = verified.manifestHash;
      skills = {
        manifestHash: verified.manifestHash,
        pluginDir:
          card.agent === "claude" && verified.manifest.length > 0 ? verified.pluginDir : null,
        listing: "",
      };
    }
    if (expected !== "") {
      const reason = await this.memorySnapshotFileMismatch(card, expected);
      if (reason) return memoryFailed(reason);
    }
    return { fingerprint: workerFingerprint(this.deps.config, manifestHash, expected), skills };
  }

  /**
   * R18: re-hash `<cardDir>/memory-snapshot.md` without following a symlink. Returns the
   * failure reason, or null when sha256(file bytes) === expected.
   */
  private async memorySnapshotFileMismatch(
    card: Pick<HeadlessDispatchCard, "roomId" | "agent" | "cardId">,
    expected: string,
  ): Promise<string | null> {
    const path = join(this.cardDir(card), MEMORY_SNAPSHOT_FILE);
    const code = (err: unknown) => (err as NodeJS.ErrnoException)?.code;
    try {
      const st = await lstat(path);
      if (!st.isFile()) return "not a regular file";
      if (st.size > MEMORY_SNAPSHOT_MAX_BYTES) return "too large";
    } catch (err) {
      return code(err) === "ENOENT" ? "missing" : "read error";
    }
    let bytes: Buffer;
    try {
      // O_NOFOLLOW · O_NONBLOCK: a swap after the lstat cannot redirect or block the read.
      const fh = await open(
        path,
        fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK,
      );
      try {
        const st = await fh.stat();
        if (!st.isFile()) return "not a regular file";
        if (st.size > MEMORY_SNAPSHOT_MAX_BYTES) return "too large";
        bytes = await fh.readFile();
      } finally {
        await fh.close();
      }
    } catch (err) {
      const c = code(err);
      if (c === "ENOENT") return "missing";
      if (c === "ELOOP") return "not a regular file";
      return "read error";
    }
    if (bytes.length > MEMORY_SNAPSHOT_MAX_BYTES) return "too large";
    const actual = createHash("sha256").update(bytes).digest("hex");
    return actual === expected ? null : "hash mismatch";
  }

  /** Caller holds the card lock. */
  private async fingerprintChangedLocked(record: CardSessionRecord): Promise<boolean> {
    if (!isAgent(record.agent)) return true;
    // R54-L2: the same strict read as nextPlan (recovery :1066 and adoption :1107 paths).
    const expected = record.memorySnapshotHash === undefined ? "" : record.memorySnapshotHash;
    const current = await this.cardFingerprintLocked({ ...record, agent: record.agent }, expected);
    return current === null || current.fingerprint !== record.promptFingerprint;
  }

  /**
   * Caller holds the card lock. A resume reuses the copy nextPlan verified; a fresh
   * first turn materializes the room's selection (D1–D3) and renders the listing.
   */
  private async skillsForSpawnLocked(
    card: HeadlessDispatchCard,
    plan: SpawnPlan,
  ): Promise<CardSkills> {
    if (plan.skills) return plan.skills;
    if (!workerSkillsEnabled(this.deps.config)) return NO_SKILLS;
    if (plan.resumeSessionId) throw new Error("skills copy was not verified before resume");
    const result = await materializeCardSkills({
      ...this.skillsKey(card),
      enabled: true,
      policy: effectiveWorkerPolicy(this.deps.config).effective[card.agent].skills,
      // 0.38.0 D4 · R5: fresh first spawn only — a resume returned the verified copy above (C2).
      ...(this.deps.memory?.cardWrites === true ? { forced: [MEMORY_CANDIDATES_SKILL] } : {}),
    });
    return {
      manifestHash: result.manifestHash,
      pluginDir: card.agent === "claude" && result.available.length > 0 ? result.pluginDir : null,
      listing: renderSkillListing(card.agent, result),
    };
  }

  private cardDir(card: Pick<HeadlessDispatchCard, "roomId" | "agent" | "cardId">): string {
    return dirname(
      cardSessionPath({ loomDir: this.deps.loomDir, localPeerId: this.deps.localPeerId, ...card }),
    );
  }

  private transcriptPath(
    card: Pick<HeadlessDispatchCard, "roomId" | "agent" | "cardId">,
    attempts: number,
  ): string {
    return join(this.cardDir(card), `transcript-${attempts}.jsonl`);
  }

  private async persistSessionId(record: CardSessionRecord, raw: string): Promise<void> {
    const sessionId = parseAgentStream(record.agent, raw).sessionId;
    if (!sessionId) return;
    await this.withCardLock(record, async () => {
      Object.assign(
        record,
        await this.updateRecordLocked(record, (current) => {
          if (!current) throw new Error("missing worker session record");
          if (current.dispatchHandoffId !== record.dispatchHandoffId)
            throw new Error("session record belongs to another handoff");
          return current.sessionId === sessionId ? current : { ...current, sessionId };
        }),
      );
    });
  }

  /** Poll identity, never equating a failed observation with death. */
  private async watchAdopted(
    record: CardSessionRecord,
    owner: CardOwner,
  ): Promise<
    | { kind: "abandon" }
    | { kind: "unknown" }
    | { kind: "group_alive" }
    | { kind: "exited"; timedOut: boolean; raw: string }
  > {
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
        const observation = observeProcess(record);
        const { liveness } = observation;
        if (liveness === "alive") this.verifiedFlights.add(flight);
        else if (liveness === "dead" && !observation.leaderExited)
          this.verifiedFlights.delete(flight);
        await this.persistSessionId(
          record,
          await readTranscript(this.transcriptPath(record, record.attempts)),
        );
        if (liveness === "dead") break;
        if (liveness === "unknown") {
          if (++unknownProbes >= MAX_UNKNOWN_PROBES)
            return { kind: processGroupAlive(record.pgid) ? "group_alive" : "unknown" };
          await sleep(50);
          continue;
        }
        if (Date.now() >= deadline) {
          timedOut = true;
          // Only start the kill when the recorded leader is still that
          // process. Once SIGTERM is sent, reap the group even if the
          // leader exits and a grandchild ignores SIGTERM.
          const confirmed = observeProcess(record);
          if (confirmed.liveness === "dead" && !confirmed.leaderExited)
            this.verifiedFlights.delete(flight);
          if (confirmed.liveness === "unknown") {
            if (++unknownProbes >= MAX_UNKNOWN_PROBES)
              return { kind: processGroupAlive(record.pgid) ? "group_alive" : "unknown" };
            await sleep(50);
            continue;
          }
          if (confirmed.liveness === "alive") {
            this.signalTracked(flight, "SIGTERM");
            await this.reapGroup(record.pgid, flight, owner, Date.now());
          }
          break;
        }
        unknownProbes = 0;
        await sleep(50);
      }
      if (owner.abandoned) return { kind: "abandon" };
      // ESRCH on cold recovery never verifies a saved numeric process group.
      // Only a leader observed alive with matching lstart in this watch does.
      if (processGroupAlive(record.pgid)) {
        if (!this.verifiedFlights.has(flight)) return { kind: "group_alive" };
        await this.reapGroup(record.pgid, flight, owner, Date.now());
      }
      if (owner.abandoned) return { kind: "abandon" };
      if (processGroupAlive(record.pgid)) return { kind: "group_alive" };
      const raw = await readStableTranscript(this.transcriptPath(record, record.attempts));
      return { kind: "exited", timedOut, raw };
    } finally {
      this.verifiedFlights.delete(flight);
      const index = this.active.indexOf(flight);
      if (index >= 0) this.active.splice(index, 1);
    }
  }

  /** Tracking a saved pgid alone does not establish its identity. */
  private signalTracked(flight: HeadlessFlight, signal: "SIGTERM" | "SIGKILL"): void {
    const pgid = flight.pgid ?? 0;
    if (!this.active.includes(flight) || !this.verifiedFlights.has(flight)) return;
    if (!processGroupAlive(pgid)) {
      this.verifiedFlights.delete(flight);
      return;
    }
    if (!killProcessGroup(pgid, signal)) this.verifiedFlights.delete(flight);
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
    if (!this.verifiedFlights.has(flight)) return;
    const killAt = sigtermAt + GROUP_KILL_GRACE_MS;
    while (Date.now() < killAt && !owner.abandoned) {
      if (!processGroupAlive(pgid)) {
        this.verifiedFlights.delete(flight);
        return;
      }
      await sleep(50);
    }
    if (!owner.abandoned && this.active.includes(flight)) {
      this.signalTracked(flight, "SIGKILL");
      const giveUp = Date.now() + 1_000;
      while (Date.now() < giveUp) {
        if (!processGroupAlive(pgid)) {
          this.verifiedFlights.delete(flight);
          return;
        }
        await sleep(30);
      }
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
    let stopTail = (): void => {
      tailStopped = true;
    };
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
      // PLAN 0.40.0 D4 · R6: body lines that fold to the marker are replaced once per spawn;
      // first turn and resume use the same text. The board card and argv keep card.prompt.
      const body = neutralizeCardPrompt(card.prompt);
      if (body.neutralizedLines > 0) {
        process.stderr.write(
          `[headless] card_prompt (${card.cardId.replace(/[\r\n]/g, " ")}): neutralized ${body.neutralizedLines}\n`,
        );
      }
      const wrapped = wrapDispatchedPrompt(body.text);
      // Set under the card lock below (0.31.0 P4: skills decide argv and prompt).
      let firstTurn = wrapped;
      let built: BuiltAgentArgv | undefined;
      let manifestHash = "";
      // D11: "" iff no block was injected (never sha256("")).
      let memorySnapshotHash = "";
      const cwd = plan.cwd;
      const command = this.deps.commands[card.agent];
      const setup = await this.withCardLock<SpawnOutcome | undefined>(card, async () => {
        if (owner.abandoned) {
          if (card.claim) await this.reserveShutdownAfterClaimLocked(card);
          return { kind: "abandon" };
        }
        const previous = await this.readRecord(card);
        if (previous && processGroupAlive(previous.pgid)) {
          return { kind: "group_alive", record: previous };
        }
        // D3: never swap the copy under a live group. A failure here is a setup
        // failure before the write-ahead record (no spawn).
        const skills = await this.skillsForSpawnLocked(card, plan);
        manifestHash = skills.manifestHash;
        // 0.36.0 D2 / R2 · 0.37.0 R10: a fresh first turn (never a resume) builds the fence when
        // memory, rules or an own policy gap is on. None = no reader call, no filesystem access
        // (R54-L1). A throw is a setup failure before the write-ahead record (no spawn).
        const sources = {
          memory: this.deps.memory?.enabled === true,
          rules: this.deps.rules?.enabled === true,
          gaps: (this.deps.policyGaps ?? []).filter((g) => g.agent === card.agent),
        };
        const memoryBlock =
          !plan.resumeSessionId && (sources.memory || sources.rules || sources.gaps.length > 0)
            ? await this.memorySnapshotLocked(card, dir, sources)
            : { block: "", hash: "" };
        // R10: a resume write-ahead carries the hash nextPlan's gate passed (a new record
        // object, so it must be passed explicitly); a first spawn records this snapshot's hash.
        memorySnapshotHash = plan.resumeSessionId
          ? plan.memorySnapshotHash === undefined
            ? ""
            : plan.memorySnapshotHash
          : memoryBlock.hash;
        // R6: the listing precedes the marker, first turn only. D4: the block sits right
        // below the marker; no block = wrapDispatchedPrompt(prompt) exactly.
        firstTurn = composeFirstTurnPrompt(
          skills.listing,
          composeMemoryWrapped(body.text, memoryBlock.block),
        );
        const promptBody = plan.resumeSessionId
          ? `${RESUME_CONTINUATION_MESSAGE}\n\n${wrapped}`
          : firstTurn;
        const promptFile = await this.writeGrokPrompt(card.agent, dir, promptBody);
        built = buildAgentArgv({
          agent: card.agent,
          cwd,
          sessionId: plan.sessionId,
          resumeSessionId: plan.resumeSessionId,
          hint: HEADLESS_WORKER_HINT,
          prompt: card.prompt,
          promptFile,
          permissions: this.deps.config.permissions,
          policy: effectiveWorkerPolicy(this.deps.config).effective[card.agent],
          ...(skills.pluginDir ? { pluginDir: skills.pluginDir } : {}),
        });
        // The skills step awaits; keep close()'s pre-write-ahead reservation exact.
        if (owner.abandoned) {
          if (card.claim) await this.reserveShutdownAfterClaimLocked(card);
          return { kind: "abandon" };
        }
        // Write-ahead: a crash from this point consumes this attempt. There is
        // still a residual orphan window between spawn and the pid write; a
        // spawning record without a pid cannot prove whether exec happened.
        record = await this.updateRecordLocked(card, (current) => ({
          agent: card.agent,
          cwd,
          requestedCwd: card.cwd ?? null,
          sessionId: plan.sessionId,
          promptFingerprint: workerFingerprint(this.deps.config, manifestHash, memorySnapshotHash),
          attempts: plan.attempts,
          pid: 0,
          pgid: 0,
          startedAt: plan.startedAt,
          state: "spawning",
          resultSent: false,
          roomId: card.roomId,
          cardId: card.cardId,
          fromPeerId: card.fromPeerId,
          dispatchHandoffId: card.dispatchHandoffId,
          procStartedAt: "",
          sendAttempts: 0,
          completedHandoffIds: [...(current?.completedHandoffIds ?? plan.completedHandoffIds)],
          // 0.38.0 R9: earlier handoffs' keys carry over (≤16 — sendAndMark trims on append).
          ...(current?.memoryProposed ? { memoryProposed: [...current.memoryProposed] } : {}),
          // R9: "" is never written — an absent key is "" (off = 0.35 session.json bytes).
          ...(memorySnapshotHash !== "" ? { memorySnapshotHash } : {}),
        }));
        if (owner.abandoned) return { kind: "abandon" };
        // Last path check after all setup awaits. Passing the pinned canonical
        // path also avoids following a changed requested symlink in the child.
        // Residual race at the canonical path itself needs fd-relative chdir.
        const checked = resolveWorkerCwd(card.cwd, this.deps.config);
        if (!checked.ok || checked.cwd !== plan.cwd) {
          return { kind: "cwd_denied", changed: true, record };
        }
        if (previous && processGroupAlive(previous.pgid)) {
          // Keep the consumed write-ahead attempt and the identity that blocks it.
          record = await this.updateRecordLocked(card, (current) => ({
            ...current!,
            pid: previous.pid,
            pgid: previous.pgid,
            procStartedAt: previous.procStartedAt,
            state: previous.state,
          }));
          return { kind: "group_alive", record };
        }
        spawned = spawnDetachedWorker({
          bin: command.bin,
          args: [...command.args, ...built!.argv],
          cwd,
          env: scrubWorkerEnv(card.cardId),
          stdoutPath: transcriptPath,
          stderrPath: stderrPath,
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
        this.verifiedFlights.add(tracked);
        // The helper's synchronous branch re-reads and writes before its first
        // await, retaining the no-await spawn -> durable pid/pgid fence.
        record = await this.updateRecordLocked(
          card,
          (current) => ({
            ...current!,
            pid: spawned!.pid,
            pgid: spawned!.pgid,
          }),
          true,
        );
      });
      if (setup) return setup;
      if (!spawned || !record || !flight || !built) {
        throw new Error("worker setup did not complete");
      }
      const argv = built;
      const tracked = flight;
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
      const procStartedAt = await captureLstart(spawned.pid, child);
      record = await this.withCardLock(card, () =>
        this.updateRecordLocked(card, (current) => ({
          ...current!,
          procStartedAt,
          state: "running",
        })),
      );
      const runningRecord = record;
      let wakeTail = (): void => {};
      stopTail = () => {
        tailStopped = true;
        wakeTail();
      };
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
            wakeTail = () => {
              clearTimeout(timer);
              resolve();
            };
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
          argv.promptTransport === "stdin"
            ? argv.continuationMessage
              ? `${argv.continuationMessage}\n\n${wrapped}`
              : firstTurn
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
        timeoutTimer = setTimeout(
          () => {
            if (disarmed || owner.abandoned || !this.active.includes(tracked)) return;
            if (!processGroupAlive(tracked.pgid ?? 0)) {
              this.verifiedFlights.delete(tracked);
              return;
            }
            timedOut = true;
            sigtermAt = Date.now();
            this.signalTracked(tracked, "SIGTERM");
            markTimedOut();
          },
          Math.min(
            2_147_483_647,
            Math.max(
              60_000,
              timeoutMsOf(this.deps.config) - (Date.now() - Date.parse(plan.startedAt)),
            ),
          ),
        );
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
      if (timedOut || processGroupAlive(tracked.pgid ?? 0)) {
        await this.reapGroup(tracked.pgid ?? 0, tracked, owner, sigtermAt || Date.now());
      }
      if (owner.abandoned) {
        detachChild(child);
        return { kind: "abandon" };
      }
      if (processGroupAlive(tracked.pgid ?? 0)) return { kind: "group_alive", record };
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
      await this.persistSessionId(record, raw);
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
      if (flight) this.signalTracked(flight, "SIGKILL");
      const message = err instanceof Error ? err.message : String(err);
      return { kind: "setup_failed", message, record };
    } finally {
      stopTail();
      await tailPromise?.catch(() => {});
      disarmTimeout();
      if (flight) {
        this.verifiedFlights.delete(flight);
        const index = this.active.indexOf(flight);
        if (index >= 0) this.active.splice(index, 1);
      }
    }
  }

  /**
   * Caller holds the card lock; fresh first turn with at least one source on (0.37.0 ② 펜스
   * 스냅샷 단계 ①–⑧). Order: ① memory snapshot ② rules section ③ policy notice ④ compose
   * ⑤ env redaction once over the whole text ⑥ nonce (after the reads) → fence ⑦ > 1 MiB throws
   * ⑧ write. Returns the fence bytes F (also the memory-snapshot.md bytes) and sha256(F), or
   * {"", ""} when the composed text is empty — then a stale memory-snapshot.md is removed
   * (R7 · R54-L1).
   */
  private async memorySnapshotLocked(
    card: HeadlessDispatchCard,
    dir: string,
    sources: { memory: boolean; rules: boolean; gaps: readonly Gap[] },
  ): Promise<{ block: string; hash: string }> {
    const started = performance.now();
    const snap = sources.memory
      ? loadMemorySnapshot(
          this.deps.loomDir,
          agentKeyFor(this.deps.profile ?? "default", card.agent),
          roomKey(card.roomId),
        )
      : null;
    const rules = sources.rules
      ? renderRulesSection(card.agent, loadRules(this.deps.loomDir).rules)
      : null;
    const notice = renderPolicyNotice(sources.gaps);
    const text = composeFenceText(notice, rules?.section ?? "", snap?.text ?? "");
    // R53-L3 · R13 · 0.37.0 R9: env values are redacted outside the readers, once, over the
    // whole composition (notice, rules and memory), with the spawn-time env.
    const redacted = redactSecrets(text, process.env);
    // R5: drawn after the reads, so a store author cannot know it.
    const nonce = (this.deps.memoryNonce ?? defaultMemoryNonce)();
    const { block, neutralizedLines } = renderMemoryBlock(redacted, nonce);
    // 0.37.0 R8: never write a file the resume gate would refuse.
    if (Buffer.byteLength(block, "utf8") > MEMORY_SNAPSHOT_MAX_BYTES) {
      throw new Error(`memory snapshot block exceeds ${MEMORY_SNAPSHOT_MAX_BYTES} bytes`);
    }
    const flags: MemoryInjectFlags = { neutralizedLines, envRedacted: redacted !== text };
    const target = join(dir, MEMORY_SNAPSHOT_FILE);
    const id = card.cardId.replace(/[\r\n]/g, " ");
    const readErrors = snap?.flags.readErrors ?? 0;
    // D9: shown only when set, so the 0.36 lines stay byte-identical.
    const oversize = snap?.flags.entriesOversize === true ? " · entries_oversize yes" : "";
    if (block === "") {
      try {
        await unlink(target);
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
      }
      const ms = Math.round(performance.now() - started);
      const errors = readErrors > 0 ? ` · read_errors ${readErrors}` : "";
      process.stderr.write(
        `[headless] memory_snapshot (${id}): empty — no block${errors}${oversize} · load_ms ${ms}\n`,
      );
      return { block: "", hash: "" };
    }
    // 0.41.0 R5: memory-snapshot.md → `.memory-snapshot.md.tmp.<pid>.<ms>` → rename → 0600.
    await writePrivateFileAtomic(dir, target, block);
    // D2 ⑥ · R8: the hash of the exact file bytes, never snap.hash.
    const hash = createHash("sha256").update(Buffer.from(block, "utf8")).digest("hex");
    const ms = Math.round(performance.now() - started);
    const t = snap?.flags.truncated;
    const truncated =
      (["persona", "index", "guideline", "entries"] as const).filter((k) => t?.[k]).join(",") ||
      "none";
    const noticeField = sources.gaps.length > 0 ? ` · notice ${sources.gaps.length}` : "";
    const rulesField = rules ? ` · rules ${rules.included}/${rules.eligible}` : "";
    process.stderr.write(
      `[headless] memory_snapshot (${id}): block ${Buffer.byteLength(block, "utf8")} B · text ${Buffer.byteLength(text, "utf8")} B${noticeField}${rulesField} · neutralized ${flags.neutralizedLines} · env_redacted ${flags.envRedacted ? "yes" : "no"} · read_errors ${readErrors}${oversize} · truncated ${truncated} · load_ms ${ms}\n`,
    );
    return { block, hash };
  }

  private async writeGrokPrompt(
    agent: AgentKind,
    dir: string,
    wrapped: string,
  ): Promise<string | undefined> {
    if (agent !== "grok") return undefined;
    const promptFile = join(dir, "prompt.txt");
    await writeFile(promptFile, wrapped, { encoding: "utf8", mode: 0o600 });
    await chmod(promptFile, 0o600);
    return promptFile;
  }
}
