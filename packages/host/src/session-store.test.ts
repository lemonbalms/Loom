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
  setActiveProfile,
  resetActiveProfile,
  sessionPath,
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

describe("session path: explicit --profile beats LOOM_SESSION", () => {
  let root: string;
  let prevSession: string | undefined;
  let prevProfile: string | undefined;

  beforeEach(() => {
    root = join(
      tmpdir(),
      `loom-profile-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    mkdirSync(join(root, ".loom", "profiles"), { recursive: true });
    process.env.LOOM_TEST_HOME = root;
    prevSession = process.env.LOOM_SESSION;
    prevProfile = process.env.LOOM_PROFILE;
    process.env.LOOM_SESSION = join(root, ".loom", "profiles", "impl.json");
    process.env.LOOM_PROFILE = "impl";
    writeFileSync(process.env.LOOM_SESSION, "{}", "utf8");
    writeFileSync(join(root, ".loom", "profiles", "codex-rev.json"), "{}", "utf8");
    resetStateHomeDirCache();
    resetActiveProfile();
  });

  afterEach(() => {
    resetActiveProfile();
    resetStateHomeDirCache();
    delete process.env.LOOM_TEST_HOME;
    if (prevSession === undefined) delete process.env.LOOM_SESSION;
    else process.env.LOOM_SESSION = prevSession;
    if (prevProfile === undefined) delete process.env.LOOM_PROFILE;
    else process.env.LOOM_PROFILE = prevProfile;
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* */
    }
  });

  test("without explicit profile, LOOM_SESSION wins", () => {
    expect(sessionPath()).toBe(join(root, ".loom", "profiles", "impl.json"));
  });

  test("setActiveProfile({ explicit: true }) beats LOOM_SESSION", () => {
    setActiveProfile("codex-rev", { explicit: true });
    expect(sessionPath()).toBe(
      join(root, ".loom", "profiles", "codex-rev.json"),
    );
  });

  test("soft setActiveProfile still loses to LOOM_SESSION", () => {
    setActiveProfile("codex-rev");
    expect(sessionPath()).toBe(join(root, ".loom", "profiles", "impl.json"));
  });
});
