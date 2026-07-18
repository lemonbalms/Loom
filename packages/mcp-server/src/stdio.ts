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
} from "./tools";
import type { ArtifactRefEntry } from "@loom/protocol";

type JsonRpcReq = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

const TOOLS = [
  {
    name: "list_peers",
    description:
      "List peers in the Loom room (name, agent, id, online/offline).",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "handoff",
    description:
      "Send a message/task to another peer (@name, id, or *). Works even if target is offline (queued in their inbox). Returns status queued|delivered|peer_unknown. Optional withPack attaches local room context pack (summary/paths/notes). withPackEmbed also embeds file bodies (L-5; re-resolves allowlist at send).",
    inputSchema: {
      type: "object",
      properties: {
        to: {
          type: "string",
          description: "@displayName, peer id, or * for broadcast",
        },
        body: { type: "string", description: "Message or task" },
        mode: {
          type: "string",
          enum: ["message", "task"],
        },
        withPack: {
          type: "boolean",
          description: "Attach local context pack as handoff attachments",
        },
        withPackEmbed: {
          type: "boolean",
          description:
            "L-5: embed file bodies for pack paths (implies withPack; allowlist re-checked at send)",
        },
        withBoard: {
          type: "boolean",
          description:
            "Attach local task board snapshot (multi-machine share; receiver import_board or loom board import-handoff)",
        },
        trackBoard: {
          type: "boolean",
          description:
            "Also create a room task board item linked to this handoff (default true when mode=task)",
        },
      },
      required: ["to", "body"],
    },
  },
  {
    name: "get_context_pack",
    description:
      "Read the local room context pack (summary, cwd-relative paths, notes). Pack is local until attached via handoff withPack.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "get_purpose",
    description:
      "Read the local room purpose card (purpose, success criteria, out-of-scope, verify recipes). Room-scoped on this machine.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "set_purpose",
    description:
      "Update room purpose / successCriteria / outOfScope / notes. Cannot set verify[] (M-24 — use CLI loom purpose set --verify). Same UID residual as board.",
    inputSchema: {
      type: "object",
      properties: {
        purpose: { type: "string" },
        successCriteria: {
          type: "array",
          items: { type: "string" },
        },
        outOfScope: {
          type: "array",
          items: { type: "string" },
        },
        notes: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "list_tasks",
    description:
      "List tasks on the local room task board (todo/doing/done/blocked/cancelled). Room-scoped on this machine.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "add_task",
    description:
      "Add a task to the local room board. Optional notify=true sends handoff to assignee (L-32: default false).",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        assignee: { type: "string", description: "@name or bare name" },
        status: {
          type: "string",
          enum: ["todo", "doing", "done", "blocked", "cancelled"],
        },
        notes: { type: "string" },
        notify: {
          type: "boolean",
          description: "If true, handoff [GOAL] to assignee (default false)",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "update_task",
    description: "Update task status, assignee, title, or notes by id.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        status: {
          type: "string",
          enum: ["todo", "doing", "done", "blocked", "cancelled"],
        },
        assignee: { type: "string" },
        title: { type: "string" },
        notes: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "export_board",
    description:
      "Export the local room task board as a portable snapshot (JSON). Use for multi-machine share.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "import_board",
    description:
      "Import a board snapshot into the current room board. mode=merge (default) or replace. force=true if sourceRoomId differs.",
    inputSchema: {
      type: "object",
      properties: {
        snapshot: { type: "object", description: "loom-board-snapshot object" },
        mode: { type: "string", enum: ["merge", "replace"] },
        force: {
          type: "boolean",
          description: "Allow import when sourceRoomId ≠ current room",
        },
      },
      required: ["snapshot"],
    },
  },
  {
    name: "room_chat",
    description: "Send a short chat message to the room.",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
    },
  },
  {
    name: "check_handoffs",
    description:
      "List queued/notified handoffs in your inbox. Poll this to receive work from other peers/agents.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "claim_handoff",
    description:
      "Claim a handoff by id from your inbox (first-wins vs human accept). Returns full body to act on.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Handoff id (ho_…)" },
      },
      required: ["id"],
    },
  },
  {
    name: "dispatch_card",
    description:
      "Dispatch an existing board card to a remote herdr node bridge. Sends a mode:task handoff with a loom-card-dispatch attachment, then moves the card to doing with assignee/handoffId set.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: {
          type: "string",
          description: "Board task id (task_<hex>; unique suffix accepted)",
        },
        node: {
          type: "string",
          description: "Target bridge peer displayName, e.g. node/wsl-1",
        },
        prompt: {
          type: "string",
          description:
            "Literal prompt text injected into the remote agent (no trailing newline)",
        },
        agentKind: {
          type: "string",
          description:
            'Agent kind from the dispatch allowlist (default "claude"). Not an argv — mapping lives in bridge-local config.',
        },
      },
      required: ["taskId", "node", "prompt"],
    },
  },
  {
    name: "apply_card_result",
    description:
      "Apply a claimed card result (loom-card-result attachment JSON) to the local board: done → done, failed → blocked, summary → notes. Pass fromPeerId/fromNode from the claimed handoff for L-2 forgery checks.",
    inputSchema: {
      type: "object",
      properties: {
        resultJson: {
          type: "string",
          description:
            "Raw content of the loom-card-result attachment from the claimed handoff",
        },
        fromPeerId: {
          type: "string",
          description: "Claimed handoff fromPeerId (L-2 optional check)",
        },
        fromNode: {
          type: "string",
          description:
            "Claimed sender displayName / node for L-2 assignee match",
        },
      },
      required: ["resultJson"],
    },
  },
  {
    name: "conv_open",
    description:
      "Open a multiturn conv (§CONV_SPEC) with a remote peer: sends conv.open, pins the peer for the conv's lifetime, and creates a linked board card (doing). node = target bridge peer displayName.",
    inputSchema: {
      type: "object",
      properties: {
        node: { type: "string", description: "Target peer displayName, e.g. node/wsl-1" },
        goal: { type: "string", description: "Conv goal — doubles as the worker's first-turn prompt" },
        cwd: { type: "string", description: "Optional scope cwd (fixed at open, no mid-conv renegotiation)" },
        writesAllowed: { type: "boolean", description: "Scope: allow writes (default false)" },
        maxTurns: { type: "number", description: "Turn cap (default 20)" },
        wallClockMs: { type: "number", description: "Wall-clock timeout ms (default 2h)" },
      },
      required: ["node", "goal"],
    },
  },
  {
    name: "conv_send",
    description:
      "Send a turn on an open conv (tower or worker side, per role). text over 32,000 chars requires artifacts[] (§5.1 — no truncation).",
    inputSchema: {
      type: "object",
      properties: {
        convId: { type: "string" },
        text: { type: "string" },
        kind: { type: "string", enum: ["normal", "blocked", "done_proposal"] },
        artifacts: {
          type: "array",
          description: "§5.3 artifact refs for out-of-band payloads",
          items: { type: "object" },
        },
      },
      required: ["convId", "text"],
    },
  },
  {
    name: "conv_await",
    description:
      "Block until the next conv intent (accept/reject/turn) arrives, or timeoutSec elapses. Reuses check/claim internally (M-6 unchanged) — no separate conv_apply.",
    inputSchema: {
      type: "object",
      properties: {
        convId: { type: "string", description: "Filter to a specific conv (optional)" },
        timeoutSec: { type: "number", description: "Default 30, max 600" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "conv_close",
    description:
      "Tower-only, unilateral close (§1.4/§3.2). reason=done|abort (default done). Closes locally even if delivery to the peer fails.",
    inputSchema: {
      type: "object",
      properties: {
        convId: { type: "string" },
        reason: { type: "string", enum: ["done", "abort"] },
      },
      required: ["convId"],
    },
  },
];

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
        serverInfo: { name: "loom", version: "0.22.0" },
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
      const args = (req.params?.arguments ?? {}) as Record<string, unknown>;
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
