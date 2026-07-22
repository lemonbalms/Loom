# Loom 문서 인덱스 (`index.md`)

**철학 (첫 문단):** 이 인덱스는 문서 개수나 커밋 활동량을 자랑하는 표가 아니라, **지금 이 버전에서 무엇을 어떤 순서로 읽어야 하는가**의 지도다. 스테일한 날짜·옛 버전 핀이 남아 있으면 인덱스가 거짓말을 하는 것이므로, ship 시 이 파일의 메타 행을 같이 고친다.

| 항목 | 값 |
|------|-----|
| **인덱스 생성/갱신** | 2026-07-22 (docs as-built 0.28.1 wave) |
| **제품 버전** | **v0.28.1** (`approved`, R46) |
| **기준 커밋(HEAD)** | 갱신 시점 working tree — ship 후 `git rev-parse --short HEAD`로 맞출 것 |
| **다음 게이트** | Phase D automation (`HANDOFF.md`) |
| **문서 정렬 계획** | [`docs/DOC-REFRESH-PLAN.md`](./docs/DOC-REFRESH-PLAN.md) |

---

## Tier 1 — 지금 무엇을 (먼저)

| 파일 | 요약 |
|------|------|
| [`HANDOFF.md`](./HANDOFF.md) | **다음 세션 진입점.** 현재 루프·다음 액션·don't redo |
| `bun run status` | PLAN/status/open blocking 한 표 (결정론 파서) |
| [`docs/PRIORITIES.md`](./docs/PRIORITIES.md) | 단기 우선순위 1페이지 (HANDOFF와 모순 시 HANDOFF 승) |
| [`docs/CHANGELOG.md`](./docs/CHANGELOG.md) | **사용자 언어 릴리즈 노트** (0.22–0.28.1) |
| [`docs/PLAN.md`](./docs/PLAN.md) | 제품 계획 SSOT (버전·승인·Changelog — 헤더가 김) |
| [`docs/ORIGIN.md`](./docs/ORIGIN.md) | 불변 baseline (최초 설계). PLAN as-built와 대조용 |

---

## Tier 2 — 어떻게 개발·도그푸드 하는가

| 파일 | 요약 |
|------|------|
| [`AGENTS.md`](./AGENTS.md) / [`CLAUDE.md`](./CLAUDE.md) | 에이전트 세션 규칙 · 자율성 · 레인 |
| [`docs/WORKFLOW.md`](./docs/WORKFLOW.md) | Plan → Review → Implement → Ship · §5.1 R{n} |
| [`docs/DOGFOOD_LOOP.md`](./docs/DOGFOOD_LOOP.md) | 멀티에이전트 룸·프로필·claim · 레인 버전 |
| [`docs/plan_review.md`](./docs/plan_review.md) | R{n} 판정 원장 |
| [`tasks/lessons.md`](./tasks/lessons.md) · [`tasks/traps.md`](./tasks/traps.md) | 교훈 인덱스 · 활성 함정 |
| [`docs/DOC-REFRESH-PLAN.md`](./docs/DOC-REFRESH-PLAN.md) | 문서 as-built 정렬 계획 (본 웨이브) |

---

## Tier 3 — 제품을 이해·사용

| 파일 | 요약 |
|------|------|
| [`README.md`](./README.md) | 제품 소개 · 퀵스타트 |
| [`docs/USER_GUIDE.md`](./docs/USER_GUIDE.md) | 사용 사례 (핀 **v0.28.1**, §12–14 운영) |
| [`docs/PITCH.md`](./docs/PITCH.md) | 짧은 피치 |
| [`docs/GLOSSARY.md`](./docs/GLOSSARY.md) | 용어 (non-normative) |
| [`docs/TEST_PLAN.md`](./docs/TEST_PLAN.md) | UC 체크리스트 (UC-15–18 = 0.28) |
| [`docs/DRY_RUN_RUNBOOK.md`](./docs/DRY_RUN_RUNBOOK.md) | 팀 dry-run (Windows/WSL 등) |

---

## Tier 4 — 아키텍처 · 프로토콜 · as-built

