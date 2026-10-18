/**
 * PLAN 0.42.0 D3 — the one assembler for a headless worker's input (R1 · R2 · R4). Pure: no IO,
 * no randomness, no env.
 *
 * Bytes come from the existing helpers, exactly as 0.41.0 composed them (R4):
 *   first turn = composeFirstTurnPrompt(listing, composeMemoryWrapped(cardBody, memoryBlock))
 *   resume     = `${RESUME_CONTINUATION_MESSAGE}\n\n${wrapDispatchedPrompt(cardBody)}`
 * The trace is built from the pieces in manifest order (R1), each separator "\n\n" being the
 * previous section's tail (R2); the pieces must join to the user text or the assembler throws
 * (class 61 — the caller does not spawn). Boundaries are never searched for in the text: a
 * body or fence line can imitate the marker or a separator (R4 (a) · C1).
 *
 * PLAN 0.43.0 R3: the system channel (`HEADLESS_WORKER_HINT`) is traced the same way — six sections
 * from `HEADLESS_SYSTEM_SECTIONS`, each but the last carrying the "\n\n" tail, checked against the
 * system text by the same self-check.
 */
import { createHash } from "node:crypto";
import { DISPATCHED_TASK_MARKER, wrapDispatchedPrompt } from "@loom/protocol";
import {
  type AgentKind,
  HEADLESS_SYSTEM_SECTIONS,
  HEADLESS_WORKER_HINT,
  RESUME_CONTINUATION_MESSAGE,
  type SystemSectionId,
} from "./agent-argv";
import { composeMemoryWrapped } from "./memory-inject";
import {
  FENCE_PART_IDS,
  type FencePartId,
  PROMPT_MANIFEST,
  type PromptChannel,
  type PromptManifestEntry,
  type PromptSectionId,
} from "./prompt-manifest";
import { composeFirstTurnPrompt } from "./skill-prompt";

export type AssembleInput = {
  agent: AgentKind;
  turn: "first" | "resume";
  /** `renderSkillListing` output; "" = none. */
  listing: string;
  /** Fence bytes F written by memorySnapshotLocked; "" = none. */
  memoryBlock: string;
  /** Sources that went into F, in FENCE_PART_IDS order; empty iff memoryBlock === "". */
  memoryParts: readonly FencePartId[];
  /** `neutralizeCardPrompt(card.prompt).text`. */
  cardBody: string;
};

export type SectionTrace = {
  id: PromptSectionId;
  channel: PromptChannel;
  version: string;
  /** UTF-8 byte offset inside the channel text (`Buffer.from` bytes — lone surrogate = 3 B). */
  offset: number;
  /** UTF-8 byte length, tail separator included (R2). */
  bytes: number;
  /** Lowercase hex sha256 of those bytes. */
  sha256: string;
  /** `memory-fence` only (C1: ids and versions, no byte ranges). */
  parts?: { id: FencePartId; version: string }[];
};

export type AssembledPrompt = { system: string; user: string; sections: SectionTrace[] };

const SEP = "\n\n";

/**
 * R6 · R61-L2(a): which sources went into the fence, from the values the caller already holds —
 * the same tests `composeFenceText` applies (the reader text loses one trailing "\n" first).
 */
export function memoryFenceParts(notice: string, rules: string, memoryText: string): FencePartId[] {
  const memory = memoryText.endsWith("\n") ? memoryText.slice(0, -1) : memoryText;
  const parts: FencePartId[] = [];
  if (notice !== "") parts.push("policy-notice");
  if (rules !== "") parts.push("standing-rules");
  if (memory !== "") parts.push("memory-snapshot");
  return parts;
}

/**
 * R4 self-check: the traced pieces must join to the channel text, byte for byte. Bytes =
 * `Buffer.from(…, "utf8")` (a lone surrogate → U+FFFD, 3 B — the record's `toWellFormed()`
 * bytes); Bun's `Buffer.byteLength` counts a lone surrogate as 2 B, so it is not used.
 */
export function assertSectionsCover(pieces: readonly string[], text: string): void {
  const joined = pieces.join("");
  const bytes = Buffer.concat(pieces.map((p) => Buffer.from(p, "utf8")));
  if (joined !== text || !bytes.equals(Buffer.from(text, "utf8"))) {
    throw new Error("prompt assemble: section pieces do not cover the channel text");
  }
}

