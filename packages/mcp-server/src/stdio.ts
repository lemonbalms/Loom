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
} from "./tools";
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
    case "tools/list":
      respond(req.id, { tools: TOOLS });
      return;
    case "tools/call": {
      const name = String(req.params?.name ?? "");
      let args: Record<string, unknown> = {};
      // 0.32.0 P3 (D2): strict argument validation for known tools — wrong types / unknown
      // keys are refused as isError text (path + zod code, never the value). Only omitted
      // arguments default to {} (inside validate); explicit null is validated and refused.
      // Unknown tool names fall through to the -32601 path below (R5). P4 replaces this hook.
      if (toolRegistry.has(name)) {
        const checked = toolRegistry.validate(name, req.params?.arguments);
        if (!checked.ok) {
          respond(req.id, {
            content: [
              {
                type: "text",
                text: `Loom pre-check refused ${name}: invalid_args at ${checked.path} (${checked.code}). Fix the arguments to match the tool's inputSchema and retry.`,
              },
            ],
            isError: true,
          });
          return;
        }
        args = checked.args;
      }
      try {
        let text: string;
        if (name === "list_peers") {
          text = JSON.stringify(await toolListPeers(), null, 2);
        } else if (name === "handoff") {
          text = JSON.stringify(
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
          text = JSON.stringify(await toolGetContextPack(), null, 2);
        } else if (name === "get_purpose") {
          text = JSON.stringify(await toolGetPurpose(), null, 2);
        } else if (name === "set_purpose") {
          text = JSON.stringify(
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
            null,
            2,
          );
        } else if (name === "list_tasks") {
          text = JSON.stringify(await toolListTasks(), null, 2);
        } else if (name === "add_task") {
          text = JSON.stringify(
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
            null,
            2,
          );
        } else if (name === "update_task") {
          text = JSON.stringify(
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
            null,
            2,
          );
        } else if (name === "export_board") {
          text = JSON.stringify(await toolExportBoard(), null, 2);
        } else if (name === "import_board") {
          text = JSON.stringify(
            await toolImportBoard({
              snapshot: args.snapshot,
              mode: args.mode === "replace" ? "replace" : "merge",
              force: Boolean(args.force),
            }),
            null,
            2,
          );
        } else if (name === "room_chat") {
          text = JSON.stringify(
            await toolRoomChat({ text: String(args.text ?? "") }),
          );
        } else if (name === "check_handoffs") {
          text = JSON.stringify(await toolCheckHandoffs(), null, 2);
        } else if (name === "claim_handoff") {
          text = JSON.stringify(
            await toolClaimHandoff({ id: String(args.id ?? "") }),
            null,
            2,
          );
        } else if (name === "dispatch_card") {
          text = JSON.stringify(
            await toolDispatchCard({
              taskId: String(args.taskId ?? ""),
              node: String(args.node ?? ""),
              prompt: String(args.prompt ?? ""),
              agentKind:
                args.agentKind !== undefined
                  ? String(args.agentKind)
                  : undefined,
            }),
            null,
            2,
          );
        } else if (name === "apply_card_result") {
          text = JSON.stringify(
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
            null,
            2,
          );
        } else if (name === "conv_open") {
          text = JSON.stringify(
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
            null,
            2,
          );
        } else if (name === "conv_send") {
          text = JSON.stringify(
            await toolConvSend({
              convId: String(args.convId ?? ""),
              text: String(args.text ?? ""),
              kind: args.kind !== undefined ? String(args.kind) : undefined,
              artifacts: Array.isArray(args.artifacts)
                ? (args.artifacts as unknown as ArtifactRefEntry[])
                : undefined,
            }),
            null,
            2,
          );
        } else if (name === "conv_await") {
          text = JSON.stringify(
            await toolConvAwait({
              convId: args.convId !== undefined ? String(args.convId) : undefined,
              timeoutSec:
                typeof args.timeoutSec === "number" ? args.timeoutSec : undefined,
            }),
            null,
            2,
          );
        } else if (name === "conv_close") {
          text = JSON.stringify(
            await toolConvClose({
              convId: String(args.convId ?? ""),
              reason: args.reason !== undefined ? String(args.reason) : undefined,
            }),
            null,
            2,
          );
        } else if (name === "conv_fetch") {
          text = JSON.stringify(
            await toolConvFetch({
              convId: String(args.convId ?? ""),
              seq: typeof args.seq === "number" ? args.seq : Number(args.seq),
              index:
                typeof args.index === "number" ? args.index : Number(args.index),
            }),
            null,
            2,
          );
        } else {
          respondError(req.id, -32601, `Unknown tool: ${name}`);
          return;
        }
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
