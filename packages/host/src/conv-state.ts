/**
 * Conv (multiturn) local state — shared shape used by both the tower side
 * (conv-ops.ts) and the worker/bridge side (bridge-runtime.ts). Each side
 * normally runs on its own machine with its own loomDir(), but the state
 * path is keyed by (role, convId) — not convId alone — so tower and
 * worker never collide even when they happen to share a loomDir() (e.g.
 * same-machine dogfood/testing, or an in-process test harness driving
 * both sides against one fake loomDir()).
 *
 * PLAN 0.23.0 / docs/CONV_SPEC.md §2.1, §3.3, §3.4.
 *
 * R25 M-2 (fail-closed default): a convId with no local state file —
 * including after a process restart — is "unknown". Callers MUST treat
 * unknown convId intents (turn/close/done_proposal) as ignore+log. This
 * module never invents a re-adopt path; `loadConvState` returning null is
 * the single source of truth for "unknown".
 */
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { loomDir } from "./session-store";
import { readJsonFile, writeAtomicJson, withFileLock } from "./atomic-json";
import type { ConvLimits } from "@loom/protocol";

export type ConvRole = "tower" | "worker";
export type ConvStatus = "open" | "active" | "paused" | "closed";

export type ConvState = {
  convId: string;
  role: ConvRole;
  roomId: string;
  /**
   * Pinned counterpart peerId (R24 M-1 §2.1/§3.3, R25 M-1 brige-side
   * mirror) — fixed once at open (tower) / accept (worker), never
   * reassigned for the life of the conv.
   */
  pinnedPeerId: string;
  status: ConvStatus;
  goal?: string;
  limits: ConvLimits;
  /** Own last emitted turnSeq (this side; open=0 tower / accept=1 worker, then +2). */
  lastOwnSeq: number;
  /** Last-seen turnSeq from the pinned counterpart (§3.3/§4.1.3 idempotent discard). */
  lastPeerSeq: number;
  turnCount: number;
  /** Tower-side board card id, when linked. */
  taskId?: string;
  startedAt: string;
  updatedAt: string;
};

function convsDir(): string {
  return join(loomDir(), "convs");
}

/** Keyed by (role, convId) — see module header for why role is load-bearing. */
export function convStatePath(convId: string, role: ConvRole): string {
  return join(convsDir(), `${role}-${convId}.json`);
}

/** R25 M-2: missing/corrupt/mismatched file ⇒ unknown convId (fail-closed). */
export function loadConvState(convId: string, role: ConvRole): ConvState | null {
  const p = convStatePath(convId, role);
  if (!existsSync(p)) return null;
  try {
    const raw = readJsonFile(p) as ConvState | null;
    if (!raw || typeof raw !== "object" || raw.convId !== convId || raw.role !== role) {
      return null;
    }
    return raw;
  } catch {
    // Corrupt state file: treat as unknown rather than throw — a stuck conv
    // state must never block the fail-closed default.
    return null;
  }
}

export function saveConvState(state: ConvState): void {
  mkdirSync(convsDir(), { recursive: true });
  const p = convStatePath(state.convId, state.role);
  withFileLock(p, () => {
    writeAtomicJson(p, { ...state, updatedAt: new Date().toISOString() });
  });
}

/** Locked read-modify-write. Returns null (no-op) if the conv is unknown. */
export function mutateConvState(
  convId: string,
  role: ConvRole,
  mut: (state: ConvState) => void,
): ConvState | null {
  const p = convStatePath(convId, role);
  return withFileLock(p, () => {
    const cur = loadConvState(convId, role);
    if (!cur) return null;
    mut(cur);
    cur.updatedAt = new Date().toISOString();
    writeAtomicJson(p, cur);
    return cur;
  });
}

export function isKnownConv(convId: string, role: ConvRole): boolean {
  return loadConvState(convId, role) !== null;
}

/** R24 M-1 / R25 M-1: pin check — applied to every intent after open/accept. */
export function pinMatches(state: ConvState, fromPeerId: string): boolean {
  return Boolean(fromPeerId) && state.pinnedPeerId === fromPeerId;
}

/** §3.3 idempotent discard: peer seq must be new AND correct parity for the *other* role. */
export function isFreshPeerSeq(state: ConvState, seq: number): boolean {
  if (!Number.isInteger(seq) || seq < 0) return false;
  if (seq <= state.lastPeerSeq) return false;
  const peerIsWorker = state.role === "tower"; // tower's peer is the worker, and vice versa
  const parityOk = peerIsWorker ? seq % 2 === 1 : seq % 2 === 0;
  return parityOk;
}

/** §2.2 limit check — turn cap or wall-clock elapsed. Does not mutate. */
export function limitsExceeded(state: ConvState): { exceeded: boolean; reason?: string } {
  if (state.turnCount >= state.limits.maxTurns) {
    return { exceeded: true, reason: `maxTurns(${state.limits.maxTurns}) reached` };
  }
  const elapsed = Date.now() - Date.parse(state.startedAt);
  if (elapsed >= state.limits.wallClockMs) {
    return { exceeded: true, reason: `wallClockMs(${state.limits.wallClockMs}) elapsed` };
  }
  return { exceeded: false };
}

function log(...args: unknown[]): void {
  console.error("[loom-conv]", ...args);
}

/** R25 M-2: shared ignore+log helper — never re-adopt on unknown convId. */
export function logUnknownConv(convId: string, intent: string): void {
  log(`fail-closed: unknown convId ${convId} for intent ${intent} — ignored (no re-adopt)`);
}

export function logPinMismatch(convId: string, intent: string, fromPeerId: string): void {
  log(`pin mismatch: convId ${convId} intent ${intent} from ${fromPeerId} — ignored+logged`);
}
