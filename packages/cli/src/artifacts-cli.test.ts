/**
 * PLAN 0.45.0 P3 — `loom artifacts list [--conv <convId>] [--limit <n>] [--json]` · `loom artifacts verify
 * [--json]` (D5 · R2 · R12–R15).
 *
 * In-process tests inject deps (fresh mkdtemp state root per test — `history-cli.test.ts` shape): `resolve`
 * returns the root and is counted (R12 — never called under LOOM_CARD), `list` / `verify` are the real
 * `listArtifactRows` / `verifyArtifactStore` behind call recorders (or a fake result where the store cannot
 * produce the value — escaped reasons / orphan names). The store tree is hand-written: blobs at
 * `artifacts/sha256/<2 hex>/<64 hex>` (0600, dirs 0700) and `artifacts/index.jsonl` rows. The entry-point
 * cases run `packages/cli/src/index.ts` from source with HOME = LOOM_TEST_HOME = a temp dir and every
 * LOOM_* / FABLE_* var (relay token · url · card · profile) removed.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
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
import { join } from "node:path";
import {
  type ArtifactIndexRow,
  type ArtifactListResult,
  type ArtifactVerifyResult,
  listArtifactRows,
  MAX_WORKER_ARTIFACT_BYTES,
  verifyArtifactStore,
} from "@loom/host";
import { type ArtifactsCliDeps, realArtifactsCliDeps, runArtifactsCommand } from "./artifacts-cli";
import { readOnlyStateHome } from "./prompt-cli";

const USAGE =
  "loom artifacts: usage: loom artifacts list [--conv <convId>] [--limit <n>] [--json] | loom artifacts verify [--json]";
const REFUSAL =
  "loom artifacts: refused — LOOM_CARD is set (this shell belongs to a Loom card worker); the artifact store is for the operator.";

const listTail = (rows: number, torn: number) => `${rows} rows · ${torn} torn lines`;
const verifyTail = (checked: number, problems: number, orphans: number, torn: number) =>
  `${checked} blobs checked · ${problems} problems · ${orphans} orphans · ${torn} torn lines`;

let R: string;

beforeEach(() => {
  R = mkdtempSync(join(tmpdir(), "loom-artifactscli-"));
});

afterEach(() => {
  rmSync(R, { recursive: true, force: true });
});

type ListFn = (root: string, query: { convId?: string; limit: number }) => ArtifactListResult;
type VerifyFn = (root: string, maxBytes: number) => ArtifactVerifyResult;
type ListCall = { root: string; query: { convId?: string; limit: number } };
type VerifyCall = { root: string; maxBytes: number };
type Run = {
  code: number;
  out: string[];
  err: string[];
  lines: string[];
  resolves: number;
  listCalls: ListCall[];
  verifyCalls: VerifyCall[];
};

function cli(over: { env?: Record<string, string | undefined>; root?: string; list?: ListFn; verify?: VerifyFn } = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const listCalls: ListCall[] = [];
  const verifyCalls: VerifyCall[] = [];
  let resolves = 0;
  const deps: ArtifactsCliDeps = {
    env: over.env ?? {},
    resolve: () => {
      resolves += 1;
      return over.root ?? R;
    },
    list: (root, query) => {
      listCalls.push({ root, query: { ...query } });
      return (over.list ?? listArtifactRows)(root, query);
    },
    verify: (root, maxBytes) => {
      verifyCalls.push({ root, maxBytes });
      return (over.verify ?? verifyArtifactStore)(root, maxBytes);
    },
    stdout: (l) => out.push(l),
    stderr: (l) => err.push(l),
  };
  return async (
    verb: string,
    flags: Record<string, string | boolean> = {},
    positional: string[] = [],
    passthrough: string[] = [],
  ): Promise<Run> => {
    out.length = 0;
    err.length = 0;
    listCalls.length = 0;
    verifyCalls.length = 0;
    resolves = 0;
    const code = await runArtifactsCommand(verb, { positional, passthrough }, flags, deps);
    // Each printed line must be one terminal line: a stdout call carrying "\n" shows up as extra lines.
    const lines = out.length === 0 ? [] : out.join("\n").split("\n");
    return {
      code,
      out: [...out],
      err: [...err],
      lines,
      resolves,
      listCalls: [...listCalls],
      verifyCalls: [...verifyCalls],
    };
  };
}

const sha256Hex = (b: Buffer): string => createHash("sha256").update(b).digest("hex");

/** Writes a blob for `content` under the store (dirs 0700 · blob `mode`); returns its sha. */
function writeBlob(content: string, root = R, mode = 0o600): string {
  const buf = Buffer.from(content);
  const sha = sha256Hex(buf);
  const dir = join(root, "artifacts", "sha256", sha.slice(0, 2));
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, sha);
  writeFileSync(path, buf, { mode });
  chmodSync(path, mode);
  return sha;
}

function blobPath(sha: string, root = R): string {
  return join(root, "artifacts", "sha256", sha.slice(0, 2), sha);
}

