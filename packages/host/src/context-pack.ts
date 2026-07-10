/**
 * Phase 4.1 / 0.5.1 — Context pack (local, **room-scoped**).
 *
 * v1: summary + cwd-allowlisted paths + notes.
 * Keyed by roomId only (same OS user + same room → shared pack file across profiles).
 * Shared with *remote* peers only when attached to a handoff (`--with-pack`).
 * Invariant: receivers must not open path attachments as filesystem paths (display only).
 * No relay schema change; uses existing handoff attachments.
 */

import {
  existsSync,
  realpathSync,
  statSync,
  openSync,
  closeSync,
  fstatSync,
  readSync,
  constants as fsConstants,
} from "node:fs";
import { join, relative, resolve, isAbsolute } from "node:path";
import { createHash } from "node:crypto";
import {
  sanitizePeerText,
  MAX_ATTACHMENT_CONTENT_CHARS,
  type HandoffAttachment,
} from "@loom/protocol";
import { loadSession, loomDir } from "./session-store";
import {
  readJsonFile,
  writeAtomicJson,
  withFileLock,
} from "./atomic-json";

export const CONTEXT_PACK_VERSION = 1 as const;

export type ContextPackPath = {
  /** Path relative to allowRoot (usually cwd) when possible */
  path: string;
  label?: string;
};

export type ContextPack = {
  v: typeof CONTEXT_PACK_VERSION;
  roomId: string;
  roomName?: string;
  summary: string;
  paths: ContextPackPath[];
  notes: string[];
  updatedAt: string;
};

const MAX_SUMMARY = 2000;
const MAX_NOTE = 500;
const MAX_NOTES = 40;
const MAX_PATHS = 50;
/** L-5 embed: max files to body-embed per handoff */
export const MAX_PACK_EMBED_FILES = 8;
/** L-5 embed: max chars per file (≤ protocol attachment cap) */
export const MAX_PACK_EMBED_FILE_CHARS = Math.min(
  64_000,
  MAX_ATTACHMENT_CONTENT_CHARS,
);
/** Skip embed if raw size exceeds this (bytes) before reading fully */
const MAX_PACK_EMBED_FILE_BYTES = 128_000;

function packsDir(): string {
  return join(loomDir(), "packs");
}

export function packPathForRoom(roomId: string): string {
  const h = createHash("sha256").update(roomId).digest("hex").slice(0, 16);
  return join(packsDir(), `${h}.json`);
}

export function emptyPack(roomId: string, roomName?: string): ContextPack {
  return {
    v: CONTEXT_PACK_VERSION,
    roomId,
    roomName,
    summary: "",
    paths: [],
    notes: [],
    updatedAt: new Date().toISOString(),
  };
}

export function loadContextPack(roomId?: string): ContextPack | null {
  const session = loadSession();
  const id = roomId ?? session?.roomId;
  if (!id) return null;
  const p = packPathForRoom(id);
  if (!existsSync(p)) {
    return emptyPack(id, session?.roomName);
  }
  // H-7: corrupt → backup + throw (never silent empty)
  const raw = readJsonFile(p) as ContextPack;
  if (!raw || typeof raw !== "object") {
    return emptyPack(id, session?.roomName);
  }
  if (raw.roomId !== id) {
    return emptyPack(id, session?.roomName);
  }
  return {
    v: CONTEXT_PACK_VERSION,
    roomId: id,
    roomName: raw.roomName ?? session?.roomName,
    summary: typeof raw.summary === "string" ? raw.summary : "",
    paths: Array.isArray(raw.paths) ? raw.paths.slice(0, MAX_PATHS) : [],
    notes: Array.isArray(raw.notes) ? raw.notes.slice(0, MAX_NOTES) : [],
    updatedAt: raw.updatedAt || new Date().toISOString(),
  };
}

export function saveContextPack(pack: ContextPack): void {
  const p = packPathForRoom(pack.roomId);
  const toSave: ContextPack = {
    ...pack,
    v: CONTEXT_PACK_VERSION,
    summary: sanitizePeerText(pack.summary).slice(0, MAX_SUMMARY),
    notes: pack.notes
      .map((n) => sanitizePeerText(n).slice(0, MAX_NOTE))
      .filter(Boolean)
      .slice(0, MAX_NOTES),
    paths: pack.paths.slice(0, MAX_PATHS),
    updatedAt: new Date().toISOString(),
  };
  withFileLock(p, () => {
    writeAtomicJson(p, toSave);
  });
}

/**
 * Resolve path under allowRoot (default cwd). Rejects escapes via .. / symlink out.
 */
