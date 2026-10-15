/**
 * PLAN 0.33.0 P2 — bridge graceful signals, lifecycle state, lock wiring.
 * Done-when (c)(d): real spawned bridge processes (LOOM_TEST_HOME isolated, fake herdr socket
 * via the existing `startFakeHerdr` — R51-L2, headless backend driving fake-agent-cli).
 * Runner scripts / agent wrappers are written into the per-run temp dir only.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawn, type Subprocess } from "bun";
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
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
import { bridgeMetaPath, loadBridgeMeta, writeBridgeMeta } from "./bridge-meta";
import * as bridgeSpawn from "./bridge-spawn";
import { startBridgeProcess, stopBridgeProcess } from "./bridge-spawn";
import { bridgeStatusPath } from "./bridge-status";
import { startFakeHerdr } from "./fake-herdr";
import { RelayClient } from "./relay-client";
import { type FableSession, resetStateHomeDirCache, setActiveProfile } from "./session-store";

const HOST_SRC = import.meta.dir;
const BRIDGE_MAIN = join(HOST_SRC, "bridge-main.ts");
const BRIDGE_RUNTIME = join(HOST_SRC, "bridge-runtime.ts");
const HERDR_CLIENT = join(HOST_SRC, "herdr-client.ts");
const FAKE_AGENT = join(HOST_SRC, "fake-agent-cli.ts");
const PROFILE = "node";
/** Pane backend profile on the shared fake herdr (P4: headless no longer touches herdr). */
const PANE_PROFILE = "panenode";
const BUN = process.execPath;

type StatusView = {
  pid?: number;
  state?: string;
  herdr?: string;
  lastError?: string;
  stoppedAt?: string;
  heartbeatAt?: string;
  inFlight?: Record<string, number>;
};

type Spawned = {
  proc: Subprocess;
  stderrPath: string;
  stderr: () => string;
};

let seq = 0;

