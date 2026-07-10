/**
 * UC-2.4 durable: handoff survives relay process restart (same state dir).
 * Isolated LOOM_RELAY_STATE_DIR — does not touch live dogfood ~/.loom.
 *
 *   bun run smoke:durable
 */
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { RoomRegistry } from "../packages/relay/src/room";

const dir = join(tmpdir(), `loom-durable-smoke-${Date.now()}`);
mkdirSync(dir, { recursive: true });

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* */
  }
  process.exit(1);
}

console.log("smoke-durable (UC-2.4)");
console.log(`  state ${dir}`);

const sock = { send() {} };

const reg1 = new RoomRegistry({ stateDir: dir });
const room = reg1.create("durable-smoke");
const a = room.addPeer(
  { id: "p_alice", displayName: "alice", agentKind: "shell" },
  sock,
);
const b = room.addPeer(
  { id: "p_bob", displayName: "bob", agentKind: "shell" },
  sock,
);
if (!a.ok || !b.ok) fail("addPeer");
room.setOffline("p_bob");
const route = room.routeHandoff({
  id: "ho_smoke",
  fromPeerId: "p_alice",
  to: "p_bob",
  body: "survive-restart-payload",
  mode: "message",
  createdAt: new Date().toISOString(),
});
if (route.recipientCount !== 1) fail("route recipientCount");
if (room.listInbox("p_bob").length !== 1) fail("inbox before restart");
const secretA = a.secret;
const roomId = room.id;
reg1.close();
console.log("  ok  enqueue + close registry (simulates relay stop)");

const reg2 = new RoomRegistry({ stateDir: dir });
const loaded = reg2.getById(roomId);
if (!loaded) fail("room missing after restart");
const inbox = loaded.listInbox("p_bob");
if (inbox.length !== 1) fail(`inbox after restart len=${inbox.length}`);
if (!inbox[0]!.handoff.body.includes("survive-restart-payload")) {
  fail("body missing after restart");
}
const rejoin = loaded.addPeer(
  {
    id: "p_alice",
    displayName: "alice",
    agentKind: "shell",
    secret: secretA,
  },
  sock,
);
if (!rejoin.ok || rejoin.isNew) fail("M-22 secret rejoin after restart");
reg2.close();
console.log("  ok  inbox + peerSecret survive restart");

try {
  rmSync(dir, { recursive: true, force: true });
} catch {
  /* */
}
console.log("smoke-durable OK");
