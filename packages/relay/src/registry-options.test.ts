import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { readdirSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { RoomRegistry } from "./room";
import { releaseStateDirLock, roomStatePath } from "./persist";
import { resolveRegistryOptionsFromEnv } from "./registry-options";

function tmpState(): string {
  return join(
    tmpdir(),
    `loom-0241-state-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
}

describe("resolveRegistryOptionsFromEnv (0.24.1 D6)", () => {
  test("default durable → stateDir = defaultRelayStateDir()", () => {
    const opts = resolveRegistryOptionsFromEnv({} as NodeJS.ProcessEnv);
    expect(opts.ephemeral).toBeUndefined();
    expect(typeof opts.stateDir).toBe("string");
    expect(opts.stateDir!.length).toBeGreaterThan(0);
    expect(opts.stateDir).toMatch(/relay-state$/);
  });

  test("LOOM_RELAY_EPHEMERAL=1 → { ephemeral: true }", () => {
    const opts = resolveRegistryOptionsFromEnv({
      LOOM_RELAY_EPHEMERAL: "1",
    } as NodeJS.ProcessEnv);
    expect(opts).toEqual({ ephemeral: true });
  });

  test("LOOM_RELAY_EPHEMERAL=true → { ephemeral: true }", () => {
    const opts = resolveRegistryOptionsFromEnv({
      LOOM_RELAY_EPHEMERAL: "true",
    } as NodeJS.ProcessEnv);
    expect(opts).toEqual({ ephemeral: true });
  });

  test("LOOM_RELAY_STATE_DIR override → that path", () => {
    const dir = "/tmp/custom-relay-state-0241";
    const opts = resolveRegistryOptionsFromEnv({
      LOOM_RELAY_STATE_DIR: dir,
    } as NodeJS.ProcessEnv);
    expect(opts).toEqual({ stateDir: dir });
  });

  test("EPHEMERAL wins over STATE_DIR", () => {
    const opts = resolveRegistryOptionsFromEnv({
      LOOM_RELAY_EPHEMERAL: "1",
      LOOM_RELAY_STATE_DIR: "/tmp/ignored",
    } as NodeJS.ProcessEnv);
    expect(opts).toEqual({ ephemeral: true });
  });
});

describe("0.24.1 foreground durable wiring semantics", () => {
  let dir: string;
  let prevEphemeral: string | undefined;
  let prevStateDir: string | undefined;

  beforeEach(() => {
    dir = tmpState();
    mkdirSync(dir, { recursive: true });
    prevEphemeral = process.env.LOOM_RELAY_EPHEMERAL;
    prevStateDir = process.env.LOOM_RELAY_STATE_DIR;
    delete process.env.LOOM_RELAY_EPHEMERAL;
    process.env.LOOM_RELAY_STATE_DIR = dir;
  });

  afterEach(() => {
    try {
      releaseStateDirLock(dir);
    } catch {
      /* */
    }
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* */
    }
    if (prevEphemeral === undefined) delete process.env.LOOM_RELAY_EPHEMERAL;
    else process.env.LOOM_RELAY_EPHEMERAL = prevEphemeral;
    if (prevStateDir === undefined) delete process.env.LOOM_RELAY_STATE_DIR;
    else process.env.LOOM_RELAY_STATE_DIR = prevStateDir;
  });

  test("(i) durable: helper opts + registry restart keeps invite join", () => {
    // Foreground path meaning: resolve options from env → RoomRegistry({stateDir})
    // (not bare `new RoomRegistry()` which is ephemeral).
    const opts = resolveRegistryOptionsFromEnv();
    expect(opts.stateDir).toBe(dir);
    expect(opts.ephemeral).toBeUndefined();

    const reg1 = new RoomRegistry(opts);
    expect(reg1.durable).toBe(true);
    expect(reg1.stateDir).toBe(dir);

    const room = reg1.create("fg-durable");
    const invite = room.inviteCode;
    const sock = { send() {} };
    const added = room.addPeer(
      { id: "p_alice", displayName: "alice", agentKind: "claude" },
      sock,
    );
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const secret = added.secret;

    // Snapshot on disk after create
    const snapPath = roomStatePath(dir, room.id);
    expect(existsSync(snapPath)).toBe(true);

    reg1.close();

    // Restart model (scripts/smoke-durable.ts): new registry same stateDir
    const reg2 = new RoomRegistry(resolveRegistryOptionsFromEnv());
    const loaded = reg2.getByCode(invite);
    expect(loaded).toBeTruthy();
    expect(loaded!.id).toBe(room.id);

    const rejoin = loaded!.addPeer(
      {
        id: "p_alice",
        displayName: "alice",
        agentKind: "claude",
        secret,
      },
      sock,
    );
    expect(rejoin.ok).toBe(true);
    if (rejoin.ok) {
      expect(rejoin.isNew).toBe(false);
      expect(rejoin.secret).toBe(secret);
    }
    reg2.close();
  });

  test("(ii) ephemeral: LOOM_RELAY_EPHEMERAL=1 → no durable / no room snapshot files", () => {
    process.env.LOOM_RELAY_EPHEMERAL = "1";
    const opts = resolveRegistryOptionsFromEnv();
    expect(opts).toEqual({ ephemeral: true });

    const reg = new RoomRegistry(opts);
    expect(reg.durable).toBe(false);
    expect(reg.stateDir).toBeNull();

    const room = reg.create("fg-eph");
    const sock = { send() {} };
    room.addPeer(
      { id: "p_a", displayName: "a", agentKind: "shell" },
      sock,
    );

    // No room snapshot json under the (unused) state dir; lock dir may exist only if durable.
    // Under ephemeral, RoomRegistry never opens stateDir — dir should have no room jsons.
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    expect(files.length).toBe(0);
    // Also: roomStatePath for this id must not exist
    expect(existsSync(roomStatePath(dir, room.id))).toBe(false);

    reg.close();
  });

  test("(iii) lock fail-closed: second registry on same stateDir throws (no auto-ephemeral)", () => {
    const opts = resolveRegistryOptionsFromEnv();
    const reg1 = new RoomRegistry(opts);
    expect(reg1.durable).toBe(true);

    let threw = false;
    let msg = "";
    try {
      new RoomRegistry(opts);
    } catch (e) {
      threw = true;
      msg = e instanceof Error ? e.message : String(e);
    }
    expect(threw).toBe(true);
    expect(msg).toMatch(/M-23|locked/i);

    reg1.close();
  });
});
