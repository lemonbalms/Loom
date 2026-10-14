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

describe("v0.29.0 PATCH 1 expected-red", () => {
  const ts = () => nowIso();
  const uuid = "550e8400-e29b-41d4-a716-446655440000";

  function chatRaw(extra: Record<string, unknown> = {}) {
    return {
      v: PROTOCOL_VERSION,
      type: "chat" as const,
      roomId: "room_abc",
      ts: ts(),
      from: "p1",
      text: "hi",
      ...extra,
    };
  }

  test("(a) BaseEnvelope keeps optional ev_ eventId and positive seq; old envelopes still parse", () => {
    const plain = parseEnvelope(chatRaw());
    expect(plain.type).toBe("chat");
    expect((plain as { eventId?: string }).eventId).toBeUndefined();
    expect((plain as { seq?: number }).seq).toBeUndefined();

    const peer = {
      id: "p1",
      displayName: "alice",
      color: "#fff",
      agentKind: "claude" as const,
      joinedAt: ts(),
      online: true,
    };
    const handoff = {
      id: "ho_1",
      fromPeerId: "p1",
      to: "*",
      body: "body",
      mode: "message" as const,
      createdAt: ts(),
    };
    const stampedAt = ts();
    const cases: unknown[] = [
      chatRaw({ eventId: "ev_abc", seq: 3, ts: stampedAt }),
      {
        v: PROTOCOL_VERSION,
        type: "peer.join",
        roomId: "room_abc",
        ts: stampedAt,
        peer,
        eventId: "ev_abc",
        seq: 3,
      },
      {
        v: PROTOCOL_VERSION,
        type: "peer.leave",
        roomId: "room_abc",
        ts: stampedAt,
        peerId: "p1",
        eventId: "ev_abc",
        seq: 3,
      },
      {
        v: PROTOCOL_VERSION,
        type: "peer.presence",
        roomId: "room_abc",
        ts: stampedAt,
        peerId: "p1",
        online: false,
        eventId: "ev_abc",
        seq: 3,
      },
      {
        v: PROTOCOL_VERSION,
        type: "handoff",
        roomId: "room_abc",
        ts: stampedAt,
        handoff,
        eventId: "ev_abc",
        seq: 3,
      },
      {
        v: PROTOCOL_VERSION,
        type: "handoff.ack",
        roomId: "room_abc",
        ts: stampedAt,
        handoffId: "ho_1",
        to: "*",
        status: "delivered",
        notified: true,
        recipientCount: 1,
        eventId: "ev_abc",
        seq: 3,
      },
      {
        v: PROTOCOL_VERSION,
        type: "room.state",
        roomId: "room_abc",
        ts: stampedAt,
        peers: [],
        eventId: "ev_abc",
        seq: 3,
      },
      {
        v: PROTOCOL_VERSION,
        type: "inbox.state",
        roomId: "room_abc",
        ts: stampedAt,
        entries: [],
        eventId: "ev_abc",
        seq: 3,
      },
      {
        v: PROTOCOL_VERSION,
        type: "inbox.claim_result",
        roomId: "room_abc",
        ts: stampedAt,
        ok: false,
        error: "missing",
        eventId: "ev_abc",
        seq: 3,
      },
      {
        v: PROTOCOL_VERSION,
        type: "error",
        roomId: "room_abc",
        ts: stampedAt,
        code: "x",
        message: "m",
        eventId: "ev_abc",
        seq: 3,
      },
    ];
    for (const raw of cases) {
      const env = parseEnvelope(raw) as { type: string; eventId?: string; seq?: number };
      expect(env.eventId).toBe("ev_abc");
      expect(env.seq).toBe(3);
    }
    expect(PROTOCOL_VERSION).toBe(1);
  });

  test("(a) eventId must use the ev_ prefix and seq must be a positive integer", () => {
    const bad: unknown[] = [
      chatRaw({ eventId: "nope", seq: 1 }),
      chatRaw({ eventId: "ev_", seq: 1 }),
      chatRaw({ eventId: "", seq: 1 }),
      chatRaw({ eventId: "ev_ok", seq: 0 }),
      chatRaw({ eventId: "ev_ok", seq: -2 }),
      chatRaw({ eventId: "ev_ok", seq: 1.5 }),
      chatRaw({ eventId: "ev_ok", seq: "1" }),
    ];
    for (const raw of bad) {
      expect(safeParseEnvelope(raw).success).toBe(false);
    }
    const ok = safeParseEnvelope(chatRaw({ eventId: "ev_ok", seq: 1 }));
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect((ok.data as { eventId?: string }).eventId).toBe("ev_ok");
      expect((ok.data as { seq?: number }).seq).toBe(1);
    }
  });

  test("(c) chat and handoff requests keep a UUID clientEventId and reject non-UUID or >64 chars", () => {
    const plain = parseClientMessage({
      type: "chat",
      v: PROTOCOL_VERSION,
      text: "hi",
    });
    expect(plain.type).toBe("chat");
    expect((plain as { clientEventId?: string }).clientEventId).toBeUndefined();

    const chat = parseClientMessage({
      type: "chat",
      v: PROTOCOL_VERSION,
      text: "hi",
      clientEventId: uuid,
    }) as { clientEventId?: string };
    expect(chat.clientEventId).toBe(uuid);

    const handoff = parseClientMessage({
      type: "handoff",
      v: PROTOCOL_VERSION,
      handoff: { to: "@bob", body: "x" },
      clientEventId: uuid,
    }) as { clientEventId?: string };
    expect(handoff.clientEventId).toBe(uuid);

    const rejected = [
      "not-a-uuid",
      "x".repeat(65),
      "zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz",
      "",
    ];
    for (const clientEventId of rejected) {
      expect(
        safeParseClientMessage({
          type: "chat",
          v: PROTOCOL_VERSION,
          text: "t",
          clientEventId,
        }).success,
      ).toBe(false);
      expect(
        safeParseClientMessage({
          type: "handoff",
          v: PROTOCOL_VERSION,
          handoff: { to: "*", body: "b" },
          clientEventId,
        }).success,
      ).toBe(false);
    }
  });
});
