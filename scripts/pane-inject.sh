#!/usr/bin/env bash
# Atomic manual pane inject (COMPETITIVE_NOTES §1.3 A / lessons (2)).
# read-guard → literal inject → landing verify → bare CR → wait working.
#
# Usage: scripts/pane-inject.sh <target> <text-file>
#   <target>    herdr agent target (terminal id · agent name · pane id)
#   <text-file> prompt text to inject (literal; no CR in this step)
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
usage: scripts/pane-inject.sh <target> <text-file>
  <target>    herdr agent target (terminal id, agent name, or pane id)
  <text-file> prompt text file to inject (literal, no CR)

Atomic steps (fixed order):
  1. read-guard  — abort if composer already has text (exit 2)
  2. inject      — herdr agent send <target> <file contents>
  3. verify      — re-read; ws-normalized tail-48 or [Pasted text] (exit 3)
  4. submit      — herdr agent send <target> $'\r'  (real CR; not pane send-keys Enter)
  5. wait        — herdr agent wait --status working --timeout 15000 (exit 4)
EOF
  exit 64
}

if [[ $# -lt 2 ]]; then
  usage
fi

TARGET=$1
TEXT_FILE=$2

if [[ ! -f "$TEXT_FILE" ]]; then
  echo "pane-inject: text file not found: ${TEXT_FILE}" >&2
  usage
fi

# Remove all whitespace (TUI wrap-tolerant probe matching; same idea as bridge normalizeForProbe).
ws_normalize() {
  printf '%s' "$1" | tr -d '[:space:]'
}

# True (exit 0) if a composer box line (│ … ❯ …) has non-whitespace after ❯.
# Trailing box verticals are ignored so an empty "│ ❯ … │" row is clean.
composer_has_text() {
  local scrape=$1
  local line after compact
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "$line" == *"│"* && "$line" == *"❯"* ]]; then
      after="${line#*❯}"
      # Drop whitespace + vertical box drawing; residual = typed content.
      compact="$(printf '%s' "$after" | tr -d '[:space:]│┃')"
      if [[ -n "$compact" ]]; then
        return 0
      fi
    fi
  done <<<"$scrape"
  return 1
}

# herdr agent read returns a JSON envelope; feed only .result.read.text to probes.
# Raw JSON has escaped "│ … ❯ …" on one line → composer_has_text false-positive (empty composer).
read_pane_text() {
  local target=$1
  local raw
  raw="$(herdr agent read "$target" --source recent --lines 30)"
  # jq: extract pane text; missing key → empty string (not null literal).
  printf '%s' "$raw" | jq -r '.result.read.text // empty'
}

TEXT="$(<"$TEXT_FILE")"
NORM_TEXT="$(ws_normalize "$TEXT")"
if ((${#NORM_TEXT} > 48)); then
  PROBE_TAIL="${NORM_TEXT: -48}"
else
  PROBE_TAIL="$NORM_TEXT"
fi
PLACEHOLDER_N="$(ws_normalize "[Pasted text")"

# ─── 1. read-guard ──────────────────────────────────────────────────────────
echo "pane-inject: [1/5] read-guard (${TARGET})" >&2
SCRAPE="$(read_pane_text "$TARGET")"
if composer_has_text "$SCRAPE"; then
  echo "pane-inject: abort — composer already has text (double-append risk)." >&2
  echo "pane-inject: clear the composer or wait for idle, then retry." >&2
  exit 2
fi

# ─── 2. literal inject (no CR) ──────────────────────────────────────────────
echo "pane-inject: [2/5] inject literal" >&2
herdr agent send "$TARGET" "$TEXT"

# ─── 3. landing verification ────────────────────────────────────────────────
# TUI may not have painted the inject yet (bridge SETTLE_MS=250ms precedent).
# Retry up to 3 times with 0.3s settle before each read (including the first).
echo "pane-inject: [3/5] verify landing" >&2
landed=0
for _ in 1 2 3; do
  sleep 0.3
  SCRAPE2="$(read_pane_text "$TARGET")"
  NORM_SCRAPE="$(ws_normalize "$SCRAPE2")"
  if [[ "$NORM_SCRAPE" == *"$PLACEHOLDER_N"* ]]; then
    landed=1 # paste placeholder (wrap-tolerant via ws-normalize)
    break
  elif [[ -n "$PROBE_TAIL" && "$NORM_SCRAPE" == *"$PROBE_TAIL"* ]]; then
    landed=1 # file tail-48 present in pane
    break
  fi
done
if [[ "$landed" -eq 0 ]]; then
  echo "pane-inject: abort — inject not visible in pane (landing miss)." >&2
  echo "pane-inject: no automatic retry — diagnose manually (wrong target? TUI race?)." >&2
  exit 3
fi

# ─── 4. bare CR submit (real CR; not pane send-keys Enter) ──────────────────
echo "pane-inject: [4/5] submit CR" >&2
herdr agent send "$TARGET" $'\r'

# ─── 5. wait for working ────────────────────────────────────────────────────
echo "pane-inject: [5/5] wait working" >&2
if ! herdr agent wait "$TARGET" --status working --timeout 15000; then
  echo "pane-inject: abort — status did not reach working within 15s." >&2
  echo "pane-inject: hint — codex TUI may consume the first CR via a 'Create a plan?' overlay;" >&2
  printf "pane-inject:         send another CR: herdr agent send %s \$'\\r'\n" "$TARGET" >&2
  exit 4
fi

echo "pane-inject: ok — ${TARGET} working" >&2
