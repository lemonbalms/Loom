/**
 * Deterministic NORMS-RECEIPT extractor and host budget gate.
 *
 * Authority: docs/spikes/SESSION-START-UNIFIED-PROPOSE.md rev-3 §7.3.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type NormPackName = "core" | "lexicon" | "traps-norm";
export type NormPack = { name: NormPackName; body: string; sha8: string };
export type NormSources = { agents: string; sessionStart: string; traps: string };
export type NormsFormat = "raw" | "claude-json" | "codex-plain";

export const NORM_PACK_ORDER: readonly NormPackName[] = ["core", "lexicon", "traps-norm"];
export const CLAUDE_NORMS_CHAR_BUDGET = 9500;
export const CODEX_NORMS_TOKEN_BUDGET = 2500;
export const OMISSION_MARKER_RE =
  /(?:channel\s+omission|head\/tail|warning:\s*truncated\s+output|output\s+(?:was\s+)?truncated|\[\.\.\.[^\]\n]*\bomitted\b[^\]\n]*\]|<[^>\n]*\bomitted\b[^>\n]*>|…\s*omitted)/i;

const ROOT = join(import.meta.dir, "..");
const CORE_ROWS = [
  "Autonomy (default)",
  "Next-action test",
  "Verify",
  "Commit/push",
  "Impl delegation",
] as const;

export function normalizeLf(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

function sha8(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex").slice(0, 8);
}

function exactHeadingIndices(lines: string[], heading: string): number[] {
  return lines.flatMap((line, index) => (line === heading ? [index] : []));
}

function extractUniqueH2(source: string, title: string): string {
  const lines = normalizeLf(source).split("\n");
  const heading = `## ${title}`;
  const indices = exactHeadingIndices(lines, heading);
  if (indices.length !== 1) {
    throw new Error(`${heading}: expected exactly 1 heading, got ${indices.length}`);
  }
  const start = indices[0]!;
  const relativeEnd = lines.slice(start + 1).findIndex((line) => /^##\s+/.test(line));
  const end = relativeEnd < 0 ? lines.length : start + 1 + relativeEnd;
  return lines.slice(start, end).join("\n").trimEnd();
}

function tableRowLabel(line: string): string | null {
  const match = /^\|\s*([^|]+?)\s*\|/.exec(line);
  return match?.[1]?.replaceAll("**", "").replaceAll("`", "").trim() ?? null;
}

export function extractCorePack(agentsSource: string): string {
  const normalized = normalizeLf(agentsSource);
  const standing = extractUniqueH2(normalized, "Standing rules");
  const standingLines = standing.split("\n");
  const selectedRows = CORE_ROWS.map((wanted) => {
    const matches = standingLines.filter((line) => tableRowLabel(line) === wanted);
    if (matches.length !== 1) {
      throw new Error(`core row ${wanted}: expected exactly 1, got ${matches.length}`);
    }
    return matches[0]!;
  });

  const allLines = normalized.split("\n");
  const pauseHeading = "### Pause only when (true blockers)";
  const pauseIndices = exactHeadingIndices(allLines, pauseHeading);
  if (pauseIndices.length !== 1) {
    throw new Error(`${pauseHeading}: expected exactly 1 heading, got ${pauseIndices.length}`);
  }

  const pauseStart = pauseIndices[0]!;
  let firstBullet = pauseStart + 1;
  while (firstBullet < allLines.length && allLines[firstBullet]!.trim() === "") firstBullet++;
  if (!/^[-*]\s+/.test(allLines[firstBullet] ?? "")) {
    throw new Error(`${pauseHeading}: bullet list missing or empty`);
  }
  let pauseEnd = firstBullet;
  let bulletCount = 0;
  while (pauseEnd < allLines.length) {
    const line = allLines[pauseEnd]!;
    if (/^[-*]\s+/.test(line)) {
      bulletCount++;
      pauseEnd++;
      continue;
    }
    if (/^\s{2,}\S/.test(line) || line.trim() === "") {
      pauseEnd++;
      continue;
    }
    break;
  }
  if (bulletCount === 0) throw new Error(`${pauseHeading}: bullet list missing or empty`);
  const pause = allLines.slice(pauseStart, pauseEnd).join("\n").trimEnd();
  return `${selectedRows.join("\n")}\n\n${pause}`;
}

export function extractLexiconPack(sessionStartSource: string): string {
  const section = extractUniqueH2(sessionStartSource, "Triggers + precedence");
  const lines = section.split("\n");
  for (const heading of ["### Precedence", "### Capability masks"]) {
    const count = exactHeadingIndices(lines, heading).length;
    if (count !== 1) throw new Error(`lexicon ${heading}: expected exactly 1, got ${count}`);
  }
  if (!section.includes("### Composite utterances (acceptance #12)")) {
    throw new Error("lexicon composite utterances: missing acceptance #12 section");
  }
  if (!/^\| Trigger \| Template \| read \| write\/impl \| commit\/push \|$/m.test(section)) {
    throw new Error("lexicon capability-mask table missing");
  }
  return section;
}

export function extractTrapsNormPack(trapsSource: string): string {
  const section = extractUniqueH2(trapsSource, "하지 말 것");
  if (!/^[-*]\s+\S/m.test(section)) throw new Error("traps-norm section missing or empty");
  return section;
}

export function extractNormPacks(sources: NormSources): NormPack[] {
  const bodies: Record<NormPackName, string> = {
    core: extractCorePack(sources.agents),
    lexicon: extractLexiconPack(sources.sessionStart),
    "traps-norm": extractTrapsNormPack(sources.traps),
  };
  return NORM_PACK_ORDER.map((name) => ({ name, body: bodies[name], sha8: sha8(bodies[name]) }));
}

export function buildNormsEnvelope(packs: readonly NormPack[]): string {
  const names = packs.map((pack) => pack.name);
  if (names.join("|") !== NORM_PACK_ORDER.join("|")) {
    throw new Error(`norm pack order must be ${NORM_PACK_ORDER.join(" → ")}`);
  }
  for (const pack of packs) {
    if (!pack.body) throw new Error(`${pack.name}: empty body`);
    if (pack.sha8 !== sha8(pack.body)) throw new Error(`${pack.name}: stale digest metadata`);
  }
  const manifest = packs.map((pack) => `${pack.name}@${pack.sha8}`).join(" ");
  const parts = [`[LOOM-NORMS-BEGIN v1 · packs: ${manifest}]`];
  for (const pack of packs) {
    parts.push(
      `[LOOM-NORMS-PACK-BEGIN ${pack.name}]`,
      pack.body,
      `[LOOM-NORMS-PACK-END ${pack.name}]`,
    );
  }
  parts.push("[LOOM-NORMS-END v1]");
  return parts.join("\n");
}

export function validateNormsEnvelope(envelope: string, canonical: readonly NormPack[]): string[] {
  const errors: string[] = [];
  if (OMISSION_MARKER_RE.test(envelope))
    errors.push("norms envelope contains channel omission marker");
  const manifest = canonical.map((pack) => `${pack.name}@${pack.sha8}`).join(" ");
  const outerBegin = `[LOOM-NORMS-BEGIN v1 · packs: ${manifest}]`;
  const outerEnd = "[LOOM-NORMS-END v1]";
  if (!envelope.startsWith(`${outerBegin}\n`) || envelope.split(outerBegin).length !== 2) {
    errors.push("outer BEGIN missing, duplicate, or stale");
  }
  if (!envelope.endsWith(outerEnd) || envelope.split(outerEnd).length !== 2) {
    errors.push("outer END missing or duplicate");
  }
  for (const pack of canonical) {
    const begin = `[LOOM-NORMS-PACK-BEGIN ${pack.name}]`;
    const end = `[LOOM-NORMS-PACK-END ${pack.name}]`;
    if (envelope.split(begin).length !== 2) errors.push(`${pack.name}: BEGIN missing or duplicate`);
    if (envelope.split(end).length !== 2) errors.push(`${pack.name}: END missing or duplicate`);
    if (!envelope.includes(`${begin}\n${pack.body}\n${end}`)) {
      errors.push(`${pack.name}: body missing, empty, or stale`);
    }
    if (!envelope.includes(`${pack.name}@${pack.sha8}`)) {
      errors.push(`${pack.name}: digest metadata missing or stale`);
    }
  }
  return errors;
}

export function formatNormsOutput(envelope: string, format: NormsFormat): string {
  if (format === "raw" || format === "codex-plain") return envelope;
  return JSON.stringify({
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: envelope },
  });
}

export type NormsBudget = {
  chars: number;
  bytes: number;
  claude: "enabled" | "overflow";
  codex: "disabled-token-unmeasured";
  grok: "ritual-only";
};

export function measureNormsBudget(envelope: string): NormsBudget {
  const chars = envelope.length;
  return {
    chars,
    bytes: new TextEncoder().encode(envelope).length,
    claude: chars <= CLAUDE_NORMS_CHAR_BUDGET ? "enabled" : "overflow",
    codex: "disabled-token-unmeasured",
    grok: "ritual-only",
  };
}

function collectCommands(value: unknown): string[] {
  if (typeof value === "string") return [];
  if (Array.isArray(value)) return value.flatMap(collectCommands);
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const own = typeof record.command === "string" ? [record.command] : [];
  return own.concat(Object.values(record).flatMap(collectCommands));
}

function sessionStartCommands(settings: unknown): string[] {
  if (!settings || typeof settings !== "object") return [];
  const hooks = (settings as Record<string, unknown>).hooks;
  if (!hooks || typeof hooks !== "object") return [];
  return collectCommands((hooks as Record<string, unknown>).SessionStart);
}

export function validateHostWiring(options: {
  claudeSettings: unknown;
  codexHooks: unknown;
  budget: NormsBudget;
}): string[] {
  const errors: string[] = [];
  const claudeNorms = sessionStartCommands(options.claudeSettings).filter((command) =>
    command.includes("norms-receipt.ts"),
  );
  const codexNorms = sessionStartCommands(options.codexHooks).filter((command) =>
    command.includes("norms-receipt.ts"),
  );
  if (options.budget.claude === "enabled") {
    if (claudeNorms.length !== 1 || !claudeNorms[0]!.includes("--format claude-json")) {
      errors.push("Claude NORMS accelerator must have exactly one claude-json command");
    }
  } else if (claudeNorms.length > 0) {
    errors.push("Claude NORMS accelerator wired while over budget");
  }
  if (codexNorms.length > 0) {
    errors.push("Codex NORMS accelerator must stay disabled until exact token measurement passes");
  }
  return errors;
}

export function readLiveNormSources(root = ROOT): NormSources {
  return {
    agents: readFileSync(join(root, "AGENTS.md"), "utf8"),
    sessionStart: readFileSync(join(root, "docs/SESSION-START.md"), "utf8"),
    traps: readFileSync(join(root, "tasks/traps.md"), "utf8"),
  };
}

export function runNormsCheck(root = ROOT): { ok: boolean; report: string; errors: string[] } {
  const packs = extractNormPacks(readLiveNormSources(root));
  const envelope = buildNormsEnvelope(packs);
  const repeat = buildNormsEnvelope(extractNormPacks(readLiveNormSources(root)));
  const budget = measureNormsBudget(envelope);
  const errors = validateNormsEnvelope(envelope, packs);
  if (repeat !== envelope) errors.push("norms extraction is not deterministic");
  const claudeSettings = JSON.parse(readFileSync(join(root, ".claude/settings.json"), "utf8"));
  const codexHooks = JSON.parse(readFileSync(join(root, ".codex/hooks.json"), "utf8"));
  errors.push(...validateHostWiring({ claudeSettings, codexHooks, budget }));
  const packLine = packs.map((pack) => `${pack.name}@${pack.sha8}`).join(" · ");
  const report = [
    `norms packs: ${packLine}`,
    `envelope: ${budget.chars} chars · ${budget.bytes} bytes`,
    `Claude: ${budget.claude} / ${CLAUDE_NORMS_CHAR_BUDGET} chars`,
    `Codex: ${budget.codex} / ${CODEX_NORMS_TOKEN_BUDGET} tokens`,
    `Grok: ${budget.grok}`,
  ].join("\n");
  return { ok: errors.length === 0, report, errors };
}

function parseFormat(argv: string[]): NormsFormat {
  const index = argv.indexOf("--format");
  const value = index >= 0 ? argv[index + 1] : "raw";
  if (value === "raw" || value === "claude-json" || value === "codex-plain") return value;
  throw new Error(`unknown norms format: ${value ?? "(missing)"}`);
}

function main(): void {
  try {
    if (process.argv.includes("--check")) {
      const result = runNormsCheck();
      process.stdout.write(`${result.report}\n`);
      if (!result.ok) {
        for (const error of result.errors) process.stderr.write(`norms:check FAIL — ${error}\n`);
        process.exitCode = 1;
      }
      return;
    }
    const packs = extractNormPacks(readLiveNormSources());
    const envelope = buildNormsEnvelope(packs);
    process.stdout.write(formatNormsOutput(envelope, parseFormat(process.argv.slice(2))));
  } catch (error) {
    process.stderr.write(
      `norms-receipt FAIL — ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}

if (import.meta.main) main();
