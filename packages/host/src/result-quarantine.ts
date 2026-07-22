/**
 * PLAN 0.27.0 — durable quarantine JSONL for send_unknown / presence_unknown.
 * Profile-scoped, 0600, per-record fsync, startup replay, append-only ack fold.
 * Tagged discriminated-union keys: seq (send_unknown) vs "presence" tag.
 * Do NOT reuse recordResultDeliveryUnconfirmed (volatile).
 */

import {
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
  writeSync,
  fsyncSync,
  readFileSync,
  chmodSync,
  appendFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { loomDir } from "./session-store";

export type QuarantineState = "send_unknown" | "presence_unknown";

/** Discriminated key: seq number for send_unknown, "presence" tag for presence_unknown. */
export type QuarantineKey =
  | { tag: "seq"; seq: number }
  | { tag: "presence" };

export type QuarantineRecord = {
  kind: "enter" | "ack" | "auto_resolve" | "re_escalate" | "process_exit";
  cardId: string;
  dispatchHandoffId: string;
  state: QuarantineState;
  /** Tagged key field — never collapse presence into a numeric seq. */
  key: QuarantineKey;
  at: string;
  reason?: string;
  counter?: number;
};

export type QuarantineUnresolved = {
  cardId: string;
  dispatchHandoffId: string;
  state: QuarantineState;
  key: QuarantineKey;
  enteredAt: string;
  reason?: string;
  reEscalateCount: number;
};

/** PLAN 0.28.0 M3: operator ack result (explicit key or single-match inference). */
export type QuarantineAckResult =
  | { ok: true; key: QuarantineKey }
  | {
      ok: false;
      error: "not_found" | "ambiguous" | "append_failed";
      message: string;
      matches?: QuarantineKey[];
    };

let appendFailCount = 0;
let tornLineCount = 0;

export function quarantineAppendFailCount(): number {
  return appendFailCount;
}

export function quarantineTornLineCount(): number {
  return tornLineCount;
}

export function resetQuarantineCounters(): void {
  appendFailCount = 0;
  tornLineCount = 0;
}

export function quarantinePath(profile: string): string {
  const safe = profile.replace(/[^a-zA-Z0-9._-]/g, "_") || "default";
  return join(loomDir(), "bridge", `${safe}-quarantine.jsonl`);
}

function keyId(cardId: string, dispatchHandoffId: string, key: QuarantineKey): string {
  if (key.tag === "presence") {
    return `${cardId}\0${dispatchHandoffId}\0presence`;
  }
  return `${cardId}\0${dispatchHandoffId}\0seq:${key.seq}`;
}

function parseRecord(line: string): QuarantineRecord | null {
  try {
    const o = JSON.parse(line) as QuarantineRecord;
    if (!o || typeof o !== "object") return null;
    if (!o.cardId || !o.dispatchHandoffId || !o.state || !o.key) return null;
    if (o.key.tag !== "seq" && o.key.tag !== "presence") return null;
    if (o.key.tag === "seq" && typeof o.key.seq !== "number") return null;
    return o;
  } catch {
    return null;
  }
}

/**
 * Fold append-only JSONL into unresolved map.
 * Torn last line → count + log (never silent drop).
 */
export function foldQuarantineLines(
  lines: string[],
  onTorn?: (line: string) => void,
): Map<string, QuarantineUnresolved> {
  const open = new Map<string, QuarantineUnresolved>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim()) continue;
    const rec = parseRecord(line);
    if (!rec) {
      // Last line may be torn (partial write before crash).
      if (i === lines.length - 1) {
        tornLineCount += 1;
        onTorn?.(line);
        console.error(
          "[loom-bridge] quarantine torn last line (counted, not dropped silently)",
          JSON.stringify({ event: "quarantine_torn_line", count: tornLineCount }),
        );
      }
      continue;
    }
    const id = keyId(rec.cardId, rec.dispatchHandoffId, rec.key);
    if (rec.kind === "enter") {
      open.set(id, {
        cardId: rec.cardId,
        dispatchHandoffId: rec.dispatchHandoffId,
        state: rec.state,
        key: rec.key,
        enteredAt: rec.at,
        reason: rec.reason,
        reEscalateCount: 0,
      });
    } else if (rec.kind === "ack" || rec.kind === "auto_resolve") {
      // Operator ack / auto-resolve fold closes the unresolved entry.
      open.delete(id);
    } else if (rec.kind === "process_exit") {
      // PLAN 0.28.0 / U6: process_exit is observation only — do not resolve.
      // Restart replay must restore unresolved counts after a clean exit.
    } else if (rec.kind === "re_escalate") {
      const cur = open.get(id);
      if (cur) cur.reEscalateCount += 1;
    }
  }
  return open;
}

export class QuarantineStore {
  readonly profile: string;
  readonly path: string;
  private unresolved = new Map<string, QuarantineUnresolved>();
  private reEscalateTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly reEscalateMs: number;

