/**
 * PLAN 0.23.9 (R34) — tests ①–⑯
 * ⑧ pane placement pool · ② done_proposal convention/detection/tower notes ·
 * ③ unauthorized conv.open no-claim.
 */
import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { RelayServer } from "@loom/relay";
import {
  CARD_CONTRACT_VERSION,
  CARD_DISPATCH_LABEL,
  CARD_RESULT_LABEL,
  buildDispatchBody,
  serializeCardAttachment,
  CONV_CONTRACT_VERSION,
  CONV_OPEN_LABEL,
  CONV_TURN_LABEL,
  CONV_CLOSE_LABEL,
  CONV_OPEN_SEQ,
  ConvOpenPayloadSchema,
  ConvTurnPayloadSchema,
  ConvClosePayloadSchema,
  serializeConvAttachment,
  buildConvOpenBody,
  buildConvTurnBody,
  buildConvCloseBody,
  generateConvId,
} from "@loom/protocol";
import { RelayClient } from "./relay-client";
import { startFakeHerdr, type FakeHerdr } from "./fake-herdr";
import {
  startBridgeRuntime,
  hasDoneProposalMarker,
  type BridgeRuntime,
} from "./bridge-runtime";
import type { BridgeConfig } from "./bridge-config";
import {
  loadBridgeConfig,
  saveBridgeConfig,
  bridgeConfigPath,
} from "./bridge-config";
import { HerdrClient } from "./herdr-client";
import {
  resetStateHomeDirCache,
  setActiveProfile,
  type FableSession,
} from "./session-store";
import {
  convOpen,
  convAwait,
  convClose,
  applyIncomingConvIntent,
} from "./conv-ops";
import { loadConvState, saveConvState } from "./conv-state";
import { loadTaskBoard, addTask } from "./task-board";

async function waitFor(
  pred: () => boolean,
  opts?: { timeoutMs?: number; stepMs?: number },
): Promise<boolean> {
  const timeoutMs = opts?.timeoutMs ?? 10_000;
  const stepMs = opts?.stepMs ?? 50;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (pred()) return true;
    await Bun.sleep(stepMs);
  }
  return pred();
}

// ── unit: done_proposal tail detection (R34 M-1) ──────────────────────────

describe("PLAN 0.23.9 hasDoneProposalMarker (unit)", () => {
  test("tail line-anchored marker → true", () => {
    const text = [
      "tower turn echo: please finish",
      "mid output working…",
      "[DONE_PROPOSAL] goal complete, tests green",
    ].join("\n");
    expect(hasDoneProposalMarker(text)).toBe(true);
  });

  test("mid-body citation (not tail) → false", () => {
    const text = [
      "I will emit [DONE_PROPOSAL] later when done",
      "still working on the plan",
      "more work",
      "still not done",
    ].join("\n");
    expect(hasDoneProposalMarker(text)).toBe(false);
  });

  test("marker buried before last 3 non-empty → false", () => {
    const lines = ["[DONE_PROPOSAL] buried", "a", "b", "c", "d"];
    expect(hasDoneProposalMarker(lines.join("\n"))).toBe(false);
  });

  test("empty / no marker → false", () => {
    expect(hasDoneProposalMarker("")).toBe(false);
    expect(hasDoneProposalMarker("normal turn text")).toBe(false);
  });
});

