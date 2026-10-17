/**
 * PLAN 0.38.0 P2 — forced builtin skill `loom-memory-candidates` (D4 · R5 · R6 · R56-L2).
 * `MaterializeOptions.forced` is merged with the room selection (deduped), then the existing
 * pipeline runs unchanged (user shadowing · policy · manifest). The builtin is accepted only via
 * `forced`: selected by the room alone it is `not installed` (0.37 bytes for an unknown name),
 * while a user skill of that name still materializes from the room selection. `forced` omitted →
 * 0.37 behaviour and manifestHash. Every loomDir is a fresh mkdtemp passed explicitly; run with
 * HOME and LOOM_TEST_HOME both pointing at a temp dir (R22).
 */
import { afterAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { roomKey } from "./room-event-log";
import {
  BUILTIN_SKILLS,
  materializeCardSkills,
  SKILL_DESCRIPTION_MAX,
  sanitizeSkillDescription,
  skillsManifestHash,
} from "./skill-materialize";

const NAME = "loom-memory-candidates";
const DESCRIPTION =
  "Propose memory candidates from a Loom card for the operator to review. Use it when you write your last message.";
const SKILL_MD = `---
name: loom-memory-candidates
description: Propose memory candidates from a Loom card for the operator to review. Use it when you write your last message.
---

# Loom memory candidates

A memory candidate is one sentence that later cards in this room should know: a fact about the project, a decision that was made, or a preference the operator stated. A person reviews every candidate. No card sees a candidate until a person approves it.

When you write your last message, you may add this block:

LOOM-MEMORY-CANDIDATES
- fact: <one sentence>
- decision: <one sentence>
- preference: <one sentence>
LOOM-MEMORY-END

1. Start each line with \`- fact:\`, \`- decision:\`, or \`- preference:\`, then one sentence.
2. Write at most 5 lines.
3. Never put secrets, tokens, passwords, or text that starts with \`LOOM-\` inside a line.
4. If you end your message with \`LOOM-REPORT-END\`, put the block before that line.
5. If there is nothing worth keeping, do not write the block.
`;

const roots: string[] = [];
afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

type Policy = { allow: string[] | null; allowScripts: string[] };
const OPEN: Policy = { allow: null, allowScripts: [] };

function setup() {
  const root = mkdtempSync(join(tmpdir(), "loom-skills-forced-"));
  roots.push(root);
  const loomDir = join(root, ".loom");
  mkdirSync(loomDir, { recursive: true });
  const key = {
    loomDir,
    localPeerId: "peer-local",
    roomId: "room-1",
    agent: "claude",
    cardId: "card-1",
  };
  return { loomDir, key };
}

function select(loomDir: string, roomId: string, names: string[]): void {
  const path = join(loomDir, "rooms", roomKey(roomId), "skills.json");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ version: 1, skills: names }));
}

