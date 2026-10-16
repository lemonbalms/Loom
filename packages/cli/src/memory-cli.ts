/**
 * PLAN 0.35.0 P4 — `loom memory add|propose|list|show|approve|retire|compact` · `loom rules list` ·
 * `loom skills list` (D4 · D5 · D7 · ② CLI 공통 · R13 · R15 · R53-L2) + the read-only gatherer for
 * the doctor Memory section (③ · R14).
 *
 * Like `service.ts`, every verb returns an exit code (0 success · 1 refused / error / usage) and
 * `index.ts` only maps it to `process.exit`. Everything environmental is injected
 * (`MemoryCliDeps`): loomDir, the resolved profile and where it came from, displayName, env (for
 * the redaction check — R53-L1), id generator, clock, stdout/stderr, and the bridge-config
 * `worker.skills.enabled` reader. Writes go through `@loom/host` memory-store (lock · seq ·
 * checks); readers here take no lock, create nothing and never follow a symlink below loomDir.
 */
import {
  closeSync,
  existsSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  openSync,
  readdirSync,
  readSync,
} from "node:fs";
import { join } from "node:path";
import {
  agentKeyFor,
  appendMemoryEntry,
  appendMemoryTransition,
  bridgeConfigPath,
  builtinPolicyDefaults,
  compactMemory,
  type FoldedEntry,
  foldMemoryLines,
  getActiveProfile,
  humanMemorySource,
  inventorySkills,
  isAgentKey,
  loadBridgeConfig,
  loadPolicy,
  loadRules,
  loadSession,
  loomDir,
  MEMORY_ACTIVE_CAP,
  MEMORY_ENTRIES_MAX_BYTES,
  MEMORY_PROPOSED_CAP,
  type MemoryEntryType,
  type MemoryFold,
  type MemoryRefusal,
  memoryPaths,
  mergePolicy,
  RULE_MAX_BYTES,
  type RuleView,
  readRoomSkillSelection,
  resolveBridgeProfile,
  roomKey,
  type SkillPolicy,
} from "@loom/host";
import type { MemoryDoctorAgent, MemoryDoctorFile, MemoryDoctorInput } from "./doctor";

type AgentKind = "claude" | "codex" | "grok";
const AGENT_KINDS: readonly AgentKind[] = ["claude", "codex", "grok"];
const ENTRY_TYPES: readonly MemoryEntryType[] = ["fact", "decision", "preference"];

/** Reader caps for human files (D5 — the snapshot reader cuts at these). */
const PERSONA_CAP = 8192;
const INDEX_CAP = 8192;
const GUIDELINE_CAP = 16384;
/** list / show read entries.jsonl up to this many bytes. */
const LIST_READ_MAX_BYTES = 64 * 1024 * 1024;
/** doctor folds entries.jsonl only up to this size (the snapshot reader's limit). */
const DOCTOR_READ_MAX_BYTES = 4 * 1024 * 1024;
/** R14 scan caps. */
export const DOCTOR_AGENT_SCAN_MAX = 64;
export const DOCTOR_ROOM_SCAN_MAX = 4096;
const ROOM_KEY_RE = /^[0-9a-f]{16}$/;

export type ProfileSource = "--profile" | "LOOM_PROFILE" | "displayName" | "default";

export type MemoryCliDeps = {
  /** Resolved Loom dir (real CLI: `loomDir()`). */
  loomDir: string;
  /** `resolveBridgeProfile()` — the bridge's own profile resolution (R1). */
  profile: string;
  /** Where `profile` came from (R53-L2 list header). */
  profileSource: ProfileSource;
  /** Session displayName (else the profile) — `source.by` of human lines (D4). */
  displayName: string;
  /** Env for the redaction check (R53-L1 — the CLI entry injects process.env). */
  env: Record<string, string | undefined>;
  randomId?: () => string;
  now?: () => Date;
  stdout: (line: string) => void;
  stderr: (line: string) => void;
  /** `worker.skills.enabled` of the profile's bridge config; null = no bridge config. */
  skillsEnabled?: () => boolean | null;
};

export type CliArgs = { positional: readonly string[]; passthrough: readonly string[] };
export type CliFlags = Record<string, string | boolean>;

const MEMORY_USAGE =
  "usage: loom memory add|propose|list|show|approve|retire|compact [--agent claude|codex|grok] [--room <roomId>] …";
const LIST_USAGE =
  "usage: loom memory list [--agent claude|codex|grok] [--room <roomId>] [--all] [--json]";
