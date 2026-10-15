/**
 * PLAN 0.34.0 P1 — pure `loom service` unit generators + names (D2 · D4 · D8 · R3 · R4 · R6 · R10).
 *
 * Pure: no file I/O, no env reads, no launchctl/systemctl. Callers (P3 `service.ts`, P4 doctor)
 * do the I/O and pass results in. The unit never carries a secret: env is exactly
 * {HOME, PATH, LOOM_SERVICE, LOOM_SESSION, LOOM_PROFILE?} — the bridge reads its relay token from
 * the 0600 session file (② env 금지).
 */
import { posix } from "node:path";
import { bridgeConfigSafeName } from "./bridge-config";
import { sanitizeProfileLogName } from "./bridge-spawn";

/** ② runner: injected service-manager call (`launchctl …` / `systemctl --user …`). */
export type ServiceRunnerResult = { code: number; stdout: string; stderr: string };
export type ServiceRunner = (argv: string[]) => Promise<ServiceRunnerResult>;

export type ServiceManagerKind = "launchd" | "systemd";

/** Everything a unit file needs — all resolved by the caller at install time (D4 · R3). */
export type ServiceUnitSpec = {
  /** D8-checked profile name (`resolveBridgeProfile()` / `--profile`). */
  profile: string;
  /** Absolute bun (`process.execPath` at install time). */
  execPath: string;
  /** Absolute `bridge-main.ts`. */
  bridgeMainPath: string;
  /** HOME — also WorkingDirectory (R4). */
  home: string;
  /** PATH captured at install time. */
  path: string;
  /** Absolute session file → `LOOM_SESSION` (always, R3). */
  sessionPath: string;
  /** Active profile → `LOOM_PROFILE` (only when set, R3). */
  loomProfile?: string;
  /** Absolute stderr log (`bridgeLogPath(p)`), appended by the service manager. */
  logPath: string;
  /** CLI VERSION for the marker. */
  loomVersion: string;
};

// ---------------------------------------------------------------------------------------------
// Names (D8)
// ---------------------------------------------------------------------------------------------

export type ServiceProfileNameCheck =
  | { ok: true; name: string }
  | { ok: false; config: string; lockLog: string; message: string };

/**
 * D8: the service is named with the lock/status sanitizer; a profile whose config-file name and
 * lock/log name differ is refused (service · config · lock · status · log must share one name).
 * ② "same ⇒ sanitized == original" is enforced too: names the sanitizers agree on but rewrite
 * (leading out-of-range chars — "한글" → "__", " x" → "_x") are refused, so the marker
 * `profile=<p>` and every file name are the profile name itself.
 */
export function serviceProfileNameCheck(profile: string): ServiceProfileNameCheck {
  const config = bridgeConfigSafeName(profile);
  const lockLog = sanitizeProfileLogName(profile);
  if (config !== lockLog) {
    return {
      ok: false,
      config,
      lockLog,
      message: `profile name "${profile}" maps to different file names (config "${config}" vs lock/log "${lockLog}") — rename the profile`,
    };
  }
  if (lockLog !== profile) {
    return {
      ok: false,
      config,
      lockLog,
      message: `profile name "${profile}" is not a valid service name (its files would be named "${lockLog}") — rename the profile`,
    };
  }
  return { ok: true, name: profile };
}

export type ServiceNames = { profile: string; label: string; unitName: string };

/** launchd Label `com.loom.bridge.<p>` · systemd unit `loom-bridge-<p>.service` (lock/log sanitizer). */
export function serviceNames(profile: string): ServiceNames {
  const p = sanitizeProfileLogName(profile);
  return { profile: p, label: `com.loom.bridge.${p}`, unitName: `loom-bridge-${p}.service` };
}

export type ServiceTargetPaths =
  | { kind: "launchd"; unitPath: string }
  | { kind: "systemd"; unitPath: string; wantsLinkPath: string; wantsLinkTarget: string };

