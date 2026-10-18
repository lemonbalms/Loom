/**
 * PLAN 0.38.0 P5 — memory-write smoke, end to end: an inner HeadlessDispatcher (profile `smoke`,
 * started from the bridge config path) whose fake claude / codex / grok CLIs print
 * `LOOM-MEMORY-CANDIDATES` blocks, and the dist (or source) CLI `loom memory list|approve|add`
 * reading the same temp store. Modelled on `smoke-policy-honesty.ts` (0.37 P5).
 *
 * R53-M2 / R54-M2 / R54-M3 rules (the reason this file looks the way it does):
 *   - THIS process reads the real environment only. It writes nothing under the real home and
 *     imports no host module (the inner process does, under the child env).
 *   - One temp home T = mkdtemp(os.tmpdir()/loom-smoke-memory-write-XXXXXX).
 *   - EVERY child (`bun dist/loom.js …` and the inner `bun scripts/smoke-memory-write.ts
 *     --inner …`) gets LOOM_TEST_HOME=T and LOOM_PROFILE=smoke, and no other LOOM_* / FABLE_*
 *     (relay token/url, session) or XDG_* variable from the parent — except step ⑦, which adds
 *     LOOM_CARD on purpose to one CLI child.
 *   - Guard, per mode (R54-M3), on the exact env object before EVERY spawn, else exit 1:
 *       default    — HOME === LOOM_TEST_HOME, under os.tmpdir(), not the real home;
 *       --real-cli — LOOM_TEST_HOME under os.tmpdir(); HOME = the real home (CLI auth).
 *     The inner process re-checks the same rule on its own env and on loomDir().
 *   - Real home before/after: ~/.loom and ~/.fable strict (names + mtime, depth 6);
 *     ~/Library/LaunchAgents strict (depth 1); ~/.claude ~/.codex ~/.grok new top-level names only.
 *   - One bridge config file `<T>/.loom/bridge/smoke.json` per step, written here and read by the
 *     inner `loadBridgeConfig` and the CLI `memory list` head — top-level `agentArgv` for all three
 *     agents; default mode adds `worker.agentBin` (the fake CLIs).
 *
 * Steps (default mode — fake CLIs only; cardWrites on unless noted):
 *   ① one fake codex / grok / claude card each prints a two-candidate block → stderr
 *      `memory_propose … proposed 2` · `dist loom memory list --agent <a>` shows both card rows with
 *      the `[card by …]` suffix and the head `memory: K card proposals awaiting review` · the card
 *      copy carries the forced `loom-memory-candidates`
 *   ② exited-recovery reprocess of the same cards (record key kept → fast path; key removed →
 *      store scan) → `dup 2` both times · entries.jsonl bytes unchanged · key back in the record
 *   ③ six candidates → `proposed 5` · `cap 1`
 *   ④ a shape secret · an env secret · a marker candidate · one clean → `proposed 1` ·
 *      `secret 2` · `marker 1` · neither secret in entries.jsonl or stderr
 *   ⑤ the ① cards' notes.md exists · 0600 · = the report with the secret redacted
 *   ⑥ `dist loom memory approve` a ① claude proposal → `activated:` line with the full body ·
 *      the next claude card in that room carries the body in its first-turn fence (the still
 *      proposed sibling does not)
 *   ⑦ `LOOM_CARD=…` + `dist loom memory add` → exit 1 · refusal line · store bytes + mtime unchanged
 *   ⑧ cardWrites off (memory + skills on — the 0.37 config) → card directory file set = 0.37 (no
 *      notes.md) · no memory_propose line · no record key · store bytes unchanged · copy without
 *      the forced skill
 *   ⑨ (0.43.0 C3 ⑩ · R62-H1) every dispatched card: `prompt-1.json` reads `ok` through
 *      `readPromptRecord` and is v3 · its `system` sha256 = HEADLESS_WORKER_HINT's · its six system
 *      section ids in manifest order · WORK scans complete · 0 new entries in WORK (sorted listing
 *      before / after the card)
 * `--real-cli --owner-approved` (never by default — D18 · R56-M4 ship condition): step ① only with
 * the real claude / codex / grok binaries (inner HOME = real home, LOOM_TEST_HOME = T), cardWrites
 * on, a prompt asking for exactly one candidate. Prints per card the stderr `memory_propose` line,
 * the proposed count, whether notes.md exists, the `prompt-1.json` read outcome / version / system
 * sha check / section ids, any incomplete WORK scan and the new WORK entries (printed for the
 * outcome table, not asserted); exits non-zero when all three cards propose 0
 * or any card lacks notes.md.
 * `--only <claude|codex|grok>` (P5c — with `--real-cli --owner-approved` only, else a usage FAIL):
 * step ① for that one agent; pass = notes.md exists (the ≥1-proposed rule is the three-agent run's).
 * Real-cli diagnostics per card: spawn argv + cwd (the inner wraps each bin in a logging `exec`
 * shim under T), the skill copy file list, the transcript's tool / command events, stderr head.
 *
 * Usage (repo root, real shell):  bun run smoke:memory-write [--source]
 *   (--source runs packages/cli/src/index.ts instead of dist/loom.js for the CLI children)
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join, resolve, sep } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SELF = join(import.meta.dir, "smoke-memory-write.ts");
const BUN = process.execPath;
const AGENTS = ["claude", "codex", "grok"] as const;
type Agent = (typeof AGENTS)[number];
const PROFILE = "smoke";
const PEER = "smoke-peer";
const DISPATCHER = "smoke-dispatcher";
const ROOM_W = "room_W";
const ROOM_C = "room_C";
const ROOM_F = "room_F";
const ROOM_O = "room_O";
const PROMPT = "do the bounded smoke task";
const REAL_PROMPT =
  "This is a Loom memory-write smoke test. Reply with one short sentence saying the smoke task is done. Then, as your loom-memory-candidates skill describes, end your reply with a memory candidates block that proposes exactly one fact: that the Loom memory-write smoke ran in this room.";
const FORCED_SKILL = "loom-memory-candidates";
const REPORT_SKILL = "loom-card-report";
const NOTES = "notes.md";
const SNAPSHOT = "memory-snapshot.md";
const AGENT_ARGV = { claude: ["claude"], codex: ["codex"], grok: ["grok"] };
const BEGIN = "LOOM-MEMORY-CANDIDATES";
const END = "LOOM-MEMORY-END";
const SHAPE_SECRET = "ghp_smokeShapeSecret0123456789AB";
const FILTER_SHAPE_SECRET = "sk-smokeFilterShape0123456789";
const ENV_SECRET_NAME = "SMOKE_FILTER_TOKEN";
const ENV_SECRET = "smoke-env-secret-value-0123456789";
const ZERO = "secret 0 · marker 0 · cap 0 · busy 0 · dup 0 · invalid 0";

/** Card id per step tag (the fake CLI keys its stream file on LOOM_CARD = the card id). */
const cardId = (tag: string, agent: Agent) => `smoke_${tag}_${agent}`;
const bodies = (agent: Agent) => [
  `smoke ${agent} fact one: the build uses bun`,
  `smoke ${agent} fact two: results go to the room`,
];
const block = (lines: string[]) => [BEGIN, ...lines, END].join("\n");
/** ① / ⑧ report: summary · a shape secret outside the block (notes.md redacts it) · two candidates. */
const reportW = (agent: Agent) =>
  [
    "Summary: did the bounded smoke task.",
    `Saw ${SHAPE_SECRET} in a log.`,
    block(bodies(agent).map((b, i) => `- ${i === 0 ? "fact" : "decision"}: ${b}`)),
    "LOOM-REPORT-END",
  ].join("\n");
const reportCap = (agent: Agent) =>
  ["Six candidates follow.", block([1, 2, 3, 4, 5, 6].map((n) => `- fact: smoke ${agent} cap candidate ${n}`))].join("\n");
