# HANDOFF — Loom

**Updated:** 2026-07-22
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> PATCH 4 tests-only rewrite shipped (`f9b0230`) · next = PANE-DEATH PATCH 5 (version/dist/docs close) · default chain = Codex orchestrate → Grok implement → Codex verify.

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | v0.28.0 approved; PATCH 1–4 landed; **PATCH 5 release close next** | `docs/PLAN.md` |
| Dogfood | mac-node fail-closed until herdr 0.7.5/protocol 17 adapter | `docs/spikes/HERDR-0.7.5-COMPAT.md` |
| Harness | nine-section checkpoint shipped; restoration smoke passed | `docs/spikes/HANDOFF-CHECKPOINT-DESIGN.md` |
| Reuse | not proven | evidence below |

## Current action

### PANE-DEATH PATCH 5 (M5) — version/dist/config/status/docs close

**Orchestration line handoff — 세션 전체 역할 연결:**

| Choice | Orchestrator → implementation → verification/advice |
|---|---|
| **Default (previous-session inheritance)** | **Codex → Grok → Codex verification** — PATCH 4의 실제 구성 |
| Claude line | **Claude → Grok → Claude Advisor** |
| Grok line | **Grok → Grok → Claude + Codex verification**; 두 검증 레인이 불가하면 **Grok verification fallback** |
| Other CLI | 설치·인증된 다른 CLI를 선택할 수 있으며, 시작 전에 전체 역할 연결을 명시 |

Model tier: 선택된 orchestrator는 복잡·모호·설계/보안 판단에 최상위 모델을, 그 외 승인·락된 일반 작업에 차상위 모델을 사용한다. Owner가 다른 line을 고르면 즉시 override하고, 별도 선택이 없으면 Default로 바로 진행한다.

**실행 옵션 기록·PATCH 5 승계 (2026-07-22):** Default는 Codex orchestration → Grok 4.5 headless implementation → Codex verification. herdr pane은 protocol-16/17 불일치 동안 fail-closed. Grok headless가 반복 불완주하면 `codex-impl` 구현 → Grok read-only(`dontAsk` + `sandbox read-only`) 검증으로 내려 발견자≠수정자를 보존하고, 두 외부 CLI가 모두 불가할 때만 lower-tier in-harness 구현으로 하강한다.

Goal:
- Bump CLI/MCP versions to 0.28.0, rebundle both dist lanes, and close the config/status/docs wording required by U10·U11.

Expected:
- CLI `VERSION` and MCP `serverInfo.version` both report 0.28.0; `paneCleanup` says card workers are preserved; bridge status exposes unresolved quarantine and preserved-card-pane counts; dist guard and full suite are classified.

Must not change:
- U1–U11 / R44–R45 locks; card contract v1 or relay/conv/MCP input schema; herdr 0.7.5 adapter; Phase D automation; PATCH 4 tests (`f9b0230`) except a newly reproduced test defect.

Done when:
- PLAN v0.28.0 PATCH 5 target files, both version coordinates, status/config wording, rebuilt dist, docs, typecheck, dist guard, and full-suite residual classification ship with PATCH 4 predecessor **`f9b0230`** cited.

**Parallel-safe alternate (not mixed into PATCH 5 diff):** herdr 0.7.5 adapter per
`docs/spikes/HERDR-0.7.5-COMPAT.md` §6 — dogfood stays blocked until it ships.

## Active checks

| Check | Deadline | Impact | Evidence |
|---|---|---|---|
| PATCH 5 (M5) release close | next product gate | publishes 0.28.0 version/dist and operator wording | `docs/PLAN.md` · dist guard |
| herdr 0.7.5 adapter PATCH | before dogfood dispatch | unblocks mac-node / `dogfood:up` | `docs/spikes/HERDR-0.7.5-COMPAT.md` |
| Phase D automation | after two real PATCH transitions | deferred | `docs/spikes/HANDOFF-CHECKPOINT-DESIGN.md` §10 |

## Owner pending

