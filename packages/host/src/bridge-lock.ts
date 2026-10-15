/**
 * PLAN 0.33.0 D3 — per-profile bridge pid-ownership lock (② 락 / 거부 / 회수 rows · R8 · R9).
 *
 * Layout: `loomDir()/bridge/<safeProfile>.lock/owner.json` — dir 0700, file 0600,
 * `{v:1, pid, lstart, startedAt, version}`. Acquire = exclusive `mkdir` → atomic owner.json
 * (directory removed on write failure — `relay/src/persist.ts` pattern). Release removes the
 * lock only when owner.json still names us (pid + lstart + startedAt).
 *
 * Stale reclaim: holder pid dead (`kill(pid,0)` → ESRCH) or alive with a different
 * `ps -o lstart=` start time (pid reuse). Alive with an unreadable start time → assumed alive
 * (refused, lock path named for manual removal). Reclaim renames the stale dir away under a
 * short `<lock>.reclaim` mutex and never signals any process; the fresh `mkdir` race that
 * follows has exactly one winner — losers take the refusal path.
 */
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { sleepMs, writeAtomicJson } from "./atomic-json";
import { sanitizeProfileLogName } from "./bridge-spawn";
import { parseLstart, readProcessLstart } from "./process-lstart";
import { loomDir } from "./session-store";

/** A lock dir whose owner.json is missing/corrupt is "being acquired" for this long. */
export const LOCK_INCOMPLETE_GRACE_MS = 5_000;
/** A leftover reclaim mutex older than this belongs to a crashed reclaimer. */
const RECLAIM_MUTEX_STALE_MS = 5_000;
/** Upper bound on in-call retries (lock vanished / reclaim mutex busy). */
const ACQUIRE_WAIT_MS = 3_000;
const RETRY_SLEEP_MS = 10;

export interface BridgeLockOwner {
  v: 1;
  pid: number;
  lstart: string;
  startedAt: string;
  version: string;
}

export interface BridgeLockHandle {
  readonly path: string;
  readonly profile: string;
  readonly owner: BridgeLockOwner;
  /** Remove the lock iff owner.json still names us. Idempotent; true only when removed now. */
  release(): boolean;
}

export interface AcquireBridgeLockOptions {
  profile: string;
  /** CLI `VERSION` of the running bridge. */
  version: string;
  /** stderr sink (one line per reclaim). Default: process.stderr. */
  log?: (line: string) => void;
  /** Liveness probe — only ever called with signal 0. Default: process.kill. */
  kill?: (pid: number, signal: 0) => unknown;
  /** Start-time reader. Default: shared `ps -o lstart=` reader. */
  readLstart?: (pid: number) => string | null;
  now?: () => Date;
}

export class BridgeLockBusyError extends Error {
  readonly holderPid: number | null;
  readonly lockPath: string;
  constructor(message: string, holderPid: number | null, lockPath: string) {
    super(message);
    this.name = "BridgeLockBusyError";
    this.holderPid = holderPid;
    this.lockPath = lockPath;
  }
}

export function bridgeLockPath(profile: string): string {
  return join(loomDir(), "bridge", `${sanitizeProfileLogName(profile)}.lock`);
}

function ownerPath(lockPath: string): string {
  return join(lockPath, "owner.json");
}

function parseOwner(raw: unknown): BridgeLockOwner | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return null;
  if (typeof o.pid !== "number" || !Number.isInteger(o.pid) || o.pid <= 1) return null;
  if (typeof o.lstart !== "string") return null;
  if (typeof o.startedAt !== "string") return null;
  if (typeof o.version !== "string") return null;
  return { v: 1, pid: o.pid, lstart: o.lstart, startedAt: o.startedAt, version: o.version };
}

function readOwnerAt(lockPath: string): BridgeLockOwner | null {
  try {
    return parseOwner(JSON.parse(readFileSync(ownerPath(lockPath), "utf8")));
  } catch {
    return null;
  }
}

