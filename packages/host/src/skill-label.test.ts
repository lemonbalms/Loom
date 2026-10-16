/**
 * PLAN 0.37.0 P4b (D8 · R19) — skill source label. A user skill that shadows a bundled
 * (builtin) skill of the same name carries `shadowsBuiltin: true` on its `AvailableSkill`
 * (key absent otherwise), and the codex/grok Available line ends with
 * `SKILL_SHADOW_SUFFIX = " (user, shadows bundled)"`. claude's listing (no Available lines) is
 * unchanged; the suffix counts toward the 4,096-byte cap; the manifest and `manifestHash`
 * (fingerprint input) are unchanged.
 *
 * `SKILL_SHADOW_SUFFIX` is looked up at call time so each case fails on its own in red.
 * Every case uses an explicit temp loomDir (R21).
 */
import { afterAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { AgentKind } from "./agent-argv";
import { roomKey } from "./room-event-log";
import {
  type AvailableSkill,
  BUILTIN_SKILLS,
  materializeCardSkills,
  skillsManifestHash,
  verifyCardSkillsCopy,
} from "./skill-materialize";
import * as skillPrompt from "./skill-prompt";
import { renderSkillListing, SKILL_LISTING_HEADER, SKILL_LISTING_MAX_BYTES } from "./skill-prompt";

const SUFFIX_VERBATIM = " (user, shadows bundled)";
const suffix = (): string => {
  const v = (skillPrompt as unknown as Record<string, unknown>).SKILL_SHADOW_SUFFIX;
  if (typeof v !== "string") throw new Error("./skill-prompt does not export SKILL_SHADOW_SUFFIX");
  return v;
};

const roots: string[] = [];
afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const md = (name: string, description: string) =>
  `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\nBody.\n`;

function setup(agent: AgentKind = "codex") {
  const root = mkdtempSync(join(tmpdir(), "loom-p4b-label-"));
  roots.push(root);
  const loomDir = join(root, ".loom");
  mkdirSync(loomDir, { recursive: true });
  const key = { loomDir, localPeerId: "peer-local", roomId: "room-1", agent, cardId: "card-1" };
  return { loomDir, key };
}
function userSkill(loomDir: string, name: string, description: string): string {
  const text = md(name, description);
  const dir = join(loomDir, "skills", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), text);
  return text;
}
function select(loomDir: string, names: string[]): void {
  const path = join(loomDir, "rooms", roomKey("room-1"), "skills.json");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ version: 1, skills: names }));
}
const OPEN = { allow: null, allowScripts: [] };
const run = (key: ReturnType<typeof setup>["key"]) =>
  materializeCardSkills({ ...key, enabled: true, policy: OPEN });

const BUILTIN = "loom-card-report";

describe("materializeCardSkills — shadowsBuiltin on AvailableSkill (D8 · R19)", () => {
  test("bundled name exists", () => {
    expect(BUILTIN_SKILLS.map((s) => s.name)).toContain(BUILTIN);
  });

  test("user loom-card-report shadows the bundled one → available[0].shadowsBuiltin === true", async () => {
    const { loomDir, key } = setup();
    userSkill(loomDir, BUILTIN, "Owner override.");
    select(loomDir, [BUILTIN]);
    const res = await run(key);
    expect(res.available).toHaveLength(1);
    expect(res.available[0]!.source).toBe("user");
    expect((res.available[0] as AvailableSkill & { shadowsBuiltin?: unknown }).shadowsBuiltin).toBe(
      true,
    );
  });

  test("bundled alone → no shadowsBuiltin key", async () => {
    const { loomDir, key } = setup();
    select(loomDir, [BUILTIN]);
    const res = await run(key);
    expect(res.available).toHaveLength(1);
    expect(res.available[0]!.source).toBe("builtin");
    expect("shadowsBuiltin" in res.available[0]!).toBe(false);
  });

  test("user skill with its own name → no shadowsBuiltin key", async () => {
    const { loomDir, key } = setup();
    userSkill(loomDir, "alpha", "Alpha.");
    select(loomDir, ["alpha", BUILTIN]);
    const res = await run(key);
    expect(res.available.map((s) => [s.name, s.source])).toEqual([
      ["alpha", "user"],
      [BUILTIN, "builtin"],
    ]);
    for (const s of res.available) expect("shadowsBuiltin" in s).toBe(false);
  });

  test("manifest and manifestHash are unchanged by the label (fingerprint input)", async () => {
    const { loomDir, key } = setup();
    const text = userSkill(loomDir, BUILTIN, "Owner override.");
    select(loomDir, [BUILTIN]);
    const res = await run(key);
    const expected = [
      { name: BUILTIN, source: "user" as const, files: { "SKILL.md": sha256(text) }, scripts: [] },
    ];
    expect(res.manifest).toEqual(expected);
    for (const e of res.manifest!) expect("shadowsBuiltin" in e).toBe(false);
    expect(res.manifestHash).toBe(skillsManifestHash(expected));
    const verified = await verifyCardSkillsCopy(key);
    expect(verified.ok).toBe(true);
    if (verified.ok) expect(verified.manifestHash).toBe(res.manifestHash);
  });
});

