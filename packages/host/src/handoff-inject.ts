import {
  formatHandoffBlock,
  sanitizePeerText,
  type HandoffPayload,
  type PeerInfo,
} from "@loom/protocol";

/**
 * Format a handoff for terminal display.
 * Body is sanitized inside formatHandoffBlock.
 */
export function formatIncomingHandoff(
  handoff: HandoffPayload,
  from?: PeerInfo,
): string {
  const trust =
    "\x1b[33m⚠ Untrusted handoff content — review before acting\x1b[0m\n";
  return trust + formatHandoffBlock(handoff, from);
}

/** Payload prepared for optional Phase 1.5 stdin injection. */
export type InjectPayload = {
  /** Sanitized text that would be written (always ends with newline). */
  text: string;
  /** Whether inject is allowed by product policy (default path: false). */
  allowedByDefault: false;
};

/**
 * Build a sanitized inject string for spike / future opt-in only.
 * Never used on the default receive path (PLAN: pull queue + check/claim).
 */
export function prepareInjectText(
  handoff: HandoffPayload,
  from?: PeerInfo,
): InjectPayload {
  // formatHandoffBlock already sanitizes body/labels; re-sanitize whole block
  // for defense in depth before any experimental stdin write.
  const cleaned = sanitizePeerText(formatHandoffBlock(handoff, from));
  const text = cleaned.endsWith("\n") ? cleaned : cleaned + "\n";
  return { text, allowedByDefault: false };
}

export type InjectResult =
  | { ok: true }
  | { ok: false; reason: "no_stdin" | "write_failed" | "policy_blocked" };

/**
 * Write text to a child process stdin.
 *
 * **Default product path: do not call.** PTY/stdin inject is Phase 1.5 spike
 * only. Enable only behind an explicit experimental flag after go/no-go.
 *
 * Risks (R1): fullscreen TUIs (Ink/ratatui) may garble input queue or submit
 * mid-generation. Prefer queue + `check_handoffs` / `fable inbox`.
 */
export function injectIntoStdin(
  stdin: { write(data: string | Buffer): unknown } | null | undefined,
  text: string,
  opts?: { /** Must be true — guards against accidental default-path use */
    experimental?: boolean },
): InjectResult {
  if (!opts?.experimental) {
    return { ok: false, reason: "policy_blocked" };
  }
  if (!stdin) return { ok: false, reason: "no_stdin" };
  try {
    const payload = text.endsWith("\n") ? text : text + "\n";
    stdin.write(payload);
    return { ok: true };
  } catch {
    return { ok: false, reason: "write_failed" };
  }
}
