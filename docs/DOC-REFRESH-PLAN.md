# 문서 전면 정렬 계획 (0.28.1 as-built)

**철학 (첫 문단, 모든 산출물의 기준):** Loom 문서는 **게이트 통과 기록**이 아니라 **한 일을 사람이 믿을 수 있게 남기는 제품 지도**여야 한다. 프로세스 원장(PLAN 헤더·R{n}·스파이크 서사)은 풍부해도 되고, 제품 대면 문서(README·USER·ARCH·TEST·CHANGELOG)는 **지금 코드가 하는 일**과 버전이 같아야 한다. 와이어 사실의 정본은 해당 스파이크/COMPAT에 두고, 제품 문서는 그것을 **읽히는 언어로 요약·링크**한다 — 복제해 드리프트를 만들지 않는다. `card.done`·pane exit·릴레이 ACK를 완료로 미화하지 않듯, 문서도 **완료 권한 없이 장황한 서술만 늘리지 않는다.**

| Field | Value |
|-------|--------|
| **Status** | **executed** (docs-only wave, 2026-07-22) — P0 A1–A6 · P1 B1–B5 작성 완료 |
| **Product pin** | CLI **v0.28.1** · PLAN **0.28.1** `approved` · HEAD pin at ship time |
| **Scope** | P0 신뢰 복구 + P1 검증·온보딩 정렬 + P2 위생 규칙 |
| **Out of scope** | product/card/relay/conv/herdr 코드 변경 · Phase D automation · ROADMAP/Phase E |
| **Related** | `docs/CHANGELOG.md` · `docs/ARCHITECTURE.md` · `docs/USER_GUIDE.md` · `docs/HERDR_DESIGN.md` · `index.md` · `docs/TEST_PLAN.md` · `docs/PRIORITIES.md` · `docs/ADAPTERS.md` · `docs/GLOSSARY.md` · `docs/PROTOCOL.md` · `docs/DOGFOOD_FEATURES.md` |

---

## 0. 문제 정의 (감사 결론 요약)

| 증상 | 원인 | 목표 상태 |
|------|------|-----------|
| “한 일 대비 문서가 빈약” | 프로세스 문서 **과잉** · 제품 문서 **스테일** | 제품 문서가 0.28.1 as-built를 반영 |
| HERDR_DESIGN이 0.22/p16 세계 | ship 시 제품 문서 동기 의무 없음 | as-built 배너 + COMPAT 정본 링크 |
| TEST_PLAN v0.13.3 | UC가 room 시대에 고정 | 0.28.1 핀 + PANE/p17 UC |
| CHANGELOG 없음 | 릴리즈가 git log에만 존재 | 사용자 언어 릴리즈 노트 |
| index.md 스테일 | 지도 자동 갱신 없음 | HEAD·버전·Tier 재생성 |

---

## 1. 단계 로드맵

```
Phase A (P0)  신뢰 복구 — 틀리면 구현/운영이 틀린다
  A1 CHANGELOG
  A2 ARCHITECTURE (bridge / authority / p17)
  A3 HERDR_DESIGN as-built banner
  A4 USER_GUIDE 버전·개념·§12
  A5 index.md 재생성
  A6 PROTOCOL rename residual

Phase B (P1)  검증·온보딩 정렬
  B1 TEST_PLAN 0.28.1 + UC-PANE / UC-P17 / UC-TOWER …
  B2 ADAPTERS herdr 실행 축
  B3 PRIORITIES 1페이지 재작성
  B4 GLOSSARY 0.28 항목
  B5 DOGFOOD_FEATURES historical 마킹 + 포인터

Phase C (P2)  위생·재발 방지 (규칙만; 이번 웨이브에 문안 고정)
  C1 ship 시 docs sync gate 문안
  C2 PLAN Status 칸 길이 규율
  C3 package 0.1.0 vs PLAN 버전 이중성 고지
  C4 spikes normative vs archive 라벨 규칙
```

각 항목 상세 스펙은 §2–§4. **완료 정의(DoD)** 는 항목마다 “읽기 테스트” 한 줄을 포함한다.

---

## 2. Phase A — P0 상세 스펙

### A1 · `docs/CHANGELOG.md` (신규)

