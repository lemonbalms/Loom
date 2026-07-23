import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildNormsEnvelope,
  CLAUDE_NORMS_CHAR_BUDGET,
  extractCorePack,
  extractLexiconPack,
  extractNormPacks,
  extractTrapsNormPack,
  formatNormsOutput,
  measureNormsBudget,
  type NormSources,
  normalizeLf,
  runNormsCheck,
  validateHostWiring,
  validateNormsEnvelope,
} from "./norms-receipt.ts";

const ROOT = join(import.meta.dir, "..");
const FIXTURE = join(import.meta.dir, "fixtures/norms");

function fixtureSources(): NormSources {
  return {
    agents: readFileSync(join(FIXTURE, "AGENTS.md"), "utf8"),
    sessionStart: readFileSync(join(FIXTURE, "SESSION-START.md"), "utf8"),
    traps: readFileSync(join(FIXTURE, "traps.md"), "utf8"),
  };
}

describe("NORMS §7.3 deterministic extraction", () => {
  test("fixture extracts exact core rows + complete Pause bullet list only", () => {
    const body = extractCorePack(fixtureSources().agents);
    expect(body).toContain("| **Autonomy (default)** | autonomy bytes |");
    expect(body).toContain("| Verify | verify bytes |");
    expect(body).toContain("### Pause only when (true blockers)");
    expect(body).toContain("- blocker two");
    expect(body).not.toContain("Product");
    expect(body).not.toContain("Otherwise: excluded");
  });

  test("lexicon is the complete Triggers section, including composite acceptance #12", () => {
    const body = extractLexiconPack(fixtureSources().sessionStart);
    expect(body.startsWith("## Triggers + precedence")).toBe(true);
    expect(body).toContain("### Capability masks");
    expect(body).toContain("### Composite utterances (acceptance #12)");
    expect(body).toContain("**Must not:** status wave.");
    expect(body).not.toContain("## Templates");
  });

  test("traps-norm is the complete non-empty 하지 말 것 section", () => {
    const body = extractTrapsNormPack(fixtureSources().traps);
    expect(body).toBe("## 하지 말 것\n\n- do not one\n- do not two");
  });

  test("CRLF and LF inputs produce identical pack bodies", () => {
    const sources = fixtureSources();
    const crlf = Object.fromEntries(
      Object.entries(sources).map(([key, value]) => [key, value.replaceAll("\n", "\r\n")]),
    ) as NormSources;
    expect(extractNormPacks(crlf)).toEqual(extractNormPacks(sources));
    expect(normalizeLf("a\r\nb\rc")).toBe("a\nb\nc");
  });

  test("missing and duplicate core rows fail loud", () => {
    const source = fixtureSources().agents;
    expect(() => extractCorePack(source.replace(/^\| Verify .*\n/m, ""))).toThrow(
      "core row Verify",
    );
    expect(() =>
      extractCorePack(
        source.replace(
          "| Verify | verify bytes |",
          "| Verify | verify bytes |\n| Verify | duplicate |",
        ),
      ),
    ).toThrow("got 2");
  });

  test("missing and duplicate Pause heading fail loud", () => {
    const source = fixtureSources().agents;
    expect(() =>
      extractCorePack(source.replace("### Pause only when (true blockers)", "### Pause")),
    ).toThrow("got 0");
    expect(() =>
      extractCorePack(`${source}\n### Pause only when (true blockers)\n\n- duplicate\n`),
    ).toThrow("got 2");
  });

  test("missing/duplicate lexicon anchors and empty traps fail loud", () => {
    const sources = fixtureSources();
    expect(() =>
      extractLexiconPack(sources.sessionStart.replace("### Capability masks", "### Masks")),
    ).toThrow("got 0");
    expect(() =>
      extractLexiconPack(
        sources.sessionStart.replace("### Precedence", "### Precedence\n\n### Precedence"),
      ),
    ).toThrow("got 2");
    expect(() => extractTrapsNormPack("## 하지 말 것\n\n")).toThrow("missing or empty");
  });
});

