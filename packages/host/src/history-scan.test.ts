/**
 * PLAN 0.44.0 P1 (tests-first) — room history scanner (D2 · D4 · D5 · D8(1)(2)(3) · R2~R8 · R13 · R16).
 * - `searchRoomHistory(root, query, env)` over `rooms/<roomKey>/events/<YYYY-MM>.jsonl` (② table).
 * - Month files are hand-written bytes; one shape-parity case writes through `RoomEventStore.ingest`.
 * - Every root is a fresh mkdtemp dir under tmpdir(); env is injected (never the real process env).
 * The specifier stays a value so this tests-only commit typechecks before the module exists;
 * the missing module is the expected red.
 */
import { afterAll, describe, expect, test } from "bun:test";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Envelope, PROTOCOL_VERSION } from "@loom/protocol";
import { RoomEventStore, roomKey } from "./room-event-log";

const HISTORY_SCAN_SPECIFIER = "./history-scan";

type IncompleteReason = string;
type HistoryQuery = { needle: string; roomId?: string; month?: string; limit: number };
type HistoryHit = {
  ts: string;
  roomId: string;
  seq: number;
  type: string;
  eventId: string;
  snippet: string;
};
type HistoryResult = {
  hits: HistoryHit[];
  files: number;
  torn: number;
  incomplete: { file: string; reason: IncompleteReason }[];
};
type HistoryScanModule = {
  searchRoomHistory: (
    root: string,
    query: HistoryQuery,
    env: Record<string, string | undefined>,
  ) => HistoryResult;
  HISTORY_MONTH_FILE_MAX_BYTES: number;
  HISTORY_LEAF_DEPTH_MAX: number;
  HISTORY_QUERY_MAX_UNITS: number;
  HISTORY_LIMIT_DEFAULT: number;
  HISTORY_LIMIT_MAX: number;
  HISTORY_SNIPPET_RADIUS: number;
};

async function loadScan(): Promise<HistoryScanModule> {
  try {
    return (await import(HISTORY_SCAN_SPECIFIER)) as HistoryScanModule;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `v0.44.0 P1 history-scan is not implemented (${HISTORY_SCAN_SPECIFIER}): ${msg}`,
    );
  }
}

const roots: string[] = [];
function tempRoot(label: string): string {
  const d = mkdtempSync(join(tmpdir(), `loom-history-scan-${label}-`));
  roots.push(d);
  return d;
}
afterAll(() => {
  for (const d of roots) rmSync(d, { recursive: true, force: true });
});

const ROOM_A = "room_a";
const ROOM_B = "room_b";
const ROOM_C = "room_c";

const roomRel = (roomId: string): string => `rooms/${roomKey(roomId)}`;
const eventsDir = (root: string, roomId: string): string =>
  join(root, "rooms", roomKey(roomId), "events");
const monthRel = (roomId: string, month: string): string =>
  `${roomRel(roomId)}/events/${month}.jsonl`;

type RecInput = {
  roomId: string;
  seq: number;
  eventId: string;
  ts: string;
  type?: string;
  envelope?: unknown;
  text?: string;
};

function rec(r: RecInput): Record<string, unknown> {
  return {
    v: 1,
    roomId: r.roomId,
    seq: r.seq,
    eventId: r.eventId,
    ts: r.ts,
    type: r.type ?? "chat",
    envelope: r.envelope ?? { type: r.type ?? "chat", text: r.text ?? "find the needle here" },
  };
}
const ln = (r: RecInput): string => JSON.stringify(rec(r));

/** Writes one month file from raw lines (joined by LF; trailing LF unless `noFinalNewline`). */
function writeMonth(
  root: string,
  roomId: string,
  month: string,
  lines: (string | Buffer)[],
  opts: { noFinalNewline?: boolean } = {},
): string {
  const dir = eventsDir(root, roomId);
  mkdirSync(dir, { recursive: true });
  const parts: Buffer[] = [];
  lines.forEach((l, i) => {
    parts.push(typeof l === "string" ? Buffer.from(l, "utf8") : l);
    if (i < lines.length - 1 || !opts.noFinalNewline) parts.push(Buffer.from("\n"));
  });
  const file = join(dir, `${month}.jsonl`);
  writeFileSync(file, Buffer.concat(parts), { mode: 0o600 });
  return file;
}

async function scan(
  root: string,
  needle: string,
  opts: { roomId?: string; month?: string; limit?: number; env?: Record<string, string> } = {},
): Promise<HistoryResult> {
  const m = await loadScan();
  const q: HistoryQuery = { needle, limit: opts.limit ?? 20 };
  if (opts.roomId !== undefined) q.roomId = opts.roomId;
  if (opts.month !== undefined) q.month = opts.month;
  return m.searchRoomHistory(root, q, opts.env ?? {});
}

const ids = (r: HistoryResult): string[] => r.hits.map((h) => h.eventId);
const TS = "2026-10-01T00:00:00.000Z";

/** Single-string-leaf envelope so the joined search text equals `text`. */
function textRoot(text: string): string {
  const root = tempRoot("text");
  writeMonth(root, ROOM_A, "2026-10", [
    ln({ roomId: ROOM_A, seq: 1, eventId: "ev_t", ts: TS, envelope: { text } }),
  ]);
  return root;
}

describe("PLAN 0.44.0 ② — exported constants", () => {
  test("HISTORY_* constants carry the pinned values", async () => {
    const m = await loadScan();
    expect(m.HISTORY_MONTH_FILE_MAX_BYTES).toBe(64 * 1024 * 1024);
    expect(m.HISTORY_LEAF_DEPTH_MAX).toBe(32);
    expect(m.HISTORY_QUERY_MAX_UNITS).toBe(256);
    expect(m.HISTORY_LIMIT_DEFAULT).toBe(20);
    expect(m.HISTORY_LIMIT_MAX).toBe(200);
    expect(m.HISTORY_SNIPPET_RADIUS).toBe(80);
  });
});

