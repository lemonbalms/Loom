/**
 * PLAN 0.42.0 P3 — `loom prompt show` sections block (D6 · D9 · R10 · R61-L4).
 *
 * In-process tests inject deps (fresh mkdtemp loomDir per test). Card sessions are seeded at the
 * real `cardSessionPath`; v2 records come from `buildPromptRecord` with the assembler's `sections`
 * (`assembleHeadlessPrompt`), v1 records from `buildPromptRecord` without them. Run with HOME and
 * LOOM_TEST_HOME pointing at a temp dir.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  assembleHeadlessPrompt,
  buildPromptRecord,
  cardSessionPath,
  type FencePartId,
  type PromptRecord,
  type PromptRecordSection,
  promptRecordPath,
  serializePromptRecord,
  writePromptRecord,
} from "@loom/host";
import { type PromptCliDeps, runPromptCommand } from "./prompt-cli";

type Agent = "claude" | "codex" | "grok";

const PEER = "p_prompt_sections_peer";
const CARD = "card-0042";
const ROOM = "room-a";
const DISPATCH = "h".repeat(16);
const OLD_DISPATCH = "o".repeat(16);
const FP = "b".repeat(64);
const STARTED = "2026-10-18T12:00:00.000Z";
const ALL_PARTS: FencePartId[] = ["policy-notice", "standing-rules", "memory-snapshot"];
const LISTING = "Unavailable skills:\n- missing-one: unavailable: not installed";
const FENCE = "<loom-memory nonce=0123>\nnotice line\n\nI am the persona.\n</loom-memory nonce=0123>";
const BODY = "Do the task ✓ 한글\nsecond line";

const REFUSAL =
  "loom prompt: refused — LOOM_CARD is set (this shell belongs to a Loom card worker); prompt records are for the operator.";
const V1_LINE = "sections: (not recorded — Loom 0.41.0 record)";
const ALL_PARTS_LINE = "    parts: policy-notice 0.37.0, standing-rules 0.37.0, memory-snapshot 0.36.0";

let L: string;

beforeEach(() => {
  L = mkdtempSync(join(tmpdir(), "loom-promptcli-sections-"));
});

afterEach(() => {
  rmSync(L, { recursive: true, force: true });
});

type Run = { code: number; out: string[]; err: string[]; bytes: Buffer; resolves: number };

function cli(over: { env?: Record<string, string | undefined> } = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const chunks: Buffer[] = [];
  let resolves = 0;
  const deps: PromptCliDeps = {
    env: over.env ?? {},
    resolve: () => {
      resolves += 1;
      return { loomDir: L, profile: "default", peerId: PEER };
    },
    stdout: (l) => out.push(l),
    stdoutBytes: (b) => chunks.push(Buffer.from(b)),
    stderr: (l) => err.push(l),
  };
  return async (positional: string[], flags: Record<string, string | boolean> = {}): Promise<Run> => {
    out.length = 0;
    err.length = 0;
    chunks.length = 0;
    resolves = 0;
    const code = await runPromptCommand("show", { positional }, flags, deps);
    return { code, out: [...out], err: [...err], bytes: Buffer.concat(chunks), resolves };
  };
}

/** A valid session.json at the real `cardSessionPath`; returns the card dir. */
function seedSession(s: { room?: string; agent?: Agent; attempts?: 1 | 2; dispatch?: string } = {}): string {
  const agent = s.agent ?? "claude";
  const record = {
    agent,
    cwd: "/tmp/work",
    requestedCwd: null,
    sessionId: "sess-1",
    promptFingerprint: FP,
    attempts: s.attempts ?? 1,
    pid: 0,
    pgid: 0,
    startedAt: STARTED,
    state: "exited",
    resultSent: true,
    roomId: s.room ?? ROOM,
    cardId: CARD,
    fromPeerId: "p_dispatcher",
    dispatchHandoffId: s.dispatch ?? DISPATCH,
    procStartedAt: "",
    sendAttempts: 1,
    completedHandoffIds: [],
  };
  const path = cardSessionPath({
    loomDir: L,
    localPeerId: PEER,
    roomId: record.roomId,
    agent,
    cardId: CARD,
  });
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  return dirname(path);
}

