/**
 * PLAN 0.35.0 P4 — doctor Memory section (D7 · ③ table · R14 · R53-M1).
 * Done-when (h): rows top-to-bottom per ③ with ok/warn/info · `memory/` absent → one info row
 * and the remaining memory rows omitted · never `fail` · `doctorExitCode` unchanged · the
 * read-only gatherer takes no lock and writes nothing · scan caps (agent stores 64 · rooms 4096).
 * Run with HOME and LOOM_TEST_HOME both pointing at a temp dir (R16).
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import {
  type DoctorSection,
  doctorExitCode,
  type MemoryDoctorAgent,
  type MemoryDoctorInput,
  memorySection,
  summarizeDoctor,
} from "./doctor";
import { readMemoryDoctorInput } from "./memory-cli";

const ID = (n: number) => `mem_${n.toString(16).padStart(16, "0")}`;
const RK = "0123456789abcdef";

const zeros = {
  active: 0,
  proposed: 0,
  retired: 0,
  unparseable: 0,
  conflicts: 0,
  dangling: 0,
  archivedRefs: 0,
};

function agent(over: Partial<MemoryDoctorAgent> = {}): MemoryDoctorAgent {
  return {
    agentKey: "claude.default",
    dir: "dir",
    entries: { state: "file", bytes: 2048, mode: 0o600 },
    fold: { ...zeros, active: 3, proposed: 1, retired: 2 },
    archive: { state: "absent" },
    persona: { state: "absent" },
    ...over,
  };
}

function input(over: Partial<MemoryDoctorInput> = {}): MemoryDoctorInput {
  return {
    platform: "darwin",
    memoryDir: "/h/.loom/memory",
    root: { state: "dir", mode: 0o700 },
    agents: [agent()],
    ignored: [],
    agentScanCapped: false,
    knowledgeIndexPath: "/h/.loom/knowledge/INDEX.md",
    knowledgeIndex: { state: "file", bytes: 100, mode: 0o600 },
    rooms: { state: "dir", guidelines: [], scanCapped: false },
    rules: {
      bundled: 1,
      user: 0,
      overrides: 0,
      disabled: 0,
      invalid: 0,
      conflicts: [],
      truncated: [],
      scanCapped: false,
    },
    ...over,
  };
}

const rows = (s: DoctorSection) => s.lines.map((l) => `${l.status} ${l.message}`);

function noFail(s: DoctorSection): void {
  expect(s.lines.some((l) => l.status === "fail")).toBe(false);
  expect(summarizeDoctor([s]).fail).toBe(0);
  expect(doctorExitCode([s])).toBe(0);
}

describe("memorySection — ③ rows (pure)", () => {
  test("healthy store → ok rows in ③ order, title Memory", () => {
    const s = memorySection(input());
    expect(s.title).toBe("Memory");
    expect(rows(s)).toEqual([
      "ok memory/ 0700 · 1 agent stores (/h/.loom/memory)",
      "ok claude.default: active 3/200 · proposed 1 · retired 2 · 2 KiB/1024 KiB",
      "info persona.md: 0 of 1 agent stores",
      "ok knowledge/INDEX.md: 100/8192 B (/h/.loom/knowledge/INDEX.md)",
      "info guideline.md: 0 rooms",
      "ok rules: bundled 1 · user 0 · overrides 0",
    ]);
    noFail(s);
  });

  test("memory/ absent → info `no memory yet`, agent/persona rows omitted, other rows kept", () => {
    const s = memorySection(
      input({ root: { state: "absent" }, agents: [], knowledgeIndex: { state: "absent" } }),
    );
    expect(rows(s)).toEqual([
      "info no memory yet (/h/.loom/memory)",
      "info knowledge/INDEX.md: absent (/h/.loom/knowledge/INDEX.md)",
      "info guideline.md: 0 rooms",
      "ok rules: bundled 1 · user 0 · overrides 0",
    ]);
    noFail(s);
  });

  test("memory/ symlink / wrong mode → warn", () => {
    const a = memorySection(input({ root: { state: "unsafe" }, agents: [] }));
    expect(rows(a)[0]).toBe("warn memory/ is a symlink or not a directory (/h/.loom/memory)");
    expect(rows(a).some((r) => r.includes("claude.default"))).toBe(false);
    noFail(a);
    const b = memorySection(input({ root: { state: "dir", mode: 0o755 } }));
    expect(rows(b)[0]).toBe(
      "warn memory/ mode 0755 (expected 0700) · 1 agent stores (/h/.loom/memory)",
    );
    noFail(b);
  });

  test("agent warns: > 1 MiB · > 200 active · mode ≠ 0600 · counters (one row)", () => {
    const s = memorySection(
      input({
        agents: [
          agent({
            entries: { state: "file", bytes: 1024 * 1024 + 1, mode: 0o644 },
            archive: { state: "file", bytes: 10, mode: 0o644 },
            fold: { ...zeros, active: 201, unparseable: 2, conflicts: 1, dangling: 3 },
          }),
        ],
      }),
    );
    expect(rows(s)[1]).toBe(
      "warn claude.default: active 201/200 · proposed 0 · retired 0 · 1025 KiB/1024 KiB — writes refused until loom memory compact; active over the cap (approved past 200); entries.jsonl mode 0644 (expected 0600); entries.archive.jsonl mode 0644 (expected 0600); unparseable 2 · conflicts 1 · dangling 3",
    );
    noFail(s);
  });

  test("exactly 1 MiB and 200 active are not warnings", () => {
    const s = memorySection(
      input({
        agents: [
          agent({
            entries: { state: "file", bytes: 1024 * 1024, mode: 0o600 },
            fold: { ...zeros, active: 200 },
          }),
        ],
      }),
    );
    expect(rows(s)[1]).toBe(
      "ok claude.default: active 200/200 · proposed 0 · retired 0 · 1024 KiB/1024 KiB",
    );
  });

  test("archivedRefs → info (R53-M1, not dangling); ignored entries · scan cap → info", () => {
    const s = memorySection(
      input({
        agents: [agent({ fold: { ...zeros, active: 1, archivedRefs: 2 } })],
        ignored: ["notes", "Claude.Default"],
        agentScanCapped: true,
      }),
    );
    expect(rows(s).slice(0, 6)).toEqual([
      "ok memory/ 0700 · 1 agent stores (/h/.loom/memory)",
      "ok claude.default: active 1/200 · proposed 0 · retired 0 · 2 KiB/1024 KiB",
      "info claude.default: 2 supersedes point into the archive",
      "info ignored entry notes",
      "info ignored entry Claude.Default",
      "info scan capped at 64 agent stores",
    ]);
    noFail(s);
  });

  test("absent entries.jsonl → ok zeros; unsafe dir / file; not scanned (over 4 MiB)", () => {
    const s = memorySection(
      input({
        agents: [
          agent({ agentKey: "claude.a", entries: { state: "absent" }, fold: { ...zeros } }),
          agent({ agentKey: "codex.a", dir: "unsafe", entries: { state: "absent" }, fold: null }),
          agent({ agentKey: "grok.a", entries: { state: "unsafe" }, fold: null }),
          agent({
            agentKey: "grok.b",
            entries: { state: "file", bytes: 5 * 1024 * 1024, mode: 0o600 },
            fold: null,
          }),
        ],
      }),
    );
    expect(rows(s).slice(1, 5)).toEqual([
      "ok claude.a: active 0/200 · proposed 0 · retired 0 · 0 KiB/1024 KiB",
      "warn codex.a: store directory is a symlink or not a directory",
      "warn grok.a: entries.jsonl is a symlink or not a regular file",
      "warn grok.b: 5120 KiB/1024 KiB (not scanned: over 4096 KiB) — writes refused until loom memory compact",
    ]);
    noFail(s);
  });

  test("persona: > 8192 warn · symlink warn · mode info · count info", () => {
    const s = memorySection(
      input({
        agents: [
          agent({ agentKey: "claude.a", persona: { state: "file", bytes: 9000, mode: 0o600 } }),
          agent({ agentKey: "codex.a", persona: { state: "unsafe" } }),
          agent({ agentKey: "grok.a", persona: { state: "file", bytes: 10, mode: 0o644 } }),
        ],
      }),
    );
    const r = rows(s);
    expect(r).toContain("warn claude.a/persona.md is 9000 B (max 8192 B) — truncated on read");
    expect(r).toContain("warn codex.a/persona.md is a symlink or not a regular file");
    expect(r).toContain("info grok.a/persona.md mode 0644 (human file — 0600 recommended)");
    expect(r).toContain("info persona.md: 2 of 3 agent stores");
    noFail(s);
  });

  test("knowledge: > 8192 warn · symlink warn · mode info", () => {
    const a = memorySection(input({ knowledgeIndex: { state: "file", bytes: 8193, mode: 0o644 } }));
    expect(rows(a)).toContain(
      "warn knowledge/INDEX.md: 8193/8192 B — truncated on read (/h/.loom/knowledge/INDEX.md)",
    );
    expect(rows(a)).toContain("info knowledge/INDEX.md mode 0644 (human file — 0600 recommended)");
    const b = memorySection(input({ knowledgeIndex: { state: "unsafe" } }));
    expect(rows(b)).toContain(
      "warn knowledge/INDEX.md is a symlink or not a regular file (/h/.loom/knowledge/INDEX.md)",
    );
    noFail(a);
    noFail(b);
  });

  test("guideline: > 16384 warn · symlink warn · count · scan cap info · rooms/ unsafe", () => {
    const s = memorySection(
      input({
        rooms: {
          state: "dir",
          guidelines: [
            { roomKey: RK, file: { state: "file", bytes: 16385, mode: 0o644 } },
            { roomKey: "fedcba9876543210", file: { state: "unsafe" } },
            { roomKey: "1111111111111111", file: { state: "file", bytes: 3, mode: 0o644 } },
          ],
          scanCapped: true,
        },
      }),
    );
    const r = rows(s);
    expect(r).toContain(
      `warn rooms/${RK}/guideline.md is 16385 B (max 16384 B) — truncated on read`,
    );
    expect(r).toContain(
      "warn rooms/fedcba9876543210/guideline.md is a symlink or not a regular file",
    );
    expect(r).toContain("info guideline.md: 3 rooms");
    expect(r).toContain("info scan capped at 4096 rooms");
    noFail(s);
    const u = memorySection(
      input({ rooms: { state: "unsafe", guidelines: [], scanCapped: false } }),
    );
    expect(rows(u)).toContain("warn rooms/ is a symlink or not a directory");
  });

  test("rules: invalid · conflict · truncated warn; disabled · scan cap info", () => {
    const s = memorySection(
      input({
        rules: {
          bundled: 1,
          user: 3,
          overrides: 1,
          disabled: 1,
          invalid: 2,
          conflicts: ["dup"],
          truncated: ["big"],
          scanCapped: true,
        },
      }),
    );
    expect(rows(s).slice(-6)).toEqual([
      "ok rules: bundled 1 · user 3 · overrides 1",
      "warn rules: 2 invalid — see loom rules list",
      "warn rules: same-source id conflict: dup",
      "warn rules: truncated at 8192 B: big",
      "info rules: 1 disabled by user",
      "info rules: scan capped at 256 user files",
    ]);
    noFail(s);
  });

  test("Windows: mode bits not judged (info once)", () => {
    const s = memorySection(
      input({
        platform: "win32",
        root: { state: "dir", mode: 0o777 },
        agents: [agent({ entries: { state: "file", bytes: 10, mode: 0o666 } })],
      }),
    );
    const r = rows(s);
    expect(r[0]).toBe("ok memory/ · 1 agent stores (/h/.loom/memory)");
    expect(r[1]).toBe("ok claude.default: active 3/200 · proposed 1 · retired 2 · 1 KiB/1024 KiB");
    expect(r).toContain("info mode bits not checked on Windows");
    noFail(s);
  });

  test("doctorExitCode unchanged by the Memory section (worst-case input)", () => {
    const worst = memorySection(
      input({
        root: { state: "dir", mode: 0o777 },
        agents: [
          agent({
            entries: { state: "file", bytes: 9 * 1024 * 1024, mode: 0o666 },
            fold: null,
            persona: { state: "unsafe" },
          }),
        ],
        knowledgeIndex: { state: "unsafe" },
        rooms: { state: "unsafe", guidelines: [], scanCapped: true },
        rules: {
          bundled: 1,
          user: 9,
          overrides: 0,
          disabled: 0,
          invalid: 9,
          conflicts: ["a"],
          truncated: ["b"],
          scanCapped: true,
        },
      }),
    );
    noFail(worst);
    const other: DoctorSection = { title: "X", lines: [{ status: "ok", message: "fine" }] };
    expect(doctorExitCode([other, worst])).toBe(doctorExitCode([other]));
  });
});

// ---------------------------------------------------------------------------------------------
// gatherer — read-only, lock-free, capped
// ---------------------------------------------------------------------------------------------

let L: string;

beforeEach(() => {
  L = mkdtempSync(join(tmpdir(), "loom-memdoc-p4-"));
});

afterEach(() => {
  rmSync(L, { recursive: true, force: true });
});

function tree(root: string): string[] {
  const out: string[] = [];
  const go = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      const st = lstatSync(p);
      out.push(`${relative(root, p)}|${st.mode}|${st.size}|${st.mtimeMs}`);
      if (st.isDirectory() && !st.isSymbolicLink()) go(p);
    }
  };
  go(root);
  return out;
}

function line(n: number, over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    v: 1,
    kind: "entry",
    id: ID(n),
    seq: n,
    type: "fact",
    appliesTo: "project",
    body: `e${n}`,
    source: { kind: "human", by: "Kim" },
    status: "active",
    supersedes: null,
    ...over,
  });
}

describe("readMemoryDoctorInput (gatherer)", () => {
  test("empty loomDir → absent root; bundled rules; nothing written", () => {
    const before = tree(L);
    const inp = readMemoryDoctorInput(L, "darwin");
    expect(inp.root).toEqual({ state: "absent" });
    expect(inp.memoryDir).toBe(join(L, "memory"));
    expect(inp.agents).toEqual([]);
    expect(inp.knowledgeIndex).toEqual({ state: "absent" });
    expect(inp.knowledgeIndexPath).toBe(join(L, "knowledge", "INDEX.md"));
    expect(inp.rooms).toEqual({ state: "absent", guidelines: [], scanCapped: false });
    expect(inp.rules.bundled).toBe(1);
    expect(tree(L)).toEqual(before);
    noFail(memorySection(inp));
  });

  test("real tree → counters, modes, persona, guideline, ignored; no lock dir, no writes", () => {
    const store = join(L, "memory", "claude.default");
    mkdirSync(store, { recursive: true, mode: 0o700 });
    chmodSync(join(L, "memory"), 0o700);
    writeFileSync(
      join(store, "entries.jsonl"),
      `${line(1)}\n${line(2, { status: "proposed" })}\n{torn\n${line(3, { supersedes: ID(9) })}\n`,
      { mode: 0o600 },
    );
    writeFileSync(join(store, "persona.md"), "p".repeat(9000), { mode: 0o644 });
    mkdirSync(join(L, "memory", "notes"));
    mkdirSync(join(L, "rooms", RK), { recursive: true });
    writeFileSync(join(L, "rooms", RK, "guideline.md"), "g".repeat(20000));
    mkdirSync(join(L, "rooms", "not-a-room-key"), { recursive: true });
    mkdirSync(join(L, "knowledge"));
    writeFileSync(join(L, "knowledge", "INDEX.md"), "idx", { mode: 0o600 });
    const before = tree(L);
    const inp = readMemoryDoctorInput(L, "darwin");
    expect(tree(L)).toEqual(before);
    expect(inp.root).toEqual({ state: "dir", mode: 0o700 });
    expect(inp.ignored).toEqual(["notes"]);
    expect(inp.agents).toHaveLength(1);
    const a = inp.agents[0]!;
    expect(a.agentKey).toBe("claude.default");
    expect(a.dir).toBe("dir");
    expect(a.entries).toMatchObject({ state: "file", mode: 0o600 });
    expect(a.fold).toEqual({
      active: 2,
      proposed: 1,
      retired: 0,
      unparseable: 1,
      conflicts: 0,
      dangling: 1,
      archivedRefs: 0,
    });
    expect(a.persona).toEqual({ state: "file", bytes: 9000, mode: 0o644 });
    expect(a.archive).toEqual({ state: "absent" });
    expect(inp.rooms.state).toBe("dir");
    expect(inp.rooms.guidelines).toEqual([
      { roomKey: RK, file: { state: "file", bytes: 20000, mode: expect.any(Number) } },
    ]);
    expect(inp.knowledgeIndex).toEqual({ state: "file", bytes: 3, mode: 0o600 });
    const s = memorySection(inp);
    noFail(s);
    expect(rows(s)).toContain(
      "warn claude.default/persona.md is 9000 B (max 8192 B) — truncated on read",
    );
    expect(rows(s)).toContain(
      `warn rooms/${RK}/guideline.md is 20000 B (max 16384 B) — truncated on read`,
    );
  });

  test("symlinked memory/ → unsafe, not followed", () => {
    const elsewhere = mkdtempSync(join(tmpdir(), "loom-memdoc-else-"));
    try {
      mkdirSync(join(elsewhere, "claude.default"));
      symlinkSync(elsewhere, join(L, "memory"));
      const inp = readMemoryDoctorInput(L, "darwin");
      expect(inp.root).toEqual({ state: "unsafe" });
      expect(inp.agents).toEqual([]);
    } finally {
      rmSync(elsewhere, { recursive: true, force: true });
    }
  });

  test("symlinked agent dir / entries.jsonl / persona → unsafe", () => {
    const elsewhere = mkdtempSync(join(tmpdir(), "loom-memdoc-else-"));
    try {
      mkdirSync(join(L, "memory", "codex.default"), { recursive: true, mode: 0o700 });
      symlinkSync(elsewhere, join(L, "memory", "claude.default"));
      writeFileSync(join(elsewhere, "x.jsonl"), `${line(1)}\n`);
      symlinkSync(join(elsewhere, "x.jsonl"), join(L, "memory", "codex.default", "entries.jsonl"));
      symlinkSync(join(elsewhere, "x.jsonl"), join(L, "memory", "codex.default", "persona.md"));
      const inp = readMemoryDoctorInput(L, "darwin");
      const byKey = Object.fromEntries(inp.agents.map((a) => [a.agentKey, a]));
      expect(byKey["claude.default"]!.dir).toBe("unsafe");
      expect(byKey["codex.default"]!.entries).toEqual({ state: "unsafe" });
      expect(byKey["codex.default"]!.fold).toBeNull();
      expect(byKey["codex.default"]!.persona).toEqual({ state: "unsafe" });
    } finally {
      rmSync(elsewhere, { recursive: true, force: true });
    }
  });

  test("a held store lock does not block the gatherer (no lock taken)", () => {
    const store = join(L, "memory", "claude.default");
    mkdirSync(join(store, "entries.jsonl.lock"), { recursive: true });
    writeFileSync(join(store, "entries.jsonl.lock", "owner.pid"), `${process.pid}\n`);
    writeFileSync(join(store, "entries.jsonl"), `${line(1)}\n`, { mode: 0o600 });
    const t0 = Date.now();
    const inp = readMemoryDoctorInput(L, "darwin");
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(inp.agents[0]!.fold!.active).toBe(1);
  });

  test("scan caps: > 64 agent stores · > 4096 rooms → capped flags", () => {
    for (let i = 0; i < 65; i++) mkdirSync(join(L, "memory", `claude.p${i}`), { recursive: true });
    for (let i = 0; i < 4097; i++) {
      mkdirSync(join(L, "rooms", i.toString(16).padStart(16, "0")), { recursive: true });
    }
    const inp = readMemoryDoctorInput(L, "darwin");
    expect(inp.agents).toHaveLength(64);
    expect(inp.agentScanCapped).toBe(true);
    expect(inp.rooms.scanCapped).toBe(true);
    expect(inp.rooms.guidelines).toEqual([]);
  });
});