describe("PLAN 0.44.0 P1 path table (D2 · R2 · R3)", () => {
  test("R3: no rooms/ → 0 hits · complete", async () => {
    const root = tempRoot("norooms");
    const r = await scan(root, "needle");
    expect(r).toEqual({ hits: [], files: 0, torn: 0, incomplete: [] });
  });

  test("R3: nonexistent root → 0 hits · complete · root not created", async () => {
    const root = join(tempRoot("noroot"), "absent");
    const r = await scan(root, "needle");
    expect(r).toEqual({ hits: [], files: 0, torn: 0, incomplete: [] });
    expect(existsSync(root)).toBe(false);
  });

  test("R3: names outside the rules are silently ignored (not incomplete)", async () => {
    const root = tempRoot("names");
    const good = ln({ roomId: ROOM_A, seq: 1, eventId: "ev_good", ts: TS });
    writeMonth(root, ROOM_A, "2026-10", [good]);
    const roomDir = join(root, "rooms", roomKey(ROOM_A));
    const ev = eventsDir(root, ROOM_A);
    writeFileSync(join(roomDir, "seen.json"), "{not json");
    writeFileSync(join(roomDir, ".lock"), "");
    writeFileSync(join(roomDir, "guideline.md"), "needle");
    const decoy = ln({ roomId: ROOM_A, seq: 2, eventId: "ev_decoy", ts: TS });
    for (const name of [
      "notes.txt",
      "2026-13.jsonl",
      "2026-00.jsonl",
      "2026-1.jsonl",
      "202610.jsonl",
      "2026-10.jsonl.bak",
      ".2026-10.jsonl",
    ]) {
      writeFileSync(join(ev, name), `${decoy}\n`);
    }
    symlinkSync(join(ev, "2026-10.jsonl"), join(ev, "2026-11.json"));
    // Room-level names that are not 16 lowercase hex.
    for (const name of ["NOTHEX", "ABCDEF0123456789", `${roomKey(ROOM_A)}0`]) {
      mkdirSync(join(root, "rooms", name, "events"), { recursive: true });
      writeFileSync(join(root, "rooms", name, "events", "2026-10.jsonl"), `${decoy}\n`);
    }
    writeFileSync(join(root, "rooms", "README"), "needle");
    symlinkSync(join(root, "rooms", "NOTHEX"), join(root, "rooms", "link-not-hex"));

    const r = await scan(root, "needle");
    expect(ids(r)).toEqual(["ev_good"]);
    expect(r.files).toBe(1);
    expect(r.torn).toBe(0);
    expect(r.incomplete).toEqual([]);
  });

  test("R3: room without events/ is an empty room (complete)", async () => {
    const root = tempRoot("noevents");
    mkdirSync(join(root, "rooms", roomKey(ROOM_A)), { recursive: true });
    writeFileSync(join(root, "rooms", roomKey(ROOM_A), "seen.json"), "{}");
    const r = await scan(root, "needle");
    expect(r).toEqual({ hits: [], files: 0, torn: 0, incomplete: [] });
  });

  test("R3: rooms/ symlink → one incomplete `rooms — symlink` · nothing scanned", async () => {
    const root = tempRoot("roomslink");
    const real = tempRoot("roomslink-target");
    writeMonth(real, ROOM_A, "2026-10", [ln({ roomId: ROOM_A, seq: 1, eventId: "ev_x", ts: TS })]);
    symlinkSync(join(real, "rooms"), join(root, "rooms"));
    const r = await scan(root, "needle");
    expect(r).toEqual({
      hits: [],
      files: 0,
      torn: 0,
      incomplete: [{ file: "rooms", reason: "symlink" }],
    });
  });

  test("R3: rooms/ is a file → `rooms — not a directory`", async () => {
    const root = tempRoot("roomsfile");
    writeFileSync(join(root, "rooms"), "needle");
    const r = await scan(root, "needle");
    expect(r).toEqual({
      hits: [],
      files: 0,
      torn: 0,
      incomplete: [{ file: "rooms", reason: "not a directory" }],
    });
  });

  test("R3: room dir symlink → `symlink` · other rooms still scanned", async () => {
    const root = tempRoot("roomlink");
    writeMonth(root, ROOM_A, "2026-10", [ln({ roomId: ROOM_A, seq: 1, eventId: "ev_a", ts: TS })]);
    const target = tempRoot("roomlink-target");
    writeMonth(target, ROOM_B, "2026-10", [ln({ roomId: ROOM_B, seq: 1, eventId: "ev_b", ts: TS })]);
    symlinkSync(join(target, "rooms", roomKey(ROOM_B)), join(root, "rooms", roomKey(ROOM_B)));
    const r = await scan(root, "needle");
    expect(ids(r)).toEqual(["ev_a"]);
    expect(r.incomplete).toEqual([{ file: roomRel(ROOM_B), reason: "symlink" }]);
  });

  test("R3: room dir is a file → `not a directory`", async () => {
    const root = tempRoot("roomfile");
    writeMonth(root, ROOM_A, "2026-10", [ln({ roomId: ROOM_A, seq: 1, eventId: "ev_a", ts: TS })]);
    writeFileSync(join(root, "rooms", roomKey(ROOM_B)), "needle");
    const r = await scan(root, "needle");
    expect(ids(r)).toEqual(["ev_a"]);
    expect(r.incomplete).toEqual([{ file: roomRel(ROOM_B), reason: "not a directory" }]);
  });

  test("R3: events/ symlink → `symlink`", async () => {
    const root = tempRoot("eventslink");
    const target = tempRoot("eventslink-target");
    writeMonth(target, ROOM_A, "2026-10", [ln({ roomId: ROOM_A, seq: 1, eventId: "ev_a", ts: TS })]);
    mkdirSync(join(root, "rooms", roomKey(ROOM_A)), { recursive: true });
    symlinkSync(eventsDir(target, ROOM_A), eventsDir(root, ROOM_A));
    const r = await scan(root, "needle");
    expect(r.hits).toEqual([]);
    expect(r.incomplete).toEqual([{ file: `${roomRel(ROOM_A)}/events`, reason: "symlink" }]);
  });

  test("R3: events/ is a file → `not a directory`", async () => {
    const root = tempRoot("eventsfile");
    mkdirSync(join(root, "rooms", roomKey(ROOM_A)), { recursive: true });
    writeFileSync(eventsDir(root, ROOM_A), "needle");
    const r = await scan(root, "needle");
    expect(r.hits).toEqual([]);
    expect(r.incomplete).toEqual([
      { file: `${roomRel(ROOM_A)}/events`, reason: "not a directory" },
    ]);
  });

  test("R3: month file symlink → `symlink` (target not read)", async () => {
    const root = tempRoot("monthlink");
    const outside = join(tempRoot("monthlink-target"), "outside.jsonl");
    writeFileSync(outside, `${ln({ roomId: ROOM_A, seq: 1, eventId: "ev_out", ts: TS })}\n`);
    mkdirSync(eventsDir(root, ROOM_A), { recursive: true });
    symlinkSync(outside, join(eventsDir(root, ROOM_A), "2026-10.jsonl"));
    const r = await scan(root, "needle");
    expect(r.hits).toEqual([]);
    expect(r.files).toBe(0);
    expect(r.incomplete).toEqual([{ file: monthRel(ROOM_A, "2026-10"), reason: "symlink" }]);
  });

  test("R3: month file is a directory → `not a regular file`", async () => {
    const root = tempRoot("monthdir");
    mkdirSync(join(eventsDir(root, ROOM_A), "2026-10.jsonl"), { recursive: true });
    const r = await scan(root, "needle");
    expect(r.hits).toEqual([]);
    expect(r.incomplete).toEqual([
      { file: monthRel(ROOM_A, "2026-10"), reason: "not a regular file" },
    ]);
  });

  test(
    "D2: FIFO month file → `not a regular file` without blocking",
    async () => {
      const root = tempRoot("fifo");
      mkdirSync(eventsDir(root, ROOM_A), { recursive: true });
      const fifo = join(eventsDir(root, ROOM_A), "2026-10.jsonl");
      const made = Bun.spawnSync(["mkfifo", fifo], {
        env: { ...process.env, HOME: root, LOOM_TEST_HOME: root },
      });
      expect(made.exitCode).toBe(0);
      expect(lstatSync(fifo).isFIFO()).toBe(true);
      const started = Date.now();
      const r = await scan(root, "needle");
      expect(Date.now() - started).toBeLessThan(2000);
      expect(r.hits).toEqual([]);
      expect(r.incomplete).toEqual([
        { file: monthRel(ROOM_A, "2026-10"), reason: "not a regular file" },
      ]);
    },
    5000,
  );

  test(
    "D2 · R63-L2: sparse month file of cap + 1 bytes → `too large`",
    async () => {
      const m = await loadScan();
      const root = tempRoot("toolarge");
      writeMonth(root, ROOM_A, "2026-09", [
        ln({ roomId: ROOM_A, seq: 1, eventId: "ev_ok", ts: "2026-09-01T00:00:00Z" }),
      ]);
      const big = join(eventsDir(root, ROOM_A), "2026-10.jsonl");
      writeFileSync(big, "");
      truncateSync(big, m.HISTORY_MONTH_FILE_MAX_BYTES + 1);
      const r = await scan(root, "needle");
      expect(ids(r)).toEqual(["ev_ok"]);
      expect(r.incomplete).toEqual([{ file: monthRel(ROOM_A, "2026-10"), reason: "too large" }]);
    },
    20000,
  );

  test(
    "D2: month file of exactly the cap is read (not too large)",
    async () => {
      const m = await loadScan();
      const root = tempRoot("atcap");
      const file = join(eventsDir(root, ROOM_A), "2026-10.jsonl");
      mkdirSync(eventsDir(root, ROOM_A), { recursive: true });
      writeFileSync(file, "");
      truncateSync(file, m.HISTORY_MONTH_FILE_MAX_BYTES);
      const r = await scan(root, "needle");
      expect(r.incomplete).toEqual([]);
      expect(r.files).toBe(1);
      expect(r.torn).toBe(1);
    },
    20000,
  );

  test("R13: incomplete entries are sorted by path", async () => {
    const root = tempRoot("sorted");
    for (const roomId of [ROOM_A, ROOM_B, ROOM_C]) {
      mkdirSync(join(root, "rooms", roomKey(roomId)), { recursive: true });
      writeFileSync(eventsDir(root, roomId), "x");
    }
    const r = await scan(root, "needle");
    const files = r.incomplete.map((i) => i.file);
    expect(files).toEqual([...files].sort());
    expect(files.length).toBe(3);
  });
});

