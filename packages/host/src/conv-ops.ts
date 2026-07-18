/**
 * Tower-side conv (multiturn) helpers (MCP + tests). Mirrors card-ops.ts.
 * Does NOT go through toolHandoff auto-create path — uses opsHandoff directly.
 * PLAN 0.23.0 / docs/CONV_SPEC.md.
 */
import {
  CONV_CONTRACT_VERSION,
  CONV_OPEN_LABEL,
  CONV_ACCEPT_LABEL,
  CONV_REJECT_LABEL,
  CONV_TURN_LABEL,
  CONV_OPEN_SEQ,
  CONV_ACCEPT_SEQ,
  MAX_CONV_TURN_INLINE_CHARS,
  nextOwnSeq,
  generateConvId,
  ConvOpenPayloadSchema,
  ConvAcceptPayloadSchema,
  ConvRejectPayloadSchema,
  ConvTurnPayloadSchema,
  ConvClosePayloadSchema,
  ConvScopeSchema,
  ConvLimitsSchema,
  buildConvOpenBody,
  buildConvTurnBody,
  buildConvCloseBody,
  serializeConvAttachment,
  convPayloadFromAttachments,
  convLabelOf,
  peekConvIdFromAttachments,
  type ConvKind,
  type ConvCloseReason,
  type ArtifactRefEntry,
  type HandoffAttachment,
  type PresentedFetchCommand,
} from "@loom/protocol";
import { loadSession } from "./session-store";
import { opsHandoff, opsListPeers, opsListInbox, opsClaim } from "./room-ops";
import { updateTask, addTask, type TaskStatus } from "./task-board";
import {
  loadConvState,
  saveConvState,
  mutateConvState,
  pinMatches,
  isFreshPeerSeq,
  limitsExceeded,
  logUnknownConv,
  logPinMismatch,
  type ConvState,
} from "./conv-state";
import { presentArtifactCommands } from "./conv-artifact-present";

export type ConvOpenResult =
  | {
      ok: true;
      convId: string;
      handoffId: string;
      taskId?: string;
      notified: boolean;
    }
  | { ok: false; error: string };

