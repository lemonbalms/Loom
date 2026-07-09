import { describe, expect, test, afterEach, beforeEach } from "bun:test";
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  rmSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  resetStateHomeDirCache,
  resolveStateHomeDir,
  loomDir,
} from "./session-store";

describe("M-16 state home migration (live-PID gate)", () => {
  let root: string;

  beforeEach(() => {
    root = join(tmpdir(), `loom-home-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    mkdirSync(root, { recursive: true });
    process.env.LOOM_TEST_HOME = root;
    resetStateHomeDirCache();
  });

  afterEach(() => {
    resetStateHomeDirCache();
    delete process.env.LOOM_TEST_HOME;
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* */
    }
  });

  test("no dirs → prefers ~/.loom path under test home", () => {
    const home = resolveStateHomeDir();
    expect(home).toBe(join(root, ".loom"));
  });

  test("existing .loom wins", () => {
    mkdirSync(join(root, ".loom"), { recursive: true });
    writeFileSync(join(root, ".loom", "session.json"), "{}", "utf8");
    mkdirSync(join(root, ".fable"), { recursive: true });
    writeFileSync(join(root, ".fable", "session.json"), '{"legacy":true}', "utf8");
    const home = resolveStateHomeDir();
    expect(home).toBe(join(root, ".loom"));
  });

  test("legacy only + dead pid → migrates rename to .loom", () => {
    const legacy = join(root, ".fable");
    mkdirSync(legacy, { recursive: true });
    writeFileSync(join(legacy, "session.json"), '{"v":1}', "utf8");
    // dead pid (unlikely to be alive)
    writeFileSync(join(legacy, "relay.pid"), "999999999", "utf8");
    const home = resolveStateHomeDir();
    expect(home).toBe(join(root, ".loom"));
    expect(existsSync(join(root, ".loom", "session.json"))).toBe(true);
    // after successful rename, legacy gone
    expect(existsSync(legacy)).toBe(false);
  });

  test("legacy only + live pid → keep .fable, do not create empty .loom via gate", () => {
    const legacy = join(root, ".fable");
    mkdirSync(legacy, { recursive: true });
    writeFileSync(join(legacy, "session.json"), '{"v":1}', "utf8");
    // current process is alive
    writeFileSync(join(legacy, "relay.pid"), String(process.pid), "utf8");
    const home = resolveStateHomeDir();
    expect(home).toBe(legacy);
    expect(existsSync(join(root, ".loom"))).toBe(false);
    expect(readFileSync(join(legacy, "session.json"), "utf8")).toContain("v");
  });

  test("loomDir matches resolveStateHomeDir", () => {
    expect(loomDir()).toBe(resolveStateHomeDir());
  });
});
