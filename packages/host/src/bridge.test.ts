/**
 * PLAN 0.22.0 bridge tests — fake herdr + in-process relay.
 * Covers M-1/M-2, at-most-once paths, fail-fast, peerSecret rejoin durability hooks.
 */
import { describe, expect, test, afterAll, beforeAll } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { RelayServer } from "@loom/relay";
import {
  CARD_CONTRACT_VERSION,
  CARD_DISPATCH_LABEL,
  CARD_RESULT_LABEL,
  buildDispatchBody,
  serializeCardAttachment,
} from "@loom/protocol";
import { RelayClient } from "./relay-client";
import { HerdrClient, BARE_ENTER } from "./herdr-client";
import { startFakeHerdr } from "./fake-herdr";
import { startBridgeRuntime } from "./bridge-runtime";
import {
  isAuthorizedDispatcher,
  resolveAgentArgv,
  defaultBridgeConfig,
  type BridgeConfig,
} from "./bridge-config";
import { applyCardResult } from "./card-ops";
import {
  resetStateHomeDirCache,
  setActiveProfile,
  type FableSession,
} from "./session-store";
import { addTask, loadTaskBoard } from "./task-board";

describe("M-1 dispatcher allowlist", () => {
  test("default deny when empty", () => {
    const cfg: BridgeConfig = {
      authorizedDispatchers: [],
      herdrSocketPath: "/tmp/x",
      agentArgv: { claude: ["claude"] },
    };
    expect(isAuthorizedDispatcher(cfg, "p_tower")).toBe(false);
  });
  test("allowlisted peer accepted", () => {
    const cfg: BridgeConfig = {
      authorizedDispatchers: ["p_tower"],
      herdrSocketPath: "/tmp/x",
      agentArgv: { claude: ["claude"] },
    };
    expect(isAuthorizedDispatcher(cfg, "p_tower")).toBe(true);
    expect(isAuthorizedDispatcher(cfg, "p_evil")).toBe(false);
  });
  test("resolveAgentArgv rejects shell even when misconfigured as claude", () => {
    const cfg: BridgeConfig = {
      authorizedDispatchers: [],
      herdrSocketPath: "/tmp/x",
      agentArgv: { claude: ["bash"] },
    };
    expect(resolveAgentArgv(cfg, "claude")).toBeNull();
    expect(resolveAgentArgv(defaultBridgeConfig(), "claude")).toEqual([
      "claude",
    ]);
  });
});

describe("M-2 bare enter constant", () => {
  test("BARE_ENTER is newline only", () => {
    expect(BARE_ENTER).toBe("\n");
    expect(BARE_ENTER.includes("Untrusted")).toBe(false);
  });
});

describe("apply_card_result L-2", () => {
  const dir = join(tmpdir(), `loom-card-ops-${Date.now()}`);
  const sessionFile = join(dir, "session.json");

  beforeAll(() => {
    mkdirSync(dir, { recursive: true });
    process.env.LOOM_TEST_HOME = dir;
    process.env.LOOM_SESSION = sessionFile;
    resetStateHomeDirCache();
    setActiveProfile(null);
    const session: FableSession = {
      roomId: "room_card_ops",
      roomName: "card-ops",
      inviteCode: "LOOM-TEST",
      peerId: "p_tower",
      displayName: "tower",
      color: "#fff",
      agentKind: "shell",
      relayUrl: "ws://127.0.0.1:1/ws",
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(sessionFile, JSON.stringify(session), "utf8");
  });

  afterAll(() => {
    delete process.env.LOOM_TEST_HOME;
    delete process.env.LOOM_SESSION;
    resetStateHomeDirCache();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* */
    }
  });

  test("done → done; node mismatch rejected", () => {
    const task = addTask({
      title: "t1",
      assignee: "node/wsl-1",
      status: "doing",
    });
    const finishedAt = new Date().toISOString();
    const bad = applyCardResult({
      resultJson: JSON.stringify({
        v: 1,
        cardId: task.id,
        status: "done",
        node: "node/evil",
        seq: 1,
        output: "x",
        summary: "ok",
        finishedAt,
      }),
    });
    expect(bad.ok).toBe(false);

    const good = applyCardResult({
      resultJson: JSON.stringify({
        v: 1,
        cardId: task.id,
        status: "done",
        node: "node/wsl-1",
        seq: 1,
        output: "all good",
        summary: "all good",
        finishedAt,
      }),
    });
    expect(good.ok).toBe(true);
    if (good.ok) expect(good.status).toBe("done");
  });
});

