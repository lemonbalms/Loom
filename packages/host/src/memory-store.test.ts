/**
 * PLAN 0.35.0 P1 — memory-store pure core (D2 · D3 · D6 · R1~R5 · R53-M1 · R53-L2).
 * Done-when (a): agentKeyFor table (incl. profile resolution via resolveBridgeProfile —
 * --profile · LOOM_PROFILE · displayName fallback · default) · results ⊆ AGENT_KEY_RE · safe/hash
 * forms disjoint · line schema field boundaries · appliesTo regex.
 * Done-when (b): (seq, id) fold — identical copies · (id, seq) conflicts · same id other seq ·
 * dangling · unparseable anywhere · CRLF · hiding (an ever-active supersessor hides — incl. one
 * later retired; proposed or rejected (proposed → retired) does not) ·
 * absent supersedes target with/without watermark · maxSeq incl. watermark · 200-permutation
 * shuffle invariance on a fixed-seed ≥60-line store.
 * Pure: no file I/O — run with HOME and LOOM_TEST_HOME pointing at a temp dir anyway (R16).
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import type { AgentKind } from "./agent-argv";
import { resolveBridgeProfile } from "./bridge-spawn";
import {
  AGENT_KEY_RE,
  agentKeyFor,
  foldMemoryLines,
  isAgentKey,
  type MemoryFold,
  parseMemoryLine,
} from "./memory-store";
import { resetActiveProfile, setActiveProfile } from "./session-store";

const KINDS: AgentKind[] = ["claude", "codex", "grok"];
const sha16 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex").slice(0, 16);
const ID = (n: number) => `mem_${n.toString(16).padStart(16, "0")}`;
const ROOM = "room:0123456789abcdef";

type Obj = Record<string, unknown>;

function entry(over: Obj = {}): Obj {
  return {
    v: 1,
    kind: "entry",
    id: ID(1),
    seq: 1,
    type: "fact",
    appliesTo: "project",
    body: "hello",
    source: { kind: "human", by: "Kim" },
    status: "active",
    supersedes: null,
    at: "2026-10-16T00:00:00.000Z",
    ...over,
  };
}

function transition(over: Obj = {}): Obj {
  return {
    v: 1,
    kind: "transition",
    id: ID(1),
    seq: 2,
    to: "active",
    source: { kind: "human", by: "Kim" },
    at: "2026-10-16T00:00:01.000Z",
    ...over,
  };
}

const watermark = (seq: number): Obj => ({ v: 1, kind: "compact", seq });

/** Lines (objects are JSON.stringified, strings kept raw) joined with "\n" + trailing "\n". */
function store(...lines: (Obj | string)[]): string {
  return `${lines.map((l) => (typeof l === "string" ? l : JSON.stringify(l))).join("\n")}\n`;
}

const without = (o: Obj, key: string): Obj => {
  const c = { ...o };
  delete c[key];
  return c;
};

const parses = (o: Obj | string) =>
  parseMemoryLine(typeof o === "string" ? o : JSON.stringify(o)) !== null;

/** Counted unparseable by the fold (and rejected by the line parser). */
function expectUnparseable(o: Obj | string): void {
  const line = typeof o === "string" ? o : JSON.stringify(o);
  expect(parseMemoryLine(line)).toBeNull();
  const f = foldMemoryLines(`${line}\n`);
  expect(f.counters.unparseable).toBe(1);
  expect(f.entries.size).toBe(0);
  expect(f.maxSeq).toBe(0);
}

function expectParses(o: Obj): void {
  expect(parses(o)).toBe(true);
  expect(foldMemoryLines(store(o)).counters.unparseable).toBe(0);
}

const visibleIds = (f: MemoryFold) => f.visibleActive.map((e) => e.id);

// ---------------------------------------------------------------------------------------------
// agentKeyFor · AGENT_KEY_RE · isAgentKey (R1 · Done-when (a))
// ---------------------------------------------------------------------------------------------

describe("agentKeyFor (R1)", () => {
  test("AGENT_KEY_RE is exactly the ② regex", () => {
    expect(AGENT_KEY_RE.source).toBe(
      "^(claude|codex|grok)\\.(?:[a-z0-9][a-z0-9_-]{0,47}|x\\.[0-9a-f]{16})$",
    );
    expect(AGENT_KEY_RE.flags).toBe("");
  });

  test("safe lowercase profiles are kept verbatim", () => {
    expect(agentKeyFor("default", "claude")).toBe("claude.default");
    expect(agentKeyFor("work", "codex")).toBe("codex.work");
    expect(agentKeyFor("a_b-1", "grok")).toBe("grok.a_b-1");
    expect(agentKeyFor("0", "claude")).toBe("claude.0");
    expect(agentKeyFor("x", "claude")).toBe("claude.x");
    const p48 = "a".repeat(48);
    expect(agentKeyFor(p48, "codex")).toBe(`codex.${p48}`);
  });

  test("anything else → x.<sha256(UTF-8 profile) first 16 hex> (incl. empty string)", () => {
    const hashed = [
      "Work",
      "a b",
      ".x",
      "한글",
      "",
      "a".repeat(49),
      "-x",
      "_x",
      "a/b",
      "..",
      "x.0123456789abcdef",
      "WORK",
      "tab\there",
    ];
    for (const kind of KINDS) {
      for (const p of hashed) {
        expect(agentKeyFor(p, kind)).toBe(`${kind}.x.${sha16(p)}`);
      }
    }
    expect(agentKeyFor("", "claude")).toBe(
      `claude.x.${createHash("sha256").update("").digest("hex").slice(0, 16)}`,
    );
  });

  test("every result matches AGENT_KEY_RE and isAgentKey; keys are lowercase-only", () => {
    const profiles = ["default", "work", "a_b-1", "Work", "a b", ".x", "한글", "", "a".repeat(49)];
    for (const kind of KINDS) {
      for (const p of profiles) {
        const k = agentKeyFor(p, kind);
        expect(AGENT_KEY_RE.test(k)).toBe(true);
        expect(isAgentKey(k)).toBe(true);
        expect(k).toBe(k.toLowerCase());
        expect(k.startsWith(`${kind}.`)).toBe(true);
      }
    }
  });

  test("safe and hashed forms are disjoint; case-variants never collide", () => {
    // a profile that literally looks like a hashed token is itself hashed (contains ".")
    const lookalike = "x.0123456789abcdef";
    expect(agentKeyFor(lookalike, "claude")).not.toBe("claude.x.0123456789abcdef");
    expect(agentKeyFor(lookalike, "claude").startsWith("claude.x.")).toBe(true);
    // the safe token "x" is distinct from every hashed token (safe tokens contain no ".")
    expect(agentKeyFor("x", "claude")).toBe("claude.x");
    expect(agentKeyFor("Work", "claude")).not.toBe(agentKeyFor("work", "claude"));
    expect(agentKeyFor("Work", "claude")).not.toBe(agentKeyFor("WORK", "claude"));
    // same profile, different kinds → different keys
    expect(new Set(KINDS.map((k) => agentKeyFor("work", k))).size).toBe(3);
  });

  test("invalid agentKind → TypeError", () => {
    for (const bad of ["gemini", "unknown", "", "Claude", "claude.", "x"]) {
      expect(() => agentKeyFor("default", bad as AgentKind)).toThrow(TypeError);
    }
    expect(() => agentKeyFor("default", undefined as unknown as AgentKind)).toThrow(TypeError);
  });

  test("isAgentKey rejects non-keys", () => {
    for (const bad of [
      "claude",
      "claude.",
      "claude.Work",
      "claude.-x",
      "claude._x",
      "claude.a/b",
      "claude.a.b",
      "claude.x.123",
      "claude.x.0123456789ABCDEF",
      "claude.x.0123456789abcdef0",
      `claude.${"a".repeat(49)}`,
      "gemini.default",
      "../claude.default",
      "claude.default/..",
      " claude.default",
      "claude.default\n",
      "",
    ]) {
      expect(isAgentKey(bad)).toBe(false);
    }
    expect(isAgentKey(123 as unknown as string)).toBe(false);
    expect(isAgentKey(undefined as unknown as string)).toBe(false);
    expect(isAgentKey("grok.x.0123456789abcdef")).toBe(true);
  });
});

