/**
 * PLAN 0.35.0 P2 — memory-store writes (D2 · D4 · D5 · R6 · R7 · R8 · R9 · R53-L1 · R53-M1).
 * Done-when (c): seq monotonic from 1 · watermark respected · lock held → second writer refused
 * with file bytes unchanged · dirs 0700 / files 0600 · symlink refusal · append repair.
 * Done-when (d): write checks ①–⑥ each refuse with zero bytes written · caps refuse add/propose
 * only (approve · retire · compact succeed at 1 MiB and at 200 visible-active) · `--supersedes`
 * allowed at 200 · proposed cap 200 · CRLF passes · refusal text never echoes the body/secret ·
 * compact A←B←C → A·B moved, C supersedesArchived, dangling 0, visible set identical · archive
 * first (crash before replace leaves entries.jsonl untouched) · one watermark line · 0 moves → no
 * write.
 * P3's loadMemorySnapshot does not exist yet → "visible set identical before/after compact" is
 * asserted on foldMemoryLines(...).visibleActive (ids + bodies) instead.
 * Every store lives under a fresh mkdtemp loomDir passed explicitly; run this file with HOME and
 * LOOM_TEST_HOME both pointing at a temp dir (R16).
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withFileLock } from "./atomic-json";
import {
  appendMemoryEntry,
  appendMemoryTransition,
  compactMemory,
  foldMemoryLines,
  humanMemorySource,
  MEMORY_ACTIVE_CAP,
  MEMORY_ENTRIES_MAX_BYTES,
  MEMORY_PROPOSED_CAP,
  type MemoryEntryInput,
  type MemoryWriteDeps,
  memoryPaths,
  memoryStoreTestHooks,
} from "./memory-store";

const AGENT = "claude.default";
const ID = (n: number) => `mem_${n.toString(16).padStart(16, "0")}`;
const ROOM = "room:0123456789abcdef";
const SRC = { kind: "human", by: "Kim" };

type Obj = Record<string, unknown>;

let L: string;

beforeEach(() => {
  L = mkdtempSync(join(tmpdir(), "loom-mem-p2-"));
  memoryStoreTestHooks.failBeforeReplace = false;
});

afterEach(() => {
  memoryStoreTestHooks.failBeforeReplace = false;
  rmSync(L, { recursive: true, force: true });
});

/** Deterministic ids mem_…a001, a002, … (the injectable `randomId`). */
function counterIds(start = 0xa000): () => string {
  let n = start;
  return () => ID(++n);
}

function deps(over: Partial<MemoryWriteDeps> = {}): MemoryWriteDeps {
  return {
    env: {},
    randomId: counterIds(),
    now: () => new Date("2026-10-16T12:00:00.000Z"),
    ...over,
  };
}

function input(over: Partial<MemoryEntryInput> = {}): MemoryEntryInput {
  return {
    body: "the build uses bun",
    type: "fact",
    appliesTo: "project",
    status: "active",
    supersedes: null,
    source: humanMemorySource("Kim"),
    ...over,
  };
}

function paths() {
  return memoryPaths(L, AGENT);
}

/** Raw bytes of entries.jsonl ("" when absent). */
function bytes(): string {
  const p = paths().entries;
  return existsSync(p) ? readFileSync(p, "utf8") : "";
}

function fold() {
  return foldMemoryLines(bytes());
}

const mode = (p: string) => statSync(p).mode & 0o777;

function entryLine(over: Obj = {}): Obj {
  return {
    v: 1,
    kind: "entry",
    id: ID(1),
    seq: 1,
    type: "fact",
    appliesTo: "project",
    body: "hello",
    source: SRC,
    status: "active",
    supersedes: null,
    ...over,
  };
}

function transitionLine(over: Obj = {}): Obj {
  return { v: 1, kind: "transition", id: ID(1), seq: 2, to: "active", source: SRC, ...over };
}

const watermarkLine = (seq: number): Obj => ({ v: 1, kind: "compact", seq });

/** Seed entries.jsonl directly (creates dirs 0700 / file 0600 like the store). */
function seed(raw: string): void {
  const p = paths();
  mkdirSync(p.dir, { recursive: true, mode: 0o700 });
  writeFileSync(p.entries, raw, { mode: 0o600 });
}

function storeText(...lines: (Obj | string)[]): string {
  return lines.map((l) => `${typeof l === "string" ? l : JSON.stringify(l)}\n`).join("");
}

function expectOk<T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> {
  if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
}

function expectRefused(
  r: { ok: boolean; code?: string; message?: string },
  code: string,
  message?: string | RegExp,
): void {
  expect(r.ok).toBe(false);
  expect(r.code).toBe(code);
  if (typeof message === "string") expect(r.message).toBe(message);
  else if (message) expect(r.message).toMatch(message);
}

// ---------------------------------------------------------------------------------------------
// paths · modes · seq
// ---------------------------------------------------------------------------------------------

describe("memoryPaths (②)", () => {
  test("paths live under the given loomDir", () => {
    const p = memoryPaths(L, AGENT);
    expect(p.memoryDir).toBe(join(L, "memory"));
    expect(p.dir).toBe(join(L, "memory", AGENT));
    expect(p.entries).toBe(join(L, "memory", AGENT, "entries.jsonl"));
    expect(p.archive).toBe(join(L, "memory", AGENT, "entries.archive.jsonl"));
    expect(p.lock).toBe(join(L, "memory", AGENT, "entries.jsonl.lock"));
  });

  test("non-absolute loomDir or invalid agentKey → TypeError", () => {
    expect(() => memoryPaths("relative/dir", AGENT)).toThrow(TypeError);
    expect(() => memoryPaths(L, "claude")).toThrow(TypeError);
    expect(() => memoryPaths(L, "../etc")).toThrow(TypeError);
    expect(() => memoryPaths(L, "Claude.default")).toThrow(TypeError);
  });
});

