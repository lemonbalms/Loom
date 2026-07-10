/**
 * Sticky host loopback IPC contract (Phase 4.0a).
 * HTTP JSON on 127.0.0.1 only; Authorization: Bearer <meta.token>.
 */

import type {
  PeerInfo,
  InboxEntry,
  HandoffSendStatus,
  HandoffAttachment,
} from "@loom/protocol";
import type { TaskBoard, TaskItem, TaskStatus } from "./task-board";

export type StickyRpcRequest =
  | { op: "ping" }
  | { op: "status" }
  | { op: "list_peers" }
  | { op: "list_inbox" }
  | {
      op: "handoff";
      to: string;
      body: string;
      mode?: "message" | "task";
      attachments?: HandoffAttachment[];
    }
  | { op: "chat"; text: string }
  | { op: "claim"; id: string; via?: "claim" | "accept" }
  /** 0.12: local room board via sticky (same file as CLI/MCP) */
  | { op: "list_tasks" }
  | {
      op: "add_task";
      title: string;
      assignee?: string;
      status?: TaskStatus | string;
      notes?: string;
    }
  | {
      op: "update_task";
      id: string;
      title?: string;
      assignee?: string;
      status?: TaskStatus | string;
      notes?: string;
    }
  | { op: "stop" };

export type StickyStatusPayload = {
  ok: true;
  pid: number;
  peerId: string;
  roomId: string;
  roomName: string;
  displayName: string;
  relayConnected: boolean;
  startedAt: string;
  sessionPath: string;
};

export type StickyRpcResponse =
  | { ok: true; op: "ping"; pong: true }
  | ({ ok: true; op: "status" } & StickyStatusPayload)
  | {
      ok: true;
      op: "list_peers";
      peers: PeerInfo[];
      roomName: string;
      inviteCode: string;
      meId: string;
    }
  | { ok: true; op: "list_inbox"; entries: InboxEntry[]; count: number }
  | {
      ok: true;
      op: "handoff";
      status: HandoffSendStatus;
      to: string;
      handoffId: string;
      notified: boolean;
      recipientCount: number;
      message?: string;
    }
  | { ok: true; op: "chat" }
  | {
      ok: true;
      op: "claim";
      claimed: boolean;
      entry?: InboxEntry;
      error?: string;
    }
  | {
      ok: true;
      op: "list_tasks";
      board: TaskBoard | null;
      count: number;
    }
  | { ok: true; op: "add_task"; task: TaskItem }
  | { ok: true; op: "update_task"; task: TaskItem }
  | { ok: true; op: "stop"; stopping: true }
  | { ok: false; error: string; code?: string };
