# Loom v0.36.0 P5 smoke: first-spawn memory snapshot + fence injection, end to end

Date 2026-10-16. Repo main `feeb9e7` (P4 green, verified) plus the smoke script (this commit). Authority: PLAN §0.36.0 ⑦ P5 row + Done-when (c)(g) (R53-M2 pattern, R54-M2 `LOOM_PROFILE=smoke`, R54-M3 per-mode guard), `UNKNOWNS.md` 0.36.0 UK-1 · UK-2 · UK-6. Reproducible harness: `bun run smoke:memory-inject` (= `scripts/smoke-memory-inject.ts`; `--source` runs `packages/cli/src/index.ts` instead of `dist/loom.js` for the CLI children). Wall time ~3.5 s.

| Item | Value |
|---|---|
| OS | macOS (Darwin 25.6.0, arm64) |
| bun | 1.3.11 |
| CLI (this run) | committed `dist/loom.js` (0.35.0 build — `memory propose/approve/list` are 0.35 verbs, so the 0.35 dist is enough) — **7/7 PASS** |
| Worker | `HeadlessDispatcher` from source in the inner process (profile `smoke`, memory from the bridge config) |
| Agents | **fake** claude · codex · grok (`/bin/sh` scripts) only |
| Real CLI run | **none** — `--real-cli` exists but needs `--owner-approved` and an explicit owner yes; not run |

## Setup (R53-M2 · R54-M2 · R54-M3)

