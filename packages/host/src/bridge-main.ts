#!/usr/bin/env bun
/**
 * Detached bridge daemon entrypoint.
 * Spawned by `loom bridge start` with LOOM_SESSION / LOOM_PROFILE set.
 *
 * PLAN 0.33.0 D2 · R10 · R11 · R51-M2 — the only place the bridge exits the process:
 * - SIGTERM/SIGINT handlers are installed BEFORE startBridgeRuntime, so a signal during
 *   startup is held and the bridge stops right after startup completes.
 * - First signal → runtime.requestStop("signal:<NAME>") (state `stopping`, bounded stop).
 * - Second signal while stopping (or during startup) → immediate exit 0, no status write.
 * - After `stopped` is recorded → exit 0 (lingering handles never hold the process).
 * - Startup failure (incl. lock refusal) → exit 1.
 *
 * PLAN 0.34.0 D3 · R1 · R2 — service yield: with `LOOM_SERVICE=1` (exactly "1") a lock refusal
 * by a LIVE holder (`holderPid !== null`) exits 0 with one stderr line, so launchd
 * `KeepAlive{SuccessfulExit:false}` / systemd `Restart=on-failure` do not crash-loop against a
 * bridge started by hand. Holder unknown and every other startup failure stay exit 1. The
 * yielding process never writes the status file (it is the holder's). This file is the only
 * reader of `LOOM_SERVICE`.
 */
import { BridgeLockBusyError } from "./bridge-lock";
import { bridgeMetaPath } from "./bridge-meta";
import {
  type BridgeRuntime,
  type StartBridgeRuntimeOptions,
  startBridgeRuntime,
} from "./bridge-runtime";
import { sessionPath } from "./session-store";

/** D3: startup error `err` under `env` is a service yield (exit 0) — pure. */
export function isServiceYield(err: unknown, env: Record<string, string | undefined>): boolean {
  return env.LOOM_SERVICE === "1" && err instanceof BridgeLockBusyError && err.holderPid !== null;
}

export async function runBridgeMain(
  opts: { runtimeOptions?: StartBridgeRuntimeOptions } = {},
): Promise<void> {
  let runtime: BridgeRuntime | null = null;
  let pendingSignal: NodeJS.Signals | null = null;

  const exitNow = (name: NodeJS.Signals): never => {
    console.error(`[loom-bridge] second signal ${name} — exiting now`);
    process.exit(0);
  };

  const onSignal = (name: NodeJS.Signals): void => {
    if (!runtime) {
      if (pendingSignal) exitNow(name);
      pendingSignal = name;
      console.error(`[loom-bridge] signal ${name} during startup — stopping once started`);
      return;
    }
    const state = runtime.state();
    if (state === "stopping" || state === "stopped") exitNow(name);
    void runtime.requestStop(`signal:${name}`);
  };
  process.on("SIGTERM", onSignal);
  process.on("SIGINT", onSignal);

  try {
    runtime = await startBridgeRuntime({
      srcPath: import.meta.path,
      ...opts.runtimeOptions,
    });
  } catch (e) {
    const serviceYield = isServiceYield(e, process.env);
    if (serviceYield && e instanceof BridgeLockBusyError) {
      console.error(
        `[loom-bridge] yield to bridge pid ${e.holderPid} (lock ${e.lockPath}) — service stays down until \`loom service start\``,
      );
    } else {
      console.error(e instanceof Error ? e.message : e);
    }
    process.exit(serviceYield ? 0 : 1);
  }

  console.log(
    JSON.stringify({
      ready: true,
      pid: runtime.meta.pid,
      port: runtime.meta.port,
      meta: bridgeMetaPath(sessionPath()),
    }),
  );
  if (pendingSignal) void runtime.requestStop(`signal:${pendingSignal}`);

  // Stays here until a signal / RPC stop finishes the bounded stop and records `stopped`.
  await runtime.stopped;
  process.exit(0);
}

if (import.meta.main) void runBridgeMain();