| 파일 | 요약 | 권위 |
|------|------|------|
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | 패키지 + **bridge · completion authority · p17 요약** | as-built 지도 |
| [`docs/PROTOCOL.md`](./docs/PROTOCOL.md) | **relay** wire v1 only | normative (relay) |
| [`docs/ADAPTERS.md`](./docs/ADAPTERS.md) | MCP interactive + **herdr worker 축** | as-built |
| [`docs/HERDR_DESIGN.md`](./docs/HERDR_DESIGN.md) | 브릿지 **0.22 baseline** + **0.28 as-built 배너** | baseline + pointer |
| [`docs/CONV_SPEC.md`](./docs/CONV_SPEC.md) | 크로스머신 conv 스펙 | approved R24 |
| [`docs/spikes/HERDR-0.7.5-COMPAT.md`](./docs/spikes/HERDR-0.7.5-COMPAT.md) | **herdr 0.7.5 / p17 정본** | **normative (herdr)** |
| [`docs/spikes/PANE-DEATH-UNIFIED-DESIGN.md`](./docs/spikes/PANE-DEATH-UNIFIED-DESIGN.md) | 완료 권한 U1–U11 | **normative (authority)** |
| [`implementation-notes.md`](./implementation-notes.md) | plan 대비 구현 deviation | living log |

### Tier 4b — 스파이크 · 리뷰 (필요할 때)

| 파일 | 역할 |
|------|------|
| `docs/spikes/PANE-DEATH-*.md` | 관측·통합 과정 (UNIFIED가 락 정본) |
| `docs/spikes/HOOKS-SENSOR-SPIKE.md` · `AGENT-CLI-LIFECYCLE-HOOKS.md` | hooks = 센서 |
| `docs/spikes/HANDOFF-CHECKPOINT-DESIGN.md` | Phase B/C/D session continuity |
| `docs/spikes/RULE-ENFORCEABILITY.md` | 문서 규칙 vs 코드 강제 |
| `docs/reviews/HERDR-R46.md` · `PANEDEATH-R4*.md` | R{n} 원장 (archive성) |
| `docs/DOGFOOD_FEATURES.md` | **historical 0.17.1** — 현재 SSOT 아님 |

---

## Tier 5 — 메타 · 배경

| 파일 | 요약 |
|------|------|
| [`docs/PROBLEM_CONSCIOUSNESS.md`](./docs/PROBLEM_CONSCIOUSNESS.md) | 문제의식 철학 해석 (non-normative) |
| `docs/LOOM_PURPOSE_REVIEW.md` | 목적 타당성 |
| `docs/COMPETITIVE_NOTES.md` | 경쟁·hooks vs scrape |
| `docs/RENAME_TO_LOOM.md` | Fable→Loom 이력 |
| `docs/manuals/*` | 운영 매뉴얼 묶음 |
| `docs/HANDOFF_ARCHIVE.md` | 과거 세션 인계 이력 |
| `docs/plan_review_archive.md` | 옛 리뷰 아카이브 |

---

## 권장 읽기 순서

### 신규 기여자 (제품)
1. README → CHANGELOG (0.28 절) → USER_GUIDE §0 + §12–14  
2. ARCHITECTURE → ADAPTERS  
3. 손대는 표면의 COMPAT / PANE-DEATH / PROTOCOL  

### 세션 재개 (에이전트)
1. `bun run status` → HANDOFF 전문 → traps 두 섹션 → lessons 인덱스  
2. 작업 유형 lessons 카테고리 로드 → WORKFLOW 해당 절만  

### 워커/herdr 구현
1. HERDR-0.7.5-COMPAT (정본)  
2. HERDR_DESIGN as-built 배너 (본문 p16 구현 금지)  
3. ARCHITECTURE completion authority  
4. implementation-notes §0.28.x  

---

## 코드 진입점

| 위치 | 역할 |
|------|------|
| `packages/cli` | `loom` CLI |
| `packages/host` | sticky host · **bridge** · herdr client · board/pack |
| `packages/mcp-server` | MCP stdio |
| `packages/relay` · `apps/relay-cloud` | relay |
| `packages/protocol` | envelopes · card/handoff contracts |
| `packages/adapters` | interactive CLI spawn + MCP snippets |
| `scripts/` | dogfood · session-status · handoff · watch-card |
