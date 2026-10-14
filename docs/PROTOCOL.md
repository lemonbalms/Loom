# Protocol

**철학 (첫 문단):** 이 문서는 Loom **relay WebSocket 와이어(protocol v1)** 만 다룬다 — room·handoff·inbox·presence의 봉투와 라우팅. **herdr 로컬 소켓 RPC**(agent/pane/tab)는 이 파일의 범위가 아니며, as-built 정본은 [`docs/spikes/HERDR-0.7.5-COMPAT.md`](./spikes/HERDR-0.7.5-COMPAT.md)다. 이름을 섞어 쓰지 않는다.

**As-built pin:** product / PLAN **v0.29.0** (2026-10-15) — this file documents **relay WebSocket wire only**; wire remains **v1** (`PROTOCOL_VERSION` unchanged through 0.29.x — v0.29.0 adds optional fields only, see [Room event identity](#room-event-identity-v0290) and [Idempotent send](#idempotent-send-clienteventid-v0290)).

Wire Version: **1** (`v: 1` on every envelope) — not product SemVer; historical origin: M1.1 + M-7 + Loom rename under PLAN 0.9.0

Default relay: `ws://127.0.0.1:7842/ws`  
HTTP health: `GET /health` (always open)  
Room list: `GET /rooms` (requires token if server set `LOOM_RELAY_TOKEN`)  
WebSocket: `GET /ws` or `/` upgrade — `?token=` or `Authorization: Bearer` when auth enabled  

Remote clients:

```
LOOM_RELAY_URL=ws://host:7842
LOOM_RELAY_TOKEN=secret
# or: loom --relay ws://host:7842 --token secret room join …
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
| `handoff` | `handoff.{to,body,mode?,attachments?}`, optional `clientEventId` (v0.29.0) | Enqueue + notify if online |
| `chat` | `text`, optional `clientEventId` (v0.29.0) | Broadcast to online peers |
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

## Room event identity (v0.29.0)

Every envelope may carry two optional **relay-issued** fields on `BaseEnvelope`. Both are optional — old clients ignore them, old relays never send them.

| Field | Shape | Contract |
|-------|-------|----------|
| `eventId` | `ev_` + non-empty suffix (relay uses `ev_<uuid>`) | Stable identity of one **logical** room event. Fan-out copies (broadcast to many peers, multi-target handoff) share the **same** `eventId`/`seq`. |
| `seq` | positive integer, from 1 | Per **(relay, room)** strictly increasing within a relay process; never decreases across a durable relay restart (gaps allowed). **Not** the conv/card `seq` — different axis. |

**Stamped (room events):** `chat` · `peer.join` · `peer.leave` · `peer.presence` · `handoff` (live push).
**Not stamped (RPC replies):** `handoff.ack` · `room.state` · `inbox.state` · `inbox.claim_result` · `error` — request/reply correlation stays on `requestId`.

- **Relay authority.** A client-supplied `eventId`/`seq` is always overwritten/removed by the relay (same rule as handoff `id`, M-9). Clients cannot assert event identity or order.
- **Durable seq (block reservation).** The room snapshot (`relay-state/<sha16>.json`) gains optional `seqHigh`, an **exclusive** bound: every issued `seq < seqHigh`. When the next seq reaches `seqHigh`, the relay first persists `seqHigh = seq + K` (K = `SEQ_RESERVE_BLOCK`, 1000) and only then stamps. A reload resumes at `seqHigh`, so no seq is reissued after a relay-process crash. `ROOM_SNAPSHOT_VERSION` stays **1**; a snapshot without `seqHigh` starts at 1.
- **Reservation failure = legacy pass-through.** If persisting the reservation fails, `seqHigh` does not advance (the consumed seq is skipped, never reissued) and that broadcast goes out **unstamped** (no `eventId`/`seq`, exactly like a pre-0.29 relay) — counter + one stderr line; the broadcast path never throws. A handoff push whose reservation fails aborts before enqueue, like any `routeHandoff` persist failure (nothing routed, nothing recorded).
- **Ephemeral relays / reset state** restart seq at 1. Receivers therefore dedupe on `eventId` only; `seq` is for gap/regression observation, never a drop key.
- **Client receive store (opt-in, host side).** A `RelayClient` constructed with an event store (bridge = consumer `bridge`) dedupes stamped events durably and appends the raw envelope to `loomDir()/rooms/<sha256(roomId)[:16]>/events/YYYY-MM.jsonl` (UTC month, mode 0600, fsync per append). **The log is unredacted plaintext** (chat and handoff bodies) and local-only — no upload path. Envelopes without `eventId` (old relay) and the client's synthetic reconnect `system` chat are neither deduped nor logged. Offline handoffs recovered via `inbox.state`/`inbox.claim_result` are not in this log.

## Idempotent send — `clientEventId` (v0.29.0)

`chat` and `handoff` requests may carry `clientEventId` — a client-chosen **UUID, ≤ 64 chars**. Clients mint it once per logical send and reuse it on retries (e.g. sticky RPC timeout → one-shot fallback).

- **Scope.** The relay dedupes per **(room, relay-authenticated `peerId`, `clientEventId`)** — the key uses the authenticated socket peer, not a client-claimed `from`. Another peer sending the same value is **not** suppressed and cannot obtain the original result.
- **Bounded LRU.** 256 entries per peer (`CLIENT_EVENT_LRU_MAX`). Handoff entries are persisted in the room snapshot (optional `handoffClientEvents`, recorded only after the routing persist succeeds); chat entries are memory-only. A peer's entries are pruned when that peer is removed from the roster (explicit `leave`).
- **Repeat handoff** → no re-routing; the relay replies with the **original `handoff.ack` body** (same handoff `id`/status/ts) carrying the **retry's `requestId`**, so the retrying client's waiter matches.
- **Repeat chat** → absorbed silently, not re-broadcast (chat has no reply envelope).
- **Same `clientEventId`, different body** → still the original result; no new error code. The relay counts the body-hash mismatch and logs one stderr line.
- A `routeHandoff` whose persist rolled back records nothing, so a legitimate retry routes normally. Fan-out envelopes never carry `clientEventId`.

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

## Payload caps (L-11 / L-16)

| Cap | Limit | Unit |
|-----|-------|------|
| Handoff body | 100_000 | JS string **chars** (not bytes) |
| Attachment content | 256_000 | JS string **chars** |
| Attachments per handoff | 32 | count |
| Inbox entries per peer | 100 | count (trim oldest) |

Zod + relay `resolveHandoff` enforce these. Docs previously said “256KB”; the implementation measures **character length**.
