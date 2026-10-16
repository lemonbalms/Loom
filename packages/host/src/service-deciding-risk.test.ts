/**
 * PLAN 0.34.0 P2 — deciding-risk test (D4 · D6 · R52-L3 · Done-when (d)).
 *
 * The bridge is spawned with EXACTLY the argv + env + WorkingDirectory the P1 generators write
 * into the unit (launchd ProgramArguments/EnvironmentVariables and systemd ExecStart/Environment,
 * parsed back from the rendered text and required to agree). No inherited env (`env -i`
 * equivalent) and no LOOM_TEST_HOME in the bridge: isolation comes from the unit's own HOME
 * (a temp dir — `stateRootHome()` falls back to `homedir()` = $HOME). The test process itself
 * sets LOOM_TEST_HOME to that same dir only to read the status file.
 *
 * Proved (R52-L3): a bridge started from the unit argv/env, stopped by SIGTERM to its main pid
 * only (KillMode=process / launchd stop model), exits 0 within 10 s without SIGKILL, its headless
 * worker runs in a different process group and survives, and the next start from the same
 * argv/env adopts it and delivers the result exactly once.
 * NOT proved: systemd cgroup-scope kill · left-over process handling · launchd process-group /
 * audit-session handling · the SIGKILL path (UK-1 · UK-4) — those need a real service manager.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildDispatchBody,
  CARD_CONTRACT_VERSION,
  CARD_DISPATCH_LABEL,
  CARD_RESULT_LABEL,
  serializeCardAttachment,
} from "@loom/protocol";
import { RelayServer } from "@loom/relay";
import { bridgeConfigPath } from "./bridge-config";
import { bridgeLockPath } from "./bridge-lock";
import { bridgeMetaPath } from "./bridge-meta";
import { bridgeStatusPath } from "./bridge-status";
import { RelayClient } from "./relay-client";
import { renderLaunchdPlist, renderSystemdUnit, type ServiceUnitSpec } from "./service-units";
import { type FableSession, resetStateHomeDirCache, setActiveProfile } from "./session-store";

const HOST_SRC = import.meta.dir;
const BRIDGE_MAIN = join(HOST_SRC, "bridge-main.ts");
const FAKE_AGENT = join(HOST_SRC, "fake-agent-cli.ts");
const PROFILE = "svcrisk";
const BUN = process.execPath;

type UnitLaunch = { argv: string[]; env: Record<string, string>; cwd: string };
type StatusView = { pid?: number; state?: string };
type Bridge = {
  proc: ChildProcess;
  pid: number;
  exited: Promise<{ code: number | null; signal: string | null }>;
  stderr: () => string;
};

// ---------------------------------------------------------------------------------------------
// Parse the generated unit text back into argv / env / cwd (test-side readers only)
// ---------------------------------------------------------------------------------------------

function xmlUnescape(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function plistLaunch(plist: string): UnitLaunch {
  const strings = (block: string) =>
    [...block.matchAll(/<string>([^<]*)<\/string>/g)].map((m) => xmlUnescape(m[1] as string));
  const args = plist.match(/<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/);
  const envBlock = plist.match(/<key>EnvironmentVariables<\/key>\s*<dict>([\s\S]*?)<\/dict>/);
  const wd = plist.match(/<key>WorkingDirectory<\/key>\s*<string>([^<]*)<\/string>/);
  if (!args || !envBlock || !wd) throw new Error(`unparseable plist:\n${plist}`);
  const env: Record<string, string> = {};
  for (const m of (envBlock[1] as string).matchAll(
    /<key>([^<]*)<\/key>\s*<string>([^<]*)<\/string>/g,
  )) {
    env[xmlUnescape(m[1] as string)] = xmlUnescape(m[2] as string);
  }
  return { argv: strings(args[1] as string), env, cwd: xmlUnescape(wd[1] as string) };
}

/** systemd word split: double quotes + backslash escapes, then `$$`→`$` (ExecStart) and `%%`→`%`. */
function sdWords(line: string): string[] {
  const words: string[] = [];
  let cur = "";
  let inWord = false;
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i] as string;
    if (quoted) {
      if (c === "\\") {
        cur += line[++i] ?? "";
      } else if (c === '"') {
        quoted = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      quoted = true;
      inWord = true;
    } else if (/\s/.test(c)) {
      if (inWord) words.push(cur);
      cur = "";
      inWord = false;
    } else {
      cur += c;
      inWord = true;
    }
  }
  if (inWord) words.push(cur);
  return words;
}