describe("PLAN 0.44.0 P1 line table (R4 · R5 · R63-L1)", () => {
  const good = (eventId: string, seq: number): string =>
    ln({ roomId: ROOM_A, seq, eventId, ts: TS });
  const bad: { name: string; line: string | Buffer }[] = [
    { name: "broken JSON", line: '{"v":1,"roomId":"room_a","seq":' },
    {
      name: "invalid UTF-8",
      line: Buffer.concat([
        Buffer.from(
          '{"v":1,"roomId":"room_a","seq":9,"eventId":"ev_bad","ts":"2026-10-01T00:00:00.000Z","type":"chat","envelope":{"text":"needle ',
        ),
        Buffer.from([0xff]),
        Buffer.from('"}}'),
      ]),
    },
    { name: "v 2", line: JSON.stringify({ ...rec({ roomId: ROOM_A, seq: 9, eventId: "ev_bad", ts: TS }), v: 2 }) },
    { name: "seq string", line: JSON.stringify({ ...rec({ roomId: ROOM_A, seq: 9, eventId: "ev_bad", ts: TS }), seq: "9" }) },
    { name: "eventId missing", line: JSON.stringify({ ...rec({ roomId: ROOM_A, seq: 9, eventId: "ev_bad", ts: TS }), eventId: undefined }) },
    { name: "ts number", line: JSON.stringify({ ...rec({ roomId: ROOM_A, seq: 9, eventId: "ev_bad", ts: TS }), ts: 5 }) },
    { name: "type missing", line: JSON.stringify({ ...rec({ roomId: ROOM_A, seq: 9, eventId: "ev_bad", ts: TS }), type: undefined }) },
    { name: "roomId number", line: JSON.stringify({ ...rec({ roomId: ROOM_A, seq: 9, eventId: "ev_bad", ts: TS }), roomId: 7 }) },
    { name: "envelope null", line: JSON.stringify({ ...rec({ roomId: ROOM_A, seq: 9, eventId: "ev_bad", ts: TS }), envelope: null }) },
    { name: "envelope string", line: JSON.stringify({ ...rec({ roomId: ROOM_A, seq: 9, eventId: "ev_bad", ts: TS }), envelope: "needle" }) },
    { name: "top-level null", line: "null" },
    { name: "top-level string", line: '"needle"' },
    { name: "other room roomId (roomKey mismatch)", line: ln({ roomId: ROOM_B, seq: 9, eventId: "ev_bad", ts: TS }) },
    {
      name: "seq 1e999 (R63-L1)",
      line: '{"v":1,"roomId":"room_a","seq":1e999,"eventId":"ev_bad","ts":"2026-10-01T00:00:00.000Z","type":"chat","envelope":{"text":"needle"}}',
    },
  ];

  for (const b of bad) {
    test(`R4/R5: ${b.name} → torn 1 · neighbouring good line kept`, async () => {
      const root = tempRoot("torn");
      writeMonth(root, ROOM_A, "2026-10", [good("ev_before", 1), b.line, good("ev_after", 2)]);
      const r = await scan(root, "needle");
      expect(r.torn).toBe(1);
      expect([...ids(r)].sort()).toEqual(["ev_after", "ev_before"]);
      expect(r.incomplete).toEqual([]);
    });
  }

  test("R5: empty lines are not counted · final line without LF is a record", async () => {
    const root = tempRoot("empty");
    writeMonth(root, ROOM_A, "2026-10", ["", good("ev_1", 1), "", "", good("ev_2", 2)], {
      noFinalNewline: true,
    });
    const r = await scan(root, "needle");
    expect(r.torn).toBe(0);
    expect(r.files).toBe(1);
    expect([...ids(r)].sort()).toEqual(["ev_1", "ev_2"]);
  });

  test("R5: torn final fragment without LF counts as one torn line", async () => {
    const root = tempRoot("tornfinal");
    writeMonth(root, ROOM_A, "2026-10", [good("ev_1", 1), '{"v":1,"roomId":"ro'], {
      noFinalNewline: true,
    });
    const r = await scan(root, "needle");
    expect(r.torn).toBe(1);
    expect(ids(r)).toEqual(["ev_1"]);
  });

  test("R5: torn lines sum across all opened files", async () => {
    const root = tempRoot("tornsum");
    writeMonth(root, ROOM_A, "2026-10", [good("ev_1", 1), "{x", "{y"]);
    writeMonth(root, ROOM_B, "2026-10", [ln({ roomId: ROOM_B, seq: 1, eventId: "ev_b", ts: TS }), "{z"]);
    const r = await scan(root, "needle");
    expect(r.torn).toBe(3);
    expect(r.files).toBe(2);
  });
});

