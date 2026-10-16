# HANDOFF — Loom

**Updated:** 2026-10-16
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> v0.36.0 **approved** (R54) · 4단계 2부a memory injection · **next = P1** (red first) · topology full

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | **v0.36.0 `approved`** (R54) · next P1 | `docs/PLAN.md` |
| Dogfood | unblocked (p17 · 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | **P3 soft close** · JIT 3.0–3.2 only | `PHASE3-SOFT-CLOSE.md` |
| Dev env | claude-mem 13.12.4 B-4 + autoUpdate off | `check:mem-header` |

## Current action

### v0.36.0 approved (R54) · next = P1 fingerprint 6th input + fence renderer

**Goal:** 4단계 2부a — inject the v0.35.0 memory snapshot into headless workers at card start (step-4 criterion (a)): opt-in `worker.memory.enabled` (default off = stdin/argv/fingerprint/`session.json` byte-identical to 0.35) · first spawn under card lock: `loadMemorySnapshot` → `redactSecrets(text, process.env)` → neutralize marker/nonce lookalike lines → nonce fence → `<cardDir>/memory-snapshot.md` 0600 · first turn `[listing\n\n]marker\n\n<fence>\n\n<prompt>` · conditional 6th fingerprint input `memorySnapshotHash` · resume/recovery re-hash the file → `needs_verification` · D9 skills-off mismatch no longer starts a silent fresh session · **no `ARGV_TEMPLATE_VERSION` / hint change** · `packages/protocol` · `policy-compile.ts` · `skill-materialize.ts` diff 0. Criterion (c) moved to 0.37.0. Authority `docs/PLAN.md` §0.36.0 (D1–D11 · R1–R18 · C1 · C2 · classes 5 · 10–16 · UK-1–7) · `docs/plan_review.md` R54 (M1–M3 · L1 · L2 in PLAN). v0.35.0 shipped `5fa8167`.

**Playbook (next session):**
1. `bun run status` · `handoff:check` · `smoke:memory` · `smoke:service` · `smoke:bridge-lifecycle`
2. P1 red (test files only — invert `memory-snapshot.test.ts` D10b guard to import specifiers (the "`headless-worker.ts` must import" assertion is an expected red until P2 green — say so in the commit message) + new `memory-inject.test.ts`) → green → Opus 5.5 xhigh verify → P2…P5 (PLAN ⑦) · pinned fingerprint/argv test files byte-unedited · every test/probe/smoke child: HOME + `LOOM_TEST_HOME` temp (+ `LOOM_PROFILE=smoke` for smoke CLI children)
3. Carry: live `smoke:service --live` (owner yes — UK-1–3) · Linux live unverified (UK-4/5) · service log rotation · codex MCP approval · `propose` shell bypass · L-2 advisory · 0.35 UK-1–UK-6

**Line:** topology **`full`** · execution **`delegated`** · verify **`independent`** · chain Claude→Grok→Codex verify + fable-advisor advise (promoted from `single` 2026-10-15 — `DOGFOOD_LOOP.md` §0.5.3)

**Done when (this handoff):** P1 red→green committed and independently verified.

**Must not:** run live launchd/systemd registration (`smoke:service --live`) without explicit owner yes · test/probe without temp HOME + `LOOM_TEST_HOME` · start next-step code before owner pick + review · inherit bridge env into workers (R48-H1) · sync lock on WS receive path (R47-H1) · demote to `single` without owner · remeasure 3.3–3.4b · default-on JIT.

## Active checks

| Check | Status | Impact | Evidence |
|---|---|---|---|
| v0.36.0 | **approved** (R54) | 4단계 2부a · next P1 | `docs/PLAN.md` |
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
