/**
 * SESSION-START-DELIVERY Phase 2 — trigger / template equivalence tests.
 * Authority: docs/SESSION-START.md · rev-3 §6 · acceptance #4 #12.
 */
import { describe, expect, test } from "bun:test";
import {
  classifyOwnerUtterance,
  templateStartsWave,
} from "./session-start-triggers.ts";

describe("Template S never starts wave (acceptance #4)", () => {
  test.each(["상태", "status", "상태만", "상태 확인해"])(
    "%s → Template S · wave=false",
    (utterance) => {
      const c = classifyOwnerUtterance(utterance);
      expect(c.template).toBe("S");
      expect(c.wave).toBe(false);
      expect(c.mask.write).toBe(false);
      expect(c.mask.commit).toBe(false);
      expect(templateStartsWave(c.template)).toBe(false);
    },
  );

  test("핸드오프 확인해 → Template A · no wave", () => {
    const c = classifyOwnerUtterance("핸드오프 확인해");
    expect(c.template).toBe("A");
    expect(c.wave).toBe(false);
    expect(templateStartsWave(c.template)).toBe(false);
  });
});

describe("explicit continue → Template R wave", () => {
  test.each(["이어서", "진행해", "자율적으로", "단계적으로", "continue"])(
    "%s → R · wave",
    (utterance) => {
      const c = classifyOwnerUtterance(utterance);
      expect(c.template).toBe("R");
      expect(c.wave).toBe(true);
      expect(c.mask.write).toBe(true);
    },
  );
});

describe("composite acceptance #12", () => {
  test("상태 확인하고 이어서 해 → S then R", () => {
    const c = classifyOwnerUtterance("상태 확인하고 이어서 해");
    expect(c.sequence).toEqual(["S", "R"]);
    expect(c.template).toBe("S");
    expect(c.wave).toBe(true);
    expect(c.rule).toBe("composite:status-then-continue");
  });

  test("상태만 → S only", () => {
    const c = classifyOwnerUtterance("상태만");
    expect(c.sequence).toEqual(["S"]);
    expect(c.wave).toBe(false);
  });
});

describe("capability stops precedence", () => {
  test("멈춰 beats continue", () => {
    const c = classifyOwnerUtterance("이어서 진행해 멈춰");
    expect(c.template).toBe("pause");
    expect(c.wave).toBe(false);
  });

  test("계획만 → no commit", () => {
    const c = classifyOwnerUtterance("계획만");
    expect(c.template).toBe("plan");
    expect(c.mask.commit).toBe(false);
  });

  test("커밋 금지 → work ok · no commit", () => {
    const c = classifyOwnerUtterance("커밋 금지");
    expect(c.template).toBe("no-commit");
    expect(c.mask.commit).toBe(false);
    expect(c.mask.write).toBe(true);
  });
});

describe("cold start default", () => {
  test("empty first turn → R wave", () => {
    const c = classifyOwnerUtterance("", { firstTurn: true });
    expect(c.template).toBe("R");
    expect(c.wave).toBe(true);
    expect(c.rule).toBe("cold-start-default");
  });
});
