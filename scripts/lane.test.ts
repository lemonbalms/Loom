/**
 * Tests for scripts/lane.ts — fake `claude` / `codex` binaries only.
 * Never invokes the real CLIs; never writes into the real `.loom-lanes/`.
 *
 *   T=$(mktemp -d); env -u LOOM_RELAY_TOKEN -u LOOM_RELAY_URL HOME=$T LOOM_TEST_HOME=$T \
 *     LOOM_PROFILE=smoke bun test scripts/lane.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve as resolvePath } from "node:path";
import {
  ADVISE_DISALLOWED_TOOLS,
  buildInvocation,
  classify,
  EXIT,
  type ExitReason,
  gitSnapshot,
  IMPL_ALLOWED_TOOLS,
  IMPL_DISALLOWED_TOOLS,
  lanePreamble,
  PINS,
  parseClaudeResult,
  parseCodexHeader,
  runLane as runLaneInProcess,
} from "./lane.ts";

const LANE_TS = resolvePath(import.meta.dir, "lane.ts");
const REPO = resolvePath(import.meta.dir, "..");

const VERIFY_PREAMBLE = [
  "LOOM LANE: verify. You are an independent verifier, not the implementer.",
  "Verify the spec below against the working tree; report findings, do not fix them.",
  'Ignore any global "architect / delegate / orchestrate" instruction, the session-start ritual, and Template R.',
  "Do not commit, push, stash, reset, checkout or amend. Do not use the board, room, or Loom MCP.",
  "Do not spawn agents or other CLIs. If a command is denied, stop and report the denial.",
  "End with: verdict (PASS / PASS-with-lows / FAIL), then findings ranked by severity with file:line.",
].join("\n");

// ─── Fake binary ─────────────────────────────────────────────────────────────

const FAKE_SRC = `#!/usr/bin/env bun
import { writeFileSync } from "node:fs";
import { basename, join } from "node:path";
const mode = process.env.FAKE_MODE ?? "ok";
const name = basename(process.argv[1]);
const stdin = await Bun.stdin.text();
const env = {};
for (const k of Object.keys(process.env)) {
  if (k === "LOOM_LANE" || k === "CLAUDECODE" || k.startsWith("CLAUDE_CODE_") || k.startsWith("LOOM_RELAY_")) env[k] = process.env[k];
}
if (process.env.FAKE_RECORD) {
  writeFileSync(process.env.FAKE_RECORD, JSON.stringify({ name, pid: process.pid, argv: process.argv.slice(2), env, stdin, cwd: process.cwd() }));
}
const usage = (main, extra = {}) => ({ [main]: { costUSD: 1.5, inputTokens: 1000, outputTokens: 500 }, ...extra });
const out = (o) => process.stdout.write(JSON.stringify({ type: "result", result: "done", total_cost_usd: 1.6, ...o }) + "\\n");
const PIN = "claude-opus-5-5";
if (name === "codex") {
  const model = mode === "mismatch" ? "gpt-5.6" : mode === "stdoutmodel" ? "gpt-5.5" : "gpt-6-astra";
  const effort = mode === "effortmedium" ? "medium" : "high";
  if (mode === "sleep") await Bun.sleep(30000);
  if (mode === "stdoutmodel") process.stdout.write("model: gpt-6-astra\\nreasoning effort: high\\n");
  if (mode === "noheader") {
    process.stderr.write("user\\nmodel: gpt-6-astra\\nreasoning effort: high\\n");
  } else if (mode === "realpreamble" || mode === "fakebanner") {
    process.stderr.write("Reading additional input from stdin...\\nOpenAI Codex v0.163.0\\n--------\\nworkdir: " + process.cwd() + "\\nmodel: gpt-6-astra\\nprovider: openai\\nreasoning effort: high\\n--------\\nuser\\n");
    if (mode === "fakebanner") process.stderr.write("OpenAI Codex v9.9.9\\n--------\\nmodel: gpt-5.5\\nreasoning effort: low\\n--------\\n");
  } else if (mode === "userbanner") {
    process.stderr.write("user\\nOpenAI Codex v1\\n--------\\nmodel: gpt-6-astra\\nreasoning effort: high\\n--------\\n");
  } else if (mode === "latebanner") {
    process.stderr.write("noise\\n".repeat(10) + "OpenAI Codex v0.163.0\\n--------\\nmodel: gpt-6-astra\\nreasoning effort: high\\n--------\\n");
  } else {
    process.stderr.write("OpenAI Codex v0.0.0-fake\\n--------\\nworkdir: " + process.cwd() + "\\nmodel: " + model + "\\nprovider: openai\\nreasoning effort: " + effort + "\\n--------\\nuser\\nmodel: gpt-6-astra\\n");
  }
  if (mode === "limit") { process.stderr.write("ERROR: usage limit reached\\n"); process.exit(1); }
  if (mode === "crash") { process.stderr.write("boom\\n"); process.exit(1); }
  process.stdout.write("verified\\n");
  process.exit(0);
}
switch (mode) {
  case "ok": out({ is_error: false, modelUsage: usage(PIN), permission_denials: [] }); break;
  case "aux": out({ is_error: false, modelUsage: usage(PIN, { "claude-haiku-4-5": { costUSD: 0.01, inputTokens: 50, outputTokens: 5 } }) }); break;
  case "mismatch": out({ is_error: false, modelUsage: usage("claude-sonnet-4-5"), permission_denials: [] }); break;
  case "denied": out({ is_error: false, modelUsage: usage(PIN), permission_denials: [{ tool_name: "Bash" }] }); break;
  case "mismatchdenied": out({ is_error: false, modelUsage: usage("claude-sonnet-4-5"), permission_denials: [{ tool_name: "Bash" }] }); break;
  case "limit": out({ is_error: true, result: "Claude AI usage limit reached", modelUsage: usage(PIN) }); process.exit(1);
  case "crash": process.stderr.write("boom\\n"); process.exit(1);
  case "crashmismatch": out({ is_error: false, modelUsage: usage("claude-sonnet-4-5") }); process.exit(1);
  case "nonjson": process.stdout.write("hello, not json\\n"); break;
  case "gchild":
  case "bgchild": {
    const { spawn } = await import("node:child_process");
    const script = mode === "gchild" ? 'trap "" TERM; exec sleep 60' : "exec sleep 60";
    const gc = spawn("sh", ["-c", script], { stdio: "ignore" });
    gc.unref();
    writeFileSync(process.env.FAKE_RECORD + ".gc", String(gc.pid));
    if (mode === "gchild") await Bun.sleep(60000);
    out({ is_error: false, modelUsage: usage(PIN), permission_denials: [] });
    process.exit(0);
  }
  case "hold": await Bun.sleep(2000); writeFileSync(join(process.cwd(), "lane-wrote-" + process.pid + "-" + Date.now() + ".txt"), "x\\n"); out({ is_error: false, modelUsage: usage(PIN), permission_denials: [] }); break;
  case "stubborn": process.on("SIGTERM", () => {}); await Bun.sleep(60000); process.exit(1);
  case "sleep": process.stderr.write("rate limit hit\\n"); await Bun.sleep(30000); process.exit(1);
  case "write": writeFileSync(join(process.cwd(), "lane-wrote-" + process.pid + "-" + Date.now() + ".txt"), "x\\n"); out({ is_error: false, modelUsage: usage(PIN), permission_denials: [] }); break;
  case "rmgit": { const { rmSync } = await import("node:fs"); rmSync(join(process.cwd(), ".git"), { recursive: true, force: true }); writeFileSync(join(process.cwd(), "lane-wrote-rmgit.txt"), "x\\n"); out({ is_error: false, modelUsage: usage(PIN), permission_denials: [] }); break; }
  default: process.exit(9);
}
`;

let base: string;
let bin: string;
let runs: string;
let spec: string;

beforeAll(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), "lane-test-")));
  bin = join(base, "bin");
  runs = join(base, "runs");
  mkdirSync(bin);
  for (const n of ["claude", "codex"]) {
    writeFileSync(join(bin, n), FAKE_SRC);
    chmodSync(join(bin, n), 0o755);
  }
  spec = join(base, "spec.md");
  writeFileSync(spec, "# Spec\nDo the thing.\n");
});

afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

type RunResult = {
  code: number | null;
  stdout: string;
  stderr: string;
  record: Record<string, unknown> | null;
  dir: string | null;
};

let recordSeq = 0;

function runLane(
  args: string[],
  opts: { mode?: string; runsDir?: string; extraEnv?: Record<string, string> } = {},
): RunResult {
  const record = join(base, `record-${++recordSeq}.json`);
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
  Object.assign(env, {
    PATH: `${bin}:${process.env.PATH ?? ""}`,
    LOOM_LANE_RUNS_DIR: opts.runsDir ?? runs,
    FAKE_MODE: opts.mode ?? "ok",
    FAKE_RECORD: record,
    ...opts.extraEnv,
  });
  const r = spawnSync("bun", ["run", LANE_TS, ...args], { env, encoding: "utf8", timeout: 60000 });
  const dir = /dir=(\S+)$/m.exec(r.stdout)?.[1] ?? null;
  return {
    code: r.status,
    stdout: r.stdout,
    stderr: r.stderr,
    record: existsSync(record) ? JSON.parse(readFileSync(record, "utf8")) : null,
    dir,
  };
}

function laneEnv(
  record: string,
  opts: { mode?: string; runsDir?: string },
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
  return Object.assign(env, {
    PATH: `${bin}:${process.env.PATH ?? ""}`,
    LOOM_LANE_RUNS_DIR: opts.runsDir ?? runs,
    FAKE_MODE: opts.mode ?? "ok",
    FAKE_RECORD: record,
  });
}

/** Separate process holding flock(LOCK_EX) on `lock` via the same FFI; writes nothing to the file. */
function startLockHolder(lock: string): {
  proc: ReturnType<typeof Bun.spawn>;
  ready: Promise<boolean>;
} {
  const script = join(base, `lock-holder-${++recordSeq}.ts`);
  writeFileSync(
    script,
    [
      'import { dlopen, FFIType } from "bun:ffi";',
      'import { openSync } from "node:fs";',
      'const lib = process.platform === "darwin" ? "libc.dylib" : "libc.so.6";',
      "const { symbols } = dlopen(lib, { flock: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 } });",
      `const fd = openSync(${JSON.stringify(lock)}, "a");`,
      "const rc = symbols.flock(fd, 2 | 4);",
      'console.log(rc === 0 ? "locked" : "busy");',
      "await Bun.sleep(60000);",
      "console.log(fd);",
    ].join("\n"),
  );
  const proc = Bun.spawn(["bun", "run", script], { stdout: "pipe", stderr: "pipe" });
  const ready = (async () => {
    const reader = (proc.stdout as ReadableStream<Uint8Array>).getReader();
    const { value } = await reader.read();
    reader.releaseLock();
    return new TextDecoder().decode(value ?? new Uint8Array()).includes("locked");
  })();
  return { proc, ready };
}