function systemdLaunch(unit: string): UnitLaunch {
  const lines = unit.split("\n");
  const value = (key: string) =>
    lines.filter((l) => l.startsWith(`${key}=`)).map((l) => l.slice(key.length + 1));
  const exec = value("ExecStart");
  const wd = value("WorkingDirectory");
  if (exec.length !== 1 || wd.length !== 1) throw new Error(`unparseable unit:\n${unit}`);
  const argv = sdWords(exec[0] as string).map((w) => w.replace(/\$\$/g, "$").replace(/%%/g, "%"));
  const env: Record<string, string> = {};
  for (const raw of value("Environment")) {
    for (const word of sdWords(raw)) {
      const eq = word.indexOf("=");
      env[word.slice(0, eq)] = word.slice(eq + 1).replace(/%%/g, "%");
    }
  }
  return { argv, env, cwd: (wd[0] as string).replace(/%%/g, "%") };
}

// ---------------------------------------------------------------------------------------------

function readStatus(): StatusView | null {
  try {
    return JSON.parse(readFileSync(bridgeStatusPath(PROFILE), "utf8")) as StatusView;
  } catch {
    return null;
  }
}

function pgidOf(pid: number): number | null {
  const r = spawnSync("ps", ["-o", "pgid=", "-p", String(pid)], { encoding: "utf8" });
  const n = Number.parseInt((r.stdout ?? "").trim(), 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function groupAlive(pgid: number): boolean {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch {
    return false;
  }
}

function killGroupHard(pgid: number | null | undefined): void {
  if (!pgid || pgid <= 1 || pgid === process.pid) return;
  try {
    process.kill(-pgid, "SIGKILL");
  } catch {
    /* gone */
  }
}

async function waitFor<T>(
  probe: () => T | null | undefined | false,
  timeoutMs: number,
  stepMs = 25,
): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const v = probe();
    if (v) return v;
    await Bun.sleep(stepMs);
  }
  const v = probe();
  return v ? v : null;
}

