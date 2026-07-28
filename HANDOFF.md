# HANDOFF — Loom

**Updated:** 2026-07-28
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> v0.28.1 · P3.0–3.2 soft + bun-test hard · **smoke:uc green** (UC-3 listen/leave fixed).

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | v0.28.1 · adapter `6e2df8a` | `docs/PLAN.md` |
| Dogfood | unblocked (p17 · 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | RULE-ROUTER 3.0–3.2 soft open | PHASE3-SPEC §2 |
| Reuse | not proven | evidence |

## Current action

### Post-3.2 + UC-3 fix shipped · next owner pick

**Shipped (do not redo):**
- Phase 3.2 dispatch soft live (G0+T1a) · `PHASE3_2_DISPATCH_LIVE_AUTHORIZED=true`
- **UC-3 smoke:** `listen` SIGTERM no longer `leave`s roster when sticky host owns presence; bounce sticky to re-attach · smoke accepts `started|already running` (0.17 host-default)
- `bun run smoke:uc` → **OK** (was FAIL 2)

**Root cause (UC-3):** listen dual-joins same peerId as sticky; shutdown called `leave` → `removePeer` → bob `peer_unknown` while host status still “running”.

**Next (owner pick — no silent product MINOR):**
1. **ISSUE cause B** (claude-mem upstream B-7 — external)  
2. **3.3+** surface (needs SPEC)  
3. Product MINOR only if owner redirects  
4. Optional: listen via sticky IPC (no dual-join) as follow-up hardening  

**Line:** topology **`single`** · execution **`current-session`** · verify **`objective-commands`** · full fallback Codex→Grok→Codex

**Must not:** default-on JIT · reopen sealed 3.2/3.1/3.0 PREREG · soften COMPLY · claim MCP hard-lock without path map · silent product MINOR.

## Active checks

| Check | Status | Impact | Evidence |
|---|---|---|---|
| P3.0–3.2 soft | **open opt-in** | JIT surfaces | RESULT docs · consts true |
| bun-test hard | **shipped** | Bash deny | `446bbe6` |
| `smoke:uc` | **OK** | UC-3 fixed | this wave |
| ISSUE cause B | open | upstream | PRIORITIES P2c |
| 3.3+ surface | unopened | needs SPEC | PHASE3-SPEC §2 |

## Owner pending

| Decision | Why | Safe default | Evidence |
|---|---|---|---|
| **post-wave next** | 3.2+UC-3 closed | wait owner · no silent MINOR | this HANDOFF |
| default-on JIT | product risk | **off** | standing |
| cause B / 3.3+ | backlog | defer | PRIORITIES · PHASE3-SPEC |
| listen dual-join hardening | UX | sticky-IPC follow-up | this wave note |

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
- Sticky owns presence: **listen must not `leave` if host live**.

## Evidence

- UC-3: `packages/cli/src/index.ts` listen shutdown · `scripts/smoke-uc.ts` host start regex · `smoke:uc OK`.  
- 3.2: RESULT rev-1 · `~/.loom/phase3-2-canary-2026-07-28/` · live const true.  
- Docs: PHASE3-SPEC §2 · PHASE3.2-* · ENFORCEABILITY · PRIORITIES P2c.

## Don't redo

- Re-open 3.2 canary / remeasure sealed PREREG; soften COMPLY.  
- default-on JIT; UC-3 “already running” as fail (UC-3.7).  
- listen `leave` while sticky host owns presence.  
- Product MINOR as silent default; dual SessionStart.
