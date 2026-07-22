# HANDOFF — Loom

**Updated:** 2026-07-22
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> PATCH 3 bridge authority cut shipped (`c475604`) · next = PANE-DEATH PATCH 4 (tests-only rewrite) · default chain = Codex orchestrate → Grok implement → Codex verify.

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | v0.28.0 approved; PATCH 1–3 landed; **PATCH 4 tests-only next** | `docs/PLAN.md` |
| Dogfood | mac-node fail-closed until herdr 0.7.5/protocol 17 adapter | `docs/spikes/HERDR-0.7.5-COMPAT.md` |
| Harness | nine-section checkpoint shipped; restoration smoke passed | `docs/spikes/HANDOFF-CHECKPOINT-DESIGN.md` |
| Reuse | not proven | evidence below |

## Current action

### PANE-DEATH PATCH 4 (M4) — tests-only rewrite

**Orchestration line handoff — 세션 전체 역할 연결:**

| Choice | Orchestrator → implementation → verification/advice |
|---|---|
| **Default (previous-session inheritance)** | **Codex → Grok → Codex verification** — PATCH 3의 실제 구성 |
| Claude line | **Claude → Grok → Claude Advisor** |
| Grok line | **Grok → Grok → Claude + Codex verification**; 두 검증 레인이 불가하면 **Grok verification fallback** |
| Other CLI | 설치·인증된 다른 CLI를 선택할 수 있으며, 시작 전에 전체 역할 연결을 명시 |

Model tier: 선택된 orchestrator는 복잡·모호·설계/보안 판단에 최상위 모델을, 그 외 승인·락된 일반 작업에 차상위 모델을 사용한다. Owner가 다른 line을 고르면 즉시 override하고, 별도 선택이 없으면 Default로 바로 진행한다.

Goal:
- Rewrite §4.3 expectations around the shipped authority cut: accepted seam + real relay positives, `classifyAck` 4-way unit lock, non-accepted quarantine positives, exact-one result and pane-preservation assertions, plus approved branch test benefits.

Expected:
- Replace the **33 classified legacy failures** (`done`/auto-close assumptions, including `scrape-delta` and `herdr-lifecycle`) with proposal/blocked/pane-preserved contracts. Full suite retains only the known checkpoint/socket/offline-fixture exceptions unless those are independently resolved.

Must not change:
- **Production code 0줄**; U1–U11 / R44–R45 locks; card contract v1 or relay/conv/MCP input schema; PATCH 5 version/dist; herdr 0.7.5 adapter; Phase D automation.

Done when:
- PLAN v0.28.0 PATCH 4 test surface ships with production diff 0, §4.3 and branch-benefit coordinates fully audited, focused gates green, and full-suite residuals explicitly classified; PATCH 3 predecessor **`c475604`** is cited.

**Parallel-safe alternate (not mixed into PATCH 4 diff):** herdr 0.7.5 adapter per
`docs/spikes/HERDR-0.7.5-COMPAT.md` §6 — dogfood stays blocked until it ships.

## Active checks

| Check | Deadline | Impact | Evidence |
|---|---|---|---|
| PATCH 4 (M4) tests-only rewrite | next product gate | restores detection power for proposal/quarantine/pane preservation | `docs/PLAN.md` · host test matrix |
| herdr 0.7.5 adapter PATCH | before dogfood dispatch | unblocks mac-node / `dogfood:up` | `docs/spikes/HERDR-0.7.5-COMPAT.md` |
| Phase D automation | after two real PATCH transitions | deferred | `docs/spikes/HANDOFF-CHECKPOINT-DESIGN.md` §10 |

## Owner pending

