# HANDOFF — Loom

**Updated:** 2026-07-28
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> v0.28.1 · RULE-ROUTER **P3.0 훅 착수** · 결정론 DELIVERED ✓ · **모델 canary 10런 남음**.

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | v0.28.1 · adapter `6e2df8a` | `docs/PLAN.md` |
| Dogfood | unblocked (p17 · 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | NORMS P3 · RULE-ROUTER **P3.0 impl · model canary pending** | PHASE3-RESULT rev-1 |
| Reuse | not proven | evidence |

## Current action

### RULE-ROUTER — Phase 3.0 모델 준수 카나리아 (PREREG n=10)

**Goal:** sealed PREREG로 base 5 + jit 5 모델 런 → T1/T1(b) · RESULT rev-2. live enable still forbidden until pass.

**Authority:** PHASE3-PREREG rev-1 · PHASE3-SPEC · `rule-router-jit.ts` · F1 harness pattern.

**Now:** canary harness (or live Claude) 10런 · 채점 · RESULT rev-2. Do not set `LOOM_RULE_ROUTER_JIT=1` yet.

**Line:** topology **`single`** · execution **`current-session`** · verify **`objective-commands`** · full fallback Codex→Grok→Codex

**Done when:** G0+T1/T1(b) recorded · RESULT rev-2 · opt-in conditions explicit.

**Must not:** edit PREREG after peek · default-on · live=1 pre-pass · U2 Rx · pin-as-avoidance.

## Active checks

| Check | Status | Impact | Evidence |
|---|---|---|---|
| NORMS Phase 3 | **done** | N packs | `norms:check` |
| Suite | **889+11 jit · 0 fail** | P3.0 unit | jit.test |
| §5.3 rev-13 | **approved** | 문안 | REVIEW-rev-13 |
| P3.0 SPEC+PREREG | **sealed** `bafa81f` | cells frozen | PHASE3-PREREG |
| P3.0 hook | **shipped** · settings append | path ready | rule-router-jit |
| P3.0 model canary | **pending** | live blocked | RESULT rev-1 |
| ISSUE cause B | open | cache | B-7 |
| `smoke:uc` UC-3 | fail 2 비회귀 | — | — |

## Owner pending

| Decision | Why | Safe default | Evidence |
|---|---|---|---|
| 카테고리 표 (S1-3) | 미조인 | 현행 | §4·§6 |
| 라벨 검정력 | 63% 무관측 | S3-2 미판정 | §5 |
| ISSUE cause B | autoUpdate | open | HOOK-CACHE |
| HOOKCACHE-D-VERIFY | optional | paused | design |
| CONTEXT-MAP | package | not auth | propose |

## Blockers

(none)

## Invariants

- Nine headings; D1 ≤8192B; no `<details>`.
- Traps only in `tasks/traps.md`.
- design-approved ≠ impl-authorized.
- Topology `single/current-session/objective-commands`.
- S one `--part all`; N Claude-only.
- Codex N off; Grok ritual-only; HARD_CAP 9500.
- pin/전량 ≠ 충돌 회피; **P3 PREREG immutable until RESULT rev-2**.
- **JIT default off** until model canary pass (deviation vs SPEC dry-run default).

## Evidence

- PHASE3-SPEC/PREREG sealed `bafa81f` · body `de04b1fa`.
- `rule-router-jit.ts` + 11 tests · stdin canary DELIVERED.
- settings: model-guard then jit on `Agent|Task`.
- RESULT rev-1: model n=10 pending · live forbidden.
- §5.3 REVIEW-rev-13 · F1…F1e · Phase 2 A · registry 32.

## Don't redo

- Dual S hooks; F6/P7; MAP under NORMS; Codex N from estimates.
- Cause B closed by B-4; warm-base re-fork; reopen sealed F1*/D7/P3 PREREG.
- §5.3 direct-prescription; 10/10 unconditional; U2 Rx.
- pin as avoidance; live=1 before T1; default-on; hardcode bodies; 10k truncate.
