/**
 * Architect tool: watch a herdr pane worker card until a terminal condition.
 *
 * Exit reasons (mutually exclusive report — first hit wins, then stop):
 *   marker    — caller-supplied completion marker in pane text
 *   pane-gone — pane missing from `herdr pane list` (death / finish-close / manual kill)
 *   limit     — lane usage / auth / rate-limit signal in pane text
 *   timeout   — budget exhausted (default 30 min)
 *
 * Design rule: "if this worker dies now, does my filter print something?"
 * Silence is never success. Every terminal path must report a reason.
 *
 * Usage:
 *   bun run scripts/watch-card.ts --pane <id> --marker <string>
 *   bun run scripts/watch-card.ts --agent <kind> --cwd <path> --marker <string>
 *   bun run watch:card --pane w3:p52 --marker '[WATCH-CARD-DONE]'
 *
 * Options:
 *   --pane <id>           herdr pane id (e.g. w3:p52)
 *   --agent <kind>        agent kind for auto-discovery (claude|codex|grok)
 *   --cwd <path>          cwd for auto-discovery (with --agent)
 *   --marker <string>     literal completion marker (substring match)
 *   --marker-re <pattern> RegExp source (alternative to --marker)
 *   --timeout-ms <n>      timeout budget (default 1800000 = 30 min)
 *   --interval-ms <n>     poll interval (default 2000)
 *   --tail-lines <n>      only inspect last N lines for marker (default 40)
 *   --herdr <bin>         herdr binary (default "herdr")
 *
 * Marker anti-false-positive (dispatch prompt echo):
 *   1. Baseline — first successful pane read is snapshotted; matches already
 *      present then are ignored (only newly appeared matches complete).
 *   2. Template — lines still carrying placeholders (`<a|b>`, `<n/n>`) are
 *      not accepted as completion (instruction echo, not filled output).
 *   3. Tail — only the last N lines are inspected (real markers land at end).
 *
 * herdr surfaces (live contract, 2026-07-20):
 *   herdr pane list       → JSON envelope { id, result: { panes: [...] } }
 *   herdr pane read <id>  → plain text (NOT JSON — unlike agent read)
 */
import { resolve as resolvePath } from "node:path";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ExitReason = "marker" | "pane-gone" | "limit" | "timeout";

export type WatchDecision =
  | { action: "exit"; reason: ExitReason; detail?: string }
  | { action: "continue" };

export type PaneInfo = {
  pane_id: string;
  agent?: string;
  cwd?: string;
  agent_status?: string;
  label?: string;
  terminal_title?: string;
};

/** Options for marker matching (template / tail / baseline). */
export type MarkerMatchOptions = {
  /**
   * Only inspect the last N lines. Default: DEFAULT_MARKER_TAIL_LINES.
   * Pass `0` or a non-positive value to inspect the full text.
   */
  tailLines?: number;
  /**
   * When true (default), reject lines that still contain unfilled placeholders
   * such as `<closed|open|partial>` or `<n/n>`.
   */
  rejectPlaceholders?: boolean;
};

/** Synthetic / live tick facts for pure evaluation. */
export type TickInput = {
  /** Pane screen text (plain). null = read failed / unavailable this tick. */
  text: string | null;
  /** Whether the target pane id appears in the current list. */
  panePresent: boolean;
  /** Completion marker: literal string (substring) or RegExp. */
  marker: string | RegExp;
  /** Milliseconds elapsed since watch start. */
  elapsedMs: number;
  /** Timeout budget in ms. */
  timeoutMs: number;
  /**
   * Screen snapshot at watch start (first successful read). Matches that
   * already existed in the baseline are ignored — only newly appeared
   * accepted matches count as completion. Omit / null = no baseline filter
   * (backward-compatible pure-unit path).
   */
  baselineText?: string | null;
  /** Forwarded to marker matching (default DEFAULT_MARKER_TAIL_LINES). */
  markerTailLines?: number;
};

// ─── Limit signals ───────────────────────────────────────────────────────────

/** Known lane limit / auth failure substrings (case-insensitive). */
export const LIMIT_SIGNALS: readonly string[] = [
  "usage limit reached",
  "Weekly limit",
  "Authentication failed",
  "rate limit",
] as const;

const LIMIT_RES: readonly RegExp[] = LIMIT_SIGNALS.map(
  (s) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
);

