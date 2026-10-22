import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const activeProfiles = [
  "codex-arch",
  "grok-impl",
  "claude-impl",
  "codex-impl",
  "claude-rev",
  "codex-rev",
] as const;

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

describe("dogfood active profile contract", () => {
  test("dogfood:up starts the canonical six profiles", () => {
    const source = read("scripts/dogfood-up.sh");
    expect(source).toContain(`PROFILES="${activeProfiles.join(",")}"`);
  });

  test("dogfood:status reports the same profiles in the same order", () => {
    const source = read("scripts/dogfood-room-status.sh");
    expect(source).toContain(`for prof in ${activeProfiles.join(" ")}; do`);
  });

  test("room setup creates the architect peer and joins the Grok implementer", () => {
    const source = read("scripts/dogfood-room-up.sh");
    expect(source).toContain("--profile codex-arch room create --as codex-architect");
    expect(source).toContain('--profile grok-impl room join "$INVITE" --as grok-impl');
  });

  test("stale saved invite self-heals only on a definitive missing-room error", () => {
    const source = read("scripts/dogfood-room-up.sh");
    expect(source).toContain('[[ "$JOIN_OUT" == *"No room for code"* ]]');
    expect(source).toContain("saved invite $INVITE is stale");
    expect(source).toContain("codex-arch join failed; saved invite retained");
  });

  test("legacy impl profile is absent from active launcher commands", () => {
    for (const path of [
      "scripts/dogfood-up.sh",
      "scripts/dogfood-room-up.sh",
      "scripts/dogfood-room-status.sh",
    ]) {
      const source = read(path);
      expect(source).not.toContain("--profile impl");
      expect(source).not.toContain('PROFILES="impl');
    }
  });

  test("boot contracts preserve architect/implementer separation", () => {
    const architect = read("scripts/dogfood-architect-boot.txt");
    const grok = read("scripts/dogfood-grok-impl-boot.txt");
    expect(architect).toContain("architect, not implementer");
    expect(architect).toContain("Do not claim that task or write its product code");
    expect(grok).toContain("implementer, not architect or reviewer");
    expect(grok).toContain("@codex-architect");
  });

  test("interactive agents do not share Loom's live PTY", () => {
    const up = read("scripts/dogfood-up.sh");
    const room = read("scripts/dogfood-room-up.sh");
    const architect = read("scripts/dogfood-architect.sh");
    expect(up).not.toContain("--profile grok-impl  run grok");
    expect(room).not.toContain("--profile grok-impl run grok");
    expect(architect).toContain("--write-user-config -- --version");
    expect(architect).toContain('exec codex -a never -s workspace-write "$@"');
  });

  test("dogfood bridge binds mac-node to the architect room fail-closed", () => {
    const source = read("scripts/dogfood-bridge-up.sh");
    expect(source).toContain("bash scripts/dogfood-herdr-check.sh");
    expect(source).toContain("refusing room rebind/restart");
    expect(source).toContain("LOOM_NO_AUTO_HOST=1");
    expect(source).toContain('bridge start --allow "$ARCH_PEER_ID"');
    expect(source).toContain('NODE_ROOM_ID" != "$ARCH_ROOM_ID');
  });

  test("herdr upgrades fail before a false-positive bridge start", () => {
    const source = read("scripts/dogfood-herdr-check.sh");
    const up = read("scripts/dogfood-up.sh");
    // PLAN 0.45.3 R7: exact version:protocol pair table (class 97) + Loom's
    // supported set read from HERDR_PROTOCOLS_SUPPORTED (no sed of a constant).
    expect(source).toContain('SUPPORTED_HERDR="0.7.5:17 0.9.5:22"');
    expect(source).not.toContain("REQUIRED_VERSION");
    expect(source).not.toContain("REQUIRED_PROTOCOL");
    expect(source).toContain("HERDR_PROTOCOLS_SUPPORTED");
    expect(source).toMatch(/import \{ HERDR_PROTOCOLS_SUPPORTED \} from/);
    expect(source).not.toContain("HERDR_PROTOCOL_EXPECTED");
    expect(source).toContain("first card will fail");
    expect(source).toContain("Loom supports herdr protocols");
    expect(source).toContain("docs/spikes/HERDR-0.9.5-COMPAT.md");
    expect(source).toContain("herdr compatibility: ok ($SERVER_VERSION / protocol $SERVER_PROTOCOL)");
    expect(up.indexOf("dogfood-herdr-check.sh")).toBeLessThan(up.indexOf("dogfood-room-up.sh"));
  });

  test("herdr 0.9.5 status JSON keeps top-level version/protocol keys", () => {
    // PLAN 0.45.3 R6 (R67-M1): dogfood-herdr-check reads `version` and
    // `protocol` from `herdr status server --json`; the 0.9.5 capture pins
    // that both keys stay top-level (no per-version keys, no fallback chain).
    const status = JSON.parse(read("docs/spikes/fixtures/herdr-v0.9.5/status.json")) as Record<
      string,
      unknown
    >;
    expect(status.protocol).toBe(22);
    expect(status.version).toBe("0.9.5");
    const check = read("scripts/dogfood-herdr-check.sh");
    expect(check).toContain('json_field "$STATUS_JSON" version');
    expect(check).toContain('json_field "$STATUS_JSON" protocol');
  });

  test("dogfood bridge syncs mac-node herdrProtocol before ready early-exit", () => {
    // PLAN 0.45.3 R8: a persisted herdrProtocol in ~/.loom/bridge/mac-node.json
    // is an exact pin, so any value breaks one of the supported herdr servers
    // (17 pin vs 0.9.5/22, 22 pin vs 0.7.5/17). dogfood-bridge-up removes the
    // pin after the live check and before any "already online" ready exit, so
    // the bridge accepts HERDR_PROTOCOLS_SUPPORTED.
    const source = read("scripts/dogfood-bridge-up.sh");
    const herdrCheckAt = source.indexOf("bash scripts/dogfood-herdr-check.sh");
    const bridgeStatusAt = source.indexOf("BRIDGE_STATUS=");
    const readyExitAt = source.indexOf('echo "dogfood bridge: ready');
    expect(herdrCheckAt).toBeGreaterThanOrEqual(0);
    expect(bridgeStatusAt).toBeGreaterThan(herdrCheckAt);
    expect(readyExitAt).toBeGreaterThan(bridgeStatusAt);

    // Migration window: after herdr check, before bridge status / ready exit.
    const migrateWindow = source.slice(herdrCheckAt, bridgeStatusAt);
    expect(migrateWindow).toContain("loadBridgeConfig");
    expect(migrateWindow).toContain("saveBridgeConfig");
    expect(migrateWindow).toContain("delete cfg.herdrProtocol");
    expect(migrateWindow).toContain("cfg.herdrProtocol === undefined");
    expect(migrateWindow).toContain("HERDR_PROTOCOLS_SUPPORTED");
    expect(migrateWindow).toContain("removed mac-node herdrProtocol pin");
    expect(source).not.toContain("HERDR_PROTOCOL_EXPECTED");
    expect(migrateWindow).toContain("herdrProtocol");
    // Must record whether the persisted value actually changed so the
    // already-online early-exit can be suppressed on cutover.
    const changedFlag = /PROTOCOL_CHANGED|protocolChanged|protocol_changed/;
    expect(migrateWindow).toMatch(changedFlag);

    // Room-matched ready early-exit must consult the change flag (forbid
    // short-circuit restart when herdrProtocol was just rewritten).
    const earlyExitBlock = source.slice(bridgeStatusAt, readyExitAt + 120);
    expect(earlyExitBlock).toMatch(changedFlag);
    expect(earlyExitBlock).toMatch(
      /bridge: online[\s\S]*PROTOCOL_CHANGED|PROTOCOL_CHANGED[\s\S]*bridge: online|protocolChanged|protocol_changed/,
    );

    // No protocol literal in bridge-up — the sync never writes a pin; the
    // supported set comes from HERDR_PROTOCOLS_SUPPORTED only.
    expect(source).not.toMatch(
      /herdrProtocol\s*[:=]\s*(1[67]|22)\b|HERDR_PROTOCOL\s*=\s*["']?(1[67]|22)/,
    );
  });
});
