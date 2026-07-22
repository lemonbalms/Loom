// L-33 (PLAN 0.17.1) — test harness hygiene.
//
// Auto-host on room create/join is default-on for real dogfood use, but a
// `bun test` run must never quietly spawn a sticky host daemon. Force it off for
// every test process; children spawned by tests inherit the env. Respect an
// explicit override if a specific test opts in.
process.env.LOOM_NO_AUTO_HOST ??= "1";

// PLAN 0.28.0 PATCH 4 / branch benefit (ec99b2c:scripts/test-setup.ts):
// Relay integration tests create loopback servers and explicitly opt into auth
// when that behavior is under test. Do not let a developer's dogfood token turn
// otherwise-open test relays into authenticated servers before clients connect.
delete process.env.LOOM_RELAY_TOKEN;
// Tests that exercise profile-specific paths opt in explicitly. An inherited
// worker profile otherwise makes fixtures listen on `default` while clients
// resolve paths such as `inject-codex-impl.sock`.
delete process.env.LOOM_PROFILE;
