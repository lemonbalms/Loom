import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  classifySegment,
  DENY_HEADLESS,
  decide,
  splitSegments,
  tokenize,
} from "./check-lane-spawn.ts";

const HOOK = join(import.meta.dir, "check-lane-spawn.ts");

describe("splitSegments / tokenize / classifySegment", () => {
  test("splits on && || ; | newline, keeps quoted separators", () => {
    expect(splitSegments("a && b || c; d | e\nf")).toEqual(["a", "b", "c", "d", "e", "f"]);
    expect(splitSegments("echo 'a; b' && c")).toEqual(["echo 'a; b'", "c"]);
    expect(splitSegments("  ;; ")).toEqual([]);
  });

  test("splits on single & and |& too; quoted tokens are flagged", () => {
    expect(splitSegments("echo ready & codex exec r")).toEqual(["echo ready", "codex exec r"]);
    expect(splitSegments("a |& b")).toEqual(["a", "b"]);
    expect(tokenize(`(claude -p "x y")`)).toEqual([
      { text: "claude", quoted: false },
      { text: "-p", quoted: false },
      { text: "x y", quoted: true },
    ]);
  });

  test("classifies kinds", () => {
    expect(classifySegment("claude -p x").sort()).toEqual(["claude-any", "claude-headless"]);
    expect(classifySegment("claude")).toEqual(["claude-any"]);
    expect(classifySegment("codex exec y").sort()).toEqual(["codex-any", "codex-exec"]);
    expect(classifySegment("codex login")).toEqual(["codex-any"]);
    expect(classifySegment("bun run scripts/lane.ts impl --spec s")).toEqual(["lane"]);
    expect(classifySegment("bun /abs/repo/scripts/lane.ts impl")).toEqual(["lane"]);
    expect(classifySegment("bun test x")).toEqual([]);
    expect(classifySegment("cat scripts/lane.ts")).toEqual([]);
    expect(classifySegment("bunx biome check scripts/lane.ts")).toEqual([]);
    expect(classifySegment("git log")).toEqual([]);
  });

  test("heredoc bodies and comments are data, not commands", () => {
    expect(decide("cat > f <<'EOF'\nclaude -p x\nEOF\necho ok", {}).ok).toBe(true);
    expect(decide("# claude -p x\ngit status", {}).ok).toBe(true);
  });
});

describe("decide — outside a lane", () => {
  const deny = [
    'claude -p "x"',
    "claude --print x",
    "/usr/local/bin/claude -p x",
    "./claude -p x",
    "~/.local/bin/claude -p x",
    "env -u A -u B claude -p x",
    "FOO=1 claude -p x",
    "nohup claude -p x &",
    "gtimeout 600 claude -p x",
    "timeout -s KILL 5 codex exec y",
    "codex exec y",
    "codex e y",
    "codex -m m exec y",
    "bash -c 'claude -p x'",
    'sh -c "codex exec y"',
    "zsh -lc 'cd a && claude -p x'",
    "cd a && claude -p x",
    "echo hi | claude -p x",
    // fix 2: lane exemption applies only to the segment that IS the lane call
    "bash -c 'bun run scripts/lane.ts verify --spec s; codex exec y'",
    "bun run scripts/lane.ts impl --spec s && claude -p x",
    // fix 3: `<<-` strips leading TABs; the tab-indented delimiter ends the heredoc
    "cat <<-EOF\n\tEOF\nclaude -p x",
    // round 2: here-string `<<<` is not a heredoc — the next line is a real command
    "cat <<< 'EOF'\nclaude -p x",
    // round 2: real command after a quoted-delimiter heredoc
    'cat <<"EOF"\ncodex exec y\nEOF\ncodex exec z',
    // round 3: position-based bypasses → token-presence detection
    'echo ready & codex exec "review"',
    '2>/tmp/codex.log codex exec "review"',
    'env -- claude -p "x"',
    'command -- codex exec "x"',
    "claude -p x > out.txt",
    "(claude -p x)",
    "xargs claude -p",
    "claude -p x |& tee log",
    "bun run scripts/lane.ts impl --spec s claude -p", // wrapper + claude in ONE segment
    "\\claude -p x", // backslash escape is not a quoted string
    "claude --print=text x",
    // round 3: accepted false-deny — unquoted mention (was allow: "echo codex exec")
    "echo codex exec",
    "echo claude -p",
    // round 5: attached redirections end the word
    'codex exec>review.txt "x"',
    "printf 'q\\n' | claude -p>answer.txt",
    "claude -p 2>err.log x",
    "claude -p x >| out.txt",
    "claude -p x &> out.txt",
    // round 5: shell -c found past options that take a value
    `bash -o pipefail -c 'codex exec "r"'`,
    'bash -e -o errexit -c "claude -p x"',
    "zsh +o nomatch -xc 'claude -p x'",
  ];
  const allow = [
    "claude",
    "claude --version",
    "codex",
    "codex login",
    'grep "claude -p" f',
    'echo "codex exec"',
    'echo "claude -p"',
    "bun run scripts/lane.ts impl --spec s",
    "bun scripts/lane.ts verify --spec s",
    "git log",
    'git commit -m "codex exec y"',
    // fix 3: ` EOF` (leading space) is not the delimiter — everything up to EOF is data
    "cat <<'EOF'\n EOF\nclaude -p example\nEOF",
    "cat <<EOF\n\tEOF\nclaude -p x\nEOF",
    // round 2: here-string content is a quoted argument
    'cat <<< "claude -p x"',
    // round 5
    "sh -ec 'echo hi'",
    'echo "a>b"',
    "bash -o pipefail -c 'echo codex'",
    "echo hi 2>&1 | tee claude.log",
    // round 2: bash delimiter forms
    "cat <<\\EOF\nclaude -p example\nEOF",
    "cat <<'END DOC'\nclaude -p example\nEND DOC",
    'cat <<"END DOC"\nclaude -p example\nEND DOC',
    "cat << EOF\nclaude -p example\nEOF",
    "cat <<-EOF\n\tclaude -p example\n\tEOF",
  ];
  for (const cmd of deny) {
    test(`deny: ${cmd}`, () => {
      const d = decide(cmd, {});
      expect(d.ok).toBe(false);
      if (!d.ok) expect(d.reason).toBe(DENY_HEADLESS);
    });
  }
  for (const cmd of allow) {
    test(`allow: ${cmd}`, () => {
      expect(decide(cmd, {})).toEqual({ ok: true });
      expect(decide(cmd, { LOOM_LANE: "" })).toEqual({ ok: true });
    });
  }
});

