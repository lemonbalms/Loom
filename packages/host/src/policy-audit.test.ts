/**
 * PLAN 0.32.0 P2 — Done-when (d) / D8. Per-room local policy audit file
 * `<loomDir>/rooms/<roomKey(roomId)>/policy-audit.jsonl`: modes, line format,
 * 1 MiB rotation to `.1`, failure non-propagation, no arg values, and no
 * contact with the relay event log.
 */
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import {
  appendFileSync,
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  renameSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendPolicyAudit,
  evaluateMcpCall,
  POLICY_AUDIT_FILE,
  POLICY_AUDIT_MAX_BYTES,
  listPolicyAuditGenerations,
  POLICY_AUDIT_KEEP_GENERATIONS,
  type PolicyAuditRecord,
  policyAuditGenerationName,
  policyAuditTestHooks,
  resolveLoomToolsGate,
  type ToolRegistry,
} from "./mcp-precheck";
import { roomKey } from "./room-event-log";

const ROOM = "room-alpha";
let dir: string;
let stderr: ReturnType<typeof spyOn>;

function stderrText(): string {
  return stderr.mock.calls.map((c: unknown[]) => String(c[0])).join("");
}

function rec(over: Partial<PolicyAuditRecord> = {}): PolicyAuditRecord {
  return {
    v: 1,
    ts: "2026-10-16T00:00:00.000Z",
    kind: "refused",
    tool: "update_task",
    reason: "done_propose",
    peerId: "peer-self",
    roomId: ROOM,
    agentKind: "claude",
    cardId: "t1",
    ...over,
  };
}

function auditPath(root = dir, room = ROOM): string {
  return join(root, "rooms", roomKey(room), POLICY_AUDIT_FILE);
}

function roomDirOf(root = dir, room = ROOM): string {
  return join(root, "rooms", roomKey(room));
}

function lines(path: string): string[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.length > 0);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "loom-policy-audit-"));
  stderr = spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(() => {
  stderr.mockRestore();
  rmSync(dir, { recursive: true, force: true });
  policyAuditTestHooks.afterLstat = undefined;
  policyAuditTestHooks.generationName = undefined;
  policyAuditTestHooks.beforeRename = undefined;
  policyAuditTestHooks.write = undefined;
});

describe("appendPolicyAudit — location, modes, format", () => {
  test("file name is policy-audit.jsonl and the cap is 1 MiB", () => {
    expect(POLICY_AUDIT_FILE).toBe("policy-audit.jsonl");
    expect(POLICY_AUDIT_MAX_BYTES).toBe(1024 * 1024);
  });

  test("writes <dir>/rooms/<roomKey>/policy-audit.jsonl — file 0600, room dir 0700", () => {
    expect(appendPolicyAudit(dir, ROOM, rec())).toBe(true);
    const path = auditPath();
    expect(existsSync(path)).toBe(true);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(statSync(join(dir, "rooms", roomKey(ROOM))).mode & 0o777).toBe(0o700);
  });

  test("appends one valid JSON object per line, in order", () => {
    appendPolicyAudit(dir, ROOM, rec({ cardId: "a" }));
    appendPolicyAudit(dir, ROOM, rec({ kind: "done_via_mcp", reason: undefined, cardId: "b" }));
    appendPolicyAudit(dir, ROOM, rec({ tool: "conv_close", cardId: undefined, convId: "c1" }));
    const ls = lines(auditPath());
    expect(ls.length).toBe(3);
    const parsed = ls.map((l) => JSON.parse(l));
    expect(parsed[0]).toMatchObject({ v: 1, kind: "refused", cardId: "a", roomId: ROOM });
    expect(parsed[1]).toMatchObject({ kind: "done_via_mcp", cardId: "b" });
    expect(parsed[1].reason).toBeUndefined();
    expect(parsed[2]).toMatchObject({ tool: "conv_close", convId: "c1" });
  });

  test("an over-long field is truncated so the line stays ≤ 4 KiB and valid JSON", () => {
    expect(
      appendPolicyAudit(dir, ROOM, rec({ cardId: "x".repeat(10_000), tool: "y".repeat(5_000) })),
    ).toBe(true);
    const ls = lines(auditPath());
    expect(ls.length).toBe(1);
    expect(Buffer.byteLength(`${ls[0]}\n`, "utf8")).toBeLessThanOrEqual(4096);
    const parsed = JSON.parse(ls[0]);
    expect(parsed.kind).toBe("refused");
    expect(parsed.peerId).toBe("peer-self");
  });

  test("different rooms → different files", () => {
    appendPolicyAudit(dir, "room-a", rec({ roomId: "room-a" }));
    appendPolicyAudit(dir, "room-b", rec({ roomId: "room-b" }));
    expect(lines(auditPath(dir, "room-a")).length).toBe(1);
    expect(lines(auditPath(dir, "room-b")).length).toBe(1);
  });

  test("touches nothing else in the room dir (relay event log untouched)", () => {
    appendPolicyAudit(dir, ROOM, rec());
    expect(readdirSync(join(dir, "rooms", roomKey(ROOM)))).toEqual([POLICY_AUDIT_FILE]);
  });

  test("existing room dir and event-log files are left as they are", () => {
    const roomDir = join(dir, "rooms", roomKey(ROOM));
    mkdirSync(roomDir, { recursive: true });
    writeFileSync(join(roomDir, "events.jsonl"), "relay-line\n");
    appendPolicyAudit(dir, ROOM, rec());
    expect(readFileSync(join(roomDir, "events.jsonl"), "utf8")).toBe("relay-line\n");
  });
});

