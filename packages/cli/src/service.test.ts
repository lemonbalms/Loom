/**
 * PLAN 0.34.0 P3 — `loom service install|uninstall|start|status [--profile]` + R13.
 * Done-when (e)(f): every install-flow refusal (exit 1 + wording) · exact runner argv · 0644 unit ·
 * 0600 log pre-created without truncation · Linux wants symlink · byte-identical reinstall = zero
 * write verbs · loaded-but-not-running reinstall (R52-M1) · ≤25 s bootout poll (R52-M2) · in-flight
 * guard + --force (R7) · no_domain/no_bus → exit 3 · code-only → exit 1 (R52-L2) · FABLE_RELAY_TOKEN
 * (R52-L1) · disabled · uninstall/start/status · pane warning · linger line · R13.
 *
 * Every test injects a FAKE runner, an injected platform (darwin and linux), an injected clock and a
 * LOOM_TEST_HOME temp home (removed after each test). No test reaches launchctl/systemctl/loginctl:
 * the only real-runner reference is R9 — refused under LOOM_TEST_HOME before anything is spawned.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type BridgeLockInspection,
  bridgeConfigPath,
  bridgeLogPath,
  bridgeStatusPath,
  resetActiveProfile,
  resetStateHomeDirCache,
  resolveBridgeProfile,
  type ServiceRunnerResult,
} from "@loom/host";
import { realServiceRunner, runServiceCommand, type ServiceDeps } from "./service";

const UID = 501;
const PROFILE = "work";
const LABEL = `com.loom.bridge.${PROFILE}`;
const UNIT = `loom-bridge-${PROFILE}.service`;
const SVC_PID = 4242;
const BRIDGE_MAIN = join(import.meta.dir, "../../host/src/bridge-main.ts");

/** Verbs that change service-manager state. Reads are print · print-disabled · show · show-user. */
const LAUNCHD_WRITE = new Set([
  "bootstrap",
  "bootout",
  "kickstart",
  "enable",
  "disable",
  "load",
  "unload",
  "remove",
  "start",
  "stop",
  "submit",
]);
const SYSTEMD_WRITE = new Set([
  "daemon-reload",
  "start",
  "stop",
  "restart",
  "reload",
  "enable",
  "disable",
  "kill",
  "reset-failed",
  "mask",
  "unmask",
]);

function isWrite(argv: string[]): boolean {
  if (argv[0] === "launchctl") return LAUNCHD_WRITE.has(argv[1]!);
  if (argv[0] === "systemctl") return SYSTEMD_WRITE.has(argv[1] === "--user" ? argv[2]! : argv[1]!);
  if (argv[0] === "loginctl") return argv[1] !== "show-user";
  return true;
}

// ---------------------------------------------------------------------------------------------
// Temp home + fixtures
// ---------------------------------------------------------------------------------------------

let home: string;
const SAVED_KEYS = [
  "LOOM_TEST_HOME",
  "LOOM_SESSION",
  "LOOM_PROFILE",
  "LOOM_RELAY_TOKEN",
  "FABLE_RELAY_TOKEN",
  "LOOM_RELAY_URL",
] as const;
const saved = new Map<string, string | undefined>();

beforeEach(() => {
  for (const k of SAVED_KEYS) saved.set(k, process.env[k]);
  for (const k of SAVED_KEYS) delete process.env[k];
  home = mkdtempSync(join(tmpdir(), "loom-svc-"));
  process.env.LOOM_TEST_HOME = home;
  resetStateHomeDirCache();
  resetActiveProfile();
});

afterEach(() => {
  for (const [k, v] of saved) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetStateHomeDirCache();
  resetActiveProfile();
  rmSync(home, { recursive: true, force: true });
});

const loomHome = () => join(home, ".loom");

function writeSession(
  over: Record<string, unknown> = {},
  profile: string = PROFILE,
): string {
  const p = join(loomHome(), "profiles", `${profile}.json`);
  mkdirSync(join(loomHome(), "profiles"), { recursive: true });
  writeFileSync(
    p,
    JSON.stringify({
      relayUrl: "wss://relay.example.com:7842/ws",
      relayToken: "tok-SECRET-123",
      roomId: "r_1",
      roomName: "room",
      inviteCode: "LOOM-ABCD",
      peerId: "p_node",
      peerSecret: "ps-SECRET",
      displayName: profile,
      ...over,
    }),
    { mode: 0o600 },
  );
  return p;
}

function writeBridgeConfig(over: Record<string, unknown> = {}, profile: string = PROFILE): void {
  const p = join(loomHome(), "bridge", `${profile}.json`);
  mkdirSync(join(loomHome(), "bridge"), { recursive: true });
  writeFileSync(p, JSON.stringify({ authorizedDispatchers: ["p_tower"], ...over }));
}

function headlessWorker(): Record<string, unknown> {
  const cwd = join(home, "work");
  mkdirSync(cwd, { recursive: true });
  return {
    worker: {
      backend: "headless",
      cwd,
      allowedRoots: [cwd],
      timeoutMs: 60_000,
    },
  };
}

function writeStatus(
  state: "running" | "stopped" | "draining",
  pid = SVC_PID,
  inFlight = { paneCards: 0, convs: 0, headlessRunning: 0, headlessQueued: 0 },
): void {
  const p = bridgeStatusPath(PROFILE);
  mkdirSync(join(p, ".."), { recursive: true });
  const now = new Date().toISOString();
  writeFileSync(
    p,
    JSON.stringify({
      v: 1,
      pid,
      version: "0.34.0",
      srcPath: BRIDGE_MAIN,
      profile: PROFILE,
      startedAt: now,
      heartbeatAt: now,
      state,
      inFlight,
      herdr: "skipped",
    }),
  );
}

const plistPath = () => join(home, "Library/LaunchAgents", `${LABEL}.plist`);
const unitPath = () => join(home, ".config/systemd/user", UNIT);
const wantsPath = () => join(home, ".config/systemd/user/default.target.wants", UNIT);

function setup(opts: { headless?: boolean } = {}): void {
  writeSession();
  writeBridgeConfig(opts.headless ? headlessWorker() : {});
}

// ---------------------------------------------------------------------------------------------
// Fake service managers (scripted state machines)
// ---------------------------------------------------------------------------------------------

type Res = ServiceRunnerResult;
const ok = (stdout = ""): Res => ({ code: 0, stdout, stderr: "" });
const fail = (code: number, stderr = ""): Res => ({ code, stdout: "", stderr });

