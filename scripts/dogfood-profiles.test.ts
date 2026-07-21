import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const activeProfiles = [
  "codex-arch",
  "grok-impl",
  "claude-impl",
  "codex-impl",
  "claude-rev",
  "codex-rev",
] as const;

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("dogfood active profile contract", () => {
  test("dogfood:up starts the canonical six profiles", () => {
    const source = read("scripts/dogfood-up.sh");
    expect(source).toContain(`PROFILES="${activeProfiles.join(",")}"`);
  });

  test("dogfood:status reports the same profiles in the same order", () => {
    const source = read("scripts/dogfood-room-status.sh");
    expect(source).toContain(`for prof in ${activeProfiles.join(" ")}; do`);
  });

  test("room setup creates the architect peer and joins the Grok implementer", () => {
    const source = read("scripts/dogfood-room-up.sh");
    expect(source).toContain("--profile codex-arch room create --as codex-architect");
    expect(source).toContain('--profile grok-impl room join "$INVITE" --as grok-impl');
  });

  test("legacy impl profile is absent from active launcher commands", () => {
    for (const path of [
      "scripts/dogfood-up.sh",
      "scripts/dogfood-room-up.sh",
      "scripts/dogfood-room-status.sh",
    ]) {
      const source = read(path);
      expect(source).not.toContain("--profile impl");
      expect(source).not.toContain('PROFILES="impl');
    }
  });

  test("boot contracts preserve architect/implementer separation", () => {
    const architect = read("scripts/dogfood-architect-boot.txt");
    const grok = read("scripts/dogfood-grok-impl-boot.txt");
    expect(architect).toContain("architect, not implementer");
    expect(architect).toContain("Do not claim that task or write its product code");
    expect(grok).toContain("implementer, not architect or reviewer");
    expect(grok).toContain("@codex-architect");
  });
});
