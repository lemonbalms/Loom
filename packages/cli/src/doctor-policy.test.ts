/**
 * PLAN 0.37.0 P3 — `loom doctor` Policy section (D6 · ③ rows · C3 → R14) and the worker flag
 * lines in the Bridge / Memory sections (D6 · R15).
 *
 * Policy = `loadPolicy(<home>)` (home = the doctor's read-only `<LOOM_TEST_HOME|HOME>/.loom`,
 * never `loomDir()`), bridge config = `<home>/bridge/<safe>.json` raw → `readBridgeWorkerFlags`,
 * effective = `resolveWorkerPolicy(flags.permissions, policy, {policyPath})`, gaps =
 * `policyGaps(effective, flags.enabled)` — the bridge's function on the bridge's input. D1 cross:
 * the doctor gap lines are the bridge warning lines without `warning: `, and carry the same
 * (agent, item, level) text as the worker notice lines.
 *
 * In-process: `readPolicyDoctorInput(home, profile)` + `policySection(input)` from ./doctor (looked
 * up at call time so each case fails on its own in the red phase). One spawn of the real CLI per
 * case under a temp LOOM_TEST_HOME with spy launchctl/systemctl/loginctl on PATH (nothing real is
 * queried). Run this file with HOME and LOOM_TEST_HOME pointing at a temp dir (R21).
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  bridgeConfigSafeName,
  enabledAgentsOf,
  type Gap,
  gapLabel,
  loadBridgeConfig,
  loadPolicy,
  policyGaps,
  readBridgeWorkerFlags,
  renderGapLine,
  renderGapWarning,
  renderPolicyNotice,
  resetStateHomeDirCache,
  resolveWorkerPolicy,
  setActiveProfile,
  workerConfigFromBridge,
} from "@loom/host";
import * as doctor from "./doctor";
import type { BridgeReadInput, DoctorLine, DoctorSection } from "./doctor";
import { readMemoryDoctorInput } from "./memory-cli";

type Fn = (...args: never[]) => unknown;
/** Call-time lookup: a missing export fails the case, not the file (red phase). */
function fn<T extends Fn>(name: string): T {
  const f = (doctor as unknown as Record<string, unknown>)[name];
  if (typeof f !== "function") throw new Error(`./doctor does not export ${name}`);
  return f as T;
}
type Input = Record<string, unknown>;
const readPolicyDoctorInput = (home: string, profile: string): Input =>
  fn<(h: string, p: string) => Input>("readPolicyDoctorInput")(home, profile);
const policySection = (input: Input): DoctorSection =>
  fn<(i: Input) => DoctorSection>("policySection")(input);

const PROFILE = "work";
const AGENTS = ["claude", "codex", "grok"] as const;
const ROW = {
  claude: "claude: shell.deny enforced · network advisory · mcp.deny hidden · mcp.isolate enforced",
  codex:
    "codex: shell.deny not-enforced · network enforced · mcp.deny not-applicable · mcp.isolate not-isolatable",
  grok: "grok: shell.deny best-effort · network advisory · mcp.deny text · mcp.isolate not-isolatable",
} as const;
const disabledRow = (a: string) => `${a}: disabled (worker.maxConcurrent.${a} = 0) — not checked`;
const LEGACY = "legacy ~/.fable/policy.json present — bridge/MCP migrate it on first run";
const PANE_LINE = "backend is pane — the policy notice and warnings apply to headless workers only";
const NO_GAPS = "no policy gaps for enabled agents";
const GAP_FREE =
  '{"version":1,"shell":{"deny":[]},"network":true,"mcp":{"deny":[]},"skills":{"allowScripts":[]}}';
/** ③ codex default gap line (= D5 warning without `warning: `). */
const CODEX_LINE =
  "policy shell.deny (11 rules) is not-enforced for codex — the worker is told in its prompt; nothing blocks it";

const info = (message: string): DoctorLine => ({ status: "info", message });
const warn = (message: string): DoctorLine => ({ status: "warn", message });

let root: string;
let home: string;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "loom-p3-docpolicy-")));
  home = join(root, ".loom");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const policyPath = () => join(home, "policy.json");
