/**
 * PLAN 0.30.0 D4 / R48-L2.
 * Lenient CLI stream parsers. Blank lines and non-JSON lines are skipped.
 * Claude JSON may contain raw U+0000–U+001F (PROBE §7.1); those are escaped
 * and parsed again. Codex resume may omit thread.started — sessionId stays null.
 */
import type { AgentKind } from "./agent-argv";

export type AgentDenial = {
  toolName?: string;
  toolInput?: unknown;
  command?: string;
  exitCode?: number;
  text?: string;
};

export type ParsedAgentStream = {
  sessionId: string | null;
  finalText: string;
  isError: boolean;
  usage: unknown;
  denials: AgentDenial[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function objectHasIsError(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(objectHasIsError);
  if (!isRecord(value)) return false;
  if (value.is_error === true) return true;
  return Object.values(value).some(objectHasIsError);
}

/** Escape raw control chars so JSON.parse accepts claude's lenient output. */
function relaxControls(line: string): string {
  return line.replace(/[\u0000-\u001F]/g, (ch) => {
    const hex = ch.charCodeAt(0).toString(16).padStart(4, "0");
    return `\\u${hex}`;
  });
}

function parseJsonLine(line: string): unknown | undefined {
  const trimmed = line.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    try {
      return JSON.parse(relaxControls(trimmed)) as unknown;
    } catch {
      return undefined;
    }
  }
}

function eventsOf(jsonl: string): unknown[] {
  const events: unknown[] = [];
  for (const line of jsonl.split("\n")) {
    const event = parseJsonLine(line);
    if (event !== undefined) events.push(event);
  }
  return events;
}

function emptyParse(): ParsedAgentStream {
  return {
    sessionId: null,
    finalText: "",
    isError: false,
    usage: null,
    denials: [],
  };
}

function parseClaude(events: unknown[]): ParsedAgentStream {
  const parsed = emptyParse();
  for (const event of events) {
    if (!isRecord(event) || event.type !== "result") continue;
    parsed.sessionId =
      typeof event.session_id === "string" ? event.session_id : null;
    parsed.finalText = typeof event.result === "string" ? event.result : "";
    parsed.isError = event.is_error === true;
    parsed.usage = event.usage ?? null;
    parsed.denials = [];
    if (!Array.isArray(event.permission_denials)) continue;
    for (const denial of event.permission_denials) {
      if (!isRecord(denial)) continue;
      parsed.denials.push({
        toolName: typeof denial.tool_name === "string" ? denial.tool_name : undefined,
        toolInput: denial.tool_input,
      });
    }
  }
  return parsed;
}

function parseCodex(events: unknown[]): ParsedAgentStream {
  const parsed = emptyParse();
  for (const event of events) {
    if (!isRecord(event)) continue;
    if (event.type === "thread.started" && typeof event.thread_id === "string") {
      parsed.sessionId = event.thread_id;
    }
    if (event.type === "turn.completed" && "usage" in event) {
      parsed.usage = event.usage;
    }
    if (event.type !== "item.completed" || !isRecord(event.item)) continue;
    const item = event.item;
    if (item.type === "agent_message" && typeof item.text === "string") {
      parsed.finalText = item.text;
    }
    if (item.type !== "command_execution") continue;
    if (typeof item.exit_code !== "number" || item.exit_code === 0) continue;
    parsed.denials.push({
      command: typeof item.command === "string" ? item.command : "",
      exitCode: item.exit_code,
      text:
        typeof item.aggregated_output === "string" ? item.aggregated_output : "",
    });
  }
  parsed.isError = events.some(objectHasIsError);
  return parsed;
}

function parseGrok(events: unknown[]): ParsedAgentStream {
  const parsed = emptyParse();
  let text = "";
  for (const event of events) {
    if (!isRecord(event)) continue;
    if (event.type === "text" && typeof event.data === "string") {
      text += event.data;
      if (event.data.includes("denied:")) parsed.denials.push({ text: event.data });
    }
    if (event.type !== "end") continue;
    parsed.sessionId =
      typeof event.sessionId === "string" ? event.sessionId : null;
    if ("usage" in event) parsed.usage = event.usage;
    parsed.isError = event.stopReason === "error";
  }
  parsed.finalText = text;
  return parsed;
}

export function parseAgentStream(
  agent: AgentKind,
  jsonl: string,
): ParsedAgentStream {
  const events = eventsOf(jsonl);
  if (agent === "claude") return parseClaude(events);
  if (agent === "codex") return parseCodex(events);
  return parseGrok(events);
}