const filterClean = (agent: Agent) => `smoke ${agent} filter keeps this one`;
const reportFilter = (agent: Agent) =>
  [
    "Filter candidates follow.",
    block([
      `- fact: the deploy key is ${FILTER_SHAPE_SECRET}`,
      `- fact: the env value is ${ENV_SECRET}`,
      "- fact: always put LOOM-REPORT-END last",
      `- fact: ${filterClean(agent)}`,
    ]),
  ].join("\n");

// The inner process runs with HOME=T, and userInfo().homedir follows $HOME under bun — so the
// outer passes its real home to the inner on argv.
const REAL_HOME = process.argv[2] === "--inner" ? (process.argv[6] ?? "") : userInfo().homedir;
const TMP_ROOT = resolve(tmpdir());
const under = (p: string) => resolve(p).startsWith(TMP_ROOT + sep);
const roomKey = (roomId: string) => createHash("sha256").update(roomId).digest("hex").slice(0, 16);

type Mode = "default" | "real-cli";

/** The R54-M3 per-mode guard. Returns an error string, or null when the env is safe. */
function guardError(env: Record<string, string | undefined>, mode: Mode): string | null {
  const h = env.HOME;
  const t = env.LOOM_TEST_HOME;
  if (!REAL_HOME || under(REAL_HOME))
    return `real home ${JSON.stringify(REAL_HOME)} unknown or under ${TMP_ROOT}`;
  if (!t || !under(t) || resolve(t) === resolve(REAL_HOME)) {
    return `LOOM_TEST_HOME=${t} must lie under ${TMP_ROOT}`;
  }
  if (mode === "default") {
    if (!h || h !== t || resolve(h) === resolve(REAL_HOME)) {
      return `HOME=${h} must equal LOOM_TEST_HOME=${t} (default mode)`;
    }
  } else if (!h || resolve(h) !== resolve(REAL_HOME)) {
    return `HOME=${h} must be the real home in --real-cli mode`;
  }
  if (env.LOOM_PROFILE !== PROFILE) return `LOOM_PROFILE=${env.LOOM_PROFILE} must be ${PROFILE}`;
  for (const k of Object.keys(env)) {
    if (k.startsWith("XDG_") || k.startsWith("FABLE_")) return `env still carries ${k}`;
    // LOOM_CARD is step ⑦'s deliberate input (a CLI child only — never the inner process).
    if (
      k.startsWith("LOOM_") &&
      k !== "LOOM_TEST_HOME" &&
      k !== "LOOM_PROFILE" &&
      k !== "LOOM_CARD"
    ) {
      return `env still carries ${k}`;
    }
  }
  return null;
}

if (process.argv[2] === "--inner") {
  await inner();
  process.exit(0);
}

// =============================================================================================
// outer process
// =============================================================================================

const SOURCE = process.argv.includes("--source");
const REAL_CLI = process.argv.includes("--real-cli");
const MODE: Mode = REAL_CLI ? "real-cli" : "default";
if (REAL_CLI && !process.argv.includes("--owner-approved")) {
  console.error(
    "FAIL --real-cli launches the real claude / codex / grok CLIs and needs an explicit owner yes; re-run with --real-cli --owner-approved only after that",
  );
  process.exit(2);
}
const ONLY_IX = process.argv.indexOf("--only");
const ONLY = ONLY_IX === -1 ? null : (process.argv[ONLY_IX + 1] ?? "");
if (
  ONLY !== null &&
  (!REAL_CLI || !process.argv.includes("--owner-approved") || !(AGENTS as readonly string[]).includes(ONLY))
) {
  console.error(
    "FAIL usage: --only <claude|codex|grok> is accepted only together with --real-cli --owner-approved",
  );
  process.exit(2);
}
const REAL_AGENTS: readonly Agent[] = ONLY === null ? AGENTS : [ONLY as Agent];
const DIST = SOURCE
  ? join(ROOT, "packages", "cli", "src", "index.ts")
  : join(ROOT, "dist", "loom.js");

// ---------------------------------------------------------------------------------------------
// real-home snapshots (read-only)
// ---------------------------------------------------------------------------------------------

const STRICT_DIRS: Array<[string, number]> = [
  [".loom", 6],
  [".fable", 6],
  [join("Library", "LaunchAgents"), 1],
];
const NAMES_ONLY_DIRS = [".claude", ".codex", ".grok"];
const STRICT_MAX_ENTRIES = 50_000;

function strictListing(root: string, maxDepth: number): Map<string, number> {
  const out = new Map<string, number>();
  const walk = (dir: string, depth: number) => {
    if (out.size >= STRICT_MAX_ENTRIES) return;
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const n of names.sort()) {
      const p = join(dir, n);
      try {
        const st = lstatSync(p);
        out.set(p, st.mtimeMs);
        if (st.isDirectory() && depth < maxDepth) walk(p, depth + 1);
      } catch {
        out.set(p, -1);
      }
    }
  };
  try {
    out.set(root, lstatSync(root).mtimeMs);
    walk(root, 1);
  } catch {
    // absent root: empty listing
  }
  return out;
}

function topNames(root: string): Set<string> {
  try {
    return new Set(readdirSync(root));
  } catch {
    return new Set();
  }
}

const before = {
  strict: STRICT_DIRS.map(([d, depth]) => strictListing(join(REAL_HOME, d), depth)),
  names: NAMES_ONLY_DIRS.map((d) => topNames(join(REAL_HOME, d))),
};

// ---------------------------------------------------------------------------------------------
// temp home + child env + guard
// ---------------------------------------------------------------------------------------------

const T = mkdtempSync(join(TMP_ROOT, "loom-smoke-memory-write-"));
const realT = realpathSync(T);
let cleaned = false;
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  rmSync(T, { recursive: true, force: true });
}
process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});
process.on("SIGTERM", () => {
  cleanup();
  process.exit(143);
});

function childEnv(extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue;
    if (k.startsWith("LOOM_") || k.startsWith("FABLE_") || k.startsWith("XDG_")) continue;
    env[k] = v;
  }
  env.HOME = MODE === "default" ? T : REAL_HOME;
  env.LOOM_TEST_HOME = T;
  env.LOOM_PROFILE = PROFILE;
  return { ...env, ...extra };
}

type Run = { code: number; out: string; err: string };
/** The single spawn site: build the env, guard that exact object, spawn. */
function spawnChild(argv: string[], extra: Record<string, string> = {}, timeout = 120_000): Run {
  const env = childEnv(extra);
  const bad = guardError(env, MODE);
  if (bad) {
    console.error(`FAIL guard (${MODE}) — ${bad}; aborting`);
    cleanup();
    process.exit(1);
  }
  const r = Bun.spawnSync([BUN, ...argv], {
    cwd: T,
    env,
    stdout: "pipe",
    stderr: "pipe",
    timeout,
  });
  return { code: r.exitCode ?? -1, out: r.stdout.toString(), err: r.stderr.toString() };
}
const loom = (args: string[], extra: Record<string, string> = {}) =>
  spawnChild([DIST, ...args], extra);

