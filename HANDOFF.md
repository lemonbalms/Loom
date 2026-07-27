# HANDOFF — Loom

**Updated:** 2026-07-28
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> v0.28.1 · RULE-ROUTER **Phase 3.0 명세+PREREG 봉인** · next = **JIT 구현 → canary**.

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | v0.28.1 · adapter `6e2df8a` | `docs/PLAN.md` |
| Dogfood | unblocked (p17 · 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | NORMS P3 · RULE-ROUTER **P3.0 prereg sealed** | PHASE3-SPEC · PREREG |
| Reuse | not proven | evidence |

## Current action

### RULE-ROUTER — Phase 3.0 구현 + 준수 카나리아

**Goal:** sealed PREREG 불변으로 `rule-router-jit` dry-run→canary 측정→결과 문서. live는 opt-in만.

**Authority:** `RULE-ROUTER-PHASE3-SPEC.md` rev-1 · `RULE-ROUTER-PHASE3-PREREG.md` rev-1 (`de04b1fa`) · §5.3.

**Now:** (1) select 모듈 export + `rule-router-jit.ts` + tests (2) settings append after model-guard (3) canary 10런 채점 (4) PHASE3-RESULT.

**Line:** topology **`single`** · execution **`current-session`** · verify **`objective-commands`** · full fallback Codex→Grok→Codex

**Done when:** dry-run tests green · canary per PREREG · RESULT · T1/T1(b) 기록 · enable 조건 문서화.

**Must not:** change sealed PREREG cells · default-on · pin-as-avoidance · hardcode bodies · >10k truncate · U2 prescription · holdout open.

## Active checks

| Check | Status | Impact | Evidence |
|---|---|---|---|
| NORMS Phase 3 | **done** | N packs | `norms:check` |
| Suite | **889/0 · tc 6/6** · uc 기지 2 | — | 2026-07-26 |
| ISSUE cause B | **open** | cache | B-7 |
| D7 PREREG | **sealed** | replay OK | rev-4 |
| Phase 2 R1 | **A 확정** | bake-off 닫힘 | PHASE2-RESULT |
| §5.3 rev-13 | **approved** · M-1 fold-in | 문안 해소 | REVIEW-rev-13 |
| **P3.0 SPEC+PREREG** | **sealed** · unit=`orch.model-explicit` | 구현 허용 | PHASE3-* |
| `smoke:uc` UC-3 | fail 2 · 비회귀 | 미진단 | — |

## Owner pending

| Decision | Why | Safe default | Evidence |
|---|---|---|---|
| 카테고리 표 개정 (S1-3) | standing-rules 미조인 | 현행 | §4·§6 |
| 라벨 검정력 | 63% 무관측 | S3-2 미판정 | §5 |
| ISSUE cause B | autoUpdate | open issue | HOOK-CACHE |
| HOOKCACHE-D-VERIFY | optional | paused | design |
| RULE-ENFORCEABILITY | product | doc only | spike |
| CONTEXT-MAP | package | not auth | propose §8 |

## Blockers

(none)

## Invariants

- Nine headings; D1 ≤8192B; no `<details>`.
- Traps in `tasks/traps.md` only.
- design-approved ≠ impl-authorized; MAP closed; NORMS ok.
- Topology `single/current-session/objective-commands`.
- S = one `--part all`; N Claude measured only.
- Codex N off; Grok ritual-only.
- HARD_CAP 9500; status table = owner brief.
- No warm-base re-fork; p17 / PANE-DEATH immutable.
- Spike REVIEW path (D2); pin/전량 ≠ 충돌 회피 (M-1).
- **Phase 3 PREREG sealed → cells immutable until RESULT.**

## Evidence

- NORMS · routing DOGFOOD §0.5 · M-1 `9b205a6`.
- Phase 1 registry 32 · PREREG rev-4 · Phase 2 A · F1…F1e chain.
- §5.3 REVIEW-rev-13 · M-1 fold-in `b099733`.
- PHASE3-SPEC rev-1 · PHASE3-PREREG rev-1 body `de04b1fa` · slice 3.0.

## Don't redo

- Dual S hooks; F6/P7; single/full reopen; MAP under NORMS.
- Codex N from estimates; Grok stdout as N.
- Cause B closed by B-4; warm-base re-fork.
- Reopen sealed F1*/D7/P3.0 PREREG; edit canary after peek.
- §5.3 direct-prescription; 10/10 unconditional; U2 prescription.
- pin/전량 as conflict avoidance; §5.3 approve as Phase 3 code auth.
- default-on JIT; hardcode rule bodies; silent 10k truncate.
