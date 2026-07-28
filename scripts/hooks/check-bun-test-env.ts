/**
 * PreToolUse hard guard: bun test must unset LOOM_RELAY_* (traps.bun-test-env).
 *
 * Authority: docs/spikes/RULE-ROUTER-PHASE3.1-SPEC-REV.md Path B ·
 * RULE-ENFORCEABILITY H (Claude Code Bash path only).
 *
 * Scope: tool_name Bash (or empty when matcher already limits) + command contains "bun test".
 * Deny = exit 2 with remediation. Parse errors / non-matching = exit 0 (fail-open).
 * Does NOT rewrite commands. Soft JIT (rule-router-jit) is separate and must not exit 2.
 */
export const RELAY_TOKEN = "LOOM_RELAY_TOKEN";
export const RELAY_URL = "LOOM_RELAY_URL";

export type BunTestEnvInput = {
  tool_name?: string;
  tool_input?: { command?: string };
};

/**
 * True when a shell statement actually runs `bun test` (not merely mentions it).
 * Allows leading `env -u …` prefixes on the same statement.
 */
export function isBunTestCommand(command: string): boolean {
  const parts = command.split(/(?:&&|\|\||;|\n)/);
  for (const part of parts) {
    const t = part.trim();
    if (!t || /^unset\b/.test(t)) continue;
    // env [-u VAR ...] bun test …
    if (/^(?:env(?:\s+(?:-u\s+\S+|\S+=\S+))*\s+)?bun\s+test(?:\s|$)/.test(t)) {
      return true;
    }
  }
  return false;
}

/**
 * COMPLY-aligned predicate (PHASE3.1 PREREG): both relay vars unset-style in the same command.
 * Accepts env -u forms and shell `unset VAR` before bun test.
 */
export function hasRelayEnvUnset(command: string): boolean {
  if (!command.includes(RELAY_TOKEN) || !command.includes(RELAY_URL)) return false;
  if (
    reEnvBothUnset(command) ||
    (reUFlag(command, RELAY_TOKEN) && reUFlag(command, RELAY_URL)) ||
    (reUnset(command, RELAY_TOKEN) && reUnset(command, RELAY_URL))
  ) {
    return true;
  }
  return false;
}

function reEnvBothUnset(cmd: string): boolean {
  return (
    /env\s+-u\s+LOOM_RELAY_TOKEN\s+-u\s+LOOM_RELAY_URL\b/.test(cmd) ||
    /env\s+-u\s+LOOM_RELAY_URL\s+-u\s+LOOM_RELAY_TOKEN\b/.test(cmd) ||
    /env\s+(-u\s+LOOM_RELAY_(TOKEN|URL)\s+)+/.test(cmd)
  );
}

function reUFlag(cmd: string, name: string): boolean {
  return new RegExp(String.raw`-u\s+${name}\b`).test(cmd);
}

function reUnset(cmd: string, name: string): boolean {
  return new RegExp(String.raw`\bunset\s+${name}\b`).test(cmd);
}

export type BunTestEnvDecision =
  | { action: "pass"; reason: "not_bash" | "not_bun_test" | "compliant" }
  | { action: "deny"; reason: "missing_relay_unset"; command: string };

export function decideBunTestEnv(input: BunTestEnvInput): BunTestEnvDecision {
  const tool = input.tool_name ?? "Bash";
  // Matcher is usually Bash-only; still ignore other tools if invoked broadly
  if (tool && tool !== "Bash") {
    return { action: "pass", reason: "not_bash" };
  }
  const command = typeof input.tool_input?.command === "string" ? input.tool_input.command : "";
  if (!command || !isBunTestCommand(command)) {
    return { action: "pass", reason: "not_bun_test" };
  }
  if (hasRelayEnvUnset(command)) {
    return { action: "pass", reason: "compliant" };
  }
  return { action: "deny", reason: "missing_relay_unset", command };
}

export function denyMessage(command: string): string {
  return [
    "Bash 차단: bun test 가 LOOM_RELAY_TOKEN / LOOM_RELAY_URL 을 unset 하지 않음",
    "(tasks/traps.md · traps.bun-test-env · 워커 스위트 기아·위양성 방지).",
    "권장:",
    "  env -u LOOM_RELAY_TOKEN -u LOOM_RELAY_URL bun test",
    `거부된 command: ${command.slice(0, 200)}`,
  ].join("\n");
}

async function main(): Promise<void> {
  let input: BunTestEnvInput = {};
  try {
    const raw = await Bun.stdin.text();
    if (raw.trim()) input = JSON.parse(raw) as BunTestEnvInput;
  } catch {
    process.exit(0);
  }

  try {
    const decision = decideBunTestEnv(input);
    if (decision.action === "deny") {
      console.error(denyMessage(decision.command));
      process.exit(2);
    }
  } catch {
    process.exit(0);
  }
  process.exit(0);
}

if (import.meta.main) {
  void main();
}
