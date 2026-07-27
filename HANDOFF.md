# HANDOFF — Loom

**Updated:** 2026-07-28
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> v0.28.1 · P3.1 canary **T1 FAIL** (DELIV 5/5 · COMPLY 0/5) · ship live blocked · next=SPEC rev.

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | v0.28.1 · adapter `6e2df8a` | `docs/PLAN.md` |
| Dogfood | unblocked (p17 · 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | RULE-ROUTER **P3.1 T1 FAIL · ship gated** | PHASE3.1-RESULT rev-2 |
| Reuse | not proven | evidence |

## Current action

### RULE-ROUTER — Phase 3.1 T1 FAIL · SPEC 개정 게이트

**Done:** model n=10 · G0 PASS · jit DELIVERED 5/5 · COMPLY **0/5** · T1 **FAIL**.  
Evidence: `~/.loom/phase3-1-canary-2026-07-28/` · scorer seal `70ccb72b` · body sha8 `1172cf30`.

**Claims:** 전달 성립 · 세션 무회귀 · **준수 실패** · ship live **금지**  
(`PHASE3_1_SHIP_LIVE_AUTHORIZED` stays **false**). Do **not** soften COMPLY.

**Next (PREREG §8 · pick A default):**
1. **SPEC 개정 게이트** — 준수 0 원인 가설(가시 시점·문안·F1 거부 표지·경쟁) 고정  
2. 가설 검증 스파이크(소 n, **새** PREREG 전에만)  
3. 재설계 시 **새 PREREG** seal 후 재측정 (3.1 rev-1 셀 불변 — 재사용 재측정 비권장)  
4. 대안: ship surface **보류** · 3.0 delegation only 유지

**Line:** topology **`single`** · execution **`current-session`** · verify **`objective-commands`** · full fallback Codex→Grok→Codex

**Must not:** post-hoc COMPLY 완화 · ship live flip · default-on · reopen sealed PREREG cells · “DELIVERED=live”.

## Active checks

| Check | Status | Impact | Evidence |
|---|---|---|---|
| P3.0 model n=10 | **T1(b) PASS** | delegation live opt-in | RESULT rev-2 |
| P3.1 unit tests | **17/17** | ship path | `rule-router-jit.test.ts` |
| P3.1 model n=10 | **T1 FAIL** | ship live blocked | RESULT rev-2 · COMPLY 0/5 |
| P3.1 ship live gate | **blocked** | safety | constant false |
| ISSUE cause B | open | cache ≤1min | B-7 |
| `smoke:uc` UC-3 | fail 2 비회귀 | 미진단 | — |

## Owner pending

| Decision | Why | Safe default | Evidence |
|---|---|---|---|
| P3.1 next path | T1 fail | **SPEC 개정** or ship 보류 | RESULT §5 |
| 카테고리 표 (S1-3) | standing-rules 미조인 | 현행 | PHASE2 |
| ISSUE cause B | autoUpdate reverts | open | HOOK-CACHE |
| default-on JIT | product risk | **off** | PHASE3 |

## Blockers

(none)

## Invariants

- Nine headings; D1 ≤8192B; no `<details>`; traps only in `tasks/traps.md`.
- Topology `single/current-session/objective-commands`; lockedness ≠ auto-delegate.
- design-approved ≠ impl-authorized.
- HARD_CAP 9500; owner brief = `bun run status` only.
- pin/전량 ≠ 충돌 회피.
- **P3.1 PREREG sealed · RESULT rev-2 closed — do not reopen cells to chase pass.**
- JIT unset = off · delegation live opt-in · **ship live gated false** · default-on no.
- Delivery ≠ compliance (F1 · this canary).

## Evidence

- Canary root `~/.loom/phase3-1-canary-2026-07-28/` · `logs/p31-gates.json`.
- G0 base DELIV 0/5 · jit DELIV 5/5 · COMPLY 0/5 both · TOOL_RAN 5/5 · rc=0 all.
- All jit bun cmds = plain `bun test` (no env -u).
- Fixture reached: `sha8:1172cf30` in jit payloads.
- Docs: PHASE3.1-SPEC · PREREG · RESULT **rev-2**.

## Don't redo

- Soften COMPLY after peek; flip ship live on DELIVERED alone.
- Reopen F1*/P3.0/P3.1 PREREG cells; default-on; pin JIT; hardcode bodies.
- Claim “injection corrected that Bash call” (C1).
- Re-run same PREREG n=10 hoping for pass without design change.
