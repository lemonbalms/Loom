/**
 * Bridge-local config under loomDir()/bridge/ (M-14 — never hardcode ~/.loom).
 * M-1: authorizedDispatchers allowlist (default deny when empty/missing).
 */
import { existsSync, mkdirSync, chmodSync, writeFileSync, readFileSync } from "node:fs";
import { basename, isAbsolute, join } from "node:path";
import { loomDir, ensureFableDir } from "./session-store";
import { DEFAULT_HERDR_SOCKET, HERDR_PROTOCOL_EXPECTED } from "./herdr-client";
import type { DispatchAgentKind } from "@loom/protocol";
import {
  defaultWorkerPermissions,
  validateWorkerConfig,
  type AgentKind,
  type ClaudePermissionProfile,
  type CodexPermissionProfile,
  type GrokPermissionProfile,
  type WorkerConfig,
  type WorkerPermissions,
} from "./agent-argv";
import { loadPolicy } from "./policy";
import { resolveWorkerPolicy } from "./policy-compile";
import { enabledAgentsOf } from "./policy-gaps";

export type BridgeConfig = {
  /** M-1: tower peer ids allowed to dispatch. Empty ⇒ default deny. */
  authorizedDispatchers: string[];
  herdrSocketPath: string;
  /** Local argv map — wire never carries argv. shell permanently excluded. */
  agentArgv: Partial<Record<DispatchAgentKind, string[]>>;
  /**
   * Expected herdr protocol. Default is `HERDR_PROTOCOL_EXPECTED` (17).
   * Config-only bump without the protocol-17 spawn/inject adapter is not a
   * supported cutover (COMPAT §5-2).
   */
  herdrProtocol?: number;
  /**
   * PLAN 0.23.8 / 0.28.0: worker pane cleanup policy.
   * `"auto"` (default) = best-effort pane.close on **explicit conv close** only.
   * `"keep"` = disable that conv auto-close.
   * Card worker panes are always preserved (PANE-DEATH U3) — this flag never
   * controls card panes; only explicit conv close is gated. Load sanitizes
   * unknown values to `"auto"`.
   */
  paneCleanup?: "auto" | "keep";
  /**
   * PLAN 0.23.9 / 0.28.1: worker pane placement policy (public shape unchanged).
   * `"pool"` (default) = bridge-local worker-pool tab via protocol-17
   * `tab.create` / `pane.split` (cwd+env on the shell pane) then named
   * `agent.start{name,kind,pane_id,args?}`.
   * `"legacy"` = protocol-17 unhinted pane-first form (`pane.split` direction
   * right without invented target, then named start) — no protocol-16 fields.
   * Load sanitizes unknown values to `"pool"`.
   */
  panePlacement?: "pool" | "legacy";
  /**
   * PLAN 0.23.9: optional herdr workspace_id for pool tab.create.
   * Empty/missing → omit workspace_id (herdr default).
   */
  paneWorkspaceId?: string;
  /**
   * PLAN 0.26.0: claude hooks auxiliary sensor (opt-in, default off).
   * When true, bridge injects `--settings` hooks on claude spawn and listens
   * on attempt-scoped loomDir sockets for completion hints only.
   * Load sanitizes non-true values to false (fail-closed opt-in).
   */
  hookSensor?: boolean;
  /**
   * PLAN 0.30.0 P6a. Absent or `backend: "pane"` keeps the pane path.
   * `backend: "headless"` is fail-closed: invalid keys throw from
   * loadBridgeConfig (not swallowed into defaults).
   */
  worker?: BridgeWorkerConfig;
};

