import type { RoomRegistryOptions } from "./room";
import { defaultRelayStateDir } from "./persist";

/**
 * Env → RoomRegistryOptions only (PLAN 0.24.1 D6 / R38 M-1).
 *
 * Callers construct `new RoomRegistry(...)`, own try/catch, error text, and exit.
 * Does not create registries or touch the process lifecycle.
 */
export function resolveRegistryOptionsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): RoomRegistryOptions {
  const ephemeral =
    env.LOOM_RELAY_EPHEMERAL === "1" || env.LOOM_RELAY_EPHEMERAL === "true";
  if (ephemeral) {
    return { ephemeral: true };
  }
  const stateDir = env.LOOM_RELAY_STATE_DIR || defaultRelayStateDir();
  return { stateDir };
}
