/**
 * Loom env resolution (0.10.0).
 * LOOM_* only — FABLE_* dual-read removed (still warn if set so users migrate).
 * INSECURE_OPEN: LOOM only (never dual-read).
 */

let warnedLegacyEnv = false;

function warnLegacyFableEnvRejected(fableKey: string, loomKey: string): void {
  if (warnedLegacyEnv) return;
  warnedLegacyEnv = true;
  try {
    console.error(
      `[loom] ${fableKey} is no longer read (0.10). Set ${loomKey} instead. ` +
        `Legacy dual-read was removed; data paths (FABLE- invites, fable-board-snapshot) still work.`,
    );
  } catch {
    /* */
  }
}

/**
 * Read LOOM_* only. If only FABLE_* is set, warn and return undefined
 * (does not fall back — 0.10 hard cut for env).
 */
export function envLoom(
  loomKey: string,
  fableKeyForWarn?: string,
): string | undefined {
  const loom = process.env[loomKey];
  if (loom !== undefined && loom !== "") return loom;
  if (fableKeyForWarn) {
    const fab = process.env[fableKeyForWarn];
    if (fab !== undefined && fab !== "") {
      warnLegacyFableEnvRejected(fableKeyForWarn, loomKey);
    }
  }
  return undefined;
}

/** @deprecated use envLoom — dual-read removed in 0.10 */
export function envLoomOrFable(
  loomKey: string,
  fableKey: string,
): string | undefined {
  return envLoom(loomKey, fableKey);
}

/** @deprecated */
export function warnLegacyFableEnvOnce(key: string): void {
  warnLegacyFableEnvRejected(key, key.replace(/^FABLE_/, "LOOM_"));
}

/**
 * H-5: do NOT dual-read FABLE_RELAY_INSECURE_OPEN.
 */
export function envInsecureOpen(): boolean {
  const v = process.env.LOOM_RELAY_INSECURE_OPEN;
  return v === "1" || v === "true";
}

export function envRelayToken(): string | undefined {
  return envLoom("LOOM_RELAY_TOKEN", "FABLE_RELAY_TOKEN");
}

export function envRelayUrl(): string | undefined {
  return envLoom("LOOM_RELAY_URL", "FABLE_RELAY_URL");
}

export function envRelayHost(): string | undefined {
  return envLoom("LOOM_RELAY_HOST", "FABLE_RELAY_HOST");
}

export function envRelayPort(): string | undefined {
  return envLoom("LOOM_RELAY_PORT", "FABLE_RELAY_PORT");
}

export function envSessionPath(): string | undefined {
  return envLoom("LOOM_SESSION", "FABLE_SESSION");
}

export function envProfile(): string | undefined {
  return envLoom("LOOM_PROFILE", "FABLE_PROFILE");
}

export function envTokenInQuery(): boolean {
  const v = envLoom("LOOM_RELAY_TOKEN_IN_QUERY", "FABLE_RELAY_TOKEN_IN_QUERY");
  return v === "1" || v === "true";
}