/** Bridge-local headless worker section. Pane ignores every key but backend. */
export type BridgeWorkerConfig = {
  backend: "pane" | "headless";
  /** Required when backend is headless. Absolute path. */
  cwd?: string;
  /** Required non-empty absolute paths when backend is headless. */
  allowedRoots?: string[];
  maxConcurrent?: Partial<Record<AgentKind, number>>;
  timeoutMs?: number;
  permissions?: WorkerPermissions;
  /**
   * One executable path per agent. `basename` of that path (no realpath)
   * must equal the agent kind. Arguments, shells, and other names are rejected.
   */
  agentBin?: Partial<Record<AgentKind, string>>;
  /**
   * PLAN 0.31.0 D1. `{enabled: boolean}` only; absent = disabled (0.30.0 behavior).
   * Selection itself lives in the room's skills.json, never here or on the wire.
   */
  skills?: { enabled: boolean };
  /**
   * PLAN 0.36.0 D5 · R1. `{enabled: boolean}` only; absent = off (0.35 bytes). Read once at
   * bridge start and handed to `HeadlessDeps.memory` — never part of WorkerConfig.
   */
  memory?: { enabled: boolean };
  /**
   * PLAN 0.37.0 D4(a). Absent = false. True → a headless bridge refuses to start while any
   * enabled agent has a policy gap. Never part of WorkerConfig or policy.json.
   */
  strictEnforcement?: boolean;
  /**
   * PLAN 0.37.0 D3. `{enabled: boolean}` only; absent = off. Standing rules go into the
   * first-turn fence when true — handed to `HeadlessDeps.rules`, never part of WorkerConfig.
   */
  rules?: { enabled: boolean };
};

/** PLAN 0.37.0 ② doctor용 — worker flags read without loomDir() / loadPolicy (R14). */
export type BridgeWorkerFlags = {
  backend: "pane" | "headless";
  enabled: AgentKind[];
  strictEnforcement: boolean;
  memoryEnabled: boolean;
  rulesEnabled: boolean;
  permissions: WorkerPermissions;
};

const HEADLESS_AGENTS: readonly AgentKind[] = ["claude", "codex", "grok"];
const DEFAULT_TIMEOUT_MS = 7_200_000;
const DEFAULT_AGENT_BIN: Record<AgentKind, string> = {
  claude: "claude",
  codex: "codex",
  grok: "grok",
};

const DEFAULT_AGENT_ARGV: BridgeConfig["agentArgv"] = {
  claude: ["claude"],
};

export function bridgeConfigDir(): string {
  return join(loomDir(), "bridge");
}

/**
 * The config-file name sanitizer (out-of-range chars → `_`, empty → `default`). Extracted for
 * PLAN 0.34.0 D8 so `loom service` can compare it with the lock/log `sanitizeProfileLogName`.
 */
export function bridgeConfigSafeName(profile: string): string {
  return profile.replace(/[^a-zA-Z0-9._-]/g, "_") || "default";
}

export function bridgeConfigPath(profile: string): string {
  return join(bridgeConfigDir(), `${bridgeConfigSafeName(profile)}.json`);
}

export function defaultBridgeConfig(): BridgeConfig {
  return {
    authorizedDispatchers: [],
    herdrSocketPath: process.env.LOOM_HERDR_SOCKET?.trim() || DEFAULT_HERDR_SOCKET,
    agentArgv: { ...DEFAULT_AGENT_ARGV },
    herdrProtocol: HERDR_PROTOCOL_EXPECTED,
    paneCleanup: "auto",
    panePlacement: "pool",
    hookSensor: false,
  };
}

/** PLAN 0.23.8: sanitize paneCleanup — only "auto"|"keep"; else default. */
function sanitizePaneCleanup(raw: unknown): "auto" | "keep" {
  return raw === "keep" ? "keep" : "auto";
}

/** PLAN 0.23.9: sanitize panePlacement — only "pool"|"legacy"; else default. */
function sanitizePanePlacement(raw: unknown): "pool" | "legacy" {
  return raw === "legacy" ? "legacy" : "pool";
}

/** PLAN 0.23.9: non-empty string only; else undefined (omit on wire). */
function sanitizePaneWorkspaceId(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim();
  return t.length > 0 ? t : undefined;
}

/** PLAN 0.26.0: hookSensor opt-in — only explicit `true` enables; else false. */
function sanitizeHookSensor(raw: unknown): boolean {
  return raw === true;
}

/** R27 L-1: keep only well-shaped argv entries (non-empty array of non-empty strings).
 *  Malformed entries are dropped — same as unregistered (fail-closed), never throws later
 *  in resolveAgentArgv (which would otherwise be swallowed by the bridge pollTimer catch,
 *  leaving a claimed card stuck in "doing" with no signal). */
