/**
 * PLAN 0.32.0 P3 (D2 · R3 · Done-when (e)): zod is the single source of truth for the
 * 20 Loom MCP tools' arguments. Advertised inputSchema == derived == committed snapshot,
 * and the only difference from the 0.31.0 advertised TOOLS is `additionalProperties:false`.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import baselineJson from "./__fixtures__/tools-0.31.0.json";
import snapshotJson from "./__fixtures__/tools.snapshot.json";
import { TOOL_DEFINITIONS, toJsonSchema, toolRegistry, toolSchemas } from "./tool-schemas";

type ToolDef = { name: string; description: string; inputSchema: Record<string, unknown> };

const baseline031 = baselineJson as unknown as ToolDef[];
const snapshot = snapshotJson as unknown as ToolDef[];
const derived: ToolDef[] = TOOL_DEFINITIONS;

/** 0.31.0 advertised TOOLS + `additionalProperties:false` on each top-level object, nothing else. */
function withTopLevelAdditionalPropertiesFalse(tools: ToolDef[]): ToolDef[] {
  return tools.map((t) => ({
    ...t,
    inputSchema: { ...t.inputSchema, additionalProperties: false },
  }));
}

type Case = {
  valid: unknown;
  wrongType: { args: unknown; path: string; code: string };
};

/** Per tool: one valid example and one wrong-type case (unknown-key case is derived from `valid`). */
const CASES: Record<string, Case> = {
  list_peers: { valid: {}, wrongType: { args: "x", path: "(root)", code: "invalid_type" } },
  handoff: {
    valid: {
      to: "@bob",
      body: "hi",
      mode: "task",
      withPack: true,
      withPackEmbed: false,
      withBoard: false,
      trackBoard: true,
    },
    wrongType: { args: { to: "@bob", body: 42 }, path: "body", code: "invalid_type" },
  },
  get_context_pack: { valid: {}, wrongType: { args: [], path: "(root)", code: "invalid_type" } },
  get_purpose: { valid: {}, wrongType: { args: 7, path: "(root)", code: "invalid_type" } },
  set_purpose: {
    valid: { purpose: "p", successCriteria: ["a"], outOfScope: ["b"], notes: "n" },
    wrongType: {
      args: { successCriteria: ["a", 1] },
      path: "successCriteria.1",
      code: "invalid_type",
    },
  },
  list_tasks: { valid: {}, wrongType: { args: null, path: "(root)", code: "invalid_type" } },
  add_task: {
    valid: { title: "t", assignee: "@a", status: "doing", notes: "n", notify: false },
    wrongType: { args: { title: "t", notify: "true" }, path: "notify", code: "invalid_type" },
  },
  update_task: {
    valid: { id: "task_1", status: "done", assignee: "@a", title: "t", notes: "n" },
    wrongType: {
      args: { id: "task_1", status: "finished" },
      path: "status",
      code: "invalid_enum_value",
    },
  },
  export_board: { valid: {}, wrongType: { args: true, path: "(root)", code: "invalid_type" } },
  import_board: {
    // R50-L1: free-form nested object — unknown nested keys are NOT checked.
    valid: {
      snapshot: { kind: "loom-board-snapshot", tasks: [{ id: "t", extra: 1 }], whatever: true },
      mode: "merge",
      force: false,
    },
    wrongType: { args: { snapshot: "{}" }, path: "snapshot", code: "invalid_type" },
  },
  room_chat: {
    valid: { text: "hi" },
    wrongType: { args: { text: 5 }, path: "text", code: "invalid_type" },
  },
  check_handoffs: { valid: {}, wrongType: { args: "[]", path: "(root)", code: "invalid_type" } },
  claim_handoff: {
    valid: { id: "ho_1" },
    wrongType: { args: { id: 1 }, path: "id", code: "invalid_type" },
  },
  dispatch_card: {
    valid: { taskId: "task_1", node: "node/wsl-1", prompt: "p", agentKind: "claude" },
    wrongType: {
      args: { taskId: "task_1", node: "n", prompt: "p", agentKind: 3 },
      path: "agentKind",
      code: "invalid_type",
    },
  },
  apply_card_result: {
    valid: { resultJson: "{}", fromPeerId: "peer_1", fromNode: "node/wsl-1" },
    wrongType: { args: { resultJson: {} }, path: "resultJson", code: "invalid_type" },
  },
  conv_open: {
    valid: {
      node: "node/wsl-1",
      goal: "g",
      cwd: "/tmp",
      writesAllowed: false,
      maxTurns: 5,
      wallClockMs: 1000,
      agentKind: "codex",
    },
    wrongType: {
      args: { node: "n", goal: "g", maxTurns: "5" },
      path: "maxTurns",
      code: "invalid_type",
    },
  },
  conv_send: {
    valid: {
      convId: "conv_1",
      text: "t",
      kind: "done_proposal",
      artifacts: [{ transport: "scp", anything: { nested: 1 } }],
    },
    wrongType: {
      args: { convId: "conv_1", text: "t", artifacts: ["x"] },
      path: "artifacts.0",
      code: "invalid_type",
    },
  },
  conv_await: {
    valid: { convId: "conv_1", timeoutSec: 30 },
    wrongType: { args: { timeoutSec: "30" }, path: "timeoutSec", code: "invalid_type" },
  },
  conv_close: {
    valid: { convId: "conv_1", reason: "abort" },
    wrongType: {
      args: { convId: "conv_1", reason: "cancel" },
      path: "reason",
      code: "invalid_enum_value",
    },
  },
  conv_fetch: {
    valid: { convId: "conv_1", seq: 1, index: 0 },
    wrongType: { args: { convId: "conv_1", seq: "1", index: 0 }, path: "seq", code: "invalid_type" },
  },
};

