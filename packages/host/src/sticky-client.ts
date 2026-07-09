import type { StickyHostMeta } from "./sticky-meta";
import {
  clearStickyMeta,
  isPidAlive,
  loadStickyMeta,
  stickyMetaPath,
} from "./sticky-meta";
import type { StickyRpcRequest, StickyRpcResponse } from "./sticky-rpc";
import { loadSession, sessionPath } from "./session-store";

export type HostCallResult =
  | { via: "host"; response: StickyRpcResponse }
  | { via: "none"; reason: string };

/**
 * Meta for a process that is still alive (pid check only).
 * Used by stop/status — does not enforce room/peer match.
 */
export function resolveAliveHostMeta(
  forSessionPath?: string,
): StickyHostMeta | null {
  const sp = forSessionPath ?? sessionPath();
  const meta = loadStickyMeta(sp);
  if (!meta) return null;
  if (!isPidAlive(meta.pid)) {
    clearStickyMeta(sp);
    return null;
  }
  return meta;
}

/**
 * Live host usable for RPC (F-2): pid alive AND roomId/peerId match current session.
 * Mismatch → treat as absent so callers fall back to one-shot (no silent wrong-room send).
 */
export function resolveLiveHostMeta(
  forSessionPath?: string,
): StickyHostMeta | null {
  const sp = forSessionPath ?? sessionPath();
  const meta = resolveAliveHostMeta(sp);
  if (!meta) return null;

  const session = loadSession();
  if (!session) return null;

  if (meta.roomId !== session.roomId || meta.peerId !== session.peerId) {
    return null;
  }
  return meta;
}

/** True when a host process is up but bound to a different room/peer than session. */
export function hostSessionMismatch(
  forSessionPath?: string,
): { meta: StickyHostMeta; sessionRoomId: string; sessionPeerId: string } | null {
  const sp = forSessionPath ?? sessionPath();
  const meta = resolveAliveHostMeta(sp);
  if (!meta) return null;
  const session = loadSession();
  if (!session) return null;
  if (meta.roomId === session.roomId && meta.peerId === session.peerId) {
    return null;
  }
  return {
    meta,
    sessionRoomId: session.roomId,
    sessionPeerId: session.peerId,
  };
}

export async function stickyRpc(
  req: StickyRpcRequest,
  opts?: { meta?: StickyHostMeta; timeoutMs?: number },
): Promise<StickyRpcResponse> {
  const meta = opts?.meta ?? resolveLiveHostMeta();
  if (!meta) {
    return { ok: false, error: "no sticky host", code: "no_host" };
  }
  const timeoutMs = opts?.timeoutMs ?? 8000;
  const url = `http://127.0.0.1:${meta.port}/rpc`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${meta.token}`,
      },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        error: `host HTTP ${res.status}: ${text.slice(0, 200)}`,
        code: "http_error",
      };
    }
    return (await res.json()) as StickyRpcResponse;
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      code: "rpc_failed",
    };
  }
}

/** Try host RPC; returns null if host unavailable or transport error. */
export async function tryStickyRpc(
  req: StickyRpcRequest,
): Promise<StickyRpcResponse | null> {
  const meta = resolveLiveHostMeta();
  if (!meta) return null;
  const res = await stickyRpc(req, { meta });
  if (!res.ok && res.code === "no_host") return null;
  if (!res.ok && (res.code === "rpc_failed" || res.code === "http_error")) {
    return null;
  }
  return res;
}

export function describeHostMeta(meta: StickyHostMeta | null): string {
  if (!meta) {
    const mismatch = hostSessionMismatch();
    if (mismatch) {
      return [
        "sticky host: running but STALE (room/peer ≠ session) — not used for RPC",
        `  meta:     ${stickyMetaPath(mismatch.meta.sessionPath)}`,
        `  host room/peer: ${mismatch.meta.roomId} / ${mismatch.meta.peerId}`,
        `  session room/peer: ${mismatch.sessionRoomId} / ${mismatch.sessionPeerId}`,
        "  fix: loom host stop && loom host start",
      ].join("\n");
    }
    return "sticky host: not running";
  }
  const alive = isPidAlive(meta.pid);
  return [
    `sticky host: ${alive ? "running" : "stale"}`,
    `  meta:   ${stickyMetaPath(meta.sessionPath)}`,
    `  pid:    ${meta.pid}`,
    `  ipc:    http://127.0.0.1:${meta.port}/rpc`,
    `  peer:   ${meta.displayName} (${meta.peerId})`,
    `  room:   ${meta.roomName} (${meta.roomId})`,
    `  since:  ${meta.startedAt}`,
  ].join("\n");
}
