/**
 * Fake agent CLI for v0.30.0 P2 (PLAN D15). Test infrastructure only.
 *
 * Run: `bun <thisfile> <real CLI argv...>`
 * Strip `--fake-kind claude|codex|grok` (or `--fake-kind=<kind>`) before the
 * rest is treated as the real CLI argv. Fallback when the flag is absent:
 * env `FAKE_KIND`. Default kind is `claude`.
 *
 * Argv after `--fake-kind` is checked per kind. Unknown flags exit 2 with
 * an error on stderr. Grok `-p`/`--single` requires a non-flag value, so
 * `-p --prompt-file <file>` is rejected. Grok `--allow`, `--deny`, `--rules`,
 * `--permission-mode`, `--cwd`, `--prompt-file`, `--output-format`,
 * `--session-id`, and `-r` each take exactly one value. A stray non-flag
 * token exits 2 (`error: unexpected argument '<tok>' found`). Claude `-p`
 * is a boolean print flag (the prompt stays on stdin) and its
 * `--allowedTools`/`--disallowedTools` stay variadic. Codex must be `exec`
 * or `exec resume`; resume does not accept `-C` or `--sandbox`.
 *
 * Knobs are env-only so argv stays the real CLI argv:
 * - FAKE_OUTPUT_BYTES       body length (default 32). Body is "x" repeated.
 * - FAKE_DURATION_MS        simulated wait before the final event (default 0).
 * - FAKE_TIME_SCALE         real sleep = FAKE_DURATION_MS / scale
 *                           (default 1; values < 1 are treated as 1).
 * - FAKE_EXIT_ONCE_MARKER   file path. First run writes the marker and exits
 *                           86 after the session event and PARTIAL_READY.
 *                           Later runs (marker already present) succeed.
 * - FAKE_ARGV_DUMP          append one JSON line per invocation (mode 0600):
 *                           {argv, kind, sessionId, resumeId, pid}.
 * - FAKE_DENIAL             "1" emits a denial event.
 * - FAKE_HANG               "1" sleeps forever after PARTIAL_READY.
 * - FAKE_ENV_DUMP           write JSON.stringify(process.env), mode 0600.
 * - FAKE_SPAWN_GRANDCHILD   "1" spawns `sleep 300` in THIS process group
 *                           (detached false, no setsid, not unref'd).
 * - FAKE_GRANDCHILD_PID_FILE  decimal pid of that grandchild.
 * - FAKE_PROMPT_DUMP        stdin text, plus `--prompt-file` contents.
 * - FAKE_STDERR_EXIT        when set, write this string to stderr and exit 2
 *                           after argv checks and dumps, before any stream
 *                           event (no terminal event).
 *
 * Session id, from the real argv only (`-s` is sandbox, never a session id):
 * `--session-id`, else `-r` / `--resume`, else `exec resume <id>`,
 * else `fake-<pid>`. A resume id is echoed as the stream session id.
 *
 * Final text (claude `result`, codex last `agent_message`, concatenation of
 * grok `text.data` when FAKE_DENIAL is unset):
 *   PARTIAL_READY\n
 *   session:<sessionId>\n
 *   resume:<resumeId or ->\n
 *   <body>
 * No newline after the body. The immediate partial chunk is `PARTIAL_READY\n`
 * and is not the final result event. Exit-once and hang stop before the
 * final result / turn.completed / end event.
 */
import { spawn } from "node:child_process";
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { dirname } from "node:path";

type Kind = "claude" | "codex" | "grok";

function write0600(path: string, body: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body, { encoding: "utf8", mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    /* mode already applied on create */
  }
}

function parseLaunch(argv: string[]): { kind: Kind; rest: string[] } {
  const rest: string[] = [];
  let kindRaw = process.env.FAKE_KIND ?? "claude";
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (arg === "--fake-kind") {
      kindRaw = argv[i + 1] ?? kindRaw;
      i += 1;
      continue;
    }
    if (arg.startsWith("--fake-kind=")) {
      kindRaw = arg.slice("--fake-kind=".length);
      continue;
    }
    rest.push(arg);
  }
  const kind: Kind =
    kindRaw === "codex" || kindRaw === "grok" ? kindRaw : "claude";
  return { kind, rest };
}

