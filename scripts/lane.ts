/**
 * Architect tool: run one headless lane (impl / advise / verify) with every
 * model / effort / permission pin fixed in argv + env, record evidence in a
 * run dir, and map the outcome to a distinct exit code.
 *
 * Design: docs/spikes/HEADLESS-LANES-DESIGN.md §4–§6 (P1).
 *
 * Exit reasons (precedence when several apply: 3 > 2 > 1 > 4 > 5 > 6 > 0):
 *   0 ok             — child exit 0 · main model == pin · no denials · (impl) non-empty diff
 *   1 process-error  — child non-zero / unparsable output / spawn failure / arg error / lock busy
 *   2 limit          — usage / auth / rate-limit signal (watch-card LIMIT_SIGNALS) on a failed child
 *   3 timeout        — --timeout exhausted; child process group killed
 *   4 model-mismatch — mainModel ≠ pinnedModel (aux small models alone do not trip it)
 *   5 denied         — permission_denials non-empty (claude lanes)
 *   6 refused-empty  — impl finished with an unchanged working tree
 *
 * Never collapse a non-zero reason into 0. The wrapper never prints a verdict;
 * the summary line is not evidence (design §5.1).
 *
 * Usage:
 *   bun run scripts/lane.ts <impl|advise|verify> --spec <file>
 *       [--cwd <dir>] [--timeout <s>] [--sandbox read-only|workspace-write] [--parallel]
 *
 * Env:
 *   LOOM_LANE_RUNS_DIR   run-dir root (default <repo>/.loom-lanes)
 */

import { dlopen, FFIType } from "bun:ffi";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  copyFileSync,
  existsSync,
  fstatSync,
  ftruncateSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  statSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve as resolvePath, sep } from "node:path";
import { detectLimitSignal } from "./watch-card.ts";

// ─── Types / constants ───────────────────────────────────────────────────────

export type Lane = "impl" | "advise" | "verify";

export type ExitReason =
  | "ok"
  | "process-error"
  | "limit"
  | "timeout"
  | "model-mismatch"
  | "denied"
  | "refused-empty";

export const EXIT: Record<ExitReason, 0 | 1 | 2 | 3 | 4 | 5 | 6> = {
  ok: 0,
  "process-error": 1,
  limit: 2,
  timeout: 3,
  "model-mismatch": 4,
  denied: 5,
  "refused-empty": 6,
};

export const PINS = {
  claudeModel: "claude-opus-5-5",
  codexModel: "gpt-6-astra",
  effort: { impl: "medium", advise: "high", verify: "high" },
} as const satisfies {
  claudeModel: "claude-opus-5-5";
  codexModel: "gpt-6-astra";
  effort: { impl: "medium"; advise: "high"; verify: "high" };
};

/** Design §6.1 — exact forms. */
export const IMPL_ALLOWED_TOOLS: readonly string[] = [
  "Bash(bun run test:lane *)",
  "Bash(bun run typecheck:*)",
  "Bash(bunx biome:*)",
  "Bash(bun run handoff:check)",
  "Bash(git diff:*)",
  "Bash(git status:*)",
  "Bash(git log:*)",
  "Bash(git rm:*)",
  "Bash(rm:*)",
  "Read",
  "Grep",
  "Glob",
  "Edit",
  "Write",
] as const;

/** Design §6.2. */
export const IMPL_DISALLOWED_TOOLS: readonly string[] = [
  "Agent",
  "Task",
  "Workflow",
  "Bash(git commit:*)",
  "Bash(git push:*)",
  "Bash(git stash:*)",
  "Bash(git reset:*)",
  "Bash(git checkout:*)",
  "Bash(git commit --amend:*)",
  "Bash(launchctl:*)",
  "Bash(systemctl:*)",
  "Bash(ssh:*)",
  "Bash(scp:*)",
  "Bash(*--real-cli*)",
  "Bash(*smoke:service --live*)",
] as const;

/** Design §4.2 / §6.3. */
export const ADVISE_DISALLOWED_TOOLS: readonly string[] = [
  "Bash",
  "Edit",
  "Write",
  "NotebookEdit",
  "Agent",
  "Task",
  "Workflow",
] as const;

const STRIPPED_ENV = ["LOOM_RELAY_TOKEN", "LOOM_RELAY_URL", "CLAUDECODE"] as const;

/**
 * Keys never inherited by a lane child: bridge relay creds and every host
 * Claude Code session key (`CLAUDE_CODE_*`, `CLAUDECODE`). Claude lanes get
 * only the wrapper's own CLAUDE_CODE_* pins, set after this filter.
 */
export function isStrippedEnvKey(k: string): boolean {
  return (STRIPPED_ENV as readonly string[]).includes(k) || k.startsWith("CLAUDE_CODE_");
}
const DEFAULT_TIMEOUT_S = 1800;
const KILL_GRACE_MS = 5000;
const GROUP_POLL_MS = 100;

const REPO_ROOT = resolvePath(import.meta.dir, "..");

// ─── Preamble (design §4.7; verify text = architect ruling) ─────────────────────────────────────────

