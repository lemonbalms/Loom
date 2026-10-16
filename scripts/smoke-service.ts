/**
 * PLAN 0.34.0 Done-when (i) — `loom service` smoke against the CLI with a FAKE service manager.
 *
 *   ① install          → exit 0 · plist/unit 0644 · log 0600 (bridge dir 0700) · running pid
 *   ② re-install       → exit 0 "already installed (up to date …)" · zero write verbs · bytes unchanged
 *   ③ status           → exit 0 · installed + running pid · read verbs only
 *   ④ doctor           → Service section · no `fail` in it · read verbs only
 *   ⑤ no_domain script → install exit 3 "written; loads at next login" · file kept
 *   ⑥ uninstall        → exit 0 · bootout (launchd) / stop (systemd) · file (and wants link) gone
 *
 * How the fake reaches the CLI: the CLI subprocess (dist `bun dist/loom.js …` by default,
 * `--source` = packages/cli/src/index.ts) runs with HOME=<temp home> and PATH = <spy dir>:<bun dir>
 * ONLY. The spy dir holds `launchctl` / `systemctl` / `loginctl` stand-ins (a scripted state
 * machine in this file, `--spy` mode). The smoke aborts unless `Bun.which()` resolves every one of
 * the three names to the spy on that PATH — the real service manager is unreachable. The CLI child
 * gets no LOOM_TEST_HOME: under it the product's real runner refuses every verb (R9), so nothing
 * would be exercised; its home is the temp HOME instead (Bun's homedir follows HOME at start).
 *
 * Zero persistence: everything lives under one mkdtemp root, removed at exit (also on failure and
 * on SIGINT/SIGTERM). The real home's ~/Library/LaunchAgents · ~/.config/systemd · ~/.loom listings
 * are compared before/after and any change fails the smoke.
 *
 * OPTIONAL live smoke (macOS only · owner gate): `--live` AND env LOOM_SERVICE_LIVE_SMOKE=1. Label
 * `com.loom.bridge.smoke`, plist in a scratch dir (never ~/Library/LaunchAgents), LOOM_TEST_HOME
 * spliced into the rendered plist by THIS script (test-only — the product generator never emits it),
 * real `launchctl bootstrap gui/$UID <scratch plist>` → running + status file pid match → `bootout`
 * → status `stopped` → plist and temp home removed. Without both gates it prints "skipped — owner gate".
 *
 * Usage (repo root):  bun run smoke:service [--source] [--live]
 */
