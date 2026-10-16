/**
 * PLAN 0.35.0 P4 — `loom memory|rules|skills` CLI (D7 · ② CLI 공통 · R13 · R53-L2).
 * Done-when (g): every verb's exit code · stdout · stderr == ② (+ accepted deviations) · `--json`
 * fields · list header (profile source · paths · cap status) · show history · lock held →
 * `store busy` exit 1 · caps refuse add/propose only (approve · retire · compact exit 0) ·
 * rules/skills list always exit 0 · one spawn test of the real CLI entry under a temp home.
 *
 * In-process tests inject deps `{loomDir, profile, profileSource, displayName, env, randomId,
 * now, stdout, stderr, skillsEnabled}` with a fresh mkdtemp loomDir. Run this file with HOME and
 * LOOM_TEST_HOME both pointing at a temp dir (R16); the spawn children get their own temp home.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { BUNDLED_RULES, foldMemoryLines, loadRules, memoryPaths, roomKey } from "@loom/host";
import {
  type MemoryCliDeps,
  runMemoryCommand,
  runRulesCommand,
  runSkillsCommand,
} from "./memory-cli";

const ID = (n: number) => `mem_${n.toString(16).padStart(16, "0")}`;
const CLI = join(import.meta.dir, "index.ts");
const BUILTIN_DESC =
  "Format the final report of a Loom card task. Use it when you write your last message.";

let L: string;

beforeEach(() => {
  L = mkdtempSync(join(tmpdir(), "loom-memcli-p4-"));
});

afterEach(() => {
  rmSync(L, { recursive: true, force: true });
});

function counterIds(start = 0xa000): () => string {
  let n = start;
  return () => ID(++n);
}

type Run = { code: number; out: string[]; err: string[] };

function mkDeps(over: Partial<MemoryCliDeps> = {}): {
  deps: MemoryCliDeps;
  out: string[];
  err: string[];
} {
  const out: string[] = [];
  const err: string[] = [];
  const deps: MemoryCliDeps = {
    loomDir: L,
    profile: "default",
    profileSource: "default",
    displayName: "Kim",
    env: {},
    randomId: counterIds(),
    now: () => new Date("2026-10-16T12:00:00.000Z"),
    stdout: (l) => out.push(l),
    stderr: (l) => err.push(l),
    skillsEnabled: () => null,
    ...over,
  };
  return { deps, out, err };
}

/** Shared deps across calls so ids keep counting. */
function session(over: Partial<MemoryCliDeps> = {}) {
  const ctx = mkDeps(over);
  const call = async (
    verb: string,
    positional: string[] = [],
    flags: Record<string, string | boolean> = {},
    passthrough: string[] = [],
  ): Promise<Run> => {
    ctx.out.length = 0;
    ctx.err.length = 0;
    const code = await runMemoryCommand(verb, { positional, passthrough }, flags, ctx.deps);
    return { code, out: [...ctx.out], err: [...ctx.err] };
  };
  return { ...ctx, call };
}

async function rules(
  verb: string,
  flags: Record<string, string | boolean> = {},
  positional: string[] = [],
): Promise<Run> {
  const { deps, out, err } = mkDeps();
  const code = await runRulesCommand(verb, { positional, passthrough: [] }, flags, deps);
  return { code, out, err };
}

async function skills(
  verb: string,
  flags: Record<string, string | boolean> = {},
  over: Partial<MemoryCliDeps> = {},
): Promise<Run> {
  const { deps, out, err } = mkDeps(over);
  const code = await runSkillsCommand(verb, { positional: [], passthrough: [] }, flags, deps);
  return { code, out, err };
}

const AGENT = "claude.default";
const storePaths = (agentKey = AGENT) => memoryPaths(L, agentKey);
const entriesText = (agentKey = AGENT) => readFileSync(storePaths(agentKey).entries, "utf8");
const lines = (agentKey = AGENT) =>
  entriesText(agentKey)
    .split("\n")
    .filter((l) => l !== "")
    .map((l) => JSON.parse(l) as Record<string, unknown>);

function entryLine(n: number, over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    v: 1,
    kind: "entry",
    id: ID(n),
    seq: n,
    type: "fact",
    appliesTo: "project",
    body: `entry ${n}`,
    source: { kind: "human", by: "Kim" },
    status: "active",
    supersedes: null,
    ...over,
  });
}

function writeStore(text: string, agentKey = AGENT): void {
  const p = storePaths(agentKey);
  mkdirSync(p.dir, { recursive: true, mode: 0o700 });
  writeFileSync(p.entries, text, { mode: 0o600 });
}

function tree(root: string): string[] {
  const out: string[] = [];
  const go = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      const st = lstatSync(p);
      // directories: mode only (a lock dir taken and released bumps the parent's mtime)
      if (st.isDirectory() && !st.isSymbolicLink()) {
        out.push(`${relative(root, p)}/|${st.mode}`);
        go(p);
      } else {
        out.push(`${relative(root, p)}|${st.mode}|${st.size}|${st.mtimeMs}`);
      }
    }
  };
  go(root);
  return out;
}

const USAGE_AGENT = "loom memory: --agent must be claude, codex or grok";

// ---------------------------------------------------------------------------------------------
// add · propose
// ---------------------------------------------------------------------------------------------

