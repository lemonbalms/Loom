# Todo — Loom

## Current — RULE-ROUTER · Phase 3.1 T1 FAIL · SPEC 개정

> **SSOT = `HANDOFF.md`.** Evidence: `~/.loom/phase3-1-canary-2026-07-28/` · RESULT **rev-2**.

### Do now (next session)

- [ ] SPEC 개정 게이트: 준수 0 원인 가설 고정 (가시 시점 / 문안 / F1 표지 / 비경쟁 설계)
- [ ] 필요 시 소 n 스파이크 → **새 PREREG** seal (3.1 rev-1 셀 불변)
- [ ] ship live 상수 **false 유지** until T1/T1(b)
- [ ] 대안 결정: ship surface 보류 vs 재설계

### 절대 금지

- [ ] COMPLY 사후 완화 · DELIVERED만으로 ship live
- [ ] PHASE3.1-PREREG rev-1 셀 편집 후 재측정으로 “통과 만들기”
- [ ] default-on · pin JIT · 본문 하드코딩

### Key coordinates

| What | Where |
|------|--------|
| RESULT | `docs/spikes/RULE-ROUTER-PHASE3.1-RESULT.md` **rev-2** |
| PREREG (sealed) | `docs/spikes/RULE-ROUTER-PHASE3.1-PREREG.md` |
| Evidence | `~/.loom/phase3-1-canary-2026-07-28/` |
| Live gate | `PHASE3_1_SHIP_LIVE_AUTHORIZED=false` |

### Shipped (don't redo)

- [x] P3.0 T1(b) PASS
- [x] P3.1 SPEC+PREREG+impl+17 tests
- [x] **P3.1 model n=10 · G0 PASS · T1 FAIL · RESULT rev-2** (2026-07-28)
