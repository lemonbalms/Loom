/**
 * Constant-time string equality for secrets (tokens, peer secrets).
 * L-14: single implementation shared by relay auth + peer rejoin.
 */
export function timingSafeStringEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  const len = Math.max(ab.length, bb.length, 1);
  const pa = new Uint8Array(len);
  const pb = new Uint8Array(len);
  pa.set(ab);
  pb.set(bb);
  // XOR length mismatch into a flag so unequal lengths still take full compare time
  const lenMismatch = ab.length === bb.length ? 0 : 1;
  return crypto.timingSafeEqual(pa, pb) && lenMismatch === 0;
}

/** Alias used by relay token auth (M-5). */
export const timingSafeTokenEqual = timingSafeStringEqual;
