import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { checkAgentSpawn } from "./check-agent-model.ts";

const HOOK = join(import.meta.dir, "check-agent-model.ts");

describe("checkAgentSpawn — blocks", () => {
  test("rule 1: fable-advisor excluded (bare and plugin-qualified)", () => {
    for (const subagent_type of ["fable-advisor", "fable-advisor:fable-advisor"]) {
      const r = checkAgentSpawn({ subagent_type, model: "opus" });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.reason).toContain("규칙 8");
        expect(r.reason).toContain("loom-advisor");
      }
    }
  });

  test("rule 2: fable model excluded", () => {
    const r = checkAgentSpawn({ subagent_type: "general-purpose", model: "fable" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("fable");
  });

  test("rule 3: loom-advisor with model present", () => {
    const r = checkAgentSpawn({ subagent_type: "loom-advisor", model: "opus" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("claude-opus-5-5");
  });

  test("rule 3: loom-advisor with effort medium", () => {
    const r = checkAgentSpawn({ subagent_type: "loom-advisor", effort: "medium" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("effort");
  });

  test("rule 4: missing model on other types", () => {
    expect(checkAgentSpawn({ subagent_type: "general-purpose" }).ok).toBe(false);
    expect(checkAgentSpawn({ subagent_type: "Explore", model: "" }).ok).toBe(false);
    expect(checkAgentSpawn({}).ok).toBe(false);
  });
});

describe("checkAgentSpawn — allows", () => {
  test("loom-advisor with nothing", () => {
    expect(checkAgentSpawn({ subagent_type: "loom-advisor" })).toEqual({ ok: true });
  });

  test("loom-advisor with effort high", () => {
    expect(checkAgentSpawn({ subagent_type: "loom-advisor", effort: "high" })).toEqual({
      ok: true,
    });
  });

  test("general-purpose with model opus", () => {
    expect(checkAgentSpawn({ subagent_type: "general-purpose", model: "opus" })).toEqual({
      ok: true,
    });
  });

  test("Explore with model opus effort medium", () => {
    expect(checkAgentSpawn({ subagent_type: "Explore", model: "opus", effort: "medium" })).toEqual({
      ok: true,
    });
  });
});

describe("checkAgentSpawn — edge cases", () => {
  test("loom-advisor with empty-string model is blocked (presence, not truthiness)", () => {
    expect(checkAgentSpawn({ subagent_type: "loom-advisor", model: "" }).ok).toBe(false);
  });

  test("loom-advisor with empty-string effort is blocked", () => {
    expect(checkAgentSpawn({ subagent_type: "loom-advisor", effort: "" }).ok).toBe(false);
  });

  test("no subagent_type: model opus allowed, no model blocked", () => {
    expect(checkAgentSpawn({ model: "opus" })).toEqual({ ok: true });
    expect(checkAgentSpawn({}).ok).toBe(false);
  });

  test("plugin-qualified fable-advisor blocked even with valid model", () => {
    expect(checkAgentSpawn({ subagent_type: "some-plugin:fable-advisor", model: "opus" }).ok).toBe(
      false,
    );
  });

  test("precedence: rule 1 over fable model", () => {
    const r = checkAgentSpawn({ subagent_type: "fable-advisor:fable-advisor", model: "fable" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("loom-advisor");
  });

  test("precedence: fable model over loom-advisor model rule", () => {
    const r = checkAgentSpawn({ subagent_type: "loom-advisor", model: "fable" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("fable 모델");
  });

  test("non-string inputs are normalized, not thrown", () => {
    expect(() =>
      checkAgentSpawn({ subagent_type: 42 as unknown as string, model: "opus" }),
    ).not.toThrow();
    expect(checkAgentSpawn({ subagent_type: 42 as unknown as string, model: "opus" })).toEqual({
      ok: true,
    });
    expect(
      checkAgentSpawn({ subagent_type: "loom-advisor", model: 5 as unknown as string }).ok,
    ).toBe(false);
  });
});

async function runHook(stdin: string) {
  const proc = Bun.spawn(["bun", "run", HOOK], {
    stdin: new TextEncoder().encode(stdin),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);
  return { code, stderr };
}

describe("hook script entry", () => {
  test("blocked spawn exits 2 with stderr", async () => {
    const { code, stderr } = await runHook(
      JSON.stringify({
        tool_name: "Agent",
        tool_input: { subagent_type: "fable-advisor:fable-advisor" },
      }),
    );
    expect(code).toBe(2);
    expect(stderr.trim().length).toBeGreaterThan(0);
  });

  test("legacy Task tool name: blocked spawn exits 2", async () => {
    const { code } = await runHook(
      JSON.stringify({
        tool_name: "Task",
        tool_input: { subagent_type: "fable-advisor:fable-advisor" },
      }),
    );
    expect(code).toBe(2);
  });

  test("allowed spawn exits 0", async () => {
    const { code } = await runHook(
      JSON.stringify({ tool_name: "Agent", tool_input: { subagent_type: "loom-advisor" } }),
    );
    expect(code).toBe(0);
  });

  test("unparseable stdin fails open (exit 0)", async () => {
    const { code } = await runHook("not json{");
    expect(code).toBe(0);
  });
});
