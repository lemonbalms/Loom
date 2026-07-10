import { describe, expect, test, afterAll } from "bun:test";
import { RelayServer } from "@loom/relay";
import { RelayClient } from "./relay-client";

/**
 * L-4: concurrent requestOnce must not steal each other's acks via onEnvelope hijack.
 */
describe("L-4 requestOnce waiter queue", () => {
  const port = 19600 + Math.floor(Math.random() * 400);
  const relay = new RelayServer({ host: "127.0.0.1", port });
  relay.start();

  afterAll(() => {
    relay.stop();
  });

  test("concurrent handoffs both receive distinct acks", async () => {
    const alice = new RelayClient({ url: `ws://127.0.0.1:${port}/ws` });
    const bob = new RelayClient({ url: `ws://127.0.0.1:${port}/ws` });

    const created = await alice.createRoom({
      roomName: "l4",
      displayName: "alice",
      agentKind: "shell",
      peerId: "p_l4_alice",
    });
    expect(created.type).toBe("room.state");
    if (created.type !== "room.state") return;
    const code = created.inviteCode!;
    const secret = created.peerSecret;

    await bob.joinRoom({
      inviteCode: code,
      displayName: "bob",
      agentKind: "shell",
      peerId: "p_l4_bob",
    });

    // Fire two handoffs concurrently from alice — old code could drop one ack
    const [a1, a2] = await Promise.all([
      alice.handoff({ to: "@bob", body: "msg-one" }),
      alice.handoff({ to: "@bob", body: "msg-two" }),
    ]);
    expect(a1.type).toBe("handoff.ack");
    expect(a2.type).toBe("handoff.ack");
    expect(a1.handoffId).not.toBe(a2.handoffId);
    expect(a1.status === "delivered" || a1.status === "queued").toBe(true);
    expect(a2.status === "delivered" || a2.status === "queued").toBe(true);
    // L-4 residual: acks should carry requestId when client sent one
    expect(typeof (a1 as { requestId?: string }).requestId).toBe("string");
    expect(typeof (a2 as { requestId?: string }).requestId).toBe("string");
    expect((a1 as { requestId?: string }).requestId).not.toBe(
      (a2 as { requestId?: string }).requestId,
    );

    // User onEnvelope still works alongside pending waiters
    const seen: string[] = [];
    const listen = new RelayClient({
      url: `ws://127.0.0.1:${port}/ws`,
      onEnvelope(env) {
        if (env.type === "room.state") seen.push("room.state");
      },
    });
    await listen.joinRoom({
      inviteCode: code,
      displayName: "alice",
      agentKind: "shell",
      peerId: "p_l4_alice",
      peerSecret: secret,
    });
    const peers = await listen.listPeers();
    expect(peers.type).toBe("room.state");
    expect(seen.length).toBeGreaterThanOrEqual(1);

    alice.close();
    bob.close();
    listen.close();
  });
});
