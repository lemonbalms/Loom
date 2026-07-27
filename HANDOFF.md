# HANDOFF — Loom

**Updated:** 2026-07-28
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> v0.28.1 · RULE-ROUTER **§5.3 approved** (M-1 fold-in) · next = **Phase 3 착수 게이트**.

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | v0.28.1 · adapter `6e2df8a` | `docs/PLAN.md` |
| Dogfood | unblocked (p17 · 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | NORMS P3 · RULE-ROUTER **§5.3 done · Phase 3 next** | REVIEW-rev-13 · propose |
| Reuse | not proven | evidence |

## Current action

### RULE-ROUTER — Phase 3 착수 게이트 (JIT 실주입 · 별도)

**Goal:** §5.3 문안 선결 해소됨. Phase 3 = 채택안(A)으로 **저위험 surface**에 JIT append-only 실주입.

**Authority:** PROPOSE §5.3(approved)·§7 Phase 3 · REVIEW-rev-13 · F1E/F1D 준수 카나리아 요건.

**Now:** Phase 3 범위 명세( surface 순서 · 충돌 탐지 구현 · 준수 카나리아 사전등록) 작성 → 착수 여부 결정. **§5.3 승인 ≠ 자동 착수.**

**Line:** topology **`single`** · execution **`current-session`** · verify **`objective-commands`** · full fallback Codex→Grok→Codex

**Done when:** Phase 3 착수 명세 + (착수 시) 준수 카나리아 사전등록 봉인 또는 명시적 defer.

**Must not:** 충돌 유닛 pin 강제 · 출처 처방 · 임의 토큰 카나리아 · 문자열-포함 준수 · holdout 개봉 · 봉인 F1* 변경.

## Active checks

| Check | Status | Impact | Evidence |
|---|---|---|---|
| NORMS Phase 3 | **done/authorized** | deterministic N packs | `norms:check` |
| Suite + typecheck | **889 pass / 0 fail · tc 6/6** · uc 기지 2건만 | no remaining tests | 2026-07-26 |
| ISSUE cause B | **open issue** | cache ≤1min | B-7; B-4 temp |
| D7 PREREG rev-4 | **sealed** · digest `ad74f06d` | replay 허용 | `prereg-sample.json` |
| Phase 2 R1 | **M7b 0 · A 확정 · B/C 미구현** | bake-off 닫힘 | `PHASE2-RESULT` |
| F1…F1e | 전달 YES · 준수 0/21→4/12→10/10 · 변수=지시 충돌 | §5.3 입력 | F1*/RESULT |
| **§5.3 rev-13** | **approved** · M-1 fold-in · 재리뷰 불요 | 문안 선결 해소 | `REVIEW-rev-13` |
| `smoke:uc` UC-3 | 상시 fail 2건 · 회귀 아님 | 미진단 | 차집합 0 |

## Owner pending

| Decision | Why | Safe default | Evidence |
|---|---|---|---|
| **카테고리 표 개정** (S1-3) | session-start↔AGENTS 미조인 | 현행 유지 | 결과 §4·§6 |
| **라벨 검정력** | 라우팅 가중 63% 무관측 | **S3-2 미판정 유지** | 결과 §5 |
| ISSUE cause B | autoUpdate reverts B-4 | open issue only | HOOK-CACHE |
| HOOKCACHE-D-VERIFY | optional | paused | design |
| RULE-ENFORCEABILITY | product | document only | spike |
| CONTEXT-MAP impl | separate package | not authorized | propose §8 |

## Blockers

(none)

## Invariants

- Nine HANDOFF headings; D1 ≤8192B; no `<details>`.
- Trap authority = `tasks/traps.md`. Don't redo = gate-local only.
- `design-approved ≠ implementation-authorized`; MAP/product closed; NORMS authorized.
- Topology `single/current-session/objective-commands`; lockedness alone ≠ delegate.
- SessionStart S = one `--part all`; N Claude-only measured.
- LOADED N = outer+all pack BEGIN/END + body.
- Codex N off until token measure; Grok ritual-only.
- Budget HARD_CAP 9500; owner brief = status table.
- No warm-base re-fork; p17 / PANE-DEATH U1–U11 immutable.
- RULE-ROUTER review path = **spike REVIEW** (D2).
- **pin/전량 ≠ 충돌 회피**(REVIEW-rev-13 M-1).

## Evidence

- NORMS Phase 3 · 3팩 · `norms:check`.
- OMX `e1f0aea`; C1–C5 unauthorized.
- Routing DOGFOOD §0.5 · M-1 `9b205a6`.
- Handoff B · cause B · DELIVERY · approval chain.
- Phase 1 registry 32 · categories · PREREG rev-4 · Phase 2 A.
- F1 `b6044f1` · F1b/c `e788f9e` · F1d `c997d42` · F1e `e6e3007`.
- §5.3 rev-13 `15fa73f` · REVIEW-rev-13 approve-conditional · M-1 fold-in 2026-07-28.
- Advisor: fable-advisor consulted: yes (CLI fable).

## Don't redo

- Re-split S dual hooks; reapply F6/P7; reopen single/full; MAP under NORMS.
- Enable Codex N from estimates; Grok stdout as N.
- Claim cause B closed by B-4; warm-base re-fork.
- Re-derive router; reopen sealed F1*/PREREG; author-lane bare approve without advisor when required.
- Keep §5.3 “직접 처방”; cite 10/10 unconditional; prescribe U2 provenance.
- Read pin/전량 as conflict **avoidance** (M-1).
- Treat §5.3 approve as Phase 3 **impl** authorization.
