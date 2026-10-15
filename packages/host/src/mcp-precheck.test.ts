/**
 * PLAN 0.32.0 P2 — Done-when (c) / D1 / D3 / D4 / D5 / R2 / R4 / R5 / R6 / R50-M1 / R50-L1 / R50-L2.
 * Pure Loom MCP pre-check: tool × mode × policy table, step-order precedence,
 * invalid-policy behaviour, and the toolVisible / evaluateMcpCall agreement.
 *
 * Architect amendment (P2): the tool registry (name set + arg schemas) lives in
 * packages/mcp-server and is INJECTED; this file uses a fake ToolRegistry.
 */
import { describe, expect, test } from "bun:test";
import * as host from "./index";
import {
  evaluateMcpCall,
  type LoomToolsGate,
  type McpCallCtx,
  type McpCallDecision,
  resolveLoomToolsGate,
  type ToolRegistry,
  toolVisible,
} from "./mcp-precheck";
import type { LoomDenyMode, PolicyV1 } from "./policy";

/** The 20 tools advertised by packages/mcp-server/src/stdio.ts (0.31.0). */
const TOOL_NAMES = [
  "list_peers",
  "handoff",
  "get_context_pack",
  "get_purpose",
  "set_purpose",
  "list_tasks",
  "add_task",
  "update_task",
  "export_board",
  "import_board",
  "room_chat",
  "check_handoffs",
  "claim_handoff",
  "dispatch_card",
  "apply_card_result",
  "conv_open",
  "conv_send",
  "conv_await",
  "conv_close",
  "conv_fetch",
] as const;

const ALL_MODES: LoomDenyMode[] = [
  "board.replace",
  "broadcast",
  "conv.fetch",
  "conv.writes",
  "pack.embed",
];

type FieldType = "string" | "boolean" | "number" | "object" | readonly string[];
type ToolSpec = { props: Record<string, FieldType>; required: string[] };

const STATUS = ["todo", "doing", "done", "blocked", "cancelled"] as const;

/** Fake strict schemas mirroring stdio.ts for the tools the pre-check reads. */
const SPECS: Record<string, ToolSpec> = {
  handoff: {
    props: {
      to: "string",
      body: "string",
      mode: ["message", "task"],
      withPack: "boolean",
      withPackEmbed: "boolean",
      withBoard: "boolean",
      trackBoard: "boolean",
    },
    required: ["to", "body"],
  },
  add_task: {
    props: {
      title: "string",
      assignee: "string",
      status: STATUS,
      notes: "string",
      notify: "boolean",
    },
    required: ["title"],
  },
  update_task: {
    props: { id: "string", status: STATUS, assignee: "string", title: "string", notes: "string" },
    required: ["id"],
  },
  import_board: {
    props: { snapshot: "object", mode: ["merge", "replace"], force: "boolean" },
    required: ["snapshot"],
  },
  conv_open: {
    props: {
      node: "string",
      goal: "string",
      cwd: "string",
      writesAllowed: "boolean",
      maxTurns: "number",
      wallClockMs: "number",
      agentKind: "string",
    },
    required: ["node", "goal"],
  },
  conv_close: {
    props: { convId: "string", reason: ["done", "abort"] },
    required: ["convId"],
  },
  conv_fetch: {
    props: { convId: "string", seq: "number", index: "number" },
    required: ["convId", "seq", "index"],
  },
  room_chat: { props: { text: "string" }, required: ["text"] },
};

function checkField(t: FieldType, v: unknown): string | null {
  if (Array.isArray(t)) return typeof v === "string" && t.includes(v) ? null : "invalid_enum_value";
  if (t === "object") {
    return v !== null && typeof v === "object" && !Array.isArray(v) ? null : "invalid_type";
  }
  return typeof v === t ? null : "invalid_type";
}

type Calls = { has: string[]; validate: string[] };

