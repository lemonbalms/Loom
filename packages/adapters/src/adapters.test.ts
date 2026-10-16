import { describe, expect, test } from "bun:test";
import {
  capabilityMatrix,
  getAdapter,
  listAdapters,
  pickDefaultAdapter,
} from "./index";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("adapters", () => {
  test("all adapters expose capabilities", () => {
    for (const a of listAdapters()) {
      expect(a.capabilities.mcp).toBeTruthy();
      expect(a.capabilities.receive).toBeTruthy();
    }
  });

  test("capability matrix has four rows without gemini", () => {
    const m = capabilityMatrix();
    expect(m.map((r) => r.id).sort()).toEqual(
      ["claude", "codex", "grok", "shell"].sort(),
    );
    expect(m.find((r) => r.id === "gemini")).toBeUndefined();
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


  test("shell spawnSpec forces interactive -i (UC-9.2)", async () => {
    const { shellAdapter, interactiveShellArgs } = await import("./shell");
    expect(interactiveShellArgs("/bin/zsh")).toEqual(["-i"]);
    expect(interactiveShellArgs("/bin/bash")).toEqual(["-i"]);
    const prev = process.env.SHELL;
    process.env.SHELL = "/bin/zsh";
    const spec = await shellAdapter.spawnSpec({
      cwd: process.cwd(),
      mcpConfigPath: "/tmp/mcp.json",
      env: {},
    });
    expect(spec.command).toBe("/bin/zsh");
    expect(spec.args).toEqual(["-i"]);
    expect(spec.env.LOOM_AGENT).toBe("shell");
    if (prev === undefined) delete process.env.SHELL;
    else process.env.SHELL = prev;
  });

  test("grok detects binary when on PATH", async () => {
    const grok = getAdapter("grok")!;
    // May or may not be installed in CI; just ensure detect returns boolean
    expect(typeof (await grok.detect())).toBe("boolean");
  });
});

// PLAN 0.37.0 P4 (D7 · R18): AGENT_HINT.txt / systemHint() are gone — nothing read them.
describe("0.37.0 D7 — systemHint / hints.ts / writeAgentHintFile deleted", () => {
  test("no adapter carries systemHint", () => {
    expect(listAdapters()).toHaveLength(4);
    for (const a of listAdapters()) {
      expect("systemHint" in a).toBe(false);
    }
  });

  test("@loom/adapters exports neither loomSystemHint nor fableSystemHint; hints.ts is gone", async () => {
    const mod = (await import("@loom/adapters")) as Record<string, unknown>;
    expect(typeof mod.getAdapter).toBe("function");
    expect("loomSystemHint" in mod).toBe(false);
    expect("fableSystemHint" in mod).toBe(false);
    const local = (await import("./index")) as Record<string, unknown>;
    expect("loomSystemHint" in local).toBe(false);
    expect("fableSystemHint" in local).toBe(false);
    expect(existsSync(join(import.meta.dir, "hints.ts"))).toBe(false);
  });

  test("@loom/mcp-server (packages/mcp-server/src/index.ts) no longer exports writeAgentHintFile", async () => {
    // adapters does not depend on @loom/mcp-server — import its entry by path (outside rootDir,
    // so a computed specifier keeps tsc from pulling it into this package's program).
    const entry = join(import.meta.dir, "..", "..", "mcp-server", "src", "index.ts");
    const mod = (await import(entry)) as Record<string, unknown>;
    expect(typeof mod.writeMcpConfig).toBe("function");
    expect("writeAgentHintFile" in mod).toBe(false);
  });
});
