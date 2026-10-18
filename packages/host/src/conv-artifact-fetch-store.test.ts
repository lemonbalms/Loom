/**
 * PLAN 0.45.0 P2 (D3 · D8 · R1 · R10 · R16) — conv_fetch → artifact store hook.
 * scp is injected via runScp (fake writes the dest) — no live network. Each test
 * runs under its own temp HOME (`LOOM_TEST_HOME`). The existing
 * `conv-artifact-fetch.test.ts` stays untouched.
 */
import { describe, expect, test, afterAll, beforeEach, afterEach } from "bun:test";
import {
  mkdirSync,
  rmSync,
  writeFileSync,
  existsSync,
  readFileSync,
  realpathSync,
  lstatSync,
  symlinkSync,
  readlinkSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { generateConvId, convArtifactsRootLiteral, type ArtifactRefEntry } from "@loom/protocol";
import {
  convFetch,
  convFetchLocalDir,
  _resetConvFetchLocksForTests,
  type ConvFetchRunScp,
} from "./conv-artifact-fetch";
import { saveConvState, type ConvState } from "./conv-state";
import { saveConvNodeHosts } from "./conv-node-hosts";
import { resetStateHomeDirCache, loomDir } from "./session-store";

const base = join(tmpdir(), `loom-conv-artifact-fetch-store-${Date.now()}`);
let caseNo = 0;

const PEER = "p_aaaaaaaaaaaaab01";
const HOST = "node-alias";
const SEQ = 3;
const INDEX = 1;

let stderrLines: string[] = [];
let stdoutBytes = 0;
let origConsoleError: typeof console.error;
let origConsoleLog: typeof console.log;
let origStdoutWrite: typeof process.stdout.write;

beforeEach(() => {
  caseNo += 1;
  const home = join(base, `case-${caseNo}`);
  mkdirSync(home, { recursive: true });
  process.env.LOOM_TEST_HOME = home;
  resetStateHomeDirCache();
  saveConvNodeHosts({});
  _resetConvFetchLocksForTests();

  stderrLines = [];
  stdoutBytes = 0;
  origConsoleError = console.error;
  origConsoleLog = console.log;
  origStdoutWrite = process.stdout.write;
  console.error = (...args: unknown[]) => {
    stderrLines.push(args.map((a) => String(a)).join(" "));
  };
  console.log = (...args: unknown[]) => {
    stdoutBytes += Buffer.byteLength(`${args.map((a) => String(a)).join(" ")}\n`);
  };
  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdoutBytes += typeof chunk === "string" ? Buffer.byteLength(chunk) : chunk.byteLength;
    return true;
  }) as typeof process.stdout.write;
});

afterEach(() => {
  console.error = origConsoleError;
  console.log = origConsoleLog;
  process.stdout.write = origStdoutWrite;
});

afterAll(() => {
  delete process.env.LOOM_TEST_HOME;
  resetStateHomeDirCache();
  try {
    rmSync(base, { recursive: true, force: true });
  } catch {
    /* */
  }
});

