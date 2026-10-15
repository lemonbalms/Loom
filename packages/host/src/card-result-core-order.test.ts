/**
 * Ordering restored against pre-2d1bc3b sendResult.
 * acquireInitial is the gate before any scrape/read.
 * applyOutcome runs before quarantine.enter (send_unknown) and before
 * autoResolve (accepted), inside the handoff try.
 */
import { describe, expect, test } from "bun:test";
import { createCardResultCore, type ResultTarget } from "./card-result-core";
import { ResultIssuerRegistry } from "./result-issuer";
import type { QuarantineStore } from "./result-quarantine";

const target: ResultTarget = {
  cardId: "card-1",
  fromPeerId: "peer-a",
  dispatchHandoffId: "ho-1",
  startedAt: "2026-10-15T00:00:00.000Z",
  paneId: "pane-1",
};

const content = {
  status: "failed" as const,
  reason: "needs_verification",
  output: "out",
  truncated: false,
  summary: "s",
};

function fakeQuarantine(events: string[]): QuarantineStore {
  return {
    supersedePresence() {
      events.push("supersede");
    },
    enter() {
      events.push("enter");
      return true;
    },
    autoResolve() {
      events.push("autoResolve");
      return true;
    },
  } as unknown as QuarantineStore;
}

describe("card result core ordering", () => {
  test("denied acquire does not call the scrape/read function", async () => {
    let reads = 0;
    const read = async (): Promise<string> => {
      reads += 1;
      return "scraped";
    };
    let handoffs = 0;
    const events: string[] = [];
    const issuers = new ResultIssuerRegistry();
    issuers.getOrCreate(target.cardId, target.dispatchHandoffId).acquire("initial");

    const core = createCardResultCore({
      handoff: async () => {
        handoffs += 1;
        return { status: "delivered", recipientCount: 1 };
      },
      issuers,
      quarantine: fakeQuarantine(events),
      log() {},
      now: () => "2026-10-15T00:00:02.000Z",
    });

    const lease = core.acquireInitial(target);
    // Same gate as proposeCardVerification / finishCardFailure: read only after a lease.
    if (lease) {
      await read();
      await core.composeAndSend(lease, content, {
        node: "bridge-node",
        applyOutcome() {},
      });
    }

    expect(lease).toBeNull();
    expect(reads).toBe(0);
    expect(handoffs).toBe(0);
    expect(events).toEqual([]);
    expect(issuers.get(target.cardId, target.dispatchHandoffId)!.seq).toBe(0);
  });

  test("applyOutcome runs before quarantine.enter on send_unknown", async () => {
    const events: string[] = [];
    const core = createCardResultCore({
      handoff: async () => {
        events.push("handoff");
        return { status: "peer_unknown", recipientCount: 0 };
      },
      issuers: new ResultIssuerRegistry(),
      quarantine: fakeQuarantine(events),
      log() {},
      now: () => "2026-10-15T00:00:02.000Z",
    });
    const lease = core.acquireInitial(target);
    expect(lease).not.toBeNull();
    const outcome = await core.composeAndSend(lease!, content, {
      node: "bridge-node",
      applyOutcome(result) {
        events.push(`apply:${result.branch}`);
      },
    });
    expect(outcome.branch).toBe("send_unknown");
    expect(events).toEqual(["supersede", "handoff", "apply:send_unknown", "enter"]);
    const applyAt = events.indexOf("apply:send_unknown");
    const enterAt = events.indexOf("enter");
    expect(applyAt).toBeGreaterThanOrEqual(0);
    expect(applyAt).toBeLessThan(enterAt);
    expect(events).not.toContain("autoResolve");
  });

  test("applyOutcome runs before autoResolve on accepted", async () => {
    const events: string[] = [];
    const core = createCardResultCore({
      handoff: async () => {
        events.push("handoff");
        return { status: "delivered", recipientCount: 1 };
      },
      issuers: new ResultIssuerRegistry(),
      quarantine: fakeQuarantine(events),
      log() {},
      now: () => "2026-10-15T00:00:02.000Z",
    });
    const lease = core.acquireInitial(target);
    expect(lease).not.toBeNull();
    const outcome = await core.composeAndSend(lease!, content, {
      node: "bridge-node",
      applyOutcome(result) {
        events.push(`apply:${result.branch}`);
      },
    });
    expect(outcome.branch).toBe("accepted");
    expect(events).toEqual([
      "supersede",
      "handoff",
      "apply:accepted",
      "autoResolve",
    ]);
    const applyAt = events.indexOf("apply:accepted");
    const resolveAt = events.indexOf("autoResolve");
    expect(applyAt).toBeGreaterThanOrEqual(0);
    expect(applyAt).toBeLessThan(resolveAt);
    expect(events).not.toContain("enter");
  });

  test("applyOutcome throw on accepted becomes send_unknown", async () => {
    const events: string[] = [];
    const core = createCardResultCore({
      handoff: async () => ({ status: "queued", recipientCount: 1 }),
      issuers: new ResultIssuerRegistry(),
      quarantine: fakeQuarantine(events),
      log() {},
      now: () => "2026-10-15T00:00:02.000Z",
    });
    const lease = core.acquireInitial(target);
    const outcome = await core.composeAndSend(lease!, content, {
      node: "bridge-node",
      applyOutcome(result) {
        events.push(`apply:${result.branch}`);
        if (result.branch === "accepted") throw new Error("flight-write");
      },
    });
    expect(outcome.branch).toBe("send_unknown");
    if (outcome.branch === "send_unknown") {
      expect(outcome.reason).toBe("transport:flight-write");
    }
    const acceptedAt = events.indexOf("apply:accepted");
    const unknownAt = events.indexOf("apply:send_unknown");
    const enterAt = events.indexOf("enter");
    expect(acceptedAt).toBeGreaterThanOrEqual(0);
    expect(unknownAt).toBeGreaterThan(acceptedAt);
    expect(enterAt).toBeGreaterThan(unknownAt);
  });
});