const AGENT_ERROR = "--agent must be claude, codex or grok";
const RULES_USAGE = "usage: loom rules list [--json]";
const SKILLS_USAGE = "usage: loom skills list [--room <roomId>] [--json]";

class UsageError extends Error {}

function idUsage(verb: string): string {
  return `usage: loom memory ${verb} --agent <claude|codex|grok> <id>${verb === "show" ? " [--json]" : ""}`;
}

/** `--agent` → kind; undefined when absent and optional. */
function agentFlag(flags: CliFlags, required: boolean): AgentKind | undefined {
  const v = flags.agent;
  if (v === undefined && !required) return undefined;
  if (typeof v !== "string" || !(AGENT_KINDS as readonly string[]).includes(v)) {
    throw new UsageError(AGENT_ERROR);
  }
  return v as AgentKind;
}

function roomFlag(flags: CliFlags): string | null {
  const v = flags.room;
  if (v === undefined) return null;
  if (typeof v !== "string" || v.length === 0) throw new UsageError("--room needs a room id");
  return v;
}

function typeFlag(flags: CliFlags): MemoryEntryType {
  const v = flags.type;
  if (v === undefined) return "fact";
  if (typeof v !== "string" || !(ENTRY_TYPES as readonly string[]).includes(v)) {
    throw new UsageError("--type must be fact, decision or preference");
  }
  return v as MemoryEntryType;
}

function supersedesFlag(flags: CliFlags): string | null {
  const v = flags.supersedes;
  if (v === undefined) return null;
  if (typeof v !== "string" || v.length === 0) {
    throw new UsageError("--supersedes needs an entry id");
  }
  return v;
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function kib(bytes: number): number {
  return Math.ceil(bytes / 1024);
}

function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function bySeqId(a: FoldedEntry, b: FoldedEntry): number {
  return a.seq - b.seq || cmpStr(a.id, b.id);
}

// ---------------------------------------------------------------------------------------------
// read-only filesystem helpers (no lock · no create · lstat every component below loomDir)
// ---------------------------------------------------------------------------------------------

type Inspect =
  | { state: "absent" }
  /** `at` = the first offending path component. */
  | { state: "unsafe"; at: string }
  | { state: "file" | "dir"; path: string; bytes: number; mode: number };

/** lstat `<base>/<segs…>`; every component must be a real directory, the last `want`. */
function inspectUnder(base: string, segs: readonly string[], want: "file" | "dir"): Inspect {
  let cur = base;
  for (let i = 0; i < segs.length; i++) {
    cur = join(cur, segs[i] as string);
    let st: ReturnType<typeof lstatSync>;
    try {
      st = lstatSync(cur);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "ENOTDIR") return { state: "absent" };
      return { state: "unsafe", at: cur };
    }
    const last = i === segs.length - 1;
    if (st.isSymbolicLink()) return { state: "unsafe", at: cur };
    const kind = last ? want : "dir";
    if (kind === "dir" ? !st.isDirectory() : !st.isFile()) return { state: "unsafe", at: cur };
    if (last) return { state: kind, path: cur, bytes: st.size, mode: st.mode & 0o777 };
  }
  return { state: "absent" };
}

/** Read a regular file without following a symlink; null when it changed under us. */
function readNoFollow(path: string, max: number): string | null {
  let fd: number;
  try {
    fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK);
  } catch {
    return null;
  }
  try {
    const st = fstatSync(fd);
    if (!st.isFile() || st.size > max) return null;
    const buf = Buffer.alloc(st.size);
    let off = 0;
    while (off < buf.length) {
      const n = readSync(fd, buf, off, buf.length - off, off);
      if (n <= 0) break;
      off += n;
    }
    return buf.subarray(0, off).toString("utf8");
  } catch {
    return null;
  } finally {
    closeSync(fd);
  }
}

type StoreView = {
  agentKey: string;
  dir: string;
  entriesPath: string;
  state: "absent" | "ok" | "unsafe" | "oversize";
  /** First offending path when unsafe. */
  unsafeAt: string | null;
  bytes: number;
  fold: MemoryFold | null;
};

