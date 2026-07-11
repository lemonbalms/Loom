#!/usr/bin/env bash
# LAN network-plumbing check (ladder step 2, between Docker-vnet and real 2 machines).
# Runs the relay on the host bound to your REAL LAN IP (0.0.0.0) and has a
# container join over that real address — not Docker's internal DNS. Validates:
#   0.0.0.0 bind · host firewall · real-IP routing from an external client ·
#   a blob carrying a routable relayUrl · join + offline-handoff round-trip.
#
# Usage:
#   test/docker/run-lan-check.sh [LAN_IP] [PORT]
#     LAN_IP  default: auto-detected via `ipconfig getifaddr en0`
#     PORT    default: 7900   (kept off 7842 so an existing relay is untouched)
#
# Isolated: a temp LOOM_TEST_HOME + a distinct port → does NOT touch ~/.loom or
# any relay already listening on another port. Needs the loom-test-ready image
# (built by run-join-test.sh); builds it if missing.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"

LAN_IP="${1:-$(ipconfig getifaddr en0 2>/dev/null || true)}"
PORT="${2:-7900}"
TOKEN=LANPLUMBSECRET
READY_IMG=loom-test-ready
HOSTHOME="$(mktemp -d)"
RELAY_PID=""

if [ -z "$LAN_IP" ]; then
  echo "Could not auto-detect a LAN IP. Pass it explicitly:" >&2
  echo "  $0 <LAN_IP> [PORT]   (e.g. $0 192.168.1.42 7900)" >&2
  exit 2
fi

cleanup() {
  [ -n "$RELAY_PID" ] && kill "$RELAY_PID" 2>/dev/null || true
  docker rm -f loom-lan-peerb >/dev/null 2>&1 || true
  rm -rf "$HOSTHOME"
}
trap cleanup EXIT

cd "$REPO" || exit 1

echo "== relay on host LAN $LAN_IP:$PORT (0.0.0.0 bind, token, isolated home) =="
if ! docker image inspect "$READY_IMG" >/dev/null 2>&1; then
  echo "   (building $READY_IMG …)"
  docker build -q -t "$READY_IMG" -f "$HERE/Dockerfile.ready" "$HERE" >/dev/null
fi
LOOM_TEST_HOME="$HOSTHOME" LOOM_NO_AUTO_HOST=1 \
  bun run loom relay --host 0.0.0.0 --port "$PORT" --token "$TOKEN" >"$HOSTHOME/relay.log" 2>&1 &
RELAY_PID=$!
for _ in $(seq 1 20); do
  curl -sf "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 && break
  sleep 0.5
done

fail=0

echo "== 1) host-side reachability (proves the 0.0.0.0 bind, independent of Docker) =="
echo -n "   loopback  127.0.0.1:$PORT/health  -> "; curl -s "http://127.0.0.1:$PORT/health" || { echo "FAIL"; fail=1; }; echo
echo -n "   real LAN  $LAN_IP:$PORT/health -> "; curl -s "http://$LAN_IP:$PORT/health" || { echo "FAIL (bind or firewall)"; fail=1; }; echo

echo "== 2) create room on host; blob carries the REAL LAN relayUrl =="
LOOM_TEST_HOME="$HOSTHOME" LOOM_NO_AUTO_HOST=1 \
  bun run loom --profile alice room create --name lantest --as alice \
    --relay "ws://$LAN_IP:$PORT" --token "$TOKEN" >"$HOSTHOME/create.log" 2>&1
BLOB="$(LOOM_TEST_HOME="$HOSTHOME" bun run loom --profile alice room invite --link 2>/dev/null \
  | grep -oE 'loom://join/[A-Za-z0-9_=-]+' | head -1)"
echo "   blob: ${BLOB:0:56}…"
[ -n "$BLOB" ] || { echo "FAIL: no blob"; cat "$HOSTHOME/create.log"; exit 1; }

echo "== 3) container reaches the relay over the REAL LAN IP =="
docker run -d --name loom-lan-peerb -e LOOM_NO_AUTO_HOST=1 "$READY_IMG" sleep infinity >/dev/null
echo -n "   container curl $LAN_IP:$PORT/health -> "
docker exec loom-lan-peerb bash -lc "curl -s http://$LAN_IP:$PORT/health" \
  || { echo "FAIL (container cannot route to host LAN IP)"; fail=1; }
echo

echo "== 4) container joins via the blob (real-network join) =="
docker exec loom-lan-peerb bash -lc "loom --profile bob room join '$BLOB' --as bob" 2>&1 | tail -5

echo "== 5) host hands off to bob → container reads it back over the LAN =="
LOOM_TEST_HOME="$HOSTHOME" LOOM_NO_AUTO_HOST=1 \
  bun run loom --profile alice handoff @bob "lan plumbing works" >"$HOSTHOME/handoff.log" 2>&1
sleep 2
OUT="$(docker exec loom-lan-peerb bash -lc "loom --profile bob inbox" 2>&1 || true)"
echo "----- bob inbox -----"; echo "$OUT" | grep -vE "cannot set terminal|no job control"; echo "---------------------"

echo
if [ "$fail" = 0 ] && echo "$OUT" | grep -qF "lan plumbing works"; then
  echo "✅ PASS: relay on real LAN IP — bind, container join, and handoff round-trip all over real network"
else
  echo "❌ FAIL: see logs above; relay.log tail:"; tail -5 "$HOSTHOME/relay.log"
  exit 1
fi
