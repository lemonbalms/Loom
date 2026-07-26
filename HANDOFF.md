# HANDOFF — Loom

**Updated:** 2026-07-26
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> v0.28.1 · RULE-ROUTER **Phase 1 done** (카테고리 정본 선포 완료) · next = D7 M7 임계 봉인.

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | v0.28.1 · adapter `6e2df8a` | `docs/PLAN.md` |
| Dogfood | unblocked (p17 · 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | NORMS P3 · **RULE-ROUTER Phase 1** done | runtime/tests · rev-7 |
| Reuse | not proven | evidence |

## Current action

### RULE-ROUTER — D7 3단 절차: M7 임계 사전등록 (다음 세션 착수)

**Goal:** M7 임계값을 **결과 관측 전에** 고정해 Phase 2 replay의 문을 연다. 절차 = 설계자 제안 → **리뷰어 승인** → **커밋으로 봉인** → 그 후에만 replay (rev-7 §10 D7).

**Authority:** Owner 2026-07-26 — D1 승인 · D2–D9 전건 확정 · **카테고리 정본 선포 완료**(`RULE-CATEGORIES.md` 10개 · 재량 pin 0 · 예외 0). **잔여 오너 승인 0건.** Phase 2 착수 자체는 D7 봉인이 선결.

**Now (다음 세션 1번 작업):** 레지스트리 통계(32유닛 · 10카테고리 · pinned 13 · routable 19 · 7,628 chars)를 근거로 **M7 임계 제안서**를 쓴다. M7 = 카테고리 미분류 + 합집합 예산초과 턴의 비율 — 이 값이 임계 미만이면 **A 채택 확정, B/C 미구현**(§6.5.3).

**Line:** topology **`single`** · execution **`current-session`** · verify **`objective-commands`** · full fallback Codex→Grok→Codex

**Done when:** 임계 제안 → 리뷰어 승인 → 봉인 커밋. (선택 후속: 레지스트리 확대 — lessons/WORKFLOW/DOGFOOD는 아직 유닛·파일 digest 둘 다 없어 **변경이 안 잡힌다**. 주입 무변경이라 언제든 가능.)

**Must not:** 결과를 본 뒤 임계·가중치 조정(사전등록 위반 = 그 bake-off 무효); D7 봉인 전 Phase 2 replay; **F1 PoC 실측 전 Phase 3**(fail-closed); 재량 pin을 오너 선포 없이 늘리기(D3 — 코드가 거부).

## Active checks

| Check | Status | Impact | Evidence |
|---|---|---|---|
| SINGLE routing · R28 flake fix | **done** | gates closed | routing design · new test ⑭ |
| NORMS Phase 3 | **done/authorized** | deterministic N packs | `norms:check` · Claude enable |
| Suite + typecheck | **854 pass / 0 fail · tc 5/5 exit 0** | no remaining tests | 2026-07-26 |
| ISSUE cause B (claude-mem ts) | **open issue** | cache ≤1min | B-7 upstream; B-4 temp |
| RULE-ROUTER rev-5/6/7 | **done** · ①–⑦ verbatim PASS · D1–D9 확정 · D9 선포 | 잔여 오너 승인 0 | `955d2a5`·`b0a6cd4`·rev-7 |
| RULE-ROUTER Phase 1 | **done** · 32유닛 · 미분류 0 · pinned 13(전건 자동) · 드리프트 실증(**F2 사각 = 미등록 신규 규칙도 잡힘**) | 주입 무변경 | `rules:check` · 26 tests · `26923c2` |

## Owner pending

| Decision | Why | Safe default | Evidence |
|---|---|---|---|
| ISSUE cause B | autoUpdate reverts B-4 | open issue only (≠ closed) | `HOOK-CACHE-FIX-DESIGN` §5 |
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
- RULE-ROUTER: `7a47aad`(rev-4) → `955d2a5`(rev-5) → `b0a6cd4`(rev-6) → rev-7(D9 선포·앵커 확정).
- Phase 1 `26923c2`: `rules/registry.yaml`(생성기 산출) · `scripts/rules-registry.ts` · 앵커 3종 유일매치 · pin = D3 파생(코드 강제) · 카테고리 정본 `RULE-CATEGORIES.md`.
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
- Re-run the rev-4 review; reword the folded §4 delta; re-put D1–D9 or the category table to the Owner (선포 완료).
- Pre-claim before dispatch (§1.1 forbids; rule 5 fixed `1a22a9c`; commands stay valid).
