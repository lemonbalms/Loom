// Live smoke for Loom v0.30.0 Done-when (h) and v0.31.0 Done-when (h)(i) (`0310 <case>`). Real agent binaries through HeadlessDispatcher.
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultWorkerPermissions, type AgentKind } from "../packages/host/src/agent-argv";
import { cardSessionPath, readCardSession } from "../packages/host/src/card-session-store";
import { HeadlessDispatcher } from "../packages/host/src/headless-worker";
import { parseAgentStream } from "../packages/host/src/agent-stream-parsers";
import { workerConfigFromBridge } from "../packages/host/src/bridge-config";
import { loomDir as loomStateDir, resetStateHomeDirCache } from "../packages/host/src/session-store";
import { roomSkillsPath } from "../packages/host/src/skill-materialize";

// v0.31.0 Done-when (h)(i): `smoke-headless.ts 0310 <case>` (see cases0310). The 0.30.0 form below is unchanged.
if (process.argv[2] === "0310") {
  await smoke0310(process.argv[3] ?? "");
  process.exit(0);
}

const kind = process.argv[2] as AgentKind;
if (!["claude", "codex", "grok"].includes(kind)) throw new Error("usage: smoke-headless.ts <claude|codex|grok>");
const reanalyze = process.argv[3] === "reanalyze";
const BASE = process.env.SMOKE_BASE ?? join(tmpdir(), "loom-smoke0300");
const root = join(BASE, kind);
// A fresh run starts from an empty per-kind dir (git init/commit would fail on a reused repo).
if (!reanalyze) rmSync(root, { recursive: true, force: true });
mkdirSync(root, { recursive: true });
const loomDir = join(root, "loom");
const cwdRaw = join(root, "repo");
mkdirSync(loomDir, { recursive: true });
mkdirSync(cwdRaw, { recursive: true });
const cwd = realpathSync(cwdRaw);
if (!reanalyze) {
  writeFileSync(join(cwd, "README.md"), "# smoke repo\n");
  execFileSync("git", ["init", "-q"], { cwd });
  execFileSync("git", ["-c", "user.name=s", "-c", "user.email=s@x", "add", "."], { cwd });
  execFileSync("git", ["-c", "user.name=s", "-c", "user.email=s@x", "commit", "-qm", "init"], { cwd });
}

const PROMPT =
  "Create a file named report.md in the current directory containing a numbered list of 400 lines, each line 'Line N: ' followed by a short distinct sentence about software testing (vary them). Then reply with the full contents of report.md in your final message, followed by the line END-OF-REPORT.";
const localPeerId = "smoke-peer";
const card = { roomId: "room_smoke", cardId: `smoke_${kind}`, agent: kind, prompt: PROMPT, fromPeerId: "peer_dispatcher", dispatchHandoffId: "ho_smoke_1" };
const calls: any[] = [];
const t0 = Date.now();
const d = new HeadlessDispatcher({
  config: { backend: "headless", cwd, allowedRoots: [cwd], maxConcurrent: { claude: 1, codex: 1, grok: 1 }, timeoutMs: 15 * 60_000, permissions: defaultWorkerPermissions() },
  loomDir, localPeerId, node: "smoke-node",
  commands: { claude: { bin: "claude", args: [] }, codex: { bin: "codex", args: [] }, grok: { bin: "grok", args: [] } },
  sink: { async composeAndSend(target, fields) { calls.push({ target, fields }); return { branch: "accepted", status: "delivered", recipientCount: 1 }; } },
} as any);
if (!reanalyze) await d.dispatch(card as any);
const wallMs = Date.now() - t0;
await d.close();
const f = calls[0]?.fields ?? (existsSync(join(root,"result.json")) ? JSON.parse(readFileSync(join(root,"result.json"),"utf8")) : {});
const output: string = f.output ?? (existsSync(join(root,"output.txt")) ? readFileSync(join(root,"output.txt"),"utf8") : "");
const sessDir = join(cardSessionPath({ loomDir, localPeerId, ...card }), "..");
const rec = readCardSession({ loomDir, localPeerId, ...card });
const tfiles = existsSync(sessDir) ? readdirSync(sessDir).filter((n) => n.startsWith("transcript") && n.endsWith(".jsonl")) : [];
const tpath = tfiles.length ? join(sessDir, tfiles[tfiles.length - 1]!) : "";
const raw = tpath ? readFileSync(tpath, "utf8") : "";
const parsed: any = raw ? parseAgentStream(kind, raw) : {};
const reportPath = join(cwd, "report.md");
const reportText = existsSync(reportPath) ? readFileSync(reportPath, "utf8") : "";
const lineCount = (s: string) => s.split("\n").filter((l) => /^Line \d+:/.test(l)).length;
const result = {
  kind, wallMs, sinkCalls: calls.length,
  status: f.status, reason: f.reason, outputLength: output.length, truncated: f.truncated, summary: f.summary, note: f.note, timedOut: f.timedOut,
  hasEndMarker: output.includes("END-OF-REPORT"), outputLines: lineCount(output),
  reportExists: !!reportText, reportBytes: reportText ? statSync(reportPath).size : 0, reportLines: lineCount(reportText),
  denials: parsed.denials ?? null, sessionId: parsed.sessionId ?? null, recordSessionId: rec?.sessionId ?? null, recordState: rec?.state, attempts: rec?.attempts,
  transcriptPath: tpath, transcriptBytes: tpath ? statSync(tpath).size : 0,
  cwdFiles: readdirSync(cwd),
};
writeFileSync(join(root, "result.json"), JSON.stringify(result, null, 2));
writeFileSync(join(root, "output.txt"), output);
console.log(JSON.stringify(result, null, 2));
process.exit(0);

