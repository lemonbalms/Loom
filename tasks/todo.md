# Todo — Loom

## Current — RULE-ROUTER · F1d 규범형 준수 카나리아

> SSOT = `HANDOFF.md`. Start: **`bun run status`**.
> 근거 정본: `docs/spikes/RULE-ROUTER-PROPOSE.md` **rev-11** ·
> `RULE-ROUTER-F1-RESULT.md`(전달) · `RULE-ROUTER-F1B-RESULT.md`(준수 · **§7 = F1d 요건**).

### Do now

- [ ] **F1d 사전등록 작성 → 커밋으로 봉인** (선례 `RULE-ROUTER-F1B-PREREG.md` `49cc5e9` ·
      `RULE-ROUTER-F1C-PREREG.md` `171e063`). 요건은 `F1B-RESULT.md` **§7**
- [ ] 봉인 **후** 측정 — 하네스 재사용 `~/.loom/f1-poc-2026-07-26`
      (`proxy.py 8788` 기동 → runner → 채점). **하네스를 새로 짜지 말 것**
- [ ] 결과 문서 + PROPOSE 개정 + HANDOFF/lessons 갱신 → `handoff:check` → ship

### 절대 금지 (F1b/F1c 실증발)

- [ ] 임의 토큰 카나리아 재사용 — **그 임의성이 곧 인젝션 표지**였다(21/21 거부)
- [ ] 준수를 **문자열 포함**으로 정의 — 인용하며 거부하는 답변을 준수로 센다(위양성 14/14).
      준수는 **행동의 위치**로 정의한다
- [ ] 집계만 보고 보고 — 결함을 잡은 것은 **답변 원문 축자 감사**였다
- [ ] 봉인된 F1b/F1c 값·셀·문안 변경 · §5.3 개정 없이 Phase 3 착수

### 다음 (F1d 이후)

- [ ] **§5.3 용도 서술 개정** — Phase 3 착수 선결. F1 **C1**(`tool_result` 동봉) ·
      **C2**(서브에이전트 미도달) 반영. **설계 개정 = 리뷰 게이트, 자기 종결 금지**
- [ ] Phase 3 착수 여부 = 위 둘이 닫힌 뒤 **별도 게이트**

### Owner pending (에이전트가 못 여는 것)

- [ ] **카테고리 표 개정** (S1-3 발동 · M7a 24.2%) — 표는 **오너 선포 정본**
- [ ] **라벨 검정력** — 라우팅 가중 63% 무관측 → S3-2 미판정 유지
- [ ] **ISSUE · cause B** (claude-mem header minute ts) — root = upstream B-7;
      B-4 + `check:mem-header` 는 임시방편

### Open (not current gate)

- [ ] `smoke:uc` UC-3 상시 fail 2건 (sticky host 포트 충돌 → handoff `peer_unknown`) —
      미진단 · HEAD 동일이라 회귀 아님

### Review outcome notes (do not re-derive)

- §8 핵심 답: ①P2는 조건부(무성-deny H는 pin 기본값 · A1 반례 실증) ④G1 J-miss=0은
  contract test로 재배치, 강한-positive miss = 등급 재감사 트리거 ⑤spike 경로 확정
- Findings F1–F4 전건 처리: **F1 해소**(비차단 주입 실측) · F2 파일 digest + triage receipt ·
  F3 replay 표본추출 사전등록 · F4 G5 모니터링 강등

### Shipped (don't redo)

- [x] **F1** 비차단 주입 실측 `b6044f1` — YES · 제약 C1/C2/C3
- [x] **F1b·F1c** 준수 실측 `e788f9e` — 전달 21/21 · 준수 0/21 · 채널 가설 기각 · **도구 무효**
- [x] **Phase 2 R1** `ac9124d` — `M7b = 0` → A 채택 확정 · B/C 축 폐쇄
- [x] Phase 1 registry `26923c2` · D7 PREREG rev-4 봉인 · 카테고리 정본 `RULE-CATEGORIES.md`
- [x] RULE-ROUTER 리뷰 fold-in(rev-5) · 오너 D1–D9 전건 확정(rev-6/7)
- [x] R28 conv/inject flake · per-inject working latch · immediate fake-herdr working · awaited delta anchor
- [x] Phase D · Dashboard · Product 0.28.1 · adapter `6e2df8a`
- [x] SESSION-START rev-3 design · DELIVERY 0a–2 · `5b14012` (impl = DELIVERY only)
- [x] Handoff authoring B · WP5-followup M-1 cutover
- [x] NORMS impl-readiness **review** (prereqs met; logged in HANDOFF — not implementation)
- [x] Single/current-session routing correction · semantic Line lint
- [x] NORMS-RECEIPT exact packs · sha8 envelope · Claude measured accelerator · Codex/Grok fail-closed ritual
