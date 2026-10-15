/**
 * PLAN 0.32.0 P1 — Done-when (b) / D7 / R8. Worker fingerprint stability.
 * The literal hex values below were computed from the 0.31.0 code
 * (packages/ identical to v0.31.0 `46ca9ae`, checked at main `04fb3bb`)
 * before policy.ts gained `loomTools`. They must never be re-derived from the
 * code under test: a change here means a running headless card would see
 * `fingerprint_changed` on upgrade.
 */
import { describe, expect, test } from "bun:test";
import {
  ARGV_TEMPLATE_VERSION,
  defaultWorkerPermissions,
  HEADLESS_WORKER_HINT,
  promptFingerprint,
  workerFingerprint,
} from "./agent-argv";
import {
  builtinPolicyDefaults,
  type EffectivePolicy,
  mergePolicy,
  type PolicyV1,
  parsePolicy,
  policyHash,
} from "./policy";
import { resolveWorkerPolicy } from "./policy-compile";

const POLICY_PATH = "/tmp/loom-policy/policy.json";

/** Smallest valid policy.json (merges to the same effective policy as absent). */
const MINIMAL = {
  version: 1,
  shell: { deny: [] },
  network: false,
  mcp: { deny: [] },
  skills: { allowScripts: [] },
};

/** Exercises shell allow/deny, network, mcp deny/isolate, skills allow/allowScripts. */
const FULL = {
  version: 1,
  shell: { allow: ["make *", "git status *"], deny: ["dd *", "git push *"] },
  network: true,
  mcp: { deny: ["github__create_issue", "loom__handoff"], isolate: false },
  skills: { allow: ["tdd", "code-review"], allowScripts: ["tdd"] },
};

/** 0.31.0 values (sha256 hex). */
const PINNED = {
  absent: {
    policyHash: "796b516226c7dff228e70a945f9c924922003fdaf79576091cc15a40fd814c67",
    workerPolicyHash: "21109f95a2954981345dca63e9492b72467671812c7db3078c2f94c3ada58c31",
    promptFingerprint: "d2ed90a8d01095c6a055eb844caeabbabeae419ad4face221dfc89181c0cd9cb",
  },
  minimal: {
    policyHash: "796b516226c7dff228e70a945f9c924922003fdaf79576091cc15a40fd814c67",
    workerPolicyHash: "21109f95a2954981345dca63e9492b72467671812c7db3078c2f94c3ada58c31",
    promptFingerprint: "d2ed90a8d01095c6a055eb844caeabbabeae419ad4face221dfc89181c0cd9cb",
  },
  full: {
    policyHash: "4f3b8c5616cefd2738d4d8cd48d8788f962e8edbed5f0f0eac0aa42efbbcad05",
    workerPolicyHash: "f4ee5c1cde58ceb5a932a84801ee7805732c51687c4905c785cf94b76c929b5b",
    promptFingerprint: "4949d5c41864a21bbdde7df1decc199bd3a9b0deed656cf0639ae927134fc0ef",
  },
} as const;

/** 0.31.0 EffectivePolicy key set (sorted). */
const EFFECTIVE_KEYS_0310 = [
  "mcp",
  "network",
  "shell",
  "skills",
  "toolDeny",
  "version",
  "webDeny",
];

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
  ? true
  : false;
/** Compile-time pin: the EffectivePolicy key union is exactly the 0.31.0 one. */
const effectiveKeysPinned: Equal<
  keyof EffectivePolicy,
  "version" | "shell" | "network" | "mcp" | "skills" | "webDeny" | "toolDeny"
> = true;

function effectiveOf(user: PolicyV1 | null): EffectivePolicy {
  return mergePolicy(builtinPolicyDefaults(), user, { policyPath: POLICY_PATH }).effective;
}

