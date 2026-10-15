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
  POLICY_AUDIT_PRUNE_GRACE_MS,
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

/**
 * Injected audit clock one hour ahead of the real one (whole seconds). Every file a
 * test creates gets a real ctime ≈ the real now, which the prune grace (max(mtime,
 * ctime, rotation time), round 7) would otherwise treat as "just touched".
 */
function clockAhead(): number {
  return Math.floor(Date.now() / 1000) * 1000 + 3_600_000;
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
  policyAuditTestHooks.now = undefined;
  policyAuditTestHooks.beforePrune = undefined;
  policyAuditTestHooks.ctimeMs = undefined;
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

  test("prune: old (> 60 s) generations beyond the newest 3 by NAME are pruned (≤ 4 MiB when idle)", () => {
    const NOW = clockAhead();
    policyAuditTestHooks.now = () => NOW;
    const roomDir = roomDirOf();
    mkdirSync(roomDir, { recursive: true });
    const old = [1, 2, 3, 4, 5].map((m) =>
      policyAuditGenerationName(new Date(`2025-0${m}-01T00:00:00.000Z`), 9, "oooooo"),
    );
    old.forEach((n, i) => {
      writeFileSync(join(roomDir, n), "old\n");
      const t = new Date(NOW - (120 - i) * 1000);
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
    expect(POLICY_AUDIT_PRUNE_GRACE_MS).toBe(60_000);
  });

  test("prune: a generation beyond the newest 3 by name with a recent mtime is NOT pruned (grace)", () => {
    const NOW = clockAhead();
    policyAuditTestHooks.now = () => NOW;
    const roomDir = roomDirOf();
    mkdirSync(roomDir, { recursive: true });
    const old = [1, 2, 3, 4, 5].map((m) =>
      policyAuditGenerationName(new Date(`2025-0${m}-01T00:00:00.000Z`), 9, "rrrrrr"),
    );
    // old[0]: written 10 s ago; old[1]: exactly 60 s ago (not older than grace);
    // old[2]: 61 s ago (pruned); old[3], old[4]: newest by name (kept regardless).
    const ages = [10, 60, 61, 300, 300];
    old.forEach((n, i) => {
      writeFileSync(join(roomDir, n), `gen${i}\n`);
      const t = new Date(NOW - ages[i] * 1000);
      utimesSync(join(roomDir, n), t, t);
    });
    writeFileSync(join(roomDir, POLICY_AUDIT_FILE), "a".repeat(POLICY_AUDIT_MAX_BYTES));
    expect(appendPolicyAudit(dir, ROOM, rec())).toBe(true);
    const left = readdirSync(roomDir);
    expect(left).toContain(old[0]);
    expect(left).toContain(old[1]);
    expect(left).not.toContain(old[2]);
    expect(left).toContain(old[3]);
    expect(left).toContain(old[4]);
  });

  test("prune: the newest 3 by name are kept even when their mtimes are old", () => {
    const NOW = clockAhead();
    policyAuditTestHooks.now = () => NOW;
    const roomDir = roomDirOf();
    mkdirSync(roomDir, { recursive: true });
    const names = [1, 2].map((m) =>
      policyAuditGenerationName(new Date(`2025-0${m}-01T00:00:00.000Z`), 9, "kkkkkk"),
    );
    for (const n of names) {
      writeFileSync(join(roomDir, n), "k\n");
      const t = new Date(NOW - 3_600_000);
      utimesSync(join(roomDir, n), t, t);
    }
    writeFileSync(join(roomDir, POLICY_AUDIT_FILE), "a".repeat(POLICY_AUDIT_MAX_BYTES));
    const t = new Date(NOW - 3_600_000);
    utimesSync(join(roomDir, POLICY_AUDIT_FILE), t, t);
    expect(appendPolicyAudit(dir, ROOM, rec())).toBe(true);
    expect(listPolicyAuditGenerations(roomDir).length).toBe(4);
  });

  test("M2 interleaving: A allocates t0 and pauses, B rotates 3×, A renames with t0 → nothing lost", () => {
    const NOW = clockAhead();
    policyAuditTestHooks.now = () => NOW;
    const roomDir = roomDirOf();
    const path = auditPath();
    appendPolicyAudit(dir, ROOM, rec());
    writeFileSync(path, "G0-LINE\n".repeat(Math.ceil(POLICY_AUDIT_MAX_BYTES / 8)));
    const g0Time = new Date(NOW - 100_000);
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
          const t = new Date(NOW - (60 - i) * 1000);
          utimesSync(path, t, t);
        }
        expect(appendPolicyAudit(dir, ROOM, rec({ cardId: `B${i}` }))).toBe(true);
      }
    };
    expect(appendPolicyAudit(dir, ROOM, rec({ cardId: "A" }))).toBe(true);
    expect(paused).toBe(true);
    expect(readdirSync(roomDir)).toContain(t0);
    expect(readFileSync(join(roomDir, t0), "utf8")).toContain('"B3"');
    const all = listPolicyAuditGenerations(roomDir)
      .map((n) => readFileSync(join(roomDir, n), "utf8"))
      .join("");
    expect(all).toContain("G0-LINE");
    for (const id of ["B1", "B2", "B3", "A"]) expect(all).toContain(`"${id}"`);
    expect(lines(path).map((l) => JSON.parse(l).cardId)).toEqual(["A"]);
  });

  test("round 4: the generation this call just rotated survives even with the oldest mtime; a paused writer's record stays reachable", () => {
    const NOW = clockAhead();
    policyAuditTestHooks.now = () => NOW;
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
      const t = new Date(NOW - (10 - i) * 1000); // newer than L, inside the grace
      utimesSync(join(roomDir, n), t, t);
    });
    const path = auditPath();
    writeFileSync(path, "L-LINE\n".repeat(Math.ceil(POLICY_AUDIT_MAX_BYTES / 7)));
    const lTime = new Date(NOW - 100_000); // rename keeps L's old mtime
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
    const dText = readFileSync(join(roomDir, d[0]), "utf8");
    expect(dText).toContain("L-LINE");
    expect(dText).toContain('"W"');
    // others[0] is beyond the newest 3 by name but written within the grace → kept.
    for (const o of others) expect(rotated).toContain(o);
  });

  test("round 5 (codex): R1 rotates and pauses before pruning; 256+ appends; R2 rotates + prunes; R1 resumes → no record lost", () => {
    const NOW = clockAhead();
    policyAuditTestHooks.now = () => NOW;
    const roomDir = roomDirOf();
    mkdirSync(roomDir, { recursive: true });
    // C: an older generation (name-wise), written long ago.
    const c = policyAuditGenerationName(new Date("2025-01-01T00:00:00.000Z"), 9, "cccccc");
    writeFileSync(join(roomDir, c), "C-LINE\n");
    const cTime = new Date(NOW - 3_600_000);
    utimesSync(join(roomDir, c), cTime, cTime);
    // A, B: recently written generations (newer mtimes than C and L).
    for (const [m, r] of [
      ["02", "aaaaaa"],
      ["03", "bbbbbb"],
    ] as const) {
      const n = policyAuditGenerationName(new Date(`2025-${m}-01T00:00:00.000Z`), 9, r);
      writeFileSync(join(roomDir, n), `${r}\n`);
      const t = new Date(NOW - 5_000);
      utimesSync(join(roomDir, n), t, t);
    }
    const path = auditPath();
    writeFileSync(path, "L-LINE\n".repeat(Math.ceil(POLICY_AUDIT_MAX_BYTES / 7)));
    const lTime = new Date(NOW - 3_600_000);
    utimesSync(path, lTime, lTime);

    const base = Buffer.byteLength(`${JSON.stringify(rec({ cardId: "w000:" }))}\n`);
    const pad = "p".repeat(4090 - base);
    const total = Math.ceil(POLICY_AUDIT_MAX_BYTES / 4090) + 4;
    let paused = false;
    let rotationsDuringPause = 0;
    policyAuditTestHooks.generationName = () => {
      if (paused) rotationsDuringPause++;
      return undefined;
    };
    policyAuditTestHooks.beforePrune = () => {
      if (paused) return;
      paused = true; // R1 renamed live → D1; ordinary writers fill the new live, R2 rotates.
      for (let i = 0; i < total; i++) {
        const id = `w${String(i).padStart(3, "0")}:`;
        expect(appendPolicyAudit(dir, ROOM, rec({ cardId: `${id}${pad}` }))).toBe(true);
      }
    };
    expect(appendPolicyAudit(dir, ROOM, rec({ cardId: "R1" }))).toBe(true);
    expect(paused).toBe(true);
    expect(rotationsDuringPause).toBeGreaterThanOrEqual(1);
    const all = listPolicyAuditGenerations(roomDir)
      .map((n) => readFileSync(join(roomDir, n), "utf8"))
      .join("");
    for (let i = 0; i < total; i++) {
      expect(all).toContain(`"w${String(i).padStart(3, "0")}:`);
    }
    expect(all).toContain('"R1"');
    expect(all).toContain("L-LINE"); // D1 (just rotated by R1) kept
  });

  test("round 6 (codex): live idle 120 s, W opens, four quick rotations, W writes → no record lost", () => {
    const NOW = clockAhead();
    let clock = NOW;
    policyAuditTestHooks.now = () => clock;
    const roomDir = roomDirOf();
    const path = auditPath();
    appendPolicyAudit(dir, ROOM, rec());
    writeFileSync(path, "L-LINE\n".repeat(Math.ceil(POLICY_AUDIT_MAX_BYTES / 7)));
    const idle = new Date(NOW - 120_000);
    utimesSync(path, idle, idle);
    const wFd = openSync(path, "a"); // W opens L just before the rotations, then pauses
    try {
      for (let r = 1; r <= 4; r++) {
        if (r > 1) appendFileSync(path, "F\n".repeat(Math.ceil(POLICY_AUDIT_MAX_BYTES / 2)));
        expect(appendPolicyAudit(dir, ROOM, rec({ cardId: `R${r}` }))).toBe(true);
        clock += 1_000;
      }
      writeSync(wFd, `${JSON.stringify(rec({ cardId: "W" }))}\n`);
    } finally {
      closeSync(wFd);
    }
    const all = listPolicyAuditGenerations(roomDir)
      .map((n) => readFileSync(join(roomDir, n), "utf8"))
      .join("");
    expect(all.includes("L-LINE")).toBe(true);
    for (const id of ["R1", "R2", "R3", "R4", "W"]) {
      expect({ id, present: all.includes(`"${id}"`) }).toEqual({ id, present: true });
    }
  });

  test("round 6: old mtime but a recent rotation name → kept", () => {
    const NOW = clockAhead();
    policyAuditTestHooks.now = () => NOW;
    const roomDir = roomDirOf();
    mkdirSync(roomDir, { recursive: true });
    const recent = policyAuditGenerationName(new Date(NOW - 10_000), 9, "rrrrrr");
    const newer = [3, 2, 1].map((s) =>
      policyAuditGenerationName(new Date(NOW - s * 1000), 9, "nnnnnn"),
    );
    for (const n of [recent, ...newer]) {
      writeFileSync(join(roomDir, n), "x\n");
      const t = new Date(NOW - 3_600_000);
      utimesSync(join(roomDir, n), t, t);
    }
    writeFileSync(join(roomDir, POLICY_AUDIT_FILE), "a".repeat(POLICY_AUDIT_MAX_BYTES));
    expect(appendPolicyAudit(dir, ROOM, rec())).toBe(true);
    expect(readdirSync(roomDir)).toContain(recent);
  });

  test("round 6: old mtime and an old rotation name → pruned", () => {
    const NOW = clockAhead();
    policyAuditTestHooks.now = () => NOW;
    const roomDir = roomDirOf();
    mkdirSync(roomDir, { recursive: true });
    const old = policyAuditGenerationName(new Date(NOW - 120_000), 9, "oooooo");
    const newer = [3, 2, 1].map((s) =>
      policyAuditGenerationName(new Date(NOW - s * 1000), 9, "nnnnnn"),
    );
    for (const n of [old, ...newer]) {
      writeFileSync(join(roomDir, n), "x\n");
      const t = new Date(NOW - 3_600_000);
      utimesSync(join(roomDir, n), t, t);
    }
    writeFileSync(join(roomDir, POLICY_AUDIT_FILE), "a".repeat(POLICY_AUDIT_MAX_BYTES));
    expect(appendPolicyAudit(dir, ROOM, rec())).toBe(true);
    expect(readdirSync(roomDir)).not.toContain(old);
  });

  test("round 6: a generation-shaped name whose timestamp does not parse is never pruned", () => {
    const NOW = clockAhead();
    policyAuditTestHooks.now = () => NOW;
    const roomDir = roomDirOf();
    mkdirSync(roomDir, { recursive: true });
    const bad = [
      "policy-audit.20250099T250000000Z-0000000009-uuuuuu.jsonl", // month 00, day 99, hour 25
      "policy-audit.20250230T000000000Z-0000000009-vvvvvv.jsonl", // Feb 30
      "policy-audit.20250101T006000000Z-0000000009-wwwwww.jsonl", // minute 60
    ];
    const older = policyAuditGenerationName(new Date("2025-01-02T00:00:00.000Z"), 9, "pppppp");
    for (const n of [...bad, older]) {
      writeFileSync(join(roomDir, n), "x\n");
      const t = new Date(NOW - 3_600_000);
      utimesSync(join(roomDir, n), t, t);
    }
    // Newer names so the bad ones are beyond the newest 3 by name.
    for (const s of [3, 2, 1]) {
      const n = policyAuditGenerationName(new Date(NOW - s * 1000), 9, "nnnnnn");
      writeFileSync(join(roomDir, n), "x\n");
    }
    writeFileSync(join(roomDir, POLICY_AUDIT_FILE), "a".repeat(POLICY_AUDIT_MAX_BYTES));
    expect(appendPolicyAudit(dir, ROOM, rec())).toBe(true);
    const left = readdirSync(roomDir);
    for (const n of bad) expect(left).toContain(n);
    expect(left).not.toContain(older); // a parseable old one in the same position is pruned
  });

  test("round 7 (codex): R names at t, pauses 59 s, renames; W opens at 58 s, writes at 62 s; 3 more rotations → no record lost", () => {
    const NOW = clockAhead();
    let clock = NOW;
    policyAuditTestHooks.now = () => clock;
    const roomDir = roomDirOf();
    const path = auditPath();
    appendPolicyAudit(dir, ROOM, rec());
    writeFileSync(path, "L-LINE\n".repeat(Math.ceil(POLICY_AUDIT_MAX_BYTES / 7)));
    const idle = new Date(NOW - 120_000);
    utimesSync(path, idle, idle);
    // The fs cannot move ctime onto the injected clock, so the prune reads ctime
    // through the ctimeMs seam: the first generation's ctime = its rename time.
    let gen1 = "";
    let renameAt = 0;
    policyAuditTestHooks.ctimeMs = (file) => (file.endsWith(gen1) && gen1 ? renameAt : undefined);
    let wFd = -1;
    let fired = false;
    policyAuditTestHooks.beforeRename = () => {
      if (fired) return;
      fired = true; // R has allocated its name at NOW
      clock = NOW + 58_000;
      wFd = openSync(path, "a"); // W opens L at 58 s
      clock = NOW + 59_000;
      renameAt = clock; // R renames at 59 s
    };
    try {
      expect(appendPolicyAudit(dir, ROOM, rec({ cardId: "R" }))).toBe(true);
      gen1 = listPolicyAuditGenerations(roomDir).filter((n) => n !== POLICY_AUDIT_FILE)[0];
      expect(gen1).toBeTruthy();
      clock = NOW + 61_000; // three more rotations: gen1 is beyond the newest 3 by name
      for (let r = 2; r <= 4; r++) {
        appendFileSync(path, "F\n".repeat(Math.ceil(POLICY_AUDIT_MAX_BYTES / 2)));
        expect(appendPolicyAudit(dir, ROOM, rec({ cardId: `R${r}` }))).toBe(true);
      }
      clock = NOW + 62_000;
      writeSync(wFd, `${JSON.stringify(rec({ cardId: "W" }))}\n`); // W writes at 62 s
    } finally {
      if (wFd >= 0) closeSync(wFd);
    }
    expect(readdirSync(roomDir)).toContain(gen1);
    const g1 = readFileSync(join(roomDir, gen1), "utf8");
    expect(g1.includes("L-LINE")).toBe(true);
    expect(g1.includes('"W"')).toBe(true);
  });

  test("round 7: old mtime + old name but a recent real ctime (just renamed) → kept", () => {
    const roomDir = roomDirOf();
    mkdirSync(roomDir, { recursive: true });
    const real = Date.now();
    const old = policyAuditGenerationName(new Date(real - 120_000), 9, "cccccc");
    const newer = [3, 2, 1].map((s) =>
      policyAuditGenerationName(new Date(real - s * 1000), 9, "nnnnnn"),
    );
    for (const n of [old, ...newer]) {
      writeFileSync(join(roomDir, n), "x\n");
      const t = new Date(real - 3_600_000);
      utimesSync(join(roomDir, n), t, t); // mtime old; utimes itself sets ctime = now
    }
    writeFileSync(join(roomDir, POLICY_AUDIT_FILE), "a".repeat(POLICY_AUDIT_MAX_BYTES));
    expect(appendPolicyAudit(dir, ROOM, rec())).toBe(true);
    expect(readdirSync(roomDir)).toContain(old);
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
