/**
 * PLAN 0.32.0 P4 — D8 · R7 (as amended by R50-M2) · Done-when (g), with the P4 verify
 * round 2 fable-advisor ruling (L-2 is fail-visible, never a reject):
 * - routing is identical to 0.31.0 (dispatch handoff `to` = `@node` name);
 * - `dispatchPeerId` is pinned only when exactly one local peer matches `node` (checked
 *   before AND after the send, same id) and the id is canonical (non-empty, trimmed,
 *   ≤ 64, no control chars, not a relay wildcard, sanitize-stable);
 * - compare: pin vs `fromPeerId` after the inbox/claim sanitize (sanitizeHandoffForOutput);
 * - mismatch → result still lands `blocked` + fixed note + audit `l2_mismatch` (no ids);
 *   either side absent → today's behaviour + one stderr `l2_unverifiable` line.
 * `dispatchPeerId` is a local board field only — never in snapshots / wire / MCP output.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CARD_CONTRACT_VERSION, sanitizeHandoffForOutput, sanitizePeerText } from "@loom/protocol";
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

/** Round 3 (M4): a mismatch is a local-only card flag; notes stay byte-identical to 0.31.0. */
function flagOf(task: board.TaskItem | undefined): true | undefined {
  return (task as (board.TaskItem & { l2Mismatch?: true }) | undefined)?.l2Mismatch;
}

/** The 0.31.0 apply_card_result notes, verbatim from a2e0d99 card-ops.ts + normalizeTask. */
function notes031(p: {
  summary: string;
  status: "done" | "failed";
  reason?: string;
  note?: string;
  seq: number;
}): string {
  const reason =
    p.status === "done"
      ? " failed reason=legacy_remote_done_requires_verification"
      : p.status === "failed" && p.reason
        ? ` failed reason=${p.reason}`
        : "";
  const lastSeqToken = ` last_seq=${p.seq}`;
  const notePart = p.note && p.note.length > 0 ? ` ${p.note}` : "";
  const headBudget = Math.max(0, 1000 - lastSeqToken.length);
  let head = `${p.summary}${reason}${notePart}`;
  if (head.length > headBudget) head = head.slice(0, headBudget);
  return sanitizePeerText(`${head}${lastSeqToken}`).slice(0, 1000);
}

function failedResult(cardId: string, node: string, seq: number, summary: string, reason: string, note?: string): string {
  return JSON.stringify({
    v: CARD_CONTRACT_VERSION,
    cardId,
    status: "failed",
    node,
    seq,
    output: "out",
    summary,
    reason,
    ...(note === undefined ? {} : { note }),
    finishedAt: new Date().toISOString(),
  });
}

function resolveDispatchPeerId(peers: Peer[], node: string): string | undefined {
  return cardOps.resolveDispatchPeerId(peers, node);
}

function isCanonicalPeerId(id: string): boolean {
  const fn = (board as unknown as { isCanonicalPeerId?: (id: string) => boolean }).isCanonicalPeerId;
  expect(typeof fn).toBe("function");
  return (fn as (id: string) => boolean)(id);
}

type DispatchHooks = { afterPeerLookup?: () => Promise<void> | void };
function dispatchHooks(): DispatchHooks {
  const hooks = (cardOps as unknown as { dispatchCardTestHooks?: DispatchHooks })
    .dispatchCardTestHooks;
  expect(hooks).toBeDefined();
  return hooks as DispatchHooks;
}

function setDispatchPeerId(taskId: string, peerId: string | null): board.TaskItem {
  return board.updateTask(taskId, { dispatchPeerId: peerId });
}

function dispatchPeerIdOf(task: board.TaskItem | undefined): string | undefined {
  return task?.dispatchPeerId;
}

/** What an honest agent passes: the fromPeerId it read from the sanitized inbox / claim. */
function claimedCopy(peerId: string): string {
  return sanitizeHandoffForOutput({ body: "", fromPeerId: peerId }).fromPeerId as string;
}

const ID_64 = `p_${"0123456789abcdef".repeat(4)}`.slice(0, 64);
const ID_65 = `${ID_64}x`;
const ID_82 = `p_${"a1b2c3d4e5".repeat(8)}`;

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

