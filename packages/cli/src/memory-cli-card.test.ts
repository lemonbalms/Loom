/**
 * PLAN 0.38.0 P4 — CLI card-source display · `list --source` · header K · D16' `LOOM_CARD` refusal
 * (D8 · D14 · D16' · R16 · R17 · R56-M3 · R56-L4(d)). Done-when (h).
 *
 * In-process tests inject deps like `memory-cli.test.ts` (fresh mkdtemp loomDir per test). Card
 * entries are written through the host store (`appendMemoryEntriesAsync` + `cardMemorySource`),
 * never hand-written JSON. Run with HOME and LOOM_TEST_HOME pointing at a temp dir.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, lstatSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendMemoryEntriesAsync,
  appendMemoryTransition,
  cardMemorySource,
  compactMemory,
  foldMemoryLines,
  humanMemorySource,
  type MemoryEntryType,
  memoryPaths,
  roomKey,
} from "@loom/host";
import { type MemoryCliDeps, runMemoryCommand } from "./memory-cli";

const ID = (n: number) => `mem_${n.toString(16).padStart(16, "0")}`;
const AGENT = "claude.default";
const CARD = "c".repeat(16);
const HANDOFF = "d".repeat(16);
const BY = "claude-impl";
const REFUSAL =
  "loom memory: refused — LOOM_CARD is set (this shell belongs to a Loom card worker); memory writes go through card proposals. Unset LOOM_CARD to write deliberately.";
const SOURCE_USAGE = "loom memory: --source must be a source kind (e.g. human, card)";

let L: string;

beforeEach(() => {
  L = mkdtempSync(join(tmpdir(), "loom-memcli-card-"));
});

afterEach(() => {
  rmSync(L, { recursive: true, force: true });
});

function counterIds(start: number): () => string {
  let n = start;
  return () => ID(++n);
}

type Run = { code: number; out: string[]; err: string[] };

function session(over: Partial<MemoryCliDeps> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const deps: MemoryCliDeps = {
    loomDir: L,
    profile: "default",
    profileSource: "default",
    displayName: "Kim",
    env: {},
    randomId: counterIds(0xa000),
    now: () => new Date("2026-10-18T12:00:00.000Z"),
    stdout: (l) => out.push(l),
    stderr: (l) => err.push(l),
    skillsEnabled: () => null,
    ...over,
  };
  const call = async (
    verb: string,
    positional: string[] = [],
    flags: Record<string, string | boolean> = {},
    passthrough: string[] = [],
  ): Promise<Run> => {
    out.length = 0;
    err.length = 0;
    const code = await runMemoryCommand(verb, { positional, passthrough }, flags, deps);
    return { code, out: [...out], err: [...err] };
  };
  return { deps, call };
}

const cardIds = counterIds(0xc000);

/** One card attempt's candidates through the host store (P1). */
async function proposeCard(
  bodies: readonly string[],
  opts: {
    room?: string;
    attempt?: 1 | 2;
    handoff?: string;
    type?: MemoryEntryType;
    agent?: string;
  } = {},
): Promise<string[]> {
  const rk = roomKey(opts.room ?? "r1");
  const r = await appendMemoryEntriesAsync(
    L,
    opts.agent ?? AGENT,
    {
      source: cardMemorySource({
        room: rk,
        card: CARD,
        handoff: opts.handoff ?? HANDOFF,
        attempt: opts.attempt ?? 1,
        by: BY,
      }),
      appliesTo: `room:${rk}`,
      candidates: bodies.map((body) => ({ type: opts.type ?? "fact", body })),
    },
    { env: {}, randomId: cardIds, now: () => new Date("2026-10-18T12:00:00.000Z") },
  );
  expect(r.proposed).toBe(bodies.length);
  return r.ids;
}

const entriesPath = () => memoryPaths(L, AGENT).entries;
const seqOf = (id: string): number => {
  const e = foldMemoryLines(readFileSync(entriesPath(), "utf8")).entries.get(id);
  if (!e) throw new Error(`no entry ${id}`);
  return e.seq;
};
const rowLines = (out: readonly string[]) => out.filter((l) => l.startsWith("  mem_"));

