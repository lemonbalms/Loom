#!/usr/bin/env bash
# Install git hooks for this repo (pre-push: dist/loom.js drift guard).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

HOOKS_DIR=".git/hooks"
if [[ ! -d "$HOOKS_DIR" ]]; then
  echo "install-hooks: no .git/hooks directory (not a git checkout?)" >&2
  exit 1
fi

PRE_PUSH="$HOOKS_DIR/pre-push"
if [[ -f "$PRE_PUSH" ]]; then
  cp "$PRE_PUSH" "${PRE_PUSH}.bak"
  echo "install-hooks: backed up existing pre-push → ${PRE_PUSH}.bak"
fi

cat >"$PRE_PUSH" <<'EOF'
#!/usr/bin/env bash
# pre-push: reject push when committed dist/loom.js drifts from a fresh build.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

if ! command -v bun >/dev/null 2>&1; then
  echo "pre-push: bun not found on PATH; cannot run check:dist" >&2
  exit 1
fi

bun run check:dist
EOF

chmod +x "$PRE_PUSH"
echo "install-hooks: installed $PRE_PUSH (runs bun run check:dist)"
