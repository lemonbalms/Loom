/**
 * Phase 3.x PreToolUse JIT inject — candidate A, append-only additionalContext.
 *
 * Authority:
 *   docs/spikes/RULE-ROUTER-PHASE3-SPEC.md rev-1 · PHASE3-PREREG (3.0 delegation)
 *   docs/spikes/RULE-ROUTER-PHASE3.1-SPEC.md rev-1 · PHASE3.1-PREREG (3.1 ship)
 *
 * Modes (LOOM_RULE_ROUTER_JIT):
 *   unset/0/off  → no-op (conservative default; avoid receipt spam pre-canary)
 *   dry-run      → decide + optional receipt; no additionalContext
 *   canary       → sealed fixtures only (delegation→orch.model-explicit · ship→traps.bun-test-env)
 *   1|live       → A-selected non-pin units; ship inject gated until 3.1 canary PASS
 *
 * Never exit non-zero for routing failures (fail-open). Model-guard stays separate.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  type RuleUnit,
  extractUnitBody,
  readLiveRegistry,
  sha8,
} from "./rules-registry.ts";
import {
  ROUTER_VERSION,
  classifyTurn,
  route,
} from "./rule-router-eval.ts";

/** @deprecated use SURFACE_DELEGATION / slice on decision — kept for 3.0 test imports */
export const PHASE3_SLICE = "3.0";
/** @deprecated use SURFACE_DELEGATION */
export const PHASE3_SURFACE = "delegation";

export const SURFACE_DELEGATION = "delegation";
export const SURFACE_SHIP = "ship";
export const SLICE_3_0 = "3.0";
export const SLICE_3_1 = "3.1";

/** 3.0 canary fixture (PREREG sealed). */
export const CANARY_FIXTURE_UNIT = "orch.model-explicit";
export const CANARY_BODY_SHA8 = "de04b1fa";

/** 3.1 canary fixture (PHASE3.1-PREREG sealed). */
export const CANARY_SHIP_FIXTURE_UNIT = "traps.bun-test-env";
export const CANARY_SHIP_BODY_SHA8 = "1172cf30";

/**
 * Ship live inject authorization. Stays false until PHASE3.1-RESULT T1/T1(b) PASS
 * is documented and this constant is flipped in a deliberate commit.
 */
export const PHASE3_1_SHIP_LIVE_AUTHORIZED = false;

export const JIT_CHAR_CAP = 10_000;
export const GRADE_RANK: Record<string, number> = { H: 0, G: 1, A: 2, J: 3 };

/** Format-competition signals (SPEC §4.2). */
export const FORMAT_COMPETE_TRIGGERS = [
  "한 문장",
  "one sentence",
  "one short sentence",
  "표로만",
  "json only",
  "JSON only",
] as const;

/** Live Bash command keyword gate (PHASE3.1-SPEC §3.2) — case-insensitive substring. */
export const SHIP_COMMAND_KEYWORDS = [
  "bun test",
  "commit",
  "push",
  "git ",
  "LOOM_RELAY",
  "npm test",
  "verify",
] as const;

export type JitMode = "off" | "dry-run" | "canary" | "live";
export type JitSurface = typeof SURFACE_DELEGATION | typeof SURFACE_SHIP;

export type JitInput = {
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  /** Recent user text when the harness provides it; optional. */
  utterance?: string;
};

export type JitDecision = {
  mode: JitMode;
  tool: string;
  unitIds: string[];
  chars: number;
  context: string | null;
  skipped_reason?: string;
  router_version: string;
  surface: string;
  slice: string;
};

export function parseJitMode(raw: string | undefined): JitMode {
  if (!raw || raw === "0" || raw === "false" || raw === "off") return "off";
  if (raw === "dry-run" || raw === "dry") return "dry-run";
  if (raw === "canary") return "canary";
  if (raw === "1" || raw === "true" || raw === "live") return "live";
  return "off";
}

export function isDelegationTool(toolName: string): boolean {
  return toolName === "Agent" || toolName === "Task";
}

export function isShipTool(toolName: string): boolean {
  return toolName === "Bash" || toolName === "Edit";
}

export function isShipCommand(command: string): boolean {
  const c = command.toLowerCase();
  return SHIP_COMMAND_KEYWORDS.some((k) => c.includes(k.toLowerCase()));
}

export function hasFormatCompetition(utterance: string): boolean {
  return FORMAT_COMPETE_TRIGGERS.some((t) =>
    utterance.toLowerCase().includes(t.toLowerCase()),
  );
}

export function utteranceHasShipCategory(
  utterance: string,
  units: RuleUnit[],
  isFirstTurn = false,
): boolean {
  if (!utterance.trim()) return false;
  const { categories } = classifyTurn(utterance, units, isFirstTurn);
  return categories.includes("ship") || categories.includes("verification");
}

const rank = (unit: RuleUnit) => GRADE_RANK[unit.grade] ?? 9;

