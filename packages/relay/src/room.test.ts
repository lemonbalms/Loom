import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MAX_INBOX_ENTRIES_PER_PEER, PROTOCOL_VERSION } from "@loom/protocol";
import { Room, RoomRegistry, type SocketLike } from "./room";
import {
  loadAllSnapshots,
  releaseStateDirLock,
  type RoomSnapshotV1,
} from "./persist";

function mockSocket() {
  const sent: string[] = [];
  return {
    sent,
    socket: {
      send(data: string) {
        sent.push(data);
      },
    },
  };
}

function mustAdd(
  room: Room,
  partial: {
    id: string;
    displayName: string;
    agentKind?: "claude" | "codex" | "grok" | "shell" | "unknown";
    secret?: string;
  },
  socket: SocketLike,
) {
  const r = room.addPeer(partial, socket);
  if (!r.ok) throw new Error(r.message);
  return r;
}

describe("Room roster vs socket", () => {
  test("add peers and list with online", () => {
    const room = new Room("demo");
    const a = mockSocket();
    const b = mockSocket();
    const p1 = mustAdd(room, 
      { id: "p1", displayName: "alice", agentKind: "claude" },
      a.socket,
    );
    mustAdd(room, { id: "p2", displayName: "bob", agentKind: "codex" }, b.socket);
    expect(room.peerCount).toBe(2);
    expect(p1.peer.online).toBe(true);
    expect(room.findPeerByName("@alice")?.id).toBe("p1");
  });

  test("setOffline keeps roster; handoff still enqueues", () => {
    const room = new Room("demo");
    const a = mockSocket();
    const b = mockSocket();
    mustAdd(room, { id: "p1", displayName: "alice", agentKind: "claude" }, a.socket);
    mustAdd(room, { id: "p2", displayName: "bob", agentKind: "codex" }, b.socket);
    room.setOffline("p1");
    expect(room.getPeer("p1")?.online).toBe(false);
    expect(room.peerCount).toBe(2);

    const ho = room.resolveHandoff("p2", {
      to: "@alice",
      body: "the british are coming",
    });
    const result = room.routeHandoff(ho);
    expect(result.status).toBe("queued");
    expect(result.recipientCount).toBe(1);
    expect(a.sent.length).toBe(0); // offline, no notify
    expect(room.listInbox("p1").length).toBe(1);
    expect(room.listInbox("p1")[0]!.handoff.body).toContain("british");
  });

  test("findPeerByName prefers online peer when display names collide", () => {
    const room = new Room("demo");
    mustAdd(room, { id: "stale", displayName: "alice" }, mockSocket().socket);
    room.setOffline("stale");
    mustAdd(room, { id: "live", displayName: "alice" }, mockSocket().socket);

    expect(room.findPeerByName("@alice")?.id).toBe("live");
  });

  test("online handoff is delivered and inbox notified", () => {
    const room = new Room("demo");
    const a = mockSocket();
    const b = mockSocket();
    mustAdd(room, { id: "p1", displayName: "alice", agentKind: "claude" }, a.socket);
    mustAdd(room, { id: "p2", displayName: "bob", agentKind: "codex" }, b.socket);
    const ho = room.resolveHandoff("p1", {
      to: "@bob",
      body: "hello",
    });
    const result = room.routeHandoff(ho);
    expect(result.status).toBe("delivered");
    expect(b.sent.length).toBe(1);
    expect(JSON.parse(b.sent[0]!).type).toBe("handoff");
    expect(room.listInbox("p2")[0]!.status).toBe("notified");
  });

  test("broadcast enqueues all roster except sender including offline", () => {
    const room = new Room("demo");
    const a = mockSocket();
    const b = mockSocket();
    const c = mockSocket();
    mustAdd(room, { id: "p1", displayName: "alice", agentKind: "claude" }, a.socket);
    mustAdd(room, { id: "p2", displayName: "bob", agentKind: "codex" }, b.socket);
    mustAdd(room, { id: "p3", displayName: "carol", agentKind: "grok" }, c.socket);
    room.setOffline("p3");
    const ho = room.resolveHandoff("p1", { to: "*", body: "all hands" });
    const result = room.routeHandoff(ho);
    expect(result.recipientCount).toBe(2);
    expect(room.listInbox("p2").length).toBe(1);
    expect(room.listInbox("p3").length).toBe(1);
    expect(result.status).toBe("delivered"); // bob got notify
  });

  test("unknown peer returns peer_unknown", () => {
    const room = new Room("demo");
    const a = mockSocket();
    mustAdd(room, { id: "p1", displayName: "alice", agentKind: "claude" }, a.socket);
    const ho = room.resolveHandoff("p1", { to: "@nobody", body: "x" });
    expect(room.routeHandoff(ho).status).toBe("peer_unknown");
  });

  test("claim first-wins", () => {
    const room = new Room("demo");
    const a = mockSocket();
    mustAdd(room, { id: "p1", displayName: "alice", agentKind: "claude" }, a.socket);
    mustAdd(room, { id: "p2", displayName: "bob", agentKind: "codex" }, mockSocket().socket);
    const ho = room.resolveHandoff("p2", { to: "@alice", body: "task" });
    room.routeHandoff(ho);
    const c1 = room.claimHandoff("p1", ho.id, "claim");
    expect(c1.ok).toBe(true);
    // L-11: claimed entry removed — second claim is "not found", not already-claimed
    const c2 = room.claimHandoff("p1", ho.id, "accept");
    if (c2.ok) throw new Error("expected second claim to fail (L-11 first-wins)");
    expect(c2.error).toMatch(/No inbox item|Already/i);
  });

  test("L-11: claim removes entry; inbox trim bounds size", () => {
    const room = new Room("demo");
    mustAdd(room, { id: "p1", displayName: "alice", agentKind: "claude" }, mockSocket().socket);
    mustAdd(room, { id: "p2", displayName: "bob", agentKind: "codex" }, mockSocket().socket);
    const ho = room.resolveHandoff("p2", { to: "@alice", body: "one" });
    room.routeHandoff(ho);
    expect(room.listInbox("p1").length).toBe(1);
    const c = room.claimHandoff("p1", ho.id, "claim");
    expect(c.ok).toBe(true);
    expect(room.listInbox("p1").length).toBe(0);
    // re-claim fails
    expect(room.claimHandoff("p1", ho.id, "claim").ok).toBe(false);

    // flood pending items beyond cap
    for (let i = 0; i < MAX_INBOX_ENTRIES_PER_PEER + 20; i++) {
      const h = room.resolveHandoff("p2", {
        to: "@alice",
        body: `flood-${i}`,
      });
      room.routeHandoff(h);
    }
    expect(room.listInbox("p1").length).toBeLessThanOrEqual(
      MAX_INBOX_ENTRIES_PER_PEER,
    );
  });

  test("sanitize handoff body", () => {
    const room = new Room("demo");
    mustAdd(room, { id: "p1", displayName: "alice", agentKind: "claude" }, mockSocket().socket);
    const ho = room.resolveHandoff("p1", {
      to: "*",
      body: "x\x1b[31my",
    });
    expect(ho.body).toBe("xy");
  });

  test("M-9: client-supplied handoff id is ignored", () => {
    const room = new Room("demo");
    mustAdd(room, { id: "p1", displayName: "alice", agentKind: "claude" }, mockSocket().socket);
    const ho = room.resolveHandoff("p1", {
      id: "ho_evil\x1b[31m",
      to: "*",
      body: "hi",
    } as { id?: string; to: string; body: string });
    expect(ho.id).not.toContain("evil");
    expect(ho.id).toMatch(/^ho_[a-f0-9]+$/i);
  });

  test("removePeer drops from roster (explicit leave)", () => {
    const room = new Room("demo");
    mustAdd(room, { id: "p1", displayName: "a", agentKind: "shell" }, mockSocket().socket);
    room.removePeer("p1");
    expect(room.peerCount).toBe(0);
  });

  test("isOnline false for unregistered peer", () => {
    const room = new Room("demo");
    expect(room.isOnline("nope")).toBe(false);
    mustAdd(room, { id: "p1", displayName: "a", agentKind: "shell" }, mockSocket().socket);
    expect(room.isOnline("p1")).toBe(true);
    room.setOffline("p1");
    expect(room.isOnline("p1")).toBe(false);
  });
});