type NotesOut = { mode: number; text: string } | null;
type InnerCardOut = {
  cardId: string;
  agent: Agent;
  roomId: string;
  sent: string;
  /** memory-snapshot.md text, null when absent. */
  file: string | null;
  /** Sorted file names of the card directory. */
  cardFiles: string[];
  /** Skill names in the card copy (`skills/plugin/skills`), null when absent. */
  skillNames: string[] | null;
  notes: NotesOut;
  /** The record's `memoryProposed`, null when the key is absent. */
  memoryProposed: string[] | null;
  resultStatus: string | null;
  resultReason: string | null;
  resultOutput: string | null;
  /** `[headless] memory_propose|card_notes (<this card>)` lines. */
  lines: string[];
  /** Real-cli diagnostics (P5c); null in default mode. */
  diag: CardDiag | null;
  /** PLAN 0.43.0 C3 ⑩: `prompt-1.json` version + its `system` sha256 next to HEADLESS_WORKER_HINT's. */
  record: {
    /** `readPromptRecord` outcome (R12 validator); `reason` is set when `invalid`. */
    read: "ok" | "missing" | "invalid";
    reason: string | null;
    version: number | null;
    systemSha256: string | null;
    hintSha256: string;
    /** The record's section ids in record order (system then user) — `channel:id`. */
    sectionIds: string[];
    /** The record's system-channel section ids in order. */
    systemIds: string[];
    /** PROMPT_RECORD_V3_SECTIONS system ids (the manifest projection) in order. */
    wantSystemIds: string[];
  };
  /**
   * R62-H1: sorted WORK listing (relative paths, recursive) before / after this card; `incomplete`
   * is the first scan failure (WORK root not a real directory · a directory read error), null when
   * both scans completed.
   */
  workFiles: { before: string[]; after: string[]; incomplete: string | null };
};
type CardDiag = {
  /** Spawn argv as the exec shim saw it (argv[0] = the real bin), null when the shim never ran. */
  argv: string[] | null;
  cwd: string | null;
  skillsRoot: string;
  skillFiles: string[];
  /** grok prompt.txt head (claude / codex take the first turn on stdin — not captured). */
  promptFile: string | null;
  events: string[];
  stderrHead: string;
};
type RecoverRound = { lines: string[]; memoryProposed: Record<string, string[] | null> };
type InnerOut = {
  profile: string;
  loomDir: string;
  memory: unknown;
  cards: InnerCardOut[];
  rounds: RecoverRound[];
};

/** Every dispatched card of every inner run (PLAN 0.43.0 C3 ⑩ record check). */
const allCards: InnerCardOut[] = [];

function runInner(step: string, extra: Record<string, string> = {}): InnerOut {
  const outPath = join(T, `inner-${step}.json`);
  const r = spawnChild(
    [SELF, "--inner", step, outPath, MODE, REAL_HOME, REAL_AGENTS.join(",")],
    extra,
    900_000,
  );
  if (r.code !== 0 || !existsSync(outPath)) {
    throw new Error(`inner ${step} exit ${r.code} · stderr ${JSON.stringify(r.err.slice(-800))}`);
  }
  const out = JSON.parse(readFileSync(outPath, "utf8")) as InnerOut;
  allCards.push(...out.cards);
  return out;
}

/** WORK entries present after the card but not before (R62-H1). */
const newWorkFiles = (c: InnerCardOut) => c.workFiles.after.filter((f) => !c.workFiles.before.includes(f));

// ---------------------------------------------------------------------------------------------
// temp-home fixtures (all under T)
// ---------------------------------------------------------------------------------------------

const loomHome = join(T, ".loom");
const WORK = join(realT, "work");
const BIN = join(realT, "bin");
const DUMP = join(realT, "dump");
const entriesPath = (agent: Agent) => join(loomHome, "memory", `${agent}.${PROFILE}`, "entries.jsonl");

/** Write `<T>/.loom/<segs…>` (0700 dirs · 0600 file); refuses any path outside T. */
function writeLoom(segs: string[], text: string): string {
  const p = join(loomHome, ...segs);
  if (!resolve(p).startsWith(resolve(T) + sep)) throw new Error(`fixture path not under T: ${p}`);
  mkdirSync(join(p, ".."), { recursive: true, mode: 0o700 });
  writeFileSync(p, text, { mode: 0o600 });
  return p;
}

/** The step's bridge config — memory + skills on; cardWrites on unless `cardWrites: false`. */
function writeBridge(o: { cardWrites: boolean }): void {
  const worker: Record<string, unknown> = {
    backend: "headless",
    cwd: WORK,
    allowedRoots: [realT],
    ...(MODE === "default"
      ? { agentBin: Object.fromEntries(AGENTS.map((a) => [a, join(BIN, a)])) }
      : {}),
    memory: o.cardWrites ? { enabled: true, cardWrites: true } : { enabled: true },
    skills: { enabled: true },
  };
  writeLoom(
    ["bridge", `${PROFILE}.json`],
    JSON.stringify({ authorizedDispatchers: [], agentArgv: AGENT_ARGV, worker }, null, 2),
  );
}

/** Every room selects the bundled report skill, so each card copy is deterministic. */
function selectRoomSkills(): void {
  for (const room of [ROOM_W, ROOM_C, ROOM_F, ROOM_O]) {
    writeLoom(
      ["rooms", roomKey(room), "skills.json"],
      JSON.stringify({ version: 1, skills: [REPORT_SKILL] }),
    );
  }
}

/** A finished stream whose parsed finalText is exactly `text`. */
function finishedStream(agent: Agent, text: string): string {
  const lines =
    agent === "claude"
      ? [{ type: "result", result: text, is_error: false, usage: { input_tokens: 1, output_tokens: 1 } }]
      : agent === "codex"
        ? [
            { type: "item.completed", item: { type: "agent_message", text } },
            { type: "turn.completed", usage: { input_tokens: 1, output_tokens: 1 } },
          ]
        : [
            { type: "text", data: text },
            { type: "end", stopReason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } },
          ];
  return `${lines.map((l) => JSON.stringify(l)).join("\n")}\n`;
}
function writeStream(id: string, agent: Agent, text: string): void {
  writeFileSync(join(DUMP, `stream-${id}`), finishedStream(agent, text), { mode: 0o600 });
}

function writeFakeClis(): void {
  for (const d of [BIN, DUMP]) mkdirSync(d, { recursive: true, mode: 0o700 });
  for (const agent of AGENTS) {
    // Fake CLI: dump stdin (and grok's --prompt-file) per LOOM_CARD, print the card's stream
    // file when the step wrote one, else one minimal finished stream.
    const done =
      agent === "claude"
        ? `printf '%s\\n' '{"type":"result","result":"done","is_error":false,"usage":{"input_tokens":1,"output_tokens":1}}'`
        : agent === "codex"
          ? `printf '%s\\n' '{"type":"item.completed","item":{"type":"agent_message","text":"done"}}' '{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1}}'`
          : `printf '%s\\n' '{"type":"text","data":"done"}' '{"type":"end","stopReason":"end_turn","usage":{"input_tokens":1,"output_tokens":1}}'`;
    writeFileSync(
      join(BIN, agent),
      `#!/bin/sh
out='${DUMP}'
cat > "$out/stdin-$LOOM_CARD"
prev=""
for a in "$@"; do
  if [ "$prev" = "--prompt-file" ]; then cp "$a" "$out/promptfile-$LOOM_CARD"; fi
  prev="$a"
done
if [ -e "$out/stream-$LOOM_CARD" ]; then
  cat "$out/stream-$LOOM_CARD"
else
  ${done}
fi
`,
      { mode: 0o700 },
    );
  }
}

// ---------------------------------------------------------------------------------------------
// steps
// ---------------------------------------------------------------------------------------------

