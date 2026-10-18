/**
 * PLAN 0.44.0 P1 — read-only linear scan of room event logs for `loom history search`
 * (D2 · D4 · D5 · R2–R8 · R13 · R16).
 *
 * Walks `<root>/rooms/<roomKey>/events/<YYYY-MM>.jsonl`, lstat-ing every component, reads each month
 * file through a bounded fd reader, joins the `envelope` string leaves of every valid record, redacts
 * secrets, then matches case-insensitively. Synchronous; it creates, changes and locks nothing — the
 * state root is the caller's.
 */
import { closeSync, constants as fsConstants, fstatSync, lstatSync, openSync, readdirSync, readSync } from "node:fs";
import { join } from "node:path";
import { redactSecrets } from "./redact";
import { roomKey } from "./room-event-log";

export const HISTORY_MONTH_FILE_MAX_BYTES = 64 * 1024 * 1024;
export const HISTORY_LEAF_DEPTH_MAX = 32;
export const HISTORY_QUERY_MAX_UNITS = 256;
export const HISTORY_LIMIT_DEFAULT = 20;
export const HISTORY_LIMIT_MAX = 200;
export const HISTORY_SNIPPET_RADIUS = 80;

/** ② reason vocabulary — never carries file content. */
export type IncompleteReason =
  | "symlink"
  | "not a directory"
  | "not a regular file"
  | "too large"
  | `unreadable ${string}`;

/** Already-validated query values (the CLI checks them — R9 · R10). */
export type HistoryQuery = { needle: string; roomId?: string; month?: string; limit: number };

/** `snippet` is redacted, newline-normalised and `…`-cut — not yet `visibleText`-escaped (R12). */
export type HistoryHit = {
  ts: string;
  roomId: string;
  seq: number;
  type: string;
  eventId: string;
  snippet: string;
};

export type HistoryIncomplete = { file: string; reason: IncompleteReason };

export type HistoryResult = {
  hits: HistoryHit[];
  files: number;
  torn: number;
  incomplete: HistoryIncomplete[];
};

const ROOM_DIR_NAME = /^[0-9a-f]{16}$/;
const MONTH_FILE_NAME = /^\d{4}-(0[1-9]|1[0-2])\.jsonl$/;
const SORTABLE_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/;
/** Same name test as `redact.ts` `SENSITIVE_NAME` (R63-L3 — the env is filtered once per scan). */
const SENSITIVE_ENV_NAME =
  /api[_-]?key|token|secret|passw(?:or)?d|auth(?:orization)?|bearer|cookie|session[_-]?id|private[_-]?key|credential/i;

type ValidRecord = {
  v: 1;
  roomId: string;
  seq: number;
  eventId: string;
  ts: string;
  type: string;
  envelope: object;
};

type MonthFile = { month: string; dirName: string; abs: string; rel: string };

type Candidate = {
  tsValid: boolean;
  tsNum: number;
  roomId: string;
  seq: number;
  line: number;
  ts: string;
  type: string;
  eventId: string;
  text: string;
  start: number;
  end: number;
};

type ReadOutcome = { kind: "ok"; buf: Buffer } | { kind: "missing" } | { kind: "invalid"; reason: IncompleteReason };

function errCode(err: unknown): string {
  const code = (err as NodeJS.ErrnoException)?.code;
  return typeof code === "string" ? code : "unknown";
}

function unreadable(err: unknown): IncompleteReason {
  return `unreadable ${errCode(err)}`;
}

/** Copy of `room-event-log.ts` `isRecord` + `Number.isFinite(seq)` (R4 · R63-L1). */
function isValidRecord(value: unknown): value is ValidRecord {
  if (!value || typeof value !== "object") return false;
  const rec = value as Record<string, unknown>;
  return (
    rec.v === 1 &&
    typeof rec.roomId === "string" &&
    typeof rec.seq === "number" &&
    Number.isFinite(rec.seq) &&
    typeof rec.eventId === "string" &&
    typeof rec.ts === "string" &&
    typeof rec.type === "string" &&
    typeof rec.envelope === "object" &&
    rec.envelope !== null
  );
}

