# Loom v0.37.0 P5 smoke: policy honesty end to end (doctor Policy section · fence policy notice · rules · agent_disabled)

Date 2026-10-17. Repo main `f4c7073` (P5a — smoke script + `smoke:policy`) and `9a402e4` (P5b — VERSION · `BRIDGE_VERSION` · MCP `serverInfo` 0.37.0 + dist rebuild). Authority: PLAN §0.37.0 ⑦ P5 row + Done when (j) (R55-M2 ship condition · R55-L2 inner-child formula — superseded, see rulings) · `UNKNOWNS.md` 0.37.0 UK-1 · UK-2 · UK-4 · UK-5. Reproducible harness: `bun run smoke:policy` (= `scripts/smoke-policy-honesty.ts`; `--source` runs `packages/cli/src/index.ts` instead of `dist/loom.js` for the CLI children; `--real-cli --owner-approved` runs ⓪ + ① against the real CLIs).

| Item | Value |
|---|---|
| OS | macOS (Darwin 25.6.0) |
| CLI (dist) | rebuilt 0.37.0 `dist/loom.js` (`bun run build:cli` twice → same sha256 `9666ad64f36dbe0443bacc7d10dcf081797463c5733235ecbdda2bf920bf930e` · `check:dist` ok · `bun dist/loom.js --version` → `loom v0.37.0`) |
| Runs | **source CLI 10/10 PASS** · **dist CLI 10/10 PASS** · **real-cli (dist CLI) 4/4 PASS** |
| Worker | `HeadlessDispatcher` from source in the inner process (profile `smoke`), fed the bridge-start `Gap[]` |
| Agents | default mode: **fake** claude · codex · grok (`/bin/sh` scripts) · real-cli mode: the real `claude` · `codex` · `grok` on `PATH` |
| Real CLI run | **one run, owner-approved** (owner yes recorded in `f22a3f3` HANDOFF) — ⓪ + ① only |

## Setup (R53-M2 · R54-M2 · R54-M3 — as 0.36 `MEMORY-INJECT-SMOKE-0360.md`)

- **The smoke process reads the real environment only** and imports no host module. It writes nothing under the real home.
- **One temp home T** = `mkdtemp($TMPDIR/loom-smoke-policy-honesty-XXXXXX)`, removed at exit; `PASS zero persistence` is printed only after checking T is gone.
- **Every child** — the CLI (`bun dist/loom.js doctor …`) and the inner process (`bun scripts/smoke-policy-honesty.ts --inner <step> …`) — gets `LOOM_TEST_HOME=T`, **`LOOM_PROFILE=smoke`**, and no other `LOOM_*` · `FABLE_*` · `XDG_*` variable. One spawn site builds the env and guards that exact object first.
- **Guard per mode (R54-M3):** default — `HOME === LOOM_TEST_HOME`, under `os.tmpdir()`, not the real home; `--real-cli` — `LOOM_TEST_HOME` under `os.tmpdir()`, `HOME` = the real home (CLI auth). The inner process re-checks the same rule on its own env and on `loomDir()`.
- **One bridge config per step** — `T/.loom/bridge/smoke.json`, read by both the CLI `doctor` and the inner `loadBridgeConfig`. It names top-level **`agentArgv` for all three agents** (non-shell argv, so all three are dispatchable — ruling 2); default mode adds `worker.agentBin` = the fake scripts.
- **Gaps are computed the way bridge start computes them** — `policyGaps(effectiveWorkerPolicy(config).effective, enabledHeadlessAgents(config.maxConcurrent, cfg.agentArgv))` (ruling 1).
- **Real home before/after** (`os.userInfo().homedir`): `~/.loom` and `~/.fable` **strict** (names + `lstat` mtime, depth 6 — 1575 entries here) · `~/Library/LaunchAgents` **strict** (depth 1 — 11 entries) · `~/.claude` · `~/.codex` · `~/.grok` **new top-level names only**.

## What each step proves