/** Every path under `root` (lstat — names, kinds, sizes, mtimes; `*.lock` dirs included). */
function snapshotTree(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, rel: string) => {
    for (const name of readdirSync(dir).sort()) {
      const p = join(dir, name);
      const r = rel ? `${rel}/${name}` : name;
      const st = lstatSync(p);
      const kind = st.isSymbolicLink() ? "link" : st.isDirectory() ? "dir" : "file";
      out.push(`${r} ${kind} ${kind === "file" ? st.size : "-"} ${st.mtimeMs}`);
      if (kind === "dir") walk(p, r);
    }
  };
  walk(root, "");
  return out;
}

describe("memory list — card rows (D8 · R16 · R56-M3)", () => {
  test("card row gets the [card by X] suffix · human row stays 0.37 bytes", async () => {
    const s = session();
    await s.call("add", ["human fact"], { agent: "claude" }); // a001 seq1
    const [cid] = await proposeCard(["short card fact"]);
    const rk = roomKey("r1");
    const r = await s.call("list", [], { agent: "claude" });
    expect(r.code).toBe(0);
    expect(rowLines(r.out)).toEqual([
      `  ${ID(0xa001)}  active  fact  project  seq 1  human fact`,
      `  ${cid}  proposed  fact  room:${rk}  seq ${seqOf(cid as string)}  short card fact  [card by ${BY}]`,
    ]);
  });

  test("body > 80 chars → `+<n> chars — loom memory show <id>` suffix", async () => {
    const s = session();
    const body = "x".repeat(100);
    const [cid] = await proposeCard([body]);
    const rk = roomKey("r1");
    const r = await s.call("list", [], { agent: "claude" });
    expect(rowLines(r.out)).toEqual([
      `  ${cid}  proposed  fact  room:${rk}  seq ${seqOf(cid as string)}  ${"x".repeat(80)}  [card by ${BY} · +20 chars — loom memory show ${cid}]`,
    ]);
  });

  test("multi-line card body → n counts every hidden code point", async () => {
    const s = session();
    const body = "line one\nline two 😀";
    const [cid] = await proposeCard([body]);
    const rk = roomKey("r1");
    const r = await s.call("list", [], { agent: "claude" });
    // 8 + 1 + 10 code points − 8 shown = 11
    expect(rowLines(r.out)).toEqual([
      `  ${cid}  proposed  fact  room:${rk}  seq ${seqOf(cid as string)}  line one  [card by ${BY} · +11 chars — loom memory show ${cid}]`,
    ]);
  });

  test("human body > 80 chars keeps the 0.37 row (no suffix)", async () => {
    const s = session();
    await s.call("add", ["z".repeat(100)], { agent: "claude" });
    const r = await s.call("list", [], { agent: "claude" });
    expect(rowLines(r.out)).toEqual([
      `  ${ID(0xa001)}  active  fact  project  seq 1  ${"z".repeat(80)}`,
    ]);
  });
});

