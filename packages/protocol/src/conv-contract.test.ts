/**
 * PLAN 0.23.0 conv contract tests — schema roundtrip, seq assignment,
 * M-2 (R24/R25) artifact ref validation negative cases.
 */
import { describe, expect, test } from "bun:test";
import {
  CONV_CONTRACT_VERSION,
  ConvIdSchema,
  ConvOpenPayloadSchema,
  ConvAcceptPayloadSchema,
  ConvRejectPayloadSchema,
  ConvTurnPayloadSchema,
  ConvClosePayloadSchema,
  generateConvId,
  isValidConvId,
  isTowerSeq,
  isWorkerSeq,
  nextOwnSeq,
  CONV_OPEN_SEQ,
  CONV_ACCEPT_SEQ,
  MAX_CONV_TURN_INLINE_CHARS,
  validateGitArtifactRef,
  validateScpArtifactRef,
  convLabelOf,
  peekConvIdFromAttachments,
  convPayloadFromAttachments,
  serializeConvAttachment,
  CONV_OPEN_LABEL,
  CONV_TURN_LABEL,
  buildConvOpenBody,
  buildConvAcceptBody,
  buildConvTurnBody,
  buildConvCloseBody,
} from "./conv-contract";

describe("convId format (§1.1 / §5.3①)", () => {
  test("generateConvId produces conv_[a-f0-9]{16}", () => {
    const id = generateConvId();
    expect(ConvIdSchema.safeParse(id).success).toBe(true);
    expect(id).toMatch(/^conv_[a-f0-9]{16}$/);
  });

  test("isValidConvId rejects malformed ids", () => {
    expect(isValidConvId("conv_abc")).toBe(false);
    expect(isValidConvId("task_1a2b3c4d5e6f7788")).toBe(false);
    expect(isValidConvId("conv_1A2B3C4D5E6F7788")).toBe(false); // uppercase hex rejected
    expect(isValidConvId(generateConvId())).toBe(true);
  });
});

describe("turnSeq assignment (§3.3 / R25 L-1)", () => {
  test("open=0 tower, accept=1 worker", () => {
    expect(CONV_OPEN_SEQ).toBe(0);
    expect(CONV_ACCEPT_SEQ).toBe(1);
    expect(isTowerSeq(CONV_OPEN_SEQ)).toBe(true);
    expect(isWorkerSeq(CONV_ACCEPT_SEQ)).toBe(true);
  });

  test("subsequent turns: tower even, worker odd, strictly increasing by 2", () => {
    expect(nextOwnSeq(CONV_OPEN_SEQ)).toBe(2);
    expect(nextOwnSeq(2)).toBe(4);
    expect(isTowerSeq(2)).toBe(true);
    expect(isTowerSeq(4)).toBe(true);
    expect(nextOwnSeq(CONV_ACCEPT_SEQ)).toBe(3);
    expect(nextOwnSeq(3)).toBe(5);
    expect(isWorkerSeq(3)).toBe(true);
    expect(isWorkerSeq(5)).toBe(true);
  });

  test("isTowerSeq/isWorkerSeq reject the opposite parity and negatives", () => {
    expect(isTowerSeq(1)).toBe(false);
    expect(isWorkerSeq(2)).toBe(false);
    expect(isTowerSeq(-2)).toBe(false);
  });
});

