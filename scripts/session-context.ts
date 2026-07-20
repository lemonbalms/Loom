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

const root = join(import.meta.dir, "..");

/** Runtime truncation threshold (Claude hook command cap is 10_000). */
export const HARD_CAP = 9500;
/** Commit-gate soft budget (15% headroom under the 10_000 char command cap). */
export const SOFT_CAP = 8500;

const UNCLOSED_DETAILS_WARN =
  "⚠ [LOOM-SESSION-CONTEXT] 미닫힘 <details> 블록 제외됨";

function read(rel: string): string {
  const p = join(root, rel);
  if (!existsSync(p)) return "";
  return readFileSync(p, "utf8");
}

/** Extract markdown section body under `## heading` until the next `## ` heading. */
function extractSection(text: string, heading: string): string | null {
  const needle = `## ${heading}`;
  const start = text.indexOf(needle);
  if (start < 0) return null;
  const bodyStart = start + needle.length;
  const next = text.indexOf("\n## ", bodyStart);
  const body =
    next >= 0 ? text.slice(bodyStart, next) : text.slice(bodyStart);
  return `${needle}${body}`.trimEnd();
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
    .map((h) => extractSection(traps, h))
    .filter((s): s is string => s !== null);
  if (sections.length === 0) return "";
  return stripDetailsBlocks(sections.join("\n\n"));
}

/**
 * Build state injection block. Optional `handoffText` / `trapsText` are for
 * unit tests (synthetic sources); production path reads from disk.
 * stripDetailsBlocks applies only to extracted HANDOFF/traps sections — not to
 * buildStatus() or checkHandoffBudget() output.
 */
export function buildStateContext(
  handoffText?: string,
  trapsText?: string,
): string {
  const parts: string[] = ["[LOOM-SESSION-CONTEXT v1 · state]", buildStatus()];

  const handoff = handoffText ?? read("HANDOFF.md");
  if (handoff) {
    const oneLine = extractSection(handoff, "One-line resume");
    if (oneLine) parts.push(stripDetailsBlocks(oneLine));
    // Heading includes the star emoji as written in HANDOFF.md
    const current =
      extractSection(handoff, "⭐ Current action (read first)") ??
      extractSection(handoff, "⭐ Current action");
    if (current) parts.push(stripDetailsBlocks(current));
  }

  // Traps used to live inside the HANDOFF "Current action" section; keep them
  // in the same slot so the injected reading order is unchanged.
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
