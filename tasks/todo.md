# Todo — Loom

## Current — Loom 업그레이드 계획 (오너 지명 2026-10-15)

> **SSOT = `HANDOFF.md`.** 1단계 = PLAN §0.29.0 (R47) · 2단계 1부 = §0.30.0 (R48) · 2부 = §0.31.0 (R49) + §0.32.0 (R50) — 2단계 완료. · 3단계 1부 = §0.33.0 (R51) · 2부 = §0.34.0 (R52) · 4단계 1부 = §0.35.0 (R53) · 2부a = §0.36.0 (R54) · 3부 = §0.37.0 (R55). 단계마다 새 PLAN 버전 + R{n} 게이트 · 단계 전체 계획 = `docs/UPGRADE-PLAN.md`

1. [x] **1단계 — v0.29.0 룸 이벤트 seq + 안정 id · 멱등 수신 · 룸별 이벤트 로그 · 멱등 송신(`clientEventId`)** —
   `ae60cdb` → … → `c183c92` → PATCH 6 · 최종 리뷰 `c778d4d`. shipped.
2. [x] **2단계 — 헤드리스 워커 + 카드별 세션 + 프롬프트 주입 + 정책 + 스킬 materialize**
   - [x] **1부 — v0.30.0 헤드리스 카드 워커**(카드별 세션 · 재개/입양 · 동시성 · 타임아웃 · 정적 권한 프로필) —
     `2d1bc3b` P1 → … → `c59ced5` → PATCH 6(USER_GUIDE §15 · PROTOCOL · implementation-notes §0.30.0 · VERSION 0.30.0). Done when (a)~(i) green · (j) ship 검사.
   - [x] **2부 — 두 릴리스로 분할(범위 분할, PLAN §0.31.0 권위 고지)**
     - [x] **v0.31.0 스킬 materialize + `policy.json` v1 → CLI별 권한 번역** — `9f52ba0` P1 → … → `3f92eeb` → PATCH 5(USER_GUIDE §16 · PROTOCOL · implementation-notes §0.31.0 · VERSION 0.31.0 · 스모크 `HEADLESS-SMOKE-0310.md`). Done when (a)~(i) green · (j) ship 검사.
     - [x] **v0.32.0 Loom MCP 사전 점검** — `58f3b02` P1 → … → `f5c59ce` → `1e97aa7` 스모크 → PATCH 5(USER_GUIDE §17 · PROTOCOL · implementation-notes §0.32.0 · VERSION 0.32.0 · 스모크 `MCP-PRECHECK-SMOKE-0320.md`). Done when (a)~(i) green · (j) ship 검사.
   2단계 완료.
3. [x] **3단계 — host를 OS 서비스로** (오너 "진행해" 2026-10-16 — 3단계 전체 승인 · 두 릴리스로 분할)
   - [x] **1부 — v0.33.0 bridge 생명주기 보강** — `b8739d9` P1 → … → `236a8c1` P4 → `38933f1` P4 검증 교정 → `bb97ffd` 스모크 → PATCH 5(USER_GUIDE §18 · PROTOCOL · implementation-notes §0.33.0 · VERSION 0.33.0 · 스모크 `BRIDGE-LIFECYCLE-SMOKE-0330.md`). Done when (a)~(i) green · (j) ship 검사.
   - [x] **2부 — v0.34.0 `loom service` launchd/systemd 설치** — `b77a42f` P1 → … → `732845e` P4 → `52716ba` P3/P4 검증 교정 → `fb89d75` P4+fix 검증 교정 → `244e6a2` 스모크 → PATCH 5(USER_GUIDE §19 · PROTOCOL · implementation-notes §0.34.0 · VERSION 0.34.0 · 스모크 `SERVICE-SMOKE-0340.md`). Done when (a)~(i) green · (j) ship 검사. **라이브 스모크(`smoke:service --live`)는 오너 명시 승인 대기 — 미실행.**
   3단계 완료.
