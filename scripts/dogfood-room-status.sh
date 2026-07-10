#!/usr/bin/env bash
# Show dogfood room invite + peers for all five profiles.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
STATE_FILE="$ROOT/.loom/dogfood-room.env"

loom() {
  bun run packages/cli/src/index.ts "$@"
}

if [[ ! -f "$STATE_FILE" ]]; then
  echo "No dogfood room yet. Run:"
  echo "  bun run dogfood:room"
  exit 1
fi

# shellcheck disable=SC1090
source "$STATE_FILE"

echo "Invite: ${LOOM_DOGFOOD_INVITE:-?}"
echo "Room:   ${LOOM_DOGFOOD_ROOM_NAME:-?}"
echo "Since:  ${LOOM_DOGFOOD_CREATED_AT:-?}"
echo ""

for prof in impl claude-impl codex-impl claude-rev codex-rev; do
  echo "-------- --profile $prof --------"
  loom --profile "$prof" peers 2>&1 || echo "(peers failed — rejoin: bun run dogfood:room)"
  echo ""
done

if [[ -f "$ROOT/.loom/dogfood-next-session.txt" ]]; then
  echo "-------- next-session cheat sheet --------"
  cat "$ROOT/.loom/dogfood-next-session.txt"
fi
