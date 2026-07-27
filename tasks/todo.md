# Todo — Loom

## Current — RULE-ROUTER · spike REVIEW of §5.3 rev-13

> SSOT = `HANDOFF.md`. Start: **`bun run status`**.
> 근거 정본: `docs/spikes/RULE-ROUTER-PROPOSE.md` **rev-13** ·
> `RULE-ROUTER-REVIEW-REQUEST.md` · F1E-RESULT §8.

### Do now

- [ ] **spike REVIEW of propose rev-13** (§5.3) — claude-rev + **fable-advisor 필수**
      · 요청서 §3 질문 6항 · 산출 `RULE-ROUTER-REVIEW-rev-13.md`(또는 동등)
- [ ] 조건부 approve면 축자 fold-in → 재리뷰 여부 리뷰어 명시에 따름
- [ ] **승인 후에만** Phase 3 착수 여부 별도 게이트

### 절대 금지

- [ ] Phase 3 착수 (rev-13 승인 전)
- [ ] 출처·근거 표기 처방 (U2 미판정)
- [ ] F1e 10/10을 무조건 준수율로 인용
- [ ] 봉인된 F1b/F1c/F1d/F1e 값·셀·문안 변경 · holdout 개봉
- [ ] 임의 토큰 카나리아 · 문자열-포함 준수 정의
- [ ] plan_review R{n}으로 경로 승격 (D2 = spike REVIEW)
- [ ] 저자 자기 종결(self-approve)

### Owner pending (에이전트가 못 여는 것)

- [ ] **카테고리 표 개정** (S1-3 발동 · M7a 24.2%) — 표는 **오너 선포 정본**
- [ ] **라벨 검정력** — 라우팅 가중 63% 무관측 → S3-2 미판정 유지
- [ ] **ISSUE · cause B** (claude-mem header minute ts) — root = upstream B-7;
      B-4 + `check:mem-header` 는 임시방편

### Open (not current gate)

- [ ] `smoke:uc` UC-3 상시 fail 2건 (sticky host 포트 충돌 → handoff `peer_unknown`) —
      미진단 · HEAD 동일이라 회귀 아님

### Shipped (don't redo)

- [x] **§5.3 rev-13 초안 + REVIEW-REQUEST** (2026-07-28) — F1e 충돌 변수 반영
- [x] **F1e** 준수 10/10 · 충돌 제거 변수 확정 `e6e3007`
- [x] **F1d** 준수 가능 4/12 `c997d42`
- [x] **F1** 비차단 주입 `b6044f1` — YES · C1/C2/C3
- [x] **F1b·F1c** 준수 0/21 · 채널 가설 기각 · 도구 무효 `e788f9e`
- [x] **Phase 2 R1** `ac9124d` — `M7b = 0` → A 채택 · B/C 축 폐쇄
- [x] Phase 1 registry `26923c2` · D7 PREREG rev-4 봉인 · `RULE-CATEGORIES.md`
- [x] RULE-ROUTER 리뷰 fold-in(rev-5) · 오너 D1–D9 전건 확정
- [x] Phase D · Dashboard · Product 0.28.1 · adapter `6e2df8a`
- [x] NORMS Phase 3 · Single/current-session routing correction
