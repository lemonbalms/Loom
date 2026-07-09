/**
 * Loom env resolution (0.9.0 rename).
 * Most FABLE_* vars dual-read with deprecation; INSECURE_OPEN does not.
 */

let warnedFableEnv = false;

export function warnLegacyFableEnvOnce(key: string): void {
  if (warnedFableEnv) return;
  warnedFableEnv = true;
  try {
    console.error(
      `[loom] deprecated: ${key} (and other FABLE_* env) — prefer LOOM_* (product renamed 0.9.0)`,
    );
  } catch {
    /* */
  }
}

/** LOOM first, then FABLE (deprecated). */
export function envLoomOrFable(loomKey: string, fableKey: string): string | undefined {
  const loom = process.env[loomKey];
  if (loom !== undefined && loom !== "") return loom;
  const fab = process.env[fableKey];
  if (fab !== undefined && fab !== "") {
    warnLegacyFableEnvOnce(fableKey);
    return fab;
  }
  return undefined;
}

/**
 * H-5 / RN1: do NOT dual-read FABLE_RELAY_INSECURE_OPEN.
 * Only LOOM_RELAY_INSECURE_OPEN or explicit CLI flag.
 */
export function envInsecureOpen(): boolean {
  const v = process.env.LOOM_RELAY_INSECURE_OPEN;
  return v === "1" || v === "true";
}

export function envRelayToken(): string | undefined {
  return envLoomOrFable("LOOM_RELAY_TOKEN", "FABLE_RELAY_TOKEN");
}

export function envRelayUrl(): string | undefined {
  return envLoomOrFable("LOOM_RELAY_URL", "FABLE_RELAY_URL");
}

export function envRelayHost(): string | undefined {
  return envLoomOrFable("LOOM_RELAY_HOST", "FABLE_RELAY_HOST");
}

export function envRelayPort(): string | undefined {
  return envLoomOrFable("LOOM_RELAY_PORT", "FABLE_RELAY_PORT");
}

export function envSessionPath(): string | undefined {
  return envLoomOrFable("LOOM_SESSION", "FABLE_SESSION");
}

export function envProfile(): string | undefined {
  return envLoomOrFable("LOOM_PROFILE", "FABLE_PROFILE");
}

export function envTokenInQuery(): boolean {
  const v = envLoomOrFable(
    "LOOM_RELAY_TOKEN_IN_QUERY",
    "FABLE_RELAY_TOKEN_IN_QUERY",
  );
  return v === "1" || v === "true";
}