describe("PLAN 0.44.0 P1 leaves (D4 · R6)", () => {
  test("R6: depth-first · integer-shaped keys first ascending · joined with LF", async () => {
    const root = tempRoot("leaves");
    const envelopeJson = '{"b":"BBB","a":{"x":"XXX"},"2":"TWO","1":"ONE","arr":["P","Q"]}';
    const line = `{"v":1,"roomId":"room_a","seq":1,"eventId":"ev_l","ts":"${TS}","type":"chat","envelope":${envelopeJson}}`;
    writeMonth(root, ROOM_A, "2026-10", [line]);
    const r = await scan(root, "TWO");
    expect(r.hits.length).toBe(1);
    expect(r.hits[0]?.snippet).toBe("ONE TWO BBB XXX P Q");
    // The join is "\n" — a needle may straddle two leaves (R9 · undeclared-number note).
    expect((await scan(root, "TWO\nBBB")).hits.length).toBe(1);
  });

  test("R6: subtree deeper than 32 is skipped · the rest of the record is searched", async () => {
    const nest = (n: number, leaf: string): unknown => {
      let v: unknown = leaf;
      for (let i = 0; i < n; i++) v = { k: v };
      return v;
    };
    const root = tempRoot("depth");
    writeMonth(root, ROOM_A, "2026-10", [
      ln({
        roomId: ROOM_A,
        seq: 1,
        eventId: "ev_d",
        ts: TS,
        envelope: { shallow: nest(31, "ATDEPTH32"), deep: nest(32, "ATDEPTH33"), s: "SIBLING" },
      }),
    ]);
    expect(ids(await scan(root, "ATDEPTH32"))).toEqual(["ev_d"]);
    expect(ids(await scan(root, "SIBLING"))).toEqual(["ev_d"]);
    const deep = await scan(root, "ATDEPTH33");
    expect(deep.hits).toEqual([]);
    expect(deep.torn).toBe(0);
  });

  test("R6: number · boolean · null leaves are not searched; record fields outside envelope neither", async () => {
    const root = tempRoot("nonstring");
    writeMonth(root, ROOM_A, "2026-10", [
      ln({
        roomId: ROOM_A,
        seq: 777001,
        eventId: "ev_zz9",
        ts: TS,
        envelope: { n: 424242, b: true, z: null, s: "plain" },
      }),
    ]);
    expect((await scan(root, "424242")).hits).toEqual([]);
    expect((await scan(root, "true")).hits).toEqual([]);
    expect((await scan(root, "null")).hits).toEqual([]);
    expect((await scan(root, "777001")).hits).toEqual([]);
    expect((await scan(root, "plain")).hits.length).toBe(1);
  });

  test("R6 · class 74: card-result attachment JSON text is one string leaf (escaped form)", async () => {
    const root = tempRoot("attach");
    const content = JSON.stringify({
      status: "done",
      output: 'line one\nGREPME "quoted"',
      summary: "short sum",
    });
    writeMonth(root, ROOM_A, "2026-10", [
      ln({
        roomId: ROOM_A,
        seq: 1,
        eventId: "ev_card",
        ts: TS,
        type: "chat",
        envelope: { type: "chat", attachments: [{ kind: "card-result", content }] },
      }),
    ]);
    const hit = await scan(root, "grepme");
    expect(ids(hit)).toEqual(["ev_card"]);
    expect(hit.hits[0]?.snippet).toContain('line one\\nGREPME \\"quoted\\"');
    expect((await scan(root, "one\nGREPME")).hits).toEqual([]);
    expect(ids(await scan(root, "one\\nGREPME"))).toEqual(["ev_card"]);
  });
});

describe("PLAN 0.44.0 P1 redaction before match (D4 · R16 · classes 69 · 70)", () => {
  test("R16: env secret value → no hit on a secret fragment · snippet shows [REDACTED]", async () => {
    const secret = "envsecretvalue12345";
    const root = textRoot(`before ${secret} after`);
    const env = { LOOM_API_TOKEN: secret };
    expect((await scan(root, "envsecret", { env })).hits).toEqual([]);
    const r = await scan(root, "before", { env });
    expect(r.hits.length).toBe(1);
    expect(r.hits[0]?.snippet).not.toContain(secret);
    expect(r.hits[0]?.snippet).toBe("before [REDACTED] after");
  });

  test("R16: the injected env is the only env source (not process.env)", async () => {
    const secret = "injectedonly987654";
    const root = textRoot(`x ${secret} y`);
    expect((await scan(root, secret, { env: {} })).hits.length).toBe(1);
    expect((await scan(root, secret, { env: { MY_SECRET: secret } })).hits).toEqual([]);
  });

  test("R16 · R63-L3: env filter — non-sensitive names and values under 8 chars are not redacted", async () => {
    const root = textRoot("visiblevalue123 and short7 here");
    const env = { PLAIN_NAME: "visiblevalue123", LOOM_TOKEN: "short7" };
    expect((await scan(root, "visiblevalue123", { env })).hits.length).toBe(1);
    expect((await scan(root, "short7", { env })).hits.length).toBe(1);
  });

  test("R16: known shape sk-ant-… → no hit on the secret · `REDACTED` matches (class 70)", async () => {
    const root = textRoot("key sk-ant-abcdefghijk12345 end");
    expect((await scan(root, "sk-ant-abc")).hits).toEqual([]);
    expect((await scan(root, "abcdefghijk12345")).hits).toEqual([]);
    const r = await scan(root, "REDACTED");
    expect(r.hits.length).toBe(1);
    expect(r.hits[0]?.snippet).toBe("key [REDACTED] end");
  });

  test("class 69 · R63-L4: quoted assignment inside attachment JSON text is NOT redacted (pinned)", async () => {
    const root = tempRoot("cls69");
    const content = JSON.stringify({ output: 'config "token":"plainsecret99" done' });
    writeMonth(root, ROOM_A, "2026-10", [
      ln({
        roomId: ROOM_A,
        seq: 1,
        eventId: "ev_69",
        ts: TS,
        envelope: { attachments: [{ content }] },
      }),
    ]);
    const r = await scan(root, "plainsecret99");
    expect(ids(r)).toEqual(["ev_69"]);
    expect(r.hits[0]?.snippet).toContain('\\"token\\":\\"plainsecret99\\"');
  });
});