function sanitizeAgentArgv(raw: unknown): Partial<Record<DispatchAgentKind, string[]>> {
  if (!raw || typeof raw !== "object") return {};
  const out: Partial<Record<DispatchAgentKind, string[]>> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string" && x.length > 0)) {
      out[k as DispatchAgentKind] = v;
    }
  }
  return out;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${field} is required`);
  }
  return value;
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${field} must be a string[]`);
  }
  return [...value];
}

/**
 * 0.31.0 D8 / R49-M2: tool lists are deprecated and optional. Raw presence is
 * kept (omitted key stays omitted, `[]` stays present) for policy resolution.
 */
function parseClaudeProfile(raw: unknown): ClaudePermissionProfile {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("worker.permissions.claude must be an object");
  }
  const o = raw as Record<string, unknown>;
  const profile: ClaudePermissionProfile = {
    permissionMode: requiredString(o.permissionMode, "worker.permissions.claude.permissionMode"),
  };
  if (Object.hasOwn(o, "allowedTools")) {
    profile.allowedTools = stringArray(o.allowedTools, "worker.permissions.claude.allowedTools");
  }
  if (Object.hasOwn(o, "disallowedTools")) {
    profile.disallowedTools = stringArray(
      o.disallowedTools,
      "worker.permissions.claude.disallowedTools",
    );
  }
  return profile;
}

function parseCodexProfile(raw: unknown): CodexPermissionProfile {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("worker.permissions.codex must be an object");
  }
  const o = raw as Record<string, unknown>;
  const profile: CodexPermissionProfile = {
    sandbox: requiredString(o.sandbox, "worker.permissions.codex.sandbox"),
    approvalPolicy: requiredString(o.approvalPolicy, "worker.permissions.codex.approvalPolicy"),
  };
  if (o.extraArgs !== undefined) {
    profile.extraArgs = stringArray(o.extraArgs, "worker.permissions.codex.extraArgs");
  }
  return profile;
}

function parseGrokProfile(raw: unknown): GrokPermissionProfile {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("worker.permissions.grok must be an object");
  }
  const o = raw as Record<string, unknown>;
  const profile: GrokPermissionProfile = {
    permissionMode: requiredString(o.permissionMode, "worker.permissions.grok.permissionMode"),
  };
  // Deprecated, optional, raw presence kept (as for claude).
  if (Object.hasOwn(o, "allow")) {
    profile.allow = stringArray(o.allow, "worker.permissions.grok.allow");
  }
  if (Object.hasOwn(o, "deny")) {
    profile.deny = stringArray(o.deny, "worker.permissions.grok.deny");
  }
  if (o.extraArgs !== undefined) {
    profile.extraArgs = stringArray(o.extraArgs, "worker.permissions.grok.extraArgs");
  }
  return profile;
}

function parsePermissions(raw: unknown): WorkerPermissions {
  const defaults = defaultWorkerPermissions();
  if (raw === undefined) return defaults;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("worker.permissions must be an object");
  }
  // Walk the raw tree first so a dangerous token in any nested field fails
  // closed before known-field projection drops it.
  validateWorkerConfig({
    backend: "headless",
    cwd: "/",
    allowedRoots: ["/"],
    maxConcurrent: { claude: 1, codex: 1, grok: 1 },
    timeoutMs: 1,
    permissions: raw as WorkerPermissions,
  });
  const src = raw as Record<string, unknown>;
  return {
    claude: src.claude === undefined ? defaults.claude : parseClaudeProfile(src.claude),
    codex: src.codex === undefined ? defaults.codex : parseCodexProfile(src.codex),
    grok: src.grok === undefined ? defaults.grok : parseGrokProfile(src.grok),
  };
}

function parseMaxConcurrent(raw: unknown): Record<AgentKind, number> {
  const out: Record<AgentKind, number> = { claude: 1, codex: 1, grok: 1 };
  if (raw === undefined) return out;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("worker.maxConcurrent must be an object");
  }
  const src = raw as Record<string, unknown>;
  for (const agent of HEADLESS_AGENTS) {
    if (!Object.prototype.hasOwnProperty.call(src, agent)) continue;
    const value = src[agent];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
      throw new Error(`worker.maxConcurrent.${agent} must be an integer >= 1`);
    }
    out[agent] = value;
  }
  return out;
}

