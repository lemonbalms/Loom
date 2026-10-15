/**
 * PLAN 0.31.0 P2 red. Per-CLI policy compiler, claude --settings switch,
 * bridge-config upgrade path (R49-M2), and fake CLI strictness (R49-M4).
 *
 * assumed API:
 * from "./policy-compile":
 *   BASE_ALLOW_TOOLS = ["Read", "Edit", "Write", "Glob", "Grep"]       // R8
 *   compileClaudeSettings(eff): { permissions: { allow: string[]; deny: string[] } }
 *   compileClaudePolicyArgv(eff): string[]   // --settings <json> [--strict-mcp-config]
 *   compileCodexPolicyArgv(eff): string[]    // -c sandbox_workspace_write.network_access=<bool>
 *   compileGrokPolicyArgv(eff): string[]     // --allow r / --deny r per rule [--disable-web-search]
 *   resolveWorkerPolicy(permissions, userPolicy, { policyPath? }): WorkerPolicy
 *     WorkerPolicy { effective: Record<AgentKind, EffectivePolicy>; hash: string; warnings: string[] }
 *   POLICY_ENFORCEMENT: D10 honesty table
 * from "./agent-argv":
 *   ARGV_TEMPLATE_VERSION = "0.31.0-v1"
 *   buildAgentArgv({ ..., policy?: EffectivePolicy })
 *   workerFingerprint(config, skillsManifestHash = "")
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ARGV_TEMPLATE_VERSION,
  type AgentKind,
  buildAgentArgv,
  defaultWorkerPermissions,
  HEADLESS_WORKER_HINT,
  validateWorkerConfig,
  type WorkerConfig,
  type WorkerPermissions,
  workerFingerprint,
} from "./agent-argv";
import {
  type BridgeConfig,
  bridgeConfigDir,
  bridgeConfigPath,
  loadBridgeConfig,
  workerConfigFromBridge,
} from "./bridge-config";
import { startBridgeRuntime } from "./bridge-runtime";
import {
  builtinPolicyDefaults,
  type EffectivePolicy,
  mergePolicy,
  type PolicyV1,
  parsePolicy,
} from "./policy";
import {
  BASE_ALLOW_TOOLS,
  compileClaudePolicyArgv,
  compileClaudeSettings,
  compileCodexPolicyArgv,
  compileGrokPolicyArgv,
  POLICY_ENFORCEMENT,
  resolveWorkerPolicy,
} from "./policy-compile";
import {
  type FableSession,
  loomDir,
  resetStateHomeDirCache,
  setActiveProfile,
} from "./session-store";

const FAKE = join(import.meta.dir, "fake-agent-cli.ts");
const CWD = "/tmp/loom-work";
const SESSION = "11111111-1111-4111-8111-111111111111";
const RESUME = "22222222-2222-4222-8222-222222222222";
const PROMPT = "UNIQUE_PROMPT_SENTINEL_31p2";
const PROMPT_FILE = "/tmp/loom-prompt.txt";

/** The 0.30.0 D10 deny list, verbatim (agent-argv 0.30.0 DENIED_TOOLS). */
const DENY_0300 = [
  "Bash(rm *)",
  "Bash(rmdir *)",
  "Bash(git push*)",
  "Bash(git reset --hard*)",
  "Bash(git clean*)",
  "Bash(sudo *)",
  "Bash(curl *)",
  "Bash(wget *)",
];

/** A `*` right after a non-space character (the banned `p*` form, UK-1 §G). */
const NO_SPACE_STAR = /[^ ]\*/;

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

function effective(user: PolicyV1 | null = null): EffectivePolicy {
  return mergePolicy(builtinPolicyDefaults(), user, {}).effective;
}

function defaultEffective(): EffectivePolicy {
  return effective(null);
}

function withPolicy(over: Record<string, unknown>): EffectivePolicy {
  return effective(parsePolicy(body(over)));
}

/** Rule values that follow --allow / --deny, in order. */
function grokRules(argv: readonly string[], flag: "--allow" | "--deny"): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) if (argv[i] === flag) out.push(argv[i + 1] ?? "");
  return out;
}

function settingsOf(argv: readonly string[]): { permissions: { allow: string[]; deny: string[] } } {
  const at = argv.indexOf("--settings");
  if (at < 0) throw new Error("no --settings");
  return JSON.parse(argv[at + 1] ?? "") as { permissions: { allow: string[]; deny: string[] } };
}