const IMPL_PREAMBLE_TAIL = [
  'Ignore any global "architect / delegate / orchestrate"',
  "instruction, the session-start ritual, and Template R.",
  "Do not commit, push, stash, reset, checkout or amend. Do not use the board, room, or Loom MCP.",
  "Do not spawn agents or other CLIs. Run only the verification commands the spec names, in the",
  "exact form given. If a command is denied, stop and report the denial; do not work around it.",
  "Run each command alone: never append `; echo`, `&&`, `||`, pipes or `$?` — the tool result already shows the exit code.",
  "Write files only with the Edit/Write tools — never with shell redirection, heredocs or `tee`.",
  "End with: files changed, commands run with exit codes, anything left undone.",
];

export function lanePreamble(lane: Lane): string {
  if (lane === "impl") {
    return [
      "LOOM LANE: impl. You are an implementation lane, not the architect.",
      `Implement the spec below directly. ${IMPL_PREAMBLE_TAIL[0]}`,
      ...IMPL_PREAMBLE_TAIL.slice(1),
    ].join("\n");
  }
  if (lane === "verify") {
    return [
      "LOOM LANE: verify. You are an independent verifier, not the implementer.",
      "Verify the spec below against the working tree; report findings, do not fix them.",
      'Ignore any global "architect / delegate / orchestrate" instruction, the session-start ritual, and Template R.',
      "Do not commit, push, stash, reset, checkout or amend. Do not use the board, room, or Loom MCP.",
      "Do not spawn agents or other CLIs. If a command is denied, stop and report the denial.",
      "Do not use here-documents, process substitution or temp files (the sandbox denies them); use git, rg/grep, sed and cat.",
      "Harmless sandbox warnings on stderr (e.g. git's `xcrun_db ... Operation not permitted`) are not denials — continue; stop only when a command itself fails.",
      "End with: verdict (PASS / PASS-with-lows / FAIL), then findings ranked by severity with file:line.",
    ].join("\n");
  }
  return [
    "LOOM LANE: advise. You are a read-only advisor lane, not the architect.",
    "Read the decision or diff below and return a verdict in the vocabulary of the advisor prompt",
    "(final review: ship / fix-first / rethink · R{n}: approve / pending-revision / on-hold), the",
    "reasoning, and the single deciding risk. Do not edit files, run commands, spawn agents,",
    "or use the board, room, or Loom MCP. Ignore the session-start ritual and Template R.",
  ].join("\n");
}

// ─── Invocation ──────────────────────────────────────────────────────────────

export type Invocation = { cmd: string; args: string[]; env: Record<string, string> };

export function buildInvocation(
  lane: Lane,
  o: {
    prompt: string;
    systemAppend?: string;
    cwd: string;
    sandbox: "read-only" | "workspace-write";
    baseEnv: Record<string, string | undefined>;
  },
): Invocation {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(o.baseEnv)) {
    if (v === undefined) continue;
    if (isStrippedEnvKey(k)) continue;
    env[k] = v;
  }
  env.LOOM_LANE = lane;

  if (lane === "verify") {
    return {
      cmd: "codex",
      args: [
        "exec",
        "-m",
        PINS.codexModel,
        "-c",
        `model_reasoning_effort=${PINS.effort.verify}`,
        "-s",
        o.sandbox,
        "-C",
        o.cwd,
        "--skip-git-repo-check",
        `${lanePreamble("verify")}\n\n${o.prompt}`,
      ],
      env,
    };
  }

  env.CLAUDE_CODE_EFFORT_LEVEL = PINS.effort[lane];
  env.CLAUDE_CODE_SUBAGENT_MODEL = PINS.claudeModel;
  env.CLAUDE_CODE_SUBAGENT_MODEL_FORCE = "1";

  if (lane === "impl") {
    return {
      cmd: "claude",
      args: [
        "-p",
        o.prompt,
        "--model",
        PINS.claudeModel,
        "--output-format",
        "json",
        "--permission-mode",
        "acceptEdits",
        "--append-system-prompt",
        lanePreamble("impl"),
        "--allowedTools",
        ...IMPL_ALLOWED_TOOLS,
        "--disallowedTools",
        ...IMPL_DISALLOWED_TOOLS,
      ],
      env,
    };
  }

  const system = o.systemAppend
    ? `${o.systemAppend}\n\n${lanePreamble("advise")}`
    : lanePreamble("advise");
  return {
    cmd: "claude",
    args: [
      "-p",
      o.prompt,
      "--model",
      PINS.claudeModel,
      "--output-format",
      "json",
      "--append-system-prompt",
      system,
      "--disallowedTools",
      ...ADVISE_DISALLOWED_TOOLS,
    ],
    env,
  };
}

// ─── Output parsing ──────────────────────────────────────────────────────────

export type ClaudeResult = {
  ok: boolean;
  isError: boolean;
  mainModel: string | null;
  resolvedModels: string[];
  permissionDenials: unknown[];
  costUsd: number | null;
};