/**
 * Prefer higher-grade (lower rank) units; drop from the tail until under C3.
 * Never truncate a unit body — drop whole units (SPEC §2).
 */
export function fitBudget(units: RuleUnit[], cap = JIT_CHAR_CAP): RuleUnit[] {
  const sorted = [...units].sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
  const out: RuleUnit[] = [];
  let cost = 0;
  for (const unit of sorted) {
    const next = cost + (unit.cost_chars || 0);
    if (next > cap) continue;
    out.push(unit);
    cost = next;
  }
  return out;
}

export function selectDelegationUnits(
  units: RuleUnit[],
  utterance: string,
  isFirstTurn = false,
): RuleUnit[] {
  const { categories, unknown } = classifyTurn(utterance, units, isFirstTurn);
  const decision = route(units, categories, unknown);
  return units.filter(
    (unit) =>
      decision.selected.has(unit.id) &&
      !unit.pin &&
      (unit.surface ?? []).includes(SURFACE_DELEGATION),
  );
}

export function selectShipUnits(
  units: RuleUnit[],
  utterance: string,
  isFirstTurn = false,
): RuleUnit[] {
  const { categories, unknown } = classifyTurn(utterance, units, isFirstTurn);
  const decision = route(units, categories, unknown);
  return units.filter(
    (unit) =>
      decision.selected.has(unit.id) &&
      !unit.pin &&
      (unit.surface ?? []).includes(SURFACE_SHIP),
  );
}

/**
 * Resolve which surface lane applies. null = no JIT for this tool event.
 *
 * canary: Agent|Task → delegation; Bash → ship (always — C1 two-step needs inject on echo).
 * live/dry-run: Bash/Edit only when command keywords or utterance ship/verification.
 */
export function resolveSurface(
  tool: string,
  mode: JitMode,
  toolInput: Record<string, unknown> | undefined,
  utterance: string,
  units: RuleUnit[],
): JitSurface | null {
  if (isDelegationTool(tool)) return SURFACE_DELEGATION;
  if (!isShipTool(tool)) return null;

  if (mode === "canary") {
    // 3.1 canary is Bash-only; Edit not used in sealed probe
    return tool === "Bash" ? SURFACE_SHIP : null;
  }

  if (tool === "Bash") {
    const command = typeof toolInput?.command === "string" ? toolInput.command : "";
    if (isShipCommand(command)) return SURFACE_SHIP;
    if (utteranceHasShipCategory(utterance, units)) return SURFACE_SHIP;
    return null;
  }

  // Edit: utterance ship/verification only (live/dry-run)
  if (tool === "Edit" && utteranceHasShipCategory(utterance, units)) return SURFACE_SHIP;
  return null;
}

export function loadUnitBodies(
  units: RuleUnit[],
  readSource: (file: string) => string,
): { unit: RuleUnit; body: string; bodySha8: string }[] {
  return units.map((unit) => {
    const body = extractUnitBody(readSource(unit.source.file), unit.source.anchor);
    return { unit, body, bodySha8: sha8(body) };
  });
}

export function renderContext(
  loaded: { unit: RuleUnit; body: string; bodySha8: string }[],
): string {
  return loaded
    .map(
      ({ unit, body, bodySha8 }) =>
        `[LOOM-RULE unit:${unit.id} sha8:${bodySha8}]\n${body.trim()}`,
    )
    .join("\n\n");
}

function sliceFor(surface: JitSurface): string {
  return surface === SURFACE_SHIP ? SLICE_3_1 : SLICE_3_0;
}