type RecOpts = { turn?: "first" | "resume"; dispatch?: string; parts?: FencePartId[]; listing?: string };

/** A v2 record: the assembler's system · user · sections. */
function v2(agent: Agent, attempt: number, o: RecOpts = {}): PromptRecord {
  const turn = o.turn ?? (attempt === 1 ? "first" : "resume");
  const parts = o.parts ?? ALL_PARTS;
  const a = assembleHeadlessPrompt(
    turn === "first"
      ? {
          agent,
          turn,
          listing: o.listing ?? LISTING,
          memoryBlock: parts.length > 0 ? FENCE : "",
          memoryParts: parts,
          cardBody: BODY,
        }
      : { agent, turn, listing: "", memoryBlock: "", memoryParts: [], cardBody: BODY },
  );
  return buildPromptRecord({
    agent,
    turn,
    attempt,
    dispatchHandoffId: o.dispatch ?? DISPATCH,
    fingerprint: FP,
    system: a.system,
    user: a.user,
    sections: a.sections,
  });
}

/** The same texts without sections: a v1 (0.41.0) record. */
function v1(agent: Agent, attempt: number, o: RecOpts = {}): PromptRecord {
  const r = v2(agent, attempt, o);
  return buildPromptRecord({
    agent,
    turn: r.turn,
    attempt,
    dispatchHandoffId: r.dispatchHandoffId,
    fingerprint: FP,
    system: r.system,
    user: r.user,
  });
}

const bytes = (s: string) => Buffer.byteLength(s, "utf8");

function sectionLines(sections: readonly PromptRecordSection[]): string[] {
  const lines = ["sections:"];
  for (const s of sections) {
    lines.push(`  ${s.id} · ${s.channel} · ${s.version} · ${s.bytes} B · sha256 ${s.sha256.slice(0, 12)}`);
    if (s.parts !== undefined) {
      lines.push(`    parts: ${s.parts.map((p) => `${p.id} ${p.version}`).join(", ")}`);
    }
  }
  return lines;
}

/** D6: four head lines → sections block (v2) or the v1 line → blank → body sections. */
function textOf(r: PromptRecord, verdict = "ok", stale?: string): string[] {
  const lines = [
    `card ${CARD} · agent ${r.agent} · turn ${r.turn} · attempt ${r.attempt}${stale ? ` · STALE — earlier dispatch ${stale}` : ""}`,
    `fingerprint ${r.fingerprint}`,
    `system: ${r.systemChannel} · ${bytes(r.system)} B`,
    `user: ${r.userChannel} · ${bytes(r.user)} B · sha256 ${r.userSha256} ${verdict}`,
    ...(r.sections === undefined ? [V1_LINE] : sectionLines(r.sections)),
    "",
    `--- system (${r.systemChannel}) ---`,
    r.system,
    `--- user (${r.userChannel}) ---`,
    r.user,
  ];
  if (r.userArgv !== undefined) {
    lines.push("--- user argv (codex exec resume positional) ---", r.userArgv);
  }
  return lines;
}

/** Writes a (possibly tampered) record object in the canonical serialisation, past the byte check. */
function putRaw(dir: string, attempt: number, r: PromptRecord): void {
  writeFileSync(promptRecordPath(dir, attempt), serializePromptRecord(r), { mode: 0o600 });
}

const invalidLine = (dir: string, n: number, reason: string) =>
  `loom prompt: invalid prompt record ${promptRecordPath(dir, n)}: ${reason}`;

// ---------------------------------------------------------------------------------------------
// v2 sections block (D6)
// ---------------------------------------------------------------------------------------------

