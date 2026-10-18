import { describe, expect, test } from "bun:test";
import { PROTOCOL_VERSION, type Envelope } from "@loom/protocol";
import * as relayClientModule from "./relay-client";
import { RelayClient } from "./relay-client";

/**
 * v0.44.1 P1 (PLAN `#### 0.44.1` D1–D5 · R1–R5 · R65-M1 · R65-M2).
 * New exports are read off the namespace so a missing export fails an
 * assertion instead of the module link.
 */
const mod = relayClientModule as unknown as {
  reconnectDelayMs?: (attempt: number, rand: () => number) => number;
  DEFAULT_MAX_RECONNECT_ATTEMPTS?: number;
};

type JoinReply =
  | { kind: "ok" }
  | { kind: "error"; code: string; message: string }
  | { kind: "drop" };

type ServerSocket = { send(data: string): void; close(): void };

/**
 * Local fake relay: rejects the first `rejectUpgrades` upgrades after the
 * initial one, answers each join from `joinReplies` (default ok), counts
 * upgrade requests and joins.
 */
function startReconnectRelay(opts: {
  rejectUpgrades?: number;
  rejectAllAfterFirst?: boolean;
  joinReplies?: JoinReply[];
} = {}): {
  url: string;
  upgrades(): number;
  joins(): number;
  serverCloses(): number;
  socketCloses(): number;
  dropAll(): void;
  stop(): void;
} {
  const sockets = new Set<ServerSocket>();
  const joinReplies = [...(opts.joinReplies ?? [])];
  let upgrades = 0;
  let joins = 0;
  let serverCloses = 0;
  let socketCloses = 0;
  let rejectLeft = opts.rejectUpgrades ?? 0;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req, srv) {
      const url = new URL(req.url);
      if (url.pathname !== "/ws") {
        return new Response("not found", { status: 404 });
      }
      upgrades += 1;
      if (upgrades > 1 && (opts.rejectAllAfterFirst || rejectLeft > 0)) {
        if (rejectLeft > 0) rejectLeft -= 1;
        return new Response("unavailable", { status: 503 });
      }
      if (srv.upgrade(req)) return undefined;
      return new Response("upgrade failed", { status: 400 });
    },
    websocket: {
      open(ws) {
        sockets.add(ws);
      },
      close(ws) {
        socketCloses += 1;
        sockets.delete(ws);
      },
      message(ws, raw) {
        const msg = JSON.parse(
          typeof raw === "string" ? raw : raw.toString(),
        ) as { type?: string; requestId?: unknown };
        if (msg.type !== "join") return;
        joins += 1;
        const reply = joinReplies.shift() ?? { kind: "ok" };
        if (reply.kind === "drop") {
          serverCloses += 1;
          ws.close();
          return;
        }
        const envelope: Record<string, unknown> =
          reply.kind === "ok"
            ? {
                v: PROTOCOL_VERSION,
                type: "room.state",
                roomId: "room_reconnect",
                ts: "2026-10-18T12:00:00.000Z",
                peers: [],
                roomName: "reconnect",
                inviteCode: "LOOM-ABCD",
              }
            : {
                v: PROTOCOL_VERSION,
                type: "error",
                roomId: "none",
                ts: "2026-10-18T12:00:00.000Z",
                code: reply.code,
                message: reply.message,
              };
        if (typeof msg.requestId === "string") {
          envelope.requestId = msg.requestId;
        }
        ws.send(JSON.stringify(envelope));
      },
    },
  });
  return {
    url: `ws://127.0.0.1:${server.port}/ws`,
    upgrades: () => upgrades,
    joins: () => joins,
    serverCloses: () => serverCloses,
    socketCloses: () => socketCloses,
    dropAll() {
      for (const ws of [...sockets]) {
        serverCloses += 1;
        ws.close();
      }
    },
    stop() {
      server.stop(true);
    },
  };
}

type Harness = {
  client: RelayClient;
  errors: string[];
  chats: string[];
  closes(): number;
};

function openReconnectClient(
  url: string,
  extra: { maxReconnectAttempts?: number } = {},
): Harness {
  const errors: string[] = [];
  const chats: string[] = [];
  let closes = 0;
  const client = new RelayClient({
    url,
    autoReconnect: true,
    reconnectJoin: { inviteCode: "LOOM-ABCD", displayName: "bridge" },
    reconnectRandom: () => 0,
    ...extra,
    onError(err) {
      errors.push(err.message);
    },
    onClose() {
      closes += 1;
    },
    onEnvelope(env: Envelope) {
      if (env.type !== "chat") return;
      const row = env as { from?: string; text?: string };
      if (
        row.from === "system" &&
        typeof row.text === "string" &&
        row.text.startsWith("reconnected (attempt ")
      ) {
        chats.push(row.text);
      }
    },
  } as ConstructorParameters<typeof RelayClient>[0]);
  return { client, errors, chats, closes: () => closes };
}

