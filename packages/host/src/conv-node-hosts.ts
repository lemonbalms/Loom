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

/**
 * PLAN 0.23.8 ⑦: peerId must match codes.ts generateId form exactly
 * (`p_` + 16 lowercase hex). CLI set validates; load remains non-strict (L-2).
 */
export const CONV_NODE_PEER_ID_RE = /^p_[a-f0-9]{16}$/;

/**
 * PLAN 0.23.8 ⑦ / R33 M-2: host charset without `:` (scp `host:path` single-token
 * assembly would mis-parse host-embedded colons). No leading `-` (option inject).
 * Port / IPv6 literals go via ssh_config alias.
 */
export const CONV_NODE_HOST_RE = /^[A-Za-z0-9._@-]+$/;

/** Returns an error reason, or null if peerId is valid for CLI set. */
export function validateConvNodePeerId(peerId: string): string | null {
  if (!peerId || typeof peerId !== "string") {
    return "peerId is required";
  }
  if (!CONV_NODE_PEER_ID_RE.test(peerId)) {
    return `invalid peerId (expected p_ + 16 hex digits): ${peerId}`;
  }
  return null;
}

/** Returns an error reason, or null if host is valid for CLI set. */
export function validateConvNodeHost(host: string): string | null {
  if (!host || typeof host !== "string" || !host.trim()) {
    return "host is required (non-empty)";
  }
  const h = host.trim();
  if (h.startsWith("-")) {
    return `host must not start with '-' (option-injection guard): ${h}`;
  }
  if (!CONV_NODE_HOST_RE.test(h)) {
    return `invalid host charset (allowed [A-Za-z0-9._@-], no ':' — use ssh_config alias for ports/IPv6): ${h}`;
  }
  return null;
}

/**
 * PLAN 0.23.8 L-2: whether a stored mapping entry would pass CLI set rules.
 * Hand-edited entries may fail this; load still accepts them.
 */
export function isWellFormedConvNodeMapping(
  peerId: string,
  host: string,
): boolean {
  return (
    validateConvNodePeerId(peerId) === null &&
    validateConvNodeHost(host) === null
  );
}

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
  cfg[peerId] = host.trim();
  saveConvNodeHosts(cfg);
}

/**
 * Remove a mapping entry. Returns true if the key was present, false if absent
 * (CLI rm is a documented no-op with an explicit message when missing).
 */
export function removeConvNodeHost(peerId: string): boolean {
  const cfg = loadConvNodeHosts();
  if (!(peerId in cfg)) return false;
  delete cfg[peerId];
  saveConvNodeHosts(cfg);
  return true;
}
