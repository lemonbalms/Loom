/**
 * PLAN 0.44.0 P3 — `loom history search` through the bundled CLI (D9 · R15). Declared green from the
 * start (P3 follows P2 — this checks the bundle path, it is not a red test).
 *
 * `beforeAll` bundles `packages/cli/src/index.ts` the way `build:cli` does (`bun build … --target=bun`)
 * into a temp outfile — the committed `dist/` is never read. Each case runs `bun <tmp>/loom.js history
 * search …` with HOME = LOOM_TEST_HOME = a fresh temp dir and every LOOM_* / FABLE_* var (relay token ·
 * url · card · profile) removed, then checks exit · stdout · stderr and that nothing else changed.
 * The four R15 cases: a hit · no hit · an incomplete file · the LOOM_CARD refusal (`--help` included).
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { roomKey } from "@loom/host";

const ENTRY = join(import.meta.dir, "index.ts");
const REFUSAL =
  "loom history: refused — LOOM_CARD is set (this shell belongs to a Loom card worker); room history is for the operator.";

const tail = (hits: number, files: number, torn: number) =>
  `${hits} hits · ${files} files scanned · ${torn} torn lines`;

let BUILD: string;
let BUNDLE: string;

beforeAll(() => {
  BUILD = mkdtempSync(join(tmpdir(), "loom-historydist-build-"));
  BUNDLE = join(BUILD, "loom.js");
  const r = spawnSync(process.execPath, ["build", ENTRY, "--target=bun", "--outfile", BUNDLE], {
    env: childEnv(BUILD),
    encoding: "utf8",
    timeout: 120_000,
  });
  if (r.status !== 0) throw new Error(`bun build failed (${r.status}): ${r.stderr}`);
  if (!existsSync(BUNDLE)) throw new Error("bun build wrote no bundle");
}, 180_000);

afterAll(() => {
  rmSync(BUILD, { recursive: true, force: true });
});

function childEnv(T: string, extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue;
    if (/^(LOOM_|FABLE_)/.test(k)) continue; // relay token · url · profile · session · card never leak in
    env[k] = v;
  }
  return { ...env, HOME: T, LOOM_TEST_HOME: T, ...extra };
}

function runDist(T: string, args: string[], extra: Record<string, string> = {}) {
  return spawnSync(process.execPath, [BUNDLE, "history", ...args], {
    env: childEnv(T, extra),
    encoding: "utf8",
    timeout: 20_000,
  });
}

/** Writes a month file under `<T>/.loom`; returns its absolute path. */
function writeMonth(T: string, roomId: string, month: string, lines: string[]): string {
  const dir = join(T, ".loom", "rooms", roomKey(roomId), "events");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${month}.jsonl`);
  writeFileSync(path, lines.map((l) => `${l}\n`).join(""), { mode: 0o600 });
  return path;
}

function recLine(roomId: string, seq: number, ts: string, eventId: string, body: string): string {
  return JSON.stringify({ v: 1, roomId, seq, eventId, ts, type: "chat", envelope: { body } });
}

/** Names + kinds + sizes + mtimes under `dir` (sorted, recursive), without bun's own `Library/Caches`. */
function snapshotHome(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string, rel: string) => {
    for (const name of readdirSync(d).sort()) {
      const abs = join(d, name);
      const st = lstatSync(abs);
      const kind = st.isSymbolicLink() ? "l" : st.isDirectory() ? "d" : "f";
      out.push(`${rel}${name} ${kind} ${st.size} ${st.mtimeMs}`);
      if (kind === "d") walk(abs, `${rel}${name}/`);
    }
  };
  walk(dir, "");
  return out.filter((l) => !l.startsWith("Library"));
}

function withHome(prefix: string, fn: (T: string) => void): void {
  const T = mkdtempSync(join(tmpdir(), prefix));
  try {
    fn(T);
  } finally {
    rmSync(T, { recursive: true, force: true });
  }
}

describe("dist: bun <tmp>/loom.js history search (HOME = LOOM_TEST_HOME = temp) — D9 · R15", () => {
  test(
    "a hit → the hit block and the tail on stdout, exit 0; --json → hit + summary lines; nothing written",
    () => {
      withHome("loom-historydist-hit-", (T) => {
        writeMonth(T, "room-a", "2026-10", [
          recLine("room-a", 1, "2026-10-01T00:00:00.000Z", "e-1", "deploy alpha"),
          recLine("room-a", 2, "2026-10-02T00:00:00.000Z", "e-2", "other text"),
        ]);
        const before = snapshotHome(T);
        const r = runDist(T, ["search", "deploy"]);
        expect(r.stderr).toBe("");
        expect(r.stdout).toBe(
          `2026-10-01T00:00:00.000Z · room room-a · seq 1 · chat · e-1\n  deploy alpha\n${tail(1, 1, 0)}\n`,
        );
        expect(r.status).toBe(0);

        const j = runDist(T, ["search", "--json", "deploy"]);
        expect(j.stderr).toBe("");
        expect(j.stdout).toBe(
          '{"ts":"2026-10-01T00:00:00.000Z","roomId":"room-a","seq":1,"type":"chat","eventId":"e-1","snippet":"deploy alpha"}\n' +
            '{"summary":{"hits":1,"files":1,"torn":0,"incomplete":[]}}\n',
        );
        expect(j.status).toBe(0);
        expect(snapshotHome(T)).toEqual(before);
      });
    },
    60_000,
  );

  test(
    "no hit → only the tail, exit 1; an empty home → 0 files, exit 1, no state root created",
    () => {
      withHome("loom-historydist-none-", (T) => {
        writeMonth(T, "room-a", "2026-10", [recLine("room-a", 1, "2026-10-01T00:00:00.000Z", "e-1", "other")]);
        const r = runDist(T, ["search", "absent"]);
        expect(r.stderr).toBe("");
        expect(r.stdout).toBe(`${tail(0, 1, 0)}\n`);
        expect(r.status).toBe(1);
      });
      withHome("loom-historydist-empty-", (T) => {
        const before = snapshotHome(T);
        const r = runDist(T, ["search", "absent"]);
        expect(r.stderr).toBe("");
        expect(r.stdout).toBe(`${tail(0, 0, 0)}\n`);
        expect(r.status).toBe(1);
        expect(snapshotHome(T)).toEqual(before);
        expect(readdirSync(T).filter((n) => n === ".loom" || n === ".fable")).toEqual([]);
      });
    },
    60_000,
  );

  test(
    "an incomplete file → the hit is still printed, the incomplete line follows the tail, exit 2",
    () => {
      withHome("loom-historydist-incomplete-", (T) => {
        writeMonth(T, "room-a", "2026-10", [recLine("room-a", 1, "2026-10-01T00:00:00.000Z", "e-1", "found it")]);
        writeMonth(T, "room-b", "2026-09", [
          recLine("room-b", 1, "2026-09-01T00:00:00.000Z", "e-b", "found too"),
        ]);
        const linkDir = join(T, ".loom", "rooms", roomKey("room-b"), "events");
        const target = join(T, "elsewhere.jsonl");
        writeFileSync(target, `${recLine("room-b", 2, "2026-10-05T00:00:00.000Z", "e-c", "found hidden")}\n`);
        symlinkSync(target, join(linkDir, "2026-10.jsonl"));
        const before = snapshotHome(T);
        const r = runDist(T, ["search", "found"]);
        expect(r.stderr).toBe("");
        expect(r.stdout).toBe(
          [
            "2026-10-01T00:00:00.000Z · room room-a · seq 1 · chat · e-1",
            "  found it",
            "2026-09-01T00:00:00.000Z · room room-b · seq 1 · chat · e-b",
            "  found too",
            tail(2, 2, 0),
            `incomplete: rooms/${roomKey("room-b")}/events/2026-10.jsonl — symlink`,
            "",
          ].join("\n"),
        );
        expect(r.status).toBe(2);
        expect(r.stdout).not.toContain("found hidden");
        expect(snapshotHome(T)).toEqual(before);
      });
    },
    60_000,
  );

  test(
    "LOOM_CARD=x → the refusal on stderr, exit 2, nothing on stdout, no state root (with --help and --profile too)",
    () => {
      withHome("loom-historydist-card-", (T) => {
        for (const args of [["search", "q"], ["--help"], ["search", "q", "--profile", "p", "--help"], []]) {
          const before = snapshotHome(T);
          const r = runDist(T, args, { LOOM_CARD: "x" });
          expect(r.stdout).toBe("");
          expect(r.stderr).toBe(`${REFUSAL}\n`);
          expect(r.status).toBe(2);
          expect(snapshotHome(T)).toEqual(before);
          expect(readdirSync(T).filter((n) => n === ".loom" || n === ".fable")).toEqual([]);
        }
      });
    },
    60_000,
  );
});
