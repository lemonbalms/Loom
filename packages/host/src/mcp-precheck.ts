/**
 * PLAN 0.32.0 P2 (D1 / D3 / D4 / D5 / D8 / R2 / R4 / R5 / R6 / R50-M1 / R50-L1 / R50-L2).
 *
 * Pure Loom MCP pre-check: one decision shared by `tools/list` (toolVisible) and
 * `tools/call` (evaluateMcpCall). No I/O, no clock, no env in the evaluator — the
 * caller injects the tool registry (names + arg schemas live in packages/mcp-server)
 * and the timestamp. The only I/O here is appendPolicyAudit (per-room local audit
 * JSONL, never the relay event log).
 */
import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  renameSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { join } from "node:path";
import {
  builtinPolicyDefaults,
  type LoomDenyMode,
  type LoomDoneMode,
  type PolicyV1,
  resolveLoomTools,
} from "./policy";
import { roomKey } from "./room-event-log";

/** Injected tool registry (architect amendment — host cannot import mcp-server). */
export type ToolRegistry = {
  has(name: string): boolean;
  /** Strict arg check. On failure: zod issue path + code only, never the value. */
  validate(
    name: string,
    args: unknown,
  ): { ok: true; args: Record<string, unknown> } | { ok: false; path: string; code: string };
};

export type LoomToolsGate = {
  /** Loader message when policy.json is invalid: every call refused, list unfiltered. */
  invalid?: string;
  /** Bare Loom tool names from `mcp.deny` entries `loom__<tool>`. */
  mcpDeny: ReadonlySet<string>;
  done: LoomDoneMode;
  denyModes: ReadonlySet<LoomDenyMode>;
};

export type McpCallCtx = {
  peerId: string;
  roomId: string;
  agentKind: string;
  /** ISO timestamp, injected (the evaluator never reads the clock). */
  now: string;
};

export type McpRefusalReason =
  | "policy_invalid"
  | "unknown_tool"
  | "mcp_deny"
  | "invalid_args"
  | "done_propose"
  | `deny_mode:${LoomDenyMode}`;

/** One line of `policy-audit.jsonl`. IDs only — never titles, bodies, notes, paths. */
export type PolicyAuditRecord = {
  v: 1;
  ts: string;
  kind: "refused" | "done_via_mcp";
  tool: string;
  reason?: McpRefusalReason;
  mode?: LoomDenyMode;
  peerId: string;
  roomId: string;
  agentKind: string;
  cardId?: string;
  convId?: string;
};

export type McpCallDecision =
  | { ok: true; args: Record<string, unknown>; audit?: PolicyAuditRecord }
  | { ok: false; reason: McpRefusalReason; message: string; audit: PolicyAuditRecord };

const LOOM_SERVER_PREFIX = "loom__";

/** Resolve the gate from a parsed policy, no policy (built-in), or a loader failure. */
export function resolveLoomToolsGate(input: PolicyV1 | null | { invalid: string }): LoomToolsGate {
  if (input !== null && "invalid" in input && typeof input.invalid === "string") {
    return {
      invalid: input.invalid,
      mcpDeny: new Set(),
      done: "propose",
      denyModes: new Set(resolveLoomTools(null).denyModes),
    };
  }
  const policy = input as PolicyV1 | null;
  const resolved = resolveLoomTools(policy);
  const mcpDeny = new Set<string>();
  for (const entry of [...builtinPolicyDefaults().mcp.deny, ...(policy?.mcp.deny ?? [])]) {
    if (entry.startsWith(LOOM_SERVER_PREFIX) && entry.length > LOOM_SERVER_PREFIX.length) {
      mcpDeny.add(entry.slice(LOOM_SERVER_PREFIX.length));
    }
  }
  return { mcpDeny, done: resolved.done, denyModes: new Set(resolved.denyModes) };
}

