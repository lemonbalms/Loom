/**
 * Tower-side M-2 consumption (PLAN 0.23.1, R26): renders *presented* (never
 * executed) fetch commands for artifacts[] on an incoming conv turn.
 * docs/CONV_SPEC.md §5.3, docs/PLAN.md 0.23.1 "타워 — fetch 명령 제시".
 */
import {
  presentGitFetchCommand,
  presentScpFetchCommand,
  convArtifactsRootLiteral,
  type ArtifactRefEntry,
  type GitArtifactRef,
  type ScpArtifactRef,
  type PresentedFetchCommand,
} from "@loom/protocol";
import { loadConvState } from "./conv-state";
import { resolveConvNodeHost } from "./conv-node-hosts";

/**
 * R26 M-1: scp host resolution goes through the receiver-local peer→host
 * mapping (conv-node-hosts.ts), keyed by the conv's *pinned* peerId — never
 * the wire `ref.host` (self-reported bookkeeping only) and never a
 * displayName lookup (also self-reported, just as untrusted). Missing
 * mapping, or an unknown/unpinned conv, resolves to null ⇒ fail-closed.
 */
export function resolveScpHostForConv(convId: string): string | null {
  const state = loadConvState(convId, "tower");
  if (!state) return null;
  return resolveConvNodeHost(state.pinnedPeerId);
}

/**
 * §5.3 M-2 ②: git remote must already be known locally — `git remote` run
 * in the tower operator's current working directory. Wire host/URL is
 * never used to add a remote. Any failure (git missing, not a repo, etc.)
 * yields an empty list, which fails every git ref closed (no remote is
 * ever "known" by default).
 */
export function listLocalGitRemotes(cwd: string = process.cwd()): string[] {
  try {
    const res = Bun.spawnSync(["git", "remote"], { cwd });
    if (res.exitCode !== 0) return [];
    return res.stdout
      .toString("utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Renders one PresentedFetchCommand per artifact ref on a turn — validated
 * (M-2) + render-hardened (POSIX quoting + charset allowlist), never
 * executed. Order matches the input `artifacts` array.
 */
export function presentArtifactCommands(
  convId: string,
  artifacts: ArtifactRefEntry[],
): PresentedFetchCommand[] {
  const knownRemotes = listLocalGitRemotes();
  const artifactsRoot = convArtifactsRootLiteral(convId);
  return artifacts.map((entry): PresentedFetchCommand => {
    switch (entry.transport) {
      case "git":
        return presentGitFetchCommand(
          convId,
          entry.ref as GitArtifactRef,
          knownRemotes,
        );
      case "scp":
        return presentScpFetchCommand(
          convId,
          entry.ref as ScpArtifactRef,
          resolveScpHostForConv,
          artifactsRoot,
        );
      default:
        return {
          ok: false,
          transport: "scp",
          reason: `unsupported artifact transport: ${String((entry as { transport?: unknown }).transport)}`,
        };
    }
  });
}
