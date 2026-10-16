/**
 * PLAN 0.37.0 P3 — bridge start computes the policy gaps once (R4) and renders them:
 * one `warning: policy …` line per gap (D5 — renderGapWarning verbatim), `worker.strictEnforcement`
 * refuses to start with renderStrictRefusal verbatim before herdr / room join (D4(b) · R13), the
 * same Gap[] reaches the worker notice (HeadlessDeps.policyGaps) and `worker.rules.enabled` reaches
 * HeadlessDeps.rules. Pane backends compute nothing.
 *
 * Harness = `bridge-memory-profile.test.ts` shape: a real in-process bridge (relay in-process, no
 * herdr — headless skips it) runs a /bin/sh fake CLI that dumps its stdin. Bridge log lines are
 * captured from console.error ("[loom-bridge]" prefix). Run with HOME and LOOM_TEST_HOME pointing
 * at the same temp dir (R21).
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  buildDispatchBody,
  CARD_CONTRACT_VERSION,
  CARD_DISPATCH_LABEL,
  CARD_RESULT_LABEL,
  serializeCardAttachment,
} from "@loom/protocol";
import { RelayServer } from "@loom/relay";
import { type AgentKind, defaultWorkerPermissions } from "./agent-argv";
import type { BridgeConfig } from "./bridge-config";
import { startBridgeRuntime } from "./bridge-runtime";
import { bridgeStatusPath, readBridgeStatusFileResult } from "./bridge-status";
import { cardSessionPath } from "./card-session-store";
import { MEMORY_SNAPSHOT_FILE } from "./memory-inject";
import { resolveWorkerPolicy } from "./policy-compile";
import {
  type Gap,
  policyGaps,
  renderGapWarning,
  renderPolicyNotice,
  renderStrictRefusal,
} from "./policy-gaps";
import { RelayClient } from "./relay-client";
import {
  type FableSession,
  loomDir,
  resetStateHomeDirCache,
  setActiveProfile,
} from "./session-store";

const PROMPT = "do the policy honesty task";
const ALL: AgentKind[] = ["claude", "codex", "grok"];
const GAP_FREE_FOR_CLAUDE =
  '{"version":1,"shell":{"deny":[]},"network":true,"mcp":{"deny":[]},"skills":{"allowScripts":[]}}';

/** D5 example form, verbatim (② renderGapWarning — codex default). */
const CODEX_WARNING =
  "warning: policy shell.deny (11 rules) is not-enforced for codex — the worker is told in its prompt; nothing blocks it";
/** ② 안내문 섹션 — the codex default-policy line, verbatim. */
const CODEX_DEFAULT_LINE =
  "- policy shell.deny (11 rules) is not-enforced for codex — nothing blocks it. Do not run commands that match: `curl *`, `git clean`, `git clean *`, `git push`, `git push *`, `git reset --hard`, `git reset --hard *`, `rm *`, `rmdir *`, `sudo *`, `wget *`.";

const FAKE_SH = `#!/bin/sh
kind="$1"; out="$2"; shift 2
n=1
while [ -e "$out/stdin-$kind-$n" ]; do n=$((n+1)); done
cat > "$out/stdin-$kind-$n"
case "$kind" in
  claude) printf '%s\\n' '{"type":"result","result":"done","is_error":false,"usage":{"input_tokens":1,"output_tokens":1}}' ;;
  codex) printf '%s\\n' '{"type":"item.completed","item":{"type":"agent_message","text":"done"}}' '{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1}}' ;;
  grok) printf '%s\\n' '{"type":"text","data":"done"}' '{"type":"end","stopReason":"end_turn","usage":{"input_tokens":1,"output_tokens":1}}' ;;
esac
`;

type CardResultView = { cardId?: string; status?: string; reason?: string };

/** The gaps the bridge must compute for a config with default permissions and no policy.json. */
function defaultGaps(enabled: readonly AgentKind[] = ALL): Gap[] {
  return policyGaps(resolveWorkerPolicy(defaultWorkerPermissions(), null).effective, enabled);
}

