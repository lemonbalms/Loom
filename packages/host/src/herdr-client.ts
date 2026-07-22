/**
 * Herdr NDJSON Unix-socket client (v0.7.5 / protocol 17 fixtures).
 * AGPL boundary: socket RPC only — no herdr source vendoring.
 * PLAN 0.22.0 / HERDR_DESIGN §2.3
 * PLAN 0.23.4 — subscription lifecycle (prune, pre-ACK reject, ACK timeout, M-1 rollback).
 * PLAN 0.28.1 — protocol-17 adapter: named start on existing pane, atomic
 * `agent.prompt`, env/cwd on `tab.create`/`pane.split` (PATCH 2).
 *
 * Transport note (measured against real herdr; still true on 0.7.5): the
 * socket is one-RPC-per-connection — any request gets a response then the
 * server sends FIN and the connection closes. The lone exception is
 * `events.subscribe`, whose connection stays open to carry `{event,data}`
 * pushes (but accepts no further requests). `request()` therefore opens a
 * fresh connection per call; `eventsSubscribe()` keeps one dedicated
 * long-lived connection for pushes, reconnecting with backoff if it drops.
 *
 * Wire truth: `docs/spikes/fixtures/herdr-v0.7.5/schema.json` (+ schema-focus).
 * Do not invent fields or logical key-token names beyond that fixture.
 */

import { randomBytes } from "node:crypto";
import { createConnection, type Socket } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";

export const HERDR_PROTOCOL_EXPECTED = 17;
export const DEFAULT_HERDR_SOCKET = join(homedir(), ".config", "herdr", "herdr.sock");

const EVENT_RECONNECT_BASE_MS = 500;
const EVENT_RECONNECT_MAX_MS = 5_000;

/** Schema-backed agent status enum (request + response AgentStatus). */
export type HerdrAgentStatus = "idle" | "working" | "blocked" | "done" | "unknown";

export type HerdrPingResult = {
  version: string;
  protocol: number;
  capabilities?: Record<string, unknown>;
};

export type HerdrAgentStarted = {
  pane_id: string;
  terminal_id: string;
  name?: string;
  agent_status?: string;
  /** True while herdr accepted start but process is not interactive yet. */
  launch_pending?: boolean;
  /** True when agent.prompt targets (name/pane) are accepted. */
  interactive_ready?: boolean;
};

/** Structured RPC error so callers can match codes without message regexes. */
export class HerdrRpcError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "HerdrRpcError";
    this.code = code;
  }
}

export type HerdrClientOptions = {
  socketPath: string;
  /** Request timeout ms (default 15s) */
  timeoutMs?: number;
  onEvent?: (event: string, data: unknown) => void;
  onClose?: () => void;
  onError?: (err: Error) => void;
};

export type HerdrEventSubscription = { type: string; pane_id?: string };

/** PLAN 0.23.12 ⓑ: projected pane.layout / pane.resize layout response. */
export type HerdrPaneLayoutRect = {
  x: number;
  width: number;
  y?: number;
  height?: number;
};

export type HerdrPaneLayout = {
  panes: Array<{
    paneId: string;
    rect: HerdrPaneLayoutRect;
  }>;
  splits: Array<{
    ratio: number;
    direction: string;
    rect: HerdrPaneLayoutRect;
  }>;
};

function projectRect(raw: unknown): HerdrPaneLayoutRect | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const x = typeof r.x === "number" ? r.x : null;
  const width = typeof r.width === "number" ? r.width : null;
  if (x === null || width === null) return null;
  const out: HerdrPaneLayoutRect = { x, width };
  if (typeof r.y === "number") out.y = r.y;
  if (typeof r.height === "number") out.height = r.height;
  return out;
}

