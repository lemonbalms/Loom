/// <reference path="./text-modules.d.ts" />
// The reference carries the SKILL.md text-module declaration (skill-materialize's bundled
// skill, UK-7) into packages that reach it through the headless worker (cli, mcp-server).
/**
 * PLAN 0.31.0 P4. First-turn skill listing for the worker prompt (D5 · R6 · R49-L1).
 *
 * codex/grok: `Available skills — read the SKILL.md before use:` then one
 *   `- <name>: <description> — <abs SKILL.md>` per available skill, plus
 *   SKILL_SHADOW_SUFFIX when a user skill shadows the bundled one (0.37.0 D8).
 * claude: no Available lines (the `--plugin-dir` plugin injects them natively, D4/D5).
 * All three: `- <name>: unavailable: <reason>`.
 * Cap: at most 20 entry lines and 4,096 UTF-8 bytes for the whole block (header,
 * entries, cap line, joined by LF). Entries that do not fit collapse into one
 * `- (+N more): unavailable: cap` line. Available entries come first, then
 * unavailable ones, each sorted by name as materialize returns them.
 *
 * The block goes in the prompt body before the dispatched-task marker, never in
 * argv, and only on a session's first turn (R6).
 *
 * Fail closed: a SKILL.md path that is not absolute or carries a control, format,
 * or line/paragraph separator character (loomDir / HOME can hold anything), or a
 * description that is not one clean line of ≤ 160 code points, throws. So does a
 * path or description whose letters/digits (after NFKC + lowercase) contain the
 * dispatched-task marker head `loomdispatchedtask` — the same fold skill-materialize
 * applies to descriptions — so nothing interpolated can forge the system/data
 * boundary. The caller does not spawn (spawn_setup_failed).
 */
import { isAbsolute } from "node:path";
import type { AgentKind } from "./agent-argv";
import {
  type AvailableSkill,
  SKILL_DESCRIPTION_MAX,
  SKILL_NAME_RE,
  type UnavailableSkill,
} from "./skill-materialize";

export const SKILL_LISTING_HEADER = "Available skills — read the SKILL.md before use:";
/** claude gets only unavailable lines; its available skills come from the plugin. */
export const SKILL_LISTING_CLAUDE_HEADER = "Unavailable skills:";
export const SKILL_LISTING_MAX_ENTRIES = 20;
export const SKILL_LISTING_MAX_BYTES = 4096;
/** PLAN 0.37.0 D8: end of a codex/grok Available line whose user skill shadows a bundled one. */
export const SKILL_SHADOW_SUFFIX = " (user, shadows bundled)";

const UNSAFE_TEXT = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
/** Letters/digits of the DISPATCHED_TASK_MARKER head ("Loom dispatched task"). */
const MARKER_LETTERS = "loomdispatchedtask";

export function containsMarker(text: string): boolean {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "")
    .includes(MARKER_LETTERS);
}

function assertName(name: string): void {
  if (!SKILL_NAME_RE.test(name)) throw new Error(`skill listing: invalid skill name ${JSON.stringify(name)}`);
}

function assertSkillMdPath(path: string): void {
  if (!isAbsolute(path) || UNSAFE_TEXT.test(path)) {
    throw new Error("skill listing: SKILL.md path is not absolute or has control/format characters");
  }
  if (containsMarker(path)) throw new Error("skill listing: SKILL.md path contains the task marker");
}

function assertDescription(description: string): void {
  if (
    description.length === 0 ||
    UNSAFE_TEXT.test(description) ||
    [...description].length > SKILL_DESCRIPTION_MAX
  ) {
    throw new Error("skill listing: description is not one clean line of at most 160 characters");
  }
  if (containsMarker(description)) throw new Error("skill listing: description contains the task marker");
}

function capLine(omitted: number): string {
  return `- (+${omitted} more): unavailable: cap`;
}

function block(header: string, lines: readonly string[], omitted: number): string {
  return [header, ...lines, ...(omitted > 0 ? [capLine(omitted)] : [])].join("\n");
}

function bytes(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

/** "" when there is nothing to list for this CLI. */
export function renderSkillListing(
  agent: AgentKind,
  skills: { available: readonly AvailableSkill[]; unavailable: readonly UnavailableSkill[] },
): string {
  const entries: string[] = [];
  if (agent !== "claude") {
    for (const skill of skills.available) {
      assertName(skill.name);
      assertDescription(skill.description);
      assertSkillMdPath(skill.skillMdPath);
      const label = skill.shadowsBuiltin === true ? SKILL_SHADOW_SUFFIX : "";
      entries.push(`- ${skill.name}: ${skill.description} — ${skill.skillMdPath}${label}`);
    }
  }
  for (const skill of skills.unavailable) {
    assertName(skill.name);
    if (UNSAFE_TEXT.test(skill.reason)) throw new Error("skill listing: unsafe unavailable reason");
    entries.push(`- ${skill.name}: unavailable: ${skill.reason}`);
  }
  if (entries.length === 0) return "";
  const header = agent === "claude" ? SKILL_LISTING_CLAUDE_HEADER : SKILL_LISTING_HEADER;
  const kept: string[] = [];
  for (const entry of entries) {
    if (kept.length >= SKILL_LISTING_MAX_ENTRIES) break;
    const omittedAfter = entries.length - kept.length - 1;
    if (bytes(block(header, [...kept, entry], omittedAfter)) > SKILL_LISTING_MAX_BYTES) break;
    kept.push(entry);
  }
  return block(header, kept, entries.length - kept.length);
}

/** R6: listing (if any) before the wrapped prompt, whose first line is the marker. */
export function composeFirstTurnPrompt(listing: string, wrapped: string): string {
  return listing.length > 0 ? `${listing}\n\n${wrapped}` : wrapped;
}
