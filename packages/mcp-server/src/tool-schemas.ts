/**
 * PLAN 0.32.0 D2 · R3 — zod is the single source of truth for the 20 Loom MCP tools' arguments.
 *
 * Each tool's arguments are a top-level zod `.strict()` object carrying the 0.31.0 advertised
 * inputSchema text exactly (types · enums · required · descriptions); the only addition is
 * `additionalProperties:false`. `inputSchema` is DERIVED from zod by the small in-repo converter
 * below (zod 3 has no native JSON Schema output, and an external converter would tie the
 * snapshot to its version). The converter handles a closed subset only — object (strict) ·
 * string · number · boolean · enum · array · optional · describe · free-form object
 * `z.record(z.unknown())` → `{type:"object"}` (R50-L1). Any other zod node throws at module load.
 */
import { z } from "zod";

const TASK_STATUS = ["todo", "doing", "done", "blocked", "cancelled"] as const;

export const toolSchemas = {
  list_peers: z.object({}).strict(),
  handoff: z
    .object({
      to: z.string().describe("@displayName, peer id, or * for broadcast"),
      body: z.string().describe("Message or task"),
      mode: z.enum(["message", "task"]).optional(),
      withPack: z.boolean().describe("Attach local context pack as handoff attachments").optional(),
      withPackEmbed: z
        .boolean()
        .describe(
          "L-5: embed file bodies for pack paths (implies withPack; allowlist re-checked at send)",
        )
        .optional(),
      withBoard: z
        .boolean()
        .describe(
          "Attach local task board snapshot (multi-machine share; receiver import_board or loom board import-handoff)",
        )
        .optional(),
      trackBoard: z
        .boolean()
        .describe(
          "Also create a room task board item linked to this handoff (default true when mode=task)",
        )
        .optional(),
    })
    .strict(),
  get_context_pack: z.object({}).strict(),
  get_purpose: z.object({}).strict(),
  set_purpose: z
    .object({
      purpose: z.string().optional(),
      successCriteria: z.array(z.string()).optional(),
      outOfScope: z.array(z.string()).optional(),
      notes: z.string().optional(),
    })
    .strict(),
  list_tasks: z.object({}).strict(),
  add_task: z
    .object({
      title: z.string(),
      assignee: z.string().describe("@name or bare name").optional(),
      status: z.enum(TASK_STATUS).optional(),
      notes: z.string().optional(),
      notify: z.boolean().describe("If true, handoff [GOAL] to assignee (default false)").optional(),
    })
    .strict(),
  update_task: z
    .object({
      id: z.string(),
      status: z.enum(TASK_STATUS).optional(),
      assignee: z.string().optional(),
      title: z.string().optional(),
      notes: z.string().optional(),
    })
    .strict(),
  export_board: z.object({}).strict(),
  import_board: z
    .object({
      snapshot: z.record(z.unknown()).describe("loom-board-snapshot object"),
      mode: z.enum(["merge", "replace"]).optional(),
      force: z.boolean().describe("Allow import when sourceRoomId ≠ current room").optional(),
    })
    .strict(),
  room_chat: z.object({ text: z.string() }).strict(),
  check_handoffs: z.object({}).strict(),
  claim_handoff: z.object({ id: z.string().describe("Handoff id (ho_…)") }).strict(),
  dispatch_card: z
    .object({
      taskId: z.string().describe("Board task id (task_<hex>; unique suffix accepted)"),
      node: z.string().describe("Target bridge peer displayName, e.g. node/wsl-1"),
      prompt: z
        .string()
        .describe("Literal prompt text injected into the remote agent (no trailing newline)"),
      agentKind: z
        .string()
        .describe(
          'Agent kind from the dispatch allowlist: claude|codex|grok (default "claude"). Not an argv — mapping lives in bridge-local config; unregistered kinds fail closed.',
        )
        .optional(),
    })
    .strict(),
  apply_card_result: z
    .object({
      resultJson: z
        .string()
        .describe("Raw content of the loom-card-result attachment from the claimed handoff"),
      fromPeerId: z.string().describe("Claimed handoff fromPeerId (L-2 optional check)").optional(),
      fromNode: z
        .string()
        .describe("Claimed sender displayName / node for L-2 assignee match")
        .optional(),
    })
    .strict(),
  conv_open: z
    .object({
      node: z.string().describe("Target peer displayName, e.g. node/wsl-1"),
      goal: z.string().describe("Conv goal — doubles as the worker's first-turn prompt"),
      cwd: z
        .string()
        .describe("Optional scope cwd (fixed at open, no mid-conv renegotiation)")
        .optional(),
      writesAllowed: z.boolean().describe("Scope: allow writes (default false)").optional(),
      maxTurns: z.number().describe("Turn cap (default 20)").optional(),
      wallClockMs: z.number().describe("Wall-clock timeout ms (default 2h)").optional(),
      agentKind: z
        .string()
        .describe(
          'Worker agent kind: claude|codex|grok (default "claude"). Spawn requires the bridge node to have locally registered argv for that kind (fail-closed otherwise).',
        )
        .optional(),
    })
    .strict(),
  conv_send: z
    .object({
      convId: z.string(),
      text: z.string(),
      kind: z.enum(["normal", "blocked", "done_proposal"]).optional(),
      artifacts: z
        .array(z.record(z.unknown()))
        .describe("§5.3 artifact refs for out-of-band payloads")
        .optional(),
    })
    .strict(),
  conv_await: z
    .object({
      convId: z.string().describe("Filter to a specific conv (optional)").optional(),
      timeoutSec: z.number().describe("Default 30, max 600").optional(),
    })
    .strict(),
  conv_close: z
    .object({
      convId: z.string(),
      reason: z.enum(["done", "abort"]).optional(),
    })
    .strict(),
  conv_fetch: z
    .object({
      convId: z.string().describe("Conv id that owns the turn"),
      seq: z.number().describe("Turn sequence number that carried the artifact ref"),
      index: z.number().describe("Index into that turn's artifacts[] array"),
    })
    .strict(),
} as const;

