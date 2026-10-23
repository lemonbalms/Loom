/**
 * HERDR-STATUS-PROBES harness — `[herdr 전용]` probes only (Step 0 · A · B1 · C · D1 · E).
 *
 * Design SSOT: docs/spikes/HERDR-STATUS-PROBES.md §2 (form · isolation · cleanup · G-snapshots ·
 * shared safety block). Target herdr 0.9.5 / protocol 22; method names/params from
 * docs/spikes/fixtures/herdr-v0.9.5/schema.json.
 *
 * Usage (repo root, OUTSIDE any herdr pane; not concurrently with worker test suites):
 *   bun run scripts/probe-herdr-status.ts [--server private|shared] [--probe step0,a,b1,c,d1,e|all]
 *                                         [--timeout-ms N] [--reps N] [--dry-run] [--help]
 *
 * B2 / D2 (`[실 CLI — 오너 yes]`) are NOT implemented: `--probe b2|d2`, `--real-cli`, `--kind`
 * exit 2 ("requires owner yes; not implemented").
 *
 * Raw NDJSON socket only (no HerdrClient — its re-subscribe logic would pollute observations).
 * Helpers are copied from scripts/probe-pane-death.ts (importing it would run its main()).
 *
 * Output: T = mkdtemp(tmpdir()/loom-herdr-probe-) — NDJSON log `T/events.ndjson`, summary
 * `T/summary.json`; stdout = `T=<path>` + one JSON summary line per probe. T is never deleted.
 * Exit: 0 = ran (no FAIL) · 1 = some probe FAIL or run aborted · 2 = usage / refused.
 */
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  appendFileSync,
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { createConnection, type Socket } from "node:net";
import { homedir, tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

// ─── types · tiny helpers ────────────────────────────────────────────────────

type Rec = Record<string, unknown>;
type ProbeName = "step0" | "a" | "b1" | "c" | "d1" | "e";
type ServerMode = "private" | "shared";
type Verdict = "PASS" | "FAIL" | "INCONCLUSIVE" | "SKIPPED";
type AgentState = "idle" | "working" | "blocked" | "unknown";

const rec = (v: unknown): Rec => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {});
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const now = (): number => Date.now();

/** §9 execution order: S0 → A → C → D1 → E → B1. */
const ALL_PROBES: ProbeName[] = ["step0", "a", "c", "d1", "e", "b1"];
const DEFAULT_REPS: Record<ProbeName, number> = { step0: 1, a: 5, b1: 1, c: 2, d1: 1, e: 2 };
const EXPECTED_VERSION = "0.9.5";
const EXPECTED_PROTOCOL = 22;
const REAL_CLI_REFUSAL = "requires owner yes; not implemented";
const FAKE_KINDS = ["claude", "codex", "grok"] as const;

// ─── CLI ─────────────────────────────────────────────────────────────────────

interface Args {
  server: ServerMode;
  probes: ProbeName[];
  timeoutMs: number;
  reps: number | null;
  dryRun: boolean;
  help: boolean;
}

type ParseResult = { ok: true; args: Args } | { ok: false; exit: number; message: string };

const USAGE = `probe-herdr-status — HERDR-STATUS-PROBES [herdr 전용] harness (herdr ${EXPECTED_VERSION} / protocol ${EXPECTED_PROTOCOL})

  bun run scripts/probe-herdr-status.ts [options]

  --server private|shared   private (default): own herdr server under a temp dir (§2.2).
                            shared: the user's herdr ($LOOM_HERDR_SOCKET or ~/.config/herdr/herdr.sock)
                            under the §2.5 safety block (dedicated workspace, focus:false, no server control,
                            B1 and D1 step 4 skipped).
  --probe LIST              comma list of step0,a,b1,c,d1,e (alias s0) or "all" (default all).
                            step0 always runs first — every other probe depends on it.
  --timeout-ms N            RPC / events.subscribe ACK timeout in ms (default 15000).
  --reps N                  override per-probe repetitions (doc defaults: a=5 c=2 e=2 step0=b1=d1=1).
  --dry-run                 parse args and print the planned RPC sequence per probe; no herdr contact.
  --help                    this text.

  NOT implemented (owner yes required): --probe b2|d2, --real-cli, --kind → exit 2.

Output: T=<temp dir> then one JSON summary per probe:
  {probe, verdict: PASS|FAIL|INCONCLUSIVE|SKIPPED, code, facts, created, closed, leftover}
Raw log: T/events.ndjson · summary: T/summary.json (T is kept for the observation doc).
Exit: 0 ran without FAIL · 1 some FAIL / aborted · 2 usage or refused.`;

export function parseArgs(argv: string[]): ParseResult {
  const args: Args = {
    server: "private",
    probes: [...ALL_PROBES],
    timeoutMs: 15_000,
    reps: null,
    dryRun: false,
    help: false,
  };
  const refuse = (): ParseResult => ({ ok: false, exit: 2, message: REAL_CLI_REFUSAL });
  const bad = (m: string): ParseResult => ({ ok: false, exit: 2, message: `${m}\n\n${USAGE}` });
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i] ?? "";
    const eq = raw.indexOf("=");
    const flag = raw.startsWith("--") && eq > 0 ? raw.slice(0, eq) : raw;
    const inline = raw.startsWith("--") && eq > 0 ? raw.slice(eq + 1) : null;
    const value = (): string | null => {
      if (inline !== null) return inline;
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) return null;
      i++;
      return v;
    };
    switch (flag) {
      case "--help":
      case "-h":
        args.help = true;
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--real-cli":
      case "--kind":
        return refuse();
      case "--server": {
        const v = value();
        if (v !== "private" && v !== "shared") return bad(`--server must be private|shared (got ${v})`);
        args.server = v;
        break;
      }
      case "--timeout-ms": {
        const v = Number(value());
        if (!Number.isInteger(v) || v < 1000 || v > 300_000) {
          return bad("--timeout-ms must be an integer in [1000, 300000]");
        }
        args.timeoutMs = v;
        break;
      }
      case "--reps": {
        const v = Number(value());
        if (!Number.isInteger(v) || v < 1 || v > 20) return bad("--reps must be an integer in [1, 20]");
        args.reps = v;
        break;
      }
      case "--probe": {
        const v = value();
        if (!v) return bad("--probe needs a value");
        const out = new Set<ProbeName>(["step0"]);
        for (const p of v.split(",").map((s) => s.trim().toLowerCase())) {
          if (p === "b2" || p === "d2") return refuse();
          if (p === "all") {
            for (const q of ALL_PROBES) out.add(q);
          } else if (p === "s0" || p === "step0") {
            out.add("step0");
          } else if (p === "a" || p === "b1" || p === "c" || p === "d1" || p === "e") {
            out.add(p);
          } else {
            return bad(`unknown probe: ${p}`);
          }
        }
        args.probes = ALL_PROBES.filter((p) => out.has(p));
        break;
      }
      default:
        return bad(`unknown argument: ${raw}`);
    }
  }
  return { ok: true, args };
}

function plannedSequence(p: ProbeName, mode: ServerMode, reps: number): string[] {
  const subL = 'events.subscribe{[pane.agent_status_changed{pane_id:P}, pane.closed, pane.exited]}';
  const rep = (s: string) => `${s}  (×${reps})`;
  switch (p) {
    case "step0":
      return [
        mode === "private"
          ? "spawn: env -i PATH=T/fakebin:/usr/bin:/bin HOME=T/home HERDR_SOCKET_PATH=T/herdr.sock herdr server (detached)"
          : "socket: $LOOM_HERDR_SOCKET or ~/.config/herdr/herdr.sock (shared — §2.5)",
        "ping{} → require version 0.9.5 · protocol 22 (else abort)",
        "pane.list{} → PROTECTED (+ focused set)",
        "workspace.create{focus:false, label:hsprobe-<run>, cwd:T} (shared: focused set must be unchanged)",
        "server.agent_manifests{}",
        "tab.create{workspace_id, focus:false, label:hsprobe-step0-…, cwd:T, env:{HOME,LOOM_TEST_HOME}} → P0",
        `G(P0)=agent.get{target:P0} → ${subL.replace("P", "P0")} ACK`,
        "pane.report_agent{P0, source:hsprobe-s0, agent:bash, state:working, seq} → push ≤2 s → G (fresh?)",
        "pane.report_agent{… idle} → push → G",
        "close P0 (pane.close / tab.close)",
      ];
    case "a":
      return [
        rep("tab.create → P"),
        `S1 = ${subL} ACK → report(working) → S1 push (post-ACK registration + liveness)`,
        "S2 = events.subscribe (no await) + report(idle) before ACK → push position on S2 vs ACK; S2 ACK",
        "report(working) → S1 & S2 both (overlap) → report idle,working,idle back-to-back → FIFO equal",
        "S1.pause() → report(blocked), report(working) → S2 sees both → S1.end() [t_eof] (unread tail)",
        "report(idle) → +500 ms report(blocked) (post-EOF) → +1 s S1.resume() → observe ≤30 s 'end'/'close'",
        "S2 still live after S1 EOF: report(idle) → S2",
        "chain: S3 ACK (overlap S2) → handover S2 (pause+tail+end) → S4 ACK → handover S3 (≥2 re-subscribes)",
        "variant A′ (new pane): S1 ACK → liveness → 30 s nothing → still open? report → S1",
        "G(P) before/after every step; close P",
      ];
    case "b1":
      if (mode === "shared") return ["SKIPPED(shared) — §2.5-4: private Step-0 fake-binary check required first"];
      return [
        "write T/fakebin/{claude,codex,grok} (banner + read loop; no network)",
        "per kind present in server.agent_manifests (manifest with absolute command path → NOT_APPLICABLE, no start):",
        "  tab.create{env:{PATH:T/fakebin:/usr/bin:/bin,…}} → P · subscribe L_B + global pane.agent_detected · G",
        "  agent.start{name:hsprobe-b1-<kind>-<run>, kind, pane_id:P, timeout_ms:10000}",
        "  pane.process_info{P} poll ≤3 s → cmdline must contain T/fakebin (real CLI → pane.close, ABORTED_REAL_CLI)",
        "  agent.get 25 ms poll → launch_pending / interactive_ready times",
        "  30 s no-prompt observation + G every 500 ms · control report(working) → push",
        "  close P",
      ];
    case "c":
      return [
        rep("tab.create → P"),
        `S1 = ${subL} → gate report working,idle,working,idle @1.2 s → S1 ≥1 push`,
        "S1.destroy() → 1 s → S2 = subscribe → 20 s: P status pushes (count/order/ACK position)",
        "liveness report(working) → S2",
        "S2.destroy() → report(idle) with 0 subscribers → G · pane.list → 1 s → S3 → 20 s",
        "control: tab.create → Q → pane.close{Q} → S4 = events.subscribe{[pane.closed]} → 10 s: Q replayed?",
        "classify per window: none / latest-only / backlog; close P",
      ];
    case "d1":
      return [
        "tab.create → P · subscribe L + global pane.agent_detected",
        "for working duration 0.2 s / 5 s / 30 s: G → report(working) → wait → report(idle) [real end] → 5 s → G",
        "mid-run re-entry: working → 1 s → idle → 300 ms → working → 1 s → idle → 5 s (done at intermediate idle?)",
        mode === "private"
          ? "pane.focus{P} → 3 s → G; tab.create → P2, pane.focus{P2} → rerun 1 s working→idle on P"
          : "step 4 (focus) SKIPPED(shared) — §2.5-3",
        "pane.release_agent{P, source:hsprobe-d1, agent:bash} → 3 s (final_status?)",
        "pane.close{P} → 3 s; done↔real-end and done↔completion_seq tables",
      ];
    case "e":
      return [
        rep("tab.create → P"),
        "report(working) → 1 s → report(idle) → 2 s → G (level idle)",
        "E-level: agent.wait{target:P, until:[idle,done], timeout_ms:5000} on its own socket → return time",
        "E-edge: agent.wait{… timeout_ms:10000} → +1 s report(working) → +2 s report(idle) → return time",
        "E-working: report(working) → agent.wait{… 5000} → +2 s report(idle) → return time (control)",
        "close P",
      ];
  }
}

