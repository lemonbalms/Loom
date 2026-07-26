/**
 * Phase 2 shadow replay evaluator — candidate A (deterministic router).
 *
 * Authority: docs/spikes/RULE-ROUTER-PREREG.md rev-4 (sealed) §3 · §5 · §6 ·
 * docs/spikes/RULE-ROUTER-PROPOSE.md rev-9 §5.2 · §6.2 · §6.4 · docs/spikes/RULE-CATEGORIES.md.
 *
 * Shadow mode is the point (propose §6.4): the router only *decides* here and the decision is
 * logged. No injection path changes, so recall is measured at zero risk to a live session.
 *
 * What is measured, and nothing else:
 *   M7a     — turns no category claims (UNKNOWN). Category-table coverage signal (S1-3, ≥15%).
 *   M7b     — turns whose selection exceeds B_rules. Arithmetically 0 while the registry fits (§3.2).
 *   recall  — risk-weighted recall over *routable* units, miss weights A=3 · G=2 · H=1 (S3-1..2).
 *   J-miss  — pinned units missed. A contract test on the pin wiring, not a performance number.
 *
 * Sealed inputs this script must not renegotiate: the sample (rules/prereg-sample.json), the
 * frozen archive it reads, the 0.85 gate, the miss weights, and B_rules. It reads the archived
 * copy — never the live corpus — because the corpus directory is not immutable (PREREG §6).
 *
 * Usage: bun run scripts/rule-router-eval.ts [--set eval|holdout|all] [--archive <dir>] [--json]
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  CATEGORY_SURFACES,
  RULES_BUDGET_CHARS,
  type RuleUnit,
  readLiveRegistry,
} from "./rules-registry.ts";

const ROOT = join(import.meta.dir, "..");
export const ARCHIVE = join(homedir(), ".loom/prereg/rule-router-2026-07-26");
const SAMPLE = join(ROOT, "rules/prereg-sample.json");
const RECEIPT = join(ROOT, "rules/rule-router-eval.json");

/** Bumped whenever classification changes — a receipt without it cannot be compared across runs. */
export const ROUTER_VERSION = "A-1";

/** Miss weights (PREREG §5.1, sealed). J is not a routing target; its miss is a contract test. */
export const MISS_WEIGHT: Readonly<Record<string, number>> = { A: 3, G: 2, H: 1 };
export const RECALL_GATE = 0.85;
export const M7A_REVIEW_SIGNAL = 0.15;

/**
 * Owner-utterance lexicon → category (docs/SESSION-START.md trigger table).
 *
 * This is half of candidate A's definition ("발화 트리거 + surface 키워드 + 게이트 상태" — propose
 * §5.2). The other half is the per-unit `triggers` field in the registry.
 */
export const LEXICON_CATEGORIES: Readonly<Record<string, readonly string[]>> = {
  "session-start": ["상태", "status", "핸드오프", "handoff", "리추얼", "세션 시작"],
  gate: ["이어서", "진행해", "자율적으로", "단계적으로", "멈춰", "게이트", "다음 액션"],
  planning: ["계획만", "계획", "plan", "스펙", "unknowns"],
  delegation: ["위임", "서브에이전트", "subagent", "topology", "레인"],
  dispatch: ["디스패치", "dispatch", "워커", "pane", "claim"],
  implementation: ["구현", "고쳐", "수정해", "implement", "패치"],
  verification: ["검증", "테스트", "test", "스모크", "smoke"],
  review: ["리뷰", "review", "verdict", "자문", "승인"],
  ship: ["커밋", "commit", "푸시", "push", "ship", "배포"],
  platform: ["훅", "hook", "claude-mem", "환경변수", "env"],
};

export type Turn = {
  index: number;
  utterance: string;
  /** Read/Edit targets, repo-relative. Positive labels come from here (propose §6.2). */
  touched: string[];
  toolCalls: number;
};

export type Decision = {
  categories: string[];
  unknown: boolean;
  selected: Set<string>;
  cost: number;
};

const sha8 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex").slice(0, 8);

