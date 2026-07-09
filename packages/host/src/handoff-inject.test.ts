import { describe, expect, test } from "bun:test";
import {
  injectIntoStdin,
  prepareInjectText,
  formatIncomingHandoff,
} from "./handoff-inject";
import type { HandoffPayload } from "@loom/protocol";

const ho: HandoffPayload = {
  id: "ho_1",
  fromPeerId: "p1",
  to: "@bob",
  mode: "message",
  body: "hello\x1b[31mred",
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("handoff-inject", () => {
  test("formatIncomingHandoff includes trust banner", () => {
    const s = formatIncomingHandoff(ho);
    expect(s).toContain("Untrusted");
    expect(s).toContain("LOOM HANDOFF");
  });

  test("prepareInjectText sanitizes and ends with newline", () => {
    const p = prepareInjectText(ho);
    expect(p.allowedByDefault).toBe(false);
    expect(p.text.endsWith("\n")).toBe(true);
    expect(p.text).not.toContain("\x1b");
    expect(p.text).toContain("hello");
  });

  test("injectIntoStdin blocked without experimental flag", () => {
    const writes: string[] = [];
    const r = injectIntoStdin(
      {
        write(d) {
          writes.push(String(d));
        },
      },
      "hi",
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("policy_blocked");
    expect(writes).toEqual([]);
  });

  test("injectIntoStdin writes with experimental flag", () => {
    const writes: string[] = [];
    const r = injectIntoStdin(
      {
        write(d) {
          writes.push(String(d));
        },
      },
      "hi",
      { experimental: true },
    );
    expect(r.ok).toBe(true);
    expect(writes.join("")).toBe("hi\n");
  });

  test("injectIntoStdin no_stdin", () => {
    const r = injectIntoStdin(null, "x", { experimental: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no_stdin");
  });
});
