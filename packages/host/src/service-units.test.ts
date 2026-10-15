/**
 * PLAN 0.34.0 P1 — pure service unit generators + names (D4 · D8 · R10 · R52-L2 · R52-L3).
 * Done-when (a): plist top-level key set == ② · KeepAlive {SuccessfulExit:false} · ThrottleInterval 10
 * · ExitTimeOut 20 · AbandonProcessGroup true · ProcessType absent · systemd line set == ② ·
 * KillMode=process only · Restart=on-failure · RestartSec=10 · TimeoutStopSec=30 · no
 * network-online · env key set fixed · token strings absent · XML / systemd escaping · deterministic.
 * Done-when (b): D8 table · marker round-trip + mismatch rejection · classifyRunnerResult script ·
 * parsers on fixed samples · darwin `plutil -lint` (read-only — never touches launchd).
 */
import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bridgeConfigPath, bridgeConfigSafeName } from "./bridge-config";
import { sanitizeProfileLogName } from "./bridge-spawn";
import {
  classifyRunnerResult,
  isLoomServiceFile,
  parseLaunchctlPrint,
  parseLaunchctlPrintDisabled,
  parseServiceMarker,
  parseSystemctlShow,
  renderLaunchdPlist,
  renderServiceMarker,
  renderSystemdUnit,
  type ServiceUnitSpec,
  serviceNames,
  serviceProfileNameCheck,
  serviceTargetPaths,
} from "./service-units";

const BASE: ServiceUnitSpec = {
  profile: "work",
  execPath: "/Users/u/.bun/bin/bun",
  bridgeMainPath: "/Users/u/src/loom/packages/host/src/bridge-main.ts",
  home: "/Users/u",
  path: "/Users/u/.bun/bin:/usr/local/bin:/usr/bin:/bin",
  sessionPath: "/Users/u/.loom/profiles/work/session.json",
  loomProfile: "work",
  logPath: "/Users/u/.loom/bridge/work.stderr.log",
  loomVersion: "0.34.0",
};

// ---------------------------------------------------------------------------------------------
// Minimal XML plist reader (test-only) — enough for dict/array/key/string/integer/true/false.
// ---------------------------------------------------------------------------------------------
type PV = string | number | boolean | PV[] | { [k: string]: PV };

