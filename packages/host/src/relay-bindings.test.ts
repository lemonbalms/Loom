/**
 * PLAN 0.24.0 — multi-relay bindings + mirror-on-save + local daemon stop.
 * Isolated under LOOM_TEST_HOME (conv-node-hosts.test.ts precedent).
 */
import {
  describe,
  expect,
  test,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "bun:test";
import {
  mkdirSync,
  rmSync,
  existsSync,
  statSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  resetStateHomeDirCache,
  resetActiveProfile,
  loadSession,
  saveSession,
  normalizeSession,
  topLevelToBinding,
  relayClientOptsFromSession,
  type LoomSession,
  type RelayBinding,
  loomDir,
  isPidAlive,
} from "./session-store";
import {
  hasRoomBinding,
  isSameRelay,
  normalizeRelayWsUrl,
  bindingsEqual,
  nameBindingAs,
  useRelayBinding,
  promoteBindingToTopLevel,
  guardCrossRelayCreateJoin,
  listRelayBindings,
  formatRelayBindingList,
  stripRelayUrlToken,
} from "./relay-bindings";
import {
  ensureRelay,
  isRelayUp,
  stopRelay,
  readRelayPid,
} from "./relay-daemon";
import { parseRelayUrl } from "@loom/protocol";

const dir = join(tmpdir(), `loom-relay-bindings-${Date.now()}`);

function baseSession(over: Partial<LoomSession> = {}): LoomSession {
  return {
    roomId: "r_local",
    roomName: "local-room",
    inviteCode: "LOOM-AAAA",
    peerId: "p_aaaaaaaaaaaaaaaa",
    displayName: "alice",
    agentKind: "unknown",
    relayUrl: "ws://127.0.0.1:7842/ws",
    relayToken: "tok-local",
    peerSecret: "sec-local",
    updatedAt: "2026-07-19T00:00:00.000Z",
    ...over,
  };
}

function remoteBinding(over: Partial<RelayBinding> = {}): RelayBinding {
  return {
    roomId: "r_remote",
    roomName: "remote-room",
    inviteCode: "LOOM-BBBB",
    peerId: "p_bbbbbbbbbbbbbbbb",
    peerSecret: "sec-remote",
    relayUrl: "ws://10.0.0.5:7842/ws",
    relayToken: "tok-remote",
    updatedAt: "2026-07-19T01:00:00.000Z",
    ...over,
  };
}

beforeAll(() => {
  mkdirSync(dir, { recursive: true });
  process.env.LOOM_TEST_HOME = dir;
  resetStateHomeDirCache();
  resetActiveProfile();
});

afterAll(() => {
  delete process.env.LOOM_TEST_HOME;
  delete process.env.LOOM_RELAY_TOKEN;
  resetStateHomeDirCache();
  resetActiveProfile();
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* */
  }
});

beforeEach(() => {
  delete process.env.LOOM_RELAY_TOKEN;
  delete process.env.LOOM_SESSION;
  delete process.env.LOOM_PROFILE;
  resetActiveProfile();
  resetStateHomeDirCache();
  try {
    rmSync(join(dir, ".loom"), { recursive: true, force: true });
  } catch {
    /* */
  }
  mkdirSync(join(dir, ".loom", "profiles"), { recursive: true });
});

describe("D1 schema additive + normalizeSession compat", () => {
  test("old schema profile (no relayName/relays) passes normalizeSession unchanged structurally", () => {
    const raw = baseSession();
    // Explicitly no relayName/relays keys
    const { relayName: _rn, relays: _rs, ...legacy } = raw as LoomSession & {
      relayName?: string;
      relays?: unknown;
    };
    const n = normalizeSession(legacy as LoomSession);
    expect(n.relayName).toBeUndefined();
    expect(n.relays).toBeUndefined();
    expect(n.roomId).toBe(legacy.roomId);
    expect(n.peerId).toBe(legacy.peerId);
    expect(n.relayUrl).toBe(normalizeRelayWsUrl(legacy.relayUrl));
  });

  test("load of disk legacy profile does not invent relayName/relays", () => {
    const p = join(dir, ".loom", "session.json");
    writeFileSync(
      p,
      JSON.stringify(baseSession(), null, 2) + "\n",
      "utf8",
    );
    const s = loadSession();
    expect(s).not.toBeNull();
    expect(s!.relayName).toBeUndefined();
    expect(s!.relays).toBeUndefined();
  });
});

describe("L-1 same/different relay", () => {
  test("normalize + isSameRelay uses parseRelayUrl().wsUrl", () => {
    expect(isSameRelay("ws://127.0.0.1:7842", "ws://127.0.0.1:7842/ws")).toBe(
      true,
    );
    expect(isSameRelay("ws://127.0.0.1:7842/ws", "ws://10.0.0.5:7842/ws")).toBe(
      false,
    );
    // host aliases are NOT folded — fail-closed (over-different is safe)
    expect(isSameRelay("ws://localhost:7842/ws", "ws://127.0.0.1:7842/ws")).toBe(
      false,
    );
  });
});

