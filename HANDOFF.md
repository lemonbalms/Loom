# HANDOFF — Loom

**Updated:** 2026-07-28
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> v0.28.1 · P3.0/3.1b soft + bun-test hard ok · **next session = Phase 3.2 dispatch**.

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | v0.28.1 · adapter `6e2df8a` | `docs/PLAN.md` |
| Dogfood | unblocked (p17 · 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | RULE-ROUTER **open 3.2 dispatch** | PHASE3-SPEC §2 |
| Reuse | not proven | evidence |

## Current action

### RULE-ROUTER — Phase 3.2 dispatch surface (next session · start here)

**Owner intent (2026-07-28):** next session **진행 = 후보 B = 3.2 dispatch** only.  
Do **not** default to product MINOR or backlog unless 3.2 blocked.

**Shipped (background — do not redo):**
- 3.0 delegation soft live opt-in (T1b) · 3.1b ship soft live (T1a) · `PHASE3_1_SHIP_LIVE_AUTHORIZED=true`
- hard `check-bun-test-env` on Bash (deny before jit) · `446bbe6`
- JIT unset=**off** · default-on **forbidden**

**Goal (3.2 wave chain):**
1. **SPEC** `docs/spikes/RULE-ROUTER-PHASE3.2-SPEC.md` — matcher · unit set · C1 path · live gate constant  
2. **PREREG seal** `…-PHASE3.2-PREREG.md` **before** any dispatch live inject / canary measure  
3. Impl behind canary + unit tests (pin excluded · C3 · no JIT exit-2)  
4. Model canary n=10 (or sealed n) → RESULT · only then dispatch live authorize  
5. HANDOFF + ship

**Authority (read first):**
1. `docs/spikes/RULE-ROUTER-PHASE3-SPEC.md` §2 row **3.2** (order fixed; 3.1 passed)
2. `docs/spikes/RULE-ROUTER-PHASE3.1-SPEC-REV.md` — H1 isolation=absence≠negation · soft≠hard
3. `docs/spikes/RULE-ENFORCEABILITY.md` — dispatch often **G/J**; do not claim H without path map
4. Registry units with `surface`∋`dispatch` (non-pin first):  
   `orch.watch-card` · `orch.card-done` · `traps.dispatch-marker` · `traps.card-done` · `traps.watch-card` · `traps.terminal-replay` · `traps.pane-lane-death` · (+ shared G: `orch.lane-placement` · `agents.impl-delegation` · `traps.grok-readonly` if selected)  
5. F1e / 3.0 / 3.1b canary harness patterns under `~/.loom/`

**Playbook (first tools next session):**
1. `bun run status` · `bun test scripts/rule-router-jit.test.ts scripts/hooks/check-bun-test-env.test.ts`  
2. Inventory dispatch units (grade/cost/triggers) + propose **1 canary fixture** (short · observable COMPLY)  
3. Draft SPEC+PREREG · seal digests · **commit PREREG before measure**  
4. Matcher: define real tool surface (MCP dispatch / Bash script / herdr — **measure what exists**; do not invent wire)  
5. Prefer **soft canary first**; hard deny only if ENFORCEABILITY H fits (like bun-test-env)

**Line:** topology **`single`** · execution **`current-session`** · verify **`objective-commands`** · full fallback Codex→Grok→Codex

**Done when:** 3.2 PREREG sealed + (same or follow wave) canary RESULT with G0+T1 · dispatch live still opt-in/gated · default-on no.

**Must not:** live dispatch inject pre-PREREG · default-on · reopen 3.0/3.1/3.1b PREREG · pin as conflict avoidance · JIT exit-2 · probe “no standing rules” negation · claim pane/bridge hard-lock without path closure · skip fable-advisor if R{n} required (WORKFLOW §5.1).

## Active checks

| Check | Status | Impact | Evidence |
|---|---|---|---|
| P3.0 T1(b) | **PASS** | delegation soft | PHASE3-RESULT rev-2 |
| P3.1b T1(a) | **PASS** | ship soft | PHASE3.1b-RESULT |
| bun-test hard | **shipped** | Bash deny | `check-bun-test-env.ts` · `446bbe6` |
| P3.2 SPEC/PREREG | **pending** | next | PHASE3-SPEC §2 |
| P3.2 model canary | **pending** | blocks dispatch live | — |
| ISSUE cause B | open | backlog | not this wave |
| `smoke:uc` UC-3 | fail 2 | backlog | not this wave |

## Owner pending

| Decision | Why | Safe default | Evidence |
|---|---|---|---|
| **3.2 next** | owner 2026-07-28 | **proceed 3.2** | this HANDOFF |
| default-on JIT | product risk | **off** | standing |
| 3.2 hard vs soft | risk | soft canary first | ENFORCEABILITY |
| 카테고리 / cause B | backlog | defer | — |

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
- Sealed F1*/3.0/3.1/3.1b PREREG **immutable**.
- pin/전량 ≠ 충돌 회피 (REVIEW-rev-13 M-1).

## Evidence

- HEAD hard guard `446bbe6` · ship soft authorize in jit constant.  
- 3.1b evidence `~/.loom/phase3-1b-canary-2026-07-28/` · H1 spike `…/phase3-1-h1-spike-…`.  
- Docs: PHASE3-SPEC · PHASE3.1b-RESULT · SPEC-REV · BUN-TEST-ENV-HARD.  
- Dispatch unit list: registry `surface`∋`dispatch` (see Current action).

## Don't redo

- Product MINOR as default next (owner chose **3.2**).  
- 3.1 PREREG remeasure; soften COMPLY post-hoc; default-on.  
- Dispatch live without sealed 3.2 PREREG + canary.  
- Global “all shells hard” claims; put deny in `rule-router-jit`.  
- Dual SessionStart; MAP under NORMS-only; F6 over DOGFOOD §0.5.
