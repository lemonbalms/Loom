/**
 * PLAN 0.35.0 P3 — `loadMemorySnapshot` (D5 · D8 · R10 · R11 · R53-M1 · deviation 9 follow-up).
 * Done-when (e): four sections in fixed order · absent file = no section, no header · all absent →
 * "" + sha256("") · hash == sha256(text) · deterministic (same bytes → same {text, hash, flags}) ·
 * shuffled entries.jsonl → same result · scope filter (project + room:<roomKey>) · retired /
 * proposed / hidden excluded · newest first · Memory 16 KiB whole-entry cap + omitted line ·
 * persona / INDEX / guideline byte-cap truncation on a code-point boundary + marker + flag ·
 * symlink / non-regular → readErrors · entries.jsonl > 4 MiB → entriesOversize · no timestamps ·
 * ESC / CR stripped · secret shapes → [REDACTED] + redactedOnRead · process.env never consulted ·
 * zero writes · bad arguments → TypeError · no production file imports memory-snapshot.
 * Deviation 9 follow-up: snapshot text identical before / after compactMemory on an A←B←C approved
 * chain and on a rejected-proposal case.
 * Every store lives under a fresh mkdtemp loomDir passed explicitly; run with HOME and
 * LOOM_TEST_HOME both pointing at a temp dir (R16).
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import {
  loadMemorySnapshot,
  SNAPSHOT_ENTRIES_READ_MAX_BYTES,
  SNAPSHOT_GUIDELINE_MAX_BYTES,
  SNAPSHOT_INDEX_MAX_BYTES,
  SNAPSHOT_MEMORY_MAX_BYTES,
  SNAPSHOT_PERSONA_MAX_BYTES,
} from "./memory-snapshot";
import {
  appendMemoryEntry,
  appendMemoryTransition,
  compactMemory,
  humanMemorySource,
  type MemoryWriteDeps,
} from "./memory-store";
import { roomKey } from "./room-event-log";

const AGENT = "claude.default";
const RK = roomKey("room-1");
const OTHER = roomKey("room-2");
const ID = (n: number) => `mem_${n.toString(16).padStart(16, "0")}`;
const SRC = { kind: "human", by: "Kim" };
const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const EMPTY_SHA = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

type EntryOpts = {
  type?: string;
  appliesTo?: string;
  body?: string;
  status?: string;
  supersedes?: string | null;
  at?: string;
};

function entry(n: number, seq: number, o: EntryOpts = {}): string {
  return JSON.stringify({
    v: 1,
    kind: "entry",
    id: ID(n),
    seq,
    type: o.type ?? "fact",
    appliesTo: o.appliesTo ?? "project",
    body: o.body ?? `body ${n}`,
    source: SRC,
    status: o.status ?? "active",
    supersedes: o.supersedes ?? null,
    ...(o.at !== undefined ? { at: o.at } : {}),
  });
}

function trans(n: number, seq: number, to: "active" | "retired"): string {
  return JSON.stringify({ v: 1, kind: "transition", id: ID(n), seq, to, source: SRC });
}

function watermark(seq: number): string {
  return JSON.stringify({ v: 1, kind: "compact", seq });
}

let L: string;

beforeEach(() => {
  L = mkdtempSync(join(tmpdir(), "loom-mem-p3-"));
});

afterEach(() => {
  rmSync(L, { recursive: true, force: true });
});

const agentDir = (loomDir = L, agent = AGENT) => join(loomDir, "memory", agent);
const personaPath = (loomDir = L) => join(agentDir(loomDir), "persona.md");
const entriesPath = (loomDir = L) => join(agentDir(loomDir), "entries.jsonl");
const indexPath = (loomDir = L) => join(loomDir, "knowledge", "INDEX.md");
const guidelinePath = (loomDir = L, rk = RK) => join(loomDir, "rooms", rk, "guideline.md");

function put(path: string, data: string | Buffer): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, data);
}

function putEntries(lines: readonly string[], loomDir = L): void {
  put(entriesPath(loomDir), lines.map((l) => `${l}\n`).join(""));
}

function snap(loomDir = L, agent = AGENT, rk = RK) {
  return loadMemorySnapshot(loomDir, agent, rk);
}

/** Every path under `root` with mode, size, mtime and link-ness (zero-writes check). */
function tree(root: string): string[] {
  const out: string[] = [];
  const go = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      const st = lstatSync(p);
      out.push(
        `${relative(root, p)}|${st.mode}|${st.size}|${st.mtimeMs}|${st.isSymbolicLink() ? "L" : ""}`,
      );
      if (st.isDirectory() && !st.isSymbolicLink()) go(p);
    }
  };
  go(root);
  return out;
}

