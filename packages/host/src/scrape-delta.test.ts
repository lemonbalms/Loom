/**
 * PLAN 0.23.6 — pane scrape delta + TUI chrome filter (tests ①–⑪).
 * Fake-herdr paneRead sequence control + short real timers (no Bun fake-timer).
 */
import { describe, expect, test, afterAll, beforeAll } from "bun:test";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { RelayServer } from "@loom/relay";
import {
  CARD_CONTRACT_VERSION,
  CARD_DISPATCH_LABEL,
  CARD_RESULT_LABEL,
  buildDispatchBody,
  serializeCardAttachment,
  MAX_CONV_TURN_INLINE_CHARS,
  type HandoffAttachment,
} from "@loom/protocol";
import { RelayClient } from "./relay-client";
import { HerdrClient } from "./herdr-client";
import { startFakeHerdr, type FakeHerdr } from "./fake-herdr";
import {
  startBridgeRuntime,
  stripTuiChrome,
  buildDeltaAnchor,
  applyDeltaAnchor,
  normalizeWithIndexMap,
  type BridgeRuntime,
} from "./bridge-runtime";
import type { BridgeConfig } from "./bridge-config";
import {
  resetStateHomeDirCache,
  setActiveProfile,
  loomDir,
  type FableSession,
} from "./session-store";
import { convOpen, convSendTurn, convAwait, convClose } from "./conv-ops";
import { saveConvNodeHosts } from "./conv-node-hosts";

// ─── chrome samples (synthetic, shaped like live TUI scrapes) ───────────────

const CLAUDE_CHROME = [
  "╭──────────────────────────────────────╮",
  "│ ❯ ask me anything                   │",
  "╰──────────────────────────────────────╯",
  "Shift+Tab:mode │ Ctrl+.:shortcuts",
  "real answer line from claude",
  "Ctrl+c:cancel",
].join("\n");

const GROK_CHROME = [
  "┌──────────────────────────────────────┐",
  "│ ❯                                    │",
  "└──────────────────────────────────────┘",
  "Shift+Tab:mode │ Ctrl+.:shortcuts",
  "grok said hello",
].join("\n");

const CODEX_CHROME = [
  "────────────────────────",
  "│ ❯ ready",
  "Shift+Tab:mode",
  "codex finished the task",
  "Ctrl+c:cancel",
].join("\n");

type CardResult = {
  status?: string;
  reason?: string;
  summary?: string;
  output?: string;
  cardId?: string;
};

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

// ─── unit: chrome + delta helpers ───────────────────────────────────────────

