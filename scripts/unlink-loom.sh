#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/packages/cli"
if bun unlink 2>/dev/null; then
  echo "Unlinked @loom/cli (loom bin)."
else
  echo "bun unlink failed or package was not linked — ok if you only used scripts/loom."
fi