describe("PLAN 0.44.0 P1 match · snippet (D4 · D6 · R7)", () => {
  test("D4: case-insensitive substring both ways", async () => {
    const root = textRoot("Hello WORLD");
    expect((await scan(root, "world")).hits.length).toBe(1);
    expect((await scan(root, "HELLO")).hits.length).toBe(1);
    expect((await scan(root, "hello world")).hits.length).toBe(1);
    expect((await scan(root, "worlds")).hits).toEqual([]);
  });

  test("R7: İ (lowercase grows to 2 units) — snippet cut from the original text offsets", async () => {
    const text = `${"İ".repeat(100)}NEEDLE${"z".repeat(100)}`;
    const root = textRoot(text);
    const r = await scan(root, "needle");
    expect(r.hits[0]?.snippet).toBe(`…${"İ".repeat(80)}NEEDLE${"z".repeat(80)}…`);
    expect(ids(await scan(textRoot("aXİYb"), "xİy"))).toEqual(["ev_t"]);
  });

  test("R7: Σ (Final_Sigma) — match and snippet stay aligned", async () => {
    const upper = "ΟΔΟΣ";
    const text = `${"Σ".repeat(90)} word ${upper} end`;
    const root = textRoot(text);
    expect((await scan(root, "οδος")).hits.length).toBe(1);
    const r = await scan(root, upper);
    expect(r.hits.length).toBe(1);
    const at = text.indexOf(upper);
    expect(r.hits[0]?.snippet).toBe(`…${text.slice(at - 80)}`);
  });

  test("R7: ±80 units with … on both cut ends", async () => {
    const root = textRoot(`${"x".repeat(200)}MID${"y".repeat(200)}`);
    const r = await scan(root, "mid");
    expect(r.hits[0]?.snippet).toBe(`…${"x".repeat(80)}MID${"y".repeat(80)}…`);
  });

  test("R7: no … when nothing is cut", async () => {
    const root = textRoot("short needle text");
    expect((await scan(root, "needle")).hits[0]?.snippet).toBe("short needle text");
  });

  test("R7: snippet surrounds the first match", async () => {
    const root = textRoot(`first NEEDLE ${"m".repeat(300)} second NEEDLE tail`);
    const s = (await scan(root, "needle")).hits[0]?.snippet ?? "";
    expect(s.startsWith("first NEEDLE ")).toBe(true);
    expect(s.endsWith("…")).toBe(true);
    expect(s).not.toContain("second");
  });

  test("R7: window start on a low surrogate moves +1 (pair not split)", async () => {
    const text = `😀${"b".repeat(79)}NEEDLE`;
    const r = await scan(textRoot(text), "needle");
    expect(r.hits[0]?.snippet).toBe(`…${"b".repeat(79)}NEEDLE`);
  });

  test("R7: window end right after a high surrogate moves −1 (pair not split)", async () => {
    const text = `NEEDLE${"c".repeat(79)}😀tail`;
    const r = await scan(textRoot(text), "needle");
    expect(r.hits[0]?.snippet).toBe(`NEEDLE${"c".repeat(79)}…`);
  });

  test("R7: whole pair kept when it lies inside the window", async () => {
    const text = `a😀b NEEDLE c😀d`;
    expect((await scan(textRoot(text), "needle")).hits[0]?.snippet).toBe(text);
  });

  test("R7: CRLF · CR · LF each become one space", async () => {
    const root = textRoot("line1\r\nline2\rline3\nNEEDLE");
    expect((await scan(root, "needle")).hits[0]?.snippet).toBe("line1 line2 line3 NEEDLE");
  });
});

