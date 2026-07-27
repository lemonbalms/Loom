# HANDOFF — Loom

**Updated:** 2026-07-28
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> v0.28.1 · RULE-ROUTER **§5.3 rev-13 초안** — 충돌 회피 문안 · **spike REVIEW 요청 발행** · Phase 3 차단.

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | v0.28.1 · adapter `6e2df8a` | `docs/PLAN.md` |
| Dogfood | unblocked (p17 · 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | NORMS P3 · RULE-ROUTER **§5.3 rev-13 pending-review** | propose + REVIEW-REQUEST |
| Reuse | not proven | evidence |

## Current action

### RULE-ROUTER — spike REVIEW of propose **rev-13** (§5.3)

**Goal:** §5.3 정본 문안(충돌 탐지·회피 · 경쟁 없으면 준수 · C1–C3 · 출처 비처방)이 데이터에 맞는지 리뷰.

**Authority:** `RULE-ROUTER-PROPOSE.md` rev-13 §5.3 · `RULE-ROUTER-REVIEW-REQUEST.md` · F1E-RESULT §8 · D2=spike REVIEW.

**Now:** 리뷰 레인(claude-rev + fable-advisor)이 요청서 §3 질문 6항에 답하고 verdict 기록. 저자 자기 종결 금지.

**Line:** topology **`single`** · execution **`current-session`** · verify **`objective-commands`** · full fallback Codex→Grok→Codex

**Done when:** spike REVIEW `approve`(또는 binding 조건 + fold-in) · Phase 3 선결 해소 문안.

**Must not:** Phase 3 착수 · 출처 처방(U2 미판정) · 10/10 무조건 인용 · 봉인값 변경 · holdout 개봉 · plan_review 승격(D2).

## Active checks

| Check | Status | Impact | Evidence |
|---|---|---|---|
| NORMS Phase 3 | **done/authorized** | deterministic N packs | `norms:check` |
| Suite + typecheck | **889 pass / 0 fail · tc 6/6** · smoke durable/desktop OK · uc 기지 2건만 | no remaining tests | 2026-07-26 |
| ISSUE cause B (claude-mem ts) | **open issue** | cache ≤1min | B-7 upstream; B-4 temp |
| D7 PREREG rev-4 | **sealed** · 표본 60 동결(digest `ad74f06d`) · E1/E2/E3 assert | replay 허용 | `prereg-sample.json` |
| **Phase 2 R1** | **M7b 0 ✓ · J-miss 0 ✓ · M7a 24.2% · recall 0.451 미달** · holdout 미개봉 | **A 확정 · B/C 미구현** | `PHASE2-RESULT` |
| **F1…F1e** | 전달 YES · 준수 0/21→4/12→**10/10** · 변수=**지시 충돌** · U2 미판정 | §5.3 rev-13 입력 | F1*/RESULT |
| **§5.3 rev-13** | **초안+요청 발행** · spike REVIEW 대기 | Phase 3 차단 | PROPOSE · REVIEW-REQUEST |
| `smoke:uc` UC-3 | **상시 fail 2건** · HEAD 동일 = 회귀 아님 | 미진단 | 차집합 0 |

## Owner pending

| Decision | Why | Safe default | Evidence |
|---|---|---|---|
| **카테고리 표 개정** (S1-3) | session-start↔AGENTS standing-rules 미조인 | 현행 유지 | 결과 §4·§6 |
| **라벨 검정력** | 라우팅 가중 63% 무관측 | **S3-2 미판정 유지** | 결과 §5 |
| ISSUE cause B | autoUpdate reverts B-4 | open issue only | HOOK-CACHE design |
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
- SessionStart S = one `--part all`; N separate Claude-only measured hook.
- LOADED N = outer+all pack BEGIN/END + body · no channel omission.
- Codex N off until exact token measure; Grok ritual-only.
- Budget chars HARD_CAP 9500; owner brief = status table.
- No warm-base re-fork; p17 / PANE-DEATH U1–U11 immutable.
- RULE-ROUTER review path = **spike REVIEW** (D2), not plan_review R{n}.

## Evidence

- NORMS Phase 3 · 3팩 3657자 · `norms:check` 13 tests.
- OMX prior-art `e1f0aea`; C1–C5 unauthorized.
- Routing: `SINGLE-TOPOLOGY-EXECUTION-DESIGN` · DOGFOOD §0.5 · M-1 `9b205a6`.
- Handoff B `055d73e` · cause B `a6111e0` · DELIVERY `cc03474` · approval `5b14012`.
- Rule delivery baseline 7.8% auto-delivered (07-23).
- Phase 1 `26923c2` · registry 32 · `RULE-CATEGORIES.md`.
- F1 `b6044f1` · F1b/c `e788f9e` · F1d `c997d42` · F1e `e6e3007`.
- F1e: 10/10 · base 0/5 · refusal 0 · U2 ceiling undecided · probe `6e39658`.
- §5.3 rev-13 + `RULE-ROUTER-REVIEW-REQUEST.md` (2026-07-28).
- PREREG rev-4 sealed · Phase 2 R1 A adopted (`M7b=0`).

## Don't redo

- Re-split S into dual state/lessons hooks (cause A).
- Reapply retracted F6/P7 over DOGFOOD §0.5.
- Reopen single/full contradiction; implement MAP under NORMS auth.
- Enable Codex N from char estimates; treat Grok stdout as N delivery.
- Claim cause B closed by B-4; warm-base re-fork.
- Re-derive router problem; author-lane verdict; reopen sealed F1*/PREREG.
- Keep §5.3 "호출 직전=직접 처방" or rev-10 style prescriptions (absorbed in rev-13).
- Cite F1e 10/10 as unconditional compliance; prescribe provenance from U2.
- Self-approve rev-13 / start Phase 3 without spike REVIEW.
- Promote this gate to plan_review R{n} (D2 = spike).
