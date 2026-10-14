/**
 * PLAN 0.30.0 D1 / R48-M1: card result core.
 * Issuer acquire, payload assembly, strict ACK, and send_unknown quarantine.
 * No Flight reads or writes — the pane wrapper applies SendResultOutcome.
 * R48-M2: if the serialized attachment exceeds 256_000 chars, cut output
 * from the front by the overflow and re-serialize until it fits.
 * Payloads that already fit stay byte-identical.
 */
import {
  CARD_CONTRACT_VERSION,
  CARD_RESULT_LABEL,
  MAX_ATTACHMENT_CONTENT_CHARS,
  buildResultBody,
  serializeCardAttachment,
  type CardResultPayload,
  type CardResultStatus,
  type HandoffAttachment,
} from "@loom/protocol";
import type { ResultIssuerRegistry } from "./result-issuer";
import type { QuarantineStore } from "./result-quarantine";

/** Minimum input shared by pane and (later) headless result sends. */
export type ResultTarget = {
  cardId: string;
  fromPeerId: string;
  dispatchHandoffId: string;
  /**
   * Stamped on the payload when non-empty. sendFailedResult passes "" so the
   * historical payload (no startedAt key) stays byte-identical.
   */
  startedAt: string;
  paneId?: string;
};

export type CardResultContent = {
  status: CardResultStatus;
  reason?: string;
  output: string;
  truncated: boolean;
  summary: string;
  note?: string;
};

/**
 * What sendResult / enterSendUnknown used to write onto a Flight, plus the
 * ACK branch. acquire_denied writes nothing — callers keep their denied logs.
 */
export type SendResultOutcome =
  | {
      branch: "accepted";
      resultPhase: "result_relay_accepted";
      relayAcceptedAt: string;
      status: string;
      recipientCount: number;
    }
  | {
      branch: "send_unknown";
      resultPhase: "send_unknown";
      reason: string;
    }
  | { branch: "acquire_denied" };

/**
 * PLAN 0.27.0 / 0.28.0 strict ACK classifier (pure, module-scope for G-11).
 * status ∈ {queued, delivered} ∧ recipientCount === 1 → accepted;
 * every other shape → send_unknown. No message-regex behavioral split.
 */
export function classifyAck(ack: {
  status: string;
  recipientCount: number;
}): "accepted" | "send_unknown" {
  if (
    (ack.status === "queued" || ack.status === "delivered") &&
    ack.recipientCount === 1
  ) {
    return "accepted";
  }
  return "send_unknown";
}

/**
 * R48-M2. Measure the attachment JSON. While it is over the 256_000 cap,
 * drop that many chars from the front of output (keep the tail) and
 * re-serialize. Sets truncated. A payload that already fits is returned
 * as the same object.
 */
function fitSerializedPayload(payload: CardResultPayload): CardResultPayload {
  let body = payload;
  let json = JSON.stringify(body);
  while (json.length > MAX_ATTACHMENT_CONTENT_CHARS && body.output.length > 0) {
    const overflow = json.length - MAX_ATTACHMENT_CONTENT_CHARS;
    const cut = Math.min(overflow, body.output.length);
    body = {
      ...body,
      output: body.output.slice(cut),
      truncated: true,
    };
    const next = JSON.stringify(body);
    if (next.length >= json.length) break;
    json = next;
  }
  return body;
}

type CardResultCoreDeps = {
  /** Relay send. Caller binds the client (`(partial) => client.handoff(partial)`). */
  handoff: (partial: {
    to: string;
    body: string;
    mode: "task";
    attachments: HandoffAttachment[];
  }) => Promise<{ status: string; recipientCount: number }>;
  issuers: ResultIssuerRegistry;
  quarantine: QuarantineStore;
  /** Same `[loom-bridge]` logger the runtime closure uses. */
  log: (...args: unknown[]) => void;
  /** `new Date().toISOString` — finishedAt and relayAcceptedAt. */
  now: () => string;
};

/**
 * PLAN 0.28.0 strict ACK 2-branch (U5) extracted from sendResult.
 * accepted | send_unknown only. Non-accepted absorbs via enterSendUnknown
 * (reason prefixes only — no rejected variant).
 */