type FakeState = {
  loaded: boolean;
  running: boolean;
  disabled: boolean;
  /** bootout leaves the job listed for this many `print` calls (R52-M2). */
  bootoutLingerPrints: number;
  /** status file follows the fake service (simulated bridge). */
  writesStatus: boolean;
  linger: "yes" | "no";
};

type Fake = {
  calls: string[][];
  state: FakeState;
  runner: (argv: string[]) => Promise<Res>;
  /** per-verb override: return a result to short-circuit the state machine. */
  override: Map<string, (argv: string[]) => Res | undefined>;
};

function launchdPrint(st: FakeState): string {
  return [
    `gui/${UID}/${LABEL} = {`,
    "\tactive count = 1",
    `\tpath = ${plistPath()}`,
    `\tstate = ${st.running ? "running" : "not running"}`,
    "\tprogram = /usr/local/bin/bun",
    ...(st.running ? [`\tpid = ${SVC_PID}`] : ["\tlast exit code = 0"]),
    "}",
    "",
  ].join("\n");
}

function systemdShow(st: FakeState): string {
  return [
    `LoadState=${st.loaded ? "loaded" : "not-found"}`,
    `ActiveState=${st.running ? "active" : "inactive"}`,
    `SubState=${st.running ? "running" : "dead"}`,
    `MainPID=${st.running ? SVC_PID : 0}`,
    "ExecMainStatus=0",
    `UnitFileState=${st.loaded ? "enabled" : ""}`,
    "",
  ].join("\n");
}

function makeFake(init: Partial<FakeState> = {}): Fake {
  const state: FakeState = {
    loaded: false,
    running: false,
    disabled: false,
    bootoutLingerPrints: 0,
    writesStatus: true,
    linger: "no",
    ...init,
  };
  const calls: string[][] = [];
  const override = new Map<string, (argv: string[]) => Res | undefined>();
  let lingerLeft = 0;
  const startSvc = () => {
    state.running = true;
    if (state.writesStatus) writeStatus("running");
  };
  const runner = async (argv: string[]): Promise<Res> => {
    calls.push([...argv]);
    const verb = argv[0] === "systemctl" ? argv[2]! : argv[1]!;
    const o = override.get(`${argv[0]} ${verb}`)?.(argv);
    if (o) return o;
    if (argv[0] === "launchctl") {
      switch (verb) {
        case "print":
          if (lingerLeft > 0) {
            lingerLeft--;
            return ok(launchdPrint(state));
          }
          return state.loaded
            ? ok(launchdPrint(state))
            : fail(113, `Could not find service "${LABEL}" in domain for user gui: ${UID}`);
        case "print-disabled":
          return ok(
            `disabled services = {\n\t"${LABEL}" => ${state.disabled ? "disabled" : "enabled"}\n}\n`,
          );
        case "bootstrap":
          state.loaded = true;
          if (!state.disabled) startSvc();
          return ok();
        case "bootout":
          state.loaded = false;
          state.running = false;
          lingerLeft = state.bootoutLingerPrints;
          return ok();
        case "kickstart":
          startSvc();
          return ok();
      }
      return fail(1, `unexpected launchctl ${verb}`);
    }
    if (argv[0] === "systemctl") {
      switch (verb) {
        case "show":
          return ok(systemdShow(state));
        case "daemon-reload":
          state.loaded = existsSync(unitPath());
          return ok();
        case "start":
          startSvc();
          return ok();
        case "stop":
          state.running = false;
          return ok();
      }
      return fail(1, `unexpected systemctl ${verb}`);
    }
    if (argv[0] === "loginctl" && argv[1] === "show-user") return ok(`Linger=${state.linger}\n`);
    return fail(1, `unexpected ${argv.join(" ")}`);
  };
  return { calls, state, runner, override };
}

type Run = { code: number; out: string; err: string; text: string; fake: Fake; elapsedMs: number };

async function run(
  verb: string,
  platform: "darwin" | "linux",
  fake: Fake,
  opts: { profile?: string; force?: boolean } = {},
  deps: Partial<ServiceDeps> = {},
): Promise<Run> {
  const out: string[] = [];
  const err: string[] = [];
  let t = 1_000_000;
  const code = await runServiceCommand(
    verb,
    { profile: PROFILE, ...opts },
    {
      runner: fake.runner,
      platform,
      uid: UID,
      user: "tester",
      env: { ...process.env },
      execPath: process.execPath,
      bridgeMainPath: () => BRIDGE_MAIN,
      now: () => t,
      sleep: async (ms: number) => {
        t += ms;
      },
      out: (l: string) => out.push(l),
      err: (l: string) => err.push(l),
      inspectLock: (): BridgeLockInspection => ({ kind: "none" }),
      ...deps,
    },
  );
  return {
    code,
    out: out.join("\n"),
    err: err.join("\n"),
    text: [...out, ...err].join("\n"),
    fake,
    elapsedMs: t - 1_000_000,
  };
}

const writes = (f: Fake) => f.calls.filter(isWrite);
const humanLock = (): BridgeLockInspection => ({
  kind: "held",
  pid: 999,
  startedAt: new Date().toISOString(),
  verified: true,
});
const mode = (p: string) => statSync(p).mode & 0o777;

const PLATFORMS = ["darwin", "linux"] as const;
const target = (p: (typeof PLATFORMS)[number]) => (p === "darwin" ? plistPath() : unitPath());

function foreignMarked(p: (typeof PLATFORMS)[number], profile: string): string {
  return p === "darwin"
    ? `<?xml version="1.0" encoding="UTF-8"?>\n<!-- loom-service v1 profile=${profile} loom=0.33.9 -->\n<plist version="1.0"><dict></dict></plist>\n`
    : `# loom-service v1 profile=${profile} loom=0.33.9\n[Unit]\nDescription=old\n`;
}

function writeTarget(p: (typeof PLATFORMS)[number], text: string): void {
  const t = target(p);
  mkdirSync(join(t, ".."), { recursive: true });
  writeFileSync(t, text, { mode: 0o644 });
}

// ---------------------------------------------------------------------------------------------
// install — refusals (flow 1–5) · exit 1 + wording · zero writes
// ---------------------------------------------------------------------------------------------

