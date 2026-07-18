/**
 * PLAN 0.23.4 — HerdrClient event subscription lifecycle + bridge fail-visible paths.
 * Tests ①–⑭ from docs/PLAN.md changelog 0.23.4.
 */
import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { RelayServer } from "@loom/relay";
import {
  CARD_CONTRACT_VERSION,
  CARD_DISPATCH_LABEL,
  CARD_RESULT_LABEL,
  CONV_CONTRACT_VERSION,
  CONV_TURN_LABEL,
  buildDispatchBody,
  serializeCardAttachment,
  generateConvId,
} from "@loom/protocol";
import { RelayClient } from "./relay-client";
import { HerdrClient } from "./herdr-client";
import { startFakeHerdr } from "./fake-herdr";
import { startBridgeRuntime } from "./bridge-runtime";
import type { BridgeConfig } from "./bridge-config";
import {
  resetStateHomeDirCache,
  setActiveProfile,
  type FableSession,
} from "./session-store";
import { convOpen } from "./conv-ops";

// ---------------------------------------------------------------------------
// Unit: HerdrClient ①–⑥, ⑫–⑭
// ---------------------------------------------------------------------------

describe("HerdrClient subscription lifecycle (0.23.4 unit)", () => {
  const sock = join(tmpdir(), `herdr-life-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.sock`);
  let fake: Awaited<ReturnType<typeof startFakeHerdr>>;

  beforeAll(async () => {
    fake = await startFakeHerdr({
      socketPath: sock,
      autoStatus: "none",
    });
  });

  afterAll(async () => {
    await fake.close();
  });

  test("① prune removes closed pane from next subscribe payload", async () => {
    const c = new HerdrClient({ socketPath: sock, timeoutMs: 3_000 });
    await c.eventsSubscribe([
      { type: "pane.agent_status_changed", pane_id: "w1:pA" },
      { type: "pane.agent_status_changed", pane_id: "w1:pB" },
    ]);
    c.eventsPrune("w1:pA");
    const before = fake.calls.filter((x) => x.method === "events.subscribe").length;
    await c.eventsSubscribe([
      { type: "pane.agent_status_changed", pane_id: "w1:pC" },
    ]);
    const subCalls = fake.calls.filter((x) => x.method === "events.subscribe");
    expect(subCalls.length).toBeGreaterThan(before);
    const last = subCalls[subCalls.length - 1]!;
    const subs = last.params.subscriptions as { type: string; pane_id?: string }[];
    expect(subs.some((s) => s.pane_id === "w1:pA")).toBe(false);
    expect(subs.some((s) => s.pane_id === "w1:pB")).toBe(true);
    expect(subs.some((s) => s.pane_id === "w1:pC")).toBe(true);
    c.close();
  });

  test("② pre-ACK close rejects eventsSubscribe", async () => {
    const badSock = join(tmpdir(), `herdr-preack-${Date.now()}.sock`);
    const bad = await startFakeHerdr({
      socketPath: badSock,
      autoStatus: "none",
      subscribeMode: "pre_ack_close",
    });
    const c = new HerdrClient({ socketPath: badSock, timeoutMs: 2_000 });
    await expect(
      c.eventsSubscribe([{ type: "pane.agent_status_changed", pane_id: "w1:px" }]),
    ).rejects.toThrow(/closed before subscribe ACK|connection closed/i);
    c.close();
    await bad.close();
  });

  test("③ ACK timeout rejects eventsSubscribe", async () => {
    const badSock = join(tmpdir(), `herdr-timeout-${Date.now()}.sock`);
    const bad = await startFakeHerdr({
      socketPath: badSock,
      autoStatus: "none",
      subscribeMode: "never_ack",
    });
    const c = new HerdrClient({ socketPath: badSock, timeoutMs: 80 });
    await expect(
      c.eventsSubscribe([{ type: "pane.agent_status_changed", pane_id: "w1:py" }]),
    ).rejects.toThrow(/timed out/i);
    c.close();
    await bad.close();
  });

  test("④ after prune, backoff reconnect payload omits closed pane", async () => {
    // Real path: established stream is force-dropped → scheduleEventReconnect
    // reopens with the *stored* list (not a fresh eventsSubscribe call).
    const c = new HerdrClient({ socketPath: sock, timeoutMs: 3_000 });
    await c.eventsSubscribe([
      { type: "pane.agent_status_changed", pane_id: "w1:p1" },
      { type: "pane.agent_status_changed", pane_id: "w1:p2" },
    ]);
    expect(c.eventConnected).toBe(true);
    c.eventsPrune("w1:p1");
    expect(c.eventConnected).toBe(true); // prune-without-reopen keeps socket

    const before = fake.calls.filter((x) => x.method === "events.subscribe").length;
    // Server-side force disconnect of the established event socket.
    fake.disconnectEventSockets();

    // EVENT_RECONNECT_BASE_MS = 500; wait for backoff reconnect to fire.
    let reconnected = false;
    for (let i = 0; i < 40; i++) {
      await Bun.sleep(50);
      const subCalls = fake.calls.filter((x) => x.method === "events.subscribe");
      if (subCalls.length > before && c.eventConnected) {
        reconnected = true;
        break;
      }
    }
    expect(reconnected).toBe(true);

    const subCalls = fake.calls.filter((x) => x.method === "events.subscribe");
    expect(subCalls.length).toBeGreaterThan(before);
    const last = subCalls[subCalls.length - 1]!;
    const subs = last.params.subscriptions as { pane_id?: string }[];
    expect(subs.some((s) => s.pane_id === "w1:p1")).toBe(false);
    expect(subs.some((s) => s.pane_id === "w1:p2")).toBe(true);
    c.close();
  });

  test("⑤ last prune closes socket + cancels reconnect (unit, no global — R29 L-5)", async () => {
    const c = new HerdrClient({ socketPath: sock, timeoutMs: 3_000 });
    await c.eventsSubscribe([
      { type: "pane.agent_status_changed", pane_id: "w1:only" },
    ]);
    expect(c.eventConnected).toBe(true);
    expect(c.eventSubscriptions).toBe(1);
    const before = fake.calls.filter((x) => x.method === "events.subscribe").length;
    c.eventsPrune("w1:only");
    expect(c.eventSubscriptions).toBe(0);
    expect(c.eventConnected).toBe(false);
    // Wait past reconnect base (500ms) — no new subscribe should fire.
    await Bun.sleep(700);
    const after = fake.calls.filter((x) => x.method === "events.subscribe").length;
    expect(after).toBe(before);
    c.close();
  });

  test("⑥ global pane.closed is not pruned; survives two card panes", async () => {
    const c = new HerdrClient({ socketPath: sock, timeoutMs: 3_000 });
    await c.eventsSubscribe([{ type: "pane.closed" }]);
    await c.eventsSubscribe([
      { type: "pane.agent_status_changed", pane_id: "w1:c1" },
    ]);
    await c.eventsSubscribe([
      { type: "pane.agent_status_changed", pane_id: "w1:c2" },
    ]);
    c.eventsPrune("w1:c1");
    c.eventsPrune("w1:c2");
    const snap = c.getSubscriptionSnapshot();
    expect(snap.filter((s) => s.type === "pane.closed")).toHaveLength(1);
    expect(snap.every((s) => s.pane_id === undefined || s.type === "pane.closed")).toBe(
      true,
    );
    expect(c.eventSubscriptions).toBe(1);
    c.close();
  });

  test("⑫ close() clears list, timers, and connection", async () => {
    const c = new HerdrClient({ socketPath: sock, timeoutMs: 3_000 });
    await c.eventsSubscribe([
      { type: "pane.closed" },
      { type: "pane.agent_status_changed", pane_id: "w1:z" },
    ]);
    expect(c.eventSubscriptions).toBe(2);
    expect(c.eventConnected).toBe(true);
    c.close();
    expect(c.eventSubscriptions).toBe(0);
    expect(c.eventConnected).toBe(false);
    expect(c.getSubscriptionSnapshot()).toEqual([]);
  });

  test("⑬ M-1 rollback: failed subscribe does not leave new pane in list", async () => {
    const badSock = join(tmpdir(), `herdr-m1-${Date.now()}.sock`);
    // First call succeeds (seed), later fail — use two clients on same sock with modes.
    const bad = await startFakeHerdr({
      socketPath: badSock,
      autoStatus: "none",
      subscribeMode: "normal",
    });
    const c = new HerdrClient({ socketPath: badSock, timeoutMs: 2_000 });
    await c.eventsSubscribe([{ type: "pane.closed" }]);
    expect(c.eventSubscriptions).toBe(1);

    // Switch server to pre-ack close for subsequent subscribes by restarting
    // with fail-from-call. Easier: close and use a fail-from-call server.
    c.close();
    await bad.close();

    const bad2Sock = join(tmpdir(), `herdr-m1b-${Date.now()}.sock`);
    const bad2 = await startFakeHerdr({
      socketPath: bad2Sock,
      autoStatus: "none",
      subscribeFailFromCall: 2, // 1st (global) OK
      subscribeFailCount: 1, // only the next subscribe fails, then recover
    });
    const c2 = new HerdrClient({ socketPath: bad2Sock, timeoutMs: 2_000 });
    await c2.eventsSubscribe([{ type: "pane.closed" }]);
    let rejected = false;
    try {
      await c2.eventsSubscribe([
        { type: "pane.agent_status_changed", pane_id: "w1:poison" },
      ]);
    } catch {
      rejected = true;
    }
    expect(rejected).toBe(true);
    const snap = c2.getSubscriptionSnapshot();
    expect(snap.some((s) => s.pane_id === "w1:poison")).toBe(false);
    expect(snap.some((s) => s.type === "pane.closed")).toBe(true);

    // Let any scheduled reconnect from the failed attempt settle first.
    await Bun.sleep(100);

    // Next dispatch subscribe succeeds (no self-reinfection)
    await c2.eventsSubscribe([
      { type: "pane.agent_status_changed", pane_id: "w1:healthy" },
    ]);
    expect(c2.eventConnected).toBe(true);
    const last = bad2.calls.filter((x) => x.method === "events.subscribe").at(-1)!;
    const subs = last.params.subscriptions as { pane_id?: string }[];
    expect(subs.some((s) => s.pane_id === "w1:poison")).toBe(false);
    expect(subs.some((s) => s.pane_id === "w1:healthy")).toBe(true);
    c2.close();
    await bad2.close();
  });

  test("⑭ L-4: ACK timer cleared — socket survives past timeoutMs (real short timer)", async () => {
    // Bun fake timers do not retroactively control already-scheduled timers;
    // use a short real timeoutMs and wait past it.
    const c = new HerdrClient({ socketPath: sock, timeoutMs: 60 });
    const events: unknown[] = [];
    c.setOnEvent((event, data) => events.push({ event, data }));
    await c.eventsSubscribe([{ type: "pane.agent_status_changed", pane_id: "w1:t14" }]);
    expect(c.eventConnected).toBe(true);
    expect(c.lastSubscribeAck).toBeTruthy();

    // If the ACK timer were not cleared on settle, waiting past timeoutMs
    // would destroy the socket and drop subsequent event delivery.
    await Bun.sleep(100);

    expect(c.eventConnected).toBe(true);
    fake.pushEvent("pane_agent_status_changed", {
      pane_id: "w1:t14",
      agent_status: "working",
    });
    await Bun.sleep(40);
    expect(events.length).toBeGreaterThanOrEqual(1);
    c.close();
  });
});

