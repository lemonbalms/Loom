# Protocol

Version: **1** (`v: 1` on every envelope) — M1.1 + M-7 + Loom rename (PLAN 0.9.0)

Default relay: `ws://127.0.0.1:7842/ws`  
HTTP health: `GET /health` (always open)  
Room list: `GET /rooms` (requires token if server set `LOOM_RELAY_TOKEN`)  
WebSocket: `GET /ws` or `/` upgrade — `?token=` or `Authorization: Bearer` when auth enabled  

Remote clients:

```
LOOM_RELAY_URL=ws://host:7842
LOOM_RELAY_TOKEN=secret
# or: fable --relay ws://host:7842 --token secret room join …
```

## Roster vs socket

- **Join/create** adds peer to **roster** and attaches a live socket (`online: true`).
- **Socket close** → peer stays on roster with `online: false` (offline).
- **Explicit `leave`** → remove from roster + drop that peer’s inbox.
- Handoffs resolve against **roster**, not live sockets only.

## Peer ownership (M-7)

- On **first** join/create for a `peer.id`, the relay mints a **`peerSecret`** (base64url, 24 random bytes).
- The secret is returned **only** on that peer’s `room.state` (`peerSecret` field) — never on roster broadcasts to others.
- **Rejoin** with the same `peer.id` must send `peer.secret` matching the stored secret (constant-time compare).
- Mismatch or missing secret → `error` with `code: peer_auth_failed` (no roster takeover, no inbox access).
- Clients persist `peerSecret` in the session file (mode **0600**). Lost secret ⇒ join as a **new** peer id (old roster slot remains until leave/GC).
- Room invite + server token alone are **not** sufficient to impersonate an existing peer.

## Client → server

| type | fields | purpose |
|------|--------|---------|
| `create` | `roomName`, `peer` | Create room; creator online |
| `join` | `inviteCode`, `peer` | Join / reconnect (same `peer.id` reuses roster **if** secret matches) |
| `handoff` | `handoff.{to,body,mode?,attachments?}` | Enqueue + notify if online |
| `chat` | `text` | Broadcast to online peers |
| `list_peers` | — | `room.state` (no `peerSecret`) |
| `list_inbox` | — | `inbox.state` for caller |
| `claim_handoff` | `id`, `via: claim\|accept` | First-wins claim/accept |
| `leave` | — | Remove from roster |

`peer`: `id`, `displayName`, `agentKind`, optional `color`, optional **`secret`** (required on rejoin of existing id).  
Invite codes: `LOOM-7K2M`.

## Server → client

| type | purpose |
|------|---------|
| `room.state` | Peers (incl. `online`) + room meta; optional **`peerSecret`** only for the joining peer |
| `peer.join` | New roster member |
| `peer.leave` | Explicit leave |
| `peer.presence` | `{ peerId, online }` offline/online without leave |
| `chat` | Chat (sanitized text) |
| `handoff` | Live notify to online target (also enqueued) |
| `handoff.ack` | Sender result: `queued` \| `delivered` \| `peer_unknown` |
| `inbox.state` | Pending inbox entries |
| `inbox.claim_result` | Claim/accept result |
| `error` | `code` + `message` (incl. `peer_auth_failed`) |

## Handoff routing

1. Sanitize body/attachments.
2. Resolve targets: `*` → all roster except sender; else id / `@name`.
3. For each target: **enqueue** inbox entry (`queued`).
4. If target online: send `handoff` notify → entry status `notified`.
5. Ack sender:
   - `delivered` if any target notified
   - `queued` if enqueued but none online
   - `peer_unknown` if no roster match

Inbox entry status: `queued` → `notified` → `accepted` \| `claimed` (first-wins).

## PeerInfo

```ts
{ id, displayName, color, agentKind, joinedAt, online: boolean }
```

## Sanitize

All peer-controlled strings use allowlist sanitize (printable + `\n\t`; strip ESC/CSI/OSC) before store/display.