/**
 * Detect a lane limit / auth failure signal in pane text.
 * Returns the matched signal string, or null if none.
 */
export function detectLimitSignal(text: string): string | null {
  for (let i = 0; i < LIMIT_RES.length; i++) {
    if (LIMIT_RES[i]!.test(text)) return LIMIT_SIGNALS[i]!;
  }
  return null;
}

// ─── Marker ──────────────────────────────────────────────────────────────────

/** Default: only the last N lines of the pane are scanned for markers. */
export const DEFAULT_MARKER_TAIL_LINES = 40;

/**
 * True when a line still looks like an instruction template rather than a
 * filled completion line. Dispatch prompts echo forms like
 * `fix1=<closed|open|partial>` or `units=<n/n>`; real output fills values
 * (`fix1=closed`, `units=5/5`).
 *
 * Conservative: only angle-bracket placeholder shapes — not bare `|` or
 * generic punctuation — so real markers with unusual content still pass.
 */
export function hasUnfilledPlaceholder(line: string): boolean {
  // Alternatives: <closed|open|partial>, <ok|fail>
  if (/<[^>\n]*\|[^>\n]*>/.test(line)) return true;
  // Ratio / path-ish slots: <n/n>, <count/total>
  if (/<[A-Za-z0-9_./-]+\/[A-Za-z0-9_./-]+>/.test(line)) return true;
  // Named slots: <reason>, <string>, <closed>
  if (/<[A-Za-z_][A-Za-z0-9_-]*>/.test(line)) return true;
  return false;
}

/** Last N lines of text (joined). Non-positive n → full text. */
export function tailText(text: string, n: number): string {
  if (!Number.isFinite(n) || n <= 0) return text;
  const lines = text.split("\n");
  if (lines.length <= n) return text;
  return lines.slice(-n).join("\n");
}

/**
 * Lines (within optional tail window) that contain an accepted marker match.
 * Template/placeholder lines are dropped when rejectPlaceholders is on (default).
 */
export function listAcceptedMarkerLines(
  text: string,
  marker: string | RegExp,
  opts?: MarkerMatchOptions,
): string[] {
  const tailN =
    opts?.tailLines === undefined
      ? DEFAULT_MARKER_TAIL_LINES
      : opts.tailLines;
  const scoped = tailText(text, tailN);
  const reject =
    opts?.rejectPlaceholders === undefined ? true : opts.rejectPlaceholders;
  const lines = scoped.split("\n");
  const out: string[] = [];

  if (marker instanceof RegExp) {
    // Reset /lastIndex safety for global regexes reused across ticks.
    const re = marker.global ? marker : new RegExp(marker.source, marker.flags);
    const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
    const globalRe = new RegExp(re.source, flags);
    // Walk lines so placeholder filtering stays line-scoped.
    for (const line of lines) {
      globalRe.lastIndex = 0;
      if (!globalRe.test(line)) continue;
      if (reject && hasUnfilledPlaceholder(line)) continue;
      out.push(line);
    }
    return out;
  }

  for (const line of lines) {
    if (!line.includes(marker)) continue;
    if (reject && hasUnfilledPlaceholder(line)) continue;
    out.push(line);
  }
  return out;
}

/**
 * True if pane text contains an accepted completion marker.
 * By default: tail window + placeholder rejection (see MarkerMatchOptions).
 * Does **not** apply baseline — use isNewMarkerMatch / evaluateTick for that.
 */
export function matchesMarker(
  text: string,
  marker: string | RegExp,
  opts?: MarkerMatchOptions,
): boolean {
  return listAcceptedMarkerLines(text, marker, opts).length > 0;
}

/**
 * True when current text has an accepted marker that was not already present
 * in the baseline snapshot (or has a higher count / new line content).
 *
 * Axis of the prompt-echo defense: whatever was on screen at watch start
 * cannot alone trigger completion.
 */
