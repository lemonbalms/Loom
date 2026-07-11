#!/usr/bin/env bun
import {
  ensureRelay,
  loadSession,
  saveSession,
  clearSession,
  setActiveProfile,
  getActiveProfile,
  sessionPath,
  relayClientOptsFromSession,
  RelayClient,
  renderPresenceBar,
  renderPeerTable,
  renderInbox,
  formatIncomingHandoff,
  runPtySpike,
  formatSpikeReport,
  startStickyHostProcess,
  stopStickyHostProcess,
  resolveLiveHostMeta,
  resolveAliveHostMeta,
  describeHostMeta,
  stickyRpc,
  opsListPeers,
  opsHandoff,
  opsChat,
  opsListInbox,
  opsClaim,
  loadContextPack,
  setPackSummary,
  addPackPath,
  removePackPath,
  addPackNote,
  clearContextPack,
  formatContextPack,
  packIsEmpty,
  loadTaskBoard,
  updateTask,
  removeTask,
  clearDoneTasks,
  formatTaskBoard,
  parseTaskStatus,
  addTaskFromHandoff,
  exportBoardSnapshot,
  importBoardSnapshot,
  snapshotFromAttachments,
  resolveHandoffEntryIndex,
  loadPurpose,
  setPurpose,
  clearPurpose,
  formatPurpose,
  purposeAsAttachment,
  hashVerifyList,
  readVerifyAck,
  writeVerifyAck,
  addTaskWithOptionalNotify,
  assignTaskWithOptionalNotify,
  listMyOpenTasks,
  clampWatchIntervalMs,
  SLASH_HELP,
  loomDir,
} from "@loom/host";
import {
  DEFAULT_RELAY_HOST,
  DEFAULT_RELAY_PORT,
  type AgentKind,
  ansiFg,
  encodeInviteLink,
  parseInviteArg,
  parseRelayUrl,
  sanitizePeerName,
  sanitizePeerText,
  parseHandoffContract,
} from "@loom/protocol";
import {
  getAdapter,
  detectAvailableAgents,
  listAdapters,
  pickDefaultAdapter,
  capabilityMatrix,
} from "@loom/adapters";
import {
  writeMcpConfig,
  writeAgentHintFile,
  resolveMcpStdio,
} from "@loom/mcp-server";
import { spawn as nodeSpawn, spawnSync } from "node:child_process";
import {
  openSync,
  closeSync,
  writeSync,
  readSync,
  existsSync,
  readdirSync,
} from "node:fs";
import { join as pathJoin } from "node:path";

const VERSION = "0.19.0";

/**
 * Write to fd 1/2 without going through Node/Bun stream or node:tty WriteStream.
 * Bun on macOS can throw `EINVAL: invalid argument, kqueue` on process.stderr.write
 * when a TTY WriteStream is constructed (Owner dogfood `loom run shell`).
 */
function eprint(msg: string): void {
  try {
    writeSync(2, msg);
  } catch {
    try {
      // biome-ignore lint/suspicious/noControlCharactersInRegex: \x1b is the ANSI ESC char; the regex deliberately strips color escape sequences
      console.error(msg.replace(/\x1b\[[0-9;]*m/g, "").replace(/\n$/, ""));
    } catch {
      /* last resort: silence */
    }
  }
}

function print(msg: string): void {
  try {
    writeSync(1, msg);
  } catch {
    try {
      console.log(msg.replace(/\n$/, ""));
    } catch {
      /* */
    }
  }
}

/**
 * How the user should invoke loom in hint/share strings.
 * `loom` when it resolves on PATH (0.19.0 install script links it), else the
 * repo fallback `bun run loom`. Display-only — never used for executed spawns
 * (R20 M-3: those keep their explicit invocation).
 */
let _loomCmdCache: string | undefined;
function loomCmd(): string {
  if (_loomCmdCache === undefined) {
    _loomCmdCache = Bun.which("loom") ? "loom" : "bun run loom";
  }
  return _loomCmdCache;
}
/** True when `loom` is not on PATH — gate the "use bun run loom" hint note. */
function loomOnPath(): boolean {
  return loomCmd() === "loom";
}

/** Flags that never take a value (must not swallow following positionals). */
const BOOLEAN_FLAGS = new Set([
  "help",
  "h",
  "version",
  "nested",
  "matrix",
  "verbose",
  "v",
  "write-user-config",
  "insecure-open",
  "show-token",
  "with-pack",
  "with-pack-embed",
  "with-board",
  "with-purpose",
  "notify",
  "no-notify",
  "board",
  "task",
  "yes",
  "y",
  "replace",
  "force",
  "no-host",
  "link",
  "status",
]);

function usage(): string {
  return `
loom v${VERSION} — Loom multiplayer AI terminal (PLAN ${VERSION})

Usage:
  loom [--profile <name>] [--relay <url>] [--token <secret>] room create …
  loom [--profile <name>] [--relay <url>] [--token <secret>] room join <code>
  loom room invite --link
  loom room leave
  loom peers | chat | handoff | inbox | listen | run | status | agents
  loom pack show | set | add | remove | note | clear   # room context pack
  loom purpose show | set | clear   # room purpose card (0.15)
  loom verify [--yes]               # run purpose.verify[] (M-25 gate)
  loom work | work watch [--interval ms]  # my inbox + board tasks (0.16)
  loom board | board add|set|assign|note|rm|clear-done|export|import
  loom up [--profiles a,b] [--status]   # background sticky host per profile (0.17)
  loom down [--profiles a,b]            # stop sticky hosts (idempotent)
  loom host start | stop | status   # sticky long-lived relay connection (advanced)
  loom run shell                    # Loom shell REPL (session online)
  loom run shell --nested           # real $SHELL (often exits under Bun)
  loom run claude|codex|grok|auto
  loom run codex -- -a never -s workspace-write   # forward args to agent
  loom relay [--host 0.0.0.0] [--port 7842] [--token <secret>] [--insecure-open]
  loom spike pty
  loom help

  --relay <url>         Remote/local relay (or LOOM_RELAY_URL). e.g. ws://host:7842
  --token <secret>      Shared secret (or LOOM_RELAY_TOKEN). Required if server set one.
  --show-token          Include --token in Share join hint (default: hidden)
  --with-pack           Attach local context pack to handoff (paths/notes)
  --with-pack-embed     Pack + L-5 file body embed (re-resolve allowlist at send)
  --with-board          Attach board snapshot to handoff (multi-machine share)
  --with-purpose        Attach local room purpose card to handoff
  --notify / --no-notify  board add/assign: handoff to assignee (default on if --as)
  --board               After handoff, also create a board task (or mode=task)
  --yes                 loom verify: skip TTY confirm after printing commands
  --write-user-config   Opt-in: MCP into ~/.codex or ~/.grok
  --profile <name>      Session file isolation (~/.loom/profiles/<name>.json)
  --profiles a,b,c      up/down: target these profiles (default: all with a session)
  --no-host             room create/join: skip auto-host (or LOOM_NO_AUTO_HOST=1)
  --status              loom up: show host online/offline per profile (no spawn)
  --insecure-open       Relay only: allow non-loopback bind without token (H-5)
  --                    After run <agent>, forward remaining args to the agent CLI
  LOOM_CODEX_ARGS       Optional default args for codex (space-separated)

Remote example:
  # machine A (host) — token required on 0.0.0.0
  LOOM_RELAY_HOST=0.0.0.0 LOOM_RELAY_TOKEN=secret bun run loom relay
  # machine B
  loom --relay ws://A_IP:7842 --token secret --profile bob room join LOOM-XXXX

Session isolation (same machine, 2 peers):
  loom --profile alice room create --as alice
  loom --profile bob room join LOOM-XXXX --as bob
  # or: export LOOM_SESSION=~/.loom/profiles/alice.json

Examples:
  loom --profile alice handoff @bob "the british are coming"
  loom --profile bob inbox
`.trim();
}

function defaultDisplayName(): string {
  return (
    process.env.LOOM_NAME ||
    process.env.USER ||
    process.env.LOGNAME ||
    "anon"
  );
}

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  /** Everything after bare `--` is forwarded to the child agent (e.g. codex -a never). */
  const passthrough: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--") {
      passthrough.push(...args.slice(i + 1));
      break;
    }
    if (a === "--help" || a === "-h") flags.help = true;
    else if (a.startsWith("--")) {
      const key = a.slice(2);
      if (BOOLEAN_FLAGS.has(key)) {
        flags[key] = true;
        continue;
      }
      const next = args[i + 1];
      if (next && !next.startsWith("--") && !BOOLEAN_FLAGS.has(next.replace(/^--/, ""))) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else if (a.startsWith("-") && a.length === 2) {
      // short flags treated as boolean
      flags[a.slice(1)] = true;
    } else {
      positional.push(a);
    }
  }
  return { flags, positional, passthrough };
}

function applyProfileFlags(flags: Record<string, string | boolean>) {
  if (typeof flags.profile === "string") {
    // Must beat LOOM_SESSION from parent `loom run` (dogfood multi-peer)
    setActiveProfile(flags.profile, { explicit: true });
  }
}

function relayOptsFromFlags(flags: Record<string, string | boolean>) {
  return {
    relayFlag:
      typeof flags.relay === "string" ? flags.relay : undefined,
    tokenFlag:
      typeof flags.token === "string" ? flags.token : undefined,
  };
}

/** F-2: room identity change invalidates sticky host — stop before rewrite. */
async function stopStickyBeforeSessionChange() {
  const alive = resolveAliveHostMeta();
  if (!alive) return;
  await stopStickyHostProcess();
  process.stderr.write(
    `\x1b[2mStopped sticky host (room session changing — run \`${loomCmd()} host start\` again)\x1b[0m\n`,
  );
}

/** L-33: --no-host or LOOM_NO_AUTO_HOST=1 disables auto-host on create/join. */
function autoHostDisabled(flags: Record<string, string | boolean>): boolean {
  if (flags["no-host"]) return true;
  const env = process.env.LOOM_NO_AUTO_HOST;
  return env === "1" || env === "true";
}

/**
 * 0.17 host-default: after a successful create/join, bring this profile online
 * in the background unless disabled. **Fail-soft** — never aborts the create/join
 * (L-34). join already ran `stopStickyBeforeSessionChange()`, so this is a
 * stop→restart; `startStickyHostProcess` polls up to ~8s.
 */
