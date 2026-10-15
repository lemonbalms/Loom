/**
 * PLAN 0.33.0 P3 — drain on the pane backend (Done-when (f) · R3 · R4 · R51-L1).
 * In-process runtime against the fake herdr socket (pane cards + conv panes need herdr):
 * a pane card flight and a conv flight keep the bridge `draining`; a new pane dispatch and a
 * new conv.open are not claimed; the in-progress conv's turn and close are still processed.
 * P4 (P3 verify carry-overs): P3-L1 payload_invalid claim+send counted by drain · P3-L2 conv
 * blocked notice sent before stop · RPC stop during drain.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
import type { BridgeConfig } from "./bridge-config";
import { type BridgeRuntime, startBridgeRuntime } from "./bridge-runtime";
import { bridgeStatusPath } from "./bridge-status";
import { convAwait, convClose, convOpen, convSendTurn } from "./conv-ops";
import { startFakeHerdr } from "./fake-herdr";
import { HerdrClient } from "./herdr-client";
import { RelayClient } from "./relay-client";
import { type FableSession, resetStateHomeDirCache, setActiveProfile } from "./session-store";

type Remaining = {
  paneCards: number;
  convs: number;
  headlessRunning: number;
  headlessQueued: number;
};

async function waitFor<T>(
  probe: () => T | null | undefined | false | Promise<T | null | undefined | false>,
  timeoutMs: number,
  stepMs = 25,
): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const v = await probe();
    if (v) return v;
    await Bun.sleep(stepMs);
  }
  const v = await probe();
  return v ? v : null;
}

describe("bridge drain — pane cards + conv (PLAN 0.33.0 P3 · f)", () => {
  const port = 22000 + Math.floor(Math.random() * 8000);
  const dir = join(tmpdir(), `loom-p3-drain-pane-${Date.now()}-${process.pid}`);
  const towerSessionFile = join(dir, "tower-session.json");
  const workerSessionFile = join(dir, "worker-session.json");
  const herdrSock = join(dir, "herdr.sock");
  const relay = new RelayServer({ host: "127.0.0.1", port });

  let fake: Awaited<ReturnType<typeof startFakeHerdr>>;
  let bridge: BridgeRuntime | null = null;
  let towerSession: FableSession;
  let workerSession: FableSession;
  let pump: ReturnType<typeof setInterval> | null = null;
  let cfg: BridgeConfig;
  const stderrLines: string[] = [];
  const realStderr = console.error;

  function useTowerSession(): void {
    process.env.LOOM_SESSION = towerSessionFile;
    resetStateHomeDirCache();
    setActiveProfile(null);
  }

  async function withTower<T>(fn: (c: RelayClient) => Promise<T>): Promise<T> {
    const c = new RelayClient({ url: towerSession.relayUrl! });
    try {
      const joined = await c.joinRoom({
        inviteCode: towerSession.inviteCode,
        displayName: towerSession.displayName,
        agentKind: "shell",
        peerId: towerSession.peerId,
        peerSecret: towerSession.peerSecret,
      });
      if (joined.type === "error") throw new Error(joined.message);
      return await fn(c);
    } finally {
      c.close();
    }
  }

  async function dispatch(cardId: string): Promise<string> {
    return withTower(async (c) => {
      const ack = await c.handoff({
        to: "@node/wsl-1",
        body: buildDispatchBody({ title: "p3 pane card", cardId, node: "node/wsl-1" }),
        mode: "task",
        attachments: [
          serializeCardAttachment(CARD_DISPATCH_LABEL, {
            v: CARD_CONTRACT_VERSION,
            cardId,
            sourceRoomId: towerSession.roomId,
            prompt: `drain pane ${cardId}`,
            agentKind: "claude" as const,
          }),
        ],
      });
      return ack.handoffId;
    });
  }

  async function countResults(cardId: string): Promise<number> {
    return withTower(async (c) => {
      let n = 0;
      for (const entry of await c.listInbox()) {
        for (const a of entry.handoff.attachments ?? []) {
          if (a.label !== CARD_RESULT_LABEL) continue;
          if ((JSON.parse(a.content) as { cardId?: string }).cardId === cardId) n += 1;
        }
      }
      return n;
    });
  }

  function paneOfAgent(name: string): string | undefined {
    const start = fake.calls.find((c) => c.method === "agent.start" && c.params.name === name);
    return start ? String(start.params.pane_id) : undefined;
  }

  function agentStartNames(): string[] {
    return fake.calls.filter((c) => c.method === "agent.start").map((c) => String(c.params.name));
  }

  function promptsTo(name: string): number {
    return fake.calls.filter((c) => c.method === "agent.prompt" && c.params.target === name).length;
  }

  function pushStatus(paneId: string, status: string): void {
    fake.pushEvent("pane_agent_status_changed", { pane_id: paneId, agent_status: status });
  }

  async function rpc(body: Record<string, unknown>) {
    const meta = bridge!.meta;
    const res = await fetch(`http://127.0.0.1:${meta.port}/rpc`, {
      method: "POST",
      headers: { authorization: `Bearer ${meta.token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return {
      status: res.status,
      json: (await res.json()) as {
        ok?: boolean;
        state?: string;
        deadlineAt?: string | null;
        remaining?: Remaining;
      },
    };
  }

  /** Join as the node peer and claim everything left in its relay inbox (clean slate). */
  async function clearNodeInbox(): Promise<void> {
    const saved = JSON.parse(readFileSync(workerSessionFile, "utf8")) as FableSession;
    const node = new RelayClient({ url: towerSession.relayUrl! });
    try {
      const joined = await node.joinRoom({
        inviteCode: saved.inviteCode,
        displayName: saved.displayName,
        agentKind: "shell",
        peerId: saved.peerId,
        color: saved.color,
        peerSecret: saved.peerSecret,
      });
      if (joined.type === "error") throw new Error(joined.message);
      for (const e of await node.listInbox()) await node.claimHandoff(e.handoff.id, "claim");
    } finally {
      node.close();
    }
  }

  /** A fresh in-process pane bridge on the node session (after the previous one stopped). */
  async function startFreshBridge(): Promise<BridgeRuntime> {
    if (bridge) {
      await bridge.stop();
      bridge = null;
    }
    await clearNodeInbox();
    process.env.LOOM_SESSION = workerSessionFile;
    resetStateHomeDirCache();
    setActiveProfile(null);
    const saved = JSON.parse(readFileSync(workerSessionFile, "utf8")) as FableSession;
    const b = await startBridgeRuntime({
      session: saved,
      profile: "node",
      config: cfg,
      herdr: new HerdrClient({ socketPath: herdrSock }),
      submitVerify: { waitMs: 2_000, retries: 1 },
    });
    bridge = b;
    useTowerSession();
    return b;
  }

  async function stoppedWithin(b: BridgeRuntime, ms: number): Promise<"stopped" | "timeout"> {
    return Promise.race([
      b.stopped.then(() => "stopped" as const),
      Bun.sleep(ms).then(() => "timeout" as const),
    ]);
  }

  async function failedResults(cardId: string): Promise<Array<{ status?: string; reason?: string }>> {
    return withTower(async (c) => {
      const out: Array<{ status?: string; reason?: string }> = [];
      for (const entry of await c.listInbox()) {
        for (const a of entry.handoff.attachments ?? []) {
          if (a.label !== CARD_RESULT_LABEL) continue;
          const r = JSON.parse(a.content) as { cardId?: string; status?: string; reason?: string };
          if (r.cardId === cardId) out.push({ status: r.status, reason: r.reason });
        }
      }
      return out;
    });
  }

  beforeAll(async () => {
    mkdirSync(dir, { recursive: true });
    process.env.LOOM_NO_AUTO_HOST = "1";
    relay.start();
    // autoStatus "none": the test drives working/done per pane.
    fake = await startFakeHerdr({ socketPath: herdrSock, autoStatus: "none" });
    // Each submit (agent.prompt) is acknowledged with `working` so inject verify passes.
    let handled = 0;
    pump = setInterval(() => {
      const prompts = fake.calls.filter((c) => c.method === "agent.prompt");
      for (; handled < prompts.length; handled++) {
        const pane = paneOfAgent(String(prompts[handled]!.params.target));
        if (pane) pushStatus(pane, "working");
      }
    }, 10);

    const bootstrap = new RelayClient({ url: `ws://127.0.0.1:${port}/ws` });
    const created = await bootstrap.createRoom({
      roomName: "p3-drain-pane",
      displayName: "tower",
      agentKind: "shell",
      peerId: "p_tower",
    });
    if (created.type !== "room.state") throw new Error("create failed");
    const towerSecret = created.peerSecret ?? bootstrap.peerSecret!;
    bootstrap.close();
    towerSession = {
      roomId: created.roomId,
      roomName: created.roomName ?? "p3-drain-pane",
      inviteCode: created.inviteCode ?? "",
      peerId: "p_tower",
      displayName: "tower",
      color: "#fff",
      agentKind: "shell",
      relayUrl: `ws://127.0.0.1:${port}/ws`,
      peerSecret: towerSecret,
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(towerSessionFile, JSON.stringify(towerSession), "utf8");
    workerSession = {
      ...towerSession,
      peerId: "p_node",
      displayName: "node/wsl-1",
      color: "#0f0",
      peerSecret: undefined,
    };
    writeFileSync(workerSessionFile, JSON.stringify(workerSession), "utf8");

    cfg = {
      authorizedDispatchers: ["p_tower"],
      herdrSocketPath: herdrSock,
      agentArgv: { claude: ["claude"] },
      herdrProtocol: 17,
    };
    process.env.LOOM_TEST_HOME = dir;
    process.env.LOOM_SESSION = workerSessionFile;
    resetStateHomeDirCache();
    setActiveProfile(null);
    console.error = (...args: unknown[]) => {
      stderrLines.push(args.map(String).join(" "));
    };
    bridge = await startBridgeRuntime({
      session: workerSession,
      profile: "node",
      config: cfg,
      herdr: new HerdrClient({ socketPath: herdrSock }),
      submitVerify: { waitMs: 2_000, retries: 1 },
    });
    useTowerSession();
  });

  afterAll(async () => {
    console.error = realStderr;
    if (pump) clearInterval(pump);
    if (bridge) await bridge.stop();
    await fake.close();
    relay.stop();
    delete process.env.LOOM_TEST_HOME;
    delete process.env.LOOM_SESSION;
    delete process.env.LOOM_NO_AUTO_HOST;
    resetStateHomeDirCache();
    rmSync(dir, { recursive: true, force: true });
  });

  test("pane card + conv keep `draining`; new dispatch / conv.open unclaimed; conv turn + close processed", async () => {
    useTowerSession();
    // In flight before the drain: one pane card and one conv.
    const cardA = "task_a0330d0000000001";
    await dispatch(cardA);
    const nameA = `loom-${cardA}-1`;
    expect(await waitFor(() => paneOfAgent(nameA), 15_000)).toBeTruthy();
    const paneA = paneOfAgent(nameA)!;

    const conv1 = await convOpen({ node: "node/wsl-1", goal: "drain conv one", maxTurns: 20 });
    expect(conv1.ok).toBe(true);
    if (!conv1.ok) return;
    expect((await convAwait({ convId: conv1.convId, timeoutSec: 15 })).status).toBe("accept");
    const convName = `loom-conv-${conv1.convId.slice(5, 21)}`;
    expect(await waitFor(() => paneOfAgent(convName), 10_000)).toBeTruthy();
    const convPane = paneOfAgent(convName)!;

    const drained = await rpc({ op: "drain", timeoutSec: 120 });
    expect(drained.status).toBe(200);
    expect(drained.json.state).toBe("draining");
    expect(drained.json.remaining).toEqual({
      paneCards: 1,
      convs: 1,
      headlessRunning: 0,
      headlessQueued: 0,
    });
    expect(bridge!.state()).toBe("draining");

    // New work during drain: neither claimed (no agent.start), both re-observed per poll.
    const startsBefore = agentStartNames().length;
    const cardB = "task_a0330d0000000002";
    const hB = await dispatch(cardB);
    const conv2 = await convOpen({ node: "node/wsl-1", goal: "drain conv two" });
    expect(conv2.ok).toBe(true);
    if (!conv2.ok) return;
    const seen = await waitFor(
      () =>
        stderrLines.some((l) => l.includes(`drain: not claiming handoff ${hB}`)) &&
        stderrLines.some((l) => l.includes(`drain: not claiming handoff ${conv2.handoffId}`))
          ? true
          : null,
      6_000,
      50,
    );
    expect(seen).toBe(true);
    expect(agentStartNames().length).toBe(startsBefore);

    // In-progress conv: worker turn out, tower turn in (claimed + injected), close processed.
    pushStatus(convPane, "done");
    expect((await convAwait({ convId: conv1.convId, timeoutSec: 15 })).status).toBe("turn");
    const promptsBefore = promptsTo(convName);
    const sent = await convSendTurn({ convId: conv1.convId, text: "keep going during drain" });
    expect(sent.ok).toBe(true);
    expect(await waitFor(() => promptsTo(convName) > promptsBefore, 10_000)).toBe(true);
    expect(bridge!.state()).toBe("draining");

    const closed = await convClose({ convId: conv1.convId, reason: "done" });
    expect(closed.ok).toBe(true);
    const convGone = await waitFor(async () => {
      const r = await rpc({ op: "drain" });
      return r.json.remaining?.convs === 0 ? r.json : null;
    }, 10_000, 100);
    expect(convGone?.state).toBe("draining");
    expect(convGone?.remaining?.paneCards).toBe(1);
    expect(bridge!.state()).toBe("draining");

    // Last flight completes → stopping → stopped.
    pushStatus(paneA, "done");
    const stopped = await Promise.race([
      bridge!.stopped.then(() => "stopped" as const),
      Bun.sleep(20_000).then(() => "timeout" as const),
    ]);
    expect(stopped).toBe("stopped");
    expect(bridge!.state()).toBe("stopped");
    expect(stderrLines.some((l) => l.includes("state stopping (drain)"))).toBe(true);
    const status = JSON.parse(readFileSync(bridgeStatusPath("node"), "utf8")) as {
      state?: string;
      lastError?: string;
    };
    expect(status.state).toBe("stopped");
    expect(status.lastError).toBeUndefined();

    expect(await countResults(cardA)).toBe(1);
    expect(await countResults(cardB)).toBe(0);
    expect(agentStartNames().some((n) => n.includes(cardB))).toBe(false);
    expect(agentStartNames().some((n) => n.includes(conv2.convId.slice(5, 21)))).toBe(false);

    // Both handoffs are still unclaimed in the node's relay inbox.
    const saved = JSON.parse(readFileSync(workerSessionFile, "utf8")) as FableSession;
    const node = new RelayClient({ url: towerSession.relayUrl! });
    try {
      const joined = await node.joinRoom({
        inviteCode: saved.inviteCode,
        displayName: saved.displayName,
        agentKind: "shell",
        peerId: saved.peerId,
        color: saved.color,
        peerSecret: saved.peerSecret,
      });
      expect(joined.type).not.toBe("error");
      const ids = (await node.listInbox()).map((e) => e.handoff.id);
      expect(ids).toContain(hB);
      expect(ids).toContain(conv2.handoffId);
    } finally {
      node.close();
    }
    bridge = null;
  }, 90_000);
  test("payload_invalid claim in flight when drain starts: the failed result is sent before stopped (P3-L1)", async () => {
    const b = await startFreshBridge();
    const proto = RelayClient.prototype as unknown as {
      claimHandoff: (this: RelayClient, id: string, via?: "claim" | "accept") => Promise<unknown>;
    };
    const orig = proto.claimHandoff;
    let delayed = 0;
    let delayOn = true;
    proto.claimHandoff = async function (this: RelayClient, id: string, via?: "claim" | "accept") {
      if (delayOn) {
        delayed += 1;
        await Bun.sleep(400);
      }
      return orig.call(this, id, via);
    };
    const cardId = "task_a0330e0000000001";
    try {
      await withTower((c) =>
        c.handoff({
          to: "@node/wsl-1",
          body: buildDispatchBody({ title: "p4 malformed", cardId, node: "node/wsl-1" }),
          mode: "task",
          // Schema-invalid (v) but carries a cardId → payload_invalid failed result for it.
          attachments: [serializeCardAttachment(CARD_DISPATCH_LABEL, { v: 999, cardId })],
        }),
      );
      expect(await waitFor(() => (delayed > 0 ? true : null), 10_000, 5)).toBe(true);
      const drained = await rpc({ op: "drain", timeoutSec: 60 });
      expect(drained.json.state).toBe("draining");
      expect(await stoppedWithin(b, 15_000)).toBe("stopped");
    } finally {
      delayOn = false;
      proto.claimHandoff = orig;
    }
    expect(b.state()).toBe("stopped");
    expect(await failedResults(cardId)).toEqual([{ status: "failed", reason: "payload_invalid" }]);
    bridge = null;
  }, 60_000);

  test("conv pane closed during drain: the blocked turn reaches the tower before stopped (P3-L2)", async () => {
    const b = await startFreshBridge();
    const conv = await convOpen({ node: "node/wsl-1", goal: "drain blocked notice", maxTurns: 20 });
    expect(conv.ok).toBe(true);
    if (!conv.ok) return;
    expect((await convAwait({ convId: conv.convId, timeoutSec: 15 })).status).toBe("accept");
    const convName = `loom-conv-${conv.convId.slice(5, 21)}`;
    expect(await waitFor(() => paneOfAgent(convName), 10_000)).toBeTruthy();
    const convPane = paneOfAgent(convName)!;

    const drained = await rpc({ op: "drain", timeoutSec: 120 });
    expect(drained.json.state).toBe("draining");
    expect(drained.json.remaining?.convs).toBe(1);

    fake.pushEvent("pane_closed", { pane_id: convPane });
    expect(await stoppedWithin(b, 20_000)).toBe("stopped");
    const turn = await convAwait({ convId: conv.convId, timeoutSec: 5 });
    expect(turn.status).toBe("turn");
    if (turn.status === "turn") expect(turn.kind).toBe("blocked");
    bridge = null;
  }, 60_000);

  test("RPC stop during drain: draining → stopping → stopped, drain timers cleared, no drain_timeout later", async () => {
    const b = await startFreshBridge();
    const cardId = "task_a0330e0000000002";
    await dispatch(cardId);
    expect(await waitFor(() => paneOfAgent(`loom-${cardId}-1`), 15_000)).toBeTruthy();
    const mark = stderrLines.length;
    const drained = await rpc({ op: "drain", timeoutSec: 2 });
    expect(drained.json.state).toBe("draining");
    expect(drained.json.remaining?.paneCards).toBe(1);
    const stop = await rpc({ op: "stop" });
    expect(stop.json.ok).toBe(true);
    expect(await stoppedWithin(b, 15_000)).toBe("stopped");
    // Past the 2 s drain deadline: the cleared drain timer never fires.
    await Bun.sleep(2_500);
    const lines = stderrLines.slice(mark);
    const iDraining = lines.findIndex((l) => l.includes("state draining (rpc:drain)"));
    const iStopping = lines.findIndex((l) => l.includes("state stopping (rpc:stop)"));
    const iStopped = lines.findIndex((l) => l.includes("state stopped"));
    expect(iDraining).toBeGreaterThanOrEqual(0);
    expect(iStopping).toBeGreaterThan(iDraining);
    expect(iStopped).toBeGreaterThan(iStopping);
    expect(lines.some((l) => l.includes("drain deadline reached"))).toBe(false);
    expect(lines.some((l) => l.includes("state stopping (drain"))).toBe(false);
    expect(lines.some((l) => l.includes("status transition refused"))).toBe(false);
    const status = JSON.parse(readFileSync(bridgeStatusPath("node"), "utf8")) as {
      state?: string;
      lastError?: string;
    };
    expect(status.state).toBe("stopped");
    expect(status.lastError).toBeUndefined();
    bridge = null;
  }, 60_000);
});