describe("memory list — header K (D14)", () => {
  test("K > 0 → header right after the profile line", async () => {
    const s = session();
    await proposeCard(["one", "two"]);
    const r = await s.call("list", [], { agent: "claude" });
    expect(r.out[0]).toBe("profile default (from default)");
    expect(r.out[1]).toBe("memory: 2 card proposals awaiting review");
  });

  test("K > 0 with memoryEnabled → header after the `memory: worker.memory.enabled` line", async () => {
    const s = session({ memoryEnabled: () => true });
    await proposeCard(["one"]);
    const r = await s.call("list", [], { agent: "claude" });
    expect(r.out.slice(0, 3)).toEqual([
      "profile default (from default)",
      "memory: worker.memory.enabled = true (profile default)",
      "memory: 1 card proposals awaiting review",
    ]);
  });

  test("K = 0 → no header (human proposed only · approved card)", async () => {
    const s = session();
    await s.call("propose", ["human idea"], { agent: "claude" });
    const none = await s.call("list", [], { agent: "claude" });
    expect(none.out.some((l) => l.includes("card proposals awaiting review"))).toBe(false);
    const [cid] = await proposeCard(["card idea"]);
    expect((await s.call("list", [], { agent: "claude" })).out[1]).toBe(
      "memory: 1 card proposals awaiting review",
    );
    expect((await s.call("approve", [cid as string], { agent: "claude" })).code).toBe(0);
    const after = await s.call("list", [], { agent: "claude" });
    expect(after.out.some((l) => l.includes("card proposals awaiting review"))).toBe(false);
  });

  test("K sums every listed agent", async () => {
    const s = session();
    await proposeCard(["a", "b"]);
    await proposeCard(["c"], { agent: "codex.default", room: "r2" });
    const r = await s.call("list", [], {});
    expect(r.out[1]).toBe("memory: 3 card proposals awaiting review");
    const claude = await s.call("list", [], { agent: "claude" });
    expect(claude.out[1]).toBe("memory: 2 card proposals awaiting review");
    const codex = await s.call("list", [], { agent: "codex" });
    expect(codex.out[1]).toBe("memory: 1 card proposals awaiting review");
  });

  test("K ignores --room / --source row filters (whole stores of the listed agents)", async () => {
    const s = session();
    await s.call("add", ["human fact"], { agent: "claude" });
    await proposeCard(["a", "b"]);
    await proposeCard(["c"], { agent: "codex.default", room: "r2" });
    const K = "memory: 3 card proposals awaiting review";
    const filters: Record<string, string>[] = [
      { room: "r2" },
      { room: "r9" },
      { source: "human" },
      { source: "card", room: "r1" },
    ];
    for (const f of filters) {
      const r = await s.call("list", [], f);
      expect(r.code).toBe(0);
      expect(r.out[1]).toBe(K);
    }
  });
});

describe("memory list --source (D8)", () => {
  test("--source card / --source human filter rows (AND with --room)", async () => {
    const s = session();
    await s.call("add", ["human fact"], { agent: "claude" });
    const [cid] = await proposeCard(["card fact"]);
    const card = await s.call("list", [], { agent: "claude", source: "card" });
    expect(card.code).toBe(0);
    expect(rowLines(card.out).map((l) => l.trim().split("  ")[0])).toEqual([cid as string]);
    const human = await s.call("list", [], { agent: "claude", source: "human" });
    expect(rowLines(human.out).map((l) => l.trim().split("  ")[0])).toEqual([ID(0xa001)]);
    const other = await s.call("list", [], { agent: "claude", source: "card", room: "r2" });
    expect(rowLines(other.out)).toEqual([]);
  });

  for (const bad of ["Card", "", "card!", "-x", true] as const) {
    test(`bad kind ${JSON.stringify(bad)} → usage exit 1`, async () => {
      const s = session();
      const r = await s.call("list", [], { agent: "claude", source: bad });
      expect(r).toEqual({ code: 1, out: [], err: [SOURCE_USAGE] });
    });
  }

  test("--json keeps the 0.37 key set · --source filters its entries", async () => {
    const s = session();
    await s.call("add", ["human fact"], { agent: "claude" });
    const plain = JSON.parse(
      (await s.call("list", [], { agent: "claude", json: true })).out[0] as string,
    );
    const [cid] = await proposeCard(["card fact"]);
    const withCard = JSON.parse(
      (await s.call("list", [], { agent: "claude", json: true })).out[0] as string,
    );
    expect(Object.keys(withCard).sort()).toEqual(Object.keys(plain).sort());
    expect(Object.keys(withCard.agents[0]).sort()).toEqual(Object.keys(plain.agents[0]).sort());
    expect(Object.keys(withCard.agents[0].entries[1]).sort()).toEqual(
      Object.keys(plain.agents[0].entries[0]).sort(),
    );
    expect(withCard.agents[0].entries[1].source).toEqual({
      kind: "card",
      room: roomKey("r1"),
      card: CARD,
      handoff: HANDOFF,
      attempt: 1,
      by: BY,
    });
    const filtered = JSON.parse(
      (await s.call("list", [], { agent: "claude", json: true, source: "card" })).out[0] as string,
    );
    expect(filtered.agents[0].entries.map((e: { id: string }) => e.id)).toEqual([cid]);
  });
});

