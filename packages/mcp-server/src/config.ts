import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loomDir } from "@loom/host";

export function resolveMcpStdio(): string {
  const here = fileURLToPath(new URL(".", import.meta.url));
  return join(here, "stdio.ts");
}

/** Write global Claude-compatible MCP config that launches loom-mcp over stdio. */
export function writeMcpConfig(opts?: {
  dir?: string;
  sessionEnv?: Record<string, string>;
}): string {
  // M-14: default dir via loomDir() (respects live-PID migration gate)
  const dir = opts?.dir ?? loomDir();
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
