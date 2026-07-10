import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  resetStateHomeDirCache,
  saveSession,
} from "./session-store";
import {
  loadPurpose,
  setPurpose,
  purposePathForRoom,
  hashVerifyList,
  readVerifyAck,
  writeVerifyAck,
  formatPurpose,
} from "./purpose";

describe("purpose card (0.15.1)", () => {
  let root: string;

  beforeEach(() => {
    root = join(
      tmpdir(),
      `loom-purpose-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    mkdirSync(join(root, ".loom", "profiles"), { recursive: true });
    process.env.LOOM_TEST_HOME = root;
    delete process.env.LOOM_SESSION;
    delete process.env.LOOM_PROFILE;
    resetStateHomeDirCache();
    saveSession({
      roomId: "room_test_purpose",
      roomName: "purp",
      inviteCode: "LOOM-TEST",
      peerId: "p_test",
      displayName: "tester",
      color: "#fff",
      agentKind: "shell",
      relayUrl: "ws://127.0.0.1:7842/ws",
      updatedAt: new Date().toISOString(),
    });
  });

  afterEach(() => {
    resetStateHomeDirCache();
    delete process.env.LOOM_TEST_HOME;
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* */
    }
  });

  test("set/show round-trip + 0600", () => {
    const p = setPurpose({
      purpose: "Ship purpose sprint",
      successCriteria: ["tests green"],
      outOfScope: ["CRDT"],
      verify: ["bun test"],
      allowVerify: true,
    });
    expect(p.purpose).toContain("Ship purpose");
    expect(p.verify).toEqual(["bun test"]);
    const loaded = loadPurpose();
    expect(loaded?.purpose).toBe(p.purpose);
    const path = purposePathForRoom("room_test_purpose");
    expect(existsSync(path)).toBe(true);
    const mode = statSync(path).mode & 0o777;
    expect(mode).toBe(0o600);
    expect(formatPurpose(loaded!).length).toBeGreaterThan(10);
  });

  test("M-24: set without allowVerify rejects verify[]", () => {
    expect(() =>
      setPurpose({
        purpose: "x",
        verify: ["rm -rf /"],
        allowVerify: false,
      }),
    ).toThrow(/M-24|verify\[\]/);
  });

  test("M-24: MCP-style omit allowVerify rejects verify", () => {
    expect(() =>
      setPurpose({
        purpose: "safe",
        verify: ["bun test"],
      }),
    ).toThrow(/M-24/);
  });

  test("verify ack hash", () => {
    const h = hashVerifyList(["bun test", "bun run smoke:uc"]);
    writeVerifyAck("room_test_purpose", h);
    expect(readVerifyAck("room_test_purpose")).toBe(h);
  });
});
