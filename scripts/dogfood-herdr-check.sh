#!/usr/bin/env bash
# Dogfood requires a proven herdr release. Fail closed unless the live
# version/protocol pair is in the table below AND Loom's committed socket
# adapter supports that protocol; ping-only is not enough.
set -euo pipefail

# Exact version:protocol pairs proven for dogfood (PLAN 0.45.3 R7).
SUPPORTED_HERDR="0.7.5:17 0.9.5:22"
LOOM_PROTOCOLS="$(bun -e '
  import { HERDR_PROTOCOLS_SUPPORTED } from "./packages/host/src/herdr-client.ts";
  process.stdout.write(HERDR_PROTOCOLS_SUPPORTED.join(" "));
')"

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

PAIR_OK=no
for pair in $SUPPORTED_HERDR; do
  if [[ "$SERVER_VERSION:$SERVER_PROTOCOL" == "$pair" ]]; then
    PAIR_OK=yes
  fi
done

if [[ "$PAIR_OK" != "yes" ]]; then
  echo "error: dogfood requires herdr version:protocol in: $SUPPORTED_HERDR" >&2
  echo "running: $SERVER_VERSION / protocol $SERVER_PROTOCOL" >&2
  exit 1
fi

if [[ " $LOOM_PROTOCOLS " != *" $SERVER_PROTOCOL "* ]]; then
  echo "error: herdr is current ($SERVER_VERSION / protocol $SERVER_PROTOCOL), but protocol $SERVER_PROTOCOL is not in Loom's supported set (${LOOM_PROTOCOLS:-unknown})" >&2
  echo "Bridge ping can be forced green by config, but the first card will fail:" >&2
  echo "Loom supports herdr protocols ${LOOM_PROTOCOLS:-unknown}; see docs/spikes/HERDR-0.9.5-COMPAT.md." >&2
  exit 1
fi

echo "herdr compatibility: ok ($SERVER_VERSION / protocol $SERVER_PROTOCOL)"
