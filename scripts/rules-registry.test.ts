import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CATEGORY_SURFACES,
  checkPreregExpiry,
  derivePin,
  extractUnitBody,
  RULES_BUDGET_CHARS,
  parseAnchor,
  parseRegistry,
  type Registry,
  type RuleUnit,
  readLiveRegistry,
  runRulesCheck,
  sha8,
  validateRegistry,
} from "./rules-registry.ts";

const ROOT = join(import.meta.dir, "..");
const readSource = (file: string) => readFileSync(join(ROOT, file), "utf8");

const DOC = [
  "# Title",
  "",
  "## Rules",
  "",
  "| Rule | Detail |",
  "|---|---|",
  "| **Autonomy** | do not ask |",
  "| Verify | tests green |",
  "",
  "- **first trap** — watch out",
  "  continued line",
  "- second trap — other",
  "1. **numbered rule** — counts as a bullet",
  "",
  "## Other",
  "",
  "- first trap — a decoy under a different heading",
].join("\n");

describe("anchor grammar", () => {
  test("parses the three anchor kinds", () => {
    expect(parseAnchor("heading:## Rules")).toEqual({ kind: "heading", heading: "## Rules" });
    expect(parseAnchor("row:## Rules|Verify")).toEqual({
      kind: "row",
      heading: "## Rules",
      label: "Verify",
    });
    expect(parseAnchor("bullet:## Rules|first trap")).toEqual({
      kind: "bullet",
      heading: "## Rules",
      label: "first trap",
    });
  });

  test("rejects malformed anchors instead of guessing", () => {
    expect(() => parseAnchor("## Rules")).toThrow(/missing kind prefix/);
    expect(() => parseAnchor("section:## Rules")).toThrow(/unknown anchor kind/);
    expect(() => parseAnchor("row:## Rules")).toThrow(/needs/);
    expect(() => parseAnchor("bullet:## Rules|")).toThrow(/empty part/);
  });

  test("heading anchor stops at the next same-or-shallower heading", () => {
    const body = extractUnitBody(DOC, "heading:## Rules");
    expect(body.startsWith("## Rules")).toBe(true);
    expect(body).toContain("numbered rule");
    expect(body).not.toContain("## Other");
    expect(body).not.toContain("decoy");
  });

  test("row anchor extracts exactly one row, bold/backtick-insensitive", () => {
    expect(extractUnitBody(DOC, "row:## Rules|Autonomy")).toBe("| **Autonomy** | do not ask |");
  });

  test("bullet anchor keeps indented continuation lines", () => {
    expect(extractUnitBody(DOC, "bullet:## Rules|first trap")).toBe(
      "- **first trap** — watch out\n  continued line",
    );
  });

  test("numbered list items are bullets too (CLAUDE.md standing rules)", () => {
    expect(extractUnitBody(DOC, "bullet:## Rules|numbered rule")).toBe(
      "1. **numbered rule** — counts as a bullet",
    );
  });

  test("a bullet label is scoped to its heading block", () => {
    // Same label exists under ## Other; scoping is what keeps the match unique.
    expect(extractUnitBody(DOC, "bullet:## Other|first trap")).toContain("decoy");
  });

  test("ambiguous or missing anchors throw rather than silently pick one", () => {
    expect(() => extractUnitBody(DOC, "heading:## Missing")).toThrow(/expected exactly 1, got 0/);
    expect(() => extractUnitBody(DOC, "row:## Rules|Nope")).toThrow(/expected exactly 1, got 0/);
    const dup = `${DOC}\n\n## Rules\n\n- dup\n`;
    expect(() => extractUnitBody(dup, "heading:## Rules")).toThrow(/expected exactly 1, got 2/);
  });
});

describe("D3 pin derivation", () => {
  test("grade J pins automatically", () => {
    expect(derivePin({ grade: "J" })).toEqual({ pin: true, pin_source: "grade-J" });
  });

  test("an H with an invisible guard deny pins automatically (delta ①)", () => {
    expect(derivePin({ grade: "H", guard: { deny_visible: false } })).toEqual({
      pin: true,
      pin_source: "silent-deny-H",
    });
    expect(derivePin({ grade: "H" })).toEqual({ pin: true, pin_source: "silent-deny-H" });
  });

  test("an H with a visible guard deny is routable", () => {
    expect(derivePin({ grade: "H", guard: { deny_visible: true } })).toEqual({ pin: false });
  });

  test("discretionary pins must be owner-declared", () => {
    expect(derivePin({ grade: "A" })).toEqual({ pin: false });
    expect(derivePin({ grade: "A", pin_source: "owner" })).toEqual({
      pin: true,
      pin_source: "owner",
    });
  });
});