export function isNewMarkerMatch(
  text: string,
  baseline: string | null | undefined,
  marker: string | RegExp,
  opts?: MarkerMatchOptions,
): boolean {
  const current = listAcceptedMarkerLines(text, marker, opts);
  if (current.length === 0) return false;
  if (baseline == null || baseline === "") return true;

  // Scrollback growth: only the suffix after the baseline can introduce news.
  if (text.startsWith(baseline) && text.length > baseline.length) {
    const suffix = text.slice(baseline.length);
    if (listAcceptedMarkerLines(suffix, marker, opts).length > 0) return true;
    // Suffix alone may lack context for multi-line regex; fall through to
    // set/count compare on the full texts.
  }

  const baseLines = listAcceptedMarkerLines(baseline, marker, opts);
  if (current.length > baseLines.length) return true;

  const baseSet = new Set(baseLines);
  for (const line of current) {
    if (!baseSet.has(line)) return true;
  }
  return false;
}

// ─── Pane list parsing / presence ────────────────────────────────────────────

/**
 * Parse `herdr pane list` JSON envelope into pane records.
 * Tolerates missing/malformed fields — returns [] rather than throwing on
 * empty panes; throws only when the top-level JSON is unparseable garbage.
 */
export function parsePaneList(jsonText: string): PaneInfo[] {
  const raw = JSON.parse(jsonText) as {
    result?: { panes?: unknown[] };
    panes?: unknown[];
  };
  const list = raw?.result?.panes ?? raw?.panes ?? [];
  if (!Array.isArray(list)) return [];
  const out: PaneInfo[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const p = item as Record<string, unknown>;
    const id = p.pane_id ?? p.paneId ?? p.id;
    if (typeof id !== "string" || !id) continue;
    out.push({
      pane_id: id,
      agent: typeof p.agent === "string" ? p.agent : undefined,
      cwd: typeof p.cwd === "string" ? p.cwd : undefined,
      agent_status:
        typeof p.agent_status === "string" ? p.agent_status : undefined,
      label: typeof p.label === "string" ? p.label : undefined,
      terminal_title:
        typeof p.terminal_title === "string" ? p.terminal_title : undefined,
    });
  }
  return out;
}

/** Whether a pane id is present in the list. */
export function isPanePresent(panes: PaneInfo[], paneId: string): boolean {
  return panes.some((p) => p.pane_id === paneId);
}

/**
 * Find a pane by agent kind + cwd (auto-discovery after spawn, when pane id
 * is not yet known). Exact cwd match preferred; falls back to resolved paths.
 * When multiple match, prefers the highest revision-looking id order of list
 * (caller can re-poll — list order is herdr's).
 */
export function findPaneByAgentCwd(
  panes: PaneInfo[],
  agentKind: string,
  cwd: string,
): PaneInfo | undefined {
  const wantAgent = agentKind.toLowerCase();
  const wantCwd = normalizeCwd(cwd);
  const matches = panes.filter((p) => {
    if ((p.agent ?? "").toLowerCase() !== wantAgent) return false;
    if (!p.cwd) return false;
    return normalizeCwd(p.cwd) === wantCwd;
  });
  // Prefer most recently listed match (herdr often appends newer panes).
  return matches.length ? matches[matches.length - 1] : undefined;
}

function normalizeCwd(cwd: string): string {
  try {
    return resolvePath(cwd).replace(/\/+$/, "") || "/";
  } catch {
    return cwd.replace(/\/+$/, "") || "/";
  }
}

// ─── Pure tick evaluation ────────────────────────────────────────────────────

/**
 * Pure terminal-condition evaluator.
 *
 * Priority when multiple conditions hold on one tick
 * (most informative first — completion beats death beats budget):
 *   1. marker
 *   2. limit
 *   3. pane-gone
 *   4. timeout
 *   else continue
 *
 * Rationale for marker-before-pane-gone: last read may still carry the done
 * marker after the pane has already vanished; callers that treat marker as
 * "finished successfully" need that signal.
 */
export function evaluateTick(input: TickInput): WatchDecision {
  const markerOpts: MarkerMatchOptions = {
    tailLines:
      input.markerTailLines === undefined
        ? DEFAULT_MARKER_TAIL_LINES
        : input.markerTailLines,
  };

  if (input.text != null) {
    // Baseline axis: when a snapshot is provided, only newly appeared
    // accepted matches complete. Without baseline, any accepted match wins
    // (unit-test / pure path backward compatibility).
    const markerHit =
      input.baselineText !== undefined && input.baselineText !== null
        ? isNewMarkerMatch(
            input.text,
            input.baselineText,
            input.marker,
            markerOpts,
          )
        : matchesMarker(input.text, input.marker, markerOpts);
    if (markerHit) {
      return { action: "exit", reason: "marker" };
    }
  }

  if (input.text != null) {
    const limit = detectLimitSignal(input.text);
    if (limit != null) {
      return { action: "exit", reason: "limit", detail: limit };
    }
  }

  if (!input.panePresent) {
    return { action: "exit", reason: "pane-gone" };
  }

  if (input.elapsedMs >= input.timeoutMs) {
    return { action: "exit", reason: "timeout" };
  }

  return { action: "continue" };
}

