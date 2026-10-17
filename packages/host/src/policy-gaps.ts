/**
 * PLAN 0.37.0 ② — policy gaps, the single source (D1). Pure: no IO.
 *
 * A gap = the operator configured an item (in the agent's EFFECTIVE policy, built-in defaults and
 * deprecated bridge lists included) and that agent's honesty level (`POLICY_ENFORCEMENT`) is not
 * `enforced` / `hidden` / `not-applicable`. The bridge start warning, strict refusal, doctor
 * Policy section and the worker policy notice all render from the same `Gap[]` and carry
 * `gapLabel(g)` verbatim (D1 · R3 · R4).
 */
import type { AgentKind } from "./agent-argv";
import type { EffectivePolicy } from "./policy";
import { POLICY_ENFORCEMENT } from "./policy-compile";

export type PolicyGapItem = "shell.deny" | "network" | "mcp.deny" | "mcp.isolate";

export type PolicyGapLevel =
  | "not-enforced"
  | "best-effort"
  | "advisory"
  | "text"
  | "not-isolatable";

export type Gap = {
  agent: AgentKind;
  item: PolicyGapItem;
  level: PolicyGapLevel;
  /** List items: `values.length` · boolean items: 1. */
  count: number;
  /** The real list strings (shell.deny / mcp.deny — R1 · C2); `[]` for boolean items. */
  values: readonly string[];
};

export const POLICY_GAP_ITEMS: readonly PolicyGapItem[] = [
  "shell.deny",
  "network",
  "mcp.deny",
  "mcp.isolate",
];

const AGENT_ORDER: readonly AgentKind[] = ["claude", "codex", "grok"];

const TABLE_KEY: Readonly<Record<PolicyGapItem, keyof typeof POLICY_ENFORCEMENT>> = {
  "shell.deny": "shellDeny",
  network: "network",
  "mcp.deny": "mcpDeny",
  "mcp.isolate": "mcpIsolate",
};

type EnforcementLevel = (typeof POLICY_ENFORCEMENT)[keyof typeof POLICY_ENFORCEMENT][AgentKind];

const NOT_A_GAP: ReadonlySet<EnforcementLevel> = new Set<EnforcementLevel>([
  "enforced",
  "hidden",
  "not-applicable",
]);

/** R3: one fixed consequence per level (codex `not-enforced` = the D5 example verbatim). */
export const GAP_CONSEQUENCE: Readonly<Record<PolicyGapLevel, string>> = {
  "not-enforced": "nothing blocks it",
  "best-effort": "the CLI blocks only the forms it recognizes",
  advisory: "the CLI blocks only some forms",
  text: "the CLI gets it as a text rule only",
  "not-isolatable": "the CLI still loads its own MCP servers",
};

/** R55-L3: true with the built-in default policy (no policy.json) too. */
export const POLICY_NOTICE_LEAD =
  "The operator's Loom policy sets these limits, and this CLI does not fully enforce them for you. Follow them yourself.";

const STRICT_REFUSAL_TAIL =
  "Disable the agent (worker.maxConcurrent.<agent>: 0; for codex/grok, removing agentArgv.<agent> also works), fix network/mcp items in policy.json (shell.deny gaps cannot be removed there), or set worker.strictEnforcement to false.";

/** Agents whose `maxConcurrent` value is not 0, in claude → codex → grok order. */
export function enabledAgentsOf(maxConcurrent: Readonly<Record<AgentKind, number>>): AgentKind[] {
  return AGENT_ORDER.filter((agent) => maxConcurrent[agent] !== 0);
}

function configuredValues(
  item: PolicyGapItem,
  p: EffectivePolicy,
): { configured: boolean; values: string[] } {
  switch (item) {
    case "shell.deny":
      return { configured: p.shell.deny.length > 0, values: [...p.shell.deny] };
    case "network":
      return { configured: p.network === false, values: [] };
    case "mcp.deny":
      return { configured: p.mcp.deny.length > 0, values: [...p.mcp.deny] };
    case "mcp.isolate":
      return { configured: p.mcp.isolate === true, values: [] };
  }
}

