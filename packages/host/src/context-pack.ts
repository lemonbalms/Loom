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
} from "node:fs";
import { join, relative, resolve, isAbsolute } from "node:path";
import { createHash } from "node:crypto";
import {
  sanitizePeerText,
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

/** Build handoff attachments from pack (summary + paths + notes). No file body embed. */
export function packToAttachments(pack: ContextPack): HandoffAttachment[] {
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
  return out;
}

export function packIsEmpty(pack: ContextPack): boolean {
  return (
    !pack.summary.trim() && pack.paths.length === 0 && pack.notes.length === 0
  );
}