describe("RoomRegistry", () => {
  test("create and lookup by code", () => {
    const reg = new RoomRegistry();
    const room = reg.create("sprint");
    expect(reg.getByCode(room.inviteCode)).toBe(room);
    expect(room.inviteCode).toMatch(/^LOOM-/);
  });

  test("M-16: legacy FABLE- full code lookup (no prefix rewrite)", () => {
    const reg = new RoomRegistry();
    const room = reg.create("legacy-room", "FABLE-7K2M");
    expect(room.inviteCode).toBe("FABLE-7K2M");
    // exact match + case fold only
    expect(reg.getByCode("FABLE-7K2M")).toBe(room);
    expect(reg.getByCode("fable-7k2m")).toBe(room);
    // must NOT resolve via LOOM- rewrite of same body
    expect(reg.getByCode("LOOM-7K2M")).toBeUndefined();
  });
});

describe("v0.29.0 PATCH 1 expected-red", () => {
  function pair() {
    const room = new Room("demo");
    const a = mockSocket();
    const b = mockSocket();
    const c = mockSocket();
    const pa = mustAdd(
      room,
      { id: "p1", displayName: "alice", agentKind: "claude" },
      a.socket,
    );
    const pb = mustAdd(
      room,
      { id: "p2", displayName: "bob", agentKind: "codex" },
      b.socket,
    );
    mustAdd(room, { id: "p3", displayName: "carol", agentKind: "grok" }, c.socket);
    return { room, a, b, c, pa, pb };
  }

  function sent(sock: { sent: string[] }, index = 0): {
    type?: string;
    eventId?: string;
    seq?: number;
  } {
    return JSON.parse(sock.sent[index]!) as {
      type?: string;
      eventId?: string;
      seq?: number;
    };
  }

  test("(a) stampRoomEvent assigns ev_ ids and a strictly increasing per-room seq", () => {
    const { room } = pair();
    const stamp = (room as unknown as {
      stampRoomEvent?: (env: unknown) => { eventId?: string; seq?: number } | void;
    }).stampRoomEvent;
    expect(typeof stamp).toBe("function");

    const peer = room.getPeer("p2")!;
    const ho = room.resolveHandoff("p1", { to: "@bob", body: "n" });
    const events = [
      room.chatEnvelope("p1", "hi"),
      room.peerJoinEnvelope(peer),
      room.peerLeaveEnvelope("p2"),
      room.peerPresenceEnvelope("p2", false),
      {
        v: PROTOCOL_VERSION,
        roomId: room.id,
        ts: new Date().toISOString(),
        type: "handoff" as const,
        handoff: ho,
      },
    ];
    const ids = new Set<string>();
    let prev = 0;
    for (const env of events) {
      const ret = stamp!.call(room, env);
      const out = (ret ?? env) as { eventId?: string; seq?: number };
      expect(out.eventId).toMatch(/^ev_.+/);
      expect(out.seq).toBe(prev + 1);
      prev = out.seq!;
      ids.add(out.eventId!);
    }
    expect(ids.size).toBe(events.length);

    const other = new Room("other");
    const otherRaw = other.chatEnvelope("p1", "a");
    const again = stamp!.call(other, otherRaw);
    const otherOut = (again ?? otherRaw) as { seq?: number };
    expect(otherOut.seq).toBe(1);
    const later = room.chatEnvelope("p1", "later");
    const next = stamp!.call(room, later);
    expect(((next ?? later) as { seq?: number }).seq).toBe(events.length + 1);
  });

  test("(a) broadcast and routeHandoff share one stamp; client eventId/seq are overwritten; RPC replies are not stamped", () => {
    const { room, b, c } = pair();
    room.broadcast(
      {
        ...room.chatEnvelope("p1", "injected"),
        eventId: "ev_bogus",
        seq: 999,
      } as never,
      "p1",
    );
    expect(b.sent.length).toBeGreaterThan(0);
    const bob = sent(b);
    const carol = sent(c);
    expect(bob.eventId).not.toBe("ev_bogus");
    expect(bob.seq).not.toBe(999);
    expect(bob.eventId).toMatch(/^ev_.+/);
    expect(bob.seq).toBe(1);
    expect(carol.eventId).toBe(bob.eventId);
    expect(carol.seq).toBe(bob.seq);

    const before = b.sent.length;
    room.broadcast(room.peerJoinEnvelope(room.getPeer("p3")!), "p3");
    room.broadcast(room.peerLeaveEnvelope("p3"));
    room.broadcast(room.peerPresenceEnvelope("p2", false), "p2");
    const join = sent(b, before);
    const leave = sent(b, before + 1);
    const presence = sent(c, c.sent.length - 1);
    expect(join.type).toBe("peer.join");
    expect(leave.type).toBe("peer.leave");
    expect(presence.type).toBe("peer.presence");
    for (const msg of [join, leave, presence]) {
      expect(msg.eventId).toMatch(/^ev_.+/);
    }
    expect(join.seq).toBe(2);
    expect(leave.seq).toBe(3);
    expect(presence.seq).toBe(4);
    expect(new Set([bob.eventId, join.eventId, leave.eventId, presence.eventId]).size).toBe(4);

    const ho = room.resolveHandoff("p1", { to: "*", body: "all-hands" });
    room.routeHandoff(ho);
    const h2 = sent(b, b.sent.length - 1);
    const h3 = sent(c, c.sent.length - 1);
    expect(h2.type).toBe("handoff");
    expect(h3.type).toBe("handoff");
    expect(h2.eventId).toMatch(/^ev_.+/);
    expect(h2.eventId).toBe(h3.eventId);
    expect(h2.seq).toBe(h3.seq);
    expect(h2.seq).toBe(5);

    const ack = room.handoffAckEnvelope(
      room.routeHandoff(room.resolveHandoff("p1", { to: "@bob", body: "z" })),
    ) as { eventId?: string; seq?: number };
    const state = room.roomStateEnvelope() as { eventId?: string; seq?: number };
    const inbox = room.inboxStateEnvelope("p2") as { eventId?: string; seq?: number };
    for (const rpc of [ack, state, inbox]) {
      expect(rpc.eventId).toBeUndefined();
      expect(rpc.seq).toBeUndefined();
    }
  });

  test("(a) SEQ_RESERVE_BLOCK is a positive integer exported from room.ts", async () => {
    const mod = await import("./room");
    const k = (mod as { SEQ_RESERVE_BLOCK?: number }).SEQ_RESERVE_BLOCK;
    expect(typeof k).toBe("number");
    expect(Number.isInteger(k)).toBe(true);
    expect(k!).toBeGreaterThan(0);
  });

  test("(a) fromSnapshot without seqHigh starts at 1; seqHigh resumes at or above the reservation", () => {
    const bare = new Room("bare", "LOOM-BARE", "room_bare");
    const withHigh = bare.toSnapshot() as RoomSnapshotV1 & { seqHigh?: number };
    withHigh.seqHigh = 40;
    const resumed = Room.fromSnapshot(withHigh);
    const rb = mockSocket();
    mustAdd(resumed, { id: "p1", displayName: "alice", agentKind: "claude" }, mockSocket().socket);
    mustAdd(resumed, { id: "p2", displayName: "bob", agentKind: "codex" }, rb.socket);
    resumed.broadcast(resumed.chatEnvelope("p1", "after-high"), "p1");
    const highMsg = sent(rb);
    expect(highMsg.eventId).toMatch(/^ev_.+/);
    expect(highMsg.seq).toBeGreaterThanOrEqual(40);

    const fresh = Room.fromSnapshot(bare.toSnapshot());
    const fb = mockSocket();
    mustAdd(fresh, { id: "p1", displayName: "alice", agentKind: "claude" }, mockSocket().socket);
    mustAdd(fresh, { id: "p2", displayName: "bob", agentKind: "codex" }, fb.socket);
    fresh.broadcast(fresh.chatEnvelope("p1", "from-one"), "p1");
    const first = sent(fb);
    expect(first.seq).toBe(1);
    expect(first.eventId).toMatch(/^ev_.+/);
  });

  test("(a) durable reload issues a seq greater than the last seq before reload", () => {
    const dir = mkdtempSync(join(tmpdir(), "loom-seq-"));
    const reg = new RoomRegistry({ stateDir: dir });
    let reg2: RoomRegistry | null = null;
    try {
      const room = reg.create("seq");
      const b = mockSocket();
      const pa = mustAdd(
        room,
        { id: "p1", displayName: "alice", agentKind: "claude" },
        mockSocket().socket,
      );
      const pb = mustAdd(
        room,
        { id: "p2", displayName: "bob", agentKind: "codex" },
        b.socket,
      );
      room.broadcast(room.chatEnvelope("p1", "before"), "p1");
      const first = sent(b);
      expect(typeof first.seq).toBe("number");
      expect(first.seq!).toBeGreaterThan(0);
      const last = first.seq!;
      const code = room.inviteCode;
      const roomId = room.id;
      reg.close();
      // Read the reservation persisted before reload (the first post-reload
      // stamp may reserve a fresh block and overwrite it).
      const loaded = loadAllSnapshots(dir).snapshots.find((s) => s.room.id === roomId) as
        | (RoomSnapshotV1 & { seqHigh?: number })
        | undefined;

      reg2 = new RoomRegistry({ stateDir: dir });
      const room2 = reg2.getByCode(code);
      expect(room2).toBeTruthy();
      const b2 = mockSocket();
      mustAdd(
        room2!,
        { id: "p1", displayName: "alice", agentKind: "claude", secret: pa.secret },
        mockSocket().socket,
      );
      mustAdd(
        room2!,
        { id: "p2", displayName: "bob", agentKind: "codex", secret: pb.secret },
        b2.socket,
      );
      room2!.broadcast(room2!.chatEnvelope("p1", "after"), "p1");
      const next = sent(b2);
      expect(next.seq!).toBeGreaterThan(last);
      expect(typeof loaded?.seqHigh).toBe("number");
      expect(loaded!.seqHigh!).toBeGreaterThan(last);
      expect(next.seq!).toBeGreaterThanOrEqual(loaded!.seqHigh!);
    } finally {
      try {
        reg2?.close();
      } catch {
        /* */
      }
      try {
        if (reg2 == null) reg.close();
      } catch {
        /* */
      }
      try {
        releaseStateDirLock(dir);
      } catch {
        /* */
      }
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
