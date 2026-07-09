#!/usr/bin/env bun
/**
 * Detached sticky host entrypoint.
 * Spawned by `loom host start` with LOOM_SESSION / LOOM_PROFILE set
 * (FABLE_* dual-written during transition).
 */
import { startStickyServer } from "./sticky-server";
import { stickyMetaPath } from "./sticky-meta";
import { sessionPath } from "./session-store";

async function main() {
  const server = await startStickyServer();
  // stdout one line for parent waiter (even if redirected, parent polls meta)
  console.log(
    JSON.stringify({
      ready: true,
      pid: server.meta.pid,
      port: server.meta.port,
      meta: stickyMetaPath(sessionPath()),
    }),
  );
  // keep alive
  await new Promise(() => {});
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
