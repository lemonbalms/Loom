/**
 * PLAN 0.32.0 P4 verify round 3 (H2) + coordinator follow-up: a missing loomDir reads as
 * "no policy" (built-in defaults) only when loomDir's parent resolves (stat, following
 * symlinks — a symlinked $HOME is common on Linux) to a directory. A dangling, missing or
 * non-directory parent, or any lookup error, fails closed — for the Loom MCP server and
 * the headless worker alike (same loader).
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadPolicy } from "./policy";

const roots: string[] = [];
function root(): string {
  const r = mkdtempSync(join(tmpdir(), "loom-policy-parent-"));
  roots.push(r);
  return r;
}

afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

function loadError(dir: string): string {
  try {
    loadPolicy(dir);
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  throw new Error("expected loadPolicy to throw");
}

describe("loadPolicy — missing loomDir is absent only when its parent resolves to a directory", () => {
  test("fresh home (real dir) without .loom → null (built-in defaults)", () => {
    const home = root();
    expect(loadPolicy(join(home, ".loom"))).toBeNull();
  });

  test("home replaced by a dangling symlink → throws fail-closed", () => {
    const r = root();
    const home = join(r, "home");
    symlinkSync(join(r, "gone"), home);
    const message = loadError(join(home, ".loom"));
    expect(message).toContain("fail-closed");
    expect(message).toContain(join(home, ".loom", "policy.json"));
  });

  test("home is a symlink to a real dir and .loom is missing → null (symlinked $HOME is fine)", () => {
    const r = root();
    const real = join(r, "real-home");
    mkdirSync(real);
    const home = join(r, "home");
    symlinkSync(real, home);
    expect(loadPolicy(join(home, ".loom"))).toBeNull();
  });

  test("home is a symlink to a symlink to a real dir → null", () => {
    const r = root();
    const real = join(r, "real-home");
    mkdirSync(real);
    symlinkSync(real, join(r, "hop"));
    const home = join(r, "home");
    symlinkSync(join(r, "hop"), home);
    expect(loadPolicy(join(home, ".loom"))).toBeNull();
  });

  test("home is a symlink to a regular file → throws", () => {
    const r = root();
    writeFileSync(join(r, "file"), "x");
    const home = join(r, "home");
    symlinkSync(join(r, "file"), home);
    expect(loadError(join(home, ".loom"))).toContain("fail-closed");
  });

  test("parent missing too → throws", () => {
    const r = root();
    expect(loadError(join(r, "no-such-home", ".loom"))).toContain("fail-closed");
  });

  test("an existing real loomDir without policy.json is unchanged (null)", () => {
    const home = root();
    mkdirSync(join(home, ".loom"));
    expect(loadPolicy(join(home, ".loom"))).toBeNull();
  });

  test("an existing policy.json is unaffected", () => {
    const home = root();
    mkdirSync(join(home, ".loom"));
    writeFileSync(
      join(home, ".loom", "policy.json"),
      JSON.stringify({
        version: 1,
        shell: { deny: [] },
        network: false,
        mcp: { deny: ["loom__room_chat"] },
        skills: { allowScripts: [] },
      }),
    );
    expect(loadPolicy(join(home, ".loom"))?.mcp.deny).toEqual(["loom__room_chat"]);
  });
});