describe("payload schema roundtrip (open/accept/reject/turn/close)", () => {
  const convId = generateConvId();

  test("open", () => {
    const payload = {
      v: CONV_CONTRACT_VERSION,
      convId,
      goal: "write hello world",
      scope: { agentKind: "claude" as const, writesAllowed: false },
      limits: { maxTurns: 20, wallClockMs: 2 * 60 * 60 * 1000 },
    };
    const parsed = ConvOpenPayloadSchema.parse(payload);
    expect(parsed.convId).toBe(convId);
    expect(parsed.limits.maxTurns).toBe(20);
  });

  test("open defaults limits when omitted", () => {
    const parsed = ConvOpenPayloadSchema.parse({
      v: CONV_CONTRACT_VERSION,
      convId,
      goal: "g",
      scope: { agentKind: "claude" },
      limits: {},
    });
    expect(parsed.limits.maxTurns).toBe(20);
    expect(parsed.limits.wallClockMs).toBe(2 * 60 * 60 * 1000);
    expect(parsed.scope.writesAllowed).toBe(false);
  });

  test("accept / reject", () => {
    expect(ConvAcceptPayloadSchema.parse({ v: 1, convId }).convId).toBe(convId);
    const rej = ConvRejectPayloadSchema.parse({
      v: 1,
      convId,
      reason: "agent_kind_not_allowed",
    });
    expect(rej.reason).toBe("agent_kind_not_allowed");
  });

  test("turn: normal/blocked/done_proposal kinds", () => {
    for (const kind of ["normal", "blocked", "done_proposal"] as const) {
      const t = ConvTurnPayloadSchema.parse({
        v: 1,
        convId,
        seq: 2,
        kind,
        text: "hello",
      });
      expect(t.kind).toBe(kind);
    }
  });

  test("turn rejects text over the 32k inline threshold", () => {
    const tooLong = "x".repeat(MAX_CONV_TURN_INLINE_CHARS + 1);
    const result = ConvTurnPayloadSchema.safeParse({
      v: 1,
      convId,
      seq: 2,
      kind: "normal",
      text: tooLong,
    });
    expect(result.success).toBe(false);
  });

  test("close: reason done|abort, tower-only by convention (not enforced in schema)", () => {
    expect(ConvClosePayloadSchema.parse({ v: 1, convId, reason: "done" }).reason).toBe(
      "done",
    );
    expect(ConvClosePayloadSchema.parse({ v: 1, convId, reason: "abort" }).reason).toBe(
      "abort",
    );
    expect(
      ConvClosePayloadSchema.safeParse({ v: 1, convId, reason: "cancelled" }).success,
    ).toBe(false);
  });
});

describe("attachment helpers", () => {
  const convId = generateConvId();

  test("convLabelOf finds the conv label among mixed attachments", () => {
    const attachments = [
      { kind: "text", label: "loom-board-snapshot", content: "{}" },
      { kind: "text", label: CONV_TURN_LABEL, content: "{}" },
    ];
    expect(convLabelOf(attachments)).toBe(CONV_TURN_LABEL);
    expect(convLabelOf([{ kind: "text", label: "other" }])).toBeNull();
    expect(convLabelOf(undefined)).toBeNull();
  });

  test("peekConvIdFromAttachments best-effort extracts convId without full validation", () => {
    const payload = { v: 1, convId, goal: "g", scope: { agentKind: "claude" }, limits: {} };
    const att = serializeConvAttachment(CONV_OPEN_LABEL, payload);
    expect(peekConvIdFromAttachments([att])).toBe(convId);
    expect(peekConvIdFromAttachments([{ kind: "text", content: "not json" }])).toBeNull();
  });

  test("convPayloadFromAttachments parses+validates, null on schema mismatch", () => {
    const payload = ConvOpenPayloadSchema.parse({
      v: 1,
      convId,
      goal: "g",
      scope: { agentKind: "claude" },
      limits: {},
    });
    const att = serializeConvAttachment(CONV_OPEN_LABEL, payload);
    const parsed = convPayloadFromAttachments([att], CONV_OPEN_LABEL, ConvOpenPayloadSchema);
    expect(parsed?.convId).toBe(convId);

    const badAtt = { kind: "text" as const, label: CONV_OPEN_LABEL, content: "{}" };
    expect(
      convPayloadFromAttachments([badAtt], CONV_OPEN_LABEL, ConvOpenPayloadSchema),
    ).toBeNull();
  });

  test("body builders keep header lines independent (parseHandoffContract-safe)", () => {
    const openBody = buildConvOpenBody({ goal: "line1\nline2", convId });
    expect(openBody.split("\n")).toContain(`intent: conv.open`);
    expect(openBody.split("\n")).toContain(`conv: ${convId}`);
    expect(openBody).not.toContain("\nline2"); // goal newline flattened
    expect(buildConvAcceptBody({ convId })).toContain(`seq: ${CONV_ACCEPT_SEQ}`);
    expect(buildConvTurnBody({ convId, seq: 4, kind: "normal" })).toContain("kind: normal");
    expect(buildConvCloseBody({ convId, reason: "abort" })).toContain("reason: abort");
  });
});

