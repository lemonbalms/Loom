/**
 * Phase 3.0 PreToolUse JIT inject — candidate A, append-only additionalContext.
 *
 * Authority: docs/spikes/RULE-ROUTER-PHASE3-SPEC.md rev-1 ·
 * docs/spikes/RULE-ROUTER-PHASE3-PREREG.md rev-1 (canary fixture).
 *
 * Modes (LOOM_RULE_ROUTER_JIT):
 *   unset/0/off  → no-op (conservative default; avoid receipt spam pre-canary)
 *   dry-run      → decide + optional receipt; no additionalContext
 *   canary       → inject sealed fixture only (orch.model-explicit)
 *   1|live       → inject A-selected non-pin units on surface `delegation`
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

export const PHASE3_SLICE = "3.0";
export const PHASE3_SURFACE = "delegation";
export const CANARY_FIXTURE_UNIT = "orch.model-explicit";
export const CANARY_BODY_SHA8 = "de04b1fa";
export const JIT_CHAR_CAP = 10_000;
export const GRADE_RANK: Record<string, number> = { H: 0, G: 1, A: 2, J: 3 };

/** Format-competition signals (SPEC §4.2) — skip format-ish units if present (3.0 mostly N/A). */
export const FORMAT_COMPETE_TRIGGERS = [
  "한 문장",
  "one sentence",
  "one short sentence",
  "표로만",
  "json only",
  "JSON only",
] as const;

export type JitMode = "off" | "dry-run" | "canary" | "live";

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

export function hasFormatCompetition(utterance: string): boolean {
  return FORMAT_COMPETE_TRIGGERS.some((t) =>
    utterance.toLowerCase().includes(t.toLowerCase()),
  );
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
      (unit.surface ?? []).includes(PHASE3_SURFACE),
  );
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
  const base = {
    mode: opts.mode,
    tool,
    router_version: ROUTER_VERSION,
    surface: PHASE3_SURFACE,
    slice: PHASE3_SLICE,
  };

  if (opts.mode === "off") {
    return { ...base, unitIds: [], chars: 0, context: null, skipped_reason: "mode_off" };
  }
  if (!isDelegationTool(tool)) {
    return { ...base, unitIds: [], chars: 0, context: null, skipped_reason: "tool_not_delegation" };
  }

  const utterance = opts.utterance ?? input.utterance ?? "";
  let candidates: RuleUnit[];

  if (opts.mode === "canary") {
    const fixture = opts.units.find((u) => u.id === CANARY_FIXTURE_UNIT);
    if (!fixture) {
      return {
        ...base,
        unitIds: [],
        chars: 0,
        context: null,
        skipped_reason: "canary_fixture_missing",
      };
    }
    candidates = [fixture];
  } else {
    // dry-run + live: candidate A selection, pin excluded, delegation surface only
    candidates = selectDelegationUnits(opts.units, utterance);
    if (hasFormatCompetition(utterance)) {
      // 3.0 units are process norms; still honor the skip list if expanded later
      candidates = candidates.filter((u) => u.grade === "H" || u.grade === "G" || u.grade === "A");
    }
  }

  const fitted = fitBudget(candidates);
  if (fitted.length === 0) {
    return {
      ...base,
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
      ...base,
      unitIds: fitted.map((u) => u.id),
      chars: 0,
      context: null,
      skipped_reason: `extract_error:${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (opts.mode === "canary") {
    const bodySha = loaded[0]?.bodySha8;
    if (bodySha !== CANARY_BODY_SHA8) {
      return {
        ...base,
        unitIds: [CANARY_FIXTURE_UNIT],
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
      ...base,
      unitIds: loaded.map((l) => l.unit.id),
      chars,
      context: null,
      skipped_reason: "c3_over_cap",
    };
  }

  const inject = opts.mode === "canary" || opts.mode === "live";
  return {
    ...base,
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
