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
    "⑪ after a reinject the new generation (b' = evidence scs = b) still accepts the later cs > b completion",
    async () => {
      const waitMs = 600;
      const rig = await startRig({ submitVerify: { waitMs, retries: 2 } });
      try {
        rig.fake.stallDelivery("*", true);
        const a = newCardId();
        const paneA = await startCard(rig, a, { settle: 0 });
        expect(await waitFor(() => reinjectKeys(rig.fake, a) >= 1, waitMs * 3 + 2_000)).toBe(true);
        rig.fake.stallDelivery("*", false);
        rig.fake.setAgentStatus(paneA, "working");
        await Bun.sleep(300);
        rig.fake.setAgentStatus(paneA, "idle");
        const rs = await waitResults(a, 4_000);
        await Bun.sleep(300);
        expect(await results(a)).toHaveLength(1);
        expect(rs[0]!.reason).toBe("needs_verification");
        expect(rs.filter((r) => r.reason === "inject_unconfirmed")).toHaveLength(0);
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
        const a = newCardId();
        const paneA = await startCard(rig, a);
        rig.fake.setPaneReadText(paneA, "working on it\n1 command still running");
        rig.fake.setAgentStatus(paneA, "idle"); // cs1 > b → completion → indicator → deferral
        await Bun.sleep(600);
        expect(await results(a)).toHaveLength(0);
        rig.fake.setAgentStatus(paneA, "working"); // new transition, scs > cs1
        await Bun.sleep(400);
        rig.fake.setPaneReadText(paneA, "SCRAPE-13 final answer");
        rig.fake.setAgentStatus(paneA, "idle"); // cs2 > cs1
        // Deferral poll is 60s: a result now proves cancel + re-entry.
        const rs = await waitResults(a, 4_000);
        await Bun.sleep(300);
        expect(await results(a)).toHaveLength(1);
        expect(rs[0]!.reason).toBe("needs_verification");
        expect(rs[0]!.output).toContain("SCRAPE-13");
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
        rig.fake.advanceCompletionMidRun(paneA, 600); // idle (cs > b) for 600ms, then working
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
      const waitMs = 800;
      const rig = await startRig({ pollMs: NO_TICK_MS, submitVerify: { waitMs, retries: 2 } });
      try {
        rig.fake.stallDelivery("*", true);
        const a = newCardId();
        const paneA = await startCard(rig, a, { settle: 0 });
        // Park the R17 probe scrape: classification done, key not yet sent.
        rig.fake.holdPaneRead(paneA, true);
        expect(await waitFor(() => rig.fake.paneReadHeldCount(paneA) >= 1, waitMs * 3)).toBe(true);
        // Old-generation snapshot (idle · scs = b) requested now, held.
        rig.fake.holdAgentGet(paneA, true);
        const base = agentGets(rig.fake, paneA, a).length;
        rig.fake.pushEvent("pane_agent_status_changed", { pane_id: paneA, agent_status: "idle" });
        expect(await waitFor(() => agentGets(rig.fake, paneA, a).length > base, 1_000)).toBe(true);
        // Every later read fails (fail is checked before hold — the parked one stays).
        rig.fake.failAgentGet(paneA, true);
        rig.fake.holdPaneRead(paneA, false);
        rig.fake.releasePaneRead(paneA);
        expect(await waitFor(() => reinjectKeys(rig.fake, a) >= 1, 2_000)).toBe(true);
        // Deliver the stale reply inside the new round's late half.
        await Bun.sleep(Math.floor(waitMs * 0.75));
        rig.fake.holdAgentGet(paneA, false);
        rig.fake.releaseAgentGet(paneA);
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
    "㉒ bridge stop → tick and queue released · no agent.get / pane.read after stop · no result · no unhandled rejection",
    async () => {
      const rig = await startRig();
      const rejections: unknown[] = [];
      const onRejection = (e: unknown) => {
        rejections.push(e);
      };
      process.on("unhandledRejection", onRejection);
      try {
        const a = newCardId();
        const paneA = await startCard(rig, a);
        rig.fake.holdAgentGet(paneA, true);
        expect(
          await waitFor(() => rig.fake.agentGetMaxInFlight(paneA) >= 1, POLL_MS * 5),
        ).toBe(true);
        await rig.stopBridge();
        const getsAtStop = agentGets(rig.fake, paneA, a).length;
        const readsAtStop = rig.fake.paneReadCount();
        rig.fake.setAgentStatus(paneA, "idle");
        rig.fake.holdAgentGet(paneA, false);
        rig.fake.releaseAgentGet(paneA);
        await Bun.sleep(POLL_MS * 8);
        expect(agentGets(rig.fake, paneA, a).length).toBe(getsAtStop);
        expect(rig.fake.paneReadCount()).toBe(readsAtStop);
        expect(await results(a)).toHaveLength(0);
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
   * `focusPane` · `nullCsOnFocus`. Scrape probe hit = the pane's accumulated
   * inject text (default) · miss = `setPaneReadText(pane, "READY\n")`.
   */
  describe("part B — pending · completion token · reinject · verify rounds · W (㉔–㊻)", () => {
    function sendKeys(fake: FakeHerdr, cardId: string): number {
      return fake.calls.filter(
        (c) => c.method === "agent.send_keys" && c.params.target === agentName(cardId),
      ).length;
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
          const a = newCardId();
          const paneA = await startCard(rig, a);
          rig.fake.setPaneReadText(paneA, "SCRAPE-25 stale partial");
          rig.fake.holdPaneRead(paneA, true);
          rig.fake.setAgentStatus(paneA, "idle"); // cs > b → completion attempt
          expect(await waitFor(() => rig.fake.paneReadHeldCount(paneA) >= 1, 3_000)).toBe(true);
          rig.fake.setAgentStatus(paneA, "working"); // scs > lastAppliedScs → cancel
          await Bun.sleep(POLL_MS * 4);
          rig.fake.holdPaneRead(paneA, false);
          rig.fake.releasePaneRead(paneA, true);
          await Bun.sleep(800);
          expect(await results(a)).toHaveLength(0);
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
          const a = newCardId();
          const paneA = await startCard(rig, a);
          rig.fake.holdPaneRead(paneA, true);
          rig.fake.setAgentStatus(paneA, "idle");
          expect(await waitFor(() => rig.fake.paneReadHeldCount(paneA) >= 1, 3_000)).toBe(true);
          rig.fake.setAgentStatus(paneA, "working");
          await Bun.sleep(POLL_MS * 4);
          rig.fake.holdPaneRead(paneA, false);
          rig.fake.releasePaneRead(paneA, false);
          await Bun.sleep(800);
          const rs = await results(a);
          expect(rs).toHaveLength(0);
          expect(rs.filter((r) => r.reason === "needs_verification")).toHaveLength(0);
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
          const a = newCardId();
          const paneA = await startCard(rig, a);
          rig.fake.setPaneReadText(paneA, "SCRAPE-27-OLD");
          rig.fake.holdPaneRead(paneA, true);
          rig.fake.setAgentStatus(paneA, "idle"); // cs1 → attempt 1 (scrape held)
          expect(await waitFor(() => rig.fake.paneReadHeldCount(paneA) >= 1, 3_000)).toBe(true);
          rig.fake.setAgentStatus(paneA, "working"); // cancel
          await Bun.sleep(POLL_MS * 4);
          rig.fake.setPaneReadText(paneA, "SCRAPE-27-NEW");
          rig.fake.setAgentStatus(paneA, "idle"); // cs2 > cs1 → attempt 2 (scrape held)
          expect(await waitFor(() => rig.fake.paneReadHeldCount(paneA) >= 2, 3_000)).toBe(true);
          rig.fake.holdPaneRead(paneA, false);
          // Release only the oldest (attempt 1) — attempt 2 stays parked.
          rig.fake.releasePaneRead(paneA, true, 1);
          await Bun.sleep(800);
          expect(await results(a)).toHaveLength(0);
          rig.fake.releasePaneRead(paneA, true);
          const rs = await waitResults(a, 4_000);
          await Bun.sleep(300);
          expect(await results(a)).toHaveLength(1);
          expect(rs[0]!.reason).toBe("needs_verification");
          expect(rs[0]!.output).toContain("SCRAPE-27-NEW");
          expect(rs[0]!.output ?? "").not.toContain("SCRAPE-27-OLD");
        } finally {
          await rig.close();
        }
      },
      TEST_TIMEOUT_MS,
    );

    test(
      "㉘ undelivered classified · probe scrape held · poller applies current-gen scs > b → pre-key cache check cancels reinject · no key · completes in the current generation",
      async () => {
        const waitMs = 600;
        const rig = await startRig({ submitVerify: { waitMs, retries: 1 } });
        try {
          rig.fake.stallDelivery("*", true);
          const a = newCardId();
          const paneA = await startCard(rig, a, { settle: 0 });
          rig.fake.holdPaneRead(paneA, true);
          // Round 1 closes `undelivered` (retry consumed) → R17 probe parked.
          expect(await waitFor(() => rig.fake.paneReadHeldCount(paneA) >= 1, waitMs * 3)).toBe(true);
          rig.fake.stallDelivery("*", false);
          rig.fake.setAgentStatus(paneA, "working"); // late first delivery · scs > b
          await Bun.sleep(POLL_MS * 4); // applied → deliveredSeen
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
        const rig = await startRig({
          pollMs: NO_TICK_MS,
          wMs: 2_500,
          submitVerify: { waitMs, retries: 1 },
        });
        try {
          rig.fake.stallDelivery("*", true);
          const a = newCardId();
          const tBase = Date.now();
          const paneA = await startCard(rig, a, { settle: 0 }); // ≈ t0 (round 1 wake read returns at once)
          await Bun.sleep(Math.floor(waitMs * 0.25));
          // Late-half read (sent t0 + w/2) lands at t0 + 1.25w — after round 1 closes.
          rig.fake.delayAgentGet(paneA, Math.floor(waitMs * 0.75));
          await Bun.sleep(Math.floor(waitMs * 0.45)); // ≈ t0 + 0.7w: late read in flight
          rig.fake.failAgentGet(paneA, true); // later rounds: no qualifying evidence
          await Bun.sleep(waitMs * 2);
          expect(reinjectKeys(rig.fake, a)).toBe(0);
          expect((await results(a)).filter((r) => r.reason === "inject_unconfirmed")).toHaveLength(0);
          const rs = await waitResults(a, 4_000);
          const elapsed = Date.now() - tBase;
          expect(rs).toHaveLength(1);
          expect(rs[0]!.reason).toBe("status_unavailable");
          expect(elapsed).toBeLessThan(2_500 + 1_500);
          expect(reinjectKeys(rig.fake, a)).toBe(0);
        } finally {
          await rig.close();
        }
      },
      TEST_TIMEOUT_MS,
    );

    test(
      "㊲ the late-half read is stuck behind the agentGetConcurrency queue (no reply before close) → unknown · no reinject key (M7)",
      async () => {
        const waitMs = 800;
        const rig = await startRig({ concurrency: 1, submitVerify: { waitMs, retries: 1 } });
        let paneB = "";
        try {
          const b = newCardId();
          paneB = await startCard(rig, b); // delivered · working
          rig.fake.stallDelivery("*", true);
          const a = newCardId();
          await startCard(rig, a, { settle: 0 }); // baseline read before the slot is taken
          rig.fake.holdAgentGet(paneB, true); // B's next tick read occupies the only slot
          await Bun.sleep(waitMs * 3);
          expect(rig.fake.agentGetMaxInFlightGlobal()).toBeLessThanOrEqual(1);
          expect(reinjectKeys(rig.fake, a)).toBe(0);
          expect((await results(a)).filter((r) => r.reason === "inject_unconfirmed")).toHaveLength(0);
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
      "㊶ every round's idle/scs = b reply arrives only after the close (delayAgentGet > W) → unknown rounds · W not reset → one status_unavailable · no inject_unconfirmed",
      async () => {
        const waitMs = 500;
        const rig = await startRig({ wMs: SHORT_W_MS, submitVerify: { waitMs, retries: 1 } });
        try {
          rig.fake.stallDelivery("*", true);
          const a = newCardId();
          const tBase = Date.now();
          const paneA = await startCard(rig, a, { settle: 0 });
          rig.fake.delayAgentGet(paneA, 5_000);
          const rs = await waitResults(a, SHORT_W_MS + 4_000);
          const elapsed = Date.now() - tBase;
          expect(rs).toHaveLength(1);
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
