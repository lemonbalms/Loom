# HANDOFF — Loom

**Updated:** 2026-10-23
**Workspace:** `/Users/kyoungsiklee/projects/loom`

## One-line resume

> v0.45.4 watchdog PLAN **approved** (R68) · P0 TLA done · **next = P1 red (watchdog tests) → green → P2 docs**

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | **v0.45.3 shipped** 2026-10-23 (P1–P5 · R67) | `docs/PLAN.md` |
| Dogfood | `dogfood:herdr` ok (0.9.5 / p22) · D5 real-card smoke PASS (ⓓ) | `HERDR-0.9.5-COMPAT.md` §6 |
| Harness | **P3 soft close** · JIT 3.0–3.2 only | `PHASE3-SOFT-CLOSE.md` |
| Dev env | claude-mem 13.12.4 B-4 + autoUpdate off | `check:mem-header` |

## Current action

### v0.45.4 status-loss watchdog PATCH — P1 red → green → P2

**Goal:** per-card status-loss watchdog (owner order: after compat — 0.45.3 shipped). `status_lost` fails loud and never calls `beginCardCompletion`.
**State:** PLAN §0.45.4 **`approved`** — R68 approved-with-fixes (M1 · M2 · L1–L5, `09ef503`; Astra 0240 FAIL → 0242 PASS; no R68b). **P0 done** — architect TLC `_Gap` 1,188 · `_Drop` 1,308 · `_GapReplay` 3,048 No error; expected violations hold (`BRIDGE-STARTUP-TLA.md` §8).

**Next:** P1 red = new `status-lost-watchdog.test.ts` (R14 ①–⑰) + `fake-herdr.ts` hooks (R15) via `lane.ts impl` → architect re-runs red → P1 green (`herdr-client.ts` · `bridge-runtime.ts` only) → `lane.ts verify` → P2 docs/version/dist → loom-advisor final → ship.

**Carry:** TLA+ follow-ups: F1'–F3' MINOR (`BRIDGE-STARTUP-TLA.md`) · `memorySnapshotLocked` byteLength · `history-scan.ts:365` comment · 0.43 UK-1 · UK-6/UK-7 · Linux/Windows live unverified · `pane-cleanup.test.ts` ⑥ flaky

**Line:** topology **`full`** · execution **`delegated`** · verify **`independent`** · chain Claude→Opus 5.5 medium impl (`lane.ts impl`)→GPT-6 Astra high verify (`lane.ts verify`) + loom-advisor Opus 5.5 high (promoted from `single` 2026-10-15 — `DOGFOOD_LOOP.md` §0.5.3)

**Done when (this handoff):** §0.45.4 Done (b)–(f) — P1 green · ship checks · docs/version · loom-advisor final = ship · real CLI 0 (D9).

**Must not:** run any further live launchd/systemd registration or real-CLI smoke (e.g. `smoke:policy --real-cli` · `smoke:memory-write --real-cli`) without explicit owner yes · test/probe without temp HOME + `LOOM_TEST_HOME` · start next-step code before owner pick + review · inherit bridge env into workers (R48-H1) · sync lock on WS receive path (R47-H1) · demote to `single` without owner · remeasure 3.3–3.4b · default-on JIT.

## Active checks

| Check | Status | Impact | Evidence |
|---|---|---|---|
| Headless lanes | **P1–P4 done** · live smoke 7/7 | dev-process | `HEADLESS-LANES-DESIGN.md` |
| Suite | **0 fail** (4323 ran / 0 fail at 0.45.3 ship) | `pane-cleanup` ⑥ flaky under load | 0.45.3 ship |
| v0.45.4 | **approved** (R68) · P0 done · P1 next | watchdog PATCH | PLAN §0.45.4 |
| v0.45.3 | **shipped** 2026-10-23 · D5 smoke PASS | herdr p22 compat | PLAN §0.45.3 |
| v0.45.2 | **shipped** 2026-10-23 · no real-CLI (D4) | PATCH: relay bind message names an unassigned address | `docs/PLAN.md` §0.45.2 |
| v0.32–0.45.1 | **shipped** | 0.34 live (macOS) · 0.36–0.39 · 0.43 real-CLI PASS | `docs/PLAN.md` |
| P3 soft close | **closed** · 3.0–3.2 opt-in · 3.3–3.4b false | freeze new surfaces | `PHASE3-SOFT-CLOSE.md` |
| `smoke:uc` · B-4 pin | **OK** | prior | check:mem-header |
| B-7 upstream | deferred optional | ecosystem | PRIORITIES P2c |

## Owner pending

| Decision | Why | Safe default | Evidence |
|---|---|---|---|
| MBP relay — **live since 2026-10-18** (`ws://100.119.218.93:7842/ws`, systemd `loom-relay` enabled; lg99 Task Disabled, originals kept) | 9b deferred → **review 2026-10-25** (re-propose after 1 week stable; lg99 `LoomRelayTeam` stays Disabled) · mac profile left as is (owner 2026-10-18) | lg99 rollback = Task Enable+Start, `systemctl disable --now loom-relay`, restore `mac.json.pre-mbp` | runbook |
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

- Ritual: `docs/SESSION-START.md` · topology `docs/spikes/SINGLE-TOPOLOGY-EXECUTION-DESIGN.md`
- Close: `docs/spikes/RULE-ROUTER-PHASE3-SOFT-CLOSE.md`
- 0.37.0 smoke: `docs/spikes/POLICY-HONESTY-SMOKE-0370.md`
- 0.45.x deviations: `implementation-notes.md` §0.45.0–§0.45.3
- 3.3–3.4b RESULT: `scripts/rule-router-jit.ts`
- MBP relay (live 2026-10-18 · run log at end): `docs/spikes/MBP-RELAY-RUNBOOK.md`

## Don't redo

- 3.3–3.4b remeasure / COMPLY soften / live without T1(a).  
- default-on JIT · silent product MINOR (owner picks each step).  
- B-4 as B-7 closed · UC-3 leave while sticky live.  
- 0.37.0 real-CLI ① (PASS 2026-10-17) · 0.38.0 real-CLI ① (PASS 2026-10-18) · 0.39.0 real-CLI (PASS 2026-10-18) · 0.43.0 real-CLI (PASS 2026-10-18).  
- 0.36.0 real-CLI smoke (PASS 2026-10-17).  
- 0.34.0 live launchd smoke (PASS 2026-10-17, macOS).
- 0.45.0 shipped (no real-CLI, D9) · 0.45.1 shipped (no real-CLI) · 0.45.2 shipped (no real-CLI).
- 0.45.3 D5 real-card smoke (PASS 2026-10-23).
- 0.45.4 R68 · P0 TLC (done `09ef503`).