describe("PLAN 0.23.9 bridge-config panePlacement sanitize", () => {
  test("invalid panePlacement loads as pool; legacy preserved", () => {
    const prev = process.env.LOOM_TEST_HOME;
    const home = join(tmpdir(), `loom-cfg-0239-${Date.now()}`);
    mkdirSync(home, { recursive: true });
    process.env.LOOM_TEST_HOME = home;
    resetStateHomeDirCache();
    try {
      const profile = "cfg-0239";
      saveBridgeConfig(profile, {
        authorizedDispatchers: [],
        herdrSocketPath: "/tmp/x.sock",
        agentArgv: { claude: ["claude"] },
        panePlacement: "legacy",
      });
      expect(loadBridgeConfig(profile).panePlacement).toBe("legacy");

      const cfgPath = bridgeConfigPath(profile);
      const raw = JSON.parse(readFileSync(cfgPath, "utf8")) as Record<
        string,
        unknown
      >;
      raw.panePlacement = "bogus";
      writeFileSync(cfgPath, JSON.stringify(raw));
      expect(loadBridgeConfig(profile).panePlacement).toBe("pool");

      raw.paneWorkspaceId = "  ws-1  ";
      writeFileSync(cfgPath, JSON.stringify(raw));
      expect(loadBridgeConfig(profile).paneWorkspaceId).toBe("ws-1");

      raw.paneWorkspaceId = "   ";
      writeFileSync(cfgPath, JSON.stringify(raw));
      expect(loadBridgeConfig(profile).paneWorkspaceId).toBeUndefined();
    } finally {
      if (prev === undefined) delete process.env.LOOM_TEST_HOME;
      else process.env.LOOM_TEST_HOME = prev;
      resetStateHomeDirCache();
      rmSync(home, { recursive: true, force: true });
    }
  });
});

// ── integration harness (mirrors pane-cleanup + conv.test patterns) ───────

