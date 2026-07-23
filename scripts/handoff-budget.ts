/**
 * Handoff authoring budget helper (HANDOFF-AUTHORING-OPT B).
 *
 * While writing HANDOFF.md, show per-section inject contribution, file D1,
 * One-line cap, and diet candidates — before `handoff:check`.
 *
 * Usage:
 *   bun run handoff:budget
 *   bun run scripts/handoff-budget.ts --template
 *
 * Authority: docs/HANDOFF-AUTHORING.md · docs/spikes/HANDOFF-AUTHORING-OPT-PROPOSE.md
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  REQUIRED_HANDOFF_HEADINGS,
  extractHandoffSection,
} from "./handoff-headings.ts";
import { HANDOFF_UTF8_BUDGET } from "./handoff-lint.ts";
import {
  HARD_CAP,
  STATE_TARGET,
  formatStateBudgetReport,
  measureStateBudget,
  type StateBudgetReport,
} from "./session-context.ts";

const ROOT = join(import.meta.dir, "..");

export const ONE_LINE_MAX = 120;

export type AuthorBudgetReport = {
  state: StateBudgetReport;
  fileBytes: number;
  fileBudget: number;
  oneLineChars: number;
  oneLineMax: number;
  stateTarget: number;
  hardCap: number;
  /** Non-pinned parts sorted by chars desc (diet first). */
  dietCandidates: { name: string; chars: number; dropOrder: number }[];
  ok: boolean;
  errors: string[];
  warns: string[];
};

function readHandoff(path = join(ROOT, "HANDOFF.md")): string {
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf8");
}