function projectPaneLayout(raw: { panes?: unknown; splits?: unknown }): HerdrPaneLayout {
  const panesIn = Array.isArray(raw.panes) ? raw.panes : [];
  const splitsIn = Array.isArray(raw.splits) ? raw.splits : [];
  const panes: HerdrPaneLayout["panes"] = [];
  for (const p of panesIn) {
    if (!p || typeof p !== "object") continue;
    const rec = p as Record<string, unknown>;
    const paneId =
      typeof rec.pane_id === "string"
        ? rec.pane_id
        : typeof rec.paneId === "string"
          ? rec.paneId
          : "";
    if (!paneId) continue;
    const rect = projectRect(rec.rect);
    if (!rect) continue;
    panes.push({ paneId, rect });
  }
  const splits: HerdrPaneLayout["splits"] = [];
  for (const s of splitsIn) {
    if (!s || typeof s !== "object") continue;
    const rec = s as Record<string, unknown>;
    const ratio = typeof rec.ratio === "number" ? rec.ratio : null;
    const direction = typeof rec.direction === "string" ? rec.direction : "";
    if (ratio === null || !direction) continue;
    const rect = projectRect(rec.rect);
    if (!rect) continue;
    splits.push({ ratio, direction, rect });
  }
  return { panes, splits };
}

type EventConnectDeferred = {
  resolve: () => void;
  reject: (err: Error) => void;
  promise: Promise<void>;
};

function parseNdjsonLines(
  buf: { text: string },
  onLine: (msg: Record<string, unknown>) => void,
): void {
  while (true) {
    const nl = buf.text.indexOf("\n");
    if (nl < 0) break;
    const line = buf.text.slice(0, nl).trim();
    buf.text = buf.text.slice(nl + 1);
    if (!line) continue;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    onLine(msg);
  }
}

function isEventPush(msg: Record<string, unknown>): msg is {
  event: string;
  data: unknown;
} {
  if (typeof msg.event === "string" && msg.id === undefined) return true;
  return typeof msg.type === "string" && msg.type === "event" && typeof msg.event === "string";
}

function subKey(s: HerdrEventSubscription): string {
  return `${s.type}\0${s.pane_id ?? ""}`;
}

export class HerdrClient {
  private opts: HerdrClientOptions;
  private closed = false;

  // Dedicated long-lived events.subscribe connection (real herdr keeps this
  // one open; every other RPC is one-shot — see file header).
  private eventSocket: Socket | null = null;
  private eventGeneration = 0;
  private eventReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private eventReconnectDelay = EVENT_RECONNECT_BASE_MS;
  private subscriptions: HerdrEventSubscription[] = [];
  /** True only after a successful events.subscribe ACK on the current socket. */
  private eventEstablished = false;
  private _lastSubscribeAck: string | null = null;
  /**
   * Shared waiters for in-flight openEventConnection (R29 L-1):
   * superseded generations adopt the newest generation's settle result.
   */
  private eventConnectDeferred: EventConnectDeferred | null = null;

  constructor(opts: HerdrClientOptions) {
    this.opts = opts;
  }

  /** Allow runtime to attach event handler after construction (tests/inject). */
  setOnEvent(fn: (event: string, data: unknown) => void): void {
    this.opts.onEvent = fn;
  }

  get socketPath(): string {
    return this.opts.socketPath;
  }

  /** Event socket has received subscribe ACK and is still open. */
  get eventConnected(): boolean {
    return this.eventEstablished && this.eventSocket != null && !this.closed;
  }

  /** ISO timestamp of the last successful events.subscribe ACK, or null. */
  get lastSubscribeAck(): string | null {
    return this._lastSubscribeAck;
  }

  /** Number of stored event subscriptions (including global entries). */
  get eventSubscriptions(): number {
    return this.subscriptions.length;
  }

  /** Test/observability: snapshot of the stored subscription list. */
  getSubscriptionSnapshot(): HerdrEventSubscription[] {
    return this.subscriptions.map((s) =>
      s.pane_id !== undefined ? { type: s.type, pane_id: s.pane_id } : { type: s.type },
    );
  }