function pidGone(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return false;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "ESRCH";
  }
}

async function waitGone(pid: number, ms = 2000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (pidGone(pid)) return true;
    await Bun.sleep(50);
  }
  return pidGone(pid);
}

const readMeta = (dir: string) => JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"));

function gitRepo(): string {
  const d = realpathSync(mkdtempSync(join(tmpdir(), "lane-git-")));
  spawnSync("git", ["init", "-q", d]);
  writeFileSync(join(d, "a.txt"), "a\n");
  return d;
}

const SUMMARY_RE =
  /^lane=(impl|advise|verify) exit=[0-6] reason=[a-z-]+ mainModel=\S+ denials=(\d+|null) dir=\/\S+$/;

// ─── Pure functions ──────────────────────────────────────────────────────────

describe("EXIT / PINS", () => {
  test("exit codes", () => {
    expect(EXIT).toEqual({
      ok: 0,
      "process-error": 1,
      limit: 2,
      timeout: 3,
      "model-mismatch": 4,
      denied: 5,
      "refused-empty": 6,
    });
  });
  test("pins", () => {
    expect(PINS.claudeModel).toBe("claude-opus-5-5");
    expect(PINS.codexModel).toBe("gpt-6-astra");
    expect(PINS.effort).toEqual({ impl: "medium", advise: "high", verify: "high" });
  });
  test("tool lists", () => {
    expect(IMPL_ALLOWED_TOOLS).toContain("Bash(rm:*)");
    expect(IMPL_ALLOWED_TOOLS).toContain("Bash(bun run test:lane *)");
    expect(IMPL_ALLOWED_TOOLS.filter((t) => t.startsWith("Bash(env "))).toEqual([]);
    for (const t of ["Agent", "Task", "Workflow", "Bash(git commit:*)", "Bash(ssh:*)"]) {
      expect(IMPL_DISALLOWED_TOOLS).toContain(t);
    }
    expect([...ADVISE_DISALLOWED_TOOLS]).toEqual([
      "Bash",
      "Edit",
      "Write",
      "NotebookEdit",
      "Agent",
      "Task",
      "Workflow",
    ]);
  });
});

describe("classify", () => {
  const baseIn = {
    timedOut: false,
    childExit: 0,
    limitSignal: false,
    parsedOk: true,
    mainModel: "claude-opus-5-5",
    pinnedModel: "claude-opus-5-5",
    denials: 0,
    diffEmpty: false,
    lane: "impl" as const,
  };
  const cases: [Partial<typeof baseIn> & Record<string, unknown>, ExitReason][] = [
    [{}, "ok"],
    [{ childExit: 1 }, "process-error"],
    [{ parsedOk: false }, "process-error"],
    [{ limitSignal: true, childExit: 1 }, "limit"],
    [{ timedOut: true, childExit: null }, "timeout"],
    [{ mainModel: "x" }, "model-mismatch"],
    [{ mainModel: null }, "model-mismatch"],
    [{ denials: 2 }, "denied"],
    [{ diffEmpty: true }, "refused-empty"],
    [{ diffEmpty: null }, "ok"],
    [{ diffEmpty: true, lane: "advise" }, "ok"],
    // precedence
    [{ timedOut: true, limitSignal: true, childExit: 1 }, "timeout"],
    [{ limitSignal: true, childExit: 1, mainModel: "x" }, "limit"],
    [{ childExit: 1, mainModel: "x" }, "process-error"],
    [{ mainModel: "x", denials: 1 }, "model-mismatch"],
    [{ denials: 1, diffEmpty: true }, "denied"],
  ];
  for (const [over, want] of cases) {
    test(`${JSON.stringify(over)} → ${want}`, () => {
      expect(classify({ ...baseIn, ...over } as Parameters<typeof classify>[0])).toBe(want);
    });
  }
});