function count(argv: readonly string[], token: string): number {
  return argv.filter((arg) => arg === token).length;
}

function build(
  agent: AgentKind,
  opts: { resume?: boolean; policy?: EffectivePolicy; permissions?: WorkerPermissions } = {},
) {
  return buildAgentArgv({
    agent,
    cwd: CWD,
    sessionId: SESSION,
    resumeSessionId: opts.resume ? RESUME : undefined,
    hint: HEADLESS_WORKER_HINT,
    prompt: PROMPT,
    promptFile: PROMPT_FILE,
    permissions: opts.permissions ?? defaultWorkerPermissions(),
    policy: opts.policy,
  });
}

/**
 * Weakest matcher across claude and grok (SPROBE §G):
 * `Bash(q *)` matches only `q <args>` (grok does not match bare q);
 * `Bash(q)` matches only exactly `q` (claude does not match `q <args>`).
 */
function weakestDenies(rules: readonly string[], command: string): boolean {
  for (const rule of rules) {
    const m = /^Bash\((.*)\)$/.exec(rule);
    if (!m) continue;
    const inner = m[1] ?? "";
    if (inner.endsWith(" *")) {
      if (command.startsWith(`${inner.slice(0, -2)} `)) return true;
    } else if (!inner.includes("*") && command === inner) return true;
  }
  return false;
}

/** Bare command and a with-args variant for each 0.30.0 deny string. */
function commandsFor(tool: string): string[] {
  const inner = /^Bash\((.*)\)$/.exec(tool)?.[1] ?? "";
  const prefix = inner.endsWith(" *") ? inner.slice(0, -2) : inner.slice(0, -1);
  return [prefix, `${prefix} -x arg`];
}

function runFake(
  kind: AgentKind,
  argv: string[],
  env: Record<string, string> = {},
): { status: number | null; stderr: string } {
  const base: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(base)) {
    if (key.startsWith("FAKE_") || key === "GROK_FOLDER_TRUST") delete base[key];
  }
  const result = spawnSync(process.execPath, [FAKE, "--fake-kind", kind, ...argv], {
    encoding: "utf8",
    env: { ...base, ...env },
    input: "",
  });
  return { status: result.status, stderr: result.stderr ?? "" };
}

