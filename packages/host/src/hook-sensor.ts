/**
 * PLAN 0.26.0 — hooks auxiliary sensor (claude worker state hints).
 *
 * Bridge-local Unix socket listener (direction inverted vs inject-control:
 * bridge is the server). Events land in flight.hookHint as completion hints
 * only — never auto close / auto approve. Fail-open when absent.
 *
 * Locks: R41 M-1 (attempt-scoped socket + lifecycle) · M-2 (hookHint contract) ·
 * L-1 (sanitize+slice cardId only) · L-2 (fallback scope) · L-3 (metadata-only).
 */
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
} from "node:fs";
import { createServer, type Server, type Socket } from "node:net";
import { join } from "node:path";
import { isPathUnderLoomDir } from "./inject-control";
import { loomDir } from "./session-store";

// ─── types ───────────────────────────────────────────────────────────────────

/** Single-slot last-event-wins hint (M-2 ①) — no payload body fields (L-3). */
export type HookHintKind =
  | "Stop"
  | "permission_prompt"
  | "idle_prompt"
  | "UserPromptSubmit";

export type HookHint = {
  kind: HookHintKind;
  at: number;
};

export type HookListener = {
  socketPath: string;
  /** Close server + unlink socket file (idempotent). */
  close: () => void;
};

export type StartHookListenerResult =
  | { ok: true; listener: HookListener }
  | { ok: false; reason: "path_rejected" | "bind_failed" };

export type HookTelemetryType =
  | "hook_hint"
  | "fallback"
  | "permission_prompt"
  | "agent_blocked_correction";

export type HookTelemetryRecord = {
  type: HookTelemetryType;
  at: number;
  /** Event kind when type is hook_hint / permission_prompt. */
  kind?: HookHintKind | string;
  /** Optional short reason (no payload bodies). */
  reason?: string;
};

// ─── path helpers (M-1 · L-1) ────────────────────────────────────────────────

/** Same charset filter as inject-control sanitizeRunId; slice cardId only. */
export function sanitizeCardIdForSocket(cardId: string): string {
  return cardId.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 80) || "default";
}

/**
 * Attempt(seq)-scoped socket path: `loomDir()/hook-<cardId>-<seq>.sock`.
 * seq is NOT sliced — preserves uniqueness across re-dispatch (M-1).
 */
export function hookSocketPath(cardId: string, seq: number): string {
  const safe = sanitizeCardIdForSocket(cardId);
  return join(loomDir(), `hook-${safe}-${seq}.sock`);
}

export function hookTelemetryPath(): string {
  return join(loomDir(), "hook-sensor.jsonl");
}

// ─── parse / slot (M-2) ──────────────────────────────────────────────────────

const HOOK_HINT_KINDS = new Set<string>([
  "Stop",
  "permission_prompt",
  "idle_prompt",
  "UserPromptSubmit",
]);

/**
 * Map a raw JSON line (from worker hook script or test) to HookHint.
 * Accepts either our compact `{kind}` wire or Claude stdin-shaped fields.
 * Returns null on malformed / unknown — caller silently ignores (counter only).
 */
export function parseHookEventLine(line: string): HookHint | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  let kind: string | undefined;
  if (typeof obj.kind === "string" && HOOK_HINT_KINDS.has(obj.kind)) {
    kind = obj.kind;
  } else {
    const eventName = String(
      obj.hook_event_name ?? obj.hookEventName ?? "",
    );
    const notif = String(
      obj.notification_type ?? obj.matcher ?? obj.message ?? "",
    ).toLowerCase();
    if (eventName === "Stop" || eventName === "stop") {
      kind = "Stop";
    } else if (
      eventName === "UserPromptSubmit" ||
      eventName === "user_prompt_submit"
    ) {
      kind = "UserPromptSubmit";
    } else if (
      eventName === "Notification" ||
      eventName === "notification"
    ) {
      if (notif.includes("idle")) kind = "idle_prompt";
      else if (
        notif.includes("permission") ||
        notif === "" ||
        notif.includes("permission_prompt")
      ) {
        kind = "permission_prompt";
      } else {
        kind = "permission_prompt"; // Notification without idle → treat as permission-class
      }
    }
  }
  if (!kind || !HOOK_HINT_KINDS.has(kind)) return null;

  const at =
    typeof obj.at === "number" && Number.isFinite(obj.at)
      ? obj.at
      : Date.now();
  return { kind: kind as HookHintKind, at };
}

/** M-2 ① last-event-wins single slot. */
export function applyHookHintSlot(
  _prev: HookHint | undefined,
  next: HookHint,
): HookHint {
  return next;
}

/**
 * M-2 ③ correction decision: only a live (latest, uncleared) permission_prompt
 * corrects a completion-class judgment to agent_blocked.
 */
export function shouldCorrectCompletionToBlocked(
  hint: HookHint | undefined,
): boolean {
  return hint?.kind === "permission_prompt";
}

/**
 * M-2 ④ Stop is poll-acceleration / max-bypass *input* only.
 * Completion still requires indicator-clear scrape — never Stop alone.
 */
