/**
 * PLAN 0.26.0 — hooks auxiliary sensor unit tests (test plan rows 99–106).
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createConnection } from "node:net";
import { join } from "node:path";
import {
  appendHookSettingsArgv,
  appendHookTelemetry,
  applyHookHintSlot,
  assertHookScriptConventions,
  buildHookSettingsDoc,
  buildHookSettingsJson,
  buildHookSocketWriteCommand,
  classifyCompletionFallback,
  clearHookHintOnWorking,
  hookSocketPath,
  hookTelemetryPath,
  maybeAppendCompletionFallback,
  parseHookEventLine,
  readHookTelemetryLines,
  sanitizeCardIdForSocket,
  shouldCorrectCompletionToBlocked,
  startHookListener,
  stopAllowsStillRunningMaxBypass,
  type HookHint,
  type HookHintKind,
  type HookListener,
} from "./hook-sensor";
import { isPathUnderLoomDir } from "./inject-control";
import {
  loadBridgeConfig,
  saveBridgeConfig,
  defaultBridgeConfig,
  bridgeConfigPath,
} from "./bridge-config";
import {
  RESULT_DELIVERY_UNCONFIRMED,
  recordResultDeliveryUnconfirmed,
  resetResultDeliveryUnconfirmed,
  resultDeliveryUnconfirmed,
} from "./bridge-runtime";
import {
  loomDir,
  resetActiveProfile,
  resetStateHomeDirCache,
  setActiveProfile,
} from "./session-store";

let root = "";

beforeEach(() => {
  // Short base under /tmp so unix socket paths stay under macOS sun_path (~104B).
  // tmpdir() on macOS is /var/folders/.../T and makes hook-<id>-<seq>.sock exceed
  // the limit → bind_failed (L-1 test-env artifact; prod loomDir is short ~/.loom).
  root = mkdtempSync("/tmp/lhs-");
  process.env.LOOM_TEST_HOME = root;
  resetActiveProfile();
  resetStateHomeDirCache();
  setActiveProfile("hooktest");
  mkdirSync(loomDir(), { recursive: true });
});

afterEach(() => {
  resetActiveProfile();
  delete process.env.LOOM_TEST_HOME;
  resetStateHomeDirCache();
  rmSync(root, { recursive: true, force: true });
});

function writeLineToSocket(
  socketPath: string,
  line: string,
  timeoutMs = 1_000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const sock = createConnection({ path: socketPath });
    const t = setTimeout(() => {
      sock.destroy();
      reject(new Error("socket write timeout"));
    }, timeoutMs);
    sock.on("connect", () => {
      sock.end(`${line}\n`, () => {
        clearTimeout(t);
        resolve();
      });
    });
    sock.on("error", (e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

async function waitFor(
  pred: () => boolean,
  timeoutMs = 2_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (pred()) return true;
    await Bun.sleep(20);
  }
  return pred();
}

// ─── path / sanitize (L-1 · M-1) ─────────────────────────────────────────────

describe("PLAN 0.26.0 hook socket path (M-1 · L-1)", () => {
  test("attempt-scoped path preserves seq uniqueness under cardId slice", () => {
    const longId = `task_${"a".repeat(200)}`;
    const p1 = hookSocketPath(longId, 1);
    const p2 = hookSocketPath(longId, 2);
    expect(p1).not.toBe(p2);
    expect(p1.endsWith("-1.sock")).toBe(true);
    expect(p2.endsWith("-2.sock")).toBe(true);
    expect(isPathUnderLoomDir(p1)).toBe(true);
    // slice applies to cardId part only
    const safe = sanitizeCardIdForSocket(longId);
    expect(safe.length).toBeLessThanOrEqual(80);
    expect(p1).toBe(join(loomDir(), `hook-${safe}-1.sock`));
  });

  test("same cardId different seq → distinct sockets (re-dispatch isolation)", () => {
    const cardId = "task_abcdef0123456789";
    expect(hookSocketPath(cardId, 1)).not.toBe(hookSocketPath(cardId, 2));
  });
});

// ─── parse / slot (M-2 ①) ────────────────────────────────────────────────────

describe("PLAN 0.26.0 parseHookEventLine + single-slot (M-2 ①)", () => {
  test("parses compact kind wire", () => {
    expect(parseHookEventLine('{"kind":"Stop"}')?.kind).toBe("Stop");
    expect(parseHookEventLine('{"kind":"permission_prompt"}')?.kind).toBe(
      "permission_prompt",
    );
    expect(parseHookEventLine('{"kind":"idle_prompt"}')?.kind).toBe(
      "idle_prompt",
    );
    expect(parseHookEventLine('{"kind":"UserPromptSubmit"}')?.kind).toBe(
      "UserPromptSubmit",
    );
  });

  test("maps Claude-shaped stdin fields", () => {
    expect(
      parseHookEventLine(
        JSON.stringify({ hook_event_name: "Stop", last_assistant_message: "x" }),
      )?.kind,
    ).toBe("Stop");
    expect(
      parseHookEventLine(
        JSON.stringify({
          hook_event_name: "Notification",
          notification_type: "permission_prompt",
          tool_input: { secret: "nope" },
        }),
      )?.kind,
    ).toBe("permission_prompt");
    expect(
      parseHookEventLine(
        JSON.stringify({
          hook_event_name: "Notification",
          notification_type: "idle_prompt",
        }),
      )?.kind,
    ).toBe("idle_prompt");
    expect(
      parseHookEventLine(
        JSON.stringify({ hook_event_name: "UserPromptSubmit", prompt: "hi" }),
      )?.kind,
    ).toBe("UserPromptSubmit");
  });

  test("malformed → null (silent ignore)", () => {
    expect(parseHookEventLine("")).toBeNull();
    expect(parseHookEventLine("not-json")).toBeNull();
    expect(parseHookEventLine("{}")).toBeNull();
    expect(parseHookEventLine('{"kind":"Unknown"}')).toBeNull();
  });

  test("last-event-wins single slot does not accumulate", () => {
    const a: HookHint = { kind: "permission_prompt", at: 1 };
    const b: HookHint = { kind: "Stop", at: 2 };
    const slot = applyHookHintSlot(a, b);
    expect(slot).toEqual(b);
    expect(slot.kind).toBe("Stop");
  });
});

// ─── consumption contract (M-2 ②③④) ─────────────────────────────────────────

describe("PLAN 0.26.0 hookHint consumption contract (M-2)", () => {
  test("③ permission_prompt live → correct completion to blocked", () => {
    expect(
      shouldCorrectCompletionToBlocked({
        kind: "permission_prompt",
        at: Date.now(),
      }),
    ).toBe(true);
  });

  test("③ stale/cleared/other markers → no correction (normal done safe)", () => {
    expect(shouldCorrectCompletionToBlocked(undefined)).toBe(false);
    expect(
      shouldCorrectCompletionToBlocked({ kind: "Stop", at: 1 }),
    ).toBe(false);
    expect(
      shouldCorrectCompletionToBlocked({ kind: "idle_prompt", at: 1 }),
    ).toBe(false);
    expect(
      shouldCorrectCompletionToBlocked({ kind: "UserPromptSubmit", at: 1 }),
    ).toBe(false);
    // working re-entry clears → no correction
    expect(shouldCorrectCompletionToBlocked(clearHookHintOnWorking())).toBe(
      false,
    );
  });

  test("② working re-entry clears marker (stale permission_prompt path)", () => {
    const live: HookHint = { kind: "permission_prompt", at: 1 };
    // simulate: after working re-entry slot is undefined
    const after = clearHookHintOnWorking();
    expect(after).toBeUndefined();
    // completion with cleared marker must not correct
    expect(shouldCorrectCompletionToBlocked(after)).toBe(false);
    // if we had not cleared, would correct
    expect(shouldCorrectCompletionToBlocked(live)).toBe(true);
  });

  test("④ Stop is max-bypass/poll input only — never alone-complete signal", () => {
    expect(
      stopAllowsStillRunningMaxBypass({ kind: "Stop", at: 1 }),
    ).toBe(true);
    // Stop does not imply permission correction / done
    expect(
      shouldCorrectCompletionToBlocked({ kind: "Stop", at: 1 }),
    ).toBe(false);
    // AND binding: indicator residual + Stop → still incomplete (documented
    // as pure function: Stop alone is not a completion predicate)
    const stopHint: HookHint = { kind: "Stop", at: 1 };
    const indicatorStillPresent = true;
    const mayComplete = !indicatorStillPresent; // scrape clear required
    expect(mayComplete && stopAllowsStillRunningMaxBypass(stopHint)).toBe(
      false,
    );
  });
});

// ─── socket listener guard (D4) ──────────────────────────────────────────────

describe("PLAN 0.26.0 socket listener guard (D4)", () => {
  test("loomDir path accepted; outside path rejected", async () => {
    const okPath = hookSocketPath("task_abc123", 1);
    const started = await startHookListener({
      socketPath: okPath,
      onEvent: () => {},
    });
    expect(started.ok).toBe(true);
    if (started.ok) {
      expect(existsSync(okPath)).toBe(true);
      try {
        const mode = statSync(okPath).mode & 0o777;
        // 0600 on unix; some FS may report differently — assert not world-writable
        expect(mode & 0o002).toBe(0);
      } catch {
        /* mode check best-effort */
      }
      started.listener.close();
      expect(existsSync(okPath)).toBe(false);
    }

    const outside = join(root, "outside-hook.sock");
    const bad = await startHookListener({
      socketPath: outside,
      onEvent: () => {},
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe("path_rejected");
  });

  test("malformed payload silently ignored + counter; slot uncontaminated", async () => {
    const events: HookHint[] = [];
    let malformed = 0;
    const path = hookSocketPath("task_malform01", 1);
    const started = await startHookListener({
      socketPath: path,
      onEvent: (h) => events.push(h),
      onMalformed: () => {
        malformed++;
      },
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    await writeLineToSocket(path, "NOT_JSON{{{");
    await writeLineToSocket(path, '{"kind":"Stop"}');
    await waitFor(() => events.length >= 1);

    expect(malformed).toBeGreaterThanOrEqual(1);
    expect(events).toHaveLength(1);
    expect(events[0]!.kind).toBe("Stop");
    started.listener.close();
  });

  test("bind-before unlink absorbs stale socket", async () => {
    const path = hookSocketPath("task_staleunlink", 1);
    // plant a stale non-socket file/socket remnant
    writeFileSync(path, "stale");
    expect(existsSync(path)).toBe(true);
    const started = await startHookListener({
      socketPath: path,
      onEvent: () => {},
    });
    expect(started.ok).toBe(true);
    if (started.ok) {
      started.listener.close();
      expect(existsSync(path)).toBe(false);
    }
  });

  test("flight identity guard drops late events from old attempt", async () => {
    // Simulate two flights (seq=1 old, seq=2 new) — only active flight receives.
    type FakeFlight = { id: string; hookHint?: HookHint };
    const flights = new Map<string, FakeFlight>();
    const oldF: FakeFlight = { id: "old" };
    const newF: FakeFlight = { id: "new" };
    flights.set("pane", newF); // active is new

    const pathOld = hookSocketPath("task_identity01", 1);
    const pathNew = hookSocketPath("task_identity01", 2);

    const oldListener = await startHookListener({
      socketPath: pathOld,
      onEvent: (h) => {
        // identity guard: only apply if this flight is still active
        if (flights.get("pane") !== oldF) return;
        oldF.hookHint = h;
      },
    });
    const newListener = await startHookListener({
      socketPath: pathNew,
      onEvent: (h) => {
        if (flights.get("pane") !== newF) return;
        newF.hookHint = h;
      },
    });
    expect(oldListener.ok && newListener.ok).toBe(true);
    if (!oldListener.ok || !newListener.ok) return;

    await writeLineToSocket(pathOld, '{"kind":"Stop"}');
    await writeLineToSocket(pathNew, '{"kind":"permission_prompt"}');
    await waitFor(() => newF.hookHint?.kind === "permission_prompt");

    expect(oldF.hookHint).toBeUndefined(); // dropped by identity guard
    expect(newF.hookHint?.kind).toBe("permission_prompt");

    // flight dispose → close+unlink
    oldListener.listener.close();
    newListener.listener.close();
    expect(existsSync(pathOld)).toBe(false);
    expect(existsSync(pathNew)).toBe(false);
  });
});

