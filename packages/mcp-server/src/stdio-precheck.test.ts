/**
 * PLAN 0.32.0 P4 (D1 · D3 · D8 · D9 · R5 · R6 · R50-M1 · Done-when (f)(h)).
 * The spawned stdio server wires the host pre-check: `tools/list` is filtered by
 * `toolVisible` and `tools/call` is decided by `evaluateMcpCall` — one decision, two
 * surfaces. Policy is re-stat'ed on every list/call (swap reflected on the next call),
 * an invalid policy refuses every call but never kills the server, and the only
 * exit call in packages/mcp-server/src stays the stdin `end` handler.
 */
import { afterEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  addTask,
  parsePolicy,
  resetStateHomeDirCache,
  resolveLoomToolsGate,
  setActiveProfile,
  toolVisible,
  updateTask,
} from "@loom/host";
import { TOOL_DEFINITIONS, toolRegistry } from "./tool-schemas";

type RpcMsg = {
  id?: number;
  result?: {
    tools?: Array<{ name: string }>;
    content?: Array<{ type: string; text: string }>;
    isError?: boolean;
  };
  error?: { code: number; message: string };
};

const ALL_NAMES = TOOL_DEFINITIONS.map((t) => t.name);

/** One schema-valid argument object per tool (no deny mode hit under the built-in policy). */
const VALID_ARGS: Record<string, Record<string, unknown>> = {
  list_peers: {},
  handoff: { to: "@bob", body: "hi" },
  get_context_pack: {},
  get_purpose: {},
  set_purpose: { purpose: "p" },
  list_tasks: {},
  add_task: { title: "t" },
  update_task: { id: "task_abc", status: "doing" },
  export_board: {},
  import_board: { snapshot: { kind: "loom-board-snapshot", tasks: [] }, mode: "merge" },
  room_chat: { text: "x" },
  check_handoffs: {},
  claim_handoff: { id: "ho_abc" },
  dispatch_card: { taskId: "task_abc", node: "bob", prompt: "p" },
  apply_card_result: { resultJson: "{}" },
  conv_open: { node: "bob", goal: "g" },
  conv_send: { convId: "conv_abc", text: "x" },
  conv_await: { convId: "conv_abc", timeoutSec: 1 },
  conv_close: { convId: "conv_abc", reason: "abort" },
  conv_fetch: { convId: "conv_abc", seq: 1, index: 0 },
};

function policyBody(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    shell: { deny: [] },
    network: false,
    mcp: { deny: [] },
    skills: { allowScripts: [] },
    ...over,
  };
}

const homes: string[] = [];

/** The single per-room state dir (`<loom>/rooms/<roomKey>`) — roomKey is not a public export. */
function onlyRoomDir(loom: string): string {
  const rooms = readdirSync(join(loom, "rooms"));
  expect(rooms).toHaveLength(1);
  return join(loom, "rooms", rooms[0] as string);
}

function makeHome(): { home: string; loom: string } {
  const home = mkdtempSync(join(tmpdir(), "loom-mcp-p4-"));
  homes.push(home);
  const loom = join(home, ".loom");
  mkdirSync(join(loom, "profiles"), { recursive: true });
  return { home, loom };
}

/** Atomic swap (new inode) so the re-stat sees a change even within one mtime tick. */
function writePolicyFile(loom: string, json: unknown): void {
  const tmp = join(loom, `.policy.${Math.random().toString(36).slice(2)}.tmp`);
  writeFileSync(tmp, typeof json === "string" ? json : JSON.stringify(json));
  renameSync(tmp, join(loom, "policy.json"));
}

function writeSession(loom: string, roomId: string): string {
  const path = join(loom, "profiles", "p4.json");
  writeFileSync(
    path,
    JSON.stringify({
      roomId,
      roomName: "p4",
      inviteCode: "LOOM-P4",
      peerId: "p_p4",
      displayName: "p4",
      agentKind: "claude",
      relayUrl: "ws://127.0.0.1:1/ws",
      updatedAt: new Date().toISOString(),
    }),
  );
  return path;
}

