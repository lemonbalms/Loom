/**
 * Deterministic rule-unit registry extractor and gate (RULE-ROUTER Phase 1).
 *
 * Authority: docs/spikes/RULE-ROUTER-PROPOSE.md rev-6 §5.1 · §7 Phase 1 · §10 D1/D3.
 *
 * Phase 1 changes no injection path. This module only extracts rule-unit bodies
 * from their canonical sources by anchor, digests them, and gates the registry:
 *   - anchors resolve deterministically and uniquely (P5 — no SSOT copy)
 *   - every registered unit carries grade/layer/surface (G2 — 미분류 0)
 *   - pinned set follows the D3 3-source decomposition, not free-hand editing
 *   - source files carry a file-level digest + triage receipt (review F2)
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type Grade = "H" | "G" | "A" | "J";
export type PinSource = "grade-J" | "silent-deny-H" | "owner";

export type AnchorKind = "heading" | "row" | "bullet";
export type Anchor = { kind: AnchorKind; heading: string; label?: string };

export type RuleUnit = {
  id: string;
  source: { file: string; anchor: string; sha8: string };
  grade: Grade;
  layer: string[];
  surface: string[];
  triggers: string[];
  pin: boolean;
  pin_source?: PinSource;
  guard?: { deny_visible?: boolean };
  cost_chars: number;
};

export type SourceFile = {
  file: string;
  sha8: string;
  triage: { for_sha8: string; note: string; at: string };
};

export type Registry = {
  version: number;
  policy_version: string;
  sources: SourceFile[];
  units: RuleUnit[];
};

export const GRADES: readonly Grade[] = ["H", "G", "A", "J"];
export const LAYERS: readonly string[] = ["L0", "L1", "L2", "L3", "L4", "L5"];
const ROOT = join(import.meta.dir, "..");

export function sha8(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex").slice(0, 8);
}

export function normalizeLf(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

/**
 * Anchor grammar (§11 “앵커 문법은 Phase 1에서 확정한다”).
 *
 *   heading:<exact heading line>              → heading block until the next same-or-shallower heading
 *   row:<exact heading line>|<row label>      → one table row inside that heading block
 *   bullet:<exact heading line>|<body prefix> → one bullet (plus its indented continuation lines)
 *
 * Every anchor must match exactly once. Zero or multiple matches is an error, never a guess —
 * that is what makes extraction deterministic and keeps the registry from silently drifting.
 */
export function parseAnchor(anchor: string): Anchor {
  const separator = anchor.indexOf(":");
  if (separator < 0) throw new Error(`anchor missing kind prefix: ${anchor}`);
  const kind = anchor.slice(0, separator);
  const rest = anchor.slice(separator + 1);
  if (kind === "heading") {
    if (!rest.trim()) throw new Error(`anchor heading empty: ${anchor}`);
    return { kind, heading: rest };
  }
  if (kind === "row" || kind === "bullet") {
    const pipe = rest.indexOf("|");
    if (pipe < 0) throw new Error(`anchor ${kind} needs "<heading>|<label>": ${anchor}`);
    const heading = rest.slice(0, pipe);
    const label = rest.slice(pipe + 1);
    if (!heading.trim() || !label.trim())
      throw new Error(`anchor ${kind} has empty part: ${anchor}`);
    return { kind, heading, label };
  }
  throw new Error(`unknown anchor kind: ${kind}`);
}