function row(over: Partial<ArtifactIndexRow> & { sha256: string; bytes: number }): ArtifactIndexRow {
  return {
    v: 1,
    sha256: over.sha256,
    bytes: over.bytes,
    name: over.name ?? "out.txt",
    convId: over.convId ?? "conv-1",
    seq: over.seq ?? 1,
    index: over.index ?? 0,
    transport: "scp",
    status: "present",
    at: over.at ?? "2026-10-18T00:00:00.000Z",
  };
}

/** Writes `artifacts/index.jsonl` (0600) from rows (objects → JSON lines) or raw strings. */
function writeIndex(lines: (ArtifactIndexRow | string)[], root = R): string {
  const dir = join(root, "artifacts");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, "index.jsonl");
  writeFileSync(path, lines.map((l) => `${typeof l === "string" ? l : JSON.stringify(l)}\n`).join(""), {
    mode: 0o600,
  });
  return path;
}

/** Names + kinds + sizes + modes + mtimes of every entry under `dir` (sorted, recursive). */
function snapshot(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string, rel: string) => {
    for (const name of readdirSync(d).sort()) {
      const abs = join(d, name);
      const st = lstatSync(abs);
      const kind = st.isSymbolicLink() ? "l" : st.isDirectory() ? "d" : "f";
      out.push(`${rel}${name} ${kind} ${st.size} ${(st.mode & 0o7777).toString(8)} ${st.mtimeMs}`);
      if (kind === "d") walk(abs, `${rel}${name}/`);
    }
  };
  walk(dir, "");
  return out;
}

/** Bidi / separator characters built from code points (kept out of the source text). */
const RLO = String.fromCharCode(0x202e);
const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);

