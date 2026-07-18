/**
 * Bridge runtime: herdr ping → room join → dispatch claim → agent → [DONE].
 * Binding M-1 (dispatcher allowlist) · M-2 (submit separation).
 */
import type { Envelope, HandoffPayload, InboxEntry } from "@loom/protocol";
import {
  CARD_DISPATCH_LABEL,
  CARD_RESULT_LABEL,
  CARD_CONTRACT_VERSION,
  CardDispatchPayloadSchema,
  buildResultBody,
  serializeCardAttachment,
  wrapUntrustedPrompt,
  truncateTail,
  type CardDispatchPayload,
  type CardResultPayload,
} from "@loom/protocol";
import {
  CONV_CONTRACT_VERSION,
  CONV_OPEN_LABEL,
  CONV_ACCEPT_LABEL,
  CONV_REJECT_LABEL,
  CONV_TURN_LABEL,
  CONV_CLOSE_LABEL,
  CONV_OPEN_SEQ,
  CONV_ACCEPT_SEQ,
  MAX_CONV_TURN_INLINE_CHARS,
  nextOwnSeq,
  ConvOpenPayloadSchema,
  ConvAcceptPayloadSchema,
  ConvRejectPayloadSchema,
  ConvTurnPayloadSchema,
  ConvClosePayloadSchema,
  buildConvAcceptBody,
  buildConvRejectBody,
  buildConvTurnBody,
  serializeConvAttachment,
  convLabelOf,
  type ConvOpenPayload,
  type ConvTurnPayload,
  type ConvClosePayload,
  type ConvKind,
  type ArtifactRefEntry,
} from "@loom/protocol";
import {
  loadConvState,
  saveConvState,
  mutateConvState,
  pinMatches,
  isFreshPeerSeq,
  logUnknownConv,
  logPinMismatch,
  type ConvState,
} from "./conv-state";
import { packageConvTurnArtifact } from "./conv-artifact-pack";
import {
  loadSession,
  saveSession,
  relayClientOptsFromSession,
  sessionPath,
  type FableSession,
} from "./session-store";
import { RelayClient } from "./relay-client";
import {
  HerdrClient,
  stripAnsi,
  HERDR_PROTOCOL_EXPECTED,
  BARE_ENTER,
  type HerdrAgentStarted,
} from "./herdr-client";
import {
  loadBridgeConfig,
  isAuthorizedDispatcher,
  resolveAgentArgv,
  type BridgeConfig,
} from "./bridge-config";
import {
  writeBridgeMeta,
  clearBridgeMeta,
  generateBridgeToken,
  type BridgeMeta,
} from "./bridge-meta";
import { timingSafeTokenEqual } from "@loom/protocol";
import { getActiveProfile } from "./session-store";

export type BridgeRuntime = {
  meta: BridgeMeta;
  stop: () => Promise<void>;
};

/**
 * M-2 submit verify + retry (live-measured): Claude Code's paste-grouping
 * window can absorb a bare-Enter CR arriving too soon after a multi-line
 * paste, and the window varies with spawn-time load — a single fixed delay
 * (herdr-client's submitDelayMs) is not reliably enough. After the initial
 * inject+submit, verify via the already-subscribed status stream and resend
 * BARE_ENTER (constant only — still M-2 compliant) if the pane never reaches
 * "working".
 */
const SUBMIT_VERIFY_MS = 4_000;
const SUBMIT_RETRIES = 3;

type Flight = {
  cardId: string;
  fromPeerId: string;
  dispatchHandoffId: string;
  paneId: string;
  terminalId: string;
  seq: number;
  startedAt: string;
  sawWorking: boolean;
};

/** Conv (multiturn) worker-side pane flight — lives across many turns, unlike card Flight. */
type ConvFlight = {
  convId: string;
  pinnedPeerId: string;
  paneId: string;
  terminalId: string;
  sawWorking: boolean;
};

function log(...args: unknown[]): void {
  console.error("[loom-bridge]", ...args);
}

function hasDispatchLabel(h: HandoffPayload): boolean {
  return Boolean(
    h.attachments?.some(
      (a) => a.kind === "text" && a.label === CARD_DISPATCH_LABEL,
    ),
  );
}