function flagValue(argv: string[], name: string): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (arg === name) return argv[i + 1];
    if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1);
  }
  return undefined;
}

function resolveIds(rest: string[]): { sessionId: string; resumeId: string } {
  let resumeId = "";
  if (
    rest[0] === "exec" &&
    rest[1] === "resume" &&
    rest[2] &&
    !rest[2].startsWith("-")
  ) {
    resumeId = rest[2];
  }
  const resumeFlag = flagValue(rest, "-r") ?? flagValue(rest, "--resume");
  if (resumeFlag) resumeId = resumeFlag;
  const sessionFlag = flagValue(rest, "--session-id");
  const sessionId = sessionFlag || resumeId || `fake-${process.pid}`;
  return { sessionId, resumeId };
}

function finalText(sessionId: string, resumeId: string, bytes: number): string {
  return `PARTIAL_READY\nsession:${sessionId}\nresume:${resumeId || "-"}\n${"x".repeat(bytes)}`;
}

async function emitLine(value: unknown): Promise<void> {
  const line = `${JSON.stringify(value)}\n`;
  await new Promise<void>((resolve, reject) => {
    process.stdout.write(line, (err) => {
      if (!err) {
        resolve();
        return;
      }
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EPIPE") resolve();
      else reject(err);
    });
  });
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function outputBytes(): number {
  const n = Number(process.env.FAKE_OUTPUT_BYTES ?? "32");
  if (!Number.isFinite(n) || n < 0) return 32;
  return Math.floor(n);
}

function realSleepMs(): number {
  const duration = Number(process.env.FAKE_DURATION_MS ?? "0");
  let scale = Number(process.env.FAKE_TIME_SCALE ?? "1");
  if (!Number.isFinite(scale) || scale < 1) scale = 1;
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return duration / scale;
}

type FlagTake = "bool" | "value" | "variadic" | "optional";

type FlagSpec = { take: FlagTake; label: string };

/** A token that occupies a flag slot. `-` is the codex stdin positional. */
function isFlag(arg: string): boolean {
  return arg.startsWith("-") && arg !== "-";
}

function unexpectedArg(arg: string): string {
  const shown = arg.length > 0 ? arg : "(missing)";
  return `error: unexpected argument '${shown}' found\n\nFor more information, try '--help'.\n`;
}

function missingValue(label: string): string {
  return `error: a value is required for '${label}' but none was supplied\n\nFor more information, try '--help'.\n`;
}

function flagMap(rows: Array<[string[], FlagSpec]>): Map<string, FlagSpec> {
  const map = new Map<string, FlagSpec>();
  for (const [names, spec] of rows) {
    for (const name of names) map.set(name, spec);
  }
  return map;
}

/**
 * Walk argv the way the real CLIs do for the flags buildAgentArgv emits.
 * Claude list flags (`--allowedTools`, `--disallowedTools`) consume every
 * following non-flag token. Grok `--allow` and `--deny` each take one value;
 * a later non-flag token is a stray positional.
 * Returns an error string, or null when the argv is accepted.
 */
function parseFlags(
  argv: string[],
  flags: Map<string, FlagSpec>,
  maxPositionals: number,
): string | null {
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (!isFlag(arg)) {
      positionals.push(arg);
      if (positionals.length > maxPositionals) return unexpectedArg(arg);
      continue;
    }
    const spec = flags.get(arg);
    if (!spec) return unexpectedArg(arg);
    if (spec.take === "bool") continue;
    if (spec.take === "optional") {
      const next = argv[i + 1];
      if (next !== undefined && !isFlag(next)) i += 1;
      continue;
    }
    if (spec.take === "value") {
      const next = argv[i + 1];
      if (next === undefined || isFlag(next)) return missingValue(spec.label);
      i += 1;
      continue;
    }
    const start = i + 1;
    while (i + 1 < argv.length && !isFlag(argv[i + 1] ?? "")) i += 1;
    if (i + 1 === start) return missingValue(spec.label);
  }
  return null;
}

