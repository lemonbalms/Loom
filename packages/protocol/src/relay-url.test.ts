import { describe, expect, test } from "bun:test";
import {
  parseRelayUrl,
  defaultLocalEndpoint,
  buildWsUrl,
} from "./relay-url";

describe("relay-url", () => {
  test("default local", () => {
    const e = defaultLocalEndpoint();
    expect(e.isLocal).toBe(true);
    expect(e.wsUrl).toContain("127.0.0.1");
    expect(e.wsUrl).toContain("7842");
  });

  test("parses ws and host:port", () => {
    const a = parseRelayUrl("ws://example.com:9000");
    expect(a.host).toBe("example.com");
    expect(a.port).toBe(9000);
    expect(a.isLocal).toBe(false);
    expect(a.wsUrl).toBe("ws://example.com:9000/ws");

    const b = parseRelayUrl("10.0.0.5:7842");
    expect(b.host).toBe("10.0.0.5");
    expect(b.port).toBe(7842);
  });

  test("https becomes wss", () => {
    const e = parseRelayUrl("https://relay.example.com");
    expect(e.wsUrl.startsWith("wss://")).toBe(true);
    expect(e.httpOrigin.startsWith("https://")).toBe(true);
  });

  test("token extracted from query but stripped from wsUrl (H-6)", () => {
    const e = parseRelayUrl("ws://h:1/?token=secret");
    expect(e.token).toBe("secret");
    expect(e.wsUrl).not.toContain("token=");
    expect(e.wsUrl).toBe("ws://h:1/ws");
  });

  test("token option kept separate from wsUrl", () => {
    const e = parseRelayUrl("ws://h:1", { token: "secret" });
    expect(e.wsUrl).not.toContain("token=");
    expect(e.token).toBe("secret");
  });

  test("buildWsUrl default omits token", () => {
    expect(buildWsUrl({ host: "a", port: 7842, token: "t" })).toBe(
      "ws://a:7842/ws",
    );
  });

  test("buildWsUrl tokenInQuery opt-in", () => {
    expect(
      buildWsUrl({ host: "a", port: 7842, token: "t", tokenInQuery: true }),
    ).toBe("ws://a:7842/ws?token=t");
  });
});