describe("0.31.0 P2 (b) compiler — claude", () => {
  test("ARGV_TEMPLATE_VERSION is 0.31.0-v1", () => {
    expect(ARGV_TEMPLATE_VERSION).toBe("0.31.0-v1");
  });

  test("claude argv has one --settings, no --allowedTools/--disallowedTools, keeps --permission-mode", () => {
    for (const resume of [false, true]) {
      const argv = build("claude", { resume }).argv;
      expect(count(argv, "--settings")).toBe(1);
      expect(count(argv, "--allowedTools")).toBe(0);
      expect(count(argv, "--disallowedTools")).toBe(0);
      expect(count(argv, "--allowed-tools")).toBe(0);
      expect(count(argv, "--disallowed-tools")).toBe(0);
      expect(argv[argv.indexOf("--permission-mode") + 1]).toBe("acceptEdits");
      expect(argv.join("\n")).not.toContain(PROMPT);
    }
  });

  test("R8 fixed base allow and the normalized builtin shell allow", () => {
    const settings = compileClaudeSettings(defaultEffective());
    expect(BASE_ALLOW_TOOLS).toEqual(["Read", "Edit", "Write", "Glob", "Grep"]);
    expect(settings.permissions.allow).toEqual([
      "Read",
      "Edit",
      "Write",
      "Glob",
      "Grep",
      "Bash(bun run *)",
      "Bash(bun test)",
      "Bash(bun test *)",
      "Bash(git diff)",
      "Bash(git diff *)",
      "Bash(git log)",
      "Bash(git log *)",
      "Bash(git status)",
      "Bash(git status *)",
      "Bash(npm test)",
      "Bash(npm test *)",
    ]);
    // A policy allow replaces the shell allow; the base file tools stay.
    const replaced = compileClaudeSettings(withPolicy({ shell: { allow: ["make *"], deny: [] } }));
    expect(replaced.permissions.allow).toEqual([...BASE_ALLOW_TOOLS, "Bash(make *)"]);
  });

  test("R49-H1 every deny prefix compiles to Bash(p) and Bash(p *), plus web deny by default", () => {
    const settings = compileClaudeSettings(defaultEffective());
    expect(settings.permissions.deny).toEqual([
      "Bash(curl)",
      "Bash(curl *)",
      "Bash(git clean)",
      "Bash(git clean *)",
      "Bash(git push)",
      "Bash(git push *)",
      "Bash(git reset --hard)",
      "Bash(git reset --hard *)",
      "Bash(rm)",
      "Bash(rm *)",
      "Bash(rmdir)",
      "Bash(rmdir *)",
      "Bash(sudo)",
      "Bash(sudo *)",
      "Bash(wget)",
      "Bash(wget *)",
      "WebFetch",
      "WebSearch",
    ]);
    const owner = compileClaudeSettings(withPolicy({ shell: { deny: ["make deploy *"] } }));
    expect(owner.permissions.deny).toContain("Bash(make deploy)");
    expect(owner.permissions.deny).toContain("Bash(make deploy *)");
  });

  test("the settings JSON has only permissions.allow and permissions.deny", () => {
    const argv = compileClaudePolicyArgv(defaultEffective());
    expect(argv[0]).toBe("--settings");
    const parsed = JSON.parse(argv[1] ?? "") as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual(["permissions"]);
    expect(Object.keys(parsed.permissions as object).sort()).toEqual(["allow", "deny"]);
  });

  test("D13 / R49-M1 --strict-mcp-config by default, absent with isolate:false", () => {
    expect(build("claude").argv).toContain("--strict-mcp-config");
    expect(build("claude", { resume: true }).argv).toContain("--strict-mcp-config");
    const open = withPolicy({ mcp: { deny: [], isolate: false } });
    expect(build("claude", { policy: open }).argv).not.toContain("--strict-mcp-config");
    expect(compileClaudePolicyArgv(open)).not.toContain("--strict-mcp-config");
    const explicit = withPolicy({ mcp: { deny: [], isolate: true } });
    expect(compileClaudePolicyArgv(explicit)).toContain("--strict-mcp-config");
  });

  test("mcp.deny compiles to mcp__<server>__<tool> in permissions.deny", () => {
    const eff = withPolicy({ mcp: { deny: ["probe__pong"] } });
    const settings = settingsOf(build("claude", { policy: eff }).argv);
    expect(settings.permissions.deny).toContain("mcp__probe__pong");
  });

  test("network:true drops curl/wget and web tools from the claude deny", () => {
    const deny = compileClaudeSettings(withPolicy({ network: true })).permissions.deny;
    expect(deny).not.toContain("Bash(curl *)");
    expect(deny).not.toContain("WebFetch");
    expect(deny).not.toContain("WebSearch");
    expect(deny).toContain("Bash(git push)");
  });

  test("claude argv full pin (new) with the default policy", () => {
    const built = build("claude");
    expect(built.promptTransport).toBe("stdin");
    expect(built.argv).toEqual([
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--session-id",
      SESSION,
      "--append-system-prompt",
      HEADLESS_WORKER_HINT,
      "--permission-mode",
      "acceptEdits",
      "--settings",
      JSON.stringify(compileClaudeSettings(defaultEffective())),
      "--strict-mcp-config",
    ]);
  });
});

describe("0.31.0 P2 (b) compiler — codex", () => {
  test("network_access follows policy.network on exec and resume", () => {
    for (const resume of [false, true]) {
      const off = build("codex", { resume }).argv;
      expect(off).toContain("sandbox_workspace_write.network_access=false");
      expect(off[off.indexOf("sandbox_workspace_write.network_access=false") - 1]).toBe("-c");
      const on = build("codex", { resume, policy: withPolicy({ network: true }) }).argv;
      expect(on).toContain("sandbox_workspace_write.network_access=true");
      expect(on).not.toContain("sandbox_workspace_write.network_access=false");
    }
    expect(compileCodexPolicyArgv(defaultEffective())).toEqual([
      "-c",
      "sandbox_workspace_write.network_access=false",
    ]);
  });

  test("codex keeps -s / approval_policy, writes no rules file argument, and no shell deny flags", () => {
    const exec = build("codex").argv;
    expect(exec).toEqual([
      "exec",
      "--json",
      "-C",
      CWD,
      "--sandbox",
      "workspace-write",
      "-c",
      "sandbox_workspace_write.network_access=false",
      "-c",
      "approval_policy=never",
      "-c",
      `developer_instructions=${HEADLESS_WORKER_HINT}`,
      "--skip-git-repo-check",
      "-",
    ]);
    const resume = build("codex", { resume: true }).argv;
    expect(resume.slice(0, 10)).toEqual([
      "exec",
      "resume",
      RESUME,
      "--json",
      "-c",
      'sandbox_mode="workspace-write"',
      "-c",
      "sandbox_workspace_write.network_access=false",
      "-c",
      "approval_policy=never",
    ]);
    const flat = [...exec, ...resume].join("\n");
    expect(flat).not.toContain(".rules");
    expect(flat).not.toContain("Bash(");
  });

  test("D10 honesty: codex shell deny is recorded as not enforced", () => {
    expect(POLICY_ENFORCEMENT.shellDeny.codex).toBe("not-enforced");
    expect(POLICY_ENFORCEMENT.shellDeny.claude).toBe("enforced");
    expect(POLICY_ENFORCEMENT.shellDeny.grok).toBe("best-effort");
    expect(POLICY_ENFORCEMENT.network.codex).toBe("enforced");
    expect(POLICY_ENFORCEMENT.mcpDeny.codex).toBe("not-applicable");
    expect(POLICY_ENFORCEMENT.mcpIsolate.claude).toBe("enforced");
    expect(POLICY_ENFORCEMENT.mcpIsolate.codex).toBe("not-isolatable");
    expect(POLICY_ENFORCEMENT.mcpIsolate.grok).toBe("not-isolatable");
  });
});

