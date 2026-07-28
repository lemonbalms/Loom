# HANDOFF — Loom

**Updated:** 2026-07-28
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> v0.28.1 · P3.1b soft live + **bun-test hard guard** shipped · default-on no · next=product pick.

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | v0.28.1 · adapter `6e2df8a` | `docs/PLAN.md` |
| Dogfood | unblocked (p17 · 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | RULE-ROUTER **soft+hard ship** | BUN-TEST-ENV-HARD · 3.1b |
| Reuse | not proven | evidence |

## Current action

### RULE-ROUTER — hard guard shipped · product / next surface pick

**Done:** Path B hard guard `check-bun-test-env.ts` · Bash deny-before-jit · 8 unit tests.  
Scope: Claude Code Bash + `bun test` without relay unset → **exit 2**.  
Soft JIT still opt-in (`=1`); **unset=off**; **default-on no**.

**Next (pick):**
1. Owner product / PLAN MINOR  
2. 3.2 dispatch — new PREREG only  
3. Backlog: cause B · smoke:uc · category table  

**Line:** topology **`single`** · execution **`current-session`** · verify **`objective-commands`** · full fallback Codex→Grok→Codex

**Must not:** default-on JIT · claim global-shell hard lock · JIT exit-2 · reopen sealed PREREGs.

## Active checks

| Check | Status | Impact | Evidence |
|---|---|---|---|
| P3.0 T1(b) | PASS | delegation soft | RESULT rev-2 |
| P3.1b T1(a) | PASS | ship soft | RESULT rev-1 |
| bun-test hard guard | **shipped** | Bash deny | `check-bun-test-env.ts` |
| unit tests | **25** jit+guard | green | bun test hooks+jit |
| default-on | forbidden | — | — |
| ISSUE cause B | open | — | — |

## Owner pending

| Decision | Why | Safe default | Evidence |
|---|---|---|---|
| next product | gate clear | backlog ok | HANDOFF |
| default-on JIT | risk | **off** | — |
| 카테고리 / cause B | backlog | 현행 | — |

## Blockers

(none)

## Invariants

- Nine headings; D1 ≤8192B; traps in `tasks/traps.md`.
- Topology single/current-session/objective-commands.
- HARD_CAP 9500; status-only owner brief.
- Bash: **deny hooks before JIT**; JIT never exit 2.
- Hard guard scope = Claude Code Bash only (not all shells).
- JIT unset=off · live opt-in · default-on no.
- Isolation = absence not negation; sealed PREREGs immutable.

## Evidence

- Guard: `scripts/hooks/check-bun-test-env.ts` · settings Bash chain.  
- Doc: `docs/spikes/RULE-ROUTER-BUN-TEST-ENV-HARD.md`.  
- 3.1b canary `~/.loom/phase3-1b-canary-2026-07-28/`.  
- Soft+hard layers independent.

## Don't redo

- default-on; global H claim; soft-only as hard enforcement.  
- Put exit 2 in rule-router-jit; reopen 3.1/3.1b PREREG.  
- Probe “no standing rules” negation isolation.