function readStatus(profile = PROFILE): StatusView | null {
  try {
    return JSON.parse(readFileSync(bridgeStatusPath(profile), "utf8")) as StatusView;
  } catch {
    return null;
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killHard(pid: number | undefined): void {
  if (!pid || pid <= 1 || pid === process.pid) return;
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    /* not a group leader */
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    /* already dead */
  }
}

async function waitFor<T>(
  probe: () => T | null | undefined | false,
  timeoutMs: number,
  stepMs = 10,
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

async function exitWithin(proc: Subprocess, ms: number): Promise<number | "timeout"> {
  const r = await Promise.race([
    proc.exited.then((code) => code),
    Bun.sleep(ms).then(() => "timeout" as const),
  ]);
  return r;
}

describe("bridge lifecycle — real spawned bridge (PLAN 0.33.0 P2)", () => {
  const port = 32000 + Math.floor(Math.random() * 20000);
  const dir = mkdtempSync(join(tmpdir(), "loom-p2-life-"));
  const cwd = realpathSync(dir);
  const sessionFile = join(dir, "session.json");
  const herdrSock = join(dir, "h.sock");
  const binDir = join(dir, "bin");
  const runner = join(dir, "runner.ts");
  const relay = new RelayServer({ host: "127.0.0.1", port });
  const live: Subprocess[] = [];
  const workerPids: number[] = [];
  let fake: Awaited<ReturnType<typeof startFakeHerdr>>;
  let tower: RelayClient;
  let session: FableSession;
  const saved = new Map<string, string | undefined>();

  function setEnv(key: string, value: string | undefined): void {
    if (!saved.has(key)) saved.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  function baseEnv(extra: Record<string, string | undefined> = {}): Record<string, string> {
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (typeof v === "string") env[k] = v;
    }
    delete env.LOOM_RELAY_TOKEN;
    delete env.LOOM_RELAY_URL;
    env.LOOM_TEST_HOME = dir;
    env.LOOM_SESSION = sessionFile;
    env.LOOM_PROFILE = PROFILE;
    env.LOOM_NO_AUTO_HOST = "1";
    for (const [k, v] of Object.entries(extra)) {
      if (v === undefined) delete env[k];
      else env[k] = v;
    }
    return env;
  }

  function spawnBridge(
    opts: { extraEnv?: Record<string, string | undefined>; cmd?: string[] } = {},
  ): Spawned {
    seq += 1;
    const stderrPath = join(dir, `spawn-${seq}.stderr.log`);
    const fd = openSync(stderrPath, "w", 0o600);
    const proc = spawn({
      cmd: opts.cmd ?? [BUN, "run", BRIDGE_MAIN],
      env: baseEnv(opts.extraEnv),
      stdout: "ignore",
      stderr: fd,
      stdin: "ignore",
    });
    closeSync(fd);
    live.push(proc);
    return {
      proc,
      stderrPath,
      stderr: () => {
        try {
          return readFileSync(stderrPath, "utf8");
        } catch {
          return "";
        }
      },
    };
  }

  async function waitRunning(b: Spawned, profile = PROFILE, timeoutMs = 15_000): Promise<void> {
    const ok = await waitFor(() => {
      if (b.proc.exitCode !== null) return "exited";
      const s = readStatus(profile);
      return s?.state === "running" && s.pid === b.proc.pid && existsSync(bridgeMetaPath(sessionFile))
        ? "running"
        : null;
    }, timeoutMs, 25);
    if (ok !== "running") {
      throw new Error(
        `bridge did not reach running (exit=${b.proc.exitCode}, status=${JSON.stringify(readStatus(profile))})\n${b.stderr()}`,
      );
    }
  }

  function assertCleanStop(b: Spawned, profile = PROFILE): void {
    const s = readStatus(profile);
    expect(s?.state).toBe("stopped");
    expect(s?.pid).toBe(b.proc.pid);
    expect(typeof s?.stoppedAt).toBe("string");
    expect(existsSync(bridgeMetaPath(sessionFile))).toBe(false);
    expect(existsSync(bridgeLockPath(profile))).toBe(false);
  }

  function dispatch(cardId: string) {
    return tower.handoff({
      to: "@node/wsl-1",
      body: buildDispatchBody({ title: "p2 card", cardId, node: "node/wsl-1" }),
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
    setEnv("LOOM_TEST_HOME", dir);
    setEnv("LOOM_SESSION", sessionFile);
    setEnv("LOOM_PROFILE", PROFILE);
    setEnv("LOOM_NO_AUTO_HOST", "1");
    setEnv("LOOM_RELAY_TOKEN", undefined);
    setEnv("LOOM_RELAY_URL", undefined);
    resetStateHomeDirCache();
    setActiveProfile(null);
    relay.start();
    fake = await startFakeHerdr({ socketPath: herdrSock, autoStatus: "done", autoStatusDelayMs: 20 });
    tower = new RelayClient({ url: `ws://127.0.0.1:${port}/ws` });
    const created = await tower.createRoom({
      roomName: "p2-lifecycle",
      displayName: "tower",
      agentKind: "shell",
      peerId: "p_tower",
    });
    if (created.type !== "room.state") throw new Error("create failed");
    session = {
      roomId: created.roomId,
      roomName: created.roomName ?? "p2-lifecycle",
      inviteCode: created.inviteCode ?? "",
      peerId: "p_node",
      displayName: "node/wsl-1",
      color: "#0f0",
      agentKind: "shell",
      relayUrl: `ws://127.0.0.1:${port}/ws`,
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(sessionFile, JSON.stringify(session), "utf8");

    // Fake agent behind a basename-checked `claude` executable (worker.agentBin).
    mkdirSync(binDir, { recursive: true });
    const wrapper = join(binDir, "claude");
    writeFileSync(wrapper, `#!/bin/sh\nexec "${BUN}" "${FAKE_AGENT}" --fake-kind claude "$@"\n`);
    chmodSync(wrapper, 0o755);

    mkdirSync(join(bridgeConfigPath(PROFILE), ".."), { recursive: true });
    writeFileSync(
      bridgeConfigPath(PROFILE),
      JSON.stringify({
        authorizedDispatchers: ["p_tower"],
        herdrSocketPath: herdrSock,
        worker: {
          backend: "headless",
          cwd,
          allowedRoots: [cwd],
          timeoutMs: 60_000,
          agentBin: { claude: wrapper },
        },
      }),
      "utf8",
    );
    // Pane backend on the fake herdr socket (P4: R11 slow-ping seam · L1 · L2).
    writeFileSync(
      bridgeConfigPath(PANE_PROFILE),
      JSON.stringify({ authorizedDispatchers: ["p_tower"], herdrSocketPath: herdrSock }),
      "utf8",
    );
    // Pane backend + absent herdr socket → startup failure (R10).
    writeFileSync(
      bridgeConfigPath("panefail"),
      JSON.stringify({
        authorizedDispatchers: ["p_tower"],
        herdrSocketPath: join(dir, "missing.sock"),
      }),
      "utf8",
    );

    // Runner: the real bridge-main entry with test-only runtime injection.
    writeFileSync(
      runner,
      [
        `import { runBridgeMain } from ${JSON.stringify(BRIDGE_MAIN)};`,
        `import { HerdrClient } from ${JSON.stringify(HERDR_CLIENT)};`,
        `import { loadBridgeConfig } from ${JSON.stringify(join(HOST_SRC, "bridge-config.ts"))};`,
        `const slowPing = Number(process.env.T_SLOW_PING_MS ?? "0");`,
        `const hang = process.env.T_HANG_TEARDOWN === "1";`,
        `class SlowHerdr extends HerdrClient {`,
        `  async ping() { await Bun.sleep(slowPing); return super.ping(); }`,
        `}`,
        `const cfg = loadBridgeConfig(process.env.LOOM_PROFILE ?? "default");`,
        `await runBridgeMain({`,
        `  runtimeOptions: {`,
        `    ...(process.env.T_STOP_BOUND_MS ? { stopBoundMs: Number(process.env.T_STOP_BOUND_MS) } : {}),`,
        `    ...(hang ? { beforeStopTeardown: () => new Promise<void>(() => {}) } : {}),`,
        `    ...(slowPing > 0 ? { herdr: new SlowHerdr({ socketPath: cfg.herdrSocketPath }) } : {}),`,
        `  },`,
        `});`,
        "",
      ].join("\n"),
      "utf8",
    );
  });

  afterAll(async () => {
    for (const p of live) killHard(p.pid);
    for (const pid of workerPids) killHard(pid);
    try {
      for (const line of readFileSync(join(dir, "argv.jsonl"), "utf8").split("\n")) {
        if (!line.trim()) continue;
        try {
          killHard((JSON.parse(line) as { pid?: number }).pid);
        } catch {
          /* torn line */
        }
      }
    } catch {
      /* no dump */
    }
    tower?.close();
    await fake?.close();
    relay.stop();
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    resetStateHomeDirCache();
    rmSync(dir, { recursive: true, force: true });
  });

  test("SIGTERM → stopping → stopped, exit 0 within 12 s, meta + lock gone (c)", async () => {
    const b = spawnBridge();
    await waitRunning(b);
    expect(existsSync(bridgeLockPath(PROFILE))).toBe(true);
    // PLAN 0.33.0 P4 D6: the headless profile never touches herdr.
    expect(readStatus()?.herdr).toBe("skipped");
    // D5: the 5 s heartbeat runs on a live bridge (doctor stale-detection depends on it).
    const hb0 = readStatus()?.heartbeatAt;
    const advanced = await waitFor(() => {
      const hb = readStatus()?.heartbeatAt;
      return hb && hb !== hb0 && Date.parse(hb) > Date.parse(hb0 ?? "") ? hb : null;
    }, 7_000, 100);
    expect(advanced).not.toBeNull();
    expect(readStatus()?.state).toBe("running");
    const t0 = Date.now();
    b.proc.kill("SIGTERM");
    const code = await exitWithin(b.proc, 12_000);
    expect(code).toBe(0);
    expect(Date.now() - t0).toBeLessThan(12_000);
    assertCleanStop(b);
    const log = b.stderr();
    const iStopping = log.indexOf("state stopping (signal:SIGTERM)");
    const iStopped = log.indexOf("state stopped");
    expect(iStopping).toBeGreaterThanOrEqual(0);
    expect(iStopped).toBeGreaterThan(iStopping);
    expect(readStatus()?.lastError).toBeUndefined();
  }, 40_000);

  test("SIGINT behaves the same (c)", async () => {
    const b = spawnBridge();
    await waitRunning(b);
    b.proc.kill("SIGINT");
    expect(await exitWithin(b.proc, 12_000)).toBe(0);
    assertCleanStop(b);
    expect(b.stderr()).toContain("state stopping (signal:SIGINT)");
  }, 40_000);

  test("RPC stop via `loom bridge stop` takes the same path (R1 · c)", async () => {
    const b = spawnBridge();
    await waitRunning(b);
    const meta = loadBridgeMeta(sessionFile);
    expect(meta?.pid).toBe(b.proc.pid);
    const t0 = Date.now();
    const r = await stopBridgeProcess();
    expect(r.ok).toBe(true);
    expect(r.message).toBe("bridge stopped");
    expect(Date.now() - t0).toBeLessThan(12_000);
    expect(await exitWithin(b.proc, 2_000)).toBe(0);
    assertCleanStop(b);
    expect(b.stderr()).toContain("state stopping (rpc:stop)");
  }, 40_000);

  test("RPC stop reply stays {ok:true, op:\"stop\"} and is delivered before teardown (L3 input)", async () => {
    const b = spawnBridge();
    await waitRunning(b);
    const meta = loadBridgeMeta(sessionFile);
    if (!meta) throw new Error("no meta");
    const res = await fetch(`http://127.0.0.1:${meta.port}/rpc`, {
      method: "POST",
      headers: { authorization: `Bearer ${meta.token}`, "content-type": "application/json" },
      body: JSON.stringify({ op: "stop" }),
    });
    expect(res.ok).toBe(true);
    expect(await res.json()).toEqual({ ok: true, op: "stop" });
    expect(await exitWithin(b.proc, 12_000)).toBe(0);
    assertCleanStop(b);
    expect(b.stderr()).toContain("state stopping (rpc:stop)");
  }, 40_000);

  test("double start of the same profile is refused with the holder pid (D3 · R7)", async () => {
    const a = spawnBridge();
    await waitRunning(a);
    const holder = a.proc.pid;

    const b = spawnBridge();
    expect(await exitWithin(b.proc, 15_000)).toBe(1);
    expect(b.stderr()).toContain(`bridge already running for profile ${PROFILE} (pid ${holder}`);
    // The refused process never writes the holder's status file.
    expect(readStatus()?.pid).toBe(holder);
    expect(readStatus()?.state).toBe("running");

    // CLI start (meta hidden so the meta+ping UX gate is bypassed): the early-exit message
    // carries the last stderr log line → the lock refusal with the holder pid is visible.
    const metaPath = bridgeMetaPath(sessionFile);
    const hidden = `${metaPath}.hidden`;
    renameSync(metaPath, hidden);
    try {
      const r = await startBridgeProcess();
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error).toContain("bridge exited early (code 1)");
        expect(r.error).toContain(`bridge already running for profile ${PROFILE} (pid ${holder}`);
      }
    } finally {
      renameSync(hidden, metaPath);
    }

    a.proc.kill("SIGTERM");
    expect(await exitWithin(a.proc, 12_000)).toBe(0);
    assertCleanStop(a);
  }, 60_000);

  test("headless worker survives SIGTERM and is adopted by the next start — result once (d)", async () => {
    const argvDump = join(dir, "argv.jsonl");
    const fakeEnv = {
      FAKE_DURATION_MS: "6000",
      FAKE_TIME_SCALE: "1",
      FAKE_OUTPUT_BYTES: "64",
      FAKE_ARGV_DUMP: argvDump,
    };
    const a = spawnBridge({ extraEnv: fakeEnv });
    await waitRunning(a);
    const cardId = "task_a0330b0000000001";
    const ack = await dispatch(cardId);
    expect(["queued", "delivered"]).toContain(ack.status);
    const workerPid = await waitFor(() => {
      try {
        const line = readFileSync(argvDump, "utf8").trim().split("\n")[0];
        return line ? ((JSON.parse(line) as { pid?: number }).pid ?? null) : null;
      } catch {
        return null;
      }
    }, 15_000, 25);
    expect(typeof workerPid).toBe("number");
    workerPids.push(workerPid as number);

    a.proc.kill("SIGTERM");
    expect(await exitWithin(a.proc, 12_000)).toBe(0);
    assertCleanStop(a);
    expect(pidAlive(workerPid as number)).toBe(true);
    expect(await countResults(cardId)).toBe(0);

    const b = spawnBridge({ extraEnv: fakeEnv });
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

    b.proc.kill("SIGTERM");
    expect(await exitWithin(b.proc, 12_000)).toBe(0);
    assertCleanStop(b);
  }, 90_000);

  test("stop bound exceeded (slow close injected) still clears meta + lock and records stopped (R2 · M3)", async () => {
    const b = spawnBridge({
      cmd: [BUN, "run", runner],
      extraEnv: { T_HANG_TEARDOWN: "1", T_STOP_BOUND_MS: "1500" },
    });
    await waitRunning(b);
    b.proc.kill("SIGTERM");
    const sawStopping = await waitFor(() => readStatus()?.state === "stopping", 1_400, 5);
    expect(sawStopping).toBe(true);
    expect(await exitWithin(b.proc, 6_000)).toBe(0);
    assertCleanStop(b);
    expect(readStatus()?.lastError).toBe("stop_bound_exceeded");
  }, 40_000);

  test("second signal during stopping exits immediately; next start reclaims the stale lock (D2)", async () => {
    const b = spawnBridge({
      cmd: [BUN, "run", runner],
      extraEnv: { T_HANG_TEARDOWN: "1", T_STOP_BOUND_MS: "9000" },
    });
    await waitRunning(b);
    b.proc.kill("SIGTERM");
    expect(await waitFor(() => readStatus()?.state === "stopping", 3_000, 5)).toBe(true);
    const t0 = Date.now();
    b.proc.kill("SIGTERM");
    expect(await exitWithin(b.proc, 1_000)).toBe(0);
    expect(Date.now() - t0).toBeLessThan(1_000);
    // Immediate exit: no `stopped` record (accepted, R51-L4 i); the lock is left for reclaim.
    expect(readStatus()?.state).toBe("stopping");
    expect(existsSync(bridgeLockPath(PROFILE))).toBe(true);

    const next = spawnBridge();
    await waitRunning(next);
    expect(next.stderr()).toContain(`[bridge] reclaimed stale lock pid=${b.proc.pid}`);
    next.proc.kill("SIGTERM");
    expect(await exitWithin(next.proc, 12_000)).toBe(0);
    assertCleanStop(next);
  }, 60_000);

  test("signal during startup stops right after startup (R11)", async () => {
    // P4 D6: a headless bridge never pings herdr, so the slow-ping seam needs the pane profile.
    const b = spawnBridge({
      cmd: [BUN, "run", runner],
      extraEnv: { T_SLOW_PING_MS: "1500", LOOM_PROFILE: PANE_PROFILE },
    });
    const sawStarting = await waitFor(
      () =>
        readStatus(PANE_PROFILE)?.state === "starting" && readStatus(PANE_PROFILE)?.pid === b.proc.pid,
      10_000,
      5,
    );
    expect(sawStarting).toBe(true);
    b.proc.kill("SIGTERM");
    expect(await exitWithin(b.proc, 15_000)).toBe(0);
    assertCleanStop(b, PANE_PROFILE);
    expect(b.stderr()).toContain("state stopping (signal:SIGTERM)");
  }, 40_000);

  test("pane backend: RPC stop reply {ok:true, op:\"stop\"} is delivered before teardown (P2 carry-over L1)", async () => {
    for (let i = 0; i < 3; i += 1) {
      const b = spawnBridge({ extraEnv: { LOOM_PROFILE: PANE_PROFILE } });
      await waitRunning(b, PANE_PROFILE);
      expect(readStatus(PANE_PROFILE)?.herdr).toBe("ok");
      const meta = loadBridgeMeta(sessionFile);
      if (!meta) throw new Error("no meta");
      // Exactly what `stopBridgeProcess` sends; an ok body is what earns the CLI its 12 s wait.
      const res = await fetch(`http://127.0.0.1:${meta.port}/rpc`, {
        method: "POST",
        headers: { Authorization: `Bearer ${meta.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ op: "stop" }),
        signal: AbortSignal.timeout(2000),
      });
      expect(res.ok).toBe(true);
      expect(await res.json()).toEqual({ ok: true, op: "stop" });
      expect(await exitWithin(b.proc, 12_000)).toBe(0);
      assertCleanStop(b, PANE_PROFILE);
      expect(b.stderr()).not.toContain("second signal");
    }
  }, 60_000);

  test("pane backend: herdr status follows the event stream — down on loss, ok on reconnect (P2 carry-over L2)", async () => {
    const b = spawnBridge({ extraEnv: { LOOM_PROFILE: PANE_PROFILE } });
    await waitRunning(b, PANE_PROFILE);
    const meta = loadBridgeMeta(sessionFile);
    if (!meta) throw new Error("no meta");
    const herdrNow = async (): Promise<{ herdr?: string; herdrOk?: boolean }> => {
      const res = await fetch(`http://127.0.0.1:${meta.port}/rpc`, {
        method: "POST",
        headers: { Authorization: `Bearer ${meta.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ op: "status" }),
      });
      return (await res.json()) as { herdr?: string; herdrOk?: boolean };
    };
    const until = async (want: string, ms: number): Promise<boolean> => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline) {
        if ((await herdrNow()).herdr === want) return true;
        await Bun.sleep(25);
      }
      return false;
    };
    expect((await herdrNow()).herdr).toBe("ok");
    expect((await herdrNow()).herdrOk).toBe(true);
    expect(readStatus(PANE_PROFILE)?.herdr).toBe("ok");

    // herdr goes away entirely → RPC status and the next heartbeat both say "down".
    await fake.close();
    expect(await until("down", 3_000)).toBe(true);
    expect((await herdrNow()).herdrOk).toBe(false);
    const fileDown = await waitFor(() => readStatus(PANE_PROFILE)?.herdr === "down", 7_000, 100);
    expect(fileDown).toBe(true);

    // herdr comes back on the same socket → the client's reconnect flips it back to "ok".
    fake = await startFakeHerdr({ socketPath: herdrSock, autoStatus: "done", autoStatusDelayMs: 20 });
    expect(await until("ok", 12_000)).toBe(true);
    const fileUp = await waitFor(() => readStatus(PANE_PROFILE)?.herdr === "ok", 7_000, 100);
    expect(fileUp).toBe(true);

    b.proc.kill("SIGTERM");
    expect(await exitWithin(b.proc, 12_000)).toBe(0);
    assertCleanStop(b, PANE_PROFILE);
  }, 60_000);

  test("refused CLI start does not truncate the live holder's stderr log (P2 carry-over L3)", async () => {
    const logPath = join(dir, ".loom", "bridge", `${PROFILE}.stderr.log`);
    const first = await startBridgeProcess();
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.alreadyRunning).toBe(false);
    const holder = first.meta.pid;
    const holderLine = await waitFor(
      () => (readFileSync(logPath, "utf8").includes("state running") ? true : null),
      5_000,
      25,
    );
    expect(holderLine).toBe(true);

    const metaPath = bridgeMetaPath(sessionFile);
    const hidden = `${metaPath}.hidden`;
    renameSync(metaPath, hidden);
    try {
      const r = await startBridgeProcess();
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error).toContain(`bridge already running for profile ${PROFILE} (pid ${holder}`);
      }
    } finally {
      renameSync(hidden, metaPath);
    }
    const log = readFileSync(logPath, "utf8");
    // The holder's own lines survive and the refusal is appended after them.
    const iHolder = log.indexOf("state running");
    const iRefusal = log.indexOf(`bridge already running for profile ${PROFILE} (pid ${holder}`);
    expect(iHolder).toBeGreaterThanOrEqual(0);
    expect(iRefusal).toBeGreaterThan(iHolder);
    expect(readStatus()?.pid).toBe(holder);

    const stop = await stopBridgeProcess();
    expect(stop.message).toBe("bridge stopped");
    expect(await waitFor(() => readStatus()?.state === "stopped", 12_000, 25)).toBe(true);
    expect(await waitFor(() => !existsSync(bridgeLockPath(PROFILE)), 5_000, 25)).toBe(true);
  }, 60_000);

  test("no active profile: CLI log, lock and status all use the runtime profile name (P2 carry-over L3)", async () => {
    // Runtime profile = getActiveProfile() ?? session.displayName ?? "default".
    const runtimeProfile = session.displayName; // "node/wsl-1" → safe token "node-wsl-1"
    mkdirSync(join(bridgeConfigPath(runtimeProfile), ".."), { recursive: true });
    writeFileSync(bridgeConfigPath(runtimeProfile), readFileSync(bridgeConfigPath(PROFILE), "utf8"), "utf8");
    const bridgeDir = join(dir, ".loom", "bridge");
    const prev = process.env.LOOM_PROFILE;
    delete process.env.LOOM_PROFILE;
    setActiveProfile(null);
    try {
      const r = await startBridgeProcess();
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const pid = r.meta.pid;
      expect(readStatus(runtimeProfile)?.pid).toBe(pid);
      expect(existsSync(bridgeLockPath(runtimeProfile))).toBe(true);
      expect(bridgeStatusPath(runtimeProfile)).toBe(join(bridgeDir, "node-wsl-1.status.json"));
      const logPath = join(bridgeDir, "node-wsl-1.stderr.log");
      const logged = await waitFor(
        () => (existsSync(logPath) && readFileSync(logPath, "utf8").includes("state running") ? true : null),
        5_000,
        25,
      );
      expect(logged).toBe(true);
      expect(existsSync(join(bridgeDir, "default.stderr.log"))).toBe(false);
      const stop = await stopBridgeProcess();
      expect(stop.message).toBe("bridge stopped");
      expect(await waitFor(() => readStatus(runtimeProfile)?.state === "stopped", 12_000, 25)).toBe(true);
      expect(readStatus(runtimeProfile)?.pid).toBe(pid);
      expect(await waitFor(() => !existsSync(bridgeLockPath(runtimeProfile)), 5_000, 25)).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.LOOM_PROFILE;
      else process.env.LOOM_PROFILE = prev;
    }
  }, 60_000);

  test("startup failure → exit 1 + status stopped with lastError (R10)", async () => {
    const b = spawnBridge({ extraEnv: { LOOM_PROFILE: "panefail" } });
    expect(await exitWithin(b.proc, 15_000)).toBe(1);
    const s = readStatus("panefail");
    expect(s?.state).toBe("stopped");
    expect(s?.pid).toBe(b.proc.pid);
    expect(s?.lastError ?? "").toMatch(/herdr unreachable/);
    expect(existsSync(bridgeLockPath("panefail"))).toBe(false);
  }, 30_000);

  test("CLI stop waits STOP_BOUND_MS + 2 s only when the RPC stop response is ok (L3)", async () => {
    expect(bridgeSpawn.bridgeStopWaitMs(true)).toBe(12_000);
    expect(bridgeSpawn.bridgeStopWaitMs(false)).toBe(3_000);

    // A non-bridge pid that exits on its own after ~5 s: the 12 s wait sees it die,
    // the 3 s wait does not (and M-27 refuses to signal it).
    const okServer = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () => Response.json({ ok: true, op: "stop" }),
    });
    const sleeper = spawn({ cmd: ["sleep", "5"], stdout: "ignore", stderr: "ignore" });
    live.push(sleeper);
    const metaBase = {
      token: "t",
      sessionPath: sessionFile,
      peerId: "p_node",
      roomId: session.roomId,
      roomName: session.roomName,
      displayName: session.displayName,
      herdrSocketPath: herdrSock,
      startedAt: new Date().toISOString(),
    };
    try {
      writeBridgeMeta({ ...metaBase, pid: sleeper.pid, port: okServer.port as number });
      const t0 = Date.now();
      const r = await stopBridgeProcess();
      const elapsed = Date.now() - t0;
      expect(r.message).toBe("bridge stopped");
      expect(elapsed).toBeGreaterThan(3_500);
      expect(elapsed).toBeLessThan(12_000);
    } finally {
      okServer.stop(true);
      killHard(sleeper.pid);
    }

    // RPC fetch failure (nothing listening) → today's 3 s, then M-27 refusal.
    const sleeper2 = spawn({ cmd: ["sleep", "8"], stdout: "ignore", stderr: "ignore" });
    live.push(sleeper2);
    const dead = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("") });
    const deadPort = dead.port as number;
    dead.stop(true);
    try {
      writeBridgeMeta({ ...metaBase, pid: sleeper2.pid, port: deadPort });
      const t0 = Date.now();
      const r = await stopBridgeProcess();
      const elapsed = Date.now() - t0;
      expect(r.message).toContain("NOT killed (M-27)");
      expect(elapsed).toBeGreaterThan(2_500);
      expect(elapsed).toBeLessThan(6_000);
    } finally {
      killHard(sleeper2.pid);
    }
  }, 40_000);
});

describe("process.exit placement (R51-M2)", () => {
  test("bridge-runtime.ts has zero process.exit; bridge-main.ts has exactly three", () => {
    const runtime = readFileSync(BRIDGE_RUNTIME, "utf8");
    const main = readFileSync(BRIDGE_MAIN, "utf8");
    expect(runtime.match(/process\.exit\b/g) ?? []).toHaveLength(0);
    expect(main.match(/process\.exit\(/g) ?? []).toHaveLength(3);
  });

  test("bridge version constant tracks the CLI VERSION", async () => {
    const cli = readFileSync(join(HOST_SRC, "..", "..", "cli", "src", "index.ts"), "utf8");
    const m = cli.match(/const VERSION = "([^"]+)"/);
    const { BRIDGE_VERSION } = await import("./bridge-runtime");
    expect(m?.[1]).toBe(BRIDGE_VERSION);
  });
});
