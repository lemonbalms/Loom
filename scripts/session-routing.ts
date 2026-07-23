/**
 * Canonical HANDOFF Line parser for session topology routing.
 *
 * Meaning is owned by docs/DOGFOOD_LOOP.md §0.5. This module owns only the
 * machine-readable grammar and valid topology/execution/verification tuples.
 * Authority: docs/spikes/SINGLE-TOPOLOGY-EXECUTION-DESIGN.md §3–§4.
 */
import { extractHandoffSection } from "./handoff-headings.ts";

export type SessionTopology = "single" | "full";
export type SessionExecution = "current-session" | "delegated";
export type SessionVerification = "objective-commands" | "independent";

export type SessionRouting = {
  topology: SessionTopology;
  execution: SessionExecution;
  verify: SessionVerification;
  suffix: string;
};

export type SessionRoutingResult =
  | { ok: true; routing: SessionRouting }
  | { ok: false; errors: string[] };

const LINE_PREFIX = "**Line:**";
const LINE_RE =
  /^\*\*Line:\*\*\s+topology\s+\*\*`([^`]+)`\*\*\s+·\s+execution\s+\*\*`([^`]+)`\*\*\s+·\s+verify\s+\*\*`([^`]+)`\*\*(.*)$/;

const TOPOLOGIES = new Set<SessionTopology>(["single", "full"]);
const EXECUTIONS = new Set<SessionExecution>(["current-session", "delegated"]);
const VERIFICATIONS = new Set<SessionVerification>(["objective-commands", "independent"]);

function isTopology(value: string): value is SessionTopology {
  return TOPOLOGIES.has(value as SessionTopology);
}

function isExecution(value: string): value is SessionExecution {
  return EXECUTIONS.has(value as SessionExecution);
}

function isVerification(value: string): value is SessionVerification {
  return VERIFICATIONS.has(value as SessionVerification);
}

/** Parse and validate exactly one canonical Line in Current action. */
export function parseSessionRouting(handoff: string): SessionRoutingResult {
  if (!handoff?.trim()) {
    return { ok: false, errors: ["session routing: HANDOFF empty"] };
  }

  const action = extractHandoffSection(handoff, "Current action");
  if (!action) {
    return { ok: false, errors: ["session routing: Current action missing"] };
  }

  const lines = action.split("\n").filter((line) => line.trimStart().startsWith(LINE_PREFIX));
  if (lines.length !== 1) {
    return {
      ok: false,
      errors: [`session routing: canonical Line count must be 1, got ${lines.length}`],
    };
  }

  const match = LINE_RE.exec(lines[0]!.trim());
  if (!match) {
    return {
      ok: false,
      errors: ["session routing: malformed Line grammar (need topology/execution/verify enums)"],
    };
  }

  const topologyRaw = match[1]!;
  const executionRaw = match[2]!;
  const verifyRaw = match[3]!;
  const suffix = match[4]!.trim();
  const errors: string[] = [];

  if (!isTopology(topologyRaw)) {
    errors.push(`session routing: unknown topology ${topologyRaw}`);
  }
  if (!isExecution(executionRaw)) {
    errors.push(`session routing: unknown execution ${executionRaw}`);
  }
  if (!isVerification(verifyRaw)) {
    errors.push(`session routing: unknown verify ${verifyRaw}`);
  }
  if (errors.length > 0) return { ok: false, errors };

  const routing: SessionRouting = {
    topology: topologyRaw,
    execution: executionRaw,
    verify: verifyRaw,
    suffix,
  };

  if (
    routing.topology === "single" &&
    (routing.execution !== "current-session" || routing.verify !== "objective-commands")
  ) {
    errors.push("session routing: single requires current-session + objective-commands");
  }
  if (
    routing.topology === "full" &&
    (routing.execution !== "delegated" || routing.verify !== "independent")
  ) {
    errors.push("session routing: full requires delegated + independent");
  }
  if (routing.topology === "single" && !/\bfull fallback\b/i.test(suffix)) {
    errors.push("session routing: single Line missing full fallback suffix");
  }
  if (routing.topology === "full" && !/\bchain\b/i.test(suffix)) {
    errors.push("session routing: full Line missing chain suffix");
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, routing };
}

/** Compact Dashboard rendering from a previously validated tuple. */
export function formatSessionRoutingStatus(routing: SessionRouting): string {
  if (routing.topology === "single") {
    return "topology **single** · current-session→objective-commands→ship";
  }
  const chain = /\bchain\s+(.+)$/i.exec(routing.suffix)?.[1]?.trim();
  return `topology **full** · delegated→independent→ship${chain ? ` · chain ${chain}` : ""}`;
}