function fakeRegistry(calls: Calls = { has: [], validate: [] }): ToolRegistry & { calls: Calls } {
  const names = new Set<string>(TOOL_NAMES);
  return {
    calls,
    has(name: string) {
      calls.has.push(name);
      return names.has(name);
    },
    validate(name: string, args: unknown) {
      calls.validate.push(name);
      if (args === null || typeof args !== "object" || Array.isArray(args)) {
        return { ok: false, path: "", code: "invalid_type" };
      }
      const obj = args as Record<string, unknown>;
      const spec = SPECS[name];
      if (!spec) return { ok: true, args: { ...obj } };
      for (const key of Object.keys(obj)) {
        if (!Object.hasOwn(spec.props, key))
          return { ok: false, path: key, code: "unrecognized_keys" };
        const issue = checkField(spec.props[key], obj[key]);
        if (issue) return { ok: false, path: key, code: issue };
      }
      for (const key of spec.required) {
        if (!Object.hasOwn(obj, key)) return { ok: false, path: key, code: "invalid_type" };
      }
      return { ok: true, args: { ...obj } };
    },
  };
}

function policy(over: Partial<PolicyV1> = {}): PolicyV1 {
  return {
    version: 1,
    shell: { deny: [] },
    network: false,
    mcp: { deny: [], isolate: true },
    ...over,
  } as PolicyV1;
}

const CTX: McpCallCtx = {
  peerId: "peer-self",
  roomId: "room-alpha",
  agentKind: "claude",
  now: "2026-10-16T00:00:00.000Z",
};

const DEFAULT_GATE = resolveLoomToolsGate(null);
const PROPOSE_GATE = resolveLoomToolsGate(policy({ loomTools: { done: "propose" } }));
const ALL_MODES_GATE = resolveLoomToolsGate(policy({ loomTools: { denyModes: ALL_MODES } }));
const INVALID_GATE = resolveLoomToolsGate({ invalid: "policy.json: loomTools.done: bad" });

function evaluate(
  gate: LoomToolsGate,
  name: string,
  args: unknown,
  reg: ToolRegistry = fakeRegistry(),
) {
  return evaluateMcpCall(gate, reg, name, args, CTX);
}

function reasonOf(d: McpCallDecision): string | null {
  return d.ok ? null : d.reason;
}

const SNAP_NO_DONE = {
  format: "loom-board-snapshot",
  tasks: [
    { id: "t1", title: "secret-title-1", status: "todo" },
    { id: "t2", title: "secret-title-2", status: "doing" },
  ],
};
const SNAP_DONE = {
  format: "loom-board-snapshot",
  tasks: [
    { id: "t1", title: "secret-title-1", status: "done" },
    { id: "t2", title: "secret-title-2", status: "todo" },
    { id: "t3", title: "secret-title-3", status: "done" },
  ],
};

describe("resolveLoomToolsGate", () => {
  test("null policy → built-in: done allow, denyModes [board.replace], no mcp deny, valid", () => {
    expect(DEFAULT_GATE.invalid).toBeUndefined();
    expect(DEFAULT_GATE.done).toBe("allow");
    expect([...DEFAULT_GATE.denyModes]).toEqual(["board.replace"]);
    expect(DEFAULT_GATE.mcpDeny.size).toBe(0);
  });

  test("mcp.deny keeps only loom__ entries, stripped to the bare tool name", () => {
    const gate = resolveLoomToolsGate(
      policy({
        mcp: {
          deny: ["loom__handoff", "foo__bar", "loomx__room_chat", "loom__conv_send"],
          isolate: true,
        },
      }),
    );
    expect([...gate.mcpDeny].sort()).toEqual(["conv_send", "handoff"]);
  });

  test("denyModes = built-in ∪ policy (policy [] keeps board.replace)", () => {
    expect([...resolveLoomToolsGate(policy({ loomTools: { denyModes: [] } })).denyModes]).toEqual([
      "board.replace",
    ]);
    expect([...ALL_MODES_GATE.denyModes].sort()).toEqual([...ALL_MODES].sort());
  });

  test("done=propose carried through", () => {
    expect(PROPOSE_GATE.done).toBe("propose");
  });

  test("{invalid} → gate.invalid set to the loader message", () => {
    expect(INVALID_GATE.invalid).toBe("policy.json: loomTools.done: bad");
  });
});