describe("agentKeyFor(resolveBridgeProfile(...)) — profile source (R53-L2)", () => {
  let saved: { LOOM_PROFILE?: string; FABLE_PROFILE?: string };

  beforeEach(() => {
    saved = { LOOM_PROFILE: process.env.LOOM_PROFILE, FABLE_PROFILE: process.env.FABLE_PROFILE };
    delete process.env.LOOM_PROFILE;
    delete process.env.FABLE_PROFILE;
    resetActiveProfile();
  });

  afterEach(() => {
    resetActiveProfile();
    for (const k of ["LOOM_PROFILE", "FABLE_PROFILE"] as const) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  test("--profile (explicit setActiveProfile) wins over displayName and LOOM_PROFILE", () => {
    process.env.LOOM_PROFILE = "other";
    setActiveProfile("work", { explicit: true });
    expect(agentKeyFor(resolveBridgeProfile({ displayName: "Kim" }), "claude")).toBe("claude.work");
  });

  test("LOOM_PROFILE wins over displayName", () => {
    process.env.LOOM_PROFILE = "work";
    expect(agentKeyFor(resolveBridgeProfile({ displayName: "Kim" }), "codex")).toBe("codex.work");
  });

  test("no active profile → displayName fallback; changing displayName changes the key", () => {
    const kim = agentKeyFor(resolveBridgeProfile({ displayName: "Kim" }), "claude");
    expect(kim).toBe(`claude.x.${sha16("Kim")}`);
    const lee = agentKeyFor(resolveBridgeProfile({ displayName: "Lee" }), "claude");
    expect(lee).toBe(`claude.x.${sha16("Lee")}`);
    expect(lee).not.toBe(kim);
    expect(agentKeyFor(resolveBridgeProfile({ displayName: "kim" }), "claude")).toBe("claude.kim");
  });

  test("no active profile and no displayName → default → <kind>.default", () => {
    expect(agentKeyFor(resolveBridgeProfile({ displayName: "" }), "claude")).toBe("claude.default");
    expect(agentKeyFor(resolveBridgeProfile(null), "grok")).toBe("grok.default");
    expect(agentKeyFor(resolveBridgeProfile({}), "codex")).toBe("codex.default");
  });
});

// ---------------------------------------------------------------------------------------------
// line schema (R2 · ② entry / transition / compact rows)
// ---------------------------------------------------------------------------------------------

describe("line schema — entry", () => {
  test("a full valid entry line parses (with and without at)", () => {
    expectParses(entry());
    expectParses(without(entry(), "at"));
    const p = parseMemoryLine(JSON.stringify(entry()));
    expect(p).not.toBeNull();
    expect(p!.kind).toBe("entry");
  });

  test("unknown keys are allowed and ignored", () => {
    expectParses(entry({ extra: 1, future: { a: [1, 2] } }));
  });

  test("non-object / torn / empty JSON → unparseable", () => {
    for (const bad of ["[]", '"str"', "1", "null", "true", "{", '{"v":1,"kind":"entry","id', "x"]) {
      expectUnparseable(bad);
    }
  });

  test("v must be exactly 1; kind must be known", () => {
    expectUnparseable(entry({ v: 2 }));
    expectUnparseable(entry({ v: "1" }));
    expectUnparseable(without(entry(), "v"));
    expectUnparseable(entry({ kind: "note" }));
    expectUnparseable(without(entry(), "kind"));
  });

  test("id = /^mem_[0-9a-f]{16}$/", () => {
    expectParses(entry({ id: "mem_0123456789abcdef" }));
    for (const bad of [
      "mem_0123",
      "mem_0123456789ABCDEF",
      "mem_0123456789abcdeg",
      "mem_0123456789abcdef0",
      "MEM_0123456789abcdef",
      "0123456789abcdef",
      "",
      12,
      null,
    ]) {
      expectUnparseable(entry({ id: bad }));
    }
    expectUnparseable(without(entry(), "id"));
  });

  test("seq = positive safe integer", () => {
    expectParses(entry({ seq: 1 }));
    expectParses(entry({ seq: Number.MAX_SAFE_INTEGER }));
    for (const bad of [0, -1, 1.5, "1", 2 ** 53, null, 1e300]) {
      expectUnparseable(entry({ seq: bad }));
    }
    expectUnparseable(without(entry(), "seq"));
  });

  test("type ∈ fact|decision|preference", () => {
    for (const t of ["fact", "decision", "preference"]) expectParses(entry({ type: t }));
    for (const bad of ["note", "Fact", "", null, 1]) expectUnparseable(entry({ type: bad }));
    expectUnparseable(without(entry(), "type"));
  });

  test("appliesTo = /^(project|room:[0-9a-f]{16})$/ (D6 — no person scope)", () => {
    expectParses(entry({ appliesTo: "project" }));
    expectParses(entry({ appliesTo: ROOM }));
    for (const bad of [
      "room:0123456789abcde",
      "room:0123456789ABCDEF",
      "room:0123456789abcdef0",
      `${ROOM}x`,
      "person:kim",
      "projects",
      "Project",
      "room:",
      "",
      null,
    ]) {
      expectUnparseable(entry({ appliesTo: bad }));
    }
    expectUnparseable(without(entry(), "appliesTo"));
  });

  test("body = string, .length 1..2000", () => {
    expectParses(entry({ body: "a" }));
    expectParses(entry({ body: "a".repeat(2000) }));
    expectParses(entry({ body: "😀".repeat(1000) })); // 2000 UTF-16 code units
    expectParses(entry({ body: "line1\nline2" }));
    expectUnparseable(entry({ body: "" }));
    expectUnparseable(entry({ body: "a".repeat(2001) }));
    expectUnparseable(entry({ body: `${"😀".repeat(1000)}a` }));
    expectUnparseable(entry({ body: 5 }));
    expectUnparseable(entry({ body: null }));
    expectUnparseable(without(entry(), "body"));
  });

  test("source = object {kind: /^[a-z][a-z0-9-]{0,31}$/, …}, serialized ≤1024 UTF-8 bytes", () => {
    expectParses(entry({ source: { kind: "human" } }));
    expectParses(entry({ source: { kind: "human", by: "Kim", extra: 1 } }));
    expectParses(entry({ source: { kind: `a${"b".repeat(31)}` } }));
    expectParses(entry({ source: { kind: "card-report" } }));
    for (const badKind of ["Human", "", "1human", "-x", `a${"b".repeat(32)}`, "hu man", 1, null]) {
      expectUnparseable(entry({ source: { kind: badKind } }));
    }
    expectUnparseable(entry({ source: {} }));
    for (const bad of [null, "human", [], [{ kind: "human" }], 1]) {
      expectUnparseable(entry({ source: bad }));
    }
    expectUnparseable(without(entry(), "source"));
    // {"kind":"human","by":"<pad>"} = 24 + pad bytes
    const s1024 = { kind: "human", by: "a".repeat(1000) };
    expect(Buffer.byteLength(JSON.stringify(s1024))).toBe(1024);
    expectParses(entry({ source: s1024 }));
    const s1025 = { kind: "human", by: "a".repeat(1001) };
    expect(Buffer.byteLength(JSON.stringify(s1025))).toBe(1025);
    expectUnparseable(entry({ source: s1025 }));
    // bytes, not code units: 334 × "한" = 1002 bytes but only 334 chars
    const mb = { kind: "human", by: "한".repeat(334) };
    expect(JSON.stringify(mb).length).toBeLessThan(1024);
    expectUnparseable(entry({ source: mb }));
  });

  test("status ∈ active|proposed|retired", () => {
    for (const s of ["active", "proposed", "retired"]) expectParses(entry({ status: s }));
    for (const bad of ["pending", "Active", "", null]) expectUnparseable(entry({ status: bad }));
    expectUnparseable(without(entry(), "status"));
  });

  test("supersedes = null or a mem_ id (key required)", () => {
    expectParses(entry({ id: ID(2), seq: 2, supersedes: ID(1) }));
    expectParses(entry({ supersedes: null }));
    for (const bad of ["mem_x", "", "mem_0123456789ABCDEF", 1, false]) {
      expectUnparseable(entry({ supersedes: bad }));
    }
    expectUnparseable(without(entry(), "supersedes"));
  });

  test("at optional; when present a string of ≤40 chars", () => {
    expectParses(entry({ at: "x".repeat(40) }));
    expectUnparseable(entry({ at: "x".repeat(41) }));
    expectUnparseable(entry({ at: 1 }));
    expectUnparseable(entry({ at: null }));
  });
});

describe("line schema — transition / compact watermark", () => {
  test("valid transition lines parse (to active|retired, at optional, unknown keys ok)", () => {
    expectParses(transition({ to: "active" }));
    expectParses(transition({ to: "retired" }));
    expectParses(without(transition(), "at"));
    expectParses(transition({ extra: true }));
  });

  test("transition field boundaries", () => {
    for (const bad of ["proposed", "Active", "", null]) expectUnparseable(transition({ to: bad }));
    expectUnparseable(without(transition(), "to"));
    expectUnparseable(transition({ id: "mem_0123" }));
    expectUnparseable(without(transition(), "id"));
    for (const bad of [0, -3, 2.5, "2"]) expectUnparseable(transition({ seq: bad }));
    expectUnparseable(without(transition(), "seq"));
    expectUnparseable(transition({ source: { kind: "Human" } }));
    expectUnparseable(transition({ source: { kind: "human", by: "a".repeat(1001) } }));
    expectUnparseable(without(transition(), "source"));
    expectUnparseable(transition({ at: "x".repeat(41) }));
    expectUnparseable(transition({ v: 2 }));
  });

  test("compact watermark: {v:1, kind:'compact', seq:N}", () => {
    expect(parses(watermark(5))).toBe(true);
    expect(parses({ ...watermark(5), extra: 1 })).toBe(true);
    expect(parseMemoryLine(JSON.stringify(watermark(5)))!.kind).toBe("compact");
    for (const bad of [0, -1, 1.5, "5"]) expectUnparseable(watermark(bad as number));
    expectUnparseable({ v: 1, kind: "compact" });
    expectUnparseable({ v: 2, kind: "compact", seq: 5 });
  });
});

// ---------------------------------------------------------------------------------------------
// fold (② fold steps 1–7 · R3 · R4 · R5 · R53-M1)
// ---------------------------------------------------------------------------------------------

describe("foldMemoryLines — basics", () => {
  test("empty input → empty fold, maxSeq 0, zero counters", () => {
    for (const raw of ["", "\n", "\n\n\r\n"]) {
      const f = foldMemoryLines(raw);
      expect(f.entries.size).toBe(0);
      expect(f.visibleActive).toEqual([]);
      expect(f.maxSeq).toBe(0);
      expect(f.counters).toEqual({ unparseable: 0, conflicts: 0, dangling: 0, archivedRefs: 0 });
    }
  });

  test("entry fields are carried into FoldedEntry", () => {
    const f = foldMemoryLines(store(entry({ type: "decision", appliesTo: ROOM, body: "b1" })));
    const e = f.entries.get(ID(1))!;
    expect(e).toMatchObject({
      id: ID(1),
      seq: 1,
      type: "decision",
      appliesTo: ROOM,
      body: "b1",
      source: { kind: "human", by: "Kim" },
      status: "active",
      supersedes: null,
      supersedesArchived: false,
      everActive: true,
      hidden: false,
      transitions: [],
    });
    expect(visibleIds(f)).toEqual([ID(1)]);
  });

  test("transitions apply in (seq, id) order regardless of file order", () => {
    const lines = [
      entry({ id: ID(1), seq: 1, status: "proposed" }),
      transition({ id: ID(1), seq: 2, to: "active" }),
      transition({ id: ID(1), seq: 3, to: "retired" }),
    ];
    const fwd = foldMemoryLines(store(...lines));
    const rev = foldMemoryLines(store(...[...lines].reverse()));
    for (const f of [fwd, rev]) {
      const e = f.entries.get(ID(1))!;
      expect(e.status).toBe("retired");
      expect(e.transitions.map((t) => [t.seq, t.to])).toEqual([
        [2, "active"],
        [3, "retired"],
      ]);
      expect(f.counters.dangling).toBe(0);
      expect(f.visibleActive).toEqual([]);
    }
  });

  test("proposed → active via approve transition becomes visible", () => {
    const f = foldMemoryLines(
      store(transition({ id: ID(1), seq: 2 }), entry({ id: ID(1), seq: 1, status: "proposed" })),
    );
    expect(f.entries.get(ID(1))!.status).toBe("active");
    expect(visibleIds(f)).toEqual([ID(1)]);
  });

  test("proposed → retired (retire) is allowed", () => {
    const f = foldMemoryLines(
      store(entry({ status: "proposed" }), transition({ seq: 2, to: "retired" })),
    );
    expect(f.entries.get(ID(1))!.status).toBe("retired");
    expect(f.counters.dangling).toBe(0);
  });

  test("visibleActive is in (seq asc, id asc) order", () => {
    const f = foldMemoryLines(
      store(
        entry({ id: ID(3), seq: 5 }),
        entry({ id: ID(2), seq: 2 }),
        entry({ id: ID(9), seq: 2 }),
        entry({ id: ID(1), seq: 9 }),
      ),
    );
    expect(visibleIds(f)).toEqual([ID(2), ID(9), ID(3), ID(1)]);
  });
});

describe("foldMemoryLines — duplicates and conflicts (D2 · R4 · class 3 · class 9)", () => {
  test("identical raw copies collapse silently (conflicts 0)", () => {
    const l = entry();
    const f = foldMemoryLines(store(l, l, l));
    expect(f.entries.size).toBe(1);
    expect(f.counters.conflicts).toBe(0);
  });

  test("same (id, seq), different raw → lexicographically smaller raw wins + conflicts 1", () => {
    const a = entry({ body: "aaa" });
    const b = entry({ body: "bbb" });
    expect(JSON.stringify(a) < JSON.stringify(b)).toBe(true);
    for (const raw of [store(a, b), store(b, a)]) {
      const f = foldMemoryLines(raw);
      expect(f.entries.get(ID(1))!.body).toBe("aaa");
      expect(f.counters.conflicts).toBe(1);
    }
  });

  test("three variants of one (id, seq) → one winner; losers counted", () => {
    const vs = ["c", "a", "b"].map((body) => entry({ body }));
    const f = foldMemoryLines(store(...vs, vs[0]!));
    expect(f.entries.get(ID(1))!.body).toBe("a");
    expect(f.counters.conflicts).toBe(2);
  });

  test("entry and transition sharing (id, seq) conflict like any other pair (R3)", () => {
    const e = entry({ id: ID(1), seq: 4, status: "proposed" });
    const t = transition({ id: ID(1), seq: 4, to: "active" });
    const winner = [JSON.stringify(e), JSON.stringify(t)].sort()[0]!;
    for (const raw of [store(e, t), store(t, e)]) {
      const f = foldMemoryLines(raw);
      expect(f.counters.conflicts).toBe(1);
      if (winner === JSON.stringify(e)) {
        expect(f.entries.get(ID(1))!.status).toBe("proposed");
      } else {
        expect(f.entries.has(ID(1))).toBe(false);
        expect(f.counters.dangling).toBe(1);
      }
    }
  });

  test("transition with reordered keys sorting before an entry of the same (id, seq) wins (R3)", () => {
    // P1 verify gap L3: raw `{"source":…` < `{"v":1,…` in code-unit order → the transition wins,
    // the entry line loses the group and vanishes; the transition then dangles (no target).
    const e = JSON.stringify(entry({ id: ID(1), seq: 4, status: "proposed" }));
    const t = `{"source":{"kind":"human","by":"Kim"},"v":1,"kind":"transition","id":"${ID(1)}","seq":4,"to":"active"}`;
    expect(parseMemoryLine(t)).not.toBeNull();
    expect(t < e).toBe(true);
    for (const raw of [store(e, t), store(t, e)]) {
      const f = foldMemoryLines(raw);
      expect(f.counters.conflicts).toBe(1);
      expect(f.entries.has(ID(1))).toBe(false);
      expect(f.counters.dangling).toBe(1);
      expect(f.maxSeq).toBe(4);
    }
  });

  test("conflict winner uses code-unit order, not locale order", () => {
    // P1 verify gap L1: "B" (0x42) < "a" (0x61) in code units; localeCompare would pick "a".
    const big = entry({ body: "B" });
    const small = entry({ body: "a" });
    expect(JSON.stringify(big) < JSON.stringify(small)).toBe(true);
    expect(JSON.stringify(big).localeCompare(JSON.stringify(small))).toBeGreaterThan(0);
    for (const raw of [store(big, small), store(small, big)]) {
      const f = foldMemoryLines(raw);
      expect(f.entries.get(ID(1))!.body).toBe("B");
      expect(f.counters.conflicts).toBe(1);
    }
  });

  test("only ONE trailing CR is stripped: `X\\r\\r` vs `X` → 1 conflict", () => {
    // P1 verify gap L2: after stripping one CR, `X\r` and `X` are different raws of one (id, seq).
    const x = JSON.stringify(entry());
    for (const raw of [`${x}\r\r\n${x}\n`, `${x}\n${x}\r\r\n`]) {
      const f = foldMemoryLines(raw);
      expect(f.counters.unparseable).toBe(0);
      expect(f.entries.size).toBe(1);
      expect(f.counters.conflicts).toBe(1);
    }
  });

  test("same id entry at a different seq → first (seq, id) wins + conflicts 1", () => {
    const first = entry({ seq: 3, body: "first" });
    const later = entry({ seq: 7, body: "later" });
    for (const raw of [store(first, later), store(later, first)]) {
      const f = foldMemoryLines(raw);
      expect(f.entries.size).toBe(1);
      expect(f.entries.get(ID(1))!.body).toBe("first");
      expect(f.entries.get(ID(1))!.seq).toBe(3);
      expect(f.counters.conflicts).toBe(1);
      expect(f.maxSeq).toBe(7);
    }
  });

  test("hand-edited seq collision between different ids → id tie-break, no error", () => {
    const a = entry({ id: ID(0xa), seq: 5, body: "a" });
    const b = entry({ id: ID(0xb), seq: 5, body: "b" });
    for (const raw of [store(a, b), store(b, a)]) {
      const f = foldMemoryLines(raw);
      expect(visibleIds(f)).toEqual([ID(0xa), ID(0xb)]);
      expect(f.counters).toEqual({ unparseable: 0, conflicts: 0, dangling: 0, archivedRefs: 0 });
    }
  });
});

describe("foldMemoryLines — dangling (D2 · R3 · R5)", () => {
  test("transition on a missing target → dangling, ignored", () => {
    const f = foldMemoryLines(store(entry(), transition({ id: ID(2), seq: 2, to: "retired" })));
    expect(f.counters.dangling).toBe(1);
    expect(f.entries.has(ID(2))).toBe(false);
    expect(f.entries.get(ID(1))!.status).toBe("active");
  });

  test("transition sorted before its entry → dangling", () => {
    const f = foldMemoryLines(
      store(transition({ id: ID(1), seq: 1, to: "active" }), entry({ seq: 2, status: "proposed" })),
    );
    expect(f.counters.dangling).toBe(1);
    expect(f.entries.get(ID(1))!.status).toBe("proposed");
  });

  test("approve on retired → dangling; status stays retired", () => {
    const f = foldMemoryLines(
      store(
        entry({ status: "proposed" }),
        transition({ seq: 2, to: "retired" }),
        transition({ seq: 3, to: "active" }),
      ),
    );
    expect(f.counters.dangling).toBe(1);
    expect(f.entries.get(ID(1))!.status).toBe("retired");
    expect(f.entries.get(ID(1))!.transitions.map((t) => t.seq)).toEqual([2]);
  });

  test("active → active (approve an active entry) → dangling", () => {
    const f = foldMemoryLines(store(entry(), transition({ seq: 2, to: "active" })));
    expect(f.counters.dangling).toBe(1);
    expect(f.entries.get(ID(1))!.status).toBe("active");
    expect(f.entries.get(ID(1))!.transitions).toEqual([]);
  });

  test("retire an already-retired entry → dangling", () => {
    const f = foldMemoryLines(
      store(entry(), transition({ seq: 2, to: "retired" }), transition({ seq: 3, to: "retired" })),
    );
    expect(f.counters.dangling).toBe(1);
    expect(f.entries.get(ID(1))!.status).toBe("retired");
  });

  test("an entry line created as retired accepts no transition", () => {
    const f = foldMemoryLines(store(entry({ status: "retired" }), transition({ seq: 2 })));
    expect(f.counters.dangling).toBe(1);
    expect(f.visibleActive).toEqual([]);
  });

  test("self-supersedes → dangling; the entry stays valid and visible", () => {
    const f = foldMemoryLines(store(entry({ supersedes: ID(1) })));
    expect(f.counters.dangling).toBe(1);
    expect(visibleIds(f)).toEqual([ID(1)]);
    expect(f.entries.get(ID(1))!.hidden).toBe(false);
  });

  test("supersedes a later-sorted target → dangling; target is not hidden", () => {
    const f = foldMemoryLines(
      store(entry({ id: ID(1), seq: 1, supersedes: ID(2) }), entry({ id: ID(2), seq: 2 })),
    );
    expect(f.counters.dangling).toBe(1);
    expect(visibleIds(f)).toEqual([ID(1), ID(2)]);
    expect(f.entries.get(ID(2))!.hidden).toBe(false);
  });

  test("hand-edited cycle X↔Y is cut by sort direction", () => {
    const f = foldMemoryLines(
      store(
        entry({ id: ID(1), seq: 1, supersedes: ID(2) }),
        entry({ id: ID(2), seq: 2, supersedes: ID(1) }),
      ),
    );
    expect(f.counters.dangling).toBe(1);
    expect(visibleIds(f)).toEqual([ID(2)]);
    expect(f.entries.get(ID(1))!.hidden).toBe(true);
  });

  test("same seq: supersedes resolves by id order (smaller id is 'earlier')", () => {
    const ok = foldMemoryLines(
      store(entry({ id: ID(1), seq: 4 }), entry({ id: ID(2), seq: 4, supersedes: ID(1) })),
    );
    expect(ok.counters.dangling).toBe(0);
    expect(visibleIds(ok)).toEqual([ID(2)]);
    const bad = foldMemoryLines(
      store(entry({ id: ID(1), seq: 4, supersedes: ID(2) }), entry({ id: ID(2), seq: 4 })),
    );
    expect(bad.counters.dangling).toBe(1);
    expect(visibleIds(bad)).toEqual([ID(1), ID(2)]);
  });
});

describe("foldMemoryLines — absent supersedes target (R53-M1 · R9)", () => {
  test("no watermark → dangling; entry valid; supersedesArchived false", () => {
    const f = foldMemoryLines(store(entry({ id: ID(5), seq: 5, supersedes: ID(1) })));
    expect(f.counters.dangling).toBe(1);
    expect(f.counters.archivedRefs).toBe(0);
    expect(f.entries.get(ID(5))!.supersedesArchived).toBe(false);
    expect(visibleIds(f)).toEqual([ID(5)]);
  });

  test("watermark present → supersedesArchived + archivedRefs (not dangling)", () => {
    for (const raw of [
      store(watermark(4), entry({ id: ID(5), seq: 5, supersedes: ID(1) })),
      store(entry({ id: ID(5), seq: 5, supersedes: ID(1) }), watermark(4)),
    ]) {
      const f = foldMemoryLines(raw);
      expect(f.counters.dangling).toBe(0);
      expect(f.counters.archivedRefs).toBe(1);
      expect(f.entries.get(ID(5))!.supersedesArchived).toBe(true);
      expect(visibleIds(f)).toEqual([ID(5)]);
    }
  });

  test("watermark present but target sorted later / self → still dangling", () => {
    const f = foldMemoryLines(
      store(
        watermark(1),
        entry({ id: ID(1), seq: 2, supersedes: ID(2) }),
        entry({ id: ID(2), seq: 3 }),
        entry({ id: ID(3), seq: 4, supersedes: ID(3) }),
      ),
    );
    expect(f.counters.dangling).toBe(2);
    expect(f.counters.archivedRefs).toBe(0);
  });

  test("transition on an archived (absent) target with a watermark → dangling", () => {
    const f = foldMemoryLines(store(watermark(3), transition({ id: ID(1), seq: 4 })));
    expect(f.counters.dangling).toBe(1);
    expect(f.counters.archivedRefs).toBe(0);
  });

  test("the watermark itself is never applied as an entry", () => {
    const f = foldMemoryLines(store(watermark(9)));
    expect(f.entries.size).toBe(0);
    expect(f.maxSeq).toBe(9);
  });
});

describe("foldMemoryLines — hiding rule (R5 · R53-M1)", () => {
  const A = () => entry({ id: ID(0xa), seq: 1, body: "A" });

  test("active supersessor hides the target", () => {
    const f = foldMemoryLines(store(A(), entry({ id: ID(0xb), seq: 2, supersedes: ID(0xa) })));
    expect(visibleIds(f)).toEqual([ID(0xb)]);
    expect(f.entries.get(ID(0xa))!.hidden).toBe(true);
    expect(f.entries.get(ID(0xa))!.status).toBe("active");
  });

  test("proposed supersessor does NOT hide the target", () => {
    const f = foldMemoryLines(
      store(A(), entry({ id: ID(0xb), seq: 2, supersedes: ID(0xa), status: "proposed" })),
    );
    expect(visibleIds(f)).toEqual([ID(0xa)]);
    expect(f.entries.get(ID(0xa))!.hidden).toBe(false);
    expect(f.entries.get(ID(0xb))!.everActive).toBe(false);
  });

  test("proposed supersessor hides once approved", () => {
    const f = foldMemoryLines(
      store(
        A(),
        entry({ id: ID(0xb), seq: 2, supersedes: ID(0xa), status: "proposed" }),
        transition({ id: ID(0xb), seq: 3, to: "active" }),
      ),
    );
    expect(visibleIds(f)).toEqual([ID(0xb)]);
  });

  test("retired supersessor still hides (retiring B does not resurrect A)", () => {
    const f = foldMemoryLines(
      store(
        A(),
        entry({ id: ID(0xb), seq: 2, supersedes: ID(0xa) }),
        transition({ id: ID(0xb), seq: 3, to: "retired" }),
      ),
    );
    expect(visibleIds(f)).toEqual([]);
    expect(f.entries.get(ID(0xa))!.hidden).toBe(true);
    expect(f.entries.get(ID(0xb))!.status).toBe("retired");
  });

  test("rejected proposal (proposed → retired) never hides its target — everActive false", () => {
    const f = foldMemoryLines(
      store(
        A(),
        entry({ id: ID(0xb), seq: 2, supersedes: ID(0xa), status: "proposed" }),
        transition({ id: ID(0xb), seq: 3, to: "retired" }),
      ),
    );
    expect(f.entries.get(ID(0xb))!.status).toBe("retired");
    expect(f.entries.get(ID(0xb))!.everActive).toBe(false);
    expect(f.entries.get(ID(0xa))!.hidden).toBe(false);
    expect(visibleIds(f)).toEqual([ID(0xa)]);
  });

  test("approved-then-retired supersessor still hides — everActive true", () => {
    const f = foldMemoryLines(
      store(
        A(),
        entry({ id: ID(0xb), seq: 2, supersedes: ID(0xa), status: "proposed" }),
        transition({ id: ID(0xb), seq: 3, to: "active" }),
        transition({ id: ID(0xb), seq: 4, to: "retired" }),
      ),
    );
    expect(f.entries.get(ID(0xb))!.status).toBe("retired");
    expect(f.entries.get(ID(0xb))!.everActive).toBe(true);
    expect(f.entries.get(ID(0xa))!.hidden).toBe(true);
    expect(visibleIds(f)).toEqual([]);
  });

  test("everActive: active line → true; proposed line → false until an applied approve", () => {
    const f = foldMemoryLines(
      store(
        entry({ id: ID(1), seq: 1 }),
        entry({ id: ID(2), seq: 2, status: "proposed" }),
        entry({ id: ID(3), seq: 3, status: "proposed" }),
        transition({ id: ID(3), seq: 4, to: "active" }),
        entry({ id: ID(4), seq: 5, status: "retired" }),
        // dangling approve (sorted before its entry) does not count
        transition({ id: ID(5), seq: 6, to: "active" }),
        entry({ id: ID(5), seq: 7, status: "proposed" }),
      ),
    );
    const ever = (n: number) => f.entries.get(ID(n))!.everActive;
    expect([ever(1), ever(2), ever(3), ever(4), ever(5)]).toEqual([
      true,
      false,
      true,
      false,
      false,
    ]);
    expect(f.counters.dangling).toBe(1);
  });

  test("chain A ← B ← C: only C visible; retiring C keeps A and B hidden", () => {
    const chain = [
      A(),
      entry({ id: ID(0xb), seq: 2, supersedes: ID(0xa) }),
      entry({ id: ID(0xc), seq: 3, supersedes: ID(0xb) }),
    ];
    const f1 = foldMemoryLines(store(...chain));
    expect(visibleIds(f1)).toEqual([ID(0xc)]);
    const f2 = foldMemoryLines(store(...chain, transition({ id: ID(0xc), seq: 4, to: "retired" })));
    expect(visibleIds(f2)).toEqual([]);
    expect(f2.entries.get(ID(0xa))!.hidden).toBe(true);
    expect(f2.entries.get(ID(0xb))!.hidden).toBe(true);
  });

  test("dangling supersedes (later-sorted) never hides", () => {
    const f = foldMemoryLines(
      store(entry({ id: ID(0xb), seq: 1, supersedes: ID(0xa) }), entry({ id: ID(0xa), seq: 2 })),
    );
    expect(f.entries.get(ID(0xa))!.hidden).toBe(false);
    expect(visibleIds(f)).toEqual([ID(0xb), ID(0xa)]);
  });

  test("hidden active is not visible but keeps its status", () => {
    const f = foldMemoryLines(store(A(), entry({ id: ID(0xb), seq: 2, supersedes: ID(0xa) })));
    expect(f.entries.get(ID(0xa))!.status).toBe("active");
    expect(f.visibleActive.some((e) => e.id === ID(0xa))).toBe(false);
  });
});

describe("foldMemoryLines — unparseable anywhere · CRLF · maxSeq (D2 · class 2 · class 4)", () => {
  test("unparseable middle line and torn last line are both counted; others intact", () => {
    const raw = `${JSON.stringify(entry({ id: ID(1), seq: 1 }))}\nnot json at all\n${JSON.stringify(
      entry({ id: ID(2), seq: 2 }),
    )}\n{"v":1,"kind":"entry","id":"mem_00`;
    const f = foldMemoryLines(raw);
    expect(f.counters.unparseable).toBe(2);
    expect(visibleIds(f)).toEqual([ID(1), ID(2)]);
  });

  test("unparseable first line counted too", () => {
    const f = foldMemoryLines(store("{oops", entry()));
    expect(f.counters.unparseable).toBe(1);
    expect(f.entries.size).toBe(1);
  });

  test("CRLF file folds exactly like the LF file", () => {
    const lines = [
      entry({ id: ID(1), seq: 1, status: "proposed" }),
      transition({ id: ID(1), seq: 2 }),
      entry({ id: ID(2), seq: 3, supersedes: ID(1) }),
      watermark(1),
    ].map((o) => JSON.stringify(o));
    const lf = foldMemoryLines(`${lines.join("\n")}\n`);
    const crlf = foldMemoryLines(`${lines.join("\r\n")}\r\n`);
    expect(crlf.counters).toEqual(lf.counters);
    expect(crlf.maxSeq).toBe(lf.maxSeq);
    expect([...crlf.entries.entries()]).toEqual([...lf.entries.entries()]);
    expect(crlf.visibleActive).toEqual(lf.visibleActive);
    expect(crlf.counters.unparseable).toBe(0);
  });

  test("an LF copy and a CRLF copy of one line are identical (no conflict)", () => {
    const l = JSON.stringify(entry());
    const f = foldMemoryLines(`${l}\r\n${l}\n`);
    expect(f.counters.conflicts).toBe(0);
    expect(f.entries.size).toBe(1);
  });

  test("blank lines (incl. bare CR) are ignored, not unparseable", () => {
    const l = JSON.stringify(entry());
    const f = foldMemoryLines(`\n\r\n${l}\n\n\r\n`);
    expect(f.counters.unparseable).toBe(0);
    expect(f.entries.size).toBe(1);
  });

  test("maxSeq = max over all parsed lines incl. watermark, transitions, conflict losers", () => {
    expect(foldMemoryLines(store(entry({ seq: 3 }), watermark(10))).maxSeq).toBe(10);
    expect(foldMemoryLines(store(watermark(2), entry({ seq: 3 }))).maxSeq).toBe(3);
    expect(foldMemoryLines(store(entry(), transition({ id: ID(9), seq: 7 }))).maxSeq).toBe(7);
    expect(
      foldMemoryLines(store(entry({ seq: 2, body: "a" }), entry({ seq: 8, body: "b" }))).maxSeq,
    ).toBe(8);
  });

  test("maxSeq ignores seq on unparseable lines", () => {
    const f = foldMemoryLines(store(entry({ seq: 2 }), entry({ id: ID(2), seq: 99, v: 2 })));
    expect(f.maxSeq).toBe(2);
    expect(f.counters.unparseable).toBe(1);
    expect(foldMemoryLines(store(entry({ seq: 99, v: 2 }))).maxSeq).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------
// (b) shuffle invariance — fixed-seed PRNG store, 200 permutations (D2 · Done-when (b))
// ---------------------------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildShuffleStore(rand: () => number): string[] {
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const types = ["fact", "decision", "preference"] as const;
  const scopes = ["project", ROOM, "room:fedcba9876543210"] as const;
  const ids = Array.from({ length: 30 }, (_, i) => ID(0x1000 + i * 7919));
  const missing = [ID(0xdead01), ID(0xdead02), ID(0xdead03)];
  const lines: string[] = [];
  const L = (o: Obj) => lines.push(JSON.stringify(o));

  // 30 entries; seqs drawn from a small range so (seq, id) ties happen
  ids.forEach((id, i) => {
    const r = rand();
    let supersedes: string | null = null;
    if (i > 0 && r < 0.35)
      supersedes = ids[int(0, i - 1)]!; // earlier id (may be later seq)
    else if (r < 0.42)
      supersedes = pick(missing); // absent → archivedRefs (watermark present)
    else if (r < 0.47)
      supersedes = id; // self → dangling
    else if (i < ids.length - 1 && r < 0.52) supersedes = ids[int(i + 1, ids.length - 1)]!;
    L(
      entry({
        id,
        seq: int(1, 40),
        type: pick(types),
        appliesTo: pick(scopes),
        body: `body ${i} ${rand().toString(36).slice(2, 8)}\nsecond line`,
        status: rand() < 0.6 ? "active" : "proposed",
        supersedes,
      }),
    );
  });
  // 16 transitions: real and missing targets, approve and retire, any seq
  for (let i = 0; i < 16; i++) {
    L(
      transition({
        id: rand() < 0.85 ? pick(ids) : pick(missing),
        seq: int(1, 60),
        to: rand() < 0.5 ? "active" : "retired",
      }),
    );
  }
  // conflicts: same (id, seq) different raw ×3, same id other seq ×2
  for (let i = 0; i < 3; i++) {
    const o = JSON.parse(lines[int(0, 29)]!) as Obj;
    L({ ...o, body: `${o.body as string} (conflicting copy ${i})` });
  }
  for (let i = 0; i < 2; i++) {
    const o = JSON.parse(lines[int(0, 29)]!) as Obj;
    L({ ...o, seq: (o.seq as number) + 41 + i, body: `dup id ${i}` });
  }
  // identical copies ×4 (entries and transitions)
  for (let i = 0; i < 4; i++) lines.push(lines[int(0, 45)]!);
  // watermarks (two, as a hand-merged store might have)
  L(watermark(12));
  L(watermark(3));
  // fixed hiding cases: rejected proposal (does not hide) · approved-then-retired (hides)
  L(entry({ id: ID(0xe0), seq: 70, body: "kept" }));
  L(entry({ id: ID(0xe1), seq: 71, supersedes: ID(0xe0), status: "proposed", body: "rejected" }));
  L(transition({ id: ID(0xe1), seq: 72, to: "retired" }));
  L(entry({ id: ID(0xf0), seq: 73, body: "replaced" }));
  L(entry({ id: ID(0xf1), seq: 74, supersedes: ID(0xf0), status: "proposed", body: "edit" }));
  L(transition({ id: ID(0xf1), seq: 75, to: "active" }));
  L(transition({ id: ID(0xf1), seq: 76, to: "retired" }));
  // reordered-key transition sorting before an entry of the same (id, seq) — transition wins,
  // the entry vanishes, the transition dangles (P1 verify gap L3; consumes no randomness)
  L(entry({ id: ID(0xd0), seq: 80, body: "loses to transition" }));
  lines.push(
    `{"source":{"kind":"human","by":"Kim"},"v":1,"kind":"transition","id":"${ID(0xd0)}","seq":80,"to":"retired"}`,
  );
  // unparseable ×5 (garbage, v:2, unknown kind, bad field, torn)
  lines.push("garbage line");
  L(entry({ id: ID(0xbad1), seq: 500, v: 2 }));
  L({ v: 1, kind: "note", id: ID(0xbad2), seq: 501 });
  L(entry({ id: ID(0xbad3), seq: 502, appliesTo: "person:kim" }));
  lines.push('{"v":1,"kind":"entry","id":"mem_00000000000');
  // blank and CRLF-terminated lines
  lines.push("");
  lines.push(`${JSON.stringify(entry({ id: ID(0xc0ffee), seq: 33, body: "crlf" }))}\r`);
  return lines;
}

/** Canonical, order-free projection of a fold (visible list · every entry · counters · maxSeq). */
function canonical(f: MemoryFold): string {
  const entries = [...f.entries.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return JSON.stringify({
    visibleActive: f.visibleActive,
    entries,
    mapKeys: [...f.entries.keys()].sort(),
    counters: f.counters,
    maxSeq: f.maxSeq,
  });
}

describe("foldMemoryLines — shuffle invariance (Done-when (b))", () => {
  test("200 permutations of a fixed-seed ≥60-line store fold identically", () => {
    const rand = mulberry32(0x3501);
    const lines = buildShuffleStore(rand);
    expect(lines.length).toBeGreaterThanOrEqual(60);

    const base = foldMemoryLines(`${lines.join("\n")}\n`);
    // the store really exercises every path
    expect(base.counters.unparseable).toBe(5);
    expect(base.counters.conflicts).toBeGreaterThanOrEqual(5);
    expect(base.counters.dangling).toBeGreaterThan(0);
    expect(base.counters.archivedRefs).toBeGreaterThan(0);
    expect(base.visibleActive.length).toBeGreaterThan(0);
    expect([...base.entries.values()].some((e) => e.hidden)).toBe(true);
    expect([...base.entries.values()].some((e) => e.status === "retired")).toBe(true);
    expect([...base.entries.values()].some((e) => e.status === "proposed")).toBe(true);
    expect(base.maxSeq).toBeGreaterThanOrEqual(41);
    expect(base.entries.get(ID(0xe0))!.hidden).toBe(false);
    expect(base.entries.get(ID(0xe1))!.everActive).toBe(false);
    expect(base.visibleActive.some((e) => e.id === ID(0xe0))).toBe(true);
    expect(base.entries.get(ID(0xf0))!.hidden).toBe(true);
    expect(base.entries.get(ID(0xf1))!.everActive).toBe(true);
    expect(base.entries.has(ID(0xd0))).toBe(false);
    const want = canonical(base);

    const shuffle = mulberry32(0xb0b);
    for (let p = 0; p < 200; p++) {
      const perm = [...lines];
      for (let i = perm.length - 1; i > 0; i--) {
        const j = Math.floor(shuffle() * (i + 1));
        [perm[i], perm[j]] = [perm[j]!, perm[i]!];
      }
      const raw = p % 2 === 0 ? `${perm.join("\n")}\n` : perm.join("\n");
      const f = foldMemoryLines(raw);
      expect(canonical(f)).toBe(want);
    }
  });
});
