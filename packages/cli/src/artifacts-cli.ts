/**
 * PLAN 0.45.0 P3 — `loom artifacts list [--conv <convId>] [--limit <n>] [--json]` · `loom artifacts verify
 * [--json]` (D5 · R2 · R12–R15).
 *
 * Read-only: resolves the state root through the `loom prompt show` mirror (`readOnlyStateHome()` — never
 * migrates `.fable`, R2) and hands the checked values to `listArtifactRows` / `verifyArtifactStore`. Returns
 * an exit code (list: 0 rows · 1 no rows; verify: 0 clean · 1 problems; 2 usage / refused / index
 * unreadable) and `index.ts` only maps it. The `LOOM_CARD` refusal runs before argument handling and before
 * the root is resolved (R12 — a guard, not a boundary). Human output runs every string field through
 * `visibleText` plus TAB · LF escapes so a field can never forge a line (R14); `--json` keeps the values and
 * escapes DEL · C1 · bidi controls · U+2028/2029 on top of `JSON.stringify` (R14).
 */
import {
  type ArtifactListResult,
  type ArtifactVerifyResult,
  listArtifactRows,
  MAX_WORKER_ARTIFACT_BYTES,
  verifyArtifactStore,
} from "@loom/host";
import { readOnlyStateHome, visibleText } from "./prompt-cli";

export type ArtifactsCliDeps = {
  /** Injected env (R12 — `""` = not set). */
  env: Record<string, string | undefined>;
  /** Lazy (R12: never called under `LOOM_CARD`): the read-only state root. */
  resolve: () => string;
  list: (root: string, query: { convId?: string; limit: number }) => ArtifactListResult;
  verify: (root: string, maxBytes: number) => ArtifactVerifyResult;
  stdout: (line: string) => void;
  stderr: (line: string) => void;
};

export type ArtifactsCliArgs = { positional: readonly string[]; passthrough: readonly string[] };
export type ArtifactsCliFlags = Record<string, string | boolean>;

const USAGE =
  "loom artifacts: usage: loom artifacts list [--conv <convId>] [--limit <n>] [--json] | loom artifacts verify [--json]";
const CARD_REFUSAL =
  "loom artifacts: refused — LOOM_CARD is set (this shell belongs to a Loom card worker); the artifact store is for the operator.";
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
const LIMIT_RE = /^[1-9][0-9]*$/;

/**
 * After `JSON.stringify` (C0 already escaped): DEL, C1, bidi embedding/override/isolate, U+2028/2029.
 * Built from code points so the source carries no raw separator / bidi characters (history-cli mirror).
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

/** R14: `visibleText` plus TAB · LF, so one field stays on one line. */
function oneLine(s: string): string {
  return visibleText(s).replace(/\t/g, "\\u{9}").replace(/\n/g, "\\u{a}");
}

/** R14: value-preserving — `JSON.parse` returns the original strings. */
function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(
    JSON_UNSAFE_RE,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

export async function runArtifactsCommand(
  verb: string,
  args: ArtifactsCliArgs,
  flags: ArtifactsCliFlags,
  deps: ArtifactsCliDeps,
): Promise<number> {
  const usage = (): number => {
    deps.stderr(USAGE);
    return 2;
  };
  const unreadable = (reason: string): number => {
    deps.stderr(`loom artifacts: index unreadable — ${oneLine(reason)}`);
    return 2;
  };
  // R12: before argument handling; injected env, "" = not set. A guard, not a boundary.
  const card = deps.env.LOOM_CARD;
  if (typeof card === "string" && card.length > 0) {
    deps.stderr(CARD_REFUSAL);
    return 2;
  }

  if (verb !== "list" && verb !== "verify") return usage();
  if (args.positional.length !== 0 || args.passthrough.length !== 0) return usage();
  const json = flags.json;
  if (json !== undefined && json !== true) return usage();

  if (verb === "verify") {
    if (flags.conv !== undefined || flags.limit !== undefined) return usage();
    const result = deps.verify(deps.resolve(), MAX_WORKER_ARTIFACT_BYTES);
    if (!result.ok) return unreadable(result.reason);
    if (json === true) {
      for (const p of result.problems) deps.stdout(safeJson({ problem: { sha256: p.sha256, reason: p.reason } }));
      for (const o of result.orphans) deps.stdout(safeJson({ info: { name: o.name } }));
      deps.stdout(
        safeJson({
          summary: {
            checked: result.checked,
            problems: result.problems.length,
            orphans: result.orphans.length,
            torn: result.torn,
          },
        }),
      );
    } else {
      for (const p of result.problems) deps.stdout(`problem: ${oneLine(p.sha256)} — ${oneLine(p.reason)}`);
      for (const o of result.orphans) deps.stdout(`info: orphan ${oneLine(o.name)}`);
      deps.stdout(
        `${result.checked} blobs checked · ${result.problems.length} problems · ${result.orphans.length} orphans · ${result.torn} torn lines`,
      );
    }
    return result.problems.length > 0 ? 1 : 0;
  }

  const conv = flags.conv;
  if (conv !== undefined && (typeof conv !== "string" || conv.length === 0)) return usage();
  const limitFlag = flags.limit;
  let limit = DEFAULT_LIMIT;
  if (limitFlag !== undefined) {
    if (typeof limitFlag !== "string" || !LIMIT_RE.test(limitFlag)) return usage();
    limit = Number(limitFlag);
    if (limit > MAX_LIMIT) return usage();
  }
  const query: { convId?: string; limit: number } = { limit };
  if (conv !== undefined) query.convId = conv;

  const result = deps.list(deps.resolve(), query);
  if (!result.ok) return unreadable(result.reason);
  if (json === true) {
    for (const r of result.rows) {
      deps.stdout(
        safeJson({
          v: r.v,
          sha256: r.sha256,
          bytes: r.bytes,
          name: r.name,
          convId: r.convId,
          seq: r.seq,
          index: r.index,
          transport: r.transport,
          status: r.status,
          at: r.at,
        }),
      );
    }
    deps.stdout(safeJson({ summary: { rows: result.rows.length, torn: result.torn } }));
  } else {
    for (const r of result.rows) {
      deps.stdout(
        `${oneLine(r.at)} · ${oneLine(r.sha256)} · ${r.bytes} B · conv ${oneLine(r.convId)} · seq ${r.seq} · index ${r.index} · ${oneLine(r.name)}`,
      );
    }
    deps.stdout(`${result.rows.length} rows · ${result.torn} torn lines`);
  }
  return result.rows.length > 0 ? 0 : 1;
}

/**
 * The CLI entry's deps: the read-only state-root mirror shared with `loom prompt show` / `loom history
 * search` (R2), the host store's read-only list / verify, process.env, console output. Resolution is lazy so
 * building the deps and the LOOM_CARD refusal touch nothing (R12).
 */
export function realArtifactsCliDeps(): ArtifactsCliDeps {
  return {
    env: process.env,
    resolve: () => readOnlyStateHome(),
    list: listArtifactRows,
    verify: verifyArtifactStore,
    stdout: (l) => console.log(l),
    stderr: (l) => console.error(l),
  };
}
