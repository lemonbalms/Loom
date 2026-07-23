# HANDOFF — Loom

**Updated:** 2026-07-23
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> Loom v0.28.1 · Dashboard 2+3 shipped · next = Owner track pick (WP5-f / product / idle) · single · `bun run status`.

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | v0.28.1 release close; adapter `6e2df8a` | `docs/PLAN.md` |
| Dogfood | unblocked (protocol 17 · live 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | Dashboard v1–v3 (status + slim inject + lint sync) **done** | `session-status` · `session-context` · this gate |
| Reuse | not proven | evidence |

## Current action

### Owner next-track pick (after Dashboard 2+3)

**Goal:** Owner chooses next large track after Dashboard 2+3; agents idle until pick.

**Session start — no implementer work until Owner picks:**

1. `bun run status` (Dashboard SSOT).
2. Topology **`single`** default. Promote **`full`** only on contract/SSOT conflict.
3. **Default if no Owner reply:** idle (no product wave, no WP5-followup start).
4. Owner may pick: **WP5-followup** · **product** · **idle**.

**Line:** topology **`single`** · full chain when needed = Codex→Grok→Codex.

**Done when:** Owner track recorded in HANDOFF (or idle default holds).

**Must not:** invent product scope; re-open Dashboard v1 redesign; Phase E; WP5 warm-base re-fork; drop fail-loud / Open table; product/herdr/card without track pick.

## Active checks

| Check | Deadline | Impact | Evidence |
|---|---|---|---|
| Owner track (WP5-f / product / idle) | **this gate** | next large track | Owner pending |
| Dashboard steps 2+3 | **done** | slim SessionStart + One-line≤120 lint | this ship |
| Dashboard v1 | **done** | `bun run status` table | `0001a94` |
| Phase D | **done** | structure lint · fail-loud | `49b6a9d` |

## Owner pending

| Decision | Why | Safe default | Evidence |
|---|---|---|---|
| After Dashboard 2+3: WP5-followup / product / idle | product direction | **idle** until pick | todo · HOOK-CACHE design |
| Integration-test flake | cost/scope | isolation recipe | todo |
| HOOKCACHE-D-VERIFY | with WP5-followup | paused | `HOOK-CACHE-FIX-DESIGN.md` |
| RULE-ENFORCEABILITY | product | document only | spike |

## Blockers

(none)

## Invariants

- HANDOFF owns next gate; nine headings; D1 ≤8192B; no `<details>`.
- Dashboard v1 = status SSOT; no second briefing table.
- Fail-loud `unknown/malformed`; Open(blocking) stays markdown **table**.
- Hook path inject = **slim** (Dashboard + traps + Current action [+ clipped One-line ≤120]); no-hook still reads full nine via AGENTS.
- One-line resume body ≤120 chars (`handoff:lint` fail).
- Topology **single** default harness; line ≠ lane (`DOGFOOD` §0.5).
- WP5 spike done/`defer` → residual **WP5-followup** only (no re-fork).
- Protocol 17 / PANE-DEATH U1–U11 immutable.

## Evidence

- steps 2+3: `scripts/session-context.ts` slim `buildStateContext` · `clipOneLineResume` · `handoff-lint` One-line≤120 · tests
- v1: `0001a94` · `scripts/session-status.ts`
- Phase D: `49b6a9d` · Open table `e00367e` · WP5 reframe `6eb132f` · line/lane `5fafcd1`
- Design notes: conversation Dashboard proposal steps 1–3
- Product: PLAN 0.28.1 · R46 · adapter `6e2df8a`
- `tasks/traps.md` · `HANDOFF_ARCHIVE.md` · `HANDOFF_WINDOWS.md` · `AGENTS.md` slim-hook note

## Don't redo

- Dashboard v1 redesign from scratch (extend only).
- Re-inject full nine HANDOFF sections into SessionStart state.
- Phase B/C/D automation rewrite.
- Warm-base fork re-spike.
- Phase E before ROADMAP.
- Drop fail-loud or Open table contract.
- Inject full lessons into state part.
- product/herdr/card changes without Owner track pick.
