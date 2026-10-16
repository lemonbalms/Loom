/**
 * PLAN 0.35.0 — per-agent memory store (D2 · D3 · D4 · D5 · D6).
 * P1 = the pure core: `agentKeyFor` / `isAgentKey` (R1), the v1 line schema (entry ·
 * transition · compact watermark — R2 · R3) and `foldMemoryLines` (② fold steps 1–7 · R4 · R5 ·
 * R53-M1). No file I/O, no locks, no env, no clock — line order never changes the fold result.
 * P2 = the write side: `memoryPaths`, `appendMemoryEntry` (add · propose — checks ①–⑥),
 * `appendMemoryTransition` (approve · retire) and `compactMemory` — all under the per-store
 * `withFileLock`, seq = fold(file).maxSeq + 1, append with newline repair + fsync (R8), compact
 * archive-first then atomic replace (R9).
 */
import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  readFileSync,
  renameSync,
  type Stats,
  unlinkSync,
  writeSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";
import { sanitizePeerName, sanitizePeerText } from "@loom/protocol";
import type { AgentKind } from "./agent-argv";
import { withFileLock } from "./atomic-json";
import { redactSecrets } from "./redact";

// ---------------------------------------------------------------------------------------------
// agentKey (R1 · R53-L2)
// ---------------------------------------------------------------------------------------------

/** `<agentKind>.<token>` — token = safe lowercase profile, or `x.` + 16 hex of sha256(profile). */
export const AGENT_KEY_RE = /^(claude|codex|grok)\.(?:[a-z0-9][a-z0-9_-]{0,47}|x\.[0-9a-f]{16})$/;

const SAFE_PROFILE_RE = /^[a-z0-9][a-z0-9_-]{0,47}$/;
const AGENT_KINDS: readonly string[] = ["claude", "codex", "grok"];

export function isAgentKey(s: string): boolean {
  return typeof s === "string" && AGENT_KEY_RE.test(s);
}

/**
 * The store directory name for (profile, agentKind). `profile` is the resolved bridge profile
 * (`resolveBridgeProfile()` — `--profile` · LOOM_PROFILE · displayName · "default"); any profile
 * that is not already a safe lowercase name is hashed, so the two forms are disjoint (safe
 * tokens contain no ".") and case-insensitive file systems never fold two keys together.
 */
export function agentKeyFor(profile: string, agentKind: AgentKind): string {
  if (typeof agentKind !== "string" || !AGENT_KINDS.includes(agentKind)) {
    throw new TypeError(
      `agentKeyFor: agentKind must be claude, codex or grok (got ${String(agentKind)})`,
    );
  }
  if (typeof profile !== "string") {
    throw new TypeError("agentKeyFor: profile must be a string");
  }
  const token = SAFE_PROFILE_RE.test(profile)
    ? profile
    : `x.${createHash("sha256").update(profile, "utf8").digest("hex").slice(0, 16)}`;
  const key = `${agentKind}.${token}`;
  if (!AGENT_KEY_RE.test(key)) throw new Error(`agentKeyFor: invariant violated (${key})`);
  return key;
}

// ---------------------------------------------------------------------------------------------
// line schema v1 (② entry / transition / compact rows · R2)
// ---------------------------------------------------------------------------------------------

export type MemoryEntryType = "fact" | "decision" | "preference";
export type MemoryStatus = "active" | "proposed" | "retired";
/** `"project"` or `"room:<roomKey>"` (D6). */
export type MemoryAppliesTo = string;
/** `{kind, …}` — 0.35 writers only produce `{kind: "human", by}`. */
export type MemorySource = { kind: string; [key: string]: unknown };

export type MemoryEntryLine = {
  v: 1;
  kind: "entry";
  id: string;
  seq: number;
  type: MemoryEntryType;
  appliesTo: MemoryAppliesTo;
  body: string;
  source: MemorySource;
  status: MemoryStatus;
  supersedes: string | null;
  at?: string;
};

export type MemoryTransitionLine = {
  v: 1;
  kind: "transition";
  /** The TARGET entry id (R3). */
  id: string;
  seq: number;
  to: "active" | "retired";
  source: MemorySource;
  at?: string;
};

export type MemoryCompactLine = { v: 1; kind: "compact"; seq: number };