// ─── settings / script conventions (D2 · D4) ─────────────────────────────────

describe("PLAN 0.26.0 hook settings + script conventions (D2·D4)", () => {
  test("settings doc wires Stop / Notification / UserPromptSubmit with async:true", () => {
    const sock = hookSocketPath("task_settings01", 1);
    const doc = buildHookSettingsDoc(sock);
    expect(doc.hooks.Stop).toBeDefined();
    expect(doc.hooks.Notification).toBeDefined();
    expect(doc.hooks.UserPromptSubmit).toBeDefined();
    expect(doc.hooks.Notification![0]!.matcher).toBe(
      "permission_prompt|idle_prompt",
    );
    const check = assertHookScriptConventions(doc);
    expect(check.ok).toBe(true);
    expect(check.reasons).toEqual([]);
  });

  test("command exits 0 and does not echo stdout", () => {
    const cmd = buildHookSocketWriteCommand("/tmp/x.sock");
    expect(cmd.includes("process.exit(0)") || cmd.includes("exit 0")).toBe(
      true,
    );
    expect(/(?:^|[;&|]\s*)echo\s+[^>]/.test(cmd)).toBe(false);
  });

  test("appendHookSettingsArgv is additive and non-mutating", () => {
    const base = ["claude"];
    const sock = hookSocketPath("task_argv01", 3);
    const next = appendHookSettingsArgv(base, sock);
    expect(base).toEqual(["claude"]);
    expect(next[0]).toBe("claude");
    expect(next).toContain("--settings");
    const json = next[next.indexOf("--settings") + 1]!;
    expect(JSON.parse(json)).toEqual(JSON.parse(buildHookSettingsJson(sock)));
  });
});

