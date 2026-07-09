/**
 * Phase 4.2 — Task board (local, room-scoped).
 *
 * v1: todo | doing | done | blocked | cancelled
 * Same OS user + roomId → shared board file (like context pack).
 * Not relay-synced; multi-machine needs export/handoff or later remote store.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  generateTaskId,
  sanitizePeerText,
  sanitizePeerName,
  type HandoffAttachment,
} from "@loom/protocol";
import { loadSession, loomDir } from "./session-store";
import {
  readJsonFile,
  writeAtomicJson,
  withFileLock,
} from "./atomic-json";

export const TASK_BOARD_VERSION = 1 as const;

export type TaskStatus =
  | "todo"
  | "doing"
  | "done"
  | "blocked"
  | "cancelled";

export const TASK_STATUSES: TaskStatus[] = [
  "todo",
  "doing",
  "done",
  "blocked",
  "cancelled",
];

export type TaskItem = {
  id: string;
  title: string;
  status: TaskStatus;
  /** @displayName or peer id */
  assignee?: string;
  handoffId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  createdByPeerId?: string;
};

export type TaskBoard = {
  v: typeof TASK_BOARD_VERSION;
  roomId: string;
  roomName?: string;
  tasks: TaskItem[];
  updatedAt: string;
};

const MAX_TITLE = 200;
const MAX_NOTE = 1000;
const MAX_TASKS = 200;

function boardsDir(): string {
  return join(loomDir(), "boards");
}

export function boardPathForRoom(roomId: string): string {
  const h = createHash("sha256").update(roomId).digest("hex").slice(0, 16);
  return join(boardsDir(), `${h}.json`);
}

export function emptyBoard(roomId: string, roomName?: string): TaskBoard {
  return {
    v: TASK_BOARD_VERSION,
    roomId,
    roomName,
    tasks: [],
    updatedAt: new Date().toISOString(),
  };
}

function requireRoomId(roomId?: string): { id: string; roomName?: string; peerId?: string } {
  const session = loadSession();
  const id = roomId ?? session?.roomId;
  if (!id) throw new Error("No session — join a room first");
  return {
    id,
    roomName: session?.roomName,
    peerId: session?.peerId,
  };
}

const TASK_ID_RE = /^task_[a-f0-9]+$/i;
const HANDOFF_ID_RE = /^ho_[a-f0-9]+$/i;

function coerceId(raw: string | undefined, re: RegExp, fallback: string): string {
  if (raw && re.test(raw)) return raw;
  return fallback;
}

/**
 * M-8: resolve task by exact id, then unique suffix. Never includes().
 * Empty query and ambiguous matches throw.
 */
export function resolveTaskIndex(tasks: TaskItem[], query: string): number {
  const q = query.trim();
  if (!q) throw new Error("task id required");
  const exact = tasks
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t.id === q);
  if (exact.length === 1) return exact[0]!.i;
  if (exact.length > 1) {
    throw new Error(`ambiguous task id: ${q}`);
  }
  const ends = tasks
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t.id.endsWith(q));
  if (ends.length === 1) return ends[0]!.i;
  if (ends.length > 1) {
    throw new Error(
      `ambiguous task id "${q}" matches ${ends.length} tasks — use full id`,
    );
  }
  throw new Error(`task not found: ${q}`);
}

export function loadTaskBoard(roomId?: string): TaskBoard | null {
  const session = loadSession();
  const id = roomId ?? session?.roomId;
  if (!id) return null;
  const p = boardPathForRoom(id);
  if (!existsSync(p)) {
    return emptyBoard(id, session?.roomName);
  }
  // H-7: corrupt → backup + throw (never silent emptyBoard)
  const raw = readJsonFile(p) as TaskBoard;
  if (!raw || typeof raw !== "object") {
    return emptyBoard(id, session?.roomName);
  }
  if (raw.roomId !== id) return emptyBoard(id, session?.roomName);
  const tasks = (Array.isArray(raw.tasks) ? raw.tasks : [])
    .filter((t) => t && typeof t.id === "string" && typeof t.title === "string")
    .slice(0, MAX_TASKS)
    .map((t) => normalizeTask(t));
  return {
    v: TASK_BOARD_VERSION,
    roomId: id,
    roomName: raw.roomName ?? session?.roomName,
    tasks,
    updatedAt: raw.updatedAt || new Date().toISOString(),
  };
}

