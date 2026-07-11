import { describe, expect, test } from "bun:test";
import {
  claudeStopHookCommand,
  mergeClaudeStopHook,
  shouldActivateHandoffInject,
} from "./inject-handoffs";

describe("inject handoff CLI helpers", () => {
  test("activation requires flag and claude agent", () => {
    expect(shouldActivateHandoffInject("claude", {})).toBe(false);
    expect(shouldActivateHandoffInject("codex", { "inject-handoffs": true })).toBe(false);
    expect(shouldActivateHandoffInject("claude", { "inject-handoffs": true })).toBe(true);
  });

  test("Claude Stop hook command is shell quoted", () => {
    expect(claudeStopHookCommand("/tmp/a b/it's.idle")).toBe(
      "touch '/tmp/a b/it'\\''s.idle'",
    );
  });

  test("mergeClaudeStopHook preserves settings and dedupes command", () => {
    const command = "touch '/tmp/x.idle'";
    const once = mergeClaudeStopHook(
      {
        model: "keep",
        hooks: {
          Stop: [
            {
              matcher: "old",
              hooks: [{ type: "command", command: "echo old" }],
            },
          ],
        },
      },
      command,
    );
    const twice = mergeClaudeStopHook(once, command);

    expect(twice.model).toBe("keep");
    expect(twice.hooks?.Stop).toHaveLength(2);
    expect(
      twice.hooks?.Stop?.flatMap((entry) => entry.hooks).filter(
        (hook) => hook.command === command,
      ),
    ).toHaveLength(1);
  });
});
