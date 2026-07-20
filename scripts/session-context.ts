/**
 * SessionStart hook context injector for Claude Code architect sessions.
 * Emits hookSpecificOutput JSON on stdout (opposite of bridge hook-sensor).
 *
 * Usage:
 *   bun run scripts/session-context.ts --part state
 *   bun run scripts/session-context.ts --part lessons
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildStatus,
  checkHandoffBudget,
} from "./session-status.ts";

const root = join(import.meta.dir, "..");
const HARD_CAP = 9500;

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

function truncateContext(text: string): string {
  if (text.length <= HARD_CAP) return text;
  // Room for worst-case digit width of N, then recompute N = chars dropped.
  const maxNoticeLen = `\n…[truncated ${text.length} chars — 원문 파일 참조]`
    .length;
  const keep = Math.max(0, HARD_CAP - maxNoticeLen);
  const cut = text.length - keep;
  return `${text.slice(0, keep)}\n…[truncated ${cut} chars — 원문 파일 참조]`;
}

function buildStateContext(): string {
  const parts: string[] = ["[LOOM-SESSION-CONTEXT v1 · state]", buildStatus()];

  const handoff = read("HANDOFF.md");
  if (handoff) {
    const oneLine = extractSection(handoff, "One-line resume");
    if (oneLine) parts.push(oneLine);
    // Heading includes the star emoji as written in HANDOFF.md
    const current =
      extractSection(handoff, "⭐ Current action (read first)") ??
      extractSection(handoff, "⭐ Current action");
    if (current) parts.push(current);
  }

  const budget = checkHandoffBudget();
  if (budget) parts.push(budget);

  return parts.join("\n\n");
}

function buildLessonsContext(): string {
  const lessons = read("tasks/lessons.md");
  return ["[LOOM-SESSION-CONTEXT v1 · lessons]", lessons].join("\n\n");
}

function emit(part: string): void {
  const raw =
    part === "lessons" ? buildLessonsContext() : buildStateContext();
  const additionalContext = truncateContext(raw);
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
  if (value === "state" || value === "lessons") return value;
  return null;
}

if (import.meta.main) {
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
