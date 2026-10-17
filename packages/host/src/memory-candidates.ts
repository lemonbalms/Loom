/**
 * PLAN 0.38.0 D5 · R7 — the `LOOM-MEMORY-CANDIDATES` block grammar (pure, no IO).
 * Marker lines match exactly after `trimEnd()` (one trailing `\r` dropped first). BEGIN opens a
 * block (dropping an open one), END closes it; the result is the last complete block. Inside:
 * blank lines are ignored, `- <type>: <body>` is a candidate, anything else counts `invalid`.
 * The first MEMORY_CANDIDATES_PER_ATTEMPT candidates are kept; the rest count `overflow`.
 */
import type { MemoryEntryType } from "./memory-store";

export const MEMORY_CANDIDATES_BEGIN = "LOOM-MEMORY-CANDIDATES";
export const MEMORY_CANDIDATES_END = "LOOM-MEMORY-END";
export const MEMORY_CANDIDATES_PER_ATTEMPT = 5;

export type MemoryCandidate = { type: MemoryEntryType; body: string };

export type ParsedMemoryCandidates = {
  block: boolean;
  candidates: MemoryCandidate[];
  invalid: number;
  overflow: number;
};

const CANDIDATE_RE = /^- (fact|decision|preference): (\S.*)$/;

export function parseMemoryCandidates(text: string): ParsedMemoryCandidates {
  let open: string[] | null = null;
  let last: string[] | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    const marker = line.trimEnd();
    if (marker === MEMORY_CANDIDATES_BEGIN) {
      open = [];
    } else if (marker === MEMORY_CANDIDATES_END) {
      if (open) last = open;
      open = null;
    } else if (open) {
      open.push(line);
    }
  }
  if (!last) return { block: false, candidates: [], invalid: 0, overflow: 0 };
  const candidates: MemoryCandidate[] = [];
  let invalid = 0;
  let overflow = 0;
  for (const line of last) {
    if (line.trim() === "") continue;
    const m = CANDIDATE_RE.exec(line);
    if (!m) {
      invalid += 1;
      continue;
    }
    if (candidates.length >= MEMORY_CANDIDATES_PER_ATTEMPT) {
      overflow += 1;
      continue;
    }
    candidates.push({ type: m[1] as MemoryEntryType, body: m[2]!.trimEnd() });
  }
  return { block: true, candidates, invalid, overflow };
}
