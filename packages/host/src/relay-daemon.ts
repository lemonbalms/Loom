import { spawn, type Subprocess } from "bun";
import {
  type RelayEndpoint,
  resolveRelayEndpoint,
  defaultLocalEndpoint,
} from "@loom/protocol";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isPidAlive, loomDir } from "./session-store";

/** M-14: use resolveStateHomeDir via loomDir() — never hardcode ~/.loom */
function pidPath(): string {
  return join(loomDir(), "relay.pid");
}

function stateDir(): string {
  return loomDir();
}

export async function isRelayUp(endpoint: RelayEndpoint): Promise<boolean> {
  try {
    const headers: Record<string, string> = {};
    if (endpoint.token) {
      headers.Authorization = `Bearer ${endpoint.token}`;
    }
    const res = await fetch(`${endpoint.httpOrigin}/health`, {
      signal: AbortSignal.timeout(1500),
      headers,
    });
    return res.ok;
  } catch {
    return false;
  }
}

export type EnsureRelayResult = {
  url: string;
  endpoint: RelayEndpoint;
  started: boolean;
  remote: boolean;
};

/**
 * Ensure a relay is reachable.
 * - Local (127.0.0.1): auto-start daemon if down
 * - Remote: only check health; never spawn
 */
export async function ensureRelay(opts?: {
  relayFlag?: string;
  tokenFlag?: string;
}): Promise<EnsureRelayResult> {
  const endpoint = resolveRelayEndpoint({
    relayFlag: opts?.relayFlag,
    tokenFlag: opts?.tokenFlag,
  });

  if (!endpoint.isLocal) {
    if (!(await isRelayUp(endpoint))) {
      throw new Error(
        `Remote relay not reachable at ${endpoint.httpOrigin}/health\n` +
          `Start a host with:\n` +
          `  LOOM_RELAY_HOST=0.0.0.0 LOOM_RELAY_TOKEN=… bun run dev:relay\n` +
          `Clients:\n` +
          `  LOOM_RELAY_URL=${endpoint.wsUrl.split("?")[0]} LOOM_RELAY_TOKEN=… loom room join …`,
      );
    }
    return {
      url: endpoint.wsUrl, // never includes token (H-6)
      endpoint,
      started: false,
      remote: true,
    };
  }

  // Local
  if (await isRelayUp(endpoint)) {
    return {
      url: endpoint.wsUrl,
      endpoint,
      started: false,
      remote: false,
    };
  }

  mkdirSync(stateDir(), { recursive: true });
  const relayCli = resolveRelayCli();
  // M-21: auto-daemon must pass LOOM_RELAY_STATE_DIR under loomDir() (M-14 gate)
  const relayStateDir =
    process.env.LOOM_RELAY_STATE_DIR || join(loomDir(), "relay-state");
  const proc = spawn({
    cmd: ["bun", "run", relayCli],
    env: {
      ...process.env,
      LOOM_RELAY_HOST: endpoint.host,
      LOOM_RELAY_PORT: String(endpoint.port),
      ...(endpoint.token ? { LOOM_RELAY_TOKEN: endpoint.token } : {}),
      LOOM_RELAY_STATE_DIR: relayStateDir,
    },
    stdout: "ignore",
    stderr: "ignore",
    stdin: "ignore",
  });
  proc.unref();
  writeFileSync(pidPath(), String(proc.pid), "utf8");

  for (let i = 0; i < 40; i++) {
    await Bun.sleep(100);
    if (await isRelayUp(endpoint)) {
      return {
        url: endpoint.wsUrl,
        endpoint,
        started: true,
        remote: false,
      };
    }
  }

  throw new Error(
    `Failed to start local relay on ${endpoint.host}:${endpoint.port}. Try: bun run dev:relay`,
  );
}

/** @deprecated use ensureRelay */
export async function ensureLocalRelay(opts?: {
  host?: string;
  port?: number;
}): Promise<{ url: string; started: boolean }> {
  const ep =
    opts?.host || opts?.port
      ? defaultLocalEndpoint()
      : resolveRelayEndpoint();
  // override host/port if provided
  const flag =
    opts?.host || opts?.port
      ? `ws://${opts.host ?? ep.host}:${opts.port ?? ep.port}`
      : undefined;
  const r = await ensureRelay({ relayFlag: flag });
  return { url: r.url, started: r.started };
}

function resolveRelayCli(): string {
  const here = fileURLToPath(new URL(".", import.meta.url));
  const candidate = join(here, "../../relay/src/cli.ts");
  if (existsSync(candidate)) return candidate;
  const fromCwd = join(process.cwd(), "packages/relay/src/cli.ts");
  if (existsSync(fromCwd)) return fromCwd;
  throw new Error("Cannot find packages/relay/src/cli.ts");
}

export function readRelayPid(): number | null {
  try {
    const raw = readFileSync(pidPath(), "utf8").trim();
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function clearRelayPidFile(): void {
  try {
    if (existsSync(pidPath())) unlinkSync(pidPath());
  } catch {
    /* */
  }
}

export type StopRelayResult = {
  stopped: boolean;
  pid: number | null;
  message: string;
};

/**
 * PLAN 0.24.0 D5: stop local relay daemon.
 * pid → kill → confirm dead → clear ~/.loom/relay.pid
 */
export async function stopRelay(): Promise<StopRelayResult> {
  const pid = readRelayPid();
  if (pid == null) {
    return {
      stopped: false,
      pid: null,
      message: "no local relay pid file (nothing to stop)",
    };
  }
  if (!isPidAlive(pid)) {
    clearRelayPidFile();
    return {
      stopped: false,
      pid,
      message: `stale relay pid ${pid} cleared (process not running)`,
    };
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch (e) {
    clearRelayPidFile();
    return {
      stopped: false,
      pid,
      message: `failed to signal pid ${pid}: ${e instanceof Error ? e.message : e}`,
    };
  }
  for (let i = 0; i < 50; i++) {
    await Bun.sleep(100);
    if (!isPidAlive(pid)) break;
  }
  if (isPidAlive(pid)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* */
    }
    await Bun.sleep(150);
  }
  const dead = !isPidAlive(pid);
  if (dead) clearRelayPidFile();
  return {
    stopped: dead,
    pid,
    message: dead
      ? `stopped local relay (pid ${pid})`
      : `relay pid ${pid} still alive after SIGTERM/SIGKILL`,
  };
}

export type { Subprocess };
