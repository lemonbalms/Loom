/**
 * PLAN 0.34.0 P2 — D3 service lock-busy yield (R1 · R2).
 * Done-when (c): with `LOOM_SERVICE=1` a bridge refused by a LIVE holder (holderPid !== null)
 * exits 0 with one stderr line `yield to bridge pid <A>` and leaves the holder's status file
 * alone; holder unknown (owner-less lock dir) and every other startup failure stay exit 1;
 * without `LOOM_SERVICE` the 0.33.0 R10 behaviour (exit 1) is unchanged.
 * Real spawned bridges, LOOM_TEST_HOME isolated, headless backend (no herdr), fake agent CLI.
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
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RelayServer } from "@loom/relay";
import { bridgeConfigPath } from "./bridge-config";
import { BridgeLockBusyError, bridgeLockPath } from "./bridge-lock";
import * as bridgeMain from "./bridge-main";
import { bridgeMetaPath } from "./bridge-meta";
import { bridgeStatusPath } from "./bridge-status";
import { RelayClient } from "./relay-client";
import { type FableSession, resetStateHomeDirCache, setActiveProfile } from "./session-store";

const HOST_SRC = import.meta.dir;
const BRIDGE_MAIN = join(HOST_SRC, "bridge-main.ts");
const BRIDGE_RUNTIME = join(HOST_SRC, "bridge-runtime.ts");
const FAKE_AGENT = join(HOST_SRC, "fake-agent-cli.ts");
const PROFILE = "svcyield";
const INCOMPLETE_PROFILE = "svcyieldinc";
const BUN = process.execPath;

type IsServiceYield = (err: unknown, env: Record<string, string | undefined>) => boolean;
/** Namespace lookup so the red commit loads (the export lands with the green commit). */
const isServiceYield = (bridgeMain as unknown as { isServiceYield?: IsServiceYield })
  .isServiceYield;

type StatusView = { pid?: number; state?: string; startedAt?: string; lastError?: string };

type Spawned = { proc: Subprocess; stderr: () => string };

let seq = 0;

function readStatus(profile = PROFILE): StatusView | null {
  try {
    return JSON.parse(readFileSync(bridgeStatusPath(profile), "utf8")) as StatusView;
  } catch {
    return null;
  }
}

