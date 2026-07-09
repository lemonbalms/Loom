import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/** Current product markers (exact phrases only — never bare /loom/i). */
const LOOM_BEGIN = "# --- Loom multiplayer (managed) BEGIN ---";
const LOOM_END = "# --- Loom multiplayer (managed) END ---";
/** Legacy Fable markers */
const FABLE_BEGIN = "# --- Fable multiplayer (managed) BEGIN ---";
const FABLE_END = "# --- Fable multiplayer (managed) END ---";

const TABLE_RE = /^\s*\[mcp_servers\.(?:fable|loom)(?:\.|])/i;

/**
 * Build a managed TOML block for [mcp_servers.loom] including session env.
 */
export function buildLoomMcpTomlBlock(opts: {
  mcpStdioPath: string;
  sessionEnv?: Record<string, string>;
  extraLines?: string[];
}): string {
  const envEntries = Object.entries(opts.sessionEnv ?? {}).filter(
    ([, v]) => v !== undefined && v !== "",
  );
  const lines = [
    LOOM_BEGIN,
    "[mcp_servers.loom]",
    'command = "bun"',
    `args = ["run", ${JSON.stringify(opts.mcpStdioPath)}]`,
    ...(opts.extraLines ?? []),
  ];
  if (envEntries.length > 0) {
    lines.push("[mcp_servers.loom.env]");
    for (const [k, v] of envEntries) {
      lines.push(`${k} = ${JSON.stringify(String(v))}`);
    }
  }
  lines.push(LOOM_END, "");
  return lines.join("\n");
}

/** @deprecated use buildLoomMcpTomlBlock */
export function buildFableMcpTomlBlock(opts: {
  mcpStdioPath: string;
  sessionEnv?: Record<string, string>;
  extraLines?: string[];
}): string {
  return buildLoomMcpTomlBlock(opts);
}

function stripMarkerPair(text: string, begin: string, end: string): string {
  for (;;) {
    const b = text.indexOf(begin);
    const e = text.indexOf(end);
    if (b < 0 || e < b) break;
    let endIdx = e + end.length;
    if (text[endIdx] === "\n") endIdx += 1;
    text = text.slice(0, b) + text.slice(endIdx);
  }
  return text;
}

/**
 * Exact-phrase comment match only (RN1: no bare /Loom/i).
 */
function isManagedComment(trimmed: string): boolean {
  if (!trimmed.startsWith("#")) return false;
  // R11 Low: never bare /WARNING: legacy/ — scope to product MCP markers only
  return (
    /Fable multiplayer/i.test(trimmed) ||
    /Loom multiplayer/i.test(trimmed) ||
    /legacy \[mcp_servers\.(?:fable|loom)\]/i.test(trimmed) ||
    /WARNING: legacy \[mcp_servers\.(?:fable|loom)\]/i.test(trimmed)
  );
}

/**
 * Remove every Loom/Fable MCP section (H-4 dual-strip).
 */
export function stripAllLoomMcpSections(existing: string): string {
  let text = existing;
  text = stripMarkerPair(text, LOOM_BEGIN, LOOM_END);
  text = stripMarkerPair(text, FABLE_BEGIN, FABLE_END);
  // legacy auto-added single-line style markers if any
  text = text.replace(
    /# --- Fable multiplayer \(auto-added\) ---[\s\S]*?(?=\n\[|\n*$)/gi,
    "",
  );

  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trim();

    const isComment = isManagedComment(trimmed);
    const isTable = TABLE_RE.test(line);

    if (isComment || isTable) {
      if (isComment) {
        i += 1;
        while (i < lines.length) {
          const t = lines[i]!.trim();
          if (t === "") {
            i += 1;
            continue;
          }
          // Only exact managed phrases — never bare "loom"
          if (isManagedComment(t)) {
            i += 1;
            continue;
          }
          break;
        }
      }
      while (i < lines.length) {
        if (TABLE_RE.test(lines[i]!)) {
          i += 1;
          while (i < lines.length && !/^\s*\[/.test(lines[i]!)) {
            i += 1;
          }
          continue;
        }
        break;
      }
      while (i < lines.length && lines[i]!.trim() === "") {
        i += 1;
      }
      continue;
    }

    out.push(line);
    i += 1;
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}

/** @deprecated use stripAllLoomMcpSections */
export function stripAllFableMcpSections(existing: string): string {
  return stripAllLoomMcpSections(existing);
}

export function upsertUserMcpConfig(opts: {
  configPath: string;
  block: string;
}): { written: boolean; path: string; strippedLegacy: boolean } {
  const { configPath, block } = opts;
  mkdirSync(dirname(configPath), { recursive: true });
  let existing = "";
  if (existsSync(configPath)) {
    existing = readFileSync(configPath, "utf8");
  }

  const hadLegacy =
    existing.includes("[mcp_servers.fable]") ||
    existing.includes("[mcp_servers.loom]") ||
    existing.includes(FABLE_BEGIN) ||
    existing.includes(LOOM_BEGIN) ||
    /Fable multiplayer/i.test(existing) ||
    /Loom multiplayer/i.test(existing);

  const base = stripAllLoomMcpSections(existing);
  const strippedLegacy = hadLegacy && base !== existing.trimEnd();

  const next =
    (base.length > 0 ? base + "\n\n" : "") + block.replace(/\n+$/, "\n");

  if (next === existing) {
    return { written: false, path: configPath, strippedLegacy: false };
  }
  writeFileSync(configPath, next, "utf8");
  return {
    written: true,
    path: configPath,
    strippedLegacy: Boolean(strippedLegacy),
  };
}

export function projectMcpSnippetToml(opts: {
  mcpStdioPath: string;
  sessionEnv?: Record<string, string>;
  header: string;
  extraServerLines?: string[];
}): string {
  const envEntries = Object.entries(opts.sessionEnv ?? {}).filter(
    ([, v]) => v !== undefined && v !== "",
  );
  const lines = [
    opts.header,
    "[mcp_servers.loom]",
    'command = "bun"',
    `args = ["run", ${JSON.stringify(opts.mcpStdioPath)}]`,
    ...(opts.extraServerLines ?? []),
  ];
  if (envEntries.length > 0) {
    lines.push("[mcp_servers.loom.env]");
    for (const [k, v] of envEntries) {
      lines.push(`${k} = ${JSON.stringify(String(v))}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

export {
  LOOM_BEGIN as LOOM_MCP_BEGIN,
  LOOM_END as LOOM_MCP_END,
  FABLE_BEGIN as FABLE_MCP_BEGIN,
  FABLE_END as FABLE_MCP_END,
  LOOM_BEGIN as BEGIN,
  LOOM_END as END,
};
