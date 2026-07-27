# HANDOFF — Loom

**Updated:** 2026-07-28
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> v0.28.1 · P3.1 ship **code ready** · model canary n=10 next · ship live blocked.

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | v0.28.1 · adapter `6e2df8a` | `docs/PLAN.md` |
| Dogfood | unblocked (p17 · 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | RULE-ROUTER **P3.1 impl · canary open** | PHASE3.1-* |
| Reuse | not proven | evidence |

## Current action

### RULE-ROUTER — Phase 3.1 모델 준수 카나리아 (PREREG n=10)

**Goal:** sealed PREREG로 **base×5 + jit×5** (2-step Bash) → G0·T1/T1(b) → RESULT **rev-2**.  
통과 전 ship live **금지** (`PHASE3_1_SHIP_LIVE_AUTHORIZED=false`).

**Authority (read first):**
1. `docs/spikes/RULE-ROUTER-PHASE3.1-PREREG.md` rev-1 — cells/prompt/판정 **불변**
2. `docs/spikes/RULE-ROUTER-PHASE3.1-SPEC.md` rev-1
3. `docs/spikes/RULE-ROUTER-PHASE3.1-RESULT.md` rev-1 (결정론만)
4. `scripts/rule-router-jit.ts` · fixture `traps.bun-test-env` · sha8 **`1172cf30`**
5. 3.0 harness 선례: `~/.loom/phase3-0-canary-2026-07-28`

**Now (next session playbook):**
1. `bun test scripts/rule-router-jit.test.ts` (17 green 기대)
2. 채점·캡처 **관측 전** digest 고정 → `~/.loom/phase3-1-canary-YYYY-MM-DD/`
3. **base×5:** JIT off · PREREG §4 프롬프트 축자 · probe cwd (bun-test-env 미포함)
4. **jit×5:** `LOOM_RULE_ROUTER_JIT=canary` · 동일 프롬프트
5. 채점: DELIVERED · TOOL_RAN · COMPLY(env -u both) · G0/T1/T1(b)
6. RESULT rev-2 · 통과 시 ship live 상수 검토 · HANDOFF · ship. **PREREG 편집 금지.**

**Line:** topology **`single`** · execution **`current-session`** · verify **`objective-commands`** · full fallback Codex→Grok→Codex

**Done when:** RESULT rev-2 with G0+T1/T1(b) · ship live still opt-in/gated · default-on no.

**Must not:** peek 후 PREREG 변경 · ship live pre-pass · default-on · pin JIT · 본문 하드코딩 · 3.0 PREREG 재개방 · C1 “그 호출 교정” 주장.

## Active checks

| Check | Status | Impact | Evidence |
|---|---|---|---|
| P3.0 model n=10 | **T1(b) PASS** | delegation live opt-in | RESULT rev-2 · `97dca86` |
| P3.1 unit tests | **17/17** | ship path | `rule-router-jit.test.ts` |
| P3.1 stdin canary | **DELIVERED** | fixture path | RESULT rev-1 |
| P3.1 model n=10 | **pending** | blocks ship live | PREREG |
| P3.1 ship live gate | **blocked** | safety | `PHASE3_1_SHIP_LIVE_AUTHORIZED=false` |
| ISSUE cause B | open | cache ≤1min | B-7 |
| `smoke:uc` UC-3 | fail 2 비회귀 | 미진단 | — |

## Owner pending

| Decision | Why | Safe default | Evidence |
|---|---|---|---|
| 카테고리 표 (S1-3) | standing-rules 미조인 | 현행 | PHASE2 §4·§6 |
| 라벨 검정력 | 63% 무관측 | S3-2 미판정 | PHASE2 §5 |
| ISSUE cause B | autoUpdate reverts B-4 | open issue | HOOK-CACHE |
| default-on JIT | product risk | **off** | PHASE3-RESULT §4 |
| ship live after T1 | 3.1 gate | blocked until canary | PHASE3.1-SPEC §4 |

## Blockers

(none)

## Invariants

- Nine headings; D1 ≤8192B; no `<details>`; traps only in `tasks/traps.md`.
- Topology `single/current-session/objective-commands`; lockedness ≠ auto-delegate.
- design-approved ≠ impl-authorized; MAP/product closed under NORMS-only auth.
- S = one `--part all`; N Claude measured; Codex N off; Grok ritual-only.
- HARD_CAP 9500; owner brief = `bun run status` only.
- pin/전량 ≠ 충돌 회피 (REVIEW-rev-13 M-1).
- **P3.0 closed · P3.1 PREREG sealed → immutable until RESULT rev-2.**
- JIT unset = **off** · delegation live opt-in ok · **ship live gated** · default-on no.
- C1: inject is not “corrects that tool call”.

## Evidence

- P3.0 canary `~/.loom/phase3-0-canary-2026-07-28` · RESULT rev-2 `97dca86`.
- P3.1: SPEC · PREREG · RESULT rev-1 · fixture sha8 `1172cf30`.
- Hook: multi-surface · Bash settings matcher · 17 unit tests green.
- Stdin canary: Bash+canary → `traps.bun-test-env` · live ship → `ship_gate_blocked`.

## Don't redo

- Dual SessionStart hooks; F6/P7 over DOGFOOD §0.5; MAP under NORMS-only.
- Reopen sealed F1*/D7/P3.0/P3.1 PREREG; claim compliance lift without T1(a).
- ship live before T1; default-on; pin as conflict avoidance; hardcode bodies.
- U2 provenance Rx; silent 10k truncate; “this Bash was corrected by JIT”.
