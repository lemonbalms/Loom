import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const FAKE = join(import.meta.dir, "fake-agent-cli.ts");
const SESSION = "11111111-1111-4111-8111-111111111111";
const NET = "sandbox_workspace_write.network_access=false";
const SETTINGS = '{"permissions":{"allow":[],"deny":[]}}';

function runFake(
  kind: "claude" | "codex" | "grok",
  argv: string[],
): { status: number | null; stderr: string } {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith("FAKE_")) delete env[key];
  }
  delete env.GROK_FOLDER_TRUST;
  const result = spawnSync(process.execPath, [FAKE, "--fake-kind", kind, ...argv], {
    encoding: "utf8",
    env,
    input: "",
  });
  return { status: result.status, stderr: result.stderr ?? "" };
}

function expectRepeatRejected(
  kind: "claude" | "codex" | "grok",
  argv: string[],
  label: string,
): void {
  const run = runFake(kind, argv);
  expect(run.status).toBe(2);
  expect(run.stderr).toContain(`the argument '${label}' cannot be used multiple times`);
}

describe("fake agent CLI rejects repeated flags the real CLIs reject", () => {
  test("grok --disable-web-search twice exits 2", () => {
    expectRepeatRejected(
      "grok",
      ["--prompt-file", "/dev/null", "--disable-web-search", "--disable-web-search"],
      "--disable-web-search",
    );
  });

  test("grok --rules twice exits 2", () => {
    expectRepeatRejected(
      "grok",
      ["--prompt-file", "/dev/null", "--rules", "a", "--rules", "b"],
      "--rules <RULES>",
    );
  });

  test("grok -s and --session-id are one flag", () => {
    expectRepeatRejected(
      "grok",
      ["--prompt-file", "/dev/null", "-s", SESSION, "--session-id", SESSION],
      "--session-id <SESSION_ID>",
    );
  });

  test("codex exec --json twice exits 2", () => {
    expectRepeatRejected("codex", ["exec", "--json", "--json", "-c", NET, "-"], "--json");
  });

  test("codex exec resume --json twice exits 2", () => {
    expectRepeatRejected(
      "codex",
      ["exec", "resume", "--json", "--json", "-c", NET, SESSION, "-"],
      "--json",
    );
  });

  test("codex exec -C and --cd are one flag", () => {
    expectRepeatRejected(
      "codex",
      ["exec", "--json", "-C", "/tmp", "--cd", "/tmp", "-c", NET, "-"],
      "--cd <DIR>",
    );
  });

  test("claude --settings twice exits 2", () => {
    expectRepeatRejected(
      "claude",
      ["-p", "--settings", SETTINGS, "--settings", SETTINGS],
      "--settings <file-or-json>",
    );
  });

  test("claude --verbose twice exits 2 (stricter than claude, which accepts it)", () => {
    expectRepeatRejected("claude", ["-p", "--verbose", "--verbose"], "--verbose");
  });
});

describe("fake agent CLI accepts measured-repeatable flags", () => {
  test("grok --allow repeated is accepted", () => {
    const run = runFake("grok", ["--prompt-file", "/dev/null", "--allow", "Read", "--allow", "Edit"]);
    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
  });

  test("grok --deny repeated is accepted", () => {
    const run = runFake("grok", ["--prompt-file", "/dev/null", "--deny", "Read", "--deny", "Edit"]);
    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
  });

  test("codex exec -c / --config repeated is accepted", () => {
    const run = runFake("codex", [
      "exec",
      "--json",
      "-c",
      NET,
      "-c",
      "approval_policy=never",
      "--config",
      "developer_instructions=x",
      "-",
    ]);
    expect(run.status).toBe(0);
  });

  test("codex exec resume -c repeated is accepted", () => {
    const run = runFake("codex", [
      "exec",
      "resume",
      "--json",
      "-c",
      NET,
      "-c",
      "sandbox_mode=read-only",
      SESSION,
      "-",
    ]);
    expect(run.status).toBe(0);
  });
});
