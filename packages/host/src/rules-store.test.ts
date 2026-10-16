/**
 * PLAN 0.35.0 P3 — rules store (D3 · D5 · R12 · ② 규칙 파일 / 규칙 병합).
 * Done-when (f, rules half): front-matter invalid table (skipped + listed, never thrown) · user file
 * overrides a bundled id wholesale · empty user body disables the id · same-source id conflict →
 * smaller file name kept + conflict · body > 8192 B → tail cut on a code-point boundary + flag ·
 * sort priority desc → id asc · exactly one bundled rule (`report-blockers`, text-imported).
 * Read-only: no dirs or files created. Every loomDir is a fresh mkdtemp passed explicitly; run
 * with HOME and LOOM_TEST_HOME both pointing at a temp dir (R16).
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import {
  BUNDLED_RULES,
  loadRules,
  RULE_MAX_BYTES,
  RULES_USER_SCAN_MAX,
  type RulesView,
} from "./rules-store";

let L: string;

beforeEach(() => {
  L = mkdtempSync(join(tmpdir(), "loom-rules-p3-"));
});

afterEach(() => {
  rmSync(L, { recursive: true, force: true });
});

const rulesDir = () => join(L, "rules");

function fm(id: string, scope: string, priority: string | number, body: string): string {
  return `---\nid: ${id}\nscope: ${scope}\npriority: ${priority}\n---\n${body}`;
}

function writeRule(file: string, text: string | Buffer): string {
  mkdirSync(rulesDir(), { recursive: true });
  const p = join(rulesDir(), file);
  writeFileSync(p, text);
  return p;
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

const ids = (v: RulesView) => v.rules.map((r) => r.id);
const active = (v: RulesView) => v.rules.filter((r) => r.status !== "disabled");

describe("constants · bundled rule (R12 · text import)", () => {
  test("caps", () => {
    expect(RULE_MAX_BYTES).toBe(8192);
    expect(RULES_USER_SCAN_MAX).toBe(256);
  });

  test("exactly one bundled rule, byte-identical to packages/host/rules/report-blockers.md", () => {
    expect(BUNDLED_RULES.length).toBe(1);
    expect(BUNDLED_RULES[0]!.file).toBe("report-blockers.md");
    const onDisk = readFileSync(join(import.meta.dir, "..", "rules", "report-blockers.md"), "utf8");
    expect(BUNDLED_RULES[0]!.text).toBe(onDisk);
  });

  test("no user dir → the bundled rule only", () => {
    const v = loadRules(L);
    expect(v.rules.length).toBe(1);
    const r = v.rules[0]!;
    expect(r.id).toBe("report-blockers");
    expect(r.status).toBe("bundled");
    expect(r.source).toBe("bundled");
    expect(r.scope).toBe("all");
    expect(r.priority).toBe(500);
    expect(r.path).toBe("bundled:report-blockers.md");
    expect(r.file).toBe("report-blockers.md");
    expect(r.truncated).toBe(false);
    expect(r.bytes).toBe(Buffer.byteLength(r.body, "utf8"));
    expect(r.bytes).toBeLessThanOrEqual(RULE_MAX_BYTES);
    expect(r.body.toLowerCase()).toContain("blocked");
    expect(r.body.toLowerCase()).toContain("evidence");
    expect(v.counts).toEqual({ bundled: 1, user: 0, overrides: 0, disabled: 0, invalid: 0 });
    expect(v.invalid).toEqual([]);
    expect(v.conflicts).toEqual([]);
    expect(v.userDir).toBe(join(L, "rules"));
    expect(v.userDirState).toBe("absent");
    expect(v.scanCapped).toBe(false);
  });

  test("absent loomDir → bundled only, nothing created", () => {
    const missing = join(L, "absent");
    const v = loadRules(missing);
    expect(ids(v)).toEqual(["report-blockers"]);
    expect(readdirSync(L)).toEqual([]);
  });
});

describe("front-matter (② 규칙 파일)", () => {
  test("valid user rule", () => {
    const p = writeRule("style.md", fm("style", "claude", 10, "Prefer short answers.\n"));
    const v = loadRules(L);
    const r = v.rules.find((x) => x.id === "style")!;
    expect(r).toBeDefined();
    expect(r.status).toBe("user");
    expect(r.source).toBe("user");
    expect(r.scope).toBe("claude");
    expect(r.priority).toBe(10);
    expect(r.body).toBe("Prefer short answers.\n");
    expect(r.path).toBe(p);
    expect(r.file).toBe("style.md");
    expect(v.userDirState).toBe("dir");
    expect(v.counts).toEqual({ bundled: 1, user: 1, overrides: 0, disabled: 0, invalid: 0 });
  });

  test("every scope value and priority bounds accepted", () => {
    writeRule("a.md", fm("a", "all", 0, "x"));
    writeRule("b.md", fm("b", "claude", 1000, "x"));
    writeRule("c.md", fm("c", "codex", 7, "x"));
    writeRule("d.md", fm("d", "grok", 999, "x"));
    const v = loadRules(L);
    expect(v.invalid).toEqual([]);
    expect(v.counts.user).toBe(4);
  });

  test("CRLF front-matter accepted", () => {
    writeRule("crlf.md", "---\r\nid: crlf\r\nscope: all\r\npriority: 1\r\n---\r\nbody\r\n");
    const v = loadRules(L);
    expect(v.invalid).toEqual([]);
    expect(ids(v)).toContain("crlf");
  });

  const INVALID: Array<[string, string | Buffer, RegExp]> = [
    ["no-header.md", "just text\n", /front-matter/],
    ["late-header.md", "\n---\nid: x\nscope: all\npriority: 1\n---\nb", /front-matter/],
    ["unterminated.md", "---\nid: u\nscope: all\npriority: 1\nbody\n", /front-matter/],
    ["no-id.md", "---\nscope: all\npriority: 1\n---\nb", /missing id/],
    ["no-scope.md", "---\nid: s\npriority: 1\n---\nb", /missing scope/],
    ["no-priority.md", "---\nid: p\nscope: all\n---\nb", /missing priority/],
    ["bad-id.md", fm("Bad_ID", "all", 1, "b"), /\bid\b/],
    ["bad-id2.md", fm("-lead", "all", 1, "b"), /\bid\b/],
    ["bad-id3.md", fm("a".repeat(65), "all", 1, "b"), /\bid\b/],
    ["bad-scope.md", fm("x1", "everyone", 1, "b"), /scope/],
    ["bad-scope2.md", fm("x2", "Claude", 1, "b"), /scope/],
    ["prio-big.md", fm("x3", "all", 1001, "b"), /priority/],
    ["prio-neg.md", fm("x4", "all", -1, "b"), /priority/],
    ["prio-frac.md", fm("x5", "all", "1.5", "b"), /priority/],
    ["prio-word.md", fm("x6", "all", "high", "b"), /priority/],
    ["prio-empty.md", fm("x7", "all", "", "b"), /priority/],
    ["unknown-key.md", "---\nid: k\nscope: all\npriority: 1\nowner: me\n---\nb", /unknown key/],
    ["dup-key.md", "---\nid: d\nid: e\nscope: all\npriority: 1\n---\nb", /duplicate/],
    ["malformed.md", "---\nid k\nscope: all\npriority: 1\n---\nb", /front-matter/],
    [
      "not-utf8.md",
      Buffer.concat([Buffer.from(fm("nu", "all", 1, "")), Buffer.from([0xff, 0xfe, 0x0a])]),
      /UTF-8/,
    ],
  ];

  test("invalid table: each skipped and listed, never thrown", () => {
    for (const [file, text] of INVALID) writeRule(file, text);
    let v!: RulesView;
    expect(() => {
      v = loadRules(L);
    }).not.toThrow();
    expect(ids(v)).toEqual(["report-blockers"]);
    expect(v.counts.invalid).toBe(INVALID.length);
    expect(v.counts.user).toBe(0);
    for (const [file, , re] of INVALID) {
      const inv = v.invalid.find((i) => i.file === file);
      expect(inv).toBeDefined();
      expect(inv!.source).toBe("user");
      expect(inv!.path).toBe(join(rulesDir(), file));
      expect(inv!.reason).toMatch(re);
    }
  });

  test("symlinked rule file → invalid (symlink)", () => {
    const target = join(L, "outside.md");
    writeFileSync(target, fm("linked", "all", 1, "b"));
    mkdirSync(rulesDir(), { recursive: true });
    symlinkSync(target, join(rulesDir(), "linked.md"));
    const v = loadRules(L);
    expect(ids(v)).toEqual(["report-blockers"]);
    expect(v.invalid.map((i) => [i.file, i.reason])).toEqual([
      ["linked.md", expect.stringMatching(/symlink/)],
    ]);
  });

  test("directory named *.md → invalid (not a regular file)", () => {
    mkdirSync(join(rulesDir(), "dir.md"), { recursive: true });
    const v = loadRules(L);
    expect(v.invalid.map((i) => i.file)).toEqual(["dir.md"]);
    expect(v.invalid[0]!.reason).toMatch(/regular/);
  });

  test("bad *.md file names → invalid; non-.md entries ignored silently", () => {
    writeRule("bad name.md", fm("bn", "all", 1, "b"));
    writeRule(".hidden.md", fm("hid", "all", 1, "b"));
    writeRule(`${"n".repeat(65)}.md`, fm("long", "all", 1, "b"));
    writeRule("notes.txt", "whatever");
    writeRule("README", "whatever");
    const v = loadRules(L);
    expect(ids(v)).toEqual(["report-blockers"]);
    expect(v.invalid.map((i) => i.file).sort()).toEqual(
      [".hidden.md", "bad name.md", `${"n".repeat(65)}.md`].sort(),
    );
    for (const i of v.invalid) expect(i.reason).toMatch(/file name/);
  });

  test("symlinked rules dir → unsafe, bundled only, listed invalid", () => {
    mkdirSync(join(L, "realrules"), { recursive: true });
    writeFileSync(join(L, "realrules", "x.md"), fm("x", "all", 1, "b"));
    symlinkSync(join(L, "realrules"), rulesDir());
    const v = loadRules(L);
    expect(v.userDirState).toBe("unsafe");
    expect(ids(v)).toEqual(["report-blockers"]);
    expect(v.counts.invalid).toBe(1);
    expect(v.invalid[0]!.reason).toMatch(/symlink|not a directory/);
  });
});

describe("merge (② 규칙 병합 · R12)", () => {
  test("user file overrides a bundled id wholesale", () => {
    const p = writeRule("mine.md", fm("report-blockers", "codex", 7, "My own wording.\n"));
    const v = loadRules(L);
    expect(ids(v)).toEqual(["report-blockers"]);
    const r = v.rules[0]!;
    expect(r.status).toBe("override");
    expect(r.source).toBe("user");
    expect(r.scope).toBe("codex");
    expect(r.priority).toBe(7);
    expect(r.body).toBe("My own wording.\n");
    expect(r.path).toBe(p);
    expect(v.counts).toEqual({ bundled: 1, user: 1, overrides: 1, disabled: 0, invalid: 0 });
  });

  test("empty user body disables the id", () => {
    writeRule("off.md", fm("report-blockers", "all", 1, ""));
    const v = loadRules(L);
    expect(v.rules.map((r) => [r.id, r.status])).toEqual([["report-blockers", "disabled"]]);
    expect(active(v)).toEqual([]);
    expect(v.counts).toEqual({ bundled: 1, user: 1, overrides: 0, disabled: 1, invalid: 0 });
  });

  test("whitespace-only user body also disables (deviation)", () => {
    writeRule("off.md", fm("report-blockers", "all", 1, "\n  \n"));
    expect(loadRules(L).rules[0]!.status).toBe("disabled");
  });

  test("closing delimiter without trailing newline → empty body → disabled", () => {
    writeRule("off.md", "---\nid: report-blockers\nscope: all\npriority: 1\n---");
    const v = loadRules(L);
    expect(v.invalid).toEqual([]);
    expect(v.rules[0]!.status).toBe("disabled");
  });

  test("same-source id conflict → smaller file name kept + conflict", () => {
    writeRule("b.md", fm("dup", "all", 1, "from b\n"));
    writeRule("a.md", fm("dup", "all", 2, "from a\n"));
    writeRule("c.md", fm("dup", "all", 3, "from c\n"));
    const v = loadRules(L);
    const r = v.rules.find((x) => x.id === "dup")!;
    expect(r.file).toBe("a.md");
    expect(r.body).toBe("from a\n");
    expect(v.rules.filter((x) => x.id === "dup").length).toBe(1);
    expect(v.conflicts).toEqual([
      { source: "user", id: "dup", kept: "a.md", dropped: ["b.md", "c.md"] },
    ]);
    expect(v.counts.user).toBe(1);
  });

  test("sort: priority desc, then id asc (disabled included in place)", () => {
    writeRule("1.md", fm("zeta", "all", 900, "z"));
    writeRule("2.md", fm("beta", "all", 10, "b"));
    writeRule("3.md", fm("alpha", "all", 10, "a"));
    writeRule("4.md", fm("gamma", "all", 600, ""));
    writeRule("5.md", fm("omega", "all", 1000, "o"));
    const v = loadRules(L);
    expect(v.rules.map((r) => [r.id, r.priority])).toEqual([
      ["omega", 1000],
      ["zeta", 900],
      ["gamma", 600],
      ["report-blockers", 500],
      ["alpha", 10],
      ["beta", 10],
    ]);
  });

  test("body > 8192 B → cut to 8192 + truncated; bytes = original", () => {
    writeRule("big.md", fm("big", "all", 1, "r".repeat(8193)));
    const r = loadRules(L).rules.find((x) => x.id === "big")!;
    expect(r.truncated).toBe(true);
    expect(r.bytes).toBe(8193);
    expect(r.body).toBe("r".repeat(8192));
  });

  test("body exactly 8192 B → not truncated", () => {
    writeRule("fit.md", fm("fit", "all", 1, "r".repeat(8192)));
    const r = loadRules(L).rules.find((x) => x.id === "fit")!;
    expect(r.truncated).toBe(false);
    expect(r.body.length).toBe(8192);
  });

  test("truncation never splits a multibyte character", () => {
    writeRule("mb.md", fm("mb", "all", 1, "가".repeat(2731)));
    const r = loadRules(L).rules.find((x) => x.id === "mb")!;
    expect(r.truncated).toBe(true);
    expect(r.body).toBe("가".repeat(2730));
    expect(r.body).not.toContain("�");
  });

  test(`user scan capped at ${256} files (sorted names) → scanCapped`, () => {
    for (let i = 0; i < 260; i++) {
      const n = i.toString().padStart(3, "0");
      writeRule(`r${n}.md`, fm(`r${n}`, "all", 1, "b"));
    }
    const v = loadRules(L);
    expect(v.scanCapped).toBe(true);
    expect(v.counts.user).toBe(256);
    expect(ids(v)).toContain("r255");
    expect(ids(v)).not.toContain("r256");
  });
});

describe("read-only · arguments", () => {
  test("tree identical before / after", () => {
    writeRule("a.md", fm("a", "all", 1, "x"));
    writeRule("bad.md", "nope");
    const before = tree(L);
    loadRules(L);
    expect(tree(L)).toEqual(before);
  });

  test("relative loomDir → TypeError", () => {
    expect(() => loadRules("relative")).toThrow(TypeError);
  });
});