describe("step 1 — policy_invalid", () => {
  test("every tool name (known, unknown, denied) is refused policy_invalid", () => {
    for (const name of [...TOOL_NAMES, "no_such_tool"]) {
      const d = evaluate(INVALID_GATE, name, {});
      expect(reasonOf(d)).toBe("policy_invalid");
      if (!d.ok) {
        expect(d.message).toContain("policy.json: loomTools.done: bad");
        expect(d.audit.kind).toBe("refused");
        expect(d.audit.reason).toBe("policy_invalid");
      }
    }
  });

  test("toolVisible is true for every name under an invalid policy (R50-M1)", () => {
    const reg = fakeRegistry();
    for (const name of [...TOOL_NAMES, "no_such_tool"]) {
      expect(toolVisible(INVALID_GATE, reg, name)).toBe(true);
    }
  });

  test("invalid policy short-circuits before the registry is consulted", () => {
    const reg = fakeRegistry();
    evaluate(INVALID_GATE, "handoff", { to: "*", body: "x" }, reg);
    expect(reg.calls.validate).toEqual([]);
  });
});

describe("step 2 — unknown_tool (R5)", () => {
  test("unknown name → unknown_tool, distinguishable from mcp_deny", () => {
    const d = evaluate(DEFAULT_GATE, "no_such_tool", {});
    expect(reasonOf(d)).toBe("unknown_tool");
    if (!d.ok) expect(d.audit.tool).toBe("no_such_tool");
  });

  test("unknown name in mcp.deny is still unknown_tool (step 2 before 3)", () => {
    const gate = resolveLoomToolsGate(
      policy({ mcp: { deny: ["loom__no_such_tool"], isolate: true } }),
    );
    expect(reasonOf(evaluate(gate, "no_such_tool", {}))).toBe("unknown_tool");
  });

  test("registry.validate not called for unknown tools", () => {
    const reg = fakeRegistry();
    evaluate(DEFAULT_GATE, "no_such_tool", {}, reg);
    expect(reg.calls.validate).toEqual([]);
  });
});

describe("step 3 — mcp.deny (D3)", () => {
  const gate = resolveLoomToolsGate(
    policy({ mcp: { deny: ["loom__room_chat", "foo__handoff"], isolate: true } }),
  );

  test("loom__<t> → hidden AND refused mcp_deny, even with valid args", () => {
    expect(toolVisible(gate, fakeRegistry(), "room_chat")).toBe(false);
    const d = evaluate(gate, "room_chat", { text: "hello" });
    expect(reasonOf(d)).toBe("mcp_deny");
  });

  test("mcp_deny precedes arg validation (invalid args still mcp_deny, validate not called)", () => {
    const reg = fakeRegistry();
    expect(reasonOf(evaluate(gate, "room_chat", { text: 42, bogus: 1 }, reg))).toBe("mcp_deny");
    expect(reg.calls.validate).toEqual([]);
  });

  test("other servers' entries (foo__handoff) are ignored", () => {
    expect(toolVisible(gate, fakeRegistry(), "handoff")).toBe(true);
    expect(evaluate(gate, "handoff", { to: "@x", body: "b" }).ok).toBe(true);
  });
});

describe("step 4 — invalid_args", () => {
  test("wrong type → invalid_args with zod path + code, never the value", () => {
    const d = evaluate(DEFAULT_GATE, "update_task", { id: "t1", status: "finished-secret" });
    expect(reasonOf(d)).toBe("invalid_args");
    if (!d.ok) {
      expect(d.message).toContain("status");
      expect(d.message).toContain("invalid_enum_value");
      expect(d.message).not.toContain("finished-secret");
      expect(JSON.stringify(d.audit)).not.toContain("finished-secret");
    }
  });

  test("unknown key → invalid_args", () => {
    expect(reasonOf(evaluate(DEFAULT_GATE, "room_chat", { text: "x", extra: true }))).toBe(
      "invalid_args",
    );
  });

  test("string 'true' where a boolean belongs → invalid_args (no coercion)", () => {
    expect(
      reasonOf(
        evaluate(DEFAULT_GATE, "conv_open", { node: "n", goal: "g", writesAllowed: "true" }),
      ),
    ).toBe("invalid_args");
  });

  test("invalid args precede deny modes (bad replace call → invalid_args)", () => {
    expect(
      reasonOf(
        evaluate(DEFAULT_GATE, "import_board", { snapshot: SNAP_DONE, mode: "replace", x: 1 }),
      ),
    ).toBe("invalid_args");
  });

  test("invalid args precede done (propose + done + bad key → invalid_args)", () => {
    expect(
      reasonOf(evaluate(PROPOSE_GATE, "update_task", { id: "t1", status: "done", bogus: 1 })),
    ).toBe("invalid_args");
  });
});

