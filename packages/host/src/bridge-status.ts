/**
 * PLAN 0.33.0 D5 — bridge status file writer (② 상태 파일 / 하트비트 / 상태기계 rows · R9).
 *
 * `loomDir()/bridge/<safeProfile>.status.json` — 0600, tmp+rename (`atomic-json.ts`), separate
 * from bridge meta so it survives stop/crash and shows `stopped` / `lastError` afterwards.
 * Exactly the ② field set; no tokens, session secrets or card bodies (only known keys are
 * copied; `lastError` is secret-redacted and capped at 512 UTF-8 bytes).
 *
 * Diagnostics are a record, not a gate: write failures never throw (one stderr line per
 * failure kind) and never change a decision. Reader (`readBridgeStatusFile`) added in P4.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { writeAtomicJson } from "./atomic-json";
import { sanitizeProfileLogName } from "./bridge-spawn";
import { redactSecrets } from "./redact";
import { loomDir } from "./session-store";

export const HEARTBEAT_MS = 5_000;
/** Advisory staleness for readers (3 × heartbeat). Never used to reclaim the lock. */
export const STATUS_STALE_MS = 3 * HEARTBEAT_MS;
export const LAST_ERROR_MAX_BYTES = 512;

export const BRIDGE_STATES = ["starting", "running", "draining", "stopping", "stopped"] as const;
export type BridgeState = (typeof BRIDGE_STATES)[number];
export type HerdrHealth = "ok" | "skipped" | "down";

export interface BridgeInFlight {
  paneCards: number;
  convs: number;
  headlessRunning: number;
  headlessQueued: number;
}

export interface BridgeDrainInfo {
  startedAt: string;
  deadlineAt: string;
}

export interface BridgeStatus {
  v: 1;
  pid: number;
  version: string;
  srcPath: string;
  profile: string;
  startedAt: string;
  heartbeatAt: string;
  state: BridgeState;
  inFlight: BridgeInFlight;
  herdr: HerdrHealth;
  drain?: BridgeDrainInfo;
  stoppedAt?: string;
  lastError?: string;
}

/** Mutable fields. `null` clears an optional field. */
export interface BridgeStatusPatch {
  inFlight?: BridgeInFlight;
  herdr?: HerdrHealth;
  drain?: BridgeDrainInfo | null;
  lastError?: string | null;
}

/**
 * Lifecycle transitions (상태기계 row): starting → running → draining → stopping → stopped.
 * `running → stopping` direct; signal while `draining` → stopping; startup failure →
 * `starting → stopped`; signal during startup may stop straight from `starting` (R11).
 * No regressions, no repeats.
 */
const TRANSITIONS: Record<BridgeState | "none", readonly BridgeState[]> = {
  none: ["starting"],
  starting: ["running", "stopping", "stopped"],
  running: ["draining", "stopping"],
  draining: ["stopping"],
  stopping: ["stopped"],
  stopped: [],
};

export function canTransition(from: BridgeState | null, to: BridgeState): boolean {
  return TRANSITIONS[from ?? "none"].includes(to);
}

/** `<bridgeDir>/<safeProfile>.status.json` (bridgeDir default `loomDir()/bridge`; readers that
 * must not touch `loomDir()` — doctor — pass their own). */
export function bridgeStatusPath(profile: string, bridgeDir?: string): string {
  return join(bridgeDir ?? join(loomDir(), "bridge"), `${sanitizeProfileLogName(profile)}.status.json`);
}

/** P5: absent vs present-but-unusable vs parsed (doctor / `bridge status` tell them apart). */
export type BridgeStatusReadResult =
  | { kind: "absent" }
  | { kind: "invalid"; reason: string }
  | { kind: "ok"; status: BridgeStatus };

/** Short, single-line value for an invalid-reason (hand-edited files: no long / multi-line echo). */
function shortValue(v: unknown): string {
  const s = typeof v === "string" ? JSON.stringify(v) : String(v);
  return s.length > 24 ? `${s.slice(0, 24)}…` : s;
}

/**
 * PLAN 0.33.0 P4 — D5 reader. Parse a status file read-only; null when absent, unreadable or
 * not a v1 status record. Only the ② keys are returned (a hand-edited file cannot inject
 * extra fields into doctor / `bridge status` output).
 */
export function readBridgeStatusFile(path: string): BridgeStatus | null {
  const r = readBridgeStatusFileResult(path);
  return r.kind === "ok" ? r.status : null;
}

/**
 * PLAN 0.33.0 P5 (P4-verify L1) — same reader, but tells `absent` (ENOENT) apart from a file
 * that exists and cannot be used (empty / truncated / `null` / array / unknown v / unknown
 * state / read error) with a short reason. Read-only.
 */