function readStore(loom: string, agentKey: string, max: number): StoreView {
  const p = memoryPaths(loom, agentKey);
  const base = {
    agentKey,
    dir: p.dir,
    entriesPath: p.entries,
    unsafeAt: null,
    bytes: 0,
    fold: null,
  };
  const ins = inspectUnder(loom, ["memory", agentKey, "entries.jsonl"], "file");
  if (ins.state === "absent") return { ...base, state: "absent" };
  if (ins.state === "unsafe") return { ...base, state: "unsafe", unsafeAt: ins.at };
  if (ins.bytes > max) return { ...base, state: "oversize", bytes: ins.bytes };
  const raw = readNoFollow(p.entries, max);
  if (raw === null) return { ...base, state: "unsafe", unsafeAt: p.entries };
  return { ...base, state: "ok", bytes: Buffer.byteLength(raw), fold: foldMemoryLines(raw) };
}

type HumanFileView = {
  path: string;
  state: "absent" | "file" | "unsafe";
  bytes: number;
  cap: number;
  truncatedOnRead: boolean;
};

function humanFile(loom: string, segs: readonly string[], cap: number): HumanFileView {
  const path = join(loom, ...segs);
  const ins = inspectUnder(loom, segs, "file");
  if (ins.state === "absent") {
    return { path, state: "absent", bytes: 0, cap, truncatedOnRead: false };
  }
  if (ins.state === "unsafe") {
    return { path, state: "unsafe", bytes: 0, cap, truncatedOnRead: false };
  }
  return { path, state: "file", bytes: ins.bytes, cap, truncatedOnRead: ins.bytes > cap };
}

function humanFileText(label: string, f: HumanFileView): string {
  if (f.state === "absent") return `${label}: ${f.path} (absent)`;
  if (f.state === "unsafe") {
    return `${label}: ${f.path} (unreadable: symlink or not a regular file)`;
  }
  return `${label}: ${f.path} (${f.bytes}/${f.cap} B${f.truncatedOnRead ? ", truncated on read" : ""})`;
}

function counts(fold: MemoryFold | null) {
  let proposed = 0;
  let retired = 0;
  if (fold) {
    for (const e of fold.entries.values()) {
      if (e.status === "proposed") proposed += 1;
      else if (e.status === "retired") retired += 1;
    }
  }
  return {
    active: fold ? fold.visibleActive.length : 0,
    proposed,
    retired,
    unparseable: fold?.counters.unparseable ?? 0,
    conflicts: fold?.counters.conflicts ?? 0,
    dangling: fold?.counters.dangling ?? 0,
    archivedRefs: fold?.counters.archivedRefs ?? 0,
  };
}

/** Entries that validly supersede `id` (ordered after it), (seq, id) order. */
function supersessors(fold: MemoryFold, target: FoldedEntry): FoldedEntry[] {
  const out: FoldedEntry[] = [];
  for (const e of fold.entries.values()) {
    if (e.supersedes === target.id && bySeqId(target, e) < 0) out.push(e);
  }
  return out.sort(bySeqId);
}

function firstLine(body: string): string {
  const line = body.split("\n")[0] ?? "";
  return Array.from(line).slice(0, 80).join("");
}

// ---------------------------------------------------------------------------------------------
// loom memory
// ---------------------------------------------------------------------------------------------

export async function runMemoryCommand(
  verb: string,
  args: CliArgs,
  flags: CliFlags,
  deps: MemoryCliDeps,
): Promise<number> {
  const fail = (reason: string): number => {
    deps.stderr(`loom memory: ${reason}`);
    return 1;
  };
  try {
    switch (verb) {
      case "add":
      case "propose":
        return memoryAdd(verb, args, flags, deps, fail);
      case "approve":
      case "retire":
        return memoryTransition(verb, args, flags, deps, fail);
      case "compact":
        return memoryCompact(args, flags, deps, fail);
      case "list":
        return memoryList(args, flags, deps);
      case "show":
        return memoryShow(args, flags, deps, fail);
      default:
        return fail(MEMORY_USAGE);
    }
  } catch (err) {
    return fail(errText(err));
  }
}

type Fail = (reason: string) => number;

function refused(r: MemoryRefusal, fail: Fail): number {
  return fail(r.message);
}

