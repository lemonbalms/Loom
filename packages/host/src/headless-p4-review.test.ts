/**
 * P4 review regressions: group reap on timeout, no positive-pid signal,
 * cwd re-check after the permit wait, spawn setup failures, case-insensitive
 * env scrub, 0700 card dirs, stdout fd close, missing allowedRoots, timeout
 * transcript/summary, and procStartedAt from ps lstart.
 */
import { describe, expect, test } from "bun:test";
import { spawn, execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultWorkerPermissions, type WorkerConfig } from "./agent-argv";
import { cardKeyHash, readCardSession } from "./card-session-store";
import { HeadlessDispatcher } from "./headless-worker";
import { killProcessGroup, spawnDetachedWorker } from "./process-group";

const FAKE = join(import.meta.dir, "fake-agent-cli.ts");
const LOCK = join(tmpdir(), "loom-v030-p2-fake.lock");

type SinkCall = {
  fields: {
    status?: string;
    reason?: string;
    output: string;
    truncated?: boolean;
    summary?: string;
    note?: string;
  };
};

function configFor(
  cwd: string,
  timeoutMs: number,
  limits: { claude?: number } = {},
): WorkerConfig {
  return {
    backend: "headless",
    cwd,
    allowedRoots: [cwd],
    maxConcurrent: { claude: limits.claude ?? 1, codex: 1, grok: 1 },
    timeoutMs,
    permissions: defaultWorkerPermissions(),
  };
}

function pushEnv(extra: Record<string, string | undefined>): () => void {
  const prev = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(extra)) {
    prev.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return () => {
    for (const [key, value] of prev) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
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

async function waitFor(pred: () => boolean, ms = 8_000): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > ms) throw new Error("waitFor timeout");
    await Bun.sleep(20);
  }
}

function alive(pid: number): boolean {
  if (!pid || pid <= 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killPid(pid: number | undefined): void {
  if (!pid || pid <= 1 || pid === process.pid) return;
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    /* not a group */
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    /* already dead */
  }
}

function groupPids(pgid: number): number[] {
  if (!pgid || pgid <= 1) return [];
  let out = "";
  try {
    out = execFileSync("/bin/ps", ["-ax", "-o", "pid=,pgid="], {
      encoding: "utf8",
      timeout: 2_000,
    });
  } catch {
    return [];
  }
  const pids: number[] = [];
  for (const line of out.split("\n")) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) continue;
    const pid = Number(parts[0]);
    const group = Number(parts[1]);
    if (group === pgid && pid > 1) pids.push(pid);
  }
  return pids;
}

function lstart(pid: number): string {
  const out = execFileSync("/bin/ps", ["-o", "lstart=", "-p", String(pid)], {
    encoding: "utf8",
    timeout: 2_000,
  });
  return out.trim();
}

function writeScript(dir: string, name: string, body: string): string {
  const path = join(dir, name);
  writeFileSync(path, body, { encoding: "utf8", mode: 0o600 });
  return path;
}

function commands(script: string): Record<"claude" | "codex" | "grok", { bin: string; args: string[] }> {
  const cmd = { bin: "bun", args: [script] };
  return { claude: cmd, codex: cmd, grok: cmd };
}

const RESULT_EVENT = JSON.stringify({
  type: "result",
  result: "done",
  session_id: "p4",
  usage: { input_tokens: 1, output_tokens: 1 },
});