/** ② 대상 경로. `home` = `LOOM_TEST_HOME` or `homedir()` (caller resolves). */
export function serviceTargetPaths(
  home: string,
  profile: string,
  platform: string,
): ServiceTargetPaths {
  const n = serviceNames(profile);
  if (platform === "darwin") {
    return {
      kind: "launchd",
      unitPath: posix.join(home, "Library/LaunchAgents", `${n.label}.plist`),
    };
  }
  if (platform === "linux") {
    const userDir = posix.join(home, ".config/systemd/user");
    return {
      kind: "systemd",
      unitPath: posix.join(userDir, n.unitName),
      wantsLinkPath: posix.join(userDir, "default.target.wants", n.unitName),
      wantsLinkTarget: `../${n.unitName}`,
    };
  }
  throw new Error(`loom service: unsupported platform ${platform}`);
}

// ---------------------------------------------------------------------------------------------
// Marker (② 마커)
// ---------------------------------------------------------------------------------------------

export function renderServiceMarker(
  kind: ServiceManagerKind,
  profile: string,
  loomVersion: string,
): string {
  const body = `loom-service v1 profile=${profile} loom=${loomVersion}`;
  return kind === "launchd" ? `<!-- ${body} -->` : `# ${body}`;
}

const MARKER_RE = /^(<!--|#) loom-service v1 profile=(\S+) loom=(\S+)/;

/** First 3 lines only. `null` = no Loom marker (foreign file). */
export function parseServiceMarker(text: string): { profile: string; loomVersion: string } | null {
  for (const line of text.split("\n", 3)) {
    const m = MARKER_RE.exec(line);
    if (m) return { profile: m[2]!, loomVersion: m[3]! };
  }
  return null;
}

/** Loom file for THIS profile — a marker naming another profile is someone else's file. */
export function isLoomServiceFile(text: string, profile: string): boolean {
  return parseServiceMarker(text)?.profile === profile;
}

// ---------------------------------------------------------------------------------------------
// Generators (D2 · D4)
// ---------------------------------------------------------------------------------------------

function validateSpec(spec: ServiceUnitSpec): ServiceNames {
  const check = serviceProfileNameCheck(spec.profile);
  if (!check.ok) throw new Error(check.message);
  for (const key of ["execPath", "bridgeMainPath", "home", "sessionPath", "logPath"] as const) {
    if (!posix.isAbsolute(spec[key])) {
      throw new Error(`service unit: ${key} must be an absolute path (got "${spec[key]}")`);
    }
  }
  return serviceNames(spec.profile);
}

/** ② env — exactly these keys, in this order; nothing read from process.env. */
function unitEnv(spec: ServiceUnitSpec): Array<[string, string]> {
  const env: Array<[string, string]> = [
    ["HOME", spec.home],
    ["PATH", spec.path],
    ["LOOM_SERVICE", "1"],
    ["LOOM_SESSION", spec.sessionPath],
  ];
  if (spec.loomProfile) env.push(["LOOM_PROFILE", spec.loomProfile]);
  return env;
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** launchd plist — top-level keys exactly ② (no `ProcessType`, R4). */
export function renderLaunchdPlist(spec: ServiceUnitSpec): string {
  const n = validateSpec(spec);
  const s = (v: string) => `<string>${xmlEscape(v)}</string>`;
  const key = (k: string) => `\t<key>${k}</key>`;
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    renderServiceMarker("launchd", n.profile, spec.loomVersion),
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<dict>",
    key("Label"),
    `\t${s(n.label)}`,
    key("ProgramArguments"),
    "\t<array>",
    `\t\t${s(spec.execPath)}`,
    `\t\t${s(spec.bridgeMainPath)}`,
    "\t</array>",
    key("EnvironmentVariables"),
    "\t<dict>",
    ...unitEnv(spec).flatMap(([k, v]) => [`\t\t<key>${k}</key>`, `\t\t${s(v)}`]),
    "\t</dict>",
    key("WorkingDirectory"),
    `\t${s(spec.home)}`,
    key("RunAtLoad"),
    "\t<true/>",
    key("KeepAlive"),
    "\t<dict>",
    "\t\t<key>SuccessfulExit</key>",
    "\t\t<false/>",
    "\t</dict>",
    key("ThrottleInterval"),
    "\t<integer>10</integer>",
    key("ExitTimeOut"),
    "\t<integer>20</integer>",
    key("AbandonProcessGroup"),
    "\t<true/>",
    key("StandardOutPath"),
    `\t${s("/dev/null")}`,
    key("StandardErrorPath"),
    `\t${s(spec.logPath)}`,
    "</dict>",
    "</plist>",
  ];
  return `${lines.join("\n")}\n`;
}

/** systemd specifier escape — `%` is expanded in every setting this unit uses. */
function sdPercent(v: string): string {
  return v.replace(/%/g, "%%");
}

function sdNeedsQuote(v: string): boolean {
  return /[\s"\\']/.test(v);
}

function sdQuote(v: string): string {
  return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** ExecStart argument: `%`→`%%` · `$`→`$$` (systemd expands `$VAR` in command lines) · quoted if needed. */
function sdExecArg(v: string): string {
  const e = sdPercent(v).replace(/\$/g, "$$$$");
  return sdNeedsQuote(e) ? sdQuote(e) : e;
}

/**
 * `Environment=` assignment: `%`→`%%`; the whole `K=V` is quoted when V has whitespace / `"` / `\`.
 * `$` is NOT escaped — systemd.exec(5): no variable expansion in Environment=, "$" has no meaning.
 */
function sdEnvAssignment(k: string, v: string): string {
  const a = `${k}=${sdPercent(v)}`;
  return sdNeedsQuote(a) ? sdQuote(a) : a;
}

/** systemd `--user` unit — lines exactly ② (KillMode=process, no network-online, no StartLimit*). */
export function renderSystemdUnit(spec: ServiceUnitSpec): string {
  const n = validateSpec(spec);
  const values = [spec.execPath, spec.bridgeMainPath, spec.home, spec.path, spec.sessionPath];
  values.push(spec.logPath, spec.loomProfile ?? "", spec.loomVersion);
  if (values.some((v) => /[\r\n]/.test(v))) {
    throw new Error("service unit: value contains a newline");
  }
  const lines = [
    renderServiceMarker("systemd", n.profile, spec.loomVersion),
    "[Unit]",
    `Description=Loom bridge (${sdPercent(n.profile)})`,
    "",
    "[Service]",
    "Type=simple",
    `ExecStart=${sdExecArg(spec.execPath)} ${sdExecArg(spec.bridgeMainPath)}`,
    // Path-valued settings take the rest of the line literally (no unquoting) — `%` only.
    `WorkingDirectory=${sdPercent(spec.home)}`,
    ...unitEnv(spec).map(([k, v]) => `Environment=${sdEnvAssignment(k, v)}`),
    "KillMode=process",
    "Restart=on-failure",
    "RestartSec=10",
    "TimeoutStopSec=30",
    "StandardOutput=null",
    `StandardError=append:${sdPercent(spec.logPath)}`,
    "",
    "[Install]",
    "WantedBy=default.target",
  ];
  return `${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------------------------------------
// Runner result classification (R10 · R52-L2)
// ---------------------------------------------------------------------------------------------

export type RunnerClass = "ok" | "no_domain" | "no_bus" | "disabled" | "error";

const LAUNCHD_NO_DOMAIN = /Input\/output error|Domain does not support|Could not find domain/;
const LAUNCHD_DISABLED = /disabled/i;
const SYSTEMD_NO_BUS = /Failed to connect to bus|XDG_RUNTIME_DIR/;

/**
 * R10 / R52-L2: `no_domain` / `no_bus` / `disabled` REQUIRE a stderr pattern — an exit code alone
 * (5 · 125 · 119 …) is `error`. Unclassified → `error`. Patterns are provisional until UK-3.
 * `disabled` is checked before `no_domain` so an explicit "disabled" never becomes the exit-3
 * "loads at next login" promise.
 */
export function classifyRunnerResult(
  kind: ServiceManagerKind,
  r: ServiceRunnerResult,
): RunnerClass {
  if (r.code === 0) return "ok";
  if (kind === "launchd") {
    if (LAUNCHD_DISABLED.test(r.stderr)) return "disabled";
    if (LAUNCHD_NO_DOMAIN.test(r.stderr)) return "no_domain";
    return "error";
  }
  if (SYSTEMD_NO_BUS.test(r.stderr)) return "no_bus";
  return "error";
}

// ---------------------------------------------------------------------------------------------
// Read-only query parsers (D7)
// ---------------------------------------------------------------------------------------------

export type LaunchctlPrint = {
  state: string | null;
  running: boolean;
  pid: number | null;
  lastExitCode: number | null;
  path: string | null;
  program: string | null;
};

function toInt(v: string | undefined): number | null {
  if (v === undefined || !/^-?\d+$/.test(v)) return null;
  return Number(v);
}

/** `launchctl print gui/<uid>/<label>` — top-level (one-tab) fields only. */
export function parseLaunchctlPrint(stdout: string): LaunchctlPrint {
  const top = new Map<string, string>();
  for (const line of stdout.split("\n")) {
    const m = /^\t([^\t=][^=]*?) = (.*)$/.exec(line);
    if (m && !top.has(m[1]!)) top.set(m[1]!, m[2]!.trim());
  }
  const state = top.get("state") ?? null;
  const pid = toInt(top.get("pid"));
  return {
    state,
    running: state === "running",
    pid: pid !== null && pid > 0 ? pid : null,
    lastExitCode: toInt(top.get("last exit code")),
    path: top.get("path") ?? null,
    program: top.get("program") ?? null,
  };
}

/**
 * `launchctl print-disabled gui/<uid>` — `true` disabled · `false` enabled · `null` not listed.
 * Only the `disabled services = {…}` block counts.
 */
export function parseLaunchctlPrintDisabled(stdout: string, label: string): boolean | null {
  let inBlock = false;
  for (const line of stdout.split("\n")) {
    if (/^disabled services = \{/.test(line)) {
      inBlock = true;
      continue;
    }
    if (!inBlock) continue;
    if (/^\}/.test(line)) break;
    const m = /^\s*"([^"]+)" => (\S+)/.exec(line);
    if (!m || m[1] !== label) continue;
    if (m[2] === "disabled" || m[2] === "true") return true;
    if (m[2] === "enabled" || m[2] === "false") return false;
    return null;
  }
  return null;
}

export type SystemctlShow = {
  loadState: string | null;
  activeState: string | null;
  subState: string | null;
  mainPid: number | null;
  execMainStatus: number | null;
  unitFileState: string | null;
};

/** `systemctl --user show <unit> -p LoadState,ActiveState,SubState,MainPID,ExecMainStatus,UnitFileState`. */
export function parseSystemctlShow(stdout: string): SystemctlShow {
  const kv = new Map<string, string>();
  for (const line of stdout.split("\n")) {
    const i = line.indexOf("=");
    if (i > 0) kv.set(line.slice(0, i), line.slice(i + 1).trim());
  }
  const str = (k: string) => {
    const v = kv.get(k);
    return v ? v : null;
  };
  const mainPid = toInt(kv.get("MainPID"));
  return {
    loadState: str("LoadState"),
    activeState: str("ActiveState"),
    subState: str("SubState"),
    mainPid: mainPid !== null && mainPid > 0 ? mainPid : null,
    execMainStatus: toInt(kv.get("ExecMainStatus")),
    unitFileState: str("UnitFileState"),
  };
}
