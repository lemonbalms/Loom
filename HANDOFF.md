# HANDOFF — Loom

**Updated:** 2026-07-23
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> v0.28.1 · single/current-session routing fixed · NORMS Phase 3 authorized next.

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | v0.28.1 · adapter `6e2df8a` | `docs/PLAN.md` |
| Dogfood | unblocked (p17 · 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | DELIVERY+B+M-1 done · single routing corrected · NORMS Phase 3 authorized | routing design · rev-3 |
| Reuse | not proven | evidence |

## Current action

### NORMS-RECEIPT Phase 3 — deterministic extractor first

**Goal:** Implement the frozen §7.3 norm packs and fail-closed receipts without changing the S payload contract.

**Authority:** Owner authorization · `docs/spikes/SESSION-START-UNIFIED-PROPOSE.md` §7.3 · freeze `cc03474`.

**Now:** extractor failure fixtures → deterministic packs/receipts → budget measurement → `norms:check` → enable passing hosts only.

**Line:** topology **`single`** · execution **`current-session`** · verify **`objective-commands`** · full fallback Codex→Grok→Codex

**Done when:** missing/duplicate anchors fail nonzero; pack hashes/markers are deterministic; budgets are measured; `norms:check`, full tests, and handoff check are green; only proven hosts accelerate.

**Must not:** implement CONTEXT-MAP/product; rewrite frozen `cc03474`; alter S BEGIN/END or same-hook assembly; dispatch Grok in this single line.

## Active checks

| Check | Status | Impact | Evidence |
|---|---|---|---|
| DELIVERY 0a–2 · handoff B · M-1 cutover | **done** | S harness | L0 · `handoff:budget` · `--part all` |
| NORMS-RECEIPT design | **approved** | pack contract | propose §7 · `5b14012` |
| NORMS-RECEIPT impl-auth | **Owner authorized** | Phase 3 unlocked after routing fix | conversation · design set subset |
| SINGLE routing correction | **done** | prevents wrong N norm | routing design · semantic lint · 814 tests |
| NORMS Phase 3 | **next** | deterministic N packs | frozen §7.3 · Owner auth |
| NORMS entry prereqs (L0+sources) | **met** (review) | can start Phase 3 after auth | AGENTS · SESSION-START · traps |
| ISSUE cause B (claude-mem ts) | **open issue** | cache ≤1min | B-7 upstream; B-4 temp |
| Owner product / idle | superseded by NORMS pick | direction | Owner authorization |

## Owner pending

| Decision | Why | Safe default | Evidence |
|---|---|---|---|
| ISSUE cause B | autoUpdate reverts B-4 | open issue only (≠ closed) | `HOOK-CACHE-FIX-DESIGN` §5 |
| Integration-test flake | cost/scope | isolation recipe | todo |
| HOOKCACHE-D-VERIFY | optional | paused | design |
| RULE-ENFORCEABILITY | product | document only | spike |
| CONTEXT-MAP impl | separate package | not authorized | propose §8 |

## Blockers

(none)

## Invariants

- Nine HANDOFF headings; D1 ≤8192B; no `<details>`.
- Trap authority stays in `tasks/traps.md`; HANDOFF does not duplicate its sections.
- `design-approved ≠ implementation-authorized`; Owner added NORMS to impl set; MAP/product remain closed.
- Topology tuple: `single/current-session/objective-commands`; lockedness alone does not delegate.
- SessionStart S = **one** `--part all`; N accelerator only if NORMS **and** DELIVERY both impl-auth; N≠S same-hook merge without redesign.
- LOADED N = outer+all pack BEGIN/END + non-empty body · no channel omission; not receipt/hash-only.
- Budget chars HARD_CAP 9500; author `handoff:budget` · ship `handoff:check`.
- Owner brief = status table; bare **상태** no wave.
- Topology single; no warm-base re-fork; p17 / PANE-DEATH U1–U11 immutable.

## Evidence

- NORMS review: propose §7.3 · §11 #2/#4 · Phase 3 plan §12 · pack sources live.
- Routing correction: `docs/spikes/SINGLE-TOPOLOGY-EXECUTION-DESIGN.md` · DOGFOOD §0.5 · review Addendum E · 814/814 tests.
- M-1: `session-context.ts` fit · `.claude/settings.json` · `.codex/hooks.json` · `9b205a6`.
- Handoff B: `handoff:budget` · `docs/HANDOFF-AUTHORING.md` · `055d73e`.
- Cause B issue: todo Open issues · PRIORITIES P2c · `a6111e0`.
- DELIVERY: `docs/SESSION-START.md` · freeze `cc03474` · approval `5b14012`.
- Product: PLAN 0.28.1 · R46 · adapter `6e2df8a`.

## Don't redo

- Re-split S into dual state/lessons hooks (cause A).
- Reapply retracted F6/P7 over DOGFOOD §0.5; interpret `single` as a Grok dispatch.
- Reopen the corrected single/full contradiction; implement MAP/product under NORMS authorization.
- Claim cause B closed by B-4 re-patch; warm-base re-fork; Grok stdout = S full.
- Bare status as wave; permanent nine-axis slim-delete.
