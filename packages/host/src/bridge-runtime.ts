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
/** PLAN 0.23.6: settle re-read delay between pane reads (idle render settle). */
const SETTLE_MS = 250;
/**
 * PLAN 0.23.7: still-running completion deferral defaults.
 * Poll interval 10s; hard cap 5 min (fail-visible note on exhaust).
 */
const STILL_RUNNING_POLL_MS = 10_000;
const STILL_RUNNING_MAX_MS = 5 * 60_000;
/**
 * PLAN 0.23.7: conservative still-running indicator patterns (tail match only).
 * Real TUI status line observed live: "1 command still running" / "N commands…".
 */
const STILL_RUNNING_PATTERNS: RegExp[] = [
  /\d+\s+commands?\s+still\s+running/i,
];
/** R30 M-1: Claude Ink folds multi-line paste into a placeholder — treat as hit. */
const PASTE_PLACEHOLDER_MARKER = "[Pasted text";
const PROBE_TAIL_CHARS = 48;

/** Whitespace-normalize for TUI wrap-tolerant probe matching. */
function normalizeForProbe(s: string): string {
  return s.replace(/\s+/g, "");
}

// ─── PLAN 0.23.6: TUI chrome filter + delta scrape ──────────────────────────

/** Box-drawing / border-only chars (Unicode box + common ASCII border fillers). */
const BOX_DRAWING_LINE_RE =
  /^[\s\u2500-\u257F\u2580-\u259F╭╮╯╰│┃─━┌┐└┘├┤┬┴┼═║╔╗╚╝╠╣╦╩╬┏┓┗┛┣┫┳┻╋╌╍╎╏┄┅┆┇┈┉┊┋]+$/u;

/** Composer prompt line (Claude/Ink-style `│ ❯ …`). */
const COMPOSER_PROMPT_RE = /│\s*❯/;

/** Known TUI key-hint substrings — whole line dropped if any match (conservative). */
const KEY_HINT_MARKERS = [
  "Shift+Tab:mode",
  "Ctrl+.:shortcuts",
  "Ctrl+c:cancel",
  // PLAN 0.23.8: claude autoaccept hint line (live board-note pollution)
  "⏵⏵ auto mode on",
] as const;

/**
 * PLAN 0.23.8: content-bearing box bottom status line (e.g. grok
 * `╰─ Grok 4.5 (high)…─╯`). Full-line match only — partial prose stays.
 */
const BOX_STATUS_LINE_RE = /^╰─.*─╯$/u;

/**
 * PLAN 0.23.6: strip obvious TUI chrome lines only (box borders, composer
 * prompt, known key hints, trailing blanks). Apply to conv inline text and
 * card summary input — never to card `output` body (R31 M-1).
 * PLAN 0.23.8: + content box status (`╰─…─╯`) + `⏵⏵ auto mode on` hint.
 */
export function stripTuiChrome(text: string): string {
  const lines = text.split(/\r?\n/);
  const kept: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") {
      kept.push(line);
      continue;
    }
    if (BOX_DRAWING_LINE_RE.test(trimmed)) continue;
    if (BOX_STATUS_LINE_RE.test(trimmed)) continue;
    if (COMPOSER_PROMPT_RE.test(line)) continue;
    if (KEY_HINT_MARKERS.some((m) => line.includes(m))) continue;
    kept.push(line);
  }
  while (kept.length > 0 && kept[kept.length - 1]!.trim() === "") {
    kept.pop();
  }
  return kept.join("\n");
}

/**
 * Whitespace-normalize with index map: map[i] = original index of
 * normalized[i]. Used for delta slice on original text (R31 M-2).
 */
export function normalizeWithIndexMap(s: string): {
  normalized: string;
  map: number[];
} {
  const map: number[] = [];
  let normalized = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (/\s/.test(ch)) continue;
    map.push(i);
    normalized += ch;
  }
  return { normalized, map };
}

/**
 * Delta anchor from chrome-filtered scrape: last ≤3 non-empty lines,
 * whitespace-normalized for storage.
 */
export function buildDeltaAnchor(filtered: string): string {
  const lines = filtered.split(/\r?\n/).filter((l) => l.trim() !== "");
  const tail = lines.slice(-3).join("\n");
  return normalizeWithIndexMap(tail).normalized;
}

