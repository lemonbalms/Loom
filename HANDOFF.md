# HANDOFF — Loom

**Updated:** 2026-10-16
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> v0.35.0 **implemented** · 4단계 1부 memory/rules/skills · **next = 0.36.0** snapshot injection (PLAN + R54) · topology full

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | **v0.35.0 `implemented`** · P5 docs/smoke in · smoke 18/18 | `docs/PLAN.md` |
| Dogfood | unblocked (p17 · 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | **P3 soft close** · JIT 3.0–3.2 only | `PHASE3-SOFT-CLOSE.md` |
| Dev env | claude-mem 13.12.4 B-4 + autoUpdate off | `check:mem-header` |

## Current action

### v0.35.0 implemented · next = 0.36.0 card-start snapshot + fenced injection

**Goal:** 4단계 1부 done — memory/rules/skills store + CLI + pure snapshot reader (`memory/<agentKey>/entries.jsonl` v1 · store-local `seq` + `(seq, id)` fold · `loom memory add|propose|list|show|approve|retire|compact` · `loom rules list` · `loom skills list` · doctor Memory section · `loadMemorySnapshot` unwired). **Zero worker/prompt/bridge change** (D1 — `agent-argv.ts` · `policy-compile.ts` · `packages/protocol` diff 0 vs `dbab890`). Only out-of-⑥ prod change: P4b `redact.ts` linear regex (advisor-approved, output byte-identical). Authority `docs/PLAN.md` §0.35.0 · impl-notes §0.35.0 (1)–(52) · `USER_GUIDE.md` §20 · smoke `MEMORY-SMOKE-0350.md`. v0.34.0 shipped `dbab890`.

**Playbook (next session):**
1. `bun run status` · `handoff:check` · `smoke:memory` · `smoke:service` · `smoke:bridge-lifecycle`
2. v0.35.0 release commit (ship checks per PLAN §0.35.0 (k)) → 0.36.0 PLAN MINOR (PLAN §0.35.0 "다음 후보": D9 stored hash · D10 `ARGV_TEMPLATE_VERSION` bump · C1 `HeadlessDeps.profile` · reader-outside `redactSecrets(text, process.env)` · no `## ` section split · (c) option-ii checklist) + R54 before code
3. Carry: live `smoke:service --live` (owner yes — UK-1–3) · Linux live unverified (UK-4/5) · service log rotation · codex MCP approval · `propose` shell bypass · L-2 advisory · 0.35 UK-1–UK-6

**Line:** topology **`full`** · execution **`delegated`** · verify **`independent`** · chain Claude→Grok→Codex verify + fable-advisor advise (promoted from `single` 2026-10-15 — `DOGFOOD_LOOP.md` §0.5.3)

**Done when (this handoff):** v0.35.0 released and 0.36.0 PLAN drafted + R54 gated.

**Must not:** run live launchd/systemd registration (`smoke:service --live`) without explicit owner yes · test/probe without temp HOME + `LOOM_TEST_HOME` · start next-step code before owner pick + review · inherit bridge env into workers (R48-H1) · sync lock on WS receive path (R47-H1) · demote to `single` without owner · remeasure 3.3–3.4b · default-on JIT.

## Active checks

| Check | Status | Impact | Evidence |
|---|---|---|---|
| v0.35.0 | **implemented** | 4단계 1부 · smoke 18/18 PASS · no worker wiring | `docs/PLAN.md` |
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