import { spawn } from "bun";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { dirname, join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SPY_NAMES = ["launchctl", "systemctl", "loginctl"] as const;

// ---------------------------------------------------------------------------------------------
// --spy mode: the fake launchctl / systemctl / loginctl (state in <spy dir>/state.json)
// ---------------------------------------------------------------------------------------------

type SpyState = {
  scenario: "normal" | "no_domain";
  loaded: boolean;
  running: boolean;
  svcPid: number;
  uid: number;
  label: string;
  unitName: string;
  unitPath: string;
  statusPath: string;
  profile: string;
};

if (process.argv[2] === "--spy") {
  const spyDir = process.argv[3]!;
  const name = process.argv[4]!;
  const args = process.argv.slice(5);
  const statePath = join(spyDir, "state.json");
  const st = JSON.parse(readFileSync(statePath, "utf8")) as SpyState;
  writeFileSync(join(spyDir, "calls.jsonl"), `${JSON.stringify([name, ...args])}\n`, { flag: "a" });
  const save = () => writeFileSync(statePath, JSON.stringify(st));
  const status = (state: "running" | "stopped") => {
    const now = new Date().toISOString();
    mkdirSync(dirname(st.statusPath), { recursive: true });
    writeFileSync(
      st.statusPath,
      JSON.stringify({
        v: 1,
        pid: st.svcPid,
        version: "smoke",
        srcPath: join(ROOT, "packages/host/src/bridge-main.ts"),
        profile: st.profile,
        startedAt: now,
        heartbeatAt: now,
        state,
        inFlight: { paneCards: 0, convs: 0, headlessRunning: 0, headlessQueued: 0 },
        herdr: "skipped",
        ...(state === "stopped" ? { stoppedAt: now } : {}),
      }),
    );
  };
  const out = (code: number, stdout = "", stderr = ""): never => {
    if (stdout) process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
    process.exit(code);
  };
  const programArgs = (): string[] => {
    try {
      const t = readFileSync(st.unitPath, "utf8");
      const m = /<key>ProgramArguments<\/key>\s*<array>\s*<string>([^<]*)<\/string>\s*<string>([^<]*)<\/string>/.exec(t);
      if (m) return [m[1]!, m[2]!];
      const e = /^ExecStart=(\S+) (\S+)$/m.exec(t);
      return e ? [e[1]!.replace(/^"|"$/g, ""), e[2]!.replace(/^"|"$/g, "")] : [];
    } catch {
      return [];
    }
  };
  if (name === "launchctl") {
    const verb = args[0];
    if (st.scenario === "no_domain") {
      if (verb === "print" || verb === "print-disabled") out(113, "", `Could not find domain for user gui: ${st.uid}\n`);
      out(5, "", `Bootstrap failed: 5: Input/output error\n`);
    }
    switch (verb) {
      case "print": {
        if (!st.loaded) out(113, "", `Could not find service "${st.label}" in domain for user gui: ${st.uid}\n`);
        const a = programArgs();
        out(
          0,
          [
            `gui/${st.uid}/${st.label} = {`,
            "\tactive count = 1",
            `\tpath = ${st.unitPath}`,
            `\tstate = ${st.running ? "running" : "not running"}`,
            ...(a.length ? [`\tprogram = ${a[0]}`, "\targuments = {", ...a.map((x) => `\t\t${x}`), "\t}"] : []),
            ...(st.running ? [`\tpid = ${st.svcPid}`] : ["\tlast exit code = 0"]),
            "}",
            "",
          ].join("\n"),
        );
        break;
      }
      case "print-disabled":
        out(0, `disabled services = {\n\t"${st.label}" => enabled\n}\n`);
        break;
      case "bootstrap":
        st.loaded = true;
        st.running = true;
        save();
        status("running");
        out(0);
        break;
      case "bootout":
        st.loaded = false;
        st.running = false;
        save();
        status("stopped");
        out(0);
        break;
      case "kickstart":
        if (args.includes("-k")) out(1, "", "smoke: kickstart -k is forbidden (R14)\n");
        st.running = true;
        save();
        status("running");
        out(0);
        break;
    }
    out(1, "", `smoke spy: unexpected launchctl ${args.join(" ")}\n`);
  }
  if (name === "systemctl") {
    const verb = args[0] === "--user" ? args[1] : args[0];
    if (st.scenario === "no_domain") out(1, "", "Failed to connect to bus: No medium found\n");
    switch (verb) {
      case "show": {
        if (args.includes("ExecStart")) {
          const a = programArgs();
          out(0, a.length ? `ExecStart={ path=${a[0]} ; argv[]=${a.join(" ")} ; ignore_errors=no ; pid=0 }\n` : "ExecStart=\n");
        }
        out(
          0,
          [
            `LoadState=${st.loaded ? "loaded" : "not-found"}`,
            `ActiveState=${st.running ? "active" : "inactive"}`,
            `SubState=${st.running ? "running" : "dead"}`,
            `MainPID=${st.running ? st.svcPid : 0}`,
            "ExecMainStatus=0",
            `UnitFileState=${st.loaded ? "enabled" : ""}`,
            "",
          ].join("\n"),
        );
        break;
      }
      case "daemon-reload":
        st.loaded = existsSync(st.unitPath);
        save();
        out(0);
        break;
      case "start":
      case "restart":
        st.running = true;
        save();
        status("running");
        out(0);
        break;
      case "stop":
        st.running = false;
        save();
        status("stopped");
        out(0);
        break;
    }
    out(1, "", `smoke spy: unexpected systemctl ${args.join(" ")}\n`);
  }
  if (name === "loginctl" && args[0] === "show-user") out(0, "Linger=no\n");
  out(1, "", `smoke spy: unexpected ${name} ${args.join(" ")}\n`);
}

// ---------------------------------------------------------------------------------------------
// Smoke driver
// ---------------------------------------------------------------------------------------------

const argv = process.argv.slice(2);
const USE_SOURCE = argv.includes("--source");
const WANT_LIVE = argv.includes("--live");
const BUN = process.execPath;
const CLI = USE_SOURCE ? join(ROOT, "packages/cli/src/index.ts") : join(ROOT, "dist/loom.js");
const PROFILE = "smoke";
const LABEL = `com.loom.bridge.${PROFILE}`;
const UNIT = `loom-bridge-${PROFILE}.service`;
const PLATFORM = process.platform;
const UID = process.getuid?.() ?? 0;
const REAL_HOME = userInfo().homedir;

const TMP_ROOT = realpathSync(mkdtempSync(join(tmpdir(), "loom-smoke-service-")));
const HOME = join(TMP_ROOT, "home");
const SPY = join(TMP_ROOT, "spy");
const LOOM = join(HOME, ".loom");
const BRIDGE_DIR = join(LOOM, "bridge");
const LOG = join(BRIDGE_DIR, `${PROFILE}.stderr.log`);
const STATUS = join(BRIDGE_DIR, `${PROFILE}.status.json`);
const UNIT_PATH =
  PLATFORM === "darwin" ? join(HOME, "Library/LaunchAgents", `${LABEL}.plist`) : join(HOME, ".config/systemd/user", UNIT);
const WANTS = join(HOME, ".config/systemd/user/default.target.wants", UNIT);
const CHILD_PATH = `${SPY}:${dirname(BUN)}`;

const results: Array<{ step: string; ok: boolean }> = [];
let cleaned = false;

function cleanup(): void {
  if (cleaned) return;
  cleaned = true;
  rmSync(TMP_ROOT, { recursive: true, force: true });
}
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    cleanup();
    process.exit(130);
  });
}

