#!/usr/bin/env bash
# Link @loom/cli so `loom` is available on PATH (Bun global bin).
# Requires: bun on PATH, run from anywhere — script finds repo root.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v bun >/dev/null 2>&1; then
  echo "error: bun not found on PATH" >&2
  exit 1
fi

echo "Linking @loom/cli (bin: loom) from packages/cli …"
(
  cd "$ROOT/packages/cli"
  bun link
)

BUN_BIN="${BUN_INSTALL:-$HOME/.bun}/bin"
echo ""
echo "Done. Ensure Bun's bin dir is on PATH:"
echo "  export PATH=\"$BUN_BIN:\$PATH\""
echo ""
echo "Verify:"
echo "  loom --version"
echo ""
echo "If loom is still not found, try:"
echo "  export PATH=\"$ROOT/scripts:\$PATH\"   # repo wrapper"
echo "  # or always: bun run loom …  (from repo root)"
echo ""
echo "Unlink later: bun run unlink:loom"
