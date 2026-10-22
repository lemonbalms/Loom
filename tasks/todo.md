# Todo — Loom

## Current — Loom 업그레이드 계획 (오너 지명 2026-10-15)

> **SSOT = `HANDOFF.md`.** 1단계 = PLAN §0.29.0 (R47) · 2단계 1부 = §0.30.0 (R48) · 2부 = §0.31.0 (R49) + §0.32.0 (R50) — 2단계 완료. · 3단계 1부 = §0.33.0 (R51) · 2부 = §0.34.0 (R52) · 4단계 1부 = §0.35.0 (R53) · 2부a = §0.36.0 (R54) · 3부 = §0.37.0 (R55) · 4부 = §0.38.0 (R56). 단계마다 새 PLAN 버전 + R{n} 게이트 · 단계 전체 계획 = `docs/UPGRADE-PLAN.md`

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
4. [x] **4단계 — memory / rules / skills 저장소** (분할 — PLAN §0.35.0 D1 · §0.36.0 D1 · §0.37.0)
   - [x] **1부 — v0.35.0 저장소 + CLI + 순수 스냅샷 리더** (shipped `5fa8167`) — `031aea1` P1 → … → `57e2eeb` P2 검증 교정 → `2b7c9fc` P3 검증 교정 → `dd87870` P4 → `f6253c3` P4b `redact.ts` 선형화 → `c6b6ea5` P4 검증 교정 → `9e92375` 스모크 → PATCH 5(USER_GUIDE §20 · PROTOCOL · implementation-notes §0.35.0 · VERSION 0.35.0 · 스모크 `MEMORY-SMOKE-0350.md` 18/18). Done when (a)~(k). 워커·프롬프트·bridge 변경 0.
   - [x] **2부a — v0.36.0 headless 워커 카드 시작 기억 스냅샷 + 펜스 주입** (shipped `acd53a0`) — `fc1d4f6` P1 red → `35af2ec` P1 → `f66a12d`/`a869a30` P2 red → `38bf86c` P2 → `ee5fb82`/`67c2651` P3 red → `50d7a37` P3(D9) → `3b14a5f` P4 red → `feeb9e7` P4 → `a58dcba` 스모크 → PATCH 5(USER_GUIDE §20.11 · PROTOCOL · implementation-notes §0.36.0 (1)~(29) · VERSION 0.36.0 · 스모크 `MEMORY-INJECT-SMOKE-0360.md` 7/7). 기본 꺼짐 = 0.35 바이트 동일 · `ARGV_TEMPLATE_VERSION` 무변경. 완료 기준 (a) 인도. **`--real-cli` 스모크는 오너 명시 승인 대기 — 미실행.**
   - [x] **3부 — v0.37.0 정책 정직성** (shipped 2026-10-17) — `addcd52`/`ae65e42` P1 → `1ba49c2`/`cd5130c`/`af47f4d` P2 → `b16b900`/`ddecf6d`/`29bbe62`/`2e82446` P3 → `db0cbfb`/`bf010c2` P4 → `a2abb7f`/`1ca58e6` P4b → `4fd633f`/`8140c97` P4c(P3 검증 교정) → `9c0ad0e`/`00af288` P4d(Astra 0020 교정) → `f4c7073` 스모크 → `9a402e4` VERSION 0.37.0 + dist → P5c 문서(USER_GUIDE §20.12 · PROTOCOL · implementation-notes §0.37.0 (1)~(65) · 스모크 `POLICY-HONESTY-SMOKE-0370.md`). Done when (a)~(j). 스모크 source/dist 10/10 · **real-cli ① 4/4 PASS(오너 승인 1회 — R55-M2 ship 조건 충족)**. 완료 기준 (c) 인도. ship 검사 green + 최종 리뷰(loom-advisor Opus 5.5 high) = ship → (k) 체크.
   - [x] **4부 — v0.38.0 기억 쓰기 경로** (shipped `2b75ae3`) → 후속 **v0.39.0** codex 스킬 읽기 hint 예외(shipped `11e909a`) → **v0.40.0** 표지 흉내 접기 강화 · R8 · 헤드리스 카드 본문 무력화 · 스킬 이름/조립 항목 판정(shipped 2026-10-18 · R59 · implementation-notes §0.40.0).
   4단계 완료.
