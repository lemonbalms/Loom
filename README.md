# Loom

**Multiplayer AI terminal** — *connect your agents — and your teammates.*

Loom is a **Mosaic-class collaboration layer** for coding-agent CLIs (Claude Code, Codex, Grok Build, shell, …).  
Several people join the same **Room**; each runs their own agent; work and context move through **`handoff`** into a **per-peer inbox** that still works when someone is offline.

> Loom is **not** another coding agent. It wraps existing CLIs and adds a room bus, presence, inbox, and MCP tools so heterogeneous agents can collaborate.

| | |
|--|--|
| **CLI** | `loom` (legacy alias `fable` during transition) |
| **Packages** | `@loom/*` (Bun monorepo) |
| **Plan** | [`docs/PLAN.md`](docs/PLAN.md) **v0.9.1** |
| **Protocol** | [`docs/PROTOCOL.md`](docs/PROTOCOL.md) |

---

## Why Loom exists

Modern multiplayer coding is broken in two ways:

1. **Humans** need a shared room (presence, chat, tasks) without forcing one IDE.
2. **Agents** need a first-class way to pass work (**handoff**), claim it, and carry **context** (pack / board snapshots) — without reimplementing Claude/Codex/Grok.

Loom’s north star:

> **Connect your agents — and your teammates.**

Core mechanisms:

| Concept | Role |
|---------|------|
| **Room** | Shared session keyed by invite code (`LOOM-XXXX`) |
| **Peer** | Human + agent identity on the roster (`online` / offline) |
| **Handoff** | Message/task to `@name`, `id`, or `*` — queued in inbox |
| **Relay** | WebSocket fan-out + in-memory roster/inbox |
| **Host / sticky** | Long-lived connection so the peer stays online |
| **MCP** | Agents call `check_handoffs`, `claim_handoff`, `handoff`, board/pack tools |
| **Pack / board** | Local room-scoped context and tasks; optional handoff attach for multi-machine |

---

## Repository structure

```
Loom/
├── package.json                 # workspaces root; scripts: loom, test, dev:relay
├── bun.lock
├── tsconfig.base.json
├── README.md
├── packages/                    # Bun workspace packages (@loom/*)
│   ├── protocol/                # Envelopes, invite codes, sanitize, env helpers
│   ├── relay/                   # Room registry, WebSocket RelayServer, auth
│   ├── host/                    # Session, sticky host IPC, pack, board, slash
│   ├── adapters/                # Claude / Codex / Grok / shell spawn + MCP config
│   ├── mcp-server/              # Agent-facing MCP tools over stdio
│   └── cli/                     # User CLI entry (bin: loom)
├── apps/
│   └── relay-cloud/             # Remote/LAN relay ops notes (README)
├── docs/
│   ├── PLAN.md                  # Product plan SSOT (versioned)
│   ├── plan_review.md           # Review gate (R1…)
│   ├── PROTOCOL.md              # Wire protocol
│   ├── ARCHITECTURE.md          # Component map
│   ├── ADAPTERS.md              # Agent adapter matrix
│   ├── RENAME_TO_LOOM.md        # Fable→Loom rename plan (historical)
│   └── spikes/                  # e.g. PTY inject no-go
└── tasks/                       # Local checklists (optional)
```

### Package roles

| Package | npm name | Responsibility |
|---------|----------|----------------|
| Protocol | `@loom/protocol` | Versioned messages, invite/peer secrets, sanitize, relay URL |
| Relay | `@loom/relay` | Rooms, roster ≠ socket, handoff routing, token auth (H-5/H-6) |
| Host | `@loom/host` | Session (`~/.loom`), sticky host, context pack, task board |
| Adapters | `@loom/adapters` | Detect/spawn agent CLIs; write MCP config |
| MCP | `@loom/mcp-server` | `list_peers`, `handoff`, `check_handoffs`, `claim_handoff`, board/pack |
| CLI | `@loom/cli` | `loom` command surface |

### Data flow (high level)

```
Agent CLIs ──MCP/CLI──► Host ──WebSocket──► Relay
                         │                   │
                         ~/.loom session     roster + online map
                         pack / board        per-peer inbox (in-memory)
```

