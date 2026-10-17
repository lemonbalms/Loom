# HANDOFF — Loom

**Updated:** 2026-10-18
**Workspace:** `/Users/kyoungsiklee/projects/loom`

## One-line resume

> v0.41.0 **shipped** (R60) · prompt record + `loom prompt show` · **next = 0.42.0 section manifest PLAN**

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | **v0.41.0 shipped** (R60) · next 0.42 PLAN | `docs/PLAN.md` |
| Dogfood | unblocked (p17 · 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | **P3 soft close** · JIT 3.0–3.2 only | `PHASE3-SOFT-CLOSE.md` |
| Dev env | claude-mem 13.12.4 B-4 + autoUpdate off | `check:mem-header` |

## Current action

### v0.41.0 shipped · next = 0.42.0 section manifest PLAN (stage 5 part 2)

**Goal:** 업그레이드 5단계 2부 — 0.42.0 section manifest: move today's first-turn composition (hint · listing · marker · fence (notice · rules · memory) · body) into a declared `sections[]` + one assembler, **byte-preserving** (golden tests: same inputs + injected nonce → same bytes · R60-L1). Evidence pack → decision list → PLAN §0.42.0 → R61 → implement. 0.43 = semantic move (fingerprint change · drain · owner real-CLI ×3). 0.41.0 shipped 2026-10-18: per-attempt `prompt-<n>.json` + read-only `loom prompt show` (`implementation-notes.md` §0.41.0 (1)–(11)).

**Playbook (next session):**
1. `bun run status` · `handoff:check` · `smoke:memory-write` · `smoke:memory-inject`
2. 0.41.0 evidence: verify 0088 → P1b 0092 · 0090 · 0094 → P3b → 0097 (M1 accepted) → P3c → 0099 (accepted (11)) · final advise 0101 FIX-FIRST docs → fixed · suite 3517/1 known fail
3. 0.42 first step: evidence pack on golden-test feasibility (nonce injection `memoryNonce`, listing inputs, policy notice) · reuse stage-5 pack (lane 0083)
4. Later candidates: snapshot mtime cache · U+2E40/U+A78A fence lookalikes (UK-6) · class 46 (UK-7) · watch `card_prompt … neutralized` counts in the first dogfood wave (advise 0082)
5. Carry: Linux/Windows live unverified · service log rotation · codex MCP approval · 0.37 UK-2/UK-3/UK-7 · `pane-cleanup.test.ts` ⑥ flaky under load

**Line:** topology **`full`** · execution **`delegated`** · verify **`independent`** · chain Claude→Opus 5.5 medium impl (`lane.ts impl`)→GPT-6 Astra high verify (`lane.ts verify`) + loom-advisor Opus 5.5 high (promoted from `single` 2026-10-15 — `DOGFOOD_LOOP.md` §0.5.3)

**Done when (this handoff):** 0.42.0 PLAN `approved` (R61) and its PATCHes each Astra-verified · golden byte-identity · suite green · ship. Unshipped commits stay local until ship (pre-push dist check reads the working tree).

**Must not:** run any further live launchd/systemd registration or real-CLI smoke (e.g. `smoke:policy --real-cli` · `smoke:memory-write --real-cli`) without explicit owner yes · test/probe without temp HOME + `LOOM_TEST_HOME` · start next-step code before owner pick + review · inherit bridge env into workers (R48-H1) · sync lock on WS receive path (R47-H1) · demote to `single` without owner · remeasure 3.3–3.4b · default-on JIT.

## Active checks

| Check | Status | Impact | Evidence |
|---|---|---|---|
| Headless lanes | **P1–P4 done** · live smoke 7/7 mandatory (opt. Q3 skipped) | dev-process, own commits | `HEADLESS-LANES-DESIGN.md` |
| Known fail | `handoff-checkpoint` live Evidence · pre-existing (`9ffc100`) | not a regression | suite 3308/2 (+ flaky pane-cleanup) |
| v0.41.0 · v0.40.0 · v0.39.0 · v0.38.0 | **shipped** 2026-10-18 | 0.39 real-CLI PASS (codex reads skills) · 0.38 real-CLI ① PASS | `MEMORY-WRITE-SMOKE-0380.md` |
| v0.32–0.37 | **shipped** `9567f87`·`0a20173`·`dbab890`·`5fa8167`·`acd53a0`·`d6f7cc2` | steps 2–4.2a · 0.34 live (macOS) / 0.36 real-CLI PASS 2026-10-17 | `docs/PLAN.md` |
| P3 soft close | **closed** | freeze new surfaces | `PHASE3-SOFT-CLOSE.md` |
| 3.0–3.2 soft live | **opt-in** | JIT | consts true · RESULT |
| 3.3–3.4b live | **false** | blocked | consts false · RESULT |
| `smoke:uc` · B-4 pin | **OK** | prior | check:mem-header |
| B-7 upstream | deferred optional | ecosystem | PRIORITIES P2c |

## Owner pending

| Decision | Why | Safe default | Evidence |
|---|---|---|---|
| stage 5 | 0.41 → 0.42 → 0.43 per owner "단계별로 모두 진행해" · 0.43 needs owner real-CLI yes | proceed | `UPGRADE-PLAN.md` |
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
- 0.37.0 real-CLI ① (PASS 2026-10-17) · 0.38.0 real-CLI ① (PASS 2026-10-18) · 0.39.0 real-CLI (PASS 2026-10-18).  
- 0.36.0 real-CLI smoke (PASS 2026-10-17).  
- 0.34.0 live launchd smoke (PASS 2026-10-17, macOS).
