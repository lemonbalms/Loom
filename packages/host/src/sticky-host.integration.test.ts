import { describe, expect, test, afterAll, beforeAll } from "bun:test";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { RelayServer } from "@loom/relay";
import { RelayClient } from "./relay-client";
import { startStickyServer } from "./sticky-server";
import {
  stickyRpc,
  resolveLiveHostMeta,
  resolveAliveHostMeta,
} from "./sticky-client";
import { clearStickyMeta, writeStickyMeta } from "./sticky-meta";
import { setActiveProfile } from "./session-store";
import type { FableSession } from "./session-store";
import { PROTOCOL_VERSION } from "@loom/protocol";

describe("sticky host IPC (Phase 4.0a)", () => {
  const port = 19500 + Math.floor(Math.random() * 400);
  const relay = new RelayServer({ host: "127.0.0.1", port });
  const dir = join(tmpdir(), `loom-sticky-${Date.now()}`);
  const sessionFile = join(dir, "session.json");
  let sticky: Awaited<ReturnType<typeof startStickyServer>> | null = null;
  let bobClient: RelayClient | null = null;

  beforeAll(async () => {
    mkdirSync(dir, { recursive: true });
    process.env.LOOM_TEST_HOME = dir;
    const { resetStateHomeDirCache } = await import("./session-store");
    resetStateHomeDirCache();
    relay.start();

    // Alice creates room
    const alice = new RelayClient({
      url: `ws://127.0.0.1:${port}/ws`,
    });
    const env = await alice.createRoom({
      roomName: "sticky-test",
      displayName: "alice",
      agentKind: "shell",
      peerId: "p_alice_sticky",
    });
    if (env.type !== "room.state") throw new Error("create failed");
    const me = env.peers.find((p) => p.id === "p_alice_sticky")!;
    const peerSecret = env.peerSecret ?? alice.peerSecret ?? undefined;
    if (!peerSecret) throw new Error("create did not issue peerSecret (M-7)");
    const session: FableSession = {
      roomId: env.roomId,
      roomName: env.roomName ?? "sticky-test",
      inviteCode: env.inviteCode ?? "",
      peerId: me.id,
      displayName: me.displayName,
      color: me.color,
      agentKind: "shell",
      relayUrl: `ws://127.0.0.1:${port}/ws`,
      peerSecret,
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(sessionFile, JSON.stringify(session, null, 2), "utf8");
    process.env.LOOM_SESSION = sessionFile;
    setActiveProfile(null);
    alice.close();

    // Bob joins and stays offline-capable
    bobClient = new RelayClient({
      url: `ws://127.0.0.1:${port}/ws`,
    });
    await bobClient.joinRoom({
      inviteCode: session.inviteCode,
      displayName: "bob",
      agentKind: "shell",
      peerId: "p_bob_sticky",
    });

    sticky = await startStickyServer({ session });
  });

  afterAll(async () => {
    if (sticky) await sticky.stop();
    bobClient?.close();
    relay.stop();
    clearStickyMeta(sessionFile);
    delete process.env.LOOM_SESSION;
    delete process.env.LOOM_TEST_HOME;
    try {
      const { resetStateHomeDirCache } = await import("./session-store");
      resetStateHomeDirCache();
    } catch {
      /* */
    }
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* */
    }
  });

  test("ping and status", async () => {
    const ping = await stickyRpc({ op: "ping" }, { meta: sticky!.meta });
    expect(ping.ok).toBe(true);
    const st = await stickyRpc({ op: "status" }, { meta: sticky!.meta });
    expect(st.ok).toBe(true);
    if (st.ok && st.op === "status") {
      expect(st.peerId).toBe("p_alice_sticky");
      expect(st.relayConnected).toBe(true);
    }
  });

  test("list_peers includes bob", async () => {
    const r = await stickyRpc({ op: "list_peers" }, { meta: sticky!.meta });
    expect(r.ok).toBe(true);
    if (r.ok && r.op === "list_peers") {
      expect(r.peers.some((p) => p.displayName === "bob")).toBe(true);
      expect(r.meId).toBe("p_alice_sticky");
    }
  });

  test("handoff via sticky host", async () => {
    const r = await stickyRpc(
      {
        op: "handoff",
        to: "@bob",
        body: "hello from sticky host",
      },
      { meta: sticky!.meta },
    );
    expect(r.ok).toBe(true);
    if (r.ok && r.op === "handoff") {
      expect(["queued", "delivered"]).toContain(r.status);
      expect(r.handoffId.length).toBeGreaterThan(2);
    }
  });

  test("rejects bad token", async () => {
    const res = await fetch(`http://127.0.0.1:${sticky!.meta.port}/rpc`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer wrong",
      },
      body: JSON.stringify({ op: "ping" }),
    });
    expect(res.status).toBe(401);
  });

  test("0.12 board: list_tasks / add_task / update_task via sticky", async () => {
    const empty = await stickyRpc({ op: "list_tasks" }, { meta: sticky!.meta });
    expect(empty.ok).toBe(true);
    if (empty.ok && empty.op === "list_tasks") {
      expect(empty.count).toBe(0);
    }

    const added = await stickyRpc(
      { op: "add_task", title: "from sticky board", status: "todo" },
      { meta: sticky!.meta },
    );
    expect(added.ok).toBe(true);
    if (!added.ok || added.op !== "add_task") throw new Error("add_task failed");
    expect(added.task.title).toBe("from sticky board");
    const id = added.task.id;

    const listed = await stickyRpc({ op: "list_tasks" }, { meta: sticky!.meta });
    expect(listed.ok).toBe(true);
    if (listed.ok && listed.op === "list_tasks") {
      expect(listed.count).toBeGreaterThanOrEqual(1);
      expect(listed.board?.tasks.some((t) => t.id === id)).toBe(true);
    }

    const upd = await stickyRpc(
      { op: "update_task", id, status: "doing" },
      { meta: sticky!.meta },
    );
    expect(upd.ok).toBe(true);
    if (upd.ok && upd.op === "update_task") {
      expect(upd.task.status).toBe("doing");
    }
  });

  test("F-2: resolveLiveHostMeta null when session room/peer diverges", () => {
    const alive = resolveAliveHostMeta(sessionFile);
    expect(alive).not.toBeNull();
    // rewrite session to a different room/peer while host still up
    writeFileSync(
      sessionFile,
      JSON.stringify(
        {
          ...JSON.parse(readFileSync(sessionFile, "utf8")),
          roomId: "room_OTHER",
          peerId: "p_OTHER",
        },
        null,
        2,
      ),
      "utf8",
    );
    expect(resolveLiveHostMeta(sessionFile)).toBeNull();
    expect(resolveAliveHostMeta(sessionFile)?.pid).toBe(sticky!.meta.pid);
    // restore session for remaining tests / afterAll
    writeStickyMeta(sticky!.meta);
    writeFileSync(
      sessionFile,
      JSON.stringify(
        {
          roomId: sticky!.meta.roomId,
          roomName: sticky!.meta.roomName,
          inviteCode: "restore",
          peerId: sticky!.meta.peerId,
          displayName: sticky!.meta.displayName,
          agentKind: "shell",
          relayUrl: `ws://127.0.0.1:${port}/ws`,
          updatedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      "utf8",
    );
    expect(resolveLiveHostMeta(sessionFile)?.peerId).toBe("p_alice_sticky");
  });

  test("F-3: concurrent handoffs get distinct handoffIds", async () => {
    const [a, b] = await Promise.all([
      stickyRpc(
        { op: "handoff", to: "@bob", body: "concurrent-a" },
        { meta: sticky!.meta },
      ),
      stickyRpc(
        { op: "handoff", to: "@bob", body: "concurrent-b" },
        { meta: sticky!.meta },
      ),
    ]);
    expect(a.ok && a.op === "handoff").toBe(true);
    expect(b.ok && b.op === "handoff").toBe(true);
    if (a.ok && a.op === "handoff" && b.ok && b.op === "handoff") {
      expect(a.handoffId).not.toBe(b.handoffId);
    }
  });

  test("protocol version constant still 1", () => {
    expect(PROTOCOL_VERSION).toBe(1);
  });
});
