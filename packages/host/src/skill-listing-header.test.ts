/**
 * PLAN 0.38.1 P1 (D2 · D5 · D6 · R2 · R57-L1) — codex/grok first-turn skill listing header.
 * The header tells the worker that the listed SKILL.md copies sit outside the working
 * directory and may be read (not modified). Only the header text changes: entry lines, the
 * claude `Unavailable skills:` header, the 20-entry / 4,096-byte caps and the cap line are
 * 0.38.0 bytes. The header counts toward the byte cap, so entry room shrinks by 134 B.
 *
 * Cap cases size their entries from the D2 literal (not the constant) so they fail in red.
 * Fingerprint invariance is proven by `policy-fingerprint.test.ts` passing unedited.
 */
import { describe, expect, test } from "bun:test";
import type { AvailableSkill, UnavailableSkill } from "./skill-materialize";
import {
  containsMarker,
  renderSkillListing,
  SKILL_LISTING_CLAUDE_HEADER,
  SKILL_LISTING_HEADER,
  SKILL_LISTING_MAX_BYTES,
  SKILL_LISTING_MAX_ENTRIES,
  SKILL_SHADOW_SUFFIX,
} from "./skill-prompt";

const HEADER_VERBATIM =
  "Available skills — Loom copied these for this card outside the working directory. Reading the SKILL.md files listed here is allowed; do not modify them. Read the SKILL.md before use:";
const OLD_HEADER = "Available skills — read the SKILL.md before use:";

const bytes = (s: string) => Buffer.byteLength(s, "utf8");

describe("SKILL_LISTING_HEADER — D2 text (0.38.1)", () => {
  test("is the D2 text verbatim", () => {
    expect(SKILL_LISTING_HEADER).toBe(HEADER_VERBATIM);
  });

  test("is 184 UTF-8 bytes (+134 over the 0.38.0 header)", () => {
    expect(bytes(SKILL_LISTING_HEADER)).toBe(184);
    expect(bytes(OLD_HEADER)).toBe(50);
    expect(bytes(SKILL_LISTING_HEADER) - bytes(OLD_HEADER)).toBe(134);
  });

  test("is one line (no LF / CR)", () => {
    expect(SKILL_LISTING_HEADER).not.toContain("\n");
    expect(SKILL_LISTING_HEADER).not.toContain("\r");
  });

  test("keeps the `Available skills` prefix (R2)", () => {
    expect(SKILL_LISTING_HEADER.startsWith("Available skills")).toBe(true);
  });

  test("does not contain the task marker and has no control/format/separator chars (R57-L1)", () => {
    expect(containsMarker(SKILL_LISTING_HEADER)).toBe(false);
    expect(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(SKILL_LISTING_HEADER)).toBe(false);
  });
});

describe("renderSkillListing — only the header changes (D2)", () => {
  const A: AvailableSkill = {
    name: "alpha",
    source: "builtin",
    description: "Does alpha things.",
    skillMdPath: "/abs/loom/cards/p/c/skills/plugin/skills/alpha/SKILL.md",
  };
  const S: AvailableSkill = {
    name: "loom-card-report",
    source: "user",
    description: "Owner override.",
    skillMdPath: "/abs/loom/cards/p/c/skills/plugin/skills/loom-card-report/SKILL.md",
    shadowsBuiltin: true,
  };
  const U: UnavailableSkill = { name: "bravo", reason: "requires policy" };

  for (const agent of ["codex", "grok"] as const) {
    test(`${agent}: first line is the new header; entry lines are 0.38.0 format`, () => {
      const listing = renderSkillListing(agent, { available: [A, S], unavailable: [U] });
      expect(listing).toBe(
        [
          HEADER_VERBATIM,
          `- alpha: Does alpha things. — ${A.skillMdPath}`,
          `- loom-card-report: Owner override. — ${S.skillMdPath} (user, shadows bundled)`,
          "- bravo: unavailable: requires policy",
        ].join("\n"),
      );
      expect(listing.split("\n")[0]).toBe(HEADER_VERBATIM);
    });
  }

  test("claude: `Unavailable skills:` header unchanged, no Available line", () => {
    const listing = renderSkillListing("claude", { available: [A, S], unavailable: [U] });
    expect(SKILL_LISTING_CLAUDE_HEADER).toBe("Unavailable skills:");
    expect(listing).toBe("Unavailable skills:\n- bravo: unavailable: requires policy");
    expect(listing).not.toContain("Available skills");
    expect(listing).not.toContain(HEADER_VERBATIM);
  });
});

