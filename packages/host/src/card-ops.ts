/**
 * Tower-side card dispatch / apply helpers (MCP + tests).
 * Does NOT go through toolHandoff auto-create path — uses opsHandoff directly.
 */
import {
  CARD_DISPATCH_LABEL,
  CARD_RESULT_LABEL,
  CARD_CONTRACT_VERSION,
  CardDispatchPayloadSchema,
  CardResultPayloadSchema,
  type CardDispatchPayload,
  type CardResultPayload,
  buildDispatchBody,
  serializeCardAttachment,
  cardPayloadFromAttachments,
  type DispatchAgentKind,
  type HandoffAttachment,
} from "@loom/protocol";
import { loadSession } from "./session-store";
import { opsHandoff } from "./room-ops";
import {
  loadTaskBoard,
  updateTask,
  findTask,
  resolveTaskIndex,
  type TaskItem,
  type TaskStatus,
} from "./task-board";

export type DispatchCardResult =
  | {
      ok: true;
      status: "queued" | "delivered";
      handoffId: string;
      taskId: string;
      notified: boolean;
    }
  | { ok: false; error: string };

export async function dispatchCard(args: {
  taskId: string;
  node: string;
  prompt: string;
  agentKind?: string;
}): Promise<DispatchCardResult> {
  const session = loadSession();
  if (!session) {
    return { ok: false, error: "No Loom session." };
  }
  const board = loadTaskBoard();
  if (!board) {
    return { ok: false, error: "No task board for this room." };
  }
  let task: TaskItem;
  try {
    const idx = resolveTaskIndex(board.tasks, args.taskId);
    task = board.tasks[idx]!;
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "task not found",
    };
  }

  const node = args.node.replace(/^@/, "").trim();
  if (!node) {
    return { ok: false, error: "node is required (e.g. node/wsl-1)" };
  }
  const agentKind = (args.agentKind?.trim() || "claude") as DispatchAgentKind;
  const payload: CardDispatchPayload = {
    v: CARD_CONTRACT_VERSION,
    cardId: task.id,
    sourceRoomId: session.roomId,
    prompt: args.prompt,
    agentKind,
  };
  const parsed = CardDispatchPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      error: `invalid dispatch payload: ${parsed.error.message}`,
    };
  }

  let attachment: HandoffAttachment;
  try {
    attachment = serializeCardAttachment(CARD_DISPATCH_LABEL, parsed.data);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  const body = buildDispatchBody({
    title: task.title,
    cardId: task.id,
    node,
  });

  try {
    const ack = await opsHandoff({
      to: `@${node}`,
      body,
      mode: "task",
      attachments: [attachment],
    });
    if (ack.status === "peer_unknown") {
      return { ok: false, error: `peer_unknown: @${node}` };
    }
    // Board transition only on successful route
    updateTask(task.id, {
      status: "doing",
      assignee: node,
      handoffId: ack.handoffId,
      notes: `dispatched node=${node}`,
    });
    return {
      ok: true,
      status: ack.status,
      handoffId: ack.handoffId,
      taskId: task.id,
      notified: ack.notified,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export type ApplyCardResultResult =
  | { ok: true; task: TaskItem; status: TaskStatus }
  | { ok: false; error: string };

/**
 * Apply loom-card-result JSON to local board.
 * L-2: optional fromPeerId/node must match card assignee when provided.
 */
export function applyCardResult(args: {
  resultJson: string;
  /** Claimed handoff fromPeerId (L-2) */
  fromPeerId?: string;
  /** Claimed handoff sender displayName / result.node cross-check (L-2) */
  fromNode?: string;
}): ApplyCardResultResult {
  let payload: CardResultPayload;
  try {
    const raw = JSON.parse(args.resultJson) as unknown;
    payload = CardResultPayloadSchema.parse(raw);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "invalid resultJson",
    };
  }

  const task = findTask(payload.cardId);
  if (!task) {
    return { ok: false, error: `task not found: ${payload.cardId}` };
  }

  // L-2: assignee / node forgery guard
  const assignee = task.assignee?.replace(/^@/, "");
  if (assignee) {
    const resultNode = payload.node.replace(/^@/, "");
    if (assignee !== resultNode) {
      return {
        ok: false,
        error: `L-2: result.node (${resultNode}) != card assignee (${assignee})`,
      };
    }
    if (args.fromNode) {
      const fn = args.fromNode.replace(/^@/, "");
      if (fn !== assignee && fn !== resultNode) {
        return {
          ok: false,
          error: `L-2: fromNode (${fn}) does not match assignee (${assignee})`,
        };
      }
    }
  }

  // Unidirectional: ignore reverse transitions
  if (task.status === "done" || task.status === "cancelled") {
    return { ok: true, task, status: task.status };
  }

  // seq idempotency: notes may hold last_seq=N
  const lastSeqMatch = /last_seq=(\d+)/.exec(task.notes ?? "");
  if (lastSeqMatch) {
    const last = Number(lastSeqMatch[1]);
    if (payload.seq <= last) {
      return { ok: true, task, status: task.status };
    }
  }

  // v0.27 authority fence: remote results are verification proposals, never
  // completion authority. This remains after authenticity/terminal/stale guards.
  const status: TaskStatus = "blocked";
  const reason =
    payload.status === "done"
      ? " reason=legacy_remote_done_requires_verification"
      : payload.reason
        ? ` failed reason=${payload.reason}`
        : "";
  // PLAN 0.23.7 M-2: `last_seq=` must always survive the 1000-char notes cap.
  // Build head (summary + reason + optional note) within residual budget, then
  // append the seq token so the idempotency guard cannot be silently broken.
  const NOTES_CAP = 1000;
  const lastSeqToken = ` last_seq=${payload.seq}`;
  const notePart =
    payload.note && payload.note.length > 0 ? ` ${payload.note}` : "";
  const headBudget = Math.max(0, NOTES_CAP - lastSeqToken.length);
  let head = `${payload.summary}${reason}${notePart}`;
  if (head.length > headBudget) {
    head = head.slice(0, headBudget);
  }
  const notes = `${head}${lastSeqToken}`;

  const updated = updateTask(task.id, {
    status,
    notes,
  });
  return { ok: true, task: updated, status };
}

export function parseResultFromAttachments(
  attachments:
    | { kind: string; label?: string; content: string }[]
    | undefined,
): CardResultPayload | null {
  return cardPayloadFromAttachments(
    attachments,
    CARD_RESULT_LABEL,
    CardResultPayloadSchema,
  );
}

export function parseDispatchFromAttachments(
  attachments:
    | { kind: string; label?: string; content: string }[]
    | undefined,
): CardDispatchPayload | null {
  return cardPayloadFromAttachments(
    attachments,
    CARD_DISPATCH_LABEL,
    CardDispatchPayloadSchema,
  );
}