describe("memory show — origin line (R56-L4(d))", () => {
  test("card source → last line `  origin: …`", async () => {
    const s = session();
    const [cid] = await proposeCard(["card fact"], { attempt: 2 });
    const r = await s.call("show", [cid as string], { agent: "claude" });
    expect(r.code).toBe(0);
    expect(r.out.at(-1)).toBe(
      `  origin: card · by ${BY} · room ${roomKey("r1")} · card ${CARD} · attempt 2`,
    );
    expect(r.out.filter((l) => l.startsWith("  origin:"))).toHaveLength(1);
  });

  test("human source → no origin line", async () => {
    const s = session();
    await s.call("add", ["human fact"], { agent: "claude" });
    const r = await s.call("show", [ID(0xa001)], { agent: "claude" });
    expect(r.code).toBe(0);
    expect(r.out.some((l) => l.startsWith("  origin:"))).toBe(false);
    expect(r.out.at(-1)).toBe("    human fact");
  });
});

describe("memory approve — activated line (R56-M3)", () => {
  test("card source → `activated:` with the full body (> 80 chars)", async () => {
    const s = session();
    const body = "y".repeat(120);
    const [cid] = await proposeCard([body]);
    const seq = seqOf(cid as string);
    const r = await s.call("approve", [cid as string], { agent: "claude" });
    expect(r).toEqual({
      code: 0,
      out: [
        `approved ${cid} (seq ${seq + 1})`,
        `activated: fact room:${roomKey("r1")} — ${body} (source card by ${BY})`,
      ],
      err: [],
    });
  });

  test("card source, multi-line body → printed as-is", async () => {
    const s = session();
    const body = "first\nsecond line";
    const [cid] = await proposeCard([body], { type: "decision" });
    const seq = seqOf(cid as string);
    const r = await s.call("approve", [cid as string], { agent: "claude" });
    expect(r.out).toEqual([
      `approved ${cid} (seq ${seq + 1})`,
      `activated: decision room:${roomKey("r1")} — ${body} (source card by ${BY})`,
    ]);
  });

  // Verify 0045 M: the stdout callback runs after the transition released its lock and before the
  // `activated:` line — the deterministic injection point for a racing writer / failing reader.
  async function approveWithHook(onApproved: (cid: string) => void, failActivated = false) {
    const lines: string[] = [];
    const [first] = await proposeCard(["raced card fact"]);
    const cid = first as string;
    const s = session({
      stdout: (l) => {
        if (l.startsWith("activated:") && failActivated) throw new Error("EPIPE");
        lines.push(l);
        if (l.startsWith("approved ")) onApproved(cid);
      },
    });
    const seq = seqOf(cid);
    const r = await s.call("approve", [cid], { agent: "claude" });
    return { r, lines, cid, seq };
  }

  const activatedLine = `activated: fact room:${roomKey("r1")} — raced card fact (source card by ${BY})`;

  test("retire + compact of the same id racing before the print cannot hide the line", async () => {
    const { r, lines, cid, seq } = await approveWithHook((id) => {
      const t = appendMemoryTransition(L, AGENT, {
        id,
        to: "retired",
        source: humanMemorySource("Other"),
      });
      expect(t.ok).toBe(true);
      expect(compactMemory(L, AGENT).ok).toBe(true);
      expect(foldMemoryLines(readFileSync(entriesPath(), "utf8")).entries.has(id)).toBe(false);
    });
    expect(r).toEqual({ code: 0, out: [], err: [] });
    expect(lines).toEqual([`approved ${cid} (seq ${seq + 1})`, activatedLine]);
  });

  test("store unreadable after a successful approve → exit 0 · approved + activated lines", async () => {
    const { r, lines, cid, seq } = await approveWithHook(() => chmodSync(entriesPath(), 0o000));
    chmodSync(entriesPath(), 0o600);
    expect(r).toEqual({ code: 0, out: [], err: [] });
    expect(lines).toEqual([`approved ${cid} (seq ${seq + 1})`, activatedLine]);
  });

  test("printing the activated line throws → exit 0 · approved line kept", async () => {
    const { r, lines, cid, seq } = await approveWithHook(() => {}, true);
    expect(r).toEqual({ code: 0, out: [], err: [] });
    expect(lines).toEqual([`approved ${cid} (seq ${seq + 1})`]);
  });

  test("human source → only the 0.37 `approved` line", async () => {
    const s = session();
    await s.call("propose", ["human idea"], { agent: "claude" });
    const r = await s.call("approve", [ID(0xa001)], { agent: "claude" });
    expect(r).toEqual({ code: 0, out: [`approved ${ID(0xa001)} (seq 2)`], err: [] });
  });
});