  constructor(opts: { profile: string; reEscalateMs?: number }) {
    this.profile = opts.profile;
    this.path = quarantinePath(opts.profile);
    this.reEscalateMs = opts.reEscalateMs ?? 10 * 60 * 1000;
  }

  /** Startup replay — restores unresolved count; torn last line counted+logged. */
  load(): number {
    if (!existsSync(this.path)) {
      this.unresolved = new Map();
      return 0;
    }
    let raw: string;
    try {
      raw = readFileSync(this.path, "utf8");
    } catch (e) {
      appendFailCount += 1;
      console.error(
        "[loom-bridge] quarantine load failed",
        e instanceof Error ? e.message : e,
      );
      this.unresolved = new Map();
      return 0;
    }
    const lines = raw.split(/\n/);
    // split leaves trailing empty after final \n — drop empties inside fold
    this.unresolved = foldQuarantineLines(lines);
    return this.unresolved.size;
  }

  unresolvedCount(): number {
    return this.unresolved.size;
  }

  listUnresolved(): QuarantineUnresolved[] {
    return [...this.unresolved.values()];
  }

  private append(rec: QuarantineRecord): boolean {
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      const line = `${JSON.stringify(rec)}\n`;
      const fd = openSync(this.path, "a", 0o600);
      try {
        writeSync(fd, line);
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      try {
        chmodSync(this.path, 0o600);
      } catch {
        /* */
      }
      return true;
    } catch (e) {
      appendFailCount += 1;
      console.error(
        "[loom-bridge] quarantine append/fsync failed (fail-visible)",
        JSON.stringify({
          event: "quarantine_append_fail",
          count: appendFailCount,
          err: e instanceof Error ? e.message : String(e),
        }),
      );
      return false;
    }
  }

  /**
   * Enter unknown state — durable record at entry time (= durable alert, one record).
   * Schedules 10min re-escalate timer (re-notify only; never dispose).
   */
  enter(args: {
    cardId: string;
    dispatchHandoffId: string;
    state: QuarantineState;
    key: QuarantineKey;
    reason?: string;
  }): boolean {
    const id = keyId(args.cardId, args.dispatchHandoffId, args.key);
    if (this.unresolved.has(id)) return true; // already entered
    const at = new Date().toISOString();
    const ok = this.append({
      kind: "enter",
      cardId: args.cardId,
      dispatchHandoffId: args.dispatchHandoffId,
      state: args.state,
      key: args.key,
      at,
      reason: args.reason,
      counter: this.unresolved.size + 1,
    });
    if (!ok) return false;
    this.unresolved.set(id, {
      cardId: args.cardId,
      dispatchHandoffId: args.dispatchHandoffId,
      state: args.state,
      key: args.key,
      enteredAt: at,
      reason: args.reason,
      reEscalateCount: 0,
    });
    this.scheduleReEscalate(id);
    return true;
  }

  private scheduleReEscalate(id: string): void {
    if (this.reEscalateTimers.has(id)) return;
    const t = setTimeout(() => {
      this.reEscalateTimers.delete(id);
      const cur = this.unresolved.get(id);
      if (!cur) return;
      cur.reEscalateCount += 1;
      this.append({
        kind: "re_escalate",
        cardId: cur.cardId,
        dispatchHandoffId: cur.dispatchHandoffId,
        state: cur.state,
        key: cur.key,
        at: new Date().toISOString(),
        reason: "timer_re_escalate",
        counter: cur.reEscalateCount,
      });
      console.error(
        "[loom-bridge] quarantine re-escalate (timer; no dispose)",
        JSON.stringify({
          event: "quarantine_re_escalate",
          cardId: cur.cardId,
          dispatchHandoffId: cur.dispatchHandoffId,
          state: cur.state,
          count: cur.reEscalateCount,
        }),
      );
      // Re-arm while still unresolved
      this.scheduleReEscalate(id);
    }, this.reEscalateMs);
    // Don't keep process alive solely for re-escalate in tests
    if (typeof t === "object" && t && "unref" in t) {
      (t as NodeJS.Timeout).unref?.();
    }
    this.reEscalateTimers.set(id, t);
  }

  /** Operator ack — append-only fold (original enter record immutable). */
  ack(args: {
    cardId: string;
    dispatchHandoffId: string;
    key: QuarantineKey;
  }): boolean {
    const id = keyId(args.cardId, args.dispatchHandoffId, args.key);
    const cur = this.unresolved.get(id);
    if (!cur) return false;
    const ok = this.append({
      kind: "ack",
      cardId: args.cardId,
      dispatchHandoffId: args.dispatchHandoffId,
      state: cur.state,
      key: args.key,
      at: new Date().toISOString(),
      reason: "operator_ack",
    });
    if (!ok) return false;
    this.clearTimer(id);
    this.unresolved.delete(id);
    return true;
  }

