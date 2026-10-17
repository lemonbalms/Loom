/**
 * PLAN 0.37.0 P4c — verifier findings on P3 (architect / Fable rulings):
 *
 * - P3-V-L3: "enabled" for headless = `worker.maxConcurrent[k] !== 0` AND `resolveAgentArgv(cfg, k)
 *   !== null` (the dispatch allowlist — an agent without a usable agentArgv entry can never spawn).
 *   One shared pure helper feeds bridge start, `readBridgeWorkerFlags(worker, agentArgv).enabled`
 *   and the doctor (which merges the top-level agentArgv exactly as loadBridgeConfig does:
 *   `{...DEFAULT_AGENT_ARGV, ...sanitizeAgentArgv(raw)}`). Oracle: the same raw bridge file →
 *   bridge-start enabled (agents named by its gap warnings under the default policy, where every
 *   enabled agent has ≥ 1 gap) === doctor `enabled` === readBridgeWorkerFlags `enabled`.
 *   Default headless config (no agentArgv key → {claude}) → only the claude network gap.
 *   STRICT_REFUSAL_TAIL first clause: "Disable the agent (worker.maxConcurrent.<agent>: 0 or remove
 *   agentArgv.<agent>)".
 * - P3-V-L1: the doctor legacy row only when the migration is pending (`<root>/.fable/policy.json`
 *   exists AND `<root>/.loom` does not — resolveStateHomeDir's condition).
 * - P3-V-L2: the doctor worker-flag view derives exactly as `memory list` (realMemoryCliDeps
 *   memoryEnabled: no file → "no bridge config", loadBridgeConfig throws → "invalid bridge config").
 *
 * Exports are looked up at call time so each case fails on its own (red phase). The bridge runs
 * in-process (relay in-process, headless skips herdr, no card is dispatched — the fake CLI is
 * never spawned). Run with HOME and LOOM_TEST_HOME pointing at a temp dir (R21).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as host from "@loom/host";
import {
  bridgeConfigSafeName,
  type FableSession,
  loadPolicy,
  loomDir,
  RelayClient,
  resetStateHomeDirCache,
  setActiveProfile,
  startBridgeRuntime,
} from "@loom/host";
import { RelayServer } from "@loom/relay";
import type { DoctorSection } from "./doctor";
import * as doctor from "./doctor";
import { realMemoryCliDeps } from "./memory-cli";

type Fn = (...args: never[]) => unknown;
function hostFn<T extends Fn>(name: string): T {
  const f = (host as unknown as Record<string, unknown>)[name];
  if (typeof f !== "function") throw new Error(`@loom/host does not export ${name}`);
  return f as T;
}
function doctorFn<T extends Fn>(name: string): T {
  const f = (doctor as unknown as Record<string, unknown>)[name];
  if (typeof f !== "function") throw new Error(`./doctor does not export ${name}`);
  return f as T;
}
type Input = Record<string, unknown> & { enabled?: unknown; worker?: unknown };
const readPolicyDoctorInput = (home: string, profile: string): Input =>
  doctorFn<(h: string, p: string) => Input>("readPolicyDoctorInput")(home, profile);
const policySection = (input: Input): DoctorSection =>
  doctorFn<(i: Input) => DoctorSection>("policySection")(input);
type Flags = { enabled: string[] };
const readBridgeWorkerFlags = (worker: unknown, agentArgv?: unknown): Flags =>
  hostFn<(w: unknown, a?: unknown) => Flags>("readBridgeWorkerFlags")(worker, agentArgv);

const AGENTS = ["claude", "codex", "grok"] as const;
type Agent = (typeof AGENTS)[number];
const ALL_ARGV = { claude: ["claude"], codex: ["codex"], grok: ["grok"] };

/** ② renderGapWarning for the default policy's claude network gap — verbatim. */
const CLAUDE_NETWORK_WARNING =
  "warning: policy network (false) is advisory for claude — the worker is told in its prompt; the CLI blocks only some forms";
/** P4c STRICT_REFUSAL_TAIL — verbatim (only the first clause changed from P1). */
const NEW_TAIL =
  "Disable the agent (worker.maxConcurrent.<agent>: 0; for codex/grok, removing agentArgv.<agent> also works), fix network/mcp items in policy.json (shell.deny gaps cannot be removed there), or set worker.strictEnforcement to false.";
