/**
 * PLAN 0.40.0 P2 — the R8 card-candidate filter uses the marker fold (D3 · R4 · R5 · C1 · C4 → R59-L2).
 * Fence lookalike (R4): on markerSkeleton(body) with \p{Cf} removed, a maximal run of 3+ `=`-like
 * characters (`=` after NFKD · U+2550 · U+1400 · U+A4FF · U+30A0) whose remainder folds to a string
 * starting with "beginloom" or "endloom". Block lookalike (R5): `/LOOM\W?(?:MEMORY|REPORT)/u` on the
 * same skeleton, case-sensitive. Either → `dropped.marker`.
 * Same public surface as `memory-store-async.test.ts` (appendMemoryEntriesAsync · cardMemorySource).
 * Lookalike characters are written as \u escapes. Every store lives under a fresh mkdtemp loomDir;
 * run with HOME = LOOM_TEST_HOME = temp.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as store from "./memory-store";
import { type MemorySource, memoryPaths } from "./memory-store";

const AGENT = "claude.default";
const ID = (n: number) => `mem_${n.toString(16).padStart(16, "0")}`;
const ROOMK = "0123456789abcdef";
const APPLIES = `room:${ROOMK}` as const;
const CARD = "fedcba9876543210";
const H1 = "1111111111111111";

type Obj = Record<string, unknown>;
type Cand = { type: "fact" | "decision" | "preference"; body: string };
type Drops = { secret: number; marker: number; cap: number; busy: number; dup: number; invalid: number };
type Result = { proposed: number; ids: string[]; dropped: Drops; skipped?: "dup" };

const NO_DROPS: Drops = { secret: 0, marker: 0, cap: 0, busy: 0, dup: 0, invalid: 0 };

let L: string;

beforeEach(() => {
  L = mkdtempSync(join(tmpdir(), "loom-mem-r8-fold-"));
});

afterEach(() => {
  rmSync(L, { recursive: true, force: true });
});

function cardSource(): MemorySource {
  const fn = (store as unknown as Obj).cardMemorySource as (x: unknown) => MemorySource;
  return fn({ room: ROOMK, card: CARD, handoff: H1, attempt: 1, by: "claude-impl" });
}

function propose(candidates: readonly Cand[]): Promise<Result> {
  const fn = (store as unknown as Obj).appendMemoryEntriesAsync as (
    loomDir: string,
    agentKey: string,
    batch: unknown,
    deps: unknown,
  ) => Promise<Result>;
  let n = 0xc000;
  return fn(
    L,
    AGENT,
    { source: cardSource(), appliesTo: APPLIES, candidates },
    {
      env: {},
      randomId: () => ID(++n),
      now: () => new Date("2026-10-18T12:00:00.000Z"),
    },
  );
}

const facts = (...bodies: string[]): Cand[] => bodies.map((body) => ({ type: "fact", body }));

function storeBodies(): unknown[] {
  const file = memoryPaths(L, AGENT).entries;
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => (JSON.parse(l) as Obj).body);
}

const drops = (over: Partial<Drops>): Drops => ({ ...NO_DROPS, ...over });

describe("R8 fence lookalike uses the marker fold (D3 · R4)", () => {
  test.each([
    ["Cyrillic capital O in LOOM", "===== BEGIN LОOM MEMORY"],
    ["ZWSP before LOOM", "=== BEGIN ​LOOM"],
    ["box-drawing double horizontal U+2550", "═══ END LOOM"],
    ["superscript equals U+207C (NFKD → =)", "⁼⁼⁼ BEGIN LOOM"],
    ["punctuation between the run and BEGIN (R4 widening, declared)", "=== - BEGIN LOOM"],
    ["Canadian syllabics hyphen U+1400 (R4 set)", "᐀᐀᐀ BEGIN LOOM"],
    ["Lisu punctuation full stop U+A4FF (R4 set)", "꓿꓿꓿ END LOOM"],
    ["katakana-hiragana double hyphen U+30A0 (R4 set)", "゠゠゠ BEGIN LOOM"],
  ])("%s → marker", async (_name, body) => {
    const r = await propose(facts(body, "a plain fact"));
    expect(r.proposed).toBe(1);
    expect(r.dropped).toEqual(drops({ marker: 1 }));
    expect(storeBodies()).toEqual(["a plain fact"]);
  });
});

describe("R8 block lookalike uses markerSkeleton (D3 · R5 · C1 · C4 → R59-L2)", () => {
  test.each([
    ["non-breaking hyphen U+2011", "LOOM‑MEMORY‑CANDIDATES"],
    ["ZWSP inside LOOM (\\p{Cf} removed)", "LO​OM-REPORT-END"],
    ["Cyrillic capital O (C1 — prototype case kept)", "LОOM-MEMORY-"],
    ["space separator (R59-L2 canonical /LOOM\\W?(?:MEMORY|REPORT)/u)", "LOOM MEMORY"],
  ])("%s → marker", async (_name, body) => {
    const r = await propose(facts(body, "a plain fact"));
    expect(r.proposed).toBe(1);
    expect(r.dropped).toEqual(drops({ marker: 1 }));
    expect(storeBodies()).toEqual(["a plain fact"]);
  });
});

describe("R8 false-positive controls stay proposed (D3 · R4 · R5 · R56-L1)", () => {
  test.each([
    ["loom-memory-candidates mention (lowercase — R56-L1)", "loom-memory-candidates is a builtin skill"],
    ["mixed-case Loom-Memory", "Loom-Memory notes"],
    ["bare ===== line", "====="],
    ["only two = before BEGIN LOOM", "== BEGIN LOOM"],
    ["a word between BEGIN and LOOM", "=== BEGIN THE LOOM"],
    ["beginning loom (folds to beginningloom)", "=== beginning loom"],
    ["underscore separator LOOM_MEMORY (loss class — unnumbered)", "LOOM_MEMORY"],
    ["Cyrillic sentence", "Добрый день, Москва"],
    ["Greek sentence", "Καλημέρα από την Ελλάδα"],
  ])("%s → proposed", async (_name, body) => {
    const r = await propose(facts(body));
    expect(r).toEqual({ proposed: 1, ids: [ID(0xc001)], dropped: NO_DROPS });
    expect(storeBodies()).toEqual([body]);
  });
});
