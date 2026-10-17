/**
 * PLAN 0.41.0 P2 (tests-first) — the per-attempt prompt record wired into the headless spawn
 * (D2 · D3 · D4 · D7 · D8 · R1 · R4 · R6 · R7 · R60-M1 · R60-M2 · class "record ≠ spawn proof").
 *
 * Fake CLI = a /bin/sh script that dumps its argv (NUL-separated) and stdin to files, copies
 * grok's `--prompt-file`, and prints a minimal finished stream (headless-card-prompt-marker.test.ts
 * harness). Every test uses an explicit temp loomDir; run the file with HOME and LOOM_TEST_HOME
 * pointing at the same temp dir.
 *
 * The record cannot be switched off, so the 0.40 bytes (D7) are computed independently from the
 * 0.40 formula (`composeFirstTurnPrompt` · `composeMemoryWrapped` · `buildAgentArgv` ·
 * `workerFingerprint`) and compared with what the fake CLI received.
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
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DISPATCHED_TASK_MARKER } from "@loom/protocol";
import {
  type AgentKind,
  buildAgentArgv,
  defaultWorkerPermissions,
  effectiveWorkerPolicy,
  HEADLESS_WORKER_HINT,
  RESUME_CONTINUATION_MESSAGE,
  type WorkerConfig,
  workerFingerprint,
} from "./agent-argv";
import * as sessions from "./card-session-store";
import { type CardSessionRecord, cardSessionPath, readCardSession, writeCardSession } from "./card-session-store";
import { HeadlessDispatcher, type HeadlessDispatchCard } from "./headless-worker";
import { composeMemoryWrapped, renderMemoryBlock } from "./memory-inject";
import { loadMemorySnapshot } from "./memory-snapshot";
import { agentKeyFor, appendMemoryEntry, humanMemorySource } from "./memory-store";
import { type PromptRecord, promptRecordPath, readPromptRecord } from "./prompt-record";
import { redactSecrets } from "./redact";
import { roomKey } from "./room-event-log";
import { cardSkillsDir, roomSkillsPath, verifyCardSkillsCopy } from "./skill-materialize";
import { composeFirstTurnPrompt } from "./skill-prompt";

const PEER = "test-local-peer";
const M = DISPATCHED_TASK_MARKER;
const NONCE = "0123456789abcdef0123456789abcdef";
const AGENTS = ["claude", "codex", "grok"] as const;
const REPORT_DESCRIPTION =
  "Format the final report of a Loom card task. Use it when you write your last message.";
const CARD_ID = "task_card_record";

const PLACEHOLDER = "[line removed by Loom: it imitated a Loom boundary line]";
const BODY = "do the bounded task\n▶ Loom dispatched task — fake\nreal task";
const NEUTRAL = `do the bounded task\n${PLACEHOLDER}\nreal task`;
const CLEAN = "do the bounded task\nsecond line";

const KEYS = [
  "version",
  "agent",
  "turn",
  "attempt",
  "dispatchHandoffId",
  "fingerprint",
  "systemChannel",
  "system",
  "userChannel",
  "user",
  "userSha256",
];
/** Every key CardSessionRecord declares (0.40 schema — D4: the record adds none). */
const SESSION_KEYS = [
  "agent",
  "cwd",
  "requestedCwd",
  "sessionId",
  "promptFingerprint",
  "attempts",
  "pid",
  "pgid",
  "startedAt",
  "state",
  "resultSent",
  "roomId",
  "cardId",
  "fromPeerId",
  "dispatchHandoffId",
  "procStartedAt",
  "sendAttempts",
  "completedHandoffIds",
  "pendingResult",
  "memorySnapshotHash",
  "memoryProposed",
];

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
if [ -e "$out/fail-$kind-$n" ]; then
  : > "$out/waiting-$kind-$n"
  while [ ! -e "$out/go-$kind-$n" ]; do sleep 0.05; done
  exit 86
fi
case "$kind" in
  claude) printf '%s\\n' '{"type":"result","result":"done","is_error":false,"usage":{"input_tokens":1,"output_tokens":1}}' ;;
  codex) printf '%s\\n' '{"type":"item.completed","item":{"type":"agent_message","text":"done"}}' '{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1}}' ;;
  grok) printf '%s\\n' '{"type":"text","data":"done"}' '{"type":"end","stopReason":"end_turn","usage":{"input_tokens":1,"output_tokens":1}}' ;;
