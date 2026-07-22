/**
 * Fixture-shaped fake herdr Unix NDJSON server for tests (protocol 17 / 0.7.5).
 *
 * Transport-honest per measured real herdr: every RPC gets exactly one
 * response then the server ends the connection (FIN). The one exception is
 * `events.subscribe`, whose connection stays open to carry `{event,data}`
 * pushes. Async pushes (e.g. auto-status after agent.prompt / send_keys CR)
 * are therefore broadcast to whatever sockets are still open — in practice
 * only the events.subscribe connection, since request connections are ended
 * right after their response.
 *
 * Protocol 17: allocate shell panes via `tab.create` / `pane.split` (cwd+env),
 * then named `agent.start` on an existing pane_id; inject with atomic
 * `agent.prompt` and bounded `agent.send_keys` CR nudge.
 *
 * PLAN 0.27.0 D2: also hosts the test-only handoff.ack injection surface
 * (relay ACK is not otherwise mocked by fake-herdr — production path unchanged).
 */
import { unlinkSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Server, Socket } from "node:net";
import { createServer } from "node:net";
import type { HandoffSendStatus } from "@loom/protocol";
import {
  __setHandoffAckInjector,
  type HandoffAckInjectionResult,
} from "./relay-client";

/** Measured terminal Enter for agent.send_keys CR nudge only. */
const CR_ENTER = "\r";

// ─── PLAN 0.27.0 D2: relay ACK injection (test-only) ─────────────────────────
// Forces the next RelayClient.handoff() response to one of 5 deterministic combos:
//   queued/1 · delivered/1 · peer_unknown/0 · delivered/2 · transport-throw
// Production default path is unchanged when no injection is set.
// Dependency is inverted: this module installs into RelayClient's seam;
// production relay-client never imports fake-herdr.

export type HandoffAckInjection =
  | {
      kind: "ack";
      status: HandoffSendStatus;
      recipientCount: number;
      notified?: boolean;
      message?: string;
      handoffId?: string;
      to?: string;
    }
  | { kind: "throw"; message?: string };

/** Named presets for the 5 D2 combos. */
export type HandoffAckInjectionPreset =
  | "queued_1"
  | "delivered_1"
  | "peer_unknown_0"
  | "delivered_2"
  | "transport_throw";

let handoffAckInjection: HandoffAckInjection | null = null;
/** When true, injection is cleared after one consume. Default true. */
let handoffAckInjectionOnce = true;

/** Map local injection shape → production seam result. */
function toInjectionResult(
  inj: HandoffAckInjection,
): HandoffAckInjectionResult {
  if (inj.kind === "throw") {
    return { kind: "throw", message: inj.message };
  }
  return {
    kind: "ack",
    status: inj.status,
    recipientCount: inj.recipientCount,
    notified: inj.notified,
    handoffId: inj.handoffId,
    to: inj.to,
    message: inj.message,
  };
}

/** Register (or clear) the production seam injector after local state changes. */
function syncAckInjectorToProduction(): void {
  if (handoffAckInjection === null) {
    __setHandoffAckInjector(null);
    return;
  }
  __setHandoffAckInjector(() => {
    const cur = consumeHandoffAckInjection();
    return cur ? toInjectionResult(cur) : null;
  });
}

export function setHandoffAckInjection(
  inj: HandoffAckInjection | HandoffAckInjectionPreset | null,
  opts?: { once?: boolean },
): void {
  handoffAckInjectionOnce = opts?.once !== false;
  if (inj === null) {
    handoffAckInjection = null;
    syncAckInjectorToProduction();
    return;
  }
  if (typeof inj === "string") {
    handoffAckInjection = presetToInjection(inj);
  } else {
    handoffAckInjection = inj;
  }
  syncAckInjectorToProduction();
}

function presetToInjection(p: HandoffAckInjectionPreset): HandoffAckInjection {
  switch (p) {
    case "queued_1":
      return {
        kind: "ack",
        status: "queued",
        recipientCount: 1,
        notified: false,
      };
    case "delivered_1":
      return {
        kind: "ack",
        status: "delivered",
        recipientCount: 1,
        notified: true,
      };
    case "peer_unknown_0":
      return {
        kind: "ack",
        status: "peer_unknown",
        recipientCount: 0,
        notified: false,
        message: "No peer matching (injected)",
      };
    case "delivered_2":
      return {
        kind: "ack",
        status: "delivered",
        recipientCount: 2,
        notified: true,
      };
    case "transport_throw":
      return { kind: "throw", message: "injected transport error" };
  }
}