export type LoomToolName = keyof typeof toolSchemas;

const TOOL_DESCRIPTIONS: Record<LoomToolName, string> = {
  list_peers: "List peers in the Loom room (name, agent, id, online/offline).",
  handoff:
    "Send a message/task to another peer (@name, id, or *). Works even if target is offline (queued in their inbox). Returns status queued|delivered|peer_unknown. Optional withPack attaches local room context pack (summary/paths/notes). withPackEmbed also embeds file bodies (L-5; re-resolves allowlist at send).",
  get_context_pack:
    "Read the local room context pack (summary, cwd-relative paths, notes). Pack is local until attached via handoff withPack.",
  get_purpose:
    "Read the local room purpose card (purpose, success criteria, out-of-scope, verify recipes). Room-scoped on this machine.",
  set_purpose:
    "Update room purpose / successCriteria / outOfScope / notes. Cannot set verify[] (M-24 — use CLI loom purpose set --verify). Same UID residual as board.",
  list_tasks:
    "List tasks on the local room task board (todo/doing/done/blocked/cancelled). Room-scoped on this machine.",
  add_task:
    "Add a task to the local room board. Optional notify=true sends handoff to assignee (L-32: default false).",
  update_task: "Update task status, assignee, title, or notes by id.",
  export_board:
    "Export the local room task board as a portable snapshot (JSON). Use for multi-machine share.",
  import_board:
    "Import a board snapshot into the current room board. mode=merge (default) or replace. force=true if sourceRoomId differs.",
  room_chat: "Send a short chat message to the room.",
  check_handoffs:
    "List queued/notified handoffs in your inbox. Poll this to receive work from other peers/agents.",
  claim_handoff:
    "Claim a handoff by id from your inbox (first-wins vs human accept). Returns full body to act on.",
  dispatch_card:
    "Dispatch an existing board card to a remote herdr node bridge. Sends a mode:task handoff with a loom-card-dispatch attachment, then moves the card to doing with assignee/handoffId set.",
  apply_card_result:
    'Apply a claimed card result (loom-card-result attachment JSON) to the local board under remote-result isolation: every accepted remote result maps to blocked (never board done); legacy status "done" records reason legacy_remote_done_requires_verification; failed stays blocked with its reason; summary → notes. Board done requires an explicit local mutation after verification. Pass fromPeerId/fromNode from the claimed handoff for L-2 forgery checks.',
  conv_open:
    "Open a multiturn conv (§CONV_SPEC) with a remote peer: sends conv.open, pins the peer for the conv's lifetime, and creates a linked board card (doing). node = target bridge peer displayName.",
  conv_send:
    "Send a turn on an open conv (tower or worker side, per role). text over 32,000 chars requires artifacts[] (§5.1 — no truncation).",
  conv_await:
    "Block until the next conv intent (accept/reject/turn) arrives, or timeoutSec elapses. Reuses check/claim internally (M-6 unchanged) — no separate conv_apply. When a turn carries artifacts[] (§5.1 32k overflow), the result also includes artifactCommands[] — one presented (validated, POSIX-quoted, never executed) fetch command per artifact ref, or a fail-closed reason (e.g. no local scp host mapping — R26 M-1/M-2). Review before running.",
  conv_close:
    "Tower-only, unilateral close (§1.4/§3.2). reason=done|abort (default done). Closes locally even if delivery to the peer fails.",
  conv_fetch:
    "PLAN 0.25.0: retrieve a conv scp artifact by coordinate (convId, seq, index). Host/path/sha are resolved from server-side stored turn artifacts (never from caller). Spawns scp with argv directly (no shell), re-validates host/path exec-path, writes under ~/.loom/artifacts/<convId>/, verifies sha256. Returns metadata only (argv, destPath, sha256, bytes) — not file contents. Git transport refs are present-only (not fetchable). Overwrite of an existing local file is rejected.",
};

