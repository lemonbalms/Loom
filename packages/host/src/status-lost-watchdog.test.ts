/**
 * PLAN 0.45.4 P1 red — pane-card status-loss watchdog (R14 ①–⑰).
 *
 * Harness = the relay + fake-herdr integration shape of `bridge.test.ts:478`
 * (R68-L5), but `autoStatus: "none"`: every status event is a hand push, and a
 * lost event is `fake.setAgentStatus` (stored status changes, nothing broadcast).
 * A socket replacement is a second card's per-pane subscribe or
 * `disconnectEventSockets` (reconnect). Temp HOME via `LOOM_TEST_HOME`.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
import { flightMapMiss, startBridgeRuntime } from "./bridge-runtime";
import { type FakeHerdr, startFakeHerdr } from "./fake-herdr";
import { HerdrClient } from "./herdr-client";
import { hookSocketPath, readHookTelemetryLines } from "./hook-sensor";
import { RelayClient } from "./relay-client";
import { type FableSession, resetStateHomeDirCache, setActiveProfile } from "./session-store";

/** Default watchdog grace for these tests (production default 5_000 — R12). */
const GRACE_MS = 300;
const TEST_TIMEOUT_MS = 30_000;
const REPO_ROOT = join(import.meta.dir, "..", "..", "..");

/** R6 note, verbatim (`<s>` ∈ idle · done). */
function statusLostNote(s: "idle" | "done"): string {
  return `herdr agent.get status=${s} after event socket re-subscribe; status event lost (no ${s} observed by the bridge) — judge from output`;
}
/** R7 (R68-L1) note, verbatim. */
const BLOCKED_NOTE =
  "herdr agent.get status=blocked after event socket re-subscribe; blocked event lost — reported by the status-loss watchdog";

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