/** Steps 2–3 (tool steps), shared by toolVisible and evaluateMcpCall (R6). */
function toolStepRefusal(
  gate: LoomToolsGate,
  registry: ToolRegistry,
  name: string,
): "unknown_tool" | "mcp_deny" | null {
  if (!registry.has(name)) return "unknown_tool";
  if (gate.mcpDeny.has(name)) return "mcp_deny";
  return null;
}

/** `tools/list` filter. policy_invalid is never a tool step (R50-M1). */
export function toolVisible(gate: LoomToolsGate, registry: ToolRegistry, name: string): boolean {
  return gate.invalid !== undefined ? true : toolStepRefusal(gate, registry, name) === null;
}

function stringArg(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  return typeof v === "string" ? v : undefined;
}

/** Step 5: the deny mode this call hits, if any (validated args only). */
function hitDenyMode(
  gate: LoomToolsGate,
  name: string,
  args: Record<string, unknown>,
): LoomDenyMode | null {
  const hits: LoomDenyMode[] = [];
  if (name === "import_board" && args.mode === "replace") hits.push("board.replace");
  if (name === "handoff") {
    // Dispatch defaults an absent `to` to "*" — judge the effective target (R2 rule).
    if (args.to === "*" || args.to === undefined) hits.push("broadcast");
    if (args.withPackEmbed === true) hits.push("pack.embed");
  }
  if (name === "conv_open" && args.writesAllowed === true) hits.push("conv.writes");
  if (name === "conv_fetch") hits.push("conv.fetch");
  return hits.find((m) => gate.denyModes.has(m)) ?? null;
}

/**
 * R50-L1 defensive scan: non-array tasks / non-object items are skipped. Each status
 * is read once; array-typed entries are read like objects. Any throw while scanning
 * (e.g. a throwing accessor) counts as "done present" — fail-closed under propose.
 * stdio only passes JSON-parsed args, so this is defence in depth.
 */
function doneCardsInSnapshot(snapshot: unknown): { count: number; ids: string[] } {
  if (snapshot === null || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return { count: 0, ids: [] };
  }
  let count = 0;
  const ids: string[] = [];
  try {
    const tasks = (snapshot as Record<string, unknown>).tasks;
    if (!Array.isArray(tasks)) return { count: 0, ids: [] };
    for (const item of tasks) {
      if (item === null || typeof item !== "object") continue;
      const task = item as Record<string, unknown>;
      const status = task.status;
      if (status !== "done") continue;
      count++;
      const id = task.id;
      if (typeof id === "string") ids.push(id);
    }
  } catch {
    return { count: Math.max(count, 1), ids };
  }
  return { count, ids };
}

function listIds(ids: string[], count: number): string {
  const shown = ids.slice(0, 5);
  const rest = count - shown.length;
  const head = shown.length > 0 ? shown.join(", ") : "(no id)";
  return rest > 0 ? `${head} +${rest}` : head;
}

type DonePath = { cardId?: string; convId?: string; message: string };

const DONE_OWNER = "Marking done is the owner's decision in this room (loomTools.done=propose)";

/** Step 6: whether this call marks something done (validated args only). */
function donePath(name: string, args: Record<string, unknown>): DonePath | null {
  if (name === "update_task" && args.status === "done") {
    const id = stringArg(args, "id");
    return {
      cardId: id,
      message: `${DONE_OWNER}. Set status blocked with a note and ask the owner to run \`loom board set ${id ?? "<task_id>"} done\`.`,
    };
  }
  if (name === "add_task" && args.status === "done") {
    return {
      message: `${DONE_OWNER}. Set status blocked with a note and ask the owner to run \`loom board set <task_id> done\`.`,
    };
  }
  if (name === "import_board") {
    const { count, ids } = doneCardsInSnapshot(args.snapshot);
    if (count === 0) return null;
    return {
      cardId: ids.length > 0 ? listIds(ids, ids.length) : undefined,
      message: `${DONE_OWNER}; the snapshot has done cards: ${listIds(ids, count)}. Import without done cards, or the owner runs \`loom board import <file>\`.`,
    };
  }
  if (name === "conv_close" && (args.reason === "done" || args.reason === undefined)) {
    // conv_close reason defaults to done (R2) — judge the effective reason.
    return {
      convId: stringArg(args, "convId"),
      message: `${DONE_OWNER}. Close with reason=abort and ask the owner to mark the card done (\`loom board set <task_id> done\`).`,
    };
  }
  return null;
}

