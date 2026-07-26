/**
 * Deterministic Phase 2 replay sample draw (PREREG §6 · S4).
 *
 * The pre-registration is only checkable if the sample is fixed *before* the replay
 * runs and cannot be redrawn afterwards. So this script is pure with respect to its
 * inputs: same corpus + same seed → same 60 sessions, no PRNG involved.
 *
 *   population = top-level `<corpus>/*.jsonl` (one file = one session)
 *   exclusions = <5 turns · 0 tool calls · self-referencing sessions
 *   recent 30  = newest by mtime
 *   random 30  = sha256(seed ‖ sessionId) ascending, holdout = first 15 of those
 *
 * Writes `rules/prereg-sample.json` (IDs + digests only — no transcript content) and,
 * with --archive, copies the drawn sessions so the replay reads a frozen copy. The
 * corpus directory is not immutable: propose §6.1 recorded 257 sessions and the same
 * predicate now yields 171, which is exactly why the sample must be frozen.
 *
 * Usage: bun run scripts/prereg-sample.ts [--archive] [--check]
 */
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const SEED = "rule-router-phase2";
export const RECENT_N = 30;
export const RANDOM_N = 30;
export const HOLDOUT_N = 15;
export const MIN_TURNS = 5;

const ROOT = join(import.meta.dir, "..");
export const CORPUS = join(homedir(), ".claude/projects/-Users-kyoungsiklee-projects-fable-advisor");
export const ARCHIVE = join(homedir(), ".loom/prereg/rule-router-2026-07-26");
const RECEIPT = join(ROOT, "rules/prereg-sample.json");

export type SessionStat = {
  id: string;
  mtimeMs: number;
  bytes: number;
  turns: number;
  toolCalls: number;
  selfRef: boolean;
};

const sha8 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex").slice(0, 8);
const rankKey = (id: string) => createHash("sha256").update(`${SEED}${id}`, "utf8").digest("hex");

/** Exclusion ③ is a machine predicate, not a judgement call (advisor N4). */
export function isSelfReferencing(text: string): boolean {
  return text.includes("RULE-ROUTER") || text.includes("rules/registry");
}

export function readSessionStats(dir = CORPUS): SessionStat[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".jsonl"))
    .map((name) => {
      const path = join(dir, name);
      const text = readFileSync(path, "utf8");
      return {
        id: name.replace(/\.jsonl$/, ""),
        mtimeMs: statSync(path).mtimeMs,
        bytes: text.length,
        turns: (text.match(/"type":"user"/g) ?? []).length,
        toolCalls: (text.match(/"type":"tool_use"/g) ?? []).length,
        selfRef: isSelfReferencing(text),
      };
    })
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

export function excludeReason(stat: SessionStat): string | null {
  if (stat.selfRef) return "self-reference";
  if (stat.turns < MIN_TURNS) return "under-5-turns";
  if (stat.toolCalls === 0) return "no-tool-calls";
  return null;
}

export type Draw = {
  seed: string;
  population: { count: number; digest: string };
  excluded: { id: string; reason: string }[];
  eligible: number;
  recent: string[];
  random: string[];
  holdout: string[];
};

export function drawSample(stats: SessionStat[]): Draw {
  const population = {
    count: stats.length,
    // Sorted before digesting: the snapshot must not depend on directory read order (§6.6.1 R2).
    digest: sha8(
      stats
        .map((s) => s.id)
        .sort()
        .join("\n"),
    ),
  };
  const excluded = stats
    .map((s) => ({ id: s.id, reason: excludeReason(s) }))
    .filter((e): e is { id: string; reason: string } => e.reason !== null);
  const excludedIds = new Set(excluded.map((e) => e.id));
  const eligible = stats.filter((s) => !excludedIds.has(s.id));

  const recent = [...eligible]
    .sort((a, b) => b.mtimeMs - a.mtimeMs || (a.id < b.id ? -1 : 1))
    .slice(0, RECENT_N)
    .map((s) => s.id);

  const recentSet = new Set(recent);
  const random = eligible
    .filter((s) => !recentSet.has(s.id))
    .map((s) => s.id)
    .sort((a, b) => (rankKey(a) < rankKey(b) ? -1 : 1))
    .slice(0, RANDOM_N);

  return {
    seed: SEED,
    population,
    excluded,
    eligible: eligible.length,
    recent,
    random,
    holdout: random.slice(0, HOLDOUT_N),
  };
}

function main(): void {
  const archive = process.argv.includes("--archive");
  const check = process.argv.includes("--check");
  const stats = readSessionStats();
  const draw = drawSample(stats);
  const sample = [...draw.recent, ...draw.random];

  const digests: Record<string, string> = {};
  for (const id of sample) {
    const text = readFileSync(join(CORPUS, `${id}.jsonl`), "utf8");
    digests[id] = sha8(text);
    if (archive) {
      mkdirSync(ARCHIVE, { recursive: true });
      copyFileSync(join(CORPUS, `${id}.jsonl`), join(ARCHIVE, `${id}.jsonl`));
    }
  }

  const receipt = {
    prereg: "RULE-ROUTER-PREREG rev-4 · S4",
    sealed_at: "2026-07-26",
    corpus: CORPUS.replace(homedir(), "~"),
    archive: ARCHIVE.replace(homedir(), "~"),
    seed: draw.seed,
    algorithm: "sha256(seed‖sessionId) ascending; recent = mtime desc; holdout = first 15 of random",
    population: draw.population,
    eligible: draw.eligible,
    excluded_count: draw.excluded.length,
    excluded: draw.excluded,
    recent: draw.recent,
    random: draw.random,
    holdout: draw.holdout,
    digests,
  };

  if (check) {
    const prior = JSON.parse(readFileSync(RECEIPT, "utf8"));
    const same =
      JSON.stringify(prior.recent) === JSON.stringify(draw.recent) &&
      JSON.stringify(prior.random) === JSON.stringify(draw.random);
    console.log(
      same
        ? `prereg sample: draw reproduces receipt (${sample.length} sessions)`
        : `prereg sample: DRIFT — corpus changed; the archived copy under ${receipt.archive} is authoritative`,
    );
    return;
  }

  writeFileSync(RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(
    [
      `prereg sample: population ${draw.population.count} · digest ${draw.population.digest}`,
      `excluded ${draw.excluded.length} · eligible ${draw.eligible}`,
      `sample ${sample.length} = recent ${draw.recent.length} + random ${draw.random.length} · holdout ${draw.holdout.length}`,
      archive ? `archived → ${receipt.archive}` : "receipt only (pass --archive to freeze copies)",
    ].join("\n"),
  );
}

if (import.meta.main) main();
