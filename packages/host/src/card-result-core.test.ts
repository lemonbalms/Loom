/**
 * assumed API (v0.30.0 P2)
 *
 * PLAN D1 / R48-M1 signature, as the P1 factory already exports it from
 * "./card-result-core" (this test imports that live module; M2 truncation is
 * not in P1, so the assertion below is expected-red):
 *
 *   createCardResultCore({ handoff, issuers, quarantine, log, now })
 *     -> composeAndSend(target, { status, reason, output, truncated, summary, note }, { node })
 *        -> SendResultOutcome
 *
 *   ResultTarget { cardId, fromPeerId, dispatchHandoffId, startedAt, paneId? }
 *   handoff is the injected relay. { node } is the display-name string.
 *   R48-M2: a 200_000-char output of only "\\r", "\\n", and '"' serializes
 *   under 256_000 chars, truncated:true, tail preserved.
 */
import { describe, expect, test } from "bun:test";
import { CARD_RESULT_LABEL } from "@loom/protocol";
import { createCardResultCore } from "./card-result-core";
import { ResultIssuerRegistry } from "./result-issuer";
import type { QuarantineStore } from "./result-quarantine";

describe("v0.30.0 P2 expected-red: card result core", () => {
  test("R48-M2 serializes a 200k quote-and-crlf output under 256000 and keeps the tail", async () => {
    const alphabet = "\r\n\"";
    const output = Array.from({ length: 200_000 }, (_, i) => alphabet[i % 3]!).join(
      "",
    );
    expect(output.length).toBe(200_000);

    const captured: { kind: string; label?: string; content: string }[] = [];
    const composeAndSend = createCardResultCore({
      handoff: async (partial) => {
        captured.push(...partial.attachments);
        return { status: "delivered", recipientCount: 1 };
      },
      issuers: new ResultIssuerRegistry(),
      quarantine: {
        supersedePresence() {},
        autoResolve() {},
        enter() {
          return true;
        },
      } as unknown as QuarantineStore,
      log() {},
      now: () => "2026-10-15T00:00:02.000Z",
    });

    await composeAndSend(
      {
        cardId: "task_abc",
        fromPeerId: "peer_a",
        dispatchHandoffId: "h1",
        startedAt: "2026-10-15T00:00:00.000Z",
      },
      {
        status: "failed",
        reason: "needs_verification",
        output,
        truncated: false,
        summary: "s",
        note: "n",
      },
      { node: "bridge-node" },
    );

    expect(captured).toHaveLength(1);
    const attachment = captured[0]!;
    expect(attachment.label).toBe(CARD_RESULT_LABEL);
    expect(attachment.content.length).toBeLessThanOrEqual(256_000);
    const payload = JSON.parse(attachment.content) as {
      truncated: boolean;
      output: string;
    };
    expect(payload.truncated).toBe(true);
    expect(payload.output.length).toBeGreaterThan(0);
    expect(payload.output.length).toBeLessThan(200_000);
    expect(output.endsWith(payload.output)).toBe(true);
  });
});
