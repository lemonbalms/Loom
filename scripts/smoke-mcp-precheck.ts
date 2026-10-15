// Live smoke for Loom v0.32.0 Done-when (i) / P5 (`smoke-mcp-precheck.ts <case>`): real agent CLIs
// (claude -p, codex exec, grok over ACP stdio) talking to the real Loom MCP server with a policy.json.
//
// Isolation: LOOM_TEST_HOME = <base>/<case>/home, so loomDir() = <case>/home/.loom (never ~/.loom).
// The MCP server is started through a wrapper (<case>/bin/loom-mcp) that exports the isolated home and
// session and appends the server's stderr to <case>/mcp-stderr.log. MCP config reaches each CLI only
// per invocation: claude `--mcp-config <file> --strict-mcp-config`, codex `-c mcp_servers.loom.*` with
// `--ignore-user-config`, grok ACP `session/new` `mcpServers`. No CLI config file is written.
// The session is board-only (dummy relay URL, nothing listens): board tools are local, room_chat would
// need a relay but is refused by the pre-check first.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { boardPathForRoom } from "../packages/host/src/task-board";
import { loomDir as loomStateDir, resetStateHomeDirCache } from "../packages/host/src/session-store";

type Agent = "claude" | "codex" | "grok" | "server";
type Case = { agent: Agent; policy: Record<string, unknown>; prompt: string; claudeArgs?: string[]; codexApprove?: boolean };

const REPO = realpathSync(join(import.meta.dir, ".."));
const ROOM_ID = "room_smoke0320";
const TASK_TITLE = "smoke task 0320";

const SCENARIO_PROMPT = `You have an MCP server named "loom". Do these steps in order. Use only loom MCP tools: no shell commands, no file edits, no other tools.
1. List every tool name you have from the loom MCP server, and say whether a tool named room_chat is present.
2. Call the loom tool room_chat with text "hello". If you have no such tool, say so and skip this step. If the call is refused or fails, quote the response text exactly.
3. Call loom add_task with title "${TASK_TITLE}". Then call loom update_task with that task's id and status "done". Quote the exact response text of update_task verbatim.
4. Call loom import_board with mode "replace" and snapshot {"tasks": []}. Quote the exact response text verbatim.
Do not retry a refused call and do not work around a refusal. End with a short summary that quotes, for each step, the exact tool response text.`;

const INVALID_PROMPT = `You have an MCP server named "loom". Use only loom MCP tools: no shell commands, no file edits, no other tools.
1. Say how many tools you have from the loom MCP server and list their names.
2. Call loom list_tasks with no arguments. Quote the exact response text verbatim.
3. Call loom add_task with title "${TASK_TITLE}". Quote the exact response text verbatim.
Do not retry and do not work around a refusal. End with the quoted response texts.`;

function cases(): Record<string, Case> {
  const base = (over: Record<string, unknown> = {}) => ({
    version: 1,
    shell: { deny: [] },
    network: false,
    mcp: { deny: ["loom__room_chat"] },
    skills: { allowScripts: [] },
    loomTools: { done: "propose" },
    ...over,
  });
  return {
    server: { agent: "server", policy: base(), prompt: "" },
    // UK-4 probe: no permission flag at all (the owner's user settings decide).
    "claude-noperm": { agent: "claude", policy: base(), prompt: SCENARIO_PROMPT, claudeArgs: [] },
    // UK-4 control: the prompting mode, no allow rule — does -p deny the MCP calls?
    "claude-manual": { agent: "claude", policy: base(), prompt: SCENARIO_PROMPT, claudeArgs: ["--permission-mode", "manual"] },
    claude: { agent: "claude", policy: base(), prompt: SCENARIO_PROMPT, claudeArgs: ["--allowedTools", "mcp__loom"] },
    "claude-invalid": {
      agent: "claude",
      policy: base({ bogusKey: true }),
      prompt: INVALID_PROMPT,
      claudeArgs: ["--allowedTools", "mcp__loom"],
    },
    // codex exec + approval_policy=never fails every MCP call that needs approval; the per-server
    // default_tools_approval_mode override lets the calls reach the Loom server (codex-noapprove = observation).
    codex: { agent: "codex", policy: base(), prompt: SCENARIO_PROMPT, codexApprove: true },
    "codex-noapprove": { agent: "codex", policy: base(), prompt: SCENARIO_PROMPT, codexApprove: false },
    grok: { agent: "grok", policy: base(), prompt: SCENARIO_PROMPT },
  };
}