describe("0.31.0 P2 (b) compiler — grok", () => {
  test("one --allow / --deny per rule, deny in both forms, --disable-web-search by default", () => {
    const argv = build("grok").argv;
    const allow = grokRules(argv, "--allow");
    const deny = grokRules(argv, "--deny");
    expect(allow).toEqual(compileClaudeSettings(defaultEffective()).permissions.allow);
    expect(deny).toContain("Bash(git push)");
    expect(deny).toContain("Bash(git push *)");
    expect(deny).toContain("Bash(curl)");
    expect(deny).toContain("Bash(curl *)");
    expect(deny).not.toContain("WebFetch");
    expect(argv).toContain("--disable-web-search");
    for (let i = 0; i < argv.length; i++) {
      if (argv[i] !== "--allow" && argv[i] !== "--deny") continue;
      const value = argv[i + 1] ?? "";
      expect(value.startsWith("-")).toBe(false);
      expect(value.length).toBeGreaterThan(0);
    }
  });

  test("mcp.deny compiles to --deny MCPTool(<server>__<tool>)", () => {
    const argv = build("grok", { policy: withPolicy({ mcp: { deny: ["probe__pong"] } }) }).argv;
    expect(grokRules(argv, "--deny")).toContain("MCPTool(probe__pong)");
  });

  test("network:true drops --disable-web-search and curl/wget", () => {
    const argv = build("grok", { policy: withPolicy({ network: true }) }).argv;
    expect(argv).not.toContain("--disable-web-search");
    expect(grokRules(argv, "--deny")).not.toContain("Bash(curl *)");
    expect(compileGrokPolicyArgv(withPolicy({ network: true }))).not.toContain(
      "--disable-web-search",
    );
  });

  test("grok argv pin (new) with the default policy", () => {
    const built = build("grok");
    expect(built.promptTransport).toBe("prompt-file");
    expect(built.argv).toEqual([
      "--prompt-file",
      PROMPT_FILE,
      "--output-format",
      "streaming-json",
      "--cwd",
      CWD,
      "--session-id",
      SESSION,
      "--rules",
      HEADLESS_WORKER_HINT,
      "--permission-mode",
      "acceptEdits",
      ...compileGrokPolicyArgv(defaultEffective()),
    ]);
    expect(built.argv.join("\n")).not.toContain(PROMPT);
  });
});