export function stopAllowsStillRunningMaxBypass(
  hint: HookHint | undefined,
): boolean {
  return hint?.kind === "Stop";
}

/** M-2 ② clear on herdr working re-entry. */
export function clearHookHintOnWorking(): undefined {
  return undefined;
}

// ─── settings / argv injection (D2) ──────────────────────────────────────────

/**
 * Observation hook command: always exit 0, stdout empty (no context injection),
 * side-effect only (socket write). `async:true` is set on the handler object.
 *
 * Reads Claude hook stdin JSON, maps to `{kind}`, writes one line to the
 * attempt-scoped Unix socket. Failures are swallowed (exit 0).
 */
export function buildHookSocketWriteCommand(socketPath: string): string {
  // argv-safe absolute path; bun -e script reads process.argv[1] as socket path.
  // No stdout writes. Always process.exit(0).
  const script = [
    "const n=require('net');",
    "const s=process.argv[1];",
    "let d='';",
    "process.stdin.on('data',c=>d+=c);",
    "process.stdin.on('end',()=>{",
    "let k='Stop';",
    "try{",
    "const j=JSON.parse(d);",
    "const e=String(j.hook_event_name||j.hookEventName||'');",
    "const t=String(j.notification_type||j.matcher||j.message||'').toLowerCase();",
    "if(e==='UserPromptSubmit'||e==='user_prompt_submit')k='UserPromptSubmit';",
    "else if(e==='Notification'||e==='notification')k=t.includes('idle')?'idle_prompt':'permission_prompt';",
    "else if(e==='Stop'||e==='stop')k='Stop';",
    "else if(typeof j.kind==='string'&&j.kind)k=j.kind;",
    "}catch{}",
    "const c=n.createConnection(s);",
    "let done=false;",
    "const fin=()=>{if(!done){done=true;process.exit(0);}};",
    "c.on('connect',()=>{c.end(JSON.stringify({kind:k})+'\\n',fin);});",
    "c.on('error',fin);",
    "setTimeout(fin,800);",
    "});",
  ].join("");
  // Double-quote the -e script; socket path as separate argv (no shell).
  // Claude runs via shell — pass as: bun -e '<script>' '<socketPath>'
  const escScript = script.replace(/'/g, `'\\''`);
  const escSock = socketPath.replace(/'/g, `'\\''`);
  return `bun -e '${escScript}' '${escSock}'`;
}

export type HookSettingsDoc = {
  hooks: Record<
    string,
    Array<{
      matcher?: string;
      hooks: Array<{
        type: "command";
        command: string;
        async: true;
      }>;
    }>
  >;
};

/** Build Claude `--settings` inline JSON document (D2 · 3 events). */
export function buildHookSettingsDoc(socketPath: string): HookSettingsDoc {
  const command = buildHookSocketWriteCommand(socketPath);
  const handler = {
    type: "command" as const,
    command,
    async: true as const,
  };
  return {
    hooks: {
      Stop: [{ hooks: [handler] }],
      Notification: [
        {
          matcher: "permission_prompt|idle_prompt",
          hooks: [handler],
        },
      ],
      UserPromptSubmit: [{ hooks: [handler] }],
    },
  };
}

export function buildHookSettingsJson(socketPath: string): string {
  return JSON.stringify(buildHookSettingsDoc(socketPath));
}

/**
 * Append `--settings <json>` to a claude argv copy (does not mutate input).
 * Only for agentKind claude — caller gates.
 */
export function appendHookSettingsArgv(
  argv: string[],
  socketPath: string,
): string[] {
  return [...argv, "--settings", buildHookSettingsJson(socketPath)];
}

/** D4 script conventions: every handler async + command exits 0 + no stdout echo. */
export function assertHookScriptConventions(doc: HookSettingsDoc): {
  ok: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  for (const [event, matchers] of Object.entries(doc.hooks)) {
    for (const m of matchers) {
      for (const h of m.hooks) {
        if (h.type !== "command") {
          reasons.push(`${event}: type must be command`);
        }
        if (h.async !== true) {
          reasons.push(`${event}: async must be true`);
        }
        const cmd = h.command;
        // Must force exit 0; must not bare-echo to stdout (context injection).
        if (!cmd.includes("process.exit(0)") && !cmd.includes("exit 0")) {
          reasons.push(`${event}: command must exit 0`);
        }
        if (/(?:^|[;&|]\s*)echo\s+[^>]/.test(cmd)) {
          reasons.push(`${event}: command must not echo to stdout`);
        }
      }
    }
  }
  return { ok: reasons.length === 0, reasons };
}

// ─── listener (D4) ───────────────────────────────────────────────────────────

export type StartHookListenerOpts = {
  socketPath: string;
  onEvent: (hint: HookHint) => void;
  /** Called when a line fails parse — counters only, no log spam. */
  onMalformed?: () => void;
};

/**
 * Bridge-local server on attempt-scoped socket.
 * ① unlink before bind · 0600 · isPathUnderLoomDir · silent ignore on bad lines.
 * Async: waits for the `listening` event so the socket path exists before return.
 */
export async function startHookListener(
  opts: StartHookListenerOpts,
): Promise<StartHookListenerResult> {
  const { socketPath, onEvent, onMalformed } = opts;
  if (!isPathUnderLoomDir(socketPath)) {
    return { ok: false, reason: "path_rejected" };
  }

  // M-1 ① bind 전 unlink
  try {
    if (existsSync(socketPath)) unlinkSync(socketPath);
  } catch {
    /* best-effort */
  }

  let server: Server;
  try {
    server = createServer((sock: Socket) => {
      let buf = "";
      sock.on("data", (chunk) => {
        buf += chunk.toString("utf8");
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          const hint = parseHookEventLine(line);
          if (hint) onEvent(hint);
          else onMalformed?.();
        }
      });
      sock.on("end", () => {
        if (buf.trim()) {
          const hint = parseHookEventLine(buf);
          if (hint) onEvent(hint);
          else onMalformed?.();
          buf = "";
        }
      });
      sock.on("error", () => {
        /* swallow client errors */
      });
    });
  } catch {
    return { ok: false, reason: "bind_failed" };
  }

  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    try {
      server.close();
    } catch {
      /* */
    }
    try {
      if (existsSync(socketPath)) unlinkSync(socketPath);
    } catch {
      /* */
    }
  };

  return await new Promise<StartHookListenerResult>((resolve) => {
    let settled = false;
    const done = (result: StartHookListenerResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    server.once("error", () => {
      try {
        server.close();
      } catch {
        /* */
      }
      done({ ok: false, reason: "bind_failed" });
    });

    try {
      server.listen(socketPath, () => {
        try {
          chmodSync(socketPath, 0o600);
        } catch {
          /* mode best-effort on platforms without chmod */
        }
        done({
          ok: true,
          listener: { socketPath, close },
        });
      });
    } catch {
      try {
        server.close();
      } catch {
        /* */
      }
      done({ ok: false, reason: "bind_failed" });
    }
  });
}