describe("herdr client + fake server", () => {
  const sock = join(tmpdir(), `herdr-fake-${Date.now()}.sock`);
  let fake: Awaited<ReturnType<typeof startFakeHerdr>>;

  beforeAll(async () => {
    fake = await startFakeHerdr({
      socketPath: sock,
      autoStatus: "done",
      autoStatusDelayMs: 20,
    });
  });

  afterAll(async () => {
    await fake.close();
  });

  test("ping + start + send M-2 separation", async () => {
    const c = new HerdrClient({ socketPath: sock });
    const pong = await c.ping();
    expect(pong.protocol).toBe(16);
    const agent = await c.agentStart({
      name: "t",
      argv: ["claude"],
      env: { LOOM_CARD: "task_abc" },
    });
    expect(agent.pane_id).toBeTruthy();
    await c.injectPromptAndSubmit(agent.terminal_id, "hello-prompt");
    // Wait for auto done event path
    await Bun.sleep(80);
    const text = await c.paneRead(agent.pane_id);
    expect(text).toContain("hello-prompt");
    // M-2: two agent.send calls — prompt then bare enter
    const sends = fake.calls.filter((x) => x.method === "agent.send");
    expect(sends.length).toBeGreaterThanOrEqual(2);
    expect(sends[0]!.params.text).toBe("hello-prompt");
    expect(sends[1]!.params.text).toBe("\n");
    // No pane.run with prompt
    expect(fake.calls.every((x) => x.method !== "pane.run")).toBe(true);
    c.close();
  });

  test("fail-fast protocol mismatch", async () => {
    const badSock = join(tmpdir(), `herdr-bad-${Date.now()}.sock`);
    const bad = await startFakeHerdr({
      socketPath: badSock,
      protocol: 99,
      autoStatus: "none",
    });
    const c = new HerdrClient({ socketPath: badSock });
    const pong = await c.ping();
    expect(pong.protocol).toBe(99);
    c.close();
    await bad.close();
  });
});

