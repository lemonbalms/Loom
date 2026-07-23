# Propose — Handoff 확인·작성 최적화

| Field | Value |
|---|---|
| **Status** | proposed for next session |
| **Date** | 2026-07-23 |
| **Depends on** | inject ops shipped (`b935969` · `SESSION-INJECT-VIEW-DESIGN.md`) |
| **Does not** | product packages · WP5 warm-base re-fork · Phase E |

## Problem

1. **확인(오너):** “핸드오프 확인해” 응답이 해시·숫자 암호가 되기 쉬움. 권고는 `bun run status` 표 + 짧은 해석인데 에이전트가 inject 메트릭으로 대체함.
2. **작성:** 9축·One-line≤120·STATE_TARGET·`handoff:check`는 있음. 작성 중 섹션별 기여·“이 편집이 omit을 만드는지” 피드백이 약함.
3. **이중 채널 혼동:** inject(에이전트) vs status 표(오너)를 한 응답에 섞음.

## Goal (next session)

**확인 경로와 작성 경로를 분리·강화**하되, 9축 모델·view≠model 전제는 유지.

## Options (propose)

| ID | Option | Effort | Effect | Risk |
|----|--------|--------|--------|------|
| **A** | **확인 템플릿 고정** — AGENTS/status 응답 스키마: status 표 + Gate/Done/Must not 3줄 + `handoff:check` 한 줄. 메트릭은 접힘/요청 시만 | S | 오너 가독성↑ | 낮음 |
| **B** | **작성 도우미** — `bun run handoff:budget` (또는 session-context:lint 요약) + 섹션 템플릿 스니펫 in `docs/` or script | M | 작성 실수↓ | 낮음 |
| **C** | **편집 중 프리뷰** — watch/pre-commit이 아님; `handoff:check`를 commit 웨이브 필수만 강화 (이미 AGENTS) | S | 프로세스 | 낮음 |
| **D** | status Health 확장·대시보드 2열 | M | 중복 뷰 위험 | 중 — **비권장** 1차 |

**Recommended:** **A → B** (C는 A/B에 포함). D 보류.

## Done when

- [ ] “핸드오프 확인해” 시 오너 응답 = status 표 + 게이트 요약 (전문 inject/해시 나열 아님)
- [ ] 작성 후 `bun run handoff:check` green · inject `omitted:(none)` · raw ≤ STATE_TARGET preferred
- [ ] 작성 가이드 1곳 SSOT (`SESSION-INJECT-VIEW-DESIGN` 또는 짧은 `HANDOFF-AUTHORING.md`)에 확인/작성 체크리스트
- [ ] HANDOFF 자체 9축 dense · One-line ≤120 · lint 0

## Must not

- permanent slim-delete of nine axes
- second status table schema
- product/herdr/card scope
- silent mid-section state cut

## First commands (next agent)

```bash
bun run status
bun run handoff:check
# then implement A then B; tests if scripts; docs; commit/push
```
