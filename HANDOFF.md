# HANDOFF — Loom

**Updated:** 2026-07-26
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> v0.28.1 · RULE-ROUTER **F1e 완료** — 준수 **10/10** · 대조군 0/5 · 거부 **0** · 변수는 **사용자 지시 충돌** · next = **§5.3 문안 개정**.

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | v0.28.1 · adapter `6e2df8a` | `docs/PLAN.md` |
| Dogfood | unblocked (p17 · 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | NORMS P3 · RULE-ROUTER **P2 R1 · F1 · F1b/c · F1d · F1e done** | runtime/tests · rev-11 |
| Reuse | not proven | evidence |

## Current action

### RULE-ROUTER — §5.3 문안 개정 (propose **rev-12**) → 리뷰 게이트

**Goal:** F1e가 결론을 냈다 — **주입 규칙은 사용자 지시와 경쟁하지 않는 한 따라진다**(0/21 → 4/12 → **10/10**). §5.3의 문제는 배달도 신뢰도 아니고 **충돌 시 무엇이 이기는가**다.

**Authority:** `F1E-RESULT` **§8**(들어갈 것/안 될 것) · `F1D-RESULT` §3 · propose rev-11 §5.3. 개정본은 **R{n} 게이트**(여부 WORKFLOW §5.1).

**Now:** **모델은 사용자를 택한다**(F1d 6/8). 라우터는 그 우선순위를 바꾸려 하지 말고 충돌을 **탐지·회피**하도록 설계한다.

**Line:** topology **`single`** · execution **`current-session`** · verify **`objective-commands`** · full fallback Codex→Grok→Codex

**Done when:** rev-12 §5.3 개정본 + R{n} 요청 발행.

**Must not:** 출처 표기 처방(U2 **미판정**) · 10/10을 무조건 준수율로 인용(저비용·무충돌·단일 규범) · 단일 관측 처방(rev-10 철회) · 봉인값 변경 · 리뷰 없이 Phase 3 · holdout 개봉.

## Active checks

| Check | Status | Impact | Evidence |
|---|---|---|---|
| NORMS Phase 3 | **done/authorized** | deterministic N packs | `norms:check` |
| Suite + typecheck | **889 pass / 0 fail · tc 6/6** · smoke durable/desktop OK · uc 기지 2건만 | no remaining tests | 2026-07-26 |
| ISSUE cause B (claude-mem ts) | **open issue** | cache ≤1min | B-7 upstream; B-4 temp |
| D7 PREREG rev-4 | **sealed** · 표본 60 동결(모집단 171 · digest `ad74f06d`) · E1/E2/E3 코드 assert | replay 허용 | `prereg-sample.json` |
| **Phase 2 R1** (45세션 557턴) | **M7b 0 ✓ · J-miss 0 ✓ · M7a 24.2% · recall 0.451 미달** · drift 0 · 확장 0/2 · holdout 미개봉 | **A 확정 · B/C 미구현** | `PHASE2-RESULT` |
| recall 검정력 | **부족** — positive 12턴 · 대상 11/19 무관측(가중 32/51) · 주입 파일은 Read 0 | S3-2 불가 | 결과 §5 |
| **F1d·F1e** (30런 · 봉인 `c997d42`·`e6e3007`) | F1d 4/12(대조군 0/3) → **F1e 10/10**(대조군 0/5 · 거부 **0**). 차이 = **지시 충돌 제거** · U2(출처) **천장 효과 미판정** · 확장 0 | **충돌 없으면 규칙은 따라진다** | `F1D`·`F1E-RESULT` |
| `smoke:uc` UC-3 | **상시 fail 2건**(host `already running` · handoff `peer_unknown`→alice) · HEAD 동일 = 회귀 아님 | 미진단 | 차집합 0 |

## Owner pending

| Decision | Why | Safe default | Evidence |
|---|---|---|---|
| **카테고리 표 개정** (S1-3) | `session-start`가 AGENTS standing-rules 유닛을 미조인 — 표는 **오너 선포 정본** | 현행 유지(손실 0) | 결과 §4·§6 |
| **라벨 검정력** | Read/Edit 프록시로 라우팅 가중 **63% 무관측** | **S3-2 미판정 유지**(A 확정은 이미 성립) | 결과 §5 |
| ISSUE cause B | autoUpdate reverts B-4 | open issue only (≠ closed) | `HOOK-CACHE-FIX-DESIGN` §5 |
| HOOKCACHE-D-VERIFY | optional | paused | design |
| RULE-ENFORCEABILITY | product | document only | spike |
| CONTEXT-MAP impl | separate package | not authorized | propose §8 |

## Blockers

(none)

## Invariants

- Nine HANDOFF headings; D1 ≤8192B; no `<details>`.
- Trap authority stays in `tasks/traps.md`; HANDOFF does not duplicate its sections. **Don't redo = gate-local only** — permanent norms belong to NORMS/CLAUDE/AGENTS, not here.
- `design-approved ≠ implementation-authorized`; Owner added NORMS to impl set; MAP/product remain closed.
- Topology tuple: `single/current-session/objective-commands`; lockedness alone does not delegate.
- SessionStart S = **one** `--part all`; N is a separate same-event hook only on measured Claude.
- LOADED N = outer+all pack BEGIN/END + non-empty body · no channel omission; not receipt/hash-only.
- Codex N accelerator stays off until exact model-visible token measurement; Grok stays ritual-only.
- Budget chars HARD_CAP 9500 (author `handoff:budget` · ship `handoff:check`); owner brief = status table.
- Topology single; no warm-base re-fork; p17 / PANE-DEATH U1–U11 immutable.
- Conv inject confirmation is a per-inject latch; delta-anchor tests await the anchor turn.

## Evidence

- NORMS: propose §7.3 · §11 #2/#4 · Phase 3 §12 · 3팩 3657자 · 13 tests(`norms:check`).
- OMX prior-art `e1f0aea`: gaps = claim from-state guard (`card-ops.ts:40`) · state-first. C1–C5 unauthorized.
- Routing fix: `SINGLE-TOPOLOGY-EXECUTION-DESIGN.md` · DOGFOOD §0.5. M-1 `9b205a6`.
- Handoff B `055d73e` · cause B issue `a6111e0` · DELIVERY freeze `cc03474` · approval `5b14012`.
- Rule delivery 07-23 baseline: 13,157/168,772 chars = **7.8%** auto-delivered.
- Phase 1 `26923c2`: `registry.yaml` 32유닛 · 앵커 3종 유일매치 · pin = D3 파생 · 카테고리 정본 `RULE-CATEGORIES.md`.
- F1 블록 = `<system-reminder> PreToolUse:<tool> hook additional context:` · F1b/F1c 봉인 `49cc5e9`·`171e063`.
- F1b 채점 결함: `COMPLY`=문자열 포함 → **거부를 준수로 14/14 위양성**. 수정 코드는 관측 전 선언 — 결론이 가설에 **불리**하게 이동.
- 하네스: F1d `~/.loom/f1d-poc-2026-07-26` · F1e `~/.loom/f1e-poc-2026-07-27`(probe-repo `6e39658` = 실 git·규범 실재). 채점기 digest 관측 전후 동일 · 자기검증 9/9·6/6.
- F1e 부수: 모델이 `cat docs/REPORTING.md`로 **출처 직접 검증 2/5**. `READ_*` 관측코드는 도구 **선언**을 잡은 위양성(판정 무영향). 사용자 수준 CLAUDE.md·claude-mem 유입 = 전 셀 공통.
- PREREG rev-4 sealed · receipt `rules/prereg-sample.json` · 아카이브 `~/.loom/prereg/rule-router-2026-07-26`(72MB·60세션).
- PREREG 계산값: pinned 2,586 · routable 5,042 · 전량 7,628 · 최악 합집합 5,300 → M7b=0. **자문 N1 해소**(캡 10,000/커맨드 · 총량 캡 부재).
- Phase 2 R1: 분류 입력 = 발화만 · receipt 2회 바이트 동일 · 미스 62/113 전량 **리추얼 턴 3유닛** · 턴당 26.1유닛/6,167자.

## Don't redo

- Re-split S into dual state/lessons hooks (cause A).
- Reapply retracted F6/P7 over DOGFOOD §0.5.
- Reopen the corrected single/full contradiction; implement MAP/product under NORMS authorization.
- Enable Codex N from chars/token estimates; treat Grok SessionStart stdout as N delivery.
- Claim cause B closed by B-4 re-patch; warm-base re-fork.
- Reclassify fixed R28 timeout as open regression; raise timeouts instead of preserving event/anchor order.
- Re-derive the router problem statement; re-open the rev-2 demotion; author-lane verdict; re-run the rev-4 review; re-put D1–D9 to the Owner (선포 완료).
- Re-derive PREREG numbers by hand; adjust a sealed S1–S4 value; swap samples; read the live corpus; quote `M7b = 0` past E1; open the holdout early.
- Re-open the B/C bake-off (S1-2 is AND; `M7b = 0` closed it); read recall 0.451 as an A-vs-B/C verdict; fit triggers to the observed miss list.
- Re-measure F1 delivery; treat delivery as compliance; re-run an arbitrary-token canary; read 0/21 as "JIT cannot carry rules"; reopen the channel hypothesis (F1c rejected it).
- Read F1 YES or F1d T1 as Phase 3 authorization; keep §5.3's "호출 직전 = 직접 처방" or rev-10's prescription (both retracted); cite T2/T3 signs as effect sizes (n=3); change a sealed F1d/F1e variable.
- Cite F1e 10/10 as an unconditional compliance rate; prescribe provenance from U2 (undecided by ceiling); compare F1e cells against F1d (`bare` was redefined); call the probe env clean.