// ---------------------------------------------------------------------------
// v0.31.0 Done-when (h) skills + (i) policy. Real CLIs through HeadlessDispatcher, with the
// worker config built by the real bridge path (workerConfigFromBridge → loomDir()/policy.json).
// Isolation: LOOM_TEST_HOME = <case>/home, so loomDir() = <case>/home/.loom (never ~/.loom).
// The CLIs keep the real HOME (their own auth). argv is captured by an exec shim in <case>/bin.
type Case0310 = { agent: AgentKind; prompt: string; policy: Record<string, unknown> };
// Functions, not consts: the 0310 entry at the top runs before module-level consts below initialize.
function cases0310(): Record<string, Case0310> {
const REPORT_PROMPT =
  "Write a 3-line report about what this repository contains (look at its files), and finish per your report skill.";
const basePolicy = (over: { deny?: string[]; network?: boolean } = {}) => ({
  version: 1,
  shell: { deny: over.deny ?? [] },
  network: over.network ?? false,
  mcp: { deny: [] },
  skills: { allowScripts: [] },
});
return {
  "h-claude": { agent: "claude", prompt: REPORT_PROMPT, policy: basePolicy() },
  "h-codex": { agent: "codex", prompt: REPORT_PROMPT, policy: basePolicy() },
  "h-grok": { agent: "grok", prompt: REPORT_PROMPT, policy: basePolicy() },
  "i-claude-deny": {
    agent: "claude",
    prompt:
      "Run exactly this shell command with your Bash tool, once: echo hi\nIf it is blocked or denied, do not retry and do not use any other tool or workaround; just say in your final message what happened.",
    policy: basePolicy({ deny: ["echo *"] }),
  },
  "i-codex-net-off": {
    agent: "codex",
    prompt:
      "Run exactly this shell command, once: curl -sI https://example.com\nDo not retry, do not ask for escalation, do not work around a failure. In your final message give its exit code and the first line of its output.",
    policy: basePolicy({ network: false }),
  },
  "i-codex-net-on": {
    agent: "codex",
    prompt:
      "Run exactly this shell command, once: curl -sI https://example.com\nDo not retry, do not ask for escalation, do not work around a failure. In your final message give its exit code and the first line of its output.",
    policy: basePolicy({ network: true }),
  },
};
}

function realBin(name: string): string {
  return execFileSync("/usr/bin/which", [name], { encoding: "utf8" }).trim();
}

function cliVersion(name: string): string {
  try {
    return execFileSync(realBin(name), ["--version"], { encoding: "utf8", timeout: 30_000 }).trim().split("\n")[0]!;
  } catch {
    return "unknown";
  }
}

function jsonLines(raw: string): any[] {
  const out: any[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* non-JSON line */ }
  }
  return out;
}

function firstLine(s: unknown): string {
  return typeof s === "string" ? s.split("\n").find((l) => l.trim()) ?? "" : "";
}

