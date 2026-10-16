import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  type BridgeWorkerFlags,
  bridgeConfigSafeName,
  type Gap,
  type LoomSession,
  loadPolicy,
  POLICY_ENFORCEMENT,
  policyGaps,
  readBridgeWorkerFlags,
  renderGapLine,
  resolveWorkerPolicy,
  type StickyHostMeta,
} from "@loom/host";

export type DoctorStatus = "ok" | "warn" | "fail" | "info";

export type DoctorLine = {
  status: DoctorStatus;
  message: string;
};

export type DoctorSection = {
  title: string;
  lines: DoctorLine[];
};

export type RelayProbe =
  | { kind: "ok"; status: number; auth?: boolean; version?: unknown }
  | { kind: "http_error"; status: number; body?: string }
  | { kind: "error"; error: string };

export type HostRpcProbe =
  | { kind: "status"; relayConnected: boolean }
  | { kind: "error"; error: string }
  | { kind: "skipped" };

type SessionLike = Pick<
  LoomSession,
  | "roomId"
  | "roomName"
  | "inviteCode"
  | "peerId"
  | "displayName"
  | "agentKind"
  | "relayUrl"
  | "relayToken"
  | "peerSecret"
  | "profile"
>;

type RelayEndpointLike = {
  wsUrl: string;
  httpOrigin: string;
  host: string;
  token?: string;
  isLocal?: boolean;
};

type HostMetaLike = Pick<
  StickyHostMeta,
  "pid" | "port" | "sessionPath" | "peerId" | "roomId" | "roomName" | "displayName"
>;

export function redactToken(input: string): string {
  return input.replace(/([?&]token=)[^&\s]*/gi, "$1<redacted>");
}

export function installEnvSection(input: {
  version: string;
  loomOnPath: boolean;
  loomCommand: string;
  bunPath: string | null;
}): DoctorSection {
  return {
    title: "Install/env",
    lines: [
      input.loomOnPath
        ? { status: "ok", message: "loom is on PATH" }
        : {
            status: "warn",
            message: "loom is not on PATH — next: run scripts/install.sh or use bun run loom",
          },
      input.bunPath
        ? { status: "ok", message: `bun found: ${input.bunPath}` }
        : {
            status: "fail",
            message: "bun not found on PATH — next: install Bun",
          },
      { status: "info", message: `version: ${input.version}` },
      { status: "info", message: `command hint: ${input.loomCommand}` },
    ],
  };
}

export function homeProfileSection(input: {
  home: string;
  sessionPath: string;
  profile: string | null;
  homeExists: boolean;
  homeWritable: boolean | null;
}): DoctorSection {
  const lines: DoctorLine[] = [
    { status: "info", message: `home: ${input.home}` },
    { status: "info", message: `profile: ${input.profile ?? "(default)"}` },
    { status: "info", message: `session path: ${input.sessionPath}` },
  ];

  if (!input.homeExists) {
    lines.push({
      status: "info",
      message: "home directory not created yet — next: loom room join <blob>",
    });
  } else if (input.homeWritable) {
    lines.push({ status: "ok", message: "home directory is writable" });
  } else {
    lines.push({ status: "fail", message: "home directory is not writable" });
  }

  return { title: "Home/profile", lines };
}

export function sessionSection(session: SessionLike | null): DoctorSection {
  if (!session) {
    return {
      title: "Session",
      lines: [{ status: "info", message: "no session — next: loom room join <blob>" }],
    };
  }

  return {
    title: "Session",
    lines: [
      {
        status: "ok",
        message: `joined room: ${session.roomName} (${session.roomId})`,
      },
      {
        status: session.inviteCode ? "ok" : "warn",
        message: `invite code: ${session.inviteCode || "missing"}`,
      },
      {
        status: "ok",
        message: `peer: ${session.displayName} (${session.peerId}, ${session.agentKind})`,
      },
      {
        status: "info",
        message: `relay url: ${redactToken(session.relayUrl)}`,
      },
      {
        status: "info",
        message: `relay token: ${session.relayToken ? "present" : "missing"}`,
      },
      {
        status: "info",
        message: `peer secret: ${session.peerSecret ? "present" : "missing"}`,
      },
    ],
  };
}

export function relaySection(input: {
  session: SessionLike | null;
  endpoint?: RelayEndpointLike;
  probe?: RelayProbe;
  parseError?: string;
}): DoctorSection {
  if (!input.session) {
    return {
      title: "Relay",
      lines: [{ status: "info", message: "no session — next: loom room join <blob>" }],
    };
  }

  if (input.parseError || !input.endpoint) {
    return {
      title: "Relay",
      lines: [
        {
          status: "fail",
          message: `relay url invalid: ${input.parseError || "unknown parse error"}`,
        },
      ],
    };
  }

  const ep = input.endpoint;
  const lines: DoctorLine[] = [
    { status: "ok", message: `relay url parsed: ${redactToken(ep.wsUrl)}` },
  ];

  if (ep.isLocal || isLoopbackHost(ep.host)) {
    lines.push({
      status: "warn",
      message:
        "relay is loopback — invite links from this session will not work on another machine",
    });
  } else if (!ep.token) {
    lines.push({ status: "warn", message: "remote relay token: missing" });
  } else {
    lines.push({ status: "ok", message: "remote relay token: present" });
  }

  const probe = input.probe;
  if (!probe) {
    lines.push({ status: "info", message: "relay health: not checked" });
  } else if (probe.kind === "ok") {
    lines.push({
      status: "ok",
      message: `relay health: ok (${redactToken(ep.httpOrigin)}/health)`,
    });
    if (probe.auth !== undefined) {
      lines.push({
        status: "info",
        message: `relay auth: ${probe.auth ? "enabled" : "open"}`,
      });
    }
  } else if (probe.kind === "http_error") {
    lines.push({ status: "fail", message: `relay health: HTTP ${probe.status}` });
  } else {
    lines.push({
      status: "fail",
      message: `relay health: unreachable (${probe.error})`,
    });
  }

  return { title: "Relay", lines };
}

