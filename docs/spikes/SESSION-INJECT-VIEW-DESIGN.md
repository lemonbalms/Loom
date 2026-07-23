# Session inject = view compression (not model reduction)

**Date:** 2026-07-23  
**Status:** approved-for-implement (owner correction)  
**Supersedes:** Dashboard step 2 reading that dropped 7/9 HANDOFF sections from inject

## Owner premise (binding)

| Keep | Change only |
|------|-------------|
| **Function / information set** — what a session can restore and decide from | **Presentation** — shorter, table-first reporting |
| All nine checkpoint axes + traps safety knowledge | Long prose dumps, duplicate briefing tables |

“표로 보여줘” means **same facts, denser view** — not “axes not in the table may be deleted from inject.”

## Layers

| Layer | Role | May drop axes? |
|-------|------|----------------|
| `bun run status` Dashboard table | Briefing **view** (Product/Review/Gate/Owner/Don't…) | No — cells **summarize** axes; they do not replace file/inject model |
| SessionStart `--part state` | Hook **restore model** for architect | **No** — must include all nine `##` sections (+ traps) |
| `HANDOFF.md` file | SSOT checkpoint (D1 ≤8192B, no details) | No — structure lint owns nine headings |
| no-hook AGENTS ritual | Same nine sections via partial read | Same model as inject |

## Inject contract (production)

```
[LOOM-SESSION-CONTEXT v1 · state]
+ buildStatus()                    # compact table VIEW of live SSOT
+ each REQUIRED_HANDOFF_HEADINGS   # full section bodies, stripDetails only
+ missing headings → loud warn (list all missing)
+ traps: 활성 함정 + 하지 말 것
+ checkHandoffBudget() if any
```

HARD_CAP 9500 stays; concision is **HANDOFF diet + stripDetails + short One-line (≤120 lint)**, not section omission.

## Explicitly wrong (74b42e5 step-2 misread)

- Inject only Current action (+ clipped One-line) and call it “slim done”
- Retire V4 “nine sections in inject” for production
- Equivalence = “gate quiz only”

## Equivalence (restored)

Hook inject core keys **⊇** no-hook partial-read core keys:

- nine `handoff:<heading>` when present in file  
- `traps:활성 함정` · `traps:하지 말 것`  
- plus Dashboard heading for briefing (extra view, not a substitute)

## Out of scope

- Product packages / herdr / cards  
- Phase E  
- Raising HARD_CAP past platform 10k  
- Second briefing table schema  

---

## Section budget (fills char-cut opacity gap)

| Concept | Rule |
|---------|------|
| Budget **unit** | Characters (`HARD_CAP` 9500) — platform SessionStart cap |
| Drop **unit** | Whole named part (section), never mid-section tail for state |
| Observability | `measureStateBudget` / `bun run session-context:lint` prints per-part chars + `omitted:` list |
| Commit gate | `session-context:lint` **fails** if live state would omit any part |
| Pinned (never omit) | sentinel · status · Current action · traps |
| Drop first (high `dropOrder`) | Don't redo → Evidence → Invariants → Active checks → Current loop → … |

State path: `buildStateParts` → `fitPartsToBudget` → warn line  
`⚠ inject omitted: Evidence, Don't redo (raw N > 9500)` when needed.

Last-resort `truncateContext` remains for lessons / only-pinned overflow only.

---

## Operating best practice (max effect, no context loss)

**Default strategy:** keep **all nine axes + traps** in inject. Maximize effect by **short dense HANDOFF**, not by deleting axes.

| Layer | Best practice |
|-------|----------------|
| Author | Table/bullet sections; Current action sharp (Goal/Done/Must not); Don't redo / Invariants = prohibition lines only; Evidence = paths/SHAs |
| Budget | `raw ≤ STATE_TARGET (7500)` preferred; `omitted: (none)` required for commit via `session-context:lint` |
| Runtime | Under HARD_CAP → full model; over → named section omit (safety net only) |
| Owner report | `bun run status` table — do not dump inject into chat |
| Agent | On `inject omitted:` warning, Read the named HANDOFF section from disk |

**ROI order:** (1) sharp Current action + traps (2) HANDOFF diet so omit never fires (3) short Don't redo/Invariants (4) status view (5) priority omit as insurance.

**Anti-patterns:** permanent slim; raise HARD_CAP into silent platform cut; merge lessons into state; long prose that forces omit of Don't redo first.
