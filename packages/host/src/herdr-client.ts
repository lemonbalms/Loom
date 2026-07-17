/**
 * Herdr NDJSON Unix-socket client (v0.7.4 / protocol 16 fixtures).
 * AGPL boundary: socket RPC only — no herdr source vendoring.
 * PLAN 0.22.0 / HERDR_DESIGN §2.3
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

/** M-2: bare Enter as fixed constant — never interpolate prompt into submit. */
export const BARE_ENTER = "\n";

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
  onEvent?: (event: string, data: unknown) => void;
  onClose?: () => void;
  onError?: (err: Error) => void;
};

type Pending = {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export class HerdrClient {
  private socket: Socket | null = null;
  private buf = "";
  private pending = new Map<string, Pending>();
  private opts: HerdrClientOptions;
  private closed = false;

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

  connect(): Promise<void> {
    if (this.socket && !this.socket.destroyed) return Promise.resolve();
    this.closed = false;
    return new Promise((resolve, reject) => {
      const sock = createConnection(this.opts.socketPath);
      this.socket = sock;
      let settled = false;
      sock.setEncoding("utf8");
      sock.on("connect", () => {
        settled = true;
        resolve();
      });
      sock.on("data", (chunk: string) => this.onData(chunk));
      sock.on("error", (err) => {
        if (!settled) {
          settled = true;
          reject(err);
        } else {
          this.opts.onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      });
      sock.on("close", () => {
        this.failAll(new Error("herdr socket closed"));
        this.socket = null;
        this.opts.onClose?.();
      });
    });
  }

  close(): void {
    this.closed = true;
    this.failAll(new Error("herdr client closed"));
    try {
      this.socket?.destroy();
    } catch {
      /* */
    }
    this.socket = null;
  }

  private onData(chunk: string): void {
    this.buf += chunk;
    while (true) {
      const nl = this.buf.indexOf("\n");
      if (nl < 0) break;
      const line = this.buf.slice(0, nl).trim();
      this.buf = this.buf.slice(nl + 1);
      if (!line) continue;
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }
      // Event push: { event, data } — C2 underscore or dotted
      if (typeof msg.event === "string" && msg.id === undefined) {
        this.opts.onEvent?.(msg.event, msg.data);
        continue;
      }
      // Also accept { type: "event", event, data } shapes if any
      if (typeof msg.type === "string" && msg.type === "event" && typeof msg.event === "string") {
        this.opts.onEvent?.(msg.event, msg.data);
        continue;
      }
      const id = msg.id != null ? String(msg.id) : "";
      if (!id) continue;
      const p = this.pending.get(id);
      if (!p) continue;
      clearTimeout(p.timer);
      this.pending.delete(id);
      if (msg.error) {
        const err = msg.error as { message?: string; code?: string };
        p.reject(
          new Error(
            err.message ?? `herdr error ${err.code ?? "unknown"}`,
          ),
        );
      } else {
        p.resolve(msg.result ?? msg);
      }
    }
  }

  private failAll(err: Error): void {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }

  private nextId(): string {
    return `loom-${randomBytes(6).toString("hex")}`;
  }

  async request(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    if (this.closed) throw new Error("herdr client closed");
    await this.connect();
    const id = this.nextId();
    const timeoutMs = this.opts.timeoutMs ?? 15_000;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`herdr ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      const line = `${JSON.stringify({ id, method, params })}\n`;
      this.socket!.write(line, (err) => {
        if (err) {
          clearTimeout(timer);
          this.pending.delete(id);
          reject(err);
        }
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
  }): Promise<HerdrAgentStarted> {
    const params: Record<string, unknown> = {
      name: opts.name,
      argv: opts.argv,
      focus: opts.focus ?? false,
    };
    if (opts.env) params.env = opts.env;
    if (opts.cwd) params.cwd = opts.cwd;
    const result = (await this.request("agent.start", params)) as {
      agent?: HerdrAgentStarted;
    };
    const agent = result.agent;
    if (!agent?.pane_id || !agent?.terminal_id) {
      throw new Error("agent.start: missing pane_id/terminal_id");
    }
    return agent;
  }

  /** Literal text, no Enter (Step 0.5). */
  async agentSend(target: string, text: string): Promise<void> {
    await this.request("agent.send", { target, text });
  }

  /**
   * M-2 submit separation: send untrusted prompt via agent.send, then bare Enter
   * as a fixed constant on a separate call (never pane.run with prompt interpolation).
   */
  async injectPromptAndSubmit(target: string, prompt: string): Promise<void> {
    await this.agentSend(target, prompt);
    await this.agentSend(target, BARE_ENTER);
  }

  async eventsSubscribe(
    subscriptions: { type: string; pane_id?: string }[],
  ): Promise<void> {
    await this.request("events.subscribe", { subscriptions });
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