export function hostSection(input: {
  session: SessionLike | null;
  meta: HostMetaLike | null;
  pidAlive: boolean;
  rpc: HostRpcProbe;
}): DoctorSection {
  if (!input.session) {
    return {
      title: "Host",
      lines: [{ status: "info", message: "no session — next: loom room join <blob>" }],
    };
  }

  if (!input.meta) {
    return {
      title: "Host",
      lines: [
        {
          status: "warn",
          message: "sticky host not running — next: loom host start",
        },
      ],
    };
  }

  const meta = input.meta;
  const lines: DoctorLine[] = [
    {
      status: input.pidAlive ? "ok" : "warn",
      message: input.pidAlive
        ? `sticky host pid alive: ${meta.pid}`
        : `sticky host stale: pid ${meta.pid} is not alive`,
    },
    {
      status: "info",
      message: `host ipc: http://127.0.0.1:${meta.port}/rpc`,
    },
  ];

  if (meta.roomId !== input.session.roomId || meta.peerId !== input.session.peerId) {
    lines.push({
      status: "warn",
      message: `sticky host mismatch: host ${meta.roomId}/${meta.peerId} vs session ${input.session.roomId}/${input.session.peerId}`,
    });
    return { title: "Host", lines };
  }

  lines.push({
    status: input.pidAlive ? "ok" : "warn",
    message: `sticky host matches session: ${meta.roomName}/${meta.displayName}`,
  });

  if (input.rpc.kind === "status") {
    lines.push({
      status: input.rpc.relayConnected ? "ok" : "warn",
      message: `host relay: ${input.rpc.relayConnected ? "connected" : "disconnected"}`,
    });
  } else if (input.rpc.kind === "error") {
    lines.push({
      status: "warn",
      message: `host RPC status failed: ${input.rpc.error}`,
    });
  }

  return { title: "Host", lines };
}

/** PLAN 0.33.0 D5 reader view of `<p>.status.json` (fields optional — never trust the file). */
export type BridgeStatusFileView = {
  pid?: number;
  state?: string;
  startedAt?: string;
  heartbeatAt?: string;
  stoppedAt?: string;
  herdr?: string;
  lastError?: string;
  drain?: { startedAt?: string; deadlineAt?: string };
  inFlight?: {
    paneCards?: number;
    convs?: number;
    headlessRunning?: number;
    headlessQueued?: number;
  };
};

/** Read-only lock view (owner.json + kill 0 + ps lstart — no reclaim, no signal). */
export type BridgeLockView =
  | { kind: "none" }
  | { kind: "held"; pid: number; startedAt: string; verified: boolean }
  | { kind: "stale"; pid: number | null }
  | { kind: "incomplete" };

export type BridgeReadInput = {
  statusPath: string;
  lockPath: string;
  logPath: string;
  /** Parsed status file, or null when absent / unreadable. */
  status: BridgeStatusFileView | null;
  /** P5: set when the status file exists but is unusable (short reason); absent → undefined. */
  statusInvalid?: string;
  /** kill(status.pid, 0) succeeded. */
  pidAlive: boolean;
  lock: BridgeLockView;
  nowMs: number;
  /** Advisory heartbeat staleness (PLAN D5: 3 × 5 s heartbeat). */
  staleMs?: number;
  /** PLAN 0.37.0 D6 · R15: worker flags of the profile's bridge config — last line when present. */
  worker?: WorkerFlagsView;
};

/** PLAN 0.37.0 ② Bridge · Memory 절 표시 — `worker.memory.enabled` / `worker.rules.enabled`. */
export type WorkerFlagsView = {
  profile: string;
  memory: boolean | "no bridge config" | "invalid bridge config";
  rules: boolean | "no bridge config" | "invalid bridge config";
};

function workerFlagsLine(v: WorkerFlagsView): DoctorLine {
  return {
    status: "info",
    message: `worker.memory.enabled = ${v.memory} · worker.rules.enabled = ${v.rules} (profile ${v.profile})`,
  };
}

const BRIDGE_STALE_MS_DEFAULT = 15_000;

function ageSec(iso: string | undefined, nowMs: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((nowMs - t) / 1000));
}

function lockText(lock: BridgeLockView): string {
  switch (lock.kind) {
    case "none":
      return "lock holder: none";
    case "incomplete":
      return "lock holder: lock dir without owner (being acquired or foreign)";
    case "stale":
      return `lock holder: ${lock.pid !== null ? `pid ${lock.pid} ` : ""}stale (dead or pid reused — next start reclaims it)`;
    case "held":
      return `lock holder: pid ${lock.pid} (alive, started ${lock.startedAt}${lock.verified ? "" : ", start time unverified"})`;
  }
}

function unreadableText(input: BridgeReadInput): string {
  return `bridge status file unreadable: ${input.statusPath} (${input.statusInvalid})`;
}

function drainText(st: BridgeStatusFileView): string | null {
  if (st.state !== "draining" || !st.drain?.deadlineAt) return null;
  const f = st.inFlight ?? {};
  const n = (v: number | undefined) => (typeof v === "number" ? v : "?");
  return `drain: deadline ${st.drain.deadlineAt} · paneCards=${n(f.paneCards)} convs=${n(f.convs)} headlessRunning=${n(f.headlessRunning)} headlessQueued=${n(f.headlessQueued)}`;
}

/**
 * PLAN 0.33.0 D5 / R6 — `loom doctor` Bridge section. Reads files + pid liveness only
 * (no network, no RPC, no ensureRelay). ok / warn / info only — never `fail`: the bridge is
 * optional, so its state never changes the doctor exit code.
 */
