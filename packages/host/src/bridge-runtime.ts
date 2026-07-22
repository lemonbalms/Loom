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
  wrapDispatchedPrompt,
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
  HerdrRpcError,
  stripAnsi,
  HERDR_PROTOCOL_EXPECTED,
  type HerdrAgentStarted,
} from "./herdr-client";
import { ResultIssuerRegistry } from "./result-issuer";
import {
  QuarantineStore,
  type QuarantineKey,
} from "./result-quarantine";
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
import {
  appendHookSettingsArgv,
  appendHookTelemetry,
  clearHookHintOnWorking,
  hookSocketPath,
  maybeAppendCompletionFallback,
  shouldCorrectCompletionToBlocked,
  startHookListener,
  stopAllowsStillRunningMaxBypass,
  type HookHint,
  type HookListener,
} from "./hook-sensor";

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
/**
 * Bounded protocol-17 Enter nudge for agent.send_keys only.
 * Fixture has no named key vocabulary — measured CR only; not exported.
 */
const AGENT_SEND_KEYS_CR_NUDGE: string[] = ["\r"];
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
/**
 * PLAN 0.23.11 ③⑤ shared: pure timing line only (full-line match).
 * Covers composite `1m49s` live form; mixed "Worked for 20s. 1 command still
 * running." does not match (still-running indicator line stays unskipped).
 */
export const WORKED_TIMING_LINE_RE =
  /^Worked for (?:\d+h)?(?:\d+m)?\d+(?:\.\d+)?s\.?$/;
/**
 * PLAN 0.23.11 라이브 보정 2(Deviations §0.23.11): claude TUI variable-verb
 * timing line (`✻ Sautéed for 9s`, `✻ Churned for 15s`, …). Full-line match
 * only. Used by selectCardSummaryLine skip only — hasStillRunningIndicator
 * supersession keeps WORKED_TIMING_LINE_RE alone (✻ is not grok completion
 * evidence). Verb is `\p{L}+` (not ASCII `[A-Za-z]+`) so live accented
 * forms like Sautéed full-match.
 */
export const CLAUDE_TIMING_LINE_RE =
  /^✻\s+\p{L}+ for (?:\d+h)?(?:\d+m\s?)?\d+(?:\.\d+)?s\.?$/u;
/** R30 M-1: Claude Ink folds multi-line paste into a placeholder — treat as hit. */
const PASTE_PLACEHOLDER_MARKER = "[Pasted text";
const PROBE_TAIL_CHARS = 48;

/** Trim + strip trailing cursor-block residue (live scrape `█`). */
function cleanTimingCandidate(line: string): string {
  return line.trim().replace(/[\s█]+$/u, "");
}

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
  // PLAN 0.23.11 라이브 보정 3(Deviations §0.23.11): claude effort hint line
  " · /effort",
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
 * PLAN 0.23.11 ①: + claude statusline (` │ ` + ⚡/🧠 co-presence).
 * PLAN 0.23.11 라이브 보정(Deviations §0.23.11): bare composer `❯` alone.
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
    // PLAN 0.23.11 라이브 보정(Deviations §0.23.11): claude TUI bare composer
    // line (solo ❯ without box `│`). Exact-line only — preserve "❯ text".
    if (trimmed === "❯") continue;
    if (KEY_HINT_MARKERS.some((m) => line.includes(m))) continue;
    // PLAN 0.23.11 ①: claude statusline — ` │ ` segment sep + ⚡ or 🧠.
    // U+2502 (box light vertical), not ASCII |. Model name not hardcoded.
    if (line.includes(" │ ") && (line.includes("⚡") || line.includes("🧠"))) {
      continue;
    }
    kept.push(line);
  }
  while (kept.length > 0 && kept[kept.length - 1]!.trim() === "") {
    kept.pop();
  }
  return kept.join("\n");
}

/**
 * PLAN 0.23.12 ⓐ: trailing TUI right-render timestamp (`  10:50 AM`).
 * Requires ≥2 spaces (TUI signature) — single-space `… at 10:50 AM` kept.
 */
const TUI_TRAILING_TIMESTAMP_RE = /\s{2,}\d{1,2}:\d{2} [AP]M\s*$/;

/**
 * PLAN 0.23.12 ⓐ / R36 L-1: local refine for selectCardSummaryLine only.
 * Order fixed: trim/cursor-block first, then trailing timestamp strip
 * (█ at end would break `[AP]M\s*$` anchor). Not applied to cleanTimingCandidate
 * (shared with ⑤ supersession) or stripTuiChrome / card output body.
 */
function refineSummaryCandidate(line: string): string {
  return cleanTimingCandidate(line).replace(TUI_TRAILING_TIMESTAMP_RE, "");
}

/**
 * PLAN 0.23.11 ③: pick card summary from chrome-filtered text — walk end→start
 * skipping pure timing lines; fallback to last non-empty if all skipped.
 * PLAN 0.23.11 라이브 보정 2(Deviations §0.23.11): also skip claude ✻-verb
 * timing lines (CLAUDE_TIMING_LINE_RE).
 * PLAN 0.23.12 ⓐ: strip trailing TUI timestamp on skip-judge + all return paths
 * (incl. all-skipped fallback — R36 L-1).
 */
export function selectCardSummaryLine(chromeFiltered: string): string {
  const lines = chromeFiltered
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) return "done";
  for (let i = lines.length - 1; i >= 0; i--) {
    // Skip-judge uses refined candidate so timestamped timing lines skip too.
    const refined = refineSummaryCandidate(lines[i]!);
    if (
      WORKED_TIMING_LINE_RE.test(refined) ||
      CLAUDE_TIMING_LINE_RE.test(refined)
    ) {
      continue;
    }
    return refined.slice(0, 900);
  }
  // R36 L-1: fallback return also strips trailing timestamp (no re-leak).
  return refineSummaryCandidate(lines[lines.length - 1] ?? "done").slice(0, 900);
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

/**
 * PLAN 0.28.1 / R46 M-1: structured stall only — no message regex.
 * agent_prompt_stalled means no observed state transition, not proof of
 * non-submission. Callers must probe/verify, not reissue immediately.
 */
function isAgentPromptStalled(e: unknown): boolean {
  return e instanceof HerdrRpcError && e.code === "agent_prompt_stalled";
}

/**
 * PLAN 0.27.0: result-send phase names (lock 9). Not a full 12-element phase
 * registry (that is [(C) 본체]); only the send/ACK boundary names we need.
 */
type ResultSendPhase =
  | "result_sending"
  | "result_relay_accepted"
  | "send_unknown"
  | "presence_unknown";

type Flight = {
  cardId: string;
  fromPeerId: string;
  dispatchHandoffId: string;
  paneId: string;
  /**
   * Unique agent.start name for this attempt. Protocol-17 submission ops
   * (agent.prompt / agent.send_keys) must target this name — not paneId.
   * Pane IDs remain for pane.read, events, layout, cleanup, and pane.close.
   */
  agentTarget: string;
  terminalId: string;
  /**
   * Attempt-axis seq (from cardSeq) — agent name uniqueness / hook socket path.
   * Result *payload* seq is owned by the dispatch-scoped issuer (0.27.0).
   */
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
  /**
   * PLAN 0.26.0 M-2 ①: single-slot last-event-wins hook hint (no payload body).
   * Cleared on herdr working re-entry (M-2 ②). Hint-only — never auto close.
   */
  hookHint?: HookHint;
  /** PLAN 0.26.0 D4: attempt-scoped socket listener; closed on flight teardown. */
  hookListener?: HookListener;
  /** PLAN 0.26.0 D6(b): hookSensor active (cfg.hookSensor && agentKind claude). */
  hookSensorActive?: boolean;
  /**
   * D6(b): whether startHookListener succeeded at spawn.
   * Preserved after dispose — do not use hookListener truthiness (cleared before finishCard).
   */
  hookListenerEstablished?: boolean;
  /** D6(b): fallback telemetry already recorded (exactly-once across spawn + done). */
  hookFallbackRecorded?: boolean;
  /**
   * PLAN 0.27.0 lock 5: lifecycle CAS for Flight-backed completion side-effects.
   * Winner alone may call sendResult (together with issuer.acquire).
   * Not a phase — boolean ownership, same shape as stillRunningDeferral.
   */
  flightSideEffectOwner?: boolean;
  /**
   * PLAN 0.27.0 lock 5: terminal during result_sending latches here —
   * no competing failed result. Separate field, not a phase (union outside).
   */
  terminalPending?: { source: string; at: string };
  /** PLAN 0.27.0: send/ACK boundary phase (lock 9 naming). */
  resultPhase?: ResultSendPhase;
  /** PLAN 0.27.0 lock 9: set when strict ACK accepted (not tower apply). */
  relayAcceptedAt?: string;
};

