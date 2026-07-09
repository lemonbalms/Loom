import type { AgentAdapter, SpawnSpec } from "./types";
import { loomSystemHint } from "./hints";

/** Fallback: plain shell for demos without an AI CLI. */
export const shellAdapter: AgentAdapter = {
  id: "shell",
  label: "Shell",
  capabilities: {
    mcp: "none",
    mcpCliFlag: false,
    receive: "cli-inbox",
    tui: false,
    userConfigWrite: "never",
  },

  async detect() {
    return true;
  },

  async spawnSpec(opts): Promise<SpawnSpec> {
    const shell = process.env.SHELL || "/bin/zsh";
    return {
      command: shell,
      args: [],
      env: {
        ...process.env,
        ...opts.env,
        LOOM_ACTIVE: "1",
        LOOM_AGENT: "shell",
        LOOM_MCP_CONFIG: opts.mcpConfigPath,
        LOOM_SHELL: "1",
      },
      cwd: opts.cwd,
    };
  },

  systemHint() {
    return [
      loomSystemHint("Shell"),
      "",
      "Shell has no MCP: use CLI — loom inbox, loom handoff, loom peers.",
    ].join("\n");
  },
};
