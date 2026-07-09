import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  symlinkSync,
  existsSync,
} from "node:fs";
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
import { saveSession, setActiveProfile } from "./session-store";

describe("context pack", () => {
  const dir = join(tmpdir(), `loom-pack-${Date.now()}`);
  const sessionFile = join(dir, "session.json");
  const workspace = join(dir, "ws");
  const prevCwd = process.cwd();
  const prevSession = process.env.LOOM_SESSION;

  beforeEach(() => {
    mkdirSync(workspace, { recursive: true });
    writeFileSync(join(workspace, "readme.md"), "# hi\n", "utf8");
    mkdirSync(join(workspace, "src"), { recursive: true });
    writeFileSync(join(workspace, "src", "a.ts"), "export {}\n", "utf8");
    process.env.LOOM_SESSION = sessionFile;
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
    if (prevSession === undefined) delete process.env.LOOM_SESSION;
    else process.env.LOOM_SESSION = prevSession;
    try {
      rmSync(dir, { recursive: true, force: true });
      // pack file under ~/.loom/packs — clear by overwriting empty
      const pack = emptyPack("room_pack_test");
      saveContextPack(pack);
    } catch {
      /* */
    }
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
    expect(p.paths.some((x) => x.path === "src/a.ts" || x.path.endsWith("a.ts"))).toBe(
      true,
    );
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
          (a.label === "context-pack-path" ||
            a.label?.startsWith("context-pack-path:")),
      ),
    ).toBe(true);
    expect(
      att.some((a) => a.label === "context-pack-path:docs"),
    ).toBe(true);
    expect(att.some((a) => a.label === "context-pack-notes")).toBe(true);
  });

  test("pack path file location is under packs dir", () => {
    expect(packPathForRoom("room_pack_test")).toContain(".loom/packs");
  });
});
