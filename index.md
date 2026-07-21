# Loom 문서 인덱스 (`index.md`)

> 도그푸딩·기능 리스트업 전에 **어떤 파일을 먼저 읽어야 하는지** 잡아주는 지도.
> 각 문서의 요약 + 최종 업데이트 시점(git 마지막 커밋 날짜) + 활동량(커밋 수)을 함께 표시한다.

| 항목 | 값 |
|------|-----|
| **인덱스 생성 시점** | 2026-07-22 (부분 갱신: GLOSSARY · SESSION-CONTINUITY 진입 순서) |
| **기준 커밋(HEAD)** | `b59bcae` — docs: add Loom project glossary |
| **최신성 기준** | "최종 업데이트" = 해당 파일의 **git 마지막 커밋 author-date**. 미추적 파일은 `mtime`으로 표기하고 ⚠️ 표시 |
| **활동량 읽는 법** | 커밋 수 = 문서의 변경 빈도. 많을수록 살아있는 SSOT, 적을수록 1회성 산출물/배경자료 |

---

## Tier 1 — 지금 무엇을 (SSOT · 로드맵 · 진입점) 🔥 먼저 읽기

| 파일 | 요약 | 최종 업데이트 | 커밋 |
|------|------|:---:|:---:|
| `HANDOFF.md` | **다음 세션 진입점.** 상단 ⭐ 블록에 즉시 할 일. 세션 시작 시 첫 참조 | 2026-07-11 | 56 |
| `docs/ORIGIN.md` | **⛔불변 baseline.** 최초 설계안(v0.1.0) 복원 + delta 추적. PLAN이 제자리 덮어써 소멸시킨 원래 여정. **로드맵을 원래 목적지와 대조할 때 필수** | 2026-07-11 | 신규 |
| `docs/PLAN.md` | **제품 로드맵 SSOT.** Multiplayer AI Terminal 마일스톤·버전(v0.20.x). ⚠️원래 설계는 `ORIGIN.md` 참조(PLAN은 as-built) | 2026-07-11 | 46 |
| `docs/PRIORITIES.md` | 우선순위 표 — 기능 리스트업의 출발점 | 2026-07-10 | 11 |
| `tasks/todo.md` | 현재 작업 목록 (0.17.0 Launcher UX 등) | 2026-07-10 | 24 |
| `docs/DOGFOOD_FEATURES.md` | **도그푸드 기능 리스트업.** TEST_PLAN UC + 미결 작업 종합, Tier A~D 우선순위. 착수=Tier B(최신 기능 UC 신설) | 2026-07-11 | 신규 |
| `docs/UNKNOWNS.md` | 미해결 미지 — "지도 ≠ 영토" (PLAN SSOT 아님, 템플릿) | 2026-07-10 | 7 |

## Tier 2 — 개발·도그푸드 규율 (어떻게 할지)

| 파일 | 요약 | 최종 업데이트 | 커밋 |
|------|------|:---:|:---:|
| `CLAUDE.md` | 코딩 에이전트 진입 규칙 · 세션 시작 의례 · 도그푸드 역할(rev/impl) | 2026-07-11 | 9 |
| `AGENTS.md` | 세션 시작 ritual · Standing rules · Autonomy | 2026-07-11 | 8 |
| `docs/WORKFLOW.md` | 워크플로 규칙 (§3.5 Unknowns 포함) | 2026-07-11 | 25 |
| `docs/DOGFOOD_LOOP.md` | **멀티에이전트 도그푸드 절차.** §0 이름 구분 + 레인 버전 핀(Grok 4.5·GPT-5.6 Sol·Fable 5·plugin v3.1.0) | 2026-07-11 | 8 |
| `docs/plan_review.md` | 리뷰 R{n} 판정 기록 (claude-rev) | 2026-07-10 | 37 |
| `tasks/lessons.md` | 에이전트 자기개선 교훈 (사용자 교정 기록) | 2026-07-11 | 3 |

## Tier 3 — 제품 이해 · UX (무엇을 만드는지)