export function readBridgeStatusFileResult(path: string): BridgeStatusReadResult {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (e) {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") return { kind: "absent" };
    return { kind: "invalid", reason: `read error ${code ?? "unknown"}` };
  }
  if (text.trim() === "") return { kind: "invalid", reason: "empty file" };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { kind: "invalid", reason: "invalid JSON" };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { kind: "invalid", reason: "not an object" };
  }
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return { kind: "invalid", reason: `unknown version v=${shortValue(o.v)}` };
  if (typeof o.state !== "string" || !(BRIDGE_STATES as readonly string[]).includes(o.state)) {
    return { kind: "invalid", reason: `unknown state ${shortValue(o.state)}` };
  }
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const f = (o.inFlight && typeof o.inFlight === "object" ? o.inFlight : {}) as Record<string, unknown>;
  const herdr = o.herdr === "ok" || o.herdr === "skipped" || o.herdr === "down" ? o.herdr : "down";
  const out: BridgeStatus = {
    v: 1,
    pid: num(o.pid),
    version: str(o.version),
    srcPath: str(o.srcPath),
    profile: str(o.profile),
    startedAt: str(o.startedAt),
    heartbeatAt: str(o.heartbeatAt),
    state: o.state as BridgeState,
    inFlight: {
      paneCards: num(f.paneCards),
      convs: num(f.convs),
      headlessRunning: num(f.headlessRunning),
      headlessQueued: num(f.headlessQueued),
    },
    herdr,
  };
  const d = o.drain as Record<string, unknown> | undefined;
  if (d && typeof d === "object" && typeof d.deadlineAt === "string") {
    out.drain = { startedAt: str(d.startedAt), deadlineAt: d.deadlineAt };
  }
  if (typeof o.stoppedAt === "string") out.stoppedAt = o.stoppedAt;
  if (typeof o.lastError === "string") out.lastError = truncateLastError(o.lastError);
  return { kind: "ok", status: out };
}

/** Cut to ≤ `max` UTF-8 bytes on a code-point boundary. */
export function truncateLastError(text: string, max = LAST_ERROR_MAX_BYTES): string {
  if (Buffer.byteLength(text, "utf8") <= max) return text;
  let out = "";
  let bytes = 0;
  for (const ch of text) {
    const n = Buffer.byteLength(ch, "utf8");
    if (bytes + n > max) break;
    out += ch;
    bytes += n;
  }
  return out;
}

function sanitizeLastError(text: string): string {
  return truncateLastError(redactSecrets(String(text)));
}

export interface BridgeStatusWriterOptions {
  profile: string;
  /** CLI `VERSION`. */
  version: string;
  /** Absolute path of the running `bridge-main.ts`. */
  srcPath: string;
  pid?: number;
  /** Override target (default `bridgeStatusPath(profile)`). */
  path?: string;
  now?: () => Date;
  log?: (line: string) => void;
  heartbeatMs?: number;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
  /** Atomic JSON writer (default `writeAtomicJson`). */
  writeJson?: (path: string, data: unknown) => void;
}

export interface BridgeStatusWriter {
  readonly path: string;
  /** Apply an allowed transition (+ patch) and write now. false = refused (nothing changes). */
  transition(to: BridgeState, patch?: BridgeStatusPatch): boolean;
  /** Merge fields; written by the next transition / heartbeat. */
  update(patch: BridgeStatusPatch): void;
  /** Refresh `heartbeatAt` (+ sampler) and write. false = nothing to write or write failed. */
  heartbeat(): boolean;
  /** Start the periodic heartbeat (idempotent; timer is unref'd). */
  startHeartbeat(sample?: () => BridgeStatusPatch): void;
  stopHeartbeat(): void;
  current(): BridgeStatus | null;
}

