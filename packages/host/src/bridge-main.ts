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
 */
import { bridgeMetaPath } from "./bridge-meta";
import {
  type BridgeRuntime,
  type StartBridgeRuntimeOptions,
  startBridgeRuntime,
} from "./bridge-runtime";
import { sessionPath } from "./session-store";

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
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
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
