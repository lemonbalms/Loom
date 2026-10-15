/**
 * PLAN 0.32.0 P4 — R1 · D4b · D5 · Done-when (g).
 * The human done path is the existing host-owned CLI write (`loom board set <id> done`),
 * not MCP. Under `loomTools.done: "propose"` the Loom MCP server refuses
 * `update_task status=done`, while the owner's CLI still marks the same card done.
 * `loom board import --replace` (the owner path for board.replace) is unchanged.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..", "..", "..");
const cliEntry = join(repoRoot, "packages", "cli", "src", "index.ts");
const stdioEntry = join(repoRoot, "packages", "mcp-server", "src", "stdio.ts");

type RpcMsg = {
  id?: number;
  result?: { content?: Array<{ text: string }>; isError?: boolean };
  error?: { code: number; message: string };
};

let home = "";
let loom = "";
let sessionFile = "";

function env(): Record<string, string> {
  return {
    ...(process.env as Record<string, string>),
    LOOM_TEST_HOME: home,
    LOOM_PROFILE: "",
    LOOM_SESSION: sessionFile,
    LOOM_NO_AUTO_HOST: "1",
  };
}

/** One-shot MCP session: send all tools/call requests, collect the responses by id. */
async function mcpCalls(calls: Array<{ name: string; arguments: unknown }>): Promise<RpcMsg[]> {
  const proc = Bun.spawn({
    cmd: [process.execPath, "run", stdioEntry],
    cwd: repoRoot,
    env: env(),
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  try {
    calls.forEach((params, i) => {
      proc.stdin.write(
        `${JSON.stringify({ jsonrpc: "2.0", id: i + 1, method: "tools/call", params })}\n`,
      );
    });
    await proc.stdin.flush();
    const byId = new Map<number, RpcMsg>();
    const reader = proc.stdout.getReader();
    const dec = new TextDecoder();
    let buf = "";
    const deadline = Date.now() + 15_000;
    while (byId.size < calls.length && Date.now() < deadline) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx = buf.indexOf("\n");
      while (idx >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (line) {
          const msg = JSON.parse(line) as RpcMsg;
          if (typeof msg.id === "number") byId.set(msg.id, msg);
        }
        idx = buf.indexOf("\n");
      }
    }
    return calls.map((_, i) => byId.get(i + 1) ?? {});
  } finally {
    proc.kill();
    await proc.exited;
  }
}

async function cli(...args: string[]): Promise<{ code: number; text: string }> {
  const p = Bun.spawn({
    cmd: [process.execPath, "run", cliEntry, ...args],
    cwd: repoRoot,
    env: env(),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, out, err] = await Promise.all([
    p.exited,
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
  ]);
  return { code, text: `${out}\n${err}` };
}

function textOf(m: RpcMsg): string {
  return m.result?.content?.[0]?.text ?? "";
}

function writePolicy(over: Record<string, unknown>): void {
  writeFileSync(
    join(loom, "policy.json"),
    JSON.stringify({
      version: 1,
      shell: { deny: [] },
      network: false,
      mcp: { deny: [] },
      skills: { allowScripts: [] },
      ...over,
    }),
  );
}

beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), "loom-cli-done-path-"));
  loom = join(home, ".loom");
  mkdirSync(join(loom, "profiles"), { recursive: true });
  sessionFile = join(loom, "profiles", "owner.json");
  writeFileSync(
    sessionFile,
    JSON.stringify({
      roomId: "room_cli_done_path",
      roomName: "cli-done-path",
      inviteCode: "LOOM-TEST",
      peerId: "p_owner",
      displayName: "owner",
      agentKind: "claude",
      relayUrl: "ws://127.0.0.1:1/ws",
      updatedAt: new Date().toISOString(),
    }),
  );
});

afterAll(() => {
  rmSync(home, { recursive: true, force: true });
});

describe("0.32.0 P4 — human done path under loomTools.done=propose (R1)", () => {
  test("MCP update_task status=done is refused; `loom board set <id> done` on the same card succeeds", async () => {
    writePolicy({ loomTools: { done: "propose" } });

    const [added] = await mcpCalls([{ name: "add_task", arguments: { title: "human done path" } }]);
    expect(added?.result?.isError).toBe(false);
    const taskId = (JSON.parse(textOf(added as RpcMsg)) as { task: { id: string } }).task.id;

    const [refused, listed] = await mcpCalls([
      { name: "update_task", arguments: { id: taskId, status: "done" } },
      { name: "list_tasks", arguments: {} },
    ]);
    expect(refused?.result?.isError).toBe(true);
    expect(textOf(refused as RpcMsg)).toContain("Loom pre-check refused update_task:");
    expect(textOf(refused as RpcMsg)).toContain(`loom board set ${taskId} done`);
    const before = JSON.parse(textOf(listed as RpcMsg)) as {
      board: { tasks: Array<{ id: string; status: string }> };
    };
    expect(before.board.tasks.find((t) => t.id === taskId)?.status).toBe("todo");

    const r = await cli("board", "set", taskId, "done");
    expect(r.code).toBe(0);
    expect(r.text).toContain(`updated ${taskId} → done`);

    const [after] = await mcpCalls([{ name: "list_tasks", arguments: {} }]);
    const board = JSON.parse(textOf(after as RpcMsg)) as {
      board: { tasks: Array<{ id: string; status: string }> };
    };
    expect(board.board.tasks.find((t) => t.id === taskId)?.status).toBe("done");
  }, 60_000);

  test("board.replace: MCP import_board mode=replace refused by default; `loom board import --replace` unchanged", async () => {
    writePolicy({});
    const snapshotPath = join(home, "snap.json");
    writeFileSync(
      snapshotPath,
      JSON.stringify({
        v: 1,
        kind: "loom-board-snapshot",
        exportedAt: new Date().toISOString(),
        sourceRoomId: "room_cli_done_path",
        tasks: [
          {
            id: "task_0a0b0c0d",
            title: "replaced by owner",
            status: "todo",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      }),
    );
    const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as unknown;

    const [refused] = await mcpCalls([
      { name: "import_board", arguments: { snapshot, mode: "replace" } },
    ]);
    expect(refused?.result?.isError).toBe(true);
    expect(textOf(refused as RpcMsg)).toContain("loom board import --replace");

    const r = await cli("board", "import", snapshotPath, "--replace");
    expect(r.code).toBe(0);

    const [after] = await mcpCalls([{ name: "list_tasks", arguments: {} }]);
    const board = JSON.parse(textOf(after as RpcMsg)) as {
      board: { tasks: Array<{ id: string; title: string }> };
    };
    expect(board.board.tasks.map((t) => t.id)).toEqual(["task_0a0b0c0d"]);
  }, 60_000);
});
