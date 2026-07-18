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
import {
  packageConvTurnArtifact,
  convArtifactsDir,
  scanArtifactMarkers,
  validateArtifactMarkerFilename,
  packageWorkerFileArtifact,
  workerArtifactInlineNotice,
  MAX_WORKER_ARTIFACTS_PER_TURN,
} from "./conv-artifact-pack";
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
 * M-2 / PLAN 0.23.5 inject verify: after initial inject+submit, wait for
 * "working" on the status stream. On timeout, observe composer via paneRead
 * and branch: (a) probe miss → reinject cached prompt once + CR (b) probe hit
 * (incl. paste placeholder) or read-fail → CR resend (c) retries exhausted →
 * fail-visible. Prompt body is never re-derived (R30 L-1) or logged.
 */
const SUBMIT_VERIFY_MS = 4_000;
const SUBMIT_RETRIES = 3;
/** R30 M-1: Claude Ink folds multi-line paste into a placeholder — treat as hit. */
const PASTE_PLACEHOLDER_MARKER = "[Pasted text";
const PROBE_TAIL_CHARS = 48;

/** Whitespace-normalize for TUI wrap-tolerant probe matching. */
function normalizeForProbe(s: string): string {
  return s.replace(/\s+/g, "");
}

/** Last 48 chars of whitespace-normalized prompt (or full string if shorter). */
function injectProbeTail(prompt: string): string {
  const n = normalizeForProbe(prompt);
  return n.length <= PROBE_TAIL_CHARS ? n : n.slice(-PROBE_TAIL_CHARS);
}

/**
 * Probe hit if scrape contains the prompt tail (ws-normalized) OR a paste
 * placeholder pattern (R30 M-1 — safe-side routing to CR, not reinject).
 * Placeholder match is wrap-tolerant: TUI may split "[Pasted text" across lines.
 */
