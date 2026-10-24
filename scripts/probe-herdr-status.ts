/**
 * HERDR-STATUS-PROBES harness — `[herdr 전용]` probes (Step 0 · A · B1 · C · D1 · E · s) + the owner-gated
 * `[실 CLI — 오너 yes]` probes B2 · D2 (claude only).
 *
 * Design SSOT: docs/spikes/HERDR-STATUS-PROBES.md §2 (form · isolation · cleanup · G-snapshots ·
 * shared safety block). Target herdr 0.9.5 / protocol 22; method names/params from
 * docs/spikes/fixtures/herdr-v0.9.5/schema.json.
 *
 * v2 (run-1 analysis): herdr drops a `report_agent` claim on a plain shell pane within ~0.1–1 s, so
 * A·C·D1·E·s run on "held" panes — fake-agent panes started with `agent.start` (PATH fake binary) —
 * driven by the report_agent `agent` name Step 0 found to persist (§2.6). Every step asserts the
 * expected level with `G(P)` first; a mismatch is recorded as `LEVEL_LOST` (INCONCLUSIVE, never FAIL).
 *
 * Usage (repo root, OUTSIDE any herdr pane; not concurrently with worker test suites):
 *   bun run scripts/probe-herdr-status.ts [--server private|shared] [--probe step0,a,b1,c,d1,e,s|all]
 *                                         [--timeout-ms N] [--reps N] [--dry-run] [--help]
 *   bun run scripts/probe-herdr-status.ts --probe b2,d2 --real-cli --owner-approved [--kind claude]
 *
 * B2 / D2 (`[실 CLI — 오너 yes]`, owner yes 2026-10-23: once each, kind `claude` only, HOME = §5.4
 * option 1) run only with `--probe b2,d2 --real-cli --owner-approved` on the private server; every
 * other request for b2/d2 (missing flag · `--server shared` · `--kind` ≠ claude) exits 2. The probe
 * process and herdr server stay in temp HOME; only the CLI pane env gets the real HOME. Screen text
 * (agent.read / pane.read) is stored under T only, with lines matching /api[_-]?key|token|secret/i redacted.
 *
 * Raw NDJSON socket only (no HerdrClient — its re-subscribe logic would pollute observations).
 * Helpers are copied from scripts/probe-pane-death.ts (importing it would run its main()).
 *
 * Output: T = mkdtemp(tmpdir()/loom-herdr-probe-) — NDJSON log `T/events.ndjson`, summary
 * `T/summary.json`; stdout = `T=<path>` + one JSON summary line per probe. T is never deleted.
 * Exit: 0 = ran (no FAIL) · 1 = some probe FAIL or run aborted · 2 = usage / refused.
 */
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
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
import { dirname, join, resolve, sep } from "node:path";

// ─── types · tiny helpers ────────────────────────────────────────────────────

type Rec = Record<string, unknown>;
type ProbeName = "step0" | "a" | "b1" | "c" | "d1" | "e" | "s" | "b2" | "d2";
type ServerMode = "private" | "shared";
type Verdict = "PASS" | "FAIL" | "INCONCLUSIVE" | "SKIPPED";
type AgentState = "idle" | "working" | "blocked" | "unknown";

const rec = (v: unknown): Rec => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {});
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const now = (): number => Date.now();

/** §9 execution order: S0 → A → C → D1 → E → s → B1. */
const ALL_PROBES: ProbeName[] = ["step0", "a", "c", "d1", "e", "s", "b1"];
/** `[실 CLI — 오너 yes]` probes: never in "all"; run after the herdr-only ones, B2 then D2 (§9-2). */
const REAL_CLI_PROBES: ProbeName[] = ["b2", "d2"];
const DEFAULT_REPS: Record<ProbeName, number> = { step0: 1, a: 5, b1: 1, c: 2, d1: 1, e: 2, s: 2, b2: 1, d2: 1 };
const EXPECTED_VERSION = "0.9.5";
const EXPECTED_PROTOCOL = 22;
const REAL_CLI_REFUSAL =
  "b2/d2 require --real-cli --owner-approved (owner yes 2026-10-23: once each, kind claude only, private server, HOME §5.4 option 1)";
const FAKE_KINDS = ["claude", "codex", "grok"] as const;
/** Owner decision 2026-10-23 — recorded in every B2/D2 result. */
const REAL_CLI_KIND = "claude";
const REAL_CLI_HOME = "/Users/kyoungsiklee";
const REAL_CLI_CWD = "/Users/kyoungsiklee/projects/loom";
const OWNER_DECISION = {
  date: "2026-10-23",
  source:
    "owner AskUserQuestion answers 2026-10-23: \"yes — claude만 (권장)\" + \"1: CLI pane만 실 HOME (권장)\"; re-run 2026-10-24: \"yes — 같은 조건으로 1회 재실행\"",
  recordedIn: ["<T>/summary.json ownerDecision", "<T>/events.ndjson PROBE_BEGIN", "docs/spikes/HERDR-STATUS-PROBES.md B2/D2 result rows"],
  scope: "B2 and D2 once each, kind claude only",
  server: "private",
  homeChoice:
    "§5.4 option 1 — probe process + herdr server in temp HOME (private server); only the CLI pane env gets HOME=/Users/kyoungsiklee",
} as const;
const D2_PROMPT = "Reply with the single word OK.";
const REDACT_RE = /api[_-]?key|token|secret/i;

// ─── CLI ─────────────────────────────────────────────────────────────────────

interface Args {
  server: ServerMode;
  probes: ProbeName[];
  timeoutMs: number;
  reps: number | null;
  dryRun: boolean;
  help: boolean;
  realCli: boolean;
  ownerApproved: boolean;
}

type ParseResult = { ok: true; args: Args } | { ok: false; exit: number; message: string };