describe("step 5 — deny modes (D5 / R2)", () => {
  const cases: Array<{
    mode: LoomDenyMode;
    tool: string;
    hit: Record<string, unknown>;
    miss: Record<string, unknown> | null;
  }> = [
    {
      mode: "board.replace",
      tool: "import_board",
      hit: { snapshot: SNAP_NO_DONE, mode: "replace" },
      miss: { snapshot: SNAP_NO_DONE, mode: "merge" },
    },
    {
      mode: "broadcast",
      tool: "handoff",
      hit: { to: "*", body: "b" },
      miss: { to: "@x", body: "b" },
    },
    {
      mode: "conv.writes",
      tool: "conv_open",
      hit: { node: "n", goal: "g", writesAllowed: true },
      miss: { node: "n", goal: "g", writesAllowed: false },
    },
    {
      mode: "conv.fetch",
      tool: "conv_fetch",
      hit: { convId: "c1", seq: 1, index: 0 },
      miss: null,
    },
    {
      mode: "pack.embed",
      tool: "handoff",
      hit: { to: "@x", body: "b", withPackEmbed: true },
      miss: { to: "@x", body: "b", withPackEmbed: false },
    },
  ];

  for (const c of cases) {
    test(`${c.mode}: hit refused deny_mode:${c.mode} when enabled`, () => {
      const d = evaluate(ALL_MODES_GATE, c.tool, c.hit);
      expect(reasonOf(d)).toBe(`deny_mode:${c.mode}`);
      if (!d.ok) {
        expect(d.audit.kind).toBe("refused");
        expect(d.audit.reason).toBe(`deny_mode:${c.mode}`);
        expect(d.audit.mode).toBe(c.mode);
      }
    });

    if (c.miss) {
      const miss = c.miss;
      test(`${c.mode}: non-matching args allowed even when enabled`, () => {
        expect(evaluate(ALL_MODES_GATE, c.tool, miss).ok).toBe(true);
      });
    }

    if (c.mode !== "board.replace") {
      test(`${c.mode}: not in the built-in → hit allowed under the default policy`, () => {
        expect(evaluate(DEFAULT_GATE, c.tool, c.hit).ok).toBe(true);
      });
    }
  }

  test("board.replace is denied by default (built-in)", () => {
    const d = evaluate(DEFAULT_GATE, "import_board", { snapshot: SNAP_NO_DONE, mode: "replace" });
    expect(reasonOf(d)).toBe("deny_mode:board.replace");
    if (!d.ok) {
      expect(d.message).toContain("Use mode=merge");
      expect(d.message).toContain("loom board import --replace");
    }
  });

  test("import_board without mode (default merge) is allowed", () => {
    expect(evaluate(DEFAULT_GATE, "import_board", { snapshot: SNAP_NO_DONE }).ok).toBe(true);
  });

  test("handoff with to absent is treated as broadcast (dispatch default '*')", () => {
    const reg: ToolRegistry = {
      has: () => true,
      validate: (_n, args) => ({ ok: true, args: args as Record<string, unknown> }),
    };
    expect(reasonOf(evaluateMcpCall(ALL_MODES_GATE, reg, "handoff", { body: "b" }, CTX))).toBe(
      "deny_mode:broadcast",
    );
  });

  test("broadcast and pack.embed together → a deny_mode refusal, never ok", () => {
    const d = evaluate(ALL_MODES_GATE, "handoff", { to: "*", body: "b", withPackEmbed: true });
    expect(reasonOf(d)?.startsWith("deny_mode:")).toBe(true);
  });
});