describe("loom memory add (② add · R13)", () => {
  test("positional body → active entry, exact stdout, exit 0, human source", async () => {
    const s = session();
    const r = await s.call("add", ["hello", "world"], { agent: "claude" });
    expect(r).toEqual({
      code: 0,
      out: [`added ${ID(0xa001)} (active, seq 1) to ${storePaths().entries}`],
      err: [],
    });
    expect(lines()).toEqual([
      {
        v: 1,
        kind: "entry",
        id: ID(0xa001),
        seq: 1,
        type: "fact",
        appliesTo: "project",
        body: "hello world",
        source: { kind: "human", by: "Kim" },
        status: "active",
        supersedes: null,
        at: "2026-10-16T12:00:00.000Z",
      },
    ]);
    expect(statSync(storePaths().dir).mode & 0o777).toBe(0o700);
    expect(statSync(storePaths().entries).mode & 0o777).toBe(0o600);
  });

  test("`--` passthrough wins over positional words (flag-like words survive)", async () => {
    const s = session();
    const r = await s.call("add", ["ignored"], { agent: "codex" }, ["--not-a-flag", "x"]);
    expect(r.code).toBe(0);
    expect(r.out).toEqual([
      `added ${ID(0xa001)} (active, seq 1) to ${storePaths("codex.default").entries}`,
    ]);
    expect(lines("codex.default")[0]!.body).toBe("--not-a-flag x");
  });

  test("--room <roomId> → appliesTo room:<roomKey> · --type decision", async () => {
    const s = session();
    const r = await s.call("add", ["room", "note"], {
      agent: "grok",
      room: "r1",
      type: "decision",
    });
    expect(r.code).toBe(0);
    const [l] = lines("grok.default");
    expect(l!.appliesTo).toBe(`room:${roomKey("r1")}`);
    expect(l!.type).toBe("decision");
  });

  test("agentKey follows the injected profile (hashed form for unsafe names)", async () => {
    const s = session({ profile: "Work", profileSource: "LOOM_PROFILE" });
    const r = await s.call("add", ["x"], { agent: "claude" });
    const key = `claude.x.${createHash("sha256").update("Work", "utf8").digest("hex").slice(0, 16)}`;
    expect(r.out).toEqual([`added ${ID(0xa001)} (active, seq 1) to ${storePaths(key).entries}`]);
  });

  test("--supersedes <id> appends with supersedes set; old entry hidden from list", async () => {
    const s = session();
    await s.call("add", ["old"], { agent: "claude" });
    const r = await s.call("add", ["new"], { agent: "claude", supersedes: ID(0xa001) });
    expect(r.code).toBe(0);
    expect(r.out).toEqual([`added ${ID(0xa002)} (active, seq 2) to ${storePaths().entries}`]);
    expect(lines()[1]!.supersedes).toBe(ID(0xa001));
    const l = await s.call("list", [], { agent: "claude" });
    expect(l.out.some((x) => x.includes(ID(0xa001)))).toBe(false);
    expect(l.out.some((x) => x.includes(ID(0xa002)))).toBe(true);
  });

  for (const flags of [{}, { agent: true }, { agent: "gpt" }, { agent: "Claude" }] as Record<
    string,
    string | boolean
  >[]) {
    test(`--agent ${JSON.stringify(flags.agent)} → exit 1, usage line, nothing created`, async () => {
      const s = session();
      const r = await s.call("add", ["x"], flags);
      expect(r).toEqual({ code: 1, out: [], err: [USAGE_AGENT] });
      expect(existsSync(join(L, "memory"))).toBe(false);
    });
  }

  test("bad --type → exit 1", async () => {
    const s = session();
    const r = await s.call("add", ["x"], { agent: "claude", type: "rumor" });
    expect(r).toEqual({
      code: 1,
      out: [],
      err: ["loom memory: --type must be fact, decision or preference"],
    });
    expect(existsSync(join(L, "memory"))).toBe(false);
  });

  test("--room without a value → exit 1", async () => {
    const s = session();
    const r = await s.call("add", ["x"], { agent: "claude", room: true });
    expect(r).toEqual({ code: 1, out: [], err: ["loom memory: --room needs a room id"] });
  });

  test("empty body → `empty body` exit 1", async () => {
    const s = session();
    const r = await s.call("add", [], { agent: "claude" });
    expect(r).toEqual({ code: 1, out: [], err: ["loom memory: empty body"] });
    const r2 = await s.call("add", ["  "], { agent: "claude" }, []);
    expect(r2.code).toBe(1);
    expect(existsSync(join(L, "memory"))).toBe(false);
  });

  test("secret (injected sensitive env value · token shape) → refused, never echoed", async () => {
    const secret = "hunter2-very-secret-value";
    const s = session({ env: { LOOM_RELAY_TOKEN: secret } });
    const msg =
      "loom memory: body looks like it contains a secret (redaction would change it) — reword it; nothing written";
    const r = await s.call("add", ["the", "pass", "is", secret], { agent: "claude" });
    expect(r).toEqual({ code: 1, out: [], err: [msg] });
    expect(r.err.join("\n")).not.toContain(secret);
    const shape = "sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const r2 = await s.call("propose", [shape], { agent: "claude" });
    expect(r2).toEqual({ code: 1, out: [], err: [msg] });
    expect(existsSync(join(L, "memory"))).toBe(false);
  });

  test("CRLF body passes (sanitize normalizes, no refusal)", async () => {
    const s = session();
    const r = await s.call("add", [], { agent: "claude" }, ["line one\r\nline two"]);
    expect(r.code).toBe(0);
    expect(lines()[0]!.body).toBe("line one\nline two");
  });

  test("body 2001 chars → exit 1 with length", async () => {
    const s = session();
    const r = await s.call("add", ["a".repeat(2001)], { agent: "claude" });
    expect(r).toEqual({ code: 1, out: [], err: ["loom memory: body is 2001 chars (max 2000)"] });
  });

  test("--supersedes unknown id → `unknown entry <id>` exit 1", async () => {
    const s = session();
    await s.call("add", ["x"], { agent: "claude" });
    const before = entriesText();
    const r = await s.call("add", ["y"], { agent: "claude", supersedes: ID(0xbeef) });
    expect(r).toEqual({ code: 1, out: [], err: [`loom memory: unknown entry ${ID(0xbeef)}`] });
    expect(entriesText()).toBe(before);
  });
});

