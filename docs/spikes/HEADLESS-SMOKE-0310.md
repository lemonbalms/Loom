# Loom v0.31.0 Done-when (h)(i) live smoke: skills + policy, real CLIs

Date 2026-10-15, repo main `c2b454a` (P4 verify fixes). Reproducible harness: `scripts/smoke-headless.ts 0310 <case>` with case = `h-claude | h-codex | h-grok | i-claude-deny | i-codex-net-off | i-codex-net-on` (the 0.30.0 form `smoke-headless.ts <claude|codex|grok> [reanalyze]` is unchanged). Base dir `SMOKE_BASE` (default `$TMPDIR/loom-smoke0310`); each run removes and recreates `<base>/<case>/`.

Setup per case:
- **Real `HeadlessDispatcher`** with the worker config built by the real bridge path: `workerConfigFromBridge({worker:{backend:"headless", cwd, allowedRoots:[cwd], timeoutMs: 14 min, skills:{enabled:true}}})`. That call loads `loomDir()/policy.json` and merges it over the built-in policy (D7/D8). Default permission profiles, localPeerId `smoke-peer`, capturing sink.
- **Isolated loomDir:** `LOOM_TEST_HOME=<case>/home`, so `loomDir()` = `<case>/home/.loom` (asserted at start). The real `~/.loom` was not touched (no file under it modified during the window). The CLIs keep the real `HOME`, so they use their normal auth. The worker env scrub drops `LOOM_*` before spawn.
- Scratch `policy.json` (v1) and the room `skills.json` = `{"version":1,"skills":["loom-card-report"]}` under `loomDir/rooms/<roomKey>/`. Built-in skill `loom-card-report` (source `builtin`).
- cwd = a fresh git repo (`README.md`, `hello.ts`, one commit).
- **argv capture:** `commands.<agent>.bin` = an exec shim in `<case>/bin/` that writes argv (NUL-separated) to `<case>/argv.nul` and then `exec`s the real CLI (same pid). The prompt goes over stdin (grok: `--prompt-file`), so it is not in argv.
- Each run was wrapped in `perl -e 'alarm 900; exec @ARGV'` (15 min). Raw transcripts stay in the scratch dir (`<case>/home/.loom/cards/<peer>/<card>/transcript-1.jsonl`). Per case `result.json`, `output.txt`, `argv.nul`.

Network is available in this environment (`curl -sI https://example.com` from the host → `HTTP/2 200`).

## (h) skills: `loom-card-report` used

Card prompt (same for all three): *"Write a 3-line report about what this repository contains (look at its files), and finish per your report skill."* The prompt does not name `LOOM-REPORT-END`, so the marker in the output can only come from the skill text. Policy: `{version:1, shell:{deny:[]}, network:false, mcp:{deny:[]}, skills:{allowScripts:[]}}` (skills.allow absent = all).

| Item | h1 claude | h2 codex | grok (optional) |
|---|---|---|---|
| CLI version | 2.1.300 (Claude Code) | codex-cli 0.162.1 | grok 1.0.54 (4e18c5517b4e) [alpha] |
| Wall time (dispatch) | 10.7 s | 28.2 s | 32.6 s |
| Verdict | **PASS** | **PASS** | **PASS** |
| Result status / reason | failed / needs_verification (by-design unverified shape, as in 0.30.0) | same | same |
| attempts / record state | 1 / exited | 1 / exited | 1 / exited |
| Card copy | `skills/manifest.json` = 1 entry `loom-card-report`, source `builtin`, `SKILL.md` sha256 `928b6819…`, scripts [] | same | same |
| Skill delivery | argv `--plugin-dir <card>/skills/plugin` (exactly one) · `--add-dir` absent | prompt listing (no `--plugin-dir`) | prompt listing (no `--plugin-dir`) |
| Skill loaded / read | init event `plugins[0]` = `{name:"loom-card", source:"loom-card@inline", path:<card>/skills/plugin}` · init `skills` contains `loom-card:loom-card-report` · the model called the `Skill` tool with `loom-card:loom-card-report` ("Launching skill: …") | `command_execution` `cat <abs card path>/skills/plugin/skills/loom-card-report/SKILL.md`, exit 0 (first item of the run) | `read_file` `target_file` = the same absolute SKILL.md path (first tool call) |
| `LOOM-REPORT-END` in output | yes, last line | yes, last line | yes, last line |
| Output shape | Status / Summary / Changes / Checks / Open, then marker | same | same, after one preface sentence |
| MCP | argv `--strict-mcp-config` present · init `mcp_servers` = **[]** (0 servers) | n/a (not isolatable, D10) | n/a (not isolatable, D10) |
| Policy argv | one `--settings` (inline JSON, parsed OK: allow = base 5 + 11 builtin shell rules; deny = `Bash(p)`+`Bash(p *)` pairs for curl/git clean/git push/git reset --hard/rm/rmdir/sudo/wget + WebFetch/WebSearch) · no `--allowedTools`/`--disallowedTools` | `--sandbox workspace-write` · `-c sandbox_workspace_write.network_access=false` · `-c approval_policy=never` | one `--allow`/`--deny` per rule (same pairs) · `--disable-web-search` |
| Denials | none | none | none |
| Transcript | 29,853 B | 4,576 B | 66,082 B |

## (i) policy