describe("renderSkillListing — suffix on shadowing codex/grok Available lines only (D8)", () => {
  test("SKILL_SHADOW_SUFFIX verbatim", () => {
    expect(suffix()).toBe(SUFFIX_VERBATIM);
  });

  for (const agent of ["codex", "grok"] as const) {
    test(`${agent}: the shadowing line ends with the suffix; the others do not`, async () => {
      const { loomDir, key } = setup(agent);
      userSkill(loomDir, BUILTIN, "Owner override.");
      userSkill(loomDir, "alpha", "Alpha.");
      select(loomDir, ["alpha", BUILTIN, "missing-one"]);
      const res = await run(key);
      const listing = renderSkillListing(agent, res);
      const [a, r] = res.available;
      expect(listing).toBe(
        [
          SKILL_LISTING_HEADER,
          `- alpha: Alpha. — ${a!.skillMdPath}`,
          `- ${BUILTIN}: Owner override. — ${r!.skillMdPath}${SUFFIX_VERBATIM}`,
          "- missing-one: unavailable: not installed",
        ].join("\n"),
      );
    });
  }

  test("bundled-only listing (codex) carries no suffix — 0.36 bytes", async () => {
    const { loomDir, key } = setup("codex");
    select(loomDir, [BUILTIN]);
    const res = await run(key);
    expect(renderSkillListing("codex", res)).not.toContain(SUFFIX_VERBATIM);
  });

  test("claude: listing unchanged (no Available lines) — identical with and without the flag", async () => {
    const { loomDir, key } = setup("claude");
    userSkill(loomDir, BUILTIN, "Owner override.");
    select(loomDir, [BUILTIN, "missing-one"]);
    const res = await run(key);
    const stripped = {
      available: res.available.map(({ name, source, description, skillMdPath }) => ({
        name,
        source,
        description,
        skillMdPath,
      })),
      unavailable: res.unavailable,
    };
    const listing = renderSkillListing("claude", res);
    expect(listing).toBe(renderSkillListing("claude", stripped));
    expect(listing).toBe("Unavailable skills:\n- missing-one: unavailable: not installed");
    expect(listing).not.toContain(SUFFIX_VERBATIM);
  });

  test("the suffix counts toward the 4,096-byte cap", () => {
    const description = "Owner override.";
    const name = BUILTIN;
    // One entry whose un-suffixed block is exactly SKILL_LISTING_MAX_BYTES.
    const fixed = `${SKILL_LISTING_HEADER}\n- ${name}: ${description} — /`;
    const tail = "/SKILL.md";
    const pad =
      SKILL_LISTING_MAX_BYTES - Buffer.byteLength(fixed, "utf8") - Buffer.byteLength(tail, "utf8");
    const skillMdPath = `/${"p".repeat(pad)}${tail}`;
    const plain: AvailableSkill = { name, source: "user", description, skillMdPath };
    const fits = renderSkillListing("codex", { available: [plain], unavailable: [] });
    expect(Buffer.byteLength(fits, "utf8")).toBe(SKILL_LISTING_MAX_BYTES);
    expect(fits.endsWith(skillMdPath)).toBe(true);

    const shadowing = { ...plain, shadowsBuiltin: true } as AvailableSkill;
    const capped = renderSkillListing("codex", { available: [shadowing], unavailable: [] });
    expect(capped).toBe(`${SKILL_LISTING_HEADER}\n- (+1 more): unavailable: cap`);

    // One suffix shorter: the suffixed line fits exactly.
    const shorter = {
      ...shadowing,
      skillMdPath: `/${"p".repeat(pad - SUFFIX_VERBATIM.length)}${tail}`,
    } as AvailableSkill;
    const exact = renderSkillListing("codex", { available: [shorter], unavailable: [] });
    expect(Buffer.byteLength(exact, "utf8")).toBe(SKILL_LISTING_MAX_BYTES);
    expect(exact.endsWith(`${tail}${SUFFIX_VERBATIM}`)).toBe(true);
  });
});
