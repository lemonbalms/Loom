import { existsSync } from "node:fs";
import { createConnection } from "node:net";
import { join, relative, resolve, sep } from "node:path";
import type { HandoffPayload, PeerInfo } from "@loom/protocol";
import { preparePasteInjectText } from "./handoff-inject";
import { getActiveProfile, loomDir } from "./session-store";

export type InjectAcceptedAck =
  | { ok: true }
  | { ok: false; reason?: string };

export type NotifyInjectResult =
  | { ok: true }
  | { ok: false; reason: "no_listener" | "timeout" | "bad_ack" };

export function runIdForCurrentProfile(): string {
  return getActiveProfile() ?? "default";
}

function sanitizeRunId(runId: string): string {
  return runId.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 80) || "default";
}

export function injectSocketPath(runId: string): string {
  return join(loomDir(), `inject-${sanitizeRunId(runId)}.sock`);
}

export function injectIdleMarkerPath(runId: string): string {
  return join(loomDir(), `inject-${sanitizeRunId(runId)}.idle`);
}

export function isPathUnderLoomDir(path: string): boolean {
  const rel = relative(resolve(loomDir()), resolve(path));
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`));
}

export function buildInjectAcceptedLine(
  handoff: HandoffPayload,
  from?: PeerInfo,
): string {
  const prepared = preparePasteInjectText(handoff, from);
  return `${JSON.stringify({ id: handoff.id, text: prepared.text })}\n`;
}

export async function notifyInjectAccepted(
  handoff: HandoffPayload,
  from?: PeerInfo,
  opts?: { socketPath?: string; timeoutMs?: number },
): Promise<NotifyInjectResult> {
  const socketPath = opts?.socketPath ?? injectSocketPath(runIdForCurrentProfile());
  if (!isPathUnderLoomDir(socketPath) || !existsSync(socketPath)) {
    return { ok: false, reason: "no_listener" };
  }

  const timeoutMs = opts?.timeoutMs ?? 500;
  const line = buildInjectAcceptedLine(handoff, from);

  return await new Promise<NotifyInjectResult>((resolveResult) => {
    let settled = false;
    let ack = "";
    let connected = false;
    const socket = createConnection({ path: socketPath });
    const done = (result: NotifyInjectResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.destroy();
      } catch {
        /* best-effort */
      }
      resolveResult(result);
    };
    const timer = setTimeout(
      () => done({ ok: false, reason: "timeout" }),
      timeoutMs,
    );

    socket.on("connect", () => {
      connected = true;
      socket.write(line, (err) => {
        if (err) done({ ok: false, reason: "no_listener" });
      });
    });
    socket.on("data", (chunk) => {
      ack += chunk.toString("utf8");
      const nl = ack.indexOf("\n");
      if (nl < 0) return;
      try {
        const parsed = JSON.parse(ack.slice(0, nl)) as InjectAcceptedAck;
        done(parsed.ok ? { ok: true } : { ok: false, reason: "no_listener" });
      } catch {
        done({ ok: false, reason: "bad_ack" });
      }
    });
    socket.on("end", () => {
      if (!settled) done({ ok: false, reason: "no_listener" });
    });
    socket.on("error", () =>
      done({ ok: false, reason: connected ? "bad_ack" : "no_listener" }),
    );
  });
}