| | |
|--|--|
| **목적** | 0.22–0.28.1에서 **사용자가 체감하는 변화**를 git/R{n} 없이 읽게 한다 |
| **첫 문단** | 철학: 릴리즈 노트는 게이트 서사가 아니라 **무엇이 가능해졌고 무엇이 금지됐는지** |
| **필수 섹션** | 0.28.1 · 0.28.0 · 0.27.0 · 0.26–0.22 묶음 · 문서 정본 링크 표 |
| **쓰지 말 것** | R43e 라운드 전개, Medium 목록 복제, 커밋 해시 나열(대표 2–3개만) |
| **DoD** | 신규 기여자가 CHANGELOG만 읽고 “원격 done ≠ board done”과 “p17 agent.prompt”를 말할 수 있다 |

### A2 · `docs/ARCHITECTURE.md` (확장)

| | |
|--|--|
| **목적** | room+MCP 반쪽 지도를 **tower · bridge · herdr · completion authority**까지 확장 |
| **첫 문단** | 철학: 아키텍처 문서는 패키지 목록이 아니라 **권한과 데이터 경로**의 지도 |
| **추가 절** | Components에 bridge · Node bridge data flow · Completion authority · Herdr p17 call graph · Doc authority map |
| **보존** | 기존 Phase 4.x room/host/pack/board 흐름 |
| **DoD** | ARCH만 읽고 “누가 board done을 쓸 수 있는지” 답이 나온다 |

### A3 · `docs/HERDR_DESIGN.md` (배너 + obsolete)

| | |
|--|--|
| **목적** | 0.22 본문을 지우지 않고 **거짓 최신**을 끊는다 |
| **첫 문단(배너)** | 철학: baseline 설계는 보존하되 **as-built 정본은 버전 핀 문서**에 있다 |
| **필수** | Status 표 갱신 · As-built 0.28.0/0.28.1 표 · `agent.send` 경로 obsolete · COMPAT 링크 |
| **DoD** | 상단 30줄만 읽어도 p16 본문을 그대로 구현하지 않는다 |

### A4 · `docs/USER_GUIDE.md`

| | |
|--|--|
| **목적** | 운영자 신뢰 복구 — 헤더 버전 + 완료 권한 + herdr 0.7.5 운영 규칙 |
| **첫 문단** | 철학: 가이드는 **할 수 있는 일**과 **완료로 착각하면 안 되는 신호**를 같이 가르친다 |
| **필수** | 버전 v0.28.1 · §0.2 개념 확장 · 시나리오 표 +13–15 · §12.8 완료 권한 · §15 갱신 |
| **DoD** | “card.done 오면 board done?” → 가이드가 아니오라고 답한다 |

### A5 · `index.md`

| | |
|--|--|
| **목적** | 문서 지도 SSOT 복구 |
| **첫 문단** | 철학: 인덱스는 활동량 자랑이 아니라 **지금 읽을 순서** |
| **필수** | HEAD/버전 핀 · Tier 재배치 · CHANGELOG/COMPAT/PANE 정본 · 스테일 날짜 제거 |
| **DoD** | index만 보고 0.28.1 정본 3개를 가리킬 수 있다 |

### A6 · `docs/PROTOCOL.md`

| | |
|--|--|
| **목적** | rename residual 제거 + 범위 고지 |
| **첫 문단** | 철학: 이 문서는 **relay wire v1**만 다룬다 — herdr RPC는 COMPAT |
| **필수** | `fable` CLI 예시 → `loom` · herdr 비범위 한 줄 |
| **DoD** | 문서에 제품 CLI 이름 `fable` 명령 예시 0건 |

---

## 3. Phase B — P1 상세 스펙

### B1 · `docs/TEST_PLAN.md`

| | |
|--|--|
| **목적** | 검증 체크리스트를 제품 버전에 맞춤 |
| **첫 문단** | 철학: 테스트 계획은 **릴리즈가 주장하는 행동**의 반증 목록이다 |
| **필수** | 기준 v0.28.1 · UC-13~16 (PANE / P17 / TOWER / IDENTITY) · 릴리스 게이트에 dogfood:herdr(환경 있을 때) |
| **DoD** | 0.28 회귀 시 어떤 UC를 돌릴지 표에서 고를 수 있다 |

### B2 · `docs/ADAPTERS.md`

| | |
|--|--|
| **목적** | MCP 스폰 축과 **herdr 워커 축**을 한 문서에서 구분 |
| **첫 문단** | 철학: 어댑터는 에이전트를 재구현하지 않고 **연결 계약**만 갖는다 |
| **필수** | Two surfaces 표 · p17 시퀀스 · named target · 중복 제출 방지 요약 · COMPAT 링크 |
| **DoD** | ADAPTERS만으로 `loom run` vs bridge pane 차이를 설명할 수 있다 |

