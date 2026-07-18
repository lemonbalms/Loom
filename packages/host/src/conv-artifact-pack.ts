/**
 * Worker/bridge-side §5.2 artifact packaging (PLAN 0.23.1, R26): when a
 * conv turn's pane scrape exceeds the 32k inline threshold, write the FULL
 * recovered scrape to `loomDir()/artifacts/<convId>/turn-<seq>.txt`
 * (dir 0700, file 0600, M-14 via loomDir()) and return a ≤32k inline gist
 * plus the wire artifacts[] entry (scp transport, tilde-literal `ref.path`
 * — R26 L-1). Replaces the 0.22.0-era tail-truncate MVP-gap fallback.
 *
 * PLAN 0.23.3 (R28): worker-declared file-based artifact trigger — the
 * worker writes a file into the conv artifacts dir and prints an exact-line
 * `[ARTIFACT] <filename>` marker; the bridge validates + realpath-contains,
 * then reuses the emission contract only (no file-write step — R28 M-1).
 *
 * "전문 보존" (R26 L-2): this packages the full text of what pane.read
 * actually recovered — the caller's recovery window (e.g. `recent` 200
 * lines). Output outside that window was never scraped and is not in the
 * artifact file either; the inline notice says so explicitly rather than
 * overclaiming "full output".
 */
import {
  mkdirSync,
  writeFileSync,
  chmodSync,
  realpathSync,
  statSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { join, sep } from "node:path";
import { createHash } from "node:crypto";
import {
  MAX_CONV_TURN_INLINE_CHARS,
  truncateTail,
  convArtifactsRootLiteral,
  type ArtifactRefEntry,
} from "@loom/protocol";
import { loomDir } from "./session-store";

/** ArtifactRefEntrySchema.gist max (packages/protocol/src/conv-contract.ts). */
const ARTIFACT_GIST_MAX = 900;

/** PLAN 0.23.3 — worker file artifact size cap (fail-closed above). */
export const MAX_WORKER_ARTIFACT_BYTES = 10 * 1024 * 1024;

/** PLAN 0.23.3 — max file-based artifact refs emitted per turn. */
export const MAX_WORKER_ARTIFACTS_PER_TURN = 4;

/** Exact-line marker: entire trimmed line is `[ARTIFACT] <token>` (single space, any non-space token).
 *  Charset/path validation is deferred to validateArtifactMarkerFilename so bad tokens
 *  still produce a bridge note (R28 / PLAN: 위반 시 마커 무시 + bridge note). */
const ARTIFACT_MARKER_LINE = /^\[ARTIFACT\] (\S+)$/;

/** Bridge-reserved namespace for measured-trigger `turn-<seq>.txt` (R28 M-1). */
const RESERVED_TURN_NS = /^turn-/;

export type PackagedConvTurn = {
  /** ≤MAX_CONV_TURN_INLINE_CHARS: tail excerpt of the full text + artifact notice. */
  text: string;
  artifacts: ArtifactRefEntry[];
};

export function convArtifactsDir(convId: string): string {
  return join(loomDir(), "artifacts", convId);
}

/**
 * Writes the full text to `turn-<seq>.txt` under the convId's artifacts
 * dir (creating both with tightened permissions), and returns the ≤32k
 * inline payload (`text`) + the wire `artifacts[]` entry for the turn.
 */
export function packageConvTurnArtifact(opts: {
  convId: string;
  seq: number;
  fullText: string;
  bridgeDisplayName: string;
  recoveryWindowDescription: string;
}): PackagedConvTurn {
  const dir = convArtifactsDir(opts.convId);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    chmodSync(dir, 0o700);
  } catch {
    /* best effort — mkdirSync's mode already applied on most platforms */
  }
  const filename = `turn-${opts.seq}.txt`;
  const filePath = join(dir, filename);
  writeFileSync(filePath, opts.fullText, { encoding: "utf8", mode: 0o600 });
  try {
    chmodSync(filePath, 0o600);
  } catch {
    /* best effort */
  }

  const sha256 = createHash("sha256").update(opts.fullText, "utf8").digest("hex");
  const chars = opts.fullText.length;
  const wirePath = `${convArtifactsRootLiteral(opts.convId)}/${filename}`;

  const notice = [
    "",
    "",
    `(artifact: full ${opts.recoveryWindowDescription} scrape saved out-of-band — §5.1/§5.2, no truncation)`,
    `convId=${opts.convId} file=${filename} chars=${chars} sha256=${sha256}`,
    "fetch: conv_await presents a ready-to-review scp command for this ref (never auto-executed).",
  ].join("\n");

  const tailBudget = Math.max(0, MAX_CONV_TURN_INLINE_CHARS - notice.length);
  const tail = truncateTail(opts.fullText, tailBudget);
  const text = `${tail.text}${notice}`.slice(0, MAX_CONV_TURN_INLINE_CHARS);

  const gist = `full scrape ${chars} chars (sha256 ${sha256.slice(0, 12)}…) — ${filename}`.slice(
    0,
    ARTIFACT_GIST_MAX,
  );

  const artifacts: ArtifactRefEntry[] = [
    {
      transport: "scp",
      ref: { host: opts.bridgeDisplayName, path: wirePath },
      sha256,
      chars,
      gist,
    },
  ];

  return { text, artifacts };
}

