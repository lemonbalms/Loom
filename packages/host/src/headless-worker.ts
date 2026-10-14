/**
 * PLAN 0.30.0 D2 happy path used by the stream capture test.
 * P3 SEED ONLY — not wired into bridge-runtime. Resume, adopt, timeout, concurrency, detached
 * spawn, transcript files and the R48-H1 env scrub land in P4/P5; do not wire this as is.
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { truncateTail, wrapDispatchedPrompt } from "@loom/protocol";
import {
  HEADLESS_WORKER_HINT,
  buildAgentArgv,
  type AgentKind,
  type WorkerConfig,
} from "./agent-argv";
import { parseAgentStream } from "./agent-stream-parsers";

const OUTPUT_CAP = 200_000;

export type HeadlessFlight = {
  workerId: string;
  cardId: string;
  agent: AgentKind;
  pid?: number;
  pgid?: number;
};

export type HeadlessDispatchCard = {
  roomId: string;
  cardId: string;
  agent: AgentKind;
  prompt: string;
  fromPeerId: string;
  dispatchHandoffId: string;
  cwd: string;
};

export type HeadlessResultFields = {
  status: "failed";
  reason: string;
  output: string;
  truncated: boolean;
  summary: string;
  note?: string;
};

type HeadlessCommand = { bin: string; args: string[] };

type HeadlessDeps = {
  config: WorkerConfig;
  loomDir: string;
  node: string;
  commands: Record<AgentKind, HeadlessCommand>;
  sink: {
    composeAndSend: (
      target: {
        cardId: string;
        fromPeerId: string;
        dispatchHandoffId: string;
        startedAt: string;
        paneId?: string;
      },
      fields: HeadlessResultFields,
      opts?: { node: string },
    ) => Promise<unknown>;
  };
};

function summaryLine(text: string): string {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length > 0) return trimmed.slice(0, 900);
  }
  return "";
}

function runCapture(
  bin: string,
  args: string[],
  cwd: string,
  stdinText: string,
): Promise<{ stdout: string; pid?: number }> {
  const child = spawn(bin, args, {
    cwd,
    env: process.env,
    shell: false,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const out: Buffer[] = [];
  child.stdout?.on("data", (chunk: Buffer) => {
    out.push(chunk);
  });
  child.stderr?.resume();
  child.stdin?.on("error", () => {
    /* child exited before stdin finished */
  });
  const closed = new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", () => resolve());
  });
  child.stdin?.end(stdinText);
  return closed.then(() => ({
    stdout: Buffer.concat(out).toString("utf8"),
    pid: child.pid,
  }));
}

export class HeadlessDispatcher {
  private readonly active: HeadlessFlight[] = [];

  constructor(private readonly deps: HeadlessDeps) {}

  flights(): HeadlessFlight[] {
    return [...this.active];
  }

  /** Counts only. Later phases fill these from the semaphore. */
  status(): {
    running: Record<AgentKind, number>;
    queueDepth: Record<AgentKind, number>;
  } {
    const running: Record<AgentKind, number> = { claude: 0, codex: 0, grok: 0 };
    for (const flight of this.active) running[flight.agent] += 1;
    return {
      running,
      queueDepth: { claude: 0, codex: 0, grok: 0 },
    };
  }

  /** Does not kill workers. */
  async close(): Promise<void> {}

  async dispatch(card: HeadlessDispatchCard): Promise<void> {
    const sessionId = randomUUID();
    const wrapped = wrapDispatchedPrompt(card.prompt);
    const promptFile = join(
      this.deps.loomDir,
      "cards",
      "prompt-files",
      `${card.cardId}.txt`,
    );
    if (card.agent === "grok") {
      mkdirSync(join(this.deps.loomDir, "cards", "prompt-files"), {
        recursive: true,
      });
      writeFileSync(promptFile, wrapped, { encoding: "utf8", mode: 0o600 });
    }
    const built = buildAgentArgv({
      agent: card.agent,
      cwd: card.cwd,
      sessionId,
      hint: HEADLESS_WORKER_HINT,
      prompt: card.prompt,
      promptFile: card.agent === "grok" ? promptFile : undefined,
      permissions: this.deps.config.permissions,
    });
    const command = this.deps.commands[card.agent];
    const flight: HeadlessFlight = {
      workerId: sessionId,
      cardId: card.cardId,
      agent: card.agent,
    };
    this.active.push(flight);
    const startedAt = new Date().toISOString();
    try {
      const captured = await runCapture(
        command.bin,
        [...command.args, ...built.argv],
        card.cwd,
        built.promptTransport === "stdin" ? wrapped : "",
      );
      flight.pid = captured.pid;
      flight.pgid = captured.pid;
      const parsed = parseAgentStream(card.agent, captured.stdout);
      const capped = truncateTail(parsed.finalText, OUTPUT_CAP);
      await this.deps.sink.composeAndSend(
        {
          cardId: card.cardId,
          fromPeerId: card.fromPeerId,
          dispatchHandoffId: card.dispatchHandoffId,
          startedAt,
        },
        {
          status: "failed",
          reason: "needs_verification",
          output: capped.text,
          truncated: capped.truncated,
          summary: summaryLine(capped.text),
        },
        { node: this.deps.node },
      );
    } finally {
      const index = this.active.indexOf(flight);
      if (index >= 0) this.active.splice(index, 1);
    }
  }
}
