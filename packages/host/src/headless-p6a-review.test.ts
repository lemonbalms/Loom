/**
 * P6a review: agentBin is a single basename-checked path, and a live adopted
 * worker must not block bridge startup.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { execFileSync, spawn } from "node:child_process";
import {
  closeSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { CARD_RESULT_LABEL } from "@loom/protocol";
import { RelayServer } from "@loom/relay";
import {
  ARGV_TEMPLATE_VERSION,
  HEADLESS_WORKER_HINT,
  defaultWorkerPermissions,
  promptFingerprint,
} from "./agent-argv";
import {
  bridgeConfigDir,
  bridgeConfigPath,
  headlessAgentCommands,
  loadBridgeConfig,
  type BridgeConfig,
  workerConfigFromBridge,
} from "./bridge-config";
import { startBridgeRuntime } from "./bridge-runtime";
import { cardSessionPath, writeCardSession } from "./card-session-store";
import { startFakeHerdr } from "./fake-herdr";
import { HerdrClient } from "./herdr-client";
import { RelayClient } from "./relay-client";
import {
  type FableSession,
  loomDir,
  resetStateHomeDirCache,
  setActiveProfile,
} from "./session-store";

const FAKE = join(import.meta.dir, "fake-agent-cli.ts");
const LOCK = join(tmpdir(), "loom-v030-p2-fake.lock");
const LIVE_MS = 5_000;

type BinCase = {
  id: string;
  agentBin: unknown;
  message: RegExp;
};

const BIN_CASES: BinCase[] = [
  {
    id: "claude-skip",
    agentBin: { claude: ["claude", "--dangerously-skip-permissions"] },
    message: /worker\.agentBin\.claude must be a single executable path/,
  },
  {
    id: "codex-danger",
    agentBin: { codex: ["codex", "--dangerously-bypass-approvals-and-sandbox"] },
    message: /worker\.agentBin\.codex must be a single executable path/,
  },
  {
    id: "grok-approve",
    agentBin: { grok: ["grok", "--always-approve"] },
    message: /worker\.agentBin\.grok must be a single executable path/,
  },
  {
    id: "shell-array",
    agentBin: { claude: ["/bin/sh", "-c", "cat"] },
    message: /worker\.agentBin\.claude must be a single executable path/,
  },
  {
    id: "string-args",
    agentBin: { claude: "claude --dangerously-skip-permissions" },
    message: /worker\.agentBin\.claude basename must be claude/,
  },
  {
    id: "shell-string",
    agentBin: { claude: "/bin/sh" },
    message: /worker\.agentBin\.claude basename must be claude/,
  },
  {
    id: "other-name",
    agentBin: { grok: "python3" },
    message: /worker\.agentBin\.grok basename must be grok/,
  },
  {
    id: "dangerous-dir",
    agentBin: { claude: "dangerously-skip-permissions/claude" },
    message: /rejected dangerous mode/,
  },
];

function fakeSession(over: Partial<FableSession> = {}): FableSession {
  return {
    roomId: "room_p6a",
    roomName: "p6a",
    inviteCode: "LOOM-TEST",
    peerId: "p_node",
    displayName: "node/wsl-1",
    color: "#0f0",
    agentKind: "shell",
    relayUrl: "ws://127.0.0.1:1/ws",
    updatedAt: new Date().toISOString(),
    ...over,
  };
}

function runtimeConfig(dir: string, cwd: string, agentBin: unknown): BridgeConfig {
  return {
    authorizedDispatchers: ["p_tower"],
    herdrSocketPath: join(dir, "missing.sock"),
    agentArgv: { claude: ["claude"] },
    herdrProtocol: 17,
    worker: {
      backend: "headless",
      cwd,
      allowedRoots: [cwd],
      permissions: defaultWorkerPermissions(),
      agentBin: agentBin as never,
    },
  };
}

function killPid(pid: number | undefined): void {
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

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function withFakeLock<T>(fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  for (;;) {
    try {
      mkdirSync(LOCK);
      break;
    } catch {
      try {
        if (Date.now() - statSync(LOCK).mtimeMs > 60_000) {
          rmSync(LOCK, { recursive: true, force: true });
          continue;
        }
      } catch {
        /* raced with the holder */
      }
      if (Date.now() - start > 90_000) throw new Error("fake env lock timeout");
      await Bun.sleep(25);
    }
  }
  try {
    return await fn();
  } finally {
    rmSync(LOCK, { recursive: true, force: true });
  }
}

