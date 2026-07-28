# HANDOFF — Loom

**Updated:** 2026-07-28
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> v0.28.1 · **Phase 3 soft closed** · live=3.0–3.2 opt-in · 3.3–3.4b blocked · next = owner pick.

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | v0.28.1 · adapter `6e2df8a` | `docs/PLAN.md` |
| Dogfood | unblocked (p17 · 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | **P3 soft close** · JIT 3.0–3.2 only | `PHASE3-SOFT-CLOSE.md` |
| Dev env | claude-mem 13.12.4 B-4 + autoUpdate off | `check:mem-header` |

## Current action

### Idle · owner pick next (no silent product MINOR)

**Shipped (do not redo):**
1. Phase 3 soft JIT wave **closed** — see `docs/spikes/RULE-ROUTER-PHASE3-SOFT-CLOSE.md`  
2. Live opt-in **3.0–3.2** only (`JIT=1`) · **default-on off**  
3. 3.3 impl · 3.4/3.4b platform **live false** · sealed PREREG **no remeasure**  
4. UC-3 · cause B local B-4 pin (earlier)

**Playbook (next session):**
1. `bun run status` · `handoff:check` · `check:mem-header`  
2. Owner: **product MINOR** · dogfood · B-7 optional · P3 reopen (new SPEC only)  
3. Do **not** default-on JIT · silent MINOR · remeasure 3.3–3.4b

**Line:** topology **`single`** · execution **`current-session`** · verify **`objective-commands`** · full fallback Codex→Grok→Codex

**Done when (this handoff):** soft-close doc + HANDOFF/PRIORITIES aligned · checks green — **met**.

**Must not:** remeasure 3.3–3.4b · default-on JIT · live flip without T1(a) · silent product MINOR · B-7=local pin · reopen sealed PREREG.

## Active checks

| Check | Status | Impact | Evidence |
|---|---|---|---|
| P3 soft close | **closed** | freeze new surfaces | `PHASE3-SOFT-CLOSE.md` |
| 3.0–3.2 soft live | **opt-in** | JIT | consts true · RESULT |
| 3.3–3.4b live | **false** | blocked | consts false · RESULT |
| `smoke:uc` · B-4 pin | **OK** | prior | check:mem-header |
| B-7 upstream | deferred optional | ecosystem | PRIORITIES P2c |

## Owner pending

| Decision | Why | Safe default | Evidence |
|---|---|---|---|
| **next gate** | P3 soft closed | wait owner · no silent MINOR | this HANDOFF |
| product MINOR | backlog | no silent | PLAN |
| P3 reopen / default-on | risk | **off** · new SPEC only | SOFT-CLOSE |
| B-7 issue/PR | optional | defer | platform lessons |

## Blockers

(none)

## Invariants

- Nine headings; D1 ≤8192B; no `<details>`; traps only in `tasks/traps.md`.
- Topology `single` / current-session / objective-commands.
- HARD_CAP 9500; owner brief = `bun run status` only.
- PREREG seal before canary; sealed F1*/3.0–3.4b **immutable**.
- Phase 3 soft: live **3.0–3.2 only** · default-on **no**.
- Bash deny **before** JIT; JIT never exit 2; JIT unset=**off**.
- Sticky owns presence → listen must not `leave` if host live.
- claude-mem header: date-only; **autoUpdate off** or re-run B-4 after upgrade.

## Evidence

- Close: `docs/spikes/RULE-ROUTER-PHASE3-SOFT-CLOSE.md`  
- 3.4b/3.4/3.3 RESULT · `scripts/rule-router-jit.ts`  
- 3.0–3.2 RESULT · live consts true

## Don't redo

- 3.3–3.4b remeasure / COMPLY soften / live without T1(a).  
- default-on JIT · silent product MINOR.  
- B-4 as B-7 closed · UC-3 leave while sticky live.
