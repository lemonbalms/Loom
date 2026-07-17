#!/usr/bin/env bun
/**
 * Detached bridge daemon entrypoint.
 * Spawned by `loom bridge start` with LOOM_SESSION / LOOM_PROFILE set.
 */
import { startBridgeRuntime } from "./bridge-runtime";
import { bridgeMetaPath } from "./bridge-meta";
import { sessionPath } from "./session-store";

async function main() {
  const runtime = await startBridgeRuntime();
  console.log(
    JSON.stringify({
      ready: true,
      pid: runtime.meta.pid,
      port: runtime.meta.port,
      meta: bridgeMetaPath(sessionPath()),
    }),
  );
  // keep alive
  await new Promise(() => {});
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
