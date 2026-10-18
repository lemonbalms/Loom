/**
 * PLAN 0.45.0 P4 — `loom artifacts list|verify` through the bundled CLI (D9 · ⑦ P4). Declared green from the
 * start (P4 follows P3 — this checks the bundle path, it is not a red test).
 *
 * `beforeAll` bundles `packages/cli/src/index.ts` the way `build:cli` does (`bun build … --target=bun`)
 * into a temp outfile — the committed `dist/` is never read. Each case runs `bun <tmp>/loom.js artifacts …`
 * with HOME = LOOM_TEST_HOME = a fresh temp dir and every LOOM_* / FABLE_* var (relay token · url · card ·
 * profile) removed, then checks exit · stdout · stderr and that nothing else changed. The store is written by
 * hand (blob 0600 under 0700 dirs · `index.jsonl` 0600) — the CLI only reads it.
 * The four ⑦ P4 cases: list rows · no rows · verify problems · the LOOM_CARD refusal (`--help` included).
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ENTRY = join(import.meta.dir, "index.ts");
const REFUSAL =
  "loom artifacts: refused — LOOM_CARD is set (this shell belongs to a Loom card worker); the artifact store is for the operator.";
const CONV = "conv_0123456789abcdef";
const AT = "2026-10-18T00:00:00.000Z";

let BUILD: string;
let BUNDLE: string;

beforeAll(() => {
  BUILD = mkdtempSync(join(tmpdir(), "loom-artifactsdist-build-"));
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
  return spawnSync(process.execPath, [BUNDLE, "artifacts", ...args], {
    env: childEnv(T, extra),
    encoding: "utf8",
    timeout: 20_000,
  });
}

const sha256 = (b: string) => createHash("sha256").update(b, "utf8").digest("hex");

/** Writes the blob for `content` under `<T>/.loom/artifacts/sha256/<2>/<64>` (0600 · dirs 0700); returns its sha. */
function writeBlob(T: string, content: string): string {
  const sha = sha256(content);
  const dir = join(T, ".loom", "artifacts", "sha256", sha.slice(0, 2));
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(join(dir, sha), content, { mode: 0o600 });
  return sha;
}

/** Writes `<T>/.loom/artifacts/index.jsonl` (0600) with one row per entry, file order = given order. */
function writeIndex(T: string, rows: { sha: string; bytes: number; name: string; seq: number; index: number }[]): void {
  const dir = join(T, ".loom", "artifacts");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const lines = rows.map((r) =>
    JSON.stringify({
      v: 1,
      sha256: r.sha,
      bytes: r.bytes,
      name: r.name,
      convId: CONV,
      seq: r.seq,
      index: r.index,
      transport: "scp",
      status: "present",
      at: AT,
    }),
  );
  writeFileSync(join(dir, "index.jsonl"), lines.map((l) => `${l}\n`).join(""), { mode: 0o600 });
}

