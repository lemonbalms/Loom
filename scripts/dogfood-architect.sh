#!/usr/bin/env bash
# Start Codex directly in the current (normally herdr) pane.
# `loom run` is used only as a short config writer; it exits before the TUI starts.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v codex >/dev/null 2>&1; then
  echo "error: codex not found on PATH" >&2
  exit 1
fi

echo "==> Checking dogfood bridge …"
bash scripts/dogfood-bridge-up.sh

echo "==> Binding Loom MCP to codex-arch (non-interactive) …"
bun run packages/cli/src/index.ts --profile codex-arch run codex \
  --write-user-config -- --version

export LOOM_PROFILE=codex-arch
echo "==> Starting Codex directly; Loom has no live wrapper on this PTY."
exec codex -a never -s workspace-write "$@"
