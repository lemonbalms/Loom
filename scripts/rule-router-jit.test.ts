import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CANARY_BODY_SHA8,
  CANARY_FIXTURE_UNIT,
  JIT_CHAR_CAP,
  decideJit,
  fitBudget,
  hasFormatCompetition,
  hookOutput,
  isDelegationTool,
  parseJitMode,
  renderContext,
  selectDelegationUnits,
} from "./rule-router-jit.ts";
import { type RuleUnit, extractUnitBody, readLiveRegistry, sha8 } from "./rules-registry.ts";

const ROOT = join(import.meta.dir, "..");
const readSource = (file: string) => readFileSync(join(ROOT, file), "utf8");

describe("rule-router-jit modes", () => {
  test("parseJitMode", () => {
    expect(parseJitMode(undefined)).toBe("off");
    expect(parseJitMode("dry-run")).toBe("dry-run");
    expect(parseJitMode("canary")).toBe("canary");
    expect(parseJitMode("1")).toBe("live");
    expect(parseJitMode("nope")).toBe("off");
  });

  test("delegation tools only", () => {
    expect(isDelegationTool("Agent")).toBe(true);
    expect(isDelegationTool("Task")).toBe(true);
    expect(isDelegationTool("Bash")).toBe(false);
  });
});

describe("rule-router-jit selection", () => {
  const { units } = readLiveRegistry(ROOT);

  test("pin units never selected for JIT payload", () => {
    const selected = selectDelegationUnits(units, "위임 topology full 서브에이전트");
    expect(selected.every((u) => !u.pin)).toBe(true);
    expect(selected.every((u) => u.surface.includes("delegation"))).toBe(true);
  });

  test("fitBudget drops whole units, never exceeds cap", () => {
    const fat: RuleUnit[] = units.map((u) => ({ ...u, cost_chars: JIT_CHAR_CAP - 10 }));
    const fitted = fitBudget(fat.slice(0, 3), JIT_CHAR_CAP);
    expect(fitted.length).toBeLessThanOrEqual(1);
    expect(fitted.reduce((s, u) => s + u.cost_chars, 0)).toBeLessThan(JIT_CHAR_CAP);
  });

  test("format competition detector", () => {
    expect(hasFormatCompetition("one short sentence please")).toBe(true);
    expect(hasFormatCompetition("위임해서 구현해")).toBe(false);
  });
});

describe("rule-router-jit decide", () => {
  const { units } = readLiveRegistry(ROOT);

  test("off mode is no-op", () => {
    const d = decideJit(
      { tool_name: "Agent" },
      { mode: "off", units, readSource },
    );
    expect(d.context).toBeNull();
    expect(d.skipped_reason).toBe("mode_off");
  });

  test("non-delegation tool skips", () => {
    const d = decideJit(
      { tool_name: "Bash" },
      { mode: "live", units, readSource, utterance: "위임" },
    );
    expect(d.context).toBeNull();
    expect(d.skipped_reason).toBe("tool_not_delegation");
  });

  test("dry-run selects but does not inject", () => {
    const d = decideJit(
      { tool_name: "Agent" },
      { mode: "dry-run", units, readSource, utterance: "위임 서브에이전트 topology" },
    );
    expect(d.skipped_reason).toBe("dry_run");
    expect(d.context).toBeNull();
    // may or may not find units depending on triggers; unitIds can be empty
    expect(Array.isArray(d.unitIds)).toBe(true);
  });

  test("canary injects sealed fixture only", () => {
    const d = decideJit(
      { tool_name: "Agent" },
      { mode: "canary", units, readSource },
    );
    expect(d.unitIds).toEqual([CANARY_FIXTURE_UNIT]);
    expect(d.context).toContain(`unit:${CANARY_FIXTURE_UNIT}`);
    expect(d.context).toContain(`sha8:${CANARY_BODY_SHA8}`);
    expect(d.chars).toBeLessThan(JIT_CHAR_CAP);
    const body = extractUnitBody(
      readSource("CLAUDE.md"),
      units.find((u) => u.id === CANARY_FIXTURE_UNIT)!.source.anchor,
    );
    expect(sha8(body)).toBe(CANARY_BODY_SHA8);
  });

  test("hookOutput wraps additionalContext", () => {
    const json = hookOutput("hello");
    const parsed = JSON.parse(json) as {
      hookSpecificOutput: { additionalContext: string };
    };
    expect(parsed.hookSpecificOutput.additionalContext).toBe("hello");
    expect(hookOutput(null)).toBe("");
  });

  test("renderContext has no hardcoded rule body — uses extraction", () => {
    const unit = units.find((u) => u.id === CANARY_FIXTURE_UNIT)!;
    const body = extractUnitBody(readSource(unit.source.file), unit.source.anchor);
    const ctx = renderContext([{ unit, body, bodySha8: sha8(body) }]);
    expect(ctx).toContain(body.trim());
    expect(ctx.startsWith("[LOOM-RULE unit:")).toBe(true);
  });
});
