/**
 * HANDOFF structural lint (SESSION-CONTINUITY Phase D).
 *
 * Shared by `bun run handoff:lint` and checkpoint tests so heading contracts
 * cannot silently diverge from `REQUIRED_HANDOFF_HEADINGS`.
 *
 * Authority: docs/spikes/HANDOFF-CHECKPOINT-DESIGN.md §9.2 · §11 V6.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  REQUIRED_HANDOFF_HEADINGS,
  extractHandoffSection,
  extractMarkdownSection,
} from "./handoff-headings.ts";
import { parseSessionRouting } from "./session-routing.ts";

const ROOT = join(import.meta.dir, "..");

/** Whole-file UTF-8 budget (Owner D1). Kept here to avoid lint↔status import cycles. */
export const HANDOFF_UTF8_BUDGET = 8192;

/** History / archive headings that must not reappear in the live checkpoint. */
export const FORBIDDEN_HISTORY_HEADINGS = [
  "Completed waves",
  "종결 웨이브",
  "In progress evidence",
  "Archive",
  "WORKLOG",
  "Done (recent)",
  "History",
  "직전 웨이브",
] as const;

export type ValidateCheckpointOpts = {
  planVersion?: string;
  trapsText?: string;
  requireEvidenceTargets?: boolean;
  root?: string;
  expectedGate?: RegExp;
  /** When true, enforce whole-file UTF-8 ≤ HANDOFF_UTF8_BUDGET (default true). */
  enforceBudget?: boolean;
};

