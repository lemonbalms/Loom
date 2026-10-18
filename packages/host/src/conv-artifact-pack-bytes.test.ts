/**
 * PLAN 0.45.1 P2 (D2 · R6~R10) — packageWorkerFileArtifact hashes the worker
 * file over its raw bytes, so the wire sha equals what the tower's conv_fetch
 * D6 check computes over the received bytes. Each test runs under its own temp
 * HOME (`HOME` + `LOOM_TEST_HOME`, restored afterwards); scp is injected (no live network). The existing
 * `conv-artifact-pack.test.ts` / `conv-artifact-fetch-store.test.ts` stay untouched.
 */
import { describe, expect, test, afterAll, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { generateConvId, convArtifactsRootLiteral, type ArtifactRefEntry } from "@loom/protocol";
import { convArtifactsDir, packageWorkerFileArtifact } from "./conv-artifact-pack";
import { convFetch, convFetchLocalDir, _resetConvFetchLocksForTests, type ConvFetchRunScp } from "./conv-artifact-fetch";
import { saveConvState, type ConvState } from "./conv-state";
import { saveConvNodeHosts } from "./conv-node-hosts";
import { resetStateHomeDirCache, loomDir } from "./session-store";

const base = join(tmpdir(), `loom-conv-artifact-pack-bytes-${Date.now()}`);
let caseNo = 0;

const PEER = "p_aaaaaaaaaaaaab02";
const HOST = "node-alias";
const SEQ = 4;
const INDEX = 0;

/** Invalid UTF-8: "ok" + 0xFF 0xFE (never valid) + "\n" (R10 ①). */
const INVALID_UTF8 = Buffer.from([0x6f, 0x6b, 0xff, 0xfe, 0x0a]);
/** BOM + "hi" (R7 · R66-L1). */
const BOM_UTF8 = Buffer.from([0xef, 0xbb, 0xbf, 0x68, 0x69]);
/** Valid multibyte UTF-8: Hangul + emoji (surrogate pair) + newline. */
const MULTIBYTE_UTF8 = Buffer.from("한글 ✓ 😀\n", "utf8");

let stderrLines: string[] = [];
let origConsoleError: typeof console.error;
const prevHome = process.env.HOME;
const prevLoomTestHome = process.env.LOOM_TEST_HOME;

function restoreEnv(key: "HOME" | "LOOM_TEST_HOME", prev: string | undefined): void {
  if (prev === undefined) delete process.env[key];
  else process.env[key] = prev;
}

beforeEach(() => {
  caseNo += 1;
  const home = join(base, `case-${caseNo}`);
  mkdirSync(home, { recursive: true });
  process.env.HOME = home;
  process.env.LOOM_TEST_HOME = home;
  resetStateHomeDirCache();
  saveConvNodeHosts({});
  _resetConvFetchLocksForTests();
  stderrLines = [];
  origConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    stderrLines.push(args.map((a) => String(a)).join(" "));
  };
});

afterEach(() => {
  console.error = origConsoleError;
});

afterAll(() => {
  restoreEnv("HOME", prevHome);
  restoreEnv("LOOM_TEST_HOME", prevLoomTestHome);
  resetStateHomeDirCache();
  try {
    rmSync(base, { recursive: true, force: true });
  } catch {
    /* */
  }
});

function shaOf(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

/** Worker side: drop `bytes` as `filename` into the conv artifacts dir, then pack it. */
function packWorkerFile(convId: string, filename: string, bytes: Buffer): ArtifactRefEntry {
  const dir = convArtifactsDir(convId);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(join(dir, filename), bytes);
  const r = packageWorkerFileArtifact({ convId, filename, bridgeDisplayName: "bridge-test" });
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error(r.reason);
  return r.ref;
}

/** Old `chars` meaning, computed independently: utf8-decoded read of the same file. */
function oldChars(convId: string, filename: string): number {
  return readFileSync(join(convArtifactsDir(convId), filename), "utf8").length;
}

function towerState(convId: string, entries: ArtifactRefEntry[]): ConvState {
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
    artifactsBySeq: { [SEQ]: entries },
  };
}

/** Fake scp: writes the raw `content` bytes to argv's last element. */
function fakeScp(content: Buffer): ConvFetchRunScp {
  return async (argv) => {
    writeFileSync(argv[argv.length - 1]!, content);
    return { exitCode: 0, stderr: "" };
  };
}

