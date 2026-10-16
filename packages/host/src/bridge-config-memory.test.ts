/**
 * PLAN 0.36.0 P4 — bridge config `worker.memory = {"enabled": <boolean>}` (D5 · R1).
 * Parser is `parseSkills`-shaped: omitted → off · non-object → `worker.memory must be an
 * object` · unknown key → `worker.memory.<key> is not a known key` · non-boolean `enabled` →
 * `worker.memory.enabled must be a boolean`. Every error throws from loadBridgeConfig, so a
 * headless bridge refuses to start. Pane / unknown backends ignore the key. WorkerConfig never
 * carries it (R1). Run with HOME and LOOM_TEST_HOME pointing at the same temp dir (R17).
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  bridgeConfigDir,
  bridgeConfigPath,
  loadBridgeConfig,
  saveBridgeConfig,
  workerConfigFromBridge,
} from "./bridge-config";
import { bridgeLockPath } from "./bridge-lock";
import { startBridgeRuntime } from "./bridge-runtime";
import { type FableSession, resetStateHomeDirCache, setActiveProfile } from "./session-store";

const ERR_OBJECT = "worker.memory must be an object";
const ERR_BOOLEAN = "worker.memory.enabled must be a boolean";
const errKey = (key: string) => `worker.memory.${key} is not a known key`;

describe("bridge config worker.memory (PLAN 0.36.0 P4 · D5 · R1)", () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "loom-p4-memcfg-")));
  const saved = new Map<string, string | undefined>();
  function setEnv(key: string, value: string | undefined): void {
    if (!saved.has(key)) saved.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  beforeAll(() => {
    setEnv("LOOM_TEST_HOME", dir);
    setEnv("LOOM_SESSION", join(dir, "session.json"));
    setEnv("LOOM_PROFILE", undefined);
    resetStateHomeDirCache();
    setActiveProfile(null);
    mkdirSync(bridgeConfigDir(), { recursive: true });
  });
  afterAll(() => {
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    resetStateHomeDirCache();
    rmSync(dir, { recursive: true, force: true });
  });

  const headless = (memory?: unknown, absent = false) => ({
    backend: "headless",
    cwd: dir,
    allowedRoots: [dir],
    ...(absent ? {} : { memory }),
  });
  const save = (id: string, worker: unknown) =>
    writeFileSync(bridgeConfigPath(id), JSON.stringify({ worker }), "utf8");

  test("omitted → no memory key (off)", () => {
    save("mem-absent", headless(undefined, true));
    const loaded = loadBridgeConfig("mem-absent");
    expect(loaded.worker?.backend).toBe("headless");
    expect(loaded.worker && "memory" in loaded.worker).toBe(false);
    expect(loaded.worker?.memory?.enabled === true).toBe(false);
  });

  test("{enabled:true} and {enabled:false} are carried as-is", () => {
    save("mem-on", headless({ enabled: true }));
    expect(loadBridgeConfig("mem-on").worker?.memory).toEqual({ enabled: true });
    save("mem-off", headless({ enabled: false }));
    expect(loadBridgeConfig("mem-off").worker?.memory).toEqual({ enabled: false });
  });

  test("WorkerConfig never carries memory (R1 — flag goes to HeadlessDeps)", () => {
    save("mem-wc", headless({ enabled: true }));
    const wc = workerConfigFromBridge(loadBridgeConfig("mem-wc"));
    expect("memory" in wc).toBe(false);
  });

  test("non-object section → exact error", () => {
    for (const [i, bad] of (
      ["yes", 1, true, null, [true], [{ enabled: true }]] as const
    ).entries()) {
      const id = `mem-obj-${i}`;
      save(id, headless(bad));
      expect(() => loadBridgeConfig(id)).toThrow(ERR_OBJECT);
    }
  });

  test("unknown key → exact error naming the key", () => {
    save("mem-key", headless({ enabled: true, extra: 1 }));
    expect(() => loadBridgeConfig("mem-key")).toThrow(errKey("extra"));
    save("mem-key2", headless({ Enabled: true }));
    expect(() => loadBridgeConfig("mem-key2")).toThrow(errKey("Enabled"));
  });

  test("non-boolean or missing enabled → exact error", () => {
    for (const [i, bad] of (
      [{ enabled: "true" }, { enabled: 1 }, { enabled: null }, {}] as const
    ).entries()) {
      const id = `mem-bool-${i}`;
      save(id, headless(bad));
      expect(() => loadBridgeConfig(id)).toThrow(ERR_BOOLEAN);
    }
  });

  test("error messages are exact (no extra text)", () => {
    const cases: Array<[unknown, string]> = [
      [[true], ERR_OBJECT],
      [{ enabled: true, extra: 1 }, errKey("extra")],
      [{ enabled: "x" }, ERR_BOOLEAN],
    ];
    for (const [i, [bad, msg]] of cases.entries()) {
      const id = `mem-exact-${i}`;
      save(id, headless(bad));
      let message = "";
      try {
        loadBridgeConfig(id);
      } catch (e) {
        message = e instanceof Error ? e.message : String(e);
      }
      expect(message).toBe(msg);
    }
  });

  test("headless bridge start is refused on a bad worker.memory (fail-closed, no lock taken)", async () => {
    const session: FableSession = {
      roomId: "room_mem_cfg",
      roomName: "mem-cfg",
      inviteCode: "LOOM-TEST",
      peerId: "p_node",
      displayName: "node/wsl-1",
      color: "#0f0",
      agentKind: "shell",
      relayUrl: "ws://127.0.0.1:1/ws",
      updatedAt: new Date().toISOString(),
    };
    for (const [id, bad, msg] of [
      ["mem-start-obj", "on", ERR_OBJECT],
      ["mem-start-key", { enabled: true, x: 1 }, errKey("x")],
      ["mem-start-bool", { enabled: "true" }, ERR_BOOLEAN],
    ] as const) {
      save(id, headless(bad));
      await expect(startBridgeRuntime({ session, profile: id })).rejects.toThrow(msg);
      expect(() => readFileSync(bridgeLockPath(id))).toThrow();
    }
  });

  test("pane and unknown backends ignore worker.memory (even junk)", () => {
    for (const [i, worker] of [
      { backend: "pane", memory: "junk" },
      { backend: "pane", memory: { enabled: "x", extra: 1 } },
      { backend: "pane", memory: { enabled: true } },
      { backend: "other", memory: [1] },
      { memory: { enabled: true } },
    ].entries()) {
      const id = `mem-pane-${i}`;
      save(id, worker);
      const loaded = loadBridgeConfig(id);
      expect(loaded.worker).toBeUndefined();
    }
  });

  test("loadBridgeConfig → saveBridgeConfig → loadBridgeConfig round-trip keeps memory", () => {
    for (const enabled of [true, false]) {
      const id = `mem-rt-${enabled}`;
      save(id, headless({ enabled }));
      const first = loadBridgeConfig(id);
      saveBridgeConfig(id, first);
      const raw = JSON.parse(readFileSync(bridgeConfigPath(id), "utf8")) as {
        worker?: { memory?: unknown };
      };
      expect(raw.worker?.memory).toEqual({ enabled });
      const second = loadBridgeConfig(id);
      expect(second.worker?.memory).toEqual({ enabled });
      expect(second).toEqual(first);
    }
    save("mem-rt-absent", headless(undefined, true));
    const first = loadBridgeConfig("mem-rt-absent");
    saveBridgeConfig("mem-rt-absent", first);
    const raw = JSON.parse(readFileSync(bridgeConfigPath("mem-rt-absent"), "utf8")) as {
      worker?: Record<string, unknown>;
    };
    expect(raw.worker && "memory" in raw.worker).toBe(false);
    expect(loadBridgeConfig("mem-rt-absent")).toEqual(first);
  });
});