const USAGE = `probe-herdr-status — HERDR-STATUS-PROBES [herdr 전용] harness (herdr ${EXPECTED_VERSION} / protocol ${EXPECTED_PROTOCOL})

  bun run scripts/probe-herdr-status.ts [options]

  --server private|shared   private (default): own herdr server under a temp dir (§2.2).
                            shared: the user's herdr ($LOOM_HERDR_SOCKET or ~/.config/herdr/herdr.sock)
                            under the §2.5 safety block (dedicated workspace, focus:false, no server control,
                            B1 and D1 step 4 skipped; no held panes → C/D1/E/s INCONCLUSIVE,
                            A on plain shell panes).
  --probe LIST              comma list of step0,a,b1,c,d1,e,s (alias s0) or "all" (default all; never b2/d2).
                            step0 always runs first — every other probe depends on it (incl. the
                            held-pane driver check, private only).
  --timeout-ms N            RPC / events.subscribe ACK timeout in ms (default 15000).
  --reps N                  override per-probe repetitions (doc defaults: a=5 c=2 e=2 s=2 step0=b1=d1=1).
  --dry-run                 parse args and print the planned RPC sequence per probe; no herdr contact.
  --help                    this text.

  [실 CLI — 오너 yes] (owner yes 2026-10-23: B2·D2 once each, claude only, HOME §5.4 option 1):
  --probe b2,d2             real claude CLI probes; never part of "all"; run after the herdr-only probes.
  --real-cli                required for b2/d2.
  --owner-approved          required for b2/d2.
  --kind claude             optional; any other kind → exit 2.
                            b2/d2 without both flags, with --server shared, or the flags without b2/d2 → exit 2.
                            --reps does not apply to b2/d2 (once each).

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
    realCli: false,
    ownerApproved: false,
  };
  const refuse = (why = REAL_CLI_REFUSAL): ParseResult => ({ ok: false, exit: 2, message: why });
  let kindGiven = false;
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
        args.realCli = true;
        break;
      case "--owner-approved":
        args.ownerApproved = true;
        break;
      case "--kind": {
        const v = value();
        if (v !== REAL_CLI_KIND) return refuse(`--kind ${v}: only kind ${REAL_CLI_KIND} is owner-approved (2026-10-23)`);
        kindGiven = true;
        break;
      }
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
          if (p === "b2" || p === "d2") {
            out.add(p);
          } else if (p === "all") {
            for (const q of ALL_PROBES) out.add(q);
          } else if (p === "s0" || p === "step0") {
            out.add("step0");
          } else if (p === "a" || p === "b1" || p === "c" || p === "d1" || p === "e" || p === "s") {
            out.add(p);
          } else {
            return bad(`unknown probe: ${p}`);
          }
        }
        args.probes = [...ALL_PROBES.filter((p) => out.has(p)), ...REAL_CLI_PROBES.filter((p) => out.has(p))];
        break;
      }
      default:
        return bad(`unknown argument: ${raw}`);
    }
  }
  const wantsReal = args.probes.some((p) => REAL_CLI_PROBES.includes(p));
  if (wantsReal && !(args.realCli && args.ownerApproved)) return refuse();
  if (wantsReal && args.server !== "private") {
    return refuse(`b2/d2 run on the private server only (owner yes 2026-10-23); --server ${args.server} refused`);
  }
  if (!wantsReal && (args.realCli || args.ownerApproved || kindGiven)) {
    return refuse("--real-cli / --owner-approved / --kind are only valid with --probe b2|d2");
  }
  return { ok: true, args };
}

function plannedSequence(p: ProbeName, mode: ServerMode, reps: number): string[] {
  const subL = 'events.subscribe{[pane.agent_status_changed{pane_id:P}, pane.closed, pane.exited]}';
  const rep = (s: string) => `${s}  (×${reps})`;
  const held =
    mode === "private"
      ? "held pane H = tab.create{env:{PATH:T/fakebin:…}} → agent.start{kind:<fake kind>} → process_info = T/fakebin → agent.get until interactive_ready ∧ idle"
      : "shared: no held panes (§2.5-4) →";
  const lvl = "before every step: G(P) must show the expected level, else that step = LEVEL_LOST (INCONCLUSIVE)";
  switch (p) {
    case "step0":
      return [
        mode === "private"
          ? "spawn: env -i PATH=T/fakebin:/usr/bin:/bin HOME=T/home HERDR_SOCKET_PATH=T/herdr.sock herdr server (detached)"
          : "socket: $LOOM_HERDR_SOCKET or ~/.config/herdr/herdr.sock (shared — §2.5)",
        "probe env: inherited HERDR_* (and LOOM_*) keys stripped before any herdr contact; names recorded (facts.herdrEnvStripped)",
        "ping{} → require version 0.9.5 · protocol 22 (else abort)",
        "pane.list{} → PROTECTED (+ focused set)",
        "workspace.create{focus:false, label:hsprobe-<run>, cwd:T} (shared: focused set must be unchanged)",
        "server.agent_manifests{}",
        "tab.create{workspace_id, focus:false, label:hsprobe-step0-…, cwd:T, env:{HOME,LOOM_TEST_HOME}} → P0",
        `G(P0)=agent.get{target:P0} → ${subL.replace("P", "P0")} ACK`,
        "pane.report_agent{P0, source:hsprobe-s0, agent:bash, state:working, seq} → push ≤2 s → G (fresh?)",
        "pane.report_agent{… idle} → push → G",
        "close P0 (pane.close / tab.close)",
        mode === "private"
          ? `held-pane driver check: ${held}`
          : "held-pane driver check SKIPPED(shared) — §2.5-4",
        "  for agent in [<fake kind>, bash]: report_agent{H, agent, working} → agent.get every 25 ms for 2 s (all working?) → report idle → 1 s (idle|done held?)",
        "  first agent whose working AND idle levels hold = driver (facts.heldSubstrate); none → C/D1/E/s INCONCLUSIVE(NO_HELD_DRIVER)",
      ];
    case "a":
      return [
        rep(mode === "private" ? held : "tab.create → P (plain shell — no held panes in shared)"),
        lvl,
        `S1 = ${subL} ACK → report(working) → S1 push (post-ACK registration + liveness)`,
        "S2 = events.subscribe (no await) + report(idle) before ACK → first P status push on S2: before/after ACK or missed",
        "report(working) → S1 & S2 both (overlap) → report idle,working,idle back-to-back → FIFO: S2 sequence = suffix of S1's since S2 open",
        "(a) h1 S1→S2 flowing: tail blocked,working → S2 saw tail → S1.end() [t_eof] → post idle,blocked → 'end'/'close' ≤30 s",
        "S2 still live after S1 EOF: report(idle) → S2",
        "(a) h2 S2→S3 flowing (2nd re-subscribe; chainOk = h1 ∧ h2)",
        "(b) h3 S3→S4 paused: S3.pause() → tail → S4 saw tail → +300 ms S3.end() → post → +1 s resume()",
        "(c) h4 python3 -I raw AF_UNIX client (T/py/, stdlib socket) → subscribe ACK → stop reading → tail → S4 saw tail → shutdown(SHUT_WR) → post → 1.5 s → recv to EOF",
        "per handover: old sequence must equal the control's prefix up to t_eof (herdr-inserted unknown/done tolerated) · post-EOF count",
        "variant A′ (new pane): S1 ACK → liveness → 30 s nothing → still open? report → S1",
        "close P",
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
      if (mode === "shared") return ["INCONCLUSIVE(NO_HELD_SUBSTRATE) — needs held panes (private only)"];
      return [
        rep(held),
        lvl,
        `S1 = ${subL} → gate report working,idle,working,blocked @1.2 s → S1 ≥1 push · level held = blocked`,
        "G(P)=blocked → S1.destroy() → 1 s → G(P)=blocked → S2 = subscribe → 20 s: P status pushes (count/order/ACK position)",
        "liveness report(working) → S2 (control)",
        "S2.destroy() → report(blocked) with 0 subscribers → G(P)=blocked → S3 = subscribe at once (gap→SUB_TX ms) → 20 s",
        "liveness report(working) → S3 (control)",
        "fact only (not a control — 0.9.5 does not replay it): tab.create → Q → pane.close{Q} → S4{[pane.closed]} → 10 s",
        "classify per window: none / latest-only (1 push = held level) / backlog; close P",
      ];
    case "d1":
      if (mode === "shared") return ["INCONCLUSIVE(NO_HELD_SUBSTRATE) — needs held panes (private only)"];
      return [
        held,
        lvl,
        "subscribe L + global pane.agent_detected",
        "for working duration 0.2 s / 5 s / 30 s: G=idle|done → report(working) → wait → G=working (held at idle report?) → report(idle) → agent.get every 25 ms for 2 s → 3 s → G",
        "mid-run re-entry: working → 1 s → idle → 300 ms → working → 1 s → idle → 5 s (done at intermediate idle?)",
        "pane.focus{H} after an unfocused work end (done present?) → agent.get 25 ms for 3 s; tab.create → P2, pane.focus{P2} → rerun 1 s working→idle on H",
        "pane.release_agent{H, source:hsprobe-d1, agent:<driver>} → 3 s (final_status?)",
        "pane.close{H} → 3 s; per done push: after what · persisted in agent.get (ms) · completion_seq present",
      ];
    case "e":
      if (mode === "shared") return ["INCONCLUSIVE(NO_HELD_SUBSTRATE) — needs held panes (private only)"];
      return [
        rep(held),
        lvl,
        "E-boot: G=idle (boot) → agent.wait{target:H, until:[idle,done], timeout_ms:5000} (C9: immediate on boot idle?)",
        "report(working) → 1 s → report(idle) → 2 s → G=idle|done",
        "E-level: agent.wait{… timeout_ms:5000} on its own socket → return time",
        "E-edge: agent.wait{… timeout_ms:10000} → +1 s report(working) → +2 s report(idle) → return time",
        "E-working: report(working) → G=working → agent.wait{… 5000} → +2 s report(idle) → return time (control)",
        "any agent_not_found → code AGENT_NOT_FOUND (INCONCLUSIVE); close H",
      ];
    case "s":
      if (mode === "shared") return ["INCONCLUSIVE(NO_HELD_SUBSTRATE) — needs held panes (private only)"];
      return [
        "two held panes H1, H2 (agent.start result state_change_seq recorded — 0 there is a known non-reset)",
        lvl,
        rep("change H1 only (report next state) → 300 ms → G(H1), G(H2): H2 scs unchanged = per-pane stamp · H2 scs rose = global counter; then the same with H2 changed"),
        rep("re-report H1's current state (same status) → 500 ms → G(H1) dScs (bump?) + pushes on a H1 subscription (dedup?)"),
        "close H1, H2",
      ];
    case "b2":
    case "d2": {
      const boot = [
        `owner decision ${OWNER_DECISION.date}: ${OWNER_DECISION.scope} · ${OWNER_DECISION.homeChoice}`,
        "pre-run (probe process, before env scrub): resolve real `claude` on the original PATH (Bun.which + realpath) · `claude --version` with {PATH, HOME=/Users/kyoungsiklee} · kind must be in server.agent_manifests",
        `tab.create{focus:false, label:hsprobe-${p}-<run>, cwd:${REAL_CLI_CWD}, env:{HOME:${REAL_CLI_HOME}, PATH:<dir of real claude>:<original PATH minus fakebin/T>}} → P`,
        "subscribe L_B = [pane.agent_status_changed{P}, pane.closed, pane.exited] + global pane.agent_detected — ACK before start · G(P)",
        `agent.start{name:hsprobe-${p}-claude-<run>, kind:claude, pane_id:P, timeout_ms:60000}`,
        "pane.process_info{P} poll ≤5 s: record resolved binary + CLI pids (T/fakebin → INCONCLUSIVE RESOLVED_FAKE)",
        "G every 250 ms until interactive_ready (≤60 s) → launch_pending cleared / interactive_ready times",
        "dialog check: agent.read{source:detection} + pane.read{visible} — trust/login/permission/theme dialog → INCONCLUSIVE DIALOG(<name>) (no keys are ever sent)",
      ];
      const close =
        "close: pane.process_info{P} (CLI pids) → pane.close{P} → ≤5 s pid gone? survivor still `claude` → SIGTERM that pid only";
      if (p === "b2") {
        return [
          ...boot,
          "no prompt: 30 s after interactive_ready, G every 250 ms; every status push recorded (before/after ready)",
          "agent.read{detection} + agent.explain{P} → T/b2-*.txt (redacted) · same-pane re-subscribe S2 5 s (detector-source replay?)",
          "control: report_agent{P, agent:claude, working} → push on L_B (subscription liveness)",
          close,
        ];
      }
      return [
        ...boot,
        "boot observation 10 s after interactive_ready (G every 500 ms) → G(pre) · pane.read baseline of reply-OK lines",
        `t_prompt → agent.prompt{target:P, text:${JSON.stringify(D2_PROMPT)}} (no wait field) → RPC return ms · error/stalled → G(post)`,
        "observe 120 s from t_prompt: every 500 ms G (rev/scs/cs) + pane.read{recent} → first reply line `OK`; all status pushes timestamped",
        "derive: prompt→first working · idle|done→working re-entries · completion pushes before the reply (vs last poll without OK) · terminal push · done↔completion_seq",
        "end: agent.read{detection} + agent.explain{P} → T/d2-*.txt (redacted) · new session file names under ~/.claude/projects/<cwd slug>",
        close,
      ];
    }
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
  /** report_agent `agent` name per pane (default "bash"); held panes use the Step-0 driver. */
  paneAgent: Map<string, string>;
  /** Panes started with agent.start on a fake binary whose level is asserted before each step. */
  heldPanes: Set<string>;
  held: HeldInfo | null;
  herdrEnvStripped: string[];
  children: Set<ChildProcess>;
  /** Set only when b2/d2 were requested with --real-cli --owner-approved (resolved before the env scrub). */
  realCli: RealCli | null;
  /** Panes created for the real CLI — the only targets agent.prompt may reach. */
  realCliPanes: Set<string>;
}

/** Real `claude` resolution done in the probe process before scrubEnv (owner yes 2026-10-23). */
interface RealCli {
  bin: string | null;
  realpath: string | null;
  version: string | null;
  versionError?: string;
  panePath: string;
}

/** Step-0 held-substrate result (§2.6): fake kind + the report_agent agent name whose levels persist. */
interface HeldInfo {
  available: boolean;
  reason?: string;
  kind: string | null;
  driverAgent: string | null;
  trials: Rec[];
  pane?: HeldPane;
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

/** Credential hygiene: drop every line matching REDACT_RE (screen text from agent.read / pane.read). */
function redactText(s: string): string {
  if (!REDACT_RE.test(s)) return s;
  return s
    .split("\n")
    .map((l) => (REDACT_RE.test(l) ? "[hsprobe: line redacted]" : l))
    .join("\n");
}

function redactDeep(v: unknown): unknown {
  if (typeof v === "string") return redactText(v);
  if (Array.isArray(v)) return v.map(redactDeep);
  if (v && typeof v === "object") {
    const out: Rec = {};
    for (const [k, x] of Object.entries(v as Rec)) out[k] = redactDeep(x);
    return out;
  }
  return v;
}

function ev(ctx: Ctx, probe: string, kind: string, payload?: unknown): void {
  const t = now();
  const line = { t_ms: t, rel_ms: t - ctx.start, probe, kind, payload: redactDeep(payload) };
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
  "agent.prompt": "target",
  "agent.read": "target",
  "agent.explain": "target",
  "pane.read": "pane_id",
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
  // D2 only (owner yes 2026-10-23): one agent.prompt, no `wait`, to a real-CLI pane this run created.
  if (method === "agent.prompt" && ctx.realCli && ctx.mode === "private") {
    if ("wait" in params) throw new Error("REFUSED: agent.prompt.wait is never sent");
    const target = str(params.target);
    if (!target || !ctx.realCliPanes.has(target)) throw new Error(`REFUSED: agent.prompt to non-real-CLI pane ${target}`);
    assertOwned(ctx, target);
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
): Promise<{ ok: true; result: Rec; t: number } | { ok: false; error: string; code: string | null; t: number }> {
  try {
    const result = await call(ctx, probe, method, params, timeoutMs);
    return { ok: true, result, t: now() };
  } catch (e) {
    const code = e instanceof RpcError ? e.code : null;
    return { ok: false, error: e instanceof Error ? e.message : String(e), code, t: now() };
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

/** A reported state as seen on the wire: herdr may publish a reported `idle` as `done` (run-1 analysis §4). */
const seenAs = (reported: string, seen: string): boolean => seen === reported || (reported === "idle" && seen === "done");

/** `reported` occurs in order inside `seen` (herdr-inserted `unknown`/`done` between them tolerated). */
function isSubseq(reported: readonly string[], seen: readonly string[]): boolean {
  let i = 0;
  for (const s of seen) {
    const r = reported[i];
    if (r !== undefined && seenAs(r, s)) i++;
  }
  return i === reported.length;
}

function commonPrefix(a: readonly string[], b: readonly string[]): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/** Poll until `want` is a subsequence of the sink's P statuses from push index `base` on. */
async function waitSeq(s: Sink, P: string, base: number, want: readonly string[], ms: number): Promise<boolean> {
  const until = now() + ms;
  while (now() < until) {
    if (isSubseq(want, statusSeq(s, P, (p) => s.pushes.indexOf(p) >= base))) return true;
    await sleep(20);
  }
  return isSubseq(want, statusSeq(s, P, (p) => s.pushes.indexOf(p) >= base));
}

// ─── herdr object helpers ────────────────────────────────────────────────────

async function report(ctx: Ctx, pr: ProbeRun, P: string, state: AgentState): Promise<number> {
  const seq = (ctx.seq.get(P) ?? 0) + 1;
  ctx.seq.set(P, seq);
  await call(ctx, pr.name, "pane.report_agent", {
    pane_id: P,
    source: `hsprobe-${pr.name}`,
    agent: ctx.paneAgent.get(P) ?? "bash",
    state,
    seq,
  });
  return now();
}

/** Levels a step may legitimately find after reporting `state` (`idle` may be published as `done`). */
const levelsFor = (state: string): string[] => (state === "idle" ? ["idle", "done"] : [state]);

/**
 * Before-step level assertion (run-1 analysis §0). On held panes `G(P)` must show one of `want`;
 * otherwise the step is recorded as LEVEL_LOST (facts.levelLost) and the caller marks it so — never
 * FAIL. Non-held (shell) panes are not asserted (returns true; facts.levelChecksSkipped counts them).
 */
async function expectLevel(ctx: Ctx, pr: ProbeRun, P: string, want: readonly string[], step: string): Promise<boolean> {
  if (!ctx.heldPanes.has(P)) {
    pr.facts.levelChecksSkipped = Number(pr.facts.levelChecksSkipped ?? 0) + 1;
    return true;
  }
  const g = await G(ctx, pr, P, `level:${step}`);
  if (g.agent_status !== null && want.includes(g.agent_status)) return true;
  const row = { step, pane: P, want, got: g.agent_status, error: g.error ?? null, t: g.t };
  ev(ctx, pr.name, "LEVEL_LOST", row);
  pushFact(pr, "levelLost", row);
  return false;
}

const levelLostCount = (pr: ProbeRun): number => (Array.isArray(pr.facts.levelLost) ? pr.facts.levelLost.length : 0);

interface LevelSample {
  t: number;
  status: string | null;
  scs: number | null;
  cs: number | null;
  error?: string;
}

/** agent.get every `everyMs` for `ms` (logged as LEVEL_SAMPLE; not added to facts.gSnapshots). */
async function sampleLevels(ctx: Ctx, pr: ProbeRun, P: string, ms: number, everyMs = 25): Promise<LevelSample[]> {
  const out: LevelSample[] = [];
  const until = now() + ms;
  while (now() < until) {
    const r = await tryCall(ctx, pr.name, "agent.get", { target: P });
    const a = r.ok ? rec(r.result.agent) : {};
    const s: LevelSample = r.ok
      ? { t: r.t, status: str(a.agent_status), scs: num(a.state_change_seq), cs: num(a.completion_seq) }
      : { t: r.t, status: null, scs: null, cs: null, error: r.error };
    out.push(s);
    ev(ctx, pr.name, "LEVEL_SAMPLE", { pane: P, ...s });
    await sleep(everyMs);
  }
  return out;
}

/** Run-length view of samples: [{status, fromMs, toMs, n, scs, cs}] relative to `t0`. */
function compressSamples(samples: LevelSample[], t0: number): Rec[] {
  const runs: Rec[] = [];
  let cur: Rec | null = null;
  for (const s of samples) {
    const key = s.status ?? `error:${s.error ?? "?"}`;
    if (cur && cur.status === key) {
      cur.toMs = s.t - t0;
      cur.n = Number(cur.n) + 1;
      cur.scsLast = s.scs;
      cur.csLast = s.cs;
    } else {
      cur = { status: key, fromMs: s.t - t0, toMs: s.t - t0, n: 1, scs: s.scs, cs: s.cs, scsLast: s.scs, csLast: s.cs };
      runs.push(cur);
    }
  }
  return runs;
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

/** First fake kind present in server.agent_manifests with no absolute command path outside T (B1 rule). */
function pickFakeKind(ctx: Ctx): string | null {
  if (!ctx.manifests) return null;
  const json = JSON.stringify(ctx.manifests);
  for (const k of FAKE_KINDS) {
    if (!json.includes(`"${k}"`)) continue;
    if (manifestAbsPaths(ctx.manifests, k).some((p) => !isUnder(p, ctx.T))) continue;
    return k;
  }
  return null;
}

/** pane.process_info poll ≤3 s: "fake" (cmdline under T/fakebin) · "real-or-other" · "unknown". */
async function resolveFake(ctx: Ctx, pr: ProbeRun, P: string, kind: string): Promise<{ resolved: string; info: Rec | null }> {
  const fakebin = join(ctx.T, "fakebin");
  const until = now() + 3000;
  while (now() < until) {
    const pi = await tryCall(ctx, pr.name, "pane.process_info", { pane_id: P });
    const j = pi.ok ? JSON.stringify(pi.result) : "";
    if (j.includes(fakebin)) return { resolved: "fake", info: pi.ok ? pi.result : null };
    if (j.includes(kind)) return { resolved: "real-or-other", info: pi.ok ? pi.result : null };
    await sleep(200);
  }
  return { resolved: "unknown", info: null };
}

interface HeldPane {
  P: string;
  kind: string;
  /** state_change_seq in the agent.start result (run 1: 0 = unassigned, not a reset). */
  startScs: number | null;
  startToReadyMs: number | null;
  bootStatus: string | null;
}

/**
 * Held pane (§2.6): fake-agent pane via agent.start on the PATH fake binary — the run-1 B1 substrate
 * whose detector-held `idle` stayed stable for 30 s. Waits for interactive_ready ∧ idle (≤12 s). A real
 * CLI resolution closes the pane and throws ABORTED_REAL_CLI (the run stops).
 */
async function heldPane(ctx: Ctx, pr: ProbeRun, tag: string, kindIn?: string): Promise<HeldPane> {
  const kind = kindIn ?? ctx.held?.kind ?? null;
  if (!kind) throw new Error("NO_HELD_SUBSTRATE: no fake kind available");
  const fakebin = join(ctx.T, "fakebin");
  const P = await scratchPane(ctx, pr, tag, { PATH: `${fakebin}:/usr/bin:/bin` });
  const tStart = now();
  const st = await tryCall(
    ctx,
    pr.name,
    "agent.start",
    { name: `hsprobe-${pr.name}-${tag}-${kind}-${ctx.run}`, kind, pane_id: P, timeout_ms: 10_000 },
    ctx.timeoutMs + 10_000,
  );
  const res = await resolveFake(ctx, pr, P, kind);
  if (res.resolved === "real-or-other") {
    await closePane(ctx, pr, P);
    throw new Error(`ABORTED_REAL_CLI: ${kind} did not resolve to T/fakebin on ${P}`);
  }
  if (!st.ok || res.resolved !== "fake") {
    await closePane(ctx, pr, P);
    throw new Error(`NO_HELD_SUBSTRATE: agent.start ${kind} ${st.ok ? "ok" : st.error} · resolved=${res.resolved}`);
  }
  const sa = rec(rec(st.result).agent ?? st.result);
  let readyAt: number | null = null;
  let bootStatus: string | null = null;
  const until = now() + 12_000;
  while (now() < until) {
    const r = await tryCall(ctx, pr.name, "agent.get", { target: P });
    const a = r.ok ? rec(r.result.agent) : {};
    bootStatus = str(a.agent_status);
    if (a.interactive_ready === true && bootStatus === "idle") {
      readyAt = now();
      break;
    }
    await sleep(25);
  }
  ctx.heldPanes.add(P);
  const h: HeldPane = {
    P,
    kind,
    startScs: num(sa.state_change_seq),
    startToReadyMs: readyAt ? readyAt - tStart : null,
    bootStatus,
  };
  if (ctx.held?.driverAgent) ctx.paneAgent.set(P, ctx.held.driverAgent);
  ev(ctx, pr.name, "HELD_PANE", h);
  pushFact(pr, "heldPanes", h);
  return h;
}

/** Shared mode or no fake kind / driver → the probe cannot assert levels (INCONCLUSIVE, not FAIL). */
function heldUnavailable(ctx: Ctx, needDriver: boolean): Outcome | null {
  if (!ctx.held?.available) return { verdict: "INCONCLUSIVE", code: `NO_HELD_SUBSTRATE(${ctx.held?.reason ?? "unknown"})` };
  if (needDriver && !ctx.held.driverAgent) return { verdict: "INCONCLUSIVE", code: "NO_HELD_DRIVER" };
  return null;
}

/**
 * Step-0 driver check (§2.6): on one held pane, try report_agent `agent` = fake kind, then `bash`.
 * Held = every agent.get sample in 2 s shows `working`, then `idle|done` for 1 s after the idle report.
 */
async function discoverDriver(ctx: Ctx, pr: ProbeRun): Promise<HeldInfo> {
  if (ctx.mode !== "private") return { available: false, reason: "shared §2.5-4", kind: null, driverAgent: null, trials: [] };
  const kind = pickFakeKind(ctx);
  if (!kind) return { available: false, reason: "no fake kind in agent_manifests", kind: null, driverAgent: null, trials: [] };
  const info: HeldInfo = { available: false, kind, driverAgent: null, trials: [] };
  let h: HeldPane;
  try {
    h = await heldPane(ctx, pr, "drv", kind);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith("ABORTED_REAL_CLI")) throw e;
    info.reason = msg;
    return info;
  }
  info.available = true;
  info.pane = h;
  for (const agent of [kind, "bash"]) {
    ctx.paneAgent.set(h.P, agent);
    const trial: Rec = { agent };
    info.trials.push(trial);
    const tW = now();
    try {
      await report(ctx, pr, h.P, "working");
    } catch (e) {
      trial.reportError = e instanceof Error ? e.message : String(e);
      continue;
    }
    const sw = await sampleLevels(ctx, pr, h.P, 2000);
    trial.working = compressSamples(sw, tW);
    trial.workingHeld = sw.length > 0 && sw.every((s) => s.status === "working");
    const tI = now();
    await report(ctx, pr, h.P, "idle");
    const si = await sampleLevels(ctx, pr, h.P, 1000);
    trial.idle = compressSamples(si, tI);
    trial.idleHeld = si.length > 0 && si.every((s) => s.status === "idle" || s.status === "done");
    if (trial.workingHeld === true && trial.idleHeld === true) {
      info.driverAgent = agent;
      break;
    }
    await sleep(1500);
  }
  return info;
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
  pr.facts.herdrEnvStripped = ctx.herdrEnvStripped;
  // §2.6 held substrate: decides whether A/C/D1/E/s can assert levels (does not change the S0 verdict).
  if (ctx.pushOk) {
    progress("step0 held-pane driver check");
    ctx.held = await discoverDriver(ctx, pr);
  } else {
    ctx.held = { available: false, reason: "S0 push path incomplete", kind: null, driverAgent: null, trials: [] };
  }
  pr.facts.heldSubstrate = ctx.held;
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

/**
 * Classify one handover (doc §4 table; run-1 analysis fixes). The control socket saw every herdr
 * emission in order, herdr-inserted `unknown`/`done` included; `ctlTailN` = control pushes that had
 * arrived when the old socket sent EOF (arrival index, not ms — run-2 analysis §1 same-ms tie).
 * The old socket's sequence must be a prefix of the control's: tail delivered = first `ctlTailN` equal.
 * `postEofRaw` = old-socket pushes carrying the sink's own `afterEof` flag (Bun); null → derive (Python).
 */
function judgeHandover(
  oldSeq: string[],
  ctlSeq: string[],
  ctlTailN: number,
  fin: boolean,
  control: boolean,
  postEofRaw: number | null,
): Rec {
  const lcp = commonPrefix(oldSeq, ctlSeq);
  const tailDelivered = ctlTailN > 0 && lcp >= ctlTailN;
  const postEofOnOld = postEofRaw ?? oldSeq.length - Math.min(ctlTailN, lcp);
  const code = !control
    ? "UNDETERMINED"
    : tailDelivered && fin && postEofOnOld === 0
      ? "A-1"
      : fin && !tailDelivered
        ? "A-4"
        : postEofOnOld > 0 && !fin
          ? "A-3"
          : postEofOnOld === 0 && !fin
            ? "A-2"
            : "A-OTHER";
  return { tailDelivered, postEofOnOld, orderOk: lcp === oldSeq.length, code };
}

type HandoverMode = "flow" | "pause";

/**
 * One Bun handover old → new. `flow` (variant a): old keeps reading, `end()` right after the control saw
 * the tail. `pause` (variant b, run-1 M5 form): old paused before the tail, `end()` +300 ms, resume 1 s
 * after the post-EOF transitions.
 */
async function handover(
  ctx: Ctx,
  pr: ProbeRun,
  P: string,
  oldS: Sink,
  newS: Sink,
  mode: HandoverMode,
  tail: [AgentState, AgentState],
  post: [AgentState, AgentState],
): Promise<Rec> {
  const oldBase = oldS.pushes.length;
  const newBase = newS.pushes.length;
  const gA = await G(ctx, pr, P, `${oldS.name}->${newS.name}:before-tail`);
  const bytesAtPause = oldS.bytesRead();
  if (mode === "pause") oldS.pause();
  await report(ctx, pr, P, tail[0]);
  await report(ctx, pr, P, tail[1]);
  const ctl = await waitSeq(newS, P, newBase, tail, 2000);
  if (mode === "pause") await sleep(300);
  const bytesAtEof = oldS.bytesRead();
  const ctlEofIdx = newS.pushes.length;
  oldS.end();
  const tEof = oldS.eofAt ?? now();
  await report(ctx, pr, P, post[0]);
  await sleep(500);
  await report(ctx, pr, P, post[1]);
  await sleep(1000);
  const bytesBeforeResume = oldS.bytesRead();
  if (mode === "pause") oldS.resume();
  await waitClosed(oldS, 30_000);
  await sleep(oldS.closeAt === null ? 0 : 500);
  await waitSeq(newS, P, newBase, [...tail, ...post], 2000);
  const gB = await G(ctx, pr, P, `${oldS.name}->${newS.name}:after-post`);
  const oldPushes = oldS.pushes.slice(oldBase).filter(statusOf(P));
  const oldSeq = oldPushes.map((p) => p.status ?? "");
  const ctlPushes = newS.pushes.slice(newBase).filter(statusOf(P));
  const ctlSeq = ctlPushes.map((p) => p.status ?? "");
  // arrival index at end() (single-threaded: exact); the ms comparison is kept as a record only
  const ctlTailN = newS.pushes.slice(newBase, ctlEofIdx).filter(statusOf(P)).length;
  const ctlTailNByMs = ctlPushes.filter((p) => p.t < tEof).length;
  const postEofRaw = oldPushes.filter((p) => p.afterEof).length;
  const fin = oldS.endAt !== null;
  return {
    variant: mode,
    old: oldS.name,
    new: newS.name,
    tail,
    post,
    controlSawTail: ctl,
    oldSeq,
    ctlSeq,
    ctlTailN,
    ctlTailNByMs,
    ...judgeHandover(oldSeq, ctlSeq, ctlTailN, fin, ctl, postEofRaw),
    eofToEndMs: oldS.endAt ? oldS.endAt - tEof : null,
    eofToCloseMs: oldS.closeAt ? oldS.closeAt - tEof : null,
    oldErrors: oldS.errors,
    bytesReadAtPause: bytesAtPause,
    bytesReadAtEof: bytesAtEof,
    bytesReadBeforeResume: bytesBeforeResume,
    // pause variant: > 0 → the runtime pulled tail bytes into the process while paused (record only).
    bytesReadWhilePaused: bytesBeforeResume - bytesAtPause,
    gDiff: gDiff(gA, gB),
  };
}

const PY_CLIENT = "hsprobe_halfclose.py";

/**
 * Variant (c) raw-socket client — Python 3 stdlib `socket` only, run as `python3 -I`. Sends exactly one
 * `events.subscribe` (read-only; no other method), reads until its ACK, then stops reading. On a stdin
 * line it half-closes (SHUT_WR) with the tail unread, sleeps, then reads to EOF and prints one RESULT.
 */
const PY_SOURCE = `# hsprobe variant (c) — written by scripts/probe-herdr-status.ts; stdlib only, read-only subscribe
import json, socket, sys, time