/** M-10: accept only reasonable ISO-ish timestamps; clamp to now (no peer future spoof). */
export function normalizeTimestamp(
  raw: string | undefined,
  nowIso: string = new Date().toISOString(),
): string {
  if (!raw || typeof raw !== "string") return nowIso;
  const cleaned = sanitizePeerText(raw).slice(0, 40);
  // require ISO-8601-ish: YYYY-MM-DDTHH:mm:ss…
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(cleaned)) return nowIso;
  const ms = Date.parse(cleaned);
  if (!Number.isFinite(ms)) return nowIso;
  const nowMs = Date.parse(nowIso);
  // clamp future timestamps to now
  if (ms > nowMs) return nowIso;
  // reject absurd past (before 2000)
  if (ms < Date.parse("2000-01-01T00:00:00.000Z")) return nowIso;
  return new Date(ms).toISOString();
}

function normalizeTask(t: TaskItem): TaskItem {
  const now = new Date().toISOString();
  const status = TASK_STATUSES.includes(t.status as TaskStatus)
    ? (t.status as TaskStatus)
    : "todo";
  const id = coerceId(t.id, TASK_ID_RE, generateTaskId());
  const handoffId =
    t.handoffId && HANDOFF_ID_RE.test(t.handoffId) ? t.handoffId : undefined;
  const createdAt = normalizeTimestamp(t.createdAt, now);
  const updatedAt = normalizeTimestamp(t.updatedAt || t.createdAt, now);
  // ensure updatedAt >= createdAt after clamp
  const updatedFinal =
    Date.parse(updatedAt) >= Date.parse(createdAt) ? updatedAt : createdAt;
  return {
    id,
    title: sanitizePeerText(t.title).slice(0, MAX_TITLE) || "untitled",
    status,
    assignee: t.assignee
      ? sanitizePeerName(t.assignee.replace(/^@/, ""))
      : undefined,
    handoffId,
    notes: t.notes ? sanitizePeerText(t.notes).slice(0, MAX_NOTE) : undefined,
    createdAt,
    updatedAt: updatedFinal,
    createdByPeerId: t.createdByPeerId
      ? sanitizePeerText(t.createdByPeerId).slice(0, 64)
      : undefined,
  };
}

export function saveTaskBoard(board: TaskBoard): void {
  const p = boardPathForRoom(board.roomId);
  const toSave: TaskBoard = {
    ...board,
    v: TASK_BOARD_VERSION,
    tasks: board.tasks.slice(0, MAX_TASKS).map(normalizeTask),
    updatedAt: new Date().toISOString(),
  };
  withFileLock(p, () => {
    writeAtomicJson(p, toSave);
  });
}

/** Locked read-modify-write for concurrent agents (H-7). */
function mutateBoard(
  roomId: string,
  roomName: string | undefined,
  mut: (board: TaskBoard) => void,
): TaskBoard {
  const p = boardPathForRoom(roomId);
  return withFileLock(p, () => {
    const board = loadTaskBoard(roomId) ?? emptyBoard(roomId, roomName);
    mut(board);
    const toSave: TaskBoard = {
      ...board,
      v: TASK_BOARD_VERSION,
      tasks: board.tasks.slice(0, MAX_TASKS).map(normalizeTask),
      updatedAt: new Date().toISOString(),
    };
    writeAtomicJson(p, toSave);
    return toSave;
  });
}

export function parseTaskStatus(s: string): TaskStatus | null {
  const x = s.toLowerCase().trim();
  return TASK_STATUSES.includes(x as TaskStatus) ? (x as TaskStatus) : null;
}

export function addTask(opts: {
  title: string;
  assignee?: string;
  handoffId?: string;
  notes?: string;
  status?: TaskStatus;
  roomId?: string;
}): TaskItem {
  const { id, roomName, peerId } = requireRoomId(opts.roomId);
  const now = new Date().toISOString();
  const task: TaskItem = normalizeTask({
    id: generateTaskId(),
    title: opts.title,
    status: opts.status ?? "todo",
    assignee: opts.assignee,
    handoffId: opts.handoffId,
    notes: opts.notes,
    createdAt: now,
    updatedAt: now,
    createdByPeerId: peerId,
  });
  mutateBoard(id, roomName, (board) => {
    if (board.tasks.length >= MAX_TASKS) {
      throw new Error(`max ${MAX_TASKS} tasks on board`);
    }
    board.tasks.push(task);
    board.roomName = roomName ?? board.roomName;
  });
  return task;
}

export function updateTask(
  taskId: string,
  patch: {
    title?: string;
    status?: TaskStatus;
    assignee?: string | null;
    notes?: string | null;
    handoffId?: string | null;
  },
  roomId?: string,
): TaskItem {
  const { id, roomName } = requireRoomId(roomId);
  let updated!: TaskItem;
  mutateBoard(id, roomName, (board) => {
    const idx = resolveTaskIndex(board.tasks, taskId);
    const cur = board.tasks[idx]!;
    const next: TaskItem = {
      ...cur,
      title: patch.title !== undefined ? patch.title : cur.title,
      status: patch.status ?? cur.status,
      assignee:
        patch.assignee === null
          ? undefined
          : patch.assignee !== undefined
            ? patch.assignee
            : cur.assignee,
      notes:
        patch.notes === null
          ? undefined
          : patch.notes !== undefined
            ? patch.notes
            : cur.notes,
      handoffId:
        patch.handoffId === null
          ? undefined
          : patch.handoffId !== undefined
            ? patch.handoffId
            : cur.handoffId,
      updatedAt: new Date().toISOString(),
    };
    board.tasks[idx] = normalizeTask(next);
    updated = board.tasks[idx]!;
  });
  return updated;
}