const grokSingle: FlagSpec = { take: "value", label: "--single <PROMPT>" };
const grokFlags = flagMap([
  [["-p", "--single"], grokSingle],
  [["--prompt-file"], { take: "value", label: "--prompt-file <PATH>" }],
  [["--output-format"], { take: "value", label: "--output-format <OUTPUT_FORMAT>" }],
  [["--cwd"], { take: "value", label: "--cwd <CWD>" }],
  [["-s", "--session-id"], { take: "value", label: "--session-id <SESSION_ID>" }],
  [["-r", "--resume"], { take: "value", label: "-r <SESSION_ID>" }],
  [["--rules"], { take: "value", label: "--rules <RULES>" }],
  [["--permission-mode"], { take: "value", label: "--permission-mode <MODE>" }],
  [["--allow"], { take: "value", label: "--allow <RULE>" }],
  [["--deny"], { take: "value", label: "--deny <RULE>" }],
]);

const claudeFlags = flagMap([
  [["-p", "--print"], { take: "bool", label: "--print" }],
  [["--output-format"], { take: "value", label: "--output-format <format>" }],
  [["--verbose"], { take: "bool", label: "--verbose" }],
  [["--session-id"], { take: "value", label: "--session-id <uuid>" }],
  [["-r", "--resume"], { take: "optional", label: "--resume [value]" }],
  [["--append-system-prompt"], { take: "value", label: "--append-system-prompt <prompt>" }],
  [["--permission-mode"], { take: "value", label: "--permission-mode <mode>" }],
  [["--allowedTools", "--allowed-tools"], { take: "variadic", label: "--allowedTools <tools...>" }],
  [
    ["--disallowedTools", "--disallowed-tools"],
    { take: "variadic", label: "--disallowedTools <tools...>" },
  ],
]);

const codexConfig: FlagSpec = { take: "value", label: "--config <key=value>" };
const codexExecFlags = flagMap([
  [["--json"], { take: "bool", label: "--json" }],
  [["-C", "--cd"], { take: "value", label: "--cd <DIR>" }],
  [["-s", "--sandbox"], { take: "value", label: "--sandbox <SANDBOX_MODE>" }],
  [["-c", "--config"], codexConfig],
  [["--skip-git-repo-check"], { take: "bool", label: "--skip-git-repo-check" }],
]);
const codexResumeFlags = flagMap([
  [["--json"], { take: "bool", label: "--json" }],
  [["-c", "--config"], codexConfig],
  [["--skip-git-repo-check"], { take: "bool", label: "--skip-git-repo-check" }],
]);

function validateKindArgv(kind: Kind, argv: string[]): string | null {
  if (kind === "grok") return parseFlags(argv, grokFlags, 0);
  if (kind === "claude") return parseFlags(argv, claudeFlags, 1);
  if (argv[0] !== "exec") return unexpectedArg(argv[0] ?? "");
  const next = argv[1];
  if (next === "fork" || next === "review" || next === "help") return unexpectedArg(next);
  if (next === "resume") return parseFlags(argv.slice(2), codexResumeFlags, 2);
  return parseFlags(argv.slice(1), codexExecFlags, 1);
}

