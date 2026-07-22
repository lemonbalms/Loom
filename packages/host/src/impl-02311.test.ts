/**
 * PLAN 0.23.11 (R35) — tests for candidates ①③④⑤
 * claude statusline chrome · summary timing skip · spawn serialize ·
 * still-running line-anchored supersession.
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
  stripTuiChrome,
  selectCardSummaryLine,
  hasStillRunningIndicator,
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

// ── ① unit: claude statusline chrome ──────────────────────────────────────

describe("PLAN 0.23.11 ① stripTuiChrome claude statusline", () => {
  test("removes live-shaped status lines with ⚡ and/or 🧠 + │", () => {
    const sample = [
      "real answer from worker",
      "Fable 5 ⚡high 🧠 │ fable-advisor main",
      "Fable 5 🧠 │ fable-advisor main",
      "trailing content",
    ].join("\n");
    const out = stripTuiChrome(sample);
    expect(out).toContain("real answer from worker");
    expect(out).toContain("trailing content");
    expect(out).not.toContain("fable-advisor main");
    expect(out).not.toContain("⚡");
    expect(out).not.toContain("🧠");
  });

  test("boundary: ⚡ without │ separator preserved", () => {
    const line = "note: use ⚡high effort for hard tasks";
    expect(stripTuiChrome(line)).toContain("⚡high effort");
  });

  test("boundary: │ present but no ⚡/🧠 emoji preserved", () => {
    const line = "Fable 5 │ fable-advisor main";
    expect(stripTuiChrome(line)).toContain("Fable 5 │ fable-advisor main");
  });

  test("boundary R31 M-1: filter is for summary path only (helper is pure)", () => {
    // stripTuiChrome is pure; card output body must not call it (R31 M-1).
    // Assert the chrome helper still drops status while leaving body-like
    // prose with ⚡ alone intact — integration ⑤ path checks output unfiltered.
    const body = "Fable 5 ⚡high 🧠 │ fable-advisor main\nbody keeps ⚡ alone";
    const filtered = stripTuiChrome(body);
    expect(filtered).not.toContain("fable-advisor");
    expect(filtered).toContain("body keeps ⚡ alone");
  });

  // PLAN 0.23.11 라이브 보정(Deviations §0.23.11): bare composer ❯ alone
  test("removes bare ❯-only composer line (no box │)", () => {
    const sample = ["real answer from worker", "❯", "trailing content"].join(
      "\n",
    );
    const out = stripTuiChrome(sample);
    expect(out).toContain("real answer from worker");
    expect(out).toContain("trailing content");
    expect(out.split("\n").some((l) => l.trim() === "❯")).toBe(false);
  });

  test("preserves content line starting with ❯ + text", () => {
    const line = "❯ 다음 단계로";
    expect(stripTuiChrome(line)).toContain("❯ 다음 단계로");
  });

  // PLAN 0.23.11 라이브 보정 3(Deviations §0.23.11): claude effort key-hint
  test("removes ● high · /effort key-hint line", () => {
    const sample = [
      "real answer from worker",
      "● high · /effort",
      "trailing content",
    ].join("\n");
    const out = stripTuiChrome(sample);
    expect(out).toContain("real answer from worker");
    expect(out).toContain("trailing content");
    expect(out).not.toContain("· /effort");
    expect(out).not.toContain("● high");
  });

  test("preserves content line mentioning effort without · /effort", () => {
    const line = "set effort to high for this task";
    expect(stripTuiChrome(line)).toContain("set effort to high for this task");
  });
});

// ── ③ unit: summary real-content preference ───────────────────────────────

describe("PLAN 0.23.11 ③ selectCardSummaryLine", () => {
  test("trailing pure timing → previous real content", () => {
    const text = ["goal complete, tests green", "Worked for 3s."].join("\n");
    expect(selectCardSummaryLine(text)).toBe("goal complete, tests green");
  });

  test("composite 1m49s + trailing █ skipped", () => {
    const text = ["impl done marker", "Worked for 1m49s.█"].join("\n");
    expect(selectCardSummaryLine(text)).toBe("impl done marker");
  });

  test("all timing lines → fallback last non-empty", () => {
    const text = ["Worked for 1s.", "Worked for 2s."].join("\n");
    expect(selectCardSummaryLine(text)).toBe("Worked for 2s.");
  });

  test("mixed non-pure timing line not skipped", () => {
    const text = [
      "prior",
      "Worked for 3s. 그리고 추가 메모",
    ].join("\n");
    expect(selectCardSummaryLine(text)).toBe("Worked for 3s. 그리고 추가 메모");
  });

  // PLAN 0.23.11 라이브 보정 2(Deviations §0.23.11): claude ✻-verb timing
  test("trailing ✻ Sautéed for 9s → previous real content", () => {
    const text = ["goal complete, tests green", "✻ Sautéed for 9s"].join("\n");
    expect(selectCardSummaryLine(text)).toBe("goal complete, tests green");
  });

  test("non-pure ✻ content line not skipped (full-match fails)", () => {
    const text = ["prior", "✻ 참고: for 3s 규칙"].join("\n");
    expect(selectCardSummaryLine(text)).toBe("✻ 참고: for 3s 규칙");
  });
});

// ── ⑤ unit: still-running supersession (R35 M-1 line-anchored) ────────────

describe("PLAN 0.23.11 ⑤ hasStillRunningIndicator supersession", () => {
  test("probe sequence: stale indicator + later pure timing → false", () => {
    const scrape = [
      "◆ Thought for 0.5s",
      "Worked for 20s. 1 command still running.",
      "◆ Task completed in 5.0s: sleep 20",
      "[PROBE-0511-OK]",
      "Worked for 25s.",
    ].join("\n");
    expect(hasStillRunningIndicator(scrape)).toBe(false);
  });

  test("indicator at tail (in progress) → true", () => {
    const scrape = [
      "working on task",
      "Worked for 48s. 1 command still running",
    ].join("\n");
    expect(hasStillRunningIndicator(scrape)).toBe(true);
  });

  test("single line with indicator (no later line) → true", () => {
    expect(
      hasStillRunningIndicator("Worked for 48s. 1 command still running"),
    ).toBe(true);
  });

  test("R35 M-1: prose/quoted timing after indicator → non-supersession", () => {
    const scrape = [
      "1 command still running",
      'docs say: "Worked for 25s." is the supersession signal',
    ].join("\n");
    expect(hasStillRunningIndicator(scrape)).toBe(true);
  });

  test("R35 M-1: wrap-split indicator line pin fails → non-supersession", () => {
    // Joined tail still matches the pattern; no single line holds it.
    const scrape = [
      "1 command still",
      "running",
      "Worked for 25s.",
    ].join("\n");
    expect(hasStillRunningIndicator(scrape)).toBe(true);
  });

  test("no indicator → false", () => {
    expect(hasStillRunningIndicator("all done\nWorked for 3s.")).toBe(false);
  });
});

// ── integration harness ───────────────────────────────────────────────────

describe("PLAN 0.23.11 integration ④ spawn serialize + ⑤ deferral + regression", () => {
  const port = 23110 + Math.floor(Math.random() * 200);
  const dir = join(tmpdir(), `loom-impl-02311-${Date.now()}`);
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

  const POLL_MS = 80;
  const MAX_MS = 400;
  const SETTLE_MS = 15;

  const baseCfg = (placement: "pool" | "legacy" = "pool"): BridgeConfig => ({
    authorizedDispatchers: ["p_tower"],
    herdrSocketPath: herdrSock,
    agentArgv: { claude: ["claude"] },
    herdrProtocol: 17,
    paneCleanup: "auto",
    panePlacement: placement,
  });

  function nextCardId(): string {
    cardSeq += 1;
    return `task_a023b${cardSeq.toString(16).padStart(11, "0")}`;
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
      profile: placement === "legacy" ? "impl-02311-legacy" : "impl-02311",
      config: baseCfg(placement),
      herdr: new HerdrClient({ socketPath: herdrSock }),
      settleMs: SETTLE_MS,
      submitVerify: { waitMs: 300, retries: 1 },
      stillRunningPollMs: POLL_MS,
      stillRunningMaxMs: MAX_MS,
    });
    await Bun.sleep(100);
  }

  function countCardResults(
    cardId: string,
    inbox: Awaited<ReturnType<RelayClient["listInbox"]>>,
  ): CardResult[] {
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
    return matches;
  }

  /**
   * Wait for first CARD_RESULT, settle ~280ms, re-read for exact-one detection.
   * First-match-only helpers must not claim exact-one.
   */
  async function awaitSettledCardResults(
    cardId: string,
    timeoutMs = 12_000,
  ): Promise<CardResult[]> {
    if (!tower) return [];
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const inbox = await tower.listInbox();
      const matches = countCardResults(cardId, inbox);
      if (matches.length >= 1) {
        await Bun.sleep(280);
        return countCardResults(cardId, await tower.listInbox());
      }
      await Bun.sleep(80);
    }
    return [];
  }

  async function awaitCardResult(
    cardId: string,
    timeoutMs = 12_000,
  ): Promise<CardResult | null> {
    const matches = await awaitSettledCardResults(cardId, timeoutMs);
    return matches[0] ?? null;
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
    fake.pushEvent("pane_agent_status_changed", {
      pane_id: paneId,
      agent_status: "working",
    });
    await Bun.sleep(80);
    return paneId;
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

  function agentStarts(): FakeHerdr["calls"] {
    return fake.calls.filter((c) => c.method === "agent.start");
  }

  function tabCreates(): FakeHerdr["calls"] {
    return fake.calls.filter((c) => c.method === "tab.create");
  }

  function closeCallsFor(paneId: string): number {
    return fake.calls.filter(
      (c) =>
        c.method === "pane.close" &&
        String(c.params.pane_id ?? "") === paneId,
    ).length;
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

    tower = new RelayClient({ url: `ws://127.0.0.1:${port}/ws` });
    const created = await tower.createRoom({
      roomName: "impl-02311",
      displayName: "tower",
      agentKind: "shell",
      peerId: "p_tower",
    });
    if (created.type !== "room.state") throw new Error("create failed");
    inviteCode = created.inviteCode ?? "";
    const towerSecret = created.peerSecret ?? tower.peerSecret;

    towerSession = {
      roomId: created.roomId,
      roomName: "impl-02311",
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
      roomName: "impl-02311",
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

  // ④ concurrent spawns → single tab.create + same tabId twice
  test(
    "④ concurrent 2 card spawns → tab.create exactly once, same tabId",
    async () => {
      // Clear prior pool occupancy so both start from empty-pool path.
      for (const id of fake.listPaneIds()) {
        const t = fake.tabIdForPane(id);
        if (t) fake.dropTab(t);
      }
      // Force fresh pool by restarting bridge (in-memory workerPool reset).
      await restartBridge("pool");
      const nTabs = tabCreates().length;
      const nStarts = agentStarts().length;
      const id1 = nextCardId();
      const id2 = nextCardId();
      // Fire both dispatches without awaiting intermediate spawn.
      await Promise.all([
        dispatchCard(id1, "concurrent-a"),
        dispatchCard(id2, "concurrent-b"),
      ]);
      const ready = await waitFor(
        () => agentStarts().length >= nStarts + 2,
        { timeoutMs: 12_000 },
      );
      expect(ready).toBe(true);

      const newTabs = tabCreates().slice(nTabs);
      expect(newTabs.length).toBe(1);

      // Protocol 17: both agent.starts target panes on the same pool tab
      // (first on tab root, second via pane.split). tab_id is not on start.
      const newStarts = agentStarts().slice(nStarts);
      expect(newStarts.length).toBeGreaterThanOrEqual(2);
      const paneIds = newStarts
        .map((s) => String(s.params.pane_id ?? ""))
        .filter(Boolean);
      expect(paneIds.length).toBeGreaterThanOrEqual(2);
      const tabIds = new Set(
        paneIds.map((id) => fake.tabIdForPane(id)).filter(Boolean),
      );
      expect(tabIds.size).toBe(1);

      // Keep panes alive long enough for assertions; mark working so verify
      // does not tear them down mid-check.
      for (const id of fake.listPaneIds()) {
        fake.pushEvent("pane_agent_status_changed", {
          pane_id: id,
          agent_status: "working",
        });
      }
    },
    30_000,
  );

  // ④ first spawn exception (tab.create fail) does not poison second
  test(
    "④ first spawn fallback (tab.create fail) does not block second",
    async () => {
      for (const id of fake.listPaneIds()) {
        const t = fake.tabIdForPane(id);
        if (t) fake.dropTab(t);
      }
      await restartBridge("pool");
      fake.failTabCreates(1);
      const nStarts = agentStarts().length;
      const nSplits = fake.calls.filter((c) => c.method === "pane.split").length;
      const id1 = nextCardId();
      const id2 = nextCardId();
      await Promise.all([
        dispatchCard(id1, "fail-first-a"),
        dispatchCard(id2, "fail-first-b"),
      ]);
      const ready = await waitFor(
        () => agentStarts().length >= nStarts + 2,
        { timeoutMs: 12_000 },
      );
      expect(ready).toBe(true);
      // At least one unhinted pane.split fallback from the failed create path,
      // and both spawns produced panes (chain not poisoned).
      const newStarts = agentStarts().slice(nStarts);
      expect(newStarts.length).toBeGreaterThanOrEqual(2);
      const newSplits = fake.calls
        .filter((c) => c.method === "pane.split")
        .slice(nSplits);
      const unhinted = newSplits.filter(
        (s) =>
          s.params.target_pane_id === undefined ||
          s.params.target_pane_id === null,
      );
      expect(unhinted.length).toBeGreaterThanOrEqual(1);
    },
    30_000,
  );

  // ④ legacy regression
  test(
    "④ legacy placement → no tab.create (regression)",
    async () => {
      await restartBridge("legacy");
      const nTabs = tabCreates().length;
      const nStarts = agentStarts().length;
      await spawnCard(nextCardId(), "legacy serialize");
      await waitFor(() => agentStarts().length > nStarts);
      expect(tabCreates().length).toBe(nTabs);
      const last = agentStarts()[agentStarts().length - 1]!;
      expect(last.params.pane_id).toBeTruthy();
      expect(last.params.tab_id).toBeUndefined();
      await restartBridge("pool");
    },
    30_000,
  );

  // ⑤ probe sequence → immediate proposal + pane preserved (no deferral)
  test(
    "⑤ supersession scrape → immediate proposal + pane preserved",
    async () => {
      const cardId = nextCardId();
      const paneId = await spawnCard(cardId, "super-immediate");
      const scrape = [
        "◆ Thought for 0.5s",
        "Worked for 20s. 1 command still running.",
        "[PROBE-0511-OK] all good",
        "Worked for 25s.",
      ].join("\n");
      fake.setPaneReadText(paneId, scrape);
      emitWorkingThen(paneId, "idle");

      // Detection power: settle re-read + exact-one + pane membership + zero close.
      // Recovery of orphan panes is follow-up B / operator — not auto-close.
      const results = await awaitSettledCardResults(cardId, 8_000);
      expect(results).toHaveLength(1);
      const result = results[0]!;
      expect(result.status).toBe("failed");
      expect(result.reason).toBe("needs_verification");
      expect(result.note).toBeUndefined();
      expect(result.output).toContain("[PROBE-0511-OK]");
      // summary prefers real content over trailing timing
      expect(result.summary).not.toMatch(/^Worked for /);
      expect(fake.listPaneIds()).toContain(paneId);
      expect(closeCallsFor(paneId)).toBe(0);
      fake.setPaneReadText(paneId, null);
    },
    20_000,
  );

  // ⑤ indicator at tail → enter deferral (0.23.7 regression)
  test(
    "⑤ indicator at tail → deferral entered",
    async () => {
      const cardId = nextCardId();
      const paneId = await spawnCard(cardId, "defer-tail");
      fake.setPaneReadText(
        paneId,
        "working…\nWorked for 48s. 1 command still running",
      );
      emitWorkingThen(paneId, "idle");

      // During poll window: no result yet
      await Bun.sleep(SETTLE_MS * 3 + 40);
      let early: CardResult | null = null;
      {
        const inbox = await tower!.listInbox();
        for (const e of inbox) {
          const att = e.handoff.attachments?.find(
            (a) =>
              a.label === CARD_RESULT_LABEL && a.content.includes(cardId),
          );
          if (att) early = JSON.parse(att.content) as CardResult;
        }
      }
      expect(early).toBeNull();

      // Clear via supersession mid-poll
      fake.setPaneReadText(
        paneId,
        [
          "Worked for 48s. 1 command still running",
          "final answer",
          "Worked for 2s.",
        ].join("\n"),
      );

      const result = await awaitCardResult(cardId, 8_000);
      expect(result).toBeTruthy();
      expect(result!.status).toBe("failed");
      expect(result!.reason).toBe("needs_verification");
      expect(result!.note).toMatch(
        /completion deferred \d+s \(still-running indicator\)/,
      );
      // Pane preserved positive; orphan recovery is follow-up B / operator.
      await Bun.sleep(250);
      expect(fake.listPaneIds()).toContain(paneId);
      expect(closeCallsFor(paneId)).toBe(0);
      fake.setPaneReadText(paneId, null);
    },
    20_000,
  );

  // ⑥ single-line indicator → deferral exhaust (not supersession)
  test(
    "⑥ single-line indicator → deferral exhaust + pane preserved",
    async () => {
      const cardId = nextCardId();
      const paneId = await spawnCard(cardId, "single-line-ind");
      fake.setPaneReadText(
        paneId,
        "Worked for 48s. 1 command still running",
      );
      emitWorkingThen(paneId, "idle");

      await Bun.sleep(SETTLE_MS * 3 + 40);
      let early: CardResult | null = null;
      {
        const inbox = await tower!.listInbox();
        for (const e of inbox) {
          const att = e.handoff.attachments?.find(
            (a) =>
              a.label === CARD_RESULT_LABEL && a.content.includes(cardId),
          );
          if (att) early = JSON.parse(att.content) as CardResult;
        }
      }
      expect(early).toBeNull();

      // exhaust path — settle re-read + exact-one + pane membership + zero close.
      // Recovery responsibility: follow-up B / operator — not auto-close.
      const results = await awaitSettledCardResults(cardId, 8_000);
      expect(results).toHaveLength(1);
      const result = results[0]!;
      expect(result.status).toBe("failed");
      expect(result.reason).toBe("needs_verification");
      expect(result.note).toMatch(/still_running deferral exhausted/);
      expect(fake.listPaneIds()).toContain(paneId);
      expect(closeCallsFor(paneId)).toBe(0);
      fake.setPaneReadText(paneId, null);
    },
    20_000,
  );

  // ⑤ R35 M-1 boundary: quoted timing after indicator → deferral
  test(
    "⑤ R35 M-1 quoted timing after indicator → non-supersession deferral",
    async () => {
      const cardId = nextCardId();
      const paneId = await spawnCard(cardId, "quoted-timing");
      fake.setPaneReadText(
        paneId,
        [
          "1 command still running",
          'note: "Worked for 25s." is mentioned in docs',
        ].join("\n"),
      );
      emitWorkingThen(paneId, "idle");

      await Bun.sleep(SETTLE_MS * 3 + 40);
      let early: CardResult | null = null;
      {
        const inbox = await tower!.listInbox();
        for (const e of inbox) {
          const att = e.handoff.attachments?.find(
            (a) =>
              a.label === CARD_RESULT_LABEL && a.content.includes(cardId),
          );
          if (att) early = JSON.parse(att.content) as CardResult;
        }
      }
      expect(early).toBeNull();

      // Clear with real pure timing later
      fake.setPaneReadText(
        paneId,
        [
          "1 command still running",
          'note: "Worked for 25s." is mentioned',
          "Worked for 1s.",
        ].join("\n"),
      );
      const result = await awaitCardResult(cardId, 8_000);
      expect(result).toBeTruthy();
      expect(result!.status).toBe("failed");
      expect(result!.reason).toBe("needs_verification");
      expect(result!.note).toMatch(/completion deferred/);
      fake.setPaneReadText(paneId, null);
    },
    20_000,
  );

  // ⑤ R35 M-1 wrap-split → non-supersession
  test(
    "⑤ R35 M-1 wrap-split indicator → non-supersession (exhaust or clear later)",
    async () => {
      const cardId = nextCardId();
      const paneId = await spawnCard(cardId, "wrap-split");
      // Joined matches; per-line pin fails; pure timing after does NOT supersede.
      fake.setPaneReadText(
        paneId,
        ["1 command still", "running", "Worked for 25s."].join("\n"),
      );
      emitWorkingThen(paneId, "idle");

      await Bun.sleep(SETTLE_MS * 3 + 40);
      let early: CardResult | null = null;
      {
        const inbox = await tower!.listInbox();
        for (const e of inbox) {
          const att = e.handoff.attachments?.find(
            (a) =>
              a.label === CARD_RESULT_LABEL && a.content.includes(cardId),
          );
          if (att) early = JSON.parse(att.content) as CardResult;
        }
      }
      expect(early).toBeNull();

      // Leave as-is → exhaust
      const result = await awaitCardResult(cardId, 8_000);
      expect(result).toBeTruthy();
      expect(result!.status).toBe("failed");
      expect(result!.reason).toBe("needs_verification");
      expect(result!.note).toMatch(/still_running deferral exhausted/);
      fake.setPaneReadText(paneId, null);
    },
    20_000,
  );

  // ①③ integration: statusline chrome + timing skip in summary; output unfiltered
  test(
    "①③ summary strips statusline + skips timing; output body unfiltered",
    async () => {
      const cardId = nextCardId();
      const paneId = await spawnCard(cardId, "summary-chrome");
      const body = [
        "IMPL-MARKER-COMPLETE",
        "Fable 5 ⚡high 🧠 │ fable-advisor main",
        "Worked for 3s.",
      ].join("\n");
      fake.setPaneReadText(paneId, body);
      emitWorkingThen(paneId, "done");

      const result = await awaitCardResult(cardId, 8_000);
      expect(result).toBeTruthy();
      expect(result!.status).toBe("failed");
      expect(result!.reason).toBe("needs_verification");
      // R31 M-1: output body unfiltered (statusline still present)
      expect(result!.output).toContain("Fable 5 ⚡high 🧠 │ fable-advisor main");
      expect(result!.output).toContain("Worked for 3s.");
      // summary from chrome-filtered + timing skip → real content
      expect(result!.summary).toContain("IMPL-MARKER-COMPLETE");
      expect(result!.summary).not.toContain("fable-advisor");
      expect(result!.summary).not.toMatch(/^Worked for /);
      fake.setPaneReadText(paneId, null);
    },
    20_000,
  );

  // baseline card round-trip regression
  test(
    "regression: plain done card still works",
    async () => {
      const cardId = nextCardId();
      const paneId = await spawnCard(cardId, "plain-done");
      fake.setPaneReadText(paneId, "all tests green\n[IMPL-02311-DONE]");
      emitWorkingThen(paneId, "done");
      const result = await awaitCardResult(cardId, 8_000);
      expect(result).toBeTruthy();
      expect(result!.status).toBe("failed");
      expect(result!.reason).toBe("needs_verification");
      expect(result!.output).toContain("[IMPL-02311-DONE]");
      expect(result!.note).toBeUndefined();
      fake.setPaneReadText(paneId, null);
    },
    15_000,
  );
});
