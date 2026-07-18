/**
 * Tower-side local peer→ssh-host mapping for conv artifact scp resolution
 * (CONV_SPEC §5.3③, PLAN 0.23.1 R26 M-1).
 *
 * The wire `ref.host` field on a conv turn's scp artifact ref is a
 * self-reported bookkeeping value from the peer that sent the turn — it is
 * NEVER trusted as the actual scp target. Resolution goes through this
 * file only, keyed by the conv's *pinned* peerId (stable, server-assigned
 * — see conv-state.ts's pinnedPeerId), never by displayName (peer-chosen
 * at join time, and therefore just as untrusted as wire `ref.host`).
 *
 * Missing mapping ⇒ null ⇒ fail-closed (R26 M-1): callers must not
 * assemble a fetch command, must present a reason instead, and must never
 * guess/default a host.
 */
import {
  existsSync,
  mkdirSync,
  chmodSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { loomDir, ensureFableDir } from "./session-store";

/** peerId -> ssh host (alias from ~/.ssh/config, or user@host). */
export type ConvNodeHostsConfig = Record<string, string>;

export function convNodeHostsPath(): string {
  return join(loomDir(), "conv-node-hosts.json");
}

export function loadConvNodeHosts(): ConvNodeHostsConfig {
  const p = convNodeHostsPath();
  if (!existsSync(p)) return {};
  try {
    const raw = JSON.parse(readFileSync(p, "utf8")) as unknown;
    if (!raw || typeof raw !== "object") return {};
    const out: ConvNodeHostsConfig = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) out[k] = v.trim();
    }
    return out;
  } catch {
    // Corrupt/unreadable config ⇒ empty mapping, not a throw — fail-closed
    // (every lookup misses, never a guessed host).
    return {};
  }
}

export function saveConvNodeHosts(cfg: ConvNodeHostsConfig): void {
  ensureFableDir();
  mkdirSync(loomDir(), { recursive: true });
  const p = convNodeHostsPath();
  writeFileSync(p, `${JSON.stringify(cfg, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  try {
    chmodSync(p, 0o600);
  } catch {
    /* best effort */
  }
}

/** M-1 fail-closed: no mapping for this peerId ⇒ null, never a default host. */
export function resolveConvNodeHost(peerId: string): string | null {
  if (!peerId) return null;
  const cfg = loadConvNodeHosts();
  const host = cfg[peerId];
  return typeof host === "string" && host.trim() ? host.trim() : null;
}

/** Convenience setter for a single mapping entry (read-modify-write). */
export function setConvNodeHost(peerId: string, host: string): void {
  const cfg = loadConvNodeHosts();
  cfg[peerId] = host;
  saveConvNodeHosts(cfg);
}