describe("bridge start — policy gap warnings · strictEnforcement · notice/rules wiring (PLAN 0.37.0 P3)", () => {
  const port = 32000 + Math.floor(Math.random() * 20000);
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "loom-p3-honesty-")));
  const cwd = join(dir, "work");
  const out = join(dir, "dump");
  const script = join(dir, "fake.sh");
  const sessionFile = join(dir, "session.json");
  const relay = new RelayServer({ host: "127.0.0.1", port });
  const saved = new Map<string, string | undefined>();
  const logs: string[] = [];
  const origError = console.error;
  let tower: RelayClient | null = null;
  let session: FableSession;
  let seq = 0;

  function setEnv(key: string, value: string | undefined): void {
    if (!saved.has(key)) saved.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  /** Bridge log lines (prefix stripped) logged since `from`. */
  function bridgeLines(from: number): string[] {
    return logs
      .slice(from)
      .filter((l) => l.startsWith("[loom-bridge] "))
      .map((l) => l.slice("[loom-bridge] ".length));
  }
  const policyWarnings = (from: number) =>
    bridgeLines(from).filter((l) => l.startsWith("warning: policy "));

  const policyPath = () => join(loomDir(), "policy.json");
  function setPolicy(text: string | null): void {
    mkdirSync(loomDir(), { recursive: true });
    if (text === null) rmSync(policyPath(), { force: true });
    else writeFileSync(policyPath(), text);
  }

  beforeAll(async () => {
    for (const d of [cwd, out]) mkdirSync(d, { recursive: true });
    writeFileSync(script, FAKE_SH, { mode: 0o700 });
    setEnv("LOOM_TEST_HOME", dir);
    setEnv("LOOM_SESSION", sessionFile);
    setEnv("LOOM_NO_AUTO_HOST", "1");
    setEnv("LOOM_PROFILE", undefined);
    resetStateHomeDirCache();
    setActiveProfile(null);
    console.error = (...args: unknown[]) => {
      logs.push(args.map((a) => (a instanceof Error ? a.message : String(a))).join(" "));
    };
    relay.start();
    tower = new RelayClient({ url: `ws://127.0.0.1:${port}/ws` });
    const created = await tower.createRoom({
      roomName: "policy-honesty",
      displayName: "tower",
      agentKind: "shell",
      peerId: "p_tower",
    });
    if (created.type !== "room.state") throw new Error("create failed");
    session = {
      roomId: created.roomId,
      roomName: created.roomName ?? "policy-honesty",
      inviteCode: created.inviteCode ?? "",
      peerId: "p_node",
      displayName: "node/wsl-1",
      color: "#0f0",
      agentKind: "shell",
      relayUrl: `ws://127.0.0.1:${port}/ws`,
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(sessionFile, JSON.stringify(session), "utf8");
  });

  afterAll(async () => {
    console.error = origError;
    tower?.close();
    relay.stop();
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    resetStateHomeDirCache();
    setActiveProfile(null);
    rmSync(dir, { recursive: true, force: true });
  });

  function config(worker: Record<string, unknown> = {}): BridgeConfig {
    return {
      authorizedDispatchers: ["p_tower"],
      herdrSocketPath: join(dir, "no-herdr.sock"),
      agentArgv: { claude: ["claude"] },
      herdrProtocol: 17,
      worker: {
        backend: "headless",
        cwd,
        allowedRoots: [dir],
        timeoutMs: 30_000,
        permissions: defaultWorkerPermissions(),
        ...worker,
      },
    } as BridgeConfig;
  }

  const override = {
    claude: ["/bin/sh", script, "claude", out],
    codex: ["/bin/sh", script, "codex", out],
    grok: ["/bin/sh", script, "grok", out],
  };

  async function pollCardResult(cardId: string): Promise<CardResultView | null> {
    for (let i = 0; i < 100; i++) {
      await Bun.sleep(200);
      for (const entry of await tower!.listInbox()) {
        for (const attachment of entry.handoff.attachments ?? []) {
          if (attachment.label !== CARD_RESULT_LABEL) continue;
          const result = JSON.parse(attachment.content) as CardResultView;
          if (result.cardId === cardId) return result;
        }
      }
    }
    return null;
  }

  /** Dispatch one card to a running bridge; return its stdin dump and card dir. */
  async function runCard(agent: AgentKind): Promise<{ stdin: string; cardDir: string }> {
    seq += 1;
    const cardId = `task_a0370a3000000${seq.toString(16).padStart(3, "0")}`;
    const before = new Set(readdirSync(out));
    const ack = await tower!.handoff({
      to: "@node/wsl-1",
      body: buildDispatchBody({ title: "policy card", cardId, node: "node/wsl-1" }),
      mode: "task",
      attachments: [
        serializeCardAttachment(CARD_DISPATCH_LABEL, {
          v: CARD_CONTRACT_VERSION,
          cardId,
          sourceRoomId: session.roomId,
          prompt: PROMPT,
          agentKind: agent,
        }),
      ],
    });
    expect(["queued", "delivered"]).toContain(ack.status);
    const result = await pollCardResult(cardId);
    expect(result).not.toBeNull();
    const fresh = readdirSync(out).filter((n) => !before.has(n) && n.startsWith(`stdin-${agent}-`));
    expect(fresh.length).toBe(1);
    const cardDir = dirname(
      cardSessionPath({
        loomDir: loomDir(),
        localPeerId: session.peerId,
        roomId: session.roomId,
        agent,
        cardId,
      }),
    );
    return { stdin: readFileSync(join(out, fresh[0]!), "utf8"), cardDir };
  }

  test("default policy → one warning line per gap (6 · renderGapWarning verbatim, in order) · start succeeds · codex stdin carries the notice", async () => {
    setPolicy(null);
    const expected = defaultGaps().map(renderGapWarning);
    expect(expected).toHaveLength(6);
    expect(expected).toContain(CODEX_WARNING);
    const from = logs.length;
    const bridge = await startBridgeRuntime({
      profile: "honesty-default",
      config: config(),
      submitVerify: { waitMs: 50, retries: 0 },
      headlessAgentCommandOverride: override,
    });
    try {
      expect(policyWarnings(from)).toEqual(expected);
      const { stdin, cardDir } = await runCard("codex");
      const notice = renderPolicyNotice(defaultGaps().filter((g) => g.agent === "codex"));
      expect(stdin).toContain(notice);
      expect(stdin).toContain(CODEX_DEFAULT_LINE);
      expect(stdin).not.toContain("for claude");
      expect(stdin).not.toContain("for grok");
      // rules off by default → no rules section
      expect(stdin).not.toContain("## Standing rules");
      expect(readFileSync(join(cardDir, MEMORY_SNAPSHOT_FILE), "utf8")).toContain(notice);
    } finally {
      await bridge.stop();
    }
  }, 60_000);

  test("strict + default policy → start refused with renderStrictRefusal verbatim · lastError · no warnings · no herdr · no room join", async () => {
    setPolicy(null);
    const refusal = renderStrictRefusal(defaultGaps());
    const profile = "honesty-strict";
    const strictSession: FableSession = {
      ...session,
      peerId: "p_strict",
      displayName: "node/strict",
    };
    const from = logs.length;
    // A start that is not refused would join as p_strict and save that session to LOOM_SESSION:
    // stop it and restore the file so later tests keep their own peer.
    const sessionBefore = readFileSync(sessionFile);
    let message = "";
    try {
      const started = await startBridgeRuntime({
        profile,
        session: strictSession,
        config: config({ strictEnforcement: true }),
        submitVerify: { waitMs: 50, retries: 0 },
        headlessAgentCommandOverride: override,
      });
      await started.stop();
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    } finally {
      writeFileSync(sessionFile, sessionBefore);
    }
    expect(message).toBe(refusal);
    const st = readBridgeStatusFileResult(bridgeStatusPath(profile));
    expect(st.kind).toBe("ok");
    if (st.kind === "ok") {
      expect(st.status.state).toBe("stopped");
      expect(st.status.lastError).toBe(refusal);
      expect(st.status.herdr).toBeUndefined();
    }
    // The refusal replaces the warning loop (② bridge 기동).
    expect(policyWarnings(from)).toEqual([]);
    expect(bridgeLines(from).some((l) => l.startsWith("herdr "))).toBe(false);
    const peers = await tower!.listPeers();
    expect(peers.type).toBe("room.state");
    if (peers.type === "room.state") {
      expect(peers.peers.map((p) => p.peerId)).not.toContain("p_strict");
    }
  }, 60_000);

  test("strict + network:true + codex·grok maxConcurrent 0 → start succeeds, zero policy warnings", async () => {
    setPolicy(GAP_FREE_FOR_CLAUDE);
    try {
      const from = logs.length;
      const bridge = await startBridgeRuntime({
        profile: "honesty-strict-pass",
        config: config({ strictEnforcement: true, maxConcurrent: { codex: 0, grok: 0 } }),
        submitVerify: { waitMs: 50, retries: 0 },
        headlessAgentCommandOverride: override,
      });
      try {
        expect(policyWarnings(from)).toEqual([]);
        expect(bridgeLines(from).some((l) => l.includes("strictEnforcement"))).toBe(false);
      } finally {
        await bridge.stop();
      }
    } finally {
      setPolicy(null);
    }
  }, 60_000);

  test("disabled agents are left out of the warnings (maxConcurrent.codex 0 → claude · grok gaps only)", async () => {
    setPolicy(null);
    const expected = defaultGaps(["claude", "grok"]).map(renderGapWarning);
    expect(expected).toHaveLength(4);
    const from = logs.length;
    const bridge = await startBridgeRuntime({
      profile: "honesty-nocodex",
      config: config({ maxConcurrent: { codex: 0 } }),
      submitVerify: { waitMs: 50, retries: 0 },
      headlessAgentCommandOverride: override,
    });
    try {
      expect(policyWarnings(from)).toEqual(expected);
    } finally {
      await bridge.stop();
    }
  }, 60_000);

  test("pane backend + strictEnforcement key → ignored: no gap computation, no warnings, no strict refusal", async () => {
    setPolicy(null);
    const from = logs.length;
    let message = "";
    try {
      const bridge = await startBridgeRuntime({
        profile: "honesty-pane",
        config: {
          ...config(),
          worker: { backend: "pane", strictEnforcement: true } as unknown as BridgeConfig["worker"],
        },
        submitVerify: { waitMs: 50, retries: 0 },
      });
      await bridge.stop();
    } catch (e) {
      // No herdr in the test: a pane bridge fails at the herdr ping — never at the strict check.
      message = e instanceof Error ? e.message : String(e);
    }
    expect(message).not.toContain("strictEnforcement");
    expect(policyWarnings(from)).toEqual([]);
  }, 60_000);

  test("worker.rules.enabled → the rules section reaches the worker stdin (scope filter applied)", async () => {
    setPolicy(GAP_FREE_FOR_CLAUDE);
    const rulesDir = join(loomDir(), "rules");
    mkdirSync(rulesDir, { recursive: true });
    writeFileSync(
      join(rulesDir, "p3-all.md"),
      "---\nid: p3-all\nscope: all\npriority: 100\n---\nRULE-P3-ALL body\n",
    );
    writeFileSync(
      join(rulesDir, "p3-codex.md"),
      "---\nid: p3-codex\nscope: codex\npriority: 100\n---\nRULE-P3-CODEX body\n",
    );
    try {
      const bridge = await startBridgeRuntime({
        profile: "honesty-rules",
        config: config({ rules: { enabled: true } }),
        submitVerify: { waitMs: 50, retries: 0 },
        headlessAgentCommandOverride: override,
      });
      try {
        const { stdin, cardDir } = await runCard("claude");
        expect(stdin).toContain("## Standing rules\n");
        expect(stdin).toContain("### report-blockers\n");
        expect(stdin).toContain("### p3-all\nRULE-P3-ALL body");
        expect(stdin).not.toContain("RULE-P3-CODEX");
        // gap-free for claude → no notice section
        expect(stdin).not.toContain("## Loom policy notice");
        expect(existsSync(join(cardDir, MEMORY_SNAPSHOT_FILE))).toBe(true);
      } finally {
        await bridge.stop();
      }
    } finally {
      rmSync(rulesDir, { recursive: true, force: true });
      setPolicy(null);
    }
  }, 60_000);
});
