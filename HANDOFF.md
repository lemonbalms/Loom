# HANDOFF — Loom

**Updated:** 2026-10-15
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> v0.29.0 **approved** (R47 w/ fixes) · **PATCH 1 next** · event seq + stable id (upgrade step 1) · topology full

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | **v0.29.0 `approved`** · PATCH 1 · shipped 0.28.1 | `docs/PLAN.md` |
| Dogfood | unblocked (p17 · 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | **P3 soft close** · JIT 3.0–3.2 only | `PHASE3-SOFT-CLOSE.md` |
| Dev env | claude-mem 13.12.4 B-4 + autoUpdate off | `check:mem-header` |

## Current action

### v0.29.0 approved · PATCH 1 (tests-first red)

**Goal:** owner pick 2026-10-15 (upgrade step 1) — relay `eventId`/`seq` (D1) · durable ingest dedupe (D2) · per-room JSONL log (D3) · `clientEventId` idempotent send (D4). R47 fixes absorbed. Authority `docs/PLAN.md` §0.29.0 · `docs/UNKNOWNS.md`.

**Playbook (next session):**
1. `bun run status` · `handoff:check`
2. PATCH 1 tests-only red (production 0 lines) — grok implement · codex verify
3. PATCH 2→6 per PLAN §0.29.0 ④ — grok implement · codex verify each

**Line:** topology **`full`** · execution **`delegated`** · verify **`independent`** · chain Claude→Grok→Codex verify + fable-advisor advise (promoted from `single` 2026-10-15 — `packages/*` product meaning, `DOGFOOD_LOOP.md` §0.5.3)

**Done when (this handoff):** PLAN §0.29.0 Done when (a)–(f) green + ship checks green.

**Must not:** PATCH 2+ before PATCH 1 red · sync lock on WS receive path (R47-H1) · demote to `single` without owner · remeasure 3.3–3.4b · default-on JIT.

## Active checks

| Check | Status | Impact | Evidence |
|---|---|---|---|
| v0.29.0 PLAN | **approved** | PATCH 1 | `docs/PLAN.md` |
| P3 soft close | **closed** | freeze new surfaces | `PHASE3-SOFT-CLOSE.md` |
| 3.0–3.2 soft live | **opt-in** | JIT | consts true · RESULT |
| 3.3–3.4b live | **false** | blocked | consts false · RESULT |
| `smoke:uc` · B-4 pin | **OK** | prior | check:mem-header |
| B-7 upstream | deferred optional | ecosystem | PRIORITIES P2c |

## Owner pending

| Decision | Why | Safe default | Evidence |
|---|---|---|---|
| UK-4 caps | open, non-blocking | 1024 / 256 | UNKNOWNS |
| P3 reopen / default-on | risk | **off** · new SPEC only | SOFT-CLOSE |
| B-7 issue/PR | optional | defer | platform lessons |

## Blockers

(none)

## Invariants

- Nine headings; D1 ≤8192B; no `<details>`; traps only in `tasks/traps.md`.
- Topology `full` for v0.29.0 (promoted 2026-10-15); demote = owner only.
- HARD_CAP 9500; owner brief = `bun run status` only.
- PREREG seal before canary; sealed F1*/3.0–3.4b **immutable**.
- Phase 3 soft: live **3.0–3.2 only** · default-on **no**.
- Bash deny **before** JIT; JIT never exit 2; JIT unset=**off**.
- Sticky owns presence → listen must not `leave` if host live.
- claude-mem header: date-only; **autoUpdate off** or re-run B-4 after upgrade.

## Evidence

- Close: `docs/spikes/RULE-ROUTER-PHASE3-SOFT-CLOSE.md`  
- 3.4b/3.4/3.3 RESULT · `scripts/rule-router-jit.ts`  
- 3.0–3.2 RESULT · live consts true

## Don't redo

- 3.3–3.4b remeasure / COMPLY soften / live without T1(a).  
- default-on JIT · silent product MINOR (v0.29.0 = owner-picked).  
- B-4 as B-7 closed · UC-3 leave while sticky live.
