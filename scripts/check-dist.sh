#!/usr/bin/env bash
# Guard: committed dist/loom.js must match a fresh bun build of packages/cli.
# Catches silent drift after source changes when the bundle is not regenerated.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMMITTED="dist/loom.js"
if [[ ! -f "$COMMITTED" ]]; then
  echo "dist-guard: missing committed $COMMITTED" >&2
  echo "Regenerate: bun run build:cli && git add dist/loom.js" >&2
  exit 1
fi

if ! command -v bun >/dev/null 2>&1; then
  echo "dist-guard: bun not found on PATH" >&2
  exit 1
fi

tmp="$(mktemp)"
trap 'rm -f -- "$tmp"' EXIT

bun build packages/cli/src/index.ts --target=bun --outfile "$tmp"

if cmp -s "$COMMITTED" "$tmp"; then
  echo "dist-guard: ok"
  exit 0
fi

echo "dist-guard: drift — committed dist/loom.js differs from a fresh build" >&2
echo "Regenerate: bun run build:cli && git add dist/loom.js" >&2
exit 1
