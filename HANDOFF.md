# HANDOFF — Loom

**Updated:** 2026-07-28
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> v0.28.1 · P3.0–3.2 soft · smoke:uc OK · **cause B local B-4 pinned** · next = owner pick.

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | v0.28.1 · adapter `6e2df8a` | `docs/PLAN.md` |
| Dogfood | unblocked (p17 · 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | RULE-ROUTER 3.0–3.2 soft open | PHASE3-SPEC §2 · 3.2-RESULT |
| Dev env | claude-mem 13.12.4 B-4 + autoUpdate off | `check:mem-header` · platform lessons |

## Current action

### Idle · owner pick next (no silent product MINOR)

**Shipped this day (do not redo):**
1. **Phase 3.2 dispatch** — SPEC/PREREG/RESULT · fixture `traps.watch-card` · G0+T1a · `PHASE3_2_DISPATCH_LIVE_AUTHORIZED=true` · commits `a586eb8`→`4fdbf71`
2. **UC-3 / smoke:uc** — listen SIGTERM must not `leave` while sticky owns presence (bounce sticky) · host start accepts `started|already running` · `smoke:uc OK` · `05f21cf`+dist `672de7a`
3. **Cause B local** — active **13.12.4** `nee`/`hee` date-only · backup `worker-service.cjs.pre-hookcache-b4-20260728` · **`thedotmack.autoUpdate=false`** · worker restart · **`check:mem-header OK`** · lesson `58a62a0`

**Playbook (next session cold start):**
1. `bun run status` · `bun run handoff:check` · `bun run check:mem-header` (expect OK; FAIL = autoUpdate slipped or manual upgrade)
2. Owner chose next: **3.3+** (needs SPEC) · **product MINOR** · optional **B-7** upstream issue · optional listen→sticky IPC
3. Do **not** default to product MINOR or reopen sealed PREREG

**Line:** topology **`single`** · execution **`current-session`** · verify **`objective-commands`** · full fallback Codex→Grok→Codex

**Done when (this handoff wave):** nine sections accurate · checks green · next gate = owner pick — **met after ship**.

**Must not:** default-on JIT · reopen 3.0/3.1/3.2 PREREG · soften COMPLY · listen `leave` if sticky live · re-patch without backup · claim B-7 closed by local pin alone · silent product MINOR.

## Active checks

| Check | Status | Impact | Evidence |
|---|---|---|---|
| P3.0–3.2 soft live | **opt-in** | JIT | RESULT docs · consts true |
| bun-test hard | **shipped** | Bash deny | `446bbe6` |
| `smoke:uc` | **OK** | UC-3 | `05f21cf` |
| cause B local B-4 | **OK + pinned** | cache header | `check:mem-header` · autoUpdate false |
| B-7 upstream | optional | durable fix for all | PRIORITIES P2c |
| 3.3+ surface | unopened | needs SPEC | PHASE3-SPEC §2 |

## Owner pending

| Decision | Why | Safe default | Evidence |
|---|---|---|---|
| **next gate** | 3.2+UC-3+B-4 local closed | wait owner · no silent MINOR | this HANDOFF |
| default-on JIT | product risk | **off** | standing |
| B-7 issue/PR | optional ecosystem | defer; local pin holds | platform lessons |
| 3.3+ / product | backlog | owner names it | PHASE3-SPEC · PLAN |

## Blockers

(none)

## Invariants

- Nine headings; D1 ≤8192B; no `<details>`; traps only in `tasks/traps.md`.
- Topology `single` / current-session / objective-commands.
- HARD_CAP 9500; owner brief = `bun run status` only.
- PREREG seal before canary; sealed F1*/3.0–3.2 PREREG **immutable**.
- Isolation = absence not negation; pin ≠ conflict avoidance.
- Bash deny **before** JIT; JIT never exit 2; JIT unset=**off** · default-on **no**.
- Sticky owns presence → listen must not `leave` if host live.
- claude-mem header: active install date-only; **autoUpdate off** or re-run B-4 after upgrade.

## Evidence

- 3.2: `docs/spikes/RULE-ROUTER-PHASE3.2-RESULT.md` · `docs/spikes/RULE-ROUTER-PHASE3.2-SPEC.md` · `~/.loom/phase3-2-canary-2026-07-28/`  
- UC-3: `packages/cli/src/index.ts` · `scripts/smoke-uc.ts`  
- Cause B: `scripts/check-mem-header.ts` · `tasks/lessons/platform.md`  
- Commits: `4fdbf71` · `05f21cf` · `672de7a` · `58a62a0`

## Don't redo

- 3.2 canary remeasure / soften COMPLY / default-on JIT.  
- UC-3 “already running” as fail; listen leave while sticky live.  
- Patch `context-generator.cjs` (dead); hardcode version path for B-4.  
- Treat local B-4 pin as upstream B-7 closed.  
- Silent product MINOR; dual SessionStart.
