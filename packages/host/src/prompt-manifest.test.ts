/**
 * PLAN 0.42.0 P1 (tests-first) — the declared section manifest (D2 · ② manifest rows · R3 ·
 * R61-L1 · D9). `PROMPT_MANIFEST` is pinned literally: order = byte order inside each channel,
 * every field, the fence parts and the version strings (R3 max rule — class 55: declared, not
 * runtime-checked).
 */
import { describe, expect, test } from "bun:test";
import { FENCE_PART_IDS, PROMPT_MANIFEST } from "./prompt-manifest";

describe("PROMPT_MANIFEST (0.42.0 D2)", () => {
  test("six entries, verbatim, in declared order", () => {
    expect(PROMPT_MANIFEST).toEqual([
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
  });

  test("ids in order, unique, at most 8 entries (D9)", () => {
    const ids = PROMPT_MANIFEST.map((e) => e.id);
    expect(ids).toEqual([
      "worker-hint",
      "resume-continuation",
      "skill-listing",
      "task-marker",
      "memory-fence",
      "card-body",
    ]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(PROMPT_MANIFEST.length).toBeLessThanOrEqual(8);
  });

  test("parts only on memory-fence (R6) · FENCE_PART_IDS = its part ids in order (C2)", () => {
    for (const e of PROMPT_MANIFEST) {
      if (e.id === "memory-fence") expect(e.parts).toBeDefined();
      else expect("parts" in e).toBe(false);
    }
    const fence = PROMPT_MANIFEST.find((e) => e.id === "memory-fence");
    expect(fence?.parts?.map((p) => p.id)).toEqual([...FENCE_PART_IDS]);
    expect([...FENCE_PART_IDS]).toEqual(["policy-notice", "standing-rules", "memory-snapshot"]);
  });

  test("every version is x.y.z", () => {
    for (const e of PROMPT_MANIFEST) {
      expect(e.version).toMatch(/^\d+\.\d+\.\d+$/);
      for (const p of e.parts ?? []) expect(p.version).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  test("deep freeze: array, entries, parts arrays, part entries, FENCE_PART_IDS", () => {
    expect(Object.isFrozen(PROMPT_MANIFEST)).toBe(true);
    expect(Object.isFrozen(FENCE_PART_IDS)).toBe(true);
    for (const e of PROMPT_MANIFEST) {
      expect(Object.isFrozen(e)).toBe(true);
      if (e.parts) {
        expect(Object.isFrozen(e.parts)).toBe(true);
        for (const p of e.parts) expect(Object.isFrozen(p)).toBe(true);
      }
    }
    expect(() => {
      (PROMPT_MANIFEST as unknown as unknown[]).push({});
    }).toThrow();
    expect(() => {
      (PROMPT_MANIFEST[0] as unknown as { version: string }).version = "9.9.9";
    }).toThrow();
    expect(PROMPT_MANIFEST[0]?.version).toBe("0.39.0");
  });
});
