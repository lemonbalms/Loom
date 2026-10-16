/**
 * PLAN 0.35.0 P3 — `inventorySkills(loomDir, policy)` (D7 · R15 · ② `loom skills list`).
 * Done-when (f, skills half): builtin only · user skill added · user skill with a builtin name →
 * user source + shadowsBuiltin · a BROKEN user entry still shadows (resolveSkill rule) with its
 * unavailable reason · invalid names ignored · policy null (invalid policy) → availability unknown ·
 * policy allow / allowScripts honoured · read-only (zero writes).
 * The existing skill-materialize tests are untouched (separate file — materialize unchanged).
 * Every loomDir is a fresh mkdtemp passed explicitly; run with HOME and LOOM_TEST_HOME both
 * pointing at a temp dir (R16).
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { inventorySkills, type SkillInventory } from "./skill-materialize";

type Policy = { allow: string[] | null; allowScripts: string[] };
const OPEN: Policy = { allow: null, allowScripts: [] };
const BUILTIN_DESC =
  "Format the final report of a Loom card task. Use it when you write your last message.";

let L: string;

beforeEach(() => {
  L = mkdtempSync(join(tmpdir(), "loom-skinv-p3-"));
});

afterEach(() => {
  rmSync(L, { recursive: true, force: true });
});

function md(name: string, description: string, extra = ""): string {
  return `---\nname: ${name}\ndescription: ${description}\n${extra}---\n\n# ${name}\n\nBody.\n`;
}

function userSkill(name: string, files: Record<string, string>): string {
  const dir = join(L, "skills", name);
  for (const [rel, text] of Object.entries(files)) {
    const p = join(dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text);
  }
  mkdirSync(dir, { recursive: true });
  return dir;
}

function tree(root: string): string[] {
  const out: string[] = [];
  const go = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      const st = lstatSync(p);
      out.push(`${relative(root, p)}|${st.mode}|${st.size}|${st.mtimeMs}`);
      if (st.isDirectory() && !st.isSymbolicLink()) go(p);
    }
  };
  go(root);
  return out;
}

const byName = (inv: SkillInventory, name: string) => inv.skills.find((s) => s.name === name);

describe("inventorySkills — sources and shadowing (R15)", () => {
  test("builtin only (no user skills dir)", async () => {
    const inv = await inventorySkills(L, OPEN);
    expect(inv).toEqual({
      skills: [
        {
          name: "loom-card-report",
          source: "builtin",
          shadowsBuiltin: false,
          status: "available",
          reason: null,
          description: BUILTIN_DESC,
        },
      ],
      ignored: [],
      userRoot: "absent",
    });
  });

  test("absent loomDir → builtin only, nothing created", async () => {
    const missing = join(L, "absent");
    const inv = await inventorySkills(missing, OPEN);
    expect(inv.skills.map((s) => s.name)).toEqual(["loom-card-report"]);
    expect(readdirSync(L)).toEqual([]);
  });

  test("user skill added alongside builtin, sorted by name", async () => {
    userSkill("a-helper", { "SKILL.md": md("a-helper", "Helps.") });
    userSkill("zz-tool", { "SKILL.md": md("zz-tool", "Tool.") });
    const inv = await inventorySkills(L, OPEN);
    expect(inv.userRoot).toBe("dir");
    expect(inv.skills.map((s) => [s.name, s.source, s.shadowsBuiltin, s.status])).toEqual([
      ["a-helper", "user", false, "available"],
      ["loom-card-report", "builtin", false, "available"],
      ["zz-tool", "user", false, "available"],
    ]);
    expect(byName(inv, "a-helper")!.description).toBe("Helps.");
  });

  test("user skill with the builtin's name → user source, shadows builtin", async () => {
    userSkill("loom-card-report", { "SKILL.md": md("loom-card-report", "My report format.") });
    const inv = await inventorySkills(L, OPEN);
    expect(inv.skills).toEqual([
      {
        name: "loom-card-report",
        source: "user",
        shadowsBuiltin: true,
        status: "available",
        reason: null,
        description: "My report format.",
      },
    ]);
  });

  test("BROKEN user entry with the builtin's name still shadows (no SKILL.md)", async () => {
    userSkill("loom-card-report", { "notes.txt": "nothing here" });
    const inv = await inventorySkills(L, OPEN);
    expect(inv.skills).toEqual([
      {
        name: "loom-card-report",
        source: "user",
        shadowsBuiltin: true,
        status: "unavailable",
        reason: "invalid SKILL.md",
        description: null,
      },
    ]);
  });

  test("user entry that is a plain file shadows → unsafe source", async () => {
    mkdirSync(join(L, "skills"), { recursive: true });
    writeFileSync(join(L, "skills", "loom-card-report"), "not a dir");
    const s = byName(await inventorySkills(L, OPEN), "loom-card-report")!;
    expect([s.source, s.shadowsBuiltin, s.status, s.reason]).toEqual([
      "user",
      true,
      "unavailable",
      "unsafe source",
    ]);
  });

  test("user entry that is a symlink shadows → unsafe source", async () => {
    const real = userSkill("real-one", { "SKILL.md": md("loom-card-report", "x") });
    symlinkSync(real, join(L, "skills", "loom-card-report"));
    const s = byName(await inventorySkills(L, OPEN), "loom-card-report")!;
    expect([s.source, s.shadowsBuiltin, s.reason]).toEqual(["user", true, "unsafe source"]);
  });

  test("user skills root is a symlink → every builtin name shadowed as unsafe source", async () => {
    mkdirSync(join(L, "elsewhere"), { recursive: true });
    symlinkSync(join(L, "elsewhere"), join(L, "skills"));
    const inv = await inventorySkills(L, OPEN);
    expect(inv.userRoot).toBe("unsafe");
    expect(inv.skills).toEqual([
      {
        name: "loom-card-report",
        source: "user",
        shadowsBuiltin: true,
        status: "unavailable",
        reason: "unsafe source",
        description: null,
      },
    ]);
  });

  test("invalid names ignored (sorted)", async () => {
    userSkill("Bad_Name", { "SKILL.md": md("Bad_Name", "x") });
    userSkill("has space", { "SKILL.md": md("has space", "x") });
    mkdirSync(join(L, "skills"), { recursive: true });
    writeFileSync(join(L, "skills", ".DS_Store"), "");
    const inv = await inventorySkills(L, OPEN);
    expect(inv.ignored).toEqual([".DS_Store", "Bad_Name", "has space"]);
    expect(inv.skills.map((s) => s.name)).toEqual(["loom-card-report"]);
  });

  test("name mismatch in SKILL.md → invalid SKILL.md", async () => {
    userSkill("mismatch", { "SKILL.md": md("other-name", "x") });
    const s = byName(await inventorySkills(L, OPEN), "mismatch")!;
    expect([s.status, s.reason]).toEqual(["unavailable", "invalid SKILL.md"]);
  });
});

describe("inventorySkills — policy", () => {
  test("policy null (invalid policy.json) → availability unknown, source still listed", async () => {
    userSkill("loom-card-report", { "SKILL.md": md("loom-card-report", "Mine.") });
    userSkill("extra", { "SKILL.md": md("extra", "Extra.") });
    const inv = await inventorySkills(L, null);
    expect(inv.skills.map((s) => [s.name, s.source, s.shadowsBuiltin, s.status, s.reason])).toEqual(
      [
        ["extra", "user", false, "unknown", null],
        ["loom-card-report", "user", true, "unknown", null],
      ],
    );
  });

  test("allow [] → not allowed by policy (source still reported)", async () => {
    userSkill("extra", { "SKILL.md": md("extra", "Extra.") });
    const inv = await inventorySkills(L, { allow: [], allowScripts: [] });
    expect(inv.skills.map((s) => [s.name, s.source, s.status, s.reason])).toEqual([
      ["extra", "user", "unavailable", "not allowed by policy"],
      ["loom-card-report", "builtin", "unavailable", "not allowed by policy"],
    ]);
  });

  test("allow list names one → only that one available", async () => {
    userSkill("extra", { "SKILL.md": md("extra", "Extra.") });
    const inv = await inventorySkills(L, { allow: ["extra"], allowScripts: [] });
    expect(byName(inv, "extra")!.status).toBe("available");
    expect(byName(inv, "loom-card-report")!.reason).toBe("not allowed by policy");
  });

  test("skill with scripts → requires policy unless allowScripts names it", async () => {
    userSkill("scripted", {
      "SKILL.md": md("scripted", "Runs things."),
      "scripts/run.sh": "#!/bin/sh\necho hi\n",
    });
    const denied = byName(await inventorySkills(L, OPEN), "scripted")!;
    expect([denied.status, denied.reason]).toEqual(["unavailable", "requires policy"]);
    const allowed = byName(
      await inventorySkills(L, { allow: null, allowScripts: ["scripted"] }),
      "scripted",
    )!;
    expect([allowed.status, allowed.reason, allowed.description]).toEqual([
      "available",
      null,
      "Runs things.",
    ]);
  });
});

describe("inventorySkills — read-only", () => {
  test("tree identical before / after (no card dir, no copies)", async () => {
    userSkill("loom-card-report", { "SKILL.md": md("loom-card-report", "Mine.") });
    userSkill("broken", { "x.txt": "x" });
    const before = tree(L);
    await inventorySkills(L, OPEN);
    await inventorySkills(L, null);
    expect(tree(L)).toEqual(before);
  });
});