function realBin(name: string): string {
  return execText("/usr/bin/which", [name]).trim();
}

function execText(bin: string, args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): string {
  const r = spawnSync(bin, args, { encoding: "utf8", timeout: 30_000, ...opts });
  return `${r.stdout ?? ""}`;
}

function cliVersion(name: string): string {
  try {
    return execText(realBin(name), ["--version"]).trim().split("\n")[0] ?? "unknown";
  } catch {
    return "unknown";
  }
}

function jsonLines(raw: string): any[] {
  const out: any[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      /* non-JSON line */
    }
  }
  return out;
}

function contentText(c: unknown): string {
  if (typeof c === "string") return c;
  if (Array.isArray(c)) return c.map((x: any) => (typeof x === "string" ? x : x?.text ?? x?.content?.text ?? "")).join("");
  if (c && typeof c === "object" && "text" in (c as any)) return String((c as any).text);
  return c === undefined || c === null ? "" : JSON.stringify(c);
}

// ---------------------------------------------------------------------------
const caseName = process.argv[2] ?? "";
const all = cases();
const c = all[caseName];
if (!c) throw new Error(`usage: smoke-mcp-precheck.ts <${Object.keys(all).join("|")}>`);

const BASE = process.env.SMOKE_BASE ?? join(tmpdir(), "loom-smoke0320");
const root = join(BASE, caseName);
rmSync(root, { recursive: true, force: true });
mkdirSync(root, { recursive: true });
const home = join(root, "home");
mkdirSync(home, { recursive: true });
process.env.LOOM_TEST_HOME = realpathSync(home);
for (const k of ["LOOM_SESSION", "LOOM_PROFILE", "LOOM_RELAY_TOKEN", "LOOM_RELAY_URL"]) delete process.env[k];
resetStateHomeDirCache();
const lDir = loomStateDir();
if (lDir !== join(realpathSync(home), ".loom")) throw new Error(`loomDir not isolated: ${lDir}`);
mkdirSync(lDir, { recursive: true, mode: 0o700 });
const sessionFile = join(lDir, "session.json");
writeFileSync(
  sessionFile,
  JSON.stringify({
    roomId: ROOM_ID,
    roomName: "smoke0320",
    inviteCode: "SMOKE0320",
    peerId: "p_smoke0320",
    displayName: "smoke",
    agentKind: c.agent === "server" ? "claude" : c.agent,
    relayUrl: "ws://127.0.0.1:9",
    updatedAt: new Date().toISOString(),
  }),
  { mode: 0o600 },
);
process.env.LOOM_SESSION = sessionFile;
writeFileSync(join(lDir, "policy.json"), JSON.stringify(c.policy, null, 2), { mode: 0o600 });

const cwdRaw = join(root, "cwd");
mkdirSync(cwdRaw, { recursive: true });
const scratchCwd = realpathSync(cwdRaw);
const binDir = join(root, "bin");
mkdirSync(binDir, { recursive: true });
const wrapper = join(binDir, "loom-mcp");
const stderrLog = join(root, "mcp-stderr.log");
writeFileSync(
  wrapper,
  [
    "#!/bin/sh",
    `export LOOM_TEST_HOME='${process.env.LOOM_TEST_HOME}'`,
    `export LOOM_SESSION='${sessionFile}'`,
    "unset LOOM_PROFILE LOOM_RELAY_TOKEN LOOM_RELAY_URL",
    `echo "[wrapper] start pid=$$ $(date -u +%FT%TZ)" >> '${stderrLog}'`,
    `exec '${realBin("bun")}' run '${join(REPO, "packages/mcp-server/src/stdio.ts")}' 2>> '${stderrLog}'`,
    "",
  ].join("\n"),
  { mode: 0o755 },
);
const transcriptPath = join(root, "transcript.jsonl");

const t0 = Date.now();
let evidence: Record<string, unknown> = {};
let exit: number | null = null;
let argvShown: string[] = [];
const TIMEOUT_MS = 10 * 60_000;