function record(step: string, problems: string[], okDetail: string): void {
  const ok = problems.length === 0;
  results.push({ step, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${step} — ${ok ? okDetail : problems.join("; ")}`);
}

/** Real-home listings that must not change (names · size · mtime for the service dirs). */
function realHomeSnapshot(): string {
  const lines: string[] = [];
  const walk = (dir: string, deep: boolean, withMeta: boolean) => {
    let names: string[];
    try {
      names = readdirSync(dir).sort();
    } catch (e) {
      lines.push(`${dir}: ${(e as NodeJS.ErrnoException).code ?? "error"}`);
      return;
    }
    for (const n of names) {
      const p = join(dir, n);
      let meta = "";
      let isDir = false;
      try {
        const s = lstatSync(p);
        isDir = s.isDirectory();
        meta = withMeta ? ` ${s.size} ${s.mtimeMs}` : "";
      } catch {
        meta = " ?";
      }
      lines.push(`${p}${meta}`);
      if (deep && isDir) walk(p, deep, withMeta);
    }
  };
  walk(join(REAL_HOME, "Library/LaunchAgents"), false, true);
  walk(join(REAL_HOME, ".config/systemd"), true, true);
  walk(join(REAL_HOME, ".loom"), false, false);
  return lines.join("\n");
}

function spyState(): SpyState {
  return JSON.parse(readFileSync(join(SPY, "state.json"), "utf8")) as SpyState;
}
function setSpy(patch: Partial<SpyState>): void {
  writeFileSync(join(SPY, "state.json"), JSON.stringify({ ...spyState(), ...patch }));
}
function spyCalls(): string[][] {
  try {
    return readFileSync(join(SPY, "calls.jsonl"), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as string[]);
  } catch {
    return [];
  }
}

const READ_VERBS = new Set(["print", "print-disabled", "show", "show-user"]);
const verbOf = (c: string[]) => (c[0] === "systemctl" ? (c[1] === "--user" ? c[2] : c[1]) : c[1]) ?? "";
const writesIn = (calls: string[][]) => calls.filter((c) => !READ_VERBS.has(verbOf(c)));

function setup(): void {
  mkdirSync(join(LOOM, "profiles"), { recursive: true });
  mkdirSync(BRIDGE_DIR, { recursive: true });
  writeFileSync(
    join(LOOM, "profiles", `${PROFILE}.json`),
    JSON.stringify({
      relayUrl: "wss://relay.example.invalid:7842/ws",
      relayToken: "smoke-token-not-a-secret",
      roomId: "r_smoke",
      roomName: "service-smoke",
      inviteCode: "LOOM-SMOKE",
      peerId: "p_node",
      displayName: PROFILE,
    }),
    { mode: 0o600 },
  );
  const cwd = join(HOME, "work");
  mkdirSync(cwd, { recursive: true });
  writeFileSync(
    join(BRIDGE_DIR, `${PROFILE}.json`),
    JSON.stringify({
      authorizedDispatchers: ["p_tower"],
      worker: { backend: "headless", cwd, allowedRoots: [cwd], timeoutMs: 60_000 },
    }),
  );
  mkdirSync(SPY, { recursive: true });
  const state: SpyState = {
    scenario: "normal",
    loaded: false,
    running: false,
    svcPid: process.pid,
    uid: UID,
    label: LABEL,
    unitName: UNIT,
    unitPath: UNIT_PATH,
    statusPath: STATUS,
    profile: PROFILE,
  };
  writeFileSync(join(SPY, "state.json"), JSON.stringify(state));
  const self = import.meta.path;
  for (const n of SPY_NAMES) {
    writeFileSync(join(SPY, n), `#!/bin/sh\nexec "${BUN}" "${self}" --spy "${SPY}" "\${0##*/}" "$@"\n`);
    chmodSync(join(SPY, n), 0o755);
  }
  // The real service manager must be unreachable from the CLI child's PATH.
  for (const n of SPY_NAMES) {
    const hit = Bun.which(n, { PATH: CHILD_PATH });
    if (hit !== join(SPY, n)) throw new Error(`PATH guard: ${n} resolves to ${hit ?? "nothing"}, not the spy — refusing to run`);
  }
  if (realpathSync(HOME) === realpathSync(REAL_HOME)) throw new Error("temp HOME is the real home — refusing to run");
}

async function cli(args: string[]): Promise<{ code: number; out: string; calls: string[][] }> {
  const before = spyCalls().length;
  const proc = spawn({
    cmd: [BUN, CLI, "--profile", PROFILE, ...args],
    cwd: ROOT,
    env: { HOME, PATH: CHILD_PATH, LOOM_NO_AUTO_HOST: "1", TMPDIR: process.env.TMPDIR ?? "/tmp" },
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });
  const timer = setTimeout(() => proc.kill("SIGKILL"), 60_000);
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout as ReadableStream).text(),
    new Response(proc.stderr as ReadableStream).text(),
    proc.exited,
  ]);
  clearTimeout(timer);
  return { code, out: `${stdout}${stderr}`, calls: spyCalls().slice(before) };
}

