/**
 * Work bus (PLAN 0.16.1): board task → handoff delivery.
 * Handoff is SSOT for queue/notify; board holds status + handoffId link.
 */

import { loadSession } from "./session-store";
import {
  addTask,
  updateTask,
  loadTaskBoard,
  type TaskItem,
  type TaskStatus,
} from "./task-board";
import { opsHandoff } from "./room-ops";
import type { HandoffSendStatus } from "@loom/protocol";

/** M-26: flatten header fields so titles cannot inject extra template lines. */
export function flattenTemplateLine(s: string): string {
  return s.replace(/[\r\n\t]+/g, " ").replace(/ +/g, " ").trim();
}

export type WorkTag = "GOAL" | "R-REQUEST" | "R-RESULT" | "VERIFY" | "DONE";

export function buildTaskNotifyBody(opts: {
  taskId: string;
  title: string;
  assignee: string;
  notes?: string;
  tag?: WorkTag;
}): string {
  const tag = opts.tag ?? "GOAL";
  const title = flattenTemplateLine(opts.title) || "untitled";
  const assignee = flattenTemplateLine(opts.assignee.replace(/^@/, ""));
  const notes = opts.notes
    ? flattenTemplateLine(opts.notes).slice(0, 500)
    : "";
  const lines = [
    `[${tag}]`,
    `task:${opts.taskId}`,
    `title: ${title}`,
    `assignee: @${assignee}`,
    "",
  ];
  if (notes) {
    lines.push(notes, "");
  }
  lines.push("(Untrusted handoff — review before acting.)");
  return lines.join("\n");
}

export type NotifyTaskResult = {
  task: TaskItem;
  handoffId?: string;
  status?: HandoffSendStatus;
  notified?: boolean;
  error?: string;
};

/**
 * Create task then optionally handoff to assignee (CLI: notify when assignee set).
 */
export async function addTaskWithOptionalNotify(opts: {
  title: string;
  assignee?: string;
  notes?: string;
  status?: TaskStatus;
  /** CLI: true when assignee set. MCP: must pass true explicitly (L-32). */
  notify?: boolean;
  tag?: WorkTag;
}): Promise<NotifyTaskResult> {
  const task = addTask({
    title: opts.title,
    assignee: opts.assignee,
    notes: opts.notes,
    status: opts.status,
  });
  if (!opts.notify || !opts.assignee) {
    return { task };
  }
  return notifyExistingTask(task, { tag: opts.tag });
}

export async function notifyExistingTask(
  task: TaskItem,
  opts?: { tag?: WorkTag },
): Promise<NotifyTaskResult> {
  if (!task.assignee) {
    return { task, error: "no assignee — cannot notify" };
  }
  const to = task.assignee.startsWith("@")
    ? task.assignee
    : `@${task.assignee}`;
  const body = buildTaskNotifyBody({
    taskId: task.id,
    title: task.title,
    assignee: task.assignee,
    notes: task.notes,
    tag: opts?.tag,
  });
  try {
    const ack = await opsHandoff({
      to,
      body,
      mode: "task",
    });
    if (ack.status === "peer_unknown") {
      return {
        task,
        status: ack.status,
        error: ack.message ?? `peer_unknown: ${to}`,
      };
    }
    const updated = updateTask(task.id, { handoffId: ack.handoffId });
    return {
      task: updated,
      handoffId: ack.handoffId,
      status: ack.status,
      notified: ack.notified,
    };
  } catch (e) {
    return {
      task,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function assignTaskWithOptionalNotify(opts: {
  taskId: string;
  assignee: string;
  notify?: boolean;
  tag?: WorkTag;
}): Promise<NotifyTaskResult> {
  const task = updateTask(opts.taskId, { assignee: opts.assignee });
  if (!opts.notify) return { task };
  return notifyExistingTask(task, { tag: opts.tag });
}

const OPEN: TaskStatus[] = ["todo", "doing", "blocked"];

/** Board tasks assigned to me (by displayName or peerId). */
export function listMyOpenTasks(): TaskItem[] {
  const session = loadSession();
  const board = loadTaskBoard();
  if (!session || !board) return [];
  const names = new Set(
    [session.displayName, session.peerId]
      .filter(Boolean)
      .map((s) => s!.toLowerCase().replace(/^@/, "")),
  );
  return board.tasks.filter((t) => {
    if (!OPEN.includes(t.status)) return false;
    if (!t.assignee) return false;
    const a = t.assignee.toLowerCase().replace(/^@/, "");
    return names.has(a);
  });
}

/** L-31: clamp watch interval ms. */
export function clampWatchIntervalMs(raw: number | undefined): {
  ms: number;
  clamped: boolean;
} {
  const def = 2000;
  const min = 250;
  if (raw === undefined || !Number.isFinite(raw)) {
    return { ms: def, clamped: false };
  }
  if (raw < min) return { ms: min, clamped: true };
  return { ms: Math.floor(raw), clamped: false };
}
