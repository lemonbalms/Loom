/**
 * Print Loom session gate status for humans and coding agents (Codex/Claude).
 * Usage: bun run status
 *        bun run handoff:lint  (or: bun run scripts/session-status.ts --lint)
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");

const TOP_LINES = 80;
const TOP_BUDGET_BYTES = 8192;
const FILE_BUDGET_BYTES = 16384;

function read(rel: string): string {
  const p = join(root, rel);
  if (!existsSync(p)) return "";
  return readFileSync(p, "utf8");
}

function match1(text: string, re: RegExp): string {
  const m = re.exec(text);
  return m?.[1]?.trim() ?? "—";
}

/** Session status table + Files/Run footer (same contract as historical CLI output). */
export function buildStatus(): string {
  const plan = read("docs/PLAN.md");
  const review = read("docs/plan_review.md");
  const handoff = read("HANDOFF.md");

  const version = match1(plan, /\|\s*\*\*Version\*\*\s*\|\s*\*\*([^*]+)\*\*/);
  const status = match1(plan, /\|\s*\*\*Status\*\*\s*\|\s*\*\*`?([^`|*]+)`?/);
  const latest = match1(review, />\s*\*\*최신:\*\*\s*(.+)/);
  const openBlock = (() => {
    const start = review.indexOf("## Open (blocking)");
    if (start < 0) return "—";
    const end = review.indexOf("\n## ", start + 10);
    const section = review.slice(start, end > start ? end : start + 1200);
    // only the first markdown table in Open (blocking)
    const tableMatch = section.match(
      /\|[^\n]+\|\n\|[-| :]+\|\n([\s\S]*?)(?:\n\n|\n### |\n## |$)/,
    );
    const tableBody = tableMatch?.[1] ?? "";
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
    return plain.length
      ? plain.slice(0, 5).join(" · ")
      : "있음 (plan_review Open 표 확인)";
  })();

  // Prefer the anchored `## One-line resume` section; fall back to the first
  // long blockquote line only if that section is missing.
  const resume = match1(handoff, /## One-line resume[\s\S]*?>\s*(.+)/);
  const resumeLine =
    resume !== "—"
      ? resume
      : match1(handoff, />\s*`?([^`<\n]{20,200})`?/);

  return `## 세션 상태 (Loom)
| 항목 | 값 |
|------|-----|
| PLAN | ${version} |
| Status | ${status} |
| plan_review 최신 | ${latest.slice(0, 120)}${latest.length > 120 ? "…" : ""} |
| Open blocking | ${openBlock} |
| 다음 (HANDOFF) | ${resumeLine.slice(0, 160)}${resumeLine.length > 160 ? "…" : ""} |
| 워크플로 | docs/WORKFLOW.md |
| 진입 규칙 | AGENTS.md (Codex/Claude) |
| 주의 | Loom=제품 · Fable 5=리뷰 에이전트 |

Files: HANDOFF.md · docs/WORKFLOW.md · docs/PLAN.md · docs/plan_review.md
Run: bun test · bun run loom --version
`;
}

/**
 * HANDOFF.md size budget (UTF-8 bytes). Returns a one-line warning or null.
 * - top 80 lines > 8192 B, or
 * - full file ≥ 16384 B
 */
export function checkHandoffBudget(): string | null {
  const p = join(root, "HANDOFF.md");
  if (!existsSync(p)) return null;
  const text = readFileSync(p, "utf8");
  const fullBytes = Buffer.byteLength(text, "utf8");
  const topText = text.split("\n").slice(0, TOP_LINES).join("\n");
  const topBytes = Buffer.byteLength(topText, "utf8");

  if (topBytes > TOP_BUDGET_BYTES) {
    return `⚠ HANDOFF top-80 = ${topBytes}B > ${TOP_BUDGET_BYTES} — 종결 웨이브를 docs/HANDOFF_ARCHIVE.md로 이관(규칙 L15)`;
  }
  if (fullBytes >= FILE_BUDGET_BYTES) {
    return `⚠ HANDOFF full = ${fullBytes}B ≥ ${FILE_BUDGET_BYTES} — 종결 웨이브를 docs/HANDOFF_ARCHIVE.md로 이관(규칙 L15)`;
  }
  return null;
}

if (import.meta.main) {
  const lintOnly = process.argv.includes("--lint");
  const budgetWarn = checkHandoffBudget();

  if (lintOnly) {
    if (budgetWarn) {
      console.log(budgetWarn);
      process.exit(1);
    }
    process.exit(0);
  }

  console.log(buildStatus());
  if (budgetWarn) {
    console.log(budgetWarn);
  }
}
