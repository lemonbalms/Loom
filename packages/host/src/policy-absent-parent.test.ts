/**
 * PLAN 0.32.0 P4 verify round 3 (H2) + coordinator follow-up: a missing loomDir reads as
 * "no policy" (built-in defaults) only when loomDir's parent resolves (stat, following
 * symlinks — a symlinked $HOME is common on Linux) to a directory. A dangling, missing or
 * non-directory parent, or any lookup error, fails closed — for the Loom MCP server and
 * the headless worker alike (same loader).
 */
import { afterEach, describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as policyModule from "./policy";
import { loadPolicy } from "./policy";

type LoadHooks = { afterFirstLstat?: () => void; afterAbsenceChecks?: () => void };
function hooks(): LoadHooks {
  const h = (policyModule as unknown as { policyLoadTestHooks?: LoadHooks }).policyLoadTestHooks;
  expect(h).toBeDefined();
  return h as LoadHooks;
}

const RESTRICTIVE = {
  version: 1,
  shell: { deny: [] },
  network: false,
  mcp: { deny: ["loom__room_chat"] },
  skills: { allowScripts: [] },
};

/** Outcome of one load: the policy (null = defaults) or the thrown message. */
function outcome(dir: string): { policy: ReturnType<typeof loadPolicy> } | { error: string } {
  try {
    return { policy: loadPolicy(dir) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

const roots: string[] = [];
function root(): string {
  const r = mkdtempSync(join(tmpdir(), "loom-policy-parent-"));
  roots.push(r);
  return r;
}

afterEach(() => {
  const h = (policyModule as unknown as { policyLoadTestHooks?: LoadHooks }).policyLoadTestHooks;
  if (h) {
    h.afterFirstLstat = undefined;
    h.afterAbsenceChecks = undefined;
  }
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

describe("loadPolicy — absence is decided from two consistent observations (P4 verify round 4 H)", () => {
  test("reported interleaving: lstat(policy.json) ENOENT under a dangling .loom, then .loom becomes a real dir with a restrictive policy → restrictive policy or refusal, never defaults", () => {
    const home = root();
    const loom = join(home, ".loom");
    symlinkSync(join(home, "gone"), loom);
    let fired = false;
    hooks().afterFirstLstat = () => {
      if (fired) return;
      fired = true;
      unlinkSync(loom);
      mkdirSync(loom);
      writeFileSync(join(loom, "policy.json"), JSON.stringify(RESTRICTIVE));
    };
    const r = outcome(loom);
    expect(fired).toBe(true);
    if ("policy" in r) {
      expect(r.policy).not.toBeNull();
      expect(r.policy?.mcp.deny).toEqual(["loom__room_chat"]);
    } else {
      expect(r.error).toContain("fail-closed");
    }
  });

  test("policy.json appears after the absence checks → retried once → restrictive policy", () => {
    const home = root();
    const loom = join(home, ".loom");
    mkdirSync(loom);
    let fired = false;
    hooks().afterAbsenceChecks = () => {
      if (fired) return;
      fired = true;
      writeFileSync(join(loom, "policy.json"), JSON.stringify(RESTRICTIVE));
    };
    expect(loadPolicy(loom)?.mcp.deny).toEqual(["loom__room_chat"]);
    expect(fired).toBe(true);
  });

  test("loomDir swapped (dir → dangling) between the two observations → never defaults", () => {
    const home = root();
    const loom = join(home, ".loom");
    mkdirSync(loom);
    let fired = false;
    hooks().afterAbsenceChecks = () => {
      if (fired) return;
      fired = true;
      rmSync(loom, { recursive: true });
      symlinkSync(join(home, "gone"), loom);
    };
    const r = outcome(loom);
    expect(fired).toBe(true);
    expect("error" in r).toBe(true);
    if ("error" in r) expect(r.error).toContain("fail-closed");
  });

  /** Swap `.loom` with a sibling real dir (distinct inodes guaranteed — both exist at once). */
  function swapper(home: string): () => void {
    const loom = join(home, ".loom");
    const alt = join(home, ".loom-alt");
    const tmp = join(home, ".loom-tmp");
    mkdirSync(alt);
    return () => {
      renameSync(loom, tmp);
      renameSync(alt, loom);
      renameSync(tmp, alt);
    };
  }

  test("loomDir replaced by a different real dir between observations → retried; consistent second view → defaults", () => {
    const home = root();
    const loom = join(home, ".loom");
    mkdirSync(loom);
    const swap = swapper(home);
    let n = 0;
    hooks().afterAbsenceChecks = () => {
      n++;
      if (n === 1) swap();
    };
    expect(loadPolicy(loom)).toBeNull();
    expect(n).toBe(2);
  });

  test("inconsistent on both attempts → throws `policy.json changed during load (fail-closed)`", () => {
    const home = root();
    const loom = join(home, ".loom");
    mkdirSync(loom);
    const swap = swapper(home);
    let n = 0;
    hooks().afterAbsenceChecks = () => {
      n++;
      swap();
    };
    const r = outcome(loom);
    expect(n).toBe(2);
    expect("error" in r).toBe(true);
    if ("error" in r) {
      expect(r.error).toContain("policy.json changed during load");
      expect(r.error).toContain("fail-closed");
    }
  });
});
