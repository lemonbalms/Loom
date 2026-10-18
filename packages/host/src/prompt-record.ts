/**
 * PLAN 0.41.0 P1 (D2 · D9 · R2 · R3 · R5 · R6 · R60-M2 · R60-L2 · R60-L3). One write-only record per
 * headless spawn attempt: `<cardDir>/prompt-<attempt>.json` (0600, atomic) holding the exact text
 * Loom sent on the system channel (the hint) and the user channel (stdin / grok prompt.txt).
 * Never a fingerprint input and never read back by the worker or any gate (D4) — only
 * `loom prompt show` reads it. Keys are serialised in the fixed order of `PromptRecord`; DEL, C1
 * and bidi controls are escaped after `JSON.stringify` so the file bytes are terminal-safe while
 * parsing to the same value. `readPromptRecord` fails closed: a regular file only, ≤ 8 MiB, the
 * exact key set and types, the canonical serialised bytes, and an `invalid` reason never carries
 * file content.
 *
 * PLAN 0.42.0 D5 · R8 · R9 (R61-M1): version 2 adds `sections` (the assembler's trace) right after
 * `userSha256`. The writer picks the version from the input (sections → 2, none → the 0.41 bytes);
 * the reader keeps a v1 branch. v2 sections are checked against `PROMPT_RECORD_V2_SECTIONS`, a frozen
 * table in this file — not the live manifest, so a later manifest change cannot turn a v2 record on
 * disk invalid. A change to a section's id · channel · turns · required · order = a new record
 * version, the old table staying as its read branch.
 *
 * PLAN 0.43.0 D4 · R5 · R6 · C4 · C5 (R62-L1): version 3 — the system channel carries six sections.
 * Same keys as v2; v3 sections are checked against `PROMPT_RECORD_V3_SECTIONS` (≤ 12 elements) and
 * each system range but the last ends with its "\n\n" tail while `closing-boundary` has none (R3).
 * Section ids are the local `PromptRecordSectionId` (v2 `worker-hint` ∪ the v3 ids), not the
 * manifest's, so v2 records stay typed after the manifest drops `worker-hint`.
 */
