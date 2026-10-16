/**
 * PLAN 0.35.0 P3 — `loadMemorySnapshot` (D5 · D8 · R10 · R11).
 * A pure, deterministic, synchronous reader: the same file bytes always give the same
 * `{text, hash, flags}`, whatever the line order of entries.jsonl. It never writes, locks,
 * creates a directory, resolves `loomDir()`, reads the clock or consults `process.env`
 * (redaction runs with an explicit empty env). Bad file content never throws; only bad
 * arguments do (TypeError — programmer error).
 *
 * Sections, fixed order, each omitted (header too) when its file is absent:
 *   ## Persona          memory/<agentKey>/persona.md          ≤ 8192 B
 *   ## Knowledge index  knowledge/INDEX.md                    ≤ 8192 B
 *   ## Room guideline   rooms/<roomKey>/guideline.md          ≤ 16384 B
 *   ## Memory           visible active entries, project + room:<roomKey>, newest first,
 *                       whole entries only up to 16384 B, then `- … N older entries omitted`
 * Truncation happens here, before any fencing (the fence is 0.36 — D8).
 *
 * D1 / D8: NOT WIRED — no production file imports this module in 0.35.0.
 */
import { createHash } from "node:crypto";
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
} from "node:fs";
import { isAbsolute, join } from "node:path";
import { sanitizePeerText } from "@loom/protocol";
import { type FoldedEntry, foldMemoryLines, isAgentKey } from "./memory-store";
import { redactSecrets } from "./redact";

export const SNAPSHOT_PERSONA_MAX_BYTES = 8192;
export const SNAPSHOT_INDEX_MAX_BYTES = 8192;
export const SNAPSHOT_GUIDELINE_MAX_BYTES = 16384;
/** Memory section cap — whole entries only (R10). */
export const SNAPSHOT_MEMORY_MAX_BYTES = 16384;
/** entries.jsonl larger than this is not read: Memory omitted + `entriesOversize`. */
export const SNAPSHOT_ENTRIES_READ_MAX_BYTES = 4 * 1024 * 1024;
/** Human files are read up to this prefix (they are cut to ≤ 16 KiB anyway). */
const HUMAN_READ_MAX_BYTES = 1024 * 1024;

const ROOM_KEY_RE = /^[0-9a-f]{16}$/;
/** Explicit empty env: shape redaction only, never `process.env` (R10 · R53-L3). */
const NO_ENV: Record<string, string | undefined> = Object.freeze({}) as Record<
  string,
  string | undefined
>;

export type MemorySnapshotFlags = {
  truncated: { persona: boolean; index: boolean; guideline: boolean; entries: boolean };
  entriesOversize: boolean;
  /** Source files skipped because a path component or the file is a symlink / not regular / unreadable. */
  readErrors: number;
  /** Texts (human files · included entry bodies) that redaction changed. */
  redactedOnRead: number;
  /** In scope (project + room:<roomKey>). */
  counts: { visibleActive: number; included: number; proposed: number; retired: number };
  unparseable: number;
  conflicts: number;
  dangling: number;
  archivedRefs: number;
};

export type MemorySnapshot = {
  text: string;
  /** sha256(UTF-8 text), lowercase hex (R11). */
  hash: string;
  flags: MemorySnapshotFlags;
};

type ReadResult =
  | { kind: "absent" }
  | { kind: "error" }
  | { kind: "oversize" }
  /** `cut`: the file was longer than the read prefix (cut on a code-point boundary). */
  | { kind: "ok"; buf: Buffer; cut: boolean };

function errCode(err: unknown): string | undefined {
  return err && typeof err === "object" && "code" in err
    ? String((err as { code?: unknown }).code)
    : undefined;
}

/**
 * Read `<loomDir>/<segs…>` without following any symlink below loomDir (loomDir itself may be
 * one). `overMax`: "prefix" reads the first `max` bytes; "flag" reports oversize.
 */
