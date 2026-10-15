/**
 * assumed API (v0.30.0 P2 — modules are not implemented; this file is expected-red)
 *
 * from "./agent-stream-parsers":
 *   parseAgentStream(agent: "claude" | "codex" | "grok", jsonl: string) -> {
 *     sessionId: string | null
 *     finalText: string
 *     isError: boolean
 *     usage: unknown
 *     denials: { toolName?, toolInput?, command?, exitCode?, text? }[]
 *   }
 *   Claude: result.session_id / result.result / result.is_error / result.usage /
 *     result.permission_denials[{tool_name, tool_input}]. Raw U+0000–U+001F
 *     inside JSON strings are stripped or escaped, then parsed (PROBE §7.1).
 *   Codex: thread.started.thread_id (absent -> sessionId null, no throw),
 *     last agent_message item.text, turn.completed.usage,
 *     command_execution with exit_code !== 0 is a denial only when
 *     aggregated_output names a sandbox/permission block ("Operation not
 *     permitted", "Permission denied", "Read-only file system", "sandbox",
 *     case-insensitive).
 *     Other non-zero exits are ordinary command failures.
 *     isError false unless some object has is_error:true.
 *   Grok: concatenate text.data, end.sessionId, end.usage,
 *     end.stopReason === "error" -> isError, else false.
 *     Each text chunk whose data includes "denied:" is a { text } denial.
 *   Blank lines and non-JSON lines do not throw.
 *
 * from "./headless-worker" (see headless-worker.test.ts for the full dispatcher
 * contract): HeadlessDispatcher. (b) runs the fake CLI through it.
 * Fake final text:
 *   PARTIAL_READY\n session:<id>\n resume:- \n + "x" repeated FAKE_OUTPUT_BYTES
 */
import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseAgentStream } from "./agent-stream-parsers";
import { HeadlessDispatcher } from "./headless-worker";
import {
  ARGV_TEMPLATE_VERSION,
  HEADLESS_WORKER_HINT,
  defaultWorkerPermissions,
  type WorkerConfig,
} from "./agent-argv";

const FAKE = join(import.meta.dir, "fake-agent-cli.ts");
const LOCK = join(tmpdir(), "loom-v030-p2-fake.lock");

function fakeFinalText(sessionId: string, bytes: number): string {
  return `PARTIAL_READY\nsession:${sessionId}\nresume:-\n${"x".repeat(bytes)}`;
}

function spawnCount(dump: string): number {
  if (!existsSync(dump)) return 0;
  return readFileSync(dump, "utf8")
    .split("\n")
    .filter((line) => line.trim()).length;
}

function killRecorded(pid: number): void {
  if (!pid || pid <= 1 || pid === process.pid) return;
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    /* not a group leader */
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    /* already dead */
  }
}

function pidsInDump(dump: string): number[] {
  if (!existsSync(dump)) return [];
  const pids: number[] = [];
  for (const line of readFileSync(dump, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const pid = Number(JSON.parse(line).pid);
      if (pid > 1) pids.push(pid);
    } catch {
      /* ignore torn lines */
    }
  }
  return pids;
}

async function withFakeLock<T>(fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  for (;;) {
    try {
      mkdirSync(LOCK);
      break;
    } catch {
      try {
        if (Date.now() - statSync(LOCK).mtimeMs > 60_000) {
          rmSync(LOCK, { recursive: true, force: true });
          continue;
        }
      } catch {
        /* raced with the holder */
      }
      if (Date.now() - start > 90_000) throw new Error("fake env lock timeout");
      await Bun.sleep(25);
    }
  }
  try {
    return await fn();
  } finally {
    rmSync(LOCK, { recursive: true, force: true });
  }
}

