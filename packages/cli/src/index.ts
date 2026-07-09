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
  addTask,
  updateTask,
  removeTask,
  clearDoneTasks,
  formatTaskBoard,
  parseTaskStatus,
  addTaskFromHandoff,
  exportBoardSnapshot,
  importBoardSnapshot,
  parseBoardSnapshot,
  snapshotFromAttachments,
  resolveHandoffEntryIndex,
  SLASH_HELP,
} from "@loom/host";
import {
  DEFAULT_RELAY_HOST,
  DEFAULT_RELAY_PORT,
  type AgentKind,
  ansiFg,
  sanitizePeerName,
  sanitizePeerText,
  resolveRelayEndpoint,
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
import { spawn } from "bun";
import { createInterface } from "node:readline";

const VERSION = "0.9.4";

/** Flags that never take a value (must not swallow following positionals). */
const BOOLEAN_FLAGS = new Set([
  "help",
  "h",
  "version",
  "matrix",
  "verbose",
  "v",
  "write-user-config",
  "insecure-open",
  "show-token",
  "with-pack",
  "with-board",
  "board",
  "task",
  "yes",
  "y",
  "replace",
  "force",
]);

function usage(): string {
  return `
loom v${VERSION} — Loom multiplayer AI terminal (PLAN ${VERSION})

Usage:
  loom [--profile <name>] [--relay <url>] [--token <secret>] room create …
  loom [--profile <name>] [--relay <url>] [--token <secret>] room join <code>
  loom room leave
  loom peers | chat | handoff | inbox | listen | run | status | agents
  loom pack show | set | add | remove | note | clear   # room context pack
  loom board | board add|set|assign|note|rm|clear-done|export|import
  loom host start | stop | status   # sticky long-lived relay connection
  loom relay [--host 0.0.0.0] [--port 7842] [--token <secret>] [--insecure-open]
  loom spike pty
  loom help

  --relay <url>         Remote/local relay (or LOOM_RELAY_URL). e.g. ws://host:7842
  --token <secret>      Shared secret (or LOOM_RELAY_TOKEN). Required if server set one.
  --show-token          Include --token in Share join hint (default: hidden)
  --with-pack           Attach local context pack to handoff
  --with-board          Attach board snapshot to handoff (multi-machine share)
  --board               After handoff, also create a board task (or mode=task)
  --write-user-config   Opt-in: MCP into ~/.codex or ~/.grok
  --profile <name>      Session file isolation (~/.loom/profiles/<name>.json)
  --insecure-open       Relay only: allow non-loopback bind without token (H-5)

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
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
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
  return { flags, positional };
}

function applyProfileFlags(flags: Record<string, string | boolean>) {
  if (typeof flags.profile === "string") {
    setActiveProfile(flags.profile);
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
    "\x1b[2mStopped sticky host (room session changing — run `loom host start` again)\x1b[0m\n",
  );
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
    ? `loom --relay ${baseRelay}${tokenPart} room join ${env.inviteCode}`
    : `loom room join ${env.inviteCode}`;
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
  console.log("Next: loom listen   or   loom run claude");
  client.close();
  process.exit(0);
}

async function cmdRoomJoin(
  code: string,
  flags: Record<string, string | boolean>,
) {
  await stopStickyBeforeSessionChange();
  const { url, endpoint, remote } = await ensureRelay(relayOptsFromFlags(flags));
  const displayName = sanitizePeerName(
    String(flags.as || defaultDisplayName()),
  );
  const client = new RelayClient({ url, token: endpoint.token });
  const env = await client.joinRoom({
    inviteCode: code,
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
  const me = env.peers.find((p) => p.id === client.peerId)!;
  saveSession({
    roomId: env.roomId,
    roomName: env.roomName ?? "room",
    inviteCode: env.inviteCode ?? code,
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
  console.log("Next: loom listen   or   loom run claude");
  client.close();
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
  const withPack = Boolean(flags["with-pack"]);
  const withBoard = Boolean(flags["with-board"]);
  const mode = flags.task || flags.mode === "task" ? "task" : "message";
  // --board / mode=task → create linked task; --with-board → attach snapshot
  const createTask = Boolean(flags.board) || mode === "task";
  const ack = await opsHandoff({
    to,
    body: sanitizePeerText(body),
    withPack,
    withBoard,
    mode,
  });
  viaNote(ack.source);
  console.log(
    `handoff ${ack.status} → ${ack.to} (recipients=${ack.recipientCount}, notified=${ack.notified}, id=${ack.handoffId})`,
  );
  if (ack.packAttached) console.log("(context pack attached)");
  else if (withPack) console.log("(pack empty — nothing attached)");
  if (ack.boardAttached) console.log("(board snapshot attached)");
  else if (withBoard) console.log("(board empty — nothing attached)");
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
        console.error('Usage: loom board add "title" [--as assignee]');
        process.exit(1);
      }
      const assignee =
        typeof flags.as === "string"
          ? flags.as
          : typeof flags.assignee === "string"
            ? flags.assignee
            : undefined;
      const task = addTask({ title, assignee });
      console.log(`added ${task.id}  [${task.status}]  ${task.title}`);
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
        console.error("Usage: loom board assign <task_id> <@name|name>");
        process.exit(1);
      }
      const task = updateTask(id, { assignee: who.replace(/^@/, "") });
      console.log(`assigned ${task.id} → @${task.assignee}`);
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
      let entry;
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

async function cmdInbox() {
  const r = await opsListInbox();
  viaNote(r.source);
  console.log(renderInbox(r.entries));
  process.exit(0);
}

async function cmdInboxAccept(id: string) {
  const result = await opsClaim(id, "accept");
  viaNote(result.source);
  if (!result.ok || !result.entry) {
    console.error(result.error ?? "accept failed");
    process.exit(1);
  }
  console.log(formatIncomingHandoff(result.entry.handoff));
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
    console.log("Stop with: loom host stop");
    return;
  }
  if (sub === "stop") {
    const r = await stopStickyHostProcess();
    console.log(r.message);
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
      console.log("Tip: loom host start  — keep peer online without listen");
    }
    return;
  }
  console.error("Usage: loom host start|stop|status");
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

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  rl.setPrompt("loom> ");
  rl.prompt();
  rl.on("line", async (line) => {
    const t = line.trim();
    if (!t) {
      rl.prompt();
      return;
    }
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
      const text = t.replace(/^(\/fable )?chat\s+/, "");
      await client.chat(text);
    } else if (t.startsWith("handoff ") || t.startsWith("/loom handoff ")) {
      const payload = t.replace(/^(\/fable )?handoff\s+/, "");
      const m = /^(@[\w.-]+|\*|[\w.-]+)\s+(.+)$/s.exec(payload);
      if (m) {
        const ack = await client.handoff({ to: m[1]!, body: m[2]! });
        console.log(`handoff ${ack.status} id=${ack.handoffId}`);
      } else {
        const ack = await client.handoff({ to: "*", body: payload });
        console.log(`handoff ${ack.status} id=${ack.handoffId}`);
      }
    } else if (t === "quit" || t === "exit") {
      await client.leave();
      rl.close();
      process.exit(0);
    } else {
      await client.chat(t);
    }
    rl.prompt();
  });

  process.on("SIGINT", async () => {
    await client.leave();
    process.exit(0);
  });
}

async function cmdRun(
  agentIdRaw: string | undefined,
  flags: Record<string, string | boolean>,
) {
  const session = loadSession();
  if (!session) {
    console.error("No session. Create or join a room first.");
    process.exit(1);
  }

  let adapter;
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

  const spec = await adapter.spawnSpec({
    cwd: process.cwd(),
    mcpConfigPath: mcpPath,
    env: {
      ...sessionEnv,
      LOOM_AGENT: agentId,
    },
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
      process.stderr.write(`\x1b[31m[relay]\x1b[0m ${err.message}\n`);
    },
    onEnvelope(env) {
      if (env.type === "handoff") {
        const from = client.peers.find((p) => p.id === env.handoff.fromPeerId);
        process.stderr.write(formatIncomingHandoff(env.handoff, from));
        process.stderr.write(
          "\x1b[2m(inbox — check_handoffs / loom inbox accept)\x1b[0m\n",
        );
      } else if (env.type === "peer.join") {
        process.stderr.write(
          `\n${ansiFg(env.peer.color, sanitizePeerName(env.peer.displayName))} joined (${env.peer.agentKind})\n`,
        );
      } else if (env.type === "chat") {
        const who =
          client.peers.find((p) => p.id === env.from)?.displayName ?? env.from;
        process.stderr.write(
          `\n\x1b[2m[chat ${sanitizePeerName(who)}]\x1b[0m ${sanitizePeerText(env.text)}\n`,
        );
      } else if (env.type === "error") {
        // M-13: surface relay error envelopes during run
        process.stderr.write(`\x1b[31m[relay error]\x1b[0m ${env.message}\n`);
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
    process.stderr.write(`${joinEnv.message}\n`);
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

  // Drain any queued handoffs into stderr on start
  try {
    const pending = await client.listInbox();
    if (pending.length > 0) {
      process.stderr.write(
        `\x1b[33m${pending.length} handoff(s) waiting in inbox\x1b[0m\n`,
      );
      process.stderr.write(renderInbox(pending) + "\n\n");
    }
  } catch {
    /* ignore */
  }

  process.stderr.write(
    renderPresenceBar({
      roomName: client.roomName ?? session.roomName,
      peers: client.peers,
      meId: session.peerId,
    }) + "\n\n",
  );
  process.stderr.write(`\x1b[2mStarting ${adapter.label}…\x1b[0m\n`);
  process.stderr.write(
    `\x1b[2mMCP: ${mcpPath} · session: ${sessionPath()} · agentKind=${agentKind}\x1b[0m\n`,
  );
  process.stderr.write(
    `\x1b[2mCaps: mcp=${adapter.capabilities.mcp} receive=${adapter.capabilities.receive}\x1b[0m\n\n`,
  );

  const proc = spawn({
    cmd: [spec.command, ...spec.args],
    cwd: spec.cwd,
    env: spec.env as Record<string, string>,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });

  const code = await proc.exited;
  client.close();
  process.exit(code);
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
  const { flags, positional } = parseArgs(process.argv);
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
  if (cmd === "agents") {
    await cmdAgents(flags);
    return;
  }
  if (cmd === "listen") {
    await cmdListen();
    return;
  }
  if (cmd === "run") {
    await cmdRun(sub, flags);
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
    const host =
      (typeof flags.host === "string" && flags.host) ||
      process.env.LOOM_RELAY_HOST ||
      DEFAULT_RELAY_HOST;
    const port = Number(
      (typeof flags.port === "string" && flags.port) ||
        process.env.LOOM_RELAY_PORT ||
        DEFAULT_RELAY_PORT,
    );
    const authToken =
      (typeof flags.token === "string" && flags.token) ||
      process.env.LOOM_RELAY_TOKEN ||
      undefined;
    const allowInsecureOpen = Boolean(flags["insecure-open"]);
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
    console.log(`Fable relay on ${server.publicHint}`);
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
