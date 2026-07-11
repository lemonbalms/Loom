/**
 * Room operations: prefer sticky host IPC, fallback to one-shot RelayClient.
 */

import type {
  PeerInfo,
  InboxEntry,
  HandoffSendStatus,
  HandoffAttachment,
} from "@loom/protocol";
import { sanitizePeerText, sanitizeHandoffForOutput } from "@loom/protocol";
import { loadSession, relayClientOptsFromSession, type FableSession } from "./session-store";
import { ensureRelay } from "./relay-daemon";
import { RelayClient } from "./relay-client";
import { tryStickyRpc } from "./sticky-client";
import {
  loadContextPack,
  packToAttachments,
  packIsEmpty,
} from "./context-pack";
import {
  loadTaskBoard,
  boardToAttachments,
  boardIsEmpty,
} from "./task-board";
import { notifyInjectAccepted } from "./inject-control";

export type RoomOpsSource = "host" | "oneshot";

async function withOneShotClient(): Promise<{
  client: RelayClient;
  session: FableSession;
}> {
  const session = loadSession();
  if (!session) {
    throw new Error(
      "No session. Create or join a room first. Use --profile for multi-peer.",
    );
  }
  await ensureRelay({
    relayFlag: session.relayUrl,
    tokenFlag: session.relayToken,
  });
  const client = new RelayClient(relayClientOptsFromSession(session));
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
  if (env.type === "room.state" && env.peerSecret) {
    const { saveSession } = await import("./session-store");
    saveSession({
      ...session,
      peerSecret: env.peerSecret,
      updatedAt: new Date().toISOString(),
    });
  }
  return { client, session: loadSession() ?? session };
}

export async function opsListPeers(): Promise<{
  peers: PeerInfo[];
  roomName: string;
  inviteCode: string;
  meId: string;
  source: RoomOpsSource;
}> {
  const host = await tryStickyRpc({ op: "list_peers" });
  if (host?.ok && host.op === "list_peers") {
    return {
      peers: host.peers,
      roomName: host.roomName,
      inviteCode: host.inviteCode,
      meId: host.meId,
      source: "host",
    };
  }
  const { client, session } = await withOneShotClient();
  try {
    await client.listPeers();
    return {
      peers: client.peers,
      roomName: client.roomName ?? session.roomName,
      inviteCode: client.inviteCode ?? session.inviteCode,
      meId: session.peerId,
      source: "oneshot",
    };
  } finally {
    client.close();
  }
}

export async function opsHandoff(args: {
  to: string;
  body: string;
  mode?: "message" | "task";
  /** Attach local room context pack as handoff attachments */
  withPack?: boolean;
  /**
   * L-5: also embed file bodies for pack paths (implies withPack).
   * Re-resolves allowlist at attach time (TOCTOU-safe skip).
   */
  withPackEmbed?: boolean;
  /** Attach local task board snapshot (multi-machine share, not live sync) */
  withBoard?: boolean;
  attachments?: HandoffAttachment[];
}): Promise<{
  status: HandoffSendStatus;
  to: string;
  handoffId: string;
  notified: boolean;
  recipientCount: number;
  message?: string;
  source: RoomOpsSource;
  packAttached?: boolean;
  packEmbedded?: boolean;
  boardAttached?: boolean;
}> {
  const body = sanitizePeerText(args.body);
  let attachments = args.attachments;
  let packAttached = false;
  let packEmbedded = false;
  let boardAttached = false;
  const wantPack = Boolean(args.withPack || args.withPackEmbed);
  if (wantPack) {
    const pack = loadContextPack();
    if (pack && !packIsEmpty(pack)) {
      const packAtt = packToAttachments(pack, {
        embedFiles: Boolean(args.withPackEmbed),
      });
      attachments = [...(attachments ?? []), ...packAtt];
      packAttached = packAtt.length > 0;
      packEmbedded =
        Boolean(args.withPackEmbed) &&
        packAtt.some((a) => a.label?.startsWith("context-pack-file:"));
    }
  }
  if (args.withBoard) {
    const board = loadTaskBoard();
    if (board && !boardIsEmpty(board)) {
      const boardAtt = boardToAttachments(board);
      attachments = [...(attachments ?? []), ...boardAtt];
      boardAttached = boardAtt.length > 0;
    }
  }

  const host = await tryStickyRpc({
    op: "handoff",
    to: args.to,
    body,
    mode: args.mode,
    attachments,
  });
  if (host?.ok && host.op === "handoff") {
    return {
      status: host.status,
      to: host.to,
      handoffId: host.handoffId,
      notified: host.notified,
      recipientCount: host.recipientCount,
      message: host.message,
      source: "host",
      packAttached,
      packEmbedded,
      boardAttached,
    };
  }
  const { client } = await withOneShotClient();
  try {
    const ack = await client.handoff({
      to: args.to,
      body,
      mode: args.mode ?? "message",
      attachments,
    });
    return {
      status: ack.status,
      to: ack.to,
      handoffId: ack.handoffId,
      notified: ack.notified,
      recipientCount: ack.recipientCount,
      message: ack.message,
      source: "oneshot",
      packAttached,
      packEmbedded,
      boardAttached,
    };
  } finally {
    client.close();
  }
}

export async function opsChat(text: string): Promise<{ source: RoomOpsSource }> {
  const t = sanitizePeerText(text);
  const host = await tryStickyRpc({ op: "chat", text: t });
  if (host?.ok && host.op === "chat") {
    return { source: "host" };
  }
  const { client } = await withOneShotClient();
  try {
    await client.chat(t);
    await Bun.sleep(80);
    return { source: "oneshot" };
  } finally {
    client.close();
  }
}

export async function opsListInbox(): Promise<{
  entries: InboxEntry[];
  count: number;
  source: RoomOpsSource;
}> {
  const host = await tryStickyRpc({ op: "list_inbox" });
  if (host?.ok && host.op === "list_inbox") {
    return {
      entries: host.entries,
      count: host.count,
      source: "host",
    };
  }
  const { client } = await withOneShotClient();
  try {
    const entries = await client.listInbox();
    const safe = entries.map((e) => ({
      ...e,
      handoff: sanitizeHandoffForOutput(e.handoff),
    }));
    return { entries: safe, count: safe.length, source: "oneshot" };
  } finally {
    client.close();
  }
}

export async function opsClaim(
  id: string,
  via: "claim" | "accept" = "claim",
): Promise<{
  ok: boolean;
  entry?: InboxEntry;
  error?: string;
  source: RoomOpsSource;
  session: FableSession;
}> {
  const session = loadSession();
  if (!session) {
    throw new Error("No session.");
  }
  const host = await tryStickyRpc({ op: "claim", id, via });
  if (host?.ok && host.op === "claim") {
    if (host.claimed && host.entry) {
      try {
        await notifyInjectAccepted(host.entry.handoff);
      } catch {
        /* best-effort only */
      }
    }
    return {
      ok: host.claimed,
      entry: host.entry,
      error: host.error,
      source: "host",
      session,
    };
  }
  const { client } = await withOneShotClient();
  try {
    const result = await client.claimHandoff(id, via);
    if (!result.ok || !result.entry) {
      return {
        ok: false,
        error: result.error,
        source: "oneshot",
        session,
      };
    }
    try {
      await notifyInjectAccepted(result.entry.handoff);
    } catch {
      /* best-effort only */
    }
    return {
      ok: true,
      entry: {
        ...result.entry,
        handoff: sanitizeHandoffForOutput(result.entry.handoff),
      },
      source: "oneshot",
      session,
    };
  } finally {
    client.close();
  }
}
