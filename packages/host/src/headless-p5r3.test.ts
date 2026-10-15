/** Architect ruling 2026-10-15: crash-consistent peer-scoped resume/adopt. */
import { describe, expect, spyOn, test } from "bun:test";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ARGV_TEMPLATE_VERSION, HEADLESS_WORKER_HINT, defaultWorkerPermissions, promptFingerprint, type WorkerConfig } from "./agent-argv";
import * as sessions from "./card-session-store";
import { type CardSessionRecord } from "./card-session-store";
import { HeadlessDispatcher, type HeadlessDispatchCard, type HeadlessResultFields } from "./headless-worker";
import * as processGroup from "./process-group";

const sha16 = (value: string): string => createHash("sha256").update(value).digest("hex").slice(0, 16);
const terminal = JSON.stringify({ type: "result", result: "original output", session_id: "original-session" }) + "\n";
type Call = { target: { dispatchHandoffId: string }; fields: HeadlessResultFields };

class Harness {
  readonly root = realpathSync(mkdtempSync(join(tmpdir(), "loom-p5r3-")));
  readonly loomDir = join(this.root, "loom");
  readonly cwd = join(this.root, "a");
  readonly other = join(this.root, "b");
  readonly calls: Call[] = [];
  readonly workers: number[] = [];
  readonly dispatchers: HeadlessDispatcher[] = [];
  readonly config: WorkerConfig = {
    backend: "headless", cwd: this.cwd, allowedRoots: [this.root],
    maxConcurrent: { claude: 1, codex: 1, grok: 1 }, timeoutMs: 3_000,
    permissions: defaultWorkerPermissions(),
  };
  readonly card: HeadlessDispatchCard = {
    roomId: "r", cardId: "c", agent: "claude", prompt: "bounded task",
    fromPeerId: "sender", dispatchHandoffId: "D1",
  };
  beforeSend?: (fields: HeadlessResultFields) => void;
  spawns = 0;
  readonly spawn = spyOn(processGroup, "spawnDetachedWorker");
  constructor() {
    for (const path of [this.loomDir, this.cwd, this.other]) mkdirSync(path);
    const original = this.spawn.getMockImplementation()!;
    this.spawn.mockImplementation(opts => {
      this.spawns++;
      const worker = original(opts);
      this.workers.push(worker.pid);
      return worker;
    });
  }
  key(peer = "peer-a") { return { loomDir: this.loomDir, localPeerId: peer, ...this.card }; }
  saved(peer = "peer-a") { return sessions.readCardSession(this.key(peer))!; }
  transcript(peer = "peer-a") { return join(dirname(sessions.cardSessionPath(this.key(peer))), "transcript-1.jsonl"); }
  seed(over: Partial<CardSessionRecord> = {}, peer = "peer-a", raw = "") {
    const record: CardSessionRecord = {
      ...this.card, cwd: this.cwd, requestedCwd: null, sessionId: "saved-session",
      promptFingerprint: promptFingerprint(HEADLESS_WORKER_HINT, this.config.permissions, ARGV_TEMPLATE_VERSION),
      attempts: 1, pid: 2_000_000_000, pgid: 2_000_000_000, startedAt: new Date().toISOString(),
      state: "running", resultSent: false, procStartedAt: "Thu Oct 15 00:00:00 2026", sendAttempts: 0,
      completedHandoffIds: [], ...over,
    };
    sessions.writeCardSession({ loomDir: this.loomDir, localPeerId: peer }, record);
    writeFileSync(this.transcript(peer), raw);
    return record;
  }
  dispatcher(peer = "peer-a", failSend = false, script = `process.stdout.write(${JSON.stringify(terminal)})`) {
    const scriptPath = join(this.root, `worker-${this.dispatchers.length}.ts`);
    writeFileSync(scriptPath, script);
    const command = { bin: process.execPath, args: [scriptPath] };
    const d = new HeadlessDispatcher({
      config: this.config, loomDir: this.loomDir, localPeerId: peer, node: "node",
      commands: { claude: command, codex: command, grok: command },
      sink: { composeAndSend: async (target, fields) => {
        this.calls.push({ target, fields: structuredClone(fields) });
        this.beforeSend?.(fields);
        if (failSend) throw new Error("crash during send");
      } },
    });
    this.dispatchers.push(d);
    return d;
  }
  async cleanup() {
    await Promise.all(this.dispatchers.map(d => d.close()));
    this.spawn.mockRestore();
    for (const pid of this.workers) {
      if (pid <= 1) continue;
      try { process.kill(-pid, "SIGKILL"); } catch { /* already reaped */ }
    }
    rmSync(this.root, { recursive: true, force: true });
  }
}
async function fixture(fn: (h: Harness) => Promise<void>) {
  const h = new Harness();
  try { await fn(h); } finally { await h.cleanup(); }
}

