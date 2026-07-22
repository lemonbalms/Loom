#!/usr/bin/env bash
# Bind the shared mac-node bridge to the current dogfood room.
# Refuses to restart a bridge with in-flight cards.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

STATE_FILE="$ROOT/.loom/dogfood-room.env"
ARCH_PROFILE_FILE="${HOME}/.loom/profiles/codex-arch.json"
NODE_PROFILE_FILE="${HOME}/.loom/profiles/mac-node.json"
NODE_META_FILE="${HOME}/.loom/profiles/mac-node.bridge.json"
NODE_CONFIG_FILE="${HOME}/.loom/bridge/mac-node.json"

if [[ ! -f "$STATE_FILE" ]]; then
  echo "error: no dogfood room; run bun run dogfood:up first" >&2
  exit 1
fi
if [[ ! -f "$ARCH_PROFILE_FILE" ]]; then
  echo "error: missing codex-arch profile; run bun run dogfood:room first" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$STATE_FILE"

loom() {
  bun run packages/cli/src/index.ts "$@"
}

# Must precede any bridge stop or room rebind. Protocol 17 can pass ping while
# failing the old agent.start/agent.send requests on the first real card.
bash scripts/dogfood-herdr-check.sh

# Sync persisted mac-node herdrProtocol to HERDR_PROTOCOL_EXPECTED after the live
# herdr check and before any "already online" ready exit. Stale config can pin
# an older protocol while live herdr + source expected already match.
PROTOCOL_CHANGED=no
PROTOCOL_CHANGED="$(
  bun -e '
    import { loadBridgeConfig, saveBridgeConfig } from "./packages/host/src/bridge-config.ts";
    import { HERDR_PROTOCOL_EXPECTED } from "./packages/host/src/herdr-client.ts";
    const cfg = loadBridgeConfig("mac-node");
    if (cfg.herdrProtocol === HERDR_PROTOCOL_EXPECTED) {
      process.stdout.write("no");
    } else {
      cfg.herdrProtocol = HERDR_PROTOCOL_EXPECTED;
      saveBridgeConfig("mac-node", cfg);
      process.stdout.write("yes");
    }
  '
)"
if [[ "$PROTOCOL_CHANGED" == "yes" ]]; then
  echo "dogfood bridge: migrated mac-node herdrProtocol to HERDR_PROTOCOL_EXPECTED"
fi

json_field() {
  bun -e 'const value = JSON.parse(await Bun.file(Bun.argv[1]).text())[Bun.argv[2]]; if (typeof value === "string") process.stdout.write(value);' "$1" "$2"
}

ARCH_PEER_ID="$(json_field "$ARCH_PROFILE_FILE" peerId)"
ARCH_ROOM_ID="$(json_field "$ARCH_PROFILE_FILE" roomId)"
NODE_ROOM_ID=""
META_ROOM_ID=""
AUTHORIZED="no"

if [[ -f "$NODE_PROFILE_FILE" ]]; then
  NODE_ROOM_ID="$(json_field "$NODE_PROFILE_FILE" roomId)"
fi
if [[ -f "$NODE_META_FILE" ]]; then
  META_ROOM_ID="$(json_field "$NODE_META_FILE" roomId)"
fi
if [[ -f "$NODE_CONFIG_FILE" ]]; then
  AUTHORIZED="$(bun -e 'const c = JSON.parse(await Bun.file(Bun.argv[1]).text()); process.stdout.write((c.authorizedDispatchers ?? []).includes(Bun.argv[2]) ? "yes" : "no");' "$NODE_CONFIG_FILE" "$ARCH_PEER_ID")"
fi

BRIDGE_STATUS="$(loom --profile mac-node bridge status 2>&1 || true)"
if [[ "$NODE_ROOM_ID" == "$ARCH_ROOM_ID" && "$META_ROOM_ID" == "$ARCH_ROOM_ID" && "$AUTHORIZED" == "yes" && "$BRIDGE_STATUS" == *"bridge: online"* && "$BRIDGE_STATUS" == *'"inFlight":0'* && "$PROTOCOL_CHANGED" == "no" ]]; then
  echo "dogfood bridge: ready (mac-node, room matched, codex-arch authorized)"
  exit 0
fi

if [[ "$BRIDGE_STATUS" == *"bridge: online"* && "$BRIDGE_STATUS" != *'"inFlight":0'* ]]; then
  echo "error: mac-node bridge has in-flight work; refusing room rebind/restart" >&2
  echo "$BRIDGE_STATUS" >&2
  exit 1
fi

echo "==> Binding mac-node to dogfood room ${LOOM_DOGFOOD_ROOM_NAME:-loom-dev} …"
loom --profile mac-node bridge stop >/dev/null
LOOM_NO_AUTO_HOST=1 loom --profile mac-node room join "$LOOM_DOGFOOD_INVITE" --as mac-node

echo "==> Authorizing codex-arch and starting the herdr bridge …"
if ! loom --profile mac-node bridge start --allow "$ARCH_PEER_ID"; then
  echo "error: bridge failed to start; inspect the fail-fast reason with:" >&2
  echo "  LOOM_PROFILE=mac-node bun run packages/host/src/bridge-main.ts" >&2
  exit 1
fi

NODE_ROOM_ID="$(json_field "$NODE_PROFILE_FILE" roomId)"
META_ROOM_ID="$(json_field "$NODE_META_FILE" roomId)"
if [[ "$NODE_ROOM_ID" != "$ARCH_ROOM_ID" || "$META_ROOM_ID" != "$ARCH_ROOM_ID" ]]; then
  echo "error: mac-node bridge room does not match codex-arch after start" >&2
  exit 1
fi

loom --profile mac-node bridge status
echo "dogfood bridge: ready (dispatch node: mac-node)"