def ms():
    return int(time.time() * 1000)

def out(obj):
    sys.stdout.write(json.dumps(obj) + "\\n")
    sys.stdout.flush()

def lines(data):
    msgs = []
    for raw in data.split(b"\\n"):
        if raw.strip():
            try:
                msgs.append(json.loads(raw))
            except ValueError:
                msgs.append({"malformed": raw.decode("utf-8", "replace")})
    return msgs

path, subs, req_id, linger = sys.argv[1], json.loads(sys.argv[2]), sys.argv[3], float(sys.argv[4])
s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
s.settimeout(30)
s.connect(path)
s.sendall((json.dumps({"id": req_id, "method": "events.subscribe", "params": {"subscriptions": subs}}) + "\\n").encode())
buf = b""
pre = []
ack_at = None
while ack_at is None:
    chunk = s.recv(65536)
    if not chunk:
        break
    buf += chunk
    while b"\\n" in buf and ack_at is None:
        raw, buf = buf.split(b"\\n", 1)
        if not raw.strip():
            continue
        try:
            msg = json.loads(raw)
        except ValueError:
            continue
        if msg.get("id") == req_id and "event" not in msg:
            ack_at = ms()
        else:
            pre.append(msg)
pre.extend(lines(buf.rsplit(b"\\n", 1)[0]) if b"\\n" in buf else [])
buf = buf.rsplit(b"\\n", 1)[1] if b"\\n" in buf else buf
out({"kind": "ACK", "t": ack_at, "preAck": len(pre)})
sys.stdin.readline()
s.shutdown(socket.SHUT_WR)
eof_at = ms()
out({"kind": "EOF_TX", "t": eof_at})
time.sleep(linger)
data = buf
end_at = None
err = None
try:
    while True:
        chunk = s.recv(65536)
        if not chunk:
            end_at = ms()
            break
        data += chunk