function parseJsonObject(stdout: string): Record<string, unknown> | null {
  const tryParse = (s: string): Record<string, unknown> | null => {
    try {
      const v = JSON.parse(s) as unknown;
      return v && typeof v === "object" && !Array.isArray(v)
        ? (v as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  };
  const whole = tryParse(stdout);
  if (whole) return whole;
  const lines = stdout.split("\n").filter((l) => l.trim() !== "");
  const last = lines[lines.length - 1];
  return last === undefined ? null : tryParse(last);
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function parseClaudeResult(stdout: string): ClaudeResult | null {
  const obj = parseJsonObject(stdout);
  if (!obj) return null;
  const isError = obj.is_error === true;
  const usage =
    obj.modelUsage && typeof obj.modelUsage === "object" && !Array.isArray(obj.modelUsage)
      ? (obj.modelUsage as Record<string, unknown>)
      : {};
  const resolvedModels = Object.keys(usage);
  let mainModel: string | null = null;
  let bestCost = Number.NEGATIVE_INFINITY;
  let bestTokens = Number.NEGATIVE_INFINITY;
  for (const key of resolvedModels) {
    const u = (usage[key] && typeof usage[key] === "object" ? usage[key] : {}) as Record<
      string,
      unknown
    >;
    const cost = num(u.costUSD) ?? Number.NEGATIVE_INFINITY;
    const tokens = (num(u.inputTokens) ?? 0) + (num(u.outputTokens) ?? 0);
    if (mainModel === null || cost > bestCost || (cost === bestCost && tokens > bestTokens)) {
      mainModel = key;
      bestCost = cost;
      bestTokens = tokens;
    }
  }
  const permissionDenials = Array.isArray(obj.permission_denials) ? obj.permission_denials : [];
  return {
    ok: !isError,
    isError,
    mainModel,
    resolvedModels,
    permissionDenials,
    costUsd: num(obj.total_cost_usd),
  };
}

/** The claude JSON `result` string, if any (limit-signal scan input). */
function claudeResultText(stdout: string): string {
  const obj = parseJsonObject(stdout);
  return obj && typeof obj.result === "string" ? obj.result : "";
}

const CODEX_HEADER_DELIM = "--------";

/** The only line real codex (0.163) prints before its banner. */
const CODEX_STDIN_NOTICE = "Reading additional input from stdin...";

/**
 * Codex model evidence — child **stderr only**, header block only. Only known
 * preamble shapes are accepted: the `OpenAI Codex` banner is stderr line 0, or
 * line 1 when line 0 is exactly `Reading additional input from stdin...`. The
 * line immediately after the banner must be exactly `--------`, and the header
 * block is the lines up to the next `--------`. Lines outside the block and all
 * of stdout are ignored; any other shape → nulls.
 */
export function parseCodexHeader(stderr: string): { model: string | null; effort: string | null } {
  const lines = stderr.split("\n").map((l) => l.replace(/\r$/, ""));
  const none = { model: null, effort: null };
  const isBanner = (l: string | undefined) => l?.startsWith("OpenAI Codex") === true;
  const banner = isBanner(lines[0])
    ? 0
    : lines[0] === CODEX_STDIN_NOTICE && isBanner(lines[1])
      ? 1
      : -1;
  if (banner < 0) return none;
  const open = banner + 1;
  if (lines[open] !== CODEX_HEADER_DELIM) return none;
  const close = lines.findIndex((l, i) => i > open && l === CODEX_HEADER_DELIM);
  if (close < 0) return none;
  const block = lines.slice(open + 1, close).join("\n");
  const model = /^model:\s*(\S+)/m.exec(block);
  const effort = /^reasoning effort:\s*(\S+)/m.exec(block);
  return { model: model ? model[1]! : null, effort: effort ? effort[1]! : null };
}

// ─── Classification ──────────────────────────────────────────────────────────

export function classify(i: {
  timedOut: boolean;
  childExit: number | null;
  limitSignal: boolean;
  parsedOk: boolean;
  mainModel: string | null;
  pinnedModel: string;
  denials: number;
  diffEmpty: boolean | null;
  lane: Lane;
  /** verify: header `reasoning effort` ≠ pinned effort (effort is part of the pin). */
  effortMismatch?: boolean;
}): ExitReason {
  if (i.timedOut) return "timeout";
  if (i.limitSignal) return "limit";
  if (i.childExit !== 0 || !i.parsedOk) return "process-error";
  if (i.mainModel !== i.pinnedModel || i.effortMismatch === true) return "model-mismatch";
  if (i.denials > 0) return "denied";
  if (i.lane === "impl" && i.diffEmpty === true) return "refused-empty";
  return "ok";
}

// ─── Args ────────────────────────────────────────────────────────────────────

export type LaneArgs = {
  lane: Lane;
  spec: string;
  cwd: string;
  timeoutS: number;
  sandbox: "read-only" | "workspace-write";
  parallel: boolean;
};

export class ArgError extends Error {}

function isInside(child: string, parent: string): boolean {
  return child === parent || child.startsWith(parent.endsWith(sep) ? parent : parent + sep);
}

export function isHeavy(a: Pick<LaneArgs, "lane" | "sandbox">): boolean {
  return a.lane === "impl" || (a.lane === "verify" && a.sandbox === "workspace-write");
}

export function parseLaneArgs(argv: string[]): LaneArgs {
  const [lane, ...rest] = argv;
  if (lane !== "impl" && lane !== "advise" && lane !== "verify") {
    throw new ArgError(`first argument must be impl|advise|verify (got ${lane ?? "nothing"})`);
  }
  let spec: string | undefined;
  let cwd: string | undefined;
  let timeoutS = DEFAULT_TIMEOUT_S;
  let sandbox: LaneArgs["sandbox"] | undefined;
  let parallel = false;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    const val = (): string => {
      const v = rest[++i];
      if (v === undefined) throw new ArgError(`${a} requires a value`);
      return v;
    };
    if (a === "--spec") spec = val();
    else if (a === "--cwd") cwd = val();
    else if (a === "--timeout") {
      const raw = val();
      timeoutS = Number(raw);
      if (!Number.isFinite(timeoutS) || timeoutS <= 0) {
        throw new ArgError(`--timeout must be a positive number of seconds (got ${raw})`);
      }
    } else if (a === "--sandbox") {
      const v = val();
      if (v !== "read-only" && v !== "workspace-write") {
        throw new ArgError(`--sandbox must be read-only|workspace-write (got ${v})`);
      }
      sandbox = v;
    } else if (a === "--parallel") parallel = true;
    else throw new ArgError(`unknown argument: ${a}`);
  }
  if (!spec) throw new ArgError("--spec <file> is required");
  if (!existsSync(spec)) throw new ArgError(`--spec file not found: ${spec}`);
  if (sandbox !== undefined && lane !== "verify") {
    throw new ArgError("--sandbox is only valid for the verify lane");
  }
  const repoReal = realpathSync(REPO_ROOT);
  let cwdReal: string;
  try {
    cwdReal = realpathSync(resolvePath(cwd ?? REPO_ROOT));
  } catch {
    throw new ArgError(`--cwd does not exist: ${cwd}`);
  }
  const tmpReal = realpathSync(tmpdir());
  if (!isInside(cwdReal, repoReal) && !isInside(cwdReal, tmpReal)) {
    throw new ArgError(`--cwd must be inside the repo (${repoReal}) or ${tmpReal}: ${cwdReal}`);
  }
  const out: LaneArgs = {
    lane,
    spec,
    cwd: cwdReal,
    timeoutS,
    sandbox: sandbox ?? "read-only",
    parallel,
  };
  if (parallel && isHeavy(out)) {
    throw new ArgError(`--parallel is not allowed on a heavy lane (${lane})`);
  }
  return out;
}

// ─── Prompt assembly ─────────────────────────────────────────────────────────

/** Bullets of the `## 활성 함정` section of traps.md (null if missing). */
export function extractTrapsBullets(text: string): string | null {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.startsWith("## 활성 함정"));
  if (start < 0) return null;
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i]!;
    if (l.startsWith("## ")) break;
    if (l.startsWith("- ")) out.push(l);
  }
  return out.join("\n");
}

