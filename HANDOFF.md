# HANDOFF — Loom

**Updated:** 2026-10-15
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> v0.30.0 **approved** (R48 w/ fixes) · P1 next (result-core refactor) · headless workers · topology full

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | **v0.30.0 `approved`** (R48 w/ fixes) · P1 next · headless workers | `docs/PLAN.md` |
| Dogfood | unblocked (p17 · 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | **P3 soft close** · JIT 3.0–3.2 only | `PHASE3-SOFT-CLOSE.md` |
| Dev env | claude-mem 13.12.4 B-4 + autoUpdate off | `check:mem-header` |

## Current action

### v0.30.0 approved (R48 w/ fixes) · P1 next (result-core refactor) · headless workers

**Goal:** step 2 part 1 — headless card workers (D1–D15). R48 approved-with-fixes: H1 env scrub (`LOOM_*`/`FABLE_*` out, `LOOM_CARD` only) · M1 `composeAndSend` core · M2 serialize-budget tail cut · M3 `card_already_running`; UK-5 measured → D10 deny list. Authority `docs/PLAN.md` §0.30.0 · `HEADLESS-WORKER-PROBE.md` §7.

**Playbook (next session):**
1. `bun run status` · `handoff:check`
2. P1 result-core refactor (no behavior change, existing tests unmodified green) → P2 tests-first red (incl. R48 M2/M3/H1/L1)
3. Known limits to carry: deny-prefix bypass (`/bin/rm`, `find -delete`) · UK-2 60k stdin unmeasured · 0.29.0 UK-4 caps estimate

**Line:** topology **`full`** · execution **`delegated`** · verify **`independent`** · chain Claude→Grok→Codex verify + fable-advisor advise (promoted from `single` 2026-10-15 — `packages/*` product meaning, `DOGFOOD_LOOP.md` §0.5.3)

**Done when (this handoff):** P1 landed with independent verify; P2 red committed (red/green labelled).

**Must not:** touch pane path in P1 · inherit bridge env into headless workers (R48-H1) · inject `loomSystemHint` (R48 R3) · sync lock on WS receive path (R47-H1) · demote to `single` without owner · remeasure 3.3–3.4b · default-on JIT.

## Active checks

| Check | Status | Impact | Evidence |
|---|---|---|---|
| v0.29.0 | **shipped** | step 1 done | `docs/PLAN.md` |
| P3 soft close | **closed** | freeze new surfaces | `PHASE3-SOFT-CLOSE.md` |
| 3.0–3.2 soft live | **opt-in** | JIT | consts true · RESULT |
| 3.3–3.4b live | **false** | blocked | consts false · RESULT |
| `smoke:uc` · B-4 pin | **OK** | prior | check:mem-header |
| B-7 upstream | deferred optional | ecosystem | PRIORITIES P2c |

## Owner pending

| Decision | Why | Safe default | Evidence |
|---|---|---|---|
| UK-4 caps | open, non-blocking | 1024 / 256 | UNKNOWNS |
| P3 reopen / default-on | risk | **off** · new SPEC only | SOFT-CLOSE |
| B-7 issue/PR | optional | defer | platform lessons |

## Blockers

(none)

## Invariants

- Nine headings; D1 ≤8192B; no `<details>`; traps only in `tasks/traps.md`.
- Topology `full` for v0.29.0 (promoted 2026-10-15); demote = owner only.
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
- default-on JIT · silent product MINOR (v0.29.0 = owner-picked).  
- B-4 as B-7 closed · UC-3 leave while sticky live.
