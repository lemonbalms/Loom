/**
 * PLAN 0.23.1 (R26) — worker/bridge-side §5.2 artifact packaging.
 * §5.1 "no truncation": the artifact FILE preserves the full text passed
 * in (the caller's recovery window, R26 L-2); only the inline `text`
 * returned to the caller is clamped to MAX_CONV_TURN_INLINE_CHARS.
 */
import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { generateConvId, MAX_CONV_TURN_INLINE_CHARS } from "@loom/protocol";
import { packageConvTurnArtifact, convArtifactsDir } from "./conv-artifact-pack";
import { resetStateHomeDirCache, loomDir } from "./session-store";

const dir = join(tmpdir(), `loom-conv-artifact-pack-${Date.now()}`);

beforeAll(() => {
  mkdirSync(dir, { recursive: true });
  process.env.LOOM_TEST_HOME = dir;
  resetStateHomeDirCache();
});

afterAll(() => {
  delete process.env.LOOM_TEST_HOME;
  resetStateHomeDirCache();
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* */
  }
});

describe("conv-artifact-pack (R26 §5.2 packaging)", () => {
  test("writes the full text unmodified, sha256/chars match, dir/file perms tightened", () => {
    const convId = generateConvId();
    const fullText = `${"x".repeat(50_000)}\nTAIL-MARKER\n`;
    const result = packageConvTurnArtifact({
      convId,
      seq: 3,
      fullText,
      bridgeDisplayName: "node/wsl-1",
      recoveryWindowDescription: "pane.read recovery-window (recent 200 lines)",
    });

    const filePath = join(convArtifactsDir(convId), "turn-3.txt");
    expect(existsSync(filePath)).toBe(true);
    const onDisk = readFileSync(filePath, "utf8");
    expect(onDisk).toBe(fullText); // full text preserved — no truncation on disk

    const dirMode = statSync(convArtifactsDir(convId)).mode & 0o777;
    expect(dirMode).toBe(0o700);
    const fileMode = statSync(filePath).mode & 0o777;
    expect(fileMode).toBe(0o600);

    const expectedSha = createHash("sha256").update(fullText, "utf8").digest("hex");
    expect(result.artifacts).toHaveLength(1);
    const entry = result.artifacts[0]!;
    expect(entry.transport).toBe("scp");
    expect(entry.sha256).toBe(expectedSha);
    expect(entry.chars).toBe(fullText.length);
  });

  test("wire ref.path is the tilde-literal convention form, not the real loomDir() path", () => {
    const convId = generateConvId();
    const result = packageConvTurnArtifact({
      convId,
      seq: 1,
      fullText: "hello",
      bridgeDisplayName: "node/wsl-1",
      recoveryWindowDescription: "pane.read recovery-window (recent 200 lines)",
    });
    const entry = result.artifacts[0]!;
    expect(entry.ref).toEqual({
      host: "node/wsl-1",
      path: `~/.loom/artifacts/${convId}/turn-1.txt`,
    });
    // The real on-disk path is under the actual loomDir(), which never
    // appears on the wire.
    expect(JSON.stringify(entry.ref)).not.toContain(loomDir());
  });

  test("ref.host carries the bridge's own displayName (bookkeeping only, per schema)", () => {
    const convId = generateConvId();
    const result = packageConvTurnArtifact({
      convId,
      seq: 2,
      fullText: "hi",
      bridgeDisplayName: "node/mac-1",
      recoveryWindowDescription: "pane.read recovery-window (recent 200 lines)",
    });
    expect((result.artifacts[0]!.ref as { host?: string }).host).toBe("node/mac-1");
  });

  test("inline gist text + notice stays within the 32k inline budget and mentions the recovery window", () => {
    const convId = generateConvId();
    const fullText = "y".repeat(200_000); // far over threshold
    const result = packageConvTurnArtifact({
      convId,
      seq: 5,
      fullText,
      bridgeDisplayName: "node/wsl-1",
      recoveryWindowDescription: "pane.read recovery-window (recent 200 lines)",
    });
    expect(result.text.length).toBeLessThanOrEqual(MAX_CONV_TURN_INLINE_CHARS);
    expect(result.text).toContain("recovery-window");
    expect(result.text).toContain("recent 200 lines");
    expect(result.text).toContain(convId);
  });

  test("gist field on the artifact entry stays within the 900-char schema max", () => {
    const convId = generateConvId();
    const result = packageConvTurnArtifact({
      convId,
      seq: 9,
      fullText: "z".repeat(100_000),
      bridgeDisplayName: "node/wsl-1",
      recoveryWindowDescription: "pane.read recovery-window (recent 200 lines)",
    });
    expect(result.artifacts[0]!.gist!.length).toBeLessThanOrEqual(900);
  });
});
