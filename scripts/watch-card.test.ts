/**
 * Unit tests for scripts/watch-card.ts — pure judgment only.
 * Synthetic inputs; never calls live herdr.
 *
 *   env -u LOOM_RELAY_TOKEN -u LOOM_RELAY_URL bun test scripts/watch-card.test.ts
 */
import { describe, expect, test } from "bun:test";
import {
  DEFAULT_MARKER_TAIL_LINES,
  DEFAULT_TIMEOUT_MS,
  detectLimitSignal,
  evaluateTick,
  findPaneByAgentCwd,
  hasUnfilledPlaceholder,
  isNewMarkerMatch,
  isPanePresent,
  listAcceptedMarkerLines,
  matchesMarker,
  parseArgs,
  parsePaneList,
  resolveMarker,
  tailText,
  type PaneInfo,
  type TickInput,
} from "./watch-card.ts";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const PANE_A: PaneInfo = {
  pane_id: "w3:p10",
  agent: "grok",
  cwd: "/Users/kyoungsiklee/projects/fable-advisor",
  agent_status: "working",
};

const PANE_B: PaneInfo = {
  pane_id: "w3:p20",
  agent: "codex",
  cwd: "/Users/kyoungsiklee/projects/fable-advisor",
  agent_status: "working",
};

const LIST_ENVELOPE = JSON.stringify({
  id: "cli:pane:list",
  result: {
    type: "pane.list",
    panes: [PANE_A, PANE_B],
  },
});

function tick(partial: Partial<TickInput> & Pick<TickInput, "text" | "panePresent">): TickInput {
  return {
    marker: "[DONE]",
    elapsedMs: 0,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    ...partial,
  };
}

// ─── Marker ──────────────────────────────────────────────────────────────────

describe("matchesMarker", () => {
  test("literal substring hit", () => {
    expect(matchesMarker("hello [DONE] world", "[DONE]")).toBe(true);
  });

  test("literal miss", () => {
    expect(matchesMarker("still working…", "[DONE]")).toBe(false);
  });

  test("RegExp hit", () => {
    expect(matchesMarker("units=5/5 exits=4/4", /units=\d+\/\d+/)).toBe(true);
  });

  test("RegExp miss", () => {
    expect(matchesMarker("no numbers here", /units=\d+\/\d+/)).toBe(false);
  });
});

// ─── Template / baseline / tail (prompt-echo false-positive defense) ─────────

const HOOK_MARKER = "[HOOKCACHE-D-VERIFY-DONE]";
const HOOK_TEMPLATE =
  `완료 시 최종 줄에 정확히: ${HOOK_MARKER} fix1=<closed|open|partial> fix2=<closed|open>`;
const HOOK_FILLED = `${HOOK_MARKER} fix1=closed fix2=open`;

describe("hasUnfilledPlaceholder / template rejection", () => {
  test("① template line with angle-bracket placeholders is not a marker", () => {
    expect(hasUnfilledPlaceholder(HOOK_TEMPLATE)).toBe(true);
    expect(matchesMarker(HOOK_TEMPLATE, HOOK_MARKER)).toBe(false);
    expect(listAcceptedMarkerLines(HOOK_TEMPLATE, HOOK_MARKER)).toEqual([]);
  });

  test("② filled real marker is accepted", () => {
    expect(hasUnfilledPlaceholder(HOOK_FILLED)).toBe(false);
    expect(matchesMarker(HOOK_FILLED, HOOK_MARKER)).toBe(true);
    expect(listAcceptedMarkerLines(HOOK_FILLED, HOOK_MARKER)).toEqual([
      HOOK_FILLED,
    ]);
  });

  test("rejectPlaceholders:false still sees template as raw substring", () => {
    expect(
      matchesMarker(HOOK_TEMPLATE, HOOK_MARKER, { rejectPlaceholders: false }),
    ).toBe(true);
  });
});