const bridgePath = (profile = PROFILE) =>
  join(home, "bridge", `${bridgeConfigSafeName(profile)}.json`);
function writePolicy(text: string): void {
  mkdirSync(home, { recursive: true });
  writeFileSync(policyPath(), text);
}
function writeBridge(worker: unknown, profile = PROFILE): void {
  mkdirSync(join(home, "bridge"), { recursive: true });
  writeFileSync(bridgePath(profile), JSON.stringify({ worker }));
}
const headless = (extra: Record<string, unknown> = {}) => ({
  backend: "headless",
  cwd: root,
  allowedRoots: [root],
  ...extra,
});
const defaultPermissions = () => readBridgeWorkerFlags(undefined).permissions;
function hashFor(permissions = defaultPermissions()): string {
  return resolveWorkerPolicy(permissions, loadPolicy(home), { policyPath: policyPath() }).hash;
}
function gapsFor(enabled: readonly (typeof AGENTS)[number][], permissions = defaultPermissions()) {
  return policyGaps(
    resolveWorkerPolicy(permissions, loadPolicy(home), { policyPath: policyPath() }).effective,
    enabled,
  );
}
function messageOf(f: () => unknown): string {
  try {
    f();
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  return "";
}
function tree(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string, rel: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      out.push(r);
      if (e.isDirectory()) walk(join(d, e.name), r);
    }
  };
  if (existsSync(dir)) walk(dir, "");
  return out.sort();
}

