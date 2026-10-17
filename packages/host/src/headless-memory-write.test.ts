/**
 * PLAN 0.38.0 P3 — result path: parse → propose + notes.md + stderr (D5 · D6 · D11 · D13 · D14 ·
 * D15 · R9 · R13–R15 · R20 · R21 · R56-L3 · C2).
 *
 * Harness shape = 0.36 `headless-memory.test.ts`: a /bin/sh fake CLI dumps argv + stdin, then
 * prints `$out/stream-<kind>-<n>` when the test wrote one (else a minimal finished stream). Extra
 * per-attempt switches: `park-` (wait for `go-`), `hang-` (sleep after printing → timeout),
 * `fail-` (exit 86 after printing → unfinished). Every test uses an explicit temp loomDir; run the
 * file with HOME = LOOM_TEST_HOME = the same temp dir and LOOM_PROFILE=smoke (R22).
 */
import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { truncateTail, wrapDispatchedPrompt } from "@loom/protocol";
import {
  type AgentKind,
  buildAgentArgv,
  defaultWorkerPermissions,
  effectiveWorkerPolicy,
  HEADLESS_WORKER_HINT,
  type WorkerConfig,
  workerFingerprint,
} from "./agent-argv";
import {
  type CardSessionRecord,
  cardKeyHash,
  cardSessionPath,
  readCardSession,
  writeCardSession,
} from "./card-session-store";
import { HeadlessDispatcher, type HeadlessDispatchCard } from "./headless-worker";
import { agentKeyFor, appendMemoryEntry, humanMemorySource, memoryPaths } from "./memory-store";
import { redactSecrets } from "./redact";
import { roomKey } from "./room-event-log";
import { cardSkillsDir, roomSkillsPath, verifyCardSkillsCopy } from "./skill-materialize";

const PEER = "test-local-peer";
const NONCE = "0123456789abcdef0123456789abcdef";
const AGENTS = ["claude", "codex", "grok"] as const;
const REPORT_DESCRIPTION =
  "Format the final report of a Loom card task. Use it when you write your last message.";
const SECRET = "ghp_abcdefghijklmnopqrstuvwx1234";
const CARD_NOTES = "notes.md";

const sha16 = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

const FAKE_SH = `#!/bin/sh
kind="$1"; out="$2"; shift 2
n=1
while [ -e "$out/stdin-$kind-$n" ]; do n=$((n+1)); done
printf '%s\\0' "$@" > "$out/argv-$kind-$n"
cat > "$out/stdin-$kind-$n"
prev=""
for a in "$@"; do
  if [ "$prev" = "--prompt-file" ]; then cp "$a" "$out/promptfile-$kind-$n"; fi
  prev="$a"
done
if [ -e "$out/park-$kind-$n" ]; then
  : > "$out/waiting-$kind-$n"
  while [ ! -e "$out/go-$kind-$n" ]; do sleep 0.05; done
fi
if [ -e "$out/stream-$kind-$n" ]; then
  cat "$out/stream-$kind-$n"
else
  case "$kind" in
    claude) printf '%s\\n' '{"type":"result","result":"done","is_error":false,"usage":{"input_tokens":1,"output_tokens":1}}' ;;
    codex) printf '%s\\n' '{"type":"item.completed","item":{"type":"agent_message","text":"done"}}' '{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1}}' ;;
    grok) printf '%s\\n' '{"type":"text","data":"done"}' '{"type":"end","stopReason":"end_turn","usage":{"input_tokens":1,"output_tokens":1}}' ;;
  esac
fi
if [ -e "$out/hang-$kind-$n" ]; then exec sleep 30; fi
if [ -e "$out/fail-$kind-$n" ]; then exit 86; fi
`;

