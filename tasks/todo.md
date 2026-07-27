# Todo — Loom

## Current — RULE-ROUTER · Phase 3.1 모델 canary n=10

> **SSOT = `HANDOFF.md`.** Cold start: `bun run status` → Current action playbook.

### Do now (next session)

- [ ] `bun test scripts/rule-router-jit.test.ts` green (17)
- [ ] 채점·캡처 스크립트 **관측 전** + digest 고정
- [ ] 증거 `~/.loom/phase3-1-canary-YYYY-MM-DD/`
- [ ] **base×5** / **jit×5** — PREREG §4 2-step 프롬프트 축자
- [ ] 채점 G0 · T1/T1(b) → `PHASE3.1-RESULT` **rev-2**
- [ ] 통과 시에만 `PHASE3_1_SHIP_LIVE_AUTHORIZED` 검토 · HANDOFF · ship

### 절대 금지

- [ ] `RULE-ROUTER-PHASE3.1-PREREG.md` 사후 편집
- [ ] ship live before T1 · default-on · pin JIT · 본문 하드코딩
- [ ] 3.0/F1* 봉인값 변경 · C1 “그 호출 교정” 주장

### Key coordinates

| What | Where |
|------|--------|
| PREREG | `docs/spikes/RULE-ROUTER-PHASE3.1-PREREG.md` |
| SPEC | `docs/spikes/RULE-ROUTER-PHASE3.1-SPEC.md` |
| RESULT | `docs/spikes/RULE-ROUTER-PHASE3.1-RESULT.md` rev-1 |
| Hook | `scripts/rule-router-jit.ts` |
| Fixture | `traps.bun-test-env` · sha8 `1172cf30` |
| 3.0 evidence | `~/.loom/phase3-0-canary-2026-07-28` |

### Shipped (don't redo)

- [x] P3.0 T1(b) PASS · RESULT rev-2 · `97dca86`
- [x] P3.1 SPEC + PREREG + ship lane impl + 17 tests + stdin DELIVERED
- [x] F1e · F1d · F1 · Phase 2 A · NORMS P3 · Product 0.28.1