describe("D2 relay use / name --as", () => {
  test("use without relayName fails closed with --as guidance", () => {
    const s = baseSession();
    const r = useRelayBinding(s, "remote");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("--as");
    }
  });

  test("unknown target returns error + available list", () => {
    const s = baseSession({
      relayName: "local",
      relays: {
        local: topLevelToBinding(baseSession()),
      },
    });
    const r = useRelayBinding(s, "nope");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("nope");
      expect(r.available).toContain("local");
    }
  });

  test("normal switch stashes → promotes, updates relayName", () => {
    const local = baseSession({ relayName: "local" });
    const remote = remoteBinding();
    const s: LoomSession = {
      ...local,
      relays: {
        local: topLevelToBinding(local),
        remote,
      },
    };
    const r = useRelayBinding(s, "remote");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.session.relayName).toBe("remote");
      expect(r.session.roomId).toBe("r_remote");
      expect(r.session.peerId).toBe("p_bbbbbbbbbbbbbbbb");
      expect(r.session.peerSecret).toBe("sec-remote");
      expect(r.session.relayToken).toBe("tok-remote");
      // stashed local preserved
      expect(r.session.relays?.local?.roomId).toBe("r_local");
      expect(r.session.relays?.remote?.roomId).toBe("r_remote");
    }
  });

  test("saveSession path is 0600", () => {
    const s = baseSession({ relayName: "local" });
    saveSession(s);
    const p = join(dir, ".loom", "session.json");
    expect(existsSync(p)).toBe(true);
    const mode = statSync(p).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  test("empty profile: use unknown name fails (L-2 natural cover)", () => {
    const empty = baseSession({
      roomId: "",
      roomName: "",
      inviteCode: "",
      peerId: "",
      relayUrl: "ws://127.0.0.1:7842/ws",
    });
    expect(hasRoomBinding(empty)).toBe(false);
    const r = useRelayBinding(empty, "x");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.toLowerCase()).toMatch(/unknown|available|no named/i);
    }
  });
});

describe("M-2 --as true idempotency", () => {
  test("identical re-run is no-op (changed=false)", () => {
    const s = baseSession();
    const first = nameBindingAs(s, "local");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.changed).toBe(true);
    const second = nameBindingAs(first.session, "local");
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.changed).toBe(false);
  });

  test("existing different entry fails closed without --force", () => {
    const s = baseSession({
      relayName: "local",
      relays: {
        local: topLevelToBinding(baseSession()),
        taken: remoteBinding(),
      },
    });
    const r = nameBindingAs(s, "taken");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain("--force");
      expect(r.error).toContain("taken");
    }
  });

  test("--force overwrites different entry", () => {
    const s = baseSession({
      relays: { taken: remoteBinding() },
    });
    const r = nameBindingAs(s, "taken", { force: true });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.session.relays?.taken?.roomId).toBe("r_local");
      expect(r.session.relayName).toBe("taken");
    }
  });
});

describe("D3 list — full peerId, no secrets", () => {
  test("list includes full peerId and excludes token/secret", () => {
    const s = baseSession({
      relayName: "local",
      relays: {
        local: topLevelToBinding(baseSession()),
        remote: remoteBinding({
          peerId: "p_fullpeerid000001",
          relayUrl: "ws://10.0.0.5:7842/ws?token=should-strip",
        }),
      },
    });
    const items = listRelayBindings(s);
    const remote = items.find((i) => i.name === "remote");
    expect(remote).toBeDefined();
    expect(remote!.peerId).toBe("p_fullpeerid000001");
    expect(remote!.relayUrl).not.toContain("token");
    expect(remote!.relayUrl).not.toContain("should-strip");
    const text = formatRelayBindingList(s);
    expect(text).toContain("p_fullpeerid000001");
    expect(text).toContain("p_aaaaaaaaaaaaaaaa");
    expect(text).not.toContain("tok-local");
    expect(text).not.toContain("tok-remote");
    expect(text).not.toContain("sec-local");
    expect(text).not.toContain("sec-remote");
    expect(text).not.toContain("should-strip");
    // shape has no secret fields
    for (const it of items) {
      expect(Object.keys(it).sort()).toEqual(
        ["active", "name", "peerId", "relayUrl", "roomName"].sort(),
      );
    }
  });
});