export type MemoryLine = MemoryEntryLine | MemoryTransitionLine | MemoryCompactLine;

const MEMORY_ID_RE = /^mem_[0-9a-f]{16}$/;
const APPLIES_TO_RE = /^(project|room:[0-9a-f]{16})$/;
const SOURCE_KIND_RE = /^[a-z][a-z0-9-]{0,31}$/;
const MEMORY_BODY_MAX = 2000;
const MEMORY_SOURCE_MAX_BYTES = 1024;
const MEMORY_AT_MAX = 40;

const ENTRY_TYPES: readonly string[] = ["fact", "decision", "preference"];
const STATUSES: readonly string[] = ["active", "proposed", "retired"];
const TRANSITION_TO: readonly string[] = ["active", "retired"];

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function isSeq(x: unknown): x is number {
  return typeof x === "number" && Number.isSafeInteger(x) && x > 0;
}

function isSource(x: unknown): x is MemorySource {
  if (!isPlainObject(x)) return false;
  if (typeof x.kind !== "string" || !SOURCE_KIND_RE.test(x.kind)) return false;
  return Buffer.byteLength(JSON.stringify(x), "utf8") <= MEMORY_SOURCE_MAX_BYTES;
}

function isOptionalAt(o: Record<string, unknown>): boolean {
  if (!("at" in o)) return true;
  return typeof o.at === "string" && o.at.length <= MEMORY_AT_MAX;
}

/**
 * Parse + validate one line (no trailing newline / CR). Returns null for anything that is not a
 * valid v1 line — the fold counts it as unparseable. Unknown keys are allowed (ignored).
 */
export function parseMemoryLine(line: string): MemoryLine | null {
  let o: unknown;
  try {
    o = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isPlainObject(o) || o.v !== 1) return null;
  if (o.kind === "compact") {
    return isSeq(o.seq) ? (o as MemoryCompactLine) : null;
  }
  if (typeof o.id !== "string" || !MEMORY_ID_RE.test(o.id)) return null;
  if (!isSeq(o.seq) || !isSource(o.source) || !isOptionalAt(o)) return null;
  if (o.kind === "transition") {
    return typeof o.to === "string" && TRANSITION_TO.includes(o.to)
      ? (o as MemoryTransitionLine)
      : null;
  }
  if (o.kind !== "entry") return null;
  if (typeof o.type !== "string" || !ENTRY_TYPES.includes(o.type)) return null;
  if (typeof o.appliesTo !== "string" || !APPLIES_TO_RE.test(o.appliesTo)) return null;
  if (typeof o.body !== "string" || o.body.length < 1 || o.body.length > MEMORY_BODY_MAX) {
    return null;
  }
  if (typeof o.status !== "string" || !STATUSES.includes(o.status)) return null;
  if (!("supersedes" in o)) return null;
  if (
    o.supersedes !== null &&
    (typeof o.supersedes !== "string" || !MEMORY_ID_RE.test(o.supersedes))
  ) {
    return null;
  }
  return o as MemoryEntryLine;
}

// ---------------------------------------------------------------------------------------------
// fold (② fold steps 1–7)
// ---------------------------------------------------------------------------------------------

export type FoldedTransition = {
  seq: number;
  to: "active" | "retired";
  source: MemorySource;
  at?: string;
};

export type FoldedEntry = {
  id: string;
  seq: number;
  type: MemoryEntryType;
  appliesTo: MemoryAppliesTo;
  body: string;
  source: MemorySource;
  /** Current status after applied transitions. */
  status: MemoryStatus;
  supersedes: string | null;
  at?: string;
  /** `supersedes` target absent while a compact watermark exists (R53-M1 — info, not dangling). */
  supersedesArchived: boolean;
  /**
   * Ever approved: the entry line had status active, or an applied transition moved it to active
   * (fold 6). Only an ever-active supersessor hides its target — a rejected proposal
   * (proposed → retired) does not (R53-M1 "한 번 승인된 대체자").
   */
  everActive: boolean;
  /** Some ever-active entry validly supersedes this one (fold 7 · R53-M1). */
  hidden: boolean;
  /** Applied transitions, in (seq, id) order. */
  transitions: FoldedTransition[];
};

export type MemoryFoldCounters = {
  unparseable: number;
  conflicts: number;
  dangling: number;
  archivedRefs: number;
};

