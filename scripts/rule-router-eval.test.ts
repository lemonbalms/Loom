import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  classifyTurn,
  evaluate,
  LEXICON_CATEGORIES,
  MISS_WEIGHT,
  normalizeUtterance,
  parseTurns,
  RECALL_GATE,
  repoRelative,
  route,
  type SampleReceipt,
  selectSessionIds,
  turnKind,
} from "./rule-router-eval.ts";
import { CATEGORY_SURFACES, type RuleUnit, readLiveRegistry } from "./rules-registry.ts";

const ROOT = join(import.meta.dir, "..");
const CWD = "/Users/kyoungsiklee/projects/fable-advisor";
const units = readLiveRegistry(ROOT).units;

function record(body: Record<string, unknown>): string {
  return JSON.stringify({ cwd: CWD, ...body });
}

function userTurn(text: string, extra: Record<string, unknown> = {}): string {
  return record({ type: "user", message: { role: "user", content: text }, ...extra });
}

function toolUse(name: string, input: Record<string, unknown>, extra = {}): string {
  return record({
    type: "assistant",
    message: { role: "assistant", content: [{ type: "tool_use", name, input }] },
    ...extra,
  });
}

describe("turn decomposition", () => {
  test("a tool_result user record continues the turn instead of opening one", () => {
    const jsonl = [
      userTurn("핸드오프 확인해"),
      toolUse("Read", { file_path: `${CWD}/AGENTS.md` }),
      record({
        type: "user",
        message: { role: "user", content: [{ type: "tool_result", content: "1\t# Agent" }] },
      }),
      toolUse("Read", { file_path: `${CWD}/CLAUDE.md` }),
    ].join("\n");
    const turns = parseTurns(jsonl);
    expect(turns.length).toBe(1);
    expect(turns[0]!.touched).toEqual(["AGENTS.md", "CLAUDE.md"]);
    expect(turns[0]!.toolCalls).toBe(2);
  });

  test("sidechain records are excluded — subagents have their own injection path (PREREG §6)", () => {
    const jsonl = [
      userTurn("진행해"),
      toolUse("Read", { file_path: `${CWD}/tasks/traps.md` }, { isSidechain: true }),
      userTurn("서브에이전트가 읽어", { isSidechain: true }),
    ].join("\n");
    const turns = parseTurns(jsonl);
    expect(turns.length).toBe(1);
    expect(turns[0]!.touched).toEqual([]);
  });

  test("only Read/Edit-class tools produce positive labels", () => {
    const jsonl = [
      userTurn("커밋해"),
      toolUse("Bash", { command: "cat AGENTS.md" }),
      toolUse("Grep", { pattern: "topology", path: `${CWD}/CLAUDE.md` }),
      toolUse("Edit", { file_path: `${CWD}/tasks/traps.md` }),
    ].join("\n");
    expect(parseTurns(jsonl)[0]!.touched).toEqual(["tasks/traps.md"]);
  });

  test("paths outside the repo do not become labels", () => {
    expect(repoRelative("/Users/kyoungsiklee/.claude/settings.json", CWD)).toBeNull();
    expect(repoRelative(`${CWD}/docs/PLAN.md`, CWD)).toBe("docs/PLAN.md");
  });

  test("harness-injected blocks are stripped before classification", () => {
    const raw = `<system-reminder>디스패치 워커 pane claim</system-reminder>\n확인해`;
    expect(normalizeUtterance(raw)).toBe("확인해");
    expect(classifyTurn(normalizeUtterance(raw), units, false).unknown).toBe(true);
  });
});

describe("candidate A classification", () => {
  test("lexicon triggers reach their category", () => {
    expect(classifyTurn("핸드오프 확인해", units, false).categories).toContain("session-start");
    expect(classifyTurn("커밋하고 푸시해", units, false).categories).toContain("ship");
  });

  test("the first turn is session-start even with no trigger word", () => {
    expect(classifyTurn("음", units, true).categories).toContain("session-start");
    expect(classifyTurn("음", units, false).unknown).toBe(true);
  });

  test("registry triggers reach categories only through declared surfaces", () => {
    const verdict = classifyTurn("watch-card 로 감시해", units, false);
    // orch.watch-card is surface [dispatch, verification] — nothing else may be pulled in.
    expect(verdict.categories).toContain("dispatch");
    expect(verdict.categories).toContain("verification");
    expect(verdict.categories).not.toContain("planning");
  });

  test("classification never reads the turn's own tool calls (no label leakage)", () => {
    const jsonl = [userTurn("음"), toolUse("Read", { file_path: `${CWD}/AGENTS.md` })].join("\n");
    const turn = parseTurns(jsonl)[0]!;
    expect(turn.touched).toEqual(["AGENTS.md"]);
    // Same utterance, with and without the Read, must classify identically.
    expect(classifyTurn(turn.utterance, units, false)).toEqual(classifyTurn("음", units, false));
  });

  test("every lexicon category is a declared category (no orphan key)", () => {
    for (const category of Object.keys(LEXICON_CATEGORIES)) {
      expect(Object.keys(CATEGORY_SURFACES)).toContain(category);
    }
  });
});

