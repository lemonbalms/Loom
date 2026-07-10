import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  chmodSync,
  renameSync,
  readdirSync,
  statSync,
  cpSync,
  rmSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { AgentKind } from "@loom/protocol";
import {
  parseRelayUrl,
  envSessionPath,
  envProfile,
  envRelayToken,
} from "@loom/protocol";

/** Session on disk (product Loom; formerly FableSession). */
export type LoomSession = {
  roomId: string;
  roomName: string;
  inviteCode: string;
  peerId: string;
  displayName: string;
  color?: string;
  agentKind: AgentKind;
  /** Relay WS URL without token query (H-6). */
  relayUrl: string;
  /** Shared secret stored separately from URL (H-6). */
  relayToken?: string;
  /**
   * M-7: per-peer rejoin proof issued by relay (room.state.peerSecret).
   * Required to reconnect as this peerId; file mode 0600.
   */
  peerSecret?: string;
  updatedAt: string;
  profile?: string;
};

/** @deprecated use LoomSession */
export type FableSession = LoomSession;

const LEGACY_DIR_NAME = ".fable";
const LOOM_DIR_NAME = ".loom";

let homeDirResolved: string | null = null;
let migrateMessagePrinted = false;

/** Override home for tests (M-16). Absolute path; unset to use os.homedir(). */
function stateRootHome(): string {
  const override = process.env.LOOM_TEST_HOME;
  if (override && override.length > 0) return override;
  return homedir();
}

function legacyHomeDir(): string {
  return join(stateRootHome(), LEGACY_DIR_NAME);
}

function loomHomeDir(): string {
  return join(stateRootHome(), LOOM_DIR_NAME);
}

/** Reset cached home resolution (tests only). */
export function resetStateHomeDirCache(): void {
  homeDirResolved = null;
  migrateMessagePrinted = false;
}

/** Best-effort: is pid still running? */
export function isPidAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function collectLivePidsUnder(dir: string): number[] {
  const pids: number[] = [];
  if (!existsSync(dir)) return pids;
  const walk = (d: string) => {
    let entries: string[];
    try {
      entries = readdirSync(d);
    } catch {
      return;
    }
    for (const name of entries) {
      const full = join(d, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(full);
        continue;
      }
      if (name.endsWith(".host.json") || name === "relay.pid") {
        try {
          const raw = readFileSync(full, "utf8").trim();
          if (name === "relay.pid") {
            const pid = Number(raw);
            if (isPidAlive(pid)) pids.push(pid);
          } else {
            const meta = JSON.parse(raw) as { pid?: number };
            if (meta.pid && isPidAlive(meta.pid)) pids.push(meta.pid);
          }
        } catch {
          /* */
        }
      }
    }
  };
  walk(dir);
  return pids;
}

function shouldSkipCopyName(name: string): boolean {
  if (name.endsWith(".lock")) return true;
  if (name.startsWith(".tmp.") || name.endsWith(".tmp") || name.includes(".tmp."))
    return true;
  return false;
}

function copyTreeFiltered(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(src)) {
    if (shouldSkipCopyName(name)) continue;
    const from = join(src, name);
    const to = join(dest, name);
    const st = statSync(from);
    if (st.isDirectory()) {
      if (name.endsWith(".lock")) continue;
      copyTreeFiltered(from, to);
    } else {
      cpSync(from, to);
    }
  }
}

/**
 * RN1 §4.2: prefer ~/.loom; migrate ~/.fable only when no live sticky/relay PIDs.
 */
export function resolveStateHomeDir(): string {
  if (homeDirResolved) return homeDirResolved;

  const loom = loomHomeDir();
  const legacy = legacyHomeDir();

  if (existsSync(loom)) {
    homeDirResolved = loom;
    return loom;
  }

  if (!existsSync(legacy)) {
    homeDirResolved = loom;
    return loom;
  }

  const live = collectLivePidsUnder(legacy);
  if (live.length > 0) {
    if (!migrateMessagePrinted) {
      migrateMessagePrinted = true;
      console.error(
        `[loom] stop sticky host / relay (pids ${live.join(", ")}) then re-run to migrate ~/.fable → ~/.loom`,
      );
    }
    homeDirResolved = legacy;
    return legacy;
  }

  // Safe to migrate
  try {
    renameSync(legacy, loom);
    homeDirResolved = loom;
    return loom;
  } catch {
    try {
      copyTreeFiltered(legacy, loom);
      // Prefer leave legacy if copy path was used (EXDEV); only remove when empty check ok
      try {
        const loomOk = existsSync(join(loom, "session.json")) || existsSync(loom);
        if (loomOk) {
          rmSync(legacy, { recursive: true, force: true });
        }
      } catch {
        /* leave orphan .fable */
      }
      homeDirResolved = loom;
      return loom;
    } catch {
      homeDirResolved = legacy;
      return legacy;
    }
  }
}

