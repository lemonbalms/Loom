import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

export function resolveMcpStdio(): string {
  const here = fileURLToPath(new URL(".", import.meta.url));
  return join(here, "stdio.ts");
}

/** Write global Claude-compatible MCP config that launches loom-mcp over stdio. */
export function writeMcpConfig(opts?: {
  dir?: string;
  sessionEnv?: Record<string, string>;
}): string {
  const dir = opts?.dir ?? join(homedir(), ".loom");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "mcp.json");
  const stdioEntry = resolveMcpStdio();
  const config = {
    mcpServers: {
      loom: {
        command: "bun",
        args: ["run", stdioEntry],
        env: opts?.sessionEnv ?? {},
      },
    },
  };
  writeFileSync(path, JSON.stringify(config, null, 2) + "\n", "utf8");
  return path;
}

/** Write a short agent hint file agents/shells can cat. */
export function writeAgentHintFile(opts?: {
  dir?: string;
  agentId?: string;
  hint?: string;
}): string {
  const dir = opts?.dir ?? join(homedir(), ".loom");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "AGENT_HINT.txt");
  const body =
    opts?.hint ??
    [
      "Loom multiplayer room is active.",
      "MCP tools: list_peers, handoff, check_handoffs, claim_handoff, room_chat",
      "CLI: loom peers | handoff | inbox | inbox accept <id>",
      opts?.agentId ? `Agent: ${opts.agentId}` : "",
    ]
      .filter(Boolean)
      .join("\n") + "\n";
  writeFileSync(path, body, "utf8");
  return path;
}
