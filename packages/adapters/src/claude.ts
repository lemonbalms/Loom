import type { AgentAdapter, SpawnSpec } from "./types";
import { resolveCommand } from "./which";
import { loomSystemHint } from "./hints";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const claudeAdapter: AgentAdapter = {
  id: "claude",
  label: "Claude Code",
  capabilities: {
    mcp: "claude-json",
    mcpCliFlag: true,
    receive: "both",
    tui: true,
    userConfigWrite: "never",
  },

  async detect() {
    return Boolean(await resolveCommand(["claude"]));
  },

  async spawnSpec(opts): Promise<SpawnSpec> {
    const cmd = (await resolveCommand(["claude"])) ?? "claude";
    const args: string[] = [...(opts.extraArgs ?? [])];
    const env: Record<string, string | undefined> = {
      ...process.env,
      ...opts.env,
      LOOM_ACTIVE: "1",
      LOOM_AGENT: "claude",
    };
    if (opts.mcpConfigPath) {
      env.LOOM_MCP_CONFIG = opts.mcpConfigPath;
      args.push("--mcp-config", opts.mcpConfigPath);
    }
    return {
      command: cmd,
      args,
      env,
      cwd: opts.cwd,
    };
  },

  async ensureMcpConfig(opts) {
    // Claude uses --mcp-config pointing at global ~/.loom/mcp.json from CLI.
    // Project file is optional documentation only when writeUserConfig not needed.
    const dir = join(opts.cwd, ".loom");
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "claude.mcp.json");
    const config = {
      mcpServers: {
        loom: {
          command: "bun",
          args: ["run", opts.mcpStdioPath],
          env: opts.sessionEnv ?? {},
        },
      },
    };
    writeFileSync(path, JSON.stringify(config, null, 2) + "\n", "utf8");
    // Return null so CLI prefers globalMcp for --mcp-config (single source of truth)
    return null;
  },

  systemHint() {
    return loomSystemHint("Claude Code");
  },
};
