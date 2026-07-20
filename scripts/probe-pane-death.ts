/**
 * PANE-DEATH observation spike — raw herdr socket probe (no HerdrClient).
 *
 * Purpose: capture real v0.7.4 push events (kind, order, payload, ms timestamps)
 * when a scratch pane dies via natural exit / SIGKILL / pane.close API.
 *
 * Usage (repo root):
 *   bun scripts/probe-pane-death.ts
 *   bun scripts/probe-pane-death.ts --scenario a|b|c|all
 *   LOOM_HERDR_SOCKET=/path/to/herdr.sock bun scripts/probe-pane-death.ts
 *
 * Safety: only creates and kills panes labeled panedeath-spike-*; never
 * touches baseline panes (w3:p2, w3:p1J, w4:p1, w8:p1, w3:p46, …).
 *
 * Does NOT import HerdrClient — reimplements minimal NDJSON RPC so
 * observation is not polluted by incremental re-subscribe logic.
 */
import { createConnection, type Socket } from "node:net";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  appendFileSync,
  mkdirSync,
  writeFileSync,
  statSync,
  readFileSync,
} from "node:fs";

// ─── config ──────────────────────────────────────────────────────────────────

const SOCKET =
  process.env.LOOM_HERDR_SOCKET ??
  join(homedir(), ".config", "herdr", "herdr.sock");

const LOG_DIR = join(homedir(), ".config", "herdr");
const HERDR_SERVER_LOG = join(LOG_DIR, "herdr-server.log");

const PROTECTED = new Set([
  "w3:p2",
  "w3:p1J",
  "w4:p1",
  "w8:p1",
  "w3:p46",
]);

const NAME_PREFIX = "panedeath-spike";
const POST_CLOSE_HOLD_MS = 10_000;
const EVENT_IDLE_MS = 2_500; // after expected terminal action, wait for late pushes
const OUT_DIR = join(import.meta.dir, "..", "docs", "spikes");
const RAW_LOG = join(OUT_DIR, ".panedeath-probe-raw.jsonl");

type Scenario = "a" | "b" | "c";

// ─── logging ─────────────────────────────────────────────────────────────────

type LogLine = {
  t_ms: number;
  t_iso: string;
  kind: string;
  scenario?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload?: any;
};

const sessionStart = Date.now();
const logLines: LogLine[] = [];

function nowMs(): number {
  return Date.now();
}

function log(kind: string, payload?: unknown, scenario?: string): void {
  const t_ms = nowMs();
  const entry: LogLine = {
    t_ms,
    t_iso: new Date(t_ms).toISOString(),
    kind,
    scenario,
    payload,
  };
  logLines.push(entry);
  const prefix = scenario ? `[${scenario}]` : "[-]";
  const body =
    payload === undefined
      ? ""
      : typeof payload === "string"
        ? payload
        : JSON.stringify(payload);
  console.log(`${entry.t_iso} +${t_ms - sessionStart}ms ${prefix} ${kind}${body ? " " + body : ""}`);
  try {
    appendFileSync(RAW_LOG, JSON.stringify(entry) + "\n");
  } catch {
    /* best-effort */
  }
}

// ─── raw NDJSON RPC (no HerdrClient) ─────────────────────────────────────────

function nextId(): string {
  return `panedeath-${randomBytes(6).toString("hex")}`;
}

function parseNdjsonLines(
  buf: { text: string },
  onLine: (msg: Record<string, unknown>) => void,
): void {
  while (true) {
    const nl = buf.text.indexOf("\n");
    if (nl < 0) break;
    const line = buf.text.slice(0, nl).trim();
    buf.text = buf.text.slice(nl + 1);
    if (!line) continue;
    try {
      onLine(JSON.parse(line) as Record<string, unknown>);
    } catch {
      log("MALFORMED_LINE", line);
    }
  }
}