function parseTimeoutMs(raw: unknown): number {
  if (raw === undefined) return DEFAULT_TIMEOUT_MS;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
    throw new Error("worker.timeoutMs must be a positive number");
  }
  // setTimeout overflows above 2^31-1 ms and fires at once.
  if (raw > 2_147_483_647) {
    throw new Error("worker.timeoutMs must be at most 2147483647");
  }
  return raw;
}

function parseCwd(raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error("worker.cwd is required when worker.backend is headless");
  }
  if (!isAbsolute(raw)) {
    throw new Error("worker.cwd must be an absolute path");
  }
  return raw;
}

function parseAllowedRoots(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(
      "worker.allowedRoots must be a non-empty string[] when worker.backend is headless",
    );
  }
  const roots: string[] = [];
  for (const root of raw) {
    if (typeof root !== "string" || root.length === 0 || !isAbsolute(root)) {
      throw new Error("worker.allowedRoots entries must be absolute paths");
    }
    roots.push(root);
  }
  return roots;
}

/**
 * Defence in depth for the argv the worker actually execs, including a
 * code-level command override. Uses agent-argv's dangerous-token walk.
 * A fake CLI path and `--fake-kind` pass; bypass / dangerously-* / --always-approve do not.
 */
export function assertHeadlessCommandArgv(argv: readonly string[]): void {
  validateWorkerConfig({
    backend: "headless",
    cwd: "/",
    allowedRoots: ["/"],
    maxConcurrent: { claude: 1, codex: 1, grok: 1 },
    timeoutMs: 1,
    permissions: {
      codex: {
        sandbox: "workspace-write",
        approvalPolicy: "never",
        extraArgs: [...argv],
      },
    },
  });
}

function parseAgentBinPath(agent: AgentKind, raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error(`worker.agentBin.${agent} must be a single executable path`);
  }
  if (basename(raw) !== agent) {
    throw new Error(`worker.agentBin.${agent} basename must be ${agent}`);
  }
  assertHeadlessCommandArgv([raw]);
  return raw;
}

function parseAgentBin(raw: unknown): Record<AgentKind, string> {
  if (raw === undefined) return { ...DEFAULT_AGENT_BIN };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("worker.agentBin must be an object");
  }
  const src = raw as Record<string, unknown>;
  const out = {} as Record<AgentKind, string>;
  for (const agent of HEADLESS_AGENTS) {
    out[agent] =
      src[agent] === undefined ? DEFAULT_AGENT_BIN[agent] : parseAgentBinPath(agent, src[agent]);
  }
  return out;
}

/** 0.31.0 D1: fail closed on anything but `{enabled: boolean}`. */
function parseSkills(raw: unknown): { enabled: boolean } | undefined {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("worker.skills must be an object");
  }
  const src = raw as Record<string, unknown>;
  for (const key of Object.keys(src)) {
    if (key !== "enabled") throw new Error(`worker.skills.${key} is not a known key`);
  }
  if (typeof src.enabled !== "boolean") {
    throw new Error("worker.skills.enabled must be a boolean");
  }
  return { enabled: src.enabled };
}

/** 0.36.0 D5 · R1: `parseSkills`-shaped; fail closed on anything but `{enabled: boolean}`. */
function parseMemory(raw: unknown): { enabled: boolean } | undefined {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("worker.memory must be an object");
  }
  const src = raw as Record<string, unknown>;
  for (const key of Object.keys(src)) {
    if (key !== "enabled") throw new Error(`worker.memory.${key} is not a known key`);
  }
  if (typeof src.enabled !== "boolean") {
    throw new Error("worker.memory.enabled must be a boolean");
  }
  return { enabled: src.enabled };
}

/** 0.37.0 D4(a): omitted → undefined; anything but a boolean throws. */
function parseStrictEnforcement(raw: unknown): boolean | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "boolean") throw new Error("worker.strictEnforcement must be a boolean");
  return raw;
}

