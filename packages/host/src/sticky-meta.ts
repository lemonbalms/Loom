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
  // ~/.fable/session.json → ~/.fable/session.host.json
  // ~/.fable/profiles/alice.json → ~/.fable/profiles/alice.host.json
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

export function sessionKeyHash(sp: string): string {
  return createHash("sha256").update(sp).digest("hex").slice(0, 12);
}

export function stickyLogPath(forSessionPath?: string): string {
  const sp = forSessionPath ?? sessionPath();
  const dir = dirname(sp);
  return join(dir, `host-${sessionKeyHash(sp)}.log`);
}