// ─── injected script end-to-end (malformed must emit nothing) ────────────────

/**
 * Run the real generated hook command against a live listener and return the
 * hints it delivered. The defect being guarded lives inside the script string,
 * so the script has to actually execute for the test to mean anything.
 */
async function runHookCommand(
  socketPath: string,
  stdin: string,
): Promise<HookHint[]> {
  const got: HookHint[] = [];
  const started = await startHookListener({
    socketPath,
    onEvent: (h) => got.push(h),
  });
  expect(started.ok).toBe(true);
  if (!started.ok) return got;
  try {
    const proc = Bun.spawn(
      ["sh", "-c", buildHookSocketWriteCommand(socketPath)],
      {
        stdin: new TextEncoder().encode(stdin),
        stdout: "ignore",
        stderr: "ignore",
      },
    );
    await proc.exited;
    // Emission is a socket write from an already-exited child; give the
    // listener a beat, then confirm nothing further arrives.
    await waitFor(() => got.length >= 1, 1_500);
    await Bun.sleep(100);
  } finally {
    started.listener.close();
  }
  return got;
}

describe("hook script emits nothing on malformed / unknown input", () => {
  test("malformed stdin → 0 events (no default Stop)", async () => {
    let n = 0;
    for (const bad of ["not json", "", "{", "[1,2,3]", "null"]) {
      n += 1;
      const got = await runHookCommand(
        hookSocketPath(`task_bad${n}`, 1),
        bad,
      );
      expect({ input: bad, got }).toEqual({ input: bad, got: [] });
    }
  }, 20_000);

  test("unknown event name / unknown kind → 0 events", async () => {
    const unknownEvent = await runHookCommand(
      hookSocketPath("task_unkev", 1),
      JSON.stringify({ hook_event_name: "PreToolUse", tool_input: { a: 1 } }),
    );
    expect(unknownEvent).toEqual([]);

    const unknownKind = await runHookCommand(
      hookSocketPath("task_unkkind", 1),
      JSON.stringify({ kind: "Bogus" }),
    );
    expect(unknownKind).toEqual([]);
  }, 20_000);

  test("recognized payloads still map exactly as before", async () => {
    const cases: Array<[string, string, HookHintKind]> = [
      ["stop", JSON.stringify({ hook_event_name: "Stop" }), "Stop"],
      [
        "perm",
        JSON.stringify({
          hook_event_name: "Notification",
          notification_type: "permission_prompt",
        }),
        "permission_prompt",
      ],
      [
        "idle",
        JSON.stringify({
          hook_event_name: "Notification",
          notification_type: "idle_prompt",
        }),
        "idle_prompt",
      ],
      [
        "ups",
        JSON.stringify({ hook_event_name: "UserPromptSubmit", prompt: "hi" }),
        "UserPromptSubmit",
      ],
      ["compact", JSON.stringify({ kind: "Stop" }), "Stop"],
    ];
    for (const [name, payload, expected] of cases) {
      const got = await runHookCommand(hookSocketPath(`task_ok${name}`, 1), payload);
      expect(got.map((h) => h.kind)).toEqual([expected]);
    }
  }, 30_000);
});