/**
 * Consume the current injection (if any). Called via the production seam
 * injector registered by setHandoffAckInjection.
 * Returns null when no injection is active (production / default test path).
 */
export function consumeHandoffAckInjection(): HandoffAckInjection | null {
  const cur = handoffAckInjection;
  if (!cur) return null;
  if (handoffAckInjectionOnce) {
    handoffAckInjection = null;
    // Once-shot consumed: unregister so later handoffs hit the wire path.
    __setHandoffAckInjector(null);
  }
  return cur;
}

/** Peek without consuming (test assertions). */
export function peekHandoffAckInjection(): HandoffAckInjection | null {
  return handoffAckInjection;
}

export function clearHandoffAckInjection(): void {
  handoffAckInjection = null;
  handoffAckInjectionOnce = true;
  __setHandoffAckInjector(null);
}

export type FakeHerdrOptions = {
  socketPath: string;
  /** Auto-emit agent status after send (default: done after short delay) */
  autoStatus?: "done" | "idle" | "blocked" | "none";
  autoStatusDelayMs?: number;
  protocol?: number;
  version?: string;
  /**
   * PLAN 0.23.4 test hooks for events.subscribe lifecycle:
   * - "normal": ACK and keep open (default)
   * - "pre_ack_close": FIN without ACK (herdr closes invalid streams pre-ACK)
   * - "never_ack": keep open, never reply (ACK timeout path)
   */
  subscribeMode?: "normal" | "pre_ack_close" | "never_ack";
  /**
   * If set, the Nth events.subscribe call (1-based) and later use
   * `subscribeMode` (or pre_ack_close if mode is normal). Earlier calls ACK.
   * Useful when bridge startup global subscribe must succeed first.
   */
  subscribeFailFromCall?: number;
  /**
   * How many consecutive subscribe calls to fail starting at
   * `subscribeFailFromCall` (default: all subsequent). Set to 1 to fail a
   * single call then recover (M-1 self-reinfection regression).
   */
  subscribeFailCount?: number;
  /**
   * PLAN 0.23.4 F-3: when true, events.subscribe that includes any already
   * closed pane_id gets pre-ACK FIN (real herdr rejects invalid streams).
   * Closed set is tracked via pane.close / markPaneClosed.
   */
  failSubscribeOnClosedPane?: boolean;
  /**
   * PLAN 0.23.5: when true, agent.prompt does not append to the pane text
   * used by pane.read (simulates TUI startup paste loss — inject lands
   * nowhere visible). CR nudge via agent.send_keys still flips status /
   * autoStatus.
   */
  discardInjects?: boolean;
};