/** 0.37.0 D3: `parseMemory`-shaped; fail closed on anything but `{enabled: boolean}`. */
function parseRules(raw: unknown): { enabled: boolean } | undefined {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("worker.rules must be an object");
  }
  const src = raw as Record<string, unknown>;
  for (const key of Object.keys(src)) {
    if (key !== "enabled") throw new Error(`worker.rules.${key} is not a known key`);
  }
  if (typeof src.enabled !== "boolean") {
    throw new Error("worker.rules.enabled must be a boolean");
  }
  return { enabled: src.enabled };
}

function workerConfigFromParts(src: {
  cwd?: unknown;
  allowedRoots?: unknown;
  maxConcurrent?: unknown;
  timeoutMs?: unknown;
  permissions?: unknown;
  skills?: unknown;
}): WorkerConfig {
  const skills = parseSkills(src.skills);
  const permissions = parsePermissions(src.permissions);
  const config: WorkerConfig = {
    backend: "headless",
    cwd: parseCwd(src.cwd),
    allowedRoots: parseAllowedRoots(src.allowedRoots),
    maxConcurrent: parseMaxConcurrent(src.maxConcurrent),
    timeoutMs: parseTimeoutMs(src.timeoutMs),
    permissions,
    policy: workerPolicyFor(permissions),
    ...(skills ? { skills } : {}),
  };
  validateWorkerConfig(config);
  return config;
}

/**
 * PLAN 0.31.0 D7 / D8. `loomDir()/policy.json` (session-store loomDir, legacy
 * fallback included) merged per agent with that agent's deprecated lists.
 * An invalid policy.json or a deprecated allow next to `shell.allow` throws,
 * so the headless bridge refuses to start (fail-closed).
 */
function workerPolicyFor(permissions: WorkerPermissions) {
  const dir = loomDir();
  return resolveWorkerPolicy(permissions, loadPolicy(dir), {
    policyPath: join(dir, "policy.json"),
  });
}

/**
 * WorkerConfig for a headless bridge. Throws a clear Error when the section
 * is missing, not headless, fails agent-argv permission checks, or policy.json
 * is invalid / conflicts with a deprecated allow (0.31.0 D7, R49-M2).
 * Omitted permissions and concurrency use agent-argv / D8–D9 defaults.
 */
export function workerConfigFromBridge(cfg: BridgeConfig): WorkerConfig {
  const worker = cfg.worker;
  if (!worker || worker.backend !== "headless") {
    throw new Error('worker.backend must be "headless"');
  }
  return workerConfigFromParts(worker);
}

/** `{bin, args}` map for HeadlessDispatcher. Defaults: claude, codex, grok. */
export function headlessAgentCommands(
  cfg: BridgeConfig,
): Record<AgentKind, { bin: string; args: string[] }> {
  const worker = cfg.worker;
  if (!worker || worker.backend !== "headless") {
    throw new Error('worker.backend must be "headless"');
  }
  const bins = parseAgentBin(worker.agentBin);
  return {
    claude: { bin: bins.claude, args: [] },
    codex: { bin: bins.codex, args: [] },
    grok: { bin: bins.grok, args: [] },
  };
}

/**
 * Headless sections throw. Pane, unknown backend, a missing section, and
 * junk keys under a non-headless backend return undefined and do not throw.
 */
function workerSectionFromRaw(raw: unknown): BridgeWorkerConfig | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const src = raw as Record<string, unknown>;
  if (src.backend !== "headless") return undefined;
  const parsed = workerConfigFromParts(src);
  const agentBin = parseAgentBin(src.agentBin);
  const memory = parseMemory(src.memory);
  const rules = parseRules(src.rules);
  const strictEnforcement = parseStrictEnforcement(src.strictEnforcement);
  return {
    backend: "headless",
    cwd: parsed.cwd,
    allowedRoots: [...parsed.allowedRoots],
    maxConcurrent: { ...parsed.maxConcurrent },
    timeoutMs: parsed.timeoutMs,
    permissions: parsed.permissions,
    agentBin,
    ...(parsed.skills ? { skills: { ...parsed.skills } } : {}),
    ...(memory ? { memory } : {}),
    ...(rules ? { rules } : {}),
    ...(strictEnforcement !== undefined ? { strictEnforcement } : {}),
  };
}

