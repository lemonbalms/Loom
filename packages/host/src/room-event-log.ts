/**
 * v0.29.0 PATCH 4 — client receive store (PLAN D2/D3, R1–R4).
 * A (log) is shared per room. B (delivery) is per consumer.
 * Both decisions happen inside one async room lock (budget ≤250ms).
 * Lock timeout or append failure is fail-open: deliver, count, one stderr line.
 * Named consumers also keep an in-memory shadow so a durable-write failure
 * still suppresses a second delivery in this process.
 */

import { createHash } from "node:crypto";
import { constants } from "node:fs";
import {
  chmod,
  mkdir,
  open,
  readFile,
  rename,
  stat,
  unlink,
} from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import type { Envelope } from "@loom/protocol";
import { loomDir } from "./session-store";

/** UK-4 starting cap. One constant for the log set and every consumer set. */
export const ROOM_EVENT_SEEN_CAP = 1024;

const DEFAULT_LOCK_BUDGET_MS = 250;
const LOCK_POLL_MS = 5;
/** Empty lock files younger than this are still being created. */
const LOCK_PID_GRACE_MS = 50;

export type IngestResult = {
  deliver: boolean;
  logged: boolean;
  failOpen: boolean;
};

export type RoomEventRecord = {
  v: 1;
  roomId: string;
  seq: number;
  eventId: string;
  ts: string;
  type: string;
  envelope: Envelope;
};

export type RoomEventStoreOptions = {
  /** State root. Defaults to loomDir(). Layout is <dir>/rooms/<roomKey>/… */
  dir?: string;
  /** Stable consumer name (bridge, listen). Absent → B is this instance only. */
  consumer?: string;
  /** Cross-process acquire budget. Clamped to ≤250ms. */
  lockBudgetMs?: number;
  /** Overrides ROOM_EVENT_SEEN_CAP for this store. */
  seenCap?: number;
};

type SeenState = {
  v: 1;
  log: string[];
  lastSeq: number;
  consumers: Record<string, string[]>;
};

type FailReason = "lock_timeout" | "append_failed" | "seen_unreadable";

const chains = new Map<string, Promise<void>>();
const loggedMemory = new Map<string, Set<string>>();
const namedShadow = new Map<string, Set<string>>();

function isPidAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });
}

function errno(e: unknown): string | undefined {
  return e && typeof e === "object" && "code" in e
    ? String((e as { code?: unknown }).code)
    : undefined;
}

export function roomKey(roomId: string): string {
  return createHash("sha256").update(roomId).digest("hex").slice(0, 16);
}

function scopeKey(dir: string, key: string): string {
  return `${resolve(dir)}\0${key}`;
}

function roomDirectory(dir: string, roomId: string): string {
  const root = resolve(dir);
  const key = roomKey(roomId);
  const abs = resolve(root, "rooms", key);
  if (!/^[0-9a-f]{16}$/.test(key) || !abs.startsWith(root + sep)) {
    throw new Error("room event path escaped state dir");
  }
  return abs;
}

function childPath(dir: string, roomId: string, ...parts: string[]): string {
  for (const part of parts) {
    if (part.length === 0 || part.includes("/") || part.includes("\\") || part.includes("..")) {
      throw new Error("room event path segment escaped");
    }
  }
  return join(roomDirectory(dir, roomId), ...parts);
}

