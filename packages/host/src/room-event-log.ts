/**
 * v0.29.0 PATCH 4 — client receive store (PLAN D2/D3, R1–R4).
 * A (log) is shared per room. B (delivery) is per consumer.
 * Both decisions happen inside one async room lock (budget ≤250ms).
 * Lock timeout or append failure is fail-open: deliver, count, one stderr line.
 * Named consumers also keep an in-memory shadow so a durable-write failure
 * still suppresses a second delivery in this process.
 */

import { createHash, randomBytes } from "node:crypto";
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
/** Empty or unparsable locks younger than this are still being written. */
const LOCK_STALE_MS = 5000;
/** `<lock>.reclaim` older than this may be removed. */
const RECLAIM_MUTEX_STALE_MS = 10000;

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

type ParsedLock =
  | { kind: "json"; pid: number; nonce: string }
  | { kind: "empty" }
  | { kind: "unparsable" };

type LockIdentity =
  | { kind: "dead"; pid: number; nonce: string }
  | { kind: "stale-blank"; mtimeMs: number };

type RoomEventLogTestHooks = {
  afterReclaimMutexAcquired: null | ((lockPath: string) => Promise<void> | void);
  failAppendUnder: string | null;
  delayAcquireUnder: string | null;
  delayAcquireMs: number;
  reset(dir?: string): void;
  sizes(dir: string, roomId: string, consumer: string): { log: number; delivery: number };
  reclaim(lockPath: string): Promise<void>;
};

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

function capList(list: string[], cap: number): string[] {
  if (list.length <= cap) return list;
  return list.slice(list.length - cap);
}

function trimSet(set: Set<string>, cap: number): void {
  while (set.size > cap) {
    const oldest = set.values().next().value;
    if (typeof oldest !== "string") break;
    set.delete(oldest);
  }
}

function rememberSet(set: Set<string>, id: string, cap: number): void {
  if (set.has(id)) set.delete(id);
  set.add(id);
  trimSet(set, cap);
}

function capSeen(state: SeenState, cap: number): void {
  state.log = capList(state.log, cap);
  for (const [name, list] of Object.entries(state.consumers)) {
    state.consumers[name] = capList(list, cap);
  }
}

function sanitizeLockBudget(ms: number | undefined): number {
  if (ms === undefined || !Number.isFinite(ms) || ms <= 0) return DEFAULT_LOCK_BUDGET_MS;
  return Math.min(ms, DEFAULT_LOCK_BUDGET_MS);
}

function underDir(dir: string, file: string): boolean {
  const root = resolve(dir);
  const abs = resolve(file);
  return abs === root || abs.startsWith(root + sep);
}

