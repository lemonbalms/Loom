import { describe, expect, test } from "bun:test";
import { renderInbox } from "./presence";

describe("renderInbox dogfood UX", () => {
  test("resolves peer display name and attachment count", () => {
    const text = renderInbox(
      [
        {
          status: "queued",
          handoff: {
            id: "ho_abc",
            fromPeerId: "p_deadbeef",
            body: "hello there",
            mode: "message",
            attachments: [
              { kind: "text", label: "context-pack-summary", content: "s" },
              { kind: "path", label: "context-pack-path", content: "a.ts" },
            ],
          },
        },
      ],
      { peerName: (id) => (id === "p_deadbeef" ? "bob" : undefined) },
    );
    expect(text).toContain("bob");
    expect(text).toContain("p_deadbeef");
    expect(text).toContain("+2 attachments");
    expect(text).toContain("hello there");
  });

  test("falls back to peer id without resolver", () => {
    const text = renderInbox([
      {
        status: "notified",
        handoff: {
          id: "ho_x",
          fromPeerId: "p_only",
          body: "x",
          mode: "task",
        },
      },
    ]);
    expect(text).toContain("from: p_only");
    expect(text).not.toContain("+");
  });
});