describe("0.32.0 P3 — derived inputSchema snapshot (advertised == enforced)", () => {
  test("baseline fixture is the 0.31.0 advertised TOOLS (20 tools)", () => {
    expect(baseline031).toHaveLength(20);
  });

  test("committed snapshot == 0.31.0 advertised + additionalProperties:false only", () => {
    expect(snapshot).toEqual(withTopLevelAdditionalPropertiesFalse(baseline031));
  });

  test("derived TOOL_DEFINITIONS == committed snapshot (names, order, descriptions, schemas)", () => {
    expect(derived).toEqual(snapshot);
    expect(derived.map((t) => t.name)).toEqual(baseline031.map((t) => t.name));
  });

  test("each tool's derived inputSchema == toJsonSchema(zod schema)", () => {
    for (const t of TOOL_DEFINITIONS) {
      const schema = toolSchemas[t.name as keyof typeof toolSchemas];
      expect(schema).toBeDefined();
      expect(toJsonSchema(schema)).toEqual(t.inputSchema);
    }
  });

  test("all 20 tools are zod .strict() objects at the top level", () => {
    const names = Object.keys(toolSchemas);
    expect(names).toHaveLength(20);
    for (const name of names) {
      const schema = toolSchemas[name as keyof typeof toolSchemas] as unknown as z.ZodTypeAny;
      expect(schema).toBeInstanceOf(z.ZodObject);
      expect((schema as z.AnyZodObject)._def.unknownKeys).toBe("strict");
    }
  });

  test("every tool has a validation case", () => {
    expect(Object.keys(CASES).sort()).toEqual(Object.keys(toolSchemas).sort());
  });
});

describe("0.32.0 P3 — converter closed subset", () => {
  test("supported nodes convert", () => {
    expect(
      toJsonSchema(
        z
          .object({
            s: z.string().describe("d"),
            n: z.number().optional(),
            b: z.boolean(),
            e: z.enum(["a", "b"]),
            a: z.array(z.string()),
            r: z.record(z.unknown()).describe("free"),
          })
          .strict(),
      ),
    ).toEqual({
      type: "object",
      properties: {
        s: { type: "string", description: "d" },
        n: { type: "number" },
        b: { type: "boolean" },
        e: { type: "string", enum: ["a", "b"] },
        a: { type: "array", items: { type: "string" } },
        r: { type: "object", description: "free" },
      },
      required: ["s", "b", "e", "a", "r"],
      additionalProperties: false,
    });
  });

  test("a __proto__ property is advertised (prototype-free properties map)", () => {
    const out = toJsonSchema(z.object({ ["__proto__"]: z.string() }).strict());
    const props = out.properties as Record<string, unknown>;
    expect(Object.keys(props)).toEqual(["__proto__"]);
    expect(Object.getOwnPropertyDescriptor(props, "__proto__")?.value).toEqual({ type: "string" });
    expect(out.required).toEqual(["__proto__"]);
    expect(JSON.parse(JSON.stringify(out)).properties).toHaveProperty(["__proto__"]);
  });

  const unsupported: [string, z.ZodTypeAny][] = [
    ["union", z.union([z.string(), z.number()])],
    ["nullable", z.string().nullable()],
    ["default", z.string().default("x")],
    ["literal", z.literal("x")],
    ["effects", z.string().transform((s) => s.length)],
    ["string with checks", z.string().min(1)],
    ["number with checks", z.number().int()],
    ["record of non-unknown", z.record(z.string())],
    ["array with length checks", z.array(z.string()).min(1)],
    ["nested unsupported", z.object({ x: z.union([z.string(), z.number()]) }).strict()],
  ];
  for (const [label, node] of unsupported) {
    test(`unsupported zod node throws: ${label}`, () => {
      expect(() => toJsonSchema(node)).toThrow();
    });
  }
});