async function waitFor(pred: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("timed out waiting for reconnect state");
    }
    await Bun.sleep(10);
  }
}

describe("v0.44.1 P1 curve (D2 · R4 · R5)", () => {
  test("reconnectDelayMs is exported and applies equal jitter on the 15 s curve", () => {
    expect(typeof mod.reconnectDelayMs).toBe("function");
    const delay = mod.reconnectDelayMs as (
      attempt: number,
      rand: () => number,
    ) => number;
    const zero = () => 0;
    const nearOne = () => 0.99;
    // rand 0 → base/2
    expect(delay(0, zero)).toBe(500);
    expect(delay(1, zero)).toBe(1000);
    expect(delay(2, zero)).toBe(2000);
    expect(delay(3, zero)).toBe(4000);
    // rand → 1 stays below base
    expect(delay(0, nearOne)).toBeGreaterThanOrEqual(500);
    expect(delay(0, nearOne)).toBeLessThan(1000);
    expect(delay(3, nearOne)).toBeLessThan(8000);
    // attempt ≥ 4 → [7500, 15000)
    for (const attempt of [4, 5, 10, 30]) {
      for (const rand of [zero, () => 0.5, nearOne]) {
        const d = delay(attempt, rand);
        expect(d).toBeGreaterThanOrEqual(7500);
        expect(d).toBeLessThan(15000);
      }
    }
    // R4: huge attempt counts stay finite (2 ** n → Infinity, min → 15000)
    for (const attempt of [1023, 1024, 2000]) {
      const d = delay(attempt, () => 0.5);
      expect(Number.isFinite(d)).toBe(true);
      expect(d).toBe(11250);
    }
  });
});

describe("v0.44.1 P1 default cap (D1 · R65-M2)", () => {
  test("DEFAULT_MAX_RECONNECT_ATTEMPTS is Infinity", () => {
    expect(mod.DEFAULT_MAX_RECONNECT_ATTEMPTS).toBe(Infinity);
  });

  test(
    "maxReconnectAttempts: 1 gives up with exactly one line after one failed attempt",
    async () => {
      const relay = startReconnectRelay({ rejectAllAfterFirst: true });
      const h = openReconnectClient(relay.url, { maxReconnectAttempts: 1 });
      try {
        await h.client.connect();
        relay.dropAll();
        await waitFor(
          () => h.errors.some((m) => m.startsWith("Reconnect gave up")),
          6000,
        );
        await Bun.sleep(300);
        const gaveUp = h.errors.filter((m) => m.startsWith("Reconnect gave up"));
        expect(gaveUp).toEqual(["Reconnect gave up after 1 attempts"]);
        expect(relay.upgrades()).toBe(2);
      } finally {
        h.client.close();
        relay.stop();
      }
    },
    15000,
  );

  test(
    "default client past 20 attempts does not give up and keeps a reconnect timer pending",
    async () => {
      const relay = startReconnectRelay({ rejectAllAfterFirst: true });
      const h = openReconnectClient(relay.url);
      try {
        await h.client.connect();
        (h.client as unknown as { reconnectAttempt: number }).reconnectAttempt =
          25;
        relay.dropAll();
        await waitFor(() => h.closes() >= 1, 2000);
        await Bun.sleep(200);
        expect(h.errors.filter((m) => m.includes("gave up"))).toEqual([]);
        expect(
          (h.client as unknown as { reconnectTimer: unknown }).reconnectTimer,
        ).not.toBeNull();
        expect(relay.upgrades()).toBe(1);
      } finally {
        h.client.close();
        relay.stop();
      }
    },
    10000,
  );
});

