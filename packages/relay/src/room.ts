import {
  type PeerInfo,
  type Envelope,
  type HandoffPayload,
  type InboxEntry,
  type HandoffSendStatus,
  type HandoffInboxStatus,
  type AgentKind,
  makeEnvelopeBase,
  nowIso,
  colorForPeer,
  generateInviteCode,
  generateRoomId,
  generateHandoffId,
  generateId,
  generatePeerSecret,
  timingSafeStringEqual,
  sanitizePeerName,
  sanitizePeerText,
  MAX_INBOX_ENTRIES_PER_PEER,
  MAX_ATTACHMENT_CONTENT_CHARS,
  MAX_ATTACHMENTS_PER_HANDOFF,
  MAX_HANDOFF_BODY_CHARS,
} from "@loom/protocol";
import {
  type RoomSnapshotV1,
  acquireStateDirLock,
  releaseStateDirLock,
  loadAllSnapshots,
  saveRoomSnapshot,
  peerForSnapshot,
  defaultRelayStateDir,
} from "./persist";

export type SocketLike = {
  send(data: string): void;
  close?: () => void;
};

type Member = {
  peer: PeerInfo;
  /** null when offline (roster kept) */
  socket: SocketLike | null;
  /** M-7: rejoin proof — never broadcast to other peers */
  secret: string;
};

export type AddPeerResult =
  | { ok: true; peer: PeerInfo; secret: string; isNew: boolean }
  | { ok: false; code: "peer_auth_failed"; message: string };

export type HandoffRouteResult = {
  status: HandoffSendStatus;
  handoffId: string;
  to: string;
  notified: boolean;
  recipientCount: number;
  message?: string;
};

export class Room {
  readonly id: string;
  readonly name: string;
  readonly inviteCode: string;
  readonly createdAt: string;
  private members = new Map<string, Member>();
  /** peerId → handoff id → entry */
  private inboxes = new Map<string, Map<string, InboxEntry>>();
  private colorIndex = 0;
  /** Called after durable-relevant mutations (registry sets this). */
  private persistHook: (() => void) | null = null;

  constructor(
    name: string,
    inviteCode?: string,
    id?: string,
    opts?: { createdAt?: string; colorIndex?: number },
  ) {
    this.id = id ?? generateRoomId();
    this.name = sanitizePeerText(name) || "room";
    this.inviteCode = inviteCode ?? generateInviteCode();
    this.createdAt = opts?.createdAt ?? nowIso();
    this.colorIndex = opts?.colorIndex ?? 0;
  }

  setPersistHook(hook: (() => void) | null): void {
    this.persistHook = hook;
  }

  /**
   * Durable flush. Throws on failure (no silent fail-open).
   * Callers that already mutated memory must rollback before rethrowing.
   */
  private touchPersist(): void {
    if (!this.persistHook) return;
    this.persistHook();
  }

  /**
   * M-22: rebuild roster+inbox from disk **without** addPeer/generatePeerSecret.
   */
  static fromSnapshot(snap: RoomSnapshotV1): Room {
    const room = new Room(snap.room.name, snap.room.inviteCode, snap.room.id, {
      createdAt: snap.room.createdAt,
      colorIndex: snap.colorIndex ?? 0,
    });
    const agentKinds = new Set([
      "claude",
      "codex",
      "grok",
      "shell",
      "unknown",
    ]);
    for (const m of snap.members) {
      const ak = agentKinds.has(m.peer.agentKind)
        ? (m.peer.agentKind as AgentKind)
        : "unknown";
      const peer: PeerInfo = {
        id: m.peer.id,
        displayName: m.peer.displayName,
        color: m.peer.color,
        agentKind: ak,
        joinedAt: m.peer.joinedAt,
        online: false,
      };
      room.members.set(peer.id, {
        peer,
        socket: null,
        secret: m.secret,
      });
      if (!room.inboxes.has(peer.id)) {
        room.inboxes.set(peer.id, new Map());
      }
    }
    for (const [peerId, entries] of Object.entries(snap.inboxes ?? {})) {
      let box = room.inboxes.get(peerId);
      if (!box) {
        box = new Map();
        room.inboxes.set(peerId, box);
      }
      for (const e of entries) {
        if (e.status !== "queued" && e.status !== "notified") continue;
        box.set(e.handoff.id, {
          handoff: e.handoff,
          status: e.status,
          toPeerId: e.toPeerId,
        });
      }
    }
    return room;
  }