- **The smoke process reads the real environment only** and imports no host module. It writes nothing under the real home.
- **One temp home T** = `mkdtemp($TMPDIR/loom-smoke-memory-inject-XXXXXX)`, removed at exit, on failure and on SIGINT/SIGTERM; `PASS zero persistence` is printed only after checking T is gone.
- **Every child** — the dist CLI (`bun dist/loom.js memory …`) and the inner process (`bun scripts/smoke-memory-inject.ts --inner <step> …`) — gets `HOME=T`, `LOOM_TEST_HOME=T`, **`LOOM_PROFILE=smoke`** (R54-M2), cwd T, and no other `LOOM_*` · `FABLE_*` · `XDG_*` variable (so no `LOOM_RELAY_TOKEN` · `LOOM_RELAY_URL` · `LOOM_SESSION`). One spawn site builds the env and guards that exact object first.
- **Guard per mode (R54-M3):** default — `HOME === LOOM_TEST_HOME`, under `os.tmpdir()`, not the real home; `--real-cli` — `LOOM_TEST_HOME` under `os.tmpdir()`, `HOME` = the real home. Both: `LOOM_PROFILE=smoke` and no other `LOOM_*`/`FABLE_*`/`XDG_*`. Otherwise T is removed and the smoke exits 1. **The inner process re-checks the same rule on its own env and checks `loomDir()` lies under `LOOM_TEST_HOME`** before it builds anything (bun's `os.userInfo().homedir` follows `$HOME`, so the outer passes its real home to the inner on argv for this check).
- **The inner process takes the bridge's own path:** it writes `T/.loom/bridge/smoke.json` (`worker.backend headless` · `agentBin` = the fake scripts named `claude`/`codex`/`grok` · `worker.memory {enabled:true}` or no `memory` key for ②), then `loadBridgeConfig(resolveBridgeProfile())` → `workerConfigFromBridge` → `headlessAgentCommands` → `memory = cfg.worker?.memory?.enabled === true ? {enabled:true} : undefined` (the `bridge-runtime.ts` expression) → `new HeadlessDispatcher({…, profile, memory})`. No relay, no herdr (the R16 unit test covers the in-process bridge).
- **Fake CLIs** dump stdin to `stdin-$LOOM_CARD`, copy grok's `--prompt-file`, and print one finished stream (claude `result` · codex `item.completed`+`turn.completed` · grok `text`+`end`). The card result counts as finished when its output is `done` (status `failed` · reason `needs_verification` is the normal parsed-headless shape — deviation 21).
- **Real home before/after** (`os.userInfo().homedir`): `~/.loom` and `~/.fable` **strict** (every path to depth 6 with its `lstat` mtime — 1574 entries here; `~/.fable` absent) · `~/Library/LaunchAgents` **strict** (depth 1 — 11 entries) · `~/.claude` · `~/.codex` · `~/.grok` **new top-level names only**.

## Results — committed dist (0.35.0 build), 7/7

```
PASS ⓪ memory list header (R54-M2 · UK-6) — "profile smoke (from LOOM_PROFILE)" · agentKey claude.smoke
PASS ① approved project record reaches a room_B card · room:A record does not — 6 records via CLI propose→approve · claude block 563 B nonce e40c9f4b… hash ok · codex block 562 B nonce 51aac57e… hash ok · grok block 561 B nonce ae5cfc93… hash ok · control room_A claude card carries both records
PASS ② memory-off bridge config → first turn M\n\nP — claude · codex · grok first turn == marker + "\n\n" + prompt · no file · no record key · no memory stderr line
PASS ③ forged marker line + env secret (D4 · R53-L3) — 1 placeholder · "## " kept · marker only once in the turn · secret absent · stderr "neutralized 1 · env_redacted yes"
PASS ④ UK-1 · UK-2 measurement (near-cap store × 3 CLIs × 5) — persona 8000 B cap 8192 · INDEX 8000 B cap 8192 · guideline 16000 B cap 16384 · entries.jsonl 4126862 B (1988 active project records) per agent · claude block 47874 B · turn 48063 B · load_ms median 17 max 25 · codex block 47874 B · turn 48063 B · load_ms median 17 max 19 · grok block 47874 B · turn 48063 B · load_ms median 17 max 18
PASS zero persistence — temp home removed — removed
PASS real home untouched — ~/.loom · ~/.fable 1574 entries · ~/Library/LaunchAgents 11 entries names+mtime identical · ~/.claude · ~/.codex · ~/.grok no new names
PASS smoke:memory-inject (default · dist CLI) — 7/7 steps
```

## Measurements (UK-1 · UK-2 — fake CLIs, 5 cards per CLI)

| CLI | block bytes | first-turn bytes | load_ms median | load_ms max | dispatch ms median |
|---|---|---|---|---|---|
| claude | 47874 | 48063 | 17 | 25 | 53 |
| codex | 47874 | 48063 | 17 | 19 | 53 |
| grok | 47874 | 48063 | 17 | 18 | 58 |

Dispatcher stderr line (same for every card, ids elided): `[headless] memory_snapshot (<card>): block 47874 B · text 47412 B · neutralized 0 · env_redacted no · read_errors 0 · truncated entries · load_ms 18`.

- **UK-1 (size):** with every human file just under its cap and `entries.jsonl` just under the 4 MiB read cap, the fence is 47874 B and the whole first turn (marker + fence + prompt, skills off) 48063 B. The entries section hits its 16 KiB render cap (`truncated entries`); persona · INDEX · guideline are not cut. The fake CLIs received every byte (stdin / grok prompt file == marker + `memory-snapshot.md` + prompt). **Whether the real claude / codex / grok accept this first turn without loss is not measured** (no real CLI run).
- **UK-2 (stall):** `load_ms` (read 4 MiB + fold + redaction + render + 0600 atomic write, under the card lock) median 17 ms, max 25 ms across 15 first spawns on this machine; whole dispatch to the fake result ~55 ms. Synchronous read on the bridge loop at this size is ~20 ms per first spawn — no case for the 0.37 mtime cache / async reader from this data alone.

## What each step proves

- ⓪ the dist CLI resolves `LOOM_PROFILE=smoke` in a temp home and names the source (R54-M2); `--json` gives agentKey `claude.smoke` — the store the inner dispatcher reads for profile `smoke` (UK-6, one dist-side sample).
- ① upgrade stage-4 criterion (a) / Done-when (c) on three CLIs: a project record and a `room:A` record, each written by `memory propose` → `memory approve`, then a room_B card → the project record is inside the fence, the room:A record is not; BEGIN and END carry the same 32-hex nonce; the file is exactly one fence; `sha256(memory-snapshot.md)` equals the session record's `memorySnapshotHash`; the first turn is exactly marker + `\n\n` + file + `\n\n` + prompt (grok: on the prompt file, stdin empty). Control: a room_A claude card carries both records (the absence in room_B is the room filter, not an empty read).
- ② a bridge config without `worker.memory` → the first turn is `M\n\nP` on all three CLIs, no `memory-snapshot.md`, no `memorySnapshotHash` key, no `memory_snapshot` stderr line (D5 default off).
- ③ a persona line carrying the task marker becomes the one placeholder line, a `## ` line stays byte for byte, the marker appears once in the turn (the real one), an env value of `SMOKE_SECRET_TOKEN` (inner env only) is replaced by `[REDACTED]` in the file and the turn, and the stderr line says `neutralized 1 · env_redacted yes` — the card still runs (D4 · R53-L3 · Done-when (d)(e)).
- ④ the UK-1 · UK-2 numbers above.

## `--real-cli` (implemented, not run)

`bun run smoke:memory-inject --real-cli --owner-approved` runs ⓪ and ① against the real `claude` / `codex` / `grok` on `PATH`: the inner process has `HOME` = the real home (CLI auth), `LOOM_TEST_HOME=T`, `LOOM_PROFILE=smoke`; the dist CLI children get the same env, and `loomDir()` prefers `LOOM_TEST_HOME`, so `~/.loom` is not touched. It checks the fence file / record hash and that each reply quotes the project token and not the room:A token. Without `--owner-approved` it exits 2 before creating anything (by code — the check sits before `mkdtemp`; not executed here). **Not run in 0.36.0 — it needs an explicit owner yes.** UK-1 (real-CLI acceptance of ≈48 KiB) and UK-3 (fence compliance) stay unmeasured.

## Not covered

- Real CLIs (above). Windows (UK-7). Linux not run.
- Resume / recovery / tamper → `needs_verification` (P3 unit tests — resume matrix, Done-when (b)); D8 through a real in-process bridge (P4 `bridge-memory-profile.test.ts`).
- Skills on + memory on (the P2 unit tests cover listing + fence ordering).
