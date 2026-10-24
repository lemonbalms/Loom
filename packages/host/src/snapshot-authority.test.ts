/**
 * PLAN 0.46.0 P2 red (part A) — pane-card snapshot authority (cases ①–㉓).
 *
 * Harness = the `status-lost-watchdog.test.ts` rig (relay + fake herdr), with
 * `seqMode: "p22"` (agent.get carries `state_change_seq` / `completion_seq`) and
 * `autoStatus: "none"`: agent.prompt flips the pane to `working` (a stamped scs
 * — the delivery evidence) and nothing else happens on its own. A completion is
 * `fake.setAgentStatus` (stored + stamped, nothing broadcast = the event lost),
 * so only the snapshot poller can see it. `agentStartStatus: "idle"` = a
 * launched agent at baseline (scs = b · cs null). Temp HOME via `LOOM_TEST_HOME`.
 *
 * Bridge options per PLAN ② (not yet declared by StartBridgeRuntimeOptions —
 * passed through a non-literal object so the red fails on behaviour, not type):
 * `snapshotPollMs` · `statusUnavailableMs` · `agentGetConcurrency`.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createConnection } from "node:net";
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
import { startBridgeRuntime } from "./bridge-runtime";
import { type FakeHerdr, startFakeHerdr } from "./fake-herdr";
import { HerdrClient } from "./herdr-client";
import { hookSocketPath } from "./hook-sensor";
import { RelayClient } from "./relay-client";
import { type FableSession, resetStateHomeDirCache, setActiveProfile } from "./session-store";

/** Injected snapshot poll tick (production 2_000 — R11). */
const POLL_MS = 100;
/** Tick long enough that only events · ACKs · verify wakes trigger agent.get. */
const NO_TICK_MS = 30_000;
/** W for the window cases (production 600_000 — D4). */
const SHORT_W_MS = 1_500;
/** W that never expires inside a test. */
const LONG_W_MS = 60_000;
const GRACE_MS = 300;
const TEST_TIMEOUT_MS = 30_000;

/** ② note verbatim (`<n>` seconds · `<code>` = HerdrRpcError.code of the fake). */
const UNAVAILABLE_NOTE_RE =
  /^no authoritative herdr agent\.get snapshot for \d+s \(last error: invalid_request\) — prompt delivery and completion unknown; judge from output$/;

/** 0.45.4 R6 note, verbatim (fallback path). */
function statusLostNote(s: "idle" | "done"): string {
  return `herdr agent.get status=${s} after event socket re-subscribe; status event lost (no ${s} observed by the bridge) — judge from output`;
}

type CardResult = {
  cardId?: string;
  status?: string;
  reason?: string;
  note?: string;
  output?: string;
  summary?: string;
};

type Rig = {
  fake: FakeHerdr;
  node: string;
  stopBridge: () => Promise<void>;
  close: () => Promise<void>;
};

type RigOpts = {
  seqMode?: "none" | "p22";
  /** null = leave the fake's legacy "unknown" status (0.45.4 fixtures). */
  agentStartStatus?: string | string[] | null;
  pollMs?: number;
  wMs?: number;
  concurrency?: number;
  submitVerify?: { waitMs: number; retries: number };
  hookSensor?: boolean;
  graceMs?: number;
  stillRunningPollMs?: number;
};

let cardCounter = 0;
function newCardId(): string {
  cardCounter += 1;
  return `task_5a2b0000${cardCounter.toString(16).padStart(8, "0")}`;
}

async function waitFor(pred: () => boolean, timeoutMs: number, stepMs = 25): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (pred()) return true;
    await Bun.sleep(stepMs);
  }
  return pred();
}

/** Fail loudly when the interleaving a case depends on did not happen (Astra 0284 #5). */
function must(cond: boolean, what: string): void {
  if (!cond) throw new Error(`intended interleaving not reached: ${what}`);
}

/**
 * pane.read line counts actually requested for a pane, in call order (fake log).
 * Settle scrape vs R17 inject probe is told apart by observed counts (settle >
 * probe), not by today's literal sizes (Astra 0286 #4).
 */
function paneReadLines(fake: FakeHerdr, paneId: string): number[] {
  return fake.calls
    .filter((c) => c.method === "pane.read" && c.params.pane_id === paneId)
    .map((c) => (typeof c.params.lines === "number" ? c.params.lines : 0));
}

/** PLAN ② telemetry lines `card <id>: snapshot completion (cs=…`. */
function completionLines(lines: string[], cardId: string): number {
  return lines.filter((l) => l.includes(`card ${cardId}: snapshot completion (cs=`)).length;
}

type AgentGetLogEntry = ReturnType<FakeHerdr["agentGetLog"]>[number];

/**
 * Snapshot-applied milestone: an agent.get reply matching `pred` was sent and
 * the bridge issued another agent.get for the pane after it.
 *
 * Assumption (Astra 0286 #2 — for green review to check): "next agent.get after
 * the reply ⇒ reply handled" holds only if (a) per-flight agent.get ≤ 1 (R11)
 * and (b) the poller applies a reply's snapshot (state change · cancels) before
 * it requeues/issues the flight's next agent.get — response-then-requeue order.
 * A green that requeues before applying would make this milestone early; such a
 * green must replace it with a direct applied-state observation.
 */
async function waitSnapshotApplied(
  fake: FakeHerdr,
  paneId: string,
  pred: (e: AgentGetLogEntry) => boolean,
  timeoutMs: number,
): Promise<boolean> {
  return waitFor(
    () => {
      const log = fake.agentGetLog(paneId);
      const i = log.findIndex((e) => !e.failed && e.sentAt !== null && pred(e));
      if (i < 0) return false;
      const sentAt = log[i]!.sentAt!;
      return log.slice(i + 1).some((e) => e.requestedAt >= sentAt);
    },
    timeoutMs,
    10,
  );
}

function agentName(cardId: string): string {
  return `loom-${cardId}-1`;
}

function isAgentGetFor(c: { method: string; params: Record<string, unknown> }, paneId: string, cardId: string) {
  return (
    c.method === "agent.get" &&
    (c.params.target === paneId || c.params.target === agentName(cardId))
  );
}

function agentGets(fake: FakeHerdr, paneId: string, cardId: string) {
  return fake.calls.filter((c) => isAgentGetFor(c, paneId, cardId));
}

function prompts(fake: FakeHerdr, cardId: string) {
  return fake.calls.filter(
    (c) => c.method === "agent.prompt" && c.params.target === agentName(cardId),
  );
}

/** Reinject keys = CR nudges + agent.prompt re-types after the first inject. */
function reinjectKeys(fake: FakeHerdr, cardId: string): number {
  const crs = fake.calls.filter(
    (c) => c.method === "agent.send_keys" && c.params.target === agentName(cardId),
  ).length;
  return crs + Math.max(0, prompts(fake, cardId).length - 1);
}

function subscribeCount(fake: FakeHerdr): number {
  return fake.calls.filter((c) => c.method === "events.subscribe").length;
}

function paneCloses(fake: FakeHerdr, paneId: string) {
  return fake.calls.filter((c) => c.method === "pane.close" && c.params.pane_id === paneId);
}

