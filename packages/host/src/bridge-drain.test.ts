/**
 * PLAN 0.33.0 P3 — drain (D4 · R3 · R4 · R51-L1 · R51-L4 iii) on a real spawned bridge.
 * Done-when (e): headless backend driving fake-agent-cli, LOOM_TEST_HOME isolated, fake herdr
 * socket via `startFakeHerdr`. RPC `drain` and CLI `loom bridge drain` paths.
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
import { bridgeMetaPath, loadBridgeMeta } from "./bridge-meta";
import { bridgeStatusPath } from "./bridge-status";
import { startFakeHerdr } from "./fake-herdr";
import { RelayClient } from "./relay-client";
import { type FableSession, resetStateHomeDirCache, setActiveProfile } from "./session-store";

const HOST_SRC = import.meta.dir;
const BRIDGE_MAIN = join(HOST_SRC, "bridge-main.ts");
const CLI_MAIN = join(HOST_SRC, "..", "..", "cli", "src", "index.ts");
const FAKE_AGENT = join(HOST_SRC, "fake-agent-cli.ts");
const PROFILE = "node";
const BUN = process.execPath;

type Remaining = {
  paneCards: number;
  convs: number;
  headlessRunning: number;
  headlessQueued: number;
};

type StatusView = {
  pid?: number;
  state?: string;
  lastError?: string;
  stoppedAt?: string;
  inFlight?: Remaining;
  drain?: { startedAt?: string; deadlineAt?: string };
};

type DrainReply = {
  ok?: boolean;
  op?: string;
  state?: string;
  deadlineAt?: string | null;
  remaining?: Remaining;
  error?: string;
};

type Spawned = {
  proc: Subprocess;
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
  probe: () => T | null | undefined | false | Promise<T | null | undefined | false>,
  timeoutMs: number,
  stepMs = 25,
): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const v = await probe();
    if (v) return v;
    await Bun.sleep(stepMs);
  }
  const v = await probe();
  return v ? v : null;
}

async function exitWithin(proc: Subprocess, ms: number): Promise<number | "timeout"> {
  return Promise.race([
    proc.exited.then((code) => code),
    Bun.sleep(ms).then(() => "timeout" as const),
  ]);
}

describe("bridge drain — real spawned headless bridge (PLAN 0.33.0 P3 · e)", () => {
  const port = 32000 + Math.floor(Math.random() * 20000);
  const dir = mkdtempSync(join(tmpdir(), "loom-p3-drain-"));
  const cwd = realpathSync(dir);
  const sessionFile = join(dir, "session.json");
  const herdrSock = join(dir, "h.sock");
  const binDir = join(dir, "bin");
  const argvDump = join(dir, "argv.jsonl");
  const relay = new RelayServer({ host: "127.0.0.1", port });
  const live: Subprocess[] = [];
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

  function spawnLogged(cmd: string[], extraEnv?: Record<string, string | undefined>): Spawned {
    seq += 1;
    const stderrPath = join(dir, `spawn-${seq}.stderr.log`);
    const fd = openSync(stderrPath, "w", 0o600);
    const proc = spawn({
      cmd,
      env: baseEnv(extraEnv),
      stdout: "ignore",
      stderr: fd,
      stdin: "ignore",
    });
    closeSync(fd);
    live.push(proc);
    return {
      proc,
      stderr: () => {
        try {
          return readFileSync(stderrPath, "utf8");
        } catch {
          return "";
        }
      },
    };
  }

  function spawnBridge(fakeEnv: Record<string, string> = {}): Spawned {
    return spawnLogged([BUN, "run", BRIDGE_MAIN], fakeEnv);
  }

  async function runCli(args: string[], timeoutMs: number) {
    const proc = spawn({
      cmd: [BUN, "run", CLI_MAIN, ...args],
      env: baseEnv(),
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
    });
    live.push(proc);
    const code = await exitWithin(proc, timeoutMs);
    if (code === "timeout") killHard(proc.pid);
    const stdout = await new Response(proc.stdout as ReadableStream).text();
    const stderr = await new Response(proc.stderr as ReadableStream).text();
    return { code, stdout, stderr };
  }

  async function waitRunning(b: Spawned, timeoutMs = 15_000): Promise<void> {
    const ok = await waitFor(() => {
      if (b.proc.exitCode !== null) return "exited";
      const s = readStatus();
      return s?.state === "running" && s.pid === b.proc.pid && existsSync(bridgeMetaPath(sessionFile))
        ? "running"
        : null;
    }, timeoutMs);
    if (ok !== "running") {
      throw new Error(
        `bridge did not reach running (exit=${b.proc.exitCode}, status=${JSON.stringify(readStatus())})\n${b.stderr()}`,
      );
    }
  }

  function assertCleanStop(b: Spawned): void {
    const s = readStatus();
    expect(s?.state).toBe("stopped");
    expect(s?.pid).toBe(b.proc.pid);
    expect(typeof s?.stoppedAt).toBe("string");
    expect(existsSync(bridgeMetaPath(sessionFile))).toBe(false);
    expect(existsSync(bridgeLockPath(PROFILE))).toBe(false);
  }

  async function rpc(body: Record<string, unknown>): Promise<{ status: number; json: DrainReply & Record<string, unknown> }> {
    const meta = loadBridgeMeta(sessionFile);
    if (!meta) throw new Error("no bridge meta");
    const res = await fetch(`http://127.0.0.1:${meta.port}/rpc`, {
      method: "POST",
      headers: { authorization: `Bearer ${meta.token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json().catch(() => ({}))) as DrainReply & Record<string, unknown> };
  }

  async function dispatch(cardId: string): Promise<string> {
    const ack = await tower.handoff({
      to: "@node/wsl-1",
      body: buildDispatchBody({ title: "p3 card", cardId, node: "node/wsl-1" }),
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
    return ack.handoffId;
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

  async function waitResults(cardId: string, want: number, timeoutMs: number): Promise<number> {
    let n = 0;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      n = await countResults(cardId);
      if (n >= want) break;
      await Bun.sleep(200);
    }
    return n;
  }

  /** The node's unclaimed relay inbox (only while no bridge holds the node connection). */
  async function nodeInboxIds(): Promise<string[]> {
    const s = JSON.parse(readFileSync(sessionFile, "utf8")) as FableSession;
    const node = new RelayClient({ url: `ws://127.0.0.1:${port}/ws` });
    try {
      const joined = await node.joinRoom({
        inviteCode: s.inviteCode,
        displayName: s.displayName,
        agentKind: "shell",
        peerId: s.peerId,
        color: s.color,
        peerSecret: s.peerSecret,
      });
      if (joined.type === "error") throw new Error(joined.message);
      return (await node.listInbox()).map((e) => e.handoff.id);
    } finally {
      node.close();
    }
  }

  function workerPidsFromDump(): number[] {
    try {
      return readFileSync(argvDump, "utf8")
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => {
          try {
            return (JSON.parse(l) as { pid?: number }).pid ?? 0;
          } catch {
            return 0;
          }
        })
        .filter((p) => p > 0);
    } catch {
      return [];
    }
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
      roomName: "p3-drain",
      displayName: "tower",
      agentKind: "shell",
      peerId: "p_tower",
    });
    if (created.type !== "room.state") throw new Error("create failed");
    session = {
      roomId: created.roomId,
      roomName: created.roomName ?? "p3-drain",
      inviteCode: created.inviteCode ?? "",
      peerId: "p_node",
      displayName: "node/wsl-1",
      color: "#0f0",
      agentKind: "shell",
      relayUrl: `ws://127.0.0.1:${port}/ws`,
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(sessionFile, JSON.stringify(session), "utf8");

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
  });

  afterAll(async () => {
    for (const p of live) killHard(p.pid);
    for (const pid of workerPidsFromDump()) killHard(pid);
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

  test("RPC drain: running card finishes, queued + new handoffs stay unclaimed, exit 0; next start claims them (e · R4 · L4 iii)", async () => {
    const slow = {
      FAKE_DURATION_MS: "5000",
      FAKE_TIME_SCALE: "1",
      FAKE_OUTPUT_BYTES: "64",
      FAKE_ARGV_DUMP: argvDump,
    };
    const a = spawnBridge(slow);
    await waitRunning(a);

    const c1 = "task_a0330c0000000001";
    const c2 = "task_a0330c0000000002";
    const c3 = "task_a0330c0000000003";
    await dispatch(c1);
    const worker = await waitFor(() => workerPidsFromDump()[0] ?? null, 15_000);
    expect(typeof worker).toBe("number");
    const h2 = await dispatch(c2);
    // c2 waits for the claude lane permit (maxConcurrent 1) — unclaimed, counted as queued.
    const queued = await waitFor(async () => {
      const st = await rpc({ op: "status" });
      const q = (st.json.headless as { queueDepth?: Record<string, number> } | undefined)?.queueDepth;
      return q?.claude === 1 ? true : null;
    }, 10_000, 100);
    expect(queued).toBe(true);

    const first = await rpc({ op: "drain", timeoutSec: 120 });
    expect(first.status).toBe(200);
    expect(first.json.ok).toBe(true);
    expect(first.json.op).toBe("drain");
    expect(first.json.state).toBe("draining");
    expect(typeof first.json.deadlineAt).toBe("string");
    const deadlineMs = Date.parse(first.json.deadlineAt as string);
    expect(deadlineMs - Date.now()).toBeGreaterThan(100_000);
    expect(first.json.remaining).toEqual({
      paneCards: 0,
      convs: 0,
      headlessRunning: 1,
      headlessQueued: 1,
    });

    // Idempotent: a second call keeps the first deadline and returns current progress.
    const second = await rpc({ op: "drain", timeoutSec: 1 });
    expect(second.status).toBe(200);
    expect(second.json.state).toBe("draining");
    expect(second.json.deadlineAt).toBe(first.json.deadlineAt);
    expect(second.json.remaining?.headlessRunning).toBe(1);

    // Status file + RPC status show draining + remaining counts.
    const sf = readStatus();
    expect(sf?.state).toBe("draining");
    expect(sf?.drain?.deadlineAt).toBe(first.json.deadlineAt as string);
    expect(sf?.inFlight?.headlessRunning).toBe(1);
    expect(sf?.inFlight?.headlessQueued).toBe(1);
    const st = await rpc({ op: "status" });
    expect(st.json.state).toBe("draining");
    expect((st.json.drain as { deadlineAt?: string } | undefined)?.deadlineAt).toBe(
      first.json.deadlineAt as string,
    );
    expect((st.json.remaining as Remaining | undefined)?.headlessRunning).toBe(1);

    // A new handoff during drain is not claimed; each poll re-observes it (one stderr line).
    const h3 = await dispatch(c3);
    const seen = await waitFor(
      () => (a.stderr().includes(`drain: not claiming handoff ${h3}`) ? true : null),
      6_000,
      50,
    );
    expect(seen).toBe(true);

    expect(await exitWithin(a.proc, 25_000)).toBe(0);
    assertCleanStop(a);
    const log = a.stderr();
    const iDraining = log.indexOf("state draining (rpc:drain)");
    const iStopping = log.indexOf("state stopping (drain)");
    expect(iDraining).toBeGreaterThanOrEqual(0);
    expect(iStopping).toBeGreaterThan(iDraining);
    expect(readStatus()?.lastError).toBeUndefined();

    // The running card's result was delivered exactly once; c2 / c3 never ran.
    expect(await waitResults(c1, 1, 5_000)).toBe(1);
    expect(await countResults(c2)).toBe(0);
    expect(await countResults(c3)).toBe(0);
    expect(workerPidsFromDump()).toHaveLength(1);
    const inbox = await nodeInboxIds();
    expect(inbox).toContain(h2);
    expect(inbox).toContain(h3);

    // The next bridge claims both.
    const b = spawnBridge({ ...slow, FAKE_DURATION_MS: "200" });
    await waitRunning(b);
    expect(await waitResults(c2, 1, 30_000)).toBe(1);
    expect(await waitResults(c3, 1, 30_000)).toBe(1);
    await Bun.sleep(1_000);
    expect(await countResults(c1)).toBe(1);
    expect(await countResults(c2)).toBe(1);
    expect(await countResults(c3)).toBe(1);
    b.proc.kill("SIGTERM");
    expect(await exitWithin(b.proc, 12_000)).toBe(0);
    assertCleanStop(b);
  }, 120_000);

  test("CLI drain past the deadline: exit 0, worker survives and is adopted by the next start (e · classes 1–2)", async () => {
    const slow = {
      FAKE_DURATION_MS: "9000",
      FAKE_TIME_SCALE: "1",
      FAKE_OUTPUT_BYTES: "64",
      FAKE_ARGV_DUMP: argvDump,
    };
    const before = workerPidsFromDump().length;
    const a = spawnBridge(slow);
    await waitRunning(a);
    const c4 = "task_a0330c0000000004";
    await dispatch(c4);
    const worker = await waitFor(() => workerPidsFromDump()[before] ?? null, 15_000);
    expect(typeof worker).toBe("number");

    const t0 = Date.now();
    const cli = await runCli(["bridge", "drain", "--timeout", "1"], 30_000);
    expect(cli.code).toBe(0);
    expect(Date.now() - t0).toBeLessThan(20_000);
    expect(cli.stdout).toMatch(/draining/);
    expect(cli.stdout).toMatch(/headlessRunning=1/);
    expect(cli.stdout).toMatch(/stopped/);

    expect(await exitWithin(a.proc, 5_000)).toBe(0);
    assertCleanStop(a);
    const log = a.stderr();
    expect(log).toContain("state draining (rpc:drain)");
    expect(log).toContain("state stopping (drain_timeout)");
    expect(log).toMatch(/drain deadline reached.*headlessRunning=1/);
    expect(pidAlive(worker as number)).toBe(true);
    expect(await countResults(c4)).toBe(0);

    const b = spawnBridge(slow);
    await waitRunning(b);
    expect(await waitResults(c4, 1, 30_000)).toBe(1);
    await Bun.sleep(1_500);
    expect(await countResults(c4)).toBe(1);
    b.proc.kill("SIGTERM");
    expect(await exitWithin(b.proc, 12_000)).toBe(0);
    assertCleanStop(b);
  }, 120_000);

  test("idle drain via CLI exits immediately; bad timeouts refused; no bridge → `no bridge running` exit 0", async () => {
    const a = spawnBridge();
    await waitRunning(a);

    for (const bad of [0, 86_401, 1.5, "60", -1]) {
      const r = await rpc({ op: "drain", timeoutSec: bad });
      expect(r.status).toBe(400);
      expect(r.json.ok).toBe(false);
    }
    expect(readStatus()?.state).toBe("running");
    const usage = await runCli(["bridge", "drain", "--timeout", "abc"], 15_000);
    expect(usage.code).toBe(1);
    expect(readStatus()?.state).toBe("running");

    const t0 = Date.now();
    const cli = await runCli(["bridge", "drain"], 30_000);
    expect(cli.code).toBe(0);
    expect(Date.now() - t0).toBeLessThan(10_000);
    expect(cli.stdout).toMatch(/stopped/);
    expect(await exitWithin(a.proc, 3_000)).toBe(0);
    assertCleanStop(a);
    const log = a.stderr();
    expect(log).toContain("state draining (rpc:drain)");
    expect(log).toContain("state stopping (drain)");
    // Default deadline (UK-3) is 600 s.
    const s = readStatus();
    const span = Date.parse(s?.drain?.deadlineAt ?? "") - Date.parse(s?.drain?.startedAt ?? "");
    expect(span).toBe(600_000);

    const none = await runCli(["bridge", "drain"], 15_000);
    expect(none.code).toBe(0);
    expect(none.stdout).toContain("no bridge running");
  }, 90_000);

  test("RPC drain on an idle bridge replies first, then the bridge exits 0", async () => {
    const a = spawnBridge();
    await waitRunning(a);
    const r = await rpc({ op: "drain" });
    expect(r.status).toBe(200);
    expect(r.json.ok).toBe(true);
    expect(["draining", "stopping"]).toContain(r.json.state as string);
    expect(r.json.remaining).toEqual({ paneCards: 0, convs: 0, headlessRunning: 0, headlessQueued: 0 });
    expect(await exitWithin(a.proc, 12_000)).toBe(0);
    assertCleanStop(a);
  }, 40_000);
});
