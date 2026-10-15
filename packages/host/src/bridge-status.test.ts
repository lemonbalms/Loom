/**
 * PLAN 0.33.0 P1 — D5 bridge status file writer (② 상태 파일 / 하트비트 rows · 상태기계 row).
 * Done-when (b): field set == ② (no extra, none missing) · tmp+rename (no tmp residue) · 0600 ·
 * no token / session secret strings · lastError ≤ 512 bytes · transition table — only allowed
 * transitions pass, no regressions. Write failures never throw (stderr once per failure kind).
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  BRIDGE_STATES,
  type BridgeState,
  bridgeStatusPath,
  canTransition,
  createBridgeStatusWriter,
  HEARTBEAT_MS,
  LAST_ERROR_MAX_BYTES,
  STATUS_STALE_MS,
  truncateLastError,
} from "./bridge-status";
import { loomDir, resetStateHomeDirCache } from "./session-store";

let home: string;
let prevHome: string | undefined;
let logs: string[];
let clock: number;

const SECRET = "sk-ant-api03-SECRETSECRETSECRETSECRETSECRET";

function now(): Date {
  return new Date(clock);
}

function fakeTimers() {
  const handles: Array<{
    fn: () => void;
    ms: number;
    cleared: boolean;
    unref: () => void;
    unrefd: boolean;
  }> = [];
  return {
    handles,
    setInterval: (fn: () => void, ms: number) => {
      const h = {
        fn,
        ms,
        cleared: false,
        unrefd: false,
        unref() {
          h.unrefd = true;
        },
      };
      handles.push(h);
      return h;
    },
    clearInterval: (h: unknown) => {
      (h as { cleared: boolean }).cleared = true;
    },
  };
}

function baseOpts() {
  return {
    profile: "default",
    version: "0.33.0",
    srcPath: "/abs/packages/host/src/bridge-main.ts",
    now,
    log: (line: string) => logs.push(line),
  };
}

function readStatus(profile = "default"): Record<string, unknown> {
  return JSON.parse(readFileSync(bridgeStatusPath(profile), "utf8"));
}

beforeEach(() => {
  prevHome = process.env.LOOM_TEST_HOME;
  home = mkdtempSync(join(tmpdir(), "loom-bridge-status-"));
  process.env.LOOM_TEST_HOME = home;
  resetStateHomeDirCache();
  logs = [];
  clock = Date.parse("2026-10-16T00:00:00.000Z");
});

afterEach(() => {
  if (prevHome === undefined) delete process.env.LOOM_TEST_HOME;
  else process.env.LOOM_TEST_HOME = prevHome;
  resetStateHomeDirCache();
  rmSync(home, { recursive: true, force: true });
});

describe("bridge status — constants and path", () => {
  test("HEARTBEAT_MS = 5s, stale = 3× = 15s, lastError cap = 512 bytes", () => {
    expect(HEARTBEAT_MS).toBe(5_000);
    expect(STATUS_STALE_MS).toBe(15_000);
    expect(LAST_ERROR_MAX_BYTES).toBe(512);
    expect([...BRIDGE_STATES]).toEqual(["starting", "running", "draining", "stopping", "stopped"]);
  });

  test("path = loomDir()/bridge/<safeProfile>.status.json (R9 — same sanitizer as the stderr log)", () => {
    expect(bridgeStatusPath("default")).toBe(join(loomDir(), "bridge", "default.status.json"));
    expect(bridgeStatusPath("../evil/x")).toBe(join(loomDir(), "bridge", "___evil-x.status.json"));
  });
});

describe("bridge status — transition table (상태기계 row)", () => {
  const allowed: Array<[BridgeState | null, BridgeState]> = [
    [null, "starting"],
    ["starting", "running"],
    ["starting", "stopping"],
    ["starting", "stopped"],
    ["running", "draining"],
    ["running", "stopping"],
    ["draining", "stopping"],
    ["stopping", "stopped"],
  ];

  test("exactly the allowed transitions pass; everything else (incl. regressions) is refused", () => {
    const froms: Array<BridgeState | null> = [null, ...BRIDGE_STATES];
    for (const from of froms) {
      for (const to of BRIDGE_STATES) {
        const expected = allowed.some(([f, t]) => f === from && t === to);
        expect([from, to, canTransition(from, to)]).toEqual([from, to, expected]);
      }
    }
  });
});

describe("bridge status — writer", () => {
  test("first transition(starting) writes exactly the ② field set, 0600, no tmp residue", () => {
    const w = createBridgeStatusWriter({ ...baseOpts(), pid: 4242 });
    expect(w.path).toBe(bridgeStatusPath("default"));
    expect(w.transition("starting")).toBe(true);
    const s = readStatus();
    expect(Object.keys(s).sort()).toEqual(
      [
        "heartbeatAt",
        "herdr",
        "inFlight",
        "pid",
        "profile",
        "srcPath",
        "startedAt",
        "state",
        "v",
        "version",
      ].sort(),
    );
    expect(s).toEqual({
      v: 1,
      pid: 4242,
      version: "0.33.0",
      srcPath: "/abs/packages/host/src/bridge-main.ts",
      profile: "default",
      startedAt: "2026-10-16T00:00:00.000Z",
      heartbeatAt: "2026-10-16T00:00:00.000Z",
      state: "starting",
      inFlight: { paneCards: 0, convs: 0, headlessRunning: 0, headlessQueued: 0 },
      herdr: "down",
    });
    expect(statSync(w.path).mode & 0o777).toBe(0o600);
    expect(readdirSync(dirname(w.path))).toEqual(["default.status.json"]);
  });

  test("pid defaults to process.pid", () => {
    const w = createBridgeStatusWriter(baseOpts());
    w.transition("starting");
    expect(readStatus().pid).toBe(process.pid);
  });

  test("full lifecycle: optional drain / stoppedAt / lastError appear only when set", () => {
    const w = createBridgeStatusWriter(baseOpts());
    expect(w.transition("starting")).toBe(true);
    clock += 1_000;
    w.update({
      herdr: "ok",
      inFlight: { paneCards: 1, convs: 2, headlessRunning: 3, headlessQueued: 4 },
    });
    expect(w.transition("running")).toBe(true);
    let s = readStatus();
    expect(s.state).toBe("running");
    expect(s.herdr).toBe("ok");
    expect(s.inFlight).toEqual({ paneCards: 1, convs: 2, headlessRunning: 3, headlessQueued: 4 });
    expect(s.heartbeatAt).toBe("2026-10-16T00:00:01.000Z");
    expect(s.startedAt).toBe("2026-10-16T00:00:00.000Z");
    expect("drain" in s).toBe(false);
    expect("stoppedAt" in s).toBe(false);
    expect("lastError" in s).toBe(false);

    clock += 1_000;
    w.update({
      drain: { startedAt: "2026-10-16T00:00:02.000Z", deadlineAt: "2026-10-16T00:10:02.000Z" },
    });
    expect(w.transition("draining")).toBe(true);
    s = readStatus();
    expect(s.drain).toEqual({
      startedAt: "2026-10-16T00:00:02.000Z",
      deadlineAt: "2026-10-16T00:10:02.000Z",
    });
    clock += 1_000;
    expect(w.transition("stopping")).toBe(true);
    clock += 1_000;
    expect(w.transition("stopped", { lastError: "stop_bound_exceeded" })).toBe(true);
    s = readStatus();
    expect(s.state).toBe("stopped");
    expect(s.stoppedAt).toBe("2026-10-16T00:00:04.000Z");
    expect(s.lastError).toBe("stop_bound_exceeded");
    expect(Object.keys(s).sort()).toEqual(
      [
        "drain",
        "heartbeatAt",
        "herdr",
        "inFlight",
        "lastError",
        "pid",
        "profile",
        "srcPath",
        "startedAt",
        "state",
        "stoppedAt",
        "v",
        "version",
      ].sort(),
    );
    expect(w.current()?.state).toBe("stopped");
  });

  test("refused transitions (regression / skip / repeat) return false and do not write", () => {
    const w = createBridgeStatusWriter(baseOpts());
    expect(w.transition("running")).toBe(false); // must start with starting
    expect(existsSync(w.path)).toBe(false);
    w.transition("starting");
    w.transition("running");
    const before = readFileSync(w.path, "utf8");
    clock += 5_000;
    expect(w.transition("starting")).toBe(false);
    expect(w.transition("running")).toBe(false);
    expect(w.transition("stopped")).toBe(false);
    expect(readFileSync(w.path, "utf8")).toBe(before);
    expect(w.current()?.state).toBe("running");
  });

  test("unknown keys in update/transition patches never reach the file (no tokens / secrets)", () => {
    const w = createBridgeStatusWriter(baseOpts());
    w.transition("starting");
    w.update({ herdr: "ok", token: SECRET, sessionToken: SECRET } as never);
    w.transition("running", { token: SECRET } as never);
    const raw = readFileSync(w.path, "utf8");
    expect(raw).not.toContain(SECRET);
    expect(raw).not.toContain("token");
  });

  test("lastError is secret-redacted and truncated to ≤ 512 UTF-8 bytes", () => {
    const w = createBridgeStatusWriter(baseOpts());
    w.transition("starting");
    w.update({ lastError: `relay auth failed: Bearer ${SECRET} ${"é".repeat(1_000)}` });
    w.heartbeat();
    const s = readStatus();
    const lastError = s.lastError as string;
    expect(lastError).not.toContain(SECRET);
    expect(Buffer.byteLength(lastError, "utf8")).toBeLessThanOrEqual(512);
    expect(lastError.startsWith("relay auth failed:")).toBe(true);
    expect(lastError).not.toContain("�");
  });

  test("truncateLastError keeps whole code points within 512 bytes", () => {
    expect(truncateLastError("short")).toBe("short");
    const t = truncateLastError("😀".repeat(200)); // 4 bytes each → 128 whole emoji fit
    expect(Buffer.byteLength(t, "utf8")).toBeLessThanOrEqual(512);
    expect(t).toBe("😀".repeat(128));
    const u = truncateLastError(`a${"é".repeat(400)}`); // 1 + 2n ≤ 512 → n = 255
    expect(u).toBe(`a${"é".repeat(255)}`);
  });
});

describe("bridge status — heartbeat", () => {
  test("startHeartbeat uses HEARTBEAT_MS, unrefs the timer, and advances heartbeatAt with the clock", () => {
    const timers = fakeTimers();
    let paneCards = 0;
    const w = createBridgeStatusWriter({
      ...baseOpts(),
      setInterval: timers.setInterval,
      clearInterval: timers.clearInterval,
    });
    w.transition("starting");
    w.startHeartbeat(() => ({
      inFlight: { paneCards, convs: 0, headlessRunning: 0, headlessQueued: 0 },
    }));
    expect(timers.handles.length).toBe(1);
    expect(timers.handles[0]!.ms).toBe(HEARTBEAT_MS);
    expect(timers.handles[0]!.unrefd).toBe(true);

    clock += 5_000;
    paneCards = 2;
    timers.handles[0]!.fn();
    let s = readStatus();
    expect(s.heartbeatAt).toBe("2026-10-16T00:00:05.000Z");
    expect((s.inFlight as { paneCards: number }).paneCards).toBe(2);
    expect(s.startedAt).toBe("2026-10-16T00:00:00.000Z");

    clock += 5_000;
    timers.handles[0]!.fn();
    s = readStatus();
    expect(s.heartbeatAt).toBe("2026-10-16T00:00:10.000Z");

    // a second start does not stack timers
    w.startHeartbeat();
    expect(timers.handles.filter((h) => !h.cleared).length).toBe(1);
  });

  test("stopHeartbeat clears the interval; a late tick after stop writes nothing", () => {
    const timers = fakeTimers();
    const w = createBridgeStatusWriter({
      ...baseOpts(),
      setInterval: timers.setInterval,
      clearInterval: timers.clearInterval,
    });
    w.transition("starting");
    w.startHeartbeat();
    w.stopHeartbeat();
    expect(timers.handles[0]!.cleared).toBe(true);
    const before = readFileSync(w.path, "utf8");
    clock += 5_000;
    timers.handles[0]!.fn();
    expect(readFileSync(w.path, "utf8")).toBe(before);
    w.stopHeartbeat(); // idempotent
  });

  test("transition(stopped) stops the heartbeat", () => {
    const timers = fakeTimers();
    const w = createBridgeStatusWriter({
      ...baseOpts(),
      setInterval: timers.setInterval,
      clearInterval: timers.clearInterval,
    });
    w.transition("starting");
    w.startHeartbeat();
    w.transition("stopped", { lastError: "herdr unreachable" });
    expect(timers.handles[0]!.cleared).toBe(true);
  });

  test("heartbeat before the first transition writes nothing", () => {
    const w = createBridgeStatusWriter(baseOpts());
    expect(w.heartbeat()).toBe(false);
    expect(existsSync(w.path)).toBe(false);
  });

  test("real timer: heartbeat runs on its own and stops cleanly", async () => {
    const w = createBridgeStatusWriter({ ...baseOpts(), now: () => new Date(), heartbeatMs: 20 });
    w.transition("starting");
    w.startHeartbeat();
    const first = readStatus().heartbeatAt as string;
    await Bun.sleep(80);
    const later = readStatus().heartbeatAt as string;
    expect(Date.parse(later)).toBeGreaterThan(Date.parse(first));
    w.stopHeartbeat();
    const frozen = readFileSync(w.path, "utf8");
    await Bun.sleep(60);
    expect(readFileSync(w.path, "utf8")).toBe(frozen);
  });
});

describe("bridge status — write failures never throw", () => {
  test("unwritable target (parent is a file) → returns false, stderr once per failure kind", () => {
    const bridgeDir = join(loomDir(), "bridge");
    mkdirSync(dirname(bridgeDir), { recursive: true });
    writeFileSync(bridgeDir, "not a directory");
    const w = createBridgeStatusWriter(baseOpts());
    expect(() => w.transition("starting")).not.toThrow();
    expect(w.current()?.state).toBe("starting"); // the state machine still advances
    expect(w.heartbeat()).toBe(false);
    expect(w.transition("running")).toBe(true); // transition accepted even though the write failed
    expect(logs.length).toBe(1);
    expect(logs[0]!.startsWith("[bridge] status write failed")).toBe(true);
  });

  test("injected writer throwing distinct kinds → one stderr line per kind", () => {
    const codes = ["ENOSPC", "ENOSPC", "EACCES", "EACCES", "ENOSPC"];
    let i = 0;
    const w = createBridgeStatusWriter({
      ...baseOpts(),
      writeJson: () => {
        const e = new Error(`boom ${codes[i]}`) as NodeJS.ErrnoException;
        e.code = codes[i++];
        throw e;
      },
    });
    w.transition("starting");
    for (let k = 0; k < 4; k++) expect(w.heartbeat()).toBe(false);
    expect(logs.length).toBe(2);
    expect(logs[0]).toContain("ENOSPC");
    expect(logs[1]).toContain("EACCES");
  });

  test("a heartbeat tick whose write fails does not throw out of the timer callback", () => {
    const timers = fakeTimers();
    const w = createBridgeStatusWriter({
      ...baseOpts(),
      setInterval: timers.setInterval,
      clearInterval: timers.clearInterval,
      writeJson: () => {
        throw new Error("disk gone");
      },
    });
    w.transition("starting");
    w.startHeartbeat(() => {
      throw new Error("sampler bug");
    });
    expect(() => timers.handles[0]!.fn()).not.toThrow();
  });
});

describe("bridge status — atomic visibility", () => {
  test("a concurrent reader never observes a partial file", async () => {
    const w = createBridgeStatusWriter({ ...baseOpts(), now: () => new Date() });
    w.transition("starting");
    const path = w.path;
    const reader = `
      import { readFileSync } from "node:fs";
      const end = Date.now() + 700;
      let reads = 0, bad = 0;
      while (Date.now() < end) {
        try { JSON.parse(readFileSync(${JSON.stringify(path)}, "utf8")); reads++; }
        catch (e) { bad++; }
      }
      console.log(JSON.stringify({ reads, bad }));
    `;
    const child = spawn(process.execPath, ["-e", reader], { stdio: ["ignore", "pipe", "inherit"] });
    let out = "";
    child.stdout!.on("data", (d) => {
      out += String(d);
    });
    const done = new Promise<void>((resolve) => child.on("exit", () => resolve()));
    const big = "x".repeat(400);
    const deadline = Date.now() + 900;
    let n = 0;
    while (Date.now() < deadline) {
      w.update({ lastError: `${big}${n++}` });
      w.heartbeat();
      if (n % 20 === 0) await Bun.sleep(0);
    }
    await done;
    const r = JSON.parse(out.trim());
    expect(r.reads).toBeGreaterThan(0);
    expect(r.bad).toBe(0);
    expect(readdirSync(dirname(path))).toEqual(["default.status.json"]);
  }, 20_000);
});

describe("bridge status — P1 hardening (Opus verify L4 / L6)", () => {
  test("L4: heartbeat() and startHeartbeat() are no-ops once stopped", () => {
    const timers = fakeTimers();
    const w = createBridgeStatusWriter({
      ...baseOpts(),
      setInterval: timers.setInterval,
      clearInterval: timers.clearInterval,
    });
    w.transition("starting");
    w.transition("stopping");
    w.transition("stopped");
    const before = readFileSync(w.path, "utf8");
    clock += 60_000;
    expect(w.heartbeat()).toBe(false);
    w.startHeartbeat();
    expect(timers.handles.length).toBe(0);
    expect(readFileSync(w.path, "utf8")).toBe(before);
    expect(readStatus().heartbeatAt).toBe("2026-10-16T00:00:00.000Z");
  });

  test("L6: a failed rename leaves no tmp residue (status path occupied by a directory)", () => {
    const p = bridgeStatusPath("e");
    mkdirSync(p, { recursive: true });
    const w = createBridgeStatusWriter({ ...baseOpts(), profile: "e" });
    w.transition("starting");
    for (let i = 0; i < 3; i++) {
      Bun.sleepSync(2);
      expect(w.heartbeat()).toBe(false);
    }
    expect(logs.length).toBe(1);
    expect(readdirSync(dirname(p)).filter((n) => n.includes(".tmp."))).toEqual([]);
  });
});