function headingLevel(line: string): number {
  const match = /^(#{1,6})\s+\S/.exec(line);
  return match ? match[1]!.length : 0;
}

function headingBlock(lines: string[], heading: string): { start: number; end: number } {
  const indices = lines.flatMap((line, index) => (line === heading ? [index] : []));
  if (indices.length !== 1) {
    throw new Error(
      `anchor heading ${JSON.stringify(heading)}: expected exactly 1, got ${indices.length}`,
    );
  }
  const start = indices[0]!;
  const level = headingLevel(heading);
  if (level === 0) throw new Error(`anchor heading is not a markdown heading: ${heading}`);
  let end = start + 1;
  while (end < lines.length) {
    const current = headingLevel(lines[end]!);
    if (current > 0 && current <= level) break;
    end++;
  }
  return { start, end };
}

function rowLabel(line: string): string | null {
  const match = /^\|\s*([^|]+?)\s*\|/.exec(line);
  return match?.[1]?.replaceAll("**", "").replaceAll("`", "").replaceAll("~~", "").trim() ?? null;
}

/** Bullets and numbered list items both carry rule units (CLAUDE.md standing rules are numbered). */
function bulletBody(line: string): string | null {
  const match = /^(?:[-*]|\d+\.)\s+(.*)$/.exec(line);
  return match?.[1]?.replaceAll("**", "").replaceAll("`", "").trim() ?? null;
}

export function extractUnitBody(source: string, anchor: string): string {
  const parsed = parseAnchor(anchor);
  const lines = normalizeLf(source).split("\n");
  const block = headingBlock(lines, parsed.heading);
  const body = lines.slice(block.start, block.end);

  if (parsed.kind === "heading") return body.join("\n").trimEnd();

  if (parsed.kind === "row") {
    const matches = body.filter((line) => rowLabel(line) === parsed.label);
    if (matches.length !== 1) {
      throw new Error(
        `anchor row ${JSON.stringify(parsed.label)}: expected exactly 1, got ${matches.length}`,
      );
    }
    return matches[0]!.trimEnd();
  }

  const starts = body.flatMap((line, index) =>
    bulletBody(line)?.startsWith(parsed.label!) ? [index] : [],
  );
  if (starts.length !== 1) {
    throw new Error(
      `anchor bullet ${JSON.stringify(parsed.label)}: expected exactly 1, got ${starts.length}`,
    );
  }
  const start = starts[0]!;
  let end = start + 1;
  while (end < body.length && /^\s{2,}\S/.test(body[end]!)) end++;
  return body.slice(start, end).join("\n").trimEnd();
}

/**
 * D3 — pinned set decomposes into three sources, so `pin` is a derived value the
 * registry must agree with, not an editorial choice: grade J pins automatically,
 * an H whose guard deny is not visible pins automatically (review delta ①), and
 * anything else must be an explicit owner declaration subject to reviewer audit.
 */
export function derivePin(unit: Pick<RuleUnit, "grade" | "guard" | "pin_source">): {
  pin: boolean;
  pin_source?: PinSource;
} {
  if (unit.grade === "J") return { pin: true, pin_source: "grade-J" };
  if (unit.grade === "H" && unit.guard?.deny_visible !== true) {
    return { pin: true, pin_source: "silent-deny-H" };
  }
  if (unit.pin_source === "owner") return { pin: true, pin_source: "owner" };
  return { pin: false };
}

function validateUnitSchema(unit: RuleUnit, index: number): string[] {
  const where = unit.id || `units[${index}]`;
  const errors: string[] = [];
  if (!unit.id) errors.push(`${where}: missing id`);
  if (!unit.source?.file || !unit.source?.anchor)
    errors.push(`${where}: missing source file/anchor`);
  if (!GRADES.includes(unit.grade)) errors.push(`${where}: grade must be H/G/A/J (G2 미분류 0)`);
  if (!unit.layer?.length) errors.push(`${where}: missing layer (G2 미분류 0)`);
  for (const layer of unit.layer ?? []) {
    if (!LAYERS.includes(layer)) errors.push(`${where}: unknown layer ${layer}`);
  }
  if (!unit.surface?.length) errors.push(`${where}: missing surface (G2 미분류 0)`);
  if (unit.grade === "H" && unit.guard?.deny_visible === undefined) {
    errors.push(`${where}: H unit must record guard.deny_visible (delta ①)`);
  }
  return errors;
}

/**
 * Routing payload budget — one hook slot's cap, in chars (PREREG §2).
 *
 * Same derivation as `session-context.ts` HARD_CAP and `norms-receipt.ts`
 * CLAUDE_NORMS_CHAR_BUDGET: a conservative margin under the platform's per-hook
 * 10,000-char silent truncation. Changing it is an E4 expiry, not a tuning knob.
 */
export const RULES_BUDGET_CHARS = 9500;

/**
 * Category → surface join (`RULE-CATEGORIES.md` §1 — owner-declared canon, 10 categories).
 *
 * The table is owner canon, so this constant mirrors it rather than deriving it; the
 * coverage assert below fails if the registry grows a surface no category claims.
 */
export const CATEGORY_SURFACES: Readonly<Record<string, readonly string[]>> = {
  "session-start": ["session-start"],
  gate: ["gate"],
  planning: ["planning"],
  delegation: ["delegation"],
  dispatch: ["dispatch"],
  implementation: ["implementation"],
  verification: ["verification"],
  review: ["review"],
  ship: ["ship"],
  platform: ["platform", "bridge"],
};

/**
 * PREREG §7 E1/E2 expiry asserts — the sealed `M7b = 0` conclusion (PREREG §3.2) holds
 * only while every category union, and the full registry, fit inside RULES_BUDGET_CHARS.
 *
 * This is the machine guard for a document rule: expiry monitoring left to memory would
 * reproduce P-A (the very failure the router exists to fix). Strengthening the gate is
 * not a pre-registration violation — the sealed numbers are unchanged.
 */
export function checkPreregExpiry(units: RuleUnit[]): string[] {
  const errors: string[] = [];
  const cost = (list: RuleUnit[]) => list.reduce((sum, u) => sum + (u.cost_chars || 0), 0);
  const total = cost(units);
  if (total > RULES_BUDGET_CHARS) {
    errors.push(
      `PREREG §7 E1 만료 — registry total ${total} chars > B_rules ${RULES_BUDGET_CHARS}; ` +
        `"M7b = 0" 인용 금지 (재측정 전 A 확정 결론 무효)`,
    );
  }

  const claimed = new Set(Object.values(CATEGORY_SURFACES).flat());
  const present = new Set(units.flatMap((unit) => unit.surface ?? []));
  for (const surface of [...present].sort()) {
    if (!claimed.has(surface)) {
      errors.push(
        `PREREG §7 E3 — surface "${surface}" is claimed by no category ` +
          `(RULE-CATEGORIES.md §1); category canon needs an owner revision`,
      );
    }
  }

  const pinnedCost = cost(units.filter((unit) => unit.pin));
  for (const [category, surfaces] of Object.entries(CATEGORY_SURFACES)) {
    const routed = units.filter(
      (unit) => !unit.pin && (unit.surface ?? []).some((s) => surfaces.includes(s)),
    );
    const union = pinnedCost + cost(routed);
    if (union > RULES_BUDGET_CHARS) {
      errors.push(
        `PREREG §7 E2 만료 — category "${category}" union ${union} chars > B_rules ` +
          `${RULES_BUDGET_CHARS}; "M7b = 0" 인용 금지`,
      );
    }
  }
  return errors;
}

export function validateRegistry(
  registry: Registry,
  readSource: (file: string) => string,
): { errors: string[]; report: string[] } {
  const errors: string[] = [];
  const report: string[] = [];

  if (registry.version !== 1) errors.push(`registry version must be 1, got ${registry.version}`);
  if (!registry.policy_version) errors.push("registry missing policy_version");

  const declaredFiles = new Set<string>();
  for (const source of registry.sources ?? []) {
    if (declaredFiles.has(source.file)) errors.push(`${source.file}: duplicate source entry`);
    declaredFiles.add(source.file);
    let live: string;
    try {
      live = readSource(source.file);
    } catch {
      errors.push(`${source.file}: source file unreadable`);
      continue;
    }
    const liveSha = sha8(normalizeLf(live));
    if (liveSha !== source.sha8) {
      errors.push(
        `${source.file}: file digest ${source.sha8} → ${liveSha} — registry triage receipt required ` +
          `(신규 유닛 N건 등록 / 신규 유닛 없음, then set sha8 + triage.for_sha8)`,
      );
      continue;
    }
    if (source.triage?.for_sha8 !== liveSha) {
      errors.push(
        `${source.file}: triage receipt covers ${source.triage?.for_sha8 ?? "(none)"}, live digest is ${liveSha}`,
      );
      continue;
    }
    if (!source.triage.note?.trim()) errors.push(`${source.file}: triage receipt note is empty`);
  }

  const seen = new Set<string>();
  for (const [index, unit] of (registry.units ?? []).entries()) {
    const schemaErrors = validateUnitSchema(unit, index);
    errors.push(...schemaErrors);
    if (schemaErrors.length > 0) continue;
    if (seen.has(unit.id)) errors.push(`${unit.id}: duplicate unit id`);
    seen.add(unit.id);

    if (!declaredFiles.has(unit.source.file)) {
      errors.push(`${unit.id}: source file ${unit.source.file} is not declared in sources[]`);
      continue;
    }

    let body: string;
    try {
      body = extractUnitBody(readSource(unit.source.file), unit.source.anchor);
    } catch (error) {
      errors.push(`${unit.id}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    const liveSha = sha8(body);
    if (liveSha !== unit.source.sha8) {
      errors.push(`${unit.id}: unit digest ${unit.source.sha8} → ${liveSha} (source text changed)`);
    }
    if (body.length !== unit.cost_chars) {
      errors.push(`${unit.id}: cost_chars ${unit.cost_chars} → ${body.length}`);
    }

    const derived = derivePin(unit);
    if (derived.pin !== unit.pin) {
      errors.push(
        `${unit.id}: pin must be ${derived.pin} by D3 (${derived.pin_source ?? "not pinned"}), registry says ${unit.pin}`,
      );
    } else if (derived.pin && derived.pin_source !== unit.pin_source) {
      errors.push(
        `${unit.id}: pin_source must be ${derived.pin_source}, registry says ${unit.pin_source ?? "(none)"}`,
      );
    } else if (!derived.pin && unit.pin_source) {
      errors.push(`${unit.id}: pin_source set on an unpinned unit`);
    }
  }

  const units = registry.units ?? [];
  const byGrade = GRADES.map(
    (grade) => `${grade}=${units.filter((u) => u.grade === grade).length}`,
  );
  const pinned = units.filter((unit) => unit.pin);
  const pinnedBySource = (["grade-J", "silent-deny-H", "owner"] as const).map(
    (src) => `${src}=${pinned.filter((unit) => unit.pin_source === src).length}`,
  );
  errors.push(...checkPreregExpiry(units));

  const totalCost = units.reduce((sum, u) => sum + (u.cost_chars || 0), 0);
  const pinnedCost = pinned.reduce((sum, u) => sum + (u.cost_chars || 0), 0);
  const worstUnion = Math.max(
    ...Object.values(CATEGORY_SURFACES).map(
      (surfaces) =>
        pinnedCost +
        units
          .filter((unit) => !unit.pin && (unit.surface ?? []).some((s) => surfaces.includes(s)))
          .reduce((sum, u) => sum + (u.cost_chars || 0), 0),
    ),
  );
  report.push(
    `rules registry: v${registry.version} · policy ${registry.policy_version}`,
    `sources: ${registry.sources?.length ?? 0} files (file digest + triage receipt)`,
    `units: ${units.length} · grades ${byGrade.join(" ")} · unclassified 0 required (G2)`,
    `pinned: ${pinned.length} · ${pinnedBySource.join(" ")} (D3 3원천)`,
    `routable: ${units.length - pinned.length} · budget ${totalCost} chars`,
    `PREREG E1/E2: total ${totalCost} · worst category union ${worstUnion} / B_rules ${RULES_BUDGET_CHARS} chars`,
  );
  return { errors, report };
}

export function parseRegistry(text: string): Registry {
  const parsed = Bun.YAML.parse(text) as Registry;
  if (!parsed || typeof parsed !== "object") throw new Error("registry.yaml is not a mapping");
  return parsed;
}

export function readLiveRegistry(root = ROOT): Registry {
  return parseRegistry(readFileSync(join(root, "rules/registry.yaml"), "utf8"));
}

export function runRulesCheck(root = ROOT): { ok: boolean; report: string; errors: string[] } {
  const readSource = (file: string) => readFileSync(join(root, file), "utf8");
  const registry = readLiveRegistry(root);
  const first = validateRegistry(registry, readSource);
  const second = validateRegistry(readLiveRegistry(root), readSource);
  const errors = [...first.errors];
  if (
    first.report.join("\n") !== second.report.join("\n") ||
    first.errors.length !== second.errors.length
  ) {
    errors.push("rules extraction is not deterministic");
  }
  return { ok: errors.length === 0, report: first.report.join("\n"), errors };
}

function main(): void {
  try {
    const result = runRulesCheck();
    process.stdout.write(`${result.report}\n`);
    if (!result.ok) {
      for (const error of result.errors) process.stderr.write(`rules:check FAIL — ${error}\n`);
      process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(
      `rules-registry FAIL — ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}

if (import.meta.main) main();