describe("parseClaudeResult", () => {
  test("main model by cost; aux ignored", () => {
    const r = parseClaudeResult(
      JSON.stringify({
        is_error: false,
        modelUsage: {
          "claude-haiku-4-5": { costUSD: 0.01, inputTokens: 9000, outputTokens: 10 },
          "claude-opus-5-5": { costUSD: 2, inputTokens: 100, outputTokens: 100 },
        },
        total_cost_usd: 2.01,
      }),
    );
    expect(r).not.toBeNull();
    expect(r!.mainModel).toBe("claude-opus-5-5");
    expect(r!.resolvedModels.sort()).toEqual(["claude-haiku-4-5", "claude-opus-5-5"]);
    expect(r!.permissionDenials).toEqual([]);
    expect(r!.costUsd).toBe(2.01);
    expect(r!.ok).toBe(true);
  });
  test("cost absent → tokens decide", () => {
    const r = parseClaudeResult(
      JSON.stringify({
        modelUsage: {
          a: { inputTokens: 1, outputTokens: 1 },
          b: { inputTokens: 5, outputTokens: 5 },
        },
      }),
    );
    expect(r!.mainModel).toBe("b");
    expect(r!.costUsd).toBeNull();
  });
  test("last non-empty line fallback", () => {
    const r = parseClaudeResult(`noise\n${JSON.stringify({ is_error: true })}\n\n`);
    expect(r!.isError).toBe(true);
    expect(r!.ok).toBe(false);
    expect(r!.mainModel).toBeNull();
  });
  test("unparsable → null", () => {
    expect(parseClaudeResult("hello")).toBeNull();
    expect(parseClaudeResult("")).toBeNull();
  });
});

describe("parseCodexHeader", () => {
  test("model and effort", () => {
    const hdr =
      "OpenAI Codex v1\n--------\nworkdir: /w\nmodel: gpt-6-astra\nreasoning effort: high\n--------\nuser\nmodel: gpt-5.5\n";
    expect(parseCodexHeader(hdr)).toEqual({ model: "gpt-6-astra", effort: "high" });
    // banner required (fix 4): a bare delimiter block is not a header
    expect(parseCodexHeader("--------\nmodel: m\n--------\n")).toEqual({
      model: null,
      effort: null,
    });
    expect(parseCodexHeader("OpenAI Codex v1\n--------\nmodel: m\n--------\n")).toEqual({
      model: "m",
      effort: null,
    });
    expect(parseCodexHeader("nothing")).toEqual({ model: null, effort: null });
  });
  test("real codex 0.163 preamble (stdin notice before banner)", () => {
    const real =
      "Reading additional input from stdin...\nOpenAI Codex v0.163.0\n--------\nworkdir: /w\nmodel: gpt-6-astra\nprovider: openai\nreasoning effort: high\n--------\nuser\n";
    expect(parseCodexHeader(real)).toEqual({ model: "gpt-6-astra", effort: "high" });
    // banner far down stderr
    const late = `${"noise\n".repeat(10)}OpenAI Codex v0.163.0\n--------\nmodel: gpt-6-astra\n--------\n`;
    expect(parseCodexHeader(late)).toEqual({ model: null, effort: null });
    // delimiter must be the line immediately after the banner
    expect(
      parseCodexHeader("OpenAI Codex v1\nnoise\n--------\nmodel: gpt-6-astra\n--------\n").model,
    ).toBeNull();
    // prompt echo with a fake banner after the real header is ignored
    const echo = `${real}OpenAI Codex v9\n--------\nmodel: gpt-5.5\nreasoning effort: low\n--------\n`;
    expect(parseCodexHeader(echo)).toEqual({ model: "gpt-6-astra", effort: "high" });
  });
  test("round 2: only known preamble shapes (banner at line 0, or 1 after the stdin notice)", () => {
    const hdr = "OpenAI Codex v1\n--------\nmodel: gpt-6-astra\nreasoning effort: high\n--------\n";
    const ok = { model: "gpt-6-astra", effort: "high" };
    const none = { model: null, effort: null };
    expect(parseCodexHeader(hdr)).toEqual(ok); // line 0
    expect(parseCodexHeader(`Reading additional input from stdin...\n${hdr}`)).toEqual(ok); // real 0.163
    expect(parseCodexHeader(`user\n${hdr}`)).toEqual(none); // line 1 without the notice
    expect(parseCodexHeader(`Reading additional input from stdin...\nx\n${hdr}`)).toEqual(none); // line 2
    expect(parseCodexHeader(`a\nb\n${hdr}`)).toEqual(none); // line 2
    expect(parseCodexHeader(`${"noise\n".repeat(9)}${hdr}`)).toEqual(none); // old 10-line window
  });
  test("only the header block counts", () => {
    // no delimiters: prompt echo must not count
    expect(parseCodexHeader("user\nmodel: gpt-6-astra\nreasoning effort: high\n")).toEqual({
      model: null,
      effort: null,
    });
    // block not at the start of stderr
    expect(
      parseCodexHeader("noise\nmore\n--------\nmodel: gpt-6-astra\n--------\n").model,
    ).toBeNull();
    // unterminated block
    expect(parseCodexHeader("OpenAI Codex v1\n--------\nmodel: gpt-6-astra\n").model).toBeNull();
    // model line after the block ignored
    expect(
      parseCodexHeader("OpenAI Codex v1\n--------\nprovider: x\n--------\nmodel: gpt-6-astra\n")
        .model,
    ).toBeNull();
  });
});

describe("buildInvocation", () => {
  const baseEnv = { PATH: "/bin", LOOM_RELAY_TOKEN: "s", LOOM_RELAY_URL: "u", UNDEF: undefined };
  test("impl argv order + env", () => {
    const inv = buildInvocation("impl", { prompt: "P", cwd: "/x", sandbox: "read-only", baseEnv });
    expect(inv.cmd).toBe("claude");
    expect(inv.args.slice(0, 10)).toEqual([
      "-p",
      "P",
      "--model",
      "claude-opus-5-5",
      "--output-format",
      "json",
      "--permission-mode",
      "acceptEdits",
      "--append-system-prompt",
      lanePreamble("impl"),
    ]);
    const ai = inv.args.indexOf("--allowedTools");
    const di = inv.args.indexOf("--disallowedTools");
    expect(inv.args.slice(ai + 1, di)).toEqual([...IMPL_ALLOWED_TOOLS]);
    expect(inv.args.slice(di + 1)).toEqual([...IMPL_DISALLOWED_TOOLS]);
    expect(inv.env).toEqual({
      PATH: "/bin",
      LOOM_LANE: "impl",
      CLAUDE_CODE_EFFORT_LEVEL: "medium",
      CLAUDE_CODE_SUBAGENT_MODEL: "claude-opus-5-5",
      CLAUDE_CODE_SUBAGENT_MODEL_FORCE: "1",
    });
  });
  test("advise system append + disallow", () => {
    const inv = buildInvocation("advise", {
      prompt: "P",
      systemAppend: "BODY",
      cwd: "/x",
      sandbox: "read-only",
      baseEnv,
    });
    expect(inv.args).toEqual([
      "-p",
      "P",
      "--model",
      "claude-opus-5-5",
      "--output-format",
      "json",
      "--append-system-prompt",
      `BODY\n\n${lanePreamble("advise")}`,
      "--disallowedTools",
      ...ADVISE_DISALLOWED_TOOLS,
    ]);
    expect(inv.env.CLAUDE_CODE_EFFORT_LEVEL).toBe("high");
  });
  test("verify codex flags", () => {
    const inv = buildInvocation("verify", {
      prompt: "P",
      cwd: "/w",
      sandbox: "workspace-write",
      baseEnv,
    });
    expect(inv.cmd).toBe("codex");
    expect(inv.args).toEqual([
      "exec",
      "-m",
      "gpt-6-astra",
      "-c",
      "model_reasoning_effort=high",
      "-s",
      "workspace-write",
      "-C",
      "/w",
      "--skip-git-repo-check",
      `${lanePreamble("verify")}\n\nP`,
    ]);
    expect(inv.env).toEqual({ PATH: "/bin", LOOM_LANE: "verify" });
  });
  test("host Claude Code session env stripped; pins win", () => {
    const host = {
      PATH: "/bin",
      ANTHROPIC_API_KEY: "k",
      CLAUDE_CODE_MESSAGING_SOCKET: "/tmp/s.sock",
      CLAUDE_CODE_SESSION_ID: "sid",
      CLAUDECODE: "1",
      CLAUDE_CODE_EFFORT_LEVEL: "xhigh",
    };
    for (const lane of ["impl", "advise"] as const) {
      const inv = buildInvocation(lane, {
        prompt: "P",
        cwd: "/x",
        sandbox: "read-only",
        baseEnv: host,
      });
      expect(inv.env.CLAUDE_CODE_MESSAGING_SOCKET).toBeUndefined();
      expect(inv.env.CLAUDE_CODE_SESSION_ID).toBeUndefined();
      expect(inv.env.CLAUDECODE).toBeUndefined();
      expect(inv.env.CLAUDE_CODE_EFFORT_LEVEL).toBe(PINS.effort[lane]);
      expect(
        Object.keys(inv.env)
          .filter((k) => k.startsWith("CLAUDE_CODE_"))
          .sort(),
      ).toEqual([
        "CLAUDE_CODE_EFFORT_LEVEL",
        "CLAUDE_CODE_SUBAGENT_MODEL",
        "CLAUDE_CODE_SUBAGENT_MODEL_FORCE",
      ]);
      expect(inv.env.ANTHROPIC_API_KEY).toBe("k");
    }
    const v = buildInvocation("verify", {
      prompt: "P",
      cwd: "/x",
      sandbox: "read-only",
      baseEnv: host,
    });
    expect(
      Object.keys(v.env).filter((k) => k.startsWith("CLAUDE_CODE_") || k === "CLAUDECODE"),
    ).toEqual([]);
    expect(v.env.ANTHROPIC_API_KEY).toBe("k");
  });
  test("preambles", () => {
    expect(lanePreamble("impl").split("\n")[0]).toBe(
      "LOOM LANE: impl. You are an implementation lane, not the architect.",
    );
    expect(lanePreamble("verify")).toBe(VERIFY_PREAMBLE);
    expect(lanePreamble("advise")).toContain("ship / fix-first / rethink");
  });
});