describe("0.32.0 P3 — toolRegistry strict validation", () => {
  test("has(): known vs unknown names", () => {
    expect(toolRegistry.has("list_peers")).toBe(true);
    expect(toolRegistry.has("conv_fetch")).toBe(true);
    expect(toolRegistry.has("nope")).toBe(false);
  });

  for (const [name, c] of Object.entries(CASES)) {
    test(`${name}: valid example passes and returns parsed args`, () => {
      const r = toolRegistry.validate(name, c.valid);
      expect(r).toEqual({ ok: true, args: c.valid as Record<string, unknown> });
    });

    test(`${name}: wrong type → invalid path + code`, () => {
      const r = toolRegistry.validate(name, c.wrongType.args);
      expect(r).toEqual({ ok: false, path: c.wrongType.path, code: c.wrongType.code });
    });

    test(`${name}: unknown key → unrecognized_keys`, () => {
      const r = toolRegistry.validate(name, {
        ...(c.valid as Record<string, unknown>),
        bogusKey: "SECRET_VALUE_1",
      });
      expect(r).toEqual({ ok: false, path: "bogusKey", code: "unrecognized_keys" });
      expect(JSON.stringify(r)).not.toContain("SECRET_VALUE_1");
    });
  }

  const NO_REQUIRED_ARG_TOOLS = [
    "list_peers",
    "get_context_pack",
    "get_purpose",
    "set_purpose",
    "list_tasks",
    "export_board",
    "check_handoffs",
    "conv_await",
  ];
  test("the 8 no-required-arg tools are exactly those without `required`", () => {
    expect(derived.filter((t) => !("required" in t.inputSchema)).map((t) => t.name)).toEqual(
      NO_REQUIRED_ARG_TOOLS,
    );
  });
  for (const name of NO_REQUIRED_ARG_TOOLS) {
    test(`${name}: explicit null args → invalid_type at (root) (not defaulted to {})`, () => {
      expect(toolRegistry.validate(name, null)).toEqual({
        ok: false,
        path: "(root)",
        code: "invalid_type",
      });
    });
  }

  test("unknown-key echo is capped: 200,000-char key → 32 chars + …", () => {
    const huge = "k".repeat(200_000);
    const r = toolRegistry.validate("list_peers", { [huge]: 1 });
    expect(r).toEqual({ ok: false, path: `${"k".repeat(32)}…`, code: "unrecognized_keys" });
  });

  test("unknown-key echo is capped: 10 keys → first 3 names + +7, total ≤ 128", () => {
    const args: Record<string, unknown> = {};
    for (let i = 0; i < 10; i++) args[`key${i}_${"x".repeat(40)}`] = i;
    const r = toolRegistry.validate("room_chat", { text: "t", ...args });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("unrecognized_keys");
    const cut = (i: number) => `key${i}_${"x".repeat(40)}`.slice(0, 32);
    expect(r.path).toBe(`${cut(0)}…,${cut(1)}…,${cut(2)}…,+7`);
    expect(r.path.length).toBeLessThanOrEqual(128);
  });

  test("unknown-key echo stays ≤ 128 UTF-16 units with astral (emoji) keys", () => {
    const args: Record<string, unknown> = {};
    for (let i = 0; i < 5; i++) args[`${i}${"😀".repeat(100)}`] = i;
    const r = toolRegistry.validate("list_tasks", args);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.path.length).toBeLessThanOrEqual(128);
    expect(r.path).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
    expect(r.path.endsWith(",+2")).toBe(true);
  });

  test("args undefined is treated as {}", () => {
    expect(toolRegistry.validate("list_peers", undefined)).toEqual({ ok: true, args: {} });
    expect(toolRegistry.validate("handoff", undefined)).toEqual({
      ok: false,
      path: "to",
      code: "invalid_type",
    });
  });

  test("missing required → invalid_type at that path", () => {
    expect(toolRegistry.validate("conv_fetch", { convId: "c", seq: 1 })).toEqual({
      ok: false,
      path: "index",
      code: "invalid_type",
    });
  });

  test("set_purpose verify[] (M-24) is an unknown key now", () => {
    expect(toolRegistry.validate("set_purpose", { verify: ["bun test"] })).toEqual({
      ok: false,
      path: "verify",
      code: "unrecognized_keys",
    });
  });

  test("failure result never echoes the offending value", () => {
    const r = toolRegistry.validate("update_task", { id: "task_1", status: "SECRET_ENUM_VALUE" });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain("SECRET_ENUM_VALUE");
  });
});