if (c.agent === "server") {
  evidence = await runServerDirect();
} else if (c.agent === "claude") {
  const mcpJson = join(root, "mcp.json");
  writeFileSync(mcpJson, JSON.stringify({ mcpServers: { loom: { command: wrapper, args: [] } } }, null, 2));
  const args = [
    "-p", "--output-format", "stream-json", "--verbose", "--no-session-persistence",
    "--mcp-config", mcpJson, "--strict-mcp-config", ...(c.claudeArgs ?? []),
  ];
  argvShown = ["claude", ...args];
  const r = spawnSync(realBin("claude"), args, { cwd: scratchCwd, input: c.prompt, encoding: "utf8", timeout: TIMEOUT_MS, maxBuffer: 64 << 20 });
  exit = r.status;
  writeFileSync(transcriptPath, r.stdout ?? "");
  writeFileSync(join(root, "cli-stderr.log"), r.stderr ?? "");
  evidence = claudeEvidence(r.stdout ?? "");
} else if (c.agent === "codex") {
  // Hard rule: codex only in the (already trusted) repo cwd; trust-entry count checked by the caller.
  const args = [
    "exec", "--json", "--ephemeral", "--ignore-user-config", "--skip-git-repo-check",
    "-m", "gpt-6.1-sol", "-c", 'model_reasoning_effort="medium"',
    "-s", "read-only", "-c", 'approval_policy="never"',
    "--strict-config", "-c", `mcp_servers.loom.command="${wrapper}"`, "-c", "mcp_servers.loom.args=[]",
    ...(c.codexApprove ? ["-c", 'mcp_servers.loom.default_tools_approval_mode="approve"'] : []),
    "-",
  ];
  argvShown = ["codex", ...args];
  const r = spawnSync(realBin("codex"), args, { cwd: REPO, input: c.prompt, encoding: "utf8", timeout: TIMEOUT_MS, maxBuffer: 64 << 20 });
  exit = r.status;
  writeFileSync(transcriptPath, r.stdout ?? "");
  writeFileSync(join(root, "cli-stderr.log"), r.stderr ?? "");
  evidence = codexEvidence(r.stdout ?? "");
} else {
  argvShown = ["grok", "agent", "--no-leader", "stdio", "(ACP: initialize → session/new{mcpServers:[loom]} → session/prompt)"];
  evidence = await runGrokAcp();
  exit = (evidence as any).exit ?? null;
}
const wallMs = Date.now() - t0;

// ---------------------------------------------------------------------------
// Post-state: board, audit file, then the human path `loom board set <id> done`.
const board = readBoard();
const auditFiles = existsSync(join(lDir, "rooms"))
  ? readdirSync(join(lDir, "rooms")).flatMap((d) =>
      readdirSync(join(lDir, "rooms", d)).filter((n) => n.startsWith("policy-audit")).map((n) => join(lDir, "rooms", d, n)),
    )
  : [];
const audit = auditFiles.flatMap((p) => jsonLines(readFileSync(p, "utf8")).map((rec) => ({ file: p.slice(lDir.length + 1), rec })));
const mcpStderr = existsSync(stderrLog) ? readFileSync(stderrLog, "utf8").split("\n").filter(Boolean) : [];

const smokeTask = board.find((t: any) => t.title === TASK_TITLE);
let humanPath: Record<string, unknown> | null = null;
if (smokeTask) {
  const args = ["run", join(REPO, "packages/cli/src/index.ts"), "board", "set", smokeTask.id, "done"];
  const r = spawnSync(realBin("bun"), args, { cwd: scratchCwd, encoding: "utf8", env: { ...process.env }, timeout: 60_000 });
  const after = readBoard().find((t: any) => t.id === smokeTask.id);
  humanPath = {
    command: `LOOM_TEST_HOME=<case>/home LOOM_SESSION=<case>/home/.loom/session.json bun run packages/cli/src/index.ts board set ${smokeTask.id} done`,
    exit: r.status, stdout: (r.stdout ?? "").trim(), stderr: (r.stderr ?? "").trim().slice(0, 500),
    statusBefore: smokeTask.status, statusAfter: after?.status ?? null,
  };
}