function xmlUnescape(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function parsePlist(xml: string): Record<string, PV> {
  const body = xml.slice(xml.indexOf("<plist"));
  const re =
    /<dict>|<\/dict>|<array>|<\/array>|<key>([^<]*)<\/key>|<string>([^<]*)<\/string>|<integer>(-?\d+)<\/integer>|<true\/>|<false\/>/g;
  const toks = [...body.matchAll(re)];
  let i = 0;
  const value = (): PV => {
    const t = toks[i++]!;
    const s = t[0];
    if (s === "<dict>") {
      const out: Record<string, PV> = {};
      while (toks[i]![0] !== "</dict>") {
        const k = toks[i++]!;
        if (k[1] === undefined) throw new Error(`expected <key>, got ${k[0]}`);
        out[xmlUnescape(k[1])] = value();
      }
      i++;
      return out;
    }
    if (s === "<array>") {
      const out: PV[] = [];
      while (toks[i]![0] !== "</array>") out.push(value());
      i++;
      return out;
    }
    if (t[2] !== undefined) return xmlUnescape(t[2]);
    if (t[3] !== undefined) return Number(t[3]);
    if (s === "<true/>") return true;
    if (s === "<false/>") return false;
    throw new Error(`unexpected token ${s}`);
  };
  const root = value();
  if (i !== toks.length) throw new Error("trailing tokens after root dict");
  return root as Record<string, PV>;
}

function unitLines(unit: string): string[] {
  return unit.split("\n").filter((l) => l !== "");
}

// ---------------------------------------------------------------------------------------------
describe("D8 — profile name sanitizers must agree (bridge-config `_` vs lock/log `-`)", () => {
  test("bridgeConfigSafeName is the bridgeConfigPath sanitizer (behavior unchanged)", () => {
    expect(bridgeConfigSafeName("a b")).toBe("a_b");
    expect(bridgeConfigSafeName("a/b")).toBe("a_b");
    expect(bridgeConfigSafeName(".x")).toBe(".x");
    expect(bridgeConfigSafeName("")).toBe("default");
    expect(bridgeConfigPath("a b").endsWith("/a_b.json")).toBe(true);
    expect(bridgeConfigPath("").endsWith("/default.json")).toBe(true);
    expect(bridgeConfigPath("work").endsWith("/bridge/work.json")).toBe(true);
  });

  for (const p of ["a", "a.b", "a_b", "A-1"]) {
    test(`same → accepted: ${JSON.stringify(p)}`, () => {
      expect(sanitizeProfileLogName(p)).toBe(bridgeConfigSafeName(p));
      const r = serviceProfileNameCheck(p);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.name).toBe(p);
    });
  }

  for (const p of ["a b", ".x", "-x", "a/b"]) {
    test(`differ → refused: ${JSON.stringify(p)}`, () => {
      const a = bridgeConfigSafeName(p);
      const b = sanitizeProfileLogName(p);
      expect(a).not.toBe(b);
      const r = serviceProfileNameCheck(p);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.message).toBe(
          `profile name "${p}" maps to different file names (config "${a}" vs lock/log "${b}") — rename the profile`,
        );
      }
    });
  }

  // PLAN D8 table lists "한글" as refused, but both sanitizers map it to "__" (the lock/log
  // sanitizer turns the leading "--" run into "_"), so `config !== lockLog` alone admits it.
  // ② also states "same ⇒ sanitized == original"; enforcing that invariant refuses it (and any
  // name whose leading chars are out of range: " x", "/x").
  for (const p of ["한글", " x", "/x"]) {
    test(`sanitizers agree but rewrite the name → refused: ${JSON.stringify(p)}`, () => {
      const b = sanitizeProfileLogName(p);
      expect(bridgeConfigSafeName(p)).toBe(b);
      expect(b).not.toBe(p);
      const r = serviceProfileNameCheck(p);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.message).toBe(
          `profile name "${p}" is not a valid service name (its files would be named "${b}") — rename the profile`,
        );
      }
    });
  }

  test("serviceNames — Label and unit name from the lock/status sanitizer", () => {
    expect(serviceNames("work")).toEqual({
      profile: "work",
      label: "com.loom.bridge.work",
      unitName: "loom-bridge-work.service",
    });
    expect(serviceNames("A-1.b_c").label).toBe("com.loom.bridge.A-1.b_c");
  });

  test("serviceTargetPaths — LaunchAgents plist / systemd user unit + wants symlink", () => {
    expect(serviceTargetPaths("/h", "work", "darwin")).toEqual({
      kind: "launchd",
      unitPath: "/h/Library/LaunchAgents/com.loom.bridge.work.plist",
    });
    expect(serviceTargetPaths("/h", "work", "linux")).toEqual({
      kind: "systemd",
      unitPath: "/h/.config/systemd/user/loom-bridge-work.service",
      wantsLinkPath: "/h/.config/systemd/user/default.target.wants/loom-bridge-work.service",
      wantsLinkTarget: "../loom-bridge-work.service",
    });
    expect(() => serviceTargetPaths("/h", "work", "win32")).toThrow(
      "loom service: unsupported platform win32",
    );
  });

  test("generators refuse a D8-refused profile", () => {
    expect(() => renderLaunchdPlist({ ...BASE, profile: "a b" })).toThrow(/maps to different/);
    expect(() => renderSystemdUnit({ ...BASE, profile: ".x" })).toThrow(/maps to different/);
  });

  test("generators refuse relative paths (D4 — absolute bun + absolute bridge-main.ts)", () => {
    expect(() => renderLaunchdPlist({ ...BASE, execPath: "bun" })).toThrow(/absolute/);
    expect(() =>
      renderSystemdUnit({ ...BASE, bridgeMainPath: "packages/host/src/bridge-main.ts" }),
    ).toThrow(/absolute/);
  });
});

