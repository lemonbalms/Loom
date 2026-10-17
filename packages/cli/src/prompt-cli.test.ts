/**
 * PLAN 0.41.0 P3 — `loom prompt show <cardId> [--attempt <n>] [--json] [--profile <p>]` (D6 · R8 ·
 * R9 · R10 · R11 · R12 · C1 · C2 · R60-M2 · R60-L2 · R60-L3).
 *
 * In-process tests inject deps (fresh mkdtemp loomDir per test). Card sessions are seeded at the
 * real `cardSessionPath` and prompt records through the host writer (`buildPromptRecord` +
 * `writePromptRecord`). One spawn case goes through `index.ts` for the `--json` boolean parse
 * (`MEMORY_COMMANDS` gets "prompt" — R60-L3(b)). Run with HOME and LOOM_TEST_HOME pointing at a
 * temp dir.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  buildPromptRecord,
  cardSessionPath,
  type PromptRecord,
  promptRecordPath,
  serializePromptRecord,
  writePromptRecord,
} from "@loom/host";
import { type PromptCliDeps, runPromptCommand } from "./prompt-cli";

type Agent = "claude" | "codex" | "grok";

const PEER = "p_prompt_test_peer";
const OTHER_PEER = "p_some_other_peer";
const CARD = "card-0001";
const ROOM = "room-a";
const DISPATCH = "h".repeat(16);
const OLD_DISPATCH = "o".repeat(16);
const FP = "a".repeat(64);
const STARTED = "2026-10-18T12:00:00.000Z";
const SYSTEM = "You are a Loom card worker.\nStay inside the cwd.";

const REFUSAL =
  "loom prompt: refused — LOOM_CARD is set (this shell belongs to a Loom card worker); prompt records are for the operator.";
const USAGE =
  "loom prompt: usage: loom prompt show <cardId> [--attempt <n>] [--room <roomId>] [--agent claude|codex|grok] [--json] [--profile <p>]";
const noneLine = (card: string, profile = "default") =>
  `loom prompt: no headless card session for ${card} under profile ${profile} (cards from an earlier peer id of this profile are not searched)`;
const missingLine = (n: number, card = CARD) =>
  `loom prompt: attempt ${n} of ${card} has no prompt record (the write failed, or the attempt ran before Loom 0.41.0)`;

let L: string;

beforeEach(() => {
  L = mkdtempSync(join(tmpdir(), "loom-promptcli-"));
});

afterEach(() => {
  rmSync(L, { recursive: true, force: true });
});

type Run = { code: number; out: string[]; err: string[]; bytes: Buffer; resolves: number };

function cli(over: { env?: Record<string, string | undefined>; loomDir?: string; peerId?: string | null; profile?: string } = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const chunks: Buffer[] = [];
  let resolves = 0;
  const deps: PromptCliDeps = {
    env: over.env ?? {},
    resolve: () => {
      resolves += 1;
      return {
        loomDir: over.loomDir ?? L,
        profile: over.profile ?? "default",
        peerId: over.peerId === undefined ? PEER : over.peerId,
      };
    },
    stdout: (l) => out.push(l),
    stdoutBytes: (b) => chunks.push(Buffer.from(b)),
    stderr: (l) => err.push(l),
  };
  return async (
    positional: string[],
    flags: Record<string, string | boolean> = {},
    verb = "show",
  ): Promise<Run> => {
    out.length = 0;
    err.length = 0;
    chunks.length = 0;
    resolves = 0;
    const code = await runPromptCommand(verb, { positional }, flags, deps);
    return { code, out: [...out], err: [...err], bytes: Buffer.concat(chunks), resolves };
  };
}

type Seed = {
  loomDir?: string;
  peer?: string;
  room?: string;
  agent?: Agent;
  card?: string;
  attempts?: 1 | 2;
  dispatch?: string;
  startedAt?: string;
};

/** A valid session.json at the real `cardSessionPath`; returns the card dir. */
function seedSession(s: Seed = {}): string {
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
    startedAt: s.startedAt ?? STARTED,
    state: "exited",
    resultSent: true,
    roomId: s.room ?? ROOM,
    cardId: s.card ?? CARD,
    fromPeerId: "p_dispatcher",
    dispatchHandoffId: s.dispatch ?? DISPATCH,
    procStartedAt: "",
    sendAttempts: 1,
    completedHandoffIds: [],
  };
  const path = cardSessionPath({
    loomDir: s.loomDir ?? L,
    localPeerId: s.peer ?? PEER,
    roomId: record.roomId,
    agent,
    cardId: record.cardId,
  });
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  return dirname(path);
}

function rec(
  agent: Agent,
  attempt: number,
  opts: { turn?: "first" | "resume"; dispatch?: string; user?: string; system?: string } = {},
): PromptRecord {
  return buildPromptRecord({
    agent,
    turn: opts.turn ?? (attempt === 1 ? "first" : "resume"),
    attempt,
    dispatchHandoffId: opts.dispatch ?? DISPATCH,
    fingerprint: FP,
    system: opts.system ?? SYSTEM,
    user: opts.user ?? `user text of attempt ${attempt}\n`,
  });
}

