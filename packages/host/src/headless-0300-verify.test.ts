import { describe, expect, spyOn, test } from "bun:test";
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  CARD_CONTRACT_VERSION,
  CARD_DISPATCH_LABEL,
  CARD_RESULT_LABEL,
  serializeCardAttachment,
} from "@loom/protocol";
import { RelayServer } from "@loom/relay";
import {
  defaultWorkerPermissions,
  workerFingerprint,
  type AgentKind,
  type WorkerConfig,
} from "./agent-argv";
import { startBridgeRuntime } from "./bridge-runtime";
import * as sessions from "./card-session-store";
import {
  cardSessionPath,
  listCardSessions,
  readCardSession,
  writeCardSession,
  type CardSessionRecord,
} from "./card-session-store";
import { startFakeHerdr } from "./fake-herdr";
import {
  HeadlessDispatcher,
  type HeadlessDispatchCard,
  type HeadlessResultFields,
} from "./headless-worker";
import * as groups from "./process-group";
import { RelayClient } from "./relay-client";
import {
  loadSession,
  loomDir,
  resetStateHomeDirCache,
  setActiveProfile,
  type FableSession,
} from "./session-store";

const FAKE = join(import.meta.dir, "fake-agent-cli.ts");
const terminal =
  JSON.stringify({ type: "result", result: "saved output", session_id: "saved-session" }) + "\n";

async function waitFor(pred: () => boolean | Promise<boolean>, ms = 5_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!(await pred())) {
    if (Date.now() > deadline) throw new Error("condition timed out");
    await Bun.sleep(20);
  }
}

// Isolate FAKE_* per child, without mutating the test runner's environment.
function fakeCommand(agent: AgentKind, env: Record<string, string> = {}) {
  const keys = new Set([
    ...Object.keys(process.env).filter((key) => key.startsWith("FAKE_")),
    "FAKE_HANG",
    "FAKE_DENIAL",
    "FAKE_DURATION_MS",
    "FAKE_ARGV_DUMP",
    "FAKE_EXIT_ONCE_MARKER",
    "FAKE_SPAWN_GRANDCHILD",
  ]);
  return {
    bin: "/usr/bin/env",
    args: [
      ...[...keys].flatMap((key) => ["-u", key]),
      ...Object.entries(env).map(([key, value]) => `${key}=${value}`),
      process.execPath,
      FAKE,
      "--fake-kind",
      agent,
    ],
  };
}

function killGroup(pid: number): void {
  if (pid <= 1) return;
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    /* already gone */
  }
}

class Harness {
  readonly root = realpathSync(mkdtempSync(join(tmpdir(), "loom-0300-verify-")));
  readonly calls: Array<{ id: string; fields: HeadlessResultFields }> = [];
  readonly dispatchers: HeadlessDispatcher[] = [];
  readonly config: WorkerConfig = {
    backend: "headless",
    cwd: this.root,
    allowedRoots: [this.root],
    maxConcurrent: { claude: 1, codex: 1, grok: 1 },
    timeoutMs: 7_200_000,
    permissions: defaultWorkerPermissions(),
  };
  readonly card: HeadlessDispatchCard = {
    roomId: "room",
    cardId: "card",
    agent: "claude",
    prompt: "bounded task",
    fromPeerId: "sender",
    dispatchHandoffId: "D1",
  };
  key() {
    return { loomDir: this.root, localPeerId: "worker", ...this.card };
  }
  saved() {
    return readCardSession(this.key())!;
  }
  transcript(attempt = 1) {
    return join(dirname(cardSessionPath(this.key())), `transcript-${attempt}.jsonl`);
  }
  seed(over: Partial<CardSessionRecord> = {}, raw = "") {
    const record: CardSessionRecord = {
      ...this.card,
      cwd: this.root,
      requestedCwd: null,
      sessionId: "saved-session",
      promptFingerprint: workerFingerprint(this.config),
      attempts: 1,
      pid: 2_000_000_000,
      pgid: 2_000_000_000,
      startedAt: new Date().toISOString(),
      state: "running",
      resultSent: false,
      procStartedAt: "Thu Oct 15 00:00:00 2026",
      sendAttempts: 0,
      completedHandoffIds: [],
      ...over,
    };
    writeCardSession({ loomDir: this.root, localPeerId: "worker" }, record);
    writeFileSync(this.transcript(record.attempts), raw);
    return record;
  }
  dispatcher(
    env: Record<string, string> = {},
    sink?: (id: string, fields: HeadlessResultFields) => Promise<void>,
    options: { closeDeadlineMs?: number } = {},
  ) {
    const dispatcher = new HeadlessDispatcher({
      ...options,
      config: this.config,
      loomDir: this.root,
      localPeerId: "worker",
      node: "node",
      commands: {
        claude: fakeCommand("claude", env),
        codex: fakeCommand("codex", env),
        grok: fakeCommand("grok", env),
      },
      sink: {
        composeAndSend: async (target, fields) => {
          this.calls.push({ id: target.dispatchHandoffId, fields: structuredClone(fields) });
          await sink?.(target.dispatchHandoffId, fields);
        },
      },
    });
    this.dispatchers.push(dispatcher);
    return dispatcher;
  }
  async cleanup() {
    await Promise.all(this.dispatchers.map((d) => d.close()));
    for (const record of listCardSessions(this.root, "worker")) killGroup(record.pgid);
    rmSync(this.root, { recursive: true, force: true });
  }
}

async function fixture(fn: (h: Harness) => Promise<void>) {
  const h = new Harness();
  try {
    await fn(h);
  } finally {
    await h.cleanup();
  }
}