  /**
   * Compat no-op: per-request connections (see file header) make an explicit
   * "connect" step meaningless. Kept so existing call sites (e.g.
   * `await herdr.connect()` before the fail-fast ping) keep working.
   */
  connect(): Promise<void> {
    this.closed = false;
    return Promise.resolve();
  }

  close(): void {
    this.closed = true;
    this.subscriptions = [];
    this.eventEstablished = false;
    if (this.eventReconnectTimer) {
      clearTimeout(this.eventReconnectTimer);
      this.eventReconnectTimer = null;
    }
    this.eventGeneration += 1; // orphan any in-flight event socket's handlers
    if (this.eventSocket) {
      try {
        this.eventSocket.destroy();
      } catch {
        /* */
      }
      this.eventSocket = null;
    }
    const pending = this.eventConnectDeferred;
    this.eventConnectDeferred = null;
    if (pending) {
      pending.reject(new Error("herdr client closed"));
    }
  }

  /**
   * Remove stored subscriptions for `paneId` (PLAN 0.23.4).
   * Does not reopen the event socket. Global entries without pane_id are
   * left alone. If the list becomes empty: destroy the event socket and
   * cancel any reconnect timer (prevent empty-list reconnect loops).
   */
  eventsPrune(paneId: string): void {
    this.subscriptions = this.subscriptions.filter((s) => s.pane_id !== paneId);
    if (this.subscriptions.length === 0) {
      if (this.eventReconnectTimer) {
        clearTimeout(this.eventReconnectTimer);
        this.eventReconnectTimer = null;
      }
      this.eventGeneration += 1;
      this.eventEstablished = false;
      if (this.eventSocket) {
        try {
          this.eventSocket.destroy();
        } catch {
          /* */
        }
        this.eventSocket = null;
      }
      // Drop pending connect waiters — nothing left to subscribe to.
      const pending = this.eventConnectDeferred;
      this.eventConnectDeferred = null;
      if (pending) {
        pending.reject(new Error("herdr events pruned to empty"));
      }
    }
  }

  private nextId(): string {
    return `loom-${randomBytes(6).toString("hex")}`;
  }

