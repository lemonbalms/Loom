// Live smoke for Loom v0.30.0 Done-when (h). Real agent binaries through HeadlessDispatcher.
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultWorkerPermissions, type AgentKind } from "../packages/host/src/agent-argv";
import { cardSessionPath, readCardSession } from "../packages/host/src/card-session-store";
import { HeadlessDispatcher } from "../packages/host/src/headless-worker";
import { parseAgentStream } from "../packages/host/src/agent-stream-parsers";

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