| 파일 | 요약 | 최종 업데이트 | 커밋 |
|------|------|:---:|:---:|
| `README.md` | 프로젝트 개요 (제품명 = Loom, name: `loom`) | 2026-07-10 | 27 |
| `docs/GLOSSARY.md` | **용어·약어 안내(non-normative).** Loom/Fable·제품 handoff/세션 HANDOFF·M/R/U/G 표기·완료 권한·전달 신뢰성 용어를 쉬운 말로 구분 | 2026-07-22 | 1 |
| `docs/PITCH.md` | 제품 피치 — "connect your agents, and your teammates" | 2026-07-10 | 3 |
| `docs/USER_GUIDE.md` | 사용자 가이드 — 사용 사례로 배우기 (**§12** 오케스트레이터 CLI 전환·bridge 복구) | 2026-07-20 | 10 |
| `docs/TEST_PLAN.md` | 테스트 계획 — 사용 사례별 (도그푸드 시나리오 근거) | 2026-07-10 | 10 |

## Tier 4 — 아키텍처 · 프로토콜 (기능 구현 시)

| 파일 | 요약 | 최종 업데이트 | 커밋 |
|------|------|:---:|:---:|
| `docs/ARCHITECTURE.md` | 패키지 구조·데이터 플로우·Sticky Host IPC · **Worker observation (hooks+scrape)** | 2026-07-21 | 5 |
| `docs/PROTOCOL.md` | 통신 프로토콜 정의 | 2026-07-09 | 2 |
| `docs/ADAPTERS.md` | 어댑터 계층 (에이전트 연결) | 2026-07-09 | 2 |
| `docs/HERDR_DESIGN.md` | herdr 브릿지 설계 (카드 디스패치·pane 관제) | 2026-07-20 | 7 |
| `docs/CONV_SPEC.md` | 크로스머신 멀티턴 conv 스펙 | 2026-07-20 | 3 |
| `docs/COMPETITIVE_NOTES.md` | 경쟁 분석 · **§2.5 hooks vs 스크레이프 결정** · 멀티벤더 로드맵 5b | 2026-07-21 | 7 |
| `implementation-notes.md` | 계획 대비 구현 편차 로그 | 2026-07-09 | 11 |
| `apps/desktop/README.md` | 데스크톱 앱 (`apps/desktop`) | 2026-07-10 | 4 |
| `apps/relay-cloud/README.md` | Fable relay (remote/cloud) | 2026-07-09 | 1 |

### Tier 4b — 스파이크 · 설계 입력 팩 (`docs/spikes/`)

| 파일 | 요약 | 최종 업데이트 | 커밋 |
|------|------|:---:|:---:|
| **`docs/spikes/AGENT-CLI-LIFECYCLE-HOOKS.md`** | **설계 입력 팩.** CLI 종료·응답 매트릭스 · **§4.4.1 herdr가 Grok을 screen-only로 둔 이유** · D1–D9 | 2026-07-21 | 2 |
| `docs/spikes/HOOKS-SENSOR-SPIKE.md` | Claude hooks 보조 센서 스파이크 (0.26 선행 · 최소 배선 5단계) | 2026-07-21 | 3 |
| `docs/spikes/HOOK-CACHE-FIX-DESIGN.md` | hook 캐시 고정 설계 (웜베이스 후속) | 2026-07-20 | 2 |
| `docs/spikes/WARM-BASE-FORK-SPIKE.md` | 웜베이스 포크 스파이크 | 2026-07-20 | 1 |
| `docs/spikes/PANE-DEATH-DESIGN.md` | pane 사망 관측·종료 펜스 설계 | 2026-07-21 | 6 |
| `docs/spikes/PANE-DEATH-OBSERVATIONS.md` | pane 사망 라이브 관측 기록 | (동 계열) | — |
| `docs/spikes/PHASE-1.5-PTY.md` | PTY / stdin inject 스파이크 (no-go 계열) | 2026-07-09 | 1 |
| `docs/spikes/STEP0.5-HERDR.md` | herdr v0.7.4 실측 fixture | (동 계열) | — |