const results: { name: string; ok: boolean; detail: string }[] = [];
function step(name: string, fn: () => string) {
  let ok = false;
  let detail: string;
  try {
    detail = fn();
    ok = true;
  } catch (e) {
    detail = e instanceof Error ? e.message : String(e);
  }
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name} — ${detail}`);
}
function check(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
function show(r: Run): string {
  return `exit ${r.code} · stdout ${JSON.stringify(shortT(r.out.trim()).slice(0, 400))} · stderr ${JSON.stringify(shortT(r.err.trim()).slice(0, 300))}`;
}
const shortT = (s: string) => s.split(realT).join("<T>").split(T).join("<T>");
const same = (a: readonly string[], b: readonly string[]) => JSON.stringify(a) === JSON.stringify(b);
function listDiff(what: string, expected: readonly string[], got: readonly string[]): string {
  return `${what}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(got.map(shortT))}`;
}
const proposeLine = (id: string, body: string) => `[headless] memory_propose (${id}): ${body}`;
const proposeLines = (lines: readonly string[]) => lines.filter((l) => l.includes("memory_propose"));
const readEntries = (agent: Agent) =>
  existsSync(entriesPath(agent)) ? readFileSync(entriesPath(agent), "utf8") : "";
const lineCount = (text: string) => text.split("\n").filter((l) => l.trim() !== "").length;
const resultText = (c: InnerCardOut) =>
  `result ${c.resultStatus}/${c.resultReason} ${JSON.stringify((c.resultOutput ?? "").slice(0, 200))}`;
/** The 0.37 card directory (memory + skills on, default-policy fence) — PLAN ⑧. */
const baseCardFiles = (agent: Agent) =>
  ["memory-snapshot.md", "prompt-1.json", "session.json", "skills", "transcript-1.jsonl", "transcript-1.stderr"]
    .concat(agent === "grok" ? ["prompt.txt"] : [])
    .sort();
function cardOf(out: InnerOut, id: string): InnerCardOut {
  const c = out.cards.find((x) => x.cardId === id);
  check(c, `no card ${id}`);
  return c;
}

const realRows: {
  agent: Agent;
  line: string;
  proposed: number | null;
  notes: boolean;
  reply: string;
  diag: CardDiag | null;
  record: InnerCardOut["record"];
  newWork: string[];
  workIncomplete: string | null;
}[] = [];

if (!existsSync(DIST)) {
  console.error(`FAIL dist missing — ${DIST} (run bun run build:cli)`);
  cleanup();
  process.exit(1);
}

let writeOut: InnerOut | null = null;

try {
  mkdirSync(WORK, { recursive: true, mode: 0o700 });
  if (MODE === "default") writeFakeClis();
  selectRoomSkills();
  writeBridge({ cardWrites: true });

  if (MODE === "real-cli") {
    const stepName =
      ONLY === null
        ? "① real CLIs — one card each · cardWrites on · memory_propose line · notes.md"
        : `① real CLI — ${ONLY} only · cardWrites on · memory_propose line · notes.md`;
    step(stepName, () => {
      const out = runInner("real");
      check(out.profile === PROFILE, `inner profile ${out.profile}`);
      for (const agent of REAL_AGENTS) {
        const c = cardOf(out, cardId("r", agent));
        const line = proposeLines(c.lines)[0] ?? "";
        const m = / proposed (\d+) · dropped /.exec(line);
        realRows.push({
          agent,
          line,
          proposed: m ? Number(m[1]) : null,
          notes: c.notes !== null,
          reply: c.resultOutput ?? "",
          diag: c.diag,
          record: c.record,
          newWork: newWorkFiles(c),
          workIncomplete: c.workFiles.incomplete,
        });
      }
      const missing = realRows.filter((r) => !r.notes).map((r) => r.agent);
      check(missing.length === 0, `notes.md missing for ${JSON.stringify(missing)} (R56-M4)`);
      // P5c: a single-agent run passes on notes.md alone; the proposed count is printed below.
      if (ONLY !== null) {
        const r = realRows[0]!;
        return `${r.agent} proposed ${r.proposed ?? "?"} · notes.md yes (single-agent run — ≥1-proposed rule not applied)`;
      }
      const empty = realRows.filter((r) => r.reply.trim() === "").map((r) => r.agent);
      check(empty.length === 0, `empty reply from ${JSON.stringify(empty)}`);
      check(
        realRows.some((r) => (r.proposed ?? 0) >= 1),
        "all three cards proposed 0 — ship blocked (R56-M4: revise the SKILL.md wording, owner-approved rerun)",
      );
      return realRows.map((r) => `${r.agent} proposed ${r.proposed ?? "?"} · notes.md ${r.notes ? "yes" : "no"}`).join(" · ");
    });
  } else {
    step("① fake CLIs print a two-candidate block → proposed 2 · list rows + head K + suffix · forced skill", () => {
      for (const agent of AGENTS) writeStream(cardId("w", agent), agent, reportW(agent));
      const out = runInner("write");
      writeOut = out;
      check(out.profile === PROFILE, `inner profile ${out.profile}`);
      check(
        JSON.stringify(out.memory) === JSON.stringify({ enabled: true, cardWrites: true }),
        `inner memory deps ${JSON.stringify(out.memory)}`,
      );
      const parts: string[] = [];
      for (const agent of AGENTS) {
        const id = cardId("w", agent);
        const c = cardOf(out, id);
        const want = [proposeLine(id, `proposed 2 · dropped 0 (${ZERO})`)];
        check(same(proposeLines(c.lines), want), listDiff(`${id}: stderr`, want, proposeLines(c.lines)));
        check(c.resultOutput === reportW(agent), `${id}: delivered text changed · ${resultText(c)}`);
        check(
          same(c.skillNames ?? [], [REPORT_SKILL, FORCED_SKILL]),
          listDiff(`${id}: card copy skills`, [REPORT_SKILL, FORCED_SKILL], c.skillNames ?? []),
        );
        check(c.memoryProposed?.length === 1, `${id}: record memoryProposed ${JSON.stringify(c.memoryProposed)}`);
        const entries = readEntries(agent);
        check(lineCount(entries) === 2, `${agent}: entries.jsonl has ${lineCount(entries)} lines`);
        const r = loom(["memory", "list", "--agent", agent]);
        check(r.code === 0, `list ${agent}: ${show(r)}`);
        const lines = r.out.split("\n");
        check(
          lines.includes("memory: 2 card proposals awaiting review"),
          `list ${agent}: no head "memory: 2 card proposals awaiting review" · ${show(r)}`,
        );
        const rk = roomKey(ROOM_W);
        bodies(agent).forEach((b, i) => {
          const type = i === 0 ? "fact" : "decision";
          const row = lines.find((l) => l.endsWith(`  ${b}  [card by ${DISPATCHER}]`));
          check(row, `list ${agent}: no card row for ${JSON.stringify(b)} · ${show(r)}`);
          check(
            new RegExp(`^  mem_[0-9a-f]{16}  proposed  ${type}  room:${rk}  seq \\d+  `).test(row),
            `list ${agent}: row shape ${JSON.stringify(row)}`,
          );
        });
        parts.push(`${agent} proposed 2 · K 2`);
      }
      return `${parts.join(" · ")} · copy [${REPORT_SKILL}, ${FORCED_SKILL}] · delivered text unchanged`;
    });

    step("② exited-recovery reprocess (key kept → fast path · key removed → store scan) → dup 2 · lines unchanged", () => {
      const pre = Object.fromEntries(AGENTS.map((a) => [a, readEntries(a)]));
      const out = runInner("recover");
      check(out.rounds.length === 2, `inner rounds ${out.rounds.length}`);
      out.rounds.forEach((round, i) => {
        const want = AGENTS.map((a) =>
          proposeLine(cardId("w", a), "proposed 0 · dropped 2 (secret 0 · marker 0 · cap 0 · busy 0 · dup 2 · invalid 0)"),
        );
        const got = proposeLines(round.lines).sort();
        check(same(got, [...want].sort()), listDiff(`round ${i + 1} stderr`, [...want].sort(), got));
        for (const a of AGENTS) {
          const keys = round.memoryProposed[cardId("w", a)];
          check(keys?.length === 1, `round ${i + 1} ${a}: record memoryProposed ${JSON.stringify(keys)}`);
        }
      });
      for (const a of AGENTS) {
        check(readEntries(a) === pre[a], `${a}: entries.jsonl changed by the reprocess`);
      }
      return "fast path dup 2 × 3 · store scan dup 2 × 3 · entries.jsonl bytes unchanged · keys back in the records";
    });

    step("③ cap — six candidates → proposed 5 · cap 1", () => {
      for (const agent of AGENTS) writeStream(cardId("c", agent), agent, reportCap(agent));
      const out = runInner("cap");
      for (const agent of AGENTS) {
        const id = cardId("c", agent);
        const c = cardOf(out, id);
        const want = [
          proposeLine(id, "proposed 5 · dropped 1 (secret 0 · marker 0 · cap 1 · busy 0 · dup 0 · invalid 0)"),
        ];
        check(same(proposeLines(c.lines), want), listDiff(`${id}: stderr`, want, proposeLines(c.lines)));
        const entries = readEntries(agent);
        check(lineCount(entries) === 7, `${agent}: entries.jsonl has ${lineCount(entries)} lines (want 2 + 5)`);
        check(!entries.includes(`cap candidate 6`), `${agent}: the sixth candidate was written`);
      }
      return "proposed 5 · cap 1 × 3 · sixth candidate absent";
    });

    step("④ filter — shape secret · env secret · marker → secret 2 · marker 1 · clean one proposed", () => {
      for (const agent of AGENTS) writeStream(cardId("f", agent), agent, reportFilter(agent));
      const out = runInner("filter", { [ENV_SECRET_NAME]: ENV_SECRET });
      for (const agent of AGENTS) {
        const id = cardId("f", agent);
        const c = cardOf(out, id);
        const want = [
          proposeLine(id, "proposed 1 · dropped 3 (secret 2 · marker 1 · cap 0 · busy 0 · dup 0 · invalid 0)"),
        ];
        check(same(proposeLines(c.lines), want), listDiff(`${id}: stderr`, want, proposeLines(c.lines)));
        const entries = readEntries(agent);
        check(lineCount(entries) === 8, `${agent}: entries.jsonl has ${lineCount(entries)} lines (want 7 + 1)`);
        check(entries.includes(filterClean(agent)), `${agent}: the clean candidate is missing`);
        for (const s of [FILTER_SHAPE_SECRET, ENV_SECRET, "LOOM-REPORT-END"]) {
          check(!entries.includes(s), `${agent}: entries.jsonl carries ${JSON.stringify(s.slice(0, 6))}…`);
          check(!c.lines.join("\n").includes(s), `${agent}: stderr carries ${JSON.stringify(s.slice(0, 6))}…`);
        }
        check(c.notes !== null && !c.notes.text.includes(FILTER_SHAPE_SECRET), `${agent}: notes.md shape secret`);
        check(c.notes !== null && !c.notes.text.includes(ENV_SECRET), `${agent}: notes.md env secret`);
      }
      return "proposed 1 · secret 2 · marker 1 × 3 · no secret in entries.jsonl / stderr / notes.md";
    });

    step("⑤ notes.md — exists · 0600 · = report with the secret redacted", () => {
      const out = writeOut;
      check(out, "no ① output");
      for (const agent of AGENTS) {
        const c = cardOf(out, cardId("w", agent));
        check(c.notes, `${c.cardId}: no notes.md`);
        check((c.notes.mode & 0o777) === 0o600, `${c.cardId}: notes.md mode ${(c.notes.mode & 0o777).toString(8)}`);
        const want = reportW(agent).split(SHAPE_SECRET).join("[REDACTED]");
        check(!c.notes.text.includes(SHAPE_SECRET), `${c.cardId}: notes.md carries the secret`);
        check(c.notes.text === want, `${c.cardId}: notes.md ${JSON.stringify(c.notes.text.slice(0, 200))}`);
        check(
          same(c.cardFiles, [...baseCardFiles(agent), NOTES].sort()),
          listDiff(`${c.cardId}: card dir`, [...baseCardFiles(agent), NOTES].sort(), c.cardFiles),
        );
      }
      return "notes.md 0600 × 3 · secret → [REDACTED] · card dir = 0.37 set + notes.md";
    });

    step("⑥ approve a card proposal → activated: line · next card's fence carries the body", () => {
      const [b1, b2] = bodies("claude") as [string, string];
      const lj = loom(["memory", "list", "--agent", "claude", "--json"]);
      check(lj.code === 0, `list --json: ${show(lj)}`);
      const parsed = JSON.parse(lj.out) as {
        agents: { entries: { id: string; body: string; status: string }[] }[];
      };
      const e = parsed.agents[0]?.entries.find((x) => x.body === b1 && x.status === "proposed");
      check(e, `no proposed claude entry ${JSON.stringify(b1)}`);
      const r = loom(["memory", "approve", "--agent", "claude", e.id]);
      check(r.code === 0, `approve: ${show(r)}`);
      const lines = r.out.split("\n");
      check(lines.some((l) => l.startsWith(`approved ${e.id} (seq `)), `approve: no approved line · ${show(r)}`);
      const activated = `activated: fact room:${roomKey(ROOM_W)} — ${b1} (source card by ${DISPATCHER})`;
      check(lines.includes(activated), `approve: no ${JSON.stringify(activated)} · ${show(r)}`);
      const out = runInner("next");
      const c = cardOf(out, cardId("n", "claude"));
      check(c.file !== null, `${c.cardId}: no ${SNAPSHOT}`);
      check(c.file.includes(b1), `${c.cardId}: the fence lacks the approved body`);
      check(c.sent.includes(b1), `${c.cardId}: the first turn lacks the approved body`);
      check(!c.sent.includes(b2), `${c.cardId}: the still-proposed sibling leaked into the first turn`);
      return `${JSON.stringify(activated)} · next card fence carries it · proposed sibling absent`;
    });

    step("⑦ D16' — LOOM_CARD set → dist loom memory add exit 1 · store bytes + mtime unchanged", () => {
      const p = entriesPath("claude");
      const bytes = readFileSync(p);
      const mtime = statSync(p).mtimeMs;
      const r = loom(["memory", "add", "--agent", "claude", "--", "smoke body written from a card shell"], {
        LOOM_CARD: "smoke_card_shell",
      });
      check(r.code === 1, `add exit ${r.code} (want 1) · ${show(r)}`);
      check(r.err.includes("refused — LOOM_CARD is set"), `add stderr · ${show(r)}`);
      check(readFileSync(p).equals(bytes), "entries.jsonl bytes changed");
      check(statSync(p).mtimeMs === mtime, "entries.jsonl mtime changed");
      return `exit 1 · ${JSON.stringify(r.err.trim().slice(0, 80))}… · store unchanged`;
    });

    step("⑧ cardWrites off → card dir = 0.37 set · no memory_propose · no record key · store unchanged", () => {
      writeBridge({ cardWrites: false });
      for (const agent of AGENTS) writeStream(cardId("o", agent), agent, reportW(agent));
      const pre = Object.fromEntries(AGENTS.map((a) => [a, readEntries(a)]));
      const out = runInner("off");
      check(
        JSON.stringify(out.memory) === JSON.stringify({ enabled: true }),
        `inner memory deps ${JSON.stringify(out.memory)}`,
      );
      for (const agent of AGENTS) {
        const c = cardOf(out, cardId("o", agent));
        check(same(c.cardFiles, baseCardFiles(agent)), listDiff(`${c.cardId}: card dir`, baseCardFiles(agent), c.cardFiles));
        check(c.lines.length === 0, `${c.cardId}: stderr ${JSON.stringify(c.lines)}`);
        check(c.memoryProposed === null, `${c.cardId}: record carries memoryProposed`);
        check(same(c.skillNames ?? [], [REPORT_SKILL]), listDiff(`${c.cardId}: card copy skills`, [REPORT_SKILL], c.skillNames ?? []));
        check(c.resultOutput === reportW(agent), `${c.cardId}: delivered text changed · ${resultText(c)}`);
        check(readEntries(agent) === pre[agent], `${agent}: entries.jsonl changed`);
      }
      return `card dir = ${JSON.stringify(baseCardFiles("claude"))} (+ prompt.txt for grok) · no notes.md · no stderr · store unchanged`;
    });

    step("⑨ every card — prompt-1.json v3 · system sha = HEADLESS_WORKER_HINT · WORK new entries 0 (C3 ⑩ · R62-H1)", () => {
      check(allCards.length > 0, "no dispatched cards");
      for (const c of allCards) {
        check(
          c.record.read === "ok",
          `${c.cardId}: prompt-1.json ${c.record.read}${c.record.reason === null ? "" : ` — ${c.record.reason}`}`,
        );
        check(c.record.version === 3, `${c.cardId}: prompt-1.json version ${c.record.version} (want 3)`);
        check(
          c.record.systemSha256 === c.record.hintSha256,
          `${c.cardId}: system sha256 ${c.record.systemSha256} ≠ HEADLESS_WORKER_HINT ${c.record.hintSha256}`,
        );
        check(
          c.record.wantSystemIds.length === 6 && same(c.record.systemIds, c.record.wantSystemIds),
          listDiff(`${c.cardId}: system section ids`, c.record.wantSystemIds, c.record.systemIds),
        );
        check(c.workFiles.incomplete === null, `${c.cardId}: WORK scan incomplete: ${c.workFiles.incomplete}`);
        const added = newWorkFiles(c);
        check(added.length === 0, `${c.cardId}: new WORK entries ${JSON.stringify(added)}`);
      }
      return `${allCards.length} cards · v3 · system sha ${allCards[0]!.record.hintSha256.slice(0, 12)} · WORK new entries 0`;
    });
  }
} finally {
  cleanup();
}

// ---------------------------------------------------------------------------------------------
// zero persistence + real home
// ---------------------------------------------------------------------------------------------

step("zero persistence — temp home removed", () => {
  check(!existsSync(T), `${T} still exists`);
  return "removed";
});

step("real home untouched", () => {
  const diffs: string[] = [];
  STRICT_DIRS.forEach(([d, depth], i) => {
    const a = before.strict[i]!;
    const b = strictListing(join(REAL_HOME, d), depth);
    for (const [p, m] of a) {
      if (!b.has(p)) diffs.push(`gone ${p}`);
      else if (b.get(p) !== m) diffs.push(`mtime ${p}`);
    }
    for (const p of b.keys()) if (!a.has(p)) diffs.push(`new ${p}`);
  });
  NAMES_ONLY_DIRS.forEach((d, i) => {
    const a = before.names[i]!;
    for (const n of topNames(join(REAL_HOME, d))) if (!a.has(n)) diffs.push(`new ~/${d}/${n}`);
  });
  check(diffs.length === 0, diffs.slice(0, 10).join(" · "));
  const counts = before.strict.map((m) => m.size);
  return `~/.loom · ~/.fable ${counts[0]! + counts[1]!} entries · ~/Library/LaunchAgents ${counts[2]} entries names+mtime identical · ~/.claude · ~/.codex · ~/.grok no new names`;
});

if (realRows.length > 0) {
  console.log("\nReal CLI cards (UK-2 observation — record in MEMORY-WRITE-SMOKE-0380.md):");
  for (const r of realRows) {
    console.log(`card ${r.agent}: ${r.line || "(no memory_propose line)"}`);
    console.log(`  proposed ${r.proposed ?? "?"} · notes.md ${r.notes ? "exists" : "missing"}`);
    console.log(`  reply ${JSON.stringify(r.reply)}`);
    console.log(
      `  prompt-1.json ${r.record.read}${r.record.reason === null ? "" : ` (${r.record.reason})`} · v${r.record.version ?? "?"} · system sha256 ${r.record.systemSha256 === r.record.hintSha256 ? "= HEADLESS_WORKER_HINT" : `${r.record.systemSha256 ?? "(none)"} ≠ HEADLESS_WORKER_HINT ${r.record.hintSha256}`}`,
    );
    console.log(`  prompt-1.json sections ${JSON.stringify(r.record.sectionIds)}`);
    if (r.workIncomplete !== null) {
      console.log(`  WORK scan incomplete: ${r.workIncomplete} (outcome ⑥ cannot be judged — no ship)`);
    }
    console.log(`  WORK new entries ${r.newWork.length} ${JSON.stringify(r.newWork)}`);
    const d = r.diag;
    if (!d) {
      console.log("  diagnostics: (none)");
      continue;
    }
    console.log(`  spawn argv ${d.argv === null ? "(exec shim did not run)" : JSON.stringify(d.argv)}`);
    console.log(`  spawn cwd ${d.cwd ?? "(unknown)"}`);
    if (d.promptFile !== null) console.log(`  prompt.txt ${JSON.stringify(d.promptFile)}`);
    console.log(`  skill copy ${d.skillsRoot} (${d.skillFiles.length} entries)`);
    for (const f of d.skillFiles) console.log(`    ${f}`);
    console.log(`  transcript-1.jsonl events (${d.events.length}):`);
    for (const e of d.events) console.log(`    ${e}`);
    console.log(`  transcript-1.stderr head ${JSON.stringify(d.stderrHead)}`);
  }
  console.log("");
}

const failed = results.filter((r) => !r.ok);
console.log(
  `${failed.length === 0 ? "PASS" : "FAIL"} smoke:memory-write (${MODE} · ${SOURCE ? "source" : "dist"} CLI) — ${results.length - failed.length}/${results.length} steps`,
);
process.exit(failed.length === 0 ? 0 : 1);

// =============================================================================================
// inner process — HeadlessDispatcher under the child env (never the real home in default mode)
// =============================================================================================

async function inner(): Promise<void> {
  const [, , , stepName, outPath, modeArg, , agentsArg] = process.argv;
  const realAgents = (agentsArg ?? "")
    .split(",")
    .filter((a): a is Agent => (AGENTS as readonly string[]).includes(a));
  const mode: Mode = modeArg === "real-cli" ? "real-cli" : "default";
  const bad = guardError(process.env, mode);
  if (bad) {
    console.error(`inner guard (${mode}) — ${bad}`);
    process.exit(1);
  }
  if (process.env.LOOM_CARD !== undefined) {
    console.error("inner: LOOM_CARD must not reach the inner process");
    process.exit(1);
  }
  const T0 = process.env.LOOM_TEST_HOME!;
  if (!outPath || !resolve(outPath).startsWith(resolve(T0) + sep)) {
    console.error(`inner: out path ${outPath} not under LOOM_TEST_HOME`);
    process.exit(1);
  }
  const { loomDir } = await import("../packages/host/src/session-store");
  const { resolveBridgeProfile } = await import("../packages/host/src/bridge-spawn");
  const {
    bridgeConfigPath,
    enabledHeadlessAgents,
    headlessAgentCommands,
    loadBridgeConfig,
    workerConfigFromBridge,
  } = await import("../packages/host/src/bridge-config");
  const { effectiveWorkerPolicy, HEADLESS_WORKER_HINT } = await import("../packages/host/src/agent-argv");
  const hintSha256 = createHash("sha256").update(Buffer.from(HEADLESS_WORKER_HINT, "utf8")).digest("hex");
  const { readPromptRecord, PROMPT_RECORD_V3_SECTIONS } = await import("../packages/host/src/prompt-record");
  const wantSystemIds = PROMPT_RECORD_V3_SECTIONS.filter((s) => s.channel === "system").map((s) => s.id as string);
  const { policyGaps } = await import("../packages/host/src/policy-gaps");
  const { HeadlessDispatcher } = await import("../packages/host/src/headless-worker");
  const { cardSessionPath } = await import("../packages/host/src/card-session-store");

  const home = loomDir();
  if (!resolve(home).startsWith(resolve(T0) + sep)) {
    console.error(`inner: loomDir ${home} not under LOOM_TEST_HOME`);
    process.exit(1);
  }
  const dump = join(realpathSync(T0), "dump");
  const work = join(realpathSync(T0), "work");

  const profile = resolveBridgeProfile();
  const cfgPath = bridgeConfigPath(profile);
  if (!existsSync(cfgPath)) {
    console.error(`inner: no bridge config at ${cfgPath} (the outer writes it per step)`);
    process.exit(1);
  }
  // The bridge's own start path (bridge-runtime.ts ~886-910 · ~1138-1150): gaps, the forced-skill
  // start check (R4) and HeadlessDeps.memory with `cardWrites: true` only when configured.
  const cfg = loadBridgeConfig(profile);
  const config = workerConfigFromBridge(cfg);
  const enabled = enabledHeadlessAgents(config.maxConcurrent, cfg.agentArgv);
  const effective = effectiveWorkerPolicy(config).effective;
  const gaps = policyGaps(effective, enabled);
  if (cfg.worker?.memory?.cardWrites === true) {
    for (const a of enabled) {
      const allow = effective[a].skills.allow;
      if (allow !== null && !allow.includes(FORCED_SKILL)) {
        console.error(`inner: policy skills.allow does not include ${FORCED_SKILL} for ${a}`);
        process.exit(1);
      }
    }
  }
  const commands = headlessAgentCommands(cfg);
  if (mode === "real-cli") {
    // P5c: wrap each bin in a shim under T that records argv + cwd per LOOM_CARD, then `exec`s
    // the real bin with the same argv, stdin, env and cwd (the bridge config is unchanged).
    const q = (s: string) => `'${s.split("'").join(`'\\''`)}'`;
    for (const a of AGENTS) {
      const bin = commands[a].bin;
      const realBin = bin.includes("/") ? bin : (Bun.which(bin) ?? bin);
      const shimDir = join(dump, "shim", a);
      mkdirSync(shimDir, { recursive: true, mode: 0o700 });
      const shim = join(shimDir, a);
      writeFileSync(
        shim,
        `#!/bin/sh
out=${q(dump)}
pwd > "$out/cwd-$LOOM_CARD"
printf '%s\\0' ${q(realBin)} "$@" > "$out/argv-$LOOM_CARD"
exec ${q(realBin)} "$@"
`,
        { mode: 0o700 },
      );
      commands[a] = { bin: shim, args: commands[a].args };
    }
  }
  const memory =
    cfg.worker?.memory?.enabled === true
      ? {
          enabled: true,
          ...(cfg.worker.memory.cardWrites === true ? { cardWrites: true as const } : {}),
        }
      : undefined;

  const results: Array<{ cardId: string; status?: string; reason?: string; output?: string }> =
    [];
  const makeDispatcher = () =>
    new HeadlessDispatcher({
      config,
      loomDir: home,
      localPeerId: PEER,
      node: "smoke-node",
      profile,
      memory,
      policyGaps: gaps,
      commands,
      sink: {
        async composeAndSend(
          target: { cardId: string },
          fields: { status?: string; reason?: string; output?: string },
        ) {
          results.push({
            cardId: target.cardId,
            status: fields.status,
            reason: fields.reason,
            output: fields.output,
          });
          return { branch: "accepted", status: "delivered", recipientCount: 1 };
        },
      },
    } as unknown as ConstructorParameters<typeof HeadlessDispatcher>[0]);

  const stderrLines: string[] = [];
  const origWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: unknown, ...rest: unknown[]) => {
    for (const l of String(chunk).split("\n")) if (l !== "") stderrLines.push(l);
    return (origWrite as (...a: unknown[]) => boolean)(chunk, ...rest);
  }) as typeof process.stderr.write;
  const ours = (lines: string[], id: string) =>
    lines.filter(
      (l) =>
        (l.includes("[headless] memory_propose (") || l.includes("[headless] card_notes (")) &&
        l.includes(`(${id})`),
    );

  const keyOf = (p: { agent: Agent; roomId: string; cardId: string }) => ({
    loomDir: home,
    localPeerId: PEER,
    roomId: p.roomId,
    agent: p.agent,
    cardId: p.cardId,
  });
  const readRecord = (p: { agent: Agent; roomId: string; cardId: string }) => {
    const path = cardSessionPath(keyOf(p));
    return existsSync(path)
      ? (JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>)
      : {};
  };
  const proposedOf = (raw: Record<string, unknown>) =>
    Array.isArray(raw.memoryProposed) ? (raw.memoryProposed as string[]) : null;

  const plan: Array<{ agent: Agent; roomId: string; cardId: string }> = [];
  const each = (agents: readonly Agent[], room: string, tag: string) => {
    for (const agent of agents) plan.push({ agent, roomId: room, cardId: cardId(tag, agent) });
  };
  const rounds: RecoverRound[] = [];

  if (stepName === "recover") {
    // ② the ① cards, made to look like a crash before delivery (exited · unsent).
    const targets = AGENTS.map((agent) => ({ agent, roomId: ROOM_W, cardId: cardId("w", agent) }));
    for (const dropKey of [false, true]) {
      for (const p of targets) {
        const path = cardSessionPath(keyOf(p));
        const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
        raw.state = "exited";
        raw.resultSent = false;
        raw.completedHandoffIds = [];
        raw.sendAttempts = 0;
        delete raw.pendingResult;
        if (dropKey) delete raw.memoryProposed;
        writeFileSync(path, JSON.stringify(raw), { mode: 0o600 });
      }
      const mark = stderrLines.length;
      const d = makeDispatcher();
      await d.recover();
      await d.close();
      const lines = stderrLines.slice(mark);
      rounds.push({
        lines: targets.flatMap((p) => ours(lines, p.cardId)),
        memoryProposed: Object.fromEntries(targets.map((p) => [p.cardId, proposedOf(readRecord(p))])),
      });
    }
  } else if (stepName === "write") each(AGENTS, ROOM_W, "w");
  else if (stepName === "real") each(realAgents.length > 0 ? realAgents : AGENTS, ROOM_W, "r");
  else if (stepName === "cap") each(AGENTS, ROOM_C, "c");
  else if (stepName === "filter") each(AGENTS, ROOM_F, "f");
  else if (stepName === "next") each(["claude"], ROOM_W, "n");
  else if (stepName === "off") each(AGENTS, ROOM_O, "o");
  else throw new Error(`inner: unknown step ${stepName}`);

  const cards: InnerCardOut[] = [];
  const d = makeDispatcher();
  for (const p of plan) {
    const card = {
      roomId: p.roomId,
      cardId: p.cardId,
      agent: p.agent,
      prompt: mode === "default" ? PROMPT : REAL_PROMPT,
      fromPeerId: DISPATCHER,
      dispatchHandoffId: `ho_${p.cardId}`,
    };
    const mark = stderrLines.length;
    const workBefore = listTree(work);
    await d.dispatch(card);
    const workAfter = listTree(work);
    const sessionPath = cardSessionPath(keyOf(p));
    const dir = join(sessionPath, "..");
    const raw = readRecord(p);
    const read = (p2: string) => (existsSync(p2) ? readFileSync(p2, "utf8") : "");
    const sent =
      p.agent === "grok" ? read(join(dump, `promptfile-${p.cardId}`)) : read(join(dump, `stdin-${p.cardId}`));
    const notesPath = join(dir, NOTES);
    const skillsDir = join(dir, "skills", "plugin", "skills");
    const res = results.find((r) => r.cardId === p.cardId);
    // R12: the hardened validator (bounded regular-file read · shape · canonical bytes)
    const rr = readPromptRecord(dir, 1);
    const recSections = rr.kind === "ok" ? (rr.record.sections ?? []) : [];
    const record: InnerCardOut["record"] = {
      read: rr.kind,
      reason: rr.kind === "invalid" ? rr.reason : null,
      version: rr.kind === "ok" ? rr.record.version : null,
      systemSha256:
        rr.kind === "ok" ? createHash("sha256").update(Buffer.from(rr.record.system, "utf8")).digest("hex") : null,
      hintSha256,
      sectionIds: recSections.map((s) => `${s.channel}:${s.id}`),
      systemIds: recSections.filter((s) => s.channel === "system").map((s) => s.id as string),
      wantSystemIds,
    };
    const incomplete = workBefore.incomplete ?? workAfter.incomplete;
    cards.push({
      cardId: p.cardId,
      agent: p.agent,
      roomId: p.roomId,
      sent,
      file: existsSync(join(dir, SNAPSHOT)) ? readFileSync(join(dir, SNAPSHOT), "utf8") : null,
      cardFiles: existsSync(dir) ? readdirSync(dir).sort() : [],
      skillNames: existsSync(skillsDir) ? readdirSync(skillsDir).sort() : null,
      notes: existsSync(notesPath)
        ? { mode: statSync(notesPath).mode, text: readFileSync(notesPath, "utf8") }
        : null,
      memoryProposed: proposedOf(raw),
      resultStatus: res?.status ?? null,
      resultReason: res?.reason ?? null,
      resultOutput: res?.output ?? null,
      lines: ours(stderrLines.slice(mark), p.cardId),
      diag: mode === "real-cli" ? cardDiag(dir, dump, p.cardId) : null,
      record,
      workFiles: { before: workBefore.files, after: workAfter.files, incomplete },
    });
  }
  await d.close();
  process.stderr.write = origWrite;
  const out: InnerOut = { profile, loomDir: home, memory: memory ?? null, cards, rounds };
  writeFileSync(outPath, JSON.stringify(out), { mode: 0o600 });
}

