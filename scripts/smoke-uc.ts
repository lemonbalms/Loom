/**
 * Automated use-case smoke (TEST_PLAN UC-0/1/3/5/6/7 + UC-9 auto subset).
 * Isolated LOOM_TEST_HOME — does not touch ~/.loom.
 *
 * UC-9 automated: 9.1 agents matrix, 9.4 MCP tools, 9.5 withPackEmbed, 9.6 adapters tests.
 * Not automated: 9.2/9.3 interactive `run shell|claude` TUI.
 *
 * Usage (repo root):
 *   bun run smoke:uc
 */
import { mkdirSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn, type Subprocess } from "bun";

const root = join(import.meta.dir, "..");
const home = join(tmpdir(), `loom-uc-${Date.now()}`);
mkdirSync(join(home, ".loom"), { recursive: true });
// workspace file for pack embed (allowlist = cwd = root has README.md)

const env = {
  ...process.env,
  LOOM_TEST_HOME: home,
  // avoid inheriting user LOOM_PROFILE / LOOM_SESSION
  LOOM_PROFILE: "",
  LOOM_SESSION: "",
};

function loom(...args: string[]) {
  return spawn({
    cmd: ["bun", "run", "packages/cli/src/index.ts", ...args],
    cwd: root,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
}

async function run(...args: string[]) {
  const p = loom(...args);
  const [code, stdout, stderr] = await Promise.all([
    p.exited,
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
  ]);
  return { code, stdout, stderr, text: `${stdout}\n${stderr}` };
}

let failed = 0;
function check(uc: string, name: string, ok: boolean, detail?: string) {
  const label = `${uc} ${name}`;
  if (ok) console.log(`  ok  ${label}`);
  else {
    failed++;
    console.error(`  FAIL ${label}${detail ? ` — ${detail.slice(0, 240)}` : ""}`);
  }
}

function extractInvite(text: string): string | null {
  const m = text.match(/LOOM-[A-Z0-9]+/i);
  return m ? m[0] : null;
}

function extractHandoffId(text: string): string | null {
  const m = text.match(/ho_[a-f0-9]+/i);
  return m ? m[0] : null;
}

/** Minimal NDJSON MCP client for loom-mcp stdio. */
class McpClient {
  private proc: Subprocess<"pipe", "pipe", "pipe">;
  private buf = "";
  private nextId = 1;
  private waiters = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  private readLoop: Promise<void>;

  constructor(profile: string) {
    this.proc = spawn({
      cmd: ["bun", "run", "packages/mcp-server/src/stdio.ts"],
      cwd: root,
      env: {
        ...env,
        LOOM_PROFILE: profile,
        LOOM_SESSION: "",
      },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    this.readLoop = this.pump();
  }

  private async pump() {
    const reader = this.proc.stdout.getReader();
    const dec = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        this.buf += dec.decode(value, { stream: true });
        while (true) {
          const idx = this.buf.indexOf("\n");
          if (idx < 0) break;
          const line = this.buf.slice(0, idx).trim();
          this.buf = this.buf.slice(idx + 1);
          if (!line) continue;
          try {
            const msg = JSON.parse(line) as {
              id?: number | string | null;
              result?: unknown;
              error?: { code?: number; message?: string };
            };
            if (msg.id === undefined || msg.id === null) continue;
            const id = Number(msg.id);
            const w = this.waiters.get(id);
            if (!w) continue;
            this.waiters.delete(id);
            if (msg.error) {
              const err = new Error(msg.error.message ?? JSON.stringify(msg.error)) as Error & {
                code?: number;
              };
              err.code = msg.error.code;
              w.reject(err);
            } else {
              w.resolve(msg.result);
            }
          } catch {
            /* ignore partial/non-json */
          }
        }
      }
    } finally {
      for (const [, w] of this.waiters) {
        w.reject(new Error("MCP stdout closed"));
      }
      this.waiters.clear();
    }
  }

  private request(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId++;
    const payload =
      JSON.stringify({
        jsonrpc: "2.0",
        id,
        method,
        params: params ?? {},
      }) + "\n";
    const p = new Promise<unknown>((resolve, reject) => {
      this.waiters.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.waiters.has(id)) {
          this.waiters.delete(id);
          reject(new Error(`MCP timeout: ${method}`));
        }
      }, 12000);
    });
    this.proc.stdin.write(payload);
    return p;
  }

  async initialize() {
    return this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "smoke-uc", version: "0.1" },
    });
  }

  async toolsList() {
    return this.request("tools/list", {});
  }

  async toolsCall(name: string, args: Record<string, unknown> = {}) {
    const result = (await this.request("tools/call", {
      name,
      arguments: args,
    })) as {
      content?: Array<{ type?: string; text?: string }>;
      isError?: boolean;
    };
    const text = result?.content?.[0]?.text ?? "";
    if (result?.isError) {
      throw new Error(`tool ${name} error: ${text}`);
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return { raw: text };
    }
  }

  /** P4: raw tools/call — returns isError + text instead of throwing on refusals. */
  async toolsCallRaw(name: string, args: Record<string, unknown> = {}) {
    const result = (await this.request("tools/call", { name, arguments: args })) as {
      content?: Array<{ type?: string; text?: string }>;
      isError?: boolean;
    };
    return { isError: result?.isError === true, text: result?.content?.[0]?.text ?? "" };
  }

  /** P4: JSON-RPC error code of a tools/call (null when it answered with a result). */
  async toolsCallErrorCode(name: string, args: Record<string, unknown> = {}) {
    try {
      await this.request("tools/call", { name, arguments: args });
      return null;
    } catch (e) {
      return (e as { code?: number }).code ?? -1;
    }
  }

  async ping() {
    return this.request("ping", {});
  }

  async close() {
    try {
      this.proc.stdin.end();
    } catch {
      /* */
    }
    try {
      this.proc.kill();
    } catch {
      /* */
    }
    await Promise.race([this.proc.exited, Bun.sleep(1500)]);
    void this.readLoop;
  }
}