export function bridgeSection(input: BridgeReadInput): DoctorSection {
  const staleMs = input.staleMs ?? BRIDGE_STALE_MS_DEFAULT;
  const lines: DoctorLine[] = [];
  const st = input.status;
  if (!st) {
    lines.push(
      input.statusInvalid !== undefined
        ? { status: "warn", message: unreadableText(input) }
        : {
            status: "info",
            message: `bridge never started under this profile (no status file: ${input.statusPath})`,
          },
    );
    if (input.lock.kind !== "none") lines.push({ status: "info", message: lockText(input.lock) });
    lines.push({ status: "info", message: `log: ${input.logPath}` });
    if (input.worker) lines.push(workerFlagsLine(input.worker));
    return { title: "Bridge", lines };
  }

  const state = st.state ?? "unknown";
  const stopped = state === "stopped";
  const pid = typeof st.pid === "number" ? st.pid : null;
  const hbAge = ageSec(st.heartbeatAt, input.nowMs);

  if (input.pidAlive) {
    lines.push({ status: "ok", message: `bridge pid ${pid ?? "?"} alive` });
    if (hbAge === null) {
      lines.push({ status: "warn", message: "heartbeat missing in status file" });
    } else if (hbAge * 1000 <= staleMs) {
      lines.push({ status: "ok", message: `heartbeat fresh (${hbAge}s ago)` });
    } else {
      lines.push({
        status: "warn",
        message: `stale heartbeat (${hbAge}s ago > ${Math.round(staleMs / 1000)}s, pid ${pid ?? "?"} alive)`,
      });
    }
  } else if (stopped) {
    const at = ageSec(st.stoppedAt, input.nowMs);
    lines.push({
      status: "info",
      message: `bridge not running — stopped at ${st.stoppedAt ?? "?"}${at !== null ? ` (${at}s ago)` : ""}`,
    });
  } else {
    lines.push({
      status: "warn",
      message: `bridge died without clean stop — stale status (pid ${pid ?? "?"} dead, last state ${state}, last heartbeat ${hbAge !== null ? `${hbAge}s ago` : "unknown"})`,
    });
  }

  lines.push({ status: "info", message: `state: ${state}` });
  lines.push({ status: "info", message: `herdr: ${st.herdr ?? "unknown"}` });
  const drain = drainText(st);
  if (drain) lines.push({ status: "info", message: drain });
  if (st.lastError) lines.push({ status: "warn", message: `lastError: ${st.lastError}` });
  lines.push({ status: "info", message: lockText(input.lock) });
  lines.push({ status: "info", message: `status file: ${input.statusPath}` });
  lines.push({ status: "info", message: `log: ${input.logPath}` });
  if (input.worker) lines.push(workerFlagsLine(input.worker));
  return { title: "Bridge", lines };
}

/**
 * PLAN 0.33.0 ② `loom bridge status` with the bridge down: status-file summary printed after
 * today's `bridge: offline` lines. No status file → no lines (today's output unchanged);
 * an unreadable one → the reason line (P5).
 */
export function offlineBridgeStatusLines(input: BridgeReadInput): string[] {
  const st = input.status;
  if (!st) {
    // P5: present but unusable → say so (same reason as doctor); absent → nothing.
    if (input.statusInvalid === undefined) return [];
    return [`  ${unreadableText(input)}`, `  ${lockText(input.lock)}`, `  log: ${input.logPath}`];
  }
  const state = st.state ?? "unknown";
  const pid = typeof st.pid === "number" ? st.pid : null;
  const out = [`  status file: ${input.statusPath}`];
  let stateLine = `  state: ${state}`;
  if (pid !== null) {
    if (input.pidAlive) stateLine += ` (pid ${pid} alive — not answering as this session's bridge)`;
    else if (state !== "stopped") stateLine += ` (pid ${pid} dead — no clean stop)`;
  }
  out.push(stateLine);
  const hb = ageSec(st.heartbeatAt, input.nowMs);
  if (st.heartbeatAt) out.push(`  heartbeatAt: ${st.heartbeatAt}${hb !== null ? ` (${hb}s ago)` : ""}`);
  const sa = ageSec(st.stoppedAt, input.nowMs);
  if (st.stoppedAt) out.push(`  stoppedAt: ${st.stoppedAt}${sa !== null ? ` (${sa}s ago)` : ""}`);
  const drain = drainText(st);
  if (drain) out.push(`  ${drain}`);
  if (st.lastError) out.push(`  lastError: ${st.lastError}`);
  out.push(`  ${lockText(input.lock)}`);
  out.push(`  log: ${input.logPath}`);
  return out;
}

/** A read-only service-manager query (R12): its value, or why it is unknown (failure · >2 s). */
export type ServiceProbe<T> = { ok: true; value: T } | { ok: false; reason: string };

export type ServiceManagerState = {
  loaded: boolean;
  running: boolean;
  mainPid: number | null;
  lastExit: number | null;
  /** systemd `UnitFileState` (launchd: null). */
  unitFileState: string | null;
};

/** PLAN 0.34.0 D7 — everything the Service section needs, gathered by `service.ts`. */
export type ServiceInstalledInput = {
  kind: "installed";
  manager: "launchd" | "systemd";
  /** launchd Label / systemd unit name. */
  name: string;
  unitPath: string;
  loomVersion: string | null;
  state: ServiceProbe<ServiceManagerState>;
  /** launchd `print-disabled` (true = disabled); absent on systemd. */
  disabled?: ServiceProbe<boolean | null>;
  /** systemd `loginctl show-user -p Linger`; absent on launchd. */
  linger?: ServiceProbe<"yes" | "no">;
  /** Pinned in the unit file (null = not readable from it). */
  unit: { execPath: string | null; bridgeMainPath: string | null; path: string | null };
  execPathExists: boolean;
  bridgeMainExists: boolean;
  currentPath: string;
  /** Configured agent binaries that the unit PATH does not resolve. */
  unresolvedAgentBins: string[];
  /** Current CLI's `bridgeMainPath()` (null = unresolvable). */
  cliBridgeMainPath: string | null;
  /** Status file `srcPath` (null = no status file). */
  statusSrcPath: string | null;
  /** Log file mode bits (null = missing). */
  log: { path: string; mode: number | null };
  loopbackRelay: boolean;
  /** Live lock holder pid (read-only `inspect` verdict `held`), else null. */
  lockHolderPid: number | null;
  /** Status file ("meta") pid and its liveness. */
  statusPid: number | null;
  statusPidAlive: boolean;
};