describe("appendPolicyAudit — rotation to unique generations (D8 amended, UK-3)", () => {
  afterEach(() => {
    policyAuditTestHooks.afterLstat = undefined;
    policyAuditTestHooks.generationName = undefined;
  });

  test("generation name: policy-audit.<YYYYMMDDTHHmmssSSSZ>-<pid>-<6 base36>.jsonl, fixed width, no colons", () => {
    const a = policyAuditGenerationName(new Date("2026-10-16T01:02:03.004Z"), 42, "a1b2c3");
    expect(a).toBe("policy-audit.20261016T010203004Z-0000000042-a1b2c3.jsonl");
    expect(a).not.toContain(":");
    const b = policyAuditGenerationName(new Date("2026-10-16T01:02:03.005Z"), 4194304, "000000");
    expect(b.length).toBe(a.length);
    expect([b, a].sort()).toEqual([a, b]);
    const c = policyAuditGenerationName(new Date("2027-01-01T00:00:00.000Z"), 1, "zzzzzz");
    expect([c, b, a].sort()).toEqual([a, b, c]);
  });

  test("listPolicyAuditGenerations: rotated oldest → newest, then the live file; others ignored", () => {
    const roomDir = join(dir, "rooms", roomKey(ROOM));
    mkdirSync(roomDir, { recursive: true });
    const g1 = policyAuditGenerationName(new Date("2026-01-01T00:00:00.000Z"), 7, "aaaaaa");
    const g2 = policyAuditGenerationName(new Date("2026-02-01T00:00:00.000Z"), 7, "aaaaaa");
    for (const n of [
      g2,
      POLICY_AUDIT_FILE,
      g1,
      "events.jsonl",
      "policy-audit.jsonl.1",
      "policy-audit.x.jsonl",
    ]) {
      writeFileSync(join(roomDir, n), "x\n");
    }
    expect(listPolicyAuditGenerations(roomDir)).toEqual([g1, g2, POLICY_AUDIT_FILE]);
    expect(listPolicyAuditGenerations(join(dir, "missing"))).toEqual([]);
    rmSync(join(roomDir, POLICY_AUDIT_FILE));
    expect(listPolicyAuditGenerations(roomDir)).toEqual([g1, g2]);
  });

  test("file over the cap → renamed to a unique generation before the append; new file holds only the new record", () => {
    const path = auditPath();
    appendPolicyAudit(dir, ROOM, rec());
    const filler = `${JSON.stringify({ filler: "z".repeat(1000) })}\n`;
    writeFileSync(path, filler.repeat(Math.ceil(POLICY_AUDIT_MAX_BYTES / filler.length)));
    const bigSize = statSync(path).size;
    expect(appendPolicyAudit(dir, ROOM, rec({ cardId: "after" }))).toBe(true);
    const gens = listPolicyAuditGenerations(roomDirOf());
    expect(gens.length).toBe(2);
    expect(gens[1]).toBe(POLICY_AUDIT_FILE);
    expect(statSync(join(roomDirOf(), gens[0])).size).toBe(bigSize); // moved whole — no truncation
    const ls = lines(path);
    expect(ls.length).toBe(1);
    expect(JSON.parse(ls[0]).cardId).toBe("after");
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  test("size + line ≤ cap → no rotation (exactly reaching the cap is fine)", () => {
    const path = auditPath();
    const line = `${JSON.stringify(rec())}\n`;
    appendPolicyAudit(dir, ROOM, rec());
    writeFileSync(path, "a".repeat(POLICY_AUDIT_MAX_BYTES - Buffer.byteLength(line)));
    expect(appendPolicyAudit(dir, ROOM, rec())).toBe(true);
    expect(listPolicyAuditGenerations(roomDirOf())).toEqual([POLICY_AUDIT_FILE]);
    expect(statSync(path).size).toBe(POLICY_AUDIT_MAX_BYTES);
  });

  test("size + line > cap → rotate BEFORE the write; the live file never exceeds the cap", () => {
    const path = auditPath();
    const line = `${JSON.stringify(rec())}\n`;
    appendPolicyAudit(dir, ROOM, rec());
    const before = POLICY_AUDIT_MAX_BYTES - Buffer.byteLength(line) + 1;
    writeFileSync(path, "a".repeat(before));
    expect(appendPolicyAudit(dir, ROOM, rec())).toBe(true);
    const gens = listPolicyAuditGenerations(roomDirOf());
    expect(gens.length).toBe(2);
    expect(statSync(join(roomDirOf(), gens[0])).size).toBe(before);
    expect(statSync(path).size).toBe(Buffer.byteLength(line));
  });

  test("many appends: the live file stays ≤ cap; no lockfile or other stray files", () => {
    const path = auditPath();
    appendPolicyAudit(dir, ROOM, rec());
    writeFileSync(path, "a".repeat(POLICY_AUDIT_MAX_BYTES - 10));
    for (let i = 0; i < 5; i++) {
      expect(appendPolicyAudit(dir, ROOM, rec({ cardId: `c${i}` }))).toBe(true);
      expect(statSync(path).size).toBeLessThanOrEqual(POLICY_AUDIT_MAX_BYTES);
    }
    expect(readdirSync(roomDirOf()).sort()).toEqual(listPolicyAuditGenerations(roomDirOf()).sort());
  });

  test("pruning keeps exactly the newest 3 rotated generations (≤ 4 MiB per room)", () => {
    const roomDir = roomDirOf();
    mkdirSync(roomDir, { recursive: true });
    const old = [1, 2, 3, 4, 5].map((m) =>
      policyAuditGenerationName(new Date(`2025-0${m}-01T00:00:00.000Z`), 9, "oooooo"),
    );
    old.forEach((n, i) => {
      writeFileSync(join(roomDir, n), "old\n");
      const t = new Date(Date.now() - (100 - i) * 1000);
      utimesSync(join(roomDir, n), t, t);
    });
    writeFileSync(join(roomDir, POLICY_AUDIT_FILE), "a".repeat(POLICY_AUDIT_MAX_BYTES));
    expect(appendPolicyAudit(dir, ROOM, rec({ cardId: "new" }))).toBe(true);
    const gens = listPolicyAuditGenerations(roomDir);
    expect(gens.length).toBe(4);
    expect(gens.slice(0, 2)).toEqual([old[3], old[4]]);
    expect(statSync(join(roomDir, gens[2])).size).toBe(POLICY_AUDIT_MAX_BYTES);
    expect(gens[3]).toBe(POLICY_AUDIT_FILE);
    expect(POLICY_AUDIT_KEEP_GENERATIONS).toBe(3);
  });

  test("pruning is by mtime, not name: a newer-written generation with an older name is kept", () => {
    const roomDir = roomDirOf();
    mkdirSync(roomDir, { recursive: true });
    // Names in one order, mtimes in the reverse order.
    const names = [1, 2, 3, 4].map((m) =>
      policyAuditGenerationName(new Date(`2025-0${m}-01T00:00:00.000Z`), 9, "nnnnnn"),
    );
    names.forEach((n, i) => {
      writeFileSync(join(roomDir, n), `gen${i}\n`);
      const t = new Date(Date.now() - (10 + i) * 1000); // names[0] newest mtime
      utimesSync(join(roomDir, n), t, t);
    });
    writeFileSync(join(roomDir, POLICY_AUDIT_FILE), "a".repeat(POLICY_AUDIT_MAX_BYTES));
    expect(appendPolicyAudit(dir, ROOM, rec())).toBe(true);
    const left = readdirSync(roomDir);
    // 5 rotated → keep 3 newest by mtime: the fresh rotation, names[0], names[1].
    expect(left).toContain(names[0]);
    expect(left).toContain(names[1]);
    expect(left).not.toContain(names[2]);
    expect(left).not.toContain(names[3]);
    expect(listPolicyAuditGenerations(roomDir).length).toBe(4);
  });

  test("M2 interleaving: A allocates t0 and pauses, B rotates 3×, A renames with t0 → A's generation kept", () => {
    const roomDir = roomDirOf();
    const path = auditPath();
    appendPolicyAudit(dir, ROOM, rec());
    writeFileSync(path, "G0-LINE\n".repeat(Math.ceil(POLICY_AUDIT_MAX_BYTES / 8)));
    const g0Time = new Date(Date.now() - 100_000);
    utimesSync(path, g0Time, g0Time);
    const t0 = policyAuditGenerationName(new Date("2026-01-01T00:00:00.000Z"), 1, "aaaaaa");
    let nameCalls = 0;
    policyAuditTestHooks.generationName = () => (nameCalls++ === 0 ? t0 : undefined);
    let paused = false;
    policyAuditTestHooks.beforeRename = () => {
      if (paused) return;
      paused = true; // A has allocated t0; B now rotates three times.
      for (let i = 1; i <= 3; i++) {
        if (i > 1) {
          appendFileSync(path, "B-FILL\n".repeat(Math.ceil(POLICY_AUDIT_MAX_BYTES / 7)));
          const t = new Date(Date.now() - (60 - i) * 1000);
          utimesSync(path, t, t);
        }
        expect(appendPolicyAudit(dir, ROOM, rec({ cardId: `B${i}` }))).toBe(true);
      }
    };
    expect(appendPolicyAudit(dir, ROOM, rec({ cardId: "A" }))).toBe(true);
    expect(paused).toBe(true);
    const left = readdirSync(roomDir);
    // A's t0 generation holds B3's record and is the most recently written → kept.
    expect(left).toContain(t0);
    expect(readFileSync(join(roomDir, t0), "utf8")).toContain('"B3"');
    const rotated = listPolicyAuditGenerations(roomDir).filter((n) => n !== POLICY_AUDIT_FILE);
    expect(rotated.length).toBe(POLICY_AUDIT_KEEP_GENERATIONS);
    // The oldest-written generation (G0) is the one pruned.
    for (const n of rotated)
      expect(readFileSync(join(roomDir, n), "utf8")).not.toContain("G0-LINE");
    expect(lines(path).map((l) => JSON.parse(l).cardId)).toEqual(["A"]);
  });

  test("round 4: the generation this call just rotated survives even with the oldest mtime; a paused writer's record stays reachable", () => {
    const roomDir = roomDirOf();
    mkdirSync(roomDir, { recursive: true });
    const others = ["A", "B", "C"].map((x, i) =>
      policyAuditGenerationName(
        new Date(`2025-0${i + 1}-01T00:00:00.000Z`),
        9,
        `${x}${x}${x}${x}${x}${x}`.toLowerCase(),
      ),
    );
    others.forEach((n, i) => {
      writeFileSync(join(roomDir, n), `other${i}\n`);
      const t = new Date(Date.now() - (10 - i) * 1000); // newer than L
      utimesSync(join(roomDir, n), t, t);
    });
    const path = auditPath();
    writeFileSync(path, "L-LINE\n".repeat(Math.ceil(POLICY_AUDIT_MAX_BYTES / 7)));
    const lTime = new Date(Date.now() - 100_000); // rename keeps L's old mtime
    utimesSync(path, lTime, lTime);
    // W has L open (paused before its write).
    const wFd = openSync(path, "a");
    try {
      expect(appendPolicyAudit(dir, ROOM, rec({ cardId: "R" }))).toBe(true); // R rotates L → D
      writeSync(wFd, `${JSON.stringify(rec({ cardId: "W" }))}\n`);
    } finally {
      closeSync(wFd);
    }
    const rotated = listPolicyAuditGenerations(roomDir).filter((n) => n !== POLICY_AUDIT_FILE);
    const d = rotated.filter((n) => !others.includes(n));
    expect(d.length).toBe(1);
    expect(rotated.length).toBe(POLICY_AUDIT_KEEP_GENERATIONS);
    const dText = readFileSync(join(roomDir, d[0]), "utf8");
    expect(dText).toContain("L-LINE");
    expect(dText).toContain('"W"');
    // Remaining slots = newest others by mtime: others[2], others[1]; others[0] pruned.
    expect(rotated).toContain(others[1]);
    expect(rotated).toContain(others[2]);
    expect(rotated).not.toContain(others[0]);
  });

  test("no rotation → no pruning (old generations untouched)", () => {
    const roomDir = roomDirOf();
    mkdirSync(roomDir, { recursive: true });
    const old = [1, 2, 3, 4, 5].map((m) =>
      policyAuditGenerationName(new Date(`2025-0${m}-01T00:00:00.000Z`), 9, "oooooo"),
    );
    for (const n of old) writeFileSync(join(roomDir, n), "old\n");
    expect(appendPolicyAudit(dir, ROOM, rec())).toBe(true);
    expect(listPolicyAuditGenerations(roomDir).length).toBe(6);
  });

  test("interleaving 1: B sees oversized G0, A rotates + writes first → G0 kept, ≤ 1 extra small generation, no record lost", () => {
    const path = auditPath();
    appendPolicyAudit(dir, ROOM, rec());
    writeFileSync(path, "G0-LINE\n".repeat(Math.ceil(POLICY_AUDIT_MAX_BYTES / 8)));
    const g0Size = statSync(path).size;
    let fired = false;
    policyAuditTestHooks.afterLstat = () => {
      if (fired) return;
      fired = true; // B is between lstat and rename; A runs to completion.
      expect(appendPolicyAudit(dir, ROOM, rec({ cardId: "writer-A" }))).toBe(true);
    };
    expect(appendPolicyAudit(dir, ROOM, rec({ cardId: "writer-B" }))).toBe(true);
    expect(fired).toBe(true);
    const gens = listPolicyAuditGenerations(roomDirOf());
    const rotated = gens.filter((g) => g !== POLICY_AUDIT_FILE);
    const g0 = rotated.filter((g) => statSync(join(roomDirOf(), g)).size === g0Size);
    expect(g0.length).toBe(1);
    expect(readFileSync(join(roomDirOf(), g0[0]), "utf8")).toContain("G0-LINE");
    expect(rotated.length).toBeLessThanOrEqual(2);
    for (const g of rotated.filter((x) => x !== g0[0])) {
      expect(statSync(join(roomDirOf(), g)).size).toBeLessThan(4096);
    }
    const all = gens.flatMap((g) => readFileSync(join(roomDirOf(), g), "utf8").split("\n"));
    const ids = all.filter((l) => l.startsWith("{")).map((l) => JSON.parse(l).cardId);
    expect(ids).toContain("writer-A");
    expect(ids).toContain("writer-B");
  });

  test("interleaving 2: another writer renames G0 between B's lstat and rename → B's rename ENOENT, continues", () => {
    const path = auditPath();
    appendPolicyAudit(dir, ROOM, rec());
    writeFileSync(path, "G0-LINE\n".repeat(Math.ceil(POLICY_AUDIT_MAX_BYTES / 8)));
    const g0Size = statSync(path).size;
    const otherGen = policyAuditGenerationName(new Date(), 1, "other0");
    let fired = false;
    policyAuditTestHooks.afterLstat = () => {
      if (fired) return;
      fired = true;
      renameSync(path, join(roomDirOf(), otherGen)); // the other writer's rotation
    };
    expect(appendPolicyAudit(dir, ROOM, rec({ cardId: "writer-B" }))).toBe(true);
    const gens = listPolicyAuditGenerations(roomDirOf());
    expect(gens).toEqual([otherGen, POLICY_AUDIT_FILE]);
    expect(statSync(join(roomDirOf(), otherGen)).size).toBe(g0Size);
    expect(lines(path).map((l) => JSON.parse(l).cardId)).toEqual(["writer-B"]);
  });

  test("interleaving 3: both writers rotate (A writes nothing in between) → G0 kept, no overwrite", () => {
    const path = auditPath();
    appendPolicyAudit(dir, ROOM, rec());
    writeFileSync(path, "G0-LINE\n".repeat(Math.ceil(POLICY_AUDIT_MAX_BYTES / 8)));
    const g0Size = statSync(path).size;
    let depth = 0;
    policyAuditTestHooks.afterLstat = () => {
      depth++;
      if (depth === 1) appendPolicyAudit(dir, ROOM, rec({ cardId: "writer-A" }));
    };
    expect(appendPolicyAudit(dir, ROOM, rec({ cardId: "writer-B" }))).toBe(true);
    const gens = listPolicyAuditGenerations(roomDirOf());
    const sizes = gens.map((g) => statSync(join(roomDirOf(), g)).size);
    expect(sizes).toContain(g0Size);
    expect(gens.length).toBeLessThanOrEqual(3);
  });
});

describe("appendPolicyAudit — full write loop (short writes)", () => {
  test("short writes: the whole line lands across several calls", () => {
    const chunks: number[] = [];
    policyAuditTestHooks.write = (fd, buf, off, len) => {
      const n = writeSync(fd, buf, off, Math.min(len, 7));
      chunks.push(n);
      return n;
    };
    expect(appendPolicyAudit(dir, ROOM, rec({ cardId: "chunked" }))).toBe(true);
    expect(chunks.length).toBeGreaterThan(1);
    const raw = readFileSync(auditPath(), "utf8");
    expect(chunks.reduce((a, b) => a + b, 0)).toBe(Buffer.byteLength(raw));
    expect(JSON.parse(raw).cardId).toBe("chunked");
    expect(raw.endsWith("\n")).toBe(true);
  });

  test("a 0-byte write stops the loop: false, one stderr short_write line", () => {
    let calls = 0;
    policyAuditTestHooks.write = (fd, buf, off, len) => {
      calls++;
      return calls === 1 ? writeSync(fd, buf, off, Math.min(len, 5)) : 0;
    };
    expect(appendPolicyAudit(dir, ROOM, rec())).toBe(false);
    expect(calls).toBe(2);
    const text = stderrText();
    expect(text).toContain("audit_write_failed");
    expect(text).toContain("err=short_write");
    expect(text.trim().split("\n").length).toBe(1);
  });

  test("a throwing write stops the loop: false, one stderr short_write line", () => {
    policyAuditTestHooks.write = () => {
      throw Object.assign(new Error("again"), { code: "EAGAIN" });
    };
    expect(appendPolicyAudit(dir, ROOM, rec())).toBe(false);
    const text = stderrText();
    expect(text).toContain("err=short_write");
    expect(text.trim().split("\n").length).toBe(1);
  });
});

describe("appendPolicyAudit — symlinks (O_NOFOLLOW)", () => {
  test("live file is a symlink → false, one stderr line, target untouched", () => {
    const roomDir = join(dir, "rooms", roomKey(ROOM));
    mkdirSync(roomDir, { recursive: true });
    const target = join(dir, "victim.txt");
    writeFileSync(target, "victim\n");
    symlinkSync(target, join(roomDir, POLICY_AUDIT_FILE));
    expect(appendPolicyAudit(dir, ROOM, rec())).toBe(false);
    expect(readFileSync(target, "utf8")).toBe("victim\n");
    const text = stderrText();
    expect(text).toContain("audit_write_failed");
    expect(text.trim().split("\n").length).toBe(1);
  });

  test("symlinked live file over the cap is neither rotated nor followed", () => {
    const roomDir = roomDirOf();
    mkdirSync(roomDir, { recursive: true });
    const target = join(dir, "big-victim.txt");
    writeFileSync(target, "v".repeat(POLICY_AUDIT_MAX_BYTES + 10));
    symlinkSync(target, join(roomDir, POLICY_AUDIT_FILE));
    expect(appendPolicyAudit(dir, ROOM, rec())).toBe(false);
    expect(readdirSync(roomDir)).toEqual([POLICY_AUDIT_FILE]);
    expect(statSync(target).size).toBe(POLICY_AUDIT_MAX_BYTES + 10);
  });

  test("existing live file with loose mode is tightened to 0600 via the fd", () => {
    const path = auditPath();
    appendPolicyAudit(dir, ROOM, rec());
    chmodSync(path, 0o644);
    expect(appendPolicyAudit(dir, ROOM, rec())).toBe(true);
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });
});

describe("appendPolicyAudit — field allowlist and 4 KiB byte cap", () => {
  test("extra keys on the record are dropped (only PolicyAuditRecord fields serialized)", () => {
    const sneaky = { ...rec(), body: "SECRET", args: { notes: "SECRET" } } as PolicyAuditRecord;
    expect(appendPolicyAudit(dir, ROOM, sneaky)).toBe(true);
    const text = readFileSync(auditPath(), "utf8");
    expect(text).not.toContain("SECRET");
    expect(Object.keys(JSON.parse(lines(auditPath())[0])).sort()).toEqual(
      ["agentKind", "cardId", "kind", "peerId", "reason", "roomId", "tool", "ts", "v"].sort(),
    );
  });

  test("line of exactly 4096 bytes including LF is written verbatim", () => {
    const base = JSON.stringify(rec({ cardId: "" }));
    const cardId = "x".repeat(4095 - Buffer.byteLength(base));
    expect(appendPolicyAudit(dir, ROOM, rec({ cardId }))).toBe(true);
    const raw = readFileSync(auditPath());
    expect(raw.length).toBe(4096);
    expect(raw[raw.length - 1]).toBe(0x0a);
    expect(JSON.parse(raw.toString("utf8")).cardId).toBe(cardId);
  });

  test("line of 4097 bytes including LF is shrunk to ≤ 4096 incl LF", () => {
    const base = JSON.stringify(rec({ cardId: "" }));
    const cardId = "x".repeat(4096 - Buffer.byteLength(base));
    expect(appendPolicyAudit(dir, ROOM, rec({ cardId }))).toBe(true);
    const raw = readFileSync(auditPath());
    expect(raw.length).toBeLessThanOrEqual(4096);
    const parsed = JSON.parse(raw.toString("utf8"));
    expect(parsed.cardId.length).toBeLessThan(cardId.length);
    expect(parsed.kind).toBe("refused");
  });

  test('"\\0".repeat(1000) in peerId/roomId/cardId → line ≤ 4096 bytes, valid JSON', () => {
    const nul = "\0".repeat(1000);
    const big = rec({
      peerId: nul,
      roomId: nul,
      cardId: nul,
      convId: nul,
      tool: nul,
      agentKind: nul,
      ts: nul,
    });
    expect(appendPolicyAudit(dir, ROOM, big)).toBe(true);
    const ls = lines(auditPath());
    expect(ls.length).toBe(1);
    expect(Buffer.byteLength(`${ls[0]}\n`, "utf8")).toBeLessThanOrEqual(4096);
    const parsed = JSON.parse(ls[0]);
    expect(parsed.v).toBe(1);
    expect(parsed.kind).toBe("refused");
  });

  test("worst-case escapes in every field never exceed 4096 bytes", () => {
    const esc = "\u0001".repeat(3000);
    const big = rec({
      ts: esc,
      tool: esc,
      peerId: esc,
      roomId: esc,
      agentKind: esc,
      cardId: esc,
      convId: esc,
      reason: esc as never,
      mode: esc as never,
    });
    expect(appendPolicyAudit(dir, ROOM, big)).toBe(true);
    const ls = lines(auditPath());
    expect(Buffer.byteLength(`${ls[0]}\n`, "utf8")).toBeLessThanOrEqual(4096);
    expect(() => JSON.parse(ls[0])).not.toThrow();
  });
});

describe("appendPolicyAudit — failure never propagates (D8)", () => {
  test("unwritable state dir → false, no throw, one stderr audit_write_failed line", () => {
    const notADir = join(dir, "file-not-dir");
    writeFileSync(notADir, "x");
    let out: boolean | undefined;
    expect(() => {
      out = appendPolicyAudit(notADir, ROOM, rec());
    }).not.toThrow();
    expect(out).toBe(false);
    const text = stderrText();
    expect(text).toContain("audit_write_failed");
    expect(text.trim().split("\n").length).toBe(1);
  });

  test("rename failure → record skipped, false, stderr audit_write_failed, live file untouched", () => {
    const path = auditPath();
    appendPolicyAudit(dir, ROOM, rec());
    writeFileSync(path, "a".repeat(POLICY_AUDIT_MAX_BYTES));
    // A non-empty directory at the generation name makes rename(path, gen) fail.
    const gen = policyAuditGenerationName(new Date(), 1, "blockd");
    mkdirSync(join(roomDirOf(), gen));
    writeFileSync(join(roomDirOf(), gen, "keep"), "k");
    policyAuditTestHooks.generationName = () => gen;
    try {
      expect(appendPolicyAudit(dir, ROOM, rec({ cardId: "skipped" }))).toBe(false);
    } finally {
      policyAuditTestHooks.generationName = undefined;
    }
    expect(stderrText()).toContain("audit_write_failed");
    expect(readFileSync(path, "utf8")).not.toContain("skipped");
    expect(statSync(path).size).toBe(POLICY_AUDIT_MAX_BYTES);
  });

  test("empty roomId → stderr only, false, no file", () => {
    expect(appendPolicyAudit(dir, "", rec({ roomId: "" }))).toBe(false);
    expect(stderrText()).toContain("audit_write_failed");
    expect(existsSync(join(dir, "rooms"))).toBe(false);
  });

  test("stderr line carries no record values", () => {
    const notADir = join(dir, "file-not-dir");
    writeFileSync(notADir, "x");
    appendPolicyAudit(notADir, ROOM, rec({ cardId: "CARD-SECRET-ID", peerId: "PEER-SECRET" }));
    expect(stderrText()).not.toContain("CARD-SECRET-ID");
    expect(stderrText()).not.toContain("PEER-SECRET");
  });

  test("decision is unchanged by an audit failure (evaluate → append fails → same decision)", () => {
    const reg: ToolRegistry = {
      has: () => true,
      validate: (_n, args) => ({ ok: true, args: args as Record<string, unknown> }),
    };
    const ctx = { peerId: "p", roomId: ROOM, agentKind: "claude", now: "2026-10-16T00:00:00.000Z" };
    const gate = resolveLoomToolsGate(null);
    const d = evaluateMcpCall(gate, reg, "update_task", { id: "t1", status: "done" }, ctx);
    const snapshot = JSON.stringify(d);
    const notADir = join(dir, "file-not-dir");
    writeFileSync(notADir, "x");
    if (d.audit) expect(appendPolicyAudit(notADir, ROOM, d.audit)).toBe(false);
    expect(JSON.stringify(d)).toBe(snapshot);
    expect(d.ok).toBe(true);
  });
});

describe("audit file never holds arg values (Done-when (d))", () => {
  test("title/body/notes values from refused and allowed calls never reach the file", () => {
    const SECRET = "SECRET-NOTE-qq7";
    const reg: ToolRegistry = {
      has: () => true,
      validate: (_n, args) => ({ ok: true, args: args as Record<string, unknown> }),
    };
    const ctx = { peerId: "p", roomId: ROOM, agentKind: "codex", now: "2026-10-16T00:00:00.000Z" };
    const propose = resolveLoomToolsGate({
      version: 1,
      shell: { deny: [] },
      network: false,
      mcp: { deny: [], isolate: true },
      loomTools: { done: "propose", denyModes: ["broadcast"] },
    } as never);
    const allow = resolveLoomToolsGate(null);
    const decisions = [
      evaluateMcpCall(
        propose,
        reg,
        "update_task",
        { id: "t1", status: "done", title: SECRET, notes: SECRET },
        ctx,
      ),
      evaluateMcpCall(
        allow,
        reg,
        "add_task",
        { title: SECRET, notes: SECRET, status: "done" },
        ctx,
      ),
      evaluateMcpCall(propose, reg, "handoff", { to: "*", body: SECRET }, ctx),
      evaluateMcpCall(
        allow,
        reg,
        "import_board",
        { snapshot: { tasks: [{ id: "t2", title: SECRET, notes: SECRET, status: "done" }] } },
        ctx,
      ),
    ];
    let written = 0;
    for (const d of decisions) {
      if (d.audit && appendPolicyAudit(dir, ROOM, d.audit)) written++;
    }
    expect(written).toBe(4);
    const text = readFileSync(auditPath(), "utf8");
    expect(text).not.toContain(SECRET);
    for (const l of lines(auditPath())) expect(() => JSON.parse(l)).not.toThrow();
  });
});
