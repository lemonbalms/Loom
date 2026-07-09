import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readdirSync,
  readFileSync,
  utimesSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  writeAtomicJson,
  readJsonFile,
  withFileLock,
  sleepMs,
} from "./atomic-json";

describe("atomic-json (H-7 / L-12)", () => {
  const dir = join(tmpdir(), `loom-atomic-${Date.now()}`);
  const file = join(dir, "data.json");

  beforeEach(() => {
    mkdirSync(dir, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* */
    }
  });

  test("writeAtomicJson then readJsonFile", () => {
    writeAtomicJson(file, { ok: true, n: 1 });
    expect(readJsonFile(file)).toEqual({ ok: true, n: 1 });
    expect(existsSync(file)).toBe(true);
  });

  test("readJsonFile missing returns null", () => {
    expect(readJsonFile(join(dir, "nope.json"))).toBeNull();
  });

  test("corrupt file backs up and throws", () => {
    writeFileSync(file, "{not json", "utf8");
    expect(() => readJsonFile(file)).toThrow(/Corrupt JSON/);
    const names = readdirSync(dir) as string[];
    expect(names.some((n) => n.includes("corrupt"))).toBe(true);
  });

  test("withFileLock serializes writers", () => {
    writeAtomicJson(file, { n: 0 });
    withFileLock(file, () => {
      const cur = readJsonFile(file) as { n: number };
      writeAtomicJson(file, { n: cur.n + 1 });
    });
    withFileLock(file, () => {
      const cur = readJsonFile(file) as { n: number };
      writeAtomicJson(file, { n: cur.n + 1 });
    });
    expect((readJsonFile(file) as { n: number }).n).toBe(2);
  });

  test("L-12: lock dir records owner.pid", () => {
    withFileLock(file, () => {
      const lockDir = `${file}.lock`;
      expect(existsSync(lockDir)).toBe(true);
      const pid = readFileSync(join(lockDir, "owner.pid"), "utf8").trim();
      expect(Number(pid)).toBe(process.pid);
    });
    expect(existsSync(`${file}.lock`)).toBe(false);
  });

  test("L-12: does not reclaim live owner lock", () => {
    const lockDir = `${file}.lock`;
    mkdirSync(lockDir, { recursive: true });
    writeFileSync(join(lockDir, "owner.pid"), `${process.pid}\n`, "utf8");
    // live owner (this process) with fresh lock — must not steal
    const t0 = Date.now();
    expect(() =>
      withFileLock(file, () => {
        /* should not enter */
      }),
    ).toThrow(/Timeout waiting for lock/);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(500);
    rmSync(lockDir, { recursive: true, force: true });
  });

  test("L-12: reclaim dead owner stale lock", () => {
    const lockDir = `${file}.lock`;
    mkdirSync(lockDir, { recursive: true });
    writeFileSync(join(lockDir, "owner.pid"), "999999991\n", "utf8");
    const past = new Date(Date.now() - 60_000);
    utimesSync(lockDir, past, past);

    let entered = false;
    withFileLock(file, () => {
      entered = true;
      writeAtomicJson(file, { reclaimed: true });
    });
    expect(entered).toBe(true);
    expect((readJsonFile(file) as { reclaimed: boolean }).reclaimed).toBe(true);
  });

  test("sleepMs returns", () => {
    const t0 = Date.now();
    sleepMs(30);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(20);
  });
});
