/**
 * SessionStart hook context injector for Claude Code architect sessions.
 * Emits hookSpecificOutput JSON on stdout (opposite of bridge hook-sensor).
 *
 * Usage:
 *   bun run scripts/session-context.ts --part state
 *   bun run scripts/session-context.ts --part lessons
 *   bun run scripts/session-context.ts --part all
 *   bun run session-context:lint  (or: --lint)
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildStatus,
  checkHandoffBudget,
} from "./session-status.ts";
import {
  extractHandoffSection,
  extractMarkdownSection,
} from "./handoff-headings.ts";

const root = join(import.meta.dir, "..");

/**
 * Runtime truncation threshold (Claude hook command cap is 10_000).
 *
 * NOT a policy knob — this is pinned under a **platform** limit. The Claude Code
 * SessionStart hook truncates stdout at 10,000 chars **silently** (lessons platform (18),
 * 공식 문서 대조 확정). Raising this past ~9,900 does not buy budget: it only replaces
 * our truncation (which appends an explicit `…[truncated N chars]` marker) with the
 * platform's, which gives no signal at all.
 *
 * To actually gain budget, split the payload across more hooks — each hook gets its own
 * 10,000 cap. That is exactly why state/lessons are already 2 separate hooks.
 */
export const HARD_CAP = 9500;
/**
 * Commit-gate soft budget — **policy knob, safe to tune.**
 *
 * 2026-07-21 오너 지시: 기존 규정을 당분간 **150%까지 허용**한다 (8500 → 12750).
 * 이 값은 lint 게이트일 뿐 런타임 절단과 무관하므로 상향에 부작용이 없다.
 * ⚠️ 단 HARD_CAP(9500)을 넘는 구간에서는 런타임 절단이 계속 일어난다 — SOFT_CAP 상향은
 * "커밋을 막지 않는다"는 뜻이지 "내용이 다 주입된다"는 뜻이 아니다. 근본 해법은 hook 분할.
 */
export const SOFT_CAP = 12750;

const UNCLOSED_DETAILS_WARN =
  "⚠ [LOOM-SESSION-CONTEXT] 미닫힘 <details> 블록 제외됨";

function read(rel: string): string {
  const p = join(root, rel);
  if (!existsSync(p)) return "";
  return readFileSync(p, "utf8");
}

/**
 * Drop line-bounded `<details>…</details>` blocks (tags included).
 * Pure filter — never mutates source files. Blank runs collapse to one empty line.
 * Unclosed `<details>`: drop that open-through-EOF span and prefix a loud warning.
 */
export function stripDetailsBlocks(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let inDetails = false;
  let sawUnclosed = false;

  for (const line of lines) {
    if (!inDetails) {
      if (line.startsWith("<details")) {
        // Single-line <details>…</details> — drop and stay out of the block.
        if (line.trimEnd().endsWith("</details>")) continue;
        inDetails = true;
        continue;
      }
      out.push(line);
      continue;
    }
    // Inside a details block — drop until a line that ends with </details>
    if (line.trimEnd().endsWith("</details>")) {
      inDetails = false;
      continue;
    }
  }

  if (inDetails) {
    sawUnclosed = true;
  }

  // Collapse consecutive blank lines to a single blank line.
  const normalized: string[] = [];
  let prevBlank = false;
  for (const line of out) {
    const blank = line.trim() === "";
    if (blank && prevBlank) continue;
    normalized.push(line);
    prevBlank = blank;
  }

  let result = normalized.join("\n");
  if (sawUnclosed) {
    result = result.length > 0
      ? `${UNCLOSED_DETAILS_WARN}\n${result}`
      : UNCLOSED_DETAILS_WARN;
  }
  return result;
}

/**
 * Loud truncation: budget overrun marker is placed at the **front** of the block
 * so agents see it even when the tail is cut. Tail notice is retained.
 */
export function truncateContext(text: string): string {
  if (text.length <= HARD_CAP) return text;

  const over = text.length - HARD_CAP;
  // Worst-case digit widths so the final string stays ≤ HARD_CAP.
  const maxHead = `⚠ [LOOM-SESSION-CONTEXT] 예산 초과 — ${text.length}자 초과, tasks/lessons.md 정리 필요\n`
    .length;
  const maxTail = `\n…[truncated ${text.length} chars — 원문 파일 참조]`
    .length;
  const keep = Math.max(0, HARD_CAP - maxHead - maxTail);
  const cut = text.length - keep;
  const head =
    `⚠ [LOOM-SESSION-CONTEXT] 예산 초과 — ${over}자 초과, tasks/lessons.md 정리 필요\n`;
  return `${head}${text.slice(0, keep)}\n…[truncated ${cut} chars — 원문 파일 참조]`;
}

/**
 * Extract the two injected sections of tasks/traps.md (file header is not
 * injected — it is guidance for humans editing the file, and the injection
 * budget has no room for it). Missing file/sections → "" (fail-open).
 */
