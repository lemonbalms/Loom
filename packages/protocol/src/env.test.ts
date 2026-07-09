import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { envLoom, envRelayToken, envSessionPath } from "./env";

describe("0.10 env LOOM-only (no FABLE dual-read)", () => {
  const keys = [
    "LOOM_RELAY_TOKEN",
    "FABLE_RELAY_TOKEN",
    "LOOM_SESSION",
    "FABLE_SESSION",
  ];
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of keys) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  test("reads LOOM_*", () => {
    process.env.LOOM_RELAY_TOKEN = "secret";
    expect(envRelayToken()).toBe("secret");
  });

  test("does not fall back to FABLE_*", () => {
    process.env.FABLE_RELAY_TOKEN = "old-secret";
    expect(envRelayToken()).toBeUndefined();
    process.env.FABLE_SESSION = "/tmp/old.json";
    expect(envSessionPath()).toBeUndefined();
  });

  test("LOOM wins when both set", () => {
    process.env.LOOM_SESSION = "/tmp/new.json";
    process.env.FABLE_SESSION = "/tmp/old.json";
    expect(envSessionPath()).toBe("/tmp/new.json");
  });

  test("envLoom ignores fable-only values", () => {
    process.env.FABLE_RELAY_TOKEN = "x";
    expect(envLoom("LOOM_RELAY_TOKEN", "FABLE_RELAY_TOKEN")).toBeUndefined();
  });
});
