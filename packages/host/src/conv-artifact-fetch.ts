/**
 * PLAN 0.25.0 / R40 — tower-side `conv_fetch`: actually retrieve an scp
 * artifact ref from a bridge node by coordinate (convId, seq, index).
 *
 * Trust model (D1–D7, M-A..M-D):
 * - Caller supplies coordinates only; host/path/sha come from server-side
 *   stored turn artifacts (conv-state artifactsBySeq, fresh-turn only).
 * - Exec path re-validates host (validateConvNodeHost full, M-B) and remote
 *   path charset/isSafeConvSuffix (M-C). Local shell is never involved —
 *   argv array is spawned directly (D4). Remote path is still interpreted by
 *   the remote sshd shell; M-C closes that residual gap.
 * - Destination is loomDir()/artifacts/<convId>/ + basename, containment
 *   checked with realpath on the root too (D5, macOS /var→/private/var).
 * - Post-fetch sha256 mismatch ⇒ immediate delete + fail (D6). Missing
 *   sha256 on the ref ⇒ reject (M-A, present-only residual).
 * - 60s timeout · 10MiB cap · per-convId in-memory serialization (D7).
 *
 * U2 (R40 L-3): OpenSSH scp on this platform accepts `--` as option
 * terminator (OpenSSH_10.2p1 verified 2026-07-19); we include `--` in argv.
 * Fallback if unsupported elsewhere: M-B/M-C already reject leading `-` on
 * host and path segments + fixed `-o BatchMode=yes` only.
 *
 * L-2: destination assembly and containment use node:path (join/resolve/
 * basename/sep) — no POSIX-separator hardcoding (0.24.2 defect-1 class).
 */
import {
  existsSync,
  mkdirSync,
  unlinkSync,
  statSync,
  readFileSync,
  realpathSync,
  chmodSync,
} from "node:fs";
import { join, resolve, basename, sep } from "node:path";
import { createHash } from "node:crypto";
import {
  validateScpArtifactRef,
  convArtifactsRootLiteral,
  isSafeConvSuffix,
  type ArtifactRefEntry,
  type ScpArtifactRef,
} from "@loom/protocol";
import { loomDir } from "./session-store";
import { getStoredArtifactRef } from "./conv-state";
import {
  resolveScpHostForConv,
} from "./conv-artifact-present";
import {
  validateConvNodeHost,
} from "./conv-node-hosts";
import { MAX_WORKER_ARTIFACT_BYTES } from "./conv-artifact-pack";

/** D7① default scp process timeout. */
export const CONV_FETCH_TIMEOUT_MS = 60_000;

/**
 * U2 / R40 L-3: scp `--` option terminator is supported on the measured
 * OpenSSH (10.2p1, macOS). Always include it in assembled argv.
 */
export const SCP_SUPPORTS_OPTION_TERMINATOR = true;

export type ConvFetchOk = {
  ok: true;
  /** Verbatim argv actually spawned (M-25 / D1 — never silent exec). */
  argv: string[];
  /** Local absolute path of the received file. */
  destPath: string;
  /** Verified sha256 (matches ref.sha256). */
  sha256: string;
  /** Byte length of the received file. */
  bytes: number;
  /** Optional chars from the ref (secondary, not integrity-critical). */
  chars?: number;
};

export type ConvFetchErr = {
  ok: false;
  error: string;
};

export type ConvFetchResult = ConvFetchOk | ConvFetchErr;

export type ConvFetchRunScp = (
  argv: string[],
  signal: AbortSignal,
) => Promise<{ exitCode: number; stderr: string }>;

export type ConvFetchOpts = {
  convId: string;
  seq: number;
  index: number;
  /** Test injection — default Bun.spawn scp. */
  runScp?: ConvFetchRunScp;
  /** Test injection — default CONV_FETCH_TIMEOUT_MS. */
  timeoutMs?: number;
  /** Test injection — default MAX_WORKER_ARTIFACT_BYTES. */
  maxBytes?: number;
};

