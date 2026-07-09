import { describe, expect, test } from "bun:test";
import {
  PROTOCOL_VERSION,
  parseEnvelope,
  parseClientMessage,
  safeParseEnvelope,
  HandoffPayloadSchema,
  HandoffAttachmentSchema,
  MAX_ATTACHMENT_CONTENT_CHARS,
  nowIso,
} from "./envelope";
import { generateInviteCode, generateId, generateHandoffId } from "./codes";
import { formatHandoffBlock, formatRoomBadge } from "./format";

describe("protocol envelopes", () => {
  test("parses room.state envelope", () => {
    const env = parseEnvelope({
      v: PROTOCOL_VERSION,
      type: "room.state",
      roomId: "room_abc",
      ts: nowIso(),
      roomName: "sprint-42",
      inviteCode: "LOOM-ABCD",
      peers: [
        {
          id: "p1",
          displayName: "alice",
          color: "#FF6B9D",
          agentKind: "claude",
          joinedAt: nowIso(),
        },
      ],
    });
    expect(env.type).toBe("room.state");
    if (env.type === "room.state") {
      expect(env.peers).toHaveLength(1);
      expect(env.roomName).toBe("sprint-42");
    }
  });

  test("M-7: room.state accepts peerSecret; join accepts peer.secret", () => {
    const env = parseEnvelope({
      v: PROTOCOL_VERSION,
      type: "room.state",
      roomId: "room_abc",
      ts: nowIso(),
      roomName: "sprint",
      inviteCode: "LOOM-ABCD",
      peers: [],
      peerSecret: "sec_test_value_base64url",
    });
    expect(env.type).toBe("room.state");
    if (env.type === "room.state") {
      expect(env.peerSecret).toBe("sec_test_value_base64url");
    }
    const join = parseClientMessage({
      type: "join",
      v: PROTOCOL_VERSION,
      inviteCode: "LOOM-ABCD",
      peer: {
        id: "p1",
        displayName: "alice",
        agentKind: "claude",
        secret: "sec_test_value_base64url",
      },
    });
    expect(join.type).toBe("join");
    if (join.type === "join") {
      expect(join.peer.secret).toBe("sec_test_value_base64url");
    }
  });

  test("parses handoff envelope", () => {
    const handoff = HandoffPayloadSchema.parse({
      id: generateHandoffId(),
      fromPeerId: "p1",
      to: "*",
      body: "the british are coming",
      mode: "message",
      createdAt: nowIso(),
    });
    const env = parseEnvelope({
      v: PROTOCOL_VERSION,
      type: "handoff",
      roomId: "room_abc",
      ts: nowIso(),
      handoff,
    });
    expect(env.type).toBe("handoff");
    if (env.type === "handoff") {
      expect(env.handoff.body).toContain("british");
    }
  });

  test("rejects invalid envelope", () => {
    const r = safeParseEnvelope({ type: "nope" });
    expect(r.success).toBe(false);
  });

  test("L-11: attachment content max rejected by schema", () => {
    const big = "x".repeat(MAX_ATTACHMENT_CONTENT_CHARS + 1);
    const r = HandoffAttachmentSchema.safeParse({
      kind: "text",
      content: big,
    });
    expect(r.success).toBe(false);
  });

  test("L-11: attachment at max accepted", () => {
    const ok = HandoffAttachmentSchema.safeParse({
      kind: "text",
      content: "x".repeat(100),
    });
    expect(ok.success).toBe(true);
  });

  test("parses create client message", () => {
    const msg = parseClientMessage({
      type: "create",
      v: PROTOCOL_VERSION,
      roomName: "demo",
      peer: {
        id: "p1",
        displayName: "bob",
        color: "#4ECDC4",
        agentKind: "codex",
      },
    });
    expect(msg.type).toBe("create");
  });

  test("parses join client message", () => {
    const msg = parseClientMessage({
      type: "join",
      v: PROTOCOL_VERSION,
      inviteCode: "LOOM-TEST",
      peer: {
        id: "p2",
        displayName: "carol",
        color: "#FFE66D",
        agentKind: "grok",
      },
    });
    expect(msg.type).toBe("join");
  });
});

describe("codes", () => {
  test("invite code format", () => {
    const code = generateInviteCode();
    expect(code).toMatch(/^LOOM-[A-Z0-9]{4}$/);
  });

  test("ids are unique-ish", () => {
    const a = generateId("p");
    const b = generateId("p");
    expect(a).not.toBe(b);
    expect(a.startsWith("p_")).toBe(true);
  });
});

describe("format", () => {
  test("handoff block contains markers", () => {
    const block = formatHandoffBlock({
      id: "ho_1",
      fromPeerId: "p1",
      to: "*",
      body: "hello peer",
      mode: "message",
      createdAt: nowIso(),
    });
    expect(block).toContain("LOOM HANDOFF");
    expect(block).toContain("hello peer");
  });

  test("room badge", () => {
    expect(formatRoomBadge({ roomName: "x", peerCount: 2 })).toContain("2 peers");
    expect(formatRoomBadge({ roomName: "x", peerCount: 1 })).toContain("1 peer");
  });
});
