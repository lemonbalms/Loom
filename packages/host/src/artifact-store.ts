/**
 * PLAN 0.45.0 ② — content-addressed artifact store (D2 · D3 · D4 · D6 · D7 · R3~R11 · R15).
 * - `ingestFetchedArtifact` runs once after a successful `conv_fetch`: it hard-links the landed conv file to
 *   `artifacts/sha256/<2 hex>/<64 hex>` (no copy · no symlink · no rename — R7) and appends one index row.
 *   Best effort: it never throws and logs at most one stderr line (R1 · R10).
 * - `listArtifactRows` · `verifyArtifactStore` are read-only (zero writes) over the same tree (R11 · R15).
 * All synchronous; every read is bounded and no-follow (`readBoundedRegularFile`, or for the conv file a
 * single opened fd so the hashed bytes are the linked inode's — P1b).
 */
import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  fchmodSync,
  fstatSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readSync,
  writeSync,
} from "node:fs";
import { basename, join } from "node:path";
import { isValidConvId } from "@loom/protocol";
import { MAX_WORKER_ARTIFACT_BYTES } from "./conv-artifact-pack";
import { readBoundedRegularFile } from "./prompt-record";

/** ② bounds — pinned by the tests. */
export const ARTIFACT_INDEX_ROW_MAX_BYTES = 4096;
export const ARTIFACT_INDEX_READ_MAX_BYTES = 64 * 1024 * 1024;
export const ARTIFACT_LIST_LIMIT_DEFAULT = 50;
export const ARTIFACT_LIST_LIMIT_MAX = 500;

