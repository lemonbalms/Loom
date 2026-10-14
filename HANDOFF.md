# HANDOFF — Loom

**Updated:** 2026-10-15
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> v0.29.0 **shipped** · event seq + stable id (step 1) · **next = owner pick step 2** · topology full

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | **v0.29.0 `approved`** · shipped through PATCH 6 | `docs/PLAN.md` |
| Dogfood | unblocked (p17 · 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | **P3 soft close** · JIT 3.0–3.2 only | `PHASE3-SOFT-CLOSE.md` |
| Dev env | claude-mem 13.12.4 B-4 + autoUpdate off | `check:mem-header` |

## Current action

### v0.29.0 shipped · next = upgrade step 2 (owner pick)

**Goal:** step 1 done — relay `eventId`/`seq` (D1) · durable 2-layer ingest dedupe (D2) · per-room JSONL log (D3) · `clientEventId` idempotent send (D4). Each of PATCH 2–4 passed codex `fix-first` → fixed. Authority `docs/PLAN.md` §0.29.0 · `implementation-notes.md` §0.29.0 (deviations · known limits).

**Playbook (next session):**
1. `bun run status` · `handoff:check`
2. Owner picks step 2 (headless worker · session per card · prompt injection · policy · skill materialize) → new PLAN MINOR + review before code
3. Known limits to carry: no fsync on relay snapshot · at-most-once semantics · UK-4 caps estimate

**Line:** topology **`full`** · execution **`delegated`** · verify **`independent`** · chain Claude→Grok→Codex verify + fable-advisor advise (promoted from `single` 2026-10-15 — `packages/*` product meaning, `DOGFOOD_LOOP.md` §0.5.3)

**Done when (this handoff):** step-2 PLAN drafted and reviewed (no code before approval).

**Must not:** start step 2 code without owner pick + PLAN review · sync lock on WS receive path (R47-H1) · demote to `single` without owner · remeasure 3.3–3.4b · default-on JIT.

## Active checks

| Check | Status | Impact | Evidence |
|---|---|---|---|
| v0.29.0 | **shipped** | step 1 done | `docs/PLAN.md` |
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
