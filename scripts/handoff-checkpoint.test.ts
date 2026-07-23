/**
 * SESSION-CONTINUITY Phase B fixture + Phase C live lock + Phase D automation tests.
 *
 * Structural validator lives in production `handoff-lint.ts` (wired to handoff:lint).
 * Authority: HANDOFF-CHECKPOINT-DESIGN §9.2 · §11 · Phase D bounded automation.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  HARD_CAP,
  buildStateContext,
  buildTrapsBlock,
  truncateContext,
} from "./session-context.ts";
import {
  HANDOFF_UTF8_BUDGET,
  STATUS_MALFORMED,
  buildStatus,
} from "./session-status.ts";
import {
  FORBIDDEN_HISTORY_HEADINGS,
  countHandoffHeading,
  lintLiveHandoff,
  validateCheckpoint,
  validateReviewSourceShape,
} from "./handoff-lint.ts";
import {
  REQUIRED_HANDOFF_HEADINGS,
  extractHandoffSection as extractSection,
  extractMarkdownSection,
} from "./handoff-headings.ts";

const ROOT = join(import.meta.dir, "..");
const FIXTURE_REL = "scripts/fixtures/handoff-checkpoint-phase-b.md";
const FIXTURE_PATH = join(ROOT, FIXTURE_REL);

// ---------------------------------------------------------------------------
// Pure helpers (test assembly only)
// ---------------------------------------------------------------------------

function readRepo(rel: string): string {
  const p = join(ROOT, rel);
  if (!existsSync(p)) return "";
  return readFileSync(p, "utf8");
}

function utf8Bytes(s: string): number {
  return Buffer.byteLength(s, "utf8");
}

function countHeading(text: string, title: string): number {
  return countHandoffHeading(text, title);
}

/** Re-export production validator for any external importers of this test module. */
export { validateCheckpoint, validateReviewSourceShape };

/**
 * Assemble Phase-B execution-path state: sentinel + live buildStatus() + fixture
 * sections + traps (test-only). Production buildStateContext is not rewired.
 */
export function assemblePhaseBState(fixture: string, trapsText?: string): string {
  const parts: string[] = [
    "[LOOM-SESSION-CONTEXT v1 · state · phase-b-fixture]",
    buildStatus(),
  ];
  for (const h of REQUIRED_HANDOFF_HEADINGS) {
    const sec = extractSection(fixture, h);
    if (sec) parts.push(sec);
  }
  const traps = buildTrapsBlock(trapsText);
  if (traps) parts.push(traps);
  return parts.join("\n\n");
}

/** V5 — six restoration answers derived only from fixture text (no live HANDOFF). */
export function restorationAnswers(fixture: string): {
  productLoop: string;
  planAndGate: string;
  expectedRedGreen: string;
  mustNotChange: string;
  nowVsDeferred: string;
  dontRedo: string;
} {
  const loop = extractSection(fixture, "Current loop") ?? "";
  const action = extractSection(fixture, "Current action") ?? "";
  const one = extractSection(fixture, "One-line resume") ?? "";
  const active = extractSection(fixture, "Active checks") ?? "";
  const inv = extractSection(fixture, "Invariants") ?? "";
  const dont = extractSection(fixture, "Don't redo") ?? "";

  return {
    productLoop: /SESSION-CONTINUITY|Product|Dogfood|Harness|Reuse/i.test(loop + one)
      ? "SESSION-CONTINUITY bounded wave; Product v0.28.0 approved pending PATCH 1"
      : "",
    planAndGate: /0\.28\.0/.test(one + action) && /Phase B/i.test(action)
      ? "PLAN 0.28.0 approved; next gate = Phase B fixture/SOFT_CAP/expected-red"
      : "",
    expectedRedGreen:
      /handoff:lint.*expected-red|expected-red/i.test(action + active) &&
      /SOFT_CAP|session-context/i.test(action)
        ? "unit/fixture green; live handoff:lint capacity expected-red until Phase C"
        : "",
    mustNotChange: /Must not change|packages\/\*\*|live `HANDOFF\.md`|PATCH 1/i.test(action + inv)
      ? "no packages/dist; no live HANDOFF diet; no Phase C/PATCH 1"
      : "",
    nowVsDeferred:
      /this gate/i.test(active) && /after Phase B|after restore|Phase C/i.test(active)
        ? "now=V1–V6+SOFT_CAP+measure lint red; defer=Phase C transition + PATCH 1"
        : "",
    dontRedo: /v0\.27\.0|HARD_CAP|card\.done|Phase C or PATCH 1/i.test(dont)
      ? "pre-C locks, HARD_CAP raise, card.done authority, premature Phase C/PATCH 1"
      : "",
  };
}

