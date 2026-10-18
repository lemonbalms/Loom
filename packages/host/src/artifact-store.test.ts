/**
 * PLAN 0.45.0 P1 (tests-first) — content-addressed artifact store (D2 · D3 · D4 · D6 · D7 · R3~R11 · R15).
 * - `ingestFetchedArtifact(input, deps)` · `listArtifactRows(root, query)` · `verifyArtifactStore(root, maxBytes)` (② table).
 * - Conv files are hand-written 0600 under `artifacts/<convId>/`; the store is driven only through the ② seams
 *   (`log` · `link` · `now`). Every root is a fresh mkdtemp dir under tmpdir() (never the real home).
 * The specifier stays a value so this tests-only commit typechecks before the module exists;
 * the missing module is the expected red.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  truncateSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { MAX_WORKER_ARTIFACT_BYTES } from "./conv-artifact-pack";

const ARTIFACT_STORE_SPECIFIER = "./artifact-store";

type ArtifactIndexRow = {
  v: 1;
  sha256: string;
  bytes: number;
  name: string;
  convId: string;
  seq: number;
  index: number;
  transport: "scp";
  status: "present";
  at: string;
};
type ArtifactStoreDeps = {
  log?: (line: string) => void;
  link?: (from: string, to: string) => void;
  now?: () => Date;
  /** @internal P1b seam — the index row write. */
  write?: (fd: number, buf: Buffer) => number;
  /** @internal P1b seam — `"lstat"` before the conv open · `"prelink"` before the link. */
  hook?: (point: "lstat" | "prelink") => void;
};
type SeamDeps = Pick<ArtifactStoreDeps, "link" | "write" | "hook">;
type IngestInput = {
  root: string;
  destPath: string;
  sha256: string;
  bytes: number;
  convId: string;
  seq: number;
  index: number;
  maxBytes: number;
};
type ArtifactListResult =
  | { ok: true; rows: ArtifactIndexRow[]; torn: number }
  | { ok: false; reason: string };
type ArtifactVerifyResult =
  | {
      ok: true;
      checked: number;
      problems: { sha256: string; reason: string }[];
      orphans: { name: string }[];
      torn: number;
    }
  | { ok: false; reason: string };
type ArtifactStoreModule = {
  ingestFetchedArtifact: (input: IngestInput, deps?: ArtifactStoreDeps) => void;
  listArtifactRows: (root: string, query: { convId?: string; limit: number }) => ArtifactListResult;
  verifyArtifactStore: (root: string, maxBytes: number) => ArtifactVerifyResult;
  ARTIFACT_INDEX_ROW_MAX_BYTES: number;
  ARTIFACT_INDEX_READ_MAX_BYTES: number;
  ARTIFACT_LIST_LIMIT_DEFAULT: number;
  ARTIFACT_LIST_LIMIT_MAX: number;
};

async function loadStore(): Promise<ArtifactStoreModule> {
  try {
    return (await import(ARTIFACT_STORE_SPECIFIER)) as ArtifactStoreModule;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `v0.45.0 P1 artifact-store is not implemented (${ARTIFACT_STORE_SPECIFIER}): ${msg}`,
    );
  }
}

const roots: string[] = [];
function tempRoot(label: string): string {
  const d = mkdtempSync(join(tmpdir(), `loom-artifact-store-${label}-`));
  roots.push(d);
  return d;
}
afterAll(() => {
  for (const d of roots) rmSync(d, { recursive: true, force: true });
});

const CONV_A = "conv_0123456789abcdef";
const CONV_B = "conv_fedcba9876543210";
const SEQ = 7;
const INDEX = 2;
const AT = new Date("2026-10-18T01:02:03.004Z");

const sha256Of = (b: Buffer | string): string => createHash("sha256").update(b).digest("hex");
const artifactsDir = (root: string): string => join(root, "artifacts");
const shaDir = (root: string): string => join(root, "artifacts", "sha256");
const prefixDir = (root: string, sha: string): string => join(shaDir(root), sha.slice(0, 2));
const blobPath = (root: string, sha: string): string => join(prefixDir(root, sha), sha);
const indexPath = (root: string): string => join(root, "artifacts", "index.jsonl");
const modeOf = (p: string): number => lstatSync(p).mode & 0o777;
const errno = (code: string): Error => Object.assign(new Error(code), { code });

type Landed = {
  root: string;
  destPath: string;
  sha256: string;
  bytes: number;
  convId: string;
  content: Buffer;
};

/** Writes a conv file as a successful fetch leaves it: `artifacts/<convId>/<name>` · dirs 0700 · file 0600. */
function land(
  root: string,
  content: Buffer | string,
  opts: { convId?: string; name?: string; mode?: number } = {},
): Landed {
  const convId = opts.convId ?? CONV_A;
  const buf = typeof content === "string" ? Buffer.from(content, "utf8") : content;
  const dir = join(artifactsDir(root), convId);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(artifactsDir(root), 0o700);
  chmodSync(dir, 0o700);
  const destPath = join(dir, opts.name ?? "report.txt");
  writeFileSync(destPath, buf, { mode: 0o600 });
  chmodSync(destPath, opts.mode ?? 0o600);
  return { root, destPath, sha256: sha256Of(buf), bytes: buf.length, convId, content: buf };
}

function input(l: Landed, over: Partial<IngestInput> = {}): IngestInput {
  return {
    root: l.root,
    destPath: l.destPath,
    sha256: l.sha256,
    bytes: l.bytes,
    convId: l.convId,
    seq: SEQ,
    index: INDEX,
    maxBytes: MAX_WORKER_ARTIFACT_BYTES,
    ...over,
  };
}

