/**
 * Purpose card — room-scoped local purpose (PLAN 0.15.1).
 * verify[] write: CLI only (M-24). MCP must use allowVerify: false.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { sanitizePeerText } from "@loom/protocol";
import { loadSession, loomDir } from "./session-store";
import {
  readJsonFile,
  writeAtomicJson,
  withFileLock,
} from "./atomic-json";

export const PURPOSE_VERSION = 1 as const;

export type PurposeV1 = {
  v: typeof PURPOSE_VERSION;
  roomId: string;
  roomName?: string;
  purpose: string;
  successCriteria: string[];
  outOfScope: string[];
  verify: string[];
  notes?: string;
  updatedAt: string;
  updatedByPeerId?: string;
};

const MAX_PURPOSE = 500;
const MAX_CRITERIA = 12;
const MAX_CRITERIA_LEN = 300;
const MAX_OUT = 12;
const MAX_VERIFY = 8;
const MAX_VERIFY_LEN = 200;
const MAX_NOTE = 2000;

function purposesDir(): string {
  return join(loomDir(), "purposes");
}

export function purposePathForRoom(roomId: string): string {
  const h = createHash("sha256").update(roomId).digest("hex").slice(0, 16);
  return join(purposesDir(), `${h}.json`);
}

export function verifyAckPathForRoom(roomId: string): string {
  const h = createHash("sha256").update(roomId).digest("hex").slice(0, 16);
  return join(purposesDir(), `${h}.verify-ack`);
}

export function emptyPurpose(roomId: string, roomName?: string): PurposeV1 {
  return {
    v: 1,
    roomId,
    roomName,
    purpose: "",
    successCriteria: [],
    outOfScope: [],
    verify: [],
    updatedAt: new Date().toISOString(),
  };
}

function requireRoomId(roomId?: string): {
  id: string;
  roomName?: string;
  peerId?: string;
} {
  const session = loadSession();
  const id = roomId ?? session?.roomId;
  if (!id) throw new Error("No session — join a room first");
  return {
    id,
    roomName: session?.roomName,
    peerId: session?.peerId,
  };
}

function clampList(items: string[], maxN: number, maxLen: number): string[] {
  return items
    .map((s) => sanitizePeerText(s).slice(0, maxLen))
    .filter(Boolean)
    .slice(0, maxN);
}

export function parsePurpose(raw: unknown, roomId: string): PurposeV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return null;
  if (typeof o.roomId === "string" && o.roomId !== roomId) {
    // allow migrate if file stolen name — still require match
    return null;
  }
  return {
    v: 1,
    roomId,
    roomName: typeof o.roomName === "string" ? o.roomName : undefined,
    purpose:
      typeof o.purpose === "string"
        ? sanitizePeerText(o.purpose).slice(0, MAX_PURPOSE)
        : "",
    successCriteria: Array.isArray(o.successCriteria)
      ? clampList(
          o.successCriteria.map(String),
          MAX_CRITERIA,
          MAX_CRITERIA_LEN,
        )
      : [],
    outOfScope: Array.isArray(o.outOfScope)
      ? clampList(o.outOfScope.map(String), MAX_OUT, MAX_CRITERIA_LEN)
      : [],
    verify: Array.isArray(o.verify)
      ? clampList(o.verify.map(String), MAX_VERIFY, MAX_VERIFY_LEN)
      : [],
    notes:
      typeof o.notes === "string"
        ? sanitizePeerText(o.notes).slice(0, MAX_NOTE)
        : undefined,
    updatedAt:
      typeof o.updatedAt === "string" ? o.updatedAt : new Date().toISOString(),
    updatedByPeerId:
      typeof o.updatedByPeerId === "string" ? o.updatedByPeerId : undefined,
  };
}

export function loadPurpose(roomId?: string): PurposeV1 | null {
  const { id } = requireRoomId(roomId);
  const path = purposePathForRoom(id);
  if (!existsSync(path)) return null;
  const raw = readJsonFile(path);
  if (raw === null) return null;
  const p = parsePurpose(raw, id);
  if (!p) {
    throw new Error(`Invalid purpose schema at ${path}`);
  }
  return p;
}

export type SetPurposeInput = {
  purpose?: string;
  successCriteria?: string[];
  outOfScope?: string[];
  /** Only applied when allowVerify is true (CLI). */
  verify?: string[];
  notes?: string;
  roomId?: string;
  /**
   * M-24: MCP must pass false/omit. CLI purpose set passes true to write verify[].
   * If allowVerify is false and verify is present → throw.
   */
  allowVerify?: boolean;
};

