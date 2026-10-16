/**
 * PLAN 0.37.0 P1 — pure policy-gap core (D1 · D3 · D4(b) · D5 · R1 · R2 · R3 · R13 · C1 · R55-M1 · R55-L3).
 * - `policyGaps` table-driven over every POLICY_ENFORCEMENT cell × configured/not × enabled/not:
 *   gap ⇔ configured (effective policy) ∧ enabled ∧ level ∉ {enforced, hidden, not-applicable}.
 * - Built-in default policy (all three agents enabled) = exactly the six ② gaps (C1 → D1 wording).
 * - Every string the renderers produce is pinned verbatim from PLAN §0.37.0 ②; never re-derived
 *   from the code under test.
 * - D1 cross check: warning, doctor line and notice line all carry `gapLabel(g)` and the same
 *   `(agent, item, level)`.
 * The module is loaded with a dynamic import so each case reports on its own (red phase).
 */
import { describe, expect, test } from "bun:test";
import { type AgentKind, defaultWorkerPermissions } from "./agent-argv";
import type { EffectivePolicy } from "./policy";
import { POLICY_ENFORCEMENT, resolveWorkerPolicy } from "./policy-compile";
import type { Gap } from "./policy-gaps";

const pg = () => import("./policy-gaps");

const AGENTS: readonly AgentKind[] = ["claude", "codex", "grok"];
const ITEMS = ["shell.deny", "network", "mcp.deny", "mcp.isolate"] as const;
type Item = (typeof ITEMS)[number];
const TABLE_KEY: Record<Item, keyof typeof POLICY_ENFORCEMENT> = {
  "shell.deny": "shellDeny",
  network: "network",
  "mcp.deny": "mcpDeny",
  "mcp.isolate": "mcpIsolate",
};
/** Local copy of the 0.31 honesty table (pinned in policy-compile.test.ts:363-372). */
const LEVELS: Record<Item, Record<AgentKind, string>> = {
  "shell.deny": { claude: "enforced", codex: "not-enforced", grok: "best-effort" },
  network: { claude: "advisory", codex: "enforced", grok: "advisory" },
  "mcp.deny": { claude: "hidden", codex: "not-applicable", grok: "text" },
  "mcp.isolate": { claude: "enforced", codex: "not-isolatable", grok: "not-isolatable" },
};
const NOT_A_GAP = new Set(["enforced", "hidden", "not-applicable"]);

/** Effective shell.deny of the built-in default policy (measured — PLAN §0.37.0 Why). */
const DEFAULT_DENY = [
  "curl *",
  "git clean",
  "git clean *",
  "git push",
  "git push *",
  "git reset --hard",
  "git reset --hard *",
  "rm *",
  "rmdir *",
  "sudo *",
  "wget *",
] as const;

const DEFAULT_GAPS: Gap[] = [
  { agent: "claude", item: "network", level: "advisory", count: 1, values: [] },
  {
    agent: "codex",
    item: "shell.deny",
    level: "not-enforced",
    count: 11,
    values: [...DEFAULT_DENY],
  },
  { agent: "codex", item: "mcp.isolate", level: "not-isolatable", count: 1, values: [] },
  { agent: "grok", item: "shell.deny", level: "best-effort", count: 11, values: [...DEFAULT_DENY] },
  { agent: "grok", item: "network", level: "advisory", count: 1, values: [] },
  { agent: "grok", item: "mcp.isolate", level: "not-isolatable", count: 1, values: [] },
];

const CONSEQUENCE = {
  "not-enforced": "nothing blocks it",
  "best-effort": "the CLI blocks only the forms it recognizes",
  advisory: "the CLI blocks only some forms",
  text: "the CLI gets it as a text rule only",
  "not-isolatable": "the CLI still loads its own MCP servers",
} as const;

const LEAD =
  "The operator's Loom policy sets these limits, and this CLI does not fully enforce them for you. Follow them yourself.";

const STRICT_TAIL =
  "Disable the agent (worker.maxConcurrent.<agent>: 0 or remove agentArgv.<agent>), fix network/mcp items in policy.json (shell.deny gaps cannot be removed there), or set worker.strictEnforcement to false.";