export type DeltaApplyResult =
  | { kind: "no_anchor"; text: string }
  | { kind: "miss"; text: string }
  | { kind: "applied"; text: string; kept: number; total: number }
  | { kind: "empty"; text: string; kept: number; total: number };

/**
 * Apply delta anchor against chrome-filtered scrape. Match is last
 * occurrence on the whitespace-normalized form; slice is from the original
 * (filtered) text via index map — never from the normalized string (R31 M-2).
 */
export function applyDeltaAnchor(
  filtered: string,
  anchor: string | undefined,
): DeltaApplyResult {
  if (!anchor) return { kind: "no_anchor", text: filtered };
  const { normalized, map } = normalizeWithIndexMap(filtered);
  if (!normalized.includes(anchor)) {
    return { kind: "miss", text: filtered };
  }
  const idx = normalized.lastIndexOf(anchor);
  const endNorm = idx + anchor.length;
  let startOrig: number;
  if (endNorm <= 0) {
    startOrig = 0;
  } else if (endNorm > map.length) {
    startOrig = filtered.length;
  } else {
    startOrig = map[endNorm - 1]! + 1;
  }
  const delta = filtered.slice(startOrig);
  const total = filtered.length;
  if (delta.trim() === "") {
    return { kind: "empty", text: "", kept: 0, total };
  }
  return { kind: "applied", text: delta, kept: delta.length, total };
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
  /**
   * PLAN 0.23.7 M-1: still-running completion deferral ownership flag.
   * Set synchronously *before* any settle await so concurrent done/idle
   * events are no-ops while this path owns the completion decision.
   */
  stillRunningDeferral?: boolean;
  /** Poll timer handle; cleared on finish / cancel / pane_closed / stop. */
  stillRunningPollTimer?: ReturnType<typeof setTimeout>;
  /** Date.now() when deferral polling began (first indicator hit). */
  stillRunningStartedAt?: number;
};

/**
 * PLAN 0.23.7: detect "N command(s) still running" in the last 10 non-empty
 * lines of a stripAnsi scrape (whitespace-normalized, case-insensitive).
 * Tail-only to avoid false positives from brief/lessons body quotes.
 */
export function hasStillRunningIndicator(scrape: string): boolean {
  const text = stripAnsi(scrape);
  const nonEmpty = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const tail = nonEmpty.slice(-10);
  // Normalize whitespace across the tail block so wrap/spacing variants match.
  const normalized = tail.join(" ").replace(/\s+/g, " ");
  for (const re of STILL_RUNNING_PATTERNS) {
    if (re.test(normalized)) return true;
  }
  return false;
}

/**
 * PLAN 0.23.9 / R34 M-1: done_proposal is line-anchored in the last K
 * non-empty lines of the judgment input (delta text or chrome-filtered full
 * scrape). Whole-text-prefix detection structurally missed convention-compliant
 * workers (tower-turn echo + mid-output precede the marker).
 *
 * K=10 (not the reviewed "권장 3"): SMOKE-0239 live — claude TUI appends
 * ≥3 unfiltered non-content lines after the answer (timing line, bare
 * composer `❯`, statusline), pushing a compliant marker out of a 3-line
 * window. Matches the still-running tail-10 precedent (0.23.7).
 */
export const DONE_PROPOSAL_TAIL_LINES = 10;

export function hasDoneProposalMarker(text: string, k = DONE_PROPOSAL_TAIL_LINES): boolean {
  const nonEmpty = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const tail = nonEmpty.slice(-Math.max(1, k));
  return tail.some((l) => l.startsWith("[DONE_PROPOSAL]"));
}