export type MemoryFold = {
  entries: Map<string, FoldedEntry>;
  /** status active and not hidden, in (seq asc, id asc) order. */
  visibleActive: FoldedEntry[];
  /** Max seq over every parsed line (watermark included), 0 when none. */
  maxSeq: number;
  counters: MemoryFoldCounters;
};

type ParsedRaw = { raw: string; line: MemoryLine };
type Keyed = { raw: string; line: MemoryEntryLine | MemoryTransitionLine };

/** Code-unit string order (never locale). */
function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Pure, order-independent fold of an `entries.jsonl` body. Never throws on content. */
export function foldMemoryLines(raw: string): MemoryFold {
  const counters: MemoryFoldCounters = {
    unparseable: 0,
    conflicts: 0,
    dangling: 0,
    archivedRefs: 0,
  };
  let maxSeq = 0;

  // 1) split · strip one trailing CR · skip empty   2) parse + schema → unparseable anywhere
  const parsed: ParsedRaw[] = [];
  for (const piece of raw.split("\n")) {
    const text = piece.endsWith("\r") ? piece.slice(0, -1) : piece;
    if (text === "") continue;
    const line = parseMemoryLine(text);
    if (!line) {
      counters.unparseable += 1;
      continue;
    }
    if (line.seq > maxSeq) maxSeq = line.seq;
    parsed.push({ raw: text, line });
  }

  // 3) group by (id, seq): identical raw → one; different raw → smallest raw + conflicts
  // 4) split off watermarks
  let hasWatermark = false;
  const groups = new Map<string, { winner: Keyed; raws: Set<string> }>();
  for (const p of parsed) {
    if (p.line.kind === "compact") {
      hasWatermark = true;
      continue;
    }
    const k = `${p.line.id}\0${p.line.seq}`;
    const g = groups.get(k);
    if (!g) {
      groups.set(k, { winner: { raw: p.raw, line: p.line }, raws: new Set([p.raw]) });
      continue;
    }
    g.raws.add(p.raw);
    if (cmpStr(p.raw, g.winner.raw) < 0) g.winner = { raw: p.raw, line: p.line };
  }
  const lines: Keyed[] = [];
  for (const g of groups.values()) {
    counters.conflicts += g.raws.size - 1;
    lines.push(g.winner);
  }

  // 5) sort by (seq asc, id asc)
  lines.sort((a, b) => a.line.seq - b.line.seq || cmpStr(a.line.id, b.line.id));

  // 6) apply in order
  const entryIds = new Set<string>();
  for (const l of lines) if (l.line.kind === "entry") entryIds.add(l.line.id);
  const entries = new Map<string, FoldedEntry>();
  const links: Array<{ from: FoldedEntry; to: FoldedEntry }> = [];
  for (const { line } of lines) {
    if (line.kind === "entry") {
      if (entries.has(line.id)) {
        counters.conflicts += 1; // R4: same id at another seq — first (seq, id) wins
        continue;
      }
      const e: FoldedEntry = {
        id: line.id,
        seq: line.seq,
        type: line.type,
        appliesTo: line.appliesTo,
        body: line.body,
        source: line.source,
        status: line.status,
        supersedes: line.supersedes,
        ...(line.at !== undefined ? { at: line.at } : {}),
        supersedesArchived: false,
        everActive: line.status === "active",
        hidden: false,
        transitions: [],
      };
      const target = line.supersedes;
      if (target !== null) {
        const prior = entries.get(target);
        if (target === line.id) {
          counters.dangling += 1; // self
        } else if (prior) {
          links.push({ from: e, to: prior });
        } else if (entryIds.has(target)) {
          counters.dangling += 1; // sorted later
        } else if (hasWatermark) {
          e.supersedesArchived = true;
          counters.archivedRefs += 1;
        } else {
          counters.dangling += 1;
        }
      }
      entries.set(line.id, e);
      continue;
    }
    const e = entries.get(line.id);
    const ok =
      e !== undefined &&
      ((e.status === "proposed" && (line.to === "active" || line.to === "retired")) ||
        (e.status === "active" && line.to === "retired"));
    if (!ok) {
      counters.dangling += 1;
      continue;
    }
    e.status = line.to;
    if (line.to === "active") e.everActive = true;
    e.transitions.push({
      seq: line.seq,
      to: line.to,
      source: line.source,
      ...(line.at !== undefined ? { at: line.at } : {}),
    });
  }

  // 7) hidden = superseded by an ever-active entry (proposed or rejected proposals never hide)
  for (const { from, to } of links) {
    if (from.everActive) to.hidden = true;
  }
  const visibleActive: FoldedEntry[] = [];
  for (const e of entries.values()) {
    if (e.status === "active" && !e.hidden) visibleActive.push(e);
  }
  // Map insertion order is already (seq, id) order.

  return { entries, visibleActive, maxSeq, counters };
}