const CODEX_WARNING =
  "warning: policy shell.deny (11 rules) is not-enforced for codex — the worker is told in its prompt; nothing blocks it";

const CODEX_NOTICE_SHELL_LINE =
  "- policy shell.deny (11 rules) is not-enforced for codex — nothing blocks it. Do not run commands that match: `curl *`, `git clean`, `git clean *`, `git push`, `git push *`, `git reset --hard`, `git reset --hard *`, `rm *`, `rmdir *`, `sudo *`, `wget *`.";

/** Synthetic effective policy with nothing configured (unreachable through mergePolicy). */
function blank(): EffectivePolicy {
  return {
    version: 1,
    shell: { allow: [], deny: [] },
    network: true,
    mcp: { deny: [], isolate: false },
    skills: { allow: null, allowScripts: [] },
    webDeny: [],
    toolDeny: [],
  };
}

function configure(item: Item, p: EffectivePolicy): EffectivePolicy {
  if (item === "shell.deny") p.shell.deny = ["make deploy *"];
  else if (item === "network") p.network = false;
  else if (item === "mcp.deny") p.mcp.deny = ["github__create_issue"];
  else p.mcp.isolate = true;
  return p;
}

function allAgents(make: () => EffectivePolicy): Record<AgentKind, EffectivePolicy> {
  return { claude: make(), codex: make(), grok: make() };
}

function defaultEffective(): Record<AgentKind, EffectivePolicy> {
  return resolveWorkerPolicy(defaultWorkerPermissions(), null).effective;
}

/** Extract `(agent, item, level)` from any rendered line carrying `gapLabel`. */
const TRIPLE_RE =
  /policy (shell\.deny|network|mcp\.deny|mcp\.isolate) \([^)]*\) is (\S+) for (claude|codex|grok)/;
function triple(line: string): { agent: string; item: string; level: string } | null {
  const m = TRIPLE_RE.exec(line);
  return m ? { agent: m[3] as string, item: m[1] as string, level: m[2] as string } : null;
}

describe("policy-gaps constants (② · R3)", () => {
  test("POLICY_GAP_ITEMS is the fixed order", async () => {
    const m = await pg();
    expect([...m.POLICY_GAP_ITEMS]).toEqual(["shell.deny", "network", "mcp.deny", "mcp.isolate"]);
  });

  test("GAP_CONSEQUENCE — the five sentences verbatim, exactly these keys", async () => {
    const m = await pg();
    expect({ ...m.GAP_CONSEQUENCE }).toEqual(CONSEQUENCE);
  });

  test("POLICY_NOTICE_LEAD verbatim (R55-L3)", async () => {
    const m = await pg();
    expect(m.POLICY_NOTICE_LEAD).toBe(LEAD);
  });

  test("the local honesty table copy matches POLICY_ENFORCEMENT (no drift in this test)", () => {
    for (const item of ITEMS) {
      for (const agent of AGENTS) {
        expect(POLICY_ENFORCEMENT[TABLE_KEY[item]][agent]).toBe(LEVELS[item][agent] as never);
      }
    }
  });
});

describe("enabledAgentsOf (②)", () => {
  test("agents whose value is not 0, in claude → codex → grok order", async () => {
    const m = await pg();
    expect(m.enabledAgentsOf({ claude: 1, codex: 1, grok: 1 })).toEqual([
      "claude",
      "codex",
      "grok",
    ]);
    expect(m.enabledAgentsOf({ grok: 3, codex: 2, claude: 1 })).toEqual([
      "claude",
      "codex",
      "grok",
    ]);
    expect(m.enabledAgentsOf({ claude: 0, codex: 2, grok: 1 })).toEqual(["codex", "grok"]);
    expect(m.enabledAgentsOf({ claude: 1, codex: 0, grok: 0 })).toEqual(["claude"]);
    expect(m.enabledAgentsOf({ claude: 0, codex: 0, grok: 0 })).toEqual([]);
  });
});

