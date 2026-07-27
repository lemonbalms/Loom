# HANDOFF — Loom

**Updated:** 2026-07-28
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> v0.28.1 · P3.0 JIT shipped · DELIVERED ok · **next = model canary n=10** (live=1 금지).

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | v0.28.1 · adapter `6e2df8a` | `docs/PLAN.md` |
| Dogfood | unblocked (p17 · 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | NORMS P3 · RULE-ROUTER **P3.0 code ready · model gate open** | PHASE3-* · HEAD `8fc8748` |
| Reuse | not proven | evidence |

## Current action

### RULE-ROUTER — Phase 3.0 모델 준수 카나리아 (PREREG n=10)

**Goal:** sealed PREREG로 **base×5 + jit×5** 모델 런 → G0·T1/T1(b) → RESULT **rev-2**. 통과 전 `LOOM_RULE_ROUTER_JIT=1` 금지.

**Authority (read first):**
1. `docs/spikes/RULE-ROUTER-PHASE3-PREREG.md` rev-1 sealed (`bafa81f`) — cells/prompt/판정 **불변**
2. `docs/spikes/RULE-ROUTER-PHASE3-SPEC.md` rev-1
3. `docs/spikes/RULE-ROUTER-PHASE3-RESULT.md` rev-1 (결정론만 기록)
4. `scripts/rule-router-jit.ts` · fixture `orch.model-explicit` · body sha8 **`de04b1fa`**
5. 하네스 선례: `~/.loom/f1e-poc-2026-07-27` (proxy·runner 패턴)

**Now (next session playbook):**
1. `bun run status` · `bun test scripts/rule-router-jit.test.ts` (11 green 기대)
2. 채점기·캡처 스크립트 작성 (**관측 전** digest 고정) → 증거 `~/.loom/phase3-0-canary-YYYY-MM-DD/`
3. **base×5:** `LOOM_RULE_ROUTER_JIT` unset/off · PREREG §2.3 프롬프트 축자 · Agent/Task 1회
4. **jit×5:** `LOOM_RULE_ROUTER_JIT=canary` only · 동일 프롬프트 · fixture 강제
5. 채점: DELIVERED · TOOL_RAN · COMPLY(= `tool_input.model` 비공백) · G0/T1/T1(b)
6. `PHASE3-RESULT` **rev-2** · HANDOFF 갱신 · ship. **PREREG 파일 편집 금지.**

**Line:** topology **`single`** · execution **`current-session`** · verify **`objective-commands`** · full fallback Codex→Grok→Codex

**Done when:** RESULT rev-2 with G0+T1/T1(b) · opt-in 조건 명시 · live default-on still no.

**Must not:** peek 후 PREREG 변경 · live=1 pre-pass · default-on · U2 처방 · pin=회피 · 본문 하드코딩 · 10k truncate · holdout 개봉.

## Active checks

| Check | Status | Impact | Evidence |
|---|---|---|---|
| NORMS Phase 3 | **done** | N packs | `norms:check` |
| P3.0 unit tests | **11/11** | hook path | `rule-router-jit.test.ts` |
| P3.0 stdin canary | **DELIVERED** | fixture path | RESULT rev-1 |
| P3.0 model n=10 | **pending** | blocks live=1 | PREREG |
| §5.3 rev-13 | **approved** · M-1 fold-in | 문안 | REVIEW-rev-13 · `b099733` |
| Phase 2 R1 | **A 확정** · M7b 0 | bake-off 닫힘 | PHASE2-RESULT |
| ISSUE cause B | open | cache ≤1min | B-7 |
| `smoke:uc` UC-3 | fail 2 비회귀 | 미진단 | — |

## Owner pending

| Decision | Why | Safe default | Evidence |
|---|---|---|---|
| 카테고리 표 (S1-3) | standing-rules 미조인 | 현행 | PHASE2 §4·§6 |
| 라벨 검정력 | 63% 무관측 | S3-2 미판정 | PHASE2 §5 |
| ISSUE cause B | autoUpdate reverts B-4 | open issue | HOOK-CACHE |
| HOOKCACHE-D-VERIFY | optional | paused | design |
| CONTEXT-MAP | separate package | not authorized | propose |

## Blockers

(none)

## Invariants

- Nine headings; D1 ≤8192B; no `<details>`; traps only in `tasks/traps.md`.
- Topology `single/current-session/objective-commands`; lockedness ≠ auto-delegate.
- design-approved ≠ impl-authorized; MAP/product closed under NORMS-only auth.
- S = one `--part all`; N Claude measured; Codex N off; Grok ritual-only.
- HARD_CAP 9500; owner brief = `bun run status` only.
- pin/전량 ≠ 충돌 회피 (REVIEW-rev-13 M-1).
- **P3.0 PREREG sealed → immutable until RESULT rev-2.**
- JIT env unset = **off** (deviation: not dry-run default) · live=1 only after T1/T1(b).

## Evidence

- HEAD `8fc8748` (jit hook) · PREREG seal `bafa81f` · §5.3 review `b099733`.
- Paths: `scripts/rule-router-jit.ts` · `.claude/settings.json` (guard then jit).
- Docs: PHASE3-SPEC · PHASE3-PREREG · PHASE3-RESULT rev-1 · REVIEW-rev-13.
- Fixture body sha8 `de04b1fa` · unit `orch.model-explicit` · ROUTER_VERSION A-1.
- F1e harness `~/.loom/f1e-poc-2026-07-27` · Phase 2 A · registry 32.

## Don't redo

- Dual SessionStart hooks; F6/P7 over DOGFOOD §0.5; MAP under NORMS-only.
- Codex N from char estimates; Grok stdout as N delivery.
- Cause B closed by B-4; warm-base re-fork; reopen sealed F1*/D7/P3.0 PREREG.
- §5.3 “직접 처방”; 10/10 unconditional; U2 provenance Rx.
- pin as conflict avoidance; live=1 before T1; default-on; hardcode bodies; silent 10k truncate.
- Re-derive router problem; author-self-approve design without spike REVIEW when required.
