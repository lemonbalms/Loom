# HANDOFF — Loom

**Updated:** 2026-07-28
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> v0.28.1 · P3.0–3.2 soft · **3.3 T1 FAIL** (impl live blocked) · next = owner pick.

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | v0.28.1 · adapter `6e2df8a` | `docs/PLAN.md` |
| Dogfood | unblocked (p17 · 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | 3.0–3.2 soft · **3.3 measured FAIL** | PHASE3.3-RESULT |
| Dev env | claude-mem 13.12.4 B-4 + autoUpdate off | `check:mem-header` |

## Current action

### Idle · owner pick next (no silent product MINOR)

**Shipped this wave:**
1. 3.3 SPEC+PREREG seal · hook lane · tests 30/0  
2. **n=10 canary** — G0 **PASS** · T1(a) **FAIL** · COMPLY base/jit **0/5** · DELIVERED jit **3/5**  
3. live **`PHASE3_3_IMPLEMENTATION_LIVE_AUTHORIZED=false`** · RESULT rev-1

**Why T1 failed (do not remeasure):** model treated “relay-token export” as secret-name fishing;  
partial inject was read as **injection** (r3/r4). Soft JIT ≠ force. Sealed PREREG immutable.

**Playbook (next):**
1. `bun run status` · `handoff:check` · `check:mem-header`  
2. Owner pick: **new** 3.3b/3.4 SPEC (non-secret COMPLY or platform) · product MINOR · defer  
3. Do **not** re-run sealed 3.3 PREREG or soften COMPLY

**Line:** topology **`single`** · execution **`current-session`** · verify **`objective-commands`** · full fallback Codex→Grok→Codex

**Done when (this handoff):** RESULT + live false + checks green — **met**.

**Must not:** 3.3 remeasure / COMPLY soften · live impl without new T1 · default-on · reopen 3.0–3.3 PREREG · B-7=local pin · silent product MINOR.

## Active checks

| Check | Status | Impact | Evidence |
|---|---|---|---|
| P3.0–3.2 soft live | **opt-in** | JIT | RESULT consts true |
| 3.3 canary | **G0 PASS · T1 FAIL** | impl live blocked | `PHASE3.3-RESULT` · `p33-gates.json` |
| 3.3 live | **false** | gate | `PHASE3_3_…=false` |
| `smoke:uc` | **OK** | UC-3 | `05f21cf` |
| cause B local B-4 | **OK + pinned** | cache | `check:mem-header` |
| B-7 upstream | deferred optional | ecosystem | PRIORITIES P2c |

## Owner pending

| Decision | Why | Safe default | Evidence |
|---|---|---|---|
| **next gate** | 3.3 closed FAIL | wait owner · no silent MINOR | this HANDOFF · RESULT |
| 3.3b/3.4 redesign | non-secret COMPLY or platform | defer | RESULT §5 |
| default-on JIT | product risk | **off** | standing |
| B-7 issue/PR | optional | defer | platform lessons |

## Blockers

(none)

## Invariants

- Nine headings; D1 ≤8192B; no `<details>`; traps only in `tasks/traps.md`.
- Topology `single` / current-session / objective-commands.
- HARD_CAP 9500; owner brief = `bun run status` only.
- PREREG seal before canary; sealed F1*/3.0–3.3 PREREG **immutable** (remeasure no).
- Isolation = absence not negation; pin ≠ conflict avoidance.
- Bash deny **before** JIT; JIT never exit 2; JIT unset=**off** · default-on **no**.
- Sticky owns presence → listen must not `leave` if host live.
- claude-mem header: date-only; **autoUpdate off** or re-run B-4 after upgrade.

## Evidence

- 3.3: `docs/spikes/RULE-ROUTER-PHASE3.3-RESULT.md` · `~/.loom/phase3-3-canary-2026-07-28/`  
- hook: `scripts/rule-router-jit.ts` · tests 30/0  
- 3.2: `docs/spikes/RULE-ROUTER-PHASE3.2-RESULT.md`

## Don't redo

- 3.3 PREREG remeasure / soften COMPLY / live flip without new T1.  
- 3.2 canary remeasure / default-on JIT.  
- UC-3 leave while sticky; B-4 as B-7 closed.  
- Silent product MINOR.
