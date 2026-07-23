# HANDOFF — Loom

**Updated:** 2026-07-23
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> v0.28.1 · R28 flake fixed · RULE-ROUTER propose rev-4 written, review pending.

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | v0.28.1 · adapter `6e2df8a` | `docs/PLAN.md` |
| Dogfood | unblocked (p17 · 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | NORMS Phase 3 done · R28 conv flake fix shipped | runtime/tests · rev-3 |
| Reuse | not proven | evidence |

## Current action

### RULE-ROUTER propose rev-4 — review pending

**Goal:** Get the Owner-requested rule-router problem/goal statement reviewed before any implementation.

**Authority:** Owner asked for the document and said review comes first; `RULE-ENFORCEABILITY` grades are the reused judgement axis. No code, hook, or inject change is authorized.

**Now:** `docs/spikes/RULE-ROUTER-PROPOSE.md` rev-4 is written (problems P-A–P-D · goals G1–G5 · principles P1–P5 · candidates A/B/C + §6.5 bake-off M1–M7 · phases 0–4/2b · open D1–D9). Awaiting the review verdict.

**Line:** topology **`single`** · execution **`current-session`** · verify **`objective-commands`** · full fallback Codex→Grok→Codex

**Done when:** a verdict exists and the Owner picks D1 (Phase 1 start) and D2 (review path).

**Must not:** start Phase 1 before the verdict; copy rule bodies into a registry; treat cost saving as the goal; adopt the hybrid without the §6.5 bake-off or tune its thresholds after seeing results.

## Active checks

| Check | Status | Impact | Evidence |
|---|---|---|---|
| SINGLE routing correction | **done** | prevents wrong N norm | routing design · semantic lint · 814 tests |
| NORMS Phase 3 | **done/authorized** | deterministic N packs | `norms:check` · Claude enable |
| R28 flake (stale-marker + fast working→done) | **fixed** · 4× targeted · 14/14 inject verify | original failure closed | new test ⑭ |
| Conv + scrape-delta | **30/30** | anchor order stable | sequential run |
| Full suite | **exit 0** · final run completed | no remaining tests | final summary not captured at handoff boundary |
| Typecheck | **6/6** | all packages | `bun run typecheck` |
| ISSUE cause B (claude-mem ts) | **open issue** | cache ≤1min | B-7 upstream; B-4 temp |
| R28 fix ship | **done** · 4-file code fix + docs | gate complete | this change set |
| RULE-ROUTER propose | **rev-4 written** · review pending | 7.8% delivery · A/B/C undecided | propose §6.5 |

## Owner pending

| Decision | Why | Safe default | Evidence |
|---|---|---|---|
| ISSUE cause B | autoUpdate reverts B-4 | open issue only (≠ closed) | `HOOK-CACHE-FIX-DESIGN` §5 |
| HOOKCACHE-D-VERIFY | optional | paused | design |
| RULE-ENFORCEABILITY | product | document only | spike |
| RULE-ROUTER D1–D9 | new surface | no Phase 1 until verdict | propose §10 |
| CONTEXT-MAP impl | separate package | not authorized | propose §8 |

## Blockers

(none)

## Invariants

- Nine HANDOFF headings; D1 ≤8192B; no `<details>`.
- Trap authority stays in `tasks/traps.md`; HANDOFF does not duplicate its sections.
- `design-approved ≠ implementation-authorized`; Owner added NORMS to impl set; MAP/product remain closed.
- Topology tuple: `single/current-session/objective-commands`; lockedness alone does not delegate.
- SessionStart S = **one** `--part all`; N is a separate same-event hook only on measured Claude.
- LOADED N = outer+all pack BEGIN/END + non-empty body · no channel omission; not receipt/hash-only.
- Codex N accelerator stays off until exact model-visible token measurement; Grok stays ritual-only.
- Budget chars HARD_CAP 9500; author `handoff:budget` · ship `handoff:check`.
- Owner brief = status table; bare **상태** no wave.
- Topology single; no warm-base re-fork; p17 / PANE-DEATH U1–U11 immutable.
- Conv inject confirmation is a per-inject latch; terminal status may clear completion state but not observed-working proof.
- Delta-anchor-dependent tests await the anchor-producing turn; timeout growth is not a correctness fix.

## Evidence

- NORMS review: propose §7.3 · §11 #2/#4 · Phase 3 plan §12 · pack sources live.
- NORMS impl: `core@5d29b979` · `lexicon@ec2b127c` · `traps-norm@a15b45b2` · 3657 chars/4101 bytes · 13 focused tests.
- Flake roots: fast working→done cleared transient `sawWorking` before verify polling; empty-delta test blind-drained anchors 1s without asserting receipt.
- Fix evidence: R28 4× · inject 14/14 · conv+scrape 30/30 · typecheck 6/6 · suite exit 0.
- Routing correction: `docs/spikes/SINGLE-TOPOLOGY-EXECUTION-DESIGN.md` · DOGFOOD §0.5 · review Addendum E · 814/814 tests.
- M-1: `session-context.ts` fit · `.claude/settings.json` · `.codex/hooks.json` · `9b205a6`.
- Handoff B: `handoff:budget` · `docs/HANDOFF-AUTHORING.md` · `055d73e`.
- Cause B issue: todo Open issues · PRIORITIES P2c · `a6111e0`.
- DELIVERY: `docs/SESSION-START.md` · freeze `cc03474` · approval `5b14012`.
- Product: PLAN 0.28.1 · R46 · adapter `6e2df8a`.
- Rule delivery 2026-07-23: 13,157 inject chars / 168,772 corpus = 7.8% auto-delivered.

## Don't redo

- Re-split S into dual state/lessons hooks (cause A).
- Reapply retracted F6/P7 over DOGFOOD §0.5; interpret `single` as a Grok dispatch.
- Reopen the corrected single/full contradiction; implement MAP/product under NORMS authorization.
- Enable Codex N from chars/token estimates; treat Grok SessionStart stdout as N delivery.
- Claim cause B closed by B-4 re-patch; warm-base re-fork; Grok stdout = S full.
- Bare status as wave; permanent nine-axis slim-delete.
- Reclassify the fixed R28 timeout as an open NORMS regression; increase polling/test timeouts instead of preserving event/anchor order.
