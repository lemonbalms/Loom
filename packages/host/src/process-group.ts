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

/** Signal the worker group. Never signals this process's own group. */
export function killProcessGroup(pgid: number, signal: GroupSignal): void {
  if (!Number.isInteger(pgid) || pgid <= 1) return;
  if (pgid === ownPgid()) return;
  try {
    process.kill(-pgid, signal);
    return;
  } catch {
    /* not a group leader, or already dead */
  }
  try {
    process.kill(pgid, signal);
  } catch {
    /* already dead */
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
  mkdirSync(dirname(opts.stdoutPath), { recursive: true });
  const outFd = openSync(opts.stdoutPath, "w", 0o600);
  const errFd = openSync(opts.stderrPath, "w", 0o600);
  try {
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
    closeSync(outFd);
    closeSync(errFd);
  }
}