describe("policySection — ③ rows (D6)", () => {
  test("title Policy · no policy.json, no bridge config → defaults, all agents, 6 gap warns, strict false", () => {
    const s = policySection(readPolicyDoctorInput(home, PROFILE));
    expect(s.title).toBe("Policy");
    const gaps = gapsFor(AGENTS);
    expect(gaps).toHaveLength(6);
    expect(s.lines).toEqual([
      info(`policy: built-in defaults (no ${policyPath()})`),
      info(`worker policy hash ${hashFor()} (fingerprint input)`),
      info(`no bridge config for profile ${PROFILE} — all agents assumed enabled`),
      info(ROW.claude),
      info(ROW.codex),
      info(ROW.grok),
      ...gaps.map((g) => warn(renderGapLine(g))),
      info(`worker.strictEnforcement = false (profile ${PROFILE})`),
    ]);
    expect(s.lines.map((l) => l.message)).toContain(CODEX_LINE);
    expect(hashFor()).toMatch(/^[0-9a-f]{64}$/);
    // gap warns never change the exit code
    expect(doctor.doctorExitCode([s])).toBe(0);
  });

  test("user policy.json → source row names the file · gaps follow the file (network true, isolate false)", () => {
    writePolicy(
      '{"version":1,"shell":{"deny":[]},"network":true,"mcp":{"deny":[],"isolate":false},"skills":{"allowScripts":[]}}',
    );
    const s = policySection(readPolicyDoctorInput(home, PROFILE));
    const gaps = gapsFor(AGENTS);
    expect(gaps.map((g) => `${g.agent}/${g.item}`)).toEqual([
      "codex/shell.deny",
      "grok/shell.deny",
    ]);
    expect(s.lines).toEqual([
      info(`policy: ${policyPath()}`),
      info(`worker policy hash ${hashFor()} (fingerprint input)`),
      info(`no bridge config for profile ${PROFILE} — all agents assumed enabled`),
      info(ROW.claude),
      info(ROW.codex),
      info(ROW.grok),
      ...gaps.map((g) => warn(renderGapLine(g))),
      info(`worker.strictEnforcement = false (profile ${PROFILE})`),
    ]);
  });

  test("invalid policy.json → one fail row (loader message), every other row omitted, exit 1", () => {
    writePolicy('{"version":2}');
    const msg = messageOf(() => loadPolicy(home));
    expect(msg).not.toBe("");
    const s = policySection(readPolicyDoctorInput(home, PROFILE));
    expect(s.lines).toEqual([
      {
        status: "fail",
        message: `policy.json invalid: ${msg} — every Loom MCP call is refused and a headless bridge refuses to start`,
      },
    ]);
    expect(doctor.doctorExitCode([s])).toBe(1);
  });

  test("headless bridge config: enabled list · disabled agent row · its gaps left out · strict true + gaps → refuses suffix", () => {
    writeBridge(headless({ maxConcurrent: { codex: 0 }, strictEnforcement: true }));
    const s = policySection(readPolicyDoctorInput(home, PROFILE));
    const gaps = gapsFor(["claude", "grok"]);
    expect(gaps).toHaveLength(4);
    expect(s.lines).toEqual([
      info(`policy: built-in defaults (no ${policyPath()})`),
      info(`worker policy hash ${hashFor()} (fingerprint input)`),
      info(
        `bridge config ${bridgePath()} (profile ${PROFILE}): backend headless · enabled claude, grok`,
      ),
      info(ROW.claude),
      info(disabledRow("codex")),
      info(ROW.grok),
      ...gaps.map((g) => warn(renderGapLine(g))),
      info(
        `worker.strictEnforcement = true (profile ${PROFILE}) — the bridge refuses to start (4 gaps)`,
      ),
    ]);
  });

  test("strict true + no gaps (network true · codex/grok off) → ok no-gap row, strict row without suffix", () => {
    writePolicy(GAP_FREE);
    writeBridge(headless({ maxConcurrent: { codex: 0, grok: 0 }, strictEnforcement: true }));
    const s = policySection(readPolicyDoctorInput(home, PROFILE));
    expect(s.lines).toEqual([
      info(`policy: ${policyPath()}`),
      info(`worker policy hash ${hashFor()} (fingerprint input)`),
      info(`bridge config ${bridgePath()} (profile ${PROFILE}): backend headless · enabled claude`),
      info(ROW.claude),
      info(disabledRow("codex")),
      info(disabledRow("grok")),
      { status: "ok", message: NO_GAPS },
      info(`worker.strictEnforcement = true (profile ${PROFILE})`),
    ]);
  });

  test("pane bridge config → backend pane row + pane note · no headless agents enabled → no gaps · strict ignored", () => {
    writeBridge({ backend: "pane", strictEnforcement: true });
    const s = policySection(readPolicyDoctorInput(home, PROFILE));
    expect(s.lines).toEqual([
      info(`policy: built-in defaults (no ${policyPath()})`),
      info(`worker policy hash ${hashFor()} (fingerprint input)`),
      info(`bridge config ${bridgePath()} (profile ${PROFILE}): backend pane · enabled none`),
      info(PANE_LINE),
      info(ROW.claude),
      info(ROW.codex),
      info(ROW.grok),
      { status: "ok", message: NO_GAPS },
      info(`worker.strictEnforcement = false (profile ${PROFILE})`),
    ]);
  });

  for (const [name, mk] of [
    ["bad strictEnforcement", () => headless({ strictEnforcement: "yes" })],
    ["relative cwd (a parser only the bridge ran before P1-V-L1)", () => headless({ cwd: "rel" })],
    ["agentBin basename", () => headless({ agentBin: { codex: "/bin/sh" } })],
  ] as const) {
    test(`invalid bridge config (${name}) → warn with the parser message, all agents shown`, () => {
      const worker = mk();
      writeBridge(worker);
      const msg = messageOf(() => readBridgeWorkerFlags(worker));
      expect(msg).not.toBe("");
      const s = policySection(readPolicyDoctorInput(home, PROFILE));
      const gaps = gapsFor(AGENTS);
      expect(s.lines).toEqual([
        info(`policy: built-in defaults (no ${policyPath()})`),
        info(`worker policy hash ${hashFor()} (fingerprint input)`),
        warn(
          `bridge config invalid: ${msg} — the headless bridge refuses to start; showing all agents`,
        ),
        info(ROW.claude),
        info(ROW.codex),
        info(ROW.grok),
        ...gaps.map((g) => warn(renderGapLine(g))),
        info(`worker.strictEnforcement = false (profile ${PROFILE})`),
      ]);
    });
  }

  test("bridge permissions feed the effective policy (deprecated grok deny → 12 rules) and the hash", () => {
    const permissions = {
      grok: { permissionMode: "acceptEdits", deny: ["Bash(terraform apply *)"] },
    };
    writeBridge(headless({ permissions }));
    const flagsPerm = readBridgeWorkerFlags(headless({ permissions })).permissions;
    const s = policySection(readPolicyDoctorInput(home, PROFILE));
    const msgs = s.lines.map((l) => l.message);
    expect(msgs).toContain(`worker policy hash ${hashFor(flagsPerm)} (fingerprint input)`);
    expect(hashFor(flagsPerm)).not.toBe(hashFor());
    expect(
      msgs.some((m) => m.startsWith("policy shell.deny (12 rules) is best-effort for grok")),
    ).toBe(true);
    expect(
      msgs.some((m) => m.startsWith("policy shell.deny (11 rules) is not-enforced for codex")),
    ).toBe(true);
  });

  test("the bridge's profile file is the one read (bridgeConfigSafeName) — another profile's config is ignored", () => {
    writeBridge(headless({ maxConcurrent: { claude: 0 } }), "other");
    const s = policySection(readPolicyDoctorInput(home, PROFILE));
    expect(s.lines.map((l) => l.message)).toContain(
      `no bridge config for profile ${PROFILE} — all agents assumed enabled`,
    );
  });
});

