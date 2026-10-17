/**
 * PLAN 0.40.0 P3b (tests-first) — Astra 0077 Medium: R7 one marker line on the first turn also
 * covers the composed listing entry. Name, description and path are each clean, but the line
 * `- <name>: <description> — <path>` can still fold to `loomdispatchedtask`; renderSkillListing
 * must throw for the whole entry (the caller turns that into spawn_setup_failed, no spawn).
 *
 * Unavailable lines are `- <name>: unavailable: <reason>` with a fixed reason enum: after the
 * name comes `unavailable…`, so only a name that itself holds the marker can fold to it, and
 * assertName already rejects that. Here only ordinary unavailable lines are checked (no throw).
 *
 * The headless case reuses the fake-CLI harness of headless-card-prompt-marker.test.ts (copied,
 * trimmed). Run with HOME and LOOM_TEST_HOME pointing at a temp dir; loomDir is explicit.
 */
import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  type AgentKind,
  defaultWorkerPermissions,
  type WorkerConfig,
} from "./agent-argv";
import { HeadlessDispatcher, type HeadlessDispatchCard } from "./headless-worker";
import { type AvailableSkill, roomSkillsPath } from "./skill-materialize";
import { containsMarker, renderSkillListing } from "./skill-prompt";

const ENTRY_ERROR = "skill listing: skill entry contains the task marker";
const HEADER =
  "Available skills — Loom copied these for this card outside the working directory. Reading the SKILL.md files listed here is allowed; do not modify them. Read the SKILL.md before use:";
const AGENTS = ["claude", "codex", "grok"] as const;

function available(name: string, description: string, skillMdPath: string): AvailableSkill {
  return { name, source: "user", description, skillMdPath };
}

// ---------------------------------------------------------------------------
// unit: renderSkillListing composed-entry check
// ---------------------------------------------------------------------------

describe("P3b composed listing entry folds to the marker → throw", () => {
  const joined = available("loom-dispatched", "task", "/abs/skills/loom-dispatched/SKILL.md");

  test("each field alone is clean (the gap)", () => {
    expect(containsMarker(joined.name)).toBe(false);
    expect(containsMarker(joined.description)).toBe(false);
    expect(containsMarker(joined.skillMdPath)).toBe(false);
  });

  for (const agent of ["codex", "grok"] as const) {
    test(`${agent}: name + description → throws`, () => {
      expect(() => renderSkillListing(agent, { available: [joined], unavailable: [] })).toThrow(
        ENTRY_ERROR,
      );
    });

    test(`${agent}: split across description and path → throws`, () => {
      const split = available("helper", "check loom", "/dispatched-task/SKILL.md");
      expect(containsMarker(split.name)).toBe(false);
      expect(containsMarker(split.description)).toBe(false);
      expect(containsMarker(split.skillMdPath)).toBe(false);
      expect(() => renderSkillListing(agent, { available: [split], unavailable: [] })).toThrow(
        ENTRY_ERROR,
      );
    });

    test(`${agent}: a clean entry next to the bad one does not rescue it`, () => {
      const clean = available("aaa", "A clean description.", "/abs/skills/aaa/SKILL.md");
      expect(() =>
        renderSkillListing(agent, { available: [clean, joined], unavailable: [] }),
      ).toThrow(ENTRY_ERROR);
    });
  }

  test("claude: available entries are not rendered, so the joined pair does not throw", () => {
    expect(renderSkillListing("claude", { available: [joined], unavailable: [] })).toBe("");
    expect(
      renderSkillListing("claude", {
        available: [joined],
        unavailable: [{ name: "missing-one", reason: "not installed" }],
      }),
    ).toBe("Unavailable skills:\n- missing-one: unavailable: not installed");
  });

  test("unavailable lines of ordinary names do not throw (every agent, every reason)", () => {
    const reasons = [
      "not allowed by policy",
      "not installed",
      "unsafe source",
      "too large",
      "invalid SKILL.md",
      "bad description",
      "requires policy",
    ] as const;
    for (const agent of AGENTS) {
      for (const name of ["loom-dispatched", "loom-dispatched-ta", "loom-card-report"]) {
        for (const reason of reasons) {
          const out = renderSkillListing(agent, { available: [], unavailable: [{ name, reason }] });
          expect(out.endsWith(`\n- ${name}: unavailable: ${reason}`)).toBe(true);
        }
      }
    }
  });
});

describe("P3b controls: ordinary entries render byte-equal to the 0.39 format", () => {
  const report = available(
    "loom-card-report",
    "Format the final report of a Loom card task. Use it when you write your last message.",
    "/abs/cards/x/skills/plugin/skills/loom-card-report/SKILL.md",
  );
  const memory = available(
    "loom-memory-candidates",
    "Propose memory candidates for the owner to review.",
    "/abs/cards/x/skills/plugin/skills/loom-memory-candidates/SKILL.md",
  );
  const shadow: AvailableSkill = {
    ...available("tidy", "Tidy things up.", "/abs/cards/x/skills/plugin/skills/tidy/SKILL.md"),
    shadowsBuiltin: true,
  };

  for (const agent of ["codex", "grok"] as const) {
    test(`${agent}`, () => {
      expect(
        renderSkillListing(agent, {
          available: [report, memory, shadow],
          unavailable: [{ name: "missing-one", reason: "not installed" }],
        }),
      ).toBe(
        [
          HEADER,
          `- loom-card-report: ${report.description} — ${report.skillMdPath}`,
          `- loom-memory-candidates: ${memory.description} — ${memory.skillMdPath}`,
          `- tidy: Tidy things up. — ${shadow.skillMdPath} (user, shadows bundled)`,
          "- missing-one: unavailable: not installed",
        ].join("\n"),
      );
    });
  }
});