export async function startBridgeRuntime(opts?: {
  session?: FableSession;
  profile?: string;
  port?: number;
  /** Test injection */
  herdr?: HerdrClient;
  config?: BridgeConfig;
  /** M-2 submit verify tuning (test injection); defaults to production values. */
  submitVerify?: { waitMs: number; retries: number };
}): Promise<BridgeRuntime> {
  let session = opts?.session ?? loadSession();
  if (!session) {
    throw new Error(
      "No session. Join a room first, then: loom bridge start",
    );
  }
  const profile =
    opts?.profile ?? getActiveProfile() ?? session.displayName ?? "default";
  const cfg = opts?.config ?? loadBridgeConfig(profile);
  const submitVerify = opts?.submitVerify ?? {
    waitMs: SUBMIT_VERIFY_MS,
    retries: SUBMIT_RETRIES,
  };

  const flights = new Map<string, Flight>(); // paneId → flight
  const cardSeq = new Map<string, number>();
  const processedHandoffs = new Set<string>();
  const convFlights = new Map<string, ConvFlight>(); // paneId → conv flight
  const convPaneByConvId = new Map<string, string>(); // convId → paneId

  // Fail-fast: herdr ping before room join (§2.2)
  const herdr =
    opts?.herdr ??
    new HerdrClient({
      socketPath: cfg.herdrSocketPath,
    });
  herdr.setOnEvent((event, data) => onHerdrEvent(event, data));

  let herdrOk = false;
  try {
    await herdr.connect();
    const pong = await herdr.ping();
    const expected = cfg.herdrProtocol ?? HERDR_PROTOCOL_EXPECTED;
    if (pong.protocol !== expected) {
      throw new Error(
        `herdr protocol ${pong.protocol} != expected ${expected}`,
      );
    }
    herdrOk = true;
    log(`herdr ok v${pong.version} protocol ${pong.protocol}`);
  } catch (e) {
    herdr.close();
    throw new Error(
      `herdr unreachable (${cfg.herdrSocketPath}): ${
        e instanceof Error ? e.message : e
      }`,
    );
  }

  const client = new RelayClient({
    ...relayClientOptsFromSession(session),
    autoReconnect: true,
    reconnectJoin: {
      inviteCode: session.inviteCode,
      displayName: session.displayName,
      agentKind: session.agentKind ?? "shell",
      peerId: session.peerId,
      color: session.color,
      peerSecret: session.peerSecret,
    },
    onEnvelope: (env) => {
      void handleEnvelope(env);
    },
    onError(err) {
      log(`relay: ${err.message}`);
    },
  });

  const joinEnv = await client.joinRoom({
    inviteCode: session.inviteCode,
    displayName: session.displayName,
    agentKind: session.agentKind ?? "shell",
    peerId: session.peerId,
    color: session.color,
    peerSecret: session.peerSecret,
  });
  if (joinEnv.type === "error") {
    herdr.close();
    client.close();
    throw new Error(joinEnv.message);
  }
  if (joinEnv.type === "room.state" && joinEnv.peerSecret) {
    session = {
      ...session,
      peerSecret: joinEnv.peerSecret,
      updatedAt: new Date().toISOString(),
    };
    saveSession(session);
    client.setReconnectPeerSecret(joinEnv.peerSecret);
  }

  // Health / control HTTP (sticky-host pattern)
  const token = generateBridgeToken();
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: opts?.port ?? 0,
    async fetch(req) {
      const auth = req.headers.get("authorization") ?? "";
      const got = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      if (!timingSafeTokenEqual(got, token)) {
        return new Response("unauthorized", { status: 401 });
      }
      const url = new URL(req.url);
      if (url.pathname === "/health" || url.pathname === "/ping") {
        return Response.json({
          ok: true,
          herdr: herdrOk,
          peerId: session!.peerId,
          roomId: session!.roomId,
        });
      }
      if (url.pathname === "/rpc" && req.method === "POST") {
        const body = (await req.json()) as { op?: string };
        if (body.op === "ping") {
          return Response.json({ ok: true, op: "ping" });
        }
        if (body.op === "status") {
          return Response.json({
            ok: true,
            op: "status",
            peerId: session!.peerId,
            roomId: session!.roomId,
            displayName: session!.displayName,
            herdrSocketPath: cfg.herdrSocketPath,
            herdrOk,
            inFlight: flights.size,
          });
        }
        if (body.op === "stop") {
          queueMicrotask(() => {
            void stop();
          });
          return Response.json({ ok: true, op: "stop" });
        }
        return Response.json({ ok: false, error: "unknown op" }, { status: 400 });
      }
      return new Response("not found", { status: 404 });
    },
  });

  const listenPort = server.port;
  if (listenPort == null) {
    herdr.close();
    client.close();
    server.stop(true);
    throw new Error("bridge health server failed to bind a port");
  }

  const meta: BridgeMeta = {
    pid: process.pid,
    port: listenPort,
    token,
    sessionPath: sessionPath(),
    peerId: session.peerId,
    roomId: session.roomId,
    roomName: session.roomName,
    displayName: session.displayName,
    herdrSocketPath: cfg.herdrSocketPath,
    startedAt: new Date().toISOString(),
  };
  writeBridgeMeta(meta);

  // Drain existing inbox
  try {
    const entries = await client.listInbox();
    for (const e of entries) {
      await processInboxEntry(e);
    }
  } catch (e) {
    log("initial inbox drain failed:", e);
  }

  async function handleEnvelope(env: Envelope): Promise<void> {
    if (env.type === "handoff") {
      // Online push — not in our inbox yet; only process if addressed to us via inbox path.
      // Durable path is inbox; unsolicited handoff envelopes may still arrive for online peers.
      // Prefer claim path: list after notify.
      return;
    }
    if (env.type === "inbox.state") {
      for (const e of env.entries) {
        await processInboxEntry(e);
      }
      return;
    }
    if (env.type === "room.state" && env.peerSecret) {
      session = {
        ...session!,
        peerSecret: env.peerSecret,
        updatedAt: new Date().toISOString(),
      };
      saveSession(session);
      client.setReconnectPeerSecret(env.peerSecret);
    }
  }

  // Poll inbox periodically (covers online notify without durable push of full body)
  const pollTimer = setInterval(() => {
    void (async () => {
      try {
        const entries = await client.listInbox();
        for (const e of entries) {
          await processInboxEntry(e);
        }
      } catch {
        /* reconnect will handle */
      }
    })();
  }, 1500);

  async function processInboxEntry(entry: InboxEntry): Promise<void> {
    const h = entry.handoff;
    if (h?.mode !== "task") return;

    // conv (multiturn) path — routed before card dispatch (disjoint label sets).
    const convLbl = convLabelOf(h.attachments);
    if (convLbl) {
      if (processedHandoffs.has(h.id)) return;
      processedHandoffs.add(h.id);
      const claim = await client.claimHandoff(h.id, "claim");
      if (!claim.ok) return;
      await processConvIntent(h, convLbl);
      return;
    }

    if (!hasDispatchLabel(h)) return;
    if (processedHandoffs.has(h.id)) return;

    const fromPeerId = h.fromPeerId;

    // M-1: dispatcher authorization
    if (!isAuthorizedDispatcher(cfg, fromPeerId)) {
      log(`M-1 deny dispatch from ${fromPeerId} handoff ${h.id}`);
      processedHandoffs.add(h.id);
      // Spec: ignore + log without claim (at-most-once processing marker only).
      return;
    }

    const att = h.attachments?.find(
      (a) => a.kind === "text" && a.label === CARD_DISPATCH_LABEL,
    );
    if (!att) return;

    let payload: CardDispatchPayload;
    try {
      payload = CardDispatchPayloadSchema.parse(JSON.parse(att.content));
    } catch {
      // L-1: reply failed payload_invalid
      processedHandoffs.add(h.id);
      const claim = await client.claimHandoff(h.id, "claim");
      if (!claim.ok) return;
      await sendFailedResult({
        cardId: extractCardIdLoose(att.content) ?? "task_0",
        fromPeerId,
        dispatchHandoffId: h.id,
        reason: "payload_invalid",
      });
      return;
    }

    processedHandoffs.add(h.id);
    const claim = await client.claimHandoff(h.id, "claim");
    if (!claim.ok) {
      log(`claim failed for ${h.id}:`, claim.error);
      return;
    }

    await runCard({
      payload,
      fromPeerId,
      dispatchHandoffId: h.id,
    });
  }

  function extractCardIdLoose(content: string): string | null {
    try {
      const j = JSON.parse(content) as { cardId?: string };
      return typeof j.cardId === "string" ? j.cardId : null;
    } catch {
      return null;
    }
  }

  async function runCard(args: {
    payload: CardDispatchPayload;
    fromPeerId: string;
    dispatchHandoffId: string;
  }): Promise<void> {
    const { payload, fromPeerId, dispatchHandoffId } = args;
    const argv = resolveAgentArgv(cfg, payload.agentKind);
    if (!argv) {
      await sendFailedResult({
        cardId: payload.cardId,
        fromPeerId,
        dispatchHandoffId,
        reason: "agent_kind_not_allowed",
      });
      return;
    }

    const startedAt = new Date().toISOString();
    // Fix 2 (live-measured): compute seq before spawn and fold it into the
    // agent name so each dispatch ATTEMPT gets a unique herdr agent name —
    // re-dispatching the same card while a prior pane is still alive
    // otherwise collides on "agent name loom-task_... is already used".
    const seq = (cardSeq.get(payload.cardId) ?? 0) + 1;
    cardSeq.set(payload.cardId, seq);

    let agent: HerdrAgentStarted;
    try {
      agent = await herdr.agentStart({
        name: `loom-${payload.cardId.slice(0, 20)}-${seq}`,
        argv,
        env: { LOOM_CARD: payload.cardId },
        cwd: payload.cwd,
        focus: false,
      });
    } catch (e) {
      await sendFailedResult({
        cardId: payload.cardId,
        fromPeerId,
        dispatchHandoffId,
        reason: "herdr_spawn_failed",
        detail: e instanceof Error ? e.message : String(e),
      });
      return;
    }

    const flight: Flight = {
      cardId: payload.cardId,
      fromPeerId,
      dispatchHandoffId,
      paneId: agent.pane_id,
      terminalId: agent.terminal_id,
      seq,
      startedAt,
      sawWorking: false,
    };
    flights.set(agent.pane_id, flight);

    try {
      await herdr.eventsSubscribe([
        { type: "pane.agent_status_changed", pane_id: agent.pane_id },
        { type: "pane.closed", pane_id: agent.pane_id },
      ]);
    } catch (e) {
      log("events.subscribe failed:", e);
    }

    try {
      // M-2: untrusted prompt via agent.send only; bare Enter separate constant
      const prompt = wrapUntrustedPrompt(payload.prompt);
      await herdr.injectPromptAndSubmit(agent.terminal_id, prompt);
    } catch (e) {
      flights.delete(agent.pane_id);
      await sendFailedResult({
        cardId: payload.cardId,
        fromPeerId,
        dispatchHandoffId,
        reason: "prompt_inject_failed",
        detail: e instanceof Error ? e.message : String(e),
        paneId: agent.pane_id,
      });
      return;
    }

    await verifySubmitOrRetry(agent.pane_id, agent.terminal_id);
  }

  // --- conv (multiturn) worker-side path — PLAN 0.23.0 / CONV_SPEC ---------

  async function sendConvAccept(convId: string, toPeerId: string): Promise<void> {
    try {
      const payload = ConvAcceptPayloadSchema.parse({
        v: CONV_CONTRACT_VERSION,
        convId,
      });
      const attachment = serializeConvAttachment(CONV_ACCEPT_LABEL, payload);
      const body = buildConvAcceptBody({ convId });
      await client.handoff({ to: toPeerId, body, mode: "task", attachments: [attachment] });
    } catch (e) {
      log("sendConvAccept failed:", e);
    }
  }

  async function sendConvReject(
    convId: string,
    toPeerId: string,
    reason: string,
  ): Promise<void> {
    try {
      const payload = ConvRejectPayloadSchema.parse({
        v: CONV_CONTRACT_VERSION,
        convId,
        reason,
      });
      const attachment = serializeConvAttachment(CONV_REJECT_LABEL, payload);
      const body = buildConvRejectBody({ convId, reason });
      await client.handoff({ to: toPeerId, body, mode: "task", attachments: [attachment] });
    } catch (e) {
      log("sendConvReject failed:", e);
    }
  }

  /**
   * conv.open handler. M-1 (dispatcher allowlist — same trust boundary as
   * card dispatch) gates who may open a conv at all; R25 M-1 pin then locks
   * THIS specific conv to the opening sender for its whole lifetime.
   * L-5: redelivered open for an already-known convId resends accept
   * (or rejects if closed) instead of re-processing.
   */
  async function processConvIntent(h: HandoffPayload, label: string): Promise<void> {
    const fromPeerId = h.fromPeerId;

    if (label === CONV_OPEN_LABEL) {
      if (!isAuthorizedDispatcher(cfg, fromPeerId)) {
        log(`M-1 deny conv.open from ${fromPeerId}`);
        return;
      }
      const att = h.attachments?.find(
        (a) => a.kind === "text" && a.label === CONV_OPEN_LABEL,
      );
      if (!att) return;
      let payload: ConvOpenPayload;
      try {
        payload = ConvOpenPayloadSchema.parse(JSON.parse(att.content));
      } catch {
        log(`conv.open payload_invalid from ${fromPeerId}`);
        return;
      }

      const existing = loadConvState(payload.convId, "worker");
      if (existing) {
        // L-5: duplicate/redelivered conv.open — §4.1.3 idempotent-open extension.
        if (existing.status === "closed") {
          await sendConvReject(payload.convId, fromPeerId, "conv already closed");
        } else if (pinMatches(existing, fromPeerId)) {
          await sendConvAccept(payload.convId, fromPeerId);
        } else {
          logPinMismatch(payload.convId, "open(dup)", fromPeerId);
        }
        return;
      }

      const argv = resolveAgentArgv(cfg, payload.scope.agentKind);
      if (!argv) {
        await sendConvReject(payload.convId, fromPeerId, "agent_kind_not_allowed");
        return;
      }

      // R25 M-1: bridge-side pin — fixed now, for the conv's whole lifetime.
      const state: ConvState = {
        convId: payload.convId,
        role: "worker",
        roomId: session!.roomId,
        pinnedPeerId: fromPeerId,
        status: "active",
        goal: payload.goal,
        limits: payload.limits,
        lastOwnSeq: CONV_ACCEPT_SEQ,
        lastPeerSeq: CONV_OPEN_SEQ,
        turnCount: 0,
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      saveConvState(state);
      await sendConvAccept(payload.convId, fromPeerId);
      await startConvPane(payload, fromPeerId, argv);
      return;
    }

    if (label === CONV_TURN_LABEL) {
      const att = h.attachments?.find(
        (a) => a.kind === "text" && a.label === CONV_TURN_LABEL,
      );
      if (!att) return;
      let payload: ConvTurnPayload;
      try {
        payload = ConvTurnPayloadSchema.parse(JSON.parse(att.content));
      } catch {
        return;
      }
      const state = loadConvState(payload.convId, "worker");
      if (!state) {
        logUnknownConv(payload.convId, "turn");
        return;
      }
      if (!pinMatches(state, fromPeerId)) {
        logPinMismatch(payload.convId, "turn", fromPeerId);
        return;
      }
      if (!isFreshPeerSeq(state, payload.seq)) return;

      mutateConvState(payload.convId, "worker", (s) => {
        s.lastPeerSeq = payload.seq;
        s.turnCount += 1;
      });

      const paneId = convPaneByConvId.get(payload.convId);
      const flight = paneId ? convFlights.get(paneId) : undefined;
      if (!flight) {
        log(
          `conv turn for ${payload.convId} but no live pane — dropped (pane/conv lifetime mismatch, see UNKNOWNS §0.23.0)`,
        );
        return;
      }
      try {
        // R23 M-2 applies every turn (R24/R25 L-4), not just the first prompt.
        const prompt = wrapUntrustedPrompt(payload.text);
        flight.sawWorking = false;
        await herdr.injectPromptAndSubmit(flight.terminalId, prompt);
      } catch (e) {
        log("conv turn inject failed:", e);
        return;
      }
      await verifyConvSubmitOrRetry(flight);
      return;
    }

    if (label === CONV_CLOSE_LABEL) {
      const att = h.attachments?.find(
        (a) => a.kind === "text" && a.label === CONV_CLOSE_LABEL,
      );
      if (!att) return;
      let payload: ConvClosePayload;
      try {
        payload = ConvClosePayloadSchema.parse(JSON.parse(att.content));
      } catch {
        return;
      }
      const state = loadConvState(payload.convId, "worker");
      if (!state) {
        logUnknownConv(payload.convId, "close");
        return;
      }
      if (!pinMatches(state, fromPeerId)) {
        logPinMismatch(payload.convId, "close", fromPeerId);
        return;
      }
      mutateConvState(payload.convId, "worker", (s) => {
        s.status = "closed";
      });
      const paneId = convPaneByConvId.get(payload.convId);
      if (paneId) {
        convFlights.delete(paneId);
        convPaneByConvId.delete(payload.convId);
      }
      return;
    }
  }

  async function startConvPane(
    payload: ConvOpenPayload,
    fromPeerId: string,
    argv: string[],
  ): Promise<void> {
    let agent: HerdrAgentStarted;
    try {
      agent = await herdr.agentStart({
        name: `loom-conv-${payload.convId.slice(5, 21)}`,
        argv,
        env: { LOOM_CONV: payload.convId },
        cwd: payload.scope.cwd,
        focus: false,
      });
    } catch (e) {
      log("conv agentStart failed:", e);
      return;
    }

    const flight: ConvFlight = {
      convId: payload.convId,
      pinnedPeerId: fromPeerId,
      paneId: agent.pane_id,
      terminalId: agent.terminal_id,
      sawWorking: false,
    };
    convFlights.set(agent.pane_id, flight);
    convPaneByConvId.set(payload.convId, agent.pane_id);

    try {
      await herdr.eventsSubscribe([
        { type: "pane.agent_status_changed", pane_id: agent.pane_id },
        { type: "pane.closed", pane_id: agent.pane_id },
      ]);
    } catch (e) {
      log("conv events.subscribe failed:", e);
    }

    try {
      // Goal doubles as the first turn's prompt — the worker starts on
      // accept, mirroring card dispatch's prompt-on-start.
      const prompt = wrapUntrustedPrompt(payload.goal);
      await herdr.injectPromptAndSubmit(agent.terminal_id, prompt);
    } catch (e) {
      log("conv initial inject failed:", e);
      convFlights.delete(agent.pane_id);
      convPaneByConvId.delete(payload.convId);
      return;
    }
    await verifyConvSubmitOrRetry(flight);
  }

  /** Conv analogue of verifySubmitOrRetry (R23 M-2), keyed on convFlights. */
  async function verifyConvSubmitOrRetry(flight: ConvFlight): Promise<void> {
    const pollMs = Math.max(10, Math.min(250, Math.floor(submitVerify.waitMs / 8) || 10));
    async function waitForWorkingOrGone(): Promise<"working" | "gone" | "timeout"> {
      const deadline = Date.now() + submitVerify.waitMs;
      while (Date.now() < deadline) {
        const f = convFlights.get(flight.paneId);
        if (!f) return "gone";
        if (f.sawWorking) return "working";
        await new Promise((r) => setTimeout(r, pollMs));
      }
      const f = convFlights.get(flight.paneId);
      if (!f) return "gone";
      return f.sawWorking ? "working" : "timeout";
    }
    let outcome = await waitForWorkingOrGone();
    let attempt = 0;
    while (outcome === "timeout" && attempt < submitVerify.retries) {
      attempt++;
      try {
        await herdr.agentSend(flight.terminalId, BARE_ENTER);
      } catch (e) {
        log(`conv M-2 resend attempt ${attempt} failed:`, e);
      }
      outcome = await waitForWorkingOrGone();
    }
    if (outcome === "timeout") {
      log(
        `conv submit unconfirmed after ${submitVerify.retries} retries — pane may need manual Enter`,
        flight.paneId,
      );
    }
  }

  /**
   * Builds+sends a worker turn from the current pane content. kindHint
   * "blocked" forces kind=blocked (pane reported blocked or closed);
   * otherwise a "[DONE_PROPOSAL]" prefix in the pane output maps to
   * kind=done_proposal (bridge-local convention layered on the prompt, not
   * a wire change), else kind=normal. Pane stays alive — only conv.close
   * (tower-only, §1.4/§3.2) ends the conv.
   */
  async function sendWorkerTurnFromPane(
    flight: ConvFlight,
    kindHint: "blocked" | "auto",
    note?: string,
  ): Promise<void> {
    const state = loadConvState(flight.convId, "worker");
    if (!state) {
      logUnknownConv(flight.convId, "worker-turn(local)");
      return;
    }
    if (state.status === "closed") return;

    let output = "";
    let scrapeFailed = false;
    try {
      const raw = await herdr.paneRead(flight.paneId, {
        source: "recent",
        lines: 200,
      });
      output = stripAnsi(raw);
    } catch (e) {
      output = `(pane.read failed: ${e instanceof Error ? e.message : e})`;
      scrapeFailed = true;
    }

    let kind: ConvKind;
    if (kindHint === "blocked") {
      kind = "blocked";
    } else if (output.trimStart().startsWith("[DONE_PROPOSAL]")) {
      kind = "done_proposal";
    } else {
      kind = "normal";
    }

    const seq = nextOwnSeq(state.lastOwnSeq);

    // §5.1 "no truncation": over the inline threshold, package the full
    // recovered scrape out-of-band (§5.2 scp convention) instead of
    // tail-truncating (R26 — replaces the 0.22.0-era MVP-gap fallback).
    let text: string;
    let artifacts: ArtifactRefEntry[] | undefined;
    if (!scrapeFailed && output.length > MAX_CONV_TURN_INLINE_CHARS) {
      const packaged = packageConvTurnArtifact({
        convId: flight.convId,
        seq,
        fullText: output,
        bridgeDisplayName: session!.displayName,
        recoveryWindowDescription: "pane.read recovery-window (recent 200 lines)",
      });
      text = packaged.text;
      artifacts = packaged.artifacts;
    } else {
      text = output;
    }
    if (note) {
      text = `${text}\n\n(bridge note: ${note})`;
    }
    text = text.slice(0, MAX_CONV_TURN_INLINE_CHARS);

    const parsed = ConvTurnPayloadSchema.safeParse({
      v: CONV_CONTRACT_VERSION,
      convId: flight.convId,
      seq,
      kind,
      text,
      artifacts,
    });
    if (!parsed.success) {
      log("worker turn payload invalid:", parsed.error.message);
      return;
    }
    try {
      const attachment = serializeConvAttachment(CONV_TURN_LABEL, parsed.data);
      const body = buildConvTurnBody({ convId: flight.convId, seq, kind });
      await client.handoff({
        to: flight.pinnedPeerId,
        body,
        mode: "task",
        attachments: [attachment],
      });
      mutateConvState(flight.convId, "worker", (s) => {
        s.lastOwnSeq = seq;
        s.turnCount += 1;
      });
    } catch (e) {
      log("sendWorkerTurnFromPane failed:", e);
    }
  }

  /**
   * M-2 submit verify + retry (live-measured, see module header): wait for
   * the pane to report "working" via the already-subscribed status stream;
   * if it doesn't, resend the bare-Enter constant and wait again, up to
   * `submitVerify.retries` resends. A flight already gone from the map means
   * the card finished (or failed) before verify caught up — treat as
   * success and stop. If still unconfirmed after all retries, log and move
   * on without failing the card: a stray extra Enter on an already-submitted
   * composer is a harmless no-op, and the silence could just as easily be
   * herdr status-detection latency.
   */
  async function verifySubmitOrRetry(paneId: string, terminalId: string): Promise<void> {
    const pollMs = Math.max(10, Math.min(250, Math.floor(submitVerify.waitMs / 8) || 10));
    async function waitForWorkingOrGone(): Promise<"working" | "gone" | "timeout"> {
      const deadline = Date.now() + submitVerify.waitMs;
      while (Date.now() < deadline) {
        const f = flights.get(paneId);
        if (!f) return "gone";
        if (f.sawWorking) return "working";
        await new Promise((r) => setTimeout(r, pollMs));
      }
      const f = flights.get(paneId);
      if (!f) return "gone";
      return f.sawWorking ? "working" : "timeout";
    }

    let outcome = await waitForWorkingOrGone();
    let attempt = 0;
    while (outcome === "timeout" && attempt < submitVerify.retries) {
      attempt++;
      try {
        await herdr.agentSend(terminalId, BARE_ENTER);
      } catch (e) {
        log(`M-2 resend attempt ${attempt} failed:`, e);
      }
      outcome = await waitForWorkingOrGone();
    }
    if (outcome === "timeout") {
      log(
        `M-2 submit unconfirmed after ${submitVerify.retries} retries — pane may need manual Enter`,
        paneId,
      );
    }
  }

  function onHerdrEvent(event: string, data: unknown): void {
    const ev = event.replace(/\./g, "_"); // normalize dotted/underscore (C2)
    const d = data as Record<string, unknown>;
    const paneId = String(d.pane_id ?? (d.pane as { pane_id?: string } | undefined)?.pane_id ?? "");
    if (!paneId) return;

    const flight = flights.get(paneId);
    if (flight) {
      onCardHerdrEvent(flight, paneId, ev, event, d);
      return;
    }

    const convFlight = convFlights.get(paneId);
    if (convFlight) {
      onConvHerdrEvent(convFlight, paneId, ev, event, d);
      return;
    }
  }

  function onCardHerdrEvent(
    flight: Flight,
    paneId: string,
    ev: string,
    event: string,
    d: Record<string, unknown>,
  ): void {
    if (ev === "pane_closed" || event === "pane.closed") {
      flights.delete(paneId);
      void sendFailedResult({
        cardId: flight.cardId,
        fromPeerId: flight.fromPeerId,
        dispatchHandoffId: flight.dispatchHandoffId,
        reason: "pane_closed",
        paneId,
      });
      return;
    }

    if (
      ev !== "pane_agent_status_changed" &&
      event !== "pane.agent_status_changed"
    ) {
      return;
    }

    const status = String(
      d.agent_status ?? d.state ?? "",
    ).toLowerCase();

    if (status === "working") {
      flight.sawWorking = true;
      return;
    }

    // C1: done may arrive from detection; also accept idle after working, blocked → failed
    if (status === "blocked") {
      flights.delete(paneId);
      void finishCard(flight, "failed", "agent_blocked");
      return;
    }
    if (status === "done" || (status === "idle" && flight.sawWorking)) {
      flights.delete(paneId);
      void finishCard(flight, "done", undefined);
    }
  }

  /**
   * Conv analogue of onCardHerdrEvent. Unlike card flights, a conv flight is
   * NOT deleted on a normal turn — the pane stays alive across many turns;
   * only conv.close (tower-only) or pane.closed ends it (§1.4/§3.2, and the
   * pane-death-as-advisory-blocked-turn resolution recorded for R25's
   * Unknown "워커 pane 수명과 conv 수명 불일치").
   */
  function onConvHerdrEvent(
    flight: ConvFlight,
    paneId: string,
    ev: string,
    event: string,
    d: Record<string, unknown>,
  ): void {
    if (ev === "pane_closed" || event === "pane.closed") {
      convFlights.delete(paneId);
      convPaneByConvId.delete(flight.convId);
      void sendWorkerTurnFromPane(flight, "blocked", "pane_closed");
      return;
    }

    if (
      ev !== "pane_agent_status_changed" &&
      event !== "pane.agent_status_changed"
    ) {
      return;
    }

    const status = String(d.agent_status ?? d.state ?? "").toLowerCase();

    if (status === "working") {
      flight.sawWorking = true;
      return;
    }

    if (status === "blocked") {
      void sendWorkerTurnFromPane(flight, "blocked", "agent_blocked");
      return;
    }
    if (status === "done" || (status === "idle" && flight.sawWorking)) {
      flight.sawWorking = false;
      void sendWorkerTurnFromPane(flight, "auto");
    }
  }

  async function finishCard(
    flight: Flight,
    status: "done" | "failed",
    reason?: string,
  ): Promise<void> {
    let output = "";
    let truncated = false;
    try {
      const raw = await herdr.paneRead(flight.paneId, {
        source: "recent",
        lines: 200,
      });
      const stripped = stripAnsi(raw);
      const t = truncateTail(stripped, 200_000);
      output = t.text;
      truncated = t.truncated;
    } catch (e) {
      output = `(pane.read failed: ${e instanceof Error ? e.message : e})`;
      if (status === "done") status = "failed";
      reason = reason ?? "pane_read_failed";
    }

    const summary =
      status === "done"
        ? (output.trim().split(/\r?\n/).filter(Boolean).slice(-1)[0] ?? "done").slice(0, 900)
        : `failed${reason ? ` reason=${reason}` : ""}`.slice(0, 900);

    const payload: CardResultPayload = {
      v: CARD_CONTRACT_VERSION,
      cardId: flight.cardId,
      status,
      node: session!.displayName,
      seq: flight.seq,
      paneId: flight.paneId,
      dispatchHandoffId: flight.dispatchHandoffId,
      output,
      truncated,
      summary,
      startedAt: flight.startedAt,
      finishedAt: new Date().toISOString(),
      reason,
    };

    await sendResult(flight.fromPeerId, payload);
  }

  async function sendFailedResult(opts: {
    cardId: string;
    fromPeerId: string;
    dispatchHandoffId: string;
    reason: string;
    detail?: string;
    paneId?: string;
  }): Promise<void> {
    const seq = (cardSeq.get(opts.cardId) ?? 0) + 1;
    cardSeq.set(opts.cardId, seq);
    const summary = `failed reason=${opts.reason}${
      opts.detail ? ` ${opts.detail}` : ""
    }`.slice(0, 900);
    const payload: CardResultPayload = {
      v: CARD_CONTRACT_VERSION,
      cardId: opts.cardId,
      status: "failed",
      node: session!.displayName,
      seq,
      paneId: opts.paneId,
      dispatchHandoffId: opts.dispatchHandoffId,
      output: summary,
      truncated: false,
      summary,
      finishedAt: new Date().toISOString(),
      reason: opts.reason,
    };
    if (opts.fromPeerId) {
      await sendResult(opts.fromPeerId, payload);
    }
  }

  async function sendResult(
    toPeerId: string,
    payload: CardResultPayload,
  ): Promise<void> {
    if (!toPeerId) {
      log("sendResult: missing toPeerId");
      return;
    }
    try {
      const attachment = serializeCardAttachment(CARD_RESULT_LABEL, payload);
      const body = buildResultBody({
        cardId: payload.cardId,
        seq: payload.seq,
        summary: payload.summary,
      });
      await client.handoff({
        to: toPeerId,
        body,
        mode: "task",
        attachments: [attachment],
      });
    } catch (e) {
      log("sendResult failed:", e);
    }
  }

  let stopped = false;
  async function stop(): Promise<void> {
    if (stopped) return;
    stopped = true;
    clearInterval(pollTimer);
    try {
      server.stop(true);
    } catch {
      /* */
    }
    herdr.close();
    // Disconnect without leave so peer stays on roster as offline —
    // durable inbox + peerSecret rejoin keep queued cards (HERDR_DESIGN §2.4).
    try {
      client.close();
    } catch {
      /* */
    }
    clearBridgeMeta(meta.sessionPath);
  }

  // Keep reference so herdrOk can flip on reconnect failures (slice: static)
  void herdrOk;

  return { meta, stop };
}
