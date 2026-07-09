# Adapters

Adapters detect, spawn, and configure MCP for coding agent CLIs.  
They **do not** reimplement agent tool loops.

## Capability matrix

| id | Binary | MCP | CLI flag | Receive | TUI | User-global config |
|----|--------|-----|----------|---------|-----|--------------------|
| `claude` | `claude` | `claude-json` (`~/.loom/mcp.json` via `--mcp-config`) | yes | both | yes | **never** (flag path) |
| `codex` | `codex` | `codex-toml` (project `.loom/codex.mcp.toml`) | — | both | yes | **opt-in** (`--write-user-config`) |
| `grok` | `grok` | `grok-toml` (project `.loom/grok.mcp.toml`) | — | both | yes | **opt-in** (`--write-user-config`) |
| `shell` | `$SHELL` | none | — | cli-inbox | no | never |

Auto-pick: **claude → codex → grok → shell**.

```bash
bun run loom agents --matrix
```

## User config policy (R3 M-3)

By default Loom **only** writes **project** MCP snippets under `.loom/`.

```bash
# Project only (safe default)
loom --profile alice run codex
loom --profile alice run grok

# Opt-in: upsert managed block into ~/.codex or ~/.grok config.toml
# Includes LOOM_SESSION / LOOM_PROFILE so multi-profile stays bound
loom --profile alice run codex --write-user-config
loom --profile alice run grok --write-user-config
```

Managed blocks are wrapped in:

```toml
# --- Loom multiplayer (managed) BEGIN ---
[mcp_servers.loom]
...
[mcp_servers.loom.env]
LOOM_SESSION = "..."
# --- Loom multiplayer (managed) END ---
```

Re-running with `--write-user-config` **strips all prior Loom MCP sections** (including legacy Fable markers / `[mcp_servers.fable]`) then writes one managed section — no duplicate tables (invalid TOML).

### Grok MCP format (verified against official docs)

Per Grok Build user guide (`~/.grok/docs/user-guide/07-mcp-servers.md`):

- Config file: `~/.grok/config.toml`
- Stdio: `[mcp_servers.<name>]` with `command`, `args`, `env`, `enabled`

```bash
loom --profile alice run grok --write-user-config
grok mcp list   # expect "loom"
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
- `loom run claude` → `--mcp-config ~/.loom/mcp.json` with session env embedded in MCP server env.
- Project `.loom/claude.mcp.json` is optional mirror only.

### Codex CLI
- Default: project `.loom/codex.mcp.toml` (session env included).
- Global `~/.codex/config.toml` only with `--write-user-config`.

### Grok Build
- Default: project `.loom/grok.mcp.toml`.
- Global `~/.grok/config.toml` only with `--write-user-config`.
- After install: `grok mcp list` should show `loom`.

### Shell
- `loom run shell` + CLI inbox/handoff.