/** Raw C0 (TAB · LF included), DEL, C1, bidi embedding/override/isolate controls — and U+2028/2029 for JSON. */
function hasRawUnsafe(s: string, json: boolean): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c <= 0x1f || (c >= 0x7f && c <= 0x9f)) return true;
    if ((c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069)) return true;
    if (json && (c === 0x2028 || c === 0x2029)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------
// D5 · R12 — LOOM_CARD refusal before argument handling, help and root resolution
// ---------------------------------------------------------------------------------------------

describe("LOOM_CARD refusal (D5 · R12)", () => {
  test("LOOM_CARD set → the refusal on stderr, exit 2, resolve / list / verify never called", async () => {
    const sha = writeBlob("alpha\n");
    writeIndex([row({ sha256: sha, bytes: 6 })]);
    const run = cli({ env: { LOOM_CARD: "card-x" } });
    for (const [verb, flags, pos, pass] of [
      ["list", {}, [], []],
      ["verify", {}, [], []],
      ["", {}, [], []],
      ["list", { help: true }, [], []],
      ["verify", { json: true, conv: "c" }, [], []],
      ["bogus", { limit: "0" }, ["x"], []],
      ["list", {}, [], ["-x"]],
    ] as [string, Record<string, string | boolean>, string[], string[]][]) {
      const r = await run(verb, flags, pos, pass);
      expect(r.code).toBe(2);
      expect(r.out).toEqual([]);
      expect(r.err).toEqual([REFUSAL]);
      expect(r.resolves).toBe(0);
      expect(r.listCalls).toEqual([]);
      expect(r.verifyCalls).toEqual([]);
    }
  });

  test('LOOM_CARD "" = not set → the command runs', async () => {
    const sha = writeBlob("alpha\n");
    writeIndex([row({ sha256: sha, bytes: 6 })]);
    const run = cli({ env: { LOOM_CARD: "" } });
    const l = await run("list");
    expect(l.code).toBe(0);
    expect(l.err).toEqual([]);
    expect(l.resolves).toBe(1);
    expect(l.listCalls.length).toBe(1);
    const v = await run("verify");
    expect(v.code).toBe(0);
    expect(v.err).toEqual([]);
    expect(v.verifyCalls.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------
// R13 — usage table (exit 2, nothing read)
// ---------------------------------------------------------------------------------------------

describe("usage errors → exit 2, store never read (R13)", () => {
  const cases: [string, string, Record<string, string | boolean>, string[], string[]][] = [
    ["no verb", "", {}, [], []],
    ["unknown verb", "show", {}, [], []],
    ["unknown verb gc", "gc", {}, [], []],
    ["list with an extra positional", "list", {}, ["x"], []],
    ["verify with an extra positional", "verify", {}, ["x"], []],
    ["list with a passthrough word", "list", {}, [], ["-x"]],
    ["verify with a passthrough word", "verify", {}, [], ["-x"]],
    ["--limit 0", "list", { limit: "0" }, [], []],
    ["--limit 501", "list", { limit: "501" }, [], []],
    ["--limit 01", "list", { limit: "01" }, [], []],
    ["--limit -1", "list", { limit: "-1" }, [], []],
    ["--limit 1.5", "list", { limit: "1.5" }, [], []],
    ["--limit without a value", "list", { limit: true }, [], []],
    ["--conv without a value", "list", { conv: true }, [], []],
    ["--conv empty", "list", { conv: "" }, [], []],
    ["--json with a string value", "list", { json: "x" }, [], []],
    ["verify --conv x", "verify", { conv: "x" }, [], []],
    ["verify --limit 5", "verify", { limit: "5" }, [], []],
    ["verify --json with a string value", "verify", { json: "x" }, [], []],
  ];
  for (const [name, verb, flags, pos, pass] of cases) {
    test(name, async () => {
      const sha = writeBlob("alpha\n");
      writeIndex([row({ sha256: sha, bytes: 6 })]);
      const r = await cli()(verb, flags, pos, pass);
      expect(r.code).toBe(2);
      expect(r.out).toEqual([]);
      expect(r.err).toEqual([USAGE]);
      expect(r.listCalls).toEqual([]);
      expect(r.verifyCalls).toEqual([]);
    });
  }

  test("boundary values are accepted: --limit 1 · --limit 500 · --conv c · unknown / --profile flags ignored", async () => {
    const sha = writeBlob("alpha\n");
    writeIndex([row({ sha256: sha, bytes: 6, convId: "c" })]);
    const run = cli();
    for (const flags of [
      { limit: "1" },
      { limit: "500" },
      { conv: "c" },
      { profile: "work", unknown: "x", all: true },
      { json: true },
    ] as Record<string, string | boolean>[]) {
      const r = await run("list", flags);
      expect(r.err).toEqual([]);
      expect(r.code).toBe(0);
      expect(r.listCalls.length).toBe(1);
    }
    const v = await run("verify", { profile: "work", unknown: "x" });
    expect(v.err).toEqual([]);
    expect(v.code).toBe(0);
  });
});

describe("values handed to the store (R13 · ②)", () => {
  test("list: resolved root · default limit 50 · no convId", async () => {
    const r = await cli()("list");
    expect(r.listCalls.length).toBe(1);
    expect(r.listCalls[0]!.root).toBe(R);
    expect(r.listCalls[0]!.query.limit).toBe(50);
    expect(r.listCalls[0]!.query.convId).toBeUndefined();
    expect(r.verifyCalls).toEqual([]);
  });

  test("list: --conv · --limit go through as checked values", async () => {
    const r = await cli()("list", { conv: "conv-9", limit: "7" });
    expect(r.listCalls[0]!.query).toEqual({ convId: "conv-9", limit: 7 });
  });

  test("verify: resolved root · blob cap = MAX_WORKER_ARTIFACT_BYTES (10 MiB)", async () => {
    const r = await cli()("verify");
    expect(r.verifyCalls).toEqual([{ root: R, maxBytes: MAX_WORKER_ARTIFACT_BYTES }]);
    expect(MAX_WORKER_ARTIFACT_BYTES).toBe(10 * 1024 * 1024);
    expect(r.listCalls).toEqual([]);
  });

  test("the default limit 50 caps the printed rows", async () => {
    const sha = writeBlob("alpha\n");
    writeIndex(Array.from({ length: 51 }, (_, i) => row({ sha256: sha, bytes: 6, seq: i + 1 })));
    const r = await cli()("list");
    expect(r.code).toBe(0);
    expect(r.lines.length).toBe(51);
    expect(r.lines[0]).toContain(" · seq 51 · ");
    expect(r.lines[49]).toContain(" · seq 2 · ");
    expect(r.lines[50]).toBe(listTail(50, 0));
  });
});

// ---------------------------------------------------------------------------------------------
// D5 · R14 · R15 — list output verbatim
// ---------------------------------------------------------------------------------------------

describe("list human output verbatim (D5 · R14 · R15)", () => {
  test("one line per row, newest first, then the tail; torn lines counted over the whole file", async () => {
    const a = writeBlob("alpha\n");
    const b = writeBlob("bravo!\n");
    writeIndex([
      row({ sha256: a, bytes: 6, convId: "conv-1", seq: 1, index: 0, name: "a.txt", at: "2026-10-18T01:00:00.000Z" }),
      "{not json",
      row({ sha256: b, bytes: 7, convId: "conv-2", seq: 4, index: 2, name: "b.bin", at: "2026-10-18T02:00:00.000Z" }),
      "",
    ]);
    const r = await cli()("list");
    expect(r.err).toEqual([]);
    expect(r.code).toBe(0);
    expect(r.lines).toEqual([
      `2026-10-18T02:00:00.000Z · ${b} · 7 B · conv conv-2 · seq 4 · index 2 · b.bin`,
      `2026-10-18T01:00:00.000Z · ${a} · 6 B · conv conv-1 · seq 1 · index 0 · a.txt`,
      listTail(2, 1),
    ]);
  });

  test("--conv filters exactly; --limit stops the output; the tail counts printed rows", async () => {
    const a = writeBlob("alpha\n");
    writeIndex([
      row({ sha256: a, bytes: 6, convId: "conv-1", seq: 1 }),
      row({ sha256: a, bytes: 6, convId: "conv-10", seq: 2 }),
      row({ sha256: a, bytes: 6, convId: "conv-1", seq: 3 }),
      row({ sha256: a, bytes: 6, convId: "conv-1", seq: 4 }),
    ]);
    const r = await cli()("list", { conv: "conv-1", limit: "2" });
    expect(r.code).toBe(0);
    expect(r.lines).toEqual([
      `2026-10-18T00:00:00.000Z · ${a} · 6 B · conv conv-1 · seq 4 · index 0 · out.txt`,
      `2026-10-18T00:00:00.000Z · ${a} · 6 B · conv conv-1 · seq 3 · index 0 · out.txt`,
      listTail(2, 0),
    ]);
  });

  test("no rows → only the tail, exit 1 (no index · empty store · --conv with no match)", async () => {
    const empty = await cli()("list");
    expect(empty.code).toBe(1);
    expect(empty.err).toEqual([]);
    expect(empty.lines).toEqual([listTail(0, 0)]);

    const missing = await cli({ root: join(R, "does-not-exist") })("list");
    expect(missing.code).toBe(1);
    expect(missing.lines).toEqual([listTail(0, 0)]);

    const a = writeBlob("alpha\n");
    writeIndex([row({ sha256: a, bytes: 6, convId: "conv-1" }), "torn"]);
    const nomatch = await cli()("list", { conv: "conv-2" });
    expect(nomatch.code).toBe(1);
    expect(nomatch.lines).toEqual([listTail(0, 1)]);
  });
});

describe("list --json verbatim (D5 · R14)", () => {
  test("one object per row in ArtifactIndexRow key order, newest first, then the summary", async () => {
    const a = writeBlob("alpha\n");
    writeIndex([
      row({ sha256: a, bytes: 6, convId: "conv-1", seq: 1, index: 0, name: "a.txt", at: "2026-10-18T01:00:00.000Z" }),
      row({ sha256: a, bytes: 6, convId: "conv-2", seq: 2, index: 1, name: "b.txt", at: "2026-10-18T02:00:00.000Z" }),
      "torn",
    ]);
    const r = await cli()("list", { json: true });
    expect(r.code).toBe(0);
    expect(r.err).toEqual([]);
    expect(r.lines).toEqual([
      `{"v":1,"sha256":"${a}","bytes":6,"name":"b.txt","convId":"conv-2","seq":2,"index":1,"transport":"scp","status":"present","at":"2026-10-18T02:00:00.000Z"}`,
      `{"v":1,"sha256":"${a}","bytes":6,"name":"a.txt","convId":"conv-1","seq":1,"index":0,"transport":"scp","status":"present","at":"2026-10-18T01:00:00.000Z"}`,
      '{"summary":{"rows":2,"torn":1}}',
    ]);
  });

  test("no rows → the summary line only, exit 1", async () => {
    const r = await cli()("list", { json: true });
    expect(r.code).toBe(1);
    expect(r.lines).toEqual(['{"summary":{"rows":0,"torn":0}}']);
  });
});

// ---------------------------------------------------------------------------------------------
// D5 · R14 · R15 — verify output verbatim
// ---------------------------------------------------------------------------------------------

/** good (indexed, intact) · gone (indexed, no blob) · exec (indexed, 0700) · orphan (blob, not indexed). */
function verifyFixture(): { good: string; gone: string; exec: string; orphan: string } {
  const good = writeBlob("good bytes\n");
  const gone = sha256Hex(Buffer.from("never stored\n"));
  const exec = writeBlob("exec bytes\n", R, 0o700);
  const orphan = writeBlob("orphan bytes\n");
  writeIndex([
    row({ sha256: good, bytes: 11, seq: 1 }),
    row({ sha256: gone, bytes: 13, seq: 2 }),
    "{torn",
    row({ sha256: exec, bytes: 11, seq: 3 }),
    row({ sha256: good, bytes: 11, seq: 4, convId: "conv-2" }),
  ]);
  return { good, gone, exec, orphan };
}

describe("verify human output verbatim (D5 · R14 · R15)", () => {
  test("problem lines (sha order) · info orphan lines · tail; problems → exit 1", async () => {
    const { gone, exec, orphan } = verifyFixture();
    const problems = [
      { sha: gone, reason: "missing" },
      { sha: exec, reason: "exec bit" },
    ].sort((x, y) => (x.sha < y.sha ? -1 : 1));
    const r = await cli()("verify");
    expect(r.err).toEqual([]);
    expect(r.code).toBe(1);
    expect(r.lines).toEqual([
      ...problems.map((p) => `problem: ${p.sha} — ${p.reason}`),
      `info: orphan sha256/${orphan.slice(0, 2)}/${orphan}`,
      verifyTail(3, 2, 1, 1),
    ]);
  });

  test("an intact store → only the tail, exit 0; orphans only → info lines, exit 0", async () => {
    const good = writeBlob("good bytes\n");
    writeIndex([row({ sha256: good, bytes: 11 })]);
    const ok = await cli()("verify");
    expect(ok.code).toBe(0);
    expect(ok.err).toEqual([]);
    expect(ok.lines).toEqual([verifyTail(1, 0, 0, 0)]);

    rmSync(join(R, "artifacts", "index.jsonl"));
    const orphansOnly = await cli()("verify");
    expect(orphansOnly.code).toBe(0);
    expect(orphansOnly.lines).toEqual([`info: orphan sha256/${good.slice(0, 2)}/${good}`, verifyTail(0, 0, 1, 0)]);
  });

  test("no store at all → zero tail, exit 0", async () => {
    const r = await cli()("verify");
    expect(r.code).toBe(0);
    expect(r.lines).toEqual([verifyTail(0, 0, 0, 0)]);
  });

  test("size mismatch · sha mismatch (shared inode overwrite — D7) · bytes disagree are reported", async () => {
    const trunc = writeBlob("truncated bytes\n");
    const over = writeBlob("overwrite me!\n");
    writeFileSync(blobPath(trunc), "trunc\n");
    writeFileSync(blobPath(over), "OVERWRITE ME!\n");
    const split = writeBlob("split\n");
    writeIndex([
      row({ sha256: trunc, bytes: 16 }),
      row({ sha256: over, bytes: 14 }),
      row({ sha256: split, bytes: 6 }),
      row({ sha256: split, bytes: 7 }),
    ]);
    const expected = [
      { sha: trunc, reason: "size mismatch" },
      { sha: over, reason: "sha mismatch" },
      { sha: split, reason: "bytes disagree" },
    ].sort((x, y) => (x.sha < y.sha ? -1 : 1));
    const r = await cli()("verify");
    expect(r.code).toBe(1);
    expect(r.lines).toEqual([...expected.map((p) => `problem: ${p.sha} — ${p.reason}`), verifyTail(3, 3, 0, 0)]);
  });
});

describe("verify --json verbatim (D5 · R14)", () => {
  test("{problem} per problem · {info} per orphan · {summary} last", async () => {
    const { gone, exec, orphan } = verifyFixture();
    const problems = [
      { sha256: gone, reason: "missing" },
      { sha256: exec, reason: "exec bit" },
    ].sort((x, y) => (x.sha256 < y.sha256 ? -1 : 1));
    const r = await cli()("verify", { json: true });
    expect(r.code).toBe(1);
    expect(r.err).toEqual([]);
    expect(r.lines).toEqual([
      ...problems.map((p) => `{"problem":{"sha256":"${p.sha256}","reason":"${p.reason}"}}`),
      `{"info":{"name":"sha256/${orphan.slice(0, 2)}/${orphan}"}}`,
      '{"summary":{"checked":3,"problems":2,"orphans":1,"torn":1}}',
    ]);
  });

  test("an empty store → the summary line only, exit 0", async () => {
    const r = await cli()("verify", { json: true });
    expect(r.code).toBe(0);
    expect(r.lines).toEqual(['{"summary":{"checked":0,"problems":0,"orphans":0,"torn":0}}']);
  });
});

// ---------------------------------------------------------------------------------------------
// D5 · R11 — unreadable index → exit 2
// ---------------------------------------------------------------------------------------------

describe("unreadable index → stderr reason, exit 2, no stdout (D5 · R11)", () => {
  test("artifacts/sha256 is a regular file → `index unreadable — not a directory` (list · verify · --json)", async () => {
    mkdirSync(join(R, "artifacts"), { recursive: true });
    writeFileSync(join(R, "artifacts", "sha256"), "not a dir");
    writeIndex([row({ sha256: "a".repeat(64), bytes: 1 })]);
    const run = cli();
    for (const [verb, flags] of [
      ["list", {}],
      ["list", { json: true }],
      ["verify", {}],
      ["verify", { json: true }],
    ] as [string, Record<string, string | boolean>][]) {
      const r = await run(verb, flags);
      expect(r.code).toBe(2);
      expect(r.out).toEqual([]);
      expect(r.err).toEqual(["loom artifacts: index unreadable — not a directory"]);
    }
  });

  test("index.jsonl is a symlink → `index unreadable — not a regular file`", async () => {
    mkdirSync(join(R, "artifacts"), { recursive: true });
    writeFileSync(join(R, "real.jsonl"), `${JSON.stringify(row({ sha256: "b".repeat(64), bytes: 1 }))}\n`);
    symlinkSync(join(R, "real.jsonl"), join(R, "artifacts", "index.jsonl"));
    const run = cli();
    for (const verb of ["list", "verify"]) {
      const r = await run(verb);
      expect(r.code).toBe(2);
      expect(r.out).toEqual([]);
      expect(r.err).toEqual(["loom artifacts: index unreadable — not a regular file"]);
    }
  });

  test("the reason is escaped (store result injected)", async () => {
    const reason = `unreadable E\tX\u001b${RLO}\n`;
    const r = await cli({ list: () => ({ ok: false, reason }) })("list");
    expect(r.code).toBe(2);
    expect(r.out).toEqual([]);
    expect(r.err).toEqual(["loom artifacts: index unreadable — unreadable E\\u{9}X\\u{1b}\\u{202e}\\u{a}"]);
  });
});

// ---------------------------------------------------------------------------------------------
// R14 — escaping
// ---------------------------------------------------------------------------------------------

const NASTY_NAME = `n\u009b${RLO}\u007f\u001b\tN\nlast`;
const NASTY_CONV = `c\u009b\u001b\nC`;

describe("escaping — human output (R14)", () => {
  test("U+009B · U+202E · DEL · ESC · TAB · LF in name / convId → \\u{…}; one line per row; no raw control", async () => {
    const a = writeBlob("alpha\n");
    writeIndex([row({ sha256: a, bytes: 6, name: NASTY_NAME, convId: NASTY_CONV, at: "2026\u001b[2J\t" })]);
    const r = await cli()("list");
    expect(r.code).toBe(0);
    expect(r.lines).toEqual([
      `2026\\u{1b}[2J\\u{9} · ${a} · 6 B · conv c\\u{9b}\\u{1b}\\u{a}C · seq 1 · index 0 · n\\u{9b}\\u{202e}\\u{7f}\\u{1b}\\u{9}N\\u{a}last`,
      listTail(1, 0),
    ]);
    for (const l of r.lines) expect(hasRawUnsafe(l, false)).toBe(false);
  });

  test("LF in name cannot forge a row or the tail", async () => {
    const a = writeBlob("alpha\n");
    writeIndex([row({ sha256: a, bytes: 6, name: `x\n${listTail(9, 9)}\nproblem: y — missing` })]);
    const r = await cli()("list");
    expect(r.lines.length).toBe(2);
    expect(r.lines[1]).toBe(listTail(1, 0));
    expect(r.lines.filter((l) => l === listTail(9, 9) || l.startsWith("problem:"))).toEqual([]);
  });

  test("verify: problem sha / reason and orphan name are escaped (store result injected)", async () => {
    const fake: VerifyFn = () => ({
      ok: true,
      checked: 1,
      problems: [{ sha256: `s\u009b\n`, reason: "unreadable E\tX\u007f" }],
      orphans: [{ name: `sha256/\u009bx${RLO}\nz` }],
      torn: 0,
    });
    const r = await cli({ verify: fake })("verify");
    expect(r.code).toBe(1);
    expect(r.lines).toEqual([
      "problem: s\\u{9b}\\u{a} — unreadable E\\u{9}X\\u{7f}",
      "info: orphan sha256/\\u{9b}x\\u{202e}\\u{a}z",
      verifyTail(1, 1, 1, 0),
    ]);
    for (const l of r.lines) expect(hasRawUnsafe(l, false)).toBe(false);
  });
});

describe("escaping — --json (R14: value-preserving, round-trips through JSON.parse)", () => {
  test("row fields: no raw DEL · C1 · bidi · U+2028/2029 · C0 on the line; JSON.parse gives the original values", async () => {
    const a = writeBlob("alpha\n");
    const name = `${NASTY_NAME}${LS}${PS}`;
    writeIndex([row({ sha256: a, bytes: 6, name, convId: NASTY_CONV })]);
    const r = await cli()("list", { json: true });
    expect(r.code).toBe(0);
    expect(r.lines.length).toBe(2);
    const line = r.lines[0]!;
    expect(hasRawUnsafe(line, true)).toBe(false);
    for (const esc of ["\\u009b", "\\u202e", "\\u007f", "\\u001b", "\\u2028", "\\u2029"]) {
      expect(line.toLowerCase()).toContain(esc);
    }
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual([
      "v",
      "sha256",
      "bytes",
      "name",
      "convId",
      "seq",
      "index",
      "transport",
      "status",
      "at",
    ]);
    expect(parsed).toEqual(row({ sha256: a, bytes: 6, name, convId: NASTY_CONV }));
    expect(JSON.parse(r.lines[1]!)).toEqual({ summary: { rows: 1, torn: 0 } });
  });

  test("verify: reason and orphan name are escaped and round-trip", async () => {
    const reason = `unreadable E\u007f${LS}`;
    const name = `sha256/\u009bx${RLO}${PS}`;
    const fake: VerifyFn = () => ({
      ok: true,
      checked: 1,
      problems: [{ sha256: "c".repeat(64), reason: reason as `unreadable ${string}` }],
      orphans: [{ name }],
      torn: 2,
    });
    const r = await cli({ verify: fake })("verify", { json: true });
    expect(r.code).toBe(1);
    expect(r.lines.length).toBe(3);
    for (const l of r.lines) expect(hasRawUnsafe(l, true)).toBe(false);
    expect(JSON.parse(r.lines[0]!)).toEqual({ problem: { sha256: "c".repeat(64), reason } });
    expect(JSON.parse(r.lines[1]!)).toEqual({ info: { name } });
    expect(JSON.parse(r.lines[2]!)).toEqual({ summary: { checked: 1, problems: 1, orphans: 1, torn: 2 } });
  });

  test("P3b (Astra 0176 L): artifacts-cli imports oneLine · safeJson from ./history-cli and defines no local copy", () => {
    const src = readFileSync(join(import.meta.dir, "artifacts-cli.ts"), "utf8");
    expect(src).toMatch(/import\s*\{[^}]*\boneLine\b[^}]*\}\s*from\s*"\.\/history-cli"/);
    expect(src).toMatch(/import\s*\{[^}]*\bsafeJson\b[^}]*\}\s*from\s*"\.\/history-cli"/);
    expect(src).not.toMatch(/function\s+(oneLine|safeJson)\b/);
    expect(src).not.toMatch(/\b(const|let)\s+(oneLine|safeJson|JSON_UNSAFE_RE)\b/);
  });
});

// ---------------------------------------------------------------------------------------------
// D5 — read-only: list / verify leave the tree untouched
// ---------------------------------------------------------------------------------------------

describe("read-only (D5)", () => {
  test("list · verify (human and --json) change no name · size · mode · mtime", async () => {
    verifyFixture();
    const before = snapshot(R);
    const run = cli();
    await run("list");
    await run("list", { json: true, conv: "conv-2" });
    await run("verify");
    await run("verify", { json: true });
    expect(snapshot(R)).toEqual(before);
  });
});

// ---------------------------------------------------------------------------------------------
// R2 — state root: the read-only mirror shared with `loom prompt show` / `loom history search`
// ---------------------------------------------------------------------------------------------

describe("state root (R2)", () => {
  async function withTestHome<T>(home: string, fn: () => T | Promise<T>): Promise<T> {
    const prev = process.env.LOOM_TEST_HOME;
    process.env.LOOM_TEST_HOME = home;
    try {
      return await fn();
    } finally {
      if (prev === undefined) delete process.env.LOOM_TEST_HOME;
      else process.env.LOOM_TEST_HOME = prev;
    }
  }

  test(".loom exists → .loom (even with .fable present); tree unchanged", async () => {
    mkdirSync(join(R, ".loom"));
    mkdirSync(join(R, ".fable"));
    const before = snapshot(R);
    await withTestHome(R, () => {
      expect(readOnlyStateHome()).toBe(join(R, ".loom"));
      expect(realArtifactsCliDeps().resolve()).toBe(join(R, ".loom"));
    });
    expect(snapshot(R)).toEqual(before);
  });

  test("only .fable → .fable (no migration); tree unchanged", async () => {
    mkdirSync(join(R, ".fable", "artifacts"), { recursive: true });
    const before = snapshot(R);
    await withTestHome(R, () => {
      expect(realArtifactsCliDeps().resolve()).toBe(join(R, ".fable"));
    });
    expect(snapshot(R)).toEqual(before);
  });

  test("neither → .loom, and nothing is created", async () => {
    await withTestHome(R, () => {
      expect(realArtifactsCliDeps().resolve()).toBe(join(R, ".loom"));
    });
    expect(snapshot(R)).toEqual([]);
  });

  test("LOOM_TEST_HOME decides the home; list · verify over it write nothing", async () => {
    const loom = join(R, ".loom");
    const a = writeBlob("alpha\n", loom);
    writeIndex([row({ sha256: a, bytes: 6, name: "under-test-home.txt" }), "torn"], loom);
    mkdirSync(join(R, ".fable"));
    const before = snapshot(R);
    await withTestHome(R, async () => {
      const deps = realArtifactsCliDeps();
      expect(deps.resolve()).toBe(loom);
      const out: string[] = [];
      const sink = { env: {}, stdout: (l: string) => out.push(l), stderr: (l: string) => out.push(`ERR ${l}`) };
      const listCode = await runArtifactsCommand("list", { positional: [], passthrough: [] }, {}, { ...deps, ...sink });
      expect(listCode).toBe(0);
      expect(out).toEqual([
        `2026-10-18T00:00:00.000Z · ${a} · 6 B · conv conv-1 · seq 1 · index 0 · under-test-home.txt`,
        listTail(1, 1),
      ]);
      out.length = 0;
      const verifyCode = await runArtifactsCommand(
        "verify",
        { positional: [], passthrough: [] },
        {},
        { ...deps, ...sink },
      );
      expect(verifyCode).toBe(0);
      expect(out).toEqual([verifyTail(1, 0, 0, 1)]);
    });
    expect(snapshot(R)).toEqual(before);
  });

  test("realArtifactsCliDeps() resolves lazily — building it touches nothing", async () => {
    await withTestHome(R, () => {
      realArtifactsCliDeps();
    });
    expect(snapshot(R)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// R12 — the real entry: refusal before help / --profile on both parses, nothing created
// ---------------------------------------------------------------------------------------------

const CLI = join(import.meta.dir, "index.ts");

function childEnv(T: string, extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue;
    if (/^(LOOM_|FABLE_)/.test(k)) continue; // relay token · url · profile · session · card never leak in
    env[k] = v;
  }
  return { ...env, HOME: T, LOOM_TEST_HOME: T, ...extra };
}

function spawnArtifacts(T: string, args: string[], extra: Record<string, string> = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    env: childEnv(T, extra),
    encoding: "utf8",
    timeout: 20_000,
  });
}

/** A temp HOME's tree without bun's own `Library/Caches` (HOME = T for the child). */
function snapshotHome(T: string): string[] {
  return snapshot(T).filter((l) => !l.startsWith("Library"));
}

describe("spawn: bun packages/cli/src/index.ts artifacts (HOME = LOOM_TEST_HOME = temp) — R12", () => {
  test(
    "LOOM_CARD=x: `artifacts --help` · `artifacts list --profile p` · `--profile p artifacts verify -h` · bare `artifacts` → the refusal, exit 2, no state root",
    () => {
      const T = mkdtempSync(join(tmpdir(), "loom-artifactscli-spawn-"));
      try {
        for (const args of [
          ["artifacts", "--help"],
          ["artifacts", "list", "--profile", "p"],
          ["--profile", "p", "artifacts", "verify", "-h"],
          ["artifacts", "list", "--json", "--conv", "c", "--help"],
          ["artifacts"],
        ]) {
          const before = snapshotHome(T);
          const r = spawnArtifacts(T, args, { LOOM_CARD: "x" });
          expect(r.stdout).toBe("");
          expect(r.stderr).toBe(`${REFUSAL}\n`);
          expect(r.status).toBe(2);
          expect(snapshotHome(T)).toEqual(before);
          expect(readdirSync(T).filter((n) => n === ".loom" || n === ".fable")).toEqual([]);
        }
      } finally {
        rmSync(T, { recursive: true, force: true });
      }
    },
    60_000,
  );

  test(
    "LOOM_CARD=x (0143 form): `--all ignored artifacts list --help` — the scoped and plain parses disagree on the first word → still the refusal, exit 2, no state root",
    () => {
      const T = mkdtempSync(join(tmpdir(), "loom-artifactscli-spawn2-"));
      try {
        for (const args of [
          ["--all", "ignored", "artifacts", "list", "--help"],
          ["--all", "ignored", "artifacts", "verify", "--profile", "p"],
        ]) {
          const before = snapshotHome(T);
          const r = spawnArtifacts(T, args, { LOOM_CARD: "x" });
          expect(r.stdout).toBe("");
          expect(r.stderr).toBe(`${REFUSAL}\n`);
          expect(r.status).toBe(2);
          expect(snapshotHome(T)).toEqual(before);
          expect(readdirSync(T).filter((n) => n === ".loom" || n === ".fable")).toEqual([]);
        }
      } finally {
        rmSync(T, { recursive: true, force: true });
      }
    },
    60_000,
  );

  test(
    "LOOM_CARD=x (0145 form): the refusal follows the dispatch's command — `--all artifacts --json list history` → the artifacts refusal · `--all history search artifacts` → the history refusal",
    () => {
      const HISTORY_REFUSAL =
        "loom history: refused — LOOM_CARD is set (this shell belongs to a Loom card worker); room history is for the operator.";
      const T = mkdtempSync(join(tmpdir(), "loom-artifactscli-spawn3-"));
      try {
        for (const [args, refusal] of [
          [["--all", "artifacts", "--json", "list", "history"], REFUSAL],
          [["--all", "history", "search", "artifacts"], HISTORY_REFUSAL],
        ] as const) {
          const before = snapshotHome(T);
          const r = spawnArtifacts(T, [...args], { LOOM_CARD: "x" });
          expect(r.stdout).toBe("");
          expect(r.stderr).toBe(`${refusal}\n`);
          expect(r.status).toBe(2);
          expect(snapshotHome(T)).toEqual(before);
          expect(readdirSync(T).filter((n) => n === ".loom" || n === ".fable")).toEqual([]);
        }
      } finally {
        rmSync(T, { recursive: true, force: true });
      }
    },
    60_000,
  );

  test(
    "without LOOM_CARD: `artifacts --json list` (--json boolean for artifacts) · `artifacts list` · `artifacts verify` on an empty home → summary / tail, nothing created",
    () => {
      const T = mkdtempSync(join(tmpdir(), "loom-artifactscli-spawn4-"));
      try {
        for (const [args, stdout, status] of [
          [["artifacts", "--json", "list"], '{"summary":{"rows":0,"torn":0}}\n', 1],
          [["artifacts", "list"], `${listTail(0, 0)}\n`, 1],
          [["artifacts", "verify"], `${verifyTail(0, 0, 0, 0)}\n`, 0],
        ] as const) {
          const before = snapshotHome(T);
          const r = spawnArtifacts(T, [...args]);
          expect(r.stderr).toBe("");
          expect(r.stdout).toBe(stdout);
          expect(r.status).toBe(status);
          expect(snapshotHome(T)).toEqual(before);
        }
      } finally {
        rmSync(T, { recursive: true, force: true });
      }
    },
    60_000,
  );

  test(
    "without LOOM_CARD: a usage error from the entry → stderr usage, exit 2",
    () => {
      const T = mkdtempSync(join(tmpdir(), "loom-artifactscli-spawn5-"));
      try {
        for (const args of [
          ["artifacts", "list", "--limit", "0"],
          ["artifacts", "verify", "--conv", "c"],
          ["artifacts", "gc"],
        ]) {
          const r = spawnArtifacts(T, args);
          expect(r.stdout).toBe("");
          expect(r.stderr).toBe(`${USAGE}\n`);
          expect(r.status).toBe(2);
        }
      } finally {
        rmSync(T, { recursive: true, force: true });
      }
    },
    60_000,
  );
});
