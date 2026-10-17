/**
 * Lane-safe `bun test`: the impl lane types a plain `bun run test:lane <args>`
 * and this script enforces the test-isolation invariants itself — relay env
 * removed, fresh temp HOME + LOOM_TEST_HOME, LOOM_PROFILE=smoke.
 *
 * Why a package script: P4 (2026-10-17) measured that an env-prefixed
 * `--allowedTools` rule (`Bash(env -u … HOME=* … bun test:*)`) never matches —
 * `env` is not a stripped wrapper and allow rules do not match past `VAR=`
 * assignments. Design: docs/spikes/HEADLESS-LANES-DESIGN.md §6.1.
 *
 * Usage:
 *   bun run test:lane [bun test args...]
 *
 * The child runs as `bun --no-env-file test …` so Bun's `.env*` auto-load
 * cannot re-add the relay keys; `--env-file` args are rejected (exit 2).
 *
 * SIGTERM/SIGINT/SIGHUP get no-op handlers so `finally` still removes the
 * temp HOME after the process-group kill takes the child down. SIGKILL
 * cannot be handled — a leftover `loom-lane-test-*` dir under tmpdir is the
 * accepted residual.
 *
 * Exit: the child `bun test` status; 1 on signal or spawn failure; 2 on a
 * rejected arg.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DROPPED_KEYS = ["LOOM_RELAY_TOKEN", "LOOM_RELAY_URL"] as const;

/** Child env: `base` minus relay keys, with HOME / LOOM_TEST_HOME = `home` and the smoke profile. */
export function laneTestEnv(base: NodeJS.ProcessEnv, home: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(base)) {
    if (v === undefined || (DROPPED_KEYS as readonly string[]).includes(k)) continue;
    env[k] = v;
  }
  env.HOME = home;
  env.LOOM_TEST_HOME = home;
  env.LOOM_PROFILE = "smoke";
  return env;
}

/** The first arg that would re-load env from a file (`--env-file`, `--env-file=…`), or null. */
export function rejectedArg(args: readonly string[]): string | null {
  for (const a of args) {
    if (a === "--env-file" || a.startsWith("--env-file=")) return a;
  }
  return null;
}

const CAUGHT_SIGNALS = ["SIGTERM", "SIGINT", "SIGHUP"] as const;

function main(): number {
  const args = process.argv.slice(2);
  if (rejectedArg(args) !== null) {
    process.stderr.write("[test:lane] --env-file is not allowed (relay isolation)\n");
    return 2;
  }
  // No-op handlers only replace the default kill disposition: spawnSync blocks the event loop,
  // so they never run before the child returns — their job is to keep this process alive long
  // enough for `finally` to remove the temp dir after the group kill takes the child down. A
  // signalled child shows up as `r.status === null`.
  for (const sig of CAUGHT_SIGNALS) {
    process.on(sig, () => {});
  }
  const dir = mkdtempSync(join(tmpdir(), "loom-lane-test-"));
  try {
    const r = spawnSync("bun", ["--no-env-file", "test", ...args], {
      stdio: "inherit",
      env: laneTestEnv(process.env, dir),
      cwd: process.cwd(),
    });
    if (r.error || r.status === null) return 1;
    return r.status;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  process.exit(main());
}