// ─── run context ─────────────────────────────────────────────────────────────

interface Ledger {
  workspaces: Array<{ id: string; t: number }>;
  tabs: Array<{ id: string; t: number }>;
  panes: Array<{ id: string; t: number }>;
}
const emptyLedger = (): Ledger => ({ workspaces: [], tabs: [], panes: [] });

interface Ctx {
  run: string;
  T: string;
  home: string;
  mode: ServerMode;
  sock: string;
  timeoutMs: number;
  logPath: string;
  start: number;
  protectedPanes: Set<string>;
  owned: { workspaces: Set<string>; tabs: Set<string>; panes: Set<string> };
  runCreated: Ledger;
  runClosed: Ledger;
  workspaceId: string | null;
  serverPids: number[];
  manifests: unknown;
  pushOk: boolean;
  seq: Map<string, number>;
  sinks: Set<Sink>;
}

interface ProbeRun {
  name: ProbeName;
  facts: Rec;
  created: Ledger;
  closed: Ledger;
  sinks: Sink[];
  closeErrors: string[];
}

interface Summary {
  probe: ProbeName;
  verdict: Verdict;
  code: string;
  facts: Rec;
  created: Ledger;
  closed: Ledger;
  leftover: string[];
}

function ev(ctx: Ctx, probe: string, kind: string, payload?: unknown): void {
  const t = now();
  const line = { t_ms: t, rel_ms: t - ctx.start, probe, kind, payload };
  try {
    appendFileSync(ctx.logPath, `${JSON.stringify(line)}\n`);
  } catch {
    /* best-effort */
  }
}

function progress(msg: string): void {
  process.stderr.write(`[hsprobe] ${msg}\n`);
}

function isUnder(path: string, root: string): boolean {
  const r = resolve(path);
  return r === root || r.startsWith(root + sep);
}

function nextId(): string {
  return `hsprobe-${randomBytes(6).toString("hex")}`;
}

function parseNdjsonLines(buf: { text: string }, onLine: (msg: Rec) => void, onBad: (l: string) => void): void {
  while (true) {
    const nl = buf.text.indexOf("\n");
    if (nl < 0) break;
    const line = buf.text.slice(0, nl).trim();
    buf.text = buf.text.slice(nl + 1);
    if (!line) continue;
    try {
      onLine(JSON.parse(line) as Rec);
    } catch {
      onBad(line);
    }
  }
}

function isPushMsg(msg: Rec): boolean {
  if (typeof msg.event === "string" && msg.id === undefined) return true;
  return msg.type === "event" && typeof msg.event === "string";
}

// ─── safety guard (§2.5 · spec constraints) ──────────────────────────────────

function hasFocusTrue(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  for (const [k, x] of Object.entries(v as Rec)) {
    if (k === "focus" && x === true) return true;
    if (x && typeof x === "object" && hasFocusTrue(x)) return true;
  }
  return false;
}

const OWNED_PANE_PARAM: Record<string, string> = {
  "pane.report_agent": "pane_id",
  "pane.release_agent": "pane_id",
  "pane.close": "pane_id",
  "pane.focus": "pane_id",
  "agent.start": "pane_id",
  "agent.wait": "target",
};

function assertOwned(ctx: Ctx, paneId: unknown): void {
  const id = str(paneId);
  if (!id || ctx.protectedPanes.has(id) || !ctx.owned.panes.has(id)) {
    throw new Error(`REFUSED: pane ${String(paneId)} was not created by this probe run`);
  }
}

function guard(ctx: Ctx, method: string, params: Rec): void {
  if (hasFocusTrue(params)) throw new Error(`REFUSED: ${method} with focus:true`);
  if ("resume_argv" in params) throw new Error("REFUSED: resume_argv is never sent");
  if (method === "server.stop") {
    if (ctx.mode !== "private" || !isUnder(ctx.sock, ctx.T)) {
      throw new Error("REFUSED: server.stop outside the probe's own temp-dir server");
    }
    return;
  }
  if (
    method.startsWith("server.reload") ||
    method === "server.live_handoff" ||
    method.startsWith("integration.") ||
    method.startsWith("client_shell.") ||
    method.startsWith("agent.prompt") ||
    method === "agent.focus" ||
    method === "tab.focus" ||
    method === "workspace.focus"
  ) {
    throw new Error(`REFUSED: ${method} is not allowed in [herdr 전용] probes`);
  }
  if (method === "pane.focus" && ctx.mode !== "private") {
    throw new Error("REFUSED: pane.focus on the shared server (§2.5-3)");
  }
  if (method === "workspace.close") {
    if ("close_group" in params) throw new Error("REFUSED: workspace.close.close_group");
    const w = str(params.workspace_id);
    if (!w || !ctx.owned.workspaces.has(w)) throw new Error(`REFUSED: workspace ${w} not owned`);
  }
  if (method === "tab.close") {
    const t = str(params.tab_id);
    if (!t || !ctx.owned.tabs.has(t)) throw new Error(`REFUSED: tab ${t} not owned`);
  }
  const pk = OWNED_PANE_PARAM[method];
  if (pk) assertOwned(ctx, params[pk]);
}

// ─── raw RPC (one connection per call) ───────────────────────────────────────

class RpcError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
    readonly raw: unknown,
  ) {
    super(message);
  }
}

function rpcRaw(ctx: Ctx, probe: string, method: string, params: Rec, timeoutMs: number): Promise<Rec> {
  const id = nextId();
  return new Promise((res, rej) => {
    let settled = false;
    const buf = { text: "" };
    const sock = createConnection(ctx.sock);
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
    const timer = setTimeout(() => {
      ev(ctx, probe, "RPC_TIMEOUT", { id, method, timeoutMs });
      finish(() => rej(new RpcError(`rpc ${method} timed out after ${timeoutMs}ms`, "timeout", null)));
    }, timeoutMs);
    sock.setEncoding("utf8");
    sock.on("connect", () => {
      ev(ctx, probe, "RPC_TX", { id, method, params });
      sock.write(`${JSON.stringify({ id, method, params })}\n`, (err) => {
        if (err) finish(() => rej(err));
      });
    });
    sock.on("data", (chunk: string) => {
      buf.text += chunk;
      parseNdjsonLines(
        buf,
        (msg) => {
          if (settled || isPushMsg(msg)) return;
          if (String(msg.id ?? "") !== id) return;
          ev(ctx, probe, "RPC_RX", { id, method, msg });
          if (msg.error) {
            const e = rec(msg.error);
            finish(() =>
              rej(new RpcError(str(e.message) ?? `herdr error ${String(e.code)}`, str(e.code), msg.error)),
            );
          } else {
            finish(() => res(rec(msg.result ?? msg)));
          }
        },
        (l) => ev(ctx, probe, "MALFORMED_LINE", l),
      );
    });
    sock.on("error", (err) => finish(() => rej(err)));
    sock.on("close", () => finish(() => rej(new Error(`rpc ${method}: closed before response`))));
  });
}

async function call(ctx: Ctx, probe: string, method: string, params: Rec = {}, timeoutMs?: number): Promise<Rec> {
  guard(ctx, method, params);
  return rpcRaw(ctx, probe, method, params, timeoutMs ?? ctx.timeoutMs);
}

async function tryCall(
  ctx: Ctx,
  probe: string,
  method: string,
  params: Rec = {},
  timeoutMs?: number,
): Promise<{ ok: true; result: Rec; t: number } | { ok: false; error: string; t: number }> {
  try {
    const result = await call(ctx, probe, method, params, timeoutMs);
    return { ok: true, result, t: now() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), t: now() };
  }
}

// ─── long-lived subscription (allowHalfOpen, pause/end/destroy exposed) ──────

interface Push {
  n: number;
  t: number;
  beforeAck: boolean;
  afterEof: boolean;
  event: string;
  paneId: string;
  status: string | null;
  raw: Rec;
}

interface Sink {
  name: string;
  probe: string;
  openedAt: number;
  ackAt: number | null;
  ackN: number | null;
  lineN: number;
  pushes: Push[];
  endAt: number | null;
  closeAt: number | null;
  eofAt: number | null;
  resumedAt: number | null;
  errors: string[];
  ack: Promise<void>;
  bytesRead(): number;
  pause(): void;
  resume(): void;
  end(): void;
  destroy(): void;
  waitFor(pred: (p: Push) => boolean, ms: number, fromIdx?: number): Promise<Push | null>;
}

interface Sub {
  type: string;
  pane_id?: string;
}

const subL = (P: string): Sub[] => [
  { type: "pane.agent_status_changed", pane_id: P },
  { type: "pane.closed" },
  { type: "pane.exited" },
];

function pushPaneId(raw: Rec): string {
  const d = rec(raw.data);
  return str(d.pane_id) ?? str(rec(d.pane).pane_id) ?? "";
}