// ─── telemetry (D6 · L-3 metadata-only) ──────────────────────────────────────

/**
 * Append one metadata-only JSONL record under loomDir.
 * Never records payload bodies (last_assistant_message / prompt / tool_input).
 */
export function appendHookTelemetry(
  record: Omit<HookTelemetryRecord, "at"> & { at?: number },
): void {
  try {
    const dir = loomDir();
    mkdirSync(dir, { recursive: true });
    const line = JSON.stringify({
      type: record.type,
      at: record.at ?? Date.now(),
      ...(record.kind !== undefined ? { kind: record.kind } : {}),
      ...(record.reason !== undefined ? { reason: record.reason } : {}),
    });
    appendFileSync(hookTelemetryPath(), `${line}\n`, { encoding: "utf8" });
  } catch {
    /* instrumentation must never break the bridge */
  }
}

/** Test helper: read telemetry lines (metadata only). */
export function readHookTelemetryLines(): HookTelemetryRecord[] {
  try {
    const p = hookTelemetryPath();
    if (!existsSync(p)) return [];
    return readFileSync(p, "utf8")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as HookTelemetryRecord);
  } catch {
    return [];
  }
}

// ─── completion fallback classification (D6(b)) ──────────────────────────────

/**
 * done 확정 시점 폴백 reason (D6(b)).
 * Spawn-time reasons (malformed_payload / path_rejected / bind_failed) stay separate;
 * this vocabulary is for the finishCard true-done choke point only.
 */
export type CompletionFallbackReason = "no_listener" | "no_hint" | "stale_hint";

/**
 * Classify a done-path scrape fallback for hookSensor-active claude flights.
 *
 * Priority:
 * - alreadyRecorded true  → null (exactly-once: spawn/prior fallback already logged)
 * - listenerEstablished false → "no_listener"
 * - hint === undefined       → "no_hint"
 * - else                     → "stale_hint" (non-permission hint present but scrape still owned done)
 *
 * Callers only reach this after shouldCorrectCompletionToBlocked is false, so
 * permission_prompt never arrives here (corrected upstream to agent_blocked).
 */
export function classifyCompletionFallback(
  hint: HookHint | undefined,
  listenerEstablished: boolean,
  alreadyRecorded: boolean,
): CompletionFallbackReason | null {
  if (alreadyRecorded) return null;
  if (!listenerEstablished) return "no_listener";
  if (hint === undefined) return "no_hint";
  return "stale_hint";
}

/**
 * done 확정 초크포인트 helper. hookSensor-active flights only (L-2).
 * Appends type:"fallback" at most once per flight; returns true when appended.
 * Structural flight type avoids circular import with bridge-runtime Flight.
 */
export function maybeAppendCompletionFallback(flight: {
  hookSensorActive?: boolean;
  hookListenerEstablished?: boolean;
  hookHint?: HookHint;
  hookFallbackRecorded?: boolean;
}): boolean {
  if (flight.hookSensorActive !== true) return false;
  const reason = classifyCompletionFallback(
    flight.hookHint,
    flight.hookListenerEstablished === true,
    flight.hookFallbackRecorded === true,
  );
  if (reason === null) return false;
  appendHookTelemetry({ type: "fallback", reason });
  flight.hookFallbackRecorded = true;
  return true;
}