const mode = (p: string) => (existsSync(p) ? statSync(p).mode & 0o777 : -1);
const oct = (n: number) => (n < 0 ? "absent" : `0${n.toString(8)}`);
const short = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 300);

async function step1(): Promise<void> {
  const r = await cli(["service", "install"]);
  const p: string[] = [];
  if (r.code !== 0) p.push(`exit ${r.code}: ${short(r.out)}`);
  if (!r.out.includes(`service running (pid ${process.pid})`)) p.push("no 'service running (pid …)' line");
  if (mode(UNIT_PATH) !== 0o644) p.push(`unit mode ${oct(mode(UNIT_PATH))}`);
  if (mode(LOG) !== 0o600) p.push(`log mode ${oct(mode(LOG))}`);
  if (mode(BRIDGE_DIR) !== 0o700) p.push(`bridge dir mode ${oct(mode(BRIDGE_DIR))}`);
  if (PLATFORM === "linux" && !lstatSync(WANTS, { throwIfNoEntry: false })?.isSymbolicLink()) p.push("no wants symlink");
  const w = writesIn(r.calls).map((c) => c.join(" "));
  const want = PLATFORM === "darwin" ? [`launchctl bootstrap gui/${UID} ${UNIT_PATH}`] : ["systemctl --user daemon-reload", `systemctl --user start ${UNIT}`];
  if (JSON.stringify(w) !== JSON.stringify(want)) p.push(`write verbs ${JSON.stringify(w)}`);
  record("① install", p, `exit 0 · unit 0644 · log 0600 · bridge dir 0700 · ${w.join(" → ")} · running pid ${process.pid}`);
}

