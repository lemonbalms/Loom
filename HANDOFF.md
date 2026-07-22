# HANDOFF — Loom

**Updated:** 2026-07-22
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> Loom v0.28.1 release close complete/shipped; source through `6e2df8a` · next = Phase D automation · default chain = Codex orchestrate → Grok implement → Codex verify.

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | v0.28.1 release close completed; adapter source through `6e2df8a` | `docs/PLAN.md` |
| Dogfood | unblocked (protocol 17 + live 3-kind + `dogfood:herdr` ok) | `docs/spikes/HERDR-0.7.5-COMPAT.md` |
| Harness | Phase C shipped; Phase D eligible after two real PATCH transitions | `docs/spikes/HANDOFF-CHECKPOINT-DESIGN.md` |
| Reuse | not proven | evidence below |

## Current action

### SESSION-CONTINUITY Phase D automation

**Orchestration line handoff — 세션 전체 역할 연결:**

| Choice | Orchestrator → implementation → verification/advice |
|---|---|
| **Default (previous-session inheritance)** | **Codex → Grok → Codex verification** — adapter wave actual chain |
| Claude line | **Claude → Grok → Claude Advisor** |
| Grok line | **Grok → Grok → Claude + Codex verification**; 두 검증 레인이 불가하면 **Grok verification fallback** |
| Other CLI | 설치·인증된 다른 CLI를 선택할 수 있으며, 시작 전에 전체 역할 연결을 명시 |

Model tier: 선택된 orchestrator는 복잡·모호·설계/보안 판단에 최상위 모델을, 그 외 승인·락된 일반 작업에 차상위 모델을 사용한다. Owner가 다른 line을 고르면 즉시 override하고, 별도 선택이 없으면 Default로 바로 진행한다.

**실행 옵션 기록 (2026-07-22):** Default = Codex orchestration → Grok 4.5 headless implementation → Codex verification. Grok headless가 반복 불완주하면 `codex-impl` 구현 → Grok read-only 검증으로 하강하고, 두 외부 CLI가 모두 불가할 때만 lower-tier in-harness 구현으로 내린다.

Goal:
- Implement the already-adopted Phase D **bounded automation** only: (1) shared-heading lint structure checks, (2) status parser fail-loud on malformed/unknown, (3) actual SessionStart vs no-hook path equivalence tests.

Expected:
- tests / `handoff:lint` / `bun run status` green with **no product behavior change**.

Must not change:
- product/card/relay/conv/herdr semantics; PANE-DEATH U1–U11; protocol caps; nine-section HANDOFF shape; ROADMAP / Phase E.

Done when:
- Phase D tests and handoff lint/status green, docs synced, commit/push.

## Active checks

| Check | Deadline | Impact | Evidence |
|---|---|---|---|
| Phase D automation | next harness gate (product-independent) | lint/status fail-loud + SessionStart equivalence | `docs/spikes/HANDOFF-CHECKPOINT-DESIGN.md` §10 |
| UK-5..UK-9 observations | nonblocking | follow-up only | `docs/PLAN.md` |
| Integration-test flake track | owner-pending | keep isolation recipe | `tasks/todo.md` |

## Owner pending

| Decision | Why owner input is needed | Safe default while pending | Evidence |
|---|---|---|---|
| Integration-test flake track | diagnosis changes cost/scope | keep isolation recipe; do not expand scope | `tasks/todo.md` |
| HOOKCACHE-D-VERIFY resume | deferred cache verification | remain paused through this wave | `docs/spikes/HOOK-CACHE-FIX-DESIGN.md` |
| RULE-ENFORCEABILITY apply | code-enforcement layer is a product decision | document only; add no silent enforcement | `docs/spikes/RULE-ENFORCEABILITY.md` |

## Blockers

(none)

## Invariants

- HANDOFF alone owns the next session gate; PLAN and review remain linked SSOTs.
- All nine checkpoint headings occur once; completed narrative stays outside this file.
- `HARD_CAP=9500` is platform-pinned and `SOFT_CAP=12750` is policy-only.
- Adapter locks immutable: 0.7.5/protocol **17 only**; no config-only bypass; exact named agent target; fail-closed identity (`agent_name_unrepresentable`).
- PANE-DEATH U1–U11 / R44–R45 locks immutable; nine headings/caps; full chain inheritance.
- Do not downgrade herdr or run a parallel 0.7.4 session.
- PATCH 1–5 `24ceede`→`d49a6b1`; adapter `194d901`→`6e2df8a` immutable unless a new reproduced defect or R{n} changes the contract.
- Every gate handoff records the full actual chain and inherited next-session default. Owner override wins; otherwise prior session full chain is inherited.

## Evidence

- Product: `docs/PLAN.md` · `docs/plan_review.md` · R46 / Fable advisor consulted: yes
- Adapter commits: fixture `194d901` → client `c0fcc00` → bridge `1284eef` → coverage `e538cad` · live fixes launch `848675f`/`5ac6d31` · named `edf3b59`/`48ecba3` · migrate `9f13b47`/`8ebfd11` · identity `1351add`/`6e2df8a`
- Live 3-kind (claude/codex/grok) + dogfood:herdr ok + dogfood:up exit 0
- Host **462/0**; first full **761/2** classified as checkpoint hardcode drift only; authoritative final full **763/0** (2760 expect, 58 files, 302.48s); checkpoint **24/0**
- Version/dist: release close complete, dist green, CLI Loom v0.28.1; COMPAT/PLAN/archive/DOGFOOD/Windows/traps
- Continuity: `docs/spikes/HANDOFF-CHECKPOINT-DESIGN.md` · Phase C `8a3ddba`
- Provenance: `docs/HANDOFF_ARCHIVE.md` · traps `tasks/traps.md` · Windows `HANDOFF_WINDOWS.md`

## Don't redo

- Protocol research · COMPAT §2–§3 re-map from scratch.
- Launch readiness / named target / config migration / collision-free identity fixes already shipped.
- herdr downgrade · dual 0.7.4 · config-only `herdrProtocol=17` greenwash.
- Reopen PANE-DEATH U1–U11 or treat `card.done`/pane exit as completion authority.
- Phase B `e281587` · Phase C `8a3ddba` · PANE-DEATH PATCH 1–5 · adapter source through `6e2df8a`.
- Rerun already-green live 3-kind / dogfood smokes absent a new defect.
- Phase E / ROADMAP before Phase D bounded automation lands.