function readUnder(
  loomDir: string,
  segs: readonly string[],
  max: number,
  overMax: "prefix" | "flag",
): ReadResult {
  try {
    let cur = loomDir;
    for (let i = 0; i < segs.length; i++) {
      cur = join(cur, segs[i]!);
      let st: ReturnType<typeof lstatSync>;
      try {
        st = lstatSync(cur);
      } catch (err) {
        const code = errCode(err);
        if (code === "ENOENT" || code === "ENOTDIR") return { kind: "absent" };
        return { kind: "error" };
      }
      const last = i === segs.length - 1;
      if (st.isSymbolicLink()) return { kind: "error" };
      if (last ? !st.isFile() : !st.isDirectory()) return { kind: "error" };
    }
    const fd = openSync(
      cur,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK,
    );
    try {
      const st = fstatSync(fd);
      if (!st.isFile()) return { kind: "error" };
      if (st.size > max && overMax === "flag") return { kind: "oversize" };
      const buf = Buffer.alloc(Math.min(st.size, max) + 1);
      let total = 0;
      while (total < buf.length) {
        const n = readSync(fd, buf, total, buf.length - total, null);
        if (n === 0) break;
        total += n;
      }
      if (total > max) {
        if (overMax === "flag") return { kind: "oversize" };
        return { kind: "ok", buf: cutAt(buf, max), cut: true };
      }
      return { kind: "ok", buf: buf.subarray(0, total), cut: false };
    } finally {
      closeSync(fd);
    }
  } catch {
    return { kind: "error" };
  }
}

const decoder = new TextDecoder("utf-8");

/** Largest prefix of `bytes` that is ≤ `cap` bytes and ends on a code-point boundary. */
function cutAt(bytes: Buffer, cap: number): Buffer {
  let end = cap;
  while (end > 0 && ((bytes[end] ?? 0) & 0xc0) === 0x80) end -= 1;
  return bytes.subarray(0, end);
}

type Clean = { text: string; redacted: boolean };

/** Lone UTF-16 surrogates → U+FFFD (String.prototype.toWellFormed, not in the ES2022 lib). */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

function toWellFormed(s: string): string {
  return s.replace(LONE_SURROGATE, "\uFFFD");
}

/** well-formed → sanitize → redact(·, {}) — the read-side hygiene shared by files and entry bodies. */
function clean(raw: string): Clean {
  const sanitized = sanitizePeerText(toWellFormed(raw));
  const redacted = redactSecrets(sanitized, NO_ENV);
  return { text: redacted, redacted: redacted !== sanitized };
}

/**
 * Human file → section content (null = omit), truncated at `cap` bytes on a code-point boundary.
 * A file longer than the read prefix (`readCut`) is truncated too: marker names the prefix size.
 */
function humanContent(
  buf: Buffer,
  cap: number,
  readCut: boolean,
  flags: MemorySnapshotFlags,
): { content: string | null; truncated: boolean } {
  const c = clean(decoder.decode(buf));
  if (c.redacted) flags.redactedOnRead += 1;
  const bytes = Buffer.from(c.text, "utf8");
  if (bytes.length <= cap && !readCut) {
    const content = c.text.replace(/\n+$/, "");
    return { content: content === "" ? null : content, truncated: false };
  }
  const overCap = bytes.length > cap;
  const kept = decoder.decode(overCap ? cutAt(bytes, cap) : bytes).replace(/\n+$/, "");
  const marker = `[truncated at ${overCap ? cap : HUMAN_READ_MAX_BYTES} bytes]`;
  return { content: kept === "" ? marker : `${kept}\n${marker}`, truncated: true };
}

function cmpCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function renderEntry(e: FoldedEntry, body: string): string {
  const [first, ...rest] = body.split("\n");
  return [`- [${e.type}] (${e.id}) ${first ?? ""}`, ...rest.map((l) => `  ${l}`)].join("\n");
}

/**
 * The memory snapshot for one agent store and one room (D8). Pure and deterministic; see the
 * module header for the section contract.
 */
