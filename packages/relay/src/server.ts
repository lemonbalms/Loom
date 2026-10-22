import {
  DEFAULT_RELAY_HOST,
  DEFAULT_RELAY_PORT,
  PROTOCOL_VERSION,
  safeParseClientMessage,
  type PeerInfo,
  generateId,
  sanitizePeerName,
  makeEnvelopeBase,
  nowIso,
  timingSafeTokenEqual,
  envRelayToken,
} from "@loom/protocol";
import {
  RoomRegistry,
  type SocketLike,
  chatClientEventMaterial,
  clientEventBodyHash,
  handoffClientEventMaterial,
} from "./room";
import { isIP } from "node:net";
import { networkInterfaces } from "node:os";

// L-14: re-export shared constant-time compare (impl lives in @loom/protocol)
export { timingSafeTokenEqual };

export type RelayServerOptions = {
  host?: string;
  port?: number;
  registry?: RoomRegistry;
  /**
   * Shared secret. When set, WS/HTTP must present matching token
   * via Authorization: Bearer (preferred) or ?token= (fallback).
   */
  authToken?: string;
  /**
   * H-5: allow non-loopback bind without authToken.
   * Prefer setting a token; this is for intentional open-LAN demos only.
   */
  allowInsecureOpen?: boolean;
  /**
   * @internal v0.45.2 test seam — interface list consulted when bind fails.
   * Production uses `os.networkInterfaces`.
   */
  interfaces?: () => ReturnType<typeof networkInterfaces>;
  /**
   * @internal v0.45.2 P1d test seam — kernel probe run when bind fails.
   * True = bound `host` on port 0 and released it; false = could not bind.
   * Production uses a real `Bun.serve` probe.
   */
  probeBind?: (host: string) => boolean;
};

type ClientState = {
  peerId?: string;
  roomId?: string;
  socket: SocketLike;
};

/** Loopback hosts may run open (no token). Everything else requires auth. */
export function isLoopbackHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  return h === "127.0.0.1" || h === "localhost" || h === "::1";
}

/**
 * Canonical literal IP, or null for a hostname. Strips brackets and `%zone`;
 * IPv6 goes through the WHATWG URL parser so equivalent forms compare equal
 * (`2001:0db8::1` → `2001:db8::1`, `0:0:0:0:0:0:0:0` → `::`). IPv4-mapped
 * IPv6 becomes the dotted IPv4 it encodes (`::ffff:7f00:1` → `127.0.0.1`).
 * May throw.
 */
function canonicalLiteralIp(addr: string): string | null {
  const h = addr
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/%.*$/, "");
  const family = isIP(h);
  if (family === 4) return h;
  if (family !== 6) return null;
  const v6 = new URL(`http://[${h}]/`).hostname.slice(1, -1);
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(v6);
  if (mapped === null) return v6;
  const hi = Number.parseInt(mapped[1] as string, 16);
  const lo = Number.parseInt(mapped[2] as string, 16);
  return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join(".");
}

/**
 * Canonical `host` when it is a non-wildcard literal IP — the only hosts whose
 * bind failure warrants a probe + interface check. Loopback needs no special
 * case: the probe binds it, so the original error stands (P1d).
 */
function bindCheckCandidate(host: string): string | null {
  const h = canonicalLiteralIp(host);
  if (h === null) return null;
  if (h === "0.0.0.0" || h === "::") return null;
  return h;
}

/**
 * P1d kernel probe: can `host` be bound at all (port 0)? True when the bind
 * succeeds — the address is assigned, so the original failure was a port
 * conflict. The probe listener is always released; a failing stop is ignored.
 */
function realProbeBind(host: string): boolean {
  let probe: ReturnType<typeof Bun.serve>;
  try {
    probe = Bun.serve({
      hostname: host,
      port: 0,
      fetch: () => new Response(null, { status: 503 }),
    });
  } catch {
    return false;
  }
  try {
    probe.stop(true);
  } catch {
    // ignore — the probe already proved the address is bindable
  }
  return true;
}

function hasAddress(
  ifaces: ReturnType<typeof networkInterfaces>,
  canonical: string,
): boolean {
  for (const list of Object.values(ifaces)) {
    for (const info of list ?? []) {
      if (canonicalLiteralIp(info.address) === canonical) return true;
    }
  }
  return false;
}