describe("0.31.0 P2 (b) semantic coverage of the 0.30.0 deny list", () => {
  test("every 0.30.0 deny string, including bare git push / git clean / git reset --hard, is caught", () => {
    const claudeDeny = compileClaudeSettings(defaultEffective()).permissions.deny;
    const grokDeny = grokRules(build("grok").argv, "--deny");
    for (const tool of DENY_0300) {
      for (const command of commandsFor(tool)) {
        expect({ tool, command, claude: weakestDenies(claudeDeny, command) }).toEqual({
          tool,
          command,
          claude: true,
        });
        expect({ tool, command, grok: weakestDenies(grokDeny, command) }).toEqual({
          tool,
          command,
          grok: true,
        });
      }
    }
    for (const bare of ["git push", "git clean", "git reset --hard"]) {
      expect(weakestDenies(claudeDeny, bare)).toBe(true);
      expect(weakestDenies(grokDeny, bare)).toBe(true);
    }
    // R4 web deny on top of the 0.30.0 set.
    expect(claudeDeny).toContain("WebFetch");
    expect(claudeDeny).toContain("WebSearch");
  });

  test("compiled output has no `*` right after a non-space character", () => {
    const policies = [
      defaultEffective(),
      withPolicy({ network: true }),
      withPolicy({
        shell: { allow: ["make *"], deny: ["make deploy *"] },
        mcp: { deny: ["a__b"] },
      }),
    ];
    for (const eff of policies) {
      const settings = compileClaudeSettings(eff);
      for (const rule of [...settings.permissions.allow, ...settings.permissions.deny]) {
        expect({ rule, bad: NO_SPACE_STAR.test(rule) }).toEqual({ rule, bad: false });
      }
      for (const agent of ["claude", "codex", "grok"] as const) {
        for (const resume of [false, true]) {
          const argv = build(agent, { resume, policy: eff }).argv;
          const rules = [...grokRules(argv, "--allow"), ...grokRules(argv, "--deny")];
          for (const rule of rules) {
            expect({ rule, bad: NO_SPACE_STAR.test(rule) }).toEqual({ rule, bad: false });
          }
        }
      }
    }
    // The 0.30.0 strings themselves did contain the banned form.
    expect(DENY_0300.some((rule) => NO_SPACE_STAR.test(rule))).toBe(true);
  });
});

