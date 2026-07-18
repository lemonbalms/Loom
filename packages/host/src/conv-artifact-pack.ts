/**
 * Worker/bridge-side §5.2 artifact packaging (PLAN 0.23.1, R26): when a
 * conv turn's pane scrape exceeds the 32k inline threshold, write the FULL
 * recovered scrape to `loomDir()/artifacts/<convId>/turn-<seq>.txt`
 * (dir 0700, file 0600, M-14 via loomDir()) and return a ≤32k inline gist
 * plus the wire artifacts[] entry (scp transport, tilde-literal `ref.path`
 * — R26 L-1). Replaces the 0.22.0-era tail-truncate MVP-gap fallback.
 *
 * "전문 보존" (R26 L-2): this packages the full text of what pane.read
 * actually recovered — the caller's recovery window (e.g. `recent` 200
 * lines). Output outside that window was never scraped and is not in the
 * artifact file either; the inline notice says so explicitly rather than
 * overclaiming "full output".
 */
import { mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
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
