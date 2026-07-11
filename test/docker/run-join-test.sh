#!/usr/bin/env bash
# Test B — 2-container join + offline handoff across a Docker network.
# The truest single-host stand-in for the strategic "2 machines" dry-run:
#   relay (0.0.0.0 + token, durable) → peerA creates room + portable blob →
#   peerB COLD-installs via install.sh then one-command joins the blob →
#   peerA hands off to OFFLINE bob → bob returns and reads it from the inbox.
# Exercises: install→join stranger journey, self-contained invite (0.18.0),
# non-loopback relay + token transport (R19 M-2), durable offline handoff (0.14).
#
# NOT a substitute for real people on real machines (LOOM_PURPOSE_REVIEW): same
# human, same host. This is transport/onboarding QA, not demand validation.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
cd "$HERE"

READY_IMG=loom-test-ready
CLEAN_IMG=loom-test-clean
NET=loom-test-net
TOKEN=TESTSECRET
MSG="the british are coming"
SHARED="$(mktemp -d)"

cleanup() {
  docker rm -f loom-relay loom-peera loom-peerb >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  rm -rf "$SHARED"
}
trap cleanup EXIT

echo "== build images (clean = peerB cold install · ready = relay/peerA) =="
docker build -q -t "$CLEAN_IMG" -f Dockerfile.clean . >/dev/null
docker build -q -t "$READY_IMG" -f Dockerfile.ready . >/dev/null
docker network create "$NET" >/dev/null 2>&1 || true

echo
echo "== 1) relay: bind 0.0.0.0:7842, token required (H-5), durable inbox =="
docker run -d --name loom-relay --network "$NET" "$READY_IMG" \
  loom relay --host 0.0.0.0 --port 7842 --token "$TOKEN" >/dev/null
for _ in $(seq 1 30); do
  docker exec loom-relay bash -lc "curl -sf localhost:7842/health" >/dev/null 2>&1 && break
  sleep 1
done
echo -n "  health: "; docker exec loom-relay bash -lc "curl -s localhost:7842/health"; echo

echo
echo "== 2) peerA: create room + portable invite blob (relayUrl=ws://loom-relay:7842) =="
docker run -d --name loom-peera --network "$NET" -v "$SHARED:/shared" \
  -e LOOM_NO_AUTO_HOST=1 "$READY_IMG" sleep infinity >/dev/null
docker exec loom-peera bash -lc "
  loom --profile alice room create --name dryrun --as alice --relay ws://loom-relay:7842 --token $TOKEN
  loom --profile alice room invite --link | grep -oE 'loom://join/[A-Za-z0-9_=-]+' | head -1 > /shared/blob.txt
"
BLOB="$(cat "$SHARED/blob.txt")"
echo "  blob: ${BLOB:0:48}…"
[ -n "$BLOB" ] || { echo "❌ FAIL: no invite blob produced"; exit 1; }

echo
echo "== 3) peerB: COLD install via install.sh, then ONE-command join (blob carries relay) =="
docker run -d --name loom-peerb --network "$NET" -v "$SHARED:/shared" -v "$REPO:/host-repo:ro" \
  -e LOOM_NO_AUTO_HOST=1 -e LOOM_INSTALL_REPO=/host-repo -e SHELL=/bin/bash \
  "$CLEAN_IMG" sleep infinity >/dev/null
docker exec loom-peerb bash -c "cat /host-repo/scripts/install.sh | bash" >/dev/null
# interactive shell = the 'open a new terminal' path a stranger actually uses
docker exec loom-peerb bash -ic "loom --profile bob room join '$BLOB' --as bob" </dev/null
echo "  bob joined; bob's client exited → now OFFLINE"

echo
echo "== 4) peerA: hand off to OFFLINE bob → durable relay inbox =="
docker exec loom-peera bash -lc "loom --profile alice handoff @bob \"$MSG\""

echo
echo "== 5) peerB: bob comes back online, reads the inbox =="
sleep 2
OUT="$(docker exec loom-peerb bash -ic "loom --profile bob inbox" </dev/null 2>&1 || true)"
echo "----- bob inbox -----"; echo "$OUT"; echo "---------------------"

echo
if echo "$OUT" | grep -qF "$MSG"; then
  echo "✅ PASS: offline handoff delivered across containers via self-contained invite blob"
else
  echo "❌ FAIL: '$MSG' not found in bob's inbox"
  exit 1
fi
