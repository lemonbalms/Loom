/**
 * PLAN 0.38.0 P1 — card memory candidates → store (D9 · D10 · D11 · D12 · R2 · R8 · R10 · R11 ·
 * R12 · R18 · R56-L1 · R56-M2).
 * Done-when (a): one batch → N `proposed` lines in one append (one fsync) · `supersedes: null` ·
 * room `appliesTo` · `source` shape (R2 · ≤1024 B · `by` cut at 64 · surrogate pair) · filter table
 * (invalid · marker · secret — with the false-positive controls R8/R56-L1 keep) · the four caps ·
 * dedupe (main store · archive after compact · other handoff · archive tail 4 MiB — R56-M2) ·
 * lock budget (live owner → `busy` inside ≤250 ms + slack, event loop not blocked · stale reclaim).
 * The CLI ↔ bridge cross-process contention lives in `memory-lock-contention.test.ts` (D12).
 * New symbols are reached through the module namespace so a missing export fails per test.
 * Every store lives under a fresh mkdtemp loomDir; run with HOME = LOOM_TEST_HOME = temp (R22).
 */
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import * as fs from "node:fs";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as lock from "./atomic-json";
import * as store from "./memory-store";
import {
  appendMemoryEntry,
  appendMemoryTransition,
  compactMemory,
  foldMemoryLines,
  humanMemorySource,
  MEMORY_ENTRIES_MAX_BYTES,
  type MemorySource,
  memoryPaths,
} from "./memory-store";

const AGENT = "claude.default";
const ID = (n: number) => `mem_${n.toString(16).padStart(16, "0")}`;
const ROOMK = "0123456789abcdef";
const APPLIES = `room:${ROOMK}` as const;
const OTHER_ROOMK = "aaaaaaaaaaaaaaaa";
const CARD = "fedcba9876543210";
const H1 = "1111111111111111";
const H2 = "2222222222222222";
const ARCHIVE_TAIL = 4 * 1024 * 1024;
const BUDGET_SLACK_MS = 400;

type Obj = Record<string, unknown>;
type Cand = { type: "fact" | "decision" | "preference"; body: string };
type Drops = { secret: number; marker: number; cap: number; busy: number; dup: number; invalid: number };
type Result = { proposed: number; ids: string[]; dropped: Drops; skipped?: "dup" };

const NO_DROPS: Drops = { secret: 0, marker: 0, cap: 0, busy: 0, dup: 0, invalid: 0 };

let L: string;

beforeEach(() => {
  L = mkdtempSync(join(tmpdir(), "loom-mem-async-"));
});