export function removeTask(taskId: string, roomId?: string): boolean {
  const { id, roomName } = requireRoomId(roomId);
  let removed = false;
  mutateBoard(id, roomName, (board) => {
    try {
      const idx = resolveTaskIndex(board.tasks, taskId);
      board.tasks.splice(idx, 1);
      removed = true;
    } catch {
      removed = false;
    }
  });
  return removed;
}

export function clearDoneTasks(roomId?: string): number {
  const { id, roomName } = requireRoomId(roomId);
  let removed = 0;
  mutateBoard(id, roomName, (board) => {
    const before = board.tasks.length;
    board.tasks = board.tasks.filter(
      (t) => t.status !== "done" && t.status !== "cancelled",
    );
    removed = before - board.tasks.length;
  });
  return removed;
}

export function findTask(taskId: string, roomId?: string): TaskItem | undefined {
  const board = loadTaskBoard(roomId);
  if (!board) return undefined;
  try {
    const idx = resolveTaskIndex(board.tasks, taskId);
    return board.tasks[idx];
  } catch {
    return undefined;
  }
}

export function formatTaskBoard(board: TaskBoard): string {
  const lines = [
    `Task board (room ${board.roomName ?? board.roomId})`,
    `  file: ${boardPathForRoom(board.roomId)}`,
    `  updated: ${board.updatedAt}`,
    `  tasks: ${board.tasks.length}`,
    "",
  ];
  const groups: TaskStatus[] = ["doing", "todo", "blocked", "done", "cancelled"];
  for (const st of groups) {
    const items = board.tasks.filter((t) => t.status === st);
    if (items.length === 0) continue;
    lines.push(`[${st}] (${items.length})`);
    for (const t of items) {
      const who = t.assignee ? ` @${t.assignee}` : "";
      const ho = t.handoffId ? ` ho=${t.handoffId}` : "";
      lines.push(`  ${t.id}  ${t.title}${who}${ho}`);
      if (t.notes) lines.push(`      note: ${t.notes.replace(/\n/g, " ")}`);
    }
    lines.push("");
  }
  if (board.tasks.length === 0) {
    lines.push('(empty)  Tip: loom board add "title" [--as name]');
  }
  return lines.join("\n").trimEnd() + "\n";
}

/** Create a board task from a handoff send (mode=task or explicit). */
export function addTaskFromHandoff(opts: {
  title: string;
  assignee?: string;
  handoffId: string;
  roomId?: string;
}): TaskItem {
  return addTask({
    title: opts.title,
    assignee: opts.assignee,
    handoffId: opts.handoffId,
    status: "todo",
    roomId: opts.roomId,
  });
}

export function boardIsEmpty(board: TaskBoard): boolean {
  return board.tasks.length === 0;
}

/** Portable snapshot (for export / handoff). Room id may differ on import. */
export type BoardSnapshot = {
  v: typeof TASK_BOARD_VERSION;
  kind: "loom-board-snapshot" | "fable-board-snapshot";
  exportedAt: string;
  sourceRoomId: string;
  sourceRoomName?: string;
  tasks: TaskItem[];
};

export function exportBoardSnapshot(roomId?: string): BoardSnapshot {
  const session = loadSession();
  const id = roomId ?? session?.roomId;
  if (!id) throw new Error("No session — join a room first");
  const board = loadTaskBoard(id) ?? emptyBoard(id, session?.roomName);
  return {
    v: TASK_BOARD_VERSION,
    kind: "loom-board-snapshot",
    exportedAt: new Date().toISOString(),
    sourceRoomId: board.roomId,
    sourceRoomName: board.roomName,
    tasks: board.tasks.map(normalizeTask),
  };
}

export function boardToAttachments(board: TaskBoard): HandoffAttachment[] {
  if (boardIsEmpty(board)) return [];
  const snap: BoardSnapshot = {
    v: TASK_BOARD_VERSION,
    kind: "loom-board-snapshot",
    exportedAt: new Date().toISOString(),
    sourceRoomId: board.roomId,
    sourceRoomName: board.roomName,
    tasks: board.tasks.map(normalizeTask),
  };
  return [
    {
      kind: "text",
      label: "loom-board-snapshot",
      content: JSON.stringify(snap),
    },
  ];
}

