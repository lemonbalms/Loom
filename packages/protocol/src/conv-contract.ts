/**
 * Conv (multiturn) contract v1 — rides inside handoff attachments; NOT a wire schema.
 * Mirrors card-contract.ts. Relay treats content as opaque text
 * (sanitizePeerText + 256k cap apply, same as card contract).
 * PLAN 0.23.0 / docs/CONV_SPEC.md (approved, R24 author-close)
 */
import { z } from "zod";
import { normalize as normalizePath } from "node:path";
import type { HandoffAttachment } from "./envelope";
import { generateId } from "./codes";
import { DispatchAgentKindSchema } from "./card-contract";

export const CONV_CONTRACT_VERSION = 1 as const;

export const CONV_OPEN_LABEL = "loom-conv-open";
export const CONV_ACCEPT_LABEL = "loom-conv-accept";
export const CONV_REJECT_LABEL = "loom-conv-reject";
export const CONV_TURN_LABEL = "loom-conv-turn";
export const CONV_CLOSE_LABEL = "loom-conv-close";

/** CONV_SPEC §1.1 / §5.3① — generation authority = tower. */
export const ConvIdSchema = z.string().regex(/^conv_[a-f0-9]{16}$/);
export type ConvId = z.infer<typeof ConvIdSchema>;

/** §5.1 — inline payload threshold; over this, artifacts[] is mandatory (no truncation). */
export const MAX_CONV_TURN_INLINE_CHARS = 32_000;

/** §3.3 — assignment convention: open=0 (tower), accept=1 (worker), then tower=even/worker=odd. */
export const CONV_OPEN_SEQ = 0;
export const CONV_ACCEPT_SEQ = 1;

export function isTowerSeq(seq: number): boolean {
  return Number.isInteger(seq) && seq >= 0 && seq % 2 === 0;
}
export function isWorkerSeq(seq: number): boolean {
  return Number.isInteger(seq) && seq >= 1 && seq % 2 === 1;
}

/** Next seq for "own side" turns, given the last seq this side emitted (or its initial seq). */
export function nextOwnSeq(lastOwnSeq: number): number {
  return lastOwnSeq + 2;
}

export const ConvKindSchema = z.enum(["normal", "blocked", "done_proposal"]);
export type ConvKind = z.infer<typeof ConvKindSchema>;

/** §2.1 — scope fixed at open, no mid-conv expansion. Slice allowlist mirrors card (claude only). */
export const ConvScopeSchema = z.object({
  cwd: z.string().max(1_000).optional(),
  agentKind: DispatchAgentKindSchema,
  writesAllowed: z.boolean().default(false),
});
export type ConvScope = z.infer<typeof ConvScopeSchema>;

/** §2.2 — turn cap (default 20) / wall-clock timeout (default 2h), settable at open. */
export const ConvLimitsSchema = z.object({
  maxTurns: z.number().int().positive().max(1_000).default(20),
  wallClockMs: z
    .number()
    .int()
    .positive()
    .max(24 * 60 * 60 * 1000)
    .default(2 * 60 * 60 * 1000),
});
export type ConvLimits = z.infer<typeof ConvLimitsSchema>;

export const ConvOpenPayloadSchema = z.object({
  v: z.literal(CONV_CONTRACT_VERSION),
  convId: ConvIdSchema,
  goal: z.string().min(1).max(2_000),
  scope: ConvScopeSchema,
  limits: ConvLimitsSchema,
});
export type ConvOpenPayload = z.infer<typeof ConvOpenPayloadSchema>;

export const ConvAcceptPayloadSchema = z.object({
  v: z.literal(CONV_CONTRACT_VERSION),
  convId: ConvIdSchema,
});
export type ConvAcceptPayload = z.infer<typeof ConvAcceptPayloadSchema>;

export const ConvRejectPayloadSchema = z.object({
  v: z.literal(CONV_CONTRACT_VERSION),
  convId: ConvIdSchema,
  reason: z.string().max(300),
});
export type ConvRejectPayload = z.infer<typeof ConvRejectPayloadSchema>;

// --- §5.3 artifact ref schema -----------------------------------------

