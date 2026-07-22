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
   * PLAN 0.23.8 / 0.28.0: worker pane cleanup policy.
   * `"auto"` (default) = best-effort pane.close on **explicit conv close** only.
   * `"keep"` = disable that conv auto-close.
   * Card worker paths never auto-close (PANE-DEATH U3) — this flag does not
   * control card panes. Load sanitizes unknown values to `"auto"`.
   */
  paneCleanup?: "auto" | "keep";
  /**
   * PLAN 0.23.9: worker pane placement policy.
   * `"pool"` (default) = bridge-local worker-pool tab (tab.create + tab_id/split).
   * `"legacy"` = unhinted agent.start (pre-0.23.9 global-focus split).
   * Load sanitizes unknown values to `"pool"`.
   */
  panePlacement?: "pool" | "legacy";
  /**
   * PLAN 0.23.9: optional herdr workspace_id for pool tab.create.
   * Empty/missing → omit workspace_id (herdr default).
   */
  paneWorkspaceId?: string;
  /**
   * PLAN 0.26.0: claude hooks auxiliary sensor (opt-in, default off).
   * When true, bridge injects `--settings` hooks on claude spawn and listens
   * on attempt-scoped loomDir sockets for completion hints only.
   * Load sanitizes non-true values to false (fail-closed opt-in).
   */
  hookSensor?: boolean;
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
    panePlacement: "pool",
    hookSensor: false,
  };
}

/** PLAN 0.23.8: sanitize paneCleanup — only "auto"|"keep"; else default. */
function sanitizePaneCleanup(raw: unknown): "auto" | "keep" {
  return raw === "keep" ? "keep" : "auto";
}

/** PLAN 0.23.9: sanitize panePlacement — only "pool"|"legacy"; else default. */
function sanitizePanePlacement(raw: unknown): "pool" | "legacy" {
  return raw === "legacy" ? "legacy" : "pool";
}

/** PLAN 0.23.9: non-empty string only; else undefined (omit on wire). */
function sanitizePaneWorkspaceId(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim();
  return t.length > 0 ? t : undefined;
}

/** PLAN 0.26.0: hookSensor opt-in — only explicit `true` enables; else false. */
function sanitizeHookSensor(raw: unknown): boolean {
  return raw === true;
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
      panePlacement: sanitizePanePlacement(raw.panePlacement),
      paneWorkspaceId: sanitizePaneWorkspaceId(raw.paneWorkspaceId),
      hookSensor: sanitizeHookSensor(raw.hookSensor),
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