// ─── Defaults ────────────────────────────────────────────────────────────────

export const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
export const DEFAULT_INTERVAL_MS = 2000;

// ─── CLI helpers (thin I/O — not unit-tested against live herdr) ──────────────

export type CliArgs = {
  pane?: string;
  agent?: string;
  cwd?: string;
  marker?: string;
  markerRe?: string;
  timeoutMs: number;
  intervalMs: number;
  /** Marker scan window (last N lines). Default DEFAULT_MARKER_TAIL_LINES. */
  markerTailLines: number;
  herdr: string;
};

export function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {
    timeoutMs: DEFAULT_TIMEOUT_MS,
    intervalMs: DEFAULT_INTERVAL_MS,
    markerTailLines: DEFAULT_MARKER_TAIL_LINES,
    herdr: "herdr",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const next = () => {
      const v = argv[++i];
      if (v == null || v.startsWith("--")) {
        throw new Error(`missing value for ${a}`);
      }
      return v;
    };
    switch (a) {
      case "--pane":
        out.pane = next();
        break;
      case "--agent":
        out.agent = next();
        break;
      case "--cwd":
        out.cwd = next();
        break;
      case "--marker":
        out.marker = next();
        break;
      case "--marker-re":
        out.markerRe = next();
        break;
      case "--timeout-ms":
        out.timeoutMs = Number(next());
        break;
      case "--interval-ms":
        out.intervalMs = Number(next());
        break;
      case "--tail-lines":
        out.markerTailLines = Number(next());
        break;
      case "--herdr":
        out.herdr = next();
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      default:
        if (a.startsWith("-")) throw new Error(`unknown flag: ${a}`);
        break;
    }
  }
  if (!Number.isFinite(out.timeoutMs) || out.timeoutMs <= 0) {
    throw new Error(`--timeout-ms must be a positive number, got ${out.timeoutMs}`);
  }
  if (!Number.isFinite(out.intervalMs) || out.intervalMs <= 0) {
    throw new Error(
      `--interval-ms must be a positive number, got ${out.intervalMs}`,
    );
  }
  if (!Number.isFinite(out.markerTailLines) || out.markerTailLines < 0) {
    throw new Error(
      `--tail-lines must be a non-negative number, got ${out.markerTailLines}`,
    );
  }
  return out;
}

function printHelp(): void {
  console.log(`watch-card — monitor a herdr pane worker until a terminal condition

Usage:
  bun run scripts/watch-card.ts --pane <id> --marker <string>
  bun run scripts/watch-card.ts --agent <kind> --cwd <path> --marker <string>
  bun run watch:card --pane w3:p52 --marker '[DONE]'

Options:
  --tail-lines <n>   only scan last N lines for marker (default ${DEFAULT_MARKER_TAIL_LINES}; 0 = full)

Marker matching rejects prompt-echo false positives:
  baseline snapshot at first read · placeholder templates · tail window

Exit reasons (stdout line + process exit code):
  marker     exit 0   completion marker found (new vs baseline)
  pane-gone  exit 1   pane missing from list
  limit      exit 2   usage/auth/rate-limit signal
  timeout    exit 3   budget exhausted
  usage err  exit 64
`);
}

export function resolveMarker(args: CliArgs): string | RegExp {
  if (args.markerRe != null && args.markerRe !== "") {
    return new RegExp(args.markerRe);
  }
  if (args.marker != null && args.marker !== "") {
    return args.marker;
  }
  throw new Error("require --marker <string> or --marker-re <pattern>");
}

