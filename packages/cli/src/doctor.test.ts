import { describe, expect, test } from "bun:test";
import { afterEach, beforeEach } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  doctorExitCode,
  hostSection,
  redactToken,
  relaySection,
  renderDoctor,
  sessionSection,
  summarizeDoctor,
  type DoctorSection,
} from "./doctor";
import { homeProfileSection } from "./doctor";

const session = {
  roomId: "room_1",
  roomName: "demo",
  inviteCode: "LOOM-ABCD",
  peerId: "p_alice",
  displayName: "alice",
  agentKind: "codex" as const,
  relayUrl: "ws://127.0.0.1:7842/ws",
  relayToken: "secret-token",
  peerSecret: "peer-secret",
};

describe("doctor pure builders", () => {
  test("redactToken strips token query values", () => {
    expect(redactToken("ws://host:7842/ws?token=secret&x=1")).toBe(
      "ws://host:7842/ws?token=<redacted>&x=1",
    );
    expect(redactToken("not a url ?token=secret next")).toBe("not a url ?token=<redacted> next");
  });

  test("exit summary makes only fail non-zero", () => {
    const warnOnly: DoctorSection[] = [
      { title: "x", lines: [{ status: "warn", message: "careful" }] },
    ];
    const withFail: DoctorSection[] = [
      ...warnOnly,
      { title: "y", lines: [{ status: "fail", message: "broken" }] },
    ];

    expect(summarizeDoctor(withFail)).toEqual({
      ok: 0,
      warn: 1,
      fail: 1,
      info: 0,
    });
    expect(doctorExitCode(warnOnly)).toBe(0);
    expect(doctorExitCode(withFail)).toBe(1);
    expect(renderDoctor(withFail)).toContain("Summary: 0 ok, 1 warn, 1 fail, 0 info");
  });

  test("no session renders exactly one info line for session relay host", () => {
    const sections = [
      sessionSection(null),
      relaySection({ session: null }),
      hostSection({
        session: null,
        meta: null,
        pidAlive: false,
        rpc: { kind: "skipped" },
      }),
    ];

    for (const section of sections) {
      expect(section.lines).toHaveLength(1);
      expect(section.lines[0]!.status).toBe("info");
    }
    expect(doctorExitCode(sections)).toBe(0);
  });

  test("relay reports loopback warning and unreachable fail", () => {
    const section = relaySection({
      session,
      endpoint: {
        wsUrl: "ws://127.0.0.1:7842/ws?token=secret",
        httpOrigin: "http://127.0.0.1:7842",
        host: "127.0.0.1",
        token: "secret",
        isLocal: true,
      },
      probe: { kind: "error", error: "Connection refused" },
    });

    expect(section.lines.some((l) => l.status === "warn" && l.message.includes("loopback"))).toBe(
      true,
    );
    expect(
      section.lines.some((l) => l.status === "fail" && l.message.includes("unreachable")),
    ).toBe(true);
    expect(renderDoctor([section])).not.toContain("secret");
  });

  test("host stale pid is warn and does not fail", () => {
    const section = hostSection({
      session,
      meta: {
        pid: 999999,
        port: 18500,
        sessionPath: "/tmp/session.json",
        peerId: "p_alice",
        roomId: "room_1",
        roomName: "demo",
        displayName: "alice",
      },
      pidAlive: false,
      rpc: { kind: "skipped" },
    });

    expect(section.lines[0]).toEqual({
      status: "warn",
      message: "sticky host stale: pid 999999 is not alive",
    });
    expect(doctorExitCode([section])).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------
// PLAN 0.37.0 P4 (D7 · R18 · 계급 21): a leftover <home>/AGENT_HINT.txt → one Home info line;
// doctor never reads, rewrites or deletes it. Pure builder + one real `loom doctor` spawn under a
// temp LOOM_TEST_HOME with spy launchctl/systemctl/loginctl first on PATH (nothing real queried).
// ---------------------------------------------------------------------------------------------

type HomeInput = Parameters<typeof homeProfileSection>[0];
const hintLine = (path: string) => `AGENT_HINT.txt is unused since 0.37 — safe to delete: ${path}`;
const homeBase = {
  home: "/tmp/h/.loom",
  sessionPath: "/tmp/h/.loom/session.json",
  profile: null,
  homeExists: true,
  homeWritable: true,
};

describe("0.37.0 D7 — Home section AGENT_HINT.txt info line", () => {
  test("agentHintFile path → last Home line is the ② info line verbatim", () => {
    const path = "/tmp/h/.loom/AGENT_HINT.txt";
    const section = homeProfileSection({ ...homeBase, agentHintFile: path } as HomeInput);
    const base = homeProfileSection(homeBase);
    expect(section.title).toBe("Home/profile");
    expect(section.lines).toEqual([...base.lines, { status: "info", message: hintLine(path) }]);
    expect(doctorExitCode([section])).toBe(0);
  });

  test("agentHintFile null / omitted → the 0.36 Home lines exactly", () => {
    const base = homeProfileSection(homeBase);
    expect(homeProfileSection({ ...homeBase, agentHintFile: null } as HomeInput)).toEqual(base);
    expect(base.lines.some((l) => l.message.includes("AGENT_HINT"))).toBe(false);
  });

  const CLI = join(import.meta.dir, "index.ts");
  let root: string;
  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), "loom-p4-hint-")));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function runDoctor(): { status: number | null; stdout: string; spawned: boolean } {
    const spy = mkdtempSync(join(tmpdir(), "loom-p4-hint-bin-"));
    const marker = join(spy, "SPAWNED");
    for (const n of ["launchctl", "systemctl", "loginctl"]) {
      writeFileSync(join(spy, n), `#!/bin/sh\necho "$0 $*" >> "${marker}"\nexit 0\n`);
      chmodSync(join(spy, n), 0o755);
    }
    try {
      const env: Record<string, string | undefined> = {
        ...process.env,
        // HOME stays the test process's temp HOME (bun's cache); the doctor home is LOOM_TEST_HOME.
        LOOM_TEST_HOME: root,
        LOOM_PROFILE: "p4hint",
        PATH: `${spy}:${process.env.PATH}`,
      };
      delete env.LOOM_SESSION;
      delete env.LOOM_RELAY_TOKEN;
      delete env.LOOM_RELAY_URL;
      const r = spawnSync(process.execPath, [CLI, "doctor"], {
        env: env as Record<string, string>,
        encoding: "utf8",
        timeout: 60_000,
      });
      return { status: r.status, stdout: r.stdout, spawned: existsSync(marker) };
    } finally {
      rmSync(spy, { recursive: true, force: true });
    }
  }
  const homeBlock = (stdout: string) =>
    stdout.split("\n\n").find((b) => b.startsWith("Home/profile\n")) ?? "";

  test("loom doctor with a planted AGENT_HINT.txt → Home info line · bytes and mtime unchanged", () => {
    const home = join(root, ".loom");
    mkdirSync(home, { recursive: true });
    const path = join(home, "AGENT_HINT.txt");
    const bytes = Buffer.from("Loom multiplayer room is active.\nold hint body\n", "utf8");
    writeFileSync(path, bytes, { mode: 0o644 });
    const past = new Date("2026-01-02T03:04:05Z");
    utimesSync(path, past, past);
    const before = statSync(path);
    const r = runDoctor();
    const block = homeBlock(r.stdout);
    expect(block.split("\n").at(-1)).toBe(`  info ${hintLine(path)}`);
    expect(block.split("\n").filter((l) => l.includes("AGENT_HINT"))).toHaveLength(1);
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path).equals(bytes)).toBe(true);
    const after = statSync(path);
    expect(after.mtimeMs).toBe(before.mtimeMs);
    expect(after.size).toBe(before.size);
    expect(after.mode).toBe(before.mode);
    expect(r.spawned).toBe(false);
  }, 90_000);

  test("loom doctor without AGENT_HINT.txt → no hint line, nothing created", () => {
    mkdirSync(join(root, ".loom"), { recursive: true });
    const r = runDoctor();
    expect(homeBlock(r.stdout)).toContain("Home/profile");
    expect(r.stdout).not.toContain("AGENT_HINT");
    expect(existsSync(join(root, ".loom", "AGENT_HINT.txt"))).toBe(false);
    expect(r.spawned).toBe(false);
  }, 90_000);
});