/** One-shot RPC: open → write → await matching id → destroy. */
function rpc(
  method: string,
  params: Record<string, unknown> = {},
  timeoutMs = 15_000,
): Promise<unknown> {
  const id = nextId();
  return new Promise((resolve, reject) => {
    let settled = false;
    const buf = { text: "" };
    const sock = createConnection(SOCKET);
    const timer = setTimeout(() => {
      finish(() => reject(new Error(`rpc ${method} timed out after ${timeoutMs}ms`)));
    }, timeoutMs);
    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
      try {
        sock.destroy();
      } catch {
        /* */
      }
    };
    sock.setEncoding("utf8");
    sock.on("connect", () => {
      const line = `${JSON.stringify({ id, method, params })}\n`;
      log("RPC_TX", { id, method, params });
      sock.write(line, (err) => {
        if (err) finish(() => reject(err));
      });
    });
    sock.on("data", (chunk: string) => {
      buf.text += chunk;
      parseNdjsonLines(buf, (msg) => {
        if (settled) return;
        // ignore stray event pushes on one-shot sockets
        if (typeof msg.event === "string" && msg.id === undefined) return;
        const msgId = msg.id != null ? String(msg.id) : "";
        if (msgId !== id) return;
        log("RPC_RX", msg);
        if (msg.error) {
          const err = msg.error as { message?: string; code?: string };
          finish(() =>
            reject(new Error(err.message ?? `herdr error ${err.code ?? "unknown"}`)),
          );
        } else {
          finish(() => resolve(msg.result ?? msg));
        }
      });
    });
    sock.on("error", (err) => {
      finish(() => reject(err instanceof Error ? err : new Error(String(err))));
    });
    sock.on("close", () => {
      finish(() => reject(new Error(`rpc ${method}: connection closed before response`)));
    });
  });
}

type EventSink = {
  /** every raw push as received */
  events: Array<{ t_ms: number; t_iso: string; raw: Record<string, unknown> }>;
  close: () => void;
  waitFor: (
    pred: (raw: Record<string, unknown>) => boolean,
    timeoutMs: number,
  ) => Promise<Record<string, unknown> | null>;
};

/**
 * Long-lived events.subscribe connection. Raw socket — not HerdrClient.
 * Subscriptions use dotted names from herdr schema (pane.closed / pane.exited).
 */
function openEventSubscription(
  subscriptions: Array<{ type: string; pane_id?: string }>,
  scenario: string,
): Promise<EventSink> {
  const id = nextId();
  return new Promise((resolve, reject) => {
    let settled = false;
    const buf = { text: "" };
    const sock = createConnection(SOCKET);
    const events: EventSink["events"] = [];
    const waiters: Array<{
      pred: (raw: Record<string, unknown>) => boolean;
      resolve: (v: Record<string, unknown> | null) => void;
      timer: ReturnType<typeof setTimeout>;
    }> = [];

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        sock.destroy();
      } catch {
        /* */
      }
      reject(new Error("events.subscribe ACK timed out"));
    }, 15_000);

    sock.setEncoding("utf8");
    sock.on("connect", () => {
      const line = `${JSON.stringify({
        id,
        method: "events.subscribe",
        params: { subscriptions },
      })}\n`;
      log("SUBSCRIBE_TX", { id, subscriptions }, scenario);
      sock.write(line);
    });
    sock.on("data", (chunk: string) => {
      buf.text += chunk;
      parseNdjsonLines(buf, (msg) => {
        // ACK
        if (!settled) {
          const msgId = msg.id != null ? String(msg.id) : "";
          if (msgId === id) {
            clearTimeout(timer);
            if (msg.error) {
              settled = true;
              const err = msg.error as { message?: string; code?: string };
              reject(
                new Error(
                  err.message ?? `events.subscribe error ${err.code ?? "unknown"}`,
                ),
              );
              try {
                sock.destroy();
              } catch {
                /* */
              }
              return;
            }
            settled = true;
            log("SUBSCRIBE_ACK", msg, scenario);
            resolve({
              events,
              close: () => {
                try {
                  sock.destroy();
                } catch {
                  /* */
                }
              },
              waitFor: (pred, timeoutMs) =>
                new Promise((res) => {
                  // already buffered?
                  for (const e of events) {
                    if (pred(e.raw)) {
                      res(e.raw);
                      return;
                    }
                  }
                  const t = setTimeout(() => {
                    const i = waiters.findIndex((w) => w.timer === t);
                    if (i >= 0) waiters.splice(i, 1);
                    res(null);
                  }, timeoutMs);
                  waiters.push({ pred, resolve: res, timer: t });
                }),
            });
            return;
          }
        }
        // push: {event, data} or {type:"event", event, data}
        const isPush =
          (typeof msg.event === "string" && msg.id === undefined) ||
          (msg.type === "event" && typeof msg.event === "string");
        if (isPush) {
          const t_ms = nowMs();
          const t_iso = new Date(t_ms).toISOString();
          events.push({ t_ms, t_iso, raw: msg });
          // RAW — full JSON, no summarization
          log("EVENT_PUSH", msg, scenario);
          for (let i = waiters.length - 1; i >= 0; i--) {
            if (waiters[i].pred(msg)) {
              clearTimeout(waiters[i].timer);
              waiters[i].resolve(msg);
              waiters.splice(i, 1);
            }
          }
        }
      });
    });
    sock.on("error", (err) => {
      if (!settled) {
        clearTimeout(timer);
        settled = true;
        reject(err instanceof Error ? err : new Error(String(err)));
      } else {
        log("SUBSCRIBE_ERR", String(err), scenario);
      }
    });
    sock.on("close", () => {
      log("SUBSCRIBE_CLOSE", {}, scenario);
      for (const w of waiters) {
        clearTimeout(w.timer);
        w.resolve(null);
      }
      waiters.length = 0;
    });
  });
}

