# Todo — Loom

## Current — Phase 3.3 implementation JIT

> **SSOT = `HANDOFF.md`.** `bun run status` · `check:mem-header` (expect OK).

### Done (2026-07-28)

- [x] Phase 3.2 dispatch soft live (G0+T1a)
- [x] UC-3 listen/sticky · `smoke:uc OK`
- [x] cause B local B-4 on 13.12.4 · autoUpdate false · `check:mem-header OK`
- [x] Phase 3.3 SPEC+PREREG seal — surface=implementation · fixture `agents.env` sha8 `06e68593`

### Next

- [x] 3.3 hook: `rule-router-jit` implementation 레인 + tests (30/0)
- [ ] 3.3 n=10 canary → RESULT · live gate only if T1 pass
- [ ] (later) 3.4 platform / product MINOR / optional B-7 issue

### 절대 금지

- [ ] default-on JIT · reopen sealed PREREG · live impl pre-canary
- [ ] mem upgrade without re-patch + check:mem-header
