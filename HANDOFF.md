# HANDOFF — Loom

**Updated:** 2026-07-22
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> PATCH 1 tests-only expected-red shipped (`24ceede`) · dogfood fail-closed on herdr 0.7.5 · next = PANE-DEATH PATCH 2 (tower A2 / `card-ops` fence).

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | v0.28.0 approved; PATCH 1 contract locked; **PATCH 2 next** | `docs/PLAN.md` |
| Dogfood | mac-node fail-closed until herdr 0.7.5/protocol 17 adapter | `docs/spikes/HERDR-0.7.5-COMPAT.md` |
| Harness | nine-section checkpoint shipped; restoration smoke passed | `docs/spikes/HANDOFF-CHECKPOINT-DESIGN.md` |
| Reuse | not proven | evidence below |

## Current action

### PANE-DEATH PATCH 2 (M2) — tower A2 fence

Goal:
- Implement tower isolation mapping in `card-ops.ts`: remote result never writes board `done`; legacy remote `done` → `blocked` with `legacy_remote_done_requires_verification`; keep currency/L-2/terminal/seq guards unchanged; update public contract docs (MCP / HERDR_DESIGN / DISPATCH-DEMO).

Expected:
- PATCH 1 expected-red ② (and related green controls ⑤) flip green for tower path; production board cannot gain `done` from remote card results.

Must not change:
- U1–U11 / R44–R45 locks; bridge auto-`done` removal (that is PATCH 3); herdr 0.7.5 adapter mixed into this wave; Phase D automation.

Done when:
- `card-ops` fence + public contract docs ship; independent verification against PLAN v0.28.0 PATCH 2 (U2·U10 · G-2 · G-4); red-test baseline cited as **`24ceede`**.

**Parallel-safe alternate (not mixed into PATCH 2 diff):** herdr 0.7.5 adapter per
`docs/spikes/HERDR-0.7.5-COMPAT.md` §6 — dogfood stays blocked until it ships.

## Active checks

| Check | Deadline | Impact | Evidence |
|---|---|---|---|
| PATCH 2 (M2) tower A2 fence | next product gate | remote done isolation | `docs/PLAN.md` · `packages/host/src/card-ops.ts` |
| herdr 0.7.5 adapter PATCH | before dogfood dispatch | unblocks mac-node / `dogfood:up` | `docs/spikes/HERDR-0.7.5-COMPAT.md` |
| Phase D automation | after two real PATCH transitions | deferred | `docs/spikes/HANDOFF-CHECKPOINT-DESIGN.md` §10 |

## Owner pending

| Decision | Why owner input is needed | Safe default while pending | Evidence |
|---|---|---|---|
| Integration-test flake track | diagnosis changes cost/scope | keep isolation recipe; do not expand scope | `tasks/todo.md` |
| HOOKCACHE-D-VERIFY resume | deferred cache verification | remain paused through this wave | `docs/spikes/HOOK-CACHE-FIX-DESIGN.md` |
| RULE-ENFORCEABILITY apply | code-enforcement layer is a product decision | document only; add no silent enforcement | `docs/spikes/RULE-ENFORCEABILITY.md` |
| PATCH 2 vs herdr adapter order | both may touch host surfaces later | finish PATCH 2 first by default; herdr stays independent | `docs/spikes/HERDR-0.7.5-COMPAT.md` §5.6 |

## Blockers

| Blocker | Owner/environment | Clear condition | Safe default |
|---|---|---|---|
| herdr 0.7.5 / Loom protocol-16 mismatch | owner uses current herdr 0.7.5 | ship adapter; `HERDR_PROTOCOL_EXPECTED=17` + live smoke | dogfood fail-closed; no protocol config-only bypass |

## Invariants

- HANDOFF alone owns the next session gate; PLAN and review remain linked SSOTs.
- All nine checkpoint headings occur once; completed narrative stays outside this file.
- `HARD_CAP=9500` is platform-pinned and `SOFT_CAP=12750` is policy-only.
- `tasks/traps.md` remains the injected source for active traps and do-not-do rules.
- Windows entry is evidence only; herdr 0.7.5 adapter remains fail-closed until COMPAT done-when is met.
- Do not downgrade herdr or run a parallel 0.7.4 session.
- PATCH 1 is tests-only contract (`24ceede`); do not re-land or re-author those expected-red assertions unless the contract itself changes under R{n}.

## Evidence

- Product plan/review: `docs/PLAN.md` · `docs/plan_review.md` · `docs/reviews/PANEDEATH-R45.md`
- PATCH 1 red contract: `24ceede` · `bridge.test.ts` · `pane-cleanup.test.ts` · `impl-0270.test.ts`
- Continuity design/lock: `docs/spikes/HANDOFF-CHECKPOINT-DESIGN.md` · `docs/spikes/SESSION-CONTINUITY-PHASE-C-LOCK.md`
- herdr 0.7.5 release-notes + schema impact map: `docs/spikes/HERDR-0.7.5-COMPAT.md`
- Current execution and verification provenance: `docs/HANDOFF_ARCHIVE.md`
- Traps and lessons: `tasks/traps.md` · `tasks/lessons.md`
- Windows entry: `HANDOFF_WINDOWS.md`

## Don't redo

- Phase B `e281587` · Phase C `8a3ddba` · **PATCH 1 expected-red `24ceede`**.
- Reopen PANE-DEATH U1–U11/R44/R45 locks or treat `card.done`/pane exit as completion authority.
- Raise `HARD_CAP`, create a WORKLOG/ROADMAP/front matter, or promote Phase D lint automation early.
- Downgrade herdr, dual 0.7.4 session, or config-only `herdrProtocol=17` ping greenwash.
- Re-research 0.7.5 agent facade from scratch — COMPAT §2–§3 already maps release notes to wire contracts.
- Start PATCH 3 bridge auto-`done` removal before PATCH 2 tower fence (rolling-upgrade order: tower first).