// ---------------------------------------------------------------------------
// ① Unit — wire sha = raw-byte sha · chars = readFileSync(path, "utf8").length (R10 ① · R7 · R8)
// ---------------------------------------------------------------------------
describe("packageWorkerFileArtifact hashes raw bytes (D2 · R10 ①)", () => {
  test("invalid UTF-8 bytes → ref.sha256 = sha256(raw bytes) · chars = decoded UTF-16 length", () => {
    const convId = generateConvId();
    const ref = packWorkerFile(convId, "invalid.bin", INVALID_UTF8);
    expect(ref.sha256).toBe(shaOf(INVALID_UTF8));
    const chars = oldChars(convId, "invalid.bin");
    expect(ref.chars).toBe(chars);
    expect(ref.gist).toBe(
      `worker file ${chars} chars (sha256 ${shaOf(INVALID_UTF8).slice(0, 12)}…) — invalid.bin`,
    );
    // Worker file bytes untouched (emission-contract reuse — no rewrite).
    expect(readFileSync(join(convArtifactsDir(convId), "invalid.bin")).equals(INVALID_UTF8)).toBe(true);
  });

  test("BOM file (regression guard — green on old code too) → ref.sha256 = sha256(raw bytes) · chars = toString length", () => {
    const convId = generateConvId();
    const ref = packWorkerFile(convId, "bom.txt", BOM_UTF8);
    expect(ref.sha256).toBe(shaOf(BOM_UTF8));
    expect(ref.chars).toBe(oldChars(convId, "bom.txt"));
  });

  test("valid multibyte UTF-8 (regression guard — green on old code too) → ref.sha256 = sha256(raw bytes) · chars = toString length", () => {
    const convId = generateConvId();
    const ref = packWorkerFile(convId, "multibyte.txt", MULTIBYTE_UTF8);
    expect(ref.sha256).toBe(shaOf(MULTIBYTE_UTF8));
    expect(ref.chars).toBe(oldChars(convId, "multibyte.txt"));
  });
});

// ---------------------------------------------------------------------------
// ② stat → read size race (R10 ②) — no injection point; production gets none.
// ---------------------------------------------------------------------------
describe("stat → read size race (D2 · R10 ②)", () => {
  test.todo("file grows past MAX_WORKER_ARTIFACT_BYTES between statSync and read → file_too_large", () => {});
});

// ---------------------------------------------------------------------------
// ③ Round trip — pack on the bridge (convId A) → tower conv_fetch (convId B) (R10 ③ · D3)
// ---------------------------------------------------------------------------
describe("pack → conv_fetch round trip with invalid UTF-8 (D2 · R10 ③)", () => {
  test("packed ref passes tower D6 · blob sha256/<p>/<raw sha> present · one index row", async () => {
    const convA = generateConvId();
    const convB = generateConvId();
    const name = "invalid.bin";
    const packed = packWorkerFile(convA, name, INVALID_UTF8);
    const rawSha = shaOf(INVALID_UTF8);

    const decoy: ArtifactRefEntry = {
      transport: "scp",
      ref: { path: `${convArtifactsRootLiteral(convB)}/decoy.txt`, host: "wire-ignored" },
      sha256: shaOf(Buffer.from("decoy")),
      chars: 5,
    };
    const entry: ArtifactRefEntry = {
      ...packed,
      ref: { host: "wire-ignored", path: `${convArtifactsRootLiteral(convB)}/${name}` },
    };
    // INDEX 0 = the packed entry; index 1 is a decoy.
    saveConvState(towerState(convB, [entry, decoy]));
    saveConvNodeHosts({ [PEER]: HOST });

    const r = await convFetch({ convId: convB, seq: SEQ, index: INDEX, runScp: fakeScp(INVALID_UTF8) });

    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(r.error);
    expect(r.sha256).toBe(rawSha);
    const destPath = join(realpathSync(convFetchLocalDir(convB)), name);
    expect(r.destPath).toBe(destPath);
    expect(readFileSync(destPath).equals(INVALID_UTF8)).toBe(true);

    const blob = join(loomDir(), "artifacts", "sha256", rawSha.slice(0, 2), rawSha);
    expect(existsSync(blob)).toBe(true);
    expect(readFileSync(blob).equals(INVALID_UTF8)).toBe(true);

    const indexPath = join(loomDir(), "artifacts", "index.jsonl");
    const lines = readFileSync(indexPath, "utf8")
      .split("\n")
      .filter((l) => l !== "");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({ sha256: rawSha, name, convId: convB, seq: SEQ, index: INDEX });
    expect(stderrLines.filter((l) => l.includes("artifact store"))).toEqual([]);
  });
});