const DENY_MODE_TEXT: Record<LoomDenyMode, string> = {
  "board.replace":
    "mode=replace is denied (loomTools.denyModes board.replace). Use mode=merge, or the owner runs `loom board import --replace <file>`.",
  broadcast:
    'to="*" broadcast is denied (loomTools.denyModes broadcast). Address one peer (@name or id).',
  "conv.writes":
    "writesAllowed=true is denied (loomTools.denyModes conv.writes). Open the conv with writesAllowed=false, or ask the owner.",
  "conv.fetch":
    "conv_fetch is denied (loomTools.denyModes conv.fetch). Ask the owner to fetch the artifact.",
  "pack.embed":
    "withPackEmbed=true is denied (loomTools.denyModes pack.embed). Use withPack without embedded file bodies.",
};

function auditBase(
  ctx: McpCallCtx,
  tool: string,
  kind: PolicyAuditRecord["kind"],
): PolicyAuditRecord {
  return {
    v: 1,
    ts: ctx.now,
    kind,
    tool,
    peerId: ctx.peerId,
    roomId: ctx.roomId,
    agentKind: ctx.agentKind,
  };
}

function refuse(
  ctx: McpCallCtx,
  tool: string,
  reason: McpRefusalReason,
  text: string,
  extra: Partial<PolicyAuditRecord> = {},
): McpCallDecision {
  const audit: PolicyAuditRecord = { ...auditBase(ctx, tool, "refused"), reason };
  for (const [k, v] of Object.entries(extra)) {
    if (v !== undefined) (audit as Record<string, unknown>)[k] = v;
  }
  return { ok: false, reason, message: `Loom pre-check refused ${tool}: ${text}`, audit };
}

/**
 * The single pre-check decision. Step order (R6 / R50-L2): policy invalid →
 * unknown tool → mcp.deny → args (registry.validate) → deny modes → done.
 * Steps 5–6 read the validated args returned by the registry, never the raw args.
 */
export function evaluateMcpCall(
  gate: LoomToolsGate,
  registry: ToolRegistry,
  name: string,
  args: unknown,
  ctx: McpCallCtx,
): McpCallDecision {
  if (gate.invalid !== undefined) {
    return refuse(
      ctx,
      name,
      "policy_invalid",
      `policy.json is invalid (${gate.invalid}). Every Loom tool call is refused until the owner fixes policy.json.`,
    );
  }
  const toolStep = toolStepRefusal(gate, registry, name);
  if (toolStep === "unknown_tool") {
    return refuse(
      ctx,
      name,
      "unknown_tool",
      "unknown tool. Call tools/list for the available tools.",
    );
  }
  if (toolStep === "mcp_deny") {
    return refuse(
      ctx,
      name,
      "mcp_deny",
      `denied by policy.json mcp.deny (${LOOM_SERVER_PREFIX}${name}). Use another tool or ask the owner.`,
    );
  }
  const checked = registry.validate(name, args);
  if (!checked.ok) {
    return refuse(
      ctx,
      name,
      "invalid_args",
      `invalid arguments at ${checked.path === "" ? "(root)" : checked.path} (${checked.code}). Fix the arguments to match the tool's inputSchema and retry.`,
    );
  }
  const parsed = checked.args;
  const mode = hitDenyMode(gate, name, parsed);
  if (mode !== null) {
    return refuse(ctx, name, `deny_mode:${mode}`, DENY_MODE_TEXT[mode], {
      mode,
      cardId: name === "update_task" ? stringArg(parsed, "id") : undefined,
      convId: name.startsWith("conv_") ? stringArg(parsed, "convId") : undefined,
    });
  }
  const done = donePath(name, parsed);
  if (done !== null) {
    const ids = { cardId: done.cardId, convId: done.convId };
    if (gate.done === "propose") return refuse(ctx, name, "done_propose", done.message, ids);
    const audit = auditBase(ctx, name, "done_via_mcp");
    if (ids.cardId !== undefined) audit.cardId = ids.cardId;
    if (ids.convId !== undefined) audit.convId = ids.convId;
    return { ok: true, args: parsed, audit };
  }
  return { ok: true, args: parsed };
}

