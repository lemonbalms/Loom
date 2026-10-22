/**
 * PLAN 0.45.3 P1 (D1 · R1–R4 · R11) — herdr protocol support set at bridge startup.
 *
 * Harness = `startBridgeRuntime({ session, profile, config })` + `startFakeHerdr({ socketPath,
 * version, protocol })` (bridge.test.ts fail-fast shape) under a temp HOME + `LOOM_TEST_HOME`:
 * ① no pin + 17 → start · ② no pin + 22 → start · ③ no pin + 16 → refuse · ④ pin 17 + 22 →
 * refuse · ⑤ pin 22 + 22 → start (pinned) · ⑥ pin 16 + 16 → refuse (R4 — pin outside the set)
 * · ⑦ loader leaves an absent `herdrProtocol` absent · ⑧ the `--allow` save round trip does not
 * write a key the operator never set (R1 ⓒ).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { RelayServer } from "@loom/relay";
import {
  type BridgeConfig,
  bridgeConfigPath,
  loadBridgeConfig,
  saveBridgeConfig,
} from "./bridge-config";
import { type BridgeRuntime, startBridgeRuntime } from "./bridge-runtime";
import { startFakeHerdr } from "./fake-herdr";
import { RelayClient } from "./relay-client";
import { type FableSession, resetStateHomeDirCache, setActiveProfile } from "./session-store";

type Fake = Awaited<ReturnType<typeof startFakeHerdr>>;

describe("herdr protocol support set (PLAN 0.45.3 P1 · R11)", () => {
  const port = 22000 + Math.floor(Math.random() * 8000);
  const dir = join(tmpdir(), `loom-0453-protocol-${Date.now()}-${process.pid}`);
  const relay = new RelayServer({ host: "127.0.0.1", port });
  const sock17 = join(dir, "herdr-17.sock");
  const sock22 = join(dir, "herdr-22.sock");
  const sock16 = join(dir, "herdr-16.sock");
  const fakes: Fake[] = [];
  const stderrLines: string[] = [];
  const realStderr = console.error;
  const savedEnv: Record<string, string | undefined> = {
    HOME: process.env.HOME,
    LOOM_TEST_HOME: process.env.LOOM_TEST_HOME,
    LOOM_SESSION: process.env.LOOM_SESSION,
    LOOM_NO_AUTO_HOST: process.env.LOOM_NO_AUTO_HOST,
  };
  let baseSession: FableSession;
  let nodeSeq = 0;

  function nodeSession(): FableSession {
    nodeSeq += 1;
    return {
      ...baseSession,
      peerId: `p_node${nodeSeq}`,
      displayName: `node/proto-${nodeSeq}`,
      color: "#0f0",
      peerSecret: undefined,
    };
  }

  function config(socketPath: string, herdrProtocol?: number): BridgeConfig {
    return {
      authorizedDispatchers: ["p_tower"],
      herdrSocketPath: socketPath,
      agentArgv: { claude: ["claude"] },
      ...(herdrProtocol === undefined ? {} : { herdrProtocol }),
    };
  }

  async function startOk(profile: string, cfg: BridgeConfig): Promise<void> {
    let bridge: BridgeRuntime | null = null;
    try {
      bridge = await startBridgeRuntime({ session: nodeSession(), profile, config: cfg });
    } finally {
      if (bridge) await bridge.stop();
    }
  }

  async function startError(profile: string, cfg: BridgeConfig): Promise<string> {
    let bridge: BridgeRuntime | null = null;
    try {
      bridge = await startBridgeRuntime({ session: nodeSession(), profile, config: cfg });
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    } finally {
      if (bridge) await bridge.stop();
    }
    throw new Error(`bridge started for profile ${profile}; expected a startup refusal`);
  }

  function herdrOkLines(): string[] {
    return stderrLines.filter((l) => l.includes("herdr ok"));
  }

  beforeAll(async () => {
    mkdirSync(dir, { recursive: true });
    process.env.HOME = dir;
    process.env.LOOM_TEST_HOME = dir;
    process.env.LOOM_NO_AUTO_HOST = "1";
    resetStateHomeDirCache();
    setActiveProfile(null);
    relay.start();
    fakes.push(await startFakeHerdr({ socketPath: sock17, version: "0.7.5", protocol: 17 }));
    fakes.push(await startFakeHerdr({ socketPath: sock22, version: "0.9.5", protocol: 22 }));
    fakes.push(await startFakeHerdr({ socketPath: sock16, version: "0.7.4", protocol: 16 }));

    const bootstrap = new RelayClient({ url: `ws://127.0.0.1:${port}/ws` });
    const created = await bootstrap.createRoom({
      roomName: "proto-0453",
      displayName: "tower",
      agentKind: "shell",
      peerId: "p_tower",
    });
    if (created.type !== "room.state") throw new Error("create failed");
    const towerSecret = created.peerSecret ?? bootstrap.peerSecret!;
    bootstrap.close();
    baseSession = {
      roomId: created.roomId,
      roomName: created.roomName ?? "proto-0453",
      inviteCode: created.inviteCode ?? "",
      peerId: "p_tower",
      displayName: "tower",
      color: "#fff",
      agentKind: "shell",
      relayUrl: `ws://127.0.0.1:${port}/ws`,
      peerSecret: towerSecret,
      updatedAt: new Date().toISOString(),
    };
    process.env.LOOM_SESSION = join(dir, "node-session.json");
    writeFileSync(process.env.LOOM_SESSION, JSON.stringify(baseSession), "utf8");
    console.error = (...args: unknown[]) => {
      stderrLines.push(args.map(String).join(" "));
    };
  });

  afterAll(async () => {
    console.error = realStderr;
    for (const f of fakes) await f.close();
    relay.stop();
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetStateHomeDirCache();
    rmSync(dir, { recursive: true, force: true });
  });

  beforeEach(() => {
    stderrLines.length = 0;
  });

  test("① no pin + protocol 17 → starts · log names the supported set", async () => {
    await startOk("proto-1", config(sock17));
    expect(herdrOkLines()).toEqual(["[loom-bridge] herdr ok v0.7.5 protocol 17 (supported: 17, 22)"]);
  });

  test("② no pin + protocol 22 → starts · log names the supported set", async () => {
    await startOk("proto-2", config(sock22));
    expect(herdrOkLines()).toEqual(["[loom-bridge] herdr ok v0.9.5 protocol 22 (supported: 17, 22)"]);
  });

  test("③ no pin + protocol 16 → refuses · not-supported text", async () => {
    const msg = await startError("proto-3", config(sock16));
    expect(msg).toBe(
      `herdr unreachable (${sock16}): herdr protocol 16 is not supported (supported: 17, 22)`,
    );
    expect(herdrOkLines()).toEqual([]);
  });

  test("④ pin 17 + protocol 22 → refuses · pinned text names the config path", async () => {
    const path = bridgeConfigPath("proto-4");
    const msg = await startError("proto-4", config(sock22, 17));
    expect(msg).toBe(
      `herdr unreachable (${sock22}): herdr protocol 22 != pinned 17 (bridge config herdrProtocol; supported: 17, 22 — remove herdrProtocol from ${path} to accept any supported protocol)`,
    );
    expect(path.startsWith(dir)).toBe(true);
    expect(herdrOkLines()).toEqual([]);
  });

  test("⑤ pin 22 + protocol 22 → starts · (pinned)", async () => {
    await startOk("proto-5", config(sock22, 22));
    expect(herdrOkLines()).toEqual(["[loom-bridge] herdr ok v0.9.5 protocol 22 (pinned)"]);
  });

  test("⑥ pin 16 + protocol 16 → refuses · pin outside the supported set (R4)", async () => {
    const path = bridgeConfigPath("proto-6");
    const msg = await startError("proto-6", config(sock16, 16));
    expect(msg).toBe(
      `herdr unreachable (${sock16}): herdr protocol pin 16 is not supported (bridge config herdrProtocol in ${path}; supported: 17, 22)`,
    );
    expect(herdrOkLines()).toEqual([]);
  });

  test("⑦ loader: absent herdrProtocol stays absent · a number is kept", () => {
    const missing = "proto-7-missing";
    expect(loadBridgeConfig(missing).herdrProtocol).toBeUndefined();

    const unset = bridgeConfigPath("proto-7-unset");
    mkdirSync(dirname(unset), { recursive: true });
    writeFileSync(unset, JSON.stringify({ herdrSocketPath: sock22 }), "utf8");
    expect(loadBridgeConfig("proto-7-unset").herdrProtocol).toBeUndefined();

    const pinned = bridgeConfigPath("proto-7-pinned");
    writeFileSync(pinned, JSON.stringify({ herdrSocketPath: sock22, herdrProtocol: 22 }), "utf8");
    expect(loadBridgeConfig("proto-7-pinned").herdrProtocol).toBe(22);
  });

  test("⑧ save round trip (--allow path) writes no herdrProtocol key", () => {
    const profile = "proto-8";
    const p = bridgeConfigPath(profile);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify({ herdrSocketPath: sock22 }), "utf8");
    const cfg = loadBridgeConfig(profile);
    cfg.authorizedDispatchers = [...cfg.authorizedDispatchers, "p_tower"];
    saveBridgeConfig(profile, cfg);
    const saved = JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
    expect(saved.authorizedDispatchers).toEqual(["p_tower"]);
    expect("herdrProtocol" in saved).toBe(false);
  });
});