function utf8Bytes(s: string): number {
  return Buffer.byteLength(s, "utf8");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Count top-level `## ` headings matching exact title (no ###). */
export function countHandoffHeading(text: string, title: string): number {
  const re = new RegExp(`^## ${escapeRegExp(title)}\\s*$`, "gm");
  return (text.match(re) ?? []).length;
}

/**
 * Loud structural validation of a nine-section checkpoint document.
 * Returns [] when valid; otherwise human-readable failure reasons (never silent ok).
 */
export function validateCheckpoint(
  doc: string,
  opts?: ValidateCheckpointOpts,
): string[] {
  const errors: string[] = [];
  const root = opts?.root ?? ROOT;
  const planVersion = opts?.planVersion;

  if (!doc || !doc.trim()) {
    errors.push("HANDOFF document empty or missing");
    return errors;
  }

  // Real HTML details open tags only (prose mentioning the prohibition is fine).
  if (/(^|\n)\s*<details[\s>]/m.test(doc) || /<\/details>/i.test(doc)) {
    errors.push("forbidden <details> present");
  }

  for (const h of REQUIRED_HANDOFF_HEADINGS) {
    const n = countHandoffHeading(doc, h);
    if (n === 0) errors.push(`missing required heading: ${h}`);
    if (n > 1) errors.push(`duplicate heading: ${h} (count=${n})`);
  }

  for (const h of FORBIDDEN_HISTORY_HEADINGS) {
    if (countHandoffHeading(doc, h) > 0) {
      errors.push(`forbidden history heading present: ${h}`);
    }
  }

  // Renamed Current action (star emoji live form) is not the Phase C+ contract.
  if (countHandoffHeading(doc, "⭐ Current action (read first)") > 0) {
    errors.push(
      "legacy starred Current action heading present (canonical is ## Current action)",
    );
  }

  if (opts?.enforceBudget !== false) {
    const bytes = utf8Bytes(doc);
    if (bytes > HANDOFF_UTF8_BUDGET) {
      errors.push(`UTF-8 size ${bytes}B > ${HANDOFF_UTF8_BUDGET}`);
    }
  }

  // Optional PLAN version pin (fixture/live tests); omit in generic handoff:lint.
  if (planVersion !== undefined && !doc.includes(planVersion)) {
    errors.push(`PLAN version ${planVersion} not referenced`);
  }
  if (/##\s*Plan status/i.test(doc) || /##\s*Review verdict/i.test(doc)) {
    errors.push("second PLAN/review authority section present");
  }

  const action = extractHandoffSection(doc, "Current action");
  if (action) {
    const gateTitles = [...action.matchAll(/^###\s+(.+)$/gm)].map((m) =>
      m[1]!.trim(),
    );
    if (gateTitles.length !== 1) {
      errors.push(
        `Current action gate titles must be exactly 1, got ${gateTitles.length}`,
      );
    } else if (opts?.expectedGate && !opts.expectedGate.test(gateTitles[0]!)) {
      errors.push(
        `unique next gate does not match expected contract: ${gateTitles[0]}`,
      );
    }
  }

  const routing = parseSessionRouting(doc);
  if (!routing.ok) errors.push(...routing.errors);

  // Dashboard-friendly One-line: body (blockquote markers stripped) ≤ 120 chars.
  const oneLineSec = extractHandoffSection(doc, "One-line resume");
  if (oneLineSec) {
    const body = oneLineSec
      .replace(/^## One-line resume\s*/m, "")
      .replace(/^>\s?/gm, "")
      .replace(/\s+/g, " ")
      .trim();
    if (body.length > 120) {
      errors.push(
        `One-line resume body ${body.length} chars > 120 (dashboard-friendly cap)`,
      );
    }
  }

  // Blockers: either literal `(none)` or a form with clear condition.
  const blockers = extractHandoffSection(doc, "Blockers");
  if (blockers) {
    const body = blockers.replace(/^## Blockers\s*/, "").trim();
    if (body === "") {
      errors.push("malformed Blockers: empty body");
    } else if (
      !/^\(none\)$/m.test(body) &&
      !/clear condition|해제 조건|Clear condition/i.test(body)
    ) {
      errors.push("malformed Blockers: missing (none) or clear-condition form");
    }
  }

  if (opts?.requireEvidenceTargets !== false) {
    const evidence = extractHandoffSection(doc, "Evidence");
    if (evidence) {
      const paths = [...evidence.matchAll(/`([^`]+)`/g)].map((m) => m[1]!);
      for (const p of paths) {
        if (
          p.startsWith("docs/") ||
          p.startsWith("tasks/") ||
          p.startsWith("scripts/") ||
          p === "HANDOFF.md" ||
          p === "HANDOFF_WINDOWS.md" ||
          p === "AGENTS.md"
        ) {
          if (!existsSync(join(root, p))) {
            errors.push(`missing Evidence target: ${p}`);
          }
        }
      }
    }
  }

  if (!existsSync(join(root, "docs/ROADMAP.md"))) {
    const claimsRoadmapAuthority =
      /taken from ROADMAP|from ROADMAP\.md|authoritative.*ROADMAP|ROADMAP\s+SSOT|current loop.*ROADMAP\.md/i.test(
        doc,
      );
    if (claimsRoadmapAuthority) {
      errors.push("ROADMAP authority referenced without adopted docs/ROADMAP.md");
    }
  }

  if (opts?.trapsText !== undefined) {
    const trapsText = opts.trapsText;
    if (trapsText.length > 0) {
      const active = extractMarkdownSection(trapsText, "활성 함정");
      const dont = extractMarkdownSection(trapsText, "하지 말 것");
      if (!active) errors.push("traps missing exact section: 활성 함정");
      if (!dont) errors.push("traps missing exact section: 하지 말 것");
      // Partial rename: one section present is not enough for injection equivalence.
      if (!active || !dont) {
        if (active || dont) {
          errors.push(
            "traps partial loss — both 활성 함정 and 하지 말 것 required",
          );
        } else {
          errors.push("traps headings renamed or missing — injection empty");
        }
      }
    }
  }

  return errors;
}

/**
 * Lint live `HANDOFF.md` (+ optional traps for injection contract).
 * Used by `bun run handoff:lint` — fail-closed.
 */
export function lintLiveHandoff(opts?: {
  root?: string;
  handoffText?: string;
  trapsText?: string;
}): string[] {
  const root = opts?.root ?? ROOT;
  const handoffPath = join(root, "HANDOFF.md");
  if (!opts?.handoffText && !existsSync(handoffPath)) {
    return ["HANDOFF.md missing"];
  }
  const doc =
    opts?.handoffText ?? readFileSync(handoffPath, "utf8");
  const trapsPath = join(root, "tasks/traps.md");
  const trapsText =
    opts?.trapsText ??
    (existsSync(trapsPath) ? readFileSync(trapsPath, "utf8") : "");

  return validateCheckpoint(doc, {
    root,
    trapsText,
    requireEvidenceTargets: true,
    enforceBudget: true,
  });
}

/**
 * Test-only review-source shape check (design §11 V6: table→bullet must not pass).
 */
export function validateReviewSourceShape(reviewText: string): string[] {
  const errors: string[] = [];
  const start = reviewText.indexOf("## Open (blocking)");
  if (start < 0) {
    errors.push("review missing ## Open (blocking) section");
    return errors;
  }
  const end = reviewText.indexOf("\n## ", start + 10);
  const section = reviewText.slice(start, end > start ? end : start + 2000);
  const hasTable =
    /\|[^\n]+\|\n\|[-| :]+\|/.test(section) || /\|[-| :]+\|/.test(section);
  const hasBulletsOnly =
    /^\s*[-*]\s+/m.test(section) &&
    !hasTable &&
    !/\|\s*[-:]+\s*\|/.test(section);
  if (!hasTable) {
    errors.push("review Open(blocking) shape invalid: expected markdown table");
  }
  if (hasBulletsOnly) {
    errors.push("review Open(blocking) shape drifted table→bullet");
  }
  if (/\*\*Open blocking\*\*/i.test(section) && !hasTable) {
    errors.push("review Open(blocking) uses prose/bullet instead of table");
  }
  return errors;
}
