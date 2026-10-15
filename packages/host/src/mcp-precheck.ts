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
  readdirSync,
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
  /** Issued by applyCardResult (L-2, D8), never by evaluateMcpCall. */
  | "l2_from_peer"
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
 * (e.g. a throwing accessor or a revoked Proxy — every access to `snapshot`,
 * Array.isArray included, is inside the try) counts as "done present" — fail-closed under propose.
 * stdio only passes JSON-parsed args, so this is defence in depth.
 */
function doneCardsInSnapshot(snapshot: unknown): { count: number; ids: string[] } {
  let count = 0;
  const ids: string[] = [];
  try {
    if (snapshot === null || typeof snapshot !== "object" || Array.isArray(snapshot)) {
      return { count: 0, ids: [] };
    }
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
/** UK-3 starting value: rotate before a write would push the live file past 1 MiB. */
export const POLICY_AUDIT_MAX_BYTES = 1024 * 1024;
/** Rotated generations retained per room (disk ≤ (K + 1) × 1 MiB = 4 MiB). */
export const POLICY_AUDIT_KEEP_GENERATIONS = 3;
/** Full written line, LF included. */
const POLICY_AUDIT_MAX_LINE_BYTES = 4096;
const AUDIT_REQUIRED_KEYS = ["ts", "kind", "tool", "peerId", "roomId", "agentKind"] as const;
const AUDIT_OPTIONAL_KEYS = ["reason", "mode", "cardId", "convId"] as const;
/** `policy-audit.<YYYYMMDDTHHmmssSSSZ>-<pid 10 digits>-<6 base36>.jsonl` — never the live file. */
const GENERATION_RE = /^policy-audit\.\d{8}T\d{9}Z-\d{10}-[0-9a-z]{6}\.jsonl$/;

/**
 * Test seams only (all undefined in production): `afterLstat` fires between the
 * size check and the rotation; `generationName` overrides the unique name (undefined
 * → the real one); `beforeRename` fires between name allocation and the rename;
 * `write` replaces writeSync for one chunk of the write loop.
 */
export const policyAuditTestHooks: {
  afterLstat?: () => void;
  generationName?: () => string | undefined;
  beforeRename?: () => void;
  write?: (fd: number, buf: Buffer, offset: number, length: number) => number;
} = {};

/**
 * Rotated generation name. Fixed width, no colons: lexical order = chronological
 * order (pid and random suffix only break same-millisecond ties).
 */
export function policyAuditGenerationName(at: Date, pid: number, rand: string): string {
  const stamp = at.toISOString().replace(/[-:.]/g, "");
  const pidPart = String(Math.max(0, Math.trunc(pid)) % 1e10).padStart(10, "0");
  const randPart = rand
    .toLowerCase()
    .replace(/[^0-9a-z]/g, "0")
    .padEnd(6, "0")
    .slice(0, 6);
  return `policy-audit.${stamp}-${pidPart}-${randPart}.jsonl`;
}

function randomBase36(): string {
  return Math.floor(Math.random() * 36 ** 6)
    .toString(36)
    .padStart(6, "0");
}

/**
 * Audit files in a room directory for readers: rotated generations by name (≈ oldest
 * → newest), then the live file if present. The order is approximate under concurrent
 * rotation (a paused writer may rename with an earlier-stamped name; pruning goes by
 * mtime instead). A missing directory → []; a file can vanish between this listing
 * and the read (concurrent prune) — readers tolerate ENOENT. Readers must also skip
 * unparsable lines: a crash mid-write can leave a partial final line.
 */
export function listPolicyAuditGenerations(roomDir: string): string[] {
  let names: string[];
  try {
    names = readdirSync(roomDir);
  } catch {
    return [];
  }
  const rotated = names.filter((n) => n !== POLICY_AUDIT_FILE && GENERATION_RE.test(n)).sort();
  return names.includes(POLICY_AUDIT_FILE) ? [...rotated, POLICY_AUDIT_FILE] : rotated;
}

function cutField(v: string, max: number): string {
  return v.length > max ? `${v.slice(0, max)}…` : v;
}

/**
 * Serialize only the PolicyAuditRecord fields (explicit allowlist — extra keys on
 * the object are dropped) into one line whose UTF-8 bytes, LF included, are ≤ 4096:
 * full → fields cut to 256 → 64 chars → optional fields dropped → required cut to
 * 16. Still over → null (the caller skips the record).
 */
function auditLine(record: PolicyAuditRecord): string | null {
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
  for (const build of attempts) {
    const line = `${JSON.stringify(build())}\n`;
    if (Buffer.byteLength(line, "utf8") <= POLICY_AUDIT_MAX_LINE_BYTES) return line;
  }
  return null;
}

function errCode(err: unknown): string {
  return err && typeof err === "object" && "code" in err
    ? String((err as { code?: unknown }).code)
    : err instanceof Error
      ? err.message.slice(0, 80)
      : "error";
}

function auditFailed(roomId: string, err: unknown): false {
  const room = roomId.length > 0 ? roomKey(roomId) : "none";
  process.stderr.write(`[loom-mcp] audit_write_failed room=${room} err=${errCode(err)}\n`);
  return false;
}

const OPEN_LIVE =
  constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW;

/**
 * Unlink all but the newest K rotated generations, newest = latest mtime (last write),
 * name as tiebreak — not by name alone, since a paused writer can rename the freshest
 * data with an earlier-stamped name. ENOENT (a concurrent pruner) is fine.
 */
function pruneGenerations(roomDir: string): void {
  const rotated: Array<{ name: string; mtime: bigint }> = [];
  for (const name of listPolicyAuditGenerations(roomDir)) {
    if (name === POLICY_AUDIT_FILE) continue;
    try {
      rotated.push({ name, mtime: lstatSync(join(roomDir, name), { bigint: true }).mtimeNs });
    } catch (e) {
      if (errCode(e) !== "ENOENT") throw e;
    }
  }
  rotated.sort((a, b) =>
    a.mtime < b.mtime ? -1 : a.mtime > b.mtime ? 1 : a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  const excess = Math.max(0, rotated.length - POLICY_AUDIT_KEEP_GENERATIONS);
  for (const { name } of rotated.slice(0, excess)) {
    try {
      unlinkSync(join(roomDir, name));
    } catch (e) {
      if (errCode(e) !== "ENOENT") throw e;
    }
  }
}

/** Write every byte of `line`; a 0-byte or throwing write → false (no retry). */
function writeFully(fd: number, line: string): boolean {
  const buf = Buffer.from(line, "utf8");
  let off = 0;
  while (off < buf.length) {
    let n: number;
    try {
      n = policyAuditTestHooks.write
        ? policyAuditTestHooks.write(fd, buf, off, buf.length - off)
        : writeSync(fd, buf, off, buf.length - off);
    } catch {
      return false;
    }
    if (n <= 0) return false;
    off += n;
  }
  return true;
}

/**
 * Append one record to `<stateDir>/rooms/<roomKey(roomId)>/policy-audit.jsonl`.
 * Lock-free (D8 as amended in P2 verify round 2):
 *   1. lstat the live path (ENOENT = size 0; a symlink → skip).
 *   2. If `size > 0 && size + line > 1 MiB`, rename it to a unique generation name
 *      (ENOENT = another writer already rotated → continue), then prune.
 *   3. open O_WRONLY|O_APPEND|O_CREAT|O_NOFOLLOW 0600 (no O_EXCL: concurrent
 *      creators append to the same inode), fchmod 0600, write the whole line
 *      (loop over short writes; 0 bytes or a throw → short_write), close.
 * Pruning keeps the newest 3 generations by mtime (name as tiebreak).
 * Renames never target an existing name, so nothing is overwritten; a concurrent
 * loser can at worst rotate a small fresh file into one extra small generation.
 * Any failure is swallowed with one stderr line and returns false — the decision
 * never changes.
 */
export function appendPolicyAudit(
  stateDir: string,
  roomId: string,
  record: PolicyAuditRecord,
): boolean {
  if (roomId.length === 0) return auditFailed(roomId, { code: "no_room" });
  try {
    const line = auditLine(record);
    if (line === null) return auditFailed(roomId, { code: "line_too_long" });
    const lineBytes = Buffer.byteLength(line, "utf8");
    const roomDir = join(stateDir, "rooms", roomKey(roomId));
    mkdirSync(roomDir, { recursive: true, mode: 0o700 });
    const path = join(roomDir, POLICY_AUDIT_FILE);

    let size = 0;
    try {
      const st = lstatSync(path);
      if (st.isSymbolicLink()) return auditFailed(roomId, { code: "symlink" });
      size = st.size;
    } catch (e) {
      if (errCode(e) !== "ENOENT") throw e;
    }
    policyAuditTestHooks.afterLstat?.();

    if (size > 0 && size + lineBytes > POLICY_AUDIT_MAX_BYTES) {
      const gen =
        policyAuditTestHooks.generationName?.() ??
        policyAuditGenerationName(new Date(), process.pid, randomBase36());
      policyAuditTestHooks.beforeRename?.();
      let rotated = false;
      try {
        renameSync(path, join(roomDir, gen));
        rotated = true;
      } catch (e) {
        if (errCode(e) !== "ENOENT") throw e;
      }
      if (rotated) pruneGenerations(roomDir);
    }

    // Accepted limit (P2 verify round 3, M1): a writer paused between this open and
    // its write while other writers rotate ≥ 3 times (≥ 3 MiB of audit lines) appends
    // to an inode that pruning has already unlinked — at most that one record is lost.
    // No lock protocol is added for it (D8 amended: lock-free).
    const fd = openSync(path, OPEN_LIVE, 0o600);
    let written = false;
    try {
      if ((fstatSync(fd).mode & 0o777) !== 0o600) fchmodSync(fd, 0o600);
      written = writeFully(fd, line);
    } finally {
      closeSync(fd);
    }
    // A crash or a failed write mid-loop can leave a partial line; readers skip
    // unparsable lines (see listPolicyAuditGenerations).
    if (!written) return auditFailed(roomId, { code: "short_write" });
    return true;
  } catch (e) {
    return auditFailed(roomId, e);
  }
}
