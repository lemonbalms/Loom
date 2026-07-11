export function encodeInviteLink(x: {
  relayUrl: string;
  token?: string;
  inviteCode: string;
}): string {
  const payload = {
    relayUrl: x.relayUrl,
    token: x.token,
    inviteCode: x.inviteCode,
  };
  return `loom://join/${Buffer.from(JSON.stringify(payload)).toString("base64url")}`;
}

export type InviteArg =
  | { kind: "code"; code: string }
  | { kind: "link"; relayUrl: string; token?: string; inviteCode: string }
  | { kind: "invalid"; reason: string };

/**
 * R19 M-1: classify by shape before decode; LOOM-XXXX codes are valid-looking
 * base64url and must never be blob-decoded.
 */
export function parseInviteArg(arg: string): InviteArg {
  const trimmed = arg.trim();
  if (/^LOOM-[A-Z2-9-]+$/i.test(trimmed)) {
    return { kind: "code", code: trimmed };
  }

  if (trimmed.startsWith("loom://join/")) {
    try {
      const encoded = trimmed.slice("loom://join/".length);
      const decoded = Buffer.from(encoded, "base64url").toString("utf8");
      const result: unknown = JSON.parse(decoded);
      if (!result || typeof result !== "object") {
        return { kind: "invalid", reason: "link payload is not an object" };
      }
      const payload = result as {
        relayUrl?: unknown;
        token?: unknown;
        inviteCode?: unknown;
      };
      if (typeof payload.relayUrl !== "string" || payload.relayUrl.length === 0) {
        return { kind: "invalid", reason: "link missing relayUrl" };
      }
      if (
        typeof payload.inviteCode !== "string" ||
        payload.inviteCode.length === 0
      ) {
        return { kind: "invalid", reason: "link missing inviteCode" };
      }
      if (payload.token !== undefined && typeof payload.token !== "string") {
        return { kind: "invalid", reason: "link token must be a string" };
      }
      return {
        kind: "link",
        relayUrl: payload.relayUrl,
        token: payload.token,
        inviteCode: payload.inviteCode,
      };
    } catch {
      return { kind: "invalid", reason: "link payload is not valid JSON" };
    }
  }

  return {
    kind: "invalid",
    reason: "not a LOOM- code or loom://join/ link",
  };
}
