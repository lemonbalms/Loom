import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { PROTOCOL_VERSION, type Envelope } from "@loom/protocol";

/**
 * PATCH 4 module. The specifier stays a value so this tests-only patch
 * typechecks before the file exists; the missing module is the expected red.
 */
const ROOM_EVENT_LOG_SPECIFIER = "./room-event-log";

type IngestResult = { deliver: boolean; logged: boolean; failOpen: boolean };

type RoomEventRecord = {
  v: 1;
  roomId: string;
  seq: number;
  eventId: string;
  ts: string;
  type: string;
  envelope: Envelope;
};

type RoomEventStoreOptions = {
  dir: string;
  consumer?: string;
  lockBudgetMs?: number;
  seenCap?: number;
};

type RoomEventStore = {
  ingest(env: Envelope): Promise<IngestResult>;
  counters(): { failOpen: number; tornSkipped: number };
};

type RoomEventLogModule = {
  roomKey(roomId: string): string;
  RoomEventStore: new (opts: RoomEventStoreOptions) => RoomEventStore;
  readRoomEventLog(
    dir: string,
    roomId: string,
    month: string,
  ): Promise<{ records: RoomEventRecord[]; tornSkipped: number }>;
};

async function loadRoomEventLog(): Promise<RoomEventLogModule> {
  try {
    return (await import(ROOM_EVENT_LOG_SPECIFIER)) as RoomEventLogModule;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `v0.29.0 PATCH 4 room-event-log is not implemented (${ROOM_EVENT_LOG_SPECIFIER}): ${msg}`,
    );
  }
}

function sha16(roomId: string): string {
  return createHash("sha256").update(roomId).digest("hex").slice(0, 16);
}

