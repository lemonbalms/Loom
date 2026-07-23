# HANDOFF — Loom

**Updated:** 2026-07-23
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> v0.28.1 · M-1+B shipped · NORMS impl-ready if Owner authorizes · else product/idle.

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | v0.28.1 · adapter `6e2df8a` | `docs/PLAN.md` |
| Dogfood | unblocked (p17 · 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | DELIVERY+B+M-1 **done**; NORMS design-ok · **impl not auth** | propose rev-3 · `5b14012` |
| Reuse | not proven | evidence |

## Current action

### Owner pick: product | idle | NORMS impl-auth

**Goal:** Session closed with review logged; next Owner chooses product, idle, or NORMS-RECEIPT **implementation authorization**.

**Authority:** Design freeze `cc03474` · owner design `5b14012` (impl set still **DELIVERY only**). Safe default = **idle**.

**Session start:**

1. `bun run status` · `bun run handoff:check`; L0 = `docs/SESSION-START.md`.
2. S inject = single `--part all` (state pin · lessons line-fit). Guide: `docs/HANDOFF-AUTHORING.md`.
3. NORMS/MAP code only after explicit impl-auth package ID(s).

**NORMS review (this session · feedback only):**

- **Q:** design-approved면 구현 가능한가? **A:** 아니오 — 빠진 건 design 재리뷰가 아니라 **impl-auth for `NORMS-RECEIPT`**.
- **Entry if authorized:** design pack contract + impl-auth + DELIVERY L0 — **prereqs met** (L0 · pack sources present: `core` AGENTS rows · `lexicon` Triggers · `traps-norm` 하지 말 것).
- **Not needed:** full rev-3 re-review if pack contract unchanged.
- **Phase 3 order:** extractor fixture → host budget measure → `norms:check` gate → enable N hook **only** on passing hosts; else ritual `norms:raw`.
- **Host notes:** Claude N=separate SessionStart ×1 OK (S already ×1 all); Codex ~2500 tok may force ritual; Grok always ritual (no N stdout).
- **Approve text example:** `Implementation-authorized: DELIVERY · NORMS-RECEIPT` · freeze unchanged · **not** MAP/product.
- **Still closed without auth:** CONTEXT-MAP · product/herdr · architect hand-code locked NORMS (impl lane).

**Line:** topology **`single`** · full = Codex→Grok→Codex.

**Done when:** Owner pick recorded (product / idle / NORMS impl-auth) and HANDOFF matches.

**Must not:** dual state/lessons SessionStart; NORMS/MAP without impl-auth; claim cause B closed via B-4; warm-base re-fork.

## Active checks

| Check | Status | Impact | Evidence |
|---|---|---|---|
| DELIVERY 0a–2 · handoff B · M-1 cutover | **done** | S harness | L0 · `handoff:budget` · `--part all` |
| NORMS-RECEIPT design | **approved** | pack contract | propose §7 · `5b14012` |
| NORMS-RECEIPT impl-auth | **open** | Phase 3 unlock | §11 #4 still DELIVERY only |
| NORMS entry prereqs (L0+sources) | **met** (review) | can start Phase 3 after auth | AGENTS · SESSION-START · traps |
| ISSUE cause B (claude-mem ts) | **open issue** | cache ≤1min | B-7 upstream; B-4 temp |
| Owner product / idle | **open** | direction | safe default idle |

## Owner pending

| Decision | Why | Safe default | Evidence |
|---|---|---|---|
| product \| idle \| **NORMS impl-auth** | next track | **idle** | this review · todo |
| ISSUE cause B | autoUpdate reverts B-4 | open issue only (≠ closed) | `HOOK-CACHE-FIX-DESIGN` §5 |
| Integration-test flake | cost/scope | isolation recipe | todo |
| HOOKCACHE-D-VERIFY | optional | paused | design |
| RULE-ENFORCEABILITY | product | document only | spike |
| CONTEXT-MAP impl | separate package | not authorized | propose §8 |

## Blockers

(none)

## Invariants

- Nine HANDOFF headings; D1 ≤8192B; no `<details>`.
- `design-approved ≠ implementation-authorized`; impl set ⊆ design set (`5b14012`).
- SessionStart S = **one** `--part all`; N accelerator only if NORMS **and** DELIVERY both impl-auth; N≠S same-hook merge without redesign.
- LOADED N = outer+all pack BEGIN/END + non-empty body · no channel omission; not receipt/hash-only.
- Budget chars HARD_CAP 9500; author `handoff:budget` · ship `handoff:check`.
- Owner brief = status table; bare **상태** no wave.
- Topology single; no warm-base re-fork; p17 / PANE-DEATH U1–U11 immutable.

## Evidence

- NORMS review: propose §7.3 · §11 #2/#4 · Phase 3 plan §12 · pack sources live.
- M-1: `session-context.ts` fit · `.claude/settings.json` · `.codex/hooks.json` · `9b205a6`.
- Handoff B: `handoff:budget` · `docs/HANDOFF-AUTHORING.md` · `055d73e`.
- Cause B issue: todo Open issues · PRIORITIES P2c · `a6111e0`.
- DELIVERY: `docs/SESSION-START.md` · freeze `cc03474` · approval `5b14012`.
- Product: PLAN 0.28.1 · R46 · adapter `6e2df8a`.

## Don't redo

- Re-split S into dual state/lessons hooks (cause A).
- Implement NORMS/MAP without package impl-auth; full rev-3 re-review when only #4 changes.
- Treat design-approved NORMS as ship license; architect hand-code locked NORMS.
- Claim cause B closed by B-4 re-patch; warm-base re-fork; Grok stdout = S full.
- Bare status as wave; permanent nine-axis slim-delete.