describe("PLAN 0.44.0 P1 order · stop (D5 · R8 · R13 · R63-M2 · M3 · L6)", () => {
  test("R8: months newest first", async () => {
    const root = tempRoot("months");
    for (const [month, day] of [
      ["2026-08", "2026-08-05T00:00:00Z"],
      ["2026-10", "2026-10-05T00:00:00Z"],
      ["2026-09", "2026-09-05T00:00:00Z"],
    ] as const) {
      writeMonth(root, ROOM_A, month, [ln({ roomId: ROOM_A, seq: 1, eventId: `ev_${month}`, ts: day })]);
    }
    const r = await scan(root, "needle");
    expect(ids(r)).toEqual(["ev_2026-10", "ev_2026-09", "ev_2026-08"]);
    expect(r.files).toBe(3);
  });

  test("R8: inside a month, hits from all rooms by ts desc (not seq)", async () => {
    const root = tempRoot("acrossrooms");
    writeMonth(root, ROOM_A, "2026-10", [
      ln({ roomId: ROOM_A, seq: 900, eventId: "ev_a900", ts: "2026-10-01T10:00:01Z" }),
      ln({ roomId: ROOM_A, seq: 901, eventId: "ev_a901", ts: "2026-10-01T10:00:03Z" }),
    ]);
    writeMonth(root, ROOM_B, "2026-10", [
      ln({ roomId: ROOM_B, seq: 3, eventId: "ev_b3", ts: "2026-10-01T10:00:05Z" }),
    ]);
    expect(ids(await scan(root, "needle"))).toEqual(["ev_b3", "ev_a901", "ev_a900"]);
  });

  test("R63-M3: mixed fractional ts compare numerically (…:00.500Z after …:00Z in time)", async () => {
    const root = tempRoot("millis");
    writeMonth(root, ROOM_A, "2026-10", [
      ln({ roomId: ROOM_A, seq: 2, eventId: "ev_whole", ts: "2026-10-01T00:00:00Z" }),
    ]);
    writeMonth(root, ROOM_B, "2026-10", [
      ln({ roomId: ROOM_B, seq: 1, eventId: "ev_half", ts: "2026-10-01T00:00:00.500Z" }),
    ]);
    expect(ids(await scan(root, "needle"))).toEqual(["ev_half", "ev_whole"]);
  });

  test("R8: ts failing the pattern sorts after valid ones · ties roomId asc → seq desc", async () => {
    const root = tempRoot("badts");
    writeMonth(root, ROOM_A, "2026-10", [
      ln({ roomId: ROOM_A, seq: 5, eventId: "ev_a_bad5", ts: "not-a-time" }),
      ln({ roomId: ROOM_A, seq: 1, eventId: "ev_a_ok", ts: "2026-10-01T00:00:00Z" }),
      ln({ roomId: ROOM_A, seq: 6, eventId: "ev_a_bad6", ts: "2026-10-01T09:00:00+09:00" }),
    ]);
    writeMonth(root, ROOM_B, "2026-10", [
      ln({ roomId: ROOM_B, seq: 9, eventId: "ev_b_bad9", ts: "2026-10-01 00:00:00" }),
      ln({ roomId: ROOM_B, seq: 1, eventId: "ev_b_old", ts: "2026-09-30T00:00:00Z" }),
    ]);
    expect(ids(await scan(root, "needle"))).toEqual([
      "ev_a_ok",
      "ev_b_old",
      "ev_a_bad6",
      "ev_a_bad5",
      "ev_b_bad9",
    ]);
  });

  test("R8: tie keys — same ts → roomId asc → seq desc → line number desc", async () => {
    const root = tempRoot("ties");
    writeMonth(root, ROOM_B, "2026-10", [
      ln({ roomId: ROOM_B, seq: 50, eventId: "ev_b50", ts: TS }),
    ]);
    writeMonth(root, ROOM_A, "2026-10", [
      ln({ roomId: ROOM_A, seq: 1, eventId: "ev_a1", ts: TS }),
      ln({ roomId: ROOM_A, seq: 7, eventId: "ev_a7_line2", ts: TS }),
      ln({ roomId: ROOM_A, seq: 7, eventId: "ev_a7_line3", ts: TS }),
    ]);
    expect(ids(await scan(root, "needle"))).toEqual([
      "ev_a7_line3",
      "ev_a7_line2",
      "ev_a1",
      "ev_b50",
    ]);
  });

  test("R63-M2: all-matching synthetic month + limit 3 → first 3 of the full order", async () => {
    const root = tempRoot("synthetic");
    type Row = { roomId: string; seq: number; eventId: string; ts: string; line: number };
    const rows: Row[] = [];
    let x = 12345;
    const next = (): number => {
      x = (x * 1103515245 + 12345) % 2147483648;
      return x;
    };
    for (const roomId of [ROOM_A, ROOM_B]) {
      const lines: string[] = [];
      for (let i = 1; i <= 40; i++) {
        const mm = String(next() % 5).padStart(2, "0");
        const ss = String(next() % 3).padStart(2, "0");
        const frac = next() % 2 === 0 ? "" : `.${String(next() % 1000).padStart(3, "0")}`;
        const ts = `2026-10-01T00:${mm}:${ss}${frac}Z`;
        const seq = next() % 4;
        const eventId = `ev_${roomId}_${i}`;
        rows.push({ roomId, seq, eventId, ts, line: i });
        lines.push(ln({ roomId, seq, eventId, ts }));
      }
      writeMonth(root, roomId, "2026-10", lines);
    }
    const expected = [...rows]
      .sort(
        (p, q) =>
          Date.parse(q.ts) - Date.parse(p.ts) ||
          (p.roomId < q.roomId ? -1 : p.roomId > q.roomId ? 1 : 0) ||
          q.seq - p.seq ||
          q.line - p.line,
      )
      .map((r) => r.eventId);
    const top = await scan(root, "needle", { limit: 3 });
    expect(top.hits.length).toBe(3);
    expect(ids(top)).toEqual(expected.slice(0, 3));
    const all = await scan(root, "needle", { limit: 200 });
    expect(ids(all)).toEqual(expected);
  });

  test("R8 · R13 · R63-L6: limit reached → month finished · older files not opened · dir-level incomplete still reported", async () => {
    const root = tempRoot("stop");
    writeMonth(root, ROOM_A, "2026-10", [
      ln({ roomId: ROOM_A, seq: 1, eventId: "ev_a10_1", ts: "2026-10-01T00:00:01Z" }),
      ln({ roomId: ROOM_A, seq: 2, eventId: "ev_a10_2", ts: "2026-10-01T00:00:03Z" }),
    ]);
    writeMonth(root, ROOM_A, "2026-09", [
      ln({ roomId: ROOM_A, seq: 1, eventId: "ev_a09", ts: "2026-09-01T00:00:00Z" }),
      "{torn",
    ]);
    writeMonth(root, ROOM_A, "2026-08", [
      ln({ roomId: ROOM_A, seq: 1, eventId: "ev_a08", ts: "2026-08-01T00:00:00Z" }),
    ]);
    writeMonth(root, ROOM_B, "2026-10", [
      ln({ roomId: ROOM_B, seq: 1, eventId: "ev_b10", ts: "2026-10-01T00:00:02Z" }),
    ]);
    const outside = join(tempRoot("stop-target"), "outside.jsonl");
    writeFileSync(outside, `${ln({ roomId: ROOM_B, seq: 2, eventId: "ev_out", ts: "2026-09-02T00:00:00Z" })}\n`);
    symlinkSync(outside, join(eventsDir(root, ROOM_B), "2026-09.jsonl"));
    const target = tempRoot("stop-room");
    writeMonth(target, ROOM_C, "2026-10", [ln({ roomId: ROOM_C, seq: 1, eventId: "ev_c", ts: TS })]);
    symlinkSync(join(target, "rooms", roomKey(ROOM_C)), join(root, "rooms", roomKey(ROOM_C)));

    const limited = await scan(root, "needle", { limit: 2 });
    expect(ids(limited)).toEqual(["ev_a10_2", "ev_b10"]);
    expect(limited.files).toBe(2);
    expect(limited.torn).toBe(0);
    expect(limited.incomplete).toEqual([{ file: roomRel(ROOM_C), reason: "symlink" }]);

    const exact = await scan(root, "needle", { limit: 3 });
    expect(ids(exact)).toEqual(["ev_a10_2", "ev_b10", "ev_a10_1"]);
    expect(exact.files).toBe(2);

    const full = await scan(root, "needle");
    expect(ids(full)).toEqual(["ev_a10_2", "ev_b10", "ev_a10_1", "ev_a09", "ev_a08"]);
    expect(full.files).toBe(4);
    expect(full.torn).toBe(1);
    expect(full.incomplete).toEqual(
      [
        { file: monthRel(ROOM_B, "2026-09"), reason: "symlink" },
        { file: roomRel(ROOM_C), reason: "symlink" },
      ].sort((p, q) => (p.file < q.file ? -1 : p.file > q.file ? 1 : 0)),
    );
  });

  test("D5: roomId restricts to that room only", async () => {
    const root = tempRoot("roomfilter");
    writeMonth(root, ROOM_A, "2026-10", [ln({ roomId: ROOM_A, seq: 1, eventId: "ev_a", ts: TS })]);
    writeMonth(root, ROOM_B, "2026-10", [ln({ roomId: ROOM_B, seq: 1, eventId: "ev_b", ts: TS })]);
    writeMonth(root, ROOM_B, "2026-09", [
      ln({ roomId: ROOM_B, seq: 2, eventId: "ev_b9", ts: "2026-09-01T00:00:00Z" }),
    ]);
    const r = await scan(root, "needle", { roomId: ROOM_B });
    expect(ids(r)).toEqual(["ev_b", "ev_b9"]);
    expect(r.files).toBe(2);
    expect(r.hits.every((h) => h.roomId === ROOM_B)).toBe(true);
  });

  test("D5: month restricts to that month only", async () => {
    const root = tempRoot("monthfilter");
    for (const roomId of [ROOM_A, ROOM_B]) {
      writeMonth(root, roomId, "2026-10", [ln({ roomId, seq: 1, eventId: `ev_${roomId}_10`, ts: TS })]);
      writeMonth(root, roomId, "2026-09", [
        ln({ roomId, seq: 1, eventId: `ev_${roomId}_09`, ts: "2026-09-01T00:00:00Z" }),
      ]);
    }
    const r = await scan(root, "needle", { month: "2026-09" });
    expect(ids(r)).toEqual([`ev_${ROOM_A}_09`, `ev_${ROOM_B}_09`]);
    expect(r.files).toBe(2);
    const both = await scan(root, "needle", { month: "2026-09", roomId: ROOM_B });
    expect(ids(both)).toEqual([`ev_${ROOM_B}_09`]);
    expect(both.files).toBe(1);
  });

  test("② HistoryHit fields come from the record", async () => {
    const root = tempRoot("fields");
    writeMonth(root, ROOM_A, "2026-10", [
      ln({
        roomId: ROOM_A,
        seq: 42,
        eventId: "ev_fields",
        ts: "2026-10-03T04:05:06.789Z",
        type: "card.result",
        envelope: { text: "the needle" },
      }),
    ]);
    const r = await scan(root, "needle");
    expect(r.hits).toEqual([
      {
        ts: "2026-10-03T04:05:06.789Z",
        roomId: ROOM_A,
        seq: 42,
        type: "card.result",
        eventId: "ev_fields",
        snippet: "the needle",
      },
    ]);
  });
});

