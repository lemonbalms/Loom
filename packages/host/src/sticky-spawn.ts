import { spawn } from "bun";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  clearStickyMeta,
  isPidAlive,
  loadStickyMeta,
  pidLooksLikeStickyHost,
  type StickyHostMeta,
} from "./sticky-meta";
import {
  resolveAliveHostMeta,
  resolveLiveHostMeta,
  stickyRpc,
} from "./sticky-client";
import { getActiveProfile, sessionPath } from "./session-store";

function stickyMainPath(): string {
  const here = fileURLToPath(new URL(".", import.meta.url));
  const candidate = join(here, "sticky-main.ts");
  if (existsSync(candidate)) return candidate;
  const fromCwd = join(process.cwd(), "packages/host/src/sticky-main.ts");
  if (existsSync(fromCwd)) return fromCwd;
  throw new Error("Cannot find sticky-main.ts");
}

export type HostStartResult =
  | { ok: true; alreadyRunning: boolean; meta: StickyHostMeta }
  | { ok: false; error: string };

/**
 * Start sticky host daemon for current session (opt-in).
 * Idempotent if already running for this session.
 */
export async function startStickyHostProcess(): Promise<HostStartResult> {
  // Alive host for this session file (may be stale room — stop first if mismatch)
  const alive = resolveAliveHostMeta();
  if (alive) {
    const matched = resolveLiveHostMeta();
    if (matched) {
      const ping = await stickyRpc({ op: "ping" }, { meta: matched });
      if (ping.ok) {
        return { ok: true, alreadyRunning: true, meta: matched };
      }
    }
    // stale or dead RPC — stop before re-start
    await stopStickyHostProcess();
  }

  const main = stickyMainPath();
  const sp = sessionPath();
  // 0.10: LOOM_* only (FABLE_* dual-write removed)
  const env: Record<string, string | undefined> = {
    ...process.env,
    LOOM_SESSION: sp,
  };
  const profile = getActiveProfile();
  if (profile) env.LOOM_PROFILE = profile;

  const proc = spawn({
    cmd: ["bun", "run", main],
    env,
    stdout: "ignore",
    stderr: "ignore",
    stdin: "ignore",
  });
  proc.unref();

  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    await Bun.sleep(80);
    const meta = loadStickyMeta(sessionPath());
    if (meta && isPidAlive(meta.pid)) {
      const ping = await stickyRpc({ op: "ping" }, { meta });
      if (ping.ok) {
        return { ok: true, alreadyRunning: false, meta };
      }
    }
    if (proc.exitCode !== null && proc.exitCode !== undefined) {
      return {
        ok: false,
        error: `sticky host exited early (code ${proc.exitCode}). Is a room session active?`,
      };
    }
  }

  return {
    ok: false,
    error: "sticky host did not become ready in time",
  };
}

export async function stopStickyHostProcess(): Promise<{
  ok: boolean;
  message: string;
}> {
  // Use alive (not session-matched) so F-2 stale hosts can still be stopped
  const meta = resolveAliveHostMeta();
  if (!meta) {
    clearStickyMeta(sessionPath());
    return { ok: true, message: "no sticky host running" };
  }
  const res = await stickyRpc({ op: "stop" }, { meta });
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline && isPidAlive(meta.pid)) {
    await Bun.sleep(50);
  }
  if (isPidAlive(meta.pid)) {
    // M-27: RPC stop failed or timed out — the exact condition that means we
    // could not confirm this pid over IPC. Verify process identity before a raw
    // SIGTERM so a post-reboot pid-reuse can't kill an unrelated process. On any
    // doubt, clear the stale meta + warn instead of killing.
    if (pidLooksLikeStickyHost(meta.pid)) {
      try {
        process.kill(meta.pid, "SIGTERM");
      } catch {
        /* */
      }
    } else {
      clearStickyMeta(sessionPath());
      return {
        ok: true,
        message: `sticky host meta cleared; pid ${meta.pid} did not verify as our sticky host — NOT killed (M-27)`,
      };
    }
  }
  clearStickyMeta(sessionPath());
  return {
    ok: true,
    message: res.ok ? "sticky host stopping" : "sticky host stopped (forced)",
  };
}
