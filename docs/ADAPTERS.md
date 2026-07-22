# Adapters

**철학 (첫 문단):** 어댑터는 코딩 에이전트의 도구 루프를 재구현하지 않는다. Loom이 갖는 것은 **연결 계약**뿐이다 — (1) 사용자 터미널에 CLI를 붙이고 MCP로 room에 넣는 경로, (2) herdr pane에 워커를 붙여 카드를 실행하는 경로. 두 경로를 한 표로 뭉개면 운영 사고가 난다.

**As-built pin:** CLI / PLAN **v0.28.1**.  
**Herdr RPC 정본:** [`spikes/HERDR-0.7.5-COMPAT.md`](./spikes/HERDR-0.7.5-COMPAT.md) (이 문서에 스키마를 복제하지 않는다).

---

## Two surfaces

| Surface | Entry | Config home | Completion |
|---------|-------|-------------|------------|
| **Interactive MCP run** | `loom run claude\|codex\|grok\|shell` | project `.loom/*` (+ opt-in user config) | Human + agent session; room via MCP |
| **Card worker (bridge)** | `loom bridge` + herdr | bridge profile JSON · herdr socket | Result handoff; **not** automatic board `done` (0.28.0) |

```bash
bun run loom agents --matrix    # interactive adapter matrix
```

---

## 1. Interactive CLI adapters (MCP)

Adapters detect, spawn, and configure MCP for coding agent CLIs.

### Capability matrix

| id | Binary | MCP | CLI flag | Receive | TUI | User-global config |
|----|--------|-----|----------|---------|-----|--------------------|
| `claude` | `claude` | `claude-json` (`~/.loom/mcp.json` via `--mcp-config`) | yes | both | yes | **never** (flag path) |
| `codex` | `codex` | `codex-toml` (project `.loom/codex.mcp.toml`) | — | both | yes | **opt-in** (`--write-user-config`) |
| `grok` | `grok` | `grok-toml` (project `.loom/grok.mcp.toml`) | — | both | yes | **opt-in** (`--write-user-config`) |
| `shell` | `$SHELL` | none | — | cli-inbox | no | never |

Auto-pick: **claude → codex → grok → shell**.

### User config policy (R3 M-3)

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

### MCP tools (representative)

| Tool | Direction |
|------|-----------|
| `list_peers` | in |
| `handoff` | out |
| `check_handoffs` | in (re-sanitized bodies) |
| `claim_handoff` | in |
| `room_chat` | out |
| board / pack / conv tools | see `packages/mcp-server` |

### Per-agent notes

#### Claude Code
- `loom run claude` → `--mcp-config ~/.loom/mcp.json` with session env embedded in MCP server env.
- Project `.loom/claude.mcp.json` is optional mirror only.

#### Codex CLI
- Default: project `.loom/codex.mcp.toml` (session env included).
- Global `~/.codex/config.toml` only with `--write-user-config`.

#### Grok Build
- Default: project `.loom/grok.mcp.toml`.
- Global `~/.grok/config.toml` only with `--write-user-config`.
- After install: `grok mcp list` should show `loom`.

#### Shell
- `loom run shell` + CLI inbox/handoff.

---

## 2. Herdr card-worker path (bridge, 0.28.1)

This is **not** `loom run`. The node **bridge** talks to herdr over a local socket and runs isolated worker panes.

### Runtime pin

| Item | Value |
|------|--------|
| herdr | **0.7.5** |
| protocol | **17** (`HERDR_PROTOCOL_EXPECTED`) |
| Submit primitive | **`agent.prompt`** (atomic) |
| Start shape | pane first → `agent.start{name, kind, pane_id}` |
| Prompt target | **exact agent name**, never pane id alone |
| Name form | `loom-${cardId}-${seq}` (strict; unrepresentable → fail-closed) |

### Conceptual sequence

```
tab.create / pane.split   # env (LOOM_CARD, LOOM_HOOK_SOCK), cwd
  → agent.start { name, kind, pane_id }
  → wait interactive_ready   # not: agent.wait idle as launch barrier
  → agent.prompt { text }
  → observe (events + scrape + optional hooks)
  → issue result once per flight
```

### Kind map

Interactive worker kinds used in dogfood: **`claude` · `codex` · `grok`**.  
Protocol 17 kind allowlist must include **`grok`** (default implementer lane).

### Re-inject / dual-submit (M-2 spirit)

- Untrusted prompt text is **not** shell-interpolated.
- Dual-`agent.send` + `BARE_ENTER` **removed** on p17.
- Stall handling: probe first; re-issue full prompt only on positive miss; probe hit / read-fail → bounded `send_keys` nudge only; budget exhaust → fail-visible.
- Details: `implementation-notes.md` §0.28.1 · COMPAT §3–§5.

### Config migration

- Persisted `herdrProtocol:16` may be **auto-migrated** on dogfood:up after adapter ship.
- **Forbidden:** setting protocol 17 in config **without** the 0.28.1 adapter (false green on ping only).

### Ops checks

```bash
bun run dogfood:herdr
bun run loom --profile <node> bridge status
```

Dispatcher allowlist needs **full peer ids** (not truncated table display).

---

## See also

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — system map  
- [`USER_GUIDE.md`](./USER_GUIDE.md) §12–§14 — ops scenarios  
- [`HERDR_DESIGN.md`](./HERDR_DESIGN.md) — 0.22 baseline + as-built banner  
- [`DOGFOOD_LOOP.md`](./DOGFOOD_LOOP.md) — multi-agent rooms  