for (const platform of PLATFORMS) {
  describe(`install refusals (${platform})`, () => {
    test("loopback relay → refused", async () => {
      writeSession({ relayUrl: "ws://127.0.0.1:7842/ws" });
      writeBridgeConfig();
      const r = await run("install", platform, makeFake());
      expect(r.code).toBe(1);
      expect(r.text).toContain("loopback relay — loom service needs a reachable relay (0.33.0 D1)");
      expect(writes(r.fake)).toEqual([]);
      expect(existsSync(target(platform))).toBe(false);
    });

    test("loopback relay (localhost) → refused", async () => {
      writeSession({ relayUrl: "ws://localhost:7842/ws" });
      writeBridgeConfig();
      const r = await run("install", platform, makeFake());
      expect(r.code).toBe(1);
      expect(r.text).toContain("loopback relay");
    });

    test("relay token only in env (LOOM_RELAY_TOKEN) → refused (R5)", async () => {
      writeSession({ relayToken: undefined });
      writeBridgeConfig();
      const r = await run("install", platform, makeFake(), {}, {
        env: { ...process.env, LOOM_RELAY_TOKEN: "env-token" },
      });
      expect(r.code).toBe(1);
      expect(r.text).toContain("relay token only in env — save it to the session (loom join …) first");
      expect(existsSync(target(platform))).toBe(false);
    });

    test("relay token only in FABLE_RELAY_TOKEN → refused (R52-L1)", async () => {
      writeSession({ relayToken: undefined });
      writeBridgeConfig();
      const r = await run("install", platform, makeFake(), {}, {
        env: { ...process.env, FABLE_RELAY_TOKEN: "env-token" },
      });
      expect(r.code).toBe(1);
      expect(r.text).toContain("relay token only in env");
      expect(existsSync(target(platform))).toBe(false);
    });

    test("token on disk + env token → not refused for the token", async () => {
      setup();
      const r = await run("install", platform, makeFake(), {}, {
        env: { ...process.env, LOOM_RELAY_TOKEN: "env-token" },
      });
      expect(r.code).toBe(0);
      expect(readFileSync(target(platform), "utf8")).not.toContain("env-token");
      expect(readFileSync(target(platform), "utf8")).not.toContain("tok-SECRET-123");
    });

    test("empty authorizedDispatchers → refused (M-1)", async () => {
      writeSession();
      writeBridgeConfig({ authorizedDispatchers: [] });
      const r = await run("install", platform, makeFake());
      expect(r.code).toBe(1);
      expect(r.text).toContain("authorizedDispatchers empty");
      expect(writes(r.fake)).toEqual([]);
    });

    test("no session → refused", async () => {
      writeBridgeConfig();
      const r = await run("install", platform, makeFake());
      expect(r.code).toBe(1);
      expect(r.text).toMatch(/no session/i);
      expect(existsSync(target(platform))).toBe(false);
    });

    test("bridge-main.ts not resolvable → refused", async () => {
      setup();
      const r = await run("install", platform, makeFake(), {}, {
        bridgeMainPath: () => {
          throw new Error("Cannot find bridge-main.ts");
        },
      });
      expect(r.code).toBe(1);
      expect(r.text).toContain("cannot find bridge-main.ts — run install from the Loom source checkout");
    });

    test("non-Loom file at the target → refused, file untouched", async () => {
      setup();
      writeTarget(platform, "hand-written unit\n");
      const r = await run("install", platform, makeFake());
      expect(r.code).toBe(1);
      expect(r.text).toContain(`${target(platform)} exists and is not a Loom service file — not touching it`);
      expect(readFileSync(target(platform), "utf8")).toBe("hand-written unit\n");
      expect(writes(r.fake)).toEqual([]);
    });

    test("Loom marker for another profile → refused as foreign", async () => {
      setup();
      writeTarget(platform, foreignMarked(platform, "other"));
      const r = await run("install", platform, makeFake());
      expect(r.code).toBe(1);
      expect(r.text).toContain("is not a Loom service file");
      expect(readFileSync(target(platform), "utf8")).toBe(foreignMarked(platform, "other"));
    });

    test("human-run bridge holds the lock → refused", async () => {
      setup();
      const r = await run("install", platform, makeFake(), {}, { inspectLock: humanLock });
      expect(r.code).toBe(1);
      expect(r.text).toContain("bridge pid 999 is running outside the service — loom bridge stop first");
      expect(writes(r.fake)).toEqual([]);
      expect(existsSync(target(platform))).toBe(false);
    });

    test("D8: profile whose sanitizers disagree → refused", async () => {
      writeSession({}, "a b");
      writeBridgeConfig({}, "a b");
      const r = await run("install", platform, makeFake(), { profile: "a b" });
      expect(r.code).toBe(1);
      expect(r.text).toContain(
        'profile name "a b" maps to different file names (config "a_b" vs lock/log "a-b") — rename the profile',
      );
      expect(r.fake.calls).toEqual([]);
    });

    test("LOOM_TEST_HOME + real runner → every verb refused before any call (R9)", async () => {
      setup();
      for (const verb of ["install", "uninstall", "start", "status"]) {
        const r = await run(verb, platform, makeFake(), {}, { runner: realServiceRunner });
        expect(r.code).toBe(1);
        expect(r.text).toContain("LOOM_TEST_HOME set — refusing to call the real service manager");
      }
      expect(existsSync(target(platform))).toBe(false);
    });
  });
}

test("unsupported platform → exit 1", async () => {
  setup();
  const r = await run("install", "win32" as "linux", makeFake());
  expect(r.code).toBe(1);
  expect(r.text).toContain("loom service: unsupported platform win32");
  expect(r.fake.calls).toEqual([]);
});

test("R9: the real runner itself refuses under LOOM_TEST_HOME (never spawns)", async () => {
  const r = await realServiceRunner(["launchctl", "print", `gui/${UID}/com.loom.bridge.smoke`]);
  expect(r.code).not.toBe(0);
  expect(r.stderr).toContain("LOOM_TEST_HOME set — refusing to call the real service manager");
});

test("R9: CLI `loom service install` under LOOM_TEST_HOME uses the real runner → refused, exit 1", () => {
  setup();
  const cli = join(import.meta.dir, "index.ts");
  for (const verb of ["install", "uninstall", "start", "status"]) {
    const r = spawnSync(process.execPath, [cli, "--profile", PROFILE, "service", verb], {
      env: { ...process.env, LOOM_TEST_HOME: home },
      encoding: "utf8",
      timeout: 30_000,
    });
    expect(r.status).toBe(1);
    expect(`${r.stdout}${r.stderr}`).toContain(
      "LOOM_TEST_HOME set — refusing to call the real service manager",
    );
  }
  expect(existsSync(plistPath())).toBe(false);
  expect(existsSync(unitPath())).toBe(false);
});