export type FakeHerdr = {
  socketPath: string;
  close: () => Promise<void>;
  /** Recorded RPC methods in order */
  calls: { method: string; params: Record<string, unknown> }[];
  pushEvent: (event: string, data: unknown) => void;
  /** Test-only: force a pane's stored text (e.g. to simulate a >32k scrape). */
  setPaneText: (paneId: string, text: string) => void;
  /** Test-only: read back a pane's currently stored text. */
  getPaneText: (paneId: string) => string | undefined;
  /**
   * Test-only: pane_id for the most recent shell pane (tab.create/pane.split)
   * that carried this LOOM_CONV env (protocol 17 env lives on the pane).
   */
  paneIdForConv: (convId: string) => string | undefined;
  /** Test-only: all pane ids currently tracked (not yet closed). */
  listPaneIds: () => string[];
  /** Test-only: mark a pane closed without RPC (same as pane.close for subscribe checks). */
  markPaneClosed: (paneId: string) => void;
  /**
   * Test-only: destroy all open sockets (forces established events connection
   * drop so the client backoff reconnect path fires — test ④).
   */
  disconnectEventSockets: () => void;
  /**
   * PLAN 0.23.5 composer scrape override: pane.read returns `text` for this
   * pane (or for all panes when paneId is "*") instead of accumulated injects.
   * Pass null to clear the override.
   */
  setPaneReadText: (paneId: string, text: string | null) => void;
  /**
   * PLAN 0.23.6 settle re-read control: successive pane.read RPCs for this
   * pane (or "*") return the next sequence entry; the last entry sticks.
   * Pass null to clear. Takes precedence over setPaneReadText while active.
   */
  setPaneReadSequence: (paneId: string, texts: string[] | null) => void;
  /**
   * PLAN 0.23.5: next `count` pane.read RPCs reply with an error (then recover).
   */
  failPaneReads: (count: number) => void;
  /** PLAN 0.23.5: how many pane.read RPCs have been served. */
  paneReadCount: () => number;
  /** Toggle discardInjects at runtime (paste-loss simulation). */
  setDiscardInjects: (discard: boolean) => void;
  /**
   * PLAN 0.23.8: when true, pane.close replies with error (test ⑧ close reject
   * must not affect result flow).
   */
  setPaneCloseFail: (fail: boolean) => void;
  /**
   * PLAN 0.23.9: force next N tab.create RPCs to error (pool fail-open tests).
   */
  failTabCreates: (count: number) => void;
  /**
   * PLAN 0.23.9 / 0.28.1: force next N pane.split RPCs that carry
   * target_pane_id to error (hinted-split fail-open). Unhinted splits and
   * agent.start on existing panes still succeed.
   */
  failHintedAgentStarts: (count: number) => void;
  /**
   * PLAN 0.23.9: remove a tab from the pane.list view without closing panes
   * via RPC (simulates pool-tab disappearance / external tab kill).
   */
  dropTab: (tabId: string) => void;
  /** PLAN 0.23.9 test-only: tab_id currently recorded for a pane. */
  tabIdForPane: (paneId: string) => string | undefined;
  /**
   * PLAN 0.23.12 ⓑ: force next N pane.resize RPCs to error (equalize fail-open).
   */
  failPaneResizes: (count: number) => void;
  /**
   * PLAN 0.23.12 ⓑ test hooks for layout guards:
   * - "normal": pure right-split chain (default)
   * - "non_chain": inject a direction≠"right" split (equalize skip)
   * - "ambiguous_x": duplicate x on two splits (L-2 uniqueness abort)
   */
  setLayoutMode: (mode: "normal" | "non_chain" | "ambiguous_x") => void;
  /** PLAN 0.23.12: set successive right-split ratios for a tab (length N-1). */
  setTabSplitRatios: (tabId: string, ratios: number[]) => void;
};

