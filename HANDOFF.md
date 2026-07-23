# HANDOFF — Loom

**Updated:** 2026-07-23
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> Loom v0.28.1 · Dashboard **v1 done** (`0001a94`) · next = **Dashboard steps 2+3** (SessionStart slim + HANDOFF sync) · topology **single** · start `bun run status` then implement — no owner wait.

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | v0.28.1 release close; adapter `6e2df8a` | `docs/PLAN.md` |
| Dogfood | unblocked (protocol 17 · live 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | Dashboard v1 shipped; **v2/v3 in progress** | `session-status.ts` · this gate |
| Reuse | not proven | evidence |

## Current action

### Dashboard steps 2+3 — SessionStart slim + HANDOFF sync

**Session start (next agent) — no Owner track pick required:**

1. `bun run status` (Dashboard v1 SSOT).
2. Topology **`single`** (session may implement directly). Promote **`full`** only if contract/SSOT conflict.
3. Implement **step 2 then step 3** below; tests → docs → commit/push.
4. Owner product / WP5-followup remains **after** this gate (Owner pending).

**Line:** topology **`single`** · full chain when needed = Codex→Grok→Codex.

---

#### Step 2 — SessionStart state = dashboard-first (slim inject)

**Goal:** Hook `--part state` feels like “one table + minimum restore”, not nine full HANDOFF sections.

| Change | Detail |
|---|---|
| Keep | sentinel · `buildStatus()` Dashboard · `buildTrapsBlock` (활성 함정·하지 말 것) · budget warn · fail-open emit |
| Slim | Do **not** inject all 9 HANDOFF section bodies by default |
| Still inject (short) | `Current action` section only (or Gate title + Goal/Done when ≤N lines) so gate is recoverable without full file |
| Optional | One-line resume **clipped** (≤120 chars) if needed for quiz; not full Evidence/Don't redo prose |
| HARD_CAP | state must stay ≤9500 with **no** truncate warning on live tree |
| Tests | Update `session-context.test.ts` + checkpoint V4: inject core keys = Dashboard headings + traps + Current action (not all 9 `##` sections unless present in action) |
| Equivalence | Document: **no-hook** still reads full HANDOFF nine sections via AGENTS ritual; **hook** path = slim. V4 “same 9 sections in inject” **retired** for production inject — replace with “Dashboard + traps + Current action sufficient for gate quiz” |

**Files:** `scripts/session-context.ts` · related tests. **Not** product packages.

#### Step 3 — HANDOFF / lint sync with Dashboard

| Change | Detail |
|---|---|
| One-line resume | Prefer ≤120 chars (dashboard-friendly); lint **warn or fail** if One-line body >120 (pick fail if easy) |
| Gate single source | Dashboard Gate = `###` under Current action only (already v1) — keep |
| AGENTS | Confirm briefing = status only; note hook inject is slim after step 2 |
| handoff:lint | Optional: cell-budget unrelated; optional One-line length check in `handoff-lint.ts` |
| Docs | HANDOFF Evidence + short note in design spike or PRIORITIES; no Phase E |

**Done when (both steps):**

- `bun run status` still Dashboard v1 green.
- `session-context --part state` length ≤ HARD_CAP, no truncate marker on live.
- Inject contains Dashboard + traps + Current action; **not** full nine section dump.
- Tests green (`handoff-checkpoint` · `session-context`).
- `handoff:lint` 0 · HANDOFF updated · commit/push.

**Must not:** product/card/relay/herdr; Phase D fail-loud weaken; drop traps inject; silent HARD_CAP cut; WP5 warm-base re-fork; Phase E; invent second status schema.

**After ship:** Gate → Owner track pick (WP5-followup / product / idle) or idle default.

## Active checks

| Check | Deadline | Impact | Evidence |
|---|---|---|---|
| Dashboard step 2 slim inject | **this gate** | SessionStart size + cache-friendly | `session-context.ts` |
| Dashboard step 3 sync | **this gate** | One-line/lint/AGENTS | `handoff-lint` · AGENTS |
| Dashboard v1 | **done** | `bun run status` table | `0001a94` |
| Phase D | **done** | structure lint · fail-loud | `49b6a9d` |
| Owner track (WP5-f / product / idle) | after 2+3 | next large track | Owner pending |

## Owner pending

| Decision | Why | Safe default | Evidence |
|---|---|---|---|
| After Dashboard 2+3: WP5-followup / product / idle | product direction | idle until pick | todo · HOOK-CACHE design |
| Integration-test flake | cost/scope | isolation recipe | todo |
| HOOKCACHE-D-VERIFY | with WP5-followup | paused | `HOOK-CACHE-FIX-DESIGN.md` |
| RULE-ENFORCEABILITY | product | document only | spike |

## Blockers

(none)

## Invariants

- HANDOFF owns next gate; nine headings; D1 ≤8192B; no `<details>`.
- Dashboard v1 = status SSOT; no second briefing table.
- Fail-loud `unknown/malformed`; Open(blocking) stays markdown **table**.
- Step 2: hook path may be **slimmer** than no-hook full HANDOFF read (documented); traps still injected.
- Topology **single** default harness; line ≠ lane (`DOGFOOD` §0.5).
- WP5 spike done/`defer` → residual **WP5-followup** only (no re-fork).
- Protocol 17 / PANE-DEATH U1–U11 immutable.

## Evidence

- v1: `0001a94` · `scripts/session-status.ts`
- Phase D: `49b6a9d` · Open table `e00367e` · WP5 reframe `6eb132f` · line/lane `5fafcd1`
- Handoff prep: `8712aef` (superseded by this gate rewrite)
- Design notes: conversation Dashboard proposal steps 1–3
- Product: PLAN 0.28.1 · R46 · adapter `6e2df8a`
- `tasks/traps.md` · `HANDOFF_ARCHIVE.md` · `HANDOFF_WINDOWS.md`

## Don't redo

- Dashboard v1 redesign from scratch (extend only).
- Phase B/C/D automation rewrite.
- Warm-base fork re-spike.
- Phase E before ROADMAP.
- Drop fail-loud or Open table contract.
- Inject full lessons into state part.
- product/herdr/card changes in this gate.
