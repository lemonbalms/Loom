import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PROTOCOL_VERSION, type Envelope } from "@loom/protocol";
import { RelayClient, type RelayClientOptions } from "./relay-client";

/**
 * PATCH 4 module. Runtime import only — see room-event-log.test.ts.
 */
const ROOM_EVENT_LOG_SPECIFIER = "./room-event-log";

type IngestResult = { deliver: boolean; logged: boolean; failOpen: boolean };

type EventStoreLike = {
  ingest(env: Envelope): Promise<IngestResult>;
};

type RoomEventRecord = {
  v: 1;
  roomId: string;
  seq: number;
  eventId: string;
  ts: string;
  type: string;
  envelope: Envelope;
};

function chat(text: string, extra: Record<string, unknown> = {}): Envelope {
  return {
    v: PROTOCOL_VERSION,
    type: "chat",
    roomId: "room_client",
    ts: "2026-03-15T12:00:00.000Z",
    from: "p1",
    text,
    ...extra,
  } as Envelope;
}

function startFakeRelay(): {
  url: string;
  send(env: Envelope): void;
  stop(): void;
} {
  const sockets = new Set<{ send(data: string): void }>();
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req, srv) {
      const url = new URL(req.url);
      if (url.pathname === "/ws" && srv.upgrade(req)) return undefined;
      return new Response("not found", { status: 404 });
    },
    websocket: {
      open(ws) {
        sockets.add(ws);
      },
      close(ws) {
        sockets.delete(ws);
      },
      message() {},
    },
  });
  return {
    url: `ws://127.0.0.1:${server.port}/ws`,
    send(env) {
      const raw = JSON.stringify(env);
      for (const ws of sockets) ws.send(raw);
    },
    stop() {
      server.stop(true);
    },
  };
}

function openClient(args: {
  url: string;
  onEnvelope?: (env: Envelope) => void;
  eventStore?: EventStoreLike;
}): RelayClient {
  return new RelayClient({
    url: args.url,
    onEnvelope: args.onEnvelope,
    eventStore: args.eventStore,
  } as unknown as RelayClientOptions);
}

async function waitFor(pred: () => boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("timed out waiting for relay client");
    }
    await Bun.sleep(10);
  }
}

describe("v0.29.0 PATCH 1 expected-red", () => {
  test("without eventStore, duplicate envelopes both reach onEnvelope", async () => {
    const relay = startFakeRelay();
    const seen: string[] = [];
    const client = openClient({
      url: relay.url,
      onEnvelope(env) {
        if (env.type === "chat") seen.push(env.text);
      },
    });
    try {
      await client.connect();
      relay.send(chat("a"));
      relay.send(chat("a"));
      await waitFor(() => seen.length >= 2);
      expect(seen).toEqual(["a", "a"]);
    } finally {
      client.close();
      relay.stop();
    }
  });

  test("eventStore runs in order before onEnvelope and a second deliver=false is dropped", async () => {
    const relay = startFakeRelay();
    const seen: string[] = [];
    let ingestCalls = 0;
    let releaseFirst: (() => void) | null = null;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const client = openClient({
      url: relay.url,
      eventStore: {
        async ingest() {
          ingestCalls += 1;
          if (ingestCalls === 1) await firstGate;
          return {
            deliver: ingestCalls === 1,
            logged: ingestCalls === 1,
            failOpen: false,
          };
        },
      },
      onEnvelope(env) {
        if (env.type === "chat") seen.push(env.text);
      },
    });
    try {
      await client.connect();
      const stamped = chat("only-once", { eventId: "ev_once", seq: 1 });
      relay.send(stamped);
      relay.send(stamped);
      await waitFor(() => ingestCalls >= 1 || seen.length >= 1);
      expect(ingestCalls).toBe(1);
      expect(seen).toEqual([]);
      releaseFirst?.();
      await waitFor(() => ingestCalls >= 2 && seen.length >= 1);
      expect(ingestCalls).toBe(2);
      expect(seen).toEqual(["only-once"]);
    } finally {
      releaseFirst?.();
      client.close();
      relay.stop();
    }
  });

  test("an envelope without eventId still reaches onEnvelope through the store", async () => {
    const relay = startFakeRelay();
    const seen: Envelope[] = [];
    let ingestCalls = 0;
    const client = openClient({
      url: relay.url,
      eventStore: {
        async ingest(env) {
          ingestCalls += 1;
          expect((env as { eventId?: string }).eventId).toBeUndefined();
          return { deliver: true, logged: false, failOpen: false };
        },
      },
      onEnvelope(env) {
        seen.push(env);
      },
    });
    try {
      await client.connect();
      relay.send(chat("legacy"));
      await waitFor(() => ingestCalls >= 1 || seen.length >= 1);
      expect(ingestCalls).toBe(1);
      expect(seen).toHaveLength(1);
      expect(seen[0]).toMatchObject({ type: "chat", text: "legacy" });
      expect((seen[0] as { eventId?: string }).eventId).toBeUndefined();
    } finally {
      client.close();
      relay.stop();
    }
  });

  test("same stamped envelope is delivered once and logged once", async () => {
    let mod: {
      RoomEventStore: new (opts: { dir: string; consumer?: string }) => EventStoreLike;
      readRoomEventLog(
        dir: string,
        roomId: string,
        month: string,
      ): Promise<{ records: RoomEventRecord[]; tornSkipped: number }>;
    };
    try {
      mod = (await import(ROOM_EVENT_LOG_SPECIFIER)) as typeof mod;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(
        `v0.29.0 PATCH 4 room-event-log is not implemented (${ROOM_EVENT_LOG_SPECIFIER}): ${msg}`,
      );
    }

    const dir = mkdtempSync(join(tmpdir(), "loom-relay-client-log-"));
    const relay = startFakeRelay();
    const seen: string[] = [];
    const store = new mod.RoomEventStore({ dir, consumer: "bridge" });
    const client = openClient({
      url: relay.url,
      eventStore: store,
      onEnvelope(env) {
        if (env.type === "chat") seen.push(env.text);
      },
    });
    try {
      await client.connect();
      const env = chat("hello", { eventId: "ev_same", seq: 3 });
      relay.send(env);
      relay.send(env);
      await waitFor(() => seen.length >= 1, 1500);
      await Bun.sleep(50);
      expect(seen).toEqual(["hello"]);
      const read = await mod.readRoomEventLog(dir, "room_client", "2026-03");
      expect(read.tornSkipped).toBe(0);
      expect(read.records).toHaveLength(1);
      expect(read.records[0]).toMatchObject({
        v: 1,
        roomId: "room_client",
        seq: 3,
        eventId: "ev_same",
        type: "chat",
      });
    } finally {
      client.close();
      relay.stop();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