describe("P6a agentBin rejects dangerous binaries", () => {
  const dir = mkdtempSync(join(tmpdir(), "loom-p6a-bin-"));
  const cwd = dir;

  beforeAll(() => {
    process.env.LOOM_TEST_HOME = dir;
    resetStateHomeDirCache();
    setActiveProfile(null);
    mkdirSync(bridgeConfigDir(), { recursive: true });
  });

  afterAll(() => {
    delete process.env.LOOM_TEST_HOME;
    resetStateHomeDirCache();
    rmSync(dir, { recursive: true, force: true });
  });

  for (const spec of BIN_CASES) {
    test(`${spec.id} rejected at load and start`, async () => {
      writeFileSync(
        bridgeConfigPath(spec.id),
        JSON.stringify({
          worker: {
            backend: "headless",
            cwd,
            allowedRoots: [cwd],
            agentBin: spec.agentBin,
          },
        }),
        "utf8",
      );
      expect(() => loadBridgeConfig(spec.id)).toThrow(spec.message);
      await expect(
        startBridgeRuntime({
          session: fakeSession(),
          profile: spec.id,
          config: runtimeConfig(dir, cwd, spec.agentBin),
        }),
      ).rejects.toThrow(spec.message);
    });
  }

  test("absolute path whose basename is the agent is kept", () => {
    const bin = join(cwd, "claude");
    writeFileSync(
      bridgeConfigPath("ok-path"),
      JSON.stringify({
        worker: {
          backend: "headless",
          cwd,
          allowedRoots: [cwd],
          agentBin: { claude: bin },
        },
      }),
      "utf8",
    );
    const cfg = loadBridgeConfig("ok-path");
    expect(headlessAgentCommands(cfg).claude).toEqual({ bin, args: [] });
    expect(headlessAgentCommands(cfg).codex).toEqual({ bin: "codex", args: [] });
  });

  test("code override with a dangerous flag is rejected at start", async () => {
    const cfg = runtimeConfig(dir, cwd, undefined);
    delete cfg.worker?.agentBin;
    await expect(
      startBridgeRuntime({
        session: fakeSession(),
        profile: "override-danger",
        config: cfg,
        headlessAgentCommandOverride: {
          claude: ["claude", "--dangerously-skip-permissions"],
          codex: ["codex", "--dangerously-bypass-approvals-and-sandbox"],
          grok: ["grok", "--always-approve"],
        },
      }),
    ).rejects.toThrow(/rejected dangerous mode/);
  });
});