export function parseBoardSnapshot(raw: unknown): BoardSnapshot {
  if (!raw || typeof raw !== "object") {
    throw new Error("invalid board snapshot");
  }
  const o = raw as Record<string, unknown>;
  if (o.kind !== "loom-board-snapshot" && o.kind !== "fable-board-snapshot") {
    throw new Error("not a loom-board-snapshot (kind missing or wrong)");
  }
  // M-11: always normalize tasks array (never cast raw)
  const tasksRaw = Array.isArray(o.tasks) ? o.tasks : [];
  const now = new Date().toISOString();
  return {
    v: TASK_BOARD_VERSION,
    kind: "loom-board-snapshot" as const,
    exportedAt: normalizeTimestamp(
      typeof o.exportedAt === "string" ? o.exportedAt : undefined,
      now,
    ),
    sourceRoomId: sanitizePeerText(
      typeof o.sourceRoomId === "string" ? o.sourceRoomId : "unknown",
    ).slice(0, 80),
    sourceRoomName:
      typeof o.sourceRoomName === "string"
        ? sanitizePeerText(o.sourceRoomName).slice(0, 120)
        : undefined,
    tasks: tasksRaw
      .filter(
        (t) =>
          t &&
          typeof t === "object" &&
          typeof (t as TaskItem).id === "string" &&
          typeof (t as TaskItem).title === "string",
      )
      .map((t) => normalizeTask(t as TaskItem))
      .slice(0, MAX_TASKS),
  };
}

/**
 * Import snapshot into current room.
 * - replace: overwrite all tasks
 * - merge: by task id, keep newer updatedAt (after M-10 clamp)
 * - force: allow sourceRoomId !== current room (L-9)
 */
export function importBoardSnapshot(
  snapshot: BoardSnapshot | unknown,
  mode: "replace" | "merge" = "merge",
  roomId?: string,
  opts?: { force?: boolean },
): TaskBoard {
  // M-11: always full parse (no kind-only cast shortcut)
  const snap = parseBoardSnapshot(snapshot);
  const { id, roomName } = requireRoomId(roomId);
  if (
    snap.sourceRoomId &&
    snap.sourceRoomId !== "unknown" &&
    snap.sourceRoomId !== id &&
    !opts?.force
  ) {
    throw new Error(
      `snapshot sourceRoomId=${snap.sourceRoomId} ≠ current room ${id}. Re-run with force (CLI --force) if intentional.`,
    );
  }
  const incoming = snap.tasks.map(normalizeTask);

  return mutateBoard(id, roomName, (board) => {
    if (mode === "replace") {
      board.tasks = incoming;
    } else {
      const map = new Map(board.tasks.map((t) => [t.id, t]));
      for (const t of incoming) {
        const cur = map.get(t.id);
        // compare numeric time after normalizeTimestamp (M-10)
        if (
          !cur ||
          Date.parse(t.updatedAt) >= Date.parse(cur.updatedAt)
        ) {
          map.set(t.id, t);
        }
      }
      board.tasks = [...map.values()].slice(0, MAX_TASKS);
    }
    board.roomName = roomName ?? board.roomName;
  });
}

/**
 * M-12: resolve handoff id exact → unique endsWith (same contract as resolveTaskIndex).
 */
export function resolveHandoffEntryIndex<
  T extends { handoff: { id: string } },
>(entries: T[], query: string): number {
  const q = query.trim();
  if (!q) throw new Error("handoff id required");
  const exact = entries
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.handoff.id === q);
  if (exact.length === 1) return exact[0]!.i;
  if (exact.length > 1) {
    throw new Error(`ambiguous handoff id: ${q}`);
  }
  const ends = entries
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.handoff.id.endsWith(q));
  if (ends.length === 1) return ends[0]!.i;
  if (ends.length > 1) {
    throw new Error(
      `ambiguous handoff id "${q}" matches ${ends.length} entries — use full id`,
    );
  }
  throw new Error(`handoff not found: ${q}`);
}

/** Extract board snapshot from handoff attachments (label loom-board-snapshot; legacy fable- accepted). */
export function snapshotFromAttachments(
  attachments?: { label?: string; content: string; kind: string }[],
): BoardSnapshot | null {
  if (!attachments?.length) return null;
  const att = attachments.find(
    (a) => a.label === "loom-board-snapshot" || a.label === "fable-board-snapshot" || a.label?.startsWith("loom-board-snapshot") || a.label?.startsWith("fable-board-snapshot"),
  );
  if (!att?.content) return null;
  try {
    return parseBoardSnapshot(JSON.parse(att.content));
  } catch {
    return null;
  }
}
