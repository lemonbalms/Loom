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
 *
 * Home (P3 verify M): every target path hangs off `serviceHome()` — the session store's
 * `stateRootHome` rule read from process.env, the same root `loomDir()` / `sessionPath()` use.
 * Never the injected env. With any `LOOM_TEST_HOME` set (process or injected) a verb is refused
 * before any call or write unless every target (unit · wants link · log) is under it.
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
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { userInfo } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
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
  bridgeConfigSafeName,
  bridgeLockPath,
  bridgeLogPath,
  bridgeMainPath,
  bridgeStatusPath,
  classifyRunnerResult,
  getActiveProfile,
  inspectBridgeLockAt,
  isLoomServiceFile,
  isPidAlive,
  loadBridgeConfig,
  loadSession,
  loomDir,
  normalizeSession,
  parseLaunchctlPrint,
  parseLaunchctlPrintDisabled,
  parseServiceMarker,
  parseSystemctlShow,
  readBridgeStatusFile,
  readBridgeStatusFileResult,
  renderLaunchdPlist,
  renderSystemdUnit,
  resolveBridgeProfile,
  serviceNames,
  serviceProfileNameCheck,
  serviceTargetPaths,
  sessionPath,
  sessionPathUnder,
  setActiveProfile,
  stateRootHome,
  topLevelToBinding,
} from "@loom/host";
import { parseRelayUrl } from "@loom/protocol";
import { isLoopbackHost } from "@loom/relay";
import {
  type DoctorSection,
  type ServiceManagerState,
  type ServiceProbe,
  type ServiceSectionInput,
  serviceSection,
} from "./doctor";

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
  /** PATH capture · token env (R5) · LOOM_TEST_HOME (R9 · test-home guard — never the home). */
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

/** SIGKILL the child — its whole process group when it leads one (best effort). */
function killChild(pid: number, group: boolean): void {
  if (group) {
    try {
      process.kill(-pid, "SIGKILL");
      return;
    } catch {
      /* group gone or not a leader — fall back to the pid */
    }
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    /* already gone */
  }
}

/**
 * Spawn the real service manager. Refuses under `LOOM_TEST_HOME` (R9) and anything but
 * launchctl / systemctl / loginctl. After `timeoutMs` the child is SIGKILLed and this call still
 * waits for its exit (and its pipes) before resolving — nothing it spawned outlives the result
 * (P4 verify L1). `group` (read-only doctor / status queries): the child leads its own process
 * group and the whole group is killed, so a forking stand-in cannot leave a grandchild behind.
 */
async function spawnServiceManager(
  argv: string[],
  timeoutMs: number,
  group = false,
): Promise<ServiceRunnerResult> {
  if (process.env.LOOM_TEST_HOME) return { code: 1, stdout: "", stderr: R9_MESSAGE };
  const program = argv[0] ?? "";
  if (!REAL_PROGRAMS.has(program)) {
    return { code: 1, stdout: "", stderr: `loom service: refusing to run "${program}"` };
  }
  let proc: ReturnType<typeof Bun.spawn>;
  try {
    proc = Bun.spawn({
      cmd: argv,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      ...(group ? { detached: true } : {}),
    });
  } catch (e) {
    return { code: 127, stdout: "", stderr: e instanceof Error ? e.message : String(e) };
  }
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    killChild(proc.pid, group);
  }, timeoutMs);
  try {
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout as ReadableStream).text(),
      new Response(proc.stderr as ReadableStream).text(),
      proc.exited,
    ]);
    if (timedOut) {
      return { code: 137, stdout, stderr: `no answer within ${timeoutMs / 1000} s — killed` };
    }
    return { code, stdout, stderr };
  } finally {
    clearTimeout(timer);
  }
}

/** The only path to the real service manager for the verbs (each call bounded at 10 s). */
export const realServiceRunner: ServiceRunner = (argv) => spawnServiceManager(argv, RUNNER_TIMEOUT_MS);

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
  /** `<loom home>/bridge` — `loomDir()` for the verbs, `<home>/.loom` for read-only status. */
  bridgeDir: string;
  /** status only: the session read without resolving the home (null = none). */
  roSession: LoomSession | null;
  /** deps.inspectLock was injected (tests) — else status inspects the lock under `bridgeDir`. */
  customInspect: boolean;
};