export function loadMemorySnapshot(
  loomDir: string,
  agentKey: string,
  roomKey: string,
): MemorySnapshot {
  if (typeof loomDir !== "string" || !isAbsolute(loomDir)) {
    throw new TypeError("loadMemorySnapshot: loomDir must be an absolute path");
  }
  if (!isAgentKey(agentKey)) throw new TypeError("loadMemorySnapshot: invalid agentKey");
  if (typeof roomKey !== "string" || !ROOM_KEY_RE.test(roomKey)) {
    throw new TypeError("loadMemorySnapshot: roomKey must be 16 lowercase hex");
  }

  const flags: MemorySnapshotFlags = {
    truncated: { persona: false, index: false, guideline: false, entries: false },
    entriesOversize: false,
    readErrors: 0,
    redactedOnRead: 0,
    counts: { visibleActive: 0, included: 0, proposed: 0, retired: 0 },
    unparseable: 0,
    conflicts: 0,
    dangling: 0,
    archivedRefs: 0,
  };
  const sections: string[] = [];

  const humanFiles: Array<{
    title: string;
    segs: string[];
    cap: number;
    flag: "persona" | "index" | "guideline";
  }> = [
    {
      title: "Persona",
      segs: ["memory", agentKey, "persona.md"],
      cap: SNAPSHOT_PERSONA_MAX_BYTES,
      flag: "persona",
    },
    {
      title: "Knowledge index",
      segs: ["knowledge", "INDEX.md"],
      cap: SNAPSHOT_INDEX_MAX_BYTES,
      flag: "index",
    },
    {
      title: "Room guideline",
      segs: ["rooms", roomKey, "guideline.md"],
      cap: SNAPSHOT_GUIDELINE_MAX_BYTES,
      flag: "guideline",
    },
  ];
  for (const f of humanFiles) {
    const r = readUnder(loomDir, f.segs, HUMAN_READ_MAX_BYTES, "prefix");
    if (r.kind === "absent") continue;
    if (r.kind !== "ok") {
      flags.readErrors += 1;
      continue;
    }
    const { content, truncated } = humanContent(r.buf, f.cap, r.cut, flags);
    if (truncated) flags.truncated[f.flag] = true;
    if (content !== null) sections.push(`## ${f.title}\n${content}`);
  }

  const er = readUnder(
    loomDir,
    ["memory", agentKey, "entries.jsonl"],
    SNAPSHOT_ENTRIES_READ_MAX_BYTES,
    "flag",
  );
  if (er.kind === "error") flags.readErrors += 1;
  else if (er.kind === "oversize") flags.entriesOversize = true;
  else if (er.kind === "ok") {
    const fold = foldMemoryLines(decoder.decode(er.buf));
    flags.unparseable = fold.counters.unparseable;
    flags.conflicts = fold.counters.conflicts;
    flags.dangling = fold.counters.dangling;
    flags.archivedRefs = fold.counters.archivedRefs;
    const room = `room:${roomKey}`;
    const inScope = (e: FoldedEntry) => e.appliesTo === "project" || e.appliesTo === room;
    for (const e of fold.entries.values()) {
      if (!inScope(e)) continue;
      if (e.status === "proposed") flags.counts.proposed += 1;
      else if (e.status === "retired") flags.counts.retired += 1;
    }
    const visible = fold.visibleActive
      .filter(inScope)
      .sort((a, b) => b.seq - a.seq || cmpCodeUnits(b.id, a.id));
    flags.counts.visibleActive = visible.length;
    if (visible.length > 0) {
      const lines: string[] = [];
      let bytes = 0;
      for (const e of visible) {
        const c = clean(e.body);
        const line = renderEntry(e, c.text);
        const add = Buffer.byteLength(line, "utf8") + (lines.length > 0 ? 1 : 0);
        if (bytes + add > SNAPSHOT_MEMORY_MAX_BYTES) break;
        bytes += add;
        lines.push(line);
        if (c.redacted) flags.redactedOnRead += 1;
      }
      flags.counts.included = lines.length;
      const omitted = visible.length - lines.length;
      if (omitted > 0) {
        flags.truncated.entries = true;
        lines.push(`- … ${omitted} older entries omitted`);
      }
      sections.push(`## Memory\n${lines.join("\n")}`);
    }
  }

  const text = sections.length > 0 ? `${sections.join("\n\n")}\n` : "";
  const hash = createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
  return { text, hash, flags };
}