/**
 * @internal v0.45.2: Bun reports EADDRINUSE ("Is port N in use?") both for a
 * real port conflict and for a hostname not assigned to any local interface.
 * True when `host` is a non-wildcard literal IP absent from `ifaces` (the
 * interface half of the P1d decision; `start()` also requires a failed probe).
 * Anything not classifiable (canonicalisation throws) → false.
 */
export function isUnassignedLiteralIp(
  host: string,
  ifaces: ReturnType<typeof networkInterfaces>,
): boolean {
  try {
    const h = bindCheckCandidate(host);
    return h !== null && !hasAddress(ifaces, h);
  } catch {
    return false;
  }
}

export class RelayServer {
  readonly registry: RoomRegistry;
  readonly host: string;
  readonly port: number;
  readonly authToken?: string;
  readonly allowInsecureOpen: boolean;
  private server: ReturnType<typeof Bun.serve> | null = null;
  private clients = new WeakMap<object, ClientState>();
  /** v0.29.0: same clientEventId, different body. Fail-visible, no wire code. */
  private clientEventBodyMismatches = 0;
  private readonly interfaces: () => ReturnType<typeof networkInterfaces>;
  private readonly probeBind: (host: string) => boolean;

  constructor(opts: RelayServerOptions = {}) {
    this.interfaces = opts.interfaces ?? networkInterfaces;
    this.probeBind = opts.probeBind ?? realProbeBind;
    this.host = opts.host ?? DEFAULT_RELAY_HOST;
    this.port = opts.port ?? DEFAULT_RELAY_PORT;
    this.registry = opts.registry ?? new RoomRegistry();
    this.authToken = opts.authToken || envRelayToken() || undefined;
    // RN1: do NOT dual-read FABLE_RELAY_INSECURE_OPEN (H-5)
    this.allowInsecureOpen =
      opts.allowInsecureOpen === true ||
      process.env.LOOM_RELAY_INSECURE_OPEN === "1" ||
      process.env.LOOM_RELAY_INSECURE_OPEN === "true";
  }

  /** WebSocket base URL — never embeds the token (H-6). */
  get url(): string {
    return `ws://${this.host}:${this.port}/ws`;
  }

  get publicHint(): string {
    const auth = this.authToken
      ? " (token auth on)"
      : " (open — set LOOM_RELAY_TOKEN for remote)";
    return `ws://${this.host}:${this.port}/ws${auth}`;
  }

  /**
   * H-5: refuse non-loopback open bind unless allowInsecureOpen.
   * Call before listen; throws Error with actionable message.
   */
  assertBindAllowed(): void {
    if (this.authToken) return;
    if (isLoopbackHost(this.host)) return;
    if (this.allowInsecureOpen) return;
    throw new Error(
      `Refusing to bind ${this.host}:${this.port} without a token.\n` +
        `  Set LOOM_RELAY_TOKEN / --token, or pass --insecure-open for intentional open LAN.\n` +
        `  Loopback (127.0.0.1) may run without a token.`,
    );
  }

  start(): void {
    if (this.server) return;
    this.assertBindAllowed();

    try {
      this.server = this.serve();
    } catch (e) {
      // P1d: literal non-wildcard IP + kernel probe on port 0 fails + absent
      // from the interface list. Any failure along the way (classifier,
      // probe, interfaces) must never replace the original bind error.
      let unassigned = false;
      try {
        const h = bindCheckCandidate(this.host);
        unassigned =
          h !== null &&
          !this.probeBind(this.host) &&
          !hasAddress(this.interfaces(), h);
      } catch {
        throw e;
      }
      if (unassigned) {
        throw new Error(
          `Cannot listen on ${this.host}:${this.port} — ${this.host} is not assigned to any network interface on this machine (yet). If it is a Tailscale/VPN address, the interface may still be coming up; a service manager restart will retry. (not a port conflict)`,
          { cause: e },
        );
      }
      throw e;
    }
  }

