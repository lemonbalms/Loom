/**
 * PLAN 0.32.0 P1 — Done-when (a) / D4 / D5 / D7 / D10.
 * policy.json v1 optional top-level `loomTools` (done / denyModes): schema,
 * fail-closed validation, built-in default merge (deny union), and the
 * `@loom/host` policy exports.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as host from "./index";
import * as policy from "./policy";
import type { LoomDenyMode, PolicyV1 } from "./policy";

const ALL_MODES: LoomDenyMode[] = [
  "board.replace",
  "broadcast",
  "conv.fetch",
  "conv.writes",
  "pack.embed",
];

function body(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    shell: { deny: [] },
    network: false,
    mcp: { deny: [] },
    skills: { allowScripts: [] },
    ...over,
  };
}

function withLoomTools(loomTools: unknown): PolicyV1 {
  return policy.parsePolicy(body({ loomTools }));
}

const dirs: string[] = [];

function writePolicy(json: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "loom-policy-loomtools-"));
  dirs.push(dir);
  writeFileSync(join(dir, "policy.json"), JSON.stringify(json));
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("loomTools schema — valid", () => {
  test("absent: parsed policy has no loomTools", () => {
    const parsed = policy.parsePolicy(body());
    expect(Object.hasOwn(parsed, "loomTools")).toBe(false);
  });

  test("empty object is valid", () => {
    expect(withLoomTools({}).loomTools).toEqual({});
  });

  test.each(["allow", "propose"] as const)("done=%s", (done) => {
    expect(withLoomTools({ done }).loomTools).toEqual({ done });
  });

  test.each(ALL_MODES)("denyModes=[%s]", (mode) => {
    expect(withLoomTools({ denyModes: [mode] }).loomTools).toEqual({ denyModes: [mode] });
  });

  test("all five modes together, plus done", () => {
    const parsed = withLoomTools({ done: "propose", denyModes: [...ALL_MODES].reverse() });
    expect(parsed.loomTools?.done).toBe("propose");
    expect([...(parsed.loomTools?.denyModes ?? [])].sort()).toEqual(ALL_MODES);
  });

  test("empty denyModes is valid", () => {
    expect(withLoomTools({ denyModes: [] }).loomTools).toEqual({ denyModes: [] });
  });

  test("duplicate modes are accepted and normalized (deduped)", () => {
    const parsed = withLoomTools({ denyModes: ["broadcast", "broadcast", "pack.embed"] });
    expect([...(parsed.loomTools?.denyModes ?? [])].sort()).toEqual(["broadcast", "pack.embed"]);
  });

  test("existing required keys are unchanged by loomTools", () => {
    expect(() => policy.parsePolicy({ version: 1, loomTools: {} })).toThrow(/shell: is required/);
    expect(() => policy.parsePolicy(body({ version: 2, loomTools: {} }))).toThrow(
      /version: must be 1/,
    );
    const { version: _v, ...noVersion } = body({ loomTools: {} });
    expect(() => policy.parsePolicy(noVersion)).toThrow(/version: is required/);
  });
});

describe("loomTools schema — invalid (fail-closed)", () => {
  test.each([
    ["non-object", [], /loomTools: must be an object/],
    ["null", null, /loomTools: must be an object/],
    ["string", "propose", /loomTools: must be an object/],
    ["unknown key", { ask: true }, /loomTools: unknown key "ask"/],
    ["done outside enum", { done: "deny" }, /loomTools\.done: must be "allow" or "propose"/],
    ["done wrong case", { done: "Allow" }, /loomTools\.done: must be "allow" or "propose"/],
    ["done non-string", { done: true }, /loomTools\.done: must be "allow" or "propose"/],
    ["denyModes non-array", { denyModes: "broadcast" }, /loomTools\.denyModes: must be a string\[\]/],
    ["denyModes object", { denyModes: { broadcast: true } }, /loomTools\.denyModes: must be a string\[\]/],
    ["denyModes non-string item", { denyModes: [1] }, /loomTools\.denyModes\[0\]: must be a string/],
    ["unknown mode", { denyModes: ["board.replace", "rm"] }, /loomTools\.denyModes\[1\]: unknown mode "rm"/],
    ["mode wrong case", { denyModes: ["Broadcast"] }, /loomTools\.denyModes\[0\]: unknown mode "Broadcast"/],
  ] as const)("%s", (_name, loomTools, message) => {
    expect(() => withLoomTools(loomTools)).toThrow(message);
  });

  test("loadPolicy error names the file path and the field path", () => {
    const cases: [unknown, RegExp][] = [
      [{ extra: 1 }, /loomTools: unknown key "extra"/],
      [{ done: "never" }, /loomTools\.done: must be "allow" or "propose"/],
      [{ denyModes: ["nope"] }, /loomTools\.denyModes\[0\]: unknown mode "nope"/],
      [{ denyModes: "board.replace" }, /loomTools\.denyModes: must be a string\[\]/],
    ];
    for (const [loomTools, field] of cases) {
      const dir = writePolicy(body({ loomTools }));
      const file = join(dir, "policy.json");
      let message = "";
      try {
        policy.loadPolicy(dir);
      } catch (err) {
        message = err instanceof Error ? err.message : String(err);
      }
      expect(message).toContain(`invalid policy.json ${file}: `);
      expect(message).toMatch(field);
    }
  });

  test("loadPolicy returns loomTools from a valid file", () => {
    const dir = writePolicy(body({ loomTools: { done: "propose", denyModes: ["broadcast"] } }));
    expect(policy.loadPolicy(dir)?.loomTools).toEqual({ done: "propose", denyModes: ["broadcast"] });
  });
});

describe("resolveLoomTools — built-in default merge (D4 / D5)", () => {
  test("policy absent → built-in {done: allow, denyModes: [board.replace]}", () => {
    expect(policy.resolveLoomTools(null)).toEqual({ done: "allow", denyModes: ["board.replace"] });
  });

  test("policy without loomTools → built-in", () => {
    expect(policy.resolveLoomTools(policy.parsePolicy(body()))).toEqual({
      done: "allow",
      denyModes: ["board.replace"],
    });
  });

  test("policy denyModes [] still yields board.replace (nothing relaxes a deny)", () => {
    expect(policy.resolveLoomTools(withLoomTools({ denyModes: [] }))).toEqual({
      done: "allow",
      denyModes: ["board.replace"],
    });
  });

  test("effective denyModes = built-in ∪ policy", () => {
    const resolved = policy.resolveLoomTools(withLoomTools({ denyModes: ["pack.embed", "broadcast"] }));
    expect([...resolved.denyModes].sort()).toEqual(["board.replace", "broadcast", "pack.embed"]);
  });

  test("duplicates (including board.replace) collapse in the union", () => {
    const resolved = policy.resolveLoomTools(
      withLoomTools({ denyModes: ["board.replace", "conv.fetch", "conv.fetch"] }),
    );
    expect([...resolved.denyModes].sort()).toEqual(["board.replace", "conv.fetch"]);
  });

  test("done replaces the built-in when set", () => {
    expect(policy.resolveLoomTools(withLoomTools({ done: "propose" })).done).toBe("propose");
    expect(policy.resolveLoomTools(withLoomTools({ done: "allow" })).done).toBe("allow");
    expect(policy.resolveLoomTools(withLoomTools({ denyModes: ["broadcast"] })).done).toBe("allow");
  });

  test("result does not alias the parsed policy", () => {
    const parsed = withLoomTools({ denyModes: ["broadcast"] });
    const resolved = policy.resolveLoomTools(parsed);
    resolved.denyModes.push("conv.writes");
    expect(parsed.loomTools?.denyModes).toEqual(["broadcast"]);
    expect(policy.resolveLoomTools(null).denyModes).toEqual(["board.replace"]);
  });
});

describe("@loom/host policy exports (D10)", () => {
  test.each([
    "parsePolicy",
    "loadPolicy",
    "mergePolicy",
    "policyHash",
    "resolveLoomTools",
    "builtinPolicyDefaults",
  ])("%s is exported from the package index", (name) => {
    expect(typeof (host as Record<string, unknown>)[name]).toBe("function");
    expect((host as Record<string, unknown>)[name]).toBe((policy as Record<string, unknown>)[name]);
  });

  test("POLICY_MAX_BYTES and LOOM_DENY_MODES are exported", () => {
    const exported = host as Record<string, unknown>;
    expect(exported.POLICY_MAX_BYTES).toBe(64 * 1024);
    expect([...((exported.LOOM_DENY_MODES as string[] | undefined) ?? [])].sort()).toEqual(ALL_MODES);
  });
});
