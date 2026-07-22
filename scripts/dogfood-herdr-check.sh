#!/usr/bin/env bash
# Dogfood requires the owner's current herdr release. Fail closed until Loom's
# committed socket adapter matches that live protocol; ping-only is not enough.
set -euo pipefail

REQUIRED_VERSION="0.7.5"
REQUIRED_PROTOCOL="17"
LOOM_PROTOCOL="$(sed -n 's/^export const HERDR_PROTOCOL_EXPECTED = \([0-9][0-9]*\);/\1/p' packages/host/src/herdr-client.ts)"

if ! command -v herdr >/dev/null 2>&1; then
  echo "error: herdr not found on PATH" >&2
  exit 1
fi

STATUS_JSON="$(herdr status server --json 2>&1)" || {
  echo "error: cannot read herdr server status" >&2
  echo "$STATUS_JSON" >&2
  exit 1
}

json_field() {
  bun -e 'const s=JSON.parse(Bun.argv[1]); const v=s[Bun.argv[2]]; if (typeof v === "string" || typeof v === "number") process.stdout.write(String(v));' "$1" "$2"
}

SERVER_VERSION="$(json_field "$STATUS_JSON" version)"
SERVER_PROTOCOL="$(json_field "$STATUS_JSON" protocol)"

if [[ "$SERVER_VERSION" != "$REQUIRED_VERSION" || "$SERVER_PROTOCOL" != "$REQUIRED_PROTOCOL" ]]; then
  echo "error: dogfood requires current herdr $REQUIRED_VERSION / protocol $REQUIRED_PROTOCOL" >&2
  echo "running: $SERVER_VERSION / protocol $SERVER_PROTOCOL" >&2
  exit 1
fi

if [[ "$LOOM_PROTOCOL" != "$REQUIRED_PROTOCOL" ]]; then
  echo "error: herdr is current ($SERVER_VERSION / protocol $SERVER_PROTOCOL), but Loom adapter expects protocol ${LOOM_PROTOCOL:-unknown}" >&2
  echo "Bridge ping can be forced green by config, but the first card will fail:" >&2
  echo "protocol 17 replaced agent.start(argv/env/placement) and agent.send(text)." >&2
  echo "Complete docs/spikes/HERDR-0.7.5-COMPAT.md before dogfood dispatch." >&2
  exit 1
fi

echo "herdr compatibility: ok ($SERVER_VERSION / protocol $SERVER_PROTOCOL)"
