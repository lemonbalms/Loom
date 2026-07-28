# HANDOFF — Loom

**Updated:** 2026-07-28
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> v0.28.1 · P3.0–3.2 soft · **3.3/3.4/3.4b T1 FAIL** (impl/platform live blocked) · next = owner pick.

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | v0.28.1 · adapter `6e2df8a` | `docs/PLAN.md` |
| Dogfood | unblocked (p17 · 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | 3.0–3.2 soft · **3.3–3.4b measured FAIL** | PHASE3.*-RESULT |
| Dev env | claude-mem 13.12.4 B-4 + autoUpdate off | `check:mem-header` |

## Current action

### Idle · owner pick next (no silent product MINOR)

**Shipped (do not redo):**
1. 3.3 impl · 3.4 platform · **3.4b** strict COMPLY + repo cwd  
2. **3.4b n=10** — G0 **PASS** · T1(a) **FAIL** · base/jit COMPLY **5/5** (ceiling · no lift) · DELIVERED jit **5/5**  
3. live platform/impl **false** · RESULT rev-1

**3.4b lesson:** repo cwd makes `bun run check:mem-header` discoverable without JIT → base ceiling.  
Empty probe (3.4) under-discovers; repo (3.4b) over-saturates. Neither yields T1 lift for platform.

**Playbook (next):**
1. `bun run status` · `handoff:check` · `check:mem-header`  
2. Owner: **product MINOR** · **Phase 3 soft close** (keep 3.0–3.2) · other surface · defer  
3. Do **not** remeasure 3.3/3.4/3.4b · default-on off

**Line:** topology **`single`** · execution **`current-session`** · verify **`objective-commands`** · full fallback Codex→Grok→Codex

**Done when (this handoff):** RESULT + live false + checks green — **met**.

**Must not:** remeasure 3.3/3.4/3.4b · COMPLY soften · live without T1(a) · default-on · silent product MINOR · B-7=local pin.

## Active checks

| Check | Status | Impact | Evidence |
|---|---|---|---|
| P3.0–3.2 soft live | **opt-in** | JIT | RESULT consts true |
| 3.3 / 3.4 / 3.4b | **T1 FAIL** | impl+platform blocked | RESULT docs · gates json |
| live impl/platform | **false** | gates | consts false |
| `smoke:uc` · B-4 pin | **OK** | prior | check:mem-header |

## Owner pending

| Decision | Why | Safe default | Evidence |
|---|---|---|---|
| **next gate** | platform soft unproven | wait owner | this HANDOFF |
| Phase 3 soft close | 3.0–3.2 live enough | optional | 3.0–3.2 RESULT |
| product MINOR | backlog | no silent | PLAN |
| default-on JIT | risk | **off** | standing |
| B-7 issue/PR | optional | defer | platform lessons |

## Blockers

(none)

## Invariants

- Nine headings; D1 ≤8192B; no `<details>`; traps only in `tasks/traps.md`.
- Topology `single` / current-session / objective-commands.
- HARD_CAP 9500; owner brief = `bun run status` only.
- PREREG seal before canary; sealed F1*/3.0–3.4b **immutable** (remeasure no).
- Isolation = absence not negation; pin ≠ conflict avoidance.
- Bash deny **before** JIT; JIT never exit 2; JIT unset=**off** · default-on **no**.
- Sticky owns presence → listen must not `leave` if host live.
- claude-mem header: date-only; **autoUpdate off** or re-run B-4 after upgrade.

## Evidence

- 3.4b: `docs/spikes/RULE-ROUTER-PHASE3.4b-RESULT.md` · `~/.loom/phase3-4b-canary-2026-07-28/`  
- 3.4 / 3.3: RESULT docs · prior canary dirs  
- hook: `scripts/rule-router-jit.ts`

## Don't redo

- 3.3/3.4/3.4b remeasure / COMPLY soften / live flip without T1(a).  
- 3.2 remeasure / default-on JIT.  
- Silent product MINOR; B-4 as B-7 closed.