function checkParts(memoryBlock: string, memoryParts: readonly FencePartId[]): void {
  if ((memoryParts.length > 0) !== (memoryBlock !== "")) {
    throw new Error("prompt assemble: memory parts do not match the memory block");
  }
  let last = -1;
  for (const id of memoryParts) {
    const at = FENCE_PART_IDS.indexOf(id);
    if (at < 0) throw new Error("prompt assemble: unknown memory part");
    if (at <= last) throw new Error("prompt assemble: memory parts duplicated or out of order");
    last = at;
  }
}

function onTurn(entry: PromptManifestEntry, turn: "first" | "resume"): boolean {
  return entry.turns === "both" || entry.turns === turn;
}

/**
 * 0.43.0 R3: a system section's piece = its text + the "\n\n" tail, except `closing-boundary`
 * (the end of the system channel) — the same tail rule as the user channel (R2).
 */
function systemPiece(id: SystemSectionId): string {
  const section = HEADLESS_SYSTEM_SECTIONS.find((s) => s.id === id);
  if (!section) throw new Error("prompt assemble: system section not declared");
  return id === "closing-boundary" ? section.text : `${section.text}${SEP}`;
}

/** The piece a section contributes on this turn; null = an optional section left out. */
function pieceFor(id: PromptSectionId, input: AssembleInput): string | null {
  switch (id) {
    case "boundary":
    case "identity":
    case "ops-rules":
    case "tools":
    case "response-style":
    case "closing-boundary":
      return systemPiece(id);
    case "resume-continuation":
      return `${RESUME_CONTINUATION_MESSAGE}${SEP}`;
    case "skill-listing":
      return input.listing === "" ? null : `${input.listing}${SEP}`;
    case "task-marker":
      return `${DISPATCHED_TASK_MARKER}${SEP}`;
    case "memory-fence":
      return input.memoryBlock === "" ? null : `${input.memoryBlock}${SEP}`;
    case "card-body":
      return input.cardBody;
  }
}

function trace(channel: PromptChannel, text: string, input: AssembleInput): SectionTrace[] {
  const pieces: string[] = [];
  const out: SectionTrace[] = [];
  let offset = 0;
  for (const entry of PROMPT_MANIFEST) {
    if (entry.channel !== channel || !onTurn(entry, input.turn)) continue;
    const piece = pieceFor(entry.id, input);
    if (piece === null) continue;
    const buf = Buffer.from(piece, "utf8");
    const t: SectionTrace = {
      id: entry.id,
      channel,
      version: entry.version,
      offset,
      bytes: buf.length,
      sha256: createHash("sha256").update(buf).digest("hex"),
    };
    if (entry.id === "memory-fence") {
      const versions = new Map((entry.parts ?? []).map((p) => [p.id, p.version]));
      t.parts = input.memoryParts.map((id) => {
        const version = versions.get(id);
        if (version === undefined) throw new Error("prompt assemble: memory part not in manifest");
        return { id, version };
      });
    }
    pieces.push(piece);
    out.push(t);
    offset += buf.length;
  }
  assertSectionsCover(pieces, text);
  return out;
}

export function assembleHeadlessPrompt(input: AssembleInput): AssembledPrompt {
  if (input.turn !== "first" && input.turn !== "resume") {
    throw new Error("prompt assemble: turn must be first or resume");
  }
  // Today a resume carries neither listing nor fence (0.31.0 R6 · headless-worker first-turn gate).
  if (input.turn === "resume" && (input.listing !== "" || input.memoryBlock !== "")) {
    throw new Error("prompt assemble: a resume carries no skill listing or memory block");
  }
  checkParts(input.memoryBlock, input.memoryParts);
  const system = HEADLESS_WORKER_HINT;
  const user =
    input.turn === "first"
      ? composeFirstTurnPrompt(input.listing, composeMemoryWrapped(input.cardBody, input.memoryBlock))
      : `${RESUME_CONTINUATION_MESSAGE}\n\n${wrapDispatchedPrompt(input.cardBody)}`;
  return {
    system,
    user,
    sections: [...trace("system", system, input), ...trace("user", user, input)],
  };
}
