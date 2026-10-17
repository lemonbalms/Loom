# HANDOFF — Loom

**Updated:** 2026-10-17
**Workspace:** `/Users/kyoungsiklee/projects/loom`

## One-line resume

> v0.37.0 **approved** (R55) · P1~P4c 커밋 · **next = P4 검증** · 재개: [RESUME](tasks/v0370-wip/RESUME.md)

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | **v0.37.0 `approved`** (R55) · next P1 | `docs/PLAN.md` |
| Dogfood | unblocked (p17 · 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | **P3 soft close** · JIT 3.0–3.2 only | `PHASE3-SOFT-CLOSE.md` |
| Dev env | claude-mem 13.12.4 B-4 + autoUpdate off | `check:mem-header` |

## Current action

### v0.37.0 approved (R55) · next = P1 policyGaps core + fence header

**Goal:** 4단계 3부 — policy honesty (step-4 criterion (c)): one pure `policyGaps(effective, enabledAgents) → Gap[]` renders the bridge start warning, `worker.strictEnforcement` refusal, doctor Policy section and the worker policy notice in the existing fence (default on, gap agents only, actual deny strings) · opt-in `worker.rules.enabled` · `worker.maxConcurrent.<agent>: 0` → `agent_disabled` · delete `AGENT_HINT.txt`/`systemHint()` · P4b shadow label. Default policy = 6 gaps; built-in deny always unioned → strict passes only with codex+grok off (R55-M1). Wire · argv · hint · template · `policy.json` schema unchanged. Authority `docs/PLAN.md` §0.37.0 · `docs/plan_review.md` R55 (M1 · M2 · L1–L4 in PLAN). v0.36.0 shipped `acd53a0`.

**Playbook (next session):**
1. `bun run status` · `handoff:check` · `smoke:memory-inject` · `smoke:memory`
2. P1 red (test files only — `memory-inject.test.ts:66-67` header constant + new `policy-gaps.test.ts` + new `bridge-config-policy.test.ts` (`strictEnforcement` · `rules` only; `maxConcurrent` 0 is P2 — R55-L4)) → green → GPT-6 Astra high verify → P2…P5 (PLAN ⑦) · pinned test files byte-unedited except the 3 declared edits · every test/smoke child: HOME + `LOOM_TEST_HOME` temp (+ `LOOM_PROFILE=smoke`)
3. Ship gate: `smoke:policy --real-cli --owner-approved` ① only (1 card each, `Reply with the single word ok.`) must PASS — needs owner yes (UK-1 ship-blocking, R55-M2)
4. Carry: `smoke:memory-inject --real-cli` (owner yes) · live `smoke:service --live` (owner yes) · Linux live unverified · service log rotation · codex MCP approval · 0.36 UK-1–UK-7

**Line:** topology **`full`** · execution **`delegated`** · verify **`independent`** · chain Claude→Opus5.5-med impl→Astra-high verify + Opus 5.5 high advisor (promoted from `single` 2026-10-15 — `DOGFOOD_LOOP.md` §0.5.3)

**Done when (this handoff):** P1 red→green committed and independently verified.

**Must not:** run live launchd/systemd registration (`smoke:service --live`) or real-CLI smoke (`smoke:memory-inject --real-cli` · `smoke:policy --real-cli`) without explicit owner yes · ship 0.37.0 without the real-CLI ① PASS · test/probe without temp HOME + `LOOM_TEST_HOME` · start next-step code before owner pick + review · inherit bridge env into workers (R48-H1) · sync lock on WS receive path (R47-H1) · demote to `single` without owner · remeasure 3.3–3.4b · default-on JIT.

## Active checks

| Check | Status | Impact | Evidence |
|---|---|---|---|
| Headless lanes | **P1–P4 done** · live smoke 7/7 mandatory (opt. Q3 skipped) | dev-process, own commits | `HEADLESS-LANES-DESIGN.md` |
| Known fail | `handoff-checkpoint` live Evidence · pre-existing (`9ffc100`) | not a regression | suite 3133/1 |
| v0.37.0 | **approved** (R55) | P1–P4c committed · next P4 verify · ship needs real-CLI ① | `docs/PLAN.md` |
| v0.36.0 | **shipped** `acd53a0` | 4단계 2부a · smoke 7/7 PASS (fake CLIs) · real CLI not run | `docs/PLAN.md` |
| v0.32–0.35 | **shipped** `9567f87`·`0a20173`·`dbab890`·`5fa8167` | steps 2–4.1 · smokes PASS · 0.34 live not run | `docs/PLAN.md` |
| P3 soft close | **closed** | freeze new surfaces | `PHASE3-SOFT-CLOSE.md` |
| 3.0–3.2 soft live | **opt-in** | JIT | consts true · RESULT |
| 3.3–3.4b live | **false** | blocked | consts false · RESULT |
| `smoke:uc` · B-4 pin | **OK** | prior | check:mem-header |
| B-7 upstream | deferred optional | ecosystem | PRIORITIES P2c |

## Owner pending

| Decision | Why | Safe default | Evidence |
|---|---|---|---|
| 0.37.0 real-CLI smoke ① | ship-blocking (R55-M2 · UK-1) — default-on policy notice reaches real codex/grok/claude first turns | not run · ship waits | PLAN §0.37.0 (j) |
| 0.36.0 real-CLI smoke | `--real-cli --owner-approved` runs real claude/codex/grok — UK-1/UK-3 | not run | `MEMORY-INJECT-SMOKE-0360.md` |
| 0.34.0 live OS smoke | 3단계 go = "진행해" 2026-10-16 · real launchd/systemd write needs separate yes · 7단계 last — 재질문 금지 | not run | PLAN §0.34.0 P5 |
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

- Close: `docs/spikes/RULE-ROUTER-PHASE3-SOFT-CLOSE.md`  
- 3.4b/3.4/3.3 RESULT · `scripts/rule-router-jit.ts`  
- 3.0–3.2 RESULT · live consts true

## Don't redo

- 3.3–3.4b remeasure / COMPLY soften / live without T1(a).  
- default-on JIT · silent product MINOR (owner picks each step).  
- B-4 as B-7 closed · UC-3 leave while sticky live.
