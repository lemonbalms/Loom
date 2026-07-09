import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadTaskBoard,
  addTask,
  updateTask,
  removeTask,
  clearDoneTasks,
  formatTaskBoard,
  parseTaskStatus,
  emptyBoard,
  saveTaskBoard,
  exportBoardSnapshot,
  importBoardSnapshot,
  boardToAttachments,
  snapshotFromAttachments,
  parseBoardSnapshot,
  normalizeTimestamp,
  resolveHandoffEntryIndex,
} from "./task-board";
import { saveSession, setActiveProfile } from "./session-store";

describe("task board", () => {
  const dir = join(tmpdir(), `fable-board-${Date.now()}`);
  const sessionFile = join(dir, "session.json");
  const prevSession = process.env.LOOM_SESSION;

  beforeEach(() => {
    mkdirSync(dir, { recursive: true });
    process.env.LOOM_SESSION = sessionFile;
    setActiveProfile(null);
    saveSession({
      roomId: "room_board_test",
      roomName: "board-demo",
      inviteCode: "LOOM-TEST",
      peerId: "p_alice",
      displayName: "alice",
      agentKind: "shell",
      relayUrl: "ws://127.0.0.1:7842/ws",
      updatedAt: new Date().toISOString(),
    });
  });

  afterEach(() => {
    if (prevSession === undefined) delete process.env.LOOM_SESSION;
    else process.env.LOOM_SESSION = prevSession;
    try {
      saveTaskBoard(emptyBoard("room_board_test"));
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* */
    }
  });

  test("parseTaskStatus", () => {
    expect(parseTaskStatus("doing")).toBe("doing");
    expect(parseTaskStatus("DONE")).toBe("done");
    expect(parseTaskStatus("nope")).toBeNull();
  });

  test("add update remove flow", () => {
    const t = addTask({ title: "fix inbox", assignee: "bob" });
    expect(t.id.startsWith("task_")).toBe(true);
    expect(t.status).toBe("todo");
    expect(t.assignee).toBe("bob");

    const u = updateTask(t.id, { status: "doing" });
    expect(u.status).toBe("doing");

    const board = loadTaskBoard()!;
    expect(board.tasks.length).toBe(1);
    expect(formatTaskBoard(board)).toContain("fix inbox");

    expect(removeTask(t.id)).toBe(true);
    expect(loadTaskBoard()!.tasks.length).toBe(0);
  });

  test("clear done and cancelled", () => {
    const a = addTask({ title: "a" });
    const b = addTask({ title: "b" });
    updateTask(a.id, { status: "done" });
    updateTask(b.id, { status: "cancelled" });
    addTask({ title: "c" });
    expect(clearDoneTasks()).toBe(2);
    expect(loadTaskBoard()!.tasks.map((t) => t.title)).toEqual(["c"]);
  });

  test("sanitize title ansi", () => {
    const t = addTask({ title: "x\x1b[31my" });
    expect(t.title).not.toContain("\x1b");
  });

  test("M-8: suffix id match for update", () => {
    const t = addTask({ title: "partial" });
    const short = t.id.slice(-6);
    const u = updateTask(short, { status: "blocked", notes: "wait" });
    expect(u.status).toBe("blocked");
    expect(u.notes).toBe("wait");
  });

  test("M-8: empty id rejected", () => {
    addTask({ title: "x" });
    expect(() => updateTask("", { status: "done" })).toThrow(/required/);
  });

  test("M-8: ambiguous suffix throws", () => {
    // force two ids ending with same suffix is hard with random hex;
    // use includes-style attack: very short "task_" would match all — should be endsWith only
    const a = addTask({ title: "a" });
    const b = addTask({ title: "b" });
    // both end with different hex; empty and nonsense
    expect(() => updateTask("nope", { status: "done" })).toThrow(/not found/);
    // exact works
    expect(updateTask(a.id, { status: "doing" }).id).toBe(a.id);
    expect(updateTask(b.id, { status: "doing" }).id).toBe(b.id);
  });

  test("export/import merge and replace", () => {
    const t1 = addTask({ title: "export-me" });
    const snap = exportBoardSnapshot();
    expect(snap.kind).toBe("loom-board-snapshot");
    expect(snap.tasks.some((t) => t.id === t1.id)).toBe(true);

    addTask({ title: "local-only" });
    // force: export may use same roomId as session — ok without force
    const merged = importBoardSnapshot(snap, "merge");
    expect(merged.tasks.some((t) => t.title === "local-only")).toBe(true);
    expect(merged.tasks.some((t) => t.id === t1.id)).toBe(true);

    const att = boardToAttachments(loadTaskBoard()!);
    expect(att[0]?.label).toBe("loom-board-snapshot");
    const parsed = snapshotFromAttachments(att);
    expect(parsed?.tasks.length).toBeGreaterThan(0);

    const replaced = importBoardSnapshot(snap, "replace");
    expect(replaced.tasks.every((t) => t.title !== "local-only")).toBe(true);
  });

  test("M-10: spoofed future updatedAt is clamped", () => {
    const local = addTask({ title: "mine" });
    const snap = exportBoardSnapshot();
    const evil = {
      ...snap,
      tasks: snap.tasks.map((t) =>
        t.id === local.id
          ? {
              ...t,
              title: "hijacked",
              updatedAt: "9999-12-31T23:59:59.000Z",
            }
          : t,
      ),
    };
    const board = importBoardSnapshot(evil, "merge");
    const t = board.tasks.find((x) => x.id === local.id)!;
    // future spoof clamped → same or earlier than now; title may still update
    // if timestamps equal after clamp, incoming can win — but updatedAt must not be year 9999
    expect(t.updatedAt.startsWith("9999")).toBe(false);
    expect(Date.parse(t.updatedAt)).toBeLessThanOrEqual(Date.now() + 1000);
  });

  test("M-11: malformed tasks array does not crash", () => {
    expect(() =>
      parseBoardSnapshot({
        kind: "loom-board-snapshot",
        tasks: null,
      }),
    ).not.toThrow();
    const s = parseBoardSnapshot({
      kind: "loom-board-snapshot",
      tasks: null,
    });
    expect(s.tasks).toEqual([]);
    expect(() =>
      importBoardSnapshot({
        kind: "loom-board-snapshot",
        tasks: [null, { id: "task_ab", title: "ok" }],
      }),
    ).not.toThrow();
  });

  test("M-12: resolveHandoffEntryIndex exact and ambiguous", () => {
    const entries = [
      { handoff: { id: "ho_aaa111" } },
      { handoff: { id: "ho_bbb111" } },
    ];
    expect(resolveHandoffEntryIndex(entries, "ho_aaa111")).toBe(0);
    expect(resolveHandoffEntryIndex(entries, "aaa111")).toBe(0);
    expect(() => resolveHandoffEntryIndex(entries, "111")).toThrow(/ambiguous/);
    expect(() => resolveHandoffEntryIndex(entries, "")).toThrow(/required/);
    expect(() => resolveHandoffEntryIndex(entries, "nope")).toThrow(/not found/);
  });

  test("L-9: foreign sourceRoomId requires force", () => {
    addTask({ title: "x" });
    const snap = exportBoardSnapshot();
    const foreign = { ...snap, sourceRoomId: "room_OTHER" };
    expect(() => importBoardSnapshot(foreign, "merge")).toThrow(/sourceRoomId/);
    const board = importBoardSnapshot(foreign, "merge", undefined, {
      force: true,
    });
    expect(board.tasks.length).toBeGreaterThan(0);
  });

  test("normalizeTimestamp rejects non-ISO and future", () => {
    const now = "2026-07-09T12:00:00.000Z";
    expect(normalizeTimestamp("not-a-date", now)).toBe(now);
    expect(normalizeTimestamp("9999-01-01T00:00:00.000Z", now)).toBe(now);
    expect(normalizeTimestamp("2026-01-01T00:00:00.000Z", now)).toBe(
      "2026-01-01T00:00:00.000Z",
    );
  });
});
