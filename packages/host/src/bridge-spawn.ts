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
import {
  QuarantineStore,
  type QuarantineAckResult,
  type QuarantineKey,
} from "./result-quarantine";

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

/**
 * PLAN 0.28.0 M3: operator quarantine ack against the authoritative store.
 * - Live bridge (alive meta) → authenticated RPC on that process's store
 *   (clears timer/map + live status). Fail closed if RPC fails — never a
 *   second local store while a daemon owns state.
 * - No bridge → load durable JSONL locally and ack there.
 */
export async function bridgeQuarantineAck(args: {
  cardId: string;
  dispatchHandoffId: string;
  /** Omit for single-match inference on (cardId, dispatchHandoffId). */
  key?: QuarantineKey;
  profile?: string;
}): Promise<
  QuarantineAckResult & {
    via: "rpc" | "local";
    quarantineUnresolved?: number;
  }
> {
  const meta = resolveAliveBridgeMeta();
  if (meta) {
    try {
      const res = await fetch(`http://127.0.0.1:${meta.port}/rpc`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${meta.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          op: "quarantine_ack",
          cardId: args.cardId,
          dispatchHandoffId: args.dispatchHandoffId,
          ...(args.key ? { key: args.key } : {}),
        }),
        signal: AbortSignal.timeout(3000),
      });
      let body: {
        ok?: boolean;
        key?: QuarantineKey;
        error?: string;
        message?: string;
        matches?: QuarantineKey[];
        quarantineUnresolved?: number;
      } = {};
      try {
        body = (await res.json()) as typeof body;
      } catch {
        /* non-JSON */
      }
      if (!res.ok && body.ok !== true && body.ok !== false) {
        return {
          ok: false,
          error: "append_failed",
          message: `bridge quarantine_ack RPC failed (HTTP ${res.status}); refuse local dual-store ack while daemon is live`,
          via: "rpc",
        };
      }
      if (body.ok === true && body.key) {
        return {
          ok: true,
          key: body.key,
          via: "rpc",
          quarantineUnresolved: body.quarantineUnresolved,
        };
      }
      if (body.ok === false) {
        const err =
          body.error === "not_found" ||
          body.error === "ambiguous" ||
          body.error === "append_failed"
            ? body.error
            : "append_failed";
        return {
          ok: false,
          error: err,
          message:
            body.message ??
            `bridge quarantine_ack failed (HTTP ${res.status})`,
          ...(body.matches ? { matches: body.matches } : {}),
          via: "rpc",
          quarantineUnresolved: body.quarantineUnresolved,
        };
      }
      return {
        ok: false,
        error: "append_failed",
        message: `bridge quarantine_ack RPC returned unexpected body (HTTP ${res.status}); refuse local dual-store ack while daemon is live`,
        via: "rpc",
      };
    } catch (e) {
      return {
        ok: false,
        error: "append_failed",
        message: `bridge quarantine_ack RPC error: ${
          e instanceof Error ? e.message : String(e)
        }; refuse local dual-store ack while daemon is live`,
        via: "rpc",
      };
    }
  }

  // Offline: authoritative durable store is local JSONL (no live daemon).
  const profile =
    args.profile ?? getActiveProfile() ?? "default";
  const store = new QuarantineStore({ profile });
  store.load();
  const result = store.ackOperator({
    cardId: args.cardId,
    dispatchHandoffId: args.dispatchHandoffId,
    key: args.key,
  });
  const remaining = store.unresolvedCount();
  store.disposeTimers();
  if (result.ok) {
    return { ...result, via: "local", quarantineUnresolved: remaining };
  }
  return { ...result, via: "local", quarantineUnresolved: remaining };
}