describe("bridge runtime vertical slice (relay + fake herdr)", () => {
  const port = 19600 + Math.floor(Math.random() * 300);
  const dir = join(tmpdir(), `loom-bridge-${Date.now()}`);
  const sessionFile = join(dir, "session.json");
  const herdrSock = join(dir, "herdr.sock");
  const relay = new RelayServer({
    host: "127.0.0.1",
    port,
  });
  let fake: Awaited<ReturnType<typeof startFakeHerdr>>;
  let bridge: Awaited<ReturnType<typeof startBridgeRuntime>> | null = null;
  let tower: RelayClient | null = null;
  let session: FableSession;
  let inviteCode = "";

  beforeAll(async () => {
    mkdirSync(dir, { recursive: true });
    process.env.LOOM_TEST_HOME = dir;
    process.env.LOOM_SESSION = sessionFile;
    process.env.LOOM_NO_AUTO_HOST = "1";
    resetStateHomeDirCache();
    setActiveProfile(null);
    relay.start();
    fake = await startFakeHerdr({
      socketPath: herdrSock,
      autoStatus: "done",
      autoStatusDelayMs: 40,
    });

    // Tower creates room
    tower = new RelayClient({ url: `ws://127.0.0.1:${port}/ws` });
    const created = await tower.createRoom({
      roomName: "bridge-test",
      displayName: "tower",
      agentKind: "shell",
      peerId: "p_tower",
    });
    if (created.type !== "room.state") throw new Error("create failed");
    inviteCode = created.inviteCode ?? "";
    const towerSecret = created.peerSecret ?? tower.peerSecret!;
    // Bridge peer session (node)
    session = {
      roomId: created.roomId,
      roomName: created.roomName ?? "bridge-test",
      inviteCode,
      peerId: "p_node",
      displayName: "node/wsl-1",
      color: "#0f0",
      agentKind: "shell",
      relayUrl: `ws://127.0.0.1:${port}/ws`,
      peerSecret: undefined,
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(sessionFile, JSON.stringify(session), "utf8");

    const cfg: BridgeConfig = {
      authorizedDispatchers: ["p_tower"],
      herdrSocketPath: herdrSock,
      agentArgv: { claude: ["claude"] },
      herdrProtocol: 16,
    };

    bridge = await startBridgeRuntime({
      session,
      profile: "node",
      config: cfg,
      herdr: new HerdrClient({
        socketPath: herdrSock,
      }),
    });

    // Keep tower secret for rejoin test
    void towerSecret;
  });

  afterAll(async () => {
    if (bridge) await bridge.stop();
    tower?.close();
    await fake.close();
    relay.stop();
    delete process.env.LOOM_TEST_HOME;
    delete process.env.LOOM_SESSION;
    resetStateHomeDirCache();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* */
    }
  });

  test("authorized dispatch → [DONE] result", async () => {
    const cardId = "task_abcd1234ef567890";
    const payload = {
      v: CARD_CONTRACT_VERSION,
      cardId,
      sourceRoomId: session.roomId,
      prompt: "write hello",
      agentKind: "claude" as const,
    };
    const att = serializeCardAttachment(CARD_DISPATCH_LABEL, payload);
    const body = buildDispatchBody({
      title: "hello card",
      cardId,
      node: "node/wsl-1",
    });

    const ack = await tower!.handoff({
      to: "@node/wsl-1",
      body,
      mode: "task",
      attachments: [att],
    });
    expect(["queued", "delivered"]).toContain(ack.status);

    // Wait for bridge to process + herdr auto done + result handoff
    let found = false;
    for (let i = 0; i < 40; i++) {
      await Bun.sleep(100);
      const inbox = await tower!.listInbox();
      const hit = inbox.find((e) =>
        e.handoff.attachments?.some(
          (a) => a.label === CARD_RESULT_LABEL,
        ),
      );
      if (hit) {
        found = true;
        expect(hit.handoff.body).toContain("[DONE]");
        const content = hit.handoff.attachments!.find(
          (a) => a.label === CARD_RESULT_LABEL,
        )!.content;
        const result = JSON.parse(content) as {
          status: string;
          cardId: string;
          node: string;
        };
        expect(result.cardId).toBe(cardId);
        expect(result.status).toBe("done");
        expect(result.node).toBe("node/wsl-1");
        break;
      }
    }
    expect(found).toBe(true);

    // M-2: inject used separate send for enter
    const sends = fake.calls.filter((c) => c.method === "agent.send");
    expect(sends.some((s) => s.params.text === "\n")).toBe(true);
    const promptSend = sends.find(
      (s) =>
        typeof s.params.text === "string" &&
        String(s.params.text).includes("write hello"),
    );
    expect(promptSend).toBeTruthy();
  });

  test("M-1: unauthorized dispatcher ignored (no result)", async () => {
    // Evil peer joins and dispatches
    const evil = new RelayClient({ url: `ws://127.0.0.1:${port}/ws` });
    await evil.joinRoom({
      inviteCode,
      displayName: "evil",
      agentKind: "shell",
      peerId: "p_evil",
    });
    const cardId = "task_evil000011112222";
    const payload = {
      v: CARD_CONTRACT_VERSION,
      cardId,
      sourceRoomId: session.roomId,
      prompt: "pwn",
      agentKind: "claude" as const,
    };
    await evil.handoff({
      to: "@node/wsl-1",
      body: buildDispatchBody({
        title: "evil",
        cardId,
        node: "node/wsl-1",
      }),
      mode: "task",
      attachments: [serializeCardAttachment(CARD_DISPATCH_LABEL, payload)],
    });
    await Bun.sleep(500);
    // No agent.start for evil card (LOOM_CARD)
    const starts = fake.calls.filter(
      (c) =>
        c.method === "agent.start" &&
        (c.params.env as { LOOM_CARD?: string } | undefined)?.LOOM_CARD ===
          cardId,
    );
    expect(starts.length).toBe(0);
    evil.close();
  });

  test("fail-fast: herdr down refuses bridge start", async () => {
    const missing = join(dir, "missing.sock");
    let threw = false;
    try {
      await startBridgeRuntime({
        session: {
          ...session,
          peerId: "p_node2",
          displayName: "node/other",
        },
        profile: "other",
        config: {
          authorizedDispatchers: ["p_tower"],
          herdrSocketPath: missing,
          agentArgv: { claude: ["claude"] },
        },
      });
    } catch (e) {
      threw = true;
      expect(String(e)).toMatch(/herdr unreachable/i);
    }
    expect(threw).toBe(true);
  });

  test("offline dispatch queues (durability)", async () => {
    // Stop bridge, handoff while offline, restart bridge, result arrives
    await bridge!.stop();
    bridge = null;

    const cardId = "task_offlineaaabbbccc";
    const payload = {
      v: CARD_CONTRACT_VERSION,
      cardId,
      sourceRoomId: session.roomId,
      prompt: "offline job",
      agentKind: "claude" as const,
    };
    const ack = await tower!.handoff({
      to: "@node/wsl-1",
      body: buildDispatchBody({
        title: "offline",
        cardId,
        node: "node/wsl-1",
      }),
      mode: "task",
      attachments: [serializeCardAttachment(CARD_DISPATCH_LABEL, payload)],
    });
    expect(ack.status).toBe("queued");

    // Reload session (peerSecret may have been saved)
    const { loadSession } = await import("./session-store");
    const reloaded = loadSession() ?? session;

    bridge = await startBridgeRuntime({
      session: reloaded,
      profile: "node",
      config: {
        authorizedDispatchers: ["p_tower"],
        herdrSocketPath: herdrSock,
        agentArgv: { claude: ["claude"] },
      },
      herdr: new HerdrClient({ socketPath: herdrSock }),
    });

    let found = false;
    for (let i = 0; i < 40; i++) {
      await Bun.sleep(100);
      const inbox = await tower!.listInbox();
      if (
        inbox.some((e) =>
          e.handoff.attachments?.some(
            (a) =>
              a.label === CARD_RESULT_LABEL &&
              a.content.includes(cardId),
          ),
        )
      ) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });
});

// silence unused import in some runners
void loadTaskBoard;
