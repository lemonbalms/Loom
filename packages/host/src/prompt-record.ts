/**
 * PLAN 0.41.0 P1 (D2 · D9 · R2 · R3 · R5 · R6 · R60-M2 · R60-L2 · R60-L3). One write-only record per
 * headless spawn attempt: `<cardDir>/prompt-<attempt>.json` (0600, atomic) holding the exact text
 * Loom sent on the system channel (the hint) and the user channel (stdin / grok prompt.txt).
 * Never a fingerprint input and never read back by the worker or any gate (D4) — only
 * `loom prompt show` reads it. Keys are serialised in the fixed order of `PromptRecord`; DEL, C1
 * and bidi controls are escaped after `JSON.stringify` so the file bytes are terminal-safe while
 * parsing to the same value. `readPromptRecord` fails closed: a regular file only, ≤ 8 MiB, the
 * exact key set and types, and an `invalid` reason never carries file content.
 */
import { createHash } from "node:crypto";
import { closeSync, constants as fsConstants, fstatSync, lstatSync, openSync, readSync } from "node:fs";
import { chmod, rename, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { RESUME_CONTINUATION_MESSAGE, type AgentKind } from "./agent-argv";

export const PROMPT_RECORD_VERSION = 1;
/** R60-L3: a read-only bound (D9 sets no write bound). */
export const PROMPT_RECORD_READ_MAX_BYTES = 8 * 1024 * 1024;

export type PromptTurn = "first" | "resume";
export type PromptUserChannel = "stdin" | "grok --prompt-file";

export interface PromptRecord {
  version: 1;
  agent: AgentKind;
  turn: PromptTurn;
  attempt: number;
  dispatchHandoffId: string;
  fingerprint: string;
  systemChannel: string;
  system: string;
  userChannel: PromptUserChannel;
  user: string;
  userSha256: string;
  /** R3: codex resume only — the `exec resume` positional argument. */
  userArgv?: string;
}

export type PromptRecordRead =
  | { kind: "ok"; record: PromptRecord; bytes: Buffer }
  | { kind: "missing" }
  | { kind: "invalid"; reason: string };

const CHANNELS: Record<AgentKind, { system: string; user: PromptUserChannel }> = {
  claude: { system: "claude --append-system-prompt", user: "stdin" },
  codex: { system: "codex -c developer_instructions", user: "stdin" },
  grok: { system: "grok --rules", user: "grok --prompt-file" },
};

const REQUIRED_KEYS = [
  "version",
  "agent",
  "turn",
  "attempt",
  "dispatchHandoffId",
  "fingerprint",
  "systemChannel",
  "system",
  "userChannel",
  "user",
  "userSha256",
] as const;

export function promptRecordPath(dir: string, attempt: number): string {
  return join(dir, `prompt-${attempt}.json`);
}

export interface PromptRecordInput {
  agent: AgentKind;
  turn: PromptTurn;
  attempt: number;
  dispatchHandoffId: string;
  fingerprint: string;
  /** The `hint` value passed to buildAgentArgv (R2). */
  system: string;
  /** `promptBody` — stored as its well-formed form (R60-L2). */
  user: string;
}

export function buildPromptRecord(input: PromptRecordInput): PromptRecord {
  const ch = CHANNELS[input.agent];
  // ES2024 String#toWellFormed (Bun runtime); the tsconfig lib predates it.
  const user = (input.user as string & { toWellFormed(): string }).toWellFormed();
  const record: PromptRecord = {
    version: PROMPT_RECORD_VERSION,
    agent: input.agent,
    turn: input.turn,
    attempt: input.attempt,
    dispatchHandoffId: input.dispatchHandoffId,
    fingerprint: input.fingerprint,
    systemChannel: ch.system,
    system: input.system,
    userChannel: ch.user,
    user,
    userSha256: createHash("sha256").update(Buffer.from(user, "utf8")).digest("hex"),
  };
  if (input.agent === "codex" && input.turn === "resume") {
    record.userArgv = RESUME_CONTINUATION_MESSAGE;
  }
  return record;
}

/** DEL · C1 · bidi embedding/override/isolate controls — left raw by JSON.stringify. */
const UNSAFE_RAW_RE = /[\u007f-\u009f‪-‮⁦-⁩]/g;

/** R6 · R60-L2: `JSON.stringify(record, null, 2) + "\n"` with DEL · C1 · bidi as `\uXXXX`. */
export function serializePromptRecord(record: PromptRecord): string {
  return `${JSON.stringify(record, null, 2)}\n`.replace(
    UNSAFE_RAW_RE,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

/**
 * R5: 0600 temp file `.<basename>.tmp.<pid>.<ms>` in the same directory (`wx`) → rename →
 * chmod 0600; the temp file is removed on failure. For memory-snapshot.md the temp name is the
 * 0.36 one byte for byte.
 */
export async function writePrivateFileAtomic(dir: string, target: string, text: string): Promise<void> {
  const tmp = join(dir, `.${basename(target)}.tmp.${process.pid}.${Date.now()}`);
  try {
    await writeFile(tmp, text, { encoding: "utf8", mode: 0o600, flag: "wx" });
    await rename(tmp, target);
    await chmod(target, 0o600);
  } catch (err) {
    await rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
}

/** Throws on failure — the caller logs the D3 line and keeps spawning (R7). */
export async function writePromptRecord(dir: string, record: PromptRecord): Promise<void> {
  await writePrivateFileAtomic(dir, promptRecordPath(dir, record.attempt), serializePromptRecord(record));
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function checkShape(value: unknown, attempt: number): PromptRecord | string {
  if (!isPlainObject(value)) return "not a JSON object";
  for (const key of Object.keys(value)) {
    if (key !== "userArgv" && !(REQUIRED_KEYS as readonly string[]).includes(key)) return "unknown key";
  }
  for (const key of REQUIRED_KEYS) {
    if (!Object.hasOwn(value, key)) return `missing ${key}`;
  }
  if (value.version !== PROMPT_RECORD_VERSION) return "unsupported version";
  const agent = value.agent;
  if (agent !== "claude" && agent !== "codex" && agent !== "grok") return "bad agent";
  if (value.turn !== "first" && value.turn !== "resume") return "bad turn";
  if (typeof value.attempt !== "number" || !Number.isInteger(value.attempt) || value.attempt < 1) {
    return "bad attempt";
  }
  for (const key of ["dispatchHandoffId", "fingerprint", "systemChannel", "system", "user", "userSha256"] as const) {
    if (typeof value[key] !== "string") return `bad ${key}`;
  }
  const ch = CHANNELS[agent];
  if (value.systemChannel !== ch.system) return "bad systemChannel";
  if (value.userChannel !== ch.user) return "bad userChannel";
  const codexResume = agent === "codex" && value.turn === "resume";
  if (Object.hasOwn(value, "userArgv")) {
    if (!codexResume || typeof value.userArgv !== "string") return "bad userArgv";
  } else if (codexResume) {
    return "missing userArgv";
  }
  if (value.attempt !== attempt) return "attempt mismatch";
  return value as unknown as PromptRecord;
}

function unreadable(err: unknown): PromptRecordRead {
  const code = (err as NodeJS.ErrnoException)?.code;
  return { kind: "invalid", reason: `unreadable ${typeof code === "string" ? code : "unknown"}` };
}

/**
 * Astra 0088 · R60-L3: every check after the open is on the opened fd — `O_NOFOLLOW` (a swapped-in
 * symlink → ELOOP), `O_NONBLOCK` (a FIFO never blocks the open), `fstat` (regular file, size), and at
 * most cap + 1 bytes are read (a file grown past the cap is `too large`). The `lstat` pre-check keeps
 * an oversized or non-regular path from being opened at all.
 */
function readBoundedRegularFile(path: string): Buffer | PromptRecordRead {
  try {
    const st = lstatSync(path);
    if (!st.isFile()) return { kind: "invalid", reason: "not a regular file" };
    if (st.size > PROMPT_RECORD_READ_MAX_BYTES) return { kind: "invalid", reason: "too large" };
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return { kind: "missing" };
    return unreadable(err);
  }
  let fd: number;
  try {
    fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") return { kind: "missing" };
    if (code === "ELOOP" || code === "EMLINK") return { kind: "invalid", reason: "not a regular file" };
    return unreadable(err);
  }
  try {
    const st = fstatSync(fd);
    if (!st.isFile()) return { kind: "invalid", reason: "not a regular file" };
    if (st.size > PROMPT_RECORD_READ_MAX_BYTES) return { kind: "invalid", reason: "too large" };
    // Sized to the fstat size + 1 so EOF is seen in one buffer; a file that grew is read on into a
    // cap + 1 buffer.
    let buf = Buffer.alloc(st.size + 1);
    let total = 0;
    for (;;) {
      if (total === buf.length) {
        if (buf.length > PROMPT_RECORD_READ_MAX_BYTES) break;
        const grown = Buffer.alloc(PROMPT_RECORD_READ_MAX_BYTES + 1);
        buf.copy(grown, 0, 0, total);
        buf = grown;
      }
      const n = readSync(fd, buf, total, buf.length - total, null);
      if (n === 0) break;
      total += n;
    }
    if (total > PROMPT_RECORD_READ_MAX_BYTES) return { kind: "invalid", reason: "too large" };
    return buf.subarray(0, total);
  } catch (err) {
    return unreadable(err);
  } finally {
    try {
      closeSync(fd);
    } catch {}
  }
}

/** R9 · R60-L3: missing / invalid / ok — never throws, never echoes file content. */
export function readPromptRecord(dir: string, attempt: number): PromptRecordRead {
  const read = readBoundedRegularFile(promptRecordPath(dir, attempt));
  if (!Buffer.isBuffer(read)) return read;
  const bytes = read;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { kind: "invalid", reason: "not UTF-8" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { kind: "invalid", reason: "not JSON" };
  }
  const shaped = checkShape(parsed, attempt);
  if (typeof shaped === "string") return { kind: "invalid", reason: shaped };
  return { kind: "ok", record: shaped, bytes };
}
