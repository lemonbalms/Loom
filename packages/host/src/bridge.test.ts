/**
 * PLAN 0.22.0 bridge tests — fake herdr + in-process relay.
 * Covers M-1/M-2, at-most-once paths, fail-fast, peerSecret rejoin durability hooks.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
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
import {
  type BridgeConfig,
  bridgeConfigDir,
  bridgeConfigPath,
  defaultBridgeConfig,
  isAuthorizedDispatcher,
  loadBridgeConfig,
  resolveAgentArgv,
} from "./bridge-config";
import { startBridgeRuntime } from "./bridge-runtime";
import { applyCardResult } from "./card-ops";
import { startFakeHerdr } from "./fake-herdr";
import { HerdrClient } from "./herdr-client";
import { RelayClient } from "./relay-client";
import {
  type FableSession,
  loadSession,
  resetStateHomeDirCache,
  setActiveProfile,
} from "./session-store";
import { addTask, loadTaskBoard, updateTask } from "./task-board";

/** Protocol-17 Enter nudge keys (bridge-local; not exported from client). */
const CR_NUDGE = "\r";

function isCrSendKeys(c: { method: string; params: Record<string, unknown> }): boolean {
  return (
    c.method === "agent.send_keys" &&
    Array.isArray(c.params.keys) &&
    (c.params.keys as string[]).includes(CR_NUDGE)
  );
}

