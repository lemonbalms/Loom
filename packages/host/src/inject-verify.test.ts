/**
 * PLAN 0.23.5 — inject verify loop 3-way branch (tests ①–⑭).
 * Fake herdr composer hooks + short real timers (no Bun fake-timer — R29 F-4).
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildDispatchBody,
  CARD_CONTRACT_VERSION,
  CARD_DISPATCH_LABEL,
  CARD_RESULT_LABEL,
  serializeCardAttachment,
  wrapDispatchedPrompt,
} from "@loom/protocol";
import { RelayServer } from "@loom/relay";
import type { BridgeConfig } from "./bridge-config";
import { type BridgeRuntime, startBridgeRuntime } from "./bridge-runtime";
import { convAwait, convClose, convOpen, convSendTurn } from "./conv-ops";
import { type FakeHerdr, startFakeHerdr } from "./fake-herdr";
import { HerdrClient } from "./herdr-client";
import { RelayClient } from "./relay-client";
import { type FableSession, resetStateHomeDirCache, setActiveProfile } from "./session-store";

type CardResult = {
  status?: string;
  reason?: string;
  summary?: string;
  cardId?: string;
};

/** Protocol-17 bounded Enter nudge (agent.send_keys keys includes "\r"). */
const CR_NUDGE = "\r";

function isCrSendKeys(c: { method: string; params: Record<string, unknown> }): boolean {
  return (
    c.method === "agent.send_keys" &&
    Array.isArray(c.params.keys) &&
    (c.params.keys as string[]).includes(CR_NUDGE)
  );
}

function crSends(fake: FakeHerdr) {
  return fake.calls.filter(isCrSendKeys);
}

function promptInjects(
  calls: { method: string; params: Record<string, unknown> }[],
  text?: string,
) {
  return calls.filter(
    (c) => c.method === "agent.prompt" && (text === undefined || c.params.text === text),
  );
}

function verifyPaneReads(fake: FakeHerdr) {
  return fake.calls.filter((c) => c.method === "pane.read" && c.params.lines === 60);
}

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

async function waitForAsync(
  pred: () => Promise<boolean>,
  opts?: { timeoutMs?: number; stepMs?: number },
): Promise<boolean> {
  const timeoutMs = opts?.timeoutMs ?? 8_000;
  const stepMs = opts?.stepMs ?? 50;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await pred()) return true;
    await Bun.sleep(stepMs);
  }
  return pred();
}

function countCardResults(
  towerInbox: Awaited<ReturnType<RelayClient["listInbox"]>>,
  cardId: string,
): CardResult[] {
  const matches: CardResult[] = [];
  for (const e of towerInbox) {
    for (const att of e.handoff.attachments ?? []) {
      if (att.label === CARD_RESULT_LABEL && att.content.includes(cardId)) {
        matches.push(JSON.parse(att.content) as CardResult);
      }
    }
  }
  return matches;
}

/**
 * Wait for first CARD_RESULT, settle ~280ms, re-read.
 * Exact-one claims require post-settle count (not first-match-only).
 */
async function awaitSettledCardResults(
  tower: RelayClient,
  cardId: string,
  timeoutMs = 12_000,
): Promise<CardResult[]> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const matches = countCardResults(await tower.listInbox(), cardId);
    if (matches.length >= 1) {
      await Bun.sleep(280);
      return countCardResults(await tower.listInbox(), cardId);
    }
    await Bun.sleep(100);
  }
  return [];
}

async function awaitCardResult(
  tower: RelayClient,
  cardId: string,
  timeoutMs = 12_000,
): Promise<CardResult | null> {
  const matches = await awaitSettledCardResults(tower, cardId, timeoutMs);
  return matches[0] ?? null;
}