/** The HANDOFF line starting with `**Must not:**` (null if missing). */
export function extractMustNot(text: string): string | null {
  return text.split("\n").find((l) => l.startsWith("**Must not:**")) ?? null;
}

/** Agent file body after the closing `---` of the frontmatter (null if missing). */
export function stripFrontmatter(text: string): string | null {
  const lines = text.split("\n");
  if (lines[0]?.trim() !== "---") return null;
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
  if (end < 0) return null;
  return lines
    .slice(end + 1)
    .join("\n")
    .trim();
}

function readOrNull(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

export function assemblePrompt(
  specText: string,
  repoRoot: string,
  warn: (line: string) => void,
): string {
  const trapsText = readOrNull(join(repoRoot, "tasks/traps.md"));
  const traps = trapsText === null ? null : extractTrapsBullets(trapsText);
  if (traps === null) warn("warning: tasks/traps.md `## 활성 함정` section missing — not inlined");
  const handoffText = readOrNull(join(repoRoot, "HANDOFF.md"));
  const mustNot = handoffText === null ? null : extractMustNot(handoffText);
  if (mustNot === null) warn("warning: HANDOFF.md `**Must not:**` line missing — not inlined");
  return `${specText}\n\n## Repo traps (inlined)\n${traps ?? ""}\n\n## Must not (HANDOFF)\n${mustNot ?? ""}`;
}

// ─── Run dir / lock ──────────────────────────────────────────────────────────

export function runsRoot(env: Record<string, string | undefined> = process.env): string {
  return env.LOOM_LANE_RUNS_DIR
    ? resolvePath(env.LOOM_LANE_RUNS_DIR)
    : join(REPO_ROOT, ".loom-lanes");
}

function nextRunDir(root: string, lane: Lane): string {
  let max = 0;
  for (const name of readdirSync(root)) {
    const m = /^(\d{4,})-/.exec(name);
    if (m) max = Math.max(max, Number(m[1]));
  }
  for (let seq = max + 1; ; seq++) {
    const dir = join(root, `${String(seq).padStart(4, "0")}-${lane}`);
    try {
      mkdirSync(dir);
      return dir;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
  }
}

// Kernel lock (design §4.6, TLC-verified): ownership = flock on the open file
// description, never the file content. No stale state, no reclaim code; the
// file is never unlinked, renamed or overwritten by a content decision.

const LOCK_EX = 2;
const LOCK_NB = 4;
const LOCK_UN = 8;

type FlockFn = (fd: number, op: number) => number;
let flockFn: FlockFn | null = null;

/** Load libc `flock` via bun:ffi. Throws on unsupported platform / FFI failure. */
function loadFlock(): FlockFn {
  if (flockFn) return flockFn;
  const lib =
    process.platform === "darwin"
      ? "libc.dylib"
      : process.platform === "linux"
        ? "libc.so.6"
        : null;
  if (!lib) throw new Error(`unsupported platform ${process.platform}`);
  const { symbols } = dlopen(lib, {
    flock: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 },
  });
  flockFn = symbols.flock as FlockFn;
  return flockFn;
}

/** Module-scope reference: the held lock fd stays open (and referenced) for the whole run. */
let heldLockFd: number | null = null;

/**
 * Acquire `<root>/heavy.lock` (flock LOCK_EX|LOCK_NB). Returns null on success,
 * or the `[lane] …` stderr text for a fail-fast exit 1.
 */
export function acquireHeavyLock(lockPath: string): string | null {
  let flock: FlockFn;
  try {
    flock = loadFlock();
  } catch {
    return "[lane] lock unavailable";
  }
  let fd: number;
  try {
    fd = openSync(lockPath, "a"); // O_CLOEXEC by default — children never inherit it
  } catch (e) {
    return `[lane] lock unavailable: ${e instanceof Error ? e.message : String(e)}`;
  }
  if (flock(fd, LOCK_EX | LOCK_NB) !== 0) {
    closeSync(fd);
    const diag = readOrNull(lockPath)?.trim();
    return `[lane] another heavy lane holds the lock (${lockPath})${diag ? `\n[lane] lock holder (diagnostic): ${diag}` : ""}`;
  }
  let sameInode = false;
  try {
    sameInode = fstatSync(fd).ino === statSync(lockPath).ino;
  } catch {
    sameInode = false;
  }
  if (!sameInode) {
    flock(fd, LOCK_UN);
    closeSync(fd);
    return "[lane] lock file replaced";
  }
  heldLockFd = fd;
  // Diagnostics only — never read to decide anything.
  ftruncateSync(fd, 0);
  writeSync(fd, `pid=${process.pid} started=${new Date().toISOString()}\n`);
  return null;
}

/** Release = LOCK_UN + close. Never unlinks the file. */
export function releaseHeavyLock(): void {
  const fd = heldLockFd;
  if (fd === null) return;
  heldLockFd = null;
  try {
    flockFn?.(fd, LOCK_UN);
  } finally {
    closeSync(fd);
  }
}

// ─── Diff snapshot ───────────────────────────────────────────────────────────

const GIT_SPAWN = { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] } as const;