  toSnapshot(): RoomSnapshotV1 {
    const members: RoomSnapshotV1["members"] = [];
    for (const m of this.members.values()) {
      members.push({
        peer: peerForSnapshot({ ...m.peer, online: false }),
        secret: m.secret,
      });
    }
    const inboxes: RoomSnapshotV1["inboxes"] = {};
    for (const [peerId, box] of this.inboxes) {
      const list: RoomSnapshotV1["inboxes"][string] = [];
      for (const e of box.values()) {
        if (e.status !== "queued" && e.status !== "notified") continue;
        list.push({
          status: e.status,
          toPeerId: e.toPeerId,
          handoff: e.handoff,
        });
      }
      if (list.length > 0) inboxes[peerId] = list;
    }
    return {
      v: 1,
      room: {
        id: this.id,
        name: this.name,
        inviteCode: this.inviteCode,
        createdAt: this.createdAt,
      },
      members,
      inboxes,
      colorIndex: this.colorIndex,
      updatedAt: nowIso(),
    };
  }

  get peerCount(): number {
    return this.members.size;
  }

  get onlineCount(): number {
    return this.listPeers().filter((p) => p.online).length;
  }

  listPeers(): PeerInfo[] {
    return [...this.members.values()].map((m) => ({
      ...m.peer,
      online: m.socket !== null,
    }));
  }

  getPeer(peerId: string): PeerInfo | undefined {
    const m = this.members.get(peerId);
    if (!m) return undefined;
    return { ...m.peer, online: m.socket !== null };
  }

  findPeerByName(name: string): PeerInfo | undefined {
    const n = name.replace(/^@/, "").toLowerCase();
    const matches = this.listPeers().filter(
      (p) => p.displayName.toLowerCase() === n || p.id === name,
    );
    return matches.find((p) => p.online) ?? matches[0];
  }

  allocateColor(): string {
    const c = colorForPeer(this.colorIndex);
    this.colorIndex += 1;
    return c;
  }

  /**
   * Upsert roster member and attach live socket (online=true).
   * M-7: rejoin with existing peer.id requires matching secret.
   */
  addPeer(
    partial: {
      id: string;
      displayName: string;
      agentKind?: PeerInfo["agentKind"];
      joinedAt?: string;
      color?: string;
      secret?: string;
    },
    socket: SocketLike,
  ): AddPeerResult {
    const displayName = sanitizePeerName(partial.displayName);
    const existing = this.members.get(partial.id);
    if (existing) {
      if (
        !partial.secret ||
        !timingSafeStringEqual(partial.secret, existing.secret)
      ) {
        return {
          ok: false,
          code: "peer_auth_failed",
          message:
            "Invalid or missing peer secret for this peer id (cannot take over roster/inbox)",
        };
      }
      existing.socket = socket;
      existing.peer = {
        ...existing.peer,
        displayName: displayName || existing.peer.displayName,
        agentKind: partial.agentKind ?? existing.peer.agentKind,
        color: partial.color ?? existing.peer.color,
        online: true,
      };
      return {
        ok: true,
        peer: { ...existing.peer, online: true },
        secret: existing.secret,
        isNew: false,
      };
    }

    const peer: PeerInfo = {
      id: partial.id || generateId("p"),
      displayName,
      agentKind: partial.agentKind ?? "unknown",
      color: partial.color ?? this.allocateColor(),
      joinedAt: partial.joinedAt ?? nowIso(),
      online: true,
    };
    const secret = generatePeerSecret();
    this.members.set(peer.id, { peer, socket, secret });
    if (!this.inboxes.has(peer.id)) {
      this.inboxes.set(peer.id, new Map());
    }
    try {
      this.touchPersist();
    } catch (e) {
      this.members.delete(peer.id);
      this.inboxes.delete(peer.id);
      console.error(
        `[loom relay] persist failed room=${this.id} (addPeer rolled back):`,
        e instanceof Error ? e.message : e,
      );
      throw e;
    }
    return { ok: true, peer, secret, isNew: true };
  }

  /** Socket gone — keep roster, mark offline. */
  setOffline(peerId: string): PeerInfo | undefined {
    const m = this.members.get(peerId);
    if (!m) return undefined;
    m.socket = null;
    m.peer = { ...m.peer, online: false };
    return { ...m.peer, online: false };
  }

  /**
   * M-6: mark offline only if `socket` is still this peer's current socket.
   * Stale close events after reconnect must not flip a live peer offline.
   */
  setOfflineIfSocket(
    peerId: string,
    socket: SocketLike,
  ): PeerInfo | undefined {
    const m = this.members.get(peerId);
    if (!m || m.socket !== socket) return undefined;
    return this.setOffline(peerId);
  }

