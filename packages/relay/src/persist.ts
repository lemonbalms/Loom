/**
 * P2 durable relay state (PLAN 0.14.1).
 * - Atomic JSON write (temp + rename + 0600)
 * - M-23: pid-ownership exclusive process lock on state dir
 * - Corrupt: backup + skip room (never silent empty success)
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  chmodSync,
  copyFileSync,
  readdirSync,
  statSync,
  lstatSync,
  realpathSync,
  unlinkSync,
  rmSync,
} from "node:fs";
import { join, dirname, basename, resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import type { HandoffPayload, PeerInfo } from "@loom/protocol";

export const ROOM_SNAPSHOT_VERSION = 1 as const;

export type RoomSnapshotV1 = {
  v: typeof ROOM_SNAPSHOT_VERSION;
  room: {
    id: string;
    name: string;
    inviteCode: string;
    createdAt: string;
  };
  members: Array<{
    peer: {
      id: string;
      displayName: string;
      color: string;
      agentKind: string;
      joinedAt: string;
    };
    secret: string;
  }>;
  inboxes: Record<
    string,
    Array<{
      status: "queued" | "notified";
      toPeerId: string;
      handoff: HandoffPayload;
    }>
  >;
  colorIndex: number;
  updatedAt: string;
};

const LOCK_STALE_MS = 5000;

/** Standalone/remote default — gate-exempt (M-21); auto-daemon must pass LOOM_RELAY_STATE_DIR. */
export function defaultRelayStateDir(): string {
  return join(homedir(), ".loom", "relay-state");
}

export function roomStatePath(stateDir: string, roomId: string): string {
  const h = createHash("sha256").update(roomId).digest("hex").slice(0, 16);
  return join(stateDir, `${h}.json`);
}

function isPidAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function processLockDir(stateDir: string): string {
  return join(stateDir, ".relay-writer.lock");
}

function lockPidPath(lockDir: string): string {
  return join(lockDir, "owner.pid");
}

/**
 * M-23: exclusive writer for entire state dir (process lifetime).
 * Fails loud if another live process holds the lock.
 */