function memoryAdd(
  verb: "add" | "propose",
  args: CliArgs,
  flags: CliFlags,
  deps: MemoryCliDeps,
  fail: Fail,
): number {
  let kind: AgentKind;
  let room: string | null;
  let type: MemoryEntryType;
  let supersedes: string | null;
  try {
    kind = agentFlag(flags, true) as AgentKind;
    room = roomFlag(flags);
    type = typeFlag(flags);
    supersedes = supersedesFlag(flags);
  } catch (err) {
    if (err instanceof UsageError) return fail(err.message);
    throw err;
  }
  // R13: body = everything after `--` when given, else the positional words.
  const body = (args.passthrough.length > 0 ? args.passthrough : args.positional).join(" ");
  const agentKey = agentKeyFor(deps.profile, kind);
  const r = appendMemoryEntry(
    deps.loomDir,
    agentKey,
    {
      body,
      type,
      appliesTo: room === null ? "project" : `room:${roomKey(room)}`,
      status: verb === "add" ? "active" : "proposed",
      supersedes,
      source: humanMemorySource(deps.displayName),
    },
    { env: deps.env, randomId: deps.randomId, now: deps.now },
  );
  if (!r.ok) return refused(r, fail);
  if (verb === "add") {
    deps.stdout(`added ${r.id} (active, seq ${r.seq}) to ${r.path}`);
  } else {
    deps.stdout(
      `proposed ${r.id} (seq ${r.seq}) — approve with: loom memory approve --agent ${kind} ${r.id}`,
    );
  }
  return 0;
}

function memoryTransition(
  verb: "approve" | "retire",
  args: CliArgs,
  flags: CliFlags,
  deps: MemoryCliDeps,
  fail: Fail,
): number {
  let kind: AgentKind;
  try {
    kind = agentFlag(flags, true) as AgentKind;
  } catch (err) {
    if (err instanceof UsageError) return fail(err.message);
    throw err;
  }
  if (args.positional.length !== 1) return fail(idUsage(verb));
  const id = args.positional[0] as string;
  const r = appendMemoryTransition(
    deps.loomDir,
    agentKeyFor(deps.profile, kind),
    {
      id,
      to: verb === "approve" ? "active" : "retired",
      source: humanMemorySource(deps.displayName),
    },
    { now: deps.now },
  );
  if (!r.ok) return refused(r, fail);
  deps.stdout(`${verb === "approve" ? "approved" : "retired"} ${r.id} (seq ${r.seq})`);
  return 0;
}

function memoryCompact(args: CliArgs, flags: CliFlags, deps: MemoryCliDeps, fail: Fail): number {
  let kind: AgentKind;
  try {
    kind = agentFlag(flags, true) as AgentKind;
  } catch (err) {
    if (err instanceof UsageError) return fail(err.message);
    throw err;
  }
  if (args.positional.length > 0 || args.passthrough.length > 0) {
    return fail("usage: loom memory compact --agent <claude|codex|grok>");
  }
  const r = compactMemory(deps.loomDir, agentKeyFor(deps.profile, kind));
  if (!r.ok) return refused(r, fail);
  deps.stdout(r.message);
  return 0;
}

function entryJson(fold: MemoryFold, e: FoldedEntry) {
  return {
    id: e.id,
    seq: e.seq,
    status: e.status,
    type: e.type,
    appliesTo: e.appliesTo,
    body: e.body,
    source: e.source,
    supersedes: e.supersedes,
    supersededBy: supersessors(fold, e).map((s) => s.id),
    hidden: e.hidden,
    at: e.at,
  };
}