describe("step 6 — done (D4 / R2 / R50-L1)", () => {
  const donePaths: Array<{ name: string; tool: string; args: Record<string, unknown> }> = [
    { name: "update_task status=done", tool: "update_task", args: { id: "t1", status: "done" } },
    { name: "add_task status=done", tool: "add_task", args: { title: "secret", status: "done" } },
    {
      name: "import_board merge with done",
      tool: "import_board",
      args: { snapshot: SNAP_DONE, mode: "merge" },
    },
    {
      name: "import_board default mode with done",
      tool: "import_board",
      args: { snapshot: SNAP_DONE },
    },
    { name: "conv_close reason=done", tool: "conv_close", args: { convId: "c1", reason: "done" } },
    { name: "conv_close reason absent (default done)", tool: "conv_close", args: { convId: "c1" } },
  ];

  for (const p of donePaths) {
    test(`propose: ${p.name} → done_propose`, () => {
      const d = evaluate(PROPOSE_GATE, p.tool, p.args);
      expect(reasonOf(d)).toBe("done_propose");
      if (!d.ok) {
        expect(d.audit.kind).toBe("refused");
        expect(d.audit.reason).toBe("done_propose");
        expect(d.message).toContain("loomTools.done=propose");
      }
    });

    test(`allow: ${p.name} → ok + done_via_mcp audit`, () => {
      const d = evaluate(DEFAULT_GATE, p.tool, p.args);
      expect(d.ok).toBe(true);
      if (d.ok) {
        expect(d.audit?.kind).toBe("done_via_mcp");
        expect(d.audit?.peerId).toBe(CTX.peerId);
        expect(d.audit?.tool).toBe(p.tool);
      }
    });
  }

  test("propose + import_board replace with done cards → deny_mode:board.replace (R50-L2)", () => {
    const d = evaluate(PROPOSE_GATE, "import_board", { snapshot: SNAP_DONE, mode: "replace" });
    expect(reasonOf(d)).toBe("deny_mode:board.replace");
  });

  test("update_task done: message names the card id and loom board set", () => {
    const d = evaluate(PROPOSE_GATE, "update_task", { id: "t1", status: "done" });
    if (d.ok) throw new Error("expected refusal");
    expect(d.message).toContain("loom board set t1 done");
    expect(d.message).toContain("Set status blocked");
    expect(d.audit.cardId).toBe("t1");
  });

  test("add_task done: message points to loom board set <task_id> done", () => {
    const d = evaluate(PROPOSE_GATE, "add_task", { title: "secret-title", status: "done" });
    if (d.ok) throw new Error("expected refusal");
    expect(d.message).toContain("loom board set <task_id> done");
    expect(d.message).not.toContain("secret-title");
  });

  test("conv_close: message says close with reason=abort; audit carries convId", () => {
    const d = evaluate(PROPOSE_GATE, "conv_close", { convId: "c-77" });
    if (d.ok) throw new Error("expected refusal");
    expect(d.message).toContain("reason=abort");
    expect(d.message).toContain("loom board set");
    expect(d.audit.convId).toBe("c-77");
  });

  test("import_board: message lists done card ids (≤5 + +N) and the owner path", () => {
    const tasks = Array.from({ length: 8 }, (_, i) => ({
      id: `d${i}`,
      title: `secret${i}`,
      status: "done",
    }));
    const d = evaluate(PROPOSE_GATE, "import_board", { snapshot: { tasks } });
    if (d.ok) throw new Error("expected refusal");
    for (let i = 0; i < 5; i++) expect(d.message).toContain(`d${i}`);
    expect(d.message).not.toContain("d5");
    expect(d.message).toContain("+3");
    expect(d.message).toContain("loom board import <file>");
    expect(d.message).not.toContain("secret");
  });

  test("allow audits: cardId for update_task, convId for conv_close, done ids for import_board", () => {
    const u = evaluate(DEFAULT_GATE, "update_task", { id: "t9", status: "done" });
    expect(u.ok && u.audit?.cardId).toBe("t9");
    const c = evaluate(DEFAULT_GATE, "conv_close", { convId: "c9" });
    expect(c.ok && c.audit?.convId).toBe("c9");
    const i = evaluate(DEFAULT_GATE, "import_board", { snapshot: SNAP_DONE });
    expect(i.ok && i.audit?.cardId).toContain("t1");
    expect(i.ok && i.audit?.cardId).toContain("t3");
  });

  const nonDone: Array<{ tool: string; args: Record<string, unknown> }> = [
    ...STATUS.filter((s) => s !== "done").map((s) => ({
      tool: "update_task",
      args: { id: "t1", status: s },
    })),
    { tool: "update_task", args: { id: "t1", notes: "n" } },
    ...STATUS.filter((s) => s !== "done").map((s) => ({
      tool: "add_task",
      args: { title: "x", status: s },
    })),
    { tool: "add_task", args: { title: "x" } },
    { tool: "import_board", args: { snapshot: SNAP_NO_DONE } },
    { tool: "import_board", args: { snapshot: { tasks: [] } } },
    { tool: "conv_close", args: { convId: "c1", reason: "abort" } },
  ];
  for (const n of nonDone) {
    test(`non-done ${n.tool} ${JSON.stringify(n.args)} → ok with no audit under propose and allow`, () => {
      for (const gate of [PROPOSE_GATE, DEFAULT_GATE]) {
        const d = evaluate(gate, n.tool, n.args);
        expect(d.ok).toBe(true);
        if (d.ok) expect(d.audit).toBeUndefined();
      }
    });
  }

  test("malformed snapshot.tasks never throws and counts no done (R50-L1)", () => {
    const snapshots: unknown[] = [
      {},
      { tasks: "done" },
      { tasks: { 0: { status: "done" } } },
      { tasks: [null, 1, "done", ["done"], true] },
      { tasks: [{ status: "DONE" }, { status: ["done"] }, { state: "done" }] },
    ];
    for (const snapshot of snapshots) {
      for (const gate of [PROPOSE_GATE, DEFAULT_GATE]) {
        const d = evaluate(gate, "import_board", { snapshot });
        expect(d.ok).toBe(true);
        if (d.ok) expect(d.audit).toBeUndefined();
      }
    }
  });

  test("done item without a string id still counts as done (propose refuses)", () => {
    const d = evaluate(PROPOSE_GATE, "import_board", {
      snapshot: { tasks: [null, { status: "done" }] },
    });
    expect(reasonOf(d)).toBe("done_propose");
  });

  test("non-object snapshot from a lax registry does not throw", () => {
    const reg: ToolRegistry = {
      has: () => true,
      validate: (_n, args) => ({ ok: true, args: args as Record<string, unknown> }),
    };
    for (const snapshot of [null, 5, "x", [{ status: "done" }]]) {
      expect(() =>
        evaluateMcpCall(PROPOSE_GATE, reg, "import_board", { snapshot }, CTX),
      ).not.toThrow();
    }
  });

  test("throwing accessors in the scan → treated as done present (fail-closed), no throw", () => {
    const throwingTasks = {
      get tasks(): unknown {
        throw new Error("boom");
      },
    };
    const throwingStatus = {
      tasks: [
        {
          id: "t1",
          get status(): unknown {
            throw new Error("boom");
          },
        },
      ],
    };
    const throwingIter = {
      tasks: new Proxy([], {
        get(target, prop, recv) {
          if (prop === Symbol.iterator || prop === "length") throw new Error("boom");
          return Reflect.get(target, prop, recv);
        },
      }),
    };
    for (const snapshot of [throwingTasks, throwingStatus, throwingIter]) {
      let d: McpCallDecision | undefined;
      expect(() => {
        d = evaluate(PROPOSE_GATE, "import_board", { snapshot });
      }).not.toThrow();
      expect(d && reasonOf(d)).toBe("done_propose");
      const a = evaluate(DEFAULT_GATE, "import_board", { snapshot });
      expect(a.ok).toBe(true);
      if (a.ok) expect(a.audit?.kind).toBe("done_via_mcp");
    }
  });

  test("revoked Proxy snapshot (every access throws, incl. Array.isArray) → done present, no throw", () => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    // Lax registry: the fake schema check would itself touch the revoked proxy.
    const lax: ToolRegistry = {
      has: () => true,
      validate: (_n, args) => ({ ok: true, args: args as Record<string, unknown> }),
    };
    let d: McpCallDecision | undefined;
    expect(() => {
      d = evaluate(PROPOSE_GATE, "import_board", { snapshot: proxy }, lax);
    }).not.toThrow();
    expect(d && reasonOf(d)).toBe("done_propose");
    const a = evaluate(DEFAULT_GATE, "import_board", { snapshot: proxy }, lax);
    expect(a.ok && a.audit?.kind).toBe("done_via_mcp");
  });

  test("status is read once per task (a flipping getter cannot slip past)", () => {
    let reads = 0;
    const task = {
      id: "t1",
      get status(): unknown {
        reads++;
        return reads === 1 ? "done" : "todo";
      },
    };
    const d = evaluate(PROPOSE_GATE, "import_board", { snapshot: { tasks: [task] } });
    expect(reasonOf(d)).toBe("done_propose");
    expect(reads).toBe(1);
  });

  test("array-typed task entries are read like objects (.status)", () => {
    const arrTask = Object.assign(["x"], { id: "arr1", status: "done" });
    const d = evaluate(PROPOSE_GATE, "import_board", { snapshot: { tasks: [arrTask] } });
    expect(reasonOf(d)).toBe("done_propose");
    if (!d.ok) expect(d.message).toContain("arr1");
  });
});