describe("decide — inside a lane (LOOM_LANE=impl)", () => {
  const env = { LOOM_LANE: "impl" };
  for (const cmd of [
    "claude --version",
    "codex",
    "bun run scripts/lane.ts advise --spec s",
    "claude -p x",
    "bash -c 'codex login'",
  ]) {
    test(`deny: ${cmd}`, () => {
      const d = decide(cmd, env);
      expect(d.ok).toBe(false);
      if (!d.ok) expect(d.reason).toContain("LOOM_LANE=impl");
    });
  }
  for (const cmd of [
    "bun test x",
    "git status",
    'grep "claude" f',
    // L needs `bun` followed by …scripts/lane.ts — lanes may still work ON lane.ts
    "cat scripts/lane.ts",
    "grep x scripts/lane.ts",
    "bunx biome check scripts/lane.ts",
    "bun test scripts/lane.test.ts",
  ]) {
    test(`allow: ${cmd}`, () => {
      expect(decide(cmd, env)).toEqual({ ok: true });
    });
  }
});

async function runHook(stdin: string, extraEnv: Record<string, string> = {}) {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && k !== "LOOM_LANE") env[k] = v;
  }
  Object.assign(env, extraEnv);
  const proc = Bun.spawn(["bun", "run", HOOK], {
    stdin: new TextEncoder().encode(stdin),
    stdout: "pipe",
    stderr: "pipe",
    env,
  });
  const [code, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);
  return { code, stderr };
}

describe("script entry", () => {
  test("deny → exit 2 with stderr", async () => {
    const r = await runHook(
      JSON.stringify({ tool_name: "Bash", tool_input: { command: "codex exec y" } }),
    );
    expect(r.code).toBe(2);
    expect(r.stderr.trim().length).toBeGreaterThan(0);
    expect(r.stderr).toContain("lane.ts");
  });

  test("allow → exit 0", async () => {
    const r = await runHook(
      JSON.stringify({ tool_name: "Bash", tool_input: { command: "git log" } }),
    );
    expect(r.code).toBe(0);
  });

  test("LOOM_LANE in hook env → nesting denied", async () => {
    const r = await runHook(
      JSON.stringify({ tool_name: "Bash", tool_input: { command: "codex" } }),
      {
        LOOM_LANE: "impl",
      },
    );
    expect(r.code).toBe(2);
  });

  test("unparseable stdin → exit 0", async () => {
    const r = await runHook("{not json");
    expect(r.code).toBe(0);
  });

  test("non-Bash tool_name → exit 0", async () => {
    const r = await runHook(
      JSON.stringify({ tool_name: "Read", tool_input: { command: "claude -p x" } }),
    );
    expect(r.code).toBe(0);
  });
});
