# Loom v0.38.0 P5 smoke: memory write path end to end (card candidates → `proposed` · `notes.md` · `LOOM_CARD` refusal)

Date 2026-10-18. Repo main `f79d1cf` (P5 — smoke script + `smoke:memory-write`) and `67a3745` (VERSION · `BRIDGE_VERSION` · MCP `serverInfo` 0.38.0 + dist rebuild). Authority: PLAN §0.38.0 ⑦ P5 row + Done when (j) (D18 · R56-M4 ship condition) · `UNKNOWNS.md` 0.38.0 UK-1 · UK-2. Reproducible harness: `bun run smoke:memory-write` (= `scripts/smoke-memory-write.ts`; `--source` runs `packages/cli/src/index.ts` instead of `dist/loom.js` for the CLI children; `--real-cli --owner-approved` runs ① only against the real CLIs).

| Item | Value |
|---|---|
| OS | macOS (Darwin 25.6.0) |
| Runs | **fake-CLI 10/10 PASS** (①–⑧ + two teardown steps) |
| Worker | `HeadlessDispatcher` from source in the inner process (profile `smoke`), started from the bridge config path |
| Agents | **fake** claude · codex · grok (`/bin/sh` scripts printing `LOOM-MEMORY-CANDIDATES` blocks) |
| Real CLI run | **not run — owner approval pending** (ship-blocking — R56-M4 · UK-1) |

## Setup (R53-M2 · R54-M2 · R54-M3 — as 0.37 `POLICY-HONESTY-SMOKE-0370.md`)

- **The smoke process reads the real environment only** and imports no host module. It writes nothing under the real home.
- **One temp home T** = `mkdtemp($TMPDIR/loom-smoke-memory-write-XXXXXX)`, removed at exit.
- **Every child** — the CLI (`bun dist/loom.js memory list|approve|add …`) and the inner process (`bun scripts/smoke-memory-write.ts --inner …`) — gets `LOOM_TEST_HOME=T`, **`LOOM_PROFILE=smoke`**, and no other `LOOM_*` · `FABLE_*` · `XDG_*` variable — except step ⑦, which adds `LOOM_CARD` on purpose to one CLI child.
- **Guard per mode (R54-M3):** default — `HOME === LOOM_TEST_HOME`, under `os.tmpdir()`, not the real home; `--real-cli` — `LOOM_TEST_HOME` under `os.tmpdir()`, `HOME` = the real home (CLI auth). The inner process re-checks the same rule on its own env and on `loomDir()`.
- **One bridge config per step** — `T/.loom/bridge/smoke.json`, read by the inner `loadBridgeConfig` and the CLI `memory list` head. Top-level `agentArgv` for all three agents; default mode adds `worker.agentBin` = the fake scripts. `cardWrites` on unless noted.
- **Real home before/after** (`os.userInfo().homedir`): `~/.loom` and `~/.fable` **strict** (names + `lstat` mtime, depth 6) · `~/Library/LaunchAgents` **strict** (depth 1) · `~/.claude` · `~/.codex` · `~/.grok` **new top-level names only**.

## Results — fake CLIs (10/10, 2026-10-18)

| Step | Proves | Result |
|---|---|---|
| ① | one fake codex / grok / claude card each prints a two-candidate block | **PASS** — stderr `memory_propose … proposed 2` per agent · `loom memory list --agent <a>` shows both card rows with the `[card by …]` suffix · head `memory: 2 card proposals awaiting review` (K 2) · the card skills copy carries the forced `loom-memory-candidates` · delivered result text unchanged (block left in) |
| ② | exited-recovery reprocess of the same cards — record key kept → fast path; key removed → store scan | **PASS** — fast path `dup 2` ×3 · store scan `dup 2` ×3 · `entries.jsonl` bytes unchanged |
| ③ | six candidates | **PASS** — `proposed 5` · `cap 1` |
| ④ | a shape secret · an env secret · a marker candidate · one clean | **PASS** — `secret 2` · `marker 1` · clean one `proposed 1` · neither secret in `entries.jsonl`, stderr or `notes.md` |
| ⑤ | the ① cards' `notes.md` | **PASS** — exists · mode 0600 · = the report with the secret → `[REDACTED]` |
| ⑥ | `loom memory approve` a ① card proposal | **PASS** — `activated:` line (full body) · the next card in that room carries the body in its first-turn fence |
| ⑦ | D16' — `LOOM_CARD` set + `loom memory add` | **PASS** — exit 1 · refusal line · store unchanged |
| ⑧ | cardWrites off (memory + skills on — the 0.37 config) | **PASS** — card directory file set = 0.37 set (no `notes.md`) · no `memory_propose` line · no record key |
| teardown | zero persistence | **PASS** — temp home removed |
| teardown | real home untouched | **PASS** — `~/.loom` · `~/.fable` 1575 entries · `~/Library/LaunchAgents` 11 entries names + mtime identical · no new names in `~/.claude` · `~/.codex` · `~/.grok` |

## Real-CLI ① (`--real-cli --owner-approved`) — **not run — owner approval pending**

- **Ship condition (Done when (j) · D18 · R56-M4):** one card each for the real claude · codex · grok, cardWrites on, a prompt asking for exactly one candidate, inner process with the real HOME + `LOOM_TEST_HOME=T`. PASS = the three CLIs return a result with no refusal or derailment · each card's stderr `memory_propose` line and proposed count are recorded here · **all three cards have `notes.md` · at least one card has `proposed ≥ 1`**. All three at 0 blocks ship (revise the SKILL.md wording → re-run with owner approval); a per-agent 0 is recorded as a UK-2 observation.
- **Status:** not run. No real CLI has received the `loom-memory-candidates` SKILL.md yet (UK-1 open). 0.38.0 must not ship until this section records a PASS.

## Commands used

```
bun run smoke:memory-write
```

Not yet run: `bun run smoke:memory-write --real-cli --owner-approved` (needs the owner's explicit yes).

## Not covered

- Real CLIs — whether they write the block, follow the grammar, and place it before `LOOM-REPORT-END` (UK-1 · UK-2).
- Real-use `busy` frequency and approval load (UK-3 · UK-4). Lock contention with a human CLI is proved by P1 `memory-lock-contention.test.ts`, not by this smoke.
- Windows (UK-6). Linux not run.