describe("policyGaps — table-driven over every honesty cell (D1 · R2)", () => {
  for (const item of ITEMS) {
    for (const agent of AGENTS) {
      for (const configured of [true, false]) {
        for (const enabled of [true, false]) {
          const level = LEVELS[item][agent];
          const expectGap = configured && enabled && !NOT_A_GAP.has(level);
          test(`${item} × ${agent} (${level}) · configured=${configured} · enabled=${enabled} → ${expectGap ? "gap" : "none"}`, async () => {
            const m = await pg();
            const effective = allAgents(() => (configured ? configure(item, blank()) : blank()));
            const gaps = m.policyGaps(effective, enabled ? [agent] : []);
            if (!expectGap) {
              expect(gaps).toEqual([]);
              return;
            }
            const values =
              item === "shell.deny"
                ? ["make deploy *"]
                : item === "mcp.deny"
                  ? ["github__create_issue"]
                  : [];
            expect(gaps).toEqual([{ agent, item, level: level as Gap["level"], count: 1, values }]);
          });
        }
      }
    }
  }
});

describe("policyGaps — built-in default policy (C1 → D1 wording · R55)", () => {
  test("three agents enabled → exactly the six ② gaps (order · values · count)", async () => {
    const m = await pg();
    const effective = defaultEffective();
    expect([...effective.codex.shell.deny]).toEqual([...DEFAULT_DENY]);
    expect(m.policyGaps(effective, ["claude", "codex", "grok"])).toEqual(DEFAULT_GAPS);
  });

  test("output order is fixed regardless of enabledAgents order", async () => {
    const m = await pg();
    expect(m.policyGaps(defaultEffective(), ["grok", "codex", "claude"])).toEqual(DEFAULT_GAPS);
  });

  test("codex disabled → no codex gap; the others stay", async () => {
    const m = await pg();
    const gaps = m.policyGaps(
      defaultEffective(),
      m.enabledAgentsOf({ claude: 1, codex: 0, grok: 1 }),
    );
    expect(gaps.some((g) => g.agent === "codex")).toBe(false);
    expect(gaps).toEqual(DEFAULT_GAPS.filter((g) => g.agent !== "codex"));
  });

  test("no enabled agent → []", async () => {
    const m = await pg();
    expect(m.policyGaps(defaultEffective(), [])).toEqual([]);
  });

  test("network true + isolate false + empty deny → no gap (synthetic EffectivePolicy only — unreachable through a real policy: built-in deny union policy.ts:766, R55-M1)", async () => {
    const m = await pg();
    expect(m.policyGaps(allAgents(blank), ["claude", "codex", "grok"])).toEqual([]);
  });

  test("mcp.deny names → grok `text` only (claude hidden · codex not-applicable)", async () => {
    const m = await pg();
    const effective = allAgents(() => {
      const p = blank();
      p.mcp.deny = ["github__create_issue", "loom__handoff"];
      return p;
    });
    expect(m.policyGaps(effective, ["claude", "codex", "grok"])).toEqual([
      {
        agent: "grok",
        item: "mcp.deny",
        level: "text",
        count: 2,
        values: ["github__create_issue", "loom__handoff"],
      },
    ]);
  });

  test("deprecated deny lists (claude / grok) reach only that agent's values", async () => {
    const m = await pg();
    const d = defaultWorkerPermissions();
    const effective = resolveWorkerPolicy(
      {
        ...d,
        claude: { permissionMode: "acceptEdits", disallowedTools: ["Bash(make deploy *)"] },
        grok: { permissionMode: "acceptEdits", deny: ["Bash(terraform apply *)"] },
      },
      null,
    ).effective;
    const gaps = m.policyGaps(effective, ["claude", "codex", "grok"]);
    const shell = (a: AgentKind) => gaps.find((g) => g.agent === a && g.item === "shell.deny");
    // claude shell.deny is enforced → never a gap, even with the deprecated list.
    expect(shell("claude")).toBeUndefined();
    expect(shell("codex")?.values).toEqual([...DEFAULT_DENY]);
    expect(shell("codex")?.count).toBe(11);
    const grok = shell("grok");
    expect(grok?.values).toContain("terraform apply *");
    expect(grok?.values).not.toContain("make deploy *");
    expect(grok?.count).toBe(12);
    expect(grok?.values).toEqual(effective.grok.shell.deny);
  });

  test("input is not mutated; values are copies; output is deterministic", async () => {
    const m = await pg();
    const effective = defaultEffective();
    effective.grok.mcp.deny = ["github__create_issue"];
    const before = structuredClone(effective);
    const enabled: AgentKind[] = ["grok", "claude", "codex"];
    const a = m.policyGaps(effective, enabled);
    const b = m.policyGaps(effective, enabled);
    expect(effective).toEqual(before);
    expect(enabled).toEqual(["grok", "claude", "codex"]);
    expect(a).toEqual(b);
    const codexShell = a.find((g) => g.agent === "codex" && g.item === "shell.deny");
    const grokMcp = a.find((g) => g.agent === "grok" && g.item === "mcp.deny");
    expect(codexShell?.values).not.toBe(effective.codex.shell.deny);
    expect(grokMcp?.values).not.toBe(effective.grok.mcp.deny);
    expect(grokMcp?.values).toEqual(["github__create_issue"]);
  });
});