export type ServiceSectionInput =
  | { kind: "unsupported"; platform: string }
  | { kind: "invalid-name"; message: string }
  | { kind: "not-installed"; name: string; unitPath: string }
  | { kind: "foreign"; name: string; unitPath: string }
  | ServiceInstalledInput;

function unknownText(row: string, reason: string): string {
  return `${row}: unknown (service manager unreachable: ${reason})`;
}

function modeText(mode: number): string {
  return `0${(mode & 0o777).toString(8).padStart(3, "0")}`;
}

/**
 * PLAN 0.34.0 D7 / ③ — `loom doctor` Service section, also the body of `loom service status`.
 * Pure: the caller gathers files + read-only runner queries (R12). ok / warn / info only — never
 * `fail`, so it never changes the doctor exit code. Rows top to bottom per ③.
 */
export function serviceSection(input: ServiceSectionInput): DoctorSection {
  const title = "Service";
  switch (input.kind) {
    case "unsupported":
      return {
        title,
        lines: [{ status: "info", message: `service: unsupported platform ${input.platform}` }],
      };
    case "invalid-name":
      return { title, lines: [{ status: "info", message: `service: ${input.message}` }] };
    case "not-installed":
      return { title, lines: [{ status: "info", message: `not installed (${input.unitPath})` }] };
    case "foreign":
      return {
        title,
        lines: [
          {
            status: "warn",
            message: `${input.unitPath} exists and is not a Loom service file — loom service will not touch it`,
          },
        ],
      };
  }
  const i = input;
  const lines: DoctorLine[] = [];
  // 설치
  lines.push({
    status: "ok",
    message: `installed: ${i.name} (${i.unitPath}${i.loomVersion ? `, loom ${i.loomVersion}` : ""})`,
  });
  // 적재/실행
  const st = i.state.ok ? i.state.value : null;
  if (!i.state.ok) {
    lines.push({ status: "info", message: unknownText("loaded/running", i.state.reason) });
  } else if (st?.running) {
    lines.push({ status: "ok", message: `running pid ${st.mainPid ?? "?"}` });
  } else if (st && (!st.loaded || (i.manager === "systemd" && st.unitFileState !== "enabled"))) {
    const detail =
      i.manager === "systemd"
        ? ` (LoadState ${st.loaded ? "loaded" : "not loaded"}, UnitFileState=${st.unitFileState ?? "?"})`
        : "";
    lines.push({ status: "warn", message: `installed but not loaded${detail} — loom service start` });
  } else if (st) {
    lines.push({
      status: "info",
      message: `loaded, not running (last exit code ${st.lastExit ?? "?"})`,
    });
  }
  // 비활성 (launchd print-disabled)
  if (i.disabled) {
    if (!i.disabled.ok) {
      lines.push({ status: "info", message: unknownText("Login Items", i.disabled.reason) });
    } else if (i.disabled.value === true) {
      lines.push({
        status: "warn",
        message:
          "disabled in Login Items / launchctl — enable it in System Settings → General → Login Items",
      });
    }
  }
  // 경로
  const missing: string[] = [];
  if (!i.unit.execPath || !i.execPathExists) missing.push(`bun ${i.unit.execPath ?? "(not in unit)"}`);
  if (!i.unit.bridgeMainPath || !i.bridgeMainExists) {
    missing.push(`bridge-main.ts ${i.unit.bridgeMainPath ?? "(not in unit)"}`);
  }
  lines.push(
    missing.length === 0
      ? {
          status: "ok",
          message: `bun and bridge-main.ts exist (${i.unit.execPath} · ${i.unit.bridgeMainPath})`,
        }
      : { status: "warn", message: `missing: ${missing.join(" · ")} — re-run loom service install` },
  );
  // PATH 표류
  if (i.unresolvedAgentBins.length > 0) {
    lines.push({
      status: "warn",
      message: `agent binaries not resolvable via the unit PATH: ${i.unresolvedAgentBins.join(", ")} — re-run loom service install`,
    });
  } else if (i.unit.path === null) {
    lines.push({ status: "info", message: "unit PATH: not found in the unit file" });
  } else if (i.unit.path === i.currentPath) {
    lines.push({ status: "ok", message: "unit PATH matches the current PATH" });
  } else {
    lines.push({
      status: "info",
      message: "unit PATH differs from the current PATH (agent binaries still resolve)",
    });
  }
  // srcPath (R11 — unit · current CLI · status file)
  const known = [i.unit.bridgeMainPath, i.cliBridgeMainPath, i.statusSrcPath].filter(
    (v): v is string => v !== null,
  );
  const srcDesc = `unit ${i.unit.bridgeMainPath ?? "?"} · CLI ${i.cliBridgeMainPath ?? "?"} · status file ${i.statusSrcPath ?? "(none)"}`;
  if (new Set(known).size > 1) {
    lines.push({ status: "warn", message: `srcPath mismatch — ${srcDesc} — re-run loom service install` });
  } else if (known.length === 3) {
    lines.push({ status: "ok", message: `srcPath: unit == CLI == status file (${known[0]})` });
  } else {
    lines.push({ status: "info", message: `srcPath: ${srcDesc}` });
  }
  // 로그 모드
  if (i.log.mode === null) {
    lines.push({ status: "info", message: `log not created yet (${i.log.path})` });
  } else if ((i.log.mode & 0o777) === 0o600) {
    lines.push({ status: "ok", message: `log mode 0600 (${i.log.path})` });
  } else {
    lines.push({
      status: "warn",
      message: `log mode ${modeText(i.log.mode)}, expected 0600 (${i.log.path})`,
    });
  }
  // linger (Linux)
  if (i.linger) {
    if (!i.linger.ok) {
      lines.push({ status: "info", message: unknownText("linger", i.linger.reason) });
    } else if (i.linger.value === "yes") {
      lines.push({ status: "ok", message: "linger: yes" });
    } else {
      lines.push({
        status: "warn",
        message:
          "linger: no — logout stops the service and kills its workers (run 'loginctl enable-linger' yourself)",
      });
    }
  }
  // 루프백 relay
  if (i.loopbackRelay) {
    lines.push({
      status: "warn",
      message: "session relay is loopback — the service needs a reachable relay (0.33.0 D1)",
    });
  }
  // 양보 / 서비스 밖 bridge (D3 · D7)
  const outsidePid = i.statusPidAlive && i.statusPid !== null ? i.statusPid : i.lockHolderPid;
  if (!i.state.ok) {
    if (outsidePid !== null) {
      lines.push({
        status: "info",
        message: unknownText("yield / outside-service check", i.state.reason),
      });
    }
  } else if (
    st?.loaded &&
    !st.running &&
    i.lockHolderPid !== null &&
    i.lockHolderPid !== st.mainPid
  ) {
    lines.push({
      status: "warn",
      message: `service yielded to bridge pid ${i.lockHolderPid} — loom bridge stop, then loom service start`,
    });
  } else if (st && outsidePid !== null && (!st.running || outsidePid !== st.mainPid)) {
    lines.push({ status: "warn", message: `bridge pid ${outsidePid} runs outside the service` });
  }
  return { title, lines };
}

