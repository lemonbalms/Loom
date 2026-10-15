# Loom v0.33.0 P5 smoke: bridge lifecycle on real spawned bridges

Date 2026-10-16. Repo main `38933f1` (P5 green: unreadable status file + headless herdr line) plus the smoke script added in the same commit as this record. Authority: PLAN §0.33.0 P5 row + Done-when (i), `UNKNOWNS.md` 0.33.0 (UK-1, UK-2, UK-3). Reproducible harness: `bun run smoke:bridge-lifecycle` (= `scripts/smoke-bridge-lifecycle.ts`). Wall time ~23 s (step ④ waits for the heartbeat to age past 15 s).

| Item | Value |
|---|---|
| OS | macOS (Darwin 25.6.0, arm64) |
| bun | 1.3.11 |
| Linux | not run (no Linux environment used; no VM) |

## Setup

- **Isolated Loom state:** `LOOM_TEST_HOME=$TMPDIR/loom-smoke-lifecycle-XXXXXX` is set before any Loom module loads, and the script refuses to run unless `loomDir()` is under it. The temp home is removed at exit, on failure, and on SIGINT/SIGTERM. The real `~/.loom` is never touched.
- **Loopback relay** started in-process (`RelayServer` on `127.0.0.1:<random>`). The "tower" peer (`p_tower`) creates the room. The node session file has no token.
- **Bridge profile `smoke`:** `worker.backend:"headless"`, `herdrSocketPath` points at a path that does not exist (D6: a headless bridge needs no herdr), `authorizedDispatchers:["p_tower"]`, agent `claude` = a wrapper around the repo fake agent CLI (`packages/host/src/fake-agent-cli.ts`, same as the P2–P4 tests).
- **Spawn paths:** each bridge runs the product spawn command (`bun run packages/host/src/bridge-main.ts` with `LOOM_SESSION`/`LOOM_PROFILE`, as `startBridgeProcess` does), so the script can see exit codes. Step ② also goes through the CLI (`loom bridge start|stop`); step ③ uses `loom bridge drain`; step ④ uses `loom doctor`.

## Results (three consecutive runs, all 4/4)

```
PASS ① SIGTERM stop — exit 0 in 6 ms · status stopped · meta cleared · lock released
PASS ② double start refused — second exit 1 — "bridge already running for profile smoke (pid 44139, started 2026-10-15T22:52:06.306Z) — lock …/.loom/bridge/smoke.lock" · holder log intact · CLI stop clean
PASS ③ drain — card result delivered ×1 · drain 4145 ms · exit 0 · status stopped
PASS ④ SIGKILL / reclaim — heartbeat frozen 17s · doctor "bridge died without clean stop — stale status (pid 44291 dead, last state running, last heartbeat 17s ago)" · restart reclaimed pid 44291 → running → SIGTERM exit 0
note UK-1: SIGTERM → exit 0 in 6 ms (bun 1.3.11)
note UK-2: darwin ps -o lstart= → "Thu Oct 15 22:52:06 2026" · owner.json lstart → "Thu Oct 15 22:52:06 2026"
PASS smoke:bridge-lifecycle — 4/4 steps
```

What each step checks:

1. **SIGTERM.** Bridge reaches `running`, gets SIGTERM, `stopping`/`stopped` is observed, the process exits 0 within 12 s. The final status is `stopped` with the same pid, and both the meta file and the lock dir are gone.
2. **Double start.** The holder is started with `loom bridge start` (the output shows `herdr: skipped (headless)`). A second `bridge-main.ts` exits 1, and its stderr names the holder pid. The holder stays alive. A second `loom bridge start` reports `already running (pid <holder>` and does not truncate the holder's `<profile>.stderr.log` (the new content starts with the earlier content). `loom bridge stop` then stops it cleanly.
3. **Drain.** One headless card (fake CLI, 4 s) is running. `loom bridge drain --timeout 60` exits 0 with `bridge drained and stopped (pid …)`, the bridge exits 0, exactly one `card.result` reaches the tower inbox, and the status is `stopped`.
4. **SIGKILL.** After SIGKILL, `heartbeatAt` does not move for more than 15 s and the state stays `running`. `loom doctor` prints `warn bridge died without clean stop …` and `lock holder: pid <dead> stale`, with no bridge `fail` line. A restart logs `reclaimed stale lock pid=<dead>`, reaches `running`, and SIGTERM gives exit 0 and a clean stop.

## Unknowns

- **UK-1 — resolved (unchanged from P2, re-measured here).** `process.on("SIGTERM")` fires in the bridge event loop under bun 1.3.11. SIGTERM → exit 0 in 6–7 ms with no work in flight, stable in 3 runs (P2 measured 18 ms).
- **UK-2 — macOS resolved · Linux format unverified (no Linux env used).** On macOS, `LC_ALL=C LANG=C TZ=UTC /bin/ps -o lstart= -p <pid>` prints `Thu Oct 15 22:52:06 2026`. That is byte-identical to the `lstart` the lock wrote in `owner.json`, and pid-reuse detection (stale reclaim) matched it in step ④. Linux (procps `ps` or `/proc/<pid>/stat` field 22) was not measured. If `ps` output there cannot be parsed, a live holder is read as "unverified" and refused, not reclaimed (fail-safe), and the operator removes the lock dir by hand as the refusal message says.
- **UK-3 — resolved by decision: keep the 600 s default (no code change).** Grok headless cards were measured at ~9 min (PLAN.md:601). They fit under 600 s only when the drain starts near the card's start. Operators running grok cards should pass `loom bridge drain --timeout 1200`. Accepted-loss class: cards cut at the deadline. The drain does not wait for them and still exits 0. Their worker survives, and the next start adopts it (P3 timeout path), so their result waits for a restart.