  private serve(): ReturnType<typeof Bun.serve> {
    const self = this;
    return Bun.serve({
      hostname: this.host,
      port: this.port,
      fetch(req, server) {
        const url = new URL(req.url);

        if (url.pathname === "/health") {
          return new Response(
            JSON.stringify({
              ok: true,
              rooms: self.registry.listRooms().length,
              auth: Boolean(self.authToken),
              version: PROTOCOL_VERSION,
            }),
            { headers: { "content-type": "application/json" } },
          );
        }
        if (url.pathname === "/rooms") {
          if (!self.authorizeHttp(req, url)) {
            return new Response(JSON.stringify({ error: "unauthorized" }), {
              status: 401,
              headers: { "content-type": "application/json" },
            });
          }
          return new Response(JSON.stringify(self.registry.listRooms()), {
            headers: { "content-type": "application/json" },
          });
        }
        if (url.pathname === "/ws" || url.pathname === "/") {
          if (!self.authorizeHttp(req, url)) {
            return new Response("Unauthorized", { status: 401 });
          }
          const upgraded = server.upgrade(req, { data: {} });
          if (upgraded) return undefined;
          return new Response("Expected WebSocket", { status: 400 });
        }
        return new Response(
          "Loom Relay\nPhase 3 remote-ready. GET /health  WS /ws\n",
          { status: 200 },
        );
      },
      websocket: {
        open(ws) {
          const state: ClientState = {
            socket: {
              send: (data: string) => {
                try {
                  ws.send(data);
                } catch {
                  /* closed */
                }
              },
              close: () => ws.close(),
            },
          };
          self.clients.set(ws, state);
        },
        message(ws, message) {
          const state = self.clients.get(ws);
          if (!state) return;
          let data: unknown;
          try {
            data = JSON.parse(String(message));
          } catch {
            state.socket.send(
              JSON.stringify({
                v: PROTOCOL_VERSION,
                type: "error",
                roomId: state.roomId ?? "none",
                ts: nowIso(),
                code: "bad_json",
                message: "Invalid JSON",
              }),
            );
            return;
          }
          try {
            self.handleMessage(state, data);
          } catch (e) {
            const msgType =
              data &&
              typeof data === "object" &&
              "type" in data &&
              typeof (data as { type: unknown }).type === "string"
                ? (data as { type: string }).type
                : undefined;
            console.error(
              "[loom relay] handler error:",
              e instanceof Error ? e.message : e,
              msgType != null ? `type=${msgType}` : "",
              state.peerId != null ? `peerId=${state.peerId}` : "",
            );
          }
        },
        close(ws) {
          const state = self.clients.get(ws);
          if (!state?.peerId || !state.roomId) return;
          const room = self.registry.getById(state.roomId);
          if (!room) return;
          // M-6: ignore stale close after reconnect attached a new socket
          const wentOffline = room.setOfflineIfSocket(
            state.peerId,
            state.socket,
          );
          if (!wentOffline) return;
          room.broadcast(
            room.peerPresenceEnvelope(state.peerId, false),
            state.peerId,
          );
        },
      },
    });
  }

  stop(): void {
    this.server?.stop(true);
    this.server = null;
  }

  /** Token from Authorization: Bearer (preferred) or ?token= (fallback). */
  authorizeHttp(req: Request, url: URL): boolean {
    if (!this.authToken) return true;
    const auth = req.headers.get("authorization") || "";
    const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (bearer && timingSafeTokenEqual(bearer, this.authToken)) return true;
    const q = url.searchParams.get("token");
    if (q && timingSafeTokenEqual(q, this.authToken)) return true;
    return false;
  }

  /** One stderr line. Counter is read into the line so it is not write-only. */
  private noteClientEventBodyMismatch(
    roomId: string,
    peerId: string,
    clientEventId: string,
  ): void {
    this.clientEventBodyMismatches += 1;
    console.error(
      `[loom relay] clientEventId body mismatch count=${this.clientEventBodyMismatches}` +
        ` room=${roomId} peer=${peerId} clientEventId=${clientEventId}`,
    );
  }

  /** L-4: echo requestId on RPC replies when client provided one. */
  private reply(
    state: ClientState,
    env: Record<string, unknown>,
    requestId?: string,
  ): void {
    const payload =
      requestId && requestId.length > 0
        ? { ...env, requestId }
        : env;
    state.socket.send(JSON.stringify(payload));
  }

