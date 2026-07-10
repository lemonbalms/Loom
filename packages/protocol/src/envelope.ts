import { z } from "zod";

/** Wire protocol version for room envelopes. */
export const PROTOCOL_VERSION = 1 as const;

export const DEFAULT_RELAY_PORT = 7842;
export const DEFAULT_RELAY_HOST = "127.0.0.1";

export const AgentKindSchema = z.enum([
  "claude",
  "codex",
  "grok",
  "shell",
  "unknown",
]);
export type AgentKind = z.infer<typeof AgentKindSchema>;

export const PeerInfoSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  color: z.string().min(1),
  agentKind: AgentKindSchema.default("unknown"),
  joinedAt: z.string().datetime({ offset: true }).or(z.string().min(1)),
  /** Live WebSocket connected */
  online: z.boolean().default(true),
});
export type PeerInfo = z.infer<typeof PeerInfoSchema>;

/**
 * L-11 / L-16: hard caps for peer-supplied handoff payloads (relay memory / terminal safety).
 * Units are **UTF-16 code units (JS string length)**, not bytes.
 * 256_000 chars ≈ up to ~512KB heap / ~1MB UTF-8 worst case — document as chars, not "256KB".
 */
export const MAX_ATTACHMENT_CONTENT_CHARS = 256_000;
export const MAX_ATTACHMENTS_PER_HANDOFF = 32;
/** Max handoff body length in JS string chars (not bytes). */
export const MAX_HANDOFF_BODY_CHARS = 100_000;
export const MAX_INBOX_ENTRIES_PER_PEER = 100;

export const HandoffAttachmentSchema = z.object({
  kind: z.enum(["text", "path", "git"]),
  content: z.string().max(MAX_ATTACHMENT_CONTENT_CHARS),
  label: z.string().max(200).optional(),
});
export type HandoffAttachment = z.infer<typeof HandoffAttachmentSchema>;

export const HandoffInboxStatusSchema = z.enum([
  "queued",
  "notified",
  "accepted",
  "claimed",
  "expired",
]);
export type HandoffInboxStatus = z.infer<typeof HandoffInboxStatusSchema>;

export const HandoffPayloadSchema = z.object({
  id: z.string().min(1),
  fromPeerId: z.string().min(1),
  /** peer id, @displayName, or "*" for broadcast */
  to: z.string().min(1),
  body: z.string().max(MAX_HANDOFF_BODY_CHARS),
  mode: z.enum(["message", "task"]).default("message"),
  attachments: z
    .array(HandoffAttachmentSchema)
    .max(MAX_ATTACHMENTS_PER_HANDOFF)
    .optional(),
  createdAt: z.string().min(1),
});
export type HandoffPayload = z.infer<typeof HandoffPayloadSchema>;

export const InboxEntrySchema = z.object({
  handoff: HandoffPayloadSchema,
  status: HandoffInboxStatusSchema,
  toPeerId: z.string().min(1),
});
export type InboxEntry = z.infer<typeof InboxEntrySchema>;

export const HandoffSendStatusSchema = z.enum([
  "queued",
  "delivered",
  "peer_unknown",
]);
export type HandoffSendStatus = z.infer<typeof HandoffSendStatusSchema>;

const BaseEnvelope = z.object({
  v: z.literal(PROTOCOL_VERSION),
  roomId: z.string().min(1),
  ts: z.string().min(1),
  /**
   * L-4 residual: optional RPC correlation id.
   * Client may set on request; relay echoes on the matching reply envelope.
   */
  requestId: z.string().min(1).max(80).optional(),
});

/** Shared optional field on client → relay requests (L-4). */
const ClientRequestIdFields = {
  requestId: z.string().min(1).max(80).optional(),
};

export const PeerJoinEnvelopeSchema = BaseEnvelope.extend({
  type: z.literal("peer.join"),
  peer: PeerInfoSchema,
});

export const PeerLeaveEnvelopeSchema = BaseEnvelope.extend({
  type: z.literal("peer.leave"),
  peerId: z.string().min(1),
});

export const PeerPresenceEnvelopeSchema = BaseEnvelope.extend({
  type: z.literal("peer.presence"),
  peerId: z.string().min(1),
  online: z.boolean(),
});

export const PresenceTypingEnvelopeSchema = BaseEnvelope.extend({
  type: z.literal("presence.typing"),
  peerId: z.string().min(1),
});

export const ChatEnvelopeSchema = BaseEnvelope.extend({
  type: z.literal("chat"),
  from: z.string().min(1),
  text: z.string(),
});

export const HandoffEnvelopeSchema = BaseEnvelope.extend({
  type: z.literal("handoff"),
  handoff: HandoffPayloadSchema,
});

export const HandoffAckEnvelopeSchema = BaseEnvelope.extend({
  type: z.literal("handoff.ack"),
  handoffId: z.string(),
  to: z.string(),
  status: HandoffSendStatusSchema,
  notified: z.boolean(),
  recipientCount: z.number().int().nonnegative(),
  message: z.string().optional(),
});

export const InboxStateEnvelopeSchema = BaseEnvelope.extend({
  type: z.literal("inbox.state"),
  entries: z.array(InboxEntrySchema),
});