function oneLineBodyChars(handoff: string): number {
  const section = extractHandoffSection(handoff, "One-line resume");
  if (!section) return 0;
  return section
    .replace(/^## One-line resume\s*/m, "")
    .replace(/^>\s?/gm, "")
    .replace(/\s+/g, " ")
    .trim().length;
}

/**
 * Measure live (or provided) HANDOFF for authoring feedback.
 * Pure when handoffText/trapsText are passed.
 */
export function measureAuthorBudget(
  handoffText?: string,
  trapsText?: string,
): AuthorBudgetReport {
  const handoff = handoffText ?? readHandoff();
  const state = measureStateBudget(handoffText, trapsText);
  const fileBytes = Buffer.byteLength(handoff, "utf8");
  const oneLineChars = oneLineBodyChars(handoff);

  const dietCandidates = state.parts
    .filter((p) => !p.pinned && p.chars > 0)
    .slice()
    .sort((a, b) => b.chars - a.chars || b.dropOrder - a.dropOrder)
    .map((p) => ({ name: p.name, chars: p.chars, dropOrder: p.dropOrder }));

  const errors: string[] = [];
  const warns: string[] = [];

  if (state.omitted.length > 0) {
    errors.push(
      `state inject would omit: ${state.omitted.join(", ")} (raw ${state.rawChars} > HARD_CAP ${HARD_CAP})`,
    );
  }
  if (fileBytes > HANDOFF_UTF8_BUDGET) {
    errors.push(
      `HANDOFF file ${fileBytes}B > D1 ${HANDOFF_UTF8_BUDGET}B — archive completed waves`,
    );
  }
  if (oneLineChars > ONE_LINE_MAX) {
    errors.push(
      `One-line resume body ${oneLineChars} chars > ${ONE_LINE_MAX}`,
    );
  }
  if (state.rawChars > STATE_TARGET) {
    warns.push(
      `raw ${state.rawChars} > STATE_TARGET ${STATE_TARGET} (over by ${state.rawChars - STATE_TARGET}) — diet HANDOFF; do not slim-delete axes`,
    );
  }

  return {
    state,
    fileBytes,
    fileBudget: HANDOFF_UTF8_BUDGET,
    oneLineChars,
    oneLineMax: ONE_LINE_MAX,
    stateTarget: STATE_TARGET,
    hardCap: HARD_CAP,
    dietCandidates,
    ok: errors.length === 0,
    errors,
    warns,
  };
}

/** Human-readable authoring report (stdout). */
export function formatAuthorBudgetReport(report: AuthorBudgetReport): string {
  const lines: string[] = [
    "handoff:budget — authoring feedback (chars / bytes)",
    "",
    formatStateBudgetReport(report.state),
    "",
    `file UTF-8 ${report.fileBytes}B / D1 ${report.fileBudget}B` +
      (report.fileBytes > report.fileBudget
        ? " · OVER"
        : ` · margin ${report.fileBudget - report.fileBytes}B`),
    `One-line body ${report.oneLineChars} / ${report.oneLineMax}` +
      (report.oneLineChars > report.oneLineMax ? " · OVER" : " · ok"),
    `STATE_TARGET ${report.stateTarget} · raw ${report.state.rawChars}` +
      (report.state.rawChars > report.stateTarget
        ? ` · over by ${report.state.rawChars - report.stateTarget}`
        : " · on target"),
    `HARD_CAP ${report.hardCap} · omitted: ${
      report.state.omitted.length ? report.state.omitted.join(", ") : "(none)"
    }`,
  ];

  if (report.dietCandidates.length > 0) {
    lines.push("", "Diet candidates (largest non-pinned first):");
    for (const c of report.dietCandidates.slice(0, 6)) {
      lines.push(
        `  - ${c.name}: ${c.chars} chars (dropOrder ${c.dropOrder})`,
      );
    }
  }

  if (report.warns.length > 0) {
    lines.push("", ...report.warns.map((w) => `WARN: ${w}`));
  }
  if (report.errors.length > 0) {
    lines.push("", ...report.errors.map((e) => `FAIL: ${e}`));
  } else {
    lines.push("", "OK — ship with: bun run handoff:check");
  }

  lines.push(
    "",
    "Guide: docs/HANDOFF-AUTHORING.md · Must not: permanent nine-axis slim-delete",
  );
  return lines.join("\n");
}

/** Minimal nine-section skeleton for new/reset drafts (stdout only). */
export function handoffSectionTemplate(): string {
  const sections = REQUIRED_HANDOFF_HEADINGS.map((h) => {
    if (h === "One-line resume") {
      return `## ${h}\n\n> Product · gate · next (≤120 chars body)\n`;
    }
    if (h === "Current action") {
      return [
        `## ${h}`,
        "",
        "### Gate title (exactly one ###)",
        "",
        "**Goal:** …",
        "",
        "**Authority:** …",
        "",
        "**Session start:**",
        "",
        "1. `bun run status` · `bun run handoff:check`",
        "2. …",
        "",
        "**Done when:** …",
        "",
        "**Must not:** …",
        "",
      ].join("\n");
    }
    if (h === "Blockers") {
      return `## ${h}\n\n(none)\n`;
    }
    if (h === "Active checks" || h === "Owner pending" || h === "Current loop") {
      return `## ${h}\n\n| … | … |\n|---|---|\n| … | … |\n`;
    }
    if (h === "Invariants" || h === "Don't redo") {
      return `## ${h}\n\n- …\n`;
    }
    if (h === "Evidence") {
      return `## ${h}\n\n- paths/SHAs in backticks — e.g. \`docs/PLAN.md\`\n`;
    }
    return `## ${h}\n\n…\n`;
  });
  return [
    "# HANDOFF — Loom",
    "",
    "**Updated:** YYYY-MM-DD",
    "**Workspace:** `/path/to/repo`",
    "",
    ...sections,
    "",
    "# After edit",
    "",
    "```bash",
    "bun run handoff:budget",
    "bun run handoff:check",
    "```",
    "",
  ].join("\n");
}

function main(): never {
  if (process.argv.includes("--template") || process.argv.includes("-t")) {
    console.log(handoffSectionTemplate());
    process.exit(0);
  }

  try {
    const report = measureAuthorBudget();
    console.log(formatAuthorBudgetReport(report));
    process.exit(report.ok ? 0 : 1);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}