  /** One connection per request: write, await the matching id, destroy. */
  async request(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    if (this.closed) throw new Error("herdr client closed");
    const id = this.nextId();
    const timeoutMs = this.opts.timeoutMs ?? 15_000;
    return new Promise((resolve, reject) => {
      let settled = false;
      const buf = { text: "" };
      const sock = createConnection(this.opts.socketPath);
      const timer = setTimeout(() => {
        finish(() => reject(new Error(`herdr ${method} timed out after ${timeoutMs}ms`)));
      }, timeoutMs);
      const finish = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
        try {
          sock.destroy();
        } catch {
          /* */
        }
      };
      sock.setEncoding("utf8");
      sock.on("connect", () => {
        const line = `${JSON.stringify({ id, method, params })}\n`;
        sock.write(line, (err) => {
          if (err) finish(() => reject(err));
        });
      });
      sock.on("data", (chunk: string) => {
        buf.text += chunk;
        parseNdjsonLines(buf, (msg) => {
          if (settled) return;
          if (isEventPush(msg)) return; // not expected here, but ignore harmlessly
          const msgId = msg.id != null ? String(msg.id) : "";
          if (msgId !== id) return;
          if (msg.error) {
            const err = msg.error as { message?: string; code?: string };
            const code = typeof err.code === "string" ? err.code : "unknown";
            const message =
              typeof err.message === "string" && err.message.length > 0
                ? err.message
                : `herdr error ${code}`;
            finish(() => reject(new HerdrRpcError(code, message)));
          } else {
            finish(() => resolve(msg.result ?? msg));
          }
        });
      });
      sock.on("error", (err) => {
        finish(() => reject(err instanceof Error ? err : new Error(String(err))));
      });
      sock.on("close", () => {
        // Server FIN immediately after a response is the normal, expected
        // lifecycle for this transport — finish() already settled & is a
        // no-op here. Only an *unsettled* close is a real failure.
        finish(() => reject(new Error("herdr connection closed before response")));
      });
    });
  }

  async ping(): Promise<HerdrPingResult> {
    const result = (await this.request("ping", {})) as Record<string, unknown>;
    return {
      version: String(result.version ?? ""),
      protocol: Number(result.protocol ?? 0),
      capabilities: result.capabilities as Record<string, unknown> | undefined,
    };
  }

  /**
   * Protocol 17 named start on an **existing** pane.
   * Wire: required `name`/`kind`/`pane_id`; optional `args`/`timeout_ms`.
   * Env/cwd/focus/tab_id/workspace_id/split/argv are not accepted — put
   * topology + env on `tab.create` / `pane.split` first.
   * `timeout_ms` is passed through as supplied (including null); herdr
   * validates (upstream schema description vs minimum are inconsistent).
   */
  async agentStart(opts: {
    name: string;
    kind: string;
    paneId: string;
    args?: string[];
    timeoutMs?: number | null;
  }): Promise<HerdrAgentStarted> {
    const params: Record<string, unknown> = {
      name: opts.name,
      kind: opts.kind,
      pane_id: opts.paneId,
    };
    if (opts.args !== undefined) params.args = opts.args;
    if (opts.timeoutMs !== undefined) params.timeout_ms = opts.timeoutMs;
    const result = (await this.request("agent.start", params)) as {
      agent?: HerdrAgentStarted;
    };
    const agent = result.agent;
    if (!agent?.pane_id || !agent?.terminal_id) {
      throw new Error("agent.start: missing pane_id/terminal_id");
    }
    // Non-pending start: resolve immediately (fast path).
    if (agent.launch_pending !== true) {
      return agent;
    }
    // Live protocol-17: agent.start may return launch_pending=true before the
    // process is interactive_ready. agent.wait is NOT a readiness barrier;
    // poll agent.get{target:pane_id} until ready within the client timeout budget.
    return this.awaitAgentLaunchReady(agent, opts.name);
  }

  /**
   * Poll agent.get until interactive_ready and not launch_pending.
   * Budget: HerdrClientOptions.timeoutMs (same default as request()).
   */
  private async awaitAgentLaunchReady(
    started: HerdrAgentStarted,
    expectedName: string,
  ): Promise<HerdrAgentStarted> {
    const expectedPaneId = started.pane_id;
    const expectedTerminalId = started.terminal_id;
    const budgetMs = this.opts.timeoutMs ?? 15_000;
    const deadline = Date.now() + budgetMs;
    // Yield between polls — avoid busy-spin; keep short for unit mocks.
    const pollYieldMs = 25;

    while (Date.now() < deadline) {
      const getResult = (await this.request("agent.get", {
        target: expectedPaneId,
      })) as { agent?: HerdrAgentStarted };
      const got = getResult.agent;
      if (!got?.pane_id || !got?.terminal_id) {
        throw new Error("agent.start: agent.get missing pane_id/terminal_id");
      }
      if (got.pane_id !== expectedPaneId || got.terminal_id !== expectedTerminalId) {
        throw new Error("agent.start: agent.get identity mismatch");
      }
      if (got.name !== undefined && got.name !== expectedName) {
        throw new Error("agent.start: agent.get name mismatch");
      }
      if (got.interactive_ready === true && got.launch_pending !== true) {
        return got;
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) break;
      await new Promise<void>((resolve) => {
        setTimeout(resolve, Math.min(pollYieldMs, remaining));
      });
    }
    throw new Error("agent.start: launch readiness timed out");
  }

  /**
   * PLAN 0.23.9 / 0.28.1: create a worker-pool tab (focus:false so global
   * focus is undisturbed). Protocol 17 carries worker `cwd`/`env` here
   * (and on `pane.split`), not on `agent.start`.
   * Returns tab id + root shell pane for subsequent close.
   */
  async tabCreate(opts: {
    workspaceId?: string;
    label?: string;
    cwd?: string | null;
    env?: Record<string, string>;
  }): Promise<{ tabId: string; rootPaneId: string }> {
    const params: Record<string, unknown> = { focus: false };
    if (opts.workspaceId !== undefined) params.workspace_id = opts.workspaceId;
    if (opts.label !== undefined) params.label = opts.label;
    if (opts.cwd !== undefined) params.cwd = opts.cwd;
    if (opts.env !== undefined) params.env = opts.env;
    const result = (await this.request("tab.create", params)) as {
      tab?: { tab_id?: string };
      root_pane?: { pane_id?: string };
      // Tolerate flatter shapes some herdr builds may return
      tab_id?: string;
      root_pane_id?: string;
    };
    const tabId =
      (typeof result.tab?.tab_id === "string" && result.tab.tab_id) ||
      (typeof result.tab_id === "string" && result.tab_id) ||
      "";
    const rootPaneId =
      (typeof result.root_pane?.pane_id === "string" && result.root_pane.pane_id) ||
      (typeof result.root_pane_id === "string" && result.root_pane_id) ||
      "";
    if (!tabId || !rootPaneId) {
      throw new Error("tab.create: missing tab_id/root_pane pane_id");
    }
    return { tabId, rootPaneId };
  }

  /**
   * Protocol 17 `pane.split` — create a shell pane for named agent start.
   * Required: `direction` (`right`|`down`). Optionals match fixture schema.
   * Response is `pane_info`; fails visibly if `pane.pane_id` is absent.
   */
  async paneSplit(opts: {
    direction: "right" | "down";
    targetPaneId?: string | null;
    workspaceId?: string | null;
    ratio?: number | null;
    cwd?: string | null;
    env?: Record<string, string>;
    focus?: boolean;
  }): Promise<{ paneId: string }> {
    const params: Record<string, unknown> = {
      direction: opts.direction,
    };
    if (opts.targetPaneId !== undefined) params.target_pane_id = opts.targetPaneId;
    if (opts.workspaceId !== undefined) params.workspace_id = opts.workspaceId;
    if (opts.ratio !== undefined) params.ratio = opts.ratio;
    if (opts.cwd !== undefined) params.cwd = opts.cwd;
    if (opts.env !== undefined) params.env = opts.env;
    if (opts.focus !== undefined) params.focus = opts.focus;
    const result = (await this.request("pane.split", params)) as {
      pane?: { pane_id?: string };
      pane_id?: string;
    };
    const paneId =
      (typeof result.pane?.pane_id === "string" && result.pane.pane_id) ||
      (typeof result.pane_id === "string" && result.pane_id) ||
      "";
    if (!paneId) {
      throw new Error("pane.split: missing pane.pane_id");
    }
    return { paneId };
  }

  /**
   * Protocol 17 atomic prompt — herdr owns paste+Enter (bracketed-paste).
   * Prompt body is an opaque `text` parameter only; never shell-interpolated
   * or converted to key sequences. Optional `wait` is omitted by default.
   */
  async agentPrompt(opts: {
    target: string;
    text: string;
    wait?: {
      until?: HerdrAgentStatus[];
      timeoutMs?: number | null;
    } | null;
  }): Promise<unknown> {
    const params: Record<string, unknown> = {
      target: opts.target,
      text: opts.text,
    };
    if (opts.wait !== undefined) {
      if (opts.wait === null) {
        params.wait = null;
      } else {
        const wait: Record<string, unknown> = {};
        if (opts.wait.until !== undefined) wait.until = opts.wait.until;
        if (opts.wait.timeoutMs !== undefined) {
          wait.timeout_ms = opts.wait.timeoutMs;
        }
        params.wait = wait;
      }
    }
    return this.request("agent.prompt", params);
  }

  /**
   * Protocol 17 logical key chords. Not the primary prompt path — do not
   * convert untrusted prompt text into keys. Key token names are caller-
   * supplied; this client invents none (fixture has no enumerated tokens).
   */
  async agentSendKeys(opts: { target: string; keys: string[] }): Promise<unknown> {
    return this.request("agent.send_keys", {
      target: opts.target,
      keys: opts.keys,
    });
  }

  /**
   * Protocol 17 server-owned agent wait. Does not redefine completion
   * authority (v0.28.0 U1–U11).
   */
  async agentWait(opts: {
    target: string;
    until?: HerdrAgentStatus[];
    timeoutMs?: number | null;
  }): Promise<unknown> {
    const params: Record<string, unknown> = {
      target: opts.target,
    };
    if (opts.until !== undefined) params.until = opts.until;
    if (opts.timeoutMs !== undefined) params.timeout_ms = opts.timeoutMs;
    return this.request("agent.wait", params);
  }

  /**
   * PLAN 0.23.9: list panes for pool occupancy audit (SSOT before spawn).
   * Only fields the bridge needs are projected.
   */
  async paneList(): Promise<Array<{ paneId: string; tabId: string; workspaceId: string }>> {
    const result = (await this.request("pane.list", {})) as {
      panes?: Array<{
        pane_id?: string;
        tab_id?: string;
        workspace_id?: string;
      }>;
    };
    const panes = Array.isArray(result.panes) ? result.panes : [];
    return panes
      .filter(
        (p) =>
          typeof p.pane_id === "string" &&
          p.pane_id.length > 0 &&
          typeof p.tab_id === "string" &&
          p.tab_id.length > 0,
      )
      .map((p) => ({
        paneId: p.pane_id as string,
        tabId: p.tab_id as string,
        workspaceId: typeof p.workspace_id === "string" ? p.workspace_id : "",
      }));
  }

  /**
   * PLAN 0.23.12 ⓑ: pane.layout wrapper (existing herdr op).
   * Returns panes[].rect{x,width} and splits[].{ratio,rect,direction}.
   * Optional paneId scopes to that pane's tab (snake_case on wire).
   */
  async paneLayout(paneId?: string): Promise<HerdrPaneLayout> {
    const params: Record<string, unknown> = {};
    if (paneId) params.pane_id = paneId;
    const result = (await this.request("pane.layout", params)) as {
      layout?: unknown;
      panes?: unknown;
      splits?: unknown;
    };
    const raw =
      result.layout && typeof result.layout === "object"
        ? (result.layout as { panes?: unknown; splits?: unknown })
        : result;
    return projectPaneLayout(raw);
  }

  /**
   * PLAN 0.23.12 ⓑ: pane.resize wrapper (existing herdr op).
   * amount = direct-split ratio delta (right=increase, left=decrease).
   * Response carries the new layout at result.resize.layout (probe ⑤).
   */
  async paneResize(opts: {
    paneId: string;
    direction: "left" | "right";
    amount: number;
  }): Promise<HerdrPaneLayout> {
    const result = (await this.request("pane.resize", {
      pane_id: opts.paneId,
      direction: opts.direction,
      amount: opts.amount,
    })) as {
      resize?: { layout?: unknown };
      layout?: unknown;
    };
    const raw =
      result.resize?.layout && typeof result.resize.layout === "object"
        ? (result.resize.layout as { panes?: unknown; splits?: unknown })
        : result.layout && typeof result.layout === "object"
          ? (result.layout as { panes?: unknown; splits?: unknown })
          : result;
    return projectPaneLayout(raw as { panes?: unknown; splits?: unknown });
  }

  /**
   * Primary inject path (PLAN 0.28.1): exactly one opaque `agent.prompt`
   * request. No wait option by default; no second key/send call.
   * Dual-`agent.send` + bare-Enter is protocol-16 only and is gone.
   */
  async injectPromptAndSubmit(target: string, prompt: string): Promise<void> {
    await this.agentPrompt({ target, text: prompt });
  }

  /**
   * Opens (or re-opens) the dedicated long-lived events connection.
   * Repeat calls MERGE into the stored subscription set (dedup by
   * type+pane_id) rather than replacing it — callers subscribe
   * incrementally per in-flight card/pane, and we want to keep watching all
   * of them. Because the real socket accepts no second request on an
   * already-open subscribe connection, extending the set requires opening a
   * fresh connection with the full merged list.
   *
   * R29 M-1: on reject, roll back only the entries newly added by this call.
   */
  async eventsSubscribe(subscriptions: HerdrEventSubscription[]): Promise<void> {
    if (this.closed) throw new Error("herdr client closed");
    const added: HerdrEventSubscription[] = [];
    for (const s of subscriptions) {
      const exists = this.subscriptions.some((x) => x.type === s.type && x.pane_id === s.pane_id);
      if (!exists) {
        this.subscriptions.push(s);
        added.push(s);
      }
    }
    try {
      await this.openEventConnection();
    } catch (e) {
      // M-1 lock: roll back only this call's additions
      if (added.length) {
        const drop = new Set(added.map(subKey));
        this.subscriptions = this.subscriptions.filter((x) => !drop.has(subKey(x)));
      }
      throw e;
    }
  }

  private ensureEventConnectDeferred(): EventConnectDeferred {
    if (!this.eventConnectDeferred) {
      let resolve!: () => void;
      let reject!: (err: Error) => void;
      const promise = new Promise<void>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      this.eventConnectDeferred = { resolve, reject, promise };
    }
    return this.eventConnectDeferred;
  }

  private finishEventConnect(err?: Error): void {
    const d = this.eventConnectDeferred;
    if (!d) return;
    this.eventConnectDeferred = null;
    if (err) d.reject(err);
    else d.resolve();
  }

  private openEventConnection(): Promise<void> {
    if (this.closed) {
      return Promise.reject(new Error("herdr client closed"));
    }
    const deferred = this.ensureEventConnectDeferred();
    this.eventGeneration += 1;
    const myGeneration = this.eventGeneration;
    this.eventEstablished = false;
    if (this.eventReconnectTimer) {
      clearTimeout(this.eventReconnectTimer);
      this.eventReconnectTimer = null;
    }
    const oldSocket = this.eventSocket;
    this.eventSocket = null;
    if (oldSocket) {
      try {
        oldSocket.destroy();
      } catch {
        /* */
      }
    }
    const id = this.nextId();
    // Snapshot list for this request payload (reopen uses current stored list).
    const subscriptions = this.subscriptions.slice();
    const timeoutMs = this.opts.timeoutMs ?? 15_000;
    let settled = false;
    const sock = createConnection(this.opts.socketPath);
    this.eventSocket = sock;

    // Declared early so finishLocal can always clear it (incl. superseded gen).
    let timer: ReturnType<typeof setTimeout> | null = null;
    const finishLocal = (err?: Error): void => {
      // PLAN 0.23.4 F-4: clear this generation's ACK timer even when superseded
      // so the timeout callback cannot fire after a newer openEventConnection.
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      // Only the current generation may settle the shared deferred (L-1).
      if (myGeneration !== this.eventGeneration) return;
      if (settled) return;
      settled = true;
      if (err) {
        this.eventEstablished = false;
        this.finishEventConnect(err);
      } else {
        this.eventEstablished = true;
        this._lastSubscribeAck = new Date().toISOString();
        this.eventReconnectDelay = EVENT_RECONNECT_BASE_MS;
        this.finishEventConnect();
      }
    };

    timer = setTimeout(() => {
      if (myGeneration !== this.eventGeneration) {
        // Superseded — drop our timer reference (may already be cleared).
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        return;
      }
      if (settled) return;
      try {
        sock.destroy();
      } catch {
        /* */
      }
      finishLocal(new Error(`herdr events.subscribe timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    sock.setEncoding("utf8");
    const buf = { text: "" };
    sock.on("connect", () => {
      const line = `${JSON.stringify({
        id,
        method: "events.subscribe",
        params: { subscriptions },
      })}\n`;
      sock.write(line);
    });
    sock.on("data", (chunk: string) => {
      buf.text += chunk;
      parseNdjsonLines(buf, (msg) => {
        if (!settled) {
          const msgId = msg.id != null ? String(msg.id) : "";
          if (msgId === id) {
            if (msg.error) {
              const err = msg.error as { message?: string; code?: string };
              try {
                sock.destroy();
              } catch {
                /* */
              }
              finishLocal(
                new Error(err.message ?? `herdr events.subscribe error ${err.code ?? "unknown"}`),
              );
              return;
            }
            finishLocal();
            return;
          }
        }
        if (isEventPush(msg)) {
          this.opts.onEvent?.(msg.event, msg.data);
        }
      });
    });
    sock.on("error", (err) => {
      const e = err instanceof Error ? err : new Error(String(err));
      if (!settled) {
        finishLocal(e);
      } else if (myGeneration === this.eventGeneration) {
        this.opts.onError?.(e);
      }
    });
    sock.on("close", () => {
      if (this.eventSocket === sock) this.eventSocket = null;
      // Superseded generation: clear local ACK timer; do not settle (L-1 / F-4).
      if (myGeneration !== this.eventGeneration) {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        return;
      }
      if (this.closed) return;
      if (!settled) {
        // Pre-ACK close → reject (root cause fix for permanent hang).
        finishLocal(new Error("herdr events connection closed before subscribe ACK"));
        // After reject, if subscriptions remain, keep reconnect backoff.
        if (this.subscriptions.length) this.scheduleEventReconnect();
        return;
      }
      // Established socket dropped — timer already cleared on ACK, but be safe.
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      this.eventEstablished = false;
      this.opts.onClose?.();
      if (this.subscriptions.length) this.scheduleEventReconnect();
    });

    return deferred.promise;
  }

  private scheduleEventReconnect(): void {
    if (this.eventReconnectTimer || this.closed) return;
    if (!this.subscriptions.length) return;
    const delay = this.eventReconnectDelay;
    this.eventReconnectTimer = setTimeout(() => {
      this.eventReconnectTimer = null;
      // Re-check: M-1 rollback or eventsPrune may have emptied the list
      // between schedule and fire.
      if (this.closed || !this.subscriptions.length) return;
      this.eventReconnectDelay = Math.min(this.eventReconnectDelay * 2, EVENT_RECONNECT_MAX_MS);
      this.openEventConnection().catch((e) => {
        this.opts.onError?.(e instanceof Error ? e : new Error(String(e)));
        this.scheduleEventReconnect();
      });
    }, delay);
  }

  async paneRead(paneId: string, opts?: { source?: string; lines?: number }): Promise<string> {
    const result = (await this.request("pane.read", {
      pane_id: paneId,
      source: opts?.source ?? "recent",
      format: "text",
      lines: opts?.lines ?? 200,
    })) as { read?: { text?: string } };
    return result.read?.text ?? "";
  }

  async sessionSnapshot(): Promise<unknown> {
    return this.request("session.snapshot", {});
  }
}

/** Strip ANSI / ESC sequences before attach (HERDR_DESIGN §3.7). */
export function stripAnsi(text: string): string {
  // CSI, OSC, and simple ESC sequences
  return (
    text
      // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI ESC stripping is intentional
      .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "")
      // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI ESC stripping is intentional
      .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, "")
      // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI ESC stripping is intentional
      .replace(/\u001b[@-Z\\-_]/g, "")
  );
}