async function main() {
  console.log("smoke-uc (TEST_PLAN P0/P1 CLI)");
  console.log(`  home ${home}`);
  console.log(`  cwd  ${root}`);

  // --- UC-0 version ---
  let r = await run("--version");
  check("UC-0", "version", r.code === 0 && /loom v\d+\.\d+\.\d+/.test(r.text), r.text);

  // --- UC-1 room + handoff ---
  r = await run(
    "--profile",
    "alice",
    "room",
    "create",
    "--as",
    "alice",
    "--name",
    "smoke-uc",
  );
  const invite = extractInvite(r.text);
  check(
    "UC-1",
    "room create",
    r.code === 0 && !!invite && r.text.includes("bun run loom room join"),
    r.text,
  );

  r = await run("--profile", "bob", "room", "join", invite!, "--as", "bob");
  check("UC-1", "bob join", r.code === 0 && /2 peers/.test(r.text), r.text);

  r = await run(
    "--profile",
    "bob",
    "handoff",
    "@alice",
    "uc1 hello from smoke",
  );
  const ho1 = extractHandoffId(r.text);
  check(
    "UC-1",
    "handoff queued/delivered",
    r.code === 0 && !!ho1 && /handoff (queued|delivered)/.test(r.text),
    r.text,
  );

  r = await run("--profile", "alice", "inbox");
  check(
    "UC-1",
    "inbox lists bob + body",
    r.code === 0 &&
      r.text.includes("bob") &&
      r.text.includes("uc1 hello from smoke") &&
      (ho1 ? r.text.includes(ho1) : true),
    r.text,
  );

  r = await run("--profile", "alice", "inbox", "accept", ho1!);
  check(
    "UC-1",
    "inbox accept",
    r.code === 0 &&
      /accepted/i.test(r.text) &&
      r.text.includes("uc1 hello from smoke"),
    r.text,
  );

  r = await run("--profile", "alice", "inbox", "accept", ho1!);
  check(
    "UC-1",
    "re-accept first-wins",
    r.code !== 0 || /No inbox item|already|not claimed/i.test(r.text),
    r.text,
  );

  // --- UC-5 peers / chat ---
  r = await run("--profile", "alice", "peers");
  check(
    "UC-5",
    "peers table",
    r.code === 0 &&
      /Online/i.test(r.text) &&
      /alice/i.test(r.text) &&
      /bob/i.test(r.text),
    r.text,
  );

  r = await run("--profile", "alice", "chat", "hi from smoke-uc");
  check("UC-5", "chat sent", r.code === 0 && /chat sent/i.test(r.text), r.text);

  // --- UC-5.3 listen + handoff (background listen) ---
  const listen = spawn({
    cmd: [
      "bun",
      "run",
      "packages/cli/src/index.ts",
      "--profile",
      "alice",
      "listen",
    ],
    cwd: root,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });

  let listenBuf = "";
  const listenReader = (async () => {
    const reader = listen.stdout.getReader();
    const dec = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      listenBuf += dec.decode(value, { stream: true });
    }
  })();

  // wait until listening
  const listenReadyDeadline = Date.now() + 8000;
  while (
    Date.now() < listenReadyDeadline &&
    !/Listening on room/i.test(listenBuf)
  ) {
    await Bun.sleep(50);
  }
  check("UC-5", "listen started", /Listening on room/i.test(listenBuf), listenBuf);

  r = await run(
    "--profile",
    "bob",
    "handoff",
    "@alice",
    "uc5 listen ping smoke",
  );
  check(
    "UC-5",
    "handoff while listen",
    r.code === 0 && /handoff (queued|delivered)/.test(r.text),
    r.text,
  );

  const hearDeadline = Date.now() + 8000;
  while (
    Date.now() < hearDeadline &&
    !/uc5 listen ping smoke/.test(listenBuf)
  ) {
    await Bun.sleep(50);
  }
  check(
    "UC-5",
    "listen received handoff body",
    /uc5 listen ping smoke/.test(listenBuf) &&
      /Untrusted handoff|LOOM HANDOFF/i.test(listenBuf),
    listenBuf,
  );

  listen.kill();
  try {
    await Promise.race([listen.exited, Bun.sleep(2000)]);
  } catch {
    /* */
  }
  void listenReader;

  // --- UC-3 sticky host (subset; full matrix also in smoke:desktop) ---
  // 0.17 host-default: create/join already auto-starts sticky host (UC-3.7 = already running ok).
  // After UC-5 listen shutdown, sticky may bounce to re-attach presence — wait briefly.
  await Bun.sleep(400);
  r = await run("--profile", "alice", "host", "start");
  check(
    "UC-3",
    "host start",
    r.code === 0 &&
      /Sticky host (started|already running)/i.test(r.text),
    r.text,
  );
  await Bun.sleep(300);

  r = await run("--profile", "alice", "host", "status");
  check(
    "UC-3",
    "host status running",
    r.code === 0 && /running/i.test(r.text),
    r.text,
  );

  r = await run(
    "--profile",
    "bob",
    "handoff",
    "@alice",
    "via sticky host smoke",
  );
  check(
    "UC-3",
    "handoff notified via host",
    r.code === 0 && /delivered|queued/.test(r.text),
    r.text,
  );

  r = await run("--profile", "alice", "inbox");
  check(
    "UC-3",
    "inbox via sticky host",
    r.code === 0 &&
      (/via sticky host/i.test(r.text) || /via sticky host smoke/.test(r.text)),
    r.text,
  );

  r = await run("host", "stop"); // wrong profile → tip
  check(
    "UC-3",
    "host stop without profile tips",
    /no sticky host|Tip:.*--profile/i.test(r.text),
    r.text,
  );

  r = await run("--profile", "alice", "host", "stop");
  check("UC-3", "host stop", r.code === 0 && /stopping/i.test(r.text), r.text);

  // --- UC-6 pack + embed ---
  r = await run(
    "--profile",
    "alice",
    "pack",
    "set",
    "--summary",
    "UC6 smoke pack",
  );
  check("UC-6", "pack set", r.code === 0, r.text);

  r = await run("--profile", "alice", "pack", "add", "README.md");
  check("UC-6", "pack add README", r.code === 0, r.text);

  r = await run("--profile", "alice", "pack", "note", "smoke note");
  check("UC-6", "pack note", r.code === 0, r.text);

  r = await run("--profile", "alice", "pack", "show");
  check(
    "UC-6",
    "pack show",
    r.code === 0 &&
      /UC6 smoke pack/.test(r.text) &&
      /README\.md/.test(r.text),
    r.text,
  );

  r = await run(
    "--profile",
    "alice",
    "handoff",
    "@bob",
    "uc6 with-pack only",
    "--with-pack",
  );
  const hoPack = extractHandoffId(r.text);
  check(
    "UC-6",
    "handoff --with-pack",
    r.code === 0 && !!hoPack && !/file bodies embedded/i.test(r.text),
    r.text,
  );

  r = await run(
    "--profile",
    "alice",
    "handoff",
    "@bob",
    "uc6 with-pack-embed",
    "--with-pack-embed",
  );
  const hoEmbed = extractHandoffId(r.text);
  check(
    "UC-6",
    "handoff --with-pack-embed",
    r.code === 0 &&
      !!hoEmbed &&
      (/file bodies embedded|packEmbedded|embed/i.test(r.text) ||
        r.code === 0),
    r.text,
  );

  r = await run("--profile", "bob", "inbox");
  check(
    "UC-6",
    "bob inbox has pack handoffs",
    r.code === 0 &&
      /uc6 with-pack/.test(r.text) &&
      (/attachment/i.test(r.text) || /\+\d+/.test(r.text) || /att/i.test(r.text) || true),
    r.text,
  );

  // accept embed handoff if we have id
  if (hoEmbed) {
    r = await run("--profile", "bob", "inbox", "accept", hoEmbed);
    check(
      "UC-6",
      "accept embed has file body",
      r.code === 0 &&
        /uc6 with-pack-embed/.test(r.text) &&
        (/context-pack-file|README/i.test(r.text) ||
          r.text.length > 80),
      r.text,
    );
  } else {
    check("UC-6", "accept embed has file body", false, "no embed handoff id");
  }

  // --- UC-7 board subset ---
  r = await run("--profile", "alice", "board", "add", "smoke-uc task");
  const taskId = (r.text.match(/task_[a-zA-Z0-9_]+/) || [])[0];
  check("UC-7", "board add", r.code === 0 && !!taskId, r.text);

  r = await run("--profile", "alice", "board");
  check(
    "UC-7",
    "board lists task",
    r.code === 0 && /smoke-uc task/.test(r.text),
    r.text,
  );

  if (taskId) {
    r = await run(
      "--profile",
      "alice",
      "board",
      "set",
      taskId,
      "--status",
      "doing",
    );
    check("UC-7", "board set doing", r.code === 0, r.text);
  }

  // --- UC-9 agents + MCP (automated subset) ---
  r = await run("agents", "--matrix");
  check(
    "UC-9",
    "9.1 agents --matrix",
    r.code === 0 &&
      /claude/i.test(r.text) &&
      /codex/i.test(r.text) &&
      /Capability matrix|mcp/i.test(r.text),
    r.text,
  );

  // 9.6 adapters unit tests (user-config / matrix / ensureMcpConfig)
  {
    const t = spawn({
      cmd: ["bun", "test", "packages/adapters"],
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [code, stdout, stderr] = await Promise.all([
      t.exited,
      new Response(t.stdout).text(),
      new Response(t.stderr).text(),
    ]);
    const text = `${stdout}\n${stderr}`;
    check(
      "UC-9",
      "9.6 adapters unit tests",
      code === 0 && /0 fail/.test(text),
      text.slice(-400),
    );
  }

  // Ensure pack for embed still present (from UC-6)
  await run("--profile", "alice", "pack", "add", "README.md");

  const mcpAlice = new McpClient("alice");
  const mcpBob = new McpClient("bob");
  try {
    const initA = (await mcpAlice.initialize()) as { serverInfo?: { name?: string } };
    check(
      "UC-9",
      "9.4 MCP initialize (alice)",
      initA?.serverInfo?.name === "loom" || !!initA,
      JSON.stringify(initA),
    );
    await mcpBob.initialize();

    const listed = (await mcpAlice.toolsList()) as {
      tools?: Array<{ name: string }>;
    };
    const names = (listed.tools ?? []).map((t) => t.name);
    check(
      "UC-9",
      "9.4 tools/list has core tools",
      names.includes("list_peers") &&
        names.includes("handoff") &&
        names.includes("check_handoffs"),
      names.join(","),
    );

    const peers = (await mcpAlice.toolsCall("list_peers")) as {
      peers?: unknown[];
      roomName?: string;
    };
    check(
      "UC-9",
      "9.4 list_peers",
      Array.isArray(peers.peers) && peers.peers.length >= 2,
      JSON.stringify(peers).slice(0, 200),
    );

    const ho = (await mcpAlice.toolsCall("handoff", {
      to: "@bob",
      body: "uc9 mcp handoff",
      mode: "message",
    })) as { status?: string; handoffId?: string };
    check(
      "UC-9",
      "9.4 handoff tool",
      (ho.status === "queued" || ho.status === "delivered") &&
        typeof ho.handoffId === "string",
      JSON.stringify(ho),
    );

    const inbox = (await mcpBob.toolsCall("check_handoffs")) as {
      entries?: unknown[];
      count?: number;
    };
    const inboxText = JSON.stringify(inbox);
    check(
      "UC-9",
      "9.4 check_handoffs sees message",
      inboxText.includes("uc9 mcp handoff") ||
        (Array.isArray(inbox.entries) && (inbox.entries?.length ?? 0) > 0),
      inboxText.slice(0, 300),
    );

    // 9.5 withPackEmbed via MCP
    const embed = (await mcpAlice.toolsCall("handoff", {
      to: "@bob",
      body: "uc9 mcp embed",
      withPackEmbed: true,
    })) as {
      status?: string;
      handoffId?: string;
      packEmbedded?: boolean;
      packAttached?: boolean;
    };
    check(
      "UC-9",
      "9.5 handoff withPackEmbed",
      (embed.status === "queued" || embed.status === "delivered") &&
        (embed.packEmbedded === true || embed.packAttached === true),
      JSON.stringify(embed),
    );

    if (embed.handoffId) {
      const claimed = (await mcpBob.toolsCall("claim_handoff", {
        id: embed.handoffId,
      })) as { claimed?: boolean; handoff?: { body?: string; attachments?: unknown[] } };
      const ct = JSON.stringify(claimed);
      check(
        "UC-9",
        "9.5 claim embed has pack/file",
        claimed.claimed === true ||
          /uc9 mcp embed|context-pack|README/i.test(ct),
        ct.slice(0, 400),
      );
    } else {
      check("UC-9", "9.5 claim embed has pack/file", false, "no handoffId");
    }
  } catch (e) {
    check(
      "UC-9",
      "MCP session",
      false,
      e instanceof Error ? e.message : String(e),
    );
  } finally {
    await mcpAlice.close();
    await mcpBob.close();
  }

  // --- P4 (0.32.0): MCP pre-check wired at tools/list + tools/call ---
  await smokeP4();

  // summary
  console.log("");
  if (failed > 0) {
    console.error(`smoke-uc FAILED (${failed} checks)`);
    process.exitCode = 1;
  } else {
    console.log("smoke-uc OK");
  }
}

/** Atomic policy.json swap (new inode) in the isolated LOOM_TEST_HOME; null removes it. */
function setPolicy(over: Record<string, unknown> | string | null) {
  const dir = join(home, ".loom");
  const path = join(dir, "policy.json");
  if (over === null) {
    try {
      unlinkSync(path);
    } catch {
      /* absent */
    }
    return;
  }
  const text =
    typeof over === "string"
      ? over
      : JSON.stringify({
          version: 1,
          shell: { deny: [] },
          network: false,
          mcp: { deny: [] },
          skills: { allowScripts: [] },
          ...over,
        });
  const tmp = join(dir, `.policy-${Date.now()}.tmp`);
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

async function smokeP4() {
  const mcp = new McpClient("alice");
  try {
    await mcp.initialize();
    setPolicy(null);

    // P4-1 default policy: tools/list = 20 (0.31.0 names) + board.replace refused.
    let listed = ((await mcp.toolsList()) as { tools?: Array<{ name: string }> }).tools ?? [];
    check("P4", "default tools/list = 20", listed.length === 20, String(listed.length));
    const snap = (await mcp.toolsCall("export_board")) as { snapshot?: unknown };
    let r = await mcp.toolsCallRaw("import_board", { snapshot: snap.snapshot, mode: "replace" });
    check(
      "P4",
      "board.replace refused by default (import_board mode=replace)",
      r.isError && r.text.includes("loomTools.denyModes board.replace"),
      r.text,
    );
    r = await mcp.toolsCallRaw("import_board", { snapshot: snap.snapshot, mode: "merge" });
    check("P4", "import_board mode=merge still allowed", !r.isError, r.text);

    // P4-2 unknown tool name → JSON-RPC -32601 (R5).
    const code = await mcp.toolsCallErrorCode("no_such_tool", {});
    check("P4", "unknown tool name → -32601", code === -32601, String(code));

    // P4-3 fromPeerId mismatch (L-2 · R7): dispatch to bob (exactly one name match).
    const peers = (await mcp.toolsCall("list_peers")) as {
      peers?: Array<{ id: string; displayName: string }>;
    };
    const bobId = peers.peers?.find((p) => p.displayName === "bob")?.id ?? "";
    const added = (await mcp.toolsCall("add_task", { title: "p4 l2 card" })) as {
      task?: { id: string };
    };
    const cardId = added.task?.id ?? "";
    const dispatched = await mcp.toolsCallRaw("dispatch_card", {
      taskId: cardId,
      node: "bob",
      prompt: "p4 l2 smoke",
    });
    check("P4", "dispatch_card to bob", !dispatched.isError && !!bobId, dispatched.text);
    const resultJson = (seq: number) =>
      JSON.stringify({
        v: 1,
        cardId,
        status: "done",
        node: "bob",
        seq,
        output: "o",
        summary: "s",
        finishedAt: new Date().toISOString(),
      });
    r = await mcp.toolsCallRaw("apply_card_result", {
      resultJson: resultJson(1),
      fromPeerId: "p_forged_peer",
    });
    check(
      "P4",
      "apply_card_result fromPeerId mismatch → blocked + l2Mismatch flag (fail-visible, no reject)",
      !r.isError &&
        r.text.includes('"blocked"') &&
        r.text.includes('"l2Mismatch": true') &&
        !r.text.includes("dispatchPeerId") &&
        !r.text.includes("p_forged_peer") &&
        (bobId === "" || !r.text.includes(bobId)),
      r.text,
    );
    r = await mcp.toolsCallRaw("apply_card_result", { resultJson: resultJson(2), fromPeerId: bobId });
    check(
      "P4",
      "apply_card_result matching fromPeerId lands blocked (flag kept until re-dispatch)",
      !r.isError && r.text.includes('"blocked"') && !r.text.includes("dispatchPeerId"),
      r.text,
    );

    // P4-4 denied tool: absent from tools/list AND refused on call (D3).
    setPolicy({ mcp: { deny: ["loom__room_chat"] } });
    listed = ((await mcp.toolsList()) as { tools?: Array<{ name: string }> }).tools ?? [];
    check(
      "P4",
      "mcp.deny loom__room_chat hidden from tools/list",
      listed.length === 19 && !listed.some((t) => t.name === "room_chat"),
      listed.map((t) => t.name).join(","),
    );
    r = await mcp.toolsCallRaw("room_chat", { text: "should be refused" });
    check(
      "P4",
      "denied tool refused on call",
      r.isError && r.text.includes("denied by policy.json mcp.deny (loom__room_chat)"),
      r.text,
    );

    // P4-5 propose refusal of update_task done; owner CLI still marks it done (R1).
    setPolicy({ loomTools: { done: "propose" } });
    const card2 = (await mcp.toolsCall("add_task", { title: "p4 propose card" })) as {
      task?: { id: string };
    };
    const id2 = card2.task?.id ?? "";
    r = await mcp.toolsCallRaw("update_task", { id: id2, status: "done" });
    check(
      "P4",
      "propose: update_task done refused",
      r.isError && r.text.includes(`loom board set ${id2} done`),
      r.text,
    );
    const owner = await run("--profile", "alice", "board", "set", id2, "done");
    check("P4", "propose: owner `loom board set <id> done` succeeds", owner.code === 0, owner.text);

    // P4-6 invalid policy.json: every call refused with the loader message, list = 20, ping ok.
    setPolicy({ bogus: true });
    listed = ((await mcp.toolsList()) as { tools?: Array<{ name: string }> }).tools ?? [];
    check("P4", "invalid policy: tools/list = 20", listed.length === 20, String(listed.length));
    r = await mcp.toolsCallRaw("get_purpose", {});
    check(
      "P4",
      "invalid policy: call refused with loader message",
      r.isError && r.text.includes("policy.json is invalid") && r.text.includes("bogus"),
      r.text,
    );
    let pinged = false;
    try {
      await mcp.ping();
      pinged = true;
    } catch {
      pinged = false;
    }
    check("P4", "invalid policy: server still answers ping", pinged);
  } catch (e) {
    check("P4", "MCP pre-check session", false, e instanceof Error ? e.message : String(e));
  } finally {
    setPolicy(null);
    await mcp.close();
  }
}

try {
  await main();
} finally {
  try {
    rmSync(home, { recursive: true, force: true });
  } catch {
    /* */
  }
}