describe("gapLabel (② — verbatim, singular / plural)", () => {
  test("the four subjects", async () => {
    const m = await pg();
    const g = (over: Partial<Gap>): Gap => ({
      agent: "codex",
      item: "shell.deny",
      level: "not-enforced",
      count: 1,
      values: [],
      ...over,
    });
    expect(m.gapLabel(g({ count: 11, values: [...DEFAULT_DENY] }))).toBe(
      "shell.deny (11 rules) is not-enforced for codex",
    );
    expect(m.gapLabel(g({ agent: "grok", level: "best-effort", count: 1, values: ["rm *"] }))).toBe(
      "shell.deny (1 rule) is best-effort for grok",
    );
    expect(
      m.gapLabel(
        g({ agent: "grok", item: "mcp.deny", level: "text", count: 2, values: ["a", "b"] }),
      ),
    ).toBe("mcp.deny (2 names) is text for grok");
    expect(
      m.gapLabel(g({ agent: "grok", item: "mcp.deny", level: "text", count: 1, values: ["a"] })),
    ).toBe("mcp.deny (1 name) is text for grok");
    expect(m.gapLabel(g({ agent: "claude", item: "network", level: "advisory" }))).toBe(
      "network (false) is advisory for claude",
    );
    expect(m.gapLabel(g({ item: "mcp.isolate", level: "not-isolatable" }))).toBe(
      "mcp.isolate (true) is not-isolatable for codex",
    );
  });
});

describe("renderGapLine / renderGapWarning (D5 · R3)", () => {
  test("codex default → the D5 sentence verbatim", async () => {
    const m = await pg();
    const g = DEFAULT_GAPS[1] as Gap;
    expect(m.renderGapWarning(g)).toBe(CODEX_WARNING);
    expect(m.renderGapLine(g)).toBe(CODEX_WARNING.slice("warning: ".length));
  });

  test("every default gap: line = policy <label> — the worker is told in its prompt; <consequence>", async () => {
    const m = await pg();
    for (const g of DEFAULT_GAPS) {
      const line = `policy ${m.gapLabel(g)} — the worker is told in its prompt; ${CONSEQUENCE[g.level]}`;
      expect(m.renderGapLine(g)).toBe(line);
      expect(m.renderGapWarning(g)).toBe(`warning: ${line}`);
    }
  });
});

describe("renderStrictRefusal (D4(b) · R13 · R55-M1)", () => {
  test("default gaps → verbatim message with every warning line", async () => {
    const m = await pg();
    const msg = m.renderStrictRefusal(DEFAULT_GAPS);
    const expected =
      "worker.strictEnforcement: refusing to start — 6 policy gap(s) for enabled agents:\n" +
      DEFAULT_GAPS.map((g) => m.renderGapWarning(g)).join("\n") +
      `\n${STRICT_TAIL}`;
    expect(msg).toBe(expected);
    expect(msg).toContain(CODEX_WARNING);
    for (const g of DEFAULT_GAPS) expect(msg).toContain(m.renderGapWarning(g));
  });

  test("one gap → count 1", async () => {
    const m = await pg();
    expect(m.renderStrictRefusal([DEFAULT_GAPS[1] as Gap])).toBe(
      `worker.strictEnforcement: refusing to start — 1 policy gap(s) for enabled agents:\n${CODEX_WARNING}\n${STRICT_TAIL}`,
    );
  });

  test("[] → TypeError", async () => {
    const m = await pg();
    expect(() => m.renderStrictRefusal([])).toThrow(TypeError);
  });
});

