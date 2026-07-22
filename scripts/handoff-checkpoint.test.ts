/**
 * SESSION-CONTINUITY Phase B — fixture V1–V6 + handoff:lint expected-red lock.
 *
 * Test-only validator. Does NOT wire into production/session-start path.
 * Authority: docs/spikes/SESSION-CONTINUITY-PHASE-B-LOCK.md · HANDOFF-CHECKPOINT-DESIGN §11.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { HARD_CAP, buildTrapsBlock, truncateContext } from "./session-context.ts";
import { buildStatus } from "./session-status.ts";

const ROOT = join(import.meta.dir, "..");
const FIXTURE_REL = "scripts/fixtures/handoff-checkpoint-phase-b.md";
const FIXTURE_PATH = join(ROOT, FIXTURE_REL);

/** Required headings from design §4 (exact `## ` titles). */
const REQUIRED_HEADINGS = [
  "One-line resume",
  "Current loop",
  "Current action",
  "Active checks",
  "Owner pending",
  "Blockers",
  "Invariants",
  "Evidence",
  "Don't redo",
] as const;

const FORBIDDEN_HISTORY_HEADINGS = [
  "Completed waves",
  "종결 웨이브",
  "In progress evidence",
  "Archive",
  "WORKLOG",
] as const;

const UTF8_BUDGET = 8192;

// ---------------------------------------------------------------------------
// Pure helpers (test-only — not imported by production)
// ---------------------------------------------------------------------------

function readRepo(rel: string): string {
  const p = join(ROOT, rel);
  if (!existsSync(p)) return "";
  return readFileSync(p, "utf8");
}

function utf8Bytes(s: string): number {
  return Buffer.byteLength(s, "utf8");
}