/** mulberry32 — fixed-seed PRNG for the shuffle property. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(xs: readonly T[], rnd: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const EMPTY_FLAGS = {
  truncated: { persona: false, index: false, guideline: false, entries: false },
  entriesOversize: false,
  readErrors: 0,
  redactedOnRead: 0,
  counts: { visibleActive: 0, included: 0, proposed: 0, retired: 0 },
  unparseable: 0,
  conflicts: 0,
  dangling: 0,
  archivedRefs: 0,
};

describe("constants (D5 · R10)", () => {
  test("caps", () => {
    expect(SNAPSHOT_PERSONA_MAX_BYTES).toBe(8192);
    expect(SNAPSHOT_INDEX_MAX_BYTES).toBe(8192);
    expect(SNAPSHOT_GUIDELINE_MAX_BYTES).toBe(16384);
    expect(SNAPSHOT_MEMORY_MAX_BYTES).toBe(16384);
    expect(SNAPSHOT_ENTRIES_READ_MAX_BYTES).toBe(4 * 1024 * 1024);
  });
});

describe("sections · hash · determinism (D8 · R10 · R11)", () => {
  test("all four sections in fixed order, exact text", () => {
    put(personaPath(), "I am careful.\n");
    put(indexPath(), "- topic-a.md: about A\n");
    put(guidelinePath(), "Be brief.\n");
    putEntries([
      entry(1, 1, { body: "first" }),
      entry(2, 2, { type: "decision", appliesTo: `room:${RK}`, body: "second\nline two" }),
      entry(3, 3, { appliesTo: `room:${OTHER}`, body: "other room" }),
      entry(4, 4, { status: "proposed", body: "not yet" }),
      entry(5, 5, { type: "preference", body: "fifth" }),
    ]);
    const s = snap();
    expect(s.text).toBe(
      [
        "## Persona",
        "I am careful.",
        "",
        "## Knowledge index",
        "- topic-a.md: about A",
        "",
        "## Room guideline",
        "Be brief.",
        "",
        "## Memory",
        `- [preference] (${ID(5)}) fifth`,
        `- [decision] (${ID(2)}) second`,
        "  line two",
        `- [fact] (${ID(1)}) first`,
        "",
      ].join("\n"),
    );
    expect(s.hash).toBe(sha256(s.text));
    expect(s.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(s.flags.counts).toEqual({ visibleActive: 3, included: 3, proposed: 1, retired: 0 });
  });

  test('nothing on disk (loomDir absent) → empty text, sha256(""), zero flags', () => {
    const missing = join(L, "nope");
    const s = snap(missing);
    expect(s.text).toBe("");
    expect(s.hash).toBe(EMPTY_SHA);
    expect(s.flags).toEqual(EMPTY_FLAGS);
  });

  test("empty loomDir → empty text", () => {
    const s = snap();
    expect(s).toEqual({ text: "", hash: EMPTY_SHA, flags: EMPTY_FLAGS });
  });

  test("absent files omit their section entirely (no header)", () => {
    put(guidelinePath(), "Only the room rule.\n");
    expect(snap().text).toBe("## Room guideline\nOnly the room rule.\n");

    rmSync(join(L, "rooms"), { recursive: true });
    put(indexPath(), "idx\n");
    putEntries([entry(1, 1, { body: "m" })]);
    expect(snap().text).toBe(`## Knowledge index\nidx\n\n## Memory\n- [fact] (${ID(1)}) m\n`);
  });

  test("empty / newline-only human file → section omitted (deviation)", () => {
    put(personaPath(), "");
    put(indexPath(), "\n\n");
    expect(snap().text).toBe("");
  });

  test("no in-scope visible entry → no Memory section", () => {
    putEntries([
      entry(1, 1, { appliesTo: `room:${OTHER}` }),
      entry(2, 2, { status: "proposed" }),
      entry(3, 3, { status: "retired" }),
    ]);
    const s = snap();
    expect(s.text).toBe("");
    expect(s.flags.counts).toEqual({ visibleActive: 0, included: 0, proposed: 1, retired: 1 });
  });

  test("hash == sha256(UTF-8 text) with multibyte content", () => {
    put(personaPath(), "한글 페르소나 😀\n");
    const s = snap();
    expect(s.text).toBe("## Persona\n한글 페르소나 😀\n");
    expect(s.hash).toBe(createHash("sha256").update(Buffer.from(s.text, "utf8")).digest("hex"));
  });

  test("same bytes twice → identical {text, hash, flags}", () => {
    put(personaPath(), "p\n");
    put(guidelinePath(), "g\n");
    putEntries([entry(1, 1), entry(2, 2, { appliesTo: `room:${RK}` }), "{torn"]);
    const a = snap();
    const b = snap();
    expect(b).toEqual(a);
    expect(b.text).toBe(a.text);
  });

  test("other room's guideline is not read", () => {
    put(guidelinePath(L, OTHER), "other\n");
    expect(snap().text).toBe("");
  });

  test("other agent's persona / entries are not read", () => {
    mkdirSync(agentDir(L, "codex.default"), { recursive: true });
    writeFileSync(join(agentDir(L, "codex.default"), "persona.md"), "codex persona\n");
    writeFileSync(join(agentDir(L, "codex.default"), "entries.jsonl"), `${entry(1, 1)}\n`);
    expect(snap().text).toBe("");
    expect(snap(L, "codex.default").text).toContain("codex persona");
  });
});

describe("Memory section — scope · status · order (D6 · D8 · R53-M1)", () => {
  test("project + this room only; retired · proposed · hidden excluded; newest first", () => {
    putEntries([
      entry(1, 1, { body: "A project" }),
      entry(2, 2, { appliesTo: `room:${RK}`, body: "B room" }),
      entry(3, 3, { appliesTo: `room:${OTHER}`, body: "C other room" }),
      entry(4, 4, { body: "D retired later" }),
      trans(4, 5, "retired"),
      entry(6, 6, { status: "proposed", body: "F proposed" }),
      entry(7, 7, { body: "G superseded" }),
      entry(8, 8, { body: "H replaces G", supersedes: ID(7) }),
      entry(9, 9, { status: "proposed", body: "I proposed replaces A", supersedes: ID(1) }),
      entry(10, 10, { status: "proposed", body: "J approved" }),
      trans(10, 11, "active"),
    ]);
    const s = snap();
    expect(s.text).toBe(
      [
        "## Memory",
        `- [fact] (${ID(10)}) J approved`,
        `- [fact] (${ID(8)}) H replaces G`,
        `- [fact] (${ID(2)}) B room`,
        `- [fact] (${ID(1)}) A project`,
        "",
      ].join("\n"),
    );
    expect(s.flags.counts).toEqual({ visibleActive: 4, included: 4, proposed: 2, retired: 1 });
  });

  test("a retired supersessor still hides its target (R53-M1); a rejected proposal does not", () => {
    putEntries([
      entry(1, 1, { body: "A" }),
      entry(2, 2, { body: "B replaces A", supersedes: ID(1) }),
      trans(2, 3, "retired"),
      entry(3, 4, { body: "C" }),
      entry(4, 5, { status: "proposed", body: "D rejected replaces C", supersedes: ID(3) }),
      trans(4, 6, "retired"),
    ]);
    expect(snap().text).toBe(`## Memory\n- [fact] (${ID(3)}) C\n`);
  });

  test("equal seq → id descending (newest-first is (seq, id) descending)", () => {
    putEntries([entry(1, 5, { body: "one" }), entry(2, 5, { body: "two" })]);
    expect(snap().text).toBe(`## Memory\n- [fact] (${ID(2)}) two\n- [fact] (${ID(1)}) one\n`);
  });

  test("multi-line body: continuation lines indented two spaces", () => {
    putEntries([entry(1, 1, { type: "decision", body: "l1\nl2\n\nl4" })]);
    expect(snap().text).toBe(`## Memory\n- [decision] (${ID(1)}) l1\n  l2\n  \n  l4\n`);
  });

  test("fold counters surface in flags", () => {
    putEntries([
      entry(1, 1),
      "not json",
      entry(2, 2, { body: "x" }),
      entry(2, 2, { body: "y" }),
      trans(9, 3, "active"),
    ]);
    const f = snap().flags;
    expect(f.unparseable).toBe(1);
    expect(f.conflicts).toBe(1);
    expect(f.dangling).toBe(1);
    expect(f.archivedRefs).toBe(0);
  });

  test("archived supersedes target → archivedRefs, entry still included", () => {
    putEntries([watermark(5), entry(6, 6, { body: "keeps", supersedes: ID(1) })]);
    const s = snap();
    expect(s.text).toBe(`## Memory\n- [fact] (${ID(6)}) keeps\n`);
    expect(s.flags.archivedRefs).toBe(1);
    expect(s.flags.dangling).toBe(0);
  });
});

describe("shuffle invariance (Done-when (b) — P3 half)", () => {
  test("permuted entries.jsonl lines → identical {text, hash, flags}", () => {
    const lines = [
      watermark(3),
      entry(4, 4, { body: "project fact" }),
      entry(5, 5, { appliesTo: `room:${RK}`, type: "decision", body: "room decision\nsecond" }),
      entry(6, 6, { appliesTo: `room:${OTHER}`, body: "elsewhere" }),
      entry(7, 7, { status: "proposed", body: "pending" }),
      trans(7, 8, "active"),
      entry(9, 9, { body: "old" }),
      entry(10, 10, { body: "new", supersedes: ID(9) }),
      entry(11, 11, { body: "refers to archive", supersedes: ID(1) }),
      entry(12, 12, { body: "to retire" }),
      trans(12, 13, "retired"),
      entry(14, 14, { body: "conflict a" }),
      entry(14, 14, { body: "conflict b" }),
      entry(15, 15, { body: "dup copy" }),
      entry(15, 15, { body: "dup copy" }),
      trans(99, 16, "retired"),
      "{torn",
      entry(17, 17, { status: "proposed", body: "rejected", supersedes: ID(4) }),
      trans(17, 18, "retired"),
      entry(19, 19, { body: "token: abc123 is fine here" }),
      entry(20, 20, { body: "same seq A" }),
      entry(21, 20, { body: "same seq B" }),
    ];
    put(personaPath(), "persona\n");
    putEntries(lines);
    const base = snap();
    expect(base.text).toContain("## Memory");
    expect(base.flags.unparseable).toBe(1);
    expect(base.flags.conflicts).toBe(1);
    const rnd = prng(0x35003);
    for (let i = 0; i < 50; i++) {
      putEntries(shuffled(lines, rnd));
      const s = snap();
      expect(s.text).toBe(base.text);
      expect(s.hash).toBe(base.hash);
      expect(s.flags).toEqual(base.flags);
    }
  });
});

describe("Memory 16 KiB whole-entry cap (R10)", () => {
  test("stops at the first entry that does not fit; omitted line; flag", () => {
    const n = 20;
    const body = "x".repeat(1900);
    putEntries(Array.from({ length: n }, (_, i) => entry(i + 1, i + 1, { body })));
    const s = snap();
    // expected k: newest-first lines joined by "\n", total bytes ≤ cap
    let acc = 0;
    let k = 0;
    for (let i = n; i >= 1; i--) {
      const add = Buffer.byteLength(`- [fact] (${ID(i)}) ${body}`) + (k > 0 ? 1 : 0);
      if (acc + add > SNAPSHOT_MEMORY_MAX_BYTES) break;
      acc += add;
      k += 1;
    }
    expect(k).toBeGreaterThan(0);
    expect(k).toBeLessThan(n);
    const lines = s.text.split("\n");
    expect(lines[0]).toBe("## Memory");
    const rendered = lines.slice(1, 1 + k);
    expect(rendered[0]).toBe(`- [fact] (${ID(n)}) ${body}`);
    expect(rendered[k - 1]).toBe(`- [fact] (${ID(n - k + 1)}) ${body}`);
    expect(Buffer.byteLength(rendered.join("\n"))).toBeLessThanOrEqual(SNAPSHOT_MEMORY_MAX_BYTES);
    expect(lines[1 + k]).toBe(`- … ${n - k} older entries omitted`);
    expect(s.text.endsWith(`- … ${n - k} older entries omitted\n`)).toBe(true);
    expect(s.flags.truncated.entries).toBe(true);
    expect(s.flags.counts.included).toBe(k);
    expect(s.flags.counts.visibleActive).toBe(n);
  });

  test("everything fits → no omitted line, flag false", () => {
    putEntries([entry(1, 1), entry(2, 2)]);
    const s = snap();
    expect(s.text).not.toContain("omitted");
    expect(s.flags.truncated.entries).toBe(false);
  });
});

describe("byte-cap truncation (D5 · R10)", () => {
  test("persona 8193 B → first 8192 B + marker + flag", () => {
    put(personaPath(), "a".repeat(8193));
    const s = snap();
    expect(s.text).toBe(`## Persona\n${"a".repeat(8192)}\n[truncated at 8192 bytes]\n`);
    expect(s.flags.truncated).toEqual({
      persona: true,
      index: false,
      guideline: false,
      entries: false,
    });
  });

  test("persona exactly 8192 B → untouched", () => {
    put(personaPath(), "a".repeat(8192));
    const s = snap();
    expect(s.text).toBe(`## Persona\n${"a".repeat(8192)}\n`);
    expect(s.flags.truncated.persona).toBe(false);
  });

  test("INDEX.md 8193 B → cut at 8192", () => {
    put(indexPath(), "i".repeat(8193));
    const s = snap();
    expect(s.text).toBe(`## Knowledge index\n${"i".repeat(8192)}\n[truncated at 8192 bytes]\n`);
    expect(s.flags.truncated.index).toBe(true);
  });

  test("guideline 16385 B → cut at 16384", () => {
    put(guidelinePath(), "g".repeat(16385));
    const s = snap();
    expect(s.text).toBe(`## Room guideline\n${"g".repeat(16384)}\n[truncated at 16384 bytes]\n`);
    expect(s.flags.truncated.guideline).toBe(true);
  });

  test("multibyte boundary: 3-byte chars never split", () => {
    put(personaPath(), "가".repeat(2731)); // 8193 B
    const s = snap();
    expect(s.text).toBe(`## Persona\n${"가".repeat(2730)}\n[truncated at 8192 bytes]\n`);
    expect(s.text).not.toContain("�");
  });

  test("multibyte boundary: 4-byte chars never split", () => {
    put(personaPath(), `a${"😀".repeat(2048)}`); // 8193 B
    const s = snap();
    expect(s.text).toBe(`## Persona\na${"😀".repeat(2047)}\n[truncated at 8192 bytes]\n`);
    expect(s.text).not.toContain("�");
    expect(Buffer.from(s.text, "utf8").toString("utf8")).toBe(s.text);
  });

  test("truncation measured after sanitize: ESC bytes do not count", () => {
    put(personaPath(), `${"\x1b[31m".repeat(100)}${"a".repeat(8192)}`);
    const s = snap();
    expect(s.text).toBe(`## Persona\n${"a".repeat(8192)}\n`);
    expect(s.flags.truncated.persona).toBe(false);
  });

  test("invalid UTF-8 bytes decode to U+FFFD, no throw", () => {
    put(personaPath(), Buffer.from([0x61, 0xff, 0xfe, 0x62, 0x0a]));
    expect(snap().text).toBe("## Persona\na��b\n");
  });
});

describe("unsafe paths · oversize (② 경로 · R10)", () => {
  test("persona.md symlink → readErrors, section omitted, rest intact", () => {
    put(join(L, "elsewhere.md"), "outside\n");
    mkdirSync(agentDir(), { recursive: true });
    symlinkSync(join(L, "elsewhere.md"), personaPath());
    putEntries([entry(1, 1, { body: "m" })]);
    const s = snap();
    expect(s.text).toBe(`## Memory\n- [fact] (${ID(1)}) m\n`);
    expect(s.flags.readErrors).toBe(1);
  });

  test("entries.jsonl symlink → readErrors, no Memory section", () => {
    put(join(L, "real.jsonl"), `${entry(1, 1)}\n`);
    put(personaPath(), "p\n");
    symlinkSync(join(L, "real.jsonl"), entriesPath());
    const s = snap();
    expect(s.text).toBe("## Persona\np\n");
    expect(s.flags.readErrors).toBe(1);
  });

  test("knowledge dir symlink → readErrors 1", () => {
    put(join(L, "realknow", "INDEX.md"), "idx\n");
    symlinkSync(join(L, "realknow"), join(L, "knowledge"));
    const s = snap();
    expect(s.text).toBe("");
    expect(s.flags.readErrors).toBe(1);
  });

  test("rooms/<roomKey> dir symlink → readErrors 1", () => {
    put(join(L, "realroom", "guideline.md"), "g\n");
    mkdirSync(join(L, "rooms"), { recursive: true });
    symlinkSync(join(L, "realroom"), join(L, "rooms", RK));
    const s = snap();
    expect(s.text).toBe("");
    expect(s.flags.readErrors).toBe(1);
  });

  test("memory/<agentKey> dir symlink → persona and entries both readErrors (2)", () => {
    put(join(L, "realagent", "persona.md"), "p\n");
    writeFileSync(join(L, "realagent", "entries.jsonl"), `${entry(1, 1)}\n`);
    mkdirSync(join(L, "memory"), { recursive: true });
    symlinkSync(join(L, "realagent"), agentDir());
    const s = snap();
    expect(s.text).toBe("");
    expect(s.flags.readErrors).toBe(2);
  });

  test("memory/ dir symlink → readErrors 2", () => {
    put(join(L, "realmem", AGENT, "persona.md"), "p\n");
    symlinkSync(join(L, "realmem"), join(L, "memory"));
    const s = snap();
    expect(s.text).toBe("");
    expect(s.flags.readErrors).toBe(2);
  });

  test("persona.md is a directory → readErrors 1", () => {
    mkdirSync(personaPath(), { recursive: true });
    const s = snap();
    expect(s.text).toBe("");
    expect(s.flags.readErrors).toBe(1);
  });

  test("loomDir itself may be a symlink", () => {
    put(personaPath(), "p\n");
    const link = `${L}-link`;
    symlinkSync(L, link);
    try {
      const s = snap(link);
      expect(s.text).toBe("## Persona\np\n");
      expect(s.flags.readErrors).toBe(0);
    } finally {
      rmSync(link, { force: true });
    }
  });

  test("entries.jsonl > 4 MiB → entriesOversize, Memory omitted, other sections kept", () => {
    put(personaPath(), "p\n");
    const head = `${entry(1, 1)}\n`;
    const pad = "\n".repeat(SNAPSHOT_ENTRIES_READ_MAX_BYTES + 1 - head.length);
    put(entriesPath(), head + pad);
    const s = snap();
    expect(s.text).toBe("## Persona\np\n");
    expect(s.flags.entriesOversize).toBe(true);
    expect(s.flags.counts).toEqual({ visibleActive: 0, included: 0, proposed: 0, retired: 0 });
  });

  test("entries.jsonl exactly 4 MiB → read normally", () => {
    const head = `${entry(1, 1, { body: "m" })}\n`;
    put(entriesPath(), head + "\n".repeat(SNAPSHOT_ENTRIES_READ_MAX_BYTES - head.length));
    const s = snap();
    expect(s.flags.entriesOversize).toBe(false);
    expect(s.text).toBe(`## Memory\n- [fact] (${ID(1)}) m\n`);
  });
});

describe("content hygiene (R10 · D8 — no timestamps · sanitize · redact · pure)", () => {
  test("no ISO timestamps in text even when lines carry `at`", () => {
    putEntries([
      entry(1, 1, { at: "2026-10-16T12:00:00.000Z", body: "a" }),
      entry(2, 2, { at: "2026-10-16T12:00:01.000Z", body: "b" }),
    ]);
    const s = snap();
    expect(s.text).toContain("## Memory");
    expect(s.text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    expect(s.text).not.toContain("2026");
  });

  test("ESC sequences and CR removed from human files", () => {
    put(personaPath(), "line1\x1b[31mred\x1b[0m\r\nline2\x07\r\n");
    const s = snap();
    expect(s.text).toBe("## Persona\nline1red\nline2\n");
    expect(s.text).not.toContain("\x1b");
    expect(s.text).not.toContain("\r");
  });

  test("ESC and CR removed from hand-written entry bodies", () => {
    putEntries([entry(1, 1, { body: "a\x1b[1mb\r\nc" })]);
    const s = snap();
    expect(s.text).toBe(`## Memory\n- [fact] (${ID(1)}) ab\n  c\n`);
  });

  test("secret shapes → [REDACTED] + redactedOnRead", () => {
    put(personaPath(), "key sk-ant-abcdefghijk12345 end\n");
    putEntries([entry(1, 1, { body: "token: abc123" }), entry(2, 2, { body: "clean" })]);
    const s = snap();
    expect(s.text).toContain("key [REDACTED] end");
    expect(s.text).toContain(`(${ID(1)}) token: [REDACTED]`);
    expect(s.text).not.toContain("sk-ant-abcdefghijk12345");
    expect(s.text).not.toContain("abc123");
    expect(s.flags.redactedOnRead).toBe(2);
  });

  test("process.env is never consulted (sensitive env value stays in text)", () => {
    const NAME = "LOOM_P3_SNAPSHOT_API_TOKEN";
    const VALUE = "plainvalue-zz9q";
    put(personaPath(), `value ${VALUE} here\n`);
    putEntries([entry(1, 1, { body: `entry ${VALUE}` })]);
    const before = process.env[NAME];
    delete process.env[NAME];
    const without = snap();
    process.env[NAME] = VALUE;
    let withEnv: ReturnType<typeof snap>;
    try {
      withEnv = snap();
    } finally {
      if (before === undefined) delete process.env[NAME];
      else process.env[NAME] = before;
    }
    expect(withEnv).toEqual(without);
    expect(withEnv.text).toContain(VALUE);
    expect(withEnv.flags.redactedOnRead).toBe(0);
  });
});

describe("zero writes · argument checks", () => {
  test("full fixture: directory tree identical before and after", () => {
    put(personaPath(), "p\n");
    put(indexPath(), "i\n");
    put(guidelinePath(), "g\n");
    putEntries([entry(1, 1), "{torn", entry(2, 2, { status: "proposed" })]);
    const before = tree(L);
    snap();
    snap(L, "codex.default", OTHER);
    expect(tree(L)).toEqual(before);
  });

  test("empty loomDir: no memory/ or lock dir created", () => {
    snap();
    snap(L, "grok.x.0123456789abcdef");
    expect(readdirSync(L)).toEqual([]);
  });

  test("absent loomDir is not created", () => {
    const missing = join(L, "absent");
    snap(missing);
    expect(readdirSync(L)).toEqual([]);
  });

  test("bad arguments → TypeError", () => {
    expect(() => loadMemorySnapshot("relative/dir", AGENT, RK)).toThrow(TypeError);
    expect(() => loadMemorySnapshot("", AGENT, RK)).toThrow(TypeError);
    expect(() => loadMemorySnapshot(L, "Claude.default", RK)).toThrow(TypeError);
    expect(() => loadMemorySnapshot(L, "claude", RK)).toThrow(TypeError);
    expect(() => loadMemorySnapshot(L, "../x", RK)).toThrow(TypeError);
    expect(() => loadMemorySnapshot(L, AGENT, "xyz")).toThrow(TypeError);
    expect(() => loadMemorySnapshot(L, AGENT, RK.toUpperCase())).toThrow(TypeError);
    expect(() => loadMemorySnapshot(L, AGENT, `${RK}0`)).toThrow(TypeError);
    expect(() => loadMemorySnapshot(L, AGENT, "room-1")).toThrow(TypeError);
  });

  test("garbage file contents never throw", () => {
    put(personaPath(), Buffer.from([0, 1, 2, 0xff, 0x1b, 0x9b]));
    put(entriesPath(), Buffer.from([0xff, 0x0a, 0x7b, 0x0a, 0x00]));
    expect(() => snap()).not.toThrow();
    expect(snap().flags.unparseable).toBe(3);
  });
});

describe("compact keeps the snapshot (deviation 9 follow-up · R53-M1)", () => {
  function deps(): MemoryWriteDeps {
    let n = 0xa000;
    return {
      env: {},
      randomId: () => ID(++n),
      now: () => new Date("2026-10-16T12:00:00.000Z"),
    };
  }
  const source = humanMemorySource("Kim");

  function add(
    d: MemoryWriteDeps,
    body: string,
    o: Partial<{ supersedes: string; status: "active" | "proposed"; appliesTo: string }> = {},
  ) {
    const r = appendMemoryEntry(
      L,
      AGENT,
      {
        body,
        type: "fact",
        appliesTo: o.appliesTo ?? "project",
        status: o.status ?? "active",
        supersedes: o.supersedes ?? null,
        source,
      },
      d,
    );
    if (!r.ok) throw new Error(r.message);
    return r.id;
  }

  test("A←B←C approved chain: text and hash identical before / after compact", () => {
    const d = deps();
    put(personaPath(), "persona\n");
    const a = add(d, "A first");
    const b = add(d, "B replaces A", { supersedes: a });
    add(d, "C replaces B", { supersedes: b });
    add(d, "room note", { appliesTo: `room:${RK}` });
    const before = snap();
    expect(before.text).toContain("C replaces B");
    expect(before.text).not.toContain("A first");
    expect(before.text).not.toContain("B replaces A");
    const c = compactMemory(L, AGENT);
    expect(c.ok).toBe(true);
    if (c.ok) expect(c.moved).toBeGreaterThan(0);
    const after = snap();
    expect(after.text).toBe(before.text);
    expect(after.hash).toBe(before.hash);
    expect(after.flags.archivedRefs).toBe(1);
    expect(after.flags.dangling).toBe(0);
  });

  test("rejected proposal (proposed → retired) superseding A: text identical before / after compact", () => {
    const d = deps();
    const a = add(d, "A stays");
    const p = add(d, "P rejected", { supersedes: a, status: "proposed" });
    const r = appendMemoryTransition(L, AGENT, { id: p, to: "retired", source });
    expect(r.ok).toBe(true);
    const before = snap();
    expect(before.text).toContain("A stays");
    expect(before.text).not.toContain("P rejected");
    const c = compactMemory(L, AGENT);
    expect(c.ok).toBe(true);
    if (c.ok) expect(c.moved).toBeGreaterThan(0);
    const after = snap();
    expect(after.text).toBe(before.text);
    expect(after.hash).toBe(before.hash);
  });
});

describe("not wired (D1 · D8 — production import 0)", () => {
  test("no production file imports memory-snapshot", () => {
    const repo = join(import.meta.dir, "..", "..", "..");
    const offenders: string[] = [];
    const skip = new Set(["node_modules", "dist", ".git"]);
    const walk = (d: string) => {
      for (const name of readdirSync(d)) {
        if (skip.has(name)) continue;
        const p = join(d, name);
        const st = lstatSync(p);
        if (st.isSymbolicLink()) continue;
        if (st.isDirectory()) {
          walk(p);
          continue;
        }
        if (!/\.(ts|tsx|js|mjs)$/.test(name) || /\.test\.ts$/.test(name)) continue;
        const rel = relative(repo, p);
        if (rel === join("packages", "host", "src", "memory-snapshot.ts")) continue;
        if (readFileSync(p, "utf8").includes("memory-snapshot")) offenders.push(rel);
      }
    };
    walk(join(repo, "packages"));
    walk(join(repo, "scripts"));
    expect(offenders).toEqual([]);
    expect(lstatSync(join(repo, "packages", "host", "src", "memory-snapshot.ts")).isFile()).toBe(
      true,
    );
  });
});

describe("P3 verify — read prefix · lone surrogates (L1 · L2)", () => {
  const MiB = 1024 * 1024;

  test("human file > 1 MiB: cut at the read prefix → truncated flag + marker, tail absent", () => {
    put(
      personaPath(),
      Buffer.concat([Buffer.from("head\n"), Buffer.alloc(MiB), Buffer.from("TAIL")]),
    );
    const s = snap();
    expect(s.flags.truncated.persona).toBe(true);
    expect(s.text).not.toContain("TAIL");
    expect(s.text).toBe(`## Persona\nhead\n[truncated at ${MiB} bytes]\n`);
  });

  test("multibyte char straddling the 1 MiB read prefix → no U+FFFD", () => {
    const head = Buffer.concat([Buffer.from("x"), Buffer.alloc(MiB - 2)]);
    put(personaPath(), Buffer.concat([head, Buffer.from("가나")]));
    const s = snap();
    expect(s.text).not.toContain("\uFFFD");
    expect(s.text).not.toContain("가");
    expect(s.flags.truncated.persona).toBe(true);
  });

  test("lone surrogate escape in a hand-edited entry body → well-formed text", () => {
    putEntries([entry(1, 1, { body: "a\ud83db" }), entry(2, 2, { body: "c\udc00" })]);
    const s = snap();
    expect(Buffer.from(s.text, "utf8").toString("utf8")).toBe(s.text);
    expect(s.text).toContain("a\uFFFDb");
    expect(s.text).toContain("c\uFFFD");
    expect(s.hash).toBe(sha256(s.text));
  });
});

describe("P3 verify — Memory cap boundary · break semantics · counts (L6)", () => {
  const prefix = (n: number) => Buffer.byteLength(`- [fact] (${ID(n)}) `);

  /** 9 entries whose rendered lines + 8 separators total exactly 16384 B (+extra on the oldest). */
  function nineAtCap(extra: number): void {
    const big = "x".repeat(1800);
    const lines: string[] = [];
    let used = 0;
    for (let i = 9; i >= 2; i--) {
      lines.push(entry(i, i, { body: big }));
      used += prefix(i) + big.length + 1;
    }
    const last = SNAPSHOT_MEMORY_MAX_BYTES - used - prefix(1) + extra;
    lines.push(entry(1, 1, { body: "y".repeat(last) }));
    putEntries(lines);
  }

  test("exactly 16384 B (newline separators counted) → all included, no omitted line", () => {
    nineAtCap(0);
    const s = snap();
    expect(s.flags.counts.included).toBe(9);
    expect(s.flags.truncated.entries).toBe(false);
    expect(s.text).not.toContain("omitted");
    const body = s.text.slice("## Memory\n".length, -1);
    expect(Buffer.byteLength(body)).toBe(SNAPSHOT_MEMORY_MAX_BYTES);
  });

  test("16385 B → oldest omitted", () => {
    nineAtCap(1);
    const s = snap();
    expect(s.flags.counts.included).toBe(8);
    expect(s.flags.truncated.entries).toBe(true);
    expect(s.text.endsWith("- … 1 older entries omitted\n")).toBe(true);
  });

  test("stops at the first entry that does not fit — a smaller older entry is not included", () => {
    const big = "x".repeat(1900);
    const lines: string[] = [];
    for (let i = 10; i >= 3; i--) lines.push(entry(i, i, { body: big }));
    lines.push(entry(2, 2, { body: "z".repeat(2000) }));
    lines.push(entry(1, 1, { body: "tiny" }));
    putEntries(lines);
    const s = snap();
    expect(s.text).not.toContain("tiny");
    expect(s.flags.counts.included).toBe(8);
    expect(s.text.endsWith("- … 2 older entries omitted\n")).toBe(true);
  });

  test("out-of-scope proposed / retired entries are not counted", () => {
    putEntries([
      entry(1, 1, { appliesTo: `room:${OTHER}`, status: "proposed" }),
      entry(2, 2, { appliesTo: `room:${OTHER}`, status: "retired" }),
      entry(3, 3, { appliesTo: `room:${OTHER}` }),
      trans(3, 4, "retired"),
      entry(5, 5, { appliesTo: `room:${RK}`, status: "proposed" }),
      entry(6, 6, { status: "retired" }),
    ]);
    expect(snap().flags.counts).toEqual({
      visibleActive: 0,
      included: 0,
      proposed: 1,
      retired: 1,
    });
  });

  test("a redacted entry that is omitted is not counted in redactedOnRead", () => {
    const big = "x".repeat(1900);
    const lines: string[] = [entry(1, 1, { body: "token: abc123" })];
    for (let i = 2; i <= 12; i++) lines.push(entry(i, i, { body: big }));
    putEntries(lines);
    const s = snap();
    expect(s.text).not.toContain("token:");
    expect(s.flags.truncated.entries).toBe(true);
    expect(s.flags.redactedOnRead).toBe(0);
  });
});