async function step2(): Promise<void> {
  const bytes = readFileSync(UNIT_PATH, "utf8");
  const mtime = statSync(UNIT_PATH).mtimeMs;
  const r = await cli(["service", "install"]);
  const p: string[] = [];
  if (r.code !== 0) p.push(`exit ${r.code}: ${short(r.out)}`);
  if (!/already installed \(up to date, pid \d+\)/.test(r.out)) p.push(`no 'already installed (up to date …)': ${short(r.out)}`);
  if (writesIn(r.calls).length > 0) p.push(`write verbs ${JSON.stringify(writesIn(r.calls))}`);
  if (readFileSync(UNIT_PATH, "utf8") !== bytes || statSync(UNIT_PATH).mtimeMs !== mtime) p.push("unit file rewritten");
  record("② re-install no-op", p, `exit 0 · "${r.out.match(/already installed[^\n]*/)?.[0]}" · write verbs 0 · bytes/mtime unchanged`);
}

async function step3(): Promise<void> {
  const r = await cli(["service", "status"]);
  const p: string[] = [];
  if (r.code !== 0) p.push(`exit ${r.code}`);
  if (!/ok\s+installed: /.test(r.out)) p.push("no 'ok installed' line");
  if (!new RegExp(`ok\\s+running.*${process.pid}`).test(r.out)) p.push(`no running pid line: ${short(r.out)}`);
  if (writesIn(r.calls).length > 0) p.push(`write verbs ${JSON.stringify(writesIn(r.calls))}`);
  record("③ status", p, `exit 0 · installed + running pid ${process.pid} · read verbs only (${r.calls.map(verbOf).join(", ")})`);
}

async function step4(): Promise<void> {
  const r = await cli(["doctor"]);
  const p: string[] = [];
  const i = r.out.indexOf("\nService\n");
  const section = i < 0 ? "" : r.out.slice(i + 1).split("\n\n")[0]!;
  if (!section) p.push("no Service section");
  if (/^\s+fail\s/m.test(section)) p.push(`fail line in Service: ${short(section)}`);
  if (!/ok\s+installed: /.test(section)) p.push("no 'ok installed' in Service");
  if (!new RegExp(`ok\\s+running.*${process.pid}`).test(section)) p.push(`no running line: ${short(section)}`);
  if (writesIn(r.calls).length > 0) p.push(`write verbs ${JSON.stringify(writesIn(r.calls))}`);
  const rows = section.split("\n").slice(1).filter(Boolean).length;
  // doctor's own exit follows `fail` in OTHER sections (the .invalid relay is unreachable) — not Service.
  const failSections = r.out
    .split("\n\n")
    .filter((b) => /^\s+fail\s/m.test(b))
    .map((b) => b.trim().split("\n")[0]);
  record(
    "④ doctor Service section",
    p,
    `${rows} rows · 0 fail · read verbs only · doctor exit ${r.code}${failSections.length ? ` (fail only in: ${failSections.join(", ")})` : ""}`,
  );
}

