# HANDOFF — Loom

**Updated:** 2026-07-26
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> v0.28.1 · RULE-ROUTER **Phase 2 라운드 1 완료** — `M7b = 0` 실측 → **A 확정 · B/C 미구현** · next = **F1 PoC 실측**.

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | v0.28.1 · adapter `6e2df8a` | `docs/PLAN.md` |
| Dogfood | unblocked (p17 · 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | NORMS P3 · RULE-ROUTER **Phase 2 R1 done** | runtime/tests · rev-9 |
| Reuse | not proven | evidence |

## Current action

### RULE-ROUTER — F1: PreToolUse 비차단 주입 PoC 실측

**Goal:** Phase 3 **선결**을 닫는다 — PreToolUse hook이 **차단 없이** 컨텍스트를 주입하는가를 실측. A3는 차단 선례일 뿐 비차단 증거가 아니다(F1 · High).

**Authority:** propose **rev-9** §7 Phase 3 선결(fail-closed — 미실측이면 Phase 3 미착수). Phase 2는 닫혔다: `M7b = 0` → §6.5.5 중단 규칙 → **A 채택 확정 · B/C 미구현**. 오너 결정 2건은 **F1을 막지 않는다**(별개 축).

**Now:** PoC — PreToolUse append-only 주입 시 ① 도구 실행 지연·차단 여부 ② 모델 가시 채널 실도달(수신 실증 · 영수증/해시 아님) ③ hook당 10,000 chars 캡과의 관계.

**Line:** topology **`single`** · execution **`current-session`** · verify **`objective-commands`** · full fallback Codex→Grok→Codex

**Done when:** 비차단 여부 **실증 로그 + 판정** 기록. 부정이면 Phase 3은 그대로 닫힌 채로 남는다(그것도 결과다).

**Must not:** 봉인값 사후 조정 · 표본 교체 · 원본 코퍼스 사용 · **holdout 개봉**(최종 확정 1회용 · 미사용) · 관측된 미스 목록을 보고 트리거 확장(12턴 적합) · F1 실측 전 Phase 3.

## Active checks

| Check | Status | Impact | Evidence |
|---|---|---|---|
| NORMS Phase 3 | **done/authorized** | deterministic N packs | `norms:check` |
| Suite + typecheck | **889 pass / 0 fail · tc 6/6 exit 0** · smoke durable/desktop OK · uc 기지 2건만 | no remaining tests | 2026-07-26 |
| ISSUE cause B (claude-mem ts) | **open issue** | cache ≤1min | B-7 upstream; B-4 temp |
| D7 PREREG rev-4 | **sealed** · 표본 60 동결(모집단 171 · digest `ad74f06d`) · E1/E2/E3 코드 assert | replay 허용 | `prereg-sample.json` |
| **Phase 2 R1** (45세션 557턴) | **M7b 0 ✓ · J-miss 0 ✓ · M7a 24.2%(S1-3) · recall 0.451 미달** · drift 0 · 확장 0/2 · holdout 미개봉 | **A 확정 · B/C 미구현** | `PHASE2-RESULT.md` |
| recall 검정력 | **부족** — positive 12턴 · 대상 **11/19 무관측**(가중 32/51); traps·SESSION-START는 주입이라 Read 0 | S3-2 판정 불가 | 결과 §5 |
| `smoke:uc` UC-3 | **상시 fail 2건**(host `already running` · handoff `peer_unknown`→alice) · HEAD 동일 = 회귀 아님 | 미진단 | 차집합 0 |

## Owner pending

| Decision | Why | Safe default | Evidence |
|---|---|---|---|
| **카테고리 표 개정** (S1-3 발동) | `session-start`가 AGENTS.md standing-rules 유닛(verify·env·impl-delegation)을 미조인 — 표는 **오너 선포 정본** | 현행 유지(주입 무변경 = 안전 손실 0) | 결과 §4·§6 |
| **라벨 검정력** | Read/Edit 프록시로 라우팅 가중 **63% 무관측** | **S3-2 미판정 유지**(A 확정은 이미 성립) | 결과 §5 |
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

- NORMS: propose §7.3 · §11 #2/#4 · Phase 3 §12 · 3팩 3657 chars · 13 tests (해시는 `norms:check`).
- OMX prior-art `e1f0aea`: gaps = claim from-state guard (`card-ops.ts:40`) · state-first. C1–C5 unauthorized.
- Routing fix: `SINGLE-TOPOLOGY-EXECUTION-DESIGN.md` · DOGFOOD §0.5. M-1 `9b205a6`.
- Handoff B `055d73e` · cause B issue `a6111e0` · DELIVERY freeze `cc03474` · approval `5b14012`.
- Product: PLAN 0.28.1 · R46 · adapter `6e2df8a`.
- Rule delivery 07-23 baseline: 13,157/168,772 chars = **7.8%** auto-delivered.
- Phase 1 `26923c2`: `rules/registry.yaml` 32유닛 · 앵커 3종 유일매치 · pin = D3 파생(코드 강제) · 카테고리 정본 `RULE-CATEGORIES.md`.
- RULE-ROUTER review F1–F4 전건 rev-5 fold-in; **F1(JIT 비차단 주입 미실측 · High)만 잔존** = 다음 게이트.
- PREREG rev-4 sealed · receipt `rules/prereg-sample.json` · 아카이브 `~/.loom/prereg/rule-router-2026-07-26`(72MB·60세션).
- PREREG 계산값: pinned 2,586 · routable 5,042 · 전량 **7,628** · 최악 합집합 5,300 — 전부 9,500 이하 → M7b=0 · E1 여유 1,872. 자문 N1 = 슬롯 공유 전제(공존이면 5,843 → 반전).
- Phase 2 R1: `rule-router-eval.ts` 분류 입력 = 발화만(무누설) · receipt 2회 바이트 동일 · 미스 62/113 전량이 **리추얼 턴 3유닛**(AGENTS.md 전문 Read = 파일 단위 라벨) · 턴당 26.1유닛/6,167 chars(19% 절감).

## Don't redo

- Re-split S into dual state/lessons hooks (cause A).
- Reapply retracted F6/P7 over DOGFOOD §0.5; interpret `single` as a Grok dispatch.
- Reopen the corrected single/full contradiction; implement MAP/product under NORMS authorization.
- Enable Codex N from chars/token estimates; treat Grok SessionStart stdout as N delivery.
- Claim cause B closed by B-4 re-patch; warm-base re-fork; Grok stdout = S full.
- Bare status as wave; permanent nine-axis slim-delete.
- Reclassify fixed R28 timeout as open regression; raise timeouts instead of preserving event/anchor order.
- Re-derive the router problem statement; re-open the rev-2 demotion; author-lane verdict; re-run the rev-4 review; re-put D1–D9 to the Owner (선포 완료).
- Pre-claim before dispatch (§1.1 forbids; rule 5 fixed `1a22a9c`; commands stay valid).
- Re-derive the PREREG numbers by hand; adjust any sealed S1–S4 value; swap sample sessions; read the live corpus instead of the frozen archive; quote `M7b = 0` past E1.
- Re-open the B/C bake-off (S1-2 is AND; `M7b = 0` closed it); read recall 0.451 as an A-vs-B/C verdict; fit triggers to the observed miss list; open the holdout early.
