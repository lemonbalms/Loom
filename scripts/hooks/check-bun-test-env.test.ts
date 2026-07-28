import { describe, expect, test } from "bun:test";
import {
  decideBunTestEnv,
  hasRelayEnvUnset,
  isBunTestCommand,
} from "./check-bun-test-env.ts";

describe("isBunTestCommand", () => {
  test("matches bun test forms", () => {
    expect(isBunTestCommand("bun test")).toBe(true);
    expect(isBunTestCommand("bun test .")).toBe(true);
    expect(isBunTestCommand("env -u X bun test scripts/x.test.ts")).toBe(true);
    expect(isBunTestCommand("cd foo && bun test")).toBe(true);
  });

  test("ignores non-test bun", () => {
    expect(isBunTestCommand("bun run build")).toBe(false);
    expect(isBunTestCommand("echo bun test")).toBe(false);
    expect(isBunTestCommand("buntester")).toBe(false);
  });
});

describe("hasRelayEnvUnset", () => {
  test("accepts recommended form", () => {
    expect(
      hasRelayEnvUnset("env -u LOOM_RELAY_TOKEN -u LOOM_RELAY_URL bun test"),
    ).toBe(true);
    expect(
      hasRelayEnvUnset("env -u LOOM_RELAY_URL -u LOOM_RELAY_TOKEN bun test ."),
    ).toBe(true);
  });

  test("accepts unset builtins", () => {
    expect(
      hasRelayEnvUnset(
        "unset LOOM_RELAY_TOKEN; unset LOOM_RELAY_URL; bun test",
      ),
    ).toBe(true);
  });

  test("rejects plain bun test", () => {
    expect(hasRelayEnvUnset("bun test")).toBe(false);
    expect(hasRelayEnvUnset("bun test .")).toBe(false);
    expect(hasRelayEnvUnset("env -u LOOM_RELAY_TOKEN bun test")).toBe(false);
  });
});

describe("decideBunTestEnv", () => {
  test("passes non-bash and non-bun-test", () => {
    expect(decideBunTestEnv({ tool_name: "Edit", tool_input: { command: "bun test" } }).action).toBe(
      "pass",
    );
    expect(
      decideBunTestEnv({ tool_name: "Bash", tool_input: { command: "echo hi" } }),
    ).toEqual({ action: "pass", reason: "not_bun_test" });
  });

  test("denies bare bun test", () => {
    const d = decideBunTestEnv({
      tool_name: "Bash",
      tool_input: { command: "bun test" },
    });
    expect(d.action).toBe("deny");
    if (d.action === "deny") expect(d.reason).toBe("missing_relay_unset");
  });

  test("passes compliant bun test", () => {
    const d = decideBunTestEnv({
      tool_name: "Bash",
      tool_input: {
        command: "env -u LOOM_RELAY_TOKEN -u LOOM_RELAY_URL bun test",
      },
    });
    expect(d).toEqual({ action: "pass", reason: "compliant" });
  });
});
