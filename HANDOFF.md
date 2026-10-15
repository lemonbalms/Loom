# HANDOFF — Loom

**Updated:** 2026-10-16
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> v0.32.0 **implemented** · step 2 done · **next = 3단계 host OS 서비스** (fixed order; on owner go) · topology full

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | **v0.32.0 `implemented`** · P5 docs/smoke in | `docs/PLAN.md` |
| Dogfood | unblocked (p17 · 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | **P3 soft close** · JIT 3.0–3.2 only | `PHASE3-SOFT-CLOSE.md` |
| Dev env | claude-mem 13.12.4 B-4 + autoUpdate off | `check:mem-header` |

## Current action

### v0.32.0 implemented · next = 3단계 host OS 서비스 (UPGRADE-PLAN order)

**Goal:** step 2 done — Loom MCP pre-check (`loomTools` · `loom__*` deny · strict args · audit · L-2 flag) on v0.31.0 policy. Authority `docs/PLAN.md` §0.32.0 · impl-notes §0.32.0 · `USER_GUIDE.md` §17.

**Playbook (next session):**
1. `bun run status` · `handoff:check`
2. On owner go: 3단계 host OS 서비스 (`docs/UPGRADE-PLAN.md` order) → PLAN MINOR + R{n} before code
3. Carry: codex MCP approval (owner config) · `propose` shell bypass · L-2 advisory (impl-notes)

**Line:** topology **`full`** · execution **`delegated`** · verify **`independent`** · chain Claude→Grok→Codex verify + fable-advisor advise (promoted from `single` 2026-10-15 — `DOGFOOD_LOOP.md` §0.5.3)

**Done when (this handoff):** next PLAN drafted and gated (R{n}).

**Must not:** start next-step code before owner pick + review · inherit bridge env into workers (R48-H1) · sync lock on WS receive path (R47-H1) · demote to `single` without owner · remeasure 3.3–3.4b · default-on JIT.

## Active checks

| Check | Status | Impact | Evidence |
|---|---|---|---|
| v0.32.0 | **implemented** | step 2 done | `docs/PLAN.md` |
| P3 soft close | **closed** | freeze new surfaces | `PHASE3-SOFT-CLOSE.md` |
| 3.0–3.2 soft live | **opt-in** | JIT | consts true · RESULT |
| 3.3–3.4b live | **false** | blocked | consts false · RESULT |
| `smoke:uc` · B-4 pin | **OK** | prior | check:mem-header |
| B-7 upstream | deferred optional | ecosystem | PRIORITIES P2c |

## Owner pending

| Decision | Why | Safe default | Evidence |
|---|---|---|---|
| Start 3단계 host OS 서비스 | 착수는 오너 지시 시 · 7단계 확정(2026-10-16), 순서상 마지막 — 재질문 금지 | not started | `docs/UPGRADE-PLAN.md` |
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