/**
 * R2: lstat (regular · ≤ cap) → open `O_RDONLY|O_NOFOLLOW|O_NONBLOCK` → fstat (regular · ≤ cap) →
 * read up to exactly the fstat size (a file that grows later is not read on — class 71).
 */
function readMonthFile(path: string): ReadOutcome {
  try {
    const st = lstatSync(path);
    if (st.isSymbolicLink()) return { kind: "invalid", reason: "symlink" };
    if (!st.isFile()) return { kind: "invalid", reason: "not a regular file" };
    if (st.size > HISTORY_MONTH_FILE_MAX_BYTES) return { kind: "invalid", reason: "too large" };
  } catch (err) {
    if (errCode(err) === "ENOENT") return { kind: "missing" };
    return { kind: "invalid", reason: unreadable(err) };
  }
  let fd: number;
  try {
    fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK);
  } catch (err) {
    const code = errCode(err);
    if (code === "ENOENT") return { kind: "missing" };
    if (code === "ELOOP" || code === "EMLINK") return { kind: "invalid", reason: "symlink" };
    return { kind: "invalid", reason: unreadable(err) };
  }
  try {
    const st = fstatSync(fd);
    if (!st.isFile()) return { kind: "invalid", reason: "not a regular file" };
    if (st.size > HISTORY_MONTH_FILE_MAX_BYTES) return { kind: "invalid", reason: "too large" };
    const buf = Buffer.alloc(st.size);
    let total = 0;
    while (total < buf.length) {
      const n = readSync(fd, buf, total, buf.length - total, null);
      if (n === 0) break;
      total += n;
    }
    return { kind: "ok", buf: buf.subarray(0, total) };
  } catch (err) {
    return { kind: "invalid", reason: unreadable(err) };
  } finally {
    try {
      closeSync(fd);
    } catch {}
  }
}

type DirCheck = "dir" | "missing" | IncompleteReason;

function checkDir(path: string): DirCheck {
  try {
    const st = lstatSync(path);
    if (st.isSymbolicLink()) return "symlink";
    if (!st.isDirectory()) return "not a directory";
    return "dir";
  } catch (err) {
    if (errCode(err) === "ENOENT") return "missing";
    return unreadable(err);
  }
}

function listSorted(path: string): string[] | IncompleteReason {
  try {
    return readdirSync(path).sort();
  } catch (err) {
    return unreadable(err);
  }
}

/** R6: depth-first string leaves — arrays by index, objects by `Object.keys` order, depth ≤ 32. */
function collectLeaves(value: unknown, depth: number, out: string[]): void {
  if (depth > HISTORY_LEAF_DEPTH_MAX) return;
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectLeaves(item, depth + 1, out);
    return;
  }
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) collectLeaves(obj[key], depth + 1, out);
}

/**
 * R7: find the first match in the lowercased text, mapped back to offsets of the original text
 * (`toLowerCase` may grow a code point — e.g. U+0130 → 2 units).
 */
function findMatch(text: string, needleLower: string): { start: number; end: number } | null {
  let lowered = text.toLowerCase();
  const startOf: number[] = [];
  const endOf: number[] = [];
  let perPoint = "";
  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i) ?? 0;
    const width = cp > 0xffff ? 2 : 1;
    const lower = text.slice(i, i + width).toLowerCase();
    perPoint += lower;
    for (let k = 0; k < lower.length; k++) {
      startOf.push(i);
      endOf.push(i + width);
    }
    i += width;
  }
  if (lowered.length !== perPoint.length) lowered = perPoint;
  const at = lowered.indexOf(needleLower);
  if (at < 0) return null;
  const start = startOf[at] ?? text.length;
  const end = endOf[at + needleLower.length - 1] ?? text.length;
  return { start, end };
}