function dropScoped(map: Map<string, Set<string>>, dir: string): void {
  const prefix = `${resolve(dir)}\0`;
  for (const key of [...map.keys()]) {
    if (key.startsWith(prefix)) map.delete(key);
  }
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

function parseLock(raw: string): ParsedLock {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { kind: "empty" };
  try {
    const value: unknown = JSON.parse(trimmed);
    if (!value || typeof value !== "object") return { kind: "unparsable" };
    const obj = value as Record<string, unknown>;
    const pid = obj.pid;
    const nonce = obj.nonce;
    if (
      typeof pid === "number" &&
      Number.isInteger(pid) &&
      pid > 0 &&
      typeof nonce === "string" &&
      nonce.length > 0
    ) {
      return { kind: "json", pid, nonce };
    }
  } catch {
    /* unparsable */
  }
  return { kind: "unparsable" };
}

function sameIdentity(a: LockIdentity, b: LockIdentity): boolean {
  if (a.kind === "dead" && b.kind === "dead") {
    return a.pid === b.pid && a.nonce === b.nonce;
  }
  if (a.kind === "stale-blank" && b.kind === "stale-blank") {
    return a.mtimeMs === b.mtimeMs;
  }
  return false;
}

/** Reclaimable identity, or null when the lock is missing or still live. */
async function observeLock(lockPath: string): Promise<LockIdentity | null> {
  let mtimeMs: number;
  try {
    const info = await stat(lockPath);
    mtimeMs = info.mtimeMs;
  } catch (e) {
    if (errno(e) === "ENOENT") return null;
    throw e;
  }
  let raw: string;
  try {
    raw = await readFile(lockPath, "utf8");
  } catch (e) {
    if (errno(e) === "ENOENT") return null;
    throw e;
  }
  const parsed = parseLock(raw);
  if (parsed.kind === "json") {
    if (isPidAlive(parsed.pid)) return null;
    return { kind: "dead", pid: parsed.pid, nonce: parsed.nonce };
  }
  if (Date.now() - mtimeMs <= LOCK_STALE_MS) return null;
  return { kind: "stale-blank", mtimeMs };
}

async function reclaimStaleLock(lockPath: string): Promise<void> {
  let observed: LockIdentity | null;
  try {
    observed = await observeLock(lockPath);
  } catch {
    return;
  }
  if (!observed) return;
  const mutexPath = `${lockPath}.reclaim`;
  try {
    const info = await stat(mutexPath);
    if (Date.now() - info.mtimeMs > RECLAIM_MUTEX_STALE_MS) await unlink(mutexPath);
  } catch {
    /* absent or raced */
  }
  let heldMutex = false;
  let fh: Awaited<ReturnType<typeof open>> | null = null;
  try {
    fh = await open(mutexPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    heldMutex = true;
    await fh.write(JSON.stringify({ pid: process.pid }));
    await fh.close();
    fh = null;
    const hook = roomEventLogTestHooks.afterReclaimMutexAcquired;
    if (hook) await hook(lockPath);
    // Re-read under the mutex so a live replacement is never unlinked.
    let again: LockIdentity | null;
    try {
      again = await observeLock(lockPath);
    } catch {
      return;
    }
    if (again && sameIdentity(observed, again)) await unlink(lockPath);
  } catch (e) {
    if (errno(e) === "EEXIST") return;
  } finally {
    if (fh) {
      try {
        await fh.close();
      } catch {
        /* */
      }
    }
    if (heldMutex) {
      try {
        await unlink(mutexPath);
      } catch {
        /* */
      }
    }
  }
}

async function acquireLockBody(
  lockPath: string,
  budgetMs: number,
): Promise<{ ok: boolean; nonce: string | null }> {
  const start = Date.now();
  await mkdir(dirname(lockPath), { recursive: true });
  for (;;) {
    try {
      const fh = await open(
        lockPath,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
        0o600,
      );
      const nonce = randomBytes(16).toString("hex");
      try {
        await fh.write(JSON.stringify({ pid: process.pid, nonce }));
        await fh.sync();
      } finally {
        await fh.close();
      }
      try {
        await chmod(lockPath, 0o600);
      } catch {
        /* */
      }
      const delayDir = roomEventLogTestHooks.delayAcquireUnder;
      const delayMs = roomEventLogTestHooks.delayAcquireMs;
      if (delayMs > 0 && delayDir && underDir(delayDir, lockPath)) {
        roomEventLogTestHooks.delayAcquireMs = 0;
        roomEventLogTestHooks.delayAcquireUnder = null;
        await sleep(delayMs);
      }
      return { ok: true, nonce };
    } catch (e) {
      if (errno(e) === "EEXIST") await reclaimStaleLock(lockPath);
      else if (errno(e) !== "ENOENT") throw e;
    }
    const elapsed = Date.now() - start;
    if (elapsed >= budgetMs) return { ok: false, nonce: null };
    await sleep(Math.min(LOCK_POLL_MS, Math.max(0, budgetMs - elapsed)));
  }
}

async function acquireLock(
  lockPath: string,
  budgetMs: number,
): Promise<{ held: boolean; nonce: string | null }> {
  const work = acquireLockBody(lockPath, budgetMs);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolveTimeout) => {
    timer = setTimeout(() => resolveTimeout("timeout"), budgetMs);
  });
  try {
    const winner = await Promise.race([
      work.then((result) => ({ tag: "done" as const, result })),
      timeout.then(() => ({ tag: "timeout" as const })),
    ]);
    if (winner.tag === "timeout") {
      void work
        .then((result) => {
          if (result.ok && result.nonce !== null) return releaseLock(lockPath, result.nonce);
          return undefined;
        })
        .catch(() => {
          /* late acquire failed */
        });
      return { held: false, nonce: null };
    }
    if (winner.result.ok && winner.result.nonce !== null) {
      return { held: true, nonce: winner.result.nonce };
    }
    return { held: false, nonce: null };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function releaseLock(lockPath: string, nonce: string): Promise<void> {
  try {
    const raw = await readFile(lockPath, "utf8");
    const parsed = parseLock(raw);
    if (parsed.kind !== "json") return;
    if (parsed.pid !== process.pid || parsed.nonce !== nonce) return;
    await unlink(lockPath);
  } catch {
    /* already released */
  }
}

export const roomEventLogTestHooks: RoomEventLogTestHooks = {
  afterReclaimMutexAcquired: null,
  failAppendUnder: null,
  delayAcquireUnder: null,
  delayAcquireMs: 0,
  reset(dir?: string): void {
    this.afterReclaimMutexAcquired = null;
    this.failAppendUnder = null;
    this.delayAcquireUnder = null;
    this.delayAcquireMs = 0;
    if (!dir) {
      loggedMemory.clear();
      namedShadow.clear();
      return;
    }
    dropScoped(loggedMemory, dir);
    dropScoped(namedShadow, dir);
  },
  sizes(dir: string, roomId: string, consumer: string): { log: number; delivery: number } {
    const id = scopeKey(dir, roomKey(roomId));
    return {
      log: loggedMemory.get(id)?.size ?? 0,
      delivery: namedShadow.get(`${id}\0${consumer}`)?.size ?? 0,
    };
  },
  reclaim(lockPath: string): Promise<void> {
    return reclaimStaleLock(lockPath);
  },
};

/** Returns whether a missing trailing newline was repaired (R4). */
async function appendJsonl(file: string, line: string): Promise<boolean> {
  const failUnder = roomEventLogTestHooks.failAppendUnder;
  if (failUnder && underDir(failUnder, file)) {
    roomEventLogTestHooks.failAppendUnder = null;
    throw new Error("injected append failure");
  }
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

function memoryAdd(dir: string, key: string, eventId: string, cap: number): void {
  const id = scopeKey(dir, key);
  let set = loggedMemory.get(id);
  if (!set) {
    set = new Set();
    loggedMemory.set(id, set);
  }
  rememberSet(set, eventId, cap);
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
    this.lockBudgetMs = sanitizeLockBudget(opts.lockBudgetMs);
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
      rememberSet(this.anonShadow, eventId, this.seenCap);
      return;
    }
    rememberSet(namedShadowSet(this.dir, key, consumer), eventId, this.seenCap);
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
    let nonce: string | null = null;
    try {
      const lock = await acquireLock(lockPath, this.lockBudgetMs);
      held = lock.held;
      nonce = lock.nonce;
    } catch {
      return this.failOpen("lock_timeout", roomId, eventId, key, consumer);
    }
    if (!held || nonce === null) {
      return this.failOpen("lock_timeout", roomId, eventId, key, consumer);
    }
    try {
      return await this.decide(env, eventId, key, consumer);
    } catch {
      return this.failOpen("append_failed", roomId, eventId, key, consumer);
    } finally {
      if (held && nonce !== null) await releaseLock(lockPath, nonce);
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
    capSeen(seen, this.seenCap);
    const memory = loggedMemory.get(scopeKey(this.dir, key));
    if (memory) {
      trimSet(memory, this.seenCap);
      for (const id of memory) {
        if (!seen.log.includes(id)) seen.log.push(id);
      }
      seen.log = capList(seen.log, this.seenCap);
    }
    trimSet(this.anonShadow, this.seenCap);
    if (consumer) {
      const named = namedShadow.get(`${scopeKey(this.dir, key)}\0${consumer}`);
      if (named) trimSet(named, this.seenCap);
    }

    const inLog = seen.log.includes(eventId) || memoryHas(this.dir, key, eventId);
    const inDelivery = consumer
      ? (seen.consumers[consumer]?.includes(eventId) ?? false) ||
        this.shadowHas(key, consumer, eventId)
      : this.shadowHas(key, consumer, eventId);

    const deliver = !inDelivery;
    if (!inLog) {
      touch(seen.log, eventId, this.seenCap);
      const seq = seqOf(env);
      if (seq > seen.lastSeq) seen.lastSeq = seq;
    }
    if (deliver && consumer) {
      const list = seen.consumers[consumer] ?? [];
      seen.consumers[consumer] = list;
      touch(list, eventId, this.seenCap);
    }

    const persist = !inLog || (deliver && consumer !== undefined);
    if (persist) {
      capSeen(seen, this.seenCap);
      // B membership is durable before we return deliver=true. A crash after this
      // write and before the caller runs onEnvelope drops that delivery by design
      // (at-most-once).
      try {
        await writeSeen(seenPath, seen);
      } catch {
        return this.failOpen("append_failed", roomId, eventId, key, consumer);
      }
    }

    if (!inLog) memoryAdd(this.dir, key, eventId, this.seenCap);
    if (deliver || inDelivery) this.shadowAdd(key, consumer, eventId);

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
        return { deliver, logged: false, failOpen: true };
      }
      logged = true;
    }
    return { deliver, logged, failOpen: false };
  }
}
