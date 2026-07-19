/**
 * Herdr NDJSON Unix-socket client (v0.7.4 / protocol 16 fixtures).
 * AGPL boundary: socket RPC only — no herdr source vendoring.
 * PLAN 0.22.0 / HERDR_DESIGN §2.3
 * PLAN 0.23.4 — subscription lifecycle (prune, pre-ACK reject, ACK timeout, M-1 rollback).
 *
 * Transport note (measured against real herdr v0.7.4): the socket is
 * one-RPC-per-connection — any request gets a response then the server
 * sends FIN and the connection closes. The lone exception is
 * `events.subscribe`, whose connection stays open to carry `{event,data}`
 * pushes (but accepts no further requests). `request()` therefore opens a
 * fresh connection per call; `eventsSubscribe()` keeps one dedicated
 * long-lived connection for pushes, reconnecting with backoff if it drops.
 */
import { createConnection, type Socket } from "node:net";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";

export const HERDR_PROTOCOL_EXPECTED = 16;
export const DEFAULT_HERDR_SOCKET = join(
  homedir(),
  ".config",
  "herdr",
  "herdr.sock",
);

/**
 * M-2: bare Enter as fixed constant — never interpolate prompt into submit.
 * CR = terminal Enter key; live-measured against real herdr — LF only
 * inserts a newline into the Claude Code composer without submitting.
 */
export const BARE_ENTER = "\r";

const EVENT_RECONNECT_BASE_MS = 500;
const EVENT_RECONNECT_MAX_MS = 5_000;

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
};

export type HerdrClientOptions = {
  socketPath: string;
  /** Request timeout ms (default 15s) */
  timeoutMs?: number;
  /**
   * Grace period (ms) between prompt injection and the bare-Enter submit —
   * the composer needs time to finish processing the pasted prompt before
   * CR registers as Enter. Live-measured: an immediate CR is swallowed.
   * Default 500.
   */
  submitDelayMs?: number;
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

function projectPaneLayout(raw: {
  panes?: unknown;
  splits?: unknown;
}): HerdrPaneLayout {
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
    const direction =
      typeof rec.direction === "string" ? rec.direction : "";
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
  return (
    typeof msg.type === "string" &&
    msg.type === "event" &&
    typeof msg.event === "string"
  );
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
            finish(() =>
              reject(new Error(err.message ?? `herdr error ${err.code ?? "unknown"}`)),
            );
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

  async agentStart(opts: {
    name: string;
    argv: string[];
    env?: Record<string, string>;
    cwd?: string;
    focus?: boolean;
    /** PLAN 0.23.9: pool placement — snake_case on wire. */
    tabId?: string;
    split?: "right" | "down";
  }): Promise<HerdrAgentStarted> {
    const params: Record<string, unknown> = {
      name: opts.name,
      argv: opts.argv,
      focus: opts.focus ?? false,
    };
    if (opts.env) params.env = opts.env;
    if (opts.cwd) params.cwd = opts.cwd;
    if (opts.tabId) params.tab_id = opts.tabId;
    if (opts.split) params.split = opts.split;
    const result = (await this.request("agent.start", params)) as {
      agent?: HerdrAgentStarted;
    };
    const agent = result.agent;
    if (!agent?.pane_id || !agent?.terminal_id) {
      throw new Error("agent.start: missing pane_id/terminal_id");
    }
    return agent;
  }

  /**
   * PLAN 0.23.9: create a worker-pool tab (focus:false so global focus is
   * undisturbed). Returns tab id + root shell pane for subsequent close.
   */
  async tabCreate(opts: {
    workspaceId?: string;
    label?: string;
  }): Promise<{ tabId: string; rootPaneId: string }> {
    const params: Record<string, unknown> = { focus: false };
    if (opts.workspaceId) params.workspace_id = opts.workspaceId;
    if (opts.label) params.label = opts.label;
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
      (typeof result.root_pane?.pane_id === "string" &&
        result.root_pane.pane_id) ||
      (typeof result.root_pane_id === "string" && result.root_pane_id) ||
      "";
    if (!tabId || !rootPaneId) {
      throw new Error("tab.create: missing tab_id/root_pane pane_id");
    }
    return { tabId, rootPaneId };
  }

  /**
   * PLAN 0.23.9: list panes for pool occupancy audit (SSOT before spawn).
   * Only fields the bridge needs are projected.
   */
  async paneList(): Promise<
    Array<{ paneId: string; tabId: string; workspaceId: string }>
  > {
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
        workspaceId:
          typeof p.workspace_id === "string" ? p.workspace_id : "",
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

  /** Literal text, no Enter (Step 0.5). */
  async agentSend(target: string, text: string): Promise<void> {
    await this.request("agent.send", { target, text });
  }

  /**
   * M-2 submit separation: send untrusted prompt via agent.send, then bare Enter
   * as a fixed constant on a separate call (never pane.run with prompt interpolation).
   * These are two independent per-request connections — correct under the
   * one-RPC-per-connection transport (see file header).
   * A grace period separates the two: the composer needs time to finish
   * processing the pasted prompt before an immediate CR would otherwise be
   * swallowed (live-measured).
   */
  async injectPromptAndSubmit(target: string, prompt: string): Promise<void> {
    await this.agentSend(target, prompt);
    const delay = this.opts.submitDelayMs ?? 500;
    await new Promise((r) => setTimeout(r, delay));
    await this.agentSend(target, BARE_ENTER);
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
      const exists = this.subscriptions.some(
        (x) => x.type === s.type && x.pane_id === s.pane_id,
      );
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
      finishLocal(
        new Error(`herdr events.subscribe timed out after ${timeoutMs}ms`),
      );
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
                new Error(
                  err.message ??
                    `herdr events.subscribe error ${err.code ?? "unknown"}`,
                ),
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
        finishLocal(
          new Error("herdr events connection closed before subscribe ACK"),
        );
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
      this.eventReconnectDelay = Math.min(
        this.eventReconnectDelay * 2,
        EVENT_RECONNECT_MAX_MS,
      );
      this.openEventConnection().catch((e) => {
        this.opts.onError?.(e instanceof Error ? e : new Error(String(e)));
        this.scheduleEventReconnect();
      });
    }, delay);
  }

  async paneRead(
    paneId: string,
    opts?: { source?: string; lines?: number },
  ): Promise<string> {
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
  return text
    // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI ESC stripping is intentional
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "")
    // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI ESC stripping is intentional
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, "")
    // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI ESC stripping is intentional
    .replace(/\u001b[@-Z\\-_]/g, "");
}
