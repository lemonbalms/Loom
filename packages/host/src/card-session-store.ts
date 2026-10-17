/**
 * PLAN 0.30.0 D5 / R1 / R2.
 * Peer namespace = sha16(localPeerId); cardKey = sha16(roomId NUL agent NUL cardId).
 * cwd is a record field, not a key.
 */
import { createHash, randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { chmod, copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { readJsonFile, writeAtomicJson } from "./atomic-json";
import type { HeadlessResultFields } from "./headless-worker";

export type CardSessionState = "spawning" | "running" | "exited";

export type CardSessionRecord = {
  agent: "claude" | "codex" | "grok";
  cwd: string;
  /** Null means use the current worker config. */
  requestedCwd: string | null;
  sessionId: string;
  promptFingerprint: string;
  attempts: number;
  pid: number;
  pgid: number;
  startedAt: string;
  state: CardSessionState;
  resultSent: boolean;
  roomId: string;
  cardId: string;
  fromPeerId: string;
  dispatchHandoffId: string;
  /** ps lstart captured with LC_ALL=C, LANG=C, TZ=UTC; empty before capture. */
  procStartedAt: string;
  sendAttempts: number;
  /** Recent successfully delivered dispatches, oldest first (at most 16). */
  completedHandoffIds: string[];
  /** Exact result reserved durably before the first delivery attempt. */
  pendingResult?: HeadlessResultFields;
  /**
   * 0.36.0 D11: sha256 of `<cardDir>/memory-snapshot.md` (the injected fence bytes), lowercase
   * hex. Never written when no block was injected — an absent key means "" (R9).
   */
  memorySnapshotHash?: string;
  /**
   * 0.38.0 D11 · R9: `${sha16(dispatchHandoffId)}.${attempt}` keys whose card candidates already
   * finished the store's under-lock step, oldest first (at most 16). Absent means [].
   */
  memoryProposed?: string[];
};

/** 0.38.0 R9: a memoryProposed element. */
export const MEMORY_PROPOSED_KEY_RE = /^[0-9a-f]{16}\.[12]$/;
export const MEMORY_PROPOSED_MAX = 16;

export const cardSessionDiagnostics = { invalidRecords: 0 };

function validRecord(raw: unknown): raw is CardSessionRecord {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const r = raw as Partial<CardSessionRecord>;
  if (r.agent !== "claude" && r.agent !== "codex" && r.agent !== "grok") return false;
  if (r.state !== "spawning" && r.state !== "running" && r.state !== "exited") return false;
  for (const key of ["cwd", "sessionId", "promptFingerprint", "startedAt", "roomId", "cardId", "fromPeerId", "dispatchHandoffId"] as const) {
    if (typeof r[key] !== "string" || !r[key]) return false;
  }
  if (!Number.isFinite(Date.parse(r.startedAt!))) return false;
  if (!Number.isInteger(r.attempts) || r.attempts! < 1 || r.attempts! > 2) return false;
  if (typeof r.resultSent !== "boolean" || typeof r.procStartedAt !== "string") return false;
  for (const pid of [r.pid, r.pgid]) {
    if (!Number.isInteger(pid) || (pid !== 0 && pid! <= 1)) return false;
  }
  if (r.state === "running" && (r.pid === 0 || r.pgid === 0)) return false;
  if (r.requestedCwd !== null && typeof r.requestedCwd !== "string") return false;
  if (!Number.isInteger(r.sendAttempts) || r.sendAttempts! < 0 || r.sendAttempts! > 2) return false;
  if (!Array.isArray(r.completedHandoffIds) || r.completedHandoffIds.length > 16 ||
    r.completedHandoffIds.some(id => typeof id !== "string" || !id)) return false;
  if (r.pendingResult !== undefined) {
    const f = r.pendingResult;
    if (!f || typeof f !== "object" || Array.isArray(f) || f.status !== "failed" ||
      typeof f.reason !== "string" || typeof f.output !== "string" ||
      typeof f.truncated !== "boolean" || typeof f.summary !== "string" ||
      (f.note !== undefined && typeof f.note !== "string") ||
      (f.timedOut !== undefined && typeof f.timedOut !== "boolean")) return false;
  }
  if (r.memoryProposed !== undefined) {
    const m = r.memoryProposed;
    if (!Array.isArray(m) || m.length > MEMORY_PROPOSED_MAX ||
      m.some(k => typeof k !== "string" || !MEMORY_PROPOSED_KEY_RE.test(k))) return false;
  }
  return true;
}

function invalidRecord(path: string): void {
  cardSessionDiagnostics.invalidRecords += 1;
  path = path.replace(/[\r\n]/g, " ");
  process.stderr.write(`[headless] invalid session record: ${path}\n`);
}

export type CardSessionKey = {
  loomDir: string;
  localPeerId: string;
  roomId: string;
  agent: string;
  cardId: string;
};

export function cardKeyHash(roomId: string, agent: string, cardId: string): string {
  return createHash("sha256")
    .update(`${roomId}\0${agent}\0${cardId}`)
    .digest("hex")
    .slice(0, 16);
}

/** The shared cards directory is partitioned by the complete local peer id. */
export function cardPeerHash(localPeerId: string): string {
  if (!localPeerId) throw new Error("localPeerId is required");
  return createHash("sha256").update(localPeerId).digest("hex").slice(0, 16);
}

export function cardSessionPath(opts: CardSessionKey): string {
  return join(
    opts.loomDir,
    "cards",
    cardPeerHash(opts.localPeerId),
    cardKeyHash(opts.roomId, opts.agent, opts.cardId),
    "session.json",
  );
}

export function readCardSession(opts: CardSessionKey): CardSessionRecord | null {
  const path = cardSessionPath(opts);
  const raw = readJsonFile(path);
  if (raw === null) return null;
  if (!validRecord(raw) || cardKeyHash(raw.roomId, raw.agent, raw.cardId) !== cardKeyHash(opts.roomId, opts.agent, opts.cardId)) {
    invalidRecord(path);
    return null;
  }
  return raw;
}

/** Only this peer's session.json records. Missing namespace → []. */
export function listCardSessions(loomDir: string, localPeerId: string): CardSessionRecord[] {
  const root = join(loomDir, "cards", cardPeerHash(localPeerId));
  let names: string[];
  try {
    names = readdirSync(root);
  } catch {
    return [];
  }
  const records: CardSessionRecord[] = [];
  for (const name of names) {
    if (!/^[0-9a-f]{16}$/.test(name)) continue;
    const path = join(root, name, "session.json");
    try {
      const raw = readJsonFile(path);
      if (!validRecord(raw) || cardKeyHash(raw.roomId, raw.agent, raw.cardId) !== name) {
        invalidRecord(path);
        continue;
      }
      records.push(raw);
    } catch {
      invalidRecord(path);
    }
  }
  return records;
}

/** Async hot-path counterpart. Invalid records fail closed rather than spawn. */
export async function readCardSessionAsync(opts: CardSessionKey): Promise<CardSessionRecord | null> {
  const path = cardSessionPath(opts);
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (err) {
    if (["ENOENT", "ENOTDIR"].includes((err as NodeJS.ErrnoException).code ?? "")) return null;
    throw err;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    await copyFile(path, `${path}.corrupt-${Date.now()}`).catch(() => {});
    throw err;
  }
  if (!validRecord(raw) || cardKeyHash(raw.roomId, raw.agent, raw.cardId) !== cardKeyHash(opts.roomId, opts.agent, opts.cardId)) {
    invalidRecord(path);
    throw new Error(`Invalid session record: ${path}`);
  }
  return raw;
}

/** Same atomic rename/0600 contract as writeCardSession, without blocking I/O. */
export async function writeCardSessionAsync(opts: { loomDir: string; localPeerId: string }, record: CardSessionRecord): Promise<void> {
  const path = cardSessionPath({ ...record, ...opts });
  await mkdir(dirname(path), { recursive: true });
  const temp = join(dirname(path), `.session.json.tmp.${process.pid}.${randomUUID()}`);
  try {
    await writeFile(temp, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
    await rename(temp, path);
    await chmod(path, 0o600);
  } finally {
    await rm(temp, { force: true });
  }
}

export function writeCardSession(
  opts: { loomDir: string; localPeerId: string },
  record: CardSessionRecord,
): void {
  writeAtomicJson(
    cardSessionPath({
      loomDir: opts.loomDir,
      localPeerId: opts.localPeerId,
      roomId: record.roomId,
      agent: record.agent,
      cardId: record.cardId,
    }),
    record,
  );
}
