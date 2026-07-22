# Architecture

**철학 (첫 문단):** Loom 아키텍처 문서는 패키지 나열이 아니라 **누가 어떤 권한으로 상태를 바꿀 수 있는지**, 그리고 **데이터가 어느 경계를 넘는 경로**인지를 한 지도에 담는다. “관측됐다”와 “완료다”를 같은 화살표로 그리지 않는다. 와이어 세부·스키마 축자는 정본 스파이크에 두고, 이 문서는 **as-built 구조**만 유지한다.

**As-built pin:** CLI / PLAN **v0.28.1** (2026-07-22).  
**Normative deep dives:** [HERDR-0.7.5-COMPAT](./spikes/HERDR-0.7.5-COMPAT.md) · [PANE-DEATH-UNIFIED](./spikes/PANE-DEATH-UNIFIED-DESIGN.md) · [PROTOCOL](./PROTOCOL.md) · [HERDR_DESIGN](./HERDR_DESIGN.md) (0.22 baseline + as-built banner).

---

## Goals

1. **Multi-human rooms** with colored presence  
2. **Cross-agent handoff** without reimplementing coding agents  
3. **Local-first** relay protocol that later swaps to remote transport  
4. **Adapter-based** multi-CLI support (Claude Code, Codex, Grok, shell)  
5. **Node bridge × herdr** — dispatch cards to worker panes without giving the bus completion authority  

---

## Components

| Package / surface | Role |
|-------------------|------|
| `@loom/protocol` | Versioned envelopes, invite codes, formatting, card/handoff contracts |
| `@loom/relay` | Rooms, WebSocket fanout, handoff routing; **durable** room/roster/inbox under `LOOM_RELAY_STATE_DIR` (0.14.1+) |
| `@loom/host` | Session store, sticky host IPC, pack, board, **bridge runtime**, herdr client, inject, result issuer/quarantine |
| `@loom/adapters` | Detect/spawn **interactive** agent CLIs + MCP config (`loom run …`) |
| `@loom/mcp-server` | MCP tools for agents (`handoff`, `list_peers`, `claim_handoff`, board/pack, conv tools, …) |
| `@loom/cli` | User-facing `loom` command (`room`, `host`, `bridge`, `board`, `run`, …) |
| `apps/desktop` | Tauri 2 shell — Status/Peers/Inbox via sticky host RPC |
| **herdr** (external) | Local agent multiplexer (Unix socket). Loom does not reimplement it; the bridge **adapts** to its protocol version |

### Two agent attachment modes (do not conflate)

| Mode | Entry | Who owns the TUI | Typical use |
|------|-------|------------------|-------------|
| **Interactive run** | `loom run claude\|codex\|grok` | User’s terminal | Human+agent in one seat, MCP into room |
| **Card worker** | `loom bridge` + herdr pane | herdr pane | Orchestrator dispatches work; worker is isolated |

---

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
```

### Board snapshot share (Phase 4.3a)

```
export_board → loom-board-snapshot JSON
handoff --with-board → attachment label loom-board-snapshot
receiver: board import / import-handoff / import_board (merge|replace)

Multi-machine: share via handoff or file, not continuous CRDT.
```

### Run agent (interactive)

```
loom run claude
  → write ~/.loom/mcp.json
  → re-join room (background listener on stderr)
  → spawn `claude --mcp-config …` with stdin/stdout inherit
```

---

## Node bridge × herdr (0.22+ as-built, pin 0.28.1)

Tower (room board + orchestrator peers) and worker nodes are separated on purpose.

```
                    ┌────────────────────────────┐
                    │  Tower (any host)          │
                    │  relay · roster · inbox    │
                    │  local board (SSOT status) │
                    └───────────┬────────────────┘
                          WebSocket room bus
                                │
                    ┌───────────▼────────────────┐
                    │  Node: loom bridge         │
                    │  claim card · flight ·     │
                    │  inject · observe · result │
                    └───────────┬────────────────┘
                          herdr local socket
                                │
                    ┌───────────▼────────────────┐
                    │  pane + named agent        │
                    │  claude | codex | grok     │
                    └────────────────────────────┘
```

### Card dispatch path (happy path, conceptual)

```
1. Orchestrator / work-bus → handoff(task) + card attachment
2. Bridge: authorize dispatcher (allowlist of full peer ids) → claim
3. Herdr (protocol 17):
     tab.create / pane.split  (env LOOM_CARD, LOOM_HOOK_SOCK, cwd)
  → agent.start { name, kind, pane_id }
  → wait interactive_ready (not “idle” as launch barrier)
  → agent.prompt { text }     # atomic submit