describe("D4 mirror-on-save + --relay-name semantics (via saveSession)", () => {
  test("saveSession with relayName mirrors top-level into relays[name]", () => {
    saveSession(baseSession({ relayName: "local" }));
    const s = loadSession()!;
    expect(s.relayName).toBe("local");
    expect(s.relays?.local?.roomId).toBe("r_local");
    expect(s.relays?.local?.peerId).toBe("p_aaaaaaaaaaaaaaaa");
    expect(s.relays?.local?.relayToken).toBe("tok-local");
    expect(s.relays?.local?.peerSecret).toBe("sec-local");
  });

  test("subsequent top-level update via saveSession updates map (mirror invariant)", () => {
    saveSession(baseSession({ relayName: "local" }));
    const s1 = loadSession()!;
    saveSession({
      ...s1,
      peerSecret: "sec-reissued",
      updatedAt: "2026-07-19T02:00:00.000Z",
    });
    const s2 = loadSession()!;
    expect(s2.relays?.local?.peerSecret).toBe("sec-reissued");
    expect(s2.relays?.local?.updatedAt).toBe("2026-07-19T02:00:00.000Z");
  });

  test("new name preserves old map entry (M-1 pass path simulation)", () => {
    saveSession(baseSession({ relayName: "local" }));
    const s1 = loadSession()!;
    // cross-relay create with --relay-name remote
    saveSession({
      ...s1,
      roomId: "r_remote",
      roomName: "remote-room",
      inviteCode: "LOOM-BBBB",
      peerId: "p_bbbbbbbbbbbbbbbb",
      peerSecret: "sec-remote",
      relayUrl: "ws://10.0.0.5:7842/ws",
      relayToken: "tok-remote",
      updatedAt: "2026-07-19T03:00:00.000Z",
      relayName: "remote",
      // keep old relays map
      relays: s1.relays,
    });
    const s2 = loadSession()!;
    expect(s2.relayName).toBe("remote");
    expect(s2.relays?.local?.roomId).toBe("r_local");
    expect(s2.relays?.local?.peerSecret).toBe("sec-local");
    expect(s2.relays?.remote?.roomId).toBe("r_remote");
  });
});

describe("M-1 cross-relay destroy guard", () => {
  test("named profile × different relay × no flag → fail-closed", () => {
    const s = baseSession({ relayName: "local" });
    const g = guardCrossRelayCreateJoin(s, "ws://10.0.0.5:7842/ws");
    expect(g.ok).toBe(false);
    if (!g.ok) {
      expect(g.error).toContain("--relay-name");
    }
  });

  test("named profile × different relay × --relay-name → pass", () => {
    const s = baseSession({ relayName: "local" });
    const g = guardCrossRelayCreateJoin(
      s,
      "ws://10.0.0.5:7842/ws",
      "remote",
    );
    expect(g.ok).toBe(true);
  });

  test("unnamed binding × different relay → fail-closed + --as guidance", () => {
    const s = baseSession(); // no relayName
    const g = guardCrossRelayCreateJoin(s, "ws://10.0.0.5:7842/ws");
    expect(g.ok).toBe(false);
    if (!g.ok) {
      expect(g.error).toContain("--as");
    }
  });

  test("same-relay rejoin (named) → pass", () => {
    const s = baseSession({ relayName: "local" });
    const g = guardCrossRelayCreateJoin(s, "ws://127.0.0.1:7842/ws");
    expect(g.ok).toBe(true);
  });

  test("same-relay rejoin (unnamed) → pass", () => {
    const s = baseSession();
    const g = guardCrossRelayCreateJoin(s, "ws://127.0.0.1:7842");
    expect(g.ok).toBe(true);
  });

  test("empty profile → pass", () => {
    const g = guardCrossRelayCreateJoin(null, "ws://10.0.0.5:7842/ws");
    expect(g.ok).toBe(true);
    const empty = baseSession({ roomId: "" });
    expect(guardCrossRelayCreateJoin(empty, "ws://10.0.0.5:7842/ws").ok).toBe(
      true,
    );
  });
});

describe("L-3 mirror source is pre-env disk original", () => {
  test("env LOOM_RELAY_TOKEN does not persist into relays map", () => {
    process.env.LOOM_RELAY_TOKEN = "env-should-not-persist";
    // session has no disk token
    saveSession(
      baseSession({
        relayName: "local",
        relayToken: undefined,
      }),
    );
    // Read raw disk (bypass normalizeSession env merge)
    const raw = JSON.parse(
      readFileSync(join(dir, ".loom", "session.json"), "utf8"),
    ) as LoomSession;
    expect(raw.relays?.local?.relayToken).toBeUndefined();
    // top-level may still show env via normalize on load — map must not
    expect(raw.relays?.local?.relayToken).not.toBe("env-should-not-persist");
    delete process.env.LOOM_RELAY_TOKEN;
  });
});