/** impl precondition: `git -C <cwd> rev-parse --is-inside-work-tree` prints `true` (any error → false). */
export function isGitWorkTree(cwd: string): boolean {
  const r = spawnSync("git", ["-C", cwd, "rev-parse", "--is-inside-work-tree"], GIT_SPAWN);
  return !r.error && r.status === 0 && (r.stdout ?? "").trim() === "true";
}

export type Snapshot = { ok: true; text: string } | { ok: false; cmd: string };

/**
 * Working-tree change set, four parts: `status --porcelain=v1 -uall` + `diff` + `diff --cached` +
 * one line per untracked entry (`ls-files --others --exclude-standard -z`), described from
 * `lstat` and never followed: symlink → `<path>\tlink\t<target>`; regular file →
 * `<path>\tfile\t<mode>\t<size>\t<sha256>` (`big:<mtimeMs>` instead of a hash above
 * MAX_HASH_BYTES); anything else → `<path>\t<kind>\t<mode>`, never opened (a FIFO would block
 * forever, and the snapshot runs outside the child timeout); lstat/readlink failure →
 * `<path>\t<unreadable>`. The descriptions exist because P4 0015 edited files that were already
 * untracked — status/diff text stayed identical and real work read as refused-empty; mode and
 * link target are included so chmod and retargets register too. Residual: a regular file
 * swapped for a FIFO between lstat and read (TOCTOU) is accepted. Any git command failure →
 * ok:false.
 */
export function gitSnapshot(cwd: string): Snapshot {
  const cmds = [
    ["-C", cwd, "status", "--porcelain=v1", "-uall"],
    ["-C", cwd, "diff"],
    ["-C", cwd, "diff", "--cached"],
    ["-C", cwd, "ls-files", "--others", "--exclude-standard", "-z"],
  ];
  const outs: string[] = [];
  for (const c of cmds) {
    const r = spawnSync("git", c, GIT_SPAWN);
    if (r.error || r.status !== 0) return { ok: false, cmd: `git ${c.join(" ")}` };
    outs.push(r.stdout ?? "");
  }
  const untracked = (outs.pop() ?? "")
    .split("\0")
    .filter((p) => p !== "")
    .map((p) => describeUntracked(cwd, p));
  outs.push(untracked.join("\n"));
  return { ok: true, text: outs.join("\n--diff--\n") };
}

/** Regular files above this size are described by mtime instead of being read and hashed. */
const MAX_HASH_BYTES = 16 * 1024 * 1024;