function fixture(overrides: Partial<RuleUnit> = {}): Registry {
  const anchor = "row:## Standing rules|Verify";
  const body = extractUnitBody(readSource("AGENTS.md"), anchor);
  const file = sha8(readSource("AGENTS.md").replace(/\r\n?/g, "\n"));
  return {
    version: 1,
    policy_version: "test",
    sources: [{ file: "AGENTS.md", sha8: file, triage: { for_sha8: file, note: "n", at: "x" } }],
    units: [
      {
        id: "t.verify",
        source: { file: "AGENTS.md", anchor, sha8: sha8(body) },
        grade: "A",
        layer: ["L3"],
        surface: ["ship"],
        triggers: ["bun test"],
        pin: false,
        cost_chars: body.length,
        ...overrides,
      },
    ],
  };
}

describe("registry gate", () => {
  test("a well-formed registry passes", () => {
    expect(validateRegistry(fixture(), readSource).errors).toEqual([]);
  });

  test("G2 — a unit without grade/layer/surface is rejected as unclassified", () => {
    for (const missing of [{ grade: undefined }, { layer: [] }, { surface: [] }]) {
      const errors = validateRegistry(fixture(missing as Partial<RuleUnit>), readSource).errors;
      expect(errors.join("\n")).toMatch(/미분류 0|grade must be/);
    }
  });

  test("an H unit must record guard.deny_visible", () => {
    const errors = validateRegistry(
      fixture({ grade: "H", pin: true, pin_source: "silent-deny-H" }),
      readSource,
    ).errors;
    expect(errors.join("\n")).toContain("guard.deny_visible");
  });

  test("a stale unit digest fails the gate", () => {
    const errors = validateRegistry(
      fixture({
        source: { file: "AGENTS.md", anchor: "row:## Standing rules|Verify", sha8: "deadbeef" },
      }),
      readSource,
    ).errors;
    expect(errors.join("\n")).toMatch(/unit digest deadbeef/);
  });

  test("hand-edited pin is overruled by D3", () => {
    const errors = validateRegistry(fixture({ pin: true, pin_source: "owner" }), readSource).errors;
    // grade A + owner declaration is legal; the illegal case is pin without a source.
    expect(errors).toEqual([]);
    const bad = validateRegistry(fixture({ pin: true }), readSource).errors;
    expect(bad.join("\n")).toMatch(/pin must be false by D3/);
  });

  test("F2 — a changed source file demands a triage receipt", () => {
    const registry = fixture();
    registry.sources[0]!.sha8 = "cafebabe";
    const errors = validateRegistry(registry, readSource).errors;
    expect(errors.join("\n")).toContain("registry triage receipt required");
  });

  test("F2 — bumping the file digest without renewing the receipt still fails", () => {
    const registry = fixture();
    registry.sources[0]!.triage.for_sha8 = "cafebabe";
    const errors = validateRegistry(registry, readSource).errors;
    expect(errors.join("\n")).toMatch(/triage receipt covers cafebabe/);
  });

  test("a unit whose source file is not declared is rejected", () => {
    const registry = fixture();
    registry.sources = [];
    const errors = validateRegistry(registry, readSource).errors;
    expect(errors.join("\n")).toContain("not declared in sources[]");
  });

  test("duplicate unit ids are rejected", () => {
    const registry = fixture();
    registry.units.push({ ...registry.units[0]! });
    expect(validateRegistry(registry, readSource).errors.join("\n")).toContain("duplicate unit id");
  });
});

