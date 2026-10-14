import { describe, expect, test, afterAll, beforeAll } from "bun:test";
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

describe("v0.29.0 PATCH 1 expected-red", () => {
  const stateDir = join(
    tmpdir(),
    `loom-p1-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  let port = 0;
  let registry: RoomRegistry | null = null;
  let server: RelayServer | null = null;
  const sockets: WebSocket[] = [];

  const ROOM_TYPES = new Set([
    "chat",
    "peer.join",
    "peer.leave",
    "peer.presence",
    "handoff",
  ]);
  const RPC_TYPES = new Set([
    "handoff.ack",
    "room.state",
    "inbox.state",
    "inbox.claim_result",
    "error",
  ]);

  beforeAll(() => {
    mkdirSync(stateDir, { recursive: true });
    registry = new RoomRegistry({ stateDir });
    let last: unknown;
    for (let i = 0; i < 20; i++) {
      port = 24000 + Math.floor(Math.random() * 2000);
      const candidate = new RelayServer({
        host: "127.0.0.1",
        port,
        registry,
      });
      try {
        candidate.start();
        server = candidate;
        return;
      } catch (e) {
        last = e;
        try {
          candidate.stop();
        } catch {
          /* */
        }
      }
    }
    throw new Error(
      `failed to bind PATCH 1 relay: ${last instanceof Error ? last.message : String(last)}`,
    );
  });

  afterAll(() => {
    for (const ws of sockets) {
      try {
        ws.close();
      } catch {
        /* */
      }
    }
    try {
      chmodSync(stateDir, 0o700);
    } catch {
      /* */
    }
    try {
      server?.stop();
    } catch {
      /* */
    }
    try {
      registry?.close();
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
      sockets.push(ws);
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

  function collect(ws: WebSocket): Record<string, unknown>[] {
    const all: Record<string, unknown>[] = [];
    ws.onmessage = (ev) => {
      all.push(JSON.parse(String(ev.data)) as Record<string, unknown>);
    };
    return all;
  }

  async function until(
    buf: Record<string, unknown>[],
    pred: (m: Record<string, unknown>) => boolean,
    label: string,
    timeoutMs = 3000,
  ): Promise<Record<string, unknown>> {
    const start = Date.now();
    for (;;) {
      const hit = buf.find(pred);
      if (hit) return hit;
      if (Date.now() - start > timeoutMs) {
        throw new Error(`timeout waiting for ${label}`);
      }
      await Bun.sleep(15);
    }
  }

  function peer(id: string, displayName: string, agentKind: string) {
    return { id, displayName, agentKind };
  }

  test("(a) room events are stamped once per fan-out; RPC replies are not", async () => {
    const shared: Record<string, unknown>[] = [];
    const alice = await connect();
    const aliceMsgs = collect(alice);
    alice.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data)) as Record<string, unknown>;
      aliceMsgs.push(msg);
      shared.push(msg);
    };
    alice.send(
      JSON.stringify({
        type: "create",
        v: PROTOCOL_VERSION,
        roomName: "stamp",
        peer: peer("p_a", "alice", "claude"),
      }),
    );
    const created = await until(aliceMsgs, (m) => m.type === "room.state", "create");
    const code = created.inviteCode as string;

    const bob = await connect();
    const bobMsgs: Record<string, unknown>[] = [];
    bob.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data)) as Record<string, unknown>;
      bobMsgs.push(msg);
      shared.push(msg);
    };
    bob.send(
      JSON.stringify({
        type: "join",
        v: PROTOCOL_VERSION,
        inviteCode: code,
        peer: peer("p_b", "bob", "codex"),
      }),
    );
    await until(bobMsgs, (m) => m.type === "room.state", "bob join");
    await until(aliceMsgs, (m) => m.type === "peer.join", "alice sees bob");

    const carol = await connect();
    const carolMsgs: Record<string, unknown>[] = [];
    carol.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data)) as Record<string, unknown>;
      carolMsgs.push(msg);
      shared.push(msg);
    };
    carol.send(
      JSON.stringify({
        type: "join",
        v: PROTOCOL_VERSION,
        inviteCode: code,
        peer: peer("p_c", "carol", "grok"),
      }),
    );
    await until(carolMsgs, (m) => m.type === "room.state", "carol join");
    await until(
      aliceMsgs,
      (m) => m.type === "peer.join" && (m.peer as { id?: string } | undefined)?.id === "p_c",
      "alice sees carol",
    );

    alice.send(
      JSON.stringify({
        type: "chat",
        v: PROTOCOL_VERSION,
        text: "wire",
      }),
    );
    await until(bobMsgs, (m) => m.type === "chat" && m.text === "wire", "chat");
    await until(carolMsgs, (m) => m.type === "chat" && m.text === "wire", "chat carol");

    alice.send(
      JSON.stringify({
        type: "handoff",
        v: PROTOCOL_VERSION,
        requestId: "req_stamp_ho",
        handoff: { to: "@bob", body: "push-me" },
      }),
    );
    await until(aliceMsgs, (m) => m.type === "handoff.ack", "ack");
    const push = await until(bobMsgs, (m) => m.type === "handoff", "push");

    bob.send(
      JSON.stringify({
        type: "list_inbox",
        v: PROTOCOL_VERSION,
        requestId: "req_stamp_in",
      }),
    );
    await until(bobMsgs, (m) => m.type === "inbox.state", "inbox");

    bob.send(
      JSON.stringify({
        type: "claim_handoff",
        v: PROTOCOL_VERSION,
        requestId: "req_stamp_cl",
        id: (push.handoff as { id: string }).id,
      }),
    );
    await until(bobMsgs, (m) => m.type === "inbox.claim_result", "claim");

    alice.send(JSON.stringify({ type: "nope" }));
    await until(aliceMsgs, (m) => m.type === "error", "error");

    carol.close();
    await until(aliceMsgs, (m) => m.type === "peer.presence", "presence");

    bob.send(JSON.stringify({ type: "leave", v: PROTOCOL_VERSION }));
    await until(aliceMsgs, (m) => m.type === "peer.leave", "leave");

    const aliceJoins = aliceMsgs.filter((m) => m.type === "peer.join");
    const bobJoins = bobMsgs.filter((m) => m.type === "peer.join");
    expect(aliceJoins).toHaveLength(2);
    expect(bobJoins).toHaveLength(1);
    expect(bobJoins[0]!.eventId).toMatch(/^ev_.+/);
    expect(bobJoins[0]!.eventId).toBe(aliceJoins[1]!.eventId);
    expect(bobJoins[0]!.seq).toBe(aliceJoins[1]!.seq);

    const bobChat = bobMsgs.find((m) => m.type === "chat" && m.text === "wire");
    const carolChat = carolMsgs.find((m) => m.type === "chat" && m.text === "wire");
    expect(bobChat!.eventId).toMatch(/^ev_.+/);
    expect(bobChat!.eventId).toBe(carolChat!.eventId);
    expect(bobChat!.seq).toBe(carolChat!.seq);

    const roomMsgs = shared.filter((m) => ROOM_TYPES.has(String(m.type)));
    for (const m of roomMsgs) {
      expect(m.eventId).toMatch(/^ev_.+/);
      expect(typeof m.seq).toBe("number");
      expect(m.seq as number).toBeGreaterThan(0);
    }
    const byId = new Map<string, { seq: number; type: string }>();
    for (const m of roomMsgs) {
      const id = String(m.eventId);
      const prev = byId.get(id);
      if (prev) {
        expect(prev.seq).toBe(m.seq as number);
        expect(prev.type).toBe(String(m.type));
      } else {
        byId.set(id, { seq: m.seq as number, type: String(m.type) });
      }
    }
    const seqs = [...byId.values()].map((v) => v.seq).sort((a, b) => a - b);
    expect(seqs).toEqual(seqs.map((_, i) => (seqs[0] ?? 1) + i));
    expect(seqs[0]).toBe(1);
    const types = new Set([...byId.values()].map((v) => v.type));
    for (const t of ROOM_TYPES) expect(types.has(t)).toBe(true);

    for (const t of RPC_TYPES) {
      expect(shared.some((m) => m.type === t)).toBe(true);
    }
    for (const m of shared) {
      if (!RPC_TYPES.has(String(m.type))) continue;
      expect(m.eventId).toBeUndefined();
      expect(m.seq).toBeUndefined();
    }

    alice.close();
    bob.close();
  });

  test("(d) a client-supplied eventId and seq on chat are replaced with relay-issued values", async () => {
    const alice = await connect();
    const aliceMsgs = collect(alice);
    alice.send(
      JSON.stringify({
        type: "create",
        v: PROTOCOL_VERSION,
        roomName: "overwrite",
        peer: peer("p_d_a", "alice", "claude"),
      }),
    );
    const created = await until(aliceMsgs, (m) => m.type === "room.state", "create");
    const bob = await connect();
    const bobMsgs = collect(bob);
    bob.send(
      JSON.stringify({
        type: "join",
        v: PROTOCOL_VERSION,
        inviteCode: created.inviteCode,
        peer: peer("p_d_b", "bob", "codex"),
      }),
    );
    await until(bobMsgs, (m) => m.type === "room.state", "join");
    alice.send(
      JSON.stringify({
        type: "chat",
        v: PROTOCOL_VERSION,
        text: "bogus-wire",
        eventId: "ev_bogus",
        seq: 999,
      }),
    );
    const chat = await until(
      bobMsgs,
      (m) => m.type === "chat" && m.text === "bogus-wire",
      "chat",
    );
    expect(chat.eventId).toMatch(/^ev_.+/);
    expect(chat.eventId).not.toBe("ev_bogus");
    expect(chat.seq).not.toBe(999);
    expect(typeof chat.seq).toBe("number");
    expect(chat.clientEventId).toBeUndefined();
    alice.close();
    bob.close();
  });

  test("(c) same peer clientEventId routes once and replays onto the retry requestId; another peer is not suppressed", async () => {
    const clientEventId = crypto.randomUUID();
    const alice = await connect();
    const aliceMsgs = collect(alice);
    alice.send(
      JSON.stringify({
        type: "create",
        v: PROTOCOL_VERSION,
        roomName: "idem",
        peer: peer("p_c_a", "alice", "claude"),
      }),
    );
    const created = await until(aliceMsgs, (m) => m.type === "room.state", "create");
    const code = created.inviteCode as string;

    const bob = await connect();
    const bobMsgs = collect(bob);
    bob.send(
      JSON.stringify({
        type: "join",
        v: PROTOCOL_VERSION,
        inviteCode: code,
        peer: peer("p_c_b", "bob", "codex"),
      }),
    );
    await until(bobMsgs, (m) => m.type === "room.state", "bob");

    const carol = await connect();
    const carolMsgs = collect(carol);
    carol.send(
      JSON.stringify({
        type: "join",
        v: PROTOCOL_VERSION,
        inviteCode: code,
        peer: peer("p_c_c", "carol", "grok"),
      }),
    );
    await until(carolMsgs, (m) => m.type === "room.state", "carol");

    const ack1p = until(
      aliceMsgs,
      (m) => m.type === "handoff.ack" && m.requestId === "req_first",
      "ack1",
    );
    alice.send(
      JSON.stringify({
        type: "handoff",
        v: PROTOCOL_VERSION,
        requestId: "req_first",
        clientEventId,
        handoff: { to: "@bob", body: "alpha" },
      }),
    );
    const ack1 = await ack1p;
    const ack2p = until(
      aliceMsgs,
      (m) => m.type === "handoff.ack" && m.requestId === "req_retry",
      "ack2",
    );
    alice.send(
      JSON.stringify({
        type: "handoff",
        v: PROTOCOL_VERSION,
        requestId: "req_retry",
        clientEventId,
        handoff: { to: "@bob", body: "alpha-mutated" },
      }),
    );
    const ack2 = await ack2p;
    await Bun.sleep(30);
    expect(ack2.requestId).toBe("req_retry");
    expect(ack1.handoffId).toBe(ack2.handoffId);
    const alpha = bobMsgs.filter(
      (m) => m.type === "handoff" && (m.handoff as { body?: string }).body === "alpha",
    );
    expect(alpha).toHaveLength(1);
    expect((alpha[0]!.handoff as { body?: string }).body).toBe("alpha");

    const carolAckP = until(carolMsgs, (m) => m.type === "handoff.ack", "carol ack");
    carol.send(
      JSON.stringify({
        type: "handoff",
        v: PROTOCOL_VERSION,
        requestId: "req_carol",
        clientEventId,
        handoff: { to: "@bob", body: "from-carol" },
      }),
    );
    const carolAck = await carolAckP;
    await Bun.sleep(30);
    expect(carolAck.handoffId).not.toBe(ack1.handoffId);
    const fromCarol = bobMsgs.filter(
      (m) =>
        m.type === "handoff" && (m.handoff as { body?: string }).body === "from-carol",
    );
    expect(fromCarol).toHaveLength(1);

    const chatId = crypto.randomUUID();
    alice.send(
      JSON.stringify({
        type: "chat",
        v: PROTOCOL_VERSION,
        text: "chat-one",
        clientEventId: chatId,
      }),
    );
    alice.send(
      JSON.stringify({
        type: "chat",
        v: PROTOCOL_VERSION,
        text: "chat-two",
        clientEventId: chatId,
      }),
    );
    await Bun.sleep(50);
    const chats = bobMsgs.filter(
      (m) => m.type === "chat" && (m.text === "chat-one" || m.text === "chat-two"),
    );
    expect(chats).toHaveLength(1);
    expect(chats[0]!.text).toBe("chat-one");

    const rollbackId = crypto.randomUUID();
    chmodSync(stateDir, 0o500);
    try {
      const errP = until(
        aliceMsgs,
        (m) => m.type === "error" && m.requestId === "req_rollback_1",
        "persist_failed",
      );
      alice.send(
        JSON.stringify({
          type: "handoff",
          v: PROTOCOL_VERSION,
          requestId: "req_rollback_1",
          clientEventId: rollbackId,
          handoff: { to: "@bob", body: "rollback-body" },
        }),
      );
      const err = await errP;
      expect(err.code).toBe("persist_failed");
    } finally {
      chmodSync(stateDir, 0o700);
    }
    const leaked = bobMsgs.filter(
      (m) =>
        m.type === "handoff" &&
        (m.handoff as { body?: string }).body === "rollback-body",
    );
    const retryP = until(
      aliceMsgs,
      (m) => m.type === "handoff.ack" && m.requestId === "req_rollback_2",
      "rollback retry",
    );
    alice.send(
      JSON.stringify({
        type: "handoff",
        v: PROTOCOL_VERSION,
        requestId: "req_rollback_2",
        clientEventId: rollbackId,
        handoff: { to: "@bob", body: "rollback-body-retry" },
      }),
    );
    const retryAck = await retryP;
    expect(retryAck.requestId).toBe("req_rollback_2");
    const leakedId = (leaked[0]?.handoff as { id?: string } | undefined)?.id;
    if (leakedId) expect(retryAck.handoffId).not.toBe(leakedId);
    await Bun.sleep(30);
    const rollbackPushes = bobMsgs.filter((m) => {
      if (m.type !== "handoff") return false;
      const body = (m.handoff as { body?: string }).body;
      return body === "rollback-body" || body === "rollback-body-retry";
    });
    expect(rollbackPushes.length).toBeGreaterThan(leaked.length);

    alice.close();
    bob.close();
    carol.close();
  });
});