// =============================================================================================
// real-cli diagnostics (P5c) — function declarations only: the inner calls them before the
// outer's module-level constants are initialised. No env values are read or printed.
// =============================================================================================

/**
 * PLAN 0.43.0 R62-H1: sorted relative paths under `root` (recursive, symlinks never followed at any
 * depth). The root is `lstat`ed first — not a real directory (symlink · file · missing) → no
 * traversal and `incomplete` is set; any directory-read or entry-`lstat` error (other than an entry
 * vanishing) also sets `incomplete`. Only `incomplete === null` means the listing is complete, so an
 * empty `files` is "complete and empty" only then.
 */
function listTree(root: string): { files: string[]; incomplete: string | null } {
  const errCode = (e: unknown) => (e as NodeJS.ErrnoException)?.code ?? String(e);
  try {
    const st = lstatSync(root);
    if (!st.isDirectory()) {
      return { files: [], incomplete: st.isSymbolicLink() ? "WORK root is a symlink" : "WORK root is not a directory" };
    }
  } catch (e) {
    return { files: [], incomplete: `WORK root ${errCode(e)}` };
  }
  const out: string[] = [];
  let incomplete: string | null = null;
  const walk = (d: string, rel: string) => {
    let names: string[];
    try {
      names = readdirSync(d);
    } catch (e) {
      incomplete ??= `${errCode(e)}${rel === "" ? "" : ` at ${rel}`}`;
      return;
    }
    for (const n of names) {
      const r = rel === "" ? n : `${rel}/${n}`;
      out.push(r);
      let st: ReturnType<typeof lstatSync>;
      try {
        st = lstatSync(join(d, n));
      } catch (e) {
        // vanished between readdir and lstat: listed by name only; any other error → incomplete
        if (errCode(e) !== "ENOENT") incomplete ??= `${errCode(e)} at ${r}`;
        continue;
      }
      if (st.isDirectory()) walk(join(d, n), r);
    }
  };
  walk(root, "");
  return { files: out.sort(), incomplete };
}