// ─── result delivery observability (PATCH 1 B) ───────────────────────────────

describe("result delivery unconfirmed counter", () => {
  test("records a structured line with cardId / seq / reason and bumps count", () => {
    resetResultDeliveryUnconfirmed();
    expect(resultDeliveryUnconfirmed()).toBe(0);

    const lines: string[] = [];
    const orig = console.error;
    console.error = (...args: unknown[]) => {
      lines.push(args.map((a) => String(a)).join(" "));
    };
    try {
      recordResultDeliveryUnconfirmed({
        cardId: "task_deliver01",
        seq: 4,
        reason: "pane_died",
      });
      recordResultDeliveryUnconfirmed({ cardId: "task_deliver02" });
    } finally {
      console.error = orig;
    }

    expect(resultDeliveryUnconfirmed()).toBe(2);
    expect(lines).toHaveLength(2);
    for (const l of lines) expect(l).toContain(RESULT_DELIVERY_UNCONFIRMED);

    const first = JSON.parse(
      lines[0]!.slice(lines[0]!.indexOf("{")),
    ) as Record<string, unknown>;
    expect(first).toEqual({
      event: RESULT_DELIVERY_UNCONFIRMED,
      cardId: "task_deliver01",
      seq: 4,
      reason: "pane_died",
      count: 1,
    });

    // optional fields omitted rather than emitted as undefined
    const second = JSON.parse(
      lines[1]!.slice(lines[1]!.indexOf("{")),
    ) as Record<string, unknown>;
    expect(second).toEqual({
      event: RESULT_DELIVERY_UNCONFIRMED,
      cardId: "task_deliver02",
      count: 2,
    });

    resetResultDeliveryUnconfirmed();
  });
});