| Decision | Why owner input is needed | Safe default while pending | Evidence |
|---|---|---|---|
| Integration-test flake track | diagnosis changes cost/scope | keep isolation recipe; do not expand scope | `tasks/todo.md` |
| HOOKCACHE-D-VERIFY resume | deferred cache verification | remain paused through this wave | `docs/spikes/HOOK-CACHE-FIX-DESIGN.md` |
| RULE-ENFORCEABILITY apply | code-enforcement layer is a product decision | document only; add no silent enforcement | `docs/spikes/RULE-ENFORCEABILITY.md` |
| PATCH 5 vs herdr adapter order | both touch host/CLI surfaces | finish PATCH 5 first by default; herdr stays independent | `docs/spikes/HERDR-0.7.5-COMPAT.md` §5.6 |

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
- PATCH 1 tests-only contract = `24ceede`, PATCH 2 tower fence = `0b335a1`, PATCH 3 authority cut = `c475604`, PATCH 4 tests-only rewrite = `f9b0230`; PATCH 5 owns version/dist/docs close.
- 후속 PATCH 위임 전 직전 PATCH의 `docs/HANDOFF_ARCHIVE.md` 실행 원장 + 해당 `implementation-notes.md` deviation + 워커 최종/수정 라운드를 대조한다. HANDOFF의 “shipped” 요약만으로 후속 브리프를 만들지 않는다.
- Every gate handoff records the full actual chain (orchestrator → implementation → verification/advice), the inherited next-session default, and configured choices. Owner override wins; otherwise the prior session's full chain is inherited.

## Evidence

- Product plan/review: `docs/PLAN.md` · `docs/plan_review.md` · `docs/reviews/PANEDEATH-R45.md`
- PATCH 1 red contract: `24ceede` · `bridge.test.ts` · `pane-cleanup.test.ts` · `impl-0270.test.ts`
- PATCH 2 tower fence: `0b335a1` · `packages/host/src/card-ops.ts` · MCP/HERDR/DISPATCH public docs
- PATCH 3 authority cut: `c475604` · production 6파일 + `docs/PLAN.md` implementation record
- PATCH 3 verification: host·CLI typecheck, static done/close gates, quarantine/CLI/classifier smoke; full suite 691 pass / 8 skip / 37 classified fail
- PATCH 4 tests-only rewrite: `f9b0230` · 10 test/harness files · production diff 0 · focused 165 pass / 1 known macOS socket fail · typecheck 6/6 · full 738 pass / 5 fail (known 4 + one non-reproducing suite-order timeout; isolated rerun 30/0)
- Continuity design/lock: `docs/spikes/HANDOFF-CHECKPOINT-DESIGN.md` · `docs/spikes/SESSION-CONTINUITY-PHASE-C-LOCK.md`
- herdr 0.7.5 release-notes + schema impact map: `docs/spikes/HERDR-0.7.5-COMPAT.md`
- Current execution and verification provenance: `docs/HANDOFF_ARCHIVE.md`
- Orchestration-line selection: `docs/DOGFOOD_LOOP.md` §0.5; subordinate lane roster/escalation: §1·§1.2 · `AGENTS.md`
- Traps and lessons: `tasks/traps.md` · `tasks/lessons.md`
- Windows entry: `HANDOFF_WINDOWS.md`

## Don't redo

- Phase B `e281587` · Phase C `8a3ddba` · **PATCH 1 `24ceede`** · **PATCH 2 `0b335a1`** · **PATCH 3 `c475604`** · **PATCH 4 `f9b0230`**.
- Reopen PANE-DEATH U1–U11/R44/R45 locks or treat `card.done`/pane exit as completion authority.
- Raise `HARD_CAP`, create a WORKLOG/ROADMAP/front matter, or promote Phase D lint automation early.
- Downgrade herdr, dual 0.7.4 session, or config-only `herdrProtocol=17` ping greenwash.
- Re-research 0.7.5 agent facade from scratch — COMPAT §2–§3 already maps release notes to wire contracts.
- Reopen PATCH 1–4 or mix the herdr 0.7.5 adapter into PATCH 5.
