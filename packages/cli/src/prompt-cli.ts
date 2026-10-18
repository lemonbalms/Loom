/**
 * PLAN 0.41.0 P3 — `loom prompt show <cardId> [--attempt <n>] [--room <roomId>]
 * [--agent claude|codex|grok] [--json] [--profile <p>]` (D6 · R8 · R9 · R10 · R11 · C1 · C2 ·
 * R60-M2 · R60-L2 · R60-L3).
 *
 * Read-only: finds the card the way the bridge does — the profile session's `peerId` namespace,
 * filtered by cardId (and `--room` / `--agent`) — and prints the `prompt-<n>.json` record. Like
 * `memory-cli.ts` it returns an exit code (0 shown · 1 refused / none / ambiguous / invalid / STALE /
 * MISMATCH / usage) and `index.ts` only maps it. The `LOOM_CARD` refusal runs before argument
 * parsing and before anything is resolved or read (R11 — a guard, not a boundary). Text mode makes
 * C0 (except TAB · LF), DEL, C1 and bidi controls visible in every printed field (R10); `--json`
 * writes the checked file bytes verbatim (the reader accepts only the canonical, escaped P1 bytes).
 *
 * Astra 0094: strictly read-only and non-blocking — no `loadSession()` / `loomDir()` (they can
 * migrate `.fable`), no `listCardSessions` (its reader writes `.corrupt-*` backups and prints raw
 * paths). The namespace walk `lstat`s each card dir (a symlink is skipped) and reads every
 * session.json through `readBoundedRegularFile`; skipped sessions are only counted.
 */
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  type CardSessionRecord,
  cardKeyHash,
  cardPeerHash,
  getActiveProfile,
  type PromptRecord,
  promptRecordPath,
  readBoundedRegularFile,
  readPromptRecord,
  sessionPathUnder,
  stateRootHome,
} from "@loom/host";

type AgentKind = "claude" | "codex" | "grok";
const AGENT_KINDS: readonly AgentKind[] = ["claude", "codex", "grok"];
/** `MAX_ATTEMPTS` of the headless worker (R4) — the attempts a card can have a record for. */
const ATTEMPTS = [1, 2] as const;
/** Astra 0094: read bound for a card session.json and the profile session file. */
const SESSION_READ_MAX_BYTES = 1024 * 1024;
const CARD_KEY_RE = /^[0-9a-f]{16}$/;

/** The session.json fields `prompt show` uses. */
type CardSessionView = Pick<
  CardSessionRecord,
  "agent" | "roomId" | "cardId" | "attempts" | "startedAt" | "dispatchHandoffId"
>;
type CardMatch = { dir: string; session: CardSessionView };

export type PromptCliDeps = {
  /** Injected env (R11 — `""` = not set). */
  env: Record<string, string | undefined>;
  /**
   * Lazy (R11: never called under `LOOM_CARD`): the Loom dir, the bridge profile resolution and
   * that profile session's `peerId` (null = no session).
   */
  resolve: () => { loomDir: string; profile: string; peerId: string | null };
  stdout: (line: string) => void;
  /** `--json`: the record file bytes, unchanged. */
  stdoutBytes: (bytes: Uint8Array) => void;
  stderr: (line: string) => void;
};

export type PromptCliArgs = { positional: readonly string[] };
export type PromptCliFlags = Record<string, string | boolean>;

const USAGE =
  "usage: loom prompt show <cardId> [--attempt <n>] [--room <roomId>] [--agent claude|codex|grok] [--json] [--profile <p>]";
const AGENT_ERROR = "--agent must be claude, codex or grok";
const CARD_REFUSAL =
  "refused — LOOM_CARD is set (this shell belongs to a Loom card worker); prompt records are for the operator.";
const ATTEMPT_RE = /^[1-9][0-9]*$/;

/** C0 except TAB · LF, DEL, C1, bidi embedding/override/isolate controls (R10). */
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the point (terminal safety)
const UNSAFE_TEXT_RE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f‪-‮⁦-⁩]/g;

