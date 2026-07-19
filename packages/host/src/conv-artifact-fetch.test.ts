/**
 * PLAN 0.25.0 / R40 — conv_fetch executor tests (D2–D7, M-A..M-D, L-2).
 * scp is injected via runScp — no live network. Existing present /
 * validateScpArtifactRef / resolveConvNodeHost suites remain untouched.
 */
import {
  describe,
  expect,
  test,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import {
  mkdirSync,
  rmSync,
  writeFileSync,
  existsSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { join, sep } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import {
  generateConvId,
  convArtifactsRootLiteral,
  validateScpArtifactRef,
  presentScpFetchCommand,
  type ArtifactRefEntry,
} from "@loom/protocol";
import {
  convFetch,
  buildScpFetchArgv,
  isPathInsideRoot,
  convFetchLocalDir,
  SCP_SUPPORTS_OPTION_TERMINATOR,
  _resetConvFetchLocksForTests,
  type ConvFetchRunScp,
} from "./conv-artifact-fetch";
import {
  saveConvState,
  getStoredArtifactRef,
  isFreshPeerSeq,
  mutateConvState,
  type ConvState,
} from "./conv-state";
import { saveConvNodeHosts } from "./conv-node-hosts";
import {
  resolveScpHostForConv,
  presentArtifactCommands,
} from "./conv-artifact-present";
import { resetStateHomeDirCache, loomDir } from "./session-store";

const dir = join(tmpdir(), `loom-conv-artifact-fetch-${Date.now()}`);

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

beforeEach(() => {
  saveConvNodeHosts({});
  _resetConvFetchLocksForTests();
});

function shaOf(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function towerState(
  convId: string,
  pinnedPeerId: string,
  overrides?: Partial<ConvState>,
): ConvState {
  const now = new Date().toISOString();
  return {
    convId,
    role: "tower",
    roomId: "room_test",
    pinnedPeerId,
    status: "active",
    limits: { maxTurns: 20, wallClockMs: 2 * 60 * 60 * 1000 },
    lastOwnSeq: 0,
    lastPeerSeq: 0,
    turnCount: 0,
    startedAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function scpEntry(
  convId: string,
  filename: string,
  content: string,
  opts?: { sha256?: string | false; host?: string },
): { entry: ArtifactRefEntry; content: string; sha: string } {
  const sha = shaOf(content);
  const path = `${convArtifactsRootLiteral(convId)}/${filename}`;
  const entry: ArtifactRefEntry = {
    transport: "scp",
    ref: { path, host: opts?.host ?? "wire-ignored" },
    chars: content.length,
  };
  if (opts?.sha256 === false) {
    // omit sha256
  } else {
    entry.sha256 = opts?.sha256 ?? sha;
  }
  return { entry, content, sha };
}

function seedRef(
  convId: string,
  peerId: string,
  host: string,
  seq: number,
  entries: ArtifactRefEntry[],
  lastPeerSeqBefore = 0,
): void {
  saveConvState(
    towerState(convId, peerId, {
      lastPeerSeq: lastPeerSeqBefore,
      artifactsBySeq: { [seq]: entries },
    }),
  );
  saveConvNodeHosts({ [peerId]: host });
}

/** runScp that writes `content` to argv's last element (dest). */
function runScpWrite(
  content: string | Buffer,
  hooks?: {
    onStart?: () => void;
    delayMs?: number;
    exitCode?: number;
    hangUntilAbort?: boolean;
  },
): ConvFetchRunScp {
  return async (argv, signal) => {
    hooks?.onStart?.();
    const dest = argv[argv.length - 1]!;
    if (hooks?.hangUntilAbort) {
      await new Promise<void>((_resolve, reject) => {
        if (signal.aborted) {
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
          return;
        }
        signal.addEventListener("abort", () => {
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        });
      });
    }
    if (hooks?.delayMs) {
      await new Promise((r) => setTimeout(r, hooks.delayMs));
    }
    if (signal.aborted) {
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    }
    if ((hooks?.exitCode ?? 0) === 0) {
      writeFileSync(dest, content);
    }
    return { exitCode: hooks?.exitCode ?? 0, stderr: "" };
  };
}

// ---------------------------------------------------------------------------
// argv assembly (D4 / U2)
// ---------------------------------------------------------------------------
describe("buildScpFetchArgv (D4, U2)", () => {
  test("assembles shell-free argv with BatchMode and -- terminator", () => {
    expect(SCP_SUPPORTS_OPTION_TERMINATOR).toBe(true);
    const argv = buildScpFetchArgv("node-alias", "~/.loom/artifacts/c/x.txt", "/tmp/x.txt");
    expect(argv).toEqual([
      "scp",
      "-o",
      "BatchMode=yes",
      "--",
      "node-alias:~/.loom/artifacts/c/x.txt",
      "/tmp/x.txt",
    ]);
    // No shell metacharacters joined into a single string for sh -c.
    expect(argv.every((a) => typeof a === "string")).toBe(true);
    expect(argv.join(" ")).not.toMatch(/sh -c/);
  });

  test("does not parse presentScpFetchCommand render strings", () => {
    // Render string is quoted for paste; exec path builds argv independently.
    const presented = presentScpFetchCommand(
      "conv_aaaaaaaaaaaaaaaa",
      { path: "~/.loom/artifacts/conv_aaaaaaaaaaaaaaaa/a.txt" },
      () => "h",
      "~/.loom/artifacts/conv_aaaaaaaaaaaaaaaa",
    );
    expect(presented.ok).toBe(true);
    if (!presented.ok) return;
    const argv = buildScpFetchArgv(
      "h",
      "~/.loom/artifacts/conv_aaaaaaaaaaaaaaaa/a.txt",
      "/tmp/a.txt",
    );
    // Render uses POSIX single-quotes; argv tokens are bare.
    expect(presented.command).toContain("'");
    expect(argv.some((t) => t.includes("'"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// M-D turn storage + coordinate lookup
// ---------------------------------------------------------------------------
describe("artifactsBySeq storage (M-D) + getStoredArtifactRef (D2)", () => {
  test("fresh-turn store then (convId, seq, index) lookup succeeds", () => {
    const convId = generateConvId();
    const { entry } = scpEntry(convId, "turn-1.txt", "hello");
    // Mirror conv-ops: only after isFreshPeerSeq.
    saveConvState(towerState(convId, "p_aaaaaaaaaaaaaaaa", { lastPeerSeq: 0 }));
    const state = towerState(convId, "p_aaaaaaaaaaaaaaaa", { lastPeerSeq: 0 });
    expect(isFreshPeerSeq(state, 1)).toBe(true);
    mutateConvState(convId, "tower", (s) => {
      s.lastPeerSeq = 1;
      s.turnCount += 1;
      if (!s.artifactsBySeq) s.artifactsBySeq = {};
      s.artifactsBySeq[1] = [entry];
    });
    expect(getStoredArtifactRef(convId, 1, 0)?.sha256).toBe(entry.sha256);
  });

  test("replay / out-of-order does not refresh stored refs (M-D)", () => {
    const convId = generateConvId();
    const orig = scpEntry(convId, "a.txt", "original").entry;
    const forged = scpEntry(convId, "a.txt", "forged-payload").entry;
    saveConvState(
      towerState(convId, "p_bbbbbbbbbbbbbbbb", {
        lastPeerSeq: 1,
        artifactsBySeq: { 1: [orig] },
      }),
    );
    const state = {
      ...towerState(convId, "p_bbbbbbbbbbbbbbbb", { lastPeerSeq: 1 }),
    };
    // Replay seq=1 is not fresh.
    expect(isFreshPeerSeq(state, 1)).toBe(false);
    // Code path in conv-ops returns early — we must not overwrite.
    if (isFreshPeerSeq(state, 1)) {
      mutateConvState(convId, "tower", (s) => {
        if (!s.artifactsBySeq) s.artifactsBySeq = {};
        s.artifactsBySeq[1] = [forged];
      });
    }
    expect(getStoredArtifactRef(convId, 1, 0)?.sha256).toBe(orig.sha256);
    expect(getStoredArtifactRef(convId, 1, 0)?.sha256).not.toBe(forged.sha256);
  });

  test("unknown conv / missing seq / out-of-range index → null", () => {
    const convId = generateConvId();
    const { entry } = scpEntry(convId, "a.txt", "x");
    saveConvState(
      towerState(convId, "p_cccccccccccccccc", {
        artifactsBySeq: { 1: [entry] },
      }),
    );
    expect(getStoredArtifactRef("conv_ffffffffffffffff", 1, 0)).toBeNull();
    expect(getStoredArtifactRef(convId, 99, 0)).toBeNull();
    expect(getStoredArtifactRef(convId, 1, 5)).toBeNull();
    expect(getStoredArtifactRef(convId, 1, -1)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Coordinate + transport fail-closed (D2/D3)
// ---------------------------------------------------------------------------
describe("convFetch coordinate / transport (D2, D3)", () => {
  test("unknown convId → fail-closed", async () => {
    const r = await convFetch({
      convId: generateConvId(),
      seq: 1,
      index: 0,
      runScp: runScpWrite("x"),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no stored artifact ref/);
  });

  test("git transport → fail-closed (present-only)", async () => {
    const convId = generateConvId();
    const peer = "p_dddddddddddddddd";
    const gitEntry: ArtifactRefEntry = {
      transport: "git",
      ref: { branch: `conv/${convId}/main`, commit: "abc" },
      sha256: shaOf("x"),
    };
    seedRef(convId, peer, "node-alias", 1, [gitEntry]);
    const r = await convFetch({
      convId,
      seq: 1,
      index: 0,
      runScp: runScpWrite("x"),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/git|present-only|scp only/i);
  });

  test("git present path still returns artifactCommands (regression)", () => {
    const convId = generateConvId();
    saveConvState(towerState(convId, "p_eeeeeeeeeeeeeeee"));
    const artifacts: ArtifactRefEntry[] = [
      {
        transport: "git",
        ref: { branch: `conv/${convId}/feat`, commit: "deadbeef" },
      },
    ];
    const cmds = presentArtifactCommands(convId, artifacts);
    expect(cmds).toHaveLength(1);
    expect(cmds[0]!.transport).toBe("git");
    // Present path still runs (ok or fail-closed reason) — never executed here.
    expect(cmds[0]).toHaveProperty("ok");
  });
});

// ---------------------------------------------------------------------------
// M-A sha256 absent
// ---------------------------------------------------------------------------
describe("M-A sha256 required", () => {
  test("sha256-absent ref is rejected (present-only residual)", async () => {
    const convId = generateConvId();
    const peer = "p_ffffffffffffffff";
    const { entry } = scpEntry(convId, "no-sha.txt", "body", { sha256: false });
    seedRef(convId, peer, "node-alias", 1, [entry]);
    const r = await convFetch({
      convId,
      seq: 1,
      index: 0,
      runScp: runScpWrite("body"),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no sha256|M-A|present-only/i);
  });
});

// ---------------------------------------------------------------------------
// Re-validation fail-closed (M-B, M-C, mapping absence)
// ---------------------------------------------------------------------------
describe("exec-path re-validation (D4, M-B, M-C)", () => {
  test("missing conv→node mapping → fail-closed (no scp run)", async () => {
    const convId = generateConvId();
    const peer = "p_1111111111111111";
    const { entry, content } = scpEntry(convId, "a.txt", "data");
    saveConvState(
      towerState(convId, peer, { artifactsBySeq: { 1: [entry] } }),
    );
    // no host mapping
    let ran = false;
    const r = await convFetch({
      convId,
      seq: 1,
      index: 0,
      runScp: async (argv, signal) => {
        ran = true;
        return runScpWrite(content)(argv, signal);
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/mapping|host/i);
    expect(ran).toBe(false);
  });

  test("host leading '-' rejected (M-B) — no scp run", async () => {
    const convId = generateConvId();
    const peer = "p_2222222222222222";
    const { entry, content } = scpEntry(convId, "a.txt", "data");
    // Hand-edit-style mapping: load accepts non-strict; exec re-validates.
    seedRef(convId, peer, "-evil-host", 1, [entry]);
    let ran = false;
    const r = await convFetch({
      convId,
      seq: 1,
      index: 0,
      runScp: async (argv, signal) => {
        ran = true;
        return runScpWrite(content)(argv, signal);
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/M-B|must not start with|option-injection/i);
    expect(ran).toBe(false);
  });

  test("host embedded ':' rejected (M-B)", async () => {
    const convId = generateConvId();
    const peer = "p_3333333333333333";
    const { entry, content } = scpEntry(convId, "a.txt", "data");
    seedRef(convId, peer, "host:22", 1, [entry]);
    let ran = false;
    const r = await convFetch({
      convId,
      seq: 1,
      index: 0,
      runScp: async (argv, signal) => {
        ran = true;
        return runScpWrite(content)(argv, signal);
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/M-B|charset|:/i);
    expect(ran).toBe(false);
  });

  test("host bad charset rejected (M-B)", async () => {
    const convId = generateConvId();
    const peer = "p_4444444444444444";
    const { entry, content } = scpEntry(convId, "a.txt", "data");
    seedRef(convId, peer, "host name", 1, [entry]);
    let ran = false;
    const r = await convFetch({
      convId,
      seq: 1,
      index: 0,
      runScp: async (argv, signal) => {
        ran = true;
        return runScpWrite(content)(argv, signal);
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/M-B|charset/i);
    expect(ran).toBe(false);
  });

  test("path suffix with shell metachar fails M-C — no scp run", async () => {
    const convId = generateConvId();
    const peer = "p_5555555555555555";
    // Prefix OK for validateScpArtifactRef; suffix fails isSafeConvSuffix.
    const badPath = `${convArtifactsRootLiteral(convId)}/$(cmd).txt`;
    const entry: ArtifactRefEntry = {
      transport: "scp",
      ref: { path: badPath },
      sha256: shaOf("x"),
    };
    seedRef(convId, peer, "node-alias", 1, [entry]);
    let ran = false;
    const r = await convFetch({
      convId,
      seq: 1,
      index: 0,
      runScp: async () => {
        ran = true;
        return { exitCode: 0, stderr: "" };
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/M-C|charset|isSafeConvSuffix|suffix/i);
    expect(ran).toBe(false);
  });

  test("path segment leading '-' fails M-C", async () => {
    const convId = generateConvId();
    const peer = "p_6666666666666666";
    const badPath = `${convArtifactsRootLiteral(convId)}/-evil.txt`;
    const entry: ArtifactRefEntry = {
      transport: "scp",
      ref: { path: badPath },
      sha256: shaOf("x"),
    };
    seedRef(convId, peer, "node-alias", 1, [entry]);
    let ran = false;
    const r = await convFetch({
      convId,
      seq: 1,
      index: 0,
      runScp: async () => {
        ran = true;
        return { exitCode: 0, stderr: "" };
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/M-C|suffix|charset/i);
    expect(ran).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Happy path + D6 sha + D5 overwrite + containment (L-2)
// ---------------------------------------------------------------------------
describe("convFetch success + integrity + dest (D5, D6, L-2)", () => {
  test("happy path: argv metadata-only, sha match, file on disk", async () => {
    const convId = generateConvId();
    const peer = "p_7777777777777777";
    const body = "payload-body-ok";
    const { entry, content, sha } = scpEntry(convId, "turn-1.txt", body);
    seedRef(convId, peer, "node-alias", 1, [entry]);

    let capturedArgv: string[] = [];
    const r = await convFetch({
      convId,
      seq: 1,
      index: 0,
      runScp: async (argv, signal) => {
        capturedArgv = argv;
        return runScpWrite(content)(argv, signal);
      },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sha256).toBe(sha);
    expect(r.bytes).toBe(Buffer.byteLength(body));
    expect(r.argv).toEqual(capturedArgv);
    expect(r.argv[0]).toBe("scp");
    expect(r.argv).toContain("--");
    expect(r.argv).toContain("-o");
    // Metadata only — no content field.
    expect(r).not.toHaveProperty("content");
    expect(r).not.toHaveProperty("text");
    expect(existsSync(r.destPath)).toBe(true);
    expect(readFileSync(r.destPath, "utf8")).toBe(body);
    // Dest under loomDir()/artifacts/<convId>/ (platform sep, L-2).
    const root = realpathSync(join(loomDir(), "artifacts", convId));
    expect(isPathInsideRoot(root, realpathSync(r.destPath))).toBe(true);
    expect(r.destPath.includes(`${sep}artifacts${sep}`) || r.destPath.includes("artifacts")).toBe(
      true,
    );
  });

  test("sha256 mismatch → isolate + fail (D6)", async () => {
    const convId = generateConvId();
    const peer = "p_8888888888888888";
    const { entry } = scpEntry(convId, "bad-sha.txt", "expected");
    seedRef(convId, peer, "node-alias", 1, [entry]);
    const r = await convFetch({
      convId,
      seq: 1,
      index: 0,
      runScp: runScpWrite("tampered-different"),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/sha256 mismatch|D6|isolated/i);
    const dest = join(convFetchLocalDir(convId), "bad-sha.txt");
    expect(existsSync(dest)).toBe(false);
  });

  test("overwrite rejected when dest exists (D5)", async () => {
    const convId = generateConvId();
    const peer = "p_9999999999999999";
    const { entry, content } = scpEntry(convId, "exists.txt", "new");
    seedRef(convId, peer, "node-alias", 1, [entry]);
    const destDir = convFetchLocalDir(convId);
    mkdirSync(destDir, { recursive: true });
    writeFileSync(join(destDir, "exists.txt"), "already-here");
    let ran = false;
    const r = await convFetch({
      convId,
      seq: 1,
      index: 0,
      runScp: async (argv, signal) => {
        ran = true;
        return runScpWrite(content)(argv, signal);
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/already exists|overwrite|D5/i);
    expect(ran).toBe(false);
    expect(readFileSync(join(destDir, "exists.txt"), "utf8")).toBe("already-here");
  });

  test("isPathInsideRoot uses platform sep (L-2)", () => {
    const root = join(dir, "root");
    mkdirSync(root, { recursive: true });
    const rootReal = realpathSync(root);
    const inside = realpathSync(root); // equal is inside
    expect(isPathInsideRoot(rootReal, inside)).toBe(true);
    const child = join(rootReal, "child.txt");
    writeFileSync(child, "x");
    expect(isPathInsideRoot(rootReal, realpathSync(child))).toBe(true);
    // Sibling escape
    const sibling = join(dir, "sibling");
    mkdirSync(sibling, { recursive: true });
    expect(isPathInsideRoot(rootReal, realpathSync(sibling))).toBe(false);
  });

  test("validateScpArtifactRef still prefix-checks (no-regression)", () => {
    const convId = generateConvId();
    const root = convArtifactsRootLiteral(convId);
    const ok = validateScpArtifactRef(
      convId,
      { path: `${root}/ok.txt` },
      () => "h",
      root,
    );
    expect(ok.ok).toBe(true);
    const bad = validateScpArtifactRef(
      convId,
      { path: "/etc/passwd" },
      () => "h",
      root,
    );
    expect(bad.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Guards D7 — timeout, size, serialization
// ---------------------------------------------------------------------------
describe("guards (D7)", () => {
  test("timeout → fail + isolate partial (D7①)", async () => {
    const convId = generateConvId();
    const peer = "p_aaaaaaaaaaaaaa01";
    const { entry } = scpEntry(convId, "slow.txt", "never");
    seedRef(convId, peer, "node-alias", 1, [entry]);
    const r = await convFetch({
      convId,
      seq: 1,
      index: 0,
      timeoutMs: 30,
      runScp: runScpWrite("partial", { hangUntilAbort: true }),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/timed out|abort|D7/i);
    expect(existsSync(join(convFetchLocalDir(convId), "slow.txt"))).toBe(false);
  });

  test("size over maxBytes → isolate (D7②)", async () => {
    const convId = generateConvId();
    const peer = "p_aaaaaaaaaaaaaa02";
    const big = "x".repeat(100);
    const { entry } = scpEntry(convId, "big.txt", big);
    seedRef(convId, peer, "node-alias", 1, [entry]);
    const r = await convFetch({
      convId,
      seq: 1,
      index: 0,
      maxBytes: 50,
      runScp: runScpWrite(big),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/exceeds|cap|D7|isolated/i);
    expect(existsSync(join(convFetchLocalDir(convId), "big.txt"))).toBe(false);
  });

  test("same convId concurrent fetches are serialized (D7③)", async () => {
    const convId = generateConvId();
    const peer = "p_aaaaaaaaaaaaaa03";
    const a = scpEntry(convId, "a.txt", "AAA");
    const b = scpEntry(convId, "b.txt", "BBB");
    seedRef(convId, peer, "node-alias", 1, [a.entry, b.entry]);

    const order: string[] = [];
    const mkRunner = (label: string, content: string): ConvFetchRunScp => {
      return async (argv, signal) => {
        order.push(`start:${label}`);
        await new Promise((r) => setTimeout(r, 40));
        order.push(`end:${label}`);
        return runScpWrite(content)(argv, signal);
      };
    };

    const [r1, r2] = await Promise.all([
      convFetch({ convId, seq: 1, index: 0, runScp: mkRunner("a", a.content) }),
      convFetch({ convId, seq: 1, index: 1, runScp: mkRunner("b", b.content) }),
    ]);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    // Serialized: first fully ends before second starts.
    expect(order).toEqual(["start:a", "end:a", "start:b", "end:b"]);
  });
});

// ---------------------------------------------------------------------------
// present / resolveScpHost regression surface
// ---------------------------------------------------------------------------
describe("present path regression (D1)", () => {
  test("resolveScpHostForConv still mapping-only", () => {
    const convId = generateConvId();
    expect(resolveScpHostForConv(convId)).toBeNull();
    saveConvState(towerState(convId, "p_aaaaaaaaaaaaaa04"));
    saveConvNodeHosts({ p_aaaaaaaaaaaaaa04: "ok-host" });
    expect(resolveScpHostForConv(convId)).toBe("ok-host");
  });

  test("presentArtifactCommands scp still presents, never executes", () => {
    const convId = generateConvId();
    saveConvState(towerState(convId, "p_aaaaaaaaaaaaaa05"));
    saveConvNodeHosts({ p_aaaaaaaaaaaaaa05: "ok-host" });
    const artifacts: ArtifactRefEntry[] = [
      {
        transport: "scp",
        ref: { path: `${convArtifactsRootLiteral(convId)}/x.txt` },
        sha256: shaOf("x"),
      },
    ];
    const cmds = presentArtifactCommands(convId, artifacts);
    expect(cmds[0]?.ok).toBe(true);
    if (cmds[0]?.ok) {
      expect(cmds[0].command.startsWith("scp ")).toBe(true);
      expect(cmds[0].note).toMatch(/untrusted|verify/i);
    }
  });
});
