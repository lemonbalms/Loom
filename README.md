# Loom

**Multiplayer AI terminal** — *connect your agents — and your teammates.*

Loom is a **Mosaic-class collaboration layer** for coding-agent CLIs (Claude Code, Codex, Grok Build, shell, …).  
Several people join the same **Room**; each runs their own agent; work and context move through **`handoff`** into a **per-peer inbox** that still works when someone is offline.

> Loom is **not** another coding agent. It wraps existing CLIs and adds a room bus, presence, inbox, and MCP tools so heterogeneous agents can collaborate.

| | |
|--|--|
| **CLI** | `loom` only (`bun run loom`) |
| **Packages** | `@loom/*` (Bun monorepo) |
| **Plan** | [`docs/PLAN.md`](docs/PLAN.md) **v0.17.1** (`approved` — Launcher UX: `up`/`down` + host-default + work-first; R18 author-close) |
| **Priorities** | [`docs/PRIORITIES.md`](docs/PRIORITIES.md) — **지금 무엇을 할지** |
| **User guide** | [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md) — **사용 사례 중심** (한국어) |
| **Test plan** | [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md) — **사례별 테스트 체크리스트** |
| **Workflow** | [`docs/WORKFLOW.md`](docs/WORKFLOW.md) — Plan → Review → Implement → Ship |
| **Session entry** | [`AGENTS.md`](AGENTS.md) (Codex+Claude) · [`HANDOFF.md`](HANDOFF.md) · `bun run status` |
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
│   ├── PRIORITIES.md            # What to do next (short-term)
│   ├── USER_GUIDE.md            # End-user scenarios (Korean)
│   ├── TEST_PLAN.md             # Per-scenario test checklist
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

## Quick start

### Join a room in one line (invited user — fastest)

You were given a `loom://join/…` invite blob. Install and join:

```bash
curl -fsSL https://raw.githubusercontent.com/lemonbalms/Loom/main/scripts/install.sh | bash
exec $SHELL                       # activate PATH (or open a new terminal)
loom room join <blob>             # the loom://join/... invite you were given
```

`install.sh` ensures [Bun](https://bun.sh), clones the repo to `~/.loom-src`, links
`loom` onto your PATH, and verifies it — no manual `bun install`/PATH steps. It
touches only your home dir + shell rc (no sudo). Overrides: `LOOM_INSTALL_DIR`,
`LOOM_INSTALL_REF`. (`curl | bash` runs a remote script — read it first if you
prefer: [`scripts/install.sh`](./scripts/install.sh).)

---

### Manual setup (two peers, one machine)

**Requirements:** [Bun](https://bun.sh) 1.x.

```bash
git clone https://github.com/lemonbalms/Loom.git
cd Loom
bun install
```

#### Make `loom` available (pick one)

| 방식 | 명령 | 설명 |
|------|------|------|
| **A. Repo only** | `bun run loom …` | 항상 동작 (PATH 불필요) |
| **B. Global bin** | `bun run link:loom` 후 `export PATH="$HOME/.bun/bin:$PATH"` | 어디서나 `loom …` |
| **C. PATH wrapper** | `export PATH="$PWD/scripts:$PATH"` | 레포 `scripts/loom` 래퍼 |

```bash
# B — one-time link (recommended if you dogfood often)
bun run link:loom
export PATH="${BUN_INSTALL:-$HOME/.bun}/bin:$PATH"
loom --version

# Undo: bun run unlink:loom
```

### Two-profile handoff

```bash
# Terminal A — create room
bun run loom --profile alice room create --name demo --as alice
# note invite: LOOM-XXXX  (Share line uses bun run loom …)

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

Env (**0.10: `LOOM_*` only** — `FABLE_*` is ignored with a warning):

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
- [x] Durable relay inbox/roster across restarts (0.14.x; `LOOM_RELAY_EPHEMERAL=1` opt-out)

**Not goals (yet):** multi-window Tauri polish, live multi-writer CRDT board, cloud accounts. Desktop: `bun run desktop` (needs `loom host start`); headless: `bun run smoke:desktop` · durable: `bun run smoke:durable`.

---

## Development

```bash
bun install
bun test                 # unit + integration
bun run smoke:durable    # UC-2.4 restart survival
bun run loom --version
bun run dev:relay        # local relay (durable by default)
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