const GAP_FREE_FOR_CLAUDE =
  '{"version":1,"shell":{"deny":[]},"network":true,"mcp":{"deny":[]},"skills":{"allowScripts":[]}}';
const LEGACY = "legacy ~/.fable/policy.json present — bridge/MCP migrate it on first run";

const AGENT_RE = /for (claude|codex|grok) —/;
/** Agents named by gap warnings, in order of first appearance. */
function agentsOf(lines: readonly string[]): string[] {
  const out: string[] = [];
  for (const l of lines) {
    const m = AGENT_RE.exec(l);
    if (m && !out.includes(m[1]!)) out.push(m[1]!);
  }
  return out;
}

const saved = new Map<string, string | undefined>();
function setEnv(key: string, value: string | undefined): void {
  if (!saved.has(key)) saved.set(key, process.env[key]);
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
function restoreEnv(): void {
  for (const [k, v] of saved) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  saved.clear();
  resetStateHomeDirCache();
  setActiveProfile(null);
}

// ---------------------------------------------------------------------------------------------
// P3-V-L3 — one `enabled` for the same raw bridge file (bridge start ≡ doctor ≡ flags)
// ---------------------------------------------------------------------------------------------

describe("P3-V-L3 — enabled = maxConcurrent ≠ 0 ∧ usable agentArgv (bridge start ≡ doctor ≡ readBridgeWorkerFlags)", () => {
  const port = 32000 + Math.floor(Math.random() * 20000);
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "loom-p4c-enabled-")));
  const cwd = join(dir, "work");
  const script = join(dir, "never.sh");
  const sessionFile = join(dir, "session.json");
  const relay = new RelayServer({ host: "127.0.0.1", port });
  const logs: string[] = [];
  const origError = console.error;
  let tower: RelayClient | null = null;
  let session: FableSession;
  let peerSeq = 0;
  const override = {
    claude: ["/bin/sh", script, "claude"],
    codex: ["/bin/sh", script, "codex"],
    grok: ["/bin/sh", script, "grok"],
  };

  const home = () => loomDir();
  const policyPath = () => join(home(), "policy.json");
  function setPolicy(text: string | null): void {
    mkdirSync(home(), { recursive: true });
    if (text === null) rmSync(policyPath(), { force: true });
    else writeFileSync(policyPath(), text);
  }
  /** The raw bridge config file the bridge (loadBridgeConfig) and the doctor both read. */
  function writeRaw(profile: string, raw: Record<string, unknown>): void {
    mkdirSync(join(home(), "bridge"), { recursive: true });
    writeFileSync(
      join(home(), "bridge", `${bridgeConfigSafeName(profile)}.json`),
      JSON.stringify(raw),
    );
  }
  function rawFile(worker: Record<string, unknown>, agentArgv: unknown): Record<string, unknown> {
    return {
      authorizedDispatchers: ["p_tower"],
      herdrSocketPath: join(dir, "no-herdr.sock"),
      ...(agentArgv === undefined ? {} : { agentArgv }),
      worker: {
        backend: "headless",
        cwd,
        allowedRoots: [dir],
        timeoutMs: 30_000,
        ...worker,
      },
    };
  }
  const bridgeLines = (from: number) =>
    logs
      .slice(from)
      .filter((l) => l.startsWith("[loom-bridge] "))
      .map((l) => l.slice("[loom-bridge] ".length));
  const policyWarnings = (from: number) =>
    bridgeLines(from).filter((l) => l.startsWith("warning: policy "));

  /** Start the bridge on `profile` (config loaded from the raw file), return its gap warnings. */
  async function startWarnings(
    profile: string,
  ): Promise<{ warnings: string[]; error: string | null }> {
    peerSeq += 1;
    const own: FableSession = {
      ...session,
      peerId: `p_node_${peerSeq}`,
      displayName: `node/p4c-${peerSeq}`,
    };
    const from = logs.length;
    try {
      const bridge = await startBridgeRuntime({
        profile,
        session: own,
        submitVerify: { waitMs: 50, retries: 0 },
        headlessAgentCommandOverride: override,
      });
      await bridge.stop();
      return { warnings: policyWarnings(from), error: null };
    } catch (e) {
      return { warnings: policyWarnings(from), error: e instanceof Error ? e.message : String(e) };
    }
  }

  beforeAll(async () => {
    mkdirSync(cwd, { recursive: true });
    writeFileSync(script, "#!/bin/sh\nexit 1\n", { mode: 0o700 });
    setEnv("LOOM_TEST_HOME", dir);
    setEnv("LOOM_SESSION", sessionFile);
    setEnv("LOOM_NO_AUTO_HOST", "1");
    setEnv("LOOM_PROFILE", undefined);
    resetStateHomeDirCache();
    setActiveProfile(null);
    console.error = (...args: unknown[]) => {
      logs.push(args.map((a) => (a instanceof Error ? a.message : String(a))).join(" "));
    };
    relay.start();
    tower = new RelayClient({ url: `ws://127.0.0.1:${port}/ws` });
    const created = await tower.createRoom({
      roomName: "p4c-enabled",
      displayName: "tower",
      agentKind: "shell",
      peerId: "p_tower",
    });
    if (created.type !== "room.state") throw new Error("create failed");
    session = {
      roomId: created.roomId,
      roomName: created.roomName ?? "p4c-enabled",
      inviteCode: created.inviteCode ?? "",
      peerId: "p_node_0",
      displayName: "node/p4c-0",
      color: "#0f0",
      agentKind: "shell",
      relayUrl: `ws://127.0.0.1:${port}/ws`,
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(sessionFile, JSON.stringify(session), "utf8");
  });

  afterAll(() => {
    console.error = origError;
    tower?.close();
    relay.stop();
    restoreEnv();
    rmSync(dir, { recursive: true, force: true });
  });

  const ROWS: ReadonlyArray<
    readonly [name: string, agentArgv: unknown, worker: Record<string, unknown>, enabled: Agent[]]
  > = [
    ["no agentArgv key → default {claude}", undefined, {}, ["claude"]],
    ["agentArgv {claude}", { claude: ["claude"] }, {}, ["claude"]],
    ["agentArgv {claude, codex, grok}", ALL_ARGV, {}, ["claude", "codex", "grok"]],
    [
      "agentArgv.codex [] (dropped by the sanitizer)",
      { claude: ["claude"], codex: [] },
      {},
      ["claude"],
    ],
    ['agentArgv.codex ["sh"] (shell guard)', { claude: ["claude"], codex: ["sh"] }, {}, ["claude"]],
    [
      "agentArgv.codex present + maxConcurrent.codex 0",
      { claude: ["claude"], codex: ["codex"] },
      { maxConcurrent: { codex: 0 } },
      ["claude"],
    ],
    [
      'agentArgv.claude ["bash", …] (shell guard overrides the default) + grok',
      { claude: ["bash", "-c", "x"], grok: ["grok"] },
      {},
      ["grok"],
    ],
    [
      "no claude key (default merged in) + codex · grok, maxConcurrent.claude 0",
      { codex: ["codex"], grok: ["grok"] },
      { maxConcurrent: { claude: 0 } },
      ["codex", "grok"],
    ],
  ];

  for (const [i, [name, agentArgv, worker, enabled]] of ROWS.entries()) {
    test(`same raw file → same enabled: ${name}`, async () => {
      setPolicy(null);
      const profile = `p4c-row-${i}`;
      const raw = rawFile(worker, agentArgv);
      writeRaw(profile, raw);

      const flags = readBridgeWorkerFlags(raw.worker, raw.agentArgv);
      expect(flags.enabled).toEqual(enabled);

      const input = readPolicyDoctorInput(home(), profile);
      expect(input.enabled).toEqual(enabled);

      const started = await startWarnings(profile);
      expect(started.error).toBeNull();
      // Default policy: every enabled agent has ≥ 1 gap, so the warnings name exactly `enabled`.
      expect(agentsOf(started.warnings)).toEqual(enabled);

      // D1 still holds on the new input: doctor gap lines = bridge warnings without `warning: `.
      const s = policySection(input);
      const doctorGapLines = s.lines.filter((l) => l.status === "warn").map((l) => l.message);
      expect(doctorGapLines).toEqual(started.warnings.map((w) => w.slice("warning: ".length)));
    }, 60_000);
  }

  test("the shared helper is exported and pure: enabledHeadlessAgents(maxConcurrent, agentArgv)", () => {
    const f = hostFn<(m: Record<Agent, number>, a: unknown) => Agent[]>("enabledHeadlessAgents");
    const one = { claude: 1, codex: 1, grok: 1 };
    expect(f(one, ALL_ARGV)).toEqual(["claude", "codex", "grok"]);
    expect(f(one, { claude: ["claude"] })).toEqual(["claude"]);
    expect(f(one, { claude: ["claude"], codex: ["x", "sh"] })).toEqual(["claude"]);
    expect(f(one, { claude: ["shell"], grok: ["grok"] })).toEqual(["grok"]);
    expect(f({ claude: 0, codex: 2, grok: 1 }, ALL_ARGV)).toEqual(["codex", "grok"]);
    expect(f(one, {})).toEqual([]);
    const argv = { claude: ["claude"] };
    f(one, argv);
    expect(argv).toEqual({ claude: ["claude"] });
  });

  test("doctor rows: an agent without a usable agentArgv is disabled with that reason; a 0 agent keeps the maxConcurrent reason", () => {
    setPolicy(null);
    const profile = "p4c-rows";
    writeRaw(
      profile,
      rawFile({ maxConcurrent: { grok: 0 } }, { claude: ["claude"], grok: ["grok"] }),
    );
    const msgs = policySection(readPolicyDoctorInput(home(), profile)).lines.map((l) => l.message);
    expect(msgs).toContain(
      `bridge config ${join(home(), "bridge", `${profile}.json`)} (profile ${profile}): backend headless · enabled claude`,
    );
    expect(msgs).toContain("codex: disabled (no usable agentArgv.codex) — not checked");
    expect(msgs).toContain("grok: disabled (worker.maxConcurrent.grok = 0) — not checked");
  });

  test("default headless config (default agentArgv, no policy.json) → only the claude network gap warning · start succeeds", async () => {
    setPolicy(null);
    const profile = "p4c-default";
    writeRaw(profile, rawFile({}, undefined));
    const started = await startWarnings(profile);
    expect(started.error).toBeNull();
    expect(started.warnings).toEqual([CLAUDE_NETWORK_WARNING]);
    const s = policySection(readPolicyDoctorInput(home(), profile));
    expect(s.lines.filter((l) => l.status === "warn").map((l) => l.message)).toEqual([
      CLAUDE_NETWORK_WARNING.slice("warning: ".length),
    ]);
  }, 60_000);

  test("strict + network:true + default agentArgv → start succeeds with zero policy warnings", async () => {
    setPolicy(GAP_FREE_FOR_CLAUDE);
    try {
      const profile = "p4c-strict-pass";
      writeRaw(profile, rawFile({ strictEnforcement: true }, undefined));
      const started = await startWarnings(profile);
      expect(started.error).toBeNull();
      expect(started.warnings).toEqual([]);
    } finally {
      setPolicy(null);
    }
  }, 60_000);

  test("strict + default policy + default agentArgv → refusal verbatim with the P4c tail (1 gap)", async () => {
    setPolicy(null);
    const profile = "p4c-strict-refuse";
    writeRaw(profile, rawFile({ strictEnforcement: true }, undefined));
    const started = await startWarnings(profile);
    expect(started.error).toBe(
      "worker.strictEnforcement: refusing to start — 1 policy gap(s) for enabled agents:\n" +
        `${CLAUDE_NETWORK_WARNING}\n${NEW_TAIL}`,
    );
    expect(started.warnings).toEqual([]);
  }, 60_000);
});