function openSub(ctx: Ctx, pr: ProbeRun, name: string, subs: Sub[]): Sink {
  const id = nextId();
  const sock: Socket = createConnection({ path: ctx.sock, allowHalfOpen: true });
  const buf = { text: "" };
  const waiters: Array<{ pred: (p: Push) => boolean; res: (p: Push | null) => void; timer: ReturnType<typeof setTimeout> }> =
    [];
  let ackRes: () => void = () => {};
  let ackRej: (e: Error) => void = () => {};
  const ack = new Promise<void>((res, rej) => {
    ackRes = res;
    ackRej = rej;
  });
  ack.catch(() => {});
  const sink: Sink = {
    name,
    probe: pr.name,
    openedAt: now(),
    ackAt: null,
    ackN: null,
    lineN: 0,
    pushes: [],
    endAt: null,
    closeAt: null,
    eofAt: null,
    resumedAt: null,
    errors: [],
    ack,
    bytesRead: () => sock.bytesRead,
    pause: () => {
      sock.pause();
      ev(ctx, pr.name, "SUB_PAUSE", { sink: name, bytesRead: sock.bytesRead, pushes: sink.pushes.length });
    },
    resume: () => {
      sink.resumedAt = now();
      ev(ctx, pr.name, "SUB_RESUME", { sink: name, bytesRead: sock.bytesRead, pushes: sink.pushes.length });
      sock.resume();
    },
    end: () => {
      sink.eofAt = now();
      ev(ctx, pr.name, "SUB_EOF_TX", { sink: name, bytesRead: sock.bytesRead, pushes: sink.pushes.length });
      sock.end();
    },
    destroy: () => {
      if (sink.closeAt === null) ev(ctx, pr.name, "SUB_DESTROY", { sink: name });
      try {
        sock.destroy();
      } catch {
        /* */
      }
    },
    waitFor: (pred, ms, fromIdx = 0) =>
      new Promise((res) => {
        for (let i = fromIdx; i < sink.pushes.length; i++) {
          const p = sink.pushes[i];
          if (p && pred(p)) {
            res(p);
            return;
          }
        }
        if (sink.closeAt !== null) {
          res(null);
          return;
        }
        const timer = setTimeout(() => {
          const i = waiters.findIndex((w) => w.timer === timer);
          if (i >= 0) waiters.splice(i, 1);
          res(null);
        }, ms);
        waiters.push({ pred, res, timer });
      }),
  };
  const ackTimer = setTimeout(() => {
    if (sink.ackAt === null) {
      sink.errors.push("ack-timeout");
      ev(ctx, pr.name, "SUB_ACK_TIMEOUT", { sink: name, timeoutMs: ctx.timeoutMs });
      ackRej(new Error(`events.subscribe ${name} ACK timed out`));
    }
  }, ctx.timeoutMs);
  sock.setEncoding("utf8");
  sock.on("connect", () => {
    ev(ctx, pr.name, "SUB_TX", { sink: name, id, subscriptions: subs });
    sock.write(`${JSON.stringify({ id, method: "events.subscribe", params: { subscriptions: subs } })}\n`);
  });
  sock.on("data", (chunk: string) => {
    buf.text += chunk;
    parseNdjsonLines(
      buf,
      (msg) => {
        sink.lineN++;
        if (String(msg.id ?? "") === id && !isPushMsg(msg)) {
          clearTimeout(ackTimer);
          if (msg.error) {
            sink.errors.push(`ack-error:${JSON.stringify(msg.error)}`);
            ev(ctx, pr.name, "SUB_ACK_ERR", { sink: name, msg });
            ackRej(new Error(`events.subscribe ${name} error ${JSON.stringify(msg.error)}`));
            return;
          }
          sink.ackAt = now();
          sink.ackN = sink.lineN;
          ev(ctx, pr.name, "SUB_ACK", { sink: name, n: sink.lineN, msg });
          ackRes();
          return;
        }
        if (!isPushMsg(msg)) {
          ev(ctx, pr.name, "SUB_OTHER", { sink: name, n: sink.lineN, msg });
          return;
        }
        const event = str(msg.event) ?? "";
        const push: Push = {
          n: sink.lineN,
          t: now(),
          beforeAck: sink.ackAt === null,
          afterEof: sink.eofAt !== null,
          event,
          paneId: pushPaneId(msg),
          status: event.includes("agent_status") ? str(rec(msg.data).agent_status) : null,
          raw: msg,
        };
        sink.pushes.push(push);
        ev(ctx, pr.name, "EVENT_PUSH", { sink: name, n: push.n, beforeAck: push.beforeAck, afterEof: push.afterEof, raw: msg });
        for (let i = waiters.length - 1; i >= 0; i--) {
          const w = waiters[i];
          if (w?.pred(push)) {
            clearTimeout(w.timer);
            w.res(push);
            waiters.splice(i, 1);
          }
        }
      },
      (l) => ev(ctx, pr.name, "MALFORMED_LINE", { sink: name, l }),
    );
  });
  sock.on("end", () => {
    sink.endAt = now();
    ev(ctx, pr.name, "SUB_END_RX", { sink: name, sinceEofMs: sink.eofAt ? sink.endAt - sink.eofAt : null });
  });
  sock.on("error", (err) => {
    sink.errors.push(String(err));
    ev(ctx, pr.name, "SUB_ERROR", { sink: name, err: String(err) });
    if (sink.ackAt === null) ackRej(err instanceof Error ? err : new Error(String(err)));
  });
  sock.on("close", () => {
    sink.closeAt = now();
    clearTimeout(ackTimer);
    ev(ctx, pr.name, "SUB_CLOSE", { sink: name, sinceEofMs: sink.eofAt ? sink.closeAt - sink.eofAt : null });
    if (sink.ackAt === null) ackRej(new Error(`events.subscribe ${name} closed before ACK`));
    for (const w of waiters) {
      clearTimeout(w.timer);
      w.res(null);
    }
    waiters.length = 0;
  });
  ctx.sinks.add(sink);
  pr.sinks.push(sink);
  return sink;
}

async function subscribe(ctx: Ctx, pr: ProbeRun, name: string, subs: Sub[]): Promise<Sink> {
  const s = openSub(ctx, pr, name, subs);
  await s.ack;
  return s;
}

const statusOf = (P: string) => (p: Push) => p.status !== null && p.paneId === P;
const statusIs = (P: string, st: string) => (p: Push) => p.status === st && p.paneId === P;
const statusSeq = (s: Sink, P: string, pred: (p: Push) => boolean = () => true): string[] =>
  s.pushes.filter((p) => statusOf(P)(p) && pred(p)).map((p) => p.status ?? "");

async function waitClosed(s: Sink, ms: number): Promise<void> {
  const until = now() + ms;
  while (s.closeAt === null && now() < until) await sleep(50);
}

// ─── herdr object helpers ────────────────────────────────────────────────────

async function report(ctx: Ctx, pr: ProbeRun, P: string, state: AgentState): Promise<number> {
  const seq = (ctx.seq.get(P) ?? 0) + 1;
  ctx.seq.set(P, seq);
  await call(ctx, pr.name, "pane.report_agent", {
    pane_id: P,
    source: `hsprobe-${pr.name}`,
    agent: "bash",
    state,
    seq,
  });
  return now();
}

function pushFact(pr: ProbeRun, key: string, item: unknown): void {
  const cur = pr.facts[key];
  if (Array.isArray(cur)) cur.push(item);
  else pr.facts[key] = [item];
}

interface GSnap {
  label: string;
  t: number;
  agent_status: string | null;
  revision: number | null;
  state_change_seq: number | null;
  completion_seq: number | null;
  focused: boolean | null;
  interactive_ready: boolean | null;
  launch_pending: boolean | null;
  error?: string;
}

async function G(ctx: Ctx, pr: ProbeRun, P: string, label: string): Promise<GSnap> {
  const r = await tryCall(ctx, pr.name, "agent.get", { target: P });
  const base = { label, t: r.t };
  let snap: GSnap;
  if (!r.ok) {
    snap = {
      ...base,
      agent_status: null,
      revision: null,
      state_change_seq: null,
      completion_seq: null,
      focused: null,
      interactive_ready: null,
      launch_pending: null,
      error: r.error,
    };
  } else {
    const a = rec(r.result.agent);
    const b = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);
    snap = {
      ...base,
      agent_status: str(a.agent_status),
      revision: num(a.revision),
      state_change_seq: num(a.state_change_seq),
      completion_seq: num(a.completion_seq),
      focused: b(a.focused),
      interactive_ready: b(a.interactive_ready),
      launch_pending: b(a.launch_pending),
    };
  }
  ev(ctx, pr.name, "G", { pane: P, ...snap });
  pushFact(pr, "gSnapshots", snap);
  return snap;
}

function gDiff(a: GSnap, b: GSnap): Rec {
  const d = (x: number | null, y: number | null): number | null => (x === null || y === null ? null : y - x);
  const dRev = d(a.revision, b.revision);
  const dScs = d(a.state_change_seq, b.state_change_seq);
  const dCs = d(a.completion_seq, b.completion_seq);
  return {
    from: a.label,
    to: b.label,
    status: `${a.agent_status}→${b.agent_status}`,
    dRev,
    dScs,
    dCs,
    reset: [dRev, dScs, dCs].some((x) => x !== null && x < 0),
  };
}

/** Freshness/atomicity: agent.get right after a push — does the level already show the pushed value? */
async function freshAfterPush(ctx: Ctx, pr: ProbeRun, P: string, push: Push | null, prev: GSnap | null): Promise<Rec> {
  if (!push) return { push: null };
  const g = await G(ctx, pr, P, `after-push:${push.status}`);
  const row = {
    pushStatus: push.status,
    pushToGetMs: g.t - push.t,
    getStatus: g.agent_status,
    fresh: g.agent_status === push.status,
    scsAdvanced: prev && prev.state_change_seq !== null && g.state_change_seq !== null ? g.state_change_seq > prev.state_change_seq : null,
  };
  pushFact(pr, "freshness", row);
  return row;
}

async function paneLevel(ctx: Ctx, pr: ProbeRun, P: string): Promise<string | null> {
  const r = await tryCall(ctx, pr.name, "pane.list", {});
  if (!r.ok) return `error:${r.error}`;
  const panes = Array.isArray(r.result.panes) ? r.result.panes : [];
  for (const p of panes) {
    const x = rec(p);
    if (x.pane_id === P) return str(x.agent_status);
  }
  return "absent";
}

async function listPanes(ctx: Ctx, probe: string): Promise<Rec[]> {
  const r = await call(ctx, probe, "pane.list", {});
  return (Array.isArray(r.panes) ? r.panes : []).map(rec);
}