export const GitArtifactRefSchema = z.object({
  branch: z.string().min(1).max(300),
  commit: z.string().max(100).optional(),
  path: z.string().max(1_000).optional(),
});
export type GitArtifactRef = z.infer<typeof GitArtifactRefSchema>;

/**
 * §5.3③: `host` rides the wire as bookkeeping only — it is NEVER trusted as
 * the actual scp target. Validation always resolves host from the
 * receiver's local conv→node mapping (see validateScpArtifactRef).
 */
export const ScpArtifactRefSchema = z.object({
  host: z.string().max(300).optional(),
  path: z.string().min(1).max(1_000),
});
export type ScpArtifactRef = z.infer<typeof ScpArtifactRefSchema>;

export const ArtifactRefEntrySchema = z.object({
  transport: z.enum(["git", "scp"]),
  ref: z.union([GitArtifactRefSchema, ScpArtifactRefSchema]),
  /** §5.3④: post-fetch integrity check only — not a fetch-command defense. */
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/i)
    .optional(),
  chars: z.number().int().nonnegative().optional(),
  gist: z.string().max(900).optional(),
});
export type ArtifactRefEntry = z.infer<typeof ArtifactRefEntrySchema>;

export const ConvTurnPayloadSchema = z.object({
  v: z.literal(CONV_CONTRACT_VERSION),
  convId: ConvIdSchema,
  seq: z.number().int().nonnegative(),
  kind: ConvKindSchema,
  text: z.string().max(MAX_CONV_TURN_INLINE_CHARS),
  artifacts: z.array(ArtifactRefEntrySchema).max(16).optional(),
});
export type ConvTurnPayload = z.infer<typeof ConvTurnPayloadSchema>;

/** §3.2 — conv.close is tower-only, reason: done|abort. */
export const ConvCloseReasonSchema = z.enum(["done", "abort"]);
export type ConvCloseReason = z.infer<typeof ConvCloseReasonSchema>;

export const ConvClosePayloadSchema = z.object({
  v: z.literal(CONV_CONTRACT_VERSION),
  convId: ConvIdSchema,
  reason: ConvCloseReasonSchema,
});
export type ConvClosePayload = z.infer<typeof ConvClosePayloadSchema>;

/** §1.1 — convId generation authority = tower. Reuses codes.generateId's 16-hex format. */
export function generateConvId(): ConvId {
  return generateId("conv") as ConvId;
}

export function isValidConvId(id: string): boolean {
  return ConvIdSchema.safeParse(id).success;
}

// --- M-2 (R24/R25) artifact ref validation ------------------------------

export type GitFetchPlan = {
  /** argv for `git`, e.g. ["fetch", "origin", "--", "conv/<id>/…"]. Never shell-concat. */
  args: string[];
  remote: string;
  branch: string;
};

/**
 * §5.3 M-2 ②: branch must match `conv/<convId>/` prefix, `--` separator before
 * ref values, leading `-` rejected (option-injection), remote must be a
 * name already known locally (wire host/URL is never used to add a remote).
 */
export function validateGitArtifactRef(
  convId: string,
  ref: GitArtifactRef,
  knownRemotes: string[],
  remoteName = "origin",
): { ok: true; plan: GitFetchPlan } | { ok: false; error: string } {
  if (!isValidConvId(convId)) {
    return { ok: false, error: "invalid convId" };
  }
  const branchPrefix = `conv/${convId}/`;
  if (!ref.branch.startsWith(branchPrefix)) {
    return {
      ok: false,
      error: `branch must start with ${branchPrefix} (got ${ref.branch})`,
    };
  }
  if (ref.branch.startsWith("-")) {
    return { ok: false, error: "branch must not start with -" };
  }
  if (ref.commit !== undefined && ref.commit.startsWith("-")) {
    return { ok: false, error: "commit must not start with -" };
  }
  if (!knownRemotes.includes(remoteName)) {
    return {
      ok: false,
      error: `remote "${remoteName}" is not in the local known-remotes list — wire host/URL is never used to add a remote`,
    };
  }
  return {
    ok: true,
    plan: {
      remote: remoteName,
      branch: ref.branch,
      args: ["fetch", remoteName, "--", ref.branch],
    },
  };
}

