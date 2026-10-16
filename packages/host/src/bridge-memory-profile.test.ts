/**
 * PLAN 0.36.0 P4 — R16 (D5 · D8): the bridge hands the worker the profile it already resolved
 * and the `worker.memory` flag from its config. Checked by effect, with no seam: a real
 * in-process bridge (relay in-process, no herdr — headless skips it) runs a fake CLI that dumps
 * its stdin; the store the snapshot came from shows up in that stdin.
 * Run with HOME and LOOM_TEST_HOME pointing at the same temp dir (R17).
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
  wrapDispatchedPrompt,
} from "@loom/protocol";
import { RelayServer } from "@loom/relay";
import { defaultWorkerPermissions } from "./agent-argv";
import type { BridgeConfig } from "./bridge-config";
import { startBridgeRuntime } from "./bridge-runtime";
import { resolveBridgeProfile } from "./bridge-spawn";
import { cardSessionPath } from "./card-session-store";
import { composeMemoryWrapped, MEMORY_SNAPSHOT_FILE } from "./memory-inject";
import { agentKeyFor, appendMemoryEntry, humanMemorySource } from "./memory-store";
import { RelayClient } from "./relay-client";
import {
  type FableSession,
  loomDir,
  resetStateHomeDirCache,
  setActiveProfile,
} from "./session-store";

const PROMPT = "do the bridged memory task";

const FAKE_SH = `#!/bin/sh
kind="$1"; out="$2"; shift 2
n=1
while [ -e "$out/stdin-$kind-$n" ]; do n=$((n+1)); done
cat > "$out/stdin-$kind-$n"
printf '%s\\n' '{"type":"result","result":"done","is_error":false,"usage":{"input_tokens":1,"output_tokens":1}}'
`;

type CardResultView = { cardId?: string; status?: string; reason?: string };

describe("bridge → HeadlessDeps profile + memory wiring (PLAN 0.36.0 P4 · R16 · D8)", () => {
  const port = 32000 + Math.floor(Math.random() * 20000);
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "loom-p4-memprof-")));
  const cwd = join(dir, "work");
  const out = join(dir, "dump");
  const script = join(dir, "fake.sh");
  const sessionFile = join(dir, "session.json");
  const relay = new RelayServer({ host: "127.0.0.1", port });
  const saved = new Map<string, string | undefined>();
  let tower: RelayClient | null = null;
  let session: FableSession;
  let seq = 0;

  function setEnv(key: string, value: string | undefined): void {
    if (!saved.has(key)) saved.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
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
    relay.start();
    tower = new RelayClient({ url: `ws://127.0.0.1:${port}/ws` });
    const created = await tower.createRoom({
      roomName: "memory-profile",
      displayName: "tower",
      agentKind: "shell",
      peerId: "p_tower",
    });
    if (created.type !== "room.state") throw new Error("create failed");
    session = {
      roomId: created.roomId,
      roomName: created.roomName ?? "memory-profile",
      inviteCode: created.inviteCode ?? "",
      peerId: "p_node",
      displayName: "node/wsl-1",
      color: "#0f0",
      agentKind: "shell",
      relayUrl: `ws://127.0.0.1:${port}/ws`,
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(sessionFile, JSON.stringify(session), "utf8");
    // One project-scope entry per candidate store; only the bridge's own profile may show up.
    for (const profile of ["work", "default", "node/wsl-1"]) {
      const r = appendMemoryEntry(
        loomDir(),
        agentKeyFor(profile, "claude"),
        {
          body: `ENTRY-FOR-${profile}`,
          type: "fact",
          appliesTo: "project",
          status: "active",
          supersedes: null,
          source: humanMemorySource("owner"),
        },
        { env: {} },
      );
      if (!r.ok) throw new Error(`seed failed: ${r.message}`);
    }
  });

  afterAll(async () => {
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

  function config(memory?: unknown): BridgeConfig {
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
        ...(memory === undefined ? {} : { memory }),
      },
    } as BridgeConfig;
  }

  async function pollCardResult(cardId: string): Promise<CardResultView | null> {
    for (let i = 0; i < 75; i++) {
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

  /** Start a bridge, dispatch one claude card, wait for its result, stop the bridge. */
  async function runCard(opts: {
    profile?: string;
    memory?: unknown;
  }): Promise<{ stdin: string; cardDir: string }> {
    seq += 1;
    const cardId = `task_a0360a4000000${seq.toString(16).padStart(3, "0")}`;
    const before = new Set(readdirSync(out));
    // No `session` option: the bridge loads the session file, which keeps the peer secret it
    // saved on the first join.
    const bridge = await startBridgeRuntime({
      ...(opts.profile === undefined ? {} : { profile: opts.profile }),
      config: config(opts.memory),
      submitVerify: { waitMs: 50, retries: 0 },
      headlessAgentCommandOverride: {
        claude: ["/bin/sh", script, "claude", out],
        codex: ["/bin/sh", script, "codex", out],
        grok: ["/bin/sh", script, "grok", out],
      },
    });
    try {
      const ack = await tower!.handoff({
        to: "@node/wsl-1",
        body: buildDispatchBody({ title: "memory card", cardId, node: "node/wsl-1" }),
        mode: "task",
        attachments: [
          serializeCardAttachment(CARD_DISPATCH_LABEL, {
            v: CARD_CONTRACT_VERSION,
            cardId,
            sourceRoomId: session.roomId,
            prompt: PROMPT,
            agentKind: "claude" as const,
          }),
        ],
      });
      expect(["queued", "delivered"]).toContain(ack.status);
      const result = await pollCardResult(cardId);
      expect(result).not.toBeNull();
      // A finished headless card is proposed for verification (never auto-done).
      expect({ status: result!.status, reason: result!.reason }).toEqual({
        status: "failed",
        reason: "needs_verification",
      });
    } finally {
      await bridge.stop();
    }
    const fresh = readdirSync(out).filter((n) => !before.has(n) && n.startsWith("stdin-claude-"));
    expect(fresh.length).toBe(1);
    const cardDir = dirname(
      cardSessionPath({
        loomDir: loomDir(),
        localPeerId: session.peerId,
        roomId: session.roomId,
        agent: "claude",
        cardId,
      }),
    );
    return { stdin: readFileSync(join(out, fresh[0]!), "utf8"), cardDir };
  }

  test('profile "work" + memory.enabled → memory/claude.work in stdin, claude.default absent', async () => {
    const { stdin, cardDir } = await runCard({ profile: "work", memory: { enabled: true } });
    expect(stdin).toContain("ENTRY-FOR-work");
    expect(stdin).not.toContain("ENTRY-FOR-default");
    expect(stdin).not.toContain("ENTRY-FOR-node/wsl-1");
    const block = readFileSync(join(cardDir, MEMORY_SNAPSHOT_FILE), "utf8");
    expect(stdin).toBe(composeMemoryWrapped(PROMPT, block));
  }, 30_000);

  test("profile omitted → the store of resolveBridgeProfile(session), resolved once by the bridge", async () => {
    const resolved = resolveBridgeProfile(session);
    expect(resolved).toBe("node/wsl-1");
    const { stdin } = await runCard({ memory: { enabled: true } });
    expect(stdin).toContain(`ENTRY-FOR-${resolved}`);
    expect(stdin).not.toContain("ENTRY-FOR-default");
    expect(stdin).not.toContain("ENTRY-FOR-work");
  }, 30_000);

  test("bridge without worker.memory → stdin = 0.35 bytes, no memory-snapshot.md", async () => {
    const { stdin, cardDir } = await runCard({ profile: "work" });
    expect(stdin).toBe(wrapDispatchedPrompt(PROMPT));
    expect(existsSync(join(cardDir, MEMORY_SNAPSHOT_FILE))).toBe(false);
  }, 30_000);

  test("memory {enabled:false} → stdin = 0.35 bytes, no memory-snapshot.md", async () => {
    const { stdin, cardDir } = await runCard({ profile: "work", memory: { enabled: false } });
    expect(stdin).toBe(wrapDispatchedPrompt(PROMPT));
    expect(existsSync(join(cardDir, MEMORY_SNAPSHOT_FILE))).toBe(false);
  }, 30_000);
});