async function step5(): Promise<void> {
  // A session without a GUI domain / user bus: the job is not loaded and every write verb fails.
  setSpy({ scenario: "no_domain", loaded: false, running: false });
  const r = await cli(["service", "install"]);
  const p: string[] = [];
  if (r.code !== 3) p.push(`exit ${r.code} (want 3): ${short(r.out)}`);
  if (!r.out.includes(`written; loads at next login (${UNIT_PATH})`)) p.push("no 'written; loads at next login' line");
  if (!existsSync(UNIT_PATH)) p.push("unit file gone");
  setSpy({ scenario: "normal", loaded: true, running: true });
  record("⑤ no_domain → exit 3", p, `exit 3 · "${r.out.match(/written; loads at next login[^\n]*/)?.[0]}" · file kept`);
}

async function step6(): Promise<void> {
  const r = await cli(["service", "uninstall"]);
  const p: string[] = [];
  if (r.code !== 0) p.push(`exit ${r.code}: ${short(r.out)}`);
  if (existsSync(UNIT_PATH)) p.push("unit file still present");
  if (PLATFORM === "linux" && lstatSync(WANTS, { throwIfNoEntry: false })) p.push("wants link still present");
  const w = writesIn(r.calls).map((c) => c.join(" "));
  const first = PLATFORM === "darwin" ? `launchctl bootout gui/${UID}/${LABEL}` : `systemctl --user stop ${UNIT}`;
  if (w[0] !== first) p.push(`write verbs ${JSON.stringify(w)}`);
  if (!r.out.includes(`will stop the running service bridge (pid ${process.pid})`)) p.push("no 'will stop' line");
  const again = await cli(["service", "uninstall"]);
  if (again.code !== 0 || !again.out.includes("not installed")) p.push(`second uninstall: exit ${again.code} ${short(again.out)}`);
  record("⑥ uninstall", p, `exit 0 · ${w.join(" → ")} · file removed · second uninstall "not installed" exit 0`);
}

// ---------------------------------------------------------------------------------------------
// OPTIONAL live smoke — macOS, owner gate (`--live` AND LOOM_SERVICE_LIVE_SMOKE=1). Not run by default.
// ---------------------------------------------------------------------------------------------

