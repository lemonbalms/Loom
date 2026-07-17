#!/usr/bin/env bash
# Step 0 — run INSIDE WSL Ubuntu (or any Linux on the Windows machine).
# Goal: reach a Loom relay bound on the Windows host (or Tailscale peer).
#
# Usage:
#   export LOOM_RELAY_PORT=7842
#   export LOOM_RELAY_TOKEN='...'          # if testing authenticated endpoints later
#   export WIN_HOST_CANDIDATES='127.0.0.1 172.x.x.x 100.65.103.113'
#   bash step0-wsl.sh
#
# Or one-liner from Windows PowerShell:
#   wsl -e bash -lc 'curl -fsSL https://raw.githubusercontent.com/lemonbalms/Loom/main/docs/spikes/scripts/step0-wsl.sh | bash'

set -euo pipefail

PORT="${LOOM_RELAY_PORT:-7842}"
TOKEN="${LOOM_RELAY_TOKEN:-}"
# Known Windows Tailscale IP from Mac discovery (2026-07-17) — override if different
WIN_TS_IP="${WIN_TS_IP:-100.65.103.113}"
MAC_TS_IP="${MAC_TS_IP:-100.69.230.114}"

echo "=== Step 0 WSL probe ==="
echo "date: $(date -Is 2>/dev/null || date)"
echo "uname: $(uname -a)"
echo "hostname: $(hostname)"
echo "PORT=$PORT"

echo "--- default route ---"
ip route show default 2>/dev/null || true
GW="$(ip route show default 2>/dev/null | awk '/default/{print $3; exit}' || true)"
echo "gateway: ${GW:-none}"

echo "--- addresses ---"
ip -4 addr show 2>/dev/null | sed -n 's/.*inet //p' || true

probe() {
  local url="$1"
  local code body
  body="$(curl -m 5 -sS -w '\n%{http_code}' "$url" 2>&1)" || {
    echo "FAIL  $url  ($body)"
    return 1
  }
  code="$(echo "$body" | tail -n1)"
  body="$(echo "$body" | sed '$d')"
  echo "OK    $url  http=$code  body=$body"
  return 0
}

echo "--- health probes ---"
CANDIDATES=("127.0.0.1")
[[ -n "${GW:-}" ]] && CANDIDATES+=("$GW")
CANDIDATES+=("$WIN_TS_IP" "$MAC_TS_IP")
# de-dupe
declare -A SEEN=()
OK_ANY=0
for host in "${CANDIDATES[@]}"; do
  [[ -z "$host" || -n "${SEEN[$host]:-}" ]] && continue
  SEEN[$host]=1
  if probe "http://${host}:${PORT}/health"; then
    OK_ANY=1
  fi
done

echo "--- optional: which loom/herdr ---"
command -v loom 2>/dev/null || echo "loom: not found"
command -v herdr 2>/dev/null || echo "herdr: not found"
command -v bun 2>/dev/null || echo "bun: not found"

echo "--- verdict ---"
if [[ "$OK_ANY" -eq 1 ]]; then
  echo "VERDICT: go-partial — at least one health endpoint reachable from WSL"
else
  echo "VERDICT: no-go-yet — no health endpoint reached"
  echo "next:"
  echo "  1) On Windows host start: loom relay --host 0.0.0.0 --port $PORT --token <token>"
  echo "  2) Or enable mirrored networking in %UserProfile%\\.wslconfig then wsl --shutdown"
  echo "  3) Windows firewall allow inbound TCP $PORT"
fi

echo "TOKEN_SET=$([[ -n "$TOKEN" ]] && echo yes || echo no)"
echo "=== end ==="