describe("renderSkillListing — byte cap with the longer header (D5)", () => {
  const name = "alpha";
  const description = "Does alpha things.";
  const tail = "/SKILL.md";
  /** A single Available entry whose block under `header` is exactly `total` bytes. */
  function entryFor(header: string, total: number): AvailableSkill {
    const fixed = `${header}\n- ${name}: ${description} — /`;
    const pad = total - bytes(fixed) - bytes(tail);
    return { name, source: "builtin", description, skillMdPath: `/${"p".repeat(pad)}${tail}` };
  }
  const capped = `${HEADER_VERBATIM}\n- (+1 more): unavailable: cap`;

  test("caps are unchanged (20 entries · 4,096 bytes · shadow suffix)", () => {
    expect(SKILL_LISTING_MAX_ENTRIES).toBe(20);
    expect(SKILL_LISTING_MAX_BYTES).toBe(4096);
    expect(SKILL_SHADOW_SUFFIX).toBe(" (user, shadows bundled)");
  });

  test("an entry whose block is exactly 4,096 bytes with the new header is shown", () => {
    const e = entryFor(HEADER_VERBATIM, 4096);
    const listing = renderSkillListing("codex", { available: [e], unavailable: [] });
    expect(bytes(listing)).toBe(4096);
    expect(listing.startsWith(`${HEADER_VERBATIM}\n`)).toBe(true);
    expect(listing.endsWith(e.skillMdPath)).toBe(true);
  });

  test("one more path byte → collapses into the cap line", () => {
    const longer = entryFor(HEADER_VERBATIM, 4097);
    expect(bytes(`${HEADER_VERBATIM}\n- ${name}: ${description} — ${longer.skillMdPath}`)).toBe(4097);
    expect(renderSkillListing("codex", { available: [longer], unavailable: [] })).toBe(capped);
    expect(renderSkillListing("grok", { available: [longer], unavailable: [] })).toBe(capped);
  });

  test("an entry that fit the 0.38.0 header's 4,096 − 50 B budget now collapses (−134 B room)", () => {
    const e = entryFor(OLD_HEADER, 4096);
    expect(bytes(`${OLD_HEADER}\n- ${name}: ${description} — ${e.skillMdPath}`)).toBe(4096);
    expect(renderSkillListing("codex", { available: [e], unavailable: [] })).toBe(capped);
    // 134 B shorter fits exactly again under the new header.
    const shorter = { ...e, skillMdPath: `/${"p".repeat(e.skillMdPath.length - tail.length - 1 - 134)}${tail}` };
    const fits = renderSkillListing("codex", { available: [shorter], unavailable: [] });
    expect(bytes(fits)).toBe(4096);
    expect(fits.endsWith(shorter.skillMdPath)).toBe(true);
  });

  test("the 20-entry cap and cap line are unchanged", () => {
    const many: UnavailableSkill[] = Array.from({ length: 21 }, (_, i) => ({
      name: `s${String(i).padStart(2, "0")}`,
      reason: "not installed",
    }));
    const listing = renderSkillListing("codex", { available: [], unavailable: many });
    const lines = listing.split("\n");
    expect(lines[0]).toBe(HEADER_VERBATIM);
    expect(lines).toHaveLength(1 + 20 + 1);
    expect(lines[20]).toBe("- s19: unavailable: not installed");
    expect(lines[21]).toBe("- (+1 more): unavailable: cap");
  });
});
