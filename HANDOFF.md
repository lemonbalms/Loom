# HANDOFF — Loom

**Updated:** 2026-07-26
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> v0.28.1 · RULE-ROUTER **D7 1단 done**(PREREG rev-2 제안·자문 fold-in) · next = **2단 리뷰어 승인**.

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | v0.28.1 · adapter `6e2df8a` | `docs/PLAN.md` |
| Dogfood | unblocked (p17 · 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | NORMS P3 · **RULE-ROUTER Phase 1** done | runtime/tests · rev-7 |
| Reuse | not proven | evidence |

## Current action

### RULE-ROUTER — D7 2단: 리뷰어 승인 (설계자 제안은 완료)

**Goal:** `RULE-ROUTER-PREREG.md` rev-2를 **리뷰어가 승인**하면 봉인 커밋 → 그때만 Phase 2 replay (rev-7 §10 D7). **설계자(본세션)는 자기 제안을 승인할 수 없다** — 그것이 D7이 막는 자기평가다.

**Done (1단):** PREREG rev-2 봉인 제안 4건 — **S1** M7 분해(M7a 15% 표 개정 신호 · **M7b 산술적 0** → A 확정·B/C 미구현) · **S2** M6 30점 만점 · 1점=recall 0.5%p · **S3** miss 가중 A3/G2/H1 · recall ≥0.85 · 재측정 2회+holdout 15 · **S4** 60세션 층화(sha256 결정론). **B_rules = 9,500 chars** = 전용 슬롯 1개 캡.

**Next (다음 세션 = 리뷰어 레인):** §8 5문(핵심 = **B_rules 채널 선택** — state 채널이면 M7b 100%로 결론 반전)에 답하고 verdict. `single`이므로 **검증 피어를 띄우지 않는다**(§0.5.1) — 레인 분리는 세션 승계로 성립.

**Line:** topology **`single`** · execution **`current-session`** · verify **`objective-commands`** · full fallback Codex→Grok→Codex

**Done when:** 리뷰어 verdict → (조건부면 그 조건만) → **봉인 커밋**. 대기 중 후속 = 레지스트리 확대(주입 무변경 · **E1 넘기면 `M7b=0` 만료 + `rules:check` FAIL**).

**Must not:** 결과를 본 뒤 임계·가중치 조정(사전등록 위반); 승인·봉인 전 Phase 2 replay; 설계자 자기 승인; **F1 PoC 실측 전 Phase 3**(fail-closed); 재량 pin을 오너 선포 없이 늘리기(D3 — 코드가 거부).

## Active checks

| Check | Status | Impact | Evidence |
|---|---|---|---|
| SINGLE routing · R28 flake fix | **done** | gates closed | routing design · new test ⑭ |
| NORMS Phase 3 | **done/authorized** | deterministic N packs | `norms:check` · Claude enable |
| Suite + typecheck | **859 pass / 0 fail · tc 6/6 exit 0** · smoke durable/desktop OK | no remaining tests | 2026-07-26 |
| ISSUE cause B (claude-mem ts) | **open issue** | cache ≤1min | B-7 upstream; B-4 temp |
| RULE-ROUTER rev-7 · Phase 1 | **done** · D1–D9 확정 · D9 선포 · 32유닛 미분류 0 · pinned 13 자동 | 잔여 오너 승인 0 | `b0a6cd4`·`26923c2` |
| D7 PREREG rev-2 | **제안 완료 · 승인 대기** · 자문 N1 High(슬롯 공유 전제) 반영 · E1/E2/E3 **코드 assert 배선** | 봉인 전 replay 금지 | `checkPreregExpiry` · 31 tests |
| `smoke:uc` UC-3 | **상시 fail 2건**(host `already running` · handoff `peer_unknown`→alice) · HEAD 동일 = 회귀 아님 | 미진단 | 차집합 0 |

## Owner pending

| Decision | Why | Safe default | Evidence |
|---|---|---|---|
| **D7 리뷰어 승인** | 설계자 자기 승인 불가 · `single`은 **검증 피어를 안 띄운다**(§0.5.1) → 리뷰어 = **다음 세션**(선례 = REVIEW 헤더 "저자 = 직전 세션") 또는 오너 | 제안 상태 보류 — replay 미착수 | PREREG rev-3 §8 5문 |
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
- PREREG 계산값: pinned 2,586 · routable 5,042 · 전량 **7,628** · 최악 합집합 5,300(`dispatch`) — 전부 B_rules 9,500 이하 → M7b=0 · 만료선 E1 여유 1,872. 자문 N1 High = 슬롯 공유 전제(공존 배선이면 5,843 → 결론 반전).

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
- Re-derive the PREREG numbers by hand; self-approve the designer proposal; quote `M7b = 0` past E1.
