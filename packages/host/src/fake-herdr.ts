/**
 * Fixture-shaped fake herdr Unix NDJSON server for tests (protocol 16).
 */
import { unlinkSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Server } from "node:net";
import { createServer } from "node:net";

export type FakeHerdrOptions = {
  socketPath: string;
  /** Auto-emit agent status after send (default: done after short delay) */
  autoStatus?: "done" | "idle" | "blocked" | "none";
  autoStatusDelayMs?: number;
  protocol?: number;
  version?: string;
};

export type FakeHerdr = {
  socketPath: string;
  close: () => Promise<void>;
  /** Recorded RPC methods in order */
  calls: { method: string; params: Record<string, unknown> }[];
  pushEvent: (event: string, data: unknown) => void;
};

export async function startFakeHerdr(
  opts: FakeHerdrOptions,
): Promise<FakeHerdr> {
  const calls: FakeHerdr["calls"] = [];
  const sockets = new Set<import("node:net").Socket>();
  let paneCounter = 0;
  const panes = new Map<
    string,
    { terminal_id: string; text: string; status: string }
  >();

  if (existsSync(opts.socketPath)) {
    try {
      unlinkSync(opts.socketPath);
    } catch {
      /* */
    }
  }
  mkdirSync(dirname(opts.socketPath), { recursive: true });

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
          reply({
            type: "agent_started",
            agent: {
              pane_id,
              terminal_id,
              name: params.name ?? "agent",
              agent_status: "unknown",
            },
          });
          continue;
        }
        if (method === "agent.send") {
          const target = String(params.target ?? "");
          const text = String(params.text ?? "");
          for (const [, p] of panes) {
            if (p.terminal_id === target) {
              p.text += text;
              // M-2: bare Enter is separate call — when we see \n after content, mark working
              if (text === "\n") {
                p.status = "working";
                const auto = opts.autoStatus ?? "done";
                if (auto !== "none") {
                  const delay = opts.autoStatusDelayMs ?? 30;
                  setTimeout(() => {
                    p.status = auto === "idle" ? "idle" : auto;
                    const event =
                      auto === "done"
                        ? "pane_agent_status_changed"
                        : "pane_agent_status_changed";
                    const data = {
                      pane_id: [...panes.entries()].find(([, v]) => v === p)?.[0],
                      agent_status: auto === "idle" ? "idle" : auto,
                    };
                    // For idle path, emit working first then idle so sawWorking works
                    if (auto === "done" || auto === "blocked") {
                      sock.write(
                        `${JSON.stringify({ event, data })}\n`,
                      );
                    } else if (auto === "idle") {
                      sock.write(
                        `${JSON.stringify({
                          event,
                          data: { ...data, agent_status: "working" },
                        })}\n`,
                      );
                      setTimeout(() => {
                        sock.write(
                          `${JSON.stringify({
                            event,
                            data: { ...data, agent_status: "idle" },
                          })}\n`,
                        );
                      }, 10);
                    }
                  }, delay);
                }
              }
            }
          }
          reply({ type: "ok" });
          continue;
        }
        if (method === "events.subscribe") {
          reply({ type: "subscription_started" });
          continue;
        }
        if (method === "pane.read") {
          const pane_id = String(params.pane_id ?? "");
          const p = panes.get(pane_id);
          reply({
            type: "pane_read",
            read: {
              pane_id,
              source: params.source ?? "recent",
              format: "text",
              text: p?.text ?? "READY\n",
              truncated: false,
            },
          });
          continue;
        }
        if (method === "session.snapshot") {
          reply({
            type: "snapshot",
            workspaces: [],
          });
          continue;
        }
        err(`unknown method ${method}`);
      }
    });
    sock.on("close", () => sockets.delete(sock));
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(opts.socketPath, () => resolve());
    server.on("error", reject);
  });

  return {
    socketPath: opts.socketPath,
    calls,
    pushEvent(event, data) {
      const line = `${JSON.stringify({ event, data })}\n`;
      for (const s of sockets) {
        try {
          s.write(line);
        } catch {
          /* */
        }
      }
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