describe("isNewMarkerMatch — baseline", () => {
  test("③ match present at watch start is ignored; same marker newly appearing is accepted", () => {
    // Simple marker (no placeholders) — template filter alone cannot help.
    const baseline = [
      "▶ Loom dispatched task",
      "When done print exactly: [DONE]",
      "Working…",
    ].join("\n");
    // Still only the instruction line — not new vs baseline.
    expect(isNewMarkerMatch(baseline, baseline, "[DONE]")).toBe(false);
    // Worker finishes: same instruction still on screen + real terminal line.
    const later = baseline + "\n[DONE]";
    expect(isNewMarkerMatch(later, baseline, "[DONE]")).toBe(true);
  });

  test("③b evaluateTick continues on baseline-only match, exits when new appears", () => {
    const baseline = "prompt says print [DONE] at end\n…working…";
    const still = evaluateTick(
      tick({
        text: baseline,
        panePresent: true,
        marker: "[DONE]",
        baselineText: baseline,
      }),
    );
    expect(still).toEqual({ action: "continue" });

    const done = evaluateTick(
      tick({
        text: baseline + "\n[DONE]",
        panePresent: true,
        marker: "[DONE]",
        baselineText: baseline,
      }),
    );
    expect(done).toEqual({ action: "exit", reason: "marker" });
  });

  test("④ prompt echo + real output coexist — only filled output fires", () => {
    const screen = [
      "… dispatch prompt …",
      HOOK_TEMPLATE,
      "… agent work output …",
      "analysis complete",
      HOOK_FILLED,
    ].join("\n");
    // Without baseline: template rejected, filled accepted.
    expect(matchesMarker(screen, HOOK_MARKER)).toBe(true);
    expect(listAcceptedMarkerLines(screen, HOOK_MARKER)).toEqual([HOOK_FILLED]);

    // With baseline = prompt-only (template echo at start): filled is new.
    const baseline = ["… dispatch prompt …", HOOK_TEMPLATE, "starting…"].join(
      "\n",
    );
    expect(isNewMarkerMatch(baseline, baseline, HOOK_MARKER)).toBe(false);
    expect(isNewMarkerMatch(screen, baseline, HOOK_MARKER)).toBe(true);

    const d = evaluateTick(
      tick({
        text: screen,
        panePresent: true,
        marker: HOOK_MARKER,
        baselineText: baseline,
      }),
    );
    expect(d).toEqual({ action: "exit", reason: "marker" });
  });

  test("template-only echo never exits even without baseline", () => {
    const d = evaluateTick(
      tick({
        text: HOOK_TEMPLATE,
        panePresent: true,
        marker: HOOK_MARKER,
      }),
    );
    expect(d).toEqual({ action: "continue" });
  });
});

describe("tailText / marker tail window", () => {
  test("marker only in head outside tail window is ignored", () => {
    const head = "[DONE] early noise";
    const mid = Array.from({ length: 50 }, (_, i) => `line ${i}`).join("\n");
    const text = `${head}\n${mid}\nstill working`;
    expect(matchesMarker(text, "[DONE]", { tailLines: 10 })).toBe(false);
    expect(matchesMarker(text, "[DONE]", { tailLines: 0 })).toBe(true); // full
  });

  test("marker in last N lines is found", () => {
    const mid = Array.from({ length: 50 }, (_, i) => `line ${i}`).join("\n");
    const text = `${mid}\n[DONE]`;
    expect(matchesMarker(text, "[DONE]", { tailLines: 5 })).toBe(true);
  });

  test("tailText keeps last n lines", () => {
    expect(tailText("a\nb\nc\nd", 2)).toBe("c\nd");
    expect(tailText("a\nb", 10)).toBe("a\nb");
  });

  test("default tail constant is positive", () => {
    expect(DEFAULT_MARKER_TAIL_LINES).toBeGreaterThan(0);
  });
});

describe("evaluateTick — marker", () => {
  test("exits with reason=marker when text contains marker", () => {
    const d = evaluateTick(
      tick({
        text: "…\n[WATCH-CARD-DONE] units=5/5\n…",
        panePresent: true,
        marker: "[WATCH-CARD-DONE]",
      }),
    );
    expect(d).toEqual({ action: "exit", reason: "marker" });
  });

  test("marker wins over pane-gone when both true (last-read still has done)", () => {
    const d = evaluateTick(
      tick({
        text: "finished [DONE]",
        panePresent: false,
        marker: "[DONE]",
      }),
    );
    expect(d.action).toBe("exit");
    if (d.action === "exit") expect(d.reason).toBe("marker");
  });
});

// ─── Pane gone ───────────────────────────────────────────────────────────────

