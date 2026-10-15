# Todo — Loom

## Current — Loom 업그레이드 계획 (오너 지명 2026-10-15)

> **SSOT = `HANDOFF.md`.** 1단계 = PLAN §0.29.0 (R47) · 2단계 1부 = §0.30.0 (R48) · 2부 = §0.31.0 (R49) shipped + v0.32.0 후보. 단계마다 새 PLAN 버전 + R{n} 게이트.

1. [x] **1단계 — v0.29.0 룸 이벤트 seq + 안정 id · 멱등 수신 · 룸별 이벤트 로그 · 멱등 송신(`clientEventId`)** —
   `ae60cdb` → … → `c183c92` → PATCH 6 · 최종 리뷰 `c778d4d`. shipped.
2. [ ] **2단계 — 헤드리스 워커 + 카드별 세션 + 프롬프트 주입 + 정책 + 스킬 materialize**
   - [x] **1부 — v0.30.0 헤드리스 카드 워커**(카드별 세션 · 재개/입양 · 동시성 · 타임아웃 · 정적 권한 프로필) —
     `2d1bc3b` P1 → … → `c59ced5` → PATCH 6(USER_GUIDE §15 · PROTOCOL · implementation-notes §0.30.0 · VERSION 0.30.0). Done when (a)~(i) green · (j) ship 검사.
   - [ ] **2부 — 두 릴리스로 분할(범위 분할, PLAN §0.31.0 권위 고지)**
     - [x] **v0.31.0 스킬 materialize + `policy.json` v1 → CLI별 권한 번역** — `9f52ba0` P1 → … → `3f92eeb` → PATCH 5(USER_GUIDE §16 · PROTOCOL · implementation-notes §0.31.0 · VERSION 0.31.0 · 스모크 `HEADLESS-SMOKE-0310.md`). Done when (a)~(i) green · (j) ship 검사.
     - [ ] **v0.32.0 — MCP 사전 점검** (**다음** — 오너 지명 후 PLAN MINOR + R{n} · 이월 근거: 헤드리스 워커 Loom MCP 없음 · 호출자는 대화형 pane뿐 · 완료 권위 구조적 = §0.30.0 D13)
3. [ ] **3단계 — host를 OS 서비스로** (미착수)
4. [ ] **4단계 — memory / rules / skills 저장소** (미착수)
5. [ ] **5단계 — 프롬프트 조립** (미착수)
6. [ ] **6단계 — 히스토리 FTS + 아티팩트 CAS** (미착수 — redaction은 이 단계의 검색 인덱스 책임)
7. [ ] **7단계: 총괄 에이전트 (orchestrator agent)** — 계획·배분·결과 판정·사람 확인 지점; 제안 모드 → 승인 지점 모드 → 자율 모드.
   (후보 — 오너 확인 대기 · 미착수)

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