async function main(): Promise<void> {
  const { kind, rest } = parseLaunch(process.argv.slice(2));
  const argvError = validateKindArgv(kind, rest);
  if (argvError) {
    process.stderr.write(argvError);
    process.exit(2);
  }
  const { sessionId, resumeId } = resolveIds(rest);
  const bytes = outputBytes();
  const text = finalText(sessionId, resumeId, bytes);
  const denial = process.env.FAKE_DENIAL === "1";

  if (process.env.FAKE_ENV_DUMP) {
    write0600(process.env.FAKE_ENV_DUMP, JSON.stringify(process.env));
  }

  if (kind === "codex") {
    process.stderr.write("Reading additional input from stdin...\n");
  }

  const stdinText = await readStdin();
  let promptDump = stdinText;
  const promptFile = flagValue(rest, "--prompt-file");
  if (promptFile) {
    const fileText = existsSync(promptFile) ? readFileSync(promptFile, "utf8") : "";
    promptDump += `\n--prompt-file--\n${fileText}`;
  }
  if (process.env.FAKE_PROMPT_DUMP) {
    write0600(process.env.FAKE_PROMPT_DUMP, promptDump);
  }

  if (process.env.FAKE_ARGV_DUMP) {
    const dump = process.env.FAKE_ARGV_DUMP;
    mkdirSync(dirname(dump), { recursive: true });
    appendFileSync(
      dump,
      `${JSON.stringify({ argv: rest, kind, sessionId, resumeId, pid: process.pid })}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    try {
      chmodSync(dump, 0o600);
    } catch {
      /* best-effort */
    }
  }

  const stderrExit = process.env.FAKE_STDERR_EXIT;
  if (stderrExit) {
    writeSync(2, stderrExit);
    process.exit(2);
  }

  if (process.env.FAKE_SPAWN_GRANDCHILD === "1") {
    const child = spawn("/bin/sleep", ["300"], {
      detached: false,
      stdio: "ignore",
    });
    if (process.env.FAKE_GRANDCHILD_PID_FILE && child.pid) {
      write0600(process.env.FAKE_GRANDCHILD_PID_FILE, String(child.pid));
    }
  }

  if (kind === "codex") {
    await emitLine({ type: "thread.started", thread_id: sessionId });
    await emitLine({ type: "turn.started" });
    await emitLine({
      type: "item.completed",
      item: { type: "agent_message", text: "PARTIAL_READY\n" },
    });
  } else if (kind === "grok") {
    await emitLine({ type: "text", data: "PARTIAL_READY\n" });
  } else {
    await emitLine({ type: "system", subtype: "init", session_id: sessionId });
    await emitLine({
      type: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "PARTIAL_READY\n" }],
      },
    });
  }

  const marker = process.env.FAKE_EXIT_ONCE_MARKER;
  if (marker && !existsSync(marker)) {
    write0600(marker, "1");
    process.exit(86);
  }

  if (process.env.FAKE_HANG === "1") {
    await new Promise(() => {});
  }

  const sleepMs = realSleepMs();
  if (sleepMs > 0) await Bun.sleep(sleepMs);

  if (kind === "codex") {
    if (denial) {
      await emitLine({
        type: "item.completed",
        item: {
          type: "command_execution",
          command: "touch x",
          aggregated_output: "Operation not permitted",
          exit_code: 1,
        },
      });
    }
    await emitLine({
      type: "item.completed",
      item: { type: "agent_message", text },
    });
    await emitLine({
      type: "turn.completed",
      usage: { input_tokens: 3, output_tokens: 4 },
    });
  } else if (kind === "grok") {
    if (denial) await emitLine({ type: "text", data: "denied: Bash touch x" });
    await emitLine({ type: "text", data: text.slice("PARTIAL_READY\n".length) });
    await emitLine({
      type: "end",
      sessionId,
      stopReason: "end_turn",
      usage: { input_tokens: 3, output_tokens: 4 },
    });
  } else {
    await emitLine({
      type: "result",
      result: text,
      is_error: false,
      session_id: sessionId,
      usage: { input_tokens: 3, output_tokens: 4 },
      permission_denials: denial
        ? [{ tool_name: "Bash", tool_input: { command: "rm -rf /tmp/x" } }]
        : [],
    });
  }
}

if (import.meta.main) {
  main().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`${msg}\n`);
    process.exit(1);
  });
}
