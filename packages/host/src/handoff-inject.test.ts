import { describe, expect, test } from "bun:test";
import {
  injectIntoStdin,
  injectPasteIntoStdin,
  preparePasteInjectText,
  prepareInjectText,
  formatIncomingHandoff,
  BRACKETED_PASTE_END,
  BRACKETED_PASTE_START,
  frameBracketedPaste,
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
    expect(p.text).toContain("Untrusted handoff content");
    expect(p.text).toContain("hello");
  });

  test("preparePasteInjectText uses bracketed paste without trailing newline", () => {
    const p = preparePasteInjectText(ho);
    expect(p.allowedByDefault).toBe(false);
    expect(p.text.endsWith("\n")).toBe(false);
    expect(p.text).not.toContain("\x1b");
    expect(p.text).toContain("Untrusted handoff content");
    expect(p.text).toContain("LOOM HANDOFF");
  });

  test("frameBracketedPaste wraps exact text", () => {
    const framed = frameBracketedPaste("hi\nthere");
    expect(framed.startsWith(BRACKETED_PASTE_START)).toBe(true);
    expect(framed.endsWith(BRACKETED_PASTE_END)).toBe(true);
    expect(framed).toBe(`${BRACKETED_PASTE_START}hi\nthere${BRACKETED_PASTE_END}`);
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

  test("injectPasteIntoStdin writes exactly without adding newline", () => {
    const writes: string[] = [];
    const r = injectPasteIntoStdin(
      {
        write(d) {
          writes.push(String(d));
        },
      },
      `${BRACKETED_PASTE_START}hi${BRACKETED_PASTE_END}`,
      { experimental: true },
    );
    expect(r.ok).toBe(true);
    expect(writes.join("")).toBe(`${BRACKETED_PASTE_START}hi${BRACKETED_PASTE_END}`);
  });
});
