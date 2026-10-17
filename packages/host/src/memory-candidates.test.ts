/**
 * PLAN 0.38.0 P3 — pure `LOOM-MEMORY-CANDIDATES` parser (D5 · R7). No IO.
 */
import { describe, expect, test } from "bun:test";
import {
  MEMORY_CANDIDATES_BEGIN,
  MEMORY_CANDIDATES_END,
  MEMORY_CANDIDATES_PER_ATTEMPT,
  parseMemoryCandidates,
} from "./memory-candidates";

const B = "LOOM-MEMORY-CANDIDATES";
const E = "LOOM-MEMORY-END";
const NONE = { block: false, candidates: [], invalid: 0, overflow: 0 };

describe("memory-candidates constants (②)", () => {
  test("markers and per-attempt cap", () => {
    expect(MEMORY_CANDIDATES_BEGIN).toBe(B);
    expect(MEMORY_CANDIDATES_END).toBe(E);
    expect(MEMORY_CANDIDATES_PER_ATTEMPT).toBe(5);
  });
});

describe("parseMemoryCandidates (D5 · R7)", () => {
  test("no block → block false, zeros", () => {
    expect(parseMemoryCandidates("")).toEqual(NONE);
    expect(parseMemoryCandidates("just a report\n- fact: not in a block")).toEqual(NONE);
  });

  test("one block", () => {
    const text = ["report", B, "- fact: the build uses bun", "- decision: keep the cap at 5", E, "LOOM-REPORT-END"].join("\n");
    expect(parseMemoryCandidates(text)).toEqual({
      block: true,
      candidates: [
        { type: "fact", body: "the build uses bun" },
        { type: "decision", body: "keep the cap at 5" },
      ],
      invalid: 0,
      overflow: 0,
    });
  });

  test("two blocks → only the last complete one", () => {
    const text = [B, "- fact: first", E, "middle", B, "- preference: second", E].join("\n");
    expect(parseMemoryCandidates(text)).toEqual({
      block: true,
      candidates: [{ type: "preference", body: "second" }],
      invalid: 0,
      overflow: 0,
    });
  });

  test("open BEGIN with no END after → the earlier complete block", () => {
    const text = [B, "- fact: complete", E, B, "- fact: never closed"].join("\n");
    expect(parseMemoryCandidates(text)).toEqual({
      block: true,
      candidates: [{ type: "fact", body: "complete" }],
      invalid: 0,
      overflow: 0,
    });
  });

  test("only an open BEGIN → no block", () => {
    expect(parseMemoryCandidates([B, "- fact: never closed"].join("\n"))).toEqual(NONE);
  });

  test("END with nothing open is ignored", () => {
    expect(parseMemoryCandidates([E, "- fact: x"].join("\n"))).toEqual(NONE);
  });

  test("nested BEGIN drops the earlier open block (latest intent)", () => {
    const text = [B, "- fact: dropped", B, "- fact: kept", E].join("\n");
    expect(parseMemoryCandidates(text)).toEqual({
      block: true,
      candidates: [{ type: "fact", body: "kept" }],
      invalid: 0,
      overflow: 0,
    });
  });

  test("marker lines: trailing spaces and one \\r are accepted; leading space or lowercase is not a marker", () => {
    const ok = [`${B}   `, "- fact: a\r", `${E}\t\r`].join("\n");
    expect(parseMemoryCandidates(ok)).toEqual({
      block: true,
      candidates: [{ type: "fact", body: "a" }],
      invalid: 0,
      overflow: 0,
    });
    expect(parseMemoryCandidates([` ${B}`, "- fact: a", E].join("\n"))).toEqual(NONE);
    expect(parseMemoryCandidates(["loom-memory-candidates", "- fact: a", "loom-memory-end"].join("\n"))).toEqual(
      NONE,
    );
  });

  test("CRLF text throughout", () => {
    const text = [B, "- fact: one", "- decision: two  ", E].join("\r\n");
    expect(parseMemoryCandidates(text)).toEqual({
      block: true,
      candidates: [
        { type: "fact", body: "one" },
        { type: "decision", body: "two" },
      ],
      invalid: 0,
      overflow: 0,
    });
  });

  test("blank lines inside the block are ignored", () => {
    const text = [B, "", "   ", "- fact: one", "\t", E].join("\n");
    expect(parseMemoryCandidates(text)).toEqual({
      block: true,
      candidates: [{ type: "fact", body: "one" }],
      invalid: 0,
      overflow: 0,
    });
  });

  test("malformed lines count as invalid", () => {
    const text = [
      B,
      "- fact: good",
      "fact: no dash",
      "- note: unknown type",
      "- fact:",
      "- fact:  ",
      "-  fact: two spaces",
      "- Fact: capital",
      "* fact: star",
      E,
    ].join("\n");
    expect(parseMemoryCandidates(text)).toEqual({
      block: true,
      candidates: [{ type: "fact", body: "good" }],
      invalid: 7,
      overflow: 0,
    });
  });

  test("body keeps inner spacing, loses trailing spaces", () => {
    const text = [B, "- fact: a  b:  c   ", E].join("\n");
    expect(parseMemoryCandidates(text).candidates).toEqual([{ type: "fact", body: "a  b:  c" }]);
  });

  test("six candidates → first five + overflow 1", () => {
    const lines = [1, 2, 3, 4, 5, 6].map((n) => `- fact: f${n}`);
    const r = parseMemoryCandidates([B, ...lines, E].join("\n"));
    expect(r.block).toBe(true);
    expect(r.candidates.map((c) => c.body)).toEqual(["f1", "f2", "f3", "f4", "f5"]);
    expect(r.overflow).toBe(1);
    expect(r.invalid).toBe(0);
  });

  test("all three types", () => {
    const text = [B, "- fact: f", "- decision: d", "- preference: p", E].join("\n");
    expect(parseMemoryCandidates(text).candidates).toEqual([
      { type: "fact", body: "f" },
      { type: "decision", body: "d" },
      { type: "preference", body: "p" },
    ]);
  });

  test("empty complete block → block true, no candidates", () => {
    expect(parseMemoryCandidates([B, E].join("\n"))).toEqual({
      block: true,
      candidates: [],
      invalid: 0,
      overflow: 0,
    });
  });
});
