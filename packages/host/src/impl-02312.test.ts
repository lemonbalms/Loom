/**
 * PLAN 0.23.12 (R36) — tests for ⓐ summary trailing TUI timestamp strip,
 * ⓑ pool pane equalize via pane.resize, ⓒ claude timing space composite.
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
  buildDispatchBody,
  serializeCardAttachment,
} from "@loom/protocol";
import { RelayClient } from "./relay-client";
import { startFakeHerdr, type FakeHerdr } from "./fake-herdr";
import {
  startBridgeRuntime,
  selectCardSummaryLine,
  stripTuiChrome,
  type BridgeRuntime,
} from "./bridge-runtime";
import type { BridgeConfig } from "./bridge-config";
import { HerdrClient } from "./herdr-client";
import {
  resetStateHomeDirCache,
  setActiveProfile,
  type FableSession,
} from "./session-store";

type CardResult = {
  status?: string;
  reason?: string;
  summary?: string;
  output?: string;
  note?: string;
  cardId?: string;
};

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

// ── ⓐ unit: trailing TUI timestamp strip ──────────────────────────────────

describe("PLAN 0.23.12 ⓐ selectCardSummaryLine trailing timestamp", () => {
  test("strips wide-space trailing 10:50 AM", () => {
    const text = "goal complete, tests green  10:50 AM";
    expect(selectCardSummaryLine(text)).toBe("goal complete, tests green");
  });

  test("preserves single-space legitimate time (conservative boundary)", () => {
    const text = "finished at 10:50 AM";
    expect(selectCardSummaryLine(text)).toBe("finished at 10:50 AM");
  });

  test("✻ Sautéed for 9s  10:50 AM → skip after refine, prior content", () => {
    const text = [
      "goal complete, tests green",
      "✻ Sautéed for 9s  10:50 AM",
    ].join("\n");
    expect(selectCardSummaryLine(text)).toBe("goal complete, tests green");
  });

  test("Worked for 3s.  10:50 AM → skip after refine", () => {
    const text = ["impl done marker", "Worked for 3s.  10:50 AM"].join("\n");
    expect(selectCardSummaryLine(text)).toBe("impl done marker");
  });

  test("timestamp + █ compound: timing line skipped; order block→timestamp", () => {
    // █ after AM would break timestamp anchor if not stripped first (L-1 order).
    const text = [
      "real content line",
      "Worked for 3s.  10:50 AM█",
    ].join("\n");
    expect(selectCardSummaryLine(text)).toBe("real content line");
  });

  test("timestamp + █ on non-timing content → return stripped of both", () => {
    const text = "goal complete  10:50 AM█";
    expect(selectCardSummaryLine(text)).toBe("goal complete");
  });

  test("R36 L-1: all-skipped fallback return also strips timestamp", () => {
    // Both lines pure timing after refine → fallback last, still strip ts.
    const text = [
      "Worked for 1s.  10:50 AM",
      "Worked for 2s.  11:00 AM",
    ].join("\n");
    expect(selectCardSummaryLine(text)).toBe("Worked for 2s.");
  });

  test("R31 M-1: strip helper is summary-path only (raw body keeps timestamp)", () => {
    // selectCardSummaryLine strips; stripTuiChrome does NOT do line-internal edit.
    const body = "answer body  10:50 AM\nWorked for 1s.";
    expect(stripTuiChrome(body)).toContain("  10:50 AM");
    expect(selectCardSummaryLine(body)).toBe("answer body");
  });
});

// ── ⓒ unit: claude timing space composite ─────────────────────────────────

describe("PLAN 0.23.12 ⓒ CLAUDE_TIMING space composite", () => {
  test("✻ Sautéed for 11m 31s → skip (space between m and s)", () => {
    const text = ["goal complete, tests green", "✻ Sautéed for 11m 31s"].join(
      "\n",
    );
    expect(selectCardSummaryLine(text)).toBe("goal complete, tests green");
  });

  test("Worked for 1m 49s (unobserved space form) stays non-skip", () => {
    // WORKED_TIMING_LINE_RE unchanged — space form does not full-match.
    const text = ["prior", "Worked for 1m 49s"].join("\n");
    expect(selectCardSummaryLine(text)).toBe("Worked for 1m 49s");
  });

  test("no-space composite 1m49s still skipped (0.23.11 regression)", () => {
    const text = ["impl done", "Worked for 1m49s."].join("\n");
    expect(selectCardSummaryLine(text)).toBe("impl done");
  });
});

// ── ⓑ integration: pool equalize ──────────────────────────────────────────

describe("PLAN 0.23.12 ⓑ pool pane equalize + regression", () => {
  const port = 23120 + Math.floor(Math.random() * 200);
  const dir = join(tmpdir(), `loom-impl-02312-${Date.now()}`);
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
    paneCleanup: "auto",
    panePlacement: placement,
  });

  function nextCardId(): string {
    cardSeq += 1;
    return `task_b023c${cardSeq.toString(16).padStart(11, "0")}`;
  }

  async function restartBridge(
    placement: "pool" | "legacy" = "pool",
  ): Promise<void> {
    if (bridge) await bridge.stop();
    process.env.LOOM_SESSION = sessionFile;
    resetStateHomeDirCache();
    setActiveProfile(null);
    session = JSON.parse(
      await Bun.file(sessionFile).text(),
    ) as FableSession;
    bridge = await startBridgeRuntime({
      session,
      profile: placement === "legacy" ? "impl-02312-legacy" : "impl-02312",
      config: baseCfg(placement),
      herdr: new HerdrClient({ socketPath: herdrSock, submitDelayMs: 0 }),
      settleMs: 15,
      submitVerify: { waitMs: 300, retries: 1 },
      stillRunningPollMs: 80,
      stillRunningMaxMs: 400,
    });
    await Bun.sleep(100);
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
    const subscribed = await waitFor(
      () => hasPaneStatusSubscription(fake, paneId),
      { timeoutMs: 10_000 },
    );
    expect(subscribed).toBe(true);
    fake.pushEvent("pane_agent_status_changed", {
      pane_id: paneId,
      agent_status: "working",
    });
    await Bun.sleep(50);
    return paneId;
  }

  function hasPaneStatusSubscription(target: FakeHerdr, paneId: string): boolean {
    return target.calls.some((call) => {
      if (call.method !== "events.subscribe") return false;
      const subscriptions = call.params.subscriptions;
      return (
        Array.isArray(subscriptions) &&
        subscriptions.some(
          (subscription) =>
            typeof subscription === "object" &&
            subscription !== null &&
            "pane_id" in subscription &&
            subscription.pane_id === paneId,
        )
      );
    });
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

  function agentStarts(): FakeHerdr["calls"] {
    return fake.calls.filter((c) => c.method === "agent.start");
  }

  function resizeCalls(): FakeHerdr["calls"] {
    return fake.calls.filter((c) => c.method === "pane.resize");
  }

  function layoutCalls(): FakeHerdr["calls"] {
    return fake.calls.filter((c) => c.method === "pane.layout");
  }

  async function resetPoolFresh(): Promise<void> {
    fake.setLayoutMode("normal");
    for (const id of fake.listPaneIds()) {
      const t = fake.tabIdForPane(id);
      if (t) fake.dropTab(t);
    }
    await restartBridge("pool");
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

    tower = new RelayClient({ url: `ws://127.0.0.1:${port}/ws` });
    const created = await tower.createRoom({
      roomName: "impl-02312",
      displayName: "tower",
      agentKind: "shell",
      peerId: "p_tower",
    });
    if (created.type !== "room.state") throw new Error("create failed");
    inviteCode = created.inviteCode ?? "";
    const towerSecret = created.peerSecret ?? tower.peerSecret;

    towerSession = {
      roomId: created.roomId,
      roomName: "impl-02312",
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
      roomName: "impl-02312",
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

    await restartBridge("pool");
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

  test("ⓑ 2-pane 50/50 → no-op suppress (|delta|<0.01, no pane.resize)", async () => {
    await resetPoolFresh();
    const nResize = resizeCalls().length;
    const nLayout = layoutCalls().length;
    await spawnCard(nextCardId(), "eq-first");
    await spawnCard(nextCardId(), "eq-second");
    // Second spawn triggers equalize; target=0.5 current=0.5 → skip resize.
    expect(layoutCalls().length).toBeGreaterThan(nLayout);
    expect(resizeCalls().length).toBe(nResize);
  }, 20_000);

  test("ⓑ 3-pane 50/25/25 → 1/3 then 1/2 sequence (amount·direction)", async () => {
    await resetPoolFresh();
    await spawnCard(nextCardId(), "eq3-a");
    await spawnCard(nextCardId(), "eq3-b");
    const nResize = resizeCalls().length;
    // Third spawn: ratios [0.5, 0.5] → first step target 1/3, left |delta|≈0.1667
    await spawnCard(nextCardId(), "eq3-c");
    const newResizes = resizeCalls().slice(nResize);
    expect(newResizes.length).toBe(1);
    const r = newResizes[0]!;
    expect(r.params.direction).toBe("left");
    const amount = r.params.amount as number;
    expect(Math.abs(amount - (0.5 - 1 / 3))).toBeLessThan(0.001);
    // Second step target 0.5 ≈ current 0.5 → skipped.
  }, 20_000);

  test("ⓑ resize failure still returns spawn (fail-open) + card completes", async () => {
    await resetPoolFresh();
    await spawnCard(nextCardId(), "fail-a");
    fake.failPaneResizes(5);
    // Force a non-no-op equalize: 3 panes with default half-split.
    await spawnCard(nextCardId(), "fail-b");
    const id3 = nextCardId();
    const pane3 = await spawnCard(id3, "fail-c");
    // Spawn succeeded despite resize errors.
    expect(agentStarts().length).toBeGreaterThanOrEqual(3);
    // Card path still works.
    fake.setPaneReadText(
      pane3,
      ["[SMOKE-02312-FAIL-OK]", "Worked for 1s."].join("\n"),
    );
    emitDone(pane3);
    const result = await awaitCardResult(id3);
    expect(result?.status).toBe("done");
    expect(result?.summary).toContain("SMOKE-02312-FAIL-OK");
  }, 20_000);

  test("ⓑ non-chain layout guard → skip resize", async () => {
    await resetPoolFresh();
    await spawnCard(nextCardId(), "nc-a");
    fake.setLayoutMode("non_chain");
    const nResize = resizeCalls().length;
    await spawnCard(nextCardId(), "nc-b");
    // layout may be read; resize must not run.
    expect(resizeCalls().length).toBe(nResize);
    fake.setLayoutMode("normal");
  }, 20_000);

  test("ⓑ L-2: non-unique x-match → abort (no resize)", async () => {
    await resetPoolFresh();
    await spawnCard(nextCardId(), "amb-a");
    fake.setLayoutMode("ambiguous_x");
    const nResize = resizeCalls().length;
    await spawnCard(nextCardId(), "amb-b");
    expect(resizeCalls().length).toBe(nResize);
    fake.setLayoutMode("normal");
  }, 20_000);

  test("ⓑ legacy placement → no pane.layout / pane.resize", async () => {
    await resetPoolFresh();
    await restartBridge("legacy");
    const nLayout = layoutCalls().length;
    const nResize = resizeCalls().length;
    await spawnCard(nextCardId(), "legacy-a");
    await spawnCard(nextCardId(), "legacy-b");
    expect(layoutCalls().length).toBe(nLayout);
    expect(resizeCalls().length).toBe(nResize);
    await restartBridge("pool");
  }, 20_000);

  test("regression: card roundtrip summary strips timestamp; output body keeps it", async () => {
    await resetPoolFresh();
    const id = nextCardId();
    const paneId = await spawnCard(id, "body-ts");
    const body = [
      "⏺ [SMOKE-02312-TS-OK] name=loom  10:50 AM",
      "Worked for 2s.",
    ].join("\n");
    fake.setPaneReadText(paneId, body);
    emitDone(paneId);
    const result = await awaitCardResult(id);
    expect(result?.status).toBe("done");
    // summary path strips trailing TUI timestamp (and skips timing line)
    expect(result?.summary).toBe("⏺ [SMOKE-02312-TS-OK] name=loom");
    // R31 M-1: output body unfiltered — timestamp residue may remain
    expect(result?.output).toContain("  10:50 AM");
  }, 20_000);
});
