/**
 * PLAN 0.32.0 P4 — D8 · R7 (as amended by R50-M2) · Done-when (g).
 * L-2 fromPeerId check: dispatch_card records `dispatchPeerId` only when the local peer
 * list has EXACTLY ONE peer whose display name matches `node`; apply_card_result rejects
 * a fromPeerId that differs from the recorded one, and keeps today's behaviour (plus one
 * stderr `l2_unverifiable` line) when either side is absent. Results still land `blocked`.
 * `dispatchPeerId` is a local board field only — never in snapshots / wire.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CARD_CONTRACT_VERSION, ClientPeerSchema } from "@loom/protocol";
import { RelayServer } from "@loom/relay";
import * as cardOps from "./card-ops";
import { RelayClient } from "./relay-client";
import {
  type FableSession,
  loomDir,
  resetStateHomeDirCache,
  setActiveProfile,
} from "./session-store";
import * as board from "./task-board";

type Peer = { id: string; displayName: string };
type ResolveFn = (peers: Peer[], node: string) => string | undefined;

function resolveDispatchPeerId(peers: Peer[], node: string): string | undefined {
  const fn = (cardOps as unknown as { resolveDispatchPeerId?: ResolveFn }).resolveDispatchPeerId;
  expect(typeof fn).toBe("function");
  return (fn as ResolveFn)(peers, node);
}

/** updateTask patch with the additive local field (cast keeps the red commit type-clean at call sites). */
function setDispatchPeerId(taskId: string, peerId: string | null): board.TaskItem {
  return board.updateTask(
    taskId,
    { dispatchPeerId: peerId } as unknown as Parameters<typeof board.updateTask>[1],
  );
}

/** Round 1 M (exact pin): same id rule as ClientPeerSchema.id + exact round-trip. */
function isPinnablePeerId(id: string): boolean {
  const fn = (board as unknown as { isPinnablePeerId?: (id: string) => boolean }).isPinnablePeerId;
  expect(typeof fn).toBe("function");
  return (fn as (id: string) => boolean)(id);
}

type DispatchHooks = { afterPeerLookup?: () => Promise<void> | void };
function dispatchHooks(): DispatchHooks {
  const hooks = (cardOps as unknown as { dispatchCardTestHooks?: DispatchHooks }).dispatchCardTestHooks;
  expect(hooks).toBeDefined();
  return hooks as DispatchHooks;
}

/** 82 chars — longer than the old 64-char storage cap; ClientPeerSchema.id has no max. */
const LONG_PEER_ID = `p_${"a1b2c3d4e5".repeat(8)}`;

function dispatchPeerIdOf(task: board.TaskItem | undefined): string | undefined {
  return (task as (board.TaskItem & { dispatchPeerId?: string }) | undefined)?.dispatchPeerId;
}

function result(cardId: string, node: string, seq: number): string {
  return JSON.stringify({
    v: CARD_CONTRACT_VERSION,
    cardId,
    status: "done",
    node,
    seq,
    output: "out",
    summary: "sum",
    finishedAt: new Date().toISOString(),
  });
}

describe("resolveDispatchPeerId — exactly one display-name match (R50-M2)", () => {
  const peers: Peer[] = [
    { id: "p_one", displayName: "node/one" },
    { id: "p_dup_a", displayName: "dup" },
    { id: "p_dup_b", displayName: "DUP" },
    { id: "p_tower", displayName: "tower" },
  ];

  test("one match → its peer id (case-insensitive, leading @ ignored, like relay findPeerByName)", () => {
    expect(resolveDispatchPeerId(peers, "node/one")).toBe("p_one");
    expect(resolveDispatchPeerId(peers, "@node/one")).toBe("p_one");
    expect(resolveDispatchPeerId(peers, "NODE/ONE")).toBe("p_one");
  });

  test("zero matches → undefined", () => {
    expect(resolveDispatchPeerId(peers, "node/ghost")).toBeUndefined();
    expect(resolveDispatchPeerId([], "node/one")).toBeUndefined();
  });

  test("two or more matches (ambiguous display name) → undefined", () => {
    expect(resolveDispatchPeerId(peers, "dup")).toBeUndefined();
  });

  test("a peer id is not a display name", () => {
    expect(resolveDispatchPeerId(peers, "p_one")).toBeUndefined();
  });

  test("82-char peer id resolves exactly (no truncation)", () => {
    expect(LONG_PEER_ID).toHaveLength(82);
    expect(resolveDispatchPeerId([{ id: LONG_PEER_ID, displayName: "node/long" }], "node/long")).toBe(
      LONG_PEER_ID,
    );
  });

  test("a unique match whose id would not round-trip exactly is not pinned", () => {
    expect(resolveDispatchPeerId([{ id: "p_bad\u0007id", displayName: "node/bad" }], "node/bad")).toBeUndefined();
  });
});