async function scratchPane(ctx: Ctx, pr: ProbeRun, tag: string, extraEnv: Rec = {}): Promise<string> {
  const params: Rec = {
    focus: false,
    label: `hsprobe-${pr.name}-${tag}-${ctx.run}`,
    cwd: ctx.T,
    env: { HOME: ctx.home, LOOM_TEST_HOME: ctx.T, ...extraEnv },
  };
  if (ctx.workspaceId) params.workspace_id = ctx.workspaceId;
  const r = await call(ctx, pr.name, "tab.create", params);
  const tabId = str(rec(r.tab).tab_id);
  const paneId = str(rec(r.root_pane).pane_id);
  const t = now();
  if (tabId) {
    ctx.owned.tabs.add(tabId);
    pr.created.tabs.push({ id: tabId, t });
  }
  if (!paneId) throw new Error(`tab.create returned no root_pane.pane_id: ${JSON.stringify(r)}`);
  ctx.owned.panes.add(paneId);
  pr.created.panes.push({ id: paneId, t });
  return paneId;
}

async function closePane(ctx: Ctx, pr: ProbeRun, P: string): Promise<void> {
  if (pr.closed.panes.some((x) => x.id === P)) return;
  const r = await tryCall(ctx, pr.name, "pane.close", { pane_id: P });
  if (r.ok) pr.closed.panes.push({ id: P, t: r.t });
  else pr.closeErrors.push(`pane.close ${P}: ${r.error}`);
}

async function finishProbe(ctx: Ctx, pr: ProbeRun): Promise<string[]> {
  for (const s of pr.sinks) s.destroy();
  for (const p of pr.created.panes) await closePane(ctx, pr, p.id);
  await sleep(300);
  const leftover: string[] = [];
  let tabsNow: Set<string> | null = null;
  const tl = await tryCall(ctx, pr.name, "tab.list", ctx.workspaceId ? { workspace_id: ctx.workspaceId } : {});
  if (tl.ok) {
    tabsNow = new Set(
      (Array.isArray(tl.result.tabs) ? tl.result.tabs : []).map((x) => str(rec(x).tab_id) ?? ""),
    );
  }
  for (const t of pr.created.tabs) {
    if (tabsNow && !tabsNow.has(t.id)) {
      pr.closed.tabs.push({ id: t.id, t: now() });
      continue;
    }
    const r = await tryCall(ctx, pr.name, "tab.close", { tab_id: t.id });
    if (r.ok) pr.closed.tabs.push({ id: t.id, t: r.t });
    else pr.closeErrors.push(`tab.close ${t.id}: ${r.error}`);
  }
  const pl = await tryCall(ctx, pr.name, "pane.list", {});
  if (pl.ok) {
    const live = new Set((Array.isArray(pl.result.panes) ? pl.result.panes : []).map((x) => str(rec(x).pane_id) ?? ""));
    for (const p of pr.created.panes) if (live.has(p.id)) leftover.push(`pane:${p.id}`);
    for (const p of pr.created.panes) {
      if (!live.has(p.id) && !pr.closed.panes.some((x) => x.id === p.id)) pr.closed.panes.push({ id: p.id, t: now() });
    }
  } else {
    leftover.push(`unverified:pane.list ${pl.error}`);
  }
  const tl2 = await tryCall(ctx, pr.name, "tab.list", ctx.workspaceId ? { workspace_id: ctx.workspaceId } : {});
  if (tl2.ok) {
    const live = new Set((Array.isArray(tl2.result.tabs) ? tl2.result.tabs : []).map((x) => str(rec(x).tab_id) ?? ""));
    for (const t of pr.created.tabs) if (live.has(t.id)) leftover.push(`tab:${t.id}`);
  }
  if (pr.closeErrors.length) pr.facts.closeErrors = pr.closeErrors;
  return leftover;
}

// ─── server setup (Step 0 base) ──────────────────────────────────────────────

interface Setup {
  ok: boolean;
  code: string;
  facts: Rec;
}

function pidsOnSocket(sock: string): number[] {
  const r = spawnSync("lsof", ["-t", sock], { encoding: "utf8", timeout: 5000 });
  if (r.status !== 0 || typeof r.stdout !== "string") return [];
  return r.stdout
    .split(/\s+/)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0 && n !== process.pid);
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function startPrivateServer(ctx: Ctx, facts: Rec): Promise<boolean> {
  const herdrBin = Bun.which("herdr");
  if (!herdrBin) {
    facts.isolationError = "herdr binary not found on PATH";
    return false;
  }
  const sockWanted = join(ctx.T, "herdr.sock");
  const candidates = [sockWanted, join(ctx.home, ".config", "herdr", "herdr.sock")];
  if (sockWanted.length > 100) {
    facts.isolationError = `socket path too long for AF_UNIX (${sockWanted.length})`;
    return false;
  }
  const out = openSync(join(ctx.T, "herdr-server.stdout"), "a");
  const err = openSync(join(ctx.T, "herdr-server.stderr"), "a");
  const env = {
    PATH: `${join(ctx.T, "fakebin")}:/usr/bin:/bin:/usr/sbin:/sbin`,
    HOME: ctx.home,
    HERDR_SOCKET_PATH: sockWanted,
    LOOM_TEST_HOME: ctx.T,
    TMPDIR: join(ctx.T, "tmp"),
  };
  const child = spawn(herdrBin, ["server"], { cwd: ctx.T, env, detached: true, stdio: ["ignore", out, err] });
  let exitInfo: Rec | null = null;
  child.on("exit", (code, signal) => {
    exitInfo = { code, signal, t: now() };
  });
  child.unref();
  closeSync(out);
  closeSync(err);
  facts.herdrBin = herdrBin;
  facts.spawnPid = child.pid ?? null;
  facts.serverEnv = env;
  ev(ctx, "step0", "SERVER_SPAWN", { herdrBin, pid: child.pid, env });
  const until = now() + 15_000;
  let found: string | null = null;
  while (now() < until && !found) {
    found = candidates.find((c) => existsSync(c)) ?? null;
    if (!found) await sleep(100);
  }
  facts.spawnExit = exitInfo;
  if (!found) {
    facts.isolationError = `no socket under T within 15 s (candidates ${candidates.join(", ")})`;
    if (child.pid && pidAlive(child.pid)) {
      process.kill(child.pid, "SIGTERM");
      facts.spawnPidSigterm = child.pid;
    }
    return false;
  }
  if (!isUnder(found, ctx.T)) {
    facts.isolationError = `socket outside T: ${found}`;
    return false;
  }
  ctx.sock = found;
  facts.socket = found;
  facts.honorsHERDR_SOCKET_PATH = found === sockWanted;
  const pids = new Set<number>(pidsOnSocket(found));
  if (child.pid && pidAlive(child.pid)) pids.add(child.pid);
  ctx.serverPids = [...pids];
  facts.serverPids = ctx.serverPids;
  facts.detached = exitInfo !== null;
  ev(ctx, "step0", "SERVER_SOCKET", { socket: found, pids: ctx.serverPids, spawnExit: exitInfo });
  return true;
}

function focusedSet(panes: Rec[]): string[] {
  return panes
    .filter((p) => p.focused === true)
    .map((p) => str(p.pane_id) ?? "")
    .sort();
}

async function setup(ctx: Ctx, realHome: string): Promise<Setup> {
  const facts: Rec = { mode: ctx.mode, T: ctx.T };
  if (ctx.mode === "private") {
    if (!(await startPrivateServer(ctx, facts))) return { ok: false, code: "S0-ISOLATION", facts };
  } else {
    ctx.sock = process.env.LOOM_HERDR_SOCKET_ORIG ?? join(realHome, ".config", "herdr", "herdr.sock");
    facts.socket = ctx.sock;
  }
  const ping = await tryCall(ctx, "step0", "ping", {});
  if (!ping.ok) {
    facts.pingError = ping.error;
    return { ok: false, code: ctx.mode === "private" ? "S0-ISOLATION" : "S0-NOSERVER", facts };
  }
  facts.version = ping.result.version;
  facts.protocol = ping.result.protocol;
  facts.capabilities = ping.result.capabilities ?? null;
  if (ping.result.version !== EXPECTED_VERSION || ping.result.protocol !== EXPECTED_PROTOCOL) {
    return { ok: false, code: "S0-VERSION", facts };
  }
  const before = await listPanes(ctx, "step0");
  for (const p of before) {
    const id = str(p.pane_id);
    if (id) ctx.protectedPanes.add(id);
  }
  facts.protectedPanes = [...ctx.protectedPanes];
  const focusBefore = focusedSet(before);
  const wc = await tryCall(ctx, "step0", "workspace.create", {
    focus: false,
    label: `hsprobe-${ctx.run}`,
    cwd: ctx.T,
  });
  if (wc.ok) {
    const w = str(rec(wc.result.workspace).workspace_id);
    const tab = str(rec(wc.result.tab).tab_id);
    const pane = str(rec(wc.result.root_pane).pane_id);
    if (w) {
      ctx.workspaceId = w;
      ctx.owned.workspaces.add(w);
      ctx.runCreated.workspaces.push({ id: w, t: wc.t });
    }
    if (tab) {
      ctx.owned.tabs.add(tab);
      ctx.runCreated.tabs.push({ id: tab, t: wc.t });
    }
    if (pane) {
      ctx.owned.panes.add(pane);
      ctx.runCreated.panes.push({ id: pane, t: wc.t });
    }
  } else {
    facts.workspaceCreateError = wc.error;
  }
  facts.workspaceId = ctx.workspaceId;
  const focusAfter = focusedSet(await listPanes(ctx, "step0"));
  facts.focusBefore = focusBefore;
  facts.focusAfter = focusAfter;
  if (ctx.mode === "shared" && JSON.stringify(focusBefore) !== JSON.stringify(focusAfter)) {
    return { ok: false, code: "S0-FOCUS-CHANGED", facts };
  }
  return { ok: true, code: "SETUP-OK", facts };
}

// ─── probes ──────────────────────────────────────────────────────────────────

interface Outcome {
  verdict: Verdict;
  code: string;
}