describe("steps 5/6 read the VALIDATED args, never the raw args (R6)", () => {
  test("raw mode=replace but validated mode=merge → allowed", () => {
    const reg: ToolRegistry = {
      has: () => true,
      validate: () => ({ ok: true, args: { snapshot: SNAP_NO_DONE, mode: "merge" } }),
    };
    const d = evaluateMcpCall(
      DEFAULT_GATE,
      reg,
      "import_board",
      { snapshot: SNAP_NO_DONE, mode: "replace" },
      CTX,
    );
    expect(d.ok).toBe(true);
  });

  test("raw status todo but validated status done → done_propose", () => {
    const reg: ToolRegistry = {
      has: () => true,
      validate: () => ({ ok: true, args: { id: "t1", status: "done" } }),
    };
    const d = evaluateMcpCall(PROPOSE_GATE, reg, "update_task", { id: "t1", status: "todo" }, CTX);
    expect(reasonOf(d)).toBe("done_propose");
  });

  test("ok decision returns the validated args object", () => {
    const parsed = { text: "parsed" };
    const reg: ToolRegistry = { has: () => true, validate: () => ({ ok: true, args: parsed }) };
    const d = evaluateMcpCall(DEFAULT_GATE, reg, "room_chat", { text: "raw" }, CTX);
    expect(d.ok && d.args).toBe(parsed);
  });
});