export const InboxClaimResultEnvelopeSchema = BaseEnvelope.extend({
  type: z.literal("inbox.claim_result"),
  ok: z.boolean(),
  entry: InboxEntrySchema.optional(),
  error: z.string().optional(),
});

export const TranscriptMirrorEnvelopeSchema = BaseEnvelope.extend({
  type: z.literal("transcript.mirror"),
  from: z.string().min(1),
  chunk: z.string(),
});

export const RoomStateEnvelopeSchema = BaseEnvelope.extend({
  type: z.literal("room.state"),
  peers: z.array(PeerInfoSchema),
  roomName: z.string().optional(),
  inviteCode: z.string().optional(),
  /**
   * M-7: issued only to the connecting peer (not broadcast).
   * Required on later join/reconnect with the same peer.id.
   */
  peerSecret: z.string().min(1).optional(),
});

export const ErrorEnvelopeSchema = BaseEnvelope.extend({
  type: z.literal("error"),
  code: z.string(),
  message: z.string(),
});

/** Peer identity as sent by clients (color assigned by relay if omitted). */
export const ClientPeerSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  agentKind: AgentKindSchema.default("unknown"),
  color: z.string().min(1).optional(),
  joinedAt: z.string().optional(),
  /** M-7: rejoin proof for existing peer.id */
  secret: z.string().min(1).optional(),
});

export const JoinRequestSchema = z.object({
  type: z.literal("join"),
  v: z.literal(PROTOCOL_VERSION),
  inviteCode: z.string().min(1),
  peer: ClientPeerSchema,
  ...ClientRequestIdFields,
});

export const CreateRequestSchema = z.object({
  type: z.literal("create"),
  v: z.literal(PROTOCOL_VERSION),
  roomName: z.string().min(1).default("room"),
  peer: ClientPeerSchema,
  ...ClientRequestIdFields,
});

export const ClientHandoffRequestSchema = z.object({
  type: z.literal("handoff"),
  v: z.literal(PROTOCOL_VERSION),
  handoff: HandoffPayloadSchema.omit({
    id: true,
    fromPeerId: true,
    createdAt: true,
  }).extend({
    id: z.string().optional(),
    fromPeerId: z.string().optional(),
    createdAt: z.string().optional(),
  }),
  ...ClientRequestIdFields,
});

export const ClientChatRequestSchema = z.object({
  type: z.literal("chat"),
  v: z.literal(PROTOCOL_VERSION),
  text: z.string(),
  ...ClientRequestIdFields,
});

export const ClientListPeersRequestSchema = z.object({
  type: z.literal("list_peers"),
  v: z.literal(PROTOCOL_VERSION),
  ...ClientRequestIdFields,
});

export const ClientLeaveRequestSchema = z.object({
  type: z.literal("leave"),
  v: z.literal(PROTOCOL_VERSION),
  ...ClientRequestIdFields,
});

export const ClientListInboxRequestSchema = z.object({
  type: z.literal("list_inbox"),
  v: z.literal(PROTOCOL_VERSION),
  ...ClientRequestIdFields,
});

export const ClientClaimHandoffRequestSchema = z.object({
  type: z.literal("claim_handoff"),
  v: z.literal(PROTOCOL_VERSION),
  id: z.string().min(1),
  /** "claim" = agent, "accept" = human — same first-wins semantics */
  via: z.enum(["claim", "accept"]).default("claim"),
  ...ClientRequestIdFields,
});

export const EnvelopeSchema = z.discriminatedUnion("type", [
  PeerJoinEnvelopeSchema,
  PeerLeaveEnvelopeSchema,
  PeerPresenceEnvelopeSchema,
  PresenceTypingEnvelopeSchema,
  ChatEnvelopeSchema,
  HandoffEnvelopeSchema,
  HandoffAckEnvelopeSchema,
  InboxStateEnvelopeSchema,
  InboxClaimResultEnvelopeSchema,
  TranscriptMirrorEnvelopeSchema,
  RoomStateEnvelopeSchema,
  ErrorEnvelopeSchema,
]);
export type Envelope = z.infer<typeof EnvelopeSchema>;

export const ClientMessageSchema = z.discriminatedUnion("type", [
  JoinRequestSchema,
  CreateRequestSchema,
  ClientHandoffRequestSchema,
  ClientChatRequestSchema,
  ClientListPeersRequestSchema,
  ClientLeaveRequestSchema,
  ClientListInboxRequestSchema,
  ClientClaimHandoffRequestSchema,
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export function parseEnvelope(data: unknown): Envelope {
  return EnvelopeSchema.parse(data);
}

export function safeParseEnvelope(data: unknown) {
  return EnvelopeSchema.safeParse(data);
}

export function parseClientMessage(data: unknown): ClientMessage {
  return ClientMessageSchema.parse(data);
}

export function safeParseClientMessage(data: unknown) {
  return ClientMessageSchema.safeParse(data);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function makeEnvelopeBase(roomId: string) {
  return {
    v: PROTOCOL_VERSION,
    roomId,
    ts: nowIso(),
  } as const;
}
