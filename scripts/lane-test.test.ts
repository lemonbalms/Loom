/**
 * Tests for scripts/lane-test.ts — fixtures live in a fresh temp dir outside
 * the repo so the main suite never collects them.
 *
 *   T=$(mktemp -d); env -u LOOM_RELAY_TOKEN -u LOOM_RELAY_URL HOME=$T LOOM_TEST_HOME=$T \
 *     LOOM_PROFILE=smoke bun test scripts/lane-test.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve as resolvePath } from "node:path";
import { laneTestEnv, rejectedArg } from "./lane-test.ts";

const LANE_TEST_TS = resolvePath(import.meta.dir, "lane-test.ts");

const PASSING_FIXTURE = `import { expect, test } from "bun:test";
import { realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
test("isolated env", () => {
  const home = process.env.HOME ?? "";
  if (process.env.LANE_TEST_PROBE_OUT) writeFileSync(process.env.LANE_TEST_PROBE_OUT, home);
  expect(home).toBe(process.env.LOOM_TEST_HOME ?? "");
  const t = tmpdir();
  expect(home.startsWith(t) || home.startsWith(realpathSync(t))).toBe(true);
  expect(home).toContain("loom-lane-test-");
  expect(process.env.LOOM_RELAY_TOKEN === undefined).toBe(true);
  expect(process.env.LOOM_RELAY_URL).toBeUndefined();
  expect(process.env.LOOM_PROFILE).toBe("smoke");
});
`;

const FAILING_FIXTURE = `import { expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
test("fails", () => {
  if (process.env.LANE_TEST_PROBE_OUT) writeFileSync(process.env.LANE_TEST_PROBE_OUT, process.env.HOME ?? "");
  expect(1).toBe(2);
});
`;

const SLEEPING_FIXTURE = `import { test } from "bun:test";
import { writeFileSync } from "node:fs";
test("sleeps", async () => {
  if (process.env.LANE_TEST_PROBE_OUT) writeFileSync(process.env.LANE_TEST_PROBE_OUT, process.env.HOME ?? "");
  await Bun.sleep(30000);
}, 60000);
`;

let fixtureDir = "";

beforeAll(() => {
  fixtureDir = mkdtempSync(join(tmpdir(), "lane-test-fixture-"));
  writeFileSync(join(fixtureDir, "pass.test.ts"), PASSING_FIXTURE);
  writeFileSync(join(fixtureDir, "fail.test.ts"), FAILING_FIXTURE);
  writeFileSync(join(fixtureDir, "sleep.test.ts"), SLEEPING_FIXTURE);
  // Bun auto-loads .env from cwd — the wrapper must keep this out of the child.
  writeFileSync(join(fixtureDir, ".env"), "LOOM_RELAY_TOKEN=leak\n");
});

afterAll(() => {
  if (fixtureDir) rmSync(fixtureDir, { recursive: true, force: true });
});

function wrapperEnv(extraEnv: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
  Object.assign(env, { LOOM_RELAY_TOKEN: "x", LOOM_RELAY_URL: "ws://x" }, extraEnv);
  return env;
}

function runLaneTest(args: string[], extraEnv: Record<string, string> = {}) {
  return spawnSync("bun", ["run", LANE_TEST_TS, ...args], {
    cwd: fixtureDir,
    env: wrapperEnv(extraEnv),
    encoding: "utf8",
  });
}

describe("laneTestEnv", () => {
  test("drops relay keys, pins HOME / LOOM_TEST_HOME / LOOM_PROFILE, keeps the rest", () => {
    const env = laneTestEnv(
      {
        PATH: "/usr/bin",
        HOME: "/real/home",
        LOOM_RELAY_TOKEN: "secret",
        LOOM_RELAY_URL: "ws://relay",
        LOOM_PROFILE: "claude-impl",
      },
      "/tmp/loom-lane-test-abc",
    );
    expect(env).toEqual({
      PATH: "/usr/bin",
      HOME: "/tmp/loom-lane-test-abc",
      LOOM_TEST_HOME: "/tmp/loom-lane-test-abc",
      LOOM_PROFILE: "smoke",
    });
    expect("LOOM_RELAY_TOKEN" in env).toBe(false);
    expect("LOOM_RELAY_URL" in env).toBe(false);
  });
});

describe("rejectedArg", () => {
  test("rejects --env-file in both forms, accepts the rest", () => {
    expect(rejectedArg(["--env-file"])).toBe("--env-file");
    expect(rejectedArg(["a.test.ts", "--env-file=x"])).toBe("--env-file=x");
    expect(rejectedArg(["--timeout=5", "a.test.ts", "./b.test.ts"])).toBeNull();
    expect(rejectedArg([])).toBeNull();
  });
});

describe("lane-test.ts (spawned)", () => {
  test("isolated env reaches the child bun test despite a cwd .env → exit 0", () => {
    const r = runLaneTest(["./pass.test.ts"]);
    expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(0);
  }, 30_000);

  test("failing test runs, exits exactly 1, and its temp HOME is removed", () => {
    const probe = join(fixtureDir, "probe-fail.txt");
    const r = runLaneTest(["./fail.test.ts"], { LANE_TEST_PROBE_OUT: probe });
    expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(1);
    expect(existsSync(probe)).toBe(true);
    const home = readFileSync(probe, "utf8");
    expect(home).toContain("loom-lane-test-");
    expect(existsSync(home)).toBe(false);
  }, 30_000);

  test("temp HOME is removed after the run", () => {
    const probe = join(fixtureDir, "probe-home.txt");
    const r = runLaneTest(["./pass.test.ts"], { LANE_TEST_PROBE_OUT: probe });
    expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(0);
    const home = readFileSync(probe, "utf8");
    expect(home).toContain("loom-lane-test-");
    expect(existsSync(home)).toBe(false);
  }, 30_000);

  test("--env-file=.env is rejected → exit 2", () => {
    const r = runLaneTest(["--env-file=.env", "./pass.test.ts"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("[test:lane] --env-file is not allowed (relay isolation)");
  }, 30_000);

  test("SIGTERM to the process group → exit 1 and temp HOME removed", async () => {
    const probe = join(fixtureDir, "probe-signal.txt");
    const child = spawn("bun", ["run", LANE_TEST_TS, "./sleep.test.ts"], {
      cwd: fixtureDir,
      env: wrapperEnv({ LANE_TEST_PROBE_OUT: probe }),
      detached: true,
      stdio: "ignore",
    });
    const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((res) => {
      child.on("exit", (code, signal) => res({ code, signal }));
    });
    const deadline = Date.now() + 20_000;
    const readProbe = () => (existsSync(probe) ? readFileSync(probe, "utf8") : "");
    while (readProbe() === "" && Date.now() < deadline) await Bun.sleep(50);
    const home = readProbe();
    expect(home).toContain("loom-lane-test-");
    process.kill(-(child.pid as number), "SIGTERM");
    const { code, signal } = await exited;
    expect(signal).toBeNull();
    expect(code).toBe(1);
    expect(existsSync(home)).toBe(false);
  }, 30_000);
});
