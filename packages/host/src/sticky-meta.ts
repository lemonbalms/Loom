import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  chmodSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { sessionPath, ensureFableDir } from "./session-store";

/** On-disk locator for a running sticky host (per session file). */
export type StickyHostMeta = {
  pid: number;
  port: number;
  /** Bearer token for loopback IPC */
  token: string;
  sessionPath: string;
  peerId: string;
  roomId: string;
  roomName: string;
  displayName: string;
  startedAt: string;
};

export function stickyMetaPath(forSessionPath?: string): string {
  const sp = forSessionPath ?? sessionPath();
  // ~/.loom/session.json → ~/.loom/session.host.json
  // ~/.loom/profiles/alice.json → ~/.loom/profiles/alice.host.json
  // (legacy ~/.fable paths only while migration gate keeps state home on legacy)
  if (sp.endsWith(".json")) {
    return sp.slice(0, -".json".length) + ".host.json";
  }
  return sp + ".host.json";
}

export function generateHostToken(): string {
  return randomBytes(24).toString("base64url");
}

export function writeStickyMeta(meta: StickyHostMeta): void {
  ensureFableDir();
  const p = stickyMetaPath(meta.sessionPath);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(meta, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
  try {
    chmodSync(p, 0o600);
  } catch {
    /* */
  }
}

export function loadStickyMeta(forSessionPath?: string): StickyHostMeta | null {
  const p = stickyMetaPath(forSessionPath);
  if (!existsSync(p)) return null;
  try {
    const raw = readFileSync(p, "utf8").trim();
    if (!raw) return null;
    return JSON.parse(raw) as StickyHostMeta;
  } catch {
    return null;
  }
}

export function clearStickyMeta(forSessionPath?: string): void {
  const p = stickyMetaPath(forSessionPath);
  if (existsSync(p)) {
    try {
      unlinkSync(p);
    } catch {
      /* */
    }
  }
}

/** Best-effort: is pid still running? */
export function isPidAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * M-27: independent process-identity check before a raw SIGTERM.
 *
 * `isPidAlive` (kill(pid,0)) + `meta.sessionPath` string match do NOT prove the
 * pid is still *our* sticky host — after a reboot the OS can reuse the pid for an
 * unrelated process while stale `*.host.json` meta lingers. The SIGTERM fallback
 * in `stopStickyHostProcess` fires exactly when the RPC stop failed, i.e. when we
 * could not confirm the process over IPC. So before killing, require an
 * independent signal: the process cmdline still references `sticky-main.ts`
 * (best-effort start-time cross-check would be an acceptable alternative).
 *
 * Returns false on ANY doubt (dead pid, `ps` unavailable/nonzero, no match) so
 * the caller falls back to "clear meta + warn" rather than killing a stranger.
 */
export function pidLooksLikeStickyHost(pid: number): boolean {
  if (!isPidAlive(pid)) return false;
  try {
    const res = Bun.spawnSync(["ps", "-p", String(pid), "-o", "command="]);
    if (res.exitCode !== 0) return false;
    return res.stdout.toString().includes("sticky-main.ts");
  } catch {
    return false;
  }
}

export function sessionKeyHash(sp: string): string {
  return createHash("sha256").update(sp).digest("hex").slice(0, 12);
}

export function stickyLogPath(forSessionPath?: string): string {
  const sp = forSessionPath ?? sessionPath();
  const dir = dirname(sp);
  return join(dir, `host-${sessionKeyHash(sp)}.log`);
}