afterEach(() => {
  rmSync(L, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------------------------
// helpers — new symbols via the namespace (red: "not a function" per test)
// ---------------------------------------------------------------------------------------------

function cardSource(over: Partial<{ room: string; card: string; handoff: string; attempt: 1 | 2; by: string }> = {}): MemorySource {
  const fn = (store as unknown as Obj).cardMemorySource as (x: unknown) => MemorySource;
  return fn({ room: ROOMK, card: CARD, handoff: H1, attempt: 1, by: "claude-impl", ...over });
}

function propose(
  candidates: readonly Cand[],
  over: { source?: MemorySource; appliesTo?: string; env?: Record<string, string | undefined>; budgetMs?: number; agentKey?: string } = {},
): Promise<Result> {
  const fn = (store as unknown as Obj).appendMemoryEntriesAsync as (
    loomDir: string,
    agentKey: string,
    batch: unknown,
    deps: unknown,
  ) => Promise<Result>;
  let n = 0xc000;
  return fn(
    L,
    over.agentKey ?? AGENT,
    { source: over.source ?? cardSource(), appliesTo: over.appliesTo ?? APPLIES, candidates },
    {
      env: over.env ?? {},
      ...(over.budgetMs !== undefined ? { budgetMs: over.budgetMs } : {}),
      randomId: () => ID(++n),
      now: () => new Date("2026-10-17T12:00:00.000Z"),
    },
  );
}

function withLockAsync<T>(file: string, budgetMs: number, fn: () => T): Promise<{ ok: true; value: T } | { ok: false }> {
  const f = (lock as unknown as Obj).withFileLockAsync as (
    file: string,
    budgetMs: number,
    fn: () => T,
  ) => Promise<{ ok: true; value: T } | { ok: false }>;
  return f(file, budgetMs, fn);
}

const facts = (...bodies: string[]): Cand[] => bodies.map((body) => ({ type: "fact", body }));

function paths() {
  return memoryPaths(L, AGENT);
}

function seedLines(lines: readonly Obj[]): void {
  const p = paths();
  mkdirSync(p.dir, { recursive: true, mode: 0o700 });
  writeFileSync(p.entries, lines.map((l) => `${JSON.stringify(l)}\n`).join(""), { mode: 0o600 });
}

function entry(n: number, over: Obj = {}): Obj {
  return {
    v: 1,
    kind: "entry",
    id: ID(n),
    seq: n,
    type: "fact",
    appliesTo: "project",
    body: `seeded ${n}`,
    source: { kind: "human", by: "Kim" },
    status: "proposed",
    supersedes: null,
    ...over,
  };
}

function rawCardSource(room: string, handoff = "9999999999999999", attempt = 1): Obj {
  return { kind: "card", room, card: CARD, handoff, attempt, by: "seed" };
}

function storeLines(): Obj[] {
  const p = paths();
  if (!existsSync(p.entries)) return [];
  return readFileSync(p.entries, "utf8")
    .split("\n")
    .filter((l) => l !== "")
    .map((l) => JSON.parse(l) as Obj);
}

function drops(over: Partial<Drops>): Drops {
  return { ...NO_DROPS, ...over };
}

function liveLock(file: string): string {
  const dir = `${file}.lock`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "owner.pid"), `${process.pid}\n`);
  return dir;
}

// ---------------------------------------------------------------------------------------------
// withFileLockAsync (R10 · C3)
// ---------------------------------------------------------------------------------------------

describe("withFileLockAsync — same mkdir lock, awaited retry, ≤250 ms budget (R10 · C3)", () => {
  test("acquires the <file>.lock dir with owner.pid, runs fn synchronously, releases", async () => {
    const file = join(L, "sub", "data.jsonl");
    let seen = null as string | null;
    const r = await withLockAsync(file, 250, () => {
      seen = readFileSync(join(`${file}.lock`, "owner.pid"), "utf8").trim();
      return 42;
    });
    expect(r).toEqual({ ok: true, value: 42 });
    expect(seen).toBe(String(process.pid));
    expect(existsSync(`${file}.lock`)).toBe(false);
  });

  test("fn throwing rejects and still releases the lock", async () => {
    const file = join(L, "data.jsonl");
    await expect(
      withLockAsync(file, 250, () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(existsSync(`${file}.lock`)).toBe(false);
  });

  test("a live owner's fresh lock → {ok:false} inside the budget; fn not run; event loop keeps ticking; lock untouched", async () => {
    const file = join(L, "data.jsonl");
    const dir = liveLock(file);
    let ran = false;
    let ticks = 0;
    const timer = setInterval(() => {
      ticks += 1;
    }, 10);
    const t0 = Date.now();
    const r = await withLockAsync(file, 250, () => {
      ran = true;
    });
    const elapsed = Date.now() - t0;
    clearInterval(timer);
    expect(r).toEqual({ ok: false });
    expect(ran).toBe(false);
    expect(elapsed).toBeGreaterThanOrEqual(200);
    expect(elapsed).toBeLessThan(250 + BUDGET_SLACK_MS);
    expect(ticks).toBeGreaterThanOrEqual(5);
    expect(readFileSync(join(dir, "owner.pid"), "utf8").trim()).toBe(String(process.pid));
  });

  test("budget is clamped to 250 ms", async () => {
    const file = join(L, "data.jsonl");
    liveLock(file);
    const t0 = Date.now();
    const r = await withLockAsync(file, 10_000, () => 1);
    expect(r).toEqual({ ok: false });
    expect(Date.now() - t0).toBeLessThan(250 + BUDGET_SLACK_MS);
  });

  test("a stale lock of a dead owner (5 s old) is reclaimed", async () => {
    const file = join(L, "data.jsonl");
    const dir = `${file}.lock`;
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "owner.pid"), "999999991\n");
    const past = new Date(Date.now() - 60_000);
    utimesSync(dir, past, past);
    const r = await withLockAsync(file, 250, () => "in");
    expect(r).toEqual({ ok: true, value: "in" });
    expect(existsSync(dir)).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// cardMemorySource (D8 · R1 · R2)
// ---------------------------------------------------------------------------------------------

describe("cardMemorySource (D8 · R2)", () => {
  test("shape {kind:card, room, card, handoff, attempt, by} and ≤1024 B", () => {
    const s = cardSource({ attempt: 2 });
    expect(s).toEqual({ kind: "card", room: ROOMK, card: CARD, handoff: H1, attempt: 2, by: "claude-impl" });
    expect(Object.keys(s)).toEqual(["kind", "room", "card", "handoff", "attempt", "by"]);
    expect(Buffer.byteLength(JSON.stringify(s), "utf8")).toBeLessThanOrEqual(1024);
  });

  test("by is cut like humanMemorySource: ≤64 UTF-16 units, a dangling high surrogate dropped", () => {
    expect(cardSource({ by: "p".repeat(200) }).by).toBe("p".repeat(64));
    expect(cardSource({ by: `${"a".repeat(63)}😀tail` }).by).toBe("a".repeat(63));
    const long = cardSource({ by: "가".repeat(500) });
    expect((long.by as string).length).toBe(64);
    expect(Buffer.byteLength(JSON.stringify(long), "utf8")).toBeLessThanOrEqual(1024);
    expect(cardSource({ by: "Kim" }).by).toBe(humanMemorySource("Kim").by);
  });

  test("room · card · handoff must be 16 lowercase hex and attempt 1|2 (TypeError otherwise)", () => {
    expect(() => cardSource({ handoff: "dispatch-handoff-raw-id" })).toThrow(TypeError);
    expect(() => cardSource({ room: "ROOM" })).toThrow(TypeError);
    expect(() => cardSource({ card: "0123" })).toThrow(TypeError);
    expect(() => cardSource({ attempt: 3 as 1 })).toThrow(TypeError);
  });
});

// ---------------------------------------------------------------------------------------------
// batch append (D11 · D12 · ②)
// ---------------------------------------------------------------------------------------------

describe("appendMemoryEntriesAsync — one batch, one append", () => {
  test("fsync spy harness sanity: the sync appendMemoryEntry fsyncs once", () => {
    const spy = spyOn(fs, "fsyncSync");
    try {
      const r = appendMemoryEntry(
        L,
        AGENT,
        {
          body: "x",
          type: "fact",
          appliesTo: "project",
          status: "proposed",
          supersedes: null,
          source: humanMemorySource("Kim"),
        },
        { env: {} },
      );
      expect(r.ok).toBe(true);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });

  test("3 candidates → 3 proposed lines (seq 1..3) in one append with one fsync", async () => {
    const spy = spyOn(fs, "fsyncSync");
    let r: Result;
    try {
      r = await propose([
        { type: "fact", body: "the build uses bun" },
        { type: "decision", body: "ship with biome lint clean" },
        { type: "preference", body: "owner prefers Korean reports" },
      ]);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
    expect(r).toEqual({ proposed: 3, ids: [ID(0xc001), ID(0xc002), ID(0xc003)], dropped: NO_DROPS });
    const lines = storeLines();
    expect(lines.length).toBe(3);
    expect(lines.map((l) => l.seq)).toEqual([1, 2, 3]);
    expect(lines.map((l) => l.type)).toEqual(["fact", "decision", "preference"]);
    for (const l of lines) {
      expect(l.v).toBe(1);
      expect(l.kind).toBe("entry");
      expect(l.status).toBe("proposed");
      expect(l.supersedes).toBeNull();
      expect(l.appliesTo).toBe(APPLIES);
      expect(l.source).toEqual(cardSource());
    }
    const p = paths();
    expect(statSync(p.entries).mode & 0o777).toBe(0o600);
    expect(statSync(p.dir).mode & 0o777).toBe(0o700);
    expect(existsSync(p.lock)).toBe(false);
    const f = foldMemoryLines(readFileSync(p.entries, "utf8"));
    expect(f.counters).toEqual({ unparseable: 0, conflicts: 0, dangling: 0, archivedRefs: 0 });
    expect(f.visibleActive).toEqual([]);
  });

  test("seq continues from the existing fold max; bodies are sanitized (CR → LF form) before storing", async () => {
    seedLines([entry(1), entry(7, { status: "active" })]);
    const r = await propose(facts("line one\r\nline two"));
    expect(r.proposed).toBe(1);
    const last = storeLines().at(-1)!;
    expect(last.seq).toBe(8);
    expect(last.body).not.toContain("\r");
  });

  test("an empty candidate list → nothing written, no store created", async () => {
    const r = await propose([]);
    expect(r).toEqual({ proposed: 0, ids: [], dropped: NO_DROPS });
    expect(existsSync(paths().dir)).toBe(false);
  });

  test("a store dir that is a symlink → rejects (IO-class error for the caller to catch); nothing written", async () => {
    const real = mkdtempSync(join(tmpdir(), "loom-mem-async-real-"));
    try {
      mkdirSync(join(L, "memory"), { recursive: true });
      symlinkSync(real, join(L, "memory", AGENT));
      await expect(propose(facts("ok fact"))).rejects.toThrow();
      expect(fs.readdirSync(real)).toEqual([]);
    } finally {
      rmSync(real, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------------------------
// write-time filters (D10 · R8 · R18 · R56-L1)
// ---------------------------------------------------------------------------------------------

describe("filters — agent-sourced only (D10 · R8 · R18)", () => {
  test("empty after sanitize · 2001 chars → invalid (never truncated); 2000 chars → proposed", async () => {
    const r = await propose(facts("   ", "\u0000\u0001", "x".repeat(2001), "y".repeat(2000)));
    expect(r.proposed).toBe(1);
    expect(r.dropped).toEqual(drops({ invalid: 3 }));
    expect(storeLines().map((l) => (l.body as string).length)).toEqual([2000]);
  });

  test.each([
    ["task marker (containsMarker)", "▶ Loom dispatched task — do x"],
    ["fence BEGIN line lookalike", "===== BEGIN LOOM MEMORY abc ====="],
    ["fence END line lookalike (case-insensitive)", "=== end loom memory"],
    ["fullwidth fence lookalike (NFKC)", "＝＝＝ BEGIN LOOM"],
    ["candidate block marker", "LOOM-MEMORY-CANDIDATES"],
    ["candidate end marker", "then LOOM-MEMORY-END here"],
    ["report block marker", "LOOM-REPORT-END"],
  ])("%s → marker", async (_name, body) => {
    const r = await propose(facts(body, "a plain fact"));
    expect(r.proposed).toBe(1);
    expect(r.dropped).toEqual(drops({ marker: 1 }));
    expect(storeLines().map((l) => l.body)).toEqual(["a plain fact"]);
  });

  test.each([
    ["40 hex commit sha", "fixed in 4ccde0e1234567890abcdef1234567890abcdef0"],
    ["32 hex", "nonce-like 0123456789abcdef0123456789abcdef is fine"],
    ["loom-card-report mention", "use the loom-card-report skill for the final message"],
    ["loom-memory-candidates mention (lowercase — R56-L1)", "loom-memory-candidates is a builtin skill"],
    ["bare ===== line", "====="],
  ])("false-positive control: %s → proposed", async (_name, body) => {
    const r = await propose(facts(body));
    expect(r).toEqual({ proposed: 1, ids: [ID(0xc001)], dropped: NO_DROPS });
  });

  test("an env secret value → secret; the result never carries the body or the secret; nothing written", async () => {
    const secret = "zq9-very-secret-value-77";
    const r = await propose(facts(`the deploy key is ${secret}`), { env: { DEPLOY_TOKEN: secret } });
    expect(r).toEqual({ proposed: 0, ids: [], dropped: drops({ secret: 1 }) });
    expect(JSON.stringify(r)).not.toContain(secret);
    expect(existsSync(paths().entries)).toBe(false);
  });

  test("a secret-shaped body → secret (deps.env only, never process.env)", async () => {
    const r = await propose(facts(`token ghp_${"A".repeat(30)}`, "fine fact"));
    expect(r.proposed).toBe(1);
    expect(r.dropped).toEqual(drops({ secret: 1 }));
    expect(JSON.stringify(r)).not.toContain("ghp_");
  });
});

// ---------------------------------------------------------------------------------------------
// caps (D9 · R12)
// ---------------------------------------------------------------------------------------------

describe("caps (D9 · R12)", () => {
  test("constants", () => {
    expect((store as unknown as Obj).MEMORY_CARD_PROPOSED_CAP).toBe(50);
    expect((store as unknown as Obj).MEMORY_CARD_ROOM_CAP).toBe(10);
  });

  test("6 candidates in one attempt → 5 proposed · cap 1", async () => {
    const r = await propose(facts("f1", "f2", "f3", "f4", "f5", "f6"));
    expect(r.proposed).toBe(5);
    expect(r.dropped).toEqual(drops({ cap: 1 }));
    expect(storeLines().map((l) => l.body)).toEqual(["f1", "f2", "f3", "f4", "f5"]);
  });

  test("agentKey 50: 49 card proposed + 100 human proposed, batch of 2 → 1 proposed · 1 cap", async () => {
    const rooms = ["b", "c", "d", "e", "f"].map((c) => c.repeat(16));
    const lines: Obj[] = [];
    let n = 0;
    for (let i = 0; i < 49; i++) {
      const room = rooms[i % 5]!;
      lines.push(entry(++n, { appliesTo: `room:${room}`, source: rawCardSource(room) }));
    }
    for (let i = 0; i < 100; i++) lines.push(entry(++n));
    seedLines(lines);
    const r = await propose(facts("g1", "g2"));
    expect(r.proposed).toBe(1);
    expect(r.dropped).toEqual(drops({ cap: 1 }));
  });

  test("only proposed card entries count toward the agentKey cap (active · retired card entries do not)", async () => {
    const lines: Obj[] = [];
    for (let i = 1; i <= 60; i++) {
      lines.push(entry(i, { status: i % 2 ? "active" : "retired", appliesTo: `room:${OTHER_ROOMK}`, source: rawCardSource(OTHER_ROOMK) }));
    }
    seedLines(lines);
    const r = await propose(facts("h1"));
    expect(r.proposed).toBe(1);
  });

  test("room 10: 10 card proposed in this room → cap; 9 + batch 2 → 1 · cap 1; another room's 10 do not block", async () => {
    const ten: Obj[] = [];
    for (let i = 1; i <= 10; i++) ten.push(entry(i, { appliesTo: APPLIES, source: rawCardSource(ROOMK) }));
    seedLines(ten);
    expect((await propose(facts("r1"))).dropped).toEqual(drops({ cap: 1 }));

    seedLines(ten.slice(0, 9));
    const r2 = await propose(facts("r2", "r3"), { source: cardSource({ handoff: H2 }) });
    expect(r2.proposed).toBe(1);
    expect(r2.dropped).toEqual(drops({ cap: 1 }));

    const other: Obj[] = [];
    for (let i = 1; i <= 10; i++) {
      other.push(entry(i, { appliesTo: `room:${OTHER_ROOMK}`, source: rawCardSource(OTHER_ROOMK) }));
    }
    seedLines(other);
    expect((await propose(facts("r4"))).proposed).toBe(1);
  });

  test("the existing 200 proposed cap (human + card) still applies", async () => {
    const lines: Obj[] = [];
    for (let i = 1; i <= 200; i++) lines.push(entry(i));
    seedLines(lines);
    const r = await propose(facts("over"));
    expect(r).toEqual({ proposed: 0, ids: [], dropped: drops({ cap: 1 }) });
    expect(storeLines().length).toBe(200);
  });

  test("entries.jsonl > 1 MiB → every remaining candidate cap; bytes unchanged", async () => {
    const p = paths();
    mkdirSync(p.dir, { recursive: true });
    const big = `${"z".repeat(MEMORY_ENTRIES_MAX_BYTES + 10)}\n`;
    writeFileSync(p.entries, big);
    const r = await propose(facts("a", "b", "  "));
    expect(r).toEqual({ proposed: 0, ids: [], dropped: drops({ cap: 2, invalid: 1 }) });
    expect(readFileSync(p.entries, "utf8")).toBe(big);
  });
});

// ---------------------------------------------------------------------------------------------
// dedupe (D11 · R9 · R11 · R56-M2)
// ---------------------------------------------------------------------------------------------

describe("dedupe key (card, handoff, attempt) — main store and archive tail (D11 · R11)", () => {
  test("the same key again → all remaining dup · skipped dup · file unchanged; filter drops still counted", async () => {
    const env = { API_TOKEN: "zq9-very-secret-value-77" };
    const first = await propose(facts("k1", "k2", "has zq9-very-secret-value-77"), { env });
    expect(first.proposed).toBe(2);
    const before = readFileSync(paths().entries, "utf8");
    const again = await propose(facts("k1", "k2", "has zq9-very-secret-value-77"), { env });
    expect(again).toEqual({ proposed: 0, ids: [], dropped: drops({ dup: 2, secret: 1 }), skipped: "dup" });
    expect(readFileSync(paths().entries, "utf8")).toBe(before);
  });

  test("another handoff with the same attempt → proposed; the same handoff at attempt 2 → proposed", async () => {
    expect((await propose(facts("k1"))).proposed).toBe(1);
    expect((await propose(facts("k1"), { source: cardSource({ handoff: H2 }) })).proposed).toBe(1);
    expect((await propose(facts("k1"), { source: cardSource({ attempt: 2 }) })).proposed).toBe(1);
    expect(storeLines().length).toBe(3);
  });

  test("a rejected proposal compacted into the archive (propose → retire → compact) → dup (no resurrection)", async () => {
    const r = await propose(facts("rejected fact"));
    expect(r.proposed).toBe(1);
    const t = appendMemoryTransition(L, AGENT, { id: r.ids[0]!, to: "retired", source: humanMemorySource("Kim") });
    expect(t.ok).toBe(true);
    const c = compactMemory(L, AGENT);
    expect(c.ok && c.moved).toBe(2);
    expect(storeLines().some((l) => l.kind === "entry")).toBe(false);
    const again = await propose(facts("rejected fact"));
    expect(again).toEqual({ proposed: 0, ids: [], dropped: drops({ dup: 1 }), skipped: "dup" });
  });

  test("5 MiB archive: a key near the end → dup; a key only in the first 1 MiB (outside the tail 4 MiB) → proposed (declared)", async () => {
    const p = paths();
    mkdirSync(p.dir, { recursive: true });
    const front = JSON.stringify(entry(1, { appliesTo: APPLIES, source: cardSource({ handoff: H1 }), status: "retired" }));
    const near = JSON.stringify(entry(2, { appliesTo: APPLIES, source: cardSource({ handoff: H2 }), status: "retired" }));
    const filler = `${"q".repeat(1023)}\n`;
    const parts: string[] = [`${front}\n`];
    for (let i = 0; i < 5 * 1024; i++) parts.push(filler);
    parts.push(`${near}\n`, filler);
    writeFileSync(p.archive, parts.join(""));
    expect(statSync(p.archive).size).toBeGreaterThan(ARCHIVE_TAIL + 1024 * 1024);

    const nearAgain = await propose(facts("x"), { source: cardSource({ handoff: H2 }) });
    expect(nearAgain).toEqual({ proposed: 0, ids: [], dropped: drops({ dup: 1 }), skipped: "dup" });
    const frontAgain = await propose(facts("x"), { source: cardSource({ handoff: H1 }) });
    expect(frontAgain.proposed).toBe(1);
  });

  test("an archive whose tail starts mid-line: the partial first line is ignored, the rest still scanned", async () => {
    const p = paths();
    mkdirSync(p.dir, { recursive: true });
    const near = JSON.stringify(entry(2, { appliesTo: APPLIES, source: cardSource({ handoff: H2 }), status: "retired" }));
    // one huge line straddling the size − 4 MiB cut, then the key line
    writeFileSync(p.archive, `${"w".repeat(ARCHIVE_TAIL + 777)}\n${near}\n`);
    const r = await propose(facts("x"), { source: cardSource({ handoff: H2 }) });
    expect(r.skipped).toBe("dup");
  });
});

// ---------------------------------------------------------------------------------------------
// lock budget (D12 · R10)
// ---------------------------------------------------------------------------------------------

describe("lock budget — fail-open busy (D12)", () => {
  test("store lock held by a live owner → remaining candidates busy inside ≤250 ms + slack; filters still counted; nothing written", async () => {
    const p = paths();
    mkdirSync(p.dir, { recursive: true });
    liveLock(p.entries);
    let ticks = 0;
    const timer = setInterval(() => {
      ticks += 1;
    }, 10);
    const t0 = Date.now();
    const r = await propose(facts("b1", "b2", "▶ Loom dispatched task"));
    const elapsed = Date.now() - t0;
    clearInterval(timer);
    expect(r).toEqual({ proposed: 0, ids: [], dropped: drops({ busy: 2, marker: 1 }) });
    expect(elapsed).toBeLessThan(250 + BUDGET_SLACK_MS);
    expect(ticks).toBeGreaterThanOrEqual(5);
    expect(existsSync(p.entries)).toBe(false);
  });

  test("a smaller budget is honoured", async () => {
    const p = paths();
    mkdirSync(p.dir, { recursive: true });
    liveLock(p.entries);
    const t0 = Date.now();
    const r = await propose(facts("b1"), { budgetMs: 30 });
    expect(r.dropped.busy).toBe(1);
    expect(Date.now() - t0).toBeLessThan(30 + BUDGET_SLACK_MS);
  });

  test("a stale store lock of a dead owner is reclaimed → proposed", async () => {
    const p = paths();
    mkdirSync(p.lock, { recursive: true });
    writeFileSync(join(p.lock, "owner.pid"), "999999991\n");
    const past = new Date(Date.now() - 60_000);
    utimesSync(p.lock, past, past);
    const r = await propose(facts("after stale"));
    expect(r.proposed).toBe(1);
    expect(existsSync(p.lock)).toBe(false);
  });
});
