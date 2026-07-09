# Architecture

## Goals

1. **Multi-human rooms** with colored presence  
2. **Cross-agent handoff** without reimplementing coding agents  
3. **Local-first** relay protocol that later swaps to remote transport  
4. **Adapter-based** multi-CLI support (Claude Code, Codex, Grok, shell)

## Components

| Package | Role |
|---------|------|
| `@loom/protocol` | Versioned envelopes, invite codes, formatting |
| `@loom/relay` | In-memory rooms, WebSocket fanout, handoff routing |
| `@loom/host` | Session store, relay client, presence render, slash parse, daemon bootstrap |
| `@loom/adapters` | Detect/spawn agent CLIs |
| `@loom/mcp-server` | MCP tools for agents (`handoff`, `list_peers`, `room_chat`) |
| `@loom/cli` | User-facing `loom` command |
| `apps/desktop` | Tauri 2 shell — Status/Peers/Inbox via sticky host RPC (Rust invoke; no Board v1) |

## Data flow

### Create / join

```
CLI → ensureLocalRelay() → RelayClient create|join → save ~/.loom/session.json
```

### Handoff

```
CLI or MCP
  → prefer sticky host IPC (if loom host start)
  → else one-shot RelayClient join→handoff→close
  → RelayServer routeHandoff
  → target peer WebSocket (if online) + inbox enqueue
  → listen / sticky host / run stderr formats [LOOM HANDOFF]
```

### Sticky host (Phase 4.0a)

```
loom host start
  → long-lived RelayClient (auto-reconnect)
  → loopback HTTP POST /rpc (Bearer token in *.host.json)
  → loom peers|handoff|inbox and MCP tools call IPC
  → without host: unchanged one-shot path
```

### Context pack (Phase 4.1)

```
~/.loom/packs/<hash(roomId)>.json   (local 0600, room-scoped — shared across profiles on same UID)
  summary + paths (cwd-allowlisted) + notes

loom pack set|add|note …
loom handoff @peer "…" --with-pack
  → attachments: context-pack-summary | context-pack-path[:label] | notes
  → same HandoffPayload.attachments (protocol v1 unchanged)
  → receivers: display only — do not open paths as local FS

MCP: get_context_pack, handoff{ withPack }
```

### Task board (Phase 4.2)

```
~/.loom/boards/<hash(roomId)>.json   (local 0600, room-scoped)
  tasks: { id, title, status, assignee?, handoffId?, notes? }

loom board add|set|assign|note|rm|show
loom handoff @peer "…" --board   # also creates task linked to handoffId
MCP: list_tasks, add_task, update_task

Not live-synced — each machine has its own board file for that roomId.

### Board snapshot share (Phase 4.3a)

```
export_board → loom-board-snapshot JSON
handoff --with-board → attachment label loom-board-snapshot
receiver: board import / import-handoff / import_board (merge|replace)

Multi-machine: share via handoff or file, not continuous CRDT.
```

### Run agent

```
loom run claude
  → write ~/.loom/mcp.json
  → re-join room (background listener on stderr)
  → spawn `claude --mcp-config …` with stdin/stdout inherit
```

## Local vs remote

| Concern | | Local | Remote (Phase 3) |
|--|-------|------------------|
| Transport | `ws://127.0.0.1:7842/ws` | `ws(s)://host:7842/ws` |
| Auth | optional token; invite code for room | **shared token** + invite code |
| Process | auto-spawn daemon | host runs `loom relay --host 0.0.0.0` |
| Protocol | same envelopes | same envelopes |
| Reconnect | listen/run auto re-join | same |

## Security notes

- Handoff bodies are **untrusted** — UI shows a warning banner  
- File attachments (future) restricted to cwd allowlist  
- Relay does not persist message bodies by default  
- Agents run under the **user’s own** CLI credentials (no proxy login)

## Why not shared PTY?

Mosaic-style multiplayer is **peer-isolated agent sessions + message bus**, not a single shared shell cursor. That matches heterogeneous agents and avoids input races. Pair-mode can be a later optional mode.