- ⓪ `doctor` Policy section on the default policy (no `policy.json`) with all three agents dispatchable = the **six** default gap `warn` rows (claude `network` · codex `shell.deny` + `mcp.isolate` · grok `shell.deny` + `network` + `mcp.isolate`), **0 `fail` rows in the Policy section**, and the doctor exit code equals an empty-home baseline run (ruling 3) · the codex `gapLabel`s are recorded for the D1 cross in ①.
- ① **upgrade stage-4 completion criterion (c)④:** one card each for codex · grok · claude → each fence carries `## Loom policy notice` + `POLICY_NOTICE_LEAD` + **only that agent's** gap lines (claude 1 · codex 2 · grok 3); the codex line says `not-enforced` and carries all 11 deny strings; **D1 cross** — the doctor codex `gapLabel`s equal the codex notice `gapLabel`s.
- ② `worker.rules.enabled` + a scope `codex` user rule → the codex card carries `report-blockers` and `smoke-codex-rule` under `## Standing rules`; the claude card the built-in only; the notice comes before the rules.
- ③ `worker.maxConcurrent.grok: 0` → the grok card result is `failed`/`agent_disabled`, the fake grok never ran (no stdin dump), and the **real doctor row text** is `grok: disabled (worker.maxConcurrent.grok = 0) — not checked` with 3 gap `warn` rows (ruling 5).
- ④ a gap-free `policy.json` for claude + memory and rules off → the **claude-only** card's first turn is exactly marker + `\n\n` + prompt, no `memory-snapshot.md`, no `memorySnapshotHash` key; codex/grok still have their 2 inner gaps (ruling 6).
- ⑤ a planted `T/.loom/AGENT_HINT.txt` → doctor info line `AGENT_HINT.txt is unused since 0.37 — safe to delete: <path>` · the file's bytes and mtime unchanged.
- ⑥ D9: an unreadable persona (empty text) → stderr `[headless] memory_snapshot (<card>): empty — no block · read_errors 1 · load_ms 1`.
- ⑦ the UK-4 · UK-5 numbers below.
- teardown: temp home removed · real home untouched (two steps — ruling 7).

## Results — source CLI (10/10)

```
PASS ⓪ doctor Policy section = six default warn lines · 0 fail · exit = baseline — 13 rows · 6 warn · 0 fail · exit 0 (baseline 0) · codex labels ["shell.deny (11 rules) is not-enforced for codex","mcp.isolate (true) is not-isolatable for codex"]
PASS ① completion criterion (c)④ — per-agent notice · codex not-enforced + 11 deny strings · D1 cross — claude 1 gap line(s) · codex 2 gap line(s) · grok 3 gap line(s) · codex 11/11 deny strings · D1 codex labels == doctor
PASS ② worker.rules.enabled — codex: scope codex rule + built-in · claude: built-in only — codex ["report-blockers","smoke-codex-rule"] · claude ["report-blockers"] · notice → rules order
PASS ③ maxConcurrent.grok = 0 → agent_disabled · fake grok never ran · doctor grok disabled — grok failed/agent_disabled · no dump · doctor "grok: disabled (worker.maxConcurrent.grok = 0) — not checked" · 3 warn
PASS ④ gap-free policy for claude + memory/rules off → claude first turn M\n\nP · no file — claude first turn == marker + "\n\n" + prompt · no file · no record key · inner gaps 2 (codex/grok only)
PASS ⑤ planted AGENT_HINT.txt → doctor info line · bytes and mtime unchanged — "info AGENT_HINT.txt is unused since 0.37 — safe to delete: <T>/.loom/AGENT_HINT.txt" · bytes + mtime unchanged
PASS ⑥ D9 unreadable persona (empty text) → stderr read_errors 1 — "[headless] memory_snapshot (<card>): empty — no block · read_errors 1 · load_ms 1"
PASS ⑦ UK-4 · UK-5 measurement (notice + rules ≈16 KiB + near-cap memory × 3 CLIs × 5) — rules 2 × ≈7600 B scope all + built-in · persona 8000 B · INDEX 8000 B · guideline 16000 B · entries.jsonl 4126862 B (1988 active project records) per agent · claude block 63577 B · turn 63766 B · notice 1 · rules 3/3 · load_ms median 20 max 26 · codex block 63846 B · turn 64035 B · notice 2 · rules 3/3 · load_ms median 19 max 19 · grok block 63978 B · turn 64167 B · notice 3 · rules 3/3 · load_ms median 18 max 19
PASS zero persistence — temp home removed — removed
PASS real home untouched — ~/.loom · ~/.fable 1575 entries · ~/Library/LaunchAgents 11 entries names+mtime identical · ~/.claude · ~/.codex · ~/.grok no new names
PASS smoke:policy (default · source CLI) — 10/10 steps
```