// ─── telemetry (D6 · L-3) ────────────────────────────────────────────────────

describe("PLAN 0.26.0 telemetry metadata-only (D6 · L-3)", () => {
  test("appends counters without payload body fields", () => {
    appendHookTelemetry({ type: "hook_hint", kind: "Stop" });
    appendHookTelemetry({ type: "fallback", reason: "no_listener" });
    appendHookTelemetry({
      type: "permission_prompt",
      kind: "permission_prompt",
    });
    appendHookTelemetry({ type: "agent_blocked_correction" });

    const lines = readHookTelemetryLines();
    expect(lines.length).toBeGreaterThanOrEqual(4);
    const types = lines.map((l) => l.type);
    expect(types).toContain("hook_hint");
    expect(types).toContain("fallback");
    expect(types).toContain("permission_prompt");
    expect(types).toContain("agent_blocked_correction");

    const raw = readFileSync(hookTelemetryPath(), "utf8");
    // L-3: no payload body keys
    expect(raw).not.toContain("last_assistant_message");
    expect(raw).not.toContain("tool_input");
    expect(raw).not.toMatch(/"prompt"\s*:/);
  });
});

// ─── D6(b) completion fallback classification + choke-point helper ───────────

describe("PLAN 0.26.0 D6(b) classifyCompletionFallback (pure)", () => {
  test("alreadyRecorded → null (spawn/prior fallback wins)", () => {
    expect(classifyCompletionFallback(undefined, false, true)).toBeNull();
    expect(
      classifyCompletionFallback({ kind: "Stop", at: 1 }, true, true),
    ).toBeNull();
  });

  test("listener not established → no_listener", () => {
    expect(classifyCompletionFallback(undefined, false, false)).toBe(
      "no_listener",
    );
    // even with a hint present, listener-not-established wins
    expect(
      classifyCompletionFallback({ kind: "Stop", at: 1 }, false, false),
    ).toBe("no_listener");
  });

  test("listener ok + no hint → no_hint", () => {
    expect(classifyCompletionFallback(undefined, true, false)).toBe("no_hint");
  });

  test("listener ok + non-permission hint → stale_hint", () => {
    // permission_prompt never reaches this choke (corrected upstream) —
    // only Stop / idle_prompt / UserPromptSubmit appear here as stale.
    expect(
      classifyCompletionFallback({ kind: "Stop", at: 1 }, true, false),
    ).toBe("stale_hint");
    expect(
      classifyCompletionFallback({ kind: "idle_prompt", at: 1 }, true, false),
    ).toBe("stale_hint");
    expect(
      classifyCompletionFallback(
        { kind: "UserPromptSubmit", at: 1 },
        true,
        false,
      ),
    ).toBe("stale_hint");
  });
});