describe("PLAN 0.23.9 pane placement + done_proposal + conv.open deny", () => {
  const port = 23100 + Math.floor(Math.random() * 200);
  const dir = join(tmpdir(), `loom-impl-0239-${Date.now()}`);
  const sessionFile = join(dir, "session.json");
  const towerSessionFile = join(dir, "tower-session.json");
  const herdrSock = join(dir, "herdr.sock");
  const relay = new RelayServer({ host: "127.0.0.1", port });

  let fake: FakeHerdr;
  let bridge: BridgeRuntime | null = null;
  let tower: RelayClient | null = null;
  let session: FableSession;
  let towerSession: FableSession;
  let inviteCode = "";
  let cardSeq = 0;

  const baseCfg = (placement: "pool" | "legacy" = "pool"): BridgeConfig => ({
    authorizedDispatchers: ["p_tower"],
    herdrSocketPath: herdrSock,
    agentArgv: { claude: ["claude"] },
    herdrProtocol: 16,
    paneCleanup: "keep",
    panePlacement: placement,
  });

  function useWorkerSession(): void {
    process.env.LOOM_SESSION = sessionFile;
    resetStateHomeDirCache();
    setActiveProfile(null);
  }

  function useTowerSession(): void {
    process.env.LOOM_SESSION = towerSessionFile;
    resetStateHomeDirCache();
    setActiveProfile(null);
  }

  function nextCardId(): string {
    cardSeq += 1;
    return `task_a0239${cardSeq.toString(16).padStart(11, "0")}`;
  }

  async function restartBridge(placement: "pool" | "legacy" = "pool"): Promise<void> {
    if (bridge) await bridge.stop();
    useWorkerSession();
    // Reload session (bridge may have written peerSecret)
    session = JSON.parse(readFileSync(sessionFile, "utf8")) as FableSession;
    bridge = await startBridgeRuntime({
      session,
      profile: placement === "legacy" ? "impl-0239-legacy" : "impl-0239",
      config: baseCfg(placement),
      herdr: new HerdrClient({ socketPath: herdrSock, submitDelayMs: 0 }),
      settleMs: 15,
      // Match pane-cleanup/conv harness — too-tight verify closes panes and
      // collapses pool occupancy (liveIds always 0 → perpetual split:right).
      submitVerify: { waitMs: 300, retries: 1 },
    });
    await Bun.sleep(100);
  }

  async function awaitCardResult(
    cardId: string,
    timeoutMs = 12_000,
  ): Promise<{ status?: string } | null> {
    if (!tower) return null;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const inbox = await tower.listInbox();
      for (const e of inbox) {
        const att = e.handoff.attachments?.find(
          (a) => a.label === CARD_RESULT_LABEL && a.content.includes(cardId),
        );
        if (att) return JSON.parse(att.content) as { status?: string };
      }
      await Bun.sleep(80);
    }
    return null;
  }

  async function dispatchCard(cardId: string, prompt: string): Promise<void> {
    await tower!.handoff({
      to: "@node/wsl-1",
      body: buildDispatchBody({
        title: prompt.slice(0, 40),
        cardId,
        node: "node/wsl-1",
      }),
      mode: "task",
      attachments: [
        serializeCardAttachment(CARD_DISPATCH_LABEL, {
          v: CARD_CONTRACT_VERSION,
          cardId,
          sourceRoomId: towerSession.roomId,
          prompt,
          agentKind: "claude",
        }),
      ],
    });
  }

  async function spawnCard(cardId: string, prompt: string): Promise<string> {
    const panesBefore = new Set(fake.listPaneIds());
    await dispatchCard(cardId, prompt);
    const ready = await waitFor(
      () => fake.listPaneIds().some((p) => !panesBefore.has(p)),
      { timeoutMs: 10_000 },
    );
    expect(ready).toBe(true);
    const paneId = fake.listPaneIds().find((p) => !panesBefore.has(p))!;
    // autoStatus:"none" does not broadcast working on BARE_ENTER — push it so
    // inject verify sees sawWorking and does not tear down the pane (needed
    // for pool occupancy tests that keep multiple workers live).
    fake.pushEvent("pane_agent_status_changed", {
      pane_id: paneId,
      agent_status: "working",
    });
    await Bun.sleep(80);
    return paneId;
  }

  function agentStarts(): FakeHerdr["calls"] {
    return fake.calls.filter((c) => c.method === "agent.start");
  }

  function tabCreates(): FakeHerdr["calls"] {
    return fake.calls.filter((c) => c.method === "tab.create");
  }

  beforeAll(async () => {
    mkdirSync(dir, { recursive: true });
    process.env.LOOM_NO_AUTO_HOST = "1";
    process.env.LOOM_TEST_HOME = dir;
    process.env.LOOM_SESSION = sessionFile;
    resetStateHomeDirCache();
    setActiveProfile(null);

    relay.start();
    fake = await startFakeHerdr({
      socketPath: herdrSock,
      autoStatus: "none",
      protocol: 16,
    });

    // Bootstrap room as tower, keep tower connection for card dispatches.
    tower = new RelayClient({ url: `ws://127.0.0.1:${port}/ws` });
    const created = await tower.createRoom({
      roomName: "impl-0239",
      displayName: "tower",
      agentKind: "shell",
      peerId: "p_tower",
    });
    if (created.type !== "room.state") throw new Error("create failed");
    inviteCode = created.inviteCode ?? "";
    const towerSecret = created.peerSecret ?? tower.peerSecret;

    towerSession = {
      roomId: created.roomId,
      roomName: "impl-0239",
      inviteCode,
      peerId: "p_tower",
      displayName: "tower",
      color: "#00f",
      agentKind: "shell",
      relayUrl: `ws://127.0.0.1:${port}/ws`,
      peerSecret: towerSecret ?? undefined,
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(towerSessionFile, JSON.stringify(towerSession), "utf8");

    // Worker session file — bridge is first join (conv.test pattern).
    session = {
      roomId: created.roomId,
      roomName: "impl-0239",
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

    useWorkerSession();
    bridge = await startBridgeRuntime({
      session,
      profile: "impl-0239",
      config: baseCfg("pool"),
      herdr: new HerdrClient({ socketPath: herdrSock, submitDelayMs: 0 }),
      settleMs: 15,
      submitVerify: { waitMs: 300, retries: 1 },
    });
    await Bun.sleep(150);
  });

  afterAll(async () => {
    if (bridge) await bridge.stop();
    tower?.close();
    await fake.close();
    relay.stop();
    delete process.env.LOOM_TEST_HOME;
    delete process.env.LOOM_SESSION;
    delete process.env.LOOM_NO_AUTO_HOST;
    resetStateHomeDirCache();
    rmSync(dir, { recursive: true, force: true });
  });

  // ⑧ ①
  test("⑧① first card spawn: tab.create → agent.start tab_id/split:right → root close", async () => {
    const nTabs = tabCreates().length;
    const nStarts = agentStarts().length;
    const paneId = await spawnCard(nextCardId(), "first pool worker");
    await waitFor(() => tabCreates().length > nTabs);
    await waitFor(() => agentStarts().length > nStarts);

    const creates = tabCreates().slice(nTabs);
    expect(creates.length).toBeGreaterThanOrEqual(1);
    expect(creates[0]!.params.label).toBe("loom-workers");
    expect(creates[0]!.params.focus).toBe(false);

    const starts = agentStarts().slice(nStarts);
    const hinted = starts.find((s) => typeof s.params.tab_id === "string");
    expect(hinted).toBeDefined();
    expect(hinted!.params.split).toBe("right");
    expect(hinted!.params.tab_id).toBeTruthy();

    const tabId = String(hinted!.params.tab_id);
    const rootClose = fake.calls.some(
      (c) =>
        c.method === "pane.close" &&
        String(c.params.pane_id ?? "").includes("root"),
    );
    expect(rootClose).toBe(true);
    expect(fake.tabIdForPane(paneId)).toBe(tabId);
  }, 15_000);

  // ⑧ ②
  test("⑧② second–fourth spawns: same tab_id, split right/down/down", async () => {
    await Bun.sleep(200);
    const nStarts = agentStarts().length;
    const firstHinted = agentStarts().find(
      (s) => typeof s.params.tab_id === "string",
    );
    expect(firstHinted).toBeDefined();
    const poolTab = String(firstHinted!.params.tab_id);

    // Ensure first pane still listed (verify must not have closed it)
    const liveBefore = fake
      .listPaneIds()
      .filter((id) => fake.tabIdForPane(id) === poolTab && !id.includes("root"));
    expect(liveBefore.length).toBeGreaterThanOrEqual(1);

    const p2 = await spawnCard(nextCardId(), "second");
    const p3 = await spawnCard(nextCardId(), "third");
    const p4 = await spawnCard(nextCardId(), "fourth");

    await waitFor(() => agentStarts().length >= nStarts + 3);
    const newStarts = agentStarts()
      .slice(nStarts)
      .filter((s) => typeof s.params.tab_id === "string");
    expect(newStarts.length).toBeGreaterThanOrEqual(3);

    const splits = newStarts.slice(0, 3).map((s) => s.params.split);
    expect(splits).toEqual(["right", "down", "down"]);
    for (const s of newStarts.slice(0, 3)) {
      expect(s.params.tab_id).toBe(poolTab);
    }
    expect(fake.tabIdForPane(p2)).toBe(poolTab);
    expect(fake.tabIdForPane(p3)).toBe(poolTab);
    expect(fake.tabIdForPane(p4)).toBe(poolTab);
  }, 30_000);

  // ⑧ ③
  test("⑧③ fifth spawn creates a new pool tab", async () => {
    const nTabs = tabCreates().length;
    await spawnCard(nextCardId(), "fifth overflows");
    await waitFor(() => tabCreates().length > nTabs, { timeoutMs: 8_000 });
    expect(tabCreates().length).toBeGreaterThan(nTabs);
  }, 15_000);

  // ⑧ ④
  test("⑧④ pane.list SSOT: closed pane frees a slot on same tab", async () => {
    const hinted = agentStarts().filter(
      (s) => typeof s.params.tab_id === "string",
    );
    expect(hinted.length).toBeGreaterThan(0);
    const firstTab = String(hinted[0]!.params.tab_id);
    const firstTabPanes = fake
      .listPaneIds()
      .filter(
        (id) => fake.tabIdForPane(id) === firstTab && !id.includes("root"),
      );
    expect(firstTabPanes.length).toBeGreaterThan(0);

    fake.markPaneClosed(firstTabPanes[0]!);

    const nStarts = agentStarts().length;
    const newPane = await spawnCard(nextCardId(), "reuse slot");
    await waitFor(() => agentStarts().length > nStarts);
    expect(fake.listPaneIds()).toContain(newPane);
  }, 15_000);

  // ⑧ ⑤
  test("⑧⑤ pool tab gone from pane.list → new tab.create", async () => {
    const lastHinted = [...agentStarts()]
      .reverse()
      .find((s) => typeof s.params.tab_id === "string");
    expect(lastHinted).toBeDefined();
    const tabId = String(lastHinted!.params.tab_id);
    fake.dropTab(tabId);

    const nTabs = tabCreates().length;
    await spawnCard(nextCardId(), "after drop");
    await waitFor(() => tabCreates().length > nTabs, { timeoutMs: 8_000 });
    expect(tabCreates().length).toBeGreaterThan(nTabs);
  }, 15_000);

  // ⑧ ⑥
  test("⑧⑥ tab.create failure → unhinted agent.start fallback", async () => {
    for (const id of fake.listPaneIds()) {
      const t = fake.tabIdForPane(id);
      if (t) fake.dropTab(t);
    }
    fake.failTabCreates(1);
    const nStarts = agentStarts().length;
    const cardId = nextCardId();
    const paneId = await spawnCard(cardId, "tabcreate fail path");
    await waitFor(() => agentStarts().length > nStarts);

    const last = agentStarts()[agentStarts().length - 1]!;
    expect(last.params.tab_id).toBeUndefined();
    expect(paneId).toBeTruthy();

    fake.pushEvent("pane_agent_status_changed", {
      pane_id: paneId,
      agent_status: "working",
    });
    fake.setPaneReadText(paneId, "fallback ok\n[DONE]");
    fake.pushEvent("pane_agent_status_changed", {
      pane_id: paneId,
      agent_status: "idle",
    });
    const result = await awaitCardResult(cardId);
    expect(result?.status).toBe("done");
  }, 20_000);

  // ⑧ ⑦
  test("⑧⑦ hinted agent.start failure → unhinted fallback", async () => {
    fake.failHintedAgentStarts(0);
    const seedPane = await spawnCard(nextCardId(), "seed pool");
    const seedStart = [...agentStarts()]
      .reverse()
      .find((s) => typeof s.params.tab_id === "string");
    expect(seedStart).toBeDefined();

    fake.failHintedAgentStarts(1);
    const nStarts = agentStarts().length;
    const paneId = await spawnCard(nextCardId(), "hint fail path");
    await waitFor(() => agentStarts().length > nStarts);

    const newStarts = agentStarts().slice(nStarts);
    const unhinted = newStarts.filter((s) => s.params.tab_id === undefined);
    expect(unhinted.length).toBeGreaterThanOrEqual(1);
    expect(paneId).toBeTruthy();
    expect(seedPane).toBeTruthy();
  }, 20_000);

  // ⑧ ⑧
  test("⑧⑧ panePlacement legacy → no tab.create on spawn", async () => {
    await restartBridge("legacy");
    const nTabs = tabCreates().length;
    const nStarts = agentStarts().length;
    await spawnCard(nextCardId(), "legacy path");
    await waitFor(() => agentStarts().length > nStarts);
    expect(tabCreates().length).toBe(nTabs);
    const last = agentStarts()[agentStarts().length - 1]!;
    expect(last.params.tab_id).toBeUndefined();

    await restartBridge("pool");
  }, 30_000);

  // ⑧ ⑨
  test("⑧⑨ conv open spawn goes through pool (tab.create + tab_id)", async () => {
    useTowerSession();
    const nStarts = agentStarts().length;
    const opened = await convOpen({
      node: "node/wsl-1",
      goal: "conv pool path check",
    });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;

    await waitFor(
      () =>
        agentStarts().some(
          (s, i) =>
            i >= nStarts &&
            (s.params.env as { LOOM_CONV?: string } | undefined)?.LOOM_CONV ===
              opened.convId,
        ),
      { timeoutMs: 10_000 },
    );
    const convStart = agentStarts().find(
      (s) =>
        (s.params.env as { LOOM_CONV?: string } | undefined)?.LOOM_CONV ===
        opened.convId,
    );
    expect(convStart).toBeDefined();
    expect(convStart!.params.tab_id).toBeTruthy();
    expect(convStart!.params.split).toBeTruthy();

    await convClose({ convId: opened.convId, reason: "abort" });
  }, 25_000);

  // ② ⑪
  test("②⑪ conv open inject includes done_proposal convention (not line-leading)", async () => {
    useTowerSession();
    const opened = await convOpen({
      node: "node/wsl-1",
      goal: "check convention block",
    });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;

    await waitFor(() => !!fake.paneIdForConv(opened.convId), {
      timeoutMs: 10_000,
    });
    const paneId = fake.paneIdForConv(opened.convId)!;

    await waitFor(
      () => (fake.getPaneText(paneId) ?? "").includes("DONE_PROPOSAL"),
      { timeoutMs: 8_000 },
    );
    const text = fake.getPaneText(paneId) ?? "";
    expect(text).toContain("DONE_PROPOSAL");
    expect(text).toContain("[ARTIFACT]");
    const conventionLines = text
      .split(/\r?\n/)
      .filter((l) => l.includes("[DONE_PROPOSAL]"));
    expect(conventionLines.length).toBeGreaterThan(0);
    for (const line of conventionLines) {
      expect(line.trimStart().startsWith("[DONE_PROPOSAL]")).toBe(false);
    }

    await convClose({ convId: opened.convId, reason: "abort" });
  }, 25_000);

  // ② ⑫
  test("②⑫ applyIncomingConvIntent done_proposal → fixed notes, status doing", () => {
    useTowerSession();
    const convId = generateConvId();
    const task = addTask({
      title: "done proposal surface",
      status: "doing",
      roomId: towerSession.roomId,
    });
    saveConvState({
      convId,
      role: "tower",
      roomId: towerSession.roomId,
      pinnedPeerId: "p_node",
      status: "active",
      goal: "g",
      limits: { maxTurns: 20, wallClockMs: 7_200_000 },
      lastOwnSeq: CONV_OPEN_SEQ,
      lastPeerSeq: 1, // accept already seen
      turnCount: 0,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      taskId: task.id,
    });

    const payload = ConvTurnPayloadSchema.parse({
      v: CONV_CONTRACT_VERSION,
      convId,
      seq: 3, // worker odd seq
      kind: "done_proposal",
      text: "summary of work",
    });
    const result = applyIncomingConvIntent("p_node", [
      serializeConvAttachment(CONV_TURN_LABEL, payload),
    ]);
    expect(result?.status).toBe("turn");
    if (result?.status === "turn") {
      expect(result.kind).toBe("done_proposal");
    }
    const board = loadTaskBoard(towerSession.roomId);
    const t = board?.tasks.find((x) => x.id === task.id);
    expect(t?.status).toBe("doing");
    expect(t?.notes).toBe(
      "[DONE_PROPOSAL] worker proposes completion — conv.close(reason done) to accept (last turnSeq=3)",
    );
  });

  // ② ⑬
  test("②⑬ convention-compliant tail marker → done_proposal; mid-body no", async () => {
    useTowerSession();
    const opened = await convOpen({
      node: "node/wsl-1",
      goal: "done proposal detection e2e",
    });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;

    const acc = await convAwait({ convId: opened.convId, timeoutSec: 15 });
    expect(acc.status).toBe("accept");

    await waitFor(() => !!fake.paneIdForConv(opened.convId), {
      timeoutMs: 8_000,
    });
    const paneId = fake.paneIdForConv(opened.convId)!;
    // Satisfy open-inject verify (conv keeps pane; blocked would pollute kind).
    fake.pushEvent("pane_agent_status_changed", {
      pane_id: paneId,
      agent_status: "working",
    });
    await Bun.sleep(350);

    // Drain any auto turn from open inject before deliberate screens.
    for (let i = 0; i < 3; i++) {
      const early = await convAwait({ convId: opened.convId, timeoutSec: 2 });
      if (early.status === "timeout") break;
    }

    const midBody = [
      "I considered writing [DONE_PROPOSAL] early but will not",
      "still working on the analysis",
      "more mid content here",
    ].join("\n");
    fake.setPaneReadSequence(paneId, [midBody, midBody, midBody]);
    fake.setPaneText(paneId, midBody);
    fake.pushEvent("pane_agent_status_changed", {
      pane_id: paneId,
      agent_status: "working",
    });
    await Bun.sleep(30);
    fake.pushEvent("pane_agent_status_changed", {
      pane_id: paneId,
      agent_status: "idle",
    });
    const turn1 = await convAwait({ convId: opened.convId, timeoutSec: 15 });
    expect(turn1.status).toBe("turn");
    if (turn1.status === "turn") {
      expect(turn1.kind).toBe("normal");
    }

    const compliant = [
      "tower: please wrap up",
      "worker mid output line 1",
      "worker mid output line 2",
      "[DONE_PROPOSAL] all acceptance criteria met",
    ].join("\n");
    fake.setPaneReadSequence(paneId, [compliant, compliant, compliant]);
    fake.setPaneText(paneId, compliant);
    fake.pushEvent("pane_agent_status_changed", {
      pane_id: paneId,
      agent_status: "working",
    });
    await Bun.sleep(30);
    fake.pushEvent("pane_agent_status_changed", {
      pane_id: paneId,
      agent_status: "idle",
    });
    const turn2 = await convAwait({ convId: opened.convId, timeoutSec: 15 });
    expect(turn2.status).toBe("turn");
    if (turn2.status === "turn") {
      expect(turn2.kind).toBe("done_proposal");
    }

    const state = loadConvState(opened.convId, "tower");
    if (state?.taskId) {
      const board = loadTaskBoard(towerSession.roomId);
      const t = board?.tasks.find((x) => x.id === state.taskId);
      expect(t?.status).toBe("doing");
      expect(t?.notes).toContain("[DONE_PROPOSAL] worker proposes completion");
      expect(t?.notes).toContain("last turnSeq=");
    }

    await convClose({ convId: opened.convId, reason: "done" });
  }, 40_000);

  // ③ ⑭
  test("③⑭ unauthorized conv.open: no agent.start, handoff not claimed", async () => {
    const evil = new RelayClient({ url: `ws://127.0.0.1:${port}/ws` });
    const joined = await evil.joinRoom({
      inviteCode,
      displayName: "evil-open",
      agentKind: "shell",
      peerId: `p_evil${Math.random().toString(16).slice(2, 10)}`,
    });
    if (joined.type === "error") throw new Error(joined.message);

    const convId = generateConvId();
    const payload = ConvOpenPayloadSchema.parse({
      v: CONV_CONTRACT_VERSION,
      convId,
      goal: "evil open",
      scope: { agentKind: "claude" },
      limits: {},
    });
    const nStarts = agentStarts().length;
    await evil.handoff({
      to: "@node/wsl-1",
      body: buildConvOpenBody({ goal: "evil open", convId }),
      mode: "task",
      attachments: [serializeConvAttachment(CONV_OPEN_LABEL, payload)],
    });

    await Bun.sleep(700);
    const starts = agentStarts().filter(
      (s) =>
        (s.params.env as { LOOM_CONV?: string } | undefined)?.LOOM_CONV ===
        convId,
    );
    expect(starts.length).toBe(0);
    expect(agentStarts().length).toBe(nStarts);

    // Bridge did not claim — entry may still be claimable by worker peer
    useWorkerSession();
    const nodeClient = new RelayClient({ url: `ws://127.0.0.1:${port}/ws` });
    const persisted = JSON.parse(
      readFileSync(sessionFile, "utf8"),
    ) as FableSession;
    const rejoin = await nodeClient.joinRoom({
      inviteCode,
      displayName: session.displayName,
      agentKind: "shell",
      peerId: session.peerId,
      peerSecret: persisted.peerSecret,
    });
    if (rejoin.type === "error") throw new Error(rejoin.message);
    const inbox = await nodeClient.listInbox();
    const evilEntry = inbox.find((e) =>
      e.handoff.attachments?.some(
        (a) => a.label === CONV_OPEN_LABEL && a.content.includes(convId),
      ),
    );
    if (evilEntry) {
      const claim = await nodeClient.claimHandoff(evilEntry.handoff.id, "claim");
      expect(claim.ok).toBe(true);
    }

    nodeClient.close();
    evil.close();
  }, 15_000);

  // ③ ⑮
  test("③⑮ authorized conv.open: claim + accept regression", async () => {
    useTowerSession();
    const opened = await convOpen({
      node: "node/wsl-1",
      goal: "authorized open regression",
    });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const acc = await convAwait({ convId: opened.convId, timeoutSec: 15 });
    expect(acc.status).toBe("accept");
    await convClose({ convId: opened.convId, reason: "abort" });
  }, 25_000);

  // ③ ⑯
  test("③⑯ unauthorized turn/close: pre-claim path retained (no worker action)", async () => {
    useTowerSession();
    const opened = await convOpen({
      node: "node/wsl-1",
      goal: "pin path for turn/close",
    });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const acc = await convAwait({ convId: opened.convId, timeoutSec: 15 });
    expect(acc.status).toBe("accept");

    const evil = new RelayClient({ url: `ws://127.0.0.1:${port}/ws` });
    const joined = await evil.joinRoom({
      inviteCode,
      displayName: "evil-turn",
      agentKind: "shell",
      peerId: `p_evil${Math.random().toString(16).slice(2, 10)}`,
    });
    if (joined.type === "error") throw new Error(joined.message);

    const turnPayload = ConvTurnPayloadSchema.parse({
      v: CONV_CONTRACT_VERSION,
      convId: opened.convId,
      seq: 99,
      kind: "normal",
      text: "forged turn",
    });
    await evil.handoff({
      to: "@node/wsl-1",
      body: buildConvTurnBody({
        convId: opened.convId,
        seq: 99,
        kind: "normal",
      }),
      mode: "task",
      attachments: [serializeConvAttachment(CONV_TURN_LABEL, turnPayload)],
    });

    const closePayload = ConvClosePayloadSchema.parse({
      v: CONV_CONTRACT_VERSION,
      convId: opened.convId,
      reason: "abort",
    });
    await evil.handoff({
      to: "@node/wsl-1",
      body: buildConvCloseBody({
        convId: opened.convId,
        reason: "abort",
      }),
      mode: "task",
      attachments: [serializeConvAttachment(CONV_CLOSE_LABEL, closePayload)],
    });

    await Bun.sleep(500);
    const workerState = loadConvState(opened.convId, "worker");
    expect(workerState?.status).toBe("active");

    await convClose({ convId: opened.convId, reason: "abort" });
    evil.close();
  }, 25_000);

  // bridge status panePlacement
  test("⑧ bridge status includes panePlacement", async () => {
    expect(bridge).toBeTruthy();
    // Ensure pool mode after legacy restart tests
    await restartBridge("pool");
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
    const body = (await res.json()) as { panePlacement?: string };
    expect(body.panePlacement).toBe("pool");
  }, 20_000);
});
