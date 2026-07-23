# HANDOFF — Loom

**Updated:** 2026-07-22
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> Loom v0.28.1 release close complete/shipped; source through `6e2df8a` · docs as-built 0.28 wave landed · next = Phase D automation · topology **single** (harness; session=Grok) · line glossary `DOGFOOD_LOOP` §0.5.

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | v0.28.1 release close completed; adapter source through `6e2df8a` | `docs/PLAN.md` |
| Dogfood | unblocked (protocol 17 + live 3-kind + `dogfood:herdr` ok) | `docs/spikes/HERDR-0.7.5-COMPAT.md` |
| Harness | Phase C shipped; Phase D eligible after two real PATCH transitions | `docs/spikes/HANDOFF-CHECKPOINT-DESIGN.md` |
| Reuse | not proven | evidence below |

## Current action

### SESSION-CONTINUITY Phase D automation

**Orchestration line handoff** — SSOT: `docs/DOGFOOD_LOOP.md` §0.5 (**line** = 전체 역할 연결 · **lane** = line 안 역할/피어 · 축 A 벤더 체인 × 축 B 토폴로지 `full`/`single`).

| Axis | Choice | Notes |
|---|---|---|
| **Topology (B) — this wave Default** | **`single`** | harness Phase D · 분량 소 · 결정 적음. 세션=Grok이면 디스패치 없이 구현+명령 검증+ship. 검증 생략 아님. 복잡 결정 시 **`full` 승격** |
| **Vendor chain (A) — inherited full default** | **Codex → Grok → Codex verify** | adapter wave actual; `full` 복귀 시 사용 |
| Claude line | Claude → Grok → Claude Advisor | Owner override |
| Grok line | Grok → Grok → Claude+Codex verify (else Grok verify fallback) | ≠ `single` |
| Other CLI | 세 역할+fallback 명시 후 | Owner override |

Model tier: orchestrator는 복잡·모호·설계/보안에 최상위, 그 외 승인·락 작업에 차상위. Owner line/topology override wins; else HANDOFF inheritance.

**실행 옵션 (2026-07-23):** Phase D·하네스 = **topology `single` + session Grok**. Product/락 인접·복잡 결정 = **`full`** + 위 벤더 체인. `full`에서 Grok headless 불완주 시 `codex-impl` → Grok read-only verify, 둘 다 불가 시 lower-tier in-harness.

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
- Every gate handoff records actual **vendor chain + topology** (`full`/`single`) as next-session default. Owner override wins; else prior session inheritance (`DOGFOOD_LOOP` §0.5).

## Evidence

- Product: `docs/PLAN.md` · `docs/plan_review.md` · R46 / Fable advisor consulted: yes
- Adapter commits: fixture `194d901` → client `c0fcc00` → bridge `1284eef` → coverage `e538cad` · live fixes launch `848675f`/`5ac6d31` · named `edf3b59`/`48ecba3` · migrate `9f13b47`/`8ebfd11` · identity `1351add`/`6e2df8a`
- Live 3-kind (claude/codex/grok) + dogfood:herdr ok + dogfood:up exit 0
- Host **462/0**; first full **761/2** classified as checkpoint hardcode drift only; authoritative final full **763/0** (2760 expect, 58 files, 302.48s); checkpoint **24/0**
- Version/dist: release close complete, dist green, CLI Loom v0.28.1; COMPAT/PLAN/archive/DOGFOOD/Windows/traps
- Continuity: `docs/spikes/HANDOFF-CHECKPOINT-DESIGN.md` · Phase C `8a3ddba`
- Docs as-built (0.28.1): `docs/CHANGELOG.md` · `docs/ARCHITECTURE.md` · `docs/USER_GUIDE.md` · `docs/HERDR_DESIGN.md` banner · `docs/TEST_PLAN.md` UC-15–18 · `index.md` · `docs/DOC-REFRESH-PLAN.md` (philosophy-first)
- Provenance: `docs/HANDOFF_ARCHIVE.md` · traps `tasks/traps.md` · Windows `HANDOFF_WINDOWS.md`
- Line/lane + topology `full`/`single`: `docs/DOGFOOD_LOOP.md` §0.5 (2026-07-23)

## Don't redo

- Protocol research · COMPAT §2–§3 re-map from scratch.
- Launch readiness / named target / config migration / collision-free identity fixes already shipped.
- herdr downgrade · dual 0.7.4 · config-only `herdrProtocol=17` greenwash.
- Reopen PANE-DEATH U1–U11 or treat `card.done`/pane exit as completion authority.
- Phase B `e281587` · Phase C `8a3ddba` · PANE-DEATH PATCH 1–5 · adapter source through `6e2df8a`.
- Rerun already-green live 3-kind / dogfood smokes absent a new defect.
- Phase E / ROADMAP before Phase D bounded automation lands.
