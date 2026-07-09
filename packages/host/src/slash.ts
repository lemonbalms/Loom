/**
 * Parse /loom slash commands from a line of user input.
 * 0.10: /fable dual-accept removed — use /loom.
 */
export type SlashCommand =
  | { kind: "handoff"; to: string; body: string }
  | { kind: "peers" }
  | { kind: "chat"; text: string }
  | { kind: "help" };

function stripPrefix(line: string): string | null {
  const trimmed = line.trim();
  if (trimmed === "/loom") return "";
  if (trimmed.startsWith("/loom ")) return trimmed.slice("/loom ".length).trim();
  // 0.10: explicit reject of legacy prefix (not dual-accept)
  if (trimmed === "/fable" || trimmed.startsWith("/fable ")) {
    return "\0legacy-fable";
  }
  return null;
}

export function parseSlash(line: string): SlashCommand | null {
  const rest = stripPrefix(line);
  if (rest === null) return null;
  if (rest === "\0legacy-fable") {
    return { kind: "help" }; // caller may print deprecation; treat as help
  }

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

export const SLASH_HELP = `Slash commands:
  /loom peers
  /loom handoff @name message
  /loom handoff * broadcast
  /loom chat text
  /loom help
(/fable is no longer accepted — use /loom)`;