describe("legacy ~/.fable and the read-only home (C3 → R14)", () => {
  test("only <root>/.fable/policy.json → built-in defaults + legacy info row · nothing renamed or created", () => {
    mkdirSync(join(root, ".fable"), { recursive: true });
    writeFileSync(join(root, ".fable", "policy.json"), GAP_FREE);
    writeFileSync(join(root, ".fable", "session.json"), "{}");
    const before = tree(root);
    const s = policySection(readPolicyDoctorInput(home, PROFILE));
    expect(s.lines.slice(0, 2)).toEqual([
      info(`policy: built-in defaults (no ${policyPath()})`),
      info(LEGACY),
    ]);
    expect(tree(root)).toEqual(before);
    expect(existsSync(home)).toBe(false);
    expect(existsSync(join(root, ".fable", "policy.json"))).toBe(true);
  });

  test("no legacy file → no legacy row", () => {
    const s = policySection(readPolicyDoctorInput(home, PROFILE));
    expect(s.lines.map((l) => l.message)).not.toContain(LEGACY);
  });

  test("invalid policy keeps the legacy row with the fail row", () => {
    writePolicy("not json");
    mkdirSync(join(root, ".fable"), { recursive: true });
    writeFileSync(join(root, ".fable", "policy.json"), GAP_FREE);
    const s = policySection(readPolicyDoctorInput(home, PROFILE));
    expect(s.lines.map((l) => l.status)).toEqual(["fail", "info"]);
    expect(s.lines[1]).toEqual(info(LEGACY));
  });

  test("readPolicyDoctorInput writes nothing under an existing home either", () => {
    writePolicy(GAP_FREE);
    writeBridge(headless({ rules: { enabled: true } }));
    const before = tree(root);
    readPolicyDoctorInput(home, PROFILE);
    expect(tree(root)).toEqual(before);
  });
});

