/**
 * PLAN 0.30.0 D5 / R1 / R2.
 * cardKey = sha16(roomId NUL agent NUL cardId). cwd is a record field, not a key.
 */
import { createHash } from "node:crypto";
import { join } from "node:path";
import { readJsonFile, writeAtomicJson } from "./atomic-json";

export type CardSessionState = "running" | "exited";

export type CardSessionRecord = {
  agent: "claude" | "codex" | "grok";
  cwd: string;
  sessionId: string;
  promptFingerprint: string;
  attempts: number;
  pid: number;
  pgid: number;
  startedAt: string;
  state: CardSessionState;
  resultSent: boolean;
  roomId: string;
  cardId: string;
  fromPeerId: string;
  dispatchHandoffId: string;
  procStartedAt: string;
};

export type CardSessionKey = {
  loomDir: string;
  roomId: string;
  agent: string;
  cardId: string;
};

export function cardKeyHash(roomId: string, agent: string, cardId: string): string {
  return createHash("sha256")
    .update(`${roomId}\0${agent}\0${cardId}`)
    .digest("hex")
    .slice(0, 16);
}

export function cardSessionPath(opts: CardSessionKey): string {
  return join(
    opts.loomDir,
    "cards",
    cardKeyHash(opts.roomId, opts.agent, opts.cardId),
    "session.json",
  );
}

export function readCardSession(opts: CardSessionKey): CardSessionRecord | null {
  const raw = readJsonFile(cardSessionPath(opts));
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as CardSessionRecord;
}

export function writeCardSession(
  opts: { loomDir: string },
  record: CardSessionRecord,
): void {
  writeAtomicJson(
    cardSessionPath({
      loomDir: opts.loomDir,
      roomId: record.roomId,
      agent: record.agent,
      cardId: record.cardId,
    }),
    record,
  );
}
