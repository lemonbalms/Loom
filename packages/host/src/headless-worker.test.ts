/**
 * assumed API (v0.30.0 P2 — modules are not implemented; this file is expected-red)
 *
 * from "./agent-argv":
 *   HEADLESS_WORKER_HINT, ARGV_TEMPLATE_VERSION = "0.30.0-v1",
 *   RESUME_CONTINUATION_MESSAGE =
 *     "Interrupted. Inspect the working tree before continuing; do not redo completed steps."
 *   defaultWorkerPermissions(), promptFingerprint(hint, permissions, version)
 *   WorkerConfig { backend, cwd, allowedRoots, maxConcurrent, timeoutMs, permissions }
 *
 * from "./card-session-store":
 *   readCardSession / writeCardSession / cardSessionPath
 *   CardSessionRecord fields: agent, cwd, sessionId, promptFingerprint, attempts,
 *   pid, pgid, startedAt, state, resultSent, roomId, cardId, fromPeerId,
 *   dispatchHandoffId, procStartedAt. cardKey = sha16(room \0 agent \0 cardId).
 *
 * from "./headless-worker":
 *   class HeadlessDispatcher
 *     constructor({ config, loomDir, node, commands, sink })
 *     dispatch(card): Promise<void>   // resolves after this dispatch's sink call
 *     status(): { running, queueDepth }  // counts only, no card ids
 *     close(): Promise<void>          // does not kill workers
 *     flights(): HeadlessFlight[]
 *   commands[agent] = { bin, args } prepended to buildAgentArgv().argv
 *   sink.composeAndSend(target, fields, { node })
 *   Happy path fields: status "failed", reason "needs_verification",
 *     truncated false under 200_000 chars.
 *   Spawn env = inherited minus LOOM_* minus FABLE_* plus LOOM_CARD=<cardId>.
 *   Timeout reason "timeout" (queue wait excluded). Group kill includes
 *   grandchildren. cwd realpath outside allowedRoots -> spawn 0,
 *   reason "cwd_not_allowed". Same card + other dispatchHandoffId while
 *   alive -> spawn 0, reason "card_already_running".
 *   Fake final text is PARTIAL_READY / session:<id> / resume:<id|-> / body.
 */
import { describe, expect, spyOn, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ARGV_TEMPLATE_VERSION,
  HEADLESS_WORKER_HINT,
  RESUME_CONTINUATION_MESSAGE,
  defaultWorkerPermissions,
  promptFingerprint,
  type WorkerConfig,
} from "./agent-argv";
import { readCardSession, writeCardSession, type CardSessionRecord } from "./card-session-store";
import { HeadlessDispatcher } from "./headless-worker";

const FAKE = join(import.meta.dir, "fake-agent-cli.ts");
const LOCK = join(tmpdir(), "loom-v030-p2-fake.lock");

type SinkCall = {
  target: { paneId?: string; dispatchHandoffId: string; cardId: string };
  fields: {
    status?: string;
    reason?: string;
    output: string;
    truncated?: boolean;
    note?: string;
  };
};

function spawnCount(dump: string): number {
  if (!existsSync(dump)) return 0;
  return readFileSync(dump, "utf8")
    .split("\n")
    .filter((line) => line.trim()).length;
}

function dumpLines(dump: string): { argv: string[]; sessionId: string; pid?: number }[] {
  if (!existsSync(dump)) return [];
  return readFileSync(dump, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as { argv: string[]; sessionId: string; pid?: number });
}

function killRecorded(pid: number | null | undefined): void {
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

async function waitFor(pred: () => boolean, ms = 5_000): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > ms) throw new Error("waitFor timeout");
    await Bun.sleep(20);
  }
}