describe("D1 cross — doctor gap line ≡ bridge warning ≡ worker notice (agent, item, level)", () => {
  const saved = new Map<string, string | undefined>();
  function setEnv(key: string, value: string | undefined): void {
    if (!saved.has(key)) saved.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  afterEach(() => {
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    saved.clear();
    resetStateHomeDirCache();
    setActiveProfile(null);
  });

  const LABEL_RE =
    /policy (shell\.deny|network|mcp\.deny|mcp\.isolate) \([^)]*\) is ([a-z-]+) for (claude|codex|grok)/;
  const triple = (line: string): string => {
    const m = LABEL_RE.exec(line);
    if (!m) throw new Error(`no gap label in: ${line}`);
    return `${m[3]}|${m[1]}|${m[2]}`;
  };

  for (const [name, policy, mk] of [
    ["default policy, all agents", null, () => headless()],
    [
      "deprecated grok deny + claude off",
      null,
      () =>
        headless({
          maxConcurrent: { claude: 0 },
          permissions: {
            grok: { permissionMode: "acceptEdits", deny: ["Bash(terraform apply *)"] },
          },
        }),
    ],
    [
      "user policy with mcp.deny names",
      '{"version":1,"shell":{"deny":["make deploy *"]},"network":false,"mcp":{"deny":["github__create_issue"]},"skills":{"allowScripts":[]}}',
      () => headless(),
    ],
  ] as const) {
    test(`same fixture: ${name}`, () => {
      if (policy !== null) writePolicy(policy);
      writeBridge(mk());
      // The bridge path: loadBridgeConfig (loomDir() = this home) → workerConfigFromBridge →
      // policyGaps(effective, enabledAgentsOf(maxConcurrent)) → renderGapWarning.
      setEnv("LOOM_TEST_HOME", root);
      setEnv("LOOM_PROFILE", undefined);
      resetStateHomeDirCache();
      setActiveProfile(null);
      const cfg = loadBridgeConfig(PROFILE);
      const config = workerConfigFromBridge(cfg);
      const bridgeGaps: Gap[] = policyGaps(
        config.policy!.effective,
        enabledAgentsOf(config.maxConcurrent),
      );
      expect(bridgeGaps.length).toBeGreaterThan(0);
      const warnings = bridgeGaps.map(renderGapWarning);

      const s = policySection(readPolicyDoctorInput(home, PROFILE));
      const doctorGapLines = s.lines.filter((l) => l.status === "warn").map((l) => l.message);
      // doctor line = bridge warning without `warning: ` (D1 · ③)
      expect(doctorGapLines).toEqual(warnings.map((w) => w.slice("warning: ".length)));

      // worker notice lines (the same Gap[] per agent) carry the same (agent, item, level)
      const noticeLines: string[] = [];
      for (const agent of AGENTS) {
        const own = bridgeGaps.filter((g) => g.agent === agent);
        if (own.length === 0) continue;
        noticeLines.push(
          ...renderPolicyNotice(own)
            .split("\n")
            .filter((l) => l.startsWith("- policy ")),
        );
      }
      expect(noticeLines.map(triple)).toEqual(doctorGapLines.map(triple));
      expect(warnings.map(triple)).toEqual(doctorGapLines.map(triple));
      for (const [i, g] of bridgeGaps.entries()) {
        expect(doctorGapLines[i]).toContain(gapLabel(g));
        expect(noticeLines[i]).toContain(gapLabel(g));
      }
    });
  }
});

describe("Bridge / Memory sections — worker flag line (D6 · R15 · optional input)", () => {
  const flagLine = (memory: unknown, rules: unknown, profile = PROFILE) =>
    info(
      `worker.memory.enabled = ${memory} · worker.rules.enabled = ${rules} (profile ${profile})`,
    );
  const bridgeBase = (status: BridgeReadInput["status"]): BridgeReadInput => ({
    statusPath: join(home, "bridge", "work.status.json"),
    lockPath: join(home, "bridge", "work.lock"),
    logPath: join(home, "bridge", "work.log"),
    status,
    pidAlive: false,
    lock: { kind: "none" },
    nowMs: Date.parse("2026-10-17T00:00:00.000Z"),
  });
  const viewOf = (input: Input) => input.worker as Record<string, unknown>;

  for (const [name, setup, memory, rules] of [
    ["no bridge config", () => {}, "no bridge config", "no bridge config"],
    [
      "invalid bridge config",
      () => writeBridge(headless({ rules: "on" })),
      "invalid bridge config",
      "invalid bridge config",
    ],
    [
      "headless memory on · rules off",
      () => writeBridge(headless({ memory: { enabled: true }, rules: { enabled: false } })),
      true,
      false,
    ],
    ["headless rules on", () => writeBridge(headless({ rules: { enabled: true } })), false, true],
    ["pane", () => writeBridge({ backend: "pane", memory: { enabled: true } }), false, false],
  ] as const) {
    test(`view = ${name} → last line of Bridge (both branches) and Memory`, () => {
      setup();
      const view = viewOf(readPolicyDoctorInput(home, PROFILE));
      expect(view).toEqual({ profile: PROFILE, memory, rules });
      const expected = flagLine(memory, rules);
      for (const status of [null, { state: "stopped", stoppedAt: "2026-10-16T23:59:00.000Z" }]) {
        const plain = doctor.bridgeSection(bridgeBase(status));
        const withView = doctor.bridgeSection({
          ...bridgeBase(status),
          worker: view,
        } as unknown as BridgeReadInput);
        expect(withView.lines).toEqual([...plain.lines, expected]);
      }
      const mem = readMemoryDoctorInput(home);
      const plainMem = doctor.memorySection(mem);
      const withMem = doctor.memorySection({ ...mem, worker: view } as typeof mem);
      expect(withMem.lines).toEqual([...plainMem.lines, expected]);
    });
  }
});

