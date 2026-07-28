# HANDOFF — Loom

**Updated:** 2026-07-28
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> v0.28.1 · P3.0–3.2 soft · **3.3+3.4 T1 FAIL** (impl/platform live blocked) · next = owner pick.

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | v0.28.1 · adapter `6e2df8a` | `docs/PLAN.md` |
| Dogfood | unblocked (p17 · 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | 3.0–3.2 soft · **3.3/3.4 measured FAIL** | PHASE3.3/3.4-RESULT |
| Dev env | claude-mem 13.12.4 B-4 + autoUpdate off | `check:mem-header` |

## Current action

### Idle · owner pick next (no silent product MINOR)

**Shipped this wave:**
1. **3.4 platform** SPEC+PREREG · hook · tests 34/0  
2. **n=10 canary** — G0 **PASS** · T1(a) **FAIL** · COMPLY base **0/5** · jit **3/5** · DELIVERED **5/5**  
3. live **`PHASE3_4_PLATFORM_LIVE_AUTHORIZED=false`** · RESULT rev-1  
4. 3.3 still FAIL · both live blocked (do not remeasure sealed PREREGs)

**Why 3.4 T1 failed:** soft lift 0→3 but &lt;4/5; r3/r5 find/curl fallback; scorer substring counts some grep.  
**Not redo:** remeasure 3.3/3.4 · COMPLY soften · silent product MINOR.

**Playbook (next):**
1. `bun run status` · `handoff:check` · `check:mem-header`  
2. Owner: **3.4b** (stricter COMPLY + repo cwd) · product MINOR · **close Phase 3 soft** · defer  
3. Keep 3.0–3.2 soft opt-in; default-on **off**

**Line:** topology **`single`** · execution **`current-session`** · verify **`objective-commands`** · full fallback Codex→Grok→Codex

**Done when (this handoff):** RESULT + live false + checks green — **met**.

**Must not:** 3.3/3.4 remeasure · COMPLY soften · live flip without new T1 · default-on · reopen sealed PREREG · B-7=local pin · silent product MINOR.

## Active checks

| Check | Status | Impact | Evidence |
|---|---|---|---|
| P3.0–3.2 soft live | **opt-in** | JIT | RESULT consts true |
| 3.3 canary | **G0 PASS · T1 FAIL** | impl blocked | PHASE3.3-RESULT |
| 3.4 canary | **G0 PASS · T1 FAIL** | platform blocked | PHASE3.4-RESULT · `p34-gates.json` |
| 3.3/3.4 live | **false** | gates | consts false |
| `smoke:uc` | **OK** | UC-3 | prior |
| cause B local B-4 | **OK + pinned** | cache | `check:mem-header` |

## Owner pending

| Decision | Why | Safe default | Evidence |
|---|---|---|---|
| **next gate** | 3.3+3.4 closed FAIL | wait owner · no silent MINOR | this HANDOFF |
| 3.4b redesign | stricter COMPLY / repo cwd | defer | RESULT §5 |
| Phase 3 soft close | enough surfaces measured | optional | 3.0–3.2 live |
| default-on JIT | risk | **off** | standing |
| B-7 issue/PR | optional | defer | platform lessons |

## Blockers

(none)

## Invariants

- Nine headings; D1 ≤8192B; no `<details>`; traps only in `tasks/traps.md`.
- Topology `single` / current-session / objective-commands.
- HARD_CAP 9500; owner brief = `bun run status` only.
- PREREG seal before canary; sealed F1*/3.0–3.4 PREREG **immutable** (remeasure no).
- Isolation = absence not negation; pin ≠ conflict avoidance.
- Bash deny **before** JIT; JIT never exit 2; JIT unset=**off** · default-on **no**.
- Sticky owns presence → listen must not `leave` if host live.
- claude-mem header: date-only; **autoUpdate off** or re-run B-4 after upgrade.

## Evidence

- 3.4: `docs/spikes/RULE-ROUTER-PHASE3.4-RESULT.md` · `~/.loom/phase3-4-canary-2026-07-28/`  
- 3.3: `docs/spikes/RULE-ROUTER-PHASE3.3-RESULT.md`  
- hook: `scripts/rule-router-jit.ts` · tests 34/0

## Don't redo

- 3.3/3.4 PREREG remeasure / soften COMPLY / live flip without new T1.  
- 3.2 canary remeasure / default-on JIT.  
- UC-3 leave while sticky; B-4 as B-7 closed.  
- Silent product MINOR.