export function buildTrapsBlock(trapsText?: string): string {
  const traps = trapsText ?? read("tasks/traps.md");
  if (!traps) return "";
  const sections = ["활성 함정", "하지 말 것"]
    .map((h) => extractMarkdownSection(traps, h))
    .filter((s): s is string => s !== null);
  if (sections.length === 0) return "";
  return stripDetailsBlocks(sections.join("\n\n"));
}

/** Max chars for optional One-line resume clip in slim state inject (dashboard-friendly). */
export const ONE_LINE_INJECT_MAX = 120;

/**
 * Clip One-line resume body for slim SessionStart inject.
 * Body = section text after heading, blockquote markers stripped, single line.
 * Returns null when section missing or empty after strip.
 */
export function clipOneLineResume(
  handoff: string,
  max = ONE_LINE_INJECT_MAX,
): string | null {
  const section = extractHandoffSection(handoff, "One-line resume");
  if (!section) return null;
  const body = stripDetailsBlocks(section)
    .replace(/^## One-line resume\s*/m, "")
    .replace(/^>\s?/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!body) return null;
  if (body.length <= max) return body;
  return `${body.slice(0, Math.max(0, max - 1))}…`;
}

/**
 * Build state injection block (Dashboard-first slim inject).
 *
 * Production inject (hook path):
 *   sentinel · buildStatus() · optional clipped One-line · Current action · traps · budget
 *
 * Does **not** dump all nine HANDOFF sections — no-hook agents still read full
 * HANDOFF via AGENTS ritual. stripDetailsBlocks applies only to extracted
 * HANDOFF/traps sections — not to buildStatus() or checkHandoffBudget().
 *
 * Optional `handoffText` / `trapsText` are for unit tests (synthetic sources).
 */
export function buildStateContext(
  handoffText?: string,
  trapsText?: string,
): string {
  const parts: string[] = ["[LOOM-SESSION-CONTEXT v1 · state]", buildStatus()];

  const handoff = handoffText ?? read("HANDOFF.md");
  if (handoff) {
    const oneLine = clipOneLineResume(handoff);
    if (oneLine) {
      parts.push(`## One-line resume\n\n> ${oneLine}`);
    }

    const action = extractHandoffSection(handoff, "Current action");
    if (action) {
      parts.push(stripDetailsBlocks(action));
    } else {
      parts.push(
        "⚠ [LOOM-SESSION-CONTEXT] required HANDOFF sections missing: Current action",
      );
    }
  }

  // Traps used to live inside the HANDOFF "Current action" section; keep them
  // after the gate so the injected reading order stays gate-then-safety.
  const traps = buildTrapsBlock(trapsText);
  if (traps) parts.push(traps);

  const budget = checkHandoffBudget();
  if (budget) parts.push(budget);

  return parts.join("\n\n");
}

export function buildLessonsContext(): string {
  const lessons = stripDetailsBlocks(read("tasks/lessons.md"));
  return ["[LOOM-SESSION-CONTEXT v1 · lessons]", lessons].join("\n\n");
}

/** Fixed order: state → lessons. Deterministic join matching harness delimiter. */
export function buildAllContext(): string {
  return [buildStateContext(), buildLessonsContext()].join("\n\n---\n");
}

function buildRaw(part: string): string {
  if (part === "lessons") return buildLessonsContext();
  if (part === "all") return buildAllContext();
  return buildStateContext();
}

function emit(part: string): void {
  const additionalContext = truncateContext(buildRaw(part));
  const payload = {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext,
    },
  };
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function parsePart(argv: string[]): string | null {
  const idx = argv.indexOf("--part");
  if (idx < 0 || idx + 1 >= argv.length) return null;
  const value = argv[idx + 1];
  if (value === "state" || value === "lessons" || value === "all") return value;
  return null;
}

/** Soft-cap check used by --lint (and unit tests). */
export function checkSoftCap(length: number): {
  ok: boolean;
  length: number;
  over: number;
} {
  const over = Math.max(0, length - SOFT_CAP);
  return { ok: length <= SOFT_CAP, length, over };
}

function runLint(): never {
  // NOT fail-open: lint must surface errors to the commit gate.
  const raw = buildAllContext();
  // additionalContext path: D2 filter is inside buildLessonsContext; measure
  // post-D2 length (pre-truncate is the true budget signal; under HARD_CAP they match).
  const additionalContext = truncateContext(raw);
  const result = checkSoftCap(additionalContext.length);
  if (!result.ok) {
    console.error(
      `session-context:lint FAIL — ${result.length} chars > SOFT_CAP ${SOFT_CAP} (over by ${result.over})`,
    );
    process.exit(1);
  }
  process.exit(0);
}

if (import.meta.main) {
  if (process.argv.includes("--lint")) {
    try {
      runLint();
    } catch (err) {
      // --lint is outside fail-open: exceptions must fail the gate.
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  }

  try {
    const part = parsePart(process.argv);
    if (!part) {
      // Unknown/missing part: fail-open (do not block session start).
      process.exit(0);
    }
    emit(part);
  } catch {
    // fail-open: any error → no stdout, exit 0
    process.exit(0);
  }
}
