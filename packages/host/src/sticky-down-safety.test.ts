import { describe, expect, test, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  pidLooksLikeStickyHost,
  writeStickyMeta,
  loadStickyMeta,
  stickyMetaPath,
  type StickyHostMeta,
} from "./sticky-meta";
import { stopStickyHostProcess } from "./sticky-spawn";
import { setActiveProfile, resetStateHomeDirCache } from "./session-store";

/**
 * M-27 (PLAN 0.17.1): `down` / `host stop` must verify process identity before a
 * raw SIGTERM fallback, so a post-reboot pid-reuse can't kill an unrelated
 * process. These tests use the running test process itself as the "alive but not
 * our sticky host" pid — without M-27 the second test would SIGTERM the test
 * runner.
 */
describe("M-27 down kill-safety (process identity)", () => {
  const dir = join(tmpdir(), `loom-down-${Date.now()}`);
  const sessionFile = join(dir, "session.json");

  function setup() {
    mkdirSync(dir, { recursive: true });
    process.env.LOOM_TEST_HOME = dir;
    process.env.LOOM_SESSION = sessionFile;
    setActiveProfile(null);
    resetStateHomeDirCache();
  }

  afterEach(() => {
    delete process.env.LOOM_SESSION;
    delete process.env.LOOM_TEST_HOME;
    setActiveProfile(null);
    resetStateHomeDirCache();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* */
    }
  });

  test("pidLooksLikeStickyHost: dead / implausible pid → false", () => {
    expect(pidLooksLikeStickyHost(2 ** 31 - 1)).toBe(false);
    expect(pidLooksLikeStickyHost(-1)).toBe(false);
    expect(pidLooksLikeStickyHost(0)).toBe(false);
  });

  test("pidLooksLikeStickyHost: alive but non-sticky process → false", () => {
    // The bun test runner is alive, but its cmdline is not sticky-main.ts.
    expect(pidLooksLikeStickyHost(process.pid)).toBe(false);
  });

  test(
    "stopStickyHostProcess does NOT SIGTERM an unrelated alive pid (M-27)",
    async () => {
      setup();
      // Meta points at THIS test process: alive, but not our sticky host.
      // port 65000 has nothing listening → RPC stop fails → SIGTERM fallback path.
      const meta: StickyHostMeta = {
        pid: process.pid,
        port: 65000,
        token: "x",
        sessionPath: sessionFile,
        peerId: "p_test",
        roomId: "room_test",
        roomName: "test",
        displayName: "tester",
        startedAt: new Date().toISOString(),
      };
      writeStickyMeta(meta);
      expect(loadStickyMeta(sessionFile)).not.toBeNull();

      const r = await stopStickyHostProcess();

      // Identity check failed → meta cleared, process NOT killed.
      expect(r.ok).toBe(true);
      expect(r.message).toContain("NOT killed");
      expect(existsSync(stickyMetaPath(sessionFile))).toBe(false);
      // We are obviously still running to assert this — the guard held.
      expect(process.pid).toBeGreaterThan(0);
    },
    15000,
  );
});
