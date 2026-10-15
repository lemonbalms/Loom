# Loom v0.32.0 P5 live smoke: MCP pre-check with real claude / codex / grok

Date 2026-10-16, repo main `f5c59ce` (P4 verify round 4). Authority: PLAN §0.32.0 P5 row + Done-when (i), `UNKNOWNS.md` 0.32.0 (UK-1, UK-3, UK-4). Reproducible harness: `bun run smoke:mcp-precheck <case>` (= `scripts/smoke-mcp-precheck.ts`), case = `server | claude-noperm | claude-manual | claude | claude-invalid | codex | codex-noapprove | grok`. Base dir `SMOKE_BASE` (default `$TMPDIR/loom-smoke0320`); each run removes and recreates `<base>/<case>/`. Per case: `result.json`, `transcript.jsonl`, `cli-stderr.log`, `mcp-stderr.log`.

| CLI | Version |
|---|---|
| claude | 2.1.300 (Claude Code) |
| codex | codex-cli 0.162.1 (model pinned `gpt-6.1-sol`, effort medium) |
| grok | grok 1.0.54 (4e18c5517b4e) [alpha], model grok-4.7 |
| bun | 1.3.11 |

## Setup

- **Isolated Loom state:** `LOOM_TEST_HOME=<base>/<case>/home`, so `loomDir()` = `<case>/home/.loom` (asserted at start). The real `~/.loom` was not touched: `find ~/.loom -newer <start marker>` printed nothing after all runs.
- **Board-only session:** `<case>/home/.loom/session.json` = `{roomId:"room_smoke0320", peerId:"p_smoke0320", agentKind:<cli>, relayUrl:"ws://127.0.0.1:9", …}` (nothing listens there; no token). Board tools are local. `room_chat` would need the relay, but the pre-check refuses it first.
- **Policy fixture** (`<case>/home/.loom/policy.json`, 0600). The v1 schema requires `shell`, `network`, `mcp`, `skills`, so the fixture is:
  `{"version":1,"shell":{"deny":[]},"network":false,"mcp":{"deny":["loom__room_chat"]},"skills":{"allowScripts":[]},"loomTools":{"done":"propose"}}`.
  `claude-invalid` adds an unknown top-level key `"bogusKey": true`.
- **Loom MCP server:** the real `packages/mcp-server/src/stdio.ts`, started through a wrapper `<case>/bin/loom-mcp`. The wrapper exports `LOOM_TEST_HOME` and `LOOM_SESSION`, unsets `LOOM_PROFILE`/`LOOM_RELAY_*`, and appends the server's stderr to `<case>/mcp-stderr.log`.
- **MCP config per invocation only.** No CLI config file was written:
  - claude: `--mcp-config <case>/mcp.json --strict-mcp-config`. This is the same wiring `loom run claude` uses (`adapters/src/claude.ts` passes only `--mcp-config`), plus strict isolation.
  - codex: `--ignore-user-config` plus `-c mcp_servers.loom.*` overrides, run with cwd = this repo (already trusted).
  - grok: `grok -p` has no per-invocation MCP flag (`--plugin-dir` exists only on `grok agent`). The harness drives `grok agent --no-leader stdio` over ACP and passes the server in `session/new` → `mcpServers:[{name:"loom", command:<wrapper>, args:[], env:[]}]`. A probe confirmed `initialize` works with the cached token.
- **Prompt** (same for all three CLIs; it forbids shell and non-loom tools so the agent cannot take the R9 shell route):
  (1) list the loom tools and say whether `room_chat` is present; (2) call `room_chat` text "hello" (skip if absent; quote if refused); (3) `add_task` title "smoke task 0320", then `update_task` id=<that id> status "done", and quote the response verbatim; (4) `import_board` mode "replace" snapshot `{"tasks":[]}`, quote verbatim. No retry, no workaround.
- **Human path:** after each agent run, the harness runs `LOOM_TEST_HOME=<case>/home LOOM_SESSION=<case>/home/.loom/session.json bun run packages/cli/src/index.ts board set <id> done` and re-reads the board.