describe("R24/R25 M-2: artifact ref validation", () => {
  const convId = generateConvId();

  describe("git", () => {
    test("valid ref under conv/<convId>/ with known remote", () => {
      const r = validateGitArtifactRef(
        convId,
        { branch: `conv/${convId}/patch-1` },
        ["origin"],
      );
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.plan.args).toEqual(["fetch", "origin", "--", `conv/${convId}/patch-1`]);
      }
    });

    test("rejects branch outside the conv/<convId>/ prefix", () => {
      const r = validateGitArtifactRef(convId, { branch: "main" }, ["origin"]);
      expect(r.ok).toBe(false);
    });

    test("rejects a different convId's branch (cross-conv confusion)", () => {
      const other = generateConvId();
      const r = validateGitArtifactRef(
        convId,
        { branch: `conv/${other}/patch-1` },
        ["origin"],
      );
      expect(r.ok).toBe(false);
    });

    test("rejects leading '-' branch (argv injection)", () => {
      const r = validateGitArtifactRef(
        convId,
        { branch: `-conv/${convId}/x` },
        ["origin"],
      );
      expect(r.ok).toBe(false);
    });

    test("rejects leading '-' commit", () => {
      const r = validateGitArtifactRef(
        convId,
        { branch: `conv/${convId}/x`, commit: "--upload-pack=evil" },
        ["origin"],
      );
      expect(r.ok).toBe(false);
    });

    test("rejects a remote not in the local known-remotes list (wire host/URL never trusted)", () => {
      const r = validateGitArtifactRef(
        convId,
        { branch: `conv/${convId}/x` },
        ["origin"],
        "attacker-remote",
      );
      expect(r.ok).toBe(false);
    });

    test("plan always uses -- separator before the branch value", () => {
      const r = validateGitArtifactRef(convId, { branch: `conv/${convId}/x` }, ["origin"]);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.plan.args[2]).toBe("--");
      }
    });
  });

  describe("scp", () => {
    const root = `/home/user/.loom/artifacts/${convId}`;
    const resolveHost = (id: string) => (id === convId ? "10.0.0.5" : null);

    test("valid path under the artifacts root; wire host ignored in favor of local mapping", () => {
      const r = validateScpArtifactRef(
        convId,
        { host: "attacker.evil.example.com", path: `${root}/out.log` },
        resolveHost,
        root,
      );
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.host).toBe("10.0.0.5"); // NOT the wire-supplied host
      }
    });

    test("rejects path traversal escaping the artifacts root", () => {
      const r = validateScpArtifactRef(
        convId,
        { path: `${root}/../../etc/passwd` },
        resolveHost,
        root,
      );
      expect(r.ok).toBe(false);
    });

    test("rejects when no local conv→node mapping exists for this convId", () => {
      const r = validateScpArtifactRef(
        convId,
        { path: `${root}/out.log` },
        () => null,
        root,
      );
      expect(r.ok).toBe(false);
    });

    test("rejects path outside the root even without traversal syntax", () => {
      const r = validateScpArtifactRef(
        convId,
        { path: "/home/user/.loom/artifacts/other-conv/out.log" },
        resolveHost,
        root,
      );
      expect(r.ok).toBe(false);
    });
  });
});
