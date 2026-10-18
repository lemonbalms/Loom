# HANDOFF — Loom

**Updated:** 2026-10-18
**Workspace:** `/Users/kyoungsiklee/projects/loom`

## One-line resume

> v0.43.0 **implemented** (P1–P4) · **next = owner yes → real-CLI ×3** → ship · 0.42.0 shipped

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | **v0.43.0 `approved`** (R62) · next P1 | `docs/PLAN.md` |
| Dogfood | unblocked (p17 · 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | **P3 soft close** · JIT 3.0–3.2 only | `PHASE3-SOFT-CLOSE.md` |
| Dev env | claude-mem 13.12.4 B-4 + autoUpdate off | `check:mem-header` |

## Current action

### v0.43.0 implemented · next = owner-approved real-CLI ×3 → ship

**Goal:** 업그레이드 5단계 3부 — 0.43.0 semantic move: persona · rules · response style · closing boundary into the system channel (manifest-driven), fingerprint change → drain, record v3 if the section structure changes (R61-M1 projection test forces it). **Ship needs an owner-approved real-CLI run ×3** (stage-5 done criterion "all three CLIs really receive it" · 0.41 UK-4 claude/grok system-channel authority). Authority `docs/PLAN.md` §0.43.0 · R62 (H1/M1/L2 wording verbatim · M2 pin `:63`). **State:** P1–P3c committed (`c11175b`…`06b4eb1`) · P4 docs/version committed · real-CLI not run. **Next:** owner yes → `env -u LOOM_RELAY_TOKEN -u LOOM_RELAY_URL bun run smoke:memory-write --real-cli --owner-approved` → fill `docs/spikes/MEMORY-WRITE-SMOKE-0430.md` (R13 ①–⑥) → (e)(f) · `build:cli` · ship. Next-version candidate: `memorySnapshotLocked` cap uses `Buffer.byteLength` (lone surrogate 2 B vs 3 B written — implementation-notes §0.42.0 (9)). 0.42.0 shipped 2026-10-18.

**Playbook (next session):**
1. `bun run status` · `handoff:check` · `smoke:memory-write` · `smoke:memory-inject`
2. 0.43.0 evidence: verify 0120 · 0122 PASS · 0124 FAIL→P3b · 0127 1 M accepted (same-user race) · advise 0128 FIX-FIRST→P3c · 0130 PASS-with-lows · suite 4003/0 · fake smokes 11/11 · 7/7
3. Real-CLI PASS = R13 ①–⑥ (harness PASS ≠ D7 PASS: each agent proposes ≥ 1) · any fail → no ship, classify, owner picks
4. Later candidates: snapshot mtime cache · U+2E40/U+A78A fence lookalikes (UK-6) · class 46 (UK-7) · watch `card_prompt … neutralized` counts in the first dogfood wave (advise 0082)
5. Carry: Linux/Windows live unverified · service log rotation · codex MCP approval · 0.37 UK-2/UK-3/UK-7 · `pane-cleanup.test.ts` ⑥ flaky under load

**Line:** topology **`full`** · execution **`delegated`** · verify **`independent`** · chain Claude→Opus 5.5 medium impl (`lane.ts impl`)→GPT-6 Astra high verify (`lane.ts verify`) + loom-advisor Opus 5.5 high (promoted from `single` 2026-10-15 — `DOGFOOD_LOOP.md` §0.5.3)

**Done when (this handoff):** 0.43.0 PLAN `approved` (R62) · PATCHes Astra-verified · fake smokes green · owner-approved real-CLI ×3 PASS · ship. Unshipped commits stay local until ship (pre-push dist check reads the working tree).

**Must not:** run any further live launchd/systemd registration or real-CLI smoke (e.g. `smoke:policy --real-cli` · `smoke:memory-write --real-cli`) without explicit owner yes · test/probe without temp HOME + `LOOM_TEST_HOME` · start next-step code before owner pick + review · inherit bridge env into workers (R48-H1) · sync lock on WS receive path (R47-H1) · demote to `single` without owner · remeasure 3.3–3.4b · default-on JIT.

## Active checks

| Check | Status | Impact | Evidence |
|---|---|---|---|
| Headless lanes | **P1–P4 done** · live smoke 7/7 mandatory (opt. Q3 skipped) | dev-process, own commits | `HEADLESS-LANES-DESIGN.md` |
| Suite | **0 fail** (live-checkpoint fixed `3a7583f`) | flaky `pane-cleanup` ⑥ under load only | suite 4003/0 (0.43 P3b) |
| v0.42.0 · v0.41.0 · v0.40.0 · v0.39.0 · v0.38.0 | **shipped** 2026-10-18 | 0.39 real-CLI PASS (codex reads skills) · 0.38 real-CLI ① PASS | `MEMORY-WRITE-SMOKE-0380.md` |
| v0.32–0.37 | **shipped** `9567f87`·`0a20173`·`dbab890`·`5fa8167`·`acd53a0`·`d6f7cc2` | steps 2–4.2a · 0.34 live (macOS) / 0.36 real-CLI PASS 2026-10-17 | `docs/PLAN.md` |
| P3 soft close | **closed** | freeze new surfaces | `PHASE3-SOFT-CLOSE.md` |
| 3.0–3.2 soft live | **opt-in** | JIT | consts true · RESULT |
| 3.3–3.4b live | **false** | blocked | consts false · RESULT |
| `smoke:uc` · B-4 pin | **OK** | prior | check:mem-header |
| B-7 upstream | deferred optional | ecosystem | PRIORITIES P2c |

## Owner pending

| Decision | Why | Safe default | Evidence |
|---|---|---|---|
| stage 5 · 0.43 real-CLI | 0.43 semantic move ships only after an owner-approved real-CLI ×3 run | ask owner before running | `UPGRADE-PLAN.md` |
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
- 0.37.0 real-CLI ① (PASS 2026-10-17) · 0.38.0 real-CLI ① (PASS 2026-10-18) · 0.39.0 real-CLI (PASS 2026-10-18).  
- 0.36.0 real-CLI smoke (PASS 2026-10-17).  
- 0.34.0 live launchd smoke (PASS 2026-10-17, macOS).