function userSkill(loomDir: string, name: string, description: string): void {
  const dir = join(loomDir, "skills", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\nBody.\n`,
  );
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const builtinText = (name: string) => BUILTIN_SKILLS.find((s) => s.name === name)!.files["SKILL.md"]!;

describe("builtin loom-memory-candidates SKILL.md (R6)", () => {
  test("embedded verbatim from packages/host/skills, one file, second builtin", () => {
    expect(BUILTIN_SKILLS.map((s) => s.name)).toEqual(["loom-card-report", NAME]);
    const skill = BUILTIN_SKILLS.find((s) => s.name === NAME)!;
    expect(Object.keys(skill.files)).toEqual(["SKILL.md"]);
    const onDisk = readFileSync(join(import.meta.dir, "..", "skills", NAME, "SKILL.md"), "utf8");
    expect(onDisk).toBe(SKILL_MD);
    expect(skill.files["SKILL.md"]).toBe(SKILL_MD);
    expect(SKILL_MD).toContain(
      "4. If you end your message with `LOOM-REPORT-END`, put the block before that line.\n",
    );
  });

  test("description sanitizes to itself and is ≤ SKILL_DESCRIPTION_MAX code points", () => {
    expect(sanitizeSkillDescription(DESCRIPTION)).toBe(DESCRIPTION);
    expect([...DESCRIPTION].length).toBeLessThanOrEqual(SKILL_DESCRIPTION_MAX);
  });
});

describe("materializeCardSkills forced (R5 · R56-L2)", () => {
  test("forced without a room selection → builtin copy in the card", async () => {
    const { key } = setup();
    const res = await materializeCardSkills({ ...key, enabled: true, policy: OPEN, forced: [NAME] });
    expect(res.available).toEqual([
      {
        name: NAME,
        source: "builtin",
        description: DESCRIPTION,
        skillMdPath: join(res.pluginDir!, "skills", NAME, "SKILL.md"),
      },
    ]);
    expect(res.unavailable).toEqual([]);
    expect(res.manifest).toEqual([
      { name: NAME, source: "builtin", files: { "SKILL.md": sha256(SKILL_MD) }, scripts: [] },
    ]);
    expect(readFileSync(res.available[0]!.skillMdPath, "utf8")).toBe(SKILL_MD);
  });

  test("room also selects it → one entry (deduped), alongside the room's other picks", async () => {
    const { loomDir, key } = setup();
    select(loomDir, key.roomId, [NAME, "loom-card-report"]);
    const res = await materializeCardSkills({ ...key, enabled: true, policy: OPEN, forced: [NAME] });
    expect(res.manifest!.map((m) => m.name)).toEqual(["loom-card-report", NAME]);
    expect(res.available.map((a) => a.name)).toEqual(["loom-card-report", NAME]);
    expect(res.unavailable).toEqual([]);
  });

  test("forced listing the name twice → one entry", async () => {
    const { key } = setup();
    const res = await materializeCardSkills({
      ...key,
      enabled: true,
      policy: OPEN,
      forced: [NAME, NAME],
    });
    expect(res.manifest!.map((m) => m.name)).toEqual([NAME]);
  });

  test("user skill of the same name shadows the forced builtin (shadowsBuiltin)", async () => {
    const { loomDir, key } = setup();
    userSkill(loomDir, NAME, "My candidate format.");
    const res = await materializeCardSkills({ ...key, enabled: true, policy: OPEN, forced: [NAME] });
    expect(res.available).toHaveLength(1);
    expect(res.available[0]).toMatchObject({
      name: NAME,
      source: "user",
      description: "My candidate format.",
      shadowsBuiltin: true,
    });
    expect(res.manifest![0]!.source).toBe("user");
  });

  test("policy skills.allow without the name → unavailable `not allowed by policy`, nothing copied", async () => {
    const { key } = setup();
    const res = await materializeCardSkills({
      ...key,
      enabled: true,
      policy: { allow: ["loom-card-report"], allowScripts: [] },
      forced: [NAME],
    });
    expect(res.available).toEqual([]);
    expect(res.unavailable).toEqual([{ name: NAME, reason: "not allowed by policy" }]);
    expect(res.manifest).toEqual([]);
    expect(existsSync(join(res.pluginDir!, "skills", NAME))).toBe(false);
  });

  test("forced omitted (or []) → 0.37 manifestHash, unchanged", async () => {
    const a = setup();
    select(a.loomDir, a.key.roomId, ["loom-card-report"]);
    const omitted = await materializeCardSkills({ ...a.key, enabled: true, policy: OPEN });
    const expected = skillsManifestHash([
      {
        name: "loom-card-report",
        source: "builtin",
        files: { "SKILL.md": sha256(builtinText("loom-card-report")) },
        scripts: [],
      },
    ]);
    expect(omitted.manifestHash).toBe(expected);
    const b = setup();
    select(b.loomDir, b.key.roomId, ["loom-card-report"]);
    const empty = await materializeCardSkills({ ...b.key, enabled: true, policy: OPEN, forced: [] });
    expect(empty.manifestHash).toBe(expected);
    const c = setup();
    const none = await materializeCardSkills({ ...c.key, enabled: true, policy: OPEN });
    expect(none.manifestHash).toBe(skillsManifestHash([]));
    expect(none.available).toEqual([]);
  });

  test("forced changes the manifestHash (opt-in users only)", async () => {
    const a = setup();
    select(a.loomDir, a.key.roomId, ["loom-card-report"]);
    const off = await materializeCardSkills({ ...a.key, enabled: true, policy: OPEN });
    const b = setup();
    select(b.loomDir, b.key.roomId, ["loom-card-report"]);
    const on = await materializeCardSkills({ ...b.key, enabled: true, policy: OPEN, forced: [NAME] });
    expect(on.manifestHash).not.toBe(off.manifestHash);
  });

  test("room skills.json alone selects the builtin (no forced) → `not installed`, nothing copied", async () => {
    for (const forced of [undefined, [] as string[]]) {
      const { loomDir, key } = setup();
      select(loomDir, key.roomId, [NAME, "loom-card-report", "nope"]);
      const res = await materializeCardSkills({
        ...key,
        enabled: true,
        policy: OPEN,
        ...(forced ? { forced } : {}),
      });
      expect(res.available.map((a) => a.name)).toEqual(["loom-card-report"]);
      expect(res.unavailable).toEqual([
        { name: NAME, reason: "not installed" },
        { name: "nope", reason: "not installed" },
      ]);
      expect(res.manifest!.map((m) => m.name)).toEqual(["loom-card-report"]);
      expect(existsSync(join(res.pluginDir!, "skills", NAME))).toBe(false);
    }
  });

  test("room alone selects the name and a user skill of that name exists → user copy materializes", async () => {
    const { loomDir, key } = setup();
    userSkill(loomDir, NAME, "Owner candidate format.");
    select(loomDir, key.roomId, [NAME]);
    const res = await materializeCardSkills({ ...key, enabled: true, policy: OPEN });
    expect(res.unavailable).toEqual([]);
    expect(res.available).toHaveLength(1);
    expect(res.available[0]).toMatchObject({
      name: NAME,
      source: "user",
      description: "Owner candidate format.",
      shadowsBuiltin: true,
    });
  });

  test("disabled → forced ignored, nothing read or written", async () => {
    const { key } = setup();
    const res = await materializeCardSkills({ ...key, enabled: false, policy: OPEN, forced: [NAME] });
    expect(res).toEqual({
      enabled: false,
      skillsDir: null,
      pluginDir: null,
      manifest: null,
      manifestHash: "",
      available: [],
      unavailable: [],
    });
  });
});
