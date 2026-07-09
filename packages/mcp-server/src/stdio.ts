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
  toolListTasks,
  toolAddTask,
  toolUpdateTask,
  toolExportBoard,
  toolImportBoard,
} from "./tools";

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
      "Send a message/task to another peer (@name, id, or *). Works even if target is offline (queued in their inbox). Returns status queued|delivered|peer_unknown. Optional withPack attaches local room context pack (summary/paths/notes).",
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
    description: "Add a task to the local room board.",
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
        serverInfo: { name: "loom", version: "0.10.1" },
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
              withPack: Boolean(args.withPack),
              withBoard: Boolean(args.withBoard),
              trackBoard:
                args.trackBoard === undefined
                  ? undefined
                  : Boolean(args.trackBoard),
            }),
          );
        } else if (name === "get_context_pack") {
          text = JSON.stringify(await toolGetContextPack(), null, 2);
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
  let idx: number;
  while ((idx = buffer.indexOf("\n")) >= 0) {
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
