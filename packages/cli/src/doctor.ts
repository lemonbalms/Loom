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