describe("headless P4 review", () => {
  test(
    "H1 timeout SIGKILLs a grandchild that ignores SIGTERM and holds the permit until then",
    async () => {
      await withFakeLock(async () => {
        const loomDir = mkdtempSync(join(tmpdir(), "loom-p4-h1-"));
        const cwd = realpathSync(mkdtempSync(join(tmpdir(), "loom-p4-h1-cwd-")));
        const gpidFile = join(loomDir, "grandchild.pid");
        const wrapper = writeScript(
          loomDir,
          "term-trap.ts",
          `
            import { spawn } from "node:child_process";
            import { writeFileSync } from "node:fs";
            const outer = spawn(
              "/bin/sh",
              ["-c", "sh -c 'trap \\"\\" TERM HUP; sleep 300' >/dev/null 2>&1 & echo $!; wait"],
              { stdio: ["ignore", "pipe", "ignore"] },
            );
            const line = await new Promise((resolve, reject) => {
              let buf = "";
              const timer = setTimeout(() => reject(new Error("no grandchild")), 3_000);
              outer.stdout.on("data", (chunk) => {
                buf += chunk.toString();
                const text = buf.trim();
                if (!text) return;
                clearTimeout(timer);
                resolve(text.split(/\\s+/)[0]);
              });
            });
            if (process.env.P4_GRAND_PID) writeFileSync(process.env.P4_GRAND_PID, String(line));
            const fake = process.env.P4_FAKE;
            spawn(process.execPath, [fake, "--fake-kind", "claude", ...process.argv.slice(2)], {
              stdio: ["ignore", "inherit", "inherit"],
              env: process.env,
            });
            await new Promise(() => {});
          `,
        );
        const calls: SinkCall[] = [];
        const restore = pushEnv({
          P4_GRAND_PID: gpidFile,
          P4_FAKE: FAKE,
          FAKE_HANG: "1",
          FAKE_OUTPUT_BYTES: "8",
          FAKE_DURATION_MS: "0",
          FAKE_ARGV_DUMP: undefined,
          FAKE_EXIT_ONCE_MARKER: undefined,
          FAKE_SPAWN_GRANDCHILD: undefined,
          FAKE_DENIAL: undefined,
          FAKE_ENV_DUMP: undefined,
        });
        const card = {
          roomId: "room_h1",
          cardId: "task_h1",
          agent: "claude" as const,
          prompt: "hang",
          fromPeerId: "peer_h1",
          dispatchHandoffId: "hh1",
          cwd,
        };
        const dispatcher = new HeadlessDispatcher({
          config: configFor(cwd, 2_000),
          loomDir,
          node: "bridge-node",
          commands: commands(wrapper),
          sink: {
            async composeAndSend(_target, fields) {
              calls.push({ fields });
              return {
                branch: "accepted",
                relayAcceptedAt: "2026-10-15T00:00:03.000Z",
                status: "delivered",
                recipientCount: 1,
              };
            },
          },
        });
        const pending = dispatcher.dispatch(card);
        try {
          await waitFor(() => existsSync(gpidFile), 8_000);
          const grandchild = Number(readFileSync(gpidFile, "utf8").trim());
          await waitFor(() => {
            const saved = readCardSession({
              loomDir,
              roomId: card.roomId,
              agent: card.agent,
              cardId: card.cardId,
            });
            return Boolean(saved && saved.pid > 1 && !alive(saved.pid));
          }, 8_000);
          expect(alive(grandchild)).toBe(true);
          expect(dispatcher.status().running.claude).toBe(1);
          await pending;
          expect(calls).toHaveLength(1);
          expect(calls[0]!.fields.reason).toBe("timeout");
          expect(alive(grandchild)).toBe(false);
          const saved = readCardSession({
            loomDir,
            roomId: card.roomId,
            agent: card.agent,
            cardId: card.cardId,
          });
          expect(groupPids(saved?.pgid ?? 0)).toEqual([]);
          expect(dispatcher.status().running.claude).toBe(0);
          expect(dispatcher.flights()).toHaveLength(0);
        } finally {
          if (existsSync(gpidFile)) killPid(Number(readFileSync(gpidFile, "utf8").trim()));
          try {
            const saved = readCardSession({
              loomDir,
              roomId: card.roomId,
              agent: card.agent,
              cardId: card.cardId,
            });
            killPid(saved?.pgid);
            killPid(saved?.pid);
          } catch {
            /* */
          }
          try {
            await dispatcher.close();
          } catch {
            /* */
          }
          restore();
          rmSync(loomDir, { recursive: true, force: true });
          rmSync(cwd, { recursive: true, force: true });
        }
      });
    },
    { timeout: 25_000 },
  );

  test("H2 killProcessGroup does not fall back to a positive pid", async () => {
    const child = spawn("/bin/sleep", ["300"], { stdio: "ignore" });
    const pid = child.pid ?? 0;
    try {
      expect(pid).toBeGreaterThan(1);
      const pgid = Number(
        execFileSync("/bin/ps", ["-o", "pgid=", "-p", String(pid)], {
          encoding: "utf8",
          timeout: 2_000,
        }).trim(),
      );
      expect(pgid).not.toBe(pid);
      let probed = false;
      try {
        process.kill(-pid, 0);
        probed = true;
      } catch {
        probed = false;
      }
      expect(probed).toBe(false);
      killProcessGroup(pid, "SIGTERM");
      await Bun.sleep(200);
      expect(alive(pid)).toBe(true);
    } finally {
      killPid(pid);
    }
  });

  test(
    "H2 a normal exit disarms the timeout before result delivery",
    async () => {
      const loomDir = mkdtempSync(join(tmpdir(), "loom-p4-h2-"));
      const cwd = realpathSync(mkdtempSync(join(tmpdir(), "loom-p4-h2-cwd-")));
      const gpidFile = join(loomDir, "grandchild.pid");
      // Leader exits immediately. sleep stays in the same group and dies if a
      // timer still armed across result delivery signals that pgid.
      const script = writeScript(
        loomDir,
        "exit-fast.sh",
        `
sleep 300 >/dev/null 2>&1 &
echo $! > ${JSON.stringify(gpidFile)}
printf '%s\\n' ${JSON.stringify(RESULT_EVENT)}
`,
      );
      const sh = { bin: "/bin/sh", args: [script] };
      const calls: SinkCall[] = [];
      const dispatcher = new HeadlessDispatcher({
        config: configFor(cwd, 2_500),
        loomDir,
        node: "bridge-node",
        commands: { claude: sh, codex: sh, grok: sh },
        sink: {
          async composeAndSend(_target, fields) {
            await Bun.sleep(3_500);
            calls.push({ fields });
            return {
              branch: "accepted",
              relayAcceptedAt: "2026-10-15T00:00:03.000Z",
              status: "delivered",
              recipientCount: 1,
            };
          },
        },
      });
      try {
        await dispatcher.dispatch({
          roomId: "room_h2",
          cardId: "task_h2",
          agent: "claude",
          prompt: "finish",
          fromPeerId: "peer_h2",
          dispatchHandoffId: "hh2",
          cwd,
        });
        expect(calls).toHaveLength(1);
        expect(calls[0]!.fields.reason).toBe("needs_verification");
        const grandchild = Number(readFileSync(gpidFile, "utf8").trim());
        expect(grandchild).toBeGreaterThan(1);
        expect(alive(grandchild)).toBe(true);
        expect(dispatcher.flights()).toHaveLength(0);
      } finally {
        if (existsSync(gpidFile)) killPid(Number(readFileSync(gpidFile, "utf8").trim()));
        try {
          await dispatcher.close();
        } catch {
          /* */
        }
        rmSync(loomDir, { recursive: true, force: true });
        rmSync(cwd, { recursive: true, force: true });
      }
    },
    { timeout: 15_000 },
  );

  test(
    "H3 re-checks cwd realpath after the permit wait",
    async () => {
      const loomDir = mkdtempSync(join(tmpdir(), "loom-p4-h3-"));
      const root = realpathSync(mkdtempSync(join(tmpdir(), "loom-p4-h3-root-")));
      const outside = realpathSync(mkdtempSync(join(tmpdir(), "loom-p4-h3-out-")));
      const work = join(root, "work");
      mkdirSync(work);
      const marker = join(loomDir, "marker.txt");
      const script = writeScript(
        loomDir,
        "cwd-worker.ts",
        `
          import { appendFileSync, realpathSync, writeSync } from "node:fs";
          const card = process.env.LOOM_CARD ?? "";
          appendFileSync(process.env.P4_MARKER, card + "\\t" + realpathSync(process.cwd()) + "\\n");
          const hold = Number(process.env.P4_HOLD_MS ?? "0");
          if (hold > 0 && card === process.env.P4_HOLD_CARD) await Bun.sleep(hold);
          writeSync(1, ${JSON.stringify(RESULT_EVENT + "\n")});
        `,
      );
      const restore = pushEnv({
        P4_MARKER: marker,
        P4_HOLD_MS: "4000",
        P4_HOLD_CARD: "holder",
      });
      const calls: SinkCall[] = [];
      const dispatcher = new HeadlessDispatcher({
        config: configFor(root, 30_000),
        loomDir,
        node: "bridge-node",
        commands: commands(script),
        sink: {
          async composeAndSend(_target, fields) {
            calls.push({ fields });
            return {
              branch: "accepted",
              relayAcceptedAt: "2026-10-15T00:00:03.000Z",
              status: "delivered",
              recipientCount: 1,
            };
          },
        },
      });
      const holder = dispatcher.dispatch({
        roomId: "room_h3",
        cardId: "holder",
        agent: "claude",
        prompt: "hold",
        fromPeerId: "peer_h3",
        dispatchHandoffId: "hh3a",
        cwd: root,
      });
      try {
        await waitFor(() => existsSync(marker) && readFileSync(marker, "utf8").includes("holder"));
        const swapped = dispatcher.dispatch({
          roomId: "room_h3",
          cardId: "swap-target",
          agent: "claude",
          prompt: "swap",
          fromPeerId: "peer_h3",
          dispatchHandoffId: "hh3b",
          cwd: work,
        });
        await waitFor(() => dispatcher.status().queueDepth.claude === 1);
        rmSync(work, { recursive: true, force: true });
        symlinkSync(outside, work);
        await Promise.all([holder, swapped]);
        expect(readFileSync(marker, "utf8")).not.toContain("swap-target");
        expect(calls.some((call) => call.fields.reason === "cwd_not_allowed")).toBe(true);
        expect(calls.filter((call) => call.fields.reason === "cwd_not_allowed")).toHaveLength(1);
      } finally {
        try {
          await dispatcher.close();
        } catch {
          /* */
        }
        restore();
        rmSync(loomDir, { recursive: true, force: true });
        rmSync(root, { recursive: true, force: true });
        rmSync(outside, { recursive: true, force: true });
      }
    },
    { timeout: 20_000 },
  );

  test("H4 a post-spawn setup failure kills the group and delivers one result", async () => {
    const loomDir = mkdtempSync(join(tmpdir(), "loom-p4-h4-"));
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), "loom-p4-h4-cwd-")));
    const pidFile = join(loomDir, "worker.pid");
    const roomId = "room_h4";
    const cardId = "task_h4";
    const dir = join(loomDir, "cards", cardKeyHash(roomId, "claude", cardId));
    const transcript = join(dir, "transcript-1.jsonl");
    const script = writeScript(
      loomDir,
      "hang.ts",
      `
        import { writeFileSync } from "node:fs";
        writeFileSync(process.env.P4_PID_FILE, String(process.pid));
        await new Promise(() => {});
      `,
    );
    const restore = pushEnv({ P4_PID_FILE: pidFile });
    const calls: SinkCall[] = [];
    const dispatcher = new HeadlessDispatcher({
      config: configFor(cwd, 30_000),
      loomDir,
      node: "bridge-node",
      commands: commands(script),
      sink: {
        async composeAndSend(_target, fields) {
          calls.push({ fields });
          return {
            branch: "accepted",
            relayAcceptedAt: "2026-10-15T00:00:03.000Z",
            status: "delivered",
            recipientCount: 1,
          };
        },
      },
    });
    try {
      const pending = dispatcher.dispatch({
        roomId,
        cardId,
        agent: "claude",
        prompt: "setup",
        fromPeerId: "peer_h4",
        dispatchHandoffId: "hh4",
        cwd,
      });
      let locked = false;
      for (let i = 0; i < 50; i++) {
        if (existsSync(transcript)) {
          chmodSync(dir, 0o555);
          locked = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      expect(locked).toBe(true);
      await pending;
      expect(calls).toHaveLength(1);
      expect(calls[0]!.fields.status).toBe("failed");
      expect(calls[0]!.fields.reason).toBe("spawn_setup_failed");
      expect(dispatcher.flights()).toHaveLength(0);
      expect(dispatcher.status().running.claude).toBe(0);
      const listed = execFileSync("/bin/ps", ["-ax", "-o", "pid=,command="], {
        encoding: "utf8",
      });
      expect(listed.includes("hang.ts")).toBe(false);
      if (existsSync(pidFile)) {
        expect(alive(Number(readFileSync(pidFile, "utf8").trim()))).toBe(false);
      }
    } finally {
      try {
        chmodSync(dir, 0o700);
      } catch {
        /* dir was never created */
      }
      if (existsSync(pidFile)) killPid(Number(readFileSync(pidFile, "utf8").trim()));
      try {
        const listed = execFileSync("/bin/ps", ["-ax", "-o", "pid=,command="], {
          encoding: "utf8",
        });
        for (const line of listed.split("\n")) {
          if (!line.includes(script)) continue;
          killPid(Number(line.trim().split(/\s+/)[0]));
        }
      } catch {
        /* */
      }
      try {
        await dispatcher.close();
      } catch {
        /* */
      }
      restore();
      rmSync(loomDir, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("H4 a pre-spawn fs failure delivers a failed result", async () => {
    const loomDir = mkdtempSync(join(tmpdir(), "loom-p4-h4b-"));
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), "loom-p4-h4b-cwd-")));
    writeFileSync(join(loomDir, "cards"), "not-a-directory");
    const marker = join(loomDir, "spawned");
    const script = writeScript(
      loomDir,
      "should-not-run.ts",
      `
        import { writeFileSync } from "node:fs";
        writeFileSync(process.env.P4_MARKER, "spawned");
      `,
    );
    const restore = pushEnv({ P4_MARKER: marker });
    const calls: SinkCall[] = [];
    const dispatcher = new HeadlessDispatcher({
      config: configFor(cwd, 30_000),
      loomDir,
      node: "bridge-node",
      commands: commands(script),
      sink: {
        async composeAndSend(_target, fields) {
          calls.push({ fields });
          return {
            branch: "accepted",
            relayAcceptedAt: "2026-10-15T00:00:03.000Z",
            status: "delivered",
            recipientCount: 1,
          };
        },
      },
    });
    try {
      await dispatcher.dispatch({
        roomId: "room_h4b",
        cardId: "task_h4b",
        agent: "claude",
        prompt: "fs",
        fromPeerId: "peer_h4b",
        dispatchHandoffId: "hh4b",
        cwd,
      });
      expect(calls).toHaveLength(1);
      expect(calls[0]!.fields.status).toBe("failed");
      expect(calls[0]!.fields.reason).toBe("spawn_setup_failed");
      expect(existsSync(marker)).toBe(false);
      expect(dispatcher.flights()).toHaveLength(0);
      expect(dispatcher.status().running.claude).toBe(0);
    } finally {
      try {
        await dispatcher.close();
      } catch {
        /* */
      }
      restore();
      rmSync(loomDir, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test(
    "H5 env scrub drops mixed-case LOOM_ and FABLE_ keys",
    async () => {
      await withFakeLock(async () => {
        const loomDir = mkdtempSync(join(tmpdir(), "loom-p4-h5-"));
        const cwd = realpathSync(mkdtempSync(join(tmpdir(), "loom-p4-h5-cwd-")));
        const envFile = join(loomDir, "env.json");
        const restore = pushEnv({
          loom_relay_token: "leak-lower",
          Loom_Mixed: "leak-mixed",
          fable_secret: "leak-fable",
          FABLE_SECRET: "leak-upper",
          LOOM_CARD: "replaced",
          FAKE_ENV_DUMP: envFile,
          FAKE_OUTPUT_BYTES: "8",
          FAKE_DURATION_MS: "0",
          FAKE_HANG: undefined,
          FAKE_EXIT_ONCE_MARKER: undefined,
          FAKE_SPAWN_GRANDCHILD: undefined,
          FAKE_DENIAL: undefined,
          FAKE_ARGV_DUMP: undefined,
        });
        const cardId = "task_h5";
        const dispatcher = new HeadlessDispatcher({
          config: configFor(cwd, 30_000),
          loomDir,
          node: "bridge-node",
          commands: commands(FAKE),
          sink: {
            async composeAndSend() {
              return {
                branch: "accepted",
                relayAcceptedAt: "2026-10-15T00:00:03.000Z",
                status: "delivered",
                recipientCount: 1,
              };
            },
          },
        });
        try {
          await dispatcher.dispatch({
            roomId: "room_h5",
            cardId,
            agent: "claude",
            prompt: "env",
            fromPeerId: "peer_h5",
            dispatchHandoffId: "hh5",
            cwd,
          });
          const env = JSON.parse(readFileSync(envFile, "utf8")) as Record<string, string>;
          const loomish = Object.keys(env).filter((key) => key.toUpperCase().startsWith("LOOM_"));
          const fableish = Object.keys(env).filter((key) => key.toUpperCase().startsWith("FABLE_"));
          expect(loomish).toEqual(["LOOM_CARD"]);
          expect(fableish).toEqual([]);
          expect(env.LOOM_CARD).toBe(cardId);
          expect(env.loom_relay_token).toBeUndefined();
          expect(env.Loom_Mixed).toBeUndefined();
          expect(env.fable_secret).toBeUndefined();
        } finally {
          try {
            await dispatcher.close();
          } catch {
            /* */
          }
          restore();
          rmSync(loomDir, { recursive: true, force: true });
          rmSync(cwd, { recursive: true, force: true });
        }
      });
    },
    { timeout: 20_000 },
  );

  test("M1 card directory is mode 0700 even when it already exists", async () => {
    const loomDir = mkdtempSync(join(tmpdir(), "loom-p4-m1-"));
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), "loom-p4-m1-cwd-")));
    const roomId = "room_m1";
    const cardId = "task_m1";
    const dir = join(loomDir, "cards", cardKeyHash(roomId, "claude", cardId));
    mkdirSync(dir, { recursive: true, mode: 0o755 });
    chmodSync(dir, 0o755);
    const script = writeScript(
      loomDir,
      "ok.ts",
      `
        import { writeSync } from "node:fs";
        writeSync(1, ${JSON.stringify(RESULT_EVENT + "\n")});
      `,
    );
    const dispatcher = new HeadlessDispatcher({
      config: configFor(cwd, 30_000),
      loomDir,
      node: "bridge-node",
      commands: commands(script),
      sink: {
        async composeAndSend() {
          return {
            branch: "accepted",
            relayAcceptedAt: "2026-10-15T00:00:03.000Z",
            status: "delivered",
            recipientCount: 1,
          };
        },
      },
    });
    try {
      await dispatcher.dispatch({
        roomId,
        cardId,
        agent: "claude",
        prompt: "mode",
        fromPeerId: "peer_m1",
        dispatchHandoffId: "hm1",
        cwd,
      });
      expect(statSync(dir).mode & 0o777).toBe(0o700);
    } finally {
      try {
        await dispatcher.close();
      } catch {
        /* */
      }
      rmSync(loomDir, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("M2 a stderr open failure closes the stdout fd", () => {
    const dir = mkdtempSync(join(tmpdir(), "loom-p4-m2-"));
    const stdoutPath = join(dir, "out.txt");
    const blocker = join(dir, "not-a-dir");
    writeFileSync(blocker, "x");
    const stderrPath = join(blocker, "err.txt");
    const fdsFor = (path: string): number => {
      if (!existsSync(path)) return 0;
      const want = realpathSync(path);
      let n = 0;
      for (const fd of readdirSync("/dev/fd")) {
        try {
          const link = readlinkSync(join("/dev/fd", fd));
          const got = existsSync(link) ? realpathSync(link) : link;
          if (got === want) n += 1;
        } catch {
          /* fd vanished while listing */
        }
      }
      return n;
    };
    const before = fdsFor(stdoutPath);
    try {
      expect(() =>
        spawnDetachedWorker({
          bin: "/bin/sleep",
          args: ["300"],
          cwd: dir,
          env: process.env,
          stdoutPath,
          stderrPath,
        }),
      ).toThrow();
      expect(fdsFor(stdoutPath)).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("M3 missing allowedRoots is cwd_not_allowed and does not throw", async () => {
    const loomDir = mkdtempSync(join(tmpdir(), "loom-p4-m3-"));
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), "loom-p4-m3-cwd-")));
    const marker = join(loomDir, "spawned");
    const script = writeScript(
      loomDir,
      "nope.ts",
      `
        import { writeFileSync } from "node:fs";
        writeFileSync(process.env.P4_MARKER, "spawned");
      `,
    );
    const restore = pushEnv({ P4_MARKER: marker });
    const calls: SinkCall[] = [];
    const config = configFor(cwd, 30_000);
    (config as { allowedRoots?: string[] }).allowedRoots = undefined;
    const dispatcher = new HeadlessDispatcher({
      config,
      loomDir,
      node: "bridge-node",
      commands: commands(script),
      sink: {
        async composeAndSend(_target, fields) {
          calls.push({ fields });
          return {
            branch: "accepted",
            relayAcceptedAt: "2026-10-15T00:00:03.000Z",
            status: "delivered",
            recipientCount: 1,
          };
        },
      },
    });
    try {
      await dispatcher.dispatch({
        roomId: "room_m3",
        cardId: "task_m3",
        agent: "claude",
        prompt: "roots",
        fromPeerId: "peer_m3",
        dispatchHandoffId: "hm3",
        cwd,
      });
      expect(calls).toHaveLength(1);
      expect(calls[0]!.fields.status).toBe("failed");
      expect(calls[0]!.fields.reason).toBe("cwd_not_allowed");
      expect(existsSync(marker)).toBe(false);
    } finally {
      try {
        await dispatcher.close();
      } catch {
        /* */
      }
      restore();
      rmSync(loomDir, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test(
    "M4 timeout keeps the transcript remainder and summarizes before truncation",
    async () => {
      const loomDir = mkdtempSync(join(tmpdir(), "loom-p4-m4-"));
      const cwd = realpathSync(mkdtempSync(join(tmpdir(), "loom-p4-m4-cwd-")));
      const script = writeScript(
        loomDir,
        "partial.ts",
        `
          import { writeSync } from "node:fs";
          const head = "S".repeat(1000) + "\\n";
          const event =
            JSON.stringify({
              type: "assistant",
              message: {
                role: "assistant",
                content: [{ type: "text", text: "PARSED_ONLY" }],
              },
            }) + "\\n";
          const body = "Z".repeat(250_000);
          writeSync(1, head + event + body + "REMAINDER_NOT_PARSED\\nTAIL_MARKER\\n");
          await new Promise(() => {});
        `,
      );
      const calls: SinkCall[] = [];
      const dispatcher = new HeadlessDispatcher({
        config: configFor(cwd, 2_000),
        loomDir,
        node: "bridge-node",
        commands: commands(script),
        sink: {
          async composeAndSend(_target, fields) {
            calls.push({ fields });
            return {
              branch: "accepted",
              relayAcceptedAt: "2026-10-15T00:00:03.000Z",
              status: "delivered",
              recipientCount: 1,
            };
          },
        },
      });
      try {
        await dispatcher.dispatch({
          roomId: "room_m4",
          cardId: "task_m4",
          agent: "claude",
          prompt: "partial",
          fromPeerId: "peer_m4",
          dispatchHandoffId: "hm4",
          cwd,
        });
        expect(calls).toHaveLength(1);
        expect(calls[0]!.fields.reason).toBe("timeout");
        expect(calls[0]!.fields.summary).toBe("S".repeat(900));
        expect(calls[0]!.fields.output).toContain("REMAINDER_NOT_PARSED");
        expect(calls[0]!.fields.output).toContain("TAIL_MARKER");
        expect(calls[0]!.fields.output.includes("S".repeat(1000))).toBe(false);
        expect(calls[0]!.fields.truncated).toBe(true);
      } finally {
        try {
          const saved = readCardSession({
            loomDir,
            roomId: "room_m4",
            agent: "claude",
            cardId: "task_m4",
          });
          killPid(saved?.pgid);
          killPid(saved?.pid);
        } catch {
          /* */
        }
        try {
          await dispatcher.close();
        } catch {
          /* */
        }
        rmSync(loomDir, { recursive: true, force: true });
        rmSync(cwd, { recursive: true, force: true });
      }
    },
    { timeout: 20_000 },
  );

  test("M5 procStartedAt is the spawned pid's ps lstart", async () => {
    const loomDir = mkdtempSync(join(tmpdir(), "loom-p4-m5-"));
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), "loom-p4-m5-cwd-")));
    const release = join(loomDir, "release");
    const script = writeScript(
      loomDir,
      "stay.ts",
      `
        import { existsSync, writeSync } from "node:fs";
        const release = process.env.P4_RELEASE;
        while (!release || !existsSync(release)) await Bun.sleep(30);
        writeSync(1, ${JSON.stringify(RESULT_EVENT + "\n")});
      `,
    );
    const restore = pushEnv({ P4_RELEASE: release });
    const card = {
      roomId: "room_m5",
      cardId: "task_m5",
      agent: "claude" as const,
      prompt: "stay",
      fromPeerId: "peer_m5",
      dispatchHandoffId: "hm5",
      cwd,
    };
    const dispatcher = new HeadlessDispatcher({
      config: configFor(cwd, 30_000),
      loomDir,
      node: "bridge-node",
      commands: commands(script),
      sink: {
        async composeAndSend() {
          return {
            branch: "accepted",
            relayAcceptedAt: "2026-10-15T00:00:03.000Z",
            status: "delivered",
            recipientCount: 1,
          };
        },
      },
    });
    const pending = dispatcher.dispatch(card);
    try {
      await waitFor(() => {
        const saved = readCardSession({
          loomDir,
          roomId: card.roomId,
          agent: card.agent,
          cardId: card.cardId,
        });
        return Boolean(saved && saved.pid > 1 && saved.procStartedAt.length > 0);
      });
      const saved = readCardSession({
        loomDir,
        roomId: card.roomId,
        agent: card.agent,
        cardId: card.cardId,
      })!;
      const observed = lstart(saved.pid);
      expect(observed.length).toBeGreaterThan(0);
      expect(saved.procStartedAt).toBe(observed);
      expect(saved.procStartedAt).not.toBe(saved.startedAt);
      writeFileSync(release, "go");
      await pending;
    } finally {
      try {
        const saved = readCardSession({
          loomDir,
          roomId: card.roomId,
          agent: card.agent,
          cardId: card.cardId,
        });
        killPid(saved?.pgid);
        killPid(saved?.pid);
      } catch {
        /* */
      }
      if (!existsSync(release)) writeFileSync(release, "go");
      try {
        await dispatcher.close();
      } catch {
        /* */
      }
      restore();
      rmSync(loomDir, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
