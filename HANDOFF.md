# HANDOFF — Loom

**Updated:** 2026-07-23
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> Loom v0.28.1 · inject = view+nine model restored · next = Owner track pick (idle default) · single · `bun run status`.

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | v0.28.1 release close; adapter `6e2df8a` | `docs/PLAN.md` |
| Dogfood | unblocked (protocol 17 · live 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | Dashboard view + nine-axis inject model (corrected) | `SESSION-INJECT-VIEW-DESIGN.md` |
| Reuse | not proven | evidence |

## Current action

### Owner next-track pick (idle default)

**Goal:** Owner chooses next large track; agents idle until pick.

**Session start:**

1. `bun run status` (Dashboard **view** only for briefing — do not invent a second table).
2. Topology **`single`**. Promote **`full`** only on contract/SSOT conflict.
3. **Default if no Owner reply:** idle.
4. Owner may pick: **WP5-followup** · **product** · **idle**.

**Line:** topology **`single`** · full chain when needed = Codex→Grok→Codex.

**Done when:** Owner track recorded in HANDOFF (or idle default holds).

**Must not:** drop nine inject axes “for slim”; invent product scope; Phase E; WP5 warm-base re-fork; drop fail-loud / Open table; second status schema.

## Active checks

| Check | Deadline | Impact | Evidence |
|---|---|---|---|
| Owner track (WP5-f / product / idle) | **this gate** | next large track | Owner pending |
| Inject view≠model fix | **done** | nine sections restored in SessionStart | this ship · design spike |
| One-line ≤120 lint | **done** | dashboard-friendly One-line body | `handoff-lint` |
| Dashboard v1 table | **done** | compact briefing view | `0001a94` |
| Phase D | **done** | structure lint · fail-loud | `49b6a9d` |

## Owner pending

| Decision | Why | Safe default | Evidence |
|---|---|---|---|
| After inject fix: WP5-followup / product / idle | product direction | **idle** until pick | todo · HOOK-CACHE design |
| Integration-test flake | cost/scope | isolation recipe | todo |
| HOOKCACHE-D-VERIFY | with WP5-followup | paused | `HOOK-CACHE-FIX-DESIGN.md` |
| RULE-ENFORCEABILITY | product | document only | spike |

## Blockers

(none)

## Invariants

- HANDOFF owns next gate; nine headings; D1 ≤8192B; no `<details>`.
- Dashboard table = **view** of SSOT; inject = **nine sections + traps** (model). View must not delete axes.
- Concision = short HANDOFF + stripDetails + One-line≤120 lint — not omitting required headings from inject.
- Fail-loud `unknown/malformed`; Open(blocking) stays markdown **table**.
- Topology **single** default harness; line ≠ lane (`DOGFOOD` §0.5).
- WP5 spike done/`defer` → residual **WP5-followup** only (no re-fork).
- Protocol 17 / PANE-DEATH U1–U11 immutable.

## Evidence

- Design: `docs/spikes/SESSION-INJECT-VIEW-DESIGN.md` (owner correction: view compress ≠ model drop)
- Fix: `scripts/session-context.ts` restore full nine inject · V4 equivalence tests
- Misread ship (corrected): `74b42e5` axis-drop “slim” — superseded
- v1 table: `0001a94` · Phase D `49b6a9d` · One-line lint in `handoff-lint.ts`
- Product: PLAN 0.28.1 · R46 · adapter `6e2df8a`
- `tasks/traps.md` · `AGENTS.md` · `HANDOFF_WINDOWS.md`

## Don't redo

- Drop nine HANDOFF axes from SessionStart inject for “slim” or HARD_CAP comfort.
- Dashboard v1 redesign from scratch (extend only).
- Treat status table cells as permission to skip Invariants / Don't redo / Evidence.
- Phase B/C/D automation rewrite.
- Warm-base fork re-spike.
- Phase E before ROADMAP.
- Drop fail-loud or Open table contract.
- Inject full lessons into state part.
- product/herdr/card changes without Owner track pick.