export function acquireStateDirLock(stateDir: string): void {
  mkdirSync(stateDir, { recursive: true });
  const lockDir = processLockDir(stateDir);
  const tryAcquire = (): boolean => {
    try {
      mkdirSync(lockDir);
    } catch {
      return false;
    }
    try {
      writeFileSync(lockPidPath(lockDir), `${process.pid}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
      return true;
    } catch {
      try {
        rmSync(lockDir, { recursive: true, force: true });
      } catch {
        /* */
      }
      return false;
    }
  };

  if (tryAcquire()) return;

  // reclaim only if owner dead
  try {
    const age = Date.now() - statSync(lockDir).mtimeMs;
    let owner: number | null = null;
    try {
      const raw = readFileSync(lockPidPath(lockDir), "utf8").trim();
      const n = Number(raw);
      owner = Number.isFinite(n) ? n : null;
    } catch {
      owner = null;
    }
    if (age >= LOCK_STALE_MS && (owner === null || !isPidAlive(owner))) {
      try {
        rmSync(lockDir, { recursive: true, force: true });
      } catch {
        /* */
      }
      if (tryAcquire()) return;
    }
    const who = owner !== null ? `pid ${owner}` : "unknown owner";
    throw new Error(
      `Relay state dir locked by another process (${who}): ${lockDir}\n` +
        `Only one durable relay may use this directory (M-23).`,
    );
  } catch (e) {
    if (e instanceof Error && e.message.includes("M-23")) throw e;
    throw new Error(
      `Failed to acquire relay state lock at ${lockDir}: ${e instanceof Error ? e.message : e}`,
    );
  }
}

export function releaseStateDirLock(stateDir: string): void {
  const lockDir = processLockDir(stateDir);
  if (!existsSync(lockDir)) return;
  try {
    const raw = readFileSync(lockPidPath(lockDir), "utf8").trim();
    const owner = Number(raw);
    if (Number.isFinite(owner) && owner !== process.pid) return;
  } catch {
    /* force if unreadable and we created it */
  }
  try {
    rmSync(lockDir, { recursive: true, force: true });
  } catch {
    /* */
  }
}

/**
 * Atomic JSON write (temp + rename + 0600).
 * Hardened vs symlink write-through / TOCTOU:
 * - parent resolved via realpath
 * - existing symlink at final path is unlinked (never write-through)
 * - tmp and final stay under the resolved parent directory
 */
export function writeAtomicJson(filePath: string, data: unknown): void {
  const parent = dirname(resolve(filePath));
  mkdirSync(parent, { recursive: true });
  let realParent: string;
  try {
    realParent = realpathSync(parent);
  } catch {
    realParent = parent;
  }
  const base = basename(filePath);
  if (!base || base === "." || base === "..") {
    throw new Error(`Invalid snapshot basename: ${filePath}`);
  }
  const finalPath = join(realParent, base);

  // If final path is a symlink, remove it so rename does not write through to target
  try {
    const st = lstatSync(finalPath);
    if (st.isSymbolicLink()) {
      unlinkSync(finalPath);
    } else if (st.isDirectory()) {
      throw new Error(`Refusing to overwrite directory: ${finalPath}`);
    }
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err?.code !== "ENOENT") {
      if (e instanceof Error && e.message.startsWith("Refusing")) throw e;
      // other lstat errors: continue; rename will surface
    }
  }

  const tmp = join(
    realParent,
    `.${base}.tmp.${process.pid}.${Date.now()}`,
  );
  const body = JSON.stringify(data, null, 2) + "\n";
  try {
    writeFileSync(tmp, body, { encoding: "utf8", mode: 0o600 });
    renameSync(tmp, finalPath);
    try {
      chmodSync(finalPath, 0o600);
    } catch {
      /* */
    }
  } catch (e) {
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {
      /* */
    }
    throw e;
  }
}

/**
 * Read JSON. Missing → null.
 * Corrupt → backup + throw (caller skips room).
 */
function readJsonFile(filePath: string): unknown | null {
  if (!existsSync(filePath)) return null;
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (e) {
    throw new Error(
      `Failed to read ${filePath}: ${e instanceof Error ? e.message : e}`,
    );
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch (e) {
    const bak = `${filePath}.corrupt-${Date.now()}`;
    try {
      copyFileSync(filePath, bak);
    } catch {
      /* */
    }
    throw new Error(
      `Corrupt JSON at ${filePath} (backed up to ${bak}): ${e instanceof Error ? e.message : e}`,
    );
  }
}

function isPeerInfoShape(p: unknown): p is RoomSnapshotV1["members"][0]["peer"] {
  if (!p || typeof p !== "object") return false;
  const o = p as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.displayName === "string" &&
    typeof o.color === "string" &&
    typeof o.agentKind === "string" &&
    typeof o.joinedAt === "string"
  );
}

function parseRoomSnapshot(raw: unknown): RoomSnapshotV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return null;
  const room = o.room as Record<string, unknown> | undefined;
  if (
    !room ||
    typeof room.id !== "string" ||
    typeof room.name !== "string" ||
    typeof room.inviteCode !== "string" ||
    typeof room.createdAt !== "string"
  ) {
    return null;
  }
  if (!Array.isArray(o.members)) return null;
  const members: RoomSnapshotV1["members"] = [];
  for (const m of o.members) {
    if (!m || typeof m !== "object") continue;
    const mm = m as Record<string, unknown>;
    if (!isPeerInfoShape(mm.peer) || typeof mm.secret !== "string") continue;
    members.push({ peer: mm.peer, secret: mm.secret });
  }
  const inboxes: RoomSnapshotV1["inboxes"] = {};
  const rawInboxes = o.inboxes;
  if (rawInboxes && typeof rawInboxes === "object") {
    for (const [peerId, entries] of Object.entries(
      rawInboxes as Record<string, unknown>,
    )) {
      if (!Array.isArray(entries)) continue;
      const list: RoomSnapshotV1["inboxes"][string] = [];
      for (const e of entries) {
        if (!e || typeof e !== "object") continue;
        const ee = e as Record<string, unknown>;
        if (ee.status !== "queued" && ee.status !== "notified") continue;
        if (typeof ee.toPeerId !== "string" || !ee.handoff) continue;
        list.push({
          status: ee.status,
          toPeerId: ee.toPeerId,
          handoff: ee.handoff as HandoffPayload,
        });
      }
      inboxes[peerId] = list;
    }
  }
  return {
    v: 1,
    room: {
      id: room.id,
      name: room.name,
      inviteCode: room.inviteCode,
      createdAt: room.createdAt,
    },
    members,
    inboxes,
    colorIndex: typeof o.colorIndex === "number" ? o.colorIndex : 0,
    updatedAt:
      typeof o.updatedAt === "string" ? o.updatedAt : new Date().toISOString(),
  };
}

export type LoadAllResult = {
  snapshots: RoomSnapshotV1[];
  errors: string[];
};

/** Load all room snapshots under stateDir (skip corrupt with log message). */
export function loadAllSnapshots(stateDir: string): LoadAllResult {
  const snapshots: RoomSnapshotV1[] = [];
  const errors: string[] = [];
  if (!existsSync(stateDir)) return { snapshots, errors };
  let names: string[];
  try {
    names = readdirSync(stateDir);
  } catch (e) {
    errors.push(
      `Cannot read state dir ${stateDir}: ${e instanceof Error ? e.message : e}`,
    );
    return { snapshots, errors };
  }
  for (const name of names) {
    if (!name.endsWith(".json") || name.startsWith(".")) continue;
    const path = join(stateDir, name);
    try {
      const st = statSync(path);
      if (!st.isFile()) continue;
    } catch {
      continue;
    }
    try {
      const raw = readJsonFile(path);
      if (raw === null) continue;
      const snap = parseRoomSnapshot(raw);
      if (!snap) {
        errors.push(`Invalid snapshot schema: ${path}`);
        continue;
      }
      snapshots.push(snap);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  return { snapshots, errors };
}

export function saveRoomSnapshot(
  stateDir: string,
  snap: RoomSnapshotV1,
): void {
  // Ensure path stays under realpath(stateDir)
  mkdirSync(stateDir, { recursive: true });
  let realState: string;
  try {
    realState = realpathSync(stateDir);
  } catch {
    realState = resolve(stateDir);
  }
  const path = roomStatePath(realState, snap.room.id);
  if (!path.startsWith(realState + sep) && path !== realState) {
    throw new Error(`Snapshot path escapes state dir: ${path}`);
  }
  writeAtomicJson(path, snap);
}

/** Map PeerInfo for snapshot (online not stored). */
export function peerForSnapshot(
  p: PeerInfo,
): RoomSnapshotV1["members"][0]["peer"] {
  return {
    id: p.id,
    displayName: p.displayName,
    color: p.color,
    agentKind: p.agentKind,
    joinedAt: p.joinedAt,
  };
}
