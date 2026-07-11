#!/usr/bin/env bash
# Test A — install.sh cold-start on a clean Linux box.
# Validates the R20 A1 acceptance ("stranger → loom on PATH") on the exact
# untested surface: a fresh Ubuntu 24.04 with no Bun. Clones the LOCAL working
# copy (LOOM_INSTALL_REPO) so install.sh changes are testable without pushing.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
cd "$HERE"

CLEAN_IMG=loom-test-clean

pass=0
fail=0
check() {
  if [ "$1" = 0 ]; then echo "  ✅ PASS: $2"; pass=$((pass + 1))
  else echo "  ❌ FAIL: $2"; fail=$((fail + 1)); fi
}

echo "== build clean image (ubuntu:24.04 + curl git ca-certificates unzip, NO bun) =="
docker build -q -t "$CLEAN_IMG" -f Dockerfile.clean . >/dev/null

echo
echo "== A1: cold install on a normal dev box — Bun installed by the script (M-4) =="
# `cat install.sh | bash` mirrors `curl ... | bash` (stdin is the pipe → exercises M-2).
set +e
docker run --rm \
  -v "$REPO:/host-repo:ro" \
  -e LOOM_INSTALL_REPO=/host-repo \
  -e SHELL=/bin/bash \
  "$CLEAN_IMG" bash -c '
    set -e
    cat /host-repo/scripts/install.sh | bash
    # loom is a `#!/usr/bin/env bun` symlink → its bin dir must be on PATH for bun too.
    echo "--- assert: binary works with PATH set (install produced a runnable loom) ---"
    PATH="/root/.bun/bin:$PATH" loom --version | grep -q "v0.19" || { echo "version mismatch"; exit 1; }
    echo "--- assert: fresh INTERACTIVE shell finds loom (human opens a new terminal) ---"
    bash -ic "loom --version" </dev/null | grep -q "v0.19" || { echo "interactive PATH not active"; exit 1; }
    echo "--- assert: LOGIN shell finds loom (ssh / bash -l — we write ~/.profile) ---"
    bash -lc "loom --version" </dev/null | grep -q "v0.19" || { echo "login PATH not active"; exit 1; }
  '
check $? "A1 cold install (bun-from-scratch M-4) + interactive PATH activation"
set -e

echo
echo "== A2 (diagnostic): minimal box WITHOUT unzip → Bun installer expected to fail =="
if docker run --rm -v "$REPO:/host-repo:ro" -e LOOM_INSTALL_REPO=/host-repo ubuntu:24.04 bash -c '
      apt-get update -qq && apt-get install -y -qq curl git ca-certificates >/dev/null 2>&1
      cat /host-repo/scripts/install.sh | bash' >/dev/null 2>&1; then
  echo "  ⚠️  unexpected: install SUCCEEDED without unzip (bun no longer needs it?)"
else
  echo "  📌 NOTE: install fails without unzip → install.sh should check/hint unzip (prereq gap)"
fi

echo
echo "== A3 (diagnostic): truly bare ubuntu (no curl/git) → need_cmd should die fast =="
if docker run --rm -v "$REPO:/host-repo:ro" -e LOOM_INSTALL_REPO=/host-repo ubuntu:24.04 \
      bash -c 'cat /host-repo/scripts/install.sh | bash' >/dev/null 2>&1; then
  echo "  ⚠️  unexpected: install SUCCEEDED on a bare image"
else
  echo "  📌 NOTE: bare ubuntu lacks curl/git → dies at need_cmd (real A2 first-5-min friction)"
fi

echo
echo "== Test A: $pass passed, $fail failed =="
[ "$fail" = 0 ]
