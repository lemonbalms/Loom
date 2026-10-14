/**
 * P3 review regressions for worker permission enums, codex -c TOML encoding,
 * and lenient claude/grok stream parsing.
 */
import { describe, expect, test } from "bun:test";
import {
  HEADLESS_WORKER_HINT,
  buildAgentArgv,
  defaultWorkerPermissions,
  validateWorkerConfig,
  type AgentKind,
  type WorkerConfig,
  type WorkerPermissions,
} from "./agent-argv";
import { parseAgentStream } from "./agent-stream-parsers";

const CWD = "/tmp/loom-work";
const SESSION = "11111111-1111-4111-8111-111111111111";
const RESUME = "22222222-2222-4222-8222-222222222222";
const PROMPT_FILE = "/tmp/loom-prompt.txt";

function config(permissions: WorkerPermissions): WorkerConfig {
  return {
    backend: "headless",
    cwd: CWD,
    allowedRoots: [CWD],
    maxConcurrent: { claude: 1, codex: 1, grok: 1 },
    timeoutMs: 7_200_000,
    permissions,
  };
}

function input(
  agent: AgentKind,
  permissions: WorkerPermissions,
  extra: { resume?: boolean; hint?: string } = {},
) {
  return {
    agent,
    cwd: CWD,
    sessionId: SESSION,
    resumeSessionId: extra.resume ? RESUME : undefined,
    hint: extra.hint ?? HEADLESS_WORKER_HINT,
    prompt: "prompt-not-in-argv",
    promptFile: PROMPT_FILE,
    permissions,
  };
}

function expectRejected(agent: AgentKind, permissions: WorkerPermissions): void {
  expect(() => validateWorkerConfig(config(permissions))).toThrow();
  expect(() => buildAgentArgv(input(agent, permissions))).toThrow();
  expect(() => buildAgentArgv(input(agent, permissions, { resume: true }))).toThrow();
}

/** Minimal TOML basic-string decoder (double quotes, named escapes, \\uXXXX). */
function decodeTomlBasicString(quoted: string): string {
  if (quoted.length < 2 || !quoted.startsWith('"') || !quoted.endsWith('"')) {
    throw new Error(`not a TOML basic string: ${quoted}`);
  }
  const body = quoted.slice(1, -1);
  let out = "";
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;
    if (ch !== "\\") {
      out += ch;
      continue;
    }
    const esc = body[i + 1];
    if (esc === undefined) throw new Error("truncated escape");
    i += 1;
    if (esc === "\\") out += "\\";
    else if (esc === '"') out += '"';
    else if (esc === "n") out += "\n";
    else if (esc === "t") out += "\t";
    else if (esc === "r") out += "\r";
    else if (esc === "b") out += "\b";
    else if (esc === "f") out += "\f";
    else if (esc === "u") {
      const hex = body.slice(i + 1, i + 5);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new Error(`bad \\u escape: ${hex}`);
      out += String.fromCharCode(Number.parseInt(hex, 16));
      i += 4;
    } else {
      throw new Error(`bad escape \\${esc}`);
    }
  }
  return out;
}

function cValue(argv: string[], key: string): string {
  const prefix = `${key}=`;
  for (let i = 0; i < argv.length; i++) {
    const next = argv[i + 1];
    if (argv[i] === "-c" && next?.startsWith(prefix)) return next.slice(prefix.length);
  }
  throw new Error(`missing -c ${key}`);
}

