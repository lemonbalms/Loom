import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RelayServer } from "@loom/relay";
import { RelayClient } from "./relay-client";
import { opsHandoff } from "./room-ops";
import {
  resetActiveProfile,
  resetStateHomeDirCache,
  setActiveProfile,
  type FableSession,
} from "./session-store";
import { clearStickyMeta, writeStickyMeta } from "./sticky-meta";

/**
 * v0.29.0 (c): sticky RPC timeout must fall back to one-shot without a
 * second routed handoff. clientEventId reuse is not observable on the
 * current sticky RPC / RelayClient.handoff types.
 * PATCH 5 seam.
 */

function randomHighPort(): number {
  return 22000 + Math.floor(Math.random() * 20000);
}

describe("v0.29.0 PATCH 1 expected-red", () => {
  const prevHome = process.env.LOOM_TEST_HOME;
  const prevSession = process.env.LOOM_SESSION;
  let home = "";

  afterAll(() => {
    if (prevHome === undefined) delete process.env.LOOM_TEST_HOME;
    else process.env.LOOM_TEST_HOME = prevHome;
    if (prevSession === undefined) delete process.env.LOOM_SESSION;
    else process.env.LOOM_SESSION = prevSession;
    resetActiveProfile();
    resetStateHomeDirCache();
    if (home) rmSync(home, { recursive: true, force: true });
  });

  test(
    "sticky timeout falls back to one-shot and the relay routes one handoff",
    async () => {
      home = mkdtempSync(join(tmpdir(), "loom-ops-handoff-"));
      process.env.LOOM_TEST_HOME = home;
      resetStateHomeDirCache();
      resetActiveProfile();
      setActiveProfile(null);

      const relay = startRelay();
      const sessionFile = join(home, "session.json");
      process.env.LOOM_SESSION = sessionFile;

      const url = `ws://127.0.0.1:${relay.port}/ws`;
      const creator = new RelayClient({ url });
      const created = await creator.createRoom({
        roomName: "ops-handoff",
        displayName: "alice",
        agentKind: "shell",
        peerId: "p_ops_alice",
      });
      creator.close();
      if (created.type !== "room.state" || !created.inviteCode || !created.peerSecret) {
        relay.stop();
        throw new Error("createRoom did not return room.state with invite and secret");
      }

      const session: FableSession = {
        roomId: created.roomId,
        roomName: created.roomName ?? "ops-handoff",
        inviteCode: created.inviteCode,
        peerId: "p_ops_alice",
        displayName: "alice",
        color: created.peers.find((p) => p.id === "p_ops_alice")?.color,
        agentKind: "shell",
        relayUrl: url,
        peerSecret: created.peerSecret,
        updatedAt: new Date().toISOString(),
      };
      writeFileSync(sessionFile, JSON.stringify(session, null, 2) + "\n", "utf8");

      const routed: string[] = [];
      const bob = new RelayClient({
        url,
        onEnvelope(env) {
          if (env.type === "handoff") routed.push(env.handoff.id);
        },
      });
      const joined = await bob.joinRoom({
        inviteCode: session.inviteCode,
        displayName: "bob",
        agentKind: "shell",
        peerId: "p_ops_bob",
      });
      if (joined.type !== "room.state") {
        bob.close();
        relay.stop();
        throw new Error("bob failed to join");
      }

      const stickyClient = new RelayClient({ url });
      const rejoined = await stickyClient.joinRoom({
        inviteCode: session.inviteCode,
        displayName: "alice",
        agentKind: "shell",
        peerId: session.peerId,
        peerSecret: session.peerSecret,
      });
      if (rejoined.type !== "room.state") {
        stickyClient.close();
        bob.close();
        relay.stop();
        throw new Error("sticky peer failed to rejoin");
      }

      let stickyHits = 0;
      let releaseHang = null as (() => void) | null;
      const stickyHttp = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        async fetch(req) {
          const body = (await req.json()) as {
            op?: string;
            to?: string;
            body?: string;
            clientEventId?: string;
          };
          if (body.op !== "handoff") {
            return Response.json({ ok: false, error: "unsupported", code: "http_error" });
          }
          stickyHits += 1;
          // PATCH 5 seam: forward clientEventId like sticky-server.ts does.
          // The hang forces tryStickyRpc's 8s timeout after this route.
          await stickyClient.handoff({
            to: body.to ?? "@bob",
            body: body.body ?? "",
            ...(body.clientEventId ? { clientEventId: body.clientEventId } : {}),
          });
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, 30_000);
            releaseHang = () => {
              clearTimeout(timer);
              resolve();
            };
          });
          return Response.json({ ok: false, error: "late", code: "rpc_failed" });
        },
      });

      const token = "ops-handoff-token";
      writeStickyMeta({
        pid: process.pid,
        port: stickyHttp.port ?? 0,
        token,
        sessionPath: sessionFile,
        peerId: session.peerId,
        roomId: session.roomId,
        roomName: session.roomName,
        displayName: session.displayName,
        startedAt: new Date().toISOString(),
      });

      try {
        const result = await opsHandoff({ to: "@bob", body: "hello bob" });
        await Bun.sleep(100);
        expect(stickyHits).toBe(1);
        expect(result.source).toBe("oneshot");
        // PATCH 5 seam: count routed handoffs. Sticky already routed once,
        // then the one-shot fallback must not create a second id.
        expect(routed).toHaveLength(1);
      } finally {
        releaseHang?.();
        stickyHttp.stop(true);
        clearStickyMeta(sessionFile);
        stickyClient.close();
        bob.close();
        relay.stop();
      }
    },
    25_000,
  );
});

function startRelay(): RelayServer {
  let lastError: unknown;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const port = randomHighPort();
    const relay = new RelayServer({ host: "127.0.0.1", port });
    try {
      relay.start();
      return relay;
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(
    `failed to start room-ops test relay: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}
