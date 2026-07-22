/**
 * PLAN 0.23.7 — card completion still-running deferral (tests ①–⑦, ⑨–⑩).
 * Fake-herdr paneRead sequence + short real timers (no Bun fake-timer — 0.23.4 ⑭).
 * Test ⑧ lives in protocol card-contract.test.ts; ⑪ in bridge.test.ts (applyCardResult).
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
  hasStillRunningIndicator,
  type BridgeRuntime,
} from "./bridge-runtime";
import type { BridgeConfig } from "./bridge-config";
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

const STILL_LINE = "Worked for 48s. 1 command still running";
const DONE_BODY = "IMPL-MARKER-COMPLETE\nall tests green\n[IMPL-0237-DONE]";

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

// ─── unit: indicator helper ──────────────────────────────────────────────────

describe("PLAN 0.23.7 hasStillRunningIndicator (unit)", () => {
  test("matches tail indicator; ignores non-tail echo", () => {
    expect(hasStillRunningIndicator(STILL_LINE)).toBe(true);
    expect(
      hasStillRunningIndicator("Worked for 1m. 2 commands still running"),
    ).toBe(true);
    expect(hasStillRunningIndicator("1 COMMAND STILL RUNNING")).toBe(true);
    expect(hasStillRunningIndicator("done, nothing pending")).toBe(false);

    // Tail-only: indicator buried above 10 non-empty lines is ignored
    const buried = [
      "echo: 1 command still running (from lessons.md quote)",
      "line2",
      "line3",
      "line4",
      "line5",
      "line6",
      "line7",
      "line8",
      "line9",
      "line10",
      "line11 final answer",
    ].join("\n");
    expect(hasStillRunningIndicator(buried)).toBe(false);

    // Within last 10 non-empty:
    const nearTail = [
      "line1",
      "1 command still running",
      "line3",
    ].join("\n");
    expect(hasStillRunningIndicator(nearTail)).toBe(true);
  });
});

// ─── integration: deferral via fake herdr ────────────────────────────────────

describe("PLAN 0.23.7 still-running card completion deferral", () => {
  const port = 23070 + Math.floor(Math.random() * 200);
  const dir = join(tmpdir(), `loom-still-running-${Date.now()}`);
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
    herdrProtocol: 17,
  };

  // Short real timers so suite stays fast.
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

  /** Spawn card, wait for pane + status subscription, return paneId. */
  async function spawnCard(cardId: string, prompt: string): Promise<string> {
    const panesBefore = new Set(fake.listPaneIds());
    await dispatchCard(cardId, prompt);
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
    return paneId;
  }

  /** Drive working → idle/done completion event. */
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

    // autoStatus none: tests own status events (avoids racing with deferral).
    fake = await startFakeHerdr({
      socketPath: herdrSock,
      autoStatus: "none",
    });

    tower = new RelayClient({ url: `ws://127.0.0.1:${port}/ws` });
    const created = await tower.createRoom({
      roomName: "still-running",
      displayName: "tower",
      agentKind: "shell",
      peerId: "p_tower",
    });
    if (created.type !== "room.state") throw new Error("create failed");
    inviteCode = created.inviteCode ?? "";
    const towerSecret = created.peerSecret ?? tower.peerSecret;

    towerSession = {
      roomId: created.roomId,
      roomName: "still-running",
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
      roomName: "still-running",
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
      }),
      // Short verify so tests reach idle path quickly
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
    "① indicator hit → defer → clear → done with final output + deferred note",
    async () => {
      const cardId = "task_a023700000000001";
      const paneId = await spawnCard(cardId, "still-run-defer-clear");

      // First settle (completion path) sees still-running; later polls clear.
      fake.setPaneReadText(paneId, STILL_LINE);
      emitWorkingThen(paneId, "idle");

      // After first poll interval, switch to completed body.
      await Bun.sleep(POLL_MS + SETTLE_MS * 3 + 40);
      fake.setPaneReadText(paneId, DONE_BODY);

      const result = await awaitCardResult(cardId, 8_000);
      expect(result).toBeTruthy();
      expect(result!.status).toBe("failed");
      expect(result!.reason).toBe("needs_verification");
      expect(result!.output).toContain("IMPL-MARKER-COMPLETE");
      expect(result!.output).not.toMatch(/still running/i);
      expect(result!.note).toMatch(
        /completion deferred \d+s \(still-running indicator\)/,
      );
      fake.setPaneReadText(paneId, null);
    },
    20_000,
  );

  test(
    "② deferral + working re-entry → cancel poll; later idle re-evaluates",
    async () => {
      const cardId = "task_a023700000000002";
      const paneId = await spawnCard(cardId, "still-run-working-reentry");

      fake.setPaneReadText(paneId, STILL_LINE);
      emitWorkingThen(paneId, "idle");

      // During deferral, working re-entry cancels poll.
      await Bun.sleep(SETTLE_MS * 3 + 30);
      fake.pushEvent("pane_agent_status_changed", {
        pane_id: paneId,
        agent_status: "working",
      });

      // Ensure no result yet after a poll would have fired.
      await Bun.sleep(POLL_MS + 80);
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

      // Later: completed scrape + idle → immediate finish (no still-running).
      fake.setPaneReadText(paneId, DONE_BODY);
      fake.pushEvent("pane_agent_status_changed", {
        pane_id: paneId,
        agent_status: "idle",
      });

      const result = await awaitCardResult(cardId, 8_000);
      expect(result).toBeTruthy();
      expect(result!.status).toBe("failed");
      expect(result!.reason).toBe("needs_verification");
      expect(result!.output).toContain("IMPL-MARKER-COMPLETE");
      // Either no note (immediate) or deferred if indicator briefly seen — both ok
      // but must not be exhaust note.
      if (result!.note) {
        expect(result!.note).not.toMatch(/exhausted/);
      }
      fake.setPaneReadText(paneId, null);
    },
    20_000,
  );

  test(
    "③ max deferral exhaust → done with exhausted note",
    async () => {
      const cardId = "task_a023700000000003";
      const paneId = await spawnCard(cardId, "still-run-exhaust");

      // Indicator never clears.
      fake.setPaneReadText(paneId, STILL_LINE);
      emitWorkingThen(paneId, "idle");

      const result = await awaitCardResult(cardId, 8_000);
      expect(result).toBeTruthy();
      expect(result!.status).toBe("failed");
      expect(result!.reason).toBe("needs_verification");
      expect(result!.note).toMatch(/still_running deferral exhausted \(\d+s\)/);
      expect(result!.output).toMatch(/still running/i);
      fake.setPaneReadText(paneId, null);
    },
    20_000,
  );

  test(
    "④ no indicator → immediate done (regression, no note)",
    async () => {
      const cardId = "task_a023700000000004";
      const paneId = await spawnCard(cardId, "still-run-no-indicator");

      fake.setPaneReadText(paneId, DONE_BODY);
      emitWorkingThen(paneId, "done");

      const result = await awaitCardResult(cardId, 8_000);
      expect(result).toBeTruthy();
      expect(result!.status).toBe("failed");
      expect(result!.reason).toBe("needs_verification");
      expect(result!.output).toContain("IMPL-MARKER-COMPLETE");
      expect(result!.note).toBeUndefined();
      fake.setPaneReadText(paneId, null);
    },
    15_000,
  );

  test(
    "⑤ non-tail indicator (scrollback echo) → no deferral",
    async () => {
      const cardId = "task_a023700000000005";
      const paneId = await spawnCard(cardId, "still-run-nontail");

      const buried = [
        "quote: 1 command still running",
        "a",
        "b",
        "c",
        "d",
        "e",
        "f",
        "g",
        "h",
        "i",
        "final worker answer unique",
      ].join("\n");
      fake.setPaneReadText(paneId, buried);
      emitWorkingThen(paneId, "idle");

      const result = await awaitCardResult(cardId, 8_000);
      expect(result).toBeTruthy();
      expect(result!.status).toBe("failed");
      expect(result!.reason).toBe("needs_verification");
      expect(result!.note).toBeUndefined();
      expect(result!.output).toContain("final worker answer unique");
      fake.setPaneReadText(paneId, null);
    },
    15_000,
  );

  test(
    "⑥ blocked still immediate failed (no deferral)",
    async () => {
      const cardId = "task_a023700000000006";
      const paneId = await spawnCard(cardId, "still-run-blocked");

      // Even if scrape would show still-running, blocked path skips check.
      fake.setPaneReadText(paneId, STILL_LINE);
      emitWorkingThen(paneId, "blocked");

      const result = await awaitCardResult(cardId, 8_000);
      expect(result).toBeTruthy();
      expect(result!.status).toBe("failed");
      expect(result!.reason ?? result!.summary ?? "").toMatch(/agent_blocked/);
      expect(result!.note).toBeUndefined();
      fake.setPaneReadText(paneId, null);
    },
    15_000,
  );

  test(
    "⑦ pane_closed during deferral → timer cleanup + failed once",
    async () => {
      const cardId = "task_a023700000000007";
      const paneId = await spawnCard(cardId, "still-run-pane-closed");

      fake.setPaneReadText(paneId, STILL_LINE);
      emitWorkingThen(paneId, "idle");

      // Enter deferral window, then close pane.
      await Bun.sleep(SETTLE_MS * 3 + 40);
      fake.pushEvent("pane.closed", { pane_id: paneId });

      const result = await awaitCardResult(cardId, 8_000);
      expect(result).toBeTruthy();
      expect(result!.status).toBe("failed");
      expect(result!.reason ?? result!.summary ?? "").toMatch(/pane_closed/);

      // Wait past max poll window — must not emit a second result.
      await Bun.sleep(MAX_MS + POLL_MS + 100);
      const inbox = await tower!.listInbox();
      const hits = inbox.filter((e) =>
        e.handoff.attachments?.some(
          (a) =>
            a.label === CARD_RESULT_LABEL && a.content.includes(cardId),
        ),
      );
      expect(hits.length).toBe(1);
      fake.setPaneReadText(paneId, null);
    },
    20_000,
  );

  test(
    "⑨ M-1: duplicate done/idle during deferral → single result, single poll ownership",
    async () => {
      const cardId = "task_a023700000000009";
      const paneId = await spawnCard(cardId, "still-run-dup-events");

      fake.setPaneReadText(paneId, STILL_LINE);
      emitWorkingThen(paneId, "idle");

      // Spam completion-class events while deferral owns the path.
      await Bun.sleep(SETTLE_MS * 2 + 20);
      for (let i = 0; i < 5; i++) {
        fake.pushEvent("pane_agent_status_changed", {
          pane_id: paneId,
          agent_status: "done",
        });
        fake.pushEvent("pane_agent_status_changed", {
          pane_id: paneId,
          agent_status: "idle",
        });
      }

      // Clear indicator so one finish occurs.
      await Bun.sleep(POLL_MS + 30);
      fake.setPaneReadText(paneId, DONE_BODY);

      const result = await awaitCardResult(cardId, 8_000);
      expect(result).toBeTruthy();
      expect(result!.status).toBe("failed");
      expect(result!.reason).toBe("needs_verification");

      await Bun.sleep(POLL_MS + 80);
      const inbox = await tower!.listInbox();
      const hits = inbox.filter((e) =>
        e.handoff.attachments?.some(
          (a) =>
            a.label === CARD_RESULT_LABEL && a.content.includes(cardId),
        ),
      );
      expect(hits.length).toBe(1);
      fake.setPaneReadText(paneId, null);
    },
    20_000,
  );

  test(
    "⑩ M-1: blocked during deferral → timer cleanup + failed once",
    async () => {
      const cardId = "task_a02370000000000a";
      const paneId = await spawnCard(cardId, "still-run-blocked-defer");

      fake.setPaneReadText(paneId, STILL_LINE);
      emitWorkingThen(paneId, "idle");

      await Bun.sleep(SETTLE_MS * 3 + 40);
      fake.pushEvent("pane_agent_status_changed", {
        pane_id: paneId,
        agent_status: "blocked",
      });

      const result = await awaitCardResult(cardId, 8_000);
      expect(result).toBeTruthy();
      expect(result!.status).toBe("failed");
      expect(result!.reason ?? result!.summary ?? "").toMatch(/agent_blocked/);

      // Past exhaust window: still only one result (no late done).
      await Bun.sleep(MAX_MS + POLL_MS + 100);
      const inbox = await tower!.listInbox();
      const hits = inbox.filter((e) =>
        e.handoff.attachments?.some(
          (a) =>
            a.label === CARD_RESULT_LABEL && a.content.includes(cardId),
        ),
      );
      expect(hits.length).toBe(1);
      fake.setPaneReadText(paneId, null);
    },
    20_000,
  );
});