### Exact agent commands (paths shortened; no secrets in any argv)

```
claude -p --output-format stream-json --verbose --no-session-persistence \
  --mcp-config <case>/mcp.json --strict-mcp-config [--allowedTools mcp__loom | --permission-mode manual | (nothing)]   # prompt on stdin, cwd <case>/cwd
codex exec --json --ephemeral --ignore-user-config --skip-git-repo-check -m gpt-6.1-sol -c model_reasoning_effort="medium" \
  -s read-only -c approval_policy="never" --strict-config -c mcp_servers.loom.command="<case>/bin/loom-mcp" -c mcp_servers.loom.args=[] \
  [-c mcp_servers.loom.default_tools_approval_mode="approve"] -                                  # prompt on stdin, cwd = repo
grok agent --no-leader stdio   # ACP: initialize → session/new{cwd:<case>/cwd, mcpServers:[loom]} → session/prompt
```

## Ground truth: direct JSON-RPC (`server` case, no model)

`tools/list` = **19** tools; `room_chat` is not among them. Exact server texts (all `isError: true` except add_task):

| Call | Response text |
|---|---|
| `room_chat {text:"hello"}` | `Loom pre-check refused room_chat: denied by policy.json mcp.deny (loom__room_chat). Use another tool or ask the owner.` |
| `update_task {id, status:"done"}` | ``Loom pre-check refused update_task: Marking done is the owner's decision in this room (loomTools.done=propose). Set status blocked with a note and ask the owner to run `loom board set task_… done`.`` |
| `import_board {mode:"replace", snapshot:{tasks:[]}}` | ``Loom pre-check refused import_board: mode=replace is denied (loomTools.denyModes board.replace). Use mode=merge, or the owner runs `loom board import --replace <file>`.`` |
| `update_task {id, status:"doing", extra:1}` | `Loom pre-check refused update_task: invalid arguments at extra (unrecognized_keys). Fix the arguments to match the tool's inputSchema and retry.` |

The audit file `rooms/9cab4fcc72887d86/policy-audit.jsonl` got 4 lines (`mcp_deny`, `done_propose` with `cardId`, `deny_mode:board.replace` with `mode`, `invalid_args`), and stderr got one `[loom-mcp] precheck refused tool=<t> reason=<r>` line per refusal. `loom board set <id> done` → exit 0, `updated task_… → done  smoke task 0320`.

## Results per CLI

| Check | claude (`--allowedTools mcp__loom`) | codex (approve override) | grok (ACP) |
|---|---|---|---|
| Wall time | 23.7 s | 20.4 s | 50.7 s |
| MCP server connected | init `mcp_servers` = `[{name:"loom", status:"connected"}]` | yes (calls reached `server:"loom"`) | yes (calls reached `server_name:"loom"`) |
| (1) tools listed, `room_chat` absent | **PASS**: init `tools` has 19 `mcp__loom__*`, no `room_chat`; the model says so | **PASS**: 19 named, "`room_chat` is absent" | **PASS**: tool search `result_count:19` for loom; 0 occurrences of `loom__room_chat` in the transcript; "19 tools, no room_chat" |
| (2) `room_chat` refused if called | n/a: absent, so the model could not call it (refusal proven in the `server` case) | n/a: same | n/a: same |
| (3a) `add_task` | **PASS**: ok, `task_c38163ff98c66421` | **PASS**: ok, `task_965566b878a8e011` | **PASS**: ok, `task_d17fa94125c7ed2a` |
| (3b) `update_task done` refused, propose text reaches the model | **PASS**: tool_result `is_error:true`, exact server text; the model quoted it verbatim and repeated "the owner must run `loom board set task_c38163ff98c66421 done`" | **PASS**: item `status:"failed"`, `result.content[0].text` = exact server text; the model quoted it verbatim | **PASS**: tool_call `status:"failed"`, rawOutput `{"output":{"Error":"<exact server text>"},"is_error":true}`; the model quoted `Failed to call update_task: <exact server text>` |
| (4) `import_board replace` refused | **PASS**: exact text, quoted | **PASS**: exact text, quoted | **PASS**: exact text with the `Failed to call import_board: ` prefix, quoted |
| Board after the agent | task `todo` (not done) | `todo` | `todo` |
| `policy-audit.jsonl` | **PASS**: 2 lines, `done_propose` (cardId) + `deny_mode:board.replace`, `agentKind:"claude"` | **PASS**: same 2, `agentKind:"codex"` | **PASS**: same 2, `agentKind:"grok"` |
| Human path `loom board set <id> done` | **PASS**: exit 0, status todo → done | **PASS** | **PASS** |
| Retry / workaround | none | none (no `command_execution` items) | none |

