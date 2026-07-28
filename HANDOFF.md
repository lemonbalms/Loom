# HANDOFF — Loom

**Updated:** 2026-07-28
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> v0.28.1 · P3.0–3.2 soft · **3.3 SPEC+PREREG sealed** (`agents.env`) · next = 3.3 hook + canary.

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | v0.28.1 · adapter `6e2df8a` | `docs/PLAN.md` |
| Dogfood | unblocked (p17 · 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | RULE-ROUTER 3.0–3.2 soft · **3.3 sealed pre-impl** | PHASE3-SPEC §2 · 3.3-SPEC/PREREG |
| Dev env | claude-mem 13.12.4 B-4 + autoUpdate off | `check:mem-header` · platform lessons |

## Current action

### 3.3 implementation JIT — hook + canary (post-PREREG seal)

**Shipped (do not redo):**
1. **Phase 3.2** · UC-3 · cause B local B-4 (earlier today)
2. **Phase 3.3 SPEC+PREREG** — surface=`implementation` · fixture **`agents.env`** sha8 **`06e68593`** · wire=Bash 2-step · live gate `PHASE3_3_IMPLEMENTATION_LIVE_AUTHORIZED=false` until RESULT · verification/review/gate **Out** (prefix 1st) · platform → 3.4 후보

**Next (this gate):**
1. `rule-router-jit` implementation 레인 · `CANARY_SURFACE=implementation` · 유닛 테스트  
2. n=10 canary (PREREG 축자) → RESULT · T1(a) 시에만 live 상수 flip  
3. HANDOFF + ship

**Line:** topology **`single`** · execution **`current-session`** · verify **`objective-commands`** · full fallback Codex→Grok→Codex

**Done when:** tests green · RESULT documented · handoff:check · no live flip without T1 pass.

**Must not:** live impl inject pre-canary · default-on · reopen 3.0–3.3 PREREG · soften COMPLY · smuggle verification/review/gate into 3.3 · claim B-7 closed by local pin.

## Active checks

| Check | Status | Impact | Evidence |
|---|---|---|---|
| P3.0–3.2 soft live | **opt-in** | JIT | RESULT · consts true |
| 3.3 SPEC+PREREG | **sealed** (pre-canary) | impl JIT | `RULE-ROUTER-PHASE3.3-SPEC.md` · PREREG |
| 3.3 live | **blocked** | gate | `PHASE3_3_…` false until RESULT |
| `smoke:uc` | **OK** | UC-3 | `05f21cf` |
| cause B local B-4 | **OK + pinned** | cache | `check:mem-header` |
| B-7 upstream | deferred optional | ecosystem | PRIORITIES P2c · local pin holds |

## Owner pending

| Decision | Why | Safe default | Evidence |
|---|---|---|---|
| default-on JIT | product risk | **off** | standing |
| B-7 issue/PR | optional | defer; local pin holds | platform lessons |
| 3.4+ / product MINOR | after 3.3 RESULT | wait | PHASE3-SPEC §2 |

## Blockers

(none)

## Invariants

- Nine headings; D1 ≤8192B; no `<details>`; traps only in `tasks/traps.md`.
- Topology `single` / current-session / objective-commands.
- HARD_CAP 9500; owner brief = `bun run status` only.
- PREREG seal before canary; sealed F1*/3.0–3.3 PREREG **immutable**.
- Isolation = absence not negation; pin ≠ conflict avoidance.
- Bash deny **before** JIT; JIT never exit 2; JIT unset=**off** · default-on **no**.
- Sticky owns presence → listen must not `leave` if host live.
- claude-mem header: active install date-only; **autoUpdate off** or re-run B-4 after upgrade.

## Evidence

- 3.3: `docs/spikes/RULE-ROUTER-PHASE3.3-SPEC.md` · `docs/spikes/RULE-ROUTER-PHASE3.3-PREREG.md` · PHASE3-SPEC §2 row  
- 3.2: `docs/spikes/RULE-ROUTER-PHASE3.2-RESULT.md`  
- UC-3 / Cause B: prior commits · `check:mem-header`

## Don't redo

- 3.2 canary remeasure / soften COMPLY / default-on JIT.  
- 3.3 PREREG cell/prompt/COMPLY after observation.  
- UC-3 leave while sticky live; B-4 as B-7 closed.  
- verification/review/gate as 3.3 scope; silent product MINOR.
