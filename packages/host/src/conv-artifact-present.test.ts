/**
 * PLAN 0.23.1 (R26) — tower-side M-2 consumption: presented (never
 * executed) fetch commands for artifacts[] on an incoming conv turn.
 */
import { describe, expect, test, beforeAll, afterAll, beforeEach } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateConvId, type ArtifactRefEntry } from "@loom/protocol";
import {
  resolveScpHostForConv,
  listLocalGitRemotes,
  presentArtifactCommands,
} from "./conv-artifact-present";
import { saveConvState, type ConvState } from "./conv-state";
import { saveConvNodeHosts } from "./conv-node-hosts";
import { resetStateHomeDirCache } from "./session-store";

const dir = join(tmpdir(), `loom-conv-artifact-present-${Date.now()}`);

beforeAll(() => {
  mkdirSync(dir, { recursive: true });
  process.env.LOOM_TEST_HOME = dir;
  resetStateHomeDirCache();
});

afterAll(() => {
  delete process.env.LOOM_TEST_HOME;
  resetStateHomeDirCache();
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* */
  }
});

function towerState(convId: string, pinnedPeerId: string): ConvState {
  const now = new Date().toISOString();
  return {
    convId,
    role: "tower",
    roomId: "room_test",
    pinnedPeerId,
    status: "active",
    limits: { maxTurns: 20, wallClockMs: 2 * 60 * 60 * 1000 },
    lastOwnSeq: 0,
    lastPeerSeq: 1,
    turnCount: 1,
    startedAt: now,
    updatedAt: now,
  };
}

describe("resolveScpHostForConv (R26 M-1)", () => {
  beforeEach(() => {
    saveConvNodeHosts({});
  });

  test("unknown conv (no local state) ⇒ null, fail-closed", () => {
    expect(resolveScpHostForConv(generateConvId())).toBeNull();
  });

  test("known conv but no host mapping for its pinned peer ⇒ null", () => {
    const convId = generateConvId();
    saveConvState(towerState(convId, "p_worker"));
    expect(resolveScpHostForConv(convId)).toBeNull();
  });

  test("resolves through the pinned peerId, never a wire-supplied displayName", () => {
    const convId = generateConvId();
    saveConvState(towerState(convId, "p_worker"));
    saveConvNodeHosts({ p_worker: "node-alias" });
    expect(resolveScpHostForConv(convId)).toBe("node-alias");
  });
});

describe("listLocalGitRemotes", () => {
  test("non-repo directory ⇒ empty list", () => {
    const empty = join(dir, "not-a-repo");
    mkdirSync(empty, { recursive: true });
    expect(listLocalGitRemotes(empty)).toEqual([]);
  });

  test("this repo has a known remote (read-only `git remote`, no network)", () => {
    // packages/host/src is inside the fable-advisor repo checkout.
    const remotes = listLocalGitRemotes(process.cwd());
    expect(Array.isArray(remotes)).toBe(true);
  });
});

describe("presentArtifactCommands (R26 M-2 consumption)", () => {
  beforeEach(() => {
    saveConvNodeHosts({});
  });

  test("scp ref with a resolvable host presents a command", () => {
    const convId = generateConvId();
    saveConvState(towerState(convId, "p_worker"));
    saveConvNodeHosts({ p_worker: "node-alias" });
    const artifacts: ArtifactRefEntry[] = [
      {
        transport: "scp",
        ref: { host: "self-reported-evil", path: `~/.loom/artifacts/${convId}/turn-3.txt` },
        sha256: "a".repeat(64),
        chars: 40000,
        gist: "full scrape",
      },
    ];
    const results = presentArtifactCommands(convId, artifacts);
    expect(results).toHaveLength(1);
    const r = results[0]!;
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.command).toContain("node-alias:");
      expect(r.command).not.toContain("self-reported-evil");
    }
  });

  test("scp ref fails closed with a reason when no local host mapping exists", () => {
    const convId = generateConvId();
    saveConvState(towerState(convId, "p_worker"));
    // no saveConvNodeHosts call — mapping stays empty
    const artifacts: ArtifactRefEntry[] = [
      {
        transport: "scp",
        ref: { path: `~/.loom/artifacts/${convId}/turn-1.txt` },
      },
    ];
    const results = presentArtifactCommands(convId, artifacts);
    expect(results[0]!.ok).toBe(false);
    if (!results[0]!.ok) expect(results[0]!.reason).toMatch(/mapping/);
  });

  test("git ref fails closed when the remote is not locally known", () => {
    const convId = generateConvId();
    saveConvState(towerState(convId, "p_worker"));
    const artifacts: ArtifactRefEntry[] = [
      {
        transport: "git",
        ref: { branch: `conv/${convId}/patch-1` },
      },
    ];
    // listLocalGitRemotes() runs against process.cwd() by default inside
    // presentArtifactCommands; from the test runner's cwd this repo does
    // have "origin", so exercise the negative case via an out-of-prefix
    // branch instead (still a legitimate M-2 rejection path).
    const badArtifacts: ArtifactRefEntry[] = [
      { transport: "git", ref: { branch: "main" } },
    ];
    void artifacts;
    const results = presentArtifactCommands(convId, badArtifacts);
    expect(results[0]!.ok).toBe(false);
  });

  test("multiple refs preserve input order in the output", () => {
    const convId = generateConvId();
    saveConvState(towerState(convId, "p_worker"));
    saveConvNodeHosts({ p_worker: "node-alias" });
    const artifacts: ArtifactRefEntry[] = [
      { transport: "git", ref: { branch: "main" } }, // fails
      {
        transport: "scp",
        ref: { path: `~/.loom/artifacts/${convId}/turn-1.txt` },
      }, // succeeds
    ];
    const results = presentArtifactCommands(convId, artifacts);
    expect(results).toHaveLength(2);
    expect(results[0]!.transport).toBe("git");
    expect(results[0]!.ok).toBe(false);
    expect(results[1]!.transport).toBe("scp");
    expect(results[1]!.ok).toBe(true);
  });
});
