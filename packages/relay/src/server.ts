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
import { RoomRegistry, type SocketLike } from "./room";

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

export class RelayServer {
  readonly registry: RoomRegistry;
  readonly host: string;
  readonly port: number;
  readonly authToken?: string;
  readonly allowInsecureOpen: boolean;
  private server: ReturnType<typeof Bun.serve> | null = null;
  private clients = new WeakMap<object, ClientState>();

  constructor(opts: RelayServerOptions = {}) {
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

    const self = this;
    this.server = Bun.serve({
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
          self.handleMessage(state, data);
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
        const result = room.routeHandoff(handoff);
        this.reply(
          state,
          room.handoffAckEnvelope(result) as unknown as Record<string, unknown>,
          rid,
        );
        break;
      }
      case "chat": {
        if (!state.peerId || !state.roomId) {
          this.sendNotInRoom(state, rid);
          return;
        }
        const room = this.registry.getById(state.roomId);
        if (!room) return;
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
        break;
      }
      case "leave": {
        if (!state.peerId || !state.roomId) return;
        const room = this.registry.getById(state.roomId);
        if (!room) return;
        room.removePeer(state.peerId);
        room.broadcast(room.peerLeaveEnvelope(state.peerId));
        this.registry.maybeGc(room);
        state.peerId = undefined;
        state.roomId = undefined;
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
