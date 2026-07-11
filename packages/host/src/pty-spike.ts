/**
 * Phase 1.5 — PTY / stdin inject spike harness.
 *
 * Automated cases use line-oriented children (not full agent TUIs).
 * Real Claude/Codex/Grok results remain manual (see docs/spikes/PHASE-1.5-PTY.md).
 *
 * Product default stays: queue + poll (no inject).
 */

import { spawn } from "bun";
import {
  injectIntoStdin,
  prepareInjectText,
} from "./handoff-inject";
import type { HandoffPayload } from "@loom/protocol";

export type SpikeCaseId =
  | "idle_line_reader"
  | "busy_sleep_then_read"
  | "policy_blocks_without_flag";

export type SpikeCaseResult = {
  id: SpikeCaseId;
  passed: boolean;
  detail: string;
};

const SAMPLE_HANDOFF: HandoffPayload = {
  id: "ho_spike",
  fromPeerId: "p_spike",
  to: "@agent",
  mode: "message",
  body: "spike: the british are coming",
  createdAt: new Date().toISOString(),
};

/** Idle child: drains stdin lines until EOF, then prints joined payload. */
export async function caseIdleLineReader(): Promise<SpikeCaseResult> {
  const proc = spawn({
    cmd: [
      "bun",
      "-e",
      `
        const rl = require("node:readline").createInterface({ input: process.stdin });
        const lines = [];
        process.stdout.write("READY\\n");
        rl.on("line", (line) => lines.push(line));
        rl.on("close", () => {
          process.stdout.write("GOT:" + lines.join("|") + "\\n");
          process.exit(0);
        });
      `,
    ],
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });

  const chunks: string[] = [];
  const reader = (async () => {
    const r = proc.stdout.getReader();
    const dec = new TextDecoder();
    while (true) {
      const { done, value } = await r.read();
      if (done) break;
      chunks.push(dec.decode(value));
    }
  })();

  // wait for READY
  const deadline = Date.now() + 3000;
  while (!chunks.join("").includes("READY") && Date.now() < deadline) {
    await Bun.sleep(20);
  }
  if (!chunks.join("").includes("READY")) {
    proc.kill();
    return {
      id: "idle_line_reader",
      passed: false,
      detail: "child never printed READY",
    };
  }

  const { text } = prepareInjectText(SAMPLE_HANDOFF);
  const inj = injectIntoStdin(proc.stdin, text, { experimental: true });
  if (!inj.ok) {
    proc.kill();
    return {
      id: "idle_line_reader",
      passed: false,
      detail: `inject failed: ${inj.reason}`,
    };
  }
  try {
    proc.stdin.end();
  } catch {
    /* closed */
  }

  const code = await proc.exited;
  await reader;
  const out = chunks.join("");
  const gotMarker = out.includes("GOT:") && out.includes("LOOM HANDOFF");
  return {
    id: "idle_line_reader",
    passed: code === 0 && gotMarker,
    detail: gotMarker
      ? "idle line-reader accepted inject with LOOM HANDOFF marker"
      : `exit=${code} out=${JSON.stringify(out.slice(0, 200))}`,
  };
}

/**
 * Busy child: sleep while holding stdin open, then read.
 * Demonstrates that inject during "busy" is buffered — may fire later
 * as an unintended command (TUI risk analogue).
 */
export async function caseBusyThenRead(): Promise<SpikeCaseResult> {
  const proc = spawn({
    cmd: [
      "bun",
      "-e",
      `
        process.stdout.write("BUSY\\n");
        await Bun.sleep(400);
        process.stdout.write("IDLE\\n");
        const rl = require("node:readline").createInterface({ input: process.stdin });
        rl.once("line", (line) => {
          process.stdout.write("GOT:" + line + "\\n");
          rl.close();
          process.exit(0);
        });
      `,
    ],
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });

  const chunks: string[] = [];
  const reader = (async () => {
    const r = proc.stdout.getReader();
    const dec = new TextDecoder();
    while (true) {
      const { done, value } = await r.read();
      if (done) break;
      chunks.push(dec.decode(value));
    }
  })();

  const deadline = Date.now() + 3000;
  while (!chunks.join("").includes("BUSY") && Date.now() < deadline) {
    await Bun.sleep(10);
  }

  // inject while "busy" (sleeping, not reading)
  injectIntoStdin(proc.stdin, "ACCIDENTAL_SUBMIT_DURING_BUSY\n", {
    experimental: true,
  });
  try {
    proc.stdin.end();
  } catch {
    /* */
  }

  await proc.exited;
  await reader;
  const out = chunks.join("");
  // Buffered inject still arrives after idle — proves race risk
  const buffered =
    out.includes("BUSY") &&
    out.includes("IDLE") &&
    out.includes("GOT:ACCIDENTAL_SUBMIT_DURING_BUSY");
  return {
    id: "busy_sleep_then_read",
    passed: buffered,
    detail: buffered
      ? "inject during busy was buffered and applied later (TUI race risk confirmed on pipe model)"
      : `unexpected out=${JSON.stringify(out.slice(0, 240))}`,
  };
}

export function casePolicyBlocks(): SpikeCaseResult {
  const fake = {
    write() {
      throw new Error("should not write");
    },
  };
  const r = injectIntoStdin(fake, "x\n");
  const blocked = !r.ok && r.reason === "policy_blocked";
  return {
    id: "policy_blocks_without_flag",
    passed: blocked,
    detail: blocked
      ? "inject without experimental flag is policy_blocked"
      : `unexpected ${JSON.stringify(r)}`,
  };
}

export type SpikeReport = {
  phase: "1.5";
  ranAt: string;
  cases: SpikeCaseResult[];
  /** Product recommendation */
  verdict: {
    defaultPathInject: "no-go";
    experimentalOptIn: "deferred";
    rationale: string[];
  };
};

export async function runPtySpike(): Promise<SpikeReport> {
  const cases: SpikeCaseResult[] = [
    casePolicyBlocks(),
    await caseIdleLineReader(),
    await caseBusyThenRead(),
  ];
  return {
    phase: "1.5",
    ranAt: new Date().toISOString(),
    cases,
    verdict: {
      defaultPathInject: "no-go",
      experimentalOptIn: "deferred",
      rationale: [
        "Idle line-oriented stdin can receive inject (plumbing works).",
        "Inject during busy buffers and applies later → unintended submit risk on TUI agents.",
        "Claude/Codex/Grok are fullscreen TUIs (Ink/ratatui); R1 risk still applies — manual matrix in docs/spikes/PHASE-1.5-PTY.md.",
        "Default receive remains queue + check_handoffs / loom inbox (MCP pull).",
      ],
    },
  };
}

export function formatSpikeReport(report: SpikeReport): string {
  const lines = [
    `# Phase ${report.phase} PTY spike report`,
    `ranAt: ${report.ranAt}`,
    "",
    "## Cases",
  ];
  for (const c of report.cases) {
    lines.push(`- ${c.passed ? "PASS" : "FAIL"} \`${c.id}\` — ${c.detail}`);
  }
  lines.push("");
  lines.push("## Verdict");
  lines.push(
    `- defaultPathInject: **${report.verdict.defaultPathInject}**`,
  );
  lines.push(
    `- experimentalOptIn: **${report.verdict.experimentalOptIn}**`,
  );
  for (const r of report.verdict.rationale) {
    lines.push(`- ${r}`);
  }
  return lines.join("\n") + "\n";
}
