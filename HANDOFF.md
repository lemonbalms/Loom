# HANDOFF — Loom

**Updated:** 2026-10-18
**Workspace:** `/Users/kyoungsiklee/projects/loom`

## One-line resume

> v0.38.0 **shipped** 2026-10-18 (4단계 4부 memory write path) · **next = owner picks 0.39**

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | **v0.38.0 shipped** 2026-10-18 · next = owner pick | `docs/PLAN.md` |
| Dogfood | unblocked (p17 · 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | **P3 soft close** · JIT 3.0–3.2 only | `PHASE3-SOFT-CLOSE.md` |
| Dev env | claude-mem 13.12.4 B-4 + autoUpdate off | `check:mem-header` |

## Current action

### v0.38.0 shipped · next = owner picks the 0.39 step

**Goal:** 4단계 4부 — memory write path: opt-in `worker.memory.cardWrites` (needs `memory.enabled` + `skills.enabled`) · new builtin skill `loom-memory-candidates` (forced only — R56-L2) · last complete `LOOM-MEMORY-CANDIDATES` block in the final output → room-scoped `proposed` (`supersedes: null`, human `approve` only) · caps 50/10/5 · secret/marker filters (case-sensitive — L1) · `(card, handoff, attempt)` dedupe incl. archive tail 4 MiB (M2) · same mkdir lock ≤250 ms async + fail-open · `notes.md` redacted copy · CLI refuses writes under `LOOM_CARD` · card rows `+<n> chars` + `approve` full body (M3). Off = 0.37 bytes. Wire · argv · hint · template · fence · `policy.json` unchanged. Authority `docs/PLAN.md` §0.38.0 · `docs/plan_review.md` R56 (M1–M4 · L1–L4 in PLAN). Shipped 2026-10-18 · real-CLI ① PASS (claude 1 · grok 1 · codex 0 · all `notes.md`).

**Playbook (next session):**
1. `bun run status` · `handoff:check` · `smoke:memory-write` · `smoke:memory-inject`
2. P1–P5 done · each PATCH Astra-verified (findings fixed or accepted — `implementation-notes.md` §0.38.0) · fake smoke `smoke:memory-write` 10/10 · suite 3309/1 known fail · final advise (0051) = ship · VERSION 0.38.0 + dist committed locally · pinned tests byte-unedited except the 12 declared P2 edits (R56-M1) · every test/smoke child: HOME + `LOOM_TEST_HOME` temp (+ `LOOM_PROFILE=smoke`)
3. **0.39 candidates (owner picks):** codex skill use unreliable — 0.163.0 refused the skill copy outside cwd (hint "work only inside cwd"); 0.162.1 read it on 10-15 · cause unconfirmed · listing text is not a fingerprint input · snapshot mtime cache · lookalike-marker hardening (`MEMORY-WRITE-SMOKE-0380.md`)
4. Carry: Linux/Windows live unverified · service log rotation · codex MCP approval · 0.37 UK-2/UK-3/UK-7 · `pane-cleanup.test.ts` ⑥ flaky under load

**Line:** topology **`full`** · execution **`delegated`** · verify **`independent`** · chain Claude→Opus 5.5 medium impl (`lane.ts impl`)→GPT-6 Astra high verify (`lane.ts verify`) + loom-advisor Opus 5.5 high (promoted from `single` 2026-10-15 — `DOGFOOD_LOOP.md` §0.5.3)

**Done when (this handoff):** owner picks the 0.39 step → PLAN draft → R57. Unshipped commits stay local until ship.

**Must not:** run any further live launchd/systemd registration or real-CLI smoke (e.g. `smoke:policy --real-cli` · `smoke:memory-write --real-cli`) without explicit owner yes · test/probe without temp HOME + `LOOM_TEST_HOME` · start next-step code before owner pick + review · inherit bridge env into workers (R48-H1) · sync lock on WS receive path (R47-H1) · demote to `single` without owner · remeasure 3.3–3.4b · default-on JIT.

## Active checks

| Check | Status | Impact | Evidence |
|---|---|---|---|
| Headless lanes | **P1–P4 done** · live smoke 7/7 mandatory (opt. Q3 skipped) | dev-process, own commits | `HEADLESS-LANES-DESIGN.md` |
| Known fail | `handoff-checkpoint` live Evidence · pre-existing (`9ffc100`) | not a regression | suite 3308/2 (+ flaky pane-cleanup) |
| v0.38.0 | **shipped** 2026-10-18 | fake smoke 10/10 · real-CLI ① PASS · codex skills gap found | `MEMORY-WRITE-SMOKE-0380.md` |
| v0.32–0.37 | **shipped** `9567f87`·`0a20173`·`dbab890`·`5fa8167`·`acd53a0`·`d6f7cc2` | steps 2–4.2a · 0.34 live (macOS) / 0.36 real-CLI PASS 2026-10-17 | `docs/PLAN.md` |
| P3 soft close | **closed** | freeze new surfaces | `PHASE3-SOFT-CLOSE.md` |
| 3.0–3.2 soft live | **opt-in** | JIT | consts true · RESULT |
| 3.3–3.4b live | **false** | blocked | consts false · RESULT |
| `smoke:uc` · B-4 pin | **OK** | prior | check:mem-header |
| B-7 upstream | deferred optional | ecosystem | PRIORITIES P2c |

## Owner pending

| Decision | Why | Safe default | Evidence |
|---|---|---|---|
| 0.39 step pick | codex skill use unreliable vs 0.39 perf/hardening candidates | codex skills fix first | `MEMORY-WRITE-SMOKE-0380.md` |
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
- 0.37.0 smoke: `docs/spikes/POLICY-HONESTY-SMOKE-0370.md`  
- 3.4b/3.4/3.3 RESULT · `scripts/rule-router-jit.ts`  

## Don't redo

- 3.3–3.4b remeasure / COMPLY soften / live without T1(a).  
- default-on JIT · silent product MINOR (owner picks each step).  
- B-4 as B-7 closed · UC-3 leave while sticky live.  
- 0.37.0 real-CLI ① (PASS 2026-10-17) · 0.38.0 real-CLI ① (PASS 2026-10-18).  
- 0.36.0 real-CLI smoke (PASS 2026-10-17).  
- 0.34.0 live launchd smoke (PASS 2026-10-17, macOS).
