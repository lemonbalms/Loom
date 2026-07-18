/**
 * Fixture-shaped fake herdr Unix NDJSON server for tests (protocol 16).
 *
 * Transport-honest per measured real herdr v0.7.4 behavior: every RPC gets
 * exactly one response then the server ends the connection (FIN). The one
 * exception is `events.subscribe`, whose connection stays open to carry
 * `{event,data}` pushes. Async pushes (e.g. the auto-status-after-send
 * timers below) are therefore broadcast to whatever sockets are still open
 * — in practice only the events.subscribe connection, since request
 * connections are ended right after their response.
 */
import { unlinkSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Server, Socket } from "node:net";
import { createServer } from "node:net";
import { BARE_ENTER } from "./herdr-client";

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
   * PLAN 0.23.5: when true, agent.send of non-BARE_ENTER does not append to
   * the pane text used by pane.read (simulates TUI startup paste loss —
   * inject lands nowhere visible). BARE_ENTER still flips status / autoStatus.
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
  /** Test-only: pane_id assigned to the most recent agent.start carrying this LOOM_CONV env. */
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
   * PLAN 0.23.5: next `count` pane.read RPCs reply with an error (then recover).
   */
  failPaneReads: (count: number) => void;
  /** PLAN 0.23.5: how many pane.read RPCs have been served. */
  paneReadCount: () => number;
  /** Toggle discardInjects at runtime (paste-loss simulation). */
  setDiscardInjects: (discard: boolean) => void;
};

export async function startFakeHerdr(
  opts: FakeHerdrOptions,
): Promise<FakeHerdr> {
  const calls: FakeHerdr["calls"] = [];
  const sockets = new Set<Socket>();
  let paneCounter = 0;
  let subscribeCallCount = 0;
  let subscribeFailsRemaining =
    opts.subscribeFailFromCall != null
      ? (opts.subscribeFailCount ?? Number.POSITIVE_INFINITY)
      : 0;
  const panes = new Map<
    string,
    { terminal_id: string; text: string; status: string }
  >();
  const closedPanes = new Set<string>();
  const paneIdByConv = new Map<string, string>();
  // PLAN 0.23.5 composer simulation
  const paneReadOverrides = new Map<string, string>();
  let defaultPaneReadOverride: string | null = null;
  let paneReadFailRemaining = 0;
  let paneReadCalls = 0;
  let discardInjects = opts.discardInjects === true;

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
            version: opts.version ?? "0.7.4",
            protocol: opts.protocol ?? 16,
            capabilities: { live_handoff: true },
          });
          sock.end();
          continue;
        }
        if (method === "agent.start") {
          paneCounter += 1;
          const pane_id = `w1:p${paneCounter}`;
          const terminal_id = `term_${paneCounter.toString(16)}`;
          panes.set(pane_id, {
            terminal_id,
            text: "",
            status: "unknown",
          });
          closedPanes.delete(pane_id);
          const env = (params.env ?? {}) as Record<string, string>;
          if (env.LOOM_CONV) paneIdByConv.set(env.LOOM_CONV, pane_id);
          reply({
            type: "agent_started",
            agent: {
              pane_id,
              terminal_id,
              name: params.name ?? "agent",
              agent_status: "unknown",
            },
          });
          sock.end();
          continue;
        }
        if (method === "agent.send") {
          const target = String(params.target ?? "");
          const text = String(params.text ?? "");
          for (const [paneId, p] of panes) {
            if (p.terminal_id === target) {
              // PLAN 0.23.5: discardInjects simulates paste-loss (empty composer)
              if (!(discardInjects && text !== BARE_ENTER)) {
                p.text += text;
              }
              // M-2: bare Enter is separate call — when we see BARE_ENTER (CR,
              // the terminal Enter key) after content, mark working
              if (text === BARE_ENTER) {
                p.status = "working";
                const auto = opts.autoStatus ?? "done";
                if (auto !== "none") {
                  const delay = opts.autoStatusDelayMs ?? 30;
                  setTimeout(() => {
                    p.status = auto === "idle" ? "idle" : auto;
                    const event = "pane_agent_status_changed";
                    const finalStatus = auto === "idle" ? "idle" : auto;
                    // Always emit working first so M-2 / 0.23.5 verify sees
                    // sawWorking (real herdr: working → idle/done/blocked).
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
              }
            }
          }
          reply({ type: "ok" });
          sock.end();
          continue;
        }
        if (method === "pane.close") {
          const pane_id = String(params.pane_id ?? "");
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
          if (paneReadOverrides.has(pane_id)) {
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
    failPaneReads(count: number) {
      paneReadFailRemaining = Math.max(0, count);
    },
    paneReadCount() {
      return paneReadCalls;
    },
    setDiscardInjects(discard: boolean) {
      discardInjects = discard;
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