async function probeStep0(ctx: Ctx, pr: ProbeRun, s: Setup): Promise<Outcome> {
  Object.assign(pr.facts, s.facts);
  if (!s.ok) return { verdict: "FAIL", code: s.code };
  const m = await tryCall(ctx, pr.name, "server.agent_manifests", {});
  if (m.ok) {
    ctx.manifests = m.result;
    pr.facts.agentManifestsKeys = Object.keys(m.result);
    pr.facts.agentManifestsSummary = summarizeManifests(m.result);
  } else {
    pr.facts.agentManifestsError = m.error;
  }
  const P0 = await scratchPane(ctx, pr, "p0");
  const g0 = await G(ctx, pr, P0, "before-subscribe");
  const S = await subscribe(ctx, pr, "S", subL(P0));
  const tW = await report(ctx, pr, P0, "working");
  const pW = await S.waitFor(statusIs(P0, "working"), 2000);
  await freshAfterPush(ctx, pr, P0, pW, g0);
  const g1 = await G(ctx, pr, P0, "after-working");
  const tI = await report(ctx, pr, P0, "idle");
  const pI = await S.waitFor((p) => statusOf(P0)(p) && p.status !== "working", 2000);
  await freshAfterPush(ctx, pr, P0, pI, g1);
  const g2 = await G(ctx, pr, P0, "after-idle");
  pr.facts.pushLatencyMs = { working: pW ? pW.t - tW : null, idle: pI ? pI.t - tI : null, idleValue: pI?.status ?? null };
  pr.facts.gDiffs = [gDiff(g0, g1), gDiff(g1, g2)];
  pr.facts.subscriberAckMs = S.ackAt ? S.ackAt - S.openedAt : null;
  ctx.pushOk = Boolean(pW && pI);
  if (!pW && !pI) return { verdict: "FAIL", code: "S0-NOPUSH" };
  if (!ctx.pushOk) return { verdict: "INCONCLUSIVE", code: "S0-PARTIALPUSH" };
  return { verdict: "PASS", code: "S0-OK" };
}

function summarizeManifests(r: Rec): Rec {
  const out: Rec = {};
  const json = JSON.stringify(r);
  for (const k of FAKE_KINDS) {
    out[k] = { mentioned: json.includes(`"${k}"`), absolutePaths: manifestAbsPaths(r, k) };
  }
  out.bytes = json.length;
  return out;
}

/** Collect absolute-path-looking strings inside the manifest entry/entries that mention `kind`. */
function manifestAbsPaths(root: unknown, kind: string): string[] {
  const found = new Set<string>();
  const scan = (v: unknown, inKind: boolean): void => {
    if (typeof v === "string") {
      if (inKind && (v.startsWith("/") || v.startsWith("~"))) found.add(v);
      return;
    }
    if (Array.isArray(v)) {
      for (const x of v) scan(x, inKind);
      return;
    }
    if (v && typeof v === "object") {
      const o = v as Rec;
      const mine = inKind || Object.values(o).some((x) => x === kind) || kind in o;
      for (const [k, x] of Object.entries(o)) scan(x, mine || k === kind);
    }
  };
  scan(root, false);
  return [...found];
}

/** One handover old → new: pause old, two tail transitions, EOF while unread, resume later. */
async function handover(
  ctx: Ctx,
  pr: ProbeRun,
  P: string,
  oldS: Sink,
  newS: Sink,
  tail: [AgentState, AgentState],
  post: [AgentState, AgentState],
): Promise<Rec> {
  const oldBase = oldS.pushes.length;
  const newBase = newS.pushes.length;
  const gA = await G(ctx, pr, P, `${oldS.name}->${newS.name}:before-tail`);
  const bytesAtPause = oldS.bytesRead();
  oldS.pause();
  await report(ctx, pr, P, tail[0]);
  await report(ctx, pr, P, tail[1]);
  const ctl = await newS.waitFor(statusIs(P, tail[1]), 2000, newBase);
  await sleep(300);
  const bytesAtEof = oldS.bytesRead();
  oldS.end();
  const tEof = oldS.eofAt ?? now();
  await report(ctx, pr, P, post[0]);
  await sleep(500);
  await report(ctx, pr, P, post[1]);
  await sleep(1000);
  const bytesBeforeResume = oldS.bytesRead();
  oldS.resume();
  await waitClosed(oldS, 30_000);
  await sleep(oldS.closeAt === null ? 0 : 500);
  const gB = await G(ctx, pr, P, `${oldS.name}->${newS.name}:after-post`);
  const oldSeq = statusSeq(oldS, P, (p) => oldS.pushes.indexOf(p) >= oldBase);
  const newSeq = statusSeq(newS, P, (p) => newS.pushes.indexOf(p) >= newBase);
  const tailDelivered = oldSeq[0] === tail[0] && oldSeq[1] === tail[1];
  const postOnOld = oldSeq.slice(2).length;
  const row: Rec = {
    old: oldS.name,
    new: newS.name,
    tail,
    post,
    controlSawTail: Boolean(ctl),
    oldSeqAfterPause: oldSeq,
    newSeq,
    tailDelivered,
    postEofOnOld: postOnOld,
    eofToEndMs: oldS.endAt ? oldS.endAt - tEof : null,
    eofToCloseMs: oldS.closeAt ? oldS.closeAt - tEof : null,
    oldErrors: oldS.errors,
    bytesReadAtPause: bytesAtPause,
    bytesReadAtEof: bytesAtEof,
    bytesReadBeforeResume: bytesBeforeResume,
    // > 0 → the runtime pulled tail bytes into the process while paused: the tail was unread by the
    // application but no longer sitting in the kernel buffer (record, do not over-claim).
    bytesReadWhilePaused: bytesBeforeResume - bytesAtPause,
    gDiff: gDiff(gA, gB),
    transitions: 4,
  };
  return row;
}

async function probeA(ctx: Ctx, pr: ProbeRun, reps: number): Promise<Outcome> {
  const runs: Rec[] = [];
  const primes: Rec[] = [];
  for (let r = 1; r <= reps; r++) {
    progress(`A rep ${r}/${reps}`);
    const P = await scratchPane(ctx, pr, `r${r}`);
    const row: Rec = { rep: r, pane: P };
    runs.push(row);
    const g0 = await G(ctx, pr, P, `a${r}:start`);
    // 1–2: S1 + post-ACK registration / liveness
    const S1 = await subscribe(ctx, pr, `a${r}.S1`, subL(P));
    await report(ctx, pr, P, "working");
    const live = await S1.waitFor(statusIs(P, "working"), 2000);
    await freshAfterPush(ctx, pr, P, live, g0);
    row.liveness = Boolean(live);
    if (!live) {
      row.code = "UNDETERMINED";
      await closePane(ctx, pr, P);
      continue;
    }
    // 3: S2 opened, transition fired before its ACK (registration-vs-ACK order)
    const S2 = openSub(ctx, pr, `a${r}.S2`, subL(P));
    await sleep(5);
    await report(ctx, pr, P, "idle");
    await S2.ack;
    await sleep(1500);
    const preAck = S2.pushes.find(statusIs(P, "idle"));
    row.registrationVsAck = preAck ? (preAck.beforeAck ? "push-before-ack" : "push-after-ack") : "missed";
    const s1Base = S1.pushes.length;
    const s2Base = S2.pushes.length;
    await report(ctx, pr, P, "working");
    const o1 = await S1.waitFor(statusIs(P, "working"), 2000, s1Base);
    const o2 = await S2.waitFor(statusIs(P, "working"), 2000, s2Base);
    row.overlapBoth = Boolean(o1 && o2);
    row.overlapS1 = Boolean(o1);
    // FIFO: back-to-back transitions, both sockets must see the same order
    const f1 = S1.pushes.length;
    const f2 = S2.pushes.length;
    await report(ctx, pr, P, "idle");
    await report(ctx, pr, P, "working");
    await report(ctx, pr, P, "idle");
    await sleep(1500);
    const fifo1 = statusSeq(S1, P, (p) => S1.pushes.indexOf(p) >= f1);
    const fifo2 = statusSeq(S2, P, (p) => S2.pushes.indexOf(p) >= f2);
    row.fifo = { S1: fifo1, S2: fifo2, equal: JSON.stringify(fifo1) === JSON.stringify(fifo2) };
    if (!o1) {
      row.code = "A-5";
      await closePane(ctx, pr, P);
      continue;
    }
    // 4–6: unread tail on S1 → EOF → post-EOF transitions → resume
    const h1 = await handover(ctx, pr, P, S1, S2, ["blocked", "working"], ["idle", "blocked"]);
    row.handover1 = h1;
    // EOF handling: S2 unaffected by S1 EOF
    const s2b = S2.pushes.length;
    await report(ctx, pr, P, "idle");
    row.s2AliveAfterS1Eof = Boolean(await S2.waitFor(statusIs(P, "idle"), 2000, s2b));
    // ≥2 re-subscribe chain: S2→S3, S3→S4
    const S3 = await subscribe(ctx, pr, `a${r}.S3`, subL(P));
    const h2 = await handover(ctx, pr, P, S2, S3, ["working", "blocked"], ["idle", "working"]);
    const S4 = await subscribe(ctx, pr, `a${r}.S4`, subL(P));
    const h3 = await handover(ctx, pr, P, S3, S4, ["idle", "blocked"], ["working", "idle"]);
    row.chain = [h2, h3];
    row.chainOk = [h2, h3].every((h) => h.tailDelivered === true && h.postEofOnOld === 0 && h.controlSawTail === true);
    S4.destroy();
    row.gStartEnd = gDiff(g0, await G(ctx, pr, P, `a${r}:end`));
    // classify on the first handover (doc §4 table)
    const control = h1.controlSawTail === true;
    const fin = h1.eofToEndMs !== null;
    const tailOk = h1.tailDelivered === true;
    const post = Number(h1.postEofOnOld);
    row.code = !control
      ? "UNDETERMINED"
      : tailOk && fin && post === 0
        ? "A-1"
        : fin && !tailOk
          ? "A-4"
          : post > 0 && !fin
            ? "A-3"
            : post === 0 && !fin
              ? "A-2"
              : "A-OTHER";
    await closePane(ctx, pr, P);
  }
  // A′: idle subscription — does the server close it on its own?
  for (let r = 1; r <= reps; r++) {
    progress(`A′ rep ${r}/${reps}`);
    const P = await scratchPane(ctx, pr, `prime${r}`);
    const S = await subscribe(ctx, pr, `a′${r}.S1`, subL(P));
    await report(ctx, pr, P, "working");
    const live = await S.waitFor(statusIs(P, "working"), 2000);
    await sleep(30_000);
    const base = S.pushes.length;
    await report(ctx, pr, P, "idle");
    const still = await S.waitFor(statusIs(P, "idle"), 2000, base);
    primes.push({
      rep: r,
      pane: P,
      liveness: Boolean(live),
      serverClosedIdle: S.closeAt !== null || S.endAt !== null,
      stillDelivering: Boolean(still),
    });
    S.destroy();
    await closePane(ctx, pr, P);
  }
  pr.facts.runs = runs;
  pr.facts.primeRuns = primes;
  const codes = runs.map((x) => String(x.code));
  pr.facts.codes = codes;
  const consistent = codes.every((c) => c === codes[0]);
  const fifoOk = runs.every((x) => rec(x.fifo).equal !== false);
  const chainOk = runs.every((x) => x.chainOk !== false);
  const primeOk = primes.every((x) => x.serverClosedIdle === false && x.stillDelivering === true);
  pr.facts.fifoOk = fifoOk;
  pr.facts.chainOk = chainOk;
  pr.facts.primeOk = primeOk;
  pr.facts.registrationVsAck = runs.map((x) => x.registrationVsAck);
  if (!consistent || codes.includes("UNDETERMINED") || codes.includes("A-OTHER")) {
    return { verdict: "INCONCLUSIVE", code: consistent ? (codes[0] ?? "NONE") : `MIXED:${codes.join(",")}` };
  }
  if (codes[0] === "A-1" && fifoOk && chainOk && primeOk) return { verdict: "PASS", code: "A-1" };
  if (codes[0] === "A-1") return { verdict: "FAIL", code: "A-1/aux-fail" };
  return { verdict: "FAIL", code: codes[0] ?? "NONE" };
}