// ---------------------------------------------------------------------------
// Fixtures load
// ---------------------------------------------------------------------------

const fixture = readRepo(FIXTURE_REL);
const liveTraps = readRepo("tasks/traps.md");
const liveHandoff = readRepo("HANDOFF.md");
const planHead = readRepo("docs/PLAN.md").slice(0, 4000);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Phase B fixture presence", () => {
  test("fixture file exists", () => {
    expect(existsSync(FIXTURE_PATH)).toBe(true);
    expect(fixture.length).toBeGreaterThan(0);
  });
});

describe("V1 — SSOT no-conflict", () => {
  test("PLAN version/status and fixture gate agree; no second PLAN authority", () => {
    expect(planHead).toMatch(/\*\*Version\*\*\s*\|\s*\*\*0\.28\.1\*\*/);
    expect(planHead).toMatch(/approved/i);
    const errs = validateCheckpoint(fixture, { planVersion: "0.28.0" });
    expect(errs).toEqual([]);
    // Fixture links PLAN rather than re-stating full status matrix.
    expect(fixture).toContain("docs/PLAN.md");
    expect(fixture).toContain("docs/plan_review.md");
  });

  test("stale todo cannot override fixture unique next gate", () => {
    const staleTodo = [
      "# todo (stale on purpose)",
      "- [ ] Next: PANE-DEATH PATCH 1 tests-only",
      "- [ ] Start Phase C HANDOFF rewrite now",
    ].join("\n");
    // Gate of record is fixture Current action only.
    const action = extractSection(fixture, "Current action")!;
    expect(action).toMatch(/Phase B/i);
    expect(action).not.toMatch(/###\s+PANE-DEATH PATCH 1/);
    // Stale todo text must not be treated as authority by validator.
    const withNoise = `${fixture}\n\n<!-- todo snapshot -->\n${staleTodo}\n`;
    // Still only one ### gate under Current action.
    const errs = validateCheckpoint(withNoise);
    expect(errs.filter((e) => e.includes("gate"))).toEqual([]);
    expect(staleTodo.includes("PATCH 1")).toBe(true); // noise exists but is ignored
  });
});

describe("V2 — information mapping", () => {
  test("all non-history core items are present in fixture", () => {
    const need = {
      currentAction: extractSection(fixture, "Current action"),
      activeChecks: extractSection(fixture, "Active checks"),
      ownerPending: extractSection(fixture, "Owner pending"),
      blockers: extractSection(fixture, "Blockers"),
      invariants: extractSection(fixture, "Invariants"),
      evidence: extractSection(fixture, "Evidence"),
      dontRedo: extractSection(fixture, "Don't redo"),
    };
    for (const [k, v] of Object.entries(need)) {
      expect(v, k).toBeTruthy();
    }
    expect(need.currentAction!).toMatch(/Expected:|Done when:|Must not change:/i);
    expect(need.ownerPending!).toMatch(/Safe default|flake|HOOKCACHE|RULE-ENFORCEABILITY/i);
    expect(need.blockers!.trim().endsWith("(none)") || need.blockers!.includes("(none)")).toBe(
      true,
    );
    expect(need.evidence!).toMatch(/HANDOFF_WINDOWS\.md/);
    expect(need.evidence!).toMatch(/tasks\/traps\.md/);
    expect(need.dontRedo!.length).toBeGreaterThan(40);
  });
});

describe("V3 — size and singularity", () => {
  test("UTF-8 ≤ 8192, required headings once, no details, no history block", () => {
    expect(utf8Bytes(fixture)).toBeLessThanOrEqual(HANDOFF_UTF8_BUDGET);
    for (const h of REQUIRED_HANDOFF_HEADINGS) {
      expect(countHeading(fixture, h)).toBe(1);
    }
    expect(/(^|\n)\s*<details[\s>]/m.test(fixture)).toBe(false);
    expect(/<\/details>/i.test(fixture)).toBe(false);
    for (const h of FORBIDDEN_HISTORY_HEADINGS) {
      expect(countHeading(fixture, h)).toBe(0);
    }
    expect(validateCheckpoint(fixture)).toEqual([]);
  });
});

describe("V4 — state assembly HARD_CAP (status + fixture + traps)", () => {
  test("execution-path sum includes buildStatus; ≤ HARD_CAP; truncate identity", () => {
    const state = assemblePhaseBState(fixture, liveTraps);
    const jsLen = state.length;
    const bytes = utf8Bytes(state);
    // Exact metrics for architect report (chars = JS string length).
    expect(jsLen).toBeLessThanOrEqual(HARD_CAP);
    expect(bytes).toBeGreaterThan(0);
    expect(HARD_CAP - jsLen).toBeGreaterThan(0); // margin
    expect(truncateContext(state)).toBe(state);
    expect(state.startsWith("⚠")).toBe(false);
    expect(state.includes("…[truncated")).toBe(false);
    // V4 FIX: live buildStatus() after sentinel.
    expect(state.includes("## 세션 상태 (Loom)")).toBe(true);
    expect(state.includes(buildStatus().split("\n")[0]!)).toBe(true);
    for (const h of REQUIRED_HANDOFF_HEADINGS) {
      expect(state.includes(`## ${h}`)).toBe(true);
    }
    expect(state.includes("## 활성 함정")).toBe(true);
    expect(state.includes("## 하지 말 것")).toBe(true);
    // Surface metrics on failure for IMPL-RESULT copy.
    expect({
      chars: jsLen,
      utf8Bytes: bytes,
      hardCap: HARD_CAP,
      marginChars: HARD_CAP - jsLen,
    }).toEqual({
      chars: jsLen,
      utf8Bytes: bytes,
      hardCap: HARD_CAP,
      marginChars: HARD_CAP - jsLen,
    });
  });
});

describe("V5 — restoration questions", () => {
  test("fixture answers the six §11 restoration questions", () => {
    const a = restorationAnswers(fixture);
    expect(a.productLoop.length).toBeGreaterThan(0);
    expect(a.planAndGate).toContain("0.28.0");
    expect(a.planAndGate).toMatch(/Phase B/);
    expect(a.expectedRedGreen).toMatch(/expected-red/);
    expect(a.mustNotChange).toMatch(/packages|HANDOFF|PATCH/i);
    expect(a.nowVsDeferred).toMatch(/Phase C|PATCH 1/);
    expect(a.dontRedo.length).toBeGreaterThan(0);
  });
});

describe("live checkpoint (Phase D gate)", () => {
  test("live HANDOFF is the canonical checkpoint with all V2 information", () => {
    const errs = validateCheckpoint(liveHandoff, {
      planVersion: "0.28.1",
      trapsText: liveTraps,
      expectedGate: /Post.–Phase D|owner next-track|Phase D automation/i,
    });
    expect(errs).toEqual([]);
    expect(liveHandoff).toMatch(/Goal:/);
    expect(liveHandoff).toMatch(/Expected:/);
    expect(liveHandoff).toMatch(/Must not change:/);
    expect(liveHandoff).toMatch(/Done when:/);
    expect(extractSection(liveHandoff, "Owner pending")).toMatch(/Safe default/i);
    expect(extractSection(liveHandoff, "Evidence")).toMatch(/HANDOFF_WINDOWS\.md/);
    expect(extractSection(liveHandoff, "Don't redo")).toMatch(/e281587|herdr|Phase D/i);
    expect(extractSection(liveHandoff, "Current loop")).toMatch(
      /Phase D automation shipped|adapter source|v0\.28\.1/i,
    );
    expect(extractSection(liveHandoff, "Current action")).toMatch(
      /Post.–Phase D|owner next-track|Phase D/i,
    );
    expect(extractSection(liveHandoff, "Blockers")).toMatch(/\(none\)/);
  });

  test("state injects all canonical sections and traps without truncation", () => {
    const state = buildStateContext(liveHandoff, liveTraps);
    expect(state.length).toBeLessThanOrEqual(HARD_CAP);
    expect(utf8Bytes(state)).toBeGreaterThan(0);
    expect(truncateContext(state)).toBe(state);
    expect(state.includes("⚠ [LOOM-SESSION-CONTEXT]")).toBe(false);
    expect(state.includes("…[truncated")).toBe(false);
    for (const heading of REQUIRED_HANDOFF_HEADINGS) {
      expect(state.includes(`## ${heading}`)).toBe(true);
    }
    expect(state.includes("## 활성 함정")).toBe(true);
    expect(state.includes("## 하지 말 것")).toBe(true);
  });

  test("renamed Current action is loud in checkpoint validation", () => {
    const renamed = liveHandoff.replace("## Current action", "## Current task");
    const errs = validateCheckpoint(renamed, { trapsText: liveTraps });
    expect(errs.some((e) => e.includes("missing required heading: Current action"))).toBe(true);
  });
});

describe("V6 — drift/failure injection (loud reject, no live mutation)", () => {
  test("PLAN mismatch", () => {
    const bad = fixture.replaceAll("0.28.0", "0.99.0");
    const errs = validateCheckpoint(bad, { planVersion: "0.28.0" });
    expect(errs.some((e) => e.includes("PLAN version"))).toBe(true);
  });

  test("missing Evidence target", () => {
    const evidence = extractSection(fixture, "Evidence")!;
    const brokenEvidence = evidence.replaceAll(
      "`docs/PLAN.md`",
      "`docs/DOES-NOT-EXIST-phase-b.md`",
    );
    const bad = fixture.replace(evidence, brokenEvidence);
    const errs = validateCheckpoint(bad);
    expect(errs.some((e) => e.includes("missing Evidence target"))).toBe(true);
  });

  test("duplicate Current action", () => {
    const bad = `${fixture}\n\n## Current action\n\n### Second gate\n`;
    const errs = validateCheckpoint(bad);
    expect(errs.some((e) => e.includes("duplicate heading: Current action"))).toBe(true);
  });

  test("renamed Current action heading", () => {
    const bad = fixture.replace("## Current action", "## Current task");
    const errs = validateCheckpoint(bad);
    expect(errs.some((e) => e.includes("missing required heading: Current action"))).toBe(true);
  });

  test("malformed Blockers", () => {
    const bad = fixture.replace("## Blockers\n\n`(none)`", "## Blockers\n\n");
    // empty body after heading
    const emptied = bad.replace(
      /## Blockers\n[\s\S]*?(?=\n## )/,
      "## Blockers\n\n\n",
    );
    const errs = validateCheckpoint(emptied);
    expect(errs.some((e) => e.toLowerCase().includes("blocker"))).toBe(true);
  });

  test("renamed traps heading (both) → empty injection", () => {
    const renamed = liveTraps
      .replace("## 활성 함정", "## Active traps")
      .replace("## 하지 말 것", "## Do not");
    const errs = validateCheckpoint(fixture, { trapsText: renamed });
    expect(
      errs.some(
        (e) =>
          e.includes("traps headings") ||
          e.includes("traps missing exact section") ||
          e.includes("traps partial loss"),
      ),
    ).toBe(true);
  });

  test("renamed traps heading (활성 함정 only) → partial loss loud fail", () => {
    const renamed = liveTraps.replace("## 활성 함정", "## Active traps");
    // buildTrapsBlock still returns 하지 말 것 alone — must not silently pass.
    expect(buildTrapsBlock(renamed).includes("## 하지 말 것")).toBe(true);
    expect(buildTrapsBlock(renamed).includes("## 활성 함정")).toBe(false);
    const errs = validateCheckpoint(fixture, { trapsText: renamed });
    expect(
      errs.some(
        (e) =>
          e.includes("traps missing exact section: 활성 함정") ||
          e.includes("traps partial loss"),
      ),
    ).toBe(true);
  });

  test("renamed traps heading (하지 말 것 only) → partial loss loud fail", () => {
    const renamed = liveTraps.replace("## 하지 말 것", "## Do not");
    expect(buildTrapsBlock(renamed).includes("## 활성 함정")).toBe(true);
    expect(buildTrapsBlock(renamed).includes("## 하지 말 것")).toBe(false);
    const errs = validateCheckpoint(fixture, { trapsText: renamed });
    expect(
      errs.some(
        (e) =>
          e.includes("traps missing exact section: 하지 말 것") ||
          e.includes("traps partial loss"),
      ),
    ).toBe(true);
  });

  test("review shape table→bullet is loud-fail (synthetic, no live mutation)", () => {
    const tableOk = [
      "# Plan Review",
      "",
      "## Open (blocking)",
      "",
      "| Item | Severity |",
      "|------|----------|",
      "| (none) | — |",
      "",
      "## Closed",
      "",
      "done",
    ].join("\n");
    expect(validateReviewSourceShape(tableOk)).toEqual([]);

    const bulletDrift = [
      "# Plan Review",
      "",
      "## Open (blocking)",
      "",
      "- **Open blocking**: none remaining",
      "- leftover Medium from R99",
      "",
      "## Closed",
      "",
      "done",
    ].join("\n");
    const errs = validateReviewSourceShape(bulletDrift);
    expect(errs.length).toBeGreaterThan(0);
    expect(errs.some((e) => /table|bullet|shape/i.test(e))).toBe(true);
  });

  test("inserted <details>", () => {
    const bad = fixture.replace(
      "## Don't redo",
      "<details>\nhistory\n</details>\n\n## Don't redo",
    );
    const errs = validateCheckpoint(bad);
    expect(errs.some((e) => e.includes("<details>"))).toBe(true);
  });

  test("forbidden history heading", () => {
    const bad = `${fixture}\n\n## Completed waves\n\n- old wave\n`;
    const errs = validateCheckpoint(bad);
    expect(errs.some((e) => e.includes("forbidden history heading"))).toBe(true);
  });

  test("ROADMAP authority without adopted ROADMAP", () => {
    expect(existsSync(join(ROOT, "docs/ROADMAP.md"))).toBe(false);
    const worse = fixture.replace(
      "## Current loop\n",
      "## Current loop\n\nAuthoritative loop order is taken from ROADMAP.\n",
    );
    const errs = validateCheckpoint(worse);
    expect(errs.some((e) => e.includes("ROADMAP authority"))).toBe(true);
  });
});

describe("Phase C/D live handoff:lint", () => {
  test("bun run handoff:lint exits 0 for budget + shared-heading structure", async () => {
    const proc = Bun.spawn(["bun", "run", "handoff:lint"], {
      cwd: ROOT,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [code, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const out = `${stdout}\n${stderr}`;
    expect(code).toBe(0);
    expect(out).not.toMatch(/HANDOFF full\s*=|HANDOFF top-80|handoff:lint FAIL/);
    expect(utf8Bytes(liveHandoff)).toBeLessThanOrEqual(HANDOFF_UTF8_BUDGET);
    expect(lintLiveHandoff({ handoffText: liveHandoff, trapsText: liveTraps })).toEqual(
      [],
    );
  });
});

describe("Phase D — status fail-loud", () => {
  test("healthy PLAN/HANDOFF parse; Open blocking is fail-loud when review is non-table", () => {
    const s = buildStatus();
    expect(s).toContain("| PLAN | 0.28.1 |");
    expect(s).toMatch(/\| Status \| approved/i);
    expect(s).not.toMatch(/\| PLAN \| unknown\/malformed/);
    expect(s).not.toMatch(/\| 다음 \(HANDOFF\) \| unknown\/malformed/);
    // Live plan_review Open(blocking) is bullet prose, not the markdown table
    // contract (V6). Old status treated missing table body as "없음" (false healthy).
    // Phase D surfaces that as unknown/malformed instead of inventing empty.
    const review = readRepo("docs/plan_review.md");
    const openStart = review.indexOf("## Open (blocking)");
    const openHasTable =
      openStart >= 0 &&
      /\|[^\n]+\|\n\|[-| :]+\|/.test(review.slice(openStart, openStart + 800));
    if (openHasTable) {
      expect(s).not.toMatch(/\| Open blocking \| unknown\/malformed/);
    } else {
      expect(s).toContain(`| Open blocking | ${STATUS_MALFORMED} |`);
      expect(s).not.toContain("| Open blocking | 없음 |");
    }
  });

  test("empty PLAN/review/HANDOFF surface unknown/malformed", () => {
    const s = buildStatus({
      planText: "",
      reviewText: "",
      handoffText: "",
    });
    expect(s).toContain(`| PLAN | ${STATUS_MALFORMED} |`);
    expect(s).toContain(`| Status | ${STATUS_MALFORMED} |`);
    expect(s).toContain(`| plan_review 최신 | ${STATUS_MALFORMED} |`);
    expect(s).toContain(`| Open blocking | ${STATUS_MALFORMED} |`);
    expect(s).toContain(`| 다음 (HANDOFF) | ${STATUS_MALFORMED} |`);
  });

  test("missing One-line resume heading is fail-loud (no whole-file fallback)", () => {
    const stripped = liveHandoff.replace(
      "## One-line resume",
      "## One liner",
    );
    const s = buildStatus({
      planText: readRepo("docs/PLAN.md"),
      reviewText: readRepo("docs/plan_review.md"),
      handoffText: stripped,
    });
    expect(s).toContain(`| 다음 (HANDOFF) | ${STATUS_MALFORMED} |`);
  });

  test("Open blocking without table is fail-loud", () => {
    const review = [
      "# Review",
      "",
      "## Open (blocking)",
      "",
      "- none left",
      "",
      "## Closed",
      "",
      "x",
    ].join("\n");
    const s = buildStatus({
      planText: readRepo("docs/PLAN.md"),
      reviewText: review,
      handoffText: liveHandoff,
    });
    expect(s).toContain(`| Open blocking | ${STATUS_MALFORMED} |`);
  });
});

describe("Phase D — SessionStart vs no-hook equivalence (V4)", () => {
  /** Manual no-hook ritual core set: 9 HANDOFF sections + traps pair. */
  function manualCoreKeys(handoff: string, traps: string): string[] {
    const keys: string[] = [];
    for (const h of REQUIRED_HANDOFF_HEADINGS) {
      if (extractSection(handoff, h)) keys.push(`handoff:${h}`);
    }
    if (extractMarkdownSection(traps, "활성 함정")) keys.push("traps:활성 함정");
    if (extractMarkdownSection(traps, "하지 말 것")) keys.push("traps:하지 말 것");
    return keys.sort();
  }

  function injectedCoreKeys(state: string): string[] {
    const keys: string[] = [];
    for (const h of REQUIRED_HANDOFF_HEADINGS) {
      if (state.includes(`## ${h}`)) keys.push(`handoff:${h}`);
    }
    if (state.includes("## 활성 함정")) keys.push("traps:활성 함정");
    if (state.includes("## 하지 말 것")) keys.push("traps:하지 말 것");
    return keys.sort();
  }

  test("buildStateContext core set equals manual partial-read set", () => {
    const state = buildStateContext(liveHandoff, liveTraps);
    expect(injectedCoreKeys(state)).toEqual(manualCoreKeys(liveHandoff, liveTraps));
    expect(injectedCoreKeys(state)).toEqual([
      "handoff:Active checks",
      "handoff:Blockers",
      "handoff:Current action",
      "handoff:Current loop",
      "handoff:Don't redo",
      "handoff:Evidence",
      "handoff:Invariants",
      "handoff:One-line resume",
      "handoff:Owner pending",
      "traps:하지 말 것",
      "traps:활성 함정",
    ]);
    expect(state.length).toBeLessThanOrEqual(HARD_CAP);
    expect(truncateContext(state)).toBe(state);
    expect(state.includes("…[truncated")).toBe(false);
  });

  test("details in a section body do not change core key set after strip", () => {
    const withDetails = liveHandoff.replace(
      "## Evidence\n",
      "## Evidence\n\n<details>\n\nhidden history\n\n</details>\n\n",
    );
    // Live lint must reject details; equivalence still compares strip path vs manual.
    expect(
      validateCheckpoint(withDetails, { planVersion: "0.28.1" }).some((e) =>
        e.includes("<details>"),
      ),
    ).toBe(true);
    const state = buildStateContext(withDetails, liveTraps);
    // Injected path strips details but keeps the Evidence heading.
    expect(state.includes("## Evidence")).toBe(true);
    expect(state.includes("hidden history")).toBe(false);
    expect(injectedCoreKeys(state)).toEqual(manualCoreKeys(liveHandoff, liveTraps));
  });

  test("heading rename breaks both injection and manual core sets equally loud", () => {
    const renamed = liveHandoff.replace("## Don't redo", "## Do not repeat");
    const state = buildStateContext(renamed, liveTraps);
    const manual = manualCoreKeys(renamed, liveTraps);
    const injected = injectedCoreKeys(state);
    expect(manual).not.toContain("handoff:Don't redo");
    expect(injected).not.toContain("handoff:Don't redo");
    expect(manual).toEqual(injected);
    expect(state).toMatch(/required HANDOFF sections missing: Don't redo/);
    expect(
      validateCheckpoint(renamed, { planVersion: "0.28.1" }).some((e) =>
        e.includes("missing required heading: Don't redo"),
      ),
    ).toBe(true);
  });
});

describe("fixture determinism smoke", () => {
  test("sha256 of fixture is stable within process", () => {
    const a = createHash("sha256").update(fixture, "utf8").digest("hex");
    const b = createHash("sha256").update(readRepo(FIXTURE_REL), "utf8").digest("hex");
    expect(a).toBe(b);
  });
});