/** Read-only session load (no home resolution / migration) — doctor's `loadSessionReadOnly`. */
function readSessionAt(file: string): LoomSession | null {
  try {
    const text = readFileSync(file, "utf8").trim();
    if (!text) return null;
    return normalizeSession(JSON.parse(text) as LoomSession);
  } catch {
    return null;
  }
}

type SvcState = {
  /** classification of the read query (`no_domain` / `no_bus` = manager unreachable). */
  cls: ReturnType<typeof classifyRunnerResult>;
  loaded: boolean;
  running: boolean;
  mainPid: number | null;
  lastExit: number | null;
  /** launchd `print` stdout when loaded (P3 verify L3 — the loaded job's program/arguments). */
  raw: string;
};

/**
 * The ONLY derivation of the user home the service files hang off (install · uninstall · start ·
 * status · doctor): the session store's rule, from process.env.
 */
export function serviceHome(): string {
  return stateRootHome();
}

function isUnder(path: string, root: string): boolean {
  const rel = relative(resolve(root), resolve(path));
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/** Every LOOM_TEST_HOME in effect — the process's and the injected one. */
function testHomes(d: ServiceDeps): string[] {
  return [process.env.LOOM_TEST_HOME, d.env.LOOM_TEST_HOME].filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
}

/** P3 verify M: any LOOM_TEST_HOME (process or injected) must contain every target. */
function testHomeViolation(d: ServiceDeps, logPath: string, paths: ServiceTargetPaths): string | null {
  const roots = testHomes(d);
  const targets = [paths.unitPath, logPath];
  if (paths.kind === "systemd") targets.push(paths.wantsLinkPath);
  for (const root of roots) {
    for (const t of targets) {
      if (!isUnder(t, root)) {
        return `loom service: ${t} is outside LOOM_TEST_HOME (${root}) — refusing`;
      }
    }
  }
  return null;
}

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
  if (testHomes(d).length > 0 && d.runner === realServiceRunner) {
    d.err(R9_MESSAGE);
    return 1;
  }
  if (opts.profile) setActiveProfile(opts.profile, { explicit: true });
  const home = serviceHome();
  // P4 verify L3: `status` is read-only — doctor's home rule (`<home>/.loom`, never `loomDir()`,
  // which may migrate a legacy ~/.fable), session and profile read from there.
  const readOnly = verb === "status";
  const roLoom = join(home, ".loom");
  const roSession = readOnly ? readSessionAt(sessionPathUnder(roLoom)) : undefined;
  const profile = resolveBridgeProfile(roSession);
  const check = serviceProfileNameCheck(profile);
  if (!check.ok) {
    if (readOnly) {
      d.out(`service: ${check.message}`);
      return 0;
    }
    d.err(check.message);
    return 1;
  }
  const bridgeDir = readOnly ? join(roLoom, "bridge") : join(loomDir(), "bridge");
  // P4 verify L2: loomDir() is cached, serviceHome() is not — every loomDir-derived path (bridge
  // dir: config · status · lock · log) must sit under the service home, else refuse.
  if (!isUnder(bridgeDir, home)) {
    d.err(`loom service: ${bridgeDir} is outside the service home (${home}) — refusing`);
    return 1;
  }
  const paths = serviceTargetPaths(home, profile, d.platform);
  const outside = testHomeViolation(d, bridgeLogPath(profile, bridgeDir), paths);
  if (outside) {
    d.err(outside);
    return 1;
  }
  const ctx: Ctx = {
    d,
    kind,
    profile,
    names: serviceNames(profile),
    paths,
    home,
    bridgeDir,
    roSession: roSession ?? null,
    customInspect: deps.inspectLock !== undefined,
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
    if (r.code !== 0) {
      return { cls, loaded: false, running: false, mainPid: null, lastExit: null, raw: "" };
    }
    const p = parseLaunchctlPrint(r.stdout);
    return {
      cls,
      loaded: true,
      running: p.running,
      mainPid: p.pid,
      lastExit: p.lastExitCode,
      raw: r.stdout,
    };
  }
  const r = await call(c, ["systemctl", "--user", "show", c.names.unitName, "-p", SYSTEMD_SHOW_PROPS]);
  const cls = classifyRunnerResult("systemd", r);
  if (r.code !== 0) {
    return { cls, loaded: false, running: false, mainPid: null, lastExit: null, raw: "" };
  }
  const s = parseSystemctlShow(r.stdout);
  const running = s.activeState === "active";
  return {
    cls,
    loaded: s.loadState === "loaded",
    running,
    mainPid: running ? s.mainPid : null,
    lastExit: s.execMainStatus,
    raw: r.stdout,
  };
}

