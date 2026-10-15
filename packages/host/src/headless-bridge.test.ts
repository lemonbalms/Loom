/**
 * PLAN 0.30.0 P6a — headless backend wired through the bridge.
 * In-process relay + fake herdr, same shape as bridge.test.ts.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildDispatchBody,
  CARD_CONTRACT_VERSION,
  CARD_DISPATCH_LABEL,
  CARD_RESULT_LABEL,
  serializeCardAttachment,
} from "@loom/protocol";
import { RelayServer } from "@loom/relay";
import { defaultWorkerPermissions } from "./agent-argv";
import {
  bridgeConfigDir,
  bridgeConfigPath,
  headlessAgentCommands,
  loadBridgeConfig,
  type BridgeConfig,
  workerConfigFromBridge,
} from "./bridge-config";
import { startBridgeRuntime } from "./bridge-runtime";
import { startFakeHerdr } from "./fake-herdr";
import { HerdrClient } from "./herdr-client";
import { RelayClient } from "./relay-client";
import { type FableSession, resetStateHomeDirCache, setActiveProfile } from "./session-store";

const FAKE = join(import.meta.dir, "fake-agent-cli.ts");
const LOCK = join(tmpdir(), "loom-v030-p2-fake.lock");
const OUTPUT_BYTES = 50_000;

function pushEnv(extra: Record<string, string | undefined>): () => void {
  const prev = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(extra)) {
    prev.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return () => {
    for (const [key, value] of prev) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

async function withFakeLock<T>(fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  for (;;) {
    try {
      mkdirSync(LOCK);
      break;
    } catch {
      try {
        if (Date.now() - statSync(LOCK).mtimeMs > 60_000) {
          rmSync(LOCK, { recursive: true, force: true });
          continue;
        }
      } catch {
        /* raced with the holder */
      }
      if (Date.now() - start > 90_000) throw new Error("fake env lock timeout");
      await Bun.sleep(25);
    }
  }
  try {
    return await fn();
  } finally {
    rmSync(LOCK, { recursive: true, force: true });
  }
}

function killPid(pid: number | undefined): void {
  if (!pid || pid <= 1 || pid === process.pid) return;
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    /* not a group leader */
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    /* already dead */
  }
}

function killDump(dump: string): void {
  if (!dump) return;
  let text = "";
  try {
    text = readFileSync(dump, "utf8");
  } catch {
    return;
  }
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const rec = JSON.parse(line) as { pid?: number };
      killPid(rec.pid);
    } catch {
      /* ignore a torn line */
    }
  }
}

function fakeSession(over: Partial<FableSession> = {}): FableSession {
  return {
    roomId: "room_headless_cfg",
    roomName: "headless-cfg",
    inviteCode: "LOOM-TEST",
    peerId: "p_node",
    displayName: "node/wsl-1",
    color: "#0f0",
    agentKind: "shell",
    relayUrl: "ws://127.0.0.1:1/ws",
    updatedAt: new Date().toISOString(),
    ...over,
  };
}