/** Tool names whose `file_path` counts as "this turn actually needed that file" (propose §6.2). */
const READ_EDIT_TOOLS = new Set(["Read", "Edit", "Write", "MultiEdit", "NotebookEdit"]);

function textOf(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;
  // A user record carrying a tool_result is the *continuation* of the current turn, not a new one.
  if (content.some((block) => (block as { type?: string })?.type === "tool_result")) return null;
  const text = content
    .filter((block) => (block as { type?: string })?.type === "text")
    .map((block) => String((block as { text?: string }).text ?? ""))
    .join("\n");
  return text || null;
}

/**
 * Strip harness-injected blocks before classification.
 *
 * System reminders and hook injections are not owner utterances; leaving them in would let the
 * router classify on text the owner never typed, and every session would look like `session-start`.
 */
export function normalizeUtterance(raw: string): string {
  return raw
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, " ")
    .replace(/\[LOOM-(SESSION-CONTEXT|NORMS)[\s\S]*?(END[^\]]*\]|$)/g, " ")
    .replace(/<local-command-stdout>[\s\S]*?<\/local-command-stdout>/g, " ")
    .trim();
}

export function repoRelative(path: string, cwd?: string): string | null {
  if (!path.startsWith("/")) return path;
  const base =
    cwd && path.startsWith(`${cwd}/`) ? cwd : "/Users/kyoungsiklee/projects/fable-advisor";
  return path.startsWith(`${base}/`) ? path.slice(base.length + 1) : null;
}

/**
 * Turn decomposition.
 *
 * A turn opens at a main-transcript user utterance and absorbs every tool call until the next one.
 * `isSidechain` records are subagent context with its own injection path, so they are excluded —
 * PREREG §6 seals that scope, and the consequence (delegation-heavy sessions score conservatively)
 * is sealed with it.
 */
export function parseTurns(jsonl: string): Turn[] {
  const turns: Turn[] = [];
  let current: Turn | null = null;

  for (const line of jsonl.split("\n")) {
    if (!line.trim()) continue;
    let record: Record<string, unknown>;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (record.isSidechain === true || record.isMeta === true) continue;

    if (record.type === "user") {
      const raw = textOf((record.message as { content?: unknown } | undefined)?.content);
      if (raw === null) continue;
      const utterance = normalizeUtterance(raw);
      if (!utterance) continue;
      current = { index: turns.length, utterance, touched: [], toolCalls: 0 };
      turns.push(current);
      continue;
    }

    if (record.type !== "assistant" || !current) continue;
    const content = (record.message as { content?: unknown } | undefined)?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content as {
      type?: string;
      name?: string;
      input?: { file_path?: string };
    }[]) {
      if (block?.type !== "tool_use") continue;
      current.toolCalls++;
      if (!READ_EDIT_TOOLS.has(block.name ?? "")) continue;
      const path = block.input?.file_path;
      if (!path) continue;
      const relative = repoRelative(path, record.cwd as string | undefined);
      if (relative && !current.touched.includes(relative)) current.touched.push(relative);
    }
  }
  return turns;
}

const includesCi = (haystack: string, needle: string) =>
  haystack.toLowerCase().includes(needle.toLowerCase());

/**
 * Candidate A — deterministic classification.
 *
 * Input is deliberately limited to what a router would see *before* the turn runs: the utterance
 * and the session position. Feeding it the turn's own tool calls would leak the label into the
 * prediction and make recall meaningless.
 */
export function classifyTurn(
  utterance: string,
  units: RuleUnit[],
  isFirstTurn: boolean,
): { categories: string[]; unknown: boolean } {
  const matched = new Set<string>();
  if (isFirstTurn) matched.add("session-start");

  for (const [category, triggers] of Object.entries(LEXICON_CATEGORIES)) {
    if (triggers.some((trigger) => includesCi(utterance, trigger))) matched.add(category);
  }

  // Registry `triggers` reach categories through the unit's surfaces — the same join the category
  // table declares, so a keyword can never pull in a surface no category claims.
  for (const unit of units) {
    if (!(unit.triggers ?? []).some((trigger) => includesCi(utterance, trigger))) continue;
    for (const [category, surfaces] of Object.entries(CATEGORY_SURFACES)) {
      if ((unit.surface ?? []).some((surface) => surfaces.includes(surface))) matched.add(category);
    }
  }

  return { categories: [...matched].sort(), unknown: matched.size === 0 };
}