class StdioServer {
  private proc: ReturnType<typeof Bun.spawn>;
  private buf = "";
  private nextId = 1;
  private waiters = new Map<number, (m: RpcMsg) => void>();
  stderr = "";
  private pumps: Promise<void>[];

  constructor(home: string, session = "") {
    this.proc = Bun.spawn({
      cmd: [process.execPath, "run", join(import.meta.dir, "stdio.ts")],
      cwd: join(import.meta.dir, "..", "..", ".."),
      env: { ...process.env, LOOM_TEST_HOME: home, LOOM_PROFILE: "", LOOM_SESSION: session },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    this.pumps = [this.pumpOut(), this.pumpErr()];
  }

  private async pumpOut(): Promise<void> {
    const reader = (this.proc.stdout as ReadableStream<Uint8Array>).getReader();
    const dec = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      this.buf += dec.decode(value, { stream: true });
      let idx = this.buf.indexOf("\n");
      while (idx >= 0) {
        const line = this.buf.slice(0, idx).trim();
        this.buf = this.buf.slice(idx + 1);
        if (line) {
          const msg = JSON.parse(line) as RpcMsg;
          if (typeof msg.id === "number") {
            this.waiters.get(msg.id)?.(msg);
            this.waiters.delete(msg.id);
          }
        }
        idx = this.buf.indexOf("\n");
      }
    }
  }

  private async pumpErr(): Promise<void> {
    const reader = (this.proc.stderr as ReadableStream<Uint8Array>).getReader();
    const dec = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      this.stderr += dec.decode(value, { stream: true });
    }
  }

