# Fable relay (remote / cloud)

Phase 3 / **0.3.1**: run the same `@loom/relay` process bound for LAN or a VPS.

## Quick start (LAN)

**Host machine** — non-loopback bind **requires** a token (H-5). Without token the process exits.

```bash
cd fable-advisor
LOOM_RELAY_HOST=0.0.0.0 \
LOOM_RELAY_PORT=7842 \
LOOM_RELAY_TOKEN=pick-a-long-secret \
  bun run loom relay
```

Or:

```bash
bun run loom relay --host 0.0.0.0 --port 7842 --token pick-a-long-secret
```

Intentional open LAN (not recommended):

```bash
bun run loom relay --host 0.0.0.0 --insecure-open
# or LOOM_RELAY_INSECURE_OPEN=1
```

**Client machines**

```bash
export LOOM_RELAY_URL=ws://HOST_IP:7842
export LOOM_RELAY_TOKEN=pick-a-long-secret

bun run loom --profile alice room create --name sprint --as alice
# Share line omits token by default; pass --token on join (or create with --show-token)

bun run loom --profile bob --relay ws://HOST_IP:7842 --token pick-a-long-secret \
  room join LOOM-XXXX --as bob
```

## Auth

| Setting | Effect |
|---------|--------|
| `LOOM_RELAY_TOKEN` unset + loopback | Open relay (localhost demos OK) |
| `LOOM_RELAY_TOKEN` unset + `0.0.0.0` / LAN | **Refuse start** unless `--insecure-open` (H-5) |
| token set | `Authorization: Bearer` **preferred**; `?token=` fallback |
| Clients | Token via `--token` / `LOOM_RELAY_TOKEN`; session stores `relayToken` separate from `relayUrl` (mode 0600) |

Room isolation is still invite-code based. Token protects the **server**, not individual rooms.

### Threat model (0.8.0 / M-7)

| Asset | Who can access | Mitigation |
|-------|----------------|------------|
| Relay process (create rooms, WS) | Shared `LOOM_RELAY_TOKEN` holders | H-5 refuse open non-loopback; Bearer preferred (H-6) |
| Room membership (new peer) | Token + valid **invite code** | Invite not guessable (`LOOM-…`) |
| **Existing peer identity / inbox** | Token + invite + **`peerSecret`** | Relay mints secret on first join; rejoin requires timing-safe match; wrong secret → `peer_auth_failed` |
| `peerSecret` on disk | Local session file | mode **0600**; never put in Share lines or logs |
| Other peers learning secrets | — | `peerSecret` only on joining socket’s `room.state`, not roster broadcast |

**Residual risk:** lost session ⇒ cannot reclaim that `peerId` (join as new id). Token holders can still spam rooms / create peers (rate limit later). Do not put tokens or peer secrets in reverse-proxy access logs; prefer Bearer over query string.

## TLS (production)

Terminate TLS in front of the relay (Caddy / nginx / Fly / Cloudflare):

```
wss://relay.example.com/ws  →  ws://127.0.0.1:7842/ws
```

Forward `Authorization` if clients use Bearer. Avoid logging query strings if any client still uses `?token=`.

Clients:

```bash
LOOM_RELAY_URL=wss://relay.example.com LOOM_RELAY_TOKEN=… loom room join …
```

## Health

```bash
curl http://HOST:7842/health
# {"ok":true,"rooms":N,"auth":true,"version":1}
```

## Notes

- Inbox is **in-memory** (room process lifetime). Process restart clears rooms/inbox.
- `loom listen` / `loom run` auto-reconnect after brief network drops (stale close does not mark reconnected peers offline — M-6).
- Legacy: `LOOM_RELAY_TOKEN_IN_QUERY=1` forces clients to put the token in the WS URL (not recommended).
