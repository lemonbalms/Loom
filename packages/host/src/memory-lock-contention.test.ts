/**
 * PLAN 0.38.0 P1 — D12 required: the human CLI (sync `withFileLock`, 4 s wait) and the bridge
 * (`appendMemoryEntriesAsync` → `withFileLockAsync`, ≤250 ms) exclude each other on the SAME mkdir
 * lock dir (C3 · R10). Done-when (b): CLI-side holder → async `busy` inside the budget, event loop
 * not blocked · async holder past the CLI's 4 s wait → the real CLI refuses `busy` (exit 1) · both sides
 * hammering at once → no duplicate seq · no torn line · a consistent fold.
 * Children run the real CLI entry (`packages/cli/src/index.ts`) or the sync lock primitive it uses,
 * with HOME = LOOM_TEST_HOME = temp T and LOOM_PROFILE=smoke (R22) — never the real home.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as lock from "./atomic-json";
import * as store from "./memory-store";
import { foldMemoryLines, type MemorySource, memoryPaths } from "./memory-store";

const CLI = join(import.meta.dir, "..", "..", "cli", "src", "index.ts");
const ATOMIC = join(import.meta.dir, "atomic-json.ts");
const AGENT = "claude.smoke";
const ROOMK = "0123456789abcdef";
const CARD = "fedcba9876543210";
const BUDGET_SLACK_MS = 400;

type Obj = Record<string, unknown>;
type Drops = { secret: number; marker: number; cap: number; busy: number; dup: number; invalid: number };
type Result = { proposed: number; ids: string[]; dropped: Drops; skipped?: "dup" };

let T: string;
let loomDir: string;

beforeEach(() => {
  T = mkdtempSync(join(tmpdir(), "loom-mem-contend-"));
  loomDir = join(T, ".loom");
});

afterEach(() => {
  rmSync(T, { recursive: true, force: true });
});

function childEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue;
    if (/^(LOOM_|FABLE_)/.test(k)) continue; // relay token · profile · session never leak in
    env[k] = v;
  }
  return { ...env, HOME: T, LOOM_TEST_HOME: T, LOOM_PROFILE: "smoke" };
}

function cliPropose(body: string) {
  return Bun.spawn([process.execPath, CLI, "memory", "propose", "--agent", "claude", body], {
    env: childEnv(),
    stdout: "pipe",
    stderr: "pipe",
  });
}

function cardSource(handoffN: number): MemorySource {
  const fn = (store as unknown as Obj).cardMemorySource as (x: unknown) => MemorySource;
  return fn({
    room: ROOMK,
    card: CARD,
    handoff: handoffN.toString(16).padStart(16, "0"),
    attempt: 1,
    by: "claude-impl",
  });
}

function bridgePropose(handoffN: number, body: string): Promise<Result> {
  const fn = (store as unknown as Obj).appendMemoryEntriesAsync as (
    loomDir: string,
    agentKey: string,
    batch: unknown,
    deps: unknown,
  ) => Promise<Result>;
  return fn(
    loomDir,
    AGENT,
    { source: cardSource(handoffN), appliesTo: `room:${ROOMK}`, candidates: [{ type: "fact", body }] },
    { env: {} },
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

async function readUntil(stream: ReadableStream<Uint8Array>, needle: string, ms: number): Promise<string> {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let acc = "";
  const deadline = Date.now() + ms;
  try {
    while (!acc.includes(needle)) {
      if (Date.now() > deadline) throw new Error(`timeout waiting for ${JSON.stringify(needle)} (got ${JSON.stringify(acc)})`);
      const { value, done } = await reader.read();
      if (done) break;
      acc += dec.decode(value);
    }
  } finally {
    reader.releaseLock();
  }
  return acc;
}

function lines(): Obj[] {
  const p = memoryPaths(loomDir, AGENT);
  let raw = "";
  try {
    raw = readFileSync(p.entries, "utf8");
  } catch {
    return [];
  }
  return raw
    .split("\n")
    .filter((l) => l !== "")
    .map((l) => JSON.parse(l) as Obj);
}

describe("CLI ↔ bridge contention on the same mkdir lock (D12 · C3)", () => {
  test(
    "a child holding the CLI's sync withFileLock → bridge async gets busy inside the budget, loop keeps ticking",
    async () => {
      const p = memoryPaths(loomDir, AGENT);
      const script = `import { withFileLock, sleepMs } from ${JSON.stringify(ATOMIC)};
withFileLock(${JSON.stringify(p.entries)}, () => { process.stdout.write("held\\n"); sleepMs(1500); });`;
      const holder = Bun.spawn([process.execPath, "-e", script], { env: childEnv(), stdout: "pipe", stderr: "pipe" });
      try {
        await readUntil(holder.stdout, "held", 15_000);
        let ticks = 0;
        const timer = setInterval(() => {
          ticks += 1;
        }, 10);
        const t0 = Date.now();
        const r = await bridgePropose(1, "while the cli holds the lock");
        const elapsed = Date.now() - t0;
        clearInterval(timer);
        expect(r.proposed).toBe(0);
        expect(r.dropped.busy).toBe(1);
        expect(elapsed).toBeLessThan(250 + BUDGET_SLACK_MS);
        expect(ticks).toBeGreaterThanOrEqual(5);
        expect(lines()).toEqual([]);
      } finally {
        await holder.exited;
      }
      expect(holder.exitCode).toBe(0);
      // after the holder releases, the bridge write goes through
      const after = await bridgePropose(1, "after release");
      expect(after.proposed).toBe(1);
    },
    { timeout: 30_000 },
  );

  test(
    "the bridge holding the lock past the CLI's 4 s wait → the real CLI refuses busy (exit 1), file unchanged",
    async () => {
      const p = memoryPaths(loomDir, AGENT);
      let child: ReturnType<typeof cliPropose> | null = null;
      let duringHold: Obj[] = [];
      // Hold longer than LOCK_WAIT_MS (4000) plus the child's startup. Exceeding LOCK_STALE_MS (5000)
      // is harmless: stale reclaim never removes a lock whose owner pid (this process) is alive.
      // Incompatible locks → the CLI writes during the hold and exits 0 → this test fails.
      const r = await withLockAsync(p.entries, 250, () => {
        child = cliPropose("written by the human cli");
        lock.sleepMs(9000); // hold the lock (fn is synchronous — R10)
        duringHold = lines();
        return true;
      });
      expect(r).toEqual({ ok: true, value: true });
      expect(duringHold).toEqual([]);
      const c = child as unknown as ReturnType<typeof cliPropose>;
      const code = await c.exited;
      const err = await new Response(c.stderr).text();
      expect(code).toBe(1);
      expect(err).toContain("store busy");
      expect(lines()).toEqual([]);
    },
    { timeout: 30_000 },
  );

  test(
    "both sides at once, repeated → no duplicate seq, no torn line, fold consistent with the successes",
    async () => {
      const N = 6;
      const children = Array.from({ length: N }, (_, i) => cliPropose(`cli fact ${i}`));
      const bridge: Result[] = [];
      for (let i = 0; i < N; i++) {
        bridge.push(await bridgePropose(100 + i, `bridge fact ${i}`));
        await new Promise((res) => setTimeout(res, 15));
      }
      const codes = await Promise.all(children.map((c) => c.exited));
      const cliOk = codes.filter((c) => c === 0).length;
      for (const c of codes) expect([0, 1]).toContain(c);
      const bridgeOk = bridge.reduce((n, r) => n + r.proposed, 0);
      for (const r of bridge) expect(r.proposed + r.dropped.busy).toBe(1);

      const p = memoryPaths(loomDir, AGENT);
      const raw = readFileSync(p.entries, "utf8");
      expect(raw.endsWith("\n")).toBe(true);
      const ls = lines(); // JSON.parse throws on a torn line
      expect(ls.length).toBe(cliOk + bridgeOk);
      const seqs = ls.map((l) => l.seq as number);
      expect(new Set(seqs).size).toBe(seqs.length);
      expect([...seqs].sort((a, b) => a - b)).toEqual(seqs.map((_, i) => i + 1));
      const f = foldMemoryLines(raw);
      expect(f.counters).toEqual({ unparseable: 0, conflicts: 0, dangling: 0, archivedRefs: 0 });
      expect(f.entries.size).toBe(cliOk + bridgeOk);
      const kinds = [...f.entries.values()].map((e) => e.source.kind);
      expect(kinds.filter((k) => k === "card").length).toBe(bridgeOk);
      expect(kinds.filter((k) => k === "human").length).toBe(cliOk);
    },
    { timeout: 60_000 },
  );
});