describe("PLAN 0.23.6 stripTuiChrome + delta helpers (unit)", () => {
  test("① chrome filter — claude/grok/codex samples drop chrome, keep content", () => {
    const c = stripTuiChrome(CLAUDE_CHROME);
    expect(c).toContain("real answer line from claude");
    expect(c).not.toContain("Shift+Tab:mode");
    expect(c).not.toContain("Ctrl+.:shortcuts");
    expect(c).not.toContain("Ctrl+c:cancel");
    expect(c).not.toMatch(/╭|╰/);
    expect(c).not.toContain("│ ❯");

    const g = stripTuiChrome(GROK_CHROME);
    expect(g).toContain("grok said hello");
    expect(g).not.toContain("Shift+Tab:mode");
    expect(g).not.toMatch(/┌|└/);

    const x = stripTuiChrome(CODEX_CHROME);
    expect(x).toContain("codex finished the task");
    expect(x).not.toContain("Ctrl+c:cancel");
    expect(x).not.toContain("│ ❯");

    // non-chrome similar lines preserved (box char mid-content, no pure border)
    const mixed = "the pipe │ character in prose\nactual answer";
    expect(stripTuiChrome(mixed)).toContain("the pipe │ character in prose");
    expect(stripTuiChrome(mixed)).toContain("actual answer");
  });

  test("⑪ PLAN 0.23.8 chrome known-hint 2종 + boundary preserve", () => {
    // grok content-bearing status line (live board-note pollution)
    const grokStatus =
      "real answer\n╰─ Grok 4.5 (high) · 12s ─╯\nmore content";
    const g = stripTuiChrome(grokStatus);
    expect(g).toContain("real answer");
    expect(g).toContain("more content");
    expect(g).not.toContain("Grok 4.5");
    expect(g).not.toMatch(/╰─.*─╯/);

    // claude autoaccept hint
    const claudeHint =
      "done work\n⏵⏵ auto mode on · esc to interrupt\nShift+Tab:mode │ Ctrl+.:shortcuts";
    const c = stripTuiChrome(claudeHint);
    expect(c).toContain("done work");
    expect(c).not.toContain("auto mode on");
    expect(c).not.toContain("Shift+Tab:mode");

    // Boundary: ╰─ start but no ─╯ end → content preserved
    const openOnly = "note: ╰─ incomplete box line without closer";
    expect(stripTuiChrome(openOnly)).toContain("incomplete box line");

    // Boundary: "auto mode on" quoted without ⏵⏵ marker → preserved
    const quoteOnly =
      'docs say: "auto mode on" is a known chrome marker with the  arrows';
    expect(stripTuiChrome(quoteOnly)).toContain("auto mode on");
  });

  test("④ unit: wrap-deformed anchor match + original slice integrity (M-2)", () => {
    // Prior turn tail had spaces/newlines; next scrape re-wraps them.
    const prior = "hello world\n  indented  tail\nline three";
    const anchor = buildDeltaAnchor(prior);
    expect(anchor).toBe(normalizeWithIndexMap(prior).normalized);

    const next =
      "hello\nworld\n  indented  tail\nline three\n\nnew  delta\nwith spaces";
    const r = applyDeltaAnchor(next, anchor);
    expect(r.kind).toBe("applied");
    if (r.kind !== "applied") return;
    // Original whitespace/newlines in the delta region preserved (not normalized slice)
    expect(r.text).toContain("new  delta");
    expect(r.text).toContain("with spaces");
    expect(r.text).toMatch(/\n/);
    // Must not be the collapsed form
    expect(r.text).not.toBe("newdelta withspaces");
    expect(r.kept).toBe(r.text.length);
    expect(r.total).toBe(next.length);
  });
});

// ─── integration: bridge + fake herdr ───────────────────────────────────────