### B3 · `docs/PRIORITIES.md`

| | |
|--|--|
| **목적** | “지금 무엇을” 1페이지 SSOT |
| **첫 문단** | 철학: 우선순위는 백로그 회고가 아니라 **다음 검증 가능한 한 수** |
| **필수** | MVP done · 현재 harness Phase D · 제품 다음 트랙 · owner pending · don’t redo |
| **DoD** | PRIORITIES와 HANDOFF next action이 모순되지 않는다 |

### B4 · `docs/GLOSSARY.md`

| | |
|--|--|
| **목적** | 0.28 용어를 쉬운 말로 |
| **추가** | protocol 17 · `agent.prompt` · `HERDR_PROTOCOL_EXPECTED` · completion authority · `blocked`(remote result) · reinject 4절 · collision-free agent name |
| **DoD** | 용어집만으로 “config-only 17”이 왜 금지인지 말할 수 있다 |

### B5 · `docs/DOGFOOD_FEATURES.md`

| | |
|--|--|
| **목적** | 0.17 스냅샷을 역사로 표시하고 현재 포인터 제공 |
| **필수** | Historical banner · 현재 = CHANGELOG + USER + TEST + DOGFOOD_LOOP |
| **DoD** | 문서 상단이 “지금 기능 리스트”로 오독되지 않는다 |

---

## 4. Phase C — P2 위생 규칙 (문안 고정)

1. **Ship docs sync gate:** 제품 표면 변경 시 CHANGELOG + (해당 시) USER/ARCH/TEST 중 최소 한 표면 갱신. 게이트-only 문서는 예외 아님.
2. **PLAN Status 칸:** 승인 요약 ≤ ~20줄 권장; 라운드 전개는 `docs/reviews/` · Changelog.
3. **버전 이중성:** npm package `0.1.0` = 워크스페이스 플레이스홀더; **제품 버전 = PLAN/CLI banner**. 문서 헤더는 PLAN/CLI를 쓴다.
4. **Normative vs archive:** COMPAT·PANE-DEATH-UNIFIED·CONV_SPEC = 정본 후보; R{n} 원장·OBSERVATIONS = 이력. index Tier에 표시.

---

## 5. 실행 순서 (의존)

```
A1 CHANGELOG  ──┬──► A4 USER (링크)
A2 ARCH       ──┤
A3 HERDR      ──┼──► A5 index (전부 링크)
A6 PROTOCOL   ──┘
B2 ADAPTERS · B1 TEST · B3 PRIORITIES · B4 GLOSSARY · B5 DOGFOOD  (A 이후 병렬 가능)
→ HANDOFF 한 줄 반영 · commit/push
```

---

## 6. 완료 게이트 (웨이브)

- [x] 이 계획의 A1–A6 · B1–B5 파일 존재·갱신
- [x] 제품 문서 헤더 버전이 0.28.1과 모순 없음 (TEST/USER/CHANGELOG/index)
- [x] HERDR_DESIGN 상단이 p17 정본을 가리킴
- [x] PROTOCOL에 `fable` CLI 예시 없음
- [x] 철학 첫 문단: 계획서 + CHANGELOG/ARCH/USER/HERDR/PROTOCOL/TEST/ADAPTERS/PRIORITIES/GLOSSARY/DOGFOOD/index
- [ ] `bun run status` 정상 (docs-only; 코드 무변경) — ship 전 확인

---

## 7. 산출물 체크리스트

| ID | 파일 | Phase |
|----|------|-------|
| A1 | `docs/CHANGELOG.md` | P0 |
| A2 | `docs/ARCHITECTURE.md` | P0 |
| A3 | `docs/HERDR_DESIGN.md` | P0 |
| A4 | `docs/USER_GUIDE.md` | P0 |
| A5 | `index.md` | P0 |
| A6 | `docs/PROTOCOL.md` | P0 |
| B1 | `docs/TEST_PLAN.md` | P1 |
| B2 | `docs/ADAPTERS.md` | P1 |
| B3 | `docs/PRIORITIES.md` | P1 |
| B4 | `docs/GLOSSARY.md` | P1 |
| B5 | `docs/DOGFOOD_FEATURES.md` | P1 |
| — | `docs/DOC-REFRESH-PLAN.md` (본 파일) | plan SSOT |
