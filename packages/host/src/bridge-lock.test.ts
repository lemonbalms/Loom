/**
 * PLAN 0.33.0 P1 — D3 per-profile bridge pid-ownership lock (② 락 row · R8 · R9).
 * Done-when (a): acquire → owner.json {v:1,pid,lstart,startedAt,version} 0600 · dir 0700 ·
 * second acquire refused naming the holder pid · profiles independent · non-owner release
 * is a no-op · stale reclaim (dead pid · lstart mismatch · one stderr line) · unreadable
 * lstart + live pid → refused · N concurrent acquirers → exactly one winner · zero signals sent.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  acquireBridgeLock,
  BridgeLockBusyError,
  bridgeLockPath,
  LOCK_INCOMPLETE_GRACE_MS,
  readBridgeLockOwner,
  releaseBridgeLock,
} from "./bridge-lock";
import { readProcessLstart } from "./process-lstart";
import { loomDir, resetStateHomeDirCache } from "./session-store";

const LOCK_MODULE = join(import.meta.dir, "bridge-lock.ts");

let home: string;
let prevHome: string | undefined;
let logs: string[];
let kills: Array<{ pid: number; signal: number | string | undefined }>;

function deps() {
  return {
    log: (line: string) => logs.push(line),
    kill: (pid: number, signal?: number | string) => {
      kills.push({ pid, signal });
      process.kill(pid, signal as number);
    },
  };
}

function writeOwner(profile: string, owner: unknown, opts?: { raw?: string }): string {
  const dir = bridgeLockPath(profile);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(join(dir, "owner.json"), opts?.raw ?? JSON.stringify(owner), { mode: 0o600 });
  return dir;
}

function backdate(path: string, ms: number): void {
  const t = new Date(Date.now() - ms);
  utimesSync(path, t, t);
}

/** A pid that existed and has now exited (ESRCH). */
function deadPid(): number {
  const r = spawnSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"], {
    encoding: "utf8",
  });
  const pid = Number(r.stdout.trim());
  expect(Number.isInteger(pid) && pid > 1).toBe(true);
  return pid;
}

beforeEach(() => {
  prevHome = process.env.LOOM_TEST_HOME;
  home = mkdtempSync(join(tmpdir(), "loom-bridge-lock-"));
  process.env.LOOM_TEST_HOME = home;
  resetStateHomeDirCache();
  logs = [];
  kills = [];
});

afterEach(() => {
  if (prevHome === undefined) delete process.env.LOOM_TEST_HOME;
  else process.env.LOOM_TEST_HOME = prevHome;
  resetStateHomeDirCache();
  rmSync(home, { recursive: true, force: true });
});

describe("bridge lock — path (R9)", () => {
  test("lives under loomDir()/bridge/<safeProfile>.lock", () => {
    expect(bridgeLockPath("default")).toBe(join(loomDir(), "bridge", "default.lock"));
    // same sanitizer as the stderr log: slashes / leading dots cannot escape the bridge dir
    expect(bridgeLockPath("../evil/x")).toBe(join(loomDir(), "bridge", "___evil-x.lock"));
  });
});

