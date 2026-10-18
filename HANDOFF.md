# HANDOFF — Loom

**Updated:** 2026-10-18
**Workspace:** `/Users/kyoungsiklee/projects/loom`

## One-line resume

> v0.44.1 **shipped** · relay reconnect never gives up · **next = MBP 2015 relay setup (owner) + 0.45.0 rebase**

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | **v0.44.1 shipped** 2026-10-18 · next = MBP relay + 0.45.0 | `docs/PLAN.md` §0.44.1 |
| Dogfood | unblocked (p17 · 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | **P3 soft close** · JIT 3.0–3.2 only | `PHASE3-SOFT-CLOSE.md` |
| Dev env | claude-mem 13.12.4 B-4 + autoUpdate off | `check:mem-header` |

## Current action

### v0.44.1 shipped · next = MBP 2015 relay setup (owner) + 0.45.0 rebase/continue

**Goal:** move the always-on relay from the Windows box to the MBP 2015 — 0.44.1 clients survive relay restarts and long outages; a URL change still needs each client restarted.
0.44.1 shipped from worktree `patch-0.44.1` (origin/main `c65a20b` base) · 0.45.0 artifact store is in progress on local main.

**Steps:**
1. Owner-run checks on the MBP: `bun --version` works on its macOS (Intel, ≤12) · Tailscale up
2. **Order matters** (a client that reaches a stateless MBP relay stops for good on `room_not_found`): stop the Windows relay → copy `~/.loom/relay-state` to the MBP → only then start the MBP relay as a LaunchDaemon (owner yes — live launchd rule) · `pmset` no-sleep/autorestart
3. Switch clients' `LOOM_RELAY_URL` to the MBP and restart them · check each log has 0 `Reconnect stopped`
4. Local main 0.45.0 rebases on 0.44.1, then continues its gate

**Line:** topology **`full`** · execution **`delegated`** · verify **`independent`** · chain Claude→Opus 5.5 medium impl (`lane.ts impl`)→GPT-6 Astra high verify (`lane.ts verify`) + loom-advisor Opus 5.5 high (promoted from `single` 2026-10-15 — `DOGFOOD_LOOP.md` §0.5.3)

**Done when (this handoff):** relay runs on the MBP with durable state moved · clients reconnect via the new URL · 0.45.0 rebased.

**Must not:** run any further live launchd/systemd registration or real-CLI smoke (e.g. `smoke:policy --real-cli` · `smoke:memory-write --real-cli`) without explicit owner yes · test/probe without temp HOME + `LOOM_TEST_HOME` · start next-step code before owner pick + review · inherit bridge env into workers (R48-H1) · sync lock on WS receive path (R47-H1) · demote to `single` without owner · remeasure 3.3–3.4b · default-on JIT.

## Active checks

| Check | Status | Impact | Evidence |
|---|---|---|---|
| Headless lanes | **P1–P4 done** · live smoke 7/7 | dev-process | `HEADLESS-LANES-DESIGN.md` |
| Suite | **0 fail** | `pane-cleanup` ⑥ flaky under load | 0.44.1 ship |
| v0.44.1 | **shipped** 2026-10-18 · no real-CLI (D7) | relay reconnect | `docs/PLAN.md` §0.44.1 |
| v0.44.0 | **shipped** 2026-10-18 · no real-CLI (D9) | read-only history search | `docs/PLAN.md` §0.44.0 |
| v0.32–0.43 | **shipped** | 0.34 live (macOS) · 0.36–0.39 · 0.43 real-CLI PASS | `docs/PLAN.md` |
| P3 soft close | **closed** · 3.0–3.2 opt-in · 3.3–3.4b false | freeze new surfaces | `PHASE3-SOFT-CLOSE.md` |
| `smoke:uc` · B-4 pin | **OK** | prior | check:mem-header |
| B-7 upstream | deferred optional | ecosystem | PRIORITIES P2c |

## Owner pending

| Decision | Why | Safe default | Evidence |
|---|---|---|---|
| MBP relay LaunchDaemon | live launchd rule | wait for owner yes | HANDOFF Steps 2 |
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
- 0.44.1 review: `docs/plan_review.md` §Review R65 · record `implementation-notes.md` §0.44.1  
- 3.4b/3.4/3.3 RESULT · `scripts/rule-router-jit.ts`  

## Don't redo

- 3.3–3.4b remeasure / COMPLY soften / live without T1(a).  
- default-on JIT · silent product MINOR (owner picks each step).  
- B-4 as B-7 closed · UC-3 leave while sticky live.  
- R65 review of 0.44.1 (approved 2026-10-18, no R65b).  
- 0.37.0 real-CLI ① (PASS 2026-10-17) · 0.38.0 real-CLI ① (PASS 2026-10-18) · 0.39.0 real-CLI (PASS 2026-10-18) · 0.43.0 real-CLI (PASS 2026-10-18).  
- 0.36.0 real-CLI smoke (PASS 2026-10-17).  
- 0.34.0 live launchd smoke (PASS 2026-10-17, macOS).
