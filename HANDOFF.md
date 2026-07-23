# HANDOFF — Loom

**Updated:** 2026-07-23
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> Loom v0.28.1 · WP5-followup M-1 cutover shipped · next = product / idle (safe default idle).

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | v0.28.1 release close; adapter `6e2df8a` | `docs/PLAN.md` |
| Dogfood | unblocked (protocol 17 · live 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | DELIVERY + handoff B + **M-1 cutover done** | `HOOK-CACHE-FIX-DESIGN.md` |
| Reuse | not proven | evidence |

## Current action

### Owner: product track or idle

**Goal:** Harness residual M-1 is shipped; pick product direction or stay idle.

**Authority:** WP5-followup M-1 cutover (single `--part all` · joint budget fit). NORMS/MAP design-only (`5b14012`). Safe default = **idle**.

**Session start:**

1. `bun run status` · `bun run handoff:check`; L0 = `docs/SESSION-START.md`.
2. Claude/Codex SessionStart = **one** hook `--part all` (state pinned; lessons fitted if over remainder).
3. Do **not** re-split SessionStart into dual handlers; do not implement NORMS/MAP without authorization.

**Line:** topology **`single`** · full chain when needed = Codex→Grok→Codex.

**Done when:** Owner picks product work or confirms idle with HANDOFF reflecting it.

**Must not:** dual-hook SessionStart race; permanent nine-axis slim-delete; NORMS/MAP without auth; warm-base re-fork.

## Active checks

| Check | Deadline | Impact | Evidence |
|---|---|---|---|
| DELIVERY Phase 0a–2 | **done** | 3-host S wire | `docs/SESSION-START.md` |
| Handoff authoring B | **done** | author budget | `handoff:budget` · `docs/HANDOFF-AUTHORING.md` |
| WP5-followup M-1 cutover | **done** | cause A order race | `--part all` · settings · codex hooks |
| HOOKCACHE-D-VERIFY | optional | detector depth | paused / nonblocking |
| **ISSUE: cause B header ts** | open | cache ~1min / ~34k write | B-7 upstream; B-4=temp |
| Owner product track | **open** | product / idle | Owner pending |

## Owner pending

| Decision | Why | Safe default | Evidence |
|---|---|---|---|
| product / idle | product direction | **idle** until pick | todo |
| **ISSUE cause B (claude-mem)** | autoUpdate reverts B-4 | **open issue only** — no local “fix” claim | `HOOK-CACHE-FIX-DESIGN` §5 B-7 · `check:mem-header` |
| Integration-test flake | cost/scope | isolation recipe | todo |
| HOOKCACHE-D-VERIFY | optional residual | paused | design doc |
| RULE-ENFORCEABILITY | product | document only | spike |

## Blockers

(none)

## Invariants

- HANDOFF: nine headings; D1 ≤8192B; no `<details>`; owns next gate.
- SessionStart **single** command `--part all` (Claude + Codex); state full under HARD_CAP; lessons whole-line fit into remainder + loud trunc warn.
- S full requires BEGIN+matching END per part; status = **view**; inject = **nine + traps** (+ lessons index fit).
- Budget = **chars** (HARD_CAP 9500); drop = whole section/line + loud warn. Prefer raw state ≤ STATE_TARGET 7500.
- Author: `bun run handoff:budget` · ship: `bun run handoff:check`. Guide: `docs/HANDOFF-AUTHORING.md`.
- Owner brief ≠ inject dump. Template **S**/`상태` never auto-waves.
- Topology **single** default. No warm-base re-fork. Protocol 17 / PANE-DEATH U1–U11 immutable.
- NORMS/MAP implementation still requires new authorization (`5b14012`).

## Evidence

- M-1 cutover: `scripts/session-context.ts` `buildAllContext` fit · `.claude/settings.json` · `.codex/hooks.json` · tests.
- Handoff B: `handoff:budget` · `docs/HANDOFF-AUTHORING.md`.
- SESSION-START L0 · inject ops · DELIVERY adapters.
- Product: PLAN 0.28.1 · R46 · adapter `6e2df8a`.
- Design: `HOOK-CACHE-FIX-DESIGN.md` · `SESSION-INJECT-VIEW-DESIGN.md`.
- `tasks/traps.md` · `HANDOFF_WINDOWS.md`

## Don't redo

- Re-split SessionStart into dual state/lessons handlers (cause A race).
- Permanent nine-axis slim-delete; silent state mid-section char-cut.
- Implement NORMS/MAP without new authorization; warm-base re-fork.
- Treat Grok SessionStart stdout as S full; bare **상태** as wave trigger.
- Drop fail-loud / Open table; product/herdr without Owner track pick.
- Claim cause B **closed** via B-4 re-patch alone (autoUpdate reverts; root fix = upstream B-7).