/** Runs one ingest with an injected clock and a capturing log; returns the log lines. */
async function runIngest(inp: IngestInput, deps: SeamDeps = {}): Promise<string[]> {
  const m = await loadStore();
  const logs: string[] = [];
  m.ingestFetchedArtifact(inp, { log: (line) => logs.push(line), now: () => AT, ...deps });
  return logs;
}

const skipLine = (reason: string, convId = CONV_A, seq = SEQ, index = INDEX): string =>
  `[loom] artifact store: skipped — ${reason} (convId ${convId} · seq ${seq} · index ${index})`;

/**
 * Every failure branch: no throw (a throw fails the test) · `log` exactly once with the ② line ·
 * conv file bytes and mode unchanged.
 */
async function expectSkipped(
  inp: IngestInput,
  reason: string,
  deps: SeamDeps = {},
): Promise<void> {
  const beforeMode = lstatSync(inp.destPath).mode;
  const beforeBytes = readFileSync(inp.destPath);
  const logs = await runIngest(inp, deps);
  expect(logs).toEqual([skipLine(reason, inp.convId, inp.seq, inp.index)]);
  expect(lstatSync(inp.destPath).mode).toBe(beforeMode);
  expect(readFileSync(inp.destPath).equals(beforeBytes)).toBe(true);
}

function expectedRow(l: Landed, seq = SEQ, index = INDEX): ArtifactIndexRow {
  return {
    v: 1,
    sha256: l.sha256,
    bytes: l.bytes,
    name: basename(l.destPath),
    convId: l.convId,
    seq,
    index,
    transport: "scp",
    status: "present",
    at: AT.toISOString(),
  };
}
const rowLine = (r: ArtifactIndexRow): string => `${JSON.stringify(r)}\n`;

function expectNoBlobNoRow(root: string, sha: string): void {
  expect(existsSync(blobPath(root, sha))).toBe(false);
  expect(existsSync(indexPath(root))).toBe(false);
}

describe("PLAN 0.45.0 ② — exported constants", () => {
  test("ARTIFACT_* constants carry the pinned values", async () => {
    const m = await loadStore();
    expect(m.ARTIFACT_INDEX_ROW_MAX_BYTES).toBe(4096);
    expect(m.ARTIFACT_INDEX_READ_MAX_BYTES).toBe(64 * 1024 * 1024);
    expect(m.ARTIFACT_LIST_LIMIT_DEFAULT).toBe(50);
    expect(m.ARTIFACT_LIST_LIMIT_MAX).toBe(500);
  });
});

describe("PLAN 0.45.0 P1 ingest table — success (D2 · D3 · D4 · R7 · R9)", () => {
  test("new sha → blob sha256/<2>/<64> · same ino as the conv file · nlink 2 · 0600 · dirs 0700 · one row", async () => {
    const root = tempRoot("new");
    const l = land(root, "artifact bytes\n");
    const logs = await runIngest(input(l));
    expect(logs).toEqual([]);
    const blob = blobPath(root, l.sha256);
    const bst = lstatSync(blob);
    const cst = lstatSync(l.destPath);
    expect(bst.isFile()).toBe(true);
    expect(bst.ino).toBe(cst.ino);
    expect(bst.dev).toBe(cst.dev);
    expect(bst.nlink).toBe(2);
    expect(bst.mode & 0o777).toBe(0o600);
    expect(modeOf(shaDir(root))).toBe(0o700);
    expect(modeOf(prefixDir(root, l.sha256))).toBe(0o700);
    expect(lstatSync(indexPath(root)).isFile()).toBe(true);
    expect(modeOf(indexPath(root))).toBe(0o600);
    // Key order is pinned: the raw line equals JSON.stringify of the ② key order + LF.
    expect(readFileSync(indexPath(root), "utf8")).toBe(rowLine(expectedRow(l)));
  });

  test("same sha twice (two convs) → one blob · two rows · the second conv file is not linked (R8)", async () => {
    const root = tempRoot("twice");
    const a = land(root, "same content");
    const b = land(root, "same content", { convId: CONV_B, name: "copy.txt" });
    expect(await runIngest(input(a))).toEqual([]);
    expect(await runIngest(input(b, { seq: 9, index: 0 }))).toEqual([]);
    const bst = lstatSync(blobPath(root, a.sha256));
    expect(bst.ino).toBe(lstatSync(a.destPath).ino);
    expect(bst.nlink).toBe(2);
    expect(lstatSync(b.destPath).nlink).toBe(1);
    expect(lstatSync(b.destPath).ino).not.toBe(bst.ino);
    expect(readdirSync(prefixDir(root, a.sha256))).toEqual([a.sha256]);
    expect(readFileSync(indexPath(root), "utf8")).toBe(
      rowLine(expectedRow(a)) + rowLine(expectedRow(b, 9, 0)),
    );
  });

  test("link injection EEXIST + blob with the same sha → row appended · blob untouched · conv not linked (R7 → R8)", async () => {
    const root = tempRoot("eexist-same");
    const l = land(root, "racing content");
    const logs = await runIngest(input(l), {
      link: (_from, to) => {
        writeFileSync(to, l.content, { mode: 0o600 });
        throw errno("EEXIST");
      },
    });
    expect(logs).toEqual([]);
    const blob = blobPath(root, l.sha256);
    expect(readFileSync(blob).equals(l.content)).toBe(true);
    expect(lstatSync(blob).ino).not.toBe(lstatSync(l.destPath).ino);
    expect(lstatSync(l.destPath).nlink).toBe(1);
    expect(readFileSync(indexPath(root), "utf8")).toBe(rowLine(expectedRow(l)));
  });
});