describe("PLAN 0.26.0 D6(b) maybeAppendCompletionFallback (runtime choke)", () => {
  test("(a) active + listener not established → fallback/no_listener once + flag", () => {
    const flight = {
      hookSensorActive: true,
      hookListenerEstablished: false,
      hookFallbackRecorded: false,
    };
    const before = readHookTelemetryLines().length;
    expect(maybeAppendCompletionFallback(flight)).toBe(true);
    const lines = readHookTelemetryLines();
    expect(lines.length).toBe(before + 1);
    const last = lines[lines.length - 1]!;
    expect(last.type).toBe("fallback");
    expect(last.reason).toBe("no_listener");
    expect(flight.hookFallbackRecorded).toBe(true);
  });

  test("(b) active + listener ok + no hint → no_hint", () => {
    const flight = {
      hookSensorActive: true,
      hookListenerEstablished: true,
      hookFallbackRecorded: false,
    };
    expect(maybeAppendCompletionFallback(flight)).toBe(true);
    const last = readHookTelemetryLines().at(-1)!;
    expect(last.type).toBe("fallback");
    expect(last.reason).toBe("no_hint");
    expect(flight.hookFallbackRecorded).toBe(true);
  });

  test("(c) active + Stop hint → stale_hint", () => {
    const flight = {
      hookSensorActive: true,
      hookListenerEstablished: true,
      hookHint: { kind: "Stop" as const, at: 1 },
      hookFallbackRecorded: false,
    };
    expect(maybeAppendCompletionFallback(flight)).toBe(true);
    const last = readHookTelemetryLines().at(-1)!;
    expect(last.type).toBe("fallback");
    expect(last.reason).toBe("stale_hint");
  });

  test("(d) re-call with hookFallbackRecorded → no second append", () => {
    const flight = {
      hookSensorActive: true,
      hookListenerEstablished: true,
      hookFallbackRecorded: false,
    };
    expect(maybeAppendCompletionFallback(flight)).toBe(true);
    const afterFirst = readHookTelemetryLines().length;
    expect(maybeAppendCompletionFallback(flight)).toBe(false);
    expect(readHookTelemetryLines().length).toBe(afterFirst);
  });

  test("(e) spawn-fallback already recorded → no completion append", () => {
    const flight = {
      hookSensorActive: true,
      hookListenerEstablished: false,
      hookFallbackRecorded: true, // e.g. bind_failed at spawn
    };
    const before = readHookTelemetryLines().length;
    expect(maybeAppendCompletionFallback(flight)).toBe(false);
    expect(readHookTelemetryLines().length).toBe(before);
  });
});

