# HANDOFF — Loom

**Updated:** 2026-07-26
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> v0.28.1 · RULE-ROUTER **rev-5 folded (조건 0 closed)** · next = Owner D1–D9 판정 대기.

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | v0.28.1 · adapter `6e2df8a` | `docs/PLAN.md` |
| Dogfood | unblocked (p17 · 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | NORMS Phase 3 done · R28 conv flake fix shipped | runtime/tests · rev-3 |
| Reuse | not proven | evidence |

## Current action

### RULE-ROUTER — Owner D1–D9 판정 대기 (조건 0 closed)

**Goal:** Owner decides D1–D9 (review §5 recommendations). D1 = whether Phase 1 (registry + extractor + `rules:check`, **주입 무변경·가역**) may start.

**Authority:** review verdict = **approve, binding 조건 0 = rev-5 fold-in** — **조건 0 done** (`955d2a5`, §4 ①–⑦ verbatim PASS · ⑧ manual). approve ≠ implementation authorization; Phase 1 still needs **Owner D1**.

**Now:** present D1–D9 with review §5 defaults; wait. No registry/router/inject work before D1. If D1 approves: Phase 1 = registry.yaml + 추출기 + `rules:check` + 파일 digest/triage receipt + 카테고리 표 초안.

**Line:** topology **`single`** · execution **`current-session`** · verify **`objective-commands`** · full fallback Codex→Grok→Codex

**Done when:** Owner records D1–D9 (or explicitly defers) — then HANDOFF flips to Phase 1 or to the next gate.

**Must not:** start Phase 1 before Owner D1; treat approve as implementation authorization; re-run the rev-4 review; re-word the folded §4 delta.

## Active checks

| Check | Status | Impact | Evidence |
|---|---|---|---|
| SINGLE routing correction | **done** | prevents wrong N norm | routing design · semantic lint · 814 tests |
| NORMS Phase 3 | **done/authorized** | deterministic N packs | `norms:check` · Claude enable |
| R28 flake fix (ship) | **done** · 4× targeted · 14/14 inject · conv 30/30 | gate closed | new test ⑭ |
| Suite + typecheck | **exit 0 · 6/6** | no remaining tests | last run |
| ISSUE cause B (claude-mem ts) | **open issue** | cache ≤1min | B-7 upstream; B-4 temp |
| RULE-ROUTER review + rev-5 | **done** · approve+조건0 · advisor yes · ①–⑦ verbatim PASS | 조건 0 closed · Phase 1 blocked until D1 | REVIEW §0·§4 · `955d2a5` |

## Owner pending

| Decision | Why | Safe default | Evidence |
|---|---|---|---|
| ISSUE cause B | autoUpdate reverts B-4 | open issue only (≠ closed) | `HOOK-CACHE-FIX-DESIGN` §5 |
| HOOKCACHE-D-VERIFY | optional | paused | design |
| RULE-ENFORCEABILITY | product | document only | spike |
| RULE-ROUTER D1–D9 | reviewer recs exist (D1 승인 권고 · D2 spike · D8 add-only 지지) | **유일 게이트** — no Phase 1 until D1 | review §5 |
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

- NORMS: propose §7.3 · §11 #2/#4 · Phase 3 §12 · `core@5d29b979` · `lexicon@ec2b127c` · `traps-norm@a15b45b2` · 3657 chars · 13 tests.
- OMX prior-art `e1f0aea`: gaps = claim from-state guard (`card-ops.ts:40`) · state-first. C1–C5 unauthorized.
- Flake roots (fixed): transient `sawWorking` cleared pre-verify; empty-delta drained anchors without asserting receipt.
- Routing fix: `SINGLE-TOPOLOGY-EXECUTION-DESIGN.md` · DOGFOOD §0.5 · Addendum E · 814/814.
- M-1: `session-context.ts` fit · `.claude/settings.json` · `.codex/hooks.json` · `9b205a6`.
- Handoff B `055d73e` (`handoff:budget` · HANDOFF-AUTHORING) · cause B issue `a6111e0` (todo · PRIORITIES P2c).
- DELIVERY: `SESSION-START.md` · freeze `cc03474` · approval `5b14012`.
- Product: PLAN 0.28.1 · R46 · adapter `6e2df8a`.
- Rule delivery 07-23: 13,157/168,772 chars = 7.8% auto-delivered.
- RULE-ROUTER revs: `dd785f3` → `530a627` → `39269fe` → `7a47aad` (rev-4) → **`955d2a5` rev-5 (§4 fold-in)**.
- RULE-ROUTER review: §8 7답(P2 조건부·G1 재배치) · F1 JIT 미실측(High)·F2·F3·F4 → 전건 rev-5 fold-in.

## Don't redo

- Re-split S into dual state/lessons hooks (cause A).
- Reapply retracted F6/P7 over DOGFOOD §0.5; interpret `single` as a Grok dispatch.
- Reopen the corrected single/full contradiction; implement MAP/product under NORMS authorization.
- Enable Codex N from chars/token estimates; treat Grok SessionStart stdout as N delivery.
- Claim cause B closed by B-4 re-patch; warm-base re-fork; Grok stdout = S full.
- Bare status as wave; permanent nine-axis slim-delete.
- Reclassify fixed R28 timeout as open regression; raise timeouts instead of preserving event/anchor order.
- Re-derive the router problem statement; re-open the rev-2 demotion; author-lane verdict.
- Re-run the rev-4 review; reword review §4 delta in fold-in (verbatim only).
- Pre-claim before dispatch (§1.1 forbids; rule 5 fixed `1a22a9c`; commands stay valid).