describe("live registry", () => {
  test("rules:check passes on the checked-in registry", () => {
    const result = runRulesCheck(ROOT);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  test("extraction is deterministic across repeated runs", () => {
    expect(runRulesCheck(ROOT).report).toBe(runRulesCheck(ROOT).report);
  });

  test("every registered unit is classified and every pin is derived (G2 · D3)", () => {
    for (const unit of readLiveRegistry(ROOT).units) {
      expect(unit.grade).toBeDefined();
      expect(unit.layer.length).toBeGreaterThan(0);
      expect(unit.surface.length).toBeGreaterThan(0);
      expect(unit.pin).toBe(derivePin(unit).pin);
    }
  });

  test("Phase 1 registry stores coordinates only — no rule body is copied (P5)", () => {
    const text = readFileSync(join(ROOT, "rules/registry.yaml"), "utf8");
    const registry = parseRegistry(text);
    for (const unit of registry.units) {
      const body = extractUnitBody(readSource(unit.source.file), unit.source.anchor);
      // The anchor itself legitimately quotes a heading/label — that is a coordinate, not a copy.
      // What must never appear is the rule text those coordinates point *at*.
      const payload = body
        .split("\n")
        .map((line) => line.replaceAll("**", "").replaceAll("`", "").trim())
        .filter((line) => line.length >= 30 && !unit.source.anchor.includes(line.slice(0, 30)));
      for (const line of payload) expect(text).not.toContain(line.slice(0, 30));
    }
  });

  test("PREREG §7 E1/E2 hold on the live registry — 'M7b = 0' is still quotable", () => {
    expect(checkPreregExpiry(readLiveRegistry(ROOT).units)).toEqual([]);
  });

  test("PREREG §7 E1 fires when the registry outgrows B_rules", () => {
    const unit = (id: string, cost: number, pin: boolean): RuleUnit =>
      ({
        id,
        source: { file: "CLAUDE.md", anchor: "heading:# x", sha8: "00000000" },
        grade: pin ? "J" : "A",
        layer: ["L5"],
        surface: ["ship"],
        triggers: ["x"],
        pin,
        pin_source: pin ? "grade-J" : undefined,
        cost_chars: cost,
      }) as RuleUnit;

    const errors = checkPreregExpiry([unit("a", RULES_BUDGET_CHARS + 1, false)]);
    expect(errors.some((e) => e.includes("E1 만료"))).toBe(true);
    expect(errors.some((e) => e.includes("M7b = 0"))).toBe(true);
  });

  test("PREREG §7 E2 fires when one category union outgrows B_rules", () => {
    const units = [
      {
        id: "pin.big",
        source: { file: "CLAUDE.md", anchor: "heading:# x", sha8: "00000000" },
        grade: "J",
        layer: ["L5"],
        surface: ["review"],
        triggers: ["x"],
        pin: true,
        pin_source: "grade-J",
        cost_chars: 5000,
      },
      {
        id: "routed.big",
        source: { file: "CLAUDE.md", anchor: "heading:# y", sha8: "00000000" },
        grade: "A",
        layer: ["L5"],
        surface: ["dispatch"],
        triggers: ["y"],
        pin: false,
        cost_chars: 4600,
      },
    ] as unknown as RuleUnit[];
    // total 9,600 also trips E1; the point is that the per-category union is checked too.
    const errors = checkPreregExpiry(units);
    expect(errors.some((e) => e.includes('E2 만료 — category "dispatch"'))).toBe(true);
    expect(errors.some((e) => e.includes('category "review"'))).toBe(false);
  });

  test("PREREG §7 E3 fires when a surface belongs to no owner-declared category", () => {
    const units = [
      {
        id: "orphan",
        source: { file: "CLAUDE.md", anchor: "heading:# z", sha8: "00000000" },
        grade: "A",
        layer: ["L5"],
        surface: ["telemetry"],
        triggers: ["z"],
        pin: false,
        cost_chars: 10,
      },
    ] as unknown as RuleUnit[];
    expect(checkPreregExpiry(units).some((e) => e.includes('surface "telemetry"'))).toBe(true);
  });

  test("category canon mirrors RULE-CATEGORIES.md §1 — 10 categories, surfaces covered", () => {
    const doc = readFileSync(join(ROOT, "docs/spikes/RULE-CATEGORIES.md"), "utf8");
    expect(Object.keys(CATEGORY_SURFACES)).toHaveLength(10);
    for (const category of Object.keys(CATEGORY_SURFACES)) {
      expect(doc).toContain(`\`${category}\``);
    }
    const claimed = new Set(Object.values(CATEGORY_SURFACES).flat());
    for (const unit of readLiveRegistry(ROOT).units) {
      for (const surface of unit.surface) expect(claimed.has(surface)).toBe(true);
    }
  });

  test("the four measured rule sources are all declared", () => {
    const files = readLiveRegistry(ROOT).sources.map((source) => source.file);
    expect(files).toEqual(
      expect.arrayContaining(["CLAUDE.md", "AGENTS.md", "tasks/traps.md", "docs/SESSION-START.md"]),
    );
  });
});