async function runHerdr(
  herdr: string,
  args: string[],
): Promise<{ ok: boolean; stdout: string; stderr: string; code: number }> {
  const proc = Bun.spawn([herdr, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { ok: code === 0, stdout, stderr, code: code ?? 1 };
}

async function listPanes(herdr: string): Promise<PaneInfo[]> {
  const r = await runHerdr(herdr, ["pane", "list"]);
  if (!r.ok) {
    throw new Error(
      `herdr pane list failed (exit ${r.code}): ${r.stderr || r.stdout}`,
    );
  }
  return parsePaneList(r.stdout);
}

/**
 * `herdr pane read <id>` returns plain text (not a JSON envelope).
 * Non-zero exit / empty → null (caller treats as unavailable this tick).
 */
async function readPaneText(
  herdr: string,
  paneId: string,
): Promise<string | null> {
  const r = await runHerdr(herdr, ["pane", "read", paneId]);
  if (!r.ok) return null;
  return r.stdout;
}

function exitCodeFor(reason: ExitReason): number {
  switch (reason) {
    case "marker":
      return 0;
    case "pane-gone":
      return 1;
    case "limit":
      return 2;
    case "timeout":
      return 3;
  }
}

function reportExit(
  reason: ExitReason,
  paneId: string | undefined,
  detail?: string,
): never {
  const parts = [`[watch-card] exit=${reason}`];
  if (paneId) parts.push(`pane=${paneId}`);
  if (detail) parts.push(`detail=${JSON.stringify(detail)}`);
  console.log(parts.join(" "));
  process.exit(exitCodeFor(reason));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Main loop ───────────────────────────────────────────────────────────────

export async function watchLoop(args: CliArgs): Promise<ExitReason> {
  const marker = resolveMarker(args);
  const started = Date.now();
  let paneId = args.pane;
  /** First successful pane read — axis of prompt-echo defense. */
  let baselineText: string | null = null;
  let baselineCaptured = false;

  if (!paneId && !(args.agent && args.cwd)) {
    throw new Error("require --pane <id> or both --agent and --cwd");
  }

  // Discovery phase: resolve pane id from agent+cwd when not given.
  while (!paneId) {
    const elapsed = Date.now() - started;
    if (elapsed >= args.timeoutMs) {
      console.log("[watch-card] exit=timeout pane=(undiscovered)");
      process.exit(exitCodeFor("timeout"));
    }
    const panes = await listPanes(args.herdr);
    const found = findPaneByAgentCwd(panes, args.agent!, args.cwd!);
    if (found) {
      paneId = found.pane_id;
      console.error(
        `[watch-card] discovered pane=${paneId} agent=${args.agent} cwd=${args.cwd}`,
      );
      break;
    }
    await sleep(args.intervalMs);
  }

  // Watch phase.
  while (true) {
    const elapsed = Date.now() - started;
    let panes: PaneInfo[];
    try {
      panes = await listPanes(args.herdr);
    } catch (e) {
      // herdr list failure: do not treat as pane-gone (could be socket blip).
      // Fall through with empty list only if past timeout; else retry.
      if (elapsed >= args.timeoutMs) {
        reportExit("timeout", paneId);
      }
      console.error(
        `[watch-card] pane list error (retry): ${e instanceof Error ? e.message : e}`,
      );
      await sleep(args.intervalMs);
      continue;
    }

    const present = isPanePresent(panes, paneId!);
    // Only read when present — read of a dead pane is noisy and unhelpful.
    const text = present ? await readPaneText(args.herdr, paneId!) : null;

    // Capture baseline once on first successful read so prompt echo already
    // on screen cannot alone fire exit=marker.
    if (text != null && !baselineCaptured) {
      baselineText = text;
      baselineCaptured = true;
    }

    const decision = evaluateTick({
      text,
      panePresent: present,
      marker,
      elapsedMs: elapsed,
      timeoutMs: args.timeoutMs,
      // Always pass a string once captured (including "") so baseline filter
      // engages; until first read, omit so we don't invent an empty baseline
      // that would accept the first match before we could snapshot it.
      baselineText: baselineCaptured ? baselineText : undefined,
      markerTailLines: args.markerTailLines,
    });

    if (decision.action === "exit") {
      reportExit(decision.reason, paneId, decision.detail);
    }

    await sleep(args.intervalMs);
  }
}

// ─── Entrypoint ──────────────────────────────────────────────────────────────

if (import.meta.main) {
  try {
    const args = parseArgs(process.argv.slice(2));
    await watchLoop(args);
  } catch (e) {
    console.error(
      `[watch-card] error: ${e instanceof Error ? e.message : String(e)}`,
    );
    process.exit(64);
  }
}