describe("loom memory propose / approve / retire (② · D4)", () => {
  test("propose → exact stdout; approve → active; retire → retired; repeats refused", async () => {
    const s = session();
    const p = await s.call("propose", ["maybe"], { agent: "codex" });
    const id = ID(0xa001);
    expect(p).toEqual({
      code: 0,
      out: [`proposed ${id} (seq 1) — approve with: loom memory approve --agent codex ${id}`],
      err: [],
    });
    expect(lines("codex.default")[0]!.status).toBe("proposed");

    const a = await s.call("approve", [id], { agent: "codex" });
    expect(a).toEqual({ code: 0, out: [`approved ${id} (seq 2)`], err: [] });
    expect(lines("codex.default")[1]).toEqual({
      v: 1,
      kind: "transition",
      id,
      seq: 2,
      to: "active",
      source: { kind: "human", by: "Kim" },
      at: "2026-10-16T12:00:00.000Z",
    });

    const a2 = await s.call("approve", [id], { agent: "codex" });
    expect(a2).toEqual({
      code: 1,
      out: [],
      err: [`loom memory: entry ${id} is active — nothing to approve`],
    });

    const t = await s.call("retire", [id], { agent: "codex" });
    expect(t).toEqual({ code: 0, out: [`retired ${id} (seq 3)`], err: [] });
    const t2 = await s.call("retire", [id], { agent: "codex" });
    expect(t2).toEqual({
      code: 1,
      out: [],
      err: [`loom memory: entry ${id} is retired — nothing to retire`],
    });
  });

  test("approve / retire a missing id → `is missing` exit 1 (no dirs created)", async () => {
    const s = session();
    const a = await s.call("approve", [ID(7)], { agent: "claude" });
    expect(a).toEqual({
      code: 1,
      out: [],
      err: [`loom memory: entry ${ID(7)} is missing — nothing to approve`],
    });
    const r = await s.call("retire", [ID(7)], { agent: "claude" });
    expect(r).toEqual({
      code: 1,
      out: [],
      err: [`loom memory: entry ${ID(7)} is missing — nothing to retire`],
    });
    expect(existsSync(join(L, "memory"))).toBe(false);
  });

  test("full id only — a prefix is not matched", async () => {
    const s = session();
    await s.call("propose", ["p"], { agent: "claude" });
    const r = await s.call("approve", [ID(0xa001).slice(0, 10)], { agent: "claude" });
    expect(r.code).toBe(1);
    expect(r.err).toEqual([
      `loom memory: entry ${ID(0xa001).slice(0, 10)} is missing — nothing to approve`,
    ]);
  });

  for (const verb of ["approve", "retire", "show"]) {
    test(`${verb} without an id / with two ids → usage exit 1`, async () => {
      const s = session();
      const r = await s.call(verb, [], { agent: "claude" });
      expect(r.code).toBe(1);
      expect(r.out).toEqual([]);
      expect(r.err).toEqual([
        `loom memory: usage: loom memory ${verb} --agent <claude|codex|grok> <id>${verb === "show" ? " [--json]" : ""}`,
      ]);
      const r2 = await s.call(verb, [ID(1), ID(2)], { agent: "claude" });
      expect(r2.code).toBe(1);
      expect(r2.err).toEqual(r.err);
    });
  }

  test("approve / retire / compact also require --agent", async () => {
    const s = session();
    for (const verb of ["approve", "retire", "compact", "show"]) {
      const r = await s.call(verb, verb === "compact" ? [] : [ID(1)], {});
      expect(r).toEqual({ code: 1, out: [], err: [USAGE_AGENT] });
    }
  });
});

describe("unknown verb (② CLI 공통 — usage exit 1)", () => {
  for (const verb of ["", "edit", "delete"]) {
    test(`memory ${JSON.stringify(verb)} → usage on stderr, exit 1`, async () => {
      const s = session();
      const r = await s.call(verb, [], { agent: "claude" });
      expect(r.code).toBe(1);
      expect(r.out).toEqual([]);
      expect(r.err).toEqual([
        "loom memory: usage: loom memory add|propose|list|show|approve|retire|compact [--agent claude|codex|grok] [--room <roomId>] …",
      ]);
    });
  }
});

// ---------------------------------------------------------------------------------------------
// lock · caps (class 1 · D5)
// ---------------------------------------------------------------------------------------------

describe("lock held → store busy (② 락 · class 1)", () => {
  test(
    "add while another live owner holds entries.jsonl.lock → exit 1 `store busy`, bytes unchanged",
    async () => {
      const s = session();
      await s.call("add", ["first"], { agent: "claude" });
      const before = entriesText();
      const p = storePaths();
      mkdirSync(p.lock, { mode: 0o700 });
      writeFileSync(join(p.lock, "owner.pid"), `${process.pid}\n`);
      try {
        const r = await s.call("add", ["second"], { agent: "claude" });
        expect(r).toEqual({
          code: 1,
          out: [],
          err: [`loom memory: store busy (${p.lock}) — try again; nothing written`],
        });
      } finally {
        rmSync(p.lock, { recursive: true, force: true });
      }
      expect(entriesText()).toBe(before);
    },
    { timeout: 20_000 },
  );
});

