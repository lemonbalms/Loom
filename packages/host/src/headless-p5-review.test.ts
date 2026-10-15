/** P5 review regressions. Failed assertions also reap every test worker. */
import { describe, expect, spyOn, test } from "bun:test";
import * as childProcess from "node:child_process";
import * as fsPromises from "node:fs/promises";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { defaultWorkerPermissions, type AgentKind, type WorkerConfig, workerFingerprint } from "./agent-argv";
import * as sessions from "./card-session-store";
import { cardSessionPath, readCardSession, writeCardSession, type CardSessionRecord } from "./card-session-store";
import { HeadlessDispatcher, type HeadlessDispatchCard, type HeadlessResultFields } from "./headless-worker";
import * as processGroup from "./process-group";

const FAKE = join(import.meta.dir, "fake-agent-cli.ts");
const LOCK = join(tmpdir(), "loom-v030-p2-fake.lock");
type Call = { target: { roomId?: string; cardId: string; fromPeerId: string; dispatchHandoffId: string; startedAt: string }; fields: HeadlessResultFields };
type Dump = { pid: number; sessionId: string; resumeId: string; argv: string[] };

async function waitFor(pred: () => boolean, ms = 5_000): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > ms) throw new Error("waitFor timeout");
    await Bun.sleep(20);
  }
}
function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}
function killPid(pid: number): void {
  if (pid <= 1 || pid === process.pid) return;
  try { process.kill(-pid, "SIGKILL"); } catch { /* not a group leader */ }
  try { process.kill(pid, "SIGKILL"); } catch { /* already dead */ }
}
function pushEnv(extra: Record<string, string | undefined>): () => void {
  const prev = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(extra)) {
    prev.set(key, process.env[key]);
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  return () => {
    for (const [key, value] of prev) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  };
}
async function withFakeLock(fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  for (;;) {
    try { mkdirSync(LOCK); break; } catch {
      try {
        if (Date.now() - statSync(LOCK).mtimeMs > 60_000) {
          rmSync(LOCK, { recursive: true, force: true }); continue;
        }
      } catch { /* raced with the holder */ }
      if (Date.now() - start > 90_000) throw new Error("fake env lock timeout");
      await Bun.sleep(25);
    }
  }
  try { await fn(); } finally { rmSync(LOCK, { recursive: true, force: true }); }
}
function commands(script?: string): Record<AgentKind, { bin: string; args: string[] }> {
  return Object.fromEntries((["claude", "codex", "grok"] as const).map(agent => [agent,
    { bin: process.execPath, args: [script ?? FAKE, "--fake-kind", agent] },
  ])) as Record<AgentKind, { bin: string; args: string[] }>;
}
function fingerprint(config: WorkerConfig): string {
  return workerFingerprint(config);
}
function terminal(agent: AgentKind, usage = true): string {
  const event = agent === "claude" ? { type: "result", result: "saved terminal", session_id: "real-session" }
    : agent === "codex" ? { type: "turn.completed" }
    : { type: "end", sessionId: "real-session" };
  const prefix = agent === "codex" ? '{"type":"item.completed","item":{"type":"agent_message","text":"saved terminal"}}\n'
    : agent === "grok" ? '{"type":"text","data":"saved terminal"}\n' : "";
  return prefix + JSON.stringify({ ...event, ...(usage ? { usage: { input_tokens: 1 } } : {}) }) + "\n";
}