describe("isCanonicalPeerId — the only ids that may be pinned", () => {
  test("canonical: non-empty, trimmed, ≤ 64, no control chars, not a wildcard, sanitize-stable", () => {
    expect(ID_64).toHaveLength(64);
    for (const id of ["p_x", "p_tower", ID_64]) expect(isCanonicalPeerId(id)).toBe(true);
  });

  test("non-canonical ids are never pinned", () => {
    const bad = [
      "",
      ID_65,
      ID_82,
      " p_x",
      "p_x ",
      "p x\t",
      "\tp_x",
      "p_ctl\u0001x",
      "p_esc\u001b[31mx",
      "p_del\u007fx",
      "p_c1\u0085x",
      "*",
    ];
    for (const id of bad) expect(isCanonicalPeerId(id)).toBe(false);
  });

  test("a canonical id equals its own inbox/claim sanitized copy (honest ids never mismatch)", () => {
    for (const id of ["p_x", ID_64]) expect(claimedCopy(id)).toBe(id);
  });
});

describe("resolveDispatchPeerId — exactly one display-name match AND a canonical id", () => {
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

  test("zero or 2+ matches → undefined; a peer id is not a display name", () => {
    expect(resolveDispatchPeerId(peers, "node/ghost")).toBeUndefined();
    expect(resolveDispatchPeerId(peers, "dup")).toBeUndefined();
    expect(resolveDispatchPeerId(peers, "p_one")).toBeUndefined();
  });

  test("unique match with a non-canonical id (>64, whitespace, control, `*`) → undefined", () => {
    for (const id of [ID_65, ID_82, " p_ws", "p_ws ", "p_bad\u0007id", "*"]) {
      expect(resolveDispatchPeerId([{ id, displayName: "node/x" }], "node/x")).toBeUndefined();
    }
    expect(resolveDispatchPeerId([{ id: ID_64, displayName: "node/x" }], "node/x")).toBe(ID_64);
  });
});