  /** Explicit leave — remove from roster and drop inbox. */
  removePeer(peerId: string): PeerInfo | undefined {
    const m = this.members.get(peerId);
    if (!m) return undefined;
    const prevInbox = this.inboxes.get(peerId);
    this.members.delete(peerId);
    this.inboxes.delete(peerId);
    try {
      this.touchPersist();
    } catch (e) {
      // Fail closed: keep leave durable or restore memory so restart cannot resurrect
      this.members.set(peerId, m);
      if (prevInbox) this.inboxes.set(peerId, prevInbox);
      else this.inboxes.delete(peerId);
      console.error(
        `[loom relay] persist failed room=${this.id} (removePeer rolled back):`,
        e instanceof Error ? e.message : e,
      );
      throw e;
    }
    return m.peer;
  }

  isOnline(peerId: string): boolean {
    const m = this.members.get(peerId);
    if (!m) return false;
    return m.socket !== null;
  }

  sendTo(peerId: string, envelope: Envelope): boolean {
    const m = this.members.get(peerId);
    if (!m?.socket) return false;
    try {
      m.socket.send(JSON.stringify(envelope));
      return true;
    } catch {
      return false;
    }
  }

  /** Broadcast only to online sockets. */
  broadcast(envelope: Envelope, exceptPeerId?: string): void {
    const raw = JSON.stringify(envelope);
    for (const [id, m] of this.members) {
      if (exceptPeerId && id === exceptPeerId) continue;
      if (!m.socket) continue;
      try {
        m.socket.send(raw);
      } catch {
        /* ignore */
      }
    }
  }

  roomStateEnvelope(opts?: { peerSecret?: string }): Envelope {
    return {
      ...makeEnvelopeBase(this.id),
      type: "room.state",
      peers: this.listPeers(),
      roomName: this.name,
      inviteCode: this.inviteCode,
      ...(opts?.peerSecret ? { peerSecret: opts.peerSecret } : {}),
    };
  }

  peerJoinEnvelope(peer: PeerInfo): Envelope {
    return {
      ...makeEnvelopeBase(this.id),
      type: "peer.join",
      peer: { ...peer, online: true },
    };
  }

  peerLeaveEnvelope(peerId: string): Envelope {
    return {
      ...makeEnvelopeBase(this.id),
      type: "peer.leave",
      peerId,
    };
  }

  peerPresenceEnvelope(peerId: string, online: boolean): Envelope {
    return {
      ...makeEnvelopeBase(this.id),
      type: "peer.presence",
      peerId,
      online,
    };
  }

  chatEnvelope(fromPeerId: string, text: string): Envelope {
    return {
      ...makeEnvelopeBase(this.id),
      type: "chat",
      from: fromPeerId,
      text: sanitizePeerText(text),
    };
  }

  resolveHandoff(
    fromPeerId: string,
    partial: {
      id?: string;
      to: string;
      body: string;
      mode?: "message" | "task";
      attachments?: HandoffPayload["attachments"];
      createdAt?: string;
    },
  ): HandoffPayload {
    const attachments = partial.attachments
      ?.slice(0, MAX_ATTACHMENTS_PER_HANDOFF)
      .map((a) => ({
        ...a,
        content: sanitizePeerText(a.content).slice(
          0,
          MAX_ATTACHMENT_CONTENT_CHARS,
        ),
        label: a.label
          ? sanitizePeerText(a.label).slice(0, 200)
          : undefined,
      }));
    return {
      // M-9: never accept client-supplied handoff id (always server-generated)
      id: generateHandoffId(),
      fromPeerId,
      to: partial.to,
      body: sanitizePeerText(partial.body).slice(0, MAX_HANDOFF_BODY_CHARS),
      mode: partial.mode ?? "message",
      attachments,
      createdAt: partial.createdAt ?? nowIso(),
    };
  }

  private resolveTargets(handoff: HandoffPayload): PeerInfo[] {
    if (handoff.to === "*") {
      return this.listPeers().filter((p) => p.id !== handoff.fromPeerId);
    }
    let target = this.getPeer(handoff.to);
    if (!target) target = this.findPeerByName(handoff.to);
    return target ? [target] : [];
  }