esac
`;

type Extra = { memory?: { enabled: boolean }; memoryNonce?: () => string };
type Fields = { reason?: string; status?: string; output?: string; note?: string };

const harnesses: Harness[] = [];

class Harness {
  readonly root = realpathSync(mkdtempSync(join(tmpdir(), "loom-prompt-record-")));
  readonly loomDir = join(this.root, "home", ".loom");
  readonly cwd = join(this.root, "work");
  readonly other = join(this.root, "other");
  readonly out = join(this.root, "dump");
  readonly script = join(this.root, "fake.sh");
  readonly config: WorkerConfig;
  readonly calls: Array<{ fields: Fields }> = [];
  readonly dispatchers: HeadlessDispatcher[] = [];
  card: HeadlessDispatchCard;

  constructor(agent: AgentKind, prompt: string, skills: boolean) {
    for (const d of [this.loomDir, this.cwd, this.other, this.out]) mkdirSync(d, { recursive: true });
    writeFileSync(this.script, FAKE_SH, { mode: 0o700 });
    this.config = {
      backend: "headless",
      cwd: this.cwd,
      allowedRoots: [this.root],
      maxConcurrent: { claude: 1, codex: 1, grok: 1 },
      timeoutMs: 30_000,
      permissions: defaultWorkerPermissions(),
      ...(skills ? { skills: { enabled: true } } : {}),
    } as WorkerConfig;
    this.card = {
      roomId: "room_beta",
      cardId: CARD_ID,
      agent,
      prompt,
      fromPeerId: "original-peer",
      dispatchHandoffId: "original-handoff",
    };
    harnesses.push(this);
  }

  key() {
    return {
      loomDir: this.loomDir,
      localPeerId: PEER,
      roomId: this.card.roomId,
      agent: this.card.agent,
      cardId: this.card.cardId,
    };
  }
  cardDir(): string {
    return dirname(cardSessionPath(this.key()));
  }
  saved(): CardSessionRecord | null {
    return readCardSession(this.key());
  }
  savedRaw(): Record<string, unknown> {
    return JSON.parse(readFileSync(cardSessionPath(this.key()), "utf8")) as Record<string, unknown>;
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
        composeAndSend: async (_target: unknown, fields: Fields) => {
          this.calls.push({ fields });
          return { status: "delivered" };
        },
      },
      ...extra,
    };
    const d = new HeadlessDispatcher(deps as ConstructorParameters<typeof HeadlessDispatcher>[0]);
    this.dispatchers.push(d);
    return d;
  }
  spawns(): number {
    return readdirSync(this.out).filter((n) => n.startsWith(`stdin-${this.card.agent}-`)).length;
  }
  stdinBytes(n = 1): Buffer {
    return readFileSync(join(this.out, `stdin-${this.card.agent}-${n}`));
  }
  argv(n = 1): string[] {
    const raw = readFileSync(join(this.out, `argv-${this.card.agent}-${n}`), "utf8");
    return raw.split("\0").slice(0, -1);
  }
  /** The exact bytes the agent was given: stdin, or grok's --prompt-file. */
  sentBytes(n = 1): Buffer {
    return this.card.agent === "grok"
      ? readFileSync(join(this.out, `promptfile-grok-${n}`))
      : this.stdinBytes(n);
  }
  sent(n = 1): string {
    return this.sentBytes(n).toString("utf8");
  }
  /** The system-channel value as the fake CLI saw it in argv (R2). */
  systemFromArgv(n = 1): string {
    const argv = this.argv(n);
    if (this.card.agent === "codex") {
      const el = argv.filter((a) => a.startsWith("developer_instructions="));
      expect(el).toHaveLength(1);
      return el[0]!.slice("developer_instructions=".length);
    }
    const flag = this.card.agent === "claude" ? "--append-system-prompt" : "--rules";
    const at = argv.indexOf(flag);
    expect(at).toBeGreaterThanOrEqual(0);
    return argv[at + 1]!;
  }
  expectedArgv(sessionId: string, resumeSessionId?: string, pluginDir?: string): string[] {
    const agent = this.card.agent;
    return buildAgentArgv({
      agent,
      cwd: this.cwd,
      sessionId,
      resumeSessionId,
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
  /** Listing for selectSkills(["loom-card-report", "missing-one"]). */
  listing(): string {
    if (this.card.agent === "claude") {
      return "Unavailable skills:\n- missing-one: unavailable: not installed";
    }
    const md = join(cardSkillsDir(this.key()), "plugin", "skills", "loom-card-report", "SKILL.md");
    return [
      "Available skills — Loom copied these for this card outside the working directory. Reading the SKILL.md files listed here is allowed; do not modify them. Read the SKILL.md before use:",
      `- loom-card-report: ${REPORT_DESCRIPTION} — ${md}`,
      "- missing-one: unavailable: not installed",
    ].join("\n");
  }
  seedStore(): void {
    const agentKey = agentKeyFor("default", this.card.agent);
    const dir = join(this.loomDir, "memory", agentKey);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(join(dir, "persona.md"), "I am the careful persona.\n", { mode: 0o600 });
    const r = appendMemoryEntry(
      this.loomDir,
      agentKey,
      {
        body: "use bun for every script",
        type: "fact",
        appliesTo: "project",
        status: "active",
        supersedes: null,
        source: humanMemorySource("owner"),
      },
      { env: {} },
    );
    if (!r.ok) throw new Error(`seed add failed: ${r.message}`);
  }
  expectedBlock(): string {
    const snap = loadMemorySnapshot(
      this.loomDir,
      agentKeyFor("default", this.card.agent),
      roomKey(this.card.roomId),
    );
    return renderMemoryBlock(redactSecrets(snap.text, process.env), NONCE).block;
  }
  async manifestHash(): Promise<string> {
    if (this.config.skills?.enabled !== true) return "";
    const v = await verifyCardSkillsCopy(this.key());
    if (!v.ok) throw new Error(`card copy not ok: ${v.reason}`);
    return v.manifestHash;
  }
  /** A dead-pid running record with an unfinished transcript (recover() → resume). */
  seedDead(): CardSessionRecord {
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
      pid: 2_000_000_000,
      pgid: 2_000_000_000,
      startedAt: new Date().toISOString(),
      state: "running",
      resultSent: false,
      procStartedAt: "Thu Oct 15 00:00:00 2026",
      sendAttempts: 0,
      completedHandoffIds: [],
    };
    writeCardSession({ loomDir: this.loomDir, localPeerId: PEER }, record);
    writeFileSync(join(this.cardDir(), "transcript-1.jsonl"), "");
    return record;
  }
  recordPath(n: number): string {
    return promptRecordPath(this.cardDir(), n);
  }
  record(n: number): PromptRecord {
    const r = readPromptRecord(this.cardDir(), n);
    if (r.kind !== "ok") throw new Error(`prompt-${n}.json: ${r.kind}${r.kind === "invalid" ? ` ${r.reason}` : ""}`);
    return r.record;
  }
  failAt(n = 1): void {
    writeFileSync(join(this.out, `fail-${this.card.agent}-${n}`), "");
  }
  async whileParked(n = 1, during?: () => void): Promise<void> {
    await waitFor(() => existsSync(join(this.out, `waiting-${this.card.agent}-${n}`)));
    during?.();
    writeFileSync(join(this.out, `go-${this.card.agent}-${n}`), "");
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

let stderrLines: string[] = [];
async function withStderr(fn: () => Promise<void>): Promise<void> {
  stderrLines = [];
  const spy = spyOn(process.stderr, "write").mockImplementation(((chunk: unknown) => {
    stderrLines.push(String(chunk));
    return true;
  }) as typeof process.stderr.write);
  try {
    await fn();
  } finally {
    spy.mockRestore();
  }
}
function recordLines(): string[] {
  return stderrLines.filter((l) => l.includes("prompt_record"));
}
const sha256 = (b: Buffer): string => createHash("sha256").update(b).digest("hex");

afterEach(async () => {
  while (harnesses.length > 0) await harnesses.pop()!.close();
});

const ON = { memory: { enabled: true }, memoryNonce: () => NONCE } satisfies Extra;

/** Record ↔ what the fake CLI received for spawn n (D8). */
function expectRecordMatchesSpawn(h: Harness, rec: PromptRecord, n: number): void {
  expect(rec.system).toBe(h.systemFromArgv(n));
  expect(rec.system).toBe(HEADLESS_WORKER_HINT);
  const bytes = h.sentBytes(n);
  expect(Buffer.from(rec.user, "utf8").equals(bytes)).toBe(true);
  expect(rec.userSha256).toBe(sha256(bytes));
  if (h.card.agent === "grok") expect(h.stdinBytes(n).length).toBe(0);
}

// ---------------------------------------------------------------------------
// first turn: record = the bytes the fake CLI received (D2 · D7 · D8 · R1 · R6)
// ---------------------------------------------------------------------------

describe("P2 first turn: prompt-1.json = what the CLI received (D2 · D7 · D8)", () => {
  for (const agent of AGENTS) {
    test(`${agent} listing · fence on · neutralised body`, async () => {
      const h = new Harness(agent, BODY, true);
      h.selectSkills(["loom-card-report", "missing-one"]);
      h.seedStore();
      const F = h.expectedBlock();
      await withStderr(() => h.dispatcher(ON).dispatch(h.card));
      expect(h.spawns()).toBe(1);
      const saved = h.saved()!;
      const raw = readFileSync(h.recordPath(1), "utf8");
      const rec = h.record(1);
      expect(Object.keys(rec)).toEqual(KEYS);
      expect(Object.keys(JSON.parse(raw))).toEqual(KEYS);
      expect(rec.version).toBe(1);
      expect(rec.agent).toBe(agent);
      expect(rec.turn).toBe("first");
      expect(rec.attempt).toBe(1);
      expect(rec.attempt).toBe(saved.attempts);
      expect(existsSync(join(h.cardDir(), `transcript-${rec.attempt}.jsonl`))).toBe(true);
      expect(rec.dispatchHandoffId).toBe(saved.dispatchHandoffId);
      expect(rec.dispatchHandoffId).toBe("original-handoff");
      expect(rec.fingerprint).toBe(saved.promptFingerprint);
      expect("userArgv" in rec).toBe(false);
      expectRecordMatchesSpawn(h, rec, 1);
      if (agent === "grok") {
        expect(readFileSync(join(h.cardDir(), "prompt.txt"), "utf8")).toBe(rec.user);
      }
      expect(statSync(h.recordPath(1)).mode & 0o777).toBe(0o600);
      expect(readdirSync(h.cardDir()).filter((n) => n.includes(".tmp."))).toEqual([]);
      // D7: the 0.40 bytes, computed independently.
      expect(h.sent(1)).toBe(composeFirstTurnPrompt(h.listing(), composeMemoryWrapped(NEUTRAL, F)));
      expect(h.sent(1)).toBe(`${h.listing()}\n\n${M}\n\n${F}\n\n${NEUTRAL}`);
      const pluginDir = agent === "claude" ? join(cardSkillsDir(h.key()), "plugin") : undefined;
      expect(h.argv(1)).toEqual(h.expectedArgv(saved.sessionId, undefined, pluginDir));
      expect(saved.promptFingerprint).toBe(
        workerFingerprint(h.config, await h.manifestHash(), saved.memorySnapshotHash ?? ""),
      );
      for (const k of Object.keys(h.savedRaw())) expect(SESSION_KEYS).toContain(k);
      // R7: success writes no prompt_record line.
      expect(recordLines()).toEqual([]);
      expect(h.calls).toHaveLength(1);
      expect(h.calls[0]!.fields.output).toBe("done");
    }, 20_000);
  }

  for (const agent of AGENTS) {
    test(`${agent} clean body, skills and memory off → 0.40 bytes, record = stdin / prompt.txt`, async () => {
      const h = new Harness(agent, CLEAN, false);
      await withStderr(() => h.dispatcher().dispatch(h.card));
      expect(h.sent(1)).toBe(`${M}\n\n${CLEAN}`);
      const rec = h.record(1);
      expectRecordMatchesSpawn(h, rec, 1);
      expect(rec.fingerprint).toBe(workerFingerprint(h.config, ""));
      expect(h.saved()!.promptFingerprint).toBe(workerFingerprint(h.config, ""));
      expect(h.argv(1)).toEqual(h.expectedArgv(h.saved()!.sessionId));
      expect(recordLines()).toEqual([]);
    }, 20_000);
  }
});

// ---------------------------------------------------------------------------
// resume: prompt-2.json (R4 · R3 userArgv · R60-M2 dispatchHandoffId)
// ---------------------------------------------------------------------------

describe("P2 resume: prompt-2.json = the resume bytes (R3 · R4 · R60-M2)", () => {
  for (const agent of AGENTS) {
    test(`${agent} unfinished first attempt → resume`, async () => {
      const h = new Harness(agent, BODY, true);
      h.selectSkills(["loom-card-report", "missing-one"]);
      h.seedStore();
      h.failAt(1);
      await withStderr(async () => {
        const pending = h.dispatcher(ON).dispatch(h.card);
        await h.whileParked(1);
        await pending;
      });
      expect(h.spawns()).toBe(2);
      const saved = h.saved()!;
      expect(saved.attempts).toBe(2);
      const first = h.record(1);
      expect(first.turn).toBe("first");
      expectRecordMatchesSpawn(h, first, 1);
      const rec = h.record(2);
      expect(rec.turn).toBe("resume");
      expect(rec.attempt).toBe(2);
      expect(existsSync(join(h.cardDir(), "transcript-2.jsonl"))).toBe(true);
      expect(rec.dispatchHandoffId).toBe("original-handoff");
      expect(rec.dispatchHandoffId).toBe(saved.dispatchHandoffId);
      expect(rec.fingerprint).toBe(saved.promptFingerprint);
      expectRecordMatchesSpawn(h, rec, 2);
      expect(rec.user).toBe(`${RESUME_CONTINUATION_MESSAGE}\n\n${M}\n\n${NEUTRAL}`);
      if (agent === "codex") {
        expect(Object.keys(rec)).toEqual([...KEYS, "userArgv"]);
        expect(rec.userArgv).toBe(h.argv(2).at(-1)!);
        expect(rec.userArgv).toBe(RESUME_CONTINUATION_MESSAGE);
      } else {
        expect(Object.keys(rec)).toEqual(KEYS);
      }
      if (agent === "grok") {
        // prompt.txt is overwritten on resume; prompt-1.json keeps the first turn.
        expect(readFileSync(join(h.cardDir(), "prompt.txt"), "utf8")).toBe(rec.user);
        expect(first.user).not.toBe(rec.user);
      }
      const pluginDir = agent === "claude" ? join(cardSkillsDir(h.key()), "plugin") : undefined;
      expect(h.argv(2)).toEqual(h.expectedArgv(saved.sessionId, saved.sessionId, pluginDir));
      expect(statSync(h.recordPath(2)).mode & 0o777).toBe(0o600);
      expect(recordLines()).toEqual([]);
      expect(h.calls).toHaveLength(1);
      expect(h.calls[0]!.fields.output).toBe("done");
    }, 30_000);
  }
});

// ---------------------------------------------------------------------------
// D3 fail-open: a directory named prompt-1.json makes the rename fail
// ---------------------------------------------------------------------------

describe("P2 fail-open (D3 · R7)", () => {
  for (const agent of AGENTS) {
    test(`${agent} record write fails → one stderr line, spawn and result unchanged`, async () => {
      const h = new Harness(agent, CLEAN, false);
      mkdirSync(h.recordPath(1), { recursive: true, mode: 0o700 });
      await withStderr(() => h.dispatcher().dispatch(h.card));
      const lines = recordLines();
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatch(/^\[headless\] prompt_record \(task_card_record\): write failed E[A-Z]+\n$/);
      expect(h.spawns()).toBe(1);
      expect(h.sent(1)).toBe(`${M}\n\n${CLEAN}`);
      expect(statSync(h.recordPath(1)).isDirectory()).toBe(true);
      expect(readdirSync(h.cardDir()).filter((n) => n.includes(".tmp."))).toEqual([]);
      expect(h.calls).toHaveLength(1);
      expect(h.calls[0]!.fields.output).toBe("done");
      expect(h.saved()!.resultSent).toBe(true);
    }, 20_000);
  }
});

// ---------------------------------------------------------------------------
// R1 · R60-M1: written after the write-ahead, before the abandon / cwd / group_alive checks
// ---------------------------------------------------------------------------

describe("P2 write position (R1 · R60-M1 · record ≠ spawn proof)", () => {
  for (const agent of AGENTS) {
    test(`${agent} cwd re-check fails → record present · no transcript · cwd_denied`, async () => {
      const h = new Harness(agent, CLEAN, false);
      const link = join(h.root, "requested");
      symlinkSync(h.cwd, link);
      h.card = { ...h.card, cwd: link };
      const original = sessions.writeCardSessionAsync;
      let swapped = false;
      let recordAtWriteAhead: boolean | undefined;
      const write = spyOn(sessions, "writeCardSessionAsync").mockImplementation(async (opts, record) => {
        await original(opts, record);
        if (record.state === "spawning" && !swapped) {
          swapped = true;
          recordAtWriteAhead = existsSync(h.recordPath(record.attempts));
          unlinkSync(link);
          symlinkSync(h.other, link);
        }
      });
      try {
        await withStderr(() => h.dispatcher().dispatch(h.card));
      } finally {
        write.mockRestore();
      }
      expect(swapped).toBe(true);
      // After the write-ahead …
      expect(recordAtWriteAhead).toBe(false);
      // … and before the cwd re-check.
      expect(h.spawns()).toBe(0);
      expect(h.calls).toHaveLength(1);
      expect(h.calls[0]!.fields.reason).toBe("cwd_not_allowed");
      expect(h.calls[0]!.fields.note).toBe("cwd_changed_before_spawn");
      const rec = h.record(1);
      expect(rec.turn).toBe("first");
      expect(rec.user).toBe(`${M}\n\n${CLEAN}`);
      expect(rec.fingerprint).toBe(h.saved()!.promptFingerprint);
      expect(existsSync(join(h.cardDir(), "transcript-1.jsonl"))).toBe(false);
      expect(recordLines()).toEqual([]);
    }, 20_000);
  }

  test("source order: write-ahead → record write → abandon → cwd → group_alive → spawn, no await after abandon", () => {
    const src = readFileSync(join(import.meta.dir, "headless-worker.ts"), "utf8");
    const writeIdx = src.indexOf("writePromptRecord(");
    expect(writeIdx).toBeGreaterThan(0);
    expect(src.indexOf("writePromptRecord(", writeIdx + 1)).toBe(-1);
    const waIdx = src.lastIndexOf('state: "spawning"', writeIdx);
    const abandonIdx = src.indexOf('if (owner.abandoned) return { kind: "abandon" };', writeIdx);
    const cwdIdx = src.indexOf("resolveWorkerCwd(card.cwd", writeIdx);
    const groupIdx = src.indexOf("if (previous && processGroupAlive(previous.pgid)) {", writeIdx);
    const groupEnd = src.indexOf('return { kind: "group_alive", record };', groupIdx);
    const spawnIdx = src.indexOf("spawned = spawnDetachedWorker({", writeIdx);
    for (const i of [waIdx, abandonIdx, cwdIdx, groupIdx, groupEnd, spawnIdx]) expect(i).toBeGreaterThan(0);
    expect(waIdx).toBeLessThan(writeIdx);
    expect(writeIdx).toBeLessThan(abandonIdx);
    expect(abandonIdx).toBeLessThan(cwdIdx);
    expect(cwdIdx).toBeLessThan(groupIdx);
    expect(groupEnd).toBeLessThan(spawnIdx);
    // Nothing but the record write between the write-ahead and the abandon check.
    const between = src.slice(writeIdx, abandonIdx);
    expect(between).not.toContain("resolveWorkerCwd");
    expect(between).not.toContain("processGroupAlive");
    // :1996 invariant: on the spawn path, no await between the checks and spawnDetachedWorker
    // (the group_alive branch returns).
    const spawnPath = src.slice(abandonIdx, groupIdx) + src.slice(groupEnd, spawnIdx);
    expect(spawnPath).not.toMatch(/\bawait\b/);
  });
});

// ---------------------------------------------------------------------------
// D4 write-only: a garbage record never reaches resume / recovery
// ---------------------------------------------------------------------------

describe("P2 write-only (D4)", () => {
  for (const agent of AGENTS) {
    test(`${agent} garbage prompt-1.json before resume → resume normal`, async () => {
      const h = new Harness(agent, CLEAN, false);
      h.failAt(1);
      await withStderr(async () => {
        const pending = h.dispatcher().dispatch(h.card);
        await h.whileParked(1, () => writeFileSync(h.recordPath(1), "not json {{{", { mode: 0o600 }));
        await pending;
      });
      expect(h.spawns()).toBe(2);
      expect(h.sent(2)).toBe(`${RESUME_CONTINUATION_MESSAGE}\n\n${M}\n\n${CLEAN}`);
      expect(readFileSync(h.recordPath(1), "utf8")).toBe("not json {{{");
      const rec = h.record(2);
      expect(rec.turn).toBe("resume");
      expectRecordMatchesSpawn(h, rec, 2);
      expect(h.saved()!.attempts).toBe(2);
      expect(h.calls).toHaveLength(1);
      expect(h.calls[0]!.fields.output).toBe("done");
      expect(h.calls[0]!.fields.note ?? "").not.toContain("fingerprint_changed");
    }, 30_000);
  }

  for (const agent of AGENTS) {
    test(`${agent} garbage prompt-1.json · dead pid → recover() resumes, records prompt-2.json`, async () => {
      const h = new Harness(agent, CLEAN, false);
      const seeded = h.seedDead();
      writeFileSync(h.recordPath(1), "\u0000garbage", { mode: 0o600 });
      await withStderr(() => h.dispatcher().recover());
      expect(h.spawns()).toBe(1);
      expect(h.argv(1)).toContain("saved-session");
      expect(readFileSync(h.recordPath(1), "utf8")).toBe("\u0000garbage");
      const rec = h.record(2);
      expect(rec.turn).toBe("resume");
      expect(rec.attempt).toBe(2);
      expect(rec.dispatchHandoffId).toBe(seeded.dispatchHandoffId);
      expect(rec.fingerprint).toBe(seeded.promptFingerprint);
      expect(rec.user.startsWith(`${RESUME_CONTINUATION_MESSAGE}\n\n`)).toBe(true);
      expectRecordMatchesSpawn(h, rec, 1);
      expect(h.saved()!.attempts).toBe(2);
      expect(h.calls).toHaveLength(1);
      expect(h.calls[0]!.fields.output).toBe("done");
      expect(h.calls[0]!.fields.note ?? "").not.toContain("fingerprint_changed");
    }, 30_000);
  }

  test("readPromptRecord is referenced in packages/host/src production only by prompt-record.ts (and index.ts)", () => {
    const dir = import.meta.dir;
    const users = readdirSync(dir)
      .filter((n) => n.endsWith(".ts") && !n.endsWith(".test.ts"))
      .filter((n) => readFileSync(join(dir, n), "utf8").includes("readPromptRecord"))
      .sort();
    expect(users).toContain("prompt-record.ts");
    for (const n of users) expect(["index.ts", "prompt-record.ts"]).toContain(n);
  });
});

// ---------------------------------------------------------------------------
// UK-1 (non-blocking): one timing sample for a large first turn — logged, not asserted
// ---------------------------------------------------------------------------

describe("P2 UK-1 timing sample", () => {
  test("claude 60,000-character body · fence on", async () => {
    const big = `${"x".repeat(59_000)}\nend`;
    const h = new Harness("claude", big, false);
    h.seedStore();
    const t0 = performance.now();
    await withStderr(() => h.dispatcher(ON).dispatch(h.card));
    const ms = performance.now() - t0;
    const rec = h.record(1);
    expectRecordMatchesSpawn(h, rec, 1);
    console.log(`[UK-1] dispatch with record: ${ms.toFixed(1)} ms · record ${statSync(h.recordPath(1)).size} B`);
  }, 30_000);
});