// ---------------------------------------------------------------------------
// Audit writer (D8) — the only I/O in this module.
// ---------------------------------------------------------------------------

export const POLICY_AUDIT_FILE = "policy-audit.jsonl";
/** UK-3 starting value: rotate to `.1` (one generation) before a write would pass 1 MiB. */
export const POLICY_AUDIT_MAX_BYTES = 1024 * 1024;
const POLICY_AUDIT_MAX_LINE_BYTES = 4096;
/** A rotation lock older than this is presumed abandoned (crashed writer). */
const POLICY_AUDIT_LOCK_STALE_MS = 10_000;
const AUDIT_REQUIRED_KEYS = ["ts", "kind", "tool", "peerId", "roomId", "agentKind"] as const;
const AUDIT_OPTIONAL_KEYS = ["reason", "mode", "cardId", "convId"] as const;

/** Test seam: fires after the writer has opened the live file and sized it. */
export const policyAuditTestHooks: { afterSizeCheck?: () => void } = {};

function cutField(v: string, max: number): string {
  return v.length > max ? `${v.slice(0, max)}…` : v;
}

/**
 * Serialize only the PolicyAuditRecord fields (explicit allowlist — extra keys on
 * the object are dropped) into one line of at most 4096 UTF-8 bytes: full →
 * fields cut to 256 → 64 chars → optional fields dropped → required cut to 16.
 */
function auditLine(record: PolicyAuditRecord): string {
  const src = record as unknown as Record<string, unknown>;
  const pick = (keys: readonly string[], max: number): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const k of keys) {
      const v = src[k];
      if (typeof v === "string") out[k] = cutField(v, max);
    }
    return out;
  };
  const attempts: Array<() => Record<string, unknown>> = [
    () => ({
      v: 1,
      ...pick(AUDIT_REQUIRED_KEYS, Infinity),
      ...pick(AUDIT_OPTIONAL_KEYS, Infinity),
    }),
    () => ({ v: 1, ...pick(AUDIT_REQUIRED_KEYS, 256), ...pick(AUDIT_OPTIONAL_KEYS, 256) }),
    () => ({ v: 1, ...pick(AUDIT_REQUIRED_KEYS, 64), ...pick(AUDIT_OPTIONAL_KEYS, 64) }),
    () => ({ v: 1, ...pick(AUDIT_REQUIRED_KEYS, 64) }),
    () => ({ v: 1, ...pick(AUDIT_REQUIRED_KEYS, 16) }),
  ];
  let line = "";
  for (const build of attempts) {
    line = JSON.stringify(build());
    if (Buffer.byteLength(line, "utf8") <= POLICY_AUDIT_MAX_LINE_BYTES) return line;
  }
  // Unreachable: 6 fields × 16 chars × ≤ 6 escaped bytes stays far below 4 KiB.
  return JSON.stringify({ v: 1, kind: "refused" });
}

function auditFailed(roomId: string, err: unknown): false {
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code?: unknown }).code)
      : err instanceof Error
        ? err.message.slice(0, 80)
        : "error";
  const room = roomId.length > 0 ? roomKey(roomId) : "none";
  process.stderr.write(`[loom-mcp] audit_write_failed room=${room} err=${code}\n`);
  return false;
}