/**
 * Gaps in fixed order: agent (claude → codex → grok, whatever `enabledAgents` order) ×
 * `POLICY_GAP_ITEMS`. Only enabled agents. Input untouched; `values` are copies.
 */
export function policyGaps(
  effective: Readonly<Record<AgentKind, EffectivePolicy>>,
  enabledAgents: readonly AgentKind[],
): Gap[] {
  const gaps: Gap[] = [];
  for (const agent of AGENT_ORDER) {
    if (!enabledAgents.includes(agent)) continue;
    const policy = effective[agent];
    for (const item of POLICY_GAP_ITEMS) {
      const level = POLICY_ENFORCEMENT[TABLE_KEY[item]][agent];
      if (NOT_A_GAP.has(level)) continue;
      const { configured, values } = configuredValues(item, policy);
      if (!configured) continue;
      const isList = item === "shell.deny" || item === "mcp.deny";
      gaps.push({
        agent,
        item,
        level: level as PolicyGapLevel,
        count: isList ? values.length : 1,
        values,
      });
    }
  }
  return gaps;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function subject(g: Gap): string {
  switch (g.item) {
    case "shell.deny":
      return `shell.deny (${plural(g.count, "rule", "rules")})`;
    case "mcp.deny":
      return `mcp.deny (${plural(g.count, "name", "names")})`;
    case "network":
      return "network (false)";
    case "mcp.isolate":
      return "mcp.isolate (true)";
  }
}

/** `${subject} is ${level} for ${agent}` — carried verbatim by every renderer (D1). */
export function gapLabel(g: Gap): string {
  return `${subject(g)} is ${g.level} for ${g.agent}`;
}

/** Doctor line (D6 · ③) = the bridge warning without `warning: `. */
export function renderGapLine(g: Gap): string {
  return `policy ${gapLabel(g)} — the worker is told in its prompt; ${GAP_CONSEQUENCE[g.level]}`;
}

/** Bridge start warning (D5). */
export function renderGapWarning(g: Gap): string {
  return `warning: ${renderGapLine(g)}`;
}

/** Strict refusal (D4(b) · R13 · R55-M1). Throws TypeError on `[]`. */
export function renderStrictRefusal(gaps: readonly Gap[]): string {
  if (gaps.length === 0) {
    throw new TypeError("renderStrictRefusal: gaps must not be empty");
  }
  return (
    `worker.strictEnforcement: refusing to start — ${gaps.length} policy gap(s) for enabled agents:\n` +
    gaps.map(renderGapWarning).join("\n") +
    `\n${STRICT_REFUSAL_TAIL}`
  );
}

function quoted(values: readonly string[]): string {
  return values.map((v) => `\`${v}\``).join(", ");
}

function instruction(g: Gap): string {
  switch (g.item) {
    case "shell.deny":
      return `Do not run commands that match: ${quoted(g.values)}.`;
    case "network":
      return "Do not access the network.";
    case "mcp.deny":
      return `Do not call these MCP tools: ${quoted(g.values)}.`;
    case "mcp.isolate":
      return "Do not use MCP tools.";
  }
}

/**
 * Worker policy notice section (D3), one agent only. `[]` → `""`; mixed agents → TypeError.
 * No trailing newline.
 */
export function renderPolicyNotice(gaps: readonly Gap[]): string {
  if (gaps.length === 0) return "";
  const agent = gaps[0]?.agent;
  if (gaps.some((g) => g.agent !== agent)) {
    throw new TypeError("renderPolicyNotice: gaps must all belong to one agent");
  }
  const lines = gaps.map(
    (g) => `- policy ${gapLabel(g)} — ${GAP_CONSEQUENCE[g.level]}. ${instruction(g)}`,
  );
  return `## Loom policy notice\n${POLICY_NOTICE_LEAD}\n${lines.join("\n")}`;
}
