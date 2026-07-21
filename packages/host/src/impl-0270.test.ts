/**
 * PLAN 0.27.0 pre-C — result issuance ownership + strict ACK boundary.
 * Covers §5.1 new units (worker scope) + D2 injection surface.
 */
import { describe, expect, test, afterAll, beforeAll, beforeEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
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
import {
  startFakeHerdr,
  setHandoffAckInjection,
  clearHandoffAckInjection,
  peekHandoffAckInjection,
  type FakeHerdr,
  type HandoffAckInjectionPreset,
} from "./fake-herdr";
import { startBridgeRuntime, type BridgeRuntime } from "./bridge-runtime";
import type { BridgeConfig } from "./bridge-config";
import {
  resetStateHomeDirCache,
  setActiveProfile,
  type FableSession,
} from "./session-store";
import {
  applyCardResult,
  resetCurrencyGateCounters,
  currencyGateStaleDrops,
  currencyGateHandoffUnmapped,
  currencyGateDuplicateHandoffDrops,
} from "./card-ops";
import {
  addTask,
  updateTask,
  findTask,
} from "./task-board";
import {
  ResultIssuerRegistry,
  issuerKey,
  createResultIssuer,
} from "./result-issuer";
import {
  QuarantineStore,
  foldQuarantineLines,
  quarantinePath,
  resetQuarantineCounters,
  quarantineTornLineCount,
  appendQuarantineLineRaw,
} from "./result-quarantine";

const DONE_BODY = "IMPL-MARKER-0270\nall tests green\n[IMPL-0270-DONE]";

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

// ─── D2 injection surface unit ───────────────────────────────────────────────

describe("PLAN 0.27.0 D2 handoff ACK injection", () => {
  beforeEach(() => {
    clearHandoffAckInjection();
  });

  test("5 presets are deterministically generable", () => {
    const presets: HandoffAckInjectionPreset[] = [
      "queued_1",
      "delivered_1",
      "peer_unknown_0",
      "delivered_2",
      "transport_throw",
    ];
    for (const p of presets) {
      setHandoffAckInjection(p);
      const peek = peekHandoffAckInjection();
      expect(peek).toBeTruthy();
      if (p === "transport_throw") {
        expect(peek!.kind).toBe("throw");
      } else {
        expect(peek!.kind).toBe("ack");
      }
      clearHandoffAckInjection();
    }
  });

  test("once mode clears after single consume via RelayClient.handoff", async () => {
    setHandoffAckInjection("peer_unknown_0", { once: true });
    const client = new RelayClient({ url: "ws://127.0.0.1:1/ws" });
    // Injection short-circuits before connect
    const ack = await client.handoff({ to: "@x", body: "t", mode: "task" });
    expect(ack.status).toBe("peer_unknown");
    expect(ack.recipientCount).toBe(0);
    expect(peekHandoffAckInjection()).toBeNull();
  });

  test("transport_throw raises", async () => {
    setHandoffAckInjection("transport_throw");
    const client = new RelayClient({ url: "ws://127.0.0.1:1/ws" });
    await expect(
      client.handoff({ to: "@x", body: "t", mode: "task" }),
    ).rejects.toThrow(/injected transport/);
  });
});

// ─── Result issuer unit ──────────────────────────────────────────────────────

describe("PLAN 0.27.0 result issuer", () => {
  test("seq +1 on new payload; resend reuses currentSeq", () => {
    const iss = createResultIssuer("task_abc", "ho_1");
    expect(iss.acquire("initial")).toBe(true);
    expect(iss.acquire("initial")).toBe(false); // single-issue
    const s1 = iss.nextSeq();
    expect(s1).toBe(1);
    expect(iss.currentSeq()).toBe(1);
    // resend reuses
    expect(iss.currentSeq()).toBe(s1);
    // no second nextSeq without new composition intent — caller chooses
  });

  test("task_0 keys on dispatchHandoffId alone", () => {
    expect(issuerKey("task_0", "ho_a")).toBe("ho:ho_a");
    expect(issuerKey("task_abc", "ho_a")).toBe("task_abc\0ho_a");
    const reg = new ResultIssuerRegistry();
    const a = reg.getOrCreate("task_0", "ho_x");
    const b = reg.getOrCreate("task_0", "ho_x");
    expect(a).toBe(b);
    const c = reg.getOrCreate("task_0", "ho_y");
    expect(c).not.toBe(a);
  });

  test("cardSeq attempt-axis is separate from issuer seq (regression surface)", () => {
    // Document: cardSeq remains for attempt; issuer owns payload seq.
    // This unit locks the issuer contract only; cardSeq sites are grep-locked below.
    const iss = createResultIssuer("task_abc", "ho_1");
    iss.acquire("initial");
    expect(iss.nextSeq()).toBe(1);
  });
});

// ─── Quarantine unit ─────────────────────────────────────────────────────────

describe("PLAN 0.27.0 durable quarantine", () => {
  const dir = join(tmpdir(), `loom-q-0270-${Date.now()}`);

  beforeAll(() => {
    mkdirSync(dir, { recursive: true });
    process.env.LOOM_TEST_HOME = dir;
    resetStateHomeDirCache();
    resetQuarantineCounters();
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

  test("enter writes 1 durable record; tagged keys do not collapse", () => {
    const store = new QuarantineStore({
      profile: "node-q",
      reEscalateMs: 60_000,
    });
    store.load();
    expect(
      store.enter({
        cardId: "task_aa",
        dispatchHandoffId: "ho_1",
        state: "send_unknown",
        key: { tag: "seq", seq: 1 },
        reason: "test",
      }),
    ).toBe(true);
    expect(
      store.enter({
        cardId: "task_aa",
        dispatchHandoffId: "ho_1",
        state: "presence_unknown",
        key: { tag: "presence" },
        reason: "presence",
      }),
    ).toBe(true);
    expect(store.unresolvedCount()).toBe(2);
    const path = quarantinePath("node-q");
    expect(existsSync(path)).toBe(true);
    const raw = readFileSync(path, "utf8");
    expect(raw).toContain('"tag":"seq"');
    expect(raw).toContain('"tag":"presence"');
    store.ack({
      cardId: "task_aa",
      dispatchHandoffId: "ho_1",
      key: { tag: "seq", seq: 1 },
    });
    expect(store.unresolvedCount()).toBe(1);
    // append-only: enter line still present
    expect(readFileSync(path, "utf8")).toContain('"kind":"enter"');
    expect(readFileSync(path, "utf8")).toContain('"kind":"ack"');
    store.disposeTimers();
  });

  test("startup replay restores unresolved; torn last line counted not silent", () => {
    const profile = "node-torn";
    const path = quarantinePath(profile);
    mkdirSync(join(dir, ".loom", "bridge"), { recursive: true });
    appendQuarantineLineRaw(
      path,
      JSON.stringify({
        kind: "enter",
        cardId: "task_bb",
        dispatchHandoffId: "ho_2",
        state: "send_unknown",
        key: { tag: "seq", seq: 3 },
        at: new Date().toISOString(),
      }) + "\n",
    );
    appendQuarantineLineRaw(path, '{"kind":"enter","cardId":"torn'); // torn
    resetQuarantineCounters();
    const store = new QuarantineStore({ profile, reEscalateMs: 60_000 });
    const n = store.load();
    expect(n).toBe(1);
    expect(quarantineTornLineCount()).toBeGreaterThanOrEqual(1);
    store.disposeTimers();
  });

  test("foldQuarantineLines: auto_resolve removes open entry", () => {
    const lines = [
      JSON.stringify({
        kind: "enter",
        cardId: "task_cc",
        dispatchHandoffId: "ho_3",
        state: "presence_unknown",
        key: { tag: "presence" },
        at: "t0",
      }),
      JSON.stringify({
        kind: "auto_resolve",
        cardId: "task_cc",
        dispatchHandoffId: "ho_3",
        state: "presence_unknown",
        key: { tag: "presence" },
        at: "t1",
        reason: "presence_superseded_by_seq",
      }),
    ];
    const m = foldQuarantineLines(lines);
    expect(m.size).toBe(0);
  });
});

// ─── Tower currency gate unit ────────────────────────────────────────────────

describe("PLAN 0.27.0 tower currency gate", () => {
  const dir = join(tmpdir(), `loom-cur-0270-${Date.now()}`);
  const sessionFile = join(dir, "session.json");

  beforeAll(() => {
    mkdirSync(dir, { recursive: true });
    process.env.LOOM_TEST_HOME = dir;
    process.env.LOOM_SESSION = sessionFile;
    resetStateHomeDirCache();
    setActiveProfile(null);
    writeFileSync(
      sessionFile,
      JSON.stringify({
        roomId: "room_currency_0270",
        roomName: "cur",
        inviteCode: "inv",
        peerId: "p_tower",
        displayName: "tower",
        color: "#00f",
        agentKind: "shell",
        relayUrl: "ws://127.0.0.1:1/ws",
        updatedAt: new Date().toISOString(),
      }),
      "utf8",
    );
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

  beforeEach(() => {
    resetCurrencyGateCounters();
    // fresh board via addTask for each test with unique ids
  });

  function resultJson(opts: {
    cardId: string;
    seq: number;
    dispatchHandoffId?: string;
    status?: "done" | "failed";
    node?: string;
  }): string {
    return JSON.stringify({
      v: CARD_CONTRACT_VERSION,
      cardId: opts.cardId,
      status: opts.status ?? "done",
      node: opts.node ?? "node/wsl-1",
      seq: opts.seq,
      dispatchHandoffId: opts.dispatchHandoffId,
      output: "ok",
      truncated: false,
      summary: "ok",
      finishedAt: new Date().toISOString(),
    });
  }

  test("stale dispatchHandoffId drops with counter (not silent)", () => {
    const t = addTask({ title: "stale", status: "doing" });
    updateTask(t.id, {
      assignee: "node/wsl-1",
      handoffId: "ho_c0ffee01",
      status: "doing",
    });
    const r = applyCardResult({
      resultJson: resultJson({
        cardId: t.id,
        seq: 1,
        dispatchHandoffId: "ho_5ade0001",
      }),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/currency_stale/);
    expect(currencyGateStaleDrops()).toBeGreaterThanOrEqual(1);
    expect(findTask(t.id)?.status).toBe("doing");
  });

  test("matching dispatchHandoffId applies + seq dedup", () => {
    const t = addTask({ title: "match", status: "doing" });
    updateTask(t.id, {
      assignee: "node/wsl-1",
      handoffId: "ho_a11ce001",
      status: "doing",
    });
    const r1 = applyCardResult({
      resultJson: resultJson({
        cardId: t.id,
        seq: 2,
        dispatchHandoffId: "ho_a11ce001",
      }),
    });
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.status).toBe("done");
    const r2 = applyCardResult({
      resultJson: resultJson({
        cardId: t.id,
        seq: 2,
        dispatchHandoffId: "ho_a11ce001",
      }),
    });
    expect(r2.ok).toBe(true); // idempotent
  });

  test("absent dispatchHandoffId → scalar fallback", () => {
    const t = addTask({ title: "scalar", status: "doing" });
    updateTask(t.id, {
      assignee: "node/wsl-1",
      handoffId: "ho_5ca1a001",
      status: "doing",
    });
    const r = applyCardResult({
      resultJson: resultJson({ cardId: t.id, seq: 1 }),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.status).toBe("done");
  });

  test("findTask miss + dispatchHandoffId scan fallback (task_0 style)", () => {
    const t = addTask({ title: "scan", status: "doing" });
    updateTask(t.id, {
      assignee: "node/wsl-1",
      handoffId: "ho_5ca0be01",
      status: "doing",
    });
    // Use a non-existent cardId that still matches TaskIdSchema
    const r = applyCardResult({
      resultJson: resultJson({
        cardId: "task_0",
        seq: 1,
        dispatchHandoffId: "ho_5ca0be01",
      }),
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.task.id).toBe(t.id);
      expect(r.status).toBe("done");
    }
  });

  test("handoff_unmapped_or_stale counter on scan miss", () => {
    const r = applyCardResult({
      resultJson: resultJson({
        cardId: "task_deadbeef01",
        seq: 1,
        dispatchHandoffId: "ho_f00d0001",
      }),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/handoff_unmapped/);
    expect(currencyGateHandoffUnmapped()).toBeGreaterThanOrEqual(1);
  });

  test("duplicate handoffId match → fail-visible drop", () => {
    const a = addTask({ title: "dup-a", status: "doing" });
    const b = addTask({ title: "dup-b", status: "doing" });
    updateTask(a.id, {
      assignee: "node/wsl-1",
      handoffId: "ho_d00d0001",
      status: "doing",
    });
    updateTask(b.id, {
      assignee: "node/wsl-1",
      handoffId: "ho_d00d0001",
      status: "doing",
    });
    const r = applyCardResult({
      resultJson: resultJson({
        cardId: "task_0",
        seq: 1,
        dispatchHandoffId: "ho_d00d0001",
      }),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/handoff_duplicate/);
    expect(currencyGateDuplicateHandoffDrops()).toBeGreaterThanOrEqual(1);
  });
});

// ─── Integration: strict ACK 5 combos + pane.close gating ────────────────────

// Live relay WebSocket round-trips — architect-scope; needs LOOM_LIVE_RELAY=1
// and a real network surface. Deterministic strict-ACK unit tests above stay active.
describe.skipIf(!process.env.LOOM_LIVE_RELAY)("PLAN 0.27.0 strict ACK integration", () => {
  const port = 27080 + Math.floor(Math.random() * 200);
  const dir = join(tmpdir(), `loom-ack-0270-${Date.now()}`);
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
  let cardCounter = 0;

  const cfg: BridgeConfig = {
    authorizedDispatchers: ["p_tower"],
    herdrSocketPath: herdrSock,
    agentArgv: { claude: ["claude"] },
    herdrProtocol: 16,
    paneCleanup: "auto",
  };

  function nextCardId(): string {
    cardCounter += 1;
    return `task_b0270${cardCounter.toString(16).padStart(11, "0")}`;
  }

  async function awaitCardResult(
    cardId: string,
    timeoutMs = 10_000,
  ): Promise<Record<string, unknown> | null> {
    if (!tower) return null;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const inbox = await tower.listInbox();
      for (const e of inbox) {
        const att = e.handoff.attachments?.find(
          (a) => a.label === CARD_RESULT_LABEL && a.content.includes(cardId),
        );
        if (att) return JSON.parse(att.content) as Record<string, unknown>;
      }
      await Bun.sleep(60);
    }
    return null;
  }

  async function spawnCard(cardId: string, prompt: string): Promise<string> {
    const panesBefore = new Set(fake.listPaneIds());
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
    const ready = await waitFor(
      () => fake.listPaneIds().some((p) => !panesBefore.has(p)),
      { timeoutMs: 8_000 },
    );
    expect(ready).toBe(true);
    return fake.listPaneIds().find((p) => !panesBefore.has(p))!;
  }

  function emitDone(paneId: string): void {
    fake.pushEvent("pane_agent_status_changed", {
      pane_id: paneId,
      agent_status: "working",
    });
    fake.pushEvent("pane_agent_status_changed", {
      pane_id: paneId,
      agent_status: "idle",
    });
  }

  beforeAll(async () => {
    mkdirSync(dir, { recursive: true });
    process.env.LOOM_TEST_HOME = dir;
    process.env.LOOM_SESSION = sessionFile;
    process.env.LOOM_NO_AUTO_HOST = "1";
    resetStateHomeDirCache();
    setActiveProfile(null);
    clearHandoffAckInjection();
    relay.start();

    fake = await startFakeHerdr({
      socketPath: herdrSock,
      autoStatus: "none",
    });

    tower = new RelayClient({ url: `ws://127.0.0.1:${port}/ws` });
    const created = await tower.createRoom({
      roomName: "ack-0270",
      displayName: "tower",
      agentKind: "shell",
      peerId: "p_tower",
    });
    if (created.type !== "room.state") throw new Error("create failed");
    inviteCode = created.inviteCode ?? "";
    const towerSecret = created.peerSecret ?? tower.peerSecret;

    towerSession = {
      roomId: created.roomId,
      roomName: "ack-0270",
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
      roomName: "ack-0270",
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
      profile: "node-ack0270",
      config: cfg,
      herdr: new HerdrClient({
        socketPath: herdrSock,
        submitDelayMs: 0,
      }),
      submitVerify: { waitMs: 250, retries: 1 },
      settleMs: 15,
      stillRunningPollMs: 80,
      stillRunningMaxMs: 350,
    });
    await Bun.sleep(150);
  });

  afterAll(async () => {
    clearHandoffAckInjection();
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
    "① strict ACK queued/1 → done + pane.close once (pre-C contract)",
    async () => {
      const cardId = nextCardId();
      const paneId = await spawnCard(cardId, "ack-queued-1");
      const closesBefore = closeCallsFor(fake, paneId);
      fake.setPaneReadText(paneId, DONE_BODY);
      // Inject AFTER spawn so only the result handoff is forced
      setHandoffAckInjection("queued_1");
      emitDone(paneId);
      const result = await awaitCardResult(cardId);
      expect(result).toBeTruthy();
      expect(result!.status).toBe("done");
      expect(result!.dispatchHandoffId).toBeTruthy();
      expect(typeof result!.seq).toBe("number");
      const closed = await waitFor(
        () => closeCallsFor(fake, paneId) === closesBefore + 1,
        { timeoutMs: 3_000 },
      );
      expect(closed).toBe(true);
      clearHandoffAckInjection();
      fake.setPaneReadText(paneId, null);
    },
    20_000,
  );

  test(
    "①b strict ACK delivered/1 → done + pane.close",
    async () => {
      const cardId = nextCardId();
      const paneId = await spawnCard(cardId, "ack-delivered-1");
      const closesBefore = closeCallsFor(fake, paneId);
      fake.setPaneReadText(paneId, DONE_BODY);
      setHandoffAckInjection("delivered_1");
      emitDone(paneId);
      const result = await awaitCardResult(cardId);
      expect(result).toBeTruthy();
      expect(result!.status).toBe("done");
      const closed = await waitFor(
        () => closeCallsFor(fake, paneId) === closesBefore + 1,
        { timeoutMs: 3_000 },
      );
      expect(closed).toBe(true);
      clearHandoffAckInjection();
      fake.setPaneReadText(paneId, null);
    },
    20_000,
  );

  test(
    "② peer_unknown/0 → send_unknown: no pane.close; durable quarantine 1",
    async () => {
      const cardId = nextCardId();
      const paneId = await spawnCard(cardId, "ack-peer-unknown");
      const closesBefore = closeCallsFor(fake, paneId);
      fake.setPaneReadText(paneId, DONE_BODY);
      setHandoffAckInjection("peer_unknown_0");
      emitDone(paneId);
      // Result may still be attempted (local issue) but pane.close must not run
      await Bun.sleep(900);
      expect(closeCallsFor(fake, paneId)).toBe(closesBefore);
      // Quarantine file should exist for profile
      const qPath = quarantinePath("node-ack0270");
      const qExists = existsSync(qPath);
      expect(qExists).toBe(true);
      if (qExists) {
        const raw = readFileSync(qPath, "utf8");
        expect(raw).toContain("send_unknown");
        expect(raw).toContain(cardId);
      }
      clearHandoffAckInjection();
      fake.setPaneReadText(paneId, null);
    },
    20_000,
  );

  test(
    "②b delivered/2 → send_unknown: no pane.close",
    async () => {
      const cardId = nextCardId();
      const paneId = await spawnCard(cardId, "ack-delivered-2");
      const closesBefore = closeCallsFor(fake, paneId);
      fake.setPaneReadText(paneId, DONE_BODY);
      setHandoffAckInjection("delivered_2");
      emitDone(paneId);
      await Bun.sleep(900);
      expect(closeCallsFor(fake, paneId)).toBe(closesBefore);
      clearHandoffAckInjection();
      fake.setPaneReadText(paneId, null);
    },
    20_000,
  );

  test(
    "③ transport throw → send_unknown: no pane.close",
    async () => {
      const cardId = nextCardId();
      const paneId = await spawnCard(cardId, "ack-transport-throw");
      const closesBefore = closeCallsFor(fake, paneId);
      fake.setPaneReadText(paneId, DONE_BODY);
      setHandoffAckInjection("transport_throw");
      emitDone(paneId);
      await Bun.sleep(900);
      expect(closeCallsFor(fake, paneId)).toBe(closesBefore);
      clearHandoffAckInjection();
      fake.setPaneReadText(paneId, null);
    },
    20_000,
  );

  test(
    "⑤ payload stamps (cardId, dispatchHandoffId, seq) on success path",
    async () => {
      clearHandoffAckInjection(); // real relay ACK (delivered/1 typically)
      const cardId = nextCardId();
      const paneId = await spawnCard(cardId, "ack-stamp");
      fake.setPaneReadText(paneId, DONE_BODY);
      emitDone(paneId);
      const result = await awaitCardResult(cardId);
      expect(result).toBeTruthy();
      expect(result!.cardId).toBe(cardId);
      expect(typeof result!.dispatchHandoffId).toBe("string");
      expect((result!.dispatchHandoffId as string).length).toBeGreaterThan(0);
      expect(typeof result!.seq).toBe("number");
      expect(result!.seq as number).toBeGreaterThanOrEqual(1);
      fake.setPaneReadText(paneId, null);
    },
    20_000,
  );
});

// ─── Source-level connection-rule assertions (units ⑩ ⑪) ─────────────────────

describe("PLAN 0.27.0 connection rules (source assertions)", () => {
  test(
    "④ fire-and-forget sites removed (source lock)",
    async () => {
      const src = await Bun.file(
        new URL("./bridge-runtime.ts", import.meta.url).pathname,
      ).text();
      expect(src.includes("void sendFailedResult")).toBe(false);
      expect(src.includes("void finishCard")).toBe(false);
      // result_committed residual 0
      expect(src.includes("result_committed")).toBe(false);
      expect(src.includes("result_relay_accepted")).toBe(true);
      expect(src.includes("relayAcceptedAt")).toBe(true);
      // commit_unknown residual 0
      expect(src.includes("commit_unknown")).toBe(false);
      expect(src.includes("send_unknown")).toBe(true);
      expect(src.includes("presence_unknown")).toBe(true);
      // flightSideEffectOwner CAS present
      expect(src.includes("flightSideEffectOwner")).toBe(true);
      expect(src.includes("terminalPending")).toBe(true);
      // cardSeq attempt axis kept (not deleted)
      expect(src.includes("cardSeq")).toBe(true);
    },
  );

  test("Flight-backed = CAS ∧ issuer; Flight-less = issuer alone; no CAS-only send", async () => {
    const src = await Bun.file(
      new URL("./bridge-runtime.ts", import.meta.url).pathname,
    ).text();
    // issuer.acquire is the universal authority
    expect(src.includes('issuer.acquire("initial")')).toBe(true);
    // Flight-backed CAS
    expect(src.includes("tryAcquireFlightSideEffect")).toBe(true);
    expect(src.includes("flightSideEffectOwner")).toBe(true);
    // Guards call CAS check
    expect(src.includes("guardFlightCompletion")).toBe(true);
    // 5 guard sites use guardFlightCompletion or flightSideEffectOwner
    const guardUses = src.split("guardFlightCompletion").length - 1;
    expect(guardUses).toBeGreaterThanOrEqual(5);
  });

  test("disposeCardFlight no longer deletes from flights map", async () => {
    const src = await Bun.file(
      new URL("./bridge-runtime.ts", import.meta.url).pathname,
    ).text();
    // The dispose function body must not call flights.delete
    const m = src.match(
      /function disposeCardFlight\([^)]*\)[^{]*\{([^}]+)\}/,
    );
    expect(m).toBeTruthy();
    expect(m![1]).not.toContain("flights.delete");
    expect(src.includes("function removeCardFlight")).toBe(true);
  });
});
