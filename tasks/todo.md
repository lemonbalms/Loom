# Todo — Loom

## Current — RULE-ROUTER · Phase 3.0 closed · next surface

> **SSOT = `HANDOFF.md`.** Cold start: `bun run status` → Current action.
> Evidence: `~/.loom/phase3-0-canary-2026-07-28/` · RESULT **rev-2**.

### Do now (next session)

- [ ] Pick next gate: **3.1 ship surface** SPEC+PREREG **or** owner product pick
- [ ] If 3.1: seal new PREREG before any live ship-surface inject
- [ ] Keep `LOOM_RULE_ROUTER_JIT` default **off**; live=`1` is opt-in only

### 절대 금지

- [ ] `RULE-ROUTER-PHASE3-PREREG.md` 사후 편집 (셀·문안·n·판정)
- [ ] default-on JIT · claim compliance *lift* from T1(b)
- [ ] pin=회피 · 본문 하드코딩 · 10k truncate · U2 처방 · holdout 개봉
- [ ] F1*/D7/P3.0 봉인값 변경

### Key coordinates

| What | Where |
|------|--------|
| PREREG | `docs/spikes/RULE-ROUTER-PHASE3-PREREG.md` (sealed) |
| SPEC | `docs/spikes/RULE-ROUTER-PHASE3-SPEC.md` |
| RESULT | `docs/spikes/RULE-ROUTER-PHASE3-RESULT.md` **rev-2** |
| Hook | `scripts/rule-router-jit.ts` |
| Tests | `scripts/rule-router-jit.test.ts` |
| Fixture | `orch.model-explicit` · sha8 `de04b1fa` |
| Canary evidence | `~/.loom/phase3-0-canary-2026-07-28/` |

### Shipped (don't redo)

- [x] P3.0 SPEC + PREREG 봉인 `bafa81f`
- [x] JIT 훅 + settings + 11 tests + stdin DELIVERED `8fc8748`
- [x] §5.3 rev-13 REVIEW + M-1 fold-in `b099733`
- [x] **P3.0 model n=10 · G0 PASS · T1(b) PASS · RESULT rev-2** (2026-07-28)
- [x] live opt-in documented · default-on forbidden
- [x] F1e · F1d · F1 · F1b/c · Phase 2 A · Phase 1 · NORMS P3 · Product 0.28.1