/** Conv (multiturn) worker-side pane flight — lives across many turns, unlike card Flight. */
type ConvFlight = {
  convId: string;
  pinnedPeerId: string;
  paneId: string;
  terminalId: string;
  sawWorking: boolean;
  /** R28 L-1: filename → sha256 of already-emitted worker file artifacts (stale-marker dedup). */
  emittedArtifacts?: Map<string, string>;
  /**
   * PLAN 0.23.6: whitespace-normalized tail (≤3 non-empty lines) of the last
   * successfully-sent chrome-filtered scrape. Used to slice next-turn delta.
   */
  deltaAnchor?: string;
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
  /**
   * PLAN 0.23.6 settle re-read delay (ms) between pane reads.
   * Test injection — production default 250. Real timers only (no fake-timer).
   */
  settleMs?: number;
  /**
   * PLAN 0.23.7 still-running deferral poll interval (ms).
   * Test injection — production default 10_000. Real timers only.
   */
  stillRunningPollMs?: number;
  /**
   * PLAN 0.23.7 still-running deferral hard cap (ms).
   * Test injection — production default 300_000. Real timers only.
   */
  stillRunningMaxMs?: number;
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
  const settleMs = opts?.settleMs ?? SETTLE_MS;
  const stillRunningPollMs = opts?.stillRunningPollMs ?? STILL_RUNNING_POLL_MS;
  const stillRunningMaxMs = opts?.stillRunningMaxMs ?? STILL_RUNNING_MAX_MS;

  const flights = new Map<string, Flight>(); // paneId → flight
  const cardSeq = new Map<string, number>();
  const processedHandoffs = new Set<string>();
  const convFlights = new Map<string, ConvFlight>(); // paneId → conv flight
  const convPaneByConvId = new Map<string, string>(); // convId → paneId

  /**
   * PLAN 0.23.9 ⑧: in-memory worker pool tab. pane.list is SSOT at spawn time;
   * this only holds the candidate tab key + pane ids the bridge registered.
   * Race / restart rediscovery are cosmetic (R34 L-1/L-2) — no extra machinery.
   */
  let workerPool: { tabId: string; paneIds: Set<string> } | null = null;
  const POOL_MAX_WORKERS = 4;

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
            // PLAN 0.23.8 pane cleanup policy
            paneCleanup: cfg.paneCleanup ?? "auto",
            // PLAN 0.23.9 worker pane placement policy
            panePlacement: cfg.panePlacement ?? "pool",
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
      // PLAN 0.23.9 ③: unauthorized conv.open — mark processed + log, no claim
      // (card M-1 deny form). turn/close keep pre-claim then pin check.
      if (
        convLbl === CONV_OPEN_LABEL &&
        !isAuthorizedDispatcher(cfg, h.fromPeerId)
      ) {
        processedHandoffs.add(h.id);
        log(`M-1 deny conv.open (no claim) from ${h.fromPeerId}`);
        return;
      }
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

  /**
   * PLAN 0.23.9 ⑧: spawn a worker agent into the bridge-local pool tab.
   * pane.list is SSOT; fail-open to one unhinted agentStart on any pool path
   * failure. `"legacy"` bypasses the pool entirely.
   */
  async function spawnWorkerAgent(opts: {
    name: string;
    argv: string[];
    env?: Record<string, string>;
    cwd?: string;
  }): Promise<HerdrAgentStarted> {
    const base = {
      name: opts.name,
      argv: opts.argv,
      env: opts.env,
      cwd: opts.cwd,
      focus: false as const,
    };
    if ((cfg.panePlacement ?? "pool") === "legacy") {
      return herdr.agentStart(base);
    }

    const unhintedFallback = async (why: string): Promise<HerdrAgentStarted> => {
      log(`pane placement fallback (unhinted): ${why}`);
      return herdr.agentStart(base);
    };

    try {
      const listed = await herdr.paneList();

      if (workerPool) {
        const tabAlive = listed.some((p) => p.tabId === workerPool!.tabId);
        if (!tabAlive) {
          workerPool = null;
        } else {
          const liveIds = [...workerPool.paneIds].filter((id) =>
            listed.some((p) => p.paneId === id && p.tabId === workerPool!.tabId),
          );
          workerPool.paneIds = new Set(liveIds);
          if (liveIds.length >= POOL_MAX_WORKERS) {
            // Full — drop pool so next path creates a new tab. Existing panes stay.
            workerPool = null;
          } else if (liveIds.length > 0) {
            // PLAN 0.23.10 오너 지시: always horizontal (right) splits — no down.
            const split: "right" | "down" = "right";
            try {
              const agent = await herdr.agentStart({
                ...base,
                tabId: workerPool.tabId,
                split,
              });
              workerPool.paneIds.add(agent.pane_id);
              return agent;
            } catch (e) {
              return unhintedFallback(
                `hinted spawn failed: ${e instanceof Error ? e.message : e}`,
              );
            }
          }
          // liveIds.length === 0 but tab still listed (empty pool tab) —
          // fall through to create path is wrong; reuse empty tab with split right.
          if (workerPool && liveIds.length === 0) {
            try {
              const agent = await herdr.agentStart({
                ...base,
                tabId: workerPool.tabId,
                split: "right",
              });
              workerPool.paneIds.add(agent.pane_id);
              return agent;
            } catch (e) {
              workerPool = null;
              return unhintedFallback(
                `empty-pool spawn failed: ${e instanceof Error ? e.message : e}`,
              );
            }
          }
        }
      }

      // New pool tab: tab.create → first worker (split right) → root close.
      try {
        const tab = await herdr.tabCreate({
          workspaceId: cfg.paneWorkspaceId,
          label: "loom-workers",
        });
        workerPool = { tabId: tab.tabId, paneIds: new Set() };
        try {
          const agent = await herdr.agentStart({
            ...base,
            tabId: tab.tabId,
            split: "right",
          });
          try {
            await herdr.request("pane.close", { pane_id: tab.rootPaneId });
          } catch {
            /* best-effort — root shell only, just-created tab */
          }
          workerPool.paneIds.add(agent.pane_id);
          return agent;
        } catch (e) {
          workerPool = null;
          return unhintedFallback(
            `first pool spawn failed: ${e instanceof Error ? e.message : e}`,
          );
        }
      } catch (e) {
        return unhintedFallback(
          `tab.create failed: ${e instanceof Error ? e.message : e}`,
        );
      }
    } catch (e) {
      return unhintedFallback(
        `pane.list failed: ${e instanceof Error ? e.message : e}`,
      );
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
      agent = await spawnWorkerAgent({
        name: `loom-${payload.cardId.slice(0, 20)}-${seq}`,
        argv,
        env: { LOOM_CARD: payload.cardId },
        cwd: payload.cwd,
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
        // Order: flight teardown + prune → then best-effort pane.close
        // (PLAN 0.23.8 ⑥; mid-work kill is intentional — tower close authority).
        convFlights.delete(paneId);
        convPaneByConvId.delete(payload.convId);
        herdr.eventsPrune(paneId);
        if ((cfg.paneCleanup ?? "auto") !== "keep") {
          try {
            await herdr.request("pane.close", { pane_id: paneId });
          } catch {
            /* best-effort — must not affect close semantics */
          }
        }
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
      agent = await spawnWorkerAgent({
        name: `loom-conv-${payload.convId.slice(5, 21)}`,
        argv,
        env: {
          LOOM_CONV: payload.convId,
          LOOM_ARTIFACTS_DIR: artifactsDir,
        },
        cwd: payload.scope.cwd,
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
      // PLAN 0.23.9 ② / R34 M-1: done_proposal marker must NOT lead a convention
      // line (echo would false-positive the tail line-anchored detector). Same
      // form as [ARTIFACT]: "print a final line exactly: …".
      const artifactConvention = [
        "",
        "--- Loom conv artifact convention (§5.1 / PLAN 0.23.3) ---",
        "If an output exceeds 32k characters (or cannot be fully conveyed via the pane),",
        `write the full content to the artifacts directory: ${artifactsDir}`,
        "(also available as $LOOM_ARTIFACTS_DIR). Create it with `mkdir -p -m 700` if needed.",
        "Then print a final line exactly: [ARTIFACT] <filename>",
        "Filename rules: filename only (no path separators); charset [A-Za-z0-9._-];",
        "must not start with - or .; must not match turn-* (bridge-reserved).",
        "When you judge the goal complete, print a final line exactly: [DONE_PROPOSAL] <one-line summary>",
        "(bridge surfaces the proposal on the board; tower accepts with conv.close reason done).",
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
   * otherwise a line-anchored "[DONE_PROPOSAL]" in the judgment-input tail
   * (PLAN 0.23.9 / R34 M-1 — last K non-empty lines of delta or chrome-filtered
   * full scrape) maps to kind=done_proposal, else kind=normal. Pane stays
   * alive — only conv.close (tower-only, §1.4/§3.2) ends the conv.
   */
  /**
   * PLAN 0.23.6 settle re-read: read → wait → re-read → on stripAnsi mismatch
   * one more (max 3). Last sample wins. Verify-loop paneRead is NOT covered.
   */
  async function settlePaneRead(paneId: string): Promise<string> {
    const once = () =>
      herdr.paneRead(paneId, { source: "recent", lines: 200 });
    const last = await once();
    await new Promise((r) => setTimeout(r, settleMs));
    let next = await once();
    if (stripAnsi(last) !== stripAnsi(next)) {
      await new Promise((r) => setTimeout(r, settleMs));
      next = await once();
    }
    return next;
  }

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

    /** stripAnsi scrape (pre chrome-filter) — markers + raw done_proposal head. */
    let output = "";
    /** chrome-filtered scrape — inline/delta/32k packaging input. */
    let filtered = "";
    let scrapeFailed = false;
    try {
      const raw = await settlePaneRead(flight.paneId);
      output = stripAnsi(raw);
      filtered = stripTuiChrome(output);
    } catch (e) {
      output = `(pane.read failed: ${e instanceof Error ? e.message : e})`;
      filtered = output;
      scrapeFailed = true;
    }

    const seq = nextOwnSeq(state.lastOwnSeq);

    // PLAN 0.23.3 / R28 M-1: worker-declared file markers BEFORE the 32k
    // measured trigger. Failures never fail the turn — collect reasons into
    // the bridge note. Dedup memory (R28 L-1): same filename+sha → skip.
    // PLAN 0.23.6: marker scan stays on pre-filter raw (filter must not drop markers).
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
    // PLAN 0.23.6 L-1: 32k trigger input = chrome-filtered full scrape (no delta).
    // Delta applies only on the ≤32k inline branch.
    let text: string;
    let artifacts: ArtifactRefEntry[] | undefined;
    /**
     * PLAN 0.23.9 / R34 M-1: judgment input for done_proposal —
     * delta text when applied; chrome-filtered full scrape on fallbacks
     * (anchor miss / no anchor / 32k packaging). scrapeFailed → skip below.
     */
    let doneProposalInput: string = filtered;

    if (!scrapeFailed && filtered.length > MAX_CONV_TURN_INLINE_CHARS) {
      const packaged = packageConvTurnArtifact({
        convId: flight.convId,
        seq,
        fullText: filtered,
        bridgeDisplayName: session!.displayName,
        recoveryWindowDescription: "pane.read recovery-window (recent 200 lines)",
      });
      text = packaged.text;
      artifacts = [...packaged.artifacts, ...fileRefs];
      // Packaging path is not a delta application — chrome-filtered full scrape.
      doneProposalInput = filtered;
    } else if (!scrapeFailed) {
      const delta = applyDeltaAnchor(filtered, flight.deltaAnchor);
      if (delta.kind === "miss") {
        noteParts.push("delta anchor miss (full scrape)");
        text = filtered;
        doneProposalInput = filtered;
      } else if (delta.kind === "empty") {
        noteParts.push("delta empty (no new output)");
        noteParts.push(`delta: kept 0/${delta.total} chars`);
        text = "";
        doneProposalInput = "";
      } else if (delta.kind === "applied") {
        noteParts.push(`delta: kept ${delta.kept}/${delta.total} chars`);
        text = delta.text;
        doneProposalInput = delta.text;
      } else {
        // First turn / no prior anchor — chrome-filtered full scrape.
        text = filtered;
        doneProposalInput = filtered;
      }
      // R28 M-1: ONLY file-based refs → keep scrape (+delta) + short notice per ref.
      if (fileRefs.length > 0) {
        const notices = fileRefs.map((r) => workerArtifactInlineNotice(r)).join("\n");
        text = `${text}\n\n${notices}`;
        artifacts = fileRefs;
      }
    } else {
      text = output;
      doneProposalInput = "";
    }

    // PLAN 0.23.9 / R34 M-1: tail-K line-anchored (not whole-text prefix).
    // blocked kindHint still wins; scrapeFailed leaves input empty → normal.
    let kind: ConvKind;
    if (kindHint === "blocked") {
      kind = "blocked";
    } else if (hasDoneProposalMarker(doneProposalInput)) {
      kind = "done_proposal";
    } else {
      kind = "normal";
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
      // PLAN 0.23.6: refresh delta anchor only after successful send (incl. packaging turns — L-1).
      if (!scrapeFailed) {
        flight.deltaAnchor = buildDeltaAnchor(filtered);
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

  function clearStillRunningTimers(flight: Flight): void {
    if (flight.stillRunningPollTimer != null) {
      clearTimeout(flight.stillRunningPollTimer);
      flight.stillRunningPollTimer = undefined;
    }
  }

  function clearStillRunningState(flight: Flight): void {
    clearStillRunningTimers(flight);
    flight.stillRunningDeferral = false;
    flight.stillRunningStartedAt = undefined;
  }

  /**
   * PLAN 0.23.7: after a completion-class status, settle-scrape and either
   * finish immediately or enter still-running poll deferral.
   * Ownership of completion is the poll path while stillRunningDeferral is set.
   */
  async function beginCardCompletion(
    flight: Flight,
    paneId: string,
  ): Promise<void> {
    let scrape: string;
    try {
      scrape = await settlePaneRead(paneId);
    } catch {
      // Settle failed — fall through to finishCard which re-reads and maps
      // read failure to failed (same as pre-0.23.7 path).
      if (flights.get(paneId) !== flight) return;
      clearStillRunningState(flight);
      flights.delete(paneId);
      herdr.eventsPrune(paneId);
      await finishCard(flight, "done", undefined);
      return;
    }

    // M-1: flight may have been torn down (blocked/pane_closed/working) mid-await
    if (flights.get(paneId) !== flight) return;
    if (!flight.stillRunningDeferral) return;

    if (!hasStillRunningIndicator(scrape)) {
      // No indicator → immediate finish; pass scrape (no re-scrape).
      // PLAN 0.23.8 R33 M-1: confident indicator-clear path → closePane.
      clearStillRunningState(flight);
      flights.delete(paneId);
      herdr.eventsPrune(paneId);
      await finishCard(flight, "done", undefined, {
        scrape,
        closePane: true,
      });
      return;
    }

    // Indicator hit → keep flight, enter poll (first re-read after pollMs).
    flight.stillRunningStartedAt = Date.now();
    log(
      `card ${flight.cardId}: still-running indicator — deferring completion (poll ${stillRunningPollMs}ms, max ${stillRunningMaxMs}ms)`,
    );
    scheduleStillRunningPoll(flight, paneId);
  }

  function scheduleStillRunningPoll(flight: Flight, paneId: string): void {
    clearStillRunningTimers(flight);
    flight.stillRunningPollTimer = setTimeout(() => {
      void (async () => {
        if (flights.get(paneId) !== flight) return;
        if (!flight.stillRunningDeferral) return;

        const startedAt = flight.stillRunningStartedAt ?? Date.now();
        const elapsed = Date.now() - startedAt;

        let scrape: string;
        try {
          scrape = await settlePaneRead(paneId);
        } catch {
          // Read fail mid-poll: if cap not reached, retry next interval; else exhaust.
          if (flights.get(paneId) !== flight || !flight.stillRunningDeferral) {
            return;
          }
          if (elapsed >= stillRunningMaxMs) {
            const secs = Math.round(stillRunningMaxMs / 1000);
            clearStillRunningState(flight);
            flights.delete(paneId);
            herdr.eventsPrune(paneId);
            await finishCard(flight, "done", undefined, {
              note: `still_running deferral exhausted (${secs}s)`,
            });
          } else {
            scheduleStillRunningPoll(flight, paneId);
          }
          return;
        }

        if (flights.get(paneId) !== flight) return;
        if (!flight.stillRunningDeferral) return;

        if (!hasStillRunningIndicator(scrape)) {
          // Indicator cleared — finish with the scrape that proved clearance (L-1).
          // PLAN 0.23.8 R33 M-1: confident indicator-clear path → closePane.
          const secs = Math.max(0, Math.round(elapsed / 1000));
          clearStillRunningState(flight);
          flights.delete(paneId);
          herdr.eventsPrune(paneId);
          await finishCard(flight, "done", undefined, {
            scrape,
            note: `completion deferred ${secs}s (still-running indicator)`,
            closePane: true,
          });
          return;
        }

        if (elapsed >= stillRunningMaxMs) {
          // Cap exhausted — fail-visible note, still status=done with latest scrape.
          // PLAN 0.23.8: exhausted is NOT close-eligible (R33 M-1 — work may continue).
          const secs = Math.round(stillRunningMaxMs / 1000);
          clearStillRunningState(flight);
          flights.delete(paneId);
          herdr.eventsPrune(paneId);
          await finishCard(flight, "done", undefined, {
            scrape,
            note: `still_running deferral exhausted (${secs}s)`,
          });
          return;
        }

        // Still present and under cap — schedule next poll.
        scheduleStillRunningPoll(flight, paneId);
      })();
    }, stillRunningPollMs);
  }

  function onCardHerdrEvent(
    flight: Flight,
    paneId: string,
    ev: string,
    event: string,
    d: Record<string, unknown>,
  ): void {
    if (ev === "pane_closed" || event === "pane.closed") {
      // Clean deferral timers before teardown (test ⑦ / leak guard).
      clearStillRunningState(flight);
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
      // PLAN 0.23.7: working re-entry during deferral cancels poll and returns
      // to normal event flow (next idle re-evaluates).
      if (flight.stillRunningDeferral) {
        clearStillRunningState(flight);
        log(
          `card ${flight.cardId}: still-running deferral cancelled (working re-entry)`,
        );
      }
      flight.sawWorking = true;
      return;
    }

    // C1: done may arrive from detection; also accept idle after working, blocked → failed
    if (status === "blocked") {
      // M-1: blocked during deferral → clear poll timers then immediate failed.
      clearStillRunningState(flight);
      flights.delete(paneId);
      herdr.eventsPrune(paneId);
      void finishCard(flight, "failed", "agent_blocked");
      return;
    }
    if (status === "done" || (status === "idle" && flight.sawWorking)) {
      // M-1: while deferral flag is set, completion-class events are no-ops —
      // ownership of the finish decision is the poll path alone.
      if (flight.stillRunningDeferral) {
        return;
      }
      // Set ownership flag synchronously *before* any await so concurrent
      // done/idle events cannot re-enter beginCardCompletion.
      flight.stillRunningDeferral = true;
      void beginCardCompletion(flight, paneId);
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
    /**
     * PLAN 0.23.7 L-1: when the caller already holds the scrape that decided
     * completion (indicator clearance / exhaust), pass it so finishCard does
     * not re-scrape and drift from the decision sample. `note` is bridge-
     * generated observability only (never scrape body).
     * PLAN 0.23.8 R33 M-1: `closePane` is the *only* eligibility signal —
     * never inferred from status/note. Set only by indicator-clear confident
     * completion call sites (immediate no-indicator + deferred clear).
     */
    opts?: { scrape?: string; note?: string; closePane?: boolean },
  ): Promise<void> {
    let output = "";
    let truncated = false;
    try {
      // PLAN 0.23.6: settle re-read (shared with conv); output body stays unfiltered (R31 M-1).
      // PLAN 0.23.7 L-1: prefer caller-supplied scrape (no re-scrape).
      const raw =
        opts?.scrape !== undefined
          ? opts.scrape
          : await settlePaneRead(flight.paneId);
      const stripped = stripAnsi(raw);
      const t = truncateTail(stripped, 200_000);
      output = t.text;
      truncated = t.truncated;
    } catch (e) {
      output = `(pane.read failed: ${e instanceof Error ? e.message : e})`;
      if (status === "done") status = "failed";
      reason = reason ?? "pane_read_failed";
    }

    // PLAN 0.23.6: summary from chrome-filtered input only; output body unfiltered (M-1).
    const summary =
      status === "done"
        ? (
            stripTuiChrome(output)
              .trim()
              .split(/\r?\n/)
              .filter(Boolean)
              .slice(-1)[0] ?? "done"
          ).slice(0, 900)
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
      ...(opts?.note
        ? { note: opts.note.slice(0, 500) }
        : {}),
    };

    // Order invariant (0.23.8): flight already removed+pruned by caller →
    // send result → best-effort close only on success + final status done.
    const sent = await sendResult(flight.fromPeerId, payload);
    if (
      opts?.closePane === true &&
      status === "done" &&
      sent &&
      (cfg.paneCleanup ?? "auto") !== "keep"
    ) {
      try {
        await herdr.request("pane.close", { pane_id: flight.paneId });
      } catch {
        /* best-effort — must not affect result delivery */
      }
    }
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

  /**
   * Returns true only when the handoff was accepted. PLAN 0.23.8 uses this so
   * pane.close never runs after a failed/missing result send.
   */
  async function sendResult(
    toPeerId: string,
    payload: CardResultPayload,
  ): Promise<boolean> {
    if (!toPeerId) {
      log("sendResult: missing toPeerId");
      return false;
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
      return true;
    } catch (e) {
      log("sendResult failed:", e);
      return false;
    }
  }

  let stopped = false;
  async function stop(): Promise<void> {
    if (stopped) return;
    stopped = true;
    clearInterval(pollTimer);
    // PLAN 0.23.7: drop any still-running poll timers on bridge stop.
    for (const f of flights.values()) {
      clearStillRunningState(f);
    }
    flights.clear();
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