export function createCardResultCore(
  deps: CardResultCoreDeps,
): (
  target: ResultTarget,
  content: CardResultContent,
  opts: { node: string },
) => Promise<SendResultOutcome> {
  function enterSendUnknown(args: {
    cardId: string;
    dispatchHandoffId: string;
    seq: number;
    reason: string;
  }): void {
    deps.quarantine.enter({
      cardId: args.cardId,
      dispatchHandoffId: args.dispatchHandoffId,
      state: "send_unknown",
      key: { tag: "seq", seq: args.seq },
      reason: args.reason,
    });
    deps.log(
      `card ${args.cardId}: send_unknown seq=${args.seq} reason=${args.reason}`,
    );
  }

  return async function composeAndSend(
    target: ResultTarget,
    content: CardResultContent,
    opts: { node: string },
  ): Promise<SendResultOutcome> {
    const issuer = deps.issuers.getOrCreate(
      target.cardId,
      target.dispatchHandoffId,
    );
    if (!issuer.acquire("initial")) {
      return { branch: "acquire_denied" };
    }
    const seq = issuer.nextSeq();
    deps.quarantine.supersedePresence({
      cardId: target.cardId,
      dispatchHandoffId: target.dispatchHandoffId,
    });

    const payload: CardResultPayload = {
      v: CARD_CONTRACT_VERSION,
      cardId: target.cardId,
      status: content.status,
      node: opts.node,
      seq,
      paneId: target.paneId,
      dispatchHandoffId: target.dispatchHandoffId,
      output: content.output,
      truncated: content.truncated,
      summary: content.summary,
      ...(target.startedAt ? { startedAt: target.startedAt } : {}),
      finishedAt: deps.now(),
      ...(content.reason !== undefined ? { reason: content.reason } : {}),
      ...(content.note ? { note: content.note.slice(0, 500) } : {}),
    };

    const dispatchHandoffId = payload.dispatchHandoffId ?? "";
    if (!target.fromPeerId) {
      deps.log("sendResult: missing toPeerId");
      enterSendUnknown({
        cardId: payload.cardId,
        dispatchHandoffId,
        seq: payload.seq,
        reason: "missing_toPeerId",
      });
      return {
        branch: "send_unknown",
        resultPhase: "send_unknown",
        reason: "missing_toPeerId",
      };
    }

    try {
      const attachment = serializeCardAttachment(
        CARD_RESULT_LABEL,
        fitSerializedPayload(payload),
      );
      const body = buildResultBody({
        cardId: payload.cardId,
        seq: payload.seq,
        summary: payload.summary,
      });
      const ack = await deps.handoff({
        to: target.fromPeerId,
        body,
        mode: "task",
        attachments: [attachment],
      });
      const decision = classifyAck(ack);
      if (decision === "accepted") {
        const relayAcceptedAt = deps.now();
        if (payload.dispatchHandoffId) {
          deps.quarantine.autoResolve({
            cardId: payload.cardId,
            dispatchHandoffId: payload.dispatchHandoffId,
            key: { tag: "seq", seq: payload.seq },
            reason: "relay_accepted",
          });
        }
        return {
          branch: "accepted",
          resultPhase: "result_relay_accepted",
          relayAcceptedAt,
          status: ack.status,
          recipientCount: ack.recipientCount,
        };
      }
      const reason = `ack_${ack.status}_rc${ack.recipientCount}`;
      enterSendUnknown({
        cardId: payload.cardId,
        dispatchHandoffId,
        seq: payload.seq,
        reason,
      });
      return { branch: "send_unknown", resultPhase: "send_unknown", reason };
    } catch (e) {
      // PLAN 0.28.0 U5: non-accepted is always send_unknown + quarantine enter.
      // Rejection vs transport is reason-prefix only (reject: / transport:), not
      // a behavioral branch — no message-regex split, no rejected variant.
      const msg = e instanceof Error ? e.message : String(e);
      const looksTransport =
        /injected transport|ECONN|socket|closed|timeout|WebSocket|fetch failed|network/i.test(
          msg,
        ) || msg === "injected transport error";
      const reasonPrefix = looksTransport
        ? `transport:${msg.slice(0, 120)}`
        : /reject|denied|forbidden|invalid/i.test(msg)
          ? `reject:${msg.slice(0, 120)}`
          : `transport:${msg.slice(0, 120)}`;
      deps.log("sendResult non-accepted (send_unknown):", msg);
      enterSendUnknown({
        cardId: payload.cardId,
        dispatchHandoffId,
        seq: payload.seq,
        reason: reasonPrefix,
      });
      return {
        branch: "send_unknown",
        resultPhase: "send_unknown",
        reason: reasonPrefix,
      };
    }
  };
}