  request(method: string, params?: Record<string, unknown>): Promise<RpcMsg> {
    const id = this.nextId++;
    const p = new Promise<RpcMsg>((resolve, reject) => {
      this.waiters.set(id, resolve);
      setTimeout(() => {
        if (this.waiters.delete(id)) reject(new Error(`timeout: ${method}`));
      }, 15_000);
    });
    const stdin = this.proc.stdin as import("bun").FileSink;
    stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params: params ?? {} })}\n`);
    stdin.flush();
    return p;
  }

  async listNames(): Promise<string[]> {
    const r = await this.request("tools/list");
    return (r.result?.tools ?? []).map((t) => t.name);
  }

  async call(name: string, args?: unknown): Promise<RpcMsg> {
    return this.request("tools/call", args === undefined ? { name } : { name, arguments: args });
  }

  async close(): Promise<void> {
    this.proc.kill();
    await this.proc.exited;
    await Promise.allSettled(this.pumps);
  }
}

function textOf(m: RpcMsg): string {
  return m.result?.content?.[0]?.text ?? "";
}

const servers: StdioServer[] = [];
function startServer(home: string, session = ""): StdioServer {
  const s = new StdioServer(home, session);
  servers.push(s);
  return s;
}

afterEach(async () => {
  for (const s of servers.splice(0)) await s.close();
  for (const h of homes.splice(0)) rmSync(h, { recursive: true, force: true });
});

type Fixture = { label: string; policy: unknown | undefined };

const FIXTURES: Fixture[] = [
  { label: "no policy.json (built-in)", policy: undefined },
  { label: "loomTools absent, mcp.deny empty", policy: policyBody() },
  {
    label: "mcp.deny two Loom tools + a foreign entry",
    policy: policyBody({ mcp: { deny: ["loom__room_chat", "loom__conv_fetch", "foo__bar"] } }),
  },
  {
    label: "mcp.deny board + conv tools, propose, all deny modes",
    policy: policyBody({
      mcp: { deny: ["loom__import_board", "loom__update_task", "loom__conv_open", "loom__handoff"] },
      loomTools: {
        done: "propose",
        denyModes: ["board.replace", "broadcast", "conv.writes", "conv.fetch", "pack.embed"],
      },
    }),
  },
  { label: "invalid policy.json (unknown key)", policy: policyBody({ bogus: true }) },
];

function expectedGate(policy: unknown | undefined) {
  if (policy === undefined) return resolveLoomToolsGate(null);
  try {
    return resolveLoomToolsGate(parsePolicy(policy));
  } catch (e) {
    return resolveLoomToolsGate({ invalid: e instanceof Error ? e.message : String(e) });
  }
}

describe("0.32.0 P4 — tools/list and tools/call share one decision (property)", () => {
  for (const fx of FIXTURES) {
    test(`${fx.label}: list == {t : toolVisible}; every non-listed tool refused with valid args`, async () => {
      const { home, loom } = makeHome();
      if (fx.policy !== undefined) writePolicyFile(loom, fx.policy);
      const gate = expectedGate(fx.policy);
      const expected = ALL_NAMES.filter((n) => toolVisible(gate, toolRegistry, n));

      const s = startServer(home);
      const listed = await s.listNames();
      expect(new Set(listed)).toEqual(new Set(expected));
      expect(listed.length).toBe(expected.length);

      for (const name of ALL_NAMES.filter((n) => !listed.includes(n))) {
        const r = await s.call(name, VALID_ARGS[name]);
        expect(r.result?.isError).toBe(true);
        expect(textOf(r)).toContain(`Loom pre-check refused ${name}:`);
        expect(textOf(r)).toContain("mcp.deny");
      }
    }, 60_000);
  }

  test("invalid policy: tools/list == all 20, every call refused with the loader message, ping still answered", async () => {
    const { home, loom } = makeHome();
    writePolicyFile(loom, policyBody({ bogus: true }));
    const s = startServer(home);

    const listed = await s.listNames();
    expect(listed.length).toBe(20);
    expect(new Set(listed)).toEqual(new Set(ALL_NAMES));

    for (const name of ALL_NAMES) {
      const r = await s.call(name, VALID_ARGS[name]);
      expect(r.result?.isError).toBe(true);
      expect(textOf(r)).toContain(`Loom pre-check refused ${name}: policy.json is invalid`);
      expect(textOf(r)).toContain("bogus");
    }
    const ping = await s.request("ping");
    expect(ping.result).toEqual({} as RpcMsg["result"]);
    expect(s.stderr).toContain("reason=policy_invalid");
  }, 60_000);
});

describe("0.32.0 P4 — policy re-stat on every call (D9)", () => {
  test("swap deny → invalid → removed is reflected on the very next list/call; server never exits", async () => {
    const { home, loom } = makeHome();
    const s = startServer(home);

    let r = await s.call("get_purpose", {});
    expect(textOf(r)).not.toContain("Loom pre-check refused");
    expect(await s.listNames()).toContain("get_purpose");

    writePolicyFile(loom, policyBody({ mcp: { deny: ["loom__get_purpose"] } }));
    expect(await s.listNames()).not.toContain("get_purpose");
    r = await s.call("get_purpose", {});
    expect(r.result?.isError).toBe(true);
    expect(textOf(r)).toContain("Loom pre-check refused get_purpose: denied by policy.json mcp.deny");

    writePolicyFile(loom, "{ not json");
    expect((await s.listNames()).length).toBe(20);
    r = await s.call("get_purpose", {});
    expect(r.result?.isError).toBe(true);
    expect(textOf(r)).toContain("policy.json is invalid");

    unlinkSync(join(loom, "policy.json"));
    r = await s.call("get_purpose", {});
    expect(textOf(r)).not.toContain("Loom pre-check refused");
    expect(await s.listNames()).toContain("get_purpose");

    expect((await s.request("ping")).result).toBeDefined();
  }, 60_000);
});

describe("0.32.0 P4 verify round 1 — policy lookup errors fail closed (H)", () => {
  test("absent → dangling symlink refuses every call → dangling removed allows again", async () => {
    const { home, loom } = makeHome();
    const s = startServer(home);
    const link = join(loom, "policy.json");

    let r = await s.call("get_purpose", {});
    expect(textOf(r)).not.toContain("Loom pre-check refused");

    symlinkSync(join(loom, "does-not-exist.json"), link);
    r = await s.call("get_purpose", {});
    expect(r.result?.isError).toBe(true);
    expect(textOf(r)).toContain("Loom pre-check refused get_purpose: policy.json is invalid");
    expect(textOf(r)).toContain("dangling symlink");
    expect((await s.listNames()).length).toBe(20);
    // Still refused on the next call (invalid gate is re-evaluated, never trusted from cache).
    r = await s.call("get_purpose", {});
    expect(r.result?.isError).toBe(true);

    unlinkSync(link);
    r = await s.call("get_purpose", {});
    expect(textOf(r)).not.toContain("Loom pre-check refused");
    expect((await s.request("ping")).result).toBeDefined();
  }, 30_000);

  test("dangling symlink present at server start → refused from the first call", async () => {
    const { home, loom } = makeHome();
    symlinkSync(join(loom, "nowhere.json"), join(loom, "policy.json"));
    const s = startServer(home);
    const r = await s.call("get_purpose", {});
    expect(r.result?.isError).toBe(true);
    expect(textOf(r)).toContain("policy.json is invalid");
  }, 30_000);

  test("symlink to a valid regular file is followed (loadPolicy accepts it) and target edits are seen", async () => {
    const { home, loom } = makeHome();
    const target = join(loom, "real-policy.json");
    writeFileSync(target, JSON.stringify(policyBody({ mcp: { deny: ["loom__get_purpose"] } })));
    symlinkSync(target, join(loom, "policy.json"));
    const s = startServer(home);

    expect(await s.listNames()).not.toContain("get_purpose");
    let r = await s.call("get_purpose", {});
    expect(textOf(r)).toContain("denied by policy.json mcp.deny (loom__get_purpose)");

    // Retarget content (new inode at the target path) — the symlink itself is unchanged.
    const tmp = join(loom, ".real.tmp");
    writeFileSync(tmp, JSON.stringify(policyBody({ mcp: { deny: ["loom__room_chat"] } })));
    renameSync(tmp, target);
    r = await s.call("get_purpose", {});
    expect(textOf(r)).not.toContain("Loom pre-check refused");
    expect(await s.listNames()).not.toContain("room_chat");
  }, 30_000);

  test("policy.json as a directory (non-regular) → refused", async () => {
    const { home, loom } = makeHome();
    const s = startServer(home);
    mkdirSync(join(loom, "policy.json"));
    const r = await s.call("get_purpose", {});
    expect(r.result?.isError).toBe(true);
    expect(textOf(r)).toContain("policy.json is invalid");
  }, 30_000);
});

describe("0.32.0 P4 verify round 2 — absent cache keyed on loomDir state (H)", () => {
  test("absent (cache warm) → loomDir replaced by a dangling symlink → calls refused", async () => {
    const { home, loom } = makeHome();
    const s = startServer(home);
    let r = await s.call("get_purpose", {});
    expect(textOf(r)).not.toContain("Loom pre-check refused");
    r = await s.call("get_purpose", {});
    expect(textOf(r)).not.toContain("Loom pre-check refused");

    renameSync(loom, join(home, ".loom-moved"));
    symlinkSync(join(home, "no-such-dir"), loom);
    r = await s.call("get_purpose", {});
    expect(r.result?.isError).toBe(true);
    expect(textOf(r)).toContain("Loom pre-check refused get_purpose: policy.json is invalid");
    expect(textOf(r)).toContain("dangling symlink");
    expect((await s.listNames()).length).toBe(20);
    expect((await s.request("ping")).result).toBeDefined();
  }, 30_000);

  test("absent (cache warm) → loomDir replaced by a symlink to a real dir → reloaded (loadPolicy follows it)", async () => {
    const { home, loom } = makeHome();
    const s = startServer(home);
    let r = await s.call("get_purpose", {});
    expect(textOf(r)).not.toContain("Loom pre-check refused");

    const real = join(home, "real-loom");
    mkdirSync(real);
    writeFileSync(
      join(real, "policy.json"),
      JSON.stringify(policyBody({ mcp: { deny: ["loom__get_purpose"] } })),
    );
    renameSync(loom, join(home, ".loom-moved"));
    symlinkSync(real, loom);
    r = await s.call("get_purpose", {});
    expect(r.result?.isError).toBe(true);
    expect(textOf(r)).toContain("denied by policy.json mcp.deny (loom__get_purpose)");
    expect(await s.listNames()).not.toContain("get_purpose");
  }, 30_000);

  test("absent (cache warm) → loomDir replaced by a symlink to a real dir without policy.json → still built-in", async () => {
    const { home, loom } = makeHome();
    const s = startServer(home);
    expect(textOf(await s.call("get_purpose", {}))).not.toContain("Loom pre-check refused");
    const real = join(home, "real-loom-empty");
    mkdirSync(real);
    renameSync(loom, join(home, ".loom-moved"));
    symlinkSync(real, loom);
    const r = await s.call("get_purpose", {});
    expect(textOf(r)).not.toContain("Loom pre-check refused");
  }, 30_000);
});

describe("0.32.0 P4 verify round 3 — no cache; missing loomDir parent fails closed (H1 · H2)", () => {
  test("LOOM_TEST_HOME replaced by a dangling symlink (no .loom) → every call refused policy_invalid", async () => {
    const { home } = makeHome();
    const s = startServer(home);
    expect(textOf(await s.call("get_purpose", {}))).not.toContain("Loom pre-check refused");

    const moved = `${home}-moved`;
    homes.push(moved);
    renameSync(home, moved);
    symlinkSync(join(home, "..", "no-such-home-dir"), home);
    const r = await s.call("get_purpose", {});
    expect(r.result?.isError).toBe(true);
    expect(textOf(r)).toContain("Loom pre-check refused get_purpose: policy.json is invalid");
    expect(textOf(r)).toContain("fail-closed");
    expect((await s.listNames()).length).toBe(20);
    expect(s.stderr).toContain("reason=policy_invalid");
    unlinkSync(home);
  }, 30_000);

  test("fresh home with no .loom at all → built-in default (20 tools, calls allowed)", async () => {
    const home = mkdtempSync(join(tmpdir(), "loom-mcp-p4-fresh-"));
    homes.push(home);
    const s = startServer(home);
    expect((await s.listNames()).length).toBe(20);
    const r = await s.call("get_purpose", {});
    expect(textOf(r)).not.toContain("Loom pre-check refused");
    const replace = await s.call("import_board", {
      snapshot: { kind: "loom-board-snapshot", tasks: [] },
      mode: "replace",
    });
    expect(textOf(replace)).toContain("loomTools.denyModes board.replace");
  }, 30_000);

  test("rapid swaps within one tick are never served from a stale gate (loaded every call)", async () => {
    const { home, loom } = makeHome();
    const s = startServer(home);
    for (let i = 0; i < 5; i++) {
      // Same size, rewritten in place (same inode) — a stat-keyed cache could miss these.
      writeFileSync(
        join(loom, "policy.json"),
        JSON.stringify(policyBody({ mcp: { deny: ["loom__get_purpose"] } })),
      );
      expect(textOf(await s.call("get_purpose", {}))).toContain("mcp.deny");
      writeFileSync(
        join(loom, "policy.json"),
        JSON.stringify(policyBody({ mcp: { deny: ["loom__room_chat"] } })).padEnd(
          JSON.stringify(policyBody({ mcp: { deny: ["loom__get_purpose"] } })).length,
          " ",
        ),
      );
      expect(textOf(await s.call("get_purpose", {}))).not.toContain("Loom pre-check refused");
    }
  }, 30_000);
});

describe("0.32.0 P4 verify round 1 — dispatchPeerId never exposed over MCP (L)", () => {
  test("list_tasks / add_task / update_task / import_board / export_board / apply_card_result omit the pin", async () => {
    const { home, loom } = makeHome();
    const session = writeSession(loom, "room_p4_pin");
    // Seed a pinned card in-process against the same isolated home.
    const prevHome = process.env.LOOM_TEST_HOME;
    const prevSession = process.env.LOOM_SESSION;
    process.env.LOOM_TEST_HOME = home;
    process.env.LOOM_SESSION = session;
    resetStateHomeDirCache();
    setActiveProfile(null);
    let taskId = "";
    try {
      taskId = addTask({ title: "pinned", assignee: "node/one", status: "doing" }).id;
      updateTask(taskId, { dispatchPeerId: "p_secret_pin" } as Parameters<typeof updateTask>[1]);
      const raw = readdirSync(join(loom, "boards"))
        .map((f) => readFileSync(join(loom, "boards", f), "utf8"))
        .join("");
      expect(raw).toContain("p_secret_pin");
    } finally {
      if (prevHome === undefined) delete process.env.LOOM_TEST_HOME;
      else process.env.LOOM_TEST_HOME = prevHome;
      if (prevSession === undefined) delete process.env.LOOM_SESSION;
      else process.env.LOOM_SESSION = prevSession;
      resetStateHomeDirCache();
    }

    const s = startServer(home, session);
    const responses = [
      await s.call("list_tasks", {}),
      await s.call("add_task", { title: "another" }),
      await s.call("update_task", { id: taskId, notes: "n" }),
      await s.call("export_board", {}),
      await s.call("import_board", {
        snapshot: { kind: "loom-board-snapshot", sourceRoomId: "room_p4_pin", tasks: [] },
        mode: "merge",
      }),
      await s.call("apply_card_result", {
        resultJson: JSON.stringify({
          v: 1,
          cardId: taskId,
          status: "done",
          node: "node/one",
          seq: 1,
          output: "o",
          summary: "s",
          finishedAt: new Date().toISOString(),
        }),
        fromPeerId: "p_secret_pin",
      }),
      await s.call("list_tasks", {}),
    ];
    for (const r of responses) {
      expect(r.result?.isError).toBe(false);
      expect(textOf(r)).not.toContain("dispatchPeerId");
      expect(textOf(r)).not.toContain("p_secret_pin");
    }
    expect(textOf(responses[0] as RpcMsg)).toContain(taskId);
  }, 30_000);
});

describe("0.32.0 P4 — unknown tool names (R5)", () => {
  test("valid policy: unknown name → JSON-RPC -32601 (not isError) + one stderr refusal line", async () => {
    const { home } = makeHome();
    const s = startServer(home);
    const r = await s.call("no_such_tool", {});
    expect(r.error?.code).toBe(-32601);
    expect(r.result).toBeUndefined();
    expect(s.stderr).toContain("[loom-mcp] precheck refused tool=no_such_tool reason=unknown_tool");
  }, 30_000);

  test("invalid policy: unknown name → isError policy_invalid (step 1 precedes the unknown-tool step)", async () => {
    const { home, loom } = makeHome();
    writePolicyFile(loom, policyBody({ bogus: true }));
    const s = startServer(home);
    const r = await s.call("no_such_tool", {});
    expect(r.error).toBeUndefined();
    expect(r.result?.isError).toBe(true);
    expect(textOf(r)).toContain("Loom pre-check refused no_such_tool: policy.json is invalid");
  }, 30_000);
});

describe("0.32.0 P4 — default policy differences + audit (D4 · D5 · D8 · Done-when (h))", () => {
  test("built-in: import_board mode=replace refused (board.replace); merge is not; stderr + audit line", async () => {
    const { home, loom } = makeHome();
    const session = writeSession(loom, "room_p4_audit");
    const s = startServer(home, session);

    const snap = { kind: "loom-board-snapshot", sourceRoomId: "room_p4_audit", tasks: [] };
    const replace = await s.call("import_board", { snapshot: snap, mode: "replace" });
    expect(replace.result?.isError).toBe(true);
    expect(textOf(replace)).toContain("Loom pre-check refused import_board:");
    expect(textOf(replace)).toContain("loomTools.denyModes board.replace");
    expect(textOf(replace)).toContain("loom board import --replace");
    expect(s.stderr).toContain(
      "[loom-mcp] precheck refused tool=import_board reason=deny_mode:board.replace",
    );

    const merge = await s.call("import_board", { snapshot: snap, mode: "merge" });
    expect(textOf(merge)).not.toContain("Loom pre-check refused");
    expect(merge.result?.isError).toBe(false);

    const auditPath = join(onlyRoomDir(loom), "policy-audit.jsonl");
    expect(existsSync(auditPath)).toBe(true);
    const lines = readFileSync(auditPath, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      v: 1,
      kind: "refused",
      tool: "import_board",
      reason: "deny_mode:board.replace",
      mode: "board.replace",
      peerId: "p_p4",
      roomId: "room_p4_audit",
      agentKind: "claude",
    });
  }, 30_000);

  test("allow (default): update_task done dispatches and appends done_via_mcp only after success", async () => {
    const { home, loom } = makeHome();
    const session = writeSession(loom, "room_p4_done");
    const s = startServer(home, session);

    const added = await s.call("add_task", { title: "p4 done card" });
    expect(added.result?.isError).toBe(false);
    const taskId = (JSON.parse(textOf(added)) as { task: { id: string } }).task.id;

    // Dispatch throws (no such task) → no done_via_mcp record.
    const missing = await s.call("update_task", { id: "task_ffffffff", status: "done" });
    expect(missing.result?.isError).toBe(true);
    expect(textOf(missing)).not.toContain("Loom pre-check refused");

    const done = await s.call("update_task", { id: taskId, status: "done" });
    expect(done.result?.isError).toBe(false);
    expect((JSON.parse(textOf(done)) as { task: { status: string } }).task.status).toBe("done");

    const roomDir = onlyRoomDir(loom);
    const lines = readFileSync(join(roomDir, "policy-audit.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ kind: "done_via_mcp", tool: "update_task", cardId: taskId });
    expect(readdirSync(roomDir)).not.toContain("events");
  }, 30_000);

  test("propose: update_task done refused with the owner CLI path; non-done status allowed", async () => {
    const { home, loom } = makeHome();
    const session = writeSession(loom, "room_p4_propose");
    writePolicyFile(loom, policyBody({ loomTools: { done: "propose" } }));
    const s = startServer(home, session);

    const added = await s.call("add_task", { title: "p4 propose card" });
    const taskId = (JSON.parse(textOf(added)) as { task: { id: string } }).task.id;

    const refused = await s.call("update_task", { id: taskId, status: "done" });
    expect(refused.result?.isError).toBe(true);
    expect(textOf(refused)).toContain(`loom board set ${taskId} done`);
    expect(s.stderr).toContain("[loom-mcp] precheck refused tool=update_task reason=done_propose");

    const blocked = await s.call("update_task", { id: taskId, status: "blocked" });
    expect(blocked.result?.isError).toBe(false);
  }, 30_000);
});

describe("0.32.0 P4 — server never exits on policy errors (D9 · Done-when (f))", () => {
  test("packages/mcp-server/src (non-test) has exactly one exit call — the stdin end handler", () => {
    const needle = ["process", "exit"].join(".");
    const srcDir = import.meta.dir;
    const hits: string[] = [];
    for (const f of readdirSync(srcDir)) {
      if (!f.endsWith(".ts") || f.endsWith(".test.ts")) continue;
      const lines = readFileSync(join(srcDir, f), "utf8").split("\n");
      lines.forEach((line, i) => {
        if (line.includes(needle)) hits.push(`${f}:${i + 1}:${line.trim()}`);
      });
    }
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatch(/^stdio\.ts:\d+:process\.stdin\.on\("end", \(\) => process\.exit\(0\)\);$/);
  });
});
