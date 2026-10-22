import { describe, expect, test } from "bun:test";
import type { networkInterfaces } from "node:os";
import { RelayServer, isUnassignedLiteralIp } from "./server";

type Interfaces = ReturnType<typeof networkInterfaces>;

/** TEST-NET-1 (RFC 5737) — documentation range, never assigned to a host. */
const TEST_NET = "192.0.2.1";

/** Injected interface list with only the given addresses (test seam, D2). */
function fakeInterfaces(...addresses: string[]): () => Interfaces {
  return () => fakeList(...addresses);
}

function fakeList(...addresses: string[]): Interfaces {
  return {
    fake0: addresses.map((address) => ({
      address,
      netmask: address.includes(":") ? "ffff:ffff:ffff:ffff::" : "255.0.0.0",
      family: address.includes(":") ? "IPv6" : "IPv4",
      mac: "00:00:00:00:00:00",
      internal: false,
      cidr: null,
    })),
  } as Interfaces;
}

/** Occupy a free high port on `hostname`; caller stops it. */
function occupy(hostname: string): ReturnType<typeof Bun.serve> {
  return Bun.serve({
    hostname,
    port: 0,
    fetch: () => new Response("occupied"),
  });
}

/** An ephemeral port number the OS just handed out (then released). */
function reservedPort(): number {
  const s = occupy("127.0.0.1");
  const port = Number(s.port);
  s.stop(true);
  return port;
}

function startError(server: RelayServer): Error {
  try {
    server.start();
  } catch (e) {
    return e as Error;
  }
  server.stop();
  throw new Error("expected start() to throw");
}

const BUN_IN_USE = /Is port \d+ in use\?/;

describe("RelayServer.start bind error (v0.45.2)", () => {
  test("(a) unassigned literal IP → names the address, not a port conflict", () => {
    const port = reservedPort();
    const server = new RelayServer({
      host: TEST_NET,
      port,
      authToken: "t",
      interfaces: fakeInterfaces("127.0.0.1"),
    });
    const err = startError(server);
    expect(err.message).toBe(
      `Cannot listen on ${TEST_NET}:${port} — ${TEST_NET} is not assigned to any network interface on this machine (yet). If it is a Tailscale/VPN address, the interface may still be coming up; a service manager restart will retry. (not a port conflict)`,
    );
    expect((err.cause as { code?: string } | undefined)?.code).toBe(
      "EADDRINUSE",
    );
  });

  test("(b) real port conflict on 127.0.0.1 → original Bun message", () => {
    const blocker = occupy("127.0.0.1");
    try {
      const server = new RelayServer({
        host: "127.0.0.1",
        port: Number(blocker.port),
      });
      const err = startError(server);
      expect(err.message).toMatch(BUN_IN_USE);
      expect(err.message).not.toContain("not assigned");
    } finally {
      blocker.stop(true);
    }
  });

  test("(c) injected list contains the host, real bind still fails → original message", () => {
    const server = new RelayServer({
      host: TEST_NET,
      port: reservedPort(),
      authToken: "t",
      interfaces: fakeInterfaces(TEST_NET),
    });
    const err = startError(server);
    expect(err.message).toMatch(BUN_IN_USE);
    expect(err.message).not.toContain("not assigned");
  });

  test("(d) wildcard 0.0.0.0 port conflict → original message", () => {
    const blocker = occupy("0.0.0.0");
    try {
      const server = new RelayServer({
        host: "0.0.0.0",
        port: Number(blocker.port),
        authToken: "t",
        interfaces: fakeInterfaces(),
      });
      const err = startError(server);
      expect(err.message).toMatch(BUN_IN_USE);
      expect(err.message).not.toContain("not assigned");
    } finally {
      blocker.stop(true);
    }
  });

  test("(e) interfaces() throws → original EADDRINUSE error rethrown", () => {
    let calls = 0;
    const server = new RelayServer({
      host: TEST_NET,
      port: reservedPort(),
      authToken: "t",
      interfaces: () => {
        calls++;
        throw new Error("interfaces boom");
      },
    });
    const err = startError(server);
    expect(calls).toBe(1);
    expect((err as { code?: string }).code).toBe("EADDRINUSE");
    expect(err.message).toMatch(BUN_IN_USE);
    expect(err.message).not.toContain("interfaces boom");
  });

  test("(f) loopback port conflict: probe binds, interfaces() never consulted", () => {
    const blocker = occupy("127.0.0.1");
    try {
      let calls = 0;
      const server = new RelayServer({
        host: "127.0.0.1",
        port: Number(blocker.port),
        interfaces: () => {
          calls++;
          throw new Error("interfaces boom");
        },
      });
      const err = startError(server);
      expect(calls).toBe(0);
      expect(err.message).toMatch(BUN_IN_USE);
    } finally {
      blocker.stop(true);
    }
  });
});

