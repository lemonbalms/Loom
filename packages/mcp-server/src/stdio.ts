#!/usr/bin/env bun
/**
 * Minimal MCP server over stdio for Loom room tools.
 */
import {
  toolHandoff,
  toolListPeers,
  toolRoomChat,
  toolCheckHandoffs,
  toolClaimHandoff,
  toolGetContextPack,
  toolGetPurpose,
  toolSetPurpose,
  toolListTasks,
  toolAddTask,
  toolUpdateTask,
  toolExportBoard,
  toolImportBoard,
  toolDispatchCard,
  toolApplyCardResult,
  toolConvOpen,
  toolConvSend,
  toolConvAwait,
  toolConvClose,
  toolConvFetch,
  mcpResultJson,
} from "./tools";
import { lstatSync, type Stats, statSync } from "node:fs";
import { join } from "node:path";
import {
  appendPolicyAudit,
  evaluateMcpCall,
  type LoomToolsGate,
  loadPolicy,
  loadSession,
  loomDir,
  type McpCallCtx,
  type PolicyAuditRecord,
  resolveLoomToolsGate,
  toolVisible,
} from "@loom/host";
import type { ArtifactRefEntry } from "@loom/protocol";
import { TOOL_DEFINITIONS, toolRegistry } from "./tool-schemas";

type JsonRpcReq = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

/** 0.32.0 D2: advertised inputSchema is derived from the zod schemas (tool-schemas.ts). */
const TOOLS = TOOL_DEFINITIONS;

// ---------------------------------------------------------------------------
// 0.32.0 D9: policy gate — loaded at start, re-stat'ed before every tools/list and
// tools/call, reloaded on change. A loader failure becomes an invalid gate (every call
// refused with the loader message, list unfiltered) — never an exit.
//
// P4 verify round 1 (fail closed): the cache key comes from lstat of policy.json (entry
// type + ino + mtimeMs + ctimeMs + size; for a symlink also the target's stat or its
// error), so a dangling symlink never shares the "absent" key. Only an lstat ENOENT is
// "absent"; every other state goes through loadPolicy, which decides (and throws for
// dangling links, non-regular files, lookup errors). An invalid gate is never trusted
// from cache — loadPolicy re-runs on every list/call until it succeeds.
// Remaining limit: an in-place rewrite that keeps inode, size, mtimeMs and ctimeMs all
// identical (same filesystem timestamp tick) is not seen until the next real change.
// ---------------------------------------------------------------------------

let policyState: { key: string; gate: LoomToolsGate } | null = null;

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function errCode(e: unknown): string {
  return e && typeof e === "object" && "code" in e ? String(e.code) : "error";
}

function entryType(st: Stats): string {
  if (st.isFile()) return "file";
  if (st.isSymbolicLink()) return "symlink";
  if (st.isDirectory()) return "dir";
  return "other";
}

function statPart(st: Stats): string {
  return `${entryType(st)}:${st.ino}:${st.mtimeMs}:${st.ctimeMs}:${st.size}`;
}

function policyStatKey(dir: string): string {
  const path = join(dir, "policy.json");
  let link: Stats;
  try {
    link = lstatSync(path);
  } catch (e) {
    const code = errCode(e);
    return `${dir}\0${code === "ENOENT" ? "absent" : `lstat-err:${code}`}`;
  }
  let key = `${dir}\0${statPart(link)}`;
  if (link.isSymbolicLink()) {
    try {
      key += `->${statPart(statSync(path))}`;
    } catch (e) {
      key += `->stat-err:${errCode(e)}`;
    }
  }
  return key;
}

function loadGate(dir: string): LoomToolsGate {
  try {
    return resolveLoomToolsGate(loadPolicy(dir));
  } catch (e) {
    return resolveLoomToolsGate({ invalid: errText(e) });
  }
}

/** One gate snapshot per list/call (no reload mid-call). */
function currentGate(): LoomToolsGate {
  let dir: string;
  try {
    dir = loomDir();
  } catch (e) {
    return resolveLoomToolsGate({ invalid: `Loom state dir unavailable: ${errText(e)}` });
  }
  const key = policyStatKey(dir);
  if (policyState === null || policyState.key !== key || policyState.gate.invalid !== undefined) {
    policyState = { key, gate: loadGate(dir) };
  }
  return policyState.gate;
}

/** Session identity for the decision ctx / audit (missing → empty strings). */
function callCtx(): McpCallCtx {
  let session: ReturnType<typeof loadSession> = null;
  try {
    session = loadSession();
  } catch {
    session = null;
  }
  return {
    peerId: session?.peerId ?? "",
    roomId: session?.roomId ?? "",
    agentKind: session?.agentKind ?? "",
    now: new Date().toISOString(),
  };
}

/** Best-effort audit append — failure never changes the decision. */
function audit(roomId: string, record: PolicyAuditRecord): void {
  try {
    appendPolicyAudit(loomDir(), roomId, record);
  } catch {
    // appendPolicyAudit already reports its own failures on stderr.
  }
}