| Decision | Why owner input is needed | Safe default while pending | Evidence |
|---|---|---|---|
| Integration-test flake track | diagnosis changes cost/scope | keep isolation recipe; do not expand scope | `tasks/todo.md` |
| HOOKCACHE-D-VERIFY resume | deferred cache verification | remain paused through this wave | `docs/spikes/HOOK-CACHE-FIX-DESIGN.md` |
| RULE-ENFORCEABILITY apply | code-enforcement layer is a product decision | document only; add no silent enforcement | `docs/spikes/RULE-ENFORCEABILITY.md` |
| PATCH 4 vs herdr adapter order | both touch host test surfaces | finish PATCH 4 first by default; herdr stays independent | `docs/spikes/HERDR-0.7.5-COMPAT.md` §5.6 |

## Blockers

| Blocker | Owner/environment | Clear condition | Safe default |
|---|---|---|---|
| herdr 0.7.5 / Loom protocol-16 mismatch | owner uses current herdr 0.7.5 | ship adapter; `HERDR_PROTOCOL_EXPECTED=17` + live smoke | dogfood fail-closed; no protocol config-only bypass |

## Invariants

- HANDOFF alone owns the next session gate; PLAN and review remain linked SSOTs.
- All nine checkpoint headings occur once; completed narrative stays outside this file.
- `HARD_CAP=9500` is platform-pinned and `SOFT_CAP=12750` is policy-only.
- `tasks/traps.md` remains the injected source for active traps and do-not-do rules.
- Windows entry is evidence only; herdr 0.7.5 adapter remains fail-closed until COMPAT done-when is met.
- Do not downgrade herdr or run a parallel 0.7.4 session.
- PATCH 1 tests-only contract = `24ceede`, PATCH 2 tower fence = `0b335a1`, PATCH 3 authority cut = `c475604`; PATCH 4 may change tests only.
- Every gate handoff records the full actual chain (orchestrator → implementation → verification/advice), the inherited next-session default, and configured choices. Owner override wins; otherwise the prior session's full chain is inherited.

## Evidence

- Product plan/review: `docs/PLAN.md` · `docs/plan_review.md` · `docs/reviews/PANEDEATH-R45.md`
- PATCH 1 red contract: `24ceede` · `bridge.test.ts` · `pane-cleanup.test.ts` · `impl-0270.test.ts`
- PATCH 2 tower fence: `0b335a1` · `packages/host/src/card-ops.ts` · MCP/HERDR/DISPATCH public docs
- PATCH 3 authority cut: `c475604` · production 6파일 + `docs/PLAN.md` implementation record
- PATCH 3 verification: host·CLI typecheck, static done/close gates, quarantine/CLI/classifier smoke; full suite 691 pass / 8 skip / 37 classified fail
- Continuity design/lock: `docs/spikes/HANDOFF-CHECKPOINT-DESIGN.md` · `docs/spikes/SESSION-CONTINUITY-PHASE-C-LOCK.md`
- herdr 0.7.5 release-notes + schema impact map: `docs/spikes/HERDR-0.7.5-COMPAT.md`
- Current execution and verification provenance: `docs/HANDOFF_ARCHIVE.md`
- Orchestration-line selection: `docs/DOGFOOD_LOOP.md` §0.5; subordinate lane roster/escalation: §1·§1.2 · `AGENTS.md`
- Traps and lessons: `tasks/traps.md` · `tasks/lessons.md`
- Windows entry: `HANDOFF_WINDOWS.md`

## Don't redo

- Phase B `e281587` · Phase C `8a3ddba` · **PATCH 1 `24ceede`** · **PATCH 2 `0b335a1`** · **PATCH 3 `c475604`**.
- Reopen PANE-DEATH U1–U11/R44/R45 locks or treat `card.done`/pane exit as completion authority.
- Raise `HARD_CAP`, create a WORKLOG/ROADMAP/front matter, or promote Phase D lint automation early.
- Downgrade herdr, dual 0.7.4 session, or config-only `herdrProtocol=17` ping greenwash.
- Re-research 0.7.5 agent facade from scratch — COMPAT §2–§3 already maps release notes to wire contracts.
- Reopen PATCH 1–3, add production changes to PATCH 4, or mix PATCH 5 dist/version into it.
