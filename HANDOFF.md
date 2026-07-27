# HANDOFF — Loom

**Updated:** 2026-07-28
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> v0.28.1 · P3.0 **T1(b) PASS** · live opt-in ok · default-on no · next = 3.1 or owner pick.

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | v0.28.1 · adapter `6e2df8a` | `docs/PLAN.md` |
| Dogfood | unblocked (p17 · 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | NORMS P3 · RULE-ROUTER **P3.0 T1(b) closed** | PHASE3-RESULT rev-2 |
| Reuse | not proven | evidence |

## Current action

### RULE-ROUTER — Phase 3.0 closed · next surface gate

**Done (this wave):** base×5 + jit×5 model canary · G0 PASS · T1(b) PASS · RESULT rev-2.  
Evidence: `~/.loom/phase3-0-canary-2026-07-28/` · scorer seal `9876cdeb` · body sha8 `de04b1fa`.

**Claims allowed:** JIT DELIVERED 5/5 · session err 0 · no compliance *lift* (base already 5/5).  
**`LOOM_RULE_ROUTER_JIT=1` opt-in OK** · **default-on still forbidden** · unset remains **off**.

**Next (pick one — no auto-default product):**
1. **3.1 ship surface** SPEC+PREREG (SPEC §2 order) — new sealed PREREG before impl
2. Owner product direction (PLAN MINOR / other)
3. Backlog: ISSUE cause B · smoke:uc UC-3 · HOOKCACHE-D-VERIFY (non-blocking)

**Line:** topology **`single`** · execution **`current-session`** · verify **`objective-commands`** · full fallback Codex→Grok→Codex

**Must not:** reopen sealed P3.0 PREREG · claim compliance lift · default-on · live without opt-in env · U2 Rx · pin=회피.

## Active checks

| Check | Status | Impact | Evidence |
|---|---|---|---|
| NORMS Phase 3 | **done** | N packs | `norms:check` |
| P3.0 unit tests | **11/11** | hook path | `rule-router-jit.test.ts` |
| P3.0 stdin canary | **DELIVERED** | fixture path | RESULT rev-1 |
| P3.0 model n=10 | **T1(b) PASS** | live opt-in | RESULT rev-2 · G0+T1b |
| §5.3 rev-13 | **approved** · M-1 fold-in | 문안 | REVIEW-rev-13 · `b099733` |
| Phase 2 R1 | **A 확정** · M7b 0 | bake-off 닫힘 | PHASE2-RESULT |
| ISSUE cause B | open | cache ≤1min | B-7 |
| `smoke:uc` UC-3 | fail 2 비회귀 | 미진단 | — |

## Owner pending

| Decision | Why | Safe default | Evidence |
|---|---|---|---|
| 카테고리 표 (S1-3) | standing-rules 미조인 | 현행 | PHASE2 §4·§6 |
| 라벨 검정력 | 63% 무관측 | S3-2 미판정 | PHASE2 §5 |
| ISSUE cause B | autoUpdate reverts B-4 | open issue | HOOK-CACHE |
| HOOKCACHE-D-VERIFY | optional | paused | design |
| CONTEXT-MAP | separate package | not authorized | propose |
| default-on JIT | product risk | **off** until owner | PHASE3-RESULT §4 |

## Blockers

(none)

## Invariants

- Nine headings; D1 ≤8192B; no `<details>`; traps only in `tasks/traps.md`.
- Topology `single/current-session/objective-commands`; lockedness ≠ auto-delegate.
- design-approved ≠ impl-authorized; MAP/product closed under NORMS-only auth.
- S = one `--part all`; N Claude measured; Codex N off; Grok ritual-only.
- HARD_CAP 9500; owner brief = `bun run status` only.
- pin/전량 ≠ 충돌 회피 (REVIEW-rev-13 M-1).
- **P3.0 PREREG sealed · RESULT rev-2 closed — do not reopen cells.**
- JIT env unset = **off** · live=`1` **opt-in only** after T1/T1(b) · default-on no.

## Evidence

- HEAD pre-wave `8fc8748` (jit hook) · PREREG seal `bafa81f` · §5.3 review `b099733`.
- Canary root `~/.loom/phase3-0-canary-2026-07-28/` · gates `logs/p30-gates.json`.
- G0 base DELIV 0/5 · jit DELIV 5/5 · COMPLY 5/5 both · session_err 0.
- Fixture body sha8 `de04b1fa` · unit `orch.model-explicit` · ROUTER_VERSION A-1.
- Docs: PHASE3-SPEC · PHASE3-PREREG · PHASE3-RESULT **rev-2**.

## Don't redo

- Dual SessionStart hooks; F6/P7 over DOGFOOD §0.5; MAP under NORMS-only.
- Codex N from char estimates; Grok stdout as N delivery.
- Cause B closed by B-4; warm-base re-fork; reopen sealed F1*/D7/P3.0 PREREG.
- §5.3 “직접 처방”; 10/10 unconditional; U2 provenance Rx.
- pin as conflict avoidance; claim compliance *lift* from T1(b); default-on; hardcode bodies; silent 10k truncate.
- Re-run P3.0 n=10 without protocol reason; author-self-approve design without spike REVIEW when required.
