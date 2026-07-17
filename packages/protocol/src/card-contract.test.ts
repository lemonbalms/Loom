import { describe, expect, test } from "bun:test";
import {
  CARD_CONTRACT_VERSION,
  CARD_DISPATCH_LABEL,
  CARD_RESULT_LABEL,
  CardDispatchPayloadSchema,
  CardResultPayloadSchema,
  buildDispatchBody,
  buildResultBody,
  cardPayloadFromAttachments,
  serializeCardAttachment,
  truncateTail,
  wrapUntrustedPrompt,
  UNTRUSTED_HANDOFF_MARKER,
} from "./card-contract";
import { MAX_ATTACHMENT_CONTENT_CHARS } from "./envelope";

describe("card-contract v1", () => {
  test("dispatch payload parses", () => {
    const p = CardDispatchPayloadSchema.parse({
      v: CARD_CONTRACT_VERSION,
      cardId: "task_abcdef0123456789",
      sourceRoomId: "room_1",
      prompt: "do the thing",
      agentKind: "claude",
    });
    expect(p.cardId).toBe("task_abcdef0123456789");
  });

  test("rejects shell agentKind on wire schema", () => {
    const r = CardDispatchPayloadSchema.safeParse({
      v: 1,
      cardId: "task_abcdef0123456789",
      sourceRoomId: "r",
      prompt: "x",
      agentKind: "shell",
    });
    expect(r.success).toBe(false);
  });

  test("result seq uses nonnegative (L-3)", () => {
    const ok = CardResultPayloadSchema.parse({
      v: 1,
      cardId: "task_abcdef0123456789",
      status: "done",
      node: "node/wsl-1",
      seq: 0,
      output: "out",
      summary: "ok",
      finishedAt: new Date().toISOString(),
    });
    expect(ok.seq).toBe(0);
    const bad = CardResultPayloadSchema.safeParse({
      v: 1,
      cardId: "task_abcdef0123456789",
      status: "done",
      node: "node/wsl-1",
      seq: -1,
      output: "out",
      summary: "ok",
      finishedAt: new Date().toISOString(),
    });
    expect(bad.success).toBe(false);
  });

  test("body headers use independent lines", () => {
    const body = buildDispatchBody({
      title: "T",
      cardId: "task_ab",
      node: "node/wsl-1",
    });
    expect(body).toContain("[GOAL] T");
    expect(body).toMatch(/^intent: card.dispatch$/m);
    expect(body).toMatch(/^task: task_ab$/m);
    const done = buildResultBody({
      cardId: "task_ab",
      seq: 2,
      summary: "finished",
    });
    expect(done.startsWith("[DONE]")).toBe(true);
    expect(done).toMatch(/^seq: 2$/m);
  });

  test("cardPayloadFromAttachments label match", () => {
    const payload = {
      v: 1 as const,
      cardId: "task_abcdef0123456789",
      sourceRoomId: "r",
      prompt: "hi",
      agentKind: "claude" as const,
    };
    const att = serializeCardAttachment(CARD_DISPATCH_LABEL, payload);
    const got = cardPayloadFromAttachments(
      [att],
      CARD_DISPATCH_LABEL,
      CardDispatchPayloadSchema,
    );
    expect(got?.prompt).toBe("hi");
    expect(
      cardPayloadFromAttachments([att], CARD_RESULT_LABEL, CardResultPayloadSchema),
    ).toBeNull();
  });

  test("L-3 serialize rejects oversized attachment", () => {
    expect(() =>
      serializeCardAttachment(CARD_RESULT_LABEL, {
        v: 1,
        huge: "x".repeat(MAX_ATTACHMENT_CONTENT_CHARS),
      }),
    ).toThrow(/exceeds/);
  });

  test("truncateTail keeps end", () => {
    const { text, truncated } = truncateTail("abcdefghij", 4);
    expect(truncated).toBe(true);
    expect(text).toBe("ghij");
  });

  test("untrusted marker preamble", () => {
    expect(wrapUntrustedPrompt("p")).toContain(UNTRUSTED_HANDOFF_MARKER);
  });
});
