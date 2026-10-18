# HANDOFF — Loom

**Updated:** 2026-10-18
**Workspace:** `/Users/kyoungsiklee/projects/loom`

## One-line resume

> v0.45.1 PATCH **shipped** 2026-10-18 · **next = MBP relay (owner yes per step) / owner pick**

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | **v0.45.1 shipped** 2026-10-18 (R66 · no real-CLI) | `docs/PLAN.md` |
| Dogfood | unblocked (p17 · 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | **P3 soft close** · JIT 3.0–3.2 only | `PHASE3-SOFT-CLOSE.md` |
| Dev env | claude-mem 13.12.4 B-4 + autoUpdate off | `check:mem-header` |

## Current action

### v0.45.1 shipped · next = MBP relay (owner yes per step) / owner pick

**Goal:** v0.45.1 PATCH shipped — `verify` fails closed on a symlinked/non-dir `<2 hex>/` prefix (D1) · pack hashes worker files as raw bytes (D2 — class 89 closed).
Evidence at `f26f107`: suite 4284/0 · typecheck · biome · dist · Astra 0190/0192/0196 PASS · advise 0195 ship · no real-CLI.

**Next:** MBP 2015 relay (Owner pending — owner yes per live step) or owner picks the next product step.

**Carry:** `memorySnapshotLocked` byteLength hygiene · `history-scan.ts:365` comment · 0.43 UK-1 · UK-6/UK-7 · Linux/Windows live unverified · `pane-cleanup.test.ts` ⑥ flaky

**Line:** topology **`full`** · execution **`delegated`** · verify **`independent`** · chain Claude→Opus 5.5 medium impl (`lane.ts impl`)→GPT-6 Astra high verify (`lane.ts verify`) + loom-advisor Opus 5.5 high (promoted from `single` 2026-10-15 — `DOGFOOD_LOOP.md` §0.5.3)

**Done when (this handoff):** owner picks the next step (MBP relay or product).

**Must not:** run any further live launchd/systemd registration or real-CLI smoke (e.g. `smoke:policy --real-cli` · `smoke:memory-write --real-cli`) without explicit owner yes · test/probe without temp HOME + `LOOM_TEST_HOME` · start next-step code before owner pick + review · inherit bridge env into workers (R48-H1) · sync lock on WS receive path (R47-H1) · demote to `single` without owner · remeasure 3.3–3.4b · default-on JIT.

## Active checks

| Check | Status | Impact | Evidence |
|---|---|---|---|
| Headless lanes | **P1–P4 done** · live smoke 7/7 | dev-process | `HEADLESS-LANES-DESIGN.md` |
| Suite | **0 fail** (4284/0 at 0.45.1 ship) | `pane-cleanup` ⑥ flaky under load | 0.45.1 ship |
| v0.45.1 | **shipped** 2026-10-18 · no real-CLI (D3) | PATCH: verify prefix fail closed + pack raw-byte sha | `docs/PLAN.md` §0.45.1 |
| v0.45.0 | **shipped** 2026-10-18 · no real-CLI (D9) | artifact CAS store first slice | `docs/PLAN.md` §0.45.0 |
| v0.32–0.44.1 | **shipped** | 0.34 live (macOS) · 0.36–0.39 · 0.43 real-CLI PASS | `docs/PLAN.md` |
| P3 soft close | **closed** · 3.0–3.2 opt-in · 3.3–3.4b false | freeze new surfaces | `PHASE3-SOFT-CLOSE.md` |
| `smoke:uc` · B-4 pin | **OK** | prior | check:mem-header |
| B-7 upstream | deferred optional | ecosystem | PRIORITIES P2c |

## Owner pending

| Decision | Why | Safe default | Evidence |
|---|---|---|---|
| MBP 2015 always-on relay (`mbp2015-bot`, **Linux** — not macOS) | order matters: (a) read-only check (done — facts at end) → stop the Windows relay → copy `~/.loom/relay-state` once over Tailscale scp (plaintext peer secrets: 0600 · skip the lock/pid file · clean the lg99 original after) → only then start the relay as a systemd **system** unit (dedicated user · `Restart=always` · `LOOM_RELAY_STATE_DIR` · `systemctl enable --now` — owner yes, live systemd rule) · logind `HandleLidSwitch=ignore` + mask sleep/suspend/hibernate targets (power-loss auto-boot = firmware, unverified) → switch clients' `LOOM_RELAY_URL` and restart them (a client that joins a stateless relay first stops for good on `room_not_found`) · check logs for 0 `Reconnect stopped` · measured 2026-10-18 20:02 KST: Debian 13 trixie x86_64 · systemd 257 · bun **not installed** (install = owner-yes step) · passwordless sudo · logind lid switch default = suspend · ssh `zerocode@100.119.218.93` with `-o IdentitiesOnly=yes -i ~/.ssh/id_ed25519_mbp2015` | Windows relay stays | 0.44.1 ship |
| P3 reopen / default-on | risk | **off** · new SPEC only | SOFT-CLOSE |
| B-7 issue/PR | optional | defer | platform lessons |

## Blockers

(none)

## Invariants

- Nine headings; D1 ≤8192B; no `<details>`; traps only in `tasks/traps.md`.
- Topology `full` (promoted 2026-10-15); demote = owner only.
- HARD_CAP 9500; owner brief = `bun run status` only.
- PREREG seal before canary; sealed F1*/3.0–3.4b **immutable**.
- Phase 3 soft: live **3.0–3.2 only** · default-on **no**.
- Bash deny **before** JIT; JIT never exit 2; JIT unset=**off**.
- Sticky owns presence → listen must not `leave` if host live.
- claude-mem header: date-only; **autoUpdate off** or re-run B-4 after upgrade.

## Evidence

- Session ritual: `docs/SESSION-START.md` · topology `docs/spikes/SINGLE-TOPOLOGY-EXECUTION-DESIGN.md`  
- Close: `docs/spikes/RULE-ROUTER-PHASE3-SOFT-CLOSE.md`  
- 0.37.0 smoke: `docs/spikes/POLICY-HONESTY-SMOKE-0370.md`  
- 0.45.0 / 0.45.1 deviations: `implementation-notes.md` §0.45.0 · §0.45.1  
- 3.4b/3.4/3.3 RESULT · `scripts/rule-router-jit.ts`  

## Don't redo

- 3.3–3.4b remeasure / COMPLY soften / live without T1(a).  
- default-on JIT · silent product MINOR (owner picks each step).  
- B-4 as B-7 closed · UC-3 leave while sticky live.  
- 0.37.0 real-CLI ① (PASS 2026-10-17) · 0.38.0 real-CLI ① (PASS 2026-10-18) · 0.39.0 real-CLI (PASS 2026-10-18) · 0.43.0 real-CLI (PASS 2026-10-18).  
- 0.36.0 real-CLI smoke (PASS 2026-10-17).  
- 0.34.0 live launchd smoke (PASS 2026-10-17, macOS).
- 0.45.0 shipped (no real-CLI, D9) · 0.45.1 shipped (no real-CLI).
