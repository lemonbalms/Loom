import type { AgentAdapter } from "./types";
import { claudeAdapter } from "./claude";
import { codexAdapter } from "./codex";
import { grokAdapter } from "./grok";
import { shellAdapter } from "./shell";

export * from "./types";
export * from "./hints";
export * from "./user-mcp-config";
export { claudeAdapter } from "./claude";
export { codexAdapter } from "./codex";
export { grokAdapter } from "./grok";
export { shellAdapter } from "./shell";

const registry: Record<string, AgentAdapter> = {
  claude: claudeAdapter,
  codex: codexAdapter,
  grok: grokAdapter,
  shell: shellAdapter,
};

export function getAdapter(id: string): AgentAdapter | undefined {
  return registry[id];
}

export function listAdapters(): AgentAdapter[] {
  return Object.values(registry);
}

export async function detectAvailableAgents(): Promise<AgentAdapter[]> {
  const out: AgentAdapter[] = [];
  for (const a of listAdapters()) {
    if (a.id === "shell") continue;
    if (await a.detect()) out.push(a);
  }
  return out;
}

/** Prefer claude → codex → grok → shell. */
export async function pickDefaultAdapter(): Promise<AgentAdapter> {
  for (const id of ["claude", "codex", "grok"] as const) {
    const a = getAdapter(id)!;
    if (await a.detect()) return a;
  }
  return shellAdapter;
}

export function capabilityMatrix(): {
  id: string;
  label: string;
  capabilities: AgentAdapter["capabilities"];
}[] {
  return listAdapters().map((a) => ({
    id: a.id,
    label: a.label,
    capabilities: a.capabilities,
  }));
}