describe("new store — dirs 0700 · files 0600 · seq from 1 (D2 · D3)", () => {
  test("first add creates memory/ and the agentKey dir 0700 and entries.jsonl 0600", () => {
    const r = expectOk(appendMemoryEntry(L, AGENT, input(), deps()));
    const p = paths();
    expect(lstatSync(p.memoryDir).isDirectory()).toBe(true);
    expect(mode(p.memoryDir)).toBe(0o700);
    expect(mode(p.dir)).toBe(0o700);
    expect(mode(p.entries)).toBe(0o600);
    expect(r.seq).toBe(1);
    expect(r.path).toBe(p.entries);
    expect(existsSync(p.archive)).toBe(false);
    expect(existsSync(p.lock)).toBe(false); // lock released
  });

  test("Loom creates nothing else (no persona.md, knowledge, rules, rooms)", () => {
    expectOk(appendMemoryEntry(L, AGENT, input(), deps()));
    expect(existsSync(join(paths().dir, "persona.md"))).toBe(false);
    for (const d of ["knowledge", "rules", "rooms"]) expect(existsSync(join(L, d))).toBe(false);
  });

  test("the appended entry line is one JSON object per line with the ② schema", () => {
    const r = expectOk(
      appendMemoryEntry(
        L,
        AGENT,
        input({ body: "use bun", type: "decision", appliesTo: ROOM }),
        deps(),
      ),
    );
    const raw = bytes();
    expect(raw.endsWith("\n")).toBe(true);
    expect(raw.split("\n").length).toBe(2);
    const o = JSON.parse(raw) as Obj;
    expect(o).toEqual({
      v: 1,
      kind: "entry",
      id: r.id,
      seq: 1,
      type: "decision",
      appliesTo: ROOM,
      body: "use bun",
      source: { kind: "human", by: "Kim" },
      status: "active",
      supersedes: null,
      at: "2026-10-16T12:00:00.000Z",
    });
    expect(r.id).toMatch(/^mem_[0-9a-f]{16}$/);
    expect(r.status).toBe("active");
  });

  test("default randomId yields mem_ + 16 hex and distinct ids", () => {
    const d = deps();
    delete (d as Partial<MemoryWriteDeps>).randomId;
    const a = expectOk(appendMemoryEntry(L, AGENT, input(), d));
    const b = expectOk(appendMemoryEntry(L, AGENT, input(), d));
    expect(a.id).toMatch(/^mem_[0-9a-f]{16}$/);
    expect(b.id).toMatch(/^mem_[0-9a-f]{16}$/);
    expect(a.id).not.toBe(b.id);
  });

  test("seq is monotonic across add · propose · approve · retire", () => {
    const d = deps();
    const a = expectOk(appendMemoryEntry(L, AGENT, input(), d));
    const p = expectOk(appendMemoryEntry(L, AGENT, input({ status: "proposed" }), d));
    const ap = expectOk(
      appendMemoryTransition(L, AGENT, { id: p.id, to: "active", source: SRC }, d),
    );
    const rt = expectOk(
      appendMemoryTransition(L, AGENT, { id: a.id, to: "retired", source: SRC }, d),
    );
    expect([a.seq, p.seq, ap.seq, rt.seq]).toEqual([1, 2, 3, 4]);
    expect(p.status).toBe("proposed");
    const f = fold();
    expect(f.maxSeq).toBe(4);
    expect(f.entries.get(p.id)!.status).toBe("active");
    expect(f.entries.get(a.id)!.status).toBe("retired");
  });

  test("seq after a compact watermark = watermark + 1", () => {
    seed(storeText(entryLine({ seq: 3 }), watermarkLine(10)));
    const r = expectOk(appendMemoryEntry(L, AGENT, input(), deps()));
    expect(r.seq).toBe(11);
  });

  test("seq = fold maxSeq + 1 regardless of line order; unparseable lines' seq is ignored", () => {
    seed(
      storeText(
        entryLine({ id: ID(2), seq: 7 }),
        entryLine({ id: ID(1), seq: 2 }),
        entryLine({ id: ID(3), seq: 99, v: 2 }), // unparseable — its seq never counts
        '{"v":1,"kind":"entry","seq":500',
      ),
    );
    expect(expectOk(appendMemoryEntry(L, AGENT, input(), deps())).seq).toBe(8);
  });

  test("a randomId colliding with an existing entry is regenerated", () => {
    seed(storeText(entryLine({ id: ID(0xa001) })));
    const r = expectOk(appendMemoryEntry(L, AGENT, input(), deps({ randomId: counterIds() })));
    expect(r.id).toBe(ID(0xa002));
  });

  test("randomId that keeps colliding → refused (≤4 draws), zero bytes written", () => {
    seed(storeText(entryLine({ id: ID(0xa001) })));
    const before = bytes();
    let calls = 0;
    const r = appendMemoryEntry(
      L,
      AGENT,
      input(),
      deps({
        randomId: () => {
          calls += 1;
          return ID(0xa001);
        },
      }),
    );
    expect(r.ok).toBe(false);
    expect(calls).toBeGreaterThanOrEqual(3);
    expect(calls).toBeLessThanOrEqual(4);
    expect(bytes()).toBe(before);
  });

  test("humanMemorySource sanitizes the display name and caps it at 64", () => {
    expect(humanMemorySource("Kim")).toEqual({ kind: "human", by: "Kim" });
    expect(humanMemorySource("K\u001b[31mim\n")).toEqual({ kind: "human", by: "Kim" });
    expect((humanMemorySource("x".repeat(200)).by as string).length).toBe(64);
  });
});

// ---------------------------------------------------------------------------------------------
// lock (class 1)
// ---------------------------------------------------------------------------------------------

describe("lock — store busy (② 락 · class 1)", () => {
  test(
    "lock held → add refused with store busy, file bytes unchanged",
    () => {
      expectOk(appendMemoryEntry(L, AGENT, input(), deps()));
      const before = bytes();
      const p = paths();
      let r: ReturnType<typeof appendMemoryEntry> | undefined;
      withFileLock(p.entries, () => {
        r = appendMemoryEntry(L, AGENT, input({ body: "second" }), deps());
      });
      expectRefused(r!, "busy", `store busy (${p.lock}) — try again; nothing written`);
      expect(bytes()).toBe(before);
    },
    { timeout: 20_000 },
  );

  test(
    "lock held → compact refused with store busy, files unchanged",
    () => {
      seed(storeText(entryLine({ status: "retired" }), entryLine({ id: ID(2), seq: 2 })));
      const before = bytes();
      const p = paths();
      let r: ReturnType<typeof compactMemory> | undefined;
      withFileLock(p.entries, () => {
        r = compactMemory(L, AGENT);
      });
      expectRefused(r!, "busy", `store busy (${p.lock}) — try again; nothing written`);
      expect(bytes()).toBe(before);
      expect(existsSync(p.archive)).toBe(false);
    },
    { timeout: 20_000 },
  );
});

// ---------------------------------------------------------------------------------------------
// write checks ①–⑥ (add · propose)
// ---------------------------------------------------------------------------------------------