describe("L-5 relays round-trip load→save", () => {
  test("session with relays map survives load→save→load", () => {
    const local = baseSession({ relayName: "local" });
    const s0: LoomSession = {
      ...local,
      relays: {
        local: topLevelToBinding(local),
        remote: remoteBinding(),
      },
    };
    saveSession(s0);
    const s1 = loadSession()!;
    expect(s1.relays?.remote?.peerId).toBe("p_bbbbbbbbbbbbbbbb");
    expect(s1.relays?.remote?.peerSecret).toBe("sec-remote");
    expect(s1.relays?.remote?.relayToken).toBe("tok-remote");
    // save again without intentional change
    saveSession(s1);
    const s2 = loadSession()!;
    expect(s2.relayName).toBe("local");
    expect(s2.relays?.local?.roomId).toBe("r_local");
    expect(s2.relays?.remote?.roomId).toBe("r_remote");
    expect(s2.relays?.remote?.peerSecret).toBe("sec-remote");
    expect(bindingsEqual(s2.relays!.remote!, remoteBinding())).toBe(true);
  });
});

describe("regression: relayClientOptsFromSession top-level only", () => {
  test("opts come from top-level even when relays map has another entry", () => {
    const s = baseSession({
      relayName: "local",
      relayUrl: "ws://127.0.0.1:7842/ws",
      relayToken: "tok-local",
      relays: {
        local: topLevelToBinding(baseSession()),
        remote: remoteBinding(),
      },
    });
    const opts = relayClientOptsFromSession(s);
    expect(opts.url).toBe(normalizeRelayWsUrl("ws://127.0.0.1:7842/ws"));
    expect(opts.token).toBe("tok-local");
  });
});

describe("D5 local relay lifecycle (start/stop/status pieces)", () => {
  // Use a high ephemeral port to avoid clobbering a real local relay.
  const testPort = 17842 + Math.floor(Math.random() * 1000);
  const prevPort = process.env.LOOM_RELAY_PORT;

  afterEach(async () => {
    // best-effort cleanup of any daemon we started
    try {
      await stopRelay();
    } catch {
      /* */
    }
    if (prevPort === undefined) delete process.env.LOOM_RELAY_PORT;
    else process.env.LOOM_RELAY_PORT = prevPort;
  });

  test("stop with no pid file is a clean no-op", async () => {
    const r = await stopRelay();
    expect(r.stopped).toBe(false);
    expect(r.pid).toBeNull();
    expect(r.message).toMatch(/no local relay pid/i);
  });

  test("stop clears stale pid file", async () => {
    const pidFile = join(loomDir(), "relay.pid");
    mkdirSync(loomDir(), { recursive: true });
    writeFileSync(pidFile, "999999999", "utf8");
    const r = await stopRelay();
    expect(r.stopped).toBe(false);
    expect(r.pid).toBe(999999999);
    expect(existsSync(pidFile)).toBe(false);
  });

  test("start is idempotent when health already up; stop kills pid", async () => {
    process.env.LOOM_RELAY_PORT = String(testPort);
    // start
    const r1 = await ensureRelay({
      relayFlag: `ws://127.0.0.1:${testPort}`,
    });
    expect(r1.remote).toBe(false);
    expect(r1.started || (await isRelayUp(r1.endpoint))).toBe(true);
    const pid1 = readRelayPid();
    expect(pid1).not.toBeNull();
    expect(isPidAlive(pid1!)).toBe(true);

    // start again → health-up no-op (started=false)
    const r2 = await ensureRelay({
      relayFlag: `ws://127.0.0.1:${testPort}`,
    });
    expect(r2.started).toBe(false);
    expect(await isRelayUp(r2.endpoint)).toBe(true);

    // stop → pid dead + file cleared
    const stop = await stopRelay();
    expect(stop.stopped).toBe(true);
    expect(isPidAlive(pid1!)).toBe(false);
    expect(readRelayPid()).toBeNull();
    // status: down on the same endpoint we started
    expect(await isRelayUp(r1.endpoint)).toBe(false);
  }, 20_000);
});

describe("helpers: promote + strip", () => {
  test("promoteBindingToTopLevel sets top-level + relayName", () => {
    const s = baseSession({ relayName: "local" });
    const b = remoteBinding();
    const next = promoteBindingToTopLevel(s, b, "remote");
    expect(next.relayName).toBe("remote");
    expect(next.roomId).toBe(b.roomId);
    expect(next.peerSecret).toBe(b.peerSecret);
  });

  test("stripRelayUrlToken removes query token", () => {
    expect(stripRelayUrlToken("ws://h:1/ws?token=secret")).not.toContain(
      "secret",
    );
    expect(parseRelayUrl("ws://h:1/ws?token=secret").token).toBe("secret");
  });
});