  /**
   * L-11: keep inbox bounded. Prefer dropping claimed/accepted, then oldest pending.
   */
  private trimInbox(box: Map<string, InboxEntry>): void {
    while (box.size > MAX_INBOX_ENTRIES_PER_PEER) {
      const entries = [...box.entries()];
      const done = entries.filter(
        ([, e]) => e.status === "claimed" || e.status === "accepted",
      );
      if (done.length > 0) {
        // drop oldest done by handoff.createdAt
        done.sort(
          (a, b) =>
            Date.parse(a[1].handoff.createdAt) -
            Date.parse(b[1].handoff.createdAt),
        );
        box.delete(done[0]![0]);
        continue;
      }
      // drop oldest pending
      entries.sort(
        (a, b) =>
          Date.parse(a[1].handoff.createdAt) -
          Date.parse(b[1].handoff.createdAt),
      );
      box.delete(entries[0]![0]);
    }
  }

  private enqueue(toPeerId: string, handoff: HandoffPayload): InboxEntry {
    let box = this.inboxes.get(toPeerId);
    if (!box) {
      box = new Map();
      this.inboxes.set(toPeerId, box);
    }
    const entry: InboxEntry = {
      handoff,
      status: "queued",
      toPeerId,
    };
    box.set(handoff.id, entry);
    this.trimInbox(box);
    return entry;
  }

  /**
   * Enqueue to roster targets; notify online sockets.
   * Always stores in inbox (even when notified).
   */
  routeHandoff(handoff: HandoffPayload): HandoffRouteResult {
    const targets = this.resolveTargets(handoff);
    if (targets.length === 0) {
      return {
        status: "peer_unknown",
        handoffId: handoff.id,
        to: handoff.to,
        notified: false,
        recipientCount: 0,
        message: `No peer matching "${handoff.to}"`,
      };
    }

    const notifyEnv: Envelope = {
      ...makeEnvelopeBase(this.id),
      type: "handoff",
      handoff,
    };

    let anyNotified = false;
    const enqueuedTo: string[] = [];
    for (const t of targets) {
      const entry = this.enqueue(t.id, handoff);
      enqueuedTo.push(t.id);
      if (this.sendTo(t.id, notifyEnv)) {
        entry.status = "notified";
        anyNotified = true;
      }
    }
    try {
      this.touchPersist();
    } catch (e) {
      for (const to of enqueuedTo) {
        this.inboxes.get(to)?.delete(handoff.id);
      }
      console.error(
        `[loom relay] persist failed room=${this.id} (routeHandoff rolled back):`,
        e instanceof Error ? e.message : e,
      );
      throw e;
    }

    return {
      status: anyNotified ? "delivered" : "queued",
      handoffId: handoff.id,
      to: handoff.to,
      notified: anyNotified,
      recipientCount: targets.length,
    };
  }

  handoffAckEnvelope(result: HandoffRouteResult): Envelope {
    return {
      ...makeEnvelopeBase(this.id),
      type: "handoff.ack",
      handoffId: result.handoffId,
      to: result.to,
      status: result.status,
      notified: result.notified,
      recipientCount: result.recipientCount,
      message: result.message,
    };
  }

  listInbox(peerId: string): InboxEntry[] {
    const box = this.inboxes.get(peerId);
    if (!box) return [];
    return [...box.values()].filter(
      (e) => e.status === "queued" || e.status === "notified",
    );
  }

  inboxStateEnvelope(peerId: string): Envelope {
    return {
      ...makeEnvelopeBase(this.id),
      type: "inbox.state",
      entries: this.listInbox(peerId),
    };
  }

  /**
   * First-wins: claim (agent) or accept (human).
   * handoffId may be a unique prefix of the full id.
   */
  claimHandoff(
    peerId: string,
    handoffId: string,
    via: "claim" | "accept",
  ): { ok: true; entry: InboxEntry } | { ok: false; error: string } {
    const box = this.inboxes.get(peerId);
    let entry = box?.get(handoffId);
    if (!entry && box) {
      const matches = [...box.values()].filter((e) =>
        e.handoff.id.startsWith(handoffId),
      );
      if (matches.length === 1) entry = matches[0];
      else if (matches.length > 1) {
        return { ok: false, error: `Ambiguous id prefix ${handoffId}` };
      }
    }
    if (!entry) {
      return { ok: false, error: `No inbox item ${handoffId}` };
    }
    if (entry.status === "claimed" || entry.status === "accepted") {
      return {
        ok: false,
        error: `Already ${entry.status} (first-wins)`,
      };
    }
    if (entry.status !== "queued" && entry.status !== "notified") {
      return { ok: false, error: `Cannot claim status=${entry.status}` };
    }
    const next: HandoffInboxStatus = via === "accept" ? "accepted" : "claimed";
    const prevStatus = entry.status;
    entry.status = next;
    const out = { ...entry, handoff: { ...entry.handoff } };
    // L-11: drop terminal entries so repeated large attachments don't pin memory
    box?.delete(entry.handoff.id);
    try {
      this.touchPersist();
    } catch (e) {
      // Restore pending entry so restart cannot re-offer a half-claimed handoff incorrectly
      box?.set(entry.handoff.id, { ...entry, status: prevStatus });
      console.error(
        `[loom relay] persist failed room=${this.id} (claim rolled back):`,
        e instanceof Error ? e.message : e,
      );
      throw e;
    }
    return { ok: true, entry: out };
  }