describe("write checks ①–⑥ — first refusal stops, zero bytes written (D5 · R6 · R7)", () => {
  const SECRET_ENV = { MY_API_KEY: "zq9-hunter2-not-a-shape" };

  function seeded(): string {
    expectOk(appendMemoryEntry(L, AGENT, input({ body: "existing" }), deps()));
    return bytes();
  }

  test("① empty body (after sanitize + trim) → `empty body`", () => {
    const before = seeded();
    for (const body of ["", "   ", "\n\t \n", "\u001b[31m\u001b[0m", "\r\r"]) {
      for (const status of ["active", "proposed"] as const) {
        expectRefused(
          appendMemoryEntry(L, AGENT, input({ body, status }), deps()),
          "empty_body",
          "empty body",
        );
      }
    }
    expect(bytes()).toBe(before);
  });

  test("② redaction would change the body → refused; message echoes neither body nor secret", () => {
    const before = seeded();
    const cases: Array<[string, Record<string, string>]> = [
      ["key is sk-ant-abcdefgh12345678 ok", {}],
      ["token: abc", {}],
      [`the value ${SECRET_ENV.MY_API_KEY} is set`, SECRET_ENV],
    ];
    const msg =
      "body looks like it contains a secret (redaction would change it) — reword it; nothing written";
    for (const [body, env] of cases) {
      for (const status of ["active", "proposed"] as const) {
        const r = appendMemoryEntry(L, AGENT, input({ body, status }), deps({ env }));
        expectRefused(r, "secret", msg);
        expect(r.ok ? "" : r.message).not.toContain(body);
        expect(r.ok ? "" : r.message).not.toContain("sk-ant");
        expect(r.ok ? "" : r.message).not.toContain(SECRET_ENV.MY_API_KEY);
      }
    }
    expect(bytes()).toBe(before);
  });

  test("② uses deps.env, not process.env (R53-L1)", () => {
    const body = `the value ${SECRET_ENV.MY_API_KEY} is set`;
    // same body, empty injected env → not a secret by shape → accepted
    expectOk(appendMemoryEntry(L, AGENT, input({ body }), deps({ env: {} })));
    const prev = process.env.LOOM_P2_TEST_API_KEY;
    process.env.LOOM_P2_TEST_API_KEY = "zz-process-env-only-value";
    try {
      expectOk(
        appendMemoryEntry(
          L,
          AGENT,
          input({ body: "mentions zz-process-env-only-value" }),
          deps({ env: {} }),
        ),
      );
    } finally {
      if (prev === undefined) delete process.env.LOOM_P2_TEST_API_KEY;
      else process.env.LOOM_P2_TEST_API_KEY = prev;
    }
  });

  test("CRLF body passes: CR is silently normalized away by sanitize (R7)", () => {
    const r = expectOk(
      appendMemoryEntry(L, AGENT, input({ body: "line one\r\nline two\r\n" }), deps()),
    );
    const e = fold().entries.get(r.id)!;
    expect(e.body).toBe("line one\nline two\n");
    expect(e.body.includes("\r")).toBe(false);
  });

  test("control characters are stripped before storing", () => {
    const r = expectOk(appendMemoryEntry(L, AGENT, input({ body: "a\u001b[31mb\u0007c" }), deps()));
    expect(fold().entries.get(r.id)!.body).toBe("abc");
  });

  test("③ body over 2000 chars (after sanitize) → `body is N chars (max 2000)`", () => {
    const before = seeded();
    for (const status of ["active", "proposed"] as const) {
      expectRefused(
        appendMemoryEntry(L, AGENT, input({ body: "x".repeat(2001), status }), deps()),
        "too_long",
        "body is 2001 chars (max 2000)",
      );
    }
    expect(bytes()).toBe(before);
    // exactly 2000 is fine; CRs removed by sanitize do not count
    expectOk(appendMemoryEntry(L, AGENT, input({ body: "x".repeat(2000) }), deps()));
    expectOk(appendMemoryEntry(L, AGENT, input({ body: `${"y".repeat(2000)}\r\r` }), deps()));
  });

  test("check order: ① before ② before ③", () => {
    seeded();
    expectRefused(appendMemoryEntry(L, AGENT, input({ body: "  \r " }), deps()), "empty_body");
    expectRefused(
      appendMemoryEntry(L, AGENT, input({ body: `token: abc ${"x".repeat(2100)}` }), deps()),
      "secret",
    );
  });

  test("④ entries.jsonl over 1 MiB → refused for add and propose", () => {
    seedLarge();
    const before = bytes();
    const size = Buffer.byteLength(before);
    expect(size).toBeGreaterThan(MEMORY_ENTRIES_MAX_BYTES);
    const kib = Math.ceil(size / 1024);
    for (const status of ["active", "proposed"] as const) {
      expectRefused(
        appendMemoryEntry(L, AGENT, input({ status }), deps()),
        "too_large",
        `entries.jsonl is ${kib} KiB (max 1024 KiB) — run loom memory compact (retire entries first if it moves nothing)`,
      );
    }
    expect(bytes()).toBe(before);
  });

  test("④ exactly 1 MiB is still writable", () => {
    const head = storeText(entryLine({ id: ID(1), seq: 1 }));
    const pad = MEMORY_ENTRIES_MAX_BYTES - Buffer.byteLength(head) - 1;
    seed(`${head}${"#".repeat(pad)}\n`); // one unparseable padding line
    expect(Buffer.byteLength(bytes())).toBe(MEMORY_ENTRIES_MAX_BYTES);
    expectOk(appendMemoryEntry(L, AGENT, input(), deps()));
  });

  test("⑤ add at 200 visible active → refused; message counts actives", () => {
    seedActives(MEMORY_ACTIVE_CAP);
    const before = bytes();
    expectRefused(
      appendMemoryEntry(L, AGENT, input(), deps()),
      "active_cap",
      "200 active entries (max 200) — retire or supersede one",
    );
    expect(bytes()).toBe(before);
  });

  test("⑤ add --supersedes <visible active> at 200 is allowed (net 0)", () => {
    seedActives(MEMORY_ACTIVE_CAP);
    const r = expectOk(appendMemoryEntry(L, AGENT, input({ supersedes: ID(1) }), deps()));
    const f = fold();
    expect(f.visibleActive.length).toBe(MEMORY_ACTIVE_CAP);
    expect(f.entries.get(ID(1))!.hidden).toBe(true);
    expect(f.entries.get(r.id)!.supersedes).toBe(ID(1));
  });

  test("⑤ add --supersedes a NON-visible entry at 200 is still refused", () => {
    seedActives(MEMORY_ACTIVE_CAP, [
      entryLine({ id: ID(0x900), seq: 900, status: "retired", body: "old" }),
      entryLine({ id: ID(0x901), seq: 901, status: "proposed", body: "pending" }),
    ]);
    const before = bytes();
    for (const sup of [ID(0x900), ID(0x901)]) {
      expectRefused(appendMemoryEntry(L, AGENT, input({ supersedes: sup }), deps()), "active_cap");
    }
    expect(bytes()).toBe(before);
  });

  test("⑤ visible-active count excludes hidden actives (R6)", () => {
    // 200 active lines, one hidden by another → 199 visible → add allowed
    seedActives(MEMORY_ACTIVE_CAP - 2, [
      entryLine({ id: ID(0x900), seq: 900, body: "hidden" }),
      entryLine({ id: ID(0x901), seq: 901, supersedes: ID(0x900), body: "edit" }),
    ]);
    const f = fold();
    expect([...f.entries.values()].filter((e) => e.status === "active")).toHaveLength(200);
    expect(f.visibleActive).toHaveLength(MEMORY_ACTIVE_CAP - 1);
    expectOk(appendMemoryEntry(L, AGENT, input(), deps()));
    expect(fold().visibleActive).toHaveLength(MEMORY_ACTIVE_CAP);
    expectRefused(appendMemoryEntry(L, AGENT, input(), deps()), "active_cap");
  });

  test("⑤ propose is limited by the proposed cap (200), not by the active cap", () => {
    seedActives(MEMORY_ACTIVE_CAP);
    const p = expectOk(appendMemoryEntry(L, AGENT, input({ status: "proposed" }), deps()));
    expect(p.status).toBe("proposed");
  });

  test("⑤ propose at 200 proposed → refused; add still allowed", () => {
    const lines: Obj[] = [];
    for (let i = 1; i <= MEMORY_PROPOSED_CAP; i++) {
      lines.push(entryLine({ id: ID(i), seq: i, status: "proposed", body: `p${i}` }));
    }
    seed(storeText(...lines));
    const before = bytes();
    const r = appendMemoryEntry(L, AGENT, input({ status: "proposed" }), deps());
    expectRefused(r, "proposed_cap", /^200 proposed entries \(max 200\)/);
    expect(bytes()).toBe(before);
    expectOk(appendMemoryEntry(L, AGENT, input({ status: "active" }), deps()));
  });

  test("⑥ --supersedes an id not in the fold → `unknown entry <id>`", () => {
    const before = seeded();
    for (const status of ["active", "proposed"] as const) {
      expectRefused(
        appendMemoryEntry(L, AGENT, input({ supersedes: ID(0xdead), status }), deps()),
        "unknown_supersedes",
        `unknown entry ${ID(0xdead)}`,
      );
    }
    expect(bytes()).toBe(before);
  });

  test("⑥ --supersedes on an empty/absent store → unknown entry, nothing created", () => {
    expectRefused(
      appendMemoryEntry(L, AGENT, input({ supersedes: ID(5) }), deps()),
      "unknown_supersedes",
    );
    expect(bytes()).toBe("");
    expect(existsSync(join(L, "memory"))).toBe(false);
    // memory/ present but no agent dir → still nothing created
    mkdirSync(join(L, "memory"), { mode: 0o700 });
    expectRefused(
      appendMemoryEntry(L, AGENT, input({ supersedes: ID(5), status: "proposed" }), deps()),
      "unknown_supersedes",
    );
    expect(existsSync(paths().dir)).toBe(false);
  });

  test("check order: ④ before ⑤ before ⑥", () => {
    seedLarge();
    expectRefused(
      appendMemoryEntry(L, AGENT, input({ supersedes: ID(0xdead) }), deps()),
      "too_large",
    );
    rmSync(paths().entries);
    seedActives(MEMORY_ACTIVE_CAP);
    expectRefused(
      appendMemoryEntry(L, AGENT, input({ supersedes: ID(0xdead) }), deps()),
      "active_cap",
    );
  });

  test("① empty body never creates the store directories", () => {
    expectRefused(appendMemoryEntry(L, AGENT, input({ body: " " }), deps()), "empty_body");
    expect(existsSync(join(L, "memory"))).toBe(false);
  });
});

