/**
 * PLAN 0.38.0 P2 — bridge config `worker.memory.cardWrites` (D3 · R3) and the forced-skill start
 * check (D4 · R4). `parseMemory` accepts `cardWrites` (boolean, else
 * `worker.memory.cardWrites must be a boolean`); `cardWrites: true` needs `worker.memory.enabled:
 * true` and `worker.skills.enabled: true` — the same two cross-checks, in the same order and with
 * the same wording, in `loadBridgeConfig` (workerSectionFromRaw) and `readBridgeWorkerFlags`.
 * Pane / unknown backends ignore the key. `cardWrites: false` ≡ omitted (kept as written).
 * Bridge start: cardWrites + an enabled agent whose effective `skills.allow` list lacks
 * `loom-memory-candidates` → refused with the ② wording before herdr / room join.
 * Run with HOME and LOOM_TEST_HOME pointing at the same temp dir (R22).
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RelayServer } from "@loom/relay";
import { defaultWorkerPermissions } from "./agent-argv";
import {
  type BridgeConfig,
  bridgeConfigDir,
  bridgeConfigPath,
  loadBridgeConfig,
  readBridgeWorkerFlags,
  saveBridgeConfig,
} from "./bridge-config";
import { startBridgeRuntime } from "./bridge-runtime";
import { bridgeStatusPath, readBridgeStatusFileResult, truncateLastError } from "./bridge-status";
import { RelayClient } from "./relay-client";
import {
  type FableSession,
  loomDir,
  resetStateHomeDirCache,
  setActiveProfile,
} from "./session-store";

const ERR_CW_BOOLEAN = "worker.memory.cardWrites must be a boolean";
const ERR_NEEDS_MEMORY = "worker.memory.cardWrites requires worker.memory.enabled: true";
const ERR_NEEDS_SKILLS = "worker.memory.cardWrites requires worker.skills.enabled: true";
const refusal = (agent: string) =>
  `worker.memory.cardWrites: policy skills.allow does not include loom-memory-candidates for ${agent} — add it to policy.json skills.allow or turn cardWrites off`;

function thrown(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  return "";
}

describe("bridge config worker.memory.cardWrites (PLAN 0.38.0 P2 · D3 · R3)", () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "loom-p2-cardwrites-")));
  const saved = new Map<string, string | undefined>();
  function setEnv(key: string, value: string | undefined): void {
    if (!saved.has(key)) saved.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  beforeAll(() => {
    setEnv("LOOM_TEST_HOME", dir);
    setEnv("LOOM_SESSION", join(dir, "session.json"));
    setEnv("LOOM_PROFILE", undefined);
    resetStateHomeDirCache();
    setActiveProfile(null);
    mkdirSync(bridgeConfigDir(), { recursive: true });
  });
  afterAll(() => {
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    resetStateHomeDirCache();
    rmSync(dir, { recursive: true, force: true });
  });

  const headless = (extra: Record<string, unknown>) => ({
    backend: "headless",
    cwd: dir,
    allowedRoots: [dir],
    ...extra,
  });
  const save = (id: string, worker: unknown) =>
    writeFileSync(bridgeConfigPath(id), JSON.stringify({ worker }), "utf8");

  test("omitted → memory carried without a cardWrites key", () => {
    save("cw-absent", headless({ memory: { enabled: true }, skills: { enabled: true } }));
    const memory = loadBridgeConfig("cw-absent").worker?.memory;
    expect(memory).toEqual({ enabled: true });
    expect(memory && "cardWrites" in memory).toBe(false);
  });

  test("false ≡ omitted: accepted without memory or skills enabled, kept as written", () => {
    save("cw-false", headless({ memory: { enabled: false, cardWrites: false } }));
    expect(loadBridgeConfig("cw-false").worker?.memory).toEqual({
      enabled: false,
      cardWrites: false,
    });
    expect(thrown(() => readBridgeWorkerFlags(headless({ memory: { enabled: false, cardWrites: false } })))).toBe("");
  });

  test("true with memory and skills enabled → carried", () => {
    save("cw-on", headless({ memory: { enabled: true, cardWrites: true }, skills: { enabled: true } }));
    expect(loadBridgeConfig("cw-on").worker?.memory).toEqual({ enabled: true, cardWrites: true });
  });

  test("non-boolean cardWrites → exact error (load and flags)", () => {
    for (const [i, bad] of (["true", 1, null, [true], { on: true }] as const).entries()) {
      const worker = headless({ memory: { enabled: true, cardWrites: bad }, skills: { enabled: true } });
      save(`cw-bool-${i}`, worker);
      expect(thrown(() => loadBridgeConfig(`cw-bool-${i}`))).toBe(ERR_CW_BOOLEAN);
      expect(thrown(() => readBridgeWorkerFlags(worker))).toBe(ERR_CW_BOOLEAN);
    }
  });

  test("true without worker.memory.enabled: true → exact error", () => {
    const worker = headless({ memory: { enabled: false, cardWrites: true }, skills: { enabled: true } });
    save("cw-nomem", worker);
    expect(thrown(() => loadBridgeConfig("cw-nomem"))).toBe(ERR_NEEDS_MEMORY);
    expect(thrown(() => readBridgeWorkerFlags(worker))).toBe(ERR_NEEDS_MEMORY);
  });

  test("true with skills off or omitted → exact error", () => {
    for (const [i, skills] of ([{ enabled: false }, undefined] as const).entries()) {
      const worker = headless({
        memory: { enabled: true, cardWrites: true },
        ...(skills ? { skills } : {}),
      });
      save(`cw-noskills-${i}`, worker);
      expect(thrown(() => loadBridgeConfig(`cw-noskills-${i}`))).toBe(ERR_NEEDS_SKILLS);
      expect(thrown(() => readBridgeWorkerFlags(worker))).toBe(ERR_NEEDS_SKILLS);
    }
  });

  test("both missing → memory check first, in both readers (same order)", () => {
    const worker = headless({ memory: { enabled: false, cardWrites: true } });
    save("cw-both", worker);
    expect(thrown(() => loadBridgeConfig("cw-both"))).toBe(ERR_NEEDS_MEMORY);
    expect(thrown(() => readBridgeWorkerFlags(worker))).toBe(ERR_NEEDS_MEMORY);
  });

  test("readBridgeWorkerFlags parity: valid cardWrites config does not throw", () => {
    const flags = readBridgeWorkerFlags(
      headless({ memory: { enabled: true, cardWrites: true }, skills: { enabled: true } }),
    );
    expect(flags.backend).toBe("headless");
    expect(flags.memoryEnabled).toBe(true);
  });

  test("pane / unknown backend ignore cardWrites (no throw)", () => {
    for (const backend of ["pane", "other"]) {
      const worker = { backend, memory: { enabled: false, cardWrites: "junk" } };
      save(`cw-${backend}`, worker);
      expect(thrown(() => loadBridgeConfig(`cw-${backend}`))).toBe("");
      expect(readBridgeWorkerFlags(worker).backend).toBe("pane");
      const worker2 = { backend, memory: { enabled: false, cardWrites: true } };
      save(`cw-${backend}-2`, worker2);
      expect(thrown(() => loadBridgeConfig(`cw-${backend}-2`))).toBe("");
      expect(thrown(() => readBridgeWorkerFlags(worker2))).toBe("");
    }
  });

  test("loadBridgeConfig → saveBridgeConfig → loadBridgeConfig round-trip keeps cardWrites", () => {
    for (const cardWrites of [true, false]) {
      const id = `cw-rt-${cardWrites}`;
      save(id, headless({ memory: { enabled: true, cardWrites }, skills: { enabled: true } }));
      const first = loadBridgeConfig(id);
      saveBridgeConfig(id, first);
      const raw = JSON.parse(readFileSync(bridgeConfigPath(id), "utf8")) as {
        worker: { memory: unknown };
      };
      expect(raw.worker.memory).toEqual({ enabled: true, cardWrites });
      expect(loadBridgeConfig(id)).toEqual(first);
    }
  });
});

describe("bridge start — forced skill vs policy skills.allow (PLAN 0.38.0 P2 · D4 · R4)", () => {
  const port = 32000 + Math.floor(Math.random() * 20000);
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "loom-p2-forced-start-")));
  const cwd = join(dir, "work");
  const sessionFile = join(dir, "session.json");
  const relay = new RelayServer({ host: "127.0.0.1", port });
  const saved = new Map<string, string | undefined>();
  const logs: string[] = [];
  const origError = console.error;
  let tower: RelayClient | null = null;
  let session: FableSession;

  function setEnv(key: string, value: string | undefined): void {
    if (!saved.has(key)) saved.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  function setPolicy(skillsAllow: string[] | null): void {
    mkdirSync(loomDir(), { recursive: true });
    const skills = skillsAllow === null ? { allowScripts: [] } : { allow: skillsAllow, allowScripts: [] };
    writeFileSync(
      join(loomDir(), "policy.json"),
      JSON.stringify({ version: 1, shell: { deny: [] }, network: true, mcp: { deny: [] }, skills }),
    );
  }

  beforeAll(async () => {
    mkdirSync(cwd, { recursive: true });
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
      roomName: "cardwrites-start",
      displayName: "tower",
      agentKind: "shell",
      peerId: "p_tower",
    });
    if (created.type !== "room.state") throw new Error("create failed");
    session = {
      roomId: created.roomId,
      roomName: created.roomName ?? "cardwrites-start",
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
      agentArgv: { claude: ["claude"], codex: ["codex"], grok: ["grok"] },
      herdrProtocol: 17,
      worker: {
        backend: "headless",
        cwd,
        allowedRoots: [dir],
        timeoutMs: 30_000,
        permissions: defaultWorkerPermissions(),
        skills: { enabled: true },
        memory: { enabled: true, cardWrites: true },
        ...worker,
      },
    } as BridgeConfig;
  }

  /** Start; return the thrown message ("" when the start succeeded and was stopped). */
  async function tryStart(profile: string, peerId: string, cfg: BridgeConfig): Promise<string> {
    const sessionBefore = readFileSync(sessionFile);
    try {
      const started = await startBridgeRuntime({
        profile,
        session: { ...session, peerId, displayName: `node/${peerId}` },
        config: cfg,
        submitVerify: { waitMs: 50, retries: 0 },
      });
      await started.stop();
      return "";
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    } finally {
      writeFileSync(sessionFile, sessionBefore);
    }
  }

  async function peerIds(): Promise<string[]> {
    const peers = await tower!.listPeers();
    return peers.type === "room.state" ? peers.peers.map((p) => p.id) : [];
  }

  test("cardWrites + skills.allow list without the name → refused verbatim (first enabled agent) · lastError · no herdr · no room join", async () => {
    setPolicy(["loom-card-report"]);
    const from = logs.length;
    const message = await tryStart("cw-refused", "p_cw_refused", config());
    expect(message).toBe(refusal("claude"));
    const st = readBridgeStatusFileResult(bridgeStatusPath("cw-refused"));
    expect(st.kind).toBe("ok");
    if (st.kind === "ok") {
      expect(st.status.state).toBe("stopped");
      expect(st.status.lastError).toBe(truncateLastError(refusal("claude")));
      expect(st.status.herdr).toBe("down");
    }
    expect(logs.slice(from).some((l) => l.startsWith("[loom-bridge] herdr "))).toBe(false);
    expect(await peerIds()).not.toContain("p_cw_refused");
  }, 60_000);

  test("first enabled agent is named (claude disabled → codex)", async () => {
    setPolicy([]);
    const message = await tryStart(
      "cw-refused-codex",
      "p_cw_codex",
      config({ maxConcurrent: { claude: 0, codex: 1, grok: 1 } }),
    );
    expect(message).toBe(refusal("codex"));
    expect(await peerIds()).not.toContain("p_cw_codex");
  }, 60_000);

  test("skills.allow null (omitted) or listing the name → start succeeds", async () => {
    for (const [i, allow] of ([null, ["loom-card-report", "loom-memory-candidates"]] as const).entries()) {
      setPolicy(allow === null ? null : [...allow]);
      expect(await tryStart(`cw-ok-${i}`, `p_cw_ok_${i}`, config())).toBe("");
    }
  }, 60_000);

  test("cardWrites off → no check (allow list without the name still starts)", async () => {
    setPolicy(["loom-card-report"]);
    expect(
      await tryStart("cw-off", "p_cw_off", config({ memory: { enabled: true, cardWrites: false } })),
    ).toBe("");
  }, 60_000);
});
