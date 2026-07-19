import { describe, expect, test, afterAll } from "bun:test";
import { mkdirSync, rmSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PROTOCOL_VERSION } from "@loom/protocol";
import { RelayServer } from "./server";
import { RoomRegistry } from "./room";
import { releaseStateDirLock } from "./persist";

describe("RelayServer integration M1.1", () => {
  const port = 18000 + Math.floor(Math.random() * 1000);
  const server = new RelayServer({ host: "127.0.0.1", port });
  server.start();

  afterAll(() => {
    server.stop();
  });

  function connect(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      const t = setTimeout(() => reject(new Error("connect timeout")), 2000);
      ws.onopen = () => {
        clearTimeout(t);
        resolve(ws);
      };
      ws.onerror = () => {
        clearTimeout(t);
        reject(new Error("ws error"));
      };
    });
  }

  function waitFor(
    ws: WebSocket,
    pred: (msg: Record<string, unknown>) => boolean,
    timeoutMs = 3000,
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(
        () => reject(new Error("timeout waiting for message")),
        timeoutMs,
      );
      const prev = ws.onmessage;
      ws.onmessage = (ev) => {
        if (typeof prev === "function") prev.call(ws, ev);
        const msg = JSON.parse(String(ev.data)) as Record<string, unknown>;
        if (pred(msg)) {
          clearTimeout(t);
          ws.onmessage = prev;
          resolve(msg);
        }
      };
    });
  }

  test("offline-at-send handoff then rejoin list_inbox", async () => {
    const a = await connect();
    const createP = waitFor(a, (m) => m.type === "room.state");
    a.send(
      JSON.stringify({
        type: "create",
        v: PROTOCOL_VERSION,
        roomName: "itest",
        peer: { id: "p_a", displayName: "alice", agentKind: "claude" },
      }),
    );
    const created = await createP;
    const code = created.inviteCode as string;
    const aliceSecret = created.peerSecret as string;
    expect(typeof aliceSecret).toBe("string");
    expect(aliceSecret.length).toBeGreaterThan(10);

    const b = await connect();
    const joinP = waitFor(b, (m) => m.type === "room.state");
    b.send(
      JSON.stringify({
        type: "join",
        v: PROTOCOL_VERSION,
        inviteCode: code,
        peer: { id: "p_b", displayName: "bob", agentKind: "codex" },
      }),
    );
    await joinP;

    // alice goes offline
    a.close();
    await Bun.sleep(50);

    const ackP = waitFor(b, (m) => m.type === "handoff.ack");
    b.send(
      JSON.stringify({
        type: "handoff",
        v: PROTOCOL_VERSION,
        handoff: { to: "@alice", body: "the british are coming" },
      }),
    );
    const ack = await ackP;
    expect(ack.status).toBe("queued");
    expect(ack.recipientCount).toBe(1);

    // alice reconnects with M-7 peerSecret (token+invite alone cannot take over)
    const a2 = await connect();
    const rejoinP = waitFor(a2, (m) => m.type === "room.state");
    a2.send(
      JSON.stringify({
        type: "join",
        v: PROTOCOL_VERSION,
        inviteCode: code,
        peer: {
          id: "p_a",
          displayName: "alice",
          agentKind: "claude",
          secret: aliceSecret,
        },
      }),
    );
    await rejoinP;

    const inboxP = waitFor(a2, (m) => m.type === "inbox.state");
    a2.send(
      JSON.stringify({ type: "list_inbox", v: PROTOCOL_VERSION }),
    );
    const inbox = await inboxP;
    const entries = inbox.entries as { handoff: { body: string } }[];
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries.some((e) => e.handoff.body.includes("british"))).toBe(true);

    b.close();
    a2.close();
  });
});

describe("RelayServer D2 handler crash guard (0.24.2)", () => {
  const port = 19000 + Math.floor(Math.random() * 1000);
  const stateDir = join(
    tmpdir(),
    `loom-d2-state-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  mkdirSync(stateDir, { recursive: true });
  const registry = new RoomRegistry({ stateDir });
  const server = new RelayServer({
    host: "127.0.0.1",
    port,
    registry,
  });
  server.start();

  afterAll(() => {
    try {
      chmodSync(stateDir, 0o700);
    } catch {
      /* */
    }
    server.stop();
    try {
      registry.close();
    } catch {
      /* */
    }
    try {
      releaseStateDirLock(stateDir);
    } catch {
      /* */
    }
    try {
      rmSync(stateDir, { recursive: true, force: true });
    } catch {
      /* */
    }
  });

  function connect(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
      const t = setTimeout(() => reject(new Error("connect timeout")), 2000);
      ws.onopen = () => {
        clearTimeout(t);
        resolve(ws);
      };
      ws.onerror = () => {
        clearTimeout(t);
        reject(new Error("ws error"));
      };
    });
  }

  function waitFor(
    ws: WebSocket,
    pred: (msg: Record<string, unknown>) => boolean,
    timeoutMs = 3000,
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const t = setTimeout(
        () => reject(new Error("timeout waiting for message")),
        timeoutMs,
      );
      const prev = ws.onmessage;
      ws.onmessage = (ev) => {
        if (typeof prev === "function") prev.call(ws, ev);
        const msg = JSON.parse(String(ev.data)) as Record<string, unknown>;
        if (pred(msg)) {
          clearTimeout(t);
          ws.onmessage = prev;
          resolve(msg);
        }
      };
    });
  }

  test("handleMessage throw (persist fail create) → server survives + next request ok", async () => {
    // Make durable state unwritable so create's saveRoomSnapshot rethrows
    chmodSync(stateDir, 0o500);

    const a = await connect();
    a.send(
      JSON.stringify({
        type: "create",
        v: PROTOCOL_VERSION,
        roomName: "boom-room",
        peer: { id: "p_boom", displayName: "boom", agentKind: "claude" },
      }),
    );
    // create fails closed: no room.state (client timeout / silent). Give handler time.
    await Bun.sleep(150);

    // Restore writability — server must still be alive for a successful create
    chmodSync(stateDir, 0o700);

    const b = await connect();
    const createP = waitFor(b, (m) => m.type === "room.state");
    b.send(
      JSON.stringify({
        type: "create",
        v: PROTOCOL_VERSION,
        roomName: "alive-room",
        peer: { id: "p_alive", displayName: "alive", agentKind: "claude" },
      }),
    );
    const created = await createP;
    expect(created.type).toBe("room.state");
    expect(typeof created.inviteCode).toBe("string");
    expect(typeof created.peerSecret).toBe("string");

    a.close();
    b.close();
  });
});

