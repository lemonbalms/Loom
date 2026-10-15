/**
 * PLAN 0.31.0 P1. policy.json v1 schema, loader, merge, and policyHash.
 * PLAN 0.32.0 P1 (D4 / D5 / D7 / R8): optional `loomTools` — parsed here, resolved by
 * resolveLoomTools, and never part of EffectivePolicy (worker fingerprint unchanged).
 * Pure: no bridge-runtime / headless-worker / argv wiring.
 *
 * D7 schema. D8 allow replaces, deny unions, nothing relaxes a deny.
 * shell.allow is optional: absent = not replaced (builtin, or deprecated allow).
 * R3 skills.allow absent = all, [] = none. R4 curl/wget and web tools are
 * derived from network=false, not stored in the builtin shell deny.
 * R5 / R49-M2 deprecated bridge tool lists. D13 isolate defaults true.
 * UK-1: owner rules are `p *`; builtin no-space Bash forms become `p` + `p *`.
 * UK-1 §G: a no-space `p*` also matches lookalikes (`echo*` denies `echoes`),
 * so a deprecated owner deny in that form refuses startup instead of being
 * silently narrowed. A deprecated owner allow in that form is narrowed (safe).
 * Upgrade compatibility: a deprecated deny entry that exactly equals a 0.30.0
 * D10 deny entry is accepted and normalized like the builtin (already in the
 * builtin deny, so no coverage is lost), with a warning to remove the list.
 */
import { createHash } from "node:crypto";
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  statSync,
} from "node:fs";
import { dirname, join } from "node:path";