  /**
   * PLAN 0.28.0 M3 operator ack with optional key selector.
   * - explicit key → not_found if absent; append_failed if present but durable
   *   ack append/fsync fails; success otherwise
   * - no key → match (cardId, dispatchHandoffId); ack only if exactly one
   * Clears re-escalate timer + in-memory map on success (same as ack()).
   */
  ackOperator(args: {
    cardId: string;
    dispatchHandoffId: string;
    key?: QuarantineKey;
  }): QuarantineAckResult {
    if (args.key) {
      // Distinguish absent entry vs durable append failure (ack() collapses both to false).
      const id = keyId(args.cardId, args.dispatchHandoffId, args.key);
      if (!this.unresolved.has(id)) {
        return {
          ok: false,
          error: "not_found",
          message: `no unresolved entry for cardId=${args.cardId} dispatchHandoffId=${args.dispatchHandoffId} key=${JSON.stringify(args.key)}`,
        };
      }
      const closed = this.ack({
        cardId: args.cardId,
        dispatchHandoffId: args.dispatchHandoffId,
        key: args.key,
      });
      if (!closed) {
        return {
          ok: false,
          error: "append_failed",
          message: `quarantine ack append/fsync failed for cardId=${args.cardId} dispatchHandoffId=${args.dispatchHandoffId} key=${JSON.stringify(args.key)}`,
        };
      }
      return { ok: true, key: args.key };
    }

    const matches = this.listUnresolved().filter(
      (u) =>
        u.cardId === args.cardId &&
        u.dispatchHandoffId === args.dispatchHandoffId,
    );
    if (matches.length === 0) {
      return {
        ok: false,
        error: "not_found",
        message: `no unresolved entry for cardId=${args.cardId} dispatchHandoffId=${args.dispatchHandoffId}`,
      };
    }
    if (matches.length > 1) {
      const keys = matches.map((m) => m.key);
      return {
        ok: false,
        error: "ambiguous",
        message: `multiple unresolved entries for cardId=${args.cardId} dispatchHandoffId=${args.dispatchHandoffId}; pass --seq N or --presence`,
        matches: keys,
      };
    }
    const only = matches[0]!;
    const closed = this.ack({
      cardId: args.cardId,
      dispatchHandoffId: args.dispatchHandoffId,
      key: only.key,
    });
    if (!closed) {
      return {
        ok: false,
        error: "append_failed",
        message: "quarantine ack append failed",
      };
    }
    return { ok: true, key: only.key };
  }

  /**
   * Auto-resolve fold (presence_unknown → relay_accepted path (c), or
   * presence→send supersede into a seq record).
   */
  autoResolve(args: {
    cardId: string;
    dispatchHandoffId: string;
    key: QuarantineKey;
    reason: string;
  }): boolean {
    const id = keyId(args.cardId, args.dispatchHandoffId, args.key);
    const cur = this.unresolved.get(id);
    if (!cur) return false;
    const ok = this.append({
      kind: "auto_resolve",
      cardId: args.cardId,
      dispatchHandoffId: args.dispatchHandoffId,
      state: cur.state,
      key: args.key,
      at: new Date().toISOString(),
      reason: args.reason,
    });
    if (!ok) return false;
    this.clearTimer(id);
    this.unresolved.delete(id);
    return true;
  }

  /**
   * presence → send supersede: fold presence record, enter seq record if send_unknown.
   * Ensures presence + seq never both unresolved for same card.
   */
  supersedePresence(args: {
    cardId: string;
    dispatchHandoffId: string;
  }): void {
    this.autoResolve({
      cardId: args.cardId,
      dispatchHandoffId: args.dispatchHandoffId,
      key: { tag: "presence" },
      reason: "presence_superseded_by_seq",
    });
  }

  /** Process exit visibility — log + optional fold records (disk keeps enter history). */
  onProcessExit(): void {
    const n = this.unresolved.size;
    if (n === 0) return;
    console.error(
      "[loom-bridge] quarantine unresolved at process exit",
      JSON.stringify({
        event: "quarantine_process_exit",
        count: n,
        items: this.listUnresolved().map((u) => ({
          cardId: u.cardId,
          dispatchHandoffId: u.dispatchHandoffId,
          state: u.state,
        })),
      }),
    );
    for (const u of this.listUnresolved()) {
      this.append({
        kind: "process_exit",
        cardId: u.cardId,
        dispatchHandoffId: u.dispatchHandoffId,
        state: u.state,
        key: u.key,
        at: new Date().toISOString(),
        reason: "process_exit",
        counter: n,
      });
    }
    for (const id of [...this.reEscalateTimers.keys()]) {
      this.clearTimer(id);
    }
  }

  private clearTimer(id: string): void {
    const t = this.reEscalateTimers.get(id);
    if (t != null) {
      clearTimeout(t);
      this.reEscalateTimers.delete(id);
    }
  }

  /** Test helper — clear timers without process-exit fold. */
  disposeTimers(): void {
    for (const id of [...this.reEscalateTimers.keys()]) {
      this.clearTimer(id);
    }
  }
}

/** Test-only: append a raw line without fsync path (torn-line tests use real append). */
export function appendQuarantineLineRaw(path: string, line: string): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, line, { encoding: "utf8", mode: 0o600 });
}
