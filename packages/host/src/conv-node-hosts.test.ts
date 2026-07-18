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
  convNodeHostsPath,
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
