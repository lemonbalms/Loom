/**
 * PLAN 0.30.0 D7. Detached worker processes in their own process group.
 * stdout/stderr are file descriptors, not pipes, so the transcript survives
 * the parent. Group signals reach grandchildren (kill(-pgid)).
 */
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { chmodSync, closeSync, mkdirSync, openSync } from "node:fs";
import { dirname } from "node:path";

export type GroupSignal = "SIGTERM" | "SIGKILL";

export type SpawnedWorker = {
  child: ChildProcess;
  pid: number;
  pgid: number;
};

let cachedOwnPgid: number | undefined;

function lookupPgid(pid: number): number {
  if (!Number.isInteger(pid) || pid <= 1) return pid;
  try {
    const out = execFileSync("/bin/ps", ["-o", "pgid=", "-p", String(pid)], {
      encoding: "utf8",
      timeout: 2_000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const pgid = Number(out.trim());
    if (Number.isInteger(pgid) && pgid > 1) return pgid;
  } catch {
    /* process already exited */
  }
  return pid;
}

function ownPgid(): number {
  if (cachedOwnPgid === undefined) cachedOwnPgid = lookupPgid(process.pid);
  return cachedOwnPgid;
}

/**
 * True when `pgid` is still a live process group.
 * Signal 0 is a probe: it does not deliver SIGTERM or SIGKILL.
 * This process's own group is reported dead so callers never signal it.
 */
export function processGroupAlive(pgid: number): boolean {
  if (!Number.isInteger(pgid) || pgid <= 1) return false;
  if (pgid === ownPgid()) return false;
  try {
    process.kill(-pgid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Signal the worker group. Never signals this process's own group.
 * Never falls back to a positive pid: that pid may already belong to
 * an unrelated process. A dead or recycled group is left alone.
 */
export function killProcessGroup(pgid: number, signal: GroupSignal): void {
  if (!processGroupAlive(pgid)) return;
  try {
    process.kill(-pgid, signal);
  } catch {
    /* group disappeared between the probe and the signal */
  }
}

/**
 * Spawn `bin` detached (setsid: pid is the process group leader).
 * Parent copies of the transcript fds are closed after spawn.
 */
export function spawnDetachedWorker(opts: {
  bin: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdoutPath: string;
  stderrPath: string;
}): SpawnedWorker {
  const dir = dirname(opts.stdoutPath);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  let outFd: number | undefined;
  let errFd: number | undefined;
  try {
    outFd = openSync(opts.stdoutPath, "w", 0o600);
    errFd = openSync(opts.stderrPath, "w", 0o600);
    chmodSync(opts.stdoutPath, 0o600);
    chmodSync(opts.stderrPath, 0o600);
    const child = spawn(opts.bin, opts.args, {
      cwd: opts.cwd,
      env: opts.env,
      detached: true,
      shell: false,
      stdio: ["pipe", outFd, errFd],
    });
    const pid = child.pid ?? 0;
    const pgid = pid > 1 ? lookupPgid(pid) : 0;
    return { child, pid, pgid };
  } finally {
    // stderr open can throw after stdout succeeded. Close whichever fd is open.
    if (outFd !== undefined) {
      try {
        closeSync(outFd);
      } catch {
        /* already closed */
      }
    }
    if (errFd !== undefined) {
      try {
        closeSync(errFd);
      } catch {
        /* already closed */
      }
    }
  }
}
