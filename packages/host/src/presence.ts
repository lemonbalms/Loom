import {
  ansiFg,
  formatRoomBadge,
  sanitizePeerName,
  sanitizePeerText,
  type PeerInfo,
} from "@loom/protocol";

export function renderPresenceBar(opts: {
  roomName: string;
  peers: PeerInfo[];
  meId?: string | null;
}): string {
  const badge = formatRoomBadge({
    roomName: opts.roomName,
    peerCount: opts.peers.length,
    sharing: true,
  });
  const names = opts.peers
    .map((p) => {
      const label = ansiFg(p.color, sanitizePeerName(p.displayName));
      const agent = p.agentKind !== "unknown" ? `/${p.agentKind}` : "";
      const me = p.id === opts.meId ? " (you)" : "";
      const on = p.online === false ? " · offline" : "";
      return `${label}${agent}${me}${on}`;
    })
    .join("  ");
  return `\x1b[2m${badge}\x1b[0m\n${names}`;
}

export function renderPeerTable(
  peers: PeerInfo[],
  meId?: string | null,
): string {
  const lines = ["  ID           Name            Agent     Online  Color"];
  lines.push("─".repeat(56));
  for (const p of peers) {
    const you = p.id === meId ? "*" : " ";
    const online = p.online === false ? "no" : "yes";
    lines.push(
      `${you}${p.id.slice(0, 10).padEnd(12)} ${ansiFg(p.color, sanitizePeerName(p.displayName).padEnd(14))} ${p.agentKind.padEnd(8)} ${online.padEnd(6)}  ${p.color}`,
    );
  }
  return lines.join("\n");
}

export type RenderInboxOpts = {
  /** Resolve peer id → display name (dogfood: raw p_… is hard to read) */
  peerName?: (peerId: string) => string | undefined;
};

export function renderInbox(
  entries: {
    handoff: {
      id: string;
      fromPeerId: string;
      body: string;
      mode: string;
      attachments?: { kind: string; label?: string; content: string }[];
    };
    status: string;
  }[],
  opts?: RenderInboxOpts,
): string {
  if (entries.length === 0) return "(inbox empty)";
  const lines: string[] = [];
  for (const e of entries) {
    const id = sanitizePeerText(e.handoff.id).slice(0, 64);
    const rawFrom = e.handoff.fromPeerId;
    const resolved = opts?.peerName?.(rawFrom);
    const from = sanitizePeerText(
      resolved ? `${resolved} (${rawFrom.slice(0, 12)})` : rawFrom,
    ).slice(0, 80);
    const mode = sanitizePeerText(e.handoff.mode).slice(0, 32);
    const preview = sanitizePeerText(e.handoff.body)
      .replace(/\s+/g, " ")
      .slice(0, 48);
    const nAtt = e.handoff.attachments?.length ?? 0;
    const attNote = nAtt > 0 ? `  +${nAtt} attachment${nAtt === 1 ? "" : "s"}` : "";
    lines.push(`[${sanitizePeerText(e.status)}] ${id}${attNote}`);
    lines.push(`  from: ${from}  mode: ${mode}`);
    lines.push(`  ${preview}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}