function isHigh(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLow(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

/** R7: ±radius units around the match · surrogate-safe cut · CR/LF → space · `…` on cut ends. */
function buildSnippet(text: string, start: number, end: number): string {
  let from = Math.max(0, start - HISTORY_SNIPPET_RADIUS);
  let to = Math.min(text.length, end + HISTORY_SNIPPET_RADIUS);
  if (from > 0 && isLow(text.charCodeAt(from)) && isHigh(text.charCodeAt(from - 1))) from += 1;
  if (to < text.length && isHigh(text.charCodeAt(to - 1)) && isLow(text.charCodeAt(to))) to -= 1;
  const body = text.slice(from, to).replace(/\r\n|\r|\n/g, " ");
  return `${from > 0 ? "…" : ""}${body}${to < text.length ? "…" : ""}`;
}

/** R8 order: valid ts numeric desc (invalid after) → roomId asc → seq desc → line desc. */
function compareCandidates(p: Candidate, q: Candidate): number {
  if (p.tsValid !== q.tsValid) return p.tsValid ? -1 : 1;
  if (p.tsValid && p.tsNum !== q.tsNum) return q.tsNum - p.tsNum;
  if (p.roomId !== q.roomId) return p.roomId < q.roomId ? -1 : 1;
  if (p.seq !== q.seq) return q.seq - p.seq;
  return q.line - p.line;
}

/** R63-M2: keep only the top `cap` candidates (sorted) — bounded by the limit. */
function keepTop(buf: Candidate[], cand: Candidate, cap: number): void {
  if (cap <= 0) return;
  const last = buf[buf.length - 1];
  if (buf.length >= cap && last !== undefined && compareCandidates(cand, last) >= 0) return;
  let lo = 0;
  let hi = buf.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const m = buf[mid];
    if (m !== undefined && compareCandidates(m, cand) <= 0) lo = mid + 1;
    else hi = mid;
  }
  buf.splice(lo, 0, cand);
  if (buf.length > cap) buf.pop();
}

function filterEnv(env: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(env)) {
    if (typeof value !== "string" || value.length < 8) continue;
    if (!SENSITIVE_ENV_NAME.test(name)) continue;
    out[name] = value;
  }
  return out;
}

function tsKey(ts: string): { valid: boolean; num: number } {
  if (!SORTABLE_TS.test(ts)) return { valid: false, num: 0 };
  const num = Date.parse(ts);
  return Number.isNaN(num) ? { valid: false, num: 0 } : { valid: true, num };
}

/** Lists the month files to scan; directory-level incompletes are reported here (R13 · R63-L6). */
function listMonthFiles(root: string, query: HistoryQuery, incomplete: HistoryIncomplete[]): MonthFile[] {
  const files: MonthFile[] = [];
  const rooms = join(root, "rooms");
  const roomsCheck = checkDir(rooms);
  if (roomsCheck === "missing") return files;
  if (roomsCheck !== "dir") {
    incomplete.push({ file: "rooms", reason: roomsCheck });
    return files;
  }
  const roomNames = listSorted(rooms);
  if (typeof roomNames === "string") {
    incomplete.push({ file: "rooms", reason: roomNames });
    return files;
  }
  const onlyKey = query.roomId === undefined ? undefined : roomKey(query.roomId);
  for (const dirName of roomNames) {
    if (!ROOM_DIR_NAME.test(dirName)) continue;
    if (onlyKey !== undefined && dirName !== onlyKey) continue;
    const roomRel = `rooms/${dirName}`;
    const roomCheck = checkDir(join(rooms, dirName));
    if (roomCheck === "missing") continue;
    if (roomCheck !== "dir") {
      incomplete.push({ file: roomRel, reason: roomCheck });
      continue;
    }
    const eventsRel = `${roomRel}/events`;
    const eventsAbs = join(rooms, dirName, "events");
    const eventsCheck = checkDir(eventsAbs);
    if (eventsCheck === "missing") continue;
    if (eventsCheck !== "dir") {
      incomplete.push({ file: eventsRel, reason: eventsCheck });
      continue;
    }
    const names = listSorted(eventsAbs);
    if (typeof names === "string") {
      incomplete.push({ file: eventsRel, reason: names });
      continue;
    }
    for (const name of names) {
      if (!MONTH_FILE_NAME.test(name)) continue;
      const month = name.slice(0, 7);
      if (query.month !== undefined && month !== query.month) continue;
      files.push({ month, dirName, abs: join(eventsAbs, name), rel: `${eventsRel}/${name}` });
    }
  }
  return files;
}