async function autoHostAfterSession(
  flags: Record<string, string | boolean>,
): Promise<void> {
  if (autoHostDisabled(flags)) return;
  try {
    const r = await startStickyHostProcess();
    if (r.ok) {
      console.log(
        `\x1b[2mhost auto-started (pid ${r.meta.pid}); disable with --no-host or LOOM_NO_AUTO_HOST=1\x1b[0m`,
      );
    } else {
      console.log(
        `\x1b[2mhost auto-start skipped: ${r.error} — try \`${loomCmd()} host start\` / \`host status\`\x1b[0m`,
      );
    }
  } catch (e) {
    console.log(
      `\x1b[2mhost auto-start error: ${e instanceof Error ? e.message : String(e)} (session still saved)\x1b[0m`,
    );
  }
}

/** Profiles that have an existing session file under ~/.loom/profiles/. */
function profilesWithSession(): string[] {
  const dir = pathJoin(loomDir(), "profiles");
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    if (name.endsWith(".host.json")) continue; // skip sticky meta files
    out.push(name.slice(0, -".json".length));
  }
  return out.sort();
}

function parseProfilesFlag(
  flags: Record<string, string | boolean>,
): string[] | null {
  if (typeof flags.profiles === "string") {
    return flags.profiles
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return null;
}

/**
 * 0.17 `loom up` — background sticky host per profile.
 * **M-28:** profiles are processed **sequentially (no `Promise.all`)**, fixing the
 * global session with `setActiveProfile(explicit)` before each spawn and fully
 * awaiting it — so `LOOM_SESSION` never mixes across the concurrent hosts.
 */
async function cmdUp(flags: Record<string, string | boolean>) {
  const profiles = parseProfilesFlag(flags) ?? profilesWithSession();
  if (flags.status) {
    if (profiles.length === 0) {
      console.log("loom up --status: no profiles found.");
      return;
    }
    console.log("loom up --status:");
    for (const profile of profiles) {
      setActiveProfile(profile, { explicit: true });
      const alive = resolveAliveHostMeta();
      console.log(
        alive
          ? `  ${profile.padEnd(14)} online   pid ${alive.pid}  ${alive.displayName} @ ${alive.roomName}`
          : `  ${profile.padEnd(14)} offline`,
      );
    }
    return;
  }
  if (profiles.length === 0) {
    console.error(
      "loom up: no profiles with a session under ~/.loom/profiles/.",
    );
    console.error(
      `Create/join first (${loomCmd()} --profile impl room create --as impl) or pass --profiles a,b.`,
    );
    process.exit(1);
  }
  console.log("loom up — sticky hosts:");
  for (const profile of profiles) {
    setActiveProfile(profile, { explicit: true });
    if (!existsSync(sessionPath()) || !loadSession()) {
      console.log(`  ${profile.padEnd(14)} skipped  (no session)`);
      continue;
    }
    const r = await startStickyHostProcess();
    if (r.ok) {
      console.log(
        `  ${profile.padEnd(14)} ${r.alreadyRunning ? "already  " : "online   "} pid ${r.meta.pid}  ${r.meta.displayName} @ ${r.meta.roomName}`,
      );
    } else {
      console.log(`  ${profile.padEnd(14)} FAILED   ${r.error}`);
    }
  }
  console.log("");
  console.log("Peers stay online in the background (closing the terminal is OK).");
  console.log('Send:    loom board add "…" --as @peer   |   loom handoff @peer "…"');
  console.log("Process: loom --profile <name> run <agent>   (only when working)");
  console.log(`Stop:    ${loomCmd()} down`);
}

/** 0.17 `loom down` — stop sticky hosts. M-28: sequential per profile. */
async function cmdDown(flags: Record<string, string | boolean>) {
  const profiles = parseProfilesFlag(flags) ?? profilesWithSession();
  if (profiles.length === 0) {
    console.log("loom down: no profiles found.");
    return;
  }
  console.log("loom down — stopping sticky hosts:");
  for (const profile of profiles) {
    setActiveProfile(profile, { explicit: true });
    const r = await stopStickyHostProcess();
    console.log(`  ${profile.padEnd(14)} ${r.message}`);
  }
}

async function cmdRoomCreate(flags: Record<string, string | boolean>) {
  await stopStickyBeforeSessionChange();
  const { url, endpoint, remote } = await ensureRelay(relayOptsFromFlags(flags));
  const roomName = sanitizePeerText(String(flags.name || "room")) || "room";
  const displayName = sanitizePeerName(
    String(flags.as || defaultDisplayName()),
  );
  const client = new RelayClient({ url, token: endpoint.token });
  const env = await client.createRoom({
    roomName,
    displayName,
    agentKind: "unknown",
  });
  if (env.type === "error") {
    console.error(`Error: ${env.message}`);
    process.exit(1);
  }
  if (env.type !== "room.state") {
    console.error("Unexpected response");
    process.exit(1);
  }
  const me = env.peers.find((p) => p.id === client.peerId) ?? env.peers[0]!;
  saveSession({
    roomId: env.roomId,
    roomName: env.roomName ?? roomName,
    inviteCode: env.inviteCode ?? "",
    peerId: me.id,
    displayName: me.displayName,
    color: me.color,
    agentKind: "unknown",
    relayUrl: url,
    relayToken: endpoint.token,
    peerSecret: env.peerSecret ?? client.peerSecret ?? undefined,
    updatedAt: new Date().toISOString(),
  });
  console.log(
    renderPresenceBar({
      roomName: env.roomName ?? roomName,
      peers: env.peers,
      meId: me.id,
    }),
  );
  console.log("");
  console.log(`Invite code: \x1b[1m${env.inviteCode}\x1b[0m`);
  const baseRelay = endpoint.wsUrl;
  const needsRelayFlags =
    remote ||
    Boolean(endpoint.token) ||
    endpoint.port !== DEFAULT_RELAY_PORT ||
    !endpoint.isLocal;
  const showToken = Boolean(flags["show-token"]);
  const tokenPart =
    showToken && endpoint.token ? ` --token ${endpoint.token}` : "";
  const joinHint = needsRelayFlags
    ? `${loomCmd()} --relay ${baseRelay}${tokenPart} room join ${env.inviteCode}`
    : `${loomCmd()} room join ${env.inviteCode}`;
  console.log(`Share: ${joinHint}`);
  if (endpoint.token && !showToken) {
    console.log(
      `\x1b[2m(token hidden — pass --token on join, or re-run create with --show-token)\x1b[0m`,
    );
  }
  console.log(`Session: ${sessionPath()}`);
  console.log(
    `Relay: ${url}${remote ? " (remote)" : endpoint.isLocal ? " (local)" : ""}`,
  );
  console.log("");
  console.log(
    `Next: ${loomCmd()} listen   or   ${loomCmd()} run claude`,
  );
  if (!loomOnPath()) {
    console.log(
      "\x1b[2m(if `loom` is not on PATH, always use `bun run loom` from repo root — or run scripts/install.sh)\x1b[0m",
    );
  }
  client.close();
  await autoHostAfterSession(flags);
  process.exit(0);
}

async function cmdRoomJoin(
  code: string,
  flags: Record<string, string | boolean>,
) {
  const parsed = parseInviteArg(code);
  if (parsed.kind === "invalid") {
    console.error(`Error: invalid invite (${parsed.reason})`);
    process.exit(1);
  }
  let effectiveInviteCode: string;
  let relayOpts: ReturnType<typeof relayOptsFromFlags>;
  if (parsed.kind === "code") {
    effectiveInviteCode = parsed.code;
    relayOpts = relayOptsFromFlags(flags);
  } else {
    effectiveInviteCode = parsed.inviteCode;
    let relayFlag = parsed.relayUrl;
    let tokenFlag = parsed.token;
    if (typeof flags.relay === "string") {
      relayFlag = flags.relay;
      console.error("Note: --relay overrides the link's embedded relay URL");
    }
    if (typeof flags.token === "string") {
      tokenFlag = flags.token;
      console.error("Note: --token overrides the link's embedded token");
    }
    relayOpts = { relayFlag, tokenFlag };
  }
  await stopStickyBeforeSessionChange();
  const { url, endpoint, remote } = await ensureRelay(relayOpts);
  const displayName = sanitizePeerName(
    String(flags.as || defaultDisplayName()),
  );
  const client = new RelayClient({ url, token: endpoint.token });
  const session = loadSession();
  const reuse = Boolean(
    session?.peerId &&
      session?.inviteCode &&
      session.inviteCode.toUpperCase() === effectiveInviteCode.toUpperCase(),
  );
  let env = await client.joinRoom(
    reuse && session
      ? {
          inviteCode: effectiveInviteCode,
          displayName,
          agentKind: "unknown",
          peerId: session.peerId,
          peerSecret: session.peerSecret,
        }
      : {
          inviteCode: effectiveInviteCode,
          displayName,
          agentKind: "unknown",
        },
  );
  if (reuse && env.type === "error" && env.code === "peer_auth_failed") {
    env = await client.joinRoom({
      inviteCode: effectiveInviteCode,
      displayName,
      agentKind: "unknown",
    });
    console.error(
      "\x1b[2m(peer identity could not be reused — rejoined as a new peer)\x1b[0m",
    );
  }
  if (env.type === "error") {
    console.error(`Error: ${env.message}`);
    process.exit(1);
  }
  if (env.type !== "room.state") {
    console.error("Unexpected response");
    process.exit(1);
  }
  const me = env.peers.find((p) => p.id === client.peerId)!;
  saveSession({
    roomId: env.roomId,
    roomName: env.roomName ?? "room",
    inviteCode: env.inviteCode ?? effectiveInviteCode,
    peerId: me.id,
    displayName: me.displayName,
    color: me.color,
    agentKind: "unknown",
    relayUrl: url,
    relayToken: endpoint.token,
    peerSecret: env.peerSecret ?? client.peerSecret ?? undefined,
    updatedAt: new Date().toISOString(),
  });
  console.log(
    renderPresenceBar({
      roomName: env.roomName ?? "room",
      peers: env.peers,
      meId: me.id,
    }),
  );
  console.log("");
  console.log(`Joined room. Invite: ${env.inviteCode}`);
  console.log(`Session: ${sessionPath()}`);
  console.log(`Relay: ${url}${remote ? " (remote)" : " (local)"}`);
  console.log(
    `Next: ${loomCmd()} listen   or   ${loomCmd()} run claude`,
  );
  if (!loomOnPath()) {
    console.log(
      "\x1b[2m(if `loom` is not on PATH, always use `bun run loom` from repo root — or run scripts/install.sh)\x1b[0m",
    );
  }
  client.close();
  await autoHostAfterSession(flags);
  process.exit(0);
}

async function cmdRoomInvite(flags: Record<string, string | boolean>) {
  const session = loadSession();
  if (!session) {
    console.log("No session. Create or join a room first.");
    process.exit(1);
  }
  if (!flags.link) {
    console.log(`Invite code: ${session.inviteCode}`);
    console.log("Run with --link for a portable cross-machine join blob.");
    process.exit(0);
  }

  const { isLoopbackHost } = await import("@loom/relay");
  const host = parseRelayUrl(session.relayUrl).host;
  if (isLoopbackHost(host)) {
    console.error(
      "\x1b[33mWarning: this invite link only works on this machine; run the relay on a reachable host for others to join.\x1b[0m",
    );
  }
  const link = encodeInviteLink({
    relayUrl: session.relayUrl,
    token: session.relayToken,
    inviteCode: session.inviteCode,
  });
  console.log(link);
  console.log(
    "\x1b[2mThis blob is a bearer secret; whoever has it can join as invited.\x1b[0m",
  );
  process.exit(0);
}

/** One-shot client when sticky host is not used (leave / listen / run). */
async function withSessionClient(
  onEnvelope?: (env: import("@loom/protocol").Envelope) => void,
) {
  const session = loadSession();
  if (!session) {
    console.error(
      "No session. Create or join a room first. Use --profile for multi-peer on one machine.",
    );
    process.exit(1);
  }
  await ensureRelay({
    relayFlag: session.relayUrl,
    tokenFlag: session.relayToken,
  });
  const client = new RelayClient({
    ...relayClientOptsFromSession(session),
    onEnvelope,
  });
  const env = await client.joinRoom({
    inviteCode: session.inviteCode,
    displayName: session.displayName,
    agentKind: session.agentKind,
    peerId: session.peerId,
    color: session.color,
    peerSecret: session.peerSecret,
  });
  if (env.type === "error") {
    console.error(`Error: ${env.message}`);
    process.exit(1);
  }
  // refresh secret if relay re-issued
  if (env.type === "room.state" && env.peerSecret) {
    saveSession({
      ...session,
      peerSecret: env.peerSecret,
      updatedAt: new Date().toISOString(),
    });
  }
  return { client, session: loadSession() ?? session };
}

function viaNote(source: "host" | "oneshot") {
  if (source === "host") {
    process.stderr.write("\x1b[2m(via sticky host)\x1b[0m\n");
  }
}

async function cmdPeers() {
  const r = await opsListPeers();
  viaNote(r.source);
  console.log(
    renderPresenceBar({
      roomName: r.roomName,
      peers: r.peers,
      meId: r.meId,
    }),
  );
  console.log("");
  console.log(renderPeerTable(r.peers, r.meId));
  process.exit(0);
}

async function cmdChat(text: string) {
  const r = await opsChat(text);
  viaNote(r.source);
  console.log("chat sent");
  process.exit(0);
}

async function cmdHandoff(
  to: string,
  body: string,
  flags: Record<string, string | boolean> = {},
) {
  const withPackEmbed = Boolean(flags["with-pack-embed"]);
  const withPack = Boolean(flags["with-pack"]) || withPackEmbed;
  const withBoard = Boolean(flags["with-board"]);
  const withPurpose = Boolean(flags["with-purpose"]);
  const mode = flags.task || flags.mode === "task" ? "task" : "message";
  // --board / mode=task → create linked task; --with-board → attach snapshot
  const createTask = Boolean(flags.board) || mode === "task";
  let attachments: import("@loom/protocol").HandoffAttachment[] | undefined;
  if (withPurpose) {
    try {
      const p = loadPurpose();
      if (p && p.purpose) {
        attachments = [purposeAsAttachment(p)];
      }
    } catch {
      /* */
    }
  }
  const ack = await opsHandoff({
    to,
    body: sanitizePeerText(body),
    withPack,
    withPackEmbed,
    withBoard,
    mode,
    attachments,
  });
  viaNote(ack.source);
  console.log(
    `handoff ${ack.status} → ${ack.to} (recipients=${ack.recipientCount}, notified=${ack.notified}, id=${ack.handoffId})`,
  );
  if (ack.packAttached) {
    console.log(
      ack.packEmbedded
        ? "(context pack attached + file bodies embedded)"
        : "(context pack attached)",
    );
  } else if (withPack) console.log("(pack empty — nothing attached)");
  if (ack.boardAttached) console.log("(board snapshot attached)");
  else if (withBoard) console.log("(board empty — nothing attached)");
  if (withPurpose) {
    console.log(
      attachments?.length
        ? "(purpose card attached)"
        : "(purpose empty — nothing attached)",
    );
  }
  if (ack.message) console.log(ack.message);
  if (createTask && ack.handoffId && ack.status !== "peer_unknown") {
    try {
      const assignee =
        to === "*" ? undefined : to.replace(/^@/, "");
      const task = addTaskFromHandoff({
        title: sanitizePeerText(body).slice(0, 200) || "handoff task",
        assignee,
        handoffId: ack.handoffId,
      });
      console.log(`board task ${task.id} (${task.status}) linked to handoff`);
    } catch (e) {
      console.error(
        `board task not created: ${e instanceof Error ? e.message : e}`,
      );
    }
  }
  process.exit(0);
}

async function cmdPurpose(
  sub: string | undefined,
  rest: string[],
  flags: Record<string, string | boolean>,
) {
  if (!loadSession()) {
    console.error("No session. Create or join a room first.");
    process.exit(1);
  }
  const action = sub || "show";
  try {
    if (action === "show" || action === "list") {
      const p = loadPurpose();
      if (!p || !p.purpose) {
        console.log("No purpose set. Use: loom purpose set \"one-line purpose\"");
        return;
      }
      console.log(formatPurpose(p));
      return;
    }
    if (action === "clear") {
      clearPurpose();
      console.log("Purpose cleared (empty card written).");
      return;
    }
    if (action === "set") {
      // loom purpose set "text" [--verify "cmd1" --verify "cmd2"] via rest + flags
      const purposeText =
        rest.length > 0
          ? rest.join(" ")
          : typeof flags.purpose === "string"
            ? flags.purpose
            : "";
      if (!purposeText && flags.verify === undefined) {
        console.error(
          'Usage: loom purpose set "one-line purpose" [--verify "bun test"]',
        );
        process.exit(1);
      }
      // Collect verify from repeated --verify= or single string
      let verify: string[] | undefined;
      if (typeof flags.verify === "string") {
        verify = [flags.verify];
      }
      // Also accept --success / freeform later; keep minimal
      const p = setPurpose({
        purpose: purposeText || undefined,
        verify,
        allowVerify: true, // M-24: CLI only
      });
      console.log(formatPurpose(p));
      return;
    }
    console.error("Usage: loom purpose show|set|clear");
    process.exit(1);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

async function cmdWork(
  sub: string | undefined,
  flags: Record<string, string | boolean>,
) {
  if (!loadSession()) {
    console.error("No session. Create or join a room first.");
    process.exit(1);
  }
  const action = sub || "list";

  async function printWorkOnce(): Promise<{
    inboxIds: string[];
    taskIds: string[];
  }> {
    const inbox = await opsListInbox();
    viaNote(inbox.source);
    const tasks = listMyOpenTasks();
    console.log(`Inbox (${inbox.count}):`);
    if (inbox.entries.length === 0) console.log("  (empty)");
    for (const e of inbox.entries) {
      const c = parseHandoffContract(e.handoff.body);
      const tag = c.tags.length ? ` [${c.tags.join(",")}]` : "";
      console.log(
        `  ${e.handoff.id}${tag}  ${e.handoff.body.slice(0, 80).replace(/\n/g, " ")}`,
      );
    }
    console.log(`My open board tasks (${tasks.length}):`);
    if (tasks.length === 0) console.log("  (none)");
    for (const t of tasks) {
      console.log(
        `  ${t.id}  [${t.status}]  ${t.title}${t.handoffId ? `  ho=${t.handoffId}` : ""}`,
      );
    }
    return {
      inboxIds: inbox.entries.map((e) => e.handoff.id),
      taskIds: tasks.map((t) => t.id),
    };
  }

  if (action === "watch") {
    const rawInterval =
      typeof flags.interval === "string"
        ? Number(flags.interval)
        : undefined;
    const { ms, clamped } = clampWatchIntervalMs(rawInterval);
    if (clamped) {
      console.error(
        `watch interval clamped to ${ms}ms (L-31 min 250ms; default 2000)`,
      );
    }
    console.log(`work watch every ${ms}ms (Ctrl+C to stop)`);
    let prevInbox = new Set<string>();
    let prevTasks = new Set<string>();
    const first = await printWorkOnce();
    prevInbox = new Set(first.inboxIds);
    prevTasks = new Set(first.taskIds);
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await Bun.sleep(ms);
      try {
        const inbox = await opsListInbox();
        const tasks = listMyOpenTasks();
        for (const e of inbox.entries) {
          if (!prevInbox.has(e.handoff.id)) {
            const c = parseHandoffContract(e.handoff.body);
            eprint(
              `\x1b[33m[+inbox] ${e.handoff.id}${c.tags.length ? ` [${c.tags.join(",")}]` : ""}\x1b[0m ${e.handoff.body.slice(0, 60).replace(/\n/g, " ")}\n`,
            );
          }
        }
        for (const t of tasks) {
          if (!prevTasks.has(t.id)) {
            eprint(
              `\x1b[33m[+task] ${t.id} [${t.status}] ${t.title}\x1b[0m\n`,
            );
          }
        }
        prevInbox = new Set(inbox.entries.map((e) => e.handoff.id));
        prevTasks = new Set(tasks.map((t) => t.id));
      } catch (e) {
        eprint(
          `watch error: ${e instanceof Error ? e.message : e}\n`,
        );
      }
    }
  }

  if (action === "list" || action === "show" || action === "ls") {
    await printWorkOnce();
    return;
  }
  console.error("Usage: loom work | loom work watch [--interval ms]");
  process.exit(1);
}

/**
 * M-25: print verify[] verbatim; require ack hash match or TTY/--yes.
 */
async function cmdVerify(flags: Record<string, string | boolean>) {
  if (!loadSession()) {
    console.error("No session. Create or join a room first.");
    process.exit(1);
  }
  const session = loadSession()!;
  let p: ReturnType<typeof loadPurpose>;
  try {
    p = loadPurpose();
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
  if (!p || p.verify.length === 0) {
    console.log("No verify recipes on purpose (empty). Nothing to run.");
    process.exit(0);
  }
  console.log("Commands to run (purpose.verify[]):");
  for (const c of p.verify) {
    console.log(`  $ ${c}`);
  }
  const hash = hashVerifyList(p.verify);
  const prev = readVerifyAck(session.roomId);
  const forceYes = Boolean(flags.yes || flags.y);
  if (prev !== hash) {
    if (!forceYes) {
      if (!process.stdin.isTTY) {
        console.error(
          "verify[] changed or not yet acknowledged. Re-run with --yes after reviewing the list above (M-25).",
        );
        process.exit(2);
      }
      process.stdout.write("Run these commands? [y/N] ");
      const answer = await new Promise<string>((resolve) => {
        const chunks: Buffer[] = [];
        process.stdin.once("data", (d) => {
          chunks.push(Buffer.from(d));
          resolve(Buffer.concat(chunks).toString("utf8"));
        });
      });
      if (!/^y(es)?$/i.test(answer.trim())) {
        console.error("Aborted.");
        process.exit(1);
      }
    }
    writeVerifyAck(session.roomId, hash);
  } else if (forceYes) {
    console.log("(recipe already acknowledged; --yes noted)");
  }

  let failed = 0;
  for (const cmd of p.verify) {
    console.log(`\n→ ${cmd}`);
    const r = spawnSync(cmd, {
      shell: true,
      cwd: process.cwd(),
      stdio: "inherit",
      env: process.env,
    });
    const code = r.status ?? 1;
    if (code !== 0) {
      console.error(`Command failed (exit ${code}): ${cmd}`);
      failed = code || 1;
      break;
    }
  }
  process.exit(failed);
}

async function cmdBoard(
  sub: string | undefined,
  rest: string[],
  flags: Record<string, string | boolean>,
) {
  if (!loadSession()) {
    console.error("No session. Create or join a room first.");
    process.exit(1);
  }
  const action = sub || "show";
  try {
    if (action === "show" || action === "list" || action === "ls") {
      const board = loadTaskBoard();
      if (!board) {
        console.log("No board (no room session).");
        return;
      }
      console.log(formatTaskBoard(board));
      return;
    }
    if (action === "add") {
      const title =
        typeof flags.title === "string"
          ? flags.title
          : rest.join(" ").trim();
      if (!title) {
        console.error(
          'Usage: loom board add "title" [--as assignee] [--notify|--no-notify]',
        );
        process.exit(1);
      }
      const assignee =
        typeof flags.as === "string"
          ? flags.as
          : typeof flags.assignee === "string"
            ? flags.assignee
            : undefined;
      // 0.16.1: default notify when assignee set; --no-notify opts out
      const notify =
        Boolean(flags["no-notify"])
          ? false
          : Boolean(flags.notify) || Boolean(assignee);
      const tag =
        typeof flags.tag === "string" &&
        ["GOAL", "R-REQUEST", "R-RESULT", "VERIFY", "DONE"].includes(
          flags.tag.toUpperCase(),
        )
          ? (flags.tag.toUpperCase() as
              | "GOAL"
              | "R-REQUEST"
              | "R-RESULT"
              | "VERIFY"
              | "DONE")
          : undefined;
      const result = await addTaskWithOptionalNotify({
        title,
        assignee,
        notify,
        tag,
      });
      console.log(
        `added ${result.task.id}  [${result.task.status}]  ${result.task.title}`,
      );
      if (result.error) {
        console.error(`notify failed: ${result.error}`);
        process.exit(1);
      }
      if (result.handoffId) {
        console.log(
          `notified handoff ${result.handoffId} (status=${result.status}, notified=${result.notified})`,
        );
      }
      return;
    }
    if (action === "set" || action === "status") {
      const id = rest[0];
      const statusRaw =
        typeof flags.status === "string"
          ? flags.status
          : rest[1] || "";
      if (!id || !statusRaw) {
        console.error(
          "Usage: loom board set <task_id> <todo|doing|done|blocked|cancelled>",
        );
        process.exit(1);
      }
      const status = parseTaskStatus(statusRaw);
      if (!status) {
        console.error(`Invalid status: ${statusRaw}`);
        process.exit(1);
      }
      const task = updateTask(id, { status });
      console.log(`updated ${task.id} → ${task.status}  ${task.title}`);
      return;
    }
    if (action === "assign") {
      const id = rest[0];
      const who = rest[1] || (typeof flags.as === "string" ? flags.as : "");
      if (!id || !who) {
        console.error(
          "Usage: loom board assign <task_id> <@name|name> [--notify|--no-notify]",
        );
        process.exit(1);
      }
      const notify = Boolean(flags["no-notify"])
        ? false
        : Boolean(flags.notify) || true; // default notify on assign
      const result = await assignTaskWithOptionalNotify({
        taskId: id,
        assignee: who.replace(/^@/, ""),
        notify,
      });
      console.log(`assigned ${result.task.id} → @${result.task.assignee}`);
      if (result.error) {
        console.error(`notify failed: ${result.error}`);
        process.exit(1);
      }
      if (result.handoffId) {
        console.log(
          `notified handoff ${result.handoffId} (status=${result.status}, notified=${result.notified})`,
        );
      }
      return;
    }
    if (action === "note") {
      const id = rest[0];
      const note = rest.slice(1).join(" ").trim();
      if (!id || !note) {
        console.error("Usage: loom board note <task_id> <text>");
        process.exit(1);
      }
      const task = updateTask(id, { notes: note });
      console.log(`note on ${task.id}: ${task.notes}`);
      return;
    }
    if (action === "rm" || action === "remove") {
      const id = rest[0];
      if (!id) {
        console.error("Usage: loom board rm <task_id>");
        process.exit(1);
      }
      if (!removeTask(id)) {
        console.error(`task not found: ${id}`);
        process.exit(1);
      }
      console.log(`removed ${id}`);
      return;
    }
    if (action === "clear-done") {
      // L-7: no bare `clear` alias; require --yes
      if (!flags.yes && !flags.y) {
        console.error(
          "Usage: loom board clear-done --yes  (removes done/cancelled tasks)",
        );
        process.exit(1);
      }
      const n = clearDoneTasks();
      console.log(`removed ${n} done/cancelled task(s)`);
      return;
    }
    if (action === "export") {
      const snap = exportBoardSnapshot();
      const outPath =
        typeof flags.out === "string"
          ? flags.out
          : rest[0] || "";
      const json = JSON.stringify(snap, null, 2) + "\n";
      if (outPath) {
        await Bun.write(outPath, json);
        console.log(`exported ${snap.tasks.length} task(s) → ${outPath}`);
      } else {
        process.stdout.write(json);
      }
      return;
    }
    if (action === "import") {
      const mode =
        flags.replace || flags.mode === "replace" ? "replace" : "merge";
      const fromFile =
        typeof flags.file === "string"
          ? flags.file
          : rest[0] || "";
      let raw: unknown;
      if (fromFile === "-" || !fromFile) {
        const text = await new Response(Bun.stdin).text();
        raw = JSON.parse(text);
      } else {
        raw = JSON.parse(await Bun.file(fromFile).text());
      }
      const board = importBoardSnapshot(raw, mode, undefined, {
        force: Boolean(flags.force),
      });
      console.log(
        `imported ${mode}: ${board.tasks.length} task(s) on room board`,
      );
      console.log(formatTaskBoard(board));
      return;
    }
    if (action === "import-handoff" || action === "apply") {
      const hoId = rest[0];
      if (!hoId) {
        console.error(
          "Usage: loom board import-handoff <handoff_id> [--replace] [--force]",
        );
        process.exit(1);
      }
      const inbox = await opsListInbox();
      // M-12: exact → unique suffix (same as resolveTaskIndex)
      let entry: (typeof inbox.entries)[number];
      try {
        const idx = resolveHandoffEntryIndex(inbox.entries, hoId);
        entry = inbox.entries[idx]!;
      } catch (e) {
        console.error(
          `${e instanceof Error ? e.message : e} (try loom inbox)`,
        );
        process.exit(1);
      }
      const snap = snapshotFromAttachments(entry.handoff.attachments);
      if (!snap) {
        console.error("no loom-board-snapshot attachment on that handoff");
        process.exit(1);
      }
      const mode = flags.replace ? "replace" : "merge";
      const board = importBoardSnapshot(snap, mode, undefined, {
        force: Boolean(flags.force),
      });
      console.log(
        `applied board snapshot from ${entry.handoff.id} (${mode}): ${board.tasks.length} task(s)`,
      );
      console.log(formatTaskBoard(board));
      return;
    }
    if (action === "clear") {
      console.error(
        'Did you mean "loom board clear-done --yes"? (bare "clear" removed)',
      );
      process.exit(1);
    }
    console.error(
      "Usage: loom board [show|add|set|assign|note|rm|clear-done|export|import|import-handoff]",
    );
    process.exit(1);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

async function cmdPack(sub: string | undefined, rest: string[], flags: Record<string, string | boolean>) {
  if (!loadSession()) {
    console.error("No session. Create or join a room first.");
    process.exit(1);
  }
  const action = sub || "show";
  try {
    if (action === "show" || action === "status") {
      const pack = loadContextPack();
      if (!pack) {
        console.log("No pack (no room session).");
        return;
      }
      console.log(formatContextPack(pack));
      if (packIsEmpty(pack)) {
        console.log(
          "\nTip: loom pack set \"summary…\" | pack add <path> | pack note <text>",
        );
      }
      return;
    }
    if (action === "set") {
      const summary =
        typeof flags.summary === "string"
          ? flags.summary
          : rest.join(" ").trim();
      if (!summary) {
        console.error('Usage: loom pack set "summary text"');
        process.exit(1);
      }
      const pack = setPackSummary(summary);
      console.log("Summary updated.");
      console.log(formatContextPack(pack));
      return;
    }
    if (action === "add") {
      const pathArg = rest[0] || (typeof flags.path === "string" ? flags.path : "");
      if (!pathArg) {
        console.error("Usage: loom pack add <path-under-cwd>");
        process.exit(1);
      }
      const pack = addPackPath(pathArg, {
        label: typeof flags.label === "string" ? flags.label : undefined,
      });
      console.log(`Added path: ${pathArg}`);
      console.log(formatContextPack(pack));
      return;
    }
    if (action === "remove" || action === "rm") {
      const pathArg = rest[0] || "";
      if (!pathArg) {
        console.error("Usage: loom pack remove <path>");
        process.exit(1);
      }
      const pack = removePackPath(pathArg);
      console.log(`Removed path: ${pathArg}`);
      console.log(formatContextPack(pack));
      return;
    }
    if (action === "note") {
      const note = rest.join(" ").trim();
      if (!note) {
        console.error("Usage: loom pack note <text>");
        process.exit(1);
      }
      const pack = addPackNote(note);
      console.log("Note added.");
      console.log(formatContextPack(pack));
      return;
    }
    if (action === "clear") {
      const pack = clearContextPack();
      console.log("Pack cleared.");
      console.log(formatContextPack(pack));
      return;
    }
    console.error(
      "Usage: loom pack show|set|add|remove|note|clear",
    );
    process.exit(1);
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

async function peerNameResolver(): Promise<(id: string) => string | undefined> {
  try {
    const r = await opsListPeers();
    const map = new Map(
      r.peers.map((p) => [p.id, p.displayName] as const),
    );
    return (id: string) => map.get(id);
  } catch {
    return () => undefined;
  }
}

async function cmdInbox() {
  const r = await opsListInbox();
  viaNote(r.source);
  const peerName = await peerNameResolver();
  console.log(renderInbox(r.entries, { peerName }));
  process.exit(0);
}

async function cmdInboxAccept(id: string) {
  const result = await opsClaim(id, "accept");
  viaNote(result.source);
  if (!result.ok || !result.entry) {
    console.error(result.error ?? "accept failed");
    process.exit(1);
  }
  let fromPeer: import("@loom/protocol").PeerInfo | undefined;
  try {
    const peers = await opsListPeers();
    fromPeer = peers.peers.find(
      (p) => p.id === result.entry!.handoff.fromPeerId,
    );
  } catch {
    /* offline roster ok */
  }
  console.log(formatIncomingHandoff(result.entry.handoff, fromPeer));
  console.log(
    `(accepted as ${result.session.displayName}, status=${result.entry.status})`,
  );
  process.exit(0);
}

async function cmdHost(sub: string | undefined) {
  if (sub === "start") {
    if (!loadSession()) {
      console.error("No session. Create or join a room first.");
      process.exit(1);
    }
    const r = await startStickyHostProcess();
    if (!r.ok) {
      console.error(r.error);
      process.exit(1);
    }
    console.log(
      r.alreadyRunning
        ? `Sticky host already running (pid ${r.meta.pid}, port ${r.meta.port})`
        : `Sticky host started (pid ${r.meta.pid}, port ${r.meta.port})`,
    );
    console.log(
      "CLI/MCP handoff·peers·inbox will use this host (peer stays online).",
    );
    console.log(`Stop with: ${loomCmd()} host stop`);
    console.log("(use the same --profile as start)");
    return;
  }
  if (sub === "stop") {
    const r = await stopStickyHostProcess();
    console.log(r.message);
    if (/no sticky host/i.test(r.message)) {
      console.log(
        `Tip: use the same --profile as host start, e.g. ${loomCmd()} --profile alice host stop`,
      );
    }
    return;
  }
  if (sub === "status" || !sub) {
    const live = resolveLiveHostMeta();
    console.log(describeHostMeta(live));
    if (live) {
      const st = await stickyRpc({ op: "status" }, { meta: live });
      if (st.ok && st.op === "status") {
        console.log(
          `  relay:  ${st.relayConnected ? "connected" : "disconnected"}`,
        );
      }
    } else if (!resolveAliveHostMeta()) {
      console.log(
        `Tip: ${loomCmd()} host start  — keep peer online without listen`,
      );
    }
    return;
  }
  console.error(`Usage: ${loomCmd()} host start|stop|status`);
  process.exit(1);
}

async function cmdStatus() {
  const session = loadSession();
  if (!session) {
    console.log("No active session.");
    console.log(`Looked at: ${sessionPath()}`);
    return;
  }
  let up = false;
  try {
    await ensureRelay({
      relayFlag: session.relayUrl,
      tokenFlag: session.relayToken,
    });
    up = true;
  } catch {
    up = false;
  }
  console.log("Session:");
  console.log(`  path:   ${sessionPath()}`);
  console.log(`  profile:${getActiveProfile() ?? session.profile ?? "(default)"}`);
  console.log(`  room:   ${session.roomName} (${session.roomId})`);
  console.log(`  invite: ${session.inviteCode}`);
  console.log(`  peer:   ${session.displayName} (${session.peerId})`);
  console.log(`  agent:  ${session.agentKind}`);
  console.log(`  relay:  ${session.relayUrl} ${up ? "(up)" : "(down?)"}`);
  console.log(
    `  auth:   ${session.relayToken ? "token set (not printed)" : "none"}`,
  );
  const liveHost = resolveLiveHostMeta();
  const aliveHost = resolveAliveHostMeta();
  if (liveHost) {
    console.log(
      `  host:   running pid=${liveHost.pid} port=${liveHost.port} (matched)`,
    );
  } else if (aliveHost) {
    console.log(
      `  host:   STALE pid=${aliveHost.pid} (room/peer ≠ session — RPC unused)`,
    );
  } else {
    console.log(`  host:   not running (one-shot CLI)`);
  }
}

async function cmdAgents(flags: Record<string, string | boolean>) {
  console.log("Adapters:");
  for (const a of listAdapters()) {
    const ok = await a.detect();
    console.log(`  ${ok ? "✓" : "·"} ${a.id.padEnd(8)} ${a.label}`);
  }
  const available = await detectAvailableAgents();
  if (available.length === 0) {
    console.log("\nNo AI CLIs detected. You can still: loom run shell");
  } else {
    console.log(
      `\nDefault pick: ${(await pickDefaultAdapter()).id} (claude→codex→grok→shell)`,
    );
  }

  if (flags.matrix || flags.verbose || flags.v) {
    console.log("\nCapability matrix:");
    console.log(
      "id       mcp            cli-flag  receive     tui   user-cfg",
    );
    console.log("─".repeat(62));
    for (const row of capabilityMatrix()) {
      const c = row.capabilities;
      const uc = c.userConfigWrite ?? "never";
      console.log(
        `${row.id.padEnd(8)} ${c.mcp.padEnd(14)} ${String(c.mcpCliFlag).padEnd(8)} ${c.receive.padEnd(11)} ${String(c.tui).padEnd(5)} ${uc}`,
      );
    }
  } else {
    console.log("\nTip: loom agents --matrix");
  }
}

async function cmdListen() {
  const session = loadSession();
  if (!session) {
    console.error("No session. Create or join a room first.");
    process.exit(1);
  }
  try {
    await ensureRelay({
      relayFlag: session.relayUrl,
      tokenFlag: session.relayToken,
    });
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
  console.log(
    `\x1b[2mListening on room ${session.roomName} (${session.inviteCode}) profile=${getActiveProfile() ?? "default"}. Auto-reconnect on. Ctrl+C to exit.\x1b[0m`,
  );

  const client = new RelayClient({
    ...relayClientOptsFromSession(session),
    autoReconnect: true,
    reconnectJoin: {
      inviteCode: session.inviteCode,
      displayName: session.displayName,
      agentKind: session.agentKind,
      peerId: session.peerId,
      color: session.color,
      peerSecret: session.peerSecret,
    },
    // M-13: reconnect join/auth failures must not be silent
    onError(err) {
      console.error(`\x1b[31m[relay]\x1b[0m ${err.message}`);
    },
    onEnvelope(env) {
      if (env.type === "room.state") {
        console.log(
          renderPresenceBar({
            roomName: env.roomName ?? session.roomName,
            peers: env.peers,
            meId: session.peerId,
          }),
        );
      } else if (env.type === "peer.join") {
        console.log(
          `${ansiFg(env.peer.color, sanitizePeerName(env.peer.displayName))} joined (${env.peer.agentKind})`,
        );
      } else if (env.type === "peer.presence") {
        console.log(
          `peer ${env.peerId} is now ${env.online ? "online" : "offline"}`,
        );
      } else if (env.type === "peer.leave") {
        console.log(`peer left roster: ${env.peerId}`);
      } else if (env.type === "chat") {
        const who =
          client.peers.find((p) => p.id === env.from)?.displayName ?? env.from;
        console.log(
          `\x1b[2m[chat ${sanitizePeerName(who)}]\x1b[0m ${sanitizePeerText(env.text)}`,
        );
      } else if (env.type === "handoff") {
        const from = client.peers.find((p) => p.id === env.handoff.fromPeerId);
        console.log(formatIncomingHandoff(env.handoff, from));
        console.log("\x1b[2m(also in inbox — loom inbox accept <id>)\x1b[0m");
      } else if (env.type === "inbox.state") {
        if (env.entries.length > 0) {
          console.log("\nPending inbox:");
          console.log(renderInbox(env.entries));
        }
      } else if (env.type === "error") {
        console.error(`Error: ${env.message}`);
      }
    },
  });

  const env = await client.joinRoom({
    inviteCode: session.inviteCode,
    displayName: session.displayName,
    agentKind: session.agentKind,
    peerId: session.peerId,
    color: session.color,
    peerSecret: session.peerSecret,
  });
  if (env.type === "error") {
    console.error(env.message);
    process.exit(1);
  }
  if (env.type === "room.state" && env.peerSecret) {
    saveSession({
      ...session,
      peerSecret: env.peerSecret,
      updatedAt: new Date().toISOString(),
    });
  }

  // Drain pending inbox on start (visibility)
  try {
    const pending = await client.listInbox();
    if (pending.length > 0) {
      console.log(`\x1b[33m${pending.length} handoff(s) waiting in inbox\x1b[0m`);
      console.log(renderInbox(pending));
    }
  } catch {
    /* */
  }

  let stopping = false;
  const shutdownListen = async () => {
    if (stopping) return;
    stopping = true;
    try {
      await client.leave();
    } catch {
      /* */
    }
    client.close();
    process.exit(0);
  };
  process.on("SIGINT", () => {
    void shutdownListen();
  });
  process.on("SIGTERM", () => {
    void shutdownListen();
  });

  /**
   * Interactive REPL only on TTY. Smoke/background (piped stdin) must stay
   * connected without node:readline — missing createInterface crashed listen
   * after join (peer went offline; handoffs only queued).
   */
  const stdinTty = Boolean(process.stdin.isTTY);
  if (!stdinTty) {
    // Stay online until signal; envelopes print via onEnvelope
    await new Promise<void>(() => {
      /* hang */
    });
    return;
  }

  // TTY: fd line loop (avoid node:readline / Bun WriteStream kqueue)
  const { readSync } = await import("node:fs");
  const decoder = new TextDecoder();
  let lineBuf = "";
  const handleLine = async (line: string) => {
    const t = line.trim();
    if (!t) return;
    if (t === "help" || t === "/loom help") {
      console.log(SLASH_HELP);
      console.log("Also: inbox | accept <id> | handoff @name msg | peers | quit");
    } else if (t === "peers" || t === "/loom peers") {
      await client.listPeers();
      console.log(renderPeerTable(client.peers, session.peerId));
    } else if (t === "inbox") {
      const entries = await client.listInbox();
      console.log(renderInbox(entries));
    } else if (t.startsWith("accept ")) {
      const id = t.slice(7).trim();
      const result = await client.claimHandoff(id, "accept");
      if (result.ok && result.entry) {
        const from = client.peers.find(
          (p) => p.id === result.entry!.handoff.fromPeerId,
        );
        console.log(formatIncomingHandoff(result.entry.handoff, from));
      } else {
        console.error(result.error);
      }
    } else if (t.startsWith("chat ") || t.startsWith("/loom chat ")) {
      const text = t.replace(/^(\/loom )?chat\s+/, "");
      await client.chat(text);
    } else if (t.startsWith("handoff ") || t.startsWith("/loom handoff ")) {
      const payload = t.replace(/^(\/loom )?handoff\s+/, "");
      const m = /^(@[\w.-]+|\*|[\w.-]+)\s+(.+)$/s.exec(payload);
      if (m) {
        const ack = await client.handoff({ to: m[1]!, body: m[2]! });
        console.log(`handoff ${ack.status} id=${ack.handoffId}`);
      } else {
        const ack = await client.handoff({ to: "*", body: payload });
        console.log(`handoff ${ack.status} id=${ack.handoffId}`);
      }
    } else if (t === "quit" || t === "exit") {
      await shutdownListen();
    } else {
      await client.chat(t);
    }
  };

  eprint("loom> ");
  const buf = Buffer.alloc(1024);
  while (!stopping) {
    let n = 0;
    try {
      n = readSync(0, buf, 0, buf.length, null);
    } catch {
      await Bun.sleep(50);
      continue;
    }
    if (n === 0) {
      await Bun.sleep(50);
      continue;
    }
    lineBuf += decoder.decode(buf.subarray(0, n), { stream: true });
    while (true) {
      const idx = lineBuf.indexOf("\n");
      if (idx < 0) break;
      const line = lineBuf.slice(0, idx);
      lineBuf = lineBuf.slice(idx + 1);
      await handleLine(line);
      if (!stopping) eprint("loom> ");
    }
  }
}

async function cmdRun(
  agentIdRaw: string | undefined,
  flags: Record<string, string | boolean>,
  agentExtraArgs: string[] = [],
) {
  const session = loadSession();
  if (!session) {
    console.error("No session. Create or join a room first.");
    process.exit(1);
  }

  let adapter: Awaited<ReturnType<typeof getAdapter>>;
  if (!agentIdRaw || agentIdRaw === "auto") {
    adapter = await pickDefaultAdapter();
    process.stderr.write(
      `\x1b[2mAuto-selected agent: ${adapter.id} (${adapter.label})\x1b[0m\n`,
    );
  } else {
    adapter = getAdapter(agentIdRaw);
    if (!adapter) {
      console.error(`Unknown agent: ${agentIdRaw}`);
      console.error(`Known: ${listAdapters().map((a) => a.id).join(", ")}`);
      process.exit(1);
    }
    if (!(await adapter.detect())) {
      console.error(`${adapter.label} not found on PATH.`);
      if (agentIdRaw !== "shell") {
        console.error("Tip: loom run shell  or  loom run auto");
      }
      process.exit(1);
    }
  }

  const agentId = adapter.id;
  const agentKind = (
    ["claude", "codex", "grok", "shell"].includes(agentId)
      ? agentId
      : "unknown"
  ) as AgentKind;
  saveSession({ ...session, agentKind, updatedAt: new Date().toISOString() });

  const sessionEnv: Record<string, string> = {
    LOOM_SESSION: sessionPath(),
  };
  const profile = getActiveProfile();
  if (profile) sessionEnv.LOOM_PROFILE = profile;

  const writeUserConfig = Boolean(flags["write-user-config"]);
  if (
    writeUserConfig &&
    adapter.capabilities.userConfigWrite === "never"
  ) {
    process.stderr.write(
      `\x1b[2m--write-user-config ignored for ${adapter.id} (uses CLI flag / no global config)\x1b[0m\n`,
    );
  }

  const globalMcp = writeMcpConfig({ sessionEnv });
  writeAgentHintFile({
    agentId,
    hint: adapter.systemHint(),
  });

  const stdioPath = resolveMcpStdio();
  let agentMcpPath: string | null = null;
  if (adapter.ensureMcpConfig) {
    agentMcpPath = await adapter.ensureMcpConfig({
      cwd: process.cwd(),
      mcpStdioPath: stdioPath,
      sessionEnv,
      writeUserConfig:
        writeUserConfig && adapter.capabilities.userConfigWrite !== "never",
    });
  }

  // Claude: always --mcp-config global; others: project snippet path
  const mcpPath =
    adapter.capabilities.mcpCliFlag || !agentMcpPath ? globalMcp : agentMcpPath;
  if (writeUserConfig && adapter.capabilities.userConfigWrite === "opt-in") {
    process.stderr.write(
      `\x1b[33mWrote/updated user MCP config (session-bound). Project snippet: ${agentMcpPath ?? mcpPath}\x1b[0m\n`,
    );
  } else if (adapter.capabilities.userConfigWrite === "opt-in") {
    process.stderr.write(
      `\x1b[2mProject MCP only (${agentMcpPath ?? "n/a"}). Pass --write-user-config to install into ~/.${adapter.id === "grok" ? "grok" : "codex"}/config.toml\x1b[0m\n`,
    );
  }

  // Forward args after `loom run <agent> -- …` plus LOOM_CODEX_ARGS / LOOM_AGENT_ARGS
  const envExtra =
    agentId === "codex" && process.env.LOOM_CODEX_ARGS
      ? process.env.LOOM_CODEX_ARGS.split(/\s+/).filter(Boolean)
      : process.env.LOOM_AGENT_ARGS
        ? process.env.LOOM_AGENT_ARGS.split(/\s+/).filter(Boolean)
        : [];
  const extraArgs = [...envExtra, ...agentExtraArgs];
  if (extraArgs.length > 0) {
    eprint(
      `\x1b[2mAgent args: ${extraArgs.map((a) => JSON.stringify(a)).join(" ")}\x1b[0m\n`,
    );
  }

  const spec = await adapter.spawnSpec({
    cwd: process.cwd(),
    mcpConfigPath: mcpPath,
    env: {
      ...sessionEnv,
      LOOM_AGENT: agentId,
    },
    extraArgs,
  });

  try {
    await ensureRelay({
      relayFlag: session.relayUrl,
      tokenFlag: session.relayToken,
    });
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }

  const client = new RelayClient({
    ...relayClientOptsFromSession(session),
    autoReconnect: true,
    reconnectJoin: {
      inviteCode: session.inviteCode,
      displayName: session.displayName,
      agentKind,
      peerId: session.peerId,
      color: session.color,
      peerSecret: session.peerSecret,
    },
    // M-13: reconnect join/auth failures must not be silent
    onError(err) {
      eprint(`\x1b[31m[relay]\x1b[0m ${err.message}\n`);
    },
    onEnvelope(env) {
      if (env.type === "handoff") {
        const from = client.peers.find((p) => p.id === env.handoff.fromPeerId);
        eprint(formatIncomingHandoff(env.handoff, from));
        eprint(
          "\x1b[2m(inbox — check_handoffs / loom inbox accept)\x1b[0m\n",
        );
      } else if (env.type === "peer.join") {
        eprint(
          `\n${ansiFg(env.peer.color, sanitizePeerName(env.peer.displayName))} joined (${env.peer.agentKind})\n`,
        );
      } else if (env.type === "chat") {
        const who =
          client.peers.find((p) => p.id === env.from)?.displayName ?? env.from;
        eprint(
          `\n\x1b[2m[chat ${sanitizePeerName(who)}]\x1b[0m ${sanitizePeerText(env.text)}\n`,
        );
      } else if (env.type === "error") {
        // M-13: surface relay error envelopes during run
        eprint(`\x1b[31m[relay error]\x1b[0m ${env.message}\n`);
      }
    },
  });
  // M-13: fail-fast on join (peer_auth_failed, room_not_found, …) — do not spawn agent off-room
  const joinEnv = await client.joinRoom({
    inviteCode: session.inviteCode,
    displayName: session.displayName,
    agentKind,
    peerId: session.peerId,
    color: session.color,
    peerSecret: session.peerSecret,
  });
  if (joinEnv.type === "error") {
    eprint(`${joinEnv.message}\n`);
    client.close();
    process.exit(1);
  }
  if (joinEnv.type === "room.state" && joinEnv.peerSecret) {
    saveSession({
      ...session,
      peerSecret: joinEnv.peerSecret,
      updatedAt: new Date().toISOString(),
    });
  }

  // Drain pending inbox + my board tasks (receive path 0.15 / work bus 0.16)
  try {
    const pending = await client.listInbox();
    if (pending.length > 0) {
      eprint(
        `\x1b[33m${pending.length} handoff(s) waiting in inbox — call check_handoffs / claim / loom work\x1b[0m\n`,
      );
      for (const e of pending.slice(0, 8)) {
        const c = parseHandoffContract(e.handoff.body);
        const tag =
          c.tags.length > 0 ? ` [${c.tags.join(",")}]` : "";
        eprint(
          `  ${e.handoff.id}${tag}  ${e.handoff.body.slice(0, 72).replace(/\n/g, " ")}\n`,
        );
      }
      eprint(renderInbox(pending) + "\n");
    }
    const myTasks = listMyOpenTasks();
    if (myTasks.length > 0) {
      eprint(
        `\x1b[33m${myTasks.length} open board task(s) assigned to you (loom work)\x1b[0m\n`,
      );
      for (const t of myTasks.slice(0, 8)) {
        eprint(`  ${t.id}  [${t.status}]  ${t.title}\n`);
      }
    }
    if (pending.length > 0 || myTasks.length > 0) eprint("\n");
  } catch {
    /* ignore */
  }

  eprint(
    renderPresenceBar({
      roomName: client.roomName ?? session.roomName,
      peers: client.peers,
      meId: session.peerId,
    }) + "\n\n",
  );
  eprint(`\x1b[2mStarting ${adapter.label}…\x1b[0m\n`);
  eprint(
    `\x1b[2mMCP: ${mcpPath} · session: ${sessionPath()} · agentKind=${agentKind}\x1b[0m\n`,
  );
  eprint(
    `\x1b[2mCaps: mcp=${adapter.capabilities.mcp} receive=${adapter.capabilities.receive}\x1b[0m\n\n`,
  );

  // UC-9.2: default shell = in-process Loom REPL (no node:tty / nested zsh).
  // Opt-in: loom run shell --nested
  let code = 1;
  try {
    if (agentId === "shell") {
      if (Boolean(flags.nested)) {
        eprint(
          "\x1b[2m--nested: trying real $SHELL (may exit immediately)\x1b[0m\n",
        );
        code = await runShellAgent(spec);
      } else {
        eprint(
          "\x1b[1mLoom shell\x1b[0m — room session stays online.\n" +
            `  peers | inbox | handoff …  (or full: ${loomCmd()} …)\n` +
            "  Type \x1b[1mexit\x1b[0m to leave.\n\n",
        );
        code = await runLoomShellRepl(spec);
      }
    } else if (adapter.capabilities.tui) {
      // Claude/Codex/Grok are often Bun-based TUIs. stdio:"inherit" from a Bun
      // parent can leave a broken TTY → EINVAL kqueue inside the child (UC-9.3).
      eprint(
        "\x1b[2mStarting TUI agent with PTY wrapper (script) for Bun/macOS tty fix…\x1b[0m\n",
      );
      code = await runTuiAgent(spec);
    } else {
      code = await runAgentChild(spec);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    eprint(`\x1b[31mrun failed: ${msg}\x1b[0m\n`);
    code = 1;
  }

  try {
    client.close();
  } catch {
    /* */
  }
  process.exit(code);
}

type AgentSpec = {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string | undefined>;
};

/** Spawn agent with raw fds (non-TUI). */
function runAgentChild(spec: AgentSpec): Promise<number> {
  return spawnWait(spec.command, spec.args, spec);
}

function spawnWait(
  command: string,
  args: string[],
  spec: AgentSpec,
  opts?: { forwardWinch?: boolean },
): Promise<number> {
  return new Promise((resolve) => {
    const child = nodeSpawn(command, args, {
      cwd: spec.cwd,
      env: cleanEnv(spec.env),
      // Prefer numeric fds over "inherit" to reduce Bun stream wrapping
      stdio: [0, 1, 2],
    });
    // Loom is often the foreground process; SIGWINCH hits us, not the PTY helper.
    // Forward so python run-with-pty / Claude can resize.
    const onWinch =
      opts?.forwardWinch && child.pid
        ? () => {
            try {
              process.kill(child.pid!, "SIGWINCH");
            } catch {
              /* child gone */
            }
          }
        : null;
    if (onWinch) {
      process.on("SIGWINCH", onWinch);
    }
    const cleanup = () => {
      if (onWinch) process.off("SIGWINCH", onWinch);
    };
    child.on("error", (err) => {
      cleanup();
      eprint(`\x1b[31mFailed to start agent: ${err.message}\x1b[0m\n`);
      resolve(1);
    });
    child.on("exit", (c, signal) => {
      cleanup();
      if (signal) resolve(1);
      else resolve(c ?? 1);
    });
  });
}

/**
 * UC-9.3: give Claude/Codex/Grok a real PTY that **tracks window resize**.
 *
 * Order:
 * 1. python3 scripts/run-with-pty.py — SIGWINCH + TIOCSWINSZ (preferred)
 * 2. script(1) — PTY but often freezes cols/rows at start (macOS)
 * 3. raw [0,1,2] / /dev/tty
 */
async function runTuiAgent(spec: AgentSpec): Promise<number> {
  const attempts: Array<{ label: string; run: () => Promise<number> }> = [];
  const ptyHelper = pathJoin(
    import.meta.dir,
    "../../../scripts/run-with-pty.py",
  );
  // packages/cli/src → repo root is ../../..
  const ptyHelperAlt = pathJoin(import.meta.dir, "../../scripts/run-with-pty.py");
  const helperPath = existsSync(ptyHelper)
    ? ptyHelper
    : existsSync(ptyHelperAlt)
      ? ptyHelperAlt
      : null;

  if (helperPath && process.platform !== "win32") {
    attempts.push({
      label: "python-pty-winch",
      run: () =>
        spawnWait("python3", [helperPath, spec.command, ...spec.args], spec, {
          forwardWinch: true,
        }),
    });
  }

  if (process.platform === "darwin") {
    attempts.push({
      label: "script-pty",
      run: () =>
        spawnWait(
          "/usr/bin/script",
          ["-q", "/dev/null", spec.command, ...spec.args],
          spec,
        ),
    });
  } else if (process.platform === "linux") {
    const inner = [spec.command, ...spec.args]
      .map((a) =>
        /[\s'"\\]/.test(a) ? `'${a.replace(/'/g, `'\\''`)}'` : a,
      )
      .join(" ");
    attempts.push({
      label: "script-pty",
      run: () =>
        spawnWait("script", ["-q", "-c", inner, "/dev/null"], spec),
    });
  }

  attempts.push(
    { label: "stdio-fds", run: () => spawnWait(spec.command, spec.args, spec) },
    { label: "dev-tty", run: () => spawnOnDevTty(spec) },
  );

  let lastCode = 1;
  for (const a of attempts) {
    eprint(`\x1b[2m(tui spawn via ${a.label}…)\x1b[0m\n`);
    const t0 = Date.now();
    lastCode = await a.run();
    const ms = Date.now() - t0;
    // Stayed up a while → user likely used the TUI (or exited normally)
    if (ms >= 1500) return lastCode;
    // Instant non-zero → try next; instant zero also try next (false start)
    eprint(
      `\x1b[2m(tui via ${a.label} exited in ${ms}ms code=${lastCode} — trying next)\x1b[0m\n`,
    );
  }

  eprint(
    "\x1b[33mAll TUI spawn strategies exited quickly.\n" +
      "Workaround: leave Loom MCP configured, run Claude directly:\n" +
      `  claude --mcp-config ${process.env.HOME ?? "~"}/.loom/mcp.json\n` +
      "  (with LOOM_SESSION / LOOM_PROFILE set to this session)\x1b[0m\n",
  );
  return lastCode;
}

function spawnOnDevTty(spec: AgentSpec): Promise<number> {
  return new Promise((resolve) => {
    const fds: number[] = [];
    try {
      fds.push(
        openSync("/dev/tty", "r"),
        openSync("/dev/tty", "w"),
        openSync("/dev/tty", "w"),
      );
    } catch (e) {
      eprint(
        `\x1b[2m/dev/tty unavailable: ${e instanceof Error ? e.message : e}\x1b[0m\n`,
      );
      resolve(1);
      return;
    }
    const child = nodeSpawn(spec.command, spec.args, {
      cwd: spec.cwd,
      env: cleanEnv(spec.env),
      stdio: [fds[0]!, fds[1]!, fds[2]!],
    });
    const closeFds = () => {
      for (const fd of fds) {
        try {
          closeSync(fd);
        } catch {
          /* */
        }
      }
    };
    child.on("error", (err) => {
      closeFds();
      eprint(`\x1b[31m/dev/tty spawn failed: ${err.message}\x1b[0m\n`);
      resolve(1);
    });
    child.on("exit", (c, signal) => {
      closeFds();
      if (signal) resolve(1);
      else resolve(c ?? 1);
    });
  });
}

function cleanEnv(
  env: Record<string, string | undefined>,
): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(env)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/**
 * UC-9.2: keep an interactive shell alive.
 * 1) /dev/tty  2) macOS/Linux `script` PTY  3) inherit  4) Loom REPL
 */
async function runShellAgent(spec: AgentSpec): Promise<number> {
  const attempts: Array<{ label: string; run: () => Promise<number> }> = [
    { label: "/dev/tty", run: () => spawnShellOnDevTty(spec) },
    { label: "script-pty", run: () => spawnShellViaScript(spec) },
    { label: "inherit", run: () => runAgentChild(spec) },
  ];

  for (const a of attempts) {
    const t0 = Date.now();
    const code = await a.run();
    const ms = Date.now() - t0;
    // Stayed up ≥600ms → user had a chance to interact (or exited normally).
    if (ms >= 600) return code;
    process.stderr.write(
      `\x1b[2m(shell via ${a.label} exited in ${ms}ms code=${code} — trying next)\x1b[0m\n`,
    );
  }

  process.stderr.write(
    "\x1b[33mNested $SHELL exited immediately. Falling back to Loom shell REPL.\x1b[0m\n" +
      `Session stays active. Type commands (e.g. ${loomCmd()} peers). exit to leave.\n\n`,
  );
  return runLoomShellRepl(spec);
}

function spawnShellOnDevTty(spec: AgentSpec): Promise<number> {
  return new Promise((resolve) => {
    const fds: number[] = [];
    try {
      // separate r/w fds — sharing one fd for all three confuses some shells
      fds.push(openSync("/dev/tty", "r"), openSync("/dev/tty", "w"), openSync("/dev/tty", "w"));
    } catch {
      resolve(0); // ms≈0 → try next strategy
      return;
    }
    const child = nodeSpawn(spec.command, spec.args, {
      cwd: spec.cwd,
      env: cleanEnv(spec.env),
      stdio: [fds[0]!, fds[1]!, fds[2]!],
    });
    const closeFds = () => {
      for (const fd of fds) {
        try {
          closeSync(fd);
        } catch {
          /* */
        }
      }
      fds.length = 0;
    };
    child.on("error", (err) => {
      closeFds();
      process.stderr.write(
        `\x1b[2m/dev/tty spawn failed: ${err.message}\x1b[0m\n`,
      );
      resolve(0);
    });
    child.on("exit", (c, signal) => {
      closeFds();
      if (signal) resolve(1);
      else resolve(c ?? 1);
    });
  });
}

/** Allocate a PTY via `script` so zsh -i has a real terminal. */
function spawnShellViaScript(spec: AgentSpec): Promise<number> {
  let command: string;
  let args: string[];
  if (process.platform === "darwin") {
    command = "/usr/bin/script";
    args = ["-q", "/dev/null", spec.command, ...spec.args];
  } else if (process.platform === "linux") {
    const inner = [spec.command, ...spec.args]
      .map((a) => (a.includes(" ") ? `'${a.replace(/'/g, `'\\''`)}'` : a))
      .join(" ");
    command = "script";
    args = ["-q", "-c", inner, "/dev/null"];
  } else {
    return runAgentChild(spec);
  }
  return runAgentChild({ ...spec, command, args });
}

/**
 * Default `run shell` UI — **fd 0/1/2 only**.
 *
 * Do not touch `process.stdin` / `process.stdout` / `process.stderr` streams
 * or `*.isTTY` / readline / node:tty — Bun on macOS throws
 * `EINVAL: invalid argument, kqueue` when constructing TTY WriteStream
 * (Owner dogfood UC-9.2).
 */
async function runLoomShellRepl(spec: AgentSpec): Promise<number> {
  eprint(`\x1b[2mloom-shell v${VERSION} (fd I/O)\x1b[0m\n`);

  const shell = process.env.SHELL || "/bin/zsh";
  const env = cleanEnv({
    ...process.env,
    ...spec.env,
    LOOM_ACTIVE: "1",
    LOOM_AGENT: "shell",
    LOOM_SHELL_REPL: "1",
  });

  let stopping = false;
  const onSig = () => {
    stopping = true;
    print("\n");
  };
  process.on("SIGINT", onSig);

  const chunk = Buffer.alloc(1024);
  let lineBuf = "";
  print("loom-shell> ");

  try {
    while (!stopping) {
      let n = 0;
      try {
        // null position = read from current offset (stdin)
        n = readSync(0, chunk, 0, chunk.length, null);
      } catch (e) {
        const err = e as NodeJS.ErrnoException;
        if (err?.code === "EAGAIN" || err?.code === "EWOULDBLOCK") {
          await Bun.sleep(30);
          continue;
        }
        // EINTR etc.
        if (err?.code === "EINTR") continue;
        eprint(
          `\x1b[31mstdin read failed: ${err?.message ?? e}\x1b[0m\n`,
        );
        break;
      }
      if (n === 0) {
        // EOF
        break;
      }
      lineBuf += chunk.toString("utf8", 0, n);
      while (true) {
        const idx = lineBuf.indexOf("\n");
        if (idx < 0) break;
        const line = lineBuf.slice(0, idx).replace(/\r$/, "");
        lineBuf = lineBuf.slice(idx + 1);
        const t = line.trim();
        if (t === "exit" || t === "quit") {
          stopping = true;
          break;
        }
        if (t) {
          const loomish = t.match(
            /^(peers|inbox|status|chat|handoff|board|pack|listen)(\s|$)/,
          );
          const cmd = loomish ? `bun run loom ${t}` : line;
          try {
            // numeric stdio fds — avoid "inherit" stream construction
            spawnSync(shell, ["-c", cmd], {
              cwd: spec.cwd,
              env,
              stdio: [0, 1, 2],
            });
          } catch (err) {
            eprint(
              `\x1b[31mcommand failed: ${err instanceof Error ? err.message : err}\x1b[0m\n`,
            );
          }
        }
        if (!stopping) print("loom-shell> ");
      }
    }
  } finally {
    process.off("SIGINT", onSig);
  }

  eprint("\x1b[2mLoom shell closed.\x1b[0m\n");
  return 0;
}

async function cmdRoomLeave() {
  const session = loadSession();
  if (!session) {
    console.log("No session.");
    return;
  }
  // stop sticky host first so roster leave is clean
  try {
    await stopStickyHostProcess();
  } catch {
    /* */
  }
  try {
    const { client } = await withSessionClient();
    await client.leave();
  } catch {
    /* ignore */
  }
  clearSession();
  console.log("Left room and cleared local session.");
}

async function main() {
  const { flags, positional, passthrough } = parseArgs(process.argv);
  applyProfileFlags(flags);

  if (flags.help || positional[0] === "help" || positional.length === 0) {
    console.log(usage());
    return;
  }

  const [cmd, sub, ...rest] = positional;

  if (cmd === "room" && sub === "create") {
    await cmdRoomCreate(flags);
    return;
  }
  if (cmd === "room" && sub === "join") {
    const code = rest[0] || String(flags.code || "");
    if (!code) {
      console.error("Usage: loom room join <code>");
      process.exit(1);
    }
    await cmdRoomJoin(code, flags);
    return;
  }
  if (cmd === "room" && sub === "invite") {
    await cmdRoomInvite(flags);
    return;
  }
  if (cmd === "room" && sub === "leave") {
    await cmdRoomLeave();
    return;
  }
  if (cmd === "peers") {
    await cmdPeers();
    return;
  }
  if (cmd === "chat") {
    const text = [sub, ...rest].filter(Boolean).join(" ");
    if (!text) {
      console.error("Usage: loom chat <message>");
      process.exit(1);
    }
    await cmdChat(text);
    return;
  }
  if (cmd === "handoff") {
    if (!sub) {
      console.error("Usage: loom handoff [@name|*] <message> [--with-pack]");
      process.exit(1);
    }
    const looksTarget =
      sub.startsWith("@") || sub === "*" || /^p_[a-f0-9]+$/i.test(sub);
    if (looksTarget) {
      const body = rest.join(" ");
      if (!body) {
        console.error("Message body required");
        process.exit(1);
      }
      await cmdHandoff(sub, body, flags);
    } else {
      await cmdHandoff("*", [sub, ...rest].join(" "), flags);
    }
    return;
  }
  if (cmd === "pack") {
    await cmdPack(sub, rest, flags);
    return;
  }
  if (cmd === "purpose") {
    await cmdPurpose(sub, rest, flags);
    return;
  }
  if (cmd === "verify") {
    await cmdVerify(flags);
    return;
  }
  if (cmd === "work") {
    await cmdWork(sub, flags);
    return;
  }
  if (cmd === "board" || cmd === "tasks") {
    await cmdBoard(sub, rest, flags);
    return;
  }
  if (cmd === "inbox") {
    if (sub === "accept") {
      const id = rest[0];
      if (!id) {
        console.error("Usage: loom inbox accept <id>");
        process.exit(1);
      }
      await cmdInboxAccept(id);
      return;
    }
    await cmdInbox();
    return;
  }
  if (cmd === "status") {
    await cmdStatus();
    return;
  }
  if (cmd === "host") {
    await cmdHost(sub);
    return;
  }
  if (cmd === "up") {
    await cmdUp(flags);
    return;
  }
  if (cmd === "down") {
    await cmdDown(flags);
    return;
  }
  if (cmd === "agents") {
    await cmdAgents(flags);
    return;
  }
  if (cmd === "listen") {
    await cmdListen();
    return;
  }
  if (cmd === "run") {
    // `loom run codex -- -a never -s workspace-write`
    await cmdRun(sub, flags, [...rest, ...passthrough]);
    return;
  }
  if (cmd === "spike") {
    if (sub !== "pty" && sub !== "1.5") {
      console.error("Usage: loom spike pty");
      process.exit(1);
    }
    const report = await runPtySpike();
    process.stdout.write(formatSpikeReport(report));
    const failed = report.cases.some((c) => !c.passed);
    process.exit(failed ? 1 : 0);
  }
  if (cmd === "relay") {
    const { RelayServer, isLoopbackHost } = await import("@loom/relay");
    const { envRelayHost, envRelayPort, envRelayToken } = await import(
      "@loom/protocol"
    );
    const host =
      (typeof flags.host === "string" && flags.host) ||
      envRelayHost() ||
      DEFAULT_RELAY_HOST;
    const port = Number(
      (typeof flags.port === "string" && flags.port) ||
        envRelayPort() ||
        DEFAULT_RELAY_PORT,
    );
    const authToken =
      (typeof flags.token === "string" && flags.token) ||
      envRelayToken() ||
      undefined;
    const allowInsecureOpen = Boolean(flags["insecure-open"]);
    // R12: warn if legacy insecure env alone (does not enable open)
    if (
      !allowInsecureOpen &&
      (process.env.FABLE_RELAY_INSECURE_OPEN === "1" ||
        process.env.FABLE_RELAY_INSECURE_OPEN === "true")
    ) {
      console.warn(
        "[loom] FABLE_RELAY_INSECURE_OPEN is ignored; set LOOM_RELAY_INSECURE_OPEN=1 or --insecure-open",
      );
    }
    const server = new RelayServer({
      host,
      port,
      authToken,
      allowInsecureOpen,
    });
    try {
      server.start();
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    }
    console.log(`Loom relay on ${server.publicHint}`);
    console.log(
      `Health: http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}/health`,
    );
    if (authToken) {
      console.log(
        "Clients need: --token <same> or LOOM_RELAY_TOKEN (Bearer header preferred)",
      );
    } else if (isLoopbackHost(host)) {
      console.log("Open relay on loopback (no token)");
    } else if (allowInsecureOpen) {
      console.warn(
        "WARNING: --insecure-open — anyone on the network can create rooms",
      );
    }
    await new Promise(() => {});
    return;
  }
  if (cmd === "version" || flags.version) {
    console.log(VERSION);
    return;
  }

  console.error(`Unknown command: ${positional.join(" ")}`);
  console.log(usage());
  process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
