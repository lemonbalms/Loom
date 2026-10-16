/**
 * PLAN 0.35.0 — per-agent memory store (D2 · D3 · D4 · D6).
 * P1 = the pure core only: `agentKeyFor` / `isAgentKey` (R1), the v1 line schema (entry ·
 * transition · compact watermark — R2 · R3) and `foldMemoryLines` (② fold steps 1–7 · R4 · R5 ·
 * R53-M1). No file I/O, no locks, no env, no clock — line order never changes the fold result.
 */
import { createHash } from "node:crypto";
import type { AgentKind } from "./agent-argv";

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
  /** Some entry with status active|retired validly supersedes this one (fold 7 · R53-M1). */
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
    e.transitions.push({
      seq: line.seq,
      to: line.to,
      source: line.source,
      ...(line.at !== undefined ? { at: line.at } : {}),
    });
  }

  // 7) hidden = superseded by an entry whose status is active or retired (proposed never hides)
  for (const { from, to } of links) {
    if (from.status === "active" || from.status === "retired") to.hidden = true;
  }
  const visibleActive: FoldedEntry[] = [];
  for (const e of entries.values()) {
    if (e.status === "active" && !e.hidden) visibleActive.push(e);
  }
  // Map insertion order is already (seq, id) order.

  return { entries, visibleActive, maxSeq, counters };
}
