/**
 * PLAN 0.44.0 P2 — `loom history search <query> [--room <roomId>] [--month YYYY-MM] [--limit <n>]
 * [--json]` (D3 · D6 · D7 · D8(3)(4)(5) · R1 · R9–R14 · R63-M1).
 *
 * In-process tests inject deps (fresh mkdtemp state root per test): `resolve` returns the root and is
 * counted (R11 — never called under LOOM_CARD), `search` is the real `searchRoomHistory` behind a call
 * counter (or a fake result where the scanner cannot produce the value — escaped incomplete paths).
 * Month files are hand-written JSONL at `rooms/<roomKey>/events/<YYYY-MM>.jsonl`. The entry-point cases
 * run `packages/cli/src/index.ts` from source with HOME = LOOM_TEST_HOME = a temp dir and every
 * LOOM_* / FABLE_* var (relay token · url · card · profile) removed.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { lstatSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type HistoryQuery, type HistoryResult, roomKey, searchRoomHistory } from "@loom/host";
import { type HistoryCliDeps, realHistoryCliDeps, runHistoryCommand } from "./history-cli";
import { readOnlyStateHome } from "./prompt-cli";

const USAGE =
  "loom history: usage: loom history search <query> [--room <roomId>] [--month YYYY-MM] [--limit <n>] [--json]";
const REFUSAL =
  "loom history: refused — LOOM_CARD is set (this shell belongs to a Loom card worker); room history is for the operator.";

const ROOM_A = "room-a";
const ROOM_B = "room-b";

const tail = (hits: number, files: number, torn: number) =>
  `${hits} hits · ${files} files scanned · ${torn} torn lines`;

let R: string;

beforeEach(() => {
  R = mkdtempSync(join(tmpdir(), "loom-historycli-"));
});

afterEach(() => {
  rmSync(R, { recursive: true, force: true });
});

type SearchFn = (root: string, query: HistoryQuery, env: Record<string, string | undefined>) => HistoryResult;
type Call = { root: string; query: HistoryQuery; env: Record<string, string | undefined> };
type Run = { code: number; out: string[]; err: string[]; lines: string[]; resolves: number; calls: Call[] };

function cli(over: { env?: Record<string, string | undefined>; root?: string; search?: SearchFn } = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const calls: Call[] = [];
  let resolves = 0;
  const env = over.env ?? {};
  const deps: HistoryCliDeps = {
    env,
    resolve: () => {
      resolves += 1;
      return over.root ?? R;
    },
    search: (root, query, e) => {
      calls.push({ root, query, env: e });
      return (over.search ?? searchRoomHistory)(root, query, e);
    },
    stdout: (l) => out.push(l),
    stderr: (l) => err.push(l),
  };
  return async (
    positional: string[],
    flags: Record<string, string | boolean> = {},
    passthrough: string[] = [],
    verb = "search",
  ): Promise<Run> => {
    out.length = 0;
    err.length = 0;
    calls.length = 0;
    resolves = 0;
    const code = await runHistoryCommand(verb, { positional, passthrough }, flags, deps);
    // Each printed line must be one terminal line: a stdout call carrying "\n" shows up as extra lines.
    const lines = out.length === 0 ? [] : out.join("\n").split("\n");
    return { code, out: [...out], err: [...err], lines, resolves, calls: [...calls] };
  };
}

type Rec = { roomId?: string; seq?: number; ts?: string; type?: string; eventId?: string; body?: string };

function recLine(r: Rec = {}): string {
  return JSON.stringify({
    v: 1,
    roomId: r.roomId ?? ROOM_A,
    seq: r.seq ?? 1,
    eventId: r.eventId ?? "evt-1",
    ts: r.ts ?? "2026-10-01T00:00:00.000Z",
    type: r.type ?? "chat",
    envelope: { body: r.body ?? "hello world" },
  });
}

/** Writes a month file under the state root; returns its absolute path. */
function writeMonth(roomId: string, month: string, lines: string[], root = R): string {
  const dir = join(root, "rooms", roomKey(roomId), "events");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${month}.jsonl`);
  writeFileSync(path, lines.map((l) => `${l}\n`).join(""), { mode: 0o600 });
  return path;
}

/** Names + kinds + sizes + mtimes of every entry under `dir` (sorted, recursive). */
function snapshot(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string, rel: string) => {
    for (const name of readdirSync(d).sort()) {
      const abs = join(d, name);
      const st = lstatSync(abs);
      const kind = st.isSymbolicLink() ? "l" : st.isDirectory() ? "d" : "f";
      out.push(`${rel}${name} ${kind} ${st.size} ${st.mtimeMs}`);
      if (kind === "d") walk(abs, `${rel}${name}/`);
    }
  };
  walk(dir, "");
  return out;
}

/** Bidi / separator characters built from code points (kept out of the source text). */
const RLO = String.fromCharCode(0x202e);
const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);

/** Raw C0 (TAB · LF included), DEL, C1, bidi embedding/override/isolate controls — and U+2028/2029 for JSON. */
function hasRawUnsafe(s: string, json: boolean): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c <= 0x1f || (c >= 0x7f && c <= 0x9f)) return true;
    if ((c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069)) return true;
    if (json && (c === 0x2028 || c === 0x2029)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------
// D3 · R11 — LOOM_CARD refusal before argument handling, help and root resolution
// ---------------------------------------------------------------------------------------------

describe("LOOM_CARD refusal (D3 · R11)", () => {
  test("LOOM_CARD set → the refusal on stderr, exit 2, resolve and search never called", async () => {
    writeMonth(ROOM_A, "2026-10", [recLine()]);
    const run = cli({ env: { LOOM_CARD: "card-x" } });
    for (const [pos, flags, pass, verb] of [
      [["hello"], {}, [], "search"],
      [[], {}, [], ""],
      [["hello"], { help: true }, [], "search"],
      [[], { json: true, limit: "0" }, [], "bogus"],
      [[], {}, ["-x"], "search"],
    ] as [string[], Record<string, string | boolean>, string[], string][]) {
      const r = await run(pos, flags, pass, verb);
      expect(r.code).toBe(2);
      expect(r.out).toEqual([]);
      expect(r.err).toEqual([REFUSAL]);
      expect(r.resolves).toBe(0);
      expect(r.calls).toEqual([]);
    }
  });

  test('LOOM_CARD "" = not set → the search runs', async () => {
    writeMonth(ROOM_A, "2026-10", [recLine()]);
    const r = await cli({ env: { LOOM_CARD: "" } })(["hello"]);
    expect(r.code).toBe(0);
    expect(r.err).toEqual([]);
    expect(r.resolves).toBe(1);
    expect(r.calls.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------
// R9 · R10 · R14 — usage table (exit 2, no scan)
// ---------------------------------------------------------------------------------------------

describe("usage errors → exit 2, nothing scanned (R9 · R10 · R14)", () => {
  const cases: [string, string[], Record<string, string | boolean>, string[], string][] = [
    ["no positional", [], {}, [], "search"],
    ["two positionals", ["a", "b"], {}, [], "search"],
    ["empty query", [""], {}, [], "search"],
    ["blank query (trim → empty)", ["   \t "], {}, [], "search"],
    ["257 UTF-16 units", ["x".repeat(257)], {}, [], "search"],
    ["257 units after trim (surrogate pairs count 2)", [` ${"😀".repeat(128)}x `], {}, [], "search"],
    ["--month 2026-13", ["q"], { month: "2026-13" }, [], "search"],
    ["--month 2026-00", ["q"], { month: "2026-00" }, [], "search"],
    ["--month 2026-1", ["q"], { month: "2026-1" }, [], "search"],
    ["--limit 0", ["q"], { limit: "0" }, [], "search"],
    ["--limit 201", ["q"], { limit: "201" }, [], "search"],
    ["--limit 01", ["q"], { limit: "01" }, [], "search"],
    ["--limit -1", ["q"], { limit: "-1" }, [], "search"],
    ["--limit 1.5", ["q"], { limit: "1.5" }, [], "search"],
    ["--room without a value", ["q"], { room: true }, [], "search"],
    ["--room empty", ["q"], { room: "" }, [], "search"],
    ["--month without a value", ["q"], { month: true }, [], "search"],
    ["--limit without a value", ["q"], { limit: true }, [], "search"],
    ["positional and -- query", ["q"], {}, ["-x"], "search"],
    ["-- with two words", [], {}, ["-x", "-y"], "search"],
    ["-- with an empty word", [], {}, [""], "search"],
    ["unknown verb", ["q"], {}, [], "find"],
    ["no verb", [], {}, [], ""],
  ];
  for (const [name, pos, flags, pass, verb] of cases) {
    test(name, async () => {
      writeMonth(ROOM_A, "2026-10", [recLine({ body: "q x -x" })]);
      const r = await cli()(pos, flags, pass, verb);
      expect(r.code).toBe(2);
      expect(r.out).toEqual([]);
      expect(r.err).toEqual([USAGE]);
      expect(r.calls).toEqual([]);
    });
  }

  test("boundary values are accepted: 256 units · --limit 1 · --limit 200 · --month 2026-12", async () => {
    const run = cli();
    for (const [pos, flags] of [
      [["x".repeat(256)], {}],
      [[` ${"😀".repeat(128)} `], {}],
      [["q"], { limit: "1" }],
      [["q"], { limit: "200" }],
      [["q"], { month: "2026-12" }],
    ] as [string[], Record<string, string | boolean>][]) {
      const r = await run(pos, flags);
      expect(r.err).toEqual([]);
      expect(r.code).toBe(1);
      expect(r.calls.length).toBe(1);
    }
  });
});

describe("query and flag values handed to the scanner (R9 · R10)", () => {
  test("trimmed needle · default limit 20 · no room / month · deps env · resolved root", async () => {
    const env = { SOME_TOKEN: "abcdefgh12345678" };
    const r = await cli({ env })(["  hello world \n"], { profile: "work", unknown: "x" });
    expect(r.calls.length).toBe(1);
    const call = r.calls[0]!;
    expect(call.root).toBe(R);
    expect(call.env).toBe(env);
    expect(call.query.needle).toBe("hello world");
    expect(call.query.limit).toBe(20);
    expect(call.query.roomId).toBeUndefined();
    expect(call.query.month).toBeUndefined();
  });

  test("--room · --month · --limit go through as checked values", async () => {
    const r = await cli()(["q"], { room: ROOM_B, month: "2026-09", limit: "7" });
    const q = r.calls[0]!.query;
    expect(q).toEqual({ needle: "q", roomId: ROOM_B, month: "2026-09", limit: 7 });
  });

  test("`loom history search -- -x`: the single passthrough word is the query (R9)", async () => {
    writeMonth(ROOM_A, "2026-10", [recLine({ body: "flag -x here" })]);
    const r = await cli()([], {}, ["-x"]);
    expect(r.calls[0]!.query.needle).toBe("-x");
    expect(r.code).toBe(0);
    expect(r.lines).toEqual([
      "2026-10-01T00:00:00.000Z · room room-a · seq 1 · chat · evt-1",
      "  flag -x here",
      tail(1, 1, 0),
    ]);
  });

  test("an inner newline in the query is kept (only the ends are trimmed)", async () => {
    const r = await cli()(["\n a\nb \n"]);
    expect(r.calls[0]!.query.needle).toBe("a\nb");
  });
});

// ---------------------------------------------------------------------------------------------
// D6 · R12 · R13 — output verbatim
// ---------------------------------------------------------------------------------------------

describe("human output verbatim (D6 · R12 · R13)", () => {
  test("two lines per hit, no blank line between hits, then the tail (newest first)", async () => {
    writeMonth(ROOM_A, "2026-10", [
      recLine({ seq: 1, ts: "2026-10-01T00:00:00.000Z", eventId: "e-a1", body: "deploy alpha" }),
      recLine({ seq: 2, ts: "2026-10-03T00:00:00.000Z", eventId: "e-a2", type: "card.result", body: "Deploy beta" }),
      recLine({ seq: 3, ts: "2026-10-04T00:00:00.000Z", eventId: "e-a3", body: "nothing here" }),
    ]);
    writeMonth(ROOM_B, "2026-09", [
      recLine({ roomId: ROOM_B, seq: 9, ts: "2026-09-30T23:59:59Z", eventId: "e-b9", body: "DEPLOY gamma" }),
    ]);
    const r = await cli()(["deploy"]);
    expect(r.err).toEqual([]);
    expect(r.code).toBe(0);
    expect(r.lines).toEqual([
      "2026-10-03T00:00:00.000Z · room room-a · seq 2 · card.result · e-a2",
      "  Deploy beta",
      "2026-10-01T00:00:00.000Z · room room-a · seq 1 · chat · e-a1",
      "  deploy alpha",
      "2026-09-30T23:59:59Z · room room-b · seq 9 · chat · e-b9",
      "  DEPLOY gamma",
      tail(3, 2, 0),
    ]);
  });

  test("--limit stops the output; the tail counts printed hits; torn lines are summed", async () => {
    writeMonth(ROOM_A, "2026-10", [
      recLine({ seq: 1, ts: "2026-10-01T00:00:00.000Z", eventId: "e1", body: "match one" }),
      "{not json",
      recLine({ seq: 2, ts: "2026-10-02T00:00:00.000Z", eventId: "e2", body: "match two" }),
    ]);
    const r = await cli()(["match"], { limit: "1" });
    expect(r.code).toBe(0);
    expect(r.lines).toEqual([
      "2026-10-02T00:00:00.000Z · room room-a · seq 2 · chat · e2",
      "  match two",
      tail(1, 1, 1),
    ]);
  });

  test("no hits → only the tail, exit 1; no state root at all → 0 files, exit 1", async () => {
    writeMonth(ROOM_A, "2026-10", [recLine({ body: "other text" })]);
    const r = await cli()(["absent"]);
    expect(r.code).toBe(1);
    expect(r.err).toEqual([]);
    expect(r.lines).toEqual([tail(0, 1, 0)]);

    const missing = await cli({ root: join(R, "does-not-exist") })(["absent"]);
    expect(missing.code).toBe(1);
    expect(missing.lines).toEqual([tail(0, 0, 0)]);
  });

  test("incomplete lines follow the tail (stdout), path relative to the state root", async () => {
    writeMonth(ROOM_A, "2026-10", [recLine({ body: "found it" })]);
    mkdirSync(join(R, "rooms"), { recursive: true });
    writeFileSync(join(R, "rooms", roomKey(ROOM_B)), "not a dir");
    const r = await cli()(["found"]);
    expect(r.code).toBe(2);
    expect(r.err).toEqual([]);
    expect(r.lines).toEqual([
      "2026-10-01T00:00:00.000Z · room room-a · seq 1 · chat · evt-1",
      "  found it",
      tail(1, 1, 0),
      `incomplete: rooms/${roomKey(ROOM_B)} — not a directory`,
    ]);
  });
});

describe("--json output verbatim (D6 · R12)", () => {
  test("one object per hit in key order ts · roomId · seq · type · eventId · snippet, then the summary", async () => {
    writeMonth(ROOM_A, "2026-10", [
      recLine({ seq: 4, ts: "2026-10-05T00:00:00.000Z", eventId: "e4", body: "json hit" }),
      recLine({ seq: 5, ts: "2026-10-06T00:00:00.000Z", eventId: "e5", type: "card.result", body: "second JSON hit" }),
    ]);
    const r = await cli()(["json"], { json: true });
    expect(r.code).toBe(0);
    expect(r.err).toEqual([]);
    expect(r.lines).toEqual([
      '{"ts":"2026-10-06T00:00:00.000Z","roomId":"room-a","seq":5,"type":"card.result","eventId":"e5","snippet":"second JSON hit"}',
      '{"ts":"2026-10-05T00:00:00.000Z","roomId":"room-a","seq":4,"type":"chat","eventId":"e4","snippet":"json hit"}',
      '{"summary":{"hits":2,"files":1,"torn":0,"incomplete":[]}}',
    ]);
  });

  test("no hits → the summary line only, exit 1", async () => {
    const r = await cli()(["json"], { json: true });
    expect(r.code).toBe(1);
    expect(r.lines).toEqual(['{"summary":{"hits":0,"files":0,"torn":0,"incomplete":[]}}']);
  });

  test("incomplete + hit → hits and the summary with {file, reason}, exit 2", async () => {
    writeMonth(ROOM_A, "2026-10", [recLine({ body: "json hit" }), "torn"]);
    mkdirSync(join(R, "rooms", roomKey(ROOM_B)), { recursive: true });
    writeFileSync(join(R, "rooms", roomKey(ROOM_B), "events"), "not a dir");
    const r = await cli()(["json"], { json: true });
    expect(r.code).toBe(2);
    expect(r.lines).toEqual([
      '{"ts":"2026-10-01T00:00:00.000Z","roomId":"room-a","seq":1,"type":"chat","eventId":"evt-1","snippet":"json hit"}',
      `{"summary":{"hits":1,"files":1,"torn":1,"incomplete":[{"file":"rooms/${roomKey(ROOM_B)}/events","reason":"not a directory"}]}}`,
    ]);
  });
});

// ---------------------------------------------------------------------------------------------
// R12 · R63-M1 — escaping
// ---------------------------------------------------------------------------------------------

const NASTY_ROOM = "r\u009bA";
const NASTY_TYPE = `t${RLO}T`;
const NASTY_EVENT = "e\u007f\u001bE";
const NASTY_BODY = `needle \u009b${RLO}\u007f\u001b\tX`;

describe("escaping — human output (R12 · R63-M1)", () => {
  test("U+009B · U+202E · DEL · ESC · TAB in roomId / type / eventId / snippet → \\u{…}; no raw control", async () => {
    writeMonth(NASTY_ROOM, "2026-10", [
      recLine({ roomId: NASTY_ROOM, type: NASTY_TYPE, eventId: NASTY_EVENT, body: NASTY_BODY }),
    ]);
    const r = await cli()(["needle"]);
    expect(r.code).toBe(0);
    expect(r.lines).toEqual([
      "2026-10-01T00:00:00.000Z · room r\\u{9b}A · seq 1 · t\\u{202e}T · e\\u{7f}\\u{1b}E",
      "  needle \\u{9b}\\u{202e}\\u{7f}\\u{1b}\\u{9}X",
      tail(1, 1, 0),
    ]);
    for (const l of r.lines) expect(hasRawUnsafe(l, false)).toBe(false);
  });

  test("control characters in ts are made visible too", async () => {
    writeMonth(ROOM_A, "2026-10", [recLine({ ts: "2026\u001b[2J\t", body: "needle" })]);
    const r = await cli()(["needle"]);
    expect(r.lines[0]).toBe("2026\\u{1b}[2J\\u{9} · room room-a · seq 1 · chat · evt-1");
  });

  test("LF · TAB in eventId cannot forge an incomplete line or a tail — exactly two lines per hit", async () => {
    const forged = `e1\nincomplete: rooms — symlink\n${tail(0, 0, 0)}\tz`;
    writeMonth(ROOM_A, "2026-10", [
      recLine({ eventId: forged, type: "chat\nincomplete: x — too large", body: "needle" }),
    ]);
    const r = await cli()(["needle"]);
    expect(r.code).toBe(0);
    expect(r.lines).toEqual([
      `2026-10-01T00:00:00.000Z · room room-a · seq 1 · chat\\u{a}incomplete: x — too large · e1\\u{a}incomplete: rooms — symlink\\u{a}${tail(0, 0, 0)}\\u{9}z`,
      "  needle",
      tail(1, 1, 0),
    ]);
    expect(r.lines.filter((l) => l.startsWith("incomplete:"))).toEqual([]);
    for (const l of r.lines) expect(hasRawUnsafe(l, false)).toBe(false);
  });

  test("incomplete path and reason are escaped (scanner result injected)", async () => {
    const fake: SearchFn = () => ({
      hits: [],
      files: 0,
      torn: 0,
      incomplete: [{ file: `rooms/\u009bx${RLO}/events\n`, reason: "unreadable E\tX\u007f" }],
    });
    const r = await cli({ search: fake })(["q"]);
    expect(r.code).toBe(2);
    expect(r.lines).toEqual([
      tail(0, 0, 0),
      "incomplete: rooms/\\u{9b}x\\u{202e}/events\\u{a} — unreadable E\\u{9}X\\u{7f}",
    ]);
    for (const l of r.lines) expect(hasRawUnsafe(l, false)).toBe(false);
  });
});

describe("escaping — --json (R12: value-preserving JSON escapes, round-trips through JSON.parse)", () => {
  test("hit fields: no raw DEL · C1 · bidi · U+2028/2029 · C0 on the line; JSON.parse gives the original values", async () => {
    const eventId = `e\u007f\u001b\t\n${LS}${PS}E`;
    writeMonth(NASTY_ROOM, "2026-10", [
      recLine({ roomId: NASTY_ROOM, type: NASTY_TYPE, eventId, body: NASTY_BODY }),
    ]);
    const r = await cli()(["needle"], { json: true });
    expect(r.code).toBe(0);
    expect(r.lines.length).toBe(2);
    const line = r.lines[0]!;
    expect(hasRawUnsafe(line, true)).toBe(false);
    for (const esc of ["\\u009b", "\\u202e", "\\u007f", "\\u001b", "\\u2028", "\\u2029"]) {
      expect(line.toLowerCase()).toContain(esc);
    }
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual(["ts", "roomId", "seq", "type", "eventId", "snippet"]);
    expect(parsed).toEqual({
      ts: "2026-10-01T00:00:00.000Z",
      roomId: NASTY_ROOM,
      seq: 1,
      type: NASTY_TYPE,
      eventId,
      snippet: NASTY_BODY,
    });
    expect(JSON.parse(r.lines[1]!)).toEqual({ summary: { hits: 1, files: 1, torn: 0, incomplete: [] } });
  });

  test("incomplete file / reason in the summary are escaped and round-trip", async () => {
    const file = `rooms/\u009bx${RLO}${LS}/events`;
    const reason = "unreadable E\u007f";
    const fake: SearchFn = () => ({ hits: [], files: 0, torn: 0, incomplete: [{ file, reason }] });
    const r = await cli({ search: fake })(["q"], { json: true });
    expect(r.code).toBe(2);
    expect(r.lines.length).toBe(1);
    expect(hasRawUnsafe(r.lines[0]!, true)).toBe(false);
    expect(JSON.parse(r.lines[0]!)).toEqual({ summary: { hits: 0, files: 0, torn: 0, incomplete: [{ file, reason }] } });
  });
});

// ---------------------------------------------------------------------------------------------
// D7 · R14 — exit table
// ---------------------------------------------------------------------------------------------

describe("exit table (D7 · R14)", () => {
  test("hit → 0 · no hit → 1 · incomplete + hit → 2 (hits still printed) · incomplete, no hit → 2", async () => {
    writeMonth(ROOM_A, "2026-10", [recLine({ body: "alpha" })]);
    const run = cli();
    expect((await run(["alpha"])).code).toBe(0);
    expect((await run(["omega"])).code).toBe(1);

    const link = join(R, "rooms", roomKey(ROOM_B));
    mkdirSync(join(R, "elsewhere"), { recursive: true });
    symlinkSync(join(R, "elsewhere"), link);
    const both = await run(["alpha"]);
    expect(both.code).toBe(2);
    expect(both.lines.slice(0, 2)).toEqual([
      "2026-10-01T00:00:00.000Z · room room-a · seq 1 · chat · evt-1",
      "  alpha",
    ]);
    expect(both.lines.slice(2)).toEqual([tail(1, 1, 0), `incomplete: rooms/${roomKey(ROOM_B)} — symlink`]);

    const none = await run(["omega"]);
    expect(none.code).toBe(2);
    expect(none.lines).toEqual([tail(0, 1, 0), `incomplete: rooms/${roomKey(ROOM_B)} — symlink`]);
  });

  test("--room limits the scan to one room (D5)", async () => {
    writeMonth(ROOM_A, "2026-10", [recLine({ body: "shared word" })]);
    writeMonth(ROOM_B, "2026-10", [recLine({ roomId: ROOM_B, eventId: "eb", body: "shared word" })]);
    const r = await cli()(["shared"], { room: ROOM_B });
    expect(r.code).toBe(0);
    expect(r.lines).toEqual([
      "2026-10-01T00:00:00.000Z · room room-b · seq 1 · chat · eb",
      "  shared word",
      tail(1, 1, 0),
    ]);
  });
});

// ---------------------------------------------------------------------------------------------
// R1 · D8(3) — state root: the read-only mirror shared with `loom prompt show`
// ---------------------------------------------------------------------------------------------

describe("state root (R1 · D8(3))", () => {
  async function withTestHome<T>(home: string, fn: () => T | Promise<T>): Promise<T> {
    const prev = process.env.LOOM_TEST_HOME;
    process.env.LOOM_TEST_HOME = home;
    try {
      return await fn();
    } finally {
      if (prev === undefined) delete process.env.LOOM_TEST_HOME;
      else process.env.LOOM_TEST_HOME = prev;
    }
  }

  test(".loom exists → .loom (even with .fable present); tree unchanged", async () => {
    mkdirSync(join(R, ".loom"));
    mkdirSync(join(R, ".fable"));
    const before = snapshot(R);
    await withTestHome(R, () => {
      expect(readOnlyStateHome()).toBe(join(R, ".loom"));
      expect(realHistoryCliDeps().resolve()).toBe(join(R, ".loom"));
    });
    expect(snapshot(R)).toEqual(before);
  });

  test("only .fable → .fable (no migration); tree unchanged", async () => {
    mkdirSync(join(R, ".fable", "rooms"), { recursive: true });
    const before = snapshot(R);
    await withTestHome(R, () => {
      expect(readOnlyStateHome()).toBe(join(R, ".fable"));
      expect(realHistoryCliDeps().resolve()).toBe(join(R, ".fable"));
    });
    expect(snapshot(R)).toEqual(before);
  });

  test("neither → .loom, and nothing is created", async () => {
    await withTestHome(R, () => {
      expect(realHistoryCliDeps().resolve()).toBe(join(R, ".loom"));
    });
    expect(snapshot(R)).toEqual([]);
  });

  test("LOOM_TEST_HOME decides the home; a search over it writes nothing", async () => {
    const loom = join(R, ".loom");
    writeMonth(ROOM_A, "2026-10", [recLine({ body: "under test home" }), "torn"], loom);
    mkdirSync(join(R, ".fable"));
    const before = snapshot(R);
    await withTestHome(R, async () => {
      const deps = realHistoryCliDeps();
      expect(deps.resolve()).toBe(loom);
      const out: string[] = [];
      const code = await runHistoryCommand(
        "search",
        { positional: ["test home"], passthrough: [] },
        {},
        { ...deps, env: {}, stdout: (l) => out.push(l), stderr: (l) => out.push(`ERR ${l}`) },
      );
      expect(code).toBe(0);
      expect(out.join("\n").split("\n")).toEqual([
        "2026-10-01T00:00:00.000Z · room room-a · seq 1 · chat · evt-1",
        "  under test home",
        tail(1, 1, 1),
      ]);
    });
    expect(snapshot(R)).toEqual(before);
  });

  test("realHistoryCliDeps() resolves lazily — building it touches nothing", async () => {
    await withTestHome(R, () => {
      realHistoryCliDeps();
    });
    expect(snapshot(R)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// D8(5) — the real entry: refusal before help / --profile, nothing created
// ---------------------------------------------------------------------------------------------

const CLI = join(import.meta.dir, "index.ts");

function childEnv(T: string, extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue;
    if (/^(LOOM_|FABLE_)/.test(k)) continue; // relay token · url · profile · session · card never leak in
    env[k] = v;
  }
  return { ...env, HOME: T, LOOM_TEST_HOME: T, ...extra };
}

function spawnHistory(T: string, args: string[], extra: Record<string, string> = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    env: childEnv(T, extra),
    encoding: "utf8",
    timeout: 20_000,
  });
}

/** A temp HOME's tree without bun's own `Library/Caches` (HOME = T for the child). */
function snapshotHome(T: string): string[] {
  return snapshot(T).filter((l) => !l.startsWith("Library"));
}

describe("spawn: bun packages/cli/src/index.ts history (HOME = LOOM_TEST_HOME = temp) — D8(5) · R11", () => {
  test(
    "LOOM_CARD=x: `history --help` · `history search q --profile p` (and -h / --json forms) → the refusal, exit 2, no state root",
    () => {
      const T = mkdtempSync(join(tmpdir(), "loom-historycli-spawn-"));
      try {
        for (const args of [
          ["history", "--help"],
          ["history", "search", "q", "--profile", "p"],
          ["--profile", "p", "history", "search", "q", "-h"],
          ["history", "search", "--json", "q", "--help"],
          ["history"],
        ]) {
          const before = snapshotHome(T);
          const r = spawnHistory(T, args, { LOOM_CARD: "x" });
          expect(r.stdout).toBe("");
          expect(r.stderr).toBe(`${REFUSAL}\n`);
          expect(r.status).toBe(2);
          expect(snapshotHome(T)).toEqual(before);
          expect(readdirSync(T).filter((n) => n === ".loom" || n === ".fable")).toEqual([]);
        }
      } finally {
        rmSync(T, { recursive: true, force: true });
      }
    },
    60_000,
  );

  test(
    "without LOOM_CARD: `history search --json q` — --json does not swallow the query; empty home → summary, exit 1, nothing created",
    () => {
      const T = mkdtempSync(join(tmpdir(), "loom-historycli-spawn2-"));
      try {
        const before = snapshotHome(T);
        const r = spawnHistory(T, ["history", "search", "--json", "q"]);
        expect(r.stderr).toBe("");
        expect(r.stdout).toBe('{"summary":{"hits":0,"files":0,"torn":0,"incomplete":[]}}\n');
        expect(r.status).toBe(1);
        expect(snapshotHome(T)).toEqual(before);
      } finally {
        rmSync(T, { recursive: true, force: true });
      }
    },
    60_000,
  );

  test(
    "without LOOM_CARD: a usage error from the entry → stderr usage, exit 2",
    () => {
      const T = mkdtempSync(join(tmpdir(), "loom-historycli-spawn3-"));
      try {
        const r = spawnHistory(T, ["history", "search", "q", "--limit", "0"]);
        expect(r.stdout).toBe("");
        expect(r.stderr).toBe(`${USAGE}\n`);
        expect(r.status).toBe(2);
      } finally {
        rmSync(T, { recursive: true, force: true });
      }
    },
    60_000,
  );
});
