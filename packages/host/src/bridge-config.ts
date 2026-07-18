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
  /**
   * PLAN 0.23.8: worker pane cleanup after confident completion / conv close.
   * `"auto"` (default) = best-effort pane.close on eligible paths.
   * `"keep"` = disable *new* auto-closes (failure-path closes still run).
   * Load sanitizes unknown values to `"auto"`.
   */
  paneCleanup?: "auto" | "keep";
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
    paneCleanup: "auto",
  };
}

/** PLAN 0.23.8: sanitize paneCleanup — only "auto"|"keep"; else default. */
function sanitizePaneCleanup(raw: unknown): "auto" | "keep" {
  return raw === "keep" ? "keep" : "auto";
}

/** R27 L-1: keep only well-shaped argv entries (non-empty array of non-empty strings).
 *  Malformed entries are dropped — same as unregistered (fail-closed), never throws later
 *  in resolveAgentArgv (which would otherwise be swallowed by the bridge pollTimer catch,
 *  leaving a claimed card stuck in "doing" with no signal). */
function sanitizeAgentArgv(
  raw: unknown,
): Partial<Record<DispatchAgentKind, string[]>> {
  if (!raw || typeof raw !== "object") return {};
  const out: Partial<Record<DispatchAgentKind, string[]>> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (
      Array.isArray(v) &&
      v.length > 0 &&
      v.every((x) => typeof x === "string" && x.length > 0)
    ) {
      out[k as DispatchAgentKind] = v;
    }
  }
  return out;
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
        ...sanitizeAgentArgv(raw.agentArgv),
      },
      herdrProtocol:
        typeof raw.herdrProtocol === "number"
          ? raw.herdrProtocol
          : base.herdrProtocol,
      paneCleanup: sanitizePaneCleanup(raw.paneCleanup),
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
  writeFileSync(p, `${JSON.stringify(cfg, null, 2)}\n`, {
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
  if (!argv?.length) return null;
  // Permanent: shell never allowed even if misconfigured
  if (argv[0] === "shell" || argv.some((a) => a === "sh" || a === "bash")) {
    return null;
  }
  return argv;
}
