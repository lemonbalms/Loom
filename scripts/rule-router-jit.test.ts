import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CANARY_BODY_SHA8,
  CANARY_DISPATCH_BODY_SHA8,
  CANARY_DISPATCH_FIXTURE_UNIT,
  CANARY_FIXTURE_UNIT,
  CANARY_SHIP_BODY_SHA8,
  CANARY_SHIP_FIXTURE_UNIT,
  JIT_CHAR_CAP,
  PHASE3_1_SHIP_LIVE_AUTHORIZED,
  PHASE3_2_DISPATCH_LIVE_AUTHORIZED,
  decideJit,
  fitBudget,
  hasFormatCompetition,
  hookOutput,
  isDelegationTool,
  isDispatchCommand,
  isShipCommand,
  isShipTool,
  parseCanarySurface,
  parseJitMode,
  renderContext,
  resolveSurface,
  selectDelegationUnits,
  selectDispatchUnits,
  selectShipUnits,
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

  test("delegation and ship tools", () => {
    expect(isDelegationTool("Agent")).toBe(true);
    expect(isDelegationTool("Task")).toBe(true);
    expect(isDelegationTool("Bash")).toBe(false);
    expect(isShipTool("Bash")).toBe(true);
    expect(isShipTool("Edit")).toBe(true);
    expect(isShipTool("Agent")).toBe(false);
  });

  test("ship command keywords", () => {
    expect(isShipCommand("env -u X bun test")).toBe(true);
    expect(isShipCommand("git commit -m x")).toBe(true);
    expect(isShipCommand("echo P31_READY")).toBe(false);
  });

  test("dispatch command keywords", () => {
    expect(isDispatchCommand("bun run scripts/watch-card.ts --pane w3:p99")).toBe(true);
    expect(isDispatchCommand("bun run watch:card --pane x")).toBe(true);
    expect(isDispatchCommand("herdr pane list")).toBe(true);
    expect(isDispatchCommand("echo P32_READY")).toBe(false);
    expect(isDispatchCommand("bun test")).toBe(false);
  });

  test("parseCanarySurface defaults to ship", () => {
    expect(parseCanarySurface(undefined)).toBe("ship");
    expect(parseCanarySurface("dispatch")).toBe("dispatch");
    expect(parseCanarySurface("ship")).toBe("ship");
    expect(parseCanarySurface("nope")).toBe("ship");
  });
});