/** 200 (or n) visible active entries ID(1..n), seq 1..n, plus extra lines. */
function seedActives(n: number, extra: Obj[] = []): void {
  const lines: Obj[] = [];
  for (let i = 1; i <= n; i++) lines.push(entryLine({ id: ID(i), seq: i, body: `a${i}` }));
  seed(storeText(...lines, ...extra));
}

/**
 * > 1 MiB store: ~540 retired entries with ~1990-char bodies, plus ID(0x7001) proposed and
 * ID(0x7002) active, few visible actives.
 */
function seedLarge(): void {
  const lines: Obj[] = [];
  for (let i = 1; i <= 540; i++) {
    lines.push(
      entryLine({ id: ID(0x10000 + i), seq: i, status: "retired", body: "r".repeat(1990) }),
    );
  }
  lines.push(entryLine({ id: ID(0x7001), seq: 1001, status: "proposed", body: "pending" }));
  lines.push(entryLine({ id: ID(0x7002), seq: 1002, status: "active", body: "live" }));
  seed(storeText(...lines));
}

// ---------------------------------------------------------------------------------------------
// caps refuse add/propose ONLY — approve · retire · compact always work (D5 · no deadlock)
// ---------------------------------------------------------------------------------------------

describe("caps never block approve · retire · compact (D5)", () => {
  test("1 MiB store: approve, retire and compact succeed; add works again after compact", () => {
    seedLarge();
    expect(Buffer.byteLength(bytes())).toBeGreaterThan(MEMORY_ENTRIES_MAX_BYTES);
    const ap = expectOk(
      appendMemoryTransition(L, AGENT, { id: ID(0x7001), to: "active", source: SRC }, deps()),
    );
    expect(ap.seq).toBe(1003);
    const rt = expectOk(
      appendMemoryTransition(L, AGENT, { id: ID(0x7002), to: "retired", source: SRC }, deps()),
    );
    expect(rt.seq).toBe(1004);
    const c = expectOk(compactMemory(L, AGENT));
    expect(c.moved).toBeGreaterThanOrEqual(540);
    expect(Buffer.byteLength(bytes())).toBeLessThan(MEMORY_ENTRIES_MAX_BYTES);
    const a = expectOk(appendMemoryEntry(L, AGENT, input(), deps()));
    expect(a.seq).toBe(1005);
  });

  test("200 visible active: approve (→201), retire and compact succeed", () => {
    seedActives(MEMORY_ACTIVE_CAP, [
      entryLine({ id: ID(0x901), seq: 901, status: "proposed", body: "pending" }),
      entryLine({ id: ID(0x902), seq: 902, status: "retired", body: "gone" }),
    ]);
    expectOk(
      appendMemoryTransition(L, AGENT, { id: ID(0x901), to: "active", source: SRC }, deps()),
    );
    expect(fold().visibleActive.length).toBe(MEMORY_ACTIVE_CAP + 1);
    expectOk(appendMemoryTransition(L, AGENT, { id: ID(1), to: "retired", source: SRC }, deps()));
    expect(fold().visibleActive.length).toBe(MEMORY_ACTIVE_CAP);
    const c = expectOk(compactMemory(L, AGENT));
    expect(c.moved).toBeGreaterThan(0);
    expect(fold().visibleActive.length).toBe(MEMORY_ACTIVE_CAP);
  });

  test("approve and retire skip redaction/size checks (transition lines carry no body)", () => {
    const p = expectOk(appendMemoryEntry(L, AGENT, input({ status: "proposed" }), deps()));
    // an env that would redact everything does not matter to transitions
    const r = expectOk(
      appendMemoryTransition(
        L,
        AGENT,
        { id: p.id, to: "active", source: SRC },
        deps({ env: { X_TOKEN: "the build uses bun" } }),
      ),
    );
    expect(r.to).toBe("active");
  });
});