describe("P6a live adopt does not block startup", () => {
  const port = 36000 + Math.floor(Math.random() * 20000);
  const dir = mkdtempSync(join(tmpdir(), "loom-p6a-live-"));
  const cwd = realpathSync(dir);
  const sessionFile = join(dir, "session.json");
  const herdrSock = join(dir, "h.sock");
  const relay = new RelayServer({ host: "127.0.0.1", port });
  let fake: Awaited<ReturnType<typeof startFakeHerdr>>;
  let bridge: Awaited<ReturnType<typeof startBridgeRuntime>> | null = null;
  let tower: RelayClient | null = null;
  let workerPid = 0;

  beforeAll(() => {
    process.env.LOOM_TEST_HOME = dir;
    process.env.LOOM_SESSION = sessionFile;
    process.env.LOOM_NO_AUTO_HOST = "1";
    resetStateHomeDirCache();
    setActiveProfile(null);
  });

  afterAll(async () => {
    killPid(workerPid);
    if (bridge) await bridge.stop();
    tower?.close();
    if (fake) await fake.close();
    relay.stop();
    delete process.env.LOOM_TEST_HOME;
    delete process.env.LOOM_SESSION;
    delete process.env.LOOM_NO_AUTO_HOST;
    resetStateHomeDirCache();
    rmSync(dir, { recursive: true, force: true });
  });

  test(
    "seeded sleeper: start <2s, status while it runs, one later result",
    async () => {
      await withFakeLock(async () => {
        relay.start();
        fake = await startFakeHerdr({
          socketPath: herdrSock,
          autoStatus: "none",
        });
        tower = new RelayClient({ url: `ws://127.0.0.1:${port}/ws` });
        const created = await tower.createRoom({
          roomName: "p6a-live",
          displayName: "tower",
          agentKind: "shell",
          peerId: "p_tower",
        });
        if (created.type !== "room.state") throw new Error("create failed");
        const session: FableSession = {
          roomId: created.roomId,
          roomName: created.roomName ?? "p6a-live",
          inviteCode: created.inviteCode ?? "",
          peerId: "p_node",
          displayName: "node/wsl-1",
          color: "#0f0",
          agentKind: "shell",
          relayUrl: `ws://127.0.0.1:${port}/ws`,
          updatedAt: new Date().toISOString(),
        };
        writeFileSync(sessionFile, JSON.stringify(session), "utf8");
        const cardId = "task_p6a0live0000001";
        const cfg: BridgeConfig = {
          authorizedDispatchers: ["p_tower"],
          herdrSocketPath: herdrSock,
          agentArgv: { claude: ["claude"] },
          herdrProtocol: 17,
          worker: {
            backend: "headless",
            cwd,
            allowedRoots: [cwd],
            timeoutMs: 30_000,
            permissions: defaultWorkerPermissions(),
          },
        };
        const parsed = workerConfigFromBridge(cfg);
        const recordPath = cardSessionPath({
          loomDir: loomDir(),
          localPeerId: session.peerId,
          roomId: session.roomId,
          agent: "claude",
          cardId,
        });
        mkdirSync(dirname(recordPath), { recursive: true });
        const transcript = join(dirname(recordPath), "transcript-1.jsonl");
        const fd = openSync(transcript, "w", 0o600);
        const childEnv = { ...process.env };
        delete childEnv.FAKE_HANG;
        delete childEnv.FAKE_DENIAL;
        delete childEnv.FAKE_EXIT_ONCE_MARKER;
        delete childEnv.FAKE_SPAWN_GRANDCHILD;
        delete childEnv.FAKE_KIND;
        childEnv.FAKE_DURATION_MS = String(LIVE_MS);
        childEnv.FAKE_TIME_SCALE = "1";
        childEnv.FAKE_OUTPUT_BYTES = "8";
        const child = spawn(
          process.execPath,
          [FAKE, "--fake-kind", "claude", "--session-id", "live-session"],
          { cwd, detached: true, env: childEnv, stdio: ["ignore", fd, "ignore"] },
        );
        child.unref();
        closeSync(fd);
        workerPid = child.pid ?? 0;
        if (workerPid <= 1) throw new Error("sleeper did not start");
        const procStartedAt = execFileSync("/bin/ps", ["-o", "lstart=", "-p", String(workerPid)], {
          encoding: "utf8",
          env: { ...process.env, LC_ALL: "C", LANG: "C", TZ: "UTC" },
        }).trim();
        writeCardSession(
          { loomDir: loomDir(), localPeerId: session.peerId },
          {
            agent: "claude",
            cwd,
            requestedCwd: null,
            sessionId: "live-session",
            promptFingerprint: promptFingerprint(
              HEADLESS_WORKER_HINT,
              parsed.permissions,
              ARGV_TEMPLATE_VERSION,
            ),
            attempts: 1,
            pid: workerPid,
            pgid: workerPid,
            startedAt: new Date().toISOString(),
            state: "running",
            resultSent: false,
            roomId: session.roomId,
            cardId,
            fromPeerId: "p_tower",
            dispatchHandoffId: "handoff-live-1",
            procStartedAt,
            sendAttempts: 0,
            completedHandoffIds: [],
          },
        );

        const t0 = Date.now();
        bridge = await startBridgeRuntime({
          session,
          profile: "node",
          config: cfg,
          herdr: new HerdrClient({ socketPath: herdrSock }),
          submitVerify: { waitMs: 50, retries: 0 },
          headlessAgentCommandOverride: {
            claude: [process.execPath, FAKE, "--fake-kind", "claude"],
            codex: [process.execPath, FAKE, "--fake-kind", "codex"],
            grok: [process.execPath, FAKE, "--fake-kind", "grok"],
          },
        });
        const elapsed = Date.now() - t0;
        expect(elapsed).toBeLessThan(2_000);
        expect(alive(workerPid)).toBe(true);

        const meta = bridge.meta;
        const res = await fetch(`http://127.0.0.1:${meta.port}/rpc`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${meta.token}`,
          },
          body: JSON.stringify({ op: "status" }),
        });
        expect(res.ok).toBe(true);
        const body = (await res.json()) as {
          ok?: boolean;
          headless?: { running?: { claude?: number } };
        };
        expect(body.ok).toBe(true);
        expect(body.headless?.running?.claude).toBe(1);
        expect(alive(workerPid)).toBe(true);

        async function results(): Promise<Array<{ output?: string; reason?: string }>> {
          const found: Array<{ output?: string; reason?: string }> = [];
          const inbox = await tower!.listInbox();
          for (const entry of inbox) {
            for (const attachment of entry.handoff.attachments ?? []) {
              if (attachment.label !== CARD_RESULT_LABEL) continue;
              const result = JSON.parse(attachment.content) as {
                cardId?: string;
                output?: string;
                reason?: string;
              };
              if (result.cardId === cardId) found.push(result);
            }
          }
          return found;
        }

        let got: Array<{ output?: string; reason?: string }> = [];
        for (let i = 0; i < 80; i++) {
          got = await results();
          if (got.length > 0) break;
          await Bun.sleep(100);
        }
        expect(got).toHaveLength(1);
        expect(got[0]?.reason).toBe("needs_verification");
        expect(got[0]?.output).toContain("PARTIAL_READY");
        expect(got[0]?.output).toContain("xxxxxxxx");
        expect(alive(workerPid)).toBe(false);
        await Bun.sleep(400);
        expect(await results()).toHaveLength(1);
      });
    },
    20_000,
  );
});