4. Observe: events + scrape (+ optional hook sensor hints)
5. Issue result once per dispatch attempt (issuer ownership)
6. Tower ingress: currency gate → apply policy (see authority)
```

### Herdr protocol 17 call shape (summary only)

Full tables: [`docs/spikes/HERDR-0.7.5-COMPAT.md`](./spikes/HERDR-0.7.5-COMPAT.md).

| Step | Method | Notes |
|------|--------|--------|
| Create surface | `tab.create` / `pane.split` | **env + cwd only here** |
| Bind agent | `agent.start` | **required** `name`, `kind`, `pane_id` — no argv/env/cwd/split on start |
| Submit | `agent.prompt` | atomic; do not resurrect dual-`agent.send` |
| Keys only | `agent.send_keys` | explicit key chords / bounded Enter nudge after probe |
| Observe | events + `pane`/`agent` read | status events carry no body |

**Identity:** prompt target = **exact agent name** (`loom-${cardId}-${seq}`, strict constraints). Pane id as prompt target is a live silent-misroute hazard.

**Config:** `HERDR_PROTOCOL_EXPECTED === 17` is paired with the adapter. Bumping config alone without adapter code is forbidden (false green).

---

## Completion authority (0.28.0 locks — non-negotiable)

| Signal | Means | Does **not** mean |
|--------|--------|-------------------|
| herdr pane exit / process death | resource gone / observe cleanup | task success |
| scrape / hook hint / `card.done` body | candidate evidence | board `done` |
| relay ACK `delivered`/`queued` | transport accepted | tower applied · work complete |
| remote result `status:"done"` | untrusted remote claim | local board `done` |

**Tower policy (U2):** remote results that claim `done` are applied as board **`blocked`** with reason `legacy_remote_done_requires_verification` until a **local** verified mutation sets `done`.

**Bridge policy:** no automatic completion authority from pane lifecycle alone; single result issuer per flight; non-accepted ACK paths absorb into quarantine / fail-visible states rather than inventing success.

Deep design: [`docs/spikes/PANE-DEATH-UNIFIED-DESIGN.md`](./spikes/PANE-DEATH-UNIFIED-DESIGN.md) U1–U11.

---

## Worker observation (hooks + scrape)

Bridge observation is **hybrid** (not hooks-only):

| Layer | Role |
|-------|------|
| Scrape / herdr status | Common path for all `agentKind` |
| CLI lifecycle hooks | Optional **sensor** (turn end, approval) — never completion authority |
| Artifact / card.done body | Large output carrier — still not board authority |

Multi-vendor matrix: [`docs/spikes/AGENT-CLI-LIFECYCLE-HOOKS.md`](./spikes/AGENT-CLI-LIFECYCLE-HOOKS.md).  
Claude-first spike: [`docs/spikes/HOOKS-SENSOR-SPIKE.md`](./spikes/HOOKS-SENSOR-SPIKE.md).

---

## Local vs remote

| Concern | Local | Remote |
|---------|-------|--------|
| Transport | `ws://127.0.0.1:7842/ws` | `ws(s)://host:7842/ws` |
| Auth | optional token; invite code for room | **shared token** + invite code |
| Process | auto-spawn daemon | host runs `loom relay --host 0.0.0.0` |
| Protocol | same envelopes (relay v1) | same envelopes |
| Reconnect | listen/run auto re-join | same |

---

## Security notes

- Handoff bodies are **untrusted** — UI shows a warning banner  
- File attachments restricted to cwd allowlist where applicable  
- Relay **persists** room meta, roster (+peerSecret), and pending inbox under `~/.loom/relay-state/` (or `LOOM_RELAY_STATE_DIR`); `LOOM_RELAY_EPHEMERAL=1` disables  
- Agents run under the **user’s own** CLI credentials (no proxy login)  
- Bridge dispatch requires **authorized dispatcher peer ids** (full ids, not table truncations)  
- Prompt text is never interpolated into shell/`pane.run` as a command — submit primitives are structured (`agent.prompt`)  

---

## Why not shared PTY?

Mosaic-style multiplayer is **peer-isolated agent sessions + message bus**, not a single shared shell cursor. That matches heterogeneous agents and avoids input races. Pair-mode can be a later optional mode.

---

## Document authority map

| Question | Read first |
|----------|------------|
| Relay wire types | [`PROTOCOL.md`](./PROTOCOL.md) |
| herdr 0.7.5 RPC | [`spikes/HERDR-0.7.5-COMPAT.md`](./spikes/HERDR-0.7.5-COMPAT.md) |
| Bridge design baseline (0.22) | [`HERDR_DESIGN.md`](./HERDR_DESIGN.md) — use as-built banner |
| Completion / pane death | [`spikes/PANE-DEATH-UNIFIED-DESIGN.md`](./spikes/PANE-DEATH-UNIFIED-DESIGN.md) |
| User scenarios | [`USER_GUIDE.md`](./USER_GUIDE.md) |
| What shipped | [`CHANGELOG.md`](./CHANGELOG.md) |
| Next gate | `HANDOFF.md` · `bun run status` |
