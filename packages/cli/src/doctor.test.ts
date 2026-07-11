import { describe, expect, test } from "bun:test";
import {
  doctorExitCode,
  hostSection,
  redactToken,
  relaySection,
  renderDoctor,
  sessionSection,
  summarizeDoctor,
  type DoctorSection,
} from "./doctor";

const session = {
  roomId: "room_1",
  roomName: "demo",
  inviteCode: "LOOM-ABCD",
  peerId: "p_alice",
  displayName: "alice",
  agentKind: "codex" as const,
  relayUrl: "ws://127.0.0.1:7842/ws",
  relayToken: "secret-token",
  peerSecret: "peer-secret",
};

describe("doctor pure builders", () => {
  test("redactToken strips token query values", () => {
    expect(redactToken("ws://host:7842/ws?token=secret&x=1")).toBe(
      "ws://host:7842/ws?token=<redacted>&x=1",
    );
    expect(redactToken("not a url ?token=secret next")).toBe("not a url ?token=<redacted> next");
  });

  test("exit summary makes only fail non-zero", () => {
    const warnOnly: DoctorSection[] = [
      { title: "x", lines: [{ status: "warn", message: "careful" }] },
    ];
    const withFail: DoctorSection[] = [
      ...warnOnly,
      { title: "y", lines: [{ status: "fail", message: "broken" }] },
    ];

    expect(summarizeDoctor(withFail)).toEqual({
      ok: 0,
      warn: 1,
      fail: 1,
      info: 0,
    });
    expect(doctorExitCode(warnOnly)).toBe(0);
    expect(doctorExitCode(withFail)).toBe(1);
    expect(renderDoctor(withFail)).toContain("Summary: 0 ok, 1 warn, 1 fail, 0 info");
  });

  test("no session renders exactly one info line for session relay host", () => {
    const sections = [
      sessionSection(null),
      relaySection({ session: null }),
      hostSection({
        session: null,
        meta: null,
        pidAlive: false,
        rpc: { kind: "skipped" },
      }),
    ];

    for (const section of sections) {
      expect(section.lines).toHaveLength(1);
      expect(section.lines[0]!.status).toBe("info");
    }
    expect(doctorExitCode(sections)).toBe(0);
  });

  test("relay reports loopback warning and unreachable fail", () => {
    const section = relaySection({
      session,
      endpoint: {
        wsUrl: "ws://127.0.0.1:7842/ws?token=secret",
        httpOrigin: "http://127.0.0.1:7842",
        host: "127.0.0.1",
        token: "secret",
        isLocal: true,
      },
      probe: { kind: "error", error: "Connection refused" },
    });

    expect(section.lines.some((l) => l.status === "warn" && l.message.includes("loopback"))).toBe(
      true,
    );
    expect(
      section.lines.some((l) => l.status === "fail" && l.message.includes("unreachable")),
    ).toBe(true);
    expect(renderDoctor([section])).not.toContain("secret");
  });

  test("host stale pid is warn and does not fail", () => {
    const section = hostSection({
      session,
      meta: {
        pid: 999999,
        port: 18500,
        sessionPath: "/tmp/session.json",
        peerId: "p_alice",
        roomId: "room_1",
        roomName: "demo",
        displayName: "alice",
      },
      pidAlive: false,
      rpc: { kind: "skipped" },
    });

    expect(section.lines[0]).toEqual({
      status: "warn",
      message: "sticky host stale: pid 999999 is not alive",
    });
    expect(doctorExitCode([section])).toBe(0);
  });
});