/** Names + kinds + sizes + mtimes + modes under `dir` (sorted, recursive), without bun's own `Library/Caches`. */
function snapshotHome(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string, rel: string) => {
    for (const name of readdirSync(d).sort()) {
      const abs = join(d, name);
      const st = lstatSync(abs);
      const kind = st.isSymbolicLink() ? "l" : st.isDirectory() ? "d" : "f";
      out.push(`${rel}${name} ${kind} ${st.size} ${st.mtimeMs} ${(st.mode & 0o777).toString(8)}`);
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

describe("dist: bun <tmp>/loom.js artifacts list|verify (HOME = LOOM_TEST_HOME = temp) — D9 · ⑦ P4", () => {
  test(
    "list rows → newest first + the tail on stdout, exit 0; --json → row lines + summary; nothing written",
    () => {
      withHome("loom-artifactsdist-list-", (T) => {
        const a = writeBlob(T, "alpha artifact\n");
        const b = writeBlob(T, "beta\n");
        writeIndex(T, [
          { sha: a, bytes: 15, name: "a.txt", seq: 1, index: 0 },
          { sha: b, bytes: 5, name: "b.txt", seq: 2, index: 1 },
        ]);
        const before = snapshotHome(T);
        const r = runDist(T, ["list"]);
        expect(r.stderr).toBe("");
        expect(r.stdout).toBe(
          [
            `${AT} · ${b} · 5 B · conv ${CONV} · seq 2 · index 1 · b.txt`,
            `${AT} · ${a} · 15 B · conv ${CONV} · seq 1 · index 0 · a.txt`,
            "2 rows · 0 torn lines",
            "",
          ].join("\n"),
        );
        expect(r.status).toBe(0);

        const j = runDist(T, ["list", "--json", "--limit", "1"]);
        expect(j.stderr).toBe("");
        expect(j.stdout).toBe(
          `{"v":1,"sha256":"${b}","bytes":5,"name":"b.txt","convId":"${CONV}","seq":2,"index":1,"transport":"scp","status":"present","at":"${AT}"}\n` +
            '{"summary":{"rows":1,"torn":0}}\n',
        );
        expect(j.status).toBe(0);
        expect(snapshotHome(T)).toEqual(before);
      });
    },
    60_000,
  );

  test(
    "no rows → only the tail, exit 1; an empty home → list exit 1 · verify exit 0, no state root created",
    () => {
      withHome("loom-artifactsdist-none-", (T) => {
        const a = writeBlob(T, "alpha artifact\n");
        writeIndex(T, [{ sha: a, bytes: 15, name: "a.txt", seq: 1, index: 0 }]);
        const r = runDist(T, ["list", "--conv", "conv_ffffffffffffffff"]);
        expect(r.stderr).toBe("");
        expect(r.stdout).toBe("0 rows · 0 torn lines\n");
        expect(r.status).toBe(1);
      });
      withHome("loom-artifactsdist-empty-", (T) => {
        const before = snapshotHome(T);
        const r = runDist(T, ["list"]);
        expect(r.stderr).toBe("");
        expect(r.stdout).toBe("0 rows · 0 torn lines\n");
        expect(r.status).toBe(1);
        const v = runDist(T, ["verify"]);
        expect(v.stderr).toBe("");
        expect(v.stdout).toBe("0 blobs checked · 0 problems · 0 orphans · 0 torn lines\n");
        expect(v.status).toBe(0);
        expect(snapshotHome(T)).toEqual(before);
        expect(readdirSync(T).filter((n) => n === ".loom" || n === ".fable")).toEqual([]);
      });
    },
    60_000,
  );

  test(
    "verify problems → a problem line per bad sha, an info line per orphan, the tail, exit 1; nothing written",
    () => {
      withHome("loom-artifactsdist-verify-", (T) => {
        const good = writeBlob(T, "alpha artifact\n");
        const orphan = writeBlob(T, "orphan bytes\n");
        const missing = sha256("never stored\n");
        writeIndex(T, [
          { sha: good, bytes: 15, name: "a.txt", seq: 1, index: 0 },
          { sha: missing, bytes: 13, name: "gone.txt", seq: 2, index: 0 },
        ]);
        const before = snapshotHome(T);
        const r = runDist(T, ["verify"]);
        expect(r.stderr).toBe("");
        expect(r.stdout).toBe(
          [
            `problem: ${missing} — missing`,
            `info: orphan sha256/${orphan.slice(0, 2)}/${orphan}`,
            "2 blobs checked · 1 problems · 1 orphans · 0 torn lines",
            "",
          ].join("\n"),
        );
        expect(r.status).toBe(1);

        const j = runDist(T, ["verify", "--json"]);
        expect(j.stderr).toBe("");
        expect(j.stdout).toBe(
          `{"problem":{"sha256":"${missing}","reason":"missing"}}\n` +
            `{"info":{"name":"sha256/${orphan.slice(0, 2)}/${orphan}"}}\n` +
            '{"summary":{"checked":2,"problems":1,"orphans":1,"torn":0}}\n',
        );
        expect(j.status).toBe(1);
        expect(snapshotHome(T)).toEqual(before);
      });
    },
    60_000,
  );

  test(
    "LOOM_CARD=x → the refusal on stderr, exit 2, nothing on stdout, no state root (with --help and --profile too)",
    () => {
      withHome("loom-artifactsdist-card-", (T) => {
        for (const args of [["list"], ["verify"], ["--help"], ["list", "--profile", "p", "--help"], []]) {
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