function memoryList(args: CliArgs, flags: CliFlags, deps: MemoryCliDeps): number {
  let kind: AgentKind | undefined;
  let room: string | null;
  try {
    kind = agentFlag(flags, false);
    room = roomFlag(flags);
    if (args.positional.length > 0 || args.passthrough.length > 0) throw new UsageError(LIST_USAGE);
  } catch (err) {
    if (err instanceof UsageError) {
      deps.stderr(`loom memory: ${err.message}`);
      return 1;
    }
    throw err;
  }
  const loom = deps.loomDir;
  const rk = room === null ? null : roomKey(room);
  const all = flags.all === true;
  const kinds = kind ? [kind] : AGENT_KINDS;
  const index = humanFile(loom, ["knowledge", "INDEX.md"], INDEX_CAP);
  const guideline =
    rk === null ? null : humanFile(loom, ["rooms", rk, "guideline.md"], GUIDELINE_CAP);

  const agents = kinds.map((k) => {
    const agentKey = agentKeyFor(deps.profile, k);
    const store = readStore(loom, agentKey, LIST_READ_MAX_BYTES);
    const persona = humanFile(loom, ["memory", agentKey, "persona.md"], PERSONA_CAP);
    const fold = store.fold;
    const rows = fold
      ? [...fold.entries.values()]
          .filter((e) => all || e.status === "proposed" || (e.status === "active" && !e.hidden))
          .filter((e) => rk === null || e.appliesTo === "project" || e.appliesTo === `room:${rk}`)
          .sort(bySeqId)
      : [];
    return { kind: k, agentKey, store, persona, fold, rows };
  });

  if (flags.json === true) {
    const out = {
      profile: deps.profile,
      profileSource: deps.profileSource,
      room: room === null ? null : { roomId: room, roomKey: rk },
      knowledgeIndex: index,
      agents: agents.map((a) => ({
        agent: a.kind,
        agentKey: a.agentKey,
        dir: a.store.dir,
        entriesPath: a.store.entriesPath,
        state: a.store.state,
        ...(a.store.unsafeAt ? { unsafePath: a.store.unsafeAt } : {}),
        entriesBytes: a.store.bytes,
        caps: {
          active: MEMORY_ACTIVE_CAP,
          proposed: MEMORY_PROPOSED_CAP,
          entriesBytes: MEMORY_ENTRIES_MAX_BYTES,
        },
        counts: counts(a.fold),
        persona: a.persona,
        guideline,
        entries: a.fold ? a.rows.map((e) => entryJson(a.fold as MemoryFold, e)) : [],
      })),
    };
    deps.stdout(JSON.stringify(out, null, 2));
    return 0;
  }

  deps.stdout(`profile ${deps.profile} (from ${deps.profileSource})`);
  deps.stdout(humanFileText("knowledge/INDEX.md", index));
  for (const a of agents) {
    deps.stdout(`agent ${a.agentKey}  ${a.store.dir}`);
    if (a.store.state === "unsafe") {
      deps.stdout(`  entries: unreadable — ${a.store.unsafeAt} is a symlink or not a regular path`);
    } else if (a.store.state === "oversize") {
      deps.stdout(
        `  entries: not read — entries.jsonl is ${kib(a.store.bytes)} KiB (over ${LIST_READ_MAX_BYTES / 1024} KiB)`,
      );
    } else {
      const c = counts(a.fold);
      deps.stdout(
        `  entries: active ${c.active}/${MEMORY_ACTIVE_CAP} · proposed ${c.proposed}/${MEMORY_PROPOSED_CAP} · retired ${c.retired} · entries.jsonl ${kib(a.store.bytes)} KiB/${MEMORY_ENTRIES_MAX_BYTES / 1024} KiB · unparseable ${c.unparseable} · conflicts ${c.conflicts} · dangling ${c.dangling} · archived refs ${c.archivedRefs}`,
      );
    }
    deps.stdout(`  ${humanFileText("persona.md", a.persona)}`);
    if (guideline) deps.stdout(`  ${humanFileText("guideline.md", guideline)}`);
    for (const e of a.rows) {
      deps.stdout(
        `  ${e.id}  ${e.status}  ${e.type}  ${e.appliesTo}  seq ${e.seq}  ${firstLine(e.body)}`,
      );
    }
  }
  return 0;
}

function memoryShow(args: CliArgs, flags: CliFlags, deps: MemoryCliDeps, fail: Fail): number {
  let kind: AgentKind;
  try {
    kind = agentFlag(flags, true) as AgentKind;
  } catch (err) {
    if (err instanceof UsageError) return fail(err.message);
    throw err;
  }
  if (args.positional.length !== 1) return fail(idUsage("show"));
  const id = args.positional[0] as string;
  const agentKey = agentKeyFor(deps.profile, kind);
  const store = readStore(deps.loomDir, agentKey, LIST_READ_MAX_BYTES);
  if (store.state === "unsafe") {
    return fail(`refusing ${store.unsafeAt}: symlink or not a regular path`);
  }
  if (store.state === "oversize") {
    return fail(`entries.jsonl is ${kib(store.bytes)} KiB — too large to read`);
  }
  const fold = store.fold;
  const e = fold?.entries.get(id);
  if (!fold || !e) return fail(`entry ${id} not found`);
  const by = supersessors(fold, e);

  if (flags.json === true) {
    deps.stdout(
      JSON.stringify(
        {
          agentKey,
          entry: {
            id: e.id,
            seq: e.seq,
            status: e.status,
            type: e.type,
            appliesTo: e.appliesTo,
            body: e.body,
            source: e.source,
            supersedes: e.supersedes,
            supersedesArchived: e.supersedesArchived,
            hidden: e.hidden,
            at: e.at,
          },
          transitions: e.transitions,
          supersededBy: by.map((s) => ({ id: s.id, status: s.status })),
        },
        null,
        2,
      ),
    );
    return 0;
  }

  const out: string[] = [
    e.id,
    `  status: ${e.status}`,
    `  type: ${e.type}`,
    `  appliesTo: ${e.appliesTo}`,
    `  seq: ${e.seq}`,
    `  source: ${JSON.stringify(e.source)}`,
    `  supersedes: ${e.supersedes ?? "none"}${e.supersedesArchived ? " (archived)" : ""}`,
    ...by.map((s) => `  superseded by ${s.id} (${s.status})`),
  ];
  if (e.at !== undefined) out.push(`  at: ${e.at}`);
  out.push("  history:");
  if (e.transitions.length === 0) out.push("    (none)");
  for (const t of e.transitions) {
    out.push(`    seq ${t.seq}  to ${t.to}  ${JSON.stringify(t.source)}`);
  }
  out.push("  body:");
  for (const l of e.body.split("\n")) out.push(`    ${l}`);
  for (const l of out) deps.stdout(l);
  return 0;
}