## Tier 5 — 메타 · 조사 · 배경 (필요 시 참고)

| 파일 | 요약 | 최종 업데이트 | 커밋 |
|------|------|:---:|:---:|
| `docs/LOOM_PURPOSE_REVIEW.md` | 개발 목적 타당성 검토 (전략 피벗 근거) | 2026-07-11 | 1 |
| `docs/AGENT_MEMORY_REVIEW.md` | 에이전트 메모리 도구 비교 (Hindsight·Mem0·Zep) | 2026-07-11 | 1 |
| `docs/RENAME_TO_LOOM.md` | 제품명 Fable→Loom rename 계획 (디렉터리명 잔재 관련) | 2026-07-09 | 1 |
| `docs/rename_to_loom_review.md` | 위 rename 계획 리뷰 | 2026-07-09 | 1 |
| `docs/plan_review_archive.md` | 과거 리뷰 아카이브 | 2026-07-09 | 2 |
| `docs/manuals/` (5개) | 운영 매뉴얼: coding / operating / requirements / service-planning / workflow | 2026-07-11 | 1 |
| `docs/HEALTH_STACK_TEMPLATES.md` | Health Stack 템플릿 (Rust·Python) | 2026-07-11 | 1 |
| `fable5-사용가이드.md` | Claude Fable 5 사용 가이드 | ⚠️ mtime 2026-07-11 (**미추적**) | 0 |
| `docs/SW사업_대가산정_투입공수방식_2026.md` | SW사업 대가산정 가이드 | ⚠️ mtime 2026-07-10 (**미추적**) | 0 |

---

## 코드 진입점 (제품 = `loom`)

| 위치 | 역할 |
|------|------|
| `packages/cli` | Loom CLI (`loom` 명령) |
| `packages/host` | Sticky Host (백그라운드 호스트, IPC) |
| `packages/mcp-server` | MCP 서버 (stdio) |
| `packages/relay` · `apps/relay-cloud` | relay (LAN / cloud) |
| `packages/protocol` | 프로토콜·핸드오프 계약 |
| `packages/adapters` | 에이전트 어댑터 |
| `apps/desktop` | 데스크톱 앱 |

**자주 쓰는 스크립트** (`package.json`): `bun run status` (상태), `dogfood:room`·`dogfood:up`·`dogfood:status` (도그푸드 구동), `smoke:*` (스모크), `loom` (CLI 실행), `build`·`test`·`typecheck`·`lint`.

---

## 도그푸딩·기능 리스트업 시 읽는 순서 (권장)

1. `HANDOFF.md` ⭐ 블록 → 지금 하려던 것
2. `docs/GLOSSARY.md` → 낯선 약어·내부 표현 확인(non-normative)
3. `docs/PLAN.md` + `docs/PRIORITIES.md` + `tasks/todo.md` → 후보 기능 풀
4. `docs/UNKNOWNS.md` → 미결 리스크
5. `docs/TEST_PLAN.md` + `docs/USER_GUIDE.md` → 실제 사용 시나리오(=도그푸드 대상)
6. `docs/DOGFOOD_LOOP.md` → 어떤 레인·규율로 개발할지

### hooks / 워커 관측 설계 시

1. `docs/COMPETITIVE_NOTES.md` **§2.5** — 스크레이프 교체 금지 결정
2. `docs/spikes/AGENT-CLI-LIFECYCLE-HOOKS.md` — **멀티벤더 매트릭스 · 어댑터 초안** (설계 입력)
3. `docs/spikes/HOOKS-SENSOR-SPIKE.md` — Claude 선행 배선 5단계
4. `docs/ARCHITECTURE.md` — Worker observation 절

> **유지관리:** 이 인덱스는 수기 스냅샷이다. 큰 문서 추가/삭제 시 갱신하고, "인덱스 생성 시점"과 HEAD를 함께 바꾼다. 날짜는 `git log -1 --format=%cs -- <파일>`로 재생성 가능.