// ---------------------------------------------------------------------------------------------
// P3-V-L1 · P3-V-L2 — doctor legacy row / worker-flag view parity with `memory list`
// ---------------------------------------------------------------------------------------------

describe("P3-V-L1 · P3-V-L2 — doctor legacy row and worker-flag view", () => {
  const PROFILE = "work";
  let root: string;
  let home: string;

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), "loom-p4c-doctor-")));
    home = join(root, ".loom");
    setEnv("LOOM_TEST_HOME", root);
    setEnv("LOOM_SESSION", join(root, "no-session.json"));
    setEnv("LOOM_PROFILE", undefined);
    resetStateHomeDirCache();
    setActiveProfile(PROFILE);
  });

  afterEach(() => {
    restoreEnv();
    rmSync(root, { recursive: true, force: true });
  });

  function writeLegacyPolicy(): void {
    mkdirSync(join(root, ".fable"), { recursive: true });
    writeFileSync(join(root, ".fable", "policy.json"), GAP_FREE_FOR_CLAUDE);
  }
  function writePolicy(text: string): void {
    mkdirSync(home, { recursive: true });
    writeFileSync(join(home, "policy.json"), text);
  }
  function writeBridge(raw: Record<string, unknown>): void {
    mkdirSync(join(home, "bridge"), { recursive: true });
    writeFileSync(
      join(home, "bridge", `${bridgeConfigSafeName(PROFILE)}.json`),
      JSON.stringify(raw),
    );
  }
  const headless = (extra: Record<string, unknown> = {}) => ({
    backend: "headless",
    cwd: root,
    allowedRoots: [root],
    ...extra,
  });

  test("L1: only <root>/.fable/policy.json (no <root>/.loom) → legacy row (migration pending)", () => {
    writeLegacyPolicy();
    expect(existsSync(home)).toBe(false);
    const msgs = policySection(readPolicyDoctorInput(home, PROFILE)).lines.map((l) => l.message);
    expect(msgs).toContain(LEGACY);
  });

  test("L1: <root>/.fable/policy.json and <root>/.loom both exist → no legacy row (nothing migrates)", () => {
    writeLegacyPolicy();
    mkdirSync(home, { recursive: true });
    const msgs = policySection(readPolicyDoctorInput(home, PROFILE)).lines.map((l) => l.message);
    expect(msgs).not.toContain(LEGACY);
  });

  test("L1: both exist + invalid policy.json → the fail row alone", () => {
    writeLegacyPolicy();
    writePolicy("not json");
    const s = policySection(readPolicyDoctorInput(home, PROFILE));
    expect(s.lines.map((l) => l.status)).toEqual(["fail"]);
  });

  /** `memory list`'s value for this profile — the real CLI deps (loomDir() = home here). */
  function memoryListValue(): unknown {
    const deps = realMemoryCliDeps({});
    expect(deps.profile).toBe(PROFILE);
    return deps.memoryEnabled!();
  }

  const CONFLICT_POLICY =
    '{"version":1,"shell":{"deny":[],"allow":["git status *"]},"network":true,"mcp":{"deny":[]},"skills":{"allowScripts":[]}}';
  const claudeAllow = {
    permissions: { claude: { permissionMode: "acceptEdits", allowedTools: ["Bash(ls *)"] } },
  };

  for (const [name, setup, expected] of [
    ["no bridge config", () => {}, "no bridge config"],
    [
      "headless memory on (valid)",
      () => writeBridge({ worker: headless({ memory: { enabled: true } }) }),
      true,
    ],
    [
      "headless + parser-invalid section",
      () => writeBridge({ worker: headless({ rules: "on" }) }),
      "invalid bridge config",
    ],
    [
      "headless + invalid policy.json",
      () => {
        writePolicy('{"version":2}');
        writeBridge({ worker: headless({ memory: { enabled: true } }) });
      },
      "invalid bridge config",
    ],
    [
      "headless + deprecated allow list vs policy.json shell.allow",
      () => {
        writePolicy(CONFLICT_POLICY);
        writeBridge({ worker: headless({ memory: { enabled: true }, ...claudeAllow }) });
      },
      "invalid bridge config",
    ],
    [
      "pane + invalid policy.json (pane never loads the policy)",
      () => {
        writePolicy('{"version":2}');
        writeBridge({ worker: { backend: "pane", memory: { enabled: true } } });
      },
      false,
    ],
  ] as const) {
    test(`L2: doctor flag view === memory list value — ${name}`, () => {
      setup();
      const listed = memoryListValue();
      expect(listed).toEqual(expected);
      const view = readPolicyDoctorInput(home, PROFILE).worker as {
        memory: unknown;
        rules: unknown;
      };
      expect(view.memory).toEqual(listed);
      if (listed === "invalid bridge config" || listed === "no bridge config") {
        expect(view.rules).toEqual(listed);
      }
    });
  }

  test("L2: when the Policy section shows bridge config invalid, the flag view is invalid", () => {
    writePolicy(CONFLICT_POLICY);
    writeBridge({ worker: headless({ rules: { enabled: true }, ...claudeAllow }) });
    const input = readPolicyDoctorInput(home, PROFILE);
    const s = policySection(input);
    expect(
      s.lines.some((l) => l.status === "warn" && l.message.startsWith("bridge config invalid: ")),
    ).toBe(true);
    expect(input.worker).toEqual({
      profile: PROFILE,
      memory: "invalid bridge config",
      rules: "invalid bridge config",
    });
    expect(() => loadPolicy(home)).not.toThrow();
  });
});