// ---------------------------------------------------------------------------------------------
// approve / retire transitions (D4 · R3)
// ---------------------------------------------------------------------------------------------

describe("approve / retire (D4)", () => {
  test("approve appends a transition line {v,kind,id,seq,to,source,at}", () => {
    const p = expectOk(appendMemoryEntry(L, AGENT, input({ status: "proposed" }), deps()));
    const r = expectOk(
      appendMemoryTransition(L, AGENT, { id: p.id, to: "active", source: SRC }, deps()),
    );
    const last = bytes().trimEnd().split("\n").at(-1)!;
    expect(JSON.parse(last)).toEqual({
      v: 1,
      kind: "transition",
      id: p.id,
      seq: 2,
      to: "active",
      source: SRC,
      at: "2026-10-16T12:00:00.000Z",
    });
    expect(r).toMatchObject({ ok: true, id: p.id, seq: 2, to: "active" });
    expect(fold().visibleActive.map((e) => e.id)).toEqual([p.id]);
  });

  test("approve requires status proposed", () => {
    const d = deps();
    const a = expectOk(appendMemoryEntry(L, AGENT, input(), d));
    const before = bytes();
    expectRefused(
      appendMemoryTransition(L, AGENT, { id: a.id, to: "active", source: SRC }, d),
      "bad_state",
      `entry ${a.id} is active — nothing to approve`,
    );
    expectRefused(
      appendMemoryTransition(L, AGENT, { id: ID(0xbeef), to: "active", source: SRC }, d),
      "bad_state",
      `entry ${ID(0xbeef)} is missing — nothing to approve`,
    );
    expectOk(appendMemoryTransition(L, AGENT, { id: a.id, to: "retired", source: SRC }, d));
    const mid = bytes();
    expectRefused(
      appendMemoryTransition(L, AGENT, { id: a.id, to: "active", source: SRC }, d),
      "bad_state",
      `entry ${a.id} is retired — nothing to approve`,
    );
    expect(bytes()).toBe(mid);
    expect(before.length).toBeLessThan(mid.length);
  });

  test("retire accepts active and proposed; refuses retired and missing", () => {
    const d = deps();
    const a = expectOk(appendMemoryEntry(L, AGENT, input(), d));
    const p = expectOk(appendMemoryEntry(L, AGENT, input({ status: "proposed" }), d));
    expectOk(appendMemoryTransition(L, AGENT, { id: a.id, to: "retired", source: SRC }, d));
    expectOk(appendMemoryTransition(L, AGENT, { id: p.id, to: "retired", source: SRC }, d));
    const before = bytes();
    for (const id of [a.id, p.id]) {
      expectRefused(
        appendMemoryTransition(L, AGENT, { id, to: "retired", source: SRC }, d),
        "bad_state",
        `entry ${id} is retired — nothing to retire`,
      );
    }
    expectRefused(
      appendMemoryTransition(L, AGENT, { id: ID(0xbeef), to: "retired", source: SRC }, d),
      "bad_state",
      `entry ${ID(0xbeef)} is missing — nothing to retire`,
    );
    expect(bytes()).toBe(before);
  });

  test("approve/retire on an absent store → missing, no directories created", () => {
    expectRefused(
      appendMemoryTransition(L, AGENT, { id: ID(1), to: "active", source: SRC }, deps()),
      "bad_state",
    );
    expect(existsSync(join(L, "memory"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// append repair (R8)
// ---------------------------------------------------------------------------------------------

describe("append repair — torn tail without newline (R8)", () => {
  test("a missing trailing newline is written first: exactly one torn line is lost", () => {
    const good = JSON.stringify(entryLine({ id: ID(1), seq: 1 }));
    const torn = '{"v":1,"kind":"entry","id":"mem_00000000000';
    seed(`${good}\n${torn}`);
    const r = expectOk(appendMemoryEntry(L, AGENT, input({ body: "fresh" }), deps()));
    const raw = bytes();
    expect(raw.startsWith(`${good}\n${torn}\n`)).toBe(true);
    expect(raw.endsWith("\n")).toBe(true);
    const f = foldMemoryLines(raw);
    expect(f.counters.unparseable).toBe(1);
    expect(f.entries.get(r.id)!.body).toBe("fresh");
    expect(f.entries.has(ID(1))).toBe(true);
    expect(r.seq).toBe(2);
  });

  test("a file already ending in newline gets no extra blank line", () => {
    seed(storeText(entryLine()));
    expectOk(appendMemoryEntry(L, AGENT, input(), deps()));
    expect(bytes().includes("\n\n")).toBe(false);
  });

  test("transition append repairs too", () => {
    const p = JSON.stringify(entryLine({ id: ID(1), seq: 1, status: "proposed" }));
    seed(`${p}\n{"v":1,`);
    expectOk(appendMemoryTransition(L, AGENT, { id: ID(1), to: "active", source: SRC }, deps()));
    const f = fold();
    expect(f.counters.unparseable).toBe(1);
    expect(f.entries.get(ID(1))!.status).toBe("active");
  });

  test("append keeps entries.jsonl at 0600 even if it was widened", () => {
    seed(storeText(entryLine()));
    chmodSync(paths().entries, 0o644);
    expectOk(appendMemoryEntry(L, AGENT, input(), deps()));
    expect(mode(paths().entries)).toBe(0o600);
  });
});

// ---------------------------------------------------------------------------------------------
// compact (R9 · R53-M1)
// ---------------------------------------------------------------------------------------------

function visibleSig(raw: string): string {
  return JSON.stringify(foldMemoryLines(raw).visibleActive.map((e) => [e.id, e.body, e.appliesTo]));
}

function lines(raw: string): string[] {
  return raw.split("\n").filter((l) => l !== "");
}

describe("compact (R9 · R53-M1)", () => {
  test("a pending proposal nothing hides survives compact and can be approved afterwards", () => {
    const d = deps();
    const a = expectOk(appendMemoryEntry(L, AGENT, input({ body: "A" }), d));
    const p = expectOk(
      appendMemoryEntry(L, AGENT, input({ body: "P", status: "proposed", supersedes: a.id }), d),
    );
    const lone = expectOk(appendMemoryEntry(L, AGENT, input({ body: "Q", status: "proposed" }), d));
    const gone = expectOk(appendMemoryEntry(L, AGENT, input({ body: "R" }), d));
    expectOk(appendMemoryTransition(L, AGENT, { id: gone.id, to: "retired", source: SRC }, d));
    const r = expectOk(compactMemory(L, AGENT));
    expect(r.moved).toBe(2);
    const f = fold();
    expect(f.entries.get(p.id)!.status).toBe("proposed");
    expect(f.entries.get(lone.id)!.status).toBe("proposed");
    expect(f.entries.get(a.id)!.hidden).toBe(false);
    expectOk(appendMemoryTransition(L, AGENT, { id: p.id, to: "active", source: SRC }, d));
    expectOk(appendMemoryTransition(L, AGENT, { id: lone.id, to: "active", source: SRC }, d));
    const g = fold();
    expect(g.visibleActive.map((e) => e.id)).toEqual([p.id, lone.id]);
    expect(g.entries.get(a.id)!.hidden).toBe(true);
  });

  test("compact result carries the CLI stdout line", () => {
    seed(
      storeText(
        entryLine({ id: ID(1), seq: 1 }),
        "junk",
        entryLine({ id: ID(2), seq: 2, status: "retired" }),
      ),
    );
    const r = expectOk(compactMemory(L, AGENT));
    expect(r.message).toBe(
      `compacted: moved 2 lines (1 unparseable, 0 conflict losers) to ${paths().archive}; kept 1; watermark seq 2`,
    );
    expect(expectOk(compactMemory(L, AGENT)).message).toBe("nothing to compact");
  });

  test("nothing to move while entries.jsonl > 1 MiB → stuck advice, exit-0 result, no write", () => {
    const lines: Obj[] = [];
    for (let i = 1; i <= 560; i++) {
      lines.push(entryLine({ id: ID(0x10000 + i), seq: i, body: "a".repeat(1990) }));
    }
    seed(storeText(...lines));
    const before = bytes();
    const kib = Math.ceil(Buffer.byteLength(before) / 1024);
    expect(kib).toBeGreaterThan(1024);
    const r = expectOk(compactMemory(L, AGENT));
    expect(r.moved).toBe(0);
    expect(r.message).toBe(
      `nothing to compact — entries.jsonl is ${kib} KiB (max 1024 KiB); retire entries first, then compact`,
    );
    expect(bytes()).toBe(before);
    expect(existsSync(paths().archive)).toBe(false);
  });

  test("orphan transitions (target absent from the fold) are moved; add works again", () => {
    const pad = "x".repeat(900);
    const lines: Obj[] = [entryLine({ id: ID(1), seq: 1, body: "keep" })];
    for (let i = 0; i < 1200; i++) {
      lines.push(
        transitionLine({
          id: ID(0x50000 + i),
          seq: 2 + i,
          to: "retired",
          source: { kind: "human", by: pad },
        }),
      );
    }
    seed(storeText(...lines));
    expect(Buffer.byteLength(bytes())).toBeGreaterThan(MEMORY_ENTRIES_MAX_BYTES);
    const beforeSig = visibleSig(bytes());
    expectRefused(appendMemoryEntry(L, AGENT, input(), deps()), "too_large");
    const r = expectOk(compactMemory(L, AGENT));
    expect(r.moved).toBe(1200);
    expect(r.kept).toBe(1);
    expect(r.watermark).toBe(1201);
    expect(visibleSig(bytes())).toBe(beforeSig);
    expect(fold().counters.dangling).toBe(0);
    expect(expectOk(appendMemoryEntry(L, AGENT, input(), deps())).seq).toBe(1202);
  });

  test("moving only unparseable lines with no prior watermark writes no watermark line (dev. 15)", () => {
    const keep = JSON.stringify(entryLine({ id: ID(1), seq: 3 }));
    seed(`garbage\n${keep}\n{"v":1,\n`);
    const r = expectOk(compactMemory(L, AGENT));
    expect(r.moved).toBe(2);
    expect(r.unparseable).toBe(2);
    expect(r.watermark).toBeNull();
    expect(bytes()).toBe(`${keep}\n`);
    expect(expectOk(appendMemoryEntry(L, AGENT, input(), deps())).seq).toBe(4);
  });

  test("seq space exhausted → every write refused, zero bytes", () => {
    const p = JSON.stringify(entryLine({ id: ID(1), seq: 1, status: "proposed" }));
    const a = JSON.stringify(entryLine({ id: ID(2), seq: 2 }));
    const max = Number.MAX_SAFE_INTEGER;
    seed(`${p}\n${a}\n${JSON.stringify(watermarkLine(max))}\n`);
    const before = bytes();
    const msg = `seq space exhausted (max seq ${max}) — nothing written`;
    for (const status of ["active", "proposed"] as const) {
      expectRefused(appendMemoryEntry(L, AGENT, input({ status }), deps()), "seq_exhausted", msg);
    }
    expectRefused(
      appendMemoryTransition(L, AGENT, { id: ID(1), to: "active", source: SRC }, deps()),
      "seq_exhausted",
      msg,
    );
    expectRefused(
      appendMemoryTransition(L, AGENT, { id: ID(2), to: "retired", source: SRC }, deps()),
      "seq_exhausted",
      msg,
    );
    expect(bytes()).toBe(before);
  });

  test("A ← B ← C (all approved): A·B moved, C supersedesArchived, dangling 0, visible same", () => {
    const d = deps();
    const a = expectOk(appendMemoryEntry(L, AGENT, input({ body: "A" }), d));
    const b = expectOk(
      appendMemoryEntry(L, AGENT, input({ body: "B", status: "proposed", supersedes: a.id }), d),
    );
    expectOk(appendMemoryTransition(L, AGENT, { id: b.id, to: "active", source: SRC }, d));
    const c = expectOk(appendMemoryEntry(L, AGENT, input({ body: "C", supersedes: b.id }), d));
    const keep = expectOk(appendMemoryEntry(L, AGENT, input({ body: "other" }), d));
    const beforeRaw = bytes();
    const beforeSig = visibleSig(beforeRaw);
    expect(foldMemoryLines(beforeRaw).visibleActive.map((e) => e.id)).toEqual([c.id, keep.id]);

    const r = expectOk(compactMemory(L, AGENT));
    expect(r.moved).toBe(3); // A entry · B entry · B's approve transition
    expect(r.unparseable).toBe(0);
    expect(r.conflictLosers).toBe(0);
    expect(r.kept).toBe(2);
    expect(r.watermark).toBe(3);
    expect(r.archivePath).toBe(paths().archive);

    const after = bytes();
    const f = foldMemoryLines(after);
    expect(f.entries.has(a.id)).toBe(false);
    expect(f.entries.has(b.id)).toBe(false);
    expect(f.entries.get(c.id)!.supersedesArchived).toBe(true);
    expect(f.counters.dangling).toBe(0);
    expect(f.counters.archivedRefs).toBe(1);
    expect(visibleSig(after)).toBe(beforeSig);

    const archived = lines(readFileSync(paths().archive, "utf8")).map((l) => JSON.parse(l) as Obj);
    expect(archived.map((o) => [o.kind, o.id])).toEqual([
      ["entry", a.id],
      ["entry", b.id],
      ["transition", b.id],
    ]);
    expect(mode(paths().archive)).toBe(0o600);
    expect(mode(paths().entries)).toBe(0o600);
  });

  test("rejected proposal supersessor: the retired proposal moves, its target stays visible", () => {
    const d = deps();
    const a = expectOk(appendMemoryEntry(L, AGENT, input({ body: "A" }), d));
    const p = expectOk(
      appendMemoryEntry(L, AGENT, input({ body: "P", status: "proposed", supersedes: a.id }), d),
    );
    expectOk(appendMemoryTransition(L, AGENT, { id: p.id, to: "retired", source: SRC }, d));
    const beforeSig = visibleSig(bytes());
    const r = expectOk(compactMemory(L, AGENT));
    expect(r.moved).toBe(2);
    expect(r.watermark).toBe(3);
    const f = fold();
    expect(f.entries.has(p.id)).toBe(false);
    expect(f.visibleActive.map((e) => e.id)).toEqual([a.id]);
    expect(visibleSig(bytes())).toBe(beforeSig);
  });

  test("retired entries move with all their transitions; kept lines stay byte-identical in order", () => {
    const keep1 = JSON.stringify(entryLine({ id: ID(1), seq: 1, body: "keep one" }));
    const gone = JSON.stringify(entryLine({ id: ID(2), seq: 2, status: "proposed" }));
    const keepCrlf = `${JSON.stringify(entryLine({ id: ID(3), seq: 3, body: "keep crlf" }))}\r`;
    const t1 = JSON.stringify(transitionLine({ id: ID(2), seq: 4, to: "active" }));
    const t2 = JSON.stringify(transitionLine({ id: ID(2), seq: 5, to: "retired" }));
    const tBad = JSON.stringify(transitionLine({ id: ID(2), seq: 6, to: "retired" })); // dangling
    seed(`${keep1}\n${gone}\n${t1}\n${keepCrlf}\n${t2}\n${tBad}\n`);
    const r = expectOk(compactMemory(L, AGENT));
    expect(r.moved).toBe(4);
    expect(r.kept).toBe(2);
    expect(bytes()).toBe(`${keep1}\n${keepCrlf}\n${JSON.stringify(watermarkLine(6))}\n`);
    expect(readFileSync(paths().archive, "utf8")).toBe(`${gone}\n${t1}\n${t2}\n${tBad}\n`);
  });

  test("unparseable lines, conflict losers and identical copies are moved and counted", () => {
    const e1 = entryLine({ id: ID(1), seq: 1, body: "aaa" });
    const e1loser = entryLine({ id: ID(1), seq: 1, body: "zzz" }); // same (id, seq), larger raw
    const e1dupId = entryLine({ id: ID(1), seq: 9, body: "same id later seq" }); // R4 loser
    const e2 = entryLine({ id: ID(2), seq: 2, body: "two" });
    seed(storeText(e1, "garbage", e1loser, e2, e2, '{"v":1,"kind":"entry"', e1dupId));
    const r = expectOk(compactMemory(L, AGENT));
    expect(r.unparseable).toBe(2);
    expect(r.conflictLosers).toBe(2);
    expect(r.moved).toBe(5); // 2 unparseable + 2 conflict losers + 1 identical copy
    expect(r.kept).toBe(2);
    expect(r.watermark).toBe(9);
    const f = fold();
    expect(f.counters).toEqual({ unparseable: 0, conflicts: 0, dangling: 0, archivedRefs: 0 });
    expect(f.visibleActive.map((e) => [e.id, e.body])).toEqual([
      [ID(1), "aaa"],
      [ID(2), "two"],
    ]);
    expect(lines(readFileSync(paths().archive, "utf8"))).toHaveLength(5);
  });

  test("watermark: exactly one line, N = max(previous watermarks, max moved seq)", () => {
    seed(
      storeText(
        watermarkLine(50),
        entryLine({ id: ID(1), seq: 51, body: "keep" }),
        entryLine({ id: ID(2), seq: 52, status: "retired" }),
        watermarkLine(20),
      ),
    );
    const r = expectOk(compactMemory(L, AGENT));
    expect(r.watermark).toBe(52);
    const marks = lines(bytes()).filter((l) => (JSON.parse(l) as Obj).kind === "compact");
    expect(marks).toEqual([JSON.stringify(watermarkLine(52))]);

    // a second compact folds the previous watermark into the new single line
    expectOk(appendMemoryTransition(L, AGENT, { id: ID(1), to: "retired", source: SRC }, deps()));
    const r2 = expectOk(compactMemory(L, AGENT));
    expect(r2.watermark).toBe(53);
    expect(bytes()).toBe(`${JSON.stringify(watermarkLine(53))}\n`);
    // seq continues after the watermark
    expect(expectOk(appendMemoryEntry(L, AGENT, input(), deps())).seq).toBe(54);
  });

  test("previous watermark above every moved seq is kept as N", () => {
    seed(storeText(entryLine({ id: ID(2), seq: 2, status: "retired" }), watermarkLine(40)));
    expect(expectOk(compactMemory(L, AGENT)).watermark).toBe(40);
  });

  test("nothing to move → no write at all (bytes, mtime, no archive)", () => {
    seed(
      storeText(
        entryLine({ id: ID(1), seq: 1 }),
        watermarkLine(7),
        entryLine({ id: ID(2), seq: 8 }),
      ),
    );
    const p = paths();
    const before = bytes();
    const mtime = statSync(p.entries).mtimeMs;
    const r = expectOk(compactMemory(L, AGENT));
    expect(r.moved).toBe(0);
    expect(bytes()).toBe(before);
    expect(statSync(p.entries).mtimeMs).toBe(mtime);
    expect(existsSync(p.archive)).toBe(false);
  });

  test("compact on an absent store → nothing to compact, nothing created", () => {
    expect(expectOk(compactMemory(L, AGENT)).moved).toBe(0);
    expect(existsSync(join(L, "memory"))).toBe(false);
  });

  test("archive first: failure injected before the replace leaves entries.jsonl untouched", () => {
    const keep = JSON.stringify(entryLine({ id: ID(1), seq: 1 }));
    const gone = JSON.stringify(entryLine({ id: ID(2), seq: 2, status: "retired" }));
    seed(`${keep}\n${gone}\n`);
    const before = bytes();
    memoryStoreTestHooks.failBeforeReplace = true;
    expect(() => compactMemory(L, AGENT)).toThrow();
    expect(bytes()).toBe(before);
    // the archive append already happened (and was fsynced) — a duplicate later is harmless
    expect(readFileSync(paths().archive, "utf8")).toBe(`${gone}\n`);
    // no stray tmp files next to the store
    const strays = readdirSync(paths().dir).filter((n) => n.includes(".tmp"));
    expect(strays).toEqual([]);

    memoryStoreTestHooks.failBeforeReplace = false;
    expectOk(compactMemory(L, AGENT));
    expect(bytes()).toBe(`${keep}\n${JSON.stringify(watermarkLine(2))}\n`);
    expect(readFileSync(paths().archive, "utf8")).toBe(`${gone}\n${gone}\n`);
  });

  test("archive append repairs a torn archive tail", () => {
    seed(storeText(entryLine({ id: ID(2), seq: 2, status: "retired" })));
    writeFileSync(paths().archive, "torn-archive-tail", { mode: 0o600 });
    expectOk(compactMemory(L, AGENT));
    expect(readFileSync(paths().archive, "utf8").startsWith("torn-archive-tail\n")).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// symlink refusal (② 경로 — lstat under loomDir; loomDir itself may be a symlink)
// ---------------------------------------------------------------------------------------------

describe("symlink refusal under loomDir (②)", () => {
  let outside: string;
  beforeEach(() => {
    outside = mkdtempSync(join(tmpdir(), "loom-mem-p2-out-"));
  });
  afterEach(() => {
    rmSync(outside, { recursive: true, force: true });
  });

  function allWritersRefused(): void {
    expectRefused(appendMemoryEntry(L, AGENT, input(), deps()), "unsafe_path");
    expectRefused(
      appendMemoryEntry(L, AGENT, input({ status: "proposed" }), deps()),
      "unsafe_path",
    );
  }

  test("memory/ is a symlink → refused; the target is untouched", () => {
    symlinkSync(outside, join(L, "memory"));
    allWritersRefused();
    expectRefused(compactMemory(L, AGENT), "unsafe_path");
    expectRefused(
      appendMemoryTransition(L, AGENT, { id: ID(1), to: "retired", source: SRC }, deps()),
      "unsafe_path",
    );
    expect(readdirSync(outside)).toEqual([]);
  });

  test("memory/<agentKey> is a symlink → refused", () => {
    mkdirSync(join(L, "memory"), { mode: 0o700 });
    symlinkSync(outside, join(L, "memory", AGENT));
    allWritersRefused();
    expect(readdirSync(outside)).toEqual([]);
  });

  test("entries.jsonl is a symlink → refused; the target file bytes are unchanged", () => {
    const target = join(outside, "victim.jsonl");
    const body = storeText(entryLine({ id: ID(1), seq: 1, status: "retired" }));
    writeFileSync(target, body);
    mkdirSync(paths().dir, { recursive: true, mode: 0o700 });
    symlinkSync(target, paths().entries);
    allWritersRefused();
    expectRefused(compactMemory(L, AGENT), "unsafe_path");
    expectRefused(
      appendMemoryTransition(L, AGENT, { id: ID(1), to: "retired", source: SRC }, deps()),
      "unsafe_path",
    );
    expect(readFileSync(target, "utf8")).toBe(body);
  });

  test("entries.archive.jsonl is a symlink → compact refused; nothing changes", () => {
    const target = join(outside, "victim-archive.jsonl");
    writeFileSync(target, "");
    seed(storeText(entryLine({ id: ID(1), seq: 1, status: "retired" })));
    symlinkSync(target, paths().archive);
    const before = bytes();
    expectRefused(compactMemory(L, AGENT), "unsafe_path");
    expect(bytes()).toBe(before);
    expect(readFileSync(target, "utf8")).toBe("");
  });

  test("memory/ that is a regular file → refused", () => {
    writeFileSync(join(L, "memory"), "not a dir");
    allWritersRefused();
  });

  test("a symlinked loomDir itself is allowed", () => {
    const real = mkdtempSync(join(tmpdir(), "loom-mem-p2-real-"));
    const link = join(outside, "loom-link");
    symlinkSync(real, link);
    try {
      const r = expectOk(appendMemoryEntry(link, AGENT, input(), deps()));
      expect(r.seq).toBe(1);
      expect(existsSync(join(real, "memory", AGENT, "entries.jsonl"))).toBe(true);
    } finally {
      rmSync(real, { recursive: true, force: true });
    }
  });
});