describe("NORMS envelope, digest, and host gates", () => {
  test("fixed assembly order and per-body sha8 are deterministic", () => {
    const packs = extractNormPacks(fixtureSources());
    const first = buildNormsEnvelope(packs);
    const second = buildNormsEnvelope(extractNormPacks(fixtureSources()));
    expect(first).toBe(second);
    expect(first).toMatch(
      /^\[LOOM-NORMS-BEGIN v1 · packs: core@[a-f0-9]{8} lexicon@[a-f0-9]{8} traps-norm@[a-f0-9]{8}\]/,
    );
    expect(first.indexOf("PACK-BEGIN core")).toBeLessThan(first.indexOf("PACK-BEGIN lexicon"));
    expect(first.indexOf("PACK-BEGIN lexicon")).toBeLessThan(
      first.indexOf("PACK-BEGIN traps-norm"),
    );
    expect(first.endsWith("[LOOM-NORMS-END v1]")).toBe(true);
    expect(validateNormsEnvelope(first, packs)).toEqual([]);
  });

  test("missing marker, stale body, and channel omission are UNVERIFIED failures", () => {
    const packs = extractNormPacks(fixtureSources());
    const envelope = buildNormsEnvelope(packs);
    expect(validateNormsEnvelope(envelope.replace("[LOOM-NORMS-END v1]", ""), packs)).toContain(
      "outer END missing or duplicate",
    );
    expect(
      validateNormsEnvelope(envelope.replace("autonomy bytes", "stale bytes"), packs).join("\n"),
    ).toContain("core: body missing, empty, or stale");
    expect(validateNormsEnvelope(`${envelope}\noutput was truncated`, packs)).toContain(
      "norms envelope contains channel omission marker",
    );
    expect(validateNormsEnvelope(envelope.replace("core@", "core@deadbeef"), packs)).toContain(
      "outer BEGIN missing, duplicate, or stale",
    );
    expect(validateNormsEnvelope(`${envelope}\n[... 10 lines omitted ...]`, packs)).toContain(
      "norms envelope contains channel omission marker",
    );
  });

  test("Claude JSON carries the exact envelope; raw and Codex plain are identical", () => {
    const envelope = buildNormsEnvelope(extractNormPacks(fixtureSources()));
    expect(formatNormsOutput(envelope, "raw")).toBe(envelope);
    expect(formatNormsOutput(envelope, "codex-plain")).toBe(envelope);
    const parsed = JSON.parse(formatNormsOutput(envelope, "claude-json"));
    expect(parsed.hookSpecificOutput).toEqual({
      hookEventName: "SessionStart",
      additionalContext: envelope,
    });
  });

  test("host wiring enables measured Claude only and keeps Codex fail-closed", () => {
    const budget = measureNormsBudget(buildNormsEnvelope(extractNormPacks(fixtureSources())));
    expect(budget.chars).toBeLessThan(CLAUDE_NORMS_CHAR_BUDGET);
    expect(budget.claude).toBe("enabled");
    expect(budget.codex).toBe("disabled-token-unmeasured");
    expect(
      validateHostWiring({
        budget,
        claudeSettings: {
          hooks: {
            SessionStart: [{ command: "bun run scripts/norms-receipt.ts --format claude-json" }],
          },
        },
        codexHooks: {
          hooks: { SessionStart: [{ command: "bun run scripts/session-context.ts" }] },
        },
      }),
    ).toEqual([]);
    expect(
      validateHostWiring({
        budget,
        claudeSettings: { hooks: { SessionStart: [] } },
        codexHooks: {
          hooks: {
            SessionStart: [{ command: "bun run scripts/norms-receipt.ts --format codex-plain" }],
          },
        },
      }).join("\n"),
    ).toMatch(/Claude NORMS accelerator|Codex NORMS accelerator/);
  });

  test("live sources satisfy exact selection and fit the Claude visible budget", () => {
    const live = extractNormPacks({
      agents: readFileSync(join(ROOT, "AGENTS.md"), "utf8"),
      sessionStart: readFileSync(join(ROOT, "docs/SESSION-START.md"), "utf8"),
      traps: readFileSync(join(ROOT, "tasks/traps.md"), "utf8"),
    });
    const envelope = buildNormsEnvelope(live);
    expect(validateNormsEnvelope(envelope, live)).toEqual([]);
    expect(measureNormsBudget(envelope).claude).toBe("enabled");
  });

  test("live norms:check locks canonical extraction, budget, and host wiring", () => {
    const result = runNormsCheck(ROOT);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.report).toContain("Claude: enabled");
    expect(result.report).toContain("Codex: disabled-token-unmeasured");
  });
});