// ---------------------------------------------------------------------------------------------
// PLAN 0.35.0 D7 / ③ — Memory section
// ---------------------------------------------------------------------------------------------

/** A file below loomDir, judged with lstat (a symlink / non-regular file is `unsafe`). */
export type MemoryDoctorFile =
  | { state: "absent" }
  | { state: "file"; bytes: number; mode: number }
  | { state: "unsafe" };

export type MemoryDoctorCounts = {
  active: number;
  proposed: number;
  retired: number;
  unparseable: number;
  conflicts: number;
  dangling: number;
  archivedRefs: number;
};

export type MemoryDoctorAgent = {
  agentKey: string;
  /** `unsafe` = the agentKey entry is a symlink or not a directory (nothing below is read). */
  dir: "dir" | "unsafe";
  entries: MemoryDoctorFile;
  /** Fold counts (zeros when entries.jsonl is absent); null = unreadable or over the scan size. */
  fold: MemoryDoctorCounts | null;
  /** errno name when entries.jsonl exists but could not be read (EACCES …) — P4 verify L2. */
  entriesReadError?: string;
  archive: MemoryDoctorFile;
  persona: MemoryDoctorFile;
};

export type MemoryDoctorInput = {
  platform: string;
  memoryDir: string;
  root: { state: "absent" } | { state: "dir"; mode: number } | { state: "unsafe" };
  /** Valid agentKey entries under memory/, at most 64 (R14). */
  agents: MemoryDoctorAgent[];
  /** memory/ entries that are not agent keys. */
  ignored: string[];
  agentScanCapped: boolean;
  knowledgeIndexPath: string;
  knowledgeIndex: MemoryDoctorFile;
  rooms: {
    state: "absent" | "dir" | "unsafe";
    /** Rooms whose guideline.md exists (or is unsafe), at most 4096 rooms scanned (R14). */
    guidelines: { roomKey: string; file: MemoryDoctorFile }[];
    scanCapped: boolean;
  };
  rules: {
    bundled: number;
    user: number;
    overrides: number;
    disabled: number;
    invalid: number;
    /** Ids with a same-source conflict. */
    conflicts: string[];
    /** Ids whose body was cut at 8192 B. */
    truncated: string[];
    scanCapped: boolean;
  };
  /** PLAN 0.37.0 D6 · R15: worker flags of the profile's bridge config — last line when present. */
  worker?: WorkerFlagsView;
};

const MEMORY_DOCTOR_ACTIVE_CAP = 200;
const MEMORY_DOCTOR_ENTRIES_MAX = 1024 * 1024;
const MEMORY_DOCTOR_SCAN_KIB = 4096;
const MEMORY_DOCTOR_IGNORED_SHOWN = 16;
const PERSONA_DOCTOR_CAP = 8192;
const INDEX_DOCTOR_CAP = 8192;
const GUIDELINE_DOCTOR_CAP = 16384;

function kibText(bytes: number): string {
  return `${Math.ceil(bytes / 1024)} KiB/1024 KiB`;
}

/**
 * PLAN 0.35.0 D7 / ③ — `loom doctor` Memory section. Pure: the caller gathers files read-only
 * (no lock, no write — R14 scan caps). Rows top to bottom per ③: store root · one row per
 * agentKey · persona · knowledge · guideline · rules. ok / warn / info only — never `fail`, so
 * the doctor exit code never changes. `memory/` absent → one info row and the remaining memory
 * rows (agents · persona) are omitted. Human files (persona · INDEX) with mode ≠ 0600 are info.
 */
