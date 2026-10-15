# Protocol

**철학 (첫 문단):** 이 문서는 Loom **relay WebSocket 와이어(protocol v1)** 만 다룬다 — room·handoff·inbox·presence의 봉투와 라우팅. **herdr 로컬 소켓 RPC**(agent/pane/tab)는 이 파일의 범위가 아니며, as-built 정본은 [`docs/spikes/HERDR-0.7.5-COMPAT.md`](./spikes/HERDR-0.7.5-COMPAT.md)다. 이름을 섞어 쓰지 않는다.

**As-built pin:** product / PLAN **v0.33.0** (2026-10-16) — this file documents **relay WebSocket wire only**; wire remains **v1** (`PROTOCOL_VERSION` unchanged through 0.33.x — v0.29.0 adds optional fields only, see [Room event identity](#room-event-identity-v0290) and [Idempotent send](#idempotent-send-clienteventid-v0290); v0.30.0, v0.31.0, v0.32.0 and v0.33.0 change **no** wire field, see [Headless card workers](#headless-card-workers-v0300--wire-unchanged), [Skills and policy](#skills-and-policy-v0310--wire-unchanged), [Loom MCP pre-check](#loom-mcp-pre-check-v0320--wire-unchanged) and [Bridge lifecycle](#bridge-lifecycle-v0330--wire-unchanged)).

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
- **Client receive store (opt-in, host side).** A `RelayClient` constructed with an event store (bridge = consumer `bridge:<peerId>` — per peer, since profiles on one machine share `loomDir()`) dedupes stamped events durably and appends the raw envelope to `loomDir()/rooms/<sha256(roomId)[:16]>/events/YYYY-MM.jsonl` (UTC month, mode 0600, fsync per append). **The log is unredacted plaintext** (chat and handoff bodies) and local-only — no upload path. Envelopes without `eventId` (old relay) and the client's synthetic reconnect `system` chat are neither deduped nor logged. Offline handoffs recovered via `inbox.state`/`inbox.claim_result` are not in this log. The log has **no rotation or retention** yet (monthly files grow with handoff volume). Guarantees are **at-most-once per consumer**: a crash between the durable seen write and delivery drops that delivery.

## Idempotent send — `clientEventId` (v0.29.0)

`chat` and `handoff` requests may carry `clientEventId` — a client-chosen **UUID, ≤ 64 chars**. Clients mint it once per logical send and reuse it on retries (e.g. sticky RPC timeout → one-shot fallback).

- **Scope.** The relay dedupes per **(room, relay-authenticated `peerId`, `clientEventId`)** — the key uses the authenticated socket peer, not a client-claimed `from`. Another peer sending the same value is **not** suppressed and cannot obtain the original result.
- **Bounded LRU.** 256 entries per peer (`CLIENT_EVENT_LRU_MAX`). Handoff entries are persisted in the room snapshot (optional `handoffClientEvents`, recorded only after the routing persist succeeds); chat entries are memory-only. A peer's entries are pruned when that peer is removed from the roster (explicit `leave`).
- **Repeat handoff** → no re-routing; the relay replies with the **original `handoff.ack` body** (same handoff `id`/status/ts) carrying the **retry's `requestId`**, so the retrying client's waiter matches.
- **Repeat chat** → absorbed silently, not re-broadcast (chat has no reply envelope).
- **Same `clientEventId`, different body** → still the original result; no new error code. The relay counts the body-hash mismatch and logs one stderr line.
- A `routeHandoff` whose persist rolled back records nothing, so a legitimate retry routes normally. Fan-out envelopes never carry `clientEventId`.

## Headless card workers (v0.30.0) — wire unchanged

v0.30.0 adds a bridge-local **headless** worker backend (opt-in `worker.backend: "headless"`, default `pane`; user-facing config in [`USER_GUIDE.md`](./USER_GUIDE.md) §15). It changes how a bridge **runs** a card, not what crosses the relay:

- **No new envelope, field, or version.** `CardDispatchPayload` / `CardResultPayload` gain **0 fields**; `PROTOCOL_VERSION` and `CARD_CONTRACT_VERSION` are unchanged. The dispatch still never carries argv, executable, or permission mode — those come only from the bridge's local config.
- **Same result payload, same completion authority.** Headless results go through the same result core (issuer · strict ACK · quarantine) as pane results and propose only `status: "failed"` with `reason: "needs_verification"` (or an existing-style reason string ≤200, e.g. `timeout`, `card_already_running`, `cwd_not_allowed`, `spawn_state_unknown`, `liveness_unknown`). The tower still lands them as `blocked`. `paneId` is omitted.
- **`output`** = the CLI's final text verbatim (no TUI stripping), ≤ **200,000** chars; longer text keeps the **tail** with `truncated: true` and `note` naming the local transcript path + byte count.
- **Serialize-budget cut (both backends).** If the serialized result attachment would exceed the **256,000**-char attachment cap (JSON escaping of `\r\n` / `"` can inflate a 200k output), the core cuts `output` from the **front** (surrogate-safe, repeated until it fits) and sets `truncated: true`; if nothing fits, `output` is `""` with note `output dropped: exceeds attachment budget`. A result is never lost to a serialize throw. Outputs that already fit are unchanged.
- **`summary`** (headless) = the first non-blank line of the final text, ≤ **900** chars. `note` ≤ 500.

## Skills and policy (v0.31.0) — wire unchanged

v0.31.0 adds bridge-local `loomDir()/policy.json` (per-CLI permission compile) and room-selected skills for headless workers (opt-in `worker.skills.enabled`; user-facing config in [`USER_GUIDE.md`](./USER_GUIDE.md) §16). Nothing new crosses the relay:

- **No new envelope, field, or version.** `CardDispatchPayload` / `CardResultPayload` gain **0 fields**; `PROTOCOL_VERSION` and `CARD_CONTRACT_VERSION` are unchanged. The dispatch carries **no skill or policy field** — skill selection is only the receiving bridge's local `loomDir()/rooms/<roomKey>/skills.json`, and a peer can never send or install a skill.
- **Same result shape and completion authority** as v0.30.0: headless results are still `status: "failed"` with `reason: "needs_verification"` or an existing-style reason string; the tower lands them as `blocked`.
- **New failure causes on existing reasons (bridge-local, not wire):**
  - `reason: "spawn_setup_failed"` (no spawn; `note` = the error, ≤500 chars) now also covers: an invalid or symlinked room `skills.json`, a symlink inside the card-directory chain, a skill-copy write failure, and a skill listing refused because a SKILL.md path or description carries control characters or the folded dispatched-task marker letters.
  - `reason: "needs_verification"`, `note: "fingerprint_changed; not resuming"` now also fires when the policy hash, the argv template version (`0.31.0-v1`), or the card's skill copy no longer matches the session record — on recovery, on **every** adoption (including normal-dispatch adoption), and before a skills-enabled resume. A live worker is not killed; its result is pre-empted.
  - `note` denial prefix is unchanged: `denials: N (<tool names>)` — tool names only, no command text.
- **Startup refusal, not a result:** an invalid `policy.json`, a deprecated bridge-config allow list next to `policy.json` `shell.allow`, or a deprecated no-space `p*` deny (other than the three verbatim 0.30.0 defaults, accepted with a warning) makes the headless bridge refuse to start; no result is sent.

## Loom MCP pre-check (v0.32.0) — wire unchanged

v0.32.0 adds a policy gate inside the local Loom MCP server (`packages/mcp-server`) — `policy.json` `loomTools` (`done`, `denyModes`), `mcp.deny` `loom__<tool>`, strict tool arguments — plus a per-room local `policy-audit.jsonl` and an advisory L-2 check in `apply_card_result` (user-facing in [`USER_GUIDE.md`](./USER_GUIDE.md) §17). Nothing new crosses the relay:

- **No new envelope, field, or version.** `PROTOCOL_VERSION` and `CARD_CONTRACT_VERSION` are unchanged; `CardDispatchPayload` / `CardResultPayload` gain **0 fields**. A pre-check refusal is an MCP tool result (`isError: true`) to the local agent, never a relay message.
- **Local-only board fields.** `dispatchPeerId` (the dispatch target's peer id, pinned only when the tower's peer list had exactly one canonical name match before and after the send) and `l2Mismatch` (set when a result's `fromPeerId` differs from that pin) live **only in the local board file**. Both are stripped from every board snapshot (`export_board`, `--with-board` / `withBoard` handoff attachments, imports); `dispatchPeerId` is also stripped from MCP and sticky `/rpc` output. Dispatch routing is unchanged (`to: "@<node>"`, no peer id).
- **Same completion authority.** An L-2 mismatch never rejects: the result lands `blocked` exactly as in v0.31.0 (notes byte-identical), with the local flag and audit record added.
- **Audit stays local.** `loomDir()/rooms/<roomKey>/policy-audit.jsonl` shares the room directory with the v0.29.0 room event log but is a separate file; it never carries relay `seq`/`eventId` and is never sent.

## Bridge lifecycle (v0.33.0) — wire unchanged

v0.33.0 gives the per-profile bridge a lifecycle — profile lock, status file + heartbeat, graceful SIGTERM/SIGINT stop, `drain`, headless start without herdr (user-facing in [`USER_GUIDE.md`](./USER_GUIDE.md) §18). Nothing new crosses the relay:

- **No new envelope, field, or version.** `PROTOCOL_VERSION` and `CARD_CONTRACT_VERSION` are unchanged; card and conv payload schemas gain **0 fields**.
- **`drain` is bridge-local.** It is an op on the bridge's own `127.0.0.1` `/rpc` control plane (bearer token, same trust as `stop` / `status`), not a relay message. While draining the bridge simply does not claim new handoffs — they stay in the relay inbox unchanged.
- **Headless conv.open reject uses the existing schema.** A `worker.backend:"headless"` bridge answers conv.open once with the existing conv reject attachment (`ConvRejectPayloadSchema`, `reason: string`); the only new thing is the reason string `conv_unavailable_headless`. No new label, no new field.
- **Status file / lock are local files** under `loomDir()/bridge/` (`<profile>.status.json`, `<profile>.lock/owner.json`); they never carry tokens and are never sent.

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
