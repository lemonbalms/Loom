// L-33 (PLAN 0.17.1) — test harness hygiene.
//
// Auto-host on room create/join is default-on for real dogfood use, but a
// `bun test` run must never quietly spawn a sticky host daemon. Force it off for
// every test process; children spawned by tests inherit the env. Respect an
// explicit override if a specific test opts in.
process.env.LOOM_NO_AUTO_HOST ??= "1";