/** launchd `print`: the `arguments = { … }` block (two-tab lines), or null when absent. */
function launchctlPrintArguments(stdout: string): string[] | null {
  const lines = stdout.split("\n");
  const i = lines.findIndex((l) => /^\targuments = \{\s*$/.test(l));
  if (i < 0) return null;
  const out: string[] = [];
  for (const l of lines.slice(i + 1)) {
    if (/^\t\}\s*$/.test(l)) return out;
    if (!l.startsWith("\t\t")) return null;
    out.push(l.slice(2));
  }
  return null;
}

/**
 * P3 verify L3: does the LOADED job run what the (byte-identical) file says? true · false ·
 * null = cannot tell (query failed / output not parseable).
 */
async function loadedJobMatchesFile(c: Ctx, q: SvcState, text: string): Promise<boolean | null> {
  const unit = parseInstalledUnit(c.kind, text);
  if (unit.execPath === null || unit.bridgeMainPath === null) return null;
  const want = [unit.execPath, unit.bridgeMainPath];
  if (c.kind === "launchd") {
    const args = launchctlPrintArguments(q.raw);
    if (args) return args.length === want.length && args.every((a, i) => a === want[i]);
    const program = parseLaunchctlPrint(q.raw).program;
    return program !== null && program !== want[0] ? false : null;
  }
  const r = await call(c, ["systemctl", "--user", "show", c.names.unitName, "-p", "ExecStart"]);
  if (r.code !== 0) return null;
  const m = /argv\[\]=(.*?) ;/.exec(r.stdout);
  if (!m) return null;
  return m[1] === want.join(" ");
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
    // P3 verify L2: only a real not-found ends the poll; a timeout (137) or any other failure
    // keeps polling until the bound.
    if (p.code === 113 || /Could not find service/i.test(`${p.stderr}\n${p.stdout}`)) return null;
    if (c.d.now() >= deadline) {
      c.d.err(`bootout did not complete within ${BOOTOUT_POLL_MS / 1000} s`);
      return 1;
    }
    await c.d.sleep(POLL_STEP_MS);
  }
}

