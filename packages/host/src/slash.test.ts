import { describe, expect, test } from "bun:test";
import { parseSlash } from "./slash";

describe("parseSlash", () => {
  test("ignores normal input", () => {
    expect(parseSlash("hello")).toBeNull();
  });

  test("peers", () => {
    expect(parseSlash("/loom peers")).toEqual({ kind: "peers" });
  });

  test("0.10: /fable no longer dual-accepts (returns help)", () => {
    expect(parseSlash("/fable peers")).toEqual({ kind: "help" });
  });

  test("handoff to named peer", () => {
    expect(parseSlash('/loom handoff @alice review the API')).toEqual({
      kind: "handoff",
      to: "@alice",
      body: "review the API",
    });
  });

  test("handoff broadcast", () => {
    expect(parseSlash("/loom handoff * the british are coming")).toEqual({
      kind: "handoff",
      to: "*",
      body: "the british are coming",
    });
  });

  test("chat", () => {
    expect(parseSlash("/loom chat hi team")).toEqual({
      kind: "chat",
      text: "hi team",
    });
  });
});