describe("v0.44.1 P1 one increment per failed attempt (D3 · R1 · R65-M1)", () => {
  test(
    "one rejected upgrade then accept → reconnected (attempt 2) after exactly two reconnect upgrades",
    async () => {
      const relay = startReconnectRelay({ rejectUpgrades: 1 });
      const h = openReconnectClient(relay.url);
      try {
        await h.client.connect();
        relay.dropAll();
        await waitFor(() => h.chats.length >= 1, 12000);
        await Bun.sleep(300);
        expect(h.chats).toEqual(["reconnected (attempt 2)"]);
        // initial + rejected + accepted
        expect(relay.upgrades()).toBe(3);
        expect(relay.joins()).toBe(1);
      } finally {
        h.client.close();
        relay.stop();
      }
    },
    20000,
  );

  test(
    "server drops the socket while the reconnect join is pending → one more upgrade and one synthetic chat",
    async () => {
      const relay = startReconnectRelay({ joinReplies: [{ kind: "drop" }] });
      const h = openReconnectClient(relay.url);
      try {
        await h.client.connect();
        relay.dropAll();
        await waitFor(() => relay.joins() >= 1, 5000);
        const droppedAt = Date.now();
        // A pending join only settles at the 8 s request timeout.
        await waitFor(() => h.chats.length >= 1, 14000);
        const settleUntil = droppedAt + 11000;
        if (Date.now() < settleUntil) await Bun.sleep(settleUntil - Date.now());
        expect(h.chats).toEqual(["reconnected (attempt 2)"]);
        // initial + dropped-join socket + exactly one more
        expect(relay.upgrades()).toBe(3);
        expect(relay.joins()).toBe(2);
      } finally {
        h.client.close();
        relay.stop();
      }
    },
    25000,
  );
});

describe("v0.44.1 P1 counter reset on join (D4 · R2)", () => {
  test(
    "after a successful reconnect, the next drop reports reconnected (attempt 1) again",
    async () => {
      const relay = startReconnectRelay();
      const h = openReconnectClient(relay.url);
      try {
        await h.client.connect();
        relay.dropAll();
        await waitFor(() => h.chats.length >= 1, 6000);
        relay.dropAll();
        await waitFor(() => h.chats.length >= 2, 6000);
        await Bun.sleep(200);
        expect(h.chats).toEqual([
          "reconnected (attempt 1)",
          "reconnected (attempt 1)",
        ]);
        expect(relay.upgrades()).toBe(3);
      } finally {
        h.client.close();
        relay.stop();
      }
    },
    20000,
  );
});

describe("v0.44.1 P1 stop on unretryable join errors (D5 · R3)", () => {
  for (const code of ["peer_auth_failed", "room_not_found"]) {
    test(
      `reconnect join ${code} → one stop line, socket closed, no further upgrades`,
      async () => {
        const relay = startReconnectRelay({
          joinReplies: [{ kind: "error", code, message: `rejected ${code}` }],
        });
        const h = openReconnectClient(relay.url);
        try {
          await h.client.connect();
          relay.dropAll();
          await waitFor(() => relay.joins() >= 1, 5000);
          await waitFor(
            () => h.errors.some((m) => m.includes(`rejected ${code}`)),
            3000,
          );
          // Bounded wait: a wrongly scheduled retry (rand 0) would land well inside this.
          await Bun.sleep(1500);
          const stopped = h.errors.filter((m) =>
            m.startsWith("Reconnect stopped: "),
          );
          expect(stopped).toHaveLength(1);
          expect(stopped[0]).toMatch(new RegExp(`^Reconnect stopped: ${code} — `));
          expect(stopped[0]).toContain(`rejected ${code}`);
          expect(h.client.wsOpen).toBe(false);
          // initial + the one reconnect whose join was refused
          expect(relay.upgrades()).toBe(2);
          expect(relay.joins()).toBe(1);
          expect(h.chats).toEqual([]);
        } finally {
          h.client.close();
          relay.stop();
        }
      },
      15000,
    );
  }

  test(
    "reconnect join persist_failed → socket closed and a second join arrives",
    async () => {
      const relay = startReconnectRelay({
        joinReplies: [
          { kind: "error", code: "persist_failed", message: "disk full" },
        ],
      });
      const h = openReconnectClient(relay.url);
      try {
        await h.client.connect();
        relay.dropAll();
        await waitFor(() => relay.joins() >= 1, 5000);
        await waitFor(() => h.chats.length >= 1, 6000).catch(() => undefined);
        expect(relay.joins()).toBe(2);
        // initial drop + the refused-join socket closed by the client
        expect(relay.socketCloses()).toBe(2);
        expect(h.errors.some((m) => m.startsWith("Reconnect stopped: "))).toBe(
          false,
        );
        // initial + refused-join socket + retry socket
        expect(relay.upgrades()).toBe(3);
        expect(h.chats).toHaveLength(1);
        expect(h.client.wsOpen).toBe(true);
      } finally {
        h.client.close();
        relay.stop();
      }
    },
    20000,
  );
});
