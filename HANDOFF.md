# HANDOFF — Loom

**Updated:** 2026-07-23
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> Loom v0.28.1 · Dashboard v1 + Phase D shipped (`0001a94`·`49b6a9d`) · next = **owner track pick** (WP5-followup / product / idle) · topology **single** harness · start with `bun run status`.

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | v0.28.1 release close; adapter through `6e2df8a` | `docs/PLAN.md` |
| Dogfood | unblocked (protocol 17 · live 3-kind · dogfood:herdr ok) | `docs/spikes/HERDR-0.7.5-COMPAT.md` |
| Harness | Phase D + Dashboard v1 shipped; Phase E until ROADMAP | `HANDOFF-CHECKPOINT-DESIGN` · `session-status.ts` |
| Reuse | not proven | evidence |

## Current action

### Post–Phase D — owner next-track pick

**Session start (next agent):**

1. `bun run status` → **Dashboard only** (do not invent a second briefing table).
2. `bun run handoff:lint` if editing HANDOFF.
3. Read this file’s nine sections if no SessionStart inject / sentinel.
4. Execute Owner’s track choice; if none → **safe default = idle** (no product expand, no Phase E).

**Line inheritance** — SSOT `docs/DOGFOOD_LOOP.md` §0.5:

| Axis | Default | Notes |
|---|---|---|
| Topology (B) | **`single`** harness/docs | promote **`full`** on complex/lock decisions |
| Vendor (A) full | **Codex → Grok → Codex verify** | when topology=`full` |
| This wave actual | single · session=Grok | Dashboard·Phase D·docs |

**Track choices (Owner):**

| Pick | Means | First step |
|---|---|---|
| **WP5-followup** | prefix normalize + SessionStart hook-cache (not warm-base re-fork) | read `HOOK-CACHE-FIX-DESIGN.md` M-1; claim; implement; HOOKCACHE-D-VERIFY |
| **product** | next product PATCH/MINOR | Owner scope → PLAN/R{n} per WORKFLOW §5 |
| **idle** | no large track | hygiene only; leave Gate as idle-ack in Evidence |
| ~~Phase E~~ | ROADMAP flywheel | **blocked** until ROADMAP adopted |

Goal: record Owner pick and replace this Gate with a concrete next action.

Expected: new `###` gate title + Done when; or Evidence line `idle accepted YYYY-MM-DD`.

Must not change: product/card/relay/conv/herdr locks; PANE-DEATH U1–U11; protocol 17; nine-section HANDOFF; Phase D lint/fail-loud; Open(blocking) **table**; Dashboard cell contracts without defect.

Done when: next session has a **non-owner-wait** Gate (implementation or explicit idle).

## Active checks

| Check | Deadline | Impact | Evidence |
|---|---|---|---|
| Owner next-track pick | **open** | unblocks WP5-followup / product | this section |
| Dashboard v1 usable | **done** | session start = one table | `bun run status` · `0001a94` |
| Phase D automation | **done** | lint structure · fail-loud · V4 tests | `49b6a9d` |
| plan_review Open table | **done** | Review open **없음** | `e00367e` |
| UK-5..UK-9 | nonblocking | observe only | `docs/PLAN.md` |
| Integration-test flake | owner-pending | isolation recipe | `tasks/todo.md` |

## Owner pending

| Decision | Why needed | Safe default | Evidence |
|---|---|---|---|
| **WP5-followup / product / idle** | no auto product track | **idle** | todo · HOOK-CACHE design |
| Integration-test flake | scope/cost | keep isolation | todo |
| HOOKCACHE-D-VERIFY | with WP5-followup only | paused | `HOOK-CACHE-FIX-DESIGN.md` |
| RULE-ENFORCEABILITY apply | product decision | document only | `RULE-ENFORCEABILITY.md` |

## Blockers

(none)

## Invariants

- Next session gate SSOT = this HANDOFF; PLAN/review linked only.
- Nine headings once; no `<details>`; D1 whole-file ≤8192B.
- `bun run status` = Dashboard v1 (`## Loom · session`); AGENTS briefing = status output SSOT.
- Fail-loud: unreadable shape → `unknown/malformed` (do not invent `없음`).
- `handoff:lint` = structure + budget (`handoff-lint.ts`).
- Topology **single** default for harness; **full** on complexity. line ≠ lane (`DOGFOOD` §0.5).
- WP5 warm-base spike **done/`defer`** — residual label **WP5-followup** only (no re-fork bake).
- Adapter protocol **17** / herdr 0.7.5 locks; PANE-DEATH U1–U11 immutable.
- Record actual vendor chain + topology each gate for inheritance.

## Evidence

- Dashboard v1: `0001a94` · `scripts/session-status.ts` · AGENTS briefing
- Phase D: `49b6a9d` · `handoff-lint.ts` · checkpoint tests
- Open table: `e00367e` · `docs/plan_review.md`
- line/lane + full/single: `5fafcd1` · `DOGFOOD_LOOP.md` §0.5
- WP5 → follow-up: `6eb132f` · `WARM-BASE-FORK-SPIKE.md` · `HOOK-CACHE-FIX-DESIGN.md`
- Product 0.28.1: adapter `6e2df8a` · R46 · PLAN approved
- Continuity: Phase B `e281587` · Phase C `8a3ddba` · design spike
- Archive/traps/Windows: `docs/HANDOFF_ARCHIVE.md` · `tasks/traps.md` · `HANDOFF_WINDOWS.md`

## Don't redo

- Phase B/C/D automation · Dashboard v1 from scratch (extend, don’t re-spec).
- Warm-base fork bake / re-spike WP5 (use **WP5-followup** only).
- Phase E / ROADMAP authority before Owner adopts ROADMAP.
- Weaken fail-loud or Open(blocking) table contract.
- Reopen PANE-DEATH U1–U11 · `card.done` as completion authority.
- herdr downgrade · protocol greenwash · dual 0.7.4.
- Invent a second status table alongside Dashboard (AGENTS = status SSOT).