/** R10 · R60-L2: a terminal-safe view of a remote / file string. */
export function visibleText(s: string): string {
  return s.replace(UNSAFE_TEXT_RE, (c) => `\\u{${c.charCodeAt(0).toString(16)}}`);
}

function utf8Bytes(s: string): number {
  return Buffer.byteLength(s, "utf8");
}

function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export async function runPromptCommand(
  verb: string,
  args: PromptCliArgs,
  flags: PromptCliFlags,
  deps: PromptCliDeps,
): Promise<number> {
  const fail = (reason: string): number => {
    deps.stderr(`loom prompt: ${reason}`);
    return 1;
  };
  // R11: before argument parsing; injected env, "" = not set. A guard, not a boundary.
  const card = deps.env.LOOM_CARD;
  if (typeof card === "string" && card.length > 0) return fail(CARD_REFUSAL);

  if (verb !== "show" || args.positional.length !== 1) return fail(USAGE);
  const cardId = args.positional[0]!;
  if (cardId.length === 0) return fail(USAGE);
  const attemptFlag = flags.attempt;
  if (attemptFlag !== undefined && (typeof attemptFlag !== "string" || !ATTEMPT_RE.test(attemptFlag))) {
    return fail(USAGE);
  }
  const json = flags.json;
  if (json !== undefined && json !== true) return fail(USAGE);
  const room = flags.room;
  if (room !== undefined && (typeof room !== "string" || room.length === 0)) return fail(USAGE);
  const agent = flags.agent;
  if (agent !== undefined && (typeof agent !== "string" || !(AGENT_KINDS as readonly string[]).includes(agent))) {
    return fail(AGENT_ERROR);
  }

  const env = deps.resolve();
  const profile = visibleText(env.profile);
  if (!env.peerId) return fail(`profile ${profile} has no session (join a room first)`);

  // R8 · C1: the bridge's peer namespace only; C2: --room / --agent are match checks.
  const scan = scanPeerCards(env.loomDir, env.peerId);
  const matches = scan.cards
    .filter((m) => m.session.cardId === cardId)
    .filter((m) => room === undefined || m.session.roomId === room)
    .filter((m) => agent === undefined || m.session.agent === agent)
    .sort(
      (a, b) => cmpStr(a.session.roomId, b.session.roomId) || cmpStr(a.session.agent, b.session.agent),
    );
  if (matches.length === 0) {
    deps.stderr(
      `loom prompt: no headless card session for ${visibleText(cardId)} under profile ${profile} (cards from an earlier peer id of this profile are not searched)`,
    );
    if (scan.skipped > 0) {
      deps.stderr(
        `loom prompt: ${scan.skipped} card session(s) under profile ${profile} skipped (not a regular file, too large, or invalid)`,
      );
    }
    return 1;
  }
  if (matches.length > 1) {
    deps.stderr(
      `loom prompt: ${visibleText(cardId)} matches ${matches.length} headless card sessions under profile ${profile}`,
    );
    for (const { session: r } of matches) {
      deps.stderr(
        `  ${visibleText(r.roomId)} · ${r.agent} · attempts ${r.attempts} · started ${visibleText(r.startedAt)}`,
      );
    }
    deps.stderr("pick one with --room <roomId> --agent <agent>");
    return 1;
  }
  const { dir, session } = matches[0]!;

  // R9: latest = session.json attempts (a write-failed latest attempt shows as missing).
  const attempt = attemptFlag === undefined ? session.attempts : Number(attemptFlag);
  const read = readPromptRecord(dir, attempt);
  if (read.kind === "missing") {
    deps.stderr(
      `loom prompt: attempt ${attempt} of ${visibleText(cardId)} has no prompt record (the write failed, or the attempt ran before Loom 0.41.0)`,
    );
    const available = currentAttempts(dir, session, attempt);
    if (available.length > 0) deps.stderr(`available attempts: ${available.join(", ")}`);
    return 1;
  }
  if (read.kind === "invalid") {
    return fail(
      `invalid prompt record ${visibleText(promptRecordPath(dir, attempt))}: ${visibleText(read.reason)}`,
    );
  }

  const record = read.record;
  // Astra 0094 · R9: a record of another agent in this card dir is not this card's prompt.
  if (record.agent !== session.agent) {
    return fail(`invalid prompt record ${visibleText(promptRecordPath(dir, attempt))}: agent mismatch`);
  }
  const stale = record.dispatchHandoffId !== session.dispatchHandoffId ? record.dispatchHandoffId : null;
  const shaOk = sha256Hex(record.user) === record.userSha256;

  if (json === true) {
    deps.stdoutBytes(read.bytes);
    if (stale !== null) {
      deps.stderr(
        `loom prompt: attempt ${attempt} of ${visibleText(cardId)} is STALE — earlier dispatch ${visibleText(stale)}`,
      );
    }
    if (!shaOk) deps.stderr(`loom prompt: attempt ${attempt} of ${visibleText(cardId)}: sha256 MISMATCH`);
    return stale === null && shaOk ? 0 : 1;
  }

  printRecord(deps, cardId, record, stale, shaOk);
  return stale === null && shaOk ? 0 : 1;
}