/** Caller-supplied tool name, printable + capped, for the one stderr refusal line. */
function logSafe(name: string): string {
  const printable = name.replace(/[^\x21-\x7e]/g, "?");
  return printable.length > 64 ? `${printable.slice(0, 64)}…` : printable;
}

function respond(id: string | number | null | undefined, result: unknown) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: id ?? null, result }) + "\n");
}

function respondError(
  id: string | number | null | undefined,
  code: number,
  message: string,
) {
  process.stdout.write(
    JSON.stringify({
      jsonrpc: "2.0",
      id: id ?? null,
      error: { code, message },
    }) + "\n",
  );
}

async function handle(req: JsonRpcReq) {
  switch (req.method) {
    case "initialize":
      respond(req.id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "loom", version: "0.31.0" },
      });
      return;
    case "notifications/initialized":
    case "initialized":
      return;
    case "tools/list": {
      // 0.32.0 D1 / D3 / R50-M1: the same predicate the call path uses (toolVisible).
      const gate = currentGate();
      respond(req.id, {
        tools: TOOLS.filter((t) => toolVisible(gate, toolRegistry, t.name)),
      });
      return;
    }
    case "tools/call": {
      const name = String(req.params?.name ?? "");
      // 0.32.0 D1 / R6: one decision before the dispatch chain — policy invalid → unknown
      // tool → mcp.deny → strict args → deny modes → done. Only omitted arguments default
      // to {} (inside validate); explicit null is validated and refused.
      const ctx = callCtx();
      const decision = evaluateMcpCall(currentGate(), toolRegistry, name, req.params?.arguments, ctx);
      if (!decision.ok) {
        process.stderr.write(
          `[loom-mcp] precheck refused tool=${logSafe(name)} reason=${decision.reason}\n`,
        );
        audit(ctx.roomId, decision.audit);
        if (decision.reason === "unknown_tool") {
          // R5: unknown names keep today's JSON-RPC -32601 response.
          respondError(req.id, -32601, `Unknown tool: ${name}`);
          return;
        }
        respond(req.id, {
          content: [{ type: "text", text: decision.message }],
          isError: true,
        });
        return;
      }
      const args = decision.args;
      try {
        let text: string;
        if (name === "list_peers") {
          text = mcpResultJson(await toolListPeers(), 2);
        } else if (name === "handoff") {
          text = mcpResultJson(
            await toolHandoff({
              to: String(args.to ?? "*"),
              body: String(args.body ?? ""),
              mode: args.mode === "task" ? "task" : "message",
              withPack: Boolean(args.withPack || args.withPackEmbed),
              withPackEmbed: Boolean(args.withPackEmbed),
              withBoard: Boolean(args.withBoard),
              trackBoard:
                args.trackBoard === undefined
                  ? undefined
                  : Boolean(args.trackBoard),
            }),
          );
        } else if (name === "get_context_pack") {
          text = mcpResultJson(await toolGetContextPack(), 2);
        } else if (name === "get_purpose") {
          text = mcpResultJson(await toolGetPurpose(), 2);
        } else if (name === "set_purpose") {
          text = mcpResultJson(
            await toolSetPurpose({
              purpose:
                args.purpose !== undefined ? String(args.purpose) : undefined,
              successCriteria: Array.isArray(args.successCriteria)
                ? args.successCriteria.map(String)
                : undefined,
              outOfScope: Array.isArray(args.outOfScope)
                ? args.outOfScope.map(String)
                : undefined,
              notes: args.notes !== undefined ? String(args.notes) : undefined,
              verify: Array.isArray(args.verify)
                ? args.verify.map(String)
                : args.verify !== undefined
                  ? [String(args.verify)]
                  : undefined,
            }),
            2,
          );
        } else if (name === "list_tasks") {
          text = mcpResultJson(await toolListTasks(), 2);
        } else if (name === "add_task") {
          text = mcpResultJson(
            await toolAddTask({
              title: String(args.title ?? ""),
              assignee:
                args.assignee !== undefined
                  ? String(args.assignee)
                  : undefined,
              status:
                args.status !== undefined ? String(args.status) : undefined,
              notify: Boolean(args.notify),
              notes:
                args.notes !== undefined ? String(args.notes) : undefined,
            }),
            2,
          );
        } else if (name === "update_task") {
          text = mcpResultJson(
            await toolUpdateTask({
              id: String(args.id ?? ""),
              status:
                args.status !== undefined ? String(args.status) : undefined,
              assignee:
                args.assignee !== undefined
                  ? String(args.assignee)
                  : undefined,
              title:
                args.title !== undefined ? String(args.title) : undefined,
              notes:
                args.notes !== undefined ? String(args.notes) : undefined,
            }),
            2,
          );
        } else if (name === "export_board") {
          text = mcpResultJson(await toolExportBoard(), 2);
        } else if (name === "import_board") {
          text = mcpResultJson(
            await toolImportBoard({
              snapshot: args.snapshot,
              mode: args.mode === "replace" ? "replace" : "merge",
              force: Boolean(args.force),
            }),
            2,
          );
        } else if (name === "room_chat") {
          text = mcpResultJson(
            await toolRoomChat({ text: String(args.text ?? "") }),
          );
        } else if (name === "check_handoffs") {
          text = mcpResultJson(await toolCheckHandoffs(), 2);
        } else if (name === "claim_handoff") {
          text = mcpResultJson(
            await toolClaimHandoff({ id: String(args.id ?? "") }),
            2,
          );
        } else if (name === "dispatch_card") {
          text = mcpResultJson(
            await toolDispatchCard({
              taskId: String(args.taskId ?? ""),
              node: String(args.node ?? ""),
              prompt: String(args.prompt ?? ""),
              agentKind:
                args.agentKind !== undefined
                  ? String(args.agentKind)
                  : undefined,
            }),
            2,
          );
        } else if (name === "apply_card_result") {
          text = mcpResultJson(
            await toolApplyCardResult({
              resultJson: String(args.resultJson ?? ""),
              fromPeerId:
                args.fromPeerId !== undefined
                  ? String(args.fromPeerId)
                  : undefined,
              fromNode:
                args.fromNode !== undefined
                  ? String(args.fromNode)
                  : undefined,
            }),
            2,
          );
        } else if (name === "conv_open") {
          text = mcpResultJson(
            await toolConvOpen({
              node: String(args.node ?? ""),
              goal: String(args.goal ?? ""),
              cwd: args.cwd !== undefined ? String(args.cwd) : undefined,
              writesAllowed: Boolean(args.writesAllowed),
              maxTurns:
                typeof args.maxTurns === "number" ? args.maxTurns : undefined,
              wallClockMs:
                typeof args.wallClockMs === "number" ? args.wallClockMs : undefined,
              agentKind:
                args.agentKind !== undefined
                  ? String(args.agentKind)
                  : undefined,
            }),
            2,
          );
        } else if (name === "conv_send") {
          text = mcpResultJson(
            await toolConvSend({
              convId: String(args.convId ?? ""),
              text: String(args.text ?? ""),
              kind: args.kind !== undefined ? String(args.kind) : undefined,
              artifacts: Array.isArray(args.artifacts)
                ? (args.artifacts as unknown as ArtifactRefEntry[])
                : undefined,
            }),
            2,
          );
        } else if (name === "conv_await") {
          text = mcpResultJson(
            await toolConvAwait({
              convId: args.convId !== undefined ? String(args.convId) : undefined,
              timeoutSec:
                typeof args.timeoutSec === "number" ? args.timeoutSec : undefined,
            }),
            2,
          );
        } else if (name === "conv_close") {
          text = mcpResultJson(
            await toolConvClose({
              convId: String(args.convId ?? ""),
              reason: args.reason !== undefined ? String(args.reason) : undefined,
            }),
            2,
          );
        } else if (name === "conv_fetch") {
          text = mcpResultJson(
            await toolConvFetch({
              convId: String(args.convId ?? ""),
              seq: typeof args.seq === "number" ? args.seq : Number(args.seq),
              index:
                typeof args.index === "number" ? args.index : Number(args.index),
            }),
            2,
          );
        } else {
          respondError(req.id, -32601, `Unknown tool: ${name}`);
          return;
        }
        // D4 allow: done_via_mcp is recorded only once the dispatch returned without throwing.
        if (decision.audit) audit(ctx.roomId, decision.audit);
        respond(req.id, {
          content: [{ type: "text", text }],
          isError: false,
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        respond(req.id, {
          content: [{ type: "text", text: message }],
          isError: true,
        });
      }
      return;
    }
    case "ping":
      respond(req.id, {});
      return;
    default:
      if (req.id !== undefined && req.id !== null) {
        respondError(req.id, -32601, `Method not found: ${req.method}`);
      }
  }
}

// D9: initial load at server start (an invalid policy never stops the server).
currentGate();

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  if (buffer.includes("Content-Length:")) {
    processContentLength();
  } else {
    processNdjson();
  }
});

function processNdjson() {
  while (true) {
    const idx = buffer.indexOf("\n");
    if (idx < 0) break;
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    try {
      void handle(JSON.parse(line) as JsonRpcReq);
    } catch {
      /* ignore */
    }
  }
}

function processContentLength() {
  while (true) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd < 0) return;
    const header = buffer.slice(0, headerEnd);
    const match = /Content-Length:\s*(\d+)/i.exec(header);
    if (!match) {
      buffer = buffer.slice(headerEnd + 4);
      continue;
    }
    const len = Number(match[1]);
    const bodyStart = headerEnd + 4;
    if (buffer.length < bodyStart + len) return;
    const body = buffer.slice(bodyStart, bodyStart + len);
    buffer = buffer.slice(bodyStart + len);
    try {
      void handle(JSON.parse(body) as JsonRpcReq);
    } catch {
      /* ignore */
    }
  }
}

process.stdin.on("end", () => process.exit(0));
