# Loom v0.34.0 P5 smoke: `loom service` against a fake service manager

Date 2026-10-16. Repo main `fb89d75` (P5 green: reap hung read-only queries · log path under the service home · status read-only on a legacy home) plus the smoke script added in the same commit as this record. Authority: PLAN §0.34.0 P5 row + Done-when (i), `UNKNOWNS.md` 0.34.0 (UK-1 to UK-5). Reproducible harness: `bun run smoke:service` (= `scripts/smoke-service.ts`; `--source` runs `packages/cli/src/index.ts` instead of `dist/loom.js`). Wall time ~3 s.

| Item | Value |
|---|---|
| OS | macOS (Darwin 25.6.0, arm64) |
| bun | 1.3.11 |
| CLI | `dist/loom.js` from `bun run build:cli` at `fb89d75` (and `--source`, same result) |
| Live smoke | not run in 0.34.0 — **macOS live run 2026-10-17 with owner approval (v0.37.0 dist): PASS** (see "Live run" below) |
| Linux | not run (no Linux environment used; no VM) — **unverified** (live included) |

## Setup

- **One temp root** (`$TMPDIR/loom-smoke-service-XXXXXX`) holds the temp HOME (`home/`) and the spy dir (`spy/`). It is removed at exit, on failure, and on SIGINT/SIGTERM. The smoke prints `PASS zero persistence` only after checking the root is gone.
- **How the fake reaches the CLI.** The CLI child runs with `HOME=<temp home>` and `PATH=<spy dir>:<bun dir>` only. The spy dir holds `launchctl` / `systemctl` / `loginctl` shell stand-ins that exec this script in `--spy` mode, a scripted state machine kept in `spy/state.json` with every call logged in `spy/calls.jsonl`. **Before any CLI run the smoke aborts unless `Bun.which()` resolves all three names to the spy on that PATH**, so the real service manager cannot be reached. It also refuses if the temp HOME is the real home.
- **No `LOOM_TEST_HOME` in the CLI child (deviation from the P5 row wording).** Under `LOOM_TEST_HOME` the product's real runner refuses every verb (R9), so `service install` would exit 1 and nothing would be exercised. The child's home is the temp HOME instead (Bun's `os.homedir()` follows `HOME` at process start). The product files land in `<temp home>/Library/LaunchAgents` and `<temp home>/.loom`.
- **Real home guard.** `~/Library/LaunchAgents` (names · size · mtime), `~/.config/systemd` (recursive) and `~/.loom` (top-level names) of the real user (`os.userInfo().homedir`) are listed before and after; any difference fails the smoke.
- **Session/profile `smoke`:** non-loopback relay `wss://relay.example.invalid:7842/ws` with the token in the 0600 session file, bridge config `authorizedDispatchers:["p_tower"]` + headless worker. The fake service "bridge" pid is the smoke's own pid; the spy writes the `smoke.status.json` the CLI polls (`running` on bootstrap/kickstart/start, `stopped` on bootout/stop).

## Results (dist CLI and `--source`, both 6/6)

```
PASS ① install — exit 0 · unit 0644 · log 0600 · bridge dir 0700 · launchctl bootstrap gui/501 <tmp>/home/Library/LaunchAgents/com.loom.bridge.smoke.plist · running pid 91921
PASS ② re-install no-op — exit 0 · "already installed (up to date, pid 91921)" · write verbs 0 · bytes/mtime unchanged
PASS ③ status — exit 0 · installed + running pid 91921 · read verbs only (print, print-disabled)
PASS ④ doctor Service section — 6 rows · 0 fail · read verbs only · doctor exit 1 (fail only in: Relay)
PASS ⑤ no_domain → exit 3 — exit 3 · "written; loads at next login (<tmp>/home/Library/LaunchAgents/com.loom.bridge.smoke.plist)" · file kept
PASS ⑥ uninstall — exit 0 · launchctl bootout gui/501/com.loom.bridge.smoke · file removed · second uninstall "not installed" exit 0
SKIP live smoke — owner gate (needs --live AND LOOM_SERVICE_LIVE_SMOKE=1)
PASS smoke:service — 6/6 steps · live skipped
PASS zero persistence — temp root removed
PASS real home untouched — ~/Library/LaunchAgents · ~/.config/systemd · ~/.loom listings identical
```

The doctor's own exit 1 in ④ comes from the Relay section (the `.invalid` relay host cannot be reached). The Service section has no `fail` line, and the doctor exit code is unchanged by it (R12). On Linux the same script drives `systemctl --user daemon-reload → start` / `stop` and checks the wants symlink. That path has not been run.

Outside the script, `ls -la ~/Library/LaunchAgents` and `ls -la ~/.config/systemd` were identical before and after every run. `~/.config/systemd` does not exist on this machine.

## Live run (owner-approved 2026-10-17, macOS, v0.37.0 dist)

The owner approved one run; the architect ran `LOOM_SERVICE_LIVE_SMOKE=1 bun run smoke:service --live` against the v0.37.0 `dist/loom.js` on macOS. Verbatim output:

```
PASS ① install — exit 0 · unit 0644 · log 0600 · bridge dir 0700 · launchctl bootstrap gui/501 /private/var/folders/mz/z0wh5lpj1cqcghk7f8dl0k040000gn/T/loom-smoke-service-Gw0AjY/home/Library/LaunchAgents/com.loom.bridge.smoke.plist · running pid 10466
PASS ② re-install no-op — exit 0 · "already installed (up to date, pid 10466)" · write verbs 0 · bytes/mtime unchanged
PASS ③ status — exit 0 · installed + running pid 10466 · read verbs only (print-disabled, print)
PASS ④ doctor Service section — 6 rows · 0 fail · read verbs only · doctor exit 1 (fail only in: Relay)
PASS ⑤ no_domain → exit 3 — exit 3 · "written; loads at next login (/private/var/folders/mz/z0wh5lpj1cqcghk7f8dl0k040000gn/T/loom-smoke-service-Gw0AjY/home/Library/LaunchAgents/com.loom.bridge.smoke.plist)" · file kept
PASS ⑥ uninstall — exit 0 · launchctl bootout gui/501/com.loom.bridge.smoke · file removed · second uninstall "not installed" exit 0
live: bootstrap exit 0 
live: running=true pid=10583 after 217 ms
live: print-disabled entry: (none) (UK-2)
live: bootout exit 0 
live: not-found=true stopped=true after 215 ms (UK-1)
live: SSH_CONNECTION unset (UK-3)
PASS live (macOS · owner gate) — bootstrap → running pid match → bootout → stopped · scratch plist and temp home removed
PASS smoke:service — 7/7 steps · live pass
PASS zero persistence — temp root removed
PASS real home untouched — ~/Library/LaunchAgents · ~/.config/systemd · ~/.loom listings identical
```

Afterwards, `launchctl print gui/$UID/com.loom.bridge.smoke` reported the job as not loaded (clean).

- **UK-1 (macOS):** after real `bootout`, the job was not found and the status file said `stopped` 215 ms later. That is well inside the bridge's 10 s stop cap and launchd's `ExitTimeOut 20`. Signal order and SIGKILL timing were not observed directly. Not measured on systemd.
- **UK-2:** the scratch label had no `print-disabled` entry (`(none)`). Behaviour after a user turns the item off is still unmeasured.
- **UK-3:** run from a GUI session (`SSH_CONNECTION` unset). The ssh/no-GUI code is still unmeasured.
- Linux live (UK-4 · UK-5) is still **unverified**. Login/reboot auto-start and TCC (UK-6) are not covered by `--live`.

## Optional live smoke (implemented in 0.34.0; macOS run 2026-10-17 above)

`bun run smoke:service --live` with `LOOM_SERVICE_LIVE_SMOKE=1` (both are required; without them it prints `SKIP … owner gate`; on Linux it prints `unverified`). The live path:

1. Starts a loopback relay in-process.
2. Writes a temp `LOOM_TEST_HOME` (session, headless config, 0600 log).
3. Renders the plist with the product generator and splices `LOOM_TEST_HOME` into `EnvironmentVariables`. This is test-only; the generator itself never emits it (② env ban). The plist is written to a **scratch dir, never `~/Library/LaunchAgents`**.
4. Runs `/bin/launchctl bootstrap gui/$UID <scratch plist>`, then polls until `print` shows a pid that equals the status-file pid with state `running` (≤15 s).
5. Records the `print-disabled` entry (UK-2).
6. Runs `bootout`, then polls for not-found (≤25 s) and status `stopped` (UK-1 timing).
7. Records whether `SSH_CONNECTION` is set (UK-3).
8. Always runs `bootout` if the job is still loaded, then removes the scratch plist and the temp home.

The exit code after `bootout` cannot be observed (the job is gone). `stopped` in the status file (written before the bridge's exit 0) stands in for it.

**Not covered even by `--live`:** start at login/reboot (`RunAtLoad`; systemd `default.target`) — the live path never installs into `~/Library/LaunchAgents` and never logs out. That needs a real `loom service install` followed by logout/login (or reboot). macOS TCC (a LaunchAgent `bun` does not inherit the terminal's folder grants) is likewise unmeasured. Both tracked as UK-6.

## Unknowns

- **UK-1: launchd/systemd stop signal order and grace — macOS observed 2026-10-17; systemd open.** P2 simulated the stop path (SIGTERM to the bridge main pid only → exit 0 ≤10 s · worker pgid survives · next start adopts once). Live macOS run: `bootout` exit 0, then not-found + `stopped` after 215 ms. Signal order and SIGKILL timing were not observed directly. systemd stop was not measured.
- **UK-2: macOS Login Items — partly observed.** The P3 verification incident showed that **writing** a Loom plist into the real `~/Library/LaunchAgents` (no `launchctl` call) is enough for macOS to post a "Background Items Added" notification. The item appears under bun's code signer, **"Jarred Sumner"**, not under the label. Live run 2026-10-17: the scratch label had no `print-disabled` entry (`(none)`). Still not measured: the `bootstrap` / `kickstart` code and wording when the item is turned off.
- **UK-3: launchd from ssh (no GUI session) — open.** Only scripted (`Bootstrap failed: 5: Input/output error` → exit 3 in ⑤). The 2026-10-17 live run was in a GUI session (`SSH_CONNECTION` unset), so the real ssh code and wording are still unmeasured.
- **UK-4: Linux live — unverified.** No Linux environment was used. This covers `StandardError=append:`, the left-over warning after `KillMode=process`, the linger query format, and whether the hand-made wants symlink behaves like `enable`.
- **UK-5: Linux `ps -o lstart=` — unverified** (0.33.0 UK-2 carry-over). Fail-safe as before: an unreadable lstart means "live, unverified" → refused (in service mode: yield exit 0).