### Invalid policy (`claude-invalid`, claude 2.1.300)

Policy = fixture + `"bogusKey": true`.

| Check | Result |
|---|---|
| Tools still listed | **PASS**: init has **20** `mcp__loom__*` tools, `room_chat` included (the deny list is not applied while the policy is invalid; R50-M1) |
| `list_tasks {}` | **PASS**, refused: `Loom pre-check refused list_tasks: policy.json is invalid (invalid policy.json <case>/home/.loom/policy.json: policy: unknown key "bogusKey"). Every Loom tool call is refused until the owner fixes policy.json.` |
| `add_task {title}` | **PASS**, refused with the same loader message; the board stayed empty |
| Audit | 2 lines, `reason:"policy_invalid"` |
| Server alive | yes: it answered both calls after loading the invalid policy |

## UK-1: do codex and grok show the MCP `isError` text to the model?

**Resolved: yes, both do.** The refusal text reaches the model verbatim in all three CLIs:
- claude: `tool_result.is_error: true`, content = the server text.
- codex 0.162.1: `mcp_tool_call` `status:"failed"`, `result.content[0].text` = the server text (`error: null`). The model quoted it exactly.
- grok 1.0.54: ACP `tool_call_update` `status:"failed"`, `rawOutput.output.Error` = the server text, `is_error:true`. The model sees it with a `Failed to call <tool>: ` prefix.

The next-step guidance (`loom board set <id> done`, `mode=merge` / `loom board import --replace`) arrived intact in every case, and no model retried or tried to work around a refusal. No row of the honesty table needs to say "not shown".

## UK-4: does what Loom writes suppress claude's MCP permission prompt?

**Loom writes nothing that affects it. The owner's own permission mode decides.**
- Statically, `loom run claude` passes only `--mcp-config` (`packages/adapters/src/claude.ts:31-34`). `adapters/src` contains no `permissions` or `mcp__loom` writes. This smoke wrote no settings file either.
- `claude-noperm` (no permission flag at all): the owner's `~/.claude/settings.json` has `"defaultMode": "auto"`, and init `permissionMode` = `auto`. Every loom call (add_task, update_task, import_board) ran with **no prompt and no denial**: `permission_denials: []`, and the pre-check refusals came back as usual. In the owner's current setup, nobody confirms a Loom MCP call before it runs.
- `claude-manual` (`--permission-mode manual`, the prompting mode, no allow rule): under `-p`, claude **denied** both calls before they reached Loom. Text: `Claude requested permissions to use mcp__loom__add_task, but you haven't granted it yet.` `permission_denials` = 2, the board stayed empty, and the server logged no call and wrote no audit line. In an interactive session this is the point where a human prompt would appear.
- The flag needed for non-auto modes is `--allowedTools mcp__loom` (the `claude` case), which allows all loom tools with no prompt. `bypassPermissions` was not needed and not used.