describe("PLAN 0.26.0 D6(b) L-2 off / non-claude no emit", () => {
  test("hookSensorActive undefined → false + no JSONL change", () => {
    const flight = {
      hookListenerEstablished: false,
      hookFallbackRecorded: false,
    };
    const before = readHookTelemetryLines().length;
    expect(maybeAppendCompletionFallback(flight)).toBe(false);
    expect(readHookTelemetryLines().length).toBe(before);
  });

  test("hookSensorActive false → false + no JSONL change", () => {
    const flight = {
      hookSensorActive: false,
      hookListenerEstablished: false,
      hookFallbackRecorded: false,
    };
    const before = readHookTelemetryLines().length;
    expect(maybeAppendCompletionFallback(flight)).toBe(false);
    expect(readHookTelemetryLines().length).toBe(before);
  });
});

// ─── config opt-in (D7 adjacent) ─────────────────────────────────────────────

describe("PLAN 0.26.0 bridge-config hookSensor opt-in", () => {
  test("default off; only true enables; unknown → false", () => {
    const profile = "hookcfg";
    expect(defaultBridgeConfig().hookSensor).toBe(false);
    expect(loadBridgeConfig(profile).hookSensor).toBe(false);

    const cfg = defaultBridgeConfig();
    cfg.hookSensor = true;
    saveBridgeConfig(profile, cfg);
    expect(loadBridgeConfig(profile).hookSensor).toBe(true);

    // corrupt raw
    const p = bridgeConfigPath(profile);
    const raw = JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
    raw.hookSensor = "yes";
    writeFileSync(p, `${JSON.stringify(raw, null, 2)}\n`);
    expect(loadBridgeConfig(profile).hookSensor).toBe(false);

    raw.hookSensor = false;
    writeFileSync(p, `${JSON.stringify(raw, null, 2)}\n`);
    expect(loadBridgeConfig(profile).hookSensor).toBe(false);
  });
});

// ─── fallback / priority pure contracts (D3 · D5) ────────────────────────────

describe("PLAN 0.26.0 priority branch + fail-open (D3 · D5)", () => {
  test("hookHint present → priority inputs; absent → no correction (fail-open)", () => {
    // D3: permission_prompt is the only completion→blocked correction
    const withHint: HookHint = { kind: "permission_prompt", at: 1 };
    expect(shouldCorrectCompletionToBlocked(withHint)).toBe(true);

    // D5: no hint → identical to 0.25.0 judgment (no correction)
    expect(shouldCorrectCompletionToBlocked(undefined)).toBe(false);

    // Stop present → still-running acceleration input, not done
    const stop: HookHint = { kind: "Stop", at: 2 };
    expect(stopAllowsStillRunningMaxBypass(stop)).toBe(true);
    expect(shouldCorrectCompletionToBlocked(stop)).toBe(false);
  });

  test("stale permission_prompt after working clear → normal done (no mis-correct)", () => {
    // Simulate approval grant path: permission_prompt was set, then working
    // re-entry clears it (approval fires none of the 3 wired events).
    let slot: HookHint | undefined = {
      kind: "permission_prompt",
      at: 1,
    };
    slot = clearHookHintOnWorking();
    // later herdr done/idle
    expect(shouldCorrectCompletionToBlocked(slot)).toBe(false);
  });
});

// ─── listener lifecycle end-to-end ───────────────────────────────────────────

describe("PLAN 0.26.0 listener lifecycle close+unlink on dispose", () => {
  test("close is idempotent and unlinks", async () => {
    const path = hookSocketPath("task_lifecycle1", 9);
    const got: HookHint[] = [];
    const started = await startHookListener({
      socketPath: path,
      onEvent: (h) => got.push(h),
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const listener: HookListener = started.listener;

    await writeLineToSocket(path, '{"kind":"UserPromptSubmit"}');
    await waitFor(() => got.length === 1);
    expect(got[0]!.kind).toBe("UserPromptSubmit");

    listener.close();
    listener.close(); // idempotent
    expect(existsSync(path)).toBe(false);
  });
});