// ---------------------------------------------------------------------------------------------
// P2 — writes (② 경로 · 락 · append · seq 할당 · 쓰기 검사 · approve/retire · compact)
// ---------------------------------------------------------------------------------------------

/** D5 caps. Refused on add/propose only — approve · retire · compact always work. */
export const MEMORY_ACTIVE_CAP = 200;
export const MEMORY_PROPOSED_CAP = 200;
export const MEMORY_ENTRIES_MAX_BYTES = 1024 * 1024;
const MEMORY_SOURCE_BY_MAX = 64;
const ID_DRAWS = 4; // first draw + up to 3 regenerations (② "최대 3회")

export type MemoryPaths = {
  /** `<L>/memory` (0700). */
  memoryDir: string;
  /** `<L>/memory/<agentKey>` (0700). */
  dir: string;
  /** `entries.jsonl` (0600). */
  entries: string;
  /** `entries.archive.jsonl` (0600). */
  archive: string;
  /** `withFileLock` lock directory next to entries.jsonl. */
  lock: string;
};

/** Store paths under the caller's loomDir (never resolved here). Bad arguments → TypeError. */
export function memoryPaths(loomDir: string, agentKey: string): MemoryPaths {
  if (typeof loomDir !== "string" || !isAbsolute(loomDir)) {
    throw new TypeError("memoryPaths: loomDir must be an absolute path");
  }
  if (!isAgentKey(agentKey)) throw new TypeError("memoryPaths: invalid agentKey");
  const memoryDir = join(loomDir, "memory");
  const dir = join(memoryDir, agentKey);
  const entries = join(dir, "entries.jsonl");
  return {
    memoryDir,
    dir,
    entries,
    archive: join(dir, "entries.archive.jsonl"),
    lock: `${entries}.lock`,
  };
}

export type MemoryRefusalCode =
  | "empty_body"
  | "secret"
  | "too_long"
  | "too_large"
  | "active_cap"
  | "proposed_cap"
  | "unknown_supersedes"
  | "id_collision"
  | "bad_state"
  | "busy"
  | "unsafe_path";

/** A refused write: nothing was written. `message` is the CLI reason (no `loom memory:` prefix). */
export type MemoryRefusal = { ok: false; code: MemoryRefusalCode; message: string };

export type MemoryWriteDeps = {
  /** Env for the redaction check (R53-L1) — explicit; never defaults to process.env. */
  env: Record<string, string | undefined>;
  /** `mem_` + 16 hex; default `"mem_" + randomBytes(8).toString("hex")`. */
  randomId?: () => string;
  /** Clock for the human-only `at` field; default `new Date()`. */
  now?: () => Date;
};

export type MemoryEntryInput = {
  /** Raw body — sanitized here (R7). */
  body: string;
  type: MemoryEntryType;
  appliesTo: MemoryAppliesTo;
  /** add = active · propose = proposed. */
  status: "active" | "proposed";
  supersedes: string | null;
  source: MemorySource;
};

export type AppendEntryResult =
  | { ok: true; id: string; seq: number; status: "active" | "proposed"; path: string }
  | MemoryRefusal;

export type MemoryTransitionInput = {
  id: string;
  /** approve = active · retire = retired. */
  to: "active" | "retired";
  source: MemorySource;
};

export type AppendTransitionResult =
  | { ok: true; id: string; seq: number; to: "active" | "retired"; path: string }
  | MemoryRefusal;

export type CompactResult =
  | {
      ok: true;
      /** Lines appended to the archive (0 → nothing was written). */
      moved: number;
      unparseable: number;
      conflictLosers: number;
      kept: number;
      /** Watermark seq written, null when nothing moved or no seq to mark. */
      watermark: number | null;
      archivePath: string;
    }
  | MemoryRefusal;

