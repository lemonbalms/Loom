# Adapters

Adapters detect, spawn, and configure MCP for coding agent CLIs.  
They **do not** reimplement agent tool loops.

## Capability matrix

| id | Binary | MCP | CLI flag | Receive | TUI | User-global config |
|----|--------|-----|----------|---------|-----|--------------------|
| `claude` | `claude` | `claude-json` (`~/.fable/mcp.json` via `--mcp-config`) | yes | both | yes | **never** (flag path) |
| `codex` | `codex` | `codex-toml` (project `.fable/codex.mcp.toml`) | — | both | yes | **opt-in** (`--write-user-config`) |
| `grok` | `grok` | `grok-toml` (project `.fable/grok.mcp.toml`) | — | both | yes | **opt-in** (`--write-user-config`) |
| `shell` | `$SHELL` | none | — | cli-inbox | no | never |

Auto-pick: **claude → codex → grok → shell**.

```bash
bun run fable agents --matrix
```

## User config policy (R3 M-3)

By default Fable **only** writes **project** MCP snippets under `.fable/`.

```bash
# Project only (safe default)
fable --profile alice run codex
fable --profile alice run grok

# Opt-in: upsert managed block into ~/.codex or ~/.grok config.toml
# Includes FABLE_SESSION / FABLE_PROFILE so multi-profile stays bound
fable --profile alice run codex --write-user-config
fable --profile alice run grok --write-user-config
```

Managed blocks are wrapped in:

```toml
# --- Fable multiplayer (managed) BEGIN ---
[mcp_servers.fable]
...
[mcp_servers.fable.env]
FABLE_SESSION = "..."
# --- Fable multiplayer (managed) END ---
```

Re-running with `--write-user-config` **strips all prior Fable MCP sections** (including legacy v0.2.2 `# --- Fable multiplayer (auto-added) ---` blocks) then writes one managed section — no duplicate `[mcp_servers.fable]` tables (invalid TOML).

### Grok MCP format (verified against official docs)

Per Grok Build user guide (`~/.grok/docs/user-guide/07-mcp-servers.md`):

- Config file: `~/.grok/config.toml`
- Stdio: `[mcp_servers.<name>]` with `command`, `args`, `env`, `enabled`

```bash
fable --profile alice run grok --write-user-config
grok mcp list   # expect "fable"
```

## MCP tools

| Tool | Direction |
|------|-----------|
| `list_peers` | in |
| `handoff` | out |
| `check_handoffs` | in (re-sanitized bodies) |
| `claim_handoff` | in |
| `room_chat` | out |

## Per-agent notes

### Claude Code
- `fable run claude` → `--mcp-config ~/.fable/mcp.json` with session env embedded in MCP server env.
- Project `.fable/claude.mcp.json` is optional mirror only.

### Codex CLI
- Default: project `.fable/codex.mcp.toml` (session env included).
- Global `~/.codex/config.toml` only with `--write-user-config`.

### Grok Build
- Default: project `.fable/grok.mcp.toml`.
- Global `~/.grok/config.toml` only with `--write-user-config`.
- After install: `grok mcp list` should show `fable`.

### Shell
- `fable run shell` + CLI inbox/handoff.