describe("toolVisible / evaluateMcpCall agreement (R6 / R50-M1)", () => {
  const gates: Array<[string, LoomToolsGate]> = [
    ["default", DEFAULT_GATE],
    ["propose", PROPOSE_GATE],
    ["all modes", ALL_MODES_GATE],
    [
      "mcp.deny some",
      resolveLoomToolsGate(
        policy({
          mcp: { deny: ["loom__handoff", "loom__conv_fetch", "x__room_chat"], isolate: true },
        }),
      ),
    ],
    [
      "mcp.deny all",
      resolveLoomToolsGate(
        policy({ mcp: { deny: TOOL_NAMES.map((t) => `loom__${t}`), isolate: true } }),
      ),
    ],
  ];
  const names = [...TOOL_NAMES, "no_such_tool", "loom__handoff", ""];
  const argSets: unknown[] = [{}, { text: "x" }, null, { id: "t1", status: "done" }];

  for (const [label, gate] of gates) {
    test(`${label}: invisible ⇔ refused at a tool step (unknown_tool | mcp_deny) for any args`, () => {
      const reg = fakeRegistry();
      for (const name of names) {
        const visible = toolVisible(gate, reg, name);
        for (const args of argSets) {
          const r = reasonOf(evaluate(gate, name, args, reg));
          const toolStep = r === "unknown_tool" || r === "mcp_deny";
          expect(toolStep).toBe(!visible);
        }
      }
    });
  }

  test("invalid policy: every name visible, every call policy_invalid", () => {
    const reg = fakeRegistry();
    for (const name of names) {
      expect(toolVisible(INVALID_GATE, reg, name)).toBe(true);
      expect(reasonOf(evaluate(INVALID_GATE, name, {}, reg))).toBe("policy_invalid");
    }
  });

  test("deny modes and done never affect visibility", () => {
    const reg = fakeRegistry();
    for (const name of TOOL_NAMES) {
      expect(toolVisible(ALL_MODES_GATE, reg, name)).toBe(true);
      expect(toolVisible(PROPOSE_GATE, reg, name)).toBe(true);
    }
  });
});