describe("PLAN 0.45.0 P1 ingest table — skipped branches (R1 · R3~R10)", () => {
  test("R1 · R64-L2: invalid convId → `convId` · nothing written", async () => {
    const root = tempRoot("convid");
    const l = land(root, "x");
    await expectSkipped(input(l, { convId: "not-a-conv" }), "convId");
    expectNoBlobNoRow(root, l.sha256);
  });

  test("R8: blob present with different content → `blob mismatch` · blob bytes unchanged · no row", async () => {
    const root = tempRoot("mismatch");
    const l = land(root, "the real content");
    mkdirSync(prefixDir(root, l.sha256), { recursive: true, mode: 0o700 });
    const blob = blobPath(root, l.sha256);
    writeFileSync(blob, "an impostor blob", { mode: 0o600 });
    const blobIno = lstatSync(blob).ino;
    await expectSkipped(input(l), "blob mismatch");
    expect(readFileSync(blob, "utf8")).toBe("an impostor blob");
    expect(lstatSync(blob).ino).toBe(blobIno);
    expect(lstatSync(l.destPath).nlink).toBe(1);
    expect(existsSync(indexPath(root))).toBe(false);
  });

  test("link injection EEXIST + blob with a different sha → `blob mismatch` · no row (R7 → R8)", async () => {
    const root = tempRoot("eexist-diff");
    const l = land(root, "racing content");
    await expectSkipped(input(l), "blob mismatch", {
      link: (_from, to) => {
        writeFileSync(to, "someone else", { mode: 0o600 });
        throw errno("EEXIST");
      },
    });
    expect(readFileSync(blobPath(root, l.sha256), "utf8")).toBe("someone else");
    expect(existsSync(indexPath(root))).toBe(false);
  });

  test("R5: actualSha differs from the re-read bytes → `sha changed`", async () => {
    const root = tempRoot("sha-changed");
    const l = land(root, "content");
    await expectSkipped(input(l, { sha256: sha256Of("other content") }), "sha changed");
    expectNoBlobNoRow(root, l.sha256);
  });

  test("R5: size differs from `bytes` → `sha changed`", async () => {
    const root = tempRoot("size-changed");
    const l = land(root, "content");
    await expectSkipped(input(l, { bytes: l.bytes + 1 }), "sha changed");
    expectNoBlobNoRow(root, l.sha256);
  });

  test("R3: conv file is a symlink → `symlink`", async () => {
    const root = tempRoot("conv-symlink");
    const real = land(root, "pointed-at bytes", { name: "real.txt" });
    const linkPath = join(artifactsDir(root), CONV_A, "link.txt");
    symlinkSync(real.destPath, linkPath);
    await expectSkipped(input(real, { destPath: linkPath }), "symlink");
    expectNoBlobNoRow(root, real.sha256);
    expect(lstatSync(real.destPath).nlink).toBe(1);
  });

  test("R4: mode 0644 → `mode 644` · mode 0700 → `mode 700`", async () => {
    const r1 = tempRoot("mode644");
    const l1 = land(r1, "m1", { mode: 0o644 });
    await expectSkipped(input(l1), "mode 644");
    expectNoBlobNoRow(r1, l1.sha256);
    const r2 = tempRoot("mode700");
    const l2 = land(r2, "m2", { mode: 0o700 });
    await expectSkipped(input(l2), "mode 700");
    expectNoBlobNoRow(r2, l2.sha256);
  });

  test("R4 · R64-L1: a pre-existing hard link outside the store (nlink 2) → `nlink 2` · no blob · no row", async () => {
    const root = tempRoot("nlink");
    const l = land(root, "already linked");
    linkSync(l.destPath, join(root, "outside-name"));
    await expectSkipped(input(l), "nlink 2");
    expectNoBlobNoRow(root, l.sha256);
    expect(lstatSync(l.destPath).nlink).toBe(2);
  });

  test("R3 · D6: file over the cap (cap + 1) → `too large`", async () => {
    const root = tempRoot("too-large");
    const l = land(root, Buffer.alloc(65, 0x61));
    await expectSkipped(input(l, { maxBytes: 64 }), "too large");
    expectNoBlobNoRow(root, l.sha256);
  });

  test("R6: `sha256/` is a symlink → `symlink` · nothing lands behind it", async () => {
    const root = tempRoot("shadir-symlink");
    const l = land(root, "c");
    const elsewhere = join(root, "elsewhere");
    mkdirSync(elsewhere, { mode: 0o700 });
    symlinkSync(elsewhere, shaDir(root));
    await expectSkipped(input(l), "symlink");
    expect(readdirSync(elsewhere)).toEqual([]);
    expect(existsSync(indexPath(root))).toBe(false);
  });

  test("R6: `<2 hex>/` is a symlink → `symlink` · nothing lands behind it", async () => {
    const root = tempRoot("prefix-symlink");
    const l = land(root, "c");
    const elsewhere = join(root, "elsewhere");
    mkdirSync(elsewhere, { mode: 0o700 });
    mkdirSync(shaDir(root), { mode: 0o700 });
    symlinkSync(elsewhere, prefixDir(root, l.sha256));
    await expectSkipped(input(l), "symlink");
    expect(readdirSync(elsewhere)).toEqual([]);
    expect(existsSync(indexPath(root))).toBe(false);
  });

  test("R6: `sha256/` is a regular file → `not a directory`", async () => {
    const root = tempRoot("shadir-file");
    const l = land(root, "c");
    writeFileSync(shaDir(root), "x", { mode: 0o600 });
    await expectSkipped(input(l), "not a directory");
    expect(readFileSync(shaDir(root), "utf8")).toBe("x");
    expect(existsSync(indexPath(root))).toBe(false);
  });

  test("R6: `<2 hex>/` is a regular file → `not a directory`", async () => {
    const root = tempRoot("prefix-file");
    const l = land(root, "c");
    mkdirSync(shaDir(root), { mode: 0o700 });
    writeFileSync(prefixDir(root, l.sha256), "x", { mode: 0o600 });
    await expectSkipped(input(l), "not a directory");
    expect(readFileSync(prefixDir(root, l.sha256), "utf8")).toBe("x");
    expect(existsSync(indexPath(root))).toBe(false);
  });

  test("R7: link injection EXDEV → `exdev` · no blob · no row", async () => {
    const root = tempRoot("exdev");
    const l = land(root, "cross device");
    await expectSkipped(input(l), "exdev", {
      link: () => {
        throw errno("EXDEV");
      },
    });
    expectNoBlobNoRow(root, l.sha256);
  });

  /**
   * P1c (Astra 0168): ingest never unlinks — the wrongly linked inode stays under the sha name, no row is
   * appended, one `inode changed` line is logged; once a row lists that sha, `verify` reports `sha mismatch`.
   * The decoy has the same length and different bytes, so the size check passes and the sha check fails.
   */
  async function expectWrongBlobLeft(root: string, l: Landed, decoyIno: number): Promise<void> {
    const blob = blobPath(root, l.sha256);
    expect(lstatSync(blob).ino).toBe(decoyIno);
    expect(readFileSync(blob, "utf8")).toBe("the decoy bytes!!");
    expect(existsSync(indexPath(root))).toBe(false);
    writeFileSync(indexPath(root), `${JSON.stringify(expectedRow(l))}\n`, { mode: 0o600 });
    const m = await loadStore();
    expect(m.verifyArtifactStore(root, MAX_WORKER_ARTIFACT_BYTES)).toEqual({
      ok: true,
      checked: 1,
      problems: [{ sha256: l.sha256, reason: "sha mismatch" }],
      orphans: [],
      torn: 0,
    });
  }

  test("R7 · P1c: conv name swapped before the link (hook prelink) → `inode changed` · the decoy blob left · no row · verify `sha mismatch`", async () => {
    const root = tempRoot("inode");
    const l = land(root, "the fetched bytes");
    const decoy = join(root, "decoy.txt");
    const aside = join(root, "aside.txt");
    writeFileSync(decoy, "the decoy bytes!!", { mode: 0o600 });
    const decoyIno = lstatSync(decoy).ino;
    const logs = await runIngest(input(l), {
      hook: (point) => {
        if (point !== "prelink") return;
        renameSync(l.destPath, aside);
        renameSync(decoy, l.destPath);
      },
    });
    expect(logs).toEqual([skipLine("inode changed")]);
    expect(readFileSync(aside, "utf8")).toBe("the fetched bytes");
    expect(lstatSync(aside).nlink).toBe(1);
    await expectWrongBlobLeft(root, l, decoyIno);
  });

  test("R7 · P1c: the link links a decoy → `inode changed` · the decoy blob left · no row · verify `sha mismatch`", async () => {
    const root = tempRoot("inode-link");
    const l = land(root, "the fetched bytes");
    const decoy = join(root, "decoy.txt");
    writeFileSync(decoy, "the decoy bytes!!", { mode: 0o600 });
    const decoyIno = lstatSync(decoy).ino;
    await expectSkipped(input(l), "inode changed", {
      link: (_from, to) => linkSync(decoy, to),
    });
    expect(lstatSync(l.destPath).nlink).toBe(1);
    await expectWrongBlobLeft(root, l, decoyIno);
  });

  test("P1b #4: blob name replaced by another inode after the link → `inode changed` · that inode not unlinked · no row", async () => {
    const root = tempRoot("cleanup-owner");
    const l = land(root, "ours");
    const theirs = join(root, "theirs.bin");
    writeFileSync(theirs, "ours", { mode: 0o600 });
    const theirsIno = lstatSync(theirs).ino;
    await expectSkipped(input(l), "inode changed", {
      link: (from, to) => {
        linkSync(from, to);
        renameSync(theirs, to);
      },
    });
    const blob = blobPath(root, l.sha256);
    expect(lstatSync(blob).ino).toBe(theirsIno);
    expect(readFileSync(blob, "utf8")).toBe("ours");
    expect(lstatSync(l.destPath).nlink).toBe(1);
    expect(existsSync(indexPath(root))).toBe(false);
  });

  test("P1b #3: conv name swapped between the lstat and the open (restored before the link) → `inode changed` · nothing linked · no row", async () => {
    const root = tempRoot("read-swap");
    const l = land(root, "the bytes on the linked inode");
    const swapped = Buffer.from("the bytes that were hashed", "utf8");
    const bPath = join(root, "b.txt");
    const aside = join(root, "aside.txt");
    writeFileSync(bPath, swapped, { mode: 0o600 });
    chmodSync(bPath, 0o600);
    const logs = await runIngest(input(l, { sha256: sha256Of(swapped), bytes: swapped.length }), {
      hook: (point) => {
        if (point !== "lstat") return;
        renameSync(l.destPath, aside);
        renameSync(bPath, l.destPath);
      },
      link: (from, to) => {
        renameSync(from, bPath);
        renameSync(aside, from);
        linkSync(from, to);
      },
    });
    expect(logs).toEqual([skipLine("inode changed")]);
    expect(existsSync(blobPath(root, sha256Of(swapped)))).toBe(false);
    expect(existsSync(blobPath(root, l.sha256))).toBe(false);
    expect(existsSync(indexPath(root))).toBe(false);
  });

  test("P1b #1: `index.jsonl` is a FIFO → returns promptly · `index not a regular file` · no row", async () => {
    const root = tempRoot("index-fifo");
    const l = land(root, "c");
    const made = spawnSync("mkfifo", [indexPath(root)]);
    expect(made.status).toBe(0);
    await expectSkipped(input(l), "index not a regular file");
    expect(lstatSync(indexPath(root)).isFIFO()).toBe(true);
  }, 5000);

  test("P1b #2: `index.jsonl` hard-linked to a blob → `index nlink 2` · blob bytes unchanged", async () => {
    const root = tempRoot("index-hardlink");
    const l = land(root, "new artifact");
    const other = "an existing blob";
    const otherSha = sha256Of(other);
    mkdirSync(prefixDir(root, otherSha), { recursive: true, mode: 0o700 });
    writeFileSync(blobPath(root, otherSha), other, { mode: 0o600 });
    linkSync(blobPath(root, otherSha), indexPath(root));
    await expectSkipped(input(l), "index nlink 2");
    expect(readFileSync(blobPath(root, otherSha), "utf8")).toBe(other);
    expect(lstatSync(indexPath(root)).ino).toBe(lstatSync(blobPath(root, otherSha)).ino);
  });

  test("P1b #6: short index write → `index short write`", async () => {
    const root = tempRoot("short-write");
    const l = land(root, "c");
    await expectSkipped(input(l), "index short write", {
      write: (fd, buf) => writeSync(fd, buf.subarray(0, buf.length - 1)),
    });
    expect(readFileSync(indexPath(root), "utf8")).toBe(rowLine(expectedRow(l)).slice(0, -1));
  });

  test("P1b #5: `artifacts/` is a symlink → `symlink` · nothing lands behind it", async () => {
    const root = tempRoot("artifacts-symlink");
    const elsewhere = join(root, "elsewhere");
    mkdirSync(elsewhere, { mode: 0o700 });
    symlinkSync(elsewhere, artifactsDir(root));
    const l = land(root, "c");
    await expectSkipped(input(l), "symlink");
    expect(readdirSync(elsewhere)).toEqual([CONV_A]);
    expect(lstatSync(l.destPath).nlink).toBe(1);
  });

  test("P1b #5: pre-existing `sha256/` with group/other bits → `dir mode 755` · mode left alone · no row", async () => {
    const root = tempRoot("dir-mode");
    const l = land(root, "c");
    mkdirSync(shaDir(root), { mode: 0o700 });
    chmodSync(shaDir(root), 0o755);
    await expectSkipped(input(l), "dir mode 755");
    expect(modeOf(shaDir(root))).toBe(0o755);
    expect(readdirSync(shaDir(root))).toEqual([]);
    expect(existsSync(indexPath(root))).toBe(false);
  });

  test("R9: `index.jsonl` is a symlink → `symlink` · the target is not created", async () => {
    const root = tempRoot("index-symlink");
    const l = land(root, "c");
    const target = join(root, "target.jsonl");
    symlinkSync(target, indexPath(root));
    await expectSkipped(input(l), "symlink");
    expect(existsSync(target)).toBe(false);
    expect(lstatSync(indexPath(root)).isSymbolicLink()).toBe(true);
  });

  // Seam gap (reported): `name` = basename(destPath) and `convId` must pass isValidConvId, so with ② seams
  // only (log · link · now) a real filesystem cannot produce a > 4096 B row — NAME_MAX is 255 bytes and
  // JSON escaping at most sextuples a name (≤ ~1.6 KiB row). The case needs a seam ② does not define.
  test.todo("R9: a 4097 B row (long `name`) → `row too large` · no row (needs a seam ② lacks)", () => {});
});

