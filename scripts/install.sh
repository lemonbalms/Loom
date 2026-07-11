#!/usr/bin/env bash
# Loom — 5-minute install path (Tier A1, PLAN 0.19.0 / R20 approved).
#
# One-liner (trusted cohort; pins to the same ref this raw URL is fetched from — L-2):
#   curl -fsSL https://raw.githubusercontent.com/lemonbalms/Loom/main/scripts/install.sh | bash
#
# Overrides:
#   LOOM_INSTALL_DIR   checkout dir           (default: ~/.loom-src)
#   LOOM_INSTALL_REF   branch/tag/SHA to use  (default: main)
#
# What it does: ensure Bun → clone/update the repo → bun install → bun link →
# verify `loom` via absolute path → idempotently add Bun's bin dir to your shell
# rc. It does NOT sudo, and touches only your home dir + shell rc.
#
# R20 binding locks honored:
#   M-1  bin dir resolved via `bun pm bin -g` (BUN_INSTALL fallback) — same value
#        used for both the verify and the rc append; never hardcodes ~/.bun/bin.
#   M-2  never `exec $SHELL` as the last step — under `curl | bash` stdin is the
#        pipe, so an exec'd shell reads EOF and exits instantly. We print the
#        activation instruction instead.
#   M-4  after installing Bun mid-script, export PATH so `bun install`/`bun link`
#        resolve on the script's own PATH.
set -euo pipefail

say() { printf '\033[1m[loom]\033[0m %s\n' "$*"; }
die() { printf '\033[31m[loom] error:\033[0m %s\n' "$*" >&2; exit 1; }
need_cmd() { command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"; }

# Idempotently add $1 (bin dir) to the login shell's rc. Marker guards re-runs.
ensure_path() {
  local bindir="$1"
  local marker="# loom installer (PATH)"
  local login_sh
  login_sh="$(basename "${SHELL:-sh}")"

  _append() { # $1=rc file  $2=line to add
    local rc="$1" line="$2"
    [ -e "$rc" ] || : >"$rc" # create for a fresh account so activation persists
    if grep -qF "$marker" "$rc" 2>/dev/null; then
      say "PATH already configured in $rc"
    else
      { printf '\n%s\n' "$marker"; printf '%s\n' "$line"; } >>"$rc"
      say "PATH added to $rc"
    fi
  }

  case "$login_sh" in
    fish) # L-4: fish uses its own PATH mechanism
      mkdir -p "$HOME/.config/fish"
      _append "$HOME/.config/fish/config.fish" "fish_add_path $bindir"
      ;;
    zsh)
      _append "$HOME/.zshrc" "export PATH=\"$bindir:\$PATH\""
      ;;
    bash)
      _append "$HOME/.bashrc" "export PATH=\"$bindir:\$PATH\""
      [ -e "$HOME/.bash_profile" ] && _append "$HOME/.bash_profile" "export PATH=\"$bindir:\$PATH\""
      ;;
    *) # unknown shell: cover the common rc files that already exist
      local any=0
      for rc in "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.profile"; do
        [ -e "$rc" ] && { _append "$rc" "export PATH=\"$bindir:\$PATH\""; any=1; }
      done
      [ "$any" = 1 ] || _append "$HOME/.profile" "export PATH=\"$bindir:\$PATH\""
      ;;
  esac
}

main() {
  local REPO_URL="https://github.com/lemonbalms/Loom.git"
  local INSTALL_DIR="${LOOM_INSTALL_DIR:-$HOME/.loom-src}"
  local REF="${LOOM_INSTALL_REF:-main}"

  say "Loom installer — 5-minute path"
  need_cmd curl
  need_cmd git

  # 1) Bun — install if missing, then put it on THIS script's PATH (M-4)
  if ! command -v bun >/dev/null 2>&1; then
    say "Bun not found — installing from https://bun.sh (official installer) …"
    curl -fsSL https://bun.sh/install | bash
    export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
    export PATH="$BUN_INSTALL/bin:$PATH"
  fi
  command -v bun >/dev/null 2>&1 || die "bun still not on PATH after install — open a new terminal and re-run"
  say "Using bun $(bun --version)"

  # 2) Clone or update the repo at REF (L-2: same ref as the fetched raw URL)
  if [ -d "$INSTALL_DIR/.git" ]; then
    say "Updating existing checkout at $INSTALL_DIR …"
    git -C "$INSTALL_DIR" fetch --depth 1 origin "$REF"
    git -C "$INSTALL_DIR" checkout -q "$REF" 2>/dev/null || true
    git -C "$INSTALL_DIR" reset --hard FETCH_HEAD
  elif [ -e "$INSTALL_DIR" ]; then
    die "$INSTALL_DIR exists but is not a Loom checkout — set LOOM_INSTALL_DIR to a free path"
  else
    say "Cloning $REPO_URL ($REF) → $INSTALL_DIR …"
    if ! git clone --depth 1 --branch "$REF" "$REPO_URL" "$INSTALL_DIR" 2>/dev/null; then
      # --branch rejects a bare SHA; fall back to a full clone + checkout
      git clone "$REPO_URL" "$INSTALL_DIR"
      git -C "$INSTALL_DIR" checkout -q "$REF"
    fi
  fi

  # 3) Dependencies + link `loom`
  say "Installing dependencies (bun install) …"
  (cd "$INSTALL_DIR" && bun install)
  say "Linking loom (bun link) …"
  (cd "$INSTALL_DIR/packages/cli" && bun link)

  # 4) Resolve Bun's global bin dir once — used for BOTH verify and rc append (M-1)
  local BIN_DIR
  BIN_DIR="$(bun pm bin -g 2>/dev/null || true)"
  [ -n "$BIN_DIR" ] || BIN_DIR="${BUN_INSTALL:-$HOME/.bun}/bin"

  # 5) Verify via absolute path (deciding-risk mitigation — do not rely on PATH yet)
  if [ -x "$BIN_DIR/loom" ]; then
    say "Verified: loom $("$BIN_DIR/loom" --version) at $BIN_DIR/loom"
  else
    die "loom not found at $BIN_DIR/loom after link — try: cd $INSTALL_DIR/packages/cli && bun link"
  fi

  # 6) Persist PATH idempotently (M-1 same BIN_DIR)
  ensure_path "$BIN_DIR"

  # 7) Done. M-2: DO NOT exec $SHELL here — print the activation step instead.
  cat <<EOF

✅ Loom installed.
   Checkout: $INSTALL_DIR
   Binary:   $BIN_DIR/loom

Activate this shell (pick one), then join a room:
   exec \$SHELL                 # reload current shell
   # or open a new terminal / source your shell rc

   loom room join <blob>        # paste the loom://join/... invite you were given
EOF
}

main "$@"