describe("apply_card_result L-2 (fail-visible): pin vs sanitized fromPeerId", () => {
  const dir = join(tmpdir(), `loom-card-l2-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const sessionFile = join(dir, "session.json");
  let stderrLines: string[] = [];
  let stderrSpy: ReturnType<typeof spyOn> | null = null;

  function auditLines(): Array<Record<string, unknown>> {
    const roomsDir = join(loomDir(), "rooms");
    if (!existsSync(roomsDir)) return [];
    const out: Array<Record<string, unknown>> = [];
    for (const room of readdirSync(roomsDir)) {
      for (const f of readdirSync(join(roomsDir, room))) {
        if (!f.startsWith("policy-audit")) continue;
        const text = readFileSync(join(roomsDir, room, f), "utf8").trim();
        if (!text) continue;
        for (const l of text.split("\n")) out.push(JSON.parse(l) as Record<string, unknown>);
      }
    }
    return out;
  }

  function auditRaw(): string {
    const roomsDir = join(loomDir(), "rooms");
    if (!existsSync(roomsDir)) return "";
    let raw = "";
    for (const room of readdirSync(roomsDir)) {
      for (const f of readdirSync(join(roomsDir, room))) {
        raw += readFileSync(join(roomsDir, room, f), "utf8");
      }
    }
    return raw;
  }

  function mismatchesFor(cardId: string) {
    return auditLines().filter((l) => l.reason === "l2_mismatch" && l.cardId === cardId);
  }

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

  test("updateTask persists a canonical pin; null clears it; non-canonical is dropped (never truncated)", () => {
    const task = board.addTask({ title: "persist", assignee: "node/one", status: "doing" });
    expect(dispatchPeerIdOf(setDispatchPeerId(task.id, "p_one"))).toBe("p_one");
    expect(dispatchPeerIdOf(board.findTask(task.id))).toBe("p_one");
    expect(dispatchPeerIdOf(setDispatchPeerId(task.id, null))).toBeUndefined();
    for (const bad of [ID_82, " p_ws", "p_bad\u0007id", "*"]) {
      expect(dispatchPeerIdOf(setDispatchPeerId(task.id, bad))).toBeUndefined();
      expect(dispatchPeerIdOf(board.findTask(task.id))).toBeUndefined();
    }
  });

  test("genuine mismatch → lands blocked + l2Mismatch flag + audit l2_mismatch; notes == 0.31.0; no pin / fromPeerId value anywhere", () => {
    const task = board.addTask({ title: "mismatch", assignee: "node/one", status: "doing" });
    setDispatchPeerId(task.id, "p_pinned_secret");
    const r = cardOps.applyCardResult({
      resultJson: result(task.id, "node/one", 1),
      fromPeerId: "p_claimed_other",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.status).toBe("blocked");
    expect(r.task.status).toBe("blocked");
    expect(flagOf(r.task)).toBe(true);
    expect(flagOf(board.findTask(task.id))).toBe(true);
    expect(r.task.notes).toBe(notes031({ summary: "sum", status: "done", seq: 1 }));
    expect(r.task.assignee).toBe("node/one");
    expect(board.findTask(task.id)?.status).toBe("blocked");

    const hits = mismatchesFor(task.id);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ kind: "l2_mismatch", reason: "l2_mismatch", cardId: task.id });
    expect(typeof hits[0]?.ts).toBe("string");

    // The pin field itself is unchanged on the local card ("change no other fields"); MCP
    // output drops it via mcpResultJson (stdio-precheck test) — every other text must not
    // carry either id.
    expect(r.task.dispatchPeerId).toBe("p_pinned_secret");
    const resultText = JSON.stringify(r, (k, v) => (k === "dispatchPeerId" ? undefined : v));
    const outputs = [resultText, r.task.notes ?? "", auditRaw(), stderrLines.join("")];
    for (const out of outputs) {
      expect(out).not.toContain("p_pinned_secret");
      expect(out).not.toContain("p_claimed_other");
    }
    expect(stderrLines.join("")).toContain("l2_mismatch");
  });

  test("codex input (900-char summary + OSC in reason): notes byte-identical to 0.31.0 with and without a mismatch; last_seq kept", () => {
    const summary = "S".repeat(900);
    const reason = "boom \u001b]0;evil-title\u0007 tail";
    const note = "N".repeat(400);
    const expected = notes031({ summary, status: "failed", reason, note, seq: 7 });
    expect(expected).toContain("last_seq=7");

    for (const pinned of [false, true]) {
      const task = board.addTask({ title: `codex-${pinned}`, assignee: "node/one", status: "doing" });
      if (pinned) setDispatchPeerId(task.id, "p_pin_codex");
      const r = cardOps.applyCardResult({
        resultJson: failedResult(task.id, "node/one", 7, summary, reason, note),
        fromPeerId: pinned ? "p_someone_else" : undefined,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.task.notes).toBe(expected);
      expect(board.findTask(task.id)?.notes).toBe(expected);
      expect(flagOf(r.task)).toBe(pinned ? true : undefined);
    }
  });

  test("l2Mismatch flag is local-only: never in export / attachments / parsed snapshots", () => {
    const task = board.addTask({ title: "flag-local", assignee: "node/one", status: "doing" });
    setDispatchPeerId(task.id, "p_pin_flag");
    cardOps.applyCardResult({ resultJson: result(task.id, "node/one", 1), fromPeerId: "p_other" });
    expect(flagOf(board.findTask(task.id))).toBe(true);
    const snap = board.exportBoardSnapshot();
    expect(JSON.stringify(snap)).not.toContain("l2Mismatch");
    expect(
      JSON.stringify(board.boardToAttachments(board.loadTaskBoard() as board.TaskBoard)),
    ).not.toContain("l2Mismatch");
    const forged = {
      ...snap,
      tasks: snap.tasks.map((t) => (t.id === task.id ? { ...t, l2Mismatch: true } : t)),
    };
    expect(JSON.stringify(board.parseBoardSnapshot(forged))).not.toContain("l2Mismatch");
  });

  test("match → blocked, no flag, no l2_mismatch, no l2_unverifiable", () => {
    const task = board.addTask({ title: "match", assignee: "node/one", status: "doing" });
    setDispatchPeerId(task.id, "p_one");
    const r = cardOps.applyCardResult({
      resultJson: result(task.id, "node/one", 1),
      fromPeerId: "p_one",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.status).toBe("blocked");
      expect(flagOf(r.task)).toBeUndefined();
    }
    expect(mismatchesFor(task.id)).toHaveLength(0);
    expect(stderrLines.join("")).not.toContain("l2_unverifiable");
  });

  test("honest 64-char id: pin == inbox/claim sanitized copy → blocked, no l2_mismatch", () => {
    const task = board.addTask({ title: "honest-64", assignee: "node/one", status: "doing" });
    setDispatchPeerId(task.id, ID_64);
    expect(dispatchPeerIdOf(board.findTask(task.id))).toBe(ID_64);
    const r = cardOps.applyCardResult({
      resultJson: result(task.id, "node/one", 1),
      fromPeerId: claimedCopy(ID_64),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(flagOf(r.task)).toBeUndefined();
    expect(mismatchesFor(task.id)).toHaveLength(0);
  });

  test("fromPeerId compared after the inbox/claim sanitize (control chars stripped) → honest copy matches", () => {
    const task = board.addTask({ title: "sanitized-from", assignee: "node/one", status: "doing" });
    setDispatchPeerId(task.id, "p_one");
    const r = cardOps.applyCardResult({
      resultJson: result(task.id, "node/one", 1),
      fromPeerId: "p_\u0007one",
    });
    expect(r.ok).toBe(true);
    expect(mismatchesFor(task.id)).toHaveLength(0);
  });

  test("relay id > 64 chars: no pin (non-canonical) → honest sanitized copy lands blocked, l2_unverifiable, no l2_mismatch", () => {
    const task = board.addTask({ title: "long-id", assignee: "node/long", status: "doing" });
    expect(resolveDispatchPeerId([{ id: ID_82, displayName: "node/long" }], "node/long")).toBeUndefined();
    const r = cardOps.applyCardResult({
      resultJson: result(task.id, "node/long", 1),
      fromPeerId: claimedCopy(ID_82),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.status).toBe("blocked");
    expect(mismatchesFor(task.id)).toHaveLength(0);
    expect(stderrLines.filter((l) => l.includes("l2_unverifiable"))).toHaveLength(1);
  });

  test("whitespace id: no pin → lands blocked, l2_unverifiable, no l2_mismatch", () => {
    const task = board.addTask({ title: "ws-id", assignee: "node/ws", status: "doing" });
    expect(resolveDispatchPeerId([{ id: " p_ws ", displayName: "node/ws" }], "node/ws")).toBeUndefined();
    const r = cardOps.applyCardResult({
      resultJson: result(task.id, "node/ws", 1),
      fromPeerId: " p_ws ",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.status).toBe("blocked");
    expect(mismatchesFor(task.id)).toHaveLength(0);
  });

  test("no pin + fromPeerId → today's behaviour + one l2_unverifiable line", () => {
    const task = board.addTask({ title: "legacy", assignee: "node/one", status: "doing" });
    const r = cardOps.applyCardResult({
      resultJson: result(task.id, "node/one", 1),
      fromPeerId: "p_anyone",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.status).toBe("blocked");
    expect(stderrLines.filter((l) => l.includes("l2_unverifiable"))).toHaveLength(1);
  });

  test("pin + fromPeerId omitted → today's behaviour + one l2_unverifiable line", () => {
    const task = board.addTask({ title: "omitted", assignee: "node/one", status: "doing" });
    setDispatchPeerId(task.id, "p_one");
    const r = cardOps.applyCardResult({ resultJson: result(task.id, "node/one", 1) });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.status).toBe("blocked");
    expect(stderrLines.filter((l) => l.includes("l2_unverifiable"))).toHaveLength(1);
    expect(stderrLines.join("")).not.toContain("p_one");
  });

  test("existing node/assignee L-2 guard is unchanged (still rejects)", () => {
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
    expect(JSON.stringify(board.parseBoardSnapshot(forged))).not.toContain("p_forged");
  });
});

describe("dispatch_card: name routing (0.31.0) + canonical unique pin (in-process relay)", () => {
  const port = 24400 + Math.floor(Math.random() * 300);
  const dir = join(tmpdir(), `loom-card-l2-relay-${Date.now()}`);
  const sessionFile = join(dir, "tower-session.json");
  const relay = new RelayServer({ host: "127.0.0.1", port });
  const clients: RelayClient[] = [];
  const peerIds: Record<string, string> = {};
  let inviteCode = "";

  async function joinAs(displayName: string, peerId?: string): Promise<{ id: string; client: RelayClient }> {
    const id =
      peerId ?? `p_${displayName.replace(/[^a-z0-9]/gi, "")}_${Math.random().toString(36).slice(2, 8)}`;
    const c = new RelayClient({ url: `ws://127.0.0.1:${port}/ws` });
    const joined = await c.joinRoom({ inviteCode, displayName, agentKind: "shell", peerId: id });
    if (joined.type === "error") throw new Error(`join failed: ${joined.message}`);
    clients.push(c);
    return { id, client: c };
  }

  async function inboxHas(c: RelayClient, cardId: string): Promise<boolean> {
    return (await c.listInbox()).some((e) => e.handoff.body.includes(cardId));
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
    inviteCode = created.inviteCode ?? "";
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

    peerIds.one = (await joinAs("node/one")).id;
    peerIds.dupA = (await joinAs("node/dup")).id;
    peerIds.dupB = (await joinAs("node/dup")).id;
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

  test("unique name → pinned and routed by NAME (handoff.to === @node); ambiguous re-dispatch clears the pin", async () => {
    const task = board.addTask({ title: "relay-dispatch", status: "todo" });
    const first = await cardOps.dispatchCard({ taskId: task.id, node: "node/one", prompt: "p" });
    expect(first.ok).toBe(true);
    expect(dispatchPeerIdOf(board.findTask(task.id))).toBe(peerIds.one);
    const entry = (await (clients[0] as RelayClient).listInbox()).find((e) =>
      e.handoff.body.includes(task.id),
    );
    expect(entry?.handoff.to).toBe("@node/one");

    const ok = cardOps.applyCardResult({
      resultJson: result(task.id, "node/one", 1),
      fromPeerId: claimedCopy(peerIds.one as string),
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.status).toBe("blocked");
      expect(flagOf(ok.task)).toBeUndefined();
    }

    // A mismatching result sets the flag; re-dispatch clears it (and the ambiguous pin).
    const mism = cardOps.applyCardResult({
      resultJson: result(task.id, "node/one", 2),
      fromPeerId: "p_not_the_target",
    });
    expect(mism.ok).toBe(true);
    expect(flagOf(board.findTask(task.id))).toBe(true);

    const second = await cardOps.dispatchCard({ taskId: task.id, node: "node/dup", prompt: "p" });
    expect(second.ok).toBe(true);
    expect(dispatchPeerIdOf(board.findTask(task.id))).toBeUndefined();
    expect(flagOf(board.findTask(task.id))).toBeUndefined();
  }, 30_000);

  test("race: lookup sees only offline p_a, online p_b (same name) joins before send → relay routes to p_b; no pin; p_b's honest result lands blocked without l2_mismatch", async () => {
    const offline = new RelayClient({ url: `ws://127.0.0.1:${port}/ws` });
    const aId = `p_racea_${Math.random().toString(36).slice(2, 8)}`;
    const joinedA = await offline.joinRoom({
      inviteCode,
      displayName: "node/race",
      agentKind: "shell",
      peerId: aId,
    });
    expect(joinedA.type).not.toBe("error");
    offline.close();
    await Bun.sleep(100);

    let b: { id: string; client: RelayClient } | null = null;
    const hooks = dispatchHooks();
    hooks.afterPeerLookup = async () => {
      b = await joinAs("node/race");
    };
    const errSpy = spyOn(process.stderr, "write");
    try {
      const task = board.addTask({ title: "race", status: "todo" });
      const r = await cardOps.dispatchCard({ taskId: task.id, node: "node/race", prompt: "p" });
      expect(r.ok).toBe(true);
      const joinedB = b as { id: string; client: RelayClient } | null;
      expect(joinedB).not.toBeNull();
      if (!joinedB) return;
      expect(await inboxHas(joinedB.client, task.id)).toBe(true);
      expect(dispatchPeerIdOf(board.findTask(task.id))).toBeUndefined();

      const landed = cardOps.applyCardResult({
        resultJson: result(task.id, "node/race", 1),
        fromPeerId: claimedCopy(joinedB.id),
      });
      expect(landed.ok).toBe(true);
      if (landed.ok) {
        expect(landed.status).toBe("blocked");
        expect(flagOf(landed.task)).toBeUndefined();
      }
      const written = errSpy.mock.calls.map((c) => String(c[0])).join("");
      expect(written).not.toContain("l2_mismatch");
    } finally {
      hooks.afterPeerLookup = undefined;
      errSpy.mockRestore();
    }
  }, 30_000);

  test("`*` is never pinned and dispatch_card never broadcasts", async () => {
    const task = board.addTask({ title: "star", status: "todo" });
    const r = await cardOps.dispatchCard({ taskId: task.id, node: "*", prompt: "p" });
    expect(r.ok).toBe(false);
    expect(dispatchPeerIdOf(board.findTask(task.id))).toBeUndefined();
    for (const c of clients) expect(await inboxHas(c, task.id)).toBe(false);
  }, 30_000);
});
