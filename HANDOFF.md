# HANDOFF — Loom

**Updated:** 2026-07-28
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> v0.28.1 · P3.1b **T1(a) PASS** · ship soft live opt-in · default-on no · next=hard-guard or product.

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | v0.28.1 · adapter `6e2df8a` | `docs/PLAN.md` |
| Dogfood | unblocked (p17 · 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | RULE-ROUTER **P3.0+P3.1b soft live ok** | PHASE3.1b-RESULT |
| Reuse | not proven | evidence |

## Current action

### RULE-ROUTER — Phase 3.1b closed · optional hard-guard / product pick

**Done:** 3.1b n=10 · G0 PASS · T1(a) PASS (base COMPLY 0/5 · jit **5/5**).  
`PHASE3_1_SHIP_LIVE_AUTHORIZED=true` · unset still **off** · default-on **no**.  
Evidence: `~/.loom/phase3-1b-canary-2026-07-28/`.

**Claims:** soft JIT **can** lift bun-test-env command form when docs do not negate it.  
3.1 fail was **H1 harness competition** (not “inject never works”).

**Next (pick):**
1. **hard `check-bun-test-env`** (권고 — 실세션 CLAUDE 경쟁 대비)  
2. Owner product / PLAN MINOR  
3. 3.2 dispatch — **not open** without new PREREG  
4. Backlog: cause B · smoke:uc  

**Line:** topology **`single`** · execution **`current-session`** · verify **`objective-commands`** · full fallback Codex→Grok→Codex

**Must not:** default-on · reopen 3.1/3.1b PREREG · claim hard enforcement from soft only · 3.1 re-run.

## Active checks

| Check | Status | Impact | Evidence |
|---|---|---|---|
| P3.0 T1(b) | **PASS** | delegation live | RESULT rev-2 |
| P3.1 T1 | **FAIL** (H1) | history | RESULT rev-2 |
| P3.1b T1(a) | **PASS** | ship soft live | RESULT rev-1 · 5/5 vs 0/5 |
| ship live constant | **true** | opt-in `=1` only | `rule-router-jit.ts` |
| hard bun-test-env | **recommended** | real-session race | SPEC-REV Path B |
| ISSUE cause B | open | — | — |

## Owner pending

| Decision | Why | Safe default | Evidence |
|---|---|---|---|
| hard 가드 B | 실세션 경쟁 | 구현 권고 | SPEC-REV |
| default-on JIT | risk | **off** | — |
| 카테고리 / cause B | backlog | 현행 | — |

## Blockers

(none)

## Invariants

- Nine headings; D1 ≤8192B; traps in `tasks/traps.md`.
- Topology single/current-session/objective-commands.
- HARD_CAP 9500; status-only owner brief.
- Isolation = absence not negation (3.1b lesson).
- JIT unset = **off** · live=`1` opt-in · **default-on no**.
- Soft pass ≠ hard enforcement claim.
- Sealed PREREGs immutable.

## Evidence

- 3.1b: `~/.loom/phase3-1b-canary-2026-07-28/` · G0+T1a.  
- H1 spike 3/3 · 3.1 fail 0/5 (contrast).  
- Docs: PHASE3.1b-PREREG · RESULT · SPEC-REV.  
- Unit tests 17 · fixture `1172cf30`.

## Don't redo

- 3.1 PREREG remeasure; probe “no standing rules”; default-on.
- Soften COMPLY; claim ship hard-locked without deny hook.
- Reopen F1*/3.0/3.1/3.1b cells without new sealed PREREG.
