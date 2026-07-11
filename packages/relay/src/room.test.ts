import { describe, expect, test } from "bun:test";
import { MAX_INBOX_ENTRIES_PER_PEER } from "@loom/protocol";
import { Room, RoomRegistry, type SocketLike } from "./room";

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
