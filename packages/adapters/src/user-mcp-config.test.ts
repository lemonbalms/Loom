import { describe, expect, test } from "bun:test";
import {
  buildLoomMcpTomlBlock,
  upsertUserMcpConfig,
  stripAllLoomMcpSections,
  LOOM_MCP_BEGIN,
  LOOM_MCP_END,
} from "./user-mcp-config";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("user mcp config", () => {
  test("block includes session env", () => {
    const block = buildLoomMcpTomlBlock({
      mcpStdioPath: "/tmp/stdio.ts",
      sessionEnv: {
        LOOM_SESSION: "/tmp/alice.json",
        LOOM_PROFILE: "alice",
      },
    });
    expect(block).toContain(LOOM_MCP_BEGIN);
    expect(block).toContain(LOOM_MCP_END);
    expect(block).toContain("[mcp_servers.loom.env]");
    expect(block).toContain("LOOM_SESSION");
    expect(block).toContain("/tmp/alice.json");
  });

  test("upsert replaces managed section", () => {
    const dir = mkdtempSync(join(tmpdir(), "loom-ucfg-"));
    const path = join(dir, "config.toml");
    writeFileSync(
      path,
      [
        "[cli]",
        'x = "1"',
        "",
        buildLoomMcpTomlBlock({
          mcpStdioPath: "/old/stdio.ts",
          sessionEnv: { LOOM_SESSION: "/old.json" },
        }),
      ].join("\n"),
      "utf8",
    );
    const block2 = buildLoomMcpTomlBlock({
      mcpStdioPath: "/new/stdio.ts",
      sessionEnv: { LOOM_SESSION: "/new.json" },
    });
    upsertUserMcpConfig({ configPath: path, block: block2 });
    const text = readFileSync(path, "utf8");
    expect(text).toContain("/new/stdio.ts");
    expect(text).toContain("/new.json");
    expect(text).not.toContain("/old/stdio.ts");
    expect(text).toContain("[cli]");
    // exactly one fable table header (not counting .env subtable)
    const headers = text.match(/\[mcp_servers\.loom\]/g) ?? [];
    expect(headers.length).toBe(1);
  });

  test("upsert appends when no fable section", () => {
    const dir = mkdtempSync(join(tmpdir(), "loom-ucfg-"));
    const path = join(dir, "config.toml");
    writeFileSync(path, "[ui]\nyolo = true\n", "utf8");
    upsertUserMcpConfig({
      configPath: path,
      block: buildLoomMcpTomlBlock({
        mcpStdioPath: "/x.ts",
        sessionEnv: { LOOM_SESSION: "/s.json" },
      }),
    });
    const text = readFileSync(path, "utf8");
    expect(text).toContain("yolo = true");
    expect(text).toContain("[mcp_servers.loom]");
  });

  test("H-4: legacy v0.2.2 unmarker block is replaced not duplicated", () => {
    const dir = mkdtempSync(join(tmpdir(), "loom-ucfg-"));
    const path = join(dir, "config.toml");
    // Exact shape left by v0.2.2 auto-append
    const legacy = [
      "[cli]",
      'installer = "internal"',
      "",
      "# --- Loom multiplayer (auto-added) ---",
      "[mcp_servers.loom]",
      'command = "bun"',
      'args = ["run", "/old/path/stdio.ts"]',
      "",
      "[ui]",
      "yolo = false",
      "",
    ].join("\n");
    writeFileSync(path, legacy, "utf8");

    const block = buildLoomMcpTomlBlock({
      mcpStdioPath: "/new/stdio.ts",
      sessionEnv: { LOOM_SESSION: "/alice.json", LOOM_PROFILE: "alice" },
      extraLines: ["enabled = true"],
    });
    const r = upsertUserMcpConfig({ configPath: path, block });
    expect(r.written).toBe(true);
    expect(r.strippedLegacy).toBe(true);

    const text = readFileSync(path, "utf8");
    expect(text).toContain("[cli]");
    expect(text).toContain("[ui]");
    expect(text).toContain("yolo = false");
    expect(text).toContain("/new/stdio.ts");
    expect(text).toContain("LOOM_SESSION");
    expect(text).not.toContain("/old/path/stdio.ts");
    expect(text).not.toContain("auto-added");
    // Single table definition
    expect((text.match(/\[mcp_servers\.loom\]/g) ?? []).length).toBe(1);
    // Valid-ish: no duplicate consecutive fable headers
    expect(text.indexOf("[mcp_servers.loom]")).toBe(
      text.lastIndexOf("[mcp_servers.loom]"),
    );
  });

  test("stripAllLoomMcpSections removes bare fable tables", () => {
    const raw = [
      "[a]",
      "x = 1",
      "[mcp_servers.loom]",
      'command = "bun"',
      "[mcp_servers.loom.env]",
      'LOOM_SESSION = "/x"',
      "[b]",
      "y = 2",
    ].join("\n");
    const stripped = stripAllLoomMcpSections(raw);
    expect(stripped).toContain("[a]");
    expect(stripped).toContain("[b]");
    expect(stripped).not.toContain("mcp_servers.loom");
  });

  test("RN1: bare word loom in comments is not stripped", () => {
    const raw = [
      "[cli]",
      "x = 1",
      "# deadline looming for release",
      "[mcp_servers.fable]",
      'command = "bun"',
    ].join("\n");
    const stripped = stripAllLoomMcpSections(raw);
    expect(stripped).toContain("deadline looming");
    expect(stripped).not.toContain("mcp_servers.fable");
  });
});
