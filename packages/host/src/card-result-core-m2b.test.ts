/**
 * R48-M2 surrogate boundary. fitSerializedPayload cuts the front of output
 * until JSON.stringify fits in 256_000 chars. A cut that lands on a low
 * surrogate used to leave a lone unit; JSON.stringify expands it to
 * "\\uXXXX" and the old non-decreasing guard stopped while still over budget.
 *
 * Harness matches card-result-core.test.ts: createCardResultCore, fake
 * handoff, ResultIssuerRegistry, stub quarantine.
 */
import { describe, expect, test } from "bun:test";
import { CARD_CONTRACT_VERSION, CARD_RESULT_LABEL } from "@loom/protocol";
import { createCardResultCore } from "./card-result-core";
import { ResultIssuerRegistry } from "./result-issuer";
import type { QuarantineStore } from "./result-quarantine";

const STARTED_AT = "2026-10-15T00:00:00.000Z";
const FINISHED_AT = "2026-10-15T00:00:02.000Z";

function rawAttachmentLength(output: string, summary = "s", note = "n"): number {
  const reason = "needs_verification";
  return JSON.stringify({
    v: CARD_CONTRACT_VERSION,
    cardId: "task_abc",
    status: "failed",
    node: "bridge-node",
    seq: 1,
    paneId: undefined,
    dispatchHandoffId: "h1",
    output,
    truncated: false,
    summary,
    ...(STARTED_AT ? { startedAt: STARTED_AT } : {}),
    finishedAt: FINISHED_AT,
    ...(reason !== undefined ? { reason } : {}),
    ...(note ? { note: note.slice(0, 500) } : {}),
  }).length;
}

/** Lone UTF-16 surrogates — String.prototype.isWellFormed equivalent. */
function isWellFormed(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      i += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

async function sendOutput(
  output: string,
  summary = "s",
): Promise<{ content: string; output: string; truncated: boolean }> {
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
    now: () => FINISHED_AT,
  });

  await composeAndSend(
    {
      cardId: "task_abc",
      fromPeerId: "peer_a",
      dispatchHandoffId: "h1",
      startedAt: STARTED_AT,
    },
    {
      status: "failed",
      reason: "needs_verification",
      output,
      truncated: false,
      summary,
      note: "n",
    },
    { node: "bridge-node" },
  );

  expect(captured).toHaveLength(1);
  const attachment = captured[0]!;
  expect(attachment.label).toBe(CARD_RESULT_LABEL);
  const payload = JSON.parse(attachment.content) as {
    truncated: boolean;
    output: string;
  };
  return {
    content: attachment.content,
    output: payload.output,
    truncated: payload.truncated,
  };
}

function expectTailKept(
  source: string,
  sent: { content: string; output: string; truncated: boolean },
): void {
  expect(sent.content.length).toBeLessThanOrEqual(256_000);
  expect(sent.truncated).toBe(true);
  expect(sent.output.length).toBeGreaterThan(0);
  expect(source.endsWith(sent.output)).toBe(true);
  expect(isWellFormed(sent.output)).toBe(true);
}

describe("R48-M2 surrogate-safe attachment budget", () => {
  test("200k output starting with an emoji stays within budget and keeps a well-formed tail", async () => {
    const emoji = "😀";
    const asciiBase = emoji + "a".repeat(199_998);
    const quotes = 256_001 - rawAttachmentLength(asciiBase);
    const output = emoji + '"'.repeat(quotes) + "a".repeat(199_998 - quotes);
    expect(output.length).toBe(200_000);
    expect(output.startsWith(emoji)).toBe(true);
    // Old code cuts overflow=1, leaves the low surrogate, and stops at 256004.
    expect(rawAttachmentLength(output)).toBe(256_001);

    const sent = await sendOutput(output);
    expectTailKept(output, sent);
    expect(sent.output.length).toBe(199_998);
  });

  test("200k UTF-16 units of astral characters stay well-formed under the budget", async () => {
    const output = "😀".repeat(100_000);
    expect(output.length).toBe(200_000);
    // Astral pairs do not expand, so this output alone serializes under the
    // cap. Pad summary until the attachment is one char over; the first cut
    // is then the leading high surrogate.
    const extra = 256_001 - rawAttachmentLength(output);
    const summary = `s${"x".repeat(extra)}`;
    expect(rawAttachmentLength(output, summary)).toBe(256_001);

    const sent = await sendOutput(output, summary);
    expectTailKept(output, sent);
    expect(sent.output.length).toBe(199_998);
  });

  test("mixed crlf, quotes, and emoji keep a well-formed tail under the budget", async () => {
    const pattern = "\r\n\"😀";
    const output = pattern.repeat(200_000 / pattern.length);
    expect(output.length).toBe(200_000);
    expect(rawAttachmentLength(output)).toBeGreaterThan(256_000);

    const sent = await sendOutput(output);
    expectTailKept(output, sent);
  });

  test("a small output that already fits is unchanged", async () => {
    const sent = await sendOutput("hello");
    expect(sent.truncated).toBe(false);
    expect(sent.output).toBe("hello");
  });
});