describe("PLAN 0.23.5 inject verify 3-way branch", () => {
  const port = 23050 + Math.floor(Math.random() * 200);
  const dir = join(tmpdir(), `loom-inject-verify-${Date.now()}`);
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

  beforeAll(async () => {
    mkdirSync(dir, { recursive: true });
    process.env.LOOM_TEST_HOME = dir;
    process.env.LOOM_SESSION = sessionFile;
    process.env.LOOM_NO_AUTO_HOST = "1";
    resetStateHomeDirCache();
    setActiveProfile(null);
    relay.start();

    // autoStatus none: force verify path; tests push working when needed
    fake = await startFakeHerdr({
      socketPath: herdrSock,
      autoStatus: "none",
    });

    tower = new RelayClient({ url: `ws://127.0.0.1:${port}/ws` });
    const created = await tower.createRoom({
      roomName: "inject-verify",
      displayName: "tower",
      agentKind: "shell",
      peerId: "p_tower",
    });
    if (created.type !== "room.state") throw new Error("create failed");
    inviteCode = created.inviteCode ?? "";
    const towerSecret = created.peerSecret ?? tower.peerSecret;

    session = {
      roomId: created.roomId,
      roomName: "inject-verify",
      inviteCode,
      peerId: "p_node",
      displayName: "node/wsl-1",
      color: "#0f0",
      agentKind: "shell",
      relayUrl: `ws://127.0.0.1:${port}/ws`,
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(sessionFile, JSON.stringify(session), "utf8");

    towerSession = {
      roomId: created.roomId,
      roomName: "inject-verify",
      inviteCode,
      peerId: "p_tower",
      displayName: "tower",
      color: "#fff",
      agentKind: "shell",
      relayUrl: `ws://127.0.0.1:${port}/ws`,
      peerSecret: towerSecret ?? undefined,
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(towerSessionFile, JSON.stringify(towerSession), "utf8");

    bridge = await startBridgeRuntime({
      session,
      profile: "node-inject-verify",
      config: cfg,
      herdr: new HerdrClient({ socketPath: herdrSock }),
      // Short real timers — enough for tests to push working mid-wait, cheap for suite
      submitVerify: { waitMs: 250, retries: 2 },
    });
  });

  afterAll(async () => {
    if (bridge) await bridge.stop();
    tower?.close();
    await fake.close();
    relay.stop();
    delete process.env.LOOM_TEST_HOME;
    delete process.env.LOOM_SESSION;
    delete process.env.LOOM_NO_AUTO_HOST;
    resetStateHomeDirCache();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* */
    }
  });

  function useWorkerSession(): void {
    process.env.LOOM_SESSION = sessionFile;
    resetStateHomeDirCache();
  }

  function useTowerSession(): void {
    process.env.LOOM_SESSION = towerSessionFile;
    resetStateHomeDirCache();
    setActiveProfile(null);
  }

  async function dispatchCard(cardId: string, prompt: string): Promise<void> {
    await tower!.handoff({
      to: "@node/wsl-1",
      body: buildDispatchBody({ title: prompt.slice(0, 20), cardId, node: "node/wsl-1" }),
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

  async function bridgeStatus(): Promise<{
    inFlight: number;
    eventSubscriptions: number;
  }> {
    const stRes = await fetch(`http://127.0.0.1:${bridge!.meta.port}/rpc`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bridge!.meta.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ op: "status" }),
    });
    return (await stRes.json()) as {
      inFlight: number;
      eventSubscriptions: number;
    };
  }

  test("① empty composer (probe miss) → reinject (agent.prompt) then working = recovery", async () => {
    const cardId = "task_a111000000000001";
    const promptBody = "recover-after-paste-loss-unique-tail-xyz";
    const expectedPrompt = wrapDispatchedPrompt(promptBody);
    const callsBefore = fake.calls.length;

    // Force empty composer scrape regardless of accumulated prompt text
    fake.setPaneReadText("*", "");
    fake.setDiscardInjects(true);

    await dispatchCard(cardId, promptBody);

    // Wait for reinject: second agent.prompt with same cached string
    const reinjected = await waitFor(
      () => {
        return promptInjects(fake.calls.slice(callsBefore), expectedPrompt).length >= 2;
      },
      { timeoutMs: 10_000 },
    );
    expect(reinjected).toBe(true);

    // Protocol 17: reinject is atomic agent.prompt only (CR nudge is a later
    // verify attempt via send_keys if still unconfirmed — not dual-send).
    const slice = fake.calls.slice(callsBefore);
    const promptIdxs = slice
      .map((c, i) => (c.method === "agent.prompt" && c.params.text === expectedPrompt ? i : -1))
      .filter((i) => i >= 0);
    expect(promptIdxs.length).toBeGreaterThanOrEqual(2);

    // Live gate: initial + full reinject agent.prompt must target the unique
    // agent.start name (not pane_id). Pane IDs remain for pane.read/events/close.
    const startCall = slice.find(
      (c) =>
        c.method === "agent.start" && String(c.params.name ?? "").includes(cardId.slice(0, 20)),
    );
    expect(startCall).toBeTruthy();
    const startName = String(startCall!.params.name);
    expect(startName).toBe(`loom-${cardId}-1`);
    const promptSends = promptInjects(slice, expectedPrompt);
    expect(promptSends.length).toBeGreaterThanOrEqual(2);
    for (const p of promptSends) {
      expect(p.params.target).toBe(startName);
      expect(p.params.target).not.toBe(startCall!.params.pane_id);
    }

    // Recovery: push working → done
    const panes = fake.listPaneIds();
    expect(panes.length).toBeGreaterThan(0);
    const paneId = panes[panes.length - 1]!;
    fake.pushEvent("pane_agent_status_changed", {
      pane_id: paneId,
      agent_status: "working",
    });
    await Bun.sleep(30);
    fake.pushEvent("pane_agent_status_changed", {
      pane_id: paneId,
      agent_status: "done",
    });

    const result = await awaitCardResult(tower!, cardId);
    expect(result?.status).toBe("failed");
    expect(result?.reason).toBe("needs_verification");
    expect(result?.reason).not.toBe("inject_unconfirmed");

    fake.setPaneReadText("*", null);
    fake.setDiscardInjects(false);
  }, 20_000);

  test("② composer residual (probe hit) + idle → CR only (no reinject)", async () => {
    const cardId = "task_a222000000000002";
    const promptBody = "composer-residual-probe-hit-tail-abc";
    const expectedPrompt = wrapDispatchedPrompt(promptBody);
    const callsBefore = fake.calls.length;
    // F-7: crSends count and total calls are different units — baseline CR count
    const crBefore = crSends(fake).length;

    // Default accumulate keeps prompt in pane → probe hit
    fake.setDiscardInjects(false);
    fake.setPaneReadText("*", null);

    await dispatchCard(cardId, promptBody);

    // Wait until verify exhausts (fail-visible) or enough CR nudges.
    // Protocol 17: initial inject is agent.prompt (no separate CR); retries=2
    // → up to 2 verify send_keys CR nudges on probe hit.
    await waitFor(() => crSends(fake).length - crBefore >= 2, {
      timeoutMs: 10_000,
    });

    const slice = fake.calls.slice(callsBefore);
    const promptSends = promptInjects(slice, expectedPrompt);
    // Only the initial inject — no reinject of the full prompt
    expect(promptSends.length).toBe(1);

    // Live gate: prompt + CR nudge targets = unique agent.start name (not pane_id).
    const startCall = slice.find(
      (c) =>
        c.method === "agent.start" && String(c.params.name ?? "").includes(cardId.slice(0, 20)),
    );
    expect(startCall).toBeTruthy();
    const startName = String(startCall!.params.name);
    expect(startName).toBe(`loom-${cardId}-1`);
    expect(promptSends[0]!.params.target).toBe(startName);
    expect(promptSends[0]!.params.target).not.toBe(startCall!.params.pane_id);
    const crAfter = slice.filter(isCrSendKeys);
    expect(crAfter.length).toBeGreaterThanOrEqual(2);
    for (const cr of crAfter) {
      expect(cr.params.target).toBe(startName);
      expect(cr.params.target).not.toBe(startCall!.params.pane_id);
    }

    const result = await awaitCardResult(tower!, cardId);
    expect(result?.status).toBe("failed");
    expect(result?.reason ?? result?.summary ?? "").toMatch(/inject_unconfirmed/);
  }, 20_000);

  test("③ card exhaust → inject_unconfirmed + exact-one result + pane preserved", async () => {
    // v0.28.0 U3: card auto-close removed. Detection power:
    // settle re-read + exact-one result positive + pane preserved positive.
    // Recovery of orphan inject-failed panes is follow-up B / operator — not auto-close.
    const cardId = "task_a333000000000003";
    const panesBefore = new Set(fake.listPaneIds());
    const callsBefore = fake.calls.length;
    // F-5: eventsPrune restores per-pane sub count (client-side; observe via status)
    const subsBefore = (await bridgeStatus()).eventSubscriptions;
    fake.setDiscardInjects(false);
    fake.setPaneReadText("*", null);

    await dispatchCard(cardId, "exhaust-card-verify-path");

    // Settle before counting exact-one (not immediately after first result).
    const results = await awaitSettledCardResults(tower!, cardId);
    expect(results).toHaveLength(1);
    const result = results[0]!;
    expect(result.status).toBe("failed");
    expect(result.reason ?? result.summary ?? "").toMatch(/inject_unconfirmed/);

    // Pane preserved positive (not inverted to zero closes alone)
    const paneId = fake.listPaneIds().find((p) => !panesBefore.has(p)) ?? fake.listPaneIds().at(-1);
    expect(paneId).toBeTruthy();
    await Bun.sleep(200);
    expect(fake.listPaneIds()).toContain(paneId!);
    const closes = fake.calls.slice(callsBefore).filter((c) => c.method === "pane.close");
    expect(closes.length).toBe(0);

    // F-5: eventsPrune(paneId) ran — per-pane sub gone, count back to baseline
    // (prune + flight clear may race after card-result handoff — wait)
    await waitForAsync(async () => {
      const st = await bridgeStatus();
      return st.eventSubscriptions === subsBefore && st.inFlight === 0;
    });
    const st = await bridgeStatus();
    expect(st.eventSubscriptions).toBe(subsBefore);
    // flight gone
    expect(st.inFlight).toBe(0);
  }, 20_000);

  test("④ conv exhaust → blocked turn + convFlight kept", async () => {
    useTowerSession();
    fake.setDiscardInjects(true);
    fake.setPaneReadText("*", "");

    const opened = await convOpen({
      node: "node/wsl-1",
      goal: "conv-inject-exhaust-unique-goal-tail",
    });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;

    // Wait for blocked turn from inject_unconfirmed
    let blocked: Awaited<ReturnType<typeof convAwait>> | null = null;
    for (let i = 0; i < 20; i++) {
      const r = await convAwait({ convId: opened.convId, timeoutSec: 2 });
      if (r.status === "turn" && r.kind === "blocked") {
        blocked = r;
        break;
      }
    }
    expect(blocked?.status).toBe("turn");
    if (blocked?.status === "turn") {
      expect(blocked.kind).toBe("blocked");
      // sendWorkerTurnFromPane folds note into text as "(bridge note: …)"
      expect(blocked.text ?? "").toMatch(/inject_unconfirmed/);
    }

    // convFlight kept: second turn still injectable (pane alive)
    const paneId = fake.paneIdForConv(opened.convId);
    expect(paneId).toBeTruthy();
    expect(fake.listPaneIds()).toContain(paneId!);

    // F-6: convFlight map kept → subsequent turn injects on same pane (no re-spawn)
    fake.setDiscardInjects(false);
    fake.setPaneReadText("*", null);
    const turn2Text = "conv-inject-exhaust-turn2-followup-tail";
    const turn2Prompt = wrapDispatchedPrompt(turn2Text);
    const callsBeforeTurn2 = fake.calls.length;
    const sent = await convSendTurn({
      convId: opened.convId,
      text: turn2Text,
    });
    expect(sent.ok).toBe(true);

    const turn2Injected = await waitFor(
      () => promptInjects(fake.calls.slice(callsBeforeTurn2), turn2Prompt).length >= 1,
      { timeoutMs: 10_000 },
    );
    expect(turn2Injected).toBe(true);
    // Same convFlight pane — no new agent.start
    const newStarts = fake.calls.slice(callsBeforeTurn2).filter((c) => c.method === "agent.start");
    expect(newStarts.length).toBe(0);

    // Recover turn2 so close is clean
    fake.pushEvent("pane_agent_status_changed", {
      pane_id: paneId!,
      agent_status: "working",
    });
    await Bun.sleep(30);
    fake.pushEvent("pane_agent_status_changed", {
      pane_id: paneId!,
      agent_status: "done",
    });
    await convClose({ convId: opened.convId, reason: "abort" });
    useWorkerSession();
  }, 40_000);

  test("⑤ reinject 1× cap: second miss does not reinject again", async () => {
    const cardId = "task_a555000000000005";
    const promptBody = "reinject-once-cap-unique-tail-555";
    const expectedPrompt = wrapDispatchedPrompt(promptBody);
    const callsBefore = fake.calls.length;

    fake.setDiscardInjects(true);
    fake.setPaneReadText("*", "");

    await dispatchCard(cardId, promptBody);

    const result = await awaitCardResult(tower!, cardId);
    expect(result?.status).toBe("failed");
    expect(result?.reason ?? result?.summary ?? "").toMatch(/inject_unconfirmed/);

    const promptSends = promptInjects(fake.calls.slice(callsBefore), expectedPrompt);
    // initial inject + exactly one reinject
    expect(promptSends.length).toBe(2);

    fake.setDiscardInjects(false);
    fake.setPaneReadText("*", null);
  }, 20_000);

  test("⑥ working within first wait → no verify paneRead (fast-path)", async () => {
    // Restart-less: push working immediately after inject using a helper card
    // with autoStatus temporarily simulated via push right after first prompt.
    const cardId = "task_a666000000000006";
    const promptBody = "fast-path-working-no-probe-read";
    const callsBefore = fake.calls.length;
    const readsBefore = verifyPaneReads(fake).length;

    fake.setDiscardInjects(false);
    fake.setPaneReadText("*", null);

    await dispatchCard(cardId, promptBody);

    // As soon as first agent.prompt lands, push working+done before verify wait ends
    const injected = await waitFor(
      () =>
        fake.calls
          .slice(callsBefore)
          .some(
            (c) =>
              c.method === "agent.prompt" &&
              typeof c.params.text === "string" &&
              (c.params.text as string).includes(promptBody),
          ),
      { timeoutMs: 8_000 },
    );
    expect(injected).toBe(true);

    const paneId = fake.listPaneIds().at(-1);
    expect(paneId).toBeTruthy();
    fake.pushEvent("pane_agent_status_changed", {
      pane_id: paneId!,
      agent_status: "working",
    });
    await Bun.sleep(20);
    fake.pushEvent("pane_agent_status_changed", {
      pane_id: paneId!,
      agent_status: "done",
    });

    const result = await awaitCardResult(tower!, cardId);
    expect(result?.status).toBe("failed");
    expect(result?.reason).toBe("needs_verification");

    // Verify-loop paneRead uses lines:60; finishCard uses 200 — only check 60
    const verifyReads = verifyPaneReads(fake).length - readsBefore;
    expect(verifyReads).toBe(0);
  }, 20_000);

  test("⑦ paneRead failure → CR fallback (no reinject)", async () => {
    const cardId = "task_a777000000000007";
    const promptBody = "pane-read-fail-cr-fallback-tail";
    const expectedPrompt = wrapDispatchedPrompt(promptBody);
    const callsBefore = fake.calls.length;

    fake.setDiscardInjects(false);
    fake.failPaneReads(20); // all verify reads fail this card

    await dispatchCard(cardId, promptBody);

    const result = await awaitCardResult(tower!, cardId);
    expect(result?.status).toBe("failed");
    expect(result?.reason ?? result?.summary ?? "").toMatch(/inject_unconfirmed/);

    const promptSends = promptInjects(fake.calls.slice(callsBefore), expectedPrompt);
    expect(promptSends.length).toBe(1); // no reinject on read-fail

    const crs = fake.calls.slice(callsBefore).filter(isCrSendKeys);
    // Protocol 17: no initial CR; verify retries issue send_keys CR only
    expect(crs.length).toBeGreaterThanOrEqual(2);

    fake.failPaneReads(0);
  }, 20_000);

  test("⑧ flight gone during verify = success (no inject_unconfirmed)", async () => {
    const cardId = "task_a888000000000008";
    const promptBody = "gone-flight-success-path";
    const callsBefore = fake.calls.length;

    fake.setDiscardInjects(false);
    fake.setPaneReadText("*", null);

    await dispatchCard(cardId, promptBody);

    const injected = await waitFor(
      () => fake.calls.slice(callsBefore).some((c) => c.method === "agent.start"),
      { timeoutMs: 8_000 },
    );
    expect(injected).toBe(true);

    const paneId = fake.listPaneIds().at(-1);
    expect(paneId).toBeTruthy();
    // pane.closed removes flight → verify treats gone as success stop
    fake.pushEvent("pane.closed", { pane_id: paneId });
    // also mark closed in fake for consistency
    fake.markPaneClosed(paneId!);

    const result = await awaitCardResult(tower!, cardId);
    // pane_closed fail-visible from onCardHerdrEvent — not inject_unconfirmed
    expect(result?.status).toBe("failed");
    expect(result?.reason ?? result?.summary ?? "").toMatch(/pane_closed/);
    expect(result?.reason ?? result?.summary ?? "").not.toMatch(/inject_unconfirmed/);
  }, 20_000);

  test("⑨ probe whitespace normalize — TUI-wrapped prompt still hits", async () => {
    const cardId = "task_a999000000000009";
    // Long unique tail so last-48 of normalized form is distinctive
    const promptBody = "ws-normalize-probe-aaaaaaaaaaaaaaaaaaaaaaaa-TAILEND99";
    const expectedPrompt = wrapDispatchedPrompt(promptBody);
    const callsBefore = fake.calls.length;

    // Scrape shows prompt with extra newlines (TUI wrap) — normalized hit
    const wrapped = expectedPrompt.split("").join("\n");
    fake.setDiscardInjects(true); // don't accumulate raw; force override only
    fake.setPaneReadText("*", wrapped);

    await dispatchCard(cardId, promptBody);

    await waitFor(() => fake.calls.slice(callsBefore).filter(isCrSendKeys).length >= 2, {
      timeoutMs: 10_000,
    });

    const promptSends = promptInjects(fake.calls.slice(callsBefore), expectedPrompt);
    // hit → no reinject
    expect(promptSends.length).toBe(1);

    const result = await awaitCardResult(tower!, cardId);
    expect(result?.reason ?? result?.summary ?? "").toMatch(/inject_unconfirmed/);

    fake.setDiscardInjects(false);
    fake.setPaneReadText("*", null);
  }, 20_000);

  test("⑩ conv 2nd turn re-computes probe (turn-1 echo must not fake turn-2 hit)", async () => {
    useTowerSession();
    fake.setDiscardInjects(false);
    fake.setPaneReadText("*", null);

    const opened = await convOpen({
      node: "node/wsl-1",
      goal: "turn1-goal-for-probe-recalc-AAAA",
    });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;

    // accept is sent before agent.start completes — wait for pane mapping
    const paneReady = await waitFor(() => Boolean(fake.paneIdForConv(opened.convId)), {
      timeoutMs: 10_000,
    });
    expect(paneReady).toBe(true);
    const paneId = fake.paneIdForConv(opened.convId)!;

    // Complete initial inject ASAP so verify does not fail-visible
    fake.pushEvent("pane_agent_status_changed", {
      pane_id: paneId,
      agent_status: "working",
    });
    await Bun.sleep(30);
    fake.pushEvent("pane_agent_status_changed", {
      pane_id: paneId,
      agent_status: "done",
    });

    // Drain accept + first turn
    for (let i = 0; i < 6; i++) {
      const r = await convAwait({ convId: opened.convId, timeoutSec: 2 });
      if (r.status === "timeout") break;
    }

    const turn2Text = "turn2-unique-probe-BBBB-only-this-should-match";
    const turn2Prompt = wrapDispatchedPrompt(turn2Text);
    // Composer still shows only turn-1 echo (not turn-2) → miss → reinject
    fake.setPaneReadText(paneId, "turn1-goal-for-probe-recalc-AAAA only old echo");

    const callsBefore = fake.calls.length;
    const sent = await convSendTurn({
      convId: opened.convId,
      text: turn2Text,
    });
    expect(sent.ok).toBe(true);

    const reinjected = await waitFor(
      () => {
        return promptInjects(fake.calls.slice(callsBefore), turn2Prompt).length >= 2;
      },
      { timeoutMs: 12_000 },
    );
    expect(reinjected).toBe(true);

    // Finish turn 2 cleanly
    fake.setPaneReadText(paneId, null);
    fake.pushEvent("pane_agent_status_changed", {
      pane_id: paneId,
      agent_status: "working",
    });
    await Bun.sleep(20);
    fake.pushEvent("pane_agent_status_changed", {
      pane_id: paneId,
      agent_status: "done",
    });

    await convClose({ convId: opened.convId, reason: "abort" });
    useWorkerSession();
  }, 40_000);

  test("⑪ normal submit path regression (inject → working immediately)", async () => {
    const cardId = "task_ab11000000000011";
    const promptBody = "normal-path-immediate-working";
    const callsBefore = fake.calls.length;

    fake.setDiscardInjects(false);
    fake.setPaneReadText("*", null);

    await dispatchCard(cardId, promptBody);

    // Push working as soon as inject lands (before short verify wait exhausts)
    const injected = await waitFor(
      () =>
        fake.calls
          .slice(callsBefore)
          .some(
            (c) =>
              c.method === "agent.prompt" &&
              typeof c.params.text === "string" &&
              (c.params.text as string).includes(promptBody),
          ),
      { timeoutMs: 8_000, stepMs: 20 },
    );
    expect(injected).toBe(true);
    const paneId = fake.listPaneIds().at(-1)!;
    fake.pushEvent("pane_agent_status_changed", {
      pane_id: paneId,
      agent_status: "working",
    });
    await Bun.sleep(20);
    fake.pushEvent("pane_agent_status_changed", {
      pane_id: paneId,
      agent_status: "done",
    });

    const result = await awaitCardResult(tower!, cardId);
    expect(result?.status).toBe("failed");
    expect(result?.reason).toBe("needs_verification");
  }, 20_000);

  test("⑫ placeholder-only composer → CR branch, no reinject (R30 M-1)", async () => {
    // Case A: intact placeholder string
    {
      const cardId = "task_ac12000000000012";
      const promptBody = "placeholder-probe-hit-no-reinject-tail";
      const expectedPrompt = wrapDispatchedPrompt(promptBody);
      const callsBefore = fake.calls.length;

      fake.setDiscardInjects(true);
      fake.setPaneReadText("*", "[Pasted text #1 +42 lines]");

      await dispatchCard(cardId, promptBody);

      await waitFor(() => fake.calls.slice(callsBefore).filter(isCrSendKeys).length >= 2, {
        timeoutMs: 10_000,
      });

      const promptSends = promptInjects(fake.calls.slice(callsBefore), expectedPrompt);
      expect(promptSends.length).toBe(1);

      const result = await awaitCardResult(tower!, cardId);
      expect(result?.reason ?? result?.summary ?? "").toMatch(/inject_unconfirmed/);
    }

    // Case B (F-1): wrap-split placeholder — Claude Ink may break the marker
    // across lines ("[Pasted" + newline + "text …"); ws-normalized still hits → CR only
    {
      const cardId = "task_ac12000000000012b";
      const promptBody = "placeholder-wrap-split-no-reinject-tail";
      const expectedPrompt = wrapDispatchedPrompt(promptBody);
      const callsBefore = fake.calls.length;

      fake.setDiscardInjects(true);
      fake.setPaneReadText("*", "[Pasted\ntext #1 +25 lines]");

      await dispatchCard(cardId, promptBody);

      await waitFor(() => fake.calls.slice(callsBefore).filter(isCrSendKeys).length >= 2, {
        timeoutMs: 10_000,
      });

      const promptSends = promptInjects(fake.calls.slice(callsBefore), expectedPrompt);
      // wrap-tolerant placeholder hit → CR branch, no reinject
      expect(promptSends.length).toBe(1);

      const result = await awaitCardResult(tower!, cardId);
      expect(result?.reason ?? result?.summary ?? "").toMatch(/inject_unconfirmed/);
    }

    fake.setDiscardInjects(false);
    fake.setPaneReadText("*", null);
  }, 40_000);

  test("⑬ conv turn1 reinject then turn2 paste-loss → turn2 reinject allowed (M-2 reset)", async () => {
    useTowerSession();
    fake.setDiscardInjects(true);
    fake.setPaneReadText("*", "");

    const opened = await convOpen({
      node: "node/wsl-1",
      goal: "m2-reset-turn1-goal-CCCC",
    });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;

    const paneReady = await waitFor(() => Boolean(fake.paneIdForConv(opened.convId)), {
      timeoutMs: 10_000,
    });
    expect(paneReady).toBe(true);
    const paneId = fake.paneIdForConv(opened.convId)!;

    // Wait for turn1 reinject (goal wrap + optional convention suffix)
    const turn1Reinject = await waitFor(
      () => {
        const prompts = fake.calls.filter(
          (c) =>
            c.method === "agent.prompt" &&
            typeof c.params.text === "string" &&
            (c.params.text as string).includes("m2-reset-turn1-goal-CCCC"),
        );
        return prompts.length >= 2;
      },
      { timeoutMs: 12_000 },
    );
    expect(turn1Reinject).toBe(true);

    // Recover turn1
    fake.pushEvent("pane_agent_status_changed", {
      pane_id: paneId,
      agent_status: "working",
    });
    await Bun.sleep(30);
    fake.pushEvent("pane_agent_status_changed", {
      pane_id: paneId,
      agent_status: "done",
    });

    for (let i = 0; i < 6; i++) {
      const r = await convAwait({ convId: opened.convId, timeoutSec: 2 });
      if (r.status === "timeout") break;
    }

    // Turn 2 paste loss again — budget must reset
    const turn2Text = "m2-reset-turn2-DDDD-unique";
    const turn2Prompt = wrapDispatchedPrompt(turn2Text);
    const callsBefore = fake.calls.length;
    // still discard + empty scrape
    const sent = await convSendTurn({
      convId: opened.convId,
      text: turn2Text,
    });
    expect(sent.ok).toBe(true);

    const turn2Reinject = await waitFor(
      () => {
        return promptInjects(fake.calls.slice(callsBefore), turn2Prompt).length >= 2;
      },
      { timeoutMs: 12_000 },
    );
    expect(turn2Reinject).toBe(true);

    fake.setDiscardInjects(false);
    fake.setPaneReadText("*", null);
    fake.pushEvent("pane_agent_status_changed", {
      pane_id: paneId,
      agent_status: "working",
    });
    await Bun.sleep(20);
    fake.pushEvent("pane_agent_status_changed", {
      pane_id: paneId,
      agent_status: "done",
    });
    await convClose({ convId: opened.convId, reason: "abort" });
    useWorkerSession();
  }, 45_000);

  test("⑭ conv fast working→done stays submit-confirmed (no CR/fail-visible)", async () => {
    useTowerSession();
    fake.setDiscardInjects(false);
    fake.setPaneReadText("*", null);

    const callsBefore = fake.calls.length;
    const crBefore = crSends(fake).length;
    const readsBefore = verifyPaneReads(fake).length;
    const goal = "conv-fast-working-done-submit-confirmed";
    const opened = await convOpen({
      node: "node/wsl-1",
      goal,
    });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;

    const injected = await waitFor(
      () =>
        fake.calls.slice(callsBefore).some(
          (c) =>
            c.method === "agent.prompt" &&
            typeof c.params.text === "string" &&
            (c.params.text as string).includes(goal),
        ),
      { timeoutMs: 8_000, stepMs: 10 },
    );
    expect(injected).toBe(true);
    const paneId = fake.paneIdForConv(opened.convId);
    expect(paneId).toBeTruthy();

    // Both events may be consumed in one socket-data turn before the verifier
    // timer polls. Completion may clear sawWorking, but must not erase proof
    // that this inject reached working.
    fake.pushEvent("pane_agent_status_changed", {
      pane_id: paneId!,
      agent_status: "working",
    });
    fake.pushEvent("pane_agent_status_changed", {
      pane_id: paneId!,
      agent_status: "done",
    });

    const accept = await convAwait({ convId: opened.convId, timeoutSec: 5 });
    expect(accept.status).toBe("accept");
    const turn = await convAwait({ convId: opened.convId, timeoutSec: 5 });
    expect(turn.status).toBe("turn");
    await Bun.sleep(350);

    expect(crSends(fake).length - crBefore).toBe(0);
    expect(verifyPaneReads(fake).length - readsBefore).toBe(0);

    await convClose({ convId: opened.convId, reason: "abort" });
    useWorkerSession();
  }, 20_000);
});