type WindowClass = "none" | "latest-only" | "backlog";

function classifyWindow(seq: string[]): WindowClass {
  if (seq.length === 0) return "none";
  return seq.length === 1 ? "latest-only" : "backlog";
}

async function probeC(ctx: Ctx, pr: ProbeRun, reps: number): Promise<Outcome> {
  const runs: Rec[] = [];
  for (let r = 1; r <= reps; r++) {
    progress(`C rep ${r}/${reps}`);
    const P = await scratchPane(ctx, pr, `r${r}`);
    const row: Rec = { rep: r, pane: P };
    runs.push(row);
    const g0 = await G(ctx, pr, P, `c${r}:start`);
    const S1 = await subscribe(ctx, pr, `c${r}.S1`, subL(P));
    const history: string[] = [];
    for (const st of ["working", "idle", "working", "idle"] as const) {
      await report(ctx, pr, P, st);
      history.push(st);
      await sleep(1200);
    }
    row.gatePushes = statusSeq(S1, P).length;
    if (row.gatePushes === 0) {
      row.code = "UNDETERMINED";
      await closePane(ctx, pr, P);
      continue;
    }
    S1.destroy();
    await sleep(1000);
    const S2 = openSub(ctx, pr, `c${r}.S2`, subL(P));
    await S2.ack;
    await sleep(20_000);
    const w3 = S2.pushes.filter(statusOf(P));
    row.window3 = {
      seq: w3.map((p) => p.status),
      positions: w3.map((p) => (p.beforeAck ? "before-ack" : "after-ack")),
      class: classifyWindow(w3.map((p) => p.status ?? "")),
      latestLevel: history[history.length - 1],
    };
    const lb = S2.pushes.length;
    await report(ctx, pr, P, "working");
    row.liveness = Boolean(await S2.waitFor(statusIs(P, "working"), 2000, lb));
    S2.destroy();
    await sleep(200);
    const gGap0 = await G(ctx, pr, P, `c${r}:gap-before`);
    await report(ctx, pr, P, "idle");
    const gGap1 = await G(ctx, pr, P, `c${r}:gap-after`);
    row.gapG = gDiff(gGap0, gGap1);
    row.gapPaneList = await paneLevel(ctx, pr, P);
    await sleep(1000);
    const S3 = openSub(ctx, pr, `c${r}.S3`, subL(P));
    await S3.ack;
    await sleep(20_000);
    const w5 = S3.pushes.filter(statusOf(P));
    row.window5 = {
      seq: w5.map((p) => p.status),
      positions: w5.map((p) => (p.beforeAck ? "before-ack" : "after-ack")),
      class: classifyWindow(w5.map((p) => p.status ?? "")),
      gapIdleReplayed: w5.some((p) => p.status === "idle"),
    };
    S3.destroy();
    // terminal replay control
    const Q = await scratchPane(ctx, pr, `q${r}`);
    await closePane(ctx, pr, Q);
    await sleep(500);
    const S4 = openSub(ctx, pr, `c${r}.S4`, [{ type: "pane.closed" }]);
    await S4.ack;
    const qp = await S4.waitFor((p) => p.paneId === Q && p.event.includes("closed"), 10_000);
    row.terminalReplayControl = qp ? { replayed: true, event: qp.event, beforeAck: qp.beforeAck } : { replayed: false };
    S4.destroy();
    row.paneListEnd = await paneLevel(ctx, pr, P);
    row.gStartEnd = gDiff(g0, await G(ctx, pr, P, `c${r}:end`));
    const c3 = String(rec(row.window3).class);
    const c5 = String(rec(row.window5).class);
    row.code = !row.liveness
      ? "UNDETERMINED"
      : c3 === "none" && c5 === "none"
        ? "C-1"
        : c3 === "backlog"
          ? "C-2"
          : "C-3";
    const pos = [...(rec(row.window3).positions as string[]), ...(rec(row.window5).positions as string[])];
    row.ackPosition = pos.length === 0 ? "n/a" : pos.every((x) => x === pos[0]) ? pos[0] : "mixed";
    await closePane(ctx, pr, P);
  }
  pr.facts.runs = runs;
  pr.facts.otherSubscribersPossible = ctx.mode === "shared";
  pr.facts.sourceScope = "report_agent-sourced status only (detector-sourced replay = B2 scope)";
  const codes = runs.map((x) => String(x.code));
  pr.facts.codes = codes;
  pr.facts.ackPositions = runs.map((x) => x.ackPosition);
  if (codes.includes("UNDETERMINED") || !codes.every((c) => c === codes[0])) {
    return { verdict: "INCONCLUSIVE", code: codes.join(",") };
  }
  const control = runs.every((x) => rec(x.terminalReplayControl).replayed === true);
  pr.facts.terminalControlReplayed = control;
  if (codes[0] === "C-1") return control ? { verdict: "PASS", code: "C-1" } : { verdict: "INCONCLUSIVE", code: "C-1/no-control" };
  return { verdict: "FAIL", code: codes[0] ?? "NONE" };
}

async function probeD1(ctx: Ctx, pr: ProbeRun): Promise<Outcome> {
  const P = await scratchPane(ctx, pr, "p");
  const S = await subscribe(ctx, pr, "d1.S", subL(P));
  const D = await subscribe(ctx, pr, "d1.D", [{ type: "pane.agent_detected" }]);
  /** Reported real-work timeline (herdr-only "real end" = our idle report after a working report). */
  const timeline: Array<{ t: number; state: AgentState; phase: string }> = [];
  const rep = async (st: AgentState, phase: string): Promise<void> => {
    const t = await report(ctx, pr, P, st);
    timeline.push({ t, state: st, phase });
  };
  const phases: Rec[] = [];
  let pushOk = false;
  for (const dur of [200, 5000, 30_000]) {
    progress(`D1 working ${dur} ms`);
    const phase = `dur${dur}`;
    const g0 = await G(ctx, pr, P, `${phase}:before`);
    const base = S.pushes.length;
    await rep("working", phase);
    await sleep(dur);
    await rep("idle", phase);
    await sleep(5000);
    const g1 = await G(ctx, pr, P, `${phase}:after`);
    const seq = statusSeq(S, P, (p) => S.pushes.indexOf(p) >= base);
    if (seq.length) pushOk = true;
    phases.push({ phase, pushes: seq, level: { agentGet: g1.agent_status, paneList: await paneLevel(ctx, pr, P) }, g: gDiff(g0, g1) });
  }
  // mid-run idle→working re-entry
  {
    const phase = "reentry";
    const g0 = await G(ctx, pr, P, `${phase}:before`);
    const base = S.pushes.length;
    await rep("working", phase);
    await sleep(1000);
    const gMid0 = await G(ctx, pr, P, `${phase}:pre-mid-idle`);
    await rep("idle", `${phase}:mid`);
    await sleep(300);
    const gMid1 = await G(ctx, pr, P, `${phase}:mid-idle`);
    await rep("working", `${phase}:resume`);
    await sleep(1000);
    await rep("idle", phase);
    await sleep(5000);
    const g1 = await G(ctx, pr, P, `${phase}:after`);
    const pushes = S.pushes.slice(base).filter(statusOf(P));
    const midT0 = timeline.find((x) => x.phase === `${phase}:mid`)?.t ?? 0;
    const resumeT = timeline.find((x) => x.phase === `${phase}:resume`)?.t ?? 0;
    phases.push({
      phase,
      pushes: pushes.map((p) => p.status),
      doneAtIntermediateIdle: pushes.some((p) => p.status === "done" && p.t >= midT0 && p.t < resumeT + 200),
      completionSeqAtIntermediateIdle: gDiff(gMid0, gMid1),
      g: gDiff(g0, g1),
    });
  }
  // step 4: focus (private only)
  if (ctx.mode === "private") {
    const base = S.pushes.length;
    const g0 = await G(ctx, pr, P, "focus:before");
    const f = await tryCall(ctx, pr.name, "pane.focus", { pane_id: P });
    await sleep(3000);
    const g1 = await G(ctx, pr, P, "focus:after");
    const P2 = await scratchPane(ctx, pr, "p2");
    const f2 = await tryCall(ctx, pr.name, "pane.focus", { pane_id: P2 });
    const base2 = S.pushes.length;
    await rep("working", "unfocused-rerun");
    await sleep(1000);
    await rep("idle", "unfocused-rerun");
    await sleep(5000);
    const g2 = await G(ctx, pr, P, "unfocused-rerun:after");
    phases.push({
      phase: "focus",
      focusOk: f.ok,
      pushesOnFocus: statusSeq(S, P, (p) => S.pushes.indexOf(p) >= base && S.pushes.indexOf(p) < base2),
      gFocus: gDiff(g0, g1),
      focusOtherOk: f2.ok,
      pushesUnfocusedRerun: statusSeq(S, P, (p) => S.pushes.indexOf(p) >= base2),
      gRerun: gDiff(g1, g2),
    });
  } else {
    phases.push({ phase: "focus", skipped: "SKIPPED(shared) §2.5-3" });
  }
  // step 5: release
  {
    const base = S.pushes.length;
    const dBase = D.pushes.length;
    const rl = await tryCall(ctx, pr.name, "pane.release_agent", { pane_id: P, source: `hsprobe-${pr.name}`, agent: "bash" });
    timeline.push({ t: rl.t, state: "unknown", phase: "release" });
    await sleep(3000);
    const det = D.pushes.slice(dBase).filter((p) => p.paneId === P);
    phases.push({
      phase: "release",
      ok: rl.ok,
      error: rl.ok ? undefined : rl.error,
      pushes: statusSeq(S, P, (p) => S.pushes.indexOf(p) >= base),
      detected: det.map((p) => p.raw),
      finalStatus: det.map((p) => rec(p.raw.data).final_status ?? null),
    });
  }
  // step 6: close
  {
    const base = S.pushes.length;
    timeline.push({ t: now(), state: "unknown", phase: "close" });
    await closePane(ctx, pr, P);
    await sleep(3000);
    phases.push({
      phase: "close",
      pushes: S.pushes.slice(base).map((p) => ({ event: p.event, status: p.status, pane: p.paneId })),
    });
  }
  pr.facts.phases = phases;
  pr.facts.agentDetectedOtherPanes = D.pushes.filter((p) => p.paneId !== P).length;
  // done ↔ real end relation
  const dones = S.pushes.filter(statusIs(P, "done"));
  const doneRows = dones.map((p) => {
    const prior = timeline.filter((x) => x.t <= p.t);
    const last = prior[prior.length - 1];
    const lastIdle = [...prior].reverse().find((x) => x.state === "idle");
    const lastWorking = [...prior].reverse().find((x) => x.state === "working");
    const afterWork = Boolean(lastIdle && lastWorking && lastWorking.t < lastIdle.t);
    return {
      t: p.t,
      phase: last?.phase ?? "before-any-report",
      msFromLastIdleReport: lastIdle ? p.t - lastIdle.t : null,
      afterReportedWorkEnd: afterWork,
    };
  });
  pr.facts.doneVsRealEnd = doneRows;
  pr.facts.doneCount = dones.length;
  pr.facts.realEndDefinition = "herdr-only: the idle report_agent that follows a working report (B2/D2 needed for CLI runs)";
  const gs = (pr.facts.gSnapshots ?? []) as GSnap[];
  const csRises = gs.filter((g, i) => {
    const prev = gs[i - 1];
    return i > 0 && prev && g.completion_seq !== null && prev.completion_seq !== null && g.completion_seq > prev.completion_seq;
  });
  pr.facts.completionSeqRises = csRises.map((g) => g.label);
  if (!pushOk) return { verdict: "INCONCLUSIVE", code: "UNDETERMINED" };
  const terminalOnly = doneRows.every((d) => d.phase === "release" || d.phase === "close");
  const code = dones.length === 0 ? "D-4" : terminalOnly ? "D-2" : "D-1";
  const bad = doneRows.some((d) => !d.afterReportedWorkEnd && d.phase !== "release" && d.phase !== "close");
  return bad ? { verdict: "FAIL", code: `${code}/done-without-work-end` } : { verdict: "PASS", code };
}

