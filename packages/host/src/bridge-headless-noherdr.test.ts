/**
 * PLAN 0.33.0 P4 — Done-when (g)(h) on real spawned bridges (LOOM_TEST_HOME isolated).
 * (g) D6 / UK-7: a `worker.backend:"headless"` bridge never touches herdr — it starts with no
 *     herdr socket at all, reports `herdr:"skipped"`, makes zero HerdrClient calls / socket
 *     connections, still runs headless cards, and rejects conv.open exactly once with
 *     `conv_unavailable_headless` (R5 · R51-M1) — but never claims it while draining.
 * (h) D5 readers: `loom doctor` bridge section (ok / warn / info only, exit code unchanged)
 *     and `loom bridge status` offline summary from the status file (R6).
 * No fake herdr in this file on purpose.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawn, type Subprocess } from "bun";
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildConvOpenBody,
  buildDispatchBody,
  CARD_CONTRACT_VERSION,
  CARD_DISPATCH_LABEL,
  CARD_RESULT_LABEL,
  CONV_CONTRACT_VERSION,
  CONV_OPEN_LABEL,
  CONV_REJECT_LABEL,
  serializeCardAttachment,
  serializeConvAttachment,
} from "@loom/protocol";
import { RelayServer } from "@loom/relay";
import { bridgeConfigPath } from "./bridge-config";
import { bridgeLockPath } from "./bridge-lock";
import { bridgeMetaPath, loadBridgeMeta } from "./bridge-meta";
import { bridgeStatusPath } from "./bridge-status";
import { RelayClient } from "./relay-client";
import { type FableSession, resetStateHomeDirCache, setActiveProfile } from "./session-store";

const HOST_SRC = import.meta.dir;
const BRIDGE_MAIN = join(HOST_SRC, "bridge-main.ts");
const HERDR_CLIENT = join(HOST_SRC, "herdr-client.ts");
const CLI_MAIN = join(HOST_SRC, "..", "..", "cli", "src", "index.ts");
const FAKE_AGENT = join(HOST_SRC, "fake-agent-cli.ts");
const PROFILE = "node";
const BUN = process.execPath;

type StatusView = {
  pid?: number;
  state?: string;
  herdr?: string;
  lastError?: string;
  stoppedAt?: string;
  heartbeatAt?: string;
};

type Spawned = {
  proc: Subprocess;
  stderr: () => string;
};

let seq = 0;

function readStatus(profile = PROFILE): StatusView | null {
  try {
    return JSON.parse(readFileSync(bridgeStatusPath(profile), "utf8")) as StatusView;
  } catch {
    return null;
  }
}

function killHard(pid: number | undefined): void {
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

async function waitFor<T>(
  probe: () => T | null | undefined | false | Promise<T | null | undefined | false>,
  timeoutMs: number,
  stepMs = 25,
): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const v = await probe();
    if (v) return v;
    await Bun.sleep(stepMs);
  }
  const v = await probe();
  return v ? v : null;
}

async function exitWithin(proc: Subprocess, ms: number): Promise<number | "timeout"> {
  return Promise.race([
    proc.exited.then((code) => code),
    Bun.sleep(ms).then(() => "timeout" as const),
  ]);
}

function countMatches(text: string, needle: string): number {
  let n = 0;
  let i = text.indexOf(needle);
  while (i >= 0) {
    n += 1;
    i = text.indexOf(needle, i + needle.length);
  }
  return n;
}

describe("headless bridge without herdr + bridge readers (PLAN 0.33.0 P4 · g · h)", () => {
  const port = 32000 + Math.floor(Math.random() * 20000);
  const dir = mkdtempSync(join(tmpdir(), "loom-p4-noherdr-"));
  const cwd = realpathSync(dir);
  const sessionFile = join(dir, "session.json");
  const absentSock = join(dir, "no-herdr-here.sock");
  const trapSock = join(dir, "trap.sock");
  const spyDump = join(dir, "herdr-spy.jsonl");
  const binDir = join(dir, "bin");
  const argvDump = join(dir, "argv.jsonl");
  const runner = join(dir, "spy-runner.ts");
  const relay = new RelayServer({ host: "127.0.0.1", port });
  const live: Subprocess[] = [];
  let tower: RelayClient;
  let session: FableSession;
  let trap: Server | null = null;
  let trapConnections = 0;
  const saved = new Map<string, string | undefined>();

  function setEnv(key: string, value: string | undefined): void {
    if (!saved.has(key)) saved.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  function baseEnv(extra: Record<string, string | undefined> = {}): Record<string, string> {
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (typeof v === "string") env[k] = v;
    }
    delete env.LOOM_RELAY_TOKEN;
    delete env.LOOM_RELAY_URL;
    env.LOOM_TEST_HOME = dir;
    env.LOOM_SESSION = sessionFile;
    env.LOOM_PROFILE = PROFILE;
    env.LOOM_NO_AUTO_HOST = "1";
    for (const [k, v] of Object.entries(extra)) {
      if (v === undefined) delete env[k];
      else env[k] = v;
    }
    return env;
  }

  function spawnLogged(cmd: string[], extraEnv?: Record<string, string | undefined>): Spawned {
    seq += 1;
    const stderrPath = join(dir, `spawn-${seq}.stderr.log`);
    const fd = openSync(stderrPath, "w", 0o600);
    const proc = spawn({
      cmd,
      env: baseEnv(extraEnv),
      stdout: "ignore",
      stderr: fd,
      stdin: "ignore",
    });
    closeSync(fd);
    live.push(proc);
    return {
      proc,
      stderr: () => {
        try {
          return readFileSync(stderrPath, "utf8");
        } catch {
          return "";
        }
      },
    };
  }

  function spawnBridge(extraEnv: Record<string, string | undefined> = {}): Spawned {
    return spawnLogged([BUN, "run", BRIDGE_MAIN], extraEnv);
  }

  async function runCli(args: string[], timeoutMs: number, extraEnv?: Record<string, string | undefined>) {
    const proc = spawn({
      cmd: [BUN, "run", CLI_MAIN, ...args],
      env: baseEnv(extraEnv),
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
    });
    live.push(proc);
    const code = await exitWithin(proc, timeoutMs);
    if (code === "timeout") killHard(proc.pid);
    const stdout = await new Response(proc.stdout as ReadableStream).text();
    const stderr = await new Response(proc.stderr as ReadableStream).text();
    return { code, stdout, stderr };
  }

  async function waitRunning(b: Spawned, profile = PROFILE, timeoutMs = 15_000): Promise<void> {
    const ok = await waitFor(() => {
      if (b.proc.exitCode !== null) return "exited";
      const s = readStatus(profile);
      return s?.state === "running" && s.pid === b.proc.pid && existsSync(bridgeMetaPath(sessionFile))
        ? "running"
        : null;
    }, timeoutMs);
    if (ok !== "running") {
      throw new Error(
        `bridge did not reach running (exit=${b.proc.exitCode}, status=${JSON.stringify(readStatus(profile))})\n${b.stderr()}`,
      );
    }
  }

  function assertCleanStop(b: Spawned, profile = PROFILE): void {
    const s = readStatus(profile);
    expect(s?.state).toBe("stopped");
    expect(s?.pid).toBe(b.proc.pid);
    expect(existsSync(bridgeMetaPath(sessionFile))).toBe(false);
    expect(existsSync(bridgeLockPath(profile))).toBe(false);
  }

  async function rpc(body: Record<string, unknown>): Promise<{ status: number; json: Record<string, unknown> }> {
    const meta = loadBridgeMeta(sessionFile);
    if (!meta) throw new Error("no bridge meta");
    const res = await fetch(`http://127.0.0.1:${meta.port}/rpc`, {
      method: "POST",
      headers: { authorization: `Bearer ${meta.token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, json: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  }

  async function dispatch(cardId: string): Promise<string> {
    const ack = await tower.handoff({
      to: "@node/wsl-1",
      body: buildDispatchBody({ title: "p4 card", cardId, node: "node/wsl-1" }),
      mode: "task",
      attachments: [
        serializeCardAttachment(CARD_DISPATCH_LABEL, {
          v: CARD_CONTRACT_VERSION,
          cardId,
          sourceRoomId: session.roomId,
          prompt: "write the bytes",
          agentKind: "claude" as const,
        }),
      ],
    });
    expect(["queued", "delivered"]).toContain(ack.status);
    return ack.handoffId;
  }

  async function openConv(convId: string): Promise<string> {
    const ack = await tower.handoff({
      to: "@node/wsl-1",
      body: buildConvOpenBody({ goal: "p4 conv", convId }),
      mode: "task",
      attachments: [
        serializeConvAttachment(CONV_OPEN_LABEL, {
          v: CONV_CONTRACT_VERSION,
          convId,
          goal: "p4 conv",
          scope: { agentKind: "claude" as const, writesAllowed: false },
          limits: { maxTurns: 20, wallClockMs: 3_600_000 },
        }),
      ],
    });
    expect(["queued", "delivered"]).toContain(ack.status);
    return ack.handoffId;
  }

  async function countResults(cardId: string): Promise<number> {
    let n = 0;
    for (const entry of await tower.listInbox()) {
      for (const attachment of entry.handoff.attachments ?? []) {
        if (attachment.label !== CARD_RESULT_LABEL) continue;
        const result = JSON.parse(attachment.content) as { cardId?: string };
        if (result.cardId === cardId) n += 1;
      }
    }
    return n;
  }

  async function convRejects(convId: string): Promise<string[]> {
    const reasons: string[] = [];
    for (const entry of await tower.listInbox()) {
      for (const attachment of entry.handoff.attachments ?? []) {
        if (attachment.label !== CONV_REJECT_LABEL) continue;
        const r = JSON.parse(attachment.content) as { convId?: string; reason?: string };
        if (r.convId === convId) reasons.push(r.reason ?? "");
      }
    }
    return reasons;
  }

  function workerPidsFromDump(): number[] {
    try {
      return readFileSync(argvDump, "utf8")
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => {
          try {
            return (JSON.parse(l) as { pid?: number }).pid ?? 0;
          } catch {
            return 0;
          }
        })
        .filter((p) => p > 0);
    } catch {
      return [];
    }
  }

  function writeHeadlessConfig(profile: string, herdrSocketPath: string): void {
    mkdirSync(join(bridgeConfigPath(profile), ".."), { recursive: true });
    writeFileSync(
      bridgeConfigPath(profile),
      JSON.stringify({
        authorizedDispatchers: ["p_tower"],
        herdrSocketPath,
        worker: {
          backend: "headless",
          cwd,
          allowedRoots: [cwd],
          timeoutMs: 60_000,
          agentBin: { claude: join(binDir, "claude") },
        },
      }),
      "utf8",
    );
  }

  beforeAll(async () => {
    setEnv("LOOM_TEST_HOME", dir);
    setEnv("LOOM_SESSION", sessionFile);
    setEnv("LOOM_PROFILE", PROFILE);
    setEnv("LOOM_NO_AUTO_HOST", "1");
    setEnv("LOOM_RELAY_TOKEN", undefined);
    setEnv("LOOM_RELAY_URL", undefined);
    resetStateHomeDirCache();
    setActiveProfile(null);
    relay.start();
    tower = new RelayClient({ url: `ws://127.0.0.1:${port}/ws` });
    const created = await tower.createRoom({
      roomName: "p4-noherdr",
      displayName: "tower",
      agentKind: "shell",
      peerId: "p_tower",
    });
    if (created.type !== "room.state") throw new Error("create failed");
    session = {
      roomId: created.roomId,
      roomName: created.roomName ?? "p4-noherdr",
      inviteCode: created.inviteCode ?? "",
      peerId: "p_node",
      displayName: "node/wsl-1",
      color: "#0f0",
      agentKind: "shell",
      relayUrl: `ws://127.0.0.1:${port}/ws`,
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(sessionFile, JSON.stringify(session), "utf8");

    mkdirSync(binDir, { recursive: true });
    const wrapper = join(binDir, "claude");
    writeFileSync(wrapper, `#!/bin/sh\nexec "${BUN}" "${FAKE_AGENT}" --fake-kind claude "$@"\n`);
    chmodSync(wrapper, 0o755);

    // Headless profile whose herdr socket path does not exist at all.
    writeHeadlessConfig(PROFILE, absentSock);
    // Headless profile whose herdr socket path is a live trap that counts connections.
    writeHeadlessConfig("spy", trapSock);
    // Pane backend + absent socket → today's fail-fast (exit 1, lastError recorded).
    writeFileSync(
      bridgeConfigPath("panefail"),
      JSON.stringify({ authorizedDispatchers: ["p_tower"], herdrSocketPath: absentSock }),
      "utf8",
    );

    trap = createServer((sock) => {
      trapConnections += 1;
      sock.destroy();
    });
    await new Promise<void>((resolve) => trap!.listen(trapSock, resolve));

    // Spy runner: every HerdrClient prototype method / getter records a call; an injected
    // spy instance is offered too — a headless bridge must use neither.
    writeFileSync(
      runner,
      [
        `import { appendFileSync } from "node:fs";`,
        `import { runBridgeMain } from ${JSON.stringify(BRIDGE_MAIN)};`,
        `import { HerdrClient } from ${JSON.stringify(HERDR_CLIENT)};`,
        `const dump = process.env.T_HERDR_SPY!;`,
        `const rec = (m: string) => appendFileSync(dump, JSON.stringify({ m }) + "\\n");`,
        `const proto = HerdrClient.prototype as unknown as Record<string, unknown>;`,
        `for (const name of Object.getOwnPropertyNames(HerdrClient.prototype)) {`,
        `  if (name === "constructor") continue;`,
        `  const d = Object.getOwnPropertyDescriptor(HerdrClient.prototype, name)!;`,
        `  if (typeof d.value === "function") {`,
        `    const orig = d.value as (...a: unknown[]) => unknown;`,
        `    proto[name] = function (this: unknown, ...a: unknown[]) { rec(name); return orig.apply(this, a); };`,
        `  } else if (d.get) {`,
        `    const get = d.get;`,
        `    Object.defineProperty(HerdrClient.prototype, name, { ...d, get() { rec("get:" + name); return get.call(this); } });`,
        `  }`,
        `}`,
        `await runBridgeMain({ runtimeOptions: { herdr: new HerdrClient({ socketPath: process.env.T_TRAP_SOCK! }) } });`,
        "",
      ].join("\n"),
      "utf8",
    );
  });

  afterAll(async () => {
    for (const p of live) killHard(p.pid);
    for (const pid of workerPidsFromDump()) killHard(pid);
    tower?.close();
    await new Promise<void>((resolve) => (trap ? trap.close(() => resolve()) : resolve()));
    relay.stop();
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    resetStateHomeDirCache();
    rmSync(dir, { recursive: true, force: true });
  });

  test("headless bridge starts with no herdr socket, reports herdr skipped, runs a card (g · D6 · UK-7)", async () => {
    expect(existsSync(absentSock)).toBe(false);
    const b = spawnBridge({ FAKE_DURATION_MS: "100", FAKE_OUTPUT_BYTES: "32" });
    await waitRunning(b);
    expect(readStatus()?.herdr).toBe("skipped");
    const st = await rpc({ op: "status" });
    expect(st.json.herdr).toBe("skipped");
    expect(st.json.herdrOk).toBe(false);
    expect(b.stderr()).not.toContain("herdr unreachable");

    const cardId = "task_a0330d0000000001";
    await dispatch(cardId);
    const n = await waitFor(async () => ((await countResults(cardId)) >= 1 ? 1 : null), 30_000, 200);
    expect(n).toBe(1);
    expect(existsSync(absentSock)).toBe(false);

    b.proc.kill("SIGTERM");
    expect(await exitWithin(b.proc, 12_000)).toBe(0);
    assertCleanStop(b);
    expect(readStatus()?.herdr).toBe("skipped");
  }, 60_000);

  test("zero HerdrClient calls and zero herdr socket connections on a headless bridge (g · spy)", async () => {
    trapConnections = 0;
    const b = spawnLogged([BUN, "run", runner], {
      LOOM_PROFILE: "spy",
      T_HERDR_SPY: spyDump,
      T_TRAP_SOCK: trapSock,
    });
    await waitRunning(b, "spy");
    expect(readStatus("spy")?.herdr).toBe("skipped");
    const st = await rpc({ op: "status" });
    expect(st.json.herdr).toBe("skipped");
    b.proc.kill("SIGTERM");
    expect(await exitWithin(b.proc, 12_000)).toBe(0);
    assertCleanStop(b, "spy");
    const calls = existsSync(spyDump) ? readFileSync(spyDump, "utf8").trim() : "";
    expect(calls).toBe("");
    expect(trapConnections).toBe(0);
  }, 40_000);

  test("pane backend + absent herdr socket keeps today's fail-fast (g · exit 1)", async () => {
    const b = spawnBridge({ LOOM_PROFILE: "panefail" });
    expect(await exitWithin(b.proc, 15_000)).toBe(1);
    expect(b.stderr()).toContain(`herdr unreachable (${absentSock})`);
    expect(readStatus("panefail")?.state).toBe("stopped");
    expect(readStatus("panefail")?.lastError ?? "").toMatch(/herdr unreachable/);
  }, 30_000);

  test("conv.open on a headless bridge: claimed once → conv_unavailable_headless; restart does not re-reject (R5 · R51-M1)", async () => {
    const a = spawnBridge();
    await waitRunning(a);
    const convId = "conv_0330aaaa00000001";
    await openConv(convId);
    const got = await waitFor(async () => ((await convRejects(convId)).length >= 1 ? true : null), 15_000, 100);
    expect(got).toBe(true);
    expect(await convRejects(convId)).toEqual(["conv_unavailable_headless"]);
    expect(countMatches(a.stderr(), "conv_unavailable_headless")).toBe(1);
    // Several more inbox polls: still exactly one reject (the claim consumed the handoff).
    await Bun.sleep(3_500);
    expect(await convRejects(convId)).toEqual(["conv_unavailable_headless"]);
    a.proc.kill("SIGTERM");
    expect(await exitWithin(a.proc, 12_000)).toBe(0);

    const b = spawnBridge();
    await waitRunning(b);
    await Bun.sleep(3_500);
    expect(await convRejects(convId)).toEqual(["conv_unavailable_headless"]);
    expect(b.stderr()).not.toContain("conv_unavailable_headless");
    b.proc.kill("SIGTERM");
    expect(await exitWithin(b.proc, 12_000)).toBe(0);
    assertCleanStop(b);
  }, 60_000);

  test("conv.open while draining is not claimed (drain wins); the next bridge rejects it once (R5 · R51-M1)", async () => {
    const slow = { FAKE_DURATION_MS: "5000", FAKE_TIME_SCALE: "1", FAKE_OUTPUT_BYTES: "32", FAKE_ARGV_DUMP: argvDump };
    const a = spawnBridge(slow);
    await waitRunning(a);
    const before = workerPidsFromDump().length;
    await dispatch("task_a0330d0000000002");
    expect(await waitFor(() => (workerPidsFromDump().length > before ? true : null), 15_000)).toBe(true);
    const drain = await rpc({ op: "drain", timeoutSec: 120 });
    expect(drain.json.state).toBe("draining");

    const convId = "conv_0330aaaa00000002";
    const h = await openConv(convId);
    const seen = await waitFor(
      () => (a.stderr().includes(`drain: not claiming handoff ${h}`) ? true : null),
      6_000,
      50,
    );
    expect(seen).toBe(true);
    expect(await convRejects(convId)).toEqual([]);
    expect(a.stderr()).not.toContain("conv_unavailable_headless");
    expect(await exitWithin(a.proc, 25_000)).toBe(0);
    assertCleanStop(a);
    expect(await convRejects(convId)).toEqual([]);

    // It stayed unclaimed in the relay inbox: the next bridge claims and rejects it once.
    const b = spawnBridge();
    await waitRunning(b);
    const got = await waitFor(async () => ((await convRejects(convId)).length >= 1 ? true : null), 15_000, 100);
    expect(got).toBe(true);
    await Bun.sleep(2_000);
    expect(await convRejects(convId)).toEqual(["conv_unavailable_headless"]);
    b.proc.kill("SIGTERM");
    expect(await exitWithin(b.proc, 12_000)).toBe(0);
    assertCleanStop(b);
  }, 90_000);

  test("loom doctor bridge section: fresh ok + lock holder; after SIGKILL stale warn; exit code unchanged (h · R6)", async () => {
    const b = spawnBridge();
    await waitRunning(b);
    const pid = b.proc.pid;
    const up = await runCli(["doctor"], 30_000);
    expect(up.stdout).toContain("\nBridge\n");
    expect(up.stdout).toMatch(/ok\s+heartbeat fresh/);
    expect(up.stdout).toMatch(new RegExp(`ok\\s+bridge pid ${pid} alive`));
    expect(up.stdout).toContain(`lock holder: pid ${pid}`);
    expect(up.stdout).toContain("state: running");
    expect(up.stdout).toContain("herdr: skipped");
    expect(up.stdout).toContain(join(dir, ".loom", "bridge", "node.stderr.log"));
    expect(up.stdout).not.toMatch(/fail\s+.*bridge/i);

    killHard(pid);
    expect(await exitWithin(b.proc, 5_000)).not.toBe("timeout");
    const down = await runCli(["doctor"], 30_000);
    expect(down.stdout).toMatch(/warn\s+bridge died without clean stop/);
    expect(down.stdout).toMatch(/lock holder: pid \d+ stale/);
    expect(down.code).toBe(up.code);

    // `loom bridge status` with the bridge down shows the status-file summary.
    const st = await runCli(["bridge", "status"], 20_000);
    expect(st.code).toBe(0);
    const out = st.stdout;
    const iOffline = out.indexOf("bridge: offline");
    const iQuarantine = out.indexOf("quarantineUnresolved:");
    const iState = out.indexOf("state: running");
    expect(iOffline).toBeGreaterThanOrEqual(0);
    expect(iQuarantine).toBeGreaterThan(iOffline);
    expect(iState).toBeGreaterThan(iQuarantine);
    expect(out).toMatch(/heartbeatAt: \S+ \(\d+s ago\)/);
    expect(out).toContain(`lock holder: pid ${pid} stale`);
    expect(out).toContain(join(dir, ".loom", "bridge", "node.stderr.log"));

    // The next start reclaims the stale lock; leave the profile clean.
    const next = spawnBridge();
    await waitRunning(next);
    next.proc.kill("SIGTERM");
    expect(await exitWithin(next.proc, 12_000)).toBe(0);
    assertCleanStop(next);
  }, 90_000);

  test("loom bridge status offline shows lastError; doctor shows it and missing status file is info (h)", async () => {
    // panefail recorded `stopped` + lastError in the fail-fast test above.
    const st = await runCli(["bridge", "status"], 20_000, { LOOM_PROFILE: "panefail" });
    expect(st.code).toBe(0);
    expect(st.stdout).toContain("bridge: offline");
    expect(st.stdout).toContain("state: stopped");
    expect(st.stdout).toMatch(/stoppedAt: \S+ \(\d+s ago\)/);
    expect(st.stdout).toMatch(/lastError: herdr unreachable/);
    expect(st.stdout).toContain(join(dir, ".loom", "bridge", "panefail.stderr.log"));

    const doc = await runCli(["doctor"], 30_000, { LOOM_PROFILE: "panefail" });
    expect(doc.stdout).toMatch(/lastError: herdr unreachable/);
    expect(doc.stdout).not.toMatch(/fail\s+.*bridge/i);

    const fresh = await runCli(["doctor"], 30_000, { LOOM_PROFILE: "never-started" });
    expect(fresh.stdout).toMatch(/info\s+bridge never started under this profile/);
    const none = await runCli(["bridge", "status"], 20_000, { LOOM_PROFILE: "never-started" });
    expect(none.stdout).toContain("bridge: offline");
    expect(none.stdout).not.toContain("status file:");
  }, 90_000);
  test("unreadable status file: doctor warns with path + reason; offline bridge status prints it (P5 · P4-verify L1)", async () => {
    const p = bridgeStatusPath("corrupt");
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, '{"v":1,"pid":7,"sta', "utf8");
    const doc = await runCli(["doctor"], 30_000, { LOOM_PROFILE: "corrupt" });
    expect(doc.stdout).toMatch(/warn\s+bridge status file unreadable: \S*corrupt\.status\.json \(invalid JSON\)/);
    expect(doc.stdout).not.toContain("never started");
    const st = await runCli(["bridge", "status"], 20_000, { LOOM_PROFILE: "corrupt" });
    expect(st.code).toBe(0);
    expect(st.stdout).toContain("bridge: offline");
    expect(st.stdout).toMatch(/bridge status file unreadable: \S*corrupt\.status\.json \(invalid JSON\)/);
    // Readers stay read-only: the corrupt file is left as it was.
    expect(readFileSync(p, "utf8")).toBe('{"v":1,"pid":7,"sta');
  }, 60_000);

  test("headless: `loom bridge start` and online `loom bridge status` print herdr: skipped (headless) (P5 · P4-verify)", async () => {
    let pid: number | undefined;
    try {
      const start = await runCli(["bridge", "start"], 30_000);
      expect(start.code).toBe(0);
      pid = loadBridgeMeta(sessionFile)?.pid;
      expect(start.stdout).toContain("herdr: skipped (headless)");
      expect(start.stdout).not.toContain(absentSock);
      const st = await runCli(["bridge", "status"], 20_000);
      expect(st.stdout).toContain("bridge: online");
      expect(st.stdout).toContain("  herdr: skipped (headless)");
      expect(st.stdout).not.toContain(`  herdr: ${absentSock}`);
      const stop = await runCli(["bridge", "stop"], 30_000);
      expect(stop.code).toBe(0);
      expect(readStatus()?.state).toBe("stopped");
    } finally {
      killHard(pid);
    }
  }, 90_000);
});
