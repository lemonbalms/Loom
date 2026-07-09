import { DEFAULT_RELAY_HOST, DEFAULT_RELAY_PORT } from "@loom/protocol";
import { RelayServer, isLoopbackHost } from "./server";

/**
 * Phase 3 remote-ready relay process.
 *
 * Local default:
 *   bun run packages/relay/src/cli.ts
 *
 * LAN / remote host (token required unless --insecure-open):
 *   LOOM_RELAY_HOST=0.0.0.0 LOOM_RELAY_PORT=7842 LOOM_RELAY_TOKEN=secret \
 *     bun run packages/relay/src/cli.ts
 */
const host =
  process.env.LOOM_RELAY_HOST ??
  process.env.FABLE_RELAY_HOST ??
  DEFAULT_RELAY_HOST;
const port = Number(
  process.env.LOOM_RELAY_PORT ??
    process.env.FABLE_RELAY_PORT ??
    DEFAULT_RELAY_PORT,
);
const authToken =
  process.env.LOOM_RELAY_TOKEN || process.env.FABLE_RELAY_TOKEN || undefined;
// RN1: no dual-read of FABLE_RELAY_INSECURE_OPEN
const allowInsecureOpen =
  process.env.LOOM_RELAY_INSECURE_OPEN === "1" ||
  process.env.LOOM_RELAY_INSECURE_OPEN === "true";

const server = new RelayServer({ host, port, authToken, allowInsecureOpen });
try {
  server.start();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}

console.log(`Loom relay listening on ${server.publicHint}`);
console.log(
  `Health: http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}/health`,
);
if (authToken) {
  console.log(
    "Auth: LOOM_RELAY_TOKEN required (Authorization: Bearer preferred; ?token= fallback)",
  );
} else if (isLoopbackHost(host)) {
  console.log("Auth: open (loopback only)");
} else if (allowInsecureOpen) {
  console.warn(
    "WARNING: --insecure-open / LOOM_RELAY_INSECURE_OPEN — anyone on the network can create rooms.",
  );
}
