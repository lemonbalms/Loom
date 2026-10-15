/**
 * assumed API (v0.30.0 P2 — modules are not implemented; this file is expected-red)
 *
 * from "./agent-argv":
 *   HEADLESS_WORKER_HINT: string                         // includes "Loom card worker"; no "claim_handoff"
 *   ARGV_TEMPLATE_VERSION = "0.30.0-v1"
 *   RESUME_CONTINUATION_MESSAGE =
 *     "Interrupted. Inspect the working tree before continuing; do not redo completed steps."
 *   AgentKind = "claude" | "codex" | "grok"
 *   ClaudePermissionProfile { permissionMode, allowedTools, disallowedTools }
 *   CodexPermissionProfile { sandbox, approvalPolicy, extraArgs? }
 *   GrokPermissionProfile { permissionMode, allow, deny, extraArgs? }
 *   WorkerPermissions { claude?, codex?, grok? }
 *   WorkerConfig { backend, cwd, allowedRoots, maxConcurrent, timeoutMs, permissions }
 *   defaultWorkerPermissions(): WorkerPermissions
 *   validateWorkerConfig(config: WorkerConfig): void     // throws, fail-closed
 *   promptFingerprint(hint, permissions, argvTemplateVersion): string
 *     sha256(utf8(hint + "\0" + stableStringify(permissions) + "\0" + argvTemplateVersion))
 *     stableStringify: arrays keep order, object keys sorted, leaves JSON.stringify
 *   buildAgentArgv({ agent, cwd, sessionId, resumeSessionId?, hint, prompt, promptFile?, permissions })
 *     -> { argv, promptTransport: "stdin" | "prompt-file", continuationMessage? }
 *   Claude allowedTools / disallowedTools and codex/grok argv shapes are pinned
 *   in the tests below (PLAN D3, D10, D12, R4, R48-L2).
 */
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join } from "node:path";
import {
  ARGV_TEMPLATE_VERSION,
  HEADLESS_WORKER_HINT,
  RESUME_CONTINUATION_MESSAGE,
  buildAgentArgv,
  defaultWorkerPermissions,
  promptFingerprint,
  validateWorkerConfig,
  type WorkerConfig,
  type WorkerPermissions,
} from "./agent-argv";

const ALLOWED = [
  "Read",
  "Edit",
  "Write",
  "Glob",
  "Grep",
  "Bash(git status*)",
  "Bash(git diff*)",
  "Bash(git log*)",
  "Bash(bun test*)",
  "Bash(bun run *)",
  "Bash(npm test*)",
];

const DENIED = [
  "Bash(rm *)",
  "Bash(rmdir *)",
  "Bash(git push*)",
  "Bash(git reset --hard*)",
  "Bash(git clean*)",
  "Bash(sudo *)",
  "Bash(curl *)",
  "Bash(wget *)",
];

const PROMPT = "UNIQUE_PROMPT_SENTINEL_9f3a";
const CWD = "/tmp/loom-work";
const SESSION = "11111111-1111-4111-8111-111111111111";
const RESUME = "22222222-2222-4222-8222-222222222222";
const PROMPT_FILE = "/tmp/loom-prompt.txt";
const FAKE = join(import.meta.dir, "fake-agent-cli.ts");

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function baseConfig(permissions: WorkerPermissions = defaultWorkerPermissions()): WorkerConfig {
  return {
    backend: "headless",
    cwd: CWD,
    allowedRoots: [CWD],
    maxConcurrent: { claude: 1, codex: 1, grok: 1 },
    timeoutMs: 7_200_000,
    permissions,
  };
}

