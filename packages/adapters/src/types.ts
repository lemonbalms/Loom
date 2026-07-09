import type { AgentKind } from "@loom/protocol";

export type SpawnSpec = {
  command: string;
  args: string[];
  env: Record<string, string | undefined>;
  cwd: string;
};

/** Declared integration surface for capability matrix / docs. */
export type AdapterCapabilities = {
  /** Native MCP config file the adapter can write/point at */
  mcp: "claude-json" | "codex-toml" | "grok-toml" | "env-only" | "none";
  /** Can pass config via CLI flag */
  mcpCliFlag: boolean;
  /** Recommended receive path for handoffs */
  receive: "mcp-poll" | "cli-inbox" | "both";
  /** Spawn is interactive TUI */
  tui: boolean;
  /**
   * Whether adapter may write user-global MCP config (~/.codex, ~/.grok).
   * Default for toml adapters: opt-in only (R3 M-3).
   */
  userConfigWrite?: "never" | "opt-in" | "always";
};

export interface AgentAdapter {
  id: AgentKind | string;
  label: string;
  capabilities: AdapterCapabilities;
  /** True if CLI binary is available on PATH. */
  detect(): Promise<boolean>;
  /** Build spawn specification for the agent process. */
  spawnSpec(opts: {
    cwd: string;
    env?: Record<string, string | undefined>;
    mcpConfigPath?: string;
    extraArgs?: string[];
  }): Promise<SpawnSpec>;
  /**
   * Write agent-specific MCP config; returns primary path written.
   * Project config always; user-global only when writeUserConfig=true.
   */
  ensureMcpConfig?(opts: {
    cwd: string;
    mcpStdioPath: string;
    sessionEnv?: Record<string, string>;
    /** Opt-in: merge into ~/.codex or ~/.grok config.toml with FABLE_SESSION */
    writeUserConfig?: boolean;
  }): Promise<string | null>;
  /** System hint text about Loom tools. */
  systemHint(): string;
}
