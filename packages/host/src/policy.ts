/**
 * PLAN 0.31.0 P1. policy.json v1 schema, loader, merge, and policyHash.
 * Pure: no bridge-runtime / headless-worker / argv wiring.
 *
 * D7 schema. D8 allow replaces, deny unions, nothing relaxes a deny.
 * shell.allow is optional: absent = not replaced (builtin, or deprecated allow).
 * R3 skills.allow absent = all, [] = none. R4 curl/wget and web tools are
 * derived from network=false, not stored in the builtin shell deny.
 * R5 / R49-M2 deprecated bridge tool lists. D13 isolate defaults true.
 * UK-1: owner rules are `p *`; builtin no-space Bash forms become `p` + `p *`.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { defaultWorkerPermissions } from "./agent-argv";

/** First non-whitespace character is a flag-shaped dash (agent-argv RULE_FLAG_PREFIX). */
const RULE_FLAG_PREFIX = /^[-\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/;
const SHELL_META = /[;&|`><]|\$\(/;
const SKILL_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MCP_DENY = /^[A-Za-z0-9][A-Za-z0-9._-]*__[A-Za-z0-9][A-Za-z0-9._-]*$/;
const WEB_TOOLS = new Set(["WebFetch", "WebSearch"]);
const NON_SHELL_TOOLS = new Set(["Read", "Edit", "Write", "Glob", "Grep", "WebFetch", "WebSearch"]);

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
 * `allow` / `deny` omitted means that list is absent. An empty array is present.
 * Paths are named in the refusal and the startup warnings.
 */
export type DeprecatedToolLists = {
  allow?: readonly string[];
  deny?: readonly string[];
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
};

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

function projectDeprecated(entries: readonly string[], field: string): ProjectedRules {
  const shell: string[] = [];
  const web: string[] = [];
  const tools: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const at = `${field}[${i}]`;
    if (typeof entry !== "string") throw new Error(`${at}: must be a string`);
    const inner = bashInner(entry);
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
  return { shell, web, tools };
}

/** D10 lists in agent-argv, normalized. curl/wget are not part of builtin deny (R4). */
export function builtinPolicyDefaults(): PolicyDefaults {
  const perms = defaultWorkerPermissions();
  const allowTools = perms.claude?.allowedTools ?? [];
  const denyTools = [...(perms.claude?.disallowedTools ?? []), ...(perms.grok?.deny ?? [])];
  return {
    shell: {
      allow: sortedUnique(shellRulesFromTools(allowTools)),
      deny: sortedUnique(shellRulesFromTools(denyTools).filter((rule) => !isCurlOrWget(rule))),
    },
    network: false,
    mcp: { deny: [], isolate: true },
    skills: { allowScripts: [] },
  };
}

export function parsePolicy(json: unknown): PolicyV1 {
  const root = assertRecord(json, "policy");
  rejectUnknown(root, ["version", "shell", "network", "mcp", "skills"], "policy");
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
  return parsed;
}

/** Reads `<loomDir>/policy.json`. Absent file → null. Invalid file throws. */
export function loadPolicy(loomDir: string): PolicyV1 | null {
  const filePath = join(loomDir, "policy.json");
  if (!existsSync(filePath)) return null;
  let text: string;
  try {
    text = readFileSync(filePath, "utf8");
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`invalid policy.json ${filePath}: ${detail}`);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`invalid policy.json ${filePath}: JSON parse failed: ${detail}`);
  }
  try {
    return parsePolicy(json);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`invalid policy.json ${filePath}: ${detail}`);
  }
}

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
    shellAllow = projectDeprecated(deprecatedLists.allow ?? [], "deprecated allow").shell;
    const absent = userPolicy ? `${policyPath} shell.allow` : policyPath;
    warnings.push(
      `deprecated allow list ${allowPath} is the shell allow set because ${absent} is absent`,
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
  if (deprecatedLists.deny && deprecatedLists.deny.length > 0) {
    const projected = projectDeprecated(deprecatedLists.deny, "deprecated deny");
    for (const rule of projected.shell) shellDeny.add(rule);
    for (const name of projected.web) webDeny.add(name);
    for (const name of projected.tools) toolDeny.add(name);
    warnings.push(`deprecated deny list ${denyPath} is unioned into the effective deny`);
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
