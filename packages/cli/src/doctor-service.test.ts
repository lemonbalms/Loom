/**
 * PLAN 0.34.0 P4 — doctor Service section (D7 · ③ rows · R11 · R12) shared with `loom service status`.
 * Done-when (g)(h): every ③ row × ok/warn/info from fixed inputs · not installed → one info line ·
 * runner failure / >2 s → that row `info unknown` · zero `fail` · doctorExitCode unchanged · runner
 * verbs ⊆ {print, print-disabled, show, show-user} · yielded row · outside-service row · PATH drift ·
 * srcPath three-way compare · log 0644 → warn.
 *
 * No test reaches launchctl/systemctl/loginctl: the gatherer gets a FAKE runner; the CLI tests run
 * under LOOM_TEST_HOME where the real runner refuses (R9) — a fake launchctl/systemctl/loginctl on
 * PATH proves nothing is spawned.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type BridgeLockInspection,
  renderLaunchdPlist,
  renderSystemdUnit,
  resetActiveProfile,
  resetStateHomeDirCache,
  type ServiceRunnerResult,
  serviceTargetPaths,
} from "@loom/host";
import {
  type DoctorSection,
  doctorExitCode,
  type ServiceInstalledInput,
  type ServiceSectionInput,
  serviceSection,
  summarizeDoctor,
} from "./doctor";
import {
  gatherServiceInput,
  runServiceCommand,
  SERVICE_READ_VERBS,
  type ServiceProbeDeps,
  serviceDoctorSection,
} from "./service";

const READ_VERBS = new Set(["print", "print-disabled", "show", "show-user"]);
const SVC_PID = 4242;
const HUMAN_PID = 7777;
const PROFILE = "work";
const BRIDGE_MAIN = join(import.meta.dir, "../../host/src/bridge-main.ts");

function verbOf(argv: string[]): string {
  if (argv[0] === "systemctl") return argv[1] === "--user" ? argv[2]! : argv[1]!;
  return argv[1]!;
}

function text(s: DoctorSection): string {
  return s.lines.map((l) => `${l.status} ${l.message}`).join("\n");
}

function noFail(s: DoctorSection): void {
  expect(s.lines.filter((l) => l.status === "fail")).toEqual([]);
  expect(summarizeDoctor([s]).fail).toBe(0);
}

/** doctorExitCode is unchanged by adding the Service section — with and without another fail. */
function exitUnchanged(s: DoctorSection): void {
  const clean: DoctorSection = { title: "X", lines: [{ status: "ok", message: "x" }] };
  const failing: DoctorSection = { title: "Y", lines: [{ status: "fail", message: "y" }] };
  expect(doctorExitCode([clean, s])).toBe(doctorExitCode([clean]));
  expect(doctorExitCode([failing, s])).toBe(doctorExitCode([failing]));
}

// ---------------------------------------------------------------------------------------------
// A. Pure builder — fixed-input table (③ rows)
// ---------------------------------------------------------------------------------------------

function base(over: Partial<ServiceInstalledInput> = {}): ServiceInstalledInput {
  return {
    kind: "installed",
    manager: "launchd",
    name: "com.loom.bridge.work",
    unitPath: "/h/Library/LaunchAgents/com.loom.bridge.work.plist",
    loomVersion: "0.34.0",
    state: {
      ok: true,
      value: { loaded: true, running: true, mainPid: SVC_PID, lastExit: null, unitFileState: null },
    },
    disabled: { ok: true, value: false },
    unit: { execPath: "/opt/bun", bridgeMainPath: "/src/bridge-main.ts", path: "/usr/bin:/bin" },
    execPathExists: true,
    bridgeMainExists: true,
    currentPath: "/usr/bin:/bin",
    unresolvedAgentBins: [],
    cliBridgeMainPath: "/src/bridge-main.ts",
    statusSrcPath: "/src/bridge-main.ts",
    log: { path: "/h/.loom/bridge/work.stderr.log", mode: 0o600 },
    loopbackRelay: false,
    lockHolderPid: SVC_PID,
    statusPid: SVC_PID,
    statusPidAlive: true,
    ...over,
  };
}

function systemdBase(over: Partial<ServiceInstalledInput> = {}): ServiceInstalledInput {
  return base({
    manager: "systemd",
    name: "loom-bridge-work.service",
    unitPath: "/h/.config/systemd/user/loom-bridge-work.service",
    state: {
      ok: true,
      value: {
        loaded: true,
        running: true,
        mainPid: SVC_PID,
        lastExit: 0,
        unitFileState: "enabled",
      },
    },
    disabled: undefined,
    linger: { ok: true, value: "yes" },
    ...over,
  });
}

const notRunning = (lastExit: number | null = 0, unitFileState: string | null = null) => ({
  ok: true as const,
  value: { loaded: true, running: false, mainPid: null, lastExit, unitFileState },
});
const notLoaded = {
  ok: true as const,
  value: { loaded: false, running: false, mainPid: null, lastExit: null, unitFileState: null },
};
const unknown = (reason = "service manager did not answer within 2 s") => ({
  ok: false as const,
  reason,
});

