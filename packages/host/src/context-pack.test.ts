import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, symlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  emptyPack,
  saveContextPack,
  loadContextPack,
  setPackSummary,
  addPackPath,
  removePackPath,
  addPackNote,
  packToAttachments,
  resolveAllowlistedPath,
  packIsEmpty,
  packPathForRoom,
} from "./context-pack";
import { resetStateHomeDirCache, saveSession, setActiveProfile } from "./session-store";

describe("context pack", () => {
  const dir = join(tmpdir(), `loom-pack-${Date.now()}`);
  const sessionFile = join(dir, "session.json");
  const workspace = join(dir, "ws");
  const prevCwd = process.cwd();
  const prevSession = process.env.LOOM_SESSION;
  const prevTestHome = process.env.LOOM_TEST_HOME;

  beforeEach(() => {
    mkdirSync(workspace, { recursive: true });
    writeFileSync(join(workspace, "readme.md"), "# hi\n", "utf8");
    mkdirSync(join(workspace, "src"), { recursive: true });
    writeFileSync(join(workspace, "src", "a.ts"), "export {}\n", "utf8");
    process.env.LOOM_TEST_HOME = dir;
    process.env.LOOM_SESSION = sessionFile;
    resetStateHomeDirCache();
    setActiveProfile(null);
    saveSession({
      roomId: "room_pack_test",
      roomName: "pack-demo",
      inviteCode: "LOOM-TEST",
      peerId: "p1",
      displayName: "alice",
      agentKind: "shell",
      relayUrl: "ws://127.0.0.1:7842/ws",
      updatedAt: new Date().toISOString(),
    });
    process.chdir(workspace);
  });

  afterEach(() => {
    process.chdir(prevCwd);
    try {
      // pack file under ~/.loom/packs — clear by overwriting empty
      const pack = emptyPack("room_pack_test");
      saveContextPack(pack);
    } catch {
      /* */
    }
    if (prevSession === undefined) delete process.env.LOOM_SESSION;
    else process.env.LOOM_SESSION = prevSession;
    if (prevTestHome === undefined) delete process.env.LOOM_TEST_HOME;
    else process.env.LOOM_TEST_HOME = prevTestHome;
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* */
    }
    resetStateHomeDirCache();
  });

  test("summary and notes sanitize and persist", () => {
    setPackSummary("hello\x1b[31m world");
    addPackNote("note one");
    const p = loadContextPack("room_pack_test")!;
    expect(p.summary).toContain("hello");
    expect(p.summary).not.toContain("\x1b");
    expect(p.notes).toEqual(["note one"]);
    expect(packIsEmpty(p)).toBe(false);
  });

  test("add path under cwd; reject escape", () => {
    const p = addPackPath("src/a.ts");
    expect(p.paths.some((x) => x.path === "src/a.ts" || x.path.endsWith("a.ts"))).toBe(true);
    expect(() => addPackPath("../../../etc/passwd")).toThrow(/outside|not found/);
  });

  test("L-2: reject symlink that resolves outside cwd", () => {
    const outside = join(dir, "secret.txt");
    writeFileSync(outside, "nope\n", "utf8");
    const link = join(workspace, "escape-link");
    try {
      symlinkSync(outside, link);
    } catch {
      // platforms without symlink — skip
      return;
    }
    expect(existsSync(link)).toBe(true);
    expect(() => addPackPath("escape-link")).toThrow(/outside|not found|cannot resolve/);
  });

  test("resolveAllowlistedPath", () => {
    const ok = resolveAllowlistedPath("readme.md", workspace);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.rel).toBe("readme.md");
  });

  test("remove path", () => {
    addPackPath("readme.md");
    const p = removePackPath("readme.md");
    expect(p.paths.length).toBe(0);
  });

  test("packToAttachments", () => {
    setPackSummary("sprint context");
    addPackPath("readme.md", { label: "docs" });
    addPackNote("use bun");
    const pack = loadContextPack()!;
    const att = packToAttachments(pack);
    expect(att.some((a) => a.label === "context-pack-summary")).toBe(true);
    expect(
      att.some(
        (a) =>
          a.kind === "path" &&
          (a.label === "context-pack-path" || a.label?.startsWith("context-pack-path:")),
      ),
    ).toBe(true);
    expect(att.some((a) => a.label === "context-pack-path:docs")).toBe(true);
    expect(att.some((a) => a.label === "context-pack-notes")).toBe(true);
    expect(att.some((a) => a.label?.startsWith("context-pack-file:"))).toBe(false);
  });

  test("L-5 pack embed re-resolves and embeds file body", () => {
    setPackSummary("embed me");
    addPackPath("readme.md");
    const pack = loadContextPack()!;
    const att = packToAttachments(pack, { embedFiles: true, cwd: workspace });
    const fileAtt = att.find((a) => a.label === "context-pack-file:readme.md");
    expect(fileAtt).toBeTruthy();
    expect(fileAtt!.kind).toBe("text");
    expect(fileAtt!.content).toContain("# hi");
  });

  test("L-5 embed skips path that escapes allowlist after pack add", () => {
    addPackPath("readme.md");
    const pack = loadContextPack()!;
    // Mutate pack path to absolute outside workspace without re-add
    pack.paths = [{ path: "/etc/passwd" }];
    const att = packToAttachments(pack, { embedFiles: true, cwd: workspace });
    expect(att.some((a) => a.label?.startsWith("context-pack-file:"))).toBe(false);
  });

  test("L-27 embed skips when path is replaced by symlink outside allow root", () => {
    const secret = join(dir, "secret-outside.txt");
    writeFileSync(secret, "LEAKED\n", "utf8");
    const victim = join(workspace, "swap-me.txt");
    writeFileSync(victim, "ok body\n", "utf8");
    addPackPath("swap-me.txt");
    // After allowlist add, replace file with symlink out of workspace
    rmSync(victim);
    try {
      symlinkSync(secret, victim);
    } catch {
      return; // platform without symlink
    }
    const pack = loadContextPack()!;
    const att = packToAttachments(pack, { embedFiles: true, cwd: workspace });
    const fileAtt = att.find((a) => a.label?.startsWith("context-pack-file:swap-me"));
    // Must not embed outside content (O_NOFOLLOW / re-resolve reject)
    expect(fileAtt).toBeUndefined();
    expect(att.every((a) => !a.content?.includes("LEAKED"))).toBe(true);
  });

  test("pack path file location is under packs dir", () => {
    expect(packPathForRoom("room_pack_test")).toContain(".loom/packs");
  });
});
