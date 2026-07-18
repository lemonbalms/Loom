/**
 * PLAN 0.23.8 — worker pane cleanup policy (tests ①–⑧, ⑬–⑭).
 * closePane is explicit (R33 M-1); paneCleanup keep opt-out; order invariant
 * flight teardown → sendResult success → best-effort pane.close.
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
import { HerdrClient } from "./herdr-client";
import { startFakeHerdr, type FakeHerdr } from "./fake-herdr";
import {
  startBridgeRuntime,
  type BridgeRuntime,
} from "./bridge-runtime";
import type { BridgeConfig } from "./bridge-config";
import {
  resetStateHomeDirCache,
  setActiveProfile,
  type FableSession,
} from "./session-store";
import { convOpen, convClose } from "./conv-ops";

type CardResult = {
  status?: string;
  reason?: string;
  note?: string;
  output?: string;
  cardId?: string;
};

const STILL_LINE = "Worked for 48s. 1 command still running";
const DONE_BODY = "IMPL-MARKER-COMPLETE\nall tests green\n[IMPL-0238-DONE]";

async function waitFor(
  pred: () => boolean,
  opts?: { timeoutMs?: number; stepMs?: number },
): Promise<boolean> {
  const timeoutMs = opts?.timeoutMs ?? 8_000;
  const stepMs = opts?.stepMs ?? 50;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (pred()) return true;
    await Bun.sleep(stepMs);
  }
  return pred();
}

function closeCallsFor(fake: FakeHerdr, paneId: string): number {
  return fake.calls.filter(
    (c) =>
      c.method === "pane.close" && String(c.params.pane_id ?? "") === paneId,
  ).length;
}

describe("PLAN 0.23.8 pane cleanup policy", () => {
  const port = 23080 + Math.floor(Math.random() * 200);
  const dir = join(tmpdir(), `loom-pane-cleanup-${Date.now()}`);
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

  const cfg: BridgeConfig = {
    authorizedDispatchers: ["p_tower"],
    herdrSocketPath: herdrSock,
    agentArgv: { claude: ["claude"] },
    herdrProtocol: 16,
    paneCleanup: "auto",
  };

  const POLL_MS = 80;
  const MAX_MS = 350;
  const SETTLE_MS = 15;

  async function awaitCardResult(
    cardId: string,
    timeoutMs = 12_000,
  ): Promise<CardResult | null> {
    if (!tower) return null;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const inbox = await tower.listInbox();
      for (const e of inbox) {
        const att = e.handoff.attachments?.find(
          (a) => a.label === CARD_RESULT_LABEL && a.content.includes(cardId),
        );
        if (att) return JSON.parse(att.content) as CardResult;
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
      { timeoutMs: 8_000 },
    );
    expect(ready).toBe(true);
    return fake.listPaneIds().find((p) => !panesBefore.has(p))!;
  }

  function emitWorkingThen(
    paneId: string,
    final: "idle" | "done" | "blocked" = "idle",
  ): void {
    fake.pushEvent("pane_agent_status_changed", {
      pane_id: paneId,
      agent_status: "working",
    });
    fake.pushEvent("pane_agent_status_changed", {
      pane_id: paneId,
      agent_status: final,
    });
  }

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
      autoStatus: "none",
    });

    tower = new RelayClient({ url: `ws://127.0.0.1:${port}/ws` });
    const created = await tower.createRoom({
      roomName: "pane-cleanup",
      displayName: "tower",
      agentKind: "shell",
      peerId: "p_tower",
    });
    if (created.type !== "room.state") throw new Error("create failed");
    inviteCode = created.inviteCode ?? "";
    const towerSecret = created.peerSecret ?? tower.peerSecret;

    towerSession = {
      roomId: created.roomId,
      roomName: "pane-cleanup",
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

    session = {
      roomId: created.roomId,
      roomName: "pane-cleanup",
      inviteCode,
      peerId: "p_node",
      displayName: "node/wsl-1",
      color: "#0f0",
      agentKind: "shell",
      relayUrl: `ws://127.0.0.1:${port}/ws`,
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(sessionFile, JSON.stringify(session), "utf8");

    process.env.LOOM_SESSION = sessionFile;
    resetStateHomeDirCache();

    bridge = await startBridgeRuntime({
      session,
      profile: "node",
      config: cfg,
      herdr: new HerdrClient({
        socketPath: herdrSock,
        submitDelayMs: 0,
      }),
      submitVerify: { waitMs: 250, retries: 1 },
      settleMs: SETTLE_MS,
      stillRunningPollMs: POLL_MS,
      stillRunningMaxMs: MAX_MS,
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
    resetStateHomeDirCache();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* */
    }
  });

  test(
    "① no-indicator immediate done → sendResult then pane.close exactly once",
    async () => {
      const cardId = "task_a023800000000001";
      const paneId = await spawnCard(cardId, "pane-cleanup-immediate");
      const closesBefore = closeCallsFor(fake, paneId);

      fake.setPaneReadText(paneId, DONE_BODY);
      emitWorkingThen(paneId, "idle");

      const result = await awaitCardResult(cardId);
      expect(result).toBeTruthy();
      expect(result!.status).toBe("done");
      expect(result!.output).toContain("IMPL-MARKER-COMPLETE");

      const closed = await waitFor(
        () => closeCallsFor(fake, paneId) === closesBefore + 1,
        { timeoutMs: 3_000 },
      );
      expect(closed).toBe(true);
      expect(closeCallsFor(fake, paneId)).toBe(closesBefore + 1);
      fake.setPaneReadText(paneId, null);
    },
    20_000,
  );

  test(
    "② deferral clear → close exactly once",
    async () => {
      const cardId = "task_a023800000000002";
      const paneId = await spawnCard(cardId, "pane-cleanup-defer-clear");
      const closesBefore = closeCallsFor(fake, paneId);

      fake.setPaneReadText(paneId, STILL_LINE);
      emitWorkingThen(paneId, "idle");

      await Bun.sleep(POLL_MS + SETTLE_MS * 3 + 40);
      fake.setPaneReadText(paneId, DONE_BODY);

      const result = await awaitCardResult(cardId);
      expect(result).toBeTruthy();
      expect(result!.status).toBe("done");
      expect(result!.note).toMatch(/completion deferred/);

      const closed = await waitFor(
        () => closeCallsFor(fake, paneId) === closesBefore + 1,
        { timeoutMs: 3_000 },
      );
      expect(closed).toBe(true);
      fake.setPaneReadText(paneId, null);
    },
    20_000,
  );

  test(
    "③ exhausted → no pane.close",
    async () => {
      const cardId = "task_a023800000000003";
      const paneId = await spawnCard(cardId, "pane-cleanup-exhausted");
      const closesBefore = closeCallsFor(fake, paneId);

      fake.setPaneReadText(paneId, STILL_LINE);
      emitWorkingThen(paneId, "idle");

      const result = await awaitCardResult(cardId, 8_000);
      expect(result).toBeTruthy();
      expect(result!.status).toBe("done");
      expect(result!.note).toMatch(/still_running deferral exhausted/);

      await Bun.sleep(200);
      expect(closeCallsFor(fake, paneId)).toBe(closesBefore);
      fake.setPaneReadText(paneId, null);
    },
    20_000,
  );

  test(
    "④ agent_blocked failed → no pane.close (failure path keeps pane)",
    async () => {
      const cardId = "task_a023800000000004";
      const paneId = await spawnCard(cardId, "pane-cleanup-blocked");
      const closesBefore = closeCallsFor(fake, paneId);

      emitWorkingThen(paneId, "blocked");

      const result = await awaitCardResult(cardId);
      expect(result).toBeTruthy();
      expect(result!.status).toBe("failed");
      expect(result!.reason).toBe("agent_blocked");

      await Bun.sleep(200);
      expect(closeCallsFor(fake, paneId)).toBe(closesBefore);
    },
    20_000,
  );

  test(
    "⑤ conv close → teardown + pane.close once",
    async () => {
      process.env.LOOM_SESSION = towerSessionFile;
      resetStateHomeDirCache();

      const opened = await convOpen({
        node: "node/wsl-1",
        goal: "pane-cleanup-conv-close",
        agentKind: "claude",
      });
      expect(opened.ok).toBe(true);
      if (!opened.ok) return;

      // Wait for accept/pane spawn on worker bridge
      const paneReady = await waitFor(
        () => fake.paneIdForConv(opened.convId) != null,
        { timeoutMs: 10_000 },
      );
      expect(paneReady).toBe(true);
      const paneId = fake.paneIdForConv(opened.convId)!;
      const closesBefore = closeCallsFor(fake, paneId);

      const closed = await convClose({
        convId: opened.convId,
        reason: "done",
      });
      expect(closed.ok).toBe(true);

      const sawClose = await waitFor(
        () => closeCallsFor(fake, paneId) === closesBefore + 1,
        { timeoutMs: 5_000 },
      );
      expect(sawClose).toBe(true);

      process.env.LOOM_SESSION = sessionFile;
      resetStateHomeDirCache();
    },
    25_000,
  );

  test(
    "⑧ pane.close reject → result still delivered (no throw propagation)",
    async () => {
      const cardId = "task_a023800000000008";
      const paneId = await spawnCard(cardId, "pane-cleanup-close-reject");
      fake.setPaneCloseFail(true);
      try {
        fake.setPaneReadText(paneId, DONE_BODY);
        emitWorkingThen(paneId, "idle");

        const result = await awaitCardResult(cardId);
        expect(result).toBeTruthy();
        expect(result!.status).toBe("done");
        expect(result!.output).toContain("IMPL-MARKER-COMPLETE");
        // close was attempted (recorded) even though it failed
        await waitFor(() => closeCallsFor(fake, paneId) >= 1, {
          timeoutMs: 3_000,
        });
      } finally {
        fake.setPaneCloseFail(false);
        fake.setPaneReadText(paneId, null);
      }
    },
    20_000,
  );

  test(
    "⑭ settle-fail fallback (no scrape, no closePane) → no pane.close",
    async () => {
      const cardId = "task_a023800000000014";
      const paneId = await spawnCard(cardId, "pane-cleanup-settle-fail");
      const closesBefore = closeCallsFor(fake, paneId);

      // Force settlePaneRead (up to 3 reads) to fail entirely → beginCardCompletion
      // fallthrough finishCard without closePane.
      fake.failPaneReads(12);
      try {
        emitWorkingThen(paneId, "idle");

        const result = await awaitCardResult(cardId);
        expect(result).toBeTruthy();
        // pane.read failed inside finishCard flips done→failed
        expect(result!.status).toBe("failed");

        await Bun.sleep(200);
        expect(closeCallsFor(fake, paneId)).toBe(closesBefore);
      } finally {
        // Clear residual fail budget so later tests are not polluted.
        fake.failPaneReads(0);
      }
    },
    20_000,
  );

  test(
    "⑬ regression: normal done path still delivers result (close additive only)",
    async () => {
      fake.failPaneReads(0);
      const cardId = "task_a023800000000013";
      const paneId = await spawnCard(cardId, "pane-cleanup-regression");
      fake.setPaneReadText(paneId, "simple done output line");
      emitWorkingThen(paneId, "idle");

      const result = await awaitCardResult(cardId);
      expect(result).toBeTruthy();
      expect(result!.status).toBe("done");
      expect(result!.output).toContain("simple done output line");
      fake.setPaneReadText(paneId, null);
    },
    20_000,
  );
});

