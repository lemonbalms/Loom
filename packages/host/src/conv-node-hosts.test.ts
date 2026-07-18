/**
 * PLAN 0.23.1 (R26 M-1) — tower-side local peer→ssh-host mapping.
 * Missing mapping must resolve to null (fail-closed), never a guessed host.
 */
import { describe, expect, test, beforeAll, afterAll, beforeEach } from "bun:test";
import { mkdirSync, rmSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadConvNodeHosts,
  saveConvNodeHosts,
  resolveConvNodeHost,
  setConvNodeHost,
  removeConvNodeHost,
  convNodeHostsPath,
  validateConvNodePeerId,
  validateConvNodeHost,
  isWellFormedConvNodeMapping,
} from "./conv-node-hosts";
import { resetStateHomeDirCache } from "./session-store";

const dir = join(tmpdir(), `loom-conv-node-hosts-${Date.now()}`);

beforeAll(() => {
  mkdirSync(dir, { recursive: true });
  process.env.LOOM_TEST_HOME = dir;
  resetStateHomeDirCache();
});

afterAll(() => {
  delete process.env.LOOM_TEST_HOME;
  resetStateHomeDirCache();
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* */
  }
});

beforeEach(() => {
  try {
    rmSync(convNodeHostsPath(), { force: true });
  } catch {
    /* */
  }
});

describe("conv-node-hosts (R26 M-1 receiver-local scp host mapping)", () => {
  test("no config file ⇒ empty mapping, resolve returns null (fail-closed)", () => {
    expect(loadConvNodeHosts()).toEqual({});
    expect(resolveConvNodeHost("p_worker")).toBeNull();
  });

  test("save then resolve round-trips a mapping", () => {
    saveConvNodeHosts({ p_worker: "node-alias" });
    expect(resolveConvNodeHost("p_worker")).toBe("node-alias");
    expect(resolveConvNodeHost("p_other")).toBeNull();
  });

  test("setConvNodeHost is a read-modify-write convenience setter", () => {
    setConvNodeHost("p_a", "host-a");
    setConvNodeHost("p_b", "host-b");
    expect(loadConvNodeHosts()).toEqual({ p_a: "host-a", p_b: "host-b" });
  });

  test("config file is written 0600", () => {
    saveConvNodeHosts({ p_worker: "node-alias" });
    const p = convNodeHostsPath();
    expect(existsSync(p)).toBe(true);
    const mode = statSync(p).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  test("corrupt config file ⇒ empty mapping, not a throw", () => {
    Bun.write(convNodeHostsPath(), "{not json");
    expect(loadConvNodeHosts()).toEqual({});
    expect(resolveConvNodeHost("p_worker")).toBeNull();
  });

  test("non-string / empty-string values are dropped, never resolved", () => {
    Bun.write(
      convNodeHostsPath(),
      JSON.stringify({ p_a: "  ", p_b: 42, p_c: "real-host" }),
    );
    expect(loadConvNodeHosts()).toEqual({ p_c: "real-host" });
    expect(resolveConvNodeHost("p_a")).toBeNull();
    expect(resolveConvNodeHost("p_b")).toBeNull();
  });

  test("empty peerId never resolves", () => {
    saveConvNodeHosts({ "": "should-not-resolve" });
    expect(resolveConvNodeHost("")).toBeNull();
  });
});

describe("PLAN 0.23.8 conv-hosts CLI validation (⑨⑩)", () => {
  test("⑨ peerId format: exact p_+16 hex", () => {
    expect(validateConvNodePeerId("p_a7964227d1b25e61")).toBeNull();
    expect(validateConvNodePeerId("p_ABCDEF0123456789")).not.toBeNull(); // uppercase
    expect(validateConvNodePeerId("p_short")).not.toBeNull();
    expect(validateConvNodePeerId("x_a7964227d1b25e61")).not.toBeNull();
    expect(validateConvNodePeerId("p_a7964227d1b25e611")).not.toBeNull(); // 17 hex
  });

  test("⑨ host: leading dash reject, charset, colon reject (R33 M-2)", () => {
    expect(validateConvNodeHost("mac-node")).toBeNull();
    expect(validateConvNodeHost("user@host.example")).toBeNull();
    expect(validateConvNodeHost("host_1.local")).toBeNull();
    expect(validateConvNodeHost("-evil")).not.toBeNull();
    expect(validateConvNodeHost("user@host:2222")).not.toBeNull(); // : excluded
    expect(validateConvNodeHost("host:path")).not.toBeNull();
    expect(validateConvNodeHost("")).not.toBeNull();
    expect(validateConvNodeHost("  ")).not.toBeNull();
    expect(validateConvNodeHost("bad host")).not.toBeNull(); // space
  });

  test("⑨ set/list/rm round-trip + remove no-op", () => {
    const peer = "p_a7964227d1b25e61";
    const host = "kyoungsiklee@localhost";
    expect(isWellFormedConvNodeMapping(peer, host)).toBe(true);
    setConvNodeHost(peer, host);
    expect(loadConvNodeHosts()[peer]).toBe(host);
    expect(removeConvNodeHost(peer)).toBe(true);
    expect(loadConvNodeHosts()[peer]).toBeUndefined();
    expect(removeConvNodeHost(peer)).toBe(false); // no-op
  });

  test("⑩ set keeps file mode 0600", () => {
    setConvNodeHost("p_0123456789abcdef", "node-alias");
    const mode = statSync(convNodeHostsPath()).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  test("L-2: hand-edited malformed entries still load; isWellFormed flags them", () => {
    saveConvNodeHosts({
      bad_peer: "ok-host",
      p_0123456789abcdef: "user@host:22",
      p_fedcba9876543210: "good-host",
    });
    const cfg = loadConvNodeHosts();
    // load accepts non-empty (no CLI gate on load)
    expect(cfg.bad_peer).toBe("ok-host");
    expect(cfg.p_0123456789abcdef).toBe("user@host:22");
    expect(cfg.p_fedcba9876543210).toBe("good-host");
    expect(isWellFormedConvNodeMapping("bad_peer", "ok-host")).toBe(false);
    expect(
      isWellFormedConvNodeMapping("p_0123456789abcdef", "user@host:22"),
    ).toBe(false);
    expect(
      isWellFormedConvNodeMapping("p_fedcba9876543210", "good-host"),
    ).toBe(true);
  });
});

describe("PLAN 0.23.8 bridge-config paneCleanup sanitize", () => {
  test("invalid paneCleanup loads as auto", async () => {
    const { loadBridgeConfig, saveBridgeConfig, bridgeConfigPath } =
      await import("./bridge-config");
    const profile = "test-pane-cleanup-sanitize";
    saveBridgeConfig(profile, {
      authorizedDispatchers: [],
      herdrSocketPath: "/tmp/x.sock",
      agentArgv: { claude: ["claude"] },
      // @ts-expect-error intentional invalid for sanitize test
      paneCleanup: "bogus",
    });
    // Write raw invalid to file after save
    const p = bridgeConfigPath(profile);
    const raw = JSON.parse(await Bun.file(p).text()) as Record<string, unknown>;
    raw.paneCleanup = "bogus";
    await Bun.write(p, `${JSON.stringify(raw, null, 2)}\n`);
    const loaded = loadBridgeConfig(profile);
    expect(loaded.paneCleanup).toBe("auto");

    raw.paneCleanup = "keep";
    await Bun.write(p, `${JSON.stringify(raw, null, 2)}\n`);
    expect(loadBridgeConfig(profile).paneCleanup).toBe("keep");
  });
});
