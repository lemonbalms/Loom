/**
 * PLAN 0.32.0 P2 — Done-when (d) / D8. Per-room local policy audit file
 * `<loomDir>/rooms/<roomKey(roomId)>/policy-audit.jsonl`: modes, line format,
 * 1 MiB rotation to `.1`, failure non-propagation, no arg values, and no
 * contact with the relay event log.
 */
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendPolicyAudit,
  evaluateMcpCall,
  POLICY_AUDIT_FILE,
  POLICY_AUDIT_MAX_BYTES,
  type PolicyAuditRecord,
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
    expect(Buffer.byteLength(ls[0], "utf8")).toBeLessThanOrEqual(4096);
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

describe("appendPolicyAudit — rotation (UK-3: 1 MiB, one generation)", () => {
  test("file ≥ 1 MiB → renamed to .1 before the append; new file holds only the new record", () => {
    const path = auditPath();
    appendPolicyAudit(dir, ROOM, rec());
    const filler = `${JSON.stringify({ filler: "z".repeat(1000) })}\n`;
    writeFileSync(path, filler.repeat(Math.ceil(POLICY_AUDIT_MAX_BYTES / filler.length)));
    const bigSize = statSync(path).size;
    expect(bigSize).toBeGreaterThanOrEqual(POLICY_AUDIT_MAX_BYTES);

    expect(appendPolicyAudit(dir, ROOM, rec({ cardId: "after" }))).toBe(true);
    expect(statSync(`${path}.1`).size).toBe(bigSize); // moved whole — no truncation
    const ls = lines(path);
    expect(ls.length).toBe(1);
    expect(JSON.parse(ls[0]).cardId).toBe("after");
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  test("an older .1 is replaced (one generation only)", () => {
    const path = auditPath();
    appendPolicyAudit(dir, ROOM, rec());
    writeFileSync(`${path}.1`, "OLD-GENERATION\n");
    writeFileSync(path, "a".repeat(POLICY_AUDIT_MAX_BYTES));
    appendPolicyAudit(dir, ROOM, rec());
    expect(readFileSync(`${path}.1`, "utf8")).not.toContain("OLD-GENERATION");
    expect(statSync(`${path}.1`).size).toBe(POLICY_AUDIT_MAX_BYTES);
    expect(readdirSync(join(dir, "rooms", roomKey(ROOM))).sort()).toEqual([
      POLICY_AUDIT_FILE,
      `${POLICY_AUDIT_FILE}.1`,
    ]);
  });

  test("size + line ≤ cap → no rotation (exactly reaching the cap is fine)", () => {
    const path = auditPath();
    const line = `${JSON.stringify(rec())}\n`;
    appendPolicyAudit(dir, ROOM, rec());
    writeFileSync(path, "a".repeat(POLICY_AUDIT_MAX_BYTES - Buffer.byteLength(line)));
    expect(appendPolicyAudit(dir, ROOM, rec())).toBe(true);
    expect(existsSync(`${path}.1`)).toBe(false);
    expect(statSync(path).size).toBe(POLICY_AUDIT_MAX_BYTES);
  });

  test("size + line > cap → rotate BEFORE the write; the live file never exceeds the cap", () => {
    const path = auditPath();
    const line = `${JSON.stringify(rec())}\n`;
    appendPolicyAudit(dir, ROOM, rec());
    const before = POLICY_AUDIT_MAX_BYTES - Buffer.byteLength(line) + 1;
    writeFileSync(path, "a".repeat(before));
    expect(appendPolicyAudit(dir, ROOM, rec())).toBe(true);
    expect(statSync(`${path}.1`).size).toBe(before);
    expect(statSync(path).size).toBe(Buffer.byteLength(line));
  });

  test("many appends from empty: the live file stays ≤ cap and the lock is released", () => {
    const path = auditPath();
    appendPolicyAudit(dir, ROOM, rec());
    writeFileSync(path, "a".repeat(POLICY_AUDIT_MAX_BYTES - 10));
    for (let i = 0; i < 5; i++) {
      expect(appendPolicyAudit(dir, ROOM, rec({ cardId: `c${i}` }))).toBe(true);
      expect(statSync(path).size).toBeLessThanOrEqual(POLICY_AUDIT_MAX_BYTES);
    }
    expect(existsSync(`${path}.lock`)).toBe(false);
  });
});

describe("appendPolicyAudit — rotation lock (concurrent writers)", () => {
  afterEach(() => {
    policyAuditTestHooks.afterSizeCheck = undefined;
  });

  test("interleaved rotation: the old generation survives (B must not rename A's new live file)", () => {
    const path = auditPath();
    appendPolicyAudit(dir, ROOM, rec());
    writeFileSync(path, "OLD-GENERATION\n".repeat(Math.ceil(POLICY_AUDIT_MAX_BYTES / 15)));
    const oldSize = statSync(path).size;
    let fired = false;
    // B has opened the live file and seen it over the cap; before B rotates,
    // writer A runs to completion (rotates + writes its record).
    policyAuditTestHooks.afterSizeCheck = () => {
      if (fired) return;
      fired = true;
      expect(appendPolicyAudit(dir, ROOM, rec({ cardId: "writer-A" }))).toBe(true);
    };
    expect(appendPolicyAudit(dir, ROOM, rec({ cardId: "writer-B" }))).toBe(true);
    expect(fired).toBe(true);
    const gen1 = readFileSync(`${path}.1`, "utf8");
    expect(gen1).toContain("OLD-GENERATION");
    expect(statSync(`${path}.1`).size).toBe(oldSize);
    const live = lines(path).map((l) => JSON.parse(l).cardId);
    expect(live).toEqual(["writer-A", "writer-B"]);
    expect(existsSync(`${path}.lock`)).toBe(false);
  });

  test("lock held by another writer → rotation skipped, record still appended, lock kept", () => {
    const path = auditPath();
    appendPolicyAudit(dir, ROOM, rec());
    writeFileSync(path, "a".repeat(POLICY_AUDIT_MAX_BYTES));
    writeFileSync(`${path}.lock`, "other");
    expect(appendPolicyAudit(dir, ROOM, rec({ cardId: "over" }))).toBe(true);
    expect(existsSync(`${path}.1`)).toBe(false);
    expect(readFileSync(path, "utf8")).toContain('"over"');
    expect(readFileSync(`${path}.lock`, "utf8")).toBe("other");
  });

  test("stale lock (> 10 s) is removed and rotation proceeds; lock released after", () => {
    const path = auditPath();
    appendPolicyAudit(dir, ROOM, rec());
    writeFileSync(path, "a".repeat(POLICY_AUDIT_MAX_BYTES));
    writeFileSync(`${path}.lock`, "stale");
    const old = new Date(Date.now() - 20_000);
    utimesSync(`${path}.lock`, old, old);
    expect(appendPolicyAudit(dir, ROOM, rec())).toBe(true);
    expect(statSync(`${path}.1`).size).toBe(POLICY_AUDIT_MAX_BYTES);
    expect(existsSync(`${path}.lock`)).toBe(false);
  });

  test("lock is released even when the rename fails", () => {
    const path = auditPath();
    appendPolicyAudit(dir, ROOM, rec());
    writeFileSync(path, "a".repeat(POLICY_AUDIT_MAX_BYTES));
    mkdirSync(`${path}.1`);
    writeFileSync(join(`${path}.1`, "keep"), "k");
    expect(appendPolicyAudit(dir, ROOM, rec())).toBe(false);
    expect(existsSync(`${path}.lock`)).toBe(false);
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
    expect(Buffer.byteLength(ls[0], "utf8")).toBeLessThanOrEqual(4096);
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
    expect(Buffer.byteLength(ls[0], "utf8")).toBeLessThanOrEqual(4096);
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
    // A non-empty directory at `.1` makes rename(path, path.1) fail.
    mkdirSync(`${path}.1`);
    writeFileSync(join(`${path}.1`, "keep"), "k");
    expect(appendPolicyAudit(dir, ROOM, rec({ cardId: "skipped" }))).toBe(false);
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