function isInjectProbeHit(scrape: string, prompt: string): boolean {
  const norm = normalizeForProbe(scrape);
  if (norm.includes(normalizeForProbe(PASTE_PLACEHOLDER_MARKER))) return true;
  const probe = injectProbeTail(prompt);
  if (!probe) return false;
  return norm.includes(probe);
}

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
  /** R28 L-1: filename → sha256 of already-emitted worker file artifacts (stale-marker dedup). */
  emittedArtifacts?: Map<string, string>;
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

  // PLAN 0.23.4 / R29 L-2: global pane.closed once at startup — fail-fast if
  // the event stream cannot be established (same class as herdr ping fail-fast).
  try {
    await herdr.eventsSubscribe([{ type: "pane.closed" }]);
  } catch (e) {
    herdr.close();
    throw new Error(
      `herdr events.subscribe (pane.closed) failed: ${
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
            // PLAN 0.23.4 observability
            eventConnected: herdr.eventConnected,
            lastSubscribeAck: herdr.lastSubscribeAck,
            eventSubscriptions: herdr.eventSubscriptions,
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

    // PLAN 0.23.4: per-pane status only — pane.closed is global at startup.
    try {
      await herdr.eventsSubscribe([
        { type: "pane.agent_status_changed", pane_id: agent.pane_id },
      ]);
    } catch (e) {
      // Fail-visible: no blind progress without event delivery (M-1 rollback
      // on the client covers the failed subscription entry — no prune here).
      log("events.subscribe failed:", e);
      flights.delete(agent.pane_id);
      await sendFailedResult({
        cardId: payload.cardId,
        fromPeerId,
        dispatchHandoffId,
        reason: "events_subscribe_failed",
        detail: e instanceof Error ? e.message : String(e),
        paneId: agent.pane_id,
      });
      // PLAN 0.23.4: best-effort pane close after card subscribe failure.
      try {
        await herdr.request("pane.close", { pane_id: agent.pane_id });
      } catch {
        /* ignore — close is best-effort */
      }
      return;
    }

    let prompt: string;
    try {
      // M-2: untrusted prompt via agent.send only; bare Enter separate constant
      prompt = wrapUntrustedPrompt(payload.prompt);
      await herdr.injectPromptAndSubmit(agent.terminal_id, prompt);
    } catch (e) {
      flights.delete(agent.pane_id);
      herdr.eventsPrune(agent.pane_id);
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

    // PLAN 0.23.5: pass the exact inject cache string (no re-derive — R30 L-1)
    await verifyInjectOrRetry({
      kind: "card",
      paneId: agent.pane_id,
      terminalId: agent.terminal_id,
      prompt,
    });
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
      let prompt: string;
      try {
        // R23 M-2 applies every turn (R24/R25 L-4), not just the first prompt.
        prompt = wrapUntrustedPrompt(payload.text);
        flight.sawWorking = false;
        await herdr.injectPromptAndSubmit(flight.terminalId, prompt);
      } catch (e) {
        log("conv turn inject failed:", e);
        return;
      }
      // PLAN 0.23.5: per-turn probe from this inject's cache string (R30 L-1)
      await verifyInjectOrRetry({
        kind: "conv",
        paneId: flight.paneId,
        terminalId: flight.terminalId,
        prompt,
      });
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
        herdr.eventsPrune(paneId);
      }
      return;
    }
  }

  async function startConvPane(
    payload: ConvOpenPayload,
    fromPeerId: string,
    argv: string[],
  ): Promise<void> {
    // R28 L-2: pass measured artifacts dir (not a hardcoded ~/.loom literal)
    // so legacy loomDir() divergence still lands markers where the bridge reads.
    const artifactsDir = convArtifactsDir(payload.convId);
    let agent: HerdrAgentStarted;
    try {
      agent = await herdr.agentStart({
        name: `loom-conv-${payload.convId.slice(5, 21)}`,
        argv,
        env: {
          LOOM_CONV: payload.convId,
          LOOM_ARTIFACTS_DIR: artifactsDir,
        },
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

    // PLAN 0.23.4: per-pane status only — pane.closed is global at startup.
    try {
      await herdr.eventsSubscribe([
        { type: "pane.agent_status_changed", pane_id: agent.pane_id },
      ]);
    } catch (e) {
      // Fail-visible: clean flights + blocked turn (M-1 client rollback covers
      // the failed subscription entry — no prune here).
      log("conv events.subscribe failed:", e);
      convFlights.delete(agent.pane_id);
      convPaneByConvId.delete(payload.convId);
      void sendWorkerTurnFromPane(flight, "blocked", "events_subscribe_failed");
      return;
    }

    let prompt: string;
    try {
      // Goal doubles as the first turn's prompt — the worker starts on
      // accept, mirroring card dispatch's prompt-on-start.
      // R28 L-2 / §5.1: bridge-authored artifact convention OUTSIDE the
      // untrusted wrapper (bridge authors it; goal stays untrusted).
      const untrusted = wrapUntrustedPrompt(payload.goal);
      const artifactConvention = [
        "",
        "--- Loom conv artifact convention (§5.1 / PLAN 0.23.3) ---",
        "If an output exceeds 32k characters (or cannot be fully conveyed via the pane),",
        `write the full content to the artifacts directory: ${artifactsDir}`,
        "(also available as $LOOM_ARTIFACTS_DIR). Create it with `mkdir -p -m 700` if needed.",
        "Then print a final line exactly: [ARTIFACT] <filename>",
        "Filename rules: filename only (no path separators); charset [A-Za-z0-9._-];",
        "must not start with - or .; must not match turn-* (bridge-reserved).",
        "--- end convention ---",
      ].join("\n");
      // Full inject cache includes artifact convention suffix (R30 L-1 / L-2)
      prompt = `${untrusted}${artifactConvention}`;
      await herdr.injectPromptAndSubmit(agent.terminal_id, prompt);
    } catch (e) {
      log("conv initial inject failed:", e);
      convFlights.delete(agent.pane_id);
      convPaneByConvId.delete(payload.convId);
      herdr.eventsPrune(agent.pane_id);
      return;
    }
    await verifyInjectOrRetry({
      kind: "conv",
      paneId: agent.pane_id,
      terminalId: agent.terminal_id,
      prompt,
    });
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

    // PLAN 0.23.3 / R28 M-1: worker-declared file markers BEFORE the 32k
    // measured trigger. Failures never fail the turn — collect reasons into
    // the bridge note. Dedup memory (R28 L-1): same filename+sha → skip.
    const noteParts: string[] = [];
    if (note) noteParts.push(note);
    const fileRefs: ArtifactRefEntry[] = [];
    // R28 L-1: only READ the dedup map while building the turn; commit
    // (filename, sha) pairs AFTER handoff succeeds. Committing before send
    // permanently suppresses a re-detect when handoff throws.
    const pendingDedup: Array<[string, string]> = [];
    if (!scrapeFailed) {
      const markers = scanArtifactMarkers(output);
      if (markers.length > 0) {
        flight.emittedArtifacts ??= new Map();
        let accepted = 0;
        let excess = 0;
        for (const filename of markers) {
          if (accepted >= MAX_WORKER_ARTIFACTS_PER_TURN) {
            excess++;
            continue;
          }
          const v = validateArtifactMarkerFilename(filename);
          if (!v.ok) {
            noteParts.push(`artifact marker rejected (${filename}): ${v.reason}`);
            continue;
          }
          const packed = packageWorkerFileArtifact({
            convId: flight.convId,
            filename,
            bridgeDisplayName: session!.displayName,
          });
          if (!packed.ok) {
            noteParts.push(`artifact ${filename}: ${packed.reason}`);
            continue;
          }
          const sha = packed.ref.sha256 ?? "";
          const prev = flight.emittedArtifacts.get(filename);
          if (prev !== undefined && prev === sha) {
            // R28 L-1: stale marker re-detect with same sha — skip silently
            continue;
          }
          // sha differs (or first time) → emit; remember only after send success
          pendingDedup.push([filename, sha]);
          fileRefs.push(packed.ref);
          accepted++;
        }
        if (excess > 0) {
          noteParts.push(
            `artifact markers excess ignored (${excess} beyond cap ${MAX_WORKER_ARTIFACTS_PER_TURN})`,
          );
        }
      }
    }

    // §5.1 "no truncation": over the inline threshold, package the full
    // recovered scrape out-of-band (§5.2 scp convention) instead of
    // tail-truncating (R26 — replaces the 0.22.0-era MVP-gap fallback).
    // R28 M-1: measured trigger coexists with file-based refs (turn-* reserved).
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
      artifacts = [...packaged.artifacts, ...fileRefs];
    } else {
      // R28 M-1: ONLY file-based refs → keep original scrape (markers included)
      // + short notice per ref; do NOT replace text with a file tail.
      text = output;
      if (fileRefs.length > 0) {
        const notices = fileRefs.map((r) => workerArtifactInlineNotice(r)).join("\n");
        text = `${text}\n\n${notices}`;
        artifacts = fileRefs;
      }
    }
    if (noteParts.length > 0) {
      text = `${text}\n\n(bridge note: ${noteParts.join("; ")})`;
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
      // Commit dedup memory only after successful send (mirror lastOwnSeq pattern)
      if (pendingDedup.length > 0) {
        flight.emittedArtifacts ??= new Map();
        for (const [filename, sha] of pendingDedup) {
          flight.emittedArtifacts.set(filename, sha);
        }
      }
    } catch (e) {
      log("sendWorkerTurnFromPane failed:", e);
    }
  }

  /**
   * PLAN 0.23.5 unified inject verify (card + conv).
   * `prompt` is the exact string last passed to injectPromptAndSubmit — never
   * re-derived (R30 L-1). Reinject at most once per verify call (R30 M-2).
   * Flight gone between timeout and action = success (R30 L-3).
   */
  async function verifyInjectOrRetry(opts: {
    kind: "card" | "conv";
    paneId: string;
    terminalId: string;
    prompt: string;
  }): Promise<void> {
    const { kind, paneId, terminalId, prompt } = opts;
    const pollMs = Math.max(
      10,
      Math.min(250, Math.floor(submitVerify.waitMs / 8) || 10),
    );

    function flightAlive(): boolean {
      return kind === "card" ? flights.has(paneId) : convFlights.has(paneId);
    }

    function sawWorking(): boolean {
      if (kind === "card") return flights.get(paneId)?.sawWorking === true;
      return convFlights.get(paneId)?.sawWorking === true;
    }

    async function waitForWorkingOrGone(): Promise<"working" | "gone" | "timeout"> {
      const deadline = Date.now() + submitVerify.waitMs;
      while (Date.now() < deadline) {
        if (!flightAlive()) return "gone";
        if (sawWorking()) return "working";
        await new Promise((r) => setTimeout(r, pollMs));
      }
      if (!flightAlive()) return "gone";
      return sawWorking() ? "working" : "timeout";
    }

    // M-2: reinject budget is per verify call (inject attempt), not per flight
    let reinjectUsed = false;
    let outcome = await waitForWorkingOrGone();
    let attempt = 0;
    /** Last observed probe this verify call; "none" if exhausted before any paneRead. */
    let lastProbe: "hit" | "miss" | "read-fail" | "none" = "none";

    while (outcome === "timeout" && attempt < submitVerify.retries) {
      attempt++;
      // L-3: re-check before acting — card may have finished / conv closed
      if (!flightAlive()) return;

      let probe: "hit" | "miss" | "read-fail" = "read-fail";
      let action: "reinject" | "cr" = "cr";

      try {
        const scrape = await herdr.paneRead(paneId, {
          source: "recent",
          lines: 60,
        });
        probe = isInjectProbeHit(scrape, prompt) ? "hit" : "miss";
      } catch {
        // Scrape failure ≠ inject failure — fall back to CR (existing path)
        probe = "read-fail";
      }
      lastProbe = probe;

      if (probe === "miss" && !reinjectUsed) {
        action = "reinject";
        reinjectUsed = true;
      } else {
        // hit (incl. placeholder), read-fail, or miss after reinject budget → CR
        action = "cr";
      }

      // F-3 / L-3: re-check after paneRead wait — flight may have ended mid-RPC
      if (!flightAlive()) return;

      if (action === "reinject") {
        try {
          // Same cached string only — no re-derive (R30 L-1); separate CR
          await herdr.agentSend(terminalId, prompt);
          await herdr.agentSend(terminalId, BARE_ENTER);
        } catch (e) {
          log(`verify reinject attempt ${attempt} failed:`, e);
        }
      } else {
        try {
          await herdr.agentSend(terminalId, BARE_ENTER);
        } catch (e) {
          log(`verify CR attempt ${attempt} failed:`, e);
        }
      }

      // Observability: branch only — never log prompt body or probe string
      log(`verify round ${attempt}: probe=${probe} action=${action}`);
      outcome = await waitForWorkingOrGone();
    }

    if (outcome === "timeout") {
      if (!flightAlive()) return; // L-3: gone after last wait = success
      // (c) exhausted — fail-visible (card tear-down / conv blocked turn)
      const failRound = Math.max(attempt, 1);
      log(`verify round ${failRound}: probe=${lastProbe} action=fail`);
      if (kind === "card") {
        const flight = flights.get(paneId);
        flights.delete(paneId);
        herdr.eventsPrune(paneId);
        if (flight) {
          await sendFailedResult({
            cardId: flight.cardId,
            fromPeerId: flight.fromPeerId,
            dispatchHandoffId: flight.dispatchHandoffId,
            reason: "inject_unconfirmed",
            paneId,
          });
        }
        try {
          await herdr.request("pane.close", { pane_id: paneId });
        } catch {
          /* best-effort close — same class as events_subscribe_failed */
        }
      } else {
        // Conv: blocked turn only — keep convFlight + pane for tower retry
        const flight = convFlights.get(paneId);
        if (flight) {
          await sendWorkerTurnFromPane(flight, "blocked", "inject_unconfirmed");
        }
      }
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
      herdr.eventsPrune(paneId);
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
      herdr.eventsPrune(paneId);
      void finishCard(flight, "failed", "agent_blocked");
      return;
    }
    if (status === "done" || (status === "idle" && flight.sawWorking)) {
      flights.delete(paneId);
      herdr.eventsPrune(paneId);
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
      herdr.eventsPrune(paneId);
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
