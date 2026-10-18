# HANDOFF — Loom

**Updated:** 2026-10-18
**Workspace:** `/Users/kyoungsiklee/projects/loom`

## One-line resume

> v0.44.1 **approved** (R65) · relay reconnect never gives up · **next = P1 reconnect red → green**

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | **v0.44.1 approved** (R65) 2026-10-18 · next = P1 | `docs/PLAN.md` §0.44.1 |
| Dogfood | unblocked (p17 · 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | **P3 soft close** · JIT 3.0–3.2 only | `PHASE3-SOFT-CLOSE.md` |
| Dev env | claude-mem 13.12.4 B-4 + autoUpdate off | `check:mem-header` |

## Current action

### v0.44.1 approved (R65) · next = P1 reconnect red → green

**Goal:** relay clients never give up on retryable failures — prerequisite for the MBP 2015 always-on relay replacing the Windows relay.
0.44.1 PATCH on worktree `patch-0.44.1` (from origin/main `c65a20b`) · 0.45.0 artifact store is in progress on local main and lands after 0.44.1.
R65 approved-with-fixes → M1 (R1 = pending-timer **or** `reconnectInFlight` guard) · M2 (default-infinite proof) · L1–L3 folded, no R65b.

**Steps:**
1. P1 red = new `relay-client.reconnect.test.ts` only (production 0 lines) → green = `relay-client.ts` only (tests 0 lines) · `lane.ts verify` + architect rerun
2. P2 = versions ×3 → 0.44.1 · `build:cli` · USER_GUIDE reconnect paragraph (R9) · CHANGELOG · implementation-notes §0.44.1 · PLAN:2513 note
3. loom-advisor final review → ship; then 0.45.0 rebases onto it

**Line:** topology **`full`** · execution **`delegated`** · verify **`independent`** · chain Claude→Opus 5.5 medium impl (`lane.ts impl`)→GPT-6 Astra high verify (`lane.ts verify`) + loom-advisor Opus 5.5 high (promoted from `single` 2026-10-15 — `DOGFOOD_LOOP.md` §0.5.3)

**Done when (this handoff):** PLAN §0.44.1 Done (a)–(d) checked · suite 0 fail · shipped.

**Must not:** run any further live launchd/systemd registration or real-CLI smoke (e.g. `smoke:policy --real-cli` · `smoke:memory-write --real-cli`) without explicit owner yes · test/probe without temp HOME + `LOOM_TEST_HOME` · start code beyond approved 0.44.1 P1–P2 · inherit bridge env into workers (R48-H1) · sync lock on WS receive path (R47-H1) · demote to `single` without owner · remeasure 3.3–3.4b · default-on JIT.

## Active checks

| Check | Status | Impact | Evidence |
|---|---|---|---|
| Headless lanes | **P1–P4 done** · live smoke 7/7 | dev-process | `HEADLESS-LANES-DESIGN.md` |
| Suite | **0 fail** (4134/0) | `pane-cleanup` ⑥ flaky under load | 0.44 ship |
| v0.44.1 | **approved** (R65) · P1 next · no real-CLI (D7) | relay reconnect | `docs/PLAN.md` §0.44.1 |
| v0.44.0 | **shipped** 2026-10-18 · no real-CLI (D9) | read-only history search | `docs/PLAN.md` §0.44.0 |
| v0.32–0.43 | **shipped** | 0.34 live (macOS) · 0.36–0.39 · 0.43 real-CLI PASS | `docs/PLAN.md` |
| P3 soft close | **closed** · 3.0–3.2 opt-in · 3.3–3.4b false | freeze new surfaces | `PHASE3-SOFT-CLOSE.md` |
| `smoke:uc` · B-4 pin | **OK** | prior | check:mem-header |
| B-7 upstream | deferred optional | ecosystem | PRIORITIES P2c |

## Owner pending

| Decision | Why | Safe default | Evidence |
|---|---|---|---|
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
- 0.44.1 review: `docs/plan_review.md` §Review R65  
- 3.4b/3.4/3.3 RESULT · `scripts/rule-router-jit.ts`  

## Don't redo

- 3.3–3.4b remeasure / COMPLY soften / live without T1(a).  
- default-on JIT · silent product MINOR (owner picks each step).  
- B-4 as B-7 closed · UC-3 leave while sticky live.  
- R65 review of 0.44.1 (approved 2026-10-18, no R65b).  
- 0.37.0 real-CLI ① (PASS 2026-10-17) · 0.38.0 real-CLI ① (PASS 2026-10-18) · 0.39.0 real-CLI (PASS 2026-10-18) · 0.43.0 real-CLI (PASS 2026-10-18).  
- 0.36.0 real-CLI smoke (PASS 2026-10-17).  
- 0.34.0 live launchd smoke (PASS 2026-10-17, macOS).
