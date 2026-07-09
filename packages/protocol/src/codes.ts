const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Generate a short invite code (e.g. LOOM-7K2M). Never rewrite FABLE-→LOOM- for lookup. */
export function generateInviteCode(length = 4): string {
  let body = "";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  for (const b of bytes) {
    body += ALPHABET[b % ALPHABET.length];
  }
  return `LOOM-${body}`;
}

export function generateId(prefix = "p"): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}_${hex}`;
}

export function generateRoomId(): string {
  return generateId("room");
}

export function generateHandoffId(): string {
  return generateId("ho");
}

export function generateTaskId(): string {
  return generateId("task");
}

/** Per-peer rejoin secret (M-7). Not an invite code. */
export function generatePeerSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Buffer.from(bytes).toString("base64url");
}