export function memorySection(input: MemoryDoctorInput): DoctorSection {
  const lines: DoctorLine[] = [];
  const modes = input.platform !== "win32";
  const at = `(${input.memoryDir})`;

  // store root
  const root = input.root;
  if (root.state === "absent") {
    lines.push({ status: "info", message: `no memory yet ${at}` });
  } else if (root.state === "unsafe") {
    lines.push({ status: "warn", message: `memory/ is a symlink or not a directory ${at}` });
  } else {
    const n = `${input.agents.length} agent stores ${at}`;
    if (!modes) lines.push({ status: "ok", message: `memory/ · ${n}` });
    else if (root.mode !== 0o700) {
      lines.push({
        status: "warn",
        message: `memory/ mode ${modeText(root.mode)} (expected 0700) · ${n}`,
      });
    } else lines.push({ status: "ok", message: `memory/ 0700 · ${n}` });
  }

  if (root.state === "dir") {
    // one row per agentKey
    for (const a of input.agents) {
      if (a.dir === "unsafe") {
        lines.push({
          status: "warn",
          message: `${a.agentKey}: store directory is a symlink or not a directory`,
        });
        continue;
      }
      if (a.entries.state === "unsafe") {
        lines.push({
          status: "warn",
          message: `${a.agentKey}: entries.jsonl is a symlink or not a regular file`,
        });
        continue;
      }
      if (a.entriesReadError !== undefined) {
        lines.push({
          status: "warn",
          message: `${a.agentKey}: entries.jsonl unreadable (${a.entriesReadError})`,
        });
        continue;
      }
      const bytes = a.entries.state === "file" ? a.entries.bytes : 0;
      const reasons: string[] = [];
      if (bytes > MEMORY_DOCTOR_ENTRIES_MAX)
        reasons.push("writes refused until loom memory compact");
      let base: string;
      if (a.fold === null) {
        base = `${a.agentKey}: ${kibText(bytes)} (not scanned: over ${MEMORY_DOCTOR_SCAN_KIB} KiB)`;
      } else {
        const f = a.fold;
        base = `${a.agentKey}: active ${f.active}/${MEMORY_DOCTOR_ACTIVE_CAP} · proposed ${f.proposed} · retired ${f.retired} · ${kibText(bytes)}`;
        if (f.active > MEMORY_DOCTOR_ACTIVE_CAP) {
          reasons.push(`active over the cap (approved past ${MEMORY_DOCTOR_ACTIVE_CAP})`);
        }
      }
      if (modes && a.entries.state === "file" && a.entries.mode !== 0o600) {
        reasons.push(`entries.jsonl mode ${modeText(a.entries.mode)} (expected 0600)`);
      }
      if (modes && a.archive.state === "file" && a.archive.mode !== 0o600) {
        reasons.push(`entries.archive.jsonl mode ${modeText(a.archive.mode)} (expected 0600)`);
      }
      if (a.archive.state === "unsafe") {
        reasons.push("entries.archive.jsonl is a symlink or not a regular file");
      }
      if (a.fold && (a.fold.unparseable > 0 || a.fold.conflicts > 0 || a.fold.dangling > 0)) {
        reasons.push(
          `unparseable ${a.fold.unparseable} · conflicts ${a.fold.conflicts} · dangling ${a.fold.dangling}`,
        );
      }
      lines.push(
        reasons.length > 0
          ? { status: "warn", message: `${base} — ${reasons.join("; ")}` }
          : { status: "ok", message: base },
      );
      if (a.fold && a.fold.archivedRefs > 0) {
        lines.push({
          status: "info",
          message: `${a.agentKey}: ${a.fold.archivedRefs} supersedes point into the archive`,
        });
      }
    }
    // P4 verify L4: at most 16 rows, then one summary row
    for (const name of input.ignored.slice(0, MEMORY_DOCTOR_IGNORED_SHOWN)) {
      lines.push({ status: "info", message: `ignored entry ${name}` });
    }
    if (input.ignored.length > MEMORY_DOCTOR_IGNORED_SHOWN) {
      lines.push({
        status: "info",
        message: `… ${input.ignored.length - MEMORY_DOCTOR_IGNORED_SHOWN} more ignored`,
      });
    }
    if (input.agentScanCapped) {
      lines.push({ status: "info", message: "scan capped at 64 agent stores" });
    }

    // persona (human file — mode is info)
    const present = input.agents.filter((a) => a.persona.state === "file").length;
    lines.push({
      status: "info",
      message: `persona.md: ${present} of ${input.agents.length} agent stores`,
    });
    for (const a of input.agents) {
      const p = a.persona;
      if (p.state === "unsafe") {
        lines.push({
          status: "warn",
          message: `${a.agentKey}/persona.md is a symlink or not a regular file`,
        });
      } else if (p.state === "file") {
        if (p.bytes > PERSONA_DOCTOR_CAP) {
          lines.push({
            status: "warn",
            message: `${a.agentKey}/persona.md is ${p.bytes} B (max ${PERSONA_DOCTOR_CAP} B) — truncated on read`,
          });
        }
        if (modes && p.mode !== 0o600) {
          lines.push({
            status: "info",
            message: `${a.agentKey}/persona.md mode ${modeText(p.mode)} (human file — 0600 recommended)`,
          });
        }
      }
    }
  }

  // knowledge
  const k = input.knowledgeIndex;
  const kAt = `(${input.knowledgeIndexPath})`;
  if (k.state === "absent") {
    lines.push({ status: "info", message: `knowledge/INDEX.md: absent ${kAt}` });
  } else if (k.state === "unsafe") {
    lines.push({
      status: "warn",
      message: `knowledge/INDEX.md is a symlink or not a regular file ${kAt}`,
    });
  } else {
    const size = `knowledge/INDEX.md: ${k.bytes}/${INDEX_DOCTOR_CAP} B`;
    lines.push(
      k.bytes > INDEX_DOCTOR_CAP
        ? { status: "warn", message: `${size} — truncated on read ${kAt}` }
        : { status: "ok", message: `${size} ${kAt}` },
    );
    if (modes && k.mode !== 0o600) {
      lines.push({
        status: "info",
        message: `knowledge/INDEX.md mode ${modeText(k.mode)} (human file — 0600 recommended)`,
      });
    }
  }

  // guideline
  if (input.rooms.state === "unsafe") {
    lines.push({ status: "warn", message: "rooms/ is a symlink or not a directory" });
  } else {
    lines.push({ status: "info", message: `guideline.md: ${input.rooms.guidelines.length} rooms` });
    for (const g of input.rooms.guidelines) {
      const name = `rooms/${g.roomKey}/guideline.md`;
      if (g.file.state === "unsafe") {
        lines.push({ status: "warn", message: `${name} is a symlink or not a regular file` });
      } else if (g.file.state === "file" && g.file.bytes > GUIDELINE_DOCTOR_CAP) {
        lines.push({
          status: "warn",
          message: `${name} is ${g.file.bytes} B (max ${GUIDELINE_DOCTOR_CAP} B) — truncated on read`,
        });
      }
    }
  }
  if (input.rooms.scanCapped) {
    lines.push({ status: "info", message: "scan capped at 4096 rooms" });
  }

  // rules
  const r = input.rules;
  lines.push({
    status: "ok",
    message: `rules: bundled ${r.bundled} · user ${r.user} · overrides ${r.overrides}`,
  });
  if (r.invalid > 0) {
    lines.push({ status: "warn", message: `rules: ${r.invalid} invalid — see loom rules list` });
  }
  if (r.conflicts.length > 0) {
    lines.push({
      status: "warn",
      message: `rules: same-source id conflict: ${r.conflicts.join(", ")}`,
    });
  }
  if (r.truncated.length > 0) {
    lines.push({
      status: "warn",
      message: `rules: truncated at 8192 B: ${r.truncated.join(", ")}`,
    });
  }
  if (r.disabled > 0) {
    lines.push({ status: "info", message: `rules: ${r.disabled} disabled by user` });
  }
  if (r.scanCapped) {
    lines.push({ status: "info", message: "rules: scan capped at 256 user files" });
  }

  if (!modes) lines.push({ status: "info", message: "mode bits not checked on Windows" });
  if (input.worker) lines.push(workerFlagsLine(input.worker));
  return { title: "Memory", lines };
}