class Harness {
  readonly root = realpathSync(mkdtempSync(join(tmpdir(), "loom-p5-")));
  readonly loomDir = join(this.root, "loom");
  readonly cwd = join(this.root, "a");
  readonly other = join(this.root, "b");
  readonly dump = join(this.root, "argv.jsonl");
  readonly dispatchers: HeadlessDispatcher[] = [];
  readonly pids: number[] = [];
  readonly calls: Call[] = [];
  readonly config: WorkerConfig = {
    backend: "headless", cwd: this.cwd, allowedRoots: [this.root],
    maxConcurrent: { claude: 1, codex: 1, grok: 1 }, timeoutMs: 30_000,
    permissions: defaultWorkerPermissions(),
  };
  readonly card: HeadlessDispatchCard = {
    roomId: "room_p5", cardId: "task_p5", agent: "claude", prompt: "continue the bounded task",
    fromPeerId: "original-peer", dispatchHandoffId: "original-handoff",
  };
  constructor() {
    for (const dir of [this.loomDir, this.cwd, this.other]) mkdirSync(dir);
  }
  lines(): Dump[] {
    return existsSync(this.dump) ? readFileSync(this.dump, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line)) : [];
  }
  saved(): CardSessionRecord | null { return readCardSession({ loomDir: this.loomDir, localPeerId: "test-local-peer", ...this.card }); }
  path(record: Pick<HeadlessDispatchCard, "roomId" | "agent" | "cardId"> = this.card, attempts = 1): string {
    return join(dirname(cardSessionPath({ loomDir: this.loomDir, localPeerId: "test-local-peer", ...record })), "transcript-" + attempts + ".jsonl");
  }
  seed(over: Partial<CardSessionRecord> = {}, raw = ""): CardSessionRecord {
    const record: CardSessionRecord = {
      ...this.card, cwd: this.cwd, requestedCwd: null, sessionId: "saved-session", promptFingerprint: fingerprint(this.config),
      attempts: 1, pid: 2_000_000_000, pgid: 2_000_000_000, startedAt: new Date().toISOString(),
      state: "running", resultSent: false, procStartedAt: "Thu Oct 15 00:00:00 2026", sendAttempts: 0, completedHandoffIds: [], ...over,
    };
    writeCardSession({ loomDir: this.loomDir, localPeerId: "test-local-peer" }, record);
    writeFileSync(this.path(record, record.attempts), raw);
    return record;
  }
  dispatcher(sink?: (target: Call["target"], fields: HeadlessResultFields) => Promise<unknown>, script?: string): HeadlessDispatcher {
    const dispatcher = new HeadlessDispatcher({ config: this.config, loomDir: this.loomDir, localPeerId: "test-local-peer", node: "bridge-node", commands: commands(script), sink: {
      composeAndSend: async (target, fields) => {
        this.calls.push({ target, fields });
        return sink ? sink(target, fields) : { status: "delivered" };
      },
    } });
    this.dispatchers.push(dispatcher);
    return dispatcher;
  }
  sleeper(): number {
    const child = childProcess.spawn("/bin/sleep", ["30"], { detached: true, stdio: "ignore" });
    const pid = child.pid!;
    this.pids.push(pid);
    return pid;
  }
  lstart(pid: number): string {
    return childProcess.execFileSync("/bin/ps", ["-o", "lstart=", "-p", String(pid)], {
      encoding: "utf8", env: { ...process.env, LC_ALL: "C", LANG: "C", TZ: "UTC" },
    }).trim();
  }
}
async function fixture(fn: (h: Harness) => Promise<void>, extra: Record<string, string | undefined> = {}): Promise<void> {
  await withFakeLock(async () => {
    const h = new Harness();
    const restore = pushEnv({
      FAKE_OUTPUT_BYTES: "8", FAKE_DURATION_MS: "0", FAKE_TIME_SCALE: "1", FAKE_ARGV_DUMP: h.dump,
      FAKE_HANG: undefined, FAKE_EXIT_ONCE_MARKER: undefined, FAKE_SPAWN_GRANDCHILD: undefined,
      FAKE_DENIAL: undefined, FAKE_ENV_DUMP: undefined, FAKE_PROMPT_DUMP: undefined,
      FAKE_GRANDCHILD_PID_FILE: undefined, FAKE_KIND: undefined, ...extra,
    });
    try { await fn(h); } finally {
      try {
        for (const dispatcher of h.dispatchers) await dispatcher.close();
        const recorded = existsSync(join(h.loomDir, "cards")) ? sessions.listCardSessions(h.loomDir, "test-local-peer") : [];
        const tracked = [...new Set([...h.pids, ...h.lines().map(line => line.pid), ...recorded.flatMap(r => [r.pid, r.pgid])])];
        for (const pid of tracked) killPid(pid);
        await waitFor(() => tracked.every(pid => pid <= 1 || !alive(pid)), 3_000);
      } finally {
        restore();
        rmSync(h.root, { recursive: true, force: true });
      }
    }
  });
}

