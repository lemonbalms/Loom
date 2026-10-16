/**
 * PLAN 0.37.0 P1 — bridge config `worker.strictEnforcement: boolean` and
 * `worker.rules = {"enabled": <boolean>}` (D3 · D4(a) · ② bridge 설정) plus the doctor's pure
 * `readBridgeWorkerFlags` (② · R14). `worker.maxConcurrent.<agent>: 0` is P2 (R55-L4) and is not
 * exercised here.
 * Parsers: strictEnforcement omitted → no key · non-boolean → `worker.strictEnforcement must be a
 * boolean`; rules is `parseMemory`-shaped (`worker.rules must be an object` · `worker.rules.<key>
 * is not a known key` · `worker.rules.enabled must be a boolean`). Every error throws from
 * loadBridgeConfig (headless bridge refuses to start); pane / unknown backends ignore both keys.
 * Run with HOME and LOOM_TEST_HOME pointing at the same temp dir (R21).
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultWorkerPermissions } from "./agent-argv";
import * as bridgeConfig from "./bridge-config";
import {
  bridgeConfigDir,
  bridgeConfigPath,
  loadBridgeConfig,
  saveBridgeConfig,
  workerConfigFromBridge,
} from "./bridge-config";
import { bridgeLockPath } from "./bridge-lock";
import { startBridgeRuntime } from "./bridge-runtime";
import {
  type FableSession,
  loomDir,
  resetStateHomeDirCache,
  setActiveProfile,
} from "./session-store";

const ERR_STRICT = "worker.strictEnforcement must be a boolean";
const ERR_RULES_OBJECT = "worker.rules must be an object";
const ERR_RULES_BOOLEAN = "worker.rules.enabled must be a boolean";
const errRulesKey = (key: string) => `worker.rules.${key} is not a known key`;

type Flags = {
  backend: "pane" | "headless";
  enabled: string[];
  strictEnforcement: boolean;
  memoryEnabled: boolean;
  rulesEnabled: boolean;
  permissions: unknown;
};
type ReadFlags = (raw: unknown) => Flags;
/** Looked up at call time so a missing export fails each case on its own (red phase). */
function readBridgeWorkerFlags(raw: unknown): Flags {
  const fn = (bridgeConfig as unknown as { readBridgeWorkerFlags?: ReadFlags })
    .readBridgeWorkerFlags;
  if (typeof fn !== "function") throw new Error("readBridgeWorkerFlags is not exported");
  return fn(raw);
}

function messageOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  return "";
}

