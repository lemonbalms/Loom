import { describe, expect, test } from "bun:test";
import { parseHandoffContract } from "./handoff-contract";

describe("parseHandoffContract", () => {
  test("detects R-REQUEST", () => {
    const r = parseHandoffContract(
      "[R-REQUEST] PLAN v0.15.0 pending-review\nScope: purpose",
    );
    expect(r.tags).toEqual(["R-REQUEST"]);
    expect(r.primary).toBe("R-REQUEST");
  });

  test("multiple tags and metadata lines", () => {
    const r = parseHandoffContract(
      "intent: review\ngoalId: g1\nround: R16\n[R-RESULT] done\n[VERIFY] later",
    );
    expect(r.tags).toContain("R-RESULT");
    expect(r.tags).toContain("VERIFY");
    expect(r.intent).toBe("review");
    expect(r.goalId).toBe("g1");
    expect(r.round).toBe("R16");
  });

  test("empty body", () => {
    expect(parseHandoffContract("hello").tags).toEqual([]);
  });
});