export type JsonSchema = { [key: string]: unknown };

function unsupported(node: z.ZodTypeAny, why: string): never {
  const kind = (node._def as { typeName?: string }).typeName ?? node.constructor.name;
  throw new Error(`tool-schemas: unsupported zod node ${kind} (${why})`);
}

function withDescription(out: JsonSchema, description: string | undefined): JsonSchema {
  return description === undefined ? out : { ...out, description };
}

/**
 * Convert the closed zod subset to JSON Schema. Throws on anything outside it — including
 * refinements (min/max/int/…) that the derived schema could not advertise.
 */
export function toJsonSchema(node: z.ZodTypeAny): JsonSchema {
  const d = node.description;
  if (node instanceof z.ZodObject) {
    if (node._def.unknownKeys !== "strict") unsupported(node, "object must be .strict()");
    if (!(node._def.catchall instanceof z.ZodNever)) unsupported(node, "object catchall");
    // Prototype-free: a `__proto__` property key is stored (and advertised) as an own key.
    const properties: JsonSchema = Object.create(null) as JsonSchema;
    const required: string[] = [];
    for (const [key, prop] of Object.entries(node.shape as z.ZodRawShape)) {
      if (prop instanceof z.ZodOptional) {
        const inner = prop._def.innerType as z.ZodTypeAny;
        properties[key] = withDescription(toJsonSchema(inner), inner.description ?? prop.description);
        continue;
      }
      properties[key] = toJsonSchema(prop);
      required.push(key);
    }
    const out: JsonSchema = { type: "object", properties };
    if (required.length > 0) out.required = required;
    out.additionalProperties = false;
    return withDescription(out, d);
  }
  if (node instanceof z.ZodString) {
    if (node._def.checks.length > 0 || node._def.coerce) unsupported(node, "string refinements");
    return withDescription({ type: "string" }, d);
  }
  if (node instanceof z.ZodNumber) {
    if (node._def.checks.length > 0 || node._def.coerce) unsupported(node, "number refinements");
    return withDescription({ type: "number" }, d);
  }
  if (node instanceof z.ZodBoolean) {
    if (node._def.coerce) unsupported(node, "boolean coercion");
    return withDescription({ type: "boolean" }, d);
  }
  if (node instanceof z.ZodEnum) {
    return withDescription({ type: "string", enum: [...(node._def.values as string[])] }, d);
  }
  if (node instanceof z.ZodArray) {
    const def = node._def;
    if (def.minLength !== null || def.maxLength !== null || def.exactLength !== null) {
      unsupported(node, "array length checks");
    }
    return withDescription({ type: "array", items: toJsonSchema(def.type) }, d);
  }
  if (node instanceof z.ZodRecord) {
    const key = node._def.keyType as z.ZodTypeAny;
    if (!(key instanceof z.ZodString) || key._def.checks.length > 0) {
      unsupported(node, "record key must be plain string");
    }
    if (!(node._def.valueType instanceof z.ZodUnknown)) {
      unsupported(node, "only z.record(z.unknown()) (free-form object) is supported");
    }
    return withDescription({ type: "object" }, d);
  }
  if (node instanceof z.ZodOptional) unsupported(node, "optional only as an object property");
  return unsupported(node, "outside the closed subset");
}