function envAllocCalls(
  calls: { method: string; params: Record<string, unknown> }[],
  key: string,
  value: string,
) {
  return calls.filter(
    (c) =>
      (c.method === "tab.create" || c.method === "pane.split") &&
      (c.params.env as Record<string, string> | undefined)?.[key] === value,
  );
}

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
    expect(resolveAgentArgv(defaultBridgeConfig(), "claude")).toEqual(["claude"]);
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
  const dir = join(
    tmpdir(),
    `loom-bridge-config-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
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
    writeFileSync(bridgeConfigPath(p), JSON.stringify({ agentArgv: { codex: [] } }), "utf8");
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
    writeFileSync(bridgeConfigPath(p), JSON.stringify({ agentArgv: { codex: ["codex"] } }), "utf8");
    expect(resolveAgentArgv(loadBridgeConfig(p), "codex")).toEqual(["codex"]);
  });
});

describe("protocol-17 inject surface", () => {
  test("agent.prompt primary inject; agentSend/BARE_ENTER surface gone", () => {
    const proto = HerdrClient.prototype as unknown as Record<string, unknown>;
    expect(typeof proto.agentPrompt).toBe("function");
    expect(typeof proto.agentSendKeys).toBe("function");
    expect(typeof proto.agentSend).toBe("undefined");
    expect(typeof proto.injectPromptAndSubmit).toBe("function");
  });
});

describe("apply_card_result authority fence (PATCH 1 M1)", () => {
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

  test("② expected-red: fresh remote done → blocked; node mismatch remains first", () => {
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
    if (good.ok) {
      expect(good.status).toBe("blocked");
      expect(good.task.notes).toContain("legacy_remote_done_requires_verification");
    }
  });

  test("⑤ green control: guard order authenticity → terminal → stale is preserved", () => {
    const finishedAt = new Date().toISOString();
    const terminal = addTask({
      title: "terminal-local-done",
      assignee: "node/wsl-1",
      status: "done",
    });
    const forged = applyCardResult({
      resultJson: JSON.stringify({
        v: 1,
        cardId: terminal.id,
        status: "done",
        node: "node/evil",
        seq: 9,
        output: "forged",
        summary: "forged",
        finishedAt,
      }),
    });
    expect(forged.ok).toBe(false);
    if (!forged.ok) expect(forged.error).toContain("L-2");

    const terminalReplay = applyCardResult({
      resultJson: JSON.stringify({
        v: 1,
        cardId: terminal.id,
        status: "failed",
        node: "node/wsl-1",
        seq: 9,
        output: "late",
        summary: "late",
        finishedAt,
      }),
    });
    expect(terminalReplay.ok).toBe(true);
    if (terminalReplay.ok) expect(terminalReplay.status).toBe("done");

    const stale = addTask({
      title: "stale-before-authority-mapping",
      assignee: "node/wsl-1",
      status: "doing",
      notes: "seed last_seq=5",
    });
    const staleReplay = applyCardResult({
      resultJson: JSON.stringify({
        v: 1,
        cardId: stale.id,
        status: "done",
        node: "node/wsl-1",
        seq: 5,
        output: "stale",
        summary: "stale",
        finishedAt,
      }),
    });
    expect(staleReplay.ok).toBe(true);
    if (staleReplay.ok) {
      expect(staleReplay.status).toBe("doing");
      expect(staleReplay.task.notes).toBe("seed last_seq=5");
    }

    const localTask = addTask({ title: "explicit-local-mutation", status: "doing" });
    expect(updateTask(localTask.id, { status: "done" }).status).toBe("done");
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

  test("ping + tab.create + agent.start + agent.prompt inject", async () => {
    const c = new HerdrClient({ socketPath: sock });
    const pong = await c.ping();
    expect(pong.protocol).toBe(17);
    const tab = await c.tabCreate({
      label: "t",
      env: { LOOM_CARD: "task_abc" },
    });
    const agent = await c.agentStart({
      name: "t",
      kind: "claude",
      paneId: tab.rootPaneId,
    });
    expect(agent.pane_id).toBeTruthy();
    await c.injectPromptAndSubmit(agent.pane_id, "hello-prompt");
    // Wait for auto done event path
    await Bun.sleep(80);
    const text = await c.paneRead(agent.pane_id);
    expect(text).toContain("hello-prompt");
    // Protocol 17: one atomic agent.prompt (no dual-send bare Enter)
    const prompts = fake.calls.filter((x) => x.method === "agent.prompt");
    expect(prompts.length).toBeGreaterThanOrEqual(1);
    expect(prompts.some((p) => p.params.text === "hello-prompt")).toBe(true);
    // No pane.run with prompt
    expect(fake.calls.every((x) => x.method !== "pane.run")).toBe(true);
    c.close();
  });

  test("sequential RPCs survive per-response FIN (ping → agentPrompt → agentPrompt)", async () => {
    // Real herdr closes (FIN) each connection right after its response; the
    // client must open a fresh connection per call rather than reuse one.
    const c = new HerdrClient({ socketPath: sock });
    const pong = await c.ping();
    expect(pong.protocol).toBe(17);
    const tab = await c.tabCreate({ label: "seq" });
    const agent = await c.agentStart({
      name: "seq",
      kind: "claude",
      paneId: tab.rootPaneId,
    });
    await c.agentPrompt({ target: agent.pane_id, text: "one" });
    await c.agentPrompt({ target: agent.pane_id, text: "two" });
    const prompts = fake.calls.filter(
      (x) => x.method === "agent.prompt" && x.params.target === agent.pane_id,
    );
    expect(prompts.length).toBe(2);
    expect(prompts[0]!.params.text).toBe("one");
    expect(prompts[1]!.params.text).toBe("two");
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
  /** Main node session captured before auxiliary bridges overwrite LOOM_SESSION. */
  let mainRejoinSession: FableSession | null = null;
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
      herdrProtocol: 17,
    };

    bridge = await startBridgeRuntime({
      session,
      profile: "node",
      config: cfg,
      herdr: new HerdrClient({
        socketPath: herdrSock,
      }),
      submitVerify: { waitMs: 300, retries: 1 },
    });

    // Capture main peer while LOOM_SESSION still holds p_node (before race/spawn aux bridges).
    mainRejoinSession = loadSession() ?? session;

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

  async function exactCardResults(cardId: string): Promise<
    {
      cardId?: string;
      status?: string;
      reason?: string;
    }[]
  > {
    const inbox = await tower!.listInbox();
    return inbox.flatMap((entry) =>
      (entry.handoff.attachments ?? [])
        .filter((attachment) => attachment.label === CARD_RESULT_LABEL)
        .map(
          (attachment) =>
            JSON.parse(attachment.content) as {
              cardId?: string;
              status?: string;
              reason?: string;
            },
        )
        .filter((result) => result.cardId === cardId),
    );
  }

  test("① expected-red: authorized completion emits a verification proposal", async () => {
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
        e.handoff.attachments?.some((a) => a.label === CARD_RESULT_LABEL),
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
          reason?: string;
        };
        expect(result.cardId).toBe(cardId);
        expect(result.status).toBe("failed");
        expect(result.reason).toBe("needs_verification");
        expect(result.node).toBe("node/wsl-1");
        break;
      }
    }
    expect(found).toBe(true);

    // Protocol 17: primary inject is atomic agent.prompt (no dual bare Enter)
    const prompts = fake.calls.filter((c) => c.method === "agent.prompt");
    const promptSend = prompts.find(
      (s) => typeof s.params.text === "string" && String(s.params.text).includes("write hello"),
    );
    expect(promptSend).toBeTruthy();

    // Live gate (herdr 0.7.5 / protocol-17): submission ops must target the
    // unique agent.start name — pane_id is unsafe for Claude agent.prompt.
    const startCall = fake.calls.find(
      (c) =>
        c.method === "agent.start" && String(c.params.name ?? "").includes(cardId.slice(0, 20)),
    );
    expect(startCall).toBeTruthy();
    const startName = String(startCall!.params.name);
    // Generated form: loom-${cardId}-${seq} (seq=1 on first attempt)
    expect(startName).toBe(`loom-${cardId}-1`);
    expect(promptSend!.params.target).toBe(startName);
    expect(promptSend!.params.target).not.toBe(startCall!.params.pane_id);
  });

  test("④ green control: completion↔terminal emits exactly one relay receipt", async () => {
    const cardId = "task_abcd1234abcde001";
    const raceSock = join(dir, "h-ctr.sock");
    const raceFake = await startFakeHerdr({
      socketPath: raceSock,
      autoStatus: "none",
    });
    const raceSession: FableSession = {
      ...session,
      peerId: "p_node_completion_terminal_race",
      displayName: "node/completion-terminal-race",
      peerSecret: undefined,
    };
    let raceBridge: Awaited<ReturnType<typeof startBridgeRuntime>> | null = null;
    try {
      raceBridge = await startBridgeRuntime({
        session: raceSession,
        profile: "node-completion-terminal-race",
        config: {
          authorizedDispatchers: ["p_tower"],
          herdrSocketPath: raceSock,
          agentArgv: { claude: ["claude"] },
          herdrProtocol: 17,
        },
        herdr: new HerdrClient({ socketPath: raceSock }),
        submitVerify: { waitMs: 100, retries: 0 },
      });
      await tower!.handoff({
        to: "@node/completion-terminal-race",
        body: buildDispatchBody({
          title: "at-most-one",
          cardId,
          node: "node/completion-terminal-race",
        }),
        mode: "task",
        attachments: [
          serializeCardAttachment(CARD_DISPATCH_LABEL, {
            v: CARD_CONTRACT_VERSION,
            cardId,
            sourceRoomId: session.roomId,
            prompt: "completion terminal race",
            agentKind: "claude",
          }),
        ],
      });
      let paneId = "";
      for (let i = 0; i < 40; i++) {
        await Bun.sleep(100);
        paneId = raceFake.listPaneIds()[0] ?? "";
        if (paneId) break;
      }
      expect(paneId).not.toBe("");
      raceFake.setPaneReadText(paneId, "completion terminal race");
      raceFake.pushEvent("pane_agent_status_changed", {
        pane_id: paneId,
        agent_status: "working",
      });
      raceFake.pushEvent("pane_agent_status_changed", {
        pane_id: paneId,
        agent_status: "idle",
      });
      raceFake.pushEvent("pane.closed", { pane_id: paneId });
      let results: Awaited<ReturnType<typeof exactCardResults>> = [];
      for (let i = 0; i < 40; i++) {
        await Bun.sleep(100);
        results = await exactCardResults(cardId);
        if (results.length > 0) break;
      }
      await Bun.sleep(250);
      results = await exactCardResults(cardId);
      expect(results).toHaveLength(1);
      expect(results[0]!.cardId).toBe(cardId);
      expect(results[0]!.reason).not.toBe("payload_invalid");
    } finally {
      if (raceBridge) await raceBridge.stop();
      await raceFake.close();
    }
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
      // Protocol 17: LOOM_CARD lives on tab.create/pane.split; name still
      // embeds the card id (unique per attempt).
      starts = fake.calls.filter(
        (c) =>
          c.method === "agent.start" && String(c.params.name ?? "").includes(cardId.slice(0, 20)),
      );
      if (starts.length >= 2) break;
    }
    expect(starts.length).toBeGreaterThanOrEqual(2);
    const names = starts.map((s) => s.params.name);
    expect(new Set(names).size).toBe(names.length);
    expect(envAllocCalls(fake.calls, "LOOM_CARD", cardId).length).toBeGreaterThanOrEqual(2);
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
    // No allocation/start for evil card (LOOM_CARD on pane alloc only)
    expect(envAllocCalls(fake.calls, "LOOM_CARD", cardId).length).toBe(0);
    const starts = fake.calls.filter(
      (c) =>
        c.method === "agent.start" && String(c.params.name ?? "").includes(cardId.slice(0, 20)),
    );
    expect(starts.length).toBe(0);
    evil.close();
  });

  test("④ green control: Flight-less agent_kind_not_allowed emits exactly one relay receipt", async () => {
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
          (a) => a.label === CARD_RESULT_LABEL && a.content.includes(cardId),
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

    expect(envAllocCalls(fake.calls, "LOOM_CARD", cardId).length).toBe(0);
    const starts = fake.calls.filter(
      (c) =>
        c.method === "agent.start" && String(c.params.name ?? "").includes(cardId.slice(0, 20)),
    );
    expect(starts.length).toBe(0);

    await Bun.sleep(250);
    const results = await exactCardResults(cardId);
    expect(results).toHaveLength(1);
    expect(results[0]!.cardId).toBe(cardId);
    expect(results[0]!.reason).toBe("agent_kind_not_allowed");
  });

  test("unrepresentable card agent target fails before herdr traffic", async () => {
    // Lowercase + 28 hex after task_; full exact name exceeds 32 characters (herdr limit).
    const cardId = "task_a023600000000009000000000000";
    const callsBefore = fake.calls.length;
    const payload = {
      v: CARD_CONTRACT_VERSION,
      cardId,
      sourceRoomId: session.roomId,
      prompt: "unrepresentable name",
      agentKind: "claude" as const,
    };
    await tower!.handoff({
      to: "@node/wsl-1",
      body: buildDispatchBody({
        title: "unrepresentable agent name",
        cardId,
        node: "node/wsl-1",
      }),
      mode: "task",
      attachments: [serializeCardAttachment(CARD_DISPATCH_LABEL, payload)],
    });

    let results: Awaited<ReturnType<typeof exactCardResults>> = [];
    for (let i = 0; i < 40; i++) {
      await Bun.sleep(100);
      results = await exactCardResults(cardId);
      if (results.length > 0) break;
    }
    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("failed");
    expect(results[0]!.reason).toBe("agent_name_unrepresentable");

    const herdrTraffic = new Set([
      "pane.list",
      "tab.create",
      "pane.split",
      "agent.start",
      "agent.prompt",
      "pane.send_keys",
    ]);
    const after = fake.calls.slice(callsBefore);
    expect(after.filter((c) => herdrTraffic.has(c.method))).toHaveLength(0);
  });

  test("④ green control: spawn failure emits exactly one relay receipt", async () => {
    const spawnSock = join(dir, "herdr-spawn-failure.sock");
    const spawnFake = await startFakeHerdr({
      socketPath: spawnSock,
      autoStatus: "none",
    });
    const spawnHerdr = new HerdrClient({ socketPath: spawnSock });
    let agentStartReached = false;
    spawnHerdr.agentStart = async () => {
      agentStartReached = true;
      throw new Error("test spawn failure");
    };
    const spawnSession: FableSession = {
      ...session,
      peerId: "p_node_spawn_failure",
      displayName: "node/spawn-failure",
      peerSecret: undefined,
    };
    let spawnBridge: Awaited<ReturnType<typeof startBridgeRuntime>> | null = null;
    const cardId = "task_abcd1234abcde0f1";
    try {
      spawnBridge = await startBridgeRuntime({
        session: spawnSession,
        profile: "node-spawn-failure",
        config: {
          authorizedDispatchers: ["p_tower"],
          herdrSocketPath: spawnSock,
          agentArgv: { claude: ["claude"] },
          herdrProtocol: 17,
        },
        herdr: spawnHerdr,
        submitVerify: { waitMs: 100, retries: 0 },
      });
      await tower!.handoff({
        to: "@node/spawn-failure",
        body: buildDispatchBody({
          title: "spawn failure",
          cardId,
          node: "node/spawn-failure",
        }),
        mode: "task",
        attachments: [
          serializeCardAttachment(CARD_DISPATCH_LABEL, {
            v: CARD_CONTRACT_VERSION,
            cardId,
            sourceRoomId: session.roomId,
            prompt: "spawn should fail",
            agentKind: "claude",
          }),
        ],
      });
      let results: { cardId?: string; status?: string; reason?: string }[] = [];
      for (let i = 0; i < 40; i++) {
        await Bun.sleep(100);
        results = await exactCardResults(cardId);
        if (results.length > 0) break;
      }
      expect(agentStartReached).toBe(true);
      expect(results).toHaveLength(1);
      expect(results[0]!.cardId).toBe(cardId);
      expect(results[0]!.reason).toBe("herdr_spawn_failed");
      await Bun.sleep(250);
      const settled = await exactCardResults(cardId);
      expect(settled).toHaveLength(1);
    } finally {
      if (spawnBridge) await spawnBridge.stop();
      await spawnFake.close();
    }
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

    // Rejoin as the main node peer captured before aux bridges overwrote LOOM_SESSION.
    expect(mainRejoinSession).not.toBeNull();
    if (!mainRejoinSession) throw new Error("mainRejoinSession missing after beforeAll");

    bridge = await startBridgeRuntime({
      session: mainRejoinSession,
      profile: "node",
      config: {
        authorizedDispatchers: ["p_tower"],
        herdrSocketPath: herdrSock,
        agentArgv: { claude: ["claude"] },
      },
      herdr: new HerdrClient({ socketPath: herdrSock }),
      submitVerify: { waitMs: 300, retries: 1 },
    });

    let found = false;
    for (let i = 0; i < 40; i++) {
      await Bun.sleep(100);
      const inbox = await tower!.listInbox();
      if (
        inbox.some((e) =>
          e.handoff.attachments?.some(
            (a) => a.label === CARD_RESULT_LABEL && a.content.includes(cardId),
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
    // verify loop to time out and nudge via agent.send_keys CR.
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
      herdr: new HerdrClient({ socketPath: herdrSock2 }),
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

  test("unconfirmed submit (no working event) CR-nudges via send_keys up to retries", async () => {
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

    // Poll until verify issues at least two bounded CR nudges (probe hit on
    // accumulated prompt text → CR-only branch; no full reinject).
    let nudges: typeof fake2.calls = [];
    for (let i = 0; i < 40; i++) {
      await Bun.sleep(100);
      nudges = fake2.calls.filter(isCrSendKeys);
      if (nudges.length >= 2) break;
    }
    expect(nudges.length).toBeGreaterThanOrEqual(2);
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
        herdrProtocol: 17,
      },
      herdr: new HerdrClient({ socketPath: herdrSock3 }),
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

  test('registered codex agentKind spawns with kind "codex"', async () => {
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
      // Protocol 17: LOOM_CARD on pane alloc; agent.start carries kind/name/pane_id
      starts = fake3.calls.filter(
        (c) =>
          c.method === "agent.start" && String(c.params.name ?? "").includes(cardId.slice(0, 20)),
      );
      if (starts.length >= 1) break;
    }
    expect(starts.length).toBeGreaterThanOrEqual(1);
    expect(starts[0]!.params.kind).toBe("codex");
    // Executable stays local; bare ["codex"] → empty args (omitted on wire)
    expect(starts[0]!.params.args).toBeUndefined();
    expect(envAllocCalls(fake3.calls, "LOOM_CARD", cardId).length).toBeGreaterThanOrEqual(1);
  });
});

// silence unused import in some runners
void loadTaskBoard;
