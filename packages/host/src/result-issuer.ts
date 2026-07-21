/**
 * PLAN 0.27.0 — dispatch-scoped result issuer.
 * Sole issuance authority for card results (success / failed / Flight-less).
 * Keyed (cardId, dispatchHandoffId); :850 task_0 path keys on dispatchHandoffId alone.
 */

/** pre-C logical kinds — rejection_escalation is (C) only, not implemented. */
export type ResultLogicalKind = "initial";

export type ResultIssuer = {
  cardId: string;
  dispatchHandoffId: string;
  /** Last issued seq (0 = none yet). */
  seq: number;
  /** Acquired logical kinds — acquire is atomic send authority. */
  acquired: Set<ResultLogicalKind>;
  acquire(kind: ResultLogicalKind): boolean;
  /** New payload composition: +1. */
  nextSeq(): number;
  /** Resend reuses the same seq (no bump). */
  currentSeq(): number;
};

export function issuerKey(cardId: string, dispatchHandoffId: string): string {
  // :850 degradation — cardId collapses to "task_0"; trust dispatchHandoffId alone.
  if (cardId === "task_0") return `ho:${dispatchHandoffId}`;
  return `${cardId}\0${dispatchHandoffId}`;
}

export function createResultIssuer(
  cardId: string,
  dispatchHandoffId: string,
): ResultIssuer {
  const acquired = new Set<ResultLogicalKind>();
  let seq = 0;
  return {
    cardId,
    dispatchHandoffId,
    get seq() {
      return seq;
    },
    set seq(v: number) {
      seq = v;
    },
    acquired,
    acquire(kind: ResultLogicalKind): boolean {
      if (acquired.has(kind)) return false;
      acquired.add(kind);
      return true;
    },
    nextSeq(): number {
      seq += 1;
      return seq;
    },
    currentSeq(): number {
      return seq;
    },
  };
}

export class ResultIssuerRegistry {
  private readonly map = new Map<string, ResultIssuer>();

  getOrCreate(cardId: string, dispatchHandoffId: string): ResultIssuer {
    const key = issuerKey(cardId, dispatchHandoffId);
    let issuer = this.map.get(key);
    if (!issuer) {
      issuer = createResultIssuer(cardId, dispatchHandoffId);
      this.map.set(key, issuer);
    }
    return issuer;
  }

  get(cardId: string, dispatchHandoffId: string): ResultIssuer | undefined {
    return this.map.get(issuerKey(cardId, dispatchHandoffId));
  }

  /** Test helper */
  clear(): void {
    this.map.clear();
  }

  size(): number {
    return this.map.size;
  }
}