describe("bridge-config worker section (v0.30.0 P6a)", () => {
  const dir = mkdtempSync(join(tmpdir(), "loom-wcfg-"));
  const cwd = realpathSync(dir);

  beforeAll(() => {
    process.env.LOOM_TEST_HOME = dir;
    resetStateHomeDirCache();
    setActiveProfile(null);
    mkdirSync(bridgeConfigDir(), { recursive: true });
  });

  afterAll(() => {
    delete process.env.LOOM_TEST_HOME;
    resetStateHomeDirCache();
    rmSync(dir, { recursive: true, force: true });
  });

  test("headless dangerous permission rejects at load", () => {
    const profile = "danger-load";
    writeFileSync(
      bridgeConfigPath(profile),
      JSON.stringify({
        worker: {
          backend: "headless",
          cwd,
          allowedRoots: [cwd],
          permissions: {
            claude: {
              permissionMode: "bypassPermissions",
              allowedTools: [],
              disallowedTools: [],
            },
          },
        },
      }),
      "utf8",
    );
    expect(() => loadBridgeConfig(profile)).toThrow(/bypassPermissions/);
  });

  test("headless without cwd rejects", () => {
    const profile = "nocwd";
    writeFileSync(
      bridgeConfigPath(profile),
      JSON.stringify({
        worker: { backend: "headless", allowedRoots: [cwd] },
      }),
      "utf8",
    );
    expect(() => loadBridgeConfig(profile)).toThrow(/worker\.cwd/);
  });

  test("headless timeoutMs above the timer limit rejects", () => {
    const profile = "bigtimeout";
    writeFileSync(
      bridgeConfigPath(profile),
      JSON.stringify({
        worker: { backend: "headless", cwd, allowedRoots: [cwd], timeoutMs: 2_147_483_648 },
      }),
      "utf8",
    );
    expect(() => loadBridgeConfig(profile)).toThrow(/at most 2147483647/);
  });

  test("pane backend ignores junk worker keys", () => {
    const profile = "pane-junk";
    writeFileSync(
      bridgeConfigPath(profile),
      JSON.stringify({
        worker: {
          backend: "pane",
          cwd: 5,
          permissions: {
            claude: { permissionMode: "bypassPermissions" },
          },
        },
      }),
      "utf8",
    );
    const cfg = loadBridgeConfig(profile);
    expect(cfg.worker).toBeUndefined();
    expect(cfg.agentArgv.claude).toEqual(["claude"]);
  });

  test("unknown backend is pane and does not throw", () => {
    const profile = "unknown-backend";
    writeFileSync(
      bridgeConfigPath(profile),
      JSON.stringify({
        worker: {
          backend: "nope",
          permissions: { grok: { permissionMode: "--always-approve" } },
        },
      }),
      "utf8",
    );
    const cfg = loadBridgeConfig(profile);
    expect(cfg.worker).toBeUndefined();
  });

  test("valid headless fills defaults and agent bins", () => {
    const profile = "headless-ok";
    writeFileSync(
      bridgeConfigPath(profile),
      JSON.stringify({
        worker: {
          backend: "headless",
          cwd,
          allowedRoots: [cwd],
        },
      }),
      "utf8",
    );
    const cfg = loadBridgeConfig(profile);
    const worker = workerConfigFromBridge(cfg);
    expect(worker.backend).toBe("headless");
    expect(worker.cwd).toBe(cwd);
    expect(worker.allowedRoots).toEqual([cwd]);
    expect(worker.timeoutMs).toBe(7_200_000);
    expect(worker.maxConcurrent).toEqual({ claude: 1, codex: 1, grok: 1 });
    expect(worker.permissions.claude?.permissionMode).toBe("acceptEdits");
    expect(worker.permissions.codex?.sandbox).toBe("workspace-write");
    const commands = headlessAgentCommands(cfg);
    expect(commands.claude).toEqual({ bin: "claude", args: [] });
    expect(commands.codex).toEqual({ bin: "codex", args: [] });
    expect(commands.grok).toEqual({ bin: "grok", args: [] });
  });

  test("startBridgeRuntime rejects a dangerous headless config", async () => {
    const cfg: BridgeConfig = {
      authorizedDispatchers: ["p_tower"],
      herdrSocketPath: join(dir, "missing.sock"),
      agentArgv: { claude: ["claude"] },
      herdrProtocol: 17,
      worker: {
        backend: "headless",
        cwd,
        allowedRoots: [cwd],
        permissions: {
          claude: {
            permissionMode: "bypassPermissions",
            allowedTools: [],
            disallowedTools: [],
          },
        },
      },
    };
    await expect(
      startBridgeRuntime({
        session: fakeSession(),
        profile: "danger-start",
        config: cfg,
      }),
    ).rejects.toThrow(/bypassPermissions/);
  });
});