/** Same inputs the headless worker uses (bridge-config → workerFingerprint(config, "")). */
function fingerprintsOf(user: PolicyV1 | null) {
  const permissions = defaultWorkerPermissions();
  const policy = resolveWorkerPolicy(permissions, user, { policyPath: POLICY_PATH });
  const fp = promptFingerprint(
    HEADLESS_WORKER_HINT,
    permissions,
    ARGV_TEMPLATE_VERSION,
    "",
    policy.hash,
  );
  expect(workerFingerprint({ permissions, policy }, "")).toBe(fp);
  return { workerPolicyHash: policy.hash, promptFingerprint: fp };
}

describe("0.31.0 fingerprint pins (D7 / R8)", () => {
  test("ARGV_TEMPLATE_VERSION is unchanged", () => {
    expect(ARGV_TEMPLATE_VERSION).toBe("0.31.0-v1");
  });

  test("policy absent", () => {
    expect(policyHash(effectiveOf(null))).toBe(PINNED.absent.policyHash);
    expect(fingerprintsOf(null)).toEqual({
      workerPolicyHash: PINNED.absent.workerPolicyHash,
      promptFingerprint: PINNED.absent.promptFingerprint,
    });
  });

  test("minimal policy", () => {
    const user = parsePolicy(MINIMAL);
    expect(policyHash(effectiveOf(user))).toBe(PINNED.minimal.policyHash);
    expect(fingerprintsOf(user)).toEqual({
      workerPolicyHash: PINNED.minimal.workerPolicyHash,
      promptFingerprint: PINNED.minimal.promptFingerprint,
    });
  });

  test("full policy (shell / network / mcp / skills)", () => {
    const user = parsePolicy(FULL);
    expect(policyHash(effectiveOf(user))).toBe(PINNED.full.policyHash);
    expect(fingerprintsOf(user)).toEqual({
      workerPolicyHash: PINNED.full.workerPolicyHash,
      promptFingerprint: PINNED.full.promptFingerprint,
    });
  });

  test("EffectivePolicy key set equals 0.31.0", () => {
    expect(effectiveKeysPinned).toBe(true);
    for (const user of [null, parsePolicy(MINIMAL), parsePolicy(FULL)]) {
      expect(Object.keys(effectiveOf(user)).sort()).toEqual(EFFECTIVE_KEYS_0310);
    }
  });
});

describe("loomTools stays out of the worker fingerprint (R8)", () => {
  const LOOM_TOOLS = {
    done: "propose",
    denyModes: ["broadcast", "conv.writes", "conv.fetch", "pack.embed", "board.replace"],
  };

  test("two policies differing only in loomTools have the same policyHash", () => {
    const without = parsePolicy(FULL);
    const withTools = parsePolicy({ ...FULL, loomTools: LOOM_TOOLS });
    expect(policyHash(effectiveOf(withTools))).toBe(policyHash(effectiveOf(without)));
    const minimalWith = parsePolicy({ ...MINIMAL, loomTools: { done: "allow", denyModes: [] } });
    expect(policyHash(effectiveOf(minimalWith))).toBe(PINNED.minimal.policyHash);
  });

  test("loomTools-bearing policies keep the pinned 0.31.0 worker fingerprints", () => {
    expect(fingerprintsOf(parsePolicy({ ...MINIMAL, loomTools: LOOM_TOOLS }))).toEqual({
      workerPolicyHash: PINNED.minimal.workerPolicyHash,
      promptFingerprint: PINNED.minimal.promptFingerprint,
    });
    expect(fingerprintsOf(parsePolicy({ ...FULL, loomTools: LOOM_TOOLS }))).toEqual({
      workerPolicyHash: PINNED.full.workerPolicyHash,
      promptFingerprint: PINNED.full.promptFingerprint,
    });
  });

  test("the effective policy carries no loomTools key", () => {
    const effective = effectiveOf(parsePolicy({ ...FULL, loomTools: LOOM_TOOLS }));
    expect(Object.hasOwn(effective, "loomTools")).toBe(false);
    expect(Object.keys(effective).sort()).toEqual(EFFECTIVE_KEYS_0310);
  });
});