describe("PLAN 0.45.0 P1 list table (R11 · R15)", () => {
  function mkRow(n: number, over: Partial<ArtifactIndexRow> = {}): ArtifactIndexRow {
    return {
      v: 1,
      sha256: sha256Of(`blob-${n}`),
      bytes: 10 + n,
      name: `file-${n}.txt`,
      convId: CONV_A,
      seq: n,
      index: 0,
      transport: "scp",
      status: "present",
      at: `2026-10-18T00:00:0${n}.000Z`,
      ...over,
    };
  }

  function writeIndex(root: string, lines: (string | Buffer)[]): string {
    mkdirSync(artifactsDir(root), { recursive: true, mode: 0o700 });
    const parts: Buffer[] = [];
    for (const l of lines) {
      parts.push(typeof l === "string" ? Buffer.from(l, "utf8") : l);
      parts.push(Buffer.from("\n"));
    }
    const p = indexPath(root);
    writeFileSync(p, Buffer.concat(parts), { mode: 0o600 });
    return p;
  }

  async function list(root: string, query: { convId?: string; limit: number }) {
    const m = await loadStore();
    return m.listArtifactRows(root, query);
  }

  test("newest first (file order reversed) · rows equal the parsed lines", async () => {
    const root = tempRoot("list-order");
    const rows = [mkRow(1), mkRow(2), mkRow(3)];
    writeIndex(root, rows.map((r) => JSON.stringify(r)));
    expect(await list(root, { limit: 50 })).toEqual({ ok: true, rows: [rows[2], rows[1], rows[0]], torn: 0 });
  });

  test("`convId` exact filter · `limit` keeps the newest", async () => {
    const root = tempRoot("list-filter");
    const rows = [
      mkRow(1),
      mkRow(2, { convId: CONV_B }),
      mkRow(3),
      mkRow(4, { convId: CONV_B }),
      mkRow(5),
    ];
    writeIndex(root, rows.map((r) => JSON.stringify(r)));
    expect(await list(root, { convId: CONV_B, limit: 50 })).toEqual({
      ok: true,
      rows: [rows[3], rows[1]],
      torn: 0,
    });
    expect(await list(root, { convId: "conv_0123456789abcde", limit: 50 })).toEqual({
      ok: true,
      rows: [],
      torn: 0,
    });
    expect(await list(root, { limit: 2 })).toEqual({ ok: true, rows: [rows[4], rows[3]], torn: 0 });
    expect(await list(root, { convId: CONV_A, limit: 2 })).toEqual({
      ok: true,
      rows: [rows[4], rows[2]],
      torn: 0,
    });
  });

  test("torn lines are counted over the whole file (bad JSON · bad UTF-8 · v 2 · uppercase sha · bytes 1e999 · bytes over the production cap) · empty lines are 0", async () => {
    const root = tempRoot("list-torn");
    const good1 = mkRow(1);
    const good2 = mkRow(2, { convId: CONV_B });
    const big = JSON.stringify(mkRow(3)).replace(`"bytes":13`, `"bytes":1e999`);
    expect(big).toContain(`"bytes":1e999`);
    writeIndex(root, [
      JSON.stringify(good1),
      "",
      "{not json",
      Buffer.from([0x7b, 0xff, 0xfe, 0x7d]),
      JSON.stringify({ ...mkRow(4), v: 2 }),
      JSON.stringify(mkRow(5, { sha256: sha256Of("upper").toUpperCase() })),
      big,
      JSON.stringify(mkRow(6, { bytes: MAX_WORKER_ARTIFACT_BYTES + 1 })),
      "",
      JSON.stringify(good2),
    ]);
    expect(await list(root, { limit: 50 })).toEqual({ ok: true, rows: [good2, good1], torn: 6 });
    // `torn` stays the whole-file count under a filter and a limit.
    expect(await list(root, { convId: CONV_B, limit: 1 })).toEqual({ ok: true, rows: [good2], torn: 6 });
  });

  test("no index → 0 rows · ok", async () => {
    const root = tempRoot("list-none");
    expect(await list(root, { limit: 50 })).toEqual({ ok: true, rows: [], torn: 0 });
    expect(existsSync(artifactsDir(root))).toBe(false);
  });

  test("index is a symlink → ok: false", async () => {
    const root = tempRoot("list-symlink");
    const real = join(root, "real.jsonl");
    writeFileSync(real, `${JSON.stringify(mkRow(1))}\n`, { mode: 0o600 });
    mkdirSync(artifactsDir(root), { mode: 0o700 });
    symlinkSync(real, indexPath(root));
    expect(await list(root, { limit: 50 })).toEqual({ ok: false, reason: "not a regular file" });
  });

  test("P1b #5: `artifacts/` is a symlink to a dir with an index → ok: false `symlink`", async () => {
    const root = tempRoot("list-artifacts-symlink");
    const elsewhere = join(root, "elsewhere");
    mkdirSync(elsewhere, { mode: 0o700 });
    writeFileSync(join(elsewhere, "index.jsonl"), `${JSON.stringify(mkRow(1))}\n`, { mode: 0o600 });
    symlinkSync(elsewhere, artifactsDir(root));
    expect(await list(root, { limit: 50 })).toEqual({ ok: false, reason: "symlink" });
  });

  test("R11: 64 MiB + 1 sparse index → ok: false `too large`", async () => {
    const root = tempRoot("list-big");
    const p = writeIndex(root, [JSON.stringify(mkRow(1))]);
    truncateSync(p, 64 * 1024 * 1024 + 1);
    expect(await list(root, { limit: 50 })).toEqual({ ok: false, reason: "too large" });
  });
});