/** UNKNOWN → 전량 (P4 · RULE-CATEGORIES §2 원칙 2). Ambiguity is answered with the union, never a guess. */
export function route(units: RuleUnit[], categories: string[], unknown: boolean): Decision {
  const surfaces = new Set(categories.flatMap((category) => CATEGORY_SURFACES[category] ?? []));
  const selected = new Set<string>();
  for (const unit of units) {
    const claimed = (unit.surface ?? []).some((surface) => surfaces.has(surface));
    if (unit.pin || unknown || claimed) selected.add(unit.id);
  }
  const cost = units
    .filter((unit) => selected.has(unit.id))
    .reduce((sum, unit) => sum + (unit.cost_chars || 0), 0);
  return { categories, unknown, selected, cost };
}

export type Metrics = {
  sessions: number;
  turns: number;
  activeTurns: number;
  m7a: number;
  m7aActive: number;
  m7b: number;
  m7: number;
  recall: number;
  weightHit: number;
  weightTotal: number;
  positiveTurns: number;
  jMiss: number;
  perGrade: Record<string, { hit: number; total: number }>;
  perUnit: Record<string, { positives: number; hits: number }>;
  categoryCounts: Record<string, number>;
  byKind: Record<TurnKind, { turns: number; unknown: number }>;
  meanSelected: number;
  meanCost: number;
  budgetChars: number;
};

/**
 * Turn provenance, for reading M7a honestly.
 *
 * Not every user record is an owner utterance: interrupt markers are harness artifacts and peer
 * notifications arrive from another session. They are still turns (M7a is defined over turns and
 * is not being redefined here), but a coverage signal that turned out to be *only* those would
 * mean something different from one carried by what the owner actually typed.
 */
export type TurnKind = "interrupt" | "peer-message" | "owner-utterance";

export function turnKind(utterance: string): TurnKind {
  if (utterance.startsWith("[Request interrupted")) return "interrupt";
  if (utterance.startsWith("Another Claude session sent a message:")) return "peer-message";
  return "owner-utterance";
}

