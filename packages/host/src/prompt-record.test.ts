/**
 * PLAN 0.41.0 P1 — prompt record module (D2 · D9 · R2 · R3 · R5 · R6 · R60-M2 · R60-L2 · R60-L3).
 * - `buildPromptRecord`: fixed key order (dispatchHandoffId right after attempt), the six channel
 *   literals, `userArgv` = RESUME_CONTINUATION_MESSAGE on codex resume only (last key),
 *   `user` = `toWellFormed()`, `userSha256` = independently computed sha256 of the UTF-8 bytes.
 * - serialisation: `JSON.stringify(record, null, 2) + "\n"` with DEL · C1 · bidi controls escaped —
 *   no raw U+007F · U+0080–U+009F · U+202A–202E · U+2066–2069 in the file, same parsed value.
 * - write: 0600 · no temp file left · last write wins · unwritable directory throws.
 * - `writePrivateFileAtomic`: temp name prefix `.memory-snapshot.md.tmp.` for that target (R5).
 * - read: missing / invalid shapes / not a regular file / > 8 MiB (content not read) · reasons
 *   carry no file content.
 * The module is loaded with a dynamic import so each case reports on its own.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  chmodSync,
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
import { HEADLESS_WORKER_HINT, RESUME_CONTINUATION_MESSAGE } from "./agent-argv";

const pr = () => import("./prompt-record");

const roots: string[] = [];
function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), "loom-prompt-record-"));
  roots.push(d);
  return d;
}
afterAll(() => {
  for (const d of roots) {
    try {
      chmodSync(d, 0o700);
    } catch {}
    rmSync(d, { recursive: true, force: true });
  }
});

const BASE_KEYS = [
  "version",
  "agent",
  "turn",
  "attempt",
  "dispatchHandoffId",
  "fingerprint",
  "systemChannel",
  "system",
  "userChannel",
  "user",
  "userSha256",
];

const CHANNELS = {
  claude: { system: "claude --append-system-prompt", user: "stdin" },
  codex: { system: "codex -c developer_instructions", user: "stdin" },
  grok: { system: "grok --rules", user: "grok --prompt-file" },
} as const;

type Agent = "claude" | "codex" | "grok";
type Turn = "first" | "resume";

const FP = "a".repeat(64);

function sha(text: string): string {
  return createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
}

async function build(agent: Agent, turn: Turn, user: string, attempt = turn === "first" ? 1 : 2) {
  const { buildPromptRecord } = await pr();
  return buildPromptRecord({
    agent,
    turn,
    attempt,
    dispatchHandoffId: "h-1",
    fingerprint: FP,
    system: HEADLESS_WORKER_HINT,
    user,
  });
}

const RAW_UNSAFE = /[\u007f\u0080-\u009f‪-‮⁦-⁩]/u;

describe("buildPromptRecord — keys · channels · userArgv · sha (D2 · R2 · R3)", () => {
  for (const agent of ["claude", "codex", "grok"] as const) {
    for (const turn of ["first", "resume"] as const) {
      test(`${agent} ${turn}: key order verbatim · channels · values`, async () => {
        const user = `${turn === "resume" ? `${RESUME_CONTINUATION_MESSAGE}\n\n` : ""}body ✓ 한글`;
        const rec = await build(agent, turn, user);
        const codexResume = agent === "codex" && turn === "resume";
        expect(Object.keys(rec)).toEqual(codexResume ? [...BASE_KEYS, "userArgv"] : BASE_KEYS);
        expect(rec.version).toBe(1);
        expect(rec.agent).toBe(agent);
        expect(rec.turn).toBe(turn);
        expect(rec.attempt).toBe(turn === "first" ? 1 : 2);
        expect(rec.dispatchHandoffId).toBe("h-1");
        expect(rec.fingerprint).toBe(FP);
        expect(rec.systemChannel).toBe(CHANNELS[agent].system);
        expect(rec.system).toBe(HEADLESS_WORKER_HINT);
        expect(rec.userChannel).toBe(CHANNELS[agent].user);
        expect(rec.user).toBe(user);
        expect(rec.userSha256).toBe(sha(user));
        if (codexResume) {
          expect(rec.userArgv).toBe(RESUME_CONTINUATION_MESSAGE);
        } else {
          expect("userArgv" in rec).toBe(false);
        }
      });
    }
  }

  test("six channel literals", async () => {
    const seen = new Set<string>();
    for (const agent of ["claude", "codex", "grok"] as const) {
      const rec = await build(agent, "first", "x");
      seen.add(`${rec.systemChannel}|${rec.userChannel}`);
    }
    expect([...seen]).toEqual([
      "claude --append-system-prompt|stdin",
      "codex -c developer_instructions|stdin",
      "grok --rules|grok --prompt-file",
    ]);
  });

  test("user = toWellFormed(): a lone surrogate becomes U+FFFD and the sha matches the sent bytes", async () => {
    const raw = "a\ud800b";
    const rec = await build("claude", "first", raw);
    expect(rec.user).toBe("a�b");
    // What stdin / a utf8 file would carry for the raw string.
    const sent = Buffer.from(raw, "utf8");
    expect(sent.equals(Buffer.from("a�b", "utf8"))).toBe(true);
    expect(rec.userSha256).toBe(createHash("sha256").update(sent).digest("hex"));
  });
});

describe("serialisation (R6 · R60-L2)", () => {
  test("JSON.stringify(…, null, 2) + LF for plain text", async () => {
    const { serializePromptRecord } = await pr();
    const rec = await build("grok", "first", "plain body\nline 2\t✓");
    expect(serializePromptRecord(rec)).toBe(`${JSON.stringify(rec, null, 2)}\n`);
  });

  test("DEL · C1 · bidi are escaped — none raw in the bytes · parsed value equal", async () => {
    const { serializePromptRecord } = await pr();
    let all = "";
    for (let c = 0x7f; c <= 0x9f; c++) all += String.fromCharCode(c);
    for (let c = 0x202a; c <= 0x202e; c++) all += String.fromCharCode(c);
    for (let c = 0x2066; c <= 0x2069; c++) all += String.fromCharCode(c);
    const user = `esc \u001b[31m csi \u009b2J rlo ‮ end ${all}`;
    const rec = await build("codex", "resume", user);
    const text = serializePromptRecord(rec);
    expect(RAW_UNSAFE.test(text)).toBe(false);
    expect(text).toContain("\\u009b");
    expect(text).toContain("\\u202e");
    expect(text).toContain("\\u007f");
    expect(text).toContain("\\u001b");
    expect(text.endsWith("}\n")).toBe(true);
    expect(JSON.parse(text)).toEqual(rec);
    expect(Object.keys(JSON.parse(text))).toEqual([...BASE_KEYS, "userArgv"]);
  });
});

describe("writePromptRecord · readPromptRecord round trip (D2 · R6)", () => {
  test("non-ASCII · controls (U+009B · U+202E) · 60,000-char body round-trip", async () => {
    const { writePromptRecord, readPromptRecord, promptRecordPath, serializePromptRecord } = await pr();
    const dir = tempDir();
    const body = `${"한".repeat(30_000)}${"x\u009b‮\u0007".repeat(7_500)}`;
    expect(body.length).toBe(60_000);
    const rec = await build("claude", "first", body);
    await writePromptRecord(dir, rec);
    const path = promptRecordPath(dir, 1);
    expect(path).toBe(join(dir, "prompt-1.json"));
    const r = readPromptRecord(dir, 1);
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.record).toEqual(rec);
    expect(r.record.user).toBe(body);
    expect(Buffer.from(r.bytes).equals(readFileSync(path))).toBe(true);
    expect(readFileSync(path, "utf8")).toBe(serializePromptRecord(rec));
  });

  test("codex resume record with userArgv round-trips", async () => {
    const { writePromptRecord, readPromptRecord } = await pr();
    const dir = tempDir();
    const rec = await build("codex", "resume", `${RESUME_CONTINUATION_MESSAGE}\n\nbody`);
    await writePromptRecord(dir, rec);
    const r = readPromptRecord(dir, 2);
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.record).toEqual(rec);
  });
});

describe("write — 0600 · atomic · last wins · throws (D2 · R5 · R7)", () => {
  test("mode 0600 and no temp file left in the directory", async () => {
    const { writePromptRecord } = await pr();
    const dir = tempDir();
    await writePromptRecord(dir, await build("grok", "first", "b"));
    expect(statSync(join(dir, "prompt-1.json")).mode & 0o777).toBe(0o600);
    expect(readdirSync(dir)).toEqual(["prompt-1.json"]);
  });

  test("writing the same path twice keeps the last value", async () => {
    const { writePromptRecord, readPromptRecord } = await pr();
    const dir = tempDir();
    await writePromptRecord(dir, await build("claude", "first", "one"));
    await writePromptRecord(dir, await build("claude", "first", "two"));
    const r = readPromptRecord(dir, 1);
    expect(r.kind === "ok" && r.record.user).toBe("two");
    expect(readdirSync(dir)).toEqual(["prompt-1.json"]);
  });

  test("read-only directory → throws", async () => {
    const { writePromptRecord } = await pr();
    const dir = tempDir();
    chmodSync(dir, 0o500);
    try {
      await expect(writePromptRecord(dir, await build("claude", "first", "x"))).rejects.toThrow();
    } finally {
      chmodSync(dir, 0o700);
    }
    expect(readdirSync(dir)).toEqual([]);
  });

  test("rename onto an existing directory → throws and the temp file is removed", async () => {
    const { writePromptRecord } = await pr();
    const dir = tempDir();
    mkdirSync(join(dir, "prompt-1.json"));
    await expect(writePromptRecord(dir, await build("codex", "first", "x"))).rejects.toThrow();
    expect(readdirSync(dir)).toEqual(["prompt-1.json"]);
  });
});

describe("writePrivateFileAtomic — temp name compatible with memory-snapshot.md filters (R5)", () => {
  test("temp name is exactly `.memory-snapshot.md.tmp.<pid>.<ms>` for that target", async () => {
    const { writePrivateFileAtomic } = await pr();
    const dir = tempDir();
    const target = join(dir, "memory-snapshot.md");
    // Occupy every candidate temp name for the next few seconds: the `wx` open must hit one of
    // them (EEXIST), which proves the exact name shape. The occupiers are directories, so the
    // helper's cleanup cannot remove them and the target is never written.
    const start = Date.now();
    for (let t = start; t < start + 3000; t++) {
      mkdirSync(join(dir, `.memory-snapshot.md.tmp.${process.pid}.${t}`));
    }
    let code: unknown;
    try {
      await writePrivateFileAtomic(dir, target, "block");
    } catch (err) {
      code = (err as NodeJS.ErrnoException).code;
    }
    expect(code).toBe("EEXIST");
    expect(readdirSync(dir)).not.toContain("memory-snapshot.md");
  });

  test("rename failure removes the temp file", async () => {
    const { writePrivateFileAtomic } = await pr();
    const dir = tempDir();
    const target = join(dir, "memory-snapshot.md");
    mkdirSync(target);
    mkdirSync(join(target, "child"));
    await expect(writePrivateFileAtomic(dir, target, "block")).rejects.toThrow();
    expect(readdirSync(dir)).toEqual(["memory-snapshot.md"]);
  });

  test("successful write leaves only the target · 0600 · exact bytes", async () => {
    const { writePrivateFileAtomic } = await pr();
    const dir = tempDir();
    const target = join(dir, "memory-snapshot.md");
    await writePrivateFileAtomic(dir, target, "fence bytes ✓\n");
    expect(readdirSync(dir)).toEqual(["memory-snapshot.md"]);
    expect(readFileSync(target, "utf8")).toBe("fence bytes ✓\n");
    expect(statSync(target).mode & 0o777).toBe(0o600);
  });
});

describe("readPromptRecord — shape checks fail closed (R9 · R60-L3)", () => {
  async function goodText(attempt = 1): Promise<string> {
    const { serializePromptRecord } = await pr();
    return serializePromptRecord(await build("claude", "first", "SECRET-BODY", attempt));
  }
  function put(dir: string, attempt: number, text: string): void {
    writeFileSync(join(dir, `prompt-${attempt}.json`), text, { mode: 0o600 });
  }
  async function invalidReason(text: string, attempt = 1): Promise<string> {
    const { readPromptRecord } = await pr();
    const dir = tempDir();
    put(dir, attempt, text);
    const r = readPromptRecord(dir, attempt);
    expect(r.kind).toBe("invalid");
    if (r.kind !== "invalid") return "";
    return r.reason;
  }

  test("no file → missing", async () => {
    const { readPromptRecord } = await pr();
    expect(readPromptRecord(tempDir(), 1)).toEqual({ kind: "missing" });
  });

  test("broken JSON → invalid", async () => {
    const reason = await invalidReason('{"version": 1, "user": "SECRET-BODY"');
    expect(reason).not.toContain("SECRET-BODY");
  });

  test("non-object JSON → invalid", async () => {
    await invalidReason('["SECRET-BODY"]\n');
    await invalidReason("null\n");
  });

  test("version 2 → invalid", async () => {
    const o = JSON.parse(await goodText());
    o.version = 2;
    await invalidReason(JSON.stringify(o));
  });

  test("unknown key → invalid · the key name is not echoed", async () => {
    const o = JSON.parse(await goodText());
    o["SECRET-KEY"] = 1;
    const reason = await invalidReason(JSON.stringify(o));
    expect(reason).not.toContain("SECRET-KEY");
  });

  test("wrong types → invalid", async () => {
    const cases: Array<[string, unknown]> = [
      ["agent", "gpt"],
      ["turn", "middle"],
      ["attempt", "1"],
      ["fingerprint", 7],
      ["system", null],
      ["user", ["SECRET-BODY"]],
      ["userChannel", "pipe"],
      ["userSha256", false],
      ["dispatchHandoffId", 3],
    ];
    for (const [key, value] of cases) {
      const o = JSON.parse(await goodText());
      o[key] = value;
      const reason = await invalidReason(JSON.stringify(o));
      expect(reason).not.toContain("SECRET-BODY");
    }
  });

  test("dispatchHandoffId missing → invalid", async () => {
    const o = JSON.parse(await goodText());
    delete o.dispatchHandoffId;
    await invalidReason(JSON.stringify(o));
  });

  test("attempt mismatch → invalid", async () => {
    await invalidReason(await goodText(2), 1);
  });

  test("symlink → invalid: not a regular file", async () => {
    const { readPromptRecord } = await pr();
    const dir = tempDir();
    const real = join(dir, "elsewhere.json");
    writeFileSync(real, await goodText());
    symlinkSync(real, join(dir, "prompt-1.json"));
    expect(readPromptRecord(dir, 1)).toEqual({ kind: "invalid", reason: "not a regular file" });
  });

  test("directory → invalid: not a regular file", async () => {
    const { readPromptRecord } = await pr();
    const dir = tempDir();
    mkdirSync(join(dir, "prompt-1.json"));
    expect(readPromptRecord(dir, 1)).toEqual({ kind: "invalid", reason: "not a regular file" });
  });

  test("> 8 MiB → invalid: too large, without reading the content", async () => {
    const { readPromptRecord } = await pr();
    const dir = tempDir();
    const path = join(dir, "prompt-1.json");
    writeFileSync(path, Buffer.alloc(8 * 1024 * 1024 + 1, 0x7b));
    // Unreadable content: a read would fail with EACCES, so "too large" proves no read happened.
    chmodSync(path, 0o000);
    try {
      expect(readPromptRecord(dir, 1)).toEqual({ kind: "invalid", reason: "too large" });
    } finally {
      chmodSync(path, 0o600);
    }
  });

  test("exactly 8 MiB is not rejected for size", async () => {
    const { readPromptRecord } = await pr();
    const dir = tempDir();
    writeFileSync(join(dir, "prompt-1.json"), Buffer.alloc(8 * 1024 * 1024, 0x20));
    const r = readPromptRecord(dir, 1);
    expect(r.kind).toBe("invalid");
    if (r.kind === "invalid") expect(r.reason).not.toBe("too large");
  });

  test("FIFO → invalid: not a regular file, promptly (no blocking open)", async () => {
    if (process.platform === "win32") return;
    const { readPromptRecord } = await pr();
    const dir = tempDir();
    const fifo = join(dir, "prompt-1.json");
    const made = Bun.spawnSync(["mkfifo", fifo]);
    if (made.exitCode !== 0) return; // no mkfifo on this platform
    const started = Date.now();
    expect(readPromptRecord(dir, 1)).toEqual({ kind: "invalid", reason: "not a regular file" });
    expect(Date.now() - started).toBeLessThan(2000);
  });

  test("Astra 0088: the read goes through one fd (O_NOFOLLOW · O_NONBLOCK · fstat), never re-opens the path", () => {
    const src = readFileSync(join(import.meta.dir, "prompt-record.ts"), "utf8");
    expect(src).not.toContain("readFileSync(");
    expect(src).toContain("O_NOFOLLOW");
    expect(src).toContain("O_NONBLOCK");
    expect(src).toContain("fstatSync(");
    expect(src).toContain("closeSync(");
  });

  test("round trip still ok after the fd read", async () => {
    const { writePromptRecord, readPromptRecord, serializePromptRecord } = await pr();
    const dir = tempDir();
    const rec = await build("codex", "resume", "hello fd");
    await writePromptRecord(dir, rec);
    const r = readPromptRecord(dir, 2);
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.record).toEqual(rec);
    expect(r.bytes.toString("utf8")).toBe(serializePromptRecord(rec));
  });

  test("Astra 0094 #5: a record rewritten with plain JSON.stringify (raw U+009B) → invalid: not canonical", async () => {
    const { readPromptRecord } = await pr();
    const rec = await build("claude", "first", "esc \u009b[31m red");
    const dir = tempDir();
    put(dir, 1, `${JSON.stringify(rec, null, 2)}\n`);
    expect(readPromptRecord(dir, 1)).toEqual({ kind: "invalid", reason: "not canonical" });
  });

  test("Astra 0094 #5: compact JSON / reordered keys / trailing whitespace → invalid: not canonical", async () => {
    const { readPromptRecord, serializePromptRecord } = await pr();
    const rec = await build("codex", "resume", "plain body");
    const { user, ...rest } = rec;
    const reordered = { user, ...rest };
    for (const text of [
      JSON.stringify(rec),
      `${JSON.stringify(reordered, null, 2)}\n`,
      `${serializePromptRecord(rec)} `,
      serializePromptRecord(rec).trimEnd(),
    ]) {
      const dir = tempDir();
      put(dir, 2, text);
      expect(readPromptRecord(dir, 2)).toEqual({ kind: "invalid", reason: "not canonical" });
    }
  });
});

describe("readBoundedRegularFile — the generic fd-based bounded reader (Astra 0094 #2)", () => {
  test("regular file → its bytes · missing → missing", async () => {
    const { readBoundedRegularFile } = await pr();
    const dir = tempDir();
    const path = join(dir, "session.json");
    writeFileSync(path, "{\"a\":1}\n");
    const r = readBoundedRegularFile(path, 1024);
    expect(Buffer.isBuffer(r)).toBe(true);
    if (Buffer.isBuffer(r)) expect(r.toString("utf8")).toBe("{\"a\":1}\n");
    expect(readBoundedRegularFile(join(dir, "nope.json"), 1024)).toEqual({ kind: "missing" });
  });

  test("the cap is the caller's: size > maxBytes → too large · exactly maxBytes → bytes", async () => {
    const { readBoundedRegularFile } = await pr();
    const dir = tempDir();
    const path = join(dir, "s.json");
    writeFileSync(path, Buffer.alloc(17, 0x20));
    expect(readBoundedRegularFile(path, 16)).toEqual({ kind: "invalid", reason: "too large" });
    const r = readBoundedRegularFile(path, 17);
    expect(Buffer.isBuffer(r) && r.length === 17).toBe(true);
  });

  test("symlink · directory → not a regular file", async () => {
    const { readBoundedRegularFile } = await pr();
    const dir = tempDir();
    const real = join(dir, "real.json");
    writeFileSync(real, "{}");
    symlinkSync(real, join(dir, "link.json"));
    mkdirSync(join(dir, "d.json"));
    expect(readBoundedRegularFile(join(dir, "link.json"), 1024)).toEqual({
      kind: "invalid",
      reason: "not a regular file",
    });
    expect(readBoundedRegularFile(join(dir, "d.json"), 1024)).toEqual({
      kind: "invalid",
      reason: "not a regular file",
    });
  });

  test("FIFO → not a regular file, promptly", async () => {
    if (process.platform === "win32") return;
    const { readBoundedRegularFile } = await pr();
    const dir = tempDir();
    const fifo = join(dir, "session.json");
    if (Bun.spawnSync(["mkfifo", fifo]).exitCode !== 0) return;
    const started = Date.now();
    expect(readBoundedRegularFile(fifo, 1024)).toEqual({ kind: "invalid", reason: "not a regular file" });
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe("readPromptRecord — content never echoed", () => {
  async function invalidReason(text: string, attempt = 1): Promise<string> {
    const { readPromptRecord } = await pr();
    const dir = tempDir();
    writeFileSync(join(dir, `prompt-${attempt}.json`), text, { mode: 0o600 });
    const r = readPromptRecord(dir, attempt);
    expect(r.kind).toBe("invalid");
    if (r.kind !== "invalid") return "";
    return r.reason;
  }

  test("invalid reasons never carry file content", async () => {
    const samples = [
      "SECRET-BODY",
      '{"SECRET-BODY": 1}',
      `{"version": 1, "agent": "SECRET-BODY"}`,
      "\u001b[31mSECRET-BODY",
    ];
    for (const s of samples) {
      const reason = await invalidReason(s);
      expect(reason).not.toContain("SECRET-BODY");
      expect(reason).not.toContain("\u001b");
    }
  });
});