describe("isPinnablePeerId — same limit as ClientPeerSchema.id, exact round-trip only", () => {
  test("agrees with ClientPeerSchema.shape.id for well-formed ids (incl. 82 chars) and rejects empty", () => {
    for (const id of ["p_x", "p_tower", LONG_PEER_ID, "x".repeat(4096)]) {
      expect(ClientPeerSchema.shape.id.safeParse(id).success).toBe(true);
      expect(isPinnablePeerId(id)).toBe(true);
    }
    expect(ClientPeerSchema.shape.id.safeParse("").success).toBe(false);
    expect(isPinnablePeerId("")).toBe(false);
  });

  test("ids the board sanitizer would alter are never pinned (no lossy pin)", () => {
    expect(isPinnablePeerId("p_ctl\u0001x")).toBe(false);
    expect(isPinnablePeerId("p_esc\u001b[31mx")).toBe(false);
    expect(isPinnablePeerId("p_del\u007fx")).toBe(false);
  });
});

describe("apply_card_result L-2 fromPeerId vs dispatchPeerId", () => {
  const dir = join(tmpdir(), `loom-card-l2-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const sessionFile = join(dir, "session.json");
  let stderrLines: string[] = [];
  let stderrSpy: ReturnType<typeof spyOn> | null = null;

  beforeAll(() => {
    mkdirSync(dir, { recursive: true });
    process.env.LOOM_TEST_HOME = dir;
    process.env.LOOM_SESSION = sessionFile;
    resetStateHomeDirCache();
    setActiveProfile(null);
    const session: FableSession = {
      roomId: "room_card_l2",
      roomName: "card-l2",
      inviteCode: "LOOM-TEST",
      peerId: "p_tower",
      displayName: "tower",
      color: "#fff",
      agentKind: "claude",
      relayUrl: "ws://127.0.0.1:1/ws",
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(sessionFile, JSON.stringify(session), "utf8");
  });

  beforeEach(() => {
    stderrLines = [];
    stderrSpy = spyOn(process.stderr, "write").mockImplementation(((chunk: unknown) => {
      stderrLines.push(String(chunk));
      return true;
    }) as typeof process.stderr.write);
  });

  afterEach(() => {
    stderrSpy?.mockRestore();
    stderrSpy = null;
  });

  afterAll(() => {
    delete process.env.LOOM_TEST_HOME;
    delete process.env.LOOM_SESSION;
    resetStateHomeDirCache();
    rmSync(dir, { recursive: true, force: true });
  });

  test("82-char pin is stored and read back exactly", () => {
    const task = board.addTask({ title: "long-pin", assignee: "node/long", status: "doing" });
    expect(dispatchPeerIdOf(setDispatchPeerId(task.id, LONG_PEER_ID))).toBe(LONG_PEER_ID);
    expect(dispatchPeerIdOf(board.findTask(task.id))).toBe(LONG_PEER_ID);
    const r = cardOps.applyCardResult({
      resultJson: result(task.id, "node/long", 1),
      fromPeerId: LONG_PEER_ID,
    });
    expect(r.ok).toBe(true);
  });

  test("a pin that would not round-trip exactly is dropped, never truncated or altered", () => {
    const task = board.addTask({ title: "bad-pin", assignee: "node/one", status: "doing" });
    expect(dispatchPeerIdOf(setDispatchPeerId(task.id, "p_bad\u0007id"))).toBeUndefined();
    expect(dispatchPeerIdOf(board.findTask(task.id))).toBeUndefined();
  });

  test("updateTask persists dispatchPeerId; null clears it", () => {
    const task = board.addTask({ title: "persist", assignee: "node/one", status: "doing" });
    expect(dispatchPeerIdOf(setDispatchPeerId(task.id, "p_one"))).toBe("p_one");
    expect(dispatchPeerIdOf(board.findTask(task.id))).toBe("p_one");
    expect(dispatchPeerIdOf(setDispatchPeerId(task.id, null))).toBeUndefined();
    expect(dispatchPeerIdOf(board.findTask(task.id))).toBeUndefined();
  });

  test("recorded + fromPeerId differs → rejected `L-2: fromPeerId (…) does not match dispatch target (…)`; board untouched; audit l2_from_peer", () => {
    const task = board.addTask({ title: "mismatch", assignee: "node/one", status: "doing" });
    setDispatchPeerId(task.id, "p_one");
    const r = cardOps.applyCardResult({
      resultJson: result(task.id, "node/one", 1),
      fromPeerId: "p_evil",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("L-2: fromPeerId (p_evil) does not match dispatch target (p_one)");
    }
    expect(board.findTask(task.id)?.status).toBe("doing");

    const rooms = readdirSync(join(loomDir(), "rooms"));
    expect(rooms).toHaveLength(1);
    const auditPath = join(loomDir(), "rooms", rooms[0] as string, "policy-audit.jsonl");
    expect(existsSync(auditPath)).toBe(true);
    const lines = readFileSync(auditPath, "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(lines.at(-1)).toMatchObject({
      kind: "refused",
      tool: "apply_card_result",
      reason: "l2_from_peer",
      peerId: "p_tower",
      roomId: "room_card_l2",
      cardId: task.id,
    });
    expect(stderrLines.join("")).toContain("reason=l2_from_peer");
  });

  test("recorded + fromPeerId matches → lands blocked (never done), no l2_unverifiable", () => {
    const task = board.addTask({ title: "match", assignee: "node/one", status: "doing" });
    setDispatchPeerId(task.id, "p_one");
    const r = cardOps.applyCardResult({
      resultJson: result(task.id, "node/one", 1),
      fromPeerId: "p_one",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.status).toBe("blocked");
    expect(stderrLines.join("")).not.toContain("l2_unverifiable");
  });

  test("no record (legacy / ambiguous dispatch) + fromPeerId → today's behaviour + one l2_unverifiable line", () => {
    const task = board.addTask({ title: "legacy", assignee: "node/one", status: "doing" });
    const r = cardOps.applyCardResult({
      resultJson: result(task.id, "node/one", 1),
      fromPeerId: "p_anyone",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.status).toBe("blocked");
    const hits = stderrLines.filter((l) => l.includes("l2_unverifiable"));
    expect(hits).toHaveLength(1);
  });

  test("record present + fromPeerId omitted → today's behaviour + one l2_unverifiable line", () => {
    const task = board.addTask({ title: "omitted", assignee: "node/one", status: "doing" });
    setDispatchPeerId(task.id, "p_one");
    const r = cardOps.applyCardResult({ resultJson: result(task.id, "node/one", 1) });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.status).toBe("blocked");
    expect(stderrLines.filter((l) => l.includes("l2_unverifiable"))).toHaveLength(1);
  });

  test("existing node/assignee L-2 guard still runs first", () => {
    const task = board.addTask({ title: "node-first", assignee: "node/one", status: "doing" });
    setDispatchPeerId(task.id, "p_one");
    const r = cardOps.applyCardResult({
      resultJson: result(task.id, "node/evil", 1),
      fromPeerId: "p_one",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("L-2: result.node");
  });

  test("dispatchPeerId is local-only: export / attachments / import never carry it", () => {
    const task = board.addTask({ title: "local-only", assignee: "node/one", status: "doing" });
    setDispatchPeerId(task.id, "p_one");
    const snap = board.exportBoardSnapshot();
    expect(JSON.stringify(snap)).not.toContain("dispatchPeerId");
    const loaded = board.loadTaskBoard();
    expect(loaded).not.toBeNull();
    expect(JSON.stringify(board.boardToAttachments(loaded as board.TaskBoard))).not.toContain(
      "dispatchPeerId",
    );

    const forged = {
      ...snap,
      tasks: snap.tasks.map((t) => (t.id === task.id ? { ...t, dispatchPeerId: "p_forged" } : t)),
    };
    const parsed = board.parseBoardSnapshot(forged);
    expect(JSON.stringify(parsed)).not.toContain("p_forged");
  });
});

describe("dispatch_card records dispatchPeerId only on exactly one name match (in-process relay)", () => {
  const port = 24400 + Math.floor(Math.random() * 300);
  const dir = join(tmpdir(), `loom-card-l2-relay-${Date.now()}`);
  const sessionFile = join(dir, "tower-session.json");
  const relay = new RelayServer({ host: "127.0.0.1", port });
  const clients: RelayClient[] = [];
  const peerIds: Record<string, string> = {};
  const inviteCodeRef = { value: "" };

  async function join_(displayName: string, inviteCode: string): Promise<string> {
    const peerId = `p_${displayName.replace(/[^a-z0-9]/gi, "")}_${Math.random().toString(36).slice(2, 8)}`;
    const c = new RelayClient({ url: `ws://127.0.0.1:${port}/ws` });
    const joined = await c.joinRoom({ inviteCode, displayName, agentKind: "shell", peerId });
    if (joined.type === "error") throw new Error(`join failed: ${joined.message}`);
    clients.push(c);
    return peerId;
  }

  beforeAll(async () => {
    mkdirSync(dir, { recursive: true });
    process.env.LOOM_NO_AUTO_HOST = "1";
    process.env.LOOM_TEST_HOME = dir;
    process.env.LOOM_SESSION = sessionFile;
    resetStateHomeDirCache();
    setActiveProfile(null);
    relay.start();

    const bootstrap = new RelayClient({ url: `ws://127.0.0.1:${port}/ws` });
    const created = await bootstrap.createRoom({
      roomName: "card-l2",
      displayName: "tower",
      agentKind: "shell",
      peerId: "p_tower",
    });
    if (created.type !== "room.state") throw new Error("create failed");
    const inviteCode = created.inviteCode ?? "";
    inviteCodeRef.value = inviteCode;
    const towerSecret = created.peerSecret ?? bootstrap.peerSecret;
    bootstrap.close();
    const session: FableSession = {
      roomId: created.roomId,
      roomName: "card-l2",
      inviteCode,
      peerId: "p_tower",
      displayName: "tower",
      color: "#fff",
      agentKind: "shell",
      relayUrl: `ws://127.0.0.1:${port}/ws`,
      peerSecret: towerSecret ?? undefined,
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(sessionFile, JSON.stringify(session), "utf8");

    peerIds.one = await join_("node/one", inviteCode);
    peerIds.dupA = await join_("node/dup", inviteCode);
    peerIds.dupB = await join_("node/dup", inviteCode);
  });

  afterAll(() => {
    for (const c of clients) c.close();
    relay.stop();
    delete process.env.LOOM_TEST_HOME;
    delete process.env.LOOM_SESSION;
    delete process.env.LOOM_NO_AUTO_HOST;
    resetStateHomeDirCache();
    rmSync(dir, { recursive: true, force: true });
  });

  test("unique name → recorded; re-dispatch to an ambiguous name → cleared; apply mismatch rejected", async () => {
    const task = board.addTask({ title: "relay-dispatch", status: "todo" });

    const first = await cardOps.dispatchCard({ taskId: task.id, node: "node/one", prompt: "p" });
    expect(first.ok).toBe(true);
    expect(dispatchPeerIdOf(board.findTask(task.id))).toBe(peerIds.one);

    const mismatch = cardOps.applyCardResult({
      resultJson: result(task.id, "node/one", 1),
      fromPeerId: peerIds.dupA,
    });
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) expect(mismatch.error).toContain("L-2: fromPeerId");

    const ok = cardOps.applyCardResult({
      resultJson: result(task.id, "node/one", 2),
      fromPeerId: peerIds.one,
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.status).toBe("blocked");

    const second = await cardOps.dispatchCard({ taskId: task.id, node: "node/dup", prompt: "p" });
    expect(second.ok).toBe(true);
    expect(dispatchPeerIdOf(board.findTask(task.id))).toBeUndefined();
  }, 30_000);

  test("pinned dispatch is routed to the pinned peer id (handoff.to === peerId)", async () => {
    const task = board.addTask({ title: "route-by-id", status: "todo" });
    const r = await cardOps.dispatchCard({ taskId: task.id, node: "node/one", prompt: "p" });
    expect(r.ok).toBe(true);
    const inbox = await (clients[0] as RelayClient).listInbox();
    const entry = inbox.find((e) => e.handoff.body.includes(task.id));
    expect(entry).toBeDefined();
    expect(entry?.handoff.to).toBe(peerIds.one);
  }, 30_000);

  test("race: lookup pins offline p_a, same-name p_b joins before send → still routed to p_a; p_a's result lands", async () => {
    const offline = new RelayClient({ url: `ws://127.0.0.1:${port}/ws` });
    const aId = `p_racea_${Math.random().toString(36).slice(2, 8)}`;
    const joinedA = await offline.joinRoom({
      inviteCode: inviteCodeRef.value,
      displayName: "node/race",
      agentKind: "shell",
      peerId: aId,
    });
    expect(joinedA.type).not.toBe("error");
    offline.close();
    await Bun.sleep(100);

    let bClient: RelayClient | null = null;
    const hooks = dispatchHooks();
    hooks.afterPeerLookup = async () => {
      bClient = new RelayClient({ url: `ws://127.0.0.1:${port}/ws` });
      clients.push(bClient);
      await bClient.joinRoom({
        inviteCode: inviteCodeRef.value,
        displayName: "node/race",
        agentKind: "shell",
        peerId: `p_raceb_${Math.random().toString(36).slice(2, 8)}`,
      });
    };
    try {
      const task = board.addTask({ title: "race", status: "todo" });
      const r = await cardOps.dispatchCard({ taskId: task.id, node: "node/race", prompt: "p" });
      expect(r.ok).toBe(true);
      expect(dispatchPeerIdOf(board.findTask(task.id))).toBe(aId);
      expect(bClient).not.toBeNull();
      const bInbox = await (bClient as unknown as RelayClient).listInbox();
      expect(bInbox.some((e) => e.handoff.body.includes(task.id))).toBe(false);

      const landed = cardOps.applyCardResult({
        resultJson: result(task.id, "node/race", 1),
        fromPeerId: aId,
      });
      expect(landed.ok).toBe(true);
      if (landed.ok) expect(landed.status).toBe("blocked");
    } finally {
      hooks.afterPeerLookup = undefined;
    }
  }, 30_000);
});