function sha256Hex(text: string): string {
  return createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
}

/** R9 · R60-M2: other attempts whose record reads and belongs to the current dispatch and agent. */
function currentAttempts(dir: string, session: CardSessionView, except: number): number[] {
  const out: number[] = [];
  for (const n of ATTEMPTS) {
    if (n === except) continue;
    const r = readPromptRecord(dir, n);
    if (
      r.kind === "ok" &&
      r.record.agent === session.agent &&
      r.record.dispatchHandoffId === session.dispatchHandoffId
    ) {
      out.push(n);
    }
  }
  return out;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Bounded, non-following, non-blocking JSON object read; null on any failure. */
function readJsonObject(path: string): Record<string, unknown> | null {
  const read = readBoundedRegularFile(path, SESSION_READ_MAX_BYTES);
  if (!Buffer.isBuffer(read)) return null;
  try {
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(read));
    return isPlainObject(value) ? value : null;
  } catch {
    return null;
  }
}

function nonEmpty(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

/** The used fields of a card session.json, checked like the bridge's record check; null = invalid. */
function sessionView(raw: Record<string, unknown>, cardKey: string): CardSessionView | null {
  const { agent, roomId, cardId, attempts, startedAt, dispatchHandoffId } = raw;
  if (typeof agent !== "string" || !(AGENT_KINDS as readonly string[]).includes(agent)) return null;
  if (!nonEmpty(roomId) || !nonEmpty(cardId) || !nonEmpty(dispatchHandoffId) || !nonEmpty(startedAt)) {
    return null;
  }
  if (!Number.isFinite(Date.parse(startedAt))) return null;
  if (attempts !== 1 && attempts !== 2) return null;
  if (cardKeyHash(roomId, agent, cardId) !== cardKey) return null;
  return { agent: agent as AgentKind, roomId, cardId, attempts, startedAt, dispatchHandoffId };
}

/**
 * Astra 0094: the profile peer namespace, read-only — a card dir must be a real directory (lstat),
 * session.json a bounded regular file; anything else is skipped and counted, never printed.
 */
function scanPeerCards(loomDir: string, peerId: string): { cards: CardMatch[]; skipped: number } {
  const root = join(loomDir, "cards", cardPeerHash(peerId));
  const cards: CardMatch[] = [];
  let skipped = 0;
  let names: string[];
  try {
    if (!lstatSync(root).isDirectory()) return { cards, skipped };
    names = readdirSync(root).sort();
  } catch {
    return { cards, skipped };
  }
  for (const name of names) {
    if (!CARD_KEY_RE.test(name)) continue;
    const dir = join(root, name);
    try {
      if (!lstatSync(dir).isDirectory()) {
        skipped += 1;
        continue;
      }
    } catch {
      skipped += 1;
      continue;
    }
    const raw = readJsonObject(join(dir, "session.json"));
    const session = raw === null ? null : sessionView(raw, name);
    if (session === null) {
      skipped += 1;
      continue;
    }
    cards.push({ dir, session });
  }
  return { cards, skipped };
}

/** PLAN 0.42.0 D6 · class 59: a 0.41.0 record carries no sections. */
const V1_SECTIONS_LINE = "sections: (not recorded — Loom 0.41.0 record)";

/**
 * R10: head lines → sections block (0.42.0 D6) → blank → system section → user section (→ codex
 * resume positional, R3).
 */
function printRecord(
  deps: PromptCliDeps,
  cardId: string,
  r: PromptRecord,
  stale: string | null,
  shaOk: boolean,
): void {
  const v = visibleText;
  deps.stdout(
    `card ${v(cardId)} · agent ${r.agent} · turn ${r.turn} · attempt ${r.attempt}${
      stale !== null ? ` · STALE — earlier dispatch ${v(stale)}` : ""
    }`,
  );
  deps.stdout(`fingerprint ${v(r.fingerprint)}`);
  deps.stdout(`system: ${v(r.systemChannel)} · ${utf8Bytes(r.system)} B`);
  deps.stdout(
    `user: ${v(r.userChannel)} · ${utf8Bytes(r.user)} B · sha256 ${v(r.userSha256)} ${shaOk ? "ok" : "MISMATCH"}`,
  );
  // PLAN 0.42.0 D6 · D9: the v2 sections block (every field through visibleText); v1 = one line.
  if (r.sections === undefined) {
    deps.stdout(V1_SECTIONS_LINE);
  } else {
    deps.stdout("sections:");
    for (const s of r.sections) {
      deps.stdout(
        `  ${v(s.id)} · ${v(s.channel)} · ${v(s.version)} · ${s.bytes} B · sha256 ${v(s.sha256.slice(0, 12))}`,
      );
      if (s.parts !== undefined) {
        deps.stdout(`    parts: ${s.parts.map((p) => `${v(p.id)} ${v(p.version)}`).join(", ")}`);
      }
    }
  }
  deps.stdout("");
  deps.stdout(`--- system (${v(r.systemChannel)}) ---`);
  deps.stdout(v(r.system));
  deps.stdout(`--- user (${v(r.userChannel)}) ---`);
  deps.stdout(v(r.user));
  if (r.userArgv !== undefined) {
    deps.stdout("--- user argv (codex exec resume positional) ---");
    deps.stdout(v(r.userArgv));
  }
}

/**
 * Astra 0097 M2: the read-only mirror of the bridge's `resolveStateHomeDir()` under
 * `stateRootHome()` (honours LOOM_TEST_HOME) — `.loom` if it exists, else `.fable` if it exists
 * (where the bridge stays while live legacy pids block the migration), else `.loom`. It never
 * migrates, prints or caches (Astra 0094); `existsSync` exactly as the bridge tests both roots.
 */
export function readOnlyStateHome(): string {
  const root = stateRootHome();
  const loom = join(root, ".loom");
  if (existsSync(loom)) return loom;
  const legacy = join(root, ".fable");
  return existsSync(legacy) ? legacy : loom;
}

/**
 * The CLI entry's deps: `readOnlyStateHome()` (never migrates `.fable` — Astra 0094 · 0097 M2),
 * the bridge's profile resolution (active profile → session displayName → "default", as `resolveBridgeProfile`) and that
 * session's `peerId` (R8 — `bridge-runtime` uses `session.peerId` as the local peer) read through the
 * bounded non-following reader, process.env, console output. Resolution is lazy so the LOOM_CARD
 * refusal reads nothing (R11).
 */
export function realPromptCliDeps(): PromptCliDeps {
  return {
    env: process.env,
    resolve: () => {
      const home = readOnlyStateHome();
      const session = readJsonObject(sessionPathUnder(home));
      const displayName = nonEmpty(session?.displayName) ? session.displayName : null;
      return {
        loomDir: home,
        profile: getActiveProfile() || displayName || "default",
        peerId: nonEmpty(session?.peerId) ? session.peerId : null,
      };
    },
    stdout: (l) => console.log(l),
    stdoutBytes: (b) => {
      process.stdout.write(b);
    },
    stderr: (l) => console.error(l),
  };
}