describe("0.31.0 P2 policy wiring through agent-argv", () => {
  test("a deprecated profile deny is unioned when no explicit policy is passed", () => {
    const permissions = defaultWorkerPermissions();
    permissions.claude!.disallowedTools = ["Bash(make deploy *)"];
    permissions.grok!.deny = ["Bash(make deploy *)"];
    const claudeDeny = settingsOf(build("claude", { permissions }).argv).permissions.deny;
    expect(claudeDeny).toContain("Bash(make deploy)");
    expect(claudeDeny).toContain("Bash(make deploy *)");
    expect(claudeDeny).toContain("Bash(git push)");
    const grokDeny = grokRules(build("grok", { permissions }).argv, "--deny");
    expect(grokDeny).toContain("Bash(make deploy)");
  });

  test("default profiles carry no tool lists (D8 — mode/sandbox/approval/extraArgs only)", () => {
    const permissions = defaultWorkerPermissions();
    expect(permissions.claude).toEqual({ permissionMode: "acceptEdits" });
    expect(permissions.grok).toEqual({ permissionMode: "acceptEdits" });
    expect(permissions.codex).toEqual({ sandbox: "workspace-write", approvalPolicy: "never" });
  });

  test("dangerous modes still fail closed with a policy present", () => {
    const permissions = defaultWorkerPermissions();
    permissions.claude!.permissionMode = "bypassPermissions";
    expect(() => build("claude", { permissions, policy: defaultEffective() })).toThrow(
      /bypassPermissions/,
    );
  });

  test("workerFingerprint changes with the policy and with the manifest hash", () => {
    const base: WorkerConfig = {
      backend: "headless",
      cwd: CWD,
      allowedRoots: [CWD],
      maxConcurrent: { claude: 1, codex: 1, grok: 1 },
      timeoutMs: 1000,
      permissions: defaultWorkerPermissions(),
    };
    const fp = workerFingerprint(base);
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
    expect(workerFingerprint(base, "")).toBe(fp);
    expect(workerFingerprint(base, "abc")).not.toBe(fp);
    const changed: WorkerConfig = {
      ...base,
      policy: resolveWorkerPolicy(base.permissions, parsePolicy(body({ network: true }))),
    };
    expect(workerFingerprint(changed)).not.toBe(fp);
    const same: WorkerConfig = { ...base, policy: resolveWorkerPolicy(base.permissions, null) };
    expect(workerFingerprint(same)).toBe(fp);
  });

  test("resolveWorkerPolicy merges per agent, never pooling another agent's deprecated lists", () => {
    const permissions = defaultWorkerPermissions();
    permissions.claude!.disallowedTools = ["Bash(make deploy *)"];
    const policy = resolveWorkerPolicy(permissions, null);
    expect(policy.effective.claude.shell.deny).toContain("make deploy *");
    expect(policy.effective.grok.shell.deny).not.toContain("make deploy *");
    expect(policy.effective.codex.shell.deny).not.toContain("make deploy *");
    expect(policy.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(
      policy.warnings.some((w) => w.includes("worker.permissions.claude.disallowedTools")),
    ).toBe(true);
  });
});

describe("0.31.0 P2 bridge-config upgrade path (a) / R49-M2", () => {
  const dir = mkdtempSync(join(tmpdir(), "loom-p2cfg-"));
  const cwd = realpathSync(dir);
  let policyFile = "";

  beforeAll(() => {
    process.env.LOOM_TEST_HOME = dir;
    resetStateHomeDirCache();
    setActiveProfile(null);
    mkdirSync(bridgeConfigDir(), { recursive: true });
    policyFile = join(loomDir(), "policy.json");
  });

  afterAll(() => {
    delete process.env.LOOM_TEST_HOME;
    resetStateHomeDirCache();
    rmSync(dir, { recursive: true, force: true });
  });

  function writeProfile(profile: string, permissions?: unknown): void {
    writeFileSync(
      bridgeConfigPath(profile),
      JSON.stringify({
        worker: {
          backend: "headless",
          cwd,
          allowedRoots: [cwd],
          ...(permissions === undefined ? {} : { permissions }),
        },
      }),
      "utf8",
    );
  }

  function writePolicy(value: unknown): void {
    writeFileSync(policyFile, typeof value === "string" ? value : JSON.stringify(value), "utf8");
  }

  function clearPolicy(): void {
    rmSync(policyFile, { force: true });
  }

  test("claude allowedTools/disallowedTools are optional (required → optional)", () => {
    clearPolicy();
    writeProfile("p2-noLists", {
      claude: { permissionMode: "acceptEdits" },
      grok: { permissionMode: "acceptEdits" },
    });
    const worker = workerConfigFromBridge(loadBridgeConfig("p2-noLists"));
    expect(worker.permissions.claude).toEqual({ permissionMode: "acceptEdits" });
    expect(worker.permissions.grok).toEqual({ permissionMode: "acceptEdits" });
    expect(worker.policy?.warnings).toEqual([]);
    const argv = buildAgentArgv({
      agent: "claude",
      cwd,
      sessionId: SESSION,
      hint: HEADLESS_WORKER_HINT,
      prompt: PROMPT,
      permissions: worker.permissions,
      policy: worker.policy?.effective.claude,
    }).argv;
    expect(settingsOf(argv)).toEqual(compileClaudeSettings(defaultEffective()));
  });

  test("raw presence is kept: an omitted list stays omitted, [] stays present", () => {
    clearPolicy();
    writeProfile("p2-raw", { claude: { permissionMode: "acceptEdits", allowedTools: [] } });
    const cfg = loadBridgeConfig("p2-raw");
    const permissions = cfg.worker?.permissions?.claude;
    expect(permissions?.allowedTools).toEqual([]);
    expect(permissions && Object.hasOwn(permissions, "disallowedTools")).toBe(false);
    const worker = workerConfigFromBridge(cfg);
    expect(worker.policy?.effective.claude.shell.allow).toEqual([]);
    expect(compileClaudeSettings(worker.policy!.effective.claude).permissions.allow).toEqual([
      ...BASE_ALLOW_TOOLS,
    ]);
    expect(worker.policy?.warnings.length).toBeGreaterThan(0);
  });

  test("no policy.json + deprecated allow → it is the allow set (0.30.0 behaviour) + warning", () => {
    clearPolicy();
    writeProfile("p2-depAllow", {
      claude: { permissionMode: "acceptEdits", allowedTools: ["Read", "Bash(make *)"] },
    });
    const worker = workerConfigFromBridge(loadBridgeConfig("p2-depAllow"));
    expect(worker.policy?.effective.claude.shell.allow).toEqual(["make *"]);
    expect(worker.policy?.effective.grok.shell.allow).toEqual(builtinPolicyDefaults().shell.allow);
    expect(
      worker.policy?.warnings.some((w) => w.includes("worker.permissions.claude.allowedTools")),
    ).toBe(true);
  });

  test("policy.json shell.allow + deprecated allow → startup refused, both paths named", () => {
    writePolicy(body({ shell: { allow: ["make *"], deny: [] } }));
    writeProfile("p2-conflict", {
      grok: { permissionMode: "acceptEdits", allow: ["Bash(make *)"] },
    });
    let message = "";
    try {
      loadBridgeConfig("p2-conflict");
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toContain("policy.json");
    expect(message).toContain("worker.permissions.grok.allow");
    clearPolicy();
  });

  test("policy.json without shell.allow + deprecated allow → deprecated allow is used", () => {
    writePolicy(body());
    writeProfile("p2-noShellAllow", {
      claude: { permissionMode: "acceptEdits", allowedTools: ["Bash(make *)"] },
    });
    const worker = workerConfigFromBridge(loadBridgeConfig("p2-noShellAllow"));
    expect(worker.policy?.effective.claude.shell.allow).toEqual(["make *"]);
    clearPolicy();
  });

  test("deprecated deny is unioned into the compiled deny (deny never relaxed)", () => {
    writePolicy(body({ shell: { allow: [], deny: ["make release *"] } }));
    writeProfile("p2-depDeny", {
      claude: { permissionMode: "acceptEdits", disallowedTools: ["Bash(make deploy *)"] },
    });
    const worker = workerConfigFromBridge(loadBridgeConfig("p2-depDeny"));
    const deny = compileClaudeSettings(worker.policy!.effective.claude).permissions.deny;
    for (const rule of [
      "Bash(make deploy)",
      "Bash(make deploy *)",
      "Bash(make release)",
      "Bash(make release *)",
      "Bash(git push)",
      "Bash(rm *)",
    ]) {
      expect(deny).toContain(rule);
    }
    const grokDeny = compileGrokPolicyArgv(worker.policy!.effective.grok);
    expect(grokDeny).toContain("Bash(make release)");
    expect(grokDeny).not.toContain("Bash(make deploy)");
    clearPolicy();
  });

  test("invalid policy.json → loadBridgeConfig and workerConfigFromBridge refuse with path + field", () => {
    writeProfile("p2-invalid");
    writePolicy(body({ shell: { deny: ["rm*"] } }));
    expect(() => loadBridgeConfig("p2-invalid")).toThrow(policyFile);
    expect(() => loadBridgeConfig("p2-invalid")).toThrow(/shell\.deny\[0\]/);
    const cfg: BridgeConfig = {
      authorizedDispatchers: [],
      herdrSocketPath: join(dir, "missing.sock"),
      agentArgv: { claude: ["claude"] },
      worker: { backend: "headless", cwd, allowedRoots: [cwd] },
    };
    expect(() => workerConfigFromBridge(cfg)).toThrow(/invalid policy\.json/);
    writePolicy("{not json");
    expect(() => workerConfigFromBridge(cfg)).toThrow(/JSON parse failed/);
    clearPolicy();
  });

  test("startBridgeRuntime refuses to start on an invalid policy.json", async () => {
    writePolicy(body({ version: 2 }));
    const session: FableSession = {
      roomId: "room_p2_policy",
      roomName: "p2-policy",
      inviteCode: "LOOM-TEST",
      peerId: "p_node",
      displayName: "node/p2",
      color: "#0f0",
      agentKind: "shell",
      relayUrl: "ws://127.0.0.1:1/ws",
      updatedAt: new Date().toISOString(),
    };
    const cfg: BridgeConfig = {
      authorizedDispatchers: ["p_tower"],
      herdrSocketPath: join(dir, "missing.sock"),
      agentArgv: { claude: ["claude"] },
      herdrProtocol: 17,
      worker: { backend: "headless", cwd, allowedRoots: [cwd] },
    };
    await expect(
      startBridgeRuntime({ session, profile: "p2-policy-start", config: cfg }),
    ).rejects.toThrow(/version: must be 1/);
    clearPolicy();
  });

  test("policy.json applies to every agent; the config-level policy hash changes the fingerprint", () => {
    clearPolicy();
    writeProfile("p2-hash");
    const before = workerConfigFromBridge(loadBridgeConfig("p2-hash"));
    writePolicy(body({ shell: { deny: ["make deploy *"] }, network: true }));
    const after = workerConfigFromBridge(loadBridgeConfig("p2-hash"));
    expect(after.policy?.hash).not.toBe(before.policy?.hash);
    expect(workerFingerprint(after)).not.toBe(workerFingerprint(before));
    for (const agent of ["claude", "codex", "grok"] as const) {
      expect(after.policy?.effective[agent].shell.deny).toContain("make deploy *");
      expect(after.policy?.effective[agent].network).toBe(true);
    }
    expect(() => validateWorkerConfig(after)).not.toThrow();
    clearPolicy();
  });
});

describe("0.31.0 P2 (g) fake CLI strictness (R49-M4)", () => {
  test("strict fake accepts the compiled argv for every agent, new and resume, default and open policy", () => {
    for (const policy of [
      defaultEffective(),
      withPolicy({ network: true, mcp: { deny: ["a__b"], isolate: false } }),
    ]) {
      for (const agent of ["claude", "codex", "grok"] as const) {
        for (const resume of [false, true]) {
          const result = runFake(agent, build(agent, { resume, policy }).argv);
          if (result.status !== 0) {
            throw new Error(
              `${agent} ${resume ? "resume" : "new"} exited ${result.status}: ${result.stderr}`,
            );
          }
        }
      }
    }
  });

  test("fake claude rejects --allowedTools and --disallowedTools", () => {
    for (const flag of [
      "--allowedTools",
      "--disallowedTools",
      "--allowed-tools",
      "--disallowed-tools",
    ]) {
      const result = runFake("claude", ["-p", flag, "Read"]);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain(flag);
    }
  });

  test("fake claude parses --settings as JSON and requires the permissions shape", () => {
    const bad = [
      "{not json",
      "[]",
      "{}",
      JSON.stringify({ permissions: [] }),
      JSON.stringify({ permissions: { allow: [] } }),
      JSON.stringify({ permissions: { deny: [] } }),
      JSON.stringify({ permissions: { allow: "Read", deny: [] } }),
      JSON.stringify({ permissions: { allow: [1], deny: [] } }),
      JSON.stringify({ permissions: { allow: [], deny: [], ask: [] } }),
      JSON.stringify({ permissions: { allow: [], deny: [] }, hooks: {} }),
      JSON.stringify({ permissions: { allow: [], deny: ["Bash(git push*)"] } }),
      "./settings.json",
    ];
    for (const value of bad) {
      const result = runFake("claude", ["-p", "--settings", value]);
      expect({ value, status: result.status }).toEqual({ value, status: 2 });
      expect(result.stderr).toContain("--settings");
    }
    const twice = runFake("claude", [
      "-p",
      "--settings",
      JSON.stringify({ permissions: { allow: [], deny: [] } }),
      "--settings",
      JSON.stringify({ permissions: { allow: [], deny: [] } }),
    ]);
    expect(twice.status).toBe(2);
    const ok = runFake("claude", [
      "-p",
      "--settings",
      JSON.stringify({ permissions: { allow: ["Read"], deny: ["Bash(rm *)"] } }),
      "--strict-mcp-config",
    ]);
    expect(ok.stderr).toBe("");
    expect(ok.status).toBe(0);
  });

  test("fake codex rejects unknown -c keys and a bad or missing network_access", () => {
    const exec = build("codex").argv;
    const resume = build("codex", { resume: true }).argv;
    for (const argv of [exec, resume]) {
      const at = argv.indexOf("sandbox_workspace_write.network_access=false");
      const unknown = [...argv];
      unknown.splice(at + 1, 0, "-c", "model=gpt-x");
      const r1 = runFake("codex", unknown);
      expect(r1.status).toBe(2);
      expect(r1.stderr).toContain("model");

      const badValue = [...argv];
      badValue[at] = "sandbox_workspace_write.network_access=yes";
      expect(runFake("codex", badValue).status).toBe(2);

      const missing = [...argv];
      missing.splice(at - 1, 2);
      const r3 = runFake("codex", missing);
      expect(r3.status).toBe(2);
      expect(r3.stderr).toContain("network_access");
    }
    const sandboxOnExec = [...exec];
    sandboxOnExec.splice(exec.indexOf("-C"), 0, "-c", 'sandbox_mode="workspace-write"');
    expect(runFake("codex", sandboxOnExec).status).toBe(2);
  });

  test("fake grok accepts --disable-web-search and rejects --trust and GROK_FOLDER_TRUST", () => {
    const argv = build("grok").argv;
    expect(argv).toContain("--disable-web-search");
    expect(runFake("grok", argv).status).toBe(0);
    const trust = runFake("grok", [...argv, "--trust"]);
    expect(trust.status).toBe(2);
    const env = runFake("grok", argv, { GROK_FOLDER_TRUST: "0" });
    expect(env.status).toBe(2);
    expect(env.stderr).toContain("GROK_FOLDER_TRUST");
    const valued = runFake("grok", [...argv, "--disable-web-search", "x"]);
    expect(valued.status).toBe(2);
  });

  test("fake grok and claude reject a no-space p* rule value", () => {
    const grok = runFake("grok", ["--prompt-file", PROMPT_FILE, "--deny", "Bash(git push*)"]);
    expect(grok.status).toBe(2);
    expect(grok.stderr).toContain("git push*");
  });
});