export function resolveAllowlistedPath(
  input: string,
  allowRoot: string = process.cwd(),
): { ok: true; rel: string; abs: string } | { ok: false; error: string } {
  const root = realpathSync(resolve(allowRoot));
  const candidate = isAbsolute(input)
    ? resolve(input)
    : resolve(root, input);
  if (!existsSync(candidate)) {
    return { ok: false, error: `path not found: ${input}` };
  }
  let abs: string;
  try {
    abs = realpathSync(candidate);
  } catch {
    return { ok: false, error: `cannot resolve: ${input}` };
  }
  const rel = relative(root, abs);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    return {
      ok: false,
      error: `path outside allow root (${root}): ${input}`,
    };
  }
  // skip huge binaries by size for later embed; paths always ok
  try {
    const st = statSync(abs);
    if (!st.isFile() && !st.isDirectory()) {
      return { ok: false, error: `not a file or directory: ${input}` };
    }
  } catch {
    return { ok: false, error: `stat failed: ${input}` };
  }
  return { ok: true, rel: rel || ".", abs };
}

export function setPackSummary(summary: string, roomId?: string): ContextPack {
  const pack = loadContextPack(roomId) ?? emptyPack(roomId ?? "unknown");
  if (!roomId && !loadSession()) {
    throw new Error("No session — join a room first");
  }
  const session = loadSession();
  const id = roomId ?? session!.roomId;
  const next: ContextPack = {
    ...pack,
    roomId: id,
    roomName: session?.roomName ?? pack.roomName,
    summary: sanitizePeerText(summary).slice(0, MAX_SUMMARY),
  };
  saveContextPack(next);
  return loadContextPack(id)!;
}

export function addPackPath(
  inputPath: string,
  opts?: { label?: string; roomId?: string; cwd?: string },
): ContextPack {
  const session = loadSession();
  const id = opts?.roomId ?? session?.roomId;
  if (!id) throw new Error("No session — join a room first");
  const resolved = resolveAllowlistedPath(inputPath, opts?.cwd);
  if (!resolved.ok) throw new Error(resolved.error);
  const pack = loadContextPack(id) ?? emptyPack(id, session?.roomName);
  const paths = pack.paths.filter((p) => p.path !== resolved.rel);
  if (paths.length >= MAX_PATHS) {
    throw new Error(`max ${MAX_PATHS} paths in pack`);
  }
  paths.push({
    path: resolved.rel,
    label: opts?.label
      ? sanitizePeerText(opts.label).slice(0, 80)
      : undefined,
  });
  const next: ContextPack = { ...pack, roomId: id, paths };
  saveContextPack(next);
  return loadContextPack(id)!;
}