/** First non-whitespace character is a flag-shaped dash (agent-argv RULE_FLAG_PREFIX). */
const RULE_FLAG_PREFIX = /^[-\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/;
const SHELL_META = /[;&|`><]|\$\(/;
const SKILL_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MCP_DENY = /^[A-Za-z0-9][A-Za-z0-9._-]*__[A-Za-z0-9][A-Za-z0-9._-]*$/;
const WEB_TOOLS = new Set(["WebFetch", "WebSearch"]);
const NON_SHELL_TOOLS = new Set(["Read", "Edit", "Write", "Glob", "Grep", "WebFetch", "WebSearch"]);
/**
 * 0.30.0 D10 tool lists, verbatim (formerly agent-argv defaults). The builtin
 * policy is derived from them; 0.31.0 never emits these strings as-is.
 */
export const LEGACY_D10_ALLOWED_TOOLS: readonly string[] = [
  "Read",
  "Edit",
  "Write",
  "Glob",
  "Grep",
  "Bash(git status*)",
  "Bash(git diff*)",
  "Bash(git log*)",
  "Bash(bun test*)",
  "Bash(bun run *)",
  "Bash(npm test*)",
];

/** 0.30.0 D10 deny list, verbatim. acceptEdits still auto-allows plain rm inside cwd. */
export const LEGACY_D10_DENIED_TOOLS: readonly string[] = [
  "Bash(rm *)",
  "Bash(rmdir *)",
  "Bash(git push*)",
  "Bash(git reset --hard*)",
  "Bash(git clean*)",
  "Bash(sudo *)",
  "Bash(curl *)",
  "Bash(wget *)",
];

/** D10 deny entries an owner may have copied verbatim; exact (case-sensitive) match only. */
const LEGACY_D10_DENY_SET: ReadonlySet<string> = new Set(LEGACY_D10_DENIED_TOOLS);

/** policy.json read cap (bytes). Larger files fail closed. */
export const POLICY_MAX_BYTES = 64 * 1024;

/**
 * PLAN 0.32.0 D5. Loom MCP argument-level deny modes (policy.json `loomTools.denyModes`).
 * board.replace = import_board mode=replace · broadcast = handoff to="*" ·
 * conv.writes = conv_open writesAllowed=true · conv.fetch = conv_fetch ·
 * pack.embed = handoff withPackEmbed=true.
 */
export const LOOM_DENY_MODES = [
  "board.replace",
  "broadcast",
  "conv.writes",
  "conv.fetch",
  "pack.embed",
] as const;

export type LoomDenyMode = (typeof LOOM_DENY_MODES)[number];

/** D4 done knob. `allow` = 0.31.0 behaviour (audited); `propose` = MCP done refused. */
export type LoomDoneMode = "allow" | "propose";

/** policy.json `loomTools` as written (both keys optional). */
export type LoomToolsPolicy = {
  done?: LoomDoneMode;
  /** Deduped. Unioned with the built-in deny (never relaxes it). */
  denyModes?: LoomDenyMode[];
};

/** `loomTools` after the built-in default merge. */
export type ResolvedLoomTools = {
  done: LoomDoneMode;
  denyModes: LoomDenyMode[];
};

const LOOM_DENY_MODE_SET: ReadonlySet<string> = new Set(LOOM_DENY_MODES);

/** Built-in `loomTools`: done allowed, only the whole-board replace denied (D4 / D5). */
const BUILTIN_LOOM_DONE: LoomDoneMode = "allow";
const BUILTIN_LOOM_DENY_MODES: readonly LoomDenyMode[] = ["board.replace"];

export type ShellRules = {
  allow: string[];
  deny: string[];
};

/**
 * Parsed policy.json. `skills.allow` omitted means every installed name.
 * `shell.allow` omitted means the allow set is not replaced (D8). [] is present.
 */
export type PolicyV1 = {
  version: 1;
  shell: { allow?: string[]; deny: string[] };
  network: boolean;
  mcp: {
    deny: string[];
    /** Omitted in the file. Effective policy defaults this to true. */
    isolate?: boolean;
  };
  skills: {
    allow?: string[];
    allowScripts: string[];
  };
  /**
   * 0.32.0 D7. Loom MCP pre-check knobs. Never part of EffectivePolicy, so it
   * never reaches policyHash or the worker fingerprint (R8). Omitted = built-in.
   */
  loomTools?: LoomToolsPolicy;
};

/** Built-in baseline passed into mergePolicy. */
export type PolicyDefaults = {
  shell: ShellRules;
  network: boolean;
  mcp: { deny: string[]; isolate: boolean };
  skills: { allow?: string[]; allowScripts: string[] };
};

/**
 * Deprecated `worker.permissions` tool lists (0.30.0 Bash()/tool names).
 * Presence is raw and three-valued per list:
 * - `undefined` (or key omitted): the owner did not write the list → no effect, no warning.
 * - `[]`: the owner wrote an empty list → present; it still triggers the deprecation
 *   warning (and an empty deprecated allow still replaces the shell allow set).
 * - non-empty: present.
 * P2 callers must pass raw presence from the bridge config as the owner wrote it,
 * never materialized defaults (e.g. not `defaultWorkerPermissions()` lists).
 * Paths are named in the refusal and the startup warnings.
 */
export type DeprecatedToolLists = {
  /** Raw owner allow list. `undefined` = absent; `[]` = present-but-empty. */
  allow?: readonly string[] | undefined;
  /** Raw owner deny list. `undefined` = absent; `[]` = present-but-empty. */
  deny?: readonly string[] | undefined;
  allowPath?: string;
  denyPath?: string;
  policyPath?: string;
};

/** Config-level policy after defaults, the file, deprecation, and R4 derivation. */
export type EffectivePolicy = {
  version: 1;
  shell: ShellRules;
  network: boolean;
  mcp: { deny: string[]; isolate: boolean };
  skills: {
    /** null = all installed names. [] = none. */
    allow: string[] | null;
    allowScripts: string[];
  };
  /** Claude web tools denied because network is false, plus deprecated web denies. */
  webDeny: string[];
  /**
   * Non-shell deprecated denies other than WebFetch/WebSearch.
   * Kept so a deprecated deny is not dropped (D8). Not a policy.json field.
   */
  toolDeny: string[];
};

export type PolicyMergeResult = {
  effective: EffectivePolicy;
  warnings: string[];
};

type ProjectedRules = {
  shell: string[];
  web: string[];
  tools: string[];
  /** Deprecated allow entries in no-space `p*` form that were narrowed. */
  narrowed: string[];
  /** Deprecated deny entries in no-space `p*` form identical to a 0.30.0 D10 deny entry. */
  builtinIdentical: string[];
};

type DeprecatedKind = "allow" | "deny";

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function assertRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${field}: must be an object`);
  return value;
}

function rejectUnknown(
  obj: Record<string, unknown>,
  allowed: readonly string[],
  field: string,
): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) {
      throw new Error(`${field}: unknown key ${JSON.stringify(key)}`);
    }
  }
}

