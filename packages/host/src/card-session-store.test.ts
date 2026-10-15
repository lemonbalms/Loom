/**
 * assumed API (v0.30.0 P2 — modules are not implemented; this file is expected-red)
 *
 * from "./card-session-store":
 *   CardSessionState = "running" | "exited"
 *   CardSessionRecord {
 *     agent, cwd, sessionId, promptFingerprint, attempts, pid, pgid, startedAt,
 *     state, resultSent, roomId, cardId, fromPeerId, dispatchHandoffId, procStartedAt
 *   }
 *   cardKeyHash(roomId, agent, cardId) =
 *     sha256(utf8(`${roomId}\0${agent}\0${cardId}`)).hex.slice(0, 16)
 *   cardSessionPath({ loomDir, roomId, agent, cardId }) =
 *     join(loomDir, "cards", cardKeyHash(...), "session.json")
 *   readCardSession({ loomDir, roomId, agent, cardId }): CardSessionRecord | null
 *   writeCardSession({ loomDir }, record): void
 *     via writeAtomicJson — mode 0600, body JSON.stringify(record, null, 2) + "\n"
 *   cwd is a record field, not part of the key (D5, R1, R2).
 */
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  cardKeyHash,
  cardSessionPath,
  readCardSession,
  writeCardSession,
  type CardSessionRecord,
} from "./card-session-store";

function sha16(roomId: string, agent: string, cardId: string): string {
  return createHash("sha256")
    .update(`${roomId}\0${agent}\0${cardId}`)
    .digest("hex")
    .slice(0, 16);
}

function record(over: Partial<CardSessionRecord> = {}): CardSessionRecord {
  return {
    agent: "claude",
    cwd: "/tmp/loom-cwd-a",
    requestedCwd: null,
    sessionId: "sid-1",
    promptFingerprint: "fp-1",
    attempts: 1,
    pid: 4242,
    pgid: 4242,
    startedAt: "2026-10-15T00:00:00.000Z",
    state: "running",
    resultSent: false,
    sendAttempts: 0,
    roomId: "room_a",
    cardId: "task_abc",
    fromPeerId: "peer_a",
    dispatchHandoffId: "h1",
    procStartedAt: "Thu Oct 15 00:00:01 2026",
    ...over,
  };
}

describe("v0.30.0 P2 expected-red: card session store", () => {
  test("D5+R1 path is loomDir/cards/sha16(room x agent x cardId)/session.json", () => {
    const loomDir = mkdtempSync(join(tmpdir(), "loom-p2-session-"));
    const prev = process.env.LOOM_DIR;
    process.env.LOOM_DIR = loomDir;
    try {
      const roomId = "../x";
      const agent = "claude";
      const cardId = "task_abc";
      const path = cardSessionPath({ loomDir, roomId, agent, cardId });
      expect(cardKeyHash(roomId, agent, cardId)).toBe(sha16(roomId, agent, cardId));
      expect(cardKeyHash(roomId, agent, cardId)).toMatch(/^[0-9a-f]{16}$/);
      expect(path).toBe(
        join(loomDir, "cards", sha16(roomId, agent, cardId), "session.json"),
      );
      expect(path.includes("..")).toBe(false);
      expect(path.startsWith(loomDir)).toBe(true);
      expect(path.startsWith(join(homedir(), ".loom"))).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.LOOM_DIR;
      else process.env.LOOM_DIR = prev;
      rmSync(loomDir, { recursive: true, force: true });
    }
  });

  test("cwd is a record field and is not part of the key", () => {
    const loomDir = mkdtempSync(join(tmpdir(), "loom-p2-session-cwd-"));
    try {
      const opts = { loomDir, roomId: "room_a", agent: "codex", cardId: "task_abc" };
      const first = cardSessionPath(opts);
      const second = cardSessionPath(opts);
      expect(first).toBe(second);
      expect(first).not.toContain("/tmp/loom-cwd-a");
      expect(first).not.toContain("/tmp/loom-cwd-b");
      writeCardSession({ loomDir }, record({ cwd: "/tmp/loom-cwd-a", agent: "codex" }));
      writeCardSession({ loomDir }, record({ cwd: "/tmp/loom-cwd-b", agent: "codex" }));
      expect(cardSessionPath(opts)).toBe(first);
      expect(readCardSession(opts)?.cwd).toBe("/tmp/loom-cwd-b");
    } finally {
      rmSync(loomDir, { recursive: true, force: true });
    }
  });

  test("writeCardSession round-trips D5+R1 fields via writeAtomicJson mode 0600", () => {
    const loomDir = mkdtempSync(join(tmpdir(), "loom-p2-session-write-"));
    const prev = process.env.LOOM_DIR;
    process.env.LOOM_DIR = loomDir;
    try {
      const saved = record({ roomId: "room_round", cardId: "task_def" });
      const opts = {
        loomDir,
        roomId: saved.roomId,
        agent: saved.agent,
        cardId: saved.cardId,
      };
      expect(readCardSession(opts)).toBeNull();
      writeCardSession({ loomDir }, saved);
      const path = cardSessionPath(opts);
      expect(path.startsWith(loomDir)).toBe(true);
      expect(path.startsWith(join(homedir(), ".loom"))).toBe(false);
      expect(statSync(path).mode & 0o777).toBe(0o600);
      expect(readFileSync(path, "utf8")).toBe(`${JSON.stringify(saved, null, 2)}\n`);
      expect(readCardSession(opts)).toEqual(saved);
      const names = readdirSync(dirname(path));
      expect(names.filter((name) => name.includes(".tmp."))).toEqual([]);
    } finally {
      if (prev === undefined) delete process.env.LOOM_DIR;
      else process.env.LOOM_DIR = prev;
      rmSync(loomDir, { recursive: true, force: true });
    }
  });
});
