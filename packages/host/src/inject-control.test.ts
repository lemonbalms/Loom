import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { HandoffPayload } from "@loom/protocol";
import { BRACKETED_PASTE_END } from "./handoff-inject";
import {
  buildInjectAcceptedLine,
  injectIdleMarkerPath,
  injectSocketPath,
  notifyInjectAccepted,
  runIdForCurrentProfile,
} from "./inject-control";
import {
  loomDir,
  resetActiveProfile,
  resetStateHomeDirCache,
  setActiveProfile,
} from "./session-store";

const handoff: HandoffPayload = {
  id: "ho_test",
  fromPeerId: "p_sender",
  to: "@me",
  mode: "message",
  body: "hello\x1b[31mred",
  createdAt: "2026-01-01T00:00:00.000Z",
};

let root = "";

function isUnder(path: string, dir: string): boolean {
  const rel = relative(resolve(dir), resolve(path));
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`));
}

beforeEach(() => {
  root = mkdtempSync("/tmp/loom-inject-");
  process.env.LOOM_TEST_HOME = root;
  resetActiveProfile();
  resetStateHomeDirCache();
});

afterEach(() => {
  resetActiveProfile();
  delete process.env.LOOM_TEST_HOME;
  resetStateHomeDirCache();
  rmSync(root, { recursive: true, force: true });
});

describe("inject-control", () => {
  test("paths resolve under loomDir for the current profile", () => {
    setActiveProfile("alice/bob");
    const home = loomDir();
    expect(runIdForCurrentProfile()).toBe("alice/bob");
    expect(injectSocketPath(runIdForCurrentProfile())).toBe(
      join(home, "inject-alice_bob.sock"),
    );
    expect(injectIdleMarkerPath("default")).toBe(
      join(home, "inject-default.idle"),
    );
    expect(isUnder(injectSocketPath(runIdForCurrentProfile()), home)).toBe(true);
    expect(isUnder(injectIdleMarkerPath(runIdForCurrentProfile()), home)).toBe(true);
  });

  test("buildInjectAcceptedLine sends sanitized unframed paste text", () => {
    const line = buildInjectAcceptedLine(handoff);
    const parsed = JSON.parse(line);
    expect(parsed).toMatchObject({ id: "ho_test" });
    expect(parsed.text).toContain("Untrusted handoff content");
    expect(parsed.text).toContain("LOOM HANDOFF");
    expect(parsed.text).not.toContain("\x1b[31m");
    expect(parsed.text).not.toContain(BRACKETED_PASTE_END);
    expect(parsed.text.endsWith("\n")).toBe(false);
  });

  test("notifyInjectAccepted is a safe no-op with no listener", async () => {
    const result = await notifyInjectAccepted(handoff, undefined, {
      timeoutMs: 50,
    });
    expect(result).toEqual({ ok: false, reason: "no_listener" });
  });

  test("notifyInjectAccepted speaks json-line request and ack protocol", async () => {
    const socketPath = injectSocketPath("default");
    mkdirSync(dirname(socketPath), { recursive: true });
    let server: Server | null = null;
    const received = new Promise<string>((resolveReceived) => {
      server = createServer((conn) => {
        let data = "";
        conn.on("data", (chunk) => {
          data += chunk.toString("utf8");
          if (data.includes("\n")) {
            resolveReceived(data);
            conn.end(`${JSON.stringify({ ok: true })}\n`);
          }
        });
      });
    });
    const listening = await new Promise<boolean>((resolveListening) => {
      server!.once("error", () => resolveListening(false));
      server!.listen(socketPath, () => resolveListening(true));
    });
    if (!listening) {
      if (server) {
        (server as Server).close();
      }
      return;
    }
    chmodSync(socketPath, 0o600);

    const result = await notifyInjectAccepted(handoff, undefined, {
      timeoutMs: 1000,
    });
    expect(result).toEqual({ ok: true });
    const line = await received;
    const parsed = JSON.parse(line);
    expect(parsed.id).toBe("ho_test");
    expect(parsed.text).toContain("Untrusted handoff content");
    await new Promise<void>((resolveClosed) =>
      server!.close(() => resolveClosed()),
    );
  });
});