except Exception as e:
    err = repr(e)
s.close()
out({"kind": "RESULT", "ackAt": ack_at, "eofAt": eof_at, "endAt": end_at, "error": err,
     "bytesAfterEof": len(data), "afterEof": lines(data)})
`;

function writePyClient(ctx: Ctx): string {
  const dir = join(ctx.T, "py");
  mkdirSync(dir, { recursive: true });
  const p = join(dir, PY_CLIENT);
  writeFileSync(p, PY_SOURCE);
  return p;
}

/** Variant (c): same half-close + unread-tail test from a Python raw AF_UNIX client (Bun vs herdr loss). */
async function handoverPy(
  ctx: Ctx,
  pr: ProbeRun,
  P: string,
  newS: Sink,
  tail: [AgentState, AgentState],
  post: [AgentState, AgentState],
): Promise<Rec> {
  const py = Bun.which("python3");
  if (!py) return { variant: "python", code: "UNAVAILABLE", error: "python3 not on PATH" };
  const id = nextId();
  const child = spawn(py, ["-I", join(ctx.T, "py", PY_CLIENT), ctx.sock, JSON.stringify(subL(P)), id, "1.5"], {
    cwd: join(ctx.T, "py"),
    env: { PATH: "/usr/bin:/bin", HOME: ctx.home, LOOM_TEST_HOME: ctx.T },
    stdio: ["pipe", "pipe", "pipe"],
  });
  ctx.children.add(child);
  const got: Rec[] = [];
  const buf = { text: "" };
  let stderr = "";
  let exited: Rec | null = null;
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (c: string) => {
    buf.text += c;
    parseNdjsonLines(
      buf,
      (m) => {
        got.push(m);
        ev(ctx, pr.name, "PY_LINE", { kind: m.kind, t: m.t ?? null, preAck: m.preAck ?? null, endAt: m.endAt ?? null });
      },
      (l) => ev(ctx, pr.name, "MALFORMED_LINE", { py: true, l }),
    );
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (c: string) => {
    stderr += c;
  });
  child.on("exit", (code, signal) => {
    exited = { code, signal };
  });
  const waitKind = async (kind: string, ms: number): Promise<Rec | null> => {
    const until = now() + ms;
    while (now() < until) {
      const m = got.find((x) => x.kind === kind);
      if (m) return m;
      if (exited) return null;
      await sleep(20);
    }
    return null;
  };
  const stop = (): void => {
    if (!exited) child.kill("SIGTERM");
  };
  const ack = await waitKind("ACK", ctx.timeoutMs);
  if (!ack || ack.t === null) {
    stop();
    return { variant: "python", code: "ERROR", error: "no ACK", exited, stderr: stderr.slice(0, 2000) };
  }
  const newBase = newS.pushes.length;
  await report(ctx, pr, P, tail[0]);
  await report(ctx, pr, P, tail[1]);
  const ctl = await waitSeq(newS, P, newBase, tail, 2000);
  await sleep(300);
  // the client reads nothing between ACK and EOF, so no per-push afterEof flag exists: use arrival index
  const ctlEofIdx = newS.pushes.length;
  child.stdin.write("EOF\n");
  const eofLine = await waitKind("EOF_TX", 5000);
  const tEof = now();
  await report(ctx, pr, P, post[0]);
  await sleep(500);
  await report(ctx, pr, P, post[1]);
  const result = await waitKind("RESULT", 40_000);
  stop();
  await waitSeq(newS, P, newBase, [...tail, ...post], 2000);
  if (!result) return { variant: "python", code: "ERROR", error: "no RESULT", exited, stderr: stderr.slice(0, 2000) };
  const msgs = (Array.isArray(result.afterEof) ? result.afterEof : []).map(rec);
  const oldSeq = msgs
    .filter((m) => (str(m.event) ?? "").includes("agent_status") && pushPaneId(m) === P)
    .map((m) => str(rec(m.data).agent_status) ?? "");
  const ctlPushes = newS.pushes.slice(newBase).filter(statusOf(P));
  const ctlSeq = ctlPushes.map((p) => p.status ?? "");
  const ctlTailN = newS.pushes.slice(newBase, ctlEofIdx).filter(statusOf(P)).length;
  const ctlTailNByMs = ctlPushes.filter((p) => p.t < tEof).length;
  const endAt = num(result.endAt);
  const eofAt = num(result.eofAt) ?? num(eofLine?.t);
  return {
    variant: "python",
    tail,
    post,
    controlSawTail: ctl,
    oldSeq,
    ctlSeq,
    ctlTailN,
    ctlTailNByMs,
    ...judgeHandover(oldSeq, ctlSeq, ctlTailN, endAt !== null, ctl, null),
    preAck: ack.preAck ?? null,
    eofToEndMs: endAt !== null && eofAt !== null ? endAt - eofAt : null,
    bytesAfterEof: result.bytesAfterEof ?? null,
    pyError: result.error ?? null,
    stderr: stderr.slice(0, 2000),
  };
}

async function probeA(ctx: Ctx, pr: ProbeRun, reps: number): Promise<Outcome> {
  const useHeld = Boolean(ctx.held?.available && ctx.held.driverAgent);
  pr.facts.substrate = useHeld
    ? `held:${ctx.held?.kind}/agent=${ctx.held?.driverAgent}`
    : "shell (no held driver — levels not asserted; herdr may insert unknown/release)";
  const newPane = async (tag: string): Promise<string> => (useHeld ? (await heldPane(ctx, pr, tag)).P : scratchPane(ctx, pr, tag));
  const runs: Rec[] = [];
  const primes: Rec[] = [];
  for (let r = 1; r <= reps; r++) {
    progress(`A rep ${r}/${reps}`);
    const P = await newPane(`r${r}`);
    const row: Rec = { rep: r, pane: P };
    runs.push(row);
    const lost0 = levelLostCount(pr);
    const g0 = await G(ctx, pr, P, `a${r}:start`);
    await expectLevel(ctx, pr, P, ["idle"], `a${r}:boot`);
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
    await expectLevel(ctx, pr, P, ["working"], `a${r}:before-registration`);
    // 3: S2 opened, transition fired before its ACK — first P status push on S2 (any value: herdr may
    // publish the reported idle as done)
    const S2 = openSub(ctx, pr, `a${r}.S2`, subL(P));
    await sleep(5);
    await report(ctx, pr, P, "idle");
    await S2.ack;
    await sleep(1500);
    const first = S2.pushes.find(statusOf(P));
    row.registrationVsAck = first ? (first.beforeAck ? "push-before-ack" : "push-after-ack") : "missed";
    row.registrationFirstStatus = first?.status ?? null;
    await expectLevel(ctx, pr, P, levelsFor("idle"), `a${r}:before-overlap`);
    const s1Base = S1.pushes.length;
    const s2Base = S2.pushes.length;
    await report(ctx, pr, P, "working");
    const o1 = await S1.waitFor(statusIs(P, "working"), 2000, s1Base);
    const o2 = await S2.waitFor(statusIs(P, "working"), 2000, s2Base);
    row.overlapBoth = Boolean(o1 && o2);
    row.overlapS1 = Boolean(o1);
    // FIFO over the full overlap window: S2 (opened later) must be a suffix of S1's sequence since S2 open
    await report(ctx, pr, P, "idle");
    await report(ctx, pr, P, "working");
    await report(ctx, pr, P, "idle");
    await sleep(1500);
    const fifo1 = S1.pushes.filter((p) => statusOf(P)(p) && p.t >= S2.openedAt).map((p) => p.status ?? "");
    const fifo2 = statusSeq(S2, P);
    const suffix = fifo2.length > 0 && fifo2.length <= fifo1.length && fifo1.slice(fifo1.length - fifo2.length).join() === fifo2.join();
    row.fifo = { S1: fifo1, S2: fifo2, equal: suffix, rule: "S2 = suffix of S1 since S2 open" };
    if (!o1) {
      row.code = "A-5";
      await closePane(ctx, pr, P);
      continue;
    }
    await expectLevel(ctx, pr, P, levelsFor("idle"), `a${r}:before-h1`);
    // (a) flowing variant, twice (≥2 re-subscribes): S1→S2, S2→S3
    const h1 = await handover(ctx, pr, P, S1, S2, "flow", ["blocked", "working"], ["idle", "blocked"]);
    await expectLevel(ctx, pr, P, ["blocked"], `a${r}:after-h1`);
    const s2b = S2.pushes.length;
    await report(ctx, pr, P, "idle");
    row.s2AliveAfterS1Eof = await waitSeq(S2, P, s2b, ["idle"], 2000);
    await expectLevel(ctx, pr, P, levelsFor("idle"), `a${r}:before-h2`);
    const S3 = await subscribe(ctx, pr, `a${r}.S3`, subL(P));
    const h2 = await handover(ctx, pr, P, S2, S3, "flow", ["working", "blocked"], ["idle", "working"]);
    await expectLevel(ctx, pr, P, ["working"], `a${r}:before-h3`);
    // (b) paused + end() (run-1 form): S3→S4
    const S4 = await subscribe(ctx, pr, `a${r}.S4`, subL(P));
    const h3 = await handover(ctx, pr, P, S3, S4, "pause", ["idle", "blocked"], ["working", "idle"]);
    await expectLevel(ctx, pr, P, levelsFor("idle"), `a${r}:before-h4`);
    // (c) python raw-socket client, S4 = control
    const h4 = await handoverPy(ctx, pr, P, S4, ["working", "blocked"], ["idle", "working"]);
    S4.destroy();
    row.handovers = { h1, h2, h3, h4 };
    row.codeFlow = [h1.code, h2.code];
    row.codePaused = h3.code;
    row.codePython = h4.code;
    row.chainOk = h1.code === "A-1" && h2.code === "A-1";
    row.gStartEnd = gDiff(g0, await G(ctx, pr, P, `a${r}:end`));
    row.levelLost = levelLostCount(pr) - lost0;
    row.code = Number(row.levelLost) > 0 ? "LEVEL_LOST" : String(h1.code);
    await closePane(ctx, pr, P);
  }
  // A′: idle subscription — does the server close it on its own?
  for (let r = 1; r <= reps; r++) {
    progress(`A′ rep ${r}/${reps}`);
    const P = await newPane(`prime${r}`);
    const lost0 = levelLostCount(pr);
    const S = await subscribe(ctx, pr, `a′${r}.S1`, subL(P));
    await report(ctx, pr, P, "working");
    const live = await S.waitFor(statusIs(P, "working"), 2000);
    await sleep(30_000);
    await expectLevel(ctx, pr, P, ["working"], `a′${r}:after-30s`);
    const base = S.pushes.length;
    await report(ctx, pr, P, "idle");
    const still = await waitSeq(S, P, base, ["idle"], 2000);
    primes.push({
      rep: r,
      pane: P,
      liveness: Boolean(live),
      serverClosedIdle: S.closeAt !== null || S.endAt !== null,
      stillDelivering: still,
      levelLost: levelLostCount(pr) - lost0,
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
  // unread-tail loss side: paused Bun (b) vs python raw client (c)
  const paused = runs.map((x) => String(x.codePaused ?? "n/a"));
  const pyc = runs.map((x) => String(x.codePython ?? "n/a"));
  const pyDecided = pyc.every((c) => c === "A-1" || c === "A-4");
  const lossSide = pyc.includes("A-4")
    ? "herdr-side"
    : paused.includes("A-4")
      ? pyDecided
        ? "bun-runtime"
        : "unknown"
      : "none";
  pr.facts.pausedCodes = paused;
  pr.facts.pythonCodes = pyc;
  pr.facts.unreadTailLossSide = lossSide;
  if (codes.includes("LEVEL_LOST") || primes.some((x) => Number(x.levelLost) > 0)) {
    return { verdict: "INCONCLUSIVE", code: "LEVEL_LOST" };
  }
  if (!consistent || codes.includes("UNDETERMINED") || codes.includes("A-OTHER")) {
    return { verdict: "INCONCLUSIVE", code: consistent ? (codes[0] ?? "NONE") : `MIXED:${codes.join(",")}` };
  }
  // A-OTHER on an aux handover (h2) is as undecided as on h1 — not a FAIL through chainOk (run-2 §1)
  if (runs.some((x) => Array.isArray(x.codeFlow) && x.codeFlow.includes("A-OTHER"))) {
    return { verdict: "INCONCLUSIVE", code: "A-OTHER/aux" };
  }
  if (codes[0] !== "A-1") return { verdict: "FAIL", code: codes[0] ?? "NONE" };
  if (lossSide === "herdr-side") return { verdict: "FAIL", code: "A-4/herdr-side-unread-loss" };
  if (!(fifoOk && chainOk && primeOk)) return { verdict: "FAIL", code: "A-1/aux-fail" };
  if (lossSide === "unknown") return { verdict: "INCONCLUSIVE", code: "A-1/pause-loss-side-unknown" };
  return { verdict: "PASS", code: lossSide === "bun-runtime" ? "A-1/bun-pause-loss" : "A-1" };
}

type WindowClass = "none" | "latest-only" | "backlog";

function classifyWindow(seq: string[]): WindowClass {
  if (seq.length === 0) return "none";
  return seq.length === 1 ? "latest-only" : "backlog";
}

/**
 * Probe C v2 (run-1 analysis §3): held pane, a persistent non-idle level (`blocked`) asserted right
 * before each late subscribe, so "no replay" (0 pushes) and "latest-only replay" (1 push = blocked)
 * are distinguishable. Control = liveness on S2 and S3 (0.9.5 does not replay `pane_closed`; that
 * check is kept as a fact only).
 */
async function probeC(ctx: Ctx, pr: ProbeRun, reps: number): Promise<Outcome> {
  const na = heldUnavailable(ctx, true);
  if (na) return na;
  const runs: Rec[] = [];
  const HELD: AgentState = "blocked";
  const windowOf = (S: Sink, P: string, level: string): Rec => {
    const w = S.pushes.filter(statusOf(P));
    const seq = w.map((p) => p.status ?? "");
    return {
      seq,
      positions: w.map((p) => (p.beforeAck ? "before-ack" : "after-ack")),
      class: classifyWindow(seq),
      heldLevel: level,
      latestEqualsHeld: seq.length === 1 ? seq[0] === level : null,
    };
  };
  for (let r = 1; r <= reps; r++) {
    progress(`C rep ${r}/${reps}`);
    const P = (await heldPane(ctx, pr, `r${r}`)).P;
    const row: Rec = { rep: r, pane: P };
    runs.push(row);
    const lost0 = levelLostCount(pr);
    const g0 = await G(ctx, pr, P, `c${r}:start`);
    const S1 = await subscribe(ctx, pr, `c${r}.S1`, subL(P));
    for (const st of ["working", "idle", "working", HELD] as const) {
      await report(ctx, pr, P, st);
      await sleep(1200);
    }
    row.gatePushes = statusSeq(S1, P).length;
    if (row.gatePushes === 0) {
      row.code = "UNDETERMINED";
      await closePane(ctx, pr, P);
      continue;
    }
    await expectLevel(ctx, pr, P, [HELD], `c${r}:gate-end`);
    S1.destroy();
    await sleep(1000);
    const okS2 = await expectLevel(ctx, pr, P, [HELD], `c${r}:before-S2`);
    const tLvl2 = now();
    const S2 = openSub(ctx, pr, `c${r}.S2`, subL(P));
    await S2.ack;
    await sleep(20_000);
    row.window3 = { ...windowOf(S2, P, HELD), levelAsserted: okS2, levelToSubTxMs: S2.openedAt - tLvl2 };
    const lb = S2.pushes.length;
    await report(ctx, pr, P, "working");
    row.liveness = Boolean(await S2.waitFor(statusIs(P, "working"), 2000, lb));
    S2.destroy();
    await sleep(200);
    // C-gap: transition with zero subscribers, then subscribe at once
    const gGap0 = await G(ctx, pr, P, `c${r}:gap-before`);
    const tGap = await report(ctx, pr, P, HELD);
    const okS3 = await expectLevel(ctx, pr, P, [HELD], `c${r}:gap-after`);
    const S3 = openSub(ctx, pr, `c${r}.S3`, subL(P));
    row.gapToSubTxMs = S3.openedAt - tGap;
    await S3.ack;
    const gGap1 = await G(ctx, pr, P, `c${r}:gap-after-ack`);
    row.gapG = gDiff(gGap0, gGap1);
    row.gapPaneList = await paneLevel(ctx, pr, P);
    await sleep(20_000);
    row.window5 = {
      ...windowOf(S3, P, HELD),
      levelAsserted: okS3,
      gapTransitionReplayed: S3.pushes.some(statusIs(P, HELD)),
    };
    const lb3 = S3.pushes.length;
    await report(ctx, pr, P, "working");
    row.liveness3 = Boolean(await S3.waitFor(statusIs(P, "working"), 2000, lb3));
    S3.destroy();
    // terminal replay — recorded fact only (run 1: 0.9.5 does not replay pane_closed, 2/2)
    const Q = await scratchPane(ctx, pr, `q${r}`);
    await closePane(ctx, pr, Q);
    await sleep(500);
    const S4 = openSub(ctx, pr, `c${r}.S4`, [{ type: "pane.closed" }]);
    await S4.ack;
    const qp = await S4.waitFor((p) => p.paneId === Q && p.event.includes("closed"), 10_000);
    row.terminalReplayFact = qp ? { replayed: true, event: qp.event, beforeAck: qp.beforeAck } : { replayed: false };
    S4.destroy();
    row.paneListEnd = await paneLevel(ctx, pr, P);
    row.gStartEnd = gDiff(g0, await G(ctx, pr, P, `c${r}:end`));
    row.levelLost = levelLostCount(pr) - lost0;
    const w3 = rec(row.window3);
    const w5 = rec(row.window5);
    const cls = (w: Rec): string =>
      w.class === "none" ? "none" : w.class === "backlog" ? "backlog" : w.latestEqualsHeld === true ? "latest-only" : "other";
    const c3 = cls(w3);
    const c5 = cls(w5);
    row.code =
      !okS2 || !okS3
        ? "LEVEL_LOST"
        : !row.liveness || !row.liveness3
          ? "UNDETERMINED"
          : c3 === "none" && c5 === "none"
            ? "C-1"
            : c3 === "backlog" || c5 === "backlog"
              ? "C-2"
              : c3 === "latest-only" && c5 === "latest-only"
                ? "C-3"
                : `C-MIXED(${c3},${c5})`;
    const pos = [...(w3.positions as string[]), ...(w5.positions as string[])];
    row.ackPosition = pos.length === 0 ? "n/a" : pos.every((x) => x === pos[0]) ? pos[0] : "mixed";
    await closePane(ctx, pr, P);
  }
  pr.facts.runs = runs;
  pr.facts.otherSubscribersPossible = ctx.mode === "shared";
  pr.facts.sourceScope = `report_agent-sourced status on a held ${ctx.held?.kind} pane (agent=${ctx.held?.driverAgent}); detector-sourced replay = B2 scope`;
  pr.facts.terminalReplayFacts = runs.map((x) => x.terminalReplayFact ?? null);
  const codes = runs.map((x) => String(x.code));
  pr.facts.codes = codes;
  pr.facts.ackPositions = runs.map((x) => x.ackPosition);
  if (codes.includes("LEVEL_LOST")) return { verdict: "INCONCLUSIVE", code: "LEVEL_LOST" };
  if (codes.includes("UNDETERMINED") || !codes.every((c) => c === codes[0]) || codes[0]?.startsWith("C-MIXED")) {
    return { verdict: "INCONCLUSIVE", code: codes.join(",") };
  }
  if (codes[0] === "C-1") return { verdict: "PASS", code: "C-1" };
  return { verdict: "FAIL", code: codes[0] ?? "NONE" };
}

async function probeD1(ctx: Ctx, pr: ProbeRun): Promise<Outcome> {
  const na = heldUnavailable(ctx, true);
  if (na) return na;
  const P = (await heldPane(ctx, pr, "p")).P;
  const S = await subscribe(ctx, pr, "d1.S", subL(P));
  const D = await subscribe(ctx, pr, "d1.D", [{ type: "pane.agent_detected" }]);
  /** Reported real-work timeline (herdr-only "real end" = our idle report after a working report). */
  const timeline: Array<{ t: number; state: AgentState; phase: string }> = [];
  const rep = async (st: AgentState, phase: string): Promise<void> => {
    const t = await report(ctx, pr, P, st);
    timeline.push({ t, state: st, phase });
  };
  /** Every agent.get level sample of the probe (25 ms series + G snapshots) — `done` persistence. */
  const samples: LevelSample[] = [];
  const phases: Rec[] = [];
  let pushOk = false;
  let workingLost = false;
  /** working → dur → (assert working still held) → idle → 2 s agent.get series → 3 s → G. */
  const workEnd = async (phase: string, dur: number): Promise<Rec> => {
    await expectLevel(ctx, pr, P, levelsFor("idle"), `${phase}:before`);
    const g0 = await G(ctx, pr, P, `${phase}:before`);
    const base = S.pushes.length;
    await rep("working", phase);
    await sleep(dur);
    const heldAtIdle = await expectLevel(ctx, pr, P, ["working"], `${phase}:pre-idle`);
    if (!heldAtIdle) workingLost = true;
    await rep("idle", phase);
    const tIdle = now();
    const series = await sampleLevels(ctx, pr, P, 2000);
    samples.push(...series);
    await sleep(3000);
    const g1 = await G(ctx, pr, P, `${phase}:after`);
    const seq = statusSeq(S, P, (p) => S.pushes.indexOf(p) >= base);
    if (seq.length) pushOk = true;
    const row: Rec = {
      phase,
      workingMs: dur,
      workingHeldAtIdleReport: heldAtIdle,
      pushes: seq,
      levelAfterIdle: compressSamples(series, tIdle),
      level: { agentGet: g1.agent_status, paneList: await paneLevel(ctx, pr, P) },
      g: gDiff(g0, g1),
    };
    phases.push(row);
    return row;
  };
  for (const dur of [200, 5000, 30_000]) {
    progress(`D1 working ${dur} ms`);
    await workEnd(`dur${dur}`, dur);
  }
  // mid-run idle→working re-entry
  {
    const phase = "reentry";
    await expectLevel(ctx, pr, P, levelsFor("idle"), `${phase}:before`);
    const g0 = await G(ctx, pr, P, `${phase}:before`);
    const base = S.pushes.length;
    await rep("working", phase);
    await sleep(1000);
    if (!(await expectLevel(ctx, pr, P, ["working"], `${phase}:pre-mid-idle`))) workingLost = true;
    const gMid0 = await G(ctx, pr, P, `${phase}:pre-mid-idle`);
    await rep("idle", `${phase}:mid`);
    await sleep(300);
    const gMid1 = await G(ctx, pr, P, `${phase}:mid-idle`);
    await rep("working", `${phase}:resume`);
    await sleep(1000);
    if (!(await expectLevel(ctx, pr, P, ["working"], `${phase}:pre-idle`))) workingLost = true;
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
      midIdleLevel: gMid1.agent_status,
      g: gDiff(g0, g1),
    });
  }
  // step 4: focus (private only) — focus while a `done` from an unfocused work end may be present
  if (ctx.mode === "private") {
    const pre = await workEnd("focus-pre", 1000);
    const g0 = await G(ctx, pr, P, "focus:before");
    const base = S.pushes.length;
    const tF = now();
    const f = await tryCall(ctx, pr.name, "pane.focus", { pane_id: P });
    const focusSeries = await sampleLevels(ctx, pr, P, 3000);
    samples.push(...focusSeries);
    const g1 = await G(ctx, pr, P, "focus:after");
    const P2 = await scratchPane(ctx, pr, "p2");
    const f2 = await tryCall(ctx, pr.name, "pane.focus", { pane_id: P2 });
    const base2 = S.pushes.length;
    const rerun = await workEnd("unfocused-rerun", 1000);
    const g2 = await G(ctx, pr, P, "unfocused-rerun:after");
    phases.push({
      phase: "focus",
      doneBeforeFocus: g0.agent_status === "done",
      focusPrePushes: pre.pushes,
      focusOk: f.ok,
      pushesOnFocus: statusSeq(S, P, (p) => S.pushes.indexOf(p) >= base && S.pushes.indexOf(p) < base2),
      levelOnFocus: compressSamples(focusSeries, tF),
      gFocus: gDiff(g0, g1),
      focusOtherOk: f2.ok,
      pushesUnfocusedRerun: rerun.pushes,
      gRerun: gDiff(g1, g2),
    });
  } else {
    phases.push({ phase: "focus", skipped: "SKIPPED(shared) §2.5-3" });
  }
  // step 5: release
  {
    const base = S.pushes.length;
    const dBase = D.pushes.length;
    const rl = await tryCall(ctx, pr.name, "pane.release_agent", {
      pane_id: P,
      source: `hsprobe-${pr.name}`,
      agent: ctx.paneAgent.get(P) ?? "bash",
    });
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
  const pStatus = S.pushes.filter(statusOf(P));
  const gSamples: LevelSample[] = ((pr.facts.gSnapshots ?? []) as GSnap[]).map((g) => ({ t: g.t, status: g.agent_status, scs: g.state_change_seq, cs: g.completion_seq }));
  const allSamples = [...samples, ...gSamples].sort((a, b) => a.t - b.t);
  const doneRows = dones.map((p) => {
    const prior = timeline.filter((x) => x.t <= p.t);
    const last = prior[prior.length - 1];
    const lastIdle = [...prior].reverse().find((x) => x.state === "idle");
    const lastWorking = [...prior].reverse().find((x) => x.state === "working");
    const afterWork = Boolean(lastIdle && lastWorking && lastWorking.t < lastIdle.t);
    const i = pStatus.indexOf(p);
    const nextReport = timeline.find((x) => x.t > p.t)?.t ?? Number.POSITIVE_INFINITY;
    const win = allSamples.filter((s) => s.t >= p.t && s.t < nextReport);
    const firstDone = win.findIndex((s) => s.status === "done");
    const lastDone = win.reduce((acc, s, k) => (s.status === "done" ? k : acc), -1);
    const afterDone = firstDone >= 0 ? win.slice(firstDone).find((s) => s.status !== "done") : undefined;
    return {
      t: p.t,
      phase: last?.phase ?? "before-any-report",
      prevPushStatus: i > 0 ? (pStatus[i - 1]?.status ?? null) : null,
      lastReport: last ? last.state : null,
      msFromLastIdleReport: lastIdle ? p.t - lastIdle.t : null,
      afterReportedWorkEnd: afterWork,
      // agent.get level after the push, until the next report
      getShowedDone: firstDone >= 0,
      doneLevelMs: firstDone >= 0 ? (win[lastDone]?.t ?? 0) - (win[firstDone]?.t ?? 0) : null,
      doneLevelReplacedBy: afterDone?.status ?? null,
      levelSamples: win.length,
      completionSeqSeen: [...new Set(win.map((s) => s.cs).filter((x) => x !== null))],
    };
  });
  pr.facts.doneVsRealEnd = doneRows;
  pr.facts.doneCount = dones.length;
  pr.facts.doneSummary = {
    count: dones.length,
    afterWorking: doneRows.filter((d) => d.prevPushStatus === "working").length,
    afterBlocked: doneRows.filter((d) => d.prevPushStatus === "blocked").length,
    persistedInAgentGet: doneRows.filter((d) => d.getShowedDone).length,
    completionSeqPresent: doneRows.filter((d) => d.completionSeqSeen.length > 0).length,
    completionSeqEverPresent: allSamples.some((s) => s.cs !== null),
  };
  pr.facts.workingLostBeforeIdle = workingLost;
  pr.facts.realEndDefinition = "herdr-only: the idle report_agent that follows a working report (B2/D2 needed for CLI runs)";
  const gs = (pr.facts.gSnapshots ?? []) as GSnap[];
  const csRises = gs.filter((g, i) => {
    const prev = gs[i - 1];
    return i > 0 && prev && g.completion_seq !== null && prev.completion_seq !== null && g.completion_seq > prev.completion_seq;
  });
  pr.facts.completionSeqRises = csRises.map((g) => g.label);
  if (!pushOk) return { verdict: "INCONCLUSIVE", code: "UNDETERMINED" };
  // run-1 artifact guard: an idle report made after `working` was already lost tests nothing
  if (workingLost || levelLostCount(pr) > 0) return { verdict: "INCONCLUSIVE", code: "LEVEL_LOST" };
  const terminalOnly = doneRows.every((d) => d.phase === "release" || d.phase === "close");
  const code = dones.length === 0 ? "D-4" : terminalOnly ? "D-2" : "D-1";
  const bad = doneRows.some((d) => !d.afterReportedWorkEnd && d.phase !== "release" && d.phase !== "close");
  return bad ? { verdict: "FAIL", code: `${code}/done-without-work-end` } : { verdict: "PASS", code };
}

async function probeE(ctx: Ctx, pr: ProbeRun, reps: number): Promise<Outcome> {
  const na = heldUnavailable(ctx, true);
  if (na) return na;
  const runs: Rec[] = [];
  const wait = async (P: string, timeoutMs: number): Promise<Rec> => {
    const t0 = now();
    const r = await tryCall(ctx, pr.name, "agent.wait", { target: P, until: ["idle", "done"], timeout_ms: timeoutMs }, timeoutMs + ctx.timeoutMs);
    return r.ok
      ? { t0, ms: r.t - t0, ok: true, result: r.result }
      : { t0, ms: r.t - t0, ok: false, error: r.error, errorCode: r.code };
  };
  const notFound = (w: Rec): boolean =>
    w.ok !== true && (w.errorCode === "agent_not_found" || /agent_not_found|not found/.test(String(w.error ?? "")));
  for (let r = 1; r <= reps; r++) {
    progress(`E rep ${r}/${reps}`);
    const P = (await heldPane(ctx, pr, `r${r}`)).P;
    const row: Rec = { rep: r, pane: P };
    runs.push(row);
    const lost0 = levelLostCount(pr);
    // E-boot (C9): detector-held boot idle, nothing reported yet
    const okBoot = await expectLevel(ctx, pr, P, ["idle"], `e${r}:boot`);
    const boot = await wait(P, 5000);
    row.eBoot = { ...boot, levelAsserted: okBoot };
    row.bootReturn = boot.ok !== true ? "error" : Number(boot.ms) < 500 ? "immediate" : Number(boot.ms) >= 4500 ? "timeout" : "other";
    await report(ctx, pr, P, "working");
    await sleep(1000);
    await report(ctx, pr, P, "idle");
    await sleep(2000);
    await expectLevel(ctx, pr, P, levelsFor("idle"), `e${r}:level`);
    const g0 = await G(ctx, pr, P, `e${r}:level`);
    row.levelAtCall = g0.agent_status;
    const level = await wait(P, 5000);
    row.eLevel = level;
    const g1 = await G(ctx, pr, P, `e${r}:after-level`);
    // edge
    await expectLevel(ctx, pr, P, levelsFor("idle"), `e${r}:before-edge`);
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
    await expectLevel(ctx, pr, P, ["working"], `e${r}:before-working-wait`);
    const wk = wait(P, 5000);
    await sleep(2000);
    const tI2 = await report(ctx, pr, P, "idle");
    const work = await wk;
    row.eWorking = { ...work, idleAtMs: tI2 - Number(work.t0) };
    const g3 = await G(ctx, pr, P, `e${r}:after-working`);
    row.g = [gDiff(g0, g1), gDiff(g1, g2), gDiff(g2, g3)];
    row.levelLost = levelLostCount(pr) - lost0;
    const lvlMs = Number(level.ms);
    const workMs = Number(work.ms);
    const workIdle = Number(rec(row.eWorking).idleAtMs);
    const edgeMs = Number(edge.ms);
    const edgeIdle = Number(rec(row.eEdge).idleAtMs);
    const edgeWork = Number(rec(row.eEdge).workingAtMs);
    const controlOk = work.ok === true && workMs >= workIdle - 200;
    row.code = [boot, level, edge, work].some(notFound)
      ? "AGENT_NOT_FOUND"
      : Number(row.levelLost) > 0
        ? "LEVEL_LOST"
        : !controlOk
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
  pr.facts.bootReturns = runs.map((x) => x.bootReturn);
  if (codes.includes("AGENT_NOT_FOUND")) return { verdict: "INCONCLUSIVE", code: "AGENT_NOT_FOUND" };
  if (codes.includes("LEVEL_LOST")) return { verdict: "INCONCLUSIVE", code: "LEVEL_LOST" };
  if (codes.includes("UNDETERMINED") || !codes.every((c) => c === codes[0])) {
    return { verdict: "INCONCLUSIVE", code: codes.join(",") };
  }
  return codes[0] === "E-1" || codes[0] === "E-2"
    ? { verdict: "PASS", code: codes[0] }
    : { verdict: "INCONCLUSIVE", code: codes[0] ?? "NONE" };
}

/**
 * Probe s (run-1 analysis §7): `state_change_seq` semantics on two held panes — per-pane last-change
 * stamp vs server-global counter, and whether a same-status re-report bumps it.
 */
async function probeS(ctx: Ctx, pr: ProbeRun, reps: number): Promise<Outcome> {
  const na = heldUnavailable(ctx, true);
  if (na) return na;
  const H1 = await heldPane(ctx, pr, "h1");
  const H2 = await heldPane(ctx, pr, "h2");
  const g1 = await G(ctx, pr, H1.P, "s:h1-first");
  const g2 = await G(ctx, pr, H2.P, "s:h2-first");
  pr.facts.agentStart = [H1, H2].map((h, i) => {
    const first = (i === 0 ? g1 : g2).state_change_seq;
    return {
      pane: h.P,
      startScs: h.startScs,
      firstGetScs: first,
      // run 1: agent.start returns 0 (unassigned) — a naive comparator sees a reset; not one.
      knownNonReset: h.startScs === 0 && first !== null && first > 0,
    };
  });
  const level = new Map<string, AgentState>([
    [H1.P, "idle"],
    [H2.P, "idle"],
  ]);
  const stampRows: Rec[] = [];
  for (let r = 1; r <= reps; r++) {
    for (const [chg, other] of [
      [H1.P, H2.P],
      [H2.P, H1.P],
    ] as const) {
      progress(`s rep ${r}/${reps} change ${chg}`);
      const cur = level.get(chg) ?? "idle";
      const okC = await expectLevel(ctx, pr, chg, levelsFor(cur), `s${r}:${chg}:before`);
      const okO = await expectLevel(ctx, pr, other, levelsFor(level.get(other) ?? "idle"), `s${r}:${other}:before`);
      const c0 = await G(ctx, pr, chg, `s${r}:changed:before`);
      const o0 = await G(ctx, pr, other, `s${r}:other:before`);
      const next: AgentState = cur === "working" ? "blocked" : "working";
      await report(ctx, pr, chg, next);
      level.set(chg, next);
      await sleep(300);
      const okC1 = await expectLevel(ctx, pr, chg, [next], `s${r}:${chg}:after`);
      const c1 = await G(ctx, pr, chg, `s${r}:changed:after`);
      const o1 = await G(ctx, pr, other, `s${r}:other:after`);
      const d = (a: number | null, b: number | null): number | null => (a === null || b === null ? null : b - a);
      const dChanged = d(c0.state_change_seq, c1.state_change_seq);
      const dOther = d(o0.state_change_seq, o1.state_change_seq);
      const otherStable = o0.agent_status === o1.agent_status;
      stampRows.push({
        rep: r,
        changed: chg,
        other,
        transition: `${cur}→${next}`,
        dChanged,
        dOther,
        changedScsAfter: c1.state_change_seq,
        otherScsAfter: o1.state_change_seq,
        otherEqualsChanged: o1.state_change_seq !== null && o1.state_change_seq === c1.state_change_seq,
        otherStatusStable: otherStable,
        class:
          !okC || !okO || !okC1
            ? "LEVEL_LOST"
            : !otherStable
              ? "OTHER_CHANGED"
              : dChanged === null || dOther === null || dChanged <= 0
                ? "UNDETERMINED"
                : dOther === 0
                  ? "stamp"
                  : "global",
      });
    }
  }
  pr.facts.stampVsGlobal = stampRows;
  // same-status re-report on H1
  const S = await subscribe(ctx, pr, "s.S", subL(H1.P));
  const reRows: Rec[] = [];
  for (let r = 1; r <= reps; r++) {
    const cur = level.get(H1.P) ?? "working";
    const ok = await expectLevel(ctx, pr, H1.P, [cur], `s-rr${r}:before`);
    const a = await G(ctx, pr, H1.P, `s-rr${r}:before`);
    const base = S.pushes.length;
    await report(ctx, pr, H1.P, cur);
    await sleep(500);
    const ok1 = await expectLevel(ctx, pr, H1.P, [cur], `s-rr${r}:after`);
    const b = await G(ctx, pr, H1.P, `s-rr${r}:after`);
    const dScs = a.state_change_seq === null || b.state_change_seq === null ? null : b.state_change_seq - a.state_change_seq;
    reRows.push({
      rep: r,
      state: cur,
      dScs,
      pushes: statusSeq(S, H1.P, (p) => S.pushes.indexOf(p) >= base),
      class: !ok || !ok1 ? "LEVEL_LOST" : dScs === null ? "UNDETERMINED" : dScs > 0 ? "bump" : "no-bump",
    });
  }
  S.destroy();
  pr.facts.reReport = reRows;
  const sc = stampRows.map((x) => String(x.class));
  const rc = reRows.map((x) => String(x.class));
  pr.facts.codes = { stampVsGlobal: sc, reReport: rc };
  if (sc.includes("LEVEL_LOST") || rc.includes("LEVEL_LOST")) return { verdict: "INCONCLUSIVE", code: "LEVEL_LOST" };
  const one = (xs: string[]): string | null => (xs.length > 0 && xs.every((x) => x === xs[0]) ? (xs[0] ?? null) : null);
  const s1 = one(sc);
  const r1 = one(rc);
  const sCode = s1 === "stamp" ? "S-STAMP" : s1 === "global" ? "S-GLOBAL" : `S-MIXED(${sc.join(",")})`;
  const rCode = r1 === "bump" ? "rereport-bump" : r1 === "no-bump" ? "rereport-nobump" : `rereport-mixed(${rc.join(",")})`;
  const decided = (s1 === "stamp" || s1 === "global") && (r1 === "bump" || r1 === "no-bump");
  return { verdict: decided ? "PASS" : "INCONCLUSIVE", code: `${sCode}/${rCode}` };
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

// ─── B2 · D2 — real claude CLI (`[실 CLI — 오너 yes]`, owner yes 2026-10-23) ─────

/** Resolve the real CLI in the probe process (original PATH, before scrubEnv). Never uses T/fakebin. */
function resolveRealCli(originalPath: string): RealCli {
  const entries = originalPath.split(":").filter((e) => e && !e.includes("fakebin") && !e.includes("loom-herdr-probe-"));
  const searchPath = entries.join(":");
  const bin = Bun.which(REAL_CLI_KIND, { PATH: searchPath }) ?? null;
  let real: string | null = null;
  try {
    real = bin ? realpathSync(bin) : null;
  } catch {
    real = null;
  }
  const panePath = [...new Set([...(bin ? [dirname(bin)] : []), ...entries])].join(":");
  const out: RealCli = { bin, realpath: real, version: null, panePath };
  if (!bin) return out;
  const v = spawnSync(bin, ["--version"], {
    encoding: "utf8",
    timeout: 15_000,
    env: { PATH: panePath, HOME: REAL_CLI_HOME },
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (v.status === 0 && typeof v.stdout === "string") out.version = redactText(v.stdout.trim().split("\n")[0] ?? "");
  else out.versionError = `status=${v.status} signal=${v.signal ?? ""} ${v.error ? String(v.error) : ""}`.trim();
  return out;
}

const DIALOG_PATTERNS: Array<[string, RegExp]> = [
  ["trust", /do you trust|trust (the|this) (files|folder|project)/i],
  ["login", /select login method|please run \/login|log ?in to (claude|anthropic)|not logged in|invalid api key/i],
  ["theme", /choose the text style/i],
  ["permission", /do you want to (proceed|allow|make this edit)|allow this (tool|command)/i],
  ["press-enter", /press enter to continue/i],
  ["bypass-permissions", /bypass permissions mode/i],
];

function dialogIn(text: string): string | null {
  for (const [name, re] of DIALOG_PATTERNS) if (re.test(text)) return name;
  return null;
}

/** A line that is the reply itself: only `OK` (optionally `.`/`!`) after non-alphanumeric bullets. */
const okLineCount = (text: string): number => text.split("\n").filter((l) => /^[^A-Za-z0-9]*OK[.!]?\s*$/.test(l)).length;

function readText(r: Rec): string {
  return str(rec(r.read).text) ?? str(r.text) ?? "";
}

/** agent.read / pane.read / agent.explain → redacted file under T (text never goes into facts). */
async function saveRead(
  ctx: Ctx,
  pr: ProbeRun,
  method: "agent.read" | "pane.read" | "agent.explain",
  params: Rec,
  file: string,
): Promise<{ text: string; meta: Rec }> {
  const r = await tryCall(ctx, pr.name, method, params);
  const path = join(ctx.T, file);
  if (!r.ok) {
    writeFileSync(path, `error: ${redactText(r.error)}\n`);
    return { text: "", meta: { file: path, error: r.error } };
  }
  const text = method === "agent.explain" ? JSON.stringify(r.result, null, 2) : readText(r.result);
  const red = redactText(text);
  writeFileSync(path, `${red}\n`);
  return {
    text,
    meta: { file: path, lines: text.split("\n").length, redactedLines: red.split("\n").filter((l) => l.startsWith("[hsprobe: line redacted]")).length },
  };
}

interface Proc {
  pid: number;
  name: string;
  argv0: string | null;
  cmdline: string | null;
}

function findProcs(v: unknown, out: Proc[] = []): Proc[] {
  if (Array.isArray(v)) {
    for (const x of v) findProcs(x, out);
  } else if (v && typeof v === "object") {
    const o = v as Rec;
    const pid = num(o.pid);
    const name = str(o.name);
    if (pid !== null && name !== null) out.push({ pid, name, argv0: str(o.argv0), cmdline: str(o.cmdline) });
    for (const x of Object.values(o)) if (x && typeof x === "object") findProcs(x, out);
  }
  return out;
}

const isCliProc = (p: Proc): boolean => `${p.name} ${p.argv0 ?? ""} ${p.cmdline ?? ""}`.includes(REAL_CLI_KIND);

function psCommand(pid: number): string {
  const r = spawnSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8", timeout: 5000 });
  return typeof r.stdout === "string" ? r.stdout.trim() : "";
}

/** Real-CLI pane: cwd = the already-trusted repo, env = real HOME + PATH with the real claude (§5.4 option 1). */
async function realCliPane(ctx: Ctx, pr: ProbeRun, rc: RealCli): Promise<string> {
  const params: Rec = {
    focus: false,
    label: `hsprobe-${pr.name}-${ctx.run}`,
    cwd: REAL_CLI_CWD,
    env: { HOME: REAL_CLI_HOME, USER: "kyoungsiklee", LOGNAME: "kyoungsiklee", PATH: rc.panePath },
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
  ctx.realCliPanes.add(paneId);
  pr.created.panes.push({ id: paneId, t });
  return paneId;
}

/** Close the real-CLI pane and confirm the CLI pid is gone; SIGTERM only a surviving pid that is still claude. */
async function closeRealCli(ctx: Ctx, pr: ProbeRun, P: string, bootPids: number[]): Promise<Rec> {
  const pi = await tryCall(ctx, pr.name, "pane.process_info", { pane_id: P });
  const procs = pi.ok ? findProcs(pi.result) : [];
  const pids = [...new Set([...bootPids, ...procs.filter(isCliProc).map((p) => p.pid)])];
  await closePane(ctx, pr, P);
  const until = now() + 5000;
  while (now() < until && pids.some(pidAlive)) await sleep(100);
  const survivors = pids.filter(pidAlive);
  const sigtermed: number[] = [];
  const skipped: Rec[] = [];
  for (const pid of survivors) {
    const cmd = psCommand(pid);
    if (cmd.includes(REAL_CLI_KIND)) {
      try {
        process.kill(pid, "SIGTERM");
        sigtermed.push(pid);
      } catch {
        /* */
      }
    } else {
      skipped.push({ pid, reason: "pid no longer a claude process — not signalled" });
    }
  }
  if (sigtermed.length) await sleep(2000);
  const out = {
    cliPidsBeforeClose: pids,
    processInfoBeforeClose: pi.ok ? procs : { error: pi.error },
    gone: pids.filter((p) => !pidAlive(p)),
    survivorsAfterClose: survivors,
    sigtermed,
    skipped,
    stillAlive: pids.filter(pidAlive),
  };
  ev(ctx, pr.name, "REAL_CLI_CLEANUP", out);
  return out;
}

const pushRow = (p: Push, t0: number): Rec => ({ s: p.status, ms: p.t - t0, t: p.t });

interface Boot {
  P: string;
  S: Sink;
  D: Sink;
  g0: GSnap;
  tStart: number;
  readyAt: number | null;
  pendingClearedAt: number | null;
  cliPids: number[];
  code: string | null;
}

/** Shared B2/D2 boot (§5.2 1–3 / §7.2 1): subscribe before start, start, resolve, poll to interactive_ready, dialog check. */
async function bootRealCli(ctx: Ctx, pr: ProbeRun, rc: RealCli, gEveryMs: number): Promise<Boot> {
  const f = pr.facts;
  const P = await realCliPane(ctx, pr, rc);
  f.pane = P;
  const S = await subscribe(ctx, pr, `${pr.name}.S`, subL(P));
  const D = await subscribe(ctx, pr, `${pr.name}.D`, [{ type: "pane.agent_detected" }]);
  const g0 = await G(ctx, pr, P, "before-start");
  const tStart = now();
  f.tStart = tStart;
  const st = await tryCall(
    ctx,
    pr.name,
    "agent.start",
    { name: `hsprobe-${pr.name}-${REAL_CLI_KIND}-${ctx.run}`, kind: REAL_CLI_KIND, pane_id: P, timeout_ms: 60_000 },
    ctx.timeoutMs + 60_000,
  );
  f.start = st.ok ? { ok: true, ms: st.t - tStart, result: st.result } : { ok: false, ms: st.t - tStart, error: st.error, code: st.code };
  const boot: Boot = { P, S, D, g0, tStart, readyAt: null, pendingClearedAt: null, cliPids: [], code: null };
  // resolved binary + CLI pids
  const fakebin = join(ctx.T, "fakebin");
  let resolved = "unknown";
  const resUntil = now() + 5000;
  while (now() < resUntil) {
    const pi = await tryCall(ctx, pr.name, "pane.process_info", { pane_id: P });
    if (pi.ok) {
      const j = JSON.stringify(pi.result);
      const procs = findProcs(pi.result);
      if (j.includes(fakebin)) {
        resolved = "fake";
        f.processInfo = procs;
        break;
      }
      const cli = procs.filter(isCliProc);
      if (cli.length) {
        resolved = "real";
        boot.cliPids = cli.map((p) => p.pid);
        f.processInfo = procs;
        break;
      }
    }
    await sleep(200);
  }
  f.resolved = resolved;
  f.cliPids = boot.cliPids;
  if (resolved === "fake") {
    boot.code = "RESOLVED_FAKE";
    return boot;
  }
  if (!st.ok && resolved !== "real") {
    boot.code = "START_FAILED";
    return boot;
  }
  // launch_pending / interactive_ready (G every gEveryMs, ≤60 s)
  const until = now() + 60_000;
  while (now() < until) {
    const g = await G(ctx, pr, P, "boot");
    if (boot.pendingClearedAt === null && g.launch_pending === false) boot.pendingClearedAt = g.t;
    if (g.interactive_ready === true) {
      boot.readyAt = g.t;
      break;
    }
    await sleep(gEveryMs);
  }
  f.startToPendingClearedMs = boot.pendingClearedAt ? boot.pendingClearedAt - tStart : null;
  f.startToReadyMs = boot.readyAt ? boot.readyAt - tStart : null;
  const det = await saveRead(ctx, pr, "agent.read", { target: P, source: "detection" }, `${pr.name}-boot-detection.txt`);
  const vis = await saveRead(ctx, pr, "pane.read", { pane_id: P, source: "visible" }, `${pr.name}-boot-visible.txt`);
  const dialog = dialogIn(det.text) ?? dialogIn(vis.text);
  const gD = await G(ctx, pr, P, "boot-dialog-check");
  f.bootScreen = { detection: det.meta, visible: vis.meta, dialog, statusAtCheck: gD.agent_status };
  if (dialog) {
    ev(ctx, pr.name, "REAL_CLI_DIALOG", { dialog, status: gD.agent_status });
    boot.code = `DIALOG(${dialog})`;
  } else if (boot.readyAt === null) {
    boot.code = "BOOT_NOT_READY";
  }
  return boot;
}

function realCliPreflight(ctx: Ctx, pr: ProbeRun): Outcome | null {
  pr.facts.ownerDecision = OWNER_DECISION;
  pr.facts.kind = REAL_CLI_KIND;
  pr.facts.date = new Date().toISOString();
  pr.facts.serverMode = ctx.mode;
  pr.facts.paneHome = REAL_CLI_HOME;
  pr.facts.paneCwd = REAL_CLI_CWD;
  pr.facts.probeHome = ctx.home;
  if (ctx.mode !== "private") return { verdict: "SKIPPED", code: "REFUSED(shared)" };
  const rc = ctx.realCli;
  if (!rc) return { verdict: "SKIPPED", code: "REFUSED(no owner approval flags)" };
  pr.facts.cli = { bin: rc.bin, realpath: rc.realpath, version: rc.version, versionError: rc.versionError ?? null };
  if (!rc.bin) return { verdict: "INCONCLUSIVE", code: "NO_REAL_CLI" };
  if (!ctx.manifests || !JSON.stringify(ctx.manifests).includes(`"${REAL_CLI_KIND}"`)) {
    return { verdict: "INCONCLUSIVE", code: "NOT_IN_MANIFESTS" };
  }
  pr.facts.manifestAbsPaths = manifestAbsPaths(ctx.manifests, REAL_CLI_KIND);
  return null;
}

/** Newest session-file names (never content) under ~/.claude/projects/<cwd slug> — D2 records new ones. */
function sessionFiles(): string[] {
  const dir = join(REAL_CLI_HOME, ".claude", "projects", REAL_CLI_CWD.replace(/[/.]/g, "-"));
  const r = spawnSync("ls", ["-1t", dir], { encoding: "utf8", timeout: 5000 });
  return typeof r.stdout === "string" ? r.stdout.split("\n").filter(Boolean).slice(0, 50) : [];
}

async function probeB2(ctx: Ctx, pr: ProbeRun): Promise<Outcome> {
  const pre = realCliPreflight(ctx, pr);
  if (pre) return pre;
  const rc = ctx.realCli as RealCli;
  const f = pr.facts;
  const boot = await bootRealCli(ctx, pr, rc, 250);
  const { P, S, D, g0, tStart } = boot;
  try {
    if (boot.code === "RESOLVED_FAKE" || boot.code === "START_FAILED" || boot.code?.startsWith("DIALOG")) {
      return { verdict: "INCONCLUSIVE", code: boot.code };
    }
    // 30 s no-prompt observation after interactive_ready, G every 250 ms
    const obsFrom = boot.readyAt ?? now();
    const obsEnd = obsFrom + 30_000;
    while (now() < obsEnd) {
      await G(ctx, pr, P, "obs");
      await sleep(250);
    }
    const gEnd = await G(ctx, pr, P, "obs-end");
    const all = S.pushes.filter(statusOf(P));
    const readyAt = boot.readyAt;
    const before = all.filter((p) => readyAt === null || p.t < readyAt);
    const after = all.filter((p) => readyAt !== null && p.t >= readyAt);
    f.pushesBeforeReady = before.map((p) => pushRow(p, tStart));
    f.pushesAfterReady = after.map((p) => pushRow(p, tStart));
    f.terminalEvents = S.pushes.filter((p) => p.status === null).map((p) => ({ event: p.event, ms: p.t - tStart }));
    f.agentDetected = D.pushes.filter((p) => p.paneId === P).map((p) => ({ ms: p.t - tStart, raw: p.raw }));
    f.agentDetectedOtherPanes = D.pushes.filter((p) => p.paneId !== P).length;
    f.g = { start: g0, ready: readyAt, end: gEnd, diff: gDiff(g0, gEnd) };
    f.observeMs = 30_000;
    f.gEveryMs = 250;
    const det = await saveRead(ctx, pr, "agent.read", { target: P, source: "detection" }, "b2-end-detection.txt");
    const exp = await saveRead(ctx, pr, "agent.explain", { target: P }, "b2-end-explain.json");
    f.endScreen = { detection: det.meta, explain: exp.meta, dialog: dialogIn(det.text) };
    // same-pane late subscriber: does herdr replay the detector-source status? (§6 note)
    const S2 = await subscribe(ctx, pr, "b2.S2", subL(P));
    await sleep(5000);
    f.lateSubscriber = { pushes: S2.pushes.filter(statusOf(P)).map((p) => pushRow(p, S2.ackAt ?? S2.openedAt)), levelAtOpen: gEnd.agent_status };
    S2.destroy();
    // control: subscription liveness
    const cb = S.pushes.length;
    let control = false;
    try {
      ctx.paneAgent.set(P, REAL_CLI_KIND);
      await report(ctx, pr, P, "working");
      control = Boolean(await S.waitFor(statusIs(P, "working"), 2000, cb));
    } catch (e) {
      f.controlError = e instanceof Error ? e.message : String(e);
    }
    f.control = control;
    const sts = all.map((p) => p.status);
    const workingBefore = before.some((p) => p.status === "working");
    const workingAfter = after.some((p) => p.status === "working");
    const sawDone = sts.includes("done");
    const csRose = g0.completion_seq !== gEnd.completion_seq && gEnd.completion_seq !== null;
    f.bootCompletionSeqRose = csRose;
    if (boot.code === "BOOT_NOT_READY") return { verdict: "INCONCLUSIVE", code: "BOOT_NOT_READY" };
    if (workingBefore) return { verdict: "FAIL", code: "B2-BOOT-WORKING(before-ready)" };
    if (workingAfter) return { verdict: "FAIL", code: "B2-BOOT-WORKING(after-ready)" };
    if (sawDone) return { verdict: "FAIL", code: "B2-BOOT-DONE" };
    if (!control) return { verdict: "INCONCLUSIVE", code: "UNDETERMINED(control)" };
    return { verdict: "PASS", code: all.length ? "B2-IDLE-ONLY" : "B2-NO-PUSH" };
  } finally {
    f.cliCleanup = await closeRealCli(ctx, pr, P, boot.cliPids);
    S.destroy();
    D.destroy();
  }
}

async function probeD2(ctx: Ctx, pr: ProbeRun): Promise<Outcome> {
  const pre = realCliPreflight(ctx, pr);
  if (pre) return pre;
  const rc = ctx.realCli as RealCli;
  const f = pr.facts;
  const sessionsBefore = sessionFiles();
  const boot = await bootRealCli(ctx, pr, rc, 250);
  const { P, S, D, g0, tStart } = boot;
  try {
    if (boot.code) return { verdict: "INCONCLUSIVE", code: boot.code };
    // boot observation: 10 s after interactive_ready, G every 500 ms
    const bootEnd = (boot.readyAt ?? now()) + 10_000;
    while (now() < bootEnd) {
      await G(ctx, pr, P, "boot-obs");
      await sleep(500);
    }
    f.bootPushes = S.pushes.filter(statusOf(P)).map((p) => pushRow(p, tStart));
    const gPre = await G(ctx, pr, P, "pre-prompt");
    const base = await tryCall(ctx, pr.name, "pane.read", { pane_id: P, source: "recent", lines: 200 });
    const okBaseline = base.ok ? okLineCount(readText(base.result)) : 0;
    f.okBaseline = okBaseline;
    // prompt (no wait field)
    const pushBase = S.pushes.length;
    const tPrompt = now();
    f.tPrompt = tPrompt;
    const pr1 = await tryCall(ctx, pr.name, "agent.prompt", { target: P, text: D2_PROMPT }, ctx.timeoutMs + 30_000);
    const stalled = /stalled/i.test(JSON.stringify(pr1.ok ? pr1.result : { e: pr1.error, c: pr1.code }));
    f.prompt = {
      text: D2_PROMPT,
      rpcMs: pr1.t - tPrompt,
      ok: pr1.ok,
      error: pr1.ok ? null : pr1.error,
      errorCode: pr1.ok ? null : pr1.code,
      stalled,
      resultAgent: pr1.ok ? rec(pr1.result.agent) : null,
    };
    const gPost = await G(ctx, pr, P, "post-prompt");
    // 120 s observation: G + pane.read every 500 ms
    let okAt: number | null = null;
    let lastMissAt: number | null = tPrompt;
    const obsEnd = tPrompt + 120_000;
    const polls: Rec[] = [];
    while (now() < obsEnd) {
      const tick = now();
      const g = await G(ctx, pr, P, "obs");
      if (okAt === null) {
        const r = await tryCall(ctx, pr.name, "pane.read", { pane_id: P, source: "recent", lines: 200 });
        const n = r.ok ? okLineCount(readText(r.result)) : 0;
        if (r.ok && n > okBaseline) okAt = r.t;
        else lastMissAt = r.t;
      }
      polls.push({ ms: tick - tPrompt, s: g.agent_status, rev: g.revision, scs: g.state_change_seq, cs: g.completion_seq });
      await sleep(Math.max(0, 500 - (now() - tick)));
    }
    const gEnd = await G(ctx, pr, P, "obs-end");
    const det = await saveRead(ctx, pr, "agent.read", { target: P, source: "detection" }, "d2-end-detection.txt");
    const exp = await saveRead(ctx, pr, "agent.explain", { target: P }, "d2-end-explain.json");
    f.endScreen = { detection: det.meta, explain: exp.meta, dialog: dialogIn(det.text) };
    f.polls = polls;
    // analysis (from the log-derived push list)
    const after = S.pushes.slice(pushBase).filter(statusOf(P));
    f.pushesAfterPrompt = after.map((p) => pushRow(p, tPrompt));
    f.terminalEvents = S.pushes.filter((p) => p.status === null).map((p) => ({ event: p.event, ms: p.t - tPrompt }));
    f.agentDetected = D.pushes.filter((p) => p.paneId === P).map((p) => ({ ms: p.t - tPrompt, raw: p.raw }));
    const firstWorking = after.find((p) => p.status === "working") ?? null;
    f.promptToFirstWorkingMs = firstWorking ? firstWorking.t - tPrompt : null;
    f.promptToFirstWorkingOverLatencyBound4s = firstWorking ? firstWorking.t - tPrompt > 4000 : null;
    f.okAppearedMs = okAt !== null ? okAt - tPrompt : null;
    f.okLastMissMs = lastMissAt !== null ? lastMissAt - tPrompt : null;
    const fromWorking = firstWorking ? after.slice(after.indexOf(firstWorking)) : [];
    let reentries = 0;
    for (let i = 1; i < fromWorking.length; i++) {
      const a = fromWorking[i - 1]?.status;
      if ((a === "idle" || a === "done") && fromWorking[i]?.status === "working") reentries++;
    }
    f.reentries = reentries;
    const completions = fromWorking.filter((p) => p.status === "idle" || p.status === "done");
    // "before the reply" = before the last pane.read that still lacked the OK line (poll-lag safe)
    const early = okAt !== null && lastMissAt !== null ? completions.filter((p) => p.t < lastMissAt) : [];
    f.completionsBeforeReply = early.map((p) => pushRow(p, tPrompt));
    const terminal = completions[completions.length - 1] ?? null;
    f.terminalPush = terminal ? { ...pushRow(terminal, tPrompt), afterReplyMs: okAt !== null ? terminal.t - okAt : null } : null;
    f.g = { start: g0, prePrompt: gPre, postPrompt: gPost, end: gEnd, diffs: [gDiff(gPre, gPost), gDiff(gPost, gEnd)] };
    // done ↔ completion_seq: the first poll after each completion push
    f.doneCompletionSeq = completions.map((p) => {
      const nxt = (f.gSnapshots as GSnap[]).find((g) => g.t >= p.t && g.label === "obs");
      return {
        push: p.status,
        ms: p.t - tPrompt,
        nextG: nxt ? { ms: nxt.t - tPrompt, s: nxt.agent_status, scs: nxt.state_change_seq, cs: nxt.completion_seq } : null,
        csEqualsScs: nxt ? nxt.completion_seq !== null && nxt.completion_seq === nxt.state_change_seq : null,
        csAbovePre: nxt ? (nxt.completion_seq ?? -1) > (gPre.completion_seq ?? -1) : null,
      };
    });
    f.agentPromptStalledThenStatus = stalled ? after.map((p) => p.status) : null;
    if (!pr1.ok) return { verdict: "INCONCLUSIVE", code: `PROMPT_ERROR(${pr1.code ?? "?"})` };
    if (!firstWorking) return { verdict: "INCONCLUSIVE", code: okAt !== null ? "D2-NO-WORKING(reply seen)" : "D2-NO-WORKING" };
    if (okAt === null) {
      const endDialog = dialogIn(det.text);
      return { verdict: "INCONCLUSIVE", code: endDialog ? `DIALOG(${endDialog})` : "D2-NO-REPLY" };
    }
    const kind = completions.some((p) => p.status === "done") ? "DONE" : completions.length ? "IDLE" : "NONE";
    if (early.length) return { verdict: "FAIL", code: `D2-COMPLETION-BEFORE-REPLY(${early.map((p) => p.status).join(",")})` };
    if (kind === "NONE") return { verdict: "INCONCLUSIVE", code: "D2-NO-COMPLETION-PUSH" };
    return { verdict: "PASS", code: `D2-${kind}-AFTER-REPLY` };
  } finally {
    f.cliCleanup = await closeRealCli(ctx, pr, P, boot.cliPids);
    S.destroy();
    D.destroy();
    const sessionsAfter = sessionFiles();
    f.newSessionFiles = sessionsAfter.filter((x) => !sessionsBefore.includes(x));
    f.sessionDir = join(REAL_CLI_HOME, ".claude", "projects", REAL_CLI_CWD.replace(/[/.]/g, "-"));
  }
}

// ─── global cleanup (§2.3) ───────────────────────────────────────────────────

async function globalCleanup(ctx: Ctx): Promise<Rec> {
  const out: Rec = {};
  for (const s of ctx.sinks) s.destroy();
  // own python3 variant-(c) children only
  for (const c of ctx.children) {
    if (c.exitCode === null && c.signalCode === null) c.kill("SIGTERM");
  }
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
      const reps = REAL_CLI_PROBES.includes(p) ? 1 : (args.reps ?? DEFAULT_REPS[p]);
      console.log(`\n# ${p} (reps ${reps})`);
      for (const line of plannedSequence(p, args.server, reps)) console.log(`  - ${line}`);
    }
    console.log("\n# cleanup: destroy sockets → close owned panes/tabs → workspace.close → (private) server.stop on T/ socket → SIGTERM own pid only");
    return 0;
  }

  const realHome = homedir();
  const wantsReal = args.probes.some((p) => REAL_CLI_PROBES.includes(p));
  // owner yes 2026-10-23: resolve the real claude on the original PATH before the env scrub
  const realCli = wantsReal && args.realCli && args.ownerApproved ? resolveRealCli(process.env.PATH ?? "") : null;
  const T = realpathSync(mkdtempSync(join(tmpdir(), "loom-herdr-probe-")));
  const home = join(T, "home");
  mkdirSync(home, { recursive: true });
  mkdirSync(join(T, "tmp"), { recursive: true });
  // §2.2: should run outside a herdr pane. Inherited HERDR_* keys are stripped from this process's own
  // env before any herdr contact (scrubEnv); names (never values) are recorded (run-1 analysis §0 note).
  const inheritedHerdrEnv = Object.keys(process.env).filter((k) => k.startsWith("HERDR_"));
  scrubEnv(home, T);
  const herdrEnvRemaining = Object.keys(process.env).filter((k) => k.startsWith("HERDR_"));
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
    paneAgent: new Map(),
    heldPanes: new Set(),
    held: null,
    herdrEnvStripped: inheritedHerdrEnv,
    children: new Set(),
    realCli,
    realCliPanes: new Set(),
  };
  writeFakeBins(ctx);
  writePyClient(ctx);
  console.log(`T=${T}`);
  ev(ctx, "run", "PROBE_BEGIN", {
    args,
    run: ctx.run,
    pid: process.pid,
    herdrEnvStripped: inheritedHerdrEnv,
    herdrEnvRemaining,
    ownerDecision: realCli ? OWNER_DECISION : null,
    realCli: realCli ? { bin: realCli.bin, realpath: realCli.realpath, version: realCli.version } : null,
  });
  if (inheritedHerdrEnv.length) {
    progress(`warning: HERDR_* env inherited (${inheritedHerdrEnv.join(",")}) — inside a pane? stripped from the probe env`);
  }
  if (herdrEnvRemaining.length) {
    console.error(`HERDR_* env still present after scrub: ${herdrEnvRemaining.join(",")}`);
    return 1;
  }

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
      } else if (name !== "step0" && name !== "b1" && !REAL_CLI_PROBES.includes(name) && !ctx.pushOk) {
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
            case "s":
              outcome = await probeS(ctx, pr, reps);
              break;
            case "b1":
              outcome = await probeB1(ctx, pr);
              break;
            case "b2":
              outcome = await probeB2(ctx, pr);
              break;
            case "d2":
              outcome = await probeD2(ctx, pr);
              break;
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          pr.facts.error = msg;
          ev(ctx, name, "PROBE_ERROR", msg);
          const tag = ["REFUSED", "ABORTED_REAL_CLI", "NO_HELD_SUBSTRATE"].find((x) => msg.startsWith(x));
          outcome = { verdict: "INCONCLUSIVE", code: tag ?? "ERROR" };
          // a refused call or a real-CLI resolution stops the run
          if (tag === "REFUSED" || tag === "ABORTED_REAL_CLI") aborted = true;
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
  const final = {
    T,
    run: ctx.run,
    server: ctx.mode,
    socket: ctx.sock,
    herdrEnvStripped: ctx.herdrEnvStripped,
    heldSubstrate: ctx.held,
    ownerDecision: realCli ? OWNER_DECISION : null,
    realCli: realCli ? { bin: realCli.bin, realpath: realCli.realpath, version: realCli.version } : null,
    dirty,
    cleanup: runOut,
    probes: summaries,
  };
  writeFileSync(join(T, "summary.json"), `${JSON.stringify(redactDeep(final), null, 2)}\n`);
  console.log(JSON.stringify({ T, dirty, summary: join(T, "summary.json"), log: ctx.logPath }));
  for (const x of summaries) console.log(JSON.stringify(redactDeep(x)));
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
