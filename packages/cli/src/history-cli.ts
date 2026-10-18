/**
 * PLAN 0.44.0 P2 — `loom history search <query> [--room <roomId>] [--month YYYY-MM] [--limit <n>]
 * [--json]` (D3 · D6 · D7 · D8(3)(4)(5) · R1 · R9–R14 · R63-M1).
 *
 * Read-only: resolves the state root through the `loom prompt show` mirror (`readOnlyStateHome()` —
 * never migrates `.fable`, R1) and hands the checked query to `searchRoomHistory`. Returns an exit
 * code (0 hit · 1 no hit · 2 usage / refused / incomplete scan) and `index.ts` only maps it. The
 * `LOOM_CARD` refusal runs before argument handling and before the root is resolved (R11 — a guard,
 * not a boundary). Human output runs every string field through `visibleText` plus TAB · LF escapes
 * so a field can never forge a line (R12 · R63-M1); `--json` keeps the values and escapes DEL · C1 ·
 * bidi controls · U+2028/2029 on top of `JSON.stringify` (R12).
 */
import { type HistoryQuery, type HistoryResult, searchRoomHistory } from "@loom/host";
import { readOnlyStateHome, visibleText } from "./prompt-cli";

export type HistoryCliDeps = {
  /** Injected env (R11 — `""` = not set); also the redaction env handed to the scanner. */
  env: Record<string, string | undefined>;
  /** Lazy (R11: never called under `LOOM_CARD`): the read-only state root. */
  resolve: () => string;
  search: (root: string, query: HistoryQuery, env: Record<string, string | undefined>) => HistoryResult;
  stdout: (line: string) => void;
  stderr: (line: string) => void;
};

export type HistoryCliArgs = { positional: readonly string[]; passthrough: readonly string[] };
export type HistoryCliFlags = Record<string, string | boolean>;

const USAGE =
  "loom history: usage: loom history search <query> [--room <roomId>] [--month YYYY-MM] [--limit <n>] [--json]";
const CARD_REFUSAL =
  "loom history: refused — LOOM_CARD is set (this shell belongs to a Loom card worker); room history is for the operator.";
const MAX_QUERY_UNITS = 256;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 200;
const LIMIT_RE = /^[1-9][0-9]*$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * After `JSON.stringify` (C0 already escaped): DEL, C1, bidi embedding/override/isolate, U+2028/2029.
 * Built from code points so the source carries no raw separator / bidi characters.
 */
const JSON_UNSAFE_RE = new RegExp(
  `[${(
    [
      [0x7f, 0x9f],
      [0x202a, 0x202e],
      [0x2066, 0x2069],
      [0x2028, 0x2029],
    ] as const
  )
    .map(([a, b]) => `${String.fromCharCode(a)}-${String.fromCharCode(b)}`)
    .join("")}]`,
  "g",
);

/** R12 · R63-M1: `visibleText` plus TAB · LF, so one field stays on one line. */
function oneLine(s: string): string {
  return visibleText(s).replace(/\t/g, "\\u{9}").replace(/\n/g, "\\u{a}");
}

/** R12: value-preserving — `JSON.parse` returns the original strings. */
function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(
    JSON_UNSAFE_RE,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

export async function runHistoryCommand(
  verb: string,
  args: HistoryCliArgs,
  flags: HistoryCliFlags,
  deps: HistoryCliDeps,
): Promise<number> {
  const usage = (): number => {
    deps.stderr(USAGE);
    return 2;
  };
  // R11: before argument handling; injected env, "" = not set. A guard, not a boundary.
  const card = deps.env.LOOM_CARD;
  if (typeof card === "string" && card.length > 0) {
    deps.stderr(CARD_REFUSAL);
    return 2;
  }

  if (verb !== "search") return usage();
  // R9: either one positional or exactly one word after `--` (`loom history search -- -x`).
  let raw: string;
  if (args.passthrough.length > 0) {
    if (args.positional.length !== 0 || args.passthrough.length !== 1) return usage();
    raw = args.passthrough[0]!;
  } else {
    if (args.positional.length !== 1) return usage();
    raw = args.positional[0]!;
  }
  const needle = raw.trim();
  if (needle.length === 0 || needle.length > MAX_QUERY_UNITS) return usage();

  const room = flags.room;
  if (room !== undefined && (typeof room !== "string" || room.length === 0)) return usage();
  const month = flags.month;
  if (month !== undefined && (typeof month !== "string" || !MONTH_RE.test(month))) return usage();
  const limitFlag = flags.limit;
  let limit = DEFAULT_LIMIT;
  if (limitFlag !== undefined) {
    if (typeof limitFlag !== "string" || !LIMIT_RE.test(limitFlag)) return usage();
    limit = Number(limitFlag);
    if (limit > MAX_LIMIT) return usage();
  }
  const json = flags.json;
  if (json !== undefined && json !== true) return usage();

  const query: HistoryQuery = { needle, limit };
  if (room !== undefined) query.roomId = room;
  if (month !== undefined) query.month = month;

  const result = deps.search(deps.resolve(), query, deps.env);

  if (json === true) {
    for (const h of result.hits) {
      deps.stdout(
        safeJson({ ts: h.ts, roomId: h.roomId, seq: h.seq, type: h.type, eventId: h.eventId, snippet: h.snippet }),
      );
    }
    deps.stdout(
      safeJson({
        summary: {
          hits: result.hits.length,
          files: result.files,
          torn: result.torn,
          incomplete: result.incomplete.map((i) => ({ file: i.file, reason: i.reason })),
        },
      }),
    );
  } else {
    for (const h of result.hits) {
      deps.stdout(
        `${oneLine(h.ts)} · room ${oneLine(h.roomId)} · seq ${h.seq} · ${oneLine(h.type)} · ${oneLine(h.eventId)}`,
      );
      deps.stdout(`  ${oneLine(h.snippet)}`);
    }
    deps.stdout(`${result.hits.length} hits · ${result.files} files scanned · ${result.torn} torn lines`);
    for (const i of result.incomplete) deps.stdout(`incomplete: ${oneLine(i.file)} — ${oneLine(i.reason)}`);
  }

  // D7 · R14: an incomplete scan wins over a hit (the hits are still printed).
  if (result.incomplete.length > 0) return 2;
  return result.hits.length > 0 ? 0 : 1;
}

/**
 * The CLI entry's deps: the read-only state-root mirror shared with `loom prompt show` (R1 · D8(3)),
 * `searchRoomHistory`, process.env, console output. Resolution is lazy so building the deps and the
 * LOOM_CARD refusal touch nothing (R11).
 */
export function realHistoryCliDeps(): HistoryCliDeps {
  return {
    env: process.env,
    resolve: () => readOnlyStateHome(),
    search: searchRoomHistory,
    stdout: (l) => console.log(l),
    stderr: (l) => console.error(l),
  };
}