function clip(v: unknown, n: number): string {
  const s = typeof v === "string" ? v : (JSON.stringify(v) ?? String(v));
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function cardDiag(dir: string, dump: string, id: string): CardDiag {
  const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : null);
  const argvRaw = read(join(dump, `argv-${id}`));
  const argv =
    argvRaw === null
      ? null
      : argvRaw
          .split("\0")
          .slice(0, -1)
          .map((a) => clip(a, 2000));
  const skillsRoot = join(dir, "skills");
  const skillFiles: string[] = [];
  const walk = (d: string, rel: string) => {
    let names: string[];
    try {
      names = readdirSync(d).sort();
    } catch {
      return;
    }
    for (const n of names) {
      if (skillFiles.length >= 300) return;
      const p = join(d, n);
      const r = rel === "" ? n : `${rel}/${n}`;
      try {
        const st = lstatSync(p);
        if (st.isDirectory()) {
          skillFiles.push(`${r}/`);
          walk(p, r);
        } else skillFiles.push(`${r}  ${st.isSymbolicLink() ? "symlink" : `${st.size} B`}`);
      } catch {
        skillFiles.push(`${r}  (unreadable)`);
      }
    }
  };
  if (existsSync(skillsRoot)) walk(skillsRoot, "");
  else skillFiles.push("(absent)");
  const prompt = read(join(dir, "prompt.txt"));
  return {
    argv,
    cwd: read(join(dump, `cwd-${id}`))?.trim() ?? null,
    skillsRoot,
    skillFiles,
    promptFile: prompt === null ? null : clip(prompt, 2000),
    events: transcriptEvents(read(join(dir, "transcript-1.jsonl")) ?? ""),
    stderrHead: (read(join(dir, "transcript-1.stderr")) ?? "").slice(0, 1500),
  };
}

