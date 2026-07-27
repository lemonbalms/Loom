# Todo — Loom

## Current — RULE-ROUTER · Phase 3.0 모델 canary n=10

> SSOT = `HANDOFF.md`. PREREG sealed · 훅 착수 완료 · **live=1 금지**.

### Do now

- [ ] PREREG base 5 + jit 5 모델 런 (F1 동형 하네스 또는 live Claude)
- [ ] 채점 → `RULE-ROUTER-PHASE3-RESULT` **rev-2** (T1/T1(b))
- [ ] 통과 시에만 opt-in `LOOM_RULE_ROUTER_JIT=1` 문서화

### 절대 금지

- [ ] PREREG 사후 변경 · live=1 before pass · default-on
- [ ] pin=회피 · 본문 하드코딩 · 10k truncate · U2 처방

### Shipped

- [x] P3.0 SPEC + PREREG 봉인 `bafa81f`
- [x] `rule-router-jit` + tests + settings · RESULT rev-1 (model pending)
- [x] §5.3 REVIEW · F1e… · Phase 2 A · NORMS · 0.28.1