function shaOf(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function towerState(convId: string, overrides?: Partial<ConvState>): ConvState {
  const now = new Date().toISOString();
  return {
    convId,
    role: "tower",
    roomId: "room_test",
    pinnedPeerId: PEER,
    status: "active",
    limits: { maxTurns: 20, wallClockMs: 2 * 60 * 60 * 1000 },
    lastOwnSeq: 0,
    lastPeerSeq: 0,
    turnCount: 0,
    startedAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function scpEntry(convId: string, filename: string, content: string, sha?: string): ArtifactRefEntry {
  return {
    transport: "scp",
    ref: { path: `${convArtifactsRootLiteral(convId)}/${filename}`, host: "wire-ignored" },
    sha256: sha ?? shaOf(content),
    chars: content.length,
  };
}

/** Seed (convId, SEQ, INDEX) → `filename`; index 0 is a decoy entry. */
function seed(convId: string, filename: string, content: string, sha?: string): void {
  const decoy = scpEntry(convId, "decoy.txt", "decoy");
  saveConvState(
    towerState(convId, { artifactsBySeq: { [SEQ]: [decoy, scpEntry(convId, filename, content, sha)] } }),
  );
  saveConvNodeHosts({ [PEER]: HOST });
}

/** Fake scp: writes `content` to argv's last element unless exitCode ≠ 0. */
function fakeScp(content: string | Buffer, exitCode = 0, seen?: { argv: string[] }): ConvFetchRunScp {
  return async (argv) => {
    if (seen) seen.argv = argv;
    if (exitCode === 0) writeFileSync(argv[argv.length - 1]!, content);
    return { exitCode, stderr: exitCode === 0 ? "" : "boom" };
  };
}

function storeDir(): string {
  return join(loomDir(), "artifacts", "sha256");
}

function blobPathOf(sha: string): string {
  return join(storeDir(), sha.slice(0, 2), sha);
}

function indexPath(): string {
  return join(loomDir(), "artifacts", "index.jsonl");
}

function storeLines(): string[] {
  return stderrLines.filter((l) => l.includes("artifact store"));
}

/** What convFetch returned before the hook (0.44 shape — keys and values). */
function expectedResult(argv: string[], destPath: string, body: string) {
  return {
    ok: true as const,
    argv,
    destPath,
    sha256: shaOf(body),
    bytes: Buffer.byteLength(body),
    chars: body.length,
  };
}

// ---------------------------------------------------------------------------
// Successful fetch → one ingest (D3 · R1 · R16)
// ---------------------------------------------------------------------------
describe("conv_fetch success → artifact store (D3 · R1 · R16)", () => {
  test("result unchanged · blob = same inode · one index row with fetch coordinates · stdout 0 bytes", async () => {
    const convId = generateConvId();
    const name = "report.txt";
    const body = "artifact-store-body-0.45";
    const sha = shaOf(body);
    seed(convId, name, body);
    const seen = { argv: [] as string[] };

    const r = await convFetch({ convId, seq: SEQ, index: INDEX, runScp: fakeScp(body, 0, seen) });

    const destPath = join(realpathSync(convFetchLocalDir(convId)), name);
    expect(r).toEqual(expectedResult(seen.argv, destPath, body));
    expect(Object.keys(r).sort()).toEqual(["argv", "bytes", "chars", "destPath", "ok", "sha256"]);
    expect(seen.argv).toEqual(["scp", "-o", "BatchMode=yes", "--", `${HOST}:${convArtifactsRootLiteral(convId)}/${name}`, destPath]);
    expect(stdoutBytes).toBe(0);

    // Hook: blob under sha256/<2>/<64>, hardlinked to the conv file.
    const blob = blobPathOf(sha);
    expect(existsSync(blob)).toBe(true);
    const blobSt = lstatSync(blob);
    const convSt = lstatSync(destPath);
    expect(blobSt.isFile()).toBe(true);
    expect(blobSt.ino).toBe(convSt.ino);
    expect(blobSt.dev).toBe(convSt.dev);
    expect(convSt.nlink).toBe(2);
    expect(blobSt.mode & 0o777).toBe(0o600);
    expect(lstatSync(join(storeDir(), sha.slice(0, 2))).mode & 0o777).toBe(0o700);
    expect(lstatSync(storeDir()).mode & 0o777).toBe(0o700);

    // One index row with the fetch coordinates (② key order).
    expect(existsSync(indexPath())).toBe(true);
    const raw = readFileSync(indexPath(), "utf8");
    const lines = raw.split("\n").filter((l) => l !== "");
    expect(lines).toHaveLength(1);
    expect(raw.endsWith("\n")).toBe(true);
    const row = JSON.parse(lines[0]!);
    expect(Object.keys(row)).toEqual([
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
    expect(row).toMatchObject({
      v: 1,
      sha256: sha,
      bytes: Buffer.byteLength(body),
      name,
      convId,
      seq: SEQ,
      index: INDEX,
      transport: "scp",
      status: "present",
    });
    expect(new Date(row.at).toISOString()).toBe(row.at);
    expect(lstatSync(indexPath()).mode & 0o777).toBe(0o600);

    // Success is quiet; conv file bytes unchanged.
    expect(storeLines()).toEqual([]);
    expect(readFileSync(destPath, "utf8")).toBe(body);
  });
});

// ---------------------------------------------------------------------------
// Ingest failure → fetch result unchanged + one stderr line (D3 · R10 · R16)
// ---------------------------------------------------------------------------
describe("ingest failure is best-effort (D3 · R10 · R16)", () => {
  test("artifacts/sha256 is a regular file → result unchanged · conv file untouched · one `not a directory` line", async () => {
    const convId = generateConvId();
    const name = "blocked.txt";
    const body = "store-blocked-body";
    seed(convId, name, body);
    mkdirSync(join(loomDir(), "artifacts"), { recursive: true, mode: 0o700 });
    writeFileSync(storeDir(), "not a dir");
    const seen = { argv: [] as string[] };

    const r = await convFetch({ convId, seq: SEQ, index: INDEX, runScp: fakeScp(body, 0, seen) });

    const destPath = join(realpathSync(convFetchLocalDir(convId)), name);
    expect(r).toEqual(expectedResult(seen.argv, destPath, body));
    expect(r.ok).toBe(true);
    expect(stdoutBytes).toBe(0);
    expect(readFileSync(destPath, "utf8")).toBe(body);
    const st = lstatSync(destPath);
    expect(st.mode & 0o777).toBe(0o600);
    expect(st.nlink).toBe(1);
    expect(readFileSync(storeDir(), "utf8")).toBe("not a dir");
    expect(existsSync(indexPath())).toBe(false);

    expect(storeLines()).toEqual([
      `[loom] artifact store: skipped — not a directory (convId ${convId} · seq ${SEQ} · index ${INDEX})`,
    ]);
  });

  test("index.jsonl is a symlink → result unchanged · conv bytes untouched · symlink target untouched · one `symlink` line", async () => {
    const convId = generateConvId();
    const name = "linked-index.txt";
    const body = "store-index-symlink-body";
    seed(convId, name, body);
    mkdirSync(join(loomDir(), "artifacts"), { recursive: true, mode: 0o700 });
    const target = join(loomDir(), "elsewhere.jsonl");
    writeFileSync(target, "");
    symlinkSync(target, indexPath());
    const seen = { argv: [] as string[] };

    const r = await convFetch({ convId, seq: SEQ, index: INDEX, runScp: fakeScp(body, 0, seen) });

    const destPath = join(realpathSync(convFetchLocalDir(convId)), name);
    expect(r).toEqual(expectedResult(seen.argv, destPath, body));
    expect(r.ok).toBe(true);
    expect(stdoutBytes).toBe(0);
    expect(readFileSync(destPath, "utf8")).toBe(body);
    expect(lstatSync(destPath).mode & 0o777).toBe(0o600);
    expect(lstatSync(indexPath()).isSymbolicLink()).toBe(true);
    expect(readlinkSync(indexPath())).toBe(target);
    expect(readFileSync(target, "utf8")).toBe("");

    expect(storeLines()).toEqual([
      `[loom] artifact store: skipped — symlink (convId ${convId} · seq ${SEQ} · index ${INDEX})`,
    ]);
  });

  test("P2b (Astra 0172 M): landed name is a symlink to another regular file in the conv dir → result unchanged · no blob · no row · one `symlink` line", async () => {
    const convId = generateConvId();
    const name = "landed-link.txt";
    const body = "store-landed-symlink-body";
    seed(convId, name, body);
    const seen = { argv: [] as string[] };
    const runScp: ConvFetchRunScp = async (argv) => {
      seen.argv = argv;
      const dest = argv[argv.length - 1]!;
      const target = join(dirname(dest), "real-target.txt");
      writeFileSync(target, body);
      symlinkSync(target, dest);
      return { exitCode: 0, stderr: "" };
    };

    const r = await convFetch({ convId, seq: SEQ, index: INDEX, runScp });

    const convDir = realpathSync(convFetchLocalDir(convId));
    const target = join(convDir, "real-target.txt");
    // R40 containment passes (the target is inside the conv dir); the result keeps its 0.44 shape.
    expect(r).toEqual(expectedResult(seen.argv, target, body));
    expect(stdoutBytes).toBe(0);
    expect(lstatSync(join(convDir, name)).isSymbolicLink()).toBe(true);
    expect(readFileSync(target, "utf8")).toBe(body);
    expect(lstatSync(target).nlink).toBe(1);
    expect(existsSync(blobPathOf(shaOf(body)))).toBe(false);
    expect(existsSync(indexPath())).toBe(false);

    expect(storeLines()).toEqual([
      `[loom] artifact store: skipped — symlink (convId ${convId} · seq ${SEQ} · index ${INDEX})`,
    ]);
  });
});

// ---------------------------------------------------------------------------
// Failed fetch → store untouched (D1 "only after success")
// ---------------------------------------------------------------------------
describe("failed fetch never touches the store (D1)", () => {
  function expectStoreUntouched(): void {
    expect(existsSync(storeDir())).toBe(false);
    expect(existsSync(indexPath())).toBe(false);
    expect(storeLines()).toEqual([]);
    expect(stdoutBytes).toBe(0);
  }

  test("D6 sha mismatch → fail · isolated · no blob · no row", async () => {
    const convId = generateConvId();
    seed(convId, "bad-sha.txt", "expected-body");
    const r = await convFetch({ convId, seq: SEQ, index: INDEX, runScp: fakeScp("tampered-body") });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/sha256 mismatch/);
    expect(existsSync(join(convFetchLocalDir(convId), "bad-sha.txt"))).toBe(false);
    expectStoreUntouched();
  });

  test("size over maxBytes → fail · isolated · no blob · no row", async () => {
    const convId = generateConvId();
    const big = "y".repeat(100);
    seed(convId, "big.txt", big);
    const r = await convFetch({ convId, seq: SEQ, index: INDEX, maxBytes: 50, runScp: fakeScp(big) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/exceeds/);
    expect(existsSync(join(convFetchLocalDir(convId), "big.txt"))).toBe(false);
    expectStoreUntouched();
  });

  test("scp exit ≠ 0 → fail · no blob · no row", async () => {
    const convId = generateConvId();
    seed(convId, "nope.txt", "never-written");
    const r = await convFetch({ convId, seq: SEQ, index: INDEX, runScp: fakeScp("never-written", 1) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/scp exited 1/);
    expectStoreUntouched();
  });

  test("validator fail (no conv→node mapping) → scp never runs · no blob · no row", async () => {
    const convId = generateConvId();
    const body = "unmapped";
    saveConvState(towerState(convId, { artifactsBySeq: { [SEQ]: [scpEntry(convId, "decoy.txt", "d"), scpEntry(convId, "u.txt", body)] } }));
    let ran = false;
    const r = await convFetch({
      convId,
      seq: SEQ,
      index: INDEX,
      runScp: async (argv, signal) => {
        ran = true;
        return fakeScp(body)(argv, signal);
      },
    });
    expect(r.ok).toBe(false);
    expect(ran).toBe(false);
    expectStoreUntouched();
  });

  test("overwrite rejected (R40 D5) → existing file untouched · no blob · no row", async () => {
    const convId = generateConvId();
    const body = "new-body";
    seed(convId, "exists.txt", body);
    const destDir = convFetchLocalDir(convId);
    mkdirSync(destDir, { recursive: true });
    writeFileSync(join(destDir, "exists.txt"), "already-here");
    let ran = false;
    const r = await convFetch({
      convId,
      seq: SEQ,
      index: INDEX,
      runScp: async (argv, signal) => {
        ran = true;
        return fakeScp(body)(argv, signal);
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/already exists/);
    expect(ran).toBe(false);
    expect(readFileSync(join(destDir, "exists.txt"), "utf8")).toBe("already-here");
    expectStoreUntouched();
  });
});
