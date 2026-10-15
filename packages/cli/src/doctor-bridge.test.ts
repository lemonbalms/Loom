/**
 * PLAN 0.33.0 P4 — Done-when (h) pure builders: doctor bridge section + offline
 * `loom bridge status` summary from the status file (D5 readers · R6: ok/warn/info only).
 */
import { describe, expect, test } from "bun:test";
import {
  type BridgeReadInput,
  bridgeSection,
  doctorExitCode,
  offlineBridgeStatusLines,
  renderDoctor,
  summarizeDoctor,
} from "./doctor";

const NOW = Date.parse("2026-10-16T12:00:00.000Z");
const ago = (s: number) => new Date(NOW - s * 1000).toISOString();

function input(over: Partial<BridgeReadInput> = {}): BridgeReadInput {
  return {
    statusPath: "/h/.loom/bridge/node.status.json",
    lockPath: "/h/.loom/bridge/node.lock",
    logPath: "/h/.loom/bridge/node.stderr.log",
    nowMs: NOW,
    pidAlive: true,
    lock: { kind: "held", pid: 4242, startedAt: ago(60), verified: true },
    status: {
      pid: 4242,
      state: "running",
      startedAt: ago(60),
      heartbeatAt: ago(2),
      herdr: "skipped",
      inFlight: { paneCards: 0, convs: 0, headlessRunning: 1, headlessQueued: 0 },
    },
    ...over,
  };
}

function text(section: ReturnType<typeof bridgeSection>): string {
  return section.lines.map((l) => `${l.status} ${l.message}`).join("\n");
}