/** State home: ~/.loom (or ~/.fable if migrate blocked). */
export function loomDir(): string {
  return resolveStateHomeDir();
}

/** @deprecated use loomDir */
export function fableDir(): string {
  return loomDir();
}

/**
 * Session path resolution:
 * 1. **CLI `--profile`** (explicit `setActiveProfile`) — wins over inherited env
 *    so dogfood multi-peer from inside `loom run` still targets the right file.
 * 2. LOOM_SESSION env — absolute file path (MCP/child default); FABLE_SESSION not read (0.10)
 * 3. LOOM_PROFILE / soft setActiveProfile — ~/.loom/profiles/<name>.json
 * 4. default ~/.loom/session.json
 */
let activeProfile: string | null = null;
/** True when setActiveProfile was called with explicit CLI --profile. */
let activeProfileExplicit = false;

export function setActiveProfile(
  profile: string | null,
  opts?: { explicit?: boolean },
): void {
  activeProfile = profile && profile.length > 0 ? profile : null;
  activeProfileExplicit = Boolean(opts?.explicit && activeProfile);
}

/** Test / process reset helper. */
export function resetActiveProfile(): void {
  activeProfile = null;
  activeProfileExplicit = false;
}

export function getActiveProfile(): string | null {
  return activeProfile || envProfile() || null;
}

export function sessionPath(): string {
  const home = loomDir();
  // Explicit --profile must beat LOOM_SESSION inherited from parent agent run
  if (activeProfileExplicit && activeProfile) {
    return join(home, "profiles", `${activeProfile}.json`);
  }
  const override = envSessionPath();
  if (override) return override;
  const profile = getActiveProfile();
  if (profile) {
    return join(home, "profiles", `${profile}.json`);
  }
  return join(home, "session.json");
}

export function ensureLoomDir(): void {
  const home = loomDir();
  mkdirSync(home, { recursive: true });
  mkdirSync(join(home, "profiles"), { recursive: true });
  const p = sessionPath();
  mkdirSync(dirname(p), { recursive: true });
}

/** @deprecated use ensureLoomDir */
export function ensureFableDir(): void {
  ensureLoomDir();
}

/** Strip legacy ?token= from relayUrl into relayToken (H-6 migration). */
export function normalizeSession(raw: LoomSession): LoomSession {
  const ep = parseRelayUrl(raw.relayUrl, {
    token: raw.relayToken || envRelayToken(),
  });
  return {
    ...raw,
    relayUrl: ep.wsUrl,
    relayToken: raw.relayToken || ep.token,
  };
}

export function loadSession(): LoomSession | null {
  const p = sessionPath();
  if (!existsSync(p)) return null;
  try {
    const text = readFileSync(p, "utf8").trim();
    if (!text) return null;
    const parsed = JSON.parse(text) as LoomSession;
    return normalizeSession(parsed);
  } catch {
    return null;
  }
}

export function saveSession(session: LoomSession): void {
  ensureLoomDir();
  const profile = getActiveProfile();
  const normalized = normalizeSession({
    ...session,
    profile: profile ?? session.profile,
  });
  const path = sessionPath();
  writeFileSync(path, JSON.stringify(normalized, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
  try {
    chmodSync(path, 0o600);
  } catch {
    /* windows / unsupported */
  }
}

export function clearSession(): void {
  const p = sessionPath();
  if (existsSync(p)) {
    writeFileSync(p, "", "utf8");
  }
}

/** Build RelayClient options from a session (clean URL + separate token). */
export function relayClientOptsFromSession(session: LoomSession): {
  url: string;
  token?: string;
} {
  const s = normalizeSession(session);
  return {
    url: s.relayUrl,
    token: s.relayToken || envRelayToken() || undefined,
  };
}