describe("isPanePresent / evaluateTick — pane-gone", () => {
  test("isPanePresent true when id listed", () => {
    expect(isPanePresent([PANE_A, PANE_B], "w3:p10")).toBe(true);
  });

  test("isPanePresent false when id missing", () => {
    expect(isPanePresent([PANE_A, PANE_B], "w3:p99")).toBe(false);
  });

  test("exits with reason=pane-gone when pane missing and no marker/limit", () => {
    const d = evaluateTick(
      tick({
        text: null,
        panePresent: false,
        marker: "[DONE]",
      }),
    );
    expect(d).toEqual({ action: "exit", reason: "pane-gone" });
  });

  test("pane-gone even when last text is non-empty but markless", () => {
    // Death / manual kill / finish-close are not distinguished.
    const d = evaluateTick(
      tick({
        text: "Working on stuff… no done marker yet",
        panePresent: false,
        marker: "[DONE]",
      }),
    );
    expect(d).toEqual({ action: "exit", reason: "pane-gone" });
  });
});

// ─── Limit signals ───────────────────────────────────────────────────────────

describe("detectLimitSignal / evaluateTick — limit", () => {
  test.each([
    ["usage limit reached — try again later", "usage limit reached"],
    ["Error: Weekly limit hit for codex", "Weekly limit"],
    ["Authentication failed. Please re-login.", "Authentication failed"],
    ["HTTP 429 rate limit exceeded", "rate limit"],
  ] as const)("detects %s", (text, expected) => {
    expect(detectLimitSignal(text)).toBe(expected);
  });

  test("case-insensitive", () => {
    expect(detectLimitSignal("USAGE LIMIT REACHED")).toBe("usage limit reached");
  });

  test("null when clean", () => {
    expect(detectLimitSignal("agent is working fine")).toBeNull();
  });

  test("evaluateTick exits with reason=limit and detail", () => {
    const d = evaluateTick(
      tick({
        text: "Sorry, Weekly limit reached for this account",
        panePresent: true,
      }),
    );
    expect(d.action).toBe("exit");
    if (d.action === "exit") {
      expect(d.reason).toBe("limit");
      expect(d.detail).toBe("Weekly limit");
    }
  });

  test("marker still beats limit when both present", () => {
    const d = evaluateTick(
      tick({
        text: "[DONE]\n(also rate limit noise)",
        panePresent: true,
        marker: "[DONE]",
      }),
    );
    expect(d).toEqual({ action: "exit", reason: "marker" });
  });
});

// ─── Timeout ─────────────────────────────────────────────────────────────────

describe("evaluateTick — timeout", () => {
  test("exits with reason=timeout when elapsed >= budget", () => {
    const d = evaluateTick(
      tick({
        text: "still going",
        panePresent: true,
        elapsedMs: 30 * 60 * 1000,
        timeoutMs: 30 * 60 * 1000,
      }),
    );
    expect(d).toEqual({ action: "exit", reason: "timeout" });
  });

  test("timeout when over budget", () => {
    const d = evaluateTick(
      tick({
        text: null,
        panePresent: true,
        elapsedMs: 1001,
        timeoutMs: 1000,
      }),
    );
    expect(d).toEqual({ action: "exit", reason: "timeout" });
  });
});

// ─── Continue ────────────────────────────────────────────────────────────────

describe("evaluateTick — continue (alive, no marker, under budget)", () => {
  test("keeps waiting when marker absent and pane alive", () => {
    const d = evaluateTick(
      tick({
        text: "Working… no terminal signal yet",
        panePresent: true,
        elapsedMs: 5_000,
        timeoutMs: DEFAULT_TIMEOUT_MS,
        marker: "[DONE]",
      }),
    );
    expect(d).toEqual({ action: "continue" });
  });

  test("continue with empty text while pane present", () => {
    const d = evaluateTick(
      tick({
        text: "",
        panePresent: true,
        elapsedMs: 100,
        timeoutMs: 60_000,
      }),
    );
    expect(d).toEqual({ action: "continue" });
  });

  test("continue when text null (read failed) but pane still listed", () => {
    // Transient read failure must not be confused with pane-gone.
    const d = evaluateTick(
      tick({
        text: null,
        panePresent: true,
        elapsedMs: 100,
        timeoutMs: 60_000,
      }),
    );
    expect(d).toEqual({ action: "continue" });
  });
});

// ─── parsePaneList / discovery ───────────────────────────────────────────────

