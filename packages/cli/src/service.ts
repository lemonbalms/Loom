/**
 * PLAN 0.34.0 P3 — `loom service install|uninstall|start|status [--profile <p>] [--force]`.
 *
 * Registers the per-profile bridge as a launchd agent (macOS) / `systemd --user` unit (Linux).
 * Unit text, names, marker, D8 check, runner classification and parsers all come from
 * `@loom/host` `service-units.ts` (P1); this module only does the flows (② install 1–9 ·
 * uninstall · start · status) and the I/O.
 *
 * Everything that touches the OS is injected (`ServiceDeps`): runner (argv → {code, stdout,
 * stderr}), platform, uid, clock, sleep, lock inspection. The real runner refuses to run while
 * `LOOM_TEST_HOME` is set (R9), and so does `runServiceCommand` before any verb.
 */
import {
  chmodSync,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, userInfo } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import {
  type BridgeConfig,
  type BridgeLockInspection,
  type LoomSession,
  type ServiceManagerKind,
  type ServiceNames,
  type ServiceRunner,
  type ServiceRunnerResult,
  type ServiceTargetPaths,
  type ServiceUnitSpec,
  bridgeLockPath,
  bridgeLogPath,
  bridgeMainPath,
  bridgeStatusPath,
  classifyRunnerResult,
  getActiveProfile,
  inspectBridgeLockAt,
  isLoomServiceFile,
  loadBridgeConfig,
  loadSession,
  loomDir,
  parseLaunchctlPrint,
  parseLaunchctlPrintDisabled,
  parseSystemctlShow,
  readBridgeStatusFile,
  renderLaunchdPlist,
  renderSystemdUnit,
  resolveBridgeProfile,
  serviceNames,
  serviceProfileNameCheck,
  serviceTargetPaths,
  sessionPath,
  setActiveProfile,
  topLevelToBinding,
} from "@loom/host";
import { parseRelayUrl } from "@loom/protocol";
import { isLoopbackHost } from "@loom/relay";

export const SERVICE_USAGE =
  "Usage: loom service install|uninstall|start|status [--profile <p>] [--force]";

const R9_MESSAGE = "LOOM_TEST_HOME set — refusing to call the real service manager";
const DISABLED_MESSAGE =
  "disabled in Login Items / launchctl — enable it in System Settings → General → Login Items";

/** ② start: same bound as `loom bridge start` (`bridge-spawn.ts`). */
const START_POLL_MS = 12_000;
/** R52-M2: launchd `ExitTimeOut` 20 + 5. */
const BOOTOUT_POLL_MS = 25_000;
const POLL_STEP_MS = 250;
const RUNNER_TIMEOUT_MS = 10_000;
const SYSTEMD_SHOW_PROPS = "LoadState,ActiveState,SubState,MainPID,ExecMainStatus,UnitFileState";

const VERBS = ["install", "uninstall", "start", "status"] as const;
type Verb = (typeof VERBS)[number];

export type ServiceOptions = { profile?: string; force?: boolean };

export interface ServiceDeps {
  runner: ServiceRunner;
  platform: string;
  uid: number;
  /** Login name — only printed in the `loginctl enable-linger` hint (never run). */
  user: string;
  /** PATH capture · token env (R5) · LOOM_TEST_HOME (R9 · target home). */
  env: Record<string, string | undefined>;
  execPath: string;
  bridgeMainPath: () => string;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  out: (line: string) => void;
  err: (line: string) => void;
  inspectLock: (profile: string) => BridgeLockInspection;
  /** CLI VERSION for the unit marker. */
  loomVersion: string;
}

const REAL_PROGRAMS = new Set(["launchctl", "systemctl", "loginctl"]);

/**
 * The only path to the real service manager. Refuses under `LOOM_TEST_HOME` (R9) and anything
 * but launchctl / systemctl / loginctl. Each call is bounded (10 s).
 */