function describeUntracked(cwd: string, p: string): string {
  const full = join(cwd, p);
  try {
    const st = lstatSync(full);
    const mode = (st.mode & 0o7777).toString(8);
    if (st.isSymbolicLink()) return `${p}\tlink\t${readlinkSync(full)}`;
    if (st.isFile()) {
      const hash =
        st.size <= MAX_HASH_BYTES
          ? createHash("sha256").update(readFileSync(full)).digest("hex")
          : `big:${st.mtimeMs}`;
      return `${p}\tfile\t${mode}\t${st.size}\t${hash}`;
    }
    const kind = st.isDirectory()
      ? "dir"
      : st.isFIFO()
        ? "fifo"
        : st.isSocket()
          ? "socket"
          : st.isCharacterDevice()
            ? "char"
            : st.isBlockDevice()
              ? "block"
              : "other";
    return `${p}\t${kind}\t${mode}`;
  } catch {
    return `${p}\t<unreadable>`;
  }
}

// ─── Child run ───────────────────────────────────────────────────────────────

type ChildOutcome = {
  stdout: string;
  stderr: string;
  childExit: number | null;
  timedOut: boolean;
  spawnError: string | null;
  /** Wrapper received SIGINT/SIGTERM (child group was escalated). */
  interrupted: NodeJS.Signals | null;
};

/** Wrapper-signal relay: the active child registers `hook`; earlier signals park in `pending`. */
type SignalCtl = { hook: ((sig: NodeJS.Signals) => void) | null; pending: NodeJS.Signals | null };

/**
 * Spawn the child detached (own process group), stdin /dev/null.
 *
 * No orphans:
 *   - timeout / wrapper signal → SIGTERM the group, then poll the group every
 *     100 ms during the grace; when the grace expires with the group still
 *     present, SIGKILL it (even if the direct child already closed). If the
 *     group is gone (ESRCH) the pending SIGKILL is cancelled and nothing more
 *     is sent. The outcome resolves only after the group is gone or killed.
 *   - normal child exit → SIGKILL the group (if still present) to reap stray
 *     descendants.
 *
 * PGID reuse: POSIX (XBD "Process ID Reuse") — a process group ID is not
 * reused by the system until the process group lifetime ends, i.e. while the
 * group has any member. So the only window in which our
 * numeric PGID could name someone else's group is after our group became
 * empty; every signal is therefore preceded by a `kill(-pgid, 0)` probe and
 * skipped on ESRCH/EPERM.
 *
 * Accepted residual (Low, architect ruling): `kill(-pgid, 0)` proves the group
 * *exists*, not that it is *ours*. If our group empties between two probes and
 * the kernel hands that exact number to a new group before the next probe /
 * kill, we would signal a stranger. That requires the PID space to wrap around
 * to that exact value within one poll interval (~100 ms) — not realistic with
 * sequential PID allocation on darwin/linux dev hosts. Closing it fully needs a
 * group-anchor process (a member we own that keeps the group alive until we
 * finish signalling); deferred as disproportionate.
 * Synchronous spawn errors (e.g. E2BIG) reject the promise.
 */
