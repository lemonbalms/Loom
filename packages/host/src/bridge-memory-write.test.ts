/**
 * PLAN 0.38.0 P3 — bridge → `HeadlessDeps.memory.cardWrites` (② `HeadlessDeps.memory` row).
 * Checked by effect, with no seam (0.36 `bridge-memory-profile.test.ts` shape): a real in-process
 * bridge (relay in-process, no herdr — headless skips it) runs a fake CLI whose final text carries
 * a `LOOM-MEMORY-CANDIDATES` block. On: the card copy holds the forced skill, the bridge's store
 * gets the proposals, notes.md exists. Off: none of it.
 * Run with HOME and LOOM_TEST_HOME pointing at the same temp dir (R22).
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
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
import { defaultWorkerPermissions } from "./agent-argv";
import type { BridgeConfig } from "./bridge-config";
import { startBridgeRuntime } from "./bridge-runtime";
import { cardSessionPath } from "./card-session-store";
import { agentKeyFor, memoryPaths } from "./memory-store";
import { RelayClient } from "./relay-client";
import { type FableSession, loomDir, resetStateHomeDirCache, setActiveProfile } from "./session-store";
import { verifyCardSkillsCopy } from "./skill-materialize";

const PROMPT = "do the bridged memory-write task";
const FINAL = [
  "Report: done.",
  "LOOM-MEMORY-CANDIDATES",
  "- fact: the bridge proposes card candidates",
  "LOOM-MEMORY-END",
  "LOOM-REPORT-END",
].join("\n");

const FAKE_SH = `#!/bin/sh
kind="$1"; out="$2"; shift 2
cat > /dev/null
cat "$out/stream"
`;

type CardResultView = { cardId?: string; status?: string; reason?: string; output?: string };

describe("bridge → HeadlessDeps.memory.cardWrites (PLAN 0.38.0 P3)", () => {
  const port = 32000 + Math.floor(Math.random() * 20000);
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "loom-p3-memwrite-")));
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
    writeFileSync(
      join(out, "stream"),
      `${JSON.stringify({ type: "result", result: FINAL, is_error: false, usage: { input_tokens: 1, output_tokens: 1 } })}\n`,
    );
    setEnv("LOOM_TEST_HOME", dir);
    setEnv("LOOM_SESSION", sessionFile);
    setEnv("LOOM_NO_AUTO_HOST", "1");
    setEnv("LOOM_PROFILE", undefined);
    resetStateHomeDirCache();
    setActiveProfile(null);
    relay.start();
    tower = new RelayClient({ url: `ws://127.0.0.1:${port}/ws` });
    const created = await tower.createRoom({
      roomName: "memory-write",
      displayName: "tower",
      agentKind: "shell",
      peerId: "p_tower",
    });
    if (created.type !== "room.state") throw new Error("create failed");
    session = {
      roomId: created.roomId,
      roomName: created.roomName ?? "memory-write",
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

  function config(memory: unknown): BridgeConfig {
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
        skills: { enabled: true },
        memory,
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
  async function runCard(memory: unknown): Promise<{ cardId: string; cardDir: string; result: CardResultView }> {
    seq += 1;
    const cardId = `task_a0380a3000000${seq.toString(16).padStart(3, "0")}`;
    const bridge = await startBridgeRuntime({
      profile: "work",
      config: config(memory),
      submitVerify: { waitMs: 50, retries: 0 },
      headlessAgentCommandOverride: {
        claude: ["/bin/sh", script, "claude", out],
        codex: ["/bin/sh", script, "codex", out],
        grok: ["/bin/sh", script, "grok", out],
      },
    });
    let result: CardResultView | null = null;
    try {
      const ack = await tower!.handoff({
        to: "@node/wsl-1",
        body: buildDispatchBody({ title: "memory-write card", cardId, node: "node/wsl-1" }),
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
      result = await pollCardResult(cardId);
      expect(result).not.toBeNull();
      expect({ status: result!.status, reason: result!.reason }).toEqual({
        status: "failed",
        reason: "needs_verification",
      });
    } finally {
      await bridge.stop();
    }
    const cardDir = dirname(
      cardSessionPath({
        loomDir: loomDir(),
        localPeerId: session.peerId,
        roomId: session.roomId,
        agent: "claude",
        cardId,
      }),
    );
    return { cardId, cardDir, result: result! };
  }

  const entries = () => memoryPaths(loomDir(), agentKeyFor("work", "claude")).entries;
  const cardLines = (): Array<{ body: string; status: string; source: { kind: string; by: string } }> =>
    existsSync(entries())
      ? readFileSync(entries(), "utf8")
          .split("\n")
          .filter((l) => l.trim() !== "")
          .map((l) => JSON.parse(l))
          .filter((l) => l.source?.kind === "card")
      : [];

  async function copyNames(cardId: string): Promise<string[]> {
    const v = await verifyCardSkillsCopy({
      loomDir: loomDir(),
      localPeerId: session.peerId,
      roomId: session.roomId,
      agent: "claude",
      cardId,
    });
    if (!v.ok) throw new Error(`card copy not ok: ${v.reason}`);
    return v.manifest.map((e) => e.name);
  }

  test("memory.enabled only (no cardWrites) → no forced skill, no proposals, no notes.md", async () => {
    const { cardId, cardDir } = await runCard({ enabled: true });
    expect(await copyNames(cardId)).toEqual([]);
    expect(existsSync(join(cardDir, "notes.md"))).toBe(false);
    expect(cardLines()).toEqual([]);
  }, 30_000);

  test("cardWrites: true → forced skill in the card copy, proposals in the bridge profile's store, notes.md", async () => {
    const { cardId, cardDir, result } = await runCard({ enabled: true, cardWrites: true });
    expect(await copyNames(cardId)).toEqual(["loom-memory-candidates"]);
    const lines = cardLines();
    expect(lines.length).toBe(1);
    expect(lines[0]!.body).toBe("the bridge proposes card candidates");
    expect(lines[0]!.status).toBe("proposed");
    expect(lines[0]!.source.by).toBe("p_tower");
    expect(readFileSync(join(cardDir, "notes.md"), "utf8")).toBe(FINAL);
    if (result.output !== undefined) expect(result.output).toContain("LOOM-MEMORY-CANDIDATES");
  }, 30_000);
});
