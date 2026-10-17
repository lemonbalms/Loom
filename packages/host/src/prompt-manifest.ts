/**
 * PLAN 0.42.0 D2 — the declared section manifest of a headless worker's input. A frozen TS
 * constant, not a file (repo `.md` templates · `manifest.json` · user overrides are 0.43+).
 *
 * Declaration order = byte order inside each channel. `version` = max(the first shipped release
 * whose headless worker input carried the section, the last shipped release whose producing code
 * changed its output for any input) — R3 · R61-L1; declared metadata, never checked at run time
 * (class 55). `source` names the code that produces the bytes (documentation only).
 *
 * The fence's policy notice · standing rules · reader output are `parts` metadata of
 * `memory-fence`, not sections (C1 · C2): env redaction runs once over their composition, so
 * per-source byte ranges are undefined by construction.
 */

export type PromptSectionId =
  | "worker-hint"
  | "resume-continuation"
  | "skill-listing"
  | "task-marker"
  | "memory-fence"
  | "card-body";

export type PromptChannel = "system" | "user";

export type PromptTurns = "first" | "resume" | "both";

export type FencePartId = "policy-notice" | "standing-rules" | "memory-snapshot";

export type PromptManifestEntry = {
  readonly id: PromptSectionId;
  readonly channel: PromptChannel;
  readonly turns: PromptTurns;
  readonly required: boolean;
  readonly version: string;
  readonly source: string;
  /** `memory-fence` only (R6). */
  readonly parts?: readonly {
    readonly id: FencePartId;
    readonly version: string;
    readonly source: string;
  }[];
};

/** Fence part ids in `composeFenceText` join order (notice → rules → memory). */
export const FENCE_PART_IDS: readonly FencePartId[] = Object.freeze([
  "policy-notice",
  "standing-rules",
  "memory-snapshot",
] as const);

function deepFreeze(entries: PromptManifestEntry[]): readonly PromptManifestEntry[] {
  for (const e of entries) {
    if (e.parts) {
      for (const p of e.parts) Object.freeze(p);
      Object.freeze(e.parts);
    }
    Object.freeze(e);
  }
  return Object.freeze(entries);
}

export const PROMPT_MANIFEST: readonly PromptManifestEntry[] = deepFreeze([
  {
    id: "worker-hint",
    channel: "system",
    turns: "both",
    required: true,
    version: "0.39.0",
    source: "agent-argv.ts HEADLESS_WORKER_HINT",
  },
  {
    id: "resume-continuation",
    channel: "user",
    turns: "resume",
    required: true,
    version: "0.30.0",
    source: "agent-argv.ts RESUME_CONTINUATION_MESSAGE",
  },
  {
    id: "skill-listing",
    channel: "user",
    turns: "first",
    required: false,
    version: "0.39.0",
    source: "skill-prompt.ts renderSkillListing",
  },
  {
    id: "task-marker",
    channel: "user",
    turns: "both",
    required: true,
    version: "0.30.0",
    source: "@loom/protocol DISPATCHED_TASK_MARKER",
  },
  {
    id: "memory-fence",
    channel: "user",
    turns: "first",
    required: false,
    version: "0.40.0",
    source: "memory-inject.ts renderMemoryBlock",
    parts: [
      { id: "policy-notice", version: "0.37.0", source: "policy-gaps.ts renderPolicyNotice" },
      { id: "standing-rules", version: "0.37.0", source: "memory-inject.ts renderRulesSection" },
      { id: "memory-snapshot", version: "0.36.0", source: "memory-snapshot.ts loadMemorySnapshot" },
    ],
  },
  {
    id: "card-body",
    channel: "user",
    turns: "both",
    required: true,
    version: "0.40.0",
    source: "marker-fold.ts neutralizeCardPrompt",
  },
]);
