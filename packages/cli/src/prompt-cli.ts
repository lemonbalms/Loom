/**
 * PLAN 0.41.0 P3 — `loom prompt show <cardId> [--attempt <n>] [--room <roomId>]
 * [--agent claude|codex|grok] [--json] [--profile <p>]` (D6 · R8 · R9 · R10 · R11 · C1 · C2 ·
 * R60-M2 · R60-L2 · R60-L3).
 *
 * Read-only: finds the card the way the bridge does — the profile session's `peerId` namespace
 * (`listCardSessions`), filtered by cardId (and `--room` / `--agent`) — and prints the
 * `prompt-<n>.json` record. Like `memory-cli.ts` it returns an exit code (0 shown · 1 refused /
 * none / ambiguous / invalid / STALE / MISMATCH / usage) and `index.ts` only maps it. The
 * `LOOM_CARD` refusal runs before argument parsing and before anything is resolved or read (R11 —
 * a guard, not a boundary). Text mode makes C0 (except TAB · LF), DEL, C1 and bidi controls
 * visible in every printed field (R10); `--json` writes the checked file bytes verbatim (R6 already
 * escaped DEL · C1 · bidi at write time).
 */
import { createHash } from "node:crypto";
import { dirname } from "node:path";
import {
  type CardSessionRecord,
  cardSessionPath,
  listCardSessions,
  loadSession,
  loomDir,
  type PromptRecord,
  promptRecordPath,
  readPromptRecord,
  resolveBridgeProfile,
} from "@loom/host";

type AgentKind = "claude" | "codex" | "grok";
const AGENT_KINDS: readonly AgentKind[] = ["claude", "codex", "grok"];
/** `MAX_ATTEMPTS` of the headless worker (R4) — the attempts a card can have a record for. */
const ATTEMPTS = [1, 2] as const;

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
  const matches = listCardSessions(env.loomDir, env.peerId)
    .filter((r) => r.cardId === cardId)
    .filter((r) => room === undefined || r.roomId === room)
    .filter((r) => agent === undefined || r.agent === agent)
    .sort((a, b) => cmpStr(a.roomId, b.roomId) || cmpStr(a.agent, b.agent));
  if (matches.length === 0) {
    return fail(
      `no headless card session for ${visibleText(cardId)} under profile ${profile} (cards from an earlier peer id of this profile are not searched)`,
    );
  }
  if (matches.length > 1) {
    deps.stderr(
      `loom prompt: ${visibleText(cardId)} matches ${matches.length} headless card sessions under profile ${profile}`,
    );
    for (const r of matches) {
      deps.stderr(
        `  ${visibleText(r.roomId)} · ${r.agent} · attempts ${r.attempts} · started ${visibleText(r.startedAt)}`,
      );
    }
    deps.stderr("pick one with --room <roomId> --agent <agent>");
    return 1;
  }
  const session = matches[0]!;
  const dir = dirname(
    cardSessionPath({
      loomDir: env.loomDir,
      localPeerId: env.peerId,
      roomId: session.roomId,
      agent: session.agent,
      cardId: session.cardId,
    }),
  );

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

/** R9 · R60-M2: other attempts whose record reads and belongs to the current dispatch. */
function currentAttempts(dir: string, session: CardSessionRecord, except: number): number[] {
  const out: number[] = [];
  for (const n of ATTEMPTS) {
    if (n === except) continue;
    const r = readPromptRecord(dir, n);
    if (r.kind === "ok" && r.record.dispatchHandoffId === session.dispatchHandoffId) out.push(n);
  }
  return out;
}

/** R10: head lines → blank → system section → user section (→ codex resume positional, R3). */
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
 * The CLI entry's deps: `loomDir()` (stateRootHome — honours LOOM_TEST_HOME), the bridge's
 * profile resolution and that session's `peerId` (R8 — `bridge-runtime` uses `session.peerId` as
 * the local peer), process.env, console output. Resolution is lazy so the LOOM_CARD refusal reads
 * nothing (R11).
 */
export function realPromptCliDeps(): PromptCliDeps {
  return {
    env: process.env,
    resolve: () => {
      const session = loadSession();
      return {
        loomDir: loomDir(),
        profile: resolveBridgeProfile(session),
        peerId: session?.peerId ? session.peerId : null,
      };
    },
    stdout: (l) => console.log(l),
    stdoutBytes: (b) => {
      process.stdout.write(b);
    },
    stderr: (l) => console.error(l),
  };
}