/** Current owner of a profile's bridge lock, or null (absent / incomplete / corrupt). */
export function readBridgeLockOwner(profile: string): BridgeLockOwner | null {
  return readOwnerAt(bridgeLockPath(profile));
}

function sameOwner(a: BridgeLockOwner, b: BridgeLockOwner): boolean {
  return a.pid === b.pid && a.lstart === b.lstart && a.startedAt === b.startedAt;
}

/** "same" | "different" | "unknown" — recorded vs observed start time. */
function compareLstart(
  recorded: string,
  observed: string | null,
): "same" | "different" | "unknown" {
  if (recorded.trim() === "" || observed === null) return "unknown";
  const a = parseLstart(recorded);
  const b = parseLstart(observed);
  if (a !== null && b !== null) return a === b ? "same" : "different";
  const norm = (s: string) => s.trim().replace(/\s+/g, " ");
  return norm(recorded) === norm(observed) ? "same" : "different";
}

type Verdict =
  | { kind: "gone" }
  | { kind: "live"; owner: BridgeLockOwner; verified: boolean }
  | { kind: "incomplete" }
  | { kind: "stale"; owner: BridgeLockOwner | null };

/** Age of a path's mtime; a missing path is "fresh" unless `missing` says otherwise. */
function ageMs(path: string, missing = 0): number {
  try {
    return Date.now() - statSync(path).mtimeMs;
  } catch {
    return missing;
  }
}

interface Probe {
  kill: (pid: number, signal: 0) => unknown;
  readLstart: (pid: number) => string | null;
}

function inspect(lockPath: string, probe: Probe): Verdict {
  if (!existsSync(lockPath)) return { kind: "gone" };
  const owner = readOwnerAt(lockPath);
  if (!owner) {
    // Missing / partial / corrupt owner.json: a racing acquirer between mkdir and the
    // owner write, or a crash in that window. Only the latter gets old.
    const youngest = Math.min(
      ageMs(lockPath),
      ageMs(ownerPath(lockPath), Number.POSITIVE_INFINITY),
    );
    return youngest >= LOCK_INCOMPLETE_GRACE_MS
      ? { kind: "stale", owner: null }
      : { kind: "incomplete" };
  }
  try {
    probe.kill(owner.pid, 0);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ESRCH") return { kind: "stale", owner };
    // EPERM etc.: the pid exists — fall through to the start-time check.
  }
  const cmp = compareLstart(owner.lstart, probe.readLstart(owner.pid));
  if (cmp === "different") return { kind: "stale", owner };
  return { kind: "live", owner, verified: cmp === "same" };
}

function busyError(profile: string, lockPath: string, verdict: Verdict): BridgeLockBusyError {
  if (verdict.kind === "live") {
    const { owner } = verdict;
    let message = `bridge already running for profile ${profile} (pid ${owner.pid}, started ${owner.startedAt}) — lock ${lockPath}`;
    if (!verdict.verified) {
      message += ` (holder start time unverifiable — if pid ${owner.pid} is not a loom bridge, remove ${lockPath} manually)`;
    }
    return new BridgeLockBusyError(message, owner.pid, lockPath);
  }
  return new BridgeLockBusyError(
    `bridge already running for profile ${profile} (pid unknown, started unknown) — lock ${lockPath}`,
    null,
    lockPath,
  );
}

/** Exclusive mkdir + atomic owner.json. false = the lock dir already exists. */
function tryCreate(lockPath: string, owner: BridgeLockOwner): boolean {
  try {
    mkdirSync(lockPath, { mode: 0o700 });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw err;
  }
  try {
    chmodSync(lockPath, 0o700);
    writeAtomicJson(ownerPath(lockPath), owner);
    return true;
  } catch (err) {
    try {
      rmSync(lockPath, { recursive: true, force: true });
    } catch {
      /* */
    }
    throw err;
  }
}

/**
 * Rename the stale lock away under a short mutex. Re-inspects inside the mutex so a lock
 * freshly created by another acquirer is never moved. Returns "reclaimed" | "busy" | "changed".
 */
