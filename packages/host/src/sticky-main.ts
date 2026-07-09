#!/usr/bin/env bun
/**
 * Detached sticky host entrypoint.
 * Spawned by `fable host start` with FABLE_SESSION / FABLE_PROFILE set.
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