// ── spawn-level: the real stdio server advertises the derived TOOLS and refuses invalid args ──

type RpcMsg = {
  id?: number;
  result?: { tools?: unknown; content?: { type: string; text: string }[]; isError?: boolean };
  error?: { code: number; message: string };
};

async function rpcSession(requests: { method: string; params?: unknown }[]): Promise<RpcMsg[]> {
  const home = mkdtempSync(join(tmpdir(), "loom-mcp-p3-"));
  const proc = Bun.spawn({
    cmd: [process.execPath, "run", join(import.meta.dir, "stdio.ts")],
    cwd: join(import.meta.dir, "..", "..", ".."),
    env: { ...process.env, LOOM_TEST_HOME: home, LOOM_PROFILE: "", LOOM_SESSION: "" },
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  try {
    for (const [i, r] of requests.entries()) {
      proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: i + 1, ...r })}\n`);
    }
    await proc.stdin.flush();
    const byId = new Map<number, RpcMsg>();
    const reader = proc.stdout.getReader();
    const dec = new TextDecoder();
    let buf = "";
    const deadline = Date.now() + 15_000;
    while (byId.size < requests.length && Date.now() < deadline) {
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
    return requests.map((_, i) => byId.get(i + 1) ?? {});
  } finally {
    proc.kill();
    await proc.exited;
    rmSync(home, { recursive: true, force: true });
  }
}

describe("0.32.0 P3 — stdio server (spawned, isolated LOOM_TEST_HOME)", () => {
  test("tools/list == derived; invalid args → isError invalid_args; unknown → -32601; valid → dispatch", async () => {
    const [list, wrongType, unknownKey, unknownTool, valid, nullArgs, omittedArgs] = await rpcSession([
      { method: "tools/list" },
      { method: "tools/call", params: { name: "room_chat", arguments: { text: 5 } } },
      {
        method: "tools/call",
        params: {
          name: "update_task",
          arguments: { id: "task_1", status: "done", zzz: "SECRET_VALUE_2" },
        },
      },
      { method: "tools/call", params: { name: "no_such_tool", arguments: {} } },
      { method: "tools/call", params: { name: "get_purpose", arguments: {} } },
      { method: "tools/call", params: { name: "get_purpose", arguments: null } },
      { method: "tools/call", params: { name: "get_purpose" } },
    ]);

    expect(list.result?.tools).toEqual(TOOL_DEFINITIONS);
    expect(list.result?.tools).toEqual(snapshot);

    expect(wrongType.result?.isError).toBe(true);
    const t1 = wrongType.result?.content?.[0]?.text ?? "";
    // P4: refusal text is the evaluator's message (reason code invalid_args → stderr + audit).
    expect(t1).toContain("Loom pre-check refused room_chat: invalid arguments at text (invalid_type)");

    expect(unknownKey.result?.isError).toBe(true);
    const t2 = unknownKey.result?.content?.[0]?.text ?? "";
    expect(t2).toContain("Loom pre-check refused update_task: invalid arguments at zzz");
    expect(t2).toContain("unrecognized_keys");
    expect(t2).not.toContain("SECRET_VALUE_2");

    expect(unknownTool.error?.code).toBe(-32601);

    const t3 = valid.result?.content?.[0]?.text ?? "";
    expect(valid.result).toBeDefined();
    expect(t3).not.toContain("Loom pre-check refused");

    // explicit `arguments: null` is validated (refused), only omitted arguments default to {}
    expect(nullArgs.result?.isError).toBe(true);
    expect(nullArgs.result?.content?.[0]?.text ?? "").toContain("invalid arguments at (root) (invalid_type)");
    expect(omittedArgs.result).toBeDefined();
    expect(omittedArgs.result?.content?.[0]?.text ?? "").not.toContain("Loom pre-check refused");
  }, 30_000);
});