function reclaim(
  lockPath: string,
  judged: Verdict & { kind: "stale" },
  probe: Probe,
): "reclaimed" | "busy" | "changed" {
  const mutex = `${lockPath}.reclaim`;
  try {
    mkdirSync(mutex, { mode: 0o700 });
  } catch {
    if (ageMs(mutex) >= RECLAIM_MUTEX_STALE_MS) {
      try {
        rmSync(mutex, { recursive: true, force: true });
      } catch {
        /* */
      }
    }
    return "busy";
  }
  try {
    const now = inspect(lockPath, probe);
    if (now.kind !== "stale") return "changed";
    if (judged.owner && (!now.owner || !sameOwner(judged.owner, now.owner))) return "changed";
    if (!judged.owner && now.owner) return "changed";
    const away = `${lockPath}.stale-${process.pid}-${Date.now()}`;
    try {
      renameSync(lockPath, away);
    } catch {
      return "changed";
    }
    try {
      rmSync(away, { recursive: true, force: true });
    } catch {
      /* best effort — a leftover renamed dir is inert */
    }
    return "reclaimed";
  } finally {
    try {
      rmSync(mutex, { recursive: true, force: true });
    } catch {
      /* */
    }
  }
}

const releasedHandles = new WeakSet<BridgeLockHandle>();

/** Release iff owner.json still names this handle (pid + lstart + startedAt). */
export function releaseBridgeLock(handle: BridgeLockHandle): boolean {
  if (releasedHandles.has(handle)) return false;
  if (!existsSync(handle.path)) {
    releasedHandles.add(handle);
    return false;
  }
  const current = readOwnerAt(handle.path);
  if (!current || !sameOwner(current, handle.owner)) return false; // never delete another owner's lock
  try {
    rmSync(handle.path, { recursive: true, force: true });
  } catch {
    return false;
  }
  releasedHandles.add(handle);
  return true;
}

/**
 * Acquire the profile's bridge lock or throw `BridgeLockBusyError` naming the holder pid.
 * Other I/O failures (unwritable home etc.) are thrown as-is.
 */
export function acquireBridgeLock(opts: AcquireBridgeLockOptions): BridgeLockHandle {
  const lockPath = bridgeLockPath(opts.profile);
  const log = opts.log ?? ((line: string) => process.stderr.write(`${line}\n`));
  const probe: Probe = {
    kill: opts.kill ?? ((pid, signal) => process.kill(pid, signal)),
    readLstart: opts.readLstart ?? readProcessLstart,
  };
  const now = opts.now ?? (() => new Date());
  mkdirSync(dirname(lockPath), { recursive: true, mode: 0o700 });

  const owner: BridgeLockOwner = {
    v: 1,
    pid: process.pid,
    lstart: probe.readLstart(process.pid) ?? "",
    startedAt: now().toISOString(),
    version: opts.version,
  };

  const deadline = Date.now() + ACQUIRE_WAIT_MS;
  let last: Verdict = { kind: "incomplete" };
  while (true) {
    if (tryCreate(lockPath, owner)) {
      const handle: BridgeLockHandle = {
        path: lockPath,
        profile: opts.profile,
        owner,
        release: () => releaseBridgeLock(handle),
      };
      return handle;
    }
    const verdict = inspect(lockPath, probe);
    last = verdict;
    if (verdict.kind === "live" || verdict.kind === "incomplete") {
      throw busyError(opts.profile, lockPath, verdict);
    }
    if (verdict.kind === "stale") {
      const outcome = reclaim(lockPath, verdict, probe);
      if (outcome === "reclaimed") {
        log(`[bridge] reclaimed stale lock pid=${verdict.owner ? verdict.owner.pid : "unknown"}`);
        continue;
      }
    }
    // "gone", reclaim mutex busy, or the lock changed under us: retry briefly, bounded.
    if (Date.now() >= deadline) throw busyError(opts.profile, lockPath, last);
    sleepMs(RETRY_SLEEP_MS);
  }
}