export function evaluate(sessions: { id: string; text: string }[], units: RuleUnit[]): Metrics {
  const unitsByFile = new Map<string, RuleUnit[]>();
  for (const unit of units) {
    const list = unitsByFile.get(unit.source.file) ?? [];
    list.push(unit);
    unitsByFile.set(unit.source.file, list);
  }
  const budgetChars = units.reduce((sum, unit) => sum + (unit.cost_chars || 0), 0);

  const perGrade: Record<string, { hit: number; total: number }> = {};
  const perUnit: Record<string, { positives: number; hits: number }> = {};
  for (const unit of units) perUnit[unit.id] = { positives: 0, hits: 0 };
  const categoryCounts: Record<string, number> = { UNKNOWN: 0 };
  for (const category of Object.keys(CATEGORY_SURFACES)) categoryCounts[category] = 0;
  const byKind: Record<TurnKind, { turns: number; unknown: number }> = {
    interrupt: { turns: 0, unknown: 0 },
    "peer-message": { turns: 0, unknown: 0 },
    "owner-utterance": { turns: 0, unknown: 0 },
  };

  let turnCount = 0;
  let activeTurns = 0;
  let m7aTurns = 0;
  let m7aActiveTurns = 0;
  let m7bTurns = 0;
  let m7Turns = 0;
  let positiveTurns = 0;
  let weightHit = 0;
  let weightTotal = 0;
  let jMiss = 0;
  let selectedTotal = 0;
  let costTotal = 0;

  for (const session of sessions) {
    const turns = parseTurns(session.text);
    for (const turn of turns) {
      turnCount++;
      if (turn.toolCalls > 0) activeTurns++;
      const kind = byKind[turnKind(turn.utterance)];
      kind.turns++;
      const verdict = classifyTurn(turn.utterance, units, turn.index === 0);
      const decision = route(units, verdict.categories, verdict.unknown);
      selectedTotal += decision.selected.size;
      costTotal += decision.cost;

      if (verdict.unknown) {
        categoryCounts.UNKNOWN!++;
        kind.unknown++;
        m7aTurns++;
        if (turn.toolCalls > 0) m7aActiveTurns++;
      } else {
        for (const category of verdict.categories) categoryCounts[category]!++;
      }
      const overBudget = decision.cost > RULES_BUDGET_CHARS;
      if (overBudget) m7bTurns++;
      if (verdict.unknown || overBudget) m7Turns++;

      const positives = turn.touched.flatMap((file) => unitsByFile.get(file) ?? []);
      if (positives.length > 0) positiveTurns++;
      for (const unit of positives) {
        perUnit[unit.id]!.positives++;
        const hit = decision.selected.has(unit.id);
        if (hit) perUnit[unit.id]!.hits++;
        if (unit.pin) {
          if (!hit) jMiss++;
          continue;
        }
        const weight = MISS_WEIGHT[unit.grade] ?? 0;
        perGrade[unit.grade] ??= { hit: 0, total: 0 };
        const bucket = perGrade[unit.grade]!;
        bucket.total += weight;
        weightTotal += weight;
        if (hit) {
          bucket.hit += weight;
          weightHit += weight;
        }
      }
    }
  }

  return {
    sessions: sessions.length,
    turns: turnCount,
    activeTurns,
    m7a: turnCount ? m7aTurns / turnCount : 0,
    m7aActive: activeTurns ? m7aActiveTurns / activeTurns : 0,
    m7b: turnCount ? m7bTurns / turnCount : 0,
    m7: turnCount ? m7Turns / turnCount : 0,
    recall: weightTotal ? weightHit / weightTotal : 0,
    weightHit,
    weightTotal,
    positiveTurns,
    jMiss,
    perGrade,
    perUnit,
    categoryCounts,
    byKind,
    meanSelected: turnCount ? selectedTotal / turnCount : 0,
    meanCost: turnCount ? costTotal / turnCount : 0,
    budgetChars,
  };
}

export type SampleReceipt = {
  recent: string[];
  random: string[];
  holdout: string[];
  population: { count: number; digest: string };
  digests: Record<string, string>;
};