let cardCounter = 0;
/** Fresh card id per call (`/^task_[a-f0-9]+$/`). */
function newCardId(): string {
  cardCounter += 1;
  return `task_5a1e0000${cardCounter.toString(16).padStart(8, "0")}`;
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

/** agent.get calls aimed at this card's pane (by pane_id or agent name). */
function agentGets(fake: FakeHerdr, paneId: string, cardId: string) {
  return fake.calls.filter(
    (c) =>
      c.method === "agent.get" &&
      (c.params.target === paneId || c.params.target === agentName(cardId)),
  );
}

function subscribeCount(fake: FakeHerdr): number {
  return fake.calls.filter((c) => c.method === "events.subscribe").length;
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

/** Capture bridge stderr lines (`log()` → console.error) while `fn` runs. */
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

describe("PLAN 0.45.4 status-loss watchdog (relay + fake herdr)", () => {
  const port = 20500 + Math.floor(Math.random() * 300);
  // Short /tmp base keeps hook unix socket paths under macOS sun_path (~104B).
  const dir = mkdtempSync("/tmp/lsw-");
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
      roomName: "status-lost-watchdog",
      displayName: "tower",
      agentKind: "shell",
      peerId: "p_tower",
    });
    if (created.type !== "room.state") throw new Error("create failed");
    session = {
      roomId: created.roomId,
      roomName: created.roomName ?? "status-lost-watchdog",
      inviteCode: created.inviteCode ?? "",
      peerId: "p_node_slw",
      displayName: "node/slw",
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

  async function startRig(o?: {
    graceMs?: number;
    hookSensor?: boolean;
    submitVerify?: { waitMs: number; retries: number };
  }): Promise<Rig> {
    rigSeq += 1;
    const tag = `slw${rigSeq}`;
    const sock = join(dir, `h${rigSeq}.sock`);
    const fake = await startFakeHerdr({ socketPath: sock, autoStatus: "none" });
    const node = `node/${tag}`;
    const config: BridgeConfig = {
      authorizedDispatchers: ["p_tower"],
      herdrSocketPath: sock,
      agentArgv: { claude: ["claude"] },
      herdrProtocol: 17,
      hookSensor: o?.hookSensor === true,
    };
    // Not a fresh literal at the call site: `statusLostGraceMs` (R12) is the
    // green option the current StartBridgeRuntimeOptions does not declare yet.
    const bridgeOpts = {
      session: { ...session, peerId: `p_node_${tag}`, displayName: node, peerSecret: undefined },
      profile: `node-${tag}`,
      config,
      herdr: new HerdrClient({ socketPath: sock }),
      submitVerify: o?.submitVerify ?? { waitMs: 2_000, retries: 0 },
      settleMs: 20,
      stillRunningPollMs: 60_000,
      statusLostGraceMs: o?.graceMs ?? GRACE_MS,
    };
    const bridge = await startBridgeRuntime(bridgeOpts);
    // First ACK = startup global subscribe.
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
   * Dispatch a card and wait for its inject (its own per-pane subscribe — a
   * socket replacement for every earlier flight — has ACKed by then). With
   * `working`, hand-push `working` so the flight is inject-verified (`sawWorking`).
   */
  async function startCard(
    rig: Rig,
    cardId: string,
    opts: { working: boolean } = { working: true },
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
    const prompted = await waitFor(
      () =>
        rig.fake.calls.some(
          (c) => c.method === "agent.prompt" && c.params.target === agentName(cardId),
        ),
      5_000,
    );
    expect(prompted).toBe(true);
    if (opts.working) {
      rig.fake.pushEvent("pane_agent_status_changed", {
        pane_id: paneId,
        agent_status: "working",
      });
      await Bun.sleep(150);
    }
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
    "① lost idle after re-subscribe → exactly one failed/status_lost with scrape · no done · no pane.close · late idle after removal = flight_map_miss",
    async () => {
      const rig = await startRig();
      try {
        const a = newCardId();
        const paneA = await startCard(rig, a);
        rig.fake.setPaneReadText(paneA, "A-SCRAPE-1 work finished");
        rig.fake.setAgentStatus(paneA, "idle"); // idle event lost
        await startCard(rig, newCardId()); // card B subscribe replaces the socket
        await waitResults(a, GRACE_MS + 4_000);
        await Bun.sleep(GRACE_MS * 2);
        const rs = await results(a);
        expect(rs).toHaveLength(1);
        expect(rs[0]!.status).toBe("failed");
        expect(rs[0]!.reason).toBe("status_lost");
        expect(rs[0]!.note).toBe(statusLostNote("idle"));
        expect(rs[0]!.output).toContain("A-SCRAPE-1");
        expect(rs.filter((r) => r.status === "done")).toHaveLength(0);
        expect(
          rig.fake.calls.filter((c) => c.method === "pane.close" && c.params.pane_id === paneA),
        ).toHaveLength(0);
        // R68-L4: once the flight is removed after the send, a late idle is a map miss.
        const base = flightMapMiss();
        const missed = await waitFor(
          () => {
            rig.fake.pushEvent("pane_agent_status_changed", {
              pane_id: paneA,
              agent_status: "idle",
            });
            return flightMapMiss() > base;
          },
          2_000,
          50,
        );
        expect(missed).toBe(true);
        await Bun.sleep(100);
        expect(await results(a)).toHaveLength(1);
      } finally {
        await rig.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "② real idle event inside the grace → normal path (needs_verification) · no status_lost",
    async () => {
      const grace = 1_500;
      const rig = await startRig({ graceMs: grace });
      try {
        const a = newCardId();
        const paneA = await startCard(rig, a);
        rig.fake.setAgentStatus(paneA, "idle");
        await startCard(rig, newCardId());
        await waitFor(() => agentGets(rig.fake, paneA, a).length >= 1, 600);
        rig.fake.pushEvent("pane_agent_status_changed", {
          pane_id: paneA,
          agent_status: "idle",
        });
        await waitResults(a, 4_000);
        await Bun.sleep(grace + 300);
        const rs = await results(a);
        expect(rs).toHaveLength(1);
        expect(rs[0]!.reason).toBe("needs_verification");
        expect(rs.filter((r) => r.reason === "status_lost")).toHaveLength(0);
      } finally {
        await rig.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "③ agent.get = working → no result after twice the grace",
    async () => {
      const rig = await startRig();
      try {
        const a = newCardId();
        await startCard(rig, a); // stored status stays "working"
        await startCard(rig, newCardId());
        await Bun.sleep(GRACE_MS * 2 + 500);
        expect(await results(a)).toHaveLength(0);
      } finally {
        await rig.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "④ agent.get = unknown → no result · one watchdog telemetry line",
    async () => {
      const rig = await startRig();
      try {
        await withStderr(async (lines) => {
          const a = newCardId();
          const paneA = await startCard(rig, a);
          rig.fake.setAgentStatus(paneA, "unknown");
          await startCard(rig, newCardId());
          await Bun.sleep(GRACE_MS * 2 + 500);
          expect(await results(a)).toHaveLength(0);
          const wd = lines.filter(
            (l) =>
              l.includes("status-loss watchdog") &&
              l.includes(`card ${a}`) &&
              l.includes("status=unknown"),
          );
          expect(wd).toHaveLength(1);
        });
      } finally {
        await rig.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "④ agent.get RPC error → no result · one watchdog telemetry line",
    async () => {
      const rig = await startRig();
      try {
        await withStderr(async (lines) => {
          const a = newCardId();
          const paneA = await startCard(rig, a);
          rig.fake.setAgentStatus(paneA, "idle");
          rig.fake.failAgentGet(paneA, true);
          await startCard(rig, newCardId());
          await Bun.sleep(GRACE_MS * 2 + 500);
          expect(await results(a)).toHaveLength(0);
          const wd = lines.filter(
            (l) =>
              l.includes("status-loss watchdog") &&
              l.includes(`card ${a}`) &&
              l.includes("agent.get failed"),
          );
          expect(wd).toHaveLength(1);
        });
      } finally {
        await rig.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "⑤ still-running deferral owns completion → watchdog yields (no result)",
    async () => {
      const rig = await startRig();
      try {
        const a = newCardId();
        const paneA = await startCard(rig, a);
        rig.fake.setPaneReadText(paneA, "working on it\n1 command still running");
        rig.fake.setAgentStatus(paneA, "idle");
        rig.fake.pushEvent("pane_agent_status_changed", {
          pane_id: paneA,
          agent_status: "idle",
        });
        await Bun.sleep(400); // settle → indicator hit → deferral
        await startCard(rig, newCardId());
        await Bun.sleep(GRACE_MS * 2 + 500);
        expect(await results(a)).toHaveLength(0);
      } finally {
        await rig.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "⑥ live permission_prompt hookHint → agent_blocked + agent_blocked_correction tagged reason watchdog",
    async () => {
      const rig = await startRig({ hookSensor: true });
      try {
        const a = newCardId();
        const paneA = await startCard(rig, a);
        await writeLineToSocket(hookSocketPath(a, 1), '{"kind":"permission_prompt"}');
        await Bun.sleep(100);
        const telemetryBase = readHookTelemetryLines().filter(
          (r) => r.type === "agent_blocked_correction" && r.reason === "watchdog",
        ).length;
        rig.fake.setAgentStatus(paneA, "idle");
        await startCard(rig, newCardId());
        await waitResults(a, GRACE_MS + 4_000);
        await Bun.sleep(GRACE_MS * 2);
        const rs = await results(a);
        expect(rs).toHaveLength(1);
        expect(rs[0]!.status).toBe("failed");
        expect(rs[0]!.reason).toBe("agent_blocked");
        expect(rs[0]!.note ?? "").toContain("watchdog");
        expect(rs.filter((r) => r.reason === "status_lost")).toHaveLength(0);
        const tagged = readHookTelemetryLines().filter(
          (r) => r.type === "agent_blocked_correction" && r.reason === "watchdog",
        );
        expect(tagged.length - telemetryBase).toBe(1);
      } finally {
        await rig.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "⑦ startup first subscribe ACK → no agent.get",
    async () => {
      const rig = await startRig();
      try {
        expect(subscribeCount(rig.fake)).toBeGreaterThanOrEqual(1);
        await Bun.sleep(400);
        expect(rig.fake.calls.filter((c) => c.method === "agent.get")).toHaveLength(0);
      } finally {
        await rig.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "⑧ flight without sawWorking → no agent.get on re-subscribe (R3)",
    async () => {
      const rig = await startRig({ submitVerify: { waitMs: 5_000, retries: 0 } });
      try {
        const a = newCardId();
        const paneA = await startCard(rig, a, { working: false });
        rig.fake.setAgentStatus(paneA, "idle");
        await startCard(rig, newCardId(), { working: false });
        await Bun.sleep(GRACE_MS + 300);
        expect(agentGets(rig.fake, paneA, a)).toHaveLength(0);
      } finally {
        await rig.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "⑨ reconnect ACK after disconnectEventSockets → same status_lost as ① (C8)",
    async () => {
      const rig = await startRig();
      try {
        const a = newCardId();
        const paneA = await startCard(rig, a);
        rig.fake.setPaneReadText(paneA, "A-SCRAPE-9 work finished");
        rig.fake.setAgentStatus(paneA, "idle");
        const subsBefore = subscribeCount(rig.fake);
        rig.fake.disconnectEventSockets();
        await waitFor(() => subscribeCount(rig.fake) > subsBefore, 8_000);
        await waitResults(a, GRACE_MS + 4_000);
        await Bun.sleep(GRACE_MS * 2);
        const rs = await results(a);
        expect(rs).toHaveLength(1);
        expect(rs[0]!.status).toBe("failed");
        expect(rs[0]!.reason).toBe("status_lost");
        expect(rs[0]!.note).toBe(statusLostNote("idle"));
        expect(rs[0]!.output).toContain("A-SCRAPE-9");
        expect(
          rig.fake.calls.filter((c) => c.method === "pane.close" && c.params.pane_id === paneA),
        ).toHaveLength(0);
      } finally {
        await rig.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "⑩ two re-subscribes inside the grace → one result · agent.get ≤ ACKs + 1 (R11)",
    async () => {
      const grace = 1_500;
      const rig = await startRig({ graceMs: grace });
      try {
        const a = newCardId();
        const paneA = await startCard(rig, a);
        const subsBase = subscribeCount(rig.fake);
        rig.fake.setAgentStatus(paneA, "idle");
        await startCard(rig, newCardId()); // trigger ACK
        await waitFor(() => agentGets(rig.fake, paneA, a).length >= 1, 1_000);
        await startCard(rig, newCardId()); // re-subscribe inside the grace
        await startCard(rig, newCardId()); // and again
        await waitResults(a, grace + 4_000);
        await Bun.sleep(grace + 300);
        const rs = await results(a);
        expect(rs).toHaveLength(1);
        expect(rs[0]!.reason).toBe("status_lost");
        const acks = subscribeCount(rig.fake) - subsBase;
        expect(agentGets(rig.fake, paneA, a).length).toBeLessThanOrEqual(acks + 1);
      } finally {
        await rig.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "⑪ working event inside the grace → exactly one re-ask · working reply → no result (R5 ⓓ)",
    async () => {
      const grace = 1_000;
      const rig = await startRig({ graceMs: grace });
      try {
        const a = newCardId();
        const paneA = await startCard(rig, a);
        rig.fake.setAgentStatus(paneA, "idle");
        await startCard(rig, newCardId());
        await waitFor(() => agentGets(rig.fake, paneA, a).length >= 1, 1_000);
        await Bun.sleep(50); // reply lands → grace open
        const before = agentGets(rig.fake, paneA, a).length;
        rig.fake.setAgentStatus(paneA, "working");
        rig.fake.pushEvent("pane_agent_status_changed", {
          pane_id: paneA,
          agent_status: "working",
        });
        await Bun.sleep(grace * 2);
        expect(await results(a)).toHaveLength(0);
        expect(agentGets(rig.fake, paneA, a).length).toBe(before + 1);
      } finally {
        await rig.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  test("⑫ contract: agent.get result (AgentInfo) carries agent_status in 0.7.5 and 0.9.5", () => {
    for (const v of ["herdr-v0.7.5", "herdr-v0.9.5"]) {
      const raw = readFileSync(join(REPO_ROOT, "docs", "spikes", "fixtures", v, "schema.json"), "utf8");
      expect(raw).toContain('"const": "agent.get"');
      const schema = JSON.parse(raw) as {
        schemas: {
          success_response: {
            $defs: {
              AgentInfo: { properties: Record<string, unknown>; required: string[] };
            };
          };
        };
      };
      const info = schema.schemas.success_response.$defs.AgentInfo;
      expect(info.properties.agent_status).toBeDefined();
      expect(info.required).toContain("agent_status");
      expect(raw).toContain('"const": "agent_info"');
    }
  });

  test(
    "⑬ bridge stop during the grace → no result (timers cleared · R10)",
    async () => {
      const grace = 1_500;
      const rig = await startRig({ graceMs: grace });
      try {
        const a = newCardId();
        const paneA = await startCard(rig, a);
        rig.fake.setAgentStatus(paneA, "idle");
        await startCard(rig, newCardId());
        await waitFor(() => agentGets(rig.fake, paneA, a).length >= 1, 1_000);
        await Bun.sleep(50);
        await rig.stopBridge();
        await Bun.sleep(grace + 500);
        expect(await results(a)).toHaveLength(0);
      } finally {
        await rig.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "⑭ grace cancelled by working then re-armed by a later ACK → exactly one status_lost (R68-M1)",
    async () => {
      const grace = 800;
      const rig = await startRig({ graceMs: grace });
      try {
        const a = newCardId();
        const paneA = await startCard(rig, a);
        rig.fake.setPaneReadText(paneA, "A-SCRAPE-14");
        rig.fake.setAgentStatus(paneA, "idle");
        await startCard(rig, newCardId()); // B: grace opens
        await waitFor(() => agentGets(rig.fake, paneA, a).length >= 1, 1_000);
        await Bun.sleep(50);
        rig.fake.setAgentStatus(paneA, "working");
        rig.fake.pushEvent("pane_agent_status_changed", {
          pane_id: paneA,
          agent_status: "working",
        });
        await Bun.sleep(300); // re-ask → working → back to no check
        rig.fake.setAgentStatus(paneA, "idle"); // lost again
        await startCard(rig, newCardId()); // C: new socket replacement
        await waitResults(a, grace + 4_000);
        await Bun.sleep(grace * 2);
        const rs = await results(a);
        expect(rs).toHaveLength(1);
        expect(rs[0]!.reason).toBe("status_lost");
        expect(rs[0]!.note).toBe(statusLostNote("idle"));
      } finally {
        await rig.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "⑮ stale held agent.get reply + ACK while in flight → re-ask → exactly one status_lost · concurrent agent.get ≤ 1 (R68-M2)",
    async () => {
      const rig = await startRig();
      try {
        const a = newCardId();
        const paneA = await startCard(rig, a); // stored status "working"
        rig.fake.holdAgentGet(paneA, true);
        await startCard(rig, newCardId()); // B: agent.get(A) built as "working", held
        await waitFor(() => agentGets(rig.fake, paneA, a).length >= 1, 1_000);
        rig.fake.setAgentStatus(paneA, "idle"); // lost while the get is in flight
        await startCard(rig, newCardId()); // C: second ACK during the get
        await Bun.sleep(100);
        rig.fake.holdAgentGet(paneA, false);
        rig.fake.releaseAgentGet(paneA); // stale "working" reply
        await waitResults(a, GRACE_MS + 4_000);
        await Bun.sleep(GRACE_MS * 2);
        const rs = await results(a);
        expect(rs).toHaveLength(1);
        expect(rs[0]!.reason).toBe("status_lost");
        expect(agentGets(rig.fake, paneA, a).length).toBeGreaterThanOrEqual(2);
        expect(rig.fake.agentGetMaxInFlight(paneA)).toBeLessThanOrEqual(1);
      } finally {
        await rig.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "⑯ agent.get = blocked → exactly one agent_blocked with watchdog note · no status_lost (R68-L1)",
    async () => {
      const rig = await startRig();
      try {
        const a = newCardId();
        const paneA = await startCard(rig, a);
        rig.fake.setAgentStatus(paneA, "blocked");
        await startCard(rig, newCardId());
        await waitResults(a, GRACE_MS + 4_000);
        await Bun.sleep(GRACE_MS * 2);
        const rs = await results(a);
        expect(rs).toHaveLength(1);
        expect(rs[0]!.status).toBe("failed");
        expect(rs[0]!.reason).toBe("agent_blocked");
        expect(rs[0]!.note).toBe(BLOCKED_NOTE);
        expect(rs.filter((r) => r.reason === "status_lost")).toHaveLength(0);
      } finally {
        await rig.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "⑰ agent.get = done → one status_lost like ① · note status=done (R68-L3)",
    async () => {
      const rig = await startRig();
      try {
        const a = newCardId();
        const paneA = await startCard(rig, a);
        rig.fake.setPaneReadText(paneA, "A-SCRAPE-17");
        rig.fake.setAgentStatus(paneA, "done");
        await startCard(rig, newCardId());
        await waitResults(a, GRACE_MS + 4_000);
        await Bun.sleep(GRACE_MS * 2);
        const rs = await results(a);
        expect(rs).toHaveLength(1);
        expect(rs[0]!.status).toBe("failed");
        expect(rs[0]!.reason).toBe("status_lost");
        expect(rs[0]!.note).toBe(statusLostNote("done"));
        expect(rs[0]!.output).toContain("A-SCRAPE-17");
        expect(
          rig.fake.calls.filter((c) => c.method === "pane.close" && c.params.pane_id === paneA),
        ).toHaveLength(0);
      } finally {
        await rig.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "⑱a held agent.get reply released after the real idle removed the flight → one needs_verification · no status_lost · no extra agent.get (Astra 0246 L1)",
    async () => {
      const rig = await startRig();
      try {
        const a = newCardId();
        const paneA = await startCard(rig, a);
        rig.fake.holdAgentGet(paneA, true);
        rig.fake.setAgentStatus(paneA, "idle"); // held reply will carry a firing-class status
        const getsBase = agentGets(rig.fake, paneA, a).length;
        await startCard(rig, newCardId()); // B: reconcile get for A, held
        expect(
          await waitFor(() => agentGets(rig.fake, paneA, a).length > getsBase, 1_000),
        ).toBe(true);
        await startCard(rig, newCardId()); // C: ACK during the get → re-get mark set
        // Real idle arrives while the get is held → normal completion path.
        rig.fake.pushEvent("pane_agent_status_changed", {
          pane_id: paneA,
          agent_status: "idle",
        });
        const first = await waitResults(a, 4_000);
        expect(first).toHaveLength(1);
        expect(first[0]!.reason).toBe("needs_verification");
        await Bun.sleep(150); // removeCardFlight runs after the send
        const getsAtRelease = agentGets(rig.fake, paneA, a).length;
        expect(getsAtRelease).toBe(getsBase + 1);
        rig.fake.holdAgentGet(paneA, false);
        rig.fake.releaseAgentGet(paneA); // stale "idle" reply for a removed flight
        await Bun.sleep(GRACE_MS * 2 + 300);
        const rs = await results(a);
        expect(rs).toHaveLength(1);
        expect(rs[0]!.reason).toBe("needs_verification");
        expect(rs.filter((r) => r.reason === "status_lost")).toHaveLength(0);
        expect(agentGets(rig.fake, paneA, a).length).toBe(getsAtRelease);
      } finally {
        await rig.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "⑱b bridge stop while agent.get reply held → release → no result · no agent.get / pane.read after stop · no unhandled rejection (Astra 0246 L1)",
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
        rig.fake.setAgentStatus(paneA, "idle");
        rig.fake.setPaneReadText(paneA, "A-SCRAPE-18B");
        const getsBase = agentGets(rig.fake, paneA, a).length;
        await startCard(rig, newCardId()); // B: reconcile get for A, held
        expect(
          await waitFor(() => agentGets(rig.fake, paneA, a).length > getsBase, 1_000),
        ).toBe(true);
        await rig.stopBridge();
        const getsAtStop = agentGets(rig.fake, paneA, a).length;
        const readsAtStop = rig.fake.paneReadCount();
        rig.fake.holdAgentGet(paneA, false);
        rig.fake.releaseAgentGet(paneA); // "idle" reply lands after stop
        await Bun.sleep(GRACE_MS * 2 + 300);
        expect(await results(a)).toHaveLength(0);
        expect(agentGets(rig.fake, paneA, a).length).toBe(getsAtStop);
        // A fire after stop would scrape first (finishCardFailure → settlePaneRead).
        expect(rig.fake.paneReadCount()).toBe(readsAtStop);
        expect(rejections).toHaveLength(0);
      } finally {
        process.off("unhandledRejection", onRejection);
        await rig.close();
      }
    },
    TEST_TIMEOUT_MS,
  );

  test(
    "⑲ watchdog fired, failure send held → idle · blocked · pane.closed during the send → exactly one status_lost · flight still owned · no done · no pane.close (Astra 0246 L2)",
    async () => {
      const rig = await startRig();
      try {
        await withStderr(async (lines) => {
          const a = newCardId();
          const paneA = await startCard(rig, a);
          const paneReadsA = () =>
            rig.fake.calls.filter((c) => c.method === "pane.read" && c.params.pane_id === paneA)
              .length;
          rig.fake.setPaneReadText(paneA, "A-SCRAPE-19");
          // Lever: fake-herdr pane.read hold. fireStatusLost takes the CAS, then
          // finishCardFailure scrapes (settlePaneRead) before composeAndSend — a held
          // pane.read parks the send in result_sending with the flight still mapped.
          rig.fake.holdPaneRead(paneA, true);
          rig.fake.setAgentStatus(paneA, "idle"); // idle event lost
          await startCard(rig, newCardId()); // B: socket replacement → get → grace → fire
          expect(
            await waitFor(() => rig.fake.paneReadHeldCount(paneA) >= 1, GRACE_MS + 4_000),
          ).toBe(true);
          const missBase = flightMapMiss();
          const readsBase = paneReadsA();
          rig.fake.pushEvent("pane_agent_status_changed", {
            pane_id: paneA,
            agent_status: "idle",
          });
          rig.fake.pushEvent("pane_agent_status_changed", {
            pane_id: paneA,
            agent_status: "blocked",
          });
          rig.fake.pushEvent("pane.closed", { pane_id: paneA });
          await Bun.sleep(300);
          // Send still parked; the events reached the still-mapped flight (not map misses).
          expect(await results(a)).toHaveLength(0);
          expect(flightMapMiss()).toBe(missBase);
          // CAS ownership: without it the late idle reaches beginCardCompletion →
          // settlePaneRead (extra pane.read) and the late blocked re-runs
          // finishCardFailure (extra scrape + issuer denied).
          expect(paneReadsA()).toBe(readsBase);
          expect(rig.fake.paneReadHeldCount(paneA)).toBe(1);
          expect(
            lines.filter((l) => l.includes(`card ${a}:`) && l.includes("issuer.acquire(initial) denied")),
          ).toHaveLength(0);
          rig.fake.holdPaneRead(paneA, false);
          rig.fake.releasePaneRead(paneA);
          await waitResults(a, 4_000);
          await Bun.sleep(GRACE_MS * 2 + 300);
          const rs = await results(a);
          expect(rs).toHaveLength(1);
          expect(rs[0]!.status).toBe("failed");
          expect(rs[0]!.reason).toBe("status_lost");
          expect(rs[0]!.note).toBe(statusLostNote("idle"));
          expect(rs[0]!.output).toContain("A-SCRAPE-19");
          expect(rs.filter((r) => r.status === "done")).toHaveLength(0);
          expect(
            rig.fake.calls.filter((c) => c.method === "pane.close" && c.params.pane_id === paneA),
          ).toHaveLength(0);
        });
      } finally {
        await rig.close();
      }
    },
    TEST_TIMEOUT_MS,
  );
});