/**
 * §5.3 M-2 ③: scp `host` is resolved from the receiver's LOCAL conv→node
 * mapping — the wire `ref.host` field is never trusted for the actual
 * fetch target. `path` is normalized then must live under the caller-
 * supplied artifacts root for this convId (typically
 * `~/.loom/artifacts/<convId>/`, expanded host-side — protocol stays
 * loomDir()-agnostic per M-14).
 */
export function validateScpArtifactRef(
  convId: string,
  ref: ScpArtifactRef,
  resolveHost: (convId: string) => string | null,
  artifactsRoot: string,
): { ok: true; host: string; path: string } | { ok: false; error: string } {
  if (!isValidConvId(convId)) {
    return { ok: false, error: "invalid convId" };
  }
  const host = resolveHost(convId);
  if (!host) {
    return {
      ok: false,
      error: "no local conv→node mapping for scp host (wire host is not trusted)",
    };
  }
  const root = artifactsRoot.endsWith("/") ? artifactsRoot : `${artifactsRoot}/`;
  const normalized = normalizePath(ref.path);
  if (!normalized.startsWith(root) && normalized !== root.slice(0, -1)) {
    return {
      ok: false,
      error: `path must be under ${root} (got ${normalized})`,
    };
  }
  return { ok: true, host, path: normalized };
}

// --- body builders (mirrors buildDispatchBody/buildResultBody) --------

export function buildConvOpenBody(opts: { goal: string; convId: string }): string {
  const goal = opts.goal.replace(/\r?\n/g, " ").slice(0, 200) || "conv";
  return [
    `[GOAL] ${goal}`,
    "intent: conv.open",
    `conv: ${opts.convId}`,
    `seq: ${CONV_OPEN_SEQ}`,
  ].join("\n");
}

export function buildConvAcceptBody(opts: { convId: string }): string {
  return [
    "intent: conv.accept",
    `conv: ${opts.convId}`,
    `seq: ${CONV_ACCEPT_SEQ}`,
  ].join("\n");
}

export function buildConvRejectBody(opts: { convId: string; reason: string }): string {
  const reason = opts.reason.replace(/\r?\n/g, " ").slice(0, 200);
  return ["intent: conv.reject", `conv: ${opts.convId}`, reason].join("\n");
}

export function buildConvTurnBody(opts: {
  convId: string;
  seq: number;
  kind: ConvKind;
}): string {
  return [
    "intent: conv.turn",
    `conv: ${opts.convId}`,
    `seq: ${opts.seq}`,
    `kind: ${opts.kind}`,
  ].join("\n");
}

export function buildConvCloseBody(opts: {
  convId: string;
  reason: ConvCloseReason;
}): string {
  return [
    "intent: conv.close",
    `conv: ${opts.convId}`,
    `reason: ${opts.reason}`,
  ].join("\n");
}

// --- attachment helpers (reuse card-contract's generic serialize/extract) --

export {
  makeTextAttachment,
  serializeCardAttachment as serializeConvAttachment,
  cardPayloadFromAttachments as convPayloadFromAttachments,
  UNTRUSTED_HANDOFF_MARKER,
  wrapUntrustedPrompt,
} from "./card-contract";

/** Which conv label (if any) is present on this attachment set. */
export function convLabelOf(
  attachments: { kind: string; label?: string }[] | undefined,
): string | null {
  const labels = [
    CONV_OPEN_LABEL,
    CONV_ACCEPT_LABEL,
    CONV_REJECT_LABEL,
    CONV_TURN_LABEL,
    CONV_CLOSE_LABEL,
  ];
  const hit = attachments?.find(
    (a) => a.kind === "text" && a.label && labels.includes(a.label),
  );
  return hit?.label ?? null;
}

/** Best-effort convId peek without full schema validation (used to pre-filter before claim). */
export function peekConvIdFromAttachments(
  attachments: { kind: string; label?: string; content: string }[] | undefined,
): string | null {
  const label = convLabelOf(attachments);
  if (!label) return null;
  const att = attachments?.find((a) => a.label === label);
  if (!att) return null;
  try {
    const j = JSON.parse(att.content) as { convId?: string };
    return typeof j.convId === "string" ? j.convId : null;
  } catch {
    return null;
  }
}

export type HandoffAttachmentLike = HandoffAttachment;
