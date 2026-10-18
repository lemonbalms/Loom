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
import type { RoomEventStore } from "./room-event-log";

export const RECEIVE_QUEUE_WARN_DEPTH = 256;

/** v0.44.1 D1: auto-reconnect never gives up unless a caller passes a finite cap. */
export const DEFAULT_MAX_RECONNECT_ATTEMPTS = Infinity;

/** v0.44.1 D5: reconnect join refusals that retrying cannot fix. */
const RECONNECT_STOP_CODES = new Set(["peer_auth_failed", "room_not_found"]);

/**
 * v0.44.1 D2: equal jitter on the 15 s curve.
 * base = min(1000·2^attempt, 15000) · delay ∈ [base/2, base).
 * 2 ** attempt → Infinity for attempt ≥ 1024, min keeps it finite (R4).
 */
export function reconnectDelayMs(attempt: number, rand: () => number): number {
  const base = Math.min(1000 * 2 ** attempt, 15000);
  return base / 2 + rand() * (base / 2);
}

/**
 * v0.44.1 P1b (Astra 0164 M): caller callbacks on the connect/reconnect path
 * must not unwind reconnect state. Swallow — no rethrow, no recursion into onError.
 */
function safeCall(fn: () => void): void {
  try {
    fn();
  } catch {
    /* swallowed */
  }
}

/**
 * PLAN 0.27.0 D2: test-only handoff.ack injection result.
 * Production path is unchanged when no injector is registered.
 * Shape mirrors fields read in RelayClient.handoff() injection block.
 */
export type HandoffAckInjectionResult =
  | { kind: "throw"; message?: string }
  | {
      kind: "ack";
      status: string;
      recipientCount: number;
      notified?: boolean;
      handoffId?: string;
      to?: string;
      message?: string;
    };

type HandoffAckInjector = () => HandoffAckInjectionResult | null;

/** Module-level injector; null = production wire path. */
let __ackInjector: HandoffAckInjector | null = null;

/**
 * Register (or clear) a test-only handoff.ack injector.
 * Tests install via this seam; production never sets this.
 */