async function seedRecord(dir: string, r: PromptRecord): Promise<void> {
  await writePromptRecord(dir, r);
}

const bytes = (s: string) => Buffer.byteLength(s, "utf8");

function textOf(r: PromptRecord, card = CARD, verdict = "ok", stale?: string): string[] {
  const lines = [
    `card ${card} · agent ${r.agent} · turn ${r.turn} · attempt ${r.attempt}${stale ? ` · STALE — earlier dispatch ${stale}` : ""}`,
    `fingerprint ${r.fingerprint}`,
    `system: ${r.systemChannel} · ${bytes(r.system)} B`,
    `user: ${r.userChannel} · ${bytes(r.user)} B · sha256 ${r.userSha256} ${verdict}`,
    "sections: (not recorded — Loom 0.41.0 record)",
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

// ---------------------------------------------------------------------------------------------
// show — happy paths (R9 · R10)
// ---------------------------------------------------------------------------------------------

describe("loom prompt show — default attempt, --attempt, text and --json", () => {
  test("default = session.json attempts (2): the attempt-2 record, text output verbatim, exit 0", async () => {
    const dir = seedSession({ attempts: 2 });
    const r1 = rec("claude", 1);
    const r2 = rec("claude", 2, { user: "resume body\n\tindented line\nlast" });
    await seedRecord(dir, r1);
    await seedRecord(dir, r2);
    const run = cli();
    const r = await run([CARD]);
    expect(r.err).toEqual([]);
    expect(r.code).toBe(0);
    expect(r.out).toEqual(textOf(r2));
  });

  test("--attempt 1 shows the attempt-1 record", async () => {
    const dir = seedSession({ attempts: 2, agent: "grok" });
    const r1 = rec("grok", 1);
    await seedRecord(dir, r1);
    await seedRecord(dir, rec("grok", 2));
    const r = await cli()([CARD], { attempt: "1" });
    expect(r.err).toEqual([]);
    expect(r.code).toBe(0);
    expect(r.out).toEqual(textOf(r1));
  });

  test("codex resume: a third separator with the exec resume positional (R3)", async () => {
    const dir = seedSession({ agent: "codex", attempts: 2 });
    const r2 = rec("codex", 2);
    expect(r2.userArgv).toBeDefined();
    await seedRecord(dir, r2);
    const r = await cli()([CARD]);
    expect(r.code).toBe(0);
    expect(r.out).toEqual(textOf(r2));
    expect(r.out).toContain("--- user argv (codex exec resume positional) ---");
  });

  test("--json = the file bytes verbatim (not re-serialised), nothing on the line channel", async () => {
    const dir = seedSession();
    const r1 = rec("claude", 1, { user: "esc \u001b[31m c1 \u009b bidi ‮ del \u007f\n" });
    await seedRecord(dir, r1);
    const r = await cli()([CARD], { json: true });
    expect(r.err).toEqual([]);
    expect(r.code).toBe(0);
    expect(r.out).toEqual([]);
    expect(r.bytes.equals(readFileSync(promptRecordPath(dir, 1)))).toBe(true);
    expect(r.bytes.toString("utf8")).toBe(serializePromptRecord(r1));
  });

  test("text mode shows ESC / C1 (U+009B) / bidi (U+202E) / DEL / CR visibly, keeps LF and TAB; byte counts are of the original", async () => {
    const dir = seedSession();
    const user = "a\u001b[2Jb\u009bc‮d⁦e\u007ff\rg\th\ni";
    const system = "sys\u0007bell⁩";
    const r1 = rec("claude", 1, { user, system });
    await seedRecord(dir, r1);
    const r = await cli()([CARD]);
    expect(r.code).toBe(0);
    expect(r.out[2]).toBe(`system: claude --append-system-prompt · ${bytes(system)} B`);
    expect(r.out[3]).toBe(`user: stdin · ${bytes(user)} B · sha256 ${r1.userSha256} ok`);
    expect(r.out[7]).toBe("sys\\u{7}bell\\u{2069}");
    expect(r.out[9]).toBe("a\\u{1b}[2Jb\\u{9b}c\\u{202e}d\\u{2066}e\\u{7f}f\\u{d}g\th\ni");
    for (const line of r.out) {
      // biome-ignore lint/suspicious/noControlCharactersInRegex: asserting no raw control characters
      expect(line).not.toMatch(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f‪-‮⁦-⁩]/);
    }
  });

  test("cardId with control characters is escaped in the head line", async () => {
    const card = "c\u001b]0;x\u0007‮id";
    const dir = seedSession({ card });
    await seedRecord(dir, rec("claude", 1));
    const r = await cli()([card]);
    expect(r.code).toBe(0);
    expect(r.out[0]).toBe("card c\\u{1b}]0;x\\u{7}\\u{202e}id · agent claude · turn first · attempt 1");
  });

  test("LOOM_CARD=\"\" is not set — shows normally", async () => {
    const dir = seedSession();
    await seedRecord(dir, rec("claude", 1));
    const r = await cli({ env: { LOOM_CARD: "" } })([CARD]);
    expect(r.code).toBe(0);
    expect(r.err).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// missing · STALE · MISMATCH · invalid (R9 · R60-M2 · R60-L3)
// ---------------------------------------------------------------------------------------------

describe("loom prompt show — missing, STALE, MISMATCH, invalid", () => {
  test("missing attempt with another current-dispatch record → missing line + available attempts, exit 1", async () => {
    const dir = seedSession({ attempts: 2 });
    await seedRecord(dir, rec("claude", 2));
    const r = await cli()([CARD], { attempt: "1" });
    expect(r.code).toBe(1);
    expect(r.out).toEqual([]);
    expect(r.err).toEqual([missingLine(1), "available attempts: 2"]);
  });

  test("write-failed latest attempt (2 missing, 1 present) → missing exit 1 + available attempts: 1", async () => {
    const dir = seedSession({ attempts: 2 });
    await seedRecord(dir, rec("claude", 1));
    const r = await cli()([CARD]);
    expect(r.code).toBe(1);
    expect(r.err).toEqual([missingLine(2), "available attempts: 1"]);
  });

  test("no records at all (a pre-0.41 card) → missing line only", async () => {
    seedSession();
    const r = await cli()([CARD]);
    expect(r.code).toBe(1);
    expect(r.err).toEqual([missingLine(1)]);
  });

  test("STALE: a new dispatch left the earlier dispatch's prompt-2.json — --attempt 2 → STALE + exit 1; default (latest = 1) is current; not in available attempts", async () => {
    const dir = seedSession({ attempts: 1, dispatch: DISPATCH });
    const cur1 = rec("claude", 1, { dispatch: DISPATCH });
    const old2 = rec("claude", 2, { dispatch: OLD_DISPATCH });
    await seedRecord(dir, cur1);
    await seedRecord(dir, old2);
    const run = cli();
    const s = await run([CARD], { attempt: "2" });
    expect(s.code).toBe(1);
    expect(s.out).toEqual(textOf(old2, CARD, "ok", OLD_DISPATCH));
    const d = await run([CARD]);
    expect(d.code).toBe(0);
    expect(d.out).toEqual(textOf(cur1));

    // current prompt-1 gone (write failed): the stale prompt-2 is not offered
    rmSync(promptRecordPath(dir, 1));
    const m = await run([CARD]);
    expect(m.code).toBe(1);
    expect(m.err).toEqual([missingLine(1)]);
  });

  test("STALE: a fail-open leftover prompt-1.json of the earlier dispatch → STALE + exit 1 (also under --json)", async () => {
    const dir = seedSession({ attempts: 1, dispatch: DISPATCH });
    const old1 = rec("claude", 1, { dispatch: OLD_DISPATCH });
    await seedRecord(dir, old1);
    const run = cli();
    const t = await run([CARD]);
    expect(t.code).toBe(1);
    expect(t.out).toEqual(textOf(old1, CARD, "ok", OLD_DISPATCH));
    const j = await run([CARD], { json: true });
    expect(j.code).toBe(1);
    expect(j.bytes.equals(readFileSync(promptRecordPath(dir, 1)))).toBe(true);
    expect(j.err.join("\n")).toContain(`STALE — earlier dispatch ${OLD_DISPATCH}`);
  });

  test("userSha256 mismatch → MISMATCH in the head, body shown, exit 1", async () => {
    const dir = seedSession();
    const good = rec("claude", 1, { user: "original\n" });
    const forged: PromptRecord = { ...good, user: "forged\n" };
    writeFileSync(promptRecordPath(dir, 1), serializePromptRecord(forged), { mode: 0o600 });
    const r = await cli()([CARD]);
    expect(r.code).toBe(1);
    expect(r.out).toEqual(textOf(forged, CARD, "MISMATCH"));
    const j = await cli()([CARD], { json: true });
    expect(j.code).toBe(1);
    expect(j.err.join("\n")).toContain("sha256 MISMATCH");
  });

  test("invalid JSON → `invalid prompt record <path>: <reason>` exit 1, no file content", async () => {
    const dir = seedSession();
    writeFileSync(promptRecordPath(dir, 1), "{ secret-content", { mode: 0o600 });
    const r = await cli()([CARD]);
    expect(r.code).toBe(1);
    expect(r.out).toEqual([]);
    expect(r.err).toEqual([`loom prompt: invalid prompt record ${promptRecordPath(dir, 1)}: not JSON`]);
    expect(r.err.join("\n")).not.toContain("secret-content");
  });

  test("symlink → invalid: not a regular file · > 8 MiB → invalid: too large (R60-L3)", async () => {
    const dir = seedSession({ attempts: 2 });
    const elsewhere = join(L, "elsewhere.json");
    writeFileSync(elsewhere, serializePromptRecord(rec("claude", 1)));
    symlinkSync(elsewhere, promptRecordPath(dir, 1));
    writeFileSync(promptRecordPath(dir, 2), Buffer.alloc(8 * 1024 * 1024 + 1, 0x20));
    const run = cli();
    const s = await run([CARD], { attempt: "1" });
    expect(s.code).toBe(1);
    expect(s.err).toEqual([
      `loom prompt: invalid prompt record ${promptRecordPath(dir, 1)}: not a regular file`,
    ]);
    const b = await run([CARD]);
    expect(b.code).toBe(1);
    expect(b.err).toEqual([`loom prompt: invalid prompt record ${promptRecordPath(dir, 2)}: too large`]);
  });

  test("the invalid path is escaped too (loomDir with ESC)", async () => {
    const odd = join(L, "x\u001by");
    const dir = seedSession({ loomDir: odd });
    writeFileSync(promptRecordPath(dir, 1), "nope");
    const r = await cli({ loomDir: odd })([CARD]);
    expect(r.code).toBe(1);
    expect(r.err).toEqual([
      `loom prompt: invalid prompt record ${promptRecordPath(dir, 1).replace("\u001b", "\\u{1b}")}: not JSON`,
    ]);
  });
});

// ---------------------------------------------------------------------------------------------
// resolution (R8 · C1 · C2)
// ---------------------------------------------------------------------------------------------

describe("loom prompt show — card resolution in the profile's peer namespace", () => {
  test("0 matches → none line with the earlier-peer-id tail, exit 1", async () => {
    const r = await cli({ profile: "work" })([CARD]);
    expect(r.code).toBe(1);
    expect(r.err).toEqual([noneLine(CARD, "work")]);
  });

  test("a card only under another peer namespace is not found (R8)", async () => {
    const dir = seedSession({ peer: OTHER_PEER });
    await seedRecord(dir, rec("claude", 1));
    const r = await cli()([CARD]);
    expect(r.code).toBe(1);
    expect(r.err).toEqual([noneLine(CARD)]);
  });

  test("profile without a session → `profile <p> has no session (join a room first)` exit 1", async () => {
    const r = await cli({ peerId: null, profile: "ghost" })([CARD]);
    expect(r.code).toBe(1);
    expect(r.err).toEqual(["loom prompt: profile ghost has no session (join a room first)"]);
  });

  test("2 matches (different rooms) → candidate list + `pick one …` exit 1; --room picks one", async () => {
    const roomB = "room-b\u001b[1m";
    const a = seedSession({ room: ROOM, attempts: 2 });
    const b = seedSession({ room: roomB, agent: "codex" });
    await seedRecord(a, rec("claude", 2));
    const rb = rec("codex", 1);
    await seedRecord(b, rb);
    const run = cli();
    const r = await run([CARD]);
    expect(r.code).toBe(1);
    expect(r.out).toEqual([]);
    expect(r.err).toEqual([
      `loom prompt: ${CARD} matches 2 headless card sessions under profile default`,
      `  ${ROOM} · claude · attempts 2 · started ${STARTED}`,
      `  room-b\\u{1b}[1m · codex · attempts 1 · started ${STARTED}`,
      "pick one with --room <roomId> --agent <agent>",
    ]);
    const byRoom = await run([CARD], { room: roomB });
    expect(byRoom.code).toBe(0);
    expect(byRoom.out).toEqual(textOf(rb));
    const byAgent = await run([CARD], { agent: "claude" });
    expect(byAgent.code).toBe(0);
    expect(byAgent.out[0]).toBe(`card ${CARD} · agent claude · turn resume · attempt 2`);
  });

  test("filters are match checks even with one candidate: wrong --room / --agent → none", async () => {
    const dir = seedSession();
    await seedRecord(dir, rec("claude", 1));
    const run = cli();
    expect((await run([CARD], { room: "room-z" })).err).toEqual([noneLine(CARD)]);
    expect((await run([CARD], { agent: "grok" })).err).toEqual([noneLine(CARD)]);
    expect((await run([CARD], { room: ROOM, agent: "claude" })).code).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------
// refusal · usage (R11 · R9)
// ---------------------------------------------------------------------------------------------

describe("loom prompt — LOOM_CARD refusal and usage", () => {
  test("LOOM_CARD=x → refusal exit 1 before argument parsing; nothing resolved or read", async () => {
    const dir = seedSession();
    await seedRecord(dir, rec("claude", 1));
    const run = cli({ env: { LOOM_CARD: "x" } });
    for (const [pos, flags, verb] of [
      [[CARD], {}, "show"],
      [[], { attempt: "0" }, "show"],
      [[], {}, "bogus"],
    ] as const) {
      const r = await run([...pos], { ...flags }, verb);
      expect(r.code).toBe(1);
      expect(r.out).toEqual([]);
      expect(r.bytes.length).toBe(0);
      expect(r.err).toEqual([REFUSAL]);
      expect(r.resolves).toBe(0);
    }
  });

  test("--attempt 0 / x / 01 / missing value → usage exit 1 (no resolution)", async () => {
    seedSession();
    const run = cli();
    for (const v of ["0", "x", "01", "-1", "1.5"] as const) {
      const r = await run([CARD], { attempt: v });
      expect(r.code).toBe(1);
      expect(r.err).toEqual([USAGE]);
      expect(r.resolves).toBe(0);
    }
    expect((await run([CARD], { attempt: true })).err).toEqual([USAGE]);
  });

  test("bad verb · no cardId · two cardIds · --json with a value · --room without value → usage; bad --agent → agent error", async () => {
    const run = cli();
    expect((await run([CARD], {}, "list")).err).toEqual([USAGE]);
    expect((await run([], {}, "")).err).toEqual([USAGE]);
    expect((await run([])).err).toEqual([USAGE]);
    expect((await run([CARD, "extra"])).err).toEqual([USAGE]);
    expect((await run([], { json: CARD })).err).toEqual([USAGE]);
    expect((await run([CARD], { room: true })).err).toEqual([USAGE]);
    const a = await run([CARD], { agent: "gemini" });
    expect(a.code).toBe(1);
    expect(a.err).toEqual(["loom prompt: --agent must be claude, codex or grok"]);
  });
});

// ---------------------------------------------------------------------------------------------
// read-only
// ---------------------------------------------------------------------------------------------

function snapshot(root: string): string[] {
  const out: string[] = [];
  const walk = (p: string) => {
    const st = lstatSync(p);
    out.push(`${p} ${st.mode} ${st.size} ${st.mtimeMs}`);
    if (st.isDirectory()) for (const n of readdirSync(p).sort()) walk(join(p, n));
  };
  walk(root);
  return out;
}

test("read-only: show / --json / missing / STALE / ambiguity leave the loomDir byte- and mtime-identical", async () => {
  const dir = seedSession({ attempts: 2 });
  await seedRecord(dir, rec("claude", 1));
  await seedRecord(dir, rec("claude", 2, { dispatch: OLD_DISPATCH }));
  seedSession({ room: "room-b", agent: "grok" });
  const before = snapshot(L);
  const run = cli();
  await run([CARD]);
  await run([CARD], { room: ROOM });
  await run([CARD], { room: ROOM, json: true });
  await run([CARD], { room: ROOM, attempt: "1" });
  await run([CARD], { agent: "grok" });
  await run(["nope"]);
  expect(snapshot(L)).toEqual(before);
});

// ---------------------------------------------------------------------------------------------
// spawn — the real CLI entry under a temp home (R60-L3(b): `--json` is boolean for "prompt")
// ---------------------------------------------------------------------------------------------

const CLI = join(import.meta.dir, "index.ts");

function childEnv(T: string, extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue;
    if (/^(LOOM_|FABLE_)/.test(k)) continue; // relay token · profile · session · card never leak in
    env[k] = v;
  }
  return { ...env, HOME: T, LOOM_TEST_HOME: T, ...extra };
}

describe("spawn: bun packages/cli/src/index.ts prompt show (HOME = LOOM_TEST_HOME = temp)", () => {
  test(
    "`prompt show --json <cardId>`: --json does not swallow the cardId; stdout = file bytes; LOOM_CARD refuses",
    async () => {
      const T = mkdtempSync(join(tmpdir(), "loom-promptcli-spawn-"));
      try {
        const loom = join(T, ".loom");
        mkdirSync(loom, { recursive: true });
        writeFileSync(
          join(loom, "session.json"),
          JSON.stringify({ peerId: PEER, displayName: "Kim", relayUrl: "ws://127.0.0.1:7842" }),
        );
        const dir = seedSession({ loomDir: loom });
        await seedRecord(dir, rec("claude", 1));
        const r = spawnSync(process.execPath, [CLI, "prompt", "show", "--json", CARD], {
          env: childEnv(T),
          timeout: 30_000,
        });
        expect(r.stderr.toString("utf8")).toBe("");
        expect(r.status).toBe(0);
        expect(Buffer.from(r.stdout).equals(readFileSync(promptRecordPath(dir, 1)))).toBe(true);

        const refused = spawnSync(process.execPath, [CLI, "prompt", "show", CARD], {
          env: childEnv(T, { LOOM_CARD: "card-x" }),
          encoding: "utf8",
          timeout: 30_000,
        });
        expect(refused.status).toBe(1);
        expect(refused.stdout).toBe("");
        expect(refused.stderr).toBe(`${REFUSAL}\n`);
      } finally {
        rmSync(T, { recursive: true, force: true });
      }
    },
    60_000,
  );
});

// ---------------------------------------------------------------------------------------------
// Astra verify 0094 — six findings
// ---------------------------------------------------------------------------------------------

/** The card dir `cardSessionPath` gives for PEER / ROOM / claude / CARD (not created). */
function cardDirOf(s: { loomDir?: string; peer?: string; agent?: Agent } = {}): string {
  return dirname(
    cardSessionPath({
      loomDir: s.loomDir ?? L,
      localPeerId: s.peer ?? PEER,
      roomId: ROOM,
      agent: s.agent ?? "claude",
      cardId: CARD,
    }),
  );
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: asserting no raw control characters
const RAW_UNSAFE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f‪-‮⁦-⁩]/;

/** Captures anything written straight to process.stderr while `fn` runs. */
async function captureProcessStderr<T>(fn: () => Promise<T>): Promise<{ value: T; text: string }> {
  const chunks: string[] = [];
  const orig = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  }) as typeof process.stderr.write;
  try {
    const value = await fn();
    return { value, text: chunks.join("") };
  } finally {
    process.stderr.write = orig;
  }
}

/** A temp HOME's tree without bun's own `Library/Caches` (HOME = T for the child). */
function snapshotHome(T: string): string[] {
  return readdirSync(T)
    .filter((n) => n !== "Library")
    .sort()
    .flatMap((n) => snapshot(join(T, n)));
}

function spawnPrompt(T: string, args: string[], extra: Record<string, string> = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    env: childEnv(T, extra),
    encoding: "utf8",
    timeout: 20_000,
  });
}

describe("Astra 0094 #1 — strictly read-only (no .corrupt-* backup, no .fable migration)", () => {
  test("a malformed card session.json next to the match: shown, and the tree is unchanged (names · bytes · mtimes)", async () => {
    const dir = seedSession();
    await seedRecord(dir, rec("claude", 1));
    const bad = seedSession({ room: "room-bad" });
    writeFileSync(join(bad, "session.json"), "{ not json");
    const before = snapshot(L);
    const bytesBefore = readFileSync(join(bad, "session.json"));
    const { value: r } = await captureProcessStderr(() => cli()([CARD]));
    expect(r.code).toBe(0);
    await captureProcessStderr(() => cli()(["nope"]));
    expect(snapshot(L)).toEqual(before);
    expect(readdirSync(bad)).toEqual(["session.json"]);
    expect(readFileSync(join(bad, "session.json")).equals(bytesBefore)).toBe(true);
  });

  test(
    "real entry with only a legacy ~/.fable layout: nothing is renamed, copied or deleted",
    () => {
      const T = mkdtempSync(join(tmpdir(), "loom-promptcli-fable-"));
      try {
        const fable = join(T, ".fable");
        mkdirSync(fable, { recursive: true });
        writeFileSync(
          join(fable, "session.json"),
          JSON.stringify({ peerId: PEER, displayName: "Kim", relayUrl: "ws://127.0.0.1:7842" }),
        );
        const dir = seedSession({ loomDir: fable });
        writeFileSync(promptRecordPath(dir, 1), serializePromptRecord(rec("claude", 1)));
        const before = snapshotHome(T);
        const r = spawnPrompt(T, ["prompt", "show", CARD]);
        expect(r.status).toBe(0); // Astra 0097 M2: the blocked-migration .fable root is read in place
        expect(snapshotHome(T)).toEqual(before);
        expect(readdirSync(T).filter((n) => n !== "Library")).toEqual([".fable"]);
      } finally {
        rmSync(T, { recursive: true, force: true });
      }
    },
    60_000,
  );

  test(
    "real entry with a malformed profile session.json: no session, tree unchanged",
    () => {
      const T = mkdtempSync(join(tmpdir(), "loom-promptcli-badsess-"));
      try {
        const loom = join(T, ".loom");
        mkdirSync(loom, { recursive: true });
        writeFileSync(join(loom, "session.json"), "{ broken");
        const before = snapshotHome(T);
        const r = spawnPrompt(T, ["prompt", "show", CARD]);
        expect(r.status).toBe(1);
        expect(r.stderr).toBe("loom prompt: profile default has no session (join a room first)\n");
        expect(snapshotHome(T)).toEqual(before);
      } finally {
        rmSync(T, { recursive: true, force: true });
      }
    },
    60_000,
  );
});

describe("Astra 0097 M2 — the state root mirrors the bridge (.loom → .fable → .loom), read-only", () => {
  /** A profile session + card session + attempt-1 record (user text `user`) under `root`. */
  function seedRoot(root: string, user: string): string {
    mkdirSync(root, { recursive: true });
    writeFileSync(
      join(root, "session.json"),
      JSON.stringify({ peerId: PEER, displayName: "Kim", relayUrl: "ws://127.0.0.1:7842" }),
    );
    const dir = seedSession({ loomDir: root });
    writeFileSync(promptRecordPath(dir, 1), serializePromptRecord(rec("claude", 1, { user })));
    return dir;
  }

  test(
    "only ~/.fable (migration blocked or not yet run): the card is shown from .fable; names · bytes · mtimes unchanged, no .loom",
    () => {
      const T = mkdtempSync(join(tmpdir(), "loom-promptcli-m2-fable-"));
      try {
        const dir = seedRoot(join(T, ".fable"), "legacy user text\n");
        const before = snapshotHome(T);
        const recordBytes = readFileSync(promptRecordPath(dir, 1));
        const sessionBytes = readFileSync(join(dir, "session.json"));
        const r = spawnPrompt(T, ["prompt", "show", CARD]);
        expect(r.stderr).toBe("");
        expect(r.status).toBe(0);
        expect(r.stdout).toBe(`${textOf(rec("claude", 1, { user: "legacy user text\n" })).join("\n")}\n`);
        const j = spawnSync(process.execPath, [CLI, "prompt", "show", "--json", CARD], {
          env: childEnv(T),
          timeout: 20_000,
        });
        expect(j.status).toBe(0);
        expect(Buffer.from(j.stdout).equals(recordBytes)).toBe(true);
        expect(snapshotHome(T)).toEqual(before);
        expect(readFileSync(promptRecordPath(dir, 1)).equals(recordBytes)).toBe(true);
        expect(readFileSync(join(dir, "session.json")).equals(sessionBytes)).toBe(true);
        expect(readdirSync(T).filter((n) => n !== "Library")).toEqual([".fable"]);
      } finally {
        rmSync(T, { recursive: true, force: true });
      }
    },
    60_000,
  );

  test(
    "both ~/.loom and ~/.fable: .loom wins; neither tree changes",
    () => {
      const T = mkdtempSync(join(tmpdir(), "loom-promptcli-m2-both-"));
      try {
        seedRoot(join(T, ".loom"), "loom user text\n");
        seedRoot(join(T, ".fable"), "legacy user text\n");
        const before = snapshotHome(T);
        const r = spawnPrompt(T, ["prompt", "show", CARD]);
        expect(r.stderr).toBe("");
        expect(r.status).toBe(0);
        expect(r.stdout).toBe(`${textOf(rec("claude", 1, { user: "loom user text\n" })).join("\n")}\n`);
        expect(snapshotHome(T)).toEqual(before);
      } finally {
        rmSync(T, { recursive: true, force: true });
      }
    },
    60_000,
  );

  test(
    "neither ~/.loom nor ~/.fable: the existing no-session path, and nothing is created",
    () => {
      const T = mkdtempSync(join(tmpdir(), "loom-promptcli-m2-none-"));
      try {
        const before = snapshotHome(T);
        const r = spawnPrompt(T, ["prompt", "show", CARD]);
        expect(r.status).toBe(1);
        expect(r.stdout).toBe("");
        expect(r.stderr).toBe("loom prompt: profile default has no session (join a room first)\n");
        expect(snapshotHome(T)).toEqual(before);
        expect(readdirSync(T).filter((n) => n !== "Library")).toEqual([]);
      } finally {
        rmSync(T, { recursive: true, force: true });
      }
    },
    60_000,
  );
});

describe("Astra 0094 #2 — the scan follows no symlink and never blocks", () => {
  test("a symlinked card dir pointing at another peer's matching card is not shown", async () => {
    const other = seedSession({ peer: OTHER_PEER });
    await seedRecord(other, rec("claude", 1));
    const mine = cardDirOf();
    mkdirSync(dirname(mine), { recursive: true });
    symlinkSync(other, mine);
    const r = await captureProcessStderr(() => cli()([CARD]));
    expect(r.value.code).toBe(1);
    expect(r.value.out).toEqual([]);
    expect(r.value.err[0]).toBe(noneLine(CARD));
  });

  test("a session.json symlink is skipped", async () => {
    const other = seedSession({ peer: OTHER_PEER });
    await seedRecord(other, rec("claude", 1));
    const mine = cardDirOf();
    mkdirSync(mine, { recursive: true });
    symlinkSync(join(other, "session.json"), join(mine, "session.json"));
    await seedRecord(mine, rec("claude", 1));
    const r = await captureProcessStderr(() => cli()([CARD]));
    expect(r.value.code).toBe(1);
    expect(r.value.out).toEqual([]);
    expect(r.value.err[0]).toBe(noneLine(CARD));
  });

  test(
    "a FIFO session.json is skipped promptly (real entry, killed after 20 s if it blocks)",
    () => {
      if (process.platform === "win32") return;
      const T = mkdtempSync(join(tmpdir(), "loom-promptcli-fifo-"));
      try {
        const loom = join(T, ".loom");
        mkdirSync(loom, { recursive: true });
        writeFileSync(
          join(loom, "session.json"),
          JSON.stringify({ peerId: PEER, displayName: "Kim", relayUrl: "ws://127.0.0.1:7842" }),
        );
        const mine = cardDirOf({ loomDir: loom });
        mkdirSync(mine, { recursive: true });
        if (Bun.spawnSync(["mkfifo", join(mine, "session.json")]).exitCode !== 0) return;
        const started = Date.now();
        const r = spawnPrompt(T, ["prompt", "show", CARD]);
        expect(r.signal).toBeNull();
        expect(r.status).toBe(1);
        expect(r.stderr.split("\n")[0]).toBe(noneLine(CARD, "Kim"));
        expect(Date.now() - started).toBeLessThan(15_000);
      } finally {
        rmSync(T, { recursive: true, force: true });
      }
    },
    60_000,
  );

  test("a session.json over 1 MiB is skipped", async () => {
    const mine = seedSession();
    await seedRecord(mine, rec("claude", 1));
    const text = readFileSync(join(mine, "session.json"), "utf8");
    writeFileSync(join(mine, "session.json"), text.replace(/\n$/, `${" ".repeat(1024 * 1024)}\n`));
    const r = await captureProcessStderr(() => cli()([CARD]));
    expect(r.value.code).toBe(1);
    expect(r.value.err[0]).toBe(noneLine(CARD));
  });
});

describe("Astra 0094 #3 — the record agent must be the session agent", () => {
  test("a valid codex record in a claude card dir → invalid: agent mismatch, exit 1 (text and --json)", async () => {
    const dir = seedSession({ agent: "claude" });
    await seedRecord(dir, rec("codex", 1));
    const run = cli();
    const want = [`loom prompt: invalid prompt record ${promptRecordPath(dir, 1)}: agent mismatch`];
    const t = await run([CARD], { agent: "claude" });
    expect(t.code).toBe(1);
    expect(t.out).toEqual([]);
    expect(t.err).toEqual(want);
    const j = await run([CARD], { json: true });
    expect(j.code).toBe(1);
    expect(j.bytes.length).toBe(0);
    expect(j.err).toEqual(want);
  });

  test("an agent-mismatched record is not offered as an available attempt", async () => {
    const dir = seedSession({ agent: "claude", attempts: 2 });
    await seedRecord(dir, rec("codex", 2));
    const r = await cli()([CARD], { attempt: "1" });
    expect(r.code).toBe(1);
    expect(r.err).toEqual([missingLine(1)]);
  });
});

describe("Astra 0094 #4 — nothing from the scan reaches stderr unescaped", () => {
  test("invalid sessions under a loomDir with ESC / U+009B / U+202E: no raw control on either stderr channel", async () => {
    const odd = join(L, "x\u001b[2Jy\u009bz‮w");
    const badA = cardDirOf({ loomDir: odd });
    mkdirSync(badA, { recursive: true });
    writeFileSync(join(badA, "session.json"), "{}\n");
    const badB = seedSession({ loomDir: odd, room: "room-c" });
    writeFileSync(join(badB, "session.json"), "{ nope");
    const { value: r, text } = await captureProcessStderr(() => cli({ loomDir: odd })([CARD]));
    expect(r.code).toBe(1);
    expect(text).not.toMatch(RAW_UNSAFE);
    for (const line of [...r.err, ...r.out]) expect(line).not.toMatch(RAW_UNSAFE);
    expect(r.err[0]).toBe(noneLine(CARD));
  });
});

describe("Astra 0094 #5 — only canonical record bytes are accepted", () => {
  test("a record rewritten with plain JSON.stringify (raw U+009B) → invalid: not canonical, exit 1 (text and --json)", async () => {
    const dir = seedSession();
    const r1 = rec("claude", 1, { user: "c1 \u009b[31m red\n" });
    writeFileSync(promptRecordPath(dir, 1), `${JSON.stringify(r1, null, 2)}\n`, { mode: 0o600 });
    const run = cli();
    const want = [`loom prompt: invalid prompt record ${promptRecordPath(dir, 1)}: not canonical`];
    const t = await run([CARD]);
    expect(t.code).toBe(1);
    expect(t.out).toEqual([]);
    expect(t.err).toEqual(want);
    const j = await run([CARD], { json: true });
    expect(j.code).toBe(1);
    expect(j.bytes.length).toBe(0);
    expect(j.err).toEqual(want);
  });
});

describe("Astra 0094 #6 — LOOM_CARD refuses before help and argument handling (real entry)", () => {
  test(
    "`LOOM_CARD=x loom prompt show c --help` (and --profile / -h forms) → the refusal, exit 1",
    () => {
      const T = mkdtempSync(join(tmpdir(), "loom-promptcli-help-"));
      try {
        for (const args of [
          ["prompt", "show", "c", "--help"],
          ["prompt", "--help"],
          ["--profile", "work", "prompt", "show", "c", "-h"],
          ["prompt", "show", "--json", "c", "--help"],
        ]) {
          const before = snapshotHome(T);
          const r = spawnPrompt(T, args, { LOOM_CARD: "x" });
          expect(r.status).toBe(1);
          expect(r.stdout).toBe("");
          expect(r.stderr).toBe(`${REFUSAL}\n`);
          expect(snapshotHome(T)).toEqual(before);
        }
      } finally {
        rmSync(T, { recursive: true, force: true });
      }
    },
    60_000,
  );

  test(
    "without LOOM_CARD, `loom prompt show c --help` still prints the usage, exit 0",
    () => {
      const T = mkdtempSync(join(tmpdir(), "loom-promptcli-help2-"));
      try {
        const r = spawnPrompt(T, ["prompt", "show", "c", "--help"]);
        expect(r.status).toBe(0);
        expect(r.stdout).toContain("loom prompt show <cardId>");
      } finally {
        rmSync(T, { recursive: true, force: true });
      }
    },
    60_000,
  );
});