const OPEN_LIVE =
  constants.O_APPEND | constants.O_CREAT | constants.O_WRONLY | constants.O_NOFOLLOW;
const OPEN_LOCK = constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW;

/** Open the live file without following a symlink; tighten its mode via the fd. */
function openLive(path: string): number {
  const fd = openSync(path, OPEN_LIVE, 0o600);
  try {
    if ((fstatSync(fd).mode & 0o777) !== 0o600) fchmodSync(fd, 0o600);
  } catch (e) {
    closeSync(fd);
    throw e;
  }
  return fd;
}

/** One non-blocking O_EXCL attempt (after clearing a stale lock). Returns the lock fd or null. */
function tryRotationLock(lockPath: string): number | null {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return openSync(lockPath, OPEN_LOCK, 0o600);
    } catch (e) {
      if ((e as { code?: unknown }).code !== "EEXIST" || attempt > 0) return null;
      try {
        const st = lstatSync(lockPath);
        if (Date.now() - st.mtimeMs <= POLICY_AUDIT_LOCK_STALE_MS) return null;
        unlinkSync(lockPath);
      } catch {
        // Lock vanished or could not be cleared — retry once / give up.
      }
    }
  }
  return null;
}

/**
 * Append one record to `<stateDir>/rooms/<roomKey(roomId)>/policy-audit.jsonl`
 * (dir 0700, file 0600 opened O_NOFOLLOW, one O_APPEND write). When the write
 * would push the live file past 1 MiB, it is first renamed to `.1` (replacing any
 * older `.1`; never truncated) under a non-blocking O_EXCL lockfile
 * `policy-audit.jsonl.lock`. If the lock is held, rotation is skipped and the
 * record is appended anyway (the file may briefly exceed the cap). Any failure is
 * swallowed with one stderr line and returns false — the decision never changes.
 */
export function appendPolicyAudit(
  stateDir: string,
  roomId: string,
  record: PolicyAuditRecord,
): boolean {
  if (roomId.length === 0) return auditFailed(roomId, { code: "no_room" });
  let fd: number | null = null;
  try {
    const roomDir = join(stateDir, "rooms", roomKey(roomId));
    mkdirSync(roomDir, { recursive: true, mode: 0o700 });
    const path = join(roomDir, POLICY_AUDIT_FILE);
    const line = `${auditLine(record)}\n`;
    const lineBytes = Buffer.byteLength(line, "utf8");
    fd = openLive(path);
    const size = fstatSync(fd).size;
    policyAuditTestHooks.afterSizeCheck?.();
    if (size > 0 && size + lineBytes > POLICY_AUDIT_MAX_BYTES) {
      const lockPath = `${path}.lock`;
      const lockFd = tryRotationLock(lockPath);
      if (lockFd !== null) {
        try {
          // Re-check under the lock: another writer may already have rotated, in
          // which case our fd points at `.1` — reopen the current live file.
          const atPath = lstatSync(path);
          let mine = fstatSync(fd);
          if (atPath.ino !== mine.ino || atPath.dev !== mine.dev) {
            closeSync(fd);
            fd = null;
            fd = openLive(path);
            mine = fstatSync(fd);
          }
          if (mine.size > 0 && mine.size + lineBytes > POLICY_AUDIT_MAX_BYTES) {
            renameSync(path, `${path}.1`);
            closeSync(fd);
            fd = null;
            fd = openLive(path);
          }
        } finally {
          try {
            // Unlink only our own lock (it may have been stale-cleared and re-taken).
            const held = fstatSync(lockFd);
            const now = lstatSync(lockPath);
            if (held.ino === now.ino && held.dev === now.dev) unlinkSync(lockPath);
          } catch {
            // Already gone — nothing to release.
          } finally {
            closeSync(lockFd);
          }
        }
      }
    }
    writeSync(fd, line);
    return true;
  } catch (e) {
    return auditFailed(roomId, e);
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch {
        // Best-effort close.
      }
    }
  }
}