describe("PLAN 0.23.8 paneCleanup keep + failure-path close (⑥⑦)", () => {
  const port = 23280 + Math.floor(Math.random() * 200);
  const dir = join(tmpdir(), `loom-pane-keep-${Date.now()}`);
  const sessionFile = join(dir, "session.json");
  const towerSessionFile = join(dir, "tower-session.json");
  const herdrSock = join(dir, "herdr.sock");
  const relay = new RelayServer({ host: "127.0.0.1", port });

  let fake: FakeHerdr;
  let bridge: BridgeRuntime | null = null;
  let tower: RelayClient | null = null;
  let session: FableSession;
  let towerSession: FableSession;

  const POLL_MS = 80;
  const MAX_MS = 350;
  const SETTLE_MS = 15;

  async function waitForLocal(
    pred: () => boolean,
    timeoutMs = 8_000,
  ): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (pred()) return true;
      await Bun.sleep(50);
    }
    return pred();
  }

  async function awaitCardResult(
    cardId: string,
    timeoutMs = 12_000,
  ): Promise<CardResult | null> {
    if (!tower) return null;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const inbox = await tower.listInbox();
      for (const e of inbox) {
        const att = e.handoff.attachments?.find(
          (a) => a.label === CARD_RESULT_LABEL && a.content.includes(cardId),
        );
        if (att) return JSON.parse(att.content) as CardResult;
      }
      await Bun.sleep(80);
    }
    return null;
  }

  beforeAll(async () => {
    mkdirSync(dir, { recursive: true });
    process.env.LOOM_TEST_HOME = dir;
    process.env.LOOM_SESSION = sessionFile;
    process.env.LOOM_NO_AUTO_HOST = "1";
    resetStateHomeDirCache();
    setActiveProfile(null);
    relay.start();

    // failSubscribeOnClosedPane not needed; subscribeFailFromCall for ⑥ failure path
    fake = await startFakeHerdr({
      socketPath: herdrSock,
      autoStatus: "none",
    });

    tower = new RelayClient({ url: `ws://127.0.0.1:${port}/ws` });
    const created = await tower.createRoom({
      roomName: "pane-keep",
      displayName: "tower",
      agentKind: "shell",
      peerId: "p_tower",
    });
    if (created.type !== "room.state") throw new Error("create failed");
    const inviteCode = created.inviteCode ?? "";
    const towerSecret = created.peerSecret ?? tower.peerSecret;

    towerSession = {
      roomId: created.roomId,
      roomName: "pane-keep",
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

    session = {
      roomId: created.roomId,
      roomName: "pane-keep",
      inviteCode,
      peerId: "p_node",
      displayName: "node/wsl-1",
      color: "#0f0",
      agentKind: "shell",
      relayUrl: `ws://127.0.0.1:${port}/ws`,
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(sessionFile, JSON.stringify(session), "utf8");

    process.env.LOOM_SESSION = sessionFile;
    resetStateHomeDirCache();

    const cfg: BridgeConfig = {
      authorizedDispatchers: ["p_tower"],
      herdrSocketPath: herdrSock,
      agentArgv: { claude: ["claude"] },
      herdrProtocol: 16,
      paneCleanup: "keep",
    };

    bridge = await startBridgeRuntime({
      session,
      profile: "node-keep",
      config: cfg,
      herdr: new HerdrClient({
        socketPath: herdrSock,
        submitDelayMs: 0,
      }),
      submitVerify: { waitMs: 250, retries: 1 },
      settleMs: SETTLE_MS,
      stillRunningPollMs: POLL_MS,
      stillRunningMaxMs: MAX_MS,
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
    resetStateHomeDirCache();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* */
    }
  });

  test(
    "⑥ paneCleanup keep → confident done does not close",
    async () => {
      const cardId = "task_a023800000000006";
      const panesBefore = new Set(fake.listPaneIds());
      await tower!.handoff({
        to: "@node/wsl-1",
        body: buildDispatchBody({
          title: "keep",
          cardId,
          node: "node/wsl-1",
        }),
        mode: "task",
        attachments: [
          serializeCardAttachment(CARD_DISPATCH_LABEL, {
            v: CARD_CONTRACT_VERSION,
            cardId,
            sourceRoomId: towerSession.roomId,
            prompt: "keep-mode-done",
            agentKind: "claude",
          }),
        ],
      });
      const ready = await waitForLocal(
        () => fake.listPaneIds().some((p) => !panesBefore.has(p)),
      );
      expect(ready).toBe(true);
      const paneId = fake.listPaneIds().find((p) => !panesBefore.has(p))!;
      const closesBefore = closeCallsFor(fake, paneId);

      fake.setPaneReadText(paneId, DONE_BODY);
      fake.pushEvent("pane_agent_status_changed", {
        pane_id: paneId,
        agent_status: "working",
      });
      fake.pushEvent("pane_agent_status_changed", {
        pane_id: paneId,
        agent_status: "idle",
      });

      const result = await awaitCardResult(cardId);
      expect(result).toBeTruthy();
      expect(result!.status).toBe("done");

      await Bun.sleep(300);
      expect(closeCallsFor(fake, paneId)).toBe(closesBefore);
      fake.setPaneReadText(paneId, null);
    },
    20_000,
  );

  test(
    "⑥b failure-path close (inject_unconfirmed) still runs under keep",
    async () => {
      // With keep, only *new* auto closes are disabled — inject_unconfirmed
      // failure path still closes. Simulate by never reaching working and
      // exhausting verify (discard injects + short retries).
      // Reuse a dedicated bridge would be cleaner; here we rely on verify
      // fail-visible which is independent of paneCleanup.
      // Note: this suite's bridge uses submitVerify retries:1 waitMs:250 —
      // discardInjects → probe miss → reinject once → still miss → fail.
      const cardId = "task_a023800000000006b";
      fake.setDiscardInjects(true);
      const panesBefore = new Set(fake.listPaneIds());
      try {
        await tower!.handoff({
          to: "@node/wsl-1",
          body: buildDispatchBody({
            title: "keep-fail",
            cardId,
            node: "node/wsl-1",
          }),
          mode: "task",
          attachments: [
            serializeCardAttachment(CARD_DISPATCH_LABEL, {
              v: CARD_CONTRACT_VERSION,
              cardId,
              sourceRoomId: towerSession.roomId,
              prompt: "keep-mode-inject-fail-path",
              agentKind: "claude",
            }),
          ],
        });
        const ready = await waitForLocal(
          () => fake.listPaneIds().some((p) => !panesBefore.has(p)),
        );
        expect(ready).toBe(true);
        const paneId = fake.listPaneIds().find((p) => !panesBefore.has(p))!;

        const result = await awaitCardResult(cardId, 15_000);
        expect(result).toBeTruthy();
        expect(result!.status).toBe("failed");
        expect(result!.reason).toBe("inject_unconfirmed");

        const closed = await waitForLocal(
          () => closeCallsFor(fake, paneId) >= 1,
          5_000,
        );
        expect(closed).toBe(true);
      } finally {
        fake.setDiscardInjects(false);
      }
    },
    30_000,
  );
});

describe("PLAN 0.23.8 sendResult failure → no close (⑦)", () => {
  const port = 23480 + Math.floor(Math.random() * 200);
  const dir = join(tmpdir(), `loom-pane-sendfail-${Date.now()}`);
  const sessionFile = join(dir, "session.json");
  const towerSessionFile = join(dir, "tower-session.json");
  const herdrSock = join(dir, "herdr.sock");
  const relay = new RelayServer({ host: "127.0.0.1", port });

  let fake: FakeHerdr;
  let bridge: BridgeRuntime | null = null;
  let tower: RelayClient | null = null;
  let session: FableSession;
  let towerSession: FableSession;

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
      autoStatus: "none",
    });

    tower = new RelayClient({ url: `ws://127.0.0.1:${port}/ws` });
    const created = await tower.createRoom({
      roomName: "pane-sendfail",
      displayName: "tower",
      agentKind: "shell",
      peerId: "p_tower",
    });
    if (created.type !== "room.state") throw new Error("create failed");
    const inviteCode = created.inviteCode ?? "";
    const towerSecret = created.peerSecret ?? tower.peerSecret;

    towerSession = {
      roomId: created.roomId,
      roomName: "pane-sendfail",
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

    session = {
      roomId: created.roomId,
      roomName: "pane-sendfail",
      inviteCode,
      peerId: "p_node",
      displayName: "node/wsl-1",
      color: "#0f0",
      agentKind: "shell",
      relayUrl: `ws://127.0.0.1:${port}/ws`,
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(sessionFile, JSON.stringify(session), "utf8");

    process.env.LOOM_SESSION = sessionFile;
    resetStateHomeDirCache();

    bridge = await startBridgeRuntime({
      session,
      profile: "node-sendfail",
      config: {
        authorizedDispatchers: ["p_tower"],
        herdrSocketPath: herdrSock,
        agentArgv: { claude: ["claude"] },
        herdrProtocol: 16,
        paneCleanup: "auto",
      },
      herdr: new HerdrClient({
        socketPath: herdrSock,
        submitDelayMs: 0,
      }),
      submitVerify: { waitMs: 250, retries: 1 },
      settleMs: 15,
    });

    await Bun.sleep(150);
  });

  afterAll(async () => {
    if (bridge) await bridge.stop();
    tower?.close();
    await fake.close();
    try {
      relay.stop();
    } catch {
      /* */
    }
    delete process.env.LOOM_TEST_HOME;
    delete process.env.LOOM_SESSION;
    resetStateHomeDirCache();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* */
    }
  });

  test(
    "⑦ sendResult fails (relay down) → no pane.close",
    async () => {
      const cardId = "task_a023800000000007";
      const panesBefore = new Set(fake.listPaneIds());
      await tower!.handoff({
        to: "@node/wsl-1",
        body: buildDispatchBody({
          title: "sendfail",
          cardId,
          node: "node/wsl-1",
        }),
        mode: "task",
        attachments: [
          serializeCardAttachment(CARD_DISPATCH_LABEL, {
            v: CARD_CONTRACT_VERSION,
            cardId,
            sourceRoomId: towerSession.roomId,
            prompt: "send-result-fail",
            agentKind: "claude",
          }),
        ],
      });
      const ready = await waitFor(
        () => fake.listPaneIds().some((p) => !panesBefore.has(p)),
        { timeoutMs: 8_000 },
      );
      expect(ready).toBe(true);
      const paneId = fake.listPaneIds().find((p) => !panesBefore.has(p))!;
      const closesBefore = closeCallsFor(fake, paneId);

      fake.setPaneReadText(paneId, DONE_BODY);

      // Kill relay so card result handoff throws → sendResult returns false.
      relay.stop();
      await Bun.sleep(50);

      fake.pushEvent("pane_agent_status_changed", {
        pane_id: paneId,
        agent_status: "working",
      });
      fake.pushEvent("pane_agent_status_changed", {
        pane_id: paneId,
        agent_status: "idle",
      });

      // Give finishCard time to attempt send + skip close.
      await Bun.sleep(800);
      expect(closeCallsFor(fake, paneId)).toBe(closesBefore);
      fake.setPaneReadText(paneId, null);
    },
    20_000,
  );
});
