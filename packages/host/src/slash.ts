/**
 * Parse /loom (or legacy /fable) slash commands from a line of user input.
 * Returns null if the line is not a loom/fable command.
 */
export type SlashCommand =
  | { kind: "handoff"; to: string; body: string }
  | { kind: "peers" }
  | { kind: "chat"; text: string }
  | { kind: "help" };

function stripPrefix(line: string): string | null {
  const trimmed = line.trim();
  for (const p of ["/loom", "/fable"] as const) {
    if (trimmed === p) return "";
    if (trimmed.startsWith(p + " ")) return trimmed.slice(p.length).trim();
  }
  return null;
}

export function parseSlash(line: string): SlashCommand | null {
  const rest = stripPrefix(line);
  if (rest === null) return null;

  if (!rest || rest === "help") return { kind: "help" };

  if (rest === "peers") return { kind: "peers" };

  if (rest.startsWith("chat ")) {
    return { kind: "chat", text: rest.slice(5).trim() };
  }

  if (rest.startsWith("handoff ")) {
    const payload = rest.slice("handoff ".length).trim();
    const m = /^(@[\w.-]+|\*|[\w.-]+)\s+(.+)$/s.exec(payload);
    if (m) {
      return { kind: "handoff", to: m[1]!, body: stripQuotes(m[2]!) };
    }
    if (payload) {
      return { kind: "handoff", to: "*", body: stripQuotes(payload) };
    }
  }

  return { kind: "help" };
}

function stripQuotes(s: string): string {
  const t = s.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1);
  }
  return t;
}

export const SLASH_HELP = `Slash commands (legacy /fable … still accepted):
  /loom peers
  /loom handoff @name message
  /loom handoff * broadcast
  /loom chat text
  /loom help`;