/**
 * PLAN 0.23.3 / R28 L-1 — exact-line anchor: a line matches only if the
 * ENTIRE trimmed line is `[ARTIFACT] <token>` (single space, non-space token).
 * Returns tokens in order of appearance, deduped within the scrape.
 * Validation (charset/path) is caller's job so invalid tokens still surface.
 */
export function scanArtifactMarkers(scrape: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of scrape.split(/\r?\n/)) {
    const line = raw.trim();
    const m = ARTIFACT_MARKER_LINE.exec(line);
    if (!m) continue;
    const name = m[1]!;
    if (seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

/**
 * PLAN 0.23.3 filename rules: empty, length > 200, charset outside
 * `[A-Za-z0-9._-]` (also excludes path separators / `..`), leading `-` or
 * `.`, and bridge-reserved `turn-*` (R28 M-1).
 */
export function validateArtifactMarkerFilename(
  name: string,
): { ok: true } | { ok: false; reason: string } {
  if (!name) return { ok: false, reason: "empty_filename" };
  if (name.length > 200) return { ok: false, reason: "filename_too_long" };
  if (!/^[A-Za-z0-9._-]+$/.test(name)) {
    return { ok: false, reason: "filename_charset" };
  }
  if (name.startsWith("-")) return { ok: false, reason: "filename_leading_dash" };
  if (name.startsWith(".")) return { ok: false, reason: "filename_leading_dot" };
  if (RESERVED_TURN_NS.test(name)) {
    return { ok: false, reason: "filename_reserved_turn_ns" };
  }
  return { ok: true };
}

/**
 * PLAN 0.23.3 / R28 M-1 — emission-contract reuse only: the worker already
 * wrote the file; do NOT write or rewrite. realpath containment on both
 * root and candidate (R28 L-3③).
 */
export function packageWorkerFileArtifact(opts: {
  convId: string;
  filename: string;
  bridgeDisplayName: string;
}): { ok: true; ref: ArtifactRefEntry } | { ok: false; reason: string } {
  const root = convArtifactsDir(opts.convId);
  const candidate = join(root, opts.filename);

  if (!existsSync(candidate)) {
    return { ok: false, reason: "file_not_found" };
  }

  let realRoot: string;
  let realFile: string;
  try {
    // Ensure root exists for realpath; worker may have created it, but
    // mkdir is worker-side. If root missing, containment fails closed.
    if (!existsSync(root)) {
      return { ok: false, reason: "file_not_found" };
    }
    realRoot = realpathSync(root);
    realFile = realpathSync(candidate);
  } catch {
    return { ok: false, reason: "file_not_found" };
  }

  // R28 L-3③: root-side realpath so macOS /var→/private/var does not false-reject.
  if (!(realFile === realRoot || realFile.startsWith(realRoot + sep))) {
    return { ok: false, reason: "path_escape" };
  }

  let st: ReturnType<typeof statSync>;
  try {
    st = statSync(realFile);
  } catch {
    return { ok: false, reason: "file_not_found" };
  }
  if (!st.isFile()) {
    return { ok: false, reason: "not_regular_file" };
  }
  if (st.size > MAX_WORKER_ARTIFACT_BYTES) {
    return { ok: false, reason: "file_too_large" };
  }

  let content: string;
  try {
    content = readFileSync(realFile, "utf8");
  } catch {
    return { ok: false, reason: "file_not_found" };
  }

  const sha256 = createHash("sha256").update(content, "utf8").digest("hex");
  const chars = content.length;
  // ref filename = marker filename verbatim (R28 M-1)
  const wirePath = `${convArtifactsRootLiteral(opts.convId)}/${opts.filename}`;
  const gist =
    `worker file ${chars} chars (sha256 ${sha256.slice(0, 12)}…) — ${opts.filename}`.slice(
      0,
      ARTIFACT_GIST_MAX,
    );

  const ref: ArtifactRefEntry = {
    transport: "scp",
    ref: { host: opts.bridgeDisplayName, path: wirePath },
    sha256,
    chars,
    gist,
  };
  return { ok: true, ref };
}

/**
 * Short inline notice for a worker file-based artifact (R28 M-1 — append
 * to scrape; do NOT replace text with a file tail).
 */
export function workerArtifactInlineNotice(ref: ArtifactRefEntry): string {
  const path = (ref.ref as { path?: string }).path ?? "";
  const name = path.includes("/") ? path.slice(path.lastIndexOf("/") + 1) : path;
  return `(artifact: file=${name} chars=${ref.chars ?? 0} sha256=${ref.sha256 ?? ""} — fetch via conv_await presented command)`;
}