describe("headless P3 review", () => {
  test("permission fields reject dangerous, case, and whitespace variants", () => {
    const base = defaultWorkerPermissions();
    const cases: Array<{ agent: AgentKind; permissions: WorkerPermissions }> = [
      {
        agent: "codex",
        permissions: {
          ...base,
          codex: { ...base.codex!, sandbox: "danger-full-access" },
        },
      },
      {
        agent: "codex",
        permissions: {
          ...base,
          codex: { ...base.codex!, sandbox: "Danger-Full-Access" },
        },
      },
      {
        agent: "codex",
        permissions: {
          ...base,
          codex: { ...base.codex!, sandbox: " workspace-write" },
        },
      },
      {
        agent: "codex",
        permissions: {
          ...base,
          codex: { ...base.codex!, sandbox: "workspace-write\n" },
        },
      },
      {
        agent: "claude",
        permissions: {
          ...base,
          claude: { ...base.claude!, permissionMode: "bypassPermissions" },
        },
      },
      {
        agent: "grok",
        permissions: {
          ...base,
          grok: { ...base.grok!, permissionMode: "bypassPermissions" },
        },
      },
      {
        agent: "claude",
        permissions: {
          ...base,
          claude: { ...base.claude!, permissionMode: "AcceptEdits" },
        },
      },
      {
        agent: "codex",
        permissions: {
          ...base,
          codex: { ...base.codex!, approvalPolicy: "bogus" },
        },
      },
      {
        agent: "codex",
        permissions: {
          ...base,
          codex: { ...base.codex!, approvalPolicy: "Never" },
        },
      },
    ];
    for (const item of cases) expectRejected(item.agent, item.permissions);
  });

  test("default profiles and the other allowed enum values still build", () => {
    const defaults = defaultWorkerPermissions();
    expect(() => validateWorkerConfig(config(defaults))).not.toThrow();
    for (const agent of ["claude", "codex", "grok"] as const) {
      expect(() => buildAgentArgv(input(agent, defaults))).not.toThrow();
      expect(() =>
        buildAgentArgv(input(agent, defaults, { resume: true })),
      ).not.toThrow();
    }
    const allowed: Array<{ agent: AgentKind; permissions: WorkerPermissions }> = [
      {
        agent: "claude",
        permissions: {
          ...defaults,
          claude: { ...defaults.claude!, permissionMode: "plan" },
        },
      },
      {
        agent: "grok",
        permissions: {
          ...defaults,
          grok: { ...defaults.grok!, permissionMode: "default" },
        },
      },
      {
        agent: "codex",
        permissions: {
          ...defaults,
          codex: { sandbox: "read-only", approvalPolicy: "on-failure" },
        },
      },
      {
        agent: "codex",
        permissions: {
          ...defaults,
          codex: { sandbox: "workspace-write", approvalPolicy: "on-request" },
        },
      },
      {
        agent: "codex",
        permissions: {
          ...defaults,
          codex: { sandbox: "workspace-write", approvalPolicy: "untrusted" },
        },
      },
    ];
    for (const item of allowed) {
      expect(() => validateWorkerConfig(config(item.permissions))).not.toThrow();
      expect(() => buildAgentArgv(input(item.agent, item.permissions))).not.toThrow();
      expect(() =>
        buildAgentArgv(input(item.agent, item.permissions, { resume: true })),
      ).not.toThrow();
    }
  });

  test("codex -c values with quotes, slashes, and controls round-trip as TOML basic strings", () => {
    const hint = 'say "hi" \\ back\nnext\tcol\r\b\f\u0001\u007F';
    const permissions = defaultWorkerPermissions();
    for (const resume of [false, true]) {
      const argv = buildAgentArgv(input("codex", permissions, { resume, hint })).argv;
      const raw = cValue(argv, "developer_instructions");
      expect(raw.startsWith('"')).toBe(true);
      expect(raw.endsWith('"')).toBe(true);
      expect(raw.includes("\n")).toBe(false);
      expect(raw.includes("\t")).toBe(false);
      expect(raw.includes("\r")).toBe(false);
      expect(raw).toContain('\\"');
      expect(raw).toContain("\\\\");
      expect(raw).toContain("\\n");
      expect(raw).toContain("\\t");
      expect(raw).toContain("\\r");
      expect(raw).toContain("\\b");
      expect(raw).toContain("\\f");
      expect(raw).toContain("\\u0001");
      expect(raw).toContain("\\u007f");
      expect(decodeTomlBasicString(raw)).toBe(hint);
      if (resume) {
        expect(argv).not.toContain("--sandbox");
        expect(decodeTomlBasicString(cValue(argv, "sandbox_mode"))).toBe(
          "workspace-write",
        );
      } else {
        expect(argv[argv.indexOf("--sandbox") + 1]).toBe("workspace-write");
        expect(argv.some((arg) => arg.startsWith("sandbox_mode="))).toBe(false);
      }
      const approval = cValue(argv, "approval_policy");
      const approvalValue = approval.startsWith('"')
        ? decodeTomlBasicString(approval)
        : approval;
      expect(approvalValue).toBe("never");
    }
  });

  test("claude result with a raw newline inside a string is kept, and a trailing fragment is not", () => {
    const event =
      '{"type":"result","result":"hello\nworld","session_id":"sid-lf","is_error":false,"usage":{"output_tokens":2},"permission_denials":[]}';
    expect(() => JSON.parse(event)).toThrow();
    const jsonl = `Reading additional input from stdin...\n\n${event}\n{"type":"result","result":"trunc`;
    const parsed = parseAgentStream("claude", jsonl);
    expect(parsed.sessionId).toBe("sid-lf");
    expect(parsed.finalText).toBe("hello\nworld");
    expect(parsed.isError).toBe(false);
    expect(parsed.usage).toEqual({ output_tokens: 2 });
  });

  test("claude without a result falls back to assistant text and the init session", () => {
    const jsonl = [
      JSON.stringify({ type: "system", subtype: "init", session_id: "init-1" }),
      JSON.stringify({
        type: "assistant",
        session_id: "asst-1",
        message: {
          content: [
            { type: "text", text: "hel" },
            { type: "tool_use", id: "t1" },
            { type: "text", text: "lo" },
          ],
        },
      }),
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: "!" }] },
      }),
    ].join("\n");
    const parsed = parseAgentStream("claude", jsonl);
    expect(parsed.finalText).toBe("hello!");
    expect(parsed.sessionId).toBe("init-1");
    expect(parsed.isError).toBe(false);
  });

  test("claude fallback uses assistant session_id when init is missing", () => {
    const parsed = parseAgentStream(
      "claude",
      JSON.stringify({
        type: "assistant",
        session_id: "asst-only",
        message: { content: [{ type: "text", text: "only" }] },
      }),
    );
    expect(parsed.finalText).toBe("only");
    expect(parsed.sessionId).toBe("asst-only");
  });

  test("claude result wins over assistant text and the init session", () => {
    const jsonl = [
      JSON.stringify({ type: "system", subtype: "init", session_id: "init-sid" }),
      JSON.stringify({
        type: "assistant",
        session_id: "asst-sid",
        message: { content: [{ type: "text", text: "draft" }] },
      }),
      JSON.stringify({
        type: "result",
        result: "final-answer",
        session_id: "result-sid",
        is_error: true,
        usage: { output_tokens: 9 },
        permission_denials: [{ tool_name: "Bash", tool_input: { command: "rm" } }],
      }),
    ].join("\n");
    const parsed = parseAgentStream("claude", jsonl);
    expect(parsed.finalText).toBe("final-answer");
    expect(parsed.sessionId).toBe("result-sid");
    expect(parsed.isError).toBe(true);
    expect(parsed.usage).toEqual({ output_tokens: 9 });
    expect(parsed.denials).toEqual([
      { toolName: "Bash", toolInput: { command: "rm" } },
    ]);
  });

  test("grok denied: split across chunks is detected on the joined line", () => {
    const jsonl = [
      JSON.stringify({ type: "text", data: "before\nden" }),
      JSON.stringify({ type: "text", data: "ied: Bash touch x\nafter" }),
      JSON.stringify({
        type: "end",
        sessionId: "g-split",
        stopReason: "end_turn",
        usage: { output_tokens: 1 },
      }),
    ].join("\n");
    const parsed = parseAgentStream("grok", jsonl);
    expect(parsed.finalText).toBe("before\ndenied: Bash touch x\nafter");
    expect(parsed.denials).toEqual([{ text: "denied: Bash touch x" }]);
    expect(parsed.sessionId).toBe("g-split");
    expect(parsed.isError).toBe(false);
  });
});