export function decideJit(
  input: JitInput,
  opts: {
    mode: JitMode;
    units: RuleUnit[];
    readSource: (file: string) => string;
    utterance?: string;
  },
): JitDecision {
  const tool = input.tool_name ?? "";
  const utterance = opts.utterance ?? input.utterance ?? "";
  const empty = (surface: string, slice: string, reason: string): JitDecision => ({
    mode: opts.mode,
    tool,
    unitIds: [],
    chars: 0,
    context: null,
    skipped_reason: reason,
    router_version: ROUTER_VERSION,
    surface,
    slice,
  });

  if (opts.mode === "off") {
    return empty(SURFACE_DELEGATION, SLICE_3_0, "mode_off");
  }

  const surface = resolveSurface(tool, opts.mode, input.tool_input, utterance, opts.units);
  if (!surface) {
    // Preserve 3.0 reason string when non-delegation tool cannot take ship lane
    if (!isDelegationTool(tool) && !isShipTool(tool)) {
      return empty(SURFACE_DELEGATION, SLICE_3_0, "tool_not_delegation");
    }
    if (isShipTool(tool)) {
      return empty(SURFACE_SHIP, SLICE_3_1, "lane_none");
    }
    return empty(SURFACE_DELEGATION, SLICE_3_0, "tool_not_delegation");
  }

  const slice = sliceFor(surface);
  const baseMeta = {
    mode: opts.mode,
    tool,
    router_version: ROUTER_VERSION,
    surface,
    slice,
  };

  let candidates: RuleUnit[];
  let canaryUnit: string | undefined;
  let canarySha: string | undefined;

  if (opts.mode === "canary") {
    if (surface === SURFACE_DELEGATION) {
      canaryUnit = CANARY_FIXTURE_UNIT;
      canarySha = CANARY_BODY_SHA8;
    } else {
      canaryUnit = CANARY_SHIP_FIXTURE_UNIT;
      canarySha = CANARY_SHIP_BODY_SHA8;
    }
    const fixture = opts.units.find((u) => u.id === canaryUnit);
    if (!fixture) {
      return { ...baseMeta, unitIds: [], chars: 0, context: null, skipped_reason: "canary_fixture_missing" };
    }
    candidates = [fixture];
  } else if (surface === SURFACE_DELEGATION) {
    candidates = selectDelegationUnits(opts.units, utterance);
    if (hasFormatCompetition(utterance)) {
      candidates = candidates.filter((u) => u.grade === "H" || u.grade === "G" || u.grade === "A");
    }
  } else {
    candidates = selectShipUnits(opts.units, utterance);
    if (hasFormatCompetition(utterance)) {
      candidates = candidates.filter((u) => u.grade === "H" || u.grade === "G" || u.grade === "A");
    }
  }

  const fitted = fitBudget(candidates);
  if (fitted.length === 0) {
    return {
      ...baseMeta,
      unitIds: [],
      chars: 0,
      context: null,
      skipped_reason: candidates.length ? "budget_empty" : "no_units",
    };
  }

  let loaded: { unit: RuleUnit; body: string; bodySha8: string }[];
  try {
    loaded = loadUnitBodies(fitted, opts.readSource);
  } catch (error) {
    return {
      ...baseMeta,
      unitIds: fitted.map((u) => u.id),
      chars: 0,
      context: null,
      skipped_reason: `extract_error:${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (opts.mode === "canary" && canaryUnit && canarySha) {
    const bodySha = loaded[0]?.bodySha8;
    if (bodySha !== canarySha) {
      return {
        ...baseMeta,
        unitIds: [canaryUnit],
        chars: 0,
        context: null,
        skipped_reason: `canary_sha_mismatch:${bodySha}`,
      };
    }
  }

  const context = renderContext(loaded);
  const chars = context.length;
  if (chars >= JIT_CHAR_CAP) {
    return {
      ...baseMeta,
      unitIds: loaded.map((l) => l.unit.id),
      chars,
      context: null,
      skipped_reason: "c3_over_cap",
    };
  }

  // Ship live inject blocked until 3.1 canary PASS (PHASE3.1-SPEC §4)
  if (opts.mode === "live" && surface === SURFACE_SHIP && !PHASE3_1_SHIP_LIVE_AUTHORIZED) {
    return {
      ...baseMeta,
      unitIds: loaded.map((l) => l.unit.id),
      chars,
      context: null,
      skipped_reason: "ship_gate_blocked",
    };
  }

  const inject = opts.mode === "canary" || opts.mode === "live";
  return {
    ...baseMeta,
    unitIds: loaded.map((l) => l.unit.id),
    chars,
    context: inject ? context : null,
    skipped_reason: inject ? undefined : "dry_run",
  };
}

export function receiptPath(dir = join(homedir(), ".loom/rule-router/jit-receipts")): string {
  const day = new Date().toISOString().slice(0, 10);
  return join(dir, `${day}.jsonl`);
}

export function writeReceipt(decision: JitDecision, dir?: string): void {
  try {
    const path = receiptPath(dir);
    mkdirSync(join(path, ".."), { recursive: true });
    appendFileSync(
      path,
      `${JSON.stringify({ at: new Date().toISOString(), ...decision })}\n`,
      "utf8",
    );
  } catch {
    // receipt must never kill the session
  }
}

export function hookOutput(context: string | null): string {
  if (!context) return "";
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: context,
    },
  });
}

async function main(): Promise<void> {
  const mode = parseJitMode(process.env.LOOM_RULE_ROUTER_JIT);
  let input: JitInput = {};
  try {
    const raw = await Bun.stdin.text();
    if (raw.trim()) input = JSON.parse(raw) as JitInput;
  } catch {
    process.exit(0);
  }

  try {
    const { readFileSync } = await import("node:fs");
    const registry = readLiveRegistry();
    const readSrc = (file: string) => readFileSync(join(import.meta.dir, "..", file), "utf8");

    const decision = decideJit(input, {
      mode,
      units: registry.units,
      readSource: readSrc,
      utterance: typeof input.utterance === "string" ? input.utterance : "",
    });

    if (mode !== "off") writeReceipt(decision);

    const out = hookOutput(decision.context);
    if (out) process.stdout.write(out);
  } catch {
    process.exit(0);
  }
  process.exit(0);
}

if (import.meta.main) {
  void main();
}