/** Test-only fault injection (room-event-log idiom). */
export const memoryStoreTestHooks: { failBeforeReplace: boolean } = {
  failBeforeReplace: false,
};

/** `{kind:"human", by}` — by = sanitizePeerName(displayName), ≤64 UTF-16 units (D4 · ②). */
export function humanMemorySource(displayName: string): MemorySource {
  let by = sanitizePeerName(displayName);
  if (by.length > MEMORY_SOURCE_BY_MAX) {
    by = by.slice(0, MEMORY_SOURCE_BY_MAX);
    const last = by.charCodeAt(by.length - 1);
    if (last >= 0xd800 && last <= 0xdbff) by = by.slice(0, -1);
  }
  return { kind: "human", by };
}

function refuse(code: MemoryRefusalCode, message: string): MemoryRefusal {
  return { ok: false, code, message };
}

function lstatOrNull(p: string): Stats | null {
  try {
    return lstatSync(p);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

function unsafePath(p: string): MemoryRefusal {
  return refuse("unsafe_path", `refusing ${p}: symlink or not a regular path — nothing written`);
}

/** lstat a store directory: "absent" | "dir" | refusal (symlink / not a directory). */
function dirState(p: string): "absent" | "dir" | MemoryRefusal {
  const st = lstatOrNull(p);
  if (!st) return "absent";
  if (st.isSymbolicLink() || !st.isDirectory()) return unsafePath(p);
  return "dir";
}

/** lstat a store file: "absent" | "file" | refusal (symlink / not a regular file). */
function fileState(p: string): "absent" | "file" | MemoryRefusal {
  const st = lstatOrNull(p);
  if (!st) return "absent";
  if (st.isSymbolicLink() || !st.isFile()) return unsafePath(p);
  return "file";
}

function makeDir(p: string): void {
  mkdirSync(p, { mode: 0o700 });
  try {
    chmodSync(p, 0o700);
  } catch {
    /* */
  }
}

/**
 * Existing store dirs must be real directories (symlinks refused — loomDir itself may be one).
 * `create` makes missing ones 0700 (loomDir recursively); otherwise reports "absent".
 */
function prepareStoreDirs(
  loomDir: string,
  p: MemoryPaths,
  create: boolean,
): "ready" | "absent" | MemoryRefusal {
  for (const d of [p.memoryDir, p.dir]) {
    const st = dirState(d);
    if (st === "dir") continue;
    if (st !== "absent") return st;
    if (!create) return "absent";
    if (d === p.memoryDir) mkdirSync(loomDir, { recursive: true, mode: 0o700 });
    makeDir(d);
  }
  return "ready";
}

/** Read entries.jsonl ("" when absent) without following a symlink. */
function readEntries(p: MemoryPaths): { raw: string; size: number } | MemoryRefusal {
  const st = fileState(p.entries);
  if (st === "absent") return { raw: "", size: 0 };
  if (st !== "file") return st;
  const fd = openSync(p.entries, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const buf = readFileSync(fd);
    return { raw: buf.toString("utf8"), size: buf.length };
  } finally {
    closeSync(fd);
  }
}

/**
 * Append lines (each + "\n") to a store file: O_APPEND|O_CREAT|O_NOFOLLOW 0600, a missing trailing
 * newline is written first (R8 — `room-event-log.ts` appendJsonl idiom), fsync, chmod 0600.
 */
function appendLines(file: string, lines: readonly string[]): void {
  const fd = openSync(
    file,
    fsConstants.O_RDWR | fsConstants.O_APPEND | fsConstants.O_CREAT | fsConstants.O_NOFOLLOW,
    0o600,
  );
  try {
    const size = fstatSync(fd).size;
    let repair = false;
    if (size > 0) {
      const last = Buffer.alloc(1);
      repair = readSync(fd, last, 0, 1, size - 1) === 1 && last[0] !== 0x0a;
    }
    const text = `${repair ? "\n" : ""}${lines.map((l) => `${l}\n`).join("")}`;
    const buf = Buffer.from(text, "utf8");
    let off = 0;
    while (off < buf.length) off += writeSync(fd, buf, off, buf.length - off);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  try {
    chmodSync(file, 0o600);
  } catch {
    /* */
  }
}

/** Atomic replace: tmp (0600, fsync) + rename in the same dir; tmp removed on failure. */
function replaceFile(file: string, text: string): void {
  const tmp = join(dirname(file), `.${basename(file)}.tmp.${process.pid}.${Date.now()}`);
  try {
    const fd = openSync(
      tmp,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW,
      0o600,
    );
    try {
      const buf = Buffer.from(text, "utf8");
      let off = 0;
      while (off < buf.length) off += writeSync(fd, buf, off, buf.length - off);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tmp, file);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {
      /* best effort */
    }
    throw err;
  }
  try {
    chmodSync(file, 0o600);
  } catch {
    /* */
  }
}

/**
 * Run `fn` under the per-store lock. A lock wait timeout (withFileLock's 4 s bound) becomes the
 * `busy` refusal (class 1 — nothing written, never duplicated); any other error propagates.
 */
function underStoreLock<T>(p: MemoryPaths, fn: () => T): T | MemoryRefusal {
  let entered = false;
  try {
    return withFileLock(p.entries, () => {
      entered = true;
      return fn();
    });
  } catch (err) {
    if (!entered && err instanceof Error && err.message.startsWith("Timeout waiting for lock")) {
      return refuse("busy", `store busy (${p.lock}) — try again; nothing written`);
    }
    throw err;
  }
}

function nowIso(deps: { now?: () => Date }): string {
  return (deps.now ? deps.now() : new Date()).toISOString();
}

function defaultRandomId(): string {
  return `mem_${randomBytes(8).toString("hex")}`;
}

function assertSource(source: MemorySource, fn: string): void {
  if (!isSource(source)) throw new TypeError(`${fn}: invalid source`);
}

/**
 * `loom memory add` (status active) / `propose` (status proposed). Checks ①–⑥ in order — the
 * first refusal stops and nothing is written. ①–③ need no lock; ④–⑥, id and seq run under it.
 */
export function appendMemoryEntry(
  loomDir: string,
  agentKey: string,
  input: MemoryEntryInput,
  deps: MemoryWriteDeps,
): AppendEntryResult {
  const p = memoryPaths(loomDir, agentKey);
  if (!ENTRY_TYPES.includes(input.type)) throw new TypeError("appendMemoryEntry: invalid type");
  if (typeof input.appliesTo !== "string" || !APPLIES_TO_RE.test(input.appliesTo)) {
    throw new TypeError("appendMemoryEntry: invalid appliesTo");
  }
  if (input.status !== "active" && input.status !== "proposed") {
    throw new TypeError("appendMemoryEntry: status must be active or proposed");
  }
  assertSource(input.source, "appendMemoryEntry");
  if (!deps || typeof deps.env !== "object" || deps.env === null) {
    throw new TypeError("appendMemoryEntry: deps.env is required");
  }

  // ① sanitize (silently normalizes CR / controls — R7) · empty after trim
  const body = sanitizePeerText(typeof input.body === "string" ? input.body : "");
  if (body.trim() === "") return refuse("empty_body", "empty body");
  // ② redaction would change it (deps.env — R53-L1); never echo the body or the secret
  if (redactSecrets(body, deps.env) !== body) {
    return refuse(
      "secret",
      "body looks like it contains a secret (redaction would change it) — reword it; nothing written",
    );
  }
  // ③ length
  if (body.length > MEMORY_BODY_MAX) {
    return refuse("too_long", `body is ${body.length} chars (max ${MEMORY_BODY_MAX})`);
  }

  if (input.supersedes !== null && typeof input.supersedes !== "string") {
    throw new TypeError("appendMemoryEntry: supersedes must be a string or null");
  }
  const dirs = prepareStoreDirs(loomDir, p, true);
  if (dirs !== "ready" && dirs !== "absent") return dirs;
  const pre = fileState(p.entries);
  if (pre !== "absent" && pre !== "file") return pre;

  return underStoreLock(p, (): AppendEntryResult => {
    const read = readEntries(p);
    if ("ok" in read) return read;
    // ④ file size
    if (read.size > MEMORY_ENTRIES_MAX_BYTES) {
      return refuse(
        "too_large",
        `entries.jsonl is ${Math.ceil(read.size / 1024)} KiB (max ${MEMORY_ENTRIES_MAX_BYTES / 1024} KiB) — run loom memory compact`,
      );
    }
    const f = foldMemoryLines(read.raw);
    // ⑤ caps (R6): add — visible active, unless superseding a visible active; propose — proposed
    if (input.status === "active") {
      const n = f.visibleActive.length;
      const net0 =
        input.supersedes !== null && f.visibleActive.some((e) => e.id === input.supersedes);
      if (n >= MEMORY_ACTIVE_CAP && !net0) {
        return refuse(
          "active_cap",
          `${n} active entries (max ${MEMORY_ACTIVE_CAP}) — retire or supersede one`,
        );
      }
    } else {
      let n = 0;
      for (const e of f.entries.values()) if (e.status === "proposed") n += 1;
      if (n >= MEMORY_PROPOSED_CAP) {
        return refuse(
          "proposed_cap",
          `${n} proposed entries (max ${MEMORY_PROPOSED_CAP}) — approve or retire one`,
        );
      }
    }
    // ⑥ supersedes target must be in the fold
    if (input.supersedes !== null && !f.entries.has(input.supersedes)) {
      return refuse("unknown_supersedes", `unknown entry ${input.supersedes}`);
    }

    const gen = deps.randomId ?? defaultRandomId;
    let id: string | null = null;
    for (let i = 0; i < ID_DRAWS; i++) {
      const cand = gen();
      if (typeof cand !== "string" || !MEMORY_ID_RE.test(cand)) {
        throw new TypeError("appendMemoryEntry: randomId must return mem_ + 16 hex");
      }
      if (!f.entries.has(cand)) {
        id = cand;
        break;
      }
    }
    if (id === null) {
      return refuse(
        "id_collision",
        "could not allocate a fresh entry id — try again; nothing written",
      );
    }

    const seq = f.maxSeq + 1;
    const line: MemoryEntryLine = {
      v: 1,
      kind: "entry",
      id,
      seq,
      type: input.type,
      appliesTo: input.appliesTo,
      body,
      source: input.source,
      status: input.status,
      supersedes: input.supersedes,
      at: nowIso(deps),
    };
    appendLines(p.entries, [JSON.stringify(line)]);
    return { ok: true, id, seq, status: input.status, path: p.entries };
  });
}

/**
 * `loom memory approve` (to active — target must be proposed) / `retire` (to retired — target
 * active or proposed). No cap, redaction or size checks (D5 — the store never deadlocks).
 */
export function appendMemoryTransition(
  loomDir: string,
  agentKey: string,
  input: MemoryTransitionInput,
  deps: { now?: () => Date } = {},
): AppendTransitionResult {
  const p = memoryPaths(loomDir, agentKey);
  if (input.to !== "active" && input.to !== "retired") {
    throw new TypeError("appendMemoryTransition: to must be active or retired");
  }
  assertSource(input.source, "appendMemoryTransition");
  const verb = input.to === "active" ? "approve" : "retire";
  const badState = (status: string) =>
    refuse("bad_state", `entry ${input.id} is ${status} — nothing to ${verb}`);

  const dirs = prepareStoreDirs(loomDir, p, false);
  if (dirs === "absent") return badState("missing");
  if (dirs !== "ready") return dirs;
  const pre = fileState(p.entries);
  if (pre !== "absent" && pre !== "file") return pre;

  return underStoreLock(p, (): AppendTransitionResult => {
    const read = readEntries(p);
    if ("ok" in read) return read;
    const f = foldMemoryLines(read.raw);
    const target = f.entries.get(input.id);
    const status = target ? target.status : "missing";
    const allowed =
      input.to === "active" ? status === "proposed" : status === "active" || status === "proposed";
    if (!allowed) return badState(status);
    const seq = f.maxSeq + 1;
    const line: MemoryTransitionLine = {
      v: 1,
      kind: "transition",
      id: input.id,
      seq,
      to: input.to,
      source: input.source,
      at: nowIso(deps),
    };
    appendLines(p.entries, [JSON.stringify(line)]);
    return { ok: true, id: input.id, seq, to: input.to, path: p.entries };
  });
}

/**
 * `loom memory compact` (R9 · R53-M1). Under the lock: fold, then move every final-retired or
 * hidden entry (same `hidden` predicate as the fold — an ever-active supersessor) together with
 * every transition line targeting it, plus unparseable lines, conflict losers and identical
 * copies. Archive append + fsync FIRST, then the kept raw lines (original order, bytes as-is) +
 * one folded watermark line atomically replace entries.jsonl. Nothing to move → no write.
 */
export function compactMemory(loomDir: string, agentKey: string): CompactResult {
  const p = memoryPaths(loomDir, agentKey);
  const nothing: CompactResult = {
    ok: true,
    moved: 0,
    unparseable: 0,
    conflictLosers: 0,
    kept: 0,
    watermark: null,
    archivePath: p.archive,
  };
  const dirs = prepareStoreDirs(loomDir, p, false);
  if (dirs === "absent") return nothing;
  if (dirs !== "ready") return dirs;
  for (const file of [p.entries, p.archive]) {
    const st = fileState(file);
    if (st !== "absent" && st !== "file") return st;
  }

  return underStoreLock(p, (): CompactResult => {
    const read = readEntries(p);
    if ("ok" in read) return read;
    const archiveSt = fileState(p.archive);
    if (archiveSt !== "absent" && archiveSt !== "file") return archiveSt;
    if (read.raw === "") return { ...nothing, kept: 0 };

    const f = foldMemoryLines(read.raw);
    const movedEntryIds = new Set<string>();
    for (const e of f.entries.values()) {
      if (e.status === "retired" || e.hidden) movedEntryIds.add(e.id);
    }

    // Group winners exactly as the fold does (code-unit smallest raw per (id, seq)).
    type Piece = { piece: string; text: string; line: MemoryLine | null };
    const pieces: Piece[] = [];
    const winners = new Map<string, string>();
    for (const piece of read.raw.split("\n")) {
      const text = piece.endsWith("\r") ? piece.slice(0, -1) : piece;
      if (text === "") continue;
      const line = parseMemoryLine(text);
      pieces.push({ piece, text, line });
      if (line && line.kind !== "compact") {
        const k = `${line.id}\0${line.seq}`;
        const w = winners.get(k);
        if (w === undefined || cmpStr(text, w) < 0) winners.set(k, text);
      }
    }

    const kept: string[] = [];
    const moved: string[] = [];
    let unparseable = 0;
    let conflictLosers = 0;
    let watermark = 0;
    let movedMax = 0;
    const seenWinner = new Set<string>();
    for (const { piece, text, line } of pieces) {
      if (!line) {
        unparseable += 1;
        moved.push(piece);
        continue;
      }
      if (line.kind === "compact") {
        if (line.seq > watermark) watermark = line.seq; // folded into the one new watermark
        continue;
      }
      const k = `${line.id}\0${line.seq}`;
      let move = false;
      if (winners.get(k) !== text) {
        conflictLosers += 1; // same (id, seq), different raw
        move = true;
      } else if (seenWinner.has(k)) {
        move = true; // identical copy
      } else {
        seenWinner.add(k);
        if (line.kind === "entry") {
          const applied = f.entries.get(line.id);
          if (!applied || applied.seq !== line.seq) {
            conflictLosers += 1; // R4: same id at another seq
            move = true;
          } else if (movedEntryIds.has(line.id)) {
            move = true;
          }
        } else if (movedEntryIds.has(line.id)) {
          move = true; // every transition targeting a moved entry
        }
      }
      if (move) {
        moved.push(piece);
        if (line.seq > movedMax) movedMax = line.seq;
      } else {
        kept.push(piece);
      }
    }
    if (moved.length === 0) return nothing;

    const n = Math.max(watermark, movedMax);
    // ① archive append + fsync first — a crash after this only duplicates archive lines
    appendLines(p.archive, moved);
    if (memoryStoreTestHooks.failBeforeReplace) {
      memoryStoreTestHooks.failBeforeReplace = false;
      throw new Error("injected failure before replace (test)");
    }
    // ② atomic replace: kept raw lines (order + bytes as-is) + one folded watermark line
    const tail = n > 0 ? [JSON.stringify({ v: 1, kind: "compact", seq: n })] : [];
    replaceFile(p.entries, [...kept, ...tail].map((l) => `${l}\n`).join(""));
    return {
      ok: true,
      moved: moved.length,
      unparseable,
      conflictLosers,
      kept: kept.length,
      watermark: n > 0 ? n : null,
      archivePath: p.archive,
    };
  });
}