describe("PLAN 0.45.0 P1 verify table (R15 · D7)", () => {
  function row(sha: string, bytes: number, n = 1): ArtifactIndexRow {
    return {
      v: 1,
      sha256: sha,
      bytes,
      name: `file-${n}.txt`,
      convId: CONV_A,
      seq: n,
      index: 0,
      transport: "scp",
      status: "present",
      at: AT.toISOString(),
    };
  }

  /** Hand-places a blob (dirs 0700 · file at `mode`) and returns its address. */
  function putBlob(root: string, content: string, mode = 0o600): { sha: string; bytes: number } {
    const sha = sha256Of(content);
    mkdirSync(prefixDir(root, sha), { recursive: true, mode: 0o700 });
    writeFileSync(blobPath(root, sha), content, { mode: 0o600 });
    chmodSync(blobPath(root, sha), mode);
    return { sha, bytes: Buffer.byteLength(content) };
  }

  function writeIndex(root: string, rows: (ArtifactIndexRow | string)[]): void {
    mkdirSync(artifactsDir(root), { recursive: true, mode: 0o700 });
    writeFileSync(
      indexPath(root),
      rows.map((r) => `${typeof r === "string" ? r : JSON.stringify(r)}\n`).join(""),
      { mode: 0o600 },
    );
  }

  async function verify(root: string, maxBytes = MAX_WORKER_ARTIFACT_BYTES) {
    const m = await loadStore();
    return m.verifyArtifactStore(root, maxBytes);
  }

  const problem = (sha: string, reason: string) => ({
    ok: true as const,
    checked: 1,
    problems: [{ sha256: sha, reason }],
    orphans: [],
    torn: 0,
  });

  test("healthy store (ingested for real) → 0 problems", async () => {
    const root = tempRoot("v-ok");
    const l = land(root, "healthy");
    expect(await runIngest(input(l))).toEqual([]);
    expect(await verify(root)).toEqual({ ok: true, checked: 1, problems: [], orphans: [], torn: 0 });
  });

  test("blob deleted → `missing`", async () => {
    const root = tempRoot("v-missing");
    const b = putBlob(root, "gone");
    writeIndex(root, [row(b.sha, b.bytes)]);
    unlinkSync(blobPath(root, b.sha));
    expect(await verify(root)).toEqual(problem(b.sha, "missing"));
  });

  test("blob is a symlink → `symlink`", async () => {
    const root = tempRoot("v-blob-symlink");
    const content = "linked";
    const sha = sha256Of(content);
    const real = join(root, "real.bin");
    writeFileSync(real, content, { mode: 0o600 });
    mkdirSync(prefixDir(root, sha), { recursive: true, mode: 0o700 });
    symlinkSync(real, blobPath(root, sha));
    writeIndex(root, [row(sha, Buffer.byteLength(content))]);
    expect(await verify(root)).toEqual(problem(sha, "symlink"));
  });

  test("`<2 hex>` dir is a symlink (to a dir holding a good blob) → `symlink`", async () => {
    const root = tempRoot("v-prefix-symlink");
    const content = "behind a link";
    const sha = sha256Of(content);
    const elsewhere = join(root, "elsewhere");
    mkdirSync(elsewhere, { mode: 0o700 });
    writeFileSync(join(elsewhere, sha), content, { mode: 0o600 });
    mkdirSync(shaDir(root), { recursive: true, mode: 0o700 });
    symlinkSync(elsewhere, prefixDir(root, sha));
    writeIndex(root, [row(sha, Buffer.byteLength(content))]);
    expect(await verify(root)).toEqual(problem(sha, "symlink"));
  });

  test("blob is a directory → `not a regular file`", async () => {
    const root = tempRoot("v-dir");
    const sha = sha256Of("dir");
    mkdirSync(blobPath(root, sha), { recursive: true, mode: 0o700 });
    writeIndex(root, [row(sha, 3)]);
    expect(await verify(root)).toEqual(problem(sha, "not a regular file"));
  });

  test("D7: overwritten conv file (shared inode, same length) → `sha mismatch`", async () => {
    const root = tempRoot("v-shared");
    const l = land(root, "original bytes");
    mkdirSync(prefixDir(root, l.sha256), { recursive: true, mode: 0o700 });
    linkSync(l.destPath, blobPath(root, l.sha256));
    writeIndex(root, [row(l.sha256, l.bytes)]);
    writeFileSync(l.destPath, "rewritten byte");
    expect(Buffer.byteLength("rewritten byte")).toBe(l.bytes);
    expect(await verify(root)).toEqual(problem(l.sha256, "sha mismatch"));
  });

  test("truncated blob → `size mismatch`", async () => {
    const root = tempRoot("v-trunc");
    const b = putBlob(root, "twelve bytes");
    writeIndex(root, [row(b.sha, b.bytes)]);
    truncateSync(blobPath(root, b.sha), 4);
    expect(await verify(root)).toEqual(problem(b.sha, "size mismatch"));
  });

  test("chmod 0700 → `exec bit`", async () => {
    const root = tempRoot("v-exec");
    const b = putBlob(root, "runnable?", 0o700);
    writeIndex(root, [row(b.sha, b.bytes)]);
    expect(await verify(root)).toEqual(problem(b.sha, "exec bit"));
  });

  test("blob over the injected cap → `too large`", async () => {
    const root = tempRoot("v-cap");
    const b = putBlob(root, "x".repeat(65));
    writeIndex(root, [row(b.sha, b.bytes)]);
    expect(await verify(root, 64)).toEqual(problem(b.sha, "too large"));
  });

  test("one sha with two `bytes` values → `bytes disagree`", async () => {
    const root = tempRoot("v-bytes");
    const b = putBlob(root, "agree?");
    writeIndex(root, [row(b.sha, b.bytes, 1), row(b.sha, b.bytes + 1, 2)]);
    expect(await verify(root)).toEqual(problem(b.sha, "bytes disagree"));
  });

  test("only the first problem per sha (size mismatch before exec bit)", async () => {
    const root = tempRoot("v-first");
    const b = putBlob(root, "two problems", 0o700);
    writeIndex(root, [row(b.sha, b.bytes)]);
    truncateSync(blobPath(root, b.sha), 3);
    expect(await verify(root)).toEqual(problem(b.sha, "size mismatch"));
  });

  test("blob absent from the index → orphan info (not a problem) · names outside the rule ignored", async () => {
    const root = tempRoot("v-orphan");
    const listed = putBlob(root, "listed");
    const orphan = putBlob(root, "orphan");
    writeIndex(root, [row(listed.sha, listed.bytes)]);
    // Outside the name rule: ignored, never an orphan.
    mkdirSync(join(shaDir(root), "zz"), { mode: 0o700 });
    writeFileSync(join(shaDir(root), "zz", sha256Of("zz")), "zz", { mode: 0o600 });
    writeFileSync(join(prefixDir(root, orphan.sha), `${orphan.sha}.tmp`), "t", { mode: 0o600 });
    writeFileSync(join(prefixDir(root, orphan.sha), "short"), "s", { mode: 0o600 });
    writeFileSync(join(shaDir(root), "stray.txt"), "s", { mode: 0o600 });
    // A non-regular entry under a valid name is not an orphan either.
    const dirSha = sha256Of("a dir");
    mkdirSync(blobPath(root, dirSha), { recursive: true, mode: 0o700 });
    const r = await verify(root);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.checked).toBe(1);
    expect(r.problems).toEqual([]);
    expect(r.torn).toBe(0);
    expect(r.orphans.length).toBe(1);
    expect(r.orphans[0]?.name.endsWith(orphan.sha)).toBe(true);
  });

  test("problems and orphans are sorted by sha ascending · checked = distinct shas · torn counted", async () => {
    const root = tempRoot("v-sort");
    const blobs = ["p1", "p2", "p3", "p4"].map((c) => putBlob(root, c));
    const orphans = ["o1", "o2", "o3"].map((c) => putBlob(root, c));
    for (const b of blobs) truncateSync(blobPath(root, b.sha), 0);
    // Index order deliberately not sha order; one sha listed twice.
    const [b0, b1, b2, b3] = blobs;
    if (!b0 || !b1 || !b2 || !b3) throw new Error("setup");
    writeIndex(root, [
      row(b3.sha, b3.bytes, 1),
      row(b0.sha, b0.bytes, 2),
      "{torn",
      row(b2.sha, b2.bytes, 3),
      row(b1.sha, b1.bytes, 4),
      row(b0.sha, b0.bytes, 5),
    ]);
    const r = await verify(root);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.checked).toBe(4);
    expect(r.torn).toBe(1);
    expect(r.problems).toEqual(
      blobs
        .map((b) => b.sha)
        .sort()
        .map((sha) => ({ sha256: sha, reason: "size mismatch" })),
    );
    const want = orphans.map((o) => o.sha).sort();
    expect(r.orphans.length).toBe(3);
    r.orphans.forEach((o, i) => {
      expect(o.name.endsWith(want[i] ?? "?")).toBe(true);
    });
  });

  test("no index → 0 shas checked · the orphan walk still runs", async () => {
    const root = tempRoot("v-noindex");
    const o = putBlob(root, "lonely");
    const r = await verify(root);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.checked).toBe(0);
    expect(r.problems).toEqual([]);
    expect(r.orphans.length).toBe(1);
    expect(r.orphans[0]?.name.endsWith(o.sha)).toBe(true);
  });

  test("empty root → ok · nothing", async () => {
    const root = tempRoot("v-empty");
    expect(await verify(root)).toEqual({ ok: true, checked: 0, problems: [], orphans: [], torn: 0 });
    expect(existsSync(artifactsDir(root))).toBe(false);
  });

  test("index is a symlink → ok: false", async () => {
    const root = tempRoot("v-index-symlink");
    const b = putBlob(root, "c");
    const real = join(root, "real.jsonl");
    writeFileSync(real, `${JSON.stringify(row(b.sha, b.bytes))}\n`, { mode: 0o600 });
    symlinkSync(real, indexPath(root));
    expect(await verify(root)).toEqual({ ok: false, reason: "not a regular file" });
  });

  test("P1b #5: `artifacts/` is a symlink to a dir with an empty index → ok: false `symlink` (not a clean pass)", async () => {
    const root = tempRoot("v-artifacts-symlink");
    const elsewhere = join(root, "elsewhere");
    mkdirSync(elsewhere, { mode: 0o700 });
    writeFileSync(join(elsewhere, "index.jsonl"), "", { mode: 0o600 });
    symlinkSync(elsewhere, artifactsDir(root));
    expect(await verify(root)).toEqual({ ok: false, reason: "symlink" });
  });

  test("P1b #5: `artifacts/sha256/` is a symlink → ok: false `symlink`", async () => {
    const root = tempRoot("v-shadir-symlink");
    const elsewhere = join(root, "elsewhere");
    mkdirSync(elsewhere, { mode: 0o700 });
    mkdirSync(artifactsDir(root), { mode: 0o700 });
    symlinkSync(elsewhere, shaDir(root));
    expect(await verify(root)).toEqual({ ok: false, reason: "symlink" });
  });
});

