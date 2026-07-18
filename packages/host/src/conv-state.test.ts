/**
 * PLAN 0.23.0 conv-state tests — fail-closed unknown convId (R25 M-2),
 * pin matching (R24/R25 M-1), seq freshness, limit checks.
 */
import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadConvState,
  saveConvState,
  mutateConvState,
  isKnownConv,
  pinMatches,
  isFreshPeerSeq,
  limitsExceeded,
  type ConvState,
} from "./conv-state";
import { resetStateHomeDirCache } from "./session-store";

const dir = join(tmpdir(), `loom-conv-state-${Date.now()}`);

beforeAll(() => {
  mkdirSync(dir, { recursive: true });
  process.env.LOOM_TEST_HOME = dir;
  resetStateHomeDirCache();
});

afterAll(() => {
  delete process.env.LOOM_TEST_HOME;
  resetStateHomeDirCache();
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* */
  }
});

function makeState(overrides?: Partial<ConvState>): ConvState {
  const now = new Date().toISOString();
  return {
    convId: "conv_1a2b3c4d5e6f7788",
    role: "tower",
    roomId: "room_test",
    pinnedPeerId: "p_worker",
    status: "active",
    limits: { maxTurns: 20, wallClockMs: 2 * 60 * 60 * 1000 },
    lastOwnSeq: 0,
    lastPeerSeq: 0,
    turnCount: 0,
    startedAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("R25 M-2: fail-closed unknown convId", () => {
  test("loadConvState returns null for a convId with no state file", () => {
    expect(loadConvState("conv_ffffffffffffffff", "tower")).toBeNull();
    expect(isKnownConv("conv_ffffffffffffffff", "tower")).toBe(false);
  });

  test("mutateConvState is a no-op (returns null) for unknown convId — no re-adopt", () => {
    const result = mutateConvState("conv_ffffffffffffffff", "tower", (s) => {
      s.status = "active";
    });
    expect(result).toBeNull();
    // Still unknown afterwards — mutate never creates state as a side effect.
    expect(loadConvState("conv_ffffffffffffffff", "tower")).toBeNull();
  });

  test("save then load roundtrips; simulated restart (reload) still finds it", () => {
    const state = makeState({ convId: "conv_abcdefabcdefabcd" });
    saveConvState(state);
    expect(isKnownConv(state.convId, "tower")).toBe(true);
    const reloaded = loadConvState(state.convId, "tower");
    expect(reloaded?.pinnedPeerId).toBe("p_worker");
  });

  test("mutateConvState updates a known conv in place", () => {
    const state = makeState({ convId: "conv_0000000000000001" });
    saveConvState(state);
    const updated = mutateConvState(state.convId, "tower", (s) => {
      s.status = "closed";
      s.turnCount = 5;
    });
    expect(updated?.status).toBe("closed");
    expect(updated?.turnCount).toBe(5);
    expect(loadConvState(state.convId, "tower")?.status).toBe("closed");
  });
});

describe("R24/R25 M-1: pin matching", () => {
  test("pinMatches true only for the exact pinned peerId", () => {
    const state = makeState({ pinnedPeerId: "p_tower_real" });
    expect(pinMatches(state, "p_tower_real")).toBe(true);
    expect(pinMatches(state, "p_tower_evil")).toBe(false);
    expect(pinMatches(state, "")).toBe(false);
  });
});

describe("§3.3/§4.1.3: peer seq freshness (idempotent discard)", () => {
  test("tower's peer (worker) turns must be odd and newer than lastPeerSeq", () => {
    const state = makeState({ role: "tower", lastPeerSeq: 1 });
    expect(isFreshPeerSeq(state, 3)).toBe(true); // next worker seq
    expect(isFreshPeerSeq(state, 1)).toBe(false); // replay of accept
    expect(isFreshPeerSeq(state, 0)).toBe(false); // stale
    expect(isFreshPeerSeq(state, 2)).toBe(false); // wrong parity (tower's own)
  });

  test("worker's peer (tower) turns must be even and newer than lastPeerSeq", () => {
    const state = makeState({ role: "worker", lastPeerSeq: 0 });
    expect(isFreshPeerSeq(state, 2)).toBe(true);
    expect(isFreshPeerSeq(state, 0)).toBe(false);
    expect(isFreshPeerSeq(state, 3)).toBe(false); // wrong parity (worker's own)
  });

  test("rejects non-integer / negative seq", () => {
    const state = makeState({ lastPeerSeq: 0 });
    expect(isFreshPeerSeq(state, -2)).toBe(false);
    expect(isFreshPeerSeq(state, 1.5)).toBe(false);
  });
});

describe("§2.2 L-3: limit check", () => {
  test("not exceeded under both caps", () => {
    const state = makeState({
      turnCount: 5,
      limits: { maxTurns: 20, wallClockMs: 2 * 60 * 60 * 1000 },
      startedAt: new Date().toISOString(),
    });
    expect(limitsExceeded(state).exceeded).toBe(false);
  });

  test("exceeded at turn cap", () => {
    const state = makeState({
      turnCount: 20,
      limits: { maxTurns: 20, wallClockMs: 2 * 60 * 60 * 1000 },
    });
    const r = limitsExceeded(state);
    expect(r.exceeded).toBe(true);
    expect(r.reason).toContain("maxTurns");
  });

  test("exceeded at wall-clock elapsed", () => {
    const state = makeState({
      turnCount: 1,
      limits: { maxTurns: 20, wallClockMs: 10 },
      startedAt: new Date(Date.now() - 1000).toISOString(),
    });
    const r = limitsExceeded(state);
    expect(r.exceeded).toBe(true);
    expect(r.reason).toContain("wallClockMs");
  });
});
