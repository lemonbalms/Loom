import { describe, expect, test, afterAll } from "bun:test";
import {
  RelayServer,
  isLoopbackHost,
  timingSafeTokenEqual,
} from "./server";
import { PROTOCOL_VERSION } from "@loom/protocol";
import { Room } from "./room";

describe("RelayServer auth (Phase 3 / 0.3.1)", () => {
  const port = 19000 + Math.floor(Math.random() * 500);
  const token = "test-secret-token";
  const server = new RelayServer({
    host: "127.0.0.1",
    port,
    authToken: token,
  });
  server.start();

  afterAll(() => server.stop());

  test("rejects WS without token", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/ws`);
    expect(res.status).toBe(401);
  });

  test("health is open", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    expect(res.ok).toBe(true);
    const j = (await res.json()) as { auth: boolean };
    expect(j.auth).toBe(true);
  });

  test("rooms requires token (query fallback)", async () => {
    const no = await fetch(`http://127.0.0.1:${port}/rooms`);
    expect(no.status).toBe(401);
    const ok = await fetch(`http://127.0.0.1:${port}/rooms?token=${token}`);
    expect(ok.ok).toBe(true);
  });

  test("rooms accepts Bearer header", async () => {
    const ok = await fetch(`http://127.0.0.1:${port}/rooms`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(ok.ok).toBe(true);
  });

  test("WS with query token can create room (fallback)", async () => {
    const ws = await new Promise<WebSocket>((resolve, reject) => {
      const w = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${token}`);
      const t = setTimeout(() => reject(new Error("connect timeout")), 2000);
      w.onopen = () => {
        clearTimeout(t);
        resolve(w);
      };
      w.onerror = () => {
        clearTimeout(t);
        reject(new Error("ws error"));
      };
    });
    const roomState = await new Promise<Record<string, unknown>>(
      (resolve, reject) => {
        const t = setTimeout(() => reject(new Error("timeout")), 2000);
        ws.onmessage = (ev) => {
          clearTimeout(t);
          resolve(JSON.parse(String(ev.data)));
        };
        ws.send(
          JSON.stringify({
            type: "create",
            v: PROTOCOL_VERSION,
            roomName: "auth-room",
            peer: { id: "p1", displayName: "alice", agentKind: "shell" },
          }),
        );
      },
    );
    expect(roomState.type).toBe("room.state");
    ws.close();
  });

  test("WS with Bearer header can create room (H-6 preferred)", async () => {
    const ws = await new Promise<WebSocket>((resolve, reject) => {
      const w = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const t = setTimeout(() => reject(new Error("connect timeout")), 2000);
      w.onopen = () => {
        clearTimeout(t);
        resolve(w);
      };
      w.onerror = () => {
        clearTimeout(t);
        reject(new Error("ws error"));
      };
    });
    const roomState = await new Promise<Record<string, unknown>>(
      (resolve, reject) => {
        const t = setTimeout(() => reject(new Error("timeout")), 2000);
        ws.onmessage = (ev) => {
          clearTimeout(t);
          resolve(JSON.parse(String(ev.data)));
        };
        ws.send(
          JSON.stringify({
            type: "create",
            v: PROTOCOL_VERSION,
            roomName: "bearer-room",
            peer: { id: "p2", displayName: "bob", agentKind: "shell" },
          }),
        );
      },
    );
    expect(roomState.type).toBe("room.state");
    ws.close();
  });

  test("server.url never embeds token", () => {
    expect(server.url).not.toContain("token=");
    expect(server.url).toBe(`ws://127.0.0.1:${port}/ws`);
  });
});

describe("H-5 fail-open refusal", () => {
  test("isLoopbackHost", () => {
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(isLoopbackHost("::1")).toBe(true);
    expect(isLoopbackHost("0.0.0.0")).toBe(false);
    expect(isLoopbackHost("10.0.0.1")).toBe(false);
  });

  test("non-loopback without token refuses start", () => {
    const s = new RelayServer({
      host: "0.0.0.0",
      port: 19991,
      authToken: undefined,
    });
    expect(() => s.assertBindAllowed()).toThrow(/Refusing to bind/);
    expect(() => s.start()).toThrow(/Refusing to bind/);
  });

  test("non-loopback with token allowed", () => {
    const s = new RelayServer({
      host: "0.0.0.0",
      port: 19992,
      authToken: "secret",
    });
    expect(() => s.assertBindAllowed()).not.toThrow();
  });

  test("non-loopback insecure-open allowed", () => {
    const s = new RelayServer({
      host: "0.0.0.0",
      port: 19993,
      allowInsecureOpen: true,
    });
    expect(() => s.assertBindAllowed()).not.toThrow();
  });

  test("loopback open allowed", () => {
    const s = new RelayServer({
      host: "127.0.0.1",
      port: 19994,
    });
    expect(() => s.assertBindAllowed()).not.toThrow();
  });
});

describe("M-5 timingSafeTokenEqual", () => {
  test("equal and unequal", () => {
    expect(timingSafeTokenEqual("abc", "abc")).toBe(true);
    expect(timingSafeTokenEqual("abc", "abd")).toBe(false);
    expect(timingSafeTokenEqual("abc", "ab")).toBe(false);
    expect(timingSafeTokenEqual("", "")).toBe(true);
  });
});

describe("M-6 stale socket close", () => {
  test("setOfflineIfSocket ignores non-current socket", () => {
    const room = new Room("demo");
    const sockA = { send: () => {}, close: () => {} };
    const sockB = { send: () => {}, close: () => {} };
    const first = room.addPeer(
      { id: "p1", displayName: "alice", agentKind: "shell" },
      sockA,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    // reconnect with B + secret (M-7)
    const second = room.addPeer(
      {
        id: "p1",
        displayName: "alice",
        agentKind: "shell",
        secret: first.secret,
      },
      sockB,
    );
    expect(second.ok).toBe(true);
    expect(room.isOnline("p1")).toBe(true);
    expect(room.setOfflineIfSocket("p1", sockA)).toBeUndefined();
    expect(room.isOnline("p1")).toBe(true);
    expect(room.setOfflineIfSocket("p1", sockB)).toBeDefined();
    expect(room.isOnline("p1")).toBe(false);
  });
});

describe("M-7 peer secret", () => {
  test("rejoin without secret fails; with secret succeeds", () => {
    const room = new Room("m7");
    const a = { send: () => {} };
    const b = { send: () => {} };
    const first = room.addPeer(
      { id: "p1", displayName: "alice", agentKind: "shell" },
      a,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    room.setOffline("p1");
    const bad = room.addPeer(
      { id: "p1", displayName: "alice", agentKind: "shell" },
      b,
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.code).toBe("peer_auth_failed");
    const good = room.addPeer(
      {
        id: "p1",
        displayName: "alice",
        agentKind: "shell",
        secret: first.secret,
      },
      b,
    );
    expect(good.ok).toBe(true);
  });
});
