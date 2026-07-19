import {
  DEFAULT_RELAY_HOST,
  DEFAULT_RELAY_PORT,
  envRelayHost,
  envRelayPort,
  envRelayToken,
} from "@loom/protocol";
import { RelayServer, isLoopbackHost } from "./server";
import { RoomRegistry } from "./room";
import { resolveRegistryOptionsFromEnv } from "./registry-options";

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
const host = envRelayHost() ?? DEFAULT_RELAY_HOST;
const port = Number(envRelayPort() ?? DEFAULT_RELAY_PORT);
const authToken = envRelayToken() || undefined;
// RN1: no dual-read of FABLE_RELAY_INSECURE_OPEN (H-5)
const allowInsecureOpen =
  process.env.LOOM_RELAY_INSECURE_OPEN === "1" ||
  process.env.LOOM_RELAY_INSECURE_OPEN === "true";
// R11 Low: legacy insecure env alone does not open the relay — warn once
const legacyInsecure =
  process.env.FABLE_RELAY_INSECURE_OPEN === "1" ||
  process.env.FABLE_RELAY_INSECURE_OPEN === "true";
if (legacyInsecure && !allowInsecureOpen) {
  console.warn(
    "[loom] FABLE_RELAY_INSECURE_OPEN is ignored after rename; set LOOM_RELAY_INSECURE_OPEN=1 or pass --insecure-open explicitly",
  );
}

// Production durable ON by default; LOOM_RELAY_STATE_DIR override; standalone default = ~/.loom/relay-state (M-21 gate-exempt)
// D6: env → options only (R38 M-1 — construct / try/catch / exit stay here)
const registryOpts = resolveRegistryOptionsFromEnv();
const ephemeral = registryOpts.ephemeral === true;
const stateDir = registryOpts.stateDir;

let registry: RoomRegistry;
try {
  registry = new RoomRegistry(registryOpts);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}

const server = new RelayServer({
  host,
  port,
  authToken,
  allowInsecureOpen,
  registry,
});
try {
  server.start();
} catch (e) {
  registry.close();
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}

const shutdown = () => {
  try {
    registry.close();
  } catch {
    /* */
  }
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log(`Loom relay listening on ${server.publicHint}`);
console.log(
  `Health: http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}/health`,
);
if (ephemeral) {
  console.log("State: ephemeral (LOOM_RELAY_EPHEMERAL) — inbox lost on restart");
} else {
  console.log(`State: durable ${stateDir}`);
}
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