So the honesty-table row "실행 전 사람 확인" (human confirmation before execution) should say: Loom neither adds nor suppresses claude's MCP prompt. Whether a human confirms depends on the owner's permission mode and allow rules. Under `auto` (the owner's current default), nothing is confirmed.

### Related measurement: codex and grok confirmation (PLAN says "codex/grok 대화형 MCP 호출에 확인 없음 — 미측정")

- **codex does gate MCP calls.** In `codex-noapprove` (approval_policy never, no per-tool approval), both calls failed inside codex with `MCP tool call requires approval, but approval policy is never`. Nothing reached Loom: no audit line, empty board. The calls went through only with `-c mcp_servers.loom.default_tools_approval_mode="approve"`. The owner's real `~/.codex/config.toml` has `approval_mode = "approve"` for only 5 loom tools (`list_peers`, `check_handoffs`, `list_tasks`, `add_task`, `update_task`). Loom does not write these (no `approval_mode` anywhere in `packages/*/src`), so they came from the owner or from codex's "always allow". In the owner's interactive codex, `import_board`, `conv_*`, `handoff` and the other tools therefore still ask for approval. The PLAN statement is **wrong for codex**.
- **grok (ACP) did not ask.** No `session/request_permission` arrived for any loom MCP call, and the harness was ready to answer one. In this mode grok runs Loom MCP tools without confirmation, so for grok the PLAN statement holds.

## UK-3: audit record size

One audit line is 172–206 bytes (`refused` records with `cardId` or `mode`, a short room id, and an ISO timestamp). The 1 MiB cap therefore holds about 5,000 refusals per generation, plus one `.1` generation. That is ample for refusal-only traffic; the `done_via_mcp` lines under the default `allow` policy would be the volume driver. No change suggested.

## Findings

1. **No pre-check product defect found.** Hide + refuse (`mcp.deny`), `propose`, `board.replace`, strict args (`server` case), invalid policy (refuse all, list all 20, stay alive), audit, and the human path all behaved as specified with all three real CLIs.
2. **The MCP `serverInfo.version` is still `"0.31.0"`** (`packages/mcp-server/src/stdio.ts:129`). This is expected before the P5 VERSION bump (PLAN line 121: CLI `VERSION` and MCP `serverInfo.version` → 0.32.0) and is listed here so the bump does not get missed.
3. **Done-when (i) names "a real `loom run claude` session".** This smoke drove `claude -p` with the same `--mcp-config` wiring `loom run claude` uses, against an isolated home. It did not run an interactive `loom run` PTY, because that would bind the real `~/.loom` session. If the owner wants the literal interactive run, it is still open; the server-side behaviour it would exercise is identical.
4. **codex confirms MCP calls by default** (see UK-4 related). The PLAN known-unknowns row "codex/grok 대화형 MCP 호출에 확인 없음" needs correcting for codex, and the honesty table should say that codex asks unless `approval_mode = "approve"` is set per tool or per server.
5. Every client hid `room_chat`, so no model could call it by name; only direct JSON-RPC proves the call refusal (D3). claude loads loom tools as deferred tools (`ToolSearch select:mcp__loom__…`), and grok searches them (`Search tools: "loom"`). Neither exposes a hidden tool.
6. grok also loads the owner's own MCP servers (exa, paper, pencil, context7) in an ACP session. Session `mcpServers` adds loom but does not isolate. This was harmless here.
7. grok has no per-invocation MCP flag for `grok -p`. Per-session MCP is possible only via ACP (`grok agent stdio` + `session/new.mcpServers`) or `grok agent --plugin-dir`.

## Safety

- `~/.codex/config.toml` `trust_level` count was **27 before and 27 after** both codex runs, and the file is byte-identical to a copy taken before the first codex run (`cmp`). codex ran only with cwd = this repo, using `--ignore-user-config` and `--ephemeral`.
- No writes to `~/.claude/*` settings (claude ran with `--no-session-persistence`; `~/.claude/projects` has no scratch slug; `~/.claude.json` has no scratch path), to `~/.grok/config.toml`, or to `~/.loom`.
- grok wrote its own session record under `~/.grok/sessions/<url-encoded scratch cwd>/`, which is its own state, as in the 0.31.0 smoke.
- No bypass flags: claude used auto / manual / `--allowedTools mcp__loom`; codex used `-s read-only` with approval never; grok used its ACP default. No secrets appear in argv, transcripts quoted here, or this doc (the session has no relay token).
- Repo files changed: `scripts/smoke-mcp-precheck.ts`, `package.json` (`smoke:mcp-precheck`), and this doc.