describe("D16' — LOOM_CARD refuses memory writes (R17)", () => {
  async function seeded() {
    const s = session();
    await s.call("add", ["human fact"], { agent: "claude" }); // a001
    await s.call("add", ["to retire"], { agent: "claude" }); // a002
    await s.call("retire", [ID(0xa002)], { agent: "claude" });
    const [cid] = await proposeCard(["card fact"]);
    return { s, cid: cid as string };
  }

  const writes: readonly [string, (cid: string) => string[]][] = [
    ["add", () => ["new fact"]],
    ["propose", () => ["new idea"]],
    ["approve", (cid) => [cid]],
    ["retire", () => [ID(0xa001)]],
    ["compact", () => []],
  ];

  for (const [verb, pos] of writes) {
    test(`${verb} → exit 1 · wording · store tree + entries.jsonl bytes unchanged`, async () => {
      const { s, cid } = await seeded();
      const before = readFileSync(entriesPath());
      const tree = snapshotTree(L);
      expect(tree.some((l) => l.startsWith("memory/claude.default/entries.jsonl file"))).toBe(true);
      s.deps.env = { LOOM_CARD: "x" };
      const r = await s.call(verb, pos(cid), { agent: "claude" });
      expect(r).toEqual({ code: 1, out: [], err: [REFUSAL] });
      expect(readFileSync(entriesPath()).equals(before)).toBe(true);
      expect(snapshotTree(L)).toEqual(tree);
    });

    test(`${verb} in a fresh loomDir → exit 1 · no store directory or file created`, async () => {
      const s = session({ env: { LOOM_CARD: "x" } });
      const r = await s.call(verb, pos(ID(0xa001)), { agent: "claude" });
      expect(r).toEqual({ code: 1, out: [], err: [REFUSAL] });
      expect(snapshotTree(L)).toEqual([]);
    });
  }

  test("refused before argument parsing (bad --agent still gets the refusal)", async () => {
    const s = session({ env: { LOOM_CARD: "card-1" } });
    expect(await s.call("add", [], {})).toEqual({ code: 1, out: [], err: [REFUSAL] });
  });

  test("list · show still work under LOOM_CARD", async () => {
    const { s, cid } = await seeded();
    s.deps.env = { LOOM_CARD: "x" };
    const l = await s.call("list", [], { agent: "claude" });
    expect(l.code).toBe(0);
    expect(l.err).toEqual([]);
    expect(rowLines(l.out)).toHaveLength(2);
    const sh = await s.call("show", [cid], { agent: "claude" });
    expect(sh.code).toBe(0);
    expect(sh.out[0]).toBe(cid);
  });

  test("unknown verb under LOOM_CARD → the usual usage line", async () => {
    const s = session({ env: { LOOM_CARD: "x" } });
    const r = await s.call("bogus", [], {});
    expect(r.code).toBe(1);
    expect(r.err).toEqual([
      "loom memory: usage: loom memory add|propose|list|show|approve|retire|compact [--agent claude|codex|grok] [--room <roomId>] …",
    ]);
  });

  test('LOOM_CARD="" → writes proceed normally', async () => {
    const s = session({ env: { LOOM_CARD: "" } });
    const r = await s.call("add", ["ok"], { agent: "claude" });
    expect(r.code).toBe(0);
    expect(r.out[0]).toStartWith(`added ${ID(0xa001)} (active, seq 1)`);
  });
});