/**
 * PLAN 0.37.0 ② doctor용 순수 파서 (R14). `raw` = the config file's `worker` value. Not headless
 * → pane defaults. Headless → the same parsers (same wording) as loadBridgeConfig for
 * maxConcurrent · strictEnforcement · memory · rules · permissions. Never calls loomDir() or
 * loadPolicy.
 */
export function readBridgeWorkerFlags(raw: unknown): BridgeWorkerFlags {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return paneWorkerFlags();
  const src = raw as Record<string, unknown>;
  if (src.backend !== "headless") return paneWorkerFlags();
  const permissions = parsePermissions(src.permissions);
  const maxConcurrent = parseMaxConcurrent(src.maxConcurrent);
  const memory = parseMemory(src.memory);
  const rules = parseRules(src.rules);
  const strictEnforcement = parseStrictEnforcement(src.strictEnforcement);
  return {
    backend: "headless",
    enabled: enabledAgentsOf(maxConcurrent),
    strictEnforcement: strictEnforcement === true,
    memoryEnabled: memory?.enabled === true,
    rulesEnabled: rules?.enabled === true,
    permissions,
  };
}

function paneWorkerFlags(): BridgeWorkerFlags {
  return {
    backend: "pane",
    enabled: [],
    strictEnforcement: false,
    memoryEnabled: false,
    rulesEnabled: false,
    permissions: defaultWorkerPermissions(),
  };
}

export function loadBridgeConfig(profile: string): BridgeConfig {
  const p = bridgeConfigPath(profile);
  const base = defaultBridgeConfig();
  if (!existsSync(p)) return base;
  let raw: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(readFileSync(p, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return base;
    raw = parsed as Record<string, unknown>;
  } catch {
    return base;
  }
  // Worker errors must escape. The JSON try/catch above only covers read/parse.
  const worker = workerSectionFromRaw(raw.worker);
  const dispatchers = Array.isArray(raw.authorizedDispatchers)
    ? raw.authorizedDispatchers.map(String).filter(Boolean)
    : [];
  return {
    authorizedDispatchers: dispatchers,
    herdrSocketPath:
      typeof raw.herdrSocketPath === "string" && raw.herdrSocketPath
        ? raw.herdrSocketPath
        : base.herdrSocketPath,
    agentArgv: {
      ...DEFAULT_AGENT_ARGV,
      ...sanitizeAgentArgv(raw.agentArgv),
    },
    herdrProtocol: typeof raw.herdrProtocol === "number" ? raw.herdrProtocol : base.herdrProtocol,
    paneCleanup: sanitizePaneCleanup(raw.paneCleanup),
    panePlacement: sanitizePanePlacement(raw.panePlacement),
    paneWorkspaceId: sanitizePaneWorkspaceId(raw.paneWorkspaceId),
    hookSensor: sanitizeHookSensor(raw.hookSensor),
    ...(worker ? { worker } : {}),
  };
}

export function saveBridgeConfig(profile: string, cfg: BridgeConfig): void {
  ensureFableDir();
  const dir = bridgeConfigDir();
  mkdirSync(dir, { recursive: true });
  const p = bridgeConfigPath(profile);
  writeFileSync(p, `${JSON.stringify(cfg, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  try {
    chmodSync(p, 0o600);
  } catch {
    /* */
  }
}

/** M-1: authorize dispatch fromPeerId against allowlist. Missing config ⇒ deny. */
export function isAuthorizedDispatcher(cfg: BridgeConfig, fromPeerId: string | undefined): boolean {
  if (!fromPeerId) return false;
  if (!cfg.authorizedDispatchers.length) return false;
  return cfg.authorizedDispatchers.includes(fromPeerId);
}

export function resolveAgentArgv(cfg: BridgeConfig, kind: DispatchAgentKind): string[] | null {
  const argv = cfg.agentArgv[kind];
  if (!argv?.length) return null;
  // Permanent: shell never allowed even if misconfigured
  if (argv[0] === "shell" || argv.some((a) => a === "sh" || a === "bash")) {
    return null;
  }
  return argv;
}