function killHard(pid: number | undefined): void {
  if (!pid || pid <= 1 || pid === process.pid) return;
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    /* already dead */
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

async function exitWithin(proc: Subprocess, ms: number): Promise<number | "timeout"> {
  return Promise.race([
    proc.exited.then((code) => code),
    Bun.sleep(ms).then(() => "timeout" as const),
  ]);
}

describe("isServiceYield — pure table (PLAN 0.34.0 D3 · R1)", () => {
  const live = new BridgeLockBusyError("busy", 4242, "/x/p.lock");
  const unknown = new BridgeLockBusyError("busy", null, "/x/p.lock");
  const rows: Array<[string, unknown, Record<string, string | undefined>, boolean]> = [
    ["live holder + LOOM_SERVICE=1", live, { LOOM_SERVICE: "1" }, true],
    ["live holder, LOOM_SERVICE unset", live, {}, false],
    ["live holder, LOOM_SERVICE=0", live, { LOOM_SERVICE: "0" }, false],
    ["live holder, LOOM_SERVICE=true", live, { LOOM_SERVICE: "true" }, false],
    ["live holder, LOOM_SERVICE=' 1'", live, { LOOM_SERVICE: " 1" }, false],
    ["live holder, LOOM_SERVICE=''", live, { LOOM_SERVICE: "" }, false],
    ["holder unknown (incomplete) + LOOM_SERVICE=1", unknown, { LOOM_SERVICE: "1" }, false],
    ["other Error + LOOM_SERVICE=1", new Error("no session"), { LOOM_SERVICE: "1" }, false],
    [
      "look-alike object (not BridgeLockBusyError) + LOOM_SERVICE=1",
      { name: "BridgeLockBusyError", holderPid: 4242, lockPath: "/x" },
      { LOOM_SERVICE: "1" },
      false,
    ],
    ["string thrown + LOOM_SERVICE=1", "boom", { LOOM_SERVICE: "1" }, false],
    ["undefined thrown + LOOM_SERVICE=1", undefined, { LOOM_SERVICE: "1" }, false],
  ];

  test("isServiceYield is exported from bridge-main.ts", () => {
    expect(typeof isServiceYield).toBe("function");
  });

  for (const [name, err, env, want] of rows) {
    test(name, () => {
      expect(typeof isServiceYield).toBe("function");
      expect((isServiceYield as IsServiceYield)(err, env)).toBe(want);
    });
  }
});

describe("D3 exit table invariants (R1 · R51-M2)", () => {
  test("bridge-main.ts has exactly three process.exit calls; bridge-runtime.ts zero", () => {
    const main = readFileSync(BRIDGE_MAIN, "utf8");
    const runtime = readFileSync(BRIDGE_RUNTIME, "utf8");
    expect(main.match(/process\.exit\(/g) ?? []).toHaveLength(3);
    expect(runtime.match(/process\.exit\b/g) ?? []).toHaveLength(0);
  });

  test("bridge-runtime.ts never reads LOOM_SERVICE (bridge-main.ts is the only reader)", () => {
    expect(readFileSync(BRIDGE_RUNTIME, "utf8")).not.toContain("LOOM_SERVICE");
  });
});

describe("LOOM_SERVICE lock-busy yield — real spawned bridges (PLAN 0.34.0 P2 · D3)", () => {
  const port = 32000 + Math.floor(Math.random() * 20000);
  const dir = mkdtempSync(join(tmpdir(), "loom-p2-yield-"));
  const cwd = realpathSync(dir);
  const sessionFile = join(dir, "session.json");
  const binDir = join(dir, "bin");
  const relay = new RelayServer({ host: "127.0.0.1", port });
  const live: Subprocess[] = [];
  let tower: RelayClient;
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
    delete env.LOOM_SERVICE;
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

  function spawnBridge(extraEnv: Record<string, string | undefined> = {}): Spawned {
    seq += 1;
    const stderrPath = join(dir, `spawn-${seq}.stderr.log`);
    const fd = openSync(stderrPath, "w", 0o600);
    const proc = spawn({
      cmd: [BUN, "run", BRIDGE_MAIN],
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

  async function waitRunning(b: Spawned): Promise<void> {
    const ok = await waitFor(() => {
      if (b.proc.exitCode !== null) return "exited";
      const s = readStatus();
      return s?.state === "running" &&
        s.pid === b.proc.pid &&
        existsSync(bridgeMetaPath(sessionFile))
        ? "running"
        : null;
    }, 15_000);
    if (ok !== "running") {
      throw new Error(
        `bridge did not reach running (exit=${b.proc.exitCode}, status=${JSON.stringify(readStatus())})\n${b.stderr()}`,
      );
    }
  }

  beforeAll(async () => {
    setEnv("LOOM_TEST_HOME", dir);
    setEnv("LOOM_SESSION", sessionFile);
    setEnv("LOOM_PROFILE", PROFILE);
    setEnv("LOOM_NO_AUTO_HOST", "1");
    setEnv("LOOM_RELAY_TOKEN", undefined);
    setEnv("LOOM_RELAY_URL", undefined);
    setEnv("LOOM_SERVICE", undefined);
    resetStateHomeDirCache();
    setActiveProfile(null);
    relay.start();
    tower = new RelayClient({ url: `ws://127.0.0.1:${port}/ws` });
    const created = await tower.createRoom({
      roomName: "p2-yield",
      displayName: "tower",
      agentKind: "shell",
      peerId: "p_tower",
    });
    if (created.type !== "room.state") throw new Error("create failed");
    const session: FableSession = {
      roomId: created.roomId,
      roomName: created.roomName ?? "p2-yield",
      inviteCode: created.inviteCode ?? "",
      peerId: "p_node",
      displayName: "node/svc-1",
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
    const config = JSON.stringify({
      authorizedDispatchers: ["p_tower"],
      herdrSocketPath: join(dir, "absent-herdr.sock"),
      worker: {
        backend: "headless",
        cwd,
        allowedRoots: [cwd],
        timeoutMs: 60_000,
        agentBin: { claude: wrapper },
      },
    });
    for (const p of [PROFILE, INCOMPLETE_PROFILE]) {
      mkdirSync(join(bridgeConfigPath(p), ".."), { recursive: true });
      writeFileSync(bridgeConfigPath(p), config, "utf8");
    }
  });

  afterAll(async () => {
    for (const p of live) killHard(p.pid);
    tower?.close();
    relay.stop();
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    resetStateHomeDirCache();
    rmSync(dir, { recursive: true, force: true });
  });

  test("live holder A: LOOM_SERVICE=1 → exit 0 + yield line, status untouched; without → exit 1 (D3 · R2 · R10)", async () => {
    const a = spawnBridge();
    await waitRunning(a);
    const holder = a.proc.pid;
    const lockPath = bridgeLockPath(PROFILE);
    const before = readStatus();
    expect(before?.pid).toBe(holder);
    expect(before?.state).toBe("running");

    // Service bridge B: yields to the live holder.
    const b = spawnBridge({ LOOM_SERVICE: "1" });
    expect(await exitWithin(b.proc, 15_000)).toBe(0);
    const yieldLine = `[loom-bridge] yield to bridge pid ${holder} (lock ${lockPath}) — service stays down until \`loom service start\``;
    const bLines = b
      .stderr()
      .split("\n")
      .filter((l) => l.trim().length > 0);
    expect(bLines).toEqual([yieldLine]);
    // R2: the status file is A's — never rewritten by the yielding process.
    const after = readStatus();
    expect(after?.pid).toBe(holder);
    expect(after?.state).toBe("running");
    expect(after?.startedAt).toBe(before?.startedAt);
    expect(after?.lastError).toBeUndefined();
    expect(existsSync(lockPath)).toBe(true);

    // 0.33.0 R10 unchanged without LOOM_SERVICE (and for any value other than exactly "1").
    for (const value of [undefined, "0", "true"]) {
      const c = spawnBridge({ LOOM_SERVICE: value });
      expect(await exitWithin(c.proc, 15_000)).toBe(1);
      const log = c.stderr();
      expect(log).toContain(`bridge already running for profile ${PROFILE} (pid ${holder}`);
      expect(log).not.toContain("yield to bridge pid");
      expect(readStatus()?.pid).toBe(holder);
      expect(readStatus()?.state).toBe("running");
    }

    a.proc.kill("SIGTERM");
    expect(await exitWithin(a.proc, 12_000)).toBe(0);
    expect(readStatus()?.state).toBe("stopped");
  }, 90_000);

  test("LOOM_SERVICE=1 + owner-less lock dir (holder unknown) → exit 1, no yield (D3)", async () => {
    const lockPath = bridgeLockPath(INCOMPLETE_PROFILE);
    mkdirSync(lockPath, { recursive: true, mode: 0o700 });
    // Keep the owner-less dir younger than the 5 s grace so it stays `incomplete`.
    let touching = true;
    const toucher = (async () => {
      while (touching) {
        const t = new Date();
        try {
          utimesSync(lockPath, t, t);
        } catch {
          /* removed */
        }
        await Bun.sleep(100);
      }
    })();
    try {
      const b = spawnBridge({ LOOM_SERVICE: "1", LOOM_PROFILE: INCOMPLETE_PROFILE });
      expect(await exitWithin(b.proc, 15_000)).toBe(1);
      const log = b.stderr();
      expect(log).toContain(
        `bridge already running for profile ${INCOMPLETE_PROFILE} (pid unknown`,
      );
      expect(log).not.toContain("yield to bridge pid");
      expect(readStatus(INCOMPLETE_PROFILE)?.state).not.toBe("running");
    } finally {
      touching = false;
      await toucher;
      rmSync(lockPath, { recursive: true, force: true });
    }
  }, 40_000);

  test("LOOM_SERVICE=1 + no session → exit 1, no yield (D3 — other startup failure)", async () => {
    const b = spawnBridge({ LOOM_SERVICE: "1", LOOM_SESSION: join(dir, "missing-session.json") });
    expect(await exitWithin(b.proc, 15_000)).toBe(1);
    const log = b.stderr();
    expect(log.trim().length).toBeGreaterThan(0);
    expect(log).not.toContain("yield to bridge pid");
  }, 40_000);
});
