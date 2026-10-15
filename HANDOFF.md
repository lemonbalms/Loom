# HANDOFF — Loom

**Updated:** 2026-10-16
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> v0.33.0 **approved** (R51) · 3단계 1부 bridge lifecycle · **next = P1** lock+status (red first) · topology full

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | **v0.33.0 `approved`** (R51) · next P1 | `docs/PLAN.md` |
| Dogfood | unblocked (p17 · 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | **P3 soft close** · JIT 3.0–3.2 only | `PHASE3-SOFT-CLOSE.md` |
| Dev env | claude-mem 13.12.4 B-4 + autoUpdate off | `check:mem-header` |

## Current action

### v0.33.0 approved (R51) · next = P1 bridge lock + status file

**Goal:** 3단계 1부 — bridge lifecycle (SIGTERM → exit 0 · per-profile lock · `loom bridge drain` · status file + doctor · headless skips herdr). Authority `docs/PLAN.md` §0.33.0 · `docs/plan_review.md` R51 (M1–M3 · L1–L4 in PLAN). v0.32.0 shipped `9567f87`.

**Playbook (next session):**
1. `bun run status` · `handoff:check`
2. P1 red (test files only · reuse `startFakeHerdr`) → green → Opus 5.5 xhigh verify → P2…P5 (PLAN ⑥)
3. 0.34.0 `loom service` (3단계 2부): PLAN + R52 · live OS smoke needs a separate owner yes
4. Carry: codex MCP approval (owner config) · `propose` shell bypass · L-2 advisory (impl-notes)

**Line:** topology **`full`** · execution **`delegated`** · verify **`independent`** · chain Claude→Grok→Codex verify + fable-advisor advise (promoted from `single` 2026-10-15 — `DOGFOOD_LOOP.md` §0.5.3)

**Done when (this handoff):** P1 red→green committed and independently verified.

**Must not:** run 0.34.0 live launchd/systemd registration without explicit owner yes · start next-step code before owner pick + review · inherit bridge env into workers (R48-H1) · sync lock on WS receive path (R47-H1) · demote to `single` without owner · remeasure 3.3–3.4b · default-on JIT.

## Active checks

| Check | Status | Impact | Evidence |
|---|---|---|---|
| v0.33.0 | **approved** (R51) | 3단계 1부 · next P1 | `docs/PLAN.md` |
| v0.32.0 | **shipped** `9567f87` | step 2 done | `docs/PLAN.md` |
| P3 soft close | **closed** | freeze new surfaces | `PHASE3-SOFT-CLOSE.md` |
| 3.0–3.2 soft live | **opt-in** | JIT | consts true · RESULT |
| 3.3–3.4b live | **false** | blocked | consts false · RESULT |
| `smoke:uc` · B-4 pin | **OK** | prior | check:mem-header |
| B-7 upstream | deferred optional | ecosystem | PRIORITIES P2c |

## Owner pending

| Decision | Why | Safe default | Evidence |
|---|---|---|---|
| 0.34.0 live OS smoke | 3단계 go = "진행해" 2026-10-16 · real launchd/systemd write needs separate yes · 7단계 last — 재질문 금지 | not run | PLAN §0.33.0 |
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

- Close: `docs/spikes/RULE-ROUTER-PHASE3-SOFT-CLOSE.md`  
- 3.4b/3.4/3.3 RESULT · `scripts/rule-router-jit.ts`  
- 3.0–3.2 RESULT · live consts true

## Don't redo

- 3.3–3.4b remeasure / COMPLY soften / live without T1(a).  
- default-on JIT · silent product MINOR (owner picks each step).  
- B-4 as B-7 closed · UC-3 leave while sticky live.
