import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Room, RoomRegistry } from "./room";
import {
  releaseStateDirLock,
  roomStatePath,
  loadAllSnapshots,
} from "./persist";

function tmpState(): string {
  return join(
    tmpdir(),
    `loom-relay-state-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
}

describe("P2 durable relay persist (0.14.1)", () => {
  let dir: string;

  beforeEach(() => {
    dir = tmpState();
    mkdirSync(dir, { recursive: true });
  });

  afterEach(() => {
    try {
      releaseStateDirLock(dir);
    } catch {
      /* */
    }
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* */
    }
  });

  test("M-22: hydrate keeps same peer secret across registry restart", () => {
    const reg1 = new RoomRegistry({ stateDir: dir });
    const room = reg1.create("persist-room");
    const sock = { send() {} };
    const added = room.addPeer(
      { id: "p_alice", displayName: "alice", agentKind: "claude" },
      sock,
    );
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const secret = added.secret;

    const bob = room.addPeer(
      { id: "p_bob", displayName: "bob", agentKind: "codex" },
      sock,
    );
    expect(bob.ok).toBe(true);
    room.setOffline("p_bob");
    room.routeHandoff({
      id: "ho_test2",
      fromPeerId: "p_alice",
      to: "p_bob",
      body: "queued for bob",
      mode: "message",
      createdAt: new Date().toISOString(),
    });

    const inboxBefore = room.listInbox("p_bob");
    expect(inboxBefore.length).toBe(1);
    expect(inboxBefore[0]!.handoff.body).toContain("queued for bob");

    reg1.close();

    const reg2 = new RoomRegistry({ stateDir: dir });
    const loaded = reg2.getById(room.id);
    expect(loaded).toBeTruthy();
    const rejoin = loaded!.addPeer(
      {
        id: "p_alice",
        displayName: "alice",
        agentKind: "claude",
        secret,
      },
      sock,
    );
    expect(rejoin.ok).toBe(true);
    if (rejoin.ok) {
      expect(rejoin.secret).toBe(secret);
      expect(rejoin.isNew).toBe(false);
    }
    // wrong secret fails
    const bad = loaded!.addPeer(
      {
        id: "p_alice",
        displayName: "evil",
        agentKind: "claude",
        secret: "wrong-secret-value-not-real",
      },
      sock,
    );
    expect(bad.ok).toBe(false);

    const inboxAfter = loaded!.listInbox("p_bob");
    expect(inboxAfter.length).toBe(1);
    expect(inboxAfter[0]!.handoff.body).toContain("queued for bob");
    reg2.close();
  });

  test("claim then restart → entry gone (first-wins)", () => {
    const reg1 = new RoomRegistry({ stateDir: dir });
    const room = reg1.create("claim-room");
    const sock = { send() {} };
    room.addPeer({ id: "p_a", displayName: "a", agentKind: "shell" }, sock);
    room.addPeer({ id: "p_b", displayName: "b", agentKind: "shell" }, sock);
    room.setOffline("p_b");
    const r = room.routeHandoff({
      id: "ho_c",
      fromPeerId: "p_a",
      to: "p_b",
      body: "claim me",
      mode: "message",
      createdAt: new Date().toISOString(),
    });
    expect(r.recipientCount).toBe(1);
    const id = room.listInbox("p_b")[0]!.handoff.id;
    const claimed = room.claimHandoff("p_b", id, "claim");
    expect(claimed.ok).toBe(true);
    expect(room.listInbox("p_b").length).toBe(0);
    reg1.close();

    const reg2 = new RoomRegistry({ stateDir: dir });
    const loaded = reg2.getById(room.id)!;
    expect(loaded.listInbox("p_b").length).toBe(0);
    reg2.close();
  });

  test("leave peer → restart → peer and inbox gone", () => {
    const reg1 = new RoomRegistry({ stateDir: dir });
    const room = reg1.create("leave-room");
    const sock = { send() {} };
    room.addPeer({ id: "p_x", displayName: "x", agentKind: "shell" }, sock);
    room.addPeer({ id: "p_y", displayName: "y", agentKind: "shell" }, sock);
    room.setOffline("p_y");
    room.routeHandoff({
      id: "ho_l",
      fromPeerId: "p_x",
      to: "p_y",
      body: "bye",
      mode: "message",
      createdAt: new Date().toISOString(),
    });
    expect(room.listInbox("p_y").length).toBe(1);
    room.removePeer("p_y");
    expect(room.getPeer("p_y")).toBeUndefined();
    reg1.close();

    const reg2 = new RoomRegistry({ stateDir: dir });
    const loaded = reg2.getById(room.id)!;
    expect(loaded.getPeer("p_y")).toBeUndefined();
    expect(loaded.listInbox("p_y").length).toBe(0);
    reg2.close();
  });

  test("corrupt one room file → other rooms still load", () => {
    const reg1 = new RoomRegistry({ stateDir: dir });
    const good = reg1.create("good-room");
    const sock = { send() {} };
    good.addPeer({ id: "p_g", displayName: "g", agentKind: "shell" }, sock);
    const badRoom = reg1.create("bad-room");
    const badPath = roomStatePath(dir, badRoom.id);
    reg1.close();

    writeFileSync(badPath, "{not-json!!!", "utf8");

    const reg2 = new RoomRegistry({ stateDir: dir });
    expect(reg2.getById(good.id)).toBeTruthy();
    expect(reg2.getById(badRoom.id)).toBeUndefined();
    reg2.close();
  });

  test("ephemeral registry writes nothing", () => {
    const reg = new RoomRegistry({ stateDir: dir, ephemeral: true });
    expect(reg.durable).toBe(false);
    const room = reg.create("eph");
    const sock = { send() {} };
    room.addPeer({ id: "p_e", displayName: "e", agentKind: "shell" }, sock);
    // no process lock / no room file required
    const { snapshots } = loadAllSnapshots(dir);
    expect(snapshots.length).toBe(0);
    reg.close();
  });

  test("M-23: second registry on same stateDir fails loud", () => {
    const reg1 = new RoomRegistry({ stateDir: dir });
    expect(() => new RoomRegistry({ stateDir: dir })).toThrow(/M-23|locked/i);
    reg1.close();
    // after release, second can open
    const reg2 = new RoomRegistry({ stateDir: dir });
    expect(reg2.durable).toBe(true);
    reg2.close();
  });

  test("default RoomRegistry is ephemeral (unit tests safe)", () => {
    const reg = new RoomRegistry();
    expect(reg.durable).toBe(false);
    expect(reg.stateDir).toBeNull();
  });

  test("Room.fromSnapshot does not mint new secrets (direct Map)", () => {
    const room = new Room("r", "LOOM-TEST1", "room_fixed");
    const sock = { send() {} };
    const a = room.addPeer(
      { id: "p_1", displayName: "one", agentKind: "claude" },
      sock,
    );
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    const snap = room.toSnapshot();
    expect(snap.members[0]!.secret).toBe(a.secret);
    const hydrated = Room.fromSnapshot(snap);
    const snap2 = hydrated.toSnapshot();
    expect(snap2.members[0]!.secret).toBe(a.secret);
  });
});