describe("caps refuse add/propose only (D5 · R6)", () => {
  test("200 visible active: add 1 · propose 0 · approve 0 · retire 0 · compact 0", async () => {
    const body = Array.from({ length: 200 }, (_, i) => entryLine(i + 1)).join("\n");
    writeStore(`${body}\n${entryLine(201, { status: "proposed", body: "pending" })}\n`);
    const s = session();
    const add = await s.call("add", ["one more"], { agent: "claude" });
    expect(add).toEqual({
      code: 1,
      out: [],
      err: ["loom memory: 200 active entries (max 200) — retire or supersede one"],
    });
    const sup = await s.call("add", ["edit"], { agent: "claude", supersedes: ID(5) });
    expect(sup.code).toBe(0);
    const prop = await s.call("propose", ["idea"], { agent: "claude" });
    expect(prop.code).toBe(0);
    const appr = await s.call("approve", [ID(201)], { agent: "claude" });
    expect(appr.code).toBe(0);
    const ret = await s.call("retire", [ID(1)], { agent: "claude" });
    expect(ret.code).toBe(0);
    const comp = await s.call("compact", [], { agent: "claude" });
    expect(comp.code).toBe(0);
    expect(comp.out[0]).toStartWith("compacted: moved ");
  });

  test("entries.jsonl > 1 MiB: add/propose 1 · approve/retire/compact 0", async () => {
    const filler: string[] = [];
    let n = 10;
    let size = 0;
    while (size <= 1024 * 1024) {
      const l = entryLine(n++, { status: "retired", body: "f".repeat(1900) });
      filler.push(l);
      size += l.length + 1;
    }
    const text = `${entryLine(1)}\n${entryLine(2, { status: "proposed" })}\n${filler.join("\n")}\n`;
    writeStore(text);
    const kib = Math.ceil(Buffer.byteLength(text) / 1024);
    const msg = `loom memory: entries.jsonl is ${kib} KiB (max 1024 KiB) — run loom memory compact (retire entries first if it moves nothing)`;
    const s = session();
    expect(await s.call("add", ["x"], { agent: "claude" })).toEqual({
      code: 1,
      out: [],
      err: [msg],
    });
    expect(await s.call("propose", ["x"], { agent: "claude" })).toEqual({
      code: 1,
      out: [],
      err: [msg],
    });
    expect((await s.call("approve", [ID(2)], { agent: "claude" })).code).toBe(0);
    expect((await s.call("retire", [ID(1)], { agent: "claude" })).code).toBe(0);
    const c = await s.call("compact", [], { agent: "claude" });
    expect(c.code).toBe(0);
    expect(c.out).toHaveLength(1);
    expect(c.out[0]).toMatch(
      /^compacted: moved \d+ lines \(0 unparseable, 0 conflict losers\) to .*entries\.archive\.jsonl; kept 2; watermark seq \d+$/,
    );
  });
});

// ---------------------------------------------------------------------------------------------
// compact
// ---------------------------------------------------------------------------------------------

describe("loom memory compact (② compact · dev 19/20)", () => {
  test("nothing to move → `nothing to compact` exit 0, no write", async () => {
    const s = session();
    await s.call("add", ["keep"], { agent: "claude" });
    const before = tree(L);
    const r = await s.call("compact", [], { agent: "claude" });
    expect(r).toEqual({ code: 0, out: ["nothing to compact"], err: [] });
    expect(tree(L)).toEqual(before);
  });

  test("absent store → `nothing to compact`, no dirs", async () => {
    const s = session();
    const r = await s.call("compact", [], { agent: "grok" });
    expect(r).toEqual({ code: 0, out: ["nothing to compact"], err: [] });
    expect(existsSync(join(L, "memory"))).toBe(false);
  });

  test("retired entry + its transition move; stdout = CompactResult.message", async () => {
    const s = session();
    await s.call("add", ["gone"], { agent: "claude" });
    await s.call("retire", [ID(0xa001)], { agent: "claude" });
    const r = await s.call("compact", [], { agent: "claude" });
    expect(r).toEqual({
      code: 0,
      out: [
        `compacted: moved 2 lines (0 unparseable, 0 conflict losers) to ${storePaths().archive}; kept 0; watermark seq 2`,
      ],
      err: [],
    });
  });

  test("compact with positional args → usage exit 1", async () => {
    const s = session();
    const r = await s.call("compact", ["extra"], { agent: "claude" });
    expect(r.code).toBe(1);
    expect(r.err).toEqual(["loom memory: usage: loom memory compact --agent <claude|codex|grok>"]);
  });
});

// ---------------------------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------------------------

function entriesRow(o: {
  active?: number;
  proposed?: number;
  retired?: number;
  kib?: number;
  u?: number;
  c?: number;
  d?: number;
  a?: number;
}): string {
  return `  entries: active ${o.active ?? 0}/200 · proposed ${o.proposed ?? 0}/200 · retired ${o.retired ?? 0} · entries.jsonl ${o.kib ?? 0} KiB/1024 KiB · unparseable ${o.u ?? 0} · conflicts ${o.c ?? 0} · dangling ${o.d ?? 0} · archived refs ${o.a ?? 0}`;
}