import { createHash } from "node:crypto";
import { closeSync, constants as fsConstants, fstatSync, lstatSync, openSync, readSync } from "node:fs";
import { chmod, rename, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { RESUME_CONTINUATION_MESSAGE, type AgentKind } from "./agent-argv";
import type { SectionTrace } from "./prompt-assemble";
import type { FencePartId, PromptChannel, PromptTurns } from "./prompt-manifest";

/** The writer's version (0.43.0 D4). */
export const PROMPT_RECORD_VERSION = 3;
/** The 0.42.0 record: the read branch and the builder given a `worker-hint` trace (R6). */
export const PROMPT_RECORD_V2 = 2;
/** The 0.41.0 record: the read branch and the builder without sections (R8). */
export const PROMPT_RECORD_V1 = 1;
/** R60-L3: a read-only bound (D9 sets no write bound). */
export const PROMPT_RECORD_READ_MAX_BYTES = 8 * 1024 * 1024;

export type PromptTurn = "first" | "resume";
export type PromptUserChannel = "stdin" | "grok --prompt-file";

/** C4: every section id a record may carry — v2 `worker-hint` ∪ the v3 ids (literal, manifest-free). */
export type PromptRecordSectionId =
  | "worker-hint"
  | "boundary"
  | "identity"
  | "ops-rules"
  | "tools"
  | "response-style"
  | "closing-boundary"
  | "resume-continuation"
  | "skill-listing"
  | "task-marker"
  | "memory-fence"
  | "card-body";

/** R62-L1: a record's section element — `SectionTrace` with the id widened (a trace is assignable). */
export type PromptRecordSection = Omit<SectionTrace, "id"> & { id: PromptRecordSectionId };

export type PromptRecordSectionRule = {
  readonly id: PromptRecordSectionId;
  readonly channel: PromptChannel;
  readonly turns: PromptTurns;
  readonly required: boolean;
  /** `memory-fence` only: its part ids in declaration order. */
  readonly parts?: readonly FencePartId[];
};

function freezeRules(rows: PromptRecordSectionRule[]): readonly PromptRecordSectionRule[] {
  for (const row of rows) {
    if (row.parts) Object.freeze(row.parts);
    Object.freeze(row);
  }
  return Object.freeze(rows);
}

/**
 * R9 · R61-M1: the v2 check table — the 0.42.0 manifest's id · channel · turns · required · order
 * and the fence part ids, frozen here (a P2 test pins it to the manifest projection).
 */
export const PROMPT_RECORD_V2_SECTIONS: readonly PromptRecordSectionRule[] = freezeRules([
  { id: "worker-hint", channel: "system", turns: "both", required: true },
  { id: "resume-continuation", channel: "user", turns: "resume", required: true },
  { id: "skill-listing", channel: "user", turns: "first", required: false },
  { id: "task-marker", channel: "user", turns: "both", required: true },
  {
    id: "memory-fence",
    channel: "user",
    turns: "first",
    required: false,
    parts: ["policy-notice", "standing-rules", "memory-snapshot"],
  },
  { id: "card-body", channel: "user", turns: "both", required: true },
]);

/**
 * D4 · R61-M1: the v3 check table — the 0.43.0 manifest's id · channel · turns · required · order
 * and the fence part ids, frozen here (a P2 test pins it to the manifest projection).
 */
export const PROMPT_RECORD_V3_SECTIONS: readonly PromptRecordSectionRule[] = freezeRules([
  { id: "boundary", channel: "system", turns: "both", required: true },
  { id: "identity", channel: "system", turns: "both", required: true },
  { id: "ops-rules", channel: "system", turns: "both", required: true },
  { id: "tools", channel: "system", turns: "both", required: true },
  { id: "response-style", channel: "system", turns: "both", required: true },
  { id: "closing-boundary", channel: "system", turns: "both", required: true },
  { id: "resume-continuation", channel: "user", turns: "resume", required: true },
  { id: "skill-listing", channel: "user", turns: "first", required: false },
  { id: "task-marker", channel: "user", turns: "both", required: true },
  {
    id: "memory-fence",
    channel: "user",
    turns: "first",
    required: false,
    parts: ["policy-notice", "standing-rules", "memory-snapshot"],
  },
  { id: "card-body", channel: "user", turns: "both", required: true },
]);

/**
 * R12 · 0.43.0 R5: read-check bounds — v2 (six sections, at most five per record) ≤ 8; v3 (eleven
 * sections, at most ten per record) ≤ 12.
 */
const SECTIONS_MAX_V2 = 8;
const SECTIONS_MAX_V3 = 12;
const PARTS_MAX = 3;
const SECTION_VERSION_RE = /^\d+\.\d+\.\d+$/;
const SHA256_HEX_RE = /^[0-9a-f]{64}$/;

export interface PromptRecord {
  version: 1 | 2 | 3;
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
  /** Versions 2 and 3 (D5 · 0.43.0 D4): the sections tiling `system` and `user`. */
  sections?: PromptRecordSection[];
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
const REQUIRED_KEYS_V2 = [...REQUIRED_KEYS, "sections"] as const;
const SECTION_KEYS = ["id", "channel", "version", "offset", "bytes", "sha256"] as const;

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

/** A trace element rebuilt in the fixed key order (parts: `id · version`). */
function canonicalSection(s: PromptRecordSection): PromptRecordSection {
  const out: PromptRecordSection = {
    id: s.id,
    channel: s.channel,
    version: s.version,
    offset: s.offset,
    bytes: s.bytes,
    sha256: s.sha256,
  };
  if (s.parts !== undefined) out.parts = s.parts.map((p) => ({ id: p.id, version: p.version }));
  return out;
}

/**
 * R8 · 0.43.0 R6: the version comes from `sections` — none → 1 (the 0.41 bytes) · a `worker-hint`
 * trace → 2 (the 0.42 bytes; read-branch seeds only) · otherwise → 3 (the worker's one call site).
 */
function recordVersion(sections: readonly PromptRecordSection[] | undefined): 1 | 2 | 3 {
  if (sections === undefined) return PROMPT_RECORD_V1;
  return sections.some((s) => s.id === "worker-hint") ? PROMPT_RECORD_V2 : PROMPT_RECORD_VERSION;
}

export function buildPromptRecord(
  input: PromptRecordInput & { sections?: readonly PromptRecordSection[] },
): PromptRecord {
  const ch = CHANNELS[input.agent];
  // ES2024 String#toWellFormed (Bun runtime); the tsconfig lib predates it.
  const user = (input.user as string & { toWellFormed(): string }).toWellFormed();
  const record: PromptRecord = {
    version: recordVersion(input.sections),
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
  if (input.sections !== undefined) record.sections = input.sections.map(canonicalSection);
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

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((k) => Object.hasOwn(value, k));
}

function isCount(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
}

type SectionsCheck = {
  readonly table: readonly PromptRecordSectionRule[];
  readonly max: number;
  /** 0.43.0 R3: system ranges end with "\n\n" except the last system row's, which ends with no LF. */
  readonly systemTails: boolean;
};

const SECTIONS_V2: SectionsCheck = { table: PROMPT_RECORD_V2_SECTIONS, max: SECTIONS_MAX_V2, systemTails: false };
const SECTIONS_V3: SectionsCheck = { table: PROMPT_RECORD_V3_SECTIONS, max: SECTIONS_MAX_V3, systemTails: true };

const LF = 0x0a;

function systemTailOk(range: Buffer, last: boolean): boolean {
  if (last) return range.length === 0 || range[range.length - 1] !== LF;
  return range.length >= 2 && range[range.length - 1] === LF && range[range.length - 2] === LF;
}

/**
 * R9 · 0.43.0 D4: `sections` against the version's frozen table — ids · channels · turns · required ·
 * order · parts, and per channel an exact tiling of the text's UTF-8 bytes with each range's
 * sha256 (v3 also the system tails — R3). Every failure is `bad sections` (no content).
 */
function sectionsOk(
  check: SectionsCheck,
  sections: unknown,
  turn: PromptTurn,
  system: string,
  user: string,
): boolean {
  const { table } = check;
  if (!Array.isArray(sections) || sections.length < 1 || sections.length > check.max) return false;
  const texts: Record<PromptChannel, Buffer> = {
    system: Buffer.from(system, "utf8"),
    user: Buffer.from(user, "utf8"),
  };
  const cursor: Record<PromptChannel, number> = { system: 0, user: 0 };
  const seen = new Set<PromptRecordSectionId>();
  const lastSystemId = table.filter((row) => row.channel === "system").at(-1)?.id;
  let last = -1;
  for (const el of sections) {
    if (!isPlainObject(el)) return false;
    const at = table.findIndex((row) => row.id === el.id);
    if (at < 0) return false;
    const row = table[at]!;
    if (!exactKeys(el, row.parts ? [...SECTION_KEYS, "parts"] : SECTION_KEYS)) return false;
    if (el.channel !== row.channel) return false;
    if (row.turns !== "both" && row.turns !== turn) return false;
    if (at <= last) return false;
    last = at;
    seen.add(row.id);
    if (typeof el.version !== "string" || !SECTION_VERSION_RE.test(el.version)) return false;
    if (!isCount(el.offset) || !isCount(el.bytes)) return false;
    const text = texts[row.channel];
    if (el.offset !== cursor[row.channel] || el.offset + el.bytes > text.length) return false;
    cursor[row.channel] = el.offset + el.bytes;
    if (typeof el.sha256 !== "string" || !SHA256_HEX_RE.test(el.sha256)) return false;
    const range = text.subarray(el.offset, el.offset + el.bytes);
    if (createHash("sha256").update(range).digest("hex") !== el.sha256) return false;
    if (check.systemTails && row.channel === "system" && !systemTailOk(range, row.id === lastSystemId)) {
      return false;
    }
    if (row.parts && !partsOk(el.parts, row.parts)) return false;
  }
  for (const row of table) {
    const onTurn = row.turns === "both" || row.turns === turn;
    if (row.required && onTurn && !seen.has(row.id)) return false;
  }
  return cursor.system === texts.system.length && cursor.user === texts.user.length;
}

function partsOk(parts: unknown, ids: readonly FencePartId[]): boolean {
  if (!Array.isArray(parts) || parts.length < 1 || parts.length > PARTS_MAX) return false;
  let last = -1;
  for (const p of parts) {
    if (!isPlainObject(p) || !exactKeys(p, ["id", "version"])) return false;
    const at = ids.indexOf(p.id as FencePartId);
    if (at < 0 || at <= last) return false;
    last = at;
    if (typeof p.version !== "string" || !SECTION_VERSION_RE.test(p.version)) return false;
  }
  return true;
}

function checkShape(value: unknown, attempt: number): PromptRecord | string {
  if (!isPlainObject(value)) return "not a JSON object";
  // D5 · 0.43.0 D4: the version picks the key set — a v1 record with `sections` is an unknown key;
  // v2 and v3 share the keys and differ in the sections table.
  const check =
    value.version === PROMPT_RECORD_V2 ? SECTIONS_V2 : value.version === PROMPT_RECORD_VERSION ? SECTIONS_V3 : null;
  const keys: readonly string[] = check ? REQUIRED_KEYS_V2 : REQUIRED_KEYS;
  for (const key of Object.keys(value)) {
    if (key !== "userArgv" && !keys.includes(key)) return "unknown key";
  }
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) return `missing ${key}`;
  }
  if (value.version !== PROMPT_RECORD_V1 && !check) return "unsupported version";
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
  if (check && !sectionsOk(check, value.sections, value.turn, value.system as string, value.user as string)) {
    return "bad sections";
  }
  if (value.attempt !== attempt) return "attempt mismatch";
  return value as unknown as PromptRecord;
}

/** A `readBoundedRegularFile` failure — the reason never carries file content. */
export type BoundedFileFailure = { kind: "missing" } | { kind: "invalid"; reason: string };

function unreadable(err: unknown): BoundedFileFailure {
  const code = (err as NodeJS.ErrnoException)?.code;
  return { kind: "invalid", reason: `unreadable ${typeof code === "string" ? code : "unknown"}` };
}

/**
 * Astra 0088 · R60-L3: every check after the open is on the opened fd — `O_NOFOLLOW` (a swapped-in
 * symlink → ELOOP), `O_NONBLOCK` (a FIFO never blocks the open), `fstat` (regular file, size), and at
 * most cap + 1 bytes are read (a file grown past the cap is `too large`). The `lstat` pre-check keeps
 * an oversized or non-regular path from being opened at all. Astra 0094: the cap is the caller's
 * (`loom prompt show` also reads card session.json through it).
 */
export function readBoundedRegularFile(path: string, maxBytes: number): Buffer | BoundedFileFailure {
  try {
    const st = lstatSync(path);
    if (!st.isFile()) return { kind: "invalid", reason: "not a regular file" };
    if (st.size > maxBytes) return { kind: "invalid", reason: "too large" };
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
    if (st.size > maxBytes) return { kind: "invalid", reason: "too large" };
    // Sized to the fstat size + 1 so EOF is seen in one buffer; a file that grew is read on into a
    // cap + 1 buffer.
    let buf = Buffer.alloc(st.size + 1);
    let total = 0;
    for (;;) {
      if (total === buf.length) {
        if (buf.length > maxBytes) break;
        const grown = Buffer.alloc(maxBytes + 1);
        buf.copy(grown, 0, 0, total);
        buf = grown;
      }
      const n = readSync(fd, buf, total, buf.length - total, null);
      if (n === 0) break;
      total += n;
    }
    if (total > maxBytes) return { kind: "invalid", reason: "too large" };
    return buf.subarray(0, total);
  } catch (err) {
    return unreadable(err);
  } finally {
    try {
      closeSync(fd);
    } catch {}
  }
}

/**
 * The checked record rebuilt in the fixed `PromptRecord` key order — v2 · v3 `sections` after
 * `userSha256` with element and part keys in their fixed order (R9), userArgv last.
 */
function canonicalRecord(r: PromptRecord): PromptRecord {
  const out: Record<string, unknown> = {};
  for (const key of REQUIRED_KEYS) out[key] = r[key];
  if (r.version !== PROMPT_RECORD_V1) out.sections = (r.sections ?? []).map(canonicalSection);
  if (r.userArgv !== undefined) out.userArgv = r.userArgv;
  return out as unknown as PromptRecord;
}

/**
 * R9 · R60-L3: missing / invalid / ok — never throws, never echoes file content. Astra 0094: the
 * bytes must be exactly `serializePromptRecord` of the parsed record (`not canonical` otherwise),
 * so every accepted file is the escaped P1 serialisation — `--json` can emit it verbatim.
 */
export function readPromptRecord(dir: string, attempt: number): PromptRecordRead {
  const read = readBoundedRegularFile(promptRecordPath(dir, attempt), PROMPT_RECORD_READ_MAX_BYTES);
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
  const record = canonicalRecord(shaped);
  if (!bytes.equals(Buffer.from(serializePromptRecord(record), "utf8"))) {
    return { kind: "invalid", reason: "not canonical" };
  }
  return { kind: "ok", record, bytes };
}
