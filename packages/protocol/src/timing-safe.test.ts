import { describe, expect, test } from "bun:test";
import { timingSafeStringEqual, timingSafeTokenEqual } from "./timing-safe";

describe("L-14 timingSafeStringEqual", () => {
  test("equal and unequal", () => {
    expect(timingSafeStringEqual("abc", "abc")).toBe(true);
    expect(timingSafeStringEqual("abc", "abd")).toBe(false);
    expect(timingSafeStringEqual("abc", "ab")).toBe(false);
    expect(timingSafeStringEqual("", "")).toBe(true);
  });

  test("timingSafeTokenEqual is the same function", () => {
    expect(timingSafeTokenEqual).toBe(timingSafeStringEqual);
    expect(timingSafeTokenEqual("secret", "secret")).toBe(true);
  });
});