describe("loom memory list (② list · R53-L2)", () => {
  test("no store, no --agent → header + all three agent blocks, exit 0, nothing created", async () => {
    const s = session();
    const before = tree(L);
    const r = await s.call("list", [], {});
    const block = (kind: string) => {
      const dir = join(L, "memory", `${kind}.default`);
      return [
        `agent ${kind}.default  ${dir}`,
        entriesRow({}),
        `  persona.md: ${join(dir, "persona.md")} (absent)`,
      ];
    };
    expect(r).toEqual({
      code: 0,
      out: [
        "profile default (from default)",
        `knowledge/INDEX.md: ${join(L, "knowledge", "INDEX.md")} (absent)`,
        ...block("claude"),
        ...block("codex"),
        ...block("grok"),
      ],
      err: [],
    });
    expect(tree(L)).toEqual(before);
  });

  for (const [source, profile] of [
    ["--profile", "work"],
    ["LOOM_PROFILE", "w2"],
    ["displayName", "Kim"],
  ] as const) {
    test(`header shows profile source ${source}`, async () => {
      const s = session({ profile, profileSource: source });
      const r = await s.call("list", [], { agent: "claude" });
      expect(r.out[0]).toBe(`profile ${profile} (from ${source})`);
    });
  }

  test("records: default = proposed + visible active (seq asc); --all adds retired/hidden", async () => {
    const s = session();
    await s.call("add", ["first line\nsecond line"], { agent: "claude" }); // a001 seq1
    await s.call("propose", ["an idea"], { agent: "claude" }); // a002 seq2
    await s.call("add", ["to retire"], { agent: "claude", type: "preference" }); // a003 seq3
    await s.call("retire", [ID(0xa003)], { agent: "claude" }); // seq4
    await s.call("add", ["room one"], { agent: "claude", room: "r1" }); // a004 seq5
    const rk = roomKey("r1");
    const r = await s.call("list", [], { agent: "claude" });
    const kib = Math.ceil(statSync(storePaths().entries).size / 1024);
    const dir = storePaths().dir;
    expect(r).toEqual({
      code: 0,
      out: [
        "profile default (from default)",
        `knowledge/INDEX.md: ${join(L, "knowledge", "INDEX.md")} (absent)`,
        `agent claude.default  ${dir}`,
        entriesRow({ active: 2, proposed: 1, retired: 1, kib }),
        `  persona.md: ${join(dir, "persona.md")} (absent)`,
        `  ${ID(0xa001)}  active  fact  project  seq 1  first line`,
        `  ${ID(0xa002)}  proposed  fact  project  seq 2  an idea`,
        `  ${ID(0xa004)}  active  fact  room:${rk}  seq 5  room one`,
      ],
      err: [],
    });
    const all = await s.call("list", [], { agent: "claude", all: true });
    expect(all.out.filter((l) => l.startsWith("  mem_"))).toEqual([
      `  ${ID(0xa001)}  active  fact  project  seq 1  first line`,
      `  ${ID(0xa002)}  proposed  fact  project  seq 2  an idea`,
      `  ${ID(0xa003)}  retired  preference  project  seq 3  to retire`,
      `  ${ID(0xa004)}  active  fact  room:${rk}  seq 5  room one`,
    ]);
  });

  test("--room filters to project + that room and adds the guideline row", async () => {
    const s = session();
    await s.call("add", ["proj"], { agent: "claude" });
    await s.call("add", ["in r1"], { agent: "claude", room: "r1" });
    await s.call("add", ["in r2"], { agent: "claude", room: "r2" });
    const rk = roomKey("r2");
    const gdir = join(L, "rooms", rk);
    mkdirSync(gdir, { recursive: true });
    writeFileSync(join(gdir, "guideline.md"), "g".repeat(16385));
    const r = await s.call("list", [], { agent: "claude", room: "r2" });
    expect(r.code).toBe(0);
    expect(r.out).toContain(
      `  guideline.md: ${join(gdir, "guideline.md")} (16385/16384 B, truncated on read)`,
    );
    const recs = r.out.filter((l) => l.startsWith("  mem_"));
    expect(recs).toEqual([
      `  ${ID(0xa001)}  active  fact  project  seq 1  proj`,
      `  ${ID(0xa003)}  active  fact  room:${rk}  seq 3  in r2`,
    ]);
  });

  test("persona / INDEX sizes and truncation flags; first body line cut to 80 chars", async () => {
    const s = session();
    await s.call("add", ["z".repeat(100)], { agent: "claude" });
    writeFileSync(join(storePaths().dir, "persona.md"), "p".repeat(9000));
    mkdirSync(join(L, "knowledge"));
    writeFileSync(join(L, "knowledge", "INDEX.md"), "i".repeat(100));
    const r = await s.call("list", [], { agent: "claude" });
    expect(r.out).toContain(
      `  persona.md: ${join(storePaths().dir, "persona.md")} (9000/8192 B, truncated on read)`,
    );
    expect(r.out).toContain(`knowledge/INDEX.md: ${join(L, "knowledge", "INDEX.md")} (100/8192 B)`);
    expect(r.out).toContain(`  ${ID(0xa001)}  active  fact  project  seq 1  ${"z".repeat(80)}`);
  });

  test("counters: unparseable · conflicts · dangling · archived refs in the entries row", async () => {
    writeStore(
      [
        entryLine(1),
        "{torn",
        entryLine(2, { body: "dup a" }),
        entryLine(2, { body: "dup b" }),
        entryLine(3, { supersedes: ID(99) }),
        "",
      ].join("\n"),
    );
    const s = session();
    const r = await s.call("list", [], { agent: "claude" });
    const f = foldMemoryLines(entriesText());
    expect(r.out).toContain(
      entriesRow({
        active: f.visibleActive.length,
        kib: Math.ceil(statSync(storePaths().entries).size / 1024),
        u: 1,
        c: 1,
        d: 1,
      }),
    );
  });

  test("--json: fixed fields", async () => {
    const s = session({ profile: "work", profileSource: "--profile" });
    await s.call("add", ["proj"], { agent: "claude" });
    await s.call("propose", ["p"], { agent: "claude", room: "r1" });
    const r = await s.call("list", [], { agent: "claude", json: true, room: "r1" });
    expect(r.code).toBe(0);
    expect(r.out).toHaveLength(1);
    const j = JSON.parse(r.out[0]!);
    const p = memoryPaths(L, "claude.work");
    const rk = roomKey("r1");
    expect(j).toEqual({
      profile: "work",
      profileSource: "--profile",
      room: { roomId: "r1", roomKey: rk },
      knowledgeIndex: {
        path: join(L, "knowledge", "INDEX.md"),
        state: "absent",
        bytes: 0,
        cap: 8192,
        truncatedOnRead: false,
      },
      agents: [
        {
          agent: "claude",
          agentKey: "claude.work",
          dir: p.dir,
          entriesPath: p.entries,
          state: "ok",
          entriesBytes: statSync(p.entries).size,
          caps: { active: 200, proposed: 200, entriesBytes: 1048576 },
          counts: {
            active: 1,
            proposed: 1,
            retired: 0,
            unparseable: 0,
            conflicts: 0,
            dangling: 0,
            archivedRefs: 0,
          },
          persona: {
            path: join(p.dir, "persona.md"),
            state: "absent",
            bytes: 0,
            cap: 8192,
            truncatedOnRead: false,
          },
          guideline: {
            path: join(L, "rooms", rk, "guideline.md"),
            state: "absent",
            bytes: 0,
            cap: 16384,
            truncatedOnRead: false,
          },
          entries: [
            {
              id: ID(0xa001),
              seq: 1,
              status: "active",
              type: "fact",
              appliesTo: "project",
              body: "proj",
              source: { kind: "human", by: "Kim" },
              supersedes: null,
              supersededBy: [],
              hidden: false,
              at: "2026-10-16T12:00:00.000Z",
            },
            {
              id: ID(0xa002),
              seq: 2,
              status: "proposed",
              type: "fact",
              appliesTo: `room:${rk}`,
              body: "p",
              source: { kind: "human", by: "Kim" },
              supersedes: null,
              supersededBy: [],
              hidden: false,
              at: "2026-10-16T12:00:00.000Z",
            },
          ],
        },
      ],
    });
  });

  test("symlinked store dir → state unsafe, still exit 0", async () => {
    mkdirSync(join(L, "memory"), { mode: 0o700 });
    const elsewhere = mkdtempSync(join(tmpdir(), "loom-memcli-elsewhere-"));
    try {
      symlinkSync(elsewhere, storePaths().dir);
      const s = session();
      const r = await s.call("list", [], { agent: "claude" });
      expect(r.code).toBe(0);
      expect(r.out).toContain(
        `  entries: unreadable — ${storePaths().dir} is a symlink or not a regular path`,
      );
      const j = JSON.parse((await s.call("list", [], { agent: "claude", json: true })).out[0]!);
      expect(j.agents[0].state).toBe("unsafe");
    } finally {
      rmSync(elsewhere, { recursive: true, force: true });
    }
  });

  test("list usage errors → exit 1 (bad --agent · --room without value · positional)", async () => {
    const s = session();
    expect(await s.call("list", [], { agent: "nope" })).toEqual({
      code: 1,
      out: [],
      err: [USAGE_AGENT],
    });
    expect(await s.call("list", [], { room: true })).toEqual({
      code: 1,
      out: [],
      err: ["loom memory: --room needs a room id"],
    });
    const r = await s.call("list", ["extra"], {});
    expect(r.code).toBe(1);
    expect(r.err).toEqual([
      "loom memory: usage: loom memory list [--agent claude|codex|grok] [--room <roomId>] [--all] [--json]",
    ]);
  });
});