// ---------------------------------------------------------------------------------------------
describe("launchd plist (② · D2 · D4 · R4)", () => {
  test("top-level key set is exactly ②", () => {
    const d = parsePlist(renderLaunchdPlist(BASE));
    expect(Object.keys(d).sort()).toEqual(
      [
        "Label",
        "ProgramArguments",
        "EnvironmentVariables",
        "WorkingDirectory",
        "RunAtLoad",
        "KeepAlive",
        "ThrottleInterval",
        "ExitTimeOut",
        "AbandonProcessGroup",
        "StandardOutPath",
        "StandardErrorPath",
      ].sort(),
    );
  });

  test("values — restart policy, abandon group, paths, env", () => {
    const xml = renderLaunchdPlist(BASE);
    const d = parsePlist(xml);
    expect(d.Label).toBe("com.loom.bridge.work");
    expect(d.ProgramArguments).toEqual([BASE.execPath, BASE.bridgeMainPath]);
    expect(d.WorkingDirectory).toBe(BASE.home);
    expect(d.RunAtLoad).toBe(true);
    expect(d.KeepAlive).toEqual({ SuccessfulExit: false });
    expect(d.ThrottleInterval).toBe(10);
    expect(d.ExitTimeOut).toBe(20);
    expect(d.AbandonProcessGroup).toBe(true);
    expect(d.StandardOutPath).toBe("/dev/null");
    expect(d.StandardErrorPath).toBe(BASE.logPath);
    expect(d.EnvironmentVariables).toEqual({
      HOME: BASE.home,
      PATH: BASE.path,
      LOOM_SERVICE: "1",
      LOOM_SESSION: BASE.sessionPath,
      LOOM_PROFILE: "work",
    });
    expect(xml).not.toContain("ProcessType");
    expect(xml).not.toContain("network-online");
    expect(xml).toContain("<integer>10</integer>");
    expect(xml).toContain("<integer>20</integer>");
  });

  test("env key set without an active profile == {HOME, PATH, LOOM_SERVICE, LOOM_SESSION}", () => {
    const { loomProfile: _drop, ...noProfile } = BASE;
    const d = parsePlist(renderLaunchdPlist(noProfile));
    expect(Object.keys(d.EnvironmentVariables as object).sort()).toEqual(
      ["HOME", "LOOM_SERVICE", "LOOM_SESSION", "PATH"].sort(),
    );
  });

  test("marker is line 2 — after the XML declaration, before DOCTYPE", () => {
    const lines = renderLaunchdPlist(BASE).split("\n");
    expect(lines[0]).toBe('<?xml version="1.0" encoding="UTF-8"?>');
    expect(lines[1]).toBe("<!-- loom-service v1 profile=work loom=0.34.0 -->");
    expect(lines[2]!.startsWith("<!DOCTYPE plist")).toBe(true);
  });

  test("XML escaping — & < > \" ' in strings round-trip", () => {
    const spec = { ...BASE, path: "/a&b:/c<d:/e>f:/g\"h:/i'j" };
    const xml = renderLaunchdPlist(spec);
    expect(xml).toContain("/a&amp;b:/c&lt;d:/e&gt;f:/g&quot;h:/i&apos;j");
    expect(xml).not.toContain("/a&b");
    expect(xml).not.toContain("/c<d");
    const d = parsePlist(xml);
    expect((d.EnvironmentVariables as Record<string, string>).PATH).toBe(spec.path);
  });

  test("deterministic — same input → same bytes", () => {
    expect(renderLaunchdPlist(BASE)).toBe(renderLaunchdPlist({ ...BASE }));
  });
});

