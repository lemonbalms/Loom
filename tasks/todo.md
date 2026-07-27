# Todo — Loom

## Current — RULE-ROUTER · Phase 3.0 모델 canary n=10

> **SSOT = `HANDOFF.md`.** Cold start: `bun run status` → Current action playbook.
> HEAD at handoff write: **`8fc8748`** (may move after this handoff commit).

### Do now (next session)

- [ ] `bun test scripts/rule-router-jit.test.ts` green
- [ ] 채점·캡처 스크립트 **관측 전** 작성 + digest 고정
- [ ] 증거 디렉터리 `~/.loom/phase3-0-canary-YYYY-MM-DD/`
- [ ] **base×5** — env off · PREREG §2.3 프롬프트 축자
- [ ] **jit×5** — `LOOM_RULE_ROUTER_JIT=canary` · 동일 프롬프트
- [ ] 채점 G0 · T1/T1(b) → `docs/spikes/RULE-ROUTER-PHASE3-RESULT.md` **rev-2**
- [ ] HANDOFF 갱신 · `handoff:check` · ship
- [ ] 통과 시에만 opt-in `=1` 문서화 (**default-on 금지**)

### 절대 금지

- [ ] `RULE-ROUTER-PHASE3-PREREG.md` 사후 편집 (셀·문안·n·판정)
- [ ] `LOOM_RULE_ROUTER_JIT=1` before T1/T1(b)
- [ ] default-on · pin=회피 · 본문 하드코딩 · 10k truncate · U2 처방 · holdout 개봉
- [ ] F1*/D7 봉인값 변경

### Key coordinates

| What | Where |
|------|--------|
| PREREG | `docs/spikes/RULE-ROUTER-PHASE3-PREREG.md` |
| SPEC | `docs/spikes/RULE-ROUTER-PHASE3-SPEC.md` |
| RESULT so far | `docs/spikes/RULE-ROUTER-PHASE3-RESULT.md` rev-1 |
| Hook | `scripts/rule-router-jit.ts` |
| Tests | `scripts/rule-router-jit.test.ts` |
| Fixture | `orch.model-explicit` · sha8 `de04b1fa` |
| Harness prior | `~/.loom/f1e-poc-2026-07-27` |

### Shipped (don't redo)

- [x] P3.0 SPEC + PREREG 봉인 `bafa81f`
- [x] JIT 훅 + settings + 11 tests + stdin DELIVERED `8fc8748`
- [x] §5.3 rev-13 REVIEW + M-1 fold-in `b099733`
- [x] F1e · F1d · F1 · F1b/c · Phase 2 A · Phase 1 · NORMS P3 · Product 0.28.1