describe("headless bridge runtime (v0.30.0 P6a)", () => {
  const port = 32000 + Math.floor(Math.random() * 20000);
  const dir = mkdtempSync(join(tmpdir(), "loom-hbr-"));
  const cwd = realpathSync(dir);
  const sessionFile = join(dir, "session.json");
  const herdrSock = join(dir, "h.sock");
  const argvDump = join(dir, "argv.jsonl");
  const relay = new RelayServer({ host: "127.0.0.1", port });
  let fake: Awaited<ReturnType<typeof startFakeHerdr>>;
  let bridge: Awaited<ReturnType<typeof startBridgeRuntime>> | null = null;
  let tower: RelayClient | null = null;
  let session: FableSession;

  beforeAll(async () => {
    process.env.LOOM_TEST_HOME = dir;
    process.env.LOOM_SESSION = sessionFile;
    process.env.LOOM_NO_AUTO_HOST = "1";
    resetStateHomeDirCache();
    setActiveProfile(null);
    relay.start();
    fake = await startFakeHerdr({
      socketPath: herdrSock,
      autoStatus: "done",
      autoStatusDelayMs: 20,
    });
    tower = new RelayClient({ url: `ws://127.0.0.1:${port}/ws` });
    const created = await tower.createRoom({
      roomName: "headless-bridge",
      displayName: "tower",
      agentKind: "shell",
      peerId: "p_tower",
    });
    if (created.type !== "room.state") throw new Error("create failed");
    session = {
      roomId: created.roomId,
      roomName: created.roomName ?? "headless-bridge",
      inviteCode: created.inviteCode ?? "",
      peerId: "p_node",
      displayName: "node/wsl-1",
      color: "#0f0",
      agentKind: "shell",
      relayUrl: `ws://127.0.0.1:${port}/ws`,
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(sessionFile, JSON.stringify(session), "utf8");
    const cfg: BridgeConfig = {
      authorizedDispatchers: ["p_tower"],
      herdrSocketPath: herdrSock,
      agentArgv: { claude: ["claude"] },
      herdrProtocol: 17,
      worker: {
        backend: "headless",
        cwd,
        allowedRoots: [cwd],
        timeoutMs: 30_000,
        permissions: defaultWorkerPermissions(),
      },
    };
    bridge = await startBridgeRuntime({
      session,
      profile: "node",
      config: cfg,
      herdr: new HerdrClient({ socketPath: herdrSock }),
      submitVerify: { waitMs: 50, retries: 0 },
      headlessAgentCommandOverride: {
        claude: ["bun", FAKE, "--fake-kind", "claude"],
        codex: ["bun", FAKE, "--fake-kind", "codex"],
        grok: ["bun", FAKE, "--fake-kind", "grok"],
      },
    });
  });

  afterAll(async () => {
    killDump(argvDump);
    if (bridge) await bridge.stop();
    tower?.close();
    await fake.close();
    relay.stop();
    delete process.env.LOOM_TEST_HOME;
    delete process.env.LOOM_SESSION;
    resetStateHomeDirCache();
    rmSync(dir, { recursive: true, force: true });
  });

  async function status(): Promise<Record<string, unknown>> {
    const meta = bridge!.meta;
    const res = await fetch(`http://127.0.0.1:${meta.port}/rpc`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${meta.token}`,
      },
      body: JSON.stringify({ op: "status" }),
    });
    expect(res.ok).toBe(true);
    return (await res.json()) as Record<string, unknown>;
  }

  test("status exposes headless queue counts", async () => {
    const body = await status();
    const headless = body.headless as {
      running: Record<string, number>;
      queueDepth: Record<string, number>;
    };
    expect(headless.running).toEqual({ claude: 0, codex: 0, grok: 0 });
    expect(headless.queueDepth).toEqual({ claude: 0, codex: 0, grok: 0 });
  });

  test("dispatch delivers the full fake output and spawns no herdr pane", async () => {
    await withFakeLock(async () => {
      const restore = pushEnv({
        FAKE_OUTPUT_BYTES: String(OUTPUT_BYTES),
        FAKE_DURATION_MS: "0",
        FAKE_TIME_SCALE: "1",
        FAKE_ARGV_DUMP: argvDump,
        FAKE_HANG: undefined,
        FAKE_DENIAL: undefined,
        FAKE_EXIT_ONCE_MARKER: undefined,
        FAKE_ENV_DUMP: undefined,
        FAKE_SPAWN_GRANDCHILD: undefined,
        FAKE_PROMPT_DUMP: undefined,
        FAKE_KIND: undefined,
      });
      try {
        const spawnsBefore = fake.calls.filter(
          (call) =>
            call.method === "agent.start" ||
            call.method === "tab.create" ||
            call.method === "pane.split",
        ).length;
        const cardId = "task_a0306a0000000001";
        const ack = await tower!.handoff({
          to: "@node/wsl-1",
          body: buildDispatchBody({
            title: "headless card",
            cardId,
            node: "node/wsl-1",
          }),
          mode: "task",
          attachments: [
            serializeCardAttachment(CARD_DISPATCH_LABEL, {
              v: CARD_CONTRACT_VERSION,
              cardId,
              sourceRoomId: session.roomId,
              prompt: "write the bytes",
              agentKind: "claude" as const,
            }),
          ],
        });
        expect(["queued", "delivered"]).toContain(ack.status);

        let output = "";
        let truncated: boolean | undefined;
        let found = false;
        for (let i = 0; i < 50; i++) {
          await Bun.sleep(200);
          const inbox = await tower!.listInbox();
          for (const entry of inbox) {
            for (const attachment of entry.handoff.attachments ?? []) {
              if (attachment.label !== CARD_RESULT_LABEL) continue;
              const result = JSON.parse(attachment.content) as {
                cardId?: string;
                status?: string;
                reason?: string;
                output?: string;
                truncated?: boolean;
                node?: string;
              };
              if (result.cardId !== cardId) continue;
              expect(result.status).toBe("failed");
              expect(result.reason).toBe("needs_verification");
              expect(result.node).toBe("node/wsl-1");
              output = result.output ?? "";
              truncated = result.truncated;
              found = true;
            }
          }
          if (found) break;
        }
        expect(found).toBe(true);
        const recorded = JSON.parse(readFileSync(argvDump, "utf8").trim().split("\n")[0]!) as {
          sessionId: string;
          pid?: number;
        };
        const expected = `PARTIAL_READY\nsession:${recorded.sessionId}\nresume:-\n${"x".repeat(OUTPUT_BYTES)}`;
        expect(output).toBe(expected);
        expect(truncated).toBe(false);
        const spawnsAfter = fake.calls.filter(
          (call) =>
            call.method === "agent.start" ||
            call.method === "tab.create" ||
            call.method === "pane.split",
        ).length;
        expect(spawnsAfter).toBe(spawnsBefore);
        expect(fake.listPaneIds()).toEqual([]);
        killPid(recorded.pid);
      } finally {
        killDump(argvDump);
        restore();
      }
    });
  }, 30_000);
});

describe("pane backend status has no headless key", () => {
  const port = 34000 + Math.floor(Math.random() * 20000);
  const dir = mkdtempSync(join(tmpdir(), "loom-pbr-"));
  const sessionFile = join(dir, "session.json");
  const herdrSock = join(dir, "h.sock");
  const relay = new RelayServer({ host: "127.0.0.1", port });
  let fake: Awaited<ReturnType<typeof startFakeHerdr>>;
  let bridge: Awaited<ReturnType<typeof startBridgeRuntime>> | null = null;
  let tower: RelayClient | null = null;

  beforeAll(async () => {
    process.env.LOOM_TEST_HOME = dir;
    process.env.LOOM_SESSION = sessionFile;
    process.env.LOOM_NO_AUTO_HOST = "1";
    resetStateHomeDirCache();
    setActiveProfile(null);
    relay.start();
    fake = await startFakeHerdr({
      socketPath: herdrSock,
      autoStatus: "none",
    });
    tower = new RelayClient({ url: `ws://127.0.0.1:${port}/ws` });
    const created = await tower.createRoom({
      roomName: "pane-bridge",
      displayName: "tower",
      agentKind: "shell",
      peerId: "p_tower",
    });
    if (created.type !== "room.state") throw new Error("create failed");
    const session: FableSession = {
      roomId: created.roomId,
      roomName: created.roomName ?? "pane-bridge",
      inviteCode: created.inviteCode ?? "",
      peerId: "p_node_pane",
      displayName: "node/pane",
      color: "#0f0",
      agentKind: "shell",
      relayUrl: `ws://127.0.0.1:${port}/ws`,
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(sessionFile, JSON.stringify(session), "utf8");
    bridge = await startBridgeRuntime({
      session,
      profile: "pane-node",
      config: {
        authorizedDispatchers: ["p_tower"],
        herdrSocketPath: herdrSock,
        agentArgv: { claude: ["claude"] },
        herdrProtocol: 17,
      },
      herdr: new HerdrClient({ socketPath: herdrSock }),
    });
  });

  afterAll(async () => {
    if (bridge) await bridge.stop();
    tower?.close();
    await fake.close();
    relay.stop();
    delete process.env.LOOM_TEST_HOME;
    delete process.env.LOOM_SESSION;
    resetStateHomeDirCache();
    rmSync(dir, { recursive: true, force: true });
  });

  test("default pane status omits headless", async () => {
    const meta = bridge!.meta;
    const res = await fetch(`http://127.0.0.1:${meta.port}/rpc`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${meta.token}`,
      },
      body: JSON.stringify({ op: "status" }),
    });
    expect(res.ok).toBe(true);
    const body = (await res.json()) as {
      ok?: boolean;
      inFlight?: number;
      headless?: unknown;
    };
    expect(body.ok).toBe(true);
    expect(body.inFlight).toBe(0);
    expect(body.headless).toBeUndefined();
  });
});