function pushEnv(extra: Record<string, string | undefined>): () => void {
  const prev = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(extra)) {
    prev.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return () => {
    for (const [key, value] of prev) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

describe("v0.30.0 P2 expected-red: headless stream", () => {
  test("claude stream extracts session id, final text, is_error, usage, and permission_denials", () => {
    const jsonl = [
      JSON.stringify({ type: "system", subtype: "init", session_id: "init-sid" }),
      JSON.stringify({
        type: "assistant",
        message: { role: "assistant", content: [{ type: "text", text: "draft" }] },
      }),
      JSON.stringify({
        type: "result",
        result: "final-answer",
        is_error: false,
        session_id: "result-sid",
        usage: { input_tokens: 3, output_tokens: 4 },
        permission_denials: [
          { tool_name: "Bash", tool_input: { command: "python3 -c 1" } },
        ],
      }),
      "",
    ].join("\n");
    const parsed = parseAgentStream("claude", jsonl);
    expect(parsed.sessionId).toBe("result-sid");
    expect(parsed.finalText).toBe("final-answer");
    expect(parsed.isError).toBe(false);
    expect(parsed.usage).toEqual({ input_tokens: 3, output_tokens: 4 });
    expect(parsed.denials).toEqual([
      { toolName: "Bash", toolInput: { command: "python3 -c 1" } },
    ]);
  });

  test("PROBE §7.1 claude JSON with a raw control character still parses", () => {
    const line = `{"type":"result","result":"ok\u0001still","is_error":false,"session_id":"sid-1","usage":{"input_tokens":3,"output_tokens":4},"permission_denials":[]}`;
    expect(() => JSON.parse(line)).toThrow();
    const parsed = parseAgentStream("claude", `${line}\n`);
    expect(parsed.sessionId).toBe("sid-1");
    expect(parsed.isError).toBe(false);
    expect(parsed.finalText).toContain("ok");
    expect(parsed.finalText).toContain("still");
  });

  test("codex stream extracts thread_id, final text, usage, and failed command_execution only", () => {
    const jsonl = [
      "Reading additional input from stdin...",
      "",
      JSON.stringify({ type: "thread.started", thread_id: "th-1" }),
      JSON.stringify({
        type: "item.completed",
        item: {
          type: "command_execution",
          command: "ls",
          aggregated_output: "",
          exit_code: 0,
        },
      }),
      JSON.stringify({
        type: "item.completed",
        item: {
          type: "command_execution",
          command: "touch x",
          aggregated_output: "Operation not permitted",
          exit_code: 1,
        },
      }),
      JSON.stringify({
        type: "item.completed",
        item: { type: "agent_message", text: "done-text" },
      }),
      JSON.stringify({
        type: "turn.completed",
        usage: { input_tokens: 3, output_tokens: 4 },
      }),
    ].join("\n");
    const parsed = parseAgentStream("codex", jsonl);
    expect(parsed.sessionId).toBe("th-1");
    expect(parsed.finalText).toBe("done-text");
    expect(parsed.isError).toBe(false);
    expect(parsed.usage).toEqual({ input_tokens: 3, output_tokens: 4 });
    expect(parsed.denials).toEqual([
      {
        command: "touch x",
        exitCode: 1,
        text: "Operation not permitted",
      },
    ]);
  });

  test("codex non-zero command_execution without a sandbox block is not a denial", () => {
    const jsonl = [
      JSON.stringify({
        type: "item.completed",
        item: {
          type: "command_execution",
          command: "rg --files",
          aggregated_output: "",
          exit_code: 1,
        },
      }),
      JSON.stringify({
        type: "item.completed",
        item: {
          type: "command_execution",
          command: "true",
          aggregated_output: "sandbox ok",
          exit_code: 0,
        },
      }),
      JSON.stringify({
        type: "item.completed",
        item: {
          type: "command_execution",
          command: "cat secret",
          aggregated_output: "cat: secret: Permission denied",
          exit_code: 1,
        },
      }),
      JSON.stringify({
        type: "item.completed",
        item: {
          type: "command_execution",
          command: "ls",
          aggregated_output: "blocked by sandbox policy",
          exit_code: 1,
        },
      }),
    ].join("\n");
    const parsed = parseAgentStream("codex", jsonl);
    expect(parsed.isError).toBe(false);
    expect(parsed.denials).toEqual([
      {
        command: "cat secret",
        exitCode: 1,
        text: "cat: secret: Permission denied",
      },
      {
        command: "ls",
        exitCode: 1,
        text: "blocked by sandbox policy",
      },
    ]);
  });

  test("codex non-zero command_execution with Read-only file system is a denial", () => {
    const jsonl = [
      JSON.stringify({
        type: "item.completed",
        item: {
          type: "command_execution",
          command: "mkdir nested",
          aggregated_output: "mkdir: nested: Read-only file system",
          exit_code: 1,
        },
      }),
      JSON.stringify({
        type: "item.completed",
        item: {
          type: "command_execution",
          command: "touch y",
          aggregated_output: "touch: y: READ-ONLY FILE SYSTEM",
          exit_code: 1,
        },
      }),
    ].join("\n");
    const parsed = parseAgentStream("codex", jsonl);
    expect(parsed.denials).toEqual([
      {
        command: "mkdir nested",
        exitCode: 1,
        text: "mkdir: nested: Read-only file system",
      },
      {
        command: "touch y",
        exitCode: 1,
        text: "touch: y: READ-ONLY FILE SYSTEM",
      },
    ]);
  });

  test("R48-L2 codex resume without thread.started keeps the final text and a null session id", () => {
    const jsonl = [
      JSON.stringify({
        type: "item.completed",
        item: { type: "agent_message", text: "resumed" },
      }),
      JSON.stringify({
        type: "turn.completed",
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    ].join("\n");
    const parsed = parseAgentStream("codex", jsonl);
    expect(parsed.sessionId).toBeNull();
    expect(parsed.finalText).toBe("resumed");
    expect(parsed.isError).toBe(false);
  });

  test("grok streaming-json concatenates text, reads end.sessionId, and denials are text only", () => {
    const jsonl = [
      JSON.stringify({ type: "text", data: "hello " }),
      JSON.stringify({ type: "text", data: "denied: Bash touch x" }),
      JSON.stringify({ type: "text", data: " world" }),
      JSON.stringify({
        type: "end",
        sessionId: "g-1",
        stopReason: "end_turn",
        usage: { input_tokens: 3, output_tokens: 4 },
      }),
    ].join("\n");
    const parsed = parseAgentStream("grok", jsonl);
    expect(parsed.sessionId).toBe("g-1");
    expect(parsed.finalText).toBe("hello denied: Bash touch x world");
    expect(parsed.isError).toBe(false);
    expect(parsed.usage).toEqual({ input_tokens: 3, output_tokens: 4 });
    expect(parsed.denials).toEqual([{ text: "denied: Bash touch x" }]);
  });

  test("grok stopReason error sets isError", () => {
    const parsed = parseAgentStream(
      "grok",
      `${JSON.stringify({ type: "text", data: "x" })}\n${JSON.stringify({
        type: "end",
        sessionId: "g-2",
        stopReason: "error",
        usage: {},
      })}\n`,
    );
    expect(parsed.isError).toBe(true);
    expect(parsed.sessionId).toBe("g-2");
  });

  test(
    "(b) >=50KB fake output is captured whole, truncated false, byte-equal",
    async () => {
      await withFakeLock(async () => {
        const loomDir = mkdtempSync(join(tmpdir(), "loom-p2-stream-"));
        const cwd = mkdtempSync(join(tmpdir(), "loom-p2-stream-cwd-"));
        const dump = join(loomDir, "argv.jsonl");
        const promptDump = join(loomDir, "prompt.txt");
        const sentinel = "UNIQUE_PROMPT_SENTINEL_9f3a";
        const calls: { status?: string; reason?: string; output: string; truncated: boolean; summary: string }[] =
          [];
        const restore = pushEnv({
          LOOM_DIR: loomDir,
          FAKE_OUTPUT_BYTES: "60000",
          FAKE_DURATION_MS: "120000",
          FAKE_TIME_SCALE: "1000",
          FAKE_ARGV_DUMP: dump,
          FAKE_PROMPT_DUMP: promptDump,
          FAKE_HANG: undefined,
          FAKE_DENIAL: undefined,
          FAKE_EXIT_ONCE_MARKER: undefined,
          FAKE_SPAWN_GRANDCHILD: undefined,
          FAKE_ENV_DUMP: undefined,
          FAKE_KIND: undefined,
        });
        const config: WorkerConfig = {
          backend: "headless",
          cwd,
          allowedRoots: [cwd],
          maxConcurrent: { claude: 1, codex: 1, grok: 1 },
          timeoutMs: 30_000,
          permissions: defaultWorkerPermissions(),
        };
        const dispatcher = new HeadlessDispatcher({
          config,
          loomDir,
          localPeerId: "test-local-peer",
          node: "bridge-node",
          commands: {
            claude: { bin: "bun", args: [FAKE, "--fake-kind", "claude"] },
            codex: { bin: "bun", args: [FAKE, "--fake-kind", "codex"] },
            grok: { bin: "bun", args: [FAKE, "--fake-kind", "grok"] },
          },
          sink: {
            async composeAndSend(_target, fields) {
              calls.push(fields);
              return {
                branch: "accepted",
                relayAcceptedAt: "2026-10-15T00:00:03.000Z",
                status: "delivered",
                recipientCount: 1,
              };
            },
          },
        });
        try {
          expect(ARGV_TEMPLATE_VERSION).toBe("0.30.0-v1");
          expect(HEADLESS_WORKER_HINT.length).toBeGreaterThan(0);
          await dispatcher.dispatch({
            roomId: "room_b",
            cardId: "task_b50",
            agent: "claude",
            prompt: sentinel,
            fromPeerId: "peer_b",
            dispatchHandoffId: "hb50",
            cwd,
          });
          expect(spawnCount(dump)).toBe(1);
          const row = JSON.parse(readFileSync(dump, "utf8").trim()) as {
            sessionId: string;
            argv: string[];
          };
          const expected = fakeFinalText(row.sessionId, 60_000);
          expect(calls).toHaveLength(1);
          expect(calls[0]!.status).toBe("failed");
          expect(calls[0]!.reason).toBe("needs_verification");
          expect(calls[0]!.truncated).toBe(false);
          expect(calls[0]!.output).toBe(expected);
          expect(calls[0]!.output.length).toBeGreaterThan(50_000);
          expect(calls[0]!.summary).toBe("PARTIAL_READY");
          expect(readFileSync(promptDump, "utf8")).toContain(sentinel);
          expect(readFileSync(dump, "utf8")).not.toContain(sentinel);
          expect(row.argv.join("\n")).not.toContain(sentinel);
        } finally {
          for (const pid of pidsInDump(dump)) killRecorded(pid);
          try {
            for (const flight of dispatcher.flights()) {
              killRecorded(flight.pgid ?? 0);
              killRecorded(flight.pid ?? 0);
            }
          } catch {
            /* dispatcher may already be closed */
          }
          try {
            await dispatcher.close();
          } catch {
            /* close is best-effort */
          }
          restore();
          rmSync(loomDir, { recursive: true, force: true });
          rmSync(cwd, { recursive: true, force: true });
        }
      });
    },
    { timeout: 20_000 },
  );
});
