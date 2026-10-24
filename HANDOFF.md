# HANDOFF — Loom

**Updated:** 2026-10-24
**Workspace:** `/Users/kyoungsiklee/projects/loom`

## One-line resume

> v0.46.0 snapshot authority **approved** (R69) · P0 TLA **done** · **next = P1 red → green**

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | **v0.46.0 approved** 2026-10-24 (R69 · no R69b) · 0.45.4 shipped | `docs/PLAN.md` |
| Dogfood | `dogfood:herdr` ok (0.9.5 / p22) · D5 real-card smoke PASS (ⓓ) | `HERDR-0.9.5-COMPAT.md` §6 |
| Harness | **P3 soft close** · JIT 3.0–3.2 only | `PHASE3-SOFT-CLOSE.md` |
| Dev env | claude-mem 13.12.4 B-4 + autoUpdate off | `check:mem-header` |

## Current action

### v0.46.0 approved (R69) · P0 done · next = P1

**Goal:** pane card done/fail authority = herdr `agent.get` snapshot (baseline `state_change_seq` · `completion_seq` fence · events wake only · `status_unavailable` window) — PLAN §0.46.0.
**State:** PLAN §0.46.0 **approved** 2026-10-24 — Astra 0261 · 0264 · 0266 FAIL → 0268 PASS-with-lows (`a300667`) · P0b probe f PASS (`rogN0W`) · R69 approved-with-fixes → M1 · M2 · L1–L3 folded (no R69b).

**P0 done:** `docs/spikes/tla/snapshot-authority/` 47 cfgs · TLC run 3 47/47 match · Astra 0272/0275 FAIL → 0278 PASS-with-lows · PLAN W-reset + CWAC narrowed (R69 addendum, fold). **Next:** P1 red → green → P2 → P3. **D11** real-card probe (claude · tool-use + focused-pane variants) = ship blocker · needs a **separate owner `ownerDecision` before running** (I4).

**Carry:** `memorySnapshotLocked` byteLength · `history-scan.ts:365` comment · 0.43 UK-1 · UK-6/UK-7 · Linux/Windows live unverified · `pane-cleanup.test.ts` ⑥ flaky

**Line:** topology **`full`** · execution **`delegated`** · verify **`independent`** · chain Claude→Opus 5.5 medium impl (`lane.ts impl`)→GPT-6 Astra high verify (`lane.ts verify`) + loom-advisor Opus 5.5 high (promoted from `single` 2026-10-15 — `DOGFOOD_LOOP.md` §0.5.3)

**Done when (this handoff):** P1 red → green (`agentGet` snapshot) with Astra verify PASS — declared only with `docs/GATE-POLICY.md` §3 evidence (commit SHA · diff scope · test cmd + counts · verify `meta.json` · probe `summary.json`).

**Must not:** any I1–I4 action (`docs/GATE-POLICY.md` — push/merge · live launchd/systemd · deploy · DB write · external send · data delete · real-CLI tokens e.g. `smoke:*:--real-cli` · paid API) without an owner yes recorded as `ownerDecision` · test/probe without temp HOME + `LOOM_TEST_HOME` · start next-step code before owner pick + review · inherit bridge env into workers (R48-H1) · sync lock on WS receive path (R47-H1) · demote to `single` without owner · remeasure 3.3–3.4b · default-on JIT.

## Active checks

| Check | Status | Impact | Evidence |
|---|---|---|---|
| Headless lanes | **P1–P4 done** · live smoke 7/7 | dev-process | `HEADLESS-LANES-DESIGN.md` |
| Suite | numbers in 0.45.4 ship commit | `pane-cleanup` ⑥ · `headless-0300-verify` "3 local/adopted leader" flaky under load (isolated 46/0 ×2) | 0.45.4 ship |
| v0.46.0 | **approved** R69 · P0 next · D11 ship blocker | snapshot authority MINOR | PLAN §0.46.0 |
| v0.32–0.45.4 | **shipped** | 0.34 live (macOS) · 0.36–0.39 · 0.43 real-CLI PASS | `docs/PLAN.md` |
| P3 soft close | **closed** · 3.0–3.2 opt-in · 3.3–3.4b false | freeze new surfaces | `PHASE3-SOFT-CLOSE.md` |
| `smoke:uc` · B-4 pin | **OK** | prior | check:mem-header |
| B-7 upstream | deferred optional | ecosystem | PRIORITIES P2c |

## Owner pending

| Decision | Why | Safe default | Evidence |
|---|---|---|---|
| MBP relay — **live since 2026-10-18** (`ws://100.119.218.93:7842/ws`, systemd `loom-relay` enabled; lg99 Task Disabled, originals kept) | 9b deferred → **review 2026-10-25** (re-propose after 1 week stable; lg99 `LoomRelayTeam` stays Disabled) · mac profile left as is (owner 2026-10-18) | lg99 rollback = Task Enable+Start, `systemctl disable --now loom-relay`, restore `mac.json.pre-mbp` | runbook |
| 0.46.0 D11 real-card probe (claude · tool-use + focused) | I4 real-CLI tokens · ship blocker | **do not run** until owner `ownerDecision` | PLAN §0.46.0 ⑦ |
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
- 0.45.x deviations: `implementation-notes.md` §0.45.0–§0.45.4
- 3.3–3.4b RESULT: `scripts/rule-router-jit.ts`
- MBP relay (live 2026-10-18 · run log at end): `docs/spikes/MBP-RELAY-RUNBOOK.md`
- ownerDecision: `2026-10-24 · push 5a32a41..0f63aa8 to origin/main ×1 · source "푸시해"`

## Don't redo

- 3.3–3.4b remeasure / COMPLY soften / live without T1(a).  
- default-on JIT · silent product MINOR (owner picks each step).  
- B-4 as B-7 closed · UC-3 leave while sticky live.  
- real-CLI PASS: 0.36.0 · 0.37.0 ① · 0.38.0 ① · 0.39.0 · 0.43.0 · 0.45.3 D5 · 0.34.0 live launchd (macOS).
- 0.45.0–0.45.4 shipped · P1c mutation probe (`663883f`) · 0.46.0 P0b probe f (PASS `rogN0W`).