describe("v0.30.0 P2 expected-red: headless argv", () => {
  test("(g) HEADLESS_WORKER_HINT is the fixed worker hint, not loomSystemHint", () => {
    expect(HEADLESS_WORKER_HINT.length).toBeGreaterThan(0);
    expect(HEADLESS_WORKER_HINT).toContain("Loom card worker");
    expect(HEADLESS_WORKER_HINT).not.toContain("claim_handoff");
  });

  test("(g) D12 fingerprint is sha256(hint, permissions, argv template version)", () => {
    const permissions = defaultWorkerPermissions();
    const fp = promptFingerprint(
      HEADLESS_WORKER_HINT,
      permissions,
      ARGV_TEMPLATE_VERSION,
    );
    const expected = createHash("sha256")
      .update(
        `${HEADLESS_WORKER_HINT}\0${stableStringify(permissions)}\0${ARGV_TEMPLATE_VERSION}`,
      )
      .digest("hex");
    expect(fp).toBe(expected);
    const mutated = structuredClone(permissions);
    mutated.claude!.permissionMode = "default";
    expect(
      promptFingerprint(HEADLESS_WORKER_HINT, mutated, ARGV_TEMPLATE_VERSION),
    ).not.toBe(fp);
    expect(
      promptFingerprint(HEADLESS_WORKER_HINT, permissions, "0.30.0-v2"),
    ).not.toBe(fp);
  });

  test("(g) claude new argv is the static acceptEdits profile and stdin prompt", () => {
    const permissions = defaultWorkerPermissions();
    const built = buildAgentArgv({
      agent: "claude",
      cwd: CWD,
      sessionId: SESSION,
      hint: HEADLESS_WORKER_HINT,
      prompt: PROMPT,
      permissions,
    });
    expect(built.promptTransport).toBe("stdin");
    expect(built.argv).toEqual([
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--session-id",
      SESSION,
      "--append-system-prompt",
      HEADLESS_WORKER_HINT,
      "--permission-mode",
      "acceptEdits",
      "--allowedTools",
      ...ALLOWED,
      "--disallowedTools",
      ...DENIED,
    ]);
    // Variadic tool flags swallow a later positional. Nothing follows them.
    expect(built.argv.slice(built.argv.indexOf("--disallowedTools") + 1)).toEqual(DENIED);
    expect(built.argv).not.toContain("-r");
    expect(built.argv.join("\n")).not.toContain(PROMPT);
    expect(permissions.claude).toEqual({
      permissionMode: "acceptEdits",
      allowedTools: ALLOWED,
      disallowedTools: DENIED,
    });
  });

  test("(g) claude resume uses -r and does not pass --session-id", () => {
    const built = buildAgentArgv({
      agent: "claude",
      cwd: CWD,
      sessionId: SESSION,
      resumeSessionId: RESUME,
      hint: HEADLESS_WORKER_HINT,
      prompt: PROMPT,
      permissions: defaultWorkerPermissions(),
    });
    expect(built.promptTransport).toBe("stdin");
    expect(built.continuationMessage).toBe(RESUME_CONTINUATION_MESSAGE);
    expect(built.argv).toContain("-r");
    expect(built.argv).toContain(RESUME);
    expect(built.argv).not.toContain("--session-id");
    expect(built.argv).not.toContain(RESUME_CONTINUATION_MESSAGE);
    expect(built.argv.join("\n")).not.toContain(PROMPT);
  });

  test("(g) codex new argv is exec --json stdin, prompt absent", () => {
    const built = buildAgentArgv({
      agent: "codex",
      cwd: CWD,
      sessionId: SESSION,
      hint: HEADLESS_WORKER_HINT,
      prompt: PROMPT,
      permissions: defaultWorkerPermissions(),
    });
    expect(built.promptTransport).toBe("stdin");
    expect(built.argv).toEqual([
      "exec",
      "--json",
      "-C",
      CWD,
      "--sandbox",
      "workspace-write",
      "-c",
      "approval_policy=never",
      "-c",
      `developer_instructions=${HEADLESS_WORKER_HINT}`,
      "--skip-git-repo-check",
      "-",
    ]);
    expect(built.argv.join("\n")).not.toContain(PROMPT);
  });

  test("(g) R4 codex resume has no -C and no -s, and pins sandbox_mode", () => {
    const built = buildAgentArgv({
      agent: "codex",
      cwd: CWD,
      sessionId: SESSION,
      resumeSessionId: RESUME,
      hint: HEADLESS_WORKER_HINT,
      prompt: PROMPT,
      permissions: defaultWorkerPermissions(),
    });
    expect(built.promptTransport).toBe("stdin");
    expect(built.continuationMessage).toBe(RESUME_CONTINUATION_MESSAGE);
    expect(built.argv).toEqual([
      "exec",
      "resume",
      RESUME,
      "--json",
      "-c",
      'sandbox_mode="workspace-write"',
      "-c",
      "approval_policy=never",
      "-c",
      `developer_instructions=${HEADLESS_WORKER_HINT}`,
      "--skip-git-repo-check",
      RESUME_CONTINUATION_MESSAGE,
    ]);
    expect(built.argv).not.toContain("-C");
    expect(built.argv).not.toContain("-s");
    expect(built.argv).not.toContain("--sandbox");
    expect(built.argv.join("\n")).not.toContain(PROMPT);
  });

  test("(g) grok new argv uses --prompt-file and the static allow/deny lists", () => {
    const built = buildAgentArgv({
      agent: "grok",
      cwd: CWD,
      sessionId: SESSION,
      hint: HEADLESS_WORKER_HINT,
      prompt: PROMPT,
      promptFile: PROMPT_FILE,
      permissions: defaultWorkerPermissions(),
    });
    expect(built.promptTransport).toBe("prompt-file");
    expect(built.argv).toEqual([
      "--prompt-file",
      PROMPT_FILE,
      "--output-format",
      "streaming-json",
      "--cwd",
      CWD,
      "--session-id",
      SESSION,
      "--rules",
      HEADLESS_WORKER_HINT,
      "--permission-mode",
      "acceptEdits",
      ...ALLOWED.flatMap((rule) => ["--allow", rule]),
      ...DENIED.flatMap((rule) => ["--deny", rule]),
    ]);
    expect(built.argv.join("\n")).not.toContain(PROMPT);
  });

  test("(g) R4 grok resume has no --session-id", () => {
    const built = buildAgentArgv({
      agent: "grok",
      cwd: CWD,
      sessionId: SESSION,
      resumeSessionId: RESUME,
      hint: HEADLESS_WORKER_HINT,
      prompt: PROMPT,
      promptFile: PROMPT_FILE,
      permissions: defaultWorkerPermissions(),
    });
    expect(built.promptTransport).toBe("prompt-file");
    expect(built.argv).toContain("-r");
    expect(built.argv).toContain(RESUME);
    expect(built.argv).not.toContain("-p");
    expect(built.argv).not.toContain("--single");
    expect(built.argv).not.toContain("--session-id");
    expect(built.argv).not.toContain("-s");
    expect(built.argv.join("\n")).not.toContain(PROMPT);
  });

  test("(g) default profiles do not emit dangerous modes", () => {
    expect(() => validateWorkerConfig(baseConfig())).not.toThrow();
    for (const agent of ["claude", "codex", "grok"] as const) {
      const built = buildAgentArgv({
        agent,
        cwd: CWD,
        sessionId: SESSION,
        hint: HEADLESS_WORKER_HINT,
        prompt: PROMPT,
        promptFile: PROMPT_FILE,
        permissions: defaultWorkerPermissions(),
      });
      const flat = built.argv.join("\n");
      expect(flat).not.toContain("bypassPermissions");
      expect(flat).not.toContain("danger-full-access");
      expect(flat).not.toContain("dangerously-");
      expect(flat).not.toContain("--always-approve");
    }
  });

  test("(g) dangerous permission modes fail closed", () => {
    const cases: Array<{ token: string; permissions: WorkerPermissions }> = [
      {
        token: "bypassPermissions",
        permissions: {
          ...defaultWorkerPermissions(),
          claude: {
            ...defaultWorkerPermissions().claude!,
            permissionMode: "bypassPermissions",
          },
        },
      },
      {
        token: "danger-full-access",
        permissions: {
          ...defaultWorkerPermissions(),
          codex: {
            ...defaultWorkerPermissions().codex!,
            sandbox: "danger-full-access",
          },
        },
      },
      {
        token: "--dangerously-bypass-approvals-and-sandbox",
        permissions: {
          ...defaultWorkerPermissions(),
          codex: {
            ...defaultWorkerPermissions().codex!,
            extraArgs: ["--dangerously-bypass-approvals-and-sandbox"],
          },
        },
      },
      {
        token: "--dangerously-bypass-hook-trust",
        permissions: {
          ...defaultWorkerPermissions(),
          codex: {
            ...defaultWorkerPermissions().codex!,
            extraArgs: ["--dangerously-bypass-hook-trust"],
          },
        },
      },
      {
        token: "--always-approve",
        permissions: {
          ...defaultWorkerPermissions(),
          grok: {
            ...defaultWorkerPermissions().grok!,
            extraArgs: ["--always-approve"],
          },
        },
      },
    ];
    for (const item of cases) {
      expect(() => validateWorkerConfig(baseConfig(item.permissions))).toThrow(
        new RegExp(item.token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      );
    }
  });

  test("permission rule lists reject flag-shaped, empty, NUL, and newline values", () => {
    const samples = [
      "--yolo",
      "--always-approve",
      "-x",
      "",
      "has\nnewline",
      "has\0nul",
    ];
    const lists: Array<{
      field: string;
      agent: "claude" | "grok";
      set: (permissions: WorkerPermissions, value: string) => void;
    }> = [
      {
        field: "claude.allowedTools",
        agent: "claude",
        set: (permissions, value) => {
          permissions.claude!.allowedTools = [value];
        },
      },
      {
        field: "claude.disallowedTools",
        agent: "claude",
        set: (permissions, value) => {
          permissions.claude!.disallowedTools = [value];
        },
      },
      {
        field: "grok.allow",
        agent: "grok",
        set: (permissions, value) => {
          permissions.grok!.allow = [value];
        },
      },
      {
        field: "grok.deny",
        agent: "grok",
        set: (permissions, value) => {
          permissions.grok!.deny = [value];
        },
      },
    ];
    for (const list of lists) {
      for (const value of samples) {
        const permissions = defaultWorkerPermissions();
        list.set(permissions, value);
        // `--always-approve` is also an exact dangerous token, so that
        // check fires first. Every sample must still fail closed.
        const pattern = value.includes("--always-approve")
          ? /--always-approve/
          : `worker.permissions.${list.field} rejected: ${JSON.stringify(value)}`;
        expect(() => validateWorkerConfig(baseConfig(permissions))).toThrow(pattern);
        expect(() =>
          buildAgentArgv({
            agent: list.agent,
            cwd: CWD,
            sessionId: SESSION,
            hint: HEADLESS_WORKER_HINT,
            prompt: PROMPT,
            promptFile: PROMPT_FILE,
            permissions,
          }),
        ).toThrow(/worker\.permissions/);
      }
    }
  });

  test("strict fake accepts builder argv for new and resume", () => {
    for (const agent of ["claude", "codex", "grok"] as const) {
      for (const resume of [false, true]) {
        const built = buildAgentArgv({
          agent,
          cwd: CWD,
          sessionId: SESSION,
          resumeSessionId: resume ? RESUME : undefined,
          hint: HEADLESS_WORKER_HINT,
          prompt: PROMPT,
          promptFile: PROMPT_FILE,
          permissions: defaultWorkerPermissions(),
        });
        const result = runFake(agent, built.argv);
        const label = `${agent} ${resume ? "resume" : "new"}`;
        if (result.status !== 0) {
          throw new Error(
            `${label} exited ${String(result.status)}: ${result.stderr}`,
          );
        }
        expect(result.status).toBe(0);
      }
    }
  });

  test("strict fake rejects grok -p --prompt-file and unknown flags", () => {
    const grok = runFake("grok", ["-p", "--prompt-file", "x"]);
    expect(grok.status).toBe(2);
    expect(grok.stderr).toContain(
      "a value is required for '--single <PROMPT>' but none was supplied",
    );
    const single = runFake("grok", ["--single", "--prompt-file", "x"]);
    expect(single.status).toBe(2);
    expect(single.stderr).toContain("--single");
    for (const kind of ["claude", "codex", "grok"] as const) {
      const argv =
        kind === "codex" ? ["exec", "--not-a-real-flag"] : ["--not-a-real-flag"];
      const result = runFake(kind, argv);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("unexpected argument");
    }
    const resumeCd = runFake("codex", ["exec", "resume", RESUME, "-C", CWD]);
    expect(resumeCd.status).toBe(2);
    expect(resumeCd.stderr).toContain("unexpected argument");
  });

  test("strict fake rejects variadic grok --allow/--deny and accepts one flag per rule", () => {
    const oldArgv = [
      "--prompt-file",
      PROMPT_FILE,
      "--output-format",
      "streaming-json",
      "--cwd",
      CWD,
      "--session-id",
      SESSION,
      "--rules",
      HEADLESS_WORKER_HINT,
      "--permission-mode",
      "acceptEdits",
      "--allow",
      ...ALLOWED,
      "--deny",
      ...DENIED,
    ];
    const rejected = runFake("grok", oldArgv);
    expect(rejected.status).toBe(2);
    expect(rejected.stderr).toContain(`error: unexpected argument '${ALLOWED[1]}' found`);

    const built = buildAgentArgv({
      agent: "grok",
      cwd: CWD,
      sessionId: SESSION,
      hint: HEADLESS_WORKER_HINT,
      prompt: PROMPT,
      promptFile: PROMPT_FILE,
      permissions: defaultWorkerPermissions(),
    });
    const accepted = runFake("grok", built.argv);
    expect(accepted.status).toBe(0);

    const stray = runFake("grok", [...built.argv, "Write"]);
    expect(stray.status).toBe(2);
    expect(stray.stderr).toContain("error: unexpected argument 'Write' found");

    const bareResume = runFake("grok", ["-r"]);
    expect(bareResume.status).toBe(2);
    const resumeFlag = runFake("grok", ["-r", "--prompt-file", PROMPT_FILE]);
    expect(resumeFlag.status).toBe(2);
    expect(resumeFlag.stderr).toContain("a value is required for '-r <SESSION_ID>'");
  });
});

function runFake(
  kind: "claude" | "codex" | "grok",
  argv: string[],
): { status: number | null; stderr: string } {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith("FAKE_")) delete env[key];
  }
  const result = spawnSync(process.execPath, [FAKE, "--fake-kind", kind, ...argv], {
    encoding: "utf8",
    env,
    input: "",
  });
  return { status: result.status, stderr: result.stderr ?? "" };
}
