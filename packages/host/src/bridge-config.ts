/**
 * Bridge-local config under loomDir()/bridge/ (M-14 — never hardcode ~/.loom).
 * M-1: authorizedDispatchers allowlist (default deny when empty/missing).
 */
import { existsSync, mkdirSync, chmodSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loomDir, ensureFableDir } from "./session-store";
import { DEFAULT_HERDR_SOCKET } from "./herdr-client";
import type { DispatchAgentKind } from "@loom/protocol";

export type BridgeConfig = {
  /** M-1: tower peer ids allowed to dispatch. Empty ⇒ default deny. */
  authorizedDispatchers: string[];
  herdrSocketPath: string;
  /** Local argv map — wire never carries argv. shell permanently excluded. */
  agentArgv: Partial<Record<DispatchAgentKind, string[]>>;
  /** Expected herdr protocol (default 16). */
  herdrProtocol?: number;
};

const DEFAULT_AGENT_ARGV: BridgeConfig["agentArgv"] = {
  claude: ["claude"],
};

export function bridgeConfigDir(): string {
  return join(loomDir(), "bridge");
}

export function bridgeConfigPath(profile: string): string {
  const safe = profile.replace(/[^a-zA-Z0-9._-]/g, "_") || "default";
  return join(bridgeConfigDir(), `${safe}.json`);
}

export function defaultBridgeConfig(): BridgeConfig {
  return {
    authorizedDispatchers: [],
    herdrSocketPath:
      process.env.LOOM_HERDR_SOCKET?.trim() || DEFAULT_HERDR_SOCKET,
    agentArgv: { ...DEFAULT_AGENT_ARGV },
    herdrProtocol: 16,
  };
}

export function loadBridgeConfig(profile: string): BridgeConfig {
  const p = bridgeConfigPath(profile);
  const base = defaultBridgeConfig();
  if (!existsSync(p)) return base;
  try {
    const raw = JSON.parse(readFileSync(p, "utf8")) as Partial<BridgeConfig>;
    const dispatchers = Array.isArray(raw.authorizedDispatchers)
      ? raw.authorizedDispatchers.map(String).filter(Boolean)
      : [];
    return {
      authorizedDispatchers: dispatchers,
      herdrSocketPath:
        typeof raw.herdrSocketPath === "string" && raw.herdrSocketPath
          ? raw.herdrSocketPath
          : base.herdrSocketPath,
      agentArgv: {
        ...DEFAULT_AGENT_ARGV,
        ...(raw.agentArgv && typeof raw.agentArgv === "object"
          ? raw.agentArgv
          : {}),
      },
      herdrProtocol:
        typeof raw.herdrProtocol === "number"
          ? raw.herdrProtocol
          : base.herdrProtocol,
    };
  } catch {
    return base;
  }
}

export function saveBridgeConfig(profile: string, cfg: BridgeConfig): void {
  ensureFableDir();
  const dir = bridgeConfigDir();
  mkdirSync(dir, { recursive: true });
  const p = bridgeConfigPath(profile);
  writeFileSync(p, JSON.stringify(cfg, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
  try {
    chmodSync(p, 0o600);
  } catch {
    /* */
  }
}

/** M-1: authorize dispatch fromPeerId against allowlist. Missing config ⇒ deny. */
export function isAuthorizedDispatcher(
  cfg: BridgeConfig,
  fromPeerId: string | undefined,
): boolean {
  if (!fromPeerId) return false;
  if (!cfg.authorizedDispatchers.length) return false;
  return cfg.authorizedDispatchers.includes(fromPeerId);
}

export function resolveAgentArgv(
  cfg: BridgeConfig,
  kind: DispatchAgentKind,
): string[] | null {
  const argv = cfg.agentArgv[kind];
  if (!argv || !argv.length) return null;
  // Permanent: shell never allowed even if misconfigured
  if (argv[0] === "shell" || argv.some((a) => a === "sh" || a === "bash")) {
    if (kind !== "claude") return null;
  }
  return argv;
}