export const realServiceRunner: ServiceRunner = async (argv) => {
  if (process.env.LOOM_TEST_HOME) return { code: 1, stdout: "", stderr: R9_MESSAGE };
  const program = argv[0] ?? "";
  if (!REAL_PROGRAMS.has(program)) {
    return { code: 1, stdout: "", stderr: `loom service: refusing to run "${program}"` };
  }
  try {
    const proc = Bun.spawn({
      cmd: argv,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      timeout: RUNNER_TIMEOUT_MS,
      killSignal: "SIGKILL",
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { code, stdout, stderr };
  } catch (e) {
    return { code: 127, stdout: "", stderr: e instanceof Error ? e.message : String(e) };
  }
};

function defaultDeps(): ServiceDeps {
  let user = process.env.USER ?? "";
  try {
    user = userInfo().username;
  } catch {
    /* keep $USER */
  }
  return {
    runner: realServiceRunner,
    platform: process.platform,
    uid: process.getuid?.() ?? 0,
    user: user || "<user>",
    env: process.env,
    execPath: process.execPath,
    bridgeMainPath,
    now: () => Date.now(),
    sleep: (ms) => Bun.sleep(ms),
    out: (line) => console.log(line),
    err: (line) => console.error(line),
    inspectLock: (profile) => inspectBridgeLockAt(bridgeLockPath(profile)),
    loomVersion: "dev",
  };
}

type Ctx = {
  d: ServiceDeps;
  kind: ServiceManagerKind;
  profile: string;
  names: ServiceNames;
  paths: ServiceTargetPaths;
  home: string;
};

type SvcState = {
  /** classification of the read query (`no_domain` / `no_bus` = manager unreachable). */
  cls: ReturnType<typeof classifyRunnerResult>;
  loaded: boolean;
  running: boolean;
  mainPid: number | null;
  lastExit: number | null;
};

/** Returns the exit code: 0 · 1 refused/error/usage · 3 "written; loads at next login". */
export async function runServiceCommand(
  verb: string,
  opts: ServiceOptions = {},
  deps: Partial<ServiceDeps> = {},
): Promise<number> {
  const d: ServiceDeps = { ...defaultDeps(), ...deps };
  if (!(VERBS as readonly string[]).includes(verb)) {
    d.err(SERVICE_USAGE);
    return 1;
  }
  const kind: ServiceManagerKind | null =
    d.platform === "darwin" ? "launchd" : d.platform === "linux" ? "systemd" : null;
  if (!kind) {
    d.err(`loom service: unsupported platform ${d.platform}`);
    return 1;
  }
  if (d.env.LOOM_TEST_HOME && d.runner === realServiceRunner) {
    d.err(R9_MESSAGE);
    return 1;
  }
  if (opts.profile) setActiveProfile(opts.profile, { explicit: true });
  const profile = resolveBridgeProfile();
  const check = serviceProfileNameCheck(profile);
  if (!check.ok) {
    if (verb === "status") {
      d.out(`service: ${check.message}`);
      return 0;
    }
    d.err(check.message);
    return 1;
  }
  const home = d.env.LOOM_TEST_HOME || homedir();
  const ctx: Ctx = {
    d,
    kind,
    profile,
    names: serviceNames(profile),
    paths: serviceTargetPaths(home, profile, d.platform),
    home,
  };
  switch (verb as Verb) {
    case "install":
      return install(ctx, opts.force === true);
    case "uninstall":
      return uninstall(ctx, opts.force === true);
    case "start":
      return start(ctx);
    case "status":
      return status(ctx);
  }
}

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------

const domain = (c: Ctx) => `gui/${c.d.uid}`;
const serviceTarget = (c: Ctx) => `gui/${c.d.uid}/${c.names.label}`;

function foreignMessage(path: string): string {
  return `${path} exists and is not a Loom service file — not touching it`;
}

function readText(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function lstatOrNull(path: string): ReturnType<typeof lstatSync> | null {
  try {
    return lstatSync(path);
  } catch {
    return null;
  }
}

function firstLine(s: string): string {
  return (
    s
      .split("\n")
      .map((l) => l.trim())
      .find(Boolean) ?? ""
  );
}

function runnerDetail(r: ServiceRunnerResult): string {
  return firstLine(r.stderr) || firstLine(r.stdout) || "(no output)";
}

function lastLogLine(path: string): string | null {
  const text = readText(path);
  if (!text) return null;
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const last = lines[lines.length - 1];
  return last ? last.slice(0, 400) : null;
}

async function call(c: Ctx, argv: string[]): Promise<ServiceRunnerResult> {
  return c.d.runner(argv);
}

async function query(c: Ctx): Promise<SvcState> {
  if (c.kind === "launchd") {
    const r = await call(c, ["launchctl", "print", serviceTarget(c)]);
    const cls = classifyRunnerResult("launchd", r);
    if (r.code !== 0) return { cls, loaded: false, running: false, mainPid: null, lastExit: null };
    const p = parseLaunchctlPrint(r.stdout);
    return { cls, loaded: true, running: p.running, mainPid: p.pid, lastExit: p.lastExitCode };
  }
  const r = await call(c, ["systemctl", "--user", "show", c.names.unitName, "-p", SYSTEMD_SHOW_PROPS]);
  const cls = classifyRunnerResult("systemd", r);
  if (r.code !== 0) return { cls, loaded: false, running: false, mainPid: null, lastExit: null };
  const s = parseSystemctlShow(r.stdout);
  const running = s.activeState === "active";
  return {
    cls,
    loaded: s.loadState === "loaded",
    running,
    mainPid: running ? s.mainPid : null,
    lastExit: s.execMainStatus,
  };
}

/** Live lock holder pid (read-only `inspect` verdict reuse), or null. */
function liveHolder(c: Ctx): number | null {
  const ins = c.d.inspectLock(c.profile);
  return ins.kind === "held" ? ins.pid : null;
}

/** R7: in-flight sum of the SERVICE bridge (status file written by its main pid). */
function inFlight(c: Ctx, mainPid: number | null): number {
  const st = readBridgeStatusFile(bridgeStatusPath(c.profile));
  if (!st || mainPid === null || st.pid !== mainPid) return 0;
  return st.inFlight.paneCards + st.inFlight.convs + st.inFlight.headlessRunning;
}

/** R7 guard for every verb that stops a running service bridge. null = proceed. */
function inFlightGuard(c: Ctx, q: SvcState, force: boolean): number | null {
  if (!q.running) return null;
  const n = inFlight(c, q.mainPid);
  if (n > 0 && !force) {
    c.d.err(`service bridge has ${n} in-flight — loom bridge drain first, or --force`);
    return 1;
  }
  c.d.out(`will stop the running service bridge (pid ${q.mainPid ?? "?"})`);
  return null;
}

/**
 * R10 · R52-L2 outcome of a load/start call. null = ok. Unreachable manager → exit 3 with the
 * given wording; disabled → 1; anything else (incl. code-only) → 1 with the raw output.
 */
function outcome(c: Ctx, argv: string[], r: ServiceRunnerResult, unreachable: string): number | null {
  const cls = classifyRunnerResult(c.kind, r);
  if (cls === "ok") return null;
  if (cls === "no_domain" || cls === "no_bus") {
    c.d.out(unreachable);
    return 3;
  }
  if (cls === "disabled") {
    c.d.err(DISABLED_MESSAGE);
    return 1;
  }
  c.d.err(`${argv.join(" ")} failed (code ${r.code}): ${runnerDetail(r)}`);
  return 1;
}

/** ② start: poll until the status file says `running` with pid == the service main pid. */
async function waitRunning(c: Ctx): Promise<number> {
  const deadline = c.d.now() + START_POLL_MS;
  const statusPath = bridgeStatusPath(c.profile);
  for (;;) {
    const q = await query(c);
    const st = readBridgeStatusFile(statusPath);
    if (q.running && q.mainPid !== null && st?.state === "running" && st.pid === q.mainPid) {
      c.d.out(`service running (pid ${q.mainPid})`);
      return 0;
    }
    if (c.d.now() >= deadline) break;
    await c.d.sleep(POLL_STEP_MS);
  }
  const last = lastLogLine(bridgeLogPath(c.profile));
  c.d.err(
    `service did not report running within ${START_POLL_MS / 1000} s${last ? ` — last log: ${last}` : ""}`,
  );
  return 1;
}

/** Start an already-loaded service: launchd `kickstart` (never `-k`, R14) / `systemctl start`. */
async function startLoaded(c: Ctx, unreachable: string): Promise<number> {
  const argv =
    c.kind === "launchd"
      ? ["launchctl", "kickstart", serviceTarget(c)]
      : ["systemctl", "--user", "start", c.names.unitName];
  const bad = outcome(c, argv, await call(c, argv), unreachable);
  if (bad !== null) return bad;
  return waitRunning(c);
}

/** ② install 9 / start of a not-loaded service: bootstrap / daemon-reload → start. */
async function loadService(c: Ctx, unreachable: string): Promise<number> {
  if (c.kind === "launchd") {
    const argv = ["launchctl", "bootstrap", domain(c), c.paths.unitPath];
    const bad = outcome(c, argv, await call(c, argv), unreachable);
    if (bad !== null) return bad;
    return waitRunning(c);
  }
  const reload = ["systemctl", "--user", "daemon-reload"];
  const bad = outcome(c, reload, await call(c, reload), unreachable);
  if (bad !== null) return bad;
  return startLoaded(c, unreachable);
}

/**
 * Stop a loaded service before rewriting its unit (② install 6c · R52-M1·M2): launchd `bootout`
 * then poll `print` until not-found (≤25 s); systemd `stop` is synchronous.
 */
async function stopLoaded(c: Ctx): Promise<number | null> {
  if (c.kind === "systemd") {
    const argv = ["systemctl", "--user", "stop", c.names.unitName];
    const r = await call(c, argv);
    if (r.code === 0) return null;
    c.d.err(`${argv.join(" ")} failed (code ${r.code}): ${runnerDetail(r)}`);
    return 1;
  }
  const argv = ["launchctl", "bootout", serviceTarget(c)];
  const r = await call(c, argv);
  if (classifyRunnerResult("launchd", r) !== "ok") {
    c.d.err(`${argv.join(" ")} failed (code ${r.code}): ${runnerDetail(r)}`);
    return 1;
  }
  const deadline = c.d.now() + BOOTOUT_POLL_MS;
  for (;;) {
    const p = await call(c, ["launchctl", "print", serviceTarget(c)]);
    if (p.code !== 0) return null;
    if (c.d.now() >= deadline) {
      c.d.err(`bootout did not complete within ${BOOTOUT_POLL_MS / 1000} s`);
      return 1;
    }
    await c.d.sleep(POLL_STEP_MS);
  }
}

/** ② install 7: pane warning · Linux linger line (+ hint; Loom never runs enable-linger). */
async function installNotes(c: Ctx, cfg: BridgeConfig): Promise<void> {
  if (cfg.worker?.backend !== "headless") {
    c.d.out("warn: pane backend — the service crash-loops (exit 1 every 10 s) while herdr is down");
  }
  if (c.kind !== "systemd") return;
  const linger = await queryLinger(c);
  c.d.out(`linger: ${linger}`);
  if (linger === "no") {
    c.d.out(
      `run 'loginctl enable-linger ${c.d.user}' yourself to keep the service (and workers) alive after logout`,
    );
  }
}

async function queryLinger(c: Ctx): Promise<"yes" | "no" | "unknown"> {
  const r = await call(c, ["loginctl", "show-user", String(c.d.uid), "-p", "Linger"]);
  if (r.code !== 0) return "unknown";
  const m = /^Linger=(yes|no)\s*$/m.exec(r.stdout);
  return m ? (m[1] as "yes" | "no") : "unknown";
}

/** ② 로그: `loomDir()/bridge` 0700 · log O_APPEND|O_CREAT 0600 + chmod · never truncated. */
function prepareLog(c: Ctx): void {
  const dir = join(loomDir(), "bridge");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  const log = bridgeLogPath(c.profile);
  const fd = openSync(log, "a", 0o600);
  try {
    chmodSync(log, 0o600);
  } finally {
    closeSync(fd);
  }
}

/** Atomic write (tmp + rename), mode 0644. */
function writeUnit(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
  try {
    writeFileSync(tmp, text, { mode: 0o644 });
    chmodSync(tmp, 0o644);
    renameSync(tmp, path);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
}

/** R8: create `default.target.wants/<unit>` → `../<unit>` as a file operation (no `enable`). */
function ensureWantsLink(paths: ServiceTargetPaths): void {
  if (paths.kind !== "systemd") return;
  const st = lstatOrNull(paths.wantsLinkPath);
  if (st?.isSymbolicLink()) {
    if (readlinkSync(paths.wantsLinkPath) === paths.wantsLinkTarget) return;
    unlinkSync(paths.wantsLinkPath);
  }
  mkdirSync(dirname(paths.wantsLinkPath), { recursive: true });
  symlinkSync(paths.wantsLinkTarget, paths.wantsLinkPath);
}

/** A wants entry that is not a symlink is someone else's file. */
function foreignWants(paths: ServiceTargetPaths): string | null {
  if (paths.kind !== "systemd") return null;
  const st = lstatOrNull(paths.wantsLinkPath);
  return st && !st.isSymbolicLink() ? paths.wantsLinkPath : null;
}

function removeUnitFiles(c: Ctx): void {
  const p = c.paths;
  if (p.kind === "systemd" && lstatOrNull(p.wantsLinkPath)?.isSymbolicLink()) {
    unlinkSync(p.wantsLinkPath);
  }
  rmSync(p.unitPath, { force: true });
}

/** R5 · R52-L1: the token as stored on disk (session field or legacy URL `?token=`), no env. */
function diskRelayToken(): string | undefined {
  try {
    const raw = JSON.parse(readFileSync(sessionPath(), "utf8")) as LoomSession;
    return topLevelToBinding(raw).relayToken || undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------------------------
// Verbs
// ---------------------------------------------------------------------------------------------

async function install(c: Ctx, force: boolean): Promise<number> {
  const { d } = c;
  // 2 — session · loopback · env-only token · dispatchers
  const session = loadSession();
  if (!session) {
    d.err("No session. Create or join a room first.");
    return 1;
  }
  let host: string;
  let isLocal: boolean;
  try {
    const ep = parseRelayUrl(session.relayUrl);
    host = ep.host;
    isLocal = ep.isLocal;
  } catch (e) {
    d.err(`relay url invalid: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
  if (isLocal || isLoopbackHost(host)) {
    d.err("loopback relay — loom service needs a reachable relay (0.33.0 D1)");
    return 1;
  }
  if (!diskRelayToken() && (d.env.LOOM_RELAY_TOKEN || d.env.FABLE_RELAY_TOKEN)) {
    d.err("relay token only in env — save it to the session (loom join …) first");
    return 1;
  }
  let cfg: BridgeConfig;
  try {
    cfg = loadBridgeConfig(c.profile);
  } catch (e) {
    d.err(`bridge config invalid: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
  if (cfg.authorizedDispatchers.length === 0) {
    d.err(
      "M-1: authorizedDispatchers empty — default deny. Set with: loom bridge start --allow <towerPeerId>",
    );
    return 1;
  }
  // 3 — absolute bun + bridge-main.ts, pinned into the unit
  if (!isAbsolute(d.execPath) || !existsSync(d.execPath)) {
    d.err(`cannot find bun at ${d.execPath}`);
    return 1;
  }
  let main: string;
  try {
    main = d.bridgeMainPath();
    if (!isAbsolute(main)) throw new Error("not absolute");
  } catch {
    d.err("cannot find bridge-main.ts — run install from the Loom source checkout");
    return 1;
  }
  const spec: ServiceUnitSpec = {
    profile: c.profile,
    execPath: d.execPath,
    bridgeMainPath: main,
    home: c.home,
    path: d.env.PATH ?? "",
    sessionPath: resolve(sessionPath()),
    loomProfile: getActiveProfile() ?? undefined,
    logPath: bridgeLogPath(c.profile),
    loomVersion: d.loomVersion,
  };
  let text: string;
  try {
    text = c.kind === "launchd" ? renderLaunchdPlist(spec) : renderSystemdUnit(spec);
  } catch (e) {
    d.err(`loom service: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
  // 4 — target file: absent / foreign / Loom marker
  const unitPath = c.paths.unitPath;
  const existing = readText(unitPath);
  if (existing === null && existsSync(unitPath)) {
    d.err(foreignMessage(unitPath));
    return 1;
  }
  if (existing !== null && !isLoomServiceFile(existing, c.profile)) {
    d.err(foreignMessage(unitPath));
    return 1;
  }
  const wantsForeign = foreignWants(c.paths);
  if (wantsForeign) {
    d.err(foreignMessage(wantsForeign));
    return 1;
  }
  // 5 — human-run bridge holds the lock
  const q = await query(c);
  const holder = liveHolder(c);
  if (holder !== null && holder !== q.mainPid) {
    d.err(`bridge pid ${holder} is running outside the service — loom bridge stop first`);
    return 1;
  }
  const nextLogin = `written; loads at next login (${unitPath})`;
  // 6 — reinstall candidate (R52-M1: bootout condition = loaded)
  const same = existing !== null && existing === text;
  if (existing !== null) {
    if (same && q.loaded) {
      if (q.running) {
        d.out(`already installed (up to date, pid ${q.mainPid ?? "?"})`);
        return 0;
      }
      return startLoaded(c, nextLogin);
    }
    if (!same && q.loaded) {
      const guard = inFlightGuard(c, q, force);
      if (guard !== null) return guard;
      const stopped = await stopLoaded(c);
      if (stopped !== null) return stopped;
    }
  }
  // 7 — notes
  await installNotes(c, cfg);
  // 8 — log · unit · wants link
  try {
    prepareLog(c);
    if (!same) writeUnit(unitPath, text);
    ensureWantsLink(c.paths);
  } catch (e) {
    d.err(`loom service: write failed: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
  d.out(`${same ? "unchanged" : "wrote"} ${unitPath}`);
  // 9 — load
  return loadService(c, nextLogin);
}

async function uninstall(c: Ctx, force: boolean): Promise<number> {
  const { d } = c;
  const unitPath = c.paths.unitPath;
  const existing = readText(unitPath);
  if (existing === null && !existsSync(unitPath)) {
    d.out(`not installed (${unitPath})`);
    return 0;
  }
  if (existing === null || !isLoomServiceFile(existing, c.profile)) {
    d.err(foreignMessage(unitPath));
    return 1;
  }
  const q = await query(c);
  if (c.kind === "systemd" && q.cls === "no_bus") {
    removeUnitFiles(c);
    d.out(`removed; the running service (if any) stops at logout (${unitPath})`);
    return 0;
  }
  const guard = inFlightGuard(c, q, force);
  if (guard !== null) return guard;
  if (c.kind === "launchd") {
    if (q.loaded) {
      const argv = ["launchctl", "bootout", serviceTarget(c)];
      const r = await call(c, argv);
      if (r.code !== 0) {
        d.err(`${argv.join(" ")} failed (code ${r.code}): ${runnerDetail(r)}`);
        return 1;
      }
    }
    removeUnitFiles(c);
  } else {
    const stop = ["systemctl", "--user", "stop", c.names.unitName];
    const r = await call(c, stop);
    if (r.code !== 0) {
      d.err(`${stop.join(" ")} failed (code ${r.code}): ${runnerDetail(r)}`);
      return 1;
    }
    removeUnitFiles(c);
    const reload = ["systemctl", "--user", "daemon-reload"];
    const rr = await call(c, reload);
    if (rr.code !== 0) d.err(`warn: ${reload.join(" ")} failed (code ${rr.code}) — unit file already removed`);
  }
  d.out(`removed ${unitPath}`);
  return 0;
}

async function start(c: Ctx): Promise<number> {
  const { d } = c;
  const unitPath = c.paths.unitPath;
  const existing = readText(unitPath);
  if (existing === null && !existsSync(unitPath)) {
    d.err(`not installed (${unitPath}) — run loom service install`);
    return 1;
  }
  if (existing === null || !isLoomServiceFile(existing, c.profile)) {
    d.err(foreignMessage(unitPath));
    return 1;
  }
  const q = await query(c);
  const holder = liveHolder(c);
  if (holder !== null && holder !== q.mainPid) {
    d.err(`bridge pid ${holder} runs outside the service — loom bridge stop first`);
    return 1;
  }
  if (c.kind === "launchd") {
    const r = await call(c, ["launchctl", "print-disabled", domain(c)]);
    if (r.code === 0 && parseLaunchctlPrintDisabled(r.stdout, c.names.label) === true) {
      d.err(DISABLED_MESSAGE);
      return 1;
    }
  }
  if (q.running) {
    d.out(`already running (pid ${q.mainPid ?? "?"})`);
    return 0;
  }
  const unreachable = `not loaded now (no GUI session / user bus) — loads at next login (${unitPath})`;
  return q.loaded ? startLoaded(c, unreachable) : loadService(c, unreachable);
}

/** ② status: read-only, always exit 0 (R6). P4 replaces the body with doctor's serviceSection. */
async function status(c: Ctx): Promise<number> {
  const { d } = c;
  const unitPath = c.paths.unitPath;
  const name = c.kind === "launchd" ? c.names.label : c.names.unitName;
  d.out(`service: ${name} (${unitPath})`);
  const existing = readText(unitPath);
  if (existing === null && !existsSync(unitPath)) {
    d.out("  installed: no (not installed)");
    return 0;
  }
  if (existing === null || !isLoomServiceFile(existing, c.profile)) {
    d.out(`  installed: ${foreignMessage(unitPath)}`);
    return 0;
  }
  d.out("  installed: yes");
  const q = await query(c);
  if (!q.loaded) {
    d.out(q.cls === "ok" || q.cls === "error" ? "  loaded: no" : `  loaded: unknown (${q.cls})`);
  } else if (q.running) {
    d.out(`  loaded: yes · running pid ${q.mainPid ?? "?"}`);
  } else {
    d.out(`  loaded: yes · not running${q.lastExit !== null ? ` (last exit code ${q.lastExit})` : ""}`);
  }
  const holder = liveHolder(c);
  if (holder !== null && holder !== q.mainPid) {
    d.out(`  bridge pid ${holder} runs outside the service`);
  }
  d.out(`  log: ${bridgeLogPath(c.profile)}`);
  if (c.kind === "systemd") d.out(`  linger: ${await queryLinger(c)}`);
  return 0;
}
