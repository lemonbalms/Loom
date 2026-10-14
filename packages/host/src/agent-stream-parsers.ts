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

/** Escape raw C0 controls inside JSON strings. Structural whitespace stays. */
function repairControlsInsideStrings(input: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    const code = input.charCodeAt(i);
    if (inString && !escaped && code <= 0x1f) {
      out += `\\u${code.toString(16).padStart(4, "0")}`;
      continue;
    }
    out += ch;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (!inString) {
      if (ch === '"') inString = true;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') inString = false;
  }
  return out;
}

function parseJsonValue(slice: string): unknown | undefined {
  const trimmed = slice.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    try {
      return JSON.parse(repairControlsInsideStrings(trimmed)) as unknown;
    } catch {
      return undefined;
    }
  }
}

/** Index after a `{`/`[` value, or null when the value never closes. */
function jsonValueEnd(input: string, start: number): number | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < input.length; i++) {
    const ch = input[i]!;
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") {
      depth++;
      continue;
    }
    if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return null;
}

function eventsOf(jsonl: string): unknown[] {
  const events: unknown[] = [];
  let i = 0;
  while (i < jsonl.length) {
    const ch = jsonl[i]!;
    if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
      i++;
      continue;
    }
    if (ch !== "{" && ch !== "[") {
      while (i < jsonl.length && jsonl[i] !== "\n") i++;
      if (i < jsonl.length) i++;
      continue;
    }
    const end = jsonValueEnd(jsonl, i);
    if (end === null) break;
    const event = parseJsonValue(jsonl.slice(i, end));
    if (event !== undefined) {
      events.push(event);
      i = end;
      continue;
    }
    const newline = jsonl.indexOf("\n", i);
    if (newline === -1 || newline + 1 >= end) i = end;
    else i = newline + 1;
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

function textBlocks(event: Record<string, unknown>): string {
  const message = event.message;
  if (!isRecord(message) || !Array.isArray(message.content)) return "";
  let out = "";
  for (const block of message.content) {
    if (!isRecord(block)) continue;
    if (block.type === "text" && typeof block.text === "string") out += block.text;
  }
  return out;
}

function parseClaude(events: unknown[]): ParsedAgentStream {
  const parsed = emptyParse();
  let sawResult = false;
  let initSession: string | null = null;
  let assistantSession: string | null = null;
  let assistantText = "";
  for (const event of events) {
    if (!isRecord(event)) continue;
    if (
      event.type === "system" &&
      event.subtype === "init" &&
      typeof event.session_id === "string"
    ) {
      initSession = event.session_id;
    }
    if (event.type === "assistant") {
      assistantText += textBlocks(event);
      if (assistantSession === null && typeof event.session_id === "string") {
        assistantSession = event.session_id;
      }
    }
    if (event.type !== "result") continue;
    sawResult = true;
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
  if (!sawResult) {
    parsed.finalText = assistantText;
    parsed.sessionId = initSession ?? assistantSession;
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

function lineAt(text: string, index: number): string {
  const start = index === 0 ? -1 : text.lastIndexOf("\n", index - 1);
  const lineStart = start === -1 ? 0 : start + 1;
  const end = text.indexOf("\n", index);
  return text.slice(lineStart, end === -1 ? text.length : end);
}

function denialEntries(
  text: string,
  spans: { start: number; end: number; data: string }[],
): AgentDenial[] {
  const denials: AgentDenial[] = [];
  const pushedSpan = new Set<number>();
  const needle = "denied:";
  let from = 0;
  while (from <= text.length) {
    const idx = text.indexOf(needle, from);
    if (idx === -1) break;
    const end = idx + needle.length;
    const spanIndex = spans.findIndex(
      (span) => idx >= span.start && end <= span.end,
    );
    if (spanIndex >= 0) {
      if (!pushedSpan.has(spanIndex)) {
        pushedSpan.add(spanIndex);
        denials.push({ text: spans[spanIndex]!.data });
      }
    } else {
      denials.push({ text: lineAt(text, idx) });
    }
    from = end;
  }
  return denials;
}

function parseGrok(events: unknown[]): ParsedAgentStream {
  const parsed = emptyParse();
  let text = "";
  const spans: { start: number; end: number; data: string }[] = [];
  for (const event of events) {
    if (!isRecord(event)) continue;
    if (event.type === "text" && typeof event.data === "string") {
      const start = text.length;
      text += event.data;
      spans.push({ start, end: text.length, data: event.data });
    }
    if (event.type !== "end") continue;
    parsed.sessionId =
      typeof event.sessionId === "string" ? event.sessionId : null;
    if ("usage" in event) parsed.usage = event.usage;
    parsed.isError = event.stopReason === "error";
  }
  parsed.finalText = text;
  parsed.denials = denialEntries(text, spans);
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
