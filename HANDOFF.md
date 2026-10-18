# HANDOFF — Loom

**Updated:** 2026-10-18
**Workspace:** `/Users/kyoungsiklee/projects/loom`

## One-line resume

> v0.44.0 **approved** (R63) · `loom history search` · **next = P1 history scanner red → green**

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | **v0.44.0 approved** (R63) · next = P1 · 0.43.0 shipped | `docs/PLAN.md` |
| Dogfood | unblocked (p17 · 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | **P3 soft close** · JIT 3.0–3.2 only | `PHASE3-SOFT-CLOSE.md` |
| Dev env | claude-mem 13.12.4 B-4 + autoUpdate off | `check:mem-header` |

## Current action

### v0.44.0 approved (R63) · next = P1 history scanner red → green

**Goal:** stage 6 part 1 — read-only `loom history search` (linear scan of room event logs · redact before match · exit 2 on any skipped file).
No real-CLI run needed (D9). Authority: `docs/PLAN.md` §0.44.0 · R63 (approved-with-fixes → M1–M4 · L1–L6 folded, no R63b).

**Playbook (next session):**
1. `bun run status` · `handoff:check`
2. P1 red (`history-scan.test.ts` only) → green (`history-scan.ts` · `host/src/index.ts`) via `lane.ts impl` → `lane.ts verify` → P2 CLI → P3 dist + docs + version
3. 0.43 observations (UK-1, not failures): claude skipped the `loom-card-report` format · grok one-line preamble before `Status:` · codex `Checks:` names commands
4. Later: snapshot mtime cache · U+2E40/U+A78A fence lookalikes (UK-6) · class 46 (UK-7) · watch `card_prompt … neutralized` counts in the first dogfood wave
5. Carry: Linux/Windows live unverified · service log rotation · codex MCP approval · 0.37 UK-2/UK-3/UK-7 · `pane-cleanup.test.ts` ⑥ flaky under load

**Line:** topology **`full`** · execution **`delegated`** · verify **`independent`** · chain Claude→Opus 5.5 medium impl (`lane.ts impl`)→GPT-6 Astra high verify (`lane.ts verify`) + loom-advisor Opus 5.5 high (promoted from `single` 2026-10-15 — `DOGFOOD_LOOP.md` §0.5.3)

**Done when (this handoff):** §0.44.0 Done (a) — `history-scan.test.ts` green · `bun run typecheck` 0 · verify PASS.

**Must not:** run any further live launchd/systemd registration or real-CLI smoke (e.g. `smoke:policy --real-cli` · `smoke:memory-write --real-cli`) without explicit owner yes · test/probe without temp HOME + `LOOM_TEST_HOME` · start next-step code before owner pick + review · inherit bridge env into workers (R48-H1) · sync lock on WS receive path (R47-H1) · demote to `single` without owner · remeasure 3.3–3.4b · default-on JIT.

## Active checks

| Check | Status | Impact | Evidence |
|---|---|---|---|
| Headless lanes | **P1–P4 done** · live smoke 7/7 | dev-process | `HEADLESS-LANES-DESIGN.md` |
| Suite | **0 fail** (4003/0) | `pane-cleanup` ⑥ flaky under load | 0.43 ship |
| v0.44.0 | **approved** (R63) · P1 next | read-only history search | `docs/PLAN.md` §0.44.0 |
| v0.43.0 | **shipped** 2026-10-18 · real-CLI D7 PASS | system sections reach all 3 CLIs | `MEMORY-WRITE-SMOKE-0430.md` |
| v0.32–0.42 | **shipped** | 0.34 live (macOS) · 0.36–0.39 real-CLI PASS | `docs/PLAN.md` |
| P3 soft close | **closed** · 3.0–3.2 opt-in · 3.3–3.4b false | freeze new surfaces | `PHASE3-SOFT-CLOSE.md` |
| `smoke:uc` · B-4 pin | **OK** | prior | check:mem-header |
| B-7 upstream | deferred optional | ecosystem | PRIORITIES P2c |

## Owner pending

| Decision | Why | Safe default | Evidence |
|---|---|---|---|
| P3 reopen / default-on | risk | **off** · new SPEC only | SOFT-CLOSE |
| B-7 issue/PR | optional | defer | platform lessons |

## Blockers

(none)

## Invariants

- Nine headings; D1 ≤8192B; no `<details>`; traps only in `tasks/traps.md`.
- Topology `full` (promoted 2026-10-15); demote = owner only.
- HARD_CAP 9500; owner brief = `bun run status` only.
- PREREG seal before canary; sealed F1*/3.0–3.4b **immutable**.
- Phase 3 soft: live **3.0–3.2 only** · default-on **no**.
- Bash deny **before** JIT; JIT never exit 2; JIT unset=**off**.
- Sticky owns presence → listen must not `leave` if host live.
- claude-mem header: date-only; **autoUpdate off** or re-run B-4 after upgrade.

## Evidence

- Session ritual: `docs/SESSION-START.md` · topology `docs/spikes/SINGLE-TOPOLOGY-EXECUTION-DESIGN.md`  
- Close: `docs/spikes/RULE-ROUTER-PHASE3-SOFT-CLOSE.md`  
- 0.37.0 smoke: `docs/spikes/POLICY-HONESTY-SMOKE-0370.md`  
- 3.4b/3.4/3.3 RESULT · `scripts/rule-router-jit.ts`  

## Don't redo

- 3.3–3.4b remeasure / COMPLY soften / live without T1(a).  
- default-on JIT · silent product MINOR (owner picks each step).  
- B-4 as B-7 closed · UC-3 leave while sticky live.  
- 0.37.0 real-CLI ① (PASS 2026-10-17) · 0.38.0 real-CLI ① (PASS 2026-10-18) · 0.39.0 real-CLI (PASS 2026-10-18) · 0.43.0 real-CLI (PASS 2026-10-18).  
- 0.36.0 real-CLI smoke (PASS 2026-10-17).  
- 0.34.0 live launchd smoke (PASS 2026-10-17, macOS).