export type LoomToolDefinition = {
  name: LoomToolName;
  description: string;
  inputSchema: JsonSchema;
};

/** Advertised `tools/list` entries — order, names and descriptions as in 0.31.0; inputSchema derived. */
export const TOOL_DEFINITIONS: LoomToolDefinition[] = (
  Object.keys(toolSchemas) as LoomToolName[]
).map((name) => ({
  name,
  description: TOOL_DESCRIPTIONS[name],
  inputSchema: toJsonSchema(toolSchemas[name]),
}));

export type ToolArgsValidation =
  | { ok: true; args: Record<string, unknown> }
  | { ok: false; path: string; code: string };

const KEY_ECHO_MAX_KEYS = 3;
const KEY_ECHO_MAX_CHARS = 32;
const PATH_MAX = 128;

/** Truncate to `max` UTF-16 units plus `…` (≤ max + 1); never splits a surrogate pair. */
function capLength(s: string, max: number): string {
  if (s.length <= max) return s;
  const last = s.charCodeAt(max - 1);
  const end = last >= 0xd800 && last <= 0xdbff ? max - 1 : max;
  return `${s.slice(0, end)}…`;
}

/**
 * Caller-supplied unknown key names are the only caller text a refusal reflects: at most 3
 * names, each ≤ 32 chars (+ `…`), `+N` for the rest — total path ≤ 128 chars.
 */
function capKeyEcho(keys: string[]): string {
  const shown = keys.slice(0, KEY_ECHO_MAX_KEYS).map((k) => capLength(k, KEY_ECHO_MAX_CHARS));
  const rest = keys.length - shown.length;
  return rest > 0 ? [...shown, `+${rest}`].join(",") : shown.join(",");
}

function isToolName(name: string): name is LoomToolName {
  return Object.hasOwn(toolSchemas, name);
}

/**
 * Strict argument validation keyed by tool name. A failure carries only the zod path and issue
 * code — never the offending value. For `unrecognized_keys` the path is the unknown key name(s).
 * `args === undefined` is treated as `{}`.
 */
export const toolRegistry: {
  has(name: string): boolean;
  validate(name: string, args: unknown): ToolArgsValidation;
} = {
  has: isToolName,
  validate(name, args) {
    if (!isToolName(name)) return { ok: false, path: "(root)", code: "unknown_tool" };
    const parsed = (toolSchemas[name] as z.ZodTypeAny).safeParse(args === undefined ? {} : args);
    if (parsed.success) return { ok: true, args: parsed.data as Record<string, unknown> };
    const issue = parsed.error.issues[0];
    if (!issue) return { ok: false, path: "(root)", code: "custom" };
    const path =
      issue.code === "unrecognized_keys"
        ? capKeyEcho(issue.keys)
        : issue.path.length > 0
          ? issue.path.join(".")
          : "(root)";
    return { ok: false, path: capLength(path, PATH_MAX - 1), code: issue.code };
  },
};
