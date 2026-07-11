#!/usr/bin/env bash
# Run both Docker dry-run tests: A (install cold-start) then B (2-container join).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "############ Test A — install.sh cold-start ############"
bash "$HERE/run-install-test.sh"

echo
echo "############ Test B — 2-container join + offline handoff ############"
bash "$HERE/run-join-test.sh"

echo
echo "All Docker dry-run tests passed."