const result = {
  case: caseName, agent: c.agent, cliVersion: c.agent === "server" ? null : cliVersion(c.agent), wallMs, exit,
  argv: argvShown, policy: c.policy, loomDir: lDir,
  evidence,
  boardAfterAgent: board.map((t: any) => ({ id: t.id, title: t.title, status: t.status })),
  audit, mcpStderr, humanPath,
  noWrite: { scratchHomeEntries: readdirSync(home), scratchCwdEntries: readdirSync(scratchCwd) },
};
writeFileSync(join(root, "result.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
process.exit(0);

// ---------------------------------------------------------------------------
function readBoard(): any[] {
  const p = boardPathForRoom(ROOM_ID);
  if (!existsSync(p)) return [];
  try {
    return JSON.parse(readFileSync(p, "utf8")).tasks ?? [];
  } catch {
    return [];
  }
}

function claudeEvidence(raw: string): Record<string, unknown> {
  const events = jsonLines(raw);
  const init = events.find((e) => e.type === "system" && e.subtype === "init") ?? {};
  const results = new Map<string, any>();
  for (const e of events) for (const b of e.message?.content ?? []) if (b?.type === "tool_result") results.set(b.tool_use_id, b);
  const toolCalls = events
    .flatMap((e) => (e.type === "assistant" ? e.message?.content ?? [] : []))
    .filter((b: any) => b?.type === "tool_use")
    .map((b: any) => {
      const r = results.get(b.id);
      return { name: b.name, input: b.input, isError: r?.is_error ?? null, result: contentText(r?.content).slice(0, 1200) };
    });
  const res = events.find((e) => e.type === "result") ?? {};
  return {
    init: {
      mcpServers: init.mcp_servers ?? null,
      loomTools: Array.isArray(init.tools) ? init.tools.filter((t: string) => t.startsWith("mcp__loom__")) : null,
      permissionMode: init.permissionMode ?? null,
    },
    toolCalls,
    permissionDenials: res.permission_denials ?? null,
    resultSubtype: res.subtype ?? null,
    numTurns: res.num_turns ?? null,
    finalText: typeof res.result === "string" ? res.result : null,
  };
}

function codexEvidence(raw: string): Record<string, unknown> {
  const events = jsonLines(raw);
  const done = new Map<string, any>();
  for (const e of events) if ((e.type === "item.completed" || e.type === "item.started") && e.item) done.set(e.item.id, e.item);
  const items = [...done.values()];
  const mcpCalls = items.filter((it) => it.type === "mcp_tool_call").map((it) => ({
    server: it.server, tool: it.tool, arguments: it.arguments, status: it.status,
    error: it.error ?? null,
    result: it.result ? { isError: it.result.is_error ?? it.result.isError ?? null, text: contentText(it.result.content).slice(0, 1200) } : null,
  }));
  const messages = items.filter((it) => it.type === "agent_message").map((it) => String(it.text ?? ""));
  return {
    itemTypes: [...new Set(items.map((it) => it.type))],
    mcpCalls,
    commands: items.filter((it) => it.type === "command_execution").map((it) => String(it.command ?? "").slice(0, 300)),
    errors: events.filter((e) => e.type === "error" || e.type === "turn.failed").map((e) => JSON.stringify(e).slice(0, 500)),
    finalText: messages[messages.length - 1] ?? null,
  };
}

/** Direct JSON-RPC to the wrapper: ground truth for the exact server texts (no model in the loop). */
async function runServerDirect(): Promise<Record<string, unknown>> {
  const p = spawn(wrapper, [], { stdio: ["pipe", "pipe", "inherit"], cwd: scratchCwd });
  const pending = new Map<number, (v: any) => void>();
  let buf = "";
  p.stdout.on("data", (d) => {
    buf += d;
    for (let i = buf.indexOf("\n"); i >= 0; i = buf.indexOf("\n")) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      try {
        const m = JSON.parse(line);
        pending.get(m.id)?.(m);
      } catch {
        /* ignore */
      }
    }
  });
  let id = 0;
  const call = (method: string, params?: unknown) =>
    new Promise<any>((res) => {
      const n = ++id;
      pending.set(n, res);
      p.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: n, method, params })}\n`);
    });
  const tool = async (name: string, args: unknown) => {
    const m = await call("tools/call", { name, arguments: args });
    return m.error ? { jsonRpcError: m.error } : { isError: m.result?.isError ?? false, text: contentText(m.result?.content) };
  };
  await call("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "smoke0320", version: "0" } });
  const list = await call("tools/list", {});
  const names: string[] = (list.result?.tools ?? []).map((t: any) => t.name);
  const roomChat = await tool("room_chat", { text: "hello" });
  const add = await tool("add_task", { title: TASK_TITLE });
  const taskId = (() => {
    try {
      return JSON.parse(add.text ?? "{}").task?.id ?? null;
    } catch {
      return null;
    }
  })();
  const updDone = await tool("update_task", { id: taskId, status: "done" });
  const replace = await tool("import_board", { mode: "replace", snapshot: { tasks: [] } });
  const badArgs = await tool("update_task", { id: taskId, status: "doing", extra: 1 });
  p.stdin.end();
  return { toolCount: names.length, tools: names, roomChatListed: names.includes("room_chat"), roomChat, add, updDone, replace, badArgs };
}

/** grok has no per-invocation MCP flag for `-p`; ACP session/new carries mcpServers per session. */
async function runGrokAcp(): Promise<Record<string, unknown>> {
  const p = spawn(realBin("grok"), ["agent", "--no-leader", "stdio"], { stdio: ["pipe", "pipe", "pipe"], cwd: scratchCwd });
  const transcript: string[] = [];
  const pending = new Map<number, (v: any) => void>();
  const permissionRequests: any[] = [];
  const toolCalls = new Map<string, any>();
  let agentText = "";
  let buf = "";
  let stderr = "";
  p.stderr.on("data", (d) => {
    stderr += d;
  });
  const send = (o: unknown) => p.stdin.write(`${JSON.stringify(o)}\n`);
  p.stdout.on("data", (d) => {
    buf += d;
    for (let i = buf.indexOf("\n"); i >= 0; i = buf.indexOf("\n")) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      transcript.push(line);
      let m: any;
      try {
        m = JSON.parse(line);
      } catch {
        continue;
      }
      if (m.id !== undefined && m.method === undefined) {
        pending.get(m.id)?.(m);
        continue;
      }
      if (m.method === "session/request_permission") {
        // Approve loom MCP tool calls once; reject anything else (the prompt forbids other tools).
        const tc = m.params?.toolCall ?? {};
        const opts: any[] = m.params?.options ?? [];
        const isLoom = /loom/i.test(JSON.stringify(tc));
        const pick = opts.find((o) => o.kind === (isLoom ? "allow_once" : "reject_once")) ?? opts[0];
        permissionRequests.push({ title: tc.title ?? null, kind: tc.kind ?? null, isLoom, options: opts.map((o) => o.kind), picked: pick?.kind ?? null });
        send({ jsonrpc: "2.0", id: m.id, result: { outcome: pick ? { outcome: "selected", optionId: pick.optionId } : { outcome: "cancelled" } } });
        continue;
      }
      if (m.method === "session/update") {
        const u = m.params?.update ?? {};
        if (u.sessionUpdate === "agent_message_chunk") agentText += contentText(u.content);
        if (u.sessionUpdate === "tool_call" || u.sessionUpdate === "tool_call_update") {
          const prev = toolCalls.get(u.toolCallId) ?? {};
          toolCalls.set(u.toolCallId, { ...prev, ...Object.fromEntries(Object.entries(u).filter(([, v]) => v !== undefined && v !== null)) });
        }
        continue;
      }
      if (m.id !== undefined && m.method) send({ jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "not supported by smoke client" } });
    }
  });
  let n = 0;
  const call = (method: string, params: unknown, ms = 120_000) =>
    new Promise<any>((res) => {
      const id = ++n;
      const t = setTimeout(() => res({ timeout: true }), ms);
      pending.set(id, (v) => {
        clearTimeout(t);
        res(v);
      });
      send({ jsonrpc: "2.0", id, method, params });
    });
  const init = await call("initialize", { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false } });
  const sess = await call("session/new", { cwd: scratchCwd, mcpServers: [{ name: "loom", command: wrapper, args: [], env: [] }] });
  const sessionId = sess.result?.sessionId;
  const prompt = sessionId
    ? await call("session/prompt", { sessionId, prompt: [{ type: "text", text: c.prompt }] }, TIMEOUT_MS)
    : { error: "no session" };
  p.stdin.end();
  p.kill();
  writeFileSync(transcriptPath, `${transcript.join("\n")}\n`);
  writeFileSync(join(root, "cli-stderr.log"), stderr);
  const mcpUpdates = transcript.filter((l) => l.includes("mcp/servers_updated")).map((l) => {
    try {
      return (JSON.parse(l).params?.mcpServers ?? []).map((s: any) => s.name);
    } catch {
      return [];
    }
  });
  return {
    agentVersion: init.result?._meta?.agentVersion ?? null,
    sessionNewError: sess.error ?? null,
    mcpServersUpdates: mcpUpdates,
    stopReason: prompt.result?.stopReason ?? null,
    promptError: prompt.error ?? (prompt.timeout ? "timeout" : null),
    permissionRequests,
    toolCalls: [...toolCalls.values()].map((t) => ({
      title: t.title ?? null, kind: t.kind ?? null, status: t.status ?? null,
      rawInput: t.rawInput ?? null,
      rawOutput: t.rawOutput === undefined ? null : JSON.stringify(t.rawOutput).slice(0, 1200),
      content: contentText((t.content ?? []).map((x: any) => x?.content ?? x)).slice(0, 1200),
    })),
    finalText: agentText,
    exit: prompt.result ? 0 : 1,
  };
}