test("CLI `loom service` usage error → exit 1 with usage", () => {
  const cli = join(import.meta.dir, "index.ts");
  const r = spawnSync(process.execPath, [cli, "service", "restart"], {
    env: { ...process.env, LOOM_TEST_HOME: home },
    encoding: "utf8",
    timeout: 30_000,
  });
  expect(r.status).toBe(1);
  expect(`${r.stdout}${r.stderr}`).toContain("loom service install|uninstall|start|status");
});

test("help text lists `loom service`", () => {
  const cli = join(import.meta.dir, "index.ts");
  const r = spawnSync(process.execPath, [cli, "help"], {
    env: { ...process.env, LOOM_TEST_HOME: home },
    encoding: "utf8",
    timeout: 30_000,
  });
  expect(r.stdout).toContain("loom service install|uninstall|start|status");
});

// ---------------------------------------------------------------------------------------------
// install — fresh install (flow 7–9)
// ---------------------------------------------------------------------------------------------

describe("install — fresh (darwin)", () => {
  test("exact runner argv · 0644 plist · 0600 log · exit 0 · pane warning", async () => {
    setup();
    const r = await run("install", "darwin", makeFake());
    expect(r.code).toBe(0);
    expect(writes(r.fake)).toEqual([["launchctl", "bootstrap", `gui/${UID}`, plistPath()]]);
    expect(mode(plistPath())).toBe(0o644);
    const text = readFileSync(plistPath(), "utf8");
    expect(text).toContain(`<!-- loom-service v1 profile=${PROFILE} `);
    expect(text).toContain(BRIDGE_MAIN);
    expect(text).toContain(process.execPath);
    expect(text).not.toContain("tok-SECRET-123");
    expect(text).not.toContain("ps-SECRET");
    expect(mode(bridgeLogPath(PROFILE))).toBe(0o600);
    expect(mode(join(loomHome(), "bridge"))).toBe(0o700);
    expect(r.text).toContain(
      "warn: pane backend — the service crash-loops (exit 1 every 10 s) while herdr is down",
    );
    expect(r.text).toMatch(/pid 4242/);
    // reads only beside the single write; nothing outside launchctl
    expect(r.fake.calls.every((c) => c[0] === "launchctl")).toBe(true);
    expect(r.fake.calls.some((c) => c.includes("-k"))).toBe(false);
  });

  test("existing log content preserved (no truncation) and chmod 0600", async () => {
    setup();
    mkdirSync(join(loomHome(), "bridge"), { recursive: true });
    writeFileSync(bridgeLogPath(PROFILE), "old line 1\nold line 2\n", { mode: 0o644 });
    const r = await run("install", "darwin", makeFake());
    expect(r.code).toBe(0);
    expect(readFileSync(bridgeLogPath(PROFILE), "utf8")).toBe("old line 1\nold line 2\n");
    expect(mode(bridgeLogPath(PROFILE))).toBe(0o600);
  });

  test("headless backend → no pane warning", async () => {
    setup({ headless: true });
    const r = await run("install", "darwin", makeFake());
    expect(r.code).toBe(0);
    expect(r.text).not.toContain("pane backend");
  });

  test("darwin prints no linger line and never calls loginctl", async () => {
    setup();
    const r = await run("install", "darwin", makeFake());
    expect(r.text).not.toContain("linger:");
    expect(r.fake.calls.some((c) => c[0] === "loginctl")).toBe(false);
  });

  test("service never reports running within 12 s → exit 1 with last log line", async () => {
    setup();
    mkdirSync(join(loomHome(), "bridge"), { recursive: true });
    writeFileSync(bridgeLogPath(PROFILE), "boom: herdr socket missing\n");
    const fake = makeFake({ writesStatus: false });
    const r = await run("install", "darwin", fake);
    expect(r.code).toBe(1);
    expect(r.text).toContain("boom: herdr socket missing");
    expect(r.elapsedMs).toBeGreaterThanOrEqual(12_000);
    expect(r.elapsedMs).toBeLessThan(20_000);
    expect(existsSync(plistPath())).toBe(true);
  });
});

describe("install — fresh (linux)", () => {
  test("exact runner argv daemon-reload → start · 0644 unit · wants symlink (R8) · linger line", async () => {
    setup();
    const r = await run("install", "linux", makeFake({ linger: "no" }));
    expect(r.code).toBe(0);
    expect(writes(r.fake)).toEqual([
      ["systemctl", "--user", "daemon-reload"],
      ["systemctl", "--user", "start", UNIT],
    ]);
    expect(mode(unitPath())).toBe(0o644);
    expect(readFileSync(unitPath(), "utf8")).toContain("KillMode=process");
    expect(lstatSync(wantsPath()).isSymbolicLink()).toBe(true);
    expect(readlinkSync(wantsPath())).toBe(`../${UNIT}`);
    expect(mode(bridgeLogPath(PROFILE))).toBe(0o600);
    expect(r.text).toContain("linger: no");
    expect(r.text).toContain(
      "run 'loginctl enable-linger tester' yourself to keep the service (and workers) alive after logout",
    );
    // Loom never runs enable-linger, never `systemctl enable`
    expect(r.fake.calls.some((c) => c.includes("enable-linger"))).toBe(false);
    expect(r.fake.calls.some((c) => c.includes("enable"))).toBe(false);
    expect(r.fake.calls).toContainEqual(["loginctl", "show-user", String(UID), "-p", "Linger"]);
  });

  test("linger yes → no hint", async () => {
    setup();
    const r = await run("install", "linux", makeFake({ linger: "yes" }));
    expect(r.code).toBe(0);
    expect(r.text).toContain("linger: yes");
    expect(r.text).not.toContain("enable-linger");
  });
});

// ---------------------------------------------------------------------------------------------
// install — reinstall (flow 6 · R52-M1 · R52-M2 · R7)
// ---------------------------------------------------------------------------------------------

