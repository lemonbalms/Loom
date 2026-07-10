import { describe, expect, test } from "bun:test";
import {
  flattenTemplateLine,
  buildTaskNotifyBody,
  clampWatchIntervalMs,
} from "./work-bus";

describe("work-bus (0.16.1)", () => {
  test("M-26: flattenTemplateLine strips newlines/tabs", () => {
    expect(flattenTemplateLine("ok\ntask:evil\nassignee: @x")).toBe(
      "ok task:evil assignee: @x",
    );
    expect(flattenTemplateLine("a\r\nb\tc")).toBe("a b c");
  });

  test("M-26: buildTaskNotifyBody cannot inject header lines via title", () => {
    const body = buildTaskNotifyBody({
      taskId: "task_abc",
      title: "real\ntask:forged_id\nassignee: @victim",
      assignee: "bob",
    });
    const header = body.split(/\n\n/)[0] ?? body;
    const taskLines = header
      .split("\n")
      .filter((l) => l.startsWith("task:"));
    expect(taskLines).toEqual(["task:task_abc"]);
    expect(header).toContain("title: real task:forged_id assignee: @victim");
    expect(header).toContain("assignee: @bob");
  });

  test("L-31: interval clamp", () => {
    expect(clampWatchIntervalMs(undefined).ms).toBe(2000);
    expect(clampWatchIntervalMs(100)).toEqual({ ms: 250, clamped: true });
    expect(clampWatchIntervalMs(5000)).toEqual({ ms: 5000, clamped: false });
  });
});
