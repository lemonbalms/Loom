# HANDOFF — Loom

**Updated:** 2026-07-22
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> PATCH 2 tower A2 fence shipped (`0b335a1`) · dogfood fail-closed on herdr 0.7.5 · next = PANE-DEATH PATCH 3 (bridge authority cut).

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | v0.28.0 approved; PATCH 1 red contract + PATCH 2 tower fence landed; **PATCH 3 next** | `docs/PLAN.md` |
| Dogfood | mac-node fail-closed until herdr 0.7.5/protocol 17 adapter | `docs/spikes/HERDR-0.7.5-COMPAT.md` |
| Harness | nine-section checkpoint shipped; restoration smoke passed | `docs/spikes/HANDOFF-CHECKPOINT-DESIGN.md` |
| Reuse | not proven | evidence below |

## Current action

### PANE-DEATH PATCH 3 (M3) — bridge authority cut

Goal:
- Replace card success completion with `proposeCardVerification`, remove all bridge card `status:"done"` construction and the three card auto-`pane.close` paths; unify non-accepted ACK into durable `send_unknown`; preserve main issuer/currency machinery.

Expected:
- PATCH 1 expected-red ① and ③ flip green; card results become `failed` + `needs_verification`, panes remain present, non-accepted results enter quarantine once, and `classifyAck` becomes an exported pure function for PATCH 4 tests.

Must not change:
- U1–U11 / R44–R45 locks; card contract v1 or relay/conv/MCP input schema; PATCH 4 test rewrite; PATCH 5 version/dist; herdr 0.7.5 adapter; Phase D automation.

Done when:
- PLAN v0.28.0 PATCH 3 exact production surface ships with independent verification against U1·U3·U4·U5·U6·U7 and G-1·G-3·G-5·G-6·G-7·G-10·G-11; PATCH 2 predecessor **`0b335a1`** is cited.

**Parallel-safe alternate (not mixed into PATCH 3 diff):** herdr 0.7.5 adapter per
`docs/spikes/HERDR-0.7.5-COMPAT.md` §6 — dogfood stays blocked until it ships.

## Active checks

| Check | Deadline | Impact | Evidence |
|---|---|---|---|
| PATCH 3 (M3) bridge authority cut | next product gate | removes bridge done/close authority | `docs/PLAN.md` · `packages/host/src/bridge-runtime.ts` |
| herdr 0.7.5 adapter PATCH | before dogfood dispatch | unblocks mac-node / `dogfood:up` | `docs/spikes/HERDR-0.7.5-COMPAT.md` |
| Phase D automation | after two real PATCH transitions | deferred | `docs/spikes/HANDOFF-CHECKPOINT-DESIGN.md` §10 |

## Owner pending

| Decision | Why owner input is needed | Safe default while pending | Evidence |
|---|---|---|---|
| Integration-test flake track | diagnosis changes cost/scope | keep isolation recipe; do not expand scope | `tasks/todo.md` |
| HOOKCACHE-D-VERIFY resume | deferred cache verification | remain paused through this wave | `docs/spikes/HOOK-CACHE-FIX-DESIGN.md` |
| RULE-ENFORCEABILITY apply | code-enforcement layer is a product decision | document only; add no silent enforcement | `docs/spikes/RULE-ENFORCEABILITY.md` |
| PATCH 3 vs herdr adapter order | both touch host surfaces | finish PATCH 3 first by default; herdr stays independent | `docs/spikes/HERDR-0.7.5-COMPAT.md` §5.6 |

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
- PATCH 1 is tests-only contract (`24ceede`) and PATCH 2 tower fence is `0b335a1`; do not re-land either or rewrite tests before PATCH 4 unless R{n} changes the contract.

## Evidence

- Product plan/review: `docs/PLAN.md` · `docs/plan_review.md` · `docs/reviews/PANEDEATH-R45.md`
- PATCH 1 red contract: `24ceede` · `bridge.test.ts` · `pane-cleanup.test.ts` · `impl-0270.test.ts`
- PATCH 2 tower fence: `0b335a1` · `packages/host/src/card-ops.ts` · MCP/HERDR/DISPATCH public docs
- Continuity design/lock: `docs/spikes/HANDOFF-CHECKPOINT-DESIGN.md` · `docs/spikes/SESSION-CONTINUITY-PHASE-C-LOCK.md`
- herdr 0.7.5 release-notes + schema impact map: `docs/spikes/HERDR-0.7.5-COMPAT.md`
- Current execution and verification provenance: `docs/HANDOFF_ARCHIVE.md`
- Traps and lessons: `tasks/traps.md` · `tasks/lessons.md`
- Windows entry: `HANDOFF_WINDOWS.md`

## Don't redo

- Phase B `e281587` · Phase C `8a3ddba` · **PATCH 1 expected-red `24ceede`** · **PATCH 2 tower fence `0b335a1`**.
- Reopen PANE-DEATH U1–U11/R44/R45 locks or treat `card.done`/pane exit as completion authority.
- Raise `HARD_CAP`, create a WORKLOG/ROADMAP/front matter, or promote Phase D lint automation early.
- Downgrade herdr, dual 0.7.4 session, or config-only `herdrProtocol=17` ping greenwash.
- Re-research 0.7.5 agent facade from scratch — COMPAT §2–§3 already maps release notes to wire contracts.
- Reopen PATCH 2 or mix PATCH 4 tests / PATCH 5 dist into PATCH 3.