/** Count top-level `## ` headings matching exact title (no ###). */
function countHeading(text: string, title: string): number {
  const re = new RegExp(`^## ${escapeRegExp(title)}\\s*$`, "gm");
  return (text.match(re) ?? []).length;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractSection(text: string, heading: string): string | null {
  const needle = `## ${heading}`;
  const start = text.indexOf(needle);
  if (start < 0) return null;
  // Reject ### partial matches: needle must be at line start
  if (start > 0 && text[start - 1] !== "\n") {
    // might still be at file start
    if (start !== 0) return null;
  }
  const bodyStart = start + needle.length;
  const next = text.indexOf("\n## ", bodyStart);
  const body = next >= 0 ? text.slice(bodyStart, next) : text.slice(bodyStart);
  return `${needle}${body}`.trimEnd();
}

/**
 * Loud structural validation of a Phase-B-shaped checkpoint document.
 * Returns [] when valid; otherwise human-readable failure reasons (never silent ok).
 */
export function validateCheckpoint(doc: string, opts?: {
  planVersion?: string;
  trapsText?: string;
  requireEvidenceTargets?: boolean;
  root?: string;
}): string[] {
  const errors: string[] = [];
  const root = opts?.root ?? ROOT;
  const planVersion = opts?.planVersion ?? "0.28.0";

  // Real HTML details open tags only (prose mentioning the prohibition is fine).
  if (/(^|\n)\s*<details[\s>]/m.test(doc) || /<\/details>/i.test(doc)) {
    errors.push("forbidden <details> present");
  }

  for (const h of REQUIRED_HEADINGS) {
    const n = countHeading(doc, h);
    if (n === 0) errors.push(`missing required heading: ${h}`);
    if (n > 1) errors.push(`duplicate heading: ${h} (count=${n})`);
  }

  for (const h of FORBIDDEN_HISTORY_HEADINGS) {
    if (countHeading(doc, h) > 0) {
      errors.push(`forbidden history heading present: ${h}`);
    }
  }

  // Renamed Current action (star emoji live form) is not the Phase B contract.
  if (countHeading(doc, "⭐ Current action (read first)") > 0) {
    errors.push("legacy starred Current action heading present (Phase B uses ## Current action)");
  }

  const bytes = utf8Bytes(doc);
  if (bytes > UTF8_BUDGET) {
    errors.push(`UTF-8 size ${bytes}B > ${UTF8_BUDGET}`);
  }

  // V1: PLAN version must appear; do not invent a second review authority table.
  if (!doc.includes(planVersion)) {
    errors.push(`PLAN version ${planVersion} not referenced`);
  }
  if (/##\s*Plan status/i.test(doc) || /##\s*Review verdict/i.test(doc)) {
    errors.push("second PLAN/review authority section present");
  }

  // Unique next gate: Current action must mention Phase B uniquely as gate title.
  const action = extractSection(doc, "Current action");
  if (action) {
    const gateTitles = [...action.matchAll(/^###\s+(.+)$/gm)].map((m) => m[1]!.trim());
    if (gateTitles.length !== 1) {
      errors.push(`Current action gate titles must be exactly 1, got ${gateTitles.length}`);
    } else if (!/Phase B/i.test(gateTitles[0]!)) {
      errors.push(`unique next gate must be Phase B, got: ${gateTitles[0]}`);
    }
  }

  // Blockers contract: either literal `(none)` or a table/form with clear condition.
  const blockers = extractSection(doc, "Blockers");
  if (blockers) {
    const body = blockers.replace(/^## Blockers\s*/, "").trim();
    if (body === "") {
      errors.push("malformed Blockers: empty body");
    } else if (!/^\(none\)$/m.test(body) && !/clear condition|해제 조건|Clear condition/i.test(body)) {
      errors.push("malformed Blockers: missing (none) or clear-condition form");
    }
  }

  // Evidence targets must resolve inside the repo (Phase B lock V6 + V2).
  if (opts?.requireEvidenceTargets !== false) {
    const evidence = extractSection(doc, "Evidence");
    if (evidence) {
      const paths = [...evidence.matchAll(/`([^`]+)`/g)].map((m) => m[1]!);
      for (const p of paths) {
        if (
          p.startsWith("docs/") ||
          p.startsWith("tasks/") ||
          p.startsWith("scripts/") ||
          p === "HANDOFF.md" ||
          p === "HANDOFF_WINDOWS.md" ||
          p === "AGENTS.md"
        ) {
          if (!existsSync(join(root, p))) {
            errors.push(`missing Evidence target: ${p}`);
          }
        }
      }
    }
  }

  // ROADMAP authority without adopted ROADMAP is loud-fail (V6).
  if (!existsSync(join(root, "docs/ROADMAP.md"))) {
    const claimsRoadmapAuthority =
      /taken from ROADMAP|from ROADMAP\.md|authoritative.*ROADMAP|ROADMAP\s+SSOT|current loop.*ROADMAP\.md/i.test(
        doc,
      );
    if (claimsRoadmapAuthority) {
      errors.push("ROADMAP authority referenced without adopted docs/ROADMAP.md");
    }
  }

  // Traps: require BOTH exact sections (partial rename is also loud failure — V6).
  if (opts?.trapsText !== undefined) {
    const trapsText = opts.trapsText;
    if (trapsText.length > 0) {
      const active = extractSection(trapsText, "활성 함정");
      const dont = extractSection(trapsText, "하지 말 것");
      if (!active) errors.push("traps missing exact section: 활성 함정");
      if (!dont) errors.push("traps missing exact section: 하지 말 것");
      const block = buildTrapsBlock(trapsText);
      if (block === "") {
        errors.push("traps headings renamed or missing — injection empty");
      } else {
        // Partial loss: one heading renamed still yields non-empty block — still fail.
        if (!block.includes("## 활성 함정") || !block.includes("## 하지 말 것")) {
          errors.push("traps partial loss — both 활성 함정 and 하지 말 것 required");
        }
      }
    }
  }

  return errors;
}

/**
 * Test-only review-source shape check (design §11 V6: table→bullet must not pass).
 * Does not call production buildStatus; operates on synthetic review text only.
 */
export function validateReviewSourceShape(reviewText: string): string[] {
  const errors: string[] = [];
  const start = reviewText.indexOf("## Open (blocking)");
  if (start < 0) {
    errors.push("review missing ## Open (blocking) section");
    return errors;
  }
  const end = reviewText.indexOf("\n## ", start + 10);
  const section = reviewText.slice(start, end > start ? end : start + 2000);
  // Expected: markdown table with header separator. Bullet-only is a shape failure.
  const hasTable =
    /\|[^\n]+\|\n\|[-| :]+\|/.test(section) ||
    /\|[-| :]+\|/.test(section);
  const hasBulletsOnly =
    /^\s*[-*]\s+/m.test(section) && !hasTable && !/\|\s*[-:]+\s*\|/.test(section);
  if (!hasTable) {
    errors.push("review Open(blocking) shape invalid: expected markdown table");
  }
  if (hasBulletsOnly) {
    errors.push("review Open(blocking) shape drifted table→bullet");
  }
  // Explicit bullet rewrite of what used to be a table row also fails when no table.
  if (/\*\*Open blocking\*\*/i.test(section) && !hasTable) {
    errors.push("review Open(blocking) uses prose/bullet instead of table");
  }
  return errors;
}

/**
 * Assemble Phase-B execution-path state: sentinel + live buildStatus() + fixture
 * sections + traps (test-only). Production buildStateContext is not rewired.
 */
export function assemblePhaseBState(fixture: string, trapsText?: string): string {
  const parts: string[] = [
    "[LOOM-SESSION-CONTEXT v1 · state · phase-b-fixture]",
    buildStatus(),
  ];
  for (const h of REQUIRED_HEADINGS) {
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
    expect(planHead).toMatch(/\*\*Version\*\*\s*\|\s*\*\*0\.28\.0\*\*/);
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
    expect(utf8Bytes(fixture)).toBeLessThanOrEqual(UTF8_BUDGET);
    for (const h of REQUIRED_HEADINGS) {
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
    for (const h of REQUIRED_HEADINGS) {
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

describe("Phase B live handoff:lint expected-red lock", () => {
  test("bun run handoff:lint exits 1 with top-80 > 8192 capacity class", async () => {
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
    // Phase B treats this red as expected success of the lock, not failure of the wave.
    expect(code).toBe(1);
    expect(out).toMatch(/HANDOFF top-80\s*=\s*\d+B\s*>\s*8192/);
    expect(out).toMatch(/HANDOFF_ARCHIVE\.md|규칙 L15/);
  });
});

describe("fixture determinism smoke", () => {
  test("sha256 of fixture is stable within process", () => {
    const a = createHash("sha256").update(fixture, "utf8").digest("hex");
    const b = createHash("sha256").update(readRepo(FIXTURE_REL), "utf8").digest("hex");
    expect(a).toBe(b);
  });
});
