/**
 * PLAN 0.30.0 D1 / R48-M1: card result core.
 * acquireInitial (issuer acquire, nextSeq, supersedePresence), payload
 * assembly, strict ACK, and send_unknown quarantine.
 * No Flight reads or writes — callers pass applyOutcome, invoked
 * synchronously where sendResult wrote the flight (send_unknown before
 * quarantine.enter; accepted before autoResolve), inside the same try.
 * R48-M2: if the serialized attachment exceeds 256_000 chars, cut output
 * from the front (never on a lone low surrogate) and re-serialize until
 * it fits. Payloads that already fit stay byte-identical.
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

/**
 * Held after acquireInitial. seq is the value nextSeq returned; presence
 * was already superseded. composeAndSend must not acquire again.
 */
export type InitialLease = {
  target: ResultTarget;
  seq: number;
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
 * drop at least the overflow (minimum 1) from the front of output and
 * re-serialize. If the cut would start on a low surrogate, take one more
 * unit so the tail stays well-formed. A payload that already fits is
 * returned as the same object. If output is gone and the JSON is still
 * over, drop it and note that, instead of throwing here.
 */
function fitSerializedPayload(payload: CardResultPayload): CardResultPayload {
  const budget = MAX_ATTACHMENT_CONTENT_CHARS;
  let json = JSON.stringify(payload);
  if (json.length <= budget) return payload;

  let body = payload;
  while (json.length > budget && body.output.length > 0) {
    const overflow = json.length - budget;
    let cut = Math.min(Math.max(overflow, 1), body.output.length);
    if (cut < body.output.length) {
      const at = body.output.charCodeAt(cut);
      if (at >= 0xdc00 && at <= 0xdfff) cut += 1;
    }
    body = {
      ...body,
      output: body.output.slice(cut),
      truncated: true,
    };
    json = JSON.stringify(body);
  }

  if (json.length <= budget) return body;

  const drop = "output dropped: exceeds attachment budget";
  const note = (body.note ? `${body.note} ${drop}` : drop).slice(0, 500);
  return { ...body, output: "", truncated: true, note };
}

export type ComposeAndSendOpts = {
  node: string;
  /**
   * Synchronous. send_unknown: before quarantine.enter.
   * accepted: before autoResolve. A throw here is inside sendResult's try
   * on the handoff paths (becomes send_unknown). Omitted = no-op.
   */
  applyOutcome?: (outcome: SendResultOutcome) => void;
};

/**
 * Call form kept for the pre-split signature (no scrape between acquire and
 * send). Methods are the split API: acquireInitial, then composeAndSend(lease).
 */
export type CardResultCore = {
  (
    target: ResultTarget,
    content: CardResultContent,
    opts: { node: string },
  ): Promise<SendResultOutcome>;
  acquireInitial(target: ResultTarget): InitialLease | null;
  composeAndSend(
    lease: InitialLease,
    content: CardResultContent,
    opts: ComposeAndSendOpts,
  ): Promise<SendResultOutcome>;
};

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
export function createCardResultCore(deps: CardResultCoreDeps): CardResultCore {
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

  function acquireInitial(target: ResultTarget): InitialLease | null {
    const issuer = deps.issuers.getOrCreate(
      target.cardId,
      target.dispatchHandoffId,
    );
    if (!issuer.acquire("initial")) return null;
    const seq = issuer.nextSeq();
    deps.quarantine.supersedePresence({
      cardId: target.cardId,
      dispatchHandoffId: target.dispatchHandoffId,
    });
    return { target, seq };
  }

  async function composeAndSend(
    lease: InitialLease,
    content: CardResultContent,
    opts: ComposeAndSendOpts,
  ): Promise<SendResultOutcome> {
    const applyOutcome = opts.applyOutcome ?? (() => {});
    const target = lease.target;
    const payload: CardResultPayload = {
      v: CARD_CONTRACT_VERSION,
      cardId: target.cardId,
      status: content.status,
      node: opts.node,
      seq: lease.seq,
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
    const sendUnknown = (reason: string): SendResultOutcome => ({
      branch: "send_unknown",
      resultPhase: "send_unknown",
      reason,
    });
    if (!target.fromPeerId) {
      deps.log("sendResult: missing toPeerId");
      const outcome = sendUnknown("missing_toPeerId");
      // Outside the handoff try, same as the old missing-toPeerId path.
      applyOutcome(outcome);
      enterSendUnknown({
        cardId: payload.cardId,
        dispatchHandoffId,
        seq: payload.seq,
        reason: "missing_toPeerId",
      });
      return outcome;
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
        const outcome: SendResultOutcome = {
          branch: "accepted",
          resultPhase: "result_relay_accepted",
          relayAcceptedAt,
          status: ack.status,
          recipientCount: ack.recipientCount,
        };
        applyOutcome(outcome);
        if (payload.dispatchHandoffId) {
          deps.quarantine.autoResolve({
            cardId: payload.cardId,
            dispatchHandoffId: payload.dispatchHandoffId,
            key: { tag: "seq", seq: payload.seq },
            reason: "relay_accepted",
          });
        }
        return outcome;
      }
      const reason = `ack_${ack.status}_rc${ack.recipientCount}`;
      const outcome = sendUnknown(reason);
      applyOutcome(outcome);
      enterSendUnknown({
        cardId: payload.cardId,
        dispatchHandoffId,
        seq: payload.seq,
        reason,
      });
      return outcome;
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
      const outcome = sendUnknown(reasonPrefix);
      applyOutcome(outcome);
      enterSendUnknown({
        cardId: payload.cardId,
        dispatchHandoffId,
        seq: payload.seq,
        reason: reasonPrefix,
      });
      return outcome;
    }
  }

  async function legacyComposeAndSend(
    target: ResultTarget,
    content: CardResultContent,
    opts: { node: string },
  ): Promise<SendResultOutcome> {
    const lease = acquireInitial(target);
    if (!lease) return { branch: "acquire_denied" };
    return composeAndSend(lease, content, opts);
  }

  return Object.assign(legacyComposeAndSend, { acquireInitial, composeAndSend });
}
