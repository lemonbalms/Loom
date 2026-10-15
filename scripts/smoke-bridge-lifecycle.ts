/**
 * PLAN 0.33.0 Done-when (i) — bridge lifecycle smoke on real spawned bridges.
 *
 *   ① SIGTERM stop → exit 0 · status `stopped` · meta cleared · lock released
 *   ② double start refused (holder pid in the message) · holder's log not truncated
 *   ③ drain with one headless card (fake agent CLI) → result delivered · exit 0 · `stopped`
 *   ④ SIGKILL → heartbeat stops → after > 15 s `loom doctor` warns (died / stale lock)
 *      → restart reclaims the stale lock and reaches `running` → clean stop
 *
 * Bridges are spawned with the product's command (`bun run bridge-main.ts`, as
 * `startBridgeProcess` does) or through the CLI (`loom bridge start|stop|drain`, `loom doctor`)
 * against a loopback relay started here. Everything lives under a temp LOOM_TEST_HOME that is
 * removed at exit (also on failure) — the real ~/.loom is never touched. Headless backend:
 * no herdr needed (D6).
 *
 * Usage (repo root):  bun run smoke:bridge-lifecycle
 */
import { spawn, type Subprocess } from "bun";
import { execFileSync } from "node:child_process";
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
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const HOME = mkdtempSync(join(tmpdir(), "loom-smoke-lifecycle-"));
// Isolate this process before anything resolves loomDir().
process.env.LOOM_TEST_HOME = HOME;
delete process.env.LOOM_RELAY_TOKEN;
delete process.env.LOOM_RELAY_URL;

// Imports after the env is isolated; a failed import still removes the temp home.
async function load() {
  try {
    return {
      protocol: await import("../packages/protocol/src/index"),
      relayMod: await import("../packages/relay/src/index"),
      config: await import("../packages/host/src/bridge-config"),
      lock: await import("../packages/host/src/bridge-lock"),
      metaMod: await import("../packages/host/src/bridge-meta"),
      spawnMod: await import("../packages/host/src/bridge-spawn"),
      statusMod: await import("../packages/host/src/bridge-status"),
      relayClient: await import("../packages/host/src/relay-client"),
      store: await import("../packages/host/src/session-store"),
    };
  } catch (e) {
    console.error(`FAIL setup — import: ${(e as Error).message}`);
    rmSync(HOME, { recursive: true, force: true });
    process.exit(1);
  }
}
const mods = await load();
const { buildDispatchBody, CARD_CONTRACT_VERSION, CARD_DISPATCH_LABEL, CARD_RESULT_LABEL, serializeCardAttachment } =
  mods.protocol;
const { RelayServer } = mods.relayMod;
const { bridgeConfigPath } = mods.config;
const { bridgeLockPath } = mods.lock;
const { bridgeMetaPath, loadBridgeMeta } = mods.metaMod;
const { bridgeLogPath } = mods.spawnMod;
const { bridgeStatusPath } = mods.statusMod;
const { RelayClient } = mods.relayClient;
const { loomDir, resetStateHomeDirCache } = mods.store;

resetStateHomeDirCache();
if (!loomDir().startsWith(`${HOME}/`)) {
  console.error(`FAIL setup — loomDir() ${loomDir()} is not under the temp home ${HOME}; refusing to run`);
  rmSync(HOME, { recursive: true, force: true });
  process.exit(1);
}

const BUN = process.execPath;
const HOST_SRC = join(ROOT, "packages", "host", "src");
const BRIDGE_MAIN = join(HOST_SRC, "bridge-main.ts");
const CLI_MAIN = join(ROOT, "packages", "cli", "src", "index.ts");
const FAKE_AGENT = join(HOST_SRC, "fake-agent-cli.ts");
const PROFILE = "smoke";
const SESSION_FILE = join(HOME, "session.json");
const CWD = realpathSync(HOME);
const BIN_DIR = join(HOME, "bin");
const ARGV_DUMP = join(HOME, "argv.jsonl");
const ABSENT_HERDR = join(HOME, "no-herdr.sock");
const PORT = 33000 + Math.floor(Math.random() * 20000);