function utcMonth(ts: string): string {
  const d = new Date(ts);
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${d.getUTCFullYear()}-${m}`;
}

function stamped(fields: {
  roomId: string;
  eventId: string;
  seq: number;
  ts: string;
  text?: string;
}): Envelope {
  return {
    v: PROTOCOL_VERSION,
    type: "chat",
    roomId: fields.roomId,
    ts: fields.ts,
    from: "p1",
    text: fields.text ?? "hi",
    eventId: fields.eventId,
    seq: fields.seq,
  } as Envelope;
}

function tempDir(label: string): string {
  return mkdtempSync(join(tmpdir(), `loom-room-events-${label}-`));
}

function logPath(dir: string, roomId: string, month: string): string {
  return join(dir, "rooms", sha16(roomId), "events", `${month}.jsonl`);
}

describe("v0.29.0 PATCH 1 expected-red", () => {
  test("roomKey is sha256(roomId) hex, first 16 chars", async () => {
    const { roomKey } = await loadRoomEventLog();
    const roomId = "../x";
    expect(roomKey(roomId)).toBe(sha16(roomId));
    expect(roomKey(roomId)).toMatch(/^[0-9a-f]{16}$/);
    expect(roomKey("room_abc")).toBe(sha16("room_abc"));
    expect(roomKey("room_abc")).not.toContain("room_abc");
  });

  test("same eventId is delivered and logged once; seq is not a drop key", async () => {
    const { RoomEventStore, readRoomEventLog } = await loadRoomEventLog();
    const dir = tempDir("dedupe");
    try {
      const roomId = "room_dedupe";
      const ts = "2026-03-15T12:00:00.000Z";
      const store = new RoomEventStore({ dir, consumer: "bridge" });
      const first = await store.ingest(
        stamped({ roomId, eventId: "ev_a", seq: 4, ts, text: "first" }),
      );
      const sameSeqNewId = await store.ingest(
        stamped({ roomId, eventId: "ev_b", seq: 4, ts, text: "other" }),
      );
      const sameId = await store.ingest(
        stamped({ roomId, eventId: "ev_a", seq: 9, ts, text: "replay" }),
      );
      const lowerSeqNewId = await store.ingest(
        stamped({ roomId, eventId: "ev_c", seq: 1, ts, text: "regressed" }),
      );

      expect(first).toEqual({ deliver: true, logged: true, failOpen: false });
      expect(sameSeqNewId).toEqual({
        deliver: true,
        logged: true,
        failOpen: false,
      });
      expect(sameId).toEqual({
        deliver: false,
        logged: false,
        failOpen: false,
      });
      expect(lowerSeqNewId.deliver).toBe(true);
      expect(lowerSeqNewId.logged).toBe(true);
      expect(store.counters()).toEqual({ failOpen: 0, tornSkipped: 0 });

      const read = await readRoomEventLog(dir, roomId, utcMonth(ts));
      expect(read.tornSkipped).toBe(0);
      expect(read.records.map((r) => r.eventId)).toEqual([
        "ev_a",
        "ev_b",
        "ev_c",
      ]);
      expect(read.records[0]).toMatchObject({
        v: 1,
        roomId,
        seq: 4,
        eventId: "ev_a",
        ts,
        type: "chat",
      });
      expect(read.records[0]!.envelope).toMatchObject({
        text: "first",
        eventId: "ev_a",
      });

      const file = logPath(dir, roomId, utcMonth(ts));
      expect(statSync(file).mode & 0o777).toBe(0o600);
      const lines = readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => line.length > 0);
      expect(lines).toHaveLength(3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("delivery is per consumer; the log line is shared", async () => {
    const { RoomEventStore, readRoomEventLog } = await loadRoomEventLog();
    const dir = tempDir("consumers");
    try {
      const roomId = "room_shared";
      const ts = "2026-04-02T08:00:00.000Z";
      const env = stamped({ roomId, eventId: "ev_shared", seq: 1, ts });
      const bridge = new RoomEventStore({ dir, consumer: "bridge" });
      const listen = new RoomEventStore({ dir, consumer: "listen" });

      const a = await bridge.ingest(env);
      const b = await listen.ingest(env);
      expect(a).toEqual({ deliver: true, logged: true, failOpen: false });
      expect(b.deliver).toBe(true);
      expect(b.logged).toBe(false);

      const restarted = new RoomEventStore({ dir, consumer: "bridge" });
      const again = await restarted.ingest(env);
      expect(again.deliver).toBe(false);
      expect(again.logged).toBe(false);

      const read = await readRoomEventLog(dir, roomId, utcMonth(ts));
      expect(read.records).toHaveLength(1);
      expect(read.records[0]!.eventId).toBe("ev_shared");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("concurrent consumers append one line and each deliver once", async () => {
    const { RoomEventStore, readRoomEventLog } = await loadRoomEventLog();
    const dir = tempDir("concurrent");
    try {
      const roomId = "room_concurrent";
      const ts = "2026-05-01T00:00:00.000Z";
      const env = stamped({ roomId, eventId: "ev_race", seq: 7, ts });
      const bridge = new RoomEventStore({ dir, consumer: "bridge" });
      const listen = new RoomEventStore({ dir, consumer: "listen" });
      const [a, b] = await Promise.all([bridge.ingest(env), listen.ingest(env)]);
      expect(a.deliver).toBe(true);
      expect(b.deliver).toBe(true);
      expect([a.logged, b.logged].filter(Boolean)).toHaveLength(1);

      const read = await readRoomEventLog(dir, roomId, utcMonth(ts));
      expect(read.records).toHaveLength(1);
      expect(read.records[0]).toMatchObject({
        v: 1,
        roomId,
        seq: 7,
        eventId: "ev_race",
        ts,
        type: "chat",
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("envelope without eventId is delivered and not logged", async () => {
    const { RoomEventStore, readRoomEventLog } = await loadRoomEventLog();
    const dir = tempDir("legacy");
    try {
      const roomId = "room_legacy";
      const ts = "2026-06-01T00:00:00.000Z";
      const store = new RoomEventStore({ dir, consumer: "bridge" });
      const env = {
        v: PROTOCOL_VERSION,
        type: "chat",
        roomId,
        ts,
        from: "p1",
        text: "old relay",
      } as Envelope;
      const result = await store.ingest(env);
      expect(result).toEqual({
        deliver: true,
        logged: false,
        failOpen: false,
      });
      const again = await store.ingest(env);
      expect(again.deliver).toBe(true);
      expect(again.logged).toBe(false);

      const read = await readRoomEventLog(dir, roomId, utcMonth(ts));
      expect(read.records).toEqual([]);
      expect(read.tornSkipped).toBe(0);
      expect(existsSync(logPath(dir, roomId, utcMonth(ts)))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("month is UTC and a path-like roomId stays inside dir", async () => {
    const { RoomEventStore, roomKey } = await loadRoomEventLog();
    const dir = tempDir("path");
    try {
      const roomId = "../x";
      // 2026-03-31T15:30Z is 2026-04-01 00:30 in Asia/Seoul. Month must be UTC.
      const ts = "2026-03-31T15:30:00.000Z";
      const store = new RoomEventStore({ dir, consumer: "listen" });
      const result = await store.ingest(
        stamped({ roomId, eventId: "ev_path", seq: 1, ts, text: "secret-body" }),
      );
      expect(result.logged).toBe(true);

      const month = "2026-03";
      const file = join(dir, "rooms", roomKey(roomId), "events", `${month}.jsonl`);
      expect(existsSync(file)).toBe(true);
      expect(existsSync(join(dir, "rooms", roomKey(roomId), "events", "2026-04.jsonl"))).toBe(
        false,
      );
      const realFile = resolve(file);
      const realDir = resolve(dir);
      expect(realFile.startsWith(realDir + sep)).toBe(true);
      expect(existsSync(resolve(dir, "..", "x"))).toBe(false);
      expect(existsSync(join(dir, "x"))).toBe(false);

      const names = readdirSync(join(dir, "rooms"));
      expect(names).toEqual([roomKey(roomId)]);
      expect(names[0]).toMatch(/^[0-9a-f]{16}$/);
      expect(readFileSync(file, "utf8")).toContain("secret-body");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("torn last line is skipped and a following append reads back intact", async () => {
    const { RoomEventStore, readRoomEventLog, roomKey } = await loadRoomEventLog();
    const dir = tempDir("torn");
    try {
      const roomId = "room_torn";
      const ts = "2026-08-19T03:04:05.000Z";
      const month = utcMonth(ts);
      const file = join(dir, "rooms", roomKey(roomId), "events", `${month}.jsonl`);
      mkdirSync(join(dir, "rooms", roomKey(roomId), "events"), {
        recursive: true,
      });
      const intact = JSON.stringify({
        v: 1,
        roomId,
        seq: 1,
        eventId: "ev_ok",
        ts,
        type: "chat",
        envelope: stamped({
          roomId,
          eventId: "ev_ok",
          seq: 1,
          ts,
          text: "kept",
        }),
      });
      const torn =
        `{"v":1,"roomId":${JSON.stringify(roomId)},"seq":2,"eventId":"ev_torn",` +
        `"ts":${JSON.stringify(ts)},"type":"chat","envelope":`;
      writeFileSync(file, `${intact}\n${torn}`, { encoding: "utf8", mode: 0o600 });

      const store = new RoomEventStore({ dir, consumer: "bridge" });
      const appended = await store.ingest(
        stamped({
          roomId,
          eventId: "ev_after",
          seq: 3,
          ts,
          text: "after-torn",
        }),
      );
      expect(appended).toEqual({
        deliver: true,
        logged: true,
        failOpen: false,
      });

      const read = await readRoomEventLog(dir, roomId, month);
      expect(read.tornSkipped).toBe(1);
      expect(read.records.map((r) => r.eventId)).toEqual(["ev_ok", "ev_after"]);
      expect(read.records[1]).toMatchObject({
        v: 1,
        roomId,
        seq: 3,
        eventId: "ev_after",
        ts,
        type: "chat",
      });
      expect(read.records[1]!.envelope).toMatchObject({ text: "after-torn" });
      const raw = readFileSync(file, "utf8");
      expect(raw.endsWith("\n")).toBe(true);
      const lines = raw.split("\n").filter((line) => line.length > 0);
      const last = JSON.parse(lines[lines.length - 1]!) as {
        eventId: string;
        envelope: { text: string };
      };
      expect(last.eventId).toBe("ev_after");
      expect(last.envelope.text).toBe("after-torn");
      expect(lines[lines.length - 1]).not.toContain("ev_torn");
      expect(raw).toContain("ev_torn");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

function waitUntil(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  return new Promise((resolveWait, rejectWait) => {
    const tick = (): void => {
      if (predicate()) {
        resolveWait();
        return;
      }
      if (Date.now() - start > timeoutMs) {
        rejectWait(new Error("timed out waiting for reclaim mutex"));
        return;
      }
      setTimeout(tick, 5);
    };
    tick();
  });
}

describe("v0.29.0 PATCH 4 review fixes", () => {
  test("reclaim does not delete a live replacement lock", async () => {
    const { roomKey, roomEventLogTestHooks } = await import(ROOM_EVENT_LOG_SPECIFIER);
    const dir = tempDir("reclaim");
    const roomId = "room_reclaim";
    const lock = join(dir, "rooms", roomKey(roomId), ".lock");
    let releaseGate = (): void => {};
    const gate = new Promise<void>((resolveGate) => {
      releaseGate = resolveGate;
    });
    let first: Promise<void> = Promise.resolve();
    let second: Promise<void> = Promise.resolve();
    try {
      mkdirSync(join(dir, "rooms", roomKey(roomId)), { recursive: true });
      writeFileSync(lock, JSON.stringify({ pid: 2147483646, nonce: "dead" }), {
        encoding: "utf8",
      });
      roomEventLogTestHooks.afterReclaimMutexAcquired = (lockPath: string) => {
        if (lockPath === lock) return gate;
        return undefined;
      };
      first = roomEventLogTestHooks.reclaim(lock);
      second = roomEventLogTestHooks.reclaim(lock);
      await waitUntil(() => existsSync(`${lock}.reclaim`), 2000);
      writeFileSync(lock, JSON.stringify({ pid: process.pid, nonce: "live" }), {
        encoding: "utf8",
      });
      releaseGate();
      await Promise.all([first, second]);
      expect(existsSync(lock)).toBe(true);
      expect(JSON.parse(readFileSync(lock, "utf8"))).toEqual({
        pid: process.pid,
        nonce: "live",
      });
      expect(existsSync(`${lock}.reclaim`)).toBe(false);

      roomEventLogTestHooks.afterReclaimMutexAcquired = null;
      writeFileSync(lock, "");
      await roomEventLogTestHooks.reclaim(lock);
      expect(existsSync(lock)).toBe(true);
      const past = new Date(Date.now() - 6000);
      utimesSync(lock, past, past);
      await roomEventLogTestHooks.reclaim(lock);
      expect(existsSync(lock)).toBe(false);
    } finally {
      releaseGate();
      await Promise.allSettled([first, second]);
      roomEventLogTestHooks.reset(dir);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("seen membership is durable before append, so restart does not duplicate a line", async () => {
    const { RoomEventStore, readRoomEventLog, roomKey, roomEventLogTestHooks } =
      await import(ROOM_EVENT_LOG_SPECIFIER);
    const dir = tempDir("seen-first");
    try {
      const roomId = "room_seen_first";
      const ts = "2026-09-01T00:00:00.000Z";
      const eventId = "ev_crash";
      const env = stamped({ roomId, eventId, seq: 1, ts, text: "crash-window" });
      roomEventLogTestHooks.failAppendUnder = dir;
      const store = new RoomEventStore({ dir, consumer: "bridge" });
      const result = await store.ingest(env);
      expect(result.failOpen).toBe(true);
      expect(result.logged).toBe(false);
      expect(store.counters().failOpen).toBe(1);
      const before = await readRoomEventLog(dir, roomId, utcMonth(ts));
      expect(before.records).toHaveLength(0);
      const seenFile = join(dir, "rooms", roomKey(roomId), "seen.json");
      const seen = JSON.parse(readFileSync(seenFile, "utf8")) as { log: string[] };
      expect(seen.log).toContain(eventId);

      roomEventLogTestHooks.reset(dir);
      const restarted = new RoomEventStore({ dir, consumer: "bridge" });
      const again = await restarted.ingest(env);
      expect(again.logged).toBe(false);
      const after = await readRoomEventLog(dir, roomId, utcMonth(ts));
      expect(after.records).toHaveLength(0);
    } finally {
      roomEventLogTestHooks.reset(dir);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("seen sets stay within the cap", async () => {
    const { RoomEventStore, roomKey, roomEventLogTestHooks, ROOM_EVENT_SEEN_CAP } =
      await import(ROOM_EVENT_LOG_SPECIFIER);
    const dir = tempDir("cap");
    try {
      expect(ROOM_EVENT_SEEN_CAP).toBe(1024);
      const N = 20;
      const roomId = "room_cap";
      const ts = "2026-10-01T00:00:00.000Z";
      const store = new RoomEventStore({ dir, consumer: "bridge", seenCap: N });
      for (let i = 0; i < N + 50; i += 1) {
        const result = await store.ingest(
          stamped({ roomId, eventId: `ev_${i}`, seq: i + 1, ts, text: "capped" }),
        );
        expect(result.failOpen).toBe(false);
        expect(result.logged).toBe(true);
      }
      const sizes = roomEventLogTestHooks.sizes(dir, roomId, "bridge");
      expect(sizes.log).toBeLessThanOrEqual(N);
      expect(sizes.delivery).toBeLessThanOrEqual(N);
      expect(sizes.log).toBe(N);
      expect(sizes.delivery).toBe(N);
      const seen = JSON.parse(
        readFileSync(join(dir, "rooms", roomKey(roomId), "seen.json"), "utf8"),
      ) as { log: string[]; consumers: Record<string, string[]> };
      expect(seen.log.length).toBeLessThanOrEqual(N);
      expect(seen.consumers.bridge!.length).toBeLessThanOrEqual(N);
      expect(seen.log).toContain(`ev_${N + 49}`);
      expect(seen.log).not.toContain("ev_0");
    } finally {
      roomEventLogTestHooks.reset(dir);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("NaN lock budget fail-opens within the default budget and does not leak the lock", async () => {
    const { RoomEventStore, roomKey, roomEventLogTestHooks } = await import(
      ROOM_EVENT_LOG_SPECIFIER
    );
    const dir = tempDir("budget");
    try {
      const roomId = "room_budget";
      const ts = "2026-11-01T00:00:00.000Z";
      const lock = join(dir, "rooms", roomKey(roomId), ".lock");
      roomEventLogTestHooks.delayAcquireUnder = dir;
      roomEventLogTestHooks.delayAcquireMs = 400;
      const store = new RoomEventStore({
        dir,
        consumer: "bridge",
        lockBudgetMs: Number.NaN,
      });
      const started = Date.now();
      const result = await store.ingest(
        stamped({ roomId, eventId: "ev_budget", seq: 1, ts, text: "budget" }),
      );
      const elapsed = Date.now() - started;
      expect(result.failOpen).toBe(true);
      expect(result.deliver).toBe(true);
      expect(elapsed).toBeGreaterThanOrEqual(200);
      expect(elapsed).toBeLessThan(370);
      await new Promise((resolveSleep) => {
        setTimeout(resolveSleep, 700);
      });
      expect(existsSync(lock)).toBe(false);
    } finally {
      roomEventLogTestHooks.reset(dir);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