| Item | i1 claude deny | i2 codex network=false | i2 codex network=true |
|---|---|---|---|
| CLI version | 2.1.300 | codex-cli 0.162.1 | codex-cli 0.162.1 |
| Wall time (dispatch) | 7.1 s | 13.3 s | 13.6 s |
| Verdict | **PASS** | **PASS** | **PASS** |
| Policy | `shell.deny: ["echo *"]`, network false | `network: false` | `network: true` |
| Compiled argv | `--settings` deny contains `Bash(echo)` and `Bash(echo *)` (R49-H1 pair) · `--strict-mcp-config` | `-c sandbox_workspace_write.network_access=false` | `-c sandbox_workspace_write.network_access=true` |
| Prompt | run `echo hi` once with Bash; no retry or workaround | run `curl -sI https://example.com` once; no retry/escalation | same |
| Command observed | Bash tool_use `echo hi` → tool_result `is_error: true`, *"Permission to use Bash with command echo hi has been denied."* | `/bin/zsh -lc 'curl -sI https://example.com'` → exit **6** (could not resolve host), status failed, empty output | same command → exit **0**, first line `HTTP/2 200` |
| Did not run / ran | not run: no `hi` in any tool_result in the transcript; the denial is the only tool_result | blocked by the sandbox | network reached |
| `permission_denials` (result event) | 1: `{tool_name:"Bash", tool_input:{command:"echo hi"}}` | none (codex has no denial channel for a sandboxed network failure) | none |
| Result note | **`denials: 1 (Bash)`** | none | none |
| Final message | reports the denial verbatim, no workaround tried | "Exit code: 6 / First output line: none" | "Exit code: `0` / First output line: `HTTP/2 200`" |

## No-write property (all six runs)

| Check | Result |
|---|---|
| `<cwd>/.claude`, `.agents`, `.codex`, `.grok` | **none** in any of the six repos; cwd entries = `README.md`, `hello.ts`, `.git` only |
| `git status --porcelain --ignored` in cwd | empty in all six |
| Scratch home (`LOOM_TEST_HOME`) | only `.loom` |
| Real `~/.loom` | no file modified during the run window |

What the real CLIs wrote themselves (outside Loom, out of scope for (f)):
- claude: its own session transcripts under `~/.claude/projects/<slug of the scratch repo>/` (2 project dirs).
- grok: `~/.grok/sessions/<url-encoded scratch repo>/<session id>/` plus its caches (`models_cache.json`, `settings_cache.json`, `memtrace/…`).
- **codex: wrote a trust entry per cwd into `~/.codex/config.toml`** — three new tables `[projects."<scratch>/smoke0310/{h-codex,i-codex-net-off,i-codex-net-on}/repo"]` with `trust_level = "trusted"` (see finding 2). Plus its usual logs/caches.

## Findings

1. **No Loom bug found.** All required cases (h1, h2, i1, i2 both directions) and optional grok (h) passed on the first run against `c2b454a`. One harness-only fix during setup: the first attempt failed with a TDZ `ReferenceError` in the script itself (module-level consts used by the `0310` entry at the top of the file); the case table became a function. No CLI was spawned in that attempt.
2. **codex auto-trusts each headless cwd in the owner's `~/.codex/config.toml` (security-relevant, not a Loom code bug).** After the three codex runs, `~/.codex/config.toml` gained `[projects."<cwd>"] trust_level = "trusted"` for every scratch repo. Loom's argv has no trust flag (`exec --json -C <cwd> --sandbox workspace-write -c … --skip-git-repo-check`), so codex 0.162.1 writes this itself. Consequence: every repo a headless codex card has run in becomes a trusted project for the owner's codex, so a later `<repo>/.codex/config.toml` (project MCP, hooks) would be honoured. This is the trust-gate opening that D5 avoids for grok (`SPROBE` §A.4), happening on the codex side by default. It also means the run did not leave `~/.codex` fully untouched. **I did not remove the three entries** (lines 138–146 of `~/.codex/config.toml`); deciding whether to clean them up, and whether to document this in the D10 honesty table / USER_GUIDE §15, is for the owner. Not checked: whether 0.30.0 runs left the same entries, and whether a codex config key turns this off.
3. claude still inherits the owner's user-level plugins and skills: init `plugins` lists 20 entries (loom-card first, then 19 owner plugins such as fable-advisor, codex, github), and init `skills` has 142 entries. This is the accepted residual UK-6 (PLAN 0.31.0, "오너 전역 스킬 상속은 남는다"). MCP isolation does work (`mcp_servers: []`).
4. The claude denial note names the tool only (`denials: 1 (Bash)`). The command `echo hi` appears in the transcript's `permission_denials` (which is what Done-when (i) checks), not in the note. This is by design in `denialNote()`; noted in case the note should carry the command.
5. codex had no denial false positive this time: the `rg` exit 1 in h2 and the `curl` exit 6 in i2 were not reported as denials (the 0.30.0 finding 2 fix holds).
6. grok was fast this time (32.6 s, against ~9 min in 0.30.0) because the card was small. It read SKILL.md from the card copy by absolute path in an untrusted cwd, with no `--trust` and no `GROK_FOLDER_TRUST`, which matches D5.

## Safety

No bypass or dangerous flags (claude acceptEdits + `--settings`, codex workspace-write + approval never, grok acceptEdits + per-rule `--allow`/`--deny`). cwd was a fresh scratch repo per case. Loom state was confined to `LOOM_TEST_HOME`. No secrets printed (argv holds only policy JSON and the fixed worker hint). Nothing committed. Repo files changed: `scripts/smoke-headless.ts` (adds the `0310` mode) and this doc.
