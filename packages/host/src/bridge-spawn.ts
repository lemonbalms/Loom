/**
 * Start/stop bridge daemon (sticky-host pattern + M-27 identity).
 * PLAN 0.23.4: stderr → finite log file under loomDir()/bridge/.
 */
import { spawn } from "bun";
import { existsSync, mkdirSync, openSync, closeSync, chmodSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  clearBridgeMeta,
  loadBridgeMeta,
  pidLooksLikeBridge,
  resolveAliveBridgeMeta,
  type BridgeMeta,
} from "./bridge-meta";
import { isPidAlive, loadSession } from "./session-store";
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

/**
 * PLAN 0.33.0 P4 (P2 carry-over L3): the ONE profile name for every per-profile bridge file
 * (config, lock, status file, stderr log, quarantine). Same resolution the runtime has always
 * used: active profile (`--profile` / LOOM_PROFILE) → session displayName → "default".
 * `session` undefined → load the current session; null → no session.
 */
export function resolveBridgeProfile(session?: { displayName?: string } | null): string {
  const active = getActiveProfile();
  if (active) return active;
  const s = session === undefined ? loadSession() : session;
  return s?.displayName || "default";
}

/** PLAN 0.23.4 / 0.33.0 R9: `<bridgeDir>/<safeProfile>.stderr.log` (bridgeDir default `loomDir()/bridge`). */
export function bridgeLogPath(profile: string, bridgeDir?: string): string {
  return join(bridgeDir ?? join(loomDir(), "bridge"), `${sanitizeProfileLogName(profile)}.stderr.log`);
}

/**
 * P4 (L3): does a live process hold this profile's bridge lock? Read-only (owner.json pid +
 * kill 0). An owner-less / unreadable lock dir counts as held (being acquired or foreign) —
 * the caller only uses this to avoid truncating a log someone may be writing.
 */
function bridgeLockLooksHeld(profile: string): boolean {
  const lockDir = join(loomDir(), "bridge", `${sanitizeProfileLogName(profile)}.lock`);
  if (!existsSync(lockDir)) return false;
  try {
    const owner = JSON.parse(readFileSync(join(lockDir, "owner.json"), "utf8")) as { pid?: unknown };
    return typeof owner.pid === "number" && isPidAlive(owner.pid);
  } catch {
    return true;
  }
}

function bridgeMainPath(): string {
  const here = fileURLToPath(new URL(".", import.meta.url));
  const candidate = join(here, "bridge-main.ts");
  if (existsSync(candidate)) return candidate;
  const fromCwd = join(process.cwd(), "packages/host/src/bridge-main.ts");
  if (existsSync(fromCwd)) return fromCwd;
  throw new Error("Cannot find bridge-main.ts");
}

/** PLAN 0.33.0 D2: outer bound on the bridge's graceful `stop()` (signal or RPC `stop`). */
export const STOP_BOUND_MS = 10_000;

/**
 * PLAN 0.33.0 R1 / R51-L3: how long `loom bridge stop` waits for the pid to exit before
 * SIGTERM (= second signal → immediate exit). Only an ok RPC `stop` reply earns the full
 * bound + 2 s; an unreachable / non-ok bridge keeps today's 3 s.
 */
export function bridgeStopWaitMs(rpcOk: boolean): number {
  return rpcOk ? STOP_BOUND_MS + 2_000 : 3_000;
}