describe("headless 0.30.0 defect regressions", () => {
  test("round 5 close reaches its deadline when a claim never resolves", async () => {
    const h = new Harness();
    const stderr = spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      let claiming = false;
      const d = h.dispatcher({}, undefined, { closeDeadlineMs: 20 });
      void d.dispatch({
        ...h.card,
        claim: () => {
          claiming = true;
          return new Promise<boolean>(() => {});
        },
      });
      await waitFor(() => claiming);
      const started = performance.now();
      const outcome = await Promise.race([
        d.close().then(() => "closed"),
        Bun.sleep(250).then(() => "timed out"),
      ]);
      expect(outcome).toBe("closed");
      expect(performance.now() - started).toBeLessThan(250);
      expect(stderr).toHaveBeenCalledWith("[headless] close deadline: 1 owners still pending\n");
      expect(h.saved()).toBeNull();
      expect(h.calls).toEqual([]);
    } finally {
      stderr.mockRestore();
      // The deliberately unresolved claim never spawned a worker or wrote a record.
      rmSync(h.root, { recursive: true, force: true });
    }
  });

  test("round 5 a successful claim after the close deadline still reserves shutdown", async () => {
    await fixture(async (h) => {
      let resolveClaim!: (claimed: boolean) => void;
      let claiming = false;
      const d = h.dispatcher({}, undefined, { closeDeadlineMs: 20 });
      const pending = d.dispatch({
        ...h.card,
        claim: () => {
          claiming = true;
          return new Promise<boolean>((resolve) => { resolveClaim = resolve; });
        },
      });
      await waitFor(() => claiming);
      try {
        expect(await Promise.race([
          d.close().then(() => "closed"),
          Bun.sleep(250).then(() => "timed out"),
        ])).toBe("closed");
        expect(h.saved()).toBeNull();
        resolveClaim(true);
        await pending;
        expect(h.saved().pendingResult?.reason).toBe("bridge_shutdown_after_claim");
        expect(h.saved().resultSent).toBe(false);
        expect(h.saved().pid).toBe(0);
        expect(h.calls).toEqual([]);
      } finally {
        resolveClaim(false);
        await pending;
      }
    });
  });

  for (const handoffId of ["D1", "D2"]) {
    test(`round 5 a sink awaiting same-card ${handoffId} rejects instead of deadlocking`, async () => {
      await fixture(async (h) => {
        const fields: HeadlessResultFields = {
          status: "failed", reason: "needs_verification", output: "",
          truncated: false, summary: "saved result",
        };
        h.seed({ state: "exited", pendingResult: fields });
        const d = h.dispatcher({}, async () => {
          const outcome = await Promise.race([
            d.dispatch({ ...h.card, dispatchHandoffId: handoffId, claim: async () => true })
              .then(() => "resolved", (err: Error) => err.message),
            Bun.sleep(250).then(() => "timed out"),
          ]);
          expect(outcome).toBe("re-entrant dispatch from result sink");
        });
        await d.dispatch(h.card);
        expect(h.calls).toHaveLength(1);
        expect(h.saved().resultSent).toBe(true);
      });
    });
  }

  test("round 5 sink guard allows other cards and independent same-card callers", async () => {
    await fixture(async (h) => {
      h.config.maxConcurrent.claude = 2;
      h.seed({
        state: "exited",
        pendingResult: {
          status: "failed", reason: "needs_verification", output: "",
          truncated: false, summary: "saved result",
        },
      });
      let releaseSink!: () => void;
      const gate = new Promise<void>((resolve) => { releaseSink = resolve; });
      let sinkEntered = false;
      let otherClaims = 0;
      const d = h.dispatcher({}, async () => {
        await d.dispatch({
          ...h.card, cardId: "other",
          claim: async () => { otherClaims++; return false; },
        });
        sinkEntered = true;
        await gate;
      });
      const first = d.dispatch(h.card);
      let second: Promise<void> | undefined;
      let secondSettled = false;
      try {
        await waitFor(() => sinkEntered);
        expect(otherClaims).toBe(1);
        second = d.dispatch(h.card).finally(() => { secondSettled = true; });
        await Bun.sleep(20);
        expect(secondSettled).toBe(false);
        releaseSink();
        await Promise.all([first, second]);
        expect(h.saved().resultSent).toBe(true);
        expect(h.calls).toHaveLength(1);
      } finally {
        releaseSink();
        await Promise.allSettled([first, second]);
      }
    });
  });

  test("1 queued claims wait for the permit; close leaves queued work claimable after restart", async () => {
    await fixture(async (h) => {
      const d = h.dispatcher({ FAKE_DURATION_MS: "1000" });
      const a = d.dispatch(h.card);
      await waitFor(() => d.flights().length === 1);
      let claims = 0;
      let inInbox = true;
      const b = {
        ...h.card,
        cardId: "B",
        dispatchHandoffId: "B",
        claim: async () => {
          claims++;
          if (!inInbox) return false;
          inInbox = false;
          return true;
        },
      };
      const queued = d.dispatch(b);
      await waitFor(() => d.status().queueDepth.claude === 1);
      expect(claims).toBe(0);
      await d.close();
      await Promise.all([a, queued]);
      expect(claims).toBe(0);
      expect(inInbox).toBe(true);
      await h.dispatcher().dispatch(b);
      expect(claims).toBe(1);
      expect(h.calls.map((c) => c.id)).toEqual(["B"]);
    });
  });

  test("1 queued claim runs when A releases the permit", async () => {
    await fixture(async (h) => {
      const d = h.dispatcher({ FAKE_DURATION_MS: "200" });
      const a = d.dispatch(h.card);
      let claims = 0;
      const b = d.dispatch({
        ...h.card,
        cardId: "B",
        dispatchHandoffId: "B",
        claim: async () => {
          claims++;
          return true;
        },
      });
      expect(claims).toBe(0);
      await Promise.all([a, b]);
      expect(claims).toBe(1);
      expect(h.calls.map((c) => c.id)).toEqual(["D1", "B"]);
    });
  });

  test("round 2 close before lane continuation skips claim", async () => {
    await fixture(async (h) => {
      let claims = 0;
      const d = h.dispatcher();
      const pending = d.dispatch({
        ...h.card,
        claim: async () => {
          claims++;
          return true;
        },
      });
      await d.close();
      await pending;
      expect(claims).toBe(0);
      expect(listCardSessions(h.root, "worker")).toEqual([]);
    });
  });

  test("round 2 close racing a successful claim reserves a replayable shutdown result", async () => {
    await fixture(async (h) => {
      let resolveClaim!: (claimed: boolean) => void;
      let claiming = false;
      const d = h.dispatcher();
      const pending = d.dispatch({
        ...h.card,
        claim: () => {
          claiming = true;
          return new Promise<boolean>((resolve) => {
            resolveClaim = resolve;
          });
        },
      });
      await waitFor(() => claiming);
      const closing = d.close();
      resolveClaim(true);
      await Promise.all([pending, closing]);
      const saved = h.saved();
      expect(saved).not.toBeNull();
      expect(saved.pendingResult?.reason).toBe("bridge_shutdown_after_claim");
      expect(saved.pendingResult?.note).toContain("needs_verification");
      expect(saved.resultSent).toBe(false);
      expect(saved.sendAttempts).toBe(0);
      expect(saved.pid).toBe(0);
      expect(h.calls).toEqual([]);
      const spawn = spyOn(groups, "spawnDetachedWorker");
      try {
        await h.dispatcher().recover();
        expect(spawn).not.toHaveBeenCalled();
        expect(h.calls.map((c) => c.id)).toEqual(["D1"]);
        expect(h.calls[0]!.fields).toEqual(saved.pendingResult!);
        expect(h.saved().completedHandoffIds).toEqual(["D1"]);
      } finally {
        spawn.mockRestore();
      }
    });
  });

  test("round 3 close during D1 replay leaves D2 unclaimed and preserves D1's sent result", async () => {
    await fixture(async (h) => {
      h.seed({
        state: "exited",
        sendAttempts: 1,
        pendingResult: {
          status: "failed",
          reason: "needs_verification",
          output: "D1 output",
          truncated: false,
          summary: "D1",
          timedOut: false,
        },
      });
      let finishReplay!: () => void;
      let claims = 0;
      const d = h.dispatcher({}, () => new Promise<void>((resolve) => {
        finishReplay = resolve;
      }));
      const write = spyOn(sessions, "writeCardSessionAsync");
      const spawn = spyOn(groups, "spawnDetachedWorker");
      try {
        const pending = d.dispatch({
          ...h.card,
          dispatchHandoffId: "D2",
          claim: async () => {
            claims++;
            return true;
          },
        });
        await waitFor(() => !!finishReplay);
        const closing = d.close();
        finishReplay();
        await Promise.all([pending, closing]);
        expect(claims).toBe(0);
        expect(h.calls.map((c) => c.id)).toEqual(["D1"]);
        expect(h.saved().dispatchHandoffId).toBe("D1");
        expect(h.saved().resultSent).toBe(true);
        expect(h.saved().completedHandoffIds).toEqual(["D1"]);
        expect(write.mock.calls.some(([, record]) =>
          record.pendingResult?.reason === "bridge_shutdown_after_claim",
        )).toBe(false);
        expect(spawn).not.toHaveBeenCalled();
      } finally {
        write.mockRestore();
        spawn.mockRestore();
      }
    });
  });

  for (const sentRecord of [false, true]) {
    test(`round 3 abandonment after claim before spawn reserves shutdown (sent record=${sentRecord})`, async () => {
      await fixture(async (h) => {
        if (sentRecord) h.seed({
          state: "exited",
          resultSent: true,
          completedHandoffIds: ["D1"],
          pendingResult: {
            status: "failed",
            reason: "needs_verification",
            output: "sent D1 output",
            truncated: false,
            summary: "D1",
            timedOut: false,
          },
        });
        const d = h.dispatcher();
        let closing: Promise<void> | undefined;
        let claims = 0;
        // Abandon synchronously during plan construction, after the first
        // post-claim abandonment check and before the spawn-loop fence.
        Object.defineProperty(h.config, "cwd", {
          get: () => {
            closing ??= d.close();
            return h.root;
          },
        });
        const spawn = spyOn(groups, "spawnDetachedWorker");
        try {
          await d.dispatch({
            ...h.card,
            dispatchHandoffId: "D2",
            claim: async () => {
              claims++;
              return true;
            },
          });
          await closing;
          expect(claims).toBe(1);
          expect(spawn).not.toHaveBeenCalled();
          expect(h.calls).toEqual([]);
          expect(h.saved().dispatchHandoffId).toBe("D2");
          expect(h.saved().pendingResult?.reason).toBe("bridge_shutdown_after_claim");
          expect(h.saved().resultSent).toBe(false);
          expect(h.saved().sendAttempts).toBe(0);
          expect(h.saved().completedHandoffIds).toEqual(sentRecord ? ["D1"] : []);
        } finally {
          spawn.mockRestore();
        }
      });
    });
  }

  test("round 3 shutdown reservation rejects overwriting an unsent result", async () => {
    await fixture(async (h) => {
      h.seed({
        state: "exited",
        sendAttempts: 1,
        pendingResult: {
          status: "failed",
          reason: "needs_verification",
          output: "reserved D1 output",
          truncated: false,
          summary: "D1",
          timedOut: false,
        },
      });
      const before = h.saved();
      await expect(h.dispatcher()["reserveShutdownAfterClaim"](
        { ...h.card, dispatchHandoffId: "D2" },
      )).rejects.toThrow("unsent");
      expect(h.saved()).toEqual(before);
      expect(h.calls).toEqual([]);
    });
  });

  for (const sendFails of [false, true]) {
    test(`round 4 same-card claim cannot displace D1 across close (send fails=${sendFails})`, async () => {
      await fixture(async (h) => {
        h.config.maxConcurrent.claude = 2;
        let finishSend!: () => void;
        let resolveClaim: ((claimed: boolean) => void) | undefined;
        let claimEntered!: () => void;
        const claiming = new Promise<void>((resolve) => { claimEntered = resolve; });
        let claims = 0;
        const d = h.dispatcher({}, async () => {
          await new Promise<void>((resolve) => { finishSend = resolve; });
          if (sendFails) throw new Error("D1 sink unavailable");
        });
        const record = h.seed();
        const second = d.dispatch({
          ...h.card,
          dispatchHandoffId: "D2",
          claim: () => {
            claims++;
            claimEntered();
            return new Promise<boolean>((resolve) => { resolveClaim = resolve; });
          },
        });
        // Old code enters D2's claim with a snapshot of the running D1.
        // Serialized code can instead leave D2 in the inbox before claiming.
        await Promise.race([claiming, second]);
        const first = d["sendAndMark"](record, {
          status: "failed",
          reason: "needs_verification",
          output: "D1 output",
          truncated: false,
          summary: "D1",
        }).catch((err: Error) => err.message);
        await waitFor(() => !!finishSend);
        const reserved = h.saved();
        expect(reserved.dispatchHandoffId).toBe("D1");
        expect(reserved.pendingResult).toBeDefined();
        expect(reserved.resultSent).toBe(false);
        const closing = d.close();
        resolveClaim?.(true);
        await second;
        finishSend();
        const [failure] = await Promise.all([first, closing]);
        expect(failure).toBe(sendFails ? "D1 sink unavailable" : undefined);
        expect(h.saved().dispatchHandoffId).toBe("D1");
        expect(h.saved().pendingResult).toEqual(reserved.pendingResult);
        expect(h.saved().resultSent).toBe(!sendFails);
        // With one durable slot, D2 must remain available to a later drain.
        expect(claims).toBe(0);
        if (sendFails) {
          await h.dispatcher().recover();
          expect(h.calls.map((c) => c.id)).toEqual(["D1", "D1"]);
          expect(h.saved().completedHandoffIds).toEqual(["D1"]);
        }
      });
    });
  }

  test("round 4 shutdown reservation re-reads rather than trusting a pre-claim snapshot", async () => {
    await fixture(async (h) => {
      h.seed({ state: "exited", resultSent: true });
      const current = h.seed({
        state: "exited",
        pendingResult: {
          status: "failed",
          reason: "needs_verification",
          output: "D1 obligation",
          truncated: false,
          summary: "D1",
          timedOut: false,
        },
      });
      await expect(h.dispatcher()["reserveShutdownAfterClaim"](
        { ...h.card, dispatchHandoffId: "D2" },
      )).rejects.toThrow("unsent");
      expect(h.saved()).toEqual(current);
    });
  });

  test("round 4 a pending claim locks its card transitions, but not another card", async () => {
    await fixture(async (h) => {
      h.config.maxConcurrent.claude = 2;
      let resolveClaim!: (claimed: boolean) => void;
      let claiming = false;
      const d = h.dispatcher();
      const pending = d.dispatch({
        ...h.card,
        claim: () => {
          claiming = true;
          return new Promise<boolean>((resolve) => { resolveClaim = resolve; });
        },
      });
      await waitFor(() => claiming);
      let settled = false;
      const conflicting = d["reserveShutdownAfterClaim"]({
        ...h.card, dispatchHandoffId: "D2",
      }).then(() => "reserved", (err: Error) => err.message).finally(() => { settled = true; });
      try {
        await d["reserveShutdownAfterClaim"]({ ...h.card, cardId: "other" });
        expect(settled).toBe(false);
        expect(h.saved()).toBeNull();
        const closing = d.close();
        resolveClaim(true);
        await Promise.all([pending, closing]);
        expect(await conflicting).toContain("unsent");
        expect(h.saved().dispatchHandoffId).toBe("D1");
        expect(h.saved().pendingResult?.reason).toBe("bridge_shutdown_after_claim");
      } finally {
        resolveClaim(false);
        await Promise.allSettled([pending, conflicting]);
      }
    });
  });

  for (const allowPersistenceFailure of [false, true]) {
    test(`round 4 every result writer guards the durable slot (persistence fallback=${allowPersistenceFailure})`, async () => {
      await fixture(async (h) => {
        const current = h.seed({
          state: "exited",
          pendingResult: {
            status: "failed",
            reason: "needs_verification",
            output: "D1 reserved output",
            truncated: false,
            summary: "D1",
            timedOut: false,
          },
        });
        const stale = { ...current, dispatchHandoffId: "D2", pendingResult: undefined };
        const d = h.dispatcher();
        await expect(d["sendAndMark"](stale, {
          ...current.pendingResult!, output: "D2 output",
        }, { allowPersistenceFailure })).rejects.toThrow("unsent");
        expect(h.saved()).toEqual(current);
        expect(h.calls).toEqual([]);
        // A rejected transition must release the mutex for D1's recovery.
        await d.recover();
        expect(h.calls.map((c) => c.id)).toEqual(["D1"]);
        expect(h.saved().completedHandoffIds).toEqual(["D1"]);
      });
    });
  }

  test("round 4 transient reservation failure still persists the delivered setup result", async () => {
    await fixture(async (h) => {
      const record = h.seed();
      const originalWrite = sessions.writeCardSessionAsync;
      let failed = false;
      const write = spyOn(sessions, "writeCardSessionAsync").mockImplementation(async (opts, next) => {
        if (!failed && next.pendingResult) {
          failed = true;
          throw new Error("transient reservation write failure");
        }
        await originalWrite(opts, next);
      });
      try {
        await h.dispatcher()["sendAndMark"](record, {
          status: "failed",
          reason: "spawn_setup_failed",
          output: "",
          truncated: false,
          summary: "",
        }, { allowPersistenceFailure: true });
        expect(failed).toBe(true);
        expect(h.saved().pendingResult).toEqual(h.calls[0]!.fields);
        expect(h.saved().state).toBe("exited");
        expect(h.saved().sendAttempts).toBe(1);
        expect(h.saved().resultSent).toBe(true);
        expect(h.saved().completedHandoffIds).toEqual(["D1"]);
      } finally {
        write.mockRestore();
      }
    });
  });

  for (const state of ["running", "exited"] as const) {
    test(`round 2 D1 replay with ${state} record and orphan group durably refuses D2`, async () => {
      await fixture(async (h) => {
        const saved = h.seed({
          state,
          pendingResult: {
            status: "failed",
            reason: "needs_verification",
            output: "D1 output",
            truncated: false,
            summary: "D1",
            timedOut: false,
          },
          sendAttempts: 1,
        });
        const alive = spyOn(groups, "processGroupAlive");
        const original = alive.getMockImplementation()!;
        alive.mockImplementation((pgid) => pgid === saved.pgid || original(pgid));
        const kill = spyOn(groups, "killProcessGroup").mockImplementation(() => true);
        const spawn = spyOn(groups, "spawnDetachedWorker");
        try {
          await expect(
            h
              .dispatcher({}, async (id) => {
                if (id === "D2") throw new Error("D2 sink unavailable");
              })
              .dispatch({ ...h.card, dispatchHandoffId: "D2" }),
          ).rejects.toThrow("D2 sink unavailable");
          expect(spawn).not.toHaveBeenCalled();
          expect(kill).not.toHaveBeenCalled();
          expect(h.calls.map((c) => c.id)).toEqual(["D1", "D2"]);
          expect(h.calls[1]!.fields.reason).toBe("orphan_group_alive");
          expect(h.calls[1]!.fields.note).toContain(
            "previous worker processes may still be running; not resuming",
          );
          expect(h.saved().pendingResult?.reason).toBe("orphan_group_alive");
          expect(h.saved().dispatchHandoffId).toBe("D2");
          expect(h.saved().completedHandoffIds).toEqual(["D1"]);
          expect(h.saved().pgid).toBe(saved.pgid);
          await h.dispatcher().recover();
          expect(h.calls.map((c) => c.id)).toEqual(["D1", "D2", "D2"]);
          expect(h.saved().completedHandoffIds).toEqual(["D1", "D2"]);
          expect(spawn).not.toHaveBeenCalled();
        } finally {
          alive.mockRestore();
          kill.mockRestore();
          spawn.mockRestore();
        }
      });
    });
  }

  test("round 2 cold recovery with ESRCH leader and live group never signals or spawns", async () => {
    await fixture(async (h) => {
      const saved = h.seed();
      const alive = spyOn(groups, "processGroupAlive");
      const original = alive.getMockImplementation()!;
      alive.mockImplementation((pgid) => pgid === saved.pgid || original(pgid));
      const kill = spyOn(groups, "killProcessGroup").mockImplementation(() => true);
      // Keep the old unsafe reap fast so red still diagnoses the signal path.
      const now = Date.now;
      let tick = now();
      const time = spyOn(Date, "now").mockImplementation(() => (tick += 20_000));
      const spawn = spyOn(groups, "spawnDetachedWorker");
      try {
        await h.dispatcher().recover();
        expect(kill).not.toHaveBeenCalled();
        expect(spawn).not.toHaveBeenCalled();
        expect(h.calls[0]!.fields.reason).toBe("orphan_group_alive");
        expect(h.saved().pendingResult?.reason).toBe("orphan_group_alive");
        expect(h.saved().pgid).toBe(saved.pgid);
      } finally {
        alive.mockRestore();
        kill.mockRestore();
        time.mockRestore();
        spawn.mockRestore();
      }
    });
  });

  test("round 2 leader must still be alive when adoption begins", async () => {
    await fixture(async (h) => {
      const first = h.dispatcher({ FAKE_HANG: "1" });
      const pending = first.dispatch(h.card);
      await waitFor(() => first.flights().length === 1);
      await first.close();
      await pending;
      const saved = h.saved();
      let probes = 0;
      const original = process.kill;
      const probe = spyOn(process, "kill").mockImplementation((pid, signal) => {
        if (pid === saved.pid && signal === 0 && ++probes > 1)
          throw Object.assign(new Error("leader exited"), { code: "ESRCH" });
        return original(pid, signal);
      });
      const kill = spyOn(groups, "killProcessGroup").mockImplementation(() => true);
      const spawn = spyOn(groups, "spawnDetachedWorker");
      try {
        await h.dispatcher().recover();
        expect(probes).toBeGreaterThanOrEqual(2);
        expect(kill).not.toHaveBeenCalled();
        expect(spawn).not.toHaveBeenCalled();
        expect(h.calls[0]!.fields.reason).toBe("orphan_group_alive");
      } finally {
        probe.mockRestore();
        kill.mockRestore();
        spawn.mockRestore();
      }
    });
  });

  test("round 2 final spawn fence retains a group that appears during write-ahead", async () => {
    await fixture(async (h) => {
      const saved = h.seed({ state: "exited", resultSent: true, completedHandoffIds: ["D1"] });
      let alive = false;
      const probe = spyOn(groups, "processGroupAlive");
      const originalProbe = probe.getMockImplementation()!;
      probe.mockImplementation((pgid) => (pgid === saved.pgid ? alive : originalProbe(pgid)));
      const originalWrite = sessions.writeCardSessionAsync;
      const write = spyOn(sessions, "writeCardSessionAsync").mockImplementation(
        async (opts, record) => {
          await originalWrite(opts, record);
          if (record.state === "spawning") alive = true;
        },
      );
      const kill = spyOn(groups, "killProcessGroup").mockImplementation(() => true);
      const spawn = spyOn(groups, "spawnDetachedWorker");
      try {
        await h.dispatcher().dispatch({ ...h.card, dispatchHandoffId: "D2" });
        expect(alive).toBe(true);
        expect(spawn).not.toHaveBeenCalled();
        expect(kill).not.toHaveBeenCalled();
        expect(h.saved().pgid).toBe(saved.pgid);
        expect(h.saved().pendingResult?.reason).toBe("orphan_group_alive");
        expect(h.saved().completedHandoffIds).toEqual(["D1", "D2"]);
      } finally {
        probe.mockRestore();
        write.mockRestore();
        kill.mockRestore();
        spawn.mockRestore();
      }
    });
  });

  test("round 2 reaping revokes identity when the group disappears before a reused pgid is seen", async () => {
    await fixture(async (h) => {
      const d = h.dispatcher({ FAKE_HANG: "1" });
      const pending = d.dispatch(h.card);
      await waitFor(() => d.flights().length === 1);
      const saved = h.saved();
      let probes = 0;
      const probe = spyOn(groups, "processGroupAlive");
      const original = probe.getMockImplementation()!;
      probe.mockImplementation((pgid) => (pgid === saved.pgid ? ++probes !== 2 : original(pgid)));
      const kill = spyOn(groups, "killProcessGroup").mockImplementation(() => true);
      const spawn = spyOn(groups, "spawnDetachedWorker");
      try {
        process.kill(saved.pid, "SIGKILL");
        await pending;
        expect(probes).toBeGreaterThanOrEqual(3);
        expect(kill).not.toHaveBeenCalled();
        expect(spawn).not.toHaveBeenCalled();
        expect(h.calls[0]!.fields.reason).toBe("orphan_group_alive");
      } finally {
        probe.mockRestore();
        kill.mockRestore();
        spawn.mockRestore();
      }
    });
  });

  for (const failure of ["probe", "signal"] as const) {
    test(`round 3 killProcessGroup ${failure} failure revokes a flight before reaping a reused pgid`, async () => {
      await fixture(async (h) => {
        const d = h.dispatcher();
        const flight = { workerId: "saved-session", cardId: "card", agent: "claude" as const,
          pgid: 2_000_000_000 };
        // Warm the own-pgid cache before simulating only the worker group.
        expect(groups.processGroupAlive(flight.pgid)).toBe(false);
        d["active"].push(flight);
        d["verifiedFlights"].add(flight);
        let probes = 0;
        const signals: Array<string | number | undefined> = [];
        const original = process.kill;
        const kill = spyOn(process, "kill").mockImplementation((pid, signal) => {
          if (pid !== -flight.pgid) return original(pid, signal);
          if (signal === 0) {
            // The dispatcher's first probe succeeds. The helper's own probe
            // observes ESRCH, followed by a different group reusing the PGID.
            if (++probes === 2 && failure === "probe")
              throw Object.assign(new Error("group exited"), { code: "ESRCH" });
          } else {
            signals.push(signal);
            if (signal === "SIGTERM" && failure === "signal")
              throw Object.assign(new Error("group exited"), { code: "ESRCH" });
          }
          return true;
        });
        try {
          d["signalTracked"](flight, "SIGTERM");
          expect(probes).toBe(2);
          expect(groups.processGroupAlive(flight.pgid)).toBe(true);
          await d["reapGroup"](flight.pgid, flight,
            { abandoned: false } as Parameters<typeof d["reapGroup"]>[2], Date.now() - 10_000);
          expect(signals).not.toContain("SIGKILL");
          expect(d["verifiedFlights"].has(flight)).toBe(false);
        } finally {
          kill.mockRestore();
          d["active"].splice(0);
          d["verifiedFlights"].clear();
        }
      });
    });
  }

  for (const mode of ["false", "throw"] as const) {
    test(`1 claim ${mode} releases the permit with no spawn or result`, async () => {
      await fixture(async (h) => {
        const d = h.dispatcher();
        await d.dispatch({
          ...h.card,
          claim: async () => {
            if (mode === "throw") throw new Error("entry gone");
            return false;
          },
        });
        expect(listCardSessions(h.root, "worker")).toEqual([]);
        expect(h.calls).toEqual([]);
        expect(d.status().running.claude).toBe(0);
        await d.dispatch({ ...h.card, dispatchHandoffId: "next" });
        expect(h.calls.map((c) => c.id)).toEqual(["next"]);
      });
    });
  }

  test("1 completed handoffs claim for inbox cleanup; busy handoffs stay unclaimed", async () => {
    await fixture(async (h) => {
      h.seed({ state: "exited", resultSent: true, completedHandoffIds: ["D1"] });
      h.config.maxConcurrent.claude = 2;
      const d = h.dispatcher({ FAKE_DURATION_MS: "400" });
      let claims = 0;
      const claim = async () => {
        claims++;
        return true;
      };
      await d.dispatch({ ...h.card, claim });
      expect(claims).toBe(1);
      expect(h.calls).toHaveLength(0);
      const running = d.dispatch({ ...h.card, dispatchHandoffId: "D2", claim });
      await waitFor(() => d.flights().length === 1);
      await d.dispatch({ ...h.card, dispatchHandoffId: "lost", claim: async () => false });
      expect(h.calls).toHaveLength(0);
      await d.dispatch({ ...h.card, dispatchHandoffId: "D3", claim });
      expect(claims).toBe(2);
      expect(h.calls).toHaveLength(0);
      await running;
    });
  });

  for (const mode of ["local", "adopted", "already-dead"] as const) {
    const action = mode === "already-dead"
      ? "refuses an unverified group"
      : "reaps a verified group before resume/result";
    test(`3 ${mode} leader exit ${action}`, async () => {
      await fixture(async (h) => {
        const childFile = join(h.root, "child.pid");
        let pgid = 0;
        const first = h.dispatcher(
          { FAKE_HANG: "1", FAKE_SPAWN_GRANDCHILD: "1", FAKE_GRANDCHILD_PID_FILE: childFile },
          async () => {
            expect(groups.processGroupAlive(pgid)).toBe(false);
          },
        );
        const pending = first.dispatch(h.card);
        await waitFor(() => existsSync(childFile) && first.flights().length === 1);
        const leader = h.saved().pid;
        pgid = h.saved().pgid;
        // Avoid a second hanging attempt; a terminal transcript exercises result
        // delivery, and the interrupted adopted path exercises resume ordering.
        let watcher = first;
        let done = pending;
        if (mode !== "local") {
          await first.close();
          await pending;
          watcher = h.dispatcher({}, async () => {
            expect(groups.processGroupAlive(pgid)).toBe(mode === "already-dead");
          });
          if (mode === "adopted") {
            done = watcher.recover();
            await waitFor(() => watcher.flights().length === 1);
          }
        } else {
          writeFileSync(h.transcript(), terminal);
        }
        const spawn = spyOn(groups, "spawnDetachedWorker");
        const original = spawn.getMockImplementation()!;
        spawn.mockImplementation((opts) => {
          expect(groups.processGroupAlive(pgid)).toBe(false);
          return original(opts);
        });
        const kill = spyOn(groups, "killProcessGroup");
        try {
          process.kill(leader, "SIGKILL");
          if (mode === "already-dead") {
            await waitFor(() => {
              try {
                process.kill(leader, 0);
                return false;
              } catch {
                return true;
              }
            });
            done = watcher.recover();
          }
          await done;
          expect(groups.processGroupAlive(pgid)).toBe(mode === "already-dead");
          expect(h.calls).toHaveLength(1);
          if (mode === "already-dead") {
            expect(spawn).not.toHaveBeenCalled();
            expect(kill).not.toHaveBeenCalled();
            expect(h.calls[0]!.fields.reason).toBe("orphan_group_alive");
            expect(h.saved().pendingResult?.reason).toBe("orphan_group_alive");
            expect(h.saved().attempts).toBe(1);
          } else {
            expect(kill).toHaveBeenCalled();
            expect(h.calls[0]!.fields.reason).toBe("needs_verification");
            expect(h.saved().attempts).toBe(mode === "local" ? 1 : 2);
          }
        } finally {
          spawn.mockRestore();
          kill.mockRestore();
        }
      });
    }, 30_000);
  }

  for (const failReplay of [false, true]) {
    test(`4 D1 pending result and D2: replay failure=${failReplay}`, async () => {
      await fixture(async (h) => {
        const fields: HeadlessResultFields = {
          status: "failed",
          reason: "needs_verification",
          output: "D1 output",
          truncated: false,
          summary: "D1",
        };
        h.seed({ state: "exited", pendingResult: { ...fields, timedOut: false }, sendAttempts: 1 });
        const d = h.dispatcher({}, async (id) => {
          if (failReplay && id === "D1") throw new Error("D1 sink unavailable");
        });
        await d.dispatch({ ...h.card, dispatchHandoffId: "D2" });
        expect(h.calls.map((c) => c.id)).toEqual(["D1", "D2"]);
        if (failReplay) {
          expect(h.calls[1]!.fields.reason).toBe("needs_verification");
          expect(h.calls[1]!.fields.note).toContain("replay");
          expect(h.saved().dispatchHandoffId).toBe("D1");
          expect(h.saved().resultSent).toBe(false);
        } else {
          expect(h.calls[1]!.fields.output).toContain("PARTIAL_READY");
          expect(h.saved().dispatchHandoffId).toBe("D2");
          expect(h.saved().completedHandoffIds).toEqual(["D1", "D2"]);
        }
      });
    });
  }

  test("4 exhausted D1 replay budget still reports D2", async () => {
    await fixture(async (h) => {
      h.seed({
        state: "exited",
        sendAttempts: 2,
        pendingResult: {
          status: "failed",
          reason: "needs_verification",
          output: "reserved",
          summary: "",
          truncated: false,
          timedOut: false,
        },
      });
      await h.dispatcher().dispatch({ ...h.card, dispatchHandoffId: "D2" });
      expect(h.calls.map((c) => c.id)).toEqual(["D2"]);
      expect(h.calls[0]!.fields.note).toContain("replay");
      expect(h.saved().dispatchHandoffId).toBe("D1");
    });
  });

  for (const failReplay of [false, true]) {
    test(`round 3 D1 replay precedes D2 claim: replay failure=${failReplay}`, async () => {
      await fixture(async (h) => {
        h.seed({
          state: "exited",
          sendAttempts: 1,
          pendingResult: {
            status: "failed",
            reason: "needs_verification",
            output: "D1 output",
            truncated: false,
            summary: "D1",
            timedOut: false,
          },
        });
        let claims = 0;
        const order: string[] = [];
        const d = h.dispatcher({}, async (id) => {
          order.push(`send:${id}`);
          if (failReplay && id === "D1") throw new Error("D1 sink unavailable");
        });
        const log = spyOn(process.stderr, "write");
        try {
          await d.dispatch({
            ...h.card,
            dispatchHandoffId: "D2",
            claim: async () => {
              order.push("claim");
              claims++;
              return true;
            },
          });
          if (failReplay) {
            expect(claims).toBe(0);
            expect(order).toEqual(["send:D1"]);
            expect(h.calls.map((c) => c.id)).toEqual(["D1"]);
            expect(h.saved().dispatchHandoffId).toBe("D1");
            expect(h.saved().resultSent).toBe(false);
            expect(h.saved().sendAttempts).toBe(2);
            expect(log).toHaveBeenCalledWith("[headless] replay_exhausted card\n");
          } else {
            expect(claims).toBe(1);
            expect(order).toEqual(["send:D1", "claim", "send:D2"]);
            expect(h.calls.map((c) => c.id)).toEqual(["D1", "D2"]);
            expect(h.saved().completedHandoffIds).toEqual(["D1", "D2"]);
          }
        } finally {
          log.mockRestore();
        }
      });
    });
  }

  test("round 3 exhausted D1 replay budget leaves D2 unclaimed without a refusal", async () => {
    await fixture(async (h) => {
      h.seed({
        state: "exited",
        sendAttempts: 2,
        pendingResult: {
          status: "failed",
          reason: "needs_verification",
          output: "reserved D1 output",
          truncated: false,
          summary: "D1",
          timedOut: false,
        },
      });
      const before = h.saved();
      let claims = 0;
      const log = spyOn(process.stderr, "write");
      const spawn = spyOn(groups, "spawnDetachedWorker");
      try {
        await h.dispatcher().dispatch({
          ...h.card,
          dispatchHandoffId: "D2",
          claim: async () => {
            claims++;
            return true;
          },
        });
        expect(claims).toBe(0);
        expect(h.calls).toEqual([]);
        expect(h.saved()).toEqual(before);
        expect(spawn).not.toHaveBeenCalled();
        expect(log).toHaveBeenCalledWith("[headless] replay_exhausted card\n");
      } finally {
        log.mockRestore();
        spawn.mockRestore();
      }
    });
  });

  for (const elapsed of [7_300_000, 3_600_000]) {
    test(`5 resumed timer uses the retained card deadline (elapsed ${elapsed})`, async () => {
      await fixture(async (h) => {
        h.seed({ startedAt: new Date(Date.now() - elapsed).toISOString() });
        const timers: number[] = [];
        const original = globalThis.setTimeout;
        const timer = spyOn(globalThis, "setTimeout").mockImplementation(((
          fn: Parameters<typeof setTimeout>[0],
          ms?: number,
          ...args: unknown[]
        ) => {
          if (ms && ms >= 60_000) timers.push(ms);
          return original(fn, ms, ...args);
        }) as typeof setTimeout);
        try {
          await h.dispatcher({ FAKE_DURATION_MS: "100" }).recover();
          expect(timers).toHaveLength(1);
          const expected = Math.max(60_000, h.config.timeoutMs - elapsed);
          expect(timers[0]!).toBeLessThanOrEqual(expected);
          expect(timers[0]!).toBeGreaterThanOrEqual(expected - 3_000);
          expect(h.saved().attempts).toBe(2);
        } finally {
          timer.mockRestore();
        }
      });
    });
  }

  test("7 fake CLI permission denials appear in the result note", async () => {
    await fixture(async (h) => {
      await h.dispatcher({ FAKE_DENIAL: "1" }).dispatch(h.card);
      expect(h.calls[0]!.fields.note).toContain("denials: 1 (Bash)");
    });
  });

  test("7 parsed note lists unique tools (max five) ahead of a capped transcript note", async () => {
    await fixture(async (h) => {
      const names = ["Bash", "Write", "Bash", "Edit", "Read", "Glob", "Grep"];
      const raw =
        JSON.stringify({
          type: "result",
          result: "x".repeat(210_000),
          permission_denials: names.map((tool_name) => ({ tool_name })),
        }) + "\n";
      h.seed({}, raw);
      await h.dispatcher().recover();
      expect(h.calls[0]!.fields.note).toStartWith("denials: 7 (Bash, Write, Edit, Read, Glob, …)");
      expect(h.calls[0]!.fields.note!.length).toBeLessThanOrEqual(500);
    });
  });

  test("7 give-up preserves denial info ahead of stderr within the note cap", async () => {
    await fixture(async (h) => {
      const raw =
        JSON.stringify({
          type: "item.completed",
          item: {
            type: "command_execution",
            command: "touch x",
            aggregated_output: "Operation not permitted",
            exit_code: 1,
          },
        }) + "\n";
      h.card.agent = "codex";
      h.seed({ attempts: 2 }, raw);
      writeFileSync(join(dirname(h.transcript(2)), "transcript-2.stderr"), "E".repeat(400));
      await h.dispatcher().dispatch(h.card);
      expect(h.calls[0]!.fields.note).toContain("denials: 1");
      expect(h.calls[0]!.fields.note!.length).toBeLessThanOrEqual(500);
      expect(h.calls[0]!.fields.note!.indexOf("denials:")).toBeLessThan(
        h.calls[0]!.fields.note!.indexOf("last stderr:"),
      );
    });
  });
});

