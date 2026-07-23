# HANDOFF — Loom

**Updated:** 2026-07-23
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> v0.28.1 · RULE-ROUTER **reviewed: approve+조건0** · next = rev-5 fold-in → Owner D1–D9.

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | v0.28.1 · adapter `6e2df8a` | `docs/PLAN.md` |
| Dogfood | unblocked (p17 · 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | NORMS Phase 3 done · R28 conv flake fix shipped | runtime/tests · rev-3 |
| Reuse | not proven | evidence |

## Current action

### RULE-ROUTER — rev-5 fold-in (리뷰 조건 0) → Owner D1–D9

**Goal:** Apply `RULE-ROUTER-REVIEW.md` **§4 delta ①–⑧ verbatim** to the propose as **rev-5 (docs-only)**, then put D1–D9 (review §5 recommendations) to the Owner.

**Authority:** review verdict = **approve, binding 조건 0** — no Phase 1 before rev-5. Delta text is pre-approved → rev-5 needs **no re-review**. The verdict session did not edit the propose — fold-in is author-lane work.

**Now:** fold §4 ①–⑧ into the propose + changelog/coordinates; brief the Owner on D1–D9 with review §5. No Phase 1/registry/router/inject work until rev-5 **and** Owner D1.

**Line:** topology **`single`** · execution **`current-session`** · verify **`objective-commands`** · full fallback Codex→Grok→Codex

**Done when:** rev-5 committed with §4 applied verbatim · D1–D9 presented to Owner.

**Must not:** deviate from §4 wording (deviation = re-review); start Phase 1 before rev-5 + Owner D1; treat approve as implementation authorization; re-run the rev-4 review.

## Active checks

| Check | Status | Impact | Evidence |
|---|---|---|---|
| SINGLE routing correction | **done** | prevents wrong N norm | routing design · semantic lint · 814 tests |
| NORMS Phase 3 | **done/authorized** | deterministic N packs | `norms:check` · Claude enable |
| R28 flake fix (ship) | **done** · 4× targeted · 14/14 inject · conv 30/30 | gate closed | new test ⑭ |
| Suite + typecheck | **exit 0 · 6/6** | no remaining tests | last run |
| ISSUE cause B (claude-mem ts) | **open issue** | cache ≤1min | B-7 upstream; B-4 temp |
| RULE-ROUTER review | **done · approve+조건0** · advisor consulted | Phase 1 blocked until rev-5 + D1 | `RULE-ROUTER-REVIEW.md` §0·§4 |

## Owner pending

| Decision | Why | Safe default | Evidence |
|---|---|---|---|
| ISSUE cause B | autoUpdate reverts B-4 | open issue only (≠ closed) | `HOOK-CACHE-FIX-DESIGN` §5 |
| HOOKCACHE-D-VERIFY | optional | paused | design |
| RULE-ENFORCEABILITY | product | document only | spike |
| RULE-ROUTER D1–D9 | reviewer recs exist (D1 승인 권고 · D2 spike · D8 add-only 지지) | no Phase 1 until rev-5 + Owner D1 | review §5 |
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
- Conv inject confirmation is a per-inject latch; delta-anchor tests await the anchor turn — timeout growth is not a correctness fix.

## Evidence

- NORMS review: propose §7.3 · §11 #2/#4 · Phase 3 plan §12 · pack sources live.
- NORMS impl: `core@5d29b979` · `lexicon@ec2b127c` · `traps-norm@a15b45b2` · 3657 chars/4101 bytes · 13 focused tests.
- Flake roots (fixed): transient `sawWorking` cleared before verify polling; empty-delta test blind-drained anchors without asserting receipt.
- Routing correction: `docs/spikes/SINGLE-TOPOLOGY-EXECUTION-DESIGN.md` · DOGFOOD §0.5 · review Addendum E · 814/814 tests.
- M-1: `session-context.ts` fit · `.claude/settings.json` · `.codex/hooks.json` · `9b205a6`.
- Handoff B: `handoff:budget` · `docs/HANDOFF-AUTHORING.md` · `055d73e`.
- Cause B issue: todo Open issues · PRIORITIES P2c · `a6111e0`.
- DELIVERY: `docs/SESSION-START.md` · freeze `cc03474` · approval `5b14012`.
- Product: PLAN 0.28.1 · R46 · adapter `6e2df8a`.
- Rule delivery 2026-07-23: 13,157 inject chars / 168,772 corpus = 7.8% auto-delivered.
- RULE-ROUTER revs: `dd785f3` → `530a627` (candidates) → `39269fe` (M2) → `7a47aad` · blob `a4a0b47`.
- RULE-ROUTER review: approve+조건0 · §8 7답(P2 조건부·G1 재배치) · F1 JIT 미실측(High)·F2 커버리지·F3 replay·F4 G5.

## Don't redo

- Re-split S into dual state/lessons hooks (cause A).
- Reapply retracted F6/P7 over DOGFOOD §0.5; interpret `single` as a Grok dispatch.
- Reopen the corrected single/full contradiction; implement MAP/product under NORMS authorization.
- Enable Codex N from chars/token estimates; treat Grok SessionStart stdout as N delivery.
- Claim cause B closed by B-4 re-patch; warm-base re-fork; Grok stdout = S full.
- Bare status as wave; permanent nine-axis slim-delete.
- Reclassify the fixed R28 timeout as an open NORMS regression; increase polling/test timeouts instead of preserving event/anchor order.
- Re-derive the router problem statement; re-open the rev-2 demotion; author-lane verdict.
- Re-run the rev-4 review; reword review §4 delta in fold-in (verbatim only).