for (const platform of PLATFORMS) {
  describe(`install — byte-identical reinstall (${platform})`, () => {
    test("identical + loaded + running → zero write verbs, unit untouched, exit 0", async () => {
      setup();
      const first = await run("install", platform, makeFake());
      expect(first.code).toBe(0);
      const before = readFileSync(target(platform), "utf8");
      const mtime = statSync(target(platform)).mtimeMs;
      const fake = makeFake({ loaded: true, running: true });
      writeStatus("running");
      const r = await run("install", platform, fake);
      expect(r.code).toBe(0);
      expect(writes(fake)).toEqual([]);
      expect(r.text).toContain(`already installed (up to date, pid ${SVC_PID})`);
      expect(readFileSync(target(platform), "utf8")).toBe(before);
      expect(statSync(target(platform)).mtimeMs).toBe(mtime);
    });

    test("identical + loaded + not running → no bootout/stop; start path (R52-M1)", async () => {
      setup();
      expect((await run("install", platform, makeFake())).code).toBe(0);
      writeStatus("stopped");
      const fake = makeFake({ loaded: true, running: false });
      const r = await run("install", platform, fake);
      expect(r.code).toBe(0);
      if (platform === "darwin") {
        expect(writes(fake)).toEqual([["launchctl", "kickstart", `gui/${UID}/${LABEL}`]]);
      } else {
        expect(writes(fake)).toEqual([["systemctl", "--user", "start", UNIT]]);
      }
      expect(fake.calls.some((c) => c.includes("-k"))).toBe(false);
      expect(fake.calls.some((c) => c.includes("bootout") || c.includes("stop"))).toBe(false);
    });

    test("identical + not loaded → no unit write; load only", async () => {
      setup();
      expect((await run("install", platform, makeFake())).code).toBe(0);
      const mtime = statSync(target(platform)).mtimeMs;
      const fake = makeFake({ loaded: false });
      const r = await run("install", platform, fake);
      expect(r.code).toBe(0);
      expect(statSync(target(platform)).mtimeMs).toBe(mtime);
      if (platform === "darwin") {
        expect(writes(fake)).toEqual([["launchctl", "bootstrap", `gui/${UID}`, plistPath()]]);
      } else {
        expect(writes(fake)).toEqual([
          ["systemctl", "--user", "daemon-reload"],
          ["systemctl", "--user", "start", UNIT],
        ]);
      }
    });
  });
}

describe("install — content differs (darwin)", () => {
  test("loaded + not running (after a yield) → bootout → print not-found poll → bootstrap → exit 0 (R52-M1·M2)", async () => {
    setup();
    writeTarget("darwin", foreignMarked("darwin", PROFILE));
    writeStatus("stopped");
    const fake = makeFake({ loaded: true, running: false, bootoutLingerPrints: 3 });
    const r = await run("install", "darwin", fake);
    expect(r.code).toBe(0);
    expect(writes(fake)).toEqual([
      ["launchctl", "bootout", `gui/${UID}/${LABEL}`],
      ["launchctl", "bootstrap", `gui/${UID}`, plistPath()],
    ]);
    // ≥ 4 prints between bootout and bootstrap: 3 still-listed + 1 not-found
    const iBootout = fake.calls.findIndex((c) => c[1] === "bootout");
    const iBootstrap = fake.calls.findIndex((c) => c[1] === "bootstrap");
    const between = fake.calls.slice(iBootout + 1, iBootstrap);
    expect(between.length).toBeGreaterThanOrEqual(4);
    expect(between.every((c) => c[1] === "print")).toBe(true);
    expect(r.text).not.toContain("will stop");
    expect(readFileSync(plistPath(), "utf8")).not.toContain("loom=0.33.9");
  });

  test("bootout poll exceeds 25 s → exit 1, old file byte-identical, no bootstrap (R52-M2)", async () => {
    setup();
    const old = foreignMarked("darwin", PROFILE);
    writeTarget("darwin", old);
    const fake = makeFake({ loaded: true, running: false, bootoutLingerPrints: 1_000_000 });
    const r = await run("install", "darwin", fake);
    expect(r.code).toBe(1);
    expect(r.text).toContain("bootout did not complete within 25 s");
    expect(readFileSync(plistPath(), "utf8")).toBe(old);
    expect(fake.calls.some((c) => c[1] === "bootstrap")).toBe(false);
    expect(r.elapsedMs).toBeGreaterThanOrEqual(25_000);
    expect(r.elapsedMs).toBeLessThan(30_000);
  });

  test("running with in-flight work → refused without --force (R7), nothing written", async () => {
    setup();
    const old = foreignMarked("darwin", PROFILE);
    writeTarget("darwin", old);
    writeStatus("running", SVC_PID, { paneCards: 1, convs: 0, headlessRunning: 1, headlessQueued: 3 });
    const fake = makeFake({ loaded: true, running: true });
    const r = await run("install", "darwin", fake);
    expect(r.code).toBe(1);
    expect(r.text).toContain("service bridge has 2 in-flight — loom bridge drain first, or --force");
    expect(writes(fake)).toEqual([]);
    expect(readFileSync(plistPath(), "utf8")).toBe(old);
  });

  test("running with in-flight work + --force → 'will stop' then bootout first", async () => {
    setup();
    writeTarget("darwin", foreignMarked("darwin", PROFILE));
    writeStatus("running", SVC_PID, { paneCards: 0, convs: 1, headlessRunning: 0, headlessQueued: 0 });
    const fake = makeFake({ loaded: true, running: true });
    const r = await run("install", "darwin", fake, { force: true });
    expect(r.code).toBe(0);
    expect(r.text).toContain(`will stop the running service bridge (pid ${SVC_PID})`);
    expect(writes(fake)[0]).toEqual(["launchctl", "bootout", `gui/${UID}/${LABEL}`]);
    expect(writes(fake)[1]).toEqual(["launchctl", "bootstrap", `gui/${UID}`, plistPath()]);
  });

  test("running with zero in-flight → 'will stop' line + bootout", async () => {
    setup();
    writeTarget("darwin", foreignMarked("darwin", PROFILE));
    writeStatus("running");
    const fake = makeFake({ loaded: true, running: true });
    const r = await run("install", "darwin", fake);
    expect(r.code).toBe(0);
    expect(r.text).toContain(`will stop the running service bridge (pid ${SVC_PID})`);
    expect(writes(fake).map((c) => c[1])).toEqual(["bootout", "bootstrap"]);
  });

  test("not loaded → write + bootstrap, no bootout", async () => {
    setup();
    writeTarget("darwin", foreignMarked("darwin", PROFILE));
    const fake = makeFake({ loaded: false });
    const r = await run("install", "darwin", fake);
    expect(r.code).toBe(0);
    expect(writes(fake)).toEqual([["launchctl", "bootstrap", `gui/${UID}`, plistPath()]]);
  });
});

