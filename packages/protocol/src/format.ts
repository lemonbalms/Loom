import type { HandoffPayload, PeerInfo } from "./envelope";
import { ansiFg } from "./colors";
import { sanitizePeerName, sanitizePeerText } from "./sanitize";

export function formatPeerLabel(peer: PeerInfo): string {
  const name = sanitizePeerName(peer.displayName);
  return ansiFg(peer.color, `${name}/${peer.agentKind}`);
}

export function formatHandoffBlock(
  handoff: HandoffPayload,
  from?: PeerInfo,
): string {
  // L-13: always sanitize peer-controlled who/id/mode
  const who = from
    ? `${sanitizePeerName(from.displayName)}/${from.agentKind}`
    : sanitizePeerText(handoff.fromPeerId).slice(0, 64);
  const mode = sanitizePeerText(handoff.mode).slice(0, 32);
  const hid = sanitizePeerText(handoff.id).slice(0, 64);
  const lines = [
    "",
    "════════════════════════════════════════",
    `[LOOM HANDOFF from ${who}]`,
    `mode: ${mode}  id: ${hid}`,
    "────────────────────────────────────────",
    sanitizePeerText(handoff.body),
  ];
  if (handoff.attachments?.length) {
    lines.push("--- attachments ---");
    for (const a of handoff.attachments) {
      const label = sanitizePeerText(a.label ?? a.kind);
      lines.push(`[${label}]`);
      lines.push(sanitizePeerText(a.content));
    }
  }
  lines.push("════════════════════════════════════════");
  lines.push("");
  return lines.join("\n");
}

export function formatRoomBadge(opts: {
  roomName: string;
  peerCount: number;
  sharing?: boolean;
}): string {
  const share = opts.sharing === false ? "" : " · Sharing";
  const name = sanitizePeerText(opts.roomName);
  return `Room ${name} · ${opts.peerCount} peer${opts.peerCount === 1 ? "" : "s"}${share}`;
}
