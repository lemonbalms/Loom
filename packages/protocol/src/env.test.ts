import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import {
  envLoom,
  envRelayToken,
  envRelayUrl,
  envSessionPath,
  resetLegacyEnvWarnFlag,
} from "./env";

describe("0.10 env LOOM-only (no FABLE dual-read)", () => {
  const keys = [
    "LOOM_RELAY_TOKEN",
    "FABLE_RELAY_TOKEN",
    "LOOM_RELAY_URL",
    "FABLE_RELAY_URL",
    "LOOM_SESSION",
    "FABLE_SESSION",
  ];
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    resetLegacyEnvWarnFlag();
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
    resetLegacyEnvWarnFlag();
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

  test("L-17: warns when only FABLE_RELAY_URL is set", () => {
    const errs: string[] = [];
    const prev = console.error;
    console.error = (...args: unknown[]) => {
      errs.push(args.map(String).join(" "));
    };
    try {
      process.env.FABLE_RELAY_URL = "ws://remote:7842";
      expect(envRelayUrl()).toBeUndefined();
      expect(errs.some((e) => e.includes("FABLE_RELAY_URL"))).toBe(true);
      expect(errs.some((e) => e.includes("LOOM_RELAY_URL"))).toBe(true);
    } finally {
      console.error = prev;
    }
  });
});