describe("headless P5 round 3 architect decisions", () => {
  test("H-A same card under different peers has independent records, transcripts and recovery", async () => {
    await fixture(async h => {
      h.seed({ dispatchHandoffId: "A" }, "peer-a", terminal);
      h.seed({ dispatchHandoffId: "B" }, "peer-b", terminal.replace("original output", "peer B output"));
      expect(sessions.cardSessionPath(h.key())).toBe(join(h.loomDir, "cards", sha16("peer-a"), sessions.cardKeyHash("r", "claude", "c"), "session.json"));
      expect(sessions.listCardSessions(h.loomDir, "peer-a").map(r => r.dispatchHandoffId)).toEqual(["A"]);
      expect(sessions.listCardSessions(h.loomDir, "peer-b").map(r => r.dispatchHandoffId)).toEqual(["B"]);
      await h.dispatcher().recover();
      expect(h.calls.map(c => c.target.dispatchHandoffId)).toEqual(["A"]);
      expect(h.saved("peer-b").resultSent).toBe(false);
      await h.dispatcher("peer-b").recover();
      expect(h.calls.map(c => c.fields.output)).toEqual(["original output", "peer B output"]);
      expect(h.spawns).toBe(0);
    });
  });

  for (const entry of ["redelivery", "recover"] as const) {
    test("H-B pidless spawning is uncertain, never retried: " + entry, async () => {
      await fixture(async h => {
        h.seed({ state: "spawning", pid: 0, pgid: 0, procStartedAt: "" });
        const kill = spyOn(process, "kill");
        try {
          const d = h.dispatcher();
          if (entry === "recover") await d.recover(); else await d.dispatch(h.card);
          expect(h.spawns).toBe(0);
          expect(kill.mock.calls).toHaveLength(0);
          expect(h.calls).toHaveLength(1);
          expect(h.calls[0]!.fields.reason).toBe("spawn_state_unknown");
          expect(h.calls[0]!.fields.note).toContain("not spawning");
          expect(h.saved().resultSent).toBe(true);
          expect(h.saved().attempts).toBe(1);
          await d.recover();
          await d.dispatch(h.card);
          expect(h.calls).toHaveLength(1);
        } finally { kill.mockRestore(); }
      });
    });
  }

  test("H-B pid and pgid persistence is synchronous before yielding after spawn", async () => {
    await fixture(async h => {
      let checked = false;
      const original = h.spawn.getMockImplementation()!;
      h.spawn.mockImplementation(opts => {
        const worker = original(opts);
        queueMicrotask(() => {
          const record = h.saved();
          checked = record.pid === worker.pid && record.pgid === worker.pgid;
        });
        return worker;
      });
      await h.dispatcher().dispatch(h.card);
      expect(checked).toBe(true);
    });
  });

  test("H-C D1, D2, late D1 is suppressed even after restart; keep last 16 completions", async () => {
    await fixture(async h => {
      h.seed({ state: "exited", pid: 0, pgid: 0, resultSent: true,
        dispatchHandoffId: "older-15", completedHandoffIds: Array.from({ length: 16 }, (_, i) => "older-" + i) });
      const d = h.dispatcher();
      await d.dispatch(h.card);
      await d.dispatch({ ...h.card, dispatchHandoffId: "D2" });
      const before = h.spawns;
      const sent = h.calls.length;
      await h.dispatcher().dispatch(h.card);
      expect(h.spawns - before).toBe(0);
      expect(h.calls.length - sent).toBe(0);
      expect(h.saved().completedHandoffIds).toEqual([...Array.from({ length: 14 }, (_, i) => "older-" + (i + 2)), "D1", "D2"]);
    });
  });

  test("H-C a completed handoff stays suppressed while the next handoff is running", async () => {
    await fixture(async h => {
      h.seed({ state: "exited", pid: 0, pgid: 0, resultSent: true, completedHandoffIds: ["D1"] });
      const release = join(h.root, "release");
      const d = h.dispatcher("peer-a", false, `import { existsSync } from "node:fs";
        while (!existsSync(${JSON.stringify(release)})) await Bun.sleep(10);
        process.stdout.write(${JSON.stringify(terminal)});`);
      const pending = d.dispatch({ ...h.card, dispatchHandoffId: "D2" });
      try {
        const deadline = Date.now() + 3_000;
        while (h.spawns < 1 && Date.now() < deadline) await Bun.sleep(10);
        expect(h.spawns).toBe(1);
        await d.dispatch(h.card);
        expect(h.calls).toHaveLength(0);
      } finally {
        writeFileSync(release, "go");
        await pending;
      }
    });
  });

  test("H-D canonical resume cwd cannot change across the write-ahead await", async () => {
    await fixture(async h => {
      const link = join(h.root, "requested");
      symlinkSync(h.cwd, link);
      h.seed({ requestedCwd: link });
      const original = sessions.writeCardSessionAsync;
      let swapped = false;
      const write = spyOn(sessions, "writeCardSessionAsync").mockImplementation(async (opts, record) => {
        await original(opts, record);
        if (record.state === "spawning" && !swapped) {
          swapped = true;
          unlinkSync(link);
          symlinkSync(h.other, link);
        }
      });
      try {
        await h.dispatcher().recover();
        expect(swapped).toBe(true);
        expect(h.spawns).toBe(0);
        expect(h.calls).toHaveLength(1);
        expect(h.calls[0]!.fields.reason).toBe("cwd_not_allowed");
        expect(h.calls[0]!.fields.note).toBe("cwd_changed_before_spawn");
      } finally { write.mockRestore(); }
    });
  });

  test("M-A recovery never starts an empty-prompt fresh session after fingerprint change", async () => {
    await fixture(async h => {
      h.seed({ promptFingerprint: "old-fingerprint" });
      await h.dispatcher().recover();
      expect(h.spawns).toBe(0);
      expect(h.calls).toHaveLength(1);
      expect(h.calls[0]!.fields.reason).toBe("needs_verification");
      expect(h.calls[0]!.fields.note).toBe("fingerprint_changed; not resuming");
      expect(h.saved().attempts).toBe(1);
    });
  });

  test("M-A refusing a changed fingerprint keeps a still-live worker guarded", async () => {
    await fixture(async h => {
      const child = spawn("/bin/sleep", ["30"], { detached: true, stdio: "ignore" });
      const pid = child.pid!;
      h.workers.push(pid);
      const procStartedAt = execFileSync("/bin/ps", ["-o", "lstart=", "-p", String(pid)], {
        encoding: "utf8", env: { ...process.env, LC_ALL: "C", LANG: "C", TZ: "UTC" },
      }).trim();
      h.seed({ pid, pgid: pid, procStartedAt, promptFingerprint: "old-fingerprint" });
      await h.dispatcher().recover();
      await h.dispatcher().dispatch({ ...h.card, dispatchHandoffId: "D2" });
      expect(h.spawns).toBe(0);
      expect(h.calls.map(c => c.fields.reason)).toEqual(["needs_verification", "card_already_running"]);
    });
  });

  test("M-B exited pid 0 is dead without kill(0) or ps probes; different dispatch can spawn", async () => {
    await fixture(async h => {
      h.seed({ state: "exited", pid: 0, pgid: 0, resultSent: true, sendAttempts: 1,
        completedHandoffIds: ["D1"] });
      const original = process.kill;
      const probes: number[] = [];
      const kill = spyOn(process, "kill").mockImplementation((pid, signal) => {
        if (signal === 0 && pid >= 0 && pid <= 1) probes.push(pid);
        return original(pid, signal);
      });
      try {
        await h.dispatcher().dispatch({ ...h.card, dispatchHandoffId: "D2" });
        expect(h.spawns).toBe(1);
        expect(probes).toEqual([]);
        expect(h.calls).toHaveLength(1);
        expect(h.calls[0]!.fields.reason).not.toBe("card_already_running");
      } finally { kill.mockRestore(); }
    });
  });

  for (const failure of ["timeout", "setup"] as const) {
    test("M-C " + failure + " result is durable before send and replayed verbatim", async () => {
      await fixture(async h => {
        h.config.timeoutMs = 200;
        h.beforeSend = fields => {
          const record = h.saved();
          expect(record.pendingResult).toEqual(fields);
          expect(record.resultSent).toBe(false);
          expect(record.sendAttempts).toBe(h.calls.length);
        };
        if (failure === "setup") h.spawn.mockImplementation(() => { h.spawns++; throw new Error("setup detail must survive restart"); });
        const script = failure === "timeout"
          ? 'process.on("SIGTERM", () => process.exit(0)); process.stdout.write("partial timeout text\\n"); setInterval(() => {}, 1000)'
          : undefined;
        await expect(h.dispatcher("peer-a", true, script).dispatch(h.card)).rejects.toThrow("crash during send");
        const first = h.calls[0]!.fields;
        const saved = h.saved();
        expect(saved.resultSent).toBe(false);
        expect(saved.sendAttempts).toBe(1);
        expect(saved.pendingResult).toEqual(first);
        expect(first.reason).toBe(failure === "timeout" ? "timeout" : "spawn_setup_failed");
        expect(first.timedOut).toBe(failure === "timeout");
        const bytes = JSON.parse(readFileSync(sessions.cardSessionPath(h.key()), "utf8"));
        expect(bytes.pendingResult).toEqual(first);
        writeFileSync(h.transcript(), terminal.replace("original output", "changed transcript"));
        await h.dispatcher().recover();
        expect(h.calls).toHaveLength(2);
        expect(h.calls[1]!.fields).toEqual(first);
        expect(h.saved().resultSent).toBe(true);
        expect(h.saved().sendAttempts).toBe(2);
        expect(h.saved().completedHandoffIds).toContain("D1");
        await h.dispatcher().recover();
        expect(h.calls).toHaveLength(2);
      });
    });
  }
});