// ---------------------------------------------------------------------------------------------
describe("systemd --user unit (② · D2 · D4 · R6)", () => {
  test("line set is exactly ②", () => {
    expect(unitLines(renderSystemdUnit(BASE))).toEqual([
      "# loom-service v1 profile=work loom=0.34.0",
      "[Unit]",
      "Description=Loom bridge (work)",
      "[Service]",
      "Type=simple",
      `ExecStart=${BASE.execPath} ${BASE.bridgeMainPath}`,
      `WorkingDirectory=${BASE.home}`,
      `Environment=HOME=${BASE.home}`,
      `Environment=PATH=${BASE.path}`,
      "Environment=LOOM_SERVICE=1",
      `Environment=LOOM_SESSION=${BASE.sessionPath}`,
      "Environment=LOOM_PROFILE=work",
      "KillMode=process",
      "Restart=on-failure",
      "RestartSec=10",
      "TimeoutStopSec=30",
      "StandardOutput=null",
      `StandardError=append:${BASE.logPath}`,
      "[Install]",
      "WantedBy=default.target",
    ]);
  });

  test("KillMode=process fixed; control-group / mixed / none absent; no network-online, StartLimit", () => {
    const unit = renderSystemdUnit(BASE);
    expect(unitLines(unit).filter((l) => l.startsWith("KillMode="))).toEqual(["KillMode=process"]);
    expect(unit).not.toContain("control-group");
    expect(unit).not.toContain("mixed");
    expect(unit).not.toContain("KillMode=none");
    expect(unit).toContain("\nRestart=on-failure\n");
    expect(unit).toContain("\nRestartSec=10\n");
    expect(unit).toContain("\nTimeoutStopSec=30\n");
    expect(unit).not.toContain("network-online");
    expect(unit).not.toContain("After=");
    expect(unit).not.toContain("Wants=");
    expect(unit).not.toContain("StartLimit");
    expect(unit.startsWith("# loom-service v1 profile=work loom=0.34.0\n")).toBe(true);
    expect(unit.endsWith("\n")).toBe(true);
  });

  test("env key set == {HOME, PATH, LOOM_SERVICE, LOOM_SESSION, LOOM_PROFILE?}", () => {
    const keys = (u: string) =>
      unitLines(u)
        .filter((l) => l.startsWith("Environment="))
        .map((l) => l.slice("Environment=".length).replace(/^"/, "").split("=")[0]);
    expect(keys(renderSystemdUnit(BASE))).toEqual([
      "HOME",
      "PATH",
      "LOOM_SERVICE",
      "LOOM_SESSION",
      "LOOM_PROFILE",
    ]);
    const { loomProfile: _drop, ...noProfile } = BASE;
    expect(keys(renderSystemdUnit(noProfile))).toEqual([
      "HOME",
      "PATH",
      "LOOM_SERVICE",
      "LOOM_SESSION",
    ]);
  });

  test('escaping — % everywhere, $ in ExecStart, quoting for space / " / \\', () => {
    const spec: ServiceUnitSpec = {
      ...BASE,
      execPath: "/opt/my bun/b%1$x",
      home: "/home/a b%c",
      path: "/a b:/p%q:/d$e",
      sessionPath: '/s/q"t\\u/session.json',
      logPath: "/home/a b%c/.loom/bridge/work.stderr.log",
    };
    const lines = unitLines(renderSystemdUnit(spec));
    // ExecStart: per-argument quoting + `%`→`%%` + `$`→`$$` (systemd expands `$VAR` there).
    expect(lines).toContain(`ExecStart="/opt/my bun/b%%1$$x" ${BASE.bridgeMainPath}`);
    // Environment=: whole assignment quoted when needed; `%`→`%%`; `$` has no meaning there.
    expect(lines).toContain('Environment="PATH=/a b:/p%%q:/d$e"');
    expect(lines).toContain('Environment="LOOM_SESSION=/s/q\\"t\\\\u/session.json"');
    expect(lines).toContain('Environment="HOME=/home/a b%%c"');
    // Path-valued settings take the rest of the line literally (no unquoting) — `%` only.
    expect(lines).toContain("WorkingDirectory=/home/a b%%c");
    expect(lines).toContain("StandardError=append:/home/a b%%c/.loom/bridge/work.stderr.log");
  });

  test("newline in any value → refused (cannot be represented in a unit line)", () => {
    expect(() => renderSystemdUnit({ ...BASE, path: "/a\n[Service]" })).toThrow(/newline/);
  });

  test("deterministic — same input → same bytes", () => {
    expect(renderSystemdUnit(BASE)).toBe(renderSystemdUnit({ ...BASE }));
  });
});

// ---------------------------------------------------------------------------------------------
describe("token / secret absence (② env 금지 · R5 · R52-L1)", () => {
  const saved: Record<string, string | undefined> = {};
  const SECRET_ENV = {
    LOOM_RELAY_TOKEN: "tok-env-SECRET-loom",
    FABLE_RELAY_TOKEN: "tok-env-SECRET-fable",
    LOOM_RELAY_URL: "wss://relay-env.example",
    LOOM_TEST_HOME: "/tmp/test-home-SECRET",
    FABLE_ANYTHING: "fable-SECRET",
  };
  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  test("generated from a token-bearing session + token env → no token, no forbidden names", () => {
    for (const [k, v] of Object.entries(SECRET_ENV)) {
      saved[k] = process.env[k];
      process.env[k] = v;
    }
    const session = {
      relayToken: "tok-session-SECRET",
      relayUrl: "wss://relay.example",
      displayName: "work",
      inviteSecret: "inv-SECRET",
    };
    const spec: ServiceUnitSpec = { ...BASE, ...session };
    for (const out of [renderLaunchdPlist(spec), renderSystemdUnit(spec)]) {
      expect(out).not.toContain("SECRET");
      expect(out).not.toContain("tok-");
      expect(out).not.toContain("relayToken");
      expect(out).not.toContain("LOOM_RELAY_TOKEN");
      expect(out).not.toContain("FABLE_RELAY_TOKEN");
      expect(out).not.toContain("LOOM_RELAY_URL");
      expect(out).not.toContain("LOOM_TEST_HOME");
      expect(out).not.toContain("FABLE_");
      expect(out).not.toContain("wss://");
    }
  });
});

// ---------------------------------------------------------------------------------------------
describe("marker (② 마커)", () => {
  test("renderServiceMarker — xml comment / hash line", () => {
    expect(renderServiceMarker("launchd", "work", "0.34.0")).toBe(
      "<!-- loom-service v1 profile=work loom=0.34.0 -->",
    );
    expect(renderServiceMarker("systemd", "work", "0.34.0")).toBe(
      "# loom-service v1 profile=work loom=0.34.0",
    );
  });

  test("round-trip from both generators", () => {
    for (const text of [renderLaunchdPlist(BASE), renderSystemdUnit(BASE)]) {
      expect(parseServiceMarker(text)).toEqual({ profile: "work", loomVersion: "0.34.0" });
      expect(isLoomServiceFile(text, "work")).toBe(true);
    }
  });

  test("profile-mismatch marker → not a Loom file for this profile", () => {
    for (const text of [renderLaunchdPlist(BASE), renderSystemdUnit(BASE)]) {
      expect(isLoomServiceFile(text, "other")).toBe(false);
      expect(isLoomServiceFile(text, "wor")).toBe(false);
    }
  });

  test("no marker / marker beyond line 3 / malformed → null", () => {
    const foreign = '<?xml version="1.0"?>\n<plist version="1.0"><dict/></plist>\n';
    expect(parseServiceMarker(foreign)).toBeNull();
    expect(isLoomServiceFile(foreign, "work")).toBe(false);
    expect(parseServiceMarker("[Unit]\nDescription=x\n")).toBeNull();
    const late = "a\nb\nc\n# loom-service v1 profile=work loom=0.34.0\n";
    expect(parseServiceMarker(late)).toBeNull();
    expect(parseServiceMarker("#loom-service v1 profile=work loom=0.34.0\n")).toBeNull();
    expect(parseServiceMarker("# loom-service v2 profile=work loom=0.34.0\n")).toBeNull();
    expect(parseServiceMarker("  # loom-service v1 profile=work loom=0.34.0\n")).toBeNull();
    expect(parseServiceMarker("")).toBeNull();
  });

  test("marker on line 3 is still recognised", () => {
    expect(parseServiceMarker("x\ny\n# loom-service v1 profile=p loom=0.34.0\n")).toEqual({
      profile: "p",
      loomVersion: "0.34.0",
    });
  });
});

// ---------------------------------------------------------------------------------------------
describe("classifyRunnerResult (R10 · R52-L2 — stderr pattern required; code alone → error)", () => {
  const r = (code: number, stderr = "", stdout = "") => ({ code, stdout, stderr });
  const cases: Array<[string, "launchd" | "systemd", ReturnType<typeof r>, string]> = [
    ["launchd success", "launchd", r(0), "ok"],
    ["launchd success with noise", "launchd", r(0, "Input/output error"), "ok"],
    ["launchd EIO text", "launchd", r(5, "Bootstrap failed: 5: Input/output error\n"), "no_domain"],
    [
      "launchd domain unsupported",
      "launchd",
      r(125, "Domain does not support specified action\n"),
      "no_domain",
    ],
    [
      "launchd domain missing",
      "launchd",
      r(113, "Could not find domain for port identifier\n"),
      "no_domain",
    ],
    [
      "launchd disabled",
      "launchd",
      r(119, "Bootstrap failed: 119: Service is disabled\n"),
      "disabled",
    ],
    [
      "launchd disabled + EIO",
      "launchd",
      r(5, "Bootstrap failed: 5: Input/output error\nService is DISABLED\n"),
      "disabled",
    ],
    ["launchd code 5 alone", "launchd", r(5), "error"],
    ["launchd code 125 alone", "launchd", r(125), "error"],
    ["launchd code 119 alone", "launchd", r(119), "error"],
    ["launchd unrelated", "launchd", r(1, "Boot-out failed: 3: No such process\n"), "error"],
    ["launchd with systemd text", "launchd", r(1, "Failed to connect to bus\n"), "error"],
    ["systemd success", "systemd", r(0), "ok"],
    ["systemd no bus", "systemd", r(1, "Failed to connect to bus: No medium found\n"), "no_bus"],
    ["systemd no runtime dir", "systemd", r(1, "$XDG_RUNTIME_DIR not set\n"), "no_bus"],
    ["systemd code 1 alone", "systemd", r(1), "error"],
    ["systemd code 125 alone", "systemd", r(125), "error"],
    ["systemd with launchd text", "systemd", r(5, "Input/output error\n"), "error"],
    ["systemd disabled text", "systemd", r(1, "Unit is disabled\n"), "error"],
    [
      "systemd unit missing",
      "systemd",
      r(5, "Failed to start x.service: Unit x.service not found.\n"),
      "error",
    ],
  ];
  for (const [name, kind, res, want] of cases) {
    test(name, () => {
      expect(classifyRunnerResult(kind, res)).toBe(want);
    });
  }
});

// ---------------------------------------------------------------------------------------------
const PRINT_RUNNING = `gui/501/com.loom.bridge.work = {
\tactive count = 1
\tpath = /Users/u/Library/LaunchAgents/com.loom.bridge.work.plist
\ttype = LaunchAgent
\tstate = running

\tprogram = /Users/u/.bun/bin/bun
\targuments = {
\t\t/Users/u/.bun/bin/bun
\t\t/Users/u/src/loom/packages/host/src/bridge-main.ts
\t}

\tworking directory = /Users/u

\tstdout path = /dev/null
\tstderr path = /Users/u/.loom/bridge/work.stderr.log
\tenvironment = {
\t\tHOME => /Users/u
\t\tLOOM_SERVICE => 1
\t\tXPC_SERVICE_NAME => com.loom.bridge.work
\t}

\tdomain = gui/501 [100005]
\tasid = 100005
\tminimum runtime = 10
\texit timeout = 20
\truns = 1
\tpid = 4242
\timmediate reason = speculative
\tforks = 0
\texecs = 1
\tlast exit code = (never exited)

\tevent triggers = {
\t\tcom.x.trigger => {
\t\t\tstate = 0
\t\t\tpid = 999
\t\t}
\t}

\tproperties = keepalive | runatload | inferred program
}
`;

const PRINT_EXITED = `gui/501/com.loom.bridge.work = {
\tactive count = 0
\tpath = /Users/u/Library/LaunchAgents/com.loom.bridge.work.plist
\ttype = LaunchAgent
\tstate = not running

\tprogram = /Users/u/.bun/bin/bun
\truns = 3
\tlast exit code = 1
\tlast terminating signal = Terminated: 15
}
`;

describe("parsers on fixed samples (D7 read-only queries)", () => {
  test("parseLaunchctlPrint — running", () => {
    expect(parseLaunchctlPrint(PRINT_RUNNING)).toEqual({
      state: "running",
      running: true,
      pid: 4242,
      lastExitCode: null,
      path: "/Users/u/Library/LaunchAgents/com.loom.bridge.work.plist",
      program: "/Users/u/.bun/bin/bun",
    });
  });

  test("parseLaunchctlPrint — not running, last exit 1", () => {
    expect(parseLaunchctlPrint(PRINT_EXITED)).toEqual({
      state: "not running",
      running: false,
      pid: null,
      lastExitCode: 1,
      path: "/Users/u/Library/LaunchAgents/com.loom.bridge.work.plist",
      program: "/Users/u/.bun/bin/bun",
    });
  });

  test("parseLaunchctlPrint — empty / garbage → all null", () => {
    expect(parseLaunchctlPrint("")).toEqual({
      state: null,
      running: false,
      pid: null,
      lastExitCode: null,
      path: null,
      program: null,
    });
  });

  test("parseLaunchctlPrintDisabled — enabled/disabled and true/false spellings", () => {
    const out = `disabled services = {
\t"com.apple.Foo" => disabled
\t"com.loom.bridge.work" => disabled
\t"com.loom.bridge.home" => enabled
\t"com.loom.bridge.old" => true
\t"com.loom.bridge.new" => false
}

login item associations = {
\t"com.loom.bridge.other" => disabled
}
`;
    expect(parseLaunchctlPrintDisabled(out, "com.loom.bridge.work")).toBe(true);
    expect(parseLaunchctlPrintDisabled(out, "com.loom.bridge.home")).toBe(false);
    expect(parseLaunchctlPrintDisabled(out, "com.loom.bridge.old")).toBe(true);
    expect(parseLaunchctlPrintDisabled(out, "com.loom.bridge.new")).toBe(false);
    expect(parseLaunchctlPrintDisabled(out, "com.loom.bridge.other")).toBeNull();
    expect(parseLaunchctlPrintDisabled(out, "com.loom.bridge.absent")).toBeNull();
    expect(parseLaunchctlPrintDisabled(out, "com.loom.bridge.wor")).toBeNull();
  });

  test("parseSystemctlShow — running", () => {
    const out =
      "MainPID=4242\nLoadState=loaded\nActiveState=active\nSubState=running\nExecMainStatus=0\nUnitFileState=enabled\n";
    expect(parseSystemctlShow(out)).toEqual({
      loadState: "loaded",
      activeState: "active",
      subState: "running",
      mainPid: 4242,
      execMainStatus: 0,
      unitFileState: "enabled",
    });
  });

  test("parseSystemctlShow — inactive / not-found / empty values", () => {
    expect(
      parseSystemctlShow(
        "LoadState=loaded\nActiveState=inactive\nSubState=dead\nMainPID=0\nExecMainStatus=1\nUnitFileState=disabled\n",
      ),
    ).toEqual({
      loadState: "loaded",
      activeState: "inactive",
      subState: "dead",
      mainPid: null,
      execMainStatus: 1,
      unitFileState: "disabled",
    });
    expect(
      parseSystemctlShow(
        "LoadState=not-found\nActiveState=inactive\nSubState=dead\nMainPID=0\nExecMainStatus=0\nUnitFileState=\n",
      ),
    ).toEqual({
      loadState: "not-found",
      activeState: "inactive",
      subState: "dead",
      mainPid: null,
      execMainStatus: 0,
      unitFileState: null,
    });
    expect(parseSystemctlShow("")).toEqual({
      loadState: null,
      activeState: null,
      subState: null,
      mainPid: null,
      execMainStatus: null,
      unitFileState: null,
    });
  });
});

// ---------------------------------------------------------------------------------------------
describe("darwin plutil -lint (R52-L3 — read-only, launchd untouched)", () => {
  test.skipIf(process.platform !== "darwin")(
    "generated plist (marker comment + escaped PATH) lints OK and round-trips via plutil",
    () => {
      const dir = mkdtempSync(join(tmpdir(), "loom-p1-plutil-"));
      try {
        const spec = { ...BASE, path: "/a&b:/c<d:/usr/bin" };
        const file = join(dir, "com.loom.bridge.work.plist");
        writeFileSync(file, renderLaunchdPlist(spec));
        const lint = spawnSync("plutil", ["-lint", file], { encoding: "utf8" });
        expect(lint.status).toBe(0);
        expect(lint.stdout.trim().endsWith("OK")).toBe(true);
        const json = spawnSync("plutil", ["-convert", "json", "-o", "-", file], {
          encoding: "utf8",
        });
        expect(json.status).toBe(0);
        const d = JSON.parse(json.stdout) as Record<string, unknown>;
        expect(d).toEqual(parsePlist(renderLaunchdPlist(spec)));
        expect((d.EnvironmentVariables as Record<string, string>).PATH).toBe(spec.path);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );
});

// ---------------------------------------------------------------------------------------------
describe("package exports (index.ts)", () => {
  test("service-units API is re-exported from @loom host index", async () => {
    const host = await import("./index");
    for (const name of [
      "bridgeConfigSafeName",
      "serviceNames",
      "serviceProfileNameCheck",
      "serviceTargetPaths",
      "renderLaunchdPlist",
      "renderSystemdUnit",
      "renderServiceMarker",
      "parseServiceMarker",
      "isLoomServiceFile",
      "classifyRunnerResult",
      "parseLaunchctlPrint",
      "parseLaunchctlPrintDisabled",
      "parseSystemctlShow",
    ]) {
      expect(typeof (host as Record<string, unknown>)[name]).toBe("function");
    }
  });
});