/** P3 verify L3 (systemd): the loaded unit is stale — daemon-reload, then restart / start. */
async function reloadRestart(c: Ctx, running: boolean, unreachable: string): Promise<number> {
  const reload = ["systemctl", "--user", "daemon-reload"];
  const bad = outcome(c, reload, await call(c, reload), unreachable);
  if (bad !== null) return bad;
  const argv = ["systemctl", "--user", running ? "restart" : "start", c.names.unitName];
  const bad2 = outcome(c, argv, await call(c, argv), unreachable);
  if (bad2 !== null) return bad2;
  return waitRunning(c);
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
  // 6 — reinstall candidate (R52-M1: bootout condition = loaded). The state comes from the
  // read-only query above even when the file is absent (P3 verify L1: label loaded, plist gone
  // → treated as "loaded, content differs", never a bootstrap into EIO).
  const same = existing !== null && existing === text;
  if (same && q.loaded) {
    // P3 verify L3: identical on disk — but is the loaded job the one the file describes?
    const match = await loadedJobMatchesFile(c, q, text);
    if (match === false) {
      const guard = inFlightGuard(c, q, force);
      if (guard !== null) return guard;
      if (c.kind === "systemd") return reloadRestart(c, q.running, nextLogin);
      const stopped = await stopLoaded(c);
      if (stopped !== null) return stopped;
    } else {
      const note = match === null ? "up to date on disk; loaded job unverified" : "up to date";
      if (q.running) {
        d.out(`already installed (${note}, pid ${q.mainPid ?? "?"})`);
        return 0;
      }
      if (match === null) d.out(`already installed (${note})`);
      return startLoaded(c, nextLogin);
    }
  } else if (q.loaded) {
    const guard = inFlightGuard(c, q, force);
    if (guard !== null) return guard;
    const stopped = await stopLoaded(c);
    if (stopped !== null) return stopped;
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

/**
 * ② status: read-only, always exit 0 (R6) — prints the D7 Service section lines (the same pure
 * `serviceSection` as `loom doctor`, gathered by `gatherServiceInput`).
 */
async function status(c: Ctx): Promise<number> {
  const { d } = c;
  const name = c.kind === "launchd" ? c.names.label : c.names.unitName;
  d.out(`service: ${name} (${c.paths.unitPath})`);
  // P4 verify L3: everything below reads under c.bridgeDir (`<home>/.loom/bridge`) — never loomDir().
  const section = await serviceDoctorSection({
    runner: d.runner,
    platform: d.platform,
    uid: d.uid,
    home: c.home,
    bridgeDir: c.bridgeDir,
    profile: c.profile,
    relayUrl: c.roSession?.relayUrl ?? null,
    currentPath: d.env.PATH ?? "",
    cliBridgeMainPath: d.bridgeMainPath,
    inspectLock: (lockPath) => (c.customInspect ? d.inspectLock(c.profile) : inspectBridgeLockAt(lockPath)),
  });
  for (const l of section.lines) d.out(`  ${l.status.padEnd(4)} ${l.message}`);
  return 0;
}

// ---------------------------------------------------------------------------------------------
// D7 Service section gatherer — shared by `loom doctor` and `loom service status` (P4)
// ---------------------------------------------------------------------------------------------

/** R12: the only service-manager verbs the doctor / status path may call. */
export const SERVICE_READ_VERBS: readonly string[] = ["print", "print-disabled", "show", "show-user"];
const READ_VERB_SET: ReadonlySet<string> = new Set(SERVICE_READ_VERBS);
/** R12: hard per-call bound. */
const READ_TIMEOUT_MS = 2_000;
/** Real read child: killed this much before the race timer, so it is reaped before we return. */
const REAP_MARGIN_MS = 250;
const DEFAULT_AGENT_BINS: Record<string, string> = { claude: "claude", codex: "codex", grok: "grok" };
const AGENT_KINDS = Object.keys(DEFAULT_AGENT_BINS);

export type ServiceProbeDeps = {
  runner: ServiceRunner;
  platform: string;
  uid: number;
  /** User home the unit path hangs off — `serviceHome()` (injectable for tests). */
  home: string;
  /** `<loom home>/bridge` — config · status · lock · log. */
  bridgeDir: string;
  profile: string;
  /** Session relay URL (loopback row); null = no session. */
  relayUrl: string | null;
  /** Current PATH (drift row). */
  currentPath: string;
  /** Current CLI's `bridgeMainPath()`; a throw → unknown. */
  cliBridgeMainPath: () => string;
  /** Per-call bound; clamped to ≤ 2 s (R12). */
  timeoutMs?: number;
  isPidAlive?: (pid: number) => boolean;
  inspectLock?: (lockPath: string) => BridgeLockInspection;
};

function readVerb(argv: string[]): string {
  if (argv[0] === "systemctl") return (argv[1] === "--user" ? argv[2] : argv[1]) ?? "";
  return argv[1] ?? "";
}

/** One read-only query: read verbs only · bounded · failure / throw / timeout → unknown reason. */
async function readQuery(
  runner: ServiceRunner,
  argv: string[],
  ms: number,
): Promise<{ ok: true; r: ServiceRunnerResult } | { ok: false; reason: string }> {
  if (!READ_VERB_SET.has(readVerb(argv))) {
    return { ok: false, reason: `refusing non-read verb "${readVerb(argv)}"` };
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<{ ok: false; reason: string }>((res) => {
    timer = setTimeout(() => res({ ok: false, reason: `no answer within ${ms / 1000} s` }), ms);
  });
  const call = Promise.resolve()
    .then(() => runner(argv))
    .then(
      (r) => ({ ok: true as const, r }),
      (e: unknown) => ({ ok: false as const, reason: e instanceof Error ? e.message : String(e) }),
    );
  try {
    return await Promise.race([call, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function failReason(argv: string[], r: ServiceRunnerResult): string {
  return `${argv[0]} ${readVerb(argv)} exited ${r.code}: ${runnerDetail(r)}`;
}

function xmlUnescape(v: string): string {
  return v
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** systemd word splitting for the values `renderSystemdUnit` writes (double quotes · backslash). */
function sdWords(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    while (i < line.length && /\s/.test(line[i]!)) i++;
    if (i >= line.length) break;
    let w = "";
    if (line[i] === '"') {
      i++;
      while (i < line.length && line[i] !== '"') {
        if (line[i] === "\\" && i + 1 < line.length) {
          w += line[i + 1];
          i += 2;
        } else {
          w += line[i++];
        }
      }
      i++;
    } else {
      while (i < line.length && !/\s/.test(line[i]!)) w += line[i++];
    }
    out.push(w);
  }
  return out;
}

/** Read back what install pinned: bun · bridge-main.ts · PATH (inverse of the P1 generators). */
export function parseInstalledUnit(
  kind: ServiceManagerKind,
  text: string,
): { execPath: string | null; bridgeMainPath: string | null; path: string | null } {
  if (kind === "launchd") {
    const pa =
      /<key>ProgramArguments<\/key>\s*<array>\s*<string>([^<]*)<\/string>\s*<string>([^<]*)<\/string>/.exec(
        text,
      );
    const env = /<key>EnvironmentVariables<\/key>\s*<dict>([\s\S]*?)<\/dict>/.exec(text);
    const path = env ? /<key>PATH<\/key>\s*<string>([^<]*)<\/string>/.exec(env[1]!) : null;
    return {
      execPath: pa ? xmlUnescape(pa[1]!) : null,
      bridgeMainPath: pa ? xmlUnescape(pa[2]!) : null,
      path: path ? xmlUnescape(path[1]!) : null,
    };
  }
  let execPath: string | null = null;
  let bridgeMain: string | null = null;
  let path: string | null = null;
  for (const line of text.split("\n")) {
    if (line.startsWith("ExecStart=")) {
      const w = sdWords(line.slice("ExecStart=".length)).map((v) =>
        v.replace(/\$\$/g, "$").replace(/%%/g, "%"),
      );
      execPath = w[0] ?? null;
      bridgeMain = w[1] ?? null;
    } else if (line.startsWith("Environment=")) {
      const a = sdWords(line.slice("Environment=".length))[0] ?? "";
      if (a.startsWith("PATH=")) path = a.slice(5).replace(/%%/g, "%");
    }
  }
  return { execPath, bridgeMainPath: bridgeMain, path };
}

/**
 * Agent binaries this profile's bridge can launch, read raw — no throw. Pane (or no / invalid
 * config) → none (agents run in herdr panes, not from the unit PATH). Headless → the agents the
 * config names in `worker.agentBin` / `worker.maxConcurrent` (agentBin path or default name);
 * a headless config naming none can launch any agent → all defaults.
 */
function configuredAgentBins(bridgeDir: string, profile: string): string[] {
  type W = { backend?: unknown; agentBin?: unknown; maxConcurrent?: unknown };
  let worker: W | undefined;
  try {
    const raw = JSON.parse(
      readFileSync(join(bridgeDir, `${bridgeConfigSafeName(profile)}.json`), "utf8"),
    ) as { worker?: W };
    worker = raw?.worker;
  } catch {
    return [];
  }
  if (worker?.backend !== "headless") return [];
  const obj = (v: unknown): Record<string, unknown> =>
    v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const bin = obj(worker.agentBin);
  const conc = obj(worker.maxConcurrent);
  const named = AGENT_KINDS.filter((k) => k in bin || k in conc);
  return (named.length > 0 ? named : AGENT_KINDS).map((k) => {
    const v = bin[k];
    return typeof v === "string" && v.length > 0 ? v : DEFAULT_AGENT_BINS[k]!;
  });
}

function resolvableVia(bin: string, path: string): boolean {
  if (isAbsolute(bin)) return existsSync(bin);
  return Bun.which(bin, { PATH: path }) !== null;
}

function fileMode(path: string): number | null {
  try {
    return statSync(path).mode & 0o7777;
  } catch {
    return null;
  }
}

function relayIsLoopback(relayUrl: string | null): boolean {
  if (!relayUrl) return false;
  try {
    const ep = parseRelayUrl(relayUrl);
    return ep.isLocal || isLoopbackHost(ep.host);
  } catch {
    return false;
  }
}

/**
 * PLAN 0.34.0 D7 · R12 — gather the Service section input. Files + pid liveness + read-only
 * runner queries (`print` · `print-disabled` / `show` · `show-user`), each bounded at ≤ 2 s;
 * a failed / slow query makes only its rows `unknown`. Writes nothing; never runs a write verb.
 */
export async function gatherServiceInput(p: ServiceProbeDeps): Promise<ServiceSectionInput> {
  const kind: ServiceManagerKind | null =
    p.platform === "darwin" ? "launchd" : p.platform === "linux" ? "systemd" : null;
  if (!kind) return { kind: "unsupported", platform: p.platform };
  const check = serviceProfileNameCheck(p.profile);
  if (!check.ok) return { kind: "invalid-name", message: check.message };
  const names = serviceNames(p.profile);
  const name = kind === "launchd" ? names.label : names.unitName;
  const unitPath = serviceTargetPaths(p.home, p.profile, p.platform).unitPath;
  const text = readText(unitPath);
  if (text === null) {
    return existsSync(unitPath)
      ? { kind: "foreign", name, unitPath }
      : { kind: "not-installed", name, unitPath };
  }
  if (!isLoomServiceFile(text, p.profile)) return { kind: "foreign", name, unitPath };

  const ms = Math.min(p.timeoutMs ?? READ_TIMEOUT_MS, READ_TIMEOUT_MS);
  // P4 verify L1: the real child is killed (group) and awaited BEFORE the race timer fires, so a
  // hung launchctl / systemctl / loginctl never outlives the CLI's exit.
  const reapMs = Math.max(ms - REAP_MARGIN_MS, 100);
  const run: ServiceRunner =
    p.runner === realServiceRunner ? (argv) => spawnServiceManager(argv, reapMs, true) : p.runner;
  let state: ServiceProbe<ServiceManagerState>;
  let disabled: ServiceProbe<boolean | null> | undefined;
  let linger: ServiceProbe<"yes" | "no"> | undefined;
  if (kind === "launchd") {
    const printArgv = ["launchctl", "print", `gui/${p.uid}/${names.label}`];
    const disArgv = ["launchctl", "print-disabled", `gui/${p.uid}`];
    const [pr, dr] = await Promise.all([readQuery(run, printArgv, ms), readQuery(run, disArgv, ms)]);
    if (!pr.ok) state = { ok: false, reason: pr.reason };
    else if (pr.r.code === 0) {
      const x = parseLaunchctlPrint(pr.r.stdout);
      state = {
        ok: true,
        value: {
          loaded: true,
          running: x.running,
          mainPid: x.running ? x.pid : null,
          lastExit: x.lastExitCode,
          unitFileState: null,
        },
      };
    } else if (/Could not find service/i.test(pr.r.stderr)) {
      state = {
        ok: true,
        value: { loaded: false, running: false, mainPid: null, lastExit: null, unitFileState: null },
      };
    } else state = { ok: false, reason: failReason(printArgv, pr.r) };
    if (!dr.ok) disabled = { ok: false, reason: dr.reason };
    else if (dr.r.code !== 0) disabled = { ok: false, reason: failReason(disArgv, dr.r) };
    else disabled = { ok: true, value: parseLaunchctlPrintDisabled(dr.r.stdout, names.label) };
  } else {
    const showArgv = ["systemctl", "--user", "show", names.unitName, "-p", SYSTEMD_SHOW_PROPS];
    const lingerArgv = ["loginctl", "show-user", String(p.uid), "-p", "Linger"];
    const [sr, lr] = await Promise.all([readQuery(run, showArgv, ms), readQuery(run, lingerArgv, ms)]);
    if (!sr.ok) state = { ok: false, reason: sr.reason };
    else if (sr.r.code !== 0) state = { ok: false, reason: failReason(showArgv, sr.r) };
    else {
      const x = parseSystemctlShow(sr.r.stdout);
      const running = x.activeState === "active";
      state = {
        ok: true,
        value: {
          loaded: x.loadState === "loaded",
          running,
          mainPid: running ? x.mainPid : null,
          lastExit: x.execMainStatus,
          unitFileState: x.unitFileState,
        },
      };
    }
    const m = lr.ok && lr.r.code === 0 ? /^Linger=(yes|no)\s*$/m.exec(lr.r.stdout) : null;
    if (m) linger = { ok: true, value: m[1] as "yes" | "no" };
    else if (!lr.ok) linger = { ok: false, reason: lr.reason };
    else linger = { ok: false, reason: failReason(lingerArgv, lr.r) };
  }

  const unit = parseInstalledUnit(kind, text);
  const unresolvedAgentBins =
    unit.path === null
      ? []
      : configuredAgentBins(p.bridgeDir, p.profile).filter((b) => !resolvableVia(b, unit.path!));
  let cliBridgeMainPath: string | null = null;
  try {
    cliBridgeMainPath = p.cliBridgeMainPath();
  } catch {
    cliBridgeMainPath = null;
  }
  const statusRead = readBridgeStatusFileResult(bridgeStatusPath(p.profile, p.bridgeDir));
  const status = statusRead.kind === "ok" ? statusRead.status : null;
  const statusPid = status && status.pid > 0 ? status.pid : null;
  const alive = p.isPidAlive ?? isPidAlive;
  const lock = (p.inspectLock ?? ((path: string) => inspectBridgeLockAt(path)))(
    bridgeLockPath(p.profile, p.bridgeDir),
  );
  const logPath = bridgeLogPath(p.profile, p.bridgeDir);
  return {
    kind: "installed",
    manager: kind,
    name,
    unitPath,
    loomVersion: parseServiceMarker(text)?.loomVersion ?? null,
    state,
    ...(disabled ? { disabled } : {}),
    ...(linger ? { linger } : {}),
    unit,
    execPathExists: unit.execPath !== null && existsSync(unit.execPath),
    bridgeMainExists: unit.bridgeMainPath !== null && existsSync(unit.bridgeMainPath),
    currentPath: p.currentPath,
    unresolvedAgentBins,
    cliBridgeMainPath,
    statusSrcPath: status?.srcPath ? status.srcPath : null,
    log: { path: logPath, mode: fileMode(logPath) },
    loopbackRelay: relayIsLoopback(p.relayUrl),
    lockHolderPid: lock.kind === "held" ? lock.pid : null,
    statusPid,
    statusPidAlive: statusPid !== null && alive(statusPid),
  };
}

/** `serviceSection(await gatherServiceInput(p))` — the doctor / status entry point. */
export async function serviceDoctorSection(p: ServiceProbeDeps): Promise<DoctorSection> {
  return serviceSection(await gatherServiceInput(p));
}