/** Scans one month file into the bounded buffer; returns the torn-line count. */
function scanMonthFile(
  buf: Buffer,
  file: MonthFile,
  query: HistoryQuery,
  needleLower: string,
  env: Record<string, string>,
  decoder: TextDecoder,
  top: Candidate[],
  cap: number,
): number {
  let torn = 0;
  let line = 0;
  let from = 0;
  while (from <= buf.length) {
    let nl = buf.indexOf(0x0a, from);
    if (nl < 0) nl = buf.length;
    line += 1;
    const piece = buf.subarray(from, nl);
    from = nl + 1;
    if (piece.length === 0) continue;
    let value: unknown;
    try {
      value = JSON.parse(decoder.decode(piece));
    } catch {
      torn += 1;
      continue;
    }
    if (
      !isValidRecord(value) ||
      roomKey(value.roomId) !== file.dirName ||
      (query.roomId !== undefined && value.roomId !== query.roomId)
    ) {
      torn += 1;
      continue;
    }
    const leaves: string[] = [];
    collectLeaves(value.envelope, 0, leaves);
    const text = redactSecrets(leaves.join("\n"), env);
    const match = findMatch(text, needleLower);
    if (match === null) continue;
    const key = tsKey(value.ts);
    keepTop(
      top,
      {
        tsValid: key.valid,
        tsNum: key.num,
        roomId: value.roomId,
        seq: value.seq,
        line,
        ts: value.ts,
        type: value.type,
        eventId: value.eventId,
        text,
        start: match.start,
        end: match.end,
      },
      cap,
    );
  }
  return torn;
}

/**
 * ② scanner: months newest first; inside a month every selected room's hits by R8 order; stops after
 * the month in which the accumulated hits reach `limit` (older month files are not opened).
 */
export function searchRoomHistory(
  root: string,
  query: HistoryQuery,
  env: Record<string, string | undefined>,
): HistoryResult {
  const incomplete: HistoryIncomplete[] = [];
  const hits: HistoryHit[] = [];
  let files = 0;
  let torn = 0;
  const monthFiles = listMonthFiles(root, query, incomplete);
  const months = [...new Set(monthFiles.map((f) => f.month))].sort().reverse();
  const needleLower = query.needle.toLowerCase();
  const redactEnv = filterEnv(env);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  for (const month of months) {
    if (hits.length >= query.limit) break;
    const cap = query.limit - hits.length;
    const top: Candidate[] = [];
    for (const file of monthFiles) {
      if (file.month !== month) continue;
      const read = readMonthFile(file.abs);
      if (read.kind === "missing") continue;
      if (read.kind === "invalid") {
        incomplete.push({ file: file.rel, reason: read.reason });
        continue;
      }
      files += 1;
      torn += scanMonthFile(read.buf, file, query, needleLower, redactEnv, decoder, top, cap);
    }
    for (const c of top) {
      hits.push({
        ts: c.ts,
        roomId: c.roomId,
        seq: c.seq,
        type: c.type,
        eventId: c.eventId,
        snippet: buildSnippet(c.text, c.start, c.end),
      });
    }
  }
  incomplete.sort((p, q) => (p.file < q.file ? -1 : p.file > q.file ? 1 : 0));
  return { hits, files, torn, incomplete };
}
