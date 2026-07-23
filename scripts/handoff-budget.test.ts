/**
 * handoff:budget — authoring feedback unit tests (HANDOFF-AUTHORING-OPT B).
 */
import { describe, expect, test } from "bun:test";
import { REQUIRED_HANDOFF_HEADINGS } from "./handoff-headings.ts";
import { HANDOFF_UTF8_BUDGET } from "./handoff-lint.ts";
import {
  ONE_LINE_MAX,
  formatAuthorBudgetReport,
  handoffSectionTemplate,
  measureAuthorBudget,
} from "./handoff-budget.ts";
import { HARD_CAP, STATE_TARGET } from "./session-context.ts";

function nineSectionHandoff(overrides: Partial<Record<string, string>> = {}): string {
  return [
    "# HANDOFF",
    "",
    ...REQUIRED_HANDOFF_HEADINGS.flatMap((heading) => {
      if (overrides[heading] !== undefined) {
        return [`## ${heading}`, overrides[heading], ""];
      }
      if (heading === "One-line resume") {
        return [`## ${heading}`, "", "> short resume line", ""];
      }
      if (heading === "Current action") {
        return [
          `## ${heading}`,
          "",
          "### Test gate",
          "",
          "**Goal:** g",
          "",
          "**Done when:** d",
          "",
          "**Must not:** m",
          "",
        ];
      }
      if (heading === "Blockers") {
        return [`## ${heading}`, "", "(none)", ""];
      }
      return [`## ${heading}`, `${heading}-body`, ""];
    }),
  ].join("\n");
}

describe("handoff:budget measureAuthorBudget", () => {
  test("under budget → ok, lists diet candidates, STATE_TARGET on target path", () => {
    const handoff = nineSectionHandoff();
    const report = measureAuthorBudget(handoff, "");
    expect(report.ok).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.state.omitted).toEqual([]);
    expect(report.oneLineChars).toBeLessThanOrEqual(ONE_LINE_MAX);
    expect(report.fileBytes).toBeLessThanOrEqual(HANDOFF_UTF8_BUDGET);
    expect(report.hardCap).toBe(HARD_CAP);
    expect(report.stateTarget).toBe(STATE_TARGET);
    expect(report.dietCandidates.every((c) => c.chars > 0)).toBe(true);
    // Current action is pinned — not a diet candidate
    expect(report.dietCandidates.some((c) => c.name === "Current action")).toBe(
      false,
    );
  });

  test("One-line over 120 → FAIL", () => {
    const long = "x".repeat(130);
    const handoff = nineSectionHandoff({
      "One-line resume": `> ${long}`,
    });
    const report = measureAuthorBudget(handoff, "");
    expect(report.ok).toBe(false);
    expect(report.errors.some((e) => e.includes("One-line"))).toBe(true);
    expect(report.oneLineChars).toBeGreaterThan(ONE_LINE_MAX);
  });

  test("over HARD_CAP omit path → FAIL with omit error", () => {
    const pad = "Z".repeat(4000);
    const handoff = nineSectionHandoff({
      Evidence: `Evidence\n${pad}`,
      "Don't redo": `Don't\n${pad}`,
      Invariants: `Inv\n${pad}`,
    });
    const report = measureAuthorBudget(handoff, "");
    expect(report.ok).toBe(false);
    expect(report.state.omitted.length).toBeGreaterThan(0);
    expect(report.errors.some((e) => e.includes("omit"))).toBe(true);
  });

  test("formatAuthorBudgetReport includes table + guide pointer", () => {
    const handoff = nineSectionHandoff();
    const text = formatAuthorBudgetReport(measureAuthorBudget(handoff, ""));
    expect(text).toContain("handoff:budget");
    expect(text).toContain("| part | chars |");
    expect(text).toContain("docs/HANDOFF-AUTHORING.md");
    expect(text).toContain("OK — ship with: bun run handoff:check");
  });

  test("template lists all nine headings + budget commands", () => {
    const t = handoffSectionTemplate();
    for (const h of REQUIRED_HANDOFF_HEADINGS) {
      expect(t).toContain(`## ${h}`);
    }
    expect(t).toContain("bun run handoff:budget");
    expect(t).toContain("### Gate title");
    expect(t).toContain("(none)");
  });
});
