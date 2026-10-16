# HANDOFF — Loom

**Updated:** 2026-10-16
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> v0.36.0 **implemented** · 4단계 2부a memory injection · **next = 0.37.0** (PLAN + review) · topology full

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | **v0.36.0 `implemented`** · P5 docs/smoke in · smoke 7/7 | `docs/PLAN.md` |
| Dogfood | unblocked (p17 · 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | **P3 soft close** · JIT 3.0–3.2 only | `PHASE3-SOFT-CLOSE.md` |
| Dev env | claude-mem 13.12.4 B-4 + autoUpdate off | `check:mem-header` |

## Current action

### v0.36.0 implemented · next = 0.37.0 memory proposals · rules · policy honesty

**Goal:** 4단계 2부a done — headless workers get the v0.35.0 memory snapshot at card start (step-4 criterion (a)): opt-in `worker.memory.enabled` (off = 0.35 bytes) · first spawn under card lock: `loadMemorySnapshot` → `redactSecrets(text, process.env)` → neutralize marker/nonce lines → nonce fence → `<cardDir>/memory-snapshot.md` 0600 · conditional 6th fingerprint input · resume/recovery re-hash the file → `needs_verification` · D9 · no `ARGV_TEMPLATE_VERSION`/hint change · ⑥-outside prod change 0. Authority `docs/PLAN.md` §0.36.0 · impl-notes §0.36.0 (1)–(29) · `MEMORY-INJECT-SMOKE-0360.md`.

**Playbook (next session):**
1. `bun run status` · `handoff:check` · `smoke:memory-inject` · `smoke:memory` · `smoke:bridge-lifecycle`
2. v0.36.0 release commit (ship checks per PLAN §0.36.0 (i)) → 0.37.0 PLAN MINOR (PLAN §0.36.0 "다음 후보": card-report memory proposals → `propose` · rules + policy notice in the same fence · doctor policy · `policy.strictEnforcement` · criterion (c) checklist · confusable markers · worker scrubbed-env profile) + review before code
3. Carry: `smoke:memory-inject --real-cli` (owner yes — UK-1/UK-3) · live `smoke:service --live` (owner yes) · Linux live unverified · service log rotation · codex MCP approval · L-2 advisory · 0.36 UK-1–UK-7

**Line:** topology **`full`** · execution **`delegated`** · verify **`independent`** · chain Claude→Grok→Codex verify + fable-advisor advise (promoted from `single` 2026-10-15 — `DOGFOOD_LOOP.md` §0.5.3)

**Done when (this handoff):** v0.36.0 released and 0.37.0 PLAN drafted + review gated.

**Must not:** run live launchd/systemd registration (`smoke:service --live`) or real-CLI smoke (`smoke:memory-inject --real-cli`) without explicit owner yes · test/probe without temp HOME + `LOOM_TEST_HOME` · start next-step code before owner pick + review · inherit bridge env into workers (R48-H1) · sync lock on WS receive path (R47-H1) · demote to `single` without owner · remeasure 3.3–3.4b · default-on JIT.

## Active checks

| Check | Status | Impact | Evidence |
|---|---|---|---|
| v0.36.0 | **implemented** | 4단계 2부a · smoke 7/7 PASS (fake CLIs) · real CLI not run | `docs/PLAN.md` |
| v0.35.0 | **shipped** `5fa8167` | 4단계 1부 · smoke 18/18 PASS · no worker wiring | `docs/PLAN.md` |
| v0.34.0 | **shipped** `dbab890` | 3단계 2부 · smoke ①~⑥ PASS · live not run | `docs/PLAN.md` |
| v0.33.0 | **shipped** `0a20173` | 3단계 1부 · smoke ①~④ PASS | `docs/PLAN.md` |
| v0.32.0 | **shipped** `9567f87` | step 2 done | `docs/PLAN.md` |
| P3 soft close | **closed** | freeze new surfaces | `PHASE3-SOFT-CLOSE.md` |
| 3.0–3.2 soft live | **opt-in** | JIT | consts true · RESULT |
| 3.3–3.4b live | **false** | blocked | consts false · RESULT |
| `smoke:uc` · B-4 pin | **OK** | prior | check:mem-header |
| B-7 upstream | deferred optional | ecosystem | PRIORITIES P2c |

## Owner pending

| Decision | Why | Safe default | Evidence |
|---|---|---|---|
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