/** D4 index row — this key order, one `JSON.stringify(row) + "\n"` line. */
export type ArtifactIndexRow = {
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

/** Test seams — defaults `console.error` · `linkSync` · `new Date()`. */
export type ArtifactStoreDeps = {
  log?: (line: string) => void;
  link?: (from: string, to: string) => void;
  now?: () => Date;
  /** @internal P1b test seam — the index row write (default `fs.writeSync`); returns bytes written. */
  write?: (fd: number, buf: Buffer) => number;
  /**
   * @internal P1b test seam — called at `"lstat"` (after the conv file's pre-open `lstat`, before its open)
   * and at `"prelink"` (before the link); default no-op.
   */
  hook?: (point: "lstat" | "prelink") => void;
};

export type ArtifactProblemReason =
  | "missing"
  | "symlink"
  | "not a regular file"
  | "size mismatch"
  | "sha mismatch"
  | "exec bit"
  | "bytes disagree"
  | "too large"
  | `unreadable ${string}`;

export type ArtifactListResult = { ok: true; rows: ArtifactIndexRow[]; torn: number } | { ok: false; reason: string };

export type ArtifactVerifyResult =
  | {
      ok: true;
      checked: number;
      problems: { sha256: string; reason: ArtifactProblemReason }[];
      orphans: { name: string }[];
      torn: number;
    }
  | { ok: false; reason: string };

const PREFIX_RE = /^[0-9a-f]{2}$/;
const SHA_RE = /^[0-9a-f]{64}$/;

const sha256Hex = (b: Buffer): string => createHash("sha256").update(b).digest("hex");

function errCode(err: unknown): string {
  const code = (err as NodeJS.ErrnoException)?.code;
  return typeof code === "string" ? code : "unknown";
}

const shaDirOf = (root: string): string => join(root, "artifacts", "sha256");
const indexPathOf = (root: string): string => join(root, "artifacts", "index.jsonl");

/**
 * R6: one component at a time — `lstat`; absent → non-recursive `mkdir` 0700 (a recursive mkdir would
 * follow an intermediate symlink) and the created mode is re-checked; an `EEXIST` race re-`lstat`s.
 * Existing directory modes are left alone (no chmod of a user dir) — but one with group/other bits stops
 * the ingest (P1b).
 */
function ensureStoreDir(path: string): string | null {
  for (let attempt = 0; attempt < 2; attempt++) {
    let st: ReturnType<typeof lstatSync>;
    try {
      st = lstatSync(path);
    } catch (err) {
      if (errCode(err) !== "ENOENT") return `unreadable ${errCode(err)}`;
      try {
        mkdirSync(path, { mode: 0o700 });
      } catch (mkErr) {
        if (errCode(mkErr) === "EEXIST") continue;
        return `unreadable ${errCode(mkErr)}`;
      }
      const made = lstatSync(path);
      if (made.isSymbolicLink()) return "symlink";
      if (!made.isDirectory()) return "not a directory";
      if ((made.mode & 0o777) !== 0o700) chmodSync(path, 0o700);
      return null;
    }
    if (st.isSymbolicLink()) return "symlink";
    if (!st.isDirectory()) return "not a directory";
    if (st.mode & 0o077) return `dir mode ${(st.mode & 0o777).toString(8)}`;
    return null;
  }
  return "unreadable EEXIST";
}

/**
 * P1b (Astra 0156 #5): list · verify read under `artifacts/` and `artifacts/sha256/` only through real
 * directories — each component is `lstat`ed (never followed); absent is fine (an empty store).
 */
function checkReadDirs(root: string): { ok: true } | { ok: false; reason: string } {
  for (const dir of [join(root, "artifacts"), shaDirOf(root)]) {
    try {
      const st = lstatSync(dir);
      if (st.isSymbolicLink()) return { ok: false, reason: "symlink" };
      if (!st.isDirectory()) return { ok: false, reason: "not a directory" };
    } catch (err) {
      if (errCode(err) === "ENOENT") return { ok: true };
      return { ok: false, reason: `unreadable ${errCode(err)}` };
    }
  }
  return { ok: true };
}

/** R8: the blob is already there — it must be a regular file whose bytes hash to its address. */
function checkExistingBlob(blobPath: string, sha: string, maxBytes: number): string | null {
  try {
    if (lstatSync(blobPath).isSymbolicLink()) return "symlink";
  } catch (err) {
    if (errCode(err) === "ENOENT") return "blob mismatch";
    return `unreadable ${errCode(err)}`;
  }
  const read = readBoundedRegularFile(blobPath, maxBytes);
  if (!Buffer.isBuffer(read)) return read.kind === "missing" ? "blob mismatch" : read.reason;
  return sha256Hex(read) === sha ? null : "blob mismatch";
}

/**
 * R9 · P1b (Astra 0156 #1 · #2 · #6): open no-follow and non-blocking (a FIFO index never blocks — no
 * reader → ENXIO), the fd must be a regular file with nlink 1 (a hard link to a blob is never written),
 * then exactly one `writeSync` of the line; fewer bytes than the line is `index short write`. A file this
 * call creates gets 0600.
 */
function appendIndexRow(indexPath: string, line: string, write: (fd: number, buf: Buffer) => number): string | null {
  let created = false;
  try {
    const pre = lstatSync(indexPath);
    if (pre.isSymbolicLink()) return "symlink";
    if (!pre.isFile()) return "index not a regular file";
  } catch (err) {
    if (errCode(err) !== "ENOENT") return `index ${errCode(err)}`;
    created = true;
  }
  let fd: number;
  try {
    fd = openSync(
      indexPath,
      fsConstants.O_WRONLY |
        fsConstants.O_APPEND |
        fsConstants.O_CREAT |
        fsConstants.O_NOFOLLOW |
        fsConstants.O_NONBLOCK,
      0o600,
    );
  } catch (err) {
    if (errCode(err) === "ELOOP") return "symlink";
    return `index ${errCode(err)}`;
  }
  try {
    const st = fstatSync(fd);
    if (!st.isFile()) return "index not a regular file";
    if (st.nlink !== 1) return `index nlink ${st.nlink}`;
    if (created && (st.mode & 0o777) !== 0o600) fchmodSync(fd, 0o600);
    const buf = Buffer.from(line, "utf8");
    const n = write(fd, buf);
    if (n < buf.length) return "index short write";
    return null;
  } catch (err) {
    return `index ${errCode(err)}`;
  } finally {
    try {
      closeSync(fd);
    } catch {}
  }
}

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

type ConvStat = { isFile(): boolean; size: number; mode: number; nlink: number };

/** R3 · R4 · R64-L1: the conv file checks, shared by the pre-open `lstat` and the fd's `fstat`. */
function convStatProblem(st: ConvStat, maxBytes: number): string | null {
  if (!st.isFile()) return "not a regular file";
  if (st.size > maxBytes) return "too large";
  const mode = st.mode & 0o777;
  if (mode !== 0o600) return `mode ${mode.toString(8)}`;
  if (st.nlink !== 1) return `nlink ${st.nlink}`;
  return null;
}

/** Reads at most `maxBytes + 1` bytes from an open fd (sized to the fstat size + 1 so EOF is seen at once). */
function readFdBounded(fd: number, size: number, maxBytes: number): Buffer | null {
  let buf = Buffer.alloc(size + 1);
  let total = 0;
  for (;;) {
    if (total === buf.length) {
      if (buf.length > maxBytes) break;
      const grown = Buffer.alloc(maxBytes + 1);
      buf.copy(grown, 0, 0, total);
      buf = grown;
    }
    const n = readSync(fd, buf, total, buf.length - total, null);
    if (n === 0) break;
    total += n;
  }
  return total > maxBytes ? null : buf.subarray(0, total);
}

type Ident = { dev: number; ino: number };
const sameIdent = (a: Ident, b: Ident): boolean => a.dev === b.dev && a.ino === b.ino;

/**
 * P1b (Astra 0156 #3): the conv file is opened once (no-follow · non-blocking), checked on the fd, and its
 * bytes are read from that fd — so the hashed bytes belong to the fd's dev/ino, which must also be the
 * pre-open `lstat`'s.
 */
function readConvFile(
  destPath: string,
  maxBytes: number,
  hook: (point: "lstat" | "prelink") => void,
): { bytes: Buffer; ident: Ident } | string {
  let pre: ReturnType<typeof lstatSync>;
  try {
    pre = lstatSync(destPath);
  } catch (err) {
    return `unreadable ${errCode(err)}`;
  }
  if (pre.isSymbolicLink()) return "symlink";
  const preBad = convStatProblem(pre, maxBytes);
  if (preBad) return preBad;
  hook("lstat");
  let fd: number;
  try {
    fd = openSync(destPath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK);
  } catch (err) {
    if (errCode(err) === "ELOOP") return "symlink";
    return `unreadable ${errCode(err)}`;
  }
  try {
    const st = fstatSync(fd);
    const bad = convStatProblem(st, maxBytes);
    if (bad) return bad;
    const ident = { dev: st.dev, ino: st.ino };
    if (!sameIdent(pre, ident)) return "inode changed";
    const bytes = readFdBounded(fd, st.size, maxBytes);
    if (!bytes) return "too large";
    return { bytes, ident };
  } catch (err) {
    return `unreadable ${errCode(err)}`;
  } finally {
    try {
      closeSync(fd);
    } catch {}
  }
}

type IngestDeps = {
  link: (from: string, to: string) => void;
  now: () => Date;
  write: (fd: number, buf: Buffer) => number;
  hook: (point: "lstat" | "prelink") => void;
};

/** The ingest steps; returns the first failure reason (② vocabulary) or null on success. */
function ingestSteps(input: IngestInput, deps: IngestDeps): string | null {
  // R1 · R64-L2: the convId check comes first.
  if (!isValidConvId(input.convId)) return "convId";

  // R3 · R4 · R64-L1 · P1b: the landed name itself (never followed); bytes bound to the opened inode.
  const conv = readConvFile(input.destPath, input.maxBytes, deps.hook);
  if (typeof conv === "string") return conv;
  const read = conv.bytes;

  // R5: the address is the re-read bytes' sha; it must equal the D6-checked sha and size.
  const sha = sha256Hex(read);
  if (read.length !== input.bytes || sha !== input.sha256) return "sha changed";

  // R6
  const shaDir = shaDirOf(input.root);
  const prefixDir = join(shaDir, sha.slice(0, 2));
  for (const dir of [join(input.root, "artifacts"), shaDir, prefixDir]) {
    const bad = ensureStoreDir(dir);
    if (bad) return bad;
  }

  // R7 (R64-M1): direct no-replace link to the final name, then the blob's dev/ino must be the read fd's.
  const blobPath = join(prefixDir, sha);
  deps.hook("prelink");
  let linked = false;
  try {
    deps.link(input.destPath, blobPath);
    linked = true;
  } catch (err) {
    const code = errCode(err);
    if (code === "EXDEV") return "exdev";
    if (code !== "EEXIST") return `unreadable ${code}`;
  }
  if (linked) {
    let blob: Ident | null = null;
    try {
      blob = lstatSync(blobPath);
    } catch {}
    // P1c (Astra 0168): a path-based unlink cannot prove which inode it removes, so ingest never unlinks —
    // a wrong blob is left in place (no row) and `verify` reports it as `sha mismatch`.
    if (!blob || !sameIdent(blob, conv.ident)) return "inode changed";
  } else {
    // R8: EEXIST — the blob is already there; a match gets a row, anything else leaves it untouched.
    const bad = checkExistingBlob(blobPath, sha, input.maxBytes);
    if (bad) return bad;
  }

  // R9
  const row: ArtifactIndexRow = {
    v: 1,
    sha256: sha,
    bytes: read.length,
    name: basename(input.destPath),
    convId: input.convId,
    seq: input.seq,
    index: input.index,
    transport: "scp",
    status: "present",
    at: deps.now().toISOString(),
  };
  const line = `${JSON.stringify(row)}\n`;
  if (Buffer.byteLength(line, "utf8") > ARTIFACT_INDEX_ROW_MAX_BYTES) return "row too large";
  return appendIndexRow(indexPathOf(input.root), line, deps.write);
}

/**
 * ② ingest — never throws (R1), returns nothing, logs at most one line and only on failure (R10). The
 * line carries no file content and no absolute path.
 */
export function ingestFetchedArtifact(input: IngestInput, deps: ArtifactStoreDeps = {}): void {
  let reason: string | null;
  try {
    reason = ingestSteps(input, {
      link: deps.link ?? linkSync,
      now: deps.now ?? (() => new Date()),
      write: deps.write ?? ((fd, buf) => writeSync(fd, buf)),
      hook: deps.hook ?? (() => {}),
    });
  } catch (err) {
    reason = `unreadable ${errCode(err)}`;
  }
  if (reason === null) return;
  try {
    (deps.log ?? console.error)(
      `[loom] artifact store: skipped — ${reason} (convId ${input.convId} · seq ${input.seq} · index ${input.index})`,
    );
  } catch {}
}

/** R11: one line → a checked row, or null (torn). The production cap is fixed here (R64-L3). */
function parseRow(lineBytes: Buffer, decoder: TextDecoder): ArtifactIndexRow | null {
  let value: unknown;
  try {
    value = JSON.parse(decoder.decode(lineBytes));
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const r = value as Record<string, unknown>;
  const count = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0;
  if (r.v !== 1) return null;
  if (typeof r.sha256 !== "string" || !SHA_RE.test(r.sha256)) return null;
  if (!count(r.bytes) || r.bytes > MAX_WORKER_ARTIFACT_BYTES) return null;
  if (!count(r.seq) || !count(r.index)) return null;
  if (typeof r.name !== "string" || typeof r.convId !== "string" || typeof r.at !== "string") return null;
  if (r.transport !== "scp" || r.status !== "present") return null;
  return {
    v: 1,
    sha256: r.sha256,
    bytes: r.bytes,
    name: r.name,
    convId: r.convId,
    seq: r.seq,
    index: r.index,
    transport: "scp",
    status: "present",
    at: r.at,
  };
}

/** R11: bounded read of the index → valid rows in file order + the whole-file torn count. */
function readIndexRows(root: string): { ok: true; rows: ArtifactIndexRow[]; torn: number } | { ok: false; reason: string } {
  const dirs = checkReadDirs(root);
  if (!dirs.ok) return dirs;
  const read = readBoundedRegularFile(indexPathOf(root), ARTIFACT_INDEX_READ_MAX_BYTES);
  if (!Buffer.isBuffer(read)) {
    if (read.kind === "missing") return { ok: true, rows: [], torn: 0 };
    return { ok: false, reason: read.reason };
  }
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const rows: ArtifactIndexRow[] = [];
  let torn = 0;
  let start = 0;
  while (start <= read.length) {
    let end = read.indexOf(0x0a, start);
    if (end === -1) end = read.length;
    if (end > start) {
      const row = parseRow(read.subarray(start, end), decoder);
      if (row) rows.push(row);
      else torn++;
    }
    start = end + 1;
  }
  return { ok: true, rows, torn };
}

/** ② list (R15): newest first · exact `convId` filter · the first `limit` rows · torn over the whole file. */
export function listArtifactRows(root: string, query: { convId?: string; limit: number }): ArtifactListResult {
  const read = readIndexRows(root);
  if (!read.ok) return read;
  const rows = read.rows
    .reverse()
    .filter((r) => query.convId === undefined || r.convId === query.convId)
    .slice(0, query.limit);
  return { ok: true, rows, torn: read.torn };
}

/** R15: the first problem for one sha, in the pinned check order, or null. */
function checkBlob(root: string, sha: string, bytes: number, maxBytes: number): ArtifactProblemReason | null {
  const prefixDir = join(shaDirOf(root), sha.slice(0, 2));
  for (const dir of [join(root, "artifacts"), shaDirOf(root), prefixDir]) {
    try {
      const st = lstatSync(dir);
      if (st.isSymbolicLink()) return "symlink";
      if (!st.isDirectory()) return "missing";
    } catch (err) {
      if (errCode(err) === "ENOENT") return "missing";
      return `unreadable ${errCode(err)}`;
    }
  }
  const blobPath = join(prefixDir, sha);
  let st: ReturnType<typeof lstatSync>;
  try {
    st = lstatSync(blobPath);
  } catch (err) {
    if (errCode(err) === "ENOENT") return "missing";
    return `unreadable ${errCode(err)}`;
  }
  if (st.isSymbolicLink()) return "symlink";
  if (!st.isFile()) return "not a regular file";
  if (st.size !== bytes) return "size mismatch";
  if (st.mode & 0o111) return "exec bit";
  const read = readBoundedRegularFile(blobPath, maxBytes);
  if (!Buffer.isBuffer(read)) {
    if (read.kind === "missing") return "missing";
    return read.reason as ArtifactProblemReason;
  }
  return sha256Hex(read) === sha ? null : "sha mismatch";
}

/** R15: `<2 hex>/<64 hex>` regular files under a real `sha256/` whose sha the index does not list. */
function findOrphans(root: string, listed: Set<string>): { name: string }[] {
  const shaDir = shaDirOf(root);
  for (const dir of [join(root, "artifacts"), shaDir]) {
    try {
      const st = lstatSync(dir);
      if (st.isSymbolicLink() || !st.isDirectory()) return [];
    } catch {
      return [];
    }
  }
  const out: { sha: string; name: string }[] = [];
  let prefixes: string[];
  try {
    prefixes = readdirSync(shaDir).sort();
  } catch {
    return [];
  }
  for (const prefix of prefixes) {
    if (!PREFIX_RE.test(prefix)) continue;
    const prefixDir = join(shaDir, prefix);
    let names: string[];
    try {
      const st = lstatSync(prefixDir);
      if (st.isSymbolicLink() || !st.isDirectory()) continue;
      names = readdirSync(prefixDir).sort();
    } catch {
      continue;
    }
    for (const name of names) {
      if (!SHA_RE.test(name) || !name.startsWith(prefix) || listed.has(name)) continue;
      try {
        if (!lstatSync(join(prefixDir, name)).isFile()) continue;
      } catch {
        continue;
      }
      out.push({ sha: name, name: `sha256/${prefix}/${name}` });
    }
  }
  out.sort((a, b) => (a.sha < b.sha ? -1 : a.sha > b.sha ? 1 : 0));
  return out.map((o) => ({ name: o.name }));
}

/**
 * ② verify (R15 · D7): per distinct indexed sha the first problem only, then the orphan walk. Problems and
 * orphans in sha order; torn lines are counted, never a problem. Zero writes.
 */
export function verifyArtifactStore(root: string, maxBytes: number): ArtifactVerifyResult {
  const read = readIndexRows(root);
  if (!read.ok) return read;
  const bytesBySha = new Map<string, Set<number>>();
  for (const r of read.rows) {
    const set = bytesBySha.get(r.sha256) ?? new Set<number>();
    set.add(r.bytes);
    bytesBySha.set(r.sha256, set);
  }
  const problems: { sha256: string; reason: ArtifactProblemReason }[] = [];
  for (const sha of [...bytesBySha.keys()].sort()) {
    const set = bytesBySha.get(sha) ?? new Set<number>();
    let reason: ArtifactProblemReason | null;
    if (set.size > 1) reason = "bytes disagree";
    else reason = checkBlob(root, sha, [...set][0] ?? 0, maxBytes);
    if (reason) problems.push({ sha256: sha, reason });
  }
  return {
    ok: true,
    checked: bytesBySha.size,
    problems,
    orphans: findOrphans(root, new Set(bytesBySha.keys())),
    torn: read.torn,
  };
}