describe("routing", () => {
  test("pinned units are selected in every decision — that is what J-miss = 0 means", () => {
    const decision = route(units, ["ship"], false);
    for (const unit of units.filter((u) => u.pin))
      expect(decision.selected.has(unit.id)).toBe(true);
  });

  test("UNKNOWN selects everything (P4 전량 fallback), so an unknown turn cannot miss", () => {
    const decision = route(units, [], true);
    expect(decision.selected.size).toBe(units.length);
    expect(decision.cost).toBe(units.reduce((sum, u) => sum + u.cost_chars, 0));
  });

  test("a classified turn selects strictly less than everything", () => {
    const decision = route(units, ["platform"], false);
    expect(decision.selected.size).toBeLessThan(units.length);
  });
});

describe("metrics", () => {
  const fixture = [
    {
      id: "s1",
      text: [userTurn("커밋하고 푸시해"), toolUse("Read", { file_path: `${CWD}/AGENTS.md` })].join(
        "\n",
      ),
    },
  ];

  test("recall is weighted by grade, and pinned units stay out of the denominator", () => {
    const metrics = evaluate(fixture, units);
    const agents = units.filter((u) => u.source.file === "AGENTS.md" && !u.pin);
    const expected = agents.reduce((sum, u) => sum + (MISS_WEIGHT[u.grade] ?? 0), 0);
    expect(metrics.weightTotal).toBe(expected);
    expect(metrics.jMiss).toBe(0);
    expect(metrics.recall).toBeCloseTo(metrics.weightHit / metrics.weightTotal, 10);
  });

  test("a turn that touches no registry source contributes no weight", () => {
    const metrics = evaluate(
      [
        {
          id: "s",
          text: [userTurn("진행해"), toolUse("Read", { file_path: `${CWD}/docs/PLAN.md` })].join(
            "\n",
          ),
        },
      ],
      units,
    );
    expect(metrics.weightTotal).toBe(0);
    expect(metrics.positiveTurns).toBe(0);
  });

  test("M7b is 0 while the whole registry fits in B_rules (PREREG §3.2)", () => {
    const metrics = evaluate(fixture, units);
    expect(metrics.m7b).toBe(0);
  });

  test("evaluation is deterministic — same input, same numbers (M2 · §6.6.1 R2)", () => {
    const first = evaluate(fixture, units);
    const second = evaluate(fixture, units);
    expect(JSON.stringify(first, (_k, v) => (v instanceof Set ? [...v] : v))).toBe(
      JSON.stringify(second, (_k, v) => (v instanceof Set ? [...v] : v)),
    );
  });

  test("turn kinds separate owner utterances from harness artifacts", () => {
    expect(turnKind("[Request interrupted by user]")).toBe("interrupt");
    expect(turnKind("Another Claude session sent a message:\n<teammate-message")).toBe(
      "peer-message",
    );
    expect(turnKind("확인해")).toBe("owner-utterance");
  });
});

describe("sample discipline", () => {
  const sample = JSON.parse(
    readFileSync(join(ROOT, "rules/prereg-sample.json"), "utf8"),
  ) as SampleReceipt;

  test("the eval set excludes every holdout session (S3-2 reserves it for the final call)", () => {
    const evalIds = selectSessionIds(sample, "eval");
    expect(evalIds.length).toBe(45);
    for (const id of sample.holdout) expect(evalIds).not.toContain(id);
  });

  test("eval + holdout partition the sealed 60", () => {
    const all = selectSessionIds(sample, "all");
    expect(all.length).toBe(60);
    expect(
      [...selectSessionIds(sample, "eval"), ...selectSessionIds(sample, "holdout")].sort(),
    ).toEqual([...all].sort());
  });

  test("sealed constants are the pre-registered ones, not tunables", () => {
    expect(RECALL_GATE).toBe(0.85);
    expect(MISS_WEIGHT).toEqual({ A: 3, G: 2, H: 1 });
  });
});

describe("registry assumptions the metric rests on", () => {
  test("every routable unit carries a miss weight", () => {
    for (const unit of units.filter((u: RuleUnit) => !u.pin)) {
      expect(MISS_WEIGHT[unit.grade]).toBeGreaterThan(0);
    }
  });
});