---

## Quick start (two peers, one machine)

**Requirements:** [Bun](https://bun.sh) 1.x.

```bash
git clone https://github.com/lemonbalms/Loom.git
cd Loom
bun install

# Terminal A — create room
bun run loom --profile alice room create --name demo --as alice
# note invite: LOOM-XXXX

# Terminal B — join + handoff
bun run loom --profile bob room join LOOM-XXXX --as bob
bun run loom --profile bob handoff @alice "the british are coming"

# Terminal A — claim work
bun run loom --profile alice inbox
bun run loom --profile alice inbox accept ho_…
```

Stay online (pick one):

```bash
# Sticky host (recommended for multi-terminal same profile)
bun run loom --profile alice host start

# Or foreground listen
bun run loom --profile alice listen
```

Spawn an agent with MCP:

```bash
bun run loom --profile alice run claude   # or codex | grok | shell | auto
```

### Remote (two machines)

```bash
# Host machine
LOOM_RELAY_HOST=0.0.0.0 LOOM_RELAY_TOKEN=pick-a-long-secret bun run loom relay

# Clients
export LOOM_RELAY_URL=ws://HOST:7842
export LOOM_RELAY_TOKEN=pick-a-long-secret
bun run loom --profile alice room create --as alice
# share LOOM-XXXX; peer secrets stay in each user's ~/.loom session (0600)
```

See [`apps/relay-cloud/README.md`](apps/relay-cloud/README.md) for LAN/TLS notes and threat model.

---

## Commands (summary)

| Command | Description |
|---------|-------------|
| `loom --profile <name> …` | Isolate session (`~/.loom/profiles/<name>.json`) |
| `loom room create \| join \| leave` | Room lifecycle |
| `loom peers` | Roster with online/offline |
| `loom handoff @name\|* <msg>` | Queue handoff (`--with-pack`, `--with-board`, `--board`) |
| `loom inbox` / `inbox accept <id>` | Human inbox |
| `loom listen` | Stay online; print handoffs/chat |
| `loom run [agent]` | Spawn agent + MCP |
| `loom host start\|stop\|status` | Sticky long-lived connection |
| `loom pack …` / `loom board …` | Room-local context pack / task board |
| `loom relay` | Run local/LAN relay process |

Env (primary names; many `FABLE_*` still dual-read for one minor — not `INSECURE_OPEN`):

- `LOOM_SESSION`, `LOOM_PROFILE`
- `LOOM_RELAY_URL`, `LOOM_RELAY_TOKEN`, `LOOM_RELAY_HOST`, `LOOM_RELAY_PORT`

---

## Features (shipped)

- [x] Versioned room protocol + local WebSocket relay  
- [x] Roster ≠ socket (offline inbox) + profiles  
- [x] Peer text sanitization (no raw ESC/CSI/OSC)  
- [x] Claude / Codex / Grok adapters + MCP tools  
- [x] Remote relay token auth (Bearer preferred; refuse open non-loopback)  
- [x] Sticky host IPC  
- [x] Context pack + task board (+ snapshot share via handoff)  
- [x] Per-peer rejoin secret (M-7) — invite+token alone cannot take over another peer  
- [x] Product identity **Loom** (0.9.0)

**Not goals (yet):** full Tauri UI (needs Rust toolchain), durable relay inbox across process restarts, live multi-writer CRDT board.

---

## Development

```bash
bun install
bun test                 # unit + integration
bun run loom --version
bun run dev:relay        # local relay
```

Planning docs live under `docs/`. Implementation follows `docs/PLAN.md` version gates and `docs/plan_review.md` review rounds.

---

## Security notes

- Treat **handoff body and attachments as untrusted**.
- All peer-controlled strings are **allowlist-sanitized**.
- Session files use mode **0600** (`peerSecret`, tokens).
- Non-loopback relay bind **requires** a token unless `--insecure-open` / `LOOM_RELAY_INSECURE_OPEN` (explicit only).

---

## License / status

Private/experimental monorepo under active development (0.x).  
Issues and collaboration: use this GitHub repository.

**Maintainer remote:** https://github.com/lemonbalms/Loom
