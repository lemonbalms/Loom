/**
 * Canonical SESSION-CONTINUITY checkpoint headings.
 *
 * Keep this list shared by the state injector, status reader, and checkpoint
 * tests so a heading rename cannot silently split their contracts.
 */
export const REQUIRED_HANDOFF_HEADINGS = [
  "One-line resume",
  "Current loop",
  "Current action",
  "Active checks",
  "Owner pending",
  "Blockers",
  "Invariants",
  "Evidence",
  "Don't redo",
] as const;

export type HandoffHeading = (typeof REQUIRED_HANDOFF_HEADINGS)[number];

export const ONE_LINE_RESUME_HEADING: HandoffHeading = "One-line resume";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Extract one exact level-two Markdown section through the next `##` heading. */
export function extractHandoffSection(text: string, heading: string): string | null {
  const headingRe = new RegExp(`^## ${escapeRegExp(heading)}\\s*$`, "m");
  return extractMatchedSection(text, headingRe);
}

/**
 * Anchored section extraction for owned headings with an explanatory suffix,
 * such as `## 활성 함정 (상세 ...)`. Handoff's nine canonical sections use
 * the exact extractor above; traps intentionally retain their suffix contract.
 */
export function extractMarkdownSection(text: string, heading: string): string | null {
  const headingRe = new RegExp(`^## ${escapeRegExp(heading)}(?=\\s|$)`, "m");
  return extractMatchedSection(text, headingRe);
}

function extractMatchedSection(text: string, headingRe: RegExp): string | null {
  const match = headingRe.exec(text);
  if (!match || match.index === undefined) return null;

  const start = match.index;
  const bodyStart = start + match[0].length;
  const next = text.slice(bodyStart).search(/\n##\s+/);
  const end = next < 0 ? text.length : bodyStart + next;
  return text.slice(start, end).trimEnd();
}
