/**
 * Atomic JSON persistence helpers (R8 H-7 / R9 L-12).
 * - write: temp file + rename (no O_TRUNC torn reads of final path)
 * - lock: exclusive dir lock with pid ownership + stale reclaim only if owner dead
 * - corrupt: never treat parse failure as empty — backup + throw
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  chmodSync,
  copyFileSync,
  statSync,
  rmSync,
} from "node:fs";
import { dirname, basename, join } from "node:path";

const LOCK_STALE_MS = 5000;
const LOCK_WAIT_MS = 4000;
const LOCK_POLL_MS = 25;

export function writeAtomicJson(filePath: string, data: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmp = join(
    dirname(filePath),
    `.${basename(filePath)}.tmp.${process.pid}.${Date.now()}`,
  );
  const body = JSON.stringify(data, null, 2) + "\n";
  writeFileSync(tmp, body, { encoding: "utf8", mode: 0o600 });
  renameSync(tmp, filePath);
  try {
    chmodSync(filePath, 0o600);
  } catch {
    /* */
  }
}

/**
 * Read JSON object from path. Missing file → null.
 * Parse/IO error → copy to .corrupt-<ts> and throw (never silent empty).
 */
export function readJsonFile(filePath: string): unknown | null {
  if (!existsSync(filePath)) return null;
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (e) {
    throw new Error(
      `Failed to read ${filePath}: ${e instanceof Error ? e.message : e}`,
    );
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch (e) {
    const bak = `${filePath}.corrupt-${Date.now()}`;
    try {
      copyFileSync(filePath, bak);
    } catch {
      /* best effort */
    }
    throw new Error(
      `Corrupt JSON at ${filePath} (backed up to ${bak}): ${e instanceof Error ? e.message : e}`,
    );
  }
}

function isPidAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function lockPidPath(lockDir: string): string {
  return join(lockDir, "owner.pid");
}

/** L-12: exclusive mkdir + write owner pid (only we may release our lock). */
function tryAcquireLock(lockDir: string): boolean {
  try {
    mkdirSync(lockDir);
  } catch {
    return false;
  }
  try {
    writeFileSync(lockPidPath(lockDir), `${process.pid}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    return true;
  } catch {
    try {
      rmSync(lockDir, { recursive: true, force: true });
    } catch {
      /* */
    }
    return false;
  }
}

function readLockOwnerPid(lockDir: string): number | null {
  try {
    const raw = readFileSync(lockPidPath(lockDir), "utf8").trim();
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/**
 * Release only if we own the lock (pid match) or force (dead owner reclaim path).
 */
function releaseLock(lockDir: string, opts?: { force?: boolean }): void {
  if (!existsSync(lockDir)) return;
  if (!opts?.force) {
    const owner = readLockOwnerPid(lockDir);
    if (owner !== null && owner !== process.pid) {
      // never delete another live process's lock
      return;
    }
  }
  try {
    rmSync(lockDir, { recursive: true, force: true });
  } catch {
    /* */
  }
}

function lockAgeMs(lockDir: string): number {
  try {
    return Date.now() - statSync(lockDir).mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * Reclaim only when lock is old AND owner pid is dead or missing.
 * Avoids two waiters both rmdir'ing a live lock (L-12).
 */
function tryReclaimStaleLock(lockDir: string): boolean {
  if (!existsSync(lockDir)) return true;
  if (lockAgeMs(lockDir) < LOCK_STALE_MS) return false;
  const owner = readLockOwnerPid(lockDir);
  if (owner !== null && isPidAlive(owner)) {
    return false;
  }
  releaseLock(lockDir, { force: true });
  return !existsSync(lockDir);
}

/** Non-spin sleep (L-12). Prefer Bun.sleepSync; else Atomics.wait. */
export function sleepMs(ms: number): void {
  if (typeof Bun !== "undefined" && typeof Bun.sleepSync === "function") {
    Bun.sleepSync(ms);
    return;
  }
  try {
    const sab = new SharedArrayBuffer(4);
    const ia = new Int32Array(sab);
    Atomics.wait(ia, 0, 0, ms);
  } catch {
    // last resort: short yield loop without tight spin
    const end = Date.now() + ms;
    while (Date.now() < end) {
      // eslint-disable-next-line no-empty
    }
  }
}

/** Run fn while holding an exclusive lock adjacent to filePath. */
export function withFileLock<T>(filePath: string, fn: () => T): T {
  const lockDir = `${filePath}.lock`;
  mkdirSync(dirname(filePath), { recursive: true });
  const start = Date.now();
  while (!tryAcquireLock(lockDir)) {
    tryReclaimStaleLock(lockDir);
    if (tryAcquireLock(lockDir)) break;
    if (Date.now() - start > LOCK_WAIT_MS) {
      throw new Error(
        `Timeout waiting for lock ${lockDir} (another process updating board/pack?)`,
      );
    }
    sleepMs(LOCK_POLL_MS);
  }
  try {
    return fn();
  } finally {
    releaseLock(lockDir);
  }
}
