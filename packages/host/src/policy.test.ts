import { describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultWorkerPermissions } from "./agent-argv";
import {
  builtinPolicyDefaults,
  type DeprecatedToolLists,
  type EffectivePolicy,
  loadPolicy,
  mergePolicy,
  type PolicyV1,
  parsePolicy,
  policyHash,
} from "./policy";

const POLICY_PATH = "/tmp/loom-policy/policy.json";
const ALLOW_PATH = "bridge.json#worker.permissions.claude.allowedTools";
const DENY_PATH = "bridge.json#worker.permissions.claude.disallowedTools";

function body(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    shell: { allow: ["make *"], deny: [] },
    network: false,
    mcp: { deny: [] },
    skills: { allowScripts: [] },
    ...over,
  };
}

function parsed(over: Record<string, unknown> = {}): PolicyV1 {
  return parsePolicy(body(over));
}

function merge(user: PolicyV1 | null, deprecated: DeprecatedToolLists = {}) {
  return mergePolicy(builtinPolicyDefaults(), user, {
    policyPath: POLICY_PATH,
    ...deprecated,
  });
}

describe("parsePolicy fail-closed", () => {
  test("rejects a non-object", () => {
    expect(() => parsePolicy([])).toThrow(/policy: must be an object/);
    expect(() => parsePolicy(null)).toThrow(/policy: must be an object/);
    expect(() => parsePolicy("policy")).toThrow(/policy: must be an object/);
  });

  test("rejects unknown keys", () => {
    expect(() => parsePolicy(body({ ask: true }))).toThrow(/policy: unknown key "ask"/);
    expect(() => parsePolicy(body({ shell: { allow: [], deny: [], ask: [] } }))).toThrow(
      /shell: unknown key "ask"/,
    );
    expect(() => parsePolicy(body({ mcp: { deny: [], allow: [] } }))).toThrow(
      /mcp: unknown key "allow"/,
    );
    expect(() => parsePolicy(body({ skills: { allowScripts: [], extra: [] } }))).toThrow(
      /skills: unknown key "extra"/,
    );
  });

  test("rejects wrong types", () => {
    expect(() => parsePolicy(body({ shell: { allow: "make *", deny: [] } }))).toThrow(
      /shell\.allow: must be a string\[\]/,
    );
    expect(() => parsePolicy(body({ shell: { allow: ["make *"], deny: [1] } }))).toThrow(
      /shell\.deny\[0\]/,
    );
    expect(() => parsePolicy(body({ network: "false" }))).toThrow(/network: must be a boolean/);
    expect(() => parsePolicy(body({ mcp: { deny: [], isolate: "true" } }))).toThrow(
      /mcp\.isolate: must be a boolean/,
    );
    expect(() => parsePolicy(body({ skills: { allow: "all", allowScripts: [] } }))).toThrow(
      /skills\.allow: must be a string\[\]/,
    );
    expect(() => parsePolicy(body({ shell: "nope" }))).toThrow(/shell: must be an object/);
  });

  test("rejects version other than 1", () => {
    expect(() => parsePolicy(body({ version: 2 }))).toThrow(/version: must be 1/);
    expect(() => parsePolicy(body({ version: "1" }))).toThrow(/version: must be 1/);
    expect(() => parsePolicy(body({ version: 0 }))).toThrow(/version: must be 1/);
    const missing = body();
    delete missing.version;
    expect(() => parsePolicy(missing)).toThrow(/version: is required/);
  });

  test("rejects no-space star suffix", () => {
    expect(() => parsed({ shell: { allow: ["echo*"], deny: [] } })).toThrow(
      /shell\.allow\[0\]: rejected no-space '\*' suffix: "echo\*"/,
    );
    expect(() => parsed({ shell: { allow: [], deny: ["git push*"] } })).toThrow(
      /shell\.deny\[0\]: rejected no-space '\*' suffix/,
    );
    expect(() => parsed({ shell: { allow: ["git status*"], deny: [] } })).toThrow(
      /no-space '\*' suffix/,
    );
  });

  test("rejects a leading dash", () => {
    expect(() => parsed({ shell: { allow: ["-rf *"], deny: [] } })).toThrow(
      /shell\.allow\[0\]: leading '-' rejected: "-rf \*"/,
    );
    expect(() => parsed({ shell: { allow: [], deny: ["--yolo *"] } })).toThrow(
      /shell\.deny\[0\]: leading '-' rejected/,
    );
  });

  test("rejects NUL, CR, LF, and empty rules", () => {
    expect(() => parsed({ shell: { allow: ["git\0 status *"], deny: [] } })).toThrow(
      /shell\.allow\[0\]: contains NUL/,
    );
    expect(() => parsed({ shell: { allow: [], deny: ["git\r status *"] } })).toThrow(
      /shell\.deny\[0\]: contains CR/,
    );
    expect(() => parsed({ shell: { allow: ["git\n status *"], deny: [] } })).toThrow(
      /shell\.allow\[0\]: contains LF/,
    );
    expect(() => parsed({ shell: { allow: [""], deny: [] } })).toThrow(/shell\.allow\[0\]: empty/);
    expect(() => parsed({ shell: { allow: ["   "], deny: [] } })).toThrow(
      /shell\.allow\[0\]: empty/,
    );
    expect(() => parsed({ shell: { allow: [" *"], deny: [] } })).toThrow(/shell\.allow\[0\]/);
  });

  test("rejects shell metacharacters and a missing space-star suffix", () => {
    for (const rule of [
      "echo; id *",
      "echo && id *",
      "echo | id *",
      "echo `id` *",
      "echo $(id) *",
      "echo >out *",
      "echo <in *",
    ]) {
      expect(() => parsed({ shell: { allow: [rule], deny: [] } })).toThrow(
        /shell\.allow\[0\]: shell metacharacter rejected/,
      );
    }
    expect(() => parsed({ shell: { allow: ["git status"], deny: [] } })).toThrow(
      /shell\.allow\[0\]: must end with " \*"/,
    );
    expect(() => parsed({ shell: { allow: ["git push* "], deny: [] } })).toThrow(
      /shell\.allow\[0\]/,
    );
  });

  test("rejects a bad mcp deny entry and a bad skill name", () => {
    expect(() => parsed({ mcp: { deny: ["server"] } })).toThrow(
      /mcp\.deny\[0\]: must be "<server>__<tool>"/,
    );
    expect(() => parsed({ mcp: { deny: [""] } })).toThrow(/mcp\.deny\[0\]/);
    expect(() => parsed({ skills: { allow: ["Bad_Name"], allowScripts: [] } })).toThrow(
      /skills\.allow\[0\]: invalid skill name/,
    );
    expect(() => parsed({ skills: { allowScripts: ["Has_Space"] } })).toThrow(
      /skills\.allowScripts\[0\]: invalid skill name/,
    );
  });

  test("accepts a minimal file, absent skills.allow, and explicit empty allow", () => {
    const absent = parsed();
    expect(absent.version).toBe(1);
    expect(absent.skills.allow).toBeUndefined();
    expect(absent.mcp.isolate).toBeUndefined();
    expect(absent.network).toBe(false);
    const none = parsed({ skills: { allow: [], allowScripts: [] } });
    expect(none.skills.allow).toEqual([]);
    const opted = parsed({ mcp: { deny: ["srv__tool"], isolate: false } });
    expect(opted.mcp.isolate).toBe(false);
    expect(opted.mcp.deny).toEqual(["srv__tool"]);
  });

  test("shell.allow is optional; absent stays absent and [] stays present", () => {
    const absent = parsed({ shell: { deny: [] } });
    expect(absent.shell.allow).toBeUndefined();
    expect(Object.hasOwn(absent.shell, "allow")).toBe(false);
    expect(parsed({ shell: { allow: [], deny: [] } }).shell.allow).toEqual([]);
    expect(() => parsed({ shell: { allow: [] } })).toThrow(/shell\.deny: is required/);
    expect(() => parsed({ shell: { deny: [], allow: null } })).toThrow(
      /shell\.allow: must be a string\[\]/,
    );
  });
});