// ─── End to end (fake binaries) ──────────────────────────────────────────────

describe("lane.ts e2e", () => {
  test("advise ok: exit 0, summary, meta schema, env + stdin", () => {
    const r = runLane(["advise", "--spec", spec, "--cwd", base, "--parallel"], {
      extraEnv: {
        LOOM_RELAY_TOKEN: "secret",
        LOOM_RELAY_URL: "ws://x",
        CLAUDECODE: "1",
        CLAUDE_CODE_SESSION_ID: "host-session",
        CLAUDE_CODE_EFFORT_LEVEL: "xhigh",
      },
    });
    expect(r.code).toBe(0);
    const lines = r.stdout.trim().split("\n");
    expect(lines.length).toBe(1);
    expect(lines[0]).toMatch(SUMMARY_RE);
    expect(lines[0]).toContain("lane=advise exit=0 reason=ok mainModel=claude-opus-5-5 denials=0");
    // fake record
    const rec = r.record!;
    expect(rec.stdin).toBe("");
    expect(rec.env).toEqual({
      LOOM_LANE: "advise",
      CLAUDE_CODE_EFFORT_LEVEL: "high",
      CLAUDE_CODE_SUBAGENT_MODEL: "claude-opus-5-5",
      CLAUDE_CODE_SUBAGENT_MODEL_FORCE: "1",
    });
    const argv = rec.argv as string[];
    expect(argv[0]).toBe("-p");
    expect(argv[1]).toContain("Do the thing.");
    expect(argv[1]).toContain("## Repo traps (inlined)");
    expect(argv[1]).toContain("## Must not (HANDOFF)\n**Must not:**");
    expect(argv[7]).toContain("# Loom Advisor");
    expect(argv[7]).not.toContain("name: loom-advisor");
    // run dir
    const dir = r.dir!;
    expect(dir.startsWith(runs)).toBe(true);
    expect(dir).toMatch(/\/\d{4}-advise$/);
    expect(readFileSync(join(dir, "spec.md"), "utf8")).toBe(readFileSync(spec, "utf8"));
    for (const f of ["argv.json", "stdout", "stderr", "meta.json"]) {
      expect(existsSync(join(dir, f))).toBe(true);
    }
    const av = JSON.parse(readFileSync(join(dir, "argv.json"), "utf8"));
    expect(av.cmd).toBe("claude");
    expect(av.args[1]).toMatch(/^<prompt:\d+ bytes>$/);
    expect(av.args[7]).toMatch(/^<system:\d+ bytes>$/);
    for (const k of [
      "LOOM_RELAY_TOKEN",
      "LOOM_RELAY_URL",
      "CLAUDECODE",
      "CLAUDE_CODE_SESSION_ID",
      "CLAUDE_CODE_EFFORT_LEVEL",
    ]) {
      expect(av.envUnset).toContain(k);
    }
    expect(JSON.stringify(av)).not.toContain("host-session");
    expect(av.envSet).toContain("CLAUDE_CODE_EFFORT_LEVEL");
    expect(JSON.stringify(av)).not.toContain("secret");
    const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"));
    expect(meta.lane).toBe("advise");
    expect(meta.pinnedModel).toBe("claude-opus-5-5");
    expect(Array.isArray(meta.resolvedModels)).toBe(true);
    expect(meta.mainModel).toBe("claude-opus-5-5");
    expect(meta.effort).toBe("high");
    expect(meta.permissionDenials).toEqual([]);
    expect(meta.diffEmpty).toBeNull();
    expect(meta.exit).toBe(0);
    expect(meta.exitReason).toBe("ok");
    expect(typeof meta.durationMs).toBe("number");
    expect(meta.costUsd).toBe(1.6);
    expect(Object.keys(meta).sort()).toEqual(
      [
        "lane",
        "pinnedModel",
        "resolvedModels",
        "mainModel",
        "effort",
        "permissionDenials",
        "diffEmpty",
        "exit",
        "exitReason",
        "durationMs",
        "costUsd",
        "effortResolved",
      ].sort(),
    );
  });

  test("aux small model does not trip mismatch", () => {
    const r = runLane(["advise", "--spec", spec, "--cwd", base], { mode: "aux" });
    expect(r.code).toBe(0);
    const meta = JSON.parse(readFileSync(join(r.dir!, "meta.json"), "utf8"));
    expect(meta.resolvedModels.length).toBe(2);
    expect(meta.mainModel).toBe("claude-opus-5-5");
  });

  const advCases: [string, number, string][] = [
    ["mismatch", 4, "model-mismatch"],
    ["denied", 5, "denied"],
    ["limit", 2, "limit"],
    ["crash", 1, "process-error"],
    ["nonjson", 1, "process-error"],
    ["crashmismatch", 1, "process-error"],
    ["mismatchdenied", 4, "model-mismatch"],
  ];
  for (const [mode, code, reason] of advCases) {
    test(`advise ${mode} → exit ${code} ${reason}`, () => {
      const r = runLane(["advise", "--spec", spec, "--cwd", base], { mode });
      expect(r.code).toBe(code);
      expect(r.stdout).toContain(`exit=${code} reason=${reason}`);
      const meta = JSON.parse(readFileSync(join(r.dir!, "meta.json"), "utf8"));
      expect(meta.exit).toBe(code);
      expect(meta.exitReason).toBe(reason);
    });
  }

  test("timeout beats limit → exit 3", () => {
    const t0 = Date.now();
    const r = runLane(["advise", "--spec", spec, "--cwd", base, "--timeout", "1"], {
      mode: "sleep",
    });
    expect(r.code).toBe(3);
    expect(r.stdout).toContain("reason=timeout");
    expect(Date.now() - t0).toBeLessThan(20000);
  }, 15000);

  test("SIGTERM ignored → SIGKILL fallback, exit 3, child gone", () => {
    const t0 = Date.now();
    const r = runLane(["advise", "--spec", spec, "--cwd", base, "--timeout", "1"], {
      mode: "stubborn",
    });
    const wall = Date.now() - t0;
    expect(r.code).toBe(3);
    expect(r.stdout).toContain("reason=timeout");
    expect(wall).toBeLessThan(10000);
    expect(wall).toBeGreaterThan(5000); // grace period actually elapsed before SIGKILL
    const pid = r.record!.pid as number;
    expect(() => process.kill(pid, 0)).toThrow();
  }, 15000);

  test("impl in git tree: no change → exit 6; change → exit 0; argv order", () => {
    const repo = gitRepo();
    const empty = runLane(["impl", "--spec", spec, "--cwd", repo], { mode: "ok" });
    expect(empty.code).toBe(6);
    expect(empty.stdout).toContain("reason=refused-empty");
    const argv = empty.record!.argv as string[];
    expect(argv[0]).toBe("-p");
    expect(argv[1]).toContain("Do the thing.");
    expect(argv.slice(2, 8)).toEqual([
      "--model",
      "claude-opus-5-5",
      "--output-format",
      "json",
      "--permission-mode",
      "acceptEdits",
    ]);
    expect(empty.record!.env).toEqual({
      LOOM_LANE: "impl",
      CLAUDE_CODE_EFFORT_LEVEL: "medium",
      CLAUDE_CODE_SUBAGENT_MODEL: "claude-opus-5-5",
      CLAUDE_CODE_SUBAGENT_MODEL_FORCE: "1",
    });
    expect(empty.record!.cwd).toBe(repo);
    const wrote = runLane(["impl", "--spec", spec, "--cwd", repo], { mode: "write" });
    expect(wrote.code).toBe(0);
    const meta = JSON.parse(readFileSync(join(wrote.dir!, "meta.json"), "utf8"));
    expect(meta.diffEmpty).toBe(false);
    expect(meta.effort).toBe("medium");
    rmSync(repo, { recursive: true, force: true });
  });

  test("R2-M1 impl outside git tree → arg error exit 1, no spawn, no run dir", () => {
    const d = realpathSync(mkdtempSync(join(tmpdir(), "lane-nogit-")));
    const own = join(base, "runs-nogit");
    const r = runLane(["impl", "--spec", spec, "--cwd", d], { mode: "write", runsDir: own });
    expect(r.code).toBe(1);
    expect(r.record).toBeNull();
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("[lane] impl requires a git work tree");
    expect(existsSync(own)).toBe(false);
    rmSync(d, { recursive: true, force: true });
  });

  test("R2-M1 git missing from PATH → impl arg error exit 1", () => {
    const repo = gitRepo();
    const onlyFake = join(base, "bin-nogit");
    mkdirSync(onlyFake, { recursive: true });
    writeFileSync(join(onlyFake, "claude"), FAKE_SRC);
    chmodSync(join(onlyFake, "claude"), 0o755);
    const record = join(base, "nogit-path.json");
    const env = { ...laneEnv(record, { mode: "write" }), PATH: onlyFake };
    const r = spawnSync(process.execPath, ["run", LANE_TS, "impl", "--spec", spec, "--cwd", repo], {
      env,
      encoding: "utf8",
      timeout: 60000,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("[lane] impl requires a git work tree");
    expect(existsSync(record)).toBe(false);
    rmSync(repo, { recursive: true, force: true });
  });

  test("R2-M1 snapshot failure after the run → exit 1 process-error, meta present", () => {
    const repo = gitRepo();
    const r = runLane(["impl", "--spec", spec, "--cwd", repo], { mode: "rmgit" });
    expect(r.code).toBe(1);
    expect(r.record).not.toBeNull();
    expect(r.stdout).toContain("reason=process-error");
    const meta = readMeta(r.dir!);
    expect(meta.exitReason).toBe("process-error");
    expect(meta.mainModel).toBe("claude-opus-5-5");
    expect(meta.diffEmpty).toBeNull();
    expect(readFileSync(join(r.dir!, "stderr"), "utf8")).toMatch(
      /\[lane\] diff snapshot failed: git -C \S+ status/,
    );
    rmSync(repo, { recursive: true, force: true });
  });

  test("R2-M1 impl diffEmpty is boolean", () => {
    const repo = gitRepo();
    const r = runLane(["impl", "--spec", spec, "--cwd", repo], { mode: "write" });
    expect(r.code).toBe(0);
    expect(readMeta(r.dir!).diffEmpty).toBe(false);
    rmSync(repo, { recursive: true, force: true });
  });

  test("verify: codex flags, header model, exit 0 / 4 / 2", () => {
    const ok = runLane(["verify", "--spec", spec, "--cwd", base]);
    expect(ok.code).toBe(0);
    expect(ok.stdout).toContain("lane=verify exit=0 reason=ok mainModel=gpt-6-astra denials=null");
    const argv = ok.record!.argv as string[];
    expect(argv.slice(0, 10)).toEqual([
      "exec",
      "-m",
      "gpt-6-astra",
      "-c",
      "model_reasoning_effort=high",
      "-s",
      "read-only",
      "-C",
      base,
      "--skip-git-repo-check",
    ]);
    expect(argv[10]!.startsWith(`${VERIFY_PREAMBLE}\n\n# Spec\nDo the thing.`)).toBe(true);
    expect(ok.record!.env).toEqual({ LOOM_LANE: "verify" });
    expect(ok.record!.stdin).toBe("");
    const meta = JSON.parse(readFileSync(join(ok.dir!, "meta.json"), "utf8"));
    expect(meta.permissionDenials).toBeNull();
    expect(meta.costUsd).toBeNull();
    expect(meta.resolvedModels).toEqual(["gpt-6-astra"]);
    expect(meta.pinnedModel).toBe("gpt-6-astra");
    const av = JSON.parse(readFileSync(join(ok.dir!, "argv.json"), "utf8"));
    expect(av.args[10]).toMatch(/^<prompt:\d+ bytes>$/);

    const mm = runLane(["verify", "--spec", spec, "--cwd", base], { mode: "mismatch" });
    expect(mm.code).toBe(4);
    const lim = runLane(["verify", "--spec", spec, "--cwd", base], { mode: "limit" });
    expect(lim.code).toBe(2);
  });

  test("seq increments", () => {
    const own = join(base, "runs-seq");
    const a = runLane(["advise", "--spec", spec, "--cwd", base], { runsDir: own });
    const b = runLane(["advise", "--spec", spec, "--cwd", base], { runsDir: own });
    expect(a.dir).toBe(join(own, "0001-advise"));
    expect(b.dir).toBe(join(own, "0002-advise"));
  });
});

// ─── Args + lock ─────────────────────────────────────────────────────────────

describe("args and lock", () => {
  const argErr = (args: string[]) => {
    const own = join(base, `runs-argerr-${++recordSeq}`);
    const r = runLane(args, { runsDir: own });
    expect(r.code).toBe(1);
    expect(r.record).toBeNull(); // no child spawned
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("[lane]");
  };
  test("bad lane", () => argErr(["build", "--spec", spec]));
  test("missing spec", () => argErr(["advise"]));
  test("--sandbox on non-verify", () =>
    argErr(["impl", "--spec", spec, "--cwd", base, "--sandbox", "read-only"]));
  test("--cwd outside repo/tmp rejected", () => argErr(["advise", "--spec", spec, "--cwd", "/"]));
  test("--parallel on impl rejected", () =>
    argErr(["impl", "--spec", spec, "--cwd", base, "--parallel"]));
  test("--parallel on verify workspace-write rejected", () =>
    argErr([
      "verify",
      "--spec",
      spec,
      "--cwd",
      base,
      "--sandbox",
      "workspace-write",
      "--parallel",
    ]));
  test("--cwd inside repo accepted", () => {
    const r = runLane(["advise", "--spec", spec, "--cwd", REPO]);
    expect(r.code).toBe(0);
  });

  test("(1)(2)(5)(6) flock holder → heavy fails fast; light ignores; after SIGKILL heavy runs; file kept", async () => {
    const own = join(base, "runs-lock-holder");
    mkdirSync(own, { recursive: true });
    const lock = join(own, "heavy.lock");
    const holder = startLockHolder(lock);
    expect(await holder.ready).toBe(true);
    // (1) heavy lane: fail fast, no spawn, no run dir
    const lockRepo = gitRepo();
    const r = runLane(["impl", "--spec", spec, "--cwd", lockRepo], { runsDir: own });
    expect(r.code).toBe(1);
    expect(r.record).toBeNull();
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain("[lane] another heavy lane holds the lock");
    expect(readdirSync(own)).toEqual(["heavy.lock"]);
    // verify workspace-write is heavy too
    const vw = runLane(["verify", "--spec", spec, "--cwd", base, "--sandbox", "workspace-write"], {
      runsDir: own,
    });
    expect(vw.code).toBe(1);
    expect(vw.record).toBeNull();
    // (6) light lanes ignore the lock
    const light = runLane(["advise", "--spec", spec, "--cwd", base], { runsDir: own });
    expect(light.code).toBe(0);
    const vro = runLane(["verify", "--spec", spec, "--cwd", base], { runsDir: own });
    expect(vro.code).toBe(0);
    // (2) holder SIGKILLed → kernel releases; heavy lane acquires and runs, no stale handling
    holder.proc.kill("SIGKILL");
    await holder.proc.exited;
    const d = gitRepo();
    const after = runLane(["impl", "--spec", spec, "--cwd", d], { runsDir: own, mode: "write" });
    expect(after.code).toBe(0);
    expect(after.record).not.toBeNull();
    expect(readFileSync(join(after.dir!, "stderr"), "utf8")).not.toContain("reclaim");
    // (5) file still exists after the run (never unlinked); content is diagnostic only
    expect(existsSync(lock)).toBe(true);
    expect(readFileSync(lock, "utf8")).toMatch(/^pid=\d+ started=\S+\n$/);
    rmSync(d, { recursive: true, force: true });
  }, 20000);

  test("(3) dead-pid content but not flocked → acquires, content ignored, file kept", () => {
    const own = join(base, "runs-lock-deadcontent");
    mkdirSync(own, { recursive: true });
    const lock = join(own, "heavy.lock");
    const deadPid = Number(spawnSync("sh", ["-c", "echo $$"], { encoding: "utf8" }).stdout.trim());
    writeFileSync(lock, String(deadPid));
    const d = gitRepo();
    const r = runLane(["impl", "--spec", spec, "--cwd", d], { runsDir: own, mode: "write" });
    expect(r.code).toBe(0);
    expect(readFileSync(join(r.dir!, "stderr"), "utf8")).not.toContain("reclaim");
    expect(existsSync(lock)).toBe(true);
    // a live pid in the content (our own) is ignored too
    writeFileSync(lock, String(process.pid));
    const r2 = runLane(["impl", "--spec", spec, "--cwd", d], { runsDir: own, mode: "write" });
    expect(r2.code).toBe(0);
    expect(existsSync(lock)).toBe(true);
    rmSync(d, { recursive: true, force: true });
  });

  test("(4) 5 concurrent heavy wrappers → exactly one spawns", async () => {
    const own = join(base, "runs-lock-race");
    mkdirSync(own, { recursive: true });
    const d = gitRepo();
    const records = Array.from({ length: 5 }, (_, i) => join(base, `race-${i}.json`));
    const procs = records.map((rec) =>
      Bun.spawn(["bun", "run", LANE_TS, "impl", "--spec", spec, "--cwd", d], {
        env: laneEnv(rec, { mode: "hold", runsDir: own }),
        stdout: "pipe",
        stderr: "pipe",
      }),
    );
    const codes = await Promise.all(procs.map((p) => p.exited));
    const errs = await Promise.all(procs.map((p) => new Response(p.stderr).text()));
    expect(records.filter((r) => existsSync(r)).length).toBe(1);
    expect(codes.filter((c) => c === 0).length).toBe(1);
    expect(codes.filter((c) => c === 1).length).toBe(4);
    for (let i = 0; i < 5; i++) {
      if (codes[i] === 1) expect(errs[i]).toContain("[lane] another heavy lane holds the lock");
    }
    expect(existsSync(join(own, "heavy.lock"))).toBe(true);
    rmSync(d, { recursive: true, force: true });
  }, 20000);

  test("lock released after timeout (file kept, re-acquirable)", () => {
    const own = join(base, "runs-lock-timeout");
    const d = gitRepo();
    const r = runLane(["impl", "--spec", spec, "--cwd", d, "--timeout", "1"], {
      runsDir: own,
      mode: "sleep",
    });
    expect(r.code).toBe(3);
    expect(existsSync(join(own, "heavy.lock"))).toBe(true);
    const again = runLane(["impl", "--spec", spec, "--cwd", d], { runsDir: own, mode: "write" });
    expect(again.code).toBe(0);
    rmSync(d, { recursive: true, force: true });
  }, 15000);
});

// ─── Verifier rulings: H1 codex evidence · H2 atomic lock · H3 no orphans · M1 evidence ─

describe("H1 codex header evidence", () => {
  const cases: [string, number][] = [
    ["stdoutmodel", 4],
    ["noheader", 4],
    ["effortmedium", 4],
    ["ok", 0],
    ["realpreamble", 0],
    ["latebanner", 4],
    ["fakebanner", 0],
    ["userbanner", 4],
  ];
  for (const [mode, code] of cases) {
    test(`verify ${mode} → exit ${code}`, () => {
      const r = runLane(["verify", "--spec", spec, "--cwd", base], { mode });
      expect(r.code).toBe(code);
      const meta = readMeta(r.dir!);
      if (mode === "stdoutmodel") expect(meta.mainModel).toBe("gpt-5.5");
      if (mode === "noheader") expect(meta.mainModel).toBeNull();
      if (mode === "effortmedium") {
        expect(meta.mainModel).toBe("gpt-6-astra");
        expect(meta.effortResolved).toBe("medium");
      }
      if (mode === "ok") expect(meta.effortResolved).toBe("high");
      if (mode === "realpreamble" || mode === "fakebanner") {
        expect(meta.mainModel).toBe("gpt-6-astra");
        expect(meta.effortResolved).toBe("high");
      }
      if (mode === "latebanner" || mode === "userbanner") expect(meta.mainModel).toBeNull();
    });
  }
  test("claude lane effortResolved is null", () => {
    const r = runLane(["advise", "--spec", spec, "--cwd", base]);
    expect(readMeta(r.dir!).effortResolved).toBeNull();
  });
});

describe("H3 no orphans", () => {
  test("timeout: SIGTERM-ignoring grandchild is SIGKILLed after grace", async () => {
    const r = runLane(["advise", "--spec", spec, "--cwd", base, "--timeout", "1"], {
      mode: "gchild",
    });
    expect(r.code).toBe(3);
    const gcFile = `${join(base, `record-${recordSeq}.json`)}.gc`;
    const gc = Number(readFileSync(gcFile, "utf8"));
    expect(gc).toBeGreaterThan(0);
    expect(await waitGone(gc)).toBe(true);
  }, 15000);

  test("normal exit: background grandchild reaped", async () => {
    const r = runLane(["advise", "--spec", spec, "--cwd", base], { mode: "bgchild" });
    expect(r.code).toBe(0);
    const gc = Number(readFileSync(`${join(base, `record-${recordSeq}.json`)}.gc`, "utf8"));
    expect(gc).toBeGreaterThan(0);
    expect(await waitGone(gc)).toBe(true);
  });

  test("wrapper SIGTERM → exit 1, process-error meta, lock released, child gone", async () => {
    const own = join(base, "runs-sigterm");
    const d = gitRepo();
    const rec = join(base, "sigterm-record.json");
    const p = Bun.spawn(["bun", "run", LANE_TS, "impl", "--spec", spec, "--cwd", d], {
      env: laneEnv(rec, { mode: "sleep", runsDir: own }),
      stdout: "pipe",
      stderr: "pipe",
    });
    const end = Date.now() + 10000;
    while (!existsSync(rec) && Date.now() < end) await Bun.sleep(50);
    expect(existsSync(rec)).toBe(true);
    await Bun.sleep(100);
    p.kill("SIGTERM");
    const code = await p.exited;
    const stdout = await new Response(p.stdout).text();
    expect(code).toBe(1);
    expect(stdout).toContain("reason=process-error");
    const dir = /dir=(\S+)$/m.exec(stdout)![1]!;
    expect(readMeta(dir).exitReason).toBe("process-error");
    expect(readFileSync(join(dir, "stderr"), "utf8")).toContain("[lane] interrupted by SIGTERM");
    // lock released (re-acquirable) and file kept
    expect(existsSync(join(own, "heavy.lock"))).toBe(true);
    const again = runLane(["impl", "--spec", spec, "--cwd", d], { runsDir: own, mode: "write" });
    expect(again.code).toBe(0);
    const childPid = JSON.parse(readFileSync(rec, "utf8")).pid as number;
    expect(await waitGone(childPid)).toBe(true);
    rmSync(d, { recursive: true, force: true });
  }, 20000);
});

describe("M1 evidence on every failure", () => {
  test("huge spec → argv too large, meta + summary, no spawn", () => {
    const big = join(base, "big-spec.md");
    writeFileSync(big, `# Big\n${"x".repeat(1_200_000)}\n`);
    const r = runLane(["advise", "--spec", big, "--cwd", base]);
    expect(r.code).toBe(1);
    expect(r.record).toBeNull();
    expect(r.stdout.trim()).toMatch(SUMMARY_RE);
    expect(r.stdout).toContain("reason=process-error mainModel=null");
    const meta = readMeta(r.dir!);
    expect(meta.exitReason).toBe("process-error");
    expect(meta.exit).toBe(1);
    expect(meta.mainModel).toBeNull();
    expect(typeof meta.durationMs).toBe("number");
    expect(readFileSync(join(r.dir!, "stderr"), "utf8")).toMatch(
      /\[lane\] argv too large \(\d+ bytes\)/,
    );
  });
});

// ─── Round 2: pgid reuse · spawn-exception coverage · lock during grace ──────

describe("R2-H group probe cancels SIGKILL", () => {
  test("whole group exits on SIGTERM → wrapper finishes well before the 5 s grace, exit 3", () => {
    const t0 = Date.now();
    const r = runLane(["advise", "--spec", spec, "--cwd", base, "--timeout", "1"], {
      mode: "sleep",
    });
    const wall = Date.now() - t0;
    expect(r.code).toBe(3);
    expect(r.stdout).toContain("reason=timeout");
    expect(wall).toBeLessThan(4000);
  }, 15000);
});

describe("R2-M2 spawn exception paths", () => {
  const assertSpawnFail = (stdout: string, code: number | null, pattern: RegExp) => {
    expect(code).toBe(1);
    expect(stdout.trim()).toMatch(SUMMARY_RE);
    expect(stdout).toContain("reason=process-error mainModel=null");
    const dir = /dir=(\S+)$/m.exec(stdout)![1]!;
    const meta = readMeta(dir);
    expect(meta.exitReason).toBe("process-error");
    expect(meta.exit).toBe(1);
    expect(readFileSync(join(dir, "stderr"), "utf8")).toMatch(pattern);
  };

  test("(a) no claude on PATH → spawn error evidence", () => {
    const record = join(base, "noclaude.json");
    const env = { ...laneEnv(record, {}), PATH: "/usr/bin:/bin" };
    const r = spawnSync(
      process.execPath,
      ["run", LANE_TS, "advise", "--spec", spec, "--cwd", base],
      {
        env,
        encoding: "utf8",
        timeout: 60000,
      },
    );
    assertSpawnFail(r.stdout, r.status, /\[lane\] spawn error: /);
    expect(existsSync(record)).toBe(false);
  });

  test("(b) synchronous spawn throw (NUL byte in argv) → spawn error evidence", () => {
    const nulSpec = join(base, "nul-spec.md");
    writeFileSync(nulSpec, "# Spec\nbad\u0000byte\n");
    const r = runLane(["advise", "--spec", nulSpec, "--cwd", base]);
    expect(r.record).toBeNull();
    assertSpawnFail(r.stdout, r.code, /\[lane\] spawn error: .*null bytes/);
  });
});

describe("R2-M3 heavy lock held through the grace period", () => {
  test("second impl during grace → lock busy; third after return → acquires", async () => {
    const own = join(base, "runs-grace-lock");
    const repo = gitRepo();
    const rec1 = join(base, "grace-1.json");
    const p1 = Bun.spawn(
      ["bun", "run", LANE_TS, "impl", "--spec", spec, "--cwd", repo, "--timeout", "1"],
      { env: laneEnv(rec1, { mode: "gchild", runsDir: own }), stdout: "pipe", stderr: "pipe" },
    );
    const end = Date.now() + 10000;
    while (!existsSync(rec1) && Date.now() < end) await Bun.sleep(50);
    expect(existsSync(rec1)).toBe(true);
    await Bun.sleep(2000); // timeout fired at ~1 s; grace runs until ~6 s
    expect(p1.exitCode).toBeNull(); // still inside the grace
    const r2 = runLane(["impl", "--spec", spec, "--cwd", repo], { runsDir: own, mode: "write" });
    expect(r2.code).toBe(1);
    expect(r2.record).toBeNull();
    expect(r2.stderr).toContain("[lane] another heavy lane holds the lock");
    expect(await p1.exited).toBe(3);
    const gc = Number(readFileSync(`${rec1}.gc`, "utf8"));
    expect(await waitGone(gc)).toBe(true);
    const r3 = runLane(["impl", "--spec", spec, "--cwd", repo], { runsDir: own, mode: "write" });
    expect(r3.code).toBe(0);
    rmSync(repo, { recursive: true, force: true });
  }, 30000);
});

// ─── Round 3: listener hygiene · snapshot-failure coverage ───────────────────

describe("R3 signal listeners never leak", () => {
  const counts = () => [process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")];
  test("non-git impl cwd (in-process) leaves listener counts unchanged", async () => {
    const d = realpathSync(mkdtempSync(join(tmpdir(), "lane-nogit-")));
    const before = counts();
    expect(await runLaneInProcess(["impl", "--spec", spec, "--cwd", d])).toBe(1);
    expect(counts()).toEqual(before);
    rmSync(d, { recursive: true, force: true });
  });
  test("held lock (in-process) leaves listener counts unchanged", async () => {
    const own = join(base, "runs-listener-lock");
    mkdirSync(own, { recursive: true });
    const holder = startLockHolder(join(own, "heavy.lock"));
    expect(await holder.ready).toBe(true);
    const repo = gitRepo();
    const prev = process.env.LOOM_LANE_RUNS_DIR;
    process.env.LOOM_LANE_RUNS_DIR = own;
    try {
      const before = counts();
      expect(await runLaneInProcess(["impl", "--spec", spec, "--cwd", repo])).toBe(1);
      expect(counts()).toEqual(before);
    } finally {
      if (prev === undefined) delete process.env.LOOM_LANE_RUNS_DIR;
      else process.env.LOOM_LANE_RUNS_DIR = prev;
      holder.proc.kill("SIGKILL");
      await holder.proc.exited;
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

describe("R3 snapshot failures (git PATH shim)", () => {
  /** PATH shim: delegates to real git, fails the Nth call of one subcommand. */
  const makeShim = (sub: string, call: number) => {
    const realGit = Bun.which("git");
    expect(realGit).not.toBeNull();
    const dir = join(base, `git-shim-${++recordSeq}`);
    mkdirSync(dir, { recursive: true });
    const counter = join(dir, "count");
    writeFileSync(
      join(dir, "git"),
      [
        "#!/bin/sh",
        `if [ "$3" = "${sub}" ]; then`,
        `  n=$(cat "${counter}" 2>/dev/null || echo 0); n=$((n+1)); echo $n > "${counter}"`,
        `  if [ "$n" = "${call}" ]; then echo "shim: forced ${sub} failure" >&2; exit 128; fi`,
        "fi",
        `exec "${realGit}" "$@"`,
      ].join("\n"),
    );
    chmodSync(join(dir, "git"), 0o755);
    return `${dir}:${bin}:${process.env.PATH ?? ""}`;
  };

  test("(a) pre-run status failure → no spawn, meta process-error, diffEmpty null", () => {
    const repo = gitRepo();
    const r = runLane(["impl", "--spec", spec, "--cwd", repo], {
      mode: "write",
      extraEnv: { PATH: makeShim("status", 1) },
    });
    expect(r.code).toBe(1);
    expect(r.record).toBeNull();
    expect(r.stdout).toContain("reason=process-error mainModel=null");
    const meta = readMeta(r.dir!);
    expect(meta.exitReason).toBe("process-error");
    expect(meta.diffEmpty).toBeNull();
    expect(readFileSync(join(r.dir!, "stderr"), "utf8")).toContain(
      `[lane] diff snapshot failed: git -C ${repo} status --porcelain=v1 -uall`,
    );
    rmSync(repo, { recursive: true, force: true });
  });

  test("(b) post-run `git diff` failure → exit 1 process-error, diffEmpty null", () => {
    const repo = gitRepo();
    const r = runLane(["impl", "--spec", spec, "--cwd", repo], {
      mode: "write",
      // each snapshot runs `diff` twice (worktree + --cached) → call 3 = first post-run diff
      extraEnv: { PATH: makeShim("diff", 3) },
    });
    expect(r.code).toBe(1);
    expect(r.record).not.toBeNull();
    const meta = readMeta(r.dir!);
    expect(meta.exitReason).toBe("process-error");
    expect(meta.diffEmpty).toBeNull();
    expect(readFileSync(join(r.dir!, "stderr"), "utf8")).toContain(
      `[lane] diff snapshot failed: git -C ${repo} diff`,
    );
    rmSync(repo, { recursive: true, force: true });
  });

  test("(b') pre-run `git diff` failure → no spawn", () => {
    const repo = gitRepo();
    const r = runLane(["impl", "--spec", spec, "--cwd", repo], {
      mode: "write",
      extraEnv: { PATH: makeShim("diff", 1) },
    });
    expect(r.code).toBe(1);
    expect(r.record).toBeNull();
    expect(readMeta(r.dir!).diffEmpty).toBeNull();
    rmSync(repo, { recursive: true, force: true });
  });
});

// ─── gitSnapshot (P4 0015: edits to already-untracked files) ─────────────────

describe("gitSnapshot", () => {
  const snap = (repo: string): string => {
    const s = gitSnapshot(repo);
    if (!s.ok) throw new Error(`snapshot failed: ${s.cmd}`);
    return s.text;
  };

  test("untracked file edited between snapshots → texts differ", () => {
    const repo = gitRepo();
    const before = snap(repo);
    writeFileSync(join(repo, "a.txt"), "a\nmore\n");
    expect(snap(repo)).not.toBe(before);
    rmSync(repo, { recursive: true, force: true });
  });

  test("staged content re-staged with new bytes → texts differ", () => {
    const repo = gitRepo();
    spawnSync("git", ["-C", repo, "add", "a.txt"]);
    const before = snap(repo);
    writeFileSync(join(repo, "a.txt"), "a\nstaged again\n");
    spawnSync("git", ["-C", repo, "add", "a.txt"]);
    expect(snap(repo)).not.toBe(before);
    rmSync(repo, { recursive: true, force: true });
  });

  test("nothing changed → texts equal", () => {
    const repo = gitRepo();
    expect(snap(repo)).toBe(snap(repo));
    rmSync(repo, { recursive: true, force: true });
  });

  test("dangling symlink → ok, described as a link (never followed)", () => {
    const repo = gitRepo();
    symlinkSync(join(repo, "missing-target"), join(repo, "dangling"));
    const s = gitSnapshot(repo);
    expect(s.ok).toBe(true);
    if (s.ok) expect(s.text).toContain(`dangling\tlink\t${join(repo, "missing-target")}`);
    rmSync(repo, { recursive: true, force: true });
  });

  test("chmod +x on an untracked file → texts differ", () => {
    const repo = gitRepo();
    chmodSync(join(repo, "a.txt"), 0o644);
    const before = snap(repo);
    chmodSync(join(repo, "a.txt"), 0o755);
    expect(snap(repo)).not.toBe(before);
    rmSync(repo, { recursive: true, force: true });
  });

  test("dangling symlink retargeted to another missing target → texts differ", () => {
    const repo = gitRepo();
    const link = join(repo, "dangling");
    symlinkSync(join(repo, "missing-1"), link);
    const before = snap(repo);
    unlinkSync(link);
    symlinkSync(join(repo, "missing-2"), link);
    expect(snap(repo)).not.toBe(before);
    rmSync(repo, { recursive: true, force: true });
  });

  test("symlink retargeted between two same-content files → texts differ", () => {
    const repo = gitRepo();
    writeFileSync(join(repo, "b.txt"), "a\n");
    const link = join(repo, "ln");
    symlinkSync("a.txt", link);
    const before = snap(repo);
    unlinkSync(link);
    symlinkSync("b.txt", link);
    expect(snap(repo)).not.toBe(before);
    rmSync(repo, { recursive: true, force: true });
  });

  test("untracked FIFO + symlink to it → returns promptly, never opened", () => {
    const repo = gitRepo();
    const mk = spawnSync("mkfifo", [join(repo, "pipe")]);
    if (mk.error || mk.status !== 0) {
      rmSync(repo, { recursive: true, force: true });
      return; // mkfifo unavailable — skip
    }
    symlinkSync("pipe", join(repo, "pipe-link"));
    const s = gitSnapshot(repo);
    expect(s.ok).toBe(true);
    if (s.ok) {
      expect(s.text).toContain("pipe-link\tlink\tpipe");
      // git (2026-10-17, macOS) does not list a FIFO under `ls-files --others` at all; if a
      // version ever does, it must be described from lstat, not read.
      if (/(^|\n)pipe\t/.test(s.text)) expect(s.text).toContain("pipe\tfifo\t");
    }
    rmSync(repo, { recursive: true, force: true });
  }, 5000);
});