type StatusView = { pid?: number; state?: string; heartbeatAt?: string; stoppedAt?: string; herdr?: string; lastError?: string };
type Spawned = { proc: Subprocess; stderr: () => string };

const live: Subprocess[] = [];
const extraPids = new Set<number>();
const results: Array<{ step: string; ok: boolean; detail: string }> = [];
const notes: string[] = [];
let seq = 0;

function env(extra: Record<string, string | undefined> = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (typeof v === "string") out[k] = v;
  delete out.LOOM_RELAY_TOKEN;
  delete out.LOOM_RELAY_URL;
  out.LOOM_TEST_HOME = HOME;
  out.LOOM_SESSION = SESSION_FILE;
  out.LOOM_PROFILE = PROFILE;
  out.LOOM_NO_AUTO_HOST = "1";
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined) delete out[k];
    else out[k] = v;
  }
  return out;
}

function killHard(pid: number | undefined): void {
  if (!pid || pid <= 1 || pid === process.pid) return;
  for (const target of [-pid, pid]) {
    try {
      process.kill(target, "SIGKILL");
    } catch {
      /* gone / not a group leader */
    }
  }
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readStatus(): StatusView | null {
  try {
    return JSON.parse(readFileSync(bridgeStatusPath(PROFILE), "utf8")) as StatusView;
  } catch {
    return null;
  }
}

function readText(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

async function waitFor<T>(probe: () => T | null | false | undefined | Promise<T | null | false | undefined>, ms: number, step = 50): Promise<T | null> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const v = await probe();
    if (v) return v;
    await Bun.sleep(step);
  }
  const v = await probe();
  return v ? v : null;
}

async function exitWithin(proc: Subprocess, ms: number): Promise<number | "timeout"> {
  return Promise.race([proc.exited.then((c) => c), Bun.sleep(ms).then(() => "timeout" as const)]);
}

/** The product's spawn command (`startBridgeProcess`: `bun run bridge-main.ts`, LOOM_SESSION set). */
function spawnBridge(extra: Record<string, string | undefined> = {}): Spawned {
  seq += 1;
  const path = join(HOME, `spawn-${seq}.stderr.log`);
  const fd = openSync(path, "w", 0o600);
  const proc = spawn({ cmd: [BUN, "run", BRIDGE_MAIN], env: env(extra), stdout: "ignore", stderr: fd, stdin: "ignore" });
  closeSync(fd);
  live.push(proc);
  return { proc, stderr: () => readText(path) };
}

