import { describe, expect, test } from "bun:test";
import { sanitizePeerText, sanitizePeerName } from "./sanitize";

describe("sanitizePeerText", () => {
  test("keeps normal text and newlines", () => {
    expect(sanitizePeerText("hello\nworld\t!")).toBe("hello\nworld\t!");
  });

  test("strips OSC 52 clipboard sequence", () => {
    const malicious = "hi\x1b]52;c;YWJj\x07there";
    expect(sanitizePeerText(malicious)).toBe("hithere");
  });

  test("strips CSI color codes", () => {
    expect(sanitizePeerText("\x1b[31mred\x1b[0m")).toBe("red");
  });

  test("strips bare ESC pairs", () => {
    expect(sanitizePeerText("a\x1bMb")).toBe("ab");
  });

  test("strips other C0 controls", () => {
    expect(sanitizePeerText("a\x00\x08b")).toBe("ab");
  });

  test("strips bidi overrides and zero-width", () => {
    expect(sanitizePeerText("a\u202Eevil\u202Cb")).toBe("aevilb");
    expect(sanitizePeerText("a\u200Bb")).toBe("ab");
    expect(sanitizePeerText("a\u2066x\u2069b")).toBe("axb");
  });
});

describe("sanitizePeerName", () => {
  test("collapses newlines", () => {
    expect(sanitizePeerName("al\nice")).toBe("al ice");
  });

  test("empty becomes anon", () => {
    expect(sanitizePeerName("\x1b[31m")).toBe("anon");
  });
});