describe("bridge config worker.strictEnforcement · worker.rules (PLAN 0.37.0 P1 · D3 · D4(a))", () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "loom-p1-policycfg-")));
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

  const headless = (extra: Record<string, unknown> = {}) => ({
    backend: "headless",
    cwd: dir,
    allowedRoots: [dir],
    ...extra,
  });
  const save = (id: string, worker: unknown) =>
    writeFileSync(bridgeConfigPath(id), JSON.stringify({ worker }), "utf8");

  describe("worker.strictEnforcement", () => {
    test("omitted → no key", () => {
      save("strict-absent", headless());
      const loaded = loadBridgeConfig("strict-absent");
      expect(loaded.worker?.backend).toBe("headless");
      expect(loaded.worker && "strictEnforcement" in loaded.worker).toBe(false);
    });

    test("true and false are carried as-is", () => {
      save("strict-on", headless({ strictEnforcement: true }));
      expect(loadBridgeConfig("strict-on").worker?.strictEnforcement).toBe(true);
      save("strict-off", headless({ strictEnforcement: false }));
      expect(loadBridgeConfig("strict-off").worker?.strictEnforcement).toBe(false);
    });

    test("non-boolean → exact error", () => {
      for (const [i, bad] of (["true", 1, 0, null, {}, [true]] as const).entries()) {
        const id = `strict-bad-${i}`;
        save(id, headless({ strictEnforcement: bad }));
        expect(messageOf(() => loadBridgeConfig(id))).toBe(ERR_STRICT);
      }
    });
  });

  describe("worker.rules", () => {
    test("omitted → no key (off)", () => {
      save("rules-absent", headless());
      const loaded = loadBridgeConfig("rules-absent");
      expect(loaded.worker && "rules" in loaded.worker).toBe(false);
      expect(loaded.worker?.rules?.enabled === true).toBe(false);
    });

    test("{enabled:true} and {enabled:false} are carried as-is", () => {
      save("rules-on", headless({ rules: { enabled: true } }));
      expect(loadBridgeConfig("rules-on").worker?.rules).toEqual({ enabled: true });
      save("rules-off", headless({ rules: { enabled: false } }));
      expect(loadBridgeConfig("rules-off").worker?.rules).toEqual({ enabled: false });
    });

    test("non-object section → exact error", () => {
      for (const [i, bad] of (
        ["yes", 1, true, null, [true], [{ enabled: true }]] as const
      ).entries()) {
        const id = `rules-obj-${i}`;
        save(id, headless({ rules: bad }));
        expect(messageOf(() => loadBridgeConfig(id))).toBe(ERR_RULES_OBJECT);
      }
    });

    test("unknown key → exact error naming the key", () => {
      save("rules-key", headless({ rules: { enabled: true, extra: 1 } }));
      expect(messageOf(() => loadBridgeConfig("rules-key"))).toBe(errRulesKey("extra"));
      save("rules-key2", headless({ rules: { Enabled: true } }));
      expect(messageOf(() => loadBridgeConfig("rules-key2"))).toBe(errRulesKey("Enabled"));
    });

    test("non-boolean or missing enabled → exact error", () => {
      for (const [i, bad] of (
        [{ enabled: "true" }, { enabled: 1 }, { enabled: null }, {}] as const
      ).entries()) {
        const id = `rules-bool-${i}`;
        save(id, headless({ rules: bad }));
        expect(messageOf(() => loadBridgeConfig(id))).toBe(ERR_RULES_BOOLEAN);
      }
    });
  });

  test("WorkerConfig never carries strictEnforcement or rules (WorkerConfig unchanged)", () => {
    save("both-wc", headless({ strictEnforcement: true, rules: { enabled: true } }));
    const wc = workerConfigFromBridge(loadBridgeConfig("both-wc"));
    expect("strictEnforcement" in wc).toBe(false);
    expect("rules" in wc).toBe(false);
  });

  test("pane and unknown backends ignore both keys (even junk)", () => {
    for (const [i, worker] of [
      { backend: "pane", strictEnforcement: "junk", rules: "junk" },
      { backend: "pane", strictEnforcement: true, rules: { enabled: "x", extra: 1 } },
      { backend: "pane", rules: { enabled: true } },
      { backend: "other", strictEnforcement: 1, rules: [1] },
      { strictEnforcement: true, rules: { enabled: true } },
    ].entries()) {
      const id = `policy-pane-${i}`;
      save(id, worker);
      expect(loadBridgeConfig(id).worker).toBeUndefined();
    }
  });

  test("headless bridge start is refused on a bad key (fail-closed, no lock taken)", async () => {
    const session: FableSession = {
      roomId: "room_policy_cfg",
      roomName: "policy-cfg",
      inviteCode: "LOOM-TEST",
      peerId: "p_node",
      displayName: "node/wsl-1",
      color: "#0f0",
      agentKind: "shell",
      relayUrl: "ws://127.0.0.1:1/ws",
      updatedAt: new Date().toISOString(),
    };
    for (const [id, extra, msg] of [
      ["policy-start-strict", { strictEnforcement: "yes" }, ERR_STRICT],
      ["policy-start-rules-obj", { rules: "on" }, ERR_RULES_OBJECT],
      ["policy-start-rules-key", { rules: { enabled: true, x: 1 } }, errRulesKey("x")],
      ["policy-start-rules-bool", { rules: { enabled: "true" } }, ERR_RULES_BOOLEAN],
    ] as const) {
      save(id, headless(extra));
      await expect(startBridgeRuntime({ session, profile: id })).rejects.toThrow(msg);
      expect(() => readFileSync(bridgeLockPath(id))).toThrow();
    }
  });

  test("loadBridgeConfig → saveBridgeConfig → loadBridgeConfig round-trip keeps both keys", () => {
    for (const strict of [true, false]) {
      for (const enabled of [true, false]) {
        const id = `policy-rt-${strict}-${enabled}`;
        save(id, headless({ strictEnforcement: strict, rules: { enabled } }));
        const first = loadBridgeConfig(id);
        saveBridgeConfig(id, first);
        const raw = JSON.parse(readFileSync(bridgeConfigPath(id), "utf8")) as {
          worker?: { strictEnforcement?: unknown; rules?: unknown };
        };
        expect(raw.worker?.strictEnforcement).toBe(strict);
        expect(raw.worker?.rules).toEqual({ enabled });
        const second = loadBridgeConfig(id);
        expect(second.worker?.strictEnforcement).toBe(strict);
        expect(second.worker?.rules).toEqual({ enabled });
        expect(second).toEqual(first);
      }
    }
    save("policy-rt-absent", headless());
    const first = loadBridgeConfig("policy-rt-absent");
    saveBridgeConfig("policy-rt-absent", first);
    const raw = JSON.parse(readFileSync(bridgeConfigPath("policy-rt-absent"), "utf8")) as {
      worker?: Record<string, unknown>;
    };
    expect(raw.worker && "strictEnforcement" in raw.worker).toBe(false);
    expect(raw.worker && "rules" in raw.worker).toBe(false);
    expect(loadBridgeConfig("policy-rt-absent")).toEqual(first);
  });

  describe("readBridgeWorkerFlags (② doctor용 순수 파서 · R14)", () => {
    const PANE_FLAGS = {
      backend: "pane",
      enabled: [],
      strictEnforcement: false,
      memoryEnabled: false,
      rulesEnabled: false,
      permissions: defaultWorkerPermissions(),
    };

    test("not headless → pane defaults (no throw on junk)", () => {
      for (const raw of [
        undefined,
        null,
        "headless",
        [1],
        {},
        { backend: "pane", strictEnforcement: "junk", rules: [1], memory: 3, permissions: "x" },
        { backend: "other", rules: { enabled: true } },
      ]) {
        expect(readBridgeWorkerFlags(raw)).toEqual(PANE_FLAGS as Flags);
      }
    });

    test("headless defaults → all agents enabled, every flag false, default permissions", () => {
      expect(readBridgeWorkerFlags(headless())).toEqual({
        backend: "headless",
        enabled: ["claude", "codex", "grok"],
        strictEnforcement: false,
        memoryEnabled: false,
        rulesEnabled: false,
        permissions: defaultWorkerPermissions(),
      });
    });

    test("headless flags are read; permissions match loadBridgeConfig for the same section", () => {
      const permissions = {
        claude: { permissionMode: "acceptEdits", disallowedTools: ["Bash(make deploy *)"] },
      };
      const section = headless({
        strictEnforcement: true,
        memory: { enabled: true },
        rules: { enabled: true },
        maxConcurrent: { codex: 2 },
        permissions,
      });
      const flags = readBridgeWorkerFlags(section);
      expect(flags.backend).toBe("headless");
      expect(flags.enabled).toEqual(["claude", "codex", "grok"]);
      expect(flags.strictEnforcement).toBe(true);
      expect(flags.memoryEnabled).toBe(true);
      expect(flags.rulesEnabled).toBe(true);
      save("flags-perm", section);
      expect(flags.permissions).toEqual(loadBridgeConfig("flags-perm").worker?.permissions);
      const off = readBridgeWorkerFlags(
        headless({
          strictEnforcement: false,
          memory: { enabled: false },
          rules: { enabled: false },
        }),
      );
      expect([off.strictEnforcement, off.memoryEnabled, off.rulesEnabled]).toEqual([
        false,
        false,
        false,
      ]);
    });

    test("headless errors throw with the loadBridgeConfig wording", () => {
      const cases: Array<[Record<string, unknown>, string]> = [
        [{ strictEnforcement: "yes" }, ERR_STRICT],
        [{ rules: "on" }, ERR_RULES_OBJECT],
        [{ rules: { enabled: true, x: 1 } }, errRulesKey("x")],
        [{ rules: { enabled: 1 } }, ERR_RULES_BOOLEAN],
        [{ memory: [true] }, "worker.memory must be an object"],
        [{ memory: { enabled: "x" } }, "worker.memory.enabled must be a boolean"],
        [{ permissions: "x" }, "worker.permissions must be an object"],
        [{ maxConcurrent: "x" }, "worker.maxConcurrent must be an object"],
      ];
      for (const [i, [extra, msg]] of cases.entries()) {
        const section = headless(extra);
        expect(messageOf(() => readBridgeWorkerFlags(section))).toBe(msg);
        const id = `flags-err-${i}`;
        save(id, section);
        expect(messageOf(() => loadBridgeConfig(id))).toBe(msg);
      }
    });

    test("never calls loomDir()/loadPolicy — an invalid policy.json does not make it throw", () => {
      const policyPath = join(loomDir(), "policy.json");
      mkdirSync(loomDir(), { recursive: true });
      writeFileSync(policyPath, JSON.stringify({ version: 2 }), "utf8");
      try {
        const section = headless({ strictEnforcement: true, rules: { enabled: true } });
        save("flags-badpolicy", section);
        // The bridge loader does read policy.json and refuses …
        expect(messageOf(() => loadBridgeConfig("flags-badpolicy"))).not.toBe("");
        // … the doctor flag reader does not.
        expect(messageOf(() => readBridgeWorkerFlags(section))).toBe("");
        expect(readBridgeWorkerFlags(section).strictEnforcement).toBe(true);
      } finally {
        rmSync(policyPath, { force: true });
      }
    });
  });
});
