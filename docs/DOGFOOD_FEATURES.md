# Loom 도그푸드 기능 리스트업 (`docs/DOGFOOD_FEATURES.md`)

> "지금까지 개발된 Loom을 도그푸딩"하기 위한 기능/시나리오 목록.
> `TEST_PLAN.md`의 UC 시나리오 + `PLAN`/`PRIORITIES`/`HANDOFF`/`UNKNOWNS`의 미결 작업 + 전략 지시(`LOOM_PURPOSE_REVIEW`)를 합쳐 우선순위화했다.

| 항목 | 값 |
|------|-----|
| **생성 시점** | 2026-07-11 18:48 KST |
| **기준 커밋(HEAD)** | `0ad1f66` |
| **제품 버전** | Loom **0.17.1** (approved) |
| **소스 문서** | `TEST_PLAN.md` · `docs/PLAN.md` · `docs/PRIORITIES.md` · `HANDOFF.md` · `docs/UNKNOWNS.md` · `docs/LOOM_PURPOSE_REVIEW.md` |
| **착수 순서 (결정됨)** | **Tier B 최신 기능 UC부터** (검증 공백 해소) |

---

## ⚠️ 핵심 발견 — 테스트 계획이 제품보다 4버전 뒤처짐

`TEST_PLAN.md` 기준 버전은 **0.13.12**인데 제품은 **0.17.1**. 0.14~0.17에서 shipped된 최신 기능 3개가 UC 시나리오에 없다 = 가장 버그 확률 높은 코드에 검증 시나리오가 없음.

| shipped | 기능 | UC 커버 |
|---|---|---|
| 0.14 Durable inbox | relay 재시작 생존 | ✅ UC-2.4–2.6 |
| **0.15 Purpose + `loom verify`** | purpose show/set, verify 게이트, intent 태그 | ❌ 없음 → **UC-14 신설** |
| **0.16 Work bus** | `board add --as`→notify, `loom work`/`watch` | ❌ 없음 → **UC-13 신설** |
| **0.17 Launcher UX** | `up`/`down`, auto-host on join, M-27 kill-safety | ❌ 없음 → **UC-12 신설** |

---

## Tier A — 실사용자 온보딩 차단 요소 (전략 최우선, 빌드)

> HANDOFF ⭐ = "다른 머신의 실제 사람 ≥2명 태우기". A 없이는 도그푸드가 솔로에 갇혀 구조적으로 제품 검증 불가.

| # | 항목 | 유형 | 근거 | UC |
|---|------|------|------|-----|
| A1 | **5분 설치 경로** (설치 스크립트 or 상시 relay+초대코드, `bun link` 대체) | 빌드 | LOOM_PURPOSE_REVIEW #1 | UC-0 확장 |
| A2 | **첫 5분 마찰 제거** (외부인 온보딩 마찰) | 빌드 | PRIORITIES §3 · REVIEW #2 | UC-0/1 |
| A3 | **`loom doctor` 진단** (세션/호스트/프로필 자가진단) | 빌드(선택) | PRIORITIES §3 #4 | 신규 UC |
| A4 | **수요 신호 1줄 기록** (사용자 반응 캡처) | 관찰 | REVIEW #3 | — |

## Tier B — 최신 기능 도그푸드 + UC 신설 ★ 착수 지점

> 이미 shipped됐지만 시나리오가 없어 실전 검증 미완. UC를 쓰고 도그푸드로 채운다.

| # | 항목 | 유형 | 근거 | UC |
|---|------|------|------|-----|
| B1 | **Launcher UX** (`up`/`down` 멀티프로필, auto-host on join, M-27 kill-safety, M-28 순차 처리) | 시나리오 신설 | PLAN 0.17.1 | **UC-12 신규** |
| B2 | **Work bus** (`board add --as`→handoff notify, `loom work`/`watch`) | 시나리오 신설 | PLAN 0.16.1 | **UC-13 신규** |
| B3 | **Purpose + verify** (`purpose set/show/clear`, `loom verify` 게이트 M-25, intent 태그, receive-path claim 계약) | 시나리오 신설 | PLAN 0.15.1 | **UC-14 신규** |

## Tier C — 강건성 / 열린 미지 (도그푸드 중 드러남)

| # | 항목 | 유형 | 근거 | UC |
|---|------|------|------|-----|
| C1 | **크래시 후 orphan host 정리** (`down`이 `meta.pid`로 강건) | 빌드 | UNKNOWNS §0.17.0 | UC-3/12 확장 |
| C2 | **에이전트가 stderr/handoff 배너 무시** (수신 경로 신뢰성 갭) | 조사→빌드 | UNKNOWNS §0.15.0 | UC-5 확장 |
| C3 | `dogfood:up --watch` work-watch 데몬 (opt-in, L-31 CPU clamp) | 빌드(선택) | PLAN 0.17 pillar 3 | UC-13 연계 |

## Tier D — Low 백로그 (전략 푸시 이후)

| # | 항목 | 유형 | 근거 |
|---|------|------|------|
| D1 | L-28 초대코드 충돌 처리 (현재 로그만) | 빌드 | PLAN 0.14.0 locks |
| D2 | L-29 relay 디스크 증가 / room GC (auto-GC 없음) | 빌드 | PLAN 0.14.0 locks |
| D3 | L-30 last-writer-wins purpose 잔여 (accepted) | 검토 | HANDOFF L86 |

## 명시적 비목표 (건드리지 않음)

멀티테넌시·클라우드 계정, 보드 CRDT live, PTY inject, auto-run agents, npm/Homebrew/서명 dmg, single-process multi-peer, Windows 서비스.
**예외:** A1 최소 배포는 un-defer — REVIEW가 이 유보를 자기모순으로 지적. (근거: PLAN L138–144 · PRIORITIES §6 · REVIEW)

---

## 착수 계획 — Tier B (결정됨)

최신 기능 3개(0.17/0.16/0.15)의 UC 시나리오를 `TEST_PLAN.md`에 신설하고, 도그푸드로 검증해 채운다.

| 단계 | 내용 |
|------|------|
| 1 | **UC-12 (Launcher UX)** 초안 — `up`/`down`/auto-host/kill-safety 검증 절차·기대 결과 |
| 2 | **UC-13 (Work bus)** 초안 — `board add --as`→notify, `work`/`watch` |
| 3 | **UC-14 (Purpose+verify)** 초안 — `purpose`/`verify`/intent 태그 |
| 4 | `bun run dogfood:up` 실제 구동 → UC-12/13/14 수동 실행, 결과를 TEST_PLAN "실행 기록"에 기록 |
| 5 | 발견된 C1/C2(orphan host, stderr 무시) 재현 시 스펙화 |

> 시나리오 작성 시 기존 UC 포맷(단계·기대·자동 여부, USER_GUIDE와 번호 동기) 준수.

---

## 유지관리

이 문서는 도그푸드 세션마다 갱신한다. 항목 완료 시 상태 표기, TEST_PLAN에 UC 추가되면 "UC 커버" 열 갱신. "생성 시점"과 HEAD를 함께 바꾼다.