/** Tool / command events in order; other events by `type` only (runs of the same type collapsed). */
function transcriptEvents(raw: string): string[] {
  const out: string[] = [];
  let lastBare: string | null = null;
  let bareCount = 0;
  const flush = () => {
    if (lastBare !== null) out.push(bareCount > 1 ? `${lastBare} ×${bareCount}` : lastBare);
    lastBare = null;
    bareCount = 0;
  };
  const bare = (t: string) => {
    if (t === lastBare) bareCount += 1;
    else {
      flush();
      lastBare = t;
      bareCount = 1;
    }
  };
  const push = (s: string) => {
    flush();
    out.push(s);
  };
  const obj = (v: unknown): Record<string, unknown> | null =>
    v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  for (const line of raw.split("\n")) {
    if (line.trim() === "") continue;
    let e: Record<string, unknown> | null;
    try {
      e = obj(JSON.parse(line));
    } catch {
      push(`(non-JSON line) ${JSON.stringify(clip(line, 200))}`);
      continue;
    }
    if (!e) {
      bare("(non-object event)");
      continue;
    }
    const type = typeof e.type === "string" ? e.type : "(no type)";
    // codex exec --json: item.started / item.updated / item.completed carry `item`.
    const item = obj(e.item);
    if (item) {
      const it = typeof item.type === "string" ? item.type : "(no item type)";
      if (it === "command_execution") {
        push(
          `${type} command_execution status=${String(item.status)} exit_code=${String(item.exit_code)} command=${JSON.stringify(clip(item.command ?? "", 2000))} output=${JSON.stringify(clip(item.aggregated_output ?? "", 400))}`,
        );
      } else if (it === "agent_message" || it === "reasoning") {
        push(`${type} ${it} ${JSON.stringify(clip(item.text ?? "", 400))}`);
      } else {
        push(`${type} ${it} ${clip(item, 400)}`);
      }
      continue;
    }
    // claude stream-json: assistant tool_use / user tool_result blocks inside message.content.
    const content = obj(e.message)?.content;
    if (Array.isArray(content) && (type === "assistant" || type === "user")) {
      let any = false;
      for (const b of content) {
        const blk = obj(b);
        if (blk?.type === "tool_use") {
          push(`${type} tool_use ${String(blk.name)} ${clip(blk.input ?? null, 400)}`);
          any = true;
        } else if (blk?.type === "tool_result") {
          push(`${type} tool_result is_error=${String(blk.is_error ?? false)} ${clip(blk.content ?? "", 400)}`);
          any = true;
        }
      }
      if (!any) bare(type);
      continue;
    }
    if (type === "system" && typeof e.subtype === "string") {
      bare(`system ${e.subtype}`);
      continue;
    }
    // grok / other: tool- and error-shaped events in full (clipped), the rest by type.
    if (/tool|command|exec|error|fail/i.test(type)) push(`${type} ${clip(e, 400)}`);
    else bare(type);
  }
  flush();
  return out;
}