describe("headless P5 review", () => {
  test("H1 ps failure stays unknown, never spawns or signals a live worker", async () => {
    await fixture(async h => {
      const pid = h.sleeper();
      h.seed({ pid, pgid: pid, procStartedAt: h.lstart(pid) });
      const ps = spyOn(childProcess, "execFileSync").mockImplementation(() => { throw new Error("ps unavailable/timeout"); });
      try {
        await h.dispatcher().recover();
        expect(h.lines()).toHaveLength(0);
        expect(h.calls).toHaveLength(1);
        expect(h.calls[0]!.fields.reason).toBe("orphan_group_alive");
        expect(ps.mock.calls.length).toBeGreaterThanOrEqual(5);
        expect(alive(pid)).toBe(true);
        // Giving up does not allow a new dispatch beside the same live pid.
        await h.dispatcher().dispatch({ ...h.card, dispatchHandoffId: "next-handoff" });
        expect(h.lines()).toHaveLength(0);
        expect(h.calls[1]!.fields.reason).toBe("orphan_group_alive");
      } finally { ps.mockRestore(); }
    });
  });

  test("H1 kill(0) permission errors are unknown even if ps is available", async () => {
    await fixture(async h => {
      const pid = h.sleeper();
      h.seed({ pid, pgid: pid, procStartedAt: h.lstart(pid) });
      const original = process.kill;
      const kill = spyOn(process, "kill").mockImplementation((target, signal) => {
        if (target === pid && signal === 0) throw Object.assign(new Error("denied"), { code: "EPERM" });
        return original(target, signal);
      });
      // Also bound the old implementation's adopt wait during red-before.
      const release = setTimeout(() => killPid(pid), 700);
      try {
        await h.dispatcher().recover();
        expect(h.lines()).toHaveLength(0);
        expect(h.calls[0]!.fields.reason).toBe("orphan_group_alive");
      } finally { clearTimeout(release); kill.mockRestore(); }
      expect(alive(pid)).toBe(true);
    });
  });

  test("H1 a transient ps failure recovers observation without starting a worker", async () => {
    await fixture(async h => {
      const pid = h.sleeper();
      h.seed({ pid, pgid: pid, procStartedAt: h.lstart(pid) }, terminal("claude"));
      const original = childProcess.execFileSync;
      let failed = false;
      let observations = 0;
      const ps = spyOn(childProcess, "execFileSync").mockImplementation(((...args: unknown[]) => {
        if (!failed) { failed = true; throw new Error("transient ps failure"); }
        const result = Reflect.apply(original, childProcess, args);
        observations += 1;
        return result;
      }) as typeof original);
      try {
        const dispatcher = h.dispatcher();
        const pending = dispatcher.recover();
        await waitFor(() => observations >= 2 && dispatcher.flights().length === 1);
        expect(alive(pid)).toBe(true);
        killPid(pid);
        await pending;
        expect(failed).toBe(true);
        expect(h.lines()).toHaveLength(0);
        expect(h.calls).toHaveLength(1);
        expect(h.calls[0]!.fields.output).toBe("saved terminal");
      } finally { ps.mockRestore(); }
    });
  });

  test("H1 malformed ps timestamps are unknown rather than evidence of pid reuse", async () => {
    await fixture(async h => {
      const pid = h.sleeper();
      h.seed({ pid, pgid: pid, procStartedAt: h.lstart(pid) });
      const ps = spyOn(childProcess, "execFileSync").mockReturnValue("Thu Foo 15 99:00:00 2026" as never);
      try {
        await h.dispatcher().recover();
        expect(h.lines()).toHaveLength(0);
        expect(h.calls[0]!.fields.reason).toBe("orphan_group_alive");
        expect(alive(pid)).toBe(true);
      } finally { ps.mockRestore(); }
    });
  });

  test("H1 identity comparison survives a timezone change between capture and adopt", async () => {
    await fixture(async h => {
      const restore = pushEnv({ TZ: "Pacific/Honolulu" });
      try {
        process.env.FAKE_DURATION_MS = "800";
        const first = h.dispatcher();
        const pending = first.dispatch(h.card);
        await waitFor(() => h.lines().length === 1);
        expect(h.saved()!.procStartedAt).toBe(h.lstart(h.lines()[0]!.pid));
        await first.close();
        await pending;
        process.env.TZ = "Europe/Berlin";
        await h.dispatcher().dispatch(h.card);
        expect(h.lines()).toHaveLength(1);
        expect(h.calls).toHaveLength(1);
      } finally { restore(); }
    });
  });

  test("H1 a canonical start-time mismatch detects pid reuse without signaling that pid", async () => {
    await fixture(async h => {
      const pid = h.sleeper();
      const actual = h.lstart(pid);
      h.seed({ pid, pgid: pid, procStartedAt: "Sat Jan  1 00:00:00 2000" });
      expect(actual).not.toBe(h.saved()!.procStartedAt);
      await h.dispatcher().recover();
      expect(h.lines()).toHaveLength(0);
      expect(h.saved()!.attempts).toBe(1);
      expect(h.calls).toHaveLength(1);
      expect(h.calls[0]!.fields.reason).toBe("orphan_group_alive");
      expect(alive(pid)).toBe(true);
    });
  });

  test("H2 completed dispatch redelivery is inert; a different completed handoff is fresh", async () => {
    await fixture(async h => {
      await h.dispatcher().dispatch(h.card);
      const completed = h.saved()!;
      const log = spyOn(process.stderr, "write").mockImplementation(() => true);
      try {
        await h.dispatcher().dispatch(h.card);
        expect(log.mock.calls.some(([text]) => String(text).includes("already_completed"))).toBe(true);
      } finally { log.mockRestore(); }
      expect(h.lines()).toHaveLength(1);
      expect(h.calls).toHaveLength(1);
      expect(h.saved()).toEqual(completed);
      await h.dispatcher().dispatch({ ...h.card, dispatchHandoffId: "new-completed-dispatch" });
      expect(h.lines()).toHaveLength(2);
      expect(h.lines()[1]!.sessionId).not.toBe(completed.sessionId);
      expect(h.calls).toHaveLength(2);
    });
  });

  test("H3 adopted incomplete exit rechecks cwd before any resume", async () => {
    await fixture(async h => {
      const pid = h.sleeper();
      h.seed({ pid, pgid: pid, procStartedAt: h.lstart(pid) });
      h.config.cwd = h.other;
      const dispatcher = h.dispatcher();
      const pending = dispatcher.dispatch(h.card);
      await waitFor(() => dispatcher.flights().length === 1);
      killPid(pid);
      await pending;
      expect(h.lines()).toHaveLength(0);
      expect(h.calls[0]!.fields.status).toBe("failed");
      expect(h.calls[0]!.fields.reason).toBe("needs_verification");
      expect(h.calls[0]!.fields.note).toContain("cwd_changed");
      expect(h.saved()!.attempts).toBe(1);
    });
  });

  test("H3 adopted incomplete exit rechecks fingerprint and spends the next durable attempt", async () => {
    await fixture(async h => {
      const pid = h.sleeper();
      const old = h.seed({ pid, pgid: pid, procStartedAt: h.lstart(pid), promptFingerprint: "old-profile" });
      const dispatcher = h.dispatcher();
      const pending = dispatcher.dispatch(h.card);
      await waitFor(() => dispatcher.flights().length === 1);
      killPid(pid);
      await pending;
      expect(h.lines()).toHaveLength(1);
      expect(h.lines()[0]!.resumeId).toBe("");
      expect(h.lines()[0]!.sessionId).not.toBe(old.sessionId);
      expect(h.saved()!.attempts).toBe(2);
      expect(h.calls).toHaveLength(1);
    });
  });

  test("H4 recover resolves a null requestedCwd using the current config", async () => {
    await fixture(async h => {
      h.seed({ requestedCwd: null });
      h.config.cwd = h.other;
      await h.dispatcher().recover();
      expect(h.lines()).toHaveLength(0);
      expect(h.calls).toHaveLength(1);
      expect(h.calls[0]!.fields.status).toBe("failed");
      expect(h.calls[0]!.fields.reason).toBe("needs_verification");
      expect(h.calls[0]!.fields.note).toContain("cwd_changed");
    });
  });

  test("H4 recover revalidates an explicit requested path and its current symlink target", async () => {
    await fixture(async h => {
      const link = join(h.root, "requested");
      symlinkSync(h.cwd, link);
      h.seed({ requestedCwd: link });
      unlinkSync(link);
      symlinkSync(h.other, link);
      await h.dispatcher().recover();
      expect(h.lines()).toHaveLength(0);
      expect(h.calls[0]!.fields.status).toBe("failed");
      expect(h.calls[0]!.fields.reason).toBe("needs_verification");
      expect(h.calls[0]!.fields.note).toContain("cwd_changed");
    });
  });

  test("H5 a dead worker's terminal transcript is delivered before considering resume", async () => {
    await fixture(async h => {
      h.seed({}, terminal("claude"));
      await h.dispatcher().recover();
      expect(h.lines()).toHaveLength(0);
      expect(h.calls).toHaveLength(1);
      expect(h.calls[0]!.fields.output).toBe("saved terminal");
      expect(h.saved()!.attempts).toBe(1);
      expect(h.saved()!.resultSent).toBe(true);
    });
  });

  test("H6 attempts/session are durable before both spawns; pid/start time precede stdin", async () => {
    await fixture(async h => {
      process.env.FAKE_EXIT_ONCE_MARKER = join(h.root, "exit-once");
      const beforeSpawn: Array<CardSessionRecord | null> = [];
      const beforeStdin: Array<CardSessionRecord | null> = [];
      const observedBeforeStdin: string[] = [];
      const original = processGroup.spawnDetachedWorker;
      const spawn = spyOn(processGroup, "spawnDetachedWorker").mockImplementation(opts => {
        beforeSpawn.push(h.saved());
        const worker = original(opts);
        const stdin = worker.child.stdin!;
        const end = stdin.end.bind(stdin);
        const intercepted = ((...args: unknown[]) => {
          const saved = h.saved()!;
          beforeStdin.push(saved);
          observedBeforeStdin.push(h.lstart(saved.pid));
          return Reflect.apply(end, stdin, args);
        }) as typeof stdin.end;
        spyOn(stdin, "end").mockImplementation(intercepted);
        return worker;
      });
      try {
        await h.dispatcher().dispatch(h.card);
        expect(beforeSpawn).toHaveLength(2);
        for (let i = 0; i < 2; i++) {
          expect(beforeSpawn[i]!.attempts).toBe(i + 1);
          expect(beforeSpawn[i]!.state).toBe("spawning");
          expect(beforeSpawn[i]!.pid).toBe(0);
          expect(beforeStdin[i]!.attempts).toBe(i + 1);
          expect(beforeStdin[i]!.pid).toBeGreaterThan(1);
          expect(beforeStdin[i]!.procStartedAt.length).toBeGreaterThan(0);
          expect(beforeStdin[i]!.procStartedAt).toBe(observedBeforeStdin[i]);
        }
        expect(beforeSpawn[1]!.sessionId).toBe(beforeSpawn[0]!.sessionId);
        expect(h.calls).toHaveLength(1);
      } finally { spawn.mockRestore(); }
    });
  });

  for (const attempts of [1, 2]) {
    test("H6/H-B pidless spawning gives up with spawn_state_unknown (attempt " + attempts + ")", async () => {
      await fixture(async h => {
        h.seed({ state: "spawning", attempts, pid: 0, pgid: 0, procStartedAt: "" });
        await h.dispatcher().recover();
        expect(h.lines()).toHaveLength(0);
        expect(h.saved()!.attempts).toBe(attempts);
        expect(h.saved()!.resultSent).toBe(true);
        expect(h.calls).toHaveLength(1);
        expect(h.calls[0]!.fields.status).toBe("failed");
        expect(h.calls[0]!.fields.reason).toBe("spawn_state_unknown");
      });
    });
  }

  test("M1 codex real thread id is durable while the process is still running", async () => {
    await fixture(async h => {
      h.card.agent = "codex";
      process.env.FAKE_DURATION_MS = "5000";
      const dispatcher = h.dispatcher();
      const pending = dispatcher.dispatch(h.card);
      await waitFor(() => h.lines().length === 1 && existsSync(h.path()) && readFileSync(h.path(), "utf8").includes("thread.started"));
      const real = h.lines()[0]!;
      await waitFor(() => h.saved()?.sessionId === real.sessionId, 1_000);
      expect(alive(real.pid)).toBe(true);
      await dispatcher.close();
      await pending;
      expect(h.saved()!.sessionId).toBe(real.sessionId);
      expect(h.calls).toHaveLength(0);
    });
  });

  test("M1 adopted claude init updates the durable session before exit", async () => {
    await fixture(async h => {
      const pid = h.sleeper();
      h.seed({ pid, pgid: pid, procStartedAt: h.lstart(pid) },
        '{"type":"system","subtype":"init","session_id":"real-claude"}\n');
      const dispatcher = h.dispatcher();
      const pending = dispatcher.dispatch(h.card);
      await waitFor(() => h.saved()?.sessionId === "real-claude", 1_000);
      expect(alive(pid)).toBe(true);
      await dispatcher.close();
      await pending;
      expect(h.saved()!.sessionId).toBe("real-claude");
      expect(h.calls).toHaveLength(0);
    });
  });

  test("M1 close cancels a parked transcript read and prevents a late session write", async () => {
    await fixture(async h => {
      h.card.agent = "codex";
      process.env.FAKE_DURATION_MS = "5000";
      const original = fsPromises.readFile;
      let reads = 0;
      let release = (_raw: string): void => {};
      const read = spyOn(fsPromises, "readFile").mockImplementation(((...args: unknown[]) => {
        if (String(args[0]) === h.path() && ++reads === 2) {
          return new Promise<string>(resolve => { release = resolve; });
        }
        return Reflect.apply(original, fsPromises, args);
      }) as typeof original);
      const dispatcher = h.dispatcher();
      const pending = dispatcher.dispatch(h.card);
      try {
        await waitFor(() => reads >= 2, 1_000);
        const closed = await Promise.race([
          dispatcher.close().then(() => true),
          Bun.sleep(1_000).then(() => false),
        ]);
        expect(closed).toBe(true);
        await pending;
        const saved = h.saved();
        release('{"type":"thread.started","thread_id":"late-thread"}\n');
        await Bun.sleep(50);
        expect(h.saved()).toEqual(saved);
        expect(h.calls).toHaveLength(0);
      } finally {
        release("");
        read.mockRestore();
      }
    });
  });

  for (const retryFails of [false, true]) {
    test("M2 exited unsent result retries once; retry fails=" + retryFails, async () => {
      await fixture(async h => {
        const fail = async (): Promise<never> => { throw new Error("sink unavailable"); };
        await expect(h.dispatcher(fail).dispatch(h.card)).rejects.toThrow("sink unavailable");
        expect(h.saved()!.state).toBe("exited");
        expect(h.saved()!.resultSent).toBe(false);
        expect(h.saved()!.sendAttempts).toBe(1);
        const recover = h.dispatcher(async () => {
          // Counter reservation and resultSent=false must precede the send.
          expect(h.saved()!.resultSent).toBe(false);
          expect(h.saved()!.sendAttempts).toBe(2);
          if (retryFails) throw new Error("sink still unavailable");
        });
        await recover.recover();
        await h.dispatcher().recover();
        expect(h.lines()).toHaveLength(1);
        expect(h.calls).toHaveLength(2);
        expect(h.saved()!.sendAttempts).toBe(2);
        expect(h.saved()!.resultSent).toBe(!retryFails);
        expect(h.calls[1]!.fields.output).toBe(h.calls[0]!.fields.output);
      });
    });
  }

  for (const agent of ["claude", "codex", "grok"] as const) {
    test("M3 " + agent + " terminal event completes without usage (or grok session metadata)", async () => {
      await fixture(async h => {
        h.card.agent = agent;
        // Keep the real fake CLI and its argv/env behavior; filter only optional
        // terminal metadata, which the fake's existing knobs cannot omit.
        const script = join(h.root, "without-usage.ts");
        writeFileSync(script, [
          'import { spawn } from "node:child_process";',
          'const child = spawn(process.execPath, [' + JSON.stringify(FAKE) + ', ...process.argv.slice(2)], { stdio: ["inherit", "pipe", "inherit"] });',
          'let raw = "";',
          'for await (const chunk of child.stdout) {',
          '  raw += chunk.toString();',
          '  let newline;',
          '  while ((newline = raw.indexOf("\\n")) >= 0) {',
          '    const event = JSON.parse(raw.slice(0, newline)); raw = raw.slice(newline + 1);',
          '    delete event.usage; if (event.type === "end") delete event.sessionId;',
          '    process.stdout.write(JSON.stringify(event) + "\\n");',
          '  }',
          '}',
        ].join("\n"));
        await h.dispatcher(undefined, script).dispatch(h.card);
        expect(h.lines()).toHaveLength(1);
        expect(h.saved()!.attempts).toBe(1);
        expect(h.calls).toHaveLength(1);
        expect(h.calls[0]!.fields.status).toBe("failed");
        expect(h.calls[0]!.fields.reason).toBe("needs_verification");
        expect(h.calls[0]!.fields.output).toContain("PARTIAL_READY");
      });
    });
  }

  test("M4 an adopted result uses all five durable target fields", async () => {
    await fixture(async h => {
      const pid = h.sleeper();
      const record = h.seed({ pid, pgid: pid, procStartedAt: h.lstart(pid) }, terminal("claude"));
      const dispatcher = h.dispatcher();
      const pending = dispatcher.dispatch({ ...h.card, fromPeerId: "redelivery-peer" });
      await waitFor(() => dispatcher.flights().length === 1);
      killPid(pid);
      await pending;
      expect(h.lines()).toHaveLength(0);
      expect(h.calls).toHaveLength(1);
      expect(h.calls[0]!.target).toEqual({
        roomId: record.roomId, cardId: record.cardId, fromPeerId: record.fromPeerId,
        dispatchHandoffId: record.dispatchHandoffId, startedAt: record.startedAt,
      });
    });
  });

  test("M4 a dead worker's saved result also belongs to the original dispatch", async () => {
    await fixture(async h => {
      const record = h.seed({}, terminal("claude"));
      await h.dispatcher().dispatch({ ...h.card, fromPeerId: "new-peer", dispatchHandoffId: "new-handoff" });
      expect(h.lines()).toHaveLength(0);
      expect(h.calls).toHaveLength(1);
      expect(h.calls[0]!.fields.output).toBe("saved terminal");
      expect(h.calls[0]!.target).toEqual({
        roomId: record.roomId, cardId: record.cardId, fromPeerId: record.fromPeerId,
        dispatchHandoffId: record.dispatchHandoffId, startedAt: record.startedAt,
      });
    });
  });

  test("M5 malformed records are counted/skipped and per-record sink errors do not abort recover", async () => {
    await fixture(async h => {
      const invalid = h.seed({ cardId: "invalid" });
      const path = cardSessionPath({ loomDir: h.loomDir, localPeerId: "test-local-peer", ...invalid });
      const partial = { ...invalid } as Partial<CardSessionRecord>;
      delete partial.procStartedAt;
      writeFileSync(path, JSON.stringify(partial));
      const corrupt = h.seed({ cardId: "corrupt" });
      writeFileSync(cardSessionPath({ loomDir: h.loomDir, localPeerId: "test-local-peer", ...corrupt }), "{bad json");
      h.seed({ cardId: "sink-fails", attempts: 2 }, terminal("claude"));
      h.seed({ cardId: "good", attempts: 2 }, terminal("claude"));
      const before = sessions.cardSessionDiagnostics.invalidRecords;
      const stderr = spyOn(process.stderr, "write").mockImplementation(() => true);
      try {
        expect(sessions.listCardSessions(h.loomDir, "test-local-peer").map(r => r.cardId).sort()).toEqual(["good", "sink-fails"]);
        expect(sessions.cardSessionDiagnostics.invalidRecords - before).toBe(2);
        expect(stderr.mock.calls.filter(([s]) => String(s).includes("invalid session record"))).toHaveLength(2);
        const dispatcher = h.dispatcher(async target => {
          if (target.cardId === "sink-fails") throw new Error("isolated failure");
        });
        await expect(dispatcher.recover()).resolves.toBeUndefined();
        expect(h.calls.map(c => c.target.cardId).sort()).toEqual(["good", "sink-fails"]);
        expect(h.lines()).toHaveLength(0);
        expect(readCardSession({ loomDir: h.loomDir, localPeerId: "test-local-peer", ...h.card, cardId: "good" })!.resultSent).toBe(true);
      } finally { stderr.mockRestore(); }
    });
  });

  test("M5 every required field must be present; incomplete records never recover or spawn", async () => {
    await fixture(async h => {
      const required: (keyof CardSessionRecord)[] = [
        "agent", "cwd", "requestedCwd", "sessionId", "promptFingerprint", "attempts", "pid", "pgid",
        "startedAt", "state", "resultSent", "roomId", "cardId", "fromPeerId", "dispatchHandoffId",
        "procStartedAt", "sendAttempts",
      ];
      const paths: string[] = [];
      for (const field of required) {
        const record = h.seed({ cardId: "missing-" + field });
        const path = cardSessionPath({ loomDir: h.loomDir, localPeerId: "test-local-peer", ...record });
        const partial: Partial<CardSessionRecord> = { ...record };
        delete partial[field];
        writeFileSync(path, JSON.stringify(partial));
        paths.push(path);
      }
      const before = sessions.cardSessionDiagnostics.invalidRecords;
      const stderr = spyOn(process.stderr, "write").mockImplementation(() => true);
      try {
        await h.dispatcher().recover();
        expect(sessions.cardSessionDiagnostics.invalidRecords - before).toBe(required.length);
        const logs = stderr.mock.calls.map(([text]) => String(text));
        expect(logs).toHaveLength(required.length);
        for (const path of paths) expect(logs).toContain(`[headless] invalid session record: ${path}\n`);
        expect(h.calls).toHaveLength(0);
        expect(h.lines()).toHaveLength(0);

        for (const field of required) {
          expect(readCardSession({ loomDir: h.loomDir, localPeerId: "test-local-peer", ...h.card, cardId: "missing-" + field })).toBeNull();
        }
        expect(sessions.cardSessionDiagnostics.invalidRecords - before).toBe(required.length * 2);
        expect(stderr.mock.calls).toHaveLength(required.length * 2);

        // A direct dispatch must also reject the invalid record, rather than
        // treating it as missing and starting a replacement worker.
        await expect(h.dispatcher().dispatch({ ...h.card, cardId: "missing-sendAttempts" })).rejects.toThrow("Invalid session record");
        expect(sessions.cardSessionDiagnostics.invalidRecords - before).toBe(required.length * 2 + 1);
        expect(stderr.mock.calls).toHaveLength(required.length * 2 + 1);
        expect(h.calls).toHaveLength(0);
        expect(h.lines()).toHaveLength(0);
      } finally {
        for (const path of paths) rmSync(dirname(path), { recursive: true, force: true });
        stderr.mockRestore();
      }
    });
  });
});
