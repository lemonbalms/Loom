# HANDOFF — Loom

**Updated:** 2026-07-23
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> Loom v0.28.1 · SESSION-START DELIVERY 0a–2 **shipped** · next = handoff B or Owner track.

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | v0.28.1 release close; adapter `6e2df8a` | `docs/PLAN.md` |
| Dogfood | unblocked (protocol 17 · live 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | inject ops **done**; SESSION-START DELIVERY **0a–2 done**; handoff B queued | `docs/SESSION-START.md` L0 |
| Reuse | not proven | evidence |

## Current action

### Post-DELIVERY: Handoff authoring B or Owner product track

**Goal:** After SESSION-START-DELIVERY 0a–2, pick the next harness/product track without reopening NORMS/MAP.

**Authority:** DELIVERY shipped (L0 · adapters · triggers · Codex hooks). Owner approval `5b14012` still limits implementation to DELIVERY only — NORMS/MAP remain design-approved only.

**Session start:**

1. `bun run status` · `bun run handoff:check`; L0 = `docs/SESSION-START.md`.
2. Default next: **Handoff 작성 도우미 (B)** from `HANDOFF-AUTHORING-OPT-PROPOSE.md`, or Owner product track (WP5-f / idle).
3. Do **not** implement NORMS-RECEIPT or CONTEXT-MAP without a new authorization decision.

**Line:** topology **`single`** · full chain when needed = Codex→Grok→Codex.

**Done when:** B shipped or Owner picks product/idle with HANDOFF updated.

**Must not:** NORMS/MAP implementation; Grok SessionStart stdout as S full; permanent nine-axis slim-delete; product/herdr without Owner track pick.

## Active checks

| Check | Deadline | Impact | Evidence |
|---|---|---|---|
| DELIVERY Phase 0a L0/trigger split | **done** | session SSOT | `docs/SESSION-START.md` · AGENTS trigger table |
| DELIVERY Phase 1–2 adapters/tests | **done** | 3-host S wire | END markers · `--format` · `.codex/hooks.json` · trigger tests |
| Handoff 확인 템플릿 (A) | **absorbed** | owner readability | DELIVERY Template A/S/R |
| Handoff 작성 도우미 (B) | **queued** | author budget safety | `HANDOFF-AUTHORING-OPT-PROPOSE.md` |
| Inject ops (nine · omit · STATE_TARGET · handoff:check) | **done** | restore model | `b935969` · `240a0df` · `22eb76e` |
| Owner product track | after B or pick | WP5-f / product / idle | Owner pending |

## Owner pending

| Decision | Why | Safe default | Evidence |
|---|---|---|---|
| After handoff-opt: WP5-followup / product / idle | product direction | **idle** until pick | todo · HOOK-CACHE |
| Integration-test flake | cost/scope | isolation recipe | todo |
| HOOKCACHE-D-VERIFY | with WP5-followup | paused | `HOOK-CACHE-FIX-DESIGN.md` |
| RULE-ENFORCEABILITY | product | document only | spike |

## Blockers

(none)

## Invariants

- HANDOFF: nine headings; D1 ≤8192B; no `<details>`; owns next gate.
- rev-3: design-approved DELIVERY/NORMS/MAP; implementation subset = **DELIVERY only** (`5b14012`).
- S full requires BEGIN+matching END per part; status = **view**; inject = **nine + traps**.
- Budget = **chars** (HARD_CAP 9500); drop = **whole section** + `inject omitted:`. Pinned: status · Current action · traps.
- Prefer raw ≤ **STATE_TARGET 7500**; ship handoff edits with `bun run handoff:check`.
- Owner brief ≠ inject dump. Template **S**/`상태` never auto-waves.
- Fail-loud `unknown/malformed`; Open(blocking) markdown **table**.
- Topology **single** default; line ≠ lane. WP5 residual only (no warm-base re-fork). Protocol 17 / PANE-DEATH U1–U11 immutable.

## Evidence

- SESSION-START L0: `docs/SESSION-START.md` · AGENTS/Claude trigger split · propose header drift closed.
- Adapters: `session-context` END · `--format raw|claude-json|codex-plain` · `.codex/hooks.json` · `session:bootstrap`.
- Triggers: `scripts/session-start-triggers.ts` + tests (S no-wave · composite #12).
- Approval: freeze `cc03474` · review C+D `3110e29` · owner `5b14012`.
- Inject ops: `handoff:check` · `inject:full` · `SESSION-INJECT-VIEW-DESIGN.md`.
- Product: PLAN 0.28.1 · R46 · adapter `6e2df8a` · Phase D `49b6a9d`.
- `tasks/traps.md` · `HANDOFF_WINDOWS.md`

## Don't redo

- Permanent nine-axis slim-delete; silent **state** mid-section char-cut.
- Re-review rev-3 from scratch; implement NORMS/MAP without a new authorization decision.
- Treat Grok SessionStart stdout as S full; reopen codex-plain as JSON default.
- Treat bare **상태**/status as wave trigger.
- Expand status into second competing schema before A/B.
- Dashboard v1 redesign from scratch; Phase B/C/D rewrite; warm-base re-spike; Phase E before ROADMAP.
- Drop fail-loud / Open table; inject full lessons into state; product/herdr without Owner track pick.