export function removePackPath(
  inputPath: string,
  opts?: { roomId?: string; cwd?: string },
): ContextPack {
  const session = loadSession();
  const id = opts?.roomId ?? session?.roomId;
  if (!id) throw new Error("No session — join a room first");
  const pack = loadContextPack(id) ?? emptyPack(id);
  // match by rel or basename input
  const resolved = resolveAllowlistedPath(inputPath, opts?.cwd);
  const key = resolved.ok ? resolved.rel : inputPath.replace(/^\.\//, "");
  const paths = pack.paths.filter(
    (p) => p.path !== key && p.path !== inputPath,
  );
  const next: ContextPack = { ...pack, paths };
  saveContextPack(next);
  return loadContextPack(id)!;
}

export function addPackNote(note: string, roomId?: string): ContextPack {
  const session = loadSession();
  const id = roomId ?? session?.roomId;
  if (!id) throw new Error("No session — join a room first");
  const pack = loadContextPack(id) ?? emptyPack(id, session?.roomName);
  const notes = [
    ...pack.notes,
    sanitizePeerText(note).slice(0, MAX_NOTE),
  ].filter(Boolean);
  if (notes.length > MAX_NOTES) notes.splice(0, notes.length - MAX_NOTES);
  const next: ContextPack = { ...pack, notes };
  saveContextPack(next);
  return loadContextPack(id)!;
}

export function clearContextPack(roomId?: string): ContextPack {
  const session = loadSession();
  const id = roomId ?? session?.roomId;
  if (!id) throw new Error("No session — join a room first");
  const next = emptyPack(id, session?.roomName);
  saveContextPack(next);
  return next;
}

export function formatContextPack(pack: ContextPack): string {
  const lines = [
    `Context pack (room ${pack.roomName ?? pack.roomId})`,
    `  file: ${packPathForRoom(pack.roomId)}`,
    `  updated: ${pack.updatedAt}`,
    "",
    "Summary:",
    pack.summary ? `  ${pack.summary.replace(/\n/g, "\n  ")}` : "  (empty)",
    "",
    `Paths (${pack.paths.length}):`,
  ];
  if (pack.paths.length === 0) lines.push("  (none)");
  for (const p of pack.paths) {
    lines.push(
      p.label ? `  - ${p.path}  (${p.label})` : `  - ${p.path}`,
    );
  }
  lines.push("", `Notes (${pack.notes.length}):`);
  if (pack.notes.length === 0) lines.push("  (none)");
  for (const n of pack.notes) {
    lines.push(`  • ${n}`);
  }
  return lines.join("\n");
}

export type PackToAttachmentsOpts = {
  /**
   * L-5: embed file bodies for allowlisted **files** (not dirs).
   * Paths are **re-resolved** at read time (TOCTOU) — escaped/missing paths are skipped.
   */
  embedFiles?: boolean;
  /** Allow root for re-resolve (default: process.cwd()) */
  cwd?: string;
};

/**
 * Build handoff attachments from pack (summary + paths + notes).
 * Optional L-5 file-body embed via `embedFiles` (opt-in only).
 * Receivers must still treat path attachments as **display metadata**, not auto-open FS paths.
 */
export function packToAttachments(
  pack: ContextPack,
  opts?: PackToAttachmentsOpts,
): HandoffAttachment[] {
  const out: HandoffAttachment[] = [];
  if (pack.summary.trim()) {
    out.push({
      kind: "text",
      label: "context-pack-summary",
      content: sanitizePeerText(pack.summary).slice(0, MAX_SUMMARY),
    });
  }
  for (const p of pack.paths) {
    // L-3: fixed prefix so receivers can identify pack paths
    const userLabel = p.label ? sanitizePeerText(p.label).slice(0, 80) : "";
    out.push({
      kind: "path",
      label: userLabel
        ? `context-pack-path:${userLabel}`
        : "context-pack-path",
      content: sanitizePeerText(p.path),
    });
  }
  if (pack.notes.length) {
    out.push({
      kind: "text",
      label: "context-pack-notes",
      content: sanitizePeerText(pack.notes.map((n) => `• ${n}`).join("\n")),
    });
  }
  if (opts?.embedFiles) {
    out.push(...embedPackFileBodies(pack, opts.cwd));
  }
  return out;
}

/**
 * L-5 + L-27: re-resolve allowlist at embed time, then read via fd.
 * Prefer O_NOFOLLOW so a last-component symlink swap after realpath is rejected;
 * re-check allowlist after open before using bytes.
 * Skips: outside allow root, missing, directories, oversized, binary (NUL bytes).
 */
export function embedPackFileBodies(
  pack: ContextPack,
  cwd?: string,
): HandoffAttachment[] {
  const out: HandoffAttachment[] = [];
  for (const p of pack.paths) {
    if (out.length >= MAX_PACK_EMBED_FILES) break;
    const text = readAllowlistedFileText(p.path, cwd);
    if (text == null) continue;
    const rel = sanitizePeerText(p.path).slice(0, 120);
    out.push({
      kind: "text",
      label: `context-pack-file:${rel}`,
      content: sanitizePeerText(text).slice(0, MAX_ATTACHMENT_CONTENT_CHARS),
    });
  }
  return out;
}

/**
 * L-27: open+fstat+read from fd under allowlist (mitigate path swap TOCTOU).
 * Returns utf8 text or null to skip.
 */
export function readAllowlistedFileText(
  inputPath: string,
  cwd?: string,
): string | null {
  const allowRoot = cwd ?? process.cwd();
  const resolved = resolveAllowlistedPath(inputPath, allowRoot);
  if (!resolved.ok) return null;

  let fd: number | undefined;
  try {
    fd = openAllowlistedFd(resolved.abs);
    const st = fstatSync(fd);
    if (!st.isFile()) return null;
    if (st.size > MAX_PACK_EMBED_FILE_BYTES) return null;

    // Re-check allowlist after open (path string) before trusting contents
    const again = resolveAllowlistedPath(resolved.abs, allowRoot);
    if (!again.ok || again.abs !== resolved.abs) return null;

    const buf = Buffer.alloc(st.size);
    let offset = 0;
    while (offset < st.size) {
      const n = readSync(fd, buf, offset, st.size - offset, offset);
      if (n <= 0) break;
      offset += n;
    }
    if (offset !== st.size) return null;
    if (buf.includes(0)) return null; // binary

    let text = buf.toString("utf8");
    if (text.length > MAX_PACK_EMBED_FILE_CHARS) {
      text =
        text.slice(0, MAX_PACK_EMBED_FILE_CHARS) +
        "\n…[truncated for pack embed]";
    }
    return text;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        /* ignore */
      }
    }
  }
}

function openAllowlistedFd(abs: string): number {
  // Unix: refuse if final path component is a symlink (classic check→read race).
  const nofollow = (fsConstants as { O_NOFOLLOW?: number }).O_NOFOLLOW;
  if (typeof nofollow === "number" && nofollow !== 0) {
    try {
      return openSync(abs, fsConstants.O_RDONLY | nofollow);
    } catch {
      // ELOOP / EPERM when final component is symlink — do not follow.
      throw new Error("open O_NOFOLLOW failed");
    }
  }
  // Platforms without O_NOFOLLOW: still open by realpath'd path (weaker).
  return openSync(abs, fsConstants.O_RDONLY);
}

export function packIsEmpty(pack: ContextPack): boolean {
  return (
    !pack.summary.trim() && pack.paths.length === 0 && pack.notes.length === 0
  );
}
