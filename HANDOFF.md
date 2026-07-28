# HANDOFF — Loom

**Updated:** 2026-07-28
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> v0.28.1 · P3.0/3.1/3.2 soft live opt-in + bun-test hard · **3.2 dispatch closed (G0+T1a)**.

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | v0.28.1 · adapter `6e2df8a` | `docs/PLAN.md` |
| Dogfood | unblocked (p17 · 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | RULE-ROUTER **3.0+3.1+3.2 soft open** | PHASE3-SPEC §2 · 3.2-RESULT |
| Reuse | not proven | evidence |

## Current action

### RULE-ROUTER — Phase 3.2 dispatch **closed** · next owner pick

**Shipped this wave (do not redo):**
- SPEC/PREREG/RESULT: `RULE-ROUTER-PHASE3.2-*` · fixture `traps.watch-card` sha8 `57eb65d6`
- PREREG seal commit `a586eb8` **before** measure · evidence `~/.loom/phase3-2-canary-2026-07-28/`
- Model n=10: **G0 PASS · T1(a) PASS** · base COMPLY 0/5 · jit COMPLY **4/5** · DELIVERED 5/5
- `PHASE3_2_DISPATCH_LIVE_AUTHORIZED=true` (soft · `LOOM_RULE_ROUTER_JIT=1` only)
- Matcher: Bash dispatch keywords + canary `LOOM_RULE_ROUTER_CANARY_SURFACE=dispatch`
- Wire: Claude Code PreToolUse **Bash only** (MCP dispatch Out)

**Still true (standing):**
- JIT unset=**off** · **default-on forbidden**
- ship soft live (3.1b) · delegation soft (3.0) · hard `check-bun-test-env` (`446bbe6`)
- Isolation = absence not negation · pin ≠ conflict avoidance · JIT never exit 2

**Next gate (owner pick — no auto product MINOR):**
1. **3.3+** surface (PHASE3-SPEC §2 “기타” — needs new SPEC if chosen)  
2. **ISSUE cause B** / 카테고리 backlog  
3. **`smoke:uc` UC-3** (fail 2 · backlog)  
4. Product MINOR only if owner redirects  

**Line:** topology **`single`** · execution **`current-session`** · verify **`objective-commands`** · full fallback Codex→Grok→Codex

**Done when (3.2):** PREREG sealed + RESULT G0+T1 · live opt-in · default-on no — **met**.

**Must not:** default-on · reopen sealed 3.2/3.1/3.0 PREREG · soften COMPLY post-hoc · claim pane/bridge hard-lock without path map · invent MCP wire · put deny logic inside `rule-router-jit` exit-2.

## Active checks

| Check | Status | Impact | Evidence |
|---|---|---|---|
| P3.0 T1(b) | **PASS** | delegation soft | PHASE3-RESULT rev-2 |
| P3.1b T1(a) | **PASS** | ship soft | PHASE3.1b-RESULT |
| bun-test hard | **shipped** | Bash deny | `446bbe6` |
| P3.2 SPEC/PREREG | **sealed** | dispatch | PHASE3.2-PREREG · `a586eb8` |
| P3.2 model canary | **PASS T1a** | dispatch soft live | PHASE3.2-RESULT · p32-gates |
| ISSUE cause B | open | backlog | not this wave |
| `smoke:uc` UC-3 | fail 2 | backlog | not this wave |

## Owner pending

| Decision | Why | Safe default | Evidence |
|---|---|---|---|
| **post-3.2 next** | surfaces 3.0–3.2 closed | wait owner · no silent MINOR | this HANDOFF |
| default-on JIT | product risk | **off** | standing |
| 3.3+ / cause B / UC-3 | backlog | defer until owner | — |
| MCP dispatch matcher | wire not in PreToolUse | out until SPEC | 3.2-SPEC §1 |

## Blockers

(none)

## Invariants

- Nine headings; D1 ≤8192B; no `<details>`; traps only in `tasks/traps.md`.
- Topology `single` / current-session / objective-commands; lockedness ≠ auto-delegate.
- HARD_CAP 9500; owner brief = `bun run status` only.
- design-approved ≠ impl-authorized; PREREG seal before canary measure.
- Isolation = **absence not negation** (3.1 H1).
- Bash: deny hooks **before** JIT; JIT never exit 2.
- JIT unset = **off** · live opt-in · **default-on no**.
- Sealed F1*/3.0/3.1/3.1b/**3.2** PREREG **immutable**.
- pin/전량 ≠ 충돌 회피 (REVIEW-rev-13 M-1).

## Evidence

- 3.2: RESULT rev-1 · `~/.loom/phase3-2-canary-2026-07-28/` · scorer `6f3f3bca` · live const true.  
- 3.1b ship + hard bun-test `446bbe6` · 3.0 delegation soft.  
- Docs: PHASE3-SPEC §2 · PHASE3.2-SPEC/PREREG/RESULT · ENFORCEABILITY.  
- Code: `scripts/rule-router-jit.ts` surfaces delegation|ship|dispatch.

## Don't redo

- Re-open 3.2 canary / remeasure sealed PREREG; soften COMPLY.  
- default-on JIT; pre-PREREG live inject (historical).  
- Product MINOR as silent default without owner.  
- Global “all shells hard”; deny-in-JIT exit-2.  
- Dual SessionStart; claim MCP/herdr hard-lock without path closure.
