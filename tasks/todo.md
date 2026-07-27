# Todo — Loom

## Current — RULE-ROUTER · Phase 3.0 구현 + canary

> SSOT = `HANDOFF.md`. Start: **`bun run status`**.
> 정본: `RULE-ROUTER-PHASE3-SPEC.md` · **`RULE-ROUTER-PHASE3-PREREG.md` sealed**.

### Do now

- [ ] `rule-router-select` export (eval과 단일 구현) + `rule-router-jit.ts`
      (dry-run / canary / live 분기 · pin 제외 · C3 스킵 · receipt)
- [ ] `.claude/settings.json` — model-guard **뒤**에 JIT 훅 append
- [ ] unit tests (결정론)
- [ ] PREREG 10런 canary → `RULE-ROUTER-PHASE3-RESULT.md`
- [ ] T1/T1(b)에 따른 opt-in 조건 문서화 · **default-on 금지**

### 절대 금지

- [ ] PREREG 셀·문안·n·판정 사후 변경
- [ ] `LOOM_RULE_ROUTER_JIT=1` before canary pass
- [ ] pin/전량 = 충돌 회피 · 본문 하드코딩 · 10k truncate
- [ ] 임의 토큰 · 문자열-포함 준수 · U2 처방 · holdout 개봉

### Owner pending

- [ ] 카테고리 표 · 라벨 검정력 · ISSUE cause B

### Shipped

- [x] Phase 3 착수 SPEC + PREREG 봉인 (2026-07-28)
- [x] §5.3 rev-13 REVIEW + M-1 fold-in
- [x] F1e · F1d · F1 · F1b/c · Phase 2 A · Phase 1 · NORMS P3 · 0.28.1