// ---------------------------------------------------------------------------------------------
// PLAN 0.37.0 D6 / ③ — Policy section (C3 → R14: read-only home, never loomDir())
// ---------------------------------------------------------------------------------------------

type PolicyAgent = Gap["agent"];
const POLICY_AGENTS: readonly PolicyAgent[] = ["claude", "codex", "grok"];

export type PolicyDoctorInput = {
  /** The doctor's read-only Loom home (`<LOOM_TEST_HOME|HOME>/.loom`). */
  home: string;
  /** Bridge profile whose config is read. */
  profile: string;
  /** `<home>/policy.json`. */
  policyPath: string;
  /** `<home>/policy.json` state per `loadPolicy(home)` — the loader MCP and the bridge use. */
  policy: { state: "default" } | { state: "file" } | { state: "invalid"; message: string };
  /** `<root>/.fable/policy.json` exists (same root as `home`; read only, never renamed). */
  legacyPolicy: boolean;
  /** `<home>/bridge/<safe profile>.json`. */
  bridgePath: string;
  /** Raw config file `worker` value → `readBridgeWorkerFlags` (same parsers · wording as the bridge). */
  bridge:
    | { state: "absent" }
    | { state: "invalid"; message: string }
    | { state: "ok"; flags: BridgeWorkerFlags };
  /** `WorkerPolicy.hash` (fingerprint input); null when the policy is invalid. */
  hash: string | null;
  /** Agents the gaps are computed for (all three when the config is absent / invalid). */
  enabled: PolicyAgent[];
  /** `policyGaps(effective, enabled)` — the bridge's function on the bridge's input (D1). */
  gaps: Gap[];
  strictEnforcement: boolean;
  /** Bridge · Memory section flag line (D6). */
  worker: WorkerFlagsView;
};

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Read-only gatherer for the Policy section (and the Bridge · Memory flag line). `home` is the
 * doctor's own `<root>/.loom` — `loadPolicy(home)` (R14), the bridge config raw file under
 * `<home>/bridge/`. Never calls `loomDir()` (which may migrate `~/.fable`), never writes. Never
 * throws.
 */
export function readPolicyDoctorInput(home: string, profile: string): PolicyDoctorInput {
  const policyPath = join(home, "policy.json");
  const legacyPolicy = existsSync(join(dirname(home), ".fable", "policy.json"));
  const bridgePath = join(home, "bridge", `${bridgeConfigSafeName(profile)}.json`);

  // Bridge config — same reading as loadBridgeConfig: a missing file is "absent"; an unreadable
  // or non-JSON / non-object file falls back to defaults (no worker section → pane).
  let bridge: PolicyDoctorInput["bridge"];
  if (!existsSync(bridgePath)) {
    bridge = { state: "absent" };
  } else {
    let worker: unknown;
    try {
      const parsed: unknown = JSON.parse(readFileSync(bridgePath, "utf8"));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        worker = (parsed as Record<string, unknown>).worker;
      }
    } catch {
      worker = undefined;
    }
    try {
      bridge = { state: "ok", flags: readBridgeWorkerFlags(worker) };
    } catch (e) {
      bridge = { state: "invalid", message: errText(e) };
    }
  }
  const viewValue = (pick: (f: BridgeWorkerFlags) => boolean): WorkerFlagsView["memory"] =>
    bridge.state === "absent"
      ? "no bridge config"
      : bridge.state === "invalid"
        ? "invalid bridge config"
        : pick(bridge.flags);
  const worker: WorkerFlagsView = {
    profile,
    memory: viewValue((f) => f.memoryEnabled),
    rules: viewValue((f) => f.rulesEnabled),
  };
  const strictEnforcement = bridge.state === "ok" && bridge.flags.strictEnforcement;

  let userPolicy: ReturnType<typeof loadPolicy>;
  try {
    userPolicy = loadPolicy(home);
  } catch (e) {
    return {
      home,
      profile,
      policyPath,
      policy: { state: "invalid", message: errText(e) },
      legacyPolicy,
      bridgePath,
      bridge,
      hash: null,
      enabled: [],
      gaps: [],
      strictEnforcement,
      worker,
    };
  }

  const flags = bridge.state === "ok" ? bridge.flags : readBridgeWorkerFlags(undefined);
  let enabled: PolicyAgent[] = bridge.state === "ok" ? [...flags.enabled] : [...POLICY_AGENTS];
  let resolved: ReturnType<typeof resolveWorkerPolicy>;
  try {
    resolved = resolveWorkerPolicy(flags.permissions, userPolicy, { policyPath });
  } catch (e) {
    // A deprecated bridge list conflicting with policy.json: the bridge refuses to start (D8 ·
    // R49-M2) — shown as an invalid bridge config, all agents with default permissions.
    bridge = { state: "invalid", message: errText(e) };
    enabled = [...POLICY_AGENTS];
    resolved = resolveWorkerPolicy(readBridgeWorkerFlags(undefined).permissions, userPolicy, {
      policyPath,
    });
  }
  return {
    home,
    profile,
    policyPath,
    policy: { state: userPolicy === null ? "default" : "file" },
    legacyPolicy,
    bridgePath,
    bridge,
    hash: resolved.hash,
    enabled,
    gaps: policyGaps(resolved.effective, enabled),
    strictEnforcement: bridge.state === "ok" && bridge.flags.strictEnforcement,
    worker,
  };
}