// ---------------------------------------------------------------------------
// Bridge integration: ⑦–⑪, ⑨
// ---------------------------------------------------------------------------

describe("bridge subscription fail-visible + prune (0.23.4)", () => {
  test("⑦ card eventsSubscribe fail → events_subscribe_failed + flights cleared", async () => {
    const port = 22000 + Math.floor(Math.random() * 400);
    const dir = join(tmpdir(), `loom-sub-fail-${Date.now()}`);
    const sessionFile = join(dir, "session.json");
    const herdrSock = join(dir, "herdr.sock");
    const relay = new RelayServer({ host: "127.0.0.1", port });
    mkdirSync(dir, { recursive: true });
    process.env.LOOM_TEST_HOME = dir;
    process.env.LOOM_SESSION = sessionFile;
    process.env.LOOM_NO_AUTO_HOST = "1";
    resetStateHomeDirCache();
    setActiveProfile(null);
    relay.start();
    // Call 1 = global pane.closed at bridge start; call 2+ = card fail
    const fake = await startFakeHerdr({
      socketPath: herdrSock,
      autoStatus: "none",
      subscribeFailFromCall: 2,
      subscribeFailCount: 1,
    });
    const tower = new RelayClient({ url: `ws://127.0.0.1:${port}/ws` });
    const created = await tower.createRoom({
      roomName: "sub-fail",
      displayName: "tower",
      agentKind: "shell",
      peerId: "p_tower",
    });
    if (created.type !== "room.state") throw new Error("create failed");
    const session: FableSession = {
      roomId: created.roomId,
      roomName: "sub-fail",
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
      herdrProtocol: 16,
    };
    const herdr = new HerdrClient({ socketPath: herdrSock, submitDelayMs: 0, timeoutMs: 2_000 });
    const bridge = await startBridgeRuntime({
      session,
      profile: "node-subfail",
      config: cfg,
      herdr,
      submitVerify: { waitMs: 200, retries: 0 },
    });

    const cardId = "task_ab11cd22ef334455";
    await tower.handoff({
      to: "@node/wsl-1",
      body: buildDispatchBody({ title: "fail", cardId, node: "node/wsl-1" }),
      mode: "task",
      attachments: [
        serializeCardAttachment(CARD_DISPATCH_LABEL, {
          v: CARD_CONTRACT_VERSION,
          cardId,
          sourceRoomId: session.roomId,
          prompt: "nope",
          agentKind: "claude",
        }),
      ],
    });

    let result: { status?: string; summary?: string } | null = null;
    for (let i = 0; i < 50; i++) {
      await Bun.sleep(100);
      const inbox = await tower.listInbox();
      const hit = inbox.find((e) =>
        e.handoff.attachments?.some((a) => a.label === CARD_RESULT_LABEL),
      );
      if (hit) {
        const content = hit.handoff.attachments!.find(
          (a) => a.label === CARD_RESULT_LABEL,
        )!.content;
        result = JSON.parse(content) as { status: string; summary: string };
        break;
      }
    }
    expect(result).toBeTruthy();
    expect(result!.status).toBe("failed");
    expect(result!.summary ?? "").toContain("events_subscribe_failed");

    // status: inFlight should be 0 after fail-visible cleanup
    const stRes = await fetch(`http://127.0.0.1:${bridge.meta.port}/rpc`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bridge.meta.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ op: "status" }),
    });
    const health = (await stRes.json()) as {
      inFlight: number;
      eventConnected: boolean;
      lastSubscribeAck: string | null;
      eventSubscriptions: number;
    };
    expect(health.inFlight).toBe(0);
    // Global pane.closed still counted
    expect(health.eventSubscriptions).toBeGreaterThanOrEqual(1);
    expect(typeof health.eventConnected).toBe("boolean");
    expect(
      health.lastSubscribeAck === null || typeof health.lastSubscribeAck === "string",
    ).toBe(true);

    await bridge.stop();
    tower.close();
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

  test("⑧ conv eventsSubscribe fail → blocked turn + convFlights cleared", async () => {
    const port = 22400 + Math.floor(Math.random() * 400);
    const dir = join(tmpdir(), `loom-conv-subfail-${Date.now()}`);
    const towerSessionFile = join(dir, "tower-session.json");
    const workerSessionFile = join(dir, "worker-session.json");
    const herdrSock = join(dir, "herdr.sock");
    const relay = new RelayServer({ host: "127.0.0.1", port });
    mkdirSync(dir, { recursive: true });
    process.env.LOOM_TEST_HOME = dir;
    process.env.LOOM_NO_AUTO_HOST = "1";
    resetStateHomeDirCache();
    setActiveProfile(null);
    relay.start();
    const fake = await startFakeHerdr({
      socketPath: herdrSock,
      autoStatus: "none",
      subscribeFailFromCall: 2,
      subscribeFailCount: 1,
    });

    process.env.LOOM_SESSION = towerSessionFile;
    resetStateHomeDirCache();
    const towerClient = new RelayClient({ url: `ws://127.0.0.1:${port}/ws` });
    const created = await towerClient.createRoom({
      roomName: "conv-subfail",
      displayName: "tower",
      agentKind: "shell",
      peerId: "p_tower",
    });
    if (created.type !== "room.state") throw new Error("create failed");
    const towerSession: FableSession = {
      roomId: created.roomId,
      roomName: "conv-subfail",
      inviteCode: created.inviteCode ?? "",
      peerId: "p_tower",
      displayName: "tower",
      color: "#fff",
      agentKind: "shell",
      relayUrl: `ws://127.0.0.1:${port}/ws`,
      peerSecret: created.peerSecret,
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(towerSessionFile, JSON.stringify(towerSession), "utf8");

    const workerSession: FableSession = {
      roomId: created.roomId,
      roomName: "conv-subfail",
      inviteCode: created.inviteCode ?? "",
      peerId: "p_node",
      displayName: "node/wsl-1",
      color: "#0f0",
      agentKind: "shell",
      relayUrl: `ws://127.0.0.1:${port}/ws`,
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(workerSessionFile, JSON.stringify(workerSession), "utf8");

    process.env.LOOM_SESSION = workerSessionFile;
    resetStateHomeDirCache();
    const herdr = new HerdrClient({
      socketPath: herdrSock,
      submitDelayMs: 0,
      timeoutMs: 2_000,
    });
    const bridge = await startBridgeRuntime({
      session: workerSession,
      profile: "node-conv-subfail",
      config: {
        authorizedDispatchers: ["p_tower"],
        herdrSocketPath: herdrSock,
        agentArgv: { claude: ["claude"] },
        herdrProtocol: 16,
      },
      herdr,
      submitVerify: { waitMs: 200, retries: 0 },
    });

    process.env.LOOM_SESSION = towerSessionFile;
    resetStateHomeDirCache();
    const opened = await convOpen({
      node: "node/wsl-1",
      goal: "will fail subscribe",
      agentKind: "claude",
    });
    expect(opened.ok).toBe(true);
    if (!opened.ok) throw new Error("convOpen failed");

    // Wait for blocked turn from worker
    let blocked = false;
    for (let i = 0; i < 50; i++) {
      await Bun.sleep(100);
      const inbox = await towerClient.listInbox();
      const hit = inbox.find((e) =>
        e.handoff.attachments?.some((a) => a.label === CONV_TURN_LABEL),
      );
      if (hit) {
        const content = hit.handoff.attachments!.find(
          (a) => a.label === CONV_TURN_LABEL,
        )!.content;
        const turn = JSON.parse(content) as {
          kind?: string;
          text?: string;
          note?: string;
        };
        if (
          turn.kind === "blocked" ||
          (turn.text ?? "").includes("events_subscribe_failed") ||
          (turn.note ?? "").includes("events_subscribe_failed")
        ) {
          blocked = true;
          break;
        }
        // Also accept body containing the reason
        if (hit.handoff.body.includes("events_subscribe_failed")) {
          blocked = true;
          break;
        }
      }
    }
    // Fallback: parse any turn payload for kind=blocked
    if (!blocked) {
      const inbox = await towerClient.listInbox();
      for (const e of inbox) {
        const att = e.handoff.attachments?.find((a) => a.label === CONV_TURN_LABEL);
        if (!att) continue;
        const turn = JSON.parse(att.content) as { kind?: string; text?: string };
        if (turn.kind === "blocked") {
          blocked = true;
          expect(
            (turn.text ?? e.handoff.body).includes("events_subscribe_failed") ||
              turn.kind === "blocked",
          ).toBe(true);
          break;
        }
      }
    }
    expect(blocked).toBe(true);

    // F-5: cleanup proof — after fail path removed the flight from convFlights,
    // a late pane.closed/status event for that pane must not emit another blocked turn.
    function countBlockedTurns(
      inbox: Awaited<ReturnType<typeof towerClient.listInbox>>,
    ): number {
      let n = 0;
      for (const e of inbox) {
        const att = e.handoff.attachments?.find((a) => a.label === CONV_TURN_LABEL);
        if (!att) continue;
        try {
          const turn = JSON.parse(att.content) as { kind?: string; text?: string };
          if (
            turn.kind === "blocked" ||
            (turn.text ?? "").includes("events_subscribe_failed")
          ) {
            n += 1;
          }
        } catch {
          /* */
        }
      }
      return n;
    }

    const paneId = fake.paneIdForConv(opened.convId);
    expect(paneId).toBeTruthy();
    const blockedBefore = countBlockedTurns(await towerClient.listInbox());
    expect(blockedBefore).toBeGreaterThanOrEqual(1);

    fake.pushEvent("pane.closed", { pane_id: paneId });
    fake.pushEvent("pane_agent_status_changed", {
      pane_id: paneId,
      agent_status: "blocked",
    });
    await Bun.sleep(250);

    const blockedAfter = countBlockedTurns(await towerClient.listInbox());
    expect(blockedAfter).toBe(blockedBefore);

    await bridge.stop();
    towerClient.close();
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

  test("⑨⑪ status fields + single-card regression", async () => {
    const port = 22800 + Math.floor(Math.random() * 400);
    const dir = join(tmpdir(), `loom-prune-int-${Date.now()}`);
    const sessionFile = join(dir, "session.json");
    const herdrSock = join(dir, "herdr.sock");
    const relay = new RelayServer({ host: "127.0.0.1", port });
    mkdirSync(dir, { recursive: true });
    process.env.LOOM_TEST_HOME = dir;
    process.env.LOOM_SESSION = sessionFile;
    process.env.LOOM_NO_AUTO_HOST = "1";
    resetStateHomeDirCache();
    setActiveProfile(null);
    relay.start();
    const fake = await startFakeHerdr({
      socketPath: herdrSock,
      autoStatus: "done",
      autoStatusDelayMs: 30,
    });
    const tower = new RelayClient({ url: `ws://127.0.0.1:${port}/ws` });
    const created = await tower.createRoom({
      roomName: "prune-int",
      displayName: "tower",
      agentKind: "shell",
      peerId: "p_tower",
    });
    if (created.type !== "room.state") throw new Error("create failed");
    const session: FableSession = {
      roomId: created.roomId,
      roomName: "prune-int",
      inviteCode: created.inviteCode ?? "",
      peerId: "p_node",
      displayName: "node/wsl-1",
      color: "#0f0",
      agentKind: "shell",
      relayUrl: `ws://127.0.0.1:${port}/ws`,
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(sessionFile, JSON.stringify(session), "utf8");
    const herdr = new HerdrClient({ socketPath: herdrSock, submitDelayMs: 0 });
    const bridge = await startBridgeRuntime({
      session,
      profile: "node-prune",
      config: {
        authorizedDispatchers: ["p_tower"],
        herdrSocketPath: herdrSock,
        agentArgv: { claude: ["claude"] },
        herdrProtocol: 16,
      },
      herdr,
      submitVerify: { waitMs: 300, retries: 1 },
    });

    // ⑨ status fields after global subscribe
    {
      const stRes = await fetch(`http://127.0.0.1:${bridge.meta.port}/rpc`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${bridge.meta.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ op: "status" }),
      });
      const health = (await stRes.json()) as {
        eventConnected: boolean;
        lastSubscribeAck: string | null;
        eventSubscriptions: number;
      };
      expect(health.eventConnected).toBe(true);
      expect(typeof health.lastSubscribeAck).toBe("string");
      expect(health.eventSubscriptions).toBeGreaterThanOrEqual(1);
    }

    async function dispatchAndAwaitDone(cardId: string, prompt: string): Promise<void> {
      await tower.handoff({
        to: "@node/wsl-1",
        body: buildDispatchBody({ title: prompt, cardId, node: "node/wsl-1" }),
        mode: "task",
        attachments: [
          serializeCardAttachment(CARD_DISPATCH_LABEL, {
            v: CARD_CONTRACT_VERSION,
            cardId,
            sourceRoomId: session.roomId,
            prompt,
            agentKind: "claude",
          }),
        ],
      });
      let found = false;
      for (let i = 0; i < 50; i++) {
        await Bun.sleep(100);
        const inbox = await tower.listInbox();
        const hit = inbox.find(
          (e) =>
            e.handoff.attachments?.some((a) => a.label === CARD_RESULT_LABEL) &&
            e.handoff.body.includes("[DONE]") &&
            e.handoff.attachments!.some((a) => {
              try {
                return (JSON.parse(a.content) as { cardId?: string }).cardId === cardId;
              } catch {
                return false;
              }
            }),
        );
        if (hit) {
          found = true;
          const content = hit.handoff.attachments!.find(
            (a) => a.label === CARD_RESULT_LABEL,
          )!.content;
          const result = JSON.parse(content) as { status: string; cardId: string };
          expect(result.status).toBe("done");
          expect(result.cardId).toBe(cardId);
          break;
        }
      }
      expect(found).toBe(true);
    }

    // ⑪ single card working→idle→done
    await dispatchAndAwaitDone("task_511191e0011223344", "single card");

    await bridge.stop();
    tower.close();
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

  test("⑩ closed-pane FIN: A done+close → B subscribe omits A, ACK+inject", async () => {
    // With failSubscribeOnClosedPane, a contaminated list (A still present after
    // A closed) would pre-ACK FIN and hang/fail B — this is the real failure path.
    const port = 23200 + Math.floor(Math.random() * 400);
    const dir = join(tmpdir(), `loom-closed-pane-${Date.now()}`);
    const sessionFile = join(dir, "session.json");
    const herdrSock = join(dir, "herdr.sock");
    const relay = new RelayServer({ host: "127.0.0.1", port });
    mkdirSync(dir, { recursive: true });
    process.env.LOOM_TEST_HOME = dir;
    process.env.LOOM_SESSION = sessionFile;
    process.env.LOOM_NO_AUTO_HOST = "1";
    resetStateHomeDirCache();
    setActiveProfile(null);
    relay.start();
    const fake = await startFakeHerdr({
      socketPath: herdrSock,
      autoStatus: "done",
      autoStatusDelayMs: 30,
      failSubscribeOnClosedPane: true,
    });
    const tower = new RelayClient({ url: `ws://127.0.0.1:${port}/ws` });
    const created = await tower.createRoom({
      roomName: "closed-pane",
      displayName: "tower",
      agentKind: "shell",
      peerId: "p_tower",
    });
    if (created.type !== "room.state") throw new Error("create failed");
    const session: FableSession = {
      roomId: created.roomId,
      roomName: "closed-pane",
      inviteCode: created.inviteCode ?? "",
      peerId: "p_node",
      displayName: "node/wsl-1",
      color: "#0f0",
      agentKind: "shell",
      relayUrl: `ws://127.0.0.1:${port}/ws`,
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(sessionFile, JSON.stringify(session), "utf8");
    const herdr = new HerdrClient({
      socketPath: herdrSock,
      submitDelayMs: 0,
      timeoutMs: 2_000,
    });
    const bridge = await startBridgeRuntime({
      session,
      profile: "node-closed-pane",
      config: {
        authorizedDispatchers: ["p_tower"],
        herdrSocketPath: herdrSock,
        agentArgv: { claude: ["claude"] },
        herdrProtocol: 16,
      },
      herdr,
      submitVerify: { waitMs: 300, retries: 1 },
    });

    async function dispatchAndAwaitDone(cardId: string, prompt: string): Promise<void> {
      await tower.handoff({
        to: "@node/wsl-1",
        body: buildDispatchBody({ title: prompt, cardId, node: "node/wsl-1" }),
        mode: "task",
        attachments: [
          serializeCardAttachment(CARD_DISPATCH_LABEL, {
            v: CARD_CONTRACT_VERSION,
            cardId,
            sourceRoomId: session.roomId,
            prompt,
            agentKind: "claude",
          }),
        ],
      });
      let found = false;
      for (let i = 0; i < 50; i++) {
        await Bun.sleep(100);
        const inbox = await tower.listInbox();
        const hit = inbox.find(
          (e) =>
            e.handoff.attachments?.some((a) => a.label === CARD_RESULT_LABEL) &&
            e.handoff.body.includes("[DONE]") &&
            e.handoff.attachments!.some((a) => {
              try {
                return (JSON.parse(a.content) as { cardId?: string }).cardId === cardId;
              } catch {
                return false;
              }
            }),
        );
        if (hit) {
          found = true;
          const content = hit.handoff.attachments!.find(
            (a) => a.label === CARD_RESULT_LABEL,
          )!.content;
          const result = JSON.parse(content) as { status: string; cardId: string };
          expect(result.status).toBe("done");
          expect(result.cardId).toBe(cardId);
          break;
        }
      }
      expect(found).toBe(true);
    }

    // Card A complete
    const panesBeforeA = new Set(fake.listPaneIds());
    await dispatchAndAwaitDone("task_aaaaaaaa00112233", "card A");
    const panesAfterA = fake.listPaneIds();
    const paneA = panesAfterA.find((p) => !panesBeforeA.has(p)) ?? panesAfterA[0];
    expect(paneA).toBeTruthy();

    // Close pane A (real herdr would reject later subscribe lists that still list it)
    fake.markPaneClosed(paneA!);
    try {
      await herdr.request("pane.close", { pane_id: paneA! });
    } catch {
      /* already marked closed in fake */
    }

    const subBeforeB = fake.calls.filter((c) => c.method === "events.subscribe").length;
    const agentSendBeforeB = fake.calls.filter((c) => c.method === "agent.send").length;

    // Card B — must ACK subscribe (no A in payload) and reach inject
    await dispatchAndAwaitDone("task_bbbbbbbb00112233", "card B");

    const subCalls = fake.calls.filter((c) => c.method === "events.subscribe");
    expect(subCalls.length).toBeGreaterThan(subBeforeB);
    // Find B's subscribe call(s) after A closed — none may list pane A
    const afterCloseSubs = subCalls.slice(subBeforeB);
    for (const call of afterCloseSubs) {
      const subs = (call.params.subscriptions ?? []) as {
        type: string;
        pane_id?: string;
      }[];
      expect(subs.some((s) => s.pane_id === paneA)).toBe(false);
    }

    // Inject reached (agent.send after B dispatch)
    const agentSendAfterB = fake.calls.filter((c) => c.method === "agent.send").length;
    expect(agentSendAfterB).toBeGreaterThan(agentSendBeforeB);

    await bridge.stop();
    tower.close();
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
});

// silence unused
void generateConvId;
void CONV_CONTRACT_VERSION;