describe("builtin defaults from D10", () => {
  test("normalizes no-space Bash forms to p and p *, and drops curl/wget", () => {
    const defaults = builtinPolicyDefaults();
    const perms = defaultWorkerPermissions();
    expect(perms.claude?.disallowedTools).toContain("Bash(git push*)");
    expect(perms.claude?.disallowedTools).toContain("Bash(curl *)");
    expect(defaults.network).toBe(false);
    expect(defaults.mcp.isolate).toBe(true);
    expect(defaults.mcp.deny).toEqual([]);
    expect(defaults.skills.allow).toBeUndefined();
    expect(defaults.skills.allowScripts).toEqual([]);

    expect(defaults.shell.deny).toContain("git push");
    expect(defaults.shell.deny).toContain("git push *");
    expect(defaults.shell.deny).toContain("git reset --hard");
    expect(defaults.shell.deny).toContain("git reset --hard *");
    expect(defaults.shell.deny).toContain("git clean");
    expect(defaults.shell.deny).toContain("git clean *");
    expect(defaults.shell.deny).toContain("rm *");
    expect(defaults.shell.deny).toContain("rmdir *");
    expect(defaults.shell.deny).toContain("sudo *");
    expect(defaults.shell.deny).not.toContain("curl *");
    expect(defaults.shell.deny).not.toContain("wget *");
    expect(defaults.shell.deny.join("\n")).not.toMatch(/\S\*/);

    expect(defaults.shell.allow).toContain("git status");
    expect(defaults.shell.allow).toContain("git status *");
    expect(defaults.shell.allow).toContain("git diff");
    expect(defaults.shell.allow).toContain("git diff *");
    expect(defaults.shell.allow).toContain("git log");
    expect(defaults.shell.allow).toContain("git log *");
    expect(defaults.shell.allow).toContain("bun test");
    expect(defaults.shell.allow).toContain("bun test *");
    expect(defaults.shell.allow).toContain("npm test");
    expect(defaults.shell.allow).toContain("npm test *");
    expect(defaults.shell.allow).toContain("bun run *");
    expect(defaults.shell.allow).not.toContain("Read");
    expect(defaults.shell.allow).not.toContain("Bash(git status*)");
    expect(defaults.shell.allow.join("\n")).not.toMatch(/\S\*/);
  });
});