export function selectSessionIds(sample: SampleReceipt, set: string): string[] {
  const holdout = new Set(sample.holdout);
  const all = [...sample.recent, ...sample.random];
  if (set === "all") return all;
  if (set === "holdout") return all.filter((id) => holdout.has(id));
  return all.filter((id) => !holdout.has(id));
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function main(): void {
  const argv = process.argv.slice(2);
  const setIndex = argv.indexOf("--set");
  const set = setIndex >= 0 ? (argv[setIndex + 1] ?? "eval") : "eval";
  if (!["eval", "holdout", "all"].includes(set)) throw new Error(`unknown --set ${set}`);
  const archiveIndex = argv.indexOf("--archive");
  const archive = archiveIndex >= 0 ? argv[archiveIndex + 1]! : ARCHIVE;

  const registry = readLiveRegistry();
  const sample = JSON.parse(readFileSync(SAMPLE, "utf8")) as SampleReceipt;
  const ids = selectSessionIds(sample, set);
  const sessions = ids.map((id) => ({
    id,
    text: readFileSync(join(archive, `${id}.jsonl`), "utf8"),
  }));

  // The archived copy is authoritative, so prove it is the copy the seal drew (PREREG §6).
  const drift = sessions
    .filter(({ id, text }) => sample.digests[id] !== sha8(text))
    .map((s) => s.id);

  const metrics = evaluate(sessions, registry.units);
  const routable = registry.units.filter((unit) => !unit.pin);
  const unmeasured = routable.filter((unit) => metrics.perUnit[unit.id]!.positives === 0);
  const unmeasuredWeight = unmeasured.reduce(
    (sum, unit) => sum + (MISS_WEIGHT[unit.grade] ?? 0),
    0,
  );
  const routableWeight = routable.reduce((sum, unit) => sum + (MISS_WEIGHT[unit.grade] ?? 0), 0);

  const receipt = {
    prereg: "RULE-ROUTER-PREREG rev-4 · S1/S3 · Phase 2 shadow replay",
    router_version: ROUTER_VERSION,
    policy_version: registry.policy_version,
    candidate: "A · deterministic (lexicon triggers + registry triggers → surface join)",
    set,
    sessions: ids.length,
    archive: archive.replace(homedir(), "~"),
    archive_drift: drift,
    input_hash: sha8([ROUTER_VERSION, registry.policy_version, ...ids].join("\n")),
    sealed: {
      b_rules_chars: RULES_BUDGET_CHARS,
      recall_gate: RECALL_GATE,
      m7a_review_signal: M7A_REVIEW_SIGNAL,
      miss_weight: MISS_WEIGHT,
    },
    measured: {
      turns: metrics.turns,
      active_turns: metrics.activeTurns,
      m7a: metrics.m7a,
      m7a_active_turns: metrics.m7aActive,
      m7b: metrics.m7b,
      m7: metrics.m7,
      risk_weighted_recall: metrics.recall,
      weight_hit: metrics.weightHit,
      weight_total: metrics.weightTotal,
      positive_turns: metrics.positiveTurns,
      j_miss: metrics.jMiss,
      per_grade: metrics.perGrade,
      category_turns: metrics.categoryCounts,
      m7a_by_turn_kind: metrics.byKind,
    },
    // Secondary metrics (§6.3 부수 지표) — how much the router actually narrows, and how much of
    // the weighted mass the label never reaches. Reported, not gated.
    secondary: {
      mean_selected_units: metrics.meanSelected,
      mean_cost_chars: metrics.meanCost,
      registry_total_chars: metrics.budgetChars,
      unmeasured_routable_units: unmeasured.map((unit) => unit.id),
      unmeasured_weight: unmeasuredWeight,
      routable_weight: routableWeight,
    },
    per_unit: metrics.perUnit,
  };

  if (argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
    return;
  }
  writeFileSync(RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`);

  const gate =
    metrics.weightTotal === 0
      ? "UNDER-POWERED (weighted positives = 0 — S3-2 not adjudicable)"
      : metrics.recall >= RECALL_GATE
        ? `PASS ≥ ${RECALL_GATE}`
        : `FAIL < ${RECALL_GATE}`;

  process.stdout.write(
    [
      `rule-router eval: candidate A · router ${ROUTER_VERSION} · policy ${registry.policy_version}`,
      `set ${set}: ${ids.length} sessions · ${metrics.turns} turns (${metrics.activeTurns} with tool calls)` +
        (drift.length ? ` · ARCHIVE DRIFT ${drift.length}` : ""),
      `M7a ${pct(metrics.m7a)} (active-turn ${pct(metrics.m7aActive)} · owner-utterance ` +
        `${pct(metrics.byKind["owner-utterance"].unknown / (metrics.byKind["owner-utterance"].turns || 1))}) ` +
        `· signal at ${pct(M7A_REVIEW_SIGNAL)}`,
      `M7b ${pct(metrics.m7b)} · M7 ${pct(metrics.m7)} · B_rules ${RULES_BUDGET_CHARS} chars`,
      `risk-weighted recall ${metrics.recall.toFixed(3)} (${metrics.weightHit}/${metrics.weightTotal}) — ${gate}`,
      `J-miss ${metrics.jMiss} (contract test · pinned are selected by construction)`,
      `positive turns ${metrics.positiveTurns} · unmeasured routable units ${unmeasured.length}/${routable.length}` +
        ` (weight ${unmeasuredWeight}/${routableWeight})`,
      `mean selection ${metrics.meanSelected.toFixed(1)} units · ${Math.round(metrics.meanCost)} chars/turn`,
      `receipt → ${RECEIPT.replace(ROOT, ".")}`,
    ].join("\n") + "\n",
  );
}

if (import.meta.main) main();