async function liveSmoke(): Promise<"skipped" | "pass" | "fail"> {
  if (!WANT_LIVE || process.env.LOOM_SERVICE_LIVE_SMOKE !== "1") {
    console.log("SKIP live smoke — owner gate (needs --live AND LOOM_SERVICE_LIVE_SMOKE=1)");
    return "skipped";
  }
  if (PLATFORM !== "darwin") {
    console.log(`SKIP live smoke — ${PLATFORM}: Linux live is unverified (no environment) — UK-4`);
    return "skipped";
  }
  const LAUNCHCTL = "/bin/launchctl";
  const liveRoot = realpathSync(mkdtempSync(join(tmpdir(), "loom-smoke-service-live-")));
  const liveHome = join(liveRoot, "home");
  const scratch = join(liveRoot, "scratch");
  const plist = join(scratch, `${LABEL}.plist`);
  const target = `gui/${UID}/${LABEL}`;
  const run = async (args: string[]) => {
    const p = spawn({ cmd: [LAUNCHCTL, ...args], stdout: "pipe", stderr: "pipe", stdin: "ignore" });
    const t = setTimeout(() => p.kill("SIGKILL"), 10_000);
    const [o, e, c] = await Promise.all([
      new Response(p.stdout as ReadableStream).text(),
      new Response(p.stderr as ReadableStream).text(),
      p.exited,
    ]);
    clearTimeout(t);
    return { code: c, out: o, err: e };
  };
  const waitFor = async (probe: () => Promise<boolean> | boolean, ms: number) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await probe()) return true;
      await Bun.sleep(200);
    }
    return probe();
  };
  let loaded = false;
  // biome-ignore lint/suspicious/noExplicitAny: dynamic import after LOOM_TEST_HOME is set
  let relay: any = null;
  // biome-ignore lint/suspicious/noExplicitAny: dynamic import after LOOM_TEST_HOME is set
  let tower: any = null;
  const p: string[] = [];
  try {
    process.env.LOOM_TEST_HOME = liveHome;
    const units = await import("../packages/host/src/service-units");
    const { RelayServer } = await import("../packages/relay/src/index");
    const { RelayClient } = await import("../packages/host/src/relay-client");
    const port = 33000 + Math.floor(Math.random() * 20000);
    relay = new RelayServer({ host: "127.0.0.1", port });
    relay.start();
    tower = new RelayClient({ url: `ws://127.0.0.1:${port}/ws` });
    const created = await tower.createRoom({ roomName: "service-live-smoke", displayName: "tower", agentKind: "shell", peerId: "p_tower" });
    if (created.type !== "room.state") throw new Error("createRoom failed");
    const loom = join(liveHome, ".loom");
    const sessionFile = join(loom, "profiles", `${PROFILE}.json`);
    mkdirSync(join(loom, "profiles"), { recursive: true });
    mkdirSync(join(loom, "bridge"), { recursive: true, mode: 0o700 });
    mkdirSync(scratch, { recursive: true });
    writeFileSync(
      sessionFile,
      JSON.stringify({
        roomId: created.roomId,
        roomName: "service-live-smoke",
        inviteCode: created.inviteCode ?? "",
        peerId: "p_node",
        displayName: PROFILE,
        agentKind: "shell",
        relayUrl: `ws://127.0.0.1:${port}/ws`,
      }),
      { mode: 0o600 },
    );
    const cwd = join(liveHome, "work");
    mkdirSync(cwd, { recursive: true });
    writeFileSync(
      join(loom, "bridge", `${PROFILE}.json`),
      JSON.stringify({ authorizedDispatchers: ["p_tower"], worker: { backend: "headless", cwd, allowedRoots: [cwd], timeoutMs: 60_000 } }),
    );
    const logPath = join(loom, "bridge", `${PROFILE}.stderr.log`);
    writeFileSync(logPath, "", { mode: 0o600 });
    const statusPath = join(loom, "bridge", `${PROFILE}.status.json`);
    const rendered = units.renderLaunchdPlist({
      profile: PROFILE,
      execPath: BUN,
      bridgeMainPath: join(ROOT, "packages/host/src/bridge-main.ts"),
      home: liveHome,
      path: process.env.PATH ?? "",
      sessionPath: sessionFile,
      loomProfile: PROFILE,
      logPath,
      loomVersion: "smoke",
    });
    // Test-only: splice LOOM_TEST_HOME into EnvironmentVariables (the product generator never emits it).
    const text = rendered.replace(
      "\t<key>EnvironmentVariables</key>\n\t<dict>\n",
      `\t<key>EnvironmentVariables</key>\n\t<dict>\n\t\t<key>LOOM_TEST_HOME</key>\n\t\t<string>${liveHome}</string>\n`,
    );
    if (text === rendered) throw new Error("could not splice LOOM_TEST_HOME into the plist");
    writeFileSync(plist, text, { mode: 0o644 });
    const readStatus = () => {
      try {
        return JSON.parse(readFileSync(statusPath, "utf8")) as { pid?: number; state?: string };
      } catch {
        return null;
      }
    };
    const t0 = Date.now();
    const boot = await run(["bootstrap", `gui/${UID}`, plist]);
    console.log(`live: bootstrap exit ${boot.code} ${short(boot.err)}`);
    if (boot.code !== 0) p.push(`bootstrap exit ${boot.code}: ${short(boot.err)}`);
    else {
      loaded = true;
      let pid: number | null = null;
      const up = await waitFor(async () => {
        const pr = await run(["print", target]);
        const m = /^\s*pid = (\d+)/m.exec(pr.out);
        pid = m ? Number(m[1]) : null;
        const s = readStatus();
        return pid !== null && s?.state === "running" && s.pid === pid;
      }, 15_000);
      console.log(`live: running=${up} pid=${pid} after ${Date.now() - t0} ms`);
      if (!up) p.push(`never running with matching pid (status ${JSON.stringify(readStatus())})`);
      const dis = await run(["print-disabled", `gui/${UID}`]);
      console.log(`live: print-disabled entry: ${dis.out.split("\n").find((l) => l.includes(LABEL))?.trim() ?? "(none)"} (UK-2)`);
      const t1 = Date.now();
      const out = await run(["bootout", target]);
      console.log(`live: bootout exit ${out.code} ${short(out.err)}`);
      const gone = await waitFor(async () => (await run(["print", target])).code !== 0, 25_000);
      if (gone) loaded = false;
      const stopped = await waitFor(() => readStatus()?.state === "stopped", 5_000);
      console.log(`live: not-found=${gone} stopped=${stopped} after ${Date.now() - t1} ms (UK-1)`);
      if (!gone) p.push("bootout did not unload within 25 s");
      if (!stopped) p.push(`status not stopped: ${JSON.stringify(readStatus())}`);
      console.log(`live: SSH_CONNECTION ${process.env.SSH_CONNECTION ? "set" : "unset"} (UK-3)`);
    }
  } catch (e) {
    p.push((e as Error).message);
  } finally {
    if (loaded) await run(["bootout", target]);
    try {
      tower?.close();
    } catch {
      /* */
    }
    try {
      relay?.stop();
    } catch {
      /* */
    }
    delete process.env.LOOM_TEST_HOME;
    rmSync(liveRoot, { recursive: true, force: true });
  }
  record("live (macOS · owner gate)", p, "bootstrap → running pid match → bootout → stopped · scratch plist and temp home removed");
  return p.length === 0 ? "pass" : "fail";
}