function runChild(
  inv: Invocation,
  cwd: string,
  timeoutMs: number,
  ctl: SignalCtl,
): Promise<ChildOutcome> {
  return new Promise((resolveP, rejectP) => {
    if (ctl.pending) {
      resolveP({
        stdout: "",
        stderr: "",
        childExit: null,
        timedOut: false,
        spawnError: null,
        interrupted: ctl.pending,
      });
      return;
    }
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let interrupted: NodeJS.Signals | null = null;
    let spawnError: string | null = null;
    let closed = false;
    let closeCode: number | null = null;
    let escalating = false;
    let graceDone = false;
    let settled = false;
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(inv.cmd, inv.args, {
        cwd,
        env: inv.env,
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (e) {
      rejectP(e);
      return;
    }
    /** Group still present and ours? (ESRCH = empty/gone; EPERM = not ours → treat as gone.) */
    const groupAlive = (): boolean => {
      if (child.pid === undefined) return false;
      try {
        process.kill(-child.pid, 0);
        return true;
      } catch {
        return false;
      }
    };
    /** Probe-then-signal; never signals a PGID whose group is already empty. */
    const killGroup = (sig: NodeJS.Signals) => {
      if (child.pid === undefined || !groupAlive()) return;
      try {
        process.kill(-child.pid, sig);
      } catch {
        // ESRCH — emptied between probe and kill
      }
    };
    const tryFinish = () => {
      if (settled || !closed || (escalating && !graceDone)) return;
      settled = true;
      clearTimeout(timer);
      ctl.hook = null;
      resolveP({ stdout, stderr, childExit: closeCode, timedOut, spawnError, interrupted });
    };
    const escalate = () => {
      if (escalating) return;
      escalating = true;
      killGroup("SIGTERM");
      const deadline = Date.now() + KILL_GRACE_MS;
      const poll = setInterval(() => {
        if (!groupAlive()) {
          // Group gone: cancel the pending SIGKILL; send nothing further.
          clearInterval(poll);
          graceDone = true;
          tryFinish();
          return;
        }
        if (Date.now() >= deadline) {
          clearInterval(poll);
          killGroup("SIGKILL");
          graceDone = true;
          tryFinish();
        }
      }, GROUP_POLL_MS);
    };
    const timer = setTimeout(() => {
      if (closed) return;
      timedOut = true;
      escalate();
    }, timeoutMs);
    ctl.hook = (sig) => {
      if (interrupted) return;
      interrupted = sig;
      escalate();
    };
    child.stdout?.on("data", (d: Buffer) => {
      stdout += d.toString("utf8");
    });
    child.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString("utf8");
    });
    child.on("exit", () => {
      // Reap stray descendants (they may also hold our pipes open).
      if (!escalating) killGroup("SIGKILL");
    });
    child.on("error", (e) => {
      spawnError = e.message;
      if (child.pid === undefined) {
        closed = true;
        tryFinish();
      }
    });
    child.on("close", (code) => {
      closed = true;
      closeCode = code;
      if (!escalating) killGroup("SIGKILL");
      tryFinish();
    });
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

export type Meta = {
  lane: Lane;
  pinnedModel: string;
  resolvedModels: string[];
  mainModel: string | null;
  effort: "medium" | "high";
  /** verify: `reasoning effort` from the codex header; null for claude lanes / no header. */
  effortResolved: string | null;
  permissionDenials: unknown[] | null;
  diffEmpty: boolean | null;
  exit: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  exitReason: ExitReason;
  durationMs: number;
  costUsd: number | null;
};

/** Max total bytes of argv + env entries before spawning (ARG_MAX headroom). */
export const MAX_SPAWN_BYTES = 900_000;

export function spawnBytes(inv: Invocation): number {
  let n = Buffer.byteLength(inv.cmd) + 1;
  for (const a of inv.args) n += Buffer.byteLength(a) + 1;
  for (const [k, v] of Object.entries(inv.env)) n += Buffer.byteLength(`${k}=${v}`) + 1;
  return n;
}

export async function runLane(argv: string[]): Promise<number> {
  let args: LaneArgs;
  try {
    args = parseLaneArgs(argv);
  } catch (e) {
    console.error(`[lane] ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
  if (args.lane === "impl" && !isGitWorkTree(args.cwd)) {
    console.error("[lane] impl requires a git work tree");
    return 1;
  }
  // Listeners are installed only here and removed in the finally below, so
  // every return path from runLane leaves zero lane-installed listeners.
  const ctl: SignalCtl = { hook: null, pending: null };
  const onSignal = (sig: NodeJS.Signals) => {
    if (ctl.hook) ctl.hook(sig);
    else ctl.pending ??= sig;
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  const heavy = isHeavy(args);
  const root = runsRoot();
  const lockPath = join(root, "heavy.lock");
  try {
    mkdirSync(root, { recursive: true });
    if (heavy) {
      const err = acquireHeavyLock(lockPath);
      if (err !== null) {
        console.error(err);
        return 1;
      }
    }
    return await runLocked(args, root, ctl);
  } finally {
    releaseHeavyLock();
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
  }
}

async function runLocked(args: LaneArgs, root: string, ctl: SignalCtl): Promise<number> {
  const started = Date.now();
  const dir = nextRunDir(root, args.lane);
  const wrapperErr: string[] = [];
  const warn = (l: string) => wrapperErr.push(l);
  const isClaude = args.lane !== "verify";
  const pinnedModel = isClaude ? PINS.claudeModel : PINS.codexModel;

  const writeStreams = (stdout: string, childStderr: string) => {
    writeFileSync(join(dir, "stdout"), stdout);
    writeFileSync(
      join(dir, "stderr"),
      (wrapperErr.length ? `${wrapperErr.map((l) => `[lane] ${l}`).join("\n")}\n` : "") +
        childStderr,
    );
  };
  const finalize = (m: Omit<Meta, "lane" | "pinnedModel" | "effort" | "exit" | "durationMs">) => {
    const exit = EXIT[m.exitReason];
    const meta: Meta = {
      lane: args.lane,
      pinnedModel,
      resolvedModels: m.resolvedModels,
      mainModel: m.mainModel,
      effort: PINS.effort[args.lane],
      effortResolved: m.effortResolved,
      permissionDenials: m.permissionDenials,
      diffEmpty: m.diffEmpty,
      exit,
      exitReason: m.exitReason,
      durationMs: Date.now() - started,
      costUsd: m.costUsd,
    };
    writeFileSync(join(dir, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
    const denials = m.permissionDenials === null ? "null" : String(m.permissionDenials.length);
    console.log(
      `lane=${args.lane} exit=${exit} reason=${m.exitReason} mainModel=${m.mainModel ?? "null"} denials=${denials} dir=${dir}`,
    );
    return exit;
  };
  /** Evidence on every pre-spawn / spawn failure. */
  const fail = (line: string): number => {
    wrapperErr.push(line);
    writeStreams("", "");
    return finalize({
      resolvedModels: [],
      mainModel: null,
      effortResolved: null,
      permissionDenials: null,
      diffEmpty: null,
      exitReason: "process-error",
      costUsd: null,
    });
  };
  const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

  let inv: Invocation;
  try {
    copyFileSync(args.spec, join(dir, "spec.md"));
    const specText = readFileSync(args.spec, "utf8");
    const prompt = assemblePrompt(specText, REPO_ROOT, warn);

    let systemAppend: string | undefined;
    if (args.lane === "advise") {
      const agent = readOrNull(join(REPO_ROOT, ".claude/agents/loom-advisor.md"));
      const body = agent === null ? null : stripFrontmatter(agent);
      if (body === null)
        warn("warning: .claude/agents/loom-advisor.md body missing — not appended");
      else systemAppend = body;
    }

    inv = buildInvocation(args.lane, {
      prompt,
      systemAppend,
      cwd: args.cwd,
      sandbox: args.sandbox,
      baseEnv: process.env,
    });

    // argv.json — prompt / system text replaced by byte counts.
    const redacted = inv.args.map((a, i) => {
      const prev = inv.args[i - 1];
      if (isClaude && prev === "-p") return `<prompt:${Buffer.byteLength(a)} bytes>`;
      if (isClaude && prev === "--append-system-prompt") {
        return `<system:${Buffer.byteLength(a)} bytes>`;
      }
      if (!isClaude && i === inv.args.length - 1) return `<prompt:${Buffer.byteLength(a)} bytes>`;
      return a;
    });
    const envSet = isClaude
      ? [
          "LOOM_LANE",
          "CLAUDE_CODE_EFFORT_LEVEL",
          "CLAUDE_CODE_SUBAGENT_MODEL",
          "CLAUDE_CODE_SUBAGENT_MODEL_FORCE",
        ]
      : ["LOOM_LANE"];
    const envUnset = Object.keys(process.env)
      .filter((k) => process.env[k] !== undefined && isStrippedEnvKey(k))
      .sort();
    writeFileSync(
      join(dir, "argv.json"),
      `${JSON.stringify({ cmd: inv.cmd, args: redacted, envSet, envUnset }, null, 2)}\n`,
    );
  } catch (e) {
    return fail(`spawn error: ${errMsg(e)}`);
  }

  const size = spawnBytes(inv);
  if (size > MAX_SPAWN_BYTES) return fail(`argv too large (${size} bytes)`);

  const before = args.lane === "impl" ? gitSnapshot(args.cwd) : null;
  if (before && !before.ok) return fail(`diff snapshot failed: ${before.cmd}`);
  let out: ChildOutcome;
  try {
    out = await runChild(inv, args.cwd, args.timeoutS * 1000, ctl);
  } catch (e) {
    return fail(`spawn error: ${errMsg(e)}`);
  }
  const after = before ? gitSnapshot(args.cwd) : null;
  // impl: always boolean, except null on the snapshot-failure path (process-error).
  const snapshotFailed = after !== null && !after.ok;
  const diffEmpty = before?.ok && after?.ok ? before.text === after.text : null;
  if (after && !after.ok) wrapperErr.push(`diff snapshot failed: ${after.cmd}`);

  if (out.spawnError) wrapperErr.push(`spawn error: ${out.spawnError}`);
  if (out.interrupted) wrapperErr.push(`interrupted by ${out.interrupted}`);
  writeStreams(out.stdout, out.stderr);

  let parsedOk: boolean;
  let mainModel: string | null;
  let resolvedModels: string[];
  let permissionDenials: unknown[] | null;
  let costUsd: number | null;
  let effortResolved: string | null = null;
  let effortMismatch = false;
  let isError = false;
  if (isClaude) {
    const r = parseClaudeResult(out.stdout);
    parsedOk = r?.ok ?? false;
    isError = r?.isError ?? false;
    mainModel = r?.mainModel ?? null;
    resolvedModels = r?.resolvedModels ?? [];
    permissionDenials = r ? r.permissionDenials : null;
    costUsd = r?.costUsd ?? null;
  } else {
    const h = parseCodexHeader(out.stderr);
    parsedOk = out.spawnError === null;
    mainModel = h.model;
    resolvedModels = h.model ? [h.model] : [];
    effortResolved = h.effort;
    effortMismatch = h.effort !== PINS.effort.verify;
    permissionDenials = null;
    costUsd = null;
  }

  const childFailed = out.childExit !== 0 || isError;
  const limitText = isClaude ? `${out.stderr}\n${claudeResultText(out.stdout)}` : out.stderr;
  const limitSignal = childFailed && detectLimitSignal(limitText) !== null;

  const exitReason: ExitReason =
    out.interrupted || snapshotFailed
      ? "process-error"
      : classify({
          timedOut: out.timedOut,
          childExit: out.childExit,
          limitSignal,
          parsedOk,
          mainModel,
          pinnedModel,
          denials: permissionDenials?.length ?? 0,
          diffEmpty,
          lane: args.lane,
          effortMismatch,
        });
  return finalize({
    resolvedModels,
    mainModel,
    effortResolved,
    permissionDenials,
    diffEmpty,
    exitReason,
    costUsd,
  });
}

// ─── Entrypoint ──────────────────────────────────────────────────────────────

if (import.meta.main) {
  try {
    process.exit(await runLane(process.argv.slice(2)));
  } catch (e) {
    console.error(`[lane] error: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}