## Results — 0.37.0 dist (10/10)

```
PASS ⓪ doctor Policy section = six default warn lines · 0 fail · exit = baseline — 13 rows · 6 warn · 0 fail · exit 0 (baseline 0) · codex labels ["shell.deny (11 rules) is not-enforced for codex","mcp.isolate (true) is not-isolatable for codex"]
PASS ① completion criterion (c)④ — per-agent notice · codex not-enforced + 11 deny strings · D1 cross — claude 1 gap line(s) · codex 2 gap line(s) · grok 3 gap line(s) · codex 11/11 deny strings · D1 codex labels == doctor
PASS ② worker.rules.enabled — codex: scope codex rule + built-in · claude: built-in only — codex ["report-blockers","smoke-codex-rule"] · claude ["report-blockers"] · notice → rules order
PASS ③ maxConcurrent.grok = 0 → agent_disabled · fake grok never ran · doctor grok disabled — grok failed/agent_disabled · no dump · doctor "grok: disabled (worker.maxConcurrent.grok = 0) — not checked" · 3 warn
PASS ④ gap-free policy for claude + memory/rules off → claude first turn M\n\nP · no file — claude first turn == marker + "\n\n" + prompt · no file · no record key · inner gaps 2 (codex/grok only)
PASS ⑤ planted AGENT_HINT.txt → doctor info line · bytes and mtime unchanged — "info AGENT_HINT.txt is unused since 0.37 — safe to delete: <T>/.loom/AGENT_HINT.txt" · bytes + mtime unchanged
PASS ⑥ D9 unreadable persona (empty text) → stderr read_errors 1 — "[headless] memory_snapshot (<card>): empty — no block · read_errors 1 · load_ms 1"
PASS ⑦ UK-4 · UK-5 measurement (notice + rules ≈16 KiB + near-cap memory × 3 CLIs × 5) — rules 2 × ≈7600 B scope all + built-in · persona 8000 B · INDEX 8000 B · guideline 16000 B · entries.jsonl 4126862 B (1988 active project records) per agent · claude block 63577 B · turn 63766 B · notice 1 · rules 3/3 · load_ms median 19 max 26 · codex block 63846 B · turn 64035 B · notice 2 · rules 3/3 · load_ms median 19 max 20 · grok block 63978 B · turn 64167 B · notice 3 · rules 3/3 · load_ms median 19 max 19
PASS zero persistence — temp home removed — removed
PASS real home untouched — ~/.loom · ~/.fable 1575 entries · ~/Library/LaunchAgents 11 entries names+mtime identical · ~/.claude · ~/.codex · ~/.grok no new names
PASS smoke:policy (default · dist CLI) — 10/10 steps
```

### Measurements, dist run (UK-4 · UK-5 — fake CLIs, 5 cards per CLI)

Input per agent: policy notice (default policy — claude 1 · codex 2 · grok 3 lines) + rules (2 scope `all` user rules × ≈7600 B + the built-in `report-blockers`, near the 16384 B section cap — all 3 included) + memory near every cap (persona 8000 B · INDEX 8000 B · guideline 16000 B · `entries.jsonl` 4126862 B, 1988 active project records).

| CLI | notice lines | rules | block bytes | first-turn bytes | load_ms median | load_ms max |
|---|---|---|---|---|---|---|
| claude | 1 | 3/3 | 63577 | 63766 | 19 | 26 |
| codex | 2 | 3/3 | 63846 | 64035 | 19 | 20 |
| grok | 3 | 3/3 | 63978 | 64167 | 19 | 19 |

(Source run: same bytes · `load_ms` median 20 / 19 / 18 · max 26 / 19 / 19.)

- **UK-4 (size):** with notice + rules near their cap + memory near every cap, the fence is 63577–63978 B and the whole first turn (marker + fence + prompt, skills off) 63766–64167 B — ≈16 KiB over the 0.36 memory-only maximum (47874 B block). The fake CLIs received every byte. Real-CLI acceptance of a ≈64 KiB first turn is **not measured** — the real-CLI run was ① only (default policy · memory and rules off · notice-only fence).
- **UK-5 (stall):** `load_ms` (memory read 4 MiB + `loadRules` + compose + redaction + render + 0600 atomic write, under the card lock) median 18–20 ms, max 19–26 ms over 15 first spawns per run (two runs) — the 0.36 memory-only figure was median 16–17 / max 24–25 ms. the whole-path median is ~2 ms above 0.36 (observation of total `load_ms`, not a `loadRules`-only measurement — no same-condition control); no case for a 0.38 mtime cache / async reader from this data alone.