async function grokStderrGiveUp(stderrBody: string): Promise<SinkCall[]> {
  return withFakeLock(async () => {
    const loomDir = mkdtempSync(join(tmpdir(), "loom-p2-stderr-"));
    const cwd = realpathSync(mkdtempSync(join(tmpdir(), "loom-p2-stderr-cwd-")));
    const dump = join(loomDir, "argv.jsonl");
    const calls: SinkCall[] = [];
    const restore = pushEnv({
      LOOM_DIR: loomDir,
      FAKE_OUTPUT_BYTES: "8",
      FAKE_DURATION_MS: "0",
      FAKE_TIME_SCALE: "1",
      FAKE_ARGV_DUMP: dump,
      FAKE_STDERR_EXIT: stderrBody,
      FAKE_HANG: undefined,
      FAKE_EXIT_ONCE_MARKER: undefined,
      FAKE_DENIAL: undefined,
      FAKE_SPAWN_GRANDCHILD: undefined,
      FAKE_ENV_DUMP: undefined,
      FAKE_PROMPT_DUMP: undefined,
      FAKE_KIND: undefined,
      FAKE_GRANDCHILD_PID_FILE: undefined,
    });
    const dispatcher = new HeadlessDispatcher({
      config: configFor(cwd, 30_000),
      loomDir,
      localPeerId: "test-local-peer",
      node: "bridge-node",
      commands: commands(),
      sink: {
        async composeAndSend(target, fields) {
          calls.push({ target, fields });
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
        roomId: "room_stderr",
        cardId: "task_stderr",
        agent: "grok",
        prompt: "stderr-note",
        fromPeerId: "peer_stderr",
        dispatchHandoffId: "hstderr",
        cwd,
      });
      expect(spawnCount(dump)).toBe(2);
      return calls;
    } finally {
      for (const line of dumpLines(dump)) killRecorded(line.pid);
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
}

function commands(): Record<"claude" | "codex" | "grok", { bin: string; args: string[] }> {
  return {
    claude: { bin: "bun", args: [FAKE, "--fake-kind", "claude"] },
    codex: { bin: "bun", args: [FAKE, "--fake-kind", "codex"] },
    grok: { bin: "bun", args: [FAKE, "--fake-kind", "grok"] },
  };
}

function configFor(cwd: string, timeoutMs: number): WorkerConfig {
  return {
    backend: "headless",
    cwd,
    allowedRoots: [cwd],
    maxConcurrent: { claude: 1, codex: 1, grok: 1 },
    timeoutMs,
    permissions: defaultWorkerPermissions(),
  };
}

function deadSession(over: Partial<CardSessionRecord>): CardSessionRecord {
  return {
    agent: "claude",
    cwd: "/unset",
    requestedCwd: null,
    sessionId: "old-session",
    promptFingerprint: "deadbeef",
    attempts: 1,
    pid: 2_000_000_000,
    pgid: 2_000_000_000,
    startedAt: "2026-10-15T00:00:00.000Z",
    state: "running",
    resultSent: false,
    sendAttempts: 0,
    completedHandoffIds: [],
    roomId: "room_w",
    cardId: "task_old",
    fromPeerId: "peer_w",
    dispatchHandoffId: "hold",
    procStartedAt: "Thu Oct 15 00:00:01 2026",
    ...over,
  };
}

describe("v0.30.0 P2 expected-red: headless worker", () => {
  test(
    "(c) exit-once resumes the same session id with the continuation message",
    async () => {
      await withFakeLock(async () => {
        const loomDir = mkdtempSync(join(tmpdir(), "loom-p2-exit-"));
        const cwd = realpathSync(mkdtempSync(join(tmpdir(), "loom-p2-exit-cwd-")));
        const dump = join(loomDir, "argv.jsonl");
        const promptDump = join(loomDir, "prompt.txt");
        const marker = join(loomDir, "exit-once");
        const calls: SinkCall[] = [];
        const restore = pushEnv({
          LOOM_DIR: loomDir,
          FAKE_OUTPUT_BYTES: "64",
          FAKE_DURATION_MS: "0",
          FAKE_TIME_SCALE: "1",
          FAKE_ARGV_DUMP: dump,
          FAKE_PROMPT_DUMP: promptDump,
          FAKE_EXIT_ONCE_MARKER: marker,
          FAKE_HANG: undefined,
          FAKE_DENIAL: undefined,
          FAKE_SPAWN_GRANDCHILD: undefined,
          FAKE_ENV_DUMP: undefined,
        });
        const card = {
          roomId: "room_c",
          cardId: "task_c1",
          agent: "claude" as const,
          prompt: "continue-the-card",
          fromPeerId: "peer_c",
          dispatchHandoffId: "hc1",
          cwd,
        };
        const dispatcher = new HeadlessDispatcher({
          config: configFor(cwd, 30_000),
          loomDir,
          localPeerId: "test-local-peer",
          node: "bridge-node",
          commands: commands(),
          sink: {
            async composeAndSend(target, fields) {
              calls.push({ target, fields });
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
          await dispatcher.dispatch(card);
          const lines = dumpLines(dump);
          expect(lines).toHaveLength(2);
          expect(lines[0]!.sessionId).toBe(lines[1]!.sessionId);
          expect(lines[1]!.argv).toContain("-r");
          expect(lines[1]!.argv).toContain(lines[1]!.sessionId);
          expect(lines[1]!.argv).not.toContain("--session-id");
          const prompt = readFileSync(promptDump, "utf8");
          const resumed = JSON.stringify(lines[1]!.argv);
          expect(
            prompt.includes(RESUME_CONTINUATION_MESSAGE) ||
              resumed.includes(RESUME_CONTINUATION_MESSAGE),
          ).toBe(true);
          expect(calls).toHaveLength(1);
          expect(calls[0]!.fields.reason).toBe("needs_verification");
          expect(calls[0]!.fields.status).toBe("failed");
          expect(calls[0]!.fields.output).toContain(`session:${lines[0]!.sessionId}`);
          const saved = readCardSession({
            loomDir,
            localPeerId: "test-local-peer",
            roomId: card.roomId,
            agent: card.agent,
            cardId: card.cardId,
          });
          expect(saved).not.toBeNull();
          expect(saved!.attempts).toBeGreaterThanOrEqual(1);
          expect(saved!.attempts).toBeLessThanOrEqual(2);
        } finally {
          for (const line of dumpLines(dump)) killRecorded(line.pid);
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

  test(
    "(c) fingerprint change starts a new session",
    async () => {
      await withFakeLock(async () => {
        const loomDir = mkdtempSync(join(tmpdir(), "loom-p2-fp-"));
        const cwd = realpathSync(mkdtempSync(join(tmpdir(), "loom-p2-fp-cwd-")));
        const dump = join(loomDir, "argv.jsonl");
        const calls: SinkCall[] = [];
        const restore = pushEnv({
          LOOM_DIR: loomDir,
          FAKE_OUTPUT_BYTES: "16",
          FAKE_DURATION_MS: "0",
          FAKE_TIME_SCALE: "1",
          FAKE_ARGV_DUMP: dump,
          FAKE_HANG: undefined,
          FAKE_EXIT_ONCE_MARKER: undefined,
          FAKE_DENIAL: undefined,
          FAKE_SPAWN_GRANDCHILD: undefined,
          FAKE_PROMPT_DUMP: undefined,
          FAKE_ENV_DUMP: undefined,
        });
        const card = {
          roomId: "room_fp",
          cardId: "task_fp1",
          agent: "claude" as const,
          prompt: "fresh-context",
          fromPeerId: "peer_fp",
          dispatchHandoffId: "hfp",
          cwd,
        };
        writeCardSession(
          { loomDir, localPeerId: "test-local-peer" },
          deadSession({
            ...card,
            cwd,
            promptFingerprint: "deadbeef",
            sessionId: "old-session",
          }),
        );
        const dispatcher = new HeadlessDispatcher({
          config: configFor(cwd, 30_000),
          loomDir,
          localPeerId: "test-local-peer",
          node: "bridge-node",
          commands: commands(),
          sink: {
            async composeAndSend(target, fields) {
              calls.push({ target, fields });
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
          await dispatcher.dispatch(card);
          const lines = dumpLines(dump);
          expect(lines).toHaveLength(1);
          expect(lines[0]!.argv).toContain("--session-id");
          expect(lines[0]!.argv).not.toContain("-r");
          expect(lines[0]!.sessionId).not.toBe("old-session");
          expect(calls[0]!.fields.reason).toBe("needs_verification");
        } finally {
          for (const line of dumpLines(dump)) killRecorded(line.pid);
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

  test(
    "(c) recorded cwd mismatch does not resume",
    async () => {
      await withFakeLock(async () => {
        const loomDir = mkdtempSync(join(tmpdir(), "loom-p2-cwd-mm-"));
        const cwd = realpathSync(mkdtempSync(join(tmpdir(), "loom-p2-cwd-mm-a-")));
        const other = realpathSync(mkdtempSync(join(tmpdir(), "loom-p2-cwd-mm-b-")));
        const dump = join(loomDir, "argv.jsonl");
        const calls: SinkCall[] = [];
        const restore = pushEnv({
          LOOM_DIR: loomDir,
          FAKE_OUTPUT_BYTES: "16",
          FAKE_DURATION_MS: "0",
          FAKE_ARGV_DUMP: dump,
          FAKE_HANG: undefined,
          FAKE_EXIT_ONCE_MARKER: undefined,
          FAKE_SPAWN_GRANDCHILD: undefined,
          FAKE_DENIAL: undefined,
        });
        const card = {
          roomId: "room_mm",
          cardId: "task_mm1",
          agent: "claude" as const,
          prompt: "do-not-resume",
          fromPeerId: "peer_mm",
          dispatchHandoffId: "hmm",
        };
        const fingerprint = promptFingerprint(
          HEADLESS_WORKER_HINT,
          defaultWorkerPermissions(),
          ARGV_TEMPLATE_VERSION,
        );
        writeCardSession(
          { loomDir, localPeerId: "test-local-peer" },
          deadSession({
            roomId: card.roomId,
            cardId: card.cardId,
            agent: card.agent,
            fromPeerId: card.fromPeerId,
            dispatchHandoffId: card.dispatchHandoffId,
            cwd: other,
            promptFingerprint: fingerprint,
            sessionId: "old-session",
          }),
        );
        const dispatcher = new HeadlessDispatcher({
          config: configFor(cwd, 30_000),
          loomDir,
          localPeerId: "test-local-peer",
          node: "bridge-node",
          commands: commands(),
          sink: {
            async composeAndSend(target, fields) {
              calls.push({ target, fields });
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
          await dispatcher.dispatch(card);
          expect(spawnCount(dump)).toBe(0);
          expect(calls).toHaveLength(1);
          expect(calls[0]!.fields.status).toBe("failed");
          expect(calls[0]!.fields.reason).toBe("needs_verification");
          expect(`${calls[0]!.fields.note ?? ""} ${calls[0]!.fields.output}`).toMatch(/cwd/i);
        } finally {
          for (const line of dumpLines(dump)) killRecorded(line.pid);
          try {
            await dispatcher.close();
          } catch {
            /* */
          }
          restore();
          rmSync(loomDir, { recursive: true, force: true });
          rmSync(cwd, { recursive: true, force: true });
          rmSync(other, { recursive: true, force: true });
        }
      });
    },
    { timeout: 20_000 },
  );

  test(
    "(d) a live worker is adopted across a dispatcher restart with no second spawn",
    async () => {
      await withFakeLock(async () => {
        const loomDir = mkdtempSync(join(tmpdir(), "loom-p2-adopt-"));
        const cwd = realpathSync(mkdtempSync(join(tmpdir(), "loom-p2-adopt-cwd-")));
        const dump = join(loomDir, "argv.jsonl");
        const calls: SinkCall[] = [];
        const restore = pushEnv({
          LOOM_DIR: loomDir,
          FAKE_OUTPUT_BYTES: "32",
          FAKE_DURATION_MS: "3000",
          FAKE_TIME_SCALE: "1",
          FAKE_ARGV_DUMP: dump,
          FAKE_HANG: undefined,
          FAKE_EXIT_ONCE_MARKER: undefined,
          FAKE_SPAWN_GRANDCHILD: undefined,
          FAKE_DENIAL: undefined,
        });
        const card = {
          roomId: "room_ad",
          cardId: "task_ad1",
          agent: "claude" as const,
          prompt: "adopt-me",
          fromPeerId: "peer_ad",
          dispatchHandoffId: "had",
          cwd,
        };
        const sink = {
          async composeAndSend(target: SinkCall["target"], fields: SinkCall["fields"]) {
            calls.push({ target, fields });
            return {
              branch: "accepted" as const,
              relayAcceptedAt: "2026-10-15T00:00:03.000Z",
              status: "delivered",
              recipientCount: 1,
            };
          },
        };
        const first = new HeadlessDispatcher({
          config: configFor(cwd, 30_000),
          loomDir,
          localPeerId: "test-local-peer",
          node: "bridge-node",
          commands: commands(),
          sink,
        });
        let second: HeadlessDispatcher | undefined;
        try {
          const inflight = first.dispatch(card).catch(() => {});
          await waitFor(() => {
            const saved = readCardSession({
              loomDir,
              localPeerId: "test-local-peer",
              roomId: card.roomId,
              agent: card.agent,
              cardId: card.cardId,
            });
            return Boolean(saved && saved.state === "running" && saved.pid > 0);
          });
          await first.close();
          second = new HeadlessDispatcher({
            config: configFor(cwd, 30_000),
            loomDir,
            localPeerId: "test-local-peer",
            node: "bridge-node",
            commands: commands(),
            sink,
          });
          await second.dispatch(card);
          await inflight;
          expect(spawnCount(dump)).toBe(1);
          expect(calls).toHaveLength(1);
          expect(calls[0]!.fields.reason).toBe("needs_verification");
        } finally {
          for (const line of dumpLines(dump)) killRecorded(line.pid);
          try {
            const saved = readCardSession({
              loomDir,
              localPeerId: "test-local-peer",
              roomId: card.roomId,
              agent: card.agent,
              cardId: card.cardId,
            });
            killRecorded(saved?.pgid);
            killRecorded(saved?.pid);
          } catch {
            /* */
          }
          try {
            await second?.close();
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

  test(
    "(d) R6 the same dispatch redelivered while alive joins without a second spawn",
    async () => {
      await withFakeLock(async () => {
        const loomDir = mkdtempSync(join(tmpdir(), "loom-p2-join-"));
        const cwd = realpathSync(mkdtempSync(join(tmpdir(), "loom-p2-join-cwd-")));
        const dump = join(loomDir, "argv.jsonl");
        const calls: SinkCall[] = [];
        const restore = pushEnv({
          LOOM_DIR: loomDir,
          FAKE_OUTPUT_BYTES: "16",
          FAKE_DURATION_MS: "1500",
          FAKE_TIME_SCALE: "1",
          FAKE_ARGV_DUMP: dump,
          FAKE_HANG: undefined,
          FAKE_EXIT_ONCE_MARKER: undefined,
          FAKE_SPAWN_GRANDCHILD: undefined,
          FAKE_DENIAL: undefined,
        });
        const card = {
          roomId: "room_join",
          cardId: "task_join",
          agent: "claude" as const,
          prompt: "join-me",
          fromPeerId: "peer_join",
          dispatchHandoffId: "hjoin",
          cwd,
        };
        const dispatcher = new HeadlessDispatcher({
          config: configFor(cwd, 30_000),
          loomDir,
          localPeerId: "test-local-peer",
          node: "bridge-node",
          commands: commands(),
          sink: {
            async composeAndSend(target, fields) {
              calls.push({ target, fields });
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
          const first = dispatcher.dispatch(card);
          await waitFor(() => spawnCount(dump) === 1 && dumpLines(dump)[0]!.pid! > 0);
          const second = dispatcher.dispatch(card);
          await Promise.all([first, second]);
          expect(spawnCount(dump)).toBe(1);
          expect(calls).toHaveLength(1);
          expect(calls[0]!.fields.reason).toBe("needs_verification");
        } finally {
          for (const line of dumpLines(dump)) killRecorded(line.pid);
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

  test(
    "(d) R48-M3 same card with a different dispatchHandoffId does not spawn",
    async () => {
      await withFakeLock(async () => {
        const loomDir = mkdtempSync(join(tmpdir(), "loom-p2-busy-"));
        const cwd = realpathSync(mkdtempSync(join(tmpdir(), "loom-p2-busy-cwd-")));
        const dump = join(loomDir, "argv.jsonl");
        const calls: SinkCall[] = [];
        const restore = pushEnv({
          LOOM_DIR: loomDir,
          FAKE_OUTPUT_BYTES: "16",
          FAKE_DURATION_MS: "1500",
          FAKE_TIME_SCALE: "1",
          FAKE_ARGV_DUMP: dump,
          FAKE_HANG: undefined,
          FAKE_EXIT_ONCE_MARKER: undefined,
          FAKE_SPAWN_GRANDCHILD: undefined,
          FAKE_DENIAL: undefined,
        });
        const card = {
          roomId: "room_busy",
          cardId: "task_busy",
          agent: "claude" as const,
          prompt: "already-running",
          fromPeerId: "peer_busy",
          dispatchHandoffId: "hbusy1",
          cwd,
        };
        const dispatcher = new HeadlessDispatcher({
          config: configFor(cwd, 30_000),
          loomDir,
          localPeerId: "test-local-peer",
          node: "bridge-node",
          commands: commands(),
          sink: {
            async composeAndSend(target, fields) {
              calls.push({ target, fields });
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
          const first = dispatcher.dispatch(card);
          await waitFor(() => spawnCount(dump) === 1);
          const second = dispatcher.dispatch({
            ...card,
            dispatchHandoffId: "hbusy2",
          });
          await Promise.all([first, second]);
          expect(spawnCount(dump)).toBe(1);
          expect(calls).toHaveLength(2);
          expect(calls.some((call) => call.fields.reason === "card_already_running")).toBe(true);
          expect(calls.some((call) => call.fields.reason === "needs_verification")).toBe(true);
        } finally {
          for (const line of dumpLines(dump)) killRecorded(line.pid);
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

  test(
    "(e) per-agent concurrency 1 queues the second card outside the timeout",
    async () => {
      await withFakeLock(async () => {
        const loomDir = mkdtempSync(join(tmpdir(), "loom-p2-queue-"));
        const cwd = realpathSync(mkdtempSync(join(tmpdir(), "loom-p2-queue-cwd-")));
        const dump = join(loomDir, "argv.jsonl");
        const calls: SinkCall[] = [];
        const restore = pushEnv({
          LOOM_DIR: loomDir,
          FAKE_OUTPUT_BYTES: "16",
          FAKE_DURATION_MS: "1200",
          FAKE_TIME_SCALE: "1",
          FAKE_ARGV_DUMP: dump,
          FAKE_HANG: undefined,
          FAKE_EXIT_ONCE_MARKER: undefined,
          FAKE_SPAWN_GRANDCHILD: undefined,
          FAKE_DENIAL: undefined,
        });
        const dispatcher = new HeadlessDispatcher({
          config: configFor(cwd, 1_800),
          loomDir,
          localPeerId: "test-local-peer",
          node: "bridge-node",
          commands: commands(),
          sink: {
            async composeAndSend(target, fields) {
              calls.push({ target, fields });
              return {
                branch: "accepted",
                relayAcceptedAt: "2026-10-15T00:00:03.000Z",
                status: "delivered",
                recipientCount: 1,
              };
            },
          },
        });
        const cardA = {
          roomId: "room_q",
          cardId: "task_aaa",
          agent: "claude" as const,
          prompt: "first-card",
          fromPeerId: "peer_q",
          dispatchHandoffId: "ha",
          cwd,
        };
        const cardB = {
          ...cardA,
          cardId: "task_bbb",
          dispatchHandoffId: "hb",
          prompt: "second-card",
        };
        try {
          const first = dispatcher.dispatch(cardA);
          await waitFor(() => dispatcher.status().running.claude === 1);
          const second = dispatcher.dispatch(cardB);
          expect(dispatcher.status().queueDepth.claude).toBeGreaterThanOrEqual(1);
          expect(JSON.stringify(dispatcher.status())).not.toContain(cardA.cardId);
          expect(JSON.stringify(dispatcher.status())).not.toContain(cardB.cardId);
          await Promise.all([first, second]);
          expect(spawnCount(dump)).toBe(2);
          expect(calls).toHaveLength(2);
          expect(calls.every((call) => call.fields.reason === "needs_verification")).toBe(true);
        } finally {
          for (const line of dumpLines(dump)) killRecorded(line.pid);
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

  test(
    "(f) timeout kills the process group, including the grandchild, and returns the partial transcript",
    async () => {
      await withFakeLock(async () => {
        const loomDir = mkdtempSync(join(tmpdir(), "loom-p2-kill-"));
        const cwd = realpathSync(mkdtempSync(join(tmpdir(), "loom-p2-kill-cwd-")));
        const dump = join(loomDir, "argv.jsonl");
        const gpidFile = join(loomDir, "grandchild.pid");
        const calls: SinkCall[] = [];
        // The production per-card timer has a 60s minimum. Accelerate only
        // that timer; retain real process-group signals and reaping.
        const realSetTimeout = globalThis.setTimeout;
        const timer = spyOn(globalThis, "setTimeout").mockImplementation(((
          fn: Parameters<typeof setTimeout>[0],
          ms?: number,
          ...args: unknown[]
        ) => realSetTimeout(fn, ms === 60_000 ? 400 : ms, ...args)) as typeof setTimeout);
        const restore = pushEnv({
          LOOM_DIR: loomDir,
          FAKE_OUTPUT_BYTES: "16",
          FAKE_DURATION_MS: "0",
          FAKE_HANG: "1",
          FAKE_SPAWN_GRANDCHILD: "1",
          FAKE_GRANDCHILD_PID_FILE: gpidFile,
          FAKE_ARGV_DUMP: dump,
          FAKE_EXIT_ONCE_MARKER: undefined,
          FAKE_DENIAL: undefined,
        });
        const dispatcher = new HeadlessDispatcher({
          config: configFor(cwd, 400),
          loomDir,
          localPeerId: "test-local-peer",
          node: "bridge-node",
          commands: commands(),
          sink: {
            async composeAndSend(target, fields) {
              calls.push({ target, fields });
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
            roomId: "room_kill",
            cardId: "task_kill",
            agent: "claude",
            prompt: "hang-please",
            fromPeerId: "peer_kill",
            dispatchHandoffId: "hkill",
            cwd,
          });
          expect(calls).toHaveLength(1);
          expect(calls[0]!.fields.reason).toBe("timeout");
          expect(calls[0]!.fields.status).toBe("failed");
          expect(calls[0]!.fields.output).toContain("PARTIAL_READY");
          const grandchild = Number(readFileSync(gpidFile, "utf8"));
          const start = Date.now();
          let dead = false;
          while (Date.now() - start < 8_000) {
            try {
              process.kill(grandchild, 0);
            } catch {
              dead = true;
              break;
            }
            await Bun.sleep(50);
          }
          expect(dead).toBe(true);
        } finally {
          if (existsSync(gpidFile)) {
            killRecorded(Number(readFileSync(gpidFile, "utf8")));
          }
          for (const line of dumpLines(dump)) killRecorded(line.pid);
          try {
            await dispatcher.close();
          } catch {
            /* */
          }
          restore();
          timer.mockRestore();
          rmSync(loomDir, { recursive: true, force: true });
          rmSync(cwd, { recursive: true, force: true });
        }
      });
    },
    { timeout: 25_000 },
  );

  test(
    "(g) R48-L1 a symlink whose realpath is outside allowedRoots does not spawn",
    async () => {
      await withFakeLock(async () => {
        const loomDir = mkdtempSync(join(tmpdir(), "loom-p2-link-"));
        const root = realpathSync(mkdtempSync(join(tmpdir(), "loom-p2-link-root-")));
        const outside = realpathSync(mkdtempSync(join(tmpdir(), "loom-p2-link-out-")));
        const link = join(root, "link");
        symlinkSync(outside, link);
        const dump = join(loomDir, "argv.jsonl");
        const calls: SinkCall[] = [];
        const restore = pushEnv({
          LOOM_DIR: loomDir,
          FAKE_OUTPUT_BYTES: "8",
          FAKE_DURATION_MS: "0",
          FAKE_ARGV_DUMP: dump,
          FAKE_HANG: undefined,
          FAKE_EXIT_ONCE_MARKER: undefined,
          FAKE_SPAWN_GRANDCHILD: undefined,
          FAKE_DENIAL: undefined,
        });
        const dispatcher = new HeadlessDispatcher({
          config: configFor(root, 30_000),
          loomDir,
          localPeerId: "test-local-peer",
          node: "bridge-node",
          commands: commands(),
          sink: {
            async composeAndSend(target, fields) {
              calls.push({ target, fields });
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
            roomId: "room_link",
            cardId: "task_link",
            agent: "claude",
            prompt: "escape",
            fromPeerId: "peer_link",
            dispatchHandoffId: "hlink",
            cwd: link,
          });
          expect(spawnCount(dump)).toBe(0);
          expect(calls).toHaveLength(1);
          expect(calls[0]!.fields.reason).toBe("cwd_not_allowed");
          expect(calls[0]!.fields.status).toBe("failed");
        } finally {
          for (const line of dumpLines(dump)) killRecorded(line.pid);
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
      });
    },
    { timeout: 20_000 },
  );

  test(
    "(g) a cwd outside allowedRoots does not spawn",
    async () => {
      await withFakeLock(async () => {
        const loomDir = mkdtempSync(join(tmpdir(), "loom-p2-out-"));
        const root = realpathSync(mkdtempSync(join(tmpdir(), "loom-p2-out-root-")));
        const outside = realpathSync(mkdtempSync(join(tmpdir(), "loom-p2-out-cwd-")));
        const dump = join(loomDir, "argv.jsonl");
        const calls: SinkCall[] = [];
        const restore = pushEnv({
          LOOM_DIR: loomDir,
          FAKE_OUTPUT_BYTES: "8",
          FAKE_DURATION_MS: "0",
          FAKE_ARGV_DUMP: dump,
          FAKE_HANG: undefined,
          FAKE_EXIT_ONCE_MARKER: undefined,
          FAKE_SPAWN_GRANDCHILD: undefined,
          FAKE_DENIAL: undefined,
        });
        const dispatcher = new HeadlessDispatcher({
          config: configFor(root, 30_000),
          loomDir,
          localPeerId: "test-local-peer",
          node: "bridge-node",
          commands: commands(),
          sink: {
            async composeAndSend(target, fields) {
              calls.push({ target, fields });
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
            roomId: "room_out",
            cardId: "task_out",
            agent: "claude",
            prompt: "outside",
            fromPeerId: "peer_out",
            dispatchHandoffId: "hout",
            cwd: outside,
          });
          expect(spawnCount(dump)).toBe(0);
          expect(calls[0]!.fields.reason).toBe("cwd_not_allowed");
        } finally {
          for (const line of dumpLines(dump)) killRecorded(line.pid);
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
      });
    },
    { timeout: 20_000 },
  );

  test(
    "(g) R48-H1 spawn env keeps LOOM_CARD and drops other LOOM_* and FABLE_*",
    async () => {
      await withFakeLock(async () => {
        const loomDir = mkdtempSync(join(tmpdir(), "loom-p2-env-"));
        const cwd = realpathSync(mkdtempSync(join(tmpdir(), "loom-p2-env-cwd-")));
        const dump = join(loomDir, "argv.jsonl");
        const envFile = join(loomDir, "env.json");
        const calls: SinkCall[] = [];
        const restore = pushEnv({
          LOOM_DIR: loomDir,
          LOOM_RELAY_TOKEN: "secret-token",
          LOOM_RELAY_URL: "http://relay.example",
          LOOM_HOOK_SOCK: "/tmp/hook",
          LOOM_CONV: "conv",
          LOOM_CARD: "should-be-replaced",
          FABLE_SECRET: "nope",
          FAKE_ENV_DUMP: envFile,
          FAKE_OUTPUT_BYTES: "8",
          FAKE_DURATION_MS: "0",
          FAKE_ARGV_DUMP: dump,
          FAKE_HANG: undefined,
          FAKE_EXIT_ONCE_MARKER: undefined,
          FAKE_SPAWN_GRANDCHILD: undefined,
          FAKE_DENIAL: undefined,
        });
        const cardId = "task_e1";
        const dispatcher = new HeadlessDispatcher({
          config: configFor(cwd, 30_000),
          loomDir,
          localPeerId: "test-local-peer",
          node: "bridge-node",
          commands: commands(),
          sink: {
            async composeAndSend(target, fields) {
              calls.push({ target, fields });
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
            roomId: "room_env",
            cardId,
            agent: "claude",
            prompt: "show-env",
            fromPeerId: "peer_env",
            dispatchHandoffId: "henv",
            cwd,
          });
          const env = JSON.parse(readFileSync(envFile, "utf8")) as Record<string, string>;
          expect(Object.keys(env).filter((key) => key.startsWith("LOOM_"))).toEqual(["LOOM_CARD"]);
          expect(Object.keys(env).filter((key) => key.startsWith("FABLE_"))).toEqual([]);
          expect(env.LOOM_CARD).toBe(cardId);
          expect(env.LOOM_RELAY_TOKEN).toBeUndefined();
          expect(env.LOOM_RELAY_URL).toBeUndefined();
          expect(env.LOOM_HOOK_SOCK).toBeUndefined();
          expect(env.LOOM_CONV).toBeUndefined();
          expect(calls[0]!.fields.reason).toBe("needs_verification");
        } finally {
          for (const line of dumpLines(dump)) killRecorded(line.pid);
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

  test(
    "(g) exit 2 without a terminal event keeps the last stderr line in the give-up note",
    async () => {
      const body = "prelude\n\n\u0001error: unexpected argument 'Write' found\u0007\n\n";
      const calls = await grokStderrGiveUp(body);
      expect(calls).toHaveLength(1);
      expect(calls[0]!.fields.status).toBe("failed");
      expect(calls[0]!.fields.reason).toBe("needs_verification");
      expect(calls[0]!.fields.note).toBe(
        "attempts 2 exhausted; not resuming; last stderr: error: unexpected argument 'Write' found",
      );
    },
    { timeout: 20_000 },
  );

  test(
    "(g) give-up stderr note strips controls, trims, and caps at 300 chars",
    async () => {
      const body = `\n\n\u0001${"B".repeat(320)}\u007f\n   \n`;
      const calls = await grokStderrGiveUp(body);
      expect(calls).toHaveLength(1);
      expect(calls[0]!.fields.note).toBe(
        `attempts 2 exhausted; not resuming; last stderr: ${"B".repeat(300)}`,
      );
    },
    { timeout: 20_000 },
  );

  test(
    "(g) give-up stderr note redacts secrets before they reach the result",
    async () => {
      const calls = await grokStderrGiveUp("OPENAI_API_KEY=synthetic-secret-123\n");
      expect(calls).toHaveLength(1);
      expect(calls[0]!.fields.note).toBe(
        "attempts 2 exhausted; not resuming; last stderr: OPENAI_API_KEY=[REDACTED]",
      );
      expect(calls[0]!.fields.note).not.toContain("synthetic-secret-123");
    },
    { timeout: 20_000 },
  );
});