// ---------------------------------------------------------------------------------------------
// show
// ---------------------------------------------------------------------------------------------

describe("loom memory show (② show)", () => {
  test("text: fields, history, superseded by; exit 0", async () => {
    const s = session();
    await s.call("propose", ["two\nlines"], { agent: "claude", type: "decision" }); // a001 seq1
    await s.call("approve", [ID(0xa001)], { agent: "claude" }); // seq2
    await s.call("add", ["replacement"], { agent: "claude", supersedes: ID(0xa001) }); // a002 seq3
    const r = await s.call("show", [ID(0xa001)], { agent: "claude" });
    const src = JSON.stringify({ kind: "human", by: "Kim" });
    expect(r).toEqual({
      code: 0,
      out: [
        ID(0xa001),
        "  status: active",
        "  type: decision",
        "  appliesTo: project",
        "  seq: 1",
        `  source: ${src}`,
        "  supersedes: none",
        `  superseded by ${ID(0xa002)} (active)`,
        "  at: 2026-10-16T12:00:00.000Z",
        "  history:",
        `    seq 2  to active  ${src}`,
        "  body:",
        "    two",
        "    lines",
      ],
      err: [],
    });
    const r2 = await s.call("show", [ID(0xa002)], { agent: "claude" });
    expect(r2.out).toContain(`  supersedes: ${ID(0xa001)}`);
    expect(r2.out).toContain("    (none)");
  });

  test("--json: entry + transitions + supersededBy", async () => {
    const s = session();
    await s.call("propose", ["x"], { agent: "claude" });
    await s.call("approve", [ID(0xa001)], { agent: "claude" });
    const r = await s.call("show", [ID(0xa001)], { agent: "claude", json: true });
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out[0]!)).toEqual({
      agentKey: AGENT,
      entry: {
        id: ID(0xa001),
        seq: 1,
        status: "active",
        type: "fact",
        appliesTo: "project",
        body: "x",
        source: { kind: "human", by: "Kim" },
        supersedes: null,
        supersedesArchived: false,
        hidden: false,
        at: "2026-10-16T12:00:00.000Z",
      },
      transitions: [
        {
          seq: 2,
          to: "active",
          source: { kind: "human", by: "Kim" },
          at: "2026-10-16T12:00:00.000Z",
        },
      ],
      supersededBy: [],
    });
  });

  test("missing → `entry <id> not found` exit 1", async () => {
    const s = session();
    const r = await s.call("show", [ID(3)], { agent: "claude" });
    expect(r).toEqual({ code: 1, out: [], err: [`loom memory: entry ${ID(3)} not found`] });
  });
});

