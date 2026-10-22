import { describe, expect, test } from "bun:test";
import type { networkInterfaces } from "node:os";
import { RelayServer } from "./server";

type Interfaces = ReturnType<typeof networkInterfaces>;

/** Injected interface list with only the given addresses (test seam, D2). */
function fakeInterfaces(...addresses: string[]): () => Interfaces {
  return () =>
    ({
      fake0: addresses.map((address) => ({
        address,
        netmask: address.includes(":") ? "ffff:ffff:ffff:ffff::" : "255.0.0.0",
        family: address.includes(":") ? "IPv6" : "IPv4",
        mac: "00:00:00:00:00:00",
        internal: false,
        cidr: null,
      })),
    }) as Interfaces;
}

/** Occupy a free high port on `hostname`; caller stops it. */
function occupy(hostname: string): ReturnType<typeof Bun.serve> {
  return Bun.serve({
    hostname,
    port: 0,
    fetch: () => new Response("occupied"),
  });
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
    const port = 40000 + Math.floor(Math.random() * 20000);
    const server = new RelayServer({
      host: "10.255.255.1",
      port,
      authToken: "t",
      interfaces: fakeInterfaces("127.0.0.1"),
    });
    const err = startError(server);
    expect(err.message).toBe(
      `Cannot listen on 10.255.255.1:${port} — 10.255.255.1 is not assigned to any network interface on this machine (yet). If it is a Tailscale/VPN address, the interface may still be coming up; a service manager restart will retry. (not a port conflict)`,
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

  test("(c) host present in the interface list, port occupied → original message", () => {
    const blocker = occupy("127.0.0.1");
    try {
      const server = new RelayServer({
        host: "127.0.0.1",
        port: Number(blocker.port),
        interfaces: fakeInterfaces("127.0.0.1"),
      });
      const err = startError(server);
      expect(err.message).toMatch(BUN_IN_USE);
      expect(err.message).not.toContain("not assigned");
    } finally {
      blocker.stop(true);
    }
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
});