// ---------------------------------------------------------------------------------------------
// loom rules list
// ---------------------------------------------------------------------------------------------

function ruleStatusText(r: RuleView): string {
  switch (r.status) {
    case "bundled":
      return "bundled";
    case "user":
      return "user";
    case "override":
      return "user (overrides bundled)";
    case "disabled":
      return "disabled by user";
  }
}

export async function runRulesCommand(
  verb: string,
  args: CliArgs,
  flags: CliFlags,
  deps: MemoryCliDeps,
): Promise<number> {
  if (verb !== "list" || args.positional.length > 0 || args.passthrough.length > 0) {
    deps.stderr(`loom rules: ${RULES_USAGE}`);
    return 1;
  }
  let v: ReturnType<typeof loadRules>;
  try {
    v = loadRules(deps.loomDir);
  } catch (err) {
    deps.stderr(`loom rules: ${errText(err)}`);
    return 1;
  }
  if (flags.json === true) {
    deps.stdout(
      JSON.stringify(
        {
          counts: v.counts,
          rules: v.rules.map(({ body: _body, ...r }) => r),
          invalid: v.invalid,
          conflicts: v.conflicts,
          userDir: v.userDir,
          userDirState: v.userDirState,
          scanCapped: v.scanCapped,
        },
        null,
        2,
      ),
    );
    return 0;
  }
  const c = v.counts;
  deps.stdout(
    `rules: bundled ${c.bundled} · user ${c.user} · overrides ${c.overrides} · disabled ${c.disabled} · invalid ${c.invalid}`,
  );
  for (const r of v.rules) {
    deps.stdout(
      `${r.id}  ${ruleStatusText(r)}  scope=${r.scope}  priority=${r.priority}  ${r.bytes}/${RULE_MAX_BYTES} B${r.truncated ? " truncated" : ""}  ${r.path}`,
    );
  }
  for (const i of v.invalid) deps.stdout(`invalid: ${i.file}: ${i.reason}`);
  for (const k of v.conflicts) {
    deps.stdout(
      `conflict: ${k.source} id ${k.id}: kept ${k.kept}, ignored ${k.dropped.join(", ")}`,
    );
  }
  if (v.scanCapped) deps.stdout("scan capped at 256 user rule files");
  return 0;
}

// ---------------------------------------------------------------------------------------------
// loom skills list
// ---------------------------------------------------------------------------------------------

