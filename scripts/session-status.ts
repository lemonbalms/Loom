/**
 * Print Loom session gate status for humans and coding agents (Codex/Claude).
 * Usage: bun run status
 *        bun run handoff:lint  (or: bun run scripts/session-status.ts --lint)
 *
 * Phase D: handoff:lint runs shared-heading structure checks; status parser is
 * fail-loud (`unknown/malformed`) when PLAN/review/HANDOFF shape cannot be read.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  ONE_LINE_RESUME_HEADING,
  extractHandoffSection,
} from "./handoff-headings.ts";
import {
  HANDOFF_UTF8_BUDGET,
  lintLiveHandoff,
} from "./handoff-lint.ts";

const root = join(import.meta.dir, "..");

export { HANDOFF_UTF8_BUDGET };

/** Loud marker when a status field cannot be parsed (design §9.3 / Owner D4). */
export const STATUS_MALFORMED = "unknown/malformed";

function read(rel: string): string {
  const p = join(root, rel);
  if (!existsSync(p)) return "";
  return readFileSync(p, "utf8");
}

/**
 * Extract first capture group, or STATUS_MALFORMED when text empty / no match.
 * Never returns a silent placeholder that looks like a healthy empty state.
 */
export function matchRequired(text: string, re: RegExp): string {
  if (!text || !text.trim()) return STATUS_MALFORMED;
  const m = re.exec(text);
  const v = m?.[1]?.trim();
  return v && v.length > 0 ? v : STATUS_MALFORMED;
}

/** Parse plan_review Open (blocking) — fail-loud on missing/unparseable shape. */
export function parseOpenBlocking(review: string): string {
  if (!review || !review.trim()) return STATUS_MALFORMED;
  const start = review.indexOf("## Open (blocking)");
  if (start < 0) return STATUS_MALFORMED;
  const end = review.indexOf("\n## ", start + 10);
  const section = review.slice(start, end > start ? end : start + 1200);
  const tableMatch = section.match(
    /\|[^\n]+\|\n\|[-| :]+\|\n([\s\S]*?)(?:\n\n|\n### |\n## |$)/,
  );
  if (!tableMatch) return STATUS_MALFORMED;
  const tableBody = tableMatch[1] ?? "";
  if (/\(none\)/i.test(tableBody) || tableBody.trim() === "") {
    return "없음";
  }
  const ids = [...tableBody.matchAll(/^\|\s*\*\*([^*|]+)\*\*/gm)].map((m) =>
    m[1]!.trim(),
  );
  if (ids.length) return ids.join(", ");
  const plain = [...tableBody.matchAll(/^\|\s*([^|]+?)\s*\|/gm)]
    .map((m) => m[1]!.trim())
    .filter((c) => c && !c.startsWith("---") && c !== "ID");
  return plain.length ? plain.slice(0, 5).join(" · ") : STATUS_MALFORMED;
}

/** One-line resume from canonical heading only — no legacy whole-file fallback. */
export function parseOneLineResume(handoff: string): string {
  if (!handoff || !handoff.trim()) return STATUS_MALFORMED;
  const resumeSection = extractHandoffSection(handoff, ONE_LINE_RESUME_HEADING);
  if (!resumeSection) return STATUS_MALFORMED;
  return matchRequired(resumeSection, />\s*(.+)/);
}

/** Session status table + Files/Run footer (same contract as historical CLI output). */
export function buildStatus(opts?: {
  planText?: string;
  reviewText?: string;
  handoffText?: string;
}): string {
  const plan = opts?.planText ?? read("docs/PLAN.md");
  const review = opts?.reviewText ?? read("docs/plan_review.md");
  const handoff = opts?.handoffText ?? read("HANDOFF.md");

  const version = matchRequired(
    plan,
    /\|\s*\*\*Version\*\*\s*\|\s*\*\*([^*]+)\*\*/,
  );
  const status = matchRequired(
    plan,
    /\|\s*\*\*Status\*\*\s*\|\s*\*\*`?([^`|*]+)`?/,
  );
  const latest = matchRequired(review, />\s*\*\*최신:\*\*\s*(.+)/);
  const openBlock = parseOpenBlocking(review);
  const resumeLine = parseOneLineResume(handoff);

  const latestShown =
    latest === STATUS_MALFORMED
      ? STATUS_MALFORMED
      : `${latest.slice(0, 120)}${latest.length > 120 ? "…" : ""}`;
  const resumeShown =
    resumeLine === STATUS_MALFORMED
      ? STATUS_MALFORMED
      : `${resumeLine.slice(0, 160)}${resumeLine.length > 160 ? "…" : ""}`;

  return `## 세션 상태 (Loom)
| 항목 | 값 |
|------|-----|
| PLAN | ${version} |
| Status | ${status} |
| plan_review 최신 | ${latestShown} |
| Open blocking | ${openBlock} |
| 다음 (HANDOFF) | ${resumeShown} |
| 워크플로 | docs/WORKFLOW.md |
| 진입 규칙 | AGENTS.md (Codex/Claude) |
| 주의 | Loom=제품 · Fable 5=리뷰 에이전트 |

Files: HANDOFF.md · docs/WORKFLOW.md · docs/PLAN.md · docs/plan_review.md
Run: bun test · bun run loom --version
`;
}

/**
 * HANDOFF.md whole-file UTF-8 budget. Returns a one-line warning or null.
 */
export function checkHandoffBudget(): string | null {
  const p = join(root, "HANDOFF.md");
  if (!existsSync(p)) return null;
  const text = readFileSync(p, "utf8");
  const fullBytes = Buffer.byteLength(text, "utf8");
  if (fullBytes > HANDOFF_UTF8_BUDGET) {
    return `⚠ HANDOFF full = ${fullBytes}B > ${HANDOFF_UTF8_BUDGET}B — 종결 웨이브를 docs/HANDOFF_ARCHIVE.md로 이관(규칙 D1)`;
  }
  return null;
}

if (import.meta.main) {
  const lintOnly = process.argv.includes("--lint");
  const budgetWarn = checkHandoffBudget();

  if (lintOnly) {
    const structureErrors = lintLiveHandoff();
    const all: string[] = [...structureErrors];
    // Budget is also inside validateCheckpoint; keep budgetWarn for historical wording.
    if (budgetWarn && !all.some((e) => e.includes("UTF-8 size"))) {
      all.push(budgetWarn);
    }
    if (all.length > 0) {
      for (const e of all) {
        console.error(`handoff:lint FAIL — ${e}`);
      }
      process.exit(1);
    }
    process.exit(0);
  }

  console.log(buildStatus());
  if (budgetWarn) {
    console.log(budgetWarn);
  }
}