async function cli(args: string[], timeoutMs: number) {
  const proc = spawn({ cmd: [BUN, "run", CLI_MAIN, ...args], env: env(), stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  live.push(proc);
  const code = await exitWithin(proc, timeoutMs);
  if (code === "timeout") killHard(proc.pid);
  const stdout = await new Response(proc.stdout as ReadableStream).text();
  const stderr = await new Response(proc.stderr as ReadableStream).text();
  return { code, stdout, stderr };
}

async function waitRunning(pid: number | undefined, ms = 15_000): Promise<boolean> {
  return (
    (await waitFor(() => {
      const s = readStatus();
      return s?.state === "running" && (pid === undefined || s.pid === pid) && existsSync(bridgeMetaPath(SESSION_FILE));
    }, ms)) === true
  );
}

function cleanStopProblems(pid: number | undefined): string[] {
  const p: string[] = [];
  const s = readStatus();
  if (s?.state !== "stopped") p.push(`status=${s?.state}`);
  if (pid !== undefined && s?.pid !== pid) p.push(`status pid=${s?.pid} != ${pid}`);
  if (existsSync(bridgeMetaPath(SESSION_FILE))) p.push("meta present");
  if (existsSync(bridgeLockPath(PROFILE))) p.push("lock present");
  return p;
}

function workerPids(): number[] {
  return readText(ARGV_DUMP)
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
}

function record(step: string, problems: string[], okDetail: string): void {
  const ok = problems.length === 0;
  const detail = ok ? okDetail : problems.join("; ");
  results.push({ step, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${step} — ${detail}`);
}

const relay = new RelayServer({ host: "127.0.0.1", port: PORT });
// biome-ignore lint/suspicious/noExplicitAny: assigned in setup
let tower: any = null;
let roomId = "";
let cleaned = false;

async function cleanup(): Promise<void> {
  if (cleaned) return;
  cleaned = true;
  for (const p of live) killHard(p.pid);
  for (const pid of workerPids()) killHard(pid);
  const meta = loadBridgeMeta(SESSION_FILE);
  if (meta) extraPids.add(meta.pid);
  for (const pid of extraPids) killHard(pid);
  try {
    tower?.close();
  } catch {
    /* */
  }
  try {
    relay.stop();
  } catch {
    /* */
  }
  rmSync(HOME, { recursive: true, force: true });
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    void cleanup().finally(() => process.exit(130));
  });
}

async function dispatch(cardId: string): Promise<void> {
  const ack = await tower.handoff({
    to: "@node/smoke",
    body: buildDispatchBody({ title: "lifecycle smoke card", cardId, node: "node/smoke" }),
    mode: "task",
    attachments: [
      serializeCardAttachment(CARD_DISPATCH_LABEL, {
        v: CARD_CONTRACT_VERSION,
        cardId,
        sourceRoomId: roomId,
        prompt: "write the bytes",
        agentKind: "claude" as const,
      }),
    ],
  });
  if (!["queued", "delivered"].includes(ack.status)) throw new Error(`dispatch ack ${ack.status}`);
}

async function countResults(cardId: string): Promise<number> {
  let n = 0;
  for (const entry of await tower.listInbox()) {
    for (const a of entry.handoff.attachments ?? []) {
      if (a.label !== CARD_RESULT_LABEL) continue;
      if ((JSON.parse(a.content) as { cardId?: string }).cardId === cardId) n += 1;
    }
  }
  return n;
}

async function setup(): Promise<void> {
  relay.start();
  tower = new RelayClient({ url: `ws://127.0.0.1:${PORT}/ws` });
  const created = await tower.createRoom({ roomName: "lifecycle-smoke", displayName: "tower", agentKind: "shell", peerId: "p_tower" });
  if (created.type !== "room.state") throw new Error("createRoom failed");
  roomId = created.roomId;
  writeFileSync(
    SESSION_FILE,
    JSON.stringify({
      roomId,
      roomName: created.roomName ?? "lifecycle-smoke",
      inviteCode: created.inviteCode ?? "",
      peerId: "p_node",
      displayName: "node/smoke",
      color: "#0f0",
      agentKind: "shell",
      relayUrl: `ws://127.0.0.1:${PORT}/ws`,
      updatedAt: new Date().toISOString(),
    }),
    "utf8",
  );
  mkdirSync(BIN_DIR, { recursive: true });
  const wrapper = join(BIN_DIR, "claude");
  writeFileSync(wrapper, `#!/bin/sh\nexec "${BUN}" "${FAKE_AGENT}" --fake-kind claude "$@"\n`);
  chmodSync(wrapper, 0o755);
  mkdirSync(join(bridgeConfigPath(PROFILE), ".."), { recursive: true });
  writeFileSync(
    bridgeConfigPath(PROFILE),
    JSON.stringify({
      authorizedDispatchers: ["p_tower"],
      herdrSocketPath: ABSENT_HERDR,
      worker: { backend: "headless", cwd: CWD, allowedRoots: [CWD], timeoutMs: 60_000, agentBin: { claude: wrapper } },
    }),
    "utf8",
  );
}

// ① SIGTERM stop
async function step1(): Promise<void> {
  const b = spawnBridge();
  const problems: string[] = [];
  if (!(await waitRunning(b.proc.pid))) {
    record("① SIGTERM stop", [`never reached running: ${JSON.stringify(readStatus())} ${b.stderr().slice(-300)}`], "");
    return;
  }
  const t0 = Date.now();
  b.proc.kill("SIGTERM");
  const sawStopping = await waitFor(() => {
    const s = readStatus()?.state;
    return s === "stopping" || s === "stopped" ? s : null;
  }, 12_000, 5);
  const code = await exitWithin(b.proc, 12_000);
  const ms = Date.now() - t0;
  if (code !== 0) problems.push(`exit=${code}`);
  if (!sawStopping) problems.push("no stopping/stopped observed");
  problems.push(...cleanStopProblems(b.proc.pid));
  notes.push(`UK-1: SIGTERM → exit ${code} in ${ms} ms (bun ${Bun.version})`);
  record("① SIGTERM stop", problems, `exit 0 in ${ms} ms · status stopped · meta cleared · lock released`);
}

// ② double start refused; holder's log not truncated
async function step2(): Promise<void> {
  const problems: string[] = [];
  const start = await cli(["bridge", "start"], 30_000);
  const meta = loadBridgeMeta(SESSION_FILE);
  const holder = meta?.pid;
  if (holder) extraPids.add(holder);
  if (start.code !== 0 || !holder || !(await waitRunning(holder))) {
    record("② double start refused", [`holder start failed code=${start.code} ${start.stderr.slice(-300)}`], "");
    return;
  }
  if (!start.stdout.includes("herdr: skipped (headless)")) problems.push("start output lacks `herdr: skipped (headless)`");
  const logPath = bridgeLogPath(PROFILE, join(loomDir(), "bridge"));
  const holderLog = readText(logPath);
  if (!holderLog.trim()) problems.push(`holder log empty: ${logPath}`);

  // UK-2: lstart as recorded by the lock vs `ps -o lstart=` now (macOS).
  try {
    const owner = JSON.parse(readFileSync(join(bridgeLockPath(PROFILE), "owner.json"), "utf8")) as { lstart?: string };
    const ps = execFileSync("/bin/ps", ["-o", "lstart=", "-p", String(holder)], {
      env: { ...process.env, LC_ALL: "C", LANG: "C", TZ: "UTC" },
      encoding: "utf8",
    }).trim();
    notes.push(`UK-2: ${process.platform} ps -o lstart= → "${ps}" · owner.json lstart → "${owner.lstart}"`);
  } catch (e) {
    notes.push(`UK-2: lstart read failed: ${(e as Error).message}`);
  }

  // A second bridge process (same spawn command) is refused by the lock, naming the holder.
  const second = spawnBridge();
  const code = await exitWithin(second.proc, 15_000);
  if (code !== 1) problems.push(`second bridge exit=${code}`);
  if (!second.stderr().includes(`pid ${holder}`)) problems.push(`refusal lacks holder pid ${holder}: ${second.stderr().slice(-300)}`);
  if (!alive(holder)) problems.push("holder died");
  // `loom bridge start` again: reports the running holder; the holder's log is kept.
  const again = await cli(["bridge", "start"], 30_000);
  if (!again.stdout.includes(`already running (pid ${holder}`)) problems.push(`second CLI start: ${again.stdout.trim()} ${again.stderr.trim()}`);
  if (!readText(logPath).startsWith(holderLog)) problems.push("holder log truncated");

  const stop = await cli(["bridge", "stop"], 30_000);
  if (stop.code !== 0) problems.push(`bridge stop exit=${stop.code}`);
  const gone = await waitFor(() => !alive(holder), 15_000);
  if (!gone) problems.push("holder still alive after stop");
  problems.push(...cleanStopProblems(holder));
  const refusal = second.stderr().split("\n").find((l) => l.includes(`pid ${holder}`)) ?? "";
  record("② double start refused", problems, `second exit 1 — "${refusal.trim().slice(0, 140)}" · holder log intact · CLI stop clean`);
}

// ③ drain with one headless card
async function step3(): Promise<void> {
  const problems: string[] = [];
  const b = spawnBridge({ FAKE_DURATION_MS: "4000", FAKE_TIME_SCALE: "1", FAKE_OUTPUT_BYTES: "32", FAKE_ARGV_DUMP: ARGV_DUMP });
  if (!(await waitRunning(b.proc.pid))) {
    record("③ drain", [`never reached running ${b.stderr().slice(-300)}`], "");
    return;
  }
  const cardId = "task_a0330e0000000001";
  const before = workerPids().length;
  await dispatch(cardId);
  if (!(await waitFor(() => workerPids().length > before, 15_000))) problems.push("worker never started");
  const t0 = Date.now();
  const drain = await cli(["bridge", "drain", "--timeout", "60"], 90_000);
  if (drain.code !== 0) problems.push(`drain exit=${drain.code} ${drain.stderr.trim()}`);
  if (!drain.stdout.includes(`bridge drained and stopped (pid ${b.proc.pid})`)) problems.push(`drain output: ${drain.stdout.trim()}`);
  const code = await exitWithin(b.proc, 15_000);
  if (code !== 0) problems.push(`bridge exit=${code}`);
  const delivered = await waitFor(async () => ((await countResults(cardId)) >= 1 ? 1 : null), 10_000, 200);
  const n = await countResults(cardId);
  if (!delivered || n !== 1) problems.push(`card results=${n}`);
  problems.push(...cleanStopProblems(b.proc.pid));
  record("③ drain", problems, `card result delivered ×${n} · drain ${Date.now() - t0} ms · exit 0 · status stopped`);
}

// ④ SIGKILL → stale → doctor warn → restart reclaims
async function step4(): Promise<void> {
  const problems: string[] = [];
  const a = spawnBridge();
  if (!(await waitRunning(a.proc.pid))) {
    record("④ SIGKILL / reclaim", [`never reached running ${a.stderr().slice(-300)}`], "");
    return;
  }
  const pid = a.proc.pid;
  killHard(pid);
  await exitWithin(a.proc, 5_000);
  const hb = readStatus()?.heartbeatAt ?? "";
  const hbMs = Date.parse(hb);
  if (!Number.isFinite(hbMs)) problems.push("no heartbeatAt");
  // Wait until the last heartbeat is > 15 s old (STATUS_STALE_MS), then confirm it never moved.
  const waitMs = Math.max(0, hbMs + 16_500 - Date.now());
  await Bun.sleep(waitMs);
  const after = readStatus();
  if (after?.heartbeatAt !== hb) problems.push(`heartbeat moved after SIGKILL (${hb} → ${after?.heartbeatAt})`);
  if (after?.state !== "running") problems.push(`state after SIGKILL=${after?.state}`);
  const ageSec = Math.round((Date.now() - hbMs) / 1000);
  const doc = await cli(["doctor"], 30_000);
  const died = doc.stdout.match(/warn\s+(bridge died without clean stop[^\n]*)/);
  if (!died) problems.push(`doctor lacks died warn: ${doc.stdout.slice(doc.stdout.indexOf("\nBridge")).slice(0, 400)}`);
  if (!new RegExp(`lock holder: pid ${pid} stale`).test(doc.stdout)) problems.push("doctor lacks stale lock line");
  if (/fail\s+.*bridge/i.test(doc.stdout)) problems.push("doctor printed a bridge fail line");

  const b = spawnBridge();
  if (!(await waitRunning(b.proc.pid))) {
    problems.push(`restart never reached running ${b.stderr().slice(-300)}`);
  } else {
    if (!b.stderr().includes(`reclaimed stale lock pid=${pid}`)) problems.push("no reclaim line in restart log");
    b.proc.kill("SIGTERM");
    const code = await exitWithin(b.proc, 12_000);
    if (code !== 0) problems.push(`restart stop exit=${code}`);
    problems.push(...cleanStopProblems(b.proc.pid));
  }
  record(
    "④ SIGKILL / reclaim",
    problems,
    `heartbeat frozen ${ageSec}s · doctor "${died?.[1]?.trim().slice(0, 120)}" · restart reclaimed pid ${pid} → running → SIGTERM exit 0`,
  );
}

let exitCode = 0;
try {
  console.log(`smoke:bridge-lifecycle — temp home ${HOME} · bun ${Bun.version} · ${process.platform}`);
  await setup();
  await step1();
  await step2();
  await step3();
  await step4();
  for (const n of notes) console.log(`note ${n}`);
  const failed = results.filter((r) => !r.ok).length;
  if (failed > 0 || results.length !== 4) exitCode = 1;
  console.log(`${exitCode === 0 ? "PASS" : "FAIL"} smoke:bridge-lifecycle — ${results.length - failed}/4 steps`);
} catch (e) {
  console.error(`FAIL smoke:bridge-lifecycle — ${(e as Error).stack ?? e}`);
  exitCode = 1;
} finally {
  await cleanup();
}
process.exit(exitCode);