function writeLineToSocket(socketPath: string, line: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const sock = createConnection({ path: socketPath });
    const t = setTimeout(() => {
      sock.destroy();
      reject(new Error("socket write timeout"));
    }, 1_000);
    sock.on("connect", () => {
      sock.end(`${line}\n`, () => {
        clearTimeout(t);
        resolve();
      });
    });
    sock.on("error", (e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

async function withStderr<T>(fn: (lines: string[]) => Promise<T>): Promise<T> {
  const lines: string[] = [];
  const orig = console.error;
  console.error = (...args: unknown[]) => {
    lines.push(args.map((a) => (a instanceof Error ? a.message : String(a))).join(" "));
    orig(...args);
  };
  try {
    return await fn(lines);
  } finally {
    console.error = orig;
  }
}

describe("PLAN 0.46.0 snapshot authority (relay + fake herdr p22)", () => {
  const port = 23100 + Math.floor(Math.random() * 300);
  // Short /tmp base keeps hook unix socket paths under macOS sun_path (~104B).
  const dir = mkdtempSync("/tmp/lsa-");
  const sessionFile = join(dir, "session.json");
  const relay = new RelayServer({ host: "127.0.0.1", port });
  const prevEnv = {
    LOOM_TEST_HOME: process.env.LOOM_TEST_HOME,
    LOOM_SESSION: process.env.LOOM_SESSION,
    LOOM_NO_AUTO_HOST: process.env.LOOM_NO_AUTO_HOST,
  };
  let tower: RelayClient | null = null;
  let session: FableSession;
  let rigSeq = 0;

  beforeAll(async () => {
    process.env.LOOM_TEST_HOME = dir;
    process.env.LOOM_SESSION = sessionFile;
    process.env.LOOM_NO_AUTO_HOST = "1";
    resetStateHomeDirCache();
    setActiveProfile(null);
    relay.start();
    tower = new RelayClient({ url: `ws://127.0.0.1:${port}/ws` });
    const created = await tower.createRoom({
      roomName: "snapshot-authority",
      displayName: "tower",
      agentKind: "shell",
      peerId: "p_tower",
    });
    if (created.type !== "room.state") throw new Error("create failed");
    session = {
      roomId: created.roomId,
      roomName: created.roomName ?? "snapshot-authority",
      inviteCode: created.inviteCode ?? "",
      peerId: "p_node_sa",
      displayName: "node/sa",
      color: "#0f0",
      agentKind: "shell",
      relayUrl: `ws://127.0.0.1:${port}/ws`,
      peerSecret: undefined,
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(sessionFile, JSON.stringify(session), "utf8");
  });

  afterAll(() => {
    tower?.close();
    relay.stop();
    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    setActiveProfile(null);
    resetStateHomeDirCache();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* */
    }
  });

  async function startRig(o: RigOpts = {}): Promise<Rig> {
    rigSeq += 1;
    const tag = `sa${rigSeq}`;
    const sock = join(dir, `h${rigSeq}.sock`);
    const startStatus = o.agentStartStatus === undefined ? "idle" : o.agentStartStatus;
    const fake = await startFakeHerdr({
      socketPath: sock,
      autoStatus: "none",
      protocol: 22,
      version: "0.9.5",
      seqMode: o.seqMode ?? "p22",
      ...(startStatus === null ? {} : { agentStartStatus: startStatus }),
    });
    const node = `node/${tag}`;
    const config: BridgeConfig = {
      authorizedDispatchers: ["p_tower"],
      herdrSocketPath: sock,
      agentArgv: { claude: ["claude"] },
      herdrProtocol: 22,
      hookSensor: o.hookSensor === true,
    };
    // Not a fresh literal at the call site: snapshotPollMs · statusUnavailableMs ·
    // agentGetConcurrency (PLAN 0.46.0 ②) are green options not declared yet.
    const bridgeOpts = {
      session: { ...session, peerId: `p_node_${tag}`, displayName: node, peerSecret: undefined },
      profile: `node-${tag}`,
      config,
      herdr: new HerdrClient({ socketPath: sock }),
      submitVerify: o.submitVerify ?? { waitMs: 800, retries: 1 },
      settleMs: 20,
      stillRunningPollMs: o.stillRunningPollMs ?? 60_000,
      statusLostGraceMs: o.graceMs ?? GRACE_MS,
      snapshotPollMs: o.pollMs ?? POLL_MS,
      statusUnavailableMs: o.wMs ?? LONG_W_MS,
      agentGetConcurrency: o.concurrency ?? 4,
    };
    const bridge = await startBridgeRuntime(bridgeOpts);
    await waitFor(() => subscribeCount(fake) >= 1, 2_000);
    let stopped = false;
    const stopBridge = async () => {
      if (stopped) return;
      stopped = true;
      await bridge.stop();
    };
    return {
      fake,
      node,
      stopBridge,
      close: async () => {
        await stopBridge();
        await fake.close();
      },
    };
  }

  async function dispatch(rig: Rig, cardId: string, prompt: string): Promise<void> {
    await tower!.handoff({
      to: `@${rig.node}`,
      body: buildDispatchBody({ title: prompt, cardId, node: rig.node }),
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
  }

  /**
   * Dispatch a card and wait for its agent.start (pane id). With `prompt`
   * (default) also wait for the inject, then `settle` ms so the poller can
   * apply the delivery snapshot. `pushWorking` = 0.45.4 event-path delivery.
   */
  async function startCard(
    rig: Rig,
    cardId: string,
    o: { prompt?: boolean; settle?: number; pushWorking?: boolean } = {},
  ): Promise<string> {
    await dispatch(rig, cardId, `prompt for ${cardId}`);
    let paneId = "";
    await waitFor(() => {
      const start = rig.fake.calls.find(
        (c) => c.method === "agent.start" && c.params.name === agentName(cardId),
      );
      paneId = start ? String(start.params.pane_id) : "";
      return paneId !== "";
    }, 5_000);
    expect(paneId).not.toBe("");
    if (o.prompt === false) return paneId;
    expect(await waitFor(() => prompts(rig.fake, cardId).length >= 1, 5_000)).toBe(true);
    if (o.pushWorking) {
      rig.fake.pushEvent("pane_agent_status_changed", { pane_id: paneId, agent_status: "working" });
    }
    await Bun.sleep(o.settle ?? 300);
    return paneId;
  }

  async function results(cardId: string): Promise<CardResult[]> {
    const inbox = await tower!.listInbox();
    return inbox.flatMap((entry) =>
      (entry.handoff.attachments ?? [])
        .filter((a) => a.label === CARD_RESULT_LABEL)
        .map((a) => JSON.parse(a.content) as CardResult)
        .filter((r) => r.cardId === cardId),
    );
  }

  async function waitResults(cardId: string, timeoutMs: number): Promise<CardResult[]> {
    const deadline = Date.now() + timeoutMs;
    let rs = await results(cardId);
    while (rs.length === 0 && Date.now() < deadline) {
      await Bun.sleep(100);
      rs = await results(cardId);
    }
    return rs;
  }

  test(
    "① normal — snapshot cs > b → exactly one needs_verification · telemetry on (b=…) + snapshot completion",
    async () => {
      const rig = await startRig();
      try {
        await withStderr(async (lines) => {
          const a = newCardId();
          const paneA = await startCard(rig, a);
          rig.fake.setPaneReadText(paneA, "SCRAPE-1 work finished");
          rig.fake.setAgentStatus(paneA, "idle"); // working→idle · cs = new scs
          const rs = await waitResults(a, 4_000);
          await Bun.sleep(300);
          expect(await results(a)).toHaveLength(1);
          expect(rs[0]!.reason).toBe("needs_verification");
          expect(rs[0]!.output).toContain("SCRAPE-1");
          expect(rs.filter((r) => r.status === "done")).toHaveLength(0);
          expect(
            lines.filter((l) => l.includes(`card ${a}: snapshot authority on (b=`)),
          ).toHaveLength(1);
          expect(
            lines.filter((l) => l.includes(`card ${a}: snapshot completion (cs=`)),
          ).toHaveLength(1);
        });
      } finally {
        await rig.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "② H18 window — idle · scs = b after inject (event + snapshot) → no completion",
    async () => {
      const rig = await startRig({ submitVerify: { waitMs: 10_000, retries: 0 } });
      try {
        rig.fake.stallDelivery("*", true);
        const a = newCardId();
        const paneA = await startCard(rig, a, { settle: 50 });
        const b = rig.fake.getPaneSeq(paneA)!.scs;
        rig.fake.pushEvent("pane_agent_status_changed", { pane_id: paneA, agent_status: "idle" });
        await Bun.sleep(800);
        expect(rig.fake.getPaneSeq(paneA)).toEqual({ status: "idle", scs: b, cs: null });
        expect(agentGets(rig.fake, paneA, a).length).toBeGreaterThanOrEqual(3);
        expect(await results(a)).toHaveLength(0);
      } finally {
        await rig.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "③ startup idle (cs null) after a working event → no completion (event sawWorking is not authority)",
    async () => {
      const rig = await startRig({ submitVerify: { waitMs: 10_000, retries: 0 } });
      try {
        rig.fake.stallDelivery("*", true);
        const a = newCardId();
        const paneA = await startCard(rig, a, { settle: 50 });
        rig.fake.pushEvent("pane_agent_status_changed", { pane_id: paneA, agent_status: "working" });
        await Bun.sleep(50);
        rig.fake.pushEvent("pane_agent_status_changed", { pane_id: paneA, agent_status: "idle" });
        await Bun.sleep(800);
        expect(rig.fake.getPaneSeq(paneA)!.cs).toBeNull();
        expect(await results(a)).toHaveLength(0);
      } finally {
        await rig.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "④ stale done from a previous run (cs ≤ b) → no completion (done event + snapshot)",
    async () => {
      const rig = await startRig({
        agentStartStatus: ["working", "done"],
        submitVerify: { waitMs: 10_000, retries: 0 },
      });
      try {
        rig.fake.stallDelivery("*", true);
        const a = newCardId();
        const paneA = await startCard(rig, a, { settle: 50 });
        const s = rig.fake.getPaneSeq(paneA)!;
        expect(s.status).toBe("done");
        expect(s.cs).not.toBeNull();
        expect(s.cs!).toBeLessThanOrEqual(s.scs);
        rig.fake.pushEvent("pane_agent_status_changed", { pane_id: paneA, agent_status: "done" });
        await Bun.sleep(800);
        expect(await results(a)).toHaveLength(0);
      } finally {
        await rig.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "⑤ completion event lost (setAgentStatus, no broadcast) + re-subscribe → tick snapshot completes normally · no status_lost",
    async () => {
      const rig = await startRig();
      try {
        const a = newCardId();
        const paneA = await startCard(rig, a);
        rig.fake.setPaneReadText(paneA, "SCRAPE-5");
        rig.fake.setAgentStatus(paneA, "idle"); // idle event lost
        await startCard(rig, newCardId()); // card B subscribe replaces the socket
        const rs = await waitResults(a, 4_000);
        await Bun.sleep(GRACE_MS * 2);
        expect(await results(a)).toHaveLength(1);
        expect(rs[0]!.reason).toBe("needs_verification");
        expect(rs[0]!.output).toContain("SCRAPE-5");
        expect(rs.filter((r) => r.reason === "status_lost")).toHaveLength(0);
      } finally {
        await rig.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "⑥ re-subscribe ACK → poller trigger (agent.get) · watchdog state machine not entered",
    async () => {
      const rig = await startRig({ pollMs: NO_TICK_MS });
      try {
        await withStderr(async (lines) => {
          const a = newCardId();
          const paneA = await startCard(rig, a, { settle: 1_000 });
          rig.fake.setAgentStatus(paneA, "idle"); // lost
          const base = agentGets(rig.fake, paneA, a).length;
          await startCard(rig, newCardId(), { settle: 50 }); // ACK
          expect(await waitFor(() => agentGets(rig.fake, paneA, a).length > base, 1_000)).toBe(true);
          const rs = await waitResults(a, 3_000);
          await Bun.sleep(GRACE_MS * 2);
          expect(await results(a)).toHaveLength(1);
          expect(rs[0]!.reason).toBe("needs_verification");
          expect(
            lines.filter((l) => l.includes("status-loss watchdog") && l.includes(`card ${a}`)),
          ).toHaveLength(0);
        });
      } finally {
        await rig.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "⑦ blocked ∧ scs > b (event lost) → exactly one agent_blocked",
    async () => {
      const rig = await startRig();
      try {
        const a = newCardId();
        const paneA = await startCard(rig, a);
        rig.fake.setAgentStatus(paneA, "blocked");
        const rs = await waitResults(a, 4_000);
        await Bun.sleep(300);
        expect(await results(a)).toHaveLength(1);
        expect(rs[0]!.status).toBe("failed");
        expect(rs[0]!.reason).toBe("agent_blocked");
      } finally {
        await rig.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "⑧ agent.get fails permanently → after W one failed/status_unavailable · note verbatim · scrape output · no pane.close · no done",
    async () => {
      const rig = await startRig({ wMs: SHORT_W_MS });
      try {
        await withStderr(async (lines) => {
          const a = newCardId();
          const paneA = await startCard(rig, a);
          rig.fake.setPaneReadText(paneA, "SCRAPE-8");
          rig.fake.failAgentGet(paneA, true);
          const t0 = Date.now();
          const rs = await waitResults(a, SHORT_W_MS + 4_000);
          const elapsed = Date.now() - t0;
          await Bun.sleep(400);
          expect(await results(a)).toHaveLength(1);
          expect(rs[0]!.status).toBe("failed");
          expect(rs[0]!.reason).toBe("status_unavailable");
          expect(rs[0]!.note).toMatch(UNAVAILABLE_NOTE_RE);
          expect(rs[0]!.output).toContain("SCRAPE-8");
          expect(rs[0]!.summary ?? "").toContain("failed reason=status_unavailable");
          expect(elapsed).toBeGreaterThanOrEqual(SHORT_W_MS - 400);
          expect(rs.filter((r) => r.status === "done")).toHaveLength(0);
          expect(paneCloses(rig.fake, paneA)).toHaveLength(0);
          expect(
            lines.filter((l) => l.includes(`card ${a}: status_unavailable after`)),
          ).toHaveLength(1);
        });
      } finally {
        await rig.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "⑨ a current-generation scs > b progress snapshot (working) resets W — outages shorter than W never fire",
    async () => {
      const rig = await startRig({ wMs: SHORT_W_MS });
      try {
        const a = newCardId();
        const paneA = await startCard(rig, a);
        for (let i = 0; i < 3; i++) {
          rig.fake.failAgentGet(paneA, true);
          await Bun.sleep(1_000);
          rig.fake.failAgentGet(paneA, false);
          await Bun.sleep(300); // ≥ 2 ticks of working · scs > b
        }
        expect(await results(a)).toHaveLength(0);
        rig.fake.setAgentStatus(paneA, "idle");
        const rs = await waitResults(a, 3_000);
        expect(rs).toHaveLength(1);
        expect(rs[0]!.reason).toBe("needs_verification");
      } finally {
        await rig.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "⑨ before delivery, authoritative scs ≤ b snapshots (idle · scs = b) never reset W → status_unavailable · no inject_unconfirmed",
    async () => {
      // Verify round longer than W: no round close (no `undelivered` reset) before expiry.
      const rig = await startRig({ wMs: SHORT_W_MS, submitVerify: { waitMs: 10_000, retries: 1 } });
      try {
        rig.fake.stallDelivery("*", true);
        const a = newCardId();
        const paneA = await startCard(rig, a, { settle: 0 });
        const t0 = Date.now();
        const rs = await waitResults(a, SHORT_W_MS + 4_000);
        const elapsed = Date.now() - t0;
        expect(agentGets(rig.fake, paneA, a).length).toBeGreaterThanOrEqual(5);
        expect(rs).toHaveLength(1);
        expect(rs[0]!.reason).toBe("status_unavailable");
        expect(elapsed).toBeLessThan(SHORT_W_MS + 1_500);
        expect(rs.filter((r) => r.reason === "inject_unconfirmed")).toHaveLength(0);
      } finally {
        await rig.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "⑩ baseline read fails → no inject · after W one status_unavailable",
    async () => {
      const rig = await startRig({ wMs: SHORT_W_MS });
      try {
        rig.fake.failAgentGet("*", true);
        const a = newCardId();
        const paneA = await startCard(rig, a, { prompt: false });
        const rs = await waitResults(a, SHORT_W_MS + 4_000);
        await Bun.sleep(300);
        expect(await results(a)).toHaveLength(1);
        expect(rs[0]!.status).toBe("failed");
        expect(rs[0]!.reason).toBe("status_unavailable");
        expect(rs[0]!.note).toMatch(UNAVAILABLE_NOTE_RE);
        expect(prompts(rig.fake, a)).toHaveLength(0);
        expect(paneCloses(rig.fake, paneA)).toHaveLength(0);
      } finally {
        await rig.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "⑪ stallDelivery → undelivered rounds → one reinject key per consumed retry · no agent.get between probe and key · exhaustion → inject_unconfirmed",
    async () => {
      const waitMs = 600;
      const rig = await startRig({ pollMs: NO_TICK_MS, submitVerify: { waitMs, retries: 1 } });
      try {
        rig.fake.stallDelivery("*", true);
        const a = newCardId();
        const paneA = await startCard(rig, a, { settle: 0 });
        const rs = await waitResults(a, waitMs * 4 + 3_000);
        await Bun.sleep(300);
        expect(await results(a)).toHaveLength(1);
        expect(rs[0]!.reason).toBe("inject_unconfirmed");
        expect(reinjectKeys(rig.fake, a)).toBe(1);
        // Between the R17 probe scrape and the key: cache only, no reinject agent.get.
        const firstPromptIdx = rig.fake.calls.findIndex(
          (c) => c.method === "agent.prompt" && c.params.target === agentName(a),
        );
        const keyIdx = rig.fake.calls.findIndex(
          (c, i) =>
            i > firstPromptIdx &&
            (c.method === "agent.send_keys" || c.method === "agent.prompt") &&
            c.params.target === agentName(a),
        );
        expect(keyIdx).toBeGreaterThan(0);
        let probeIdx = -1;
        for (let i = keyIdx - 1; i >= 0; i--) {
          const c = rig.fake.calls[i]!;
          if (c.method === "pane.read" && c.params.pane_id === paneA) {
            probeIdx = i;
            break;
          }
        }
        expect(probeIdx).toBeGreaterThan(0);
        const between = rig.fake.calls
          .slice(probeIdx + 1, keyIdx)
          .filter((c) => isAgentGetFor(c, paneA, a));
        expect(between).toHaveLength(0);
        // The round was classified from snapshots it read itself (idle · scs = b).
        expect(agentGets(rig.fake, paneA, a).length).toBeGreaterThanOrEqual(2);
      } finally {
        await rig.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "⑪ after a reinject the new generation (b' = evidence scs = b) still accepts the later cs > b completion · the stale done/cs = b between rounds neither completes nor counts as delivered (b' not below b)",
    async () => {
      const waitMs = 600;
      // Reused pane: baseline = stale done with cs = scs = b (R69-L2 evidence shape).
      const rig = await startRig({
        agentStartStatus: ["working", "done"],
        submitVerify: { waitMs, retries: 3 },
      });
      try {
        await withStderr(async (lines) => {
          rig.fake.stallDelivery("*", true);
          const a = newCardId();
          const paneA = await startCard(rig, a, { settle: 0 });
          const s0 = rig.fake.getPaneSeq(paneA)!;
          const b = s0.scs;
          expect(s0.status).toBe("done");
          expect(s0.cs).toBe(b);
          expect(
            lines.filter((l) => l.includes(`card ${a}: snapshot authority on (b=${b})`)),
          ).toHaveLength(1);
          // Round 1 undelivered → key 1 · b' = round evidence scs = b.
          expect(await waitFor(() => reinjectKeys(rig.fake, a) >= 1, waitMs * 3 + 2_000, 10)).toBe(
            true,
          );
          // Round 2 is judged against b': the same done/scs = b must be undelivered
          // again (key 2). A b' below b would read scs = b as delivered (no key 2) and
          // a cs > b' completion check would complete on the stale done/cs = b.
          expect(await waitFor(() => reinjectKeys(rig.fake, a) >= 2, waitMs * 3 + 2_000, 10)).toBe(
            true,
          );
          expect(await results(a)).toHaveLength(0);
          rig.fake.stallDelivery("*", false);
          rig.fake.setAgentStatus(paneA, "working");
          const scsW = rig.fake.getPaneSeq(paneA)!.scs;
          must(
            await waitSnapshotApplied(
              rig.fake,
              paneA,
              (e) => e.status === "working" && e.scs >= scsW,
              2_000,
            ),
            "working/scs > b snapshot applied before the completion",
          );
          rig.fake.setAgentStatus(paneA, "idle");
          const rs = await waitResults(a, 4_000);
          await Bun.sleep(300);
          expect(await results(a)).toHaveLength(1);
          expect(rs[0]!.reason).toBe("needs_verification");
          expect(rs.filter((r) => r.reason === "inject_unconfirmed")).toHaveLength(0);
          expect(reinjectKeys(rig.fake, a)).toBe(2);
        });
      } finally {
        await rig.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "⑫ agent.get fails during verify → no inject_unconfirmed · rounds not consumed (no reinject key)",
    async () => {
      const waitMs = 400;
      const rig = await startRig({ submitVerify: { waitMs, retries: 1 } });
      try {
        rig.fake.stallDelivery("*", true);
        const a = newCardId();
        await startCard(rig, a, { settle: 0 });
        rig.fake.failAgentGet("*", true); // baseline already read; verify reads fail
        await Bun.sleep(waitMs * 6);
        expect(await results(a)).toHaveLength(0);
        expect(reinjectKeys(rig.fake, a)).toBe(0);
      } finally {
        await rig.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "⑬ still-running deferral · snapshot working ∧ scs > lastConsumedCs cancels it · next cs > lastConsumedCs re-enters → one needs_verification",
    async () => {
      const rig = await startRig();
      try {
        await withStderr(async (lines) => {
          const a = newCardId();
          const paneA = await startCard(rig, a);
          rig.fake.setPaneReadText(paneA, "working on it\n1 command still running");
          rig.fake.setAgentStatus(paneA, "idle"); // cs1 > b → completion → indicator → deferral
          // The `still-running indicator — deferring completion` line is existing
          // 0.23.7 telemetry, relied on here only as a milestone (deferral started) —
          // not a 0.46.0 contract; a green may reword it if it keeps a marker.
          must(
            await waitFor(
              () =>
                completionLines(lines, a) === 1 &&
                lines.some((l) =>
                  l.includes(`card ${a}: still-running indicator — deferring completion`),
                ),
              3_000,
              10,
            ),
            "snapshot completion entered and still-running deferral started",
          );
          expect(await results(a)).toHaveLength(0);
          rig.fake.setAgentStatus(paneA, "working"); // new transition, scs > cs1
          const scsW = rig.fake.getPaneSeq(paneA)!.scs;
          must(
            await waitSnapshotApplied(
              rig.fake,
              paneA,
              (e) => e.status === "working" && e.scs >= scsW,
              2_000,
            ),
            "working ∧ scs > lastConsumedCs snapshot applied during the deferral",
          );
          rig.fake.setPaneReadText(paneA, "SCRAPE-13 final answer");
          rig.fake.setAgentStatus(paneA, "idle"); // cs2 > cs1
          // Deferral poll is 60s: a result now proves cancel + re-entry.
          const rs = await waitResults(a, 4_000);
          await Bun.sleep(300);
          expect(await results(a)).toHaveLength(1);
          expect(rs[0]!.reason).toBe("needs_verification");
          expect(rs[0]!.output).toContain("SCRAPE-13");
          expect(completionLines(lines, a)).toBe(2);
        });
      } finally {
        await rig.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "⑭ repeated same-scs working snapshots keep a live permission_prompt hookHint → completion corrected to agent_blocked",
    async () => {
      const rig = await startRig({ hookSensor: true });
      try {
        const a = newCardId();
        const paneA = await startCard(rig, a); // delivery working applied (hint cleared once)
        await writeLineToSocket(hookSocketPath(a, 1), '{"kind":"permission_prompt"}');
        const base = agentGets(rig.fake, paneA, a).length;
        await Bun.sleep(600);
        expect(agentGets(rig.fake, paneA, a).length - base).toBeGreaterThanOrEqual(3);
        rig.fake.setAgentStatus(paneA, "idle");
        const rs = await waitResults(a, 4_000);
        await Bun.sleep(300);
        expect(await results(a)).toHaveLength(1);
        expect(rs[0]!.status).toBe("failed");
        expect(rs[0]!.reason).toBe("agent_blocked");
      } finally {
        await rig.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "⑮ snapshot path: a done event alone (before the poll reply) → no completion · the event only wakes the poller",
    async () => {
      const rig = await startRig({ pollMs: NO_TICK_MS });
      try {
        const a = newCardId();
        const paneA = await startCard(rig, a, { settle: 1_000 });
        rig.fake.holdAgentGet(paneA, true);
        const base = agentGets(rig.fake, paneA, a).length;
        rig.fake.pushEvent("pane_agent_status_changed", { pane_id: paneA, agent_status: "done" });
        expect(await waitFor(() => agentGets(rig.fake, paneA, a).length > base, 1_000)).toBe(true);
        await Bun.sleep(300);
        expect(await results(a)).toHaveLength(0);
        rig.fake.holdAgentGet(paneA, false);
        rig.fake.releaseAgentGet(paneA); // stored status still working
        await Bun.sleep(400);
        expect(await results(a)).toHaveLength(0);
      } finally {
        await rig.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "⑯ pane.closed lifecycle event → failed/pane_closed as today (R8)",
    async () => {
      const rig = await startRig();
      try {
        const a = newCardId();
        const paneA = await startCard(rig, a);
        rig.fake.pushEvent("pane.closed", { pane_id: paneA });
        const rs = await waitResults(a, 3_000);
        await Bun.sleep(300);
        expect(await results(a)).toHaveLength(1);
        expect(rs[0]!.status).toBe("failed");
        expect(rs[0]!.reason).toBe("pane_closed");
      } finally {
        await rig.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "⑰ global concurrent agent.get ≤ agentGetConcurrency with more cards than the cap",
    async () => {
      const cap = 2;
      const rig = await startRig({ concurrency: cap });
      const panes: string[] = [];
      try {
        for (let i = 0; i < 6; i++) panes.push(await startCard(rig, newCardId(), { settle: 50 }));
        for (const p of panes) rig.fake.holdAgentGet(p, true);
        await Bun.sleep(POLL_MS * 6);
        expect(rig.fake.agentGetMaxInFlightGlobal()).toBe(cap);
      } finally {
        for (const p of panes) {
          rig.fake.holdAgentGet(p, false);
          rig.fake.releaseAgentGet(p);
        }
        await rig.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "⑱ per-flight agent.get ≤ 1 · triggers while in flight → exactly one re-query after the reply",
    async () => {
      const rig = await startRig({ pollMs: NO_TICK_MS });
      try {
        const a = newCardId();
        const paneA = await startCard(rig, a, { settle: 1_000 });
        rig.fake.holdAgentGet(paneA, true);
        const base = agentGets(rig.fake, paneA, a).length;
        const wake = () =>
          rig.fake.pushEvent("pane_agent_status_changed", { pane_id: paneA, agent_status: "working" });
        wake();
        expect(await waitFor(() => agentGets(rig.fake, paneA, a).length === base + 1, 1_000)).toBe(true);
        wake();
        wake();
        wake();
        await Bun.sleep(300);
        expect(agentGets(rig.fake, paneA, a).length).toBe(base + 1);
        rig.fake.holdAgentGet(paneA, false);
        rig.fake.releaseAgentGet(paneA);
        await Bun.sleep(400);
        expect(agentGets(rig.fake, paneA, a).length).toBe(base + 2);
        expect(rig.fake.agentGetMaxInFlight(paneA)).toBeLessThanOrEqual(1);
        expect(await results(a)).toHaveLength(0);
      } finally {
        await rig.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "⑲ no capability (seqMode none) → 0.45.4 path: lost idle + re-subscribe → one status_lost",
    async () => {
      const rig = await startRig({ seqMode: "none", agentStartStatus: null });
      try {
        const a = newCardId();
        const paneA = await startCard(rig, a, { pushWorking: true, settle: 150 });
        rig.fake.setPaneReadText(paneA, "SCRAPE-19");
        rig.fake.setAgentStatus(paneA, "idle"); // idle event lost
        await startCard(rig, newCardId(), { pushWorking: true, settle: 150 });
        const rs = await waitResults(a, GRACE_MS + 4_000);
        await Bun.sleep(GRACE_MS * 2);
        expect(await results(a)).toHaveLength(1);
        expect(rs[0]!.status).toBe("failed");
        expect(rs[0]!.reason).toBe("status_lost");
        expect(rs[0]!.note).toBe(statusLostNote("idle"));
        expect(rs[0]!.output).toContain("SCRAPE-19");
      } finally {
        await rig.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "⑳ advanceCompletionMidRun → completion entered at the mid-run edge (class 106 declared limit, pinned)",
    async () => {
      const rig = await startRig();
      try {
        const a = newCardId();
        const paneA = await startCard(rig, a);
        rig.fake.setPaneReadText(paneA, "SCRAPE-20 partial tool output");
        const b = rig.fake.getPaneSeq(paneA)!.scs;
        // Nonfocused pane: the mid-run edge publishes level done (cs = that edge's scs
        // — H8 · H9 · H20) for 600 ms, then working.
        rig.fake.advanceCompletionMidRun(paneA, 600);
        const edge = rig.fake.getPaneSeq(paneA)!;
        expect(edge.status).toBe("done");
        expect(edge.cs).toBe(edge.scs);
        expect(edge.cs!).toBeGreaterThan(b);
        const rs = await waitResults(a, 4_000);
        await Bun.sleep(300);
        expect(await results(a)).toHaveLength(1);
        expect(rs[0]!.reason).toBe("needs_verification");
        expect(rs[0]!.output).toContain("SCRAPE-20");
      } finally {
        await rig.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "㉑ old-generation agent.get reply (sent before the reinject switch) is dropped (runGen) — it does not classify the next round",
    async () => {
      const waitMs = 1_600;
      const rig = await startRig({ pollMs: NO_TICK_MS, submitVerify: { waitMs, retries: 2 } });
      try {
        rig.fake.stallDelivery("*", true);
        const a = newCardId();
        const paneA = await startCard(rig, a, { settle: 0 });
        const b = rig.fake.getPaneSeq(paneA)!.scs;
        // Park the R17 probe scrape: classification done, key not yet sent.
        rig.fake.holdPaneRead(paneA, true);
        must(
          await waitFor(() => rig.fake.paneReadHeldCount(paneA) >= 1, waitMs * 3, 10),
          "R17 probe scrape parked after the undelivered round close",
        );
        // Only one read parked (the probe — no settle scrape on an undelivered card).
        expect(rig.fake.paneReadHeldLines(paneA)).toHaveLength(1);
        expect(reinjectKeys(rig.fake, a)).toBe(0);
        // Old-generation snapshot (idle · scs = b) requested now, held.
        rig.fake.holdAgentGet(paneA, true);
        rig.fake.pushEvent("pane_agent_status_changed", { pane_id: paneA, agent_status: "idle" });
        must(
          await waitFor(() => rig.fake.agentGetHeldCount(paneA) >= 1, 1_000, 10),
          "old-generation agent.get in flight (held) before the switch",
        );
        const staleIdx = rig.fake.agentGetLog(paneA).length - 1;
        const stale = rig.fake.agentGetLog(paneA)[staleIdx]!;
        expect(stale.status).toBe("idle");
        expect(stale.scs).toBe(b);
        // Every later read fails (fail is checked before hold — the parked one stays).
        rig.fake.failAgentGet(paneA, true);
        rig.fake.holdPaneRead(paneA, false);
        rig.fake.releasePaneRead(paneA);
        must(
          await waitFor(() => reinjectKeys(rig.fake, a) >= 1, 2_000, 10),
          "reinject key sent (generation switched)",
        );
        // Observed key time: the new round's t0 is at/before it (t0 ≤ tKey), so
        // sentAt − tKey ≥ w/2 bounds the early side exactly; the late side gets
        // ≥ 400 ms slack (0.6w = 960 vs w − 100 = 1500 → 540 ms) for tKey − t0 lag
        // plus scheduling (Astra 0286 #3).
        const tKey = Date.now();
        // Deliver the stale reply inside the new round's late half [t0 + w/2, t0 + w).
        await Bun.sleep(Math.max(0, tKey + Math.floor(waitMs * 0.6) - Date.now()));
        rig.fake.holdAgentGet(paneA, false);
        rig.fake.releaseAgentGet(paneA);
        const sentAt = rig.fake.agentGetLog(paneA)[staleIdx]!.sentAt;
        must(
          sentAt !== null && sentAt - tKey >= waitMs * 0.5 && sentAt - tKey < waitMs - 100,
          `stale reply delivered in the new round's late half (at +${sentAt === null ? "?" : sentAt - tKey} ms)`,
        );
        await Bun.sleep(waitMs * 3);
        expect(reinjectKeys(rig.fake, a)).toBe(1);
        expect(await results(a)).toHaveLength(0);
      } finally {
        await rig.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "㉒ bridge stop with A's agent.get in flight and B's read queued (cap 1) → tick and queue released · the late reply is ignored · no agent.get / pane.read after stop · no result · no unhandled rejection",
    async () => {
      const rig = await startRig({ concurrency: 1 });
      const rejections: unknown[] = [];
      const onRejection = (e: unknown) => {
        rejections.push(e);
      };
      process.on("unhandledRejection", onRejection);
      try {
        const a = newCardId();
        const paneA = await startCard(rig, a);
        const b = newCardId();
        const paneB = await startCard(rig, b);
        rig.fake.holdAgentGet(paneA, true);
        must(
          await waitFor(() => rig.fake.agentGetHeldCount(paneA) >= 1, POLL_MS * 10, 10),
          "A's agent.get in flight (held) — the only slot",
        );
        const bGetsAtHold = agentGets(rig.fake, paneB, b).length;
        await Bun.sleep(POLL_MS * 4); // ≥ 3 of B's ticks
        must(
          agentGets(rig.fake, paneB, b).length === bGetsAtHold,
          "B's tick read queued behind A's held one",
        );
        const stopped = await Promise.race([
          rig.stopBridge().then(() => true),
          Bun.sleep(5_000).then(() => false),
        ]);
        must(stopped, "bridge.stop() returned with an agent.get in flight");
        const getsAtStopA = agentGets(rig.fake, paneA, a).length;
        const getsAtStopB = agentGets(rig.fake, paneB, b).length;
        const readsAtStop = rig.fake.paneReadCount();
        expect(rig.fake.agentGetHeldCount(paneA)).toBe(1);
        rig.fake.setAgentStatus(paneA, "idle");
        rig.fake.setAgentStatus(paneB, "idle");
        // The in-flight reply (built at request time) now arrives after stop.
        rig.fake.holdAgentGet(paneA, false);
        rig.fake.releaseAgentGet(paneA);
        await Bun.sleep(POLL_MS * 8);
        expect(agentGets(rig.fake, paneA, a).length).toBe(getsAtStopA);
        expect(agentGets(rig.fake, paneB, b).length).toBe(getsAtStopB); // queue released, never run
        expect(rig.fake.paneReadCount()).toBe(readsAtStop);
        expect(await results(a)).toHaveLength(0);
        expect(await results(b)).toHaveLength(0);
        expect(rejections).toHaveLength(0);
      } finally {
        process.off("unhandledRejection", onRejection);
        await rig.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "㉓ pending (baseline unread): done · blocked events + re-subscribe ACK → no result · no inject · no watchdog · baseline read re-scheduled",
    async () => {
      const rig = await startRig();
      try {
        await withStderr(async (lines) => {
          rig.fake.failAgentGet("*", true); // baseline cannot be read → pending
          const a = newCardId();
          const paneA = await startCard(rig, a, { prompt: false });
          await Bun.sleep(200);
          const base = agentGets(rig.fake, paneA, a).length;
          expect(base).toBeGreaterThanOrEqual(1);
          rig.fake.pushEvent("pane_agent_status_changed", { pane_id: paneA, agent_status: "done" });
          rig.fake.pushEvent("pane_agent_status_changed", { pane_id: paneA, agent_status: "blocked" });
          await startCard(rig, newCardId(), { prompt: false }); // ACK
          await Bun.sleep(800);
          expect(agentGets(rig.fake, paneA, a).length).toBeGreaterThan(base);
          expect(await results(a)).toHaveLength(0);
          expect(prompts(rig.fake, a)).toHaveLength(0);
          expect(
            lines.filter((l) => l.includes("status-loss watchdog") && l.includes(`card ${a}`)),
          ).toHaveLength(0);
        });
      } finally {
        await rig.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  /**
   * Part B (cases ㉔–㊻). Same rig. Extra fake-herdr hooks (PLAN R14 names,
   * default off): `releasePaneRead(pane, ok, count)` · `delayAgentGet` ·
   * `focusPane` · `nullCsOnFocus` · (Astra 0284 evidence) `holdPaneRead(pane, on,
   * minLines)` · `paneReadHeldLines` · `agentGetHeldCount` · `agentGetLog`.
   * Scrape probe hit = the pane's accumulated
   * inject text (default) · miss = `setPaneReadText(pane, "READY\n")`.
   */
  describe("part B — pending · completion token · reinject · verify rounds · W (㉔–㊻)", () => {
    function sendKeys(fake: FakeHerdr, cardId: string): number {
      return fake.calls.filter(
        (c) => c.method === "agent.send_keys" && c.params.target === agentName(cardId),
      ).length;
    }

    /**
     * ㉕–㉗ (Astra 0284 #1): hold the pane's reads, then `idle` (cs >
     * lastConsumedCs). Proves snapshot completion was entered (② telemetry) and
     * that each held read is its settle scrape — the card was delivered, so no
     * verify retry round ran (no CR key · one agent.prompt) and no R17 inject
     * probe can be among them — all before the test makes the pane `working`.
     */
    async function enterHeldCompletion(
      fake: FakeHerdr,
      paneId: string,
      cardId: string,
      lines: string[],
      attempt: number,
    ): Promise<void> {
      fake.holdPaneRead(paneId, true);
      fake.setAgentStatus(paneId, "idle");
      must(
        await waitFor(
          () =>
            completionLines(lines, cardId) === attempt &&
            fake.paneReadHeldCount(paneId) >= attempt,
          3_000,
          10,
        ),
        `snapshot completion (cs=…) entered with its settle scrape held (attempt ${attempt})`,
      );
      expect(fake.paneReadHeldLines(paneId)).toHaveLength(attempt);
      expect(sendKeys(fake, cardId)).toBe(0);
      expect(prompts(fake, cardId)).toHaveLength(1);
    }

    /** The cancelling `working` snapshot is applied while `held` settle reads stay parked. */
    async function workingAppliedWhileHeld(
      fake: FakeHerdr,
      paneId: string,
      held: number,
    ): Promise<void> {
      const scsW = fake.getPaneSeq(paneId)!.scs;
      must(
        await waitSnapshotApplied(
          fake,
          paneId,
          (e) => e.status === "working" && e.scs >= scsW,
          3_000,
        ),
        "working snapshot applied before the scrape release",
      );
      expect(fake.paneReadHeldLines(paneId)).toHaveLength(held);
    }

    test(
      "㉔ pending baseline fails permanently → stays pending · re-read every tick · no inject · after W one status_unavailable · no status_lost",
      async () => {
        const rig = await startRig({ wMs: SHORT_W_MS });
        try {
          rig.fake.failAgentGet("*", true);
          const a = newCardId();
          const tStart = Date.now();
          const paneA = await startCard(rig, a, { prompt: false });
          const base = agentGets(rig.fake, paneA, a).length;
          await Bun.sleep(POLL_MS * 10);
          // One baseline retry per tick (R2 · R11): ≥ half the ticks in 1 s.
          expect(agentGets(rig.fake, paneA, a).length - base).toBeGreaterThanOrEqual(5);
          expect(prompts(rig.fake, a)).toHaveLength(0);
          const rs = await waitResults(a, SHORT_W_MS + 4_000);
          const elapsed = Date.now() - tStart;
          await Bun.sleep(300);
          expect(await results(a)).toHaveLength(1);
          expect(rs[0]!.status).toBe("failed");
          expect(rs[0]!.reason).toBe("status_unavailable");
          expect(rs[0]!.note).toMatch(UNAVAILABLE_NOTE_RE);
          // Window clock = flight creation (H1), not a later reset.
          expect(elapsed).toBeLessThan(SHORT_W_MS + 1_500);
          expect(prompts(rig.fake, a)).toHaveLength(0);
          expect((await results(a)).filter((r) => r.reason === "status_lost")).toHaveLength(0);
        } finally {
          await rig.close();
        }
      },
      TEST_TIMEOUT_MS,
    );

    test(
      "㉕ completion attempt: settle scrape held → snapshot working cancels → scrape released OK → no result (H2 token)",
      async () => {
        const rig = await startRig();
        try {
          await withStderr(async (lines) => {
            const a = newCardId();
            const paneA = await startCard(rig, a);
            rig.fake.setPaneReadText(paneA, "SCRAPE-25 stale partial");
            await enterHeldCompletion(rig.fake, paneA, a, lines, 1);
            rig.fake.setAgentStatus(paneA, "working"); // scs > lastAppliedScs → cancel
            await workingAppliedWhileHeld(rig.fake, paneA, 1);
            rig.fake.holdPaneRead(paneA, false);
            rig.fake.releasePaneRead(paneA, true);
            await Bun.sleep(800);
            expect(await results(a)).toHaveLength(0);
            expect(completionLines(lines, a)).toBe(1);
          });
        } finally {
          await rig.close();
        }
      },
      TEST_TIMEOUT_MS,
    );

    test(
      "㉖ completion attempt: settle scrape held → snapshot working cancels → scrape released as failure → no result · no needs_verification",
      async () => {
        const rig = await startRig();
        try {
          await withStderr(async (lines) => {
            const a = newCardId();
            const paneA = await startCard(rig, a);
            await enterHeldCompletion(rig.fake, paneA, a, lines, 1);
            rig.fake.setAgentStatus(paneA, "working");
            await workingAppliedWhileHeld(rig.fake, paneA, 1);
            rig.fake.holdPaneRead(paneA, false);
            rig.fake.releasePaneRead(paneA, false);
            await Bun.sleep(800);
            const rs = await results(a);
            expect(rs).toHaveLength(0);
            expect(rs.filter((r) => r.reason === "needs_verification")).toHaveLength(0);
            expect(completionLines(lines, a)).toBe(1);
          });
        } finally {
          await rig.close();
        }
      },
      TEST_TIMEOUT_MS,
    );

    test(
      "㉗ cancel + re-arm (new cs > lastConsumedCs) while the old scrape is still held → old release is void · only the new attempt yields one result",
      async () => {
        const rig = await startRig();
        try {
          await withStderr(async (lines) => {
            const a = newCardId();
            const paneA = await startCard(rig, a);
            rig.fake.setPaneReadText(paneA, "SCRAPE-27-OLD");
            await enterHeldCompletion(rig.fake, paneA, a, lines, 1); // attempt 1 (cs1)
            rig.fake.setAgentStatus(paneA, "working"); // cancel
            await workingAppliedWhileHeld(rig.fake, paneA, 1);
            rig.fake.setPaneReadText(paneA, "SCRAPE-27-NEW");
            rig.fake.setAgentStatus(paneA, "idle"); // cs2 > cs1 → attempt 2 (scrape held)
            must(
              await waitFor(
                () => completionLines(lines, a) === 2 && rig.fake.paneReadHeldCount(paneA) >= 2,
                3_000,
                10,
              ),
              "re-armed snapshot completion (attempt 2) with its settle scrape held",
            );
            expect(rig.fake.paneReadHeldLines(paneA)).toHaveLength(2);
            rig.fake.holdPaneRead(paneA, false);
            // Release only the oldest (attempt 1) — attempt 2 stays parked.
            rig.fake.releasePaneRead(paneA, true, 1);
            await Bun.sleep(800);
            expect(await results(a)).toHaveLength(0);
            expect(rig.fake.paneReadHeldLines(paneA)).toHaveLength(1);
            rig.fake.releasePaneRead(paneA, true);
            const rs = await waitResults(a, 4_000);
            await Bun.sleep(300);
            expect(await results(a)).toHaveLength(1);
            expect(rs[0]!.reason).toBe("needs_verification");
            expect(rs[0]!.output).toContain("SCRAPE-27-NEW");
            expect(rs[0]!.output ?? "").not.toContain("SCRAPE-27-OLD");
          });
        } finally {
          await rig.close();
        }
      },
      TEST_TIMEOUT_MS,
    );

    test(
      // Narrowed (Astra 0284 #6): "no retry refund" is not observable here — the
      // cancelled reinject continues as a delivered verify, which runs no further
      // round that could exhaust. This case pins the cancel + current-generation path.
      "㉘ undelivered classified · R17 probe scrape held · poller applies current-gen working/scs > b → pre-key cache check cancels reinject · no key · completes in the current generation (settle read lines > probe lines)",
      async () => {
        const waitMs = 600;
        const rig = await startRig({ submitVerify: { waitMs, retries: 1 } });
        try {
          rig.fake.stallDelivery("*", true);
          const a = newCardId();
          const paneA = await startCard(rig, a, { settle: 0 });
          rig.fake.holdPaneRead(paneA, true);
          // Round 1 closes `undelivered` (retry consumed) → R17 probe parked.
          must(
            await waitFor(() => rig.fake.paneReadHeldCount(paneA) >= 1, waitMs * 3, 10),
            "R17 probe scrape parked after the undelivered round close",
          );
          expect(rig.fake.paneReadHeldLines(paneA)).toHaveLength(1);
          const probeLines = rig.fake.paneReadHeldLines(paneA)[0]!;
          const readsAtProbe = paneReadLines(rig.fake, paneA).length;
          expect(reinjectKeys(rig.fake, a)).toBe(0);
          rig.fake.stallDelivery("*", false);
          rig.fake.setAgentStatus(paneA, "working"); // late first delivery · scs > b
          const scsW = rig.fake.getPaneSeq(paneA)!.scs;
          must(
            await waitSnapshotApplied(
              rig.fake,
              paneA,
              (e) => e.status === "working" && e.scs >= scsW,
              2_000,
            ),
            "current-gen working/scs > b applied (deliveredSeen) before the key",
          );
          expect(rig.fake.paneReadHeldLines(paneA)).toEqual([probeLines]);
          rig.fake.holdPaneRead(paneA, false);
          rig.fake.releasePaneRead(paneA, true);
          await Bun.sleep(400);
          expect(reinjectKeys(rig.fake, a)).toBe(0);
          rig.fake.setPaneReadText(paneA, "SCRAPE-28");
          rig.fake.setAgentStatus(paneA, "idle");
          const rs = await waitResults(a, 4_000);
          await Bun.sleep(300);
          expect(await results(a)).toHaveLength(1);
          expect(rs[0]!.reason).toBe("needs_verification");
          expect(rs[0]!.output).toContain("SCRAPE-28");
          expect(reinjectKeys(rig.fake, a)).toBe(0);
          // Settlement read (the completion's scrape, after the probe) requests
          // more lines than the inject probe — both observed from the fake.
          const settleReads = paneReadLines(rig.fake, paneA).slice(readsAtProbe);
          expect(settleReads.length).toBeGreaterThanOrEqual(1);
          for (const n of settleReads) expect(n).toBeGreaterThan(probeLines);
        } finally {
          await rig.close();
        }
      },
      TEST_TIMEOUT_MS,
    );

    test(
      "㉙ reinject: scrape probe hit → CR only · agent.prompt not re-called (R17a)",
      async () => {
        const waitMs = 600;
        const rig = await startRig({ submitVerify: { waitMs, retries: 1 } });
        try {
          rig.fake.stallDelivery("*", true);
          const a = newCardId();
          await startCard(rig, a, { settle: 0 }); // pane text holds the prompt → hit
          const rs = await waitResults(a, waitMs * 4 + 3_000);
          await Bun.sleep(300);
          expect(sendKeys(rig.fake, a)).toBe(1);
          expect(prompts(rig.fake, a)).toHaveLength(1);
          expect(await results(a)).toHaveLength(1);
          expect(rs[0]!.reason).toBe("inject_unconfirmed");
        } finally {
          await rig.close();
        }
      },
      TEST_TIMEOUT_MS,
    );

    test(
      "㉚ probe miss ∧ !reinjectUsed → one retype · next miss in the same verify call → CR (retype ≤ 1 — R69-M1) · reinject retyped telemetry · late cs > b completion accepted (class 107)",
      async () => {
        const waitMs = 600;
        const rig = await startRig({ submitVerify: { waitMs, retries: 3 } });
        try {
          await withStderr(async (lines) => {
            rig.fake.stallDelivery("*", true);
            const a = newCardId();
            const paneA = await startCard(rig, a, { settle: 0 });
            rig.fake.setPaneReadText(paneA, "READY\n"); // probe miss
            expect(await waitFor(() => reinjectKeys(rig.fake, a) >= 2, waitMs * 4 + 2_000)).toBe(
              true,
            );
            expect(prompts(rig.fake, a)).toHaveLength(2); // original + one retype
            expect(sendKeys(rig.fake, a)).toBeGreaterThanOrEqual(1);
            expect(
              lines.filter((l) =>
                l.includes(
                  `card ${a}: reinject retyped — completion attribution is per-card-prompt (b=`,
                ),
              ),
            ).toHaveLength(1);
            // Run 1 finishes late (cs > original b) — accepted as this card's completion.
            rig.fake.stallDelivery("*", false);
            rig.fake.setAgentStatus(paneA, "working");
            await Bun.sleep(POLL_MS * 2);
            rig.fake.setPaneReadText(paneA, "SCRAPE-30");
            rig.fake.setAgentStatus(paneA, "idle");
            const rs = await waitResults(a, 4_000);
            await Bun.sleep(300);
            expect(await results(a)).toHaveLength(1);
            expect(rs[0]!.reason).toBe("needs_verification");
            expect(prompts(rig.fake, a)).toHaveLength(2);
          });
        } finally {
          await rig.close();
        }
      },
      TEST_TIMEOUT_MS,
    );

    test(
      "㉛ reinject: scrape probe read fails → CR only (R17a conservative default) · no retype even though the text would miss",
      async () => {
        const waitMs = 600;
        const rig = await startRig({ submitVerify: { waitMs, retries: 1 } });
        try {
          rig.fake.stallDelivery("*", true);
          const a = newCardId();
          const paneA = await startCard(rig, a, { settle: 0 });
          rig.fake.setPaneReadText(paneA, "READY\n"); // a successful read would miss
          rig.fake.holdPaneRead(paneA, true);
          expect(await waitFor(() => rig.fake.paneReadHeldCount(paneA) >= 1, waitMs * 3)).toBe(true);
          rig.fake.holdPaneRead(paneA, false);
          rig.fake.releasePaneRead(paneA, false); // probe read-fail
          expect(await waitFor(() => reinjectKeys(rig.fake, a) >= 1, 2_000)).toBe(true);
          await Bun.sleep(200);
          expect(sendKeys(rig.fake, a)).toBe(1);
          expect(prompts(rig.fake, a)).toHaveLength(1);
        } finally {
          await rig.close();
        }
      },
      TEST_TIMEOUT_MS,
    );

    test(
      "㉜ already-focused pane completion (cs filled — probe f) → exactly one needs_verification (H5)",
      async () => {
        const rig = await startRig();
        try {
          const a = newCardId();
          const paneA = await startCard(rig, a);
          rig.fake.focusPane(paneA);
          rig.fake.setPaneReadText(paneA, "SCRAPE-32");
          rig.fake.setAgentStatus(paneA, "idle");
          expect(rig.fake.getPaneSeq(paneA)!.cs).not.toBeNull();
          const rs = await waitResults(a, 4_000);
          await Bun.sleep(300);
          expect(await results(a)).toHaveLength(1);
          expect(rs[0]!.reason).toBe("needs_verification");
          expect(rs[0]!.output).toContain("SCRAPE-32");
        } finally {
          await rig.close();
        }
      },
      TEST_TIMEOUT_MS,
    );

    test(
      "㉝ after delivery (scs > b) the same-scs working outlasts W → no status_unavailable (R10 working correction)",
      async () => {
        const rig = await startRig({ wMs: SHORT_W_MS });
        try {
          const a = newCardId();
          const paneA = await startCard(rig, a);
          const s = rig.fake.getPaneSeq(paneA)!;
          expect(s.status).toBe("working");
          await Bun.sleep(SHORT_W_MS * 2);
          expect(rig.fake.getPaneSeq(paneA)!.scs).toBe(s.scs);
          expect(await results(a)).toHaveLength(0);
        } finally {
          await rig.close();
        }
      },
      TEST_TIMEOUT_MS,
    );

    test(
      "㉞ after delivery an authoritative idle with cs null persists (nullCsOnFocus) → W not reset → after W one status_unavailable (no silent stall)",
      async () => {
        const rig = await startRig({ wMs: SHORT_W_MS });
        try {
          const a = newCardId();
          const paneA = await startCard(rig, a);
          rig.fake.nullCsOnFocus(paneA, true);
          rig.fake.setAgentStatus(paneA, "idle"); // scs > b once · cs null
          expect(rig.fake.getPaneSeq(paneA)!.cs).toBeNull();
          const t0 = Date.now();
          const rs = await waitResults(a, SHORT_W_MS + 4_000);
          const elapsed = Date.now() - t0;
          await Bun.sleep(300);
          expect(await results(a)).toHaveLength(1);
          expect(rs[0]!.status).toBe("failed");
          expect(rs[0]!.reason).toBe("status_unavailable");
          expect(elapsed).toBeGreaterThanOrEqual(SHORT_W_MS - 400);
          expect(elapsed).toBeLessThan(SHORT_W_MS + 1_500);
        } finally {
          await rig.close();
        }
      },
      TEST_TIMEOUT_MS,
    );

    test(
      "㉟ idle ∧ scs == b only in the round's early half · late-half reads fail → unknown · round not consumed · no inject_unconfirmed · W not reset (M7)",
      async () => {
        const waitMs = 1_000;
        const rig = await startRig({ wMs: SHORT_W_MS, submitVerify: { waitMs, retries: 1 } });
        try {
          rig.fake.stallDelivery("*", true);
          const a = newCardId();
          const tBase = Date.now();
          const paneA = await startCard(rig, a, { settle: 0 });
          await Bun.sleep(Math.floor(waitMs * 0.35)); // early half: idle · scs = b snapshots
          rig.fake.failAgentGet(paneA, true); // late half (and after): reads fail
          const rs = await waitResults(a, SHORT_W_MS + 4_000);
          const elapsed = Date.now() - tBase;
          await Bun.sleep(300);
          expect(await results(a)).toHaveLength(1);
          expect(rs[0]!.reason).toBe("status_unavailable");
          expect(rs.filter((r) => r.reason === "inject_unconfirmed")).toHaveLength(0);
          expect(reinjectKeys(rig.fake, a)).toBe(0);
          expect(elapsed).toBeLessThan(SHORT_W_MS + 1_500);
        } finally {
          await rig.close();
        }
      },
      TEST_TIMEOUT_MS,
    );

    test(
      "㊱ the late-half read reply arrives after the round close (delayAgentGet) → unknown · no reinject key · W not reset (M7 · 0264 #2)",
      async () => {
        const waitMs = 800;
        const wMs = 2_500;
        const delayMs = Math.floor(waitMs * 0.75);
        // Short tick: W expiry is checked on the bridge tick (R10 · R11), so the
        // expiry bounds below are widened by one POLL_MS. The extra tick reads
        // are made non-authoritative (failAgentGet — no authority, never reset W).
        const rig = await startRig({
          pollMs: POLL_MS,
          wMs,
          submitVerify: { waitMs, retries: 1 },
        });
        try {
          rig.fake.stallDelivery("*", true);
          const a = newCardId();
          const paneA = await startCard(rig, a, { settle: 0 });
          const tPrompt = Date.now(); // ≥ baseline success (W start) · ≥ round 1 t0
          const b = rig.fake.getPaneSeq(paneA)!.scs;
          const promptIdx = rig.fake.calls.findIndex(
            (c) => c.method === "agent.prompt" && c.params.target === agentName(a),
          );
          const postInject = () =>
            rig.fake.agentGetLog(paneA).filter((e) => e.callIndex > promptIdx);
          // Round 1 early-half read answered undelayed, then the rest of the early
          // half sees only failed (non-authoritative) tick reads.
          must(
            await waitFor(() => postInject().some((e) => e.sentAt !== null), waitMs * 0.4, 10),
            "round-1 early-half read answered before the outage",
          );
          rig.fake.failAgentGet(paneA, true);
          await Bun.sleep(Math.max(0, tPrompt + Math.floor(waitMs * 0.55) - Date.now()));
          // Late half: exactly one delayed read (per-flight ≤ 1 holds the rest back).
          rig.fake.delayAgentGet(paneA, delayMs);
          const nBefore = postInject().length;
          rig.fake.failAgentGet(paneA, false);
          must(
            await waitFor(() => postInject().length > nBefore, waitMs, 10),
            "round-1 late-half read requested",
          );
          rig.fake.failAgentGet(paneA, true); // later reads: no qualifying evidence
          const late = postInject()[nBefore]!;
          must(
            late.requestedAt - tPrompt >= waitMs * 0.5 && !late.failed,
            `late-half read sent in the late half (at +${late.requestedAt - tPrompt} ms)`,
          );
          expect(late.status).toBe("idle");
          expect(late.scs).toBe(b);
          must(
            await waitFor(() => postInject()[nBefore]!.sentAt !== null, waitMs * 2, 10),
            "delayed late-half reply sent",
          );
          const lateSent = postInject()[nBefore]!.sentAt!;
          must(
            lateSent - tPrompt >= waitMs,
            `delayed reply arrived after round-1 close (at +${lateSent - tPrompt} ms)`,
          );
          await Bun.sleep(waitMs);
          expect(reinjectKeys(rig.fake, a)).toBe(0);
          expect((await results(a)).filter((r) => r.reason === "inject_unconfirmed")).toHaveLength(0);
          const rs = await waitResults(a, wMs + 4_000);
          const elapsed = Date.now() - tPrompt;
          expect(rs).toHaveLength(1);
          expect(rs[0]!.reason).toBe("status_unavailable");
          // W runs from the baseline; a reset at the late arrival (≥ +1.04 s) would
          // expire ≥ +3.54 s — rejected by the upper bound (W + 600 + one tick).
          expect(elapsed).toBeGreaterThanOrEqual(wMs - 400 - POLL_MS);
          expect(elapsed).toBeLessThan(wMs + 600 + POLL_MS);
          expect(reinjectKeys(rig.fake, a)).toBe(0);
        } finally {
          await rig.close();
        }
      },
      TEST_TIMEOUT_MS,
    );

    test(
      "㊲ the late-half read is stuck behind the agentGetConcurrency queue (no reply before close) → unknown · no reinject key · no result while blocked · after release no retry was consumed (one key, then inject_unconfirmed) (M7)",
      async () => {
        const waitMs = 800;
        const rig = await startRig({ concurrency: 1, submitVerify: { waitMs, retries: 1 } });
        let paneB = "";
        try {
          const b = newCardId();
          paneB = await startCard(rig, b); // delivered · working
          rig.fake.stallDelivery("*", true);
          const a = newCardId();
          const paneA = await startCard(rig, a, { settle: 0 }); // baseline read before the slot is taken
          const tPrompt = Date.now();
          rig.fake.holdAgentGet(paneB, true); // B's next tick read occupies the only slot
          must(
            await waitFor(() => rig.fake.agentGetHeldCount(paneB) >= 1, waitMs * 0.4, 10),
            "B's tick read holds the only slot before A's round-1 late half",
          );
          must(
            Date.now() - tPrompt < waitMs * 0.5,
            `slot taken before A's late-half read (at +${Date.now() - tPrompt} ms)`,
          );
          const aGetsAtBlock = agentGets(rig.fake, paneA, a).length;
          await Bun.sleep(waitMs * 3); // ≥ 2 full A rounds blocked
          // A's reads (incl. every late-half read) are queued, never sent.
          expect(agentGets(rig.fake, paneA, a).length).toBe(aGetsAtBlock);
          expect(rig.fake.agentGetHeldCount(paneB)).toBe(1);
          expect(rig.fake.agentGetMaxInFlightGlobal()).toBeLessThanOrEqual(1);
          expect(reinjectKeys(rig.fake, a)).toBe(0);
          expect(await results(a)).toHaveLength(0); // no premature result of any kind
          // Release: A's queued read runs. Blocked rounds were `unknown` (no retry
          // consumed) → still exactly one reinject (retries 1) before exhaustion.
          rig.fake.holdAgentGet(paneB, false);
          rig.fake.releaseAgentGet(paneB);
          must(
            await waitFor(() => agentGets(rig.fake, paneA, a).length > aGetsAtBlock, 1_000, 10),
            "A's queued read issued after the slot frees",
          );
          const rs = await waitResults(a, waitMs * 4 + 3_000);
          await Bun.sleep(300);
          expect(await results(a)).toHaveLength(1);
          expect(rs[0]!.reason).toBe("inject_unconfirmed");
          expect(reinjectKeys(rig.fake, a)).toBe(1);
        } finally {
          if (paneB) {
            rig.fake.holdAgentGet(paneB, false);
            rig.fake.releaseAgentGet(paneB);
          }
          await rig.close();
        }
      },
      TEST_TIMEOUT_MS,
    );

    test(
      "㊳ baseline working/scs = b persists after inject → W not reset · only unknown verify rounds (no retry consumed) → one status_unavailable · no inject_unconfirmed (0264 #1)",
      async () => {
        const waitMs = 600;
        const rig = await startRig({
          agentStartStatus: "working",
          wMs: SHORT_W_MS,
          submitVerify: { waitMs, retries: 1 },
        });
        try {
          rig.fake.stallDelivery("*", true);
          const a = newCardId();
          const tBase = Date.now();
          const paneA = await startCard(rig, a, { settle: 0 });
          const s = rig.fake.getPaneSeq(paneA)!;
          expect(s.status).toBe("working");
          const rs = await waitResults(a, SHORT_W_MS + 4_000);
          const elapsed = Date.now() - tBase;
          await Bun.sleep(300);
          expect(rig.fake.getPaneSeq(paneA)!.scs).toBe(s.scs);
          expect(await results(a)).toHaveLength(1);
          expect(rs[0]!.reason).toBe("status_unavailable");
          expect(rs.filter((r) => r.reason === "inject_unconfirmed")).toHaveLength(0);
          expect(reinjectKeys(rig.fake, a)).toBe(0);
          expect(elapsed).toBeLessThan(SHORT_W_MS + 1_500);
        } finally {
          await rig.close();
        }
      },
      TEST_TIMEOUT_MS,
    );

    test(
      "㊴ a delivered long working/scs > b outlasting W several times keeps resetting W · no failure · later completion normal (0264 #1)",
      async () => {
        const rig = await startRig({ wMs: SHORT_W_MS });
        try {
          const a = newCardId();
          const paneA = await startCard(rig, a);
          await Bun.sleep(SHORT_W_MS * 3);
          expect(await results(a)).toHaveLength(0);
          rig.fake.setAgentStatus(paneA, "idle");
          const rs = await waitResults(a, 4_000);
          await Bun.sleep(300);
          expect(await results(a)).toHaveLength(1);
          expect(rs[0]!.reason).toBe("needs_verification");
        } finally {
          await rig.close();
        }
      },
      TEST_TIMEOUT_MS,
    );

    test(
      "㊵ every round gets a timely late-half idle/scs = b (W < total retry time) → each round consumes a retry + resets W at round close → exhaustion → one inject_unconfirmed · no status_unavailable (0266 #1)",
      async () => {
        const waitMs = 600;
        const retries = 3;
        const wMs = 1_000; // < (retries + 1) × waitMs, > one round
        const rig = await startRig({ wMs, submitVerify: { waitMs, retries } });
        try {
          rig.fake.stallDelivery("*", true);
          const a = newCardId();
          await startCard(rig, a, { settle: 0 });
          const rs = await waitResults(a, (retries + 1) * waitMs + 4_000);
          await Bun.sleep(300);
          expect(await results(a)).toHaveLength(1);
          expect(rs[0]!.reason).toBe("inject_unconfirmed");
          expect(rs.filter((r) => r.reason === "status_unavailable")).toHaveLength(0);
          expect(reinjectKeys(rig.fake, a)).toBe(retries);
        } finally {
          await rig.close();
        }
      },
      TEST_TIMEOUT_MS,
    );

    test(
      "㊵ W resets at the undelivered round close, not at the late-half idle/scs = b receipt — outage after that snapshot → status_unavailable at close + W (R3 · R10 · Astra 0284 #2)",
      async () => {
        const waitMs = 1_600;
        const wMs = 2_400; // > one round: the baseline W cannot expire before round-1 close
        // Short tick: W expiry is checked on the bridge tick (R10 · R11) — bounds
        // widened by one POLL_MS. Tick reads after the receipt fail (no authority).
        const rig = await startRig({
          pollMs: POLL_MS,
          wMs,
          submitVerify: { waitMs, retries: 2 },
        });
        try {
          rig.fake.stallDelivery("*", true);
          const a = newCardId();
          const paneA = await startCard(rig, a, { settle: 0 });
          const tPrompt = Date.now(); // ≈ round 1 t0
          const b = rig.fake.getPaneSeq(paneA)!.scs;
          const promptIdx = rig.fake.calls.findIndex(
            (c) => c.method === "agent.prompt" && c.params.target === agentName(a),
          );
          // Round 1's late-half reply (receipt ≥ t0 + w/2), then cut agent.get.
          let receipt: AgentGetLogEntry | undefined;
          must(
            await waitFor(
              () => {
                receipt = rig.fake
                  .agentGetLog(paneA)
                  .find(
                    (e) =>
                      e.callIndex > promptIdx &&
                      !e.failed &&
                      e.sentAt !== null &&
                      e.sentAt - tPrompt >= waitMs * 0.45,
                  );
                return receipt !== undefined;
              },
              waitMs,
              10,
            ),
            "round-1 late-half reply received",
          );
          rig.fake.failAgentGet(paneA, true); // outage after the last idle/scs = b snapshot
          expect(receipt!.status).toBe("idle");
          expect(receipt!.scs).toBe(b);
          expect(reinjectKeys(rig.fake, a)).toBe(0);
          // Reference = the round-close classification moment, observed as the R17
          // probe pane.read: it is issued right after classification with no
          // agent.get between (⑪), so tClose (≤ 10 ms poll after the request) ≥
          // classification. The key may lag the probe; it is not the reference.
          const readsBefore = paneReadLines(rig.fake, paneA).length;
          must(
            await waitFor(() => paneReadLines(rig.fake, paneA).length > readsBefore, waitMs, 10),
            "round 1 classified undelivered at its close (probe read)",
          );
          const tClose = Date.now();
          must(
            await waitFor(() => reinjectKeys(rig.fake, a) >= 1, 2_000, 10),
            "undelivered round 1 sent its reinject key",
          );
          const gap = tClose - receipt!.sentAt!;
          // ≥ 0.4w = 640 ms keeps a receipt-reset expiry (≤ W − 640 + tick + result
          // poll) below the lower bound W − 250 − tick.
          must(gap >= waitMs * 0.4, `receipt and round-close classification apart (${gap} ms)`);
          const rs = await waitResults(a, wMs + 4_000);
          const sinceClose = Date.now() - tClose;
          await Bun.sleep(300);
          expect(await results(a)).toHaveLength(1);
          expect(rs[0]!.reason).toBe("status_unavailable");
          expect(rs.filter((r) => r.reason === "inject_unconfirmed")).toHaveLength(0);
          expect(reinjectKeys(rig.fake, a)).toBe(1);
          // A reset at receipt would expire `gap` (≈ w/2 = 800 ms, ≥ 640 ms) earlier.
          expect(sinceClose).toBeGreaterThanOrEqual(wMs - 250 - POLL_MS);
          expect(sinceClose).toBeLessThan(wMs + 700 + POLL_MS);
        } finally {
          await rig.close();
        }
      },
      TEST_TIMEOUT_MS,
    );

    test(
      "㊶ every round's idle/scs = b reply arrives after its round closed but while the flight is active (round < delay < W) → not evidence for the next round · W not reset → unknown rounds · one status_unavailable · no inject_unconfirmed",
      async () => {
        const waitMs = 500;
        const delayMs = 700; // > round length: each reply lands after its round's close
        const wMs = 3_500;
        const rig = await startRig({ wMs, submitVerify: { waitMs, retries: 1 } });
        try {
          rig.fake.stallDelivery("*", true);
          const a = newCardId();
          const paneA = await startCard(rig, a, { settle: 0 });
          const tPrompt = Date.now(); // ≈ baseline success (W start)
          const b = rig.fake.getPaneSeq(paneA)!.scs;
          const promptIdx = rig.fake.calls.findIndex(
            (c) => c.method === "agent.prompt" && c.params.target === agentName(a),
          );
          rig.fake.delayAgentGet(paneA, delayMs);
          const rs = await waitResults(a, wMs + 4_000);
          const elapsed = Date.now() - tPrompt;
          // Replies requested inside a round (length w) and sent ≥ delay > w later
          // arrived after that round's close; those sent well before the expiry
          // arrived while the flight was active — a wrong cross-round attribution
          // would classify the next round undelivered (key) · a reset would push W.
          const lateArrivals = rig.fake
            .agentGetLog(paneA)
            .filter(
              (e) =>
                e.callIndex > promptIdx &&
                !e.failed &&
                e.sentAt !== null &&
                e.sentAt - e.requestedAt >= delayMs - 20 &&
                e.sentAt - tPrompt < wMs - 300,
            );
          must(lateArrivals.length >= 3, `≥ 3 late arrivals while active (got ${lateArrivals.length})`);
          for (const e of lateArrivals) {
            expect(e.status).toBe("idle");
            expect(e.scs).toBe(b);
          }
          expect(rs).toHaveLength(1);
          expect(rs[0]!.reason).toBe("status_unavailable");
          expect(rs.filter((r) => r.reason === "inject_unconfirmed")).toHaveLength(0);
          expect(reinjectKeys(rig.fake, a)).toBe(0);
          // Last active arrival ≈ +2.5–3.2 s: a reset there would expire ≥ W later.
          expect(elapsed).toBeGreaterThanOrEqual(wMs - 400);
          expect(elapsed).toBeLessThan(wMs + 700);
        } finally {
          await rig.close();
        }
      },
      TEST_TIMEOUT_MS,
    );

    test(
      "㊷ rounds alternate undelivered (late idle/scs = b) and unknown (reads fail) → undelivered rounds = consumed retries · unknown rounds change neither · exactly one inject_unconfirmed (W long) · no endless wait (0266 #1)",
      async () => {
        const waitMs = 600;
        const retries = 2;
        const rig = await startRig({ wMs: LONG_W_MS, submitVerify: { waitMs, retries } });
        try {
          rig.fake.stallDelivery("*", true);
          const a = newCardId();
          const t0 = Date.now();
          const paneA = await startCard(rig, a, { settle: 0 });
          for (let k = 1; k <= retries; k++) {
            // Round 2k-1 undelivered → key k; the next round sees only failures.
            expect(await waitFor(() => reinjectKeys(rig.fake, a) >= k, waitMs * 3 + 2_000, 10)).toBe(
              true,
            );
            rig.fake.failAgentGet(paneA, true);
            await Bun.sleep(waitMs + 100);
            rig.fake.failAgentGet(paneA, false);
            expect(reinjectKeys(rig.fake, a)).toBe(k);
          }
          const rs = await waitResults(a, waitMs * 3 + 3_000);
          const elapsed = Date.now() - t0;
          await Bun.sleep(300);
          expect(await results(a)).toHaveLength(1);
          expect(rs[0]!.reason).toBe("inject_unconfirmed");
          expect(reinjectKeys(rig.fake, a)).toBe(retries);
          // 3 undelivered + 2 unknown rounds — unknown rounds did not consume retries.
          expect(elapsed).toBeGreaterThanOrEqual(waitMs * 4);
        } finally {
          await rig.close();
        }
      },
      TEST_TIMEOUT_MS,
    );

    test(
      "㊸ agent.get fails permanently right after the undelivered classification → the reinject still happens once (round evidence · no pre-key read) · later rounds unknown · W expiry → one status_unavailable · no retry refund",
      async () => {
        const waitMs = 600;
        const rig = await startRig({ wMs: SHORT_W_MS, submitVerify: { waitMs, retries: 2 } });
        try {
          rig.fake.stallDelivery("*", true);
          const a = newCardId();
          const paneA = await startCard(rig, a, { settle: 0 });
          rig.fake.holdPaneRead(paneA, true);
          expect(await waitFor(() => rig.fake.paneReadHeldCount(paneA) >= 1, waitMs * 3)).toBe(true);
          rig.fake.failAgentGet(paneA, true);
          rig.fake.holdPaneRead(paneA, false);
          rig.fake.releasePaneRead(paneA, true);
          expect(await waitFor(() => reinjectKeys(rig.fake, a) >= 1, 2_000)).toBe(true);
          const rs = await waitResults(a, SHORT_W_MS + 4_000);
          await Bun.sleep(300);
          expect(await results(a)).toHaveLength(1);
          expect(rs[0]!.reason).toBe("status_unavailable");
          expect(rs.filter((r) => r.reason === "inject_unconfirmed")).toHaveLength(0);
          expect(reinjectKeys(rig.fake, a)).toBe(1);
        } finally {
          await rig.close();
        }
      },
      TEST_TIMEOUT_MS,
    );

    test(
      "㊹ deferral in progress · poll misses working (working→idle between polls) · stale permission_prompt hookHint · new cs > lastConsumedCs → cancel + hint clear, then re-entry → one needs_verification · no agent_blocked (R69-M2)",
      async () => {
        const rig = await startRig({ hookSensor: true });
        try {
          const a = newCardId();
          const paneA = await startCard(rig, a);
          rig.fake.setPaneReadText(paneA, "working on it\n1 command still running");
          rig.fake.setAgentStatus(paneA, "idle"); // cs1 → completion → still-running deferral
          await Bun.sleep(600);
          expect(await results(a)).toHaveLength(0);
          await writeLineToSocket(hookSocketPath(a, 1), '{"kind":"permission_prompt"}');
          await Bun.sleep(200);
          rig.fake.setPaneReadText(paneA, "SCRAPE-44 final answer");
          // Same tick: no poll can see the working in between.
          rig.fake.setAgentStatus(paneA, "working");
          rig.fake.setAgentStatus(paneA, "idle"); // cs2 > cs1
          const rs = await waitResults(a, 4_000);
          await Bun.sleep(300);
          expect(await results(a)).toHaveLength(1);
          expect(rs[0]!.reason).toBe("needs_verification");
          expect(rs[0]!.output).toContain("SCRAPE-44");
          expect(rs.filter((r) => r.reason === "agent_blocked")).toHaveLength(0);
        } finally {
          await rig.close();
        }
      },
      TEST_TIMEOUT_MS,
    );

    test(
      "㊺ reused pane — baseline stale done/scs = b unchanged in the late half → undelivered · one retry consumed (R69-L2) · no completion",
      async () => {
        const waitMs = 600;
        const rig = await startRig({
          agentStartStatus: ["working", "done"],
          wMs: LONG_W_MS,
          submitVerify: { waitMs, retries: 1 },
        });
        try {
          rig.fake.stallDelivery("*", true);
          const a = newCardId();
          const paneA = await startCard(rig, a, { settle: 0 });
          expect(rig.fake.getPaneSeq(paneA)!.status).toBe("done");
          expect(await waitFor(() => reinjectKeys(rig.fake, a) >= 1, waitMs * 3 + 1_000)).toBe(true);
          const rs = await waitResults(a, waitMs * 3 + 3_000);
          await Bun.sleep(300);
          expect(await results(a)).toHaveLength(1);
          expect(rs[0]!.reason).toBe("inject_unconfirmed");
          expect(reinjectKeys(rig.fake, a)).toBe(1);
          expect(rs.filter((r) => r.reason === "needs_verification")).toHaveLength(0);
        } finally {
          await rig.close();
        }
      },
      TEST_TIMEOUT_MS,
    );

    test(
      "㊻ baseline success resets W · the same scs + same status snapshots after it do not → W runs from the baseline success time (R69-L1)",
      async () => {
        // Round longer than W: no undelivered round close resets W before expiry.
        const rig = await startRig({ wMs: SHORT_W_MS, submitVerify: { waitMs: 10_000, retries: 1 } });
        try {
          rig.fake.stallDelivery("*", true);
          rig.fake.failAgentGet("*", true); // pending for ~800 ms after flight creation
          const a = newCardId();
          const paneA = await startCard(rig, a, { prompt: false });
          await Bun.sleep(800);
          rig.fake.failAgentGet("*", false);
          expect(await waitFor(() => prompts(rig.fake, a).length >= 1, 2_000, 10)).toBe(true);
          const tBase = Date.now(); // ≈ baseline success (inject follows it)
          const getsAtBase = agentGets(rig.fake, paneA, a).length;
          const rs = await waitResults(a, SHORT_W_MS + 4_000);
          const elapsed = Date.now() - tBase;
          await Bun.sleep(300);
          // Same-scs idle snapshots kept arriving after the baseline.
          expect(agentGets(rig.fake, paneA, a).length - getsAtBase).toBeGreaterThanOrEqual(3);
          expect(await results(a)).toHaveLength(1);
          expect(rs[0]!.reason).toBe("status_unavailable");
          // From flight creation W would fire ~700 ms after tBase; never reset → ≤ W + slack.
          expect(elapsed).toBeGreaterThanOrEqual(SHORT_W_MS - 300);
          expect(elapsed).toBeLessThan(SHORT_W_MS + 1_000);
          expect(rs.filter((r) => r.reason === "inject_unconfirmed")).toHaveLength(0);
        } finally {
          await rig.close();
        }
      },
      TEST_TIMEOUT_MS,
    );
  });
});