  errorEnvelope(code: string, message: string): Envelope {
    return {
      ...makeEnvelopeBase(this.id),
      type: "error",
      code,
      message,
    };
  }
}

export type RoomRegistryOptions = {
  /**
   * When set (and not ephemeral), load/save room snapshots here.
   * Unit tests omit this → in-memory only.
   */
  stateDir?: string;
  /** Force no disk I/O even if stateDir set. */
  ephemeral?: boolean;
};

export class RoomRegistry {
  private byId = new Map<string, Room>();
  private byCode = new Map<string, Room>();
  readonly stateDir: string | null;
  readonly durable: boolean;
  private processLockHeld = false;

  constructor(opts?: RoomRegistryOptions) {
    const ephemeral =
      opts?.ephemeral === true ||
      process.env.LOOM_RELAY_EPHEMERAL === "1" ||
      process.env.LOOM_RELAY_EPHEMERAL === "true";
    if (ephemeral || !opts?.stateDir) {
      this.stateDir = null;
      this.durable = false;
      return;
    }
    this.stateDir = opts.stateDir;
    this.durable = true;
    try {
      acquireStateDirLock(this.stateDir);
      this.processLockHeld = true;
    } catch (e) {
      throw e;
    }
    this.loadFromDisk();
  }

  /** Release M-23 process lock (call on relay shutdown). */
  close(): void {
    if (this.processLockHeld && this.stateDir) {
      releaseStateDirLock(this.stateDir);
      this.processLockHeld = false;
    }
  }

  private wirePersist(room: Room): void {
    if (!this.durable || !this.stateDir) {
      room.setPersistHook(null);
      return;
    }
    const dir = this.stateDir;
    room.setPersistHook(() => {
      saveRoomSnapshot(dir, room.toSnapshot());
    });
  }

  private loadFromDisk(): void {
    if (!this.stateDir) return;
    const { snapshots, errors } = loadAllSnapshots(this.stateDir);
    for (const msg of errors) {
      console.error(`[loom relay] state load: ${msg}`);
    }
    const codeOwners = new Map<string, string>(); // invite upper → roomId
    for (const snap of snapshots) {
      const room = Room.fromSnapshot(snap);
      this.wirePersist(room);
      this.byId.set(room.id, room);
      const code = room.inviteCode.toUpperCase();
      const prev = codeOwners.get(code);
      if (prev && prev !== room.id) {
        // L-28: log invite collision (do not silent last-wins without log)
        console.error(
          `[loom relay] invite code collision on load: ${room.inviteCode} ` +
            `rooms ${prev} and ${room.id} — last wins (${room.id})`,
        );
      }
      codeOwners.set(code, room.id);
      this.byCode.set(code, room);
    }
  }

  create(name: string, inviteCode?: string): Room {
    const room = new Room(name, inviteCode);
    this.wirePersist(room);
    this.byId.set(room.id, room);
    this.byCode.set(room.inviteCode.toUpperCase(), room);
    // immediate create flush — fail closed (do not register half-created durable room)
    if (this.durable && this.stateDir) {
      try {
        saveRoomSnapshot(this.stateDir, room.toSnapshot());
      } catch (e) {
        this.byId.delete(room.id);
        this.byCode.delete(room.inviteCode.toUpperCase());
        room.setPersistHook(null);
        console.error(
          `[loom relay] persist create failed:`,
          e instanceof Error ? e.message : e,
        );
        throw e;
      }
    }
    return room;
  }

  getById(id: string): Room | undefined {
    return this.byId.get(id);
  }

  getByCode(code: string): Room | undefined {
    return this.byCode.get(code.toUpperCase());
  }

  maybeGc(_room: Room): void {
    // keep rooms for relay process lifetime (+ disk when durable)
  }

  listRooms(): {
    id: string;
    name: string;
    inviteCode: string;
    peers: number;
    online: number;
  }[] {
    return [...this.byId.values()].map((r) => ({
      id: r.id,
      name: r.name,
      inviteCode: r.inviteCode,
      peers: r.peerCount,
      online: r.onlineCount,
    }));
  }
}

export { defaultRelayStateDir };