describe("bridge lock — acquire / release", () => {
  test("acquire writes owner.json {v,pid,lstart,startedAt,version} with 0700 dir / 0600 file", () => {
    const h = acquireBridgeLock({ profile: "default", version: "0.33.0", ...deps() });
    const dir = bridgeLockPath("default");
    expect(h.path).toBe(dir);
    expect(statSync(dir).isDirectory()).toBe(true);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    const ownerFile = join(dir, "owner.json");
    expect(statSync(ownerFile).mode & 0o777).toBe(0o600);
    const owner = JSON.parse(readFileSync(ownerFile, "utf8"));
    expect(Object.keys(owner).sort()).toEqual(["lstart", "pid", "startedAt", "v", "version"]);
    expect(owner.v).toBe(1);
    expect(owner.pid).toBe(process.pid);
    expect(owner.version).toBe("0.33.0");
    expect(owner.lstart).toBe(readProcessLstart(process.pid));
    expect(Number.isNaN(Date.parse(owner.startedAt))).toBe(false);
    expect(h.owner).toEqual(owner);
    // atomic write leaves no tmp residue inside the lock dir
    expect(readdirSync(dir)).toEqual(["owner.json"]);
    expect(readBridgeLockOwner("default")).toEqual(owner);
    expect(h.release()).toBe(true);
    expect(existsSync(dir)).toBe(false);
  });

  test("release is idempotent and handle.release === releaseBridgeLock(handle)", () => {
    const h = acquireBridgeLock({ profile: "default", version: "0.33.0", ...deps() });
    expect(releaseBridgeLock(h)).toBe(true);
    expect(h.release()).toBe(false);
    expect(releaseBridgeLock(h)).toBe(false);
    // re-acquirable after release
    const h2 = acquireBridgeLock({ profile: "default", version: "0.33.0", ...deps() });
    expect(h2.release()).toBe(true);
  });

  test("second in-process acquire is refused naming the holder pid; profiles are independent", () => {
    const h = acquireBridgeLock({ profile: "default", version: "0.33.0", ...deps() });
    let err: unknown;
    try {
      acquireBridgeLock({ profile: "default", version: "0.33.0", ...deps() });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(BridgeLockBusyError);
    const busy = err as BridgeLockBusyError;
    expect(busy.holderPid).toBe(process.pid);
    expect(busy.lockPath).toBe(h.path);
    expect(busy.message).toBe(
      `bridge already running for profile default (pid ${process.pid}, started ${h.owner.startedAt}) — lock ${h.path}`,
    );
    // holder's lock untouched
    expect(readBridgeLockOwner("default")).toEqual(h.owner);
    // another profile is independent
    const other = acquireBridgeLock({ profile: "work", version: "0.33.0", ...deps() });
    expect(other.path).toBe(bridgeLockPath("work"));
    expect(other.release()).toBe(true);
    expect(h.release()).toBe(true);
    expect(logs.filter((l) => l.includes("reclaimed"))).toEqual([]);
  });

  test("release never deletes another owner's lock (pid or lstart mismatch)", () => {
    const h = acquireBridgeLock({ profile: "default", version: "0.33.0", ...deps() });
    const ownerFile = join(h.path, "owner.json");
    // another process took over (e.g. after a stale reclaim)
    writeFileSync(ownerFile, JSON.stringify({ ...h.owner, pid: h.owner.pid + 1 }), { mode: 0o600 });
    expect(h.release()).toBe(false);
    expect(existsSync(h.path)).toBe(true);
    // same pid but different start time = a different process incarnation
    writeFileSync(ownerFile, JSON.stringify({ ...h.owner, lstart: "Mon Jan  1 00:00:00 2001" }), {
      mode: 0o600,
    });
    expect(h.release()).toBe(false);
    expect(existsSync(h.path)).toBe(true);
    // corrupt owner.json → not provably ours → keep
    writeFileSync(ownerFile, "{not json", { mode: 0o600 });
    expect(h.release()).toBe(false);
    expect(existsSync(h.path)).toBe(true);
  });
});

describe("bridge lock — stale reclaim (② 회수 row · R8)", () => {
  test("dead holder pid → reclaimed with one stderr line", () => {
    const pid = deadPid();
    writeOwner("default", {
      v: 1,
      pid,
      lstart: "Mon Jan  1 00:00:00 2001",
      startedAt: "2001-01-01T00:00:00.000Z",
      version: "0.32.0",
    });
    const h = acquireBridgeLock({ profile: "default", version: "0.33.0", ...deps() });
    expect(h.owner.pid).toBe(process.pid);
    expect(readBridgeLockOwner("default")).toEqual(h.owner);
    expect(logs).toEqual([`[bridge] reclaimed stale lock pid=${pid}`]);
    // rename-away leaves nothing behind next to the lock
    expect(readdirSync(join(loomDir(), "bridge")).sort()).toEqual(["default.lock"]);
    h.release();
  });

  test("live holder pid with mismatched lstart (pid reuse) → reclaimed", () => {
    // the test runner's own pid is alive, but this start time is not ours
    writeOwner("default", {
      v: 1,
      pid: process.pid,
      lstart: "Mon Jan  1 00:00:00 2001",
      startedAt: "2001-01-01T00:00:00.000Z",
      version: "0.32.0",
    });
    const h = acquireBridgeLock({ profile: "default", version: "0.33.0", ...deps() });
    expect(h.owner.lstart).toBe(readProcessLstart(process.pid) ?? "");
    expect(logs).toEqual([`[bridge] reclaimed stale lock pid=${process.pid}`]);
    h.release();
  });

  test("live holder pid whose lstart cannot be read → refused (assumed alive) with lock path", () => {
    const child = spawn("sleep", ["30"], { stdio: "ignore" });
    try {
      const pid = child.pid!;
      writeOwner("default", {
        v: 1,
        pid,
        lstart: "Mon Jan  1 00:00:00 2001",
        startedAt: "2001-01-01T00:00:00.000Z",
        version: "0.32.0",
      });
      let err: unknown;
      try {
        acquireBridgeLock({
          profile: "default",
          version: "0.33.0",
          ...deps(),
          readLstart: (p: number) => (p === pid ? null : readProcessLstart(p)),
        });
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(BridgeLockBusyError);
      const busy = err as BridgeLockBusyError;
      expect(busy.holderPid).toBe(pid);
      expect(busy.message).toContain(`pid ${pid}`);
      expect(busy.message).toContain(bridgeLockPath("default"));
      expect(existsSync(join(bridgeLockPath("default"), "owner.json"))).toBe(true);
      expect(logs.filter((l) => l.includes("reclaimed"))).toEqual([]);
    } finally {
      child.kill("SIGKILL");
    }
  });

  test("holder recorded with an empty lstart and a live pid → refused (unverifiable)", () => {
    const child = spawn("sleep", ["30"], { stdio: "ignore" });
    try {
      writeOwner("default", {
        v: 1,
        pid: child.pid,
        lstart: "",
        startedAt: "2001-01-01T00:00:00.000Z",
        version: "0.32.0",
      });
      expect(() => acquireBridgeLock({ profile: "default", version: "0.33.0", ...deps() })).toThrow(
        BridgeLockBusyError,
      );
    } finally {
      child.kill("SIGKILL");
    }
  });

  test("reclaim never signals any process (kill only with signal 0)", () => {
    writeOwner("default", {
      v: 1,
      pid: process.pid,
      lstart: "Mon Jan  1 00:00:00 2001",
      startedAt: "2001-01-01T00:00:00.000Z",
      version: "0.32.0",
    });
    const h = acquireBridgeLock({ profile: "default", version: "0.33.0", ...deps() });
    const pid = deadPid();
    writeOwner("other", {
      v: 1,
      pid,
      lstart: "x",
      startedAt: "2001-01-01T00:00:00.000Z",
      version: "0.32.0",
    });
    acquireBridgeLock({ profile: "other", version: "0.33.0", ...deps() }).release();
    h.release();
    expect(kills.length).toBeGreaterThan(0);
    expect(kills.every((k) => k.signal === 0)).toBe(true);
  });
});

describe("bridge lock — corrupt / partial owner.json", () => {
  test("missing owner.json on a fresh lock dir (acquire in progress) → refused, pid unknown", () => {
    mkdirSync(bridgeLockPath("default"), { recursive: true, mode: 0o700 });
    let err: unknown;
    try {
      acquireBridgeLock({ profile: "default", version: "0.33.0", ...deps() });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(BridgeLockBusyError);
    expect((err as BridgeLockBusyError).holderPid).toBeNull();
    expect((err as BridgeLockBusyError).message).toContain("pid unknown");
    expect(existsSync(bridgeLockPath("default"))).toBe(true);
  });

  test("corrupt owner.json on a fresh lock dir → refused", () => {
    writeOwner("default", null, { raw: '{"v":1,"pid":' });
    expect(() => acquireBridgeLock({ profile: "default", version: "0.33.0", ...deps() })).toThrow(
      BridgeLockBusyError,
    );
  });

  test("wrong-shape owner.json (v≠1 / non-integer pid) on a fresh lock dir → refused", () => {
    writeOwner("default", { v: 2, pid: "nope", lstart: "", startedAt: "", version: "" });
    expect(() => acquireBridgeLock({ profile: "default", version: "0.33.0", ...deps() })).toThrow(
      BridgeLockBusyError,
    );
  });

  test("corrupt or missing owner.json older than the grace window → reclaimed (pid=unknown)", () => {
    const dir = writeOwner("default", null, { raw: "garbage" });
    backdate(join(dir, "owner.json"), LOCK_INCOMPLETE_GRACE_MS + 1_000);
    backdate(dir, LOCK_INCOMPLETE_GRACE_MS + 1_000);
    const h = acquireBridgeLock({ profile: "default", version: "0.33.0", ...deps() });
    expect(logs).toEqual(["[bridge] reclaimed stale lock pid=unknown"]);
    h.release();

    const empty = bridgeLockPath("other");
    mkdirSync(empty, { recursive: true, mode: 0o700 });
    backdate(empty, LOCK_INCOMPLETE_GRACE_MS + 1_000);
    acquireBridgeLock({ profile: "other", version: "0.33.0", ...deps() }).release();
    expect(logs.length).toBe(2);
  });
});

describe("bridge lock — cross-process", () => {
  function childScript(profile: string, goFile: string, holdMs: number): string {
    return `
      import { existsSync } from "node:fs";
      import { acquireBridgeLock } from ${JSON.stringify(LOCK_MODULE)};
      const go = ${JSON.stringify(goFile)};
      while (!existsSync(go)) await Bun.sleep(5);
      let out;
      try {
        const h = acquireBridgeLock({ profile: ${JSON.stringify(profile)}, version: "child", log: () => {} });
        out = { ok: true, pid: process.pid };
        console.log(JSON.stringify(out));
        await Bun.sleep(${holdMs});
        h.release();
      } catch (e) {
        out = { ok: false, pid: process.pid, holderPid: e.holderPid ?? null, message: String(e.message) };
        console.log(JSON.stringify(out));
      }
    `;
  }

  function runChild(script: string): Promise<{ code: number | null; stdout: string }> {
    return new Promise((resolve) => {
      const child = spawn(process.execPath, ["-e", script], {
        env: { ...process.env, LOOM_TEST_HOME: home },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      child.stdout!.on("data", (d) => {
        stdout += String(d);
      });
      child.on("exit", (code) => resolve({ code, stdout }));
    });
  }

  test("a second process is refused while this process holds the lock (holder pid named)", async () => {
    const h = acquireBridgeLock({ profile: "default", version: "0.33.0", ...deps() });
    const go = join(home, "go");
    writeFileSync(go, "");
    const r = await runChild(childScript("default", go, 0));
    const out = JSON.parse(r.stdout.trim());
    expect(out.ok).toBe(false);
    expect(out.holderPid).toBe(process.pid);
    expect(out.message).toContain(`pid ${process.pid}`);
    expect(readBridgeLockOwner("default")).toEqual(h.owner);
    h.release();
  }, 20_000);

  test("N concurrent processes on an empty home → exactly one winner", async () => {
    const go = join(home, "go-race");
    const runs = Array.from({ length: 5 }, () => runChild(childScript("race", go, 1_500)));
    await Bun.sleep(400);
    writeFileSync(go, "");
    const results = (await Promise.all(runs)).map((r) => JSON.parse(r.stdout.trim()));
    const winners = results.filter((o) => o.ok);
    expect(winners.length).toBe(1);
    for (const loser of results.filter((o) => !o.ok)) {
      expect(loser.holderPid === winners[0].pid || loser.holderPid === null).toBe(true);
    }
  }, 30_000);

  test("N concurrent processes racing to reclaim one stale lock → exactly one winner", async () => {
    writeOwner("race", {
      v: 1,
      pid: deadPid(),
      lstart: "Mon Jan  1 00:00:00 2001",
      startedAt: "2001-01-01T00:00:00.000Z",
      version: "0.32.0",
    });
    const go = join(home, "go-reclaim");
    const runs = Array.from({ length: 5 }, () => runChild(childScript("race", go, 1_500)));
    await Bun.sleep(400);
    writeFileSync(go, "");
    const results = (await Promise.all(runs)).map((r) => JSON.parse(r.stdout.trim()));
    expect(results.filter((o) => o.ok).length).toBe(1);
  }, 30_000);
});