describe("mergePolicy", () => {
  test("allow replaces and deny unions, and allow does not relax a deny", () => {
    const { effective, warnings } = merge(
      parsed({
        shell: { allow: ["rm *", "make *"], deny: ["dd *"] },
        network: false,
      }),
    );
    expect(warnings).toEqual([]);
    expect(effective.shell.allow).toEqual(["make *", "rm *"]);
    expect(effective.shell.allow).not.toContain("git status *");
    expect(effective.shell.deny).toContain("rm *");
    expect(effective.shell.deny).toContain("dd *");
    expect(effective.shell.deny).toContain("git push");
    expect(effective.shell.deny).toContain("git push *");
    expect(effective.shell.deny).toContain("sudo *");
  });

  test("deny stays a superset of builtin and user deny", () => {
    const defaults = builtinPolicyDefaults();
    const cases = [
      { allow: ["make *"], deny: [] as string[], network: false },
      { allow: ["rm *"], deny: ["dd *"], network: false },
      { allow: ["curl *"], deny: ["curl *"], network: true },
      { allow: [], deny: ["zzz *"], network: true },
    ];
    for (const item of cases) {
      const { effective } = merge(
        parsed({ shell: { allow: item.allow, deny: item.deny }, network: item.network }),
      );
      for (const rule of defaults.shell.deny) expect(effective.shell.deny).toContain(rule);
      for (const rule of item.deny) expect(effective.shell.deny).toContain(rule);
      if (!item.network) {
        expect(effective.shell.deny).toContain("curl *");
        expect(effective.shell.deny).toContain("wget *");
        expect(effective.webDeny).toEqual(["WebFetch", "WebSearch"]);
      }
    }
  });

  test("network=false derives curl/wget and claude web tools; network=true does not", () => {
    const blocked = merge(null);
    expect(blocked.effective.network).toBe(false);
    expect(blocked.effective.shell.deny).toContain("curl *");
    expect(blocked.effective.shell.deny).toContain("wget *");
    expect(blocked.effective.shell.deny).not.toContain("curl*");
    expect(blocked.effective.shell.deny).not.toContain("wget*");
    expect(blocked.effective.webDeny).toEqual(["WebFetch", "WebSearch"]);
    expect(blocked.effective.shell.deny.join("\n")).not.toMatch(/\S\*/);

    const open = merge(parsed({ network: true, shell: { allow: ["make *"], deny: [] } }));
    expect(open.effective.shell.deny).not.toContain("curl *");
    expect(open.effective.shell.deny).not.toContain("wget *");
    expect(open.effective.webDeny).toEqual([]);
    expect(open.effective.shell.deny).toContain("git push *");
    expect(open.effective.shell.deny).toContain("rm *");
  });

  test("an explicit curl deny survives network=true", () => {
    const { effective } = merge(
      parsed({ network: true, shell: { allow: ["make *"], deny: ["curl *"] } }),
    );
    expect(effective.shell.deny).toContain("curl *");
    expect(effective.shell.deny).not.toContain("wget *");
    expect(effective.webDeny).toEqual([]);
  });

  test("mcp.isolate defaults to true", () => {
    expect(merge(null).effective.mcp.isolate).toBe(true);
    expect(merge(parsed()).effective.mcp.isolate).toBe(true);
    expect(merge(parsed({ mcp: { deny: [], isolate: false } })).effective.mcp.isolate).toBe(false);
    expect(merge(parsed({ mcp: { deny: ["srv__tool"] } })).effective.mcp).toEqual({
      deny: ["srv__tool"],
      isolate: true,
    });
  });

  test("skills.allow absent means all and [] means none", () => {
    expect(merge(null).effective.skills.allow).toBeNull();
    expect(merge(parsed()).effective.skills.allow).toBeNull();
    expect(
      merge(parsed({ skills: { allow: [], allowScripts: [] } })).effective.skills.allow,
    ).toEqual([]);
    expect(
      merge(parsed({ skills: { allow: ["loom-card-report"], allowScripts: ["loom-card-report"] } }))
        .effective.skills,
    ).toEqual({ allow: ["loom-card-report"], allowScripts: ["loom-card-report"] });
  });

  test("absent policy.json uses deprecated allow as the allow set and warns", () => {
    const { effective, warnings } = merge(null, {
      allow: ["Bash(make *)", "Read", "Bash(git status*)"],
      allowPath: ALLOW_PATH,
    });
    expect(effective.shell.allow).toEqual(["git status", "git status *", "make *"]);
    expect(effective.shell.allow).not.toContain("Read");
    expect(effective.shell.allow).not.toContain("bun test *");
    expect(effective.shell.allow).not.toContain("git status*");
    expect(warnings).toEqual([
      `deprecated allow list ${ALLOW_PATH} is the shell allow set because ${POLICY_PATH} is absent; no-space entries narrowed to "p" and "p *": Bash(git status*)`,
    ]);
  });

  test("a deprecated allow of only non-shell tools replaces shell allow with nothing", () => {
    const { effective, warnings } = merge(null, {
      allow: ["Read", "Edit"],
      allowPath: ALLOW_PATH,
    });
    expect(effective.shell.allow).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(effective.shell.deny).toContain("rm *");
  });

  test("policy shell.allow together with deprecated allow refuses and names both paths", () => {
    const both = `${ALLOW_PATH} and bridge.json#worker.permissions.grok.allow`;
    expect(() =>
      merge(parsed(), {
        allow: ["Bash(make *)"],
        allowPath: both,
      }),
    ).toThrow(`policy allow specified in both ${POLICY_PATH} shell.allow and ${both}`);
    expect(() => merge(parsed(), { allow: [], allowPath: ALLOW_PATH })).toThrow(
      new RegExp(
        `policy allow specified in both ${POLICY_PATH.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} shell\\.allow and ${ALLOW_PATH.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
      ),
    );
  });

  test("policy.json without shell.allow and no deprecated allow keeps the builtin allow", () => {
    const defaults = builtinPolicyDefaults();
    const { effective, warnings } = merge(parsed({ shell: { deny: ["dd *"] } }));
    expect(warnings).toEqual([]);
    expect(effective.shell.allow).toEqual(defaults.shell.allow);
    expect(effective.shell.allow).toContain("git status *");
    for (const rule of defaults.shell.deny) expect(effective.shell.deny).toContain(rule);
    expect(effective.shell.deny).toContain("dd *");
    expect(effective.shell.deny).toContain("curl *");
  });

  test("policy.json without shell.allow uses deprecated allow as the allow set and warns", () => {
    const { effective, warnings } = merge(parsed({ shell: { deny: ["dd *"] } }), {
      allow: ["Bash(make *)", "Read", "Bash(git status*)"],
      allowPath: ALLOW_PATH,
    });
    expect(effective.shell.allow).toEqual(["git status", "git status *", "make *"]);
    expect(effective.shell.allow).not.toContain("bun test *");
    expect(effective.shell.deny).toContain("dd *");
    expect(effective.shell.deny).toContain("rm *");
    expect(warnings).toEqual([
      `deprecated allow list ${ALLOW_PATH} is the shell allow set because ${POLICY_PATH} shell.allow is absent; no-space entries narrowed to "p" and "p *": Bash(git status*)`,
    ]);
  });

  test("policy shell.allow [] together with deprecated allow still refuses", () => {
    expect(() =>
      merge(parsed({ shell: { allow: [], deny: [] } }), {
        allow: ["Bash(make *)"],
        allowPath: ALLOW_PATH,
      }),
    ).toThrow(`policy allow specified in both ${POLICY_PATH} shell.allow and ${ALLOW_PATH}`);
  });

  test("deprecated deny is unioned and warned", () => {
    const { effective, warnings } = merge(parsed({ shell: { allow: ["make *"], deny: [] } }), {
      deny: ["Bash(shutdown *)", "Bash(halt)", "Bash(dd *)", "Read", "WebFetch"],
      denyPath: DENY_PATH,
    });
    expect(effective.shell.deny).toContain("shutdown *");
    expect(effective.shell.deny).toContain("halt");
    expect(effective.shell.deny).toContain("dd *");
    expect(effective.shell.deny).toContain("git push *");
    expect(effective.shell.deny).not.toContain("Bash(shutdown *)");
    expect(effective.shell.deny.join("\n")).not.toMatch(/\S\*/);
    expect(effective.toolDeny).toEqual(["Read"]);
    expect(effective.webDeny).toEqual(["WebFetch", "WebSearch"]);
    expect(warnings).toEqual([
      `deprecated deny list ${DENY_PATH} is unioned into the effective deny`,
    ]);
  });

  test("a deprecated deny with a no-space p* form refuses startup (lookalike coverage, UK-1 §G)", () => {
    for (const entry of ["Bash(rm*)", "rm*"]) {
      let message = "";
      try {
        merge(parsed({ shell: { allow: ["make *"], deny: [] } }), {
          deny: ["Bash(dd *)", entry],
          denyPath: DENY_PATH,
        });
      } catch (err) {
        message = err instanceof Error ? err.message : String(err);
      }
      expect(message).toContain(JSON.stringify(entry));
      expect(message).toContain(DENY_PATH);
      expect(message).toContain(POLICY_PATH);
      expect(message).toContain('"rm *"');
      expect(message).toContain("lookalike");
    }
    expect(() => merge(null, { deny: ["Bash(git push*)"], denyPath: DENY_PATH })).toThrow(
      /Bash\(git push\*\)/,
    );
  });

  test("a deprecated allow with a no-space form is narrowed to p and p * and named in the warning", () => {
    const { effective, warnings } = merge(null, {
      allow: ["Bash(git status*)", "git log*", "Bash(make *)"],
      allowPath: ALLOW_PATH,
    });
    expect(effective.shell.allow).toEqual([
      "git log",
      "git log *",
      "git status",
      "git status *",
      "make *",
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Bash(git status*)");
    expect(warnings[0]).toContain("git log*");
    expect(warnings[0]).not.toContain("Bash(make *)");
  });

  test("an explicit empty deprecated deny or allow still warns", () => {
    const deny = merge(parsed(), { deny: [], denyPath: DENY_PATH });
    expect(deny.warnings).toEqual([
      `deprecated deny list ${DENY_PATH} is unioned into the effective deny`,
    ]);
    expect(deny.effective.toolDeny).toEqual([]);
    const allow = merge(null, { allow: [], allowPath: ALLOW_PATH });
    expect(allow.warnings).toEqual([
      `deprecated allow list ${ALLOW_PATH} is the shell allow set because ${POLICY_PATH} is absent`,
    ]);
    expect(allow.effective.shell.allow).toEqual([]);
    expect(merge(parsed(), {}).warnings).toEqual([]);
    expect(merge(parsed(), { deny: undefined, allow: undefined }).warnings).toEqual([]);
  });

  test("a deprecated web deny is kept when network is true", () => {
    const { effective } = merge(parsed({ network: true }), {
      deny: ["WebSearch"],
      denyPath: DENY_PATH,
    });
    expect(effective.webDeny).toEqual(["WebSearch"]);
    expect(effective.shell.deny).not.toContain("curl *");
  });

  test("rejects a deprecated no-space rule that is not a Bash() tool", () => {
    expect(() => merge(null, { deny: ["echo*"], denyPath: DENY_PATH })).toThrow(/echo\*/);
    expect(() => merge(null, { allow: ["-rf *"], allowPath: ALLOW_PATH })).toThrow(/leading '-'/);
  });
});

describe("policyHash", () => {
  test("is stable across key order and array order", () => {
    const left = merge(
      parsed({
        shell: { allow: ["zeta *", "make *"], deny: ["dd *", "aa *"] },
        mcp: { deny: ["b__t", "a__t"], isolate: true },
        skills: { allow: ["z-skill", "a-skill"], allowScripts: ["z-skill", "a-skill"] },
      }),
    ).effective;
    const right = merge(
      parsed({
        skills: { allowScripts: ["a-skill", "z-skill"], allow: ["a-skill", "z-skill"] },
        mcp: { isolate: true, deny: ["a__t", "b__t"] },
        shell: { deny: ["aa *", "dd *"], allow: ["make *", "zeta *"] },
      }),
    ).effective;
    expect(policyHash(left)).toBe(policyHash(right));
    expect(policyHash(left)).toMatch(/^[0-9a-f]{64}$/);

    const reordered: EffectivePolicy = {
      webDeny: [...left.webDeny].reverse(),
      toolDeny: [...left.toolDeny],
      skills: {
        allowScripts: [...(left.skills.allowScripts ?? [])].reverse(),
        allow: left.skills.allow ? [...left.skills.allow].reverse() : null,
      },
      mcp: { isolate: left.mcp.isolate, deny: [...left.mcp.deny].reverse() },
      network: left.network,
      shell: {
        deny: [...left.shell.deny].reverse(),
        allow: [...left.shell.allow].reverse(),
      },
      version: 1,
    };
    expect(policyHash(reordered)).toBe(policyHash(left));
  });

  test("changes when the effective policy changes, including absent vs empty skills.allow", () => {
    const base = merge(parsed()).effective;
    const extra = merge(parsed({ shell: { allow: ["make *"], deny: ["dd *"] } })).effective;
    expect(policyHash(base)).not.toBe(policyHash(extra));
    const all: EffectivePolicy = { ...base, skills: { allow: null, allowScripts: [] } };
    const none: EffectivePolicy = { ...base, skills: { allow: [], allowScripts: [] } };
    expect(policyHash(all)).not.toBe(policyHash(none));
    const open: EffectivePolicy = {
      ...base,
      network: true,
      shell: {
        allow: base.shell.allow,
        deny: base.shell.deny.filter((rule) => rule !== "curl *" && rule !== "wget *"),
      },
      webDeny: [],
    };
    expect(policyHash(open)).not.toBe(policyHash(base));
  });
});

describe("loadPolicy", () => {
  test("returns null when policy.json is absent and reads only the given loomDir", () => {
    const loomDir = mkdtempSync(join(tmpdir(), "loom-policy-absent-"));
    try {
      expect(loadPolicy(loomDir)).toBeNull();
      writeFileSync(
        join(loomDir, "policy.json"),
        `${JSON.stringify(body({ shell: { allow: ["make *"], deny: ["dd *"] } }))}\n`,
      );
      expect(loadPolicy(loomDir)).toEqual(parsed({ shell: { allow: ["make *"], deny: ["dd *"] } }));
      writeFileSync(
        join(loomDir, "policy.json"),
        `${JSON.stringify(body({ shell: { deny: ["dd *"] } }))}\n`,
      );
      const noAllow = loadPolicy(loomDir);
      expect(noAllow?.shell.allow).toBeUndefined();
      expect(noAllow?.shell.deny).toEqual(["dd *"]);
    } finally {
      rmSync(loomDir, { recursive: true, force: true });
    }
  });

  const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
  const fileOf = (dir: string) => join(dir, "policy.json");
  const good = `${JSON.stringify(body({ shell: { allow: ["make *"], deny: ["dd *"] } }))}\n`;

  function withDir(prefix: string, fn: (dir: string) => void): void {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    try {
      fn(dir);
    } finally {
      try {
        chmodSync(dir, 0o700);
      } catch {}
      rmSync(dir, { recursive: true, force: true });
    }
  }

  function loadError(dir: string): string {
    try {
      loadPolicy(dir);
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
    return "<no throw>";
  }

  test("a dangling symlink fails closed instead of reading as absent", () => {
    withDir("loom-policy-dangling-", (dir) => {
      symlinkSync(join(dir, "missing-target.json"), fileOf(dir));
      const message = loadError(dir);
      expect(message).toContain(fileOf(dir));
      expect(message).toMatch(/dangling|ENOENT/);
    });
  });

  test("a looping symlink fails closed", () => {
    withDir("loom-policy-loop-", (dir) => {
      symlinkSync(fileOf(dir), fileOf(dir));
      const message = loadError(dir);
      expect(message).toContain(fileOf(dir));
      expect(message).toContain("ELOOP");
    });
  });

  test.skipIf(isRoot)("an unreadable parent (EACCES) fails closed", () => {
    withDir("loom-policy-eacces-", (root) => {
      const dir = join(root, "loom");
      mkdirSync(dir);
      writeFileSync(fileOf(dir), good);
      chmodSync(dir, 0o000);
      try {
        const message = loadError(dir);
        expect(message).toContain(fileOf(dir));
        expect(message).toContain("EACCES");
      } finally {
        chmodSync(dir, 0o700);
      }
    });
  });

  test("a loomDir that is a regular file (ENOTDIR) fails closed", () => {
    withDir("loom-policy-enotdir-", (root) => {
      const dir = join(root, "not-a-dir");
      writeFileSync(dir, "x");
      const message = loadError(dir);
      expect(message).toContain(fileOf(dir));
      expect(message).toContain("ENOTDIR");
    });
  });

  test("a missing loomDir reads as absent; a dangling-symlink loomDir fails closed", () => {
    withDir("loom-policy-nodir-", (root) => {
      expect(loadPolicy(join(root, "never-created"))).toBeNull();
      const linked = join(root, "linked");
      symlinkSync(join(root, "gone"), linked);
      expect(loadError(linked)).toContain(fileOf(linked));
    });
  });

  test("a symlink to a regular file is followed; a symlink to a directory is rejected", () => {
    withDir("loom-policy-link-", (dir) => {
      const target = join(dir, "real.json");
      writeFileSync(target, good);
      symlinkSync(target, fileOf(dir));
      expect(loadPolicy(dir)).toEqual(parsed({ shell: { allow: ["make *"], deny: ["dd *"] } }));
    });
    withDir("loom-policy-linkdir-", (dir) => {
      const target = join(dir, "sub");
      mkdirSync(target);
      symlinkSync(target, fileOf(dir));
      const message = loadError(dir);
      expect(message).toContain(fileOf(dir));
      expect(message).toMatch(/not a regular file/);
    });
  });

  test("a directory or FIFO at policy.json is rejected without blocking", () => {
    withDir("loom-policy-dir-", (dir) => {
      mkdirSync(fileOf(dir));
      expect(loadError(dir)).toMatch(/not a regular file/);
    });
    withDir("loom-policy-fifo-", (dir) => {
      const made = Bun.spawnSync(["mkfifo", fileOf(dir)]);
      expect(made.exitCode).toBe(0);
      const started = Date.now();
      const message = loadError(dir);
      expect(Date.now() - started).toBeLessThan(2000);
      expect(message).toContain(fileOf(dir));
      expect(message).toMatch(/not a regular file/);
    });
  });

  test("caps policy.json at 64 KiB and names the size", () => {
    withDir("loom-policy-big-", (dir) => {
      const base = good.trimEnd();
      writeFileSync(fileOf(dir), base + " ".repeat(65536 - base.length));
      expect(loadPolicy(dir)).toEqual(parsed({ shell: { allow: ["make *"], deny: ["dd *"] } }));
      writeFileSync(fileOf(dir), base + " ".repeat(65537 - base.length));
      const message = loadError(dir);
      expect(message).toContain(fileOf(dir));
      expect(message).toContain("65537");
      expect(message).toContain("65536");
    });
  });

  test("fail-closed errors name the file path and the field path", () => {
    const loomDir = mkdtempSync(join(tmpdir(), "loom-policy-bad-"));
    const file = join(loomDir, "policy.json");
    try {
      writeFileSync(file, "{ not json");
      expect(() => loadPolicy(loomDir)).toThrow(
        new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      );
      writeFileSync(
        file,
        `${JSON.stringify({ version: 2, shell: { allow: ["echo*"], deny: [] } })}\n`,
      );
      try {
        loadPolicy(loomDir);
        throw new Error("expected loadPolicy to throw");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        expect(message).toContain(file);
        expect(message).toContain("version");
      }
      writeFileSync(file, `${JSON.stringify(body({ shell: { allow: ["echo*"], deny: [] } }))}\n`);
      try {
        loadPolicy(loomDir);
        throw new Error("expected loadPolicy to throw");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        expect(message).toContain(file);
        expect(message).toContain("shell.allow[0]");
      }
    } finally {
      rmSync(loomDir, { recursive: true, force: true });
    }
  });
});
