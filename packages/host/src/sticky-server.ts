/**
 * Sticky long-lived host process — holds one RelayClient + loopback RPC.
 * Entry: sticky-main.ts (spawned by `loom host start`).
 */

import {
  loadSession,
  saveSession,
  relayClientOptsFromSession,
  sessionPath,
  type FableSession,
} from "./session-store";
import { ensureRelay } from "./relay-daemon";
import { RelayClient } from "./relay-client";
import {
  clearStickyMeta,
  generateHostToken,
  writeStickyMeta,
  type StickyHostMeta,
} from "./sticky-meta";
import type { StickyRpcRequest, StickyRpcResponse } from "./sticky-rpc";
import { sanitizePeerText, sanitizeHandoffForOutput } from "@loom/protocol";
import { timingSafeTokenEqual } from "@loom/protocol";
import {
  addTask,
  loadTaskBoard,
  parseTaskStatus,
  updateTask,
  type TaskStatus,
} from "./task-board";

export type StickyServer = {
  meta: StickyHostMeta;
  stop: () => Promise<void>;
};

export async function startStickyServer(opts?: {
  /** Injected session for tests */
  session?: FableSession;
  /** Fixed port (tests); default ephemeral */
  port?: number;
}): Promise<StickyServer> {
  let session = opts?.session ?? loadSession();
  if (!session) {
    throw new Error(
      "No session. Create or join a room first, then: loom host start",
    );
  }

  await ensureRelay({
    relayFlag: session.relayUrl,
    tokenFlag: session.relayToken,
  });

  const client = new RelayClient({
    ...relayClientOptsFromSession(session),
    autoReconnect: true,
    reconnectJoin: {
      inviteCode: session.inviteCode,
      displayName: session.displayName,
      agentKind: session.agentKind,
      peerId: session.peerId,
      color: session.color,
      peerSecret: session.peerSecret,
    },
    // M-13: surface reconnect join/auth failures
    onError(err) {
      console.error(`[sticky-host] relay: ${err.message}`);
    },
  });

  const env = await client.joinRoom({
    inviteCode: session.inviteCode,
    displayName: session.displayName,
    agentKind: session.agentKind,
    peerId: session.peerId,
    color: session.color,
    peerSecret: session.peerSecret,
  });
  if (env.type === "error") {
    client.close();
    throw new Error(env.message);
  }
  // L-15: persist peerSecret from room.state (parity with room-ops one-shot)
  if (env.type === "room.state" && env.peerSecret) {
    session = {
      ...session,
      peerSecret: env.peerSecret,
      updatedAt: new Date().toISOString(),
    };
    saveSession(session);
    client.setReconnectPeerSecret(env.peerSecret);
  }

  const token = generateHostToken();
  const startedAt = new Date().toISOString();
  let stopping = false;
  /** F-3: serialize RPC so concurrent requestOnce handlers do not steal acks. */
  let rpcTail: Promise<void> = Promise.resolve();

  const handleRpc = async (req: StickyRpcRequest): Promise<StickyRpcResponse> => {
    try {
      switch (req.op) {
        case "ping":
          return { ok: true, op: "ping", pong: true };
        case "status":
          return {
            ok: true,
            op: "status",
            pid: process.pid,
            peerId: session.peerId,
            roomId: client.roomId ?? session.roomId,
            roomName: client.roomName ?? session.roomName,
            displayName: session.displayName,
            relayConnected: client.wsOpen,
            startedAt,
            sessionPath: sessionPath(),
          };
        case "list_peers": {
          await client.listPeers();
          return {
            ok: true,
            op: "list_peers",
            peers: client.peers,
            roomName: client.roomName ?? session.roomName,
            inviteCode: client.inviteCode ?? session.inviteCode,
            meId: session.peerId,
          };
        }
        case "list_inbox": {
          const entries = await client.listInbox();
          const safe = entries.map((e) => ({
            ...e,
            handoff: sanitizeHandoffForOutput(e.handoff),
          }));
          return {
            ok: true,
            op: "list_inbox",
            entries: safe,
            count: safe.length,
          };
        }
        case "handoff": {
          const ack = await client.handoff({
            to: req.to,
            body: sanitizePeerText(req.body),
            mode: req.mode ?? "message",
            attachments: req.attachments,
          });
          return {
            ok: true,
            op: "handoff",
            status: ack.status,
            to: ack.to,
            handoffId: ack.handoffId,
            notified: ack.notified,
            recipientCount: ack.recipientCount,
            message: ack.message,
          };
        }
        case "chat": {
          await client.chat(sanitizePeerText(req.text));
          return { ok: true, op: "chat" };
        }
        case "claim": {
          const result = await client.claimHandoff(
            req.id,
            req.via ?? "claim",
          );
          if (!result.ok || !result.entry) {
            return {
              ok: true,
              op: "claim",
              claimed: false,
              error: result.error,
            };
          }
          return {
            ok: true,
            op: "claim",
            claimed: true,
            entry: {
              ...result.entry,
              handoff: sanitizeHandoffForOutput(result.entry.handoff),
            },
          };
        }
        case "list_tasks": {
          // Local room board (same path as CLI/MCP); sanitize display fields
          const board = loadTaskBoard(session.roomId);
          if (!board) {
            return { ok: true, op: "list_tasks", board: null, count: 0 };
          }
          const safe = {
            ...board,
            roomName: board.roomName
              ? sanitizePeerText(board.roomName)
              : board.roomName,
            tasks: board.tasks.map((t) => ({
              ...t,
              title: sanitizePeerText(t.title),
              notes: t.notes ? sanitizePeerText(t.notes) : t.notes,
              assignee: t.assignee
                ? sanitizePeerText(t.assignee)
                : t.assignee,
            })),
          };
          return {
            ok: true,
            op: "list_tasks",
            board: safe,
            count: safe.tasks.length,
          };
        }
        case "add_task": {
          const status = req.status
            ? parseTaskStatus(String(req.status)) ?? undefined
            : undefined;
          if (req.status && !status) {
            return {
              ok: false,
              error: `Invalid status: ${req.status}`,
              code: "bad_status",
            };
          }
          const task = addTask({
            title: req.title,
            assignee: req.assignee,
            status: status as TaskStatus | undefined,
            notes: req.notes,
          });
          return {
            ok: true,
            op: "add_task",
            task: {
              ...task,
              title: sanitizePeerText(task.title),
              notes: task.notes ? sanitizePeerText(task.notes) : task.notes,
            },
          };
        }
        case "update_task": {
          const status = req.status
            ? parseTaskStatus(String(req.status)) ?? undefined
            : undefined;
          if (req.status && !status) {
            return {
              ok: false,
              error: `Invalid status: ${req.status}`,
              code: "bad_status",
            };
          }
          try {
            const task = updateTask(req.id, {
              title: req.title,
              assignee: req.assignee,
              status: status as TaskStatus | undefined,
              notes: req.notes,
            });
            return {
              ok: true,
              op: "update_task",
              task: {
                ...task,
                title: sanitizePeerText(task.title),
                notes: task.notes ? sanitizePeerText(task.notes) : task.notes,
              },
            };
          } catch (e) {
            return {
              ok: false,
              error: e instanceof Error ? e.message : String(e),
              code: "update_failed",
            };
          }
        }
        case "stop": {
          setTimeout(() => {
            void shutdown();
          }, 50);
          return { ok: true, op: "stop", stopping: true };
        }
        default:
          return { ok: false, error: "unknown op", code: "bad_op" };
      }
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        code: "handler_error",
      };
    }
  };

  const runSerializedRpc = (req: StickyRpcRequest): Promise<StickyRpcResponse> => {
    const done = rpcTail.then(() => handleRpc(req));
    rpcTail = done.then(
      () => undefined,
      () => undefined,
    );
    return done;
  };

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: opts?.port ?? 0,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/health" && req.method === "GET") {
        return Response.json({ ok: true });
      }
      if (url.pathname !== "/rpc" || req.method !== "POST") {
        return new Response("sticky host — POST /rpc", { status: 404 });
      }
      const auth = req.headers.get("authorization") || "";
      const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      // F-1: timing-safe compare (M-5 class)
      if (!bearer || !timingSafeTokenEqual(bearer, token)) {
        return Response.json(
          { ok: false, error: "unauthorized", code: "unauthorized" },
          { status: 401 },
        );
      }
      let body: StickyRpcRequest;
      try {
        body = (await req.json()) as StickyRpcRequest;
      } catch {
        return Response.json(
          { ok: false, error: "bad json", code: "bad_json" },
          { status: 400 },
        );
      }
      const result = await runSerializedRpc(body);
      return Response.json(result);
    },
  });

  const boundPort = server.port;
  if (boundPort == null) {
    throw new Error("sticky host failed to bind a port");
  }
  const meta: StickyHostMeta = {
    pid: process.pid,
    port: boundPort,
    token,
    sessionPath: sessionPath(),
    peerId: session.peerId,
    roomId: client.roomId ?? session.roomId,
    roomName: client.roomName ?? session.roomName,
    displayName: session.displayName,
    startedAt,
  };
  writeStickyMeta(meta);

  async function shutdown(): Promise<void> {
    if (stopping) return;
    stopping = true;
    try {
      await client.leave();
    } catch {
      client.close();
    }
    try {
      server.stop(true);
    } catch {
      /* */
    }
    clearStickyMeta(meta.sessionPath);
  }

  const onSignal = () => {
    void shutdown().then(() => process.exit(0));
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  return {
    meta,
    stop: shutdown,
  };
}