describe("PLAN 0.23.6 scrape delta + chrome filter (integration)", () => {
  const port = 23600 + Math.floor(Math.random() * 200);
  const dir = join(tmpdir(), `loom-scrape-delta-${Date.now()}`);
  const towerSessionFile = join(dir, "tower-session.json");
  const workerSessionFile = join(dir, "worker-session.json");
  const herdrSock = join(dir, "herdr.sock");
  const relay = new RelayServer({ host: "127.0.0.1", port });

  let fake: FakeHerdr;
  let bridge: BridgeRuntime | null = null;
  let towerSession: FableSession;
  let workerSession: FableSession;
  let inviteCode = "";
  let tower: RelayClient | null = null;

  const cfg: BridgeConfig = {
    authorizedDispatchers: ["p_tower"],
    herdrSocketPath: herdrSock,
    agentArgv: { claude: ["claude"] },
    herdrProtocol: 16,
  };

  function useTowerSession(): void {
    process.env.LOOM_SESSION = towerSessionFile;
    resetStateHomeDirCache();
    setActiveProfile(null);
  }

  /** Drain any turns already queued from the open/inject cycle. */
  async function drainTurns(convId: string, max = 6): Promise<void> {
    for (let i = 0; i < max; i++) {
      const r = await convAwait({ convId, timeoutSec: 1 });
      if (r.status === "timeout") break;
    }
  }

  /** Wait for a worker turn whose text matches `pred` (or any turn if omitted). */
  async function awaitTurn(
    convId: string,
    pred?: (text: string) => boolean,
    attempts = 6,
  ): Promise<Extract<Awaited<ReturnType<typeof convAwait>>, { status: "turn" }> | null> {
    for (let i = 0; i < attempts; i++) {
      const r = await convAwait({ convId, timeoutSec: 10 });
      if (r.status === "turn" && (!pred || pred(r.text))) return r;
      if (r.status === "timeout") break;
    }
    return null;
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
      await Bun.sleep(100);
    }
    return null;
  }

  /** Mirror inject-verify dispatch (displayName target + full card payload). */
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

  beforeAll(async () => {
    mkdirSync(dir, { recursive: true });
    process.env.LOOM_TEST_HOME = dir;
    process.env.LOOM_NO_AUTO_HOST = "1";
    resetStateHomeDirCache();
    setActiveProfile(null);
    relay.start();

    fake = await startFakeHerdr({
      socketPath: herdrSock,
      autoStatus: "done",
      autoStatusDelayMs: 40,
    });

    tower = new RelayClient({ url: `ws://127.0.0.1:${port}/ws` });
    const created = await tower.createRoom({
      roomName: "scrape-delta",
      displayName: "tower",
      agentKind: "shell",
      peerId: "p_tower",
    });
    if (created.type !== "room.state") throw new Error("create failed");
    inviteCode = created.inviteCode ?? "";
    const towerSecret = created.peerSecret ?? tower.peerSecret;

    towerSession = {
      roomId: created.roomId,
      roomName: "scrape-delta",
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

    workerSession = {
      roomId: created.roomId,
      roomName: "scrape-delta",
      inviteCode,
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

    bridge = await startBridgeRuntime({
      session: workerSession,
      profile: "node",
      config: cfg,
      herdr: new HerdrClient({
        socketPath: herdrSock,
        submitDelayMs: 0,
      }),
      submitVerify: { waitMs: 300, retries: 1 },
      // Short real settle delay so tests stay fast (still exercises re-read).
      settleMs: 20,
    });

    // Capture peerSecret after bridge joins
    await Bun.sleep(200);
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
    "② conv 2-turn delta — turn2 inline lacks turn1 body, only new content",
    async () => {
      useTowerSession();
      const opened = await convOpen({
        node: "node/wsl-1",
        goal: "delta-two-turn",
      });
      expect(opened.ok).toBe(true);
      if (!opened.ok) return;
      await convAwait({ convId: opened.convId, timeoutSec: 15 });
      await drainTurns(opened.convId);

      const paneId = fake.paneIdForConv(opened.convId);
      expect(paneId).toBeTruthy();

      const turn1Body = "TURN1_UNIQUE_MARKER_AAA\nline-two-of-turn1\nline-three";
      fake.setPaneReadText(paneId!, turn1Body);
      expect(
        (await convSendTurn({ convId: opened.convId, text: "t1" })).ok,
      ).toBe(true);

      let t1: Awaited<ReturnType<typeof convAwait>> | null = null;
      for (let i = 0; i < 4; i++) {
        const r = await convAwait({ convId: opened.convId, timeoutSec: 10 });
        if (r.status === "turn" && r.text.includes("TURN1_UNIQUE")) {
          t1 = r;
          break;
        }
      }
      expect(t1?.status).toBe("turn");
      if (t1?.status !== "turn") return;
      expect(t1.text).toContain("TURN1_UNIQUE_MARKER_AAA");

      const turn2Full = `${turn1Body}\nTURN2_ONLY_NEW_BBB\nsecond-new-line`;
      fake.setPaneReadText(paneId!, turn2Full);
      expect(
        (await convSendTurn({ convId: opened.convId, text: "t2" })).ok,
      ).toBe(true);

      let t2: Awaited<ReturnType<typeof convAwait>> | null = null;
      for (let i = 0; i < 4; i++) {
        const r = await convAwait({ convId: opened.convId, timeoutSec: 10 });
        if (r.status === "turn" && r.text.includes("TURN2_ONLY")) {
          t2 = r;
          break;
        }
        if (
          r.status === "turn" &&
          r.text.includes("delta:") &&
          !r.text.includes("TURN1_UNIQUE")
        ) {
          t2 = r;
          break;
        }
      }
      expect(t2?.status).toBe("turn");
      if (t2?.status !== "turn") return;
      expect(t2.text).toContain("TURN2_ONLY_NEW_BBB");
      expect(t2.text).not.toContain("TURN1_UNIQUE_MARKER_AAA");
      expect(t2.text).toMatch(/delta: kept \d+\/\d+ chars/);

      await convClose({ convId: opened.convId, reason: "abort" });
    },
    40_000,
  );

  test(
    "③ anchor miss → full scrape fallback + note",
    async () => {
      useTowerSession();
      const opened = await convOpen({
        node: "node/wsl-1",
        goal: "delta-miss",
      });
      expect(opened.ok).toBe(true);
      if (!opened.ok) return;
      await convAwait({ convId: opened.convId, timeoutSec: 15 });
      await drainTurns(opened.convId);

      const paneId = fake.paneIdForConv(opened.convId)!;
      fake.setPaneReadText(paneId, "ANCHOR_SEED_LINE_ONE\nseed two\nseed three");
      expect(
        (await convSendTurn({ convId: opened.convId, text: "seed" })).ok,
      ).toBe(true);
      await drainTurns(opened.convId, 3);

      // Completely different content — anchor cannot match
      fake.setPaneReadText(
        paneId,
        "TOTALLY_UNRELATED_CONTENT_XYZ\nno shared tail",
      );
      expect(
        (await convSendTurn({ convId: opened.convId, text: "miss" })).ok,
      ).toBe(true);

      let miss: Awaited<ReturnType<typeof convAwait>> | null = null;
      for (let i = 0; i < 4; i++) {
        const r = await convAwait({ convId: opened.convId, timeoutSec: 10 });
        if (
          r.status === "turn" &&
          r.text.includes("delta anchor miss (full scrape)")
        ) {
          miss = r;
          break;
        }
      }
      expect(miss?.status).toBe("turn");
      if (miss?.status !== "turn") return;
      expect(miss.text).toContain("TOTALLY_UNRELATED_CONTENT_XYZ");
      expect(miss.text).toContain("delta anchor miss (full scrape)");

      await convClose({ convId: opened.convId, reason: "abort" });
    },
    40_000,
  );

  test(
    "④ integration: wrap-deformed anchor + original whitespace in delta",
    async () => {
      useTowerSession();
      const opened = await convOpen({
        node: "node/wsl-1",
        goal: "delta-wrap",
      });
      expect(opened.ok).toBe(true);
      if (!opened.ok) return;
      await convAwait({ convId: opened.convId, timeoutSec: 15 });
      await drainTurns(opened.convId);

      const paneId = fake.paneIdForConv(opened.convId)!;
      const prior = "alpha beta gamma\n  spaced  mid\nomega";
      fake.setPaneReadText(paneId, prior);
      expect(
        (await convSendTurn({ convId: opened.convId, text: "p" })).ok,
      ).toBe(true);
      // Must wait for seed turn to commit the anchor before the wrap turn
      const seed = await awaitTurn(
        opened.convId,
        (t) => t.includes("omega") || t.includes("alpha"),
      );
      expect(seed).toBeTruthy();

      // Re-wrap prior content; append new with double spaces (M-2 integrity)
      const next = `alpha\nbeta gamma\n  spaced  mid\nomega\nNEW  DELTA  LINE`;
      // Sanity: pure helper would apply
      expect(applyDeltaAnchor(next, buildDeltaAnchor(prior)).kind).toBe(
        "applied",
      );
      fake.setPaneReadText(paneId, next);
      expect(
        (await convSendTurn({ convId: opened.convId, text: "n" })).ok,
      ).toBe(true);

      const t = await awaitTurn(opened.convId, (tx) =>
        tx.includes("NEW  DELTA"),
      );
      expect(t?.status).toBe("turn");
      if (t?.status !== "turn") return;
      expect(t.text).toContain("NEW  DELTA  LINE");
      // double spaces preserved in original slice
      expect(t.text).toMatch(/NEW {2}DELTA {2}LINE/);
      expect(t.text).not.toContain("alpha beta gamma");
      expect(t.text).toMatch(/delta: kept \d+\/\d+ chars/);

      await convClose({ convId: opened.convId, reason: "abort" });
    },
    40_000,
  );

  test(
    "⑤ card summary excludes key-hint chrome line",
    async () => {
      const cardId = "task_a023600000000001";
      const body = [
        "worker wrote the answer",
        "Shift+Tab:mode │ Ctrl+.:shortcuts",
      ].join("\n");

      const panesBefore = new Set(fake.listPaneIds());
      // autoStatus completes 40ms after Enter. Seed the scrape before dispatch
      // so completion cannot outrun the fixture while this test finds the pane.
      fake.setPaneReadText("*", body);
      await dispatchCard(cardId, "summary chrome filter");

      const paneReady = await waitFor(
        () => fake.listPaneIds().some((p) => !panesBefore.has(p)),
        { timeoutMs: 8_000 },
      );
      expect(paneReady).toBe(true);
      const paneId = fake.listPaneIds().find((p) => !panesBefore.has(p))!;

      const result = await awaitCardResult(cardId);
      expect(result).toBeTruthy();
      expect(result!.status).toBe("done");
      expect(result!.summary).toBe("worker wrote the answer");
      expect(result!.summary).not.toContain("Shift+Tab");
      // M-1: output body still has the hint line
      expect(result!.output).toContain("Shift+Tab:mode");
      fake.setPaneReadText("*", null);
      fake.setPaneReadText(paneId, null);
    },
    20_000,
  );

  test(
    "⑥ artifact markers scanned on pre-filter raw (chrome filter does not drop markers)",
    async () => {
      useTowerSession();
      saveConvNodeHosts({ [workerSession.peerId]: "node-alias" });

      const opened = await convOpen({
        node: "node/wsl-1",
        goal: "artifact-vs-chrome",
      });
      expect(opened.ok).toBe(true);
      if (!opened.ok) return;
      await convAwait({ convId: opened.convId, timeoutSec: 15 });
      await drainTurns(opened.convId);

      const paneId = fake.paneIdForConv(opened.convId)!;
      const artDir = join(loomDir(), "artifacts", opened.convId);
      mkdirSync(artDir, { recursive: true, mode: 0o700 });
      const filename = "chrome-safe.md";
      const body = "artifact body";
      writeFileSync(join(artDir, filename), body, "utf8");
      const expectedSha = createHash("sha256").update(body, "utf8").digest("hex");

      // Marker sits among chrome lines; filter would drop chrome but must not
      // prevent marker scan (scan is pre-filter).
      const scrape = [
        "╭──────╮",
        "content before",
        `[ARTIFACT] ${filename}`,
        "Shift+Tab:mode │ Ctrl+.:shortcuts",
      ].join("\n");
      fake.setPaneReadText(paneId, scrape);
      expect(
        (await convSendTurn({ convId: opened.convId, text: "art" })).ok,
      ).toBe(true);

      let t: Awaited<ReturnType<typeof convAwait>> | null = null;
      for (let i = 0; i < 4; i++) {
        const r = await convAwait({ convId: opened.convId, timeoutSec: 10 });
        if (r.status === "turn" && r.artifacts?.length) {
          t = r;
          break;
        }
      }
      expect(t?.status).toBe("turn");
      if (t?.status !== "turn") return;
      expect(t.artifacts).toHaveLength(1);
      expect(t.artifacts![0]!.sha256).toBe(expectedSha);
      // Inline text is chrome-filtered (no key-hint) but may still mention artifact notice
      expect(t.text).not.toContain("Shift+Tab:mode");
      expect(t.text).toContain("content before");

      await convClose({ convId: opened.convId, reason: "abort" });
    },
    40_000,
  );

  test(
    "⑦ settle re-read — 1st≠2nd uses 3rd sample",
    async () => {
      useTowerSession();
      const opened = await convOpen({
        node: "node/wsl-1",
        goal: "settle-reread",
      });
      expect(opened.ok).toBe(true);
      if (!opened.ok) return;
      await convAwait({ convId: opened.convId, timeoutSec: 15 });
      await drainTurns(opened.convId);

      const paneId = fake.paneIdForConv(opened.convId)!;
      const readsBefore = fake.paneReadCount();

      // 3 distinct samples: settle should take the third when 1≠2
      fake.setPaneReadSequence(paneId, [
        "SETTLE_V1_partial",
        "SETTLE_V2_still_partial",
        "SETTLE_V3_final_answer",
      ]);
      expect(
        (await convSendTurn({ convId: opened.convId, text: "settle" })).ok,
      ).toBe(true);

      let t: Awaited<ReturnType<typeof convAwait>> | null = null;
      for (let i = 0; i < 4; i++) {
        const r = await convAwait({ convId: opened.convId, timeoutSec: 10 });
        if (r.status === "turn" && r.text.includes("SETTLE_V3")) {
          t = r;
          break;
        }
      }
      expect(t?.status).toBe("turn");
      if (t?.status !== "turn") return;
      expect(t.text).toContain("SETTLE_V3_final_answer");
      expect(t.text).not.toContain("SETTLE_V1_partial");
      // At least 3 pane.reads for the settle path of this turn
      expect(fake.paneReadCount() - readsBefore).toBeGreaterThanOrEqual(3);

      fake.setPaneReadSequence(paneId, null);
      await convClose({ convId: opened.convId, reason: "abort" });
    },
    40_000,
  );

  test(
    "⑧ delta anchor not updated when turn send fails",
    async () => {
      useTowerSession();
      const opened = await convOpen({
        node: "node/wsl-1",
        goal: "anchor-no-update-on-fail",
      });
      expect(opened.ok).toBe(true);
      if (!opened.ok) return;
      await convAwait({ convId: opened.convId, timeoutSec: 15 });
      await drainTurns(opened.convId);

      const paneId = fake.paneIdForConv(opened.convId)!;
      const seedText = "SEED_A\nSEED_B\nSEED_C";
      fake.setPaneReadText(paneId, seedText);
      expect(
        (await convSendTurn({ convId: opened.convId, text: "seed" })).ok,
      ).toBe(true);
      const seedTurn = await awaitTurn(opened.convId, (t) =>
        t.includes("SEED_A"),
      );
      expect(seedTurn).toBeTruthy();

      // Block worker→tower turns so send fails (anchor must not advance)
      const origHandoff = RelayClient.prototype.handoff;
      let blockWorkerTurns = true;
      let failCount = 0;
      RelayClient.prototype.handoff = async function (
        this: RelayClient,
        partial: {
          to: string;
          body: string;
          mode?: "message" | "task";
          attachments?: HandoffAttachment[];
        },
      ) {
        if (
          blockWorkerTurns &&
          partial.to === towerSession.peerId &&
          partial.body.includes("intent: conv.turn")
        ) {
          failCount++;
          throw new Error("simulated turn send failure for anchor test");
        }
        return origHandoff.call(this, partial);
      };

      try {
        // This scrape would become the new anchor if send succeeded
        fake.setPaneReadText(
          paneId,
          "SEED_A\nSEED_B\nSEED_C\nFAILED_SEND_NEW_CONTENT",
        );
        expect(
          (await convSendTurn({ convId: opened.convId, text: "fail-me" })).ok,
        ).toBe(true);
        for (let i = 0; i < 20 && failCount === 0; i++) {
          await Bun.sleep(100);
        }
        expect(failCount).toBeGreaterThanOrEqual(1);
        // Ensure no turn leaked while blocked
        await Bun.sleep(300);

        blockWorkerTurns = false;

        // Anchor still seed → delta keeps failed content + after, drops SEED
        fake.setPaneReadText(
          paneId,
          "SEED_A\nSEED_B\nSEED_C\nFAILED_SEND_NEW_CONTENT\nAFTER_UNBLOCK",
        );
        expect(
          (await convSendTurn({ convId: opened.convId, text: "retry" })).ok,
        ).toBe(true);

        const t = await awaitTurn(
          opened.convId,
          (tx) =>
            tx.includes("AFTER_UNBLOCK") ||
            tx.includes("FAILED_SEND_NEW_CONTENT"),
        );
        expect(t?.status).toBe("turn");
        if (t?.status !== "turn") return;
        expect(t.text).toContain("FAILED_SEND_NEW_CONTENT");
        expect(t.text).toContain("AFTER_UNBLOCK");
        expect(t.text).not.toContain("SEED_A");
        expect(t.text).toMatch(/delta: kept \d+\/\d+ chars/);
      } finally {
        blockWorkerTurns = false;
        RelayClient.prototype.handoff = origHandoff;
      }

      await convClose({ convId: opened.convId, reason: "abort" });
    },
    40_000,
  );

  test(
    "⑨ regression: conv round-trip + card result still complete",
    async () => {
      useTowerSession();
      const opened = await convOpen({
        node: "node/wsl-1",
        goal: "regression-roundtrip",
      });
      expect(opened.ok).toBe(true);
      if (!opened.ok) return;
      // accept or first turn both prove the open path is alive
      let sawOpen = false;
      for (let i = 0; i < 4; i++) {
        const r = await convAwait({ convId: opened.convId, timeoutSec: 10 });
        if (r.status === "accept" || r.status === "turn") {
          sawOpen = true;
          break;
        }
        if (r.status === "timeout") break;
      }
      expect(sawOpen).toBe(true);
      await drainTurns(opened.convId);

      const paneId = fake.paneIdForConv(opened.convId)!;
      fake.setPaneReadText(paneId, "REGRESSION_OK_LINE");
      expect(
        (await convSendTurn({ convId: opened.convId, text: "ping" })).ok,
      ).toBe(true);
      const t = await awaitTurn(opened.convId, (tx) =>
        tx.includes("REGRESSION_OK"),
      );
      expect(t?.status).toBe("turn");
      await convClose({ convId: opened.convId, reason: "done" });

      // Card path regression
      const cardId = "task_a023600000000009";
      const panesBefore = new Set(fake.listPaneIds());
      await dispatchCard(cardId, "card regression");
      const paneReady = await waitFor(
        () => fake.listPaneIds().some((p) => !panesBefore.has(p)),
        { timeoutMs: 8_000 },
      );
      expect(paneReady).toBe(true);
      const cPane = fake.listPaneIds().find((p) => !panesBefore.has(p))!;
      fake.setPaneReadText(cPane, "card body ok\nfinal summary line");
      const result = await awaitCardResult(cardId);
      expect(result?.status).toBe("done");
      expect(result?.summary).toBe("final summary line");
      expect(result?.output).toContain("card body ok");
    },
    40_000,
  );

  test(
    "⑩ card output preserves body lines that quote key-hint strings (M-1)",
    async () => {
      const cardId = "task_a02360000000000a";
      // Worker quotes the chrome string as content (like this repo's PLAN.md)
      const body = [
        "Observation: summary polluted by",
        "Shift+Tab:mode │ Ctrl+.:shortcuts",
        "was seen in board notes.",
      ].join("\n");
      const panesBefore = new Set(fake.listPaneIds());
      await dispatchCard(cardId, "preserve key-hint quotation in output");
      const paneReady = await waitFor(
        () => fake.listPaneIds().some((p) => !panesBefore.has(p)),
        { timeoutMs: 8_000 },
      );
      expect(paneReady).toBe(true);
      const paneId = fake.listPaneIds().find((p) => !panesBefore.has(p))!;
      fake.setPaneReadText(paneId, body);

      const result = await awaitCardResult(cardId);
      expect(result?.status).toBe("done");
      // output body unfiltered — key-hint quotation preserved (M-1)
      expect(result?.output).toContain("Shift+Tab:mode │ Ctrl+.:shortcuts");
      expect(result?.output).toContain("was seen in board notes");
      // summary uses filtered input → last non-chrome non-empty line
      expect(result?.summary).toBe("was seen in board notes.");
      expect(result?.summary).not.toContain("Shift+Tab");
    },
    20_000,
  );

  test(
    "⑪ >32k scrape — packaging uses filtered full scrape, no delta, anchor still updates (L-1)",
    async () => {
      useTowerSession();
      saveConvNodeHosts({ [workerSession.peerId]: "node-alias" });

      const opened = await convOpen({
        node: "node/wsl-1",
        goal: "big-package-l1",
      });
      expect(opened.ok).toBe(true);
      if (!opened.ok) return;
      await convAwait({ convId: opened.convId, timeoutSec: 15 });
      await drainTurns(opened.convId);

      const paneId = fake.paneIdForConv(opened.convId)!;

      // Multi-line filler so delta anchor (last ≤3 lines) stays short after packaging
      const lines: string[] = ["Shift+Tab:mode │ Ctrl+.:shortcuts"];
      let n = 0;
      while (lines.join("\n").length < MAX_CONV_TURN_INLINE_CHARS + 2_000) {
        lines.push(`FILL_${n}=${"x".repeat(80)}`);
        n++;
      }
      const big = lines.join("\n");
      expect(stripTuiChrome(big).length).toBeGreaterThan(
        MAX_CONV_TURN_INLINE_CHARS,
      );

      fake.setPaneReadText(paneId, big);
      expect(
        (await convSendTurn({ convId: opened.convId, text: "big" })).ok,
      ).toBe(true);

      const packaged = await awaitTurn(
        opened.convId,
        (tx) => tx.includes("recovery-window") || tx.includes("artifact"),
        8,
      );
      // Prefer artifact-bearing turn
      let packagedTurn = packaged;
      if (packagedTurn && !packagedTurn.artifacts?.length) {
        packagedTurn = await awaitTurn(
          opened.convId,
          () => true,
          4,
        );
      }
      // Re-fetch by looping for artifacts
      let withArt: typeof packaged = null;
        // If first await didn't get artifacts, keep polling
        if (packaged?.artifacts?.length) {
          withArt = packaged;
        } else {
          for (let i = 0; i < 6; i++) {
            const r = await convAwait({
              convId: opened.convId,
              timeoutSec: 10,
            });
            if (r.status === "turn" && r.artifacts?.length) {
              withArt = r;
              break;
            }
            if (r.status === "timeout") break;
          }
        }
      expect(withArt?.status).toBe("turn");
      if (withArt?.status !== "turn") return;
      // Packaging path: no delta stats note (delta not applied on >32k)
      expect(withArt.text).not.toMatch(/delta: kept/);
      expect(withArt.artifacts).toHaveLength(1);

      const filePath = join(
        loomDir(),
        "artifacts",
        opened.convId,
        `turn-${withArt.seq}.txt`,
      );
      const onDisk = readFileSync(filePath, "utf8");
      // L-1: packaged content is chrome-filtered full scrape
      expect(onDisk).not.toContain("Shift+Tab:mode");
      expect(onDisk).toContain("FILL_0=");
      expect(onDisk.length).toBeGreaterThan(MAX_CONV_TURN_INLINE_CHARS);

      // Anchor = last 3 non-empty of filtered big; next scrape = those + POST (small)
      const filteredBig = stripTuiChrome(big);
      const tail3 = filteredBig
        .split(/\r?\n/)
        .filter((l) => l.trim() !== "")
        .slice(-3);
      const after = [...tail3, "POST_PACKAGE_ONLY_LINE"].join("\n");
      expect(after.length).toBeLessThan(MAX_CONV_TURN_INLINE_CHARS);
      fake.setPaneReadText(paneId, after);
      expect(
        (await convSendTurn({ convId: opened.convId, text: "after" })).ok,
      ).toBe(true);
      const post = await awaitTurn(opened.convId, (tx) =>
        tx.includes("POST_PACKAGE_ONLY"),
      );
      expect(post?.status).toBe("turn");
      if (post?.status !== "turn") return;
      expect(post.text).toContain("POST_PACKAGE_ONLY_LINE");
      // Delta only — not the bulk FILL body
      expect(post.text).not.toContain("FILL_0=");
      expect(post.text).toMatch(/delta: kept \d+\/\d+ chars/);

      await convClose({ convId: opened.convId, reason: "abort" });
    },
    60_000,
  );

  test(
    "empty delta note when scrape unchanged after anchor",
    async () => {
      useTowerSession();
      const opened = await convOpen({
        node: "node/wsl-1",
        goal: "empty-delta",
      });
      expect(opened.ok).toBe(true);
      if (!opened.ok) return;
      await convAwait({ convId: opened.convId, timeoutSec: 15 });
      await drainTurns(opened.convId);

      const paneId = fake.paneIdForConv(opened.convId)!;
      const same = "SAME_LINE_A\nSAME_LINE_B\nSAME_LINE_C";
      fake.setPaneReadText(paneId, same);
      expect(
        (await convSendTurn({ convId: opened.convId, text: "a" })).ok,
      ).toBe(true);
      await drainTurns(opened.convId, 3);

      // Identical scrape → empty delta
      fake.setPaneReadText(paneId, same);
      expect(
        (await convSendTurn({ convId: opened.convId, text: "b" })).ok,
      ).toBe(true);
      let t: Awaited<ReturnType<typeof convAwait>> | null = null;
      for (let i = 0; i < 4; i++) {
        const r = await convAwait({ convId: opened.convId, timeoutSec: 10 });
        if (
          r.status === "turn" &&
          r.text.includes("delta empty (no new output)")
        ) {
          t = r;
          break;
        }
      }
      expect(t?.status).toBe("turn");
      if (t?.status !== "turn") return;
      expect(t.text).toContain("delta empty (no new output)");
      expect(t.text).toMatch(/delta: kept 0\/\d+ chars/);

      await convClose({ convId: opened.convId, reason: "abort" });
    },
    40_000,
  );
});
