import { describe, expect, test } from "bun:test";
import { runPtySpike, formatSpikeReport } from "./pty-spike";

describe("Phase 1.5 pty spike", () => {
  test("automated cases pass and verdict is no-go for default inject", async () => {
    const report = await runPtySpike();
    expect(report.cases.length).toBe(3);
    for (const c of report.cases) {
      expect(c.passed).toBe(true);
    }
    expect(report.verdict.defaultPathInject).toBe("no-go");
    expect(report.verdict.experimentalOptIn).toBe("deferred");
    const md = formatSpikeReport(report);
    expect(md).toContain("no-go");
    expect(md).toContain("idle_line_reader");
  }, 15000);
});