5. [ ] **5단계 — 프롬프트 조립** — 1부 v0.41.0 관측(기록 + `loom prompt show`) shipped 2026-10-18 · 2부 v0.42.0 섹션 manifest(바이트 보존) + 기록 v2 shipped 2026-10-18 · 3부 v0.43.0 의미 이동 슬라이스 A(시스템 섹션 여섯 · 기록 v3 · drain) shipped 2026-10-18(오너 승인 실 CLI D7 PASS — `MEMORY-WRITE-SMOKE-0430.md`) · 다음 = 오너 선택(슬라이스 B/C는 0.43 관찰 뒤 별도 PLAN)
6. [ ] **6단계 — 히스토리 FTS + 아티팩트 CAS** — 1부 v0.44.0 `loom history search`(방 이벤트 기록 읽기 전용 선형 검색 · 보여 주기 전 가리기 · 실 CLI 불필요 D9) shipped 2026-10-18(verify 0148 PASS-with-lows · advise 0149 FIX-FIRST 문서 → ship 커밋 · 스위트 4134/0) · 다음 = 오너 선택(2부 artifact CAS + `index.jsonl` → MCP `search_history`/`list_artifacts` → SQLite FTS)
   - [x] **끼어든 PATCH — v0.44.1 relay 재연결 무포기**(R65 · shipped 2026-10-18 · P1 `6fe5c20`/`3873b12` · P1b `bbbfa83`/`4a16e5d` · verify 0164 FAIL → 0166 PASS · 실 CLI 불필요 D7) · 다음 = MBP 2015 relay 설정(오너 — 장비는 **Linux**(`mbp2015-bot`) · systemd 시스템 유닛 · logind 덮개/절전 해제 · `relay-state` 이전 · `LOOM_RELAY_URL` 전환) + 로컬 main 0.45.0 rebase(완료 — `9d3914b` 위)
   - [x] **2부 — v0.45.0 산출물 저장소 첫 조각**(R64 · `conv_fetch` 성공 뒤 하드링크 담기 · `loom artifacts list|verify` · 실 CLI 불필요 D9) — shipped 2026-10-18: P1 `d33389e`/`11a257e`/`54a6a20` · P1b `e729eaa`/`50db887` · P1c `6a49129`/`6e1da4b`(담기 unlink 없음) · P2 `e775ad6`/`aed94cf`/`802efc7` · P2b `a68a456`/`7a47432` · P3 `2662167`/`0af580f` · P3b `f0685cc`/`7233d64` · P3c `cb6b83f`/`bd2f927` · P4 dist 테스트 4/0 · VERSION 0.45.0 · 문서 · 계급 82~89 재번호 · 스위트 4277/0 · verify 0180 · 0183 PASS · advise 0182 = ship(Low 이월 — `artifact-store.ts:574` 접두 심볼릭 링크 건너뜀) · dist `e640227`
   - [x] **끼어든 PATCH — v0.45.1 이월 결함 둘**(R66 approved-with-fixes · no R66b · 실 CLI 불필요 D3) — shipped 2026-10-18: 게이트 `0005173` · P1 `eeca264`/`50954a2`(verify `<2 hex>` 접두 심볼릭 링크 · 디렉터리 아님 → exit 2) · P2 `806acec`/`56c5f53`(pack 원시 바이트 해시 · 계급 89 closed · 0.45.0 UK-4 closed) · P2b `ed193f5`(Astra 0192 Low 둘 · 테스트만) · P3 문서 · VERSION 0.45.1 · 스위트 4284/0 · verify 0190 · 0192 · 0196 PASS · advise 0195 = ship · dist `f26f107`
   - [x] **끼어든 PATCH — v0.45.2 relay bind 메시지**(author-close Low · 실 CLI 불필요 D4) — shipped 2026-10-23: 미할당 리터럴 IP bind 실패 = "not assigned to any network interface" 문면(진짜 포트 충돌은 원문 — 예외: probe가 무관한 이유로 실패 + 목록에 없지만 bind되는 주소 · P1d probe + 인터페이스 대조) · `server.bind-error.test.ts` 22/0 + Linux 전용 1 skip · VERSION 0.45.2 · 스위트 4306/0 · Astra 0203 · 0205 · 0207 FAIL → P1b · P1c · P1d · 0209 PASS-with-lows · advise 0210 = ship · dist `5d1b8db`
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