describe("RelayServer.start probe + interface check (v0.45.2 P1d)", () => {
  /** Probe seam that records its calls and answers `result`. */
  function probe(result: boolean | Error): {
    calls: string[];
    fn: (host: string) => boolean;
  } {
    const calls: string[] = [];
    return {
      calls,
      fn: (host) => {
        calls.push(host);
        if (result instanceof Error) throw result;
        return result;
      },
    };
  }

  test("probe fails + absent from list → new message", () => {
    const p = probe(false);
    const server = new RelayServer({
      host: TEST_NET,
      port: reservedPort(),
      authToken: "t",
      interfaces: fakeInterfaces("127.0.0.1"),
      probeBind: p.fn,
    });
    const err = startError(server);
    expect(p.calls).toEqual([TEST_NET]);
    expect(err.message).toContain("is not assigned to any network interface");
  });

  test("probe binds + absent from list → original (127.0.0.2 / AnyIP class)", () => {
    const p = probe(true);
    let ifaceCalls = 0;
    const server = new RelayServer({
      host: TEST_NET,
      port: reservedPort(),
      authToken: "t",
      interfaces: () => {
        ifaceCalls++;
        return fakeList("127.0.0.1");
      },
      probeBind: p.fn,
    });
    const err = startError(server);
    expect(p.calls).toEqual([TEST_NET]);
    expect(ifaceCalls).toBe(0);
    expect(err.message).toMatch(BUN_IN_USE);
    expect(err.message).not.toContain("not assigned");
  });

  test("probe fails + present in list → original", () => {
    const p = probe(false);
    const server = new RelayServer({
      host: TEST_NET,
      port: reservedPort(),
      authToken: "t",
      interfaces: fakeInterfaces(TEST_NET),
      probeBind: p.fn,
    });
    const err = startError(server);
    expect(p.calls).toEqual([TEST_NET]);
    expect(err.message).toMatch(BUN_IN_USE);
    expect(err.message).not.toContain("not assigned");
  });

  test("hostname → probe not called, original", () => {
    // RFC 6761 `.invalid` never resolves, so the real bind always fails.
    const p = probe(false);
    const server = new RelayServer({
      host: "loom-p1d.invalid",
      port: reservedPort(),
      authToken: "t",
      interfaces: fakeInterfaces(),
      probeBind: p.fn,
    });
    const err = startError(server);
    expect(p.calls).toEqual([]);
    expect(err.message).not.toContain("not assigned");
  });

  test("wildcard → probe not called, original", () => {
    const blocker = occupy("0.0.0.0");
    try {
      const p = probe(false);
      const server = new RelayServer({
        host: "0.0.0.0",
        port: Number(blocker.port),
        authToken: "t",
        interfaces: fakeInterfaces(),
        probeBind: p.fn,
      });
      const err = startError(server);
      expect(p.calls).toEqual([]);
      expect(err.message).toMatch(BUN_IN_USE);
      expect(err.message).not.toContain("not assigned");
    } finally {
      blocker.stop(true);
    }
  });

  test("probe throws → original EADDRINUSE error rethrown", () => {
    const p = probe(new Error("probe boom"));
    const server = new RelayServer({
      host: TEST_NET,
      port: reservedPort(),
      authToken: "t",
      interfaces: fakeInterfaces(),
      probeBind: p.fn,
    });
    const err = startError(server);
    expect(p.calls).toEqual([TEST_NET]);
    expect((err as { code?: string }).code).toBe("EADDRINUSE");
    expect(err.message).toMatch(BUN_IN_USE);
    expect(err.message).not.toContain("probe boom");
  });

  test("real probe: 127.0.0.1 port conflict, absent from list → original", () => {
    const blocker = occupy("127.0.0.1");
    try {
      const server = new RelayServer({
        host: "127.0.0.1",
        port: Number(blocker.port),
        interfaces: fakeInterfaces(),
      });
      const err = startError(server);
      expect(err.message).toMatch(BUN_IN_USE);
      expect(err.message).not.toContain("not assigned");
    } finally {
      blocker.stop(true);
    }
  });

  test.skipIf(process.platform !== "linux")(
    "real probe (Linux): 127.0.0.2 port conflict → original",
    () => {
      const blocker = occupy("127.0.0.2");
      try {
        const server = new RelayServer({
          host: "127.0.0.2",
          port: Number(blocker.port),
          authToken: "t",
        });
        const err = startError(server);
        expect(err.message).toMatch(BUN_IN_USE);
        expect(err.message).not.toContain("not assigned");
      } finally {
        blocker.stop(true);
      }
    },
  );
});