describe("PLAN 0.44.0 P1 shape parity with RoomEventStore.ingest", () => {
  test("a file written by RoomEventStore.ingest is read back as one hit", async () => {
    const root = tempRoot("parity");
    const ts = "2026-07-15T12:00:00.000Z";
    const env = {
      v: PROTOCOL_VERSION,
      type: "chat",
      roomId: "room_parity",
      ts,
      from: "p1",
      text: "parity-needle body",
      eventId: "ev_parity",
      seq: 7,
    } as Envelope;
    const store = new RoomEventStore({ dir: root, consumer: "bridge" });
    const res = await store.ingest(env);
    expect(res.logged).toBe(true);
    expect(existsSync(join(eventsDir(root, "room_parity"), "2026-07.jsonl"))).toBe(true);
    const r = await scan(root, "PARITY-NEEDLE");
    expect(r).toEqual({
      hits: [
        {
          ts,
          roomId: "room_parity",
          seq: 7,
          type: "chat",
          eventId: "ev_parity",
          snippet: ["chat", "room_parity", ts, "p1", "parity-needle body", "ev_parity"].join(" "),
        },
      ],
      files: 1,
      torn: 0,
      incomplete: [],
    });
  });
});

describe("PLAN 0.44.0 P1 no side effects (D2 · D8(1))", () => {
  type Entry = string;
  function snapshot(dir: string): Entry[] {
    const out: Entry[] = [];
    const walk = (abs: string, rel: string): void => {
      const st = lstatSync(abs);
      const kind = st.isSymbolicLink() ? "l" : st.isDirectory() ? "d" : st.isFIFO() ? "p" : "f";
      out.push(`${rel}\t${kind}\t${st.mode}\t${st.size}\t${st.mtimeMs}`);
      if (kind === "d") {
        for (const name of readdirSync(abs).sort()) walk(join(abs, name), rel ? `${rel}/${name}` : name);
      }
    };
    walk(dir, "");
    return out;
  }

  test("tree listing + mtimes identical · no .corrupt* · no lock files · no .fable → .loom migration", async () => {
    const home = tempRoot("home");
    const saved = { HOME: process.env.HOME, LOOM_TEST_HOME: process.env.LOOM_TEST_HOME };
    process.env.HOME = home;
    process.env.LOOM_TEST_HOME = home;
    try {
      const root = join(home, ".fable");
      writeMonth(root, ROOM_A, "2026-10", [
        ln({ roomId: ROOM_A, seq: 1, eventId: "ev_1", ts: TS }),
        "{torn",
      ]);
      writeMonth(root, ROOM_A, "2026-09", [
        ln({ roomId: ROOM_A, seq: 1, eventId: "ev_2", ts: "2026-09-01T00:00:00Z" }),
      ]);
      writeFileSync(join(root, "rooms", roomKey(ROOM_A), "seen.json"), "{garbage");
      mkdirSync(join(root, "rooms", roomKey(ROOM_B)), { recursive: true });
      writeFileSync(eventsDir(root, ROOM_B), "not a dir");
      const fifoDir = eventsDir(root, ROOM_C);
      mkdirSync(fifoDir, { recursive: true });
      expect(Bun.spawnSync(["mkfifo", join(fifoDir, "2026-10.jsonl")], {
        env: { ...process.env, HOME: home, LOOM_TEST_HOME: home },
      }).exitCode).toBe(0);

      const before = snapshot(home);
      const r = await scan(root, "needle");
      await scan(root, "nothing-matches-this");
      await scan(root, "needle", { limit: 1, month: "2026-10", roomId: ROOM_A });
      const after = snapshot(home);

      expect(ids(r)).toEqual(["ev_1", "ev_2"]);
      expect(after).toEqual(before);
      expect(existsSync(join(home, ".loom"))).toBe(false);
      const names = after.map((e) => e.split("\t")[0] ?? "");
      expect(names.filter((n) => /\.corrupt/.test(n))).toEqual([]);
      expect(names.filter((n) => /\.lock|\.reclaim/.test(n))).toEqual([]);
    } finally {
      if (saved.HOME === undefined) delete process.env.HOME;
      else process.env.HOME = saved.HOME;
      if (saved.LOOM_TEST_HOME === undefined) delete process.env.LOOM_TEST_HOME;
      else process.env.LOOM_TEST_HOME = saved.LOOM_TEST_HOME;
    }
  }, 10000);

  test("D8(1)(2): history-scan.ts source does not call the store, the unbounded reader, root resolvers, async readFile or write APIs", async () => {
    const raw = readFileSync(join(import.meta.dir, "history-scan.ts"), "utf8");
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    for (const name of ["readRoomEventLog", "RoomEventStore", "loomDir", "resolveStateHomeDir"]) {
      expect(src.includes(name)).toBe(false);
    }
    expect(/\breadFile\b(?!Sync)/.test(src)).toBe(false);
    expect(src.includes("node:fs/promises")).toBe(false);
    const writeApi =
      /\b(write|writeFile|writeSync|writeFileSync|appendFile|appendFileSync|mkdir|mkdirSync|mkdtemp|mkdtempSync|rename|renameSync|unlink|unlinkSync|rm|rmSync|rmdir|rmdirSync|chmod|chmodSync|truncate|truncateSync|symlink|symlinkSync|copyFile|copyFileSync)\s*\(/;
    expect(src.match(writeApi)?.[0] ?? null).toBeNull();
  });
});

describe("PLAN 0.44.0 P1b — bounded memory · metadata redaction (Astra 0137)", () => {
  type SeamCandidate = {
    tsValid: boolean;
    tsNum: number;
    roomId: string;
    seq: number;
    line: number;
    ts: string;
    type: string;
    eventId: string;
    window: { text: string; base: number; total: number; start: number; end: number };
  };
  type SeamModule = {
    keepTop: (buf: SeamCandidate[], cand: SeamCandidate, cap: number) => void;
  };

  const r8 = (p: SeamCandidate, q: SeamCandidate): number => {
    if (p.tsValid !== q.tsValid) return p.tsValid ? -1 : 1;
    if (p.tsValid && p.tsNum !== q.tsNum) return q.tsNum - p.tsNum;
    if (p.roomId !== q.roomId) return p.roomId < q.roomId ? -1 : 1;
    if (p.seq !== q.seq) return q.seq - p.seq;
    return q.line - p.line;
  };

  test("R63-M2 seam: keepTop with cap 3 never holds more than 3 and ends at the top 3 of a full sort", async () => {
    const { keepTop } = (await loadScan()) as unknown as SeamModule;
    let x = 777;
    const next = (): number => {
      x = (x * 1103515245 + 12345) % 2147483648;
      return x;
    };
    const all: SeamCandidate[] = [];
    const buf: SeamCandidate[] = [];
    for (let i = 1; i <= 1000; i++) {
      const tsValid = next() % 7 !== 0;
      const cand: SeamCandidate = {
        tsValid,
        tsNum: tsValid ? next() % 50 : 0,
        roomId: next() % 2 === 0 ? ROOM_A : ROOM_B,
        seq: next() % 5,
        line: i,
        ts: "",
        type: "chat",
        eventId: `ev_${i}`,
        window: { text: "", base: 0, total: 0, start: 0, end: 0 },
      };
      all.push(cand);
      keepTop(buf, cand, 3);
      expect(buf.length).toBeLessThanOrEqual(3);
    }
    const expected = [...all].sort(r8).slice(0, 3).map((c) => c.eventId);
    expect(buf.map((c) => c.eventId)).toEqual(expected);
  });

  test("M2: secret-shaped eventId and type are redacted in the hit", async () => {
    const root = tempRoot("metasecret");
    writeMonth(root, ROOM_A, "2026-10", [
      ln({
        roomId: ROOM_A,
        seq: 1,
        eventId: "sk-ant-abcdefghijk12345",
        ts: TS,
        type: "sk-ant-zyxwvutsrq98765",
        envelope: { text: "find the needle here" },
      }),
    ]);
    const r = await scan(root, "needle");
    expect(r.hits.length).toBe(1);
    const hit = r.hits[0];
    expect(hit?.eventId).toContain("[REDACTED]");
    expect(hit?.eventId).not.toContain("abcdefghijk12345");
    expect(hit?.type).toContain("[REDACTED]");
    expect(hit?.type).not.toContain("zyxwvutsrq98765");
    expect(hit?.roomId).toBe(ROOM_A);
    expect(hit?.ts).toBe(TS);
  });

  test("M2: env-value secret inside eventId is redacted with the filtered env", async () => {
    const root = tempRoot("metaenv");
    writeMonth(root, ROOM_A, "2026-10", [
      ln({ roomId: ROOM_A, seq: 1, eventId: "ev_supersecretvalue1", ts: TS }),
    ]);
    const r = await scan(root, "needle", { env: { LOOM_TOKEN: "supersecretvalue1" } });
    expect(r.hits.length).toBe(1);
    expect(r.hits[0]?.eventId).not.toContain("supersecretvalue1");
    expect(r.hits[0]?.eventId).toContain("[REDACTED]");
  });

  test("M1: a 4 MiB non-matching ASCII record next to a small matching one → exactly 1 hit", async () => {
    const root = tempRoot("bignomatch");
    writeMonth(root, ROOM_A, "2026-10", [
      ln({ roomId: ROOM_A, seq: 1, eventId: "ev_big", ts: TS, envelope: { text: "q".repeat(4 * 1024 * 1024) } }),
      ln({ roomId: ROOM_A, seq: 2, eventId: "ev_small", ts: TS, envelope: { text: "a needle" } }),
    ]);
    const r = await scan(root, "needle");
    expect(ids(r)).toEqual(["ev_small"]);
    expect(r.torn).toBe(0);
  }, 20000);

  test("M1: a 1 MiB matching record → snippet bounded by the window (same ±80 shape)", async () => {
    const half = 512 * 1024;
    const root = textRoot(`${"a".repeat(half)}NEEDLE${"b".repeat(half)}`);
    const r = await scan(root, "needle");
    const s = r.hits[0]?.snippet ?? "";
    const m = await loadScan();
    expect(s.length).toBeLessThanOrEqual(2 * m.HISTORY_SNIPPET_RADIUS + 2 + "NEEDLE".length);
    expect(s).toBe(`…${"a".repeat(80)}NEEDLE${"b".repeat(80)}…`);
  }, 20000);
});

describe("PLAN 0.44.0 P1c — incomplete path redaction (Astra 0139 M1)", () => {
  test("M1: a room dir name equal to an env secret → incomplete file is redacted", async () => {
    const root = tempRoot("incompleteenv");
    writeMonth(root, ROOM_A, "2026-10", [ln({ roomId: ROOM_A, seq: 1, eventId: "ev_a", ts: TS })]);
    writeFileSync(join(root, "rooms", "0123456789abcdef"), "x");
    const r = await scan(root, "needle", { env: { LOOM_TOKEN: "0123456789abcdef" } });
    expect(r.incomplete.length).toBe(1);
    expect(r.incomplete[0]?.file).toContain("[REDACTED]");
    expect(r.incomplete[0]?.file).not.toContain("0123456789abcdef");
    expect(r.incomplete[0]?.reason).toBe("not a directory");
  });
});