async function probeE(ctx: Ctx, pr: ProbeRun, reps: number): Promise<Outcome> {
  const runs: Rec[] = [];
  const wait = async (P: string, timeoutMs: number): Promise<Rec> => {
    const t0 = now();
    const r = await tryCall(ctx, pr.name, "agent.wait", { target: P, until: ["idle", "done"], timeout_ms: timeoutMs }, timeoutMs + ctx.timeoutMs);
    return { t0, ms: r.t - t0, ok: r.ok, result: r.ok ? r.result : undefined, error: r.ok ? undefined : r.error };
  };
  for (let r = 1; r <= reps; r++) {
    progress(`E rep ${r}/${reps}`);
    const P = await scratchPane(ctx, pr, `r${r}`);
    const row: Rec = { rep: r, pane: P };
    runs.push(row);
    await report(ctx, pr, P, "working");
    await sleep(1000);
    await report(ctx, pr, P, "idle");
    await sleep(2000);
    const g0 = await G(ctx, pr, P, `e${r}:level`);
    row.levelAtCall = g0.agent_status;
    const level = await wait(P, 5000);
    row.eLevel = level;
    const g1 = await G(ctx, pr, P, `e${r}:after-level`);
    // edge
    const edgeP = wait(P, 10_000);
    await sleep(1000);
    const tW = await report(ctx, pr, P, "working");
    await sleep(1000);
    const tI = await report(ctx, pr, P, "idle");
    const edge = await edgeP;
    row.eEdge = { ...edge, workingAtMs: tW - Number(edge.t0), idleAtMs: tI - Number(edge.t0) };
    const g2 = await G(ctx, pr, P, `e${r}:after-edge`);
    // working control
    await report(ctx, pr, P, "working");
    await sleep(300);
    const wk = wait(P, 5000);
    await sleep(2000);
    const tI2 = await report(ctx, pr, P, "idle");
    const work = await wk;
    row.eWorking = { ...work, idleAtMs: tI2 - Number(work.t0) };
    const g3 = await G(ctx, pr, P, `e${r}:after-working`);
    row.g = [gDiff(g0, g1), gDiff(g1, g2), gDiff(g2, g3)];
    const lvlMs = Number(level.ms);
    const workMs = Number(work.ms);
    const workIdle = Number(rec(row.eWorking).idleAtMs);
    const edgeMs = Number(edge.ms);
    const edgeIdle = Number(rec(row.eEdge).idleAtMs);
    const edgeWork = Number(rec(row.eEdge).workingAtMs);
    const controlOk = work.ok === true && workMs >= workIdle - 200;
    row.code = !controlOk
      ? "UNDETERMINED"
      : level.ok === true && lvlMs < 500
        ? "E-1"
        : lvlMs >= 4500 && Math.abs(edgeMs - edgeIdle) < 700
          ? "E-2"
          : Math.abs(edgeMs - edgeWork) < 700
            ? "E-3/working-edge"
            : "E-3";
    await closePane(ctx, pr, P);
  }
  pr.facts.runs = runs;
  const codes = runs.map((x) => String(x.code));
  pr.facts.codes = codes;
  if (codes.includes("UNDETERMINED") || !codes.every((c) => c === codes[0])) {
    return { verdict: "INCONCLUSIVE", code: codes.join(",") };
  }
  return codes[0] === "E-1" || codes[0] === "E-2"
    ? { verdict: "PASS", code: codes[0] }
    : { verdict: "INCONCLUSIVE", code: codes[0] ?? "NONE" };
}

function writeFakeBins(ctx: Ctx): string {
  const dir = join(ctx.T, "fakebin");
  mkdirSync(dir, { recursive: true });
  for (const k of FAKE_KINDS) {
    const p = join(dir, k);
    writeFileSync(
      p,
      `#!/bin/sh\n# hsprobe fake ${k} — no network, no credentials\necho "hsprobe fake ${k} ready"\nwhile IFS= read -r line; do echo "fake ${k}: $line"; done\n`,
    );
    chmodSync(p, 0o755);
  }
  return dir;
}

async function probeB1(ctx: Ctx, pr: ProbeRun): Promise<Outcome> {
  if (ctx.mode === "shared") {
    pr.facts.reason = "§2.5-4: shared requires a prior private Step-0 fake-binary resolution check";
    return { verdict: "SKIPPED", code: "SKIPPED(shared)" };
  }
  if (!ctx.manifests) {
    pr.facts.reason = "server.agent_manifests unavailable — cannot predict kind resolution";
    return { verdict: "INCONCLUSIVE", code: "NOT_APPLICABLE" };
  }
  const fakebin = join(ctx.T, "fakebin");
  const kinds: Rec[] = [];
  for (const kind of FAKE_KINDS) {
    progress(`B1 kind ${kind}`);
    const row: Rec = { kind };
    kinds.push(row);
    const mentioned = JSON.stringify(ctx.manifests).includes(`"${kind}"`);
    const abs = manifestAbsPaths(ctx.manifests, kind).filter((p) => !isUnder(p, ctx.T));
    row.inManifests = mentioned;
    row.manifestAbsPaths = abs;
    if (!mentioned) {
      row.code = "NOT_IN_MANIFESTS";
      continue;
    }
    if (abs.length) {
      row.code = "NOT_APPLICABLE";
      continue;
    }
    const P = await scratchPane(ctx, pr, kind, { PATH: `${fakebin}:/usr/bin:/bin` });
    const S = await subscribe(ctx, pr, `b1.${kind}.S`, subL(P));
    const D = await subscribe(ctx, pr, `b1.${kind}.D`, [{ type: "pane.agent_detected" }]);
    const g0 = await G(ctx, pr, P, `${kind}:before-start`);
    const tStart = now();
    const st = await tryCall(ctx, pr.name, "agent.start", {
      name: `hsprobe-b1-${kind}-${ctx.run}`,
      kind,
      pane_id: P,
      timeout_ms: 10_000,
    }, ctx.timeoutMs + 10_000);
    row.start = st.ok ? { ok: true, ms: st.t - tStart, result: st.result } : { ok: false, error: st.error };
    // resolution check: cmdline must be the fake under T
    let resolved = "unknown";
    const until = now() + 3000;
    while (now() < until) {
      const pi = await tryCall(ctx, pr.name, "pane.process_info", { pane_id: P });
      const j = pi.ok ? JSON.stringify(pi.result) : "";
      if (j.includes(fakebin)) {
        resolved = "fake";
        row.processInfo = pi.ok ? pi.result : null;
        break;
      }
      if (j.includes(kind)) {
        resolved = "real-or-other";
        row.processInfo = pi.ok ? pi.result : null;
        break;
      }
      await sleep(200);
    }
    row.resolved = resolved;
    if (resolved === "real-or-other") {
      await closePane(ctx, pr, P);
      row.code = "ABORTED_REAL_CLI";
      continue;
    }
    if (!st.ok || resolved !== "fake") {
      row.code = "NOT_APPLICABLE";
      await closePane(ctx, pr, P);
      continue;
    }
    // launch_pending / interactive_ready timing (25 ms poll, ≤10 s)
    let readyAt: number | null = null;
    let pendingClearedAt: number | null = null;
    const pollUntil = now() + 10_000;
    while (now() < pollUntil) {
      const r = await tryCall(ctx, pr.name, "agent.get", { target: P });
      const a = r.ok ? rec(r.result.agent) : {};
      if (pendingClearedAt === null && a.launch_pending === false) pendingClearedAt = now();
      if (a.interactive_ready === true) {
        readyAt = now();
        break;
      }
      await sleep(25);
    }
    row.startToPendingClearedMs = pendingClearedAt ? pendingClearedAt - tStart : null;
    row.startToReadyMs = readyAt ? readyAt - tStart : null;
    const obsBase = S.pushes.length;
    const obsEnd = now() + 30_000;
    while (now() < obsEnd) {
      await G(ctx, pr, P, `${kind}:obs`);
      await sleep(500);
    }
    const all = S.pushes.filter(statusOf(P));
    row.pushesBeforeReady = all.filter((p) => readyAt === null || p.t < readyAt).map((p) => ({ s: p.status, ms: p.t - tStart }));
    row.pushesNoPrompt30s = S.pushes.slice(obsBase).filter(statusOf(P)).map((p) => ({ s: p.status, ms: p.t - tStart }));
    row.agentDetected = D.pushes.filter((p) => p.paneId === P).map((p) => p.raw);
    row.agentDetectedOtherPanes = D.pushes.filter((p) => p.paneId !== P).length;
    const g1 = await G(ctx, pr, P, `${kind}:obs-end`);
    row.g = gDiff(g0, g1);
    const cb = S.pushes.length;
    await report(ctx, pr, P, "working");
    row.control = Boolean(await S.waitFor(statusIs(P, "working"), 2000, cb));
    const sawWorking = all.some((p) => p.status === "working");
    row.code = !row.control ? "UNDETERMINED" : sawWorking ? "B1-BOOT-WORKING" : "B1-NO-BOOT-WORKING";
    S.destroy();
    D.destroy();
    await closePane(ctx, pr, P);
  }
  pr.facts.kinds = kinds;
  const codes = kinds.map((k) => String(k.code));
  pr.facts.codes = codes;
  if (codes.includes("ABORTED_REAL_CLI")) return { verdict: "INCONCLUSIVE", code: "ABORTED_REAL_CLI" };
  if (codes.includes("B1-BOOT-WORKING")) return { verdict: "FAIL", code: "B1-BOOT-WORKING" };
  if (codes.includes("B1-NO-BOOT-WORKING") && !codes.includes("UNDETERMINED")) {
    return { verdict: "PASS", code: "B1-NO-BOOT-WORKING" };
  }
  return { verdict: "INCONCLUSIVE", code: codes.join(",") };
}