/** PLAN 0.33.0 R7: last non-empty line of the bridge stderr log (capped), or null. */
function lastLogLine(path: string): string | null {
  try {
    const lines = readFileSync(path, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const last = lines[lines.length - 1];
    return last ? last.slice(0, 400) : null;
  } catch {
    return null;
  }
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
  // P4 (L3): same name the runtime uses for its lock / status file (resolveBridgeProfile).
  const profile = resolveBridgeProfile();
  const active = getActiveProfile();
  if (active) env.LOOM_PROFILE = active;

  // PLAN 0.23.4: finite stderr log (truncate on each spawn, mode 0600).
  // stdout stays ignore — only bridge diagnostic logs need a sink.
  // Sanitize profile for filename so slash profiles / ".." cannot escape logDir.
  // PLAN 0.33.0 P4 (L3): never truncate while a live bridge holds the profile lock — that is
  // the holder's log, and this spawn will be refused; append so the refusal (R7) lands after
  // the holder's lines instead of wiping them.
  const logDir = join(loomDir(), "bridge");
  mkdirSync(logDir, { recursive: true });
  const stderrPath = bridgeLogPath(profile, logDir);
  let stderrFd: number | undefined;
  try {
    stderrFd = openSync(stderrPath, bridgeLockLooksHeld(profile) ? "a" : "w", 0o600);
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
      const last = stderrFd !== undefined ? lastLogLine(stderrPath) : null;
      return {
        ok: false,
        error: `bridge exited early (code ${proc.exitCode}). herdr up? session active? authorizedDispatchers set?${
          last ? ` — last log: ${last}` : ""
        }`,
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

  let rpcOk = false;
  try {
    const res = await fetch(`http://127.0.0.1:${meta.port}/rpc`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${meta.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ op: "stop" }),
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) {
      const body = (await res.json().catch(() => null)) as { ok?: unknown } | null;
      rpcOk = body?.ok === true;
    }
  } catch {
    /* */
  }

  const deadline = Date.now() + bridgeStopWaitMs(rpcOk);
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

export type BridgeDrainRemaining = {
  paneCards: number;
  convs: number;
  headlessRunning: number;
  headlessQueued: number;
};

/** PLAN 0.33.0 ② CLI drain: progress line every 2 s while waiting for the pid to exit. */
export const DRAIN_PROGRESS_MS = 2_000;
/** PLAN 0.33.0 ② CLI drain: wait bound = deadline + STOP_BOUND_MS + this slack. */
export const DRAIN_EXIT_SLACK_MS = 5_000;

export type BridgeDrainOutcome =
  | { kind: "no_bridge" }
  | { kind: "rpc_failed"; pid: number; error: string }
  | { kind: "stopped"; pid: number }
  | { kind: "still_alive"; pid: number };

async function postBridgeRpc(meta: BridgeMeta, body: Record<string, unknown>): Promise<Response> {
  return fetch(`http://127.0.0.1:${meta.port}/rpc`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${meta.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(2000),
  });
}

function formatDrainProgress(state: unknown, remaining: unknown, deadlineAt: unknown): string {
  const r = (remaining ?? {}) as Partial<BridgeDrainRemaining>;
  const n = (v: unknown) => (typeof v === "number" ? v : "?");
  const parts = [
    `${typeof state === "string" ? state : "unknown"}:`,
    `paneCards=${n(r.paneCards)}`,
    `convs=${n(r.convs)}`,
    `headlessRunning=${n(r.headlessRunning)}`,
    `headlessQueued=${n(r.headlessQueued)}`,
  ];
  if (typeof deadlineAt === "string") parts.push(`deadline=${deadlineAt}`);
  return parts.join(" ");
}

/**
 * PLAN 0.33.0 D4 / ② CLI `loom bridge drain`: RPC `drain` → one progress line every 2 s →
 * wait for the pid to exit, bounded by deadline + STOP_BOUND_MS + 5 s. Never signals the
 * bridge (drain always ends in its own exit 0; a stuck bridge is reported, not killed).
 */
export async function drainBridgeProcess(opts: {
  timeoutSec?: number;
  onProgress?: (line: string) => void;
}): Promise<BridgeDrainOutcome> {
  const meta = resolveAliveBridgeMeta();
  if (!meta) return { kind: "no_bridge" };
  const say = opts.onProgress ?? (() => {});

  let deadlineAt: string | null = null;
  try {
    const res = await postBridgeRpc(meta, {
      op: "drain",
      ...(opts.timeoutSec !== undefined ? { timeoutSec: opts.timeoutSec } : {}),
    });
    const body = (await res.json().catch(() => null)) as {
      ok?: unknown;
      state?: unknown;
      deadlineAt?: unknown;
      remaining?: unknown;
      message?: unknown;
      error?: unknown;
    } | null;
    if (!res.ok || body?.ok !== true) {
      const why = typeof body?.message === "string" ? body.message : `HTTP ${res.status}`;
      return { kind: "rpc_failed", pid: meta.pid, error: why };
    }
    deadlineAt = typeof body.deadlineAt === "string" ? body.deadlineAt : null;
    say(formatDrainProgress(body.state, body.remaining, body.deadlineAt));
  } catch (e) {
    // The bridge may have finished an idle drain before replying; judge by the pid.
    if (isPidAlive(meta.pid)) {
      return { kind: "rpc_failed", pid: meta.pid, error: e instanceof Error ? e.message : String(e) };
    }
  }

  const deadlineMs = deadlineAt ? Date.parse(deadlineAt) : Date.now();
  const bound =
    (Number.isFinite(deadlineMs) ? deadlineMs : Date.now()) + STOP_BOUND_MS + DRAIN_EXIT_SLACK_MS;
  let nextProgress = Date.now() + DRAIN_PROGRESS_MS;
  while (Date.now() < bound && isPidAlive(meta.pid)) {
    if (Date.now() >= nextProgress) {
      nextProgress = Date.now() + DRAIN_PROGRESS_MS;
      try {
        const res = await postBridgeRpc(meta, { op: "status" });
        const st = (await res.json().catch(() => null)) as {
          state?: unknown;
          remaining?: unknown;
          drain?: { deadlineAt?: unknown };
        } | null;
        if (st) say(formatDrainProgress(st.state, st.remaining, st.drain?.deadlineAt));
      } catch {
        /* stopping: the control server is going away */
      }
    }
    await Bun.sleep(50);
  }
  if (isPidAlive(meta.pid)) return { kind: "still_alive", pid: meta.pid };
  return { kind: "stopped", pid: meta.pid };
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
  const profile = args.profile ?? resolveBridgeProfile();
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