describe("loom prompt show — v2 sections block, verbatim", () => {
  test("claude first turn with listing + full fence: head four lines → sections → parts → blank → body, exit 0", async () => {
    const dir = seedSession();
    const r1 = v2("claude", 1);
    expect(r1.version).toBe(2);
    await writePromptRecord(dir, r1);
    const r = await cli()([CARD]);
    expect(r.err).toEqual([]);
    expect(r.code).toBe(0);
    expect(r.out).toEqual(textOf(r1));
    const s = r1.sections!;
    expect(r.out.slice(4, 11)).toEqual([
      "sections:",
      `  worker-hint · system · ${s[0]!.version} · ${s[0]!.bytes} B · sha256 ${s[0]!.sha256.slice(0, 12)}`,
      `  skill-listing · user · ${s[1]!.version} · ${s[1]!.bytes} B · sha256 ${s[1]!.sha256.slice(0, 12)}`,
      `  task-marker · user · ${s[2]!.version} · ${s[2]!.bytes} B · sha256 ${s[2]!.sha256.slice(0, 12)}`,
      `  memory-fence · user · ${s[3]!.version} · ${s[3]!.bytes} B · sha256 ${s[3]!.sha256.slice(0, 12)}`,
      ALL_PARTS_LINE,
      `  card-body · user · ${s[4]!.version} · ${s[4]!.bytes} B · sha256 ${s[4]!.sha256.slice(0, 12)}`,
    ]);
    expect(r.out[11]).toBe("");
    for (const line of r.out.slice(5, 11)) {
      if (line.startsWith("    parts:")) continue;
      expect(line).toMatch(/^ {2}[a-z-]+ · (system|user) · \d+\.\d+\.\d+ · \d+ B · sha256 [0-9a-f]{12}$/);
    }
  });

  test("a fence with one part → `    parts: memory-snapshot 0.36.0`; no listing → no skill-listing line", async () => {
    const dir = seedSession({ agent: "grok" });
    const r1 = v2("grok", 1, { parts: ["memory-snapshot"], listing: "" });
    await writePromptRecord(dir, r1);
    const r = await cli()([CARD]);
    expect(r.code).toBe(0);
    expect(r.out).toEqual(textOf(r1));
    expect(r.out).toContain("    parts: memory-snapshot 0.36.0");
    expect(r.out.some((l) => l.startsWith("  skill-listing"))).toBe(false);
  });

  test("no fence → no memory-fence line and no parts line", async () => {
    const dir = seedSession();
    const r1 = v2("claude", 1, { parts: [] });
    await writePromptRecord(dir, r1);
    const r = await cli()([CARD]);
    expect(r.code).toBe(0);
    expect(r.out).toEqual(textOf(r1));
    expect(r.out.some((l) => l.includes("memory-fence") || l.includes("parts:"))).toBe(false);
  });

  test("codex resume: resume-continuation in the block, the argv separator still last", async () => {
    const dir = seedSession({ agent: "codex", attempts: 2 });
    const r2 = v2("codex", 2);
    expect(r2.userArgv).toBeDefined();
    await writePromptRecord(dir, r2);
    const r = await cli()([CARD]);
    expect(r.err).toEqual([]);
    expect(r.code).toBe(0);
    expect(r.out).toEqual(textOf(r2));
    expect(r.out[5]!.startsWith("  worker-hint · system · ")).toBe(true);
    expect(r.out[6]!.startsWith("  resume-continuation · user · ")).toBe(true);
    expect(r.out.at(-2)).toBe("--- user argv (codex exec resume positional) ---");
  });

  test("--json on a v2 record = the file bytes verbatim, nothing on the line channel", async () => {
    const dir = seedSession();
    const r1 = v2("claude", 1);
    await writePromptRecord(dir, r1);
    const r = await cli()([CARD], { json: true });
    expect(r.err).toEqual([]);
    expect(r.code).toBe(0);
    expect(r.out).toEqual([]);
    expect(r.bytes.equals(readFileSync(promptRecordPath(dir, 1)))).toBe(true);
    expect(r.bytes.toString("utf8")).toBe(serializePromptRecord(r1));
  });
});

// ---------------------------------------------------------------------------------------------
// v1 (class 59) and a mixed card
// ---------------------------------------------------------------------------------------------

