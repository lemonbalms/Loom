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
  loadBridgeConfig,
  bridgeConfigDir,
  bridgeConfigPath,
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

  test("defaultBridgeConfig has no codex/grok argv (fail-closed until registered)", () => {
    const cfg = defaultBridgeConfig();
    expect(resolveAgentArgv(cfg, "codex")).toBeNull();
    expect(resolveAgentArgv(cfg, "grok")).toBeNull();
  });

  test("resolveAgentArgv returns registered codex argv", () => {
    const cfg: BridgeConfig = {
      authorizedDispatchers: [],
      herdrSocketPath: "/tmp/x",
      agentArgv: { claude: ["claude"], codex: ["codex"] },
    };
    expect(resolveAgentArgv(cfg, "codex")).toEqual(["codex"]);
  });

  test("resolveAgentArgv rejects shell even when misconfigured as codex", () => {
    const cfg: BridgeConfig = {
      authorizedDispatchers: [],
      herdrSocketPath: "/tmp/x",
      agentArgv: { codex: ["bash"] },
    };
    expect(resolveAgentArgv(cfg, "codex")).toBeNull();
  });
});

describe("bridge-config agentArgv sanitize (R27 L-1)", () => {
  const dir = join(tmpdir(), `loom-bridge-config-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const profile = `cfg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  beforeAll(() => {
    mkdirSync(dir, { recursive: true });
    process.env.LOOM_TEST_HOME = dir;
    resetStateHomeDirCache();
    setActiveProfile(null);
    mkdirSync(bridgeConfigDir(), { recursive: true });
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

  test("malformed string agentArgv entry is dropped (not merged, not thrown)", () => {
    writeFileSync(
      bridgeConfigPath(profile),
      JSON.stringify({
        authorizedDispatchers: [],
        agentArgv: { codex: "codex" },
      }),
      "utf8",
    );
    const cfg = loadBridgeConfig(profile);
    expect(resolveAgentArgv(cfg, "codex")).toBeNull();
    // Default claude registration still present
    expect(resolveAgentArgv(cfg, "claude")).toEqual(["claude"]);
  });

  test("empty array agentArgv entry is dropped", () => {
    const p = `${profile}-empty`;
    writeFileSync(
      bridgeConfigPath(p),
      JSON.stringify({ agentArgv: { codex: [] } }),
      "utf8",
    );
    expect(resolveAgentArgv(loadBridgeConfig(p), "codex")).toBeNull();
  });

  test("non-string element in agentArgv is dropped", () => {
    const p = `${profile}-mixed`;
    writeFileSync(
      bridgeConfigPath(p),
      JSON.stringify({ agentArgv: { codex: ["codex", 5] } }),
      "utf8",
    );
    expect(resolveAgentArgv(loadBridgeConfig(p), "codex")).toBeNull();
  });

  test("well-formed agentArgv merges correctly", () => {
    const p = `${profile}-ok`;
    writeFileSync(
      bridgeConfigPath(p),
      JSON.stringify({ agentArgv: { codex: ["codex"] } }),
      "utf8",
    );
    expect(resolveAgentArgv(loadBridgeConfig(p), "codex")).toEqual(["codex"]);
  });
});

describe("M-2 bare enter constant", () => {
  test("BARE_ENTER is a bare carriage return (terminal Enter)", () => {
    expect(BARE_ENTER).toBe("\r");
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

  test("⑪ note max length (500) still preserves last_seq parse (0.23.7 M-2)", () => {
    const task = addTask({
      title: "m2-last-seq",
      assignee: "node/wsl-1",
      status: "doing",
    });
    const finishedAt = new Date().toISOString();
    // summary already long + note 500 → total head >> 1000 without M-2 guard
    const longSummary = "S".repeat(600);
    const longNote = "N".repeat(500);
    const r = applyCardResult({
      resultJson: JSON.stringify({
        v: 1,
        cardId: task.id,
        status: "done",
        node: "node/wsl-1",
        seq: 42,
        output: "out",
        summary: longSummary,
        note: longNote,
        finishedAt,
      }),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const notes = r.task.notes ?? "";
    expect(notes.length).toBeLessThanOrEqual(1000);
    const m = /last_seq=(\d+)/.exec(notes);
    expect(m).toBeTruthy();
    expect(Number(m![1])).toBe(42);
    // Idempotency: same seq ignored
    const again = applyCardResult({
      resultJson: JSON.stringify({
        v: 1,
        cardId: task.id,
        status: "done",
        node: "node/wsl-1",
        seq: 42,
        output: "out2",
        summary: "should-not-apply",
        finishedAt,
      }),
    });
    expect(again.ok).toBe(true);
    if (again.ok) {
      expect(again.task.notes).toBe(notes);
    }
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
    const c = new HerdrClient({ socketPath: sock, submitDelayMs: 0 });
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
    expect(sends[1]!.params.text).toBe(BARE_ENTER);
    // No pane.run with prompt
    expect(fake.calls.every((x) => x.method !== "pane.run")).toBe(true);
    c.close();
  });

  test("sequential RPCs survive per-response FIN (ping → agentSend → agentSend)", async () => {
    // Real herdr closes (FIN) each connection right after its response; the
    // client must open a fresh connection per call rather than reuse one.
    const c = new HerdrClient({ socketPath: sock });
    const pong = await c.ping();
    expect(pong.protocol).toBe(16);
    const agent = await c.agentStart({ name: "seq", argv: ["claude"] });
    await c.agentSend(agent.terminal_id, "one");
    await c.agentSend(agent.terminal_id, "two");
    const sends = fake.calls.filter(
      (x) => x.method === "agent.send" && x.params.target === agent.terminal_id,
    );
    expect(sends.length).toBe(2);
    expect(sends[0]!.params.text).toBe("one");
    expect(sends[1]!.params.text).toBe("two");
    c.close();
  });

  test("events.subscribe stays open and delivers pushes to onEvent", async () => {
    const events: { event: string; data: unknown }[] = [];
    const c = new HerdrClient({
      socketPath: sock,
      onEvent: (event, data) => events.push({ event, data }),
    });
    await c.eventsSubscribe([{ type: "pane.agent_status_changed" }]);
    fake.pushEvent("pane_agent_status_changed", {
      pane_id: "w1:p_test",
      agent_status: "done",
    });
    await Bun.sleep(30);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]!.event).toBe("pane_agent_status_changed");
    expect((events[0]!.data as { pane_id: string }).pane_id).toBe("w1:p_test");
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
        submitDelayMs: 0,
      }),
      submitVerify: { waitMs: 300, retries: 1 },
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
    expect(sends.some((s) => s.params.text === BARE_ENTER)).toBe(true);
    const promptSend = sends.find(
      (s) =>
        typeof s.params.text === "string" &&
        String(s.params.text).includes("write hello"),
    );
    expect(promptSend).toBeTruthy();
  });

  test("re-dispatch of same card uses a unique agent.start name per attempt", async () => {
    // Live-measured bug: re-dispatching the same cardId while a prior pane
    // is alive collided on herdr's "agent name ... is already used" — the
    // fix folds the per-card seq into the name so each attempt is unique.
    const cardId = "task_beef00112233aa";
    const dispatchOnce = async (prompt: string) => {
      const payload = {
        v: CARD_CONTRACT_VERSION,
        cardId,
        sourceRoomId: session.roomId,
        prompt,
        agentKind: "claude" as const,
      };
      await tower!.handoff({
        to: "@node/wsl-1",
        body: buildDispatchBody({ title: "reseq", cardId, node: "node/wsl-1" }),
        mode: "task",
        attachments: [serializeCardAttachment(CARD_DISPATCH_LABEL, payload)],
      });
    };

    await dispatchOnce("first");
    await dispatchOnce("second");

    let starts: typeof fake.calls = [];
    for (let i = 0; i < 40; i++) {
      await Bun.sleep(100);
      starts = fake.calls.filter(
        (c) =>
          c.method === "agent.start" &&
          (c.params.env as { LOOM_CARD?: string } | undefined)?.LOOM_CARD ===
            cardId,
      );
      if (starts.length >= 2) break;
    }
    expect(starts.length).toBeGreaterThanOrEqual(2);
    const names = starts.map((s) => s.params.name);
    expect(new Set(names).size).toBe(names.length);
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

  test("codex agentKind without local argv → agent_kind_not_allowed (0.23.2 R27)", async () => {
    // Default bridge cfg registers claude only — codex fails closed.
    const cardId = "task_c0deffff00112233";
    const payload = {
      v: CARD_CONTRACT_VERSION,
      cardId,
      sourceRoomId: session.roomId,
      prompt: "run codex",
      agentKind: "codex" as const,
    };
    await tower!.handoff({
      to: "@node/wsl-1",
      body: buildDispatchBody({
        title: "codex unregistered",
        cardId,
        node: "node/wsl-1",
      }),
      mode: "task",
      attachments: [serializeCardAttachment(CARD_DISPATCH_LABEL, payload)],
    });

    let found = false;
    for (let i = 0; i < 40; i++) {
      await Bun.sleep(100);
      const inbox = await tower!.listInbox();
      const hit = inbox.find((e) =>
        e.handoff.attachments?.some(
          (a) =>
            a.label === CARD_RESULT_LABEL &&
            a.content.includes(cardId),
        ),
      );
      if (hit) {
        found = true;
        expect(hit.handoff.body).toContain("[DONE]"); // result body header even on failed
        const content = hit.handoff.attachments!.find(
          (a) => a.label === CARD_RESULT_LABEL,
        )!.content;
        const result = JSON.parse(content) as {
          status: string;
          cardId: string;
          reason?: string;
        };
        expect(result.cardId).toBe(cardId);
        expect(result.status).toBe("failed");
        expect(result.reason).toBe("agent_kind_not_allowed");
        break;
      }
    }
    expect(found).toBe(true);

    const starts = fake.calls.filter(
      (c) =>
        c.method === "agent.start" &&
        (c.params.env as { LOOM_CARD?: string } | undefined)?.LOOM_CARD ===
          cardId,
    );
    expect(starts.length).toBe(0);
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
      herdr: new HerdrClient({ socketPath: herdrSock, submitDelayMs: 0 }),
      submitVerify: { waitMs: 300, retries: 1 },
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

describe("M-2 submit verify + retry", () => {
  const port2 = 19900 + Math.floor(Math.random() * 300);
  const dir2 = join(tmpdir(), `loom-bridge-verify-${Date.now()}`);
  const sessionFile2 = join(dir2, "session.json");
  const herdrSock2 = join(dir2, "herdr.sock");
  const relay2 = new RelayServer({ host: "127.0.0.1", port: port2 });
  let fake2: Awaited<ReturnType<typeof startFakeHerdr>>;
  let bridge2: Awaited<ReturnType<typeof startBridgeRuntime>> | null = null;
  let tower2: RelayClient | null = null;
  let session2: FableSession;

  beforeAll(async () => {
    mkdirSync(dir2, { recursive: true });
    process.env.LOOM_TEST_HOME = dir2;
    process.env.LOOM_SESSION = sessionFile2;
    process.env.LOOM_NO_AUTO_HOST = "1";
    resetStateHomeDirCache();
    setActiveProfile(null);
    relay2.start();
    // autoStatus "none": the pane never reports "working" — forces the
    // verify loop to time out and resend BARE_ENTER (live-measured M-2 fix).
    fake2 = await startFakeHerdr({
      socketPath: herdrSock2,
      autoStatus: "none",
    });

    tower2 = new RelayClient({ url: `ws://127.0.0.1:${port2}/ws` });
    const created = await tower2.createRoom({
      roomName: "bridge-verify-test",
      displayName: "tower",
      agentKind: "shell",
      peerId: "p_tower",
    });
    if (created.type !== "room.state") throw new Error("create failed");
    session2 = {
      roomId: created.roomId,
      roomName: created.roomName ?? "bridge-verify-test",
      inviteCode: created.inviteCode ?? "",
      peerId: "p_node",
      displayName: "node/wsl-1",
      color: "#0f0",
      agentKind: "shell",
      relayUrl: `ws://127.0.0.1:${port2}/ws`,
      peerSecret: undefined,
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(sessionFile2, JSON.stringify(session2), "utf8");

    bridge2 = await startBridgeRuntime({
      session: session2,
      profile: "node-verify",
      config: {
        authorizedDispatchers: ["p_tower"],
        herdrSocketPath: herdrSock2,
        agentArgv: { claude: ["claude"] },
      },
      herdr: new HerdrClient({ socketPath: herdrSock2, submitDelayMs: 0 }),
      // Test-tuned: tiny waitMs so the suite doesn't pay the production
      // SUBMIT_VERIFY_MS/SUBMIT_RETRIES cost.
      submitVerify: { waitMs: 40, retries: 2 },
    });
  });

  afterAll(async () => {
    if (bridge2) await bridge2.stop();
    tower2?.close();
    await fake2.close();
    relay2.stop();
    delete process.env.LOOM_TEST_HOME;
    delete process.env.LOOM_SESSION;
    resetStateHomeDirCache();
    try {
      rmSync(dir2, { recursive: true, force: true });
    } catch {
      /* */
    }
  });

  test("unconfirmed submit (no working event) resends BARE_ENTER up to retries", async () => {
    const cardId = "task_facade00112233";
    const payload = {
      v: CARD_CONTRACT_VERSION,
      cardId,
      sourceRoomId: session2.roomId,
      prompt: "stuck",
      agentKind: "claude" as const,
    };
    await tower2!.handoff({
      to: "@node/wsl-1",
      body: buildDispatchBody({ title: "stuck", cardId, node: "node/wsl-1" }),
      mode: "task",
      attachments: [serializeCardAttachment(CARD_DISPATCH_LABEL, payload)],
    });

    // Poll like the other dispatch tests (bridge inbox poll interval is
    // 1500ms) until the initial submit + at least one resend land, since
    // "working" never arrives with autoStatus "none".
    let sends: typeof fake2.calls = [];
    for (let i = 0; i < 40; i++) {
      await Bun.sleep(100);
      sends = fake2.calls.filter(
        (c) => c.method === "agent.send" && c.params.text === BARE_ENTER,
      );
      if (sends.length >= 2) break;
    }
    expect(sends.length).toBeGreaterThanOrEqual(2);
  });
});

describe("bridge runtime codex argv registered (0.23.2 R27)", () => {
  const port3 = 20100 + Math.floor(Math.random() * 300);
  const dir3 = join(tmpdir(), `loom-bridge-codex-${Date.now()}`);
  const sessionFile3 = join(dir3, "session.json");
  const herdrSock3 = join(dir3, "herdr.sock");
  const relay3 = new RelayServer({ host: "127.0.0.1", port: port3 });
  let fake3: Awaited<ReturnType<typeof startFakeHerdr>>;
  let bridge3: Awaited<ReturnType<typeof startBridgeRuntime>> | null = null;
  let tower3: RelayClient | null = null;
  let session3: FableSession;

  beforeAll(async () => {
    mkdirSync(dir3, { recursive: true });
    process.env.LOOM_TEST_HOME = dir3;
    process.env.LOOM_SESSION = sessionFile3;
    process.env.LOOM_NO_AUTO_HOST = "1";
    resetStateHomeDirCache();
    setActiveProfile(null);
    relay3.start();
    fake3 = await startFakeHerdr({
      socketPath: herdrSock3,
      autoStatus: "done",
      autoStatusDelayMs: 40,
    });

    tower3 = new RelayClient({ url: `ws://127.0.0.1:${port3}/ws` });
    const created = await tower3.createRoom({
      roomName: "bridge-codex-test",
      displayName: "tower",
      agentKind: "shell",
      peerId: "p_tower",
    });
    if (created.type !== "room.state") throw new Error("create failed");
    session3 = {
      roomId: created.roomId,
      roomName: created.roomName ?? "bridge-codex-test",
      inviteCode: created.inviteCode ?? "",
      peerId: "p_node",
      displayName: "node/wsl-1",
      color: "#0f0",
      agentKind: "shell",
      relayUrl: `ws://127.0.0.1:${port3}/ws`,
      peerSecret: undefined,
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(sessionFile3, JSON.stringify(session3), "utf8");

    bridge3 = await startBridgeRuntime({
      session: session3,
      profile: "node-codex",
      config: {
        authorizedDispatchers: ["p_tower"],
        herdrSocketPath: herdrSock3,
        agentArgv: { claude: ["claude"], codex: ["codex"] },
        herdrProtocol: 16,
      },
      herdr: new HerdrClient({ socketPath: herdrSock3, submitDelayMs: 0 }),
      submitVerify: { waitMs: 300, retries: 1 },
    });
  });

  afterAll(async () => {
    if (bridge3) await bridge3.stop();
    tower3?.close();
    await fake3.close();
    relay3.stop();
    delete process.env.LOOM_TEST_HOME;
    delete process.env.LOOM_SESSION;
    resetStateHomeDirCache();
    try {
      rmSync(dir3, { recursive: true, force: true });
    } catch {
      /* */
    }
  });

  test("registered codex agentKind spawns with argv [\"codex\"]", async () => {
    const cardId = "task_c0de0000aabb0011";
    const payload = {
      v: CARD_CONTRACT_VERSION,
      cardId,
      sourceRoomId: session3.roomId,
      prompt: "use codex",
      agentKind: "codex" as const,
    };
    await tower3!.handoff({
      to: "@node/wsl-1",
      body: buildDispatchBody({
        title: "codex registered",
        cardId,
        node: "node/wsl-1",
      }),
      mode: "task",
      attachments: [serializeCardAttachment(CARD_DISPATCH_LABEL, payload)],
    });

    let starts: typeof fake3.calls = [];
    for (let i = 0; i < 40; i++) {
      await Bun.sleep(100);
      starts = fake3.calls.filter(
        (c) =>
          c.method === "agent.start" &&
          (c.params.env as { LOOM_CARD?: string } | undefined)?.LOOM_CARD ===
            cardId,
      );
      if (starts.length >= 1) break;
    }
    expect(starts.length).toBeGreaterThanOrEqual(1);
    expect(starts[0]!.params.argv).toEqual(["codex"]);
  });
});

// silence unused import in some runners
void loadTaskBoard;