async function smoke0310(caseName: string): Promise<void> {
  const all = cases0310();
  const c = all[caseName];
  if (!c) throw new Error(`usage: smoke-headless.ts 0310 <${Object.keys(all).join("|")}>`);
  const BASE = process.env.SMOKE_BASE ?? join(tmpdir(), "loom-smoke0310");
  const root = join(BASE, caseName);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  const home = join(root, "home");
  mkdirSync(home, { recursive: true });
  process.env.LOOM_TEST_HOME = realpathSync(home);
  resetStateHomeDirCache();
  const lDir = loomStateDir();
  if (lDir !== join(realpathSync(home), ".loom")) throw new Error(`loomDir not isolated: ${lDir}`);
  mkdirSync(lDir, { recursive: true, mode: 0o700 });
  const cwdRaw = join(root, "repo");
  mkdirSync(cwdRaw, { recursive: true });
  const cwd = realpathSync(cwdRaw);
  writeFileSync(join(cwd, "README.md"), "# smoke repo\n\nA tiny fixture repo for the Loom 0.31.0 headless smoke.\n");
  writeFileSync(join(cwd, "hello.ts"), 'export const hello = (n: string) => `hello ${n}`;\n');
  execFileSync("git", ["init", "-q"], { cwd });
  execFileSync("git", ["-c", "user.name=s", "-c", "user.email=s@x", "add", "."], { cwd });
  execFileSync("git", ["-c", "user.name=s", "-c", "user.email=s@x", "commit", "-qm", "init"], { cwd });

  const card = { roomId: "room_smoke0310", cardId: `smoke0310_${caseName}`, agent: c.agent, prompt: c.prompt, fromPeerId: "peer_dispatcher", dispatchHandoffId: "ho_smoke0310_1" };
  writeFileSync(join(lDir, "policy.json"), JSON.stringify(c.policy, null, 2), { mode: 0o600 });
  const skillsJson = roomSkillsPath(lDir, card.roomId);
  mkdirSync(join(skillsJson, ".."), { recursive: true, mode: 0o700 });
  writeFileSync(skillsJson, JSON.stringify({ version: 1, skills: ["loom-card-report"] }), { mode: 0o600 });

  // exec shim: records argv (NUL-separated), then becomes the real CLI (same pid).
  const binDir = join(root, "bin");
  mkdirSync(binDir, { recursive: true });
  const argvPath = join(root, "argv.nul");
  const shim = join(binDir, c.agent);
  writeFileSync(shim, `#!/bin/sh\nprintf '%s\\0' "$@" > '${argvPath}'\nexec '${realBin(c.agent)}' "$@"\n`, { mode: 0o755 });

  const config = workerConfigFromBridge({
    worker: { backend: "headless", cwd, allowedRoots: [cwd], timeoutMs: 14 * 60_000, skills: { enabled: true } },
  } as any);
  const localPeerId = "smoke-peer";
  const calls: any[] = [];
  const t0 = Date.now();
  const d = new HeadlessDispatcher({
    config, loomDir: lDir, localPeerId, node: "smoke-node",
    commands: { claude: { bin: shim, args: [] }, codex: { bin: shim, args: [] }, grok: { bin: shim, args: [] } },
    sink: { async composeAndSend(target: any, fields: any) { calls.push({ target, fields }); return { branch: "accepted", status: "delivered", recipientCount: 1 }; } },
  } as any);
  await d.dispatch(card as any);
  const wallMs = Date.now() - t0;
  await d.close();

  const f = calls[0]?.fields ?? {};
  const output: string = f.output ?? "";
  const key = { loomDir: lDir, localPeerId, ...card };
  const cardDir = join(cardSessionPath(key), "..");
  const rec = readCardSession(key);
  const tfiles = existsSync(cardDir) ? readdirSync(cardDir).filter((n) => n.startsWith("transcript") && n.endsWith(".jsonl")) : [];
  const tpath = tfiles.length ? join(cardDir, tfiles[tfiles.length - 1]!) : "";
  const raw = tpath ? readFileSync(tpath, "utf8") : "";
  const events = jsonLines(raw);
  const parsed: any = raw ? parseAgentStream(c.agent, raw) : {};
  const argv = existsSync(argvPath) ? readFileSync(argvPath, "utf8").split("\0").slice(0, -1) : [];
  const flagVal = (flag: string) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] ?? null : null; };
  const manifestPath = join(cardDir, "skills", "manifest.json");
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : null;
  const skillMd = join(cardDir, "skills", "plugin", "skills", "loom-card-report", "SKILL.md");
  const lastLine = output.trimEnd().split("\n").pop() ?? "";

  const evidence: Record<string, unknown> = {};
  if (c.agent === "claude") {
    const init = events.find((e) => e.type === "system" && e.subtype === "init") ?? {};
    evidence.init = {
      plugins: init.plugins ?? null,
      skills: Array.isArray(init.skills) ? init.skills.filter((s: string) => /loom/i.test(String(s))) : init.skills ?? null,
      skillsCount: Array.isArray(init.skills) ? init.skills.length : null,
      mcpServers: init.mcp_servers ?? null,
      slashLoom: Array.isArray(init.slash_commands) ? init.slash_commands.filter((s: string) => /loom/i.test(String(s))) : null,
      permissionMode: init.permissionMode ?? null,
    };
    // Every Bash/Skill tool_use with its tool_result.
    const results = new Map<string, any>();
    for (const e of events) for (const b of e.message?.content ?? []) if (b?.type === "tool_result") results.set(b.tool_use_id, b);
    evidence.toolUses = events.flatMap((e) => (e.type === "assistant" ? e.message?.content ?? [] : []))
      .filter((b: any) => b?.type === "tool_use")
      .map((b: any) => {
        const r = results.get(b.id);
        const content = typeof r?.content === "string" ? r.content : Array.isArray(r?.content) ? r.content.map((x: any) => x?.text ?? "").join("") : "";
        return { name: b.name, input: b.name === "Bash" ? b.input?.command : b.name === "Skill" ? b.input : b.input?.file_path ?? undefined, isError: r?.is_error ?? null, result: content.slice(0, 300) };
      });
    const result = events.find((e) => e.type === "result") ?? {};
    evidence.permissionDenials = result.permission_denials ?? null;
    evidence.resultSubtype = result.subtype ?? null;
    evidence.settings = (() => { try { return JSON.parse(flagVal("--settings") ?? "null"); } catch { return "unparseable"; } })();
  } else if (c.agent === "codex") {
    const items = events.filter((e) => e.type === "item.completed" || e.type === "item.started").map((e) => e.item).filter(Boolean);
    const cmds = items.filter((it: any) => it.type === "command_execution");
    const done = new Map<string, any>();
    for (const it of cmds) done.set(it.id, it);
    evidence.commands = [...done.values()].map((it: any) => ({
      command: String(it.command ?? "").slice(0, 400), exitCode: it.exit_code ?? null, status: it.status ?? null,
      outputFirstLine: firstLine(it.aggregated_output).slice(0, 200),
    }));
    evidence.readSkillMdAbs = [...done.values()].some((it: any) => String(it.command ?? "").includes(skillMd));
    evidence.skillMdMentionsInTranscript = raw.split(skillMd).length - 1;
    evidence.configOverrides = argv.flatMap((a, i) => (argv[i - 1] === "-c" ? [a] : []));
    evidence.sandbox = flagVal("-s") ?? flagVal("--sandbox");
  } else {
    evidence.skillMdMentionsInTranscript = raw.split(skillMd).length - 1;
    evidence.allowDeny = argv.flatMap((a, i) => (argv[i - 1] === "--allow" || argv[i - 1] === "--deny" ? [`${argv[i - 1]} ${a}`] : []));
  }
  const cwdEntries = readdirSync(cwd);
  const result = {
    case: caseName, agent: c.agent, cliVersion: cliVersion(c.agent), wallMs, sinkCalls: calls.length,
    loomDir: lDir, policy: c.policy,
    status: f.status, reason: f.reason, truncated: f.truncated, timedOut: f.timedOut, summary: f.summary, note: f.note ?? null,
    outputLength: output.length, hasReportEnd: output.includes("LOOM-REPORT-END"), reportEndIsLastLine: lastLine.trim() === "LOOM-REPORT-END",
    argv, hasPluginDir: argv.includes("--plugin-dir"), pluginDir: flagVal("--plugin-dir"), hasAddDir: argv.includes("--add-dir"),
    hasStrictMcp: argv.includes("--strict-mcp-config"), settingsCount: argv.filter((a) => a === "--settings").length,
    manifest, skillMdExists: existsSync(skillMd), skillMdPath: skillMd,
    denials: parsed.denials ?? null, sessionId: parsed.sessionId ?? null, recordState: rec?.state, attempts: rec?.attempts,
    transcriptPath: tpath, transcriptBytes: tpath ? statSync(tpath).size : 0,
    evidence,
    noWrite: {
      cwdEntries,
      cwdAgentDirs: [".claude", ".agents", ".codex", ".grok"].filter((n) => existsSync(join(cwd, n))),
      scratchHomeEntries: readdirSync(home),
      gitStatus: execFileSync("git", ["status", "--porcelain", "--ignored"], { cwd, encoding: "utf8" }).trim().split("\n").filter(Boolean),
    },
  };
  writeFileSync(join(root, "result.json"), JSON.stringify(result, null, 2));
  writeFileSync(join(root, "output.txt"), output);
  console.log(JSON.stringify(result, null, 2));
}