describe("isUnassignedLiteralIp (v0.45.2)", () => {
  test("IPv6 equivalent forms compare equal", () => {
    const ifaces = fakeList("2001:DB8:0:0:0:0:0:1");
    expect(isUnassignedLiteralIp("2001:0db8::1", ifaces)).toBe(false);
    expect(isUnassignedLiteralIp("[2001:db8::1]", ifaces)).toBe(false);
    expect(isUnassignedLiteralIp("2001:db8::1%en0", ifaces)).toBe(false);
    expect(isUnassignedLiteralIp("2001:db8::2", ifaces)).toBe(true);
  });

  test("expanded wildcard forms are excluded", () => {
    const empty = fakeList();
    expect(isUnassignedLiteralIp("0:0:0:0:0:0:0:0", empty)).toBe(false);
    expect(isUnassignedLiteralIp("0.0.0.0", empty)).toBe(false);
  });

  test("loopback is classified like any literal (P1d: the probe decides)", () => {
    const lo = fakeList("127.0.0.1", "::1");
    expect(isUnassignedLiteralIp("0:0:0:0:0:0:0:1", lo)).toBe(false);
    expect(isUnassignedLiteralIp("[::1]", lo)).toBe(false);
    expect(isUnassignedLiteralIp("127.0.0.1", lo)).toBe(false);
    expect(isUnassignedLiteralIp("127.0.0.1", fakeList())).toBe(true);
  });

  test("hostnames are not classified", () => {
    const empty = fakeList();
    expect(isUnassignedLiteralIp("localhost", empty)).toBe(false);
    expect(isUnassignedLiteralIp("example.test", empty)).toBe(false);
  });

  test("IPv4 literal present / absent", () => {
    expect(isUnassignedLiteralIp(TEST_NET, fakeList(TEST_NET))).toBe(false);
    expect(isUnassignedLiteralIp(TEST_NET, fakeList("127.0.0.1"))).toBe(true);
  });

  test("IPv4-mapped IPv6 loopback matches the IPv4 loopback entry", () => {
    expect(
      isUnassignedLiteralIp("::ffff:127.0.0.1", fakeList("127.0.0.1")),
    ).toBe(false);
  });

  test("IPv4-mapped IPv6 present in an IPv4 interface list", () => {
    expect(
      isUnassignedLiteralIp(`::ffff:${TEST_NET}`, fakeList(TEST_NET)),
    ).toBe(false);
  });

  test("IPv4-mapped IPv6 absent from an empty list", () => {
    expect(isUnassignedLiteralIp(`::ffff:${TEST_NET}`, fakeList())).toBe(true);
  });

  test("IPv4-mapped IPv6 wildcard is excluded", () => {
    expect(isUnassignedLiteralIp("::ffff:0.0.0.0", fakeList())).toBe(false);
  });
});