describe("rule-router-jit selection", () => {
  const { units } = readLiveRegistry(ROOT);

  test("pin units never selected for JIT payload (delegation)", () => {
    const selected = selectDelegationUnits(units, "위임 topology full 서브에이전트");
    expect(selected.every((u) => !u.pin)).toBe(true);
    expect(selected.every((u) => u.surface.includes("delegation"))).toBe(true);
  });

  test("pin units never selected for ship; commit-push excluded", () => {
    const selected = selectShipUnits(units, "bun test 검증 커밋");
    expect(selected.every((u) => !u.pin)).toBe(true);
    expect(selected.every((u) => u.surface.includes("ship"))).toBe(true);
    expect(selected.some((u) => u.id === "agents.commit-push")).toBe(false);
  });

  test("pin units never selected for dispatch; watch-card included when routed", () => {
    const selected = selectDispatchUnits(units, "디스패치 워커 pane watch-card 감시");
    expect(selected.every((u) => !u.pin)).toBe(true);
    expect(selected.every((u) => u.surface.includes("dispatch"))).toBe(true);
    expect(selected.some((u) => u.id === "traps.watch-card")).toBe(true);
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

  test("resolveSurface canary Bash → ship; Agent → delegation", () => {
    expect(resolveSurface("Agent", "canary", {}, "", units)).toBe("delegation");
    expect(resolveSurface("Bash", "canary", { command: "echo x" }, "", units)).toBe("ship");
    expect(resolveSurface("Bash", "live", { command: "echo x" }, "", units)).toBeNull();
    expect(resolveSurface("Bash", "live", { command: "bun test" }, "", units)).toBe("ship");
  });

  test("resolveSurface canary Bash + dispatch override; live dispatch keywords win", () => {
    expect(
      resolveSurface("Bash", "canary", { command: "echo x" }, "", units, "dispatch"),
    ).toBe("dispatch");
    expect(
      resolveSurface(
        "Bash",
        "live",
        { command: "bun run scripts/watch-card.ts --pane w3:p1" },
        "",
        units,
      ),
    ).toBe("dispatch");
    // dispatch keyword beats ship keyword if both present
    expect(
      resolveSurface(
        "Bash",
        "live",
        { command: "bun run scripts/watch-card.ts --pane x && bun test" },
        "",
        units,
      ),
    ).toBe("dispatch");
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

  test("non-routable tool skips", () => {
    const d = decideJit(
      { tool_name: "Read" },
      { mode: "live", units, readSource, utterance: "위임" },
    );
    expect(d.context).toBeNull();
    expect(d.skipped_reason).toBe("tool_not_delegation");
  });

  test("Bash without ship signal is lane_none", () => {
    const d = decideJit(
      { tool_name: "Bash", tool_input: { command: "echo hi" } },
      { mode: "live", units, readSource, utterance: "hello" },
    );
    expect(d.context).toBeNull();
    expect(d.skipped_reason).toBe("lane_none");
    expect(d.surface).toBe("ship");
  });

  test("dry-run selects but does not inject (delegation)", () => {
    const d = decideJit(
      { tool_name: "Agent" },
      { mode: "dry-run", units, readSource, utterance: "위임 서브에이전트 topology" },
    );
    expect(d.skipped_reason).toBe("dry_run");
    expect(d.context).toBeNull();
    expect(Array.isArray(d.unitIds)).toBe(true);
  });

  test("canary injects sealed delegation fixture only", () => {
    const d = decideJit(
      { tool_name: "Agent" },
      { mode: "canary", units, readSource },
    );
    expect(d.unitIds).toEqual([CANARY_FIXTURE_UNIT]);
    expect(d.surface).toBe("delegation");
    expect(d.slice).toBe("3.0");
    expect(d.context).toContain(`unit:${CANARY_FIXTURE_UNIT}`);
    expect(d.context).toContain(`sha8:${CANARY_BODY_SHA8}`);
    expect(d.chars).toBeLessThan(JIT_CHAR_CAP);
    const body = extractUnitBody(
      readSource("CLAUDE.md"),
      units.find((u) => u.id === CANARY_FIXTURE_UNIT)!.source.anchor,
    );
    expect(sha8(body)).toBe(CANARY_BODY_SHA8);
  });

  test("canary Bash injects sealed ship fixture (even on echo)", () => {
    const d = decideJit(
      { tool_name: "Bash", tool_input: { command: "echo P31_READY" } },
      { mode: "canary", units, readSource },
    );
    expect(d.unitIds).toEqual([CANARY_SHIP_FIXTURE_UNIT]);
    expect(d.surface).toBe("ship");
    expect(d.slice).toBe("3.1");
    expect(d.context).toContain(`unit:${CANARY_SHIP_FIXTURE_UNIT}`);
    expect(d.context).toContain(`sha8:${CANARY_SHIP_BODY_SHA8}`);
    const unit = units.find((u) => u.id === CANARY_SHIP_FIXTURE_UNIT)!;
    const body = extractUnitBody(readSource(unit.source.file), unit.source.anchor);
    expect(sha8(body)).toBe(CANARY_SHIP_BODY_SHA8);
  });

  test("live ship inject authorized after 3.1b T1 (opt-in only)", () => {
    expect(PHASE3_1_SHIP_LIVE_AUTHORIZED).toBe(true);
    const d = decideJit(
      { tool_name: "Bash", tool_input: { command: "bun test" } },
      { mode: "live", units, readSource, utterance: "bun test 검증" },
    );
    expect(d.surface).toBe("ship");
    expect(d.skipped_reason).toBeUndefined();
    expect(d.context).toContain("traps.bun-test-env");
    expect(d.unitIds.every((id) => id !== "agents.commit-push")).toBe(true);
  });

  test("canary Bash with canarySurface=dispatch injects watch-card fixture", () => {
    const d = decideJit(
      { tool_name: "Bash", tool_input: { command: "echo P32_READY" } },
      { mode: "canary", units, readSource, canarySurface: "dispatch" },
    );
    expect(d.unitIds).toEqual([CANARY_DISPATCH_FIXTURE_UNIT]);
    expect(d.surface).toBe("dispatch");
    expect(d.slice).toBe("3.2");
    expect(d.context).toContain(`unit:${CANARY_DISPATCH_FIXTURE_UNIT}`);
    expect(d.context).toContain(`sha8:${CANARY_DISPATCH_BODY_SHA8}`);
    const unit = units.find((u) => u.id === CANARY_DISPATCH_FIXTURE_UNIT)!;
    const body = extractUnitBody(readSource(unit.source.file), unit.source.anchor);
    expect(sha8(body)).toBe(CANARY_DISPATCH_BODY_SHA8);
  });

  test("live dispatch inject authorized after 3.2 T1 (opt-in only)", () => {
    expect(PHASE3_2_DISPATCH_LIVE_AUTHORIZED).toBe(true);
    const d = decideJit(
      {
        tool_name: "Bash",
        tool_input: { command: "bun run scripts/watch-card.ts --pane w3:p99" },
      },
      { mode: "live", units, readSource, utterance: "디스패치 워커 감시" },
    );
    expect(d.surface).toBe("dispatch");
    expect(d.slice).toBe("3.2");
    expect(d.skipped_reason).toBeUndefined();
    expect(d.context).toContain("traps.watch-card");
    expect(d.unitIds.length).toBeGreaterThan(0);
    expect(d.unitIds.every((id) => id !== "agents.commit-push")).toBe(true);
  });

  test("dry-run dispatch selects but does not inject", () => {
    const d = decideJit(
      {
        tool_name: "Bash",
        tool_input: { command: "bun run scripts/watch-card.ts --pane w3:p1" },
      },
      { mode: "dry-run", units, readSource, utterance: "워커 pane 감시" },
    );
    expect(d.surface).toBe("dispatch");
    expect(d.skipped_reason).toBe("dry_run");
    expect(d.context).toBeNull();
    expect(d.unitIds.length).toBeGreaterThan(0);
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
    expect(ctx).toContain(`sha8:${sha8(body)}`);
  });
});