describe("install — content differs (linux)", () => {
  test("loaded + running, 0 in-flight → 'will stop' + stop (synchronous, no poll) → daemon-reload → start", async () => {
    setup();
    writeTarget("linux", foreignMarked("linux", PROFILE));
    writeStatus("running");
    const fake = makeFake({ loaded: true, running: true });
    const r = await run("install", "linux", fake);
    expect(r.code).toBe(0);
    expect(r.text).toContain(`will stop the running service bridge (pid ${SVC_PID})`);
    expect(writes(fake)).toEqual([
      ["systemctl", "--user", "stop", UNIT],
      ["systemctl", "--user", "daemon-reload"],
      ["systemctl", "--user", "start", UNIT],
    ]);
  });

  test("in-flight > 0 → refused without --force", async () => {
    setup();
    writeTarget("linux", foreignMarked("linux", PROFILE));
    writeStatus("running", SVC_PID, { paneCards: 0, convs: 0, headlessRunning: 3, headlessQueued: 0 });
    const fake = makeFake({ loaded: true, running: true });
    const r = await run("install", "linux", fake);
    expect(r.code).toBe(1);
    expect(r.text).toContain("service bridge has 3 in-flight");
    expect(writes(fake)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// install — runner result classification (R10 · R52-L2)
// ---------------------------------------------------------------------------------------------

describe("install — load result classification", () => {
  test("darwin no_domain (EIO stderr) → file left, 'written; loads at next login', exit 3", async () => {
    setup();
    const fake = makeFake();
    fake.override.set("launchctl bootstrap", () => fail(5, "Bootstrap failed: 5: Input/output error"));
    fake.override.set("launchctl print", () =>
      fail(113, `Could not find service "${LABEL}" in domain for user gui: ${UID}`),
    );
    const r = await run("install", "darwin", fake);
    expect(r.code).toBe(3);
    expect(r.text).toContain(`written; loads at next login (${plistPath()})`);
    expect(existsSync(plistPath())).toBe(true);
  });

  test("linux no_bus → file + symlink left, exit 3", async () => {
    setup();
    const fake = makeFake();
    const noBus = () => fail(1, "Failed to connect to bus: No medium found");
    fake.override.set("systemctl show", noBus);
    fake.override.set("systemctl daemon-reload", noBus);
    fake.override.set("systemctl start", noBus);
    fake.override.set("loginctl show-user", () => fail(1, "Failed to connect to bus"));
    const r = await run("install", "linux", fake);
    expect(r.code).toBe(3);
    expect(r.text).toContain(`written; loads at next login (${unitPath()})`);
    expect(existsSync(unitPath())).toBe(true);
    expect(lstatSync(wantsPath()).isSymbolicLink()).toBe(true);
  });

  test("darwin code 5 with no stderr → exit 1 (code alone is not no_domain)", async () => {
    setup();
    const fake = makeFake();
    fake.override.set("launchctl bootstrap", () => fail(5, ""));
    const r = await run("install", "darwin", fake);
    expect(r.code).toBe(1);
    expect(r.text).toMatch(/code 5/);
    expect(r.text).not.toContain("loads at next login");
    expect(existsSync(plistPath())).toBe(true);
  });

  test("linux code 125 with no stderr → exit 1", async () => {
    setup();
    const fake = makeFake();
    fake.override.set("systemctl start", () => fail(125, ""));
    const r = await run("install", "linux", fake);
    expect(r.code).toBe(1);
    expect(r.text).toMatch(/code 125/);
    expect(r.text).not.toContain("loads at next login");
  });

  test("unclassified failure → exit 1 with the runner's stderr", async () => {
    setup();
    const fake = makeFake();
    fake.override.set("launchctl bootstrap", () => fail(37, "Bootstrap failed: 37: Operation already in progress"));
    const r = await run("install", "darwin", fake);
    expect(r.code).toBe(1);
    expect(r.text).toContain("Operation already in progress");
  });

  test("darwin disabled → exit 1 with Login Items wording", async () => {
    setup();
    const fake = makeFake();
    fake.override.set("launchctl bootstrap", () => fail(119, "Bootstrap failed: 119: Service is disabled"));
    const r = await run("install", "darwin", fake);
    expect(r.code).toBe(1);
    expect(r.text).toContain(
      "disabled in Login Items / launchctl — enable it in System Settings → General → Login Items",
    );
    expect(fake.calls.some((c) => c[1] === "enable")).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// uninstall
// ---------------------------------------------------------------------------------------------

for (const platform of PLATFORMS) {
  describe(`uninstall (${platform})`, () => {
    test("not installed → 'not installed', exit 0, no writes", async () => {
      setup();
      const fake = makeFake();
      const r = await run("uninstall", platform, fake);
      expect(r.code).toBe(0);
      expect(r.text).toContain("not installed");
      expect(writes(fake)).toEqual([]);
    });

    test("non-Loom file → refused, exit 1, file kept", async () => {
      setup();
      writeTarget(platform, "someone else's\n");
      const fake = makeFake();
      const r = await run("uninstall", platform, fake);
      expect(r.code).toBe(1);
      expect(r.text).toContain("is not a Loom service file — not touching it");
      expect(readFileSync(target(platform), "utf8")).toBe("someone else's\n");
      expect(writes(fake)).toEqual([]);
    });

    test("running with in-flight → refused without --force; --force proceeds (R7)", async () => {
      setup();
      expect((await run("install", platform, makeFake())).code).toBe(0);
      writeStatus("running", SVC_PID, { paneCards: 2, convs: 0, headlessRunning: 0, headlessQueued: 0 });
      const fake = makeFake({ loaded: true, running: true });
      const r = await run("uninstall", platform, fake);
      expect(r.code).toBe(1);
      expect(r.text).toContain("service bridge has 2 in-flight — loom bridge drain first, or --force");
      expect(writes(fake)).toEqual([]);
      expect(existsSync(target(platform))).toBe(true);
      const fake2 = makeFake({ loaded: true, running: true });
      const r2 = await run("uninstall", platform, fake2, { force: true });
      expect(r2.code).toBe(0);
      expect(r2.text).toContain(`will stop the running service bridge (pid ${SVC_PID})`);
      expect(existsSync(target(platform))).toBe(false);
    });
  });
}

describe("uninstall (darwin)", () => {
  test("loaded → bootout (while the file still exists) → file deleted, exit 0", async () => {
    setup();
    expect((await run("install", "darwin", makeFake())).code).toBe(0);
    const fake = makeFake({ loaded: true, running: false });
    const seen: { fileAtBootout: boolean | null } = { fileAtBootout: null };
    fake.override.set("launchctl bootout", () => {
      seen.fileAtBootout = existsSync(plistPath());
      fake.state.loaded = false;
      return undefined;
    });
    const r = await run("uninstall", "darwin", fake);
    expect(r.code).toBe(0);
    expect(seen.fileAtBootout).toBe(true);
    expect(writes(fake)).toEqual([["launchctl", "bootout", `gui/${UID}/${LABEL}`]]);
    expect(existsSync(plistPath())).toBe(false);
  });

  test("not loaded → no bootout, file deleted", async () => {
    setup();
    expect((await run("install", "darwin", makeFake())).code).toBe(0);
    const fake = makeFake({ loaded: false });
    const r = await run("uninstall", "darwin", fake);
    expect(r.code).toBe(0);
    expect(writes(fake)).toEqual([]);
    expect(existsSync(plistPath())).toBe(false);
  });
});

describe("uninstall (linux)", () => {
  test("bus → stop, symlink + unit deleted, daemon-reload; never `disable`", async () => {
    setup();
    expect((await run("install", "linux", makeFake())).code).toBe(0);
    writeStatus("stopped");
    const fake = makeFake({ loaded: true, running: false });
    const r = await run("uninstall", "linux", fake);
    expect(r.code).toBe(0);
    expect(writes(fake)).toEqual([
      ["systemctl", "--user", "stop", UNIT],
      ["systemctl", "--user", "daemon-reload"],
    ]);
    expect(existsSync(unitPath())).toBe(false);
    expect(existsSync(wantsPath())).toBe(false);
    expect(() => lstatSync(wantsPath())).toThrow();
    expect(fake.calls.some((c) => c.includes("disable"))).toBe(false);
  });

  test("no bus → files deleted, 'stops at logout' message, exit 0", async () => {
    setup();
    expect((await run("install", "linux", makeFake())).code).toBe(0);
    const fake = makeFake();
    const noBus = () => fail(1, "Failed to connect to bus: No medium found");
    fake.override.set("systemctl show", noBus);
    fake.override.set("systemctl stop", noBus);
    fake.override.set("systemctl daemon-reload", noBus);
    const r = await run("uninstall", "linux", fake);
    expect(r.code).toBe(0);
    expect(r.text).toContain("removed; the running service (if any) stops at logout");
    expect(existsSync(unitPath())).toBe(false);
    expect(() => lstatSync(wantsPath())).toThrow();
  });
});

// ---------------------------------------------------------------------------------------------
// start (R14)
// ---------------------------------------------------------------------------------------------

for (const platform of PLATFORMS) {
  describe(`start (${platform})`, () => {
    test("not installed → exit 1", async () => {
      setup();
      const fake = makeFake();
      const r = await run("start", platform, fake);
      expect(r.code).toBe(1);
      expect(r.text).toContain("not installed");
      expect(writes(fake)).toEqual([]);
    });

    test("human-run bridge holds the lock → exit 1", async () => {
      setup();
      expect((await run("install", platform, makeFake())).code).toBe(0);
      const fake = makeFake({ loaded: true, running: false });
      const r = await run("start", platform, fake, {}, { inspectLock: humanLock });
      expect(r.code).toBe(1);
      expect(r.text).toContain("bridge pid 999 runs outside the service — loom bridge stop first");
      expect(writes(fake)).toEqual([]);
    });

    test("already running → 'already running (pid N)', exit 0, no write verb", async () => {
      setup();
      expect((await run("install", platform, makeFake())).code).toBe(0);
      writeStatus("running");
      const fake = makeFake({ loaded: true, running: true });
      const r = await run("start", platform, fake, {}, {
        inspectLock: () => ({ kind: "held", pid: SVC_PID, startedAt: "", verified: true }),
      });
      expect(r.code).toBe(0);
      expect(r.text).toContain(`already running (pid ${SVC_PID})`);
      expect(writes(fake)).toEqual([]);
    });

    test("status file never turns running within 12 s → exit 1", async () => {
      setup();
      expect((await run("install", platform, makeFake())).code).toBe(0);
      writeStatus("stopped");
      const fake = makeFake({ loaded: true, running: false, writesStatus: false });
      const r = await run("start", platform, fake);
      expect(r.code).toBe(1);
      expect(r.elapsedMs).toBeGreaterThanOrEqual(12_000);
      expect(r.elapsedMs).toBeLessThan(20_000);
    });
  });
}

describe("start (darwin)", () => {
  test("loaded, not running → kickstart WITHOUT -k → exit 0", async () => {
    setup();
    expect((await run("install", "darwin", makeFake())).code).toBe(0);
    writeStatus("stopped");
    const fake = makeFake({ loaded: true, running: false });
    const r = await run("start", "darwin", fake);
    expect(r.code).toBe(0);
    expect(writes(fake)).toEqual([["launchctl", "kickstart", `gui/${UID}/${LABEL}`]]);
    for (const c of fake.calls) expect(c).not.toContain("-k");
    expect(fake.calls.some((c) => c.join(" ").includes("-k"))).toBe(false);
  });

  test("not loaded → bootstrap → exit 0", async () => {
    setup();
    expect((await run("install", "darwin", makeFake())).code).toBe(0);
    writeStatus("stopped");
    const fake = makeFake({ loaded: false });
    const r = await run("start", "darwin", fake);
    expect(r.code).toBe(0);
    expect(writes(fake)).toEqual([["launchctl", "bootstrap", `gui/${UID}`, plistPath()]]);
  });

  test("disabled (print-disabled) → exit 1 with Login Items wording; Loom never enables", async () => {
    setup();
    expect((await run("install", "darwin", makeFake())).code).toBe(0);
    const fake = makeFake({ loaded: true, running: false, disabled: true });
    const r = await run("start", "darwin", fake);
    expect(r.code).toBe(1);
    expect(r.text).toContain(
      "disabled in Login Items / launchctl — enable it in System Settings → General → Login Items",
    );
    expect(writes(fake)).toEqual([]);
  });

  test("no GUI domain → exit 3", async () => {
    setup();
    expect((await run("install", "darwin", makeFake())).code).toBe(0);
    const fake = makeFake({ loaded: false });
    fake.override.set("launchctl print", () => fail(5, "Could not find domain for user gui: 501"));
    fake.override.set("launchctl print-disabled", () => fail(5, "Could not find domain for user gui: 501"));
    fake.override.set("launchctl bootstrap", () => fail(5, "Bootstrap failed: 5: Input/output error"));
    const r = await run("start", "darwin", fake);
    expect(r.code).toBe(3);
    expect(r.text).toContain("loads at next login");
  });
});

describe("start (linux)", () => {
  test("loaded, inactive → systemctl --user start → exit 0", async () => {
    setup();
    expect((await run("install", "linux", makeFake())).code).toBe(0);
    writeStatus("stopped");
    const fake = makeFake({ loaded: true, running: false });
    const r = await run("start", "linux", fake);
    expect(r.code).toBe(0);
    expect(writes(fake)).toEqual([["systemctl", "--user", "start", UNIT]]);
  });

  test("no bus → exit 3", async () => {
    setup();
    expect((await run("install", "linux", makeFake())).code).toBe(0);
    const fake = makeFake();
    const noBus = () => fail(1, "Failed to connect to bus: No medium found");
    fake.override.set("systemctl show", noBus);
    fake.override.set("systemctl daemon-reload", noBus);
    fake.override.set("systemctl start", noBus);
    const r = await run("start", "linux", fake);
    expect(r.code).toBe(3);
  });
});

// ---------------------------------------------------------------------------------------------
// status — always exit 0 (R6)
// ---------------------------------------------------------------------------------------------

for (const platform of PLATFORMS) {
  describe(`status (${platform})`, () => {
    test("not installed → exit 0", async () => {
      setup();
      const r = await run("status", platform, makeFake());
      expect(r.code).toBe(0);
      expect(r.text).toContain("not installed");
    });

    test("installed + running → exit 0 with pid, only read verbs", async () => {
      setup();
      expect((await run("install", platform, makeFake())).code).toBe(0);
      const fake = makeFake({ loaded: true, running: true });
      const r = await run("status", platform, fake);
      expect(r.code).toBe(0);
      expect(r.text).toContain(String(SVC_PID));
      expect(writes(fake)).toEqual([]);
    });

    test("runner failing → still exit 0", async () => {
      setup();
      expect((await run("install", platform, makeFake())).code).toBe(0);
      const fake = makeFake();
      fake.override.set("launchctl print", () => fail(5, ""));
      fake.override.set("systemctl show", () => fail(1, "Failed to connect to bus"));
      fake.override.set("loginctl show-user", () => fail(1, ""));
      const r = await run("status", platform, fake);
      expect(r.code).toBe(0);
    });

    test("non-Loom file → exit 0", async () => {
      setup();
      writeTarget(platform, "foreign\n");
      const r = await run("status", platform, makeFake());
      expect(r.code).toBe(0);
      expect(r.text).toContain("not a Loom service file");
    });
  });
}

test("status with a D8-rejected profile → exit 0", async () => {
  writeSession({}, "a b");
  const r = await run("status", "darwin", makeFake(), { profile: "a b" });
  expect(r.code).toBe(0);
  expect(r.text).toContain("maps to different file names");
});

test("unknown verb → exit 1 (usage)", async () => {
  setup();
  const r = await run("restart", "darwin", makeFake());
  expect(r.code).toBe(1);
  expect(r.text).toContain("loom service install|uninstall|start|status");
  expect(r.fake.calls).toEqual([]);
});

// ---------------------------------------------------------------------------------------------
// profile resolution (R13) · APFS case folding (P1-L5)
// ---------------------------------------------------------------------------------------------

describe("profile name (R13)", () => {
  test("no --profile → resolveBridgeProfile(): empty displayName → 'default'", async () => {
    mkdirSync(loomHome(), { recursive: true });
    writeFileSync(
      join(loomHome(), "session.json"),
      JSON.stringify({
        relayUrl: "wss://relay.example.com:7842/ws",
        relayToken: "tok-SECRET-123",
        roomId: "r_1",
        peerId: "p_node",
        displayName: "",
      }),
      { mode: 0o600 },
    );
    writeBridgeConfig({}, "default");
    expect(resolveBridgeProfile()).toBe("default");
    // the fake writes the status file for "work", so the start poll may time out — the name is the point
    const r = await run("install", "darwin", makeFake(), { profile: undefined });
    expect([0, 1]).toContain(r.code);
    expect(existsSync(join(home, "Library/LaunchAgents", "com.loom.bridge.default.plist"))).toBe(true);
    expect(existsSync(join(home, "Library/LaunchAgents", "com.loom.bridge..plist"))).toBe(false);
    expect(readFileSync(join(home, "Library/LaunchAgents", "com.loom.bridge.default.plist"), "utf8")).toContain(
      "profile=default ",
    );
  });

  test("index.ts: no `getActiveProfile() ?? loadSession()` profile derivation left; resolveBridgeProfile() used", () => {
    const src = readFileSync(join(import.meta.dir, "index.ts"), "utf8");
    expect(src).not.toMatch(/getActiveProfile\(\)\s*\?\?\s*loadSession\(\)/);
    expect((src.match(/resolveBridgeProfile\(\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

test("darwin case-insensitive home: 'Work' after 'work' is refused as a foreign file (P1-L5)", async () => {
  setup();
  expect((await run("install", "darwin", makeFake())).code).toBe(0);
  writeSession({}, "Work");
  writeBridgeConfig({}, "Work");
  const caseInsensitive = existsSync(join(home, "Library/LaunchAgents", "com.loom.bridge.WORK.plist"));
  const r = await run("install", "darwin", makeFake(), { profile: "Work" });
  if (caseInsensitive) {
    expect(r.code).toBe(1);
    expect(r.text).toContain("is not a Loom service file");
    expect(readFileSync(plistPath(), "utf8")).toContain("profile=work ");
  } else {
    expect(readFileSync(plistPath(), "utf8")).toContain("profile=work ");
  }
});

// ---------------------------------------------------------------------------------------------
// R9 static proof: the only real-runner path is guarded
// ---------------------------------------------------------------------------------------------

test("service.ts: real runner refuses under LOOM_TEST_HOME and spawns only launchctl/systemctl/loginctl", () => {
  const src = readFileSync(join(import.meta.dir, "service.ts"), "utf8");
  expect(src).toContain("LOOM_TEST_HOME set — refusing to call the real service manager");
  expect(src).not.toMatch(/enable-linger"/);
  expect(src).not.toMatch(/"-k"/);
  // tests in this file never hand the CLI module a real runner except under LOOM_TEST_HOME (R9)
  expect(bridgeConfigPath(PROFILE).startsWith(home)).toBe(true);
});