/** A finished stream whose parsed finalText is exactly `text`. */
function finishedStream(agent: AgentKind, text: string): string {
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

/** An unfinished claude stream (assistant text, no result event): finalText = `text`. */
function partialClaudeStream(text: string): string {
  return `${JSON.stringify({ type: "assistant", message: { id: "m1", content: [{ type: "text", text }] } })}\n`;
}

const BLOCK2 = [
  "LOOM-MEMORY-CANDIDATES",
  "- fact: the build uses bun",
  "- decision: keep the per-attempt cap at five",
  "LOOM-MEMORY-END",
].join("\n");

/** A report with two candidates and a secret outside the block (notes.md must redact it). */
const REPORT2 = ["Summary: did the task.", `token seen: ${SECRET}`, BLOCK2, "LOOM-REPORT-END"].join("\n");

const ZERO = "secret 0 · marker 0 · cap 0 · busy 0 · dup 0 · invalid 0";

type MemoryDeps = { enabled: boolean; cardWrites?: boolean };
type Extra = { memory?: MemoryDeps; profile?: string; memoryNonce?: () => string };
type Call = {
  fields: { reason?: string; status?: string; output?: string; note?: string; summary?: string; timedOut?: boolean };
  at: number;
};

const harnesses: Harness[] = [];

class Harness {
  readonly root = realpathSync(mkdtempSync(join(tmpdir(), "loom-mem-p3-")));
  readonly loomDir = join(this.root, "home", ".loom");
  readonly cwd = join(this.root, "work");
  readonly out = join(this.root, "dump");
  readonly script = join(this.root, "fake.sh");
  readonly config: WorkerConfig;
  readonly calls: Call[] = [];
  readonly dispatchers: HeadlessDispatcher[] = [];
  card: HeadlessDispatchCard = {
    roomId: "room_beta",
    cardId: "task_mem",
    agent: "claude",
    prompt: "do the bounded memory task",
    fromPeerId: "original-peer",
    dispatchHandoffId: "original-handoff",
  };

  constructor(opts: { skills?: boolean; timeoutMs?: number } = {}) {
    for (const d of [this.loomDir, this.cwd, this.out]) mkdirSync(d, { recursive: true });
    writeFileSync(this.script, FAKE_SH, { mode: 0o700 });
    this.config = {
      backend: "headless",
      cwd: this.cwd,
      allowedRoots: [this.root],
      maxConcurrent: { claude: 1, codex: 1, grok: 1 },
      timeoutMs: opts.timeoutMs ?? 30_000,
      permissions: defaultWorkerPermissions(),
      ...(opts.skills === undefined ? {} : { skills: { enabled: opts.skills } }),
    } as WorkerConfig;
    harnesses.push(this);
  }

  key(card: HeadlessDispatchCard = this.card) {
    return { loomDir: this.loomDir, localPeerId: PEER, roomId: card.roomId, agent: card.agent, cardId: card.cardId };
  }
  cardDir(card: HeadlessDispatchCard = this.card): string {
    return dirname(cardSessionPath(this.key(card)));
  }
  notesPath(): string {
    return join(this.cardDir(), CARD_NOTES);
  }
  saved(): CardSessionRecord | null {
    return readCardSession(this.key());
  }
  dispatcher(extra: Extra = {}): HeadlessDispatcher {
    const commands = Object.fromEntries(
      AGENTS.map((agent) => [agent, { bin: "/bin/sh", args: [this.script, agent, this.out] }]),
    ) as Record<AgentKind, { bin: string; args: string[] }>;
    const deps = {
      config: this.config,
      loomDir: this.loomDir,
      localPeerId: PEER,
      node: "bridge-node",
      commands,
      sink: {
        composeAndSend: async (_target: unknown, fields: Call["fields"]) => {
          this.calls.push({ fields, at: Date.now() });
          return { status: "delivered" };
        },
      },
      ...extra,
    };
    const d = new HeadlessDispatcher(deps as ConstructorParameters<typeof HeadlessDispatcher>[0]);
    this.dispatchers.push(d);
    return d;
  }
  stream(text: string, n = 1, agent: AgentKind = this.card.agent): void {
    writeFileSync(join(this.out, `stream-${agent}-${n}`), finishedStream(agent, text));
  }
  rawStream(body: string, n = 1, agent: AgentKind = this.card.agent): void {
    writeFileSync(join(this.out, `stream-${agent}-${n}`), body);
  }
  flag(kind: "park" | "hang" | "fail" | "go", n = 1, agent: AgentKind = this.card.agent): void {
    writeFileSync(join(this.out, `${kind}-${agent}-${n}`), "");
  }
  spawns(agent: AgentKind = this.card.agent): number {
    return readdirSync(this.out).filter((n) => n.startsWith(`stdin-${agent}-`)).length;
  }
  sent(agent: AgentKind = this.card.agent, n = 1): string {
    const name = agent === "grok" ? `promptfile-grok-${n}` : `stdin-${agent}-${n}`;
    return readFileSync(join(this.out, name), "utf8");
  }
  argv(agent: AgentKind = this.card.agent, n = 1): string[] {
    return readFileSync(join(this.out, `argv-${agent}-${n}`), "utf8").split("\0").slice(0, -1);
  }
  expectedArgv(agent: AgentKind, sessionId: string, pluginDir?: string): string[] {
    return buildAgentArgv({
      agent,
      cwd: this.cwd,
      sessionId,
      hint: HEADLESS_WORKER_HINT,
      prompt: this.card.prompt,
      promptFile: agent === "grok" ? join(this.cardDir(), "prompt.txt") : undefined,
      permissions: this.config.permissions,
      policy: effectiveWorkerPolicy(this.config).effective[agent],
      ...(pluginDir ? { pluginDir } : {}),
    }).argv;
  }
  selectSkills(names: string[]): void {
    const path = roomSkillsPath(this.loomDir, this.card.roomId);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ version: 1, skills: names }));
  }
  listing(agent: AgentKind): string {
    if (agent === "claude") return "Unavailable skills:\n- missing-one: unavailable: not installed";
    const md = join(cardSkillsDir(this.key()), "plugin", "skills", "loom-card-report", "SKILL.md");
    return [
      "Available skills — read the SKILL.md before use:",
      `- loom-card-report: ${REPORT_DESCRIPTION} — ${md}`,
      "- missing-one: unavailable: not installed",
    ].join("\n");
  }
  async copyNames(): Promise<string[]> {
    const v = await verifyCardSkillsCopy(this.key());
    if (!v.ok) throw new Error(`card copy not ok: ${v.reason}`);
    return v.manifest.map((e) => e.name);
  }
  entriesPath(profile = "work", agent: AgentKind = this.card.agent): string {
    return memoryPaths(this.loomDir, agentKeyFor(profile, agent)).entries;
  }
  entryLines(profile = "work", agent: AgentKind = this.card.agent): Record<string, unknown>[] {
    const p = this.entriesPath(profile, agent);
    if (!existsSync(p)) return [];
    return readFileSync(p, "utf8")
      .split("\n")
      .filter((l) => l.trim() !== "")
      .map((l) => JSON.parse(l) as Record<string, unknown>);
  }
  /** Every file under <loomDir>/memory (relative paths), [] when absent. */
  storeFiles(): string[] {
    const root = join(this.loomDir, "memory");
    if (!existsSync(root)) return [];
    const out: string[] = [];
    const walk = (dir: string, rel: string) => {
      for (const name of readdirSync(dir)) {
        const abs = join(dir, name);
        const r = rel ? `${rel}/${name}` : name;
        if (statSync(abs).isDirectory()) walk(abs, r);
        else out.push(r);
      }
    };
    walk(root, "");
    return out.sort();
  }
  seedActive(body: string, profile = "work"): void {
    const r = appendMemoryEntry(
      this.loomDir,
      agentKeyFor(profile, this.card.agent),
      { body, type: "fact", appliesTo: "project", status: "active", supersedes: null, source: humanMemorySource("owner") },
      { env: {} },
    );
    if (!r.ok) throw new Error(`seed failed: ${r.message}`);
  }
  seed(over: Partial<CardSessionRecord> = {}, transcript = ""): CardSessionRecord {
    const record: CardSessionRecord = {
      roomId: this.card.roomId,
      cardId: this.card.cardId,
      agent: this.card.agent,
      fromPeerId: this.card.fromPeerId,
      dispatchHandoffId: this.card.dispatchHandoffId,
      cwd: this.cwd,
      requestedCwd: null,
      sessionId: "saved-session",
      promptFingerprint: workerFingerprint(this.config, ""),
      attempts: 1,
      pid: 0,
      pgid: 0,
      startedAt: new Date().toISOString(),
      state: "exited",
      resultSent: false,
      procStartedAt: "",
      sendAttempts: 0,
      completedHandoffIds: [],
      ...over,
    };
    writeCardSession({ loomDir: this.loomDir, localPeerId: PEER }, record);
    writeFileSync(join(this.cardDir(), `transcript-${record.attempts}.jsonl`), transcript);
    return record;
  }
  /** Overwrite fields of the saved record (raw JSON); `undefined` deletes the key. */
  tamperRecord(fields: Record<string, unknown>): void {
    const path = cardSessionPath(this.key());
    const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined) delete raw[k];
      else raw[k] = v;
    }
    writeFileSync(path, JSON.stringify(raw), { mode: 0o600 });
  }
  /** Make the saved, delivered record look like a crash before delivery (exited · unsent). */
  unsend(extra: Record<string, unknown> = {}): void {
    this.tamperRecord({
      state: "exited",
      resultSent: false,
      pendingResult: undefined,
      completedHandoffIds: [],
      sendAttempts: 0,
      ...extra,
    });
  }
  async close(): Promise<void> {
    for (const d of this.dispatchers) await d.close();
    rmSync(this.root, { recursive: true, force: true });
  }
}