/** Per-convId serialization queue (D7③). */
const convFetchChains = new Map<string, Promise<unknown>>();

async function withConvFetchLock<T>(convId: string, fn: () => Promise<T>): Promise<T> {
  const prev = convFetchChains.get(convId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  // Keep the chain alive until this critical section finishes.
  const chained = prev.then(() => gate);
  convFetchChains.set(convId, chained);
  try {
    await prev.catch(() => {
      /* prior failure must not block the next fetch */
    });
    return await fn();
  } finally {
    release();
    // Drop the map entry only if we are still the tail.
    if (convFetchChains.get(convId) === chained) {
      convFetchChains.delete(convId);
    }
  }
}

/** Isolate (delete) a partial/bad local file. Best-effort. */
function isolateFile(path: string): void {
  try {
    if (existsSync(path)) unlinkSync(path);
  } catch {
    /* best effort */
  }
}

/**
 * Assemble scp argv (D4). Never shell-concat; never parse presentScpFetchCommand
 * render strings. Host/path must already be re-validated by the caller.
 */
export function buildScpFetchArgv(host: string, remotePath: string, destPath: string): string[] {
  const hostPath = `${host}:${remotePath}`;
  if (SCP_SUPPORTS_OPTION_TERMINATOR) {
    return ["scp", "-o", "BatchMode=yes", "--", hostPath, destPath];
  }
  // Fallback (unused when U2-supported): fixed -o only; leading-`-/:` rejected by M-B/M-C.
  return ["scp", "-o", "BatchMode=yes", hostPath, destPath];
}

async function defaultRunScp(
  argv: string[],
  signal: AbortSignal,
): Promise<{ exitCode: number; stderr: string }> {
  const proc = Bun.spawn(argv, {
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
    signal,
  });
  let stderr = "";
  try {
    stderr = await new Response(proc.stderr).text();
  } catch {
    stderr = "";
  }
  const exitCode = await proc.exited;
  return { exitCode, stderr };
}

/**
 * Ensure `candidate` realpath is strictly inside `rootReal` (or equal only if
 * candidate is the root itself — not used for files). Uses platform `sep`
 * (L-2 — no POSIX hardcoding). Both sides must already be realpath'd.
 */
export function isPathInsideRoot(rootReal: string, candidateReal: string): boolean {
  if (candidateReal === rootReal) return true;
  const prefix = rootReal.endsWith(sep) ? rootReal : rootReal + sep;
  return candidateReal.startsWith(prefix);
}

/**
 * Local destination directory for a conv's fetched artifacts (expanded
 * loomDir — not the tilde-literal remote root).
 */
export function convFetchLocalDir(convId: string): string {
  return join(loomDir(), "artifacts", convId);
}

/**
 * Coordinate → stored ref → re-validate → argv spawn → containment/sha/guards.
 * Metadata-only success (L-1) — never returns file contents.
 */
export async function convFetch(opts: ConvFetchOpts): Promise<ConvFetchResult> {
  return withConvFetchLock(opts.convId, () => convFetchUnlocked(opts));
}

async function convFetchUnlocked(opts: ConvFetchOpts): Promise<ConvFetchResult> {
  const { convId, seq, index } = opts;
  const timeoutMs = opts.timeoutMs ?? CONV_FETCH_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? MAX_WORKER_ARTIFACT_BYTES;
  const runScp = opts.runScp ?? defaultRunScp;

  if (!convId || typeof convId !== "string") {
    return { ok: false, error: "convId is required" };
  }
  if (!Number.isInteger(seq) || seq < 0) {
    return { ok: false, error: `invalid seq (non-negative integer required): ${String(seq)}` };
  }
  if (!Number.isInteger(index) || index < 0) {
    return {
      ok: false,
      error: `invalid index (non-negative integer required): ${String(index)}`,
    };
  }

  // D2 — coordinates only; resolve from server-side storage.
  const entry: ArtifactRefEntry | null = getStoredArtifactRef(convId, seq, index);
  if (!entry) {
    return {
      ok: false,
      error: `no stored artifact ref for convId=${convId} seq=${seq} index=${index} (unknown conv, missing turn, or out-of-range index)`,
    };
  }

  // D3 — scp only; git remains present-only.
  if (entry.transport !== "scp") {
    return {
      ok: false,
      error: `transport "${entry.transport}" is not fetchable via conv_fetch (v1 = scp only; git is present-only)`,
    };
  }

  // M-A — sha256 required for automatic fetch.
  if (!entry.sha256 || typeof entry.sha256 !== "string") {
    return {
      ok: false,
      error: "artifact ref has no sha256 — present-only (M-A: automatic fetch requires sha256)",
    };
  }
  const expectedSha = entry.sha256.toLowerCase();

  const scpRef = entry.ref as ScpArtifactRef;
  const artifactsRoot = convArtifactsRootLiteral(convId);

  // D4① re-validate path prefix + host resolution (never trust wire ref.host).
  const validated = validateScpArtifactRef(
    convId,
    scpRef,
    resolveScpHostForConv,
    artifactsRoot,
  );
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  // M-B — full validateConvNodeHost re-apply on resolved host (mapping may be
  // hand-edited / non-strict-loaded; resolveScpHostForConv does not recheck).
  const hostErr = validateConvNodeHost(validated.host);
  if (hostErr) {
    return {
      ok: false,
      error: `host failed exec-path re-validation (M-B): ${hostErr}`,
    };
  }

  // M-C — remote path charset + isSafeConvSuffix on the convId-prefix suffix.
  // argv direct spawn defeats *local* shell interpolation only; classic scp
  // still has the *remote* sshd shell interpret the path — this check closes
  // that residual gap (R40 M-C).
  const root = artifactsRoot.endsWith("/") ? artifactsRoot : `${artifactsRoot}/`;
  const bareRoot = root.slice(0, -1);
  // validated.path comes from normalizePath — compare against tilde-literal
  // root with the same form the validator used (forward-slash convention on
  // the wire). Use the validator's path for remote; basename via node:path
  // for the local dest (L-2 — no POSIX hardcoding on the local side).
  const remotePath = validated.path;
  const suffix = remotePath === bareRoot ? "" : remotePath.startsWith(root)
    ? remotePath.slice(root.length)
    : // normalize may have produced a non-prefix form on exotic platforms;
      // fail closed rather than skip charset (L-2).
      null;
  if (suffix === null) {
    return {
      ok: false,
      error: `path normalize/platform mismatch under ${root} (got ${remotePath}) — fail-closed (L-2)`,
    };
  }
  if (!isSafeConvSuffix(suffix)) {
    return {
      ok: false,
      error: `path suffix "${suffix}" fails exec-path charset allowlist [A-Za-z0-9._/-] / isSafeConvSuffix (M-C)`,
    };
  }

  // D5 — local dest under loomDir()/artifacts/<convId>/, basename only.
  // L-2: join/basename/sep from node:path — no POSIX separator assumptions.
  const destDir = convFetchLocalDir(convId);
  mkdirSync(destDir, { recursive: true, mode: 0o700 });
  let destDirReal: string;
  try {
    destDirReal = realpathSync(destDir);
  } catch (e) {
    return {
      ok: false,
      error: `cannot realpath destination root: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  // Basename of the remote path — use platform-aware basename on a form that
  // may contain `/` (wire always uses `/`). node:path.basename handles both
  // seps on most platforms; also strip trailing seps.
  const fileName = basename(remotePath.replace(/\/+$/, "")) || "artifact";
  if (!fileName || fileName === "." || fileName === "..") {
    return { ok: false, error: `ref path has no usable basename: ${remotePath}` };
  }
  // Reject basename that would be option-like even after M-C (defense in depth).
  if (fileName.startsWith("-")) {
    return { ok: false, error: `basename must not start with '-': ${fileName}` };
  }

  const destPath = join(destDirReal, fileName);
  // Containment of the *intended* dest (before write) — resolve under root.
  const destResolved = resolve(destDirReal, fileName);
  if (!isPathInsideRoot(destDirReal, destResolved) || destResolved !== destPath) {
    return {
      ok: false,
      error: `destination escapes conv artifacts root (containment): ${destResolved}`,
    };
  }

  // D5 overwrite reject.
  if (existsSync(destPath)) {
    return {
      ok: false,
      error: `destination already exists (overwrite rejected, D5): ${destPath}`,
    };
  }

  const argv = buildScpFetchArgv(validated.host, remotePath, destPath);

  // D4 — shell-free argv spawn with timeout (D7①).
  let runResult: { exitCode: number; stderr: string };
  try {
    const signal = AbortSignal.timeout(timeoutMs);
    runResult = await runScp(argv, signal);
  } catch (e) {
    isolateFile(destPath);
    const msg = e instanceof Error ? e.message : String(e);
    const timedOut =
      msg.includes("AbortError") ||
      msg.includes("aborted") ||
      msg.includes("timeout") ||
      (e instanceof Error && e.name === "TimeoutError") ||
      (e instanceof Error && e.name === "AbortError");
    return {
      ok: false,
      error: timedOut
        ? `scp timed out after ${timeoutMs}ms (D7) — partial file isolated`
        : `scp spawn failed: ${msg}`,
    };
  }

  if (runResult.exitCode !== 0) {
    isolateFile(destPath);
    const detail = (runResult.stderr || "").trim().slice(0, 400);
    return {
      ok: false,
      error: `scp exited ${runResult.exitCode}${detail ? `: ${detail}` : ""}`,
    };
  }

  if (!existsSync(destPath)) {
    return {
      ok: false,
      error: `scp reported success but destination missing: ${destPath}`,
    };
  }

  // D5 post-write containment — realpath the file (symlink escape guard).
  let destReal: string;
  try {
    destReal = realpathSync(destPath);
  } catch (e) {
    isolateFile(destPath);
    return {
      ok: false,
      error: `cannot realpath received file: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  if (!isPathInsideRoot(destDirReal, destReal)) {
    isolateFile(destPath);
    return {
      ok: false,
      error: `received file escapes conv artifacts root (containment): ${destReal}`,
    };
  }

  // D7② size cap.
  let bytes: number;
  try {
    bytes = statSync(destPath).size;
  } catch (e) {
    isolateFile(destPath);
    return {
      ok: false,
      error: `cannot stat received file: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  if (bytes > maxBytes) {
    isolateFile(destPath);
    return {
      ok: false,
      error: `received file exceeds ${maxBytes} byte cap (D7, got ${bytes}) — isolated`,
    };
  }

  // D6 post-fetch sha256.
  let actualSha: string;
  try {
    const buf = readFileSync(destPath);
    actualSha = createHash("sha256").update(buf).digest("hex");
  } catch (e) {
    isolateFile(destPath);
    return {
      ok: false,
      error: `cannot hash received file: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  if (actualSha !== expectedSha) {
    isolateFile(destPath);
    return {
      ok: false,
      error: `sha256 mismatch (D6): expected ${expectedSha}, got ${actualSha} — file isolated`,
    };
  }

  // Tighten perms best-effort.
  try {
    chmodSync(destPath, 0o600);
  } catch {
    /* best effort */
  }

  const result: ConvFetchOk = {
    ok: true,
    argv,
    destPath: destReal,
    sha256: actualSha,
    bytes,
  };
  if (typeof entry.chars === "number") result.chars = entry.chars;
  return result;
}

/** Test-only: clear the in-memory serialization map (between suites). */
export function _resetConvFetchLocksForTests(): void {
  convFetchChains.clear();
}