describe("doctor bridge section (PLAN 0.33.0 D5 · R6)", () => {
  test("missing status file → info 'never started', no warn / fail", () => {
    const s = bridgeSection(input({ status: null, lock: { kind: "none" }, pidAlive: false }));
    expect(s.title).toBe("Bridge");
    const sum = summarizeDoctor([s]);
    expect(sum.fail).toBe(0);
    expect(sum.warn).toBe(0);
    expect(s.lines.some((l) => l.status === "info" && l.message.startsWith("bridge never started under this profile"))).toBe(true);
    expect(doctorExitCode([s])).toBe(0);
  });

  test("fresh heartbeat + live pid → ok; state, herdr, lock holder and log path shown", () => {
    const s = bridgeSection(input());
    const t = text(s);
    expect(t).toContain("ok bridge pid 4242 alive");
    expect(t).toMatch(/ok heartbeat fresh \(2s ago\)/);
    expect(t).toContain("info state: running");
    expect(t).toContain("info herdr: skipped");
    expect(t).toMatch(/lock holder: pid 4242/);
    expect(t).toContain("/h/.loom/bridge/node.stderr.log");
    expect(t).toContain("/h/.loom/bridge/node.status.json");
    expect(summarizeDoctor([s]).warn).toBe(0);
    expect(summarizeDoctor([s]).fail).toBe(0);
  });

  test("heartbeat older than 15 s with the pid alive → warn stale heartbeat", () => {
    const s = bridgeSection(input({ status: { ...input().status!, heartbeatAt: ago(20) } }));
    expect(s.lines.some((l) => l.status === "warn" && /stale heartbeat \(20s ago/.test(l.message))).toBe(true);
    expect(summarizeDoctor([s]).fail).toBe(0);
    expect(doctorExitCode([s])).toBe(0);
  });

  test("dead pid while state ≠ stopped → warn 'bridge died without clean stop'; stale lock shown", () => {
    const s = bridgeSection(
      input({ pidAlive: false, lock: { kind: "stale", pid: 4242 }, status: { ...input().status!, heartbeatAt: ago(30) } }),
    );
    const t = text(s);
    expect(t).toMatch(/warn bridge died without clean stop/);
    expect(t).toMatch(/lock holder: pid 4242 stale/);
    expect(summarizeDoctor([s]).fail).toBe(0);
    expect(doctorExitCode([s])).toBe(0);
  });

  test("clean stop: no warn; stoppedAt + lastError shown (lastError warn, never fail)", () => {
    const clean = bridgeSection(
      input({
        pidAlive: false,
        lock: { kind: "none" },
        status: { ...input().status!, state: "stopped", stoppedAt: ago(40), heartbeatAt: ago(40) },
      }),
    );
    expect(summarizeDoctor([clean]).warn).toBe(0);
    expect(text(clean)).toMatch(/stopped at \S+ \(40s ago\)/);
    expect(text(clean)).toContain("lock holder: none");

    const failed = bridgeSection(
      input({
        pidAlive: false,
        lock: { kind: "none" },
        status: {
          ...input().status!,
          state: "stopped",
          stoppedAt: ago(5),
          lastError: "herdr unreachable (/x.sock): ENOENT",
        },
      }),
    );
    expect(text(failed)).toContain("lastError: herdr unreachable (/x.sock): ENOENT");
    expect(summarizeDoctor([failed]).fail).toBe(0);
    expect(doctorExitCode([failed])).toBe(0);
  });

  test("draining → drain deadline and remaining counts", () => {
    const s = bridgeSection(
      input({
        status: {
          ...input().status!,
          state: "draining",
          drain: { startedAt: ago(10), deadlineAt: ago(-590) },
          inFlight: { paneCards: 1, convs: 0, headlessRunning: 2, headlessQueued: 3 },
        },
      }),
    );
    const t = text(s);
    expect(t).toContain("info state: draining");
    expect(t).toMatch(/drain: deadline \S+ · paneCards=1 convs=0 headlessRunning=2 headlessQueued=3/);
  });

  test("no bridge scenario ever renders a fail line; doctor exit code is unaffected", () => {
    const scenarios: BridgeReadInput[] = [
      input(),
      input({ status: null, lock: { kind: "none" }, pidAlive: false }),
      input({ status: { ...input().status!, heartbeatAt: ago(999) } }),
      input({ pidAlive: false, lock: { kind: "stale", pid: null } }),
      input({ lock: { kind: "incomplete" } }),
      input({ lock: { kind: "held", pid: 4242, startedAt: ago(60), verified: false } }),
      input({ status: { state: "stopping" } }),
    ];
    for (const sc of scenarios) {
      const s = bridgeSection(sc);
      expect(s.lines.every((l) => l.status !== "fail")).toBe(true);
      expect(doctorExitCode([s])).toBe(0);
      expect(renderDoctor([s])).toContain("Bridge");
    }
  });
});

describe("offline `loom bridge status` summary (PLAN 0.33.0 ② bridge status)", () => {
  test("no status file → no extra lines (today's output unchanged)", () => {
    expect(offlineBridgeStatusLines(input({ status: null, lock: { kind: "none" }, pidAlive: false }))).toEqual([]);
  });

  test("dead bridge: state, heartbeat age, lock holder, log path", () => {
    const lines = offlineBridgeStatusLines(
      input({ pidAlive: false, lock: { kind: "stale", pid: 4242 }, status: { ...input().status!, heartbeatAt: ago(12) } }),
    ).join("\n");
    expect(lines).toContain("status file: /h/.loom/bridge/node.status.json");
    expect(lines).toMatch(/state: running \(pid 4242 dead/);
    expect(lines).toMatch(/heartbeatAt: \S+ \(12s ago\)/);
    expect(lines).toContain("lock holder: pid 4242 stale");
    expect(lines).toContain("log: /h/.loom/bridge/node.stderr.log");
  });

  test("stopped with lastError: stoppedAt age + lastError", () => {
    const lines = offlineBridgeStatusLines(
      input({
        pidAlive: false,
        lock: { kind: "none" },
        status: { ...input().status!, state: "stopped", stoppedAt: ago(7), lastError: "stop_bound_exceeded" },
      }),
    ).join("\n");
    expect(lines).toContain("state: stopped");
    expect(lines).toMatch(/stoppedAt: \S+ \(7s ago\)/);
    expect(lines).toContain("lastError: stop_bound_exceeded");
    expect(lines).toContain("lock holder: none");
  });
});