describe("deciding risk — unit argv/env only: main-pid SIGTERM keeps the worker, restart adopts (PLAN 0.34.0 P2 · R52-L3)", () => {
  const port = 32000 + Math.floor(Math.random() * 20000);
  const home = realpathSync(mkdtempSync(join(tmpdir(), "loom-p2-risk-")));
  const sessionFile = join(home, "session.json");
  const binDir = join(home, "bin");
  const argvDump = join(home, "argv.jsonl");
  const relay = new RelayServer({ host: "127.0.0.1", port });
  const bridges: Bridge[] = [];
  const groups: number[] = [];
  let tower: RelayClient;
  let session: FableSession;
  let launch: UnitLaunch;
  const saved = new Map<string, string | undefined>();
  let seq = 0;

  function setEnv(key: string, value: string | undefined): void {
    if (!saved.has(key)) saved.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  /** Exactly the unit: argv · env (nothing inherited) · WorkingDirectory · stdout /dev/null · stderr append. */
  function startFromUnit(): Bridge {
    seq += 1;
    const fd = openSync(join(home, `unit-${seq}.stderr.log`), "a", 0o600);
    const stderrPath = join(home, `unit-${seq}.stderr.log`);
    const proc = spawn(launch.argv[0] as string, launch.argv.slice(1), {
      env: { ...launch.env },
      cwd: launch.cwd,
      // Service managers start the job as its own session / process-group leader.
      detached: true,
      stdio: ["ignore", "ignore", fd],
    });
    closeSync(fd);
    if (!proc.pid) throw new Error("spawn failed");
    groups.push(proc.pid);
    const exited = new Promise<{ code: number | null; signal: string | null }>((resolve) => {
      proc.once("exit", (code, signal) => resolve({ code, signal }));
    });
    const b: Bridge = {
      proc,
      pid: proc.pid,
      exited,
      stderr: () => {
        try {
          return readFileSync(stderrPath, "utf8");
        } catch {
          return "";
        }
      },
    };
    bridges.push(b);
    return b;
  }

  async function waitRunning(b: Bridge): Promise<void> {
    let done = false;
    void b.exited.then(() => {
      done = true;
    });
    const ok = await waitFor(() => {
      if (done) return "exited";
      const s = readStatus();
      return s?.state === "running" && s.pid === b.pid && existsSync(bridgeMetaPath(sessionFile))
        ? "running"
        : null;
    }, 15_000);
    if (ok !== "running") {
      throw new Error(
        `unit bridge did not reach running (status=${JSON.stringify(readStatus())})\n${b.stderr()}`,
      );
    }
  }

  async function exitWithin(b: Bridge, ms: number) {
    return Promise.race([b.exited, Bun.sleep(ms).then(() => "timeout" as const)]);
  }

  async function countResults(cardId: string): Promise<number> {
    let n = 0;
    for (const entry of await tower.listInbox()) {
      for (const attachment of entry.handoff.attachments ?? []) {
        if (attachment.label !== CARD_RESULT_LABEL) continue;
        const result = JSON.parse(attachment.content) as { cardId?: string };
        if (result.cardId === cardId) n += 1;
      }
    }
    return n;
  }

  beforeAll(async () => {
    // Test-process view of the bridge's state root (the bridge itself gets only the unit env).
    setEnv("LOOM_TEST_HOME", home);
    setEnv("LOOM_SESSION", sessionFile);
    setEnv("LOOM_PROFILE", PROFILE);
    setEnv("LOOM_RELAY_TOKEN", undefined);
    setEnv("LOOM_RELAY_URL", undefined);
    resetStateHomeDirCache();
    setActiveProfile(null);
    relay.start();
    tower = new RelayClient({ url: `ws://127.0.0.1:${port}/ws` });
    const created = await tower.createRoom({
      roomName: "p2-risk",
      displayName: "tower",
      agentKind: "shell",
      peerId: "p_tower",
    });
    if (created.type !== "room.state") throw new Error("create failed");
    session = {
      roomId: created.roomId,
      roomName: created.roomName ?? "p2-risk",
      inviteCode: created.inviteCode ?? "",
      peerId: "p_node",
      displayName: "node/svc-risk",
      color: "#0f0",
      agentKind: "shell",
      relayUrl: `ws://127.0.0.1:${port}/ws`,
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(sessionFile, JSON.stringify(session), { encoding: "utf8", mode: 0o600 });

    // Fake agent: its knobs live in the wrapper (the unit env carries none of them).
    mkdirSync(binDir, { recursive: true });
    const wrapper = join(binDir, "claude");
    writeFileSync(
      wrapper,
      [
        "#!/bin/sh",
        "export FAKE_DURATION_MS=6000 FAKE_TIME_SCALE=1 FAKE_OUTPUT_BYTES=64",
        `export FAKE_ARGV_DUMP="${argvDump}"`,
        `exec "${BUN}" "${FAKE_AGENT}" --fake-kind claude "$@"`,
        "",
      ].join("\n"),
    );
    chmodSync(wrapper, 0o755);
    mkdirSync(join(bridgeConfigPath(PROFILE), ".."), { recursive: true });
    writeFileSync(
      bridgeConfigPath(PROFILE),
      JSON.stringify({
        authorizedDispatchers: ["p_tower"],
        herdrSocketPath: join(home, "absent-herdr.sock"),
        worker: {
          backend: "headless",
          cwd: home,
          allowedRoots: [home],
          timeoutMs: 60_000,
          agentBin: { claude: wrapper },
        },
      }),
      "utf8",
    );

    // P1 generators only — the spec an install would resolve (absolute bun · bridge-main · HOME ·
    // captured PATH · LOOM_SESSION · LOOM_PROFILE).
    const spec: ServiceUnitSpec = {
      profile: PROFILE,
      execPath: BUN,
      bridgeMainPath: BRIDGE_MAIN,
      home,
      path: process.env.PATH ?? "/usr/bin:/bin",
      sessionPath: sessionFile,
      loomProfile: PROFILE,
      logPath: join(home, ".loom", "bridge", `${PROFILE}.stderr.log`),
      loomVersion: "0.34.0-test",
    };
    const fromPlist = plistLaunch(renderLaunchdPlist(spec));
    const fromUnit = systemdLaunch(renderSystemdUnit(spec));
    expect(fromUnit).toEqual(fromPlist);
    launch = fromPlist;
  });

  afterAll(async () => {
    for (const b of bridges) {
      if (b.proc.exitCode === null && b.proc.signalCode === null) {
        try {
          process.kill(b.pid, "SIGKILL");
        } catch {
          /* gone */
        }
      }
    }
    for (const g of groups) killGroupHard(g);
    try {
      for (const line of readFileSync(argvDump, "utf8").split("\n")) {
        if (!line.trim()) continue;
        try {
          const pid = (JSON.parse(line) as { pid?: number }).pid;
          if (pid) killGroupHard(pid);
        } catch {
          /* torn line */
        }
      }
    } catch {
      /* no dump */
    }
    tower?.close();
    relay.stop();
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    resetStateHomeDirCache();
    rmSync(home, { recursive: true, force: true });
  });

  test("the launch is exactly the generated unit: two args, five env keys max, no token / test hooks", () => {
    expect(launch.argv).toEqual([BUN, BRIDGE_MAIN]);
    expect(Object.keys(launch.env).sort()).toEqual(
      ["HOME", "LOOM_PROFILE", "LOOM_SERVICE", "LOOM_SESSION", "PATH"].sort(),
    );
    expect(launch.env.HOME).toBe(home);
    expect(launch.env.LOOM_SERVICE).toBe("1");
    expect(launch.cwd).toBe(home);
    for (const k of ["LOOM_TEST_HOME", "LOOM_RELAY_TOKEN", "LOOM_RELAY_URL", "FABLE_RELAY_TOKEN"]) {
      expect(launch.env[k]).toBeUndefined();
    }
  });

  test("worker pgid ≠ bridge pgid · SIGTERM main pid only → exit 0 ≤10 s · worker group alive · restart adopts, result once (d)", async () => {
    const a = startFromUnit();
    await waitRunning(a);
    const bridgePgid = pgidOf(a.pid);
    expect(bridgePgid).not.toBeNull();

    const cardId = "task_a0340b2000000001";
    const ack = await tower.handoff({
      to: `@${session.displayName}`,
      body: buildDispatchBody({ title: "p2 risk card", cardId, node: session.displayName }),
      mode: "task",
      attachments: [
        serializeCardAttachment(CARD_DISPATCH_LABEL, {
          v: CARD_CONTRACT_VERSION,
          cardId,
          sourceRoomId: session.roomId,
          prompt: "write the bytes",
          agentKind: "claude" as const,
        }),
      ],
    });
    expect(["queued", "delivered"]).toContain(ack.status);
    const workerPid = await waitFor(() => {
      try {
        const line = readFileSync(argvDump, "utf8").trim().split("\n")[0];
        return line ? ((JSON.parse(line) as { pid?: number }).pid ?? null) : null;
      } catch {
        return null;
      }
    }, 15_000);
    expect(typeof workerPid).toBe("number");
    const workerPgid = pgidOf(workerPid as number);
    expect(workerPgid).not.toBeNull();
    groups.push(workerPgid as number);
    // R52-L3: the premise AbandonProcessGroup / KillMode=process relies on.
    expect(workerPgid).not.toBe(bridgePgid);

    // Service-manager stop model: SIGTERM to the main pid only (never the group), no SIGKILL.
    const t0 = Date.now();
    process.kill(a.pid, "SIGTERM");
    const res = await exitWithin(a, 10_000);
    expect(res).not.toBe("timeout");
    expect(res).toEqual({ code: 0, signal: null });
    expect(Date.now() - t0).toBeLessThan(10_000);
    expect(readStatus()?.state).toBe("stopped");
    expect(existsSync(bridgeLockPath(PROFILE))).toBe(false);
    expect(groupAlive(workerPgid as number)).toBe(true);
    expect(await countResults(cardId)).toBe(0);

    // Restart with the very same argv/env → adoption, result delivered exactly once.
    const b = startFromUnit();
    await waitRunning(b);
    let n = 0;
    const deadline = Date.now() + 25_000;
    while (Date.now() < deadline) {
      n = await countResults(cardId);
      if (n > 0) break;
      await Bun.sleep(200);
    }
    expect(n).toBe(1);
    await Bun.sleep(1_500);
    expect(await countResults(cardId)).toBe(1);
    // Only one fake-agent invocation ever ran: adopted, not re-spawned.
    expect(readFileSync(argvDump, "utf8").trim().split("\n")).toHaveLength(1);

    process.kill(b.pid, "SIGTERM");
    expect(await exitWithin(b, 10_000)).toEqual({ code: 0, signal: null });
    expect(readStatus()?.state).toBe("stopped");
  }, 120_000);
});