describe("renderPolicyNotice (D3 · R55-L3)", () => {
  test('[] → ""', async () => {
    const m = await pg();
    expect(m.renderPolicyNotice([])).toBe("");
  });

  test("codex default → verbatim section, no trailing newline ((c)④: not-enforced + all 11 strings)", async () => {
    const m = await pg();
    const codex = DEFAULT_GAPS.filter((g) => g.agent === "codex");
    const notice = m.renderPolicyNotice(codex);
    expect(notice).toBe(
      `## Loom policy notice\n${LEAD}\n${CODEX_NOTICE_SHELL_LINE}\n` +
        "- policy mcp.isolate (true) is not-isolatable for codex — the CLI still loads its own MCP servers. Do not use MCP tools.",
    );
    expect(notice.endsWith("\n")).toBe(false);
    const shellLine = notice.split("\n")[2] as string;
    expect(shellLine).toContain("not-enforced");
    for (const v of DEFAULT_DENY) expect(shellLine).toContain(`\`${v}\``);
  });

  test("grok default + mcp.deny → network / mcp.deny / mcp.isolate instructions verbatim", async () => {
    const m = await pg();
    const gaps: Gap[] = [
      { agent: "grok", item: "shell.deny", level: "best-effort", count: 1, values: ["rm *"] },
      { agent: "grok", item: "network", level: "advisory", count: 1, values: [] },
      {
        agent: "grok",
        item: "mcp.deny",
        level: "text",
        count: 2,
        values: ["github__create_issue", "loom__handoff"],
      },
      { agent: "grok", item: "mcp.isolate", level: "not-isolatable", count: 1, values: [] },
    ];
    expect(m.renderPolicyNotice(gaps)).toBe(
      [
        "## Loom policy notice",
        LEAD,
        "- policy shell.deny (1 rule) is best-effort for grok — the CLI blocks only the forms it recognizes. Do not run commands that match: `rm *`.",
        "- policy network (false) is advisory for grok — the CLI blocks only some forms. Do not access the network.",
        "- policy mcp.deny (2 names) is text for grok — the CLI gets it as a text rule only. Do not call these MCP tools: `github__create_issue`, `loom__handoff`.",
        "- policy mcp.isolate (true) is not-isolatable for grok — the CLI still loads its own MCP servers. Do not use MCP tools.",
      ].join("\n"),
    );
  });

  test("claude default → the network line only", async () => {
    const m = await pg();
    expect(m.renderPolicyNotice(DEFAULT_GAPS.filter((g) => g.agent === "claude"))).toBe(
      `## Loom policy notice\n${LEAD}\n- policy network (false) is advisory for claude — the CLI blocks only some forms. Do not access the network.`,
    );
  });

  test("mixed agents → TypeError", async () => {
    const m = await pg();
    expect(() => m.renderPolicyNotice(DEFAULT_GAPS)).toThrow(TypeError);
    expect(() => m.renderPolicyNotice([DEFAULT_GAPS[0] as Gap, DEFAULT_GAPS[1] as Gap])).toThrow(
      TypeError,
    );
  });
});

describe("D1 cross — warning · doctor line · notice line carry the same (agent, item, level)", () => {
  test("every gap of the default policy plus a grok mcp.deny gap", async () => {
    const m = await pg();
    const effective = defaultEffective();
    effective.grok.mcp.deny = ["github__create_issue"];
    const gaps = m.policyGaps(effective, ["claude", "codex", "grok"]);
    expect(gaps.length).toBe(7);
    for (const agent of AGENTS) {
      const mine = gaps.filter((g) => g.agent === agent);
      const noticeLines = m
        .renderPolicyNotice(mine)
        .split("\n")
        .filter((l: string) => l.startsWith("- policy "));
      expect(noticeLines.length).toBe(mine.length);
      for (const [i, g] of mine.entries()) {
        const label = m.gapLabel(g);
        const want = { agent: g.agent, item: g.item, level: g.level };
        const rendered = [m.renderGapLine(g), m.renderGapWarning(g), noticeLines[i] as string];
        for (const line of rendered) {
          expect(line).toContain(label);
          expect(triple(line)).toEqual(want);
        }
      }
    }
  });
});
