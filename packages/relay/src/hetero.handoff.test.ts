import { describe, expect, test } from "bun:test";
import { Room } from "./room";

/**
 * Phase 2: heterogeneous agent kinds can hand off without sharing a CLI.
 * Simulates claude peer → codex peer claim path at the room layer.
 */
describe("hetero agent handoff", () => {
  function mockSocket() {
    const sent: string[] = [];
    return {
      sent,
      socket: { send: (d: string) => sent.push(d) },
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
    socket: { send: (d: string) => void },
  ) {
    const r = room.addPeer(partial, socket);
    if (!r.ok) throw new Error(r.message);
    return r;
  }

  test("claude → offline codex: queue then claim", () => {
    const room = new Room("hetero");
    const claude = mockSocket();
    const codex = mockSocket();

    mustAdd(
      room,
      { id: "p_claude", displayName: "alice", agentKind: "claude" },
      claude.socket,
    );
    const bob = mustAdd(
      room,
      { id: "p_codex", displayName: "bob", agentKind: "codex" },
      codex.socket,
    );
    room.setOffline("p_codex");

    const ho = room.resolveHandoff("p_claude", {
      to: "@bob",
      body: "Review API schema from Claude side",
      mode: "task",
    });
    const result = room.routeHandoff(ho);
    expect(result.status).toBe("queued");
    expect(result.recipientCount).toBe(1);

    // codex reconnects with peer secret (M-7)
    mustAdd(
      room,
      {
        id: "p_codex",
        displayName: "bob",
        agentKind: "codex",
        secret: bob.secret,
      },
      codex.socket,
    );
    const inbox = room.listInbox("p_codex");
    expect(inbox).toHaveLength(1);
    expect(inbox[0]!.handoff.fromPeerId).toBe("p_claude");

    const claim = room.claimHandoff("p_codex", ho.id, "claim");
    expect(claim.ok).toBe(true);
    if (claim.ok) {
      expect(claim.entry.status).toBe("claimed");
      expect(claim.entry.handoff.body).toContain("API schema");
      expect(claim.entry.handoff.mode).toBe("task");
    }

    const peers = room.listPeers();
    expect(peers.find((p) => p.id === "p_claude")?.agentKind).toBe("claude");
    expect(peers.find((p) => p.id === "p_codex")?.agentKind).toBe("codex");
  });

  test("grok broadcast reaches claude and codex inboxes", () => {
    const room = new Room("hetero");
    mustAdd(
      room,
      { id: "p_g", displayName: "g", agentKind: "grok" },
      mockSocket().socket,
    );
    mustAdd(
      room,
      { id: "p_c", displayName: "c", agentKind: "claude" },
      mockSocket().socket,
    );
    mustAdd(
      room,
      { id: "p_x", displayName: "x", agentKind: "codex" },
      mockSocket().socket,
    );
    room.setOffline("p_c");
    room.setOffline("p_x");

    const ho = room.resolveHandoff("p_g", {
      to: "*",
      body: "stand up notes from grok",
    });
    const r = room.routeHandoff(ho);
    expect(r.recipientCount).toBe(2);
    expect(room.listInbox("p_c")).toHaveLength(1);
    expect(room.listInbox("p_x")).toHaveLength(1);
  });
});