// ---------------------------------------------------------------------------------------------
// rules list
// ---------------------------------------------------------------------------------------------

const BUNDLED = BUNDLED_RULES[0]!;

describe("loom rules list (② rules list)", () => {
  test("bundled only → header + one row, exit 0", async () => {
    const r = await rules("list");
    expect(r).toEqual({
      code: 0,
      out: [
        "rules: bundled 1 · user 0 · overrides 0 · disabled 0 · invalid 0",
        `report-blockers  bundled  scope=all  priority=500  ${BUNDLED.text.length}/8192 B  bundled:report-blockers.md`,
      ],
      err: [],
    });
  });

  test("user override · disabled · invalid rows", async () => {
    mkdirSync(join(L, "rules"));
    const over = "---\nid: report-blockers\nscope: claude\npriority: 900\n---\nMine.\n";
    writeFileSync(join(L, "rules", "report-blockers.md"), over);
    writeFileSync(join(L, "rules", "quiet.md"), "---\nid: quiet\nscope: all\npriority: 1\n---\n\n");
    writeFileSync(join(L, "rules", "bad.md"), "no front matter\n");
    const view = loadRules(L);
    const reason = view.invalid.find((i) => i.file === "bad.md")!.reason;
    const r = await rules("list");
    expect(r.code).toBe(0);
    expect(r.out).toEqual([
      "rules: bundled 1 · user 2 · overrides 1 · disabled 1 · invalid 1",
      `report-blockers  user (overrides bundled)  scope=claude  priority=900  ${Buffer.byteLength(over)}/8192 B  ${join(L, "rules", "report-blockers.md")}`,
      `quiet  disabled by user  scope=all  priority=1  ${statSync(join(L, "rules", "quiet.md")).size}/8192 B  ${join(L, "rules", "quiet.md")}`,
      `invalid: bad.md: ${reason}`,
    ]);
  });

  test("truncated rule shows ` truncated`", async () => {
    mkdirSync(join(L, "rules"));
    const text = `---\nid: big\nscope: all\npriority: 2\n---\n${"b".repeat(9000)}\n`;
    writeFileSync(join(L, "rules", "big.md"), text);
    const r = await rules("list");
    expect(r.out).toContain(
      `big  user  scope=all  priority=2  ${Buffer.byteLength(text)}/8192 B truncated  ${join(L, "rules", "big.md")}`,
    );
  });

  test("--json mirrors the view (no bodies)", async () => {
    const r = await rules("list", { json: true });
    expect(r.code).toBe(0);
    const j = JSON.parse(r.out[0]!);
    expect(j.counts).toEqual({ bundled: 1, user: 0, overrides: 0, disabled: 0, invalid: 0 });
    expect(j.rules).toEqual([
      {
        id: "report-blockers",
        scope: "all",
        priority: 500,
        status: "bundled",
        source: "bundled",
        file: "report-blockers.md",
        path: "bundled:report-blockers.md",
        bytes: BUNDLED.text.length,
        truncated: false,
      },
    ]);
    expect(j.invalid).toEqual([]);
    expect(j.conflicts).toEqual([]);
    expect(j.userDir).toBe(join(L, "rules"));
    expect(j.userDirState).toBe("absent");
    expect(j.scanCapped).toBe(false);
  });

  test("unknown verb / extra args → usage exit 1", async () => {
    expect(await rules("show")).toEqual({
      code: 1,
      out: [],
      err: ["loom rules: usage: loom rules list [--json]"],
    });
    expect((await rules("list", {}, ["x"])).code).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------
// skills list
// ---------------------------------------------------------------------------------------------

function md(name: string, description: string): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\nBody.\n`;
}

function userSkill(name: string, text: string): void {
  const dir = join(L, "skills", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), text);
}

describe("loom skills list (② skills list · R15)", () => {
  test("builtin only, no bridge config → exit 0", async () => {
    const r = await skills("list");
    expect(r).toEqual({
      code: 0,
      out: [
        "skills: worker.skills.enabled = no bridge config (profile default)",
        `loom-card-report  builtin  available  ${BUILTIN_DESC}`,
      ],
      err: [],
    });
  });

  test("enabled flag rendered from the injected bridge config reader", async () => {
    expect((await skills("list", {}, { skillsEnabled: () => true })).out[0]).toBe(
      "skills: worker.skills.enabled = true (profile default)",
    );
    expect((await skills("list", {}, { skillsEnabled: () => false, profile: "work" })).out[0]).toBe(
      "skills: worker.skills.enabled = false (profile work)",
    );
  });

  test("user skill of the same name shadows the builtin; extra user skill; ignored name", async () => {
    userSkill("loom-card-report", md("loom-card-report", "Owner override."));
    userSkill("extra", md("extra", "Extra skill."));
    mkdirSync(join(L, "skills", "Bad_Name"));
    const r = await skills("list");
    expect(r.code).toBe(0);
    expect(r.out).toEqual([
      "skills: worker.skills.enabled = no bridge config (profile default)",
      "extra  user  available  Extra skill.",
      "loom-card-report  user  available  user shadows builtin  Owner override.",
      "ignored: Bad_Name (invalid name)",
    ]);
  });

  test("broken user entry still shadows (unavailable + reason)", async () => {
    mkdirSync(join(L, "skills", "loom-card-report"), { recursive: true });
    const r = await skills("list");
    expect(r.code).toBe(0);
    expect(r.out[1]).toMatch(
      /^loom-card-report {2}user {2}unavailable: .+ {2}user shadows builtin$/,
    );
  });

  test("invalid policy.json → `policy invalid:` line, availability unknown", async () => {
    writeFileSync(join(L, "policy.json"), "{");
    const r = await skills("list");
    expect(r.code).toBe(0);
    expect(r.out[1]).toStartWith("policy invalid: ");
    expect(r.out[2]).toBe(`loom-card-report  builtin  unknown  ${BUILTIN_DESC}`);
  });

  test("--room shows the room selection, marking names not installed", async () => {
    const rk = roomKey("r1");
    mkdirSync(join(L, "rooms", rk), { recursive: true });
    writeFileSync(
      join(L, "rooms", rk, "skills.json"),
      JSON.stringify({ version: 1, skills: ["loom-card-report", "nope"] }),
    );
    const r = await skills("list", { room: "r1" });
    expect(r.code).toBe(0);
    expect(r.out).toContain(`selected in room ${rk}: loom-card-report, nope (not installed)`);
    const r2 = await skills("list", { room: "r9" });
    expect(r2.out).toContain(`selected in room ${roomKey("r9")}: (none)`);
  });

  test("--json fields", async () => {
    const r = await skills("list", { json: true }, { skillsEnabled: () => true });
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out[0]!)).toEqual({
      profile: "default",
      skillsEnabled: true,
      policyError: null,
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
      room: null,
    });
  });

  test("unknown verb → usage exit 1", async () => {
    expect(await skills("show")).toEqual({
      code: 1,
      out: [],
      err: ["loom skills: usage: loom skills list [--room <roomId>] [--json]"],
    });
  });
});

// ---------------------------------------------------------------------------------------------
// spawn — the real CLI entry under a temp home (R16)
// ---------------------------------------------------------------------------------------------

function childEnv(T: string, extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue;
    if (/^(LOOM_|FABLE_)/.test(k)) continue; // relay token · profile · session never leak in
    env[k] = v;
  }
  return { ...env, HOME: T, LOOM_TEST_HOME: T, ...extra };
}

function runCli(T: string, args: string[], extra: Record<string, string> = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    env: childEnv(T, extra),
    encoding: "utf8",
    timeout: 30_000,
  });
}

describe("spawn: bun packages/cli/src/index.ts memory … (HOME = LOOM_TEST_HOME = temp)", () => {
  test(
    "memory add writes only under the temp home; list reports the profile source",
    () => {
      const T = mkdtempSync(join(tmpdir(), "loom-memcli-spawn-"));
      try {
        const r = runCli(T, ["memory", "add", "--agent", "claude", "spawned", "note"]);
        expect(r.stderr).toBe("");
        expect(r.status).toBe(0);
        const entries = join(T, ".loom", "memory", "claude.default", "entries.jsonl");
        expect(r.stdout).toMatch(
          new RegExp(
            `^added mem_[0-9a-f]{16} \\(active, seq 1\\) to ${entries.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n$`,
          ),
        );
        expect(statSync(entries).mode & 0o777).toBe(0o600);
        expect(statSync(join(T, ".loom", "memory")).mode & 0o777).toBe(0o700);
        const [line] = readFileSync(entries, "utf8").trim().split("\n");
        expect(JSON.parse(line!).body).toBe("spawned note");
        // the child created only the memory store under <T>/.loom (no knowledge/rules/persona)
        expect(readdirSync(join(T, ".loom")).sort()).toEqual(["memory"]);
        expect(readdirSync(join(T, ".loom", "memory"))).toEqual(["claude.default"]);
        expect(readdirSync(join(T, ".loom", "memory", "claude.default"))).toEqual([
          "entries.jsonl",
        ]);

        const l1 = runCli(T, ["memory", "list", "--agent", "claude"]);
        expect(l1.status).toBe(0);
        expect(l1.stdout.split("\n")[0]).toBe("profile default (from default)");
        const l2 = runCli(T, ["memory", "list", "--agent", "claude"], { LOOM_PROFILE: "w2" });
        expect(l2.stdout.split("\n")[0]).toBe("profile w2 (from LOOM_PROFILE)");
        const l3 = runCli(T, ["--profile", "work", "memory", "list", "--agent", "claude"], {
          LOOM_PROFILE: "w2",
        });
        expect(l3.stdout.split("\n")[0]).toBe("profile work (from --profile)");
        writeFileSync(
          join(T, ".loom", "session.json"),
          JSON.stringify({ displayName: "Kim", relayUrl: "ws://127.0.0.1:7842" }),
        );
        const l4 = runCli(T, ["memory", "list", "--agent", "claude"]);
        expect(l4.stdout.split("\n")[0]).toBe("profile Kim (from displayName)");
        const key = `claude.x.${createHash("sha256").update("Kim", "utf8").digest("hex").slice(0, 16)}`;
        expect(l4.stdout).toContain(`agent ${key}  ${join(T, ".loom", "memory", key)}`);

        const bad = runCli(T, ["memory", "add", "x"]);
        expect(bad.status).toBe(1);
        expect(bad.stderr).toBe(`${USAGE_AGENT}\n`);
        const rl = runCli(T, ["rules", "list"]);
        expect(rl.status).toBe(0);
        expect(rl.stdout).toContain("report-blockers  bundled  scope=all  priority=500");
        const sk = runCli(T, ["skills", "list"]);
        expect(sk.status).toBe(0);
        expect(sk.stdout).toContain("loom-card-report  builtin  available");
      } finally {
        rmSync(T, { recursive: true, force: true });
      }
    },
    { timeout: 60_000 },
  );
});
