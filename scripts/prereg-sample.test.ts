import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  drawSample,
  excludeReason,
  HOLDOUT_N,
  isSelfReferencing,
  RANDOM_N,
  RECENT_N,
  SEED,
  type SessionStat,
} from "./prereg-sample.ts";

const ROOT = join(import.meta.dir, "..");

const stat = (over: Partial<SessionStat> & { id: string }): SessionStat => ({
  mtimeMs: 1_000,
  bytes: 10_000,
  turns: 40,
  toolCalls: 20,
  selfRef: false,
  ...over,
});

const corpus = (n: number): SessionStat[] =>
  Array.from({ length: n }, (_, i) =>
    stat({ id: `s${String(i).padStart(3, "0")}`, mtimeMs: 1_000 + i }),
  );

describe("PREREG S4 — exclusion predicates are mechanical", () => {
  test("self-reference is decided by the transcript text, not by judgement", () => {
    expect(isSelfReferencing('{"text":"RULE-ROUTER phase 1"}')).toBe(true);
    expect(isSelfReferencing('{"text":"edit rules/registry.yaml"}')).toBe(true);
    expect(isSelfReferencing('{"text":"unrelated session"}')).toBe(false);
  });

  test("the three sealed exclusions fire, and nothing else does", () => {
    expect(excludeReason(stat({ id: "a", selfRef: true }))).toBe("self-reference");
    expect(excludeReason(stat({ id: "b", turns: 4 }))).toBe("under-5-turns");
    expect(excludeReason(stat({ id: "c", toolCalls: 0 }))).toBe("no-tool-calls");
    expect(excludeReason(stat({ id: "d" }))).toBeNull();
  });
});

describe("PREREG S4 — the draw is deterministic and non-overlapping", () => {
  test("same corpus + same seed → identical sample (no PRNG · advisor N6)", () => {
    const sessions = corpus(120);
    const a = drawSample(sessions);
    const b = drawSample([...sessions].reverse());
    expect(a.recent).toEqual(b.recent);
    expect(a.random).toEqual(b.random);
    expect(a.holdout).toEqual(b.holdout);
    expect(a.population.digest).toBe(b.population.digest);
  });

  test("recent is newest-first and the random stratum never reuses it", () => {
    const draw = drawSample(corpus(120));
    expect(draw.recent).toHaveLength(RECENT_N);
    expect(draw.random).toHaveLength(RANDOM_N);
    expect(draw.recent[0]).toBe("s119");
    for (const id of draw.random) expect(draw.recent).not.toContain(id);
  });

  test("holdout is the first 15 of the random stratum and is reserved (advisor N2)", () => {
    const draw = drawSample(corpus(120));
    expect(draw.holdout).toEqual(draw.random.slice(0, HOLDOUT_N));
    expect(draw.holdout).toHaveLength(HOLDOUT_N);
  });

  test("excluded sessions never enter either stratum", () => {
    const sessions = [
      ...corpus(80),
      stat({ id: "zz-self", mtimeMs: 9_999, selfRef: true }),
      stat({ id: "zz-tiny", mtimeMs: 9_998, turns: 1 }),
    ];
    const draw = drawSample(sessions);
    const sample = [...draw.recent, ...draw.random];
    expect(sample).not.toContain("zz-self");
    expect(sample).not.toContain("zz-tiny");
    expect(draw.excluded.map((e) => e.reason).sort()).toEqual(["self-reference", "under-5-turns"]);
    expect(draw.population.count).toBe(82);
  });
});

describe("PREREG S4 — the sealed receipt matches the sealed rules", () => {
  const receipt = JSON.parse(readFileSync(join(ROOT, "rules/prereg-sample.json"), "utf8"));

  test("receipt carries the frozen sample, seed, and population snapshot", () => {
    expect(receipt.seed).toBe(SEED);
    expect(receipt.recent).toHaveLength(RECENT_N);
    expect(receipt.random).toHaveLength(RANDOM_N);
    expect(receipt.holdout).toEqual(receipt.random.slice(0, HOLDOUT_N));
    expect(receipt.population.count).toBeGreaterThanOrEqual(receipt.eligible);
    expect(Object.keys(receipt.digests)).toHaveLength(RECENT_N + RANDOM_N);
  });

  test("the receipt stores coordinates and digests only — no transcript content", () => {
    const text = readFileSync(join(ROOT, "rules/prereg-sample.json"), "utf8");
    expect(text).not.toMatch(/"role":|"content":|"tool_use"/);
    for (const digest of Object.values(receipt.digests) as string[]) {
      expect(digest).toMatch(/^[a-f0-9]{8}$/);
    }
  });
});
