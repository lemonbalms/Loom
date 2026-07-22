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

  test("marker buried before last K(10) non-empty → false", () => {
    const lines = [
      "[DONE_PROPOSAL] buried",
      ...Array.from({ length: 11 }, (_, i) => `line ${i}`),
    ];
    expect(hasDoneProposalMarker(lines.join("\n"))).toBe(false);
  });

  test("SMOKE-0239 live shape: marker + 3 trailing TUI lines → true (K=10)", () => {
    const text = [
      '⏺ package.json의 "name" 필드 값은 loom입니다.',
      "",
      '[DONE_PROPOSAL] package.json name 필드 확인 완료 — 값은 "loom"',
      "",
      "✻ Churned for 15s",
      "❯",
      "Fable 5 ⚡high │ 5% 50k/1.0M │ fable-advisor main",
    ].join("\n");
    expect(hasDoneProposalMarker(text)).toBe(true);
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
    herdrProtocol: 17,
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
      herdr: new HerdrClient({ socketPath: herdrSock }),
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
  ): Promise<{ status?: string; reason?: string } | null> {
    if (!tower) return null;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const inbox = await tower.listInbox();
      for (const e of inbox) {
        const att = e.handoff.attachments?.find(
          (a) => a.label === CARD_RESULT_LABEL && a.content.includes(cardId),
        );
        if (att)
          return JSON.parse(att.content) as {
            status?: string;
            reason?: string;
          };
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

  function hasPaneStatusSubscription(paneId: string): boolean {
    return fake.calls.some((c) => {
      if (c.method !== "events.subscribe") return false;
      const subs = c.params.subscriptions;
      if (!Array.isArray(subs)) return false;
      return subs.some(
        (s) =>
          typeof s === "object" &&
          s !== null &&
          "pane_id" in s &&
          (s as { pane_id?: string }).pane_id === paneId,
      );
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
    const subscribed = await waitFor(
      () => hasPaneStatusSubscription(paneId),
      { timeoutMs: 5_000 },
    );
    expect(subscribed).toBe(true);
    // autoStatus:"none" does not broadcast working on agent.prompt — push it so
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

  function paneSplits(): FakeHerdr["calls"] {
    return fake.calls.filter((c) => c.method === "pane.split");
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
      protocol: 17,
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
      herdr: new HerdrClient({ socketPath: herdrSock }),
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
  test("⑧① first card spawn: tab.create → agent.start on root pane (no root close)", async () => {
    const nTabs = tabCreates().length;
    const nStarts = agentStarts().length;
    const paneId = await spawnCard(nextCardId(), "first pool worker");
    await waitFor(() => tabCreates().length > nTabs);
    await waitFor(() => agentStarts().length > nStarts);

    const creates = tabCreates().slice(nTabs);
    expect(creates.length).toBeGreaterThanOrEqual(1);
    expect(creates[0]!.params.label).toBe("loom-workers");
    expect(creates[0]!.params.focus).toBe(false);
    // Protocol 17: cwd/env on tab.create, not agent.start
    expect(creates[0]!.params.env).toBeDefined();

    const starts = agentStarts().slice(nStarts);
    expect(starts.length).toBeGreaterThanOrEqual(1);
    const first = starts[0]!;
    // Named start on existing root shell pane — no legacy tab_id/split
    expect(first.params.pane_id).toBeTruthy();
    expect(first.params.tab_id).toBeUndefined();
    expect(first.params.split).toBeUndefined();
    expect(first.params.env).toBeUndefined();
    expect(first.params.cwd).toBeUndefined();

    // Protocol 17: worker runs on the root shell pane; do not close root.
    const rootClose = fake.calls.some(
      (c) =>
        c.method === "pane.close" &&
        String(c.params.pane_id ?? "").includes("root"),
    );
    expect(rootClose).toBe(false);
    expect(fake.tabIdForPane(paneId)).toBeTruthy();
  }, 15_000);

  // ⑧ ②
  test("⑧② second–fourth spawns: same pool tab via pane.split direction right", async () => {
    await Bun.sleep(200);
    const nStarts = agentStarts().length;
    const nSplits = paneSplits().length;
    const firstTab = tabCreates()[0]
      ? fake.tabIdForPane(
          fake.listPaneIds().find((id) => fake.tabIdForPane(id)) ?? "",
        )
      : undefined;
    // Resolve pool tab from any live pane after first spawn
    const poolTab =
      firstTab ??
      fake.listPaneIds().map((id) => fake.tabIdForPane(id)).find(Boolean);
    expect(poolTab).toBeTruthy();

    // Ensure first pane still listed (verify must not have closed it)
    const liveBefore = fake
      .listPaneIds()
      .filter((id) => fake.tabIdForPane(id) === poolTab);
    expect(liveBefore.length).toBeGreaterThanOrEqual(1);

    const p2 = await spawnCard(nextCardId(), "second");
    const p3 = await spawnCard(nextCardId(), "third");
    const p4 = await spawnCard(nextCardId(), "fourth");

    await waitFor(() => agentStarts().length >= nStarts + 3);
    await waitFor(() => paneSplits().length >= nSplits + 3);

    const newSplits = paneSplits().slice(nSplits);
    expect(newSplits.length).toBeGreaterThanOrEqual(3);
    const directions = newSplits.slice(0, 3).map((s) => s.params.direction);
    expect(directions).toEqual(["right", "right", "right"]);
    for (const s of newSplits.slice(0, 3)) {
      expect(s.params.target_pane_id).toBeTruthy();
      expect(s.params.env).toBeDefined();
      expect(s.params.focus).toBe(false);
    }
    // agent.start only carries pane_id (no tab_id/split)
    const newStarts = agentStarts().slice(nStarts);
    expect(newStarts.length).toBeGreaterThanOrEqual(3);
    for (const s of newStarts.slice(0, 3)) {
      expect(s.params.pane_id).toBeTruthy();
      expect(s.params.tab_id).toBeUndefined();
      expect(s.params.split).toBeUndefined();
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
    const firstTab = fake
      .listPaneIds()
      .map((id) => fake.tabIdForPane(id))
      .find(Boolean);
    expect(firstTab).toBeTruthy();
    const firstTabPanes = fake
      .listPaneIds()
      .filter((id) => fake.tabIdForPane(id) === firstTab);
    expect(firstTabPanes.length).toBeGreaterThan(0);

    fake.markPaneClosed(firstTabPanes[0]!);

    const nStarts = agentStarts().length;
    const newPane = await spawnCard(nextCardId(), "reuse slot");
    await waitFor(() => agentStarts().length > nStarts);
    expect(fake.listPaneIds()).toContain(newPane);
  }, 15_000);

  // ⑧ ⑤
  test("⑧⑤ pool tab gone from pane.list → new tab.create", async () => {
    // Seed a worker if this test runs filtered (no prior ⑧①–④ state).
    if (agentStarts().length === 0) {
      await spawnCard(nextCardId(), "seed pool for drop");
    }
    // Drop the tab of the most recent agent.start pane (not an arbitrary live
    // tab) so the pool loses its tracked tab and spawn must tab.create again.
    const starts = agentStarts();
    expect(starts.length).toBeGreaterThan(0);
    const lastStart = starts[starts.length - 1]!;
    const lastPaneId = lastStart.params.pane_id as string;
    const tabId = fake.tabIdForPane(lastPaneId);
    expect(tabId).toBeTruthy();
    fake.dropTab(tabId!);

    const nTabs = tabCreates().length;
    await spawnCard(nextCardId(), "after drop");
    await waitFor(() => tabCreates().length > nTabs, { timeoutMs: 8_000 });
    expect(tabCreates().length).toBeGreaterThan(nTabs);
  }, 15_000);

  // ⑧ ⑥
  test("⑧⑥ tab.create failure → unhinted pane.split fallback", async () => {
    for (const id of fake.listPaneIds()) {
      const t = fake.tabIdForPane(id);
      if (t) fake.dropTab(t);
    }
    fake.failTabCreates(1);
    const nStarts = agentStarts().length;
    const nSplits = paneSplits().length;
    const cardId = nextCardId();
    const paneId = await spawnCard(cardId, "tabcreate fail path");
    await waitFor(() => agentStarts().length > nStarts);

    // Unhinted fallback: pane.split without target_pane_id, then agent.start
    const newSplits = paneSplits().slice(nSplits);
    const unhinted = newSplits.filter(
      (s) => s.params.target_pane_id === undefined || s.params.target_pane_id === null,
    );
    expect(unhinted.length).toBeGreaterThanOrEqual(1);
    const last = agentStarts()[agentStarts().length - 1]!;
    expect(last.params.pane_id).toBeTruthy();
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
    expect(result?.status).toBe("failed");
    expect(result?.reason).toBe("needs_verification");
  }, 20_000);

  // ⑧ ⑦
  test("⑧⑦ hinted pane.split failure → unhinted fallback", async () => {
    fake.failHintedAgentStarts(0);
    const seedPane = await spawnCard(nextCardId(), "seed pool");
    expect(seedPane).toBeTruthy();

    fake.failHintedAgentStarts(1);
    const nStarts = agentStarts().length;
    const nSplits = paneSplits().length;
    const paneId = await spawnCard(nextCardId(), "hint fail path");
    await waitFor(() => agentStarts().length > nStarts);

    const newSplits = paneSplits().slice(nSplits);
    // At least one unhinted split (no target) after the hinted failure
    const unhinted = newSplits.filter(
      (s) => s.params.target_pane_id === undefined || s.params.target_pane_id === null,
    );
    expect(unhinted.length).toBeGreaterThanOrEqual(1);
    expect(paneId).toBeTruthy();
  }, 20_000);

  // ⑧ ⑧
  test("⑧⑧ panePlacement legacy → no tab.create on spawn", async () => {
    await restartBridge("legacy");
    const nTabs = tabCreates().length;
    const nStarts = agentStarts().length;
    const nSplits = paneSplits().length;
    await spawnCard(nextCardId(), "legacy path");
    await waitFor(() => agentStarts().length > nStarts);
    expect(tabCreates().length).toBe(nTabs);
    // Legacy = unhinted pane.split + agent.start on returned pane
    const newSplits = paneSplits().slice(nSplits);
    expect(newSplits.length).toBeGreaterThanOrEqual(1);
    expect(
      newSplits.some(
        (s) => s.params.target_pane_id === undefined || s.params.target_pane_id === null,
      ),
    ).toBe(true);
    const last = agentStarts()[agentStarts().length - 1]!;
    expect(last.params.pane_id).toBeTruthy();
    expect(last.params.tab_id).toBeUndefined();

    await restartBridge("pool");
  }, 30_000);

  // ⑧ ⑨
  test("⑧⑨ conv open spawn goes through pool (tab.create + env on alloc)", async () => {
    useTowerSession();
    const nStarts = agentStarts().length;
    const nTabs = tabCreates().length;
    const opened = await convOpen({
      node: "node/wsl-1",
      goal: "conv pool path check",
    });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;

    await waitFor(
      () => Boolean(fake.paneIdForConv(opened.convId)),
      { timeoutMs: 10_000 },
    );
    const paneId = fake.paneIdForConv(opened.convId)!;
    await waitFor(
      () =>
        agentStarts().some(
          (s, i) => i >= nStarts && s.params.pane_id === paneId,
        ),
      { timeoutMs: 10_000 },
    );
    const convStart = agentStarts().find((s) => s.params.pane_id === paneId);
    expect(convStart).toBeDefined();
    expect(convStart!.params.pane_id).toBe(paneId);
    expect(convStart!.params.tab_id).toBeUndefined();
    // Pool path: either new tab.create with LOOM_CONV, or pane.split with env
    const envAlloc = fake.calls.find(
      (c) =>
        (c.method === "tab.create" || c.method === "pane.split") &&
        (c.params.env as { LOOM_CONV?: string } | undefined)?.LOOM_CONV ===
          opened.convId,
    );
    expect(envAlloc).toBeDefined();
    // Prefer pool (tab.create when empty, or split into existing pool tab)
    expect(
      tabCreates().length > nTabs || envAlloc!.method === "pane.split",
    ).toBe(true);

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
    // Unauthorized: no pane alloc with LOOM_CONV and no agent.start growth
    expect(fake.paneIdForConv(convId)).toBeUndefined();
    const envAllocs = fake.calls.filter(
      (c) =>
        (c.method === "tab.create" || c.method === "pane.split") &&
        (c.params.env as { LOOM_CONV?: string } | undefined)?.LOOM_CONV ===
          convId,
    );
    expect(envAllocs.length).toBe(0);
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