// ---------------------------------------------------------------------------
// headless: a user skill loom-dispatched (description `task`) selected for the room
// ---------------------------------------------------------------------------

const PEER = "test-local-peer";

const FAKE_SH = `#!/bin/sh
kind="$1"; out="$2"; shift 2
n=1
while [ -e "$out/stdin-$kind-$n" ]; do n=$((n+1)); done
printf '%s\\0' "$@" > "$out/argv-$kind-$n"
cat > "$out/stdin-$kind-$n"
case "$kind" in
  claude) printf '%s\\n' '{"type":"result","result":"done","is_error":false,"usage":{"input_tokens":1,"output_tokens":1}}' ;;
  codex) printf '%s\\n' '{"type":"item.completed","item":{"type":"agent_message","text":"done"}}' '{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1}}' ;;
  grok) printf '%s\\n' '{"type":"text","data":"done"}' '{"type":"end","stopReason":"end_turn","usage":{"input_tokens":1,"output_tokens":1}}' ;;
esac
`;

type Fields = { reason?: string; status?: string; output?: string; note?: string };

const harnesses: Harness[] = [];

class Harness {
  readonly root = realpathSync(mkdtempSync(join(tmpdir(), "loom-entry-marker-")));
  readonly loomDir = join(this.root, "home", ".loom");
  readonly cwd = join(this.root, "work");
  readonly out = join(this.root, "dump");
  readonly script = join(this.root, "fake.sh");
  readonly config: WorkerConfig;
  readonly calls: Array<{ fields: Fields }> = [];
  readonly dispatchers: HeadlessDispatcher[] = [];
  readonly card: HeadlessDispatchCard;

  constructor(agent: AgentKind) {
    for (const d of [this.loomDir, this.cwd, this.out]) mkdirSync(d, { recursive: true });
    writeFileSync(this.script, FAKE_SH, { mode: 0o700 });
    this.config = {
      backend: "headless",
      cwd: this.cwd,
      allowedRoots: [this.root],
      maxConcurrent: { claude: 1, codex: 1, grok: 1 },
      timeoutMs: 30_000,
      permissions: defaultWorkerPermissions(),
      skills: { enabled: true },
    } as WorkerConfig;
    this.card = {
      roomId: "room_beta",
      cardId: "task_card_entry_marker",
      agent,
      prompt: "do the bounded task",
      fromPeerId: "original-peer",
      dispatchHandoffId: "original-handoff",
    };
    harnesses.push(this);
  }

  userSkill(name: string, description: string): void {
    const dir = join(this.loomDir, "skills", name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "SKILL.md"),
      `---\nname: ${name}\ndescription: ${description}\n---\n\nBody.\n`,
      { mode: 0o644 },
    );
  }
  selectSkills(names: string[]): void {
    const path = roomSkillsPath(this.loomDir, this.card.roomId);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ version: 1, skills: names }));
  }
  dispatcher(): HeadlessDispatcher {
    const commands = Object.fromEntries(
      AGENTS.map((agent) => [agent, { bin: "/bin/sh", args: [this.script, agent, this.out] }]),
    ) as Record<AgentKind, { bin: string; args: string[] }>;
    const deps = {
      config: this.config,
      loomDir: this.loomDir,
      localPeerId: PEER,
      node: "bridge-node",
      commands,
      sink: {
        composeAndSend: async (_target: unknown, fields: Fields) => {
          this.calls.push({ fields });
          return { status: "delivered" };
        },
      },
    };
    const d = new HeadlessDispatcher(deps as ConstructorParameters<typeof HeadlessDispatcher>[0]);
    this.dispatchers.push(d);
    return d;
  }
  spawns(): number {
    return readdirSync(this.out).filter((n) => n.startsWith(`stdin-${this.card.agent}-`)).length;
  }
  async close(): Promise<void> {
    for (const d of this.dispatchers) await d.close();
    rmSync(this.root, { recursive: true, force: true });
  }
}

async function quiet(fn: () => Promise<void>): Promise<void> {
  const spy = spyOn(process.stderr, "write").mockImplementation(
    (() => true) as typeof process.stderr.write,
  );
  try {
    await fn();
  } finally {
    spy.mockRestore();
  }
}

afterEach(async () => {
  while (harnesses.length > 0) await harnesses.pop()!.close();
});

describe("P3b headless: user skill loom-dispatched + description task", () => {
  for (const agent of ["codex", "grok"] as const) {
    test(`${agent} → no spawn, spawn_setup_failed`, async () => {
      const h = new Harness(agent);
      h.userSkill("loom-dispatched", "task");
      h.selectSkills(["loom-dispatched"]);
      await quiet(() => h.dispatcher().dispatch(h.card));
      expect(h.spawns()).toBe(0);
      expect(h.calls).toHaveLength(1);
      expect(h.calls[0]!.fields.reason).toBe("spawn_setup_failed");
    }, 20_000);
  }

  test("claude → spawns normally (the skill is not listed for claude)", async () => {
    const h = new Harness("claude");
    h.userSkill("loom-dispatched", "task");
    h.selectSkills(["loom-dispatched"]);
    await quiet(() => h.dispatcher().dispatch(h.card));
    expect(h.spawns()).toBe(1);
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]!.fields.output).toBe("done");
  }, 20_000);
});
