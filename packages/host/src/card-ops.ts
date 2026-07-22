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

/** PLAN 0.27.0 currency-gate observability (never silent swallow). */
let currencyStaleDropCount = 0;
let handoffUnmappedOrStaleCount = 0;
let currencyDuplicateHandoffDropCount = 0;

export function currencyGateStaleDrops(): number {
  return currencyStaleDropCount;
}
export function currencyGateHandoffUnmapped(): number {
  return handoffUnmappedOrStaleCount;
}
export function currencyGateDuplicateHandoffDrops(): number {
  return currencyDuplicateHandoffDropCount;
}
export function resetCurrencyGateCounters(): void {
  currencyStaleDropCount = 0;
  handoffUnmappedOrStaleCount = 0;
  currencyDuplicateHandoffDropCount = 0;
}

function findTasksByHandoffId(handoffId: string): TaskItem[] {
  const board = loadTaskBoard();
  if (!board) return [];
  return board.tasks.filter((t) => t.handoffId === handoffId);
}

/**
 * Apply loom-card-result JSON to local board.
 * L-2: optional fromPeerId/node must match card assignee when provided.
 * PLAN 0.27.0 §6.7.3: tower currency gate — dispatchHandoffId vs task.handoffId.
 * PLAN 0.28.0 U2 / PATCH 2: remote result isolation — every accepted remote
 * result maps board status to `blocked` (never `done`). Legacy payload
 * `status:"done"` records reason `legacy_remote_done_requires_verification`.
 * Board `done` is only via explicit local mutation, not this remote path.
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

  // PLAN 0.27.0 currency gate: findTask → (miss | task_0) scan fallback → dedup
  let task = findTask(payload.cardId);

  if (!task || payload.cardId === "task_0") {
    // findTask miss (or degraded cardId) → dispatchHandoffId scan fallback
    if (payload.dispatchHandoffId) {
      const matches = findTasksByHandoffId(payload.dispatchHandoffId);
      if (matches.length > 1) {
        currencyDuplicateHandoffDropCount += 1;
        console.error(
          "[loom-tower] currency gate: duplicate handoffId match (fail-visible drop)",
          JSON.stringify({
            event: "currency_duplicate_handoff",
            dispatchHandoffId: payload.dispatchHandoffId,
            count: currencyDuplicateHandoffDropCount,
            taskIds: matches.map((t) => t.id),
          }),
        );
        return {
          ok: false,
          error: `handoff_duplicate_match: ${payload.dispatchHandoffId}`,
        };
      }
      if (matches.length === 1) {
        const candidate = matches[0]!;
        // cardId cross-check: if payload cardId is not the degraded value and
        // disagrees with candidate → drop. Degraded "task_0" skips mismatch.
        if (
          payload.cardId !== "task_0" &&
          payload.cardId !== candidate.id
        ) {
          currencyStaleDropCount += 1;
          console.error(
            "[loom-tower] currency gate: cardId mismatch after handoff scan (drop)",
            JSON.stringify({
              event: "currency_cardid_mismatch",
              payloadCardId: payload.cardId,
              taskId: candidate.id,
              dispatchHandoffId: payload.dispatchHandoffId,
              count: currencyStaleDropCount,
            }),
          );
          return {
            ok: false,
            error: `currency_cardid_mismatch: payload=${payload.cardId} task=${candidate.id}`,
          };
        }
        // Fall-through: mismatch gate is identity on degraded path → seq dedup
        task = candidate;
      } else {
        handoffUnmappedOrStaleCount += 1;
        console.error(
          "[loom-tower] currency gate: handoff_unmapped_or_stale",
          JSON.stringify({
            event: "handoff_unmapped_or_stale",
            cardId: payload.cardId,
            dispatchHandoffId: payload.dispatchHandoffId,
            count: handoffUnmappedOrStaleCount,
          }),
        );
        return {
          ok: false,
          error: `handoff_unmapped_or_stale: ${payload.cardId}`,
        };
      }
    } else if (!task) {
      return { ok: false, error: `task not found: ${payload.cardId}` };
    }
  }

  // General path (findTask hit): stale dispatchHandoffId → drop
  if (
    task &&
    payload.dispatchHandoffId &&
    task.handoffId &&
    payload.dispatchHandoffId !== task.handoffId
  ) {
    currencyStaleDropCount += 1;
    console.error(
      "[loom-tower] currency gate: stale dispatchHandoffId (drop)",
      JSON.stringify({
        event: "currency_stale_dispatch",
        cardId: payload.cardId,
        payloadHandoffId: payload.dispatchHandoffId,
        taskHandoffId: task.handoffId,
        count: currencyStaleDropCount,
      }),
    );
    return {
      ok: false,
      error: `currency_stale_dispatch: payload=${payload.dispatchHandoffId} task=${task.handoffId}`,
    };
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
  // When dispatchHandoffId present + matches → per-dispatch seq dedup (same scalar notes form).
  // When dispatchHandoffId absent → scalar fallback (backward compat).
  const lastSeqMatch = /last_seq=(\d+)/.exec(task.notes ?? "");
  if (lastSeqMatch) {
    const last = Number(lastSeqMatch[1]);
    if (payload.seq <= last) {
      return { ok: true, task, status: task.status };
    }
  }

  // PLAN 0.28.0 U2 / §2.4 isolation mapping: remote result never writes board
  // `done`. Both payload statuses land on `blocked`; human/local mutation is
  // the only path to board done. Rolling upgrade ships this tower fence before
  // bridge changes so old bridge→new tower (`done→blocked`) and new bridge→old
  // tower (`failed→blocked`) both fail closed.
  const status: TaskStatus = "blocked";
  const reason =
    payload.status === "done"
      ? " failed reason=legacy_remote_done_requires_verification"
      : payload.status === "failed" && payload.reason
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
