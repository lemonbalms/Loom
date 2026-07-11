import { describe, expect, test } from "bun:test";
import { encodeInviteLink, parseInviteArg } from "./invite-link";

describe("invite links", () => {
  test("roundtrips relay URL, token, and invite code", () => {
    const link = encodeInviteLink({
      relayUrl: "ws://example.com:7842/ws",
      token: "secret",
      inviteCode: "LOOM-7K2M",
    });

    expect(parseInviteArg(link)).toEqual({
      kind: "link",
      relayUrl: "ws://example.com:7842/ws",
      token: "secret",
      inviteCode: "LOOM-7K2M",
    });
  });

  test("roundtrips without a token", () => {
    const parsed = parseInviteArg(
      encodeInviteLink({
        relayUrl: "ws://example.com:7842/ws",
        inviteCode: "LOOM-ABCD",
      }),
    );

    expect(parsed.kind).toBe("link");
    if (parsed.kind !== "link") return;
    expect(parsed.relayUrl).toBe("ws://example.com:7842/ws");
    expect(parsed.inviteCode).toBe("LOOM-ABCD");
    expect(parsed.token).toBeUndefined();
  });

  test("classifies LOOM code before any blob decode", () => {
    // R19 M-1 regression: LOOM-XXXX is valid-looking base64url text.
    expect(parseInviteArg("LOOM-7K2M")).toEqual({
      kind: "code",
      code: "LOOM-7K2M",
    });
  });

  test("parses a hand-built valid link", () => {
    const payload = Buffer.from(
      JSON.stringify({
        relayUrl: "ws://1.2.3.4:7842/ws",
        inviteCode: "LOOM-ABCD",
      }),
    ).toString("base64url");
    const parsed = parseInviteArg(`loom://join/${payload}`);

    expect(parsed).toEqual({
      kind: "link",
      relayUrl: "ws://1.2.3.4:7842/ws",
      inviteCode: "LOOM-ABCD",
      token: undefined,
    });
  });

  test("rejects malformed blobs", () => {
    expect(parseInviteArg("loom://join/not-valid-base64!!!").kind).toBe(
      "invalid",
    );
    const invalidJson = Buffer.from("not json").toString("base64url");
    expect(parseInviteArg(`loom://join/${invalidJson}`).kind).toBe("invalid");
  });

  test("rejects missing required link fields", () => {
    const missingRelayUrl = Buffer.from(
      JSON.stringify({ inviteCode: "LOOM-ABCD" }),
    ).toString("base64url");
    const missingInviteCode = Buffer.from(
      JSON.stringify({ relayUrl: "ws://1.2.3.4:7842/ws" }),
    ).toString("base64url");

    expect(parseInviteArg(`loom://join/${missingRelayUrl}`).kind).toBe(
      "invalid",
    );
    expect(parseInviteArg(`loom://join/${missingInviteCode}`).kind).toBe(
      "invalid",
    );
  });

  test("rejects non-invite arguments", () => {
    expect(parseInviteArg("hello").kind).toBe("invalid");
    expect(parseInviteArg("").kind).toBe("invalid");
  });
});
