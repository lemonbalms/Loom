/**
 * Body-prefix handoff contracts (PLAN 0.15.x) — no wire change.
 * Best-effort parse; never blocks send.
 */

export const HANDOFF_CONTRACT_TAGS = [
  "GOAL",
  "R-REQUEST",
  "R-RESULT",
  "VERIFY",
  "DONE",
] as const;

export type HandoffContractTag = (typeof HANDOFF_CONTRACT_TAGS)[number];

export type HandoffContractParse = {
  tags: HandoffContractTag[];
  /** First matching tag if any */
  primary?: HandoffContractTag;
  /** Optional first-line metadata intent: … */
  intent?: string;
  goalId?: string;
  round?: string;
};

const TAG_RE = /\[(GOAL|R-REQUEST|R-RESULT|VERIFY|DONE)\]/gi;

/**
 * Detect contract tags and optional header metadata lines.
 */
export function parseHandoffContract(body: string): HandoffContractParse {
  const tags: HandoffContractTag[] = [];
  const seen = new Set<string>();
  const re = new RegExp(TAG_RE.source, "gi");
  while (true) {
    const m = re.exec(body);
    if (m === null) break;
    const t = m[1]!.toUpperCase() as HandoffContractTag;
    if (!seen.has(t)) {
      seen.add(t);
      tags.push(t);
    }
  }
  const meta: Pick<HandoffContractParse, "intent" | "goalId" | "round"> = {};
  for (const line of body.split(/\r?\n/).slice(0, 12)) {
    const im = /^intent:\s*(.+)$/i.exec(line.trim());
    if (im) meta.intent = im[1]!.trim();
    const gm = /^goalId:\s*(.+)$/i.exec(line.trim());
    if (gm) meta.goalId = gm[1]!.trim();
    const rm = /^round:\s*(.+)$/i.exec(line.trim());
    if (rm) meta.round = rm[1]!.trim();
  }
  return {
    tags,
    primary: tags[0],
    ...meta,
  };
}
