/**
 * SESSION-START-DELIVERY — trigger / template classification (pure).
 * Authority: docs/SESSION-START.md · propose rev-3 §6 · acceptance #12.
 *
 * Deterministic unit surface for capability masks. Does not read HANDOFF.
 */

export type TemplateId =
  | "S"
  | "A"
  | "R"
  | "pause"
  | "plan"
  | "no-commit"
  | "review"
  | "impl";

export type CapabilityMask = {
  read: boolean;
  write: boolean;
  commit: boolean;
};

export type ClassifiedUtterance = {
  /** Primary template to run first. */
  template: TemplateId;
  /** Ordered sequence when composite (e.g. S then R). */
  sequence: TemplateId[];
  wave: boolean;
  mask: CapabilityMask;
  /** Matched rule label for tests/debug. */
  rule: string;
};

const MASK_READ_ONLY: CapabilityMask = {
  read: true,
  write: false,
  commit: false,
};
const MASK_WAVE: CapabilityMask = { read: true, write: true, commit: true };
const MASK_PLAN: CapabilityMask = { read: true, write: true, commit: false };
const MASK_NO_COMMIT: CapabilityMask = {
  read: true,
  write: true,
  commit: false,
};

function norm(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Classify an owner utterance against L0 trigger precedence.
 * Higher-priority masks win; composite “상태 … 이어서” → S then R.
 */
export function classifyOwnerUtterance(
  text: string,
  opts?: { firstTurn?: boolean },
): ClassifiedUtterance {
  const t = norm(text);
  const firstTurn = opts?.firstTurn === true;

  // 1) Capability stops
  if (/(?:^|\s)멈춰(?:\s|$)/.test(t) || t === "stop" || t === "halt") {
    return {
      template: "pause",
      sequence: ["pause"],
      wave: false,
      mask: MASK_READ_ONLY,
      rule: "capability-stop:멈춰",
    };
  }
  if (t.includes("계획만") || t.includes("plan only")) {
    return {
      template: "plan",
      sequence: ["plan"],
      wave: false,
      mask: MASK_PLAN,
      rule: "capability-stop:계획만",
    };
  }
  if (t.includes("커밋 금지") || t.includes("no commit") || t.includes("don't commit")) {
    return {
      template: "no-commit",
      sequence: ["no-commit"],
      wave: true, // work ok, ship blocked
      mask: MASK_NO_COMMIT,
      rule: "capability-stop:커밋금지",
    };
  }

  // 2) Read-only (before continue — F5)
  const hasHandoffCheck =
    t.includes("핸드오프 확인") ||
    t.includes("handoff check") ||
    t.includes("핸드오프확인해");
  const hasContinue =
    t.includes("이어서") ||
    t.includes("진행해") ||
    t.includes("자율적으로") ||
    t.includes("단계적으로") ||
    /\bcontinue\b/.test(t) ||
    /\bproceed\b/.test(t);
  const hasStatusToken =
    t === "상태" ||
    t === "status" ||
    t.includes("상태만") ||
    t.includes("상태 확인") ||
    /^status\b/.test(t) ||
    /(^|\s)상태(\s|$)/.test(t);

  if ((hasStatusToken || hasHandoffCheck) && hasContinue) {
    // “상태 확인하고 이어서 해” → S (or A) then R
    const first: TemplateId = hasHandoffCheck && !hasStatusToken ? "A" : "S";
    return {
      template: first,
      sequence: [first, "R"],
      wave: true,
      mask: MASK_WAVE,
      rule: "composite:status-then-continue",
    };
  }

  if (hasHandoffCheck) {
    return {
      template: "A",
      sequence: ["A"],
      wave: false,
      mask: MASK_READ_ONLY,
      rule: "read-only:핸드오프확인",
    };
  }

  if (hasStatusToken) {
    return {
      template: "S",
      sequence: ["S"],
      wave: false,
      mask: MASK_READ_ONLY,
      rule: "read-only:상태",
    };
  }

  // 3) Explicit continue
  if (hasContinue) {
    return {
      template: "R",
      sequence: ["R"],
      wave: true,
      mask: MASK_WAVE,
      rule: "continue",
    };
  }

  // Role triggers (lightweight)
  if (/\br\d+\b/i.test(t) || t.includes("리뷰")) {
    return {
      template: "review",
      sequence: ["review"],
      wave: false,
      mask: { read: true, write: false, commit: false },
      rule: "role:review",
    };
  }
  if (t.includes("락 스펙") || t.includes("locked spec") || t.includes("구현해")) {
    return {
      template: "impl",
      sequence: ["impl"],
      wave: true,
      mask: MASK_WAVE,
      rule: "role:impl",
    };
  }

  // 4) Cold start / empty → Template R
  if (firstTurn || t.length === 0) {
    return {
      template: "R",
      sequence: ["R"],
      wave: true,
      mask: MASK_WAVE,
      rule: "cold-start-default",
    };
  }

  // Ambiguous mid-session freeform: no auto-wave from this classifier
  return {
    template: "R",
    sequence: ["R"],
    wave: false,
    mask: MASK_READ_ONLY,
    rule: "unmatched-no-auto-wave",
  };
}

/** Template S never starts a wave (acceptance #4). */
export function templateStartsWave(template: TemplateId): boolean {
  return template === "R" || template === "impl" || template === "no-commit";
}