function requireKey(obj: Record<string, unknown>, key: string, field: string): unknown {
  if (!Object.hasOwn(obj, key)) throw new Error(`${field}: is required`);
  return obj[key];
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${field}: must be a string[]`);
  const out: string[] = [];
  for (let i = 0; i < value.length; i++) {
    const item = value[i];
    if (typeof item !== "string") throw new Error(`${field}[${i}]: must be a string`);
    out.push(item);
  }
  return out;
}

function assertCommand(command: string, field: string): void {
  if (command.length === 0 || command.trim().length === 0) {
    throw new Error(`${field}: empty`);
  }
  if (command !== command.trim()) {
    throw new Error(`${field}: must end with " *": ${JSON.stringify(command)}`);
  }
  if (RULE_FLAG_PREFIX.test(command)) {
    throw new Error(`${field}: leading '-' rejected: ${JSON.stringify(command)}`);
  }
  if (command.includes("*")) {
    throw new Error(`${field}: rejected no-space '*' suffix: ${JSON.stringify(command)}`);
  }
  if (SHELL_META.test(command)) {
    throw new Error(`${field}: shell metacharacter rejected: ${JSON.stringify(command)}`);
  }
}

/** Owner-facing shell rule. The only accepted shape is `p *`. */
function assertShellRule(rule: string, field: string): void {
  if (rule.length === 0 || rule.trim().length === 0) {
    throw new Error(`${field}: empty`);
  }
  if (rule.includes("\0")) throw new Error(`${field}: contains NUL`);
  if (rule.includes("\r")) throw new Error(`${field}: contains CR`);
  if (rule.includes("\n")) throw new Error(`${field}: contains LF`);
  if (rule.endsWith("*") && !rule.endsWith(" *")) {
    throw new Error(`${field}: rejected no-space '*' suffix: ${JSON.stringify(rule)}`);
  }
  if (!rule.endsWith(" *")) {
    throw new Error(`${field}: must end with " *": ${JSON.stringify(rule)}`);
  }
  const command = rule.slice(0, -2);
  if (command.length === 0 || command.trim().length === 0) {
    throw new Error(`${field}: empty`);
  }
  if (RULE_FLAG_PREFIX.test(command)) {
    throw new Error(`${field}: leading '-' rejected: ${JSON.stringify(rule)}`);
  }
  assertCommand(command, field);
}

function shellRules(value: unknown, field: string): string[] {
  const rules = stringArray(value, field);
  for (let i = 0; i < rules.length; i++) assertShellRule(rules[i], `${field}[${i}]`);
  return rules;
}

function skillNames(value: unknown, field: string): string[] {
  const names = stringArray(value, field);
  for (let i = 0; i < names.length; i++) {
    if (!SKILL_NAME.test(names[i])) {
      throw new Error(`${field}[${i}]: invalid skill name: ${JSON.stringify(names[i])}`);
    }
  }
  return names;
}

function mcpDenyList(value: unknown): string[] {
  const items = stringArray(value, "mcp.deny");
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.includes("\0") || item.includes("\r") || item.includes("\n") || !MCP_DENY.test(item)) {
      throw new Error(`mcp.deny[${i}]: must be "<server>__<tool>": ${JSON.stringify(item)}`);
    }
  }
  return items;
}

/** 0.32.0 D7 `loomTools`. Unknown keys, out-of-enum values, and unknown modes throw. */
function loomToolsPolicy(value: unknown): LoomToolsPolicy {
  const obj = assertRecord(value, "loomTools");
  rejectUnknown(obj, ["done", "denyModes"], "loomTools");
  const out: LoomToolsPolicy = {};
  if (Object.hasOwn(obj, "done")) {
    if (obj.done !== "allow" && obj.done !== "propose") {
      throw new Error(`loomTools.done: must be "allow" or "propose"`);
    }
    out.done = obj.done;
  }
  if (Object.hasOwn(obj, "denyModes")) {
    const modes = stringArray(obj.denyModes, "loomTools.denyModes");
    for (let i = 0; i < modes.length; i++) {
      if (!LOOM_DENY_MODE_SET.has(modes[i])) {
        throw new Error(`loomTools.denyModes[${i}]: unknown mode ${JSON.stringify(modes[i])}`);
      }
    }
    out.denyModes = sortedUnique(modes) as LoomDenyMode[];
  }
  return out;
}

/**
 * 0.32.0 D4 / D5. Built-in `{done: "allow", denyModes: ["board.replace"]}` merged
 * with the policy: `done` replaces, `denyModes` unions (nothing relaxes a deny,
 * so a policy `[]` still yields board.replace). Pure; the result is a fresh copy.
 */
export function resolveLoomTools(policy: PolicyV1 | null): ResolvedLoomTools {
  const loomTools = policy?.loomTools;
  return {
    done: loomTools?.done ?? BUILTIN_LOOM_DONE,
    denyModes: sortedUnique([
      ...BUILTIN_LOOM_DENY_MODES,
      ...(loomTools?.denyModes ?? []),
    ]) as LoomDenyMode[],
  };
}

/**
 * 0.30.0 `Bash(p*)` / `Bash(p *)` / `Bash(p)` → policy rules.
 * No-space star becomes `p` and `p *`. Never returns a no-space `p*` string.
 */
function normalizeBashInner(inner: string, field: string): string[] {
  if (inner.includes("\0")) throw new Error(`${field}: contains NUL`);
  if (inner.includes("\r")) throw new Error(`${field}: contains CR`);
  if (inner.includes("\n")) throw new Error(`${field}: contains LF`);
  if (inner.endsWith(" *")) {
    const command = inner.slice(0, -2);
    assertCommand(command, field);
    return [`${command} *`];
  }
  if (inner.endsWith("*")) {
    const command = inner.slice(0, -1);
    assertCommand(command, field);
    return [command, `${command} *`];
  }
  assertCommand(inner, field);
  return [inner];
}

function bashInner(tool: string): string | null {
  const match = /^Bash\((.*)\)$/.exec(tool);
  return match ? match[1] : null;
}

function isCurlOrWget(rule: string): boolean {
  const command = rule.endsWith(" *") ? rule.slice(0, -2) : rule;
  return command.split(" ")[0] === "curl" || command.split(" ")[0] === "wget";
}

function shellRulesFromTools(tools: readonly string[]): string[] {
  const out: string[] = [];
  for (const tool of tools) {
    const inner = bashInner(tool);
    if (inner === null) continue;
    out.push(...normalizeBashInner(inner, `builtin ${tool}`));
  }
  return out;
}

/** `p*` (no space before the star) → `p`; otherwise null. */
function noSpaceCommand(rule: string): string | null {
  if (!rule.endsWith("*") || rule.endsWith(" *")) return null;
  return rule.slice(0, -1);
}

function refuseNoSpaceDeny(entry: string, command: string, sourcePath: string, policyPath: string) {
  return new Error(
    `deprecated deny entry ${JSON.stringify(entry)} in ${sourcePath} uses the no-space "p*" form, ` +
      `which also matches lookalike commands (e.g. "rm*" also denies "rmdir"); ` +
      `move it into ${policyPath} shell.deny as ${JSON.stringify(`${command} *`)} ` +
      `plus each lookalike you meant, listed explicitly`,
  );
}

function projectDeprecated(
  entries: readonly string[],
  kind: DeprecatedKind,
  sourcePath: string,
  policyPath: string,
): ProjectedRules {
  const field = `deprecated ${kind}`;
  const shell: string[] = [];
  const web: string[] = [];
  const tools: string[] = [];
  const narrowed: string[] = [];
  const builtinIdentical: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const at = `${field}[${i}]`;
    if (typeof entry !== "string") throw new Error(`${at}: must be a string`);
    const inner = bashInner(entry);
    const rule = inner ?? entry;
    const command = noSpaceCommand(rule);
    if (command !== null) {
      const identical = kind === "deny" && inner !== null && LEGACY_D10_DENY_SET.has(entry);
      if (kind === "deny" && !identical) {
        throw refuseNoSpaceDeny(entry, command, sourcePath, policyPath);
      }
      shell.push(...normalizeBashInner(rule, at));
      (identical ? builtinIdentical : narrowed).push(entry);
      continue;
    }
    if (inner !== null) {
      shell.push(...normalizeBashInner(inner, at));
      continue;
    }
    if (WEB_TOOLS.has(entry)) {
      web.push(entry);
      continue;
    }
    if (NON_SHELL_TOOLS.has(entry)) {
      tools.push(entry);
      continue;
    }
    assertShellRule(entry, at);
    shell.push(entry);
  }
  return { shell, web, tools, narrowed, builtinIdentical };
}

/** 0.30.0 D10 lists, normalized. curl/wget are not part of builtin deny (R4). */
export function builtinPolicyDefaults(): PolicyDefaults {
  return {
    shell: {
      allow: sortedUnique(shellRulesFromTools(LEGACY_D10_ALLOWED_TOOLS)),
      deny: sortedUnique(
        shellRulesFromTools(LEGACY_D10_DENIED_TOOLS).filter((rule) => !isCurlOrWget(rule)),
      ),
    },
    network: false,
    mcp: { deny: [], isolate: true },
    skills: { allowScripts: [] },
  };
}

export function parsePolicy(json: unknown): PolicyV1 {
  const root = assertRecord(json, "policy");
  rejectUnknown(root, ["version", "shell", "network", "mcp", "skills", "loomTools"], "policy");
  if (!Object.hasOwn(root, "version")) throw new Error("version: is required");
  if (typeof root.version !== "number" || root.version !== 1) {
    throw new Error("version: must be 1");
  }

  const shell = assertRecord(requireKey(root, "shell", "shell"), "shell");
  rejectUnknown(shell, ["allow", "deny"], "shell");
  const network = requireKey(root, "network", "network");
  if (typeof network !== "boolean") throw new Error("network: must be a boolean");

  const mcp = assertRecord(requireKey(root, "mcp", "mcp"), "mcp");
  rejectUnknown(mcp, ["deny", "isolate"], "mcp");
  let isolate: boolean | undefined;
  if (Object.hasOwn(mcp, "isolate")) {
    if (typeof mcp.isolate !== "boolean") throw new Error("mcp.isolate: must be a boolean");
    isolate = mcp.isolate;
  }

  const skills = assertRecord(requireKey(root, "skills", "skills"), "skills");
  rejectUnknown(skills, ["allow", "allowScripts"], "skills");
  const parsed: PolicyV1 = {
    version: 1,
    shell: {
      deny: shellRules(requireKey(shell, "deny", "shell.deny"), "shell.deny"),
    },
    network,
    mcp: { deny: mcpDenyList(requireKey(mcp, "deny", "mcp.deny")) },
    skills: {
      allowScripts: skillNames(
        requireKey(skills, "allowScripts", "skills.allowScripts"),
        "skills.allowScripts",
      ),
    },
  };
  if (Object.hasOwn(shell, "allow")) {
    parsed.shell.allow = shellRules(shell.allow, "shell.allow");
  }
  if (isolate !== undefined) parsed.mcp.isolate = isolate;
  if (Object.hasOwn(skills, "allow")) {
    parsed.skills.allow = skillNames(skills.allow, "skills.allow");
  }
  if (Object.hasOwn(root, "loomTools")) {
    parsed.loomTools = loomToolsPolicy(root.loomTools);
  }
  return parsed;
}

function errCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

function errDetail(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function lookupFailed(filePath: string, detail: string): Error {
  return new Error(`policy.json lookup failed ${filePath}: ${detail} (fail-closed)`);
}

/**
 * ENOENT on `<loomDir>/policy.json`: absent only when loomDir is a real directory
 * (or loomDir itself does not exist, i.e. not created yet — and then only when its
 * parent resolves to a directory, symlinks followed; PLAN 0.32.0 P4 verify round 3 H2:
 * a dangling / missing / non-directory parent fails closed). Anything else throws.
 */
/**
 * loomDir not created yet: its parent must resolve (stat, following symlinks — a
 * symlinked $HOME is common on Linux) to a directory. A dangling, missing or
 * non-directory parent, or any lookup error, fails closed.
 */
function confirmRealParent(loomDir: string, filePath: string): void {
  const parent = dirname(loomDir);
  let st: ReturnType<typeof statSync>;
  try {
    st = statSync(parent);
  } catch (err) {
    throw lookupFailed(
      filePath,
      `loomDir is missing and its parent is missing or dangling: ${errDetail(err)}`,
    );
  }
  if (!st.isDirectory()) {
    throw lookupFailed(filePath, `loomDir is missing and its parent is not a directory: ${parent}`);
  }
}

function confirmAbsent(loomDir: string, filePath: string, cause: unknown): void {
  let dirStat: ReturnType<typeof statSync>;
  try {
    dirStat = statSync(loomDir);
  } catch (err) {
    if (errCode(err) === "ENOENT") {
      try {
        lstatSync(loomDir);
      } catch (lerr) {
        if (errCode(lerr) === "ENOENT") {
          confirmRealParent(loomDir, filePath);
          return;
        }
        throw lookupFailed(filePath, `loomDir lstat ${errDetail(lerr)}`);
      }
      throw lookupFailed(filePath, `loomDir is a dangling symlink: ${errDetail(err)}`);
    }
    throw lookupFailed(filePath, `loomDir stat ${errDetail(err)}`);
  }
  if (!dirStat.isDirectory()) {
    throw lookupFailed(filePath, `loomDir is not a directory: ${errDetail(cause)}`);
  }
}

/**
 * Reads `<loomDir>/policy.json`. `loomDir` is the already-resolved Loom dir.
 * Absent file → null (only ENOENT on the final path with a real loomDir, or no loomDir
 * under a parent that resolves to a directory).
 * Dangling/looping symlink, EACCES, ENOTDIR, any other lookup error, a non-regular
 * file (dir/FIFO/device), or a file over POLICY_MAX_BYTES → throws (fail-closed).
 * A symlink is followed only when its target is a regular file.
 * The file is opened O_NONBLOCK and checked with fstat, so a special file never blocks.
 */
export function loadPolicy(loomDir: string): PolicyV1 | null {
  const filePath = join(loomDir, "policy.json");
  let link: ReturnType<typeof lstatSync>;
  try {
    link = lstatSync(filePath);
  } catch (err) {
    if (errCode(err) !== "ENOENT") throw lookupFailed(filePath, errDetail(err));
    confirmAbsent(loomDir, filePath, err);
    return null;
  }
  if (link.isSymbolicLink()) {
    try {
      statSync(filePath);
    } catch (err) {
      const code = errCode(err);
      const what = code === "ENOENT" ? "dangling symlink" : "symlink target lookup";
      throw lookupFailed(filePath, `${what}: ${errDetail(err)}`);
    }
  }

  let fd: number;
  try {
    fd = openSync(filePath, fsConstants.O_RDONLY | fsConstants.O_NONBLOCK);
  } catch (err) {
    throw lookupFailed(filePath, errDetail(err));
  }
  let text: string;
  try {
    const st = fstatSync(fd);
    if (!st.isFile()) {
      throw new Error(`invalid policy.json ${filePath}: not a regular file`);
    }
    if (st.size > POLICY_MAX_BYTES) {
      throw new Error(
        `invalid policy.json ${filePath}: size ${st.size} bytes exceeds the ${POLICY_MAX_BYTES}-byte cap`,
      );
    }
    const buf = Buffer.alloc(POLICY_MAX_BYTES + 1);
    let total = 0;
    while (total < buf.length) {
      const n = readSync(fd, buf, total, buf.length - total, null);
      if (n === 0) break;
      total += n;
    }
    if (total > POLICY_MAX_BYTES) {
      throw new Error(
        `invalid policy.json ${filePath}: size over ${POLICY_MAX_BYTES} bytes (grew while reading)`,
      );
    }
    text = buf.toString("utf8", 0, total);
  } catch (err) {
    const detail = errDetail(err);
    if (detail.startsWith("invalid policy.json ")) throw err;
    throw new Error(`invalid policy.json ${filePath}: ${detail}`);
  } finally {
    closeSync(fd);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new Error(`invalid policy.json ${filePath}: JSON parse failed: ${errDetail(err)}`);
  }
  try {
    return parsePolicy(json);
  } catch (err) {
    throw new Error(`invalid policy.json ${filePath}: ${errDetail(err)}`);
  }
}

/**
 * D8 merge for ONE CLI agent. P2 contract (not enforced here):
 * - Callers merge per CLI agent separately (claude / codex / grok); never pool
 *   one agent's deprecated lists into another's.
 * - Pass only owner-provided deprecated lists with raw presence from the bridge
 *   config (`undefined` = absent, `[]` = present); never materialized defaults.
 * - Resolve the Loom dir via the session-store `loomDir()` (including its legacy
 *   fallback) and pass that resolved dir to `loadPolicy`; this module does not
 *   resolve it.
 */
export function mergePolicy(
  builtinDefaults: PolicyDefaults,
  userPolicy: PolicyV1 | null,
  deprecatedLists: DeprecatedToolLists = {},
): PolicyMergeResult {
  const warnings: string[] = [];
  const policyPath = deprecatedLists.policyPath ?? "policy.json";
  const allowPath = deprecatedLists.allowPath ?? "worker.permissions allow list";
  const denyPath = deprecatedLists.denyPath ?? "worker.permissions deny list";
  const deprecatedAllowSpecified = deprecatedLists.allow !== undefined;
  const policyAllow = userPolicy?.shell.allow;

  if (policyAllow !== undefined && deprecatedAllowSpecified) {
    throw new Error(`policy allow specified in both ${policyPath} shell.allow and ${allowPath}`);
  }

  let shellAllow: string[];
  if (policyAllow !== undefined) {
    shellAllow = [...policyAllow];
  } else if (deprecatedAllowSpecified) {
    const projected = projectDeprecated(
      deprecatedLists.allow ?? [],
      "allow",
      allowPath,
      policyPath,
    );
    shellAllow = projected.shell;
    const absent = userPolicy ? `${policyPath} shell.allow` : policyPath;
    const narrowed =
      projected.narrowed.length > 0
        ? `; no-space entries narrowed to "p" and "p *": ${projected.narrowed.join(", ")}`
        : "";
    warnings.push(
      `deprecated allow list ${allowPath} is the shell allow set because ${absent} is absent${narrowed}`,
    );
  } else {
    shellAllow = [...builtinDefaults.shell.allow];
  }

  const network = userPolicy ? userPolicy.network : builtinDefaults.network;
  const shellDeny = new Set<string>(builtinDefaults.shell.deny);
  if (userPolicy) {
    for (const rule of userPolicy.shell.deny) shellDeny.add(rule);
  }

  const webDeny = new Set<string>();
  const toolDeny = new Set<string>();
  if (deprecatedLists.deny !== undefined) {
    const projected = projectDeprecated(deprecatedLists.deny, "deny", denyPath, policyPath);
    for (const rule of projected.shell) shellDeny.add(rule);
    for (const name of projected.web) webDeny.add(name);
    for (const name of projected.tools) toolDeny.add(name);
    const identical =
      projected.builtinIdentical.length > 0
        ? `; no-space entries identical to built-in defaults accepted (normalized to "p" and "p *"; ` +
          `already in the built-in deny): ${projected.builtinIdentical.join(", ")}; remove the list`
        : "";
    warnings.push(
      `deprecated deny list ${denyPath} is unioned into the effective deny${identical}`,
    );
  }
  if (network === false) {
    shellDeny.add("curl *");
    shellDeny.add("wget *");
    webDeny.add("WebFetch");
    webDeny.add("WebSearch");
  }

  const mcpDeny = new Set<string>(builtinDefaults.mcp.deny);
  if (userPolicy) {
    for (const name of userPolicy.mcp.deny) mcpDeny.add(name);
  }
  const isolate = userPolicy?.mcp.isolate ?? builtinDefaults.mcp.isolate;

  const skillsAllow =
    userPolicy !== null
      ? userPolicy.skills.allow === undefined
        ? null
        : [...userPolicy.skills.allow]
      : builtinDefaults.skills.allow === undefined
        ? null
        : [...builtinDefaults.skills.allow];
  const allowScripts =
    userPolicy !== null
      ? [...userPolicy.skills.allowScripts]
      : [...builtinDefaults.skills.allowScripts];

  return {
    effective: {
      version: 1,
      shell: {
        allow: sortedUnique(shellAllow),
        deny: sortedUnique(shellDeny),
      },
      network,
      mcp: { deny: sortedUnique(mcpDeny), isolate },
      skills: {
        allow: skillsAllow === null ? null : sortedUnique(skillsAllow),
        allowScripts: sortedUnique(allowScripts),
      },
      webDeny: sortedUnique(webDeny),
      toolDeny: sortedUnique(toolDeny),
    },
    warnings,
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items = value.map(canonicalize);
    if (items.every((item) => typeof item === "string")) {
      return [...(items as string[])].sort();
    }
    return items;
  }
  if (value && typeof value === "object") {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src).sort()) {
      if (src[key] === undefined) continue;
      out[key] = canonicalize(src[key]);
    }
    return out;
  }
  return value;
}

/** Config-level sha256 hex. Object keys and string arrays are sorted. */
export function policyHash(effective: EffectivePolicy): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(effective)))
    .digest("hex");
}