describe("serviceSection — pure ③ table", () => {
  test("title is Service; healthy launchd install → ok lines only, no warn", () => {
    const s = serviceSection(base());
    expect(s.title).toBe("Service");
    noFail(s);
    expect(s.lines.filter((l) => l.status === "warn")).toEqual([]);
    const t = text(s);
    expect(t).toMatch(/^ok installed: com\.loom\.bridge\.work \(/m);
    expect(t).toContain(`ok running pid ${SVC_PID}`);
    expect(t).toMatch(/^ok .*bun.*bridge-main\.ts/m);
    expect(t).toContain("ok unit PATH matches the current PATH");
    expect(t).toMatch(/^ok srcPath: unit == CLI == status file/m);
    expect(t).toMatch(/^ok log mode 0600/m);
    exitUnchanged(s);
  });

  test("healthy systemd install → ok incl. linger yes", () => {
    const s = serviceSection(systemdBase());
    noFail(s);
    expect(s.lines.filter((l) => l.status === "warn")).toEqual([]);
    expect(text(s)).toContain("ok linger: yes");
  });

  test("row order follows ③ (installed · loaded/running · disabled · paths · PATH · srcPath · log · linger · loopback · yield)", () => {
    const s = serviceSection(
      systemdBase({
        loopbackRelay: true,
        state: notRunning(1, "enabled"),
        lockHolderPid: HUMAN_PID,
        statusPid: HUMAN_PID,
      }),
    );
    const t = text(s);
    const idx = [
      t.indexOf("installed:"),
      t.indexOf("loaded, not running"),
      t.indexOf("bridge-main.ts"),
      t.indexOf("unit PATH"),
      t.indexOf("srcPath"),
      t.indexOf("log mode"),
      t.indexOf("linger"),
      t.indexOf("loopback"),
      t.indexOf("yielded"),
    ];
    for (const i of idx) expect(i).toBeGreaterThanOrEqual(0);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  });

  test("not installed → exactly one info line", () => {
    const s = serviceSection({
      kind: "not-installed",
      name: "com.loom.bridge.work",
      unitPath: "/h/Library/LaunchAgents/com.loom.bridge.work.plist",
    });
    expect(s.lines).toHaveLength(1);
    expect(s.lines[0]!.status).toBe("info");
    expect(s.lines[0]!.message).toContain("not installed");
    exitUnchanged(s);
  });

  test("non-Loom file at the path → one warn line, section ends", () => {
    const s = serviceSection({
      kind: "foreign",
      name: "com.loom.bridge.work",
      unitPath: "/h/Library/LaunchAgents/com.loom.bridge.work.plist",
    });
    expect(s.lines).toHaveLength(1);
    expect(s.lines[0]!.status).toBe("warn");
    expect(s.lines[0]!.message).toContain("not a Loom service file");
    exitUnchanged(s);
  });

  test("unsupported platform / D8-rejected name → one info line", () => {
    for (const input of [
      { kind: "unsupported", platform: "win32" },
      { kind: "invalid-name", message: 'profile name "a b" maps to different file names' },
    ] as ServiceSectionInput[]) {
      const s = serviceSection(input);
      expect(s.lines).toHaveLength(1);
      expect(s.lines[0]!.status).toBe("info");
      exitUnchanged(s);
    }
  });

  // [row, input, expected status, message pattern]
  const table: Array<[string, ServiceInstalledInput, "ok" | "warn" | "info", RegExp]> = [
    // loaded / running
    ["running → ok pid", base(), "ok", new RegExp(`running pid ${SVC_PID}`)],
    ["launchd not loaded → warn", base({ state: notLoaded }), "warn", /installed but not loaded/],
    [
      "loaded · not running → info with last exit code",
      base({ state: notRunning(78) }),
      "info",
      /loaded, not running \(last exit code 78\)/,
    ],
    [
      "systemd LoadState≠loaded → warn",
      systemdBase({ state: notLoaded }),
      "warn",
      /installed but not loaded/,
    ],
    [
      "systemd UnitFileState≠enabled (not running) → warn",
      systemdBase({ state: notRunning(0, "disabled") }),
      "warn",
      /installed but not loaded.*UnitFileState=disabled/,
    ],
    [
      "systemd loaded + enabled + not running → info",
      systemdBase({ state: notRunning(1, "enabled") }),
      "info",
      /loaded, not running \(last exit code 1\)/,
    ],
    ["state query failed → info unknown", base({ state: unknown() }), "info", /unknown/],
    // disabled (launchd)
    [
      "print-disabled disabled → warn Login Items",
      base({ disabled: { ok: true, value: true } }),
      "warn",
      /disabled in Login Items/,
    ],
    ["print-disabled failed → info unknown", base({ disabled: unknown() }), "info", /Login Items: unknown/],
    // paths
    ["bun + bridge-main exist → ok", base(), "ok", /bun and bridge-main\.ts exist/],
    [
      "bun missing → warn re-run install",
      base({ execPathExists: false }),
      "warn",
      /missing: .*\/opt\/bun.*re-run loom service install/,
    ],
    [
      "bridge-main missing → warn re-run install",
      base({ bridgeMainExists: false }),
      "warn",
      /missing: .*bridge-main\.ts.*re-run loom service install/,
    ],
    // PATH drift
    ["unit PATH == current → ok", base(), "ok", /unit PATH matches the current PATH/],
    [
      "unit PATH ≠ current, bins resolve → info",
      base({ currentPath: "/opt/homebrew/bin:/usr/bin:/bin" }),
      "info",
      /unit PATH differs from the current PATH/,
    ],
    [
      "agent binary not resolvable via unit PATH → warn (even if PATH equal)",
      base({ unresolvedAgentBins: ["codex", "grok"] }),
      "warn",
      /agent binaries not resolvable via the unit PATH: codex, grok/,
    ],
    // srcPath (R11)
    ["three equal → ok", base(), "ok", /srcPath: unit == CLI == status file/],
    [
      "unit ≠ CLI → warn",
      base({ cliBridgeMainPath: "/new/src/bridge-main.ts" }),
      "warn",
      /srcPath mismatch.*\/src\/bridge-main\.ts.*\/new\/src\/bridge-main\.ts.*re-run loom service install/,
    ],
    [
      "status file srcPath ≠ unit → warn",
      base({ statusSrcPath: "/old/src/bridge-main.ts" }),
      "warn",
      /srcPath mismatch.*\/old\/src\/bridge-main\.ts/,
    ],
    [
      "no status file yet, unit == CLI → info",
      base({ statusSrcPath: null }),
      "info",
      /srcPath: .*status file/,
    ],
    // log mode
    ["log 0600 → ok", base(), "ok", /log mode 0600/],
    ["log 0644 → warn", base({ log: { path: "/h/l", mode: 0o644 } }), "warn", /log mode 0644/],
    ["log missing → info", base({ log: { path: "/h/l", mode: null } }), "info", /log not created yet/],
    // linger (systemd)
    ["linger yes → ok", systemdBase(), "ok", /linger: yes/],
    [
      "linger no → warn (logout kills workers)",
      systemdBase({ linger: { ok: true, value: "no" } }),
      "warn",
      /linger: no — logout stops the service and kills its workers/,
    ],
    ["linger query failed → info unknown", systemdBase({ linger: unknown() }), "info", /linger: unknown/],
    // loopback relay
    [
      "session relay loopback → warn",
      base({ loopbackRelay: true }),
      "warn",
      /relay is loopback/,
    ],
    // yielded / outside the service (D3 · D7)
    [
      "loaded + not running + live lock holder ≠ main pid → yielded warn with recovery",
      base({ state: notRunning(0), lockHolderPid: HUMAN_PID, statusPid: HUMAN_PID }),
      "warn",
      new RegExp(
        `service yielded to bridge pid ${HUMAN_PID} — loom bridge stop, then loom service start`,
      ),
    ],
    [
      "service not running (not loaded) + meta pid alive ≠ main pid → outside warn",
      base({ state: notLoaded, lockHolderPid: HUMAN_PID, statusPid: HUMAN_PID }),
      "warn",
      new RegExp(`bridge pid ${HUMAN_PID} runs outside the service`),
    ],
    [
      "state unknown + live bridge pid → yield/outside info unknown",
      base({ state: unknown(), lockHolderPid: HUMAN_PID, statusPid: HUMAN_PID }),
      "info",
      /outside.*unknown/,
    ],
  ];

  for (const [name, input, status, re] of table) {
    test(`${name}`, () => {
      const s = serviceSection(input);
      const hit = s.lines.filter((l) => re.test(l.message));
      expect(hit.length).toBeGreaterThanOrEqual(1);
      expect(hit.every((l) => l.status === status)).toBe(true);
      noFail(s);
      exitUnchanged(s);
    });
  }

  test("yield row needs a live holder ≠ main pid: holder == main pid → no yield / outside line", () => {
    const t = text(serviceSection(base()));
    expect(t).not.toContain("yielded");
    expect(t).not.toContain("outside the service");
  });

  test("dead meta pid and no holder → no outside line", () => {
    const t = text(
      serviceSection(
        base({ state: notLoaded, lockHolderPid: null, statusPid: HUMAN_PID, statusPidAlive: false }),
      ),
    );
    expect(t).not.toContain("outside the service");
    expect(t).not.toContain("yielded");
  });

  test("every runner-backed row unknown at once → infos, zero warn from them, zero fail", () => {
    const s = serviceSection(
      systemdBase({ state: unknown("x"), linger: unknown("x"), lockHolderPid: null, statusPid: null }),
    );
    noFail(s);
    const unknownLines = s.lines.filter((l) => /unknown/.test(l.message));
    expect(unknownLines.length).toBeGreaterThanOrEqual(2);
    expect(unknownLines.every((l) => l.status === "info")).toBe(true);
  });

  test("zero fail across every table input (sweep)", () => {
    for (const [, input] of table) noFail(serviceSection(input));
  });
});

// ---------------------------------------------------------------------------------------------
// B. Gatherer — fake runner + temp home (read verbs only · 2 s bound · unknown on failure)
// ---------------------------------------------------------------------------------------------

type Res = ServiceRunnerResult;
const ok = (stdout = ""): Res => ({ code: 0, stdout, stderr: "" });
const failRes = (code: number, stderr = ""): Res => ({ code, stdout: "", stderr });

let home: string;
const SAVED = ["LOOM_TEST_HOME", "LOOM_SESSION", "LOOM_PROFILE"] as const;
const saved = new Map<string, string | undefined>();

beforeEach(() => {
  for (const k of SAVED) saved.set(k, process.env[k]);
  for (const k of SAVED) delete process.env[k];
  home = mkdtempSync(join(tmpdir(), "loom-docsvc-"));
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

const bridgeDir = () => join(home, ".loom", "bridge");
const logPath = () => join(bridgeDir(), `${PROFILE}.stderr.log`);

/** A bin dir holding executable stubs for the given names. */
function binDir(names: string[]): string {
  const dir = join(home, `bin-${names.join("-") || "none"}`);
  mkdirSync(dir, { recursive: true });
  for (const n of names) {
    writeFileSync(join(dir, n), "#!/bin/sh\nexit 0\n");
    chmodSync(join(dir, n), 0o755);
  }
  return dir;
}

function writeWorker(worker: Record<string, unknown>): void {
  mkdirSync(bridgeDir(), { recursive: true });
  writeFileSync(
    join(bridgeDir(), `${PROFILE}.json`),
    JSON.stringify({ authorizedDispatchers: ["p_tower"], worker }),
  );
}

function installUnit(
  platform: "darwin" | "linux",
  over: { path?: string; bridgeMainPath?: string; execPath?: string; logMode?: number | null } = {},
): string {
  const target = serviceTargetPaths(home, PROFILE, platform);
  const spec = {
    profile: PROFILE,
    execPath: over.execPath ?? process.execPath,
    bridgeMainPath: over.bridgeMainPath ?? BRIDGE_MAIN,
    home,
    path: over.path ?? binDir(["claude", "codex", "grok"]),
    sessionPath: join(home, ".loom", "profiles", `${PROFILE}.json`),
    logPath: logPath(),
    loomVersion: "0.34.0",
  };
  const text = platform === "darwin" ? renderLaunchdPlist(spec) : renderSystemdUnit(spec);
  mkdirSync(join(target.unitPath, ".."), { recursive: true });
  writeFileSync(target.unitPath, text, { mode: 0o644 });
  const mode = over.logMode === undefined ? 0o600 : over.logMode;
  if (mode !== null) {
    mkdirSync(bridgeDir(), { recursive: true });
    writeFileSync(logPath(), "", { mode });
    chmodSync(logPath(), mode);
  }
  return spec.path;
}

function writeStatusFile(pid: number, srcPath = BRIDGE_MAIN): void {
  mkdirSync(bridgeDir(), { recursive: true });
  const now = new Date().toISOString();
  writeFileSync(
    join(bridgeDir(), `${PROFILE}.status.json`),
    JSON.stringify({
      v: 1,
      pid,
      version: "0.34.0",
      srcPath,
      profile: PROFILE,
      startedAt: now,
      heartbeatAt: now,
      state: "running",
      inFlight: { paneCards: 0, convs: 0, headlessRunning: 0, headlessQueued: 0 },
      herdr: "skipped",
    }),
  );
}

type Script = {
  loaded: boolean;
  running: boolean;
  disabled: boolean;
  linger: "yes" | "no";
  /** per-verb override. */
  override?: Partial<Record<string, (argv: string[]) => Promise<Res> | Res>>;
};

function fakeRunner(init: Partial<Script> = {}) {
  const st: Script = { loaded: true, running: true, disabled: false, linger: "yes", ...init };
  const calls: string[][] = [];
  const runner = async (argv: string[]): Promise<Res> => {
    calls.push([...argv]);
    const verb = verbOf(argv);
    const o = st.override?.[`${argv[0]} ${verb}`];
    if (o) return o(argv);
    if (argv[0] === "launchctl" && verb === "print") {
      if (!st.loaded) {
        return failRes(113, `Could not find service "com.loom.bridge.${PROFILE}" in domain for user gui: 501`);
      }
      return ok(
        [
          `gui/501/com.loom.bridge.${PROFILE} = {`,
          `\tstate = ${st.running ? "running" : "not running"}`,
          ...(st.running ? [`\tpid = ${SVC_PID}`] : ["\tlast exit code = 0"]),
          "}",
          "",
        ].join("\n"),
      );
    }
    if (argv[0] === "launchctl" && verb === "print-disabled") {
      return ok(
        `disabled services = {\n\t"com.loom.bridge.${PROFILE}" => ${st.disabled ? "disabled" : "enabled"}\n}\n`,
      );
    }
    if (argv[0] === "systemctl" && verb === "show") {
      return ok(
        [
          `LoadState=${st.loaded ? "loaded" : "not-found"}`,
          `ActiveState=${st.running ? "active" : "inactive"}`,
          `SubState=${st.running ? "running" : "dead"}`,
          `MainPID=${st.running ? SVC_PID : 0}`,
          "ExecMainStatus=0",
          `UnitFileState=${st.loaded ? "enabled" : ""}`,
          "",
        ].join("\n"),
      );
    }
    if (argv[0] === "loginctl" && verb === "show-user") return ok(`Linger=${st.linger}\n`);
    return failRes(1, `unexpected ${argv.join(" ")}`);
  };
  return { calls, runner, st };
}

function deps(
  platform: "darwin" | "linux",
  runner: ServiceProbeDeps["runner"],
  over: Partial<ServiceProbeDeps> = {},
): ServiceProbeDeps {
  return {
    runner,
    platform,
    uid: 501,
    home,
    bridgeDir: bridgeDir(),
    profile: PROFILE,
    relayUrl: "wss://relay.example.com:7842/ws",
    currentPath: "",
    cliBridgeMainPath: () => BRIDGE_MAIN,
    isPidAlive: (pid) => pid === SVC_PID || pid === HUMAN_PID,
    inspectLock: (): BridgeLockInspection => ({
      kind: "held",
      pid: SVC_PID,
      startedAt: new Date().toISOString(),
      verified: true,
    }),
    ...over,
  };
}

function expectReadVerbsOnly(calls: string[][]): void {
  expect(calls.length).toBeGreaterThan(0);
  for (const argv of calls) {
    expect(["launchctl", "systemctl", "loginctl"]).toContain(argv[0]!);
    if (argv[0] === "systemctl") expect(argv[1]).toBe("--user");
    expect(READ_VERBS.has(verbOf(argv))).toBe(true);
  }
}

const PLATFORMS = ["darwin", "linux"] as const;

test("SERVICE_READ_VERBS is exactly the R12 read set", () => {
  expect([...SERVICE_READ_VERBS].sort()).toEqual([...READ_VERBS].sort());
});

for (const platform of PLATFORMS) {
  describe(`gatherServiceInput (${platform})`, () => {
    test("not installed → no runner call, one info line", async () => {
      const f = fakeRunner();
      const s = await serviceDoctorSection(deps(platform, f.runner));
      expect(f.calls).toEqual([]);
      expect(s.lines).toHaveLength(1);
      expect(s.lines[0]!.status).toBe("info");
      expect(s.lines[0]!.message).toContain("not installed");
    });

    test("non-Loom file → warn, no runner call", async () => {
      const target = serviceTargetPaths(home, PROFILE, platform);
      mkdirSync(join(target.unitPath, ".."), { recursive: true });
      writeFileSync(target.unitPath, "foreign\n");
      const f = fakeRunner();
      const s = await serviceDoctorSection(deps(platform, f.runner));
      expect(f.calls).toEqual([]);
      expect(text(s)).toMatch(/^warn .*not a Loom service file/m);
    });

    test("installed + running: every runner call is a read verb; healthy → no warn, no fail", async () => {
      const path = installUnit(platform);
      writeStatusFile(SVC_PID);
      const f = fakeRunner();
      const s = await serviceDoctorSection(deps(platform, f.runner, { currentPath: path }));
      expectReadVerbsOnly(f.calls);
      noFail(s);
      expect(s.lines.filter((l) => l.status === "warn")).toEqual([]);
      expect(text(s)).toContain(`ok running pid ${SVC_PID}`);
      exitUnchanged(s);
    });

    test("read verbs only across every scripted state", async () => {
      installUnit(platform);
      writeStatusFile(HUMAN_PID);
      const all: string[][] = [];
      for (const init of [
        { loaded: false, running: false },
        { loaded: true, running: false },
        { loaded: true, running: true, disabled: true },
        { linger: "no" as const },
      ]) {
        const f = fakeRunner(init);
        noFail(await serviceDoctorSection(deps(platform, f.runner)));
        all.push(...f.calls);
      }
      expectReadVerbsOnly(all);
    });

    test("runner failure → affected rows info unknown, zero fail, exit code unchanged", async () => {
      installUnit(platform);
      const f = fakeRunner({
        override: {
          "launchctl print": () => failRes(5, ""),
          "launchctl print-disabled": () => failRes(5, ""),
          "systemctl show": () => failRes(1, "Failed to connect to bus"),
          "loginctl show-user": () => failRes(1, ""),
        },
      });
      const s = await serviceDoctorSection(deps(platform, f.runner));
      noFail(s);
      exitUnchanged(s);
      const u = s.lines.filter((l) => /unknown/.test(l.message));
      expect(u.length).toBeGreaterThanOrEqual(2);
      expect(u.every((l) => l.status === "info")).toBe(true);
      expect(text(s)).not.toContain("installed but not loaded");
    });

    test("runner throws → info unknown, never fail", async () => {
      installUnit(platform);
      const s = await serviceDoctorSection(
        deps(platform, async () => {
          throw new Error("spawn EACCES");
        }),
      );
      noFail(s);
      expect(text(s)).toMatch(/^info .*unknown/m);
    });

    test(
      "runner hangs > 2 s → each call bounded at 2 s, rows info unknown",
      async () => {
        installUnit(platform);
        const hang = () => new Promise<Res>(() => {});
        const f = fakeRunner({
          override: {
            "launchctl print": hang,
            "launchctl print-disabled": hang,
            "systemctl show": hang,
            "loginctl show-user": hang,
          },
        });
        const t0 = Date.now();
        const s = await serviceDoctorSection(deps(platform, f.runner));
        const elapsed = Date.now() - t0;
        expect(elapsed).toBeGreaterThanOrEqual(1_900);
        // ≤ 2 s per call; the read queries may not add up beyond their count × 2 s.
        expect(elapsed).toBeLessThan(2_000 * f.calls.length + 1_000);
        noFail(s);
        expect(text(s)).toMatch(/^info .*unknown/m);
        expect(text(s)).not.toMatch(/^ok running/m);
      },
      15_000,
    );

    test("a timeoutMs above 2 s is clamped to the 2 s bound (R12)", async () => {
      installUnit(platform);
      const hang = () => new Promise<Res>(() => {});
      const f = fakeRunner({
        override: { "launchctl print": hang, "systemctl show": hang },
      });
      const t0 = Date.now();
      await serviceDoctorSection(deps(platform, f.runner, { timeoutMs: 60_000 }));
      expect(Date.now() - t0).toBeLessThan(2_000 * f.calls.length + 1_000);
    }, 15_000);

    test("yielded: loaded + not running + live lock holder ≠ main pid → warn with recovery", async () => {
      installUnit(platform);
      writeStatusFile(HUMAN_PID);
      const f = fakeRunner({ loaded: true, running: false });
      const s = await serviceDoctorSection(
        deps(platform, f.runner, {
          inspectLock: () => ({
            kind: "held",
            pid: HUMAN_PID,
            startedAt: new Date().toISOString(),
            verified: true,
          }),
        }),
      );
      expect(text(s)).toContain(
        `warn service yielded to bridge pid ${HUMAN_PID} — loom bridge stop, then loom service start`,
      );
      noFail(s);
    });

    test("outside the service: not loaded + meta pid alive → warn", async () => {
      installUnit(platform);
      writeStatusFile(HUMAN_PID);
      const f = fakeRunner({ loaded: false, running: false });
      const s = await serviceDoctorSection(
        deps(platform, f.runner, { inspectLock: () => ({ kind: "none" }) }),
      );
      expect(text(s)).toContain(`warn bridge pid ${HUMAN_PID} runs outside the service`);
      noFail(s);
    });

    test("PATH drift: agent binary not resolvable via the unit PATH → warn naming it", async () => {
      const path = installUnit(platform, { path: binDir(["claude"]) });
      // headless, no agent named → every headless agent may be launched → all checked
      writeWorker({ backend: "headless", cwd: home, allowedRoots: [home] });
      const f = fakeRunner();
      const s = await serviceDoctorSection(deps(platform, f.runner, { currentPath: path }));
      expect(text(s)).toMatch(/^warn agent binaries not resolvable via the unit PATH: codex, grok/m);
    });

    test("PATH drift: pane backend / no bridge config → agent binaries not checked", async () => {
      const path = installUnit(platform, { path: binDir([]) });
      const f = fakeRunner();
      const none = await serviceDoctorSection(deps(platform, f.runner, { currentPath: path }));
      expect(text(none)).not.toContain("agent binaries not resolvable");
      expect(text(none)).toContain("ok unit PATH matches the current PATH");
      writeWorker({ backend: "pane", agentBin: { claude: "/nowhere/claude" } });
      const pane = await serviceDoctorSection(deps(platform, f.runner, { currentPath: path }));
      expect(text(pane)).not.toContain("agent binaries not resolvable");
      expect(text(pane)).toContain("ok unit PATH matches the current PATH");
    });

    test("PATH drift: headless checks only the agents the config names (agentBin · maxConcurrent)", async () => {
      const path = installUnit(platform, { path: binDir([]) });
      const codex = join(binDir(["codex"]), "codex");
      writeWorker({
        backend: "headless",
        cwd: home,
        allowedRoots: [home],
        agentBin: { codex },
        maxConcurrent: { claude: 1 },
      });
      const f = fakeRunner();
      const s = await serviceDoctorSection(deps(platform, f.runner, { currentPath: path }));
      expect(text(s)).toMatch(/^warn agent binaries not resolvable via the unit PATH: claude — /m);
      expect(text(s)).not.toMatch(/not resolvable.*grok/);
    });

    test("PATH drift: bridge config agentBin (absolute) is checked as configured", async () => {
      const path = installUnit(platform, { path: binDir(["claude", "codex"]) });
      const grok = join(binDir(["grok"]), "grok");
      mkdirSync(bridgeDir(), { recursive: true });
      writeFileSync(
        join(bridgeDir(), `${PROFILE}.json`),
        JSON.stringify({
          authorizedDispatchers: ["p_tower"],
          worker: { backend: "headless", cwd: home, allowedRoots: [home], agentBin: { grok } },
        }),
      );
      const f = fakeRunner();
      const s = await serviceDoctorSection(deps(platform, f.runner, { currentPath: path }));
      expect(text(s)).toContain("ok unit PATH matches the current PATH");
    });

    test("PATH drift: unit PATH ≠ current PATH but binaries resolve → info", async () => {
      installUnit(platform);
      const f = fakeRunner();
      const s = await serviceDoctorSection(deps(platform, f.runner, { currentPath: "/nowhere" }));
      expect(text(s)).toMatch(/^info unit PATH differs from the current PATH/m);
    });

    test("srcPath three-way: unit vs CLI vs status file", async () => {
      installUnit(platform);
      writeStatusFile(SVC_PID);
      const f = fakeRunner();
      const same = await serviceDoctorSection(deps(platform, f.runner));
      expect(text(same)).toMatch(/^ok srcPath: unit == CLI == status file/m);

      const cli = await serviceDoctorSection(
        deps(platform, f.runner, { cliBridgeMainPath: () => "/moved/src/bridge-main.ts" }),
      );
      expect(text(cli)).toMatch(/^warn srcPath mismatch.*\/moved\/src\/bridge-main\.ts/m);

      writeStatusFile(SVC_PID, "/old/src/bridge-main.ts");
      const st = await serviceDoctorSection(deps(platform, f.runner));
      expect(text(st)).toMatch(/^warn srcPath mismatch.*\/old\/src\/bridge-main\.ts/m);

      const throws = await serviceDoctorSection(
        deps(platform, f.runner, {
          cliBridgeMainPath: () => {
            throw new Error("Cannot find bridge-main.ts");
          },
        }),
      );
      noFail(throws);
    });

    test("paths row: missing bun → warn re-run install", async () => {
      installUnit(platform, { execPath: join(home, "gone", "bun") });
      const f = fakeRunner();
      const s = await serviceDoctorSection(deps(platform, f.runner));
      expect(text(s)).toMatch(/^warn missing: .*gone\/bun.*re-run loom service install/m);
    });

    test("log 0644 → warn · 0600 → ok · missing → info", async () => {
      installUnit(platform, { logMode: 0o644 });
      const f = fakeRunner();
      expect(text(await serviceDoctorSection(deps(platform, f.runner)))).toMatch(
        /^warn log mode 0644/m,
      );
      chmodSync(logPath(), 0o600);
      expect(text(await serviceDoctorSection(deps(platform, f.runner)))).toMatch(
        /^ok log mode 0600/m,
      );
      rmSync(logPath());
      expect(text(await serviceDoctorSection(deps(platform, f.runner)))).toMatch(
        /^info log not created yet/m,
      );
    });

    test("loopback session relay → warn", async () => {
      installUnit(platform);
      const f = fakeRunner();
      const s = await serviceDoctorSection(
        deps(platform, f.runner, { relayUrl: "ws://127.0.0.1:7842/ws" }),
      );
      expect(text(s)).toMatch(/^warn .*relay is loopback/m);
    });

    test("gatherServiceInput returns the pure input (installed)", async () => {
      installUnit(platform);
      const f = fakeRunner();
      const input = await gatherServiceInput(deps(platform, f.runner));
      expect(input.kind).toBe("installed");
    });
  });
}

test("linux: linger no → warn; launchd never queries loginctl", async () => {
  installUnit("linux");
  const f = fakeRunner({ linger: "no" });
  const s = await serviceDoctorSection(deps("linux", f.runner));
  expect(text(s)).toMatch(/^warn linger: no — logout stops the service and kills its workers/m);
  expect(f.calls.some((c) => c[0] === "loginctl" && c[1] === "show-user")).toBe(true);

  const g = fakeRunner();
  installUnit("darwin");
  await serviceDoctorSection(deps("darwin", g.runner));
  expect(g.calls.some((c) => c[0] === "loginctl")).toBe(false);
  expect(g.calls.some((c) => c[0] === "launchctl" && c[1] === "print-disabled")).toBe(true);
});

test("launchd disabled in Login Items → warn", async () => {
  installUnit("darwin");
  const f = fakeRunner({ disabled: true });
  const s = await serviceDoctorSection(deps("darwin", f.runner));
  expect(text(s)).toMatch(/^warn disabled in Login Items/m);
});

test("unsupported platform → one info line, no runner call", async () => {
  const f = fakeRunner();
  const s = await serviceDoctorSection(deps("win32" as "linux", f.runner));
  expect(f.calls).toEqual([]);
  expect(s.lines).toHaveLength(1);
  expect(s.lines[0]!.status).toBe("info");
});

// ---------------------------------------------------------------------------------------------
// C. `loom service status` prints the same builder's lines
// ---------------------------------------------------------------------------------------------

for (const platform of PLATFORMS) {
  test(`service status (${platform}) renders the shared Service section lines, exit 0, read verbs only`, async () => {
    mkdirSync(join(home, ".loom", "profiles"), { recursive: true });
    writeFileSync(
      join(home, ".loom", "profiles", `${PROFILE}.json`),
      JSON.stringify({
        relayUrl: "wss://relay.example.com:7842/ws",
        relayToken: "tok-SECRET",
        roomId: "r_1",
        roomName: "room",
        inviteCode: "LOOM-ABCD",
        peerId: "p_node",
        peerSecret: "ps-SECRET",
        displayName: PROFILE,
      }),
      { mode: 0o600 },
    );
    installUnit(platform);
    writeStatusFile(HUMAN_PID);
    const f = fakeRunner({ loaded: true, running: false });
    const out: string[] = [];
    const code = await runServiceCommand(
      "status",
      { profile: PROFILE },
      {
        runner: f.runner,
        platform,
        uid: 501,
        out: (l) => out.push(l),
        err: (l) => out.push(l),
        inspectLock: () => ({
          kind: "held",
          pid: HUMAN_PID,
          startedAt: new Date().toISOString(),
          verified: true,
        }),
      },
    );
    expect(code).toBe(0);
    expectReadVerbsOnly(f.calls);
    const joined = out.join("\n");
    expect(joined).toMatch(
      new RegExp(`warn\\s+service yielded to bridge pid ${HUMAN_PID} — loom bridge stop, then loom service start`),
    );
    expect(joined).toMatch(/info\s+loaded, not running/);
    expect(joined).toMatch(/ok\s+installed: /);
  });
}

// ---------------------------------------------------------------------------------------------
// D. Real CLI under LOOM_TEST_HOME — no files created, no real service manager spawned (R9)
// ---------------------------------------------------------------------------------------------

const CLI = join(import.meta.dir, "index.ts");

function listTree(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string, rel: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      out.push(r);
      if (e.isDirectory()) walk(join(d, e.name), r);
    }
  };
  walk(dir, "");
  return out.sort();
}

/** fake launchctl/systemctl/loginctl that record being spawned. */
function spyBin(): { dir: string; marker: string } {
  const dir = mkdtempSync(join(tmpdir(), "loom-docsvc-bin-"));
  const marker = join(dir, "SPAWNED");
  for (const n of ["launchctl", "systemctl", "loginctl"]) {
    writeFileSync(join(dir, n), `#!/bin/sh\necho "$0 $*" >> "${marker}"\nexit 0\n`);
    chmodSync(join(dir, n), 0o755);
  }
  return { dir, marker };
}

test("CLI `loom doctor` + `loom service status` under an empty LOOM_TEST_HOME create nothing", () => {
  const empty = mkdtempSync(join(tmpdir(), "loom-docsvc-empty-"));
  const spy = spyBin();
  try {
    const env = { ...process.env, LOOM_TEST_HOME: empty, PATH: `${spy.dir}:${process.env.PATH}` };
    delete (env as Record<string, string | undefined>).LOOM_SESSION;
    delete (env as Record<string, string | undefined>).LOOM_PROFILE;
    const doc = spawnSync(process.execPath, [CLI, "doctor"], { env, encoding: "utf8", timeout: 30_000 });
    expect(doc.stdout).toContain("\nService\n");
    expect(doc.stdout).toMatch(/info\s+not installed/);
    expect(doc.stdout).not.toMatch(/^\s+fail\s/m);
    expect(doc.status).toBe(0);
    const st = spawnSync(process.execPath, [CLI, "service", "status"], {
      env,
      encoding: "utf8",
      timeout: 30_000,
    });
    // R9: status under LOOM_TEST_HOME with the real runner is refused (exit 1) — nothing spawned.
    expect(st.status).toBe(1);
    expect(listTree(empty)).toEqual([]);
    expect(existsSync(spy.marker)).toBe(false);
  } finally {
    rmSync(empty, { recursive: true, force: true });
    rmSync(spy.dir, { recursive: true, force: true });
  }
}, 60_000);

test("CLI `loom doctor` with an installed unit under LOOM_TEST_HOME spawns no service manager (R9 → info unknown)", () => {
  const platform = process.platform === "darwin" ? "darwin" : "linux";
  installUnit(platform);
  const spy = spyBin();
  try {
    const env = { ...process.env, LOOM_TEST_HOME: home, PATH: `${spy.dir}:${process.env.PATH}` };
    delete (env as Record<string, string | undefined>).LOOM_SESSION;
    const before = listTree(home);
    const doc = spawnSync(process.execPath, [CLI, "--profile", PROFILE, "doctor"], {
      env,
      encoding: "utf8",
      timeout: 30_000,
    });
    expect(doc.stdout).toContain("\nService\n");
    expect(doc.stdout).toMatch(/ok\s+installed: /);
    expect(doc.stdout).toMatch(/info\s+.*unknown/);
    expect(doc.stdout).not.toMatch(/^\s+fail\s/m);
    expect(existsSync(spy.marker)).toBe(false);
    expect(listTree(home)).toEqual(before);
  } finally {
    rmSync(spy.dir, { recursive: true, force: true });
  }
}, 60_000);