describe("loom prompt show — v1 records", () => {
  test("a v1 record → the one `sections: (not recorded — Loom 0.41.0 record)` line, exit 0", async () => {
    const dir = seedSession();
    const r1 = v1("claude", 1);
    expect(r1.version).toBe(1);
    await writePromptRecord(dir, r1);
    const r = await cli()([CARD]);
    expect(r.code).toBe(0);
    expect(r.out).toEqual(textOf(r1));
    expect(r.out[4]).toBe(V1_LINE);
    expect(r.out[5]).toBe("");
  });

  test("a card started on 0.41 and resumed on 0.42: attempt 1 = v1 line, attempt 2 = block", async () => {
    const dir = seedSession({ attempts: 2 });
    const r1 = v1("claude", 1);
    const r2 = v2("claude", 2);
    await writePromptRecord(dir, r1);
    await writePromptRecord(dir, r2);
    const run = cli();
    const a = await run([CARD], { attempt: "1" });
    expect(a.code).toBe(0);
    expect(a.out).toEqual(textOf(r1));
    const b = await run([CARD]);
    expect(b.code).toBe(0);
    expect(b.out).toEqual(textOf(r2));
    expect(b.out[4]).toBe("sections:");
  });

  test("--json on a v1 record = the file bytes verbatim", async () => {
    const dir = seedSession();
    await writePromptRecord(dir, v1("claude", 1));
    const r = await cli()([CARD], { json: true });
    expect(r.code).toBe(0);
    expect(r.bytes.equals(readFileSync(promptRecordPath(dir, 1)))).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// unchanged texts: STALE · MISMATCH · none · ambiguous · missing · LOOM_CARD
// ---------------------------------------------------------------------------------------------

describe("loom prompt show — the 0.41 texts are unchanged around v2 records", () => {
  test("STALE v2 record: STALE head + block, exit 1 (text and --json)", async () => {
    const dir = seedSession({ dispatch: DISPATCH });
    const old1 = v2("claude", 1, { dispatch: OLD_DISPATCH });
    await writePromptRecord(dir, old1);
    const run = cli();
    const t = await run([CARD]);
    expect(t.code).toBe(1);
    expect(t.out).toEqual(textOf(old1, "ok", OLD_DISPATCH));
    const j = await run([CARD], { json: true });
    expect(j.code).toBe(1);
    expect(j.bytes.equals(readFileSync(promptRecordPath(dir, 1)))).toBe(true);
    expect(j.err).toEqual([`loom prompt: attempt 1 of ${CARD} is STALE — earlier dispatch ${OLD_DISPATCH}`]);
  });

  test("v2 userSha256 forged (user and sections intact) → MISMATCH head + block, exit 1", async () => {
    const dir = seedSession();
    const good = v2("claude", 1);
    const forged: PromptRecord = { ...good, userSha256: "0".repeat(64) };
    putRaw(dir, 1, forged);
    const run = cli();
    const t = await run([CARD]);
    expect(t.code).toBe(1);
    expect(t.out).toEqual(textOf(forged, "MISMATCH"));
    const j = await run([CARD], { json: true });
    expect(j.code).toBe(1);
    expect(j.err).toEqual([`loom prompt: attempt 1 of ${CARD}: sha256 MISMATCH`]);
  });

  test("none · ambiguous · missing texts unchanged", async () => {
    const run = cli();
    expect((await run(["nope"])).err).toEqual([
      "loom prompt: no headless card session for nope under profile default (cards from an earlier peer id of this profile are not searched)",
    ]);
    const a = seedSession({ attempts: 2 });
    await writePromptRecord(a, v2("claude", 2));
    const b = seedSession({ room: "room-b", agent: "grok" });
    await writePromptRecord(b, v2("grok", 1));
    const amb = await run([CARD]);
    expect(amb.code).toBe(1);
    expect(amb.out).toEqual([]);
    expect(amb.err).toEqual([
      `loom prompt: ${CARD} matches 2 headless card sessions under profile default`,
      `  ${ROOM} · claude · attempts 2 · started ${STARTED}`,
      `  room-b · grok · attempts 1 · started ${STARTED}`,
      "pick one with --room <roomId> --agent <agent>",
    ]);
    const miss = await run([CARD], { room: ROOM, attempt: "1" });
    expect(miss.code).toBe(1);
    expect(miss.err).toEqual([
      `loom prompt: attempt 1 of ${CARD} has no prompt record (the write failed, or the attempt ran before Loom 0.41.0)`,
      "available attempts: 2",
    ]);
  });

  test("LOOM_CARD=x → the refusal, nothing resolved, nothing printed", async () => {
    const dir = seedSession();
    await writePromptRecord(dir, v2("claude", 1));
    const r = await cli({ env: { LOOM_CARD: "x" } })([CARD]);
    expect(r.code).toBe(1);
    expect(r.out).toEqual([]);
    expect(r.bytes.length).toBe(0);
    expect(r.err).toEqual([REFUSAL]);
    expect(r.resolves).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------
// v2 invalid → `bad sections` (R9 · R61-L4), D9 escaping
// ---------------------------------------------------------------------------------------------

describe("loom prompt show — v2 `bad sections`", () => {
  async function expectBadSections(dir: string): Promise<void> {
    const run = cli();
    const want = [invalidLine(dir, 1, "bad sections")];
    const t = await run([CARD]);
    expect(t.code).toBe(1);
    expect(t.out).toEqual([]);
    expect(t.err).toEqual(want);
    const j = await run([CARD], { json: true });
    expect(j.code).toBe(1);
    expect(j.bytes.length).toBe(0);
    expect(j.err).toEqual(want);
  }

  test("a tiling gap (one user section's offset + 1) → bad sections, exit 1, no body", async () => {
    const dir = seedSession();
    const good = v2("claude", 1);
    const sections = good.sections!.map((s) => ({ ...s }));
    const at = sections.findIndex((s) => s.id === "card-body");
    sections[at] = { ...sections[at]!, offset: sections[at]!.offset + 1 };
    putRaw(dir, 1, { ...good, sections });
    await expectBadSections(dir);
  });

  test("R61-L4: v2 `user` one byte changed (userSha256 recomputed) → bad sections, exit 1, no body", async () => {
    const dir = seedSession();
    const good = v2("claude", 1);
    const user = `${good.user.slice(0, -1)}X`;
    expect(bytes(user)).toBe(bytes(good.user));
    const forged = buildPromptRecord({
      agent: good.agent,
      turn: good.turn,
      attempt: 1,
      dispatchHandoffId: good.dispatchHandoffId,
      fingerprint: good.fingerprint,
      system: good.system,
      user,
      sections: good.sections,
    });
    putRaw(dir, 1, forged);
    await expectBadSections(dir);
    const t = await cli()([CARD]);
    expect(t.err.join("\n")).not.toContain("second line");
  });

  test("D9: a section id with ESC / a version with U+009B or U+202E is rejected by the read check", async () => {
    for (const mutate of [
      (s: PromptRecordSection) => ({ ...s, id: `${s.id}\u001b[2J` }) as unknown as PromptRecordSection,
      (s: PromptRecordSection) => ({ ...s, version: `${s.version}\u009b` }),
      (s: PromptRecordSection) => ({ ...s, version: `‮${s.version}` }),
    ]) {
      const dir = seedSession();
      const good = v2("claude", 1);
      const sections = good.sections!.map((s, i) => (i === 0 ? mutate(s) : { ...s }));
      putRaw(dir, 1, { ...good, sections });
      await expectBadSections(dir);
      rmSync(promptRecordPath(dir, 1));
    }
  });

  test("D9: the sections block prints id · version · parts through visibleText (the one escaping function)", () => {
    const src = readFileSync(join(import.meta.dir, "prompt-cli.ts"), "utf8");
    expect(src).toContain("v(s.id)");
    expect(src).toContain("v(s.version)");
    expect(src).toContain("v(p.id)");
    expect(src).toContain("v(p.version)");
    expect(src).toContain("const v = visibleText;");
  });
});