4. [ ] **4단계 — memory / rules / skills 저장소** (분할 — PLAN §0.35.0 D1 · §0.36.0 D1 · §0.37.0)
   - [x] **1부 — v0.35.0 저장소 + CLI + 순수 스냅샷 리더** (shipped `5fa8167`) — `031aea1` P1 → … → `57e2eeb` P2 검증 교정 → `2b7c9fc` P3 검증 교정 → `dd87870` P4 → `f6253c3` P4b `redact.ts` 선형화 → `c6b6ea5` P4 검증 교정 → `9e92375` 스모크 → PATCH 5(USER_GUIDE §20 · PROTOCOL · implementation-notes §0.35.0 · VERSION 0.35.0 · 스모크 `MEMORY-SMOKE-0350.md` 18/18). Done when (a)~(k). 워커·프롬프트·bridge 변경 0.
   - [x] **2부a — v0.36.0 headless 워커 카드 시작 기억 스냅샷 + 펜스 주입** (shipped `acd53a0`) — `fc1d4f6` P1 red → `35af2ec` P1 → `f66a12d`/`a869a30` P2 red → `38bf86c` P2 → `ee5fb82`/`67c2651` P3 red → `50d7a37` P3(D9) → `3b14a5f` P4 red → `feeb9e7` P4 → `a58dcba` 스모크 → PATCH 5(USER_GUIDE §20.11 · PROTOCOL · implementation-notes §0.36.0 (1)~(29) · VERSION 0.36.0 · 스모크 `MEMORY-INJECT-SMOKE-0360.md` 7/7). 기본 꺼짐 = 0.35 바이트 동일 · `ARGV_TEMPLATE_VERSION` 무변경. 완료 기준 (a) 인도. **`--real-cli` 스모크는 오너 명시 승인 대기 — 미실행.**
   - [x] **3부 — v0.37.0 정책 정직성** (shipped 2026-10-17) — `addcd52`/`ae65e42` P1 → `1ba49c2`/`cd5130c`/`af47f4d` P2 → `b16b900`/`ddecf6d`/`29bbe62`/`2e82446` P3 → `db0cbfb`/`bf010c2` P4 → `a2abb7f`/`1ca58e6` P4b → `4fd633f`/`8140c97` P4c(P3 검증 교정) → `9c0ad0e`/`00af288` P4d(Astra 0020 교정) → `f4c7073` 스모크 → `9a402e4` VERSION 0.37.0 + dist → P5c 문서(USER_GUIDE §20.12 · PROTOCOL · implementation-notes §0.37.0 (1)~(65) · 스모크 `POLICY-HONESTY-SMOKE-0370.md`). Done when (a)~(j). 스모크 source/dist 10/10 · **real-cli ① 4/4 PASS(오너 승인 1회 — R55-M2 ship 조건 충족)**. 완료 기준 (c) 인도. ship 검사 green + 최종 리뷰(loom-advisor Opus 5.5 high) = ship → (k) 체크.
   - [ ] **4부 — v0.38.0 기억 쓰기 경로**(다음 후보 — card-report 기억 후보 → `propose` · 카드 메모 `notes.md` · 스냅샷 mtime 캐시/async 리더 · 닮은 글자 표지 강화)
5. [ ] **5단계 — 프롬프트 조립** (미착수)
6. [ ] **6단계 — 히스토리 FTS + 아티팩트 CAS** (미착수 — redaction은 이 단계의 검색 인덱스 책임)
7. [ ] **7단계: 총괄 에이전트 (orchestrator agent)** — 계획·배분·결과 판정·사람 확인 지점; 제안 모드 → 승인 지점 모드 → 자율 모드.
   (확정 2026-10-16, 순서상 마지막 — 재질문 금지 · 미착수 · 설계 `docs/UPGRADE-PLAN.md`)

## Previous — owner pick next (2026-07-28, superseded by 업그레이드 계획)

> **SSOT = `HANDOFF.md`.** `bun run status` · `check:mem-header` (expect OK).

### Done (2026-07-28)

- [x] Phase 3.2 dispatch soft live (G0+T1a)
- [x] UC-3 · cause B local B-4
- [x] 3.3 · 3.4 · 3.4b canaries — T1 FAIL · live blocked
- [x] **Phase 3 soft close** — live 3.0–3.2 opt-in only (`PHASE3-SOFT-CLOSE.md`)

### Next (owner names one)

- [ ] product MINOR **or** dogfood **or** optional B-7 issue **or** P3 reopen (new SPEC)

### 절대 금지

- [ ] 3.3–3.4b remeasure · default-on JIT · live without T1(a) · silent product MINOR
- [ ] mem upgrade without re-patch + check:mem-header