// ─── helpers ─────────────────────────────────────────────────────────────────

async function listPaneIds(): Promise<string[]> {
  const result = (await rpc("pane.list", {})) as {
    panes?: Array<{ pane_id?: string }>;
  };
  const panes = Array.isArray(result.panes) ? result.panes : [];
  return panes
    .map((p) => (typeof p.pane_id === "string" ? p.pane_id : ""))
    .filter(Boolean);
}

async function processInfo(paneId: string): Promise<unknown> {
  // wire method is pane.process_info (underscore) per herdr schema
  try {
    return await rpc("pane.process_info", { pane_id: paneId });
  } catch (e) {
    log("PROCESS_INFO_ERR", String(e));
    return null;
  }
}

function extractShellPid(info: unknown): number | null {
  if (!info || typeof info !== "object") return null;
  const r = info as Record<string, unknown>;
  // result may be nested under process_info
  const pi =
    (r.process_info as Record<string, unknown> | undefined) ??
    (r as Record<string, unknown>);
  if (typeof pi.shell_pid === "number") return pi.shell_pid;
  const fps = pi.foreground_processes;
  if (Array.isArray(fps) && fps.length) {
    const first = fps[0] as Record<string, unknown>;
    if (typeof first.pid === "number") return first.pid;
  }
  if (typeof pi.foreground_process_group_id === "number") {
    return pi.foreground_process_group_id;
  }
  return null;
}

function extractAllPids(info: unknown): number[] {
  const out: number[] = [];
  if (!info || typeof info !== "object") return out;
  const r = info as Record<string, unknown>;
  const pi =
    (r.process_info as Record<string, unknown> | undefined) ?? r;
  if (typeof pi.shell_pid === "number") out.push(pi.shell_pid);
  if (typeof pi.foreground_process_group_id === "number") {
    out.push(pi.foreground_process_group_id);
  }
  const fps = pi.foreground_processes;
  if (Array.isArray(fps)) {
    for (const p of fps) {
      if (p && typeof p === "object" && typeof (p as { pid?: number }).pid === "number") {
        out.push((p as { pid: number }).pid);
      }
    }
  }
  return [...new Set(out)];
}

