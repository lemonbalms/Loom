/**
 * Bridge daemon meta sidecar: <session>.bridge.json (0600).
 * Parallel to sticky-meta; profilesWithSession must exclude .bridge.json.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  chmodSync,
} from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import { sessionPath, ensureFableDir, isPidAlive } from "./session-store";

export type BridgeMeta = {
  pid: number;
  port: number;
  token: string;
  sessionPath: string;
  peerId: string;
  roomId: string;
  roomName: string;
  displayName: string;
  herdrSocketPath: string;
  startedAt: string;
};

export function bridgeMetaPath(forSessionPath?: string): string {
  const sp = forSessionPath ?? sessionPath();
  if (sp.endsWith(".json")) {
    return sp.slice(0, -".json".length) + ".bridge.json";
  }
  return sp + ".bridge.json";
}

export function generateBridgeToken(): string {
  return randomBytes(24).toString("base64url");
}

export function writeBridgeMeta(meta: BridgeMeta): void {
  ensureFableDir();
  const p = bridgeMetaPath(meta.sessionPath);
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

export function loadBridgeMeta(forSessionPath?: string): BridgeMeta | null {
  const p = bridgeMetaPath(forSessionPath);
  if (!existsSync(p)) return null;
  try {
    const raw = readFileSync(p, "utf8").trim();
    if (!raw) return null;
    return JSON.parse(raw) as BridgeMeta;
  } catch {
    return null;
  }
}

export function clearBridgeMeta(forSessionPath?: string): void {
  const p = bridgeMetaPath(forSessionPath);
  if (existsSync(p)) {
    try {
      unlinkSync(p);
    } catch {
      /* */
    }
  }
}

/** M-27 identity: cmdline must reference bridge-main.ts before raw SIGTERM. */
export function pidLooksLikeBridge(pid: number): boolean {
  if (!isPidAlive(pid)) return false;
  try {
    const res = Bun.spawnSync(["ps", "-p", String(pid), "-o", "command="]);
    if (res.exitCode !== 0) return false;
    return res.stdout.toString().includes("bridge-main.ts");
  } catch {
    return false;
  }
}

export function resolveAliveBridgeMeta(
  forSessionPath?: string,
): BridgeMeta | null {
  const meta = loadBridgeMeta(forSessionPath);
  if (!meta) return null;
  if (!isPidAlive(meta.pid)) {
    clearBridgeMeta(forSessionPath);
    return null;
  }
  return meta;
}
