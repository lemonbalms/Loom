import {
  PROTOCOL_VERSION,
  safeParseEnvelope,
  type AgentKind,
  type Envelope,
  type HandoffPayload,
  type InboxEntry,
  type PeerInfo,
  generateId,
  envTokenInQuery,
} from "@loom/protocol";

export type JoinCredentials = {
  inviteCode: string;
  displayName: string;
  agentKind?: AgentKind;
  peerId?: string;
  color?: string;
  /** M-7: rejoin secret for this peerId */
  peerSecret?: string;
};

export type RelayClientOptions = {
  /** WebSocket URL without secret (H-6). Token goes in Authorization header. */
  url: string;
  /** Shared secret — sent as Authorization: Bearer (preferred over ?token=). */
  token?: string;
  onEnvelope?: (env: Envelope) => void;
  onClose?: () => void;
  onError?: (err: Error) => void;
  /** Phase 3: auto re-join after disconnect (listen/run) */
  autoReconnect?: boolean;
  /** Used when autoReconnect re-joins */
  reconnectJoin?: JoinCredentials;
  maxReconnectAttempts?: number;
};

type PendingRequest = {
  match: (e: Envelope) => boolean;
  resolve: (e: Envelope) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export class RelayClient {
  private ws: WebSocket | null = null;
  private opts: RelayClientOptions;
  private openPromise: Promise<void> | null = null;
  private intentionalClose = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * L-4: FIFO waiters for in-flight requestOnce. Avoids hijacking onEnvelope
   * (which stole acks under concurrent requests). Full wire correlation ids
   * deferred — see implementation-notes.
   */
  private pendingRequests: PendingRequest[] = [];

  peerId: string | null = null;
  peerSecret: string | null = null;
  /** Keep auto-reconnect join credentials in sync after room.state issues secret (L-15). */
  setReconnectPeerSecret(secret: string): void {
    this.peerSecret = secret;
    if (this.opts.reconnectJoin) {
      this.opts.reconnectJoin = {
        ...this.opts.reconnectJoin,
        peerSecret: secret,
      };
    }
  }
  roomId: string | null = null;
  roomName: string | null = null;
  inviteCode: string | null = null;
  peers: PeerInfo[] = [];
  color: string | null = null;
  lastHandoffAck: Extract<Envelope, { type: "handoff.ack" }> | null = null;
  lastInbox: InboxEntry[] = [];
  lastClaimResult: Extract<Envelope, { type: "inbox.claim_result" }> | null =
    null;

  constructor(opts: RelayClientOptions) {
    this.opts = opts;
  }

  /** True when the WebSocket is open (sticky host status). */
  get wsOpen(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  setReconnectJoin(creds: JoinCredentials): void {
    this.opts.reconnectJoin = creds;
    this.opts.autoReconnect = true;
  }

  connect(): Promise<void> {
    if (this.openPromise) return this.openPromise;
    this.intentionalClose = false;
    this.openPromise = new Promise((resolve, reject) => {
      // H-6: Bearer header preferred; keep URL free of secrets.
      // Query fallback only if LOOM_RELAY_TOKEN_IN_QUERY=1 (legacy proxies).
      let connectUrl = this.opts.url.split("?")[0]!;
      const token = this.opts.token;
      const forceQuery = envTokenInQuery();
      if (token && forceQuery) {
        const sep = connectUrl.includes("?") ? "&" : "?";
        connectUrl = `${connectUrl}${sep}token=${encodeURIComponent(token)}`;
      }
      const headers =
        token && !forceQuery
          ? { Authorization: `Bearer ${token}` }
          : undefined;
      const ws = headers
        ? new WebSocket(connectUrl, { headers })
        : new WebSocket(connectUrl);
      this.ws = ws;
      let settled = false;
      ws.onopen = () => {
        settled = true;
        this.reconnectAttempt = 0;
        resolve();
      };
      ws.onerror = () => {
        const err = new Error(`WebSocket error connecting to ${connectUrl}`);
        this.opts.onError?.(err);
        if (!settled) {
          settled = true;
          reject(err);
        }
      };
      ws.onclose = () => {
        this.openPromise = null;
        this.ws = null;
        this.opts.onClose?.();
        if (!this.intentionalClose && this.opts.autoReconnect) {
          this.scheduleReconnect();
        }
      };
      ws.onmessage = (ev) => {
        let data: unknown;
        try {
          data = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        const parsed = safeParseEnvelope(data);
        if (!parsed.success) return;
        const env = parsed.data;
        this.applyEnvelope(env);
        this.dispatchPending(env);
        this.opts.onEnvelope?.(env);
      };
    });
    return this.openPromise;
  }

  /** Resolve at most one FIFO waiter that matches this envelope. */
  private dispatchPending(env: Envelope): void {
    const idx = this.pendingRequests.findIndex((p) => p.match(env));
    if (idx < 0) return;
    const [pending] = this.pendingRequests.splice(idx, 1);
    if (!pending) return;
    clearTimeout(pending.timer);
    pending.resolve(env);
  }

  private scheduleReconnect(): void {
    const max = this.opts.maxReconnectAttempts ?? 20;
    if (this.reconnectAttempt >= max) {
      this.opts.onError?.(
        new Error(`Reconnect gave up after ${max} attempts`),
      );
      return;
    }
    const delay = Math.min(1000 * 2 ** this.reconnectAttempt, 15000);
    this.reconnectAttempt += 1;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      void this.reconnectNow();
    }, delay);
  }

  private async reconnectNow(): Promise<void> {
    try {
      await this.connect();
      const creds = this.opts.reconnectJoin;
      if (creds) {
        const env = await this.joinRoom({
          ...creds,
          peerId: creds.peerId ?? this.peerId ?? undefined,
          color: creds.color ?? this.color ?? undefined,
        });
        if (env.type === "error") {
          this.opts.onError?.(new Error(env.message));
        } else {
          this.opts.onEnvelope?.({
            v: PROTOCOL_VERSION,
            type: "chat",
            roomId: this.roomId ?? "none",
            ts: new Date().toISOString(),
            from: "system",
            text: `reconnected (attempt ${this.reconnectAttempt})`,
          });
        }
      }
    } catch (e) {
      this.opts.onError?.(
        e instanceof Error ? e : new Error(String(e)),
      );
      if (!this.intentionalClose && this.opts.autoReconnect) {
        this.scheduleReconnect();
      }
    }
  }

  private applyEnvelope(env: Envelope): void {
    switch (env.type) {
      case "room.state":
        this.roomId = env.roomId;
        this.peers = env.peers;
        this.roomName = env.roomName ?? this.roomName;
        this.inviteCode = env.inviteCode ?? this.inviteCode;
        if (env.peerSecret) {
          this.setReconnectPeerSecret(env.peerSecret);
        }
        if (this.peerId) {
          const me = env.peers.find((p) => p.id === this.peerId);
          if (me) this.color = me.color;
        }
        break;
      case "peer.join":
        if (!this.peers.find((p) => p.id === env.peer.id)) {
          this.peers = [...this.peers, env.peer];
        } else {
          this.peers = this.peers.map((p) =>
            p.id === env.peer.id ? env.peer : p,
          );
        }
        break;
      case "peer.leave":
        this.peers = this.peers.filter((p) => p.id !== env.peerId);
        break;
      case "peer.presence":
        this.peers = this.peers.map((p) =>
          p.id === env.peerId ? { ...p, online: env.online } : p,
        );
        break;
      case "handoff.ack":
        this.lastHandoffAck = env;
        break;
      case "inbox.state":
        this.lastInbox = env.entries;
        break;
      case "inbox.claim_result":
        this.lastClaimResult = env;
        break;
    }
  }

  private send(obj: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected to relay");
    }
    this.ws.send(JSON.stringify(obj));
  }

  async createRoom(opts: {
    roomName: string;
    displayName: string;
    agentKind?: AgentKind;
    peerId?: string;
    color?: string;
    peerSecret?: string;
  }): Promise<Envelope> {
    await this.connect();
    const peerId = opts.peerId ?? generateId("p");
    this.peerId = peerId;
    return this.requestOnce(
      {
        type: "create",
        v: PROTOCOL_VERSION,
        roomName: opts.roomName,
        peer: {
          id: peerId,
          displayName: opts.displayName,
          agentKind: opts.agentKind ?? "unknown",
          color: opts.color,
          secret: opts.peerSecret ?? this.peerSecret ?? undefined,
        },
      },
      (e) => e.type === "room.state" || e.type === "error",
    );
  }

  async joinRoom(opts: JoinCredentials): Promise<Envelope> {
    await this.connect();
    const peerId = opts.peerId ?? this.peerId ?? generateId("p");
    this.peerId = peerId;
    const peerSecret =
      opts.peerSecret ?? this.peerSecret ?? undefined;
    this.opts.reconnectJoin = {
      ...opts,
      peerId,
      peerSecret,
    };
    return this.requestOnce(
      {
        type: "join",
        v: PROTOCOL_VERSION,
        inviteCode: opts.inviteCode,
        peer: {
          id: peerId,
          displayName: opts.displayName,
          agentKind: opts.agentKind ?? "unknown",
          color: opts.color,
          secret: peerSecret,
        },
      },
      (e) => e.type === "room.state" || e.type === "error",
    );
  }

  async handoff(partial: {
    to: string;
    body: string;
    mode?: "message" | "task";
    attachments?: HandoffPayload["attachments"];
  }): Promise<Extract<Envelope, { type: "handoff.ack" }>> {
    await this.connect();
    this.lastHandoffAck = null;
    const env = await this.requestOnce(
      {
        type: "handoff",
        v: PROTOCOL_VERSION,
        handoff: partial,
      },
      (e) => e.type === "handoff.ack" || e.type === "error",
    );
    if (env.type === "error") {
      throw new Error(env.message);
    }
    if (env.type !== "handoff.ack") {
      throw new Error("Unexpected handoff response");
    }
    return env;
  }

  async chat(text: string): Promise<void> {
    await this.connect();
    this.send({ type: "chat", v: PROTOCOL_VERSION, text });
  }

  async listPeers(): Promise<Envelope> {
    await this.connect();
    return this.requestOnce(
      { type: "list_peers", v: PROTOCOL_VERSION },
      (e) => e.type === "room.state" || e.type === "error",
    );
  }

  async listInbox(): Promise<InboxEntry[]> {
    await this.connect();
    const env = await this.requestOnce(
      { type: "list_inbox", v: PROTOCOL_VERSION },
      (e) => e.type === "inbox.state" || e.type === "error",
    );
    if (env.type === "error") throw new Error(env.message);
    if (env.type !== "inbox.state") return [];
    return env.entries;
  }

  async claimHandoff(
    id: string,
    via: "claim" | "accept" = "claim",
  ): Promise<Extract<Envelope, { type: "inbox.claim_result" }>> {
    await this.connect();
    const env = await this.requestOnce(
      {
        type: "claim_handoff",
        v: PROTOCOL_VERSION,
        id,
        via,
      },
      (e) => {
        if (e.type === "error") return true;
        if (e.type !== "inbox.claim_result") return false;
        // Prefer id match when entry present (concurrent claims)
        if (e.entry?.handoff.id) return e.entry.handoff.id === id;
        return true;
      },
    );
    if (env.type === "error") throw new Error(env.message);
    if (env.type !== "inbox.claim_result") {
      throw new Error("Unexpected claim response");
    }
    return env;
  }

  async leave(): Promise<void> {
    this.intentionalClose = true;
    this.opts.autoReconnect = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.rejectAllPending(new Error("Client leaving"));
    if (!this.ws) return;
    try {
      this.send({ type: "leave", v: PROTOCOL_VERSION });
    } catch {
      /* ignore */
    }
    this.close();
  }

  close(): void {
    this.intentionalClose = true;
    this.opts.autoReconnect = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.rejectAllPending(new Error("Client closed"));
    if (this.ws) {
      try {
        this.ws.onmessage = null;
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.close();
      } catch {
        /* ignore */
      }
    }
    this.ws = null;
    this.openPromise = null;
  }

  private rejectAllPending(err: Error): void {
    const pending = this.pendingRequests.splice(0);
    for (const p of pending) {
      clearTimeout(p.timer);
      p.reject(err);
    }
  }

  /**
   * L-4: register a FIFO waiter without replacing opts.onEnvelope.
   * User onEnvelope always receives every envelope; waiters take matching replies.
   */
  private requestOnce(
    msg: unknown,
    match: (e: Envelope) => boolean,
    timeoutMs = 8000,
  ): Promise<Envelope> {
    return new Promise((resolve, reject) => {
      const entry: PendingRequest = {
        match,
        resolve,
        reject,
        timer: setTimeout(() => {
          const i = this.pendingRequests.indexOf(entry);
          if (i >= 0) this.pendingRequests.splice(i, 1);
          reject(new Error("Relay request timed out"));
        }, timeoutMs),
      };
      this.pendingRequests.push(entry);

      try {
        this.send(msg);
      } catch (e) {
        const i = this.pendingRequests.indexOf(entry);
        if (i >= 0) this.pendingRequests.splice(i, 1);
        clearTimeout(entry.timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }
}