export function setPurpose(input: SetPurposeInput): PurposeV1 {
  const { id, roomName, peerId } = requireRoomId(input.roomId);
  if (
    input.allowVerify !== true &&
    input.verify !== undefined
  ) {
    // M-24: explicit error (not silent drop)
    throw new Error(
      "verify[] cannot be set via MCP/set_purpose (M-24). Use CLI: loom purpose set --verify …",
    );
  }

  const path = purposePathForRoom(id);
  return withFileLock(path, () => {
    const prev = loadPurpose(id) ?? emptyPurpose(id, roomName);
    const next: PurposeV1 = {
      ...prev,
      roomId: id,
      roomName: roomName ?? prev.roomName,
      purpose:
        input.purpose !== undefined
          ? sanitizePeerText(input.purpose).slice(0, MAX_PURPOSE)
          : prev.purpose,
      successCriteria:
        input.successCriteria !== undefined
          ? clampList(input.successCriteria, MAX_CRITERIA, MAX_CRITERIA_LEN)
          : prev.successCriteria,
      outOfScope:
        input.outOfScope !== undefined
          ? clampList(input.outOfScope, MAX_OUT, MAX_CRITERIA_LEN)
          : prev.outOfScope,
      verify:
        input.allowVerify === true && input.verify !== undefined
          ? clampList(input.verify, MAX_VERIFY, MAX_VERIFY_LEN)
          : prev.verify,
      notes:
        input.notes !== undefined
          ? sanitizePeerText(input.notes).slice(0, MAX_NOTE)
          : prev.notes,
      updatedAt: new Date().toISOString(),
      updatedByPeerId: peerId,
    };
    writeAtomicJson(path, next);
    return next;
  });
}

export function clearPurpose(roomId?: string): void {
  const { id } = requireRoomId(roomId);
  const path = purposePathForRoom(id);
  withFileLock(path, () => {
    writeAtomicJson(path, emptyPurpose(id));
  });
}

export function formatPurpose(p: PurposeV1): string {
  const lines = [
    `Purpose (room ${p.roomName ?? p.roomId})`,
    `  file: ${purposePathForRoom(p.roomId)}`,
    `  updated: ${p.updatedAt}${p.updatedByPeerId ? ` by ${p.updatedByPeerId}` : ""}`,
    "",
    "Purpose:",
    p.purpose ? `  ${p.purpose}` : "  (empty)",
    "",
    `Success criteria (${p.successCriteria.length}):`,
  ];
  if (p.successCriteria.length === 0) lines.push("  (none)");
  for (const c of p.successCriteria) lines.push(`  • ${c}`);
  lines.push("", `Out of scope (${p.outOfScope.length}):`);
  if (p.outOfScope.length === 0) lines.push("  (none)");
  for (const c of p.outOfScope) lines.push(`  • ${c}`);
  lines.push("", `Verify recipes (${p.verify.length}) [CLI-only write]:`);
  if (p.verify.length === 0) lines.push("  (none)");
  for (const c of p.verify) lines.push(`  $ ${c}`);
  if (p.notes) {
    lines.push("", "Notes:", `  ${p.notes}`);
  }
  return lines.join("\n");
}

/** Hash of verify[] for M-25 ack. */
export function hashVerifyList(verify: string[]): string {
  return createHash("sha256")
    .update(JSON.stringify(verify))
    .digest("hex")
    .slice(0, 32);
}

export function readVerifyAck(roomId: string): string | null {
  const path = verifyAckPathForRoom(roomId);
  if (!existsSync(path)) return null;
  try {
    const raw = readJsonFile(path);
    if (raw && typeof raw === "object" && typeof (raw as { hash?: string }).hash === "string") {
      return (raw as { hash: string }).hash;
    }
  } catch {
    /* */
  }
  return null;
}

export function writeVerifyAck(roomId: string, hash: string): void {
  const path = verifyAckPathForRoom(roomId);
  writeAtomicJson(path, {
    v: 1,
    roomId,
    hash,
    ackedAt: new Date().toISOString(),
  });
}

/** Attachment-friendly purpose summary for --with-purpose */
export function purposeAsAttachment(p: PurposeV1): {
  kind: "text";
  label: string;
  content: string;
} {
  return {
    kind: "text",
    label: "loom-purpose-v1",
    content: formatPurpose(p).slice(0, 50_000),
  };
}
