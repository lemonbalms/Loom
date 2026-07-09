import { describe, expect, test } from "bun:test";
import {
  capabilityMatrix,
  getAdapter,
  listAdapters,
  pickDefaultAdapter,
  loomSystemHint,
} from "./index";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("adapters", () => {
  test("all adapters expose capabilities", () => {
    for (const a of listAdapters()) {
      expect(a.capabilities.mcp).toBeTruthy();
      expect(a.capabilities.receive).toBeTruthy();
      expect(a.systemHint().length).toBeGreaterThan(20);
    }
  });

  test("capability matrix has four rows without gemini", () => {
    const m = capabilityMatrix();
    expect(m.map((r) => r.id).sort()).toEqual(
      ["claude", "codex", "grok", "shell"].sort(),
    );
    expect(m.find((r) => r.id === "gemini")).toBeUndefined();
  });

  test("shared hint mentions check_handoffs", () => {
    expect(loomSystemHint("x")).toContain("check_handoffs");
    expect(loomSystemHint("x")).toContain("claim_handoff");
  });

  test("pickDefaultAdapter always returns something", async () => {
    const a = await pickDefaultAdapter();
    expect(a.id).toBeTruthy();
  });

  test("claude ensureMcpConfig writes project json but returns null (global --mcp-config)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "loom-ad-"));
    const claude = getAdapter("claude")!;
    const path = await claude.ensureMcpConfig!({
      cwd: dir,
      mcpStdioPath: "/tmp/fake-stdio.ts",
      sessionEnv: { LOOM_SESSION: "/tmp/s.json" },
    });
    expect(path).toBeNull();
    const project = join(dir, ".loom", "claude.mcp.json");
    expect(existsSync(project)).toBe(true);
    const json = JSON.parse(readFileSync(project, "utf8"));
    expect(json.mcpServers.loom.command).toBe("bun");
  });

  test("codex ensureMcpConfig project always; user config only opt-in", async () => {
    const dir = mkdtempSync(join(tmpdir(), "loom-ad-"));
    const codex = getAdapter("codex")!;
    expect(codex.capabilities.userConfigWrite).toBe("opt-in");
    const path = await codex.ensureMcpConfig!({
      cwd: dir,
      mcpStdioPath: "/tmp/fake-stdio.ts",
      sessionEnv: { LOOM_SESSION: "/tmp/s.json" },
      writeUserConfig: false,
    });
    expect(path).toContain("codex.mcp.toml");
    const text = readFileSync(path!, "utf8");
    expect(text).toContain("[mcp_servers.loom]");
    expect(text).toContain("LOOM_SESSION");
  });

  test("grok ensureMcpConfig writes project toml with session env", async () => {
    const dir = mkdtempSync(join(tmpdir(), "loom-ad-"));
    const grok = getAdapter("grok")!;
    expect(grok.capabilities.mcp).toBe("grok-toml");
    expect(grok.capabilities.userConfigWrite).toBe("opt-in");
    const path = await grok.ensureMcpConfig!({
      cwd: dir,
      mcpStdioPath: "/tmp/fake-stdio.ts",
      sessionEnv: { LOOM_SESSION: "/tmp/s.json" },
    });
    expect(path).toContain("grok.mcp.toml");
    const text = readFileSync(path!, "utf8");
    expect(text).toContain("[mcp_servers.loom]");
    expect(text).toContain("enabled = true");
    expect(text).toContain("LOOM_SESSION");
  });


  test("grok detects binary when on PATH", async () => {
    const grok = getAdapter("grok")!;
    // May or may not be installed in CI; just ensure detect returns boolean
    expect(typeof (await grok.detect())).toBe("boolean");
  });
});
