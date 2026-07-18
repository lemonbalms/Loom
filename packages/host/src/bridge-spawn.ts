/**
 * Start/stop bridge daemon (sticky-host pattern + M-27 identity).
 * PLAN 0.23.4: stderr → finite log file under loomDir()/bridge/.
 */
import { spawn } from "bun";
import { existsSync, mkdirSync, openSync, closeSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  clearBridgeMeta,
  loadBridgeMeta,
  pidLooksLikeBridge,
  resolveAliveBridgeMeta,
  type BridgeMeta,
} from "./bridge-meta";
import { isPidAlive } from "./session-store";
import { getActiveProfile, sessionPath, loomDir } from "./session-store";

/**
 * PLAN 0.23.4: map profile to a filename-safe token so stderr logs stay under
 * loomDir()/bridge/ (slash profiles, "..", leading dot/dash, empty after strip).
 */
export function sanitizeProfileLogName(profile: string): string {
  let s = profile.replace(/[^A-Za-z0-9._-]/g, "-");
  s = s.replace(/^[.\-]+/, (m) => "_".repeat(m.length));
  return s.length > 0 ? s : "default";
}

function bridgeMainPath(): string {
  const here = fileURLToPath(new URL(".", import.meta.url));
  const candidate = join(here, "bridge-main.ts");
  if (existsSync(candidate)) return candidate;
  const fromCwd = join(process.cwd(), "packages/host/src/bridge-main.ts");
  if (existsSync(fromCwd)) return fromCwd;
  throw new Error("Cannot find bridge-main.ts");
}

export type BridgeStartResult =
  | { ok: true; alreadyRunning: boolean; meta: BridgeMeta }
  | { ok: false; error: string };

export async function bridgePing(meta: BridgeMeta): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${meta.port}/ping`, {
      headers: { Authorization: `Bearer ${meta.token}` },
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function startBridgeProcess(): Promise<BridgeStartResult> {
  const alive = resolveAliveBridgeMeta();
  if (alive) {
    if (await bridgePing(alive)) {
      return { ok: true, alreadyRunning: true, meta: alive };
    }
    await stopBridgeProcess();
  }

  const main = bridgeMainPath();
  const sp = sessionPath();
  const env: Record<string, string | undefined> = {
    ...process.env,
    LOOM_SESSION: sp,
  };
  const profile = getActiveProfile() ?? "default";
  if (getActiveProfile()) env.LOOM_PROFILE = profile;

  // PLAN 0.23.4: finite stderr log (truncate on each spawn, mode 0600).
  // stdout stays ignore — only bridge diagnostic logs need a sink.
  // Sanitize profile for filename so slash profiles / ".." cannot escape logDir.
  const safeProfile = sanitizeProfileLogName(profile);
  const logDir = join(loomDir(), "bridge");
  mkdirSync(logDir, { recursive: true });
  const stderrPath = join(logDir, `${safeProfile}.stderr.log`);
  let stderrFd: number | undefined;
  try {
    stderrFd = openSync(stderrPath, "w", 0o600);
    try {
      chmodSync(stderrPath, 0o600);
    } catch {
      /* best-effort on platforms that ignore mode at open */
    }
  } catch {
    stderrFd = undefined;
  }

  const proc = spawn({
    cmd: ["bun", "run", main],
    env,
    stdout: "ignore",
    stderr: stderrFd !== undefined ? stderrFd : "ignore",
    stdin: "ignore",
  });
  if (stderrFd !== undefined) {
    try {
      closeSync(stderrFd);
    } catch {
      /* child owns the fd after spawn */
    }
  }
  proc.unref();

  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    await Bun.sleep(80);
    const meta = loadBridgeMeta(sessionPath());
    if (meta && isPidAlive(meta.pid)) {
      if (await bridgePing(meta)) {
        return { ok: true, alreadyRunning: false, meta };
      }
    }
    if (proc.exitCode !== null && proc.exitCode !== undefined) {
      return {
        ok: false,
        error: `bridge exited early (code ${proc.exitCode}). herdr up? session active? authorizedDispatchers set?`,
      };
    }
  }
  return { ok: false, error: "bridge did not become ready in time" };
}

export async function stopBridgeProcess(): Promise<{
  ok: boolean;
  message: string;
}> {
  const meta = resolveAliveBridgeMeta() ?? loadBridgeMeta();
  if (!meta) {
    clearBridgeMeta(sessionPath());
    return { ok: true, message: "no bridge running" };
  }

  try {
    await fetch(`http://127.0.0.1:${meta.port}/rpc`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${meta.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ op: "stop" }),
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    /* */
  }

  const deadline = Date.now() + 3000;
  while (Date.now() < deadline && isPidAlive(meta.pid)) {
    await Bun.sleep(50);
  }

  if (isPidAlive(meta.pid)) {
    if (pidLooksLikeBridge(meta.pid)) {
      try {
        process.kill(meta.pid, "SIGTERM");
      } catch {
        /* */
      }
    } else {
      clearBridgeMeta(sessionPath());
      return {
        ok: true,
        message: `bridge meta cleared; pid ${meta.pid} did not verify as bridge-main — NOT killed (M-27)`,
      };
    }
  }
  clearBridgeMeta(sessionPath());
  return { ok: true, message: "bridge stopped" };
}

export async function bridgeStatus(): Promise<{
  running: boolean;
  meta: BridgeMeta | null;
  health?: unknown;
}> {
  const meta = resolveAliveBridgeMeta();
  if (!meta) return { running: false, meta: null };
  try {
    const res = await fetch(`http://127.0.0.1:${meta.port}/rpc`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${meta.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ op: "status" }),
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return { running: true, meta, health: { ok: false } };
    return { running: true, meta, health: await res.json() };
  } catch {
    return { running: true, meta, health: { ok: false, error: "rpc failed" } };
  }
}