  private handleMessage(state: ClientState, data: unknown): void {
    const parsed = safeParseClientMessage(data);
    if (!parsed.success) {
      this.reply(state, {
        v: PROTOCOL_VERSION,
        type: "error",
        roomId: state.roomId ?? "none",
        ts: nowIso(),
        code: "bad_message",
        message: parsed.error.message,
      });
      return;
    }

    const msg = parsed.data;
    const rid =
      "requestId" in msg && typeof msg.requestId === "string"
        ? msg.requestId
        : undefined;

    switch (msg.type) {
      case "create": {
        const room = this.registry.create(msg.roomName ?? "room");
        const added = room.addPeer(
          {
            id: msg.peer.id || generateId("p"),
            displayName: sanitizePeerName(msg.peer.displayName),
            agentKind: msg.peer.agentKind ?? "unknown",
            color: msg.peer.color,
            secret: msg.peer.secret,
          },
          state.socket,
        );
        if (!added.ok) {
          this.reply(
            state,
            {
              v: PROTOCOL_VERSION,
              type: "error",
              roomId: room.id,
              ts: nowIso(),
              code: added.code,
              message: added.message,
            },
            rid,
          );
          return;
        }
        state.peerId = added.peer.id;
        state.roomId = room.id;
        this.reply(
          state,
          room.roomStateEnvelope({ peerSecret: added.secret }) as unknown as Record<
            string,
            unknown
          >,
          rid,
        );
        break;
      }
      case "join": {
        const room = this.registry.getByCode(msg.inviteCode);
        if (!room) {
          this.reply(
            state,
            {
              v: PROTOCOL_VERSION,
              type: "error",
              roomId: "none",
              ts: nowIso(),
              code: "room_not_found",
              message: `No room for code ${msg.inviteCode}`,
            },
            rid,
          );
          return;
        }
        const wasMember = Boolean(room.getPeer(msg.peer.id));
        let added: ReturnType<typeof room.addPeer>;
        try {
          added = room.addPeer(
            {
              id: msg.peer.id || generateId("p"),
              displayName: sanitizePeerName(msg.peer.displayName),
              agentKind: msg.peer.agentKind ?? "unknown",
              color: msg.peer.color,
              secret: msg.peer.secret,
            },
            state.socket,
          );
        } catch (e) {
          this.reply(
            state,
            {
              v: PROTOCOL_VERSION,
              type: "error",
              roomId: room.id,
              ts: nowIso(),
              code: "persist_failed",
              message: e instanceof Error ? e.message : String(e),
            },
            rid,
          );
          return;
        }
        if (!added.ok) {
          this.reply(
            state,
            {
              v: PROTOCOL_VERSION,
              type: "error",
              roomId: room.id,
              ts: nowIso(),
              code: added.code,
              message: added.message,
            },
            rid,
          );
          return;
        }
        state.peerId = added.peer.id;
        state.roomId = room.id;
        this.reply(
          state,
          room.roomStateEnvelope({ peerSecret: added.secret }) as unknown as Record<
            string,
            unknown
          >,
          rid,
        );
        const inbox = room.listInbox(added.peer.id);
        if (inbox.length > 0) {
          // Unsolicited inbox push — no requestId (not the RPC reply)
          state.socket.send(
            JSON.stringify(room.inboxStateEnvelope(added.peer.id)),
          );
        }
        if (wasMember) {
          room.broadcast(
            room.peerPresenceEnvelope(added.peer.id, true),
            added.peer.id,
          );
        } else {
          room.broadcast(room.peerJoinEnvelope(added.peer), added.peer.id);
        }
        break;
      }
      case "handoff": {
        if (!state.peerId || !state.roomId) {
          this.sendNotInRoom(state, rid);
          return;
        }
        const room = this.registry.getById(state.roomId);
        if (!room) return;
        const handoff = room.resolveHandoff(state.peerId, msg.handoff);
        const idempotency =
          typeof msg.clientEventId === "string"
            ? {
                peerId: state.peerId,
                clientEventId: msg.clientEventId,
                bodyHash: clientEventBodyHash(
                  handoffClientEventMaterial(msg.handoff),
                ),
              }
            : undefined;
        try {
          const result = idempotency
            ? room.routeHandoff(handoff, idempotency)
            : room.routeHandoff(handoff);
          if (result.bodyMismatch && idempotency) {
            this.noteClientEventBodyMismatch(
              room.id,
              state.peerId,
              idempotency.clientEventId,
            );
          }
          const ack =
            result.ack ??
            result.replayAck ??
            (room.handoffAckEnvelope(result) as unknown as Record<
              string,
              unknown
            >);
          this.reply(state, ack, rid);
        } catch (e) {
          this.reply(
            state,
            {
              v: PROTOCOL_VERSION,
              type: "error",
              roomId: room.id,
              ts: nowIso(),
              code: "persist_failed",
              message: e instanceof Error ? e.message : String(e),
            },
            rid,
          );
        }
        break;
      }
      case "chat": {
        if (!state.peerId || !state.roomId) {
          this.sendNotInRoom(state, rid);
          return;
        }
        const room = this.registry.getById(state.roomId);
        if (!room) return;
        if (typeof msg.clientEventId === "string") {
          const bodyHash = clientEventBodyHash(
            chatClientEventMaterial(msg.text),
          );
          const prev = room.lookupChatClientEvent(
            state.peerId,
            msg.clientEventId,
          );
          if (prev !== undefined) {
            if (prev !== bodyHash) {
              this.noteClientEventBodyMismatch(
                room.id,
                state.peerId,
                msg.clientEventId,
              );
            }
            break;
          }
          room.broadcast(room.chatEnvelope(state.peerId, msg.text));
          room.rememberChatClientEvent(
            state.peerId,
            msg.clientEventId,
            bodyHash,
          );
          break;
        }
        room.broadcast(room.chatEnvelope(state.peerId, msg.text));
        break;
      }
      case "list_peers": {
        if (!state.roomId) {
          this.sendNotInRoom(state, rid);
          return;
        }
        const room = this.registry.getById(state.roomId);
        if (!room) return;
        this.reply(
          state,
          room.roomStateEnvelope() as unknown as Record<string, unknown>,
          rid,
        );
        break;
      }
      case "list_inbox": {
        if (!state.peerId || !state.roomId) {
          this.sendNotInRoom(state, rid);
          return;
        }
        const room = this.registry.getById(state.roomId);
        if (!room) return;
        this.reply(
          state,
          room.inboxStateEnvelope(state.peerId) as unknown as Record<
            string,
            unknown
          >,
          rid,
        );
        break;
      }
      case "claim_handoff": {
        if (!state.peerId || !state.roomId) {
          this.sendNotInRoom(state, rid);
          return;
        }
        const room = this.registry.getById(state.roomId);
        if (!room) return;
        try {
          const result = room.claimHandoff(
            state.peerId,
            msg.id,
            msg.via ?? "claim",
          );
          if (result.ok) {
            this.reply(
              state,
              {
                ...makeEnvelopeBase(room.id),
                type: "inbox.claim_result",
                ok: true,
                entry: result.entry,
              },
              rid,
            );
          } else {
            this.reply(
              state,
              {
                ...makeEnvelopeBase(room.id),
                type: "inbox.claim_result",
                ok: false,
                error: result.error,
              },
              rid,
            );
          }
        } catch (e) {
          this.reply(
            state,
            {
              ...makeEnvelopeBase(room.id),
              type: "inbox.claim_result",
              ok: false,
              error: e instanceof Error ? e.message : String(e),
            },
            rid,
          );
        }
        break;
      }
      case "leave": {
        if (!state.peerId || !state.roomId) return;
        const room = this.registry.getById(state.roomId);
        if (!room) return;
        const leaving = state.peerId;
        try {
          room.removePeer(leaving);
          room.broadcast(room.peerLeaveEnvelope(leaving));
          this.registry.maybeGc(room);
          state.peerId = undefined;
          state.roomId = undefined;
        } catch (e) {
          // Peer still in memory after rollback — stay in room
          this.reply(
            state,
            {
              v: PROTOCOL_VERSION,
              type: "error",
              roomId: room.id,
              ts: nowIso(),
              code: "persist_failed",
              message: e instanceof Error ? e.message : String(e),
            },
            rid,
          );
        }
        break;
      }
    }
  }

  private sendNotInRoom(state: ClientState, requestId?: string): void {
    this.reply(
      state,
      {
        v: PROTOCOL_VERSION,
        type: "error",
        roomId: "none",
        ts: nowIso(),
        code: "not_in_room",
        message: "Join or create a room first",
      },
      requestId,
    );
  }
}

export function draftPeer(
  displayName: string,
  agentKind: PeerInfo["agentKind"] = "unknown",
  id?: string,
): Omit<PeerInfo, "joinedAt" | "color" | "online"> & { id: string } {
  return {
    id: id ?? generateId("p"),
    displayName: sanitizePeerName(displayName),
    agentKind,
  };
}