/**
 * PLAN 0.23.7: detect "N command(s) still running" in the last 10 non-empty
 * lines of a stripAnsi scrape (whitespace-normalized, case-insensitive).
 * Tail-only to avoid false positives from brief/lessons body quotes.
 * PLAN 0.23.11 ⑤ / R35 M-1: line-anchored supersession — if the last
 * indicator-bearing line is followed by a pure timing line (③ shared RE),
 * treat indicator as cleared. Joined-substring supersession is forbidden.
 */
export function hasStillRunningIndicator(scrape: string): boolean {
  const text = stripAnsi(scrape);
  const nonEmpty = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const tail = nonEmpty.slice(-10);
  // Detection (unchanged): normalize whitespace across the tail block.
  const normalized = tail.join(" ").replace(/\s+/g, " ");
  let present = false;
  for (const re of STILL_RUNNING_PATTERNS) {
    if (re.test(normalized)) {
      present = true;
      break;
    }
  }
  if (!present) return false;

  // Supersession (R35 M-1 line-anchored): last per-line indicator match index.
  let lastIndicatorIdx = -1;
  for (let i = 0; i < tail.length; i++) {
    const lineNorm = tail[i]!.replace(/\s+/g, " ");
    for (const re of STILL_RUNNING_PATTERNS) {
      if (re.test(lineNorm)) {
        lastIndicatorIdx = i;
        break;
      }
    }
  }
  // Cannot pin an indicator-bearing line (e.g. wrap split) → no supersession.
  if (lastIndicatorIdx < 0) return true;

  for (let i = lastIndicatorIdx + 1; i < tail.length; i++) {
    if (WORKED_TIMING_LINE_RE.test(cleanTimingCandidate(tail[i]!))) {
      return false;
    }
  }
  return true;
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
  /**
   * Unique agent.start name for this conv worker. Protocol-17 submission ops
   * (agent.prompt / agent.send_keys) must target this name — not paneId.
   * Pane IDs remain for pane.read, events, layout, cleanup, and pane.close.
   */
  agentTarget: string;
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

/** Stable log/counter key for a result handoff whose delivery was not acked. */
export const RESULT_DELIVERY_UNCONFIRMED = "result_delivery_unconfirmed";

let resultDeliveryUnconfirmedCount = 0;

/** Process-wide count of unacked result handoffs (observability only). */
export function resultDeliveryUnconfirmed(): number {
  return resultDeliveryUnconfirmedCount;
}

/** Test helper — resets the observability counter. */
export function resetResultDeliveryUnconfirmed(): void {
  resultDeliveryUnconfirmedCount = 0;
}

/**
 * Record an unacked result handoff. Pure observability: callers proceed on the
 * same path they took before, so this must never influence control flow.
 */
export function recordResultDeliveryUnconfirmed(d: {
  cardId: string;
  seq?: number;
  reason?: string;
}): void {
  resultDeliveryUnconfirmedCount += 1;
  log(
    RESULT_DELIVERY_UNCONFIRMED,
    JSON.stringify({
      event: RESULT_DELIVERY_UNCONFIRMED,
      cardId: d.cardId,
      ...(d.seq !== undefined ? { seq: d.seq } : {}),
      ...(d.reason !== undefined ? { reason: d.reason } : {}),
      count: resultDeliveryUnconfirmedCount,
    }),
  );
}

/**
 * PLAN 0.28.0 G-10: herdr event for a pane with no card/conv flight
 * (typical after removeCardFlight). Observability only — no recovery authority.
 */
export const FLIGHT_MAP_MISS = "flight_map_miss";

let flightMapMissCount = 0;

/** Process-wide count of inert flight-map-miss herdr events. */
export function flightMapMiss(): number {
  return flightMapMissCount;
}

/** Test helper — resets the G-10 observability counter. */
export function resetFlightMapMiss(): void {
  flightMapMissCount = 0;
}

function recordFlightMapMiss(d: {
  paneId: string;
  event: string;
  ev: string;
}): void {
  flightMapMissCount += 1;
  log(
    FLIGHT_MAP_MISS,
    JSON.stringify({
      event: FLIGHT_MAP_MISS,
      paneId: d.paneId,
      herdrEvent: d.event,
      ev: d.ev,
      count: flightMapMissCount,
    }),
  );
}

/**
 * PLAN 0.27.0 / 0.28.0 strict ACK classifier (pure, module-scope for G-11).
 * status ∈ {queued, delivered} ∧ recipientCount === 1 → accepted;
 * every other shape → send_unknown. No message-regex behavioral split.
 */
export function classifyAck(ack: {
  status: string;
  recipientCount: number;
}): "accepted" | "send_unknown" {
  if (
    (ack.status === "queued" || ack.status === "delivered") &&
    ack.recipientCount === 1
  ) {
    return "accepted";
  }
  return "send_unknown";
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
  /** Attempt-axis only (agent name / hook sock). Result payload seq → issuer. */
  const cardSeq = new Map<string, number>();
  const processedHandoffs = new Set<string>();
  const convFlights = new Map<string, ConvFlight>(); // paneId → conv flight
  const convPaneByConvId = new Map<string, string>(); // convId → paneId
  /** PLAN 0.27.0: dispatch-scoped result issuers (receipt-time create). */
  const issuers = new ResultIssuerRegistry();
  /** PLAN 0.27.0: durable quarantine for send_unknown / presence_unknown. */
  const quarantine = new QuarantineStore({ profile });
  quarantine.load();

  /**
   * PLAN 0.28.0 M5 / U3: process-local observation of card panes preserved after
   * a Flight-backed result path. Count-only on status RPC — never identities,
   * never closes, never recovery/authority. Does not reconstruct panes from a
   * prior bridge process. Cleared on stop.
   */
  const preservedCardPaneIds = new Set<string>();
  /** Pane ids already observed terminal this process (closed/exited). */
  const terminalObservedPaneIds = new Set<string>();

  function noteTerminalPaneObservation(paneId: string): void {
    if (!paneId) return;
    terminalObservedPaneIds.add(paneId);
    preservedCardPaneIds.delete(paneId);
  }

  function notePreservedCardPane(paneId: string | undefined): void {
    if (!paneId) return;
    if (terminalObservedPaneIds.has(paneId)) return;
    preservedCardPaneIds.add(paneId);
  }

  function isTerminalPaneEvent(ev: string, event: string): boolean {
    return (
      ev === "pane_closed" ||
      event === "pane.closed" ||
      ev === "pane_exited" ||
      event === "pane.exited"
    );
  }

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
        const body = (await req.json()) as {
          op?: string;
          cardId?: string;
          dispatchHandoffId?: string;
          /** Optional tagged key: {tag:"seq",seq:n} | {tag:"presence"} */
          key?: { tag?: string; seq?: number };
        };
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
            // PLAN 0.23.8 / 0.28.0: conv-close policy only (card never auto-closes)
            paneCleanup: cfg.paneCleanup ?? "auto",
            // PLAN 0.23.9 worker pane placement policy
            panePlacement: cfg.panePlacement ?? "pool",
            // PLAN 0.28.0 M3: unresolved durable quarantine count (U6)
            quarantineUnresolved: quarantine.unresolvedCount(),
            // PLAN 0.28.0 M5: observation-only count of preserved card panes (U3)
            preservedCardPanes: preservedCardPaneIds.size,
          });
        }
        // PLAN 0.28.0 M3: operator quarantine ack against this process's store
        // (clears timer + in-memory unresolved — never a second local store).
        if (body.op === "quarantine_ack") {
          const cardId =
            typeof body.cardId === "string" ? body.cardId.trim() : "";
          const dispatchHandoffId =
            typeof body.dispatchHandoffId === "string"
              ? body.dispatchHandoffId.trim()
              : "";
          if (!cardId || !dispatchHandoffId) {
            return Response.json(
              {
                ok: false,
                op: "quarantine_ack",
                error: "invalid_args",
                message:
                  "cardId and dispatchHandoffId are required",
              },
              { status: 400 },
            );
          }
          let key: QuarantineKey | undefined;
          if (body.key != null && typeof body.key === "object") {
            if (body.key.tag === "presence") {
              key = { tag: "presence" };
            } else if (
              body.key.tag === "seq" &&
              typeof body.key.seq === "number" &&
              Number.isInteger(body.key.seq) &&
              body.key.seq >= 0
            ) {
              key = { tag: "seq", seq: body.key.seq };
            } else {
              return Response.json(
                {
                  ok: false,
                  op: "quarantine_ack",
                  error: "invalid_args",
                  message: "key must be {tag:\"presence\"} or {tag:\"seq\",seq:N}",
                },
                { status: 400 },
              );
            }
          }
          const result = quarantine.ackOperator({
            cardId,
            dispatchHandoffId,
            key,
          });
          if (!result.ok) {
            return Response.json({
              ok: false,
              op: "quarantine_ack",
              error: result.error,
              message: result.message,
              ...(result.matches ? { matches: result.matches } : {}),
              quarantineUnresolved: quarantine.unresolvedCount(),
            });
          }
          return Response.json({
            ok: true,
            op: "quarantine_ack",
            key: result.key,
            quarantineUnresolved: quarantine.unresolvedCount(),
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
      // PLAN 0.27.0: issuer at receipt (Flight-less :850 — cardId may degrade to task_0)
      const looseId = extractCardIdLoose(att.content) ?? "task_0";
      issuers.getOrCreate(looseId, h.id);
      processedHandoffs.add(h.id);
      const claim = await client.claimHandoff(h.id, "claim");
      if (!claim.ok) return;
      await sendFailedResult({
        cardId: looseId,
        fromPeerId,
        dispatchHandoffId: h.id,
        reason: "payload_invalid",
      });
      return;
    }

    // PLAN 0.27.0: issuer created at handoff RECEIPT (before spawn) — sole passthrough.
    issuers.getOrCreate(payload.cardId, h.id);

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
   * PLAN 0.23.11 ④: serialize all spawnWorkerAgent entries via in-memory
   * promise chain so pane.list → spawn → workerPool updates are atomic across
   * concurrent dispatches. Chain always resolves (exceptions never poison next).
   */
  let spawnChain: Promise<void> = Promise.resolve();

  /**
   * PLAN 0.23.9 ⑧ / 0.28.1: spawn a worker agent into the bridge-local pool tab.
   * Protocol 17: shell pane first (tab.create / pane.split with cwd+env), then
   * named agent.start{name,kind,pane_id,args?}. pane.list is SSOT; fail-open
   * to one unhinted pane-first spawn on any pool path failure. `"legacy"` uses
   * the same unhinted form (no protocol-16 fields).
   * PLAN 0.23.11 ④: entry serialized via spawnChain (legacy included).
   * `kind`/`args` come from allowlisted local argv (executable is never sent).
   */
  async function spawnWorkerAgent(opts: {
    name: string;
    kind: string;
    args?: string[];
    env?: Record<string, string>;
    cwd?: string;
  }): Promise<HerdrAgentStarted> {
    const run = spawnChain.then(() => spawnWorkerAgentBody(opts));
    spawnChain = run.then(
      () => {},
      () => {},
    );
    return run;
  }

  /**
   * PLAN 0.23.12 ⓑ / R36 L-2: best-effort equalize pool pane widths after
   * spawn when ≥2 pool panes. Runs inside spawnChain (serial) before return —
   * no fire-and-forget. Fail-open: any step aborts equalization only.
   */
  async function equalizePoolPaneWidths(): Promise<void> {
    if (!workerPool || workerPool.paneIds.size < 2) return;
    const poolIds = workerPool.paneIds;
    const anyId = [...poolIds][0];
    if (!anyId) return;
    try {
      let layout = await herdr.paneLayout(anyId);
      // Guard: any non-right split → not a pure right-split chain.
      if (layout.splits.some((s) => s.direction !== "right")) {
        log(
          "pane equalize skip: non-right split in layout",
        );
        return;
      }
      let poolPanes = layout.panes
        .filter((p) => poolIds.has(p.paneId))
        .sort((a, b) => a.rect.x - b.rect.x);
      // Guard: layout missing some pool panes.
      if (poolPanes.length !== poolIds.size) {
        log(
          `pane equalize skip: pane count mismatch layout=${poolPanes.length} pool=${poolIds.size}`,
        );
        return;
      }
      const N = poolPanes.length;
      if (N < 2) return;
      // k = 1..N-1 (1-indexed): target ratio 1/(N−k+1); 0-indexed i → 1/(N−i)
      for (let i = 0; i < N - 1; i++) {
        const pane = poolPanes[i]!;
        const x = pane.rect.x;
        // L-2(i): x-match must be unique — ambiguous topology aborts.
        const matches = layout.splits.filter((s) => s.rect.x === x);
        if (matches.length !== 1) {
          log(
            `pane equalize abort: x-match count=${matches.length} for pane ${pane.paneId}`,
          );
          return;
        }
        const split = matches[0]!;
        // L-2(iii): use layout split.ratio field directly (no width-derived).
        const current = split.ratio;
        const target = 1 / (N - i);
        const delta = target - current;
        if (Math.abs(delta) < 0.01) continue;
        const direction = delta > 0 ? "right" : "left";
        const amount = Math.abs(delta);
        layout = await herdr.paneResize({
          paneId: pane.paneId,
          direction,
          amount,
        });
        // Refresh pool panes from response layout (no extra layout read).
        poolPanes = layout.panes
          .filter((p) => poolIds.has(p.paneId))
          .sort((a, b) => a.rect.x - b.rect.x);
        if (
          poolPanes.length !== N ||
          layout.splits.some((s) => s.direction !== "right")
        ) {
          log("pane equalize abort: layout changed mid-equalize");
          return;
        }
      }
    } catch (e) {
      log(
        `pane equalize failed (spawn result kept): ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  async function spawnWorkerAgentBody(opts: {
    name: string;
    kind: string;
    args?: string[];
    env?: Record<string, string>;
    cwd?: string;
  }): Promise<HerdrAgentStarted> {
    /** Named start on an existing shell pane — env/cwd already on that pane. */
    const startOnPane = (paneId: string): Promise<HerdrAgentStarted> => {
      const startOpts: {
        name: string;
        kind: string;
        paneId: string;
        args?: string[];
      } = {
        name: opts.name,
        kind: opts.kind,
        paneId,
      };
      if (opts.args !== undefined && opts.args.length > 0) {
        startOpts.args = opts.args;
      }
      return herdr.agentStart(startOpts);
    };

    /**
     * Protocol-17 unhinted pane-first form (legacy + every pool fallback):
     * pane.split direction right with cwd/env/focus:false and no invented
     * target, then named agent.start on the returned pane. Fail-visible.
     */
    const unhintedFallback = async (why: string): Promise<HerdrAgentStarted> => {
      log(`pane placement fallback (unhinted): ${why}`);
      const split = await herdr.paneSplit({
        direction: "right",
        cwd: opts.cwd,
        env: opts.env,
        focus: false,
      });
      return startOnPane(split.paneId);
    };

    if ((cfg.panePlacement ?? "pool") === "legacy") {
      return unhintedFallback("panePlacement=legacy");
    }

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
            // Deterministic live pool pane as split target; always right split.
            const targetPaneId = [...liveIds].sort()[0]!;
            try {
              const split = await herdr.paneSplit({
                targetPaneId,
                direction: "right",
                cwd: opts.cwd,
                env: opts.env,
                focus: false,
              });
              const agent = await startOnPane(split.paneId);
              workerPool.paneIds.add(agent.pane_id);
              // PLAN 0.23.12 ⓑ: equalize inside spawnChain before return (L-2 ii).
              if (workerPool.paneIds.size >= 2) {
                await equalizePoolPaneWidths();
              }
              return agent;
            } catch (e) {
              return unhintedFallback(
                `hinted spawn failed: ${e instanceof Error ? e.message : e}`,
              );
            }
          } else if (workerPool) {
            // Tracked set empty but tab listed: use pane.list evidence, else abandon.
            const tabPane = listed.find((p) => p.tabId === workerPool!.tabId);
            if (tabPane) {
              try {
                const split = await herdr.paneSplit({
                  targetPaneId: tabPane.paneId,
                  direction: "right",
                  cwd: opts.cwd,
                  env: opts.env,
                  focus: false,
                });
                const agent = await startOnPane(split.paneId);
                workerPool.paneIds.add(agent.pane_id);
                if (workerPool.paneIds.size >= 2) {
                  await equalizePoolPaneWidths();
                }
                return agent;
              } catch (e) {
                workerPool = null;
                return unhintedFallback(
                  `empty-pool spawn failed: ${e instanceof Error ? e.message : e}`,
                );
              }
            }
            // No pane evidence in the pool tab — abandon stale pool, new tab.
            workerPool = null;
          }
        }
      }

      // New pool tab: tab.create (cwd+env) → named start on root shell pane.
      // Do not create a second pane just to close the root (protocol 17).
      try {
        const tab = await herdr.tabCreate({
          workspaceId: cfg.paneWorkspaceId,
          label: "loom-workers",
          cwd: opts.cwd,
          env: opts.env,
        });
        workerPool = { tabId: tab.tabId, paneIds: new Set() };
        try {
          const agent = await startOnPane(tab.rootPaneId);
          workerPool.paneIds.add(agent.pane_id);
          // First worker alone — equalize skipped (size < 2).
          return agent;
        } catch (e) {
          // Shell pane may remain; no destructive broad cleanup (PANE-DEATH).
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
    let argv = resolveAgentArgv(cfg, payload.agentKind);
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

    // PLAN 0.26.0 D2/D4: opt-in claude hook sensor — attempt-scoped socket
    // listener + --settings inject. Fail-open if bind fails (D5).
    let pendingHookListener: HookListener | undefined;
    let flightRef: Flight | null = null;
    // D6(b): locals captured before flight creation; carried onto Flight.
    let hookSensorActive = false;
    let hookListenerEstablished = false;
    let hookFallbackRecorded = false;
    if (cfg.hookSensor === true && payload.agentKind === "claude") {
      hookSensorActive = true;
      const sockPath = hookSocketPath(payload.cardId, seq);
      const started = await startHookListener({
        socketPath: sockPath,
        onEvent: (hint) => {
          const f = flightRef;
          // M-1 ③ late event: drop if flight gone or superseded
          if (!f || flights.get(f.paneId) !== f) return;
          f.hookHint = hint;
          appendHookTelemetry({ type: "hook_hint", kind: hint.kind });
          if (hint.kind === "permission_prompt") {
            appendHookTelemetry({
              type: "permission_prompt",
              kind: hint.kind,
            });
          }
          // M-2 ④ Stop → accelerate still-running poll (input only)
          if (
            hint.kind === "Stop" &&
            f.stillRunningDeferral &&
            f.paneId
          ) {
            scheduleStillRunningPoll(f, f.paneId, /* immediate */ 0);
          }
        },
        onMalformed: () => {
          /* silent ignore + optional counter via fallback class */
          appendHookTelemetry({
            type: "fallback",
            reason: "malformed_payload",
          });
          // D6(b) exactly-once: spawn/runtime malformed blocks done re-append
          if (flightRef) flightRef.hookFallbackRecorded = true;
        },
      });
      hookListenerEstablished = started.ok;
      if (started.ok) {
        pendingHookListener = started.listener;
        argv = appendHookSettingsArgv(argv, sockPath);
      } else {
        appendHookTelemetry({
          type: "fallback",
          reason: started.reason,
        });
        // D6(b) exactly-once: spawn bind/path fallback already counted
        hookFallbackRecorded = true;
      }
    }

    // Unique agent.start name — generated once, stored on flight, used for
    // every protocol-17 submission op (not optional response agent.name).
    const agentTarget = `loom-${payload.cardId.slice(0, 20)}-${seq}`;
    let agent: HerdrAgentStarted;
    try {
      agent = await spawnWorkerAgent({
        name: agentTarget,
        kind: payload.agentKind,
        // Executable stays local allowlist only — protocol-17 args are the tail.
        args: argv.slice(1),
        env: {
          LOOM_CARD: payload.cardId,
          ...(pendingHookListener
            ? { LOOM_HOOK_SOCK: pendingHookListener.socketPath }
            : {}),
        },
        cwd: payload.cwd,
      });
    } catch (e) {
      pendingHookListener?.close();
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
      agentTarget,
      terminalId: agent.terminal_id,
      seq,
      startedAt,
      sawWorking: false,
      hookListener: pendingHookListener,
      ...(hookSensorActive
        ? {
            hookSensorActive: true,
            hookListenerEstablished,
            hookFallbackRecorded,
          }
        : {}),
    };
    flightRef = flight;
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
      // PLAN 0.27.0: cleanup early, send, then flights.delete (order reverse)
      if (!tryAcquireFlightSideEffect(flight)) return;
      disposeCardFlight(agent.pane_id, flight);
      await sendFailedResult({
        cardId: payload.cardId,
        fromPeerId,
        dispatchHandoffId,
        reason: "events_subscribe_failed",
        detail: e instanceof Error ? e.message : String(e),
        paneId: agent.pane_id,
        flight,
      });
      removeCardFlight(agent.pane_id, flight);
      // PLAN 0.28.0 U3: card auto pane.close removed (events_subscribe_failed).
      // Pane remains for operator cleanup; result already failed above.
      return;
    }

    // PLAN 0.28.1: cache exact inject string before send (stalled path reuses it)
    const prompt = wrapDispatchedPrompt(payload.prompt);
    try {
      // Atomic agent.prompt (opaque text); stalled ≠ certain failure
      // Protocol-17 submission target = unique agent.start name (not pane_id)
      await herdr.injectPromptAndSubmit(agentTarget, prompt);
    } catch (e) {
      if (isAgentPromptStalled(e)) {
        // Uncertain submission — fixed branch log only (no message/prompt).
        log("card inject agent_prompt_stalled (uncertain; probe next)");
      } else {
        if (!tryAcquireFlightSideEffect(flight)) return;
        disposeCardFlight(agent.pane_id, flight);
        herdr.eventsPrune(agent.pane_id);
        await sendFailedResult({
          cardId: payload.cardId,
          fromPeerId,
          dispatchHandoffId,
          reason: "prompt_inject_failed",
          detail: e instanceof Error ? e.message : String(e),
          paneId: agent.pane_id,
          flight,
        });
        removeCardFlight(agent.pane_id, flight);
        return;
      }
    }

    // PLAN 0.23.5: pass the exact inject cache string (no re-derive — R30 L-1)
    await verifyInjectOrRetry({
      kind: "card",
      paneId: agent.pane_id,
      agentTarget,
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
      // R23 M-2 applies every turn (R24/R25 L-4), not just the first prompt.
      // Cache before send so stalled path reuses the exact string (R30 L-1).
      const prompt = wrapDispatchedPrompt(payload.text);
      try {
        flight.sawWorking = false;
        // Protocol-17 submission target = unique agent.start name (not pane_id)
        await herdr.injectPromptAndSubmit(flight.agentTarget, prompt);
      } catch (e) {
        if (isAgentPromptStalled(e)) {
          // Fixed branch log only — no e.message / error object / prompt.
          log("conv turn inject agent_prompt_stalled (uncertain; probe next)");
        } else {
          log("conv turn inject failed:", e);
          return;
        }
      }
      // PLAN 0.23.5: per-turn probe from this inject's cache string (R30 L-1)
      await verifyInjectOrRetry({
        kind: "conv",
        paneId: flight.paneId,
        agentTarget: flight.agentTarget,
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
    // Unique agent.start name — generated once, stored on flight, used for
    // every protocol-17 submission op (not optional response agent.name).
    const agentTarget = `loom-conv-${payload.convId.slice(5, 21)}`;
    let agent: HerdrAgentStarted;
    try {
      agent = await spawnWorkerAgent({
        name: agentTarget,
        kind: payload.scope.agentKind,
        args: argv.slice(1),
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
      agentTarget,
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

    // Goal doubles as the first turn's prompt — the worker starts on
    // accept, mirroring card dispatch's prompt-on-start.
    // R28 L-2 / §5.1: bridge-authored artifact convention OUTSIDE the
    // dispatched wrapper (bridge authors it; goal stays data-not-instructions).
    // Cache exact inject string before send so stalled path reuses it (R30 L-1).
    const untrusted = wrapDispatchedPrompt(payload.goal);
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
    const prompt = `${untrusted}${artifactConvention}`;
    try {
      // Protocol-17 submission target = unique agent.start name (not pane_id)
      await herdr.injectPromptAndSubmit(agentTarget, prompt);
    } catch (e) {
      if (isAgentPromptStalled(e)) {
        // Fixed branch log only — no e.message / error object / prompt.
        log("conv initial inject agent_prompt_stalled (uncertain; probe next)");
      } else {
        log("conv initial inject failed:", e);
        convFlights.delete(agent.pane_id);
        convPaneByConvId.delete(payload.convId);
        herdr.eventsPrune(agent.pane_id);
        return;
      }
    }
    await verifyInjectOrRetry({
      kind: "conv",
      paneId: agent.pane_id,
      agentTarget,
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
   * PLAN 0.23.5 / 0.28.1 unified inject verify (card + conv).
   * `prompt` is the exact string last passed to injectPromptAndSubmit — never
   * re-derived (R30 L-1). Full reissue at most once per verify call on positive
   * scrape miss only (R30 M-2 / R46 M-1). Hit (incl. Ink placeholder) and
   * read-fail prohibit full reissue — bounded agent.send_keys nudge only.
   * Flight gone between timeout and action = success (R30 L-3).
   * Timing: existing submitVerify.waitMs/retries only — no new constants.
   */
  async function verifyInjectOrRetry(opts: {
    kind: "card" | "conv";
    paneId: string;
    /** Unique agent.start name — sole target for agent.prompt / agent.send_keys. */
    agentTarget: string;
    prompt: string;
  }): Promise<void> {
    const { kind, paneId, agentTarget, prompt } = opts;
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
        // paneId only — pane.read coordinate, not submission target
        const scrape = await herdr.paneRead(paneId, {
          source: "recent",
          lines: 60,
        });
        probe = isInjectProbeHit(scrape, prompt) ? "hit" : "miss";
      } catch {
        // Scrape failure ≠ inject failure — nudge only (no full reissue)
        probe = "read-fail";
      }
      lastProbe = probe;

      if (probe === "miss" && !reinjectUsed) {
        action = "reinject";
        reinjectUsed = true;
      } else {
        // hit (incl. placeholder), read-fail, or miss after reinject budget → nudge
        action = "cr";
      }

      // F-3 / L-3: re-check after paneRead wait — flight may have ended mid-RPC
      if (!flightAlive()) return;

      if (action === "reinject") {
        try {
          // Same cached string only — no re-derive (R30 L-1); one atomic prompt
          // Protocol-17 submission target = unique agent.start name (not pane_id)
          await herdr.agentPrompt({ target: agentTarget, text: prompt });
        } catch (e) {
          // Branch-only: round + structural code (or unknown). Never message/prompt.
          log(
            `verify reinject attempt ${attempt} failed: ${e instanceof HerdrRpcError ? e.code : "unknown"}`,
          );
        }
      } else {
        try {
          // Bounded Enter nudge only — never prompt text; not primary inject path
          // Protocol-17 submission target = unique agent.start name (not pane_id)
          await herdr.agentSendKeys({
            target: agentTarget,
            keys: AGENT_SEND_KEYS_CR_NUDGE,
          });
        } catch (e) {
          // Branch-only: round + structural code (or unknown). Never message/prompt.
          log(
            `verify CR attempt ${attempt} failed: ${e instanceof HerdrRpcError ? e.code : "unknown"}`,
          );
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
        if (flight) {
          if (!tryAcquireFlightSideEffect(flight)) {
            // Already owned for result send — do not compete
          } else {
            disposeCardFlight(paneId, flight);
            herdr.eventsPrune(paneId);
            await sendFailedResult({
              cardId: flight.cardId,
              fromPeerId: flight.fromPeerId,
              dispatchHandoffId: flight.dispatchHandoffId,
              reason: "inject_unconfirmed",
              paneId,
              flight,
            });
            removeCardFlight(paneId, flight);
          }
        } else {
          flights.delete(paneId);
          herdr.eventsPrune(paneId);
        }
        // PLAN 0.28.0 U3: card auto pane.close removed (inject_unconfirmed).
        // Pane remains for operator cleanup; failed result already sent above.
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

    // PLAN 0.28.0 G-10: card/conv flight map miss after removeCardFlight — inert
    // observability only (no recovery, no authority, no re-issue).
    recordFlightMapMiss({ paneId, event, ev });
    // M5: map-miss terminal observations also clear preserved-card tracking.
    if (isTerminalPaneEvent(ev, event)) {
      noteTerminalPaneObservation(paneId);
    }
  }

  function clearStillRunningTimers(flight: Flight): void {
    if (flight.stillRunningPollTimer != null) {
      clearTimeout(flight.stillRunningPollTimer);
      flight.stillRunningPollTimer = undefined;
    }
  }

  /** PLAN 0.26.0 D4 ②: close hook listener + unlink on flight teardown. */
  function closeHookListener(flight: Flight): void {
    if (flight.hookListener) {
      try {
        flight.hookListener.close();
      } catch {
        /* best-effort */
      }
      flight.hookListener = undefined;
    }
  }

  function clearStillRunningState(flight: Flight): void {
    clearStillRunningTimers(flight);
    flight.stillRunningDeferral = false;
    flight.stillRunningStartedAt = undefined;
    // Sync with flight disposal: listener must not outlive the flight (M-1).
    closeHookListener(flight);
  }

  /**
   * PLAN 0.27.0: split dispose — timers/listeners cleaned EARLY (leak prevention);
   * `flights.delete` is DEFERRED until after result send (latch premise).
   * Call sites: cleanup resources → send → removeCardFlight.
   */
  function disposeCardFlight(_paneId: string, flight: Flight): void {
    clearStillRunningState(flight);
    // map removal is intentionally deferred to removeCardFlight, after the result send
  }

  function removeCardFlight(paneId: string, flight: Flight): void {
    if (flights.get(paneId) === flight) {
      flights.delete(paneId);
    }
  }

  /** CAS: Flight-backed completion ownership (lock 5 / flightSideEffectOwner). */
  function tryAcquireFlightSideEffect(flight: Flight): boolean {
    if (flight.flightSideEffectOwner) return false;
    flight.flightSideEffectOwner = true;
    flight.resultPhase = "result_sending";
    return true;
  }

  function latchTerminalPending(flight: Flight, source: string): void {
    if (!flight.terminalPending) {
      flight.terminalPending = {
        source,
        at: new Date().toISOString(),
      };
      log(
        `card ${flight.cardId}: terminalPending latch source=${source} (no competing result)`,
      );
    }
  }

  /**
   * Guard for completion-class paths: flight still mapped, not already owned
   * for result send, and (when required) stillRunningDeferral still set.
   * PLAN 0.27.0: CAS ownership boolean is part of every guard (5 sites).
   */
  function guardFlightCompletion(
    paneId: string,
    flight: Flight,
    opts?: { requireDeferral?: boolean },
  ): boolean {
    if (flights.get(paneId) !== flight) return false;
    if (flight.flightSideEffectOwner) return false;
    if (flight.terminalPending) return false;
    if (opts?.requireDeferral && !flight.stillRunningDeferral) return false;
    return true;
  }

  function enterSendUnknown(args: {
    cardId: string;
    dispatchHandoffId: string;
    seq: number;
    reason: string;
    flight?: Flight;
  }): void {
    if (args.flight) {
      args.flight.resultPhase = "send_unknown";
    }
    const key: QuarantineKey = { tag: "seq", seq: args.seq };
    quarantine.enter({
      cardId: args.cardId,
      dispatchHandoffId: args.dispatchHandoffId,
      state: "send_unknown",
      key,
      reason: args.reason,
    });
    log(
      `card ${args.cardId}: send_unknown seq=${args.seq} reason=${args.reason}`,
    );
  }

  function enterPresenceUnknown(args: {
    cardId: string;
    dispatchHandoffId: string;
    reason: string;
    flight?: Flight;
  }): void {
    if (args.flight) {
      args.flight.resultPhase = "presence_unknown";
    }
    quarantine.enter({
      cardId: args.cardId,
      dispatchHandoffId: args.dispatchHandoffId,
      state: "presence_unknown",
      key: { tag: "presence" },
      reason: args.reason,
    });
    log(
      `card ${args.cardId}: presence_unknown reason=${args.reason}`,
    );
  }

  // silence unused-export concern for presence path (structure ready; poll may call later)
  void enterPresenceUnknown;

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
      // Settle failed — fall through to proposeCardVerification which re-reads
      // (read failure still yields needs_verification with error body).
      // PLAN 0.27.0 guard site (~:2003): CAS ownership + flight map check
      if (!guardFlightCompletion(paneId, flight)) return;
      // PLAN 0.26.0 M-2 ③: live permission_prompt corrects completion → blocked
      if (shouldCorrectCompletionToBlocked(flight.hookHint)) {
        if (!tryAcquireFlightSideEffect(flight)) return;
        disposeCardFlight(paneId, flight);
        herdr.eventsPrune(paneId);
        appendHookTelemetry({ type: "agent_blocked_correction" });
        await finishCardFailure(flight, "agent_blocked");
        removeCardFlight(paneId, flight);
        return;
      }
      if (!tryAcquireFlightSideEffect(flight)) return;
      disposeCardFlight(paneId, flight);
      herdr.eventsPrune(paneId);
      await proposeCardVerification(flight);
      removeCardFlight(paneId, flight);
      return;
    }

    // M-1 / PLAN 0.27.0 guard site (~:2019 beginCardCompletion main): CAS + deferral
    if (!guardFlightCompletion(paneId, flight, { requireDeferral: true })) {
      return;
    }

    if (!hasStillRunningIndicator(scrape)) {
      // No indicator → immediate verification proposal; pass scrape (no re-scrape).
      // PLAN 0.28.0 U3: no card auto pane.close (closePane removed).
      // PLAN 0.26.0 M-2 ③: permission_prompt live → correct to agent_blocked
      if (shouldCorrectCompletionToBlocked(flight.hookHint)) {
        if (!tryAcquireFlightSideEffect(flight)) return;
        disposeCardFlight(paneId, flight);
        herdr.eventsPrune(paneId);
        appendHookTelemetry({ type: "agent_blocked_correction" });
        await finishCardFailure(flight, "agent_blocked");
        removeCardFlight(paneId, flight);
        return;
      }
      if (!tryAcquireFlightSideEffect(flight)) return;
      disposeCardFlight(paneId, flight);
      herdr.eventsPrune(paneId);
      await proposeCardVerification(flight, { scrape });
      removeCardFlight(paneId, flight);
      return;
    }

    // Indicator hit → keep flight, enter poll (first re-read after pollMs).
    // Do not close hook listener here — stillRunningDeferral only clears timers.
    clearStillRunningTimers(flight);
    flight.stillRunningStartedAt = Date.now();
    log(
      `card ${flight.cardId}: still-running indicator — deferring completion (poll ${stillRunningPollMs}ms, max ${stillRunningMaxMs}ms)`,
    );
    scheduleStillRunningPoll(flight, paneId);
  }

  function scheduleStillRunningPoll(
    flight: Flight,
    paneId: string,
    delayMs?: number,
  ): void {
    clearStillRunningTimers(flight);
    // PLAN 0.26.0 M-2 ④: Stop accelerates poll schedule (input only).
    const interval =
      delayMs !== undefined
        ? delayMs
        : stopAllowsStillRunningMaxBypass(flight.hookHint)
          ? Math.min(stillRunningPollMs, 1_000)
          : stillRunningPollMs;
    flight.stillRunningPollTimer = setTimeout(() => {
      void (async () => {
        // PLAN 0.27.0 guard site (~:2067): CAS + deferral
        if (!guardFlightCompletion(paneId, flight, { requireDeferral: true })) {
          return;
        }

        const startedAt = flight.stillRunningStartedAt ?? Date.now();
        const elapsed = Date.now() - startedAt;
        // M-2 ④: Stop is poll-acceleration input only — never completes alone
        // while the indicator is still present (AND with scrape clear).

        let scrape: string;
        try {
          scrape = await settlePaneRead(paneId);
        } catch {
          // Read fail mid-poll: if cap not reached, retry next interval; else exhaust.
          // PLAN 0.27.0 guard site (~:2080)
          if (
            !guardFlightCompletion(paneId, flight, { requireDeferral: true })
          ) {
            return;
          }
          if (elapsed >= stillRunningMaxMs) {
            if (!tryAcquireFlightSideEffect(flight)) return;
            const secs = Math.round(stillRunningMaxMs / 1000);
            disposeCardFlight(paneId, flight);
            herdr.eventsPrune(paneId);
            await proposeCardVerification(flight, {
              note: `still_running deferral exhausted (${secs}s)`,
            });
            removeCardFlight(paneId, flight);
          } else {
            scheduleStillRunningPoll(flight, paneId);
          }
          return;
        }

        // PLAN 0.27.0 guard site (~:2096)
        if (!guardFlightCompletion(paneId, flight, { requireDeferral: true })) {
          return;
        }

        if (!hasStillRunningIndicator(scrape)) {
          // Indicator cleared — propose with the scrape that proved clearance (L-1).
          // PLAN 0.28.0 U3: no card auto pane.close.
          // PLAN 0.26.0 M-2 ③: live permission_prompt corrects → blocked
          if (shouldCorrectCompletionToBlocked(flight.hookHint)) {
            if (!tryAcquireFlightSideEffect(flight)) return;
            disposeCardFlight(paneId, flight);
            herdr.eventsPrune(paneId);
            appendHookTelemetry({ type: "agent_blocked_correction" });
            await finishCardFailure(flight, "agent_blocked");
            removeCardFlight(paneId, flight);
            return;
          }
          if (!tryAcquireFlightSideEffect(flight)) return;
          const secs = Math.max(0, Math.round(elapsed / 1000));
          disposeCardFlight(paneId, flight);
          herdr.eventsPrune(paneId);
          await proposeCardVerification(flight, {
            scrape,
            note: `completion deferred ${secs}s (still-running indicator)`,
          });
          removeCardFlight(paneId, flight);
          return;
        }

        // Indicator still present: M-2 ④ Stop alone must NOT complete.
        if (elapsed >= stillRunningMaxMs) {
          // Cap exhausted — fail-visible note, needs_verification with latest scrape.
          // PLAN 0.28.0 U3: no card auto pane.close.
          // PLAN 0.26.0 M-2 ③: live permission_prompt → blocked correction
          if (shouldCorrectCompletionToBlocked(flight.hookHint)) {
            if (!tryAcquireFlightSideEffect(flight)) return;
            disposeCardFlight(paneId, flight);
            herdr.eventsPrune(paneId);
            appendHookTelemetry({ type: "agent_blocked_correction" });
            await finishCardFailure(flight, "agent_blocked");
            removeCardFlight(paneId, flight);
            return;
          }
          if (!tryAcquireFlightSideEffect(flight)) return;
          const secs = Math.round(stillRunningMaxMs / 1000);
          disposeCardFlight(paneId, flight);
          herdr.eventsPrune(paneId);
          await proposeCardVerification(flight, {
            scrape,
            note: `still_running deferral exhausted (${secs}s)`,
          });
          removeCardFlight(paneId, flight);
          return;
        }

        // Still present and under cap — schedule next poll (Stop → faster interval).
        scheduleStillRunningPoll(flight, paneId);
      })();
    }, interval);
  }

  /**
   * PLAN 0.27.0: terminal/completion side-effect runner for the sync hotpath.
   * Ownership is CAS/latch (not await on onHerdrEvent). ACK is consumed inside
   * proposeCardVerification/finishCardFailure/sendFailedResult. Do NOT reintroduce
   * fire-and-forget emission at those call sites — they were converted to
   * awaited/owned completion.
   */
  function scheduleOwnedCardResult(
    paneId: string,
    flight: Flight,
    work: () => Promise<void>,
  ): void {
    // Fire async work after sync CAS; process microtask so hotpath stays sync.
    Promise.resolve()
      .then(work)
      .then(() => {
        removeCardFlight(paneId, flight);
      })
      .catch((e) => {
        log(`card ${flight.cardId}: owned result path error:`, e);
        removeCardFlight(paneId, flight);
      });
  }

  function onCardHerdrEvent(
    flight: Flight,
    paneId: string,
    ev: string,
    event: string,
    d: Record<string, unknown>,
  ): void {
    if (ev === "pane_closed" || event === "pane.closed") {
      // M5: observed terminal — never count this pane as preserved later.
      noteTerminalPaneObservation(paneId);
      // PLAN 0.27.0: if already result_sending, latch only (no second result).
      if (flight.flightSideEffectOwner || flight.resultPhase === "result_sending") {
        latchTerminalPending(flight, "pane_closed");
        // Early timer cleanup only — do not delete flight mid-send
        clearStillRunningTimers(flight);
        return;
      }
      if (!tryAcquireFlightSideEffect(flight)) {
        latchTerminalPending(flight, "pane_closed");
        return;
      }
      // Clean deferral timers before send (test ⑦ / leak guard); flights.delete after send.
      disposeCardFlight(paneId, flight);
      herdr.eventsPrune(paneId);
      scheduleOwnedCardResult(paneId, flight, () =>
        sendFailedResult({
          cardId: flight.cardId,
          fromPeerId: flight.fromPeerId,
          dispatchHandoffId: flight.dispatchHandoffId,
          reason: "pane_closed",
          paneId,
          flight,
        }),
      );
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
        // Cancel poll timers only — keep hook listener for subsequent hints.
        clearStillRunningTimers(flight);
        flight.stillRunningDeferral = false;
        flight.stillRunningStartedAt = undefined;
        log(
          `card ${flight.cardId}: still-running deferral cancelled (working re-entry)`,
        );
      }
      // PLAN 0.26.0 M-2 ②: herdr working re-entry clears stale hook markers
      // (approval grant fires none of the 3 wired events — stale permission_prompt
      // would otherwise poison a later normal done).
      flight.hookHint = clearHookHintOnWorking();
      flight.sawWorking = true;
      return;
    }

    // C1: done may arrive from detection; also accept idle after working, blocked → failed
    if (status === "blocked") {
      // PLAN 0.27.0: latch check on blocked branch too (was missing stillRunningDeferral-only).
      if (flight.flightSideEffectOwner || flight.resultPhase === "result_sending") {
        latchTerminalPending(flight, "blocked");
        clearStillRunningTimers(flight);
        return;
      }
      if (flight.terminalPending) return;
      if (!tryAcquireFlightSideEffect(flight)) {
        latchTerminalPending(flight, "blocked");
        return;
      }
      // M-1: blocked during deferral → clear poll timers then immediate failed.
      // hookHint absence → same path as 0.25.0 (D5 fail-open).
      disposeCardFlight(paneId, flight);
      herdr.eventsPrune(paneId);
      scheduleOwnedCardResult(paneId, flight, () =>
        finishCardFailure(flight, "agent_blocked"),
      );
      return;
    }
    if (status === "done" || (status === "idle" && flight.sawWorking)) {
      // During result_sending, completion-class is no-op (ownership already held).
      if (flight.flightSideEffectOwner || flight.resultPhase === "result_sending") {
        return;
      }
      // PLAN 0.26.0 M-2 ③: live permission_prompt corrects completion-class
      // judgment to agent_blocked (stale/cleared markers → no intervention).
      if (shouldCorrectCompletionToBlocked(flight.hookHint)) {
        if (flight.stillRunningDeferral) {
          // Poll path owns completion while deferral set — leave to poll
          // correction at indicator-clear / exhaust (same decision table).
          return;
        }
        if (!tryAcquireFlightSideEffect(flight)) return;
        disposeCardFlight(paneId, flight);
        herdr.eventsPrune(paneId);
        appendHookTelemetry({ type: "agent_blocked_correction" });
        scheduleOwnedCardResult(paneId, flight, () =>
          finishCardFailure(flight, "agent_blocked"),
        );
        return;
      }
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

  /**
   * PLAN 0.28.0 A1: success-candidate proposal (U1).
   * Emits status:"failed" + reason:"needs_verification" while preserving the
   * real output summary. Issuer acquire → seq → supersede → payload stamp →
   * strict ACK. Never constructs status:"done". Never pane.close (U3).
   */
  async function proposeCardVerification(
    flight: Flight,
    opts?: { scrape?: string; note?: string },
  ): Promise<void> {
    const issuer = issuers.getOrCreate(
      flight.cardId,
      flight.dispatchHandoffId,
    );
    // Flight-backed: lifecycle CAS already held by caller; issuer acquire too.
    if (!issuer.acquire("initial")) {
      log(
        `card ${flight.cardId}: proposeCardVerification issuer.acquire(initial) denied`,
      );
      return;
    }

    let output = "";
    let truncated = false;
    try {
      // PLAN 0.23.6: settle re-read; output body unfiltered (R31 M-1).
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
    }

    // PLAN 0.26.0 D6(b): completion-class scrape fallback telemetry.
    maybeAppendCompletionFallback(flight);

    // Preserve real output summary even though status is failed (U1/A1).
    const summary = selectCardSummaryLine(stripTuiChrome(output));

    const seq = issuer.nextSeq();
    quarantine.supersedePresence({
      cardId: flight.cardId,
      dispatchHandoffId: flight.dispatchHandoffId,
    });

    const payload: CardResultPayload = {
      v: CARD_CONTRACT_VERSION,
      cardId: flight.cardId,
      status: "failed",
      node: session!.displayName,
      seq,
      paneId: flight.paneId,
      dispatchHandoffId: flight.dispatchHandoffId,
      output,
      truncated,
      summary,
      startedAt: flight.startedAt,
      finishedAt: new Date().toISOString(),
      reason: "needs_verification",
      ...(opts?.note ? { note: opts.note.slice(0, 500) } : {}),
    };

    // U3: no card auto pane.close after accepted ACK.
    await sendResult(flight.fromPeerId, payload, flight);
  }

  /**
   * PLAN 0.28.0 A1: deterministic failure for Flight-backed card paths.
   * Same issuer/seq/supersede/ACK machinery; status:"failed" with reason.
   * Never constructs status:"done". Never pane.close (U3).
   */
  async function finishCardFailure(
    flight: Flight,
    reason: string,
    opts?: { scrape?: string; note?: string },
  ): Promise<void> {
    const issuer = issuers.getOrCreate(
      flight.cardId,
      flight.dispatchHandoffId,
    );
    if (!issuer.acquire("initial")) {
      log(
        `card ${flight.cardId}: finishCardFailure issuer.acquire(initial) denied reason=${reason}`,
      );
      return;
    }

    let output = "";
    let truncated = false;
    try {
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
    }

    const summary = `failed reason=${reason}`.slice(0, 900);
    const seq = issuer.nextSeq();
    quarantine.supersedePresence({
      cardId: flight.cardId,
      dispatchHandoffId: flight.dispatchHandoffId,
    });

    const payload: CardResultPayload = {
      v: CARD_CONTRACT_VERSION,
      cardId: flight.cardId,
      status: "failed",
      node: session!.displayName,
      seq,
      paneId: flight.paneId,
      dispatchHandoffId: flight.dispatchHandoffId,
      output,
      truncated,
      summary,
      startedAt: flight.startedAt,
      finishedAt: new Date().toISOString(),
      reason,
      ...(opts?.note ? { note: opts.note.slice(0, 500) } : {}),
    };

    await sendResult(flight.fromPeerId, payload, flight);
  }

  async function sendFailedResult(opts: {
    cardId: string;
    fromPeerId: string;
    dispatchHandoffId: string;
    reason: string;
    detail?: string;
    paneId?: string;
    /** When set, Flight-backed path — CAS must already be held. */
    flight?: Flight;
  }): Promise<void> {
    const issuer = issuers.getOrCreate(opts.cardId, opts.dispatchHandoffId);
    // Flight-less 3 paths: issuer.acquire alone. Flight-backed: CAS + acquire.
    if (!issuer.acquire("initial")) {
      log(
        `card ${opts.cardId}: sendFailedResult issuer.acquire(initial) denied reason=${opts.reason}`,
      );
      return;
    }
    const seq = issuer.nextSeq();
    quarantine.supersedePresence({
      cardId: opts.cardId,
      dispatchHandoffId: opts.dispatchHandoffId,
    });
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
      await sendResult(opts.fromPeerId, payload, opts.flight);
    }
  }

  /**
   * PLAN 0.28.0 strict ACK 2-branch outcome (U5).
   * accepted | send_unknown only — rejected variant removed; non-accepted
   * always absorbs via enterSendUnknown (reason prefixes only).
   */
  type SendResultOutcome =
    | {
        branch: "accepted";
        relayAcceptedAt: string;
        status: string;
        recipientCount: number;
      }
    | { branch: "send_unknown"; reason: string };

  /**
   * Returns strict-ACK 2-branch outcome. Consumes full ACK envelope (no boolean squash).
   * Non-accepted → single send_unknown + one durable quarantine enter (U5/U6).
   */
  async function sendResult(
    toPeerId: string,
    payload: CardResultPayload,
    flight?: Flight,
  ): Promise<SendResultOutcome> {
    // M5: after any Flight-backed result path the card pane is preserved (U3).
    // Observation only — no close, no authority change. Skip if already terminal.
    const notePreservedIfFlight = (): void => {
      if (flight) notePreservedCardPane(flight.paneId);
    };
    if (!toPeerId) {
      log("sendResult: missing toPeerId");
      enterSendUnknown({
        cardId: payload.cardId,
        dispatchHandoffId: payload.dispatchHandoffId ?? "",
        seq: payload.seq,
        reason: "missing_toPeerId",
        flight,
      });
      notePreservedIfFlight();
      return { branch: "send_unknown", reason: "missing_toPeerId" };
    }
    try {
      const attachment = serializeCardAttachment(CARD_RESULT_LABEL, payload);
      const body = buildResultBody({
        cardId: payload.cardId,
        seq: payload.seq,
        summary: payload.summary,
      });
      const ack = await client.handoff({
        to: toPeerId,
        body,
        mode: "task",
        attachments: [attachment],
      });
      const decision = classifyAck(ack);
      if (decision === "accepted") {
        const relayAcceptedAt = new Date().toISOString();
        if (flight) {
          flight.resultPhase = "result_relay_accepted";
          flight.relayAcceptedAt = relayAcceptedAt;
        }
        // presence_unknown auto-resolve (c) if a seq record was from late presence issue
        if (payload.dispatchHandoffId) {
          quarantine.autoResolve({
            cardId: payload.cardId,
            dispatchHandoffId: payload.dispatchHandoffId,
            key: { tag: "seq", seq: payload.seq },
            reason: "relay_accepted",
          });
        }
        notePreservedIfFlight();
        return {
          branch: "accepted",
          relayAcceptedAt,
          status: ack.status,
          recipientCount: ack.recipientCount,
        };
      }
      // Unexpected ACK shape (peer_unknown/0, delivered/2, …) → send_unknown
      enterSendUnknown({
        cardId: payload.cardId,
        dispatchHandoffId: payload.dispatchHandoffId ?? "",
        seq: payload.seq,
        reason: `ack_${ack.status}_rc${ack.recipientCount}`,
        flight,
      });
      notePreservedIfFlight();
      return {
        branch: "send_unknown",
        reason: `ack_${ack.status}_rc${ack.recipientCount}`,
      };
    } catch (e) {
      // PLAN 0.28.0 U5: non-accepted is always send_unknown + quarantine enter.
      // Rejection vs transport is reason-prefix only (reject: / transport:), not
      // a behavioral branch — no message-regex split, no rejected variant.
      const msg = e instanceof Error ? e.message : String(e);
      const looksTransport =
        /injected transport|ECONN|socket|closed|timeout|WebSocket|fetch failed|network/i.test(
          msg,
        ) || msg === "injected transport error";
      const reasonPrefix = looksTransport
        ? `transport:${msg.slice(0, 120)}`
        : /reject|denied|forbidden|invalid/i.test(msg)
          ? `reject:${msg.slice(0, 120)}`
          : `transport:${msg.slice(0, 120)}`;
      log("sendResult non-accepted (send_unknown):", msg);
      enterSendUnknown({
        cardId: payload.cardId,
        dispatchHandoffId: payload.dispatchHandoffId ?? "",
        seq: payload.seq,
        reason: reasonPrefix,
        flight,
      });
      notePreservedIfFlight();
      return { branch: "send_unknown", reason: reasonPrefix };
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
    // PLAN 0.28.0 M5: process-local preserved-pane tracking ends with the process.
    preservedCardPaneIds.clear();
    terminalObservedPaneIds.clear();
    // PLAN 0.27.0: unresolved quarantine is fail-visible on process/bridge exit
    try {
      quarantine.onProcessExit();
      quarantine.disposeTimers();
    } catch {
      /* */
    }
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
