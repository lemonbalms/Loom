import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { formatSessionRoutingStatus, parseSessionRouting } from "./session-routing.ts";

function handoff(line: string, extra = ""): string {
  return [
    "## Current action",
    "",
    "### Gate",
    "",
    line,
    extra,
    "",
    "## Active checks",
    "",
    "(none)",
  ].join("\n");
}

const SINGLE =
  "**Line:** topology **`single`** · execution **`current-session`** · verify **`objective-commands`** · full fallback Codex→Grok→Codex";
const FULL =
  "**Line:** topology **`full`** · execution **`delegated`** · verify **`independent`** · chain Codex→Grok→Codex";

describe("session routing Line grammar", () => {
  test("V1 canonical single routes to current session", () => {
    const result = parseSessionRouting(handoff(SINGLE));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.routing).toMatchObject({
      topology: "single",
      execution: "current-session",
      verify: "objective-commands",
    });
    expect(formatSessionRoutingStatus(result.routing)).toBe(
      "topology **single** · current-session→objective-commands→ship",
    );
  });

  test("V2 canonical full routes to delegated independent chain", () => {
    const result = parseSessionRouting(handoff(FULL));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(formatSessionRoutingStatus(result.routing)).toBe(
      "topology **full** · delegated→independent→ship · chain Codex→Grok→Codex",
    );
  });

  test("V3 single + delegated fails", () => {
    const result = parseSessionRouting(
      handoff(
        "**Line:** topology **`single`** · execution **`delegated`** · verify **`objective-commands`** · full fallback Codex→Grok→Codex",
      ),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join("\n")).toContain("single requires current-session");
  });

  test("V4 single + independent fails", () => {
    expect(
      parseSessionRouting(
        handoff(
          "**Line:** topology **`single`** · execution **`current-session`** · verify **`independent`** · full fallback Codex→Grok→Codex",
        ),
      ).ok,
    ).toBe(false);
  });

  test("V5 full + current-session fails", () => {
    expect(
      parseSessionRouting(
        handoff(
          "**Line:** topology **`full`** · execution **`current-session`** · verify **`independent`** · chain Codex→Grok→Codex",
        ),
      ).ok,
    ).toBe(false);
  });

  test("V6 missing execution/verify fails grammar", () => {
    const result = parseSessionRouting(
      handoff("**Line:** topology **`single`** · full fallback Codex→Grok→Codex"),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join("\n")).toContain("malformed Line grammar");
  });

  test("V7 duplicate Line fails", () => {
    const result = parseSessionRouting(handoff(SINGLE, SINGLE));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join("\n")).toContain("count must be 1, got 2");
  });

  test("V8 unknown enum fails loud", () => {
    const result = parseSessionRouting(
      handoff(
        "**Line:** topology **`solo`** · execution **`current-session`** · verify **`objective-commands`** · full fallback Codex→Grok→Codex",
      ),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.join("\n")).toContain("unknown topology solo");
  });

  test("single requires full fallback; full requires chain", () => {
    expect(
      parseSessionRouting(
        handoff(
          "**Line:** topology **`single`** · execution **`current-session`** · verify **`objective-commands`**",
        ),
      ).ok,
    ).toBe(false);
    expect(
      parseSessionRouting(
        handoff(
          "**Line:** topology **`full`** · execution **`delegated`** · verify **`independent`**",
        ),
      ).ok,
    ).toBe(false);
  });

  test("V9 live HANDOFF is single/current-session/objective-commands", () => {
    const live = readFileSync(join(import.meta.dir, "..", "HANDOFF.md"), "utf8");
    const result = parseSessionRouting(live);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.routing).toMatchObject({
      topology: "single",
      execution: "current-session",
      verify: "objective-commands",
    });
  });
});
