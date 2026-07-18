#!/usr/bin/env bash
# 0.17 Launcher UX — one command to bring the dogfood room online in the
# background. Morning-once; close the terminal afterwards and peers stay online.
#
#   1) ensure room + join all dogfood profiles (auto-host suppressed during setup)
#   2) start a sticky host for each dogfood profile via `loom up` (M-28 sequential)
#
# Usage (repo root):
#   bun run dogfood:up            # create/rejoin room + hosts online
#   bun run dogfood:up -- --fresh # force a new room first
#   bun run dogfood:up -- --status  # just report host online/offline per profile
#
# Then (only when actually processing work):
#   bun run loom --profile claude-rev run claude
#   bun run loom --profile grok-impl  run grok
# Stop hosts:
#   bun run loom down --profiles impl,claude-impl,codex-impl,claude-rev,codex-rev
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PROFILES="impl,claude-impl,codex-impl,claude-rev,codex-rev"

loom() {
  bun run packages/cli/src/index.ts "$@"
}

# `--status` short-circuits: report only, never join or spawn.
for arg in "$@"; do
  if [[ "$arg" == "--status" ]]; then
    loom up --profiles "$PROFILES" --status
    exit 0
  fi
done

# Step 1 — joins only. LOOM_NO_AUTO_HOST=1 avoids per-join auto-host (we batch
# the hosts in one sequential `loom up` below, which is faster and clearer).
echo "==> Ensuring room + joining dogfood profiles (hosts started in step 2) …"
LOOM_NO_AUTO_HOST=1 bash scripts/dogfood-room-up.sh "$@"

# Step 2 — bring a sticky host online for each profile (M-28: `loom up` is
# sequential internally). Idempotent: already-running hosts report "already".
echo ""
echo "==> Bringing sticky hosts online (loom up) …"
loom up --profiles "$PROFILES"

echo ""
echo "=========================================="
echo " Dogfood room online in the background"
echo " Closing this terminal is OK — peers stay online."
echo "=========================================="
echo "Process work (only when working):"
echo "  bun run loom --profile claude-rev run claude"
echo "  bun run loom --profile grok-impl  run grok"
echo "Stop hosts:"
echo "  bun run loom down --profiles $PROFILES"