## Results — real CLI (`--real-cli --owner-approved`, dist CLI, 4/4)

```
PASS ⓪ doctor Policy section = six default warn lines · 0 fail · exit = baseline — 13 rows · 6 warn · 0 fail · exit 0 (baseline 0) · codex labels ["shell.deny (11 rules) is not-enforced for codex","mcp.isolate (true) is not-isolatable for codex"]
PASS ① completion criterion (c)④ — per-agent notice · codex not-enforced + 11 deny strings · D1 cross — claude 1 gap line(s) · codex 2 gap line(s) · grok 3 gap line(s) · codex 11/11 deny strings · D1 codex labels == doctor
PASS zero persistence — temp home removed — removed
PASS real home untouched — ~/.loom · ~/.fable 1575 entries · ~/Library/LaunchAgents 11 entries names+mtime identical · ~/.claude · ~/.codex · ~/.grok no new names
Real CLI replies (verbatim — observation only, UK-2):
reply claude: "ok"
reply codex: "ok"
reply grok: "ok"
PASS smoke:policy (real-cli · dist CLI) — 4/4 steps
```

- **R55-M2 ship condition (Done when (j)) — met:** one card each for the real claude · codex · grok, prompt `Reply with the single word ok.`, default policy, memory and rules off, inner process with the real HOME + `LOOM_TEST_HOME=T`. All three CLIs took a first turn carrying the default-on policy notice fence and replied; no refusal, no derailment. **UK-1 (real-CLI acceptance of the notice fence) is answered for this shape.**
- **The replies are observation only (UK-2).** `"ok"` × 3 shows the prompt was followed with the notice in front of it; it does not show whether a worker obeys "Do not run commands that match …" when a task would need one of them.
- Real home: `~/.claude` · `~/.codex` · `~/.grok` got no new top-level names (CLI internals below the top level are not compared — the CLIs ran with the real HOME by design).

## Architect rulings recorded with this smoke

1. **Gaps = `enabledHeadlessAgents(config.maxConcurrent, cfg.agentArgv)`.** P4c (P3-V-L3 amendment: enabled = `maxConcurrent ≠ 0` ∧ a usable `agentArgv` entry) **supersedes the R55-L2 literal formula** `enabledAgentsOf(config.maxConcurrent)` — the smoke uses what bridge start uses.
2. **The bridge config names `agentArgv` for all three agents.** Without it the default `agentArgv {claude}` makes codex/grok undispatchable, hence not enabled, hence gap-free (P4c dev 57) — the (c)④ codex notice could not be shown.
3. **⓪ "fail 0"** = no `fail` row in the Policy section **and** doctor exit code = an empty-home baseline run (other sections may differ on a temp home; they are not this smoke's subject).
4. **`--real-cli` runs ⓪ + ① only** (R55-M2 scope) — ②–⑦ need fake CLIs (stdin dumps, planted files, timings).
5. **③ asserts the real doctor row text** (`grok: disabled (worker.maxConcurrent.grok = 0) — not checked`), not a substring.
6. **④ is claude-only** — the gap-free `policy.json` removes claude's only default gap (`network: true`); codex/grok `shell.deny` gaps cannot be removed by policy (R55-M1, class 20).
7. **10 steps** = ⓪–⑦ + two teardown steps (zero persistence · real home untouched); the real-cli run = ⓪ + ① + the same two.

## Commands used

```
bun run smoke:policy --source
bun run smoke:policy
bun run smoke:policy --real-cli --owner-approved
```

## Not covered

- Strict refusal and bridge start warnings need a session + relay — proved by P3 `bridge-policy-honesty.test.ts`, not by this smoke.
- Real CLIs with rules on / memory on / a ≈64 KiB first turn (the real run was ① only). Notice obedience (UK-2) and rules obedience (UK-3) — not measurable here.
- Windows (UK-7). Linux not run.