describe("audit records — shape and no arg values", () => {
  const SECRET = "SECRET-VALUE-zz9";

  test("refusal audit carries kind/ts/peer/room/agentKind/tool/reason, v:1", () => {
    const d = evaluate(PROPOSE_GATE, "update_task", { id: "t1", status: "done", notes: SECRET });
    if (d.ok) throw new Error("expected refusal");
    expect(d.audit).toMatchObject({
      v: 1,
      ts: CTX.now,
      kind: "refused",
      tool: "update_task",
      reason: "done_propose",
      peerId: CTX.peerId,
      roomId: CTX.roomId,
      agentKind: CTX.agentKind,
      cardId: "t1",
    });
  });

  test("no title/body/notes/text/goal/cwd values in any decision's audit", () => {
    const calls: Array<{ gate: LoomToolsGate; tool: string; args: Record<string, unknown> }> = [
      {
        gate: PROPOSE_GATE,
        tool: "update_task",
        args: { id: "t1", status: "done", title: SECRET, notes: SECRET },
      },
      {
        gate: PROPOSE_GATE,
        tool: "add_task",
        args: { title: SECRET, notes: SECRET, status: "done" },
      },
      {
        gate: DEFAULT_GATE,
        tool: "add_task",
        args: { title: SECRET, notes: SECRET, status: "done" },
      },
      { gate: ALL_MODES_GATE, tool: "handoff", args: { to: "*", body: SECRET } },
      {
        gate: ALL_MODES_GATE,
        tool: "conv_open",
        args: { node: "n", goal: SECRET, cwd: SECRET, writesAllowed: true },
      },
      {
        gate: DEFAULT_GATE,
        tool: "import_board",
        args: { snapshot: { tasks: [{ id: "t1", title: SECRET, status: "done" }] } },
      },
      { gate: DEFAULT_GATE, tool: "room_chat", args: { text: SECRET, extra: SECRET } },
      { gate: INVALID_GATE, tool: "room_chat", args: { text: SECRET } },
    ];
    for (const c of calls) {
      const d = evaluate(c.gate, c.tool, c.args);
      const audit = d.ok ? d.audit : d.audit;
      if (audit) expect(JSON.stringify(audit)).not.toContain(SECRET);
      if (!d.ok) expect(d.message).not.toContain(SECRET);
    }
  });

  test("plain allowed calls produce no audit", () => {
    const d = evaluate(DEFAULT_GATE, "room_chat", { text: "hi" });
    expect(d.ok).toBe(true);
    if (d.ok) expect(d.audit).toBeUndefined();
  });

  test("refusal message format: 'Loom pre-check refused <tool>: …'", () => {
    const d = evaluate(DEFAULT_GATE, "import_board", { snapshot: {}, mode: "replace" });
    if (d.ok) throw new Error("expected refusal");
    expect(d.message.startsWith("Loom pre-check refused import_board: ")).toBe(true);
  });
});

describe("purity", () => {
  test("decision is deterministic for the same inputs (clock injected)", () => {
    const a = evaluate(PROPOSE_GATE, "update_task", { id: "t1", status: "done" });
    const b = evaluate(PROPOSE_GATE, "update_task", { id: "t1", status: "done" });
    expect(a).toEqual(b);
  });

  test("does not mutate the gate or the args", () => {
    const args = { snapshot: { tasks: [{ id: "t1", status: "done" }] }, mode: "replace" };
    const before = JSON.stringify(args);
    const modesBefore = [...DEFAULT_GATE.denyModes];
    evaluate(DEFAULT_GATE, "import_board", args);
    expect(JSON.stringify(args)).toBe(before);
    expect([...DEFAULT_GATE.denyModes]).toEqual(modesBefore);
  });
});

describe("@loom/host exports (D10)", () => {
  test("evaluateMcpCall / toolVisible / resolveLoomToolsGate / appendPolicyAudit exported", () => {
    expect(typeof host.evaluateMcpCall).toBe("function");
    expect(typeof host.toolVisible).toBe("function");
    expect(typeof host.resolveLoomToolsGate).toBe("function");
    expect(typeof host.appendPolicyAudit).toBe("function");
  });
});
