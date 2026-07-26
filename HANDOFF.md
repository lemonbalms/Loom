# HANDOFF — Loom

**Updated:** 2026-07-26
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> v0.28.1 · RULE-ROUTER **D7 봉인 완료**(오너 직접 승인 · 표본 60 동결) · next = **Phase 2 replay**.

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | v0.28.1 · adapter `6e2df8a` | `docs/PLAN.md` |
| Dogfood | unblocked (p17 · 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | NORMS P3 · RULE-ROUTER **D7 sealed** | runtime/tests · rev-8 |
| Reuse | not proven | evidence |

## Current action

### RULE-ROUTER — Phase 2: shadow replay (후보 A 먼저)

**Goal:** 봉인된 사전등록대로 A(결정론)를 replay에 태워 **위험가중 recall**과 **M7a**를 측정한다. 주입은 바꾸지 않는다(로깅만).

**Authority:** D7 3단 **전건 완료** — 오너 직접 승인 2026-07-26 · `PREREG.md` **rev-4 sealed** · propose **rev-8**. 봉인값 = **M7b 산술적 0**(→ A 확정·B/C 미구현) · recall **≥0.85**(가중 A3/G2/H1) · M6 30점·1점=0.5%p · 표본 **60 동결**.

**Now:** `scripts/rule-router-eval.ts` 작성 — 아카이브(`~/.loom/prereg/rule-router-2026-07-26`, 60세션)를 읽어 ① 턴 분해 ② 카테고리 조인(`CATEGORY_SURFACES`) ③ positive 라벨(메인 트랜스크립트 Read/Edit 한정) ④ 위험가중 recall·M7a 산출 ⑤ receipt.

**Line:** topology **`single`** · execution **`current-session`** · verify **`objective-commands`** · full fallback Codex→Grok→Codex

**Done when:** recall·M7a 측정 + receipt 커밋. 임계 충족 시 §6.5.5 중단 규칙으로 **A 확정, B/C 미구현** 기록.

**Must not:** 봉인값 사후 조정(그 측정은 무효) · 표본 교체 · 원본 코퍼스 사용(**아카이브 사본만**) · 재측정 3회 이상(상한 2 + holdout 1회) · **F1 PoC 실측 전 Phase 3**.

## Active checks

| Check | Status | Impact | Evidence |
|---|---|---|---|
| SINGLE routing · R28 flake fix | **done** | gates closed | routing design · new test ⑭ |
| NORMS Phase 3 | **done/authorized** | deterministic N packs | `norms:check` · Claude enable |
| Suite + typecheck | **859 pass / 0 fail · tc 6/6 exit 0** · smoke durable/desktop OK | no remaining tests | 2026-07-26 |
| ISSUE cause B (claude-mem ts) | **open issue** | cache ≤1min | B-7 upstream; B-4 temp |
| RULE-ROUTER rev-8 · Phase 1 | **done** · D1–D9 확정 · 32유닛 미분류 0 · pinned 13 자동 | 오너 승인 0 대기 | `b0a6cd4`·`26923c2` |
| D7 PREREG rev-4 | **sealed** (오너 승인) · 표본 60 동결(모집단 171 · digest `ad74f06d` · 적격 103) · E1/E2/E3 코드 assert | replay 착수 허용 | `prereg-sample.json` · 39 tests |
| `smoke:uc` UC-3 | **상시 fail 2건**(host `already running` · handoff `peer_unknown`→alice) · HEAD 동일 = 회귀 아님 | 미진단 | 차집합 0 |

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
- Budget chars HARD_CAP 9500 (author `handoff:budget` · ship `handoff:check`); owner brief = status table; bare **상태** no wave.
- Topology single; no warm-base re-fork; p17 / PANE-DEATH U1–U11 immutable.
- Conv inject confirmation is a per-inject latch; delta-anchor tests await the anchor turn — timeout growth is not a correctness fix.

## Evidence

- NORMS: propose §7.3 · §11 #2/#4 · Phase 3 §12 · `core@5d29b979` · `lexicon@ec2b127c` · `traps-norm@a15b45b2` · 3657 chars · 13 tests.
- OMX prior-art `e1f0aea`: gaps = claim from-state guard (`card-ops.ts:40`) · state-first. C1–C5 unauthorized.
- Flake roots (fixed): transient `sawWorking` cleared pre-verify; empty-delta drained anchors without receipt.
- Routing fix: `SINGLE-TOPOLOGY-EXECUTION-DESIGN.md` · DOGFOOD §0.5 · 814/814. M-1 `9b205a6`.
- Handoff B `055d73e` · cause B issue `a6111e0` · DELIVERY freeze `cc03474` · approval `5b14012`.
- Product: PLAN 0.28.1 · R46 · adapter `6e2df8a`.
- Rule delivery 07-23: 13,157/168,772 chars = 7.8% auto-delivered. RULE-ROUTER rev-4 `7a47aad` → rev-5 `955d2a5` → rev-6 `b0a6cd4` → rev-7.
- Phase 1 `26923c2`: `rules/registry.yaml`(생성기 산출) · `scripts/rules-registry.ts` · 앵커 3종 유일매치 · pin = D3 파생(코드 강제) · 카테고리 정본 `RULE-CATEGORIES.md`.
- RULE-ROUTER review: §8 7답(P2 조건부·G1 재배치) · F1 JIT 미실측(High)·F2·F3·F4 → 전건 rev-5 fold-in.
- PREREG rev-4 sealed · receipt `rules/prereg-sample.json` · 아카이브 `~/.loom/prereg/rule-router-2026-07-26`(72MB·60세션).
- PREREG 계산값: pinned 2,586 · routable 5,042 · 전량 **7,628** · 최악 합집합 5,300 — 전부 9,500 이하 → M7b=0 · E1 여유 1,872. 자문 N1 = 슬롯 공유 전제(공존이면 5,843 → 반전).

## Don't redo

- Re-split S into dual state/lessons hooks (cause A).
- Reapply retracted F6/P7 over DOGFOOD §0.5; interpret `single` as a Grok dispatch.
- Reopen the corrected single/full contradiction; implement MAP/product under NORMS authorization.
- Enable Codex N from chars/token estimates; treat Grok SessionStart stdout as N delivery.
- Claim cause B closed by B-4 re-patch; warm-base re-fork; Grok stdout = S full.
- Bare status as wave; permanent nine-axis slim-delete.
- Reclassify fixed R28 timeout as open regression; raise timeouts instead of preserving event/anchor order.
- Re-derive the router problem statement; re-open the rev-2 demotion; author-lane verdict; re-run the rev-4 review; re-put D1–D9 or the category table to the Owner (선포 완료).
- Pre-claim before dispatch (§1.1 forbids; rule 5 fixed `1a22a9c`; commands stay valid).
- Re-derive the PREREG numbers by hand; adjust any sealed S1–S4 value; swap sample sessions; read the live corpus instead of the frozen archive; quote `M7b = 0` past E1.