test("1 bridge keeps B in relay inbox while queued, dedupes polls, and drains B after restart", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "loom-0300-bridge-")));
  const oldEnv = {
    LOOM_TEST_HOME: process.env.LOOM_TEST_HOME,
    LOOM_SESSION: process.env.LOOM_SESSION,
    LOOM_NO_AUTO_HOST: process.env.LOOM_NO_AUTO_HOST,
  };
  process.env.LOOM_TEST_HOME = root;
  process.env.LOOM_SESSION = join(root, "session.json");
  process.env.LOOM_NO_AUTO_HOST = "1";
  resetStateHomeDirCache();
  setActiveProfile(null);
  const relay = new RelayServer({
    host: "127.0.0.1",
    port: 35000 + Math.floor(Math.random() * 20000),
  });
  const tower = new RelayClient({ url: relay.url });
  let bridge: Awaited<ReturnType<typeof startBridgeRuntime>> | undefined;
  let fake: Awaited<ReturnType<typeof startFakeHerdr>> | undefined;
  let stateDir = "";
  try {
    relay.start();
    const created = await tower.createRoom({
      roomName: "verify",
      displayName: "tower",
      agentKind: "shell",
      peerId: "tower",
    });
    if (created.type !== "room.state") throw new Error("create failed");
    const session: FableSession = {
      roomId: created.roomId,
      roomName: created.roomName ?? "verify",
      inviteCode: created.inviteCode!,
      peerId: "worker",
      displayName: "worker",
      color: "#0f0",
      agentKind: "shell",
      relayUrl: relay.url,
      updatedAt: new Date().toISOString(),
    };
    const socketPath = join(root, "h.sock");
    fake = await startFakeHerdr({ socketPath, autoStatus: "none" });
    const config = {
      authorizedDispatchers: ["tower"],
      herdrSocketPath: socketPath,
      agentArgv: { claude: ["claude"] },
      herdrProtocol: 17 as const,
      worker: {
        backend: "headless" as const,
        cwd: root,
        allowedRoots: [root],
        maxConcurrent: { claude: 1, codex: 1, grok: 1 },
        permissions: defaultWorkerPermissions(),
      },
    };
    const start = (session: FableSession, env: Record<string, string>) =>
      startBridgeRuntime({
        session,
        profile: "verify",
        config,
        headlessAgentCommandOverride: Object.fromEntries(
          (["claude", "codex", "grok"] as const).map((agent) => {
            const cmd = fakeCommand(agent, env);
            return [agent, [cmd.bin, ...cmd.args]];
          }),
        ) as Record<AgentKind, string[]>,
      });
    bridge = await start(session, { FAKE_DURATION_MS: "5000" });
    stateDir = loomDir();
    async function status() {
      const meta = bridge!.meta;
      const res = await fetch(`http://127.0.0.1:${meta.port}/rpc`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${meta.token}` },
        body: JSON.stringify({ op: "status" }),
      });
      return (await res.json()) as {
        headless: { running: { claude: number }; queueDepth: { claude: number } };
      };
    }
    async function dispatch(cardId: string) {
      return tower.handoff({
        to: "worker",
        body: "bounded task",
        mode: "task",
        attachments: [
          serializeCardAttachment(CARD_DISPATCH_LABEL, {
            v: CARD_CONTRACT_VERSION,
            cardId,
            sourceRoomId: session.roomId,
            prompt: "bounded task",
            agentKind: "claude",
          }),
        ],
      });
    }
    await dispatch("task_a030000000000001");
    await waitFor(() => listCardSessions(stateDir, "worker").some((r) => r.pid > 1));
    const b = await dispatch("task_b030000000000002");
    await waitFor(async () => (await status()).headless.queueDepth.claude === 1);
    // Longer than the 1.5s poll: the retained inbox entry must not dispatch twice.
    await Bun.sleep(1_650);
    expect((await status()).headless.queueDepth.claude).toBe(1);
    const inbox = relay.registry.getById(session.roomId)!.listInbox("worker");
    expect(inbox.some((e) => e.handoff.id === b.handoffId && e.status !== "claimed")).toBe(true);
    const restartSession = loadSession()!;
    await bridge.stop();
    bridge = await start(restartSession, {});
    await waitFor(
      async () =>
        (await tower.listInbox()).some((e) =>
          e.handoff.attachments?.some(
            (a) =>
              a.label === CARD_RESULT_LABEL &&
              JSON.parse(a.content).cardId === "task_b030000000000002",
          ),
        ),
      12_000,
    );
    expect(
      listCardSessions(stateDir, "worker").find((r) => r.cardId === "task_b030000000000002")!
        .attempts,
    ).toBe(1);
    expect(fake.listPaneIds()).toEqual([]);
  } finally {
    await bridge?.stop();
    if (stateDir) for (const record of listCardSessions(stateDir, "worker")) killGroup(record.pgid);
    tower.close();
    await fake?.close();
    relay.stop();
    for (const [key, value] of Object.entries(oldEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetStateHomeDirCache();
    rmSync(root, { recursive: true, force: true });
  }
}, 30_000);