describe("parsePaneList", () => {
  test("parses herdr JSON envelope", () => {
    const panes = parsePaneList(LIST_ENVELOPE);
    expect(panes).toHaveLength(2);
    expect(panes[0]!.pane_id).toBe("w3:p10");
    expect(panes[1]!.agent).toBe("codex");
  });

  test("empty panes array", () => {
    expect(
      parsePaneList(JSON.stringify({ id: "cli:pane:list", result: { panes: [] } })),
    ).toEqual([]);
  });

  test("tolerates flat panes root", () => {
    const panes = parsePaneList(JSON.stringify({ panes: [PANE_A] }));
    expect(panes).toHaveLength(1);
  });
});

describe("findPaneByAgentCwd", () => {
  test("finds by agent + cwd", () => {
    const hit = findPaneByAgentCwd(
      [PANE_A, PANE_B],
      "grok",
      "/Users/kyoungsiklee/projects/fable-advisor",
    );
    expect(hit?.pane_id).toBe("w3:p10");
  });

  test("case-insensitive agent", () => {
    const hit = findPaneByAgentCwd(
      [PANE_A],
      "GROK",
      "/Users/kyoungsiklee/projects/fable-advisor",
    );
    expect(hit?.pane_id).toBe("w3:p10");
  });

  test("undefined when no match", () => {
    expect(
      findPaneByAgentCwd([PANE_A], "claude", "/Users/kyoungsiklee/projects/fable-advisor"),
    ).toBeUndefined();
  });

  test("prefers last match when several share agent+cwd", () => {
    const twin: PaneInfo = {
      pane_id: "w3:p99",
      agent: "grok",
      cwd: PANE_A.cwd,
    };
    const hit = findPaneByAgentCwd([PANE_A, twin], "grok", PANE_A.cwd!);
    expect(hit?.pane_id).toBe("w3:p99");
  });
});

// ─── CLI arg parse (pure) ────────────────────────────────────────────────────

describe("parseArgs / resolveMarker", () => {
  test("defaults timeout to 30 min", () => {
    const a = parseArgs(["--pane", "w3:p1", "--marker", "X"]);
    expect(a.timeoutMs).toBe(DEFAULT_TIMEOUT_MS);
    expect(a.pane).toBe("w3:p1");
    expect(a.marker).toBe("X");
    expect(a.markerTailLines).toBe(DEFAULT_MARKER_TAIL_LINES);
  });

  test("agent+cwd discovery flags", () => {
    const a = parseArgs([
      "--agent",
      "grok",
      "--cwd",
      "/tmp/proj",
      "--marker",
      "[DONE]",
      "--timeout-ms",
      "5000",
    ]);
    expect(a.agent).toBe("grok");
    expect(a.cwd).toBe("/tmp/proj");
    expect(a.timeoutMs).toBe(5000);
  });

  test("resolveMarker literal", () => {
    expect(
      resolveMarker({
        timeoutMs: 1,
        intervalMs: 1,
        markerTailLines: DEFAULT_MARKER_TAIL_LINES,
        herdr: "herdr",
        marker: "Z",
      }),
    ).toBe("Z");
  });

  test("resolveMarker regex", () => {
    const m = resolveMarker({
      timeoutMs: 1,
      intervalMs: 1,
      markerTailLines: DEFAULT_MARKER_TAIL_LINES,
      herdr: "herdr",
      markerRe: "units=\\d+/\\d+",
    });
    expect(m).toBeInstanceOf(RegExp);
    expect((m as RegExp).test("units=3/3")).toBe(true);
  });

  test("--tail-lines overrides default", () => {
    const a = parseArgs([
      "--pane",
      "w3:p1",
      "--marker",
      "X",
      "--tail-lines",
      "12",
    ]);
    expect(a.markerTailLines).toBe(12);
  });
});

// ─── All four exit reasons reachable via evaluateTick ────────────────────────

describe("exit-reason coverage (4/4)", () => {
  test("marker | pane-gone | limit | timeout all produce exit", () => {
    const reasons = [
      evaluateTick(tick({ text: "[DONE]", panePresent: true, marker: "[DONE]" })),
      evaluateTick(tick({ text: null, panePresent: false })),
      evaluateTick(
        tick({ text: "Authentication failed at login", panePresent: true }),
      ),
      evaluateTick(
        tick({
          text: "alive",
          panePresent: true,
          elapsedMs: 9999,
          timeoutMs: 1000,
        }),
      ),
    ];
    const got = reasons.map((d) => {
      expect(d.action).toBe("exit");
      return d.action === "exit" ? d.reason : "continue";
    });
    expect(got).toEqual(["marker", "pane-gone", "limit", "timeout"]);
  });
});