describe("PLAN 0.45.0 P1 — list and verify are side-effect free", () => {
  /** lstat-walks the root (never follows links): path · mode · size · mtime · kind. */
  function snapshot(root: string): string[] {
    const out: string[] = [];
    const walk = (rel: string): void => {
      const p = rel === "" ? root : join(root, rel);
      const st = lstatSync(p);
      const kind = st.isSymbolicLink() ? "l" : st.isDirectory() ? "d" : st.isFile() ? "f" : "?";
      out.push(`${rel} ${kind} ${st.mode.toString(8)} ${st.size} ${st.mtimeMs} ${st.nlink}`);
      if (kind === "d") for (const n of readdirSync(p).sort()) walk(rel === "" ? n : join(rel, n));
    };
    walk("");
    return out;
  }

  test("tree listing · modes · mtimes identical before and after list + verify", async () => {
    const root = tempRoot("nofx");
    const a = land(root, "alpha");
    const b = land(root, "beta", { convId: CONV_B, name: "b.txt" });
    expect(await runIngest(input(a))).toEqual([]);
    expect(await runIngest(input(b))).toEqual([]);
    // Some damage so verify walks its problem paths too.
    chmodSync(blobPath(root, b.sha256), 0o700);
    mkdirSync(prefixDir(root, sha256Of("orphan")), { recursive: true, mode: 0o700 });
    writeFileSync(blobPath(root, sha256Of("orphan")), "orphan", { mode: 0o600 });
    writeFileSync(indexPath(root), "{torn\n", { flag: "a" });
    const before = snapshot(root);
    const m = await loadStore();
    expect(m.listArtifactRows(root, { limit: 50 }).ok).toBe(true);
    expect(m.listArtifactRows(root, { convId: CONV_A, limit: 1 }).ok).toBe(true);
    const v = m.verifyArtifactStore(root, MAX_WORKER_ARTIFACT_BYTES);
    expect(v.ok).toBe(true);
    expect(snapshot(root)).toEqual(before);
  });
});
