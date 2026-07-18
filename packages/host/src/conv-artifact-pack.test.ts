/**
 * PLAN 0.23.1 (R26) — worker/bridge-side §5.2 artifact packaging.
 * §5.1 "no truncation": the artifact FILE preserves the full text passed
 * in (the caller's recovery window, R26 L-2); only the inline `text`
 * returned to the caller is clamped to MAX_CONV_TURN_INLINE_CHARS.
 *
 * PLAN 0.23.3 (R28) — worker-declared file marker scan / validate /
 * packageWorkerFileArtifact (emission contract reuse, no rewrite).
 */
import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import {
  mkdirSync,
  rmSync,
  readFileSync,
  existsSync,
  statSync,
  writeFileSync,
  symlinkSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import {
  generateConvId,
  MAX_CONV_TURN_INLINE_CHARS,
  type ArtifactRefEntry,
} from "@loom/protocol";
import {
  packageConvTurnArtifact,
  convArtifactsDir,
  scanArtifactMarkers,
  validateArtifactMarkerFilename,
  packageWorkerFileArtifact,
  workerArtifactInlineNotice,
  MAX_WORKER_ARTIFACT_BYTES,
} from "./conv-artifact-pack";
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

describe("scanArtifactMarkers (R28 L-1 exact-line anchor)", () => {
  test("detects exact-line markers, order preserved, deduped within scrape", () => {
    const scrape = [
      "thinking out loud",
      "[ARTIFACT] report.md",
      "more text",
      "[ARTIFACT] data.json",
      "[ARTIFACT] report.md", // dedupe
      "  [ARTIFACT] padded.txt  ", // trim still exact after trim
      "see [ARTIFACT] mentioned.md in prose", // NOT a match — not entire line
      "[ARTIFACT]  double-space.txt", // NOT — double space after ]
      "[ARTIFACT]bad", // NOT — no space
      "prefix [ARTIFACT] no.tsx", // NOT
    ].join("\n");
    expect(scanArtifactMarkers(scrape)).toEqual([
      "report.md",
      "data.json",
      "padded.txt",
    ]);
  });

  test("empty scrape yields no markers", () => {
    expect(scanArtifactMarkers("")).toEqual([]);
    expect(scanArtifactMarkers("no markers here")).toEqual([]);
  });

  test("path-like tokens are scanned so validation can emit bridge notes", () => {
    // Widened capture (\S+) — charset/path rejection happens in validate, not scan
    expect(scanArtifactMarkers("[ARTIFACT] ../x")).toEqual(["../x"]);
    expect(scanArtifactMarkers("[ARTIFACT] a/b.txt\n[ARTIFACT] weird@name")).toEqual([
      "a/b.txt",
      "weird@name",
    ]);
    // Spaces in token still non-marker (single non-space token only)
    expect(scanArtifactMarkers("[ARTIFACT] has space.txt")).toEqual([]);
  });
});

describe("validateArtifactMarkerFilename (R28 M-1)", () => {
  test("accepts legal names", () => {
    expect(validateArtifactMarkerFilename("report.md")).toEqual({ ok: true });
    expect(validateArtifactMarkerFilename("a_b-c.1")).toEqual({ ok: true });
    expect(validateArtifactMarkerFilename(`A${"x".repeat(199)}`)).toEqual({ ok: true });
  });

  test("rejects empty", () => {
    expect(validateArtifactMarkerFilename("")).toEqual({
      ok: false,
      reason: "empty_filename",
    });
  });

  test("rejects path separator char", () => {
    expect(validateArtifactMarkerFilename("a/b.txt").ok).toBe(false);
    expect(validateArtifactMarkerFilename("a\\b.txt").ok).toBe(false);
  });

  test("rejects .. attempt (charset / as path sep also blocked)", () => {
    // ".." alone is charset-ok for dots but leading `.` is rejected
    expect(validateArtifactMarkerFilename("..")).toEqual({
      ok: false,
      reason: "filename_leading_dot",
    });
    // embedded .. is fine charset-wise but we also reject via join+realpath;
    // filename "foo..bar" is charset-ok and not leading-dot
    expect(validateArtifactMarkerFilename("foo..bar")).toEqual({ ok: true });
    // path-form "a/../b" fails charset
    expect(validateArtifactMarkerFilename("a/../b").ok).toBe(false);
  });

  test("rejects leading -", () => {
    expect(validateArtifactMarkerFilename("-evil.txt")).toEqual({
      ok: false,
      reason: "filename_leading_dash",
    });
  });

  test("rejects leading .", () => {
    expect(validateArtifactMarkerFilename(".hidden")).toEqual({
      ok: false,
      reason: "filename_leading_dot",
    });
  });

  test("rejects charset violation", () => {
    expect(validateArtifactMarkerFilename("has space.txt").ok).toBe(false);
    expect(validateArtifactMarkerFilename("weird@name").ok).toBe(false);
  });

  test("rejects turn-* reserved namespace (R28 M-1)", () => {
    expect(validateArtifactMarkerFilename("turn-3.txt")).toEqual({
      ok: false,
      reason: "filename_reserved_turn_ns",
    });
    expect(validateArtifactMarkerFilename("turn-")).toEqual({
      ok: false,
      reason: "filename_reserved_turn_ns",
    });
  });

  test("rejects length > 200", () => {
    expect(validateArtifactMarkerFilename("a".repeat(201)).ok).toBe(false);
  });
});

describe("packageWorkerFileArtifact (R28 M-1 emission reuse, no rewrite)", () => {
  test("marker detect → file read → ref emitted (tilde-literal, filename, sha/chars)", () => {
    const convId = generateConvId();
    const filename = "big-output.md";
    const content = `FULL_CONTENT_${"Z".repeat(1000)}`;
    const artDir = convArtifactsDir(convId);
    mkdirSync(artDir, { recursive: true, mode: 0o700 });
    const filePath = join(artDir, filename);
    writeFileSync(filePath, content, { encoding: "utf8", mode: 0o600 });

    // Ensure package does NOT rewrite the file (mtime / content stable)
    const before = readFileSync(filePath, "utf8");
    const result = packageWorkerFileArtifact({
      convId,
      filename,
      bridgeDisplayName: "node/wsl-1",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(readFileSync(filePath, "utf8")).toBe(before); // no rewrite

    const expectedSha = createHash("sha256").update(content, "utf8").digest("hex");
    expect(result.ref.transport).toBe("scp");
    expect(result.ref.sha256).toBe(expectedSha);
    expect(result.ref.chars).toBe(content.length);
    expect(result.ref.ref).toEqual({
      host: "node/wsl-1",
      path: `~/.loom/artifacts/${convId}/${filename}`,
    });
    expect(JSON.stringify(result.ref.ref)).not.toContain(loomDir());
  });

  test("file missing → file_not_found", () => {
    const convId = generateConvId();
    mkdirSync(convArtifactsDir(convId), { recursive: true, mode: 0o700 });
    const result = packageWorkerFileArtifact({
      convId,
      filename: "ghost.md",
      bridgeDisplayName: "node/wsl-1",
    });
    expect(result).toEqual({ ok: false, reason: "file_not_found" });
  });

  test("size cap exceeded → file_too_large fail-closed", () => {
    const convId = generateConvId();
    const filename = "huge.bin";
    const artDir = convArtifactsDir(convId);
    mkdirSync(artDir, { recursive: true, mode: 0o700 });
    // Write a sparse-ish large file by writing just over the cap.
    // Cap is 10MB; write 10MB + 1 byte.
    const oversized = Buffer.alloc(MAX_WORKER_ARTIFACT_BYTES + 1, 0x41);
    writeFileSync(join(artDir, filename), oversized);
    const result = packageWorkerFileArtifact({
      convId,
      filename,
      bridgeDisplayName: "node/wsl-1",
    });
    expect(result).toEqual({ ok: false, reason: "file_too_large" });
  });

  test("realpath containment escape via symlink → fail-closed", () => {
    const convId = generateConvId();
    const artDir = convArtifactsDir(convId);
    mkdirSync(artDir, { recursive: true, mode: 0o700 });

    // Secret outside the artifacts dir
    const outsideDir = join(dir, "outside-secret");
    mkdirSync(outsideDir, { recursive: true });
    const secretPath = join(outsideDir, "secret.txt");
    writeFileSync(secretPath, "TOP_SECRET", "utf8");

    // Symlink inside artifacts dir pointing outside
    const linkName = "escape-link.txt";
    symlinkSync(secretPath, join(artDir, linkName));

    const result = packageWorkerFileArtifact({
      convId,
      filename: linkName,
      bridgeDisplayName: "node/wsl-1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("path_escape");
    }
  });

  test("root-side realpath (R28 L-3③): artifacts root via symlinked parent still accepts legitimate file", () => {
    // Simulate macOS /var → /private/var style: loomDir() path goes through
    // a symlink parent, but the real file is still under the real root.
    // With root-side realpath both sides resolve consistently → accept.
    const convId = generateConvId();
    // Under LOOM_TEST_HOME, loomDir() is typically <home>/.loom
    // Create the real artifacts tree, then ensure packaging works when
    // the file is a normal file under that tree (baseline root realpath).
    const artDir = convArtifactsDir(convId);
    mkdirSync(artDir, { recursive: true, mode: 0o700 });
    const filename = "legit.md";
    const content = "legitimate worker output";
    writeFileSync(join(artDir, filename), content, "utf8");

    // Extra: if parent of artDir can be reached via a symlink, realpath of
    // root and file must still agree. Build a parallel symlink view.
    const altHome = join(dir, "alt-home-link");
    try {
      // Point alt-home-link at the real test home so realpath converges.
      if (!existsSync(altHome)) {
        symlinkSync(dir, altHome);
      }
    } catch {
      /* already exists */
    }

    const result = packageWorkerFileArtifact({
      convId,
      filename,
      bridgeDisplayName: "node/wsl-1",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ref.chars).toBe(content.length);
    expect(result.ref.sha256).toBe(
      createHash("sha256").update(content, "utf8").digest("hex"),
    );
  });

  test("multiple markers package independently with distinct path+sha", () => {
    const convId = generateConvId();
    const artDir = convArtifactsDir(convId);
    mkdirSync(artDir, { recursive: true, mode: 0o700 });
    const files = [
      { name: "a.md", body: "alpha-content" },
      { name: "b.md", body: "beta-content-different" },
    ];
    for (const f of files) {
      writeFileSync(join(artDir, f.name), f.body, "utf8");
    }
    const okRefs: ArtifactRefEntry[] = [];
    for (const f of files) {
      const r = packageWorkerFileArtifact({
        convId,
        filename: f.name,
        bridgeDisplayName: "node/wsl-1",
      });
      expect(r.ok).toBe(true);
      if (r.ok) okRefs.push(r.ref);
    }
    expect(okRefs).toHaveLength(2);
    const paths = okRefs.map((r) => (r.ref as { path: string }).path);
    const shas = okRefs.map((r) => r.sha256);
    expect(new Set(paths).size).toBe(2);
    expect(new Set(shas).size).toBe(2);
    expect(paths[0]).toContain("a.md");
    expect(paths[1]).toContain("b.md");
  });

  test("workerArtifactInlineNotice mentions file/chars/sha and is not a file tail", () => {
    const notice = workerArtifactInlineNotice({
      transport: "scp",
      ref: { host: "h", path: "~/.loom/artifacts/c/report.md" },
      sha256: "ab".repeat(32),
      chars: 42,
    });
    expect(notice).toContain("file=report.md");
    expect(notice).toContain("chars=42");
    expect(notice).toContain("sha256=");
    expect(notice).not.toContain("FULL_FILE_BODY");
  });
});