export async function convOpen(args: {
  node: string;
  goal: string;
  cwd?: string;
  writesAllowed?: boolean;
  maxTurns?: number;
  wallClockMs?: number;
}): Promise<ConvOpenResult> {
  const session = loadSession();
  if (!session) {
    return { ok: false, error: "No Loom session." };
  }
  const node = args.node.replace(/^@/, "").trim();
  if (!node) {
    return { ok: false, error: "node is required (e.g. node/wsl-1)" };
  }

  // Resolve target peer id up front — pin (R24 M-1) needs a concrete peerId,
  // not just a displayName, so we know who to expect turns/close from.
  const { peers } = await opsListPeers();
  const target = peers.find(
    (p) => p.displayName === node || p.id === node,
  );
  if (!target) {
    return { ok: false, error: `peer not found: @${node}` };
  }

  const convId = generateConvId();

  const scope = ConvScopeSchema.safeParse({
    cwd: args.cwd,
    agentKind: "claude",
    writesAllowed: Boolean(args.writesAllowed),
  });
  if (!scope.success) {
    return { ok: false, error: `invalid scope: ${scope.error.message}` };
  }
  const limits = ConvLimitsSchema.safeParse({
    maxTurns: args.maxTurns,
    wallClockMs: args.wallClockMs,
  });
  if (!limits.success) {
    return { ok: false, error: `invalid limits: ${limits.error.message}` };
  }

  const payload = ConvOpenPayloadSchema.safeParse({
    v: CONV_CONTRACT_VERSION,
    convId,
    goal: args.goal,
    scope: scope.data,
    limits: limits.data,
  });
  if (!payload.success) {
    return { ok: false, error: `invalid open payload: ${payload.error.message}` };
  }

  let attachment: HandoffAttachment;
  try {
    attachment = serializeConvAttachment(CONV_OPEN_LABEL, payload.data);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const body = buildConvOpenBody({ goal: args.goal, convId });

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

    // §3.4: "open ack" → todo→doing. Card is created directly in doing —
    // by the time the handoff ack returns, that transition has happened.
    const task = addTask({
      title: args.goal,
      assignee: node,
      handoffId: ack.handoffId,
      status: "doing",
      notes: `conv=${convId}`,
    });

    const state: ConvState = {
      convId,
      role: "tower",
      roomId: session.roomId,
      pinnedPeerId: target.id,
      status: "open",
      goal: args.goal,
      limits: limits.data,
      lastOwnSeq: CONV_OPEN_SEQ,
      // No peer turn yet; accept (seq=1) is the first one we expect.
      lastPeerSeq: CONV_OPEN_SEQ - 1,
      turnCount: 0,
      taskId: task.id,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    saveConvState(state);

    return {
      ok: true,
      convId,
      handoffId: ack.handoffId,
      taskId: task.id,
      notified: ack.notified,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export type ConvSendResult =
  | { ok: true; convId: string; seq: number; handoffId: string }
  | { ok: false; error: string };

export async function convSendTurn(args: {
  convId: string;
  text: string;
  kind?: ConvKind;
  artifacts?: ArtifactRefEntry[];
}): Promise<ConvSendResult> {
  if (!loadSession()) {
    return { ok: false, error: "No Loom session." };
  }
  const state = loadConvState(args.convId, "tower");
  if (!state) {
    logUnknownConv(args.convId, "send(local)");
    return { ok: false, error: `unknown convId: ${args.convId}` };
  }
  if (state.role !== "tower") {
    return { ok: false, error: "convSendTurn is tower-only" };
  }
  if (state.status === "closed") {
    return { ok: false, error: `conv ${args.convId} is closed` };
  }

  const kind: ConvKind = args.kind ?? "normal";

  // §5.1: over the inline threshold, artifacts[] is mandatory — no truncation.
  if (args.text.length > MAX_CONV_TURN_INLINE_CHARS && !args.artifacts?.length) {
    return {
      ok: false,
      error: `text exceeds ${MAX_CONV_TURN_INLINE_CHARS} inline chars — attach artifacts[] instead of truncating (§5.1)`,
    };
  }

  const seq = nextOwnSeq(state.lastOwnSeq);
  const payload = ConvTurnPayloadSchema.safeParse({
    v: CONV_CONTRACT_VERSION,
    convId: args.convId,
    seq,
    kind,
    text: args.text,
    artifacts: args.artifacts,
  });
  if (!payload.success) {
    return { ok: false, error: `invalid turn payload: ${payload.error.message}` };
  }

  let attachment: HandoffAttachment;
  try {
    attachment = serializeConvAttachment(CONV_TURN_LABEL, payload.data);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const body = buildConvTurnBody({ convId: args.convId, seq, kind });

  try {
    const ack = await opsHandoff({
      to: state.pinnedPeerId,
      body,
      mode: "task",
      attachments: [attachment],
    });
    if (ack.status === "peer_unknown") {
      return { ok: false, error: `peer_unknown: ${state.pinnedPeerId}` };
    }
    mutateConvState(args.convId, "tower", (s) => {
      s.lastOwnSeq = seq;
      s.turnCount += 1;
      if (s.status === "open") s.status = "active";
    });
    return { ok: true, convId: args.convId, seq, handoffId: ack.handoffId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export type ConvCloseResult =
  | { ok: true; convId: string; taskId?: string }
  | { ok: false; error: string };

/** §1.4 / §3.2: tower-only, unilateral. Closes locally even if the peer is unreachable. */
export async function convClose(args: {
  convId: string;
  reason: ConvCloseReason;
}): Promise<ConvCloseResult> {
  if (!loadSession()) {
    return { ok: false, error: "No Loom session." };
  }
  const state = loadConvState(args.convId, "tower");
  if (!state) {
    logUnknownConv(args.convId, "close(local)");
    return { ok: false, error: `unknown convId: ${args.convId}` };
  }
  if (state.role !== "tower") {
    return { ok: false, error: "convClose is tower-only" };
  }

  const payload = ConvClosePayloadSchema.safeParse({
    v: CONV_CONTRACT_VERSION,
    convId: args.convId,
    reason: args.reason,
  });
  if (!payload.success) {
    return { ok: false, error: `invalid close payload: ${payload.error.message}` };
  }

  let attachment: HandoffAttachment;
  try {
    attachment = serializeConvAttachment("loom-conv-close", payload.data);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  const body = buildConvCloseBody({ convId: args.convId, reason: args.reason });

  try {
    await opsHandoff({
      to: state.pinnedPeerId,
      body,
      mode: "task",
      attachments: [attachment],
    });
  } catch {
    // Unilateral: still close locally even if delivery to the peer fails.
  }

  mutateConvState(args.convId, "tower", (s) => {
    s.status = "closed";
  });

  if (state.taskId) {
    const status: TaskStatus = args.reason === "done" ? "done" : "blocked";
    try {
      updateTask(state.taskId, {
        status,
        notes: `conv closed reason=${args.reason}`,
      });
    } catch {
      /* board optional */
    }
  }

  return { ok: true, convId: args.convId, taskId: state.taskId };
}

export type ConvAwaitResult =
  | { status: "timeout" }
  | { status: "accept"; convId: string }
  | { status: "reject"; convId: string; reason: string }
  | {
      status: "turn";
      convId: string;
      seq: number;
      kind: ConvKind;
      text: string;
      artifacts?: ArtifactRefEntry[];
      /**
       * R26 M-2 consumption: one PresentedFetchCommand per artifacts[]
       * entry (same order), validated + render-hardened. Present only —
       * never executed. Undefined when the turn carries no artifacts.
       */
      artifactCommands?: PresentedFetchCommand[];
    };

/**
 * Tower-side blocking wait for the next conv intent. Internally reuses the
 * existing check/claim path (M-6 unchanged) — no separate conv_apply.
 * §3.4 board transitions are applied automatically as intents are parsed.
 */
export async function convAwait(args: {
  convId?: string;
  timeoutSec?: number;
}): Promise<ConvAwaitResult> {
  if (!loadSession()) {
    throw new Error("No Loom session.");
  }
  const timeoutSec = Math.max(1, Math.min(args.timeoutSec ?? 30, 600));
  const deadline = Date.now() + timeoutSec * 1000;
  const pollMs = 700;

  while (true) {
    const { entries } = await opsListInbox();
    for (const e of entries) {
      const h = e.handoff;
      if (h.mode !== "task") continue;
      const label = convLabelOf(h.attachments);
      if (!label) continue;
      if (args.convId) {
        const peek = peekConvIdFromAttachments(h.attachments);
        if (peek && peek !== args.convId) continue;
      }
      const claim = await opsClaim(h.id, "claim");
      if (!claim.ok || !claim.entry) continue;
      const result = applyIncomingConvIntent(
        claim.entry.handoff.fromPeerId,
        claim.entry.handoff.attachments,
      );
      if (result) return result;
      // Ignored (fail-closed / pin mismatch / stale seq) — keep polling.
    }
    if (Date.now() >= deadline) return { status: "timeout" };
    await Bun.sleep(Math.min(pollMs, Math.max(0, deadline - Date.now())));
  }
}

/** Parses+validates a claimed conv intent and applies §3.4 board transitions. Null = ignore. */
function applyIncomingConvIntent(
  fromPeerId: string,
  attachments: { kind: string; label?: string; content: string }[] | undefined,
): Exclude<ConvAwaitResult, { status: "timeout" }> | null {
  const label = convLabelOf(attachments);
  if (!label) return null;

  if (label === CONV_ACCEPT_LABEL) {
    const payload = convPayloadFromAttachments(
      attachments,
      CONV_ACCEPT_LABEL,
      ConvAcceptPayloadSchema,
    );
    if (!payload) return null;
    const state = loadConvState(payload.convId, "tower");
    if (!state) {
      logUnknownConv(payload.convId, "accept");
      return null;
    }
    if (!pinMatches(state, fromPeerId)) {
      logPinMismatch(payload.convId, "accept", fromPeerId);
      return null;
    }
    mutateConvState(payload.convId, "tower", (s) => {
      s.status = "active";
      s.lastPeerSeq = Math.max(s.lastPeerSeq, CONV_ACCEPT_SEQ);
    });
    if (state.taskId) {
      try {
        updateTask(state.taskId, { status: "doing" });
      } catch {
        /* best effort */
      }
    }
    return { status: "accept", convId: payload.convId };
  }

  if (label === CONV_REJECT_LABEL) {
    const payload = convPayloadFromAttachments(
      attachments,
      CONV_REJECT_LABEL,
      ConvRejectPayloadSchema,
    );
    if (!payload) return null;
    const state = loadConvState(payload.convId, "tower");
    if (!state) {
      logUnknownConv(payload.convId, "reject");
      return null;
    }
    if (!pinMatches(state, fromPeerId)) {
      logPinMismatch(payload.convId, "reject", fromPeerId);
      return null;
    }
    mutateConvState(payload.convId, "tower", (s) => {
      s.status = "closed";
    });
    if (state.taskId) {
      try {
        updateTask(state.taskId, {
          status: "blocked",
          notes: `conv rejected: ${payload.reason}`,
        });
      } catch {
        /* best effort */
      }
    }
    return { status: "reject", convId: payload.convId, reason: payload.reason };
  }

  if (label === CONV_TURN_LABEL) {
    const payload = convPayloadFromAttachments(
      attachments,
      CONV_TURN_LABEL,
      ConvTurnPayloadSchema,
    );
    if (!payload) return null;
    const state = loadConvState(payload.convId, "tower");
    if (!state) {
      logUnknownConv(payload.convId, "turn");
      return null;
    }
    if (!pinMatches(state, fromPeerId)) {
      logPinMismatch(payload.convId, "turn", fromPeerId);
      return null;
    }
    if (!isFreshPeerSeq(state, payload.seq)) {
      // §3.3/§4.1.3 idempotent discard — replay or out-of-order.
      return null;
    }

    mutateConvState(payload.convId, "tower", (s) => {
      s.lastPeerSeq = payload.seq;
      s.turnCount += 1;
    });

    if (state.taskId) {
      const status: TaskStatus = payload.kind === "blocked" ? "blocked" : "doing";
      try {
        updateTask(state.taskId, {
          status,
          notes: `last turnSeq=${payload.seq} kind=${payload.kind}`,
        });
      } catch {
        /* best effort */
      }
    }

    // L-3: limit check after counting this turn — pause is a tower-local
    // board transition, never a wire message (§2.2).
    const after = loadConvState(payload.convId, "tower");
    if (after) {
      const check = limitsExceeded(after);
      if (check.exceeded && after.status !== "paused" && after.status !== "closed") {
        mutateConvState(payload.convId, "tower", (s) => {
          s.status = "paused";
        });
        if (after.taskId) {
          try {
            updateTask(after.taskId, {
              status: "blocked",
              notes: `paused: ${check.reason}`,
            });
          } catch {
            /* best effort */
          }
        }
      }
    }

    return {
      status: "turn",
      convId: payload.convId,
      seq: payload.seq,
      kind: payload.kind,
      text: payload.text,
      artifacts: payload.artifacts,
      artifactCommands: payload.artifacts?.length
        ? presentArtifactCommands(payload.convId, payload.artifacts)
        : undefined,
    };
  }

  return null;
}
