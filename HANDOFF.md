# HANDOFF — Loom

**Updated:** 2026-07-26
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> v0.28.1 · RULE-ROUTER **Phase 1 코드 done** (D1 승인) · next = 카테고리 표 오너 승인(D9).

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | v0.28.1 · adapter `6e2df8a` | `docs/PLAN.md` |
| Dogfood | unblocked (p17 · 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | NORMS Phase 3 done · R28 conv flake fix shipped | runtime/tests · rev-3 |
| Reuse | not proven | evidence |

## Current action

### RULE-ROUTER Phase 1 — 카테고리 표 오너 승인 (D9) → D7 임계 3단 절차

**Goal:** Close Phase 1. Code+registry **done**; 남은 것 = 카테고리 표 **오너 승인(D9)** → M7 임계 **D7 3단 절차**(설계자 제안 → 리뷰어 승인 → 커밋 봉인) → 그 후 Phase 2.

**Authority:** Owner 2026-07-26 — **D1 승인** · D2–D9 리뷰 §5 전건 채택 (rev-6 §10 확정표). Phase 2 이후는 미포함.

**Now:** `RULE-CATEGORIES-DRAFT.md` §3(10개 확정 · 재량 pin 0건 · 예외 없음)을 오너에게. 레지스트리 확대(lessons/WORKFLOW/DOGFOOD 미등록)는 후속 — 주입 무변경.

**Line:** topology **`single`** · execution **`current-session`** · verify **`objective-commands`** · full fallback Codex→Grok→Codex

**Done when:** Owner approves/edits the category table · then M7 임계 사전등록이 커밋으로 봉인된다.

**Must not:** start Phase 2 replay before the D7 임계 봉인; start Phase 3 before the PreToolUse 비차단 주입 **PoC 실측**(F1 · fail-closed); 재량 pin을 오너 선포 없이 늘리기(D3); 라우팅에 미승인 카테고리 표 사용.

## Active checks

| Check | Status | Impact | Evidence |
|---|---|---|---|
| SINGLE routing correction | **done** | prevents wrong N norm | routing design · semantic lint · 814 tests |
| NORMS Phase 3 | **done/authorized** | deterministic N packs | `norms:check` · Claude enable |
| R28 flake fix (ship) | **done** · 4× targeted · 14/14 inject · conv 30/30 | gate closed | new test ⑭ |
| Suite + typecheck | **exit 0 · 6/6** | no remaining tests | last run |
| ISSUE cause B (claude-mem ts) | **open issue** | cache ≤1min | B-7 upstream; B-4 temp |
| RULE-ROUTER review + rev-5/6 | **done** · ①–⑦ verbatim PASS · 오너 D1–D9 확정 | 조건 0 closed · Phase 1 승인 | `955d2a5` · rev-6 `b0a6cd4` |
| RULE-ROUTER Phase 1 | **done** · 32유닛 · 미분류 0 · pinned 13 · 드리프트 실증(**F2 사각 = 미등록 신규 규칙도 잡힘**) | 주입 무변경 | `rules:check` · 26 tests |

## Owner pending

| Decision | Why | Safe default | Evidence |
|---|---|---|---|
| ISSUE cause B | autoUpdate reverts B-4 | open issue only (≠ closed) | `HOOK-CACHE-FIX-DESIGN` §5 |
| HOOKCACHE-D-VERIFY | optional | paused | design |
| RULE-ENFORCEABILITY | product | document only | spike |
| RULE-ROUTER 카테고리 표 | Phase 1 산출물 · D9 = 오너 선포 | 10개 그대로 · 재량 pin 0건 · 예외 없음 | `RULE-CATEGORIES-DRAFT.md` §3 |
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
- RULE-ROUTER revs: `7a47aad`(rev-4) → `955d2a5`(rev-5 fold-in) → `b0a6cd4`(rev-6 오너 확정).
- Phase 1: `rules/registry.yaml`(생성기 산출) · `scripts/rules-registry.ts` · 앵커 3종 유일매치 강제 · pin = D3 파생값(코드 강제).
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