export async function startFakeHerdr(
  opts: FakeHerdrOptions,
): Promise<FakeHerdr> {
  const calls: FakeHerdr["calls"] = [];
  const sockets = new Set<Socket>();
  let paneCounter = 0;
  let tabCounter = 0;
  let subscribeCallCount = 0;
  let subscribeFailsRemaining =
    opts.subscribeFailFromCall != null
      ? (opts.subscribeFailCount ?? Number.POSITIVE_INFINITY)
      : 0;
  type FakePane = {
    terminal_id: string;
    text: string;
    status: string;
    tab_id: string;
    workspace_id: string;
    /** Protocol 17: cwd attached at tab.create / pane.split. */
    cwd?: string | null;
    /** Protocol 17: env attached at tab.create / pane.split. */
    env?: Record<string, string>;
    /** Recorded by agent.start (kind + args); never allocates the pane. */
    agentKind?: string;
    agentArgs?: string[];
    agentName?: string;
  };
  const panes = new Map<string, FakePane>();
  /** Tabs that still appear in pane.list (dropTab removes without pane.close). */
  const liveTabs = new Set<string>();
  const closedPanes = new Set<string>();
  const paneIdByConv = new Map<string, string>();
  // PLAN 0.23.5 composer simulation
  const paneReadOverrides = new Map<string, string>();
  let defaultPaneReadOverride: string | null = null;
  // PLAN 0.23.6 settle sequence: paneId | "*" → remaining reads (last sticks)
  const paneReadSequences = new Map<string, string[]>();
  let paneReadFailRemaining = 0;
  let paneReadCalls = 0;
  let discardInjects = opts.discardInjects === true;
  /** PLAN 0.23.8: pane.close error reply for test ⑧ */
  let paneCloseFail = false;
  /** PLAN 0.23.9: fail next N tab.create */
  let tabCreateFailRemaining = 0;
  /** PLAN 0.23.9 / 0.28.1: fail next N pane.split that include target_pane_id */
  let hintedStartFailRemaining = 0;
  /** PLAN 0.23.12 ⓑ: fail next N pane.resize */
  let paneResizeFailRemaining = 0;
  /** PLAN 0.23.12 ⓑ: layout guard modes for equalize tests */
  let layoutMode: "normal" | "non_chain" | "ambiguous_x" = "normal";
  /**
   * PLAN 0.23.12 ⓑ: per-tab horizontal chain — ordered leaf panes + successive
   * right-split ratios (ratios[i] = left share of remaining space from i..end).
   * Models herdr agent.start right-split half-width accumulation.
   */
  const tabChains = new Map<
    string,
    { ordered: string[]; ratios: number[] }
  >();
  const TOTAL_WIDTH = 100;

  function ensureChain(tabId: string): { ordered: string[]; ratios: number[] } {
    let c = tabChains.get(tabId);
    if (!c) {
      c = { ordered: [], ratios: [] };
      tabChains.set(tabId, c);
    }
    return c;
  }

  function addPaneToChain(tabId: string, paneId: string): void {
    const c = ensureChain(tabId);
    if (c.ordered.includes(paneId)) return;
    if (c.ordered.length === 0) {
      c.ordered.push(paneId);
      return;
    }
    // Successive right-split of rightmost: new leaf gets half of previous right.
    c.ratios.push(0.5);
    c.ordered.push(paneId);
  }

  function removePaneFromChain(paneId: string): void {
    for (const [tabId, c] of tabChains) {
      const idx = c.ordered.indexOf(paneId);
      if (idx < 0) continue;
      c.ordered.splice(idx, 1);
      // Drop the split that owned this leaf; keep remaining ratios aligned.
      if (c.ordered.length === 0) {
        tabChains.delete(tabId);
        return;
      }
      // ratios length must be ordered.length - 1
      if (idx < c.ratios.length) {
        c.ratios.splice(idx, 1);
      } else if (c.ratios.length > 0) {
        c.ratios.pop();
      }
      while (c.ratios.length > Math.max(0, c.ordered.length - 1)) {
        c.ratios.pop();
      }
      while (c.ratios.length < Math.max(0, c.ordered.length - 1)) {
        c.ratios.push(0.5);
      }
      return;
    }
  }

  function buildLayoutForTab(tabId: string): {
    panes: Array<{
      pane_id: string;
      rect: { x: number; width: number; y: number; height: number };
    }>;
    splits: Array<{
      ratio: number;
      direction: string;
      rect: { x: number; width: number; y: number; height: number };
    }>;
  } {
    const c = tabChains.get(tabId);
    const ordered = c?.ordered ?? [];
    const ratios = c?.ratios ?? [];
    const panes: Array<{
      pane_id: string;
      rect: { x: number; width: number; y: number; height: number };
    }> = [];
    const splits: Array<{
      ratio: number;
      direction: string;
      rect: { x: number; width: number; y: number; height: number };
    }> = [];
    if (ordered.length === 0) {
      return { panes, splits };
    }
    let remaining = TOTAL_WIDTH;
    let x = 0;
    const widths: number[] = [];
    for (let i = 0; i < ordered.length; i++) {
      let w: number;
      if (i < ordered.length - 1) {
        const r = ratios[i] ?? 0.5;
        w = remaining * r;
        // Direct split for pane i: rect covers remaining space at this depth.
        splits.push({
          ratio: r,
          direction: "right",
          rect: { x, width: remaining, y: 0, height: 24 },
        });
        remaining -= w;
      } else {
        w = remaining;
      }
      widths.push(w);
      panes.push({
        pane_id: ordered[i]!,
        rect: { x, width: w, y: 0, height: 24 },
      });
      x += w;
    }
    if (layoutMode === "non_chain" && splits.length > 0) {
      // Inject a down split so equalize guard aborts.
      splits.push({
        ratio: 0.5,
        direction: "down",
        rect: { x: 0, width: TOTAL_WIDTH, y: 0, height: 24 },
      });
    }
    if (layoutMode === "ambiguous_x" && splits.length > 0) {
      // Duplicate first split's x so uniqueness guard aborts.
      const first = splits[0]!;
      splits.push({
        ratio: 0.5,
        direction: "right",
        rect: { ...first.rect },
      });
    }
    return { panes, splits };
  }

  function nextSequenceText(paneId: string): string | undefined {
    for (const key of [paneId, "*"] as const) {
      const seq = paneReadSequences.get(key);
      if (!seq || seq.length === 0) continue;
      if (seq.length === 1) return seq[0];
      return seq.shift()!;
    }
    return undefined;
  }

  if (existsSync(opts.socketPath)) {
    try {
      unlinkSync(opts.socketPath);
    } catch {
      /* */
    }
  }
  mkdirSync(dirname(opts.socketPath), { recursive: true });

  /** Broadcast to every socket still open — real herdr only has the
   * events.subscribe connection alive by the time async pushes fire. */
  function broadcast(event: string, data: unknown): void {
    const line = `${JSON.stringify({ event, data })}\n`;
    for (const s of sockets) {
      try {
        s.write(line);
      } catch {
        /* */
      }
    }
  }

  function markClosed(paneId: string): void {
    if (!paneId) return;
    closedPanes.add(paneId);
    panes.delete(paneId);
    removePaneFromChain(paneId);
  }

  function attachEnvCwd(
    p: FakePane,
    params: Record<string, unknown>,
    paneId: string,
  ): void {
    if (params.cwd !== undefined) {
      p.cwd = params.cwd === null ? null : String(params.cwd);
    }
    if (params.env && typeof params.env === "object" && !Array.isArray(params.env)) {
      p.env = { ...(params.env as Record<string, string>) };
      if (p.env.LOOM_CONV) paneIdByConv.set(p.env.LOOM_CONV, paneId);
    }
  }

  function findPaneByTarget(target: string): [string, FakePane] | undefined {
    if (!target) return undefined;
    const direct = panes.get(target);
    if (direct) return [target, direct];
    for (const [paneId, p] of panes) {
      if (p.terminal_id === target) return [paneId, p];
      if (p.agentName === target) return [paneId, p];
    }
    return undefined;
  }

  /** Drive working → autoStatus events (agent.prompt atomic submit / CR nudge). */
  function scheduleAutoStatus(paneId: string, p: FakePane): void {
    p.status = "working";
    const auto = opts.autoStatus ?? "done";
    if (auto === "none") return;
    const delay = opts.autoStatusDelayMs ?? 30;
    setTimeout(() => {
      p.status = auto === "idle" ? "idle" : auto;
      const event = "pane_agent_status_changed";
      const finalStatus = auto === "idle" ? "idle" : auto;
      // Always emit working first so M-2 / 0.23.5 verify sees sawWorking.
      broadcast(event, {
        pane_id: paneId,
        agent_status: "working",
      });
      setTimeout(() => {
        broadcast(event, {
          pane_id: paneId,
          agent_status: finalStatus,
        });
      }, 10);
    }, delay);
  }

  function paneInfoPayload(paneId: string, p: FakePane): Record<string, unknown> {
    return {
      pane_id: paneId,
      terminal_id: p.terminal_id,
      workspace_id: p.workspace_id,
      tab_id: p.tab_id,
      focused: false,
      agent_status: p.status,
      revision: 0,
      cwd: p.cwd ?? null,
    };
  }

  const server: Server = createServer((sock) => {
    sockets.add(sock);
    let buf = "";
    sock.setEncoding("utf8");
    sock.on("data", (chunk: string) => {
      buf += chunk;
      while (true) {
        const nl = buf.indexOf("\n");
        if (nl < 0) break;
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let msg: { id?: string; method?: string; params?: Record<string, unknown> };
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        const id = msg.id ?? "";
        const method = msg.method ?? "";
        const params = msg.params ?? {};
        calls.push({ method, params });

        const reply = (result: unknown) => {
          sock.write(`${JSON.stringify({ id, result })}\n`);
        };
        const err = (message: string) => {
          sock.write(
            `${JSON.stringify({
              id,
              error: { code: "invalid_request", message },
            })}\n`,
          );
        };

        if (method === "ping") {
          reply({
            type: "pong",
            version: opts.version ?? "0.7.5",
            protocol: opts.protocol ?? 17,
            capabilities: { live_handoff: true },
          });
          sock.end();
          continue;
        }
        if (method === "tab.create") {
          if (tabCreateFailRemaining > 0) {
            tabCreateFailRemaining -= 1;
            err("tab.create failed (test inject)");
            sock.end();
            continue;
          }
          tabCounter += 1;
          const tab_id = `tab_${tabCounter}`;
          const root_pane_id = `w1:root${tabCounter}`;
          const workspace_id =
            typeof params.workspace_id === "string"
              ? params.workspace_id
              : "";
          liveTabs.add(tab_id);
          const root: FakePane = {
            terminal_id: `root_term_${tabCounter}`,
            text: "",
            status: "unknown",
            tab_id,
            workspace_id,
          };
          attachEnvCwd(root, params, root_pane_id);
          panes.set(root_pane_id, root);
          closedPanes.delete(root_pane_id);
          // Protocol 17: shell root is allocated here (before agent.start).
          addPaneToChain(tab_id, root_pane_id);
          reply({
            type: "tab_created",
            tab: { tab_id, label: params.label ?? null },
            root_pane: { pane_id: root_pane_id, tab_id },
          });
          sock.end();
          continue;
        }
        if (method === "pane.split") {
          const target_pane_id =
            typeof params.target_pane_id === "string"
              ? params.target_pane_id
              : params.target_pane_id === null
                ? ""
                : "";
          if (target_pane_id && hintedStartFailRemaining > 0) {
            hintedStartFailRemaining -= 1;
            err("pane.split hinted spawn failed (test inject)");
            sock.end();
            continue;
          }
          paneCounter += 1;
          const pane_id = `w1:p${paneCounter}`;
          const terminal_id = `term_${paneCounter.toString(16)}`;
          let tab_id = "";
          let workspace_id =
            typeof params.workspace_id === "string" && params.workspace_id
              ? params.workspace_id
              : "";
          if (target_pane_id && panes.has(target_pane_id)) {
            const parent = panes.get(target_pane_id)!;
            tab_id = parent.tab_id;
            if (!workspace_id) workspace_id = parent.workspace_id;
          } else if (target_pane_id && !panes.has(target_pane_id)) {
            err("pane.split: target_pane_id not found");
            sock.end();
            continue;
          } else {
            // Unhinted split: synthetic focus tab (legacy fail-open path).
            tabCounter += 1;
            tab_id = `tab_focus_${tabCounter}`;
            liveTabs.add(tab_id);
          }
          if (tab_id && !liveTabs.has(tab_id)) liveTabs.add(tab_id);
          const pane: FakePane = {
            terminal_id,
            text: "",
            status: "unknown",
            tab_id,
            workspace_id,
          };
          attachEnvCwd(pane, params, pane_id);
          panes.set(pane_id, pane);
          closedPanes.delete(pane_id);
          addPaneToChain(tab_id, pane_id);
          reply({
            type: "pane_info",
            pane: paneInfoPayload(pane_id, pane),
          });
          sock.end();
          continue;
        }
        if (method === "pane.list") {
          const list = [...panes.entries()]
            .filter(([, p]) => liveTabs.has(p.tab_id))
            .map(([pane_id, p]) => ({
              pane_id,
              tab_id: p.tab_id,
              workspace_id: p.workspace_id,
              agent_status: p.status,
            }));
          reply({ type: "pane_list", panes: list });
          sock.end();
          continue;
        }
        if (method === "agent.start") {
          const pane_id =
            typeof params.pane_id === "string" ? params.pane_id : "";
          if (!pane_id) {
            err("agent.start: pane_id required");
            sock.end();
            continue;
          }
          const p = panes.get(pane_id);
          if (!p) {
            err("agent.start: pane_id does not exist");
            sock.end();
            continue;
          }
          // Protocol 17: never allocate a pane — record kind/args on existing.
          if (typeof params.kind === "string") p.agentKind = params.kind;
          if (Array.isArray(params.args)) {
            p.agentArgs = params.args.map(String);
          }
          if (typeof params.name === "string") p.agentName = params.name;
          // Conversation mapping derives from env stored on the shell pane.
          if (p.env?.LOOM_CONV) paneIdByConv.set(p.env.LOOM_CONV, pane_id);
          reply({
            type: "agent_started",
            agent: {
              pane_id,
              terminal_id: p.terminal_id,
              name: params.name ?? p.agentName ?? "agent",
              agent_status: p.status,
            },
          });
          sock.end();
          continue;
        }
        if (method === "pane.layout") {
          const pane_id =
            typeof params.pane_id === "string" ? params.pane_id : "";
          let tab_id = "";
          if (pane_id && panes.has(pane_id)) {
            tab_id = panes.get(pane_id)!.tab_id;
          } else if (tabChains.size === 1) {
            tab_id = [...tabChains.keys()][0]!;
          } else if (liveTabs.size === 1) {
            tab_id = [...liveTabs][0]!;
          }
          const layout = buildLayoutForTab(tab_id);
          reply({ type: "pane_layout", layout });
          sock.end();
          continue;
        }
        if (method === "pane.resize") {
          if (paneResizeFailRemaining > 0) {
            paneResizeFailRemaining -= 1;
            err("pane.resize failed (test inject)");
            sock.end();
            continue;
          }
          const pane_id = String(params.pane_id ?? "");
          const direction = String(params.direction ?? "");
          const amount =
            typeof params.amount === "number" ? params.amount : Number(params.amount);
          const p = panes.get(pane_id);
          if (!p || !Number.isFinite(amount)) {
            err("pane.resize: invalid pane_id/amount");
            sock.end();
            continue;
          }
          const c = tabChains.get(p.tab_id);
          if (!c) {
            err("pane.resize: no chain for tab");
            sock.end();
            continue;
          }
          const idx = c.ordered.indexOf(pane_id);
          // Direct split only exists for non-rightmost panes.
          if (idx < 0 || idx >= c.ratios.length) {
            err("pane.resize: no direct split for pane");
            sock.end();
            continue;
          }
          let next = c.ratios[idx]!;
          if (direction === "right") next += amount;
          else if (direction === "left") next -= amount;
          else {
            err(`pane.resize: bad direction ${direction}`);
            sock.end();
            continue;
          }
          // Keep ratio in open unit interval so widths stay positive.
          next = Math.min(0.99, Math.max(0.01, next));
          c.ratios[idx] = next;
          const layout = buildLayoutForTab(p.tab_id);
          reply({
            type: "pane_resized",
            resize: { layout },
          });
          sock.end();
          continue;
        }
        if (method === "agent.prompt") {
          // Protocol 17 atomic paste+Enter — primary inject path.
          const target = String(params.target ?? "");
          const text = String(params.text ?? "");
          const found = findPaneByTarget(target);
          if (found) {
            const [paneId, p] = found;
            // PLAN 0.23.5: discardInjects simulates paste-loss (empty composer)
            if (!discardInjects) {
              p.text += text;
            }
            // Atomic submit includes Enter — drive working/status simulation.
            scheduleAutoStatus(paneId, p);
          }
          reply({ type: "ok" });
          sock.end();
          continue;
        }
        if (method === "agent.send_keys") {
          // Protocol 17 logical keys; CR-only nudge drives enter/working.
          const target = String(params.target ?? "");
          const keys = Array.isArray(params.keys)
            ? params.keys.map(String)
            : [];
          const found = findPaneByTarget(target);
          if (found) {
            const [paneId, p] = found;
            // Sole recognized nudge is measured CR; no named Enter token.
            if (keys.includes(CR_ENTER)) {
              scheduleAutoStatus(paneId, p);
            }
          }
          reply({ type: "ok" });
          sock.end();
          continue;
        }
        if (method === "pane.close") {
          const pane_id = String(params.pane_id ?? "");
          if (paneCloseFail) {
            err("pane.close failed (test inject)");
            sock.end();
            continue;
          }
          markClosed(pane_id);
          reply({ type: "ok" });
          sock.end();
          continue;
        }
        if (method === "events.subscribe") {
          subscribeCallCount += 1;
          const mode = opts.subscribeMode ?? "normal";
          const failFrom = opts.subscribeFailFromCall;
          let shouldFail = false;
          if (failFrom != null && subscribeCallCount >= failFrom) {
            if (subscribeFailsRemaining > 0) {
              shouldFail = true;
              subscribeFailsRemaining -= 1;
            }
          } else if (failFrom == null && mode !== "normal") {
            shouldFail = true;
          }
          // F-3: closed-pane list contamination → pre-ACK FIN (real herdr).
          if (!shouldFail && opts.failSubscribeOnClosedPane) {
            const subs = (params.subscriptions ?? []) as {
              type?: string;
              pane_id?: string;
            }[];
            if (subs.some((s) => s.pane_id != null && closedPanes.has(s.pane_id))) {
              sock.end();
              continue;
            }
          }
          if (shouldFail) {
            const failMode =
              mode === "never_ack"
                ? "never_ack"
                : mode === "pre_ack_close" || failFrom != null
                  ? "pre_ack_close"
                  : mode;
            if (failMode === "never_ack") {
              // Stay open, never ACK — client timeout path.
              continue;
            }
            // pre_ack_close: FIN without ACK (root-cause reproduction).
            sock.end();
            continue;
          }
          reply({ type: "subscription_started" });
          // Connection stays open — real herdr carries pushes on it.
          continue;
        }
        if (method === "pane.read") {
          paneReadCalls += 1;
          const pane_id = String(params.pane_id ?? "");
          if (paneReadFailRemaining > 0) {
            paneReadFailRemaining -= 1;
            err("pane read failed (test hook)");
            sock.end();
            continue;
          }
          const p = panes.get(pane_id);
          let text = p?.text ?? "READY\n";
          // PLAN 0.23.6 sequence takes precedence (settle multi-read control)
          const seqText = nextSequenceText(pane_id);
          if (seqText !== undefined) {
            text = seqText;
          } else if (paneReadOverrides.has(pane_id)) {
            text = paneReadOverrides.get(pane_id)!;
          } else if (paneReadOverrides.has("*")) {
            text = paneReadOverrides.get("*")!;
          } else if (defaultPaneReadOverride !== null) {
            text = defaultPaneReadOverride;
          }
          reply({
            type: "pane_read",
            read: {
              pane_id,
              source: params.source ?? "recent",
              format: "text",
              text,
              truncated: false,
            },
          });
          sock.end();
          continue;
        }
        if (method === "session.snapshot") {
          reply({
            type: "snapshot",
            workspaces: [],
          });
          sock.end();
          continue;
        }
        err(`unknown method ${method}`);
        sock.end();
      }
    });
    sock.on("close", () => sockets.delete(sock));
    sock.on("error", () => sockets.delete(sock));
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(opts.socketPath, () => resolve());
    server.on("error", reject);
  });

  return {
    socketPath: opts.socketPath,
    calls,
    pushEvent: broadcast,
    setPaneText(paneId: string, text: string) {
      const p = panes.get(paneId);
      if (p) p.text = text;
    },
    getPaneText(paneId: string) {
      return panes.get(paneId)?.text;
    },
    paneIdForConv(convId: string) {
      return paneIdByConv.get(convId);
    },
    listPaneIds() {
      return [...panes.keys()];
    },
    markPaneClosed(paneId: string) {
      markClosed(paneId);
    },
    disconnectEventSockets() {
      for (const s of [...sockets]) {
        try {
          s.destroy();
        } catch {
          /* */
        }
      }
    },
    setPaneReadText(paneId: string, text: string | null) {
      if (text === null) {
        if (paneId === "*") {
          defaultPaneReadOverride = null;
          paneReadOverrides.delete("*");
        } else {
          paneReadOverrides.delete(paneId);
        }
        return;
      }
      if (paneId === "*") {
        defaultPaneReadOverride = text;
        paneReadOverrides.set("*", text);
      } else {
        paneReadOverrides.set(paneId, text);
      }
    },
    setPaneReadSequence(paneId: string, texts: string[] | null) {
      if (texts === null || texts.length === 0) {
        paneReadSequences.delete(paneId);
        return;
      }
      paneReadSequences.set(paneId, [...texts]);
    },
    failPaneReads(count: number) {
      paneReadFailRemaining = Math.max(0, count);
    },
    paneReadCount() {
      return paneReadCalls;
    },
    setDiscardInjects(discard: boolean) {
      discardInjects = discard;
    },
    setPaneCloseFail(fail: boolean) {
      paneCloseFail = fail;
    },
    failTabCreates(count: number) {
      tabCreateFailRemaining = Math.max(0, count);
    },
    failHintedAgentStarts(count: number) {
      hintedStartFailRemaining = Math.max(0, count);
    },
    dropTab(tabId: string) {
      liveTabs.delete(tabId);
      // Keep pane records for terminal/read, but they vanish from pane.list.
    },
    tabIdForPane(paneId: string) {
      return panes.get(paneId)?.tab_id;
    },
    failPaneResizes(count: number) {
      paneResizeFailRemaining = Math.max(0, count);
    },
    setLayoutMode(mode: "normal" | "non_chain" | "ambiguous_x") {
      layoutMode = mode;
    },
    setTabSplitRatios(tabId: string, ratios: number[]) {
      const c = ensureChain(tabId);
      c.ratios = [...ratios];
    },
    async close() {
      for (const s of sockets) {
        try {
          s.destroy();
        } catch {
          /* */
        }
      }
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
      try {
        unlinkSync(opts.socketPath);
      } catch {
        /* */
      }
    },
  };
}