export function __setHandoffAckInjector(fn: HandoffAckInjector | null): void {
  __ackInjector = fn;
}

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
  /** Default {@link DEFAULT_MAX_RECONNECT_ATTEMPTS} (never give up). */
  maxReconnectAttempts?: number;
  /** v0.44.1 D2: jitter source for reconnect delays (default Math.random). */
  reconnectRandom?: () => number;
  /**
   * v0.29.0 PATCH 4: opt-in receive store. Absent keeps onmessage synchronous.
   * When set, RPC replies (handoff.ack, room.state, inbox.state,
   * inbox.claim_result, error) publish immediately with no ingest and no
   * queue. Every other envelope is queued per client, then ingest, then
   * publish only if deliver is not false.
   */
  eventStore?: RoomEventStore;
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
   * v0.44.1 R1: true from timer fire until reconnectNow settles. While a timer
   * is pending or an attempt is in flight, scheduleReconnect is a no-op.
   */
  private reconnectInFlight = false;
  /** One "gave up" line per exhausted chain (onclose and catch may both ask). */
  private reconnectGaveUp = false;
  /**
   * L-4: waiters for in-flight requestOnce.
   * Prefer wire `requestId` correlation; FIFO type-match remains fallback
   * when the relay does not echo requestId (older servers).
   */
  private pendingRequests: PendingRequest[] = [];
  /** Preserves socket arrival order while ingest is async. */
  private receiveQueue: Promise<void> = Promise.resolve();
  private receiveQueueDepth = 0;
  private receiveQueueWarnArmed = true;
  private receiveQueueOverflowCount = 0;

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
        this.reconnectGaveUp = false;
        // v0.44.1 D4/R2: with reconnectJoin the counter resets on join ack.
        if (!this.opts.reconnectJoin) this.reconnectAttempt = 0;
        resolve();
      };
      ws.onerror = () => {
        const err = new Error(`WebSocket error connecting to ${connectUrl}`);
        // P1b: settle before the callback so a throwing onError cannot skip it.
        if (!settled) {
          settled = true;
          reject(err);
        }
        safeCall(() => this.opts.onError?.(err));
      };
      ws.onclose = () => {
        this.openPromise = null;
        this.ws = null;
        safeCall(() => this.opts.onClose?.());
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
        if (this.opts.eventStore) {
          if (
            env.type === "handoff.ack" ||
            env.type === "room.state" ||
            env.type === "inbox.state" ||
            env.type === "inbox.claim_result" ||
            env.type === "error"
          ) {
            this.publishReceived(env);
            return;
          }
          this.enqueueReceived(env);
          return;
        }
        this.publishReceived(env);
      };
    });
    return this.openPromise;
  }

  /**
   * Serial per RelayClient. A thrown ingest still delivers (fail-open) and
   * the next envelope runs — the chain catches so one failure cannot stall it.
   */
  private enqueueReceived(env: Envelope): void {
    this.receiveQueueDepth += 1;
    if (
      this.receiveQueueDepth > RECEIVE_QUEUE_WARN_DEPTH &&
      this.receiveQueueWarnArmed
    ) {
      this.receiveQueueWarnArmed = false;
      this.receiveQueueOverflowCount += 1;
      console.error(
        `[loom] room-event receive queue depth ${this.receiveQueueDepth} exceeds ${RECEIVE_QUEUE_WARN_DEPTH}`,
      );
    }
    this.receiveQueue = this.receiveQueue
      .catch(() => undefined)
      .then(() => this.drainReceived(env));
  }

  private async drainReceived(env: Envelope): Promise<void> {
    try {
      const store = this.opts.eventStore;
      if (!store) {
        this.publishReceived(env);
        return;
      }
      let deliver = true;
      try {
        const result = await store.ingest(env);
        deliver = result.deliver !== false;
      } catch (e) {
        deliver = true;
        console.error(
          "[loom] room-event receive queue fail-open",
          e instanceof Error ? e.message : e,
        );
      }
      if (!deliver) return;
      try {
        this.publishReceived(env);
      } catch (e) {
        console.error(
          "[loom] room-event receive downstream failed",
          e instanceof Error ? e.message : e,
        );
      }
    } finally {
      this.receiveQueueDepth -= 1;
      if (this.receiveQueueDepth < RECEIVE_QUEUE_WARN_DEPTH) {
        this.receiveQueueWarnArmed = true;
      }
    }
  }

  private publishReceived(env: Envelope): void {
    this.applyEnvelope(env);
    this.dispatchPending(env);
    this.opts.onEnvelope?.(env);
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
    // v0.44.1 D3/R1: one failed attempt schedules at most one retry.
    if (this.reconnectTimer !== null || this.reconnectInFlight) return;
    const max = this.opts.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS;
    if (this.reconnectAttempt >= max) {
      if (this.reconnectGaveUp) return;
      this.reconnectGaveUp = true;
      safeCall(() =>
        this.opts.onError?.(
          new Error(`Reconnect gave up after ${max} attempts`),
        ),
      );
      return;
    }
    const delay = reconnectDelayMs(
      this.reconnectAttempt,
      this.opts.reconnectRandom ?? Math.random,
    );
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectInFlight = true;
      void this.reconnectNow();
    }, delay);
  }

  private async reconnectNow(): Promise<void> {
    try {
      await this.connect();
      const ws = this.ws;
      const creds = this.opts.reconnectJoin;
      if (creds) {
        const env = await this.joinRoom({
          ...creds,
          peerId: creds.peerId ?? this.peerId ?? undefined,
          color: creds.color ?? this.color ?? undefined,
        });
        this.reconnectInFlight = false;
        if (env.type === "error") {
          // v0.44.1 D5/R3: close this attempt's socket; onclose reports
          // onClose once and schedules only while autoReconnect stays on.
          if (RECONNECT_STOP_CODES.has(env.code)) {
            this.opts.autoReconnect = false;
            this.closeAttemptSocket(ws);
            safeCall(() =>
              this.opts.onError?.(
                new Error(`Reconnect stopped: ${env.code} — ${env.message}`),
              ),
            );
          } else {
            this.closeAttemptSocket(ws);
            safeCall(() => this.opts.onError?.(new Error(env.message)));
          }
        } else {
          const text = `reconnected (attempt ${this.reconnectAttempt})`;
          safeCall(() =>
            this.opts.onEnvelope?.({
              v: PROTOCOL_VERSION,
              type: "chat",
              roomId: this.roomId ?? "none",
              ts: new Date().toISOString(),
              from: "system",
              text,
            }),
          );
          // v0.44.1 D4: reset after the chat reads the real count.
          this.reconnectAttempt = 0;
        }
      } else {
        this.reconnectInFlight = false;
      }
    } catch (e) {
      this.reconnectInFlight = false;
      safeCall(() =>
        this.opts.onError?.(e instanceof Error ? e : new Error(String(e))),
      );
      if (!this.intentionalClose && this.opts.autoReconnect) {
        this.scheduleReconnect();
      }
    } finally {
      // P1b (Astra 0164 M): no exit path may leave the guard latched.
      this.reconnectInFlight = false;
    }
  }

  /** R65-L1: close only the socket this attempt joined on. */
  private closeAttemptSocket(ws: WebSocket | null): void {
    if (!ws || this.ws !== ws) return;
    try {
      ws.close();
    } catch {
      /* ignore */
    }
  }

  private clearReconnectState(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.reconnectInFlight = false;
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
    clientEventId?: string;
  }): Promise<Extract<Envelope, { type: "handoff.ack" }>> {
    // PLAN 0.27.0 D2: test-only ACK injection via production seam.
    // When __ackInjector is null (default), production wire path runs unchanged.
    // Tests register the injector (inverted dependency — no test imports here).
    const inj = __ackInjector?.() ?? null;
    if (inj) {
      if (inj.kind === "throw") {
        throw new Error(inj.message ?? "injected transport error");
      }
      const ack = {
        type: "handoff.ack" as const,
        v: PROTOCOL_VERSION,
        roomId: this.roomId ?? "injected",
        ts: new Date().toISOString(),
        handoffId: inj.handoffId ?? `ho_inj_${Date.now().toString(16)}`,
        to: inj.to ?? partial.to,
        status: inj.status as Extract<
          Envelope,
          { type: "handoff.ack" }
        >["status"],
        notified: inj.notified ?? inj.status === "delivered",
        recipientCount: inj.recipientCount,
        ...(inj.message !== undefined ? { message: inj.message } : {}),
      } satisfies Extract<Envelope, { type: "handoff.ack" }>;
      this.lastHandoffAck = ack;
      return ack;
    }

    await this.connect();
    this.lastHandoffAck = null;
    const { clientEventId, ...handoff } = partial;
    const env = await this.requestOnce(
      {
        type: "handoff",
        v: PROTOCOL_VERSION,
        handoff,
        ...(typeof clientEventId === "string" ? { clientEventId } : {}),
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

  async chat(text: string, clientEventId?: string): Promise<void> {
    await this.connect();
    this.send(
      typeof clientEventId === "string"
        ? { type: "chat", v: PROTOCOL_VERSION, text, clientEventId }
        : { type: "chat", v: PROTOCOL_VERSION, text },
    );
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
    this.clearReconnectState();
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
    this.clearReconnectState();
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
   * L-4: register a waiter without replacing opts.onEnvelope.
   * Attaches a wire `requestId` and matches the echoed id on the reply when present.
   */
  private requestOnce(
    msg: Record<string, unknown>,
    typeMatch: (e: Envelope) => boolean,
    timeoutMs = 8000,
  ): Promise<Envelope> {
    const requestId = generateId("req");
    const outbound = { ...msg, requestId };
    return new Promise((resolve, reject) => {
      const match = (e: Envelope): boolean => {
        if (!typeMatch(e)) return false;
        const rid =
          "requestId" in e && typeof (e as { requestId?: unknown }).requestId === "string"
            ? (e as { requestId: string }).requestId
            : undefined;
        // Prefer exact correlation when relay echoes requestId
        if (rid) return rid === requestId;
        // Legacy relay: fall back to type-only FIFO
        return true;
      };
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
        this.send(outbound);
      } catch (e) {
        const i = this.pendingRequests.indexOf(entry);
        if (i >= 0) this.pendingRequests.splice(i, 1);
        clearTimeout(entry.timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }
}