// ─── global cleanup (§2.3) ───────────────────────────────────────────────────

async function globalCleanup(ctx: Ctx): Promise<Rec> {
  const out: Rec = {};
  for (const s of ctx.sinks) s.destroy();
  if (ctx.workspaceId && ctx.sock) {
    const r = await tryCall(ctx, "cleanup", "workspace.close", { workspace_id: ctx.workspaceId });
    if (r.ok) {
      ctx.runClosed.workspaces.push({ id: ctx.workspaceId, t: r.t });
      for (const t of ctx.runCreated.tabs) ctx.runClosed.tabs.push({ id: t.id, t: r.t });
      for (const p of ctx.runCreated.panes) ctx.runClosed.panes.push({ id: p.id, t: r.t });
    } else {
      out.workspaceCloseError = r.error;
    }
  }
  const leftover: string[] = [];
  if (ctx.sock && existsSync(ctx.sock)) {
    const pl = await tryCall(ctx, "cleanup", "pane.list", {});
    if (pl.ok) {
      const live = new Set((Array.isArray(pl.result.panes) ? pl.result.panes : []).map((x) => str(rec(x).pane_id) ?? ""));
      for (const id of ctx.owned.panes) if (live.has(id)) leftover.push(`pane:${id}`);
    }
    if (ctx.workspaceId) {
      const wl = await tryCall(ctx, "cleanup", "workspace.list", {});
      if (wl.ok && JSON.stringify(wl.result).includes(`"${ctx.workspaceId}"`)) leftover.push(`workspace:${ctx.workspaceId}`);
    }
  }
  if (ctx.mode === "private" && ctx.sock && isUnder(ctx.sock, ctx.T)) {
    const st = await tryCall(ctx, "cleanup", "server.stop", {}, 5000);
    out.serverStop = st.ok ? "ok" : st.error;
    const until = now() + 5000;
    while (now() < until && ctx.serverPids.some(pidAlive)) await sleep(100);
    const survivors = ctx.serverPids.filter(pidAlive);
    for (const pid of survivors) {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        /* */
      }
    }
    out.serverPidsSigtermed = survivors;
    if (survivors.length) {
      await sleep(1000);
      for (const pid of survivors.filter(pidAlive)) leftover.push(`server-pid:${pid}`);
    }
  }
  out.created = ctx.runCreated;
  out.closed = ctx.runClosed;
  out.leftover = leftover;
  ev(ctx, "cleanup", "PROBE_END", out);
  return out;
}

// ─── main ────────────────────────────────────────────────────────────────────

function scrubEnv(home: string, T: string): void {
  if (process.env.LOOM_HERDR_SOCKET) process.env.LOOM_HERDR_SOCKET_ORIG = process.env.LOOM_HERDR_SOCKET;
  for (const k of Object.keys(process.env)) {
    if ((k.startsWith("LOOM_") && k !== "LOOM_HERDR_SOCKET_ORIG") || k.startsWith("HERDR_")) delete process.env[k];
  }
  process.env.HOME = home;
  process.env.LOOM_TEST_HOME = T;
}

async function main(): Promise<number> {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(parsed.message);
    return parsed.exit;
  }
  const args = parsed.args;
  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  if (args.dryRun) {
    console.log(
      JSON.stringify({ dryRun: true, server: args.server, probes: args.probes, timeoutMs: args.timeoutMs, reps: args.reps }),
    );
    for (const p of args.probes) {
      const reps = args.reps ?? DEFAULT_REPS[p];
      console.log(`\n# ${p} (reps ${reps})`);
      for (const line of plannedSequence(p, args.server, reps)) console.log(`  - ${line}`);
    }
    console.log("\n# cleanup: destroy sockets → close owned panes/tabs → workspace.close → (private) server.stop on T/ socket → SIGTERM own pid only");
    return 0;
  }

  const realHome = homedir();
  const T = realpathSync(mkdtempSync(join(tmpdir(), "loom-herdr-probe-")));
  const home = join(T, "home");
  mkdirSync(home, { recursive: true });
  mkdirSync(join(T, "tmp"), { recursive: true });
  // §2.2: must run outside a herdr pane — record any inherited HERDR_* keys (names only) as a hint.
  const inheritedHerdrEnv = Object.keys(process.env).filter((k) => k.startsWith("HERDR_"));
  scrubEnv(home, T);
  const ctx: Ctx = {
    run: randomBytes(3).toString("hex"),
    T,
    home,
    mode: args.server,
    sock: "",
    timeoutMs: args.timeoutMs,
    logPath: join(T, "events.ndjson"),
    start: now(),
    protectedPanes: new Set(),
    owned: { workspaces: new Set(), tabs: new Set(), panes: new Set() },
    runCreated: emptyLedger(),
    runClosed: emptyLedger(),
    workspaceId: null,
    serverPids: [],
    manifests: null,
    pushOk: false,
    seq: new Map(),
    sinks: new Set(),
  };
  writeFakeBins(ctx);
  console.log(`T=${T}`);
  ev(ctx, "run", "PROBE_BEGIN", { args, run: ctx.run, pid: process.pid, inheritedHerdrEnv });
  if (inheritedHerdrEnv.length) progress(`warning: HERDR_* env inherited (${inheritedHerdrEnv.join(",")}) — inside a pane?`);

  const summaries: Summary[] = [];
  let cleanupOut: Rec | null = null;
  let cleaning = false;
  const cleanupOnce = async (): Promise<Rec> => {
    if (cleaning) return cleanupOut ?? {};
    cleaning = true;
    cleanupOut = await globalCleanup(ctx);
    return cleanupOut;
  };
  const onSignal = (sig: string): void => {
    progress(`${sig} — cleaning up`);
    ev(ctx, "run", "SIGNAL", sig);
    void cleanupOnce().finally(() => process.exit(130));
  };
  process.on("SIGINT", () => onSignal("SIGINT"));
  process.on("SIGTERM", () => onSignal("SIGTERM"));

  let aborted = false;
  try {
    const s = await setup(ctx, realHome);
    for (const name of args.probes) {
      const pr: ProbeRun = { name, facts: {}, created: emptyLedger(), closed: emptyLedger(), sinks: [], closeErrors: [] };
      let outcome: Outcome = { verdict: "INCONCLUSIVE", code: "NONE" };
      if (aborted || (!s.ok && name !== "step0")) {
        outcome = { verdict: "SKIPPED", code: `SKIPPED(${s.ok ? "aborted" : s.code})` };
      } else if (name !== "step0" && name !== "b1" && !ctx.pushOk) {
        outcome = { verdict: "INCONCLUSIVE", code: "UNDETERMINED(S0-NOPUSH)" };
      } else {
        progress(`probe ${name}`);
        try {
          const reps = args.reps ?? DEFAULT_REPS[name];
          switch (name) {
            case "step0":
              outcome = await probeStep0(ctx, pr, s);
              break;
            case "a":
              outcome = await probeA(ctx, pr, reps);
              break;
            case "c":
              outcome = await probeC(ctx, pr, reps);
              break;
            case "d1":
              outcome = await probeD1(ctx, pr);
              break;
            case "e":
              outcome = await probeE(ctx, pr, reps);
              break;
            case "b1":
              outcome = await probeB1(ctx, pr);
              break;
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          pr.facts.error = msg;
          ev(ctx, name, "PROBE_ERROR", msg);
          outcome = { verdict: "INCONCLUSIVE", code: msg.startsWith("REFUSED") ? "REFUSED" : "ERROR" };
          if (msg.startsWith("REFUSED")) aborted = true;
        }
      }
      const leftover = await finishProbe(ctx, pr);
      if (name === "step0" && !s.ok) aborted = true;
      const summary: Summary = { probe: name, verdict: outcome.verdict, code: outcome.code, facts: pr.facts, created: pr.created, closed: pr.closed, leftover };
      summaries.push(summary);
      ev(ctx, name, "PROBE_SUMMARY", summary);
      console.log(JSON.stringify({ probe: name, verdict: outcome.verdict, code: outcome.code, leftover }));
    }
  } finally {
    await cleanupOnce();
  }
  const runOut = cleanupOut ?? {};
  const dirty = summaries.some((x) => x.leftover.length > 0) || ((runOut.leftover as string[] | undefined)?.length ?? 0) > 0;
  const final = { T, run: ctx.run, server: ctx.mode, socket: ctx.sock, dirty, cleanup: runOut, probes: summaries };
  writeFileSync(join(T, "summary.json"), `${JSON.stringify(final, null, 2)}\n`);
  console.log(JSON.stringify({ T, dirty, summary: join(T, "summary.json"), log: ctx.logPath }));
  for (const x of summaries) console.log(JSON.stringify(x));
  return aborted || summaries.some((x) => x.verdict === "FAIL") ? 1 : 0;
}

if (import.meta.main) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      console.error(e);
      process.exit(1);
    },
  );
}