export async function runSkillsCommand(
  verb: string,
  args: CliArgs,
  flags: CliFlags,
  deps: MemoryCliDeps,
): Promise<number> {
  if (verb !== "list" || args.positional.length > 0 || args.passthrough.length > 0) {
    deps.stderr(`loom skills: ${SKILLS_USAGE}`);
    return 1;
  }
  let room: string | null;
  try {
    room = roomFlag(flags);
  } catch (err) {
    deps.stderr(`loom skills: ${errText(err)}`);
    return 1;
  }
  let enabled: boolean | null = null;
  let bridgeConfigError: string | undefined;
  try {
    enabled = deps.skillsEnabled ? deps.skillsEnabled() : null;
  } catch (err) {
    bridgeConfigError = errText(err);
  }
  let policy: SkillPolicy | null = null;
  let policyError: string | null = null;
  try {
    policy = mergePolicy(builtinPolicyDefaults(), loadPolicy(deps.loomDir), {}).effective.skills;
  } catch (err) {
    policyError = errText(err);
  }
  const inv = await inventorySkills(deps.loomDir, policy);

  let roomView: {
    roomId: string;
    roomKey: string;
    selected: string[];
    notInstalled: string[];
    error?: string;
  } | null = null;
  if (room !== null) {
    const rk = roomKey(room);
    const installed = new Set(
      inv.skills.filter((s) => s.reason !== "not installed").map((s) => s.name),
    );
    try {
      const selected = await readRoomSkillSelection(deps.loomDir, room);
      roomView = {
        roomId: room,
        roomKey: rk,
        selected,
        notInstalled: selected.filter((n) => !installed.has(n)),
      };
    } catch (err) {
      roomView = { roomId: room, roomKey: rk, selected: [], notInstalled: [], error: errText(err) };
    }
  }

  if (flags.json === true) {
    deps.stdout(
      JSON.stringify(
        {
          profile: deps.profile,
          skillsEnabled: enabled,
          ...(bridgeConfigError !== undefined ? { bridgeConfigError } : {}),
          policyError,
          skills: inv.skills,
          ignored: inv.ignored,
          userRoot: inv.userRoot,
          room: roomView,
        },
        null,
        2,
      ),
    );
    return 0;
  }

  const enabledText =
    bridgeConfigError !== undefined
      ? `unknown — bridge config invalid: ${bridgeConfigError}`
      : enabled === null
        ? "no bridge config"
        : String(enabled);
  deps.stdout(`skills: worker.skills.enabled = ${enabledText} (profile ${deps.profile})`);
  if (policyError !== null) deps.stdout(`policy invalid: ${policyError}`);
  for (const s of inv.skills) {
    const status =
      s.status === "available"
        ? "available"
        : s.status === "unknown"
          ? "unknown"
          : `unavailable: ${s.reason ?? "unknown reason"}`;
    const parts = [s.name, s.source, status];
    if (s.shadowsBuiltin) parts.push("user shadows builtin");
    if (s.description) parts.push(s.description);
    deps.stdout(parts.join("  "));
  }
  for (const name of inv.ignored) deps.stdout(`ignored: ${name} (invalid name)`);
  if (inv.userRoot === "unsafe") {
    deps.stdout(`ignored: ${join(deps.loomDir, "skills")} (symlink or not a directory)`);
  }
  if (roomView) {
    if (roomView.error !== undefined) {
      deps.stdout(`selected in room ${roomView.roomKey}: unreadable — ${roomView.error}`);
    } else {
      const names = roomView.selected.map((n) =>
        roomView?.notInstalled.includes(n) ? `${n} (not installed)` : n,
      );
      deps.stdout(
        `selected in room ${roomView.roomKey}: ${names.length > 0 ? names.join(", ") : "(none)"}`,
      );
    }
  }
  return 0;
}

// ---------------------------------------------------------------------------------------------
// real deps (index.ts)
// ---------------------------------------------------------------------------------------------

/**
 * The CLI entry's deps: `loomDir()` (stateRootHome — honours LOOM_TEST_HOME), the bridge's
 * profile resolution (`resolveBridgeProfile` — `--profile` · LOOM_PROFILE · displayName ·
 * default) and its source, process.env for the redaction check, console output.
 */