// ---------------------------------------------------------------------------------------------

let exitCode = 0;
const before = realHomeSnapshot();
try {
  console.log(
    `smoke:service — ${USE_SOURCE ? "source" : "dist"} CLI ${CLI} · temp root ${TMP_ROOT} · bun ${Bun.version} · ${PLATFORM}`,
  );
  if (PLATFORM !== "darwin" && PLATFORM !== "linux") throw new Error(`unsupported platform ${PLATFORM}`);
  if (!existsSync(CLI)) throw new Error(`${CLI} missing — run bun run build:cli (or pass --source)`);
  setup();
  await step1();
  await step2();
  await step3();
  await step4();
  await step5();
  await step6();
  const live = await liveSmoke();
  const failed = results.filter((r) => !r.ok).length;
  const expected = 6 + (live === "skipped" ? 0 : 1);
  if (failed > 0 || results.length !== expected) exitCode = 1;
  console.log(`${exitCode === 0 ? "PASS" : "FAIL"} smoke:service — ${results.length - failed}/${expected} steps · live ${live}`);
} catch (e) {
  console.error(`FAIL smoke:service — ${(e as Error).stack ?? e}`);
  exitCode = 1;
} finally {
  cleanup();
}
const persisted = existsSync(TMP_ROOT);
const after = realHomeSnapshot();
if (persisted) {
  console.error(`FAIL zero persistence — ${TMP_ROOT} still exists`);
  exitCode = 1;
} else console.log("PASS zero persistence — temp root removed");
if (after !== before) {
  console.error("FAIL real home changed (~/Library/LaunchAgents · ~/.config/systemd · ~/.loom listing)");
  exitCode = 1;
} else console.log("PASS real home untouched — ~/Library/LaunchAgents · ~/.config/systemd · ~/.loom listings identical");
process.exit(exitCode);
