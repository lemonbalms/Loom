# Todo — Loom

## Current — next session: Phase 3.2 dispatch (owner-selected)

> **SSOT = `HANDOFF.md`.** Cold start: `bun run status` → Current action playbook.  
> Do **not** start product MINOR or cause-B unless 3.2 blocked.

### Do now (next session)

- [ ] `bun test` jit + `check-bun-test-env` green
- [ ] Inventory `surface`∋`dispatch` units · pick **1 canary fixture** + observable COMPLY
- [ ] Write `RULE-ROUTER-PHASE3.2-SPEC.md` + **`…-PREREG.md` and seal (commit) before measure**
- [ ] Define real matcher (no invented wire) · soft canary first
- [ ] Impl + tests · model canary → RESULT · dispatch live gate only if T1
- [ ] HANDOFF update · `handoff:check` · ship

### 절대 금지

- [ ] dispatch live pre-PREREG · default-on · reopen 3.0/3.1/3.1b PREREG
- [ ] probe “no standing rules” negation · JIT exit-2 · pin as 충돌 회피

### Key coordinates

| What | Where |
|------|--------|
| Order SSOT | `docs/spikes/RULE-ROUTER-PHASE3-SPEC.md` §2 |
| Lessons | PHASE3.1-SPEC-REV (H1) · BUN-TEST-ENV-HARD |
| Hook | `scripts/rule-router-jit.ts` · hard `scripts/hooks/check-bun-test-env.ts` |
| HEAD | hard guard `446bbe6` (may move) |

### Shipped (don't redo)

- [x] P3.0 T1(b) · P3.1b T1(a) · bun-test hard guard · soft live opt-in gated