/**
 * PLAN 0.37.0 D6 / ③ — `loom doctor` Policy section (last section). Rows top to bottom: source
 * (+ legacy) · hash · bridge config · one row per agent · gaps · strict. `fail` only for an
 * invalid policy.json (then the rows below the source are omitted); gaps are `warn` and never
 * change the exit code. Gap lines are `renderGapLine` — the bridge warning without `warning: `.
 */
export function policySection(input: PolicyDoctorInput): DoctorSection {
  const lines: DoctorLine[] = [];
  const legacy = (): void => {
    if (input.legacyPolicy) {
      lines.push({
        status: "info",
        message: "legacy ~/.fable/policy.json present — bridge/MCP migrate it on first run",
      });
    }
  };

  if (input.policy.state === "invalid") {
    lines.push({
      status: "fail",
      message: `policy.json invalid: ${input.policy.message} — every Loom MCP call is refused and a headless bridge refuses to start`,
    });
    legacy();
    return { title: "Policy", lines };
  }
  lines.push({
    status: "info",
    message:
      input.policy.state === "file"
        ? `policy: ${input.policyPath}`
        : `policy: built-in defaults (no ${input.policyPath})`,
  });
  legacy();
  if (input.hash !== null) {
    lines.push({ status: "info", message: `worker policy hash ${input.hash} (fingerprint input)` });
  }

  const bridge = input.bridge;
  if (bridge.state === "absent") {
    lines.push({
      status: "info",
      message: `no bridge config for profile ${input.profile} — all agents assumed enabled`,
    });
  } else if (bridge.state === "invalid") {
    lines.push({
      status: "warn",
      message: `bridge config invalid: ${bridge.message} — the headless bridge refuses to start; showing all agents`,
    });
  } else {
    const enabledText = bridge.flags.enabled.length > 0 ? bridge.flags.enabled.join(", ") : "none";
    lines.push({
      status: "info",
      message: `bridge config ${input.bridgePath} (profile ${input.profile}): backend ${bridge.flags.backend} · enabled ${enabledText}`,
    });
    if (bridge.flags.backend === "pane") {
      lines.push({
        status: "info",
        message: "backend is pane — the policy notice and warnings apply to headless workers only",
      });
    }
  }

  const headlessOk = bridge.state === "ok" && bridge.flags.backend === "headless";
  for (const agent of POLICY_AGENTS) {
    if (headlessOk && !input.enabled.includes(agent)) {
      lines.push({
        status: "info",
        message: `${agent}: disabled (worker.maxConcurrent.${agent} = 0) — not checked`,
      });
      continue;
    }
    const t = POLICY_ENFORCEMENT;
    lines.push({
      status: "info",
      message: `${agent}: shell.deny ${t.shellDeny[agent]} · network ${t.network[agent]} · mcp.deny ${t.mcpDeny[agent]} · mcp.isolate ${t.mcpIsolate[agent]}`,
    });
  }

  if (input.gaps.length === 0) {
    lines.push({ status: "ok", message: "no policy gaps for enabled agents" });
  } else {
    for (const g of input.gaps) lines.push({ status: "warn", message: renderGapLine(g) });
  }

  const refuses =
    input.strictEnforcement && input.gaps.length > 0
      ? ` — the bridge refuses to start (${input.gaps.length} gaps)`
      : "";
  lines.push({
    status: "info",
    message: `worker.strictEnforcement = ${input.strictEnforcement} (profile ${input.profile})${refuses}`,
  });
  return { title: "Policy", lines };
}

export function summarizeDoctor(sections: DoctorSection[]): Record<DoctorStatus, number> {
  const summary: Record<DoctorStatus, number> = {
    ok: 0,
    warn: 0,
    fail: 0,
    info: 0,
  };
  for (const section of sections) {
    for (const line of section.lines) {
      summary[line.status] += 1;
    }
  }
  return summary;
}

export function doctorExitCode(sections: DoctorSection[]): 0 | 1 {
  return summarizeDoctor(sections).fail > 0 ? 1 : 0;
}

export function renderDoctor(sections: DoctorSection[]): string {
  const out: string[] = ["loom doctor"];
  for (const section of sections) {
    out.push("", section.title);
    for (const line of section.lines) {
      out.push(`  ${line.status.padEnd(4)} ${line.message}`);
    }
  }
  const s = summarizeDoctor(sections);
  out.push("", `Summary: ${s.ok} ok, ${s.warn} warn, ${s.fail} fail, ${s.info} info`);
  return `${out.join("\n")}\n`;
}

function isLoopbackHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  return h === "127.0.0.1" || h === "localhost" || h === "::1";
}
