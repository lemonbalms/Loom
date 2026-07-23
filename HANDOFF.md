# HANDOFF — Loom

**Updated:** 2026-07-23
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> Loom v0.28.1 · Phase D shipped · Open(blocking) table restored · next = owner track pick (**WP5-followup** = prefix·hook-cache · product · idle; Phase E only if ROADMAP) · topology **single** harness · `DOGFOOD_LOOP` §0.5.

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | v0.28.1 release close completed; adapter source through `6e2df8a` | `docs/PLAN.md` |
| Dogfood | unblocked (protocol 17 + live 3-kind + `dogfood:herdr` ok) | `docs/spikes/HERDR-0.7.5-COMPAT.md` |
| Harness | Phase D automation shipped; Phase E blocked until ROADMAP | `docs/spikes/HANDOFF-CHECKPOINT-DESIGN.md` |
| Reuse | not proven | evidence below |

## Current action

### Post–Phase D — owner next-track pick

**Orchestration line handoff** — SSOT: `docs/DOGFOOD_LOOP.md` §0.5 (**line** = full role chain · **lane** = role/peer · axis A vendor × axis B topology `full`/`single`).

| Axis | Choice | Notes |
|---|---|---|
| **Topology (B) — inherited Default** | **`single`** for harness/docs-only; promote to **`full`** on complex decisions | Phase D + Open-table hygiene used single + session=Grok |
| **Vendor chain (A) — full default** | **Codex → Grok → Codex verify** | restore when topology=`full` |
| Claude / Grok / Other lines | as in `DOGFOOD_LOOP` §0.5.2 | Owner override |

Goal:
- Hold product gate until Owner names next track. Safe default: no Phase E; no product scope expansion; harness-only hygiene only.

Expected:
- Owner choice recorded here; or explicit "idle" acceptance.

Must not change:
- product/card/relay/conv/herdr locks; PANE-DEATH U1–U11; protocol 17; nine-section HANDOFF; Phase D lint/fail-loud contracts; Open(blocking) **table** shape.

Done when:
- Next Current action gate is written after Owner pick (or idle acknowledged in Evidence).

## Active checks

| Check | Deadline | Impact | Evidence |
|---|---|---|---|
| Owner next-track pick | open | unblocks product / WP5-followup / Phase E routing | this section |
| UK-5..UK-9 observations | nonblocking | follow-up only | `docs/PLAN.md` |
| Integration-test flake track | owner-pending | keep isolation recipe | `tasks/todo.md` |
| plan_review Open(blocking) table | **done** | status Open = `없음` | `docs/plan_review.md` 2026-07-23 |

## Owner pending

| Decision | Why owner input is needed | Safe default while pending | Evidence |
|---|---|---|---|
| Next product / **WP5-followup** / idle | WP5 warm-base spike = **done/`defer`**; real residual = prefix·hook-cache | stay idle; do **not** re-run warm-base fork | `WARM-BASE-FORK-SPIKE.md` · `HOOK-CACHE-FIX-DESIGN.md` · `tasks/todo.md` |
| Integration-test flake track | diagnosis changes cost/scope | keep isolation recipe | `tasks/todo.md` |
| HOOKCACHE-D-VERIFY resume | part of WP5-followup when that track is chosen | remain paused until track pick | `docs/spikes/HOOK-CACHE-FIX-DESIGN.md` |
| RULE-ENFORCEABILITY apply | product decision | document only; no silent enforcement | `docs/spikes/RULE-ENFORCEABILITY.md` |

## Blockers

(none)

## Invariants

- HANDOFF alone owns the next session gate; PLAN and review remain linked SSOTs.
- All nine checkpoint headings occur once; completed narrative stays outside this file.
- `HARD_CAP=9500` platform-pinned; `SOFT_CAP=12750` policy-only; D1 whole-file ≤8192B.
- Adapter locks: 0.7.5/protocol **17 only**; fail-closed identity; no herdr downgrade.
- PANE-DEATH U1–U11 / R44–R45 immutable; nine headings; vendor chain + topology inheritance.
- Phase D: `handoff:lint` = structure+budget; status uses `unknown/malformed` on unreadable shape; SessionStart core set ≡ no-hook partial read.
- Every gate records actual **vendor chain + topology** as next Default. Owner override wins.

## Evidence

- Product: `docs/PLAN.md` · `docs/plan_review.md` · R46 · adapter through `6e2df8a`
- Phase D: `scripts/handoff-lint.ts` · `scripts/session-status.ts` · `scripts/handoff-checkpoint.test.ts` (structure lint · fail-loud · V4 equivalence)
- Open(blocking) table restore 2026-07-23: `docs/plan_review.md` (stale R39 bullet cleared; author-close logs under historical section)
- WP5 warm-base spike **done/`defer`** → follow-up = prefix normalize + hook-cache fix (`WARM-BASE-FORK-SPIKE.md` · `HOOK-CACHE-FIX-DESIGN.md`) — not re-fork
- Continuity design: `docs/spikes/HANDOFF-CHECKPOINT-DESIGN.md` · Phase B `e281587` · Phase C `8a3ddba`
- Line/lane + `full`/`single`: `docs/DOGFOOD_LOOP.md` §0.5 · `AGENTS.md` briefing
- Archive/traps/Windows: `docs/HANDOFF_ARCHIVE.md` · `tasks/traps.md` · `HANDOFF_WINDOWS.md`

## Don't redo

- Protocol/COMPAT re-map · herdr downgrade · config-only protocol greenwash.
- Reopen PANE-DEATH U1–U11 or treat `card.done`/pane exit as completion authority.
- Phase B/C/D automation already shipped — do not re-implement structure lint/fail-loud/equivalence from scratch.
- Phase E / ROADMAP authority before Owner adopts ROADMAP.
- Weaken status fail-loud when Open drifts off table shape — restore the **table**, do not invent `없음`.
