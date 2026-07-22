/**
 * PLAN 0.23.8 / 0.28.0 — worker pane cleanup + verification proposal contracts.
 * v0.28.0 U3: card auto pane.close is 0; success path emits failed/needs_verification.
 * paneCleanup "auto" remains conv-only; card worker panes are preserved.
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
import { addTask, updateTask, findTask } from "./task-board";
import { applyCardResult } from "./card-ops";

type CardResult = {
  status?: string;
  reason?: string;
  note?: string;
  output?: string;
  summary?: string;
  cardId?: string;
  paneId?: string;
  dispatchHandoffId?: string;
  seq?: number;
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

  type CollectedCardResult = {
    result: CardResult;
    /** Raw attachment content — use for applyCardResult (never reconstruct). */
    raw: string;
  };

  function listMatchingCardResults(cardId: string, inbox: Awaited<ReturnType<RelayClient["listInbox"]>>): CollectedCardResult[] {
    const matches: CollectedCardResult[] = [];
    for (const e of inbox) {
      for (const att of e.handoff.attachments ?? []) {
        if (
          att.label === CARD_RESULT_LABEL &&
          att.content.includes(cardId)
        ) {
          matches.push({
            result: JSON.parse(att.content) as CardResult,
            raw: att.content,
          });
        }
      }
    }
    return matches;
  }

  /**
   * Collect matching card results with settle-window exact-count observability.
   * PATCH 4 M4: first-match-only helpers must not claim exact-one — after the
   * first observation, wait ~280ms and re-read so a late duplicate is visible.
   */
  async function collectCardResults(
    cardId: string,
    timeoutMs = 12_000,
  ): Promise<CollectedCardResult[]> {
    if (!tower) return [];
    const deadline = Date.now() + timeoutMs;
    let matches: CollectedCardResult[] = [];
    while (Date.now() < deadline) {
      const inbox = await tower.listInbox();
      matches = listMatchingCardResults(cardId, inbox);
      if (matches.length >= 1) {
        // Settle window: late duplicates must be observable before claiming count.
        await Bun.sleep(280);
        const settled = await tower.listInbox();
        return listMatchingCardResults(cardId, settled);
      }
      await Bun.sleep(80);
    }
    return matches;
  }

  async function awaitCardResult(
    cardId: string,
    timeoutMs = 12_000,
  ): Promise<CardResult | null> {
    const matches = await collectCardResults(cardId, timeoutMs);
    return matches[0]?.result ?? null;
  }

  /**
   * Wait for at least `exact` matches, settle, re-read, return final list.
   * Caller asserts final length === exact (detection power for duplicates).
   */
  async function awaitExactCardResults(
    cardId: string,
    exact: number,
    timeoutMs = 12_000,
  ): Promise<CollectedCardResult[]> {
    if (!tower) return [];
    const deadline = Date.now() + timeoutMs;
    let matches: CollectedCardResult[] = [];
    while (Date.now() < deadline) {
      const inbox = await tower.listInbox();
      matches = listMatchingCardResults(cardId, inbox);
      if (matches.length >= exact) {
        await Bun.sleep(280);
        const settled = await tower.listInbox();
        return listMatchingCardResults(cardId, settled);
      }
      await Bun.sleep(80);
    }
    return matches;
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

  /** Returns the real dispatch handoff ack id (bind board.task.handoffId to this). */
  async function dispatchCard(
    cardId: string,
    prompt: string,
  ): Promise<string> {
    const ack = await tower!.handoff({
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
    return ack.handoffId;
  }

  async function spawnCard(
    cardId: string,
    prompt: string,
  ): Promise<{ paneId: string; dispatchHandoffId: string }> {
    const panesBefore = new Set(fake.listPaneIds());
    const dispatchHandoffId = await dispatchCard(cardId, prompt);
    const ready = await waitFor(
      () => fake.listPaneIds().some((p) => !panesBefore.has(p)),
      { timeoutMs: 8_000 },
    );
    expect(ready).toBe(true);
    const paneId = fake.listPaneIds().find((p) => !panesBefore.has(p))!;
    // Branch benefit: wait for per-pane status subscription before driving events.
    const subscribed = await waitFor(
      () => hasPaneStatusSubscription(paneId),
      { timeoutMs: 5_000 },
    );
    expect(subscribed).toBe(true);
    return { paneId, dispatchHandoffId };
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

  async function fetchBridgeStatus(): Promise<{
    preservedCardPanes?: number;
    quarantineUnresolved?: number;
    paneCleanup?: string;
  }> {
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
    return (await res.json()) as {
      preservedCardPanes?: number;
      quarantineUnresolved?: number;
      paneCleanup?: string;
    };
  }

  // PLAN 0.28.0 M5 — preservedCardPanes observation (process-local count only).
  // These run first so the shared fixture has not yet preserved any card panes.
  test("M5 preservedCardPanes: initial live status count is 0", async () => {
    const st = await fetchBridgeStatus();
    expect(st.preservedCardPanes).toBe(0);
    expect(typeof st.quarantineUnresolved).toBe("number");
  });

  test(
    "M5 preservedCardPanes: after accepted real-relay card result count is 1",
    async () => {
      const before = await fetchBridgeStatus();
      expect(before.preservedCardPanes).toBe(0);

      // TaskIdSchema: /^task_[a-f0-9]+$/i
      const cardId = "task_a028000000000005";
      const { paneId } = await spawnCard(cardId, "m5-preserved-count");
      fake.setPaneReadText(paneId, DONE_BODY);
      emitWorkingThen(paneId, "idle");

      const collected = await awaitExactCardResults(cardId, 1, 12_000);
      expect(collected).toHaveLength(1);
      const result = collected[0]!.result;
      expect(result.status).toBe("failed");
      expect(result.reason).toBe("needs_verification");
      expect(result.paneId).toBe(paneId);

      await Bun.sleep(200);
      expect(fake.listPaneIds()).toContain(paneId);
      expect(closeCallsFor(fake, paneId)).toBe(0);

      const after = await fetchBridgeStatus();
      expect(after.preservedCardPanes).toBe(1);
      fake.setPaneReadText(paneId, null);
    },
    20_000,
  );

  test(
    "③a expected-red: completion card pane remains present after terminal receipt",
    async () => {
      const cardId = "task_a023800000000001";
      const { paneId } = await spawnCard(cardId, "pane-cleanup-immediate");
      fake.setPaneReadText(paneId, DONE_BODY);
      emitWorkingThen(paneId, "idle");

      const result = await awaitCardResult(cardId);
      expect(result).toBeTruthy();
      expect(result!.status).toBe("failed");
      expect(result!.reason).toBe("needs_verification");
      expect(result!.output).toContain("IMPL-MARKER-COMPLETE");

      // Quiesce first; then directly observe the actual pane membership.
      await Bun.sleep(250);
      expect(fake.listPaneIds()).toContain(paneId);
      fake.setPaneReadText(paneId, null);
    },
    20_000,
  );

  test(
    "② deferral clear → proposal + pane preserved",
    async () => {
      const cardId = "task_a023800000000002";
      const { paneId } = await spawnCard(cardId, "pane-cleanup-defer-clear");

      fake.setPaneReadText(paneId, STILL_LINE);
      emitWorkingThen(paneId, "idle");

      await Bun.sleep(POLL_MS + SETTLE_MS * 3 + 40);
      fake.setPaneReadText(paneId, DONE_BODY);

      const results = await awaitExactCardResults(cardId, 1);
      expect(results).toHaveLength(1);
      const result = results[0]!.result;
      expect(result.status).toBe("failed");
      expect(result.reason).toBe("needs_verification");
      expect(result.note).toMatch(/completion deferred/);

      await Bun.sleep(250);
      expect(fake.listPaneIds()).toContain(paneId);
      expect(closeCallsFor(fake, paneId)).toBe(0);
      fake.setPaneReadText(paneId, null);
    },
    20_000,
  );

  test(
    "③ exhausted → proposal + pane preserved",
    async () => {
      const cardId = "task_a023800000000003";
      const { paneId } = await spawnCard(cardId, "pane-cleanup-exhausted");

      fake.setPaneReadText(paneId, STILL_LINE);
      emitWorkingThen(paneId, "idle");

      const results = await awaitExactCardResults(cardId, 1, 8_000);
      expect(results).toHaveLength(1);
      const result = results[0]!.result;
      expect(result.status).toBe("failed");
      expect(result.reason).toBe("needs_verification");
      expect(result.note).toMatch(/still_running deferral exhausted/);

      await Bun.sleep(200);
      expect(fake.listPaneIds()).toContain(paneId);
      expect(closeCallsFor(fake, paneId)).toBe(0);
      fake.setPaneReadText(paneId, null);
    },
    20_000,
  );

  test(
    "④ agent_blocked failed → pane preserved (failure path keeps pane)",
    async () => {
      const cardId = "task_a023800000000004";
      const { paneId } = await spawnCard(cardId, "pane-cleanup-blocked");

      emitWorkingThen(paneId, "blocked");

      const result = await awaitCardResult(cardId);
      expect(result).toBeTruthy();
      expect(result!.status).toBe("failed");
      expect(result!.reason).toBe("agent_blocked");

      await Bun.sleep(200);
      expect(fake.listPaneIds()).toContain(paneId);
      expect(closeCallsFor(fake, paneId)).toBe(0);
    },
    20_000,
  );

  test(
    "accepted (b) real-relay: exact-one proposal + stamps + board blocked + pane preserved",
    async () => {
      // Design §4.2 accepted (b): wire reach is the only place "was it delivered?" is observable.
      // Seed board task first; dispatch uses task.id as cardId so apply is a direct findTask hit.
      process.env.LOOM_SESSION = towerSessionFile;
      resetStateHomeDirCache();
      const task = addTask({
        title: "accepted-b",
        assignee: "node/wsl-1",
        status: "doing",
      });
      const cardId = task.id;
      process.env.LOOM_SESSION = sessionFile;
      resetStateHomeDirCache();

      // Dispatch first so we can bind board.handoffId BEFORE completion/result emission.
      const panesBefore = new Set(fake.listPaneIds());
      const dispatchHandoffId = await dispatchCard(
        cardId,
        "accepted-b-real-relay",
      );
      process.env.LOOM_SESSION = towerSessionFile;
      resetStateHomeDirCache();
      updateTask(cardId, {
        assignee: "node/wsl-1",
        handoffId: dispatchHandoffId,
        status: "doing",
      });
      process.env.LOOM_SESSION = sessionFile;
      resetStateHomeDirCache();

      const ready = await waitFor(
        () => fake.listPaneIds().some((p) => !panesBefore.has(p)),
        { timeoutMs: 8_000 },
      );
      expect(ready).toBe(true);
      const paneId = fake.listPaneIds().find((p) => !panesBefore.has(p))!;
      const subscribed = await waitFor(
        () => hasPaneStatusSubscription(paneId),
        { timeoutMs: 5_000 },
      );
      expect(subscribed).toBe(true);

      fake.setPaneReadText(paneId, DONE_BODY);
      emitWorkingThen(paneId, "idle");

      const collected = await awaitExactCardResults(cardId, 1, 12_000);
      // Settle re-read already applied inside helper — exact-one must hold post-settle.
      expect(collected).toHaveLength(1);
      const result = collected[0]!.result;
      const rawPayload = collected[0]!.raw;
      expect(result.cardId).toBe(cardId);
      expect(result.status).toBe("failed");
      expect(result.reason).toBe("needs_verification");
      // Real summary from DONE_BODY is the last non-timing line: [IMPL-0238-DONE]
      expect(result.summary).toBe("[IMPL-0238-DONE]");
      expect(result.output).toContain("[IMPL-0238-DONE]");
      expect(result.output).toContain("IMPL-MARKER-COMPLETE");
      expect(result.dispatchHandoffId).toBe(dispatchHandoffId);
      expect(typeof result.seq).toBe("number");
      expect(result.seq as number).toBeGreaterThanOrEqual(1);

      process.env.LOOM_SESSION = towerSessionFile;
      resetStateHomeDirCache();
      // Apply the *actual received* CARD_RESULT payload — do not reconstruct.
      const applied = applyCardResult({
        resultJson: rawPayload,
      });
      expect(applied.ok).toBe(true);
      if (applied.ok) {
        expect(applied.status).toBe("blocked");
        expect(applied.task.notes).toContain(`last_seq=${result.seq}`);
        expect(applied.task.notes).toContain("needs_verification");
      }
      expect(findTask(cardId)?.status).toBe("blocked");
      process.env.LOOM_SESSION = sessionFile;
      resetStateHomeDirCache();

      await Bun.sleep(250);
      expect(fake.listPaneIds()).toContain(paneId);
      expect(closeCallsFor(fake, paneId)).toBe(0);
      fake.setPaneReadText(paneId, null);
    },
    25_000,
  );

  test(
    "③c expected-red: events-subscribe failure card pane remains present",
    async () => {
      const failureSock = join(dir, "herdr-subscribe-failure.sock");
      const failureFake = await startFakeHerdr({
        socketPath: failureSock,
        autoStatus: "none",
        // First subscribe is bridge-global; the card subscription takes 1305.
        subscribeFailFromCall: 2,
        subscribeFailCount: 1,
      });
      const failureSession: FableSession = {
        ...session,
        peerId: "p_node_subscribe_failure",
        displayName: "node/subscribe-failure",
        peerSecret: undefined,
      };
      let failureBridge: BridgeRuntime | null = null;
      const cardId = "task_a023800000000003c";
      try {
        failureBridge = await startBridgeRuntime({
          session: failureSession,
          profile: "node-subscribe-failure",
          config: {
            authorizedDispatchers: ["p_tower"],
            herdrSocketPath: failureSock,
            agentArgv: { claude: ["claude"] },
            herdrProtocol: 16,
          },
          herdr: new HerdrClient({ socketPath: failureSock, submitDelayMs: 0 }),
          submitVerify: { waitMs: 100, retries: 0 },
        });
        await tower!.handoff({
          to: "@node/subscribe-failure",
          body: buildDispatchBody({
            title: "subscribe failure retains pane",
            cardId,
            node: "node/subscribe-failure",
          }),
          mode: "task",
          attachments: [serializeCardAttachment(CARD_DISPATCH_LABEL, {
            v: CARD_CONTRACT_VERSION,
            cardId,
            sourceRoomId: towerSession.roomId,
            prompt: "subscribe failure",
            agentKind: "claude",
          })],
        });
        const result = await awaitCardResult(cardId);
        expect(result).toBeTruthy();
        expect(result!.status).toBe("failed");
        expect(result!.reason).toBe("events_subscribe_failed");
        const paneIds = failureFake.calls.flatMap((call) => {
          if (call.method !== "events.subscribe") return [];
          const subscriptions = call.params.subscriptions;
          if (!Array.isArray(subscriptions)) return [];
          return subscriptions.flatMap((subscription) =>
            typeof subscription === "object" &&
            subscription !== null &&
            "pane_id" in subscription &&
            typeof subscription.pane_id === "string"
              ? [subscription.pane_id]
              : [],
          );
        });
        expect(paneIds).toHaveLength(1);
        const paneId = paneIds[0]!;
        expect(paneId).not.toBe("");
        await Bun.sleep(250);
        // Direct membership ties preservation to this failed card subscription.
        expect(failureFake.listPaneIds()).toContain(paneId);
      } finally {
        if (failureBridge) await failureBridge.stop();
        await failureFake.close();
      }
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
    "⑧ pane.close reject is no-op for cards; proposal still delivered + pane preserved",
    async () => {
      // U3 removed card auto-close; setPaneCloseFail is no-op for the card path.
      // Contract: result still delivered, pane remains.
      const cardId = "task_a023800000000008";
      const { paneId } = await spawnCard(cardId, "pane-cleanup-close-reject");
      fake.setPaneCloseFail(true);
      try {
        fake.setPaneReadText(paneId, DONE_BODY);
        emitWorkingThen(paneId, "idle");

        const results = await awaitExactCardResults(cardId, 1);
        expect(results).toHaveLength(1);
        expect(results[0]!.result.status).toBe("failed");
        expect(results[0]!.result.reason).toBe("needs_verification");
        expect(results[0]!.result.output).toContain("IMPL-MARKER-COMPLETE");
        await Bun.sleep(250);
        expect(fake.listPaneIds()).toContain(paneId);
        expect(closeCallsFor(fake, paneId)).toBe(0);
      } finally {
        fake.setPaneCloseFail(false);
        fake.setPaneReadText(paneId, null);
      }
    },
    20_000,
  );

  test(
    "⑭ settle-fail fallback → proposal/failure + pane preserved",
    async () => {
      const cardId = "task_a023800000000014";
      const { paneId } = await spawnCard(cardId, "pane-cleanup-settle-fail");

      // Force settlePaneRead (up to 3 reads) to fail entirely → beginCardCompletion
      // fallthrough propose without close.
      fake.failPaneReads(12);
      try {
        emitWorkingThen(paneId, "idle");

        const result = await awaitCardResult(cardId);
        expect(result).toBeTruthy();
        // pane.read failure still yields a failed proposal (no done authority)
        expect(result!.status).toBe("failed");

        await Bun.sleep(200);
        expect(fake.listPaneIds()).toContain(paneId);
        expect(closeCallsFor(fake, paneId)).toBe(0);
      } finally {
        // Clear residual fail budget so later tests are not polluted.
        fake.failPaneReads(0);
      }
    },
    20_000,
  );

  test(
    "⑬ regression: normal completion still delivers proposal (pane preserved)",
    async () => {
      fake.failPaneReads(0);
      const cardId = "task_a023800000000013";
      const { paneId } = await spawnCard(cardId, "pane-cleanup-regression");
      fake.setPaneReadText(paneId, "simple done output line");
      emitWorkingThen(paneId, "idle");

      const results = await awaitExactCardResults(cardId, 1);
      expect(results).toHaveLength(1);
      expect(results[0]!.result.status).toBe("failed");
      expect(results[0]!.result.reason).toBe("needs_verification");
      expect(results[0]!.result.output).toContain("simple done output line");
      await Bun.sleep(200);
      expect(fake.listPaneIds()).toContain(paneId);
      expect(closeCallsFor(fake, paneId)).toBe(0);
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
    let last: CardResult | null = null;
    while (Date.now() < deadline) {
      const inbox = await tower.listInbox();
      const matches: CardResult[] = [];
      for (const e of inbox) {
        for (const att of e.handoff.attachments ?? []) {
          if (
            att.label === CARD_RESULT_LABEL &&
            att.content.includes(cardId)
          ) {
            matches.push(JSON.parse(att.content) as CardResult);
          }
        }
      }
      if (matches.length >= 1) {
        last = matches[0]!;
        // exact-count is observable via matches.length for callers that need it
        return last;
      }
      await Bun.sleep(80);
    }
    return last;
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
    "⑥ paneCleanup keep → completion proposal + pane preserved (card path)",
    async () => {
      // paneCleanup keep is conv-only under U3; card panes are always preserved.
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
      expect(result!.status).toBe("failed");
      expect(result!.reason).toBe("needs_verification");

      await Bun.sleep(300);
      expect(fake.listPaneIds()).toContain(paneId);
      expect(closeCallsFor(fake, paneId)).toBe(0);
      fake.setPaneReadText(paneId, null);
    },
    20_000,
  );

  test(
    "③b expected-red: inject_unconfirmed card pane remains present",
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

        await Bun.sleep(250);
        expect(fake.listPaneIds()).toContain(paneId);
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
