/**
 * PLAN 0.31.0 P2. Per-CLI compiler for the effective policy (D9) and the
 * config-level policy resolution that feeds it (D8 / R5 / R49-M2).
 *
 * claude → `--settings '<inline JSON>'` (permissions.allow / deny) + `--strict-mcp-config`
 *          when mcp.isolate (D13 / R49-M1). Replaces --allowedTools / --disallowedTools.
 * codex  → `-c sandbox_workspace_write.network_access=<network>`. No rules file;
 *          shell deny is not enforced on codex (D10 honesty table below).
 * grok   → one `--allow` / `--deny` per rule, `--deny MCPTool(x)` per mcp.deny,
 *          `--disable-web-search` when web tools are denied.
 *
 * R49-H1: every deny prefix p compiles to both `Bash(p)` and `Bash(p *)`.
 * UK-1 §G: a no-space `p*` form is never emitted.
 * R8: Read/Edit/Write/Glob/Grep is the fixed base allow, not a policy surface.
 */
import { createHash } from "node:crypto";
import type { AgentKind, WorkerPermissions } from "./agent-argv";
import {
  builtinPolicyDefaults,
  type EffectivePolicy,
  mergePolicy,
  type PolicyV1,
  policyHash,
} from "./policy";

/** R8 fixed base allow for claude and grok. */
export const BASE_ALLOW_TOOLS: readonly string[] = ["Read", "Edit", "Write", "Glob", "Grep"];

const WORKER_AGENTS: readonly AgentKind[] = ["claude", "codex", "grok"];

type Enforcement =
  | "enforced"
  | "not-enforced"
  | "best-effort"
  | "advisory"
  | "hidden"
  | "text"
  | "not-applicable"
  | "not-isolatable";

/**
 * D10 honesty table: what each CLI actually enforces. Shell deny on codex is
 * not enforced (kernel sandbox + network block are the real limits).
 */
export const POLICY_ENFORCEMENT: Readonly<
  Record<
    "shellDeny" | "network" | "mcpDeny" | "mcpIsolate",
    Readonly<Record<AgentKind, Enforcement>>
  >
> = {
  shellDeny: { claude: "enforced", codex: "not-enforced", grok: "best-effort" },
  network: { claude: "advisory", codex: "enforced", grok: "advisory" },
  mcpDeny: { claude: "hidden", codex: "not-applicable", grok: "text" },
  mcpIsolate: { claude: "enforced", codex: "not-isolatable", grok: "not-isolatable" },
};

/** Config-level policy: one effective policy per CLI agent plus their combined hash. */
export type WorkerPolicy = {
  effective: Record<AgentKind, EffectivePolicy>;
  /** sha256 hex over each agent's policyHash. Config level (D11 / R49-M3). */
  hash: string;
  /** Startup warnings (deprecated bridge-config lists). */
  warnings: string[];
};

export type ClaudeSettings = { permissions: { allow: string[]; deny: string[] } };

/** Effective shell rule (`p *` or a normalized bare `p`) → its command prefix. */
function rulePrefix(rule: string): string {
  return rule.endsWith(" *") ? rule.slice(0, -2) : rule;
}

/** Allow keeps the rule as written: `p *` → `Bash(p *)`, normalized bare `p` → `Bash(p)`. */
function bashAllow(rules: readonly string[]): string[] {
  return rules.map((rule) => `Bash(${rule})`);
}

/** R49-H1: each deny prefix as `Bash(p)` then `Bash(p *)`, first occurrence kept. */
function bashDeny(rules: readonly string[]): string[] {
  const out = new Set<string>();
  for (const rule of rules) {
    const prefix = rulePrefix(rule);
    out.add(`Bash(${prefix})`);
    out.add(`Bash(${prefix} *)`);
  }
  return [...out];
}

function unique(values: Iterable<string>): string[] {
  return [...new Set(values)];
}

export function compileClaudeSettings(policy: EffectivePolicy): ClaudeSettings {
  return {
    permissions: {
      allow: unique([...BASE_ALLOW_TOOLS, ...bashAllow(policy.shell.allow)]),
      deny: unique([
        ...bashDeny(policy.shell.deny),
        ...policy.webDeny,
        ...policy.toolDeny,
        ...policy.mcp.deny.map((name) => `mcp__${name}`),
      ]),
    },
  };
}

/** `--settings <json>` takes one value, so nothing after it is swallowed. */
export function compileClaudePolicyArgv(policy: EffectivePolicy): string[] {
  const argv = ["--settings", JSON.stringify(compileClaudeSettings(policy))];
  if (policy.mcp.isolate) argv.push("--strict-mcp-config");
  return argv;
}

/** codex: network only. Shell deny has no codex flag (D9, D10 "not-enforced"). */
export function compileCodexPolicyArgv(policy: EffectivePolicy): string[] {
  return ["-c", `sandbox_workspace_write.network_access=${policy.network ? "true" : "false"}`];
}

/**
 * grok: one value per flag. Web denies have no grok rule form; any web deny
 * (network=false or a deprecated WebFetch/WebSearch deny) disables web search
 * and fetch together, so no deny is dropped.
 */
export function compileGrokPolicyArgv(policy: EffectivePolicy): string[] {
  const argv: string[] = [];
  for (const rule of unique([...BASE_ALLOW_TOOLS, ...bashAllow(policy.shell.allow)])) {
    argv.push("--allow", rule);
  }
  const deny = unique([
    ...bashDeny(policy.shell.deny),
    ...policy.toolDeny,
    ...policy.mcp.deny.map((name) => `MCPTool(${name})`),
  ]);
  for (const rule of deny) argv.push("--deny", rule);
  if (policy.webDeny.length > 0) argv.push("--disable-web-search");
  return argv;
}

/**
 * D8 per agent (policy.ts mergePolicy P2 contract): each agent merges only its
 * own deprecated lists, passed with raw presence (`undefined` = absent).
 * Throws on a deprecated allow next to policy.json shell.allow (R49-M2) and on
 * a deprecated no-space deny.
 */
export function resolveWorkerPolicy(
  permissions: WorkerPermissions,
  userPolicy: PolicyV1 | null,
  opts: { policyPath?: string } = {},
): WorkerPolicy {
  const defaults = builtinPolicyDefaults();
  const policyPath = opts.policyPath ?? "policy.json";
  const claude = mergePolicy(defaults, userPolicy, {
    allow: permissions.claude?.allowedTools,
    deny: permissions.claude?.disallowedTools,
    allowPath: "worker.permissions.claude.allowedTools",
    denyPath: "worker.permissions.claude.disallowedTools",
    policyPath,
  });
  const codex = mergePolicy(defaults, userPolicy, { policyPath });
  const grok = mergePolicy(defaults, userPolicy, {
    allow: permissions.grok?.allow,
    deny: permissions.grok?.deny,
    allowPath: "worker.permissions.grok.allow",
    denyPath: "worker.permissions.grok.deny",
    policyPath,
  });
  const effective: Record<AgentKind, EffectivePolicy> = {
    claude: claude.effective,
    codex: codex.effective,
    grok: grok.effective,
  };
  const hash = createHash("sha256")
    .update(WORKER_AGENTS.map((agent) => `${agent}\0${policyHash(effective[agent])}`).join("\0"))
    .digest("hex");
  return {
    effective,
    hash,
    warnings: [...claude.warnings, ...codex.warnings, ...grok.warnings],
  };
}