async function waitFor(pred: () => boolean, ms = 10_000): Promise<void> {
  const start = performance.now();
  while (!pred()) {
    if (performance.now() - start > ms) throw new Error("waitFor timeout");
    await Bun.sleep(20);
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

let stderrLines: string[] = [];
function captureStderr(): () => void {
  stderrLines = [];
  const spy = spyOn(process.stderr, "write").mockImplementation(((chunk: unknown) => {
    stderrLines.push(String(chunk));
    return true;
  }) as typeof process.stderr.write);
  return () => spy.mockRestore();
}
async function observed<T>(fn: () => Promise<T>): Promise<T> {
  const restore = captureStderr();
  try {
    return await fn();
  } finally {
    restore();
  }
}
function proposeLines(): string[] {
  return stderrLines.filter((l) => l.includes("memory_propose") || l.includes("card_notes"));
}
const line = (cardId: string, body: string) => `[headless] memory_propose (${cardId}): ${body}\n`;

afterEach(async () => {
  while (harnesses.length > 0) await harnesses.pop()!.close();
});

const ON = { memory: { enabled: true, cardWrites: true }, profile: "work", memoryNonce: () => NONCE } satisfies Extra;

// ---------------------------------------------------------------------------
// off = 0.37 bytes (D3 · R15)
// ---------------------------------------------------------------------------

describe("P3 cardWrites off = 0.37 first turn · argv · fingerprint · card dir · stderr · no store access (D3)", () => {
  const OFFS: Array<MemoryDeps | undefined> = [undefined, { enabled: false }, { enabled: false, cardWrites: false }];
  for (const off of OFFS) {
    for (const skills of [false, true] as const) {
      for (const agent of AGENTS) {
        test(`${agent} memory=${JSON.stringify(off)} skills=${skills}`, async () => {
          const h = new Harness(skills ? { skills: true } : {});
          h.card = { ...h.card, agent };
          if (skills) h.selectSkills(["loom-card-report", "missing-one"]);
          h.stream(REPORT2, 1, agent);
          await observed(() =>
            h.dispatcher({ ...(off ? { memory: off } : {}), profile: "work" }).dispatch(h.card),
          );
          const wrapped = wrapDispatchedPrompt(h.card.prompt);
          expect(h.sent(agent)).toBe(skills ? `${h.listing(agent)}\n\n${wrapped}` : wrapped);
          const record = h.saved()!;
          let manifestHash = "";
          if (skills) {
            const v = await verifyCardSkillsCopy(h.key());
            expect(v.ok).toBe(true);
            if (v.ok) {
              manifestHash = v.manifestHash;
              expect(v.manifest.map((e) => e.name)).toEqual(["loom-card-report"]);
            }
          }
          const pluginDir = skills && agent === "claude" ? join(cardSkillsDir(h.key()), "plugin") : undefined;
          expect(h.argv(agent)).toEqual(h.expectedArgv(agent, record.sessionId, pluginDir));
          expect(record.promptFingerprint).toBe(workerFingerprint(h.config, manifestHash));
          expect("memoryProposed" in record).toBe(false);
          const files = readdirSync(h.cardDir()).sort();
          expect(files).not.toContain(CARD_NOTES);
          const want = ["session.json", "transcript-1.jsonl", "transcript-1.stderr"];
          if (skills) want.push("skills");
          if (agent === "grok") want.push("prompt.txt");
          expect(files).toEqual(want.sort());
          expect(proposeLines()).toEqual([]);
          expect(h.storeFiles()).toEqual([]);
          // Delivered text unchanged (block stays in it).
          expect(h.calls.at(-1)!.fields.output).toBe(REPORT2);
        }, 20_000);
      }
    }
  }

  test("memory on, cardWrites false/absent: same first turn, files and stderr; the store is only read", async () => {
    const runs: Array<{ sent: string; files: string[]; fp: string; argv: string[]; lines: string[]; store: string }> = [];
    for (const memory of [{ enabled: true }, { enabled: true, cardWrites: false }] as MemoryDeps[]) {
      const h = new Harness({ skills: true });
      h.selectSkills(["loom-card-report"]);
      h.seedActive("use bun for every script");
      const before = readFileSync(h.entriesPath(), "utf8");
      h.stream(REPORT2);
      await observed(() => h.dispatcher({ memory, profile: "work", memoryNonce: () => NONCE }).dispatch(h.card));
      const record = h.saved()!;
      expect(readFileSync(h.entriesPath(), "utf8")).toBe(before);
      expect(await h.copyNames()).toEqual(["loom-card-report"]);
      const v = await verifyCardSkillsCopy(h.key());
      if (!v.ok) throw new Error(v.reason);
      // Entry ids are random per harness, so the snapshot hash differs; the inputs must not.
      expect(record.promptFingerprint).toBe(
        workerFingerprint(h.config, v.manifestHash, record.memorySnapshotHash ?? ""),
      );
      runs.push({
        sent: h.sent().replace(/mem_[0-9a-f]{16}/g, "<id>"),
        files: readdirSync(h.cardDir()).sort(),
        fp: v.manifestHash,
        argv: h.argv().map((a) => (a === record.sessionId ? "<sid>" : a.split(h.root).join("<root>"))),
        lines: proposeLines(),
        store: h.storeFiles().join(","),
      });
    }
    expect(runs[1]).toEqual(runs[0]!);
    expect(runs[0]!.files).not.toContain(CARD_NOTES);
    expect(runs[0]!.lines).toEqual([]);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// on: propose + notes.md + stderr + record key (D5 · D11 · D14 · D15 · R9 · R14 · R15)
// ---------------------------------------------------------------------------

describe("P3 cardWrites on: two candidates → proposed 2 · stderr · notes.md · memoryProposed", () => {
  for (const agent of AGENTS) {
    test(agent, async () => {
      const h = new Harness({ skills: true });
      h.card = { ...h.card, agent };
      h.selectSkills(["loom-card-report"]);
      h.stream(REPORT2, 1, agent);
      await observed(() => h.dispatcher(ON).dispatch(h.card));

      // forced skill on the first spawn (R5)
      expect(await h.copyNames()).toEqual(["loom-card-report", "loom-memory-candidates"]);

      const lines = h.entryLines("work", agent);
      expect(lines.length).toBe(2);
      const source = {
        kind: "card",
        room: roomKey(h.card.roomId),
        card: cardKeyHash(h.card.roomId, agent, h.card.cardId),
        handoff: sha16(h.card.dispatchHandoffId),
        attempt: 1,
        by: h.card.fromPeerId,
      };
      expect(lines.map((l) => [l.type, l.body, l.status, l.supersedes, l.appliesTo])).toEqual([
        ["fact", "the build uses bun", "proposed", null, `room:${roomKey(h.card.roomId)}`],
        ["decision", "keep the per-attempt cap at five", "proposed", null, `room:${roomKey(h.card.roomId)}`],
      ]);
      for (const l of lines) expect(l.source).toEqual(source);

      expect(proposeLines()).toEqual([line("task_mem", `proposed 2 · dropped 0 (${ZERO})`)]);

      // delivered text = output as-is (block included, secret not touched)
      const last = h.calls.at(-1)!.fields;
      expect(last.reason).toBe("needs_verification");
      expect(last.output).toBe(REPORT2);

      // notes.md: redacted copy, 0600
      const st = statSync(h.notesPath());
      expect(st.mode & 0o777).toBe(0o600);
      const notes = readFileSync(h.notesPath(), "utf8");
      expect(notes).toBe(truncateTail(redactSecrets(REPORT2, process.env), 200_000).text);
      expect(notes).not.toContain(SECRET);
      expect(notes).toContain("LOOM-MEMORY-CANDIDATES");

      expect(h.saved()!.memoryProposed).toEqual([`${sha16(h.card.dispatchHandoffId)}.1`]);
      // no store for other profiles
      expect(h.entryLines("default", agent)).toEqual([]);
    }, 20_000);
  }

  test("block absent → proposed 0 · dropped 0, no store access, notes.md still written", async () => {
    const h = new Harness();
    h.stream("plain report, no block");
    await observed(() => h.dispatcher(ON).dispatch(h.card));
    expect(proposeLines()).toEqual([line("task_mem", `proposed 0 · dropped 0 (${ZERO})`)]);
    expect(h.storeFiles()).toEqual([]);
    expect(readFileSync(h.notesPath(), "utf8")).toBe("plain report, no block");
  }, 20_000);

  test("drop counts: invalid · overflow → cap · secret · marker", async () => {
    const h = new Harness();
    const text = [
      "LOOM-MEMORY-CANDIDATES",
      "- fact: good one",
      `- fact: key is ${SECRET}`,
      "- fact: mentions LOOM-REPORT-END inside",
      "not a candidate line",
      "- decision: good two",
      "- preference: good three",
      "- fact: sixth → overflow",
      "LOOM-MEMORY-END",
    ].join("\n");
    h.stream(text);
    await observed(() => h.dispatcher(ON).dispatch(h.card));
    expect(proposeLines()).toEqual([
      line("task_mem", "proposed 3 · dropped 4 (secret 1 · marker 1 · cap 1 · busy 0 · dup 0 · invalid 1)"),
    ]);
    expect(h.entryLines().map((l) => l.body)).toEqual(["good one", "good two", "good three"]);
  }, 20_000);

  test("cardId CR/LF → spaces in the stderr line", async () => {
    const h = new Harness();
    h.card = { ...h.card, cardId: "task\r\nx" };
    h.stream("no block");
    await observed(() => h.dispatcher(ON).dispatch(h.card));
    expect(proposeLines()).toEqual([line("task  x", `proposed 0 · dropped 0 (${ZERO})`)]);
  }, 20_000);
});

// ---------------------------------------------------------------------------
// timeout · give-up (D5 · R15)
// ---------------------------------------------------------------------------

describe("P3 timeout and give-up: notes.md only, no candidates, no stderr line", () => {
  test("timeout → no proposal, no memory_propose line, notes.md = redacted raw transcript", async () => {
    const h = new Harness({ timeoutMs: 400 });
    h.rawStream(partialClaudeStream(REPORT2));
    h.flag("hang");
    // The spawn timer floors at 60 s; shorten that floor (headless-worker.test.ts form).
    const realSetTimeout = globalThis.setTimeout;
    const timer = spyOn(globalThis, "setTimeout").mockImplementation(((
      fn: Parameters<typeof setTimeout>[0],
      ms?: number,
      ...args: unknown[]
    ) => realSetTimeout(fn, ms === 60_000 ? 400 : ms, ...args)) as typeof setTimeout);
    try {
      await observed(() => h.dispatcher(ON).dispatch(h.card));
    } finally {
      timer.mockRestore();
    }
    const last = h.calls.at(-1)!.fields;
    expect(last.reason).toBe("timeout");
    expect(proposeLines()).toEqual([]);
    expect(h.storeFiles()).toEqual([]);
    const raw = readFileSync(join(h.cardDir(), "transcript-1.jsonl"), "utf8");
    expect(raw).toContain("LOOM-MEMORY-CANDIDATES");
    const notes = readFileSync(h.notesPath(), "utf8");
    expect(notes).toBe(truncateTail(redactSecrets(raw, process.env), 200_000).text);
    expect(notes).not.toContain(SECRET);
    expect(statSync(h.notesPath()).mode & 0o777).toBe(0o600);
    expect("memoryProposed" in h.saved()!).toBe(false);
  }, 30_000);

  test("give-up (attempts exhausted) → notes.md only", async () => {
    const h = new Harness();
    const t1 = ["attempt one", BLOCK2].join("\n");
    const t2 = ["attempt two", `secret ${SECRET}`, BLOCK2].join("\n");
    h.rawStream(partialClaudeStream(t1), 1);
    h.flag("fail", 1);
    h.rawStream(partialClaudeStream(t2), 2);
    h.flag("fail", 2);
    await observed(() => h.dispatcher(ON).dispatch(h.card));
    expect(h.spawns()).toBe(2);
    const last = h.calls.at(-1)!.fields;
    expect(last.reason).toBe("needs_verification");
    expect(last.note).toContain("attempts 2 exhausted");
    expect(proposeLines()).toEqual([]);
    expect(h.storeFiles()).toEqual([]);
    expect(readFileSync(h.notesPath(), "utf8")).toBe(redactSecrets(t2, process.env));
    expect(readFileSync(h.notesPath(), "utf8")).not.toContain(SECRET);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// idempotence (D11 · R9 · R20 · R56-L3)
// ---------------------------------------------------------------------------

describe("P3 reprocessing is idempotent (D11 · R9)", () => {
  test("exited-recovery reprocess (record exited · unsent · same transcript) → fast path dup, no store access", async () => {
    const h = new Harness();
    h.stream(REPORT2);
    await observed(() => h.dispatcher(ON).dispatch(h.card));
    const before = readFileSync(h.entriesPath(), "utf8");
    const mtime = statSync(h.entriesPath()).mtimeMs;
    h.unsend();
    await observed(() => h.dispatcher(ON).recover());
    expect(proposeLines()).toEqual([
      line("task_mem", "proposed 0 · dropped 2 (secret 0 · marker 0 · cap 0 · busy 0 · dup 2 · invalid 0)"),
    ]);
    expect(readFileSync(h.entriesPath(), "utf8")).toBe(before);
    expect(statSync(h.entriesPath()).mtimeMs).toBe(mtime);
    expect(existsSync(`${h.entriesPath()}.lock`)).toBe(false);
    expect(h.calls.length).toBe(2);
    expect(h.calls[1]!.fields.output).toBe(REPORT2);
    expect(h.saved()!.memoryProposed).toEqual([`${sha16(h.card.dispatchHandoffId)}.1`]);
  }, 30_000);

  test("crash after propose, before send (no record key) → store scan dup · lines unchanged · key written", async () => {
    const h = new Harness();
    h.stream(REPORT2);
    await observed(() => h.dispatcher(ON).dispatch(h.card));
    const before = readFileSync(h.entriesPath(), "utf8");
    h.unsend({ memoryProposed: undefined });
    await observed(() => h.dispatcher(ON).recover());
    expect(proposeLines()).toEqual([
      line("task_mem", "proposed 0 · dropped 2 (secret 0 · marker 0 · cap 0 · busy 0 · dup 2 · invalid 0)"),
    ]);
    expect(readFileSync(h.entriesPath(), "utf8")).toBe(before);
    expect(h.saved()!.memoryProposed).toEqual([`${sha16(h.card.dispatchHandoffId)}.1`]);
  }, 30_000);

  test("R56-L3: timeout, then the bridge dies before sending → exited-recovery (timedOut false) parses and proposes", async () => {
    const h = new Harness();
    // The partial transcript a timed-out attempt left behind; the record never got its result.
    h.seed({}, partialClaudeStream(REPORT2));
    await observed(() => h.dispatcher(ON).recover());
    expect(h.spawns()).toBe(0);
    const last = h.calls.at(-1)!.fields;
    expect(last.reason).toBe("needs_verification");
    expect(last.output).toBe(REPORT2);
    expect(proposeLines()).toEqual([line("task_mem", `proposed 2 · dropped 0 (${ZERO})`)]);
    expect(h.entryLines().map((l) => l.body)).toEqual([
      "the build uses bun",
      "keep the per-attempt cap at five",
    ]);
    expect(readFileSync(h.notesPath(), "utf8")).toBe(redactSecrets(REPORT2, process.env));
    expect(h.saved()!.memoryProposed).toEqual([`${sha16(h.card.dispatchHandoffId)}.1`]);
  }, 30_000);

  test("next handoff, same attempt 1 → new proposals", async () => {
    const h = new Harness();
    h.stream(REPORT2, 1);
    h.stream(REPORT2, 2);
    const d = h.dispatcher(ON);
    await observed(() => d.dispatch(h.card));
    const second = { ...h.card, dispatchHandoffId: "second-handoff" };
    await observed(() => d.dispatch(second));
    expect(proposeLines()).toEqual([line("task_mem", `proposed 2 · dropped 0 (${ZERO})`)]);
    const lines = h.entryLines();
    expect(lines.length).toBe(4);
    expect(lines.map((l) => (l.source as { handoff: string; attempt: number }).handoff)).toEqual([
      sha16("original-handoff"),
      sha16("original-handoff"),
      sha16("second-handoff"),
      sha16("second-handoff"),
    ]);
    expect(lines.every((l) => (l.source as { attempt: number }).attempt === 1)).toBe(true);
    // A fresh first spawn writes a new record; the store's dedupe still guards the old key.
    expect(h.saved()!.memoryProposed).toEqual([`${sha16("second-handoff")}.1`]);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// profile · busy · IO error (D13 · D12 · R13 · R21)
// ---------------------------------------------------------------------------

describe("P3 fail-open: no profile · busy · IO error never block delivery", () => {
  test("no profile → `skipped — no profile`, no store write, notes.md written", async () => {
    const h = new Harness();
    h.stream(REPORT2);
    await observed(() => h.dispatcher({ memory: { enabled: true, cardWrites: true }, memoryNonce: () => NONCE }).dispatch(h.card));
    expect(proposeLines()).toEqual([line("task_mem", "skipped — no profile")]);
    expect(h.storeFiles()).toEqual([]);
    expect(existsSync(h.notesPath())).toBe(true);
    expect("memoryProposed" in h.saved()!).toBe(false);
    expect(h.calls.at(-1)!.fields.output).toBe(REPORT2);
  }, 20_000);

  test("store lock held by a live owner → busy 2 · result delivered within the budget · no record key", async () => {
    const h = new Harness();
    h.seedActive("seed so the store exists");
    const lockDir = `${h.entriesPath()}.lock`;
    mkdirSync(lockDir);
    writeFileSync(join(lockDir, "owner.pid"), String(process.pid));
    h.stream(REPORT2);
    const before = readFileSync(h.entriesPath(), "utf8");
    await observed(() =>
      h.dispatcher({ memory: { enabled: false, cardWrites: true }, profile: "work" }).dispatch(h.card),
    );
    expect(proposeLines()).toEqual([
      line("task_mem", "proposed 0 · dropped 2 (secret 0 · marker 0 · cap 0 · busy 2 · dup 0 · invalid 0)"),
    ]);
    expect(readFileSync(h.entriesPath(), "utf8")).toBe(before);
    expect(existsSync(lockDir)).toBe(true);
    const exitedAt = statSync(join(h.cardDir(), "transcript-1.jsonl")).mtimeMs;
    const last = h.calls.at(-1)!;
    expect(last.fields.output).toBe(REPORT2);
    // ≤250 ms budget + bounded work; the synchronous CLI wait would be 4 s.
    expect(last.at - exitedAt).toBeLessThan(1_500);
    expect("memoryProposed" in h.saved()!).toBe(false);
  }, 20_000);

  test("store IO error → `failed — <message>` · result delivered · no record key", async () => {
    const h = new Harness();
    // The agent's store directory is a regular file: the store throws an IO-class error.
    const dir = dirname(h.entriesPath());
    mkdirSync(dirname(dir), { recursive: true });
    writeFileSync(dir, "not a directory");
    h.stream(REPORT2);
    await observed(() =>
      h.dispatcher({ memory: { enabled: false, cardWrites: true }, profile: "work" }).dispatch(h.card),
    );
    const lines = proposeLines();
    expect(lines.length).toBe(1);
    expect(lines[0]!.startsWith("[headless] memory_propose (task_mem): failed — ")).toBe(true);
    expect(lines[0]!.endsWith("\n")).toBe(true);
    const msg = lines[0]!.slice("[headless] memory_propose (task_mem): failed — ".length, -1);
    expect(msg.length).toBeGreaterThan(0);
    expect(msg.length).toBeLessThanOrEqual(200);
    expect(msg).not.toMatch(/[\r\n]/);
    expect(h.calls.at(-1)!.fields.output).toBe(REPORT2);
    expect("memoryProposed" in h.saved()!).toBe(false);
  }, 20_000);

  test("notes.md write failure → `card_notes … failed — …` line, delivery and propose continue", async () => {
    const h = new Harness();
    h.stream(REPORT2);
    // A directory named notes.md makes the rename fail.
    mkdirSync(join(h.cardDir(), CARD_NOTES), { recursive: true });
    mkdirSync(join(h.cardDir(), CARD_NOTES, "x"));
    await observed(() => h.dispatcher(ON).dispatch(h.card));
    const lines = proposeLines();
    expect(lines.length).toBe(2);
    expect(lines[0]!.startsWith("[headless] card_notes (task_mem): failed — ")).toBe(true);
    expect(lines[1]).toBe(line("task_mem", `proposed 2 · dropped 0 (${ZERO})`));
    expect(h.calls.at(-1)!.fields.output).toBe(REPORT2);
    expect(readdirSync(h.cardDir()).filter((n) => n.startsWith(".notes.md"))).toEqual([]);
  }, 20_000);
});

// ---------------------------------------------------------------------------
// C2: a card started with cardWrites off resumes from its copy after turning it on
// ---------------------------------------------------------------------------

describe("P3 C2 proof: cardWrites turned on mid-card → resume from the copy", () => {
  test("off first spawn → on + restart → resumed, no fingerprint_changed, no new skill", async () => {
    const h = new Harness({ skills: true });
    h.selectSkills(["loom-card-report"]);
    h.flag("park", 1);
    h.flag("fail", 1);
    h.rawStream("", 1); // attempt 1 prints nothing and exits unfinished
    const a = h.dispatcher({ memory: { enabled: true }, profile: "work", memoryNonce: () => NONCE });
    const running = observed(() => a.dispatch(h.card));
    await waitFor(() => existsSync(join(h.out, "waiting-claude-1")));
    const fpBefore = h.saved()!.promptFingerprint;
    const pid = h.saved()!.pid;
    expect(await h.copyNames()).toEqual(["loom-card-report"]);
    await a.close();
    await running;
    h.flag("go", 1);
    await waitFor(() => !alive(pid));

    await observed(() => h.dispatcher(ON).recover());
    expect(h.spawns()).toBe(2);
    expect(h.argv("claude", 2)).toContain("-r");
    expect(await h.copyNames()).toEqual(["loom-card-report"]);
    const record = h.saved()!;
    expect(record.attempts).toBe(2);
    expect(record.promptFingerprint).toBe(fpBefore);
    const last = h.calls.at(-1)!.fields;
    expect(last.note ?? "").not.toContain("fingerprint_changed");
    expect(last.summary).not.toBe("fingerprint changed");
    // The result path runs on the resumed attempt (cardWrites now on): no block → 0/0.
    expect(proposeLines()).toEqual([line("task_mem", `proposed 0 · dropped 0 (${ZERO})`)]);
  }, 40_000);
});
