import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

type ClaudeCommandHook = {
  type: "command";
  command: string;
};

type ClaudeStopMatcher = {
  matcher: string;
  hooks: ClaudeCommandHook[];
};

type ClaudeSettings = Record<string, unknown> & {
  hooks?: Record<string, unknown> & {
    Stop?: ClaudeStopMatcher[];
  };
};

export function shouldActivateHandoffInject(
  agentId: string,
  flags: Record<string, string | boolean>,
): boolean {
  return Boolean(flags["inject-handoffs"]) && agentId === "claude";
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function claudeStopHookCommand(idleMarkerPath: string): string {
  return `touch ${shellQuote(idleMarkerPath)}`;
}

export function mergeClaudeStopHook(
  settings: ClaudeSettings,
  command: string,
): ClaudeSettings {
  const next: ClaudeSettings = { ...settings };
  const hooks =
    next.hooks && typeof next.hooks === "object" ? { ...next.hooks } : {};
  const existingStop = Array.isArray(hooks.Stop) ? hooks.Stop : [];
  const hasCommand = existingStop.some(
    (entry) =>
      Array.isArray(entry?.hooks) &&
      entry.hooks.some(
        (hook) => hook?.type === "command" && hook.command === command,
      ),
  );
  hooks.Stop = hasCommand
    ? existingStop
    : [
        ...existingStop,
        {
          matcher: "",
          hooks: [{ type: "command", command }],
        },
      ];
  next.hooks = hooks;
  return next;
}

export function ensureClaudeStopHook(
  cwd: string,
  idleMarkerPath: string,
): string {
  const settingsPath = join(cwd, ".claude", "settings.local.json");
  let settings: ClaudeSettings = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, "utf8")) as ClaudeSettings;
    } catch {
      settings = {};
    }
  }
  const merged = mergeClaudeStopHook(
    settings,
    claudeStopHookCommand(idleMarkerPath),
  );
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, `${JSON.stringify(merged, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  return settingsPath;
}