export function createBridgeStatusWriter(opts: BridgeStatusWriterOptions): BridgeStatusWriter {
  const path = opts.path ?? bridgeStatusPath(opts.profile);
  const now = opts.now ?? (() => new Date());
  const log = opts.log ?? ((line: string) => process.stderr.write(`${line}\n`));
  const heartbeatMs = opts.heartbeatMs ?? HEARTBEAT_MS;
  const startTimer =
    opts.setInterval ?? ((fn: () => void, ms: number) => setInterval(fn, ms) as unknown);
  const stopTimer =
    opts.clearInterval ?? ((h: unknown) => clearInterval(h as ReturnType<typeof setInterval>));
  const writeJson = opts.writeJson ?? writeAtomicJson;
  const pid = opts.pid ?? process.pid;

  let status: BridgeStatus | null = null;
  let pending: BridgeStatusPatch = {
    herdr: "down",
    inFlight: { paneCards: 0, convs: 0, headlessRunning: 0, headlessQueued: 0 },
  };
  let timer: unknown = null;
  let sampler: (() => BridgeStatusPatch) | undefined;
  const reported = new Set<string>();

  function reportOnce(kind: string, line: string): void {
    if (reported.has(kind)) return;
    reported.add(kind);
    try {
      log(line);
    } catch {
      /* */
    }
  }

  function applyPatch(target: BridgeStatus, patch: BridgeStatusPatch): void {
    if (patch.inFlight) {
      const f = patch.inFlight;
      target.inFlight = {
        paneCards: f.paneCards,
        convs: f.convs,
        headlessRunning: f.headlessRunning,
        headlessQueued: f.headlessQueued,
      };
    }
    if (patch.herdr) target.herdr = patch.herdr;
    if (patch.drain === null) delete target.drain;
    else if (patch.drain)
      target.drain = { startedAt: patch.drain.startedAt, deadlineAt: patch.drain.deadlineAt };
    if (patch.lastError === null) delete target.lastError;
    else if (typeof patch.lastError === "string")
      target.lastError = sanitizeLastError(patch.lastError);
  }

  function mergePending(patch: BridgeStatusPatch): void {
    if (status) applyPatch(status, patch);
    else pending = { ...pending, ...pickPatch(patch) };
  }

  /** Copy only the known patch keys (never spread caller objects into the file). */
  function pickPatch(patch: BridgeStatusPatch): BridgeStatusPatch {
    const out: BridgeStatusPatch = {};
    if (patch.inFlight !== undefined) out.inFlight = patch.inFlight;
    if (patch.herdr !== undefined) out.herdr = patch.herdr;
    if (patch.drain !== undefined) out.drain = patch.drain;
    if (patch.lastError !== undefined) out.lastError = patch.lastError;
    return out;
  }

  /** Serialize in ② field order with exactly the known keys. */
  function snapshot(s: BridgeStatus): BridgeStatus {
    const out: BridgeStatus = {
      v: 1,
      pid: s.pid,
      version: s.version,
      srcPath: s.srcPath,
      profile: s.profile,
      startedAt: s.startedAt,
      heartbeatAt: s.heartbeatAt,
      state: s.state,
      inFlight: { ...s.inFlight },
      herdr: s.herdr,
    };
    if (s.drain) out.drain = { ...s.drain };
    if (s.stoppedAt) out.stoppedAt = s.stoppedAt;
    if (s.lastError !== undefined) out.lastError = s.lastError;
    return out;
  }

  function write(): boolean {
    if (!status) return false;
    try {
      writeJson(path, snapshot(status));
      return true;
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      const kind = e?.code ?? e?.name ?? "unknown";
      reportOnce(
        `write:${kind}`,
        `[bridge] status write failed (${kind}): ${redactSecrets(String(e?.message ?? err))}`,
      );
      return false;
    }
  }

  function stopHeartbeat(): void {
    if (timer === null) return;
    const t = timer;
    timer = null;
    try {
      stopTimer(t);
    } catch {
      /* */
    }
  }

  function heartbeat(): boolean {
    // P1 L4: `stopped` is the final record — nothing may rewrite it afterwards.
    if (!status || status.state === "stopped") return false;
    if (sampler) {
      try {
        applyPatch(status, pickPatch(sampler()));
      } catch (err) {
        reportOnce(
          "sample",
          `[bridge] status sample failed: ${redactSecrets(String((err as Error)?.message ?? err))}`,
        );
      }
    }
    status.heartbeatAt = now().toISOString();
    return write();
  }

  return {
    path,
    transition(to, patch) {
      const from = status?.state ?? null;
      if (!canTransition(from, to)) {
        try {
          log(`[bridge] status transition refused: ${from ?? "none"} → ${to}`);
        } catch {
          /* */
        }
        return false;
      }
      const at = now().toISOString();
      if (!status) {
        status = {
          v: 1,
          pid,
          version: opts.version,
          srcPath: opts.srcPath,
          profile: opts.profile,
          startedAt: at,
          heartbeatAt: at,
          state: to,
          inFlight: { paneCards: 0, convs: 0, headlessRunning: 0, headlessQueued: 0 },
          herdr: "down",
        };
        applyPatch(status, pending);
        pending = {};
      }
      if (patch) applyPatch(status, pickPatch(patch));
      status.state = to;
      status.heartbeatAt = at;
      if (to === "stopped") {
        status.stoppedAt = at;
        stopHeartbeat();
      }
      write();
      return true;
    },
    update(patch) {
      mergePending(pickPatch(patch));
    },
    heartbeat,
    startHeartbeat(sample) {
      if (status?.state === "stopped") return;
      if (sample) sampler = sample;
      if (timer !== null) return;
      const handle = startTimer(() => {
        if (timer !== handle) return; // late tick after stop
        try {
          heartbeat();
        } catch {
          /* diagnostics never throw out of the timer */
        }
      }, heartbeatMs);
      timer = handle;
      (handle as { unref?: () => void } | null)?.unref?.();
    },
    stopHeartbeat,
    current() {
      return status ? snapshot(status) : null;
    },
  };
}