export function realMemoryCliDeps(flags: CliFlags): MemoryCliDeps {
  const session = loadSession();
  const profile = resolveBridgeProfile(session);
  const profileSource: ProfileSource =
    typeof flags.profile === "string" && flags.profile.length > 0
      ? "--profile"
      : getActiveProfile()
        ? "LOOM_PROFILE"
        : session?.displayName
          ? "displayName"
          : "default";
  return {
    loomDir: loomDir(),
    profile,
    profileSource,
    displayName: session?.displayName || profile,
    env: process.env,
    stdout: (l) => console.log(l),
    stderr: (l) => console.error(l),
    skillsEnabled: () => {
      if (!existsSync(bridgeConfigPath(profile))) return null;
      return loadBridgeConfig(profile).worker?.skills?.enabled === true;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// doctor Memory section — read-only gatherer (③ · R14: no lock, no write, scan caps)
// ---------------------------------------------------------------------------------------------

function fileView(i: Inspect): MemoryDoctorFile {
  if (i.state === "absent") return { state: "absent" };
  if (i.state === "file") return { state: "file", bytes: i.bytes, mode: i.mode };
  return { state: "unsafe" };
}

function listDir(path: string): string[] | null {
  try {
    return readdirSync(path).sort(cmpStr);
  } catch {
    return null;
  }
}

function doctorAgent(loom: string, agentKey: string): MemoryDoctorAgent {
  const dir = inspectUnder(loom, ["memory", agentKey], "dir");
  if (dir.state !== "dir") {
    return {
      agentKey,
      dir: "unsafe",
      entries: { state: "absent" },
      fold: null,
      archive: { state: "absent" },
      persona: { state: "absent" },
    };
  }
  const entriesIns = inspectUnder(loom, ["memory", agentKey, "entries.jsonl"], "file");
  const entries = fileView(entriesIns);
  let fold: MemoryDoctorAgent["fold"] = null;
  if (entries.state === "absent") {
    fold = counts(null);
  } else if (entriesIns.state === "file" && entriesIns.bytes <= DOCTOR_READ_MAX_BYTES) {
    const raw = readNoFollow(entriesIns.path, DOCTOR_READ_MAX_BYTES);
    if (raw !== null) fold = counts(foldMemoryLines(raw));
  }
  return {
    agentKey,
    dir: "dir",
    entries,
    fold,
    archive: fileView(inspectUnder(loom, ["memory", agentKey, "entries.archive.jsonl"], "file")),
    persona: fileView(inspectUnder(loom, ["memory", agentKey, "persona.md"], "file")),
  };
}

/** Never throws, takes no lock, creates/writes nothing. */
export function readMemoryDoctorInput(
  loom: string,
  platform: string = process.platform,
): MemoryDoctorInput {
  const memoryDir = join(loom, "memory");
  const rootIns = inspectUnder(loom, ["memory"], "dir");
  const root: MemoryDoctorInput["root"] =
    rootIns.state === "absent"
      ? { state: "absent" }
      : rootIns.state === "dir"
        ? { state: "dir", mode: rootIns.mode }
        : { state: "unsafe" };
  const agents: MemoryDoctorAgent[] = [];
  const ignored: string[] = [];
  let agentScanCapped = false;
  if (root.state === "dir") {
    for (const name of listDir(memoryDir) ?? []) {
      if (!isAgentKey(name)) {
        ignored.push(name);
        continue;
      }
      if (agents.length >= DOCTOR_AGENT_SCAN_MAX) {
        agentScanCapped = true;
        continue;
      }
      agents.push(doctorAgent(loom, name));
    }
  }

  const roomsIns = inspectUnder(loom, ["rooms"], "dir");
  const rooms: MemoryDoctorInput["rooms"] = {
    state: roomsIns.state === "dir" ? "dir" : roomsIns.state === "absent" ? "absent" : "unsafe",
    guidelines: [],
    scanCapped: false,
  };
  if (roomsIns.state === "dir") {
    const keys = (listDir(roomsIns.path) ?? []).filter((n) => ROOM_KEY_RE.test(n));
    if (keys.length > DOCTOR_ROOM_SCAN_MAX) rooms.scanCapped = true;
    for (const rk of keys.slice(0, DOCTOR_ROOM_SCAN_MAX)) {
      const g = fileView(inspectUnder(loom, ["rooms", rk, "guideline.md"], "file"));
      if (g.state !== "absent") rooms.guidelines.push({ roomKey: rk, file: g });
    }
  }

  let rules: MemoryDoctorInput["rules"];
  try {
    const v = loadRules(loom);
    rules = {
      bundled: v.counts.bundled,
      user: v.counts.user,
      overrides: v.counts.overrides,
      disabled: v.counts.disabled,
      invalid: v.counts.invalid,
      conflicts: [...new Set(v.conflicts.map((c) => c.id))],
      truncated: v.rules.filter((r) => r.truncated).map((r) => r.id),
      scanCapped: v.scanCapped,
    };
  } catch {
    rules = {
      bundled: 0,
      user: 0,
      overrides: 0,
      disabled: 0,
      invalid: 1,
      conflicts: [],
      truncated: [],
      scanCapped: false,
    };
  }

  return {
    platform,
    memoryDir,
    root,
    agents,
    ignored,
    agentScanCapped,
    knowledgeIndexPath: join(loom, "knowledge", "INDEX.md"),
    knowledgeIndex: fileView(inspectUnder(loom, ["knowledge", "INDEX.md"], "file")),
    rooms,
    rules,
  };
}
