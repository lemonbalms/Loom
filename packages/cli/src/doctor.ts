import type { LoomSession, StickyHostMeta } from "@loom/host";

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
};

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