async function agentStart(opts: {
  name: string;
  argv: string[];
  cwd?: string;
  focus?: boolean;
}): Promise<{ pane_id: string; terminal_id: string }> {
  const params: Record<string, unknown> = {
    name: opts.name,
    argv: opts.argv,
    focus: opts.focus ?? false,
  };
  if (opts.cwd) params.cwd = opts.cwd;
  const result = (await rpc("agent.start", params)) as {
    agent?: { pane_id?: string; terminal_id?: string };
  };
  const agent = result.agent;
  if (!agent?.pane_id || !agent?.terminal_id) {
    throw new Error(`agent.start missing pane_id/terminal_id: ${JSON.stringify(result)}`);
  }
  return { pane_id: agent.pane_id, terminal_id: agent.terminal_id };
}

async function paneClose(paneId: string): Promise<unknown> {
  assertScratch(paneId);
  return rpc("pane.close", { pane_id: paneId });
}

function assertScratch(paneId: string): void {
  if (PROTECTED.has(paneId)) {
    throw new Error(
      `REFUSED: pane ${paneId} is protected — spike must only touch scratch panes`,
    );
  }
  // also refuse if it doesn't look like a herdr pane id we own later — caller checks
}

function assertOwned(paneId: string, owned: Set<string>): void {
  assertScratch(paneId);
  if (!owned.has(paneId)) {
    throw new Error(
      `REFUSED: pane ${paneId} was not created by this spike (owned=${[...owned].join(",")})`,
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function eventName(raw: Record<string, unknown>): string {
  return typeof raw.event === "string" ? raw.event : "";
}

function eventData(raw: Record<string, unknown>): Record<string, unknown> {
  const d = raw.data;
  if (d && typeof d === "object") return d as Record<string, unknown>;
  return {};
}

function paneIdFromEvent(raw: Record<string, unknown>): string {
  const d = eventData(raw);
  if (typeof d.pane_id === "string") return d.pane_id;
  // some pushes nest under pane
  const pane = d.pane;
  if (pane && typeof pane === "object") {
    const p = pane as Record<string, unknown>;
    if (typeof p.pane_id === "string") return p.pane_id;
  }
  return "";
}

function isTerminalFor(paneId: string, raw: Record<string, unknown>): boolean {
  const name = eventName(raw);
  if (!name.includes("closed") && !name.includes("exited") && !name.includes("exit")) {
    return false;
  }
  const pid = paneIdFromEvent(raw);
  return !pid || pid === paneId;
}

/** Byte offset snapshot of herdr-server.log for post-scenario tail. */
function snapshotLogOffset(): number {
  try {
    return statSync(HERDR_SERVER_LOG).size;
  } catch {
    return 0;
  }
}

function readLogSince(offset: number): string {
  try {
    const text = readFileSync(HERDR_SERVER_LOG, "utf8");
    if (offset <= 0) return text.slice(-50_000);
    if (text.length <= offset) return "";
    return text.slice(offset);
  } catch (e) {
    return `/* log read failed: ${e} */`;
  }
}

// ─── scenarios ───────────────────────────────────────────────────────────────

const SUBSCRIPTIONS = [
  { type: "pane.closed" },
  { type: "pane.exited" },
  { type: "pane.created" },
  { type: "pane.updated" },
  { type: "pane.agent_status_changed" }, // may need pane_id — try without first; schema requires pane_id
];

// agent_status_changed requires pane_id — we'll add per-pane after start

async function runScenarioA(owned: Set<string>): Promise<boolean> {
  const scenario: Scenario = "a";
  log("SCENARIO_BEGIN", { name: "A", desc: "natural exit (process exits 0)" }, scenario);

  const sink = await openEventSubscription(
    [
      { type: "pane.closed" },
      { type: "pane.exited" },
      { type: "pane.created" },
      { type: "pane.updated" },
    ],
    scenario,
  );

  const name = `${NAME_PREFIX}-A-${Date.now().toString(36)}`;
  // short-lived shell — natural death
  const started = await agentStart({
    name,
    argv: ["bash", "-lc", "echo panedeath-A-start; sleep 2; echo panedeath-A-exit; exit 0"],
    cwd: process.cwd(),
    focus: false,
  });
  owned.add(started.pane_id);
  log(
    "SCRATCH_CREATED",
    { pane_id: started.pane_id, terminal_id: started.terminal_id, name },
    scenario,
  );

  // also subscribe to agent_status for this pane on a second stream? schema requires
  // pane_id for status — open a second subscriber for completeness
  const sink2 = await openEventSubscription(
    [
      { type: "pane.agent_status_changed", pane_id: started.pane_id },
    ],
    scenario,
  );

  const info = await processInfo(started.pane_id);
  log("PROCESS_INFO", info, scenario);
  const pids = extractAllPids(info);
  log("OWNED_PIDS", { pane_id: started.pane_id, pids }, scenario);

  // wait for natural death events (process ~2s + slack)
  log("WAIT_NATURAL_EXIT", { pane_id: started.pane_id, wait_ms: 15_000 }, scenario);
  const deadline = nowMs() + 15_000;
  let sawTerminal = false;
  while (nowMs() < deadline) {
    const hit = await sink.waitFor(
      (raw) => isTerminalFor(started.pane_id, raw),
      Math.min(EVENT_IDLE_MS, deadline - nowMs()),
    );
    if (hit) {
      sawTerminal = true;
      // continue collecting for a bit more for ordering completeness
      await sleep(EVENT_IDLE_MS);
      break;
    }
  }
  // extra hold for late events
  await sleep(EVENT_IDLE_MS);

  // if pane still listed, note it (do not kill — natural-exit scenario)
  const remaining = await listPaneIds();
  log(
    "POST_STATE",
    {
      pane_still_listed: remaining.includes(started.pane_id),
      saw_terminal_event: sawTerminal,
      events_for_pane: sink.events
        .filter((e) => paneIdFromEvent(e.raw) === started.pane_id || !paneIdFromEvent(e.raw))
        .map((e) => ({ t_iso: e.t_iso, t_ms: e.t_ms, raw: e.raw })),
      all_push_count: sink.events.length + sink2.events.length,
    },
    scenario,
  );

  // cleanup: if pane still open after natural exit wait, close ONLY our scratch
  if (remaining.includes(started.pane_id)) {
    log("CLEANUP_CLOSE_STILL_OPEN", { pane_id: started.pane_id }, scenario);
    assertOwned(started.pane_id, owned);
    try {
      await paneClose(started.pane_id);
    } catch (e) {
      log("CLEANUP_CLOSE_ERR", String(e), scenario);
    }
    await sleep(1000);
  }

  sink.close();
  sink2.close();
  log("SCENARIO_END", { name: "A", ok: sawTerminal || !remaining.includes(started.pane_id) }, scenario);
  return sawTerminal || true; // always "ran"; success judged from logs
}

async function runScenarioB(owned: Set<string>): Promise<boolean> {
  const scenario: Scenario = "b";
  log("SCENARIO_BEGIN", { name: "B", desc: "SIGKILL foreground process" }, scenario);

  const sink = await openEventSubscription(
    [
      { type: "pane.closed" },
      { type: "pane.exited" },
      { type: "pane.created" },
      { type: "pane.updated" },
    ],
    scenario,
  );

  const name = `${NAME_PREFIX}-B-${Date.now().toString(36)}`;
  const started = await agentStart({
    name,
    argv: ["bash", "-lc", "echo panedeath-B-start; sleep 300; echo panedeath-B-should-not-print"],
    cwd: process.cwd(),
    focus: false,
  });
  owned.add(started.pane_id);
  log(
    "SCRATCH_CREATED",
    { pane_id: started.pane_id, terminal_id: started.terminal_id, name },
    scenario,
  );

  const sink2 = await openEventSubscription(
    [{ type: "pane.agent_status_changed", pane_id: started.pane_id }],
    scenario,
  );

  // let process settle
  await sleep(800);
  const info = await processInfo(started.pane_id);
  log("PROCESS_INFO", info, scenario);
  const pids = extractAllPids(info);
  const shellPid = extractShellPid(info);
  log(
    "PRE_SIGKILL_EVIDENCE",
    {
      pane_id: started.pane_id,
      shell_pid: shellPid,
      all_pids: pids,
      owned_by_spike: true,
      name,
    },
    scenario,
  );

  if (!shellPid && pids.length === 0) {
    log("SIGKILL_ABORT", "no pid found — will not kill", scenario);
    // still try to close our pane cleanly
    assertOwned(started.pane_id, owned);
    await paneClose(started.pane_id).catch((e) => log("CLEANUP_ERR", String(e), scenario));
    sink.close();
    sink2.close();
    return false;
  }

  // Prefer killing the long sleep child (foreground), not just shell, if visible
  let killTarget = shellPid;
  const fps =
    info &&
    typeof info === "object" &&
    ((info as { process_info?: { foreground_processes?: Array<{ pid?: number; name?: string; cmdline?: string }> } })
      .process_info?.foreground_processes ??
      (info as { foreground_processes?: Array<{ pid?: number; name?: string; cmdline?: string }> })
        .foreground_processes);
  if (Array.isArray(fps)) {
    const sleepProc = fps.find(
      (p) =>
        (typeof p.name === "string" && p.name.includes("sleep")) ||
        (typeof p.cmdline === "string" && p.cmdline.includes("sleep")),
    );
    if (sleepProc?.pid) killTarget = sleepProc.pid;
    // if only bash is foreground with sleep as child of that group, kill pgid
  }

  // SAFETY: refuse if target is protected pane's process — we only kill our pane's pids
  assertOwned(started.pane_id, owned);
  log(
    "SIGKILL_TARGET",
    {
      pane_id: started.pane_id,
      pid: killTarget,
      proof: "pane created this scenario with name prefix panedeath-spike-B",
    },
    scenario,
  );

  try {
    process.kill(killTarget!, "SIGKILL");
    log("SIGKILL_SENT", { pid: killTarget, signal: "SIGKILL" }, scenario);
  } catch (e) {
    // try process group
    try {
      process.kill(-killTarget!, "SIGKILL");
      log("SIGKILL_SENT_PGID", { pgid: killTarget, signal: "SIGKILL" }, scenario);
    } catch (e2) {
      log("SIGKILL_FAILED", { err: String(e), err2: String(e2) }, scenario);
    }
  }

  // also kill remaining pids for this pane (shell may survive child kill)
  for (const p of pids) {
    if (p === killTarget) continue;
    try {
      process.kill(p, "SIGKILL");
      log("SIGKILL_EXTRA", { pid: p }, scenario);
    } catch {
      /* already dead */
    }
  }

  log("WAIT_POST_SIGKILL", { wait_ms: 12_000 }, scenario);
  const deadline = nowMs() + 12_000;
  while (nowMs() < deadline) {
    const hit = await sink.waitFor(
      (raw) => isTerminalFor(started.pane_id, raw),
      Math.min(EVENT_IDLE_MS, deadline - nowMs()),
    );
    if (hit) {
      await sleep(EVENT_IDLE_MS);
      break;
    }
  }
  await sleep(EVENT_IDLE_MS);

  const remaining = await listPaneIds();
  log(
    "POST_STATE",
    {
      pane_still_listed: remaining.includes(started.pane_id),
      events_for_pane: sink.events
        .filter((e) => {
          const id = paneIdFromEvent(e.raw);
          return !id || id === started.pane_id;
        })
        .map((e) => ({ t_iso: e.t_iso, t_ms: e.t_ms, raw: e.raw })),
    },
    scenario,
  );

  if (remaining.includes(started.pane_id)) {
    log("CLEANUP_CLOSE_STILL_OPEN", { pane_id: started.pane_id }, scenario);
    assertOwned(started.pane_id, owned);
    try {
      await paneClose(started.pane_id);
    } catch (e) {
      log("CLEANUP_CLOSE_ERR", String(e), scenario);
    }
    await sleep(1000);
  }

  sink.close();
  sink2.close();
  log("SCENARIO_END", { name: "B" }, scenario);
  return true;
}

async function runScenarioC(owned: Set<string>): Promise<boolean> {
  const scenario: Scenario = "c";
  log(
    "SCENARIO_BEGIN",
    {
      name: "C",
      desc: "pane.close API then hold 10s for late child-exit / PaneDied",
    },
    scenario,
  );

  const logOffset = snapshotLogOffset();
  log("HERDR_LOG_OFFSET", { path: HERDR_SERVER_LOG, offset: logOffset }, scenario);

  const sink = await openEventSubscription(
    [
      { type: "pane.closed" },
      { type: "pane.exited" },
      { type: "pane.created" },
      { type: "pane.updated" },
    ],
    scenario,
  );

  const name = `${NAME_PREFIX}-C-${Date.now().toString(36)}`;
  const started = await agentStart({
    name,
    argv: ["bash", "-lc", "echo panedeath-C-start; sleep 300"],
    cwd: process.cwd(),
    focus: false,
  });
  owned.add(started.pane_id);
  log(
    "SCRATCH_CREATED",
    { pane_id: started.pane_id, terminal_id: started.terminal_id, name },
    scenario,
  );

  const sink2 = await openEventSubscription(
    [{ type: "pane.agent_status_changed", pane_id: started.pane_id }],
    scenario,
  );

  await sleep(800);
  const info = await processInfo(started.pane_id);
  log("PROCESS_INFO", info, scenario);
  const pids = extractAllPids(info);
  log("OWNED_PIDS", { pane_id: started.pane_id, pids }, scenario);

  // Simulated "result ACK" / "marker" markers for §9-5 ordering evidence
  // (this probe is outside the bridge — these are probe-local timeline anchors)
  log("MARKER_SIMULATED", { note: "probe-local marker (not loom card marker)" }, scenario);
  log("RESULT_ACK_SIMULATED", { note: "probe-local result-ack anchor (not loom result)" }, scenario);

  assertOwned(started.pane_id, owned);
  const closeAt = nowMs();
  log("PANE_CLOSE_REQUEST", { pane_id: started.pane_id, t_ms: closeAt }, scenario);
  let closeResult: unknown;
  try {
    closeResult = await paneClose(started.pane_id);
    log("PANE_CLOSE_ACK", { t_ms: nowMs(), result: closeResult }, scenario);
  } catch (e) {
    log("PANE_CLOSE_ERR", String(e), scenario);
  }

  log(
    "POST_CLOSE_HOLD",
    { hold_ms: POST_CLOSE_HOLD_MS, reason: "observe late child-exit / PaneDied" },
    scenario,
  );
  // keep subscription alive ≥10s
  const holdUntil = nowMs() + POST_CLOSE_HOLD_MS;
  while (nowMs() < holdUntil) {
    await sink.waitFor(() => false, Math.min(1000, holdUntil - nowMs()));
  }
  log("POST_CLOSE_HOLD_DONE", { held_ms: POST_CLOSE_HOLD_MS }, scenario);

  // scrape herdr server log for PaneDied mentioning our pane
  const newLog = readLogSince(logOffset);
  const paneToken = started.pane_id;
  // PaneDied often uses short numeric id (last segment) — capture both
  const shortId = paneToken.includes(":") ? paneToken.split(":").pop()! : paneToken;
  const paneDiedLines = newLog
    .split("\n")
    .filter(
      (l) =>
        l.includes("PaneDied") ||
        (l.toLowerCase().includes("unknown pane") &&
          (l.includes(paneToken) || l.includes(`pane=${shortId}`) || l.includes(shortId))),
    );
  log(
    "HERDR_LOG_PANE_DIED",
    {
      pane_id: started.pane_id,
      short_id: shortId,
      matching_lines: paneDiedLines,
      // also grab any PaneDied in the window for context
      any_panedied: newLog.split("\n").filter((l) => l.includes("PaneDied")),
    },
    scenario,
  );

  // broader: any lines about our pane after close
  const related = newLog
    .split("\n")
    .filter(
      (l) =>
        l.includes(paneToken) ||
        l.includes(`pane=${shortId}`) ||
        l.includes(`pane=${paneToken}`) ||
        (l.includes(shortId) &&
          (l.includes("exit") || l.includes("close") || l.includes("PaneDied") || l.includes("Hangup"))),
    )
    .slice(0, 80);
  log("HERDR_LOG_RELATED", related, scenario);

  log(
    "POST_STATE",
    {
      events_chronological: sink.events.map((e) => ({
        t_iso: e.t_iso,
        t_ms: e.t_ms,
        raw: e.raw,
      })),
      sink2_events: sink2.events.map((e) => ({
        t_iso: e.t_iso,
        t_ms: e.t_ms,
        raw: e.raw,
      })),
    },
    scenario,
  );

  sink.close();
  sink2.close();
  log("SCENARIO_END", { name: "C" }, scenario);
  return true;
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  try {
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(RAW_LOG, ""); // reset
  } catch {
    /* */
  }

  const arg = process.argv.find((a) => a.startsWith("--scenario"));
  let which: "all" | Scenario = "all";
  if (arg) {
    const v = arg.includes("=")
      ? arg.split("=")[1]
      : process.argv[process.argv.indexOf(arg) + 1];
    if (v === "a" || v === "b" || v === "c" || v === "all") which = v;
  }

  log("PROBE_START", {
    socket: SOCKET,
    which,
    protected: [...PROTECTED],
    cwd: process.cwd(),
    note: "raw socket probe — does not use HerdrClient",
  });

  // ping
  const pong = await rpc("ping", {});
  log("PING", pong);

  const baseline = await listPaneIds();
  log("BASELINE_PANES", baseline);
  for (const p of PROTECTED) {
    if (!baseline.includes(p)) {
      log("WARN_PROTECTED_MISSING", p);
    }
  }

  const owned = new Set<string>();
  const success: Scenario[] = [];

  try {
    if (which === "all" || which === "a") {
      try {
        if (await runScenarioA(owned)) success.push("a");
      } catch (e) {
        log("SCENARIO_A_FAIL", String(e), "a");
      }
      await sleep(500);
    }
    if (which === "all" || which === "b") {
      try {
        if (await runScenarioB(owned)) success.push("b");
      } catch (e) {
        log("SCENARIO_B_FAIL", String(e), "b");
      }
      await sleep(500);
    }
    if (which === "all" || which === "c") {
      try {
        if (await runScenarioC(owned)) success.push("c");
      } catch (e) {
        log("SCENARIO_C_FAIL", String(e), "c");
      }
    }
  } finally {
    // final safety: close any still-owned panes
    const live = await listPaneIds().catch(() => [] as string[]);
    for (const id of owned) {
      if (live.includes(id)) {
        log("FINAL_CLEANUP", { pane_id: id });
        try {
          assertOwned(id, owned);
          await paneClose(id);
        } catch (e) {
          log("FINAL_CLEANUP_ERR", String(e));
        }
      }
    }
  }

  const finalPanes = await listPaneIds().catch(() => [] as string[]);
  log("PROBE_END", {
    success,
    owned: [...owned],
    final_panes: finalPanes,
    protected_still_present: [...PROTECTED].filter((p) => finalPanes.includes(p)),
    raw_log: RAW_LOG,
  });

  // dump full log to stdout marker for capture
  console.log("\n===== FULL_LOG_JSON_BEGIN =====");
  console.log(JSON.stringify(logLines, null, 2));
  console.log("===== FULL_LOG_JSON_END =====\n");
  console.log(`[PROBE-DONE] scenarios=${success.join(",") || "none"} raw=${RAW_LOG}`);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