// ---------------------------------------------------------------------------------------------
// The real CLI — spy service managers on PATH, temp LOOM_TEST_HOME (nothing real is read/queried)
// ---------------------------------------------------------------------------------------------

const CLI = join(import.meta.dir, "index.ts");

function spyBin(): { dir: string; marker: string } {
  const dir = mkdtempSync(join(tmpdir(), "loom-docpolicy-bin-"));
  const marker = join(dir, "SPAWNED");
  for (const n of ["launchctl", "systemctl", "loginctl"]) {
    writeFileSync(join(dir, n), `#!/bin/sh\necho "$0 $*" >> "${marker}"\nexit 0\n`);
    chmodSync(join(dir, n), 0o755);
  }
  return { dir, marker };
}

function runDoctor(): { status: number | null; stdout: string; marker: string } {
  const spy = spyBin();
  try {
    const env: Record<string, string | undefined> = {
      ...process.env,
      // HOME stays the test process's temp HOME (bun keeps its cache there); the doctor home is
      // LOOM_TEST_HOME.
      LOOM_TEST_HOME: root,
      PATH: `${spy.dir}:${process.env.PATH}`,
    };
    delete env.LOOM_SESSION;
    delete env.LOOM_RELAY_TOKEN;
    delete env.LOOM_RELAY_URL;
    env.LOOM_PROFILE = PROFILE;
    const r = spawnSync(process.execPath, [CLI, "doctor"], {
      env: env as Record<string, string>,
      encoding: "utf8",
      timeout: 60_000,
    });
    return { status: r.status, stdout: r.stdout, marker: existsSync(spy.marker) ? "spawned" : "" };
  } finally {
    rmSync(spy.dir, { recursive: true, force: true });
  }
}

describe("CLI `loom doctor` — Policy is the last section", () => {
  test("default home → Policy last · 6 gap warns rendered · exit 0 · nothing created · no service manager", () => {
    const before = tree(root);
    const r = runDoctor();
    const sections = r.stdout.split("\n\n");
    const policy = sections.find((b) => b.startsWith("Policy\n"));
    expect(policy).toBeDefined();
    // Policy is the last section before the summary line
    expect(sections[sections.length - 2]!.startsWith("Policy\n")).toBe(true);
    expect(policy!.split("\n").filter((l) => /^ {2}warn /.test(l))).toHaveLength(6);
    expect(policy).toContain(`  warn ${CODEX_LINE}`);
    expect(r.status).toBe(0);
    expect(r.marker).toBe("");
    expect(tree(root)).toEqual(before);
  }, 90_000);

  test("invalid policy.json → fail row · exit 1 (new behaviour, ③)", () => {
    writePolicy('{"version":1,"bogus":true}');
    const r = runDoctor();
    expect(r.stdout).toMatch(
      /^ {2}fail policy\.json invalid: .* — every Loom MCP call is refused and a headless bridge refuses to start$/m,
    );
    expect(r.status).toBe(1);
  }, 90_000);

  test("headless bridge config → Bridge and Memory sections end with the worker flag line", () => {
    writeBridge(headless({ memory: { enabled: true } }));
    const r = runDoctor();
    const line = `  info worker.memory.enabled = true · worker.rules.enabled = false (profile ${PROFILE})`;
    const block = (title: string) =>
      r.stdout.split("\n\n").find((b) => b.startsWith(`${title}\n`)) ?? "";
    expect(block("Bridge").split("\n").at(-1)).toBe(line);
    expect(block("Memory").split("\n").at(-1)).toBe(line);
  }, 90_000);
});
