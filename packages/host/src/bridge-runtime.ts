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
    if (!flight) return;

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