function eventIdOf(env: Envelope): string | undefined {
  const id = env.eventId;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

function seqOf(env: Envelope): number {
  const seq = env.seq;
  return typeof seq === "number" && Number.isFinite(seq) ? seq : 0;
}

function tsOf(env: Envelope): string {
  const ts = env.ts;
  if (typeof ts === "string" && ts.length > 0 && !Number.isNaN(Date.parse(ts))) {
    return ts;
  }
  return new Date().toISOString();
}

function utcMonth(ts: string): string {
  const parsed = new Date(ts);
  const d = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${d.getUTCFullYear()}-${month}`;
}

function touch(list: string[], id: string, cap: number): void {
  const at = list.indexOf(id);
  if (at >= 0) list.splice(at, 1);
  list.push(id);
  while (list.length > cap) list.shift();
}

function emptySeen(): SeenState {
  return { v: 1, log: [], lastSeq: 0, consumers: {} };
}

function parseSeen(raw: string): SeenState | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const log = Array.isArray(obj.log)
    ? obj.log.filter((item): item is string => typeof item === "string")
    : [];
  const lastSeq =
    typeof obj.lastSeq === "number" && Number.isFinite(obj.lastSeq) ? obj.lastSeq : 0;
  const consumers: Record<string, string[]> = {};
  if (obj.consumers && typeof obj.consumers === "object") {
    for (const [name, items] of Object.entries(obj.consumers as Record<string, unknown>)) {
      if (!Array.isArray(items)) continue;
      consumers[name] = items.filter((item): item is string => typeof item === "string");
    }
  }
  return { v: 1, log, lastSeq, consumers };
}

function isRecord(value: unknown): value is RoomEventRecord {
  if (!value || typeof value !== "object") return false;
  const rec = value as Record<string, unknown>;
  return (
    rec.v === 1 &&
    typeof rec.roomId === "string" &&
    typeof rec.seq === "number" &&
    typeof rec.eventId === "string" &&
    typeof rec.ts === "string" &&
    typeof rec.type === "string" &&
    typeof rec.envelope === "object" &&
    rec.envelope !== null
  );
}

async function serial<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(key) ?? Promise.resolve();
  let release: () => void = () => {};
  const gate = new Promise<void>((resolveGate) => {
    release = resolveGate;
  });
  chains.set(key, gate);
  try {
    return await prev.then(fn, fn);
  } finally {
    release();
  }
}

async function reclaimStaleLock(lockPath: string): Promise<void> {
  let age = 0;
  try {
    const info = await stat(lockPath);
    age = Date.now() - info.mtimeMs;
  } catch {
    return;
  }
  let pid: number | null = null;
  try {
    const raw = await readFile(lockPath, "utf8");
    const n = Number(raw.split("\n")[0]);
    pid = Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return;
  }
  if (pid !== null && isPidAlive(pid)) return;
  if (pid === null && age < LOCK_PID_GRACE_MS) return;
  try {
    await unlink(lockPath);
  } catch {
    /* another waiter took it */
  }
}

async function acquireLock(lockPath: string, budgetMs: number): Promise<boolean> {
  const start = Date.now();
  await mkdir(dirname(lockPath), { recursive: true });
  for (;;) {
    try {
      const fh = await open(
        lockPath,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
        0o600,
      );
      try {
        await fh.write(`${process.pid}\n${Date.now()}\n`);
        await fh.sync();
      } finally {
        await fh.close();
      }
      try {
        await chmod(lockPath, 0o600);
      } catch {
        /* */
      }
      return true;
    } catch (e) {
      if (errno(e) === "EEXIST") await reclaimStaleLock(lockPath);
      else if (errno(e) !== "ENOENT") throw e;
    }
    const elapsed = Date.now() - start;
    if (elapsed >= budgetMs) return false;
    await sleep(Math.min(LOCK_POLL_MS, budgetMs - elapsed));
  }
}

async function releaseLock(lockPath: string): Promise<void> {
  try {
    const raw = await readFile(lockPath, "utf8");
    const pid = Number(raw.split("\n")[0]);
    if (pid !== process.pid) return;
    await unlink(lockPath);
  } catch {
    /* already released */
  }
}

/** Returns whether a missing trailing newline was repaired (R4). */
async function appendJsonl(file: string, line: string): Promise<boolean> {
  await mkdir(dirname(file), { recursive: true });
  let repair = false;
  try {
    const info = await stat(file);
    if (info.size > 0) {
      const fh = await open(file, "r");
      try {
        const last = Buffer.alloc(1);
        const read = await fh.read(last, 0, 1, info.size - 1);
        repair = read.bytesRead === 1 && last[0] !== 0x0a;
      } finally {
        await fh.close();
      }
    }
  } catch (e) {
    if (errno(e) !== "ENOENT") throw e;
  }
  const fh = await open(file, "a", 0o600);
  try {
    if (repair) await fh.write(Buffer.from("\n"));
    await fh.write(Buffer.from(`${line}\n`, "utf8"));
    await fh.sync();
  } finally {
    await fh.close();
  }
  try {
    await chmod(file, 0o600);
  } catch {
    /* */
  }
  return repair;
}

async function loadSeen(path: string): Promise<SeenState> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (e) {
    if (errno(e) === "ENOENT") return emptySeen();
    throw e;
  }
  const parsed = parseSeen(raw);
  if (!parsed) throw new Error("room event seen state unreadable");
  return parsed;
}

async function writeSeen(path: string, state: SeenState): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = join(dirname(path), `.seen.tmp.${process.pid}`);
  const fh = await open(tmp, "w", 0o600);
  try {
    await fh.write(`${JSON.stringify(state)}\n`);
    await fh.sync();
  } finally {
    await fh.close();
  }
  try {
    await chmod(tmp, 0o600);
  } catch {
    /* */
  }
  await rename(tmp, path);
  try {
    await chmod(path, 0o600);
  } catch {
    /* */
  }
}

function memoryHas(dir: string, key: string, eventId: string): boolean {
  return loggedMemory.get(scopeKey(dir, key))?.has(eventId) ?? false;
}

function memoryAdd(dir: string, key: string, eventId: string): void {
  const id = scopeKey(dir, key);
  let set = loggedMemory.get(id);
  if (!set) {
    set = new Set();
    loggedMemory.set(id, set);
  }
  set.add(eventId);
}

function namedShadowSet(dir: string, key: string, consumer: string): Set<string> {
  const id = `${scopeKey(dir, key)}\0${consumer}`;
  let set = namedShadow.get(id);
  if (!set) {
    set = new Set();
    namedShadow.set(id, set);
  }
  return set;
}

export async function readRoomEventLog(
  dir: string,
  roomId: string,
  month: string,
): Promise<{ records: RoomEventRecord[]; tornSkipped: number }> {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return { records: [], tornSkipped: 0 };
  }
  const file = childPath(dir, roomId, "events", `${month}.jsonl`);
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (e) {
    if (errno(e) === "ENOENT") return { records: [], tornSkipped: 0 };
    throw e;
  }
  const parts = raw.split("\n");
  if (raw.endsWith("\n")) parts.pop();
  const records: RoomEventRecord[] = [];
  let tornSkipped = 0;
  for (const line of parts) {
    if (line.length === 0) continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (isRecord(parsed)) records.push(parsed);
      else tornSkipped += 1;
    } catch {
      tornSkipped += 1;
    }
  }
  return { records, tornSkipped };
}

export class RoomEventStore {
  private readonly dir: string;
  private readonly consumer: string | undefined;
  private readonly lockBudgetMs: number;
  private readonly seenCap: number;
  private readonly anonShadow = new Set<string>();
  private failOpenCount = 0;
  private tornSkippedCount = 0;

  constructor(opts: RoomEventStoreOptions = {}) {
    const dir = opts.dir && opts.dir.length > 0 ? opts.dir : loomDir();
    this.dir = dir;
    const consumer = opts.consumer?.trim();
    this.consumer = consumer && consumer.length > 0 ? consumer : undefined;
    const requested = opts.lockBudgetMs ?? DEFAULT_LOCK_BUDGET_MS;
    this.lockBudgetMs = Math.max(0, Math.min(requested, DEFAULT_LOCK_BUDGET_MS));
    const cap = opts.seenCap ?? ROOM_EVENT_SEEN_CAP;
    this.seenCap = Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : ROOM_EVENT_SEEN_CAP;
  }

  counters(): { failOpen: number; tornSkipped: number } {
    return { failOpen: this.failOpenCount, tornSkipped: this.tornSkippedCount };
  }

  async ingest(env: Envelope, consumerKey?: string): Promise<IngestResult> {
    const eventId = eventIdOf(env);
    if (!eventId) {
      return { deliver: true, logged: false, failOpen: false };
    }
    if (typeof env.roomId !== "string" || env.roomId.length === 0) {
      return { deliver: true, logged: false, failOpen: false };
    }
    const key = roomKey(env.roomId);
    const consumer = this.resolveConsumer(consumerKey);
    return serial(scopeKey(this.dir, key), () =>
      this.ingestSerial(env, eventId, key, consumer),
    );
  }

  private resolveConsumer(consumerKey: string | undefined): string | undefined {
    const named = consumerKey?.trim();
    if (named && named.length > 0) return named;
    return this.consumer;
  }

  private shadowHas(key: string, consumer: string | undefined, eventId: string): boolean {
    if (!consumer) return this.anonShadow.has(eventId);
    return namedShadowSet(this.dir, key, consumer).has(eventId);
  }

  private shadowAdd(key: string, consumer: string | undefined, eventId: string): void {
    if (!consumer) {
      this.anonShadow.add(eventId);
      return;
    }
    namedShadowSet(this.dir, key, consumer).add(eventId);
  }

  private failOpen(
    reason: FailReason,
    roomId: string,
    eventId: string,
    key: string,
    consumer: string | undefined,
  ): IngestResult {
    this.failOpenCount += 1;
    const deliver = !this.shadowHas(key, consumer, eventId);
    if (deliver) this.shadowAdd(key, consumer, eventId);
    console.error(
      "[loom] room-event-log fail-open",
      JSON.stringify({
        event: "room_event_fail_open",
        reason,
        count: this.failOpenCount,
        roomId,
        eventId,
      }),
    );
    return { deliver, logged: false, failOpen: true };
  }

  private async ingestSerial(
    env: Envelope,
    eventId: string,
    key: string,
    consumer: string | undefined,
  ): Promise<IngestResult> {
    const roomId = env.roomId;
    const lockPath = childPath(this.dir, roomId, ".lock");
    let held = false;
    try {
      held = await acquireLock(lockPath, this.lockBudgetMs);
    } catch {
      return this.failOpen("lock_timeout", roomId, eventId, key, consumer);
    }
    if (!held) return this.failOpen("lock_timeout", roomId, eventId, key, consumer);
    try {
      return await this.decide(env, eventId, key, consumer);
    } catch {
      return this.failOpen("append_failed", roomId, eventId, key, consumer);
    } finally {
      if (held) await releaseLock(lockPath);
    }
  }

  private async decide(
    env: Envelope,
    eventId: string,
    key: string,
    consumer: string | undefined,
  ): Promise<IngestResult> {
    const roomId = env.roomId;
    const seenPath = childPath(this.dir, roomId, "seen.json");
    let seen: SeenState;
    try {
      seen = await loadSeen(seenPath);
    } catch {
      return this.failOpen("seen_unreadable", roomId, eventId, key, consumer);
    }
    for (const id of loggedMemory.get(scopeKey(this.dir, key)) ?? []) {
      if (!seen.log.includes(id)) seen.log.push(id);
    }

    const inLog = seen.log.includes(eventId) || memoryHas(this.dir, key, eventId);
    const inDelivery = consumer
      ? (seen.consumers[consumer]?.includes(eventId) ?? false) ||
        this.shadowHas(key, consumer, eventId)
      : this.shadowHas(key, consumer, eventId);

    let logged = false;
    if (!inLog) {
      const ts = tsOf(env);
      const month = utcMonth(ts);
      const file = childPath(this.dir, roomId, "events", `${month}.jsonl`);
      const record: RoomEventRecord = {
        v: 1,
        roomId,
        seq: seqOf(env),
        eventId,
        ts,
        type: env.type,
        envelope: env,
      };
      try {
        const repaired = await appendJsonl(file, JSON.stringify(record));
        if (repaired) this.tornSkippedCount += 1;
      } catch {
        return this.failOpen("append_failed", roomId, eventId, key, consumer);
      }
      logged = true;
      touch(seen.log, eventId, this.seenCap);
      memoryAdd(this.dir, key, eventId);
      const seq = seqOf(env);
      if (seq > seen.lastSeq) seen.lastSeq = seq;
    }

    const deliver = !inDelivery;
    if (deliver && consumer) {
      const list = seen.consumers[consumer] ?? [];
      seen.consumers[consumer] = list;
      touch(list, eventId, this.seenCap);
    }
    if (deliver || inDelivery) this.shadowAdd(key, consumer, eventId);

    if (logged || (deliver && consumer)) {
      try {
        await writeSeen(seenPath, seen);
      } catch {
        this.failOpenCount += 1;
        console.error(
          "[loom] room-event-log fail-open",
          JSON.stringify({
            event: "room_event_fail_open",
            reason: "append_failed",
            count: this.failOpenCount,
            roomId,
            eventId,
          }),
        );
        return { deliver, logged, failOpen: true };
      }
    }
    return { deliver, logged, failOpen: false };
  }
}
