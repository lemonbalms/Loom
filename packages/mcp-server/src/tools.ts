import {
  loadSession,
  opsListPeers,
  opsHandoff,
  opsChat,
  opsListInbox,
  opsClaim,
  loadContextPack,
  packIsEmpty,
  loadTaskBoard,
  addTask,
  updateTask,
  parseTaskStatus,
  addTaskFromHandoff,
  exportBoardSnapshot,
  importBoardSnapshot,
  loadPurpose,
  setPurpose,
  formatPurpose,
  type ContextPack,
  type TaskBoard,
  type TaskItem,
  type TaskStatus,
  type BoardSnapshot,
  type PurposeV1,
} from "@loom/host";
import type { PeerInfo, InboxEntry } from "@loom/protocol";

export async function toolListPeers(): Promise<{
  peers: PeerInfo[];
  roomName: string;
  inviteCode: string;
  via?: string;
}> {
  const r = await opsListPeers();
  return {
    peers: r.peers,
    roomName: r.roomName,
    inviteCode: r.inviteCode,
    via: r.source,
  };
}

export async function toolHandoff(args: {
  to: string;
  body: string;
  mode?: "message" | "task";
  withPack?: boolean;
  /** L-5: embed pack file bodies (implies withPack) */
  withPackEmbed?: boolean;
  withBoard?: boolean;
  /** Create/link a board task for this handoff */
  trackBoard?: boolean;
}): Promise<{
  status: "queued" | "delivered" | "peer_unknown";
  to: string;
  handoffId: string;
  notified: boolean;
  recipientCount: number;
  via?: string;
  packAttached?: boolean;
  packEmbedded?: boolean;
  boardAttached?: boolean;
  taskId?: string;
}> {
  const ack = await opsHandoff({
    ...args,
    withPack: Boolean(args.withPack || args.withPackEmbed),
    withPackEmbed: Boolean(args.withPackEmbed),
  });
  let taskId: string | undefined;
  const track =
    args.trackBoard || args.mode === "task";
  if (
    track &&
    ack.handoffId &&
    ack.status !== "peer_unknown" &&
    loadSession()
  ) {
    try {
      const assignee =
        args.to === "*" ? undefined : args.to.replace(/^@/, "");
      const task = addTaskFromHandoff({
        title: args.body.slice(0, 200) || "handoff task",
        assignee,
        handoffId: ack.handoffId,
      });
      taskId = task.id;
    } catch {
      /* board optional */
    }
  }
  return {
    status: ack.status,
    to: ack.to,
    handoffId: ack.handoffId,
    notified: ack.notified,
    recipientCount: ack.recipientCount,
    via: ack.source,
    packAttached: ack.packAttached,
    packEmbedded: ack.packEmbedded,
    boardAttached: ack.boardAttached,
    taskId,
  };
}

export async function toolGetContextPack(): Promise<{
  pack: ContextPack | null;
  empty: boolean;
}> {
  if (!loadSession()) {
    return { pack: null, empty: true };
  }
  const pack = loadContextPack();
  return {
    pack,
    empty: !pack || packIsEmpty(pack),
  };
}

export async function toolListTasks(): Promise<{
  board: TaskBoard | null;
  count: number;
}> {
  if (!loadSession()) {
    return { board: null, count: 0 };
  }
  const board = loadTaskBoard();
  return { board, count: board?.tasks.length ?? 0 };
}

export async function toolAddTask(args: {
  title: string;
  assignee?: string;
  status?: string;
  notes?: string;
}): Promise<{ task: TaskItem }> {
  if (!loadSession()) {
    throw new Error("No Loom session.");
  }
  const status = args.status
    ? parseTaskStatus(args.status) ?? undefined
    : undefined;
  const task = addTask({
    title: args.title,
    assignee: args.assignee,
    status: status as TaskStatus | undefined,
    notes: args.notes,
  });
  return { task };
}

export async function toolUpdateTask(args: {
  id: string;
  status?: string;
  assignee?: string;
  title?: string;
  notes?: string;
}): Promise<{ task: TaskItem }> {
  if (!loadSession()) {
    throw new Error("No Loom session.");
  }
  const status = args.status
    ? parseTaskStatus(args.status) ?? undefined
    : undefined;
  if (args.status && !status) {
    throw new Error(
      `Invalid status: ${args.status}. Use todo|doing|done|blocked|cancelled`,
    );
  }
  const task = updateTask(args.id, {
    status: status as TaskStatus | undefined,
    assignee: args.assignee,
    title: args.title,
    notes: args.notes,
  });
  return { task };
}

export async function toolExportBoard(): Promise<{ snapshot: BoardSnapshot }> {
  if (!loadSession()) throw new Error("No Loom session.");
  return { snapshot: exportBoardSnapshot() };
}

export async function toolImportBoard(args: {
  snapshot: unknown;
  mode?: "merge" | "replace";
  force?: boolean;
}): Promise<{ board: TaskBoard; mode: string }> {
  if (!loadSession()) throw new Error("No Loom session.");
  const mode = args.mode === "replace" ? "replace" : "merge";
  const board = importBoardSnapshot(args.snapshot, mode, undefined, {
    force: Boolean(args.force),
  });
  return { board, mode };
}

export async function toolRoomChat(args: {
  text: string;
}): Promise<{ ok: true; via?: string }> {
  const r = await opsChat(args.text);
  return { ok: true, via: r.source };
}

export async function toolCheckHandoffs(): Promise<{
  entries: InboxEntry[];
  count: number;
  via?: string;
}> {
  const r = await opsListInbox();
  return { entries: r.entries, count: r.count, via: r.source };
}

export async function toolGetPurpose(): Promise<{
  purpose: PurposeV1 | null;
  formatted: string | null;
}> {
  if (!loadSession()) {
    return { purpose: null, formatted: null };
  }
  try {
    const purpose = loadPurpose();
    return {
      purpose,
      formatted: purpose ? formatPurpose(purpose) : null,
    };
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e));
  }
}

/**
 * M-24: never accepts verify[] — setPurpose throws if verify present without allowVerify.
 */
export async function toolSetPurpose(args: {
  purpose?: string;
  successCriteria?: string[];
  outOfScope?: string[];
  notes?: string;
  /** Rejected if present (M-24). */
  verify?: string[];
}): Promise<{ purpose: PurposeV1 }> {
  if (!loadSession()) throw new Error("No Loom session.");
  if (args.verify !== undefined) {
    throw new Error(
      "verify[] cannot be set via MCP set_purpose (M-24). Use CLI: loom purpose set --verify …",
    );
  }
  const purpose = setPurpose({
    purpose: args.purpose,
    successCriteria: args.successCriteria,
    outOfScope: args.outOfScope,
    notes: args.notes,
    allowVerify: false,
  });
  return { purpose };
}

export async function toolClaimHandoff(args: {
  id: string;
}): Promise<{
  ok: boolean;
  entry?: InboxEntry;
  error?: string;
  via?: string;
}> {
  if (!loadSession()) {
    return {
      ok: false,
      error:
        "No Loom session. Run `loom room create` or `loom room join` first.",
    };
  }
  const result = await opsClaim(args.id, "claim");
  return {
    ok: result.ok,
    entry: result.entry,
    error: result.error,
    via: result.source,
  };
}
