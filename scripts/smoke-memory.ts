/**
 * PLAN 0.35.0 Done-when (i) — `loom memory|rules|skills` + doctor Memory smoke against the dist CLI.
 *
 * R53-M2 rules (the reason this file looks the way it does):
 *   - THIS process reads the real environment only. It writes nothing under the real home.
 *   - One temp home T = mkdtemp(os.tmpdir()/loom-smoke-memory-XXXXXX).
 *   - EVERY child (`bun dist/loom.js …`) gets HOME=T and LOOM_TEST_HOME=T, and no LOOM_* / FABLE_*
 *     (relay token/url, profile, session) or XDG_* variables from the parent.
 *   - Guard, checked on the exact env object before EVERY spawn: HOME and LOOM_TEST_HOME must be the
 *     same string and lie under os.tmpdir() (and not be the real home) — otherwise exit 1.
 *   - Real home before/after: ~/.loom and ~/.fable strict (names + mtime, recursive to depth 6);
 *     ~/.claude ~/.codex ~/.grok top-level new names only (concurrent sessions touch their mtimes —
 *     0.35 never launches an agent).
 *
 * Steps (P5 row + shuffle + lock): add(project) → add --room r1 → propose → approve → retire →
 * add --supersedes → list --json (states) → compact (moved > 0 · watermark) → list re-check →
 * shuffle entries.jsonl lines (list --json identical) → lock-held add (exit 1 store busy) →
 * rules list (bundled report-blockers) → user rule override → rules list (overrides 1) →
 * skills list (builtin) → user loom-card-report → skills list (user shadows builtin) →
 * doctor (Memory section · 0 fail in it · exit code unchanged vs. the empty-home baseline).
 * The temp home is removed at exit (also on failure and SIGINT/SIGTERM).
 *
 * Usage (repo root, real shell):  bun run smoke:memory [--source]
 *   (--source runs packages/cli/src/index.ts instead of dist/loom.js)
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join, resolve, sep } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SOURCE = process.argv.includes("--source");
const DIST = SOURCE
  ? join(ROOT, "packages", "cli", "src", "index.ts")
  : join(ROOT, "dist", "loom.js");
const BUN = process.execPath;

// ---------------------------------------------------------------------------------------------
// real-home snapshots (read-only)
// ---------------------------------------------------------------------------------------------

const REAL_HOME = userInfo().homedir;
const STRICT_DIRS = [".loom", ".fable"];
const NAMES_ONLY_DIRS = [".claude", ".codex", ".grok"];
const STRICT_DEPTH = 6;
const STRICT_MAX_ENTRIES = 50_000;

function strictListing(root: string): Map<string, number> {
  const out = new Map<string, number>();
  const walk = (dir: string, depth: number) => {
    if (out.size >= STRICT_MAX_ENTRIES) return;
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const n of names.sort()) {
      const p = join(dir, n);
      try {
        const st = lstatSync(p);
        out.set(p, st.mtimeMs);
        if (st.isDirectory() && depth < STRICT_DEPTH) walk(p, depth + 1);
      } catch {
        out.set(p, -1);
      }
    }
  };
  try {
    out.set(root, lstatSync(root).mtimeMs);
    walk(root, 1);
  } catch {
    // absent root: empty listing
  }
  return out;
}

function topNames(root: string): Set<string> {
  try {
    return new Set(readdirSync(root));
  } catch {
    return new Set();
  }
}

const before = {
  strict: STRICT_DIRS.map((d) => strictListing(join(REAL_HOME, d))),
  names: NAMES_ONLY_DIRS.map((d) => topNames(join(REAL_HOME, d))),
};

// ---------------------------------------------------------------------------------------------
// temp home + child env + guard
// ---------------------------------------------------------------------------------------------

const TMP_ROOT = resolve(tmpdir());
const T = mkdtempSync(join(TMP_ROOT, "loom-smoke-memory-"));
let cleaned = false;
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  rmSync(T, { recursive: true, force: true });
}
process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});
process.on("SIGTERM", () => {
  cleanup();
  process.exit(143);
});

function childEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined) continue;
    if (k.startsWith("LOOM_") || k.startsWith("FABLE_") || k.startsWith("XDG_")) continue;
    env[k] = v;
  }
  env.HOME = T;
  env.LOOM_TEST_HOME = T;
  return env;
}

function guard(env: Record<string, string>) {
  const h = env.HOME;
  const t = env.LOOM_TEST_HOME;
  const under = (p: string) => resolve(p).startsWith(TMP_ROOT + sep);
  if (!h || !t || h !== t || !under(h) || resolve(h) === resolve(REAL_HOME)) {
    console.error(
      `FAIL guard — child HOME=${h} LOOM_TEST_HOME=${t} must be equal and under ${TMP_ROOT}; aborting`,
    );
    cleanup();
    process.exit(1);
  }
  for (const k of ["LOOM_RELAY_TOKEN", "LOOM_RELAY_URL", "LOOM_PROFILE", "LOOM_SESSION"]) {
    if (k in env) {
      console.error(`FAIL guard — child env still carries ${k}; aborting`);
      cleanup();
      process.exit(1);
    }
  }
}

type Run = { code: number; out: string; err: string };
function loom(args: string[]): Run {
  const env = childEnv();
  guard(env);
  const r = Bun.spawnSync([BUN, DIST, ...args], {
    cwd: T,
    env,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 60_000,
  });
  return {
    code: r.exitCode ?? -1,
    out: r.stdout.toString(),
    err: r.stderr.toString(),
  };
}

// ---------------------------------------------------------------------------------------------
// steps
// ---------------------------------------------------------------------------------------------

const results: { name: string; ok: boolean; detail: string }[] = [];
function step(name: string, fn: () => string) {
  let ok = false;
  let detail: string;
  try {
    detail = fn();
    ok = true;
  } catch (e) {
    detail = e instanceof Error ? e.message : String(e);
  }
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name} — ${detail}`);
}
function check(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
function show(r: Run): string {
  return `exit ${r.code} · stdout ${JSON.stringify(r.out.trim().slice(0, 300))} · stderr ${JSON.stringify(r.err.trim().slice(0, 300))}`;
}

const realT = realpathSync(T);
const underT = (p: string) => p.startsWith(T + sep) || p.startsWith(realT + sep);
const shortT = (s: string) => s.split(realT).join("<T>").split(T).join("<T>");
const ID = /mem_[0-9a-f]{16}/;
const roomKey = (roomId: string) => createHash("sha256").update(roomId).digest("hex").slice(0, 16);
const R1 = roomKey("r1");

type ListJson = {
  profile: string;
  profileSource: string;
  agents: {
    agentKey: string;
    entriesPath: string;
    state: string;
    counts: Record<string, number>;
    entries: {
      id: string;
      status: string;
      appliesTo: string;
      hidden: boolean;
      supersedes: string | null;
    }[];
  }[];
};
const listJson = (extra: string[] = []): { r: Run; j: ListJson } => {
  const r = loom(["memory", "list", "--agent", "claude", "--json", ...extra]);
  check(r.code === 0, `list --json ${show(r)}`);
  return { r, j: JSON.parse(r.out) as ListJson };
};

if (!existsSync(DIST)) {
  console.error(`FAIL dist missing — ${DIST} (run bun run build:cli)`);
  cleanup();
  process.exit(1);
}

let doctorBaseline = -1;
let A1 = "";
let A2 = "";
let P = "";
let A4 = "";
let entriesPath = "";

try {
  // Baseline doctor in the empty temp home: Memory section = "no memory yet" info.
  const d0 = loom(["doctor"]);
  doctorBaseline = d0.code;

  step("① memory add (project)", () => {
    const r = loom(["memory", "add", "--agent", "claude", "--type", "fact", "smoke project fact"]);
    const m = /^added (mem_[0-9a-f]{16}) \(active, seq 1\) to (\S+)$/.exec(r.out.trim());
    check(r.code === 0 && m, show(r));
    A1 = m[1]!;
    entriesPath = m[2]!;
    check(underT(entriesPath), `entries path not under T: ${entriesPath}`);
    check(
      entriesPath.endsWith(join("memory", "claude.default", "entries.jsonl")),
      `agentKey path ${entriesPath}`,
    );
    return `${A1} seq 1 · ${shortT(entriesPath)}`;
  });

  step("② memory add --room r1", () => {
    const r = loom(["memory", "add", "--agent", "claude", "--room", "r1", "--", "smoke room fact"]);
    const m = /^added (mem_[0-9a-f]{16}) \(active, seq 2\)/.exec(r.out.trim());
    check(r.code === 0 && m, show(r));
    A2 = m[1]!;
    return `${A2} seq 2 (room:${R1})`;
  });

  step("③ memory propose", () => {
    const r = loom([
      "memory",
      "propose",
      "--agent",
      "claude",
      "--type",
      "decision",
      "smoke proposal",
    ]);
    const m =
      /^proposed (mem_[0-9a-f]{16}) \(seq 3\) — approve with: loom memory approve --agent claude \1$/.exec(
        r.out.trim(),
      );
    check(r.code === 0 && m, show(r));
    P = m[1]!;
    return `${P} seq 3`;
  });

  step("④ memory approve", () => {
    const r = loom(["memory", "approve", "--agent", "claude", P]);
    check(r.code === 0 && r.out.trim() === `approved ${P} (seq 4)`, show(r));
    return r.out.trim();
  });

  step("⑤ memory retire", () => {
    const r = loom(["memory", "retire", "--agent", "claude", A1]);
    check(r.code === 0 && r.out.trim() === `retired ${A1} (seq 5)`, show(r));
    return r.out.trim();
  });

  step("⑥ memory add --supersedes", () => {
    const r = loom([
      "memory",
      "add",
      "--agent",
      "claude",
      "--room",
      "r1",
      "--supersedes",
      A2,
      "--",
      "smoke room fact v2",
    ]);
    const m = /^added (mem_[0-9a-f]{16}) \(active, seq 6\)/.exec(r.out.trim());
    check(r.code === 0 && m, show(r));
    A4 = m[1]!;
    return `${A4} seq 6 supersedes ${A2}`;
  });

  step("⑦ memory list --json (states)", () => {
    const { j } = listJson();
    check(
      j.agents.length === 1 && j.agents[0]!.agentKey === "claude.default",
      `agents ${JSON.stringify(j.agents.map((a) => a.agentKey))}`,
    );
    const vis = j.agents[0]!.entries.map((e) => `${e.id}:${e.status}`).join(",");
    check(vis === `${P}:active,${A4}:active`, `visible ${vis}`);
    const { j: all } = listJson(["--all"]);
    const a = all.agents[0]!;
    const st = Object.fromEntries(
      a.entries.map((e) => [e.id, `${e.status}${e.hidden ? "/hidden" : ""}`]),
    );
    check(
      st[A1] === "retired" &&
        st[A2] === "active/hidden" &&
        st[P] === "active" &&
        st[A4] === "active",
      `--all ${JSON.stringify(st)}`,
    );
    check(a.entries.find((e) => e.id === A2)?.appliesTo === `room:${R1}`, "A2 appliesTo");
    const c = a.counts;
    check(
      c.active === 2 &&
        c.proposed === 0 &&
        c.retired === 1 &&
        c.unparseable === 0 &&
        c.conflicts === 0 &&
        c.dangling === 0,
      `counts ${JSON.stringify(c)}`,
    );
    return `visible [P, A4] · --all A1 retired · A2 hidden (room:${R1}) · counts active 2 retired 1 · profile ${j.profile} (from ${j.profileSource})`;
  });

  step("⑧ memory compact", () => {
    const r = loom(["memory", "compact", "--agent", "claude"]);
    const m =
      /^compacted: moved (\d+) lines \((\d+) unparseable, (\d+) conflict losers\) to (\S+); kept (\d+); watermark seq (\d+)$/.exec(
        r.out.trim(),
      );
    check(r.code === 0 && m, show(r));
    const moved = Number(m[1]);
    check(
      moved === 3 && m[5] === "3" && m[6] === "5",
      `moved ${moved} kept ${m[5]} watermark ${m[6]}`,
    );
    const lines = readFileSync(entriesPath, "utf8").split("\n").filter(Boolean);
    check(lines.at(-1) === '{"v":1,"kind":"compact","seq":5}', `last line ${lines.at(-1)}`);
    const archive = readFileSync(m[4]!, "utf8").split("\n").filter(Boolean);
    check(archive.length === 3, `archive lines ${archive.length}`);
    return `moved ${moved} (A1 + its retire · hidden A2) · kept 3 · watermark seq 5 · archive 3 lines`;
  });

  let afterCompact = "";
  step("⑨ memory list re-check", () => {
    const { r, j } = listJson();
    afterCompact = r.out;
    const a = j.agents[0]!;
    const vis = a.entries.map((e) => e.id).join(",");
    check(vis === `${P},${A4}`, `visible ${vis}`);
    const c = a.counts;
    check(
      c.active === 2 && c.retired === 0 && c.dangling === 0 && c.archivedRefs === 1,
      `counts ${JSON.stringify(c)}`,
    );
    const { j: all } = listJson(["--all"]);
    check(all.agents[0]!.entries.length === 2, `--all ${all.agents[0]!.entries.length}`);
    const add = loom(["memory", "add", "--agent", "claude", "post-compact fact"]);
    check(
      add.code === 0 && / \(active, seq 7\) to /.test(add.out),
      `seq after watermark ${show(add)}`,
    );
    const ret = loom(["memory", "retire", "--agent", "claude", (ID.exec(add.out) ?? [""])[0]]);
    check(ret.code === 0, `retire post-compact ${show(ret)}`);
    afterCompact = listJson().r.out;
    return "visible [P, A4] unchanged · archivedRefs 1 (info) · dangling 0 · next seq 7 after watermark";
  });

  step("⑩ shuffle entries.jsonl → list --json identical", () => {
    check(underT(entriesPath), `entries path not under T: ${entriesPath}`);
    const orig = readFileSync(entriesPath, "utf8");
    const lines = orig.split("\n").filter(Boolean);
    check(lines.length >= 5, `lines ${lines.length}`);
    let seed = 0x35;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    const perms: string[][] = [[...lines].reverse()];
    for (let k = 0; k < 9; k++) {
      const p = [...lines];
      for (let i = p.length - 1; i > 0; i--) {
        const jx = Math.floor(rnd() * (i + 1));
        [p[i], p[jx]] = [p[jx]!, p[i]!];
      }
      perms.push(p);
    }
    try {
      for (const [i, p] of perms.entries()) {
        writeFileSync(entriesPath, `${p.join("\n")}\n`, { mode: 0o600 });
        const out = listJson().r.out;
        check(out === afterCompact, `permutation ${i} differs`);
      }
    } finally {
      writeFileSync(entriesPath, orig, { mode: 0o600 });
    }
    return `${perms.length} permutations of ${lines.length} lines · list --json byte-identical`;
  });

  step("⑪ lock held → add exit 1 store busy", () => {
    check(underT(entriesPath), `entries path not under T: ${entriesPath}`);
    const lock = `${entriesPath}.lock`;
    const bytes = readFileSync(entriesPath);
    mkdirSync(lock, { mode: 0o700 });
    writeFileSync(join(lock, "owner.pid"), `${process.pid}\n`);
    let r: Run;
    const t0 = Date.now();
    try {
      r = loom(["memory", "add", "--agent", "claude", "must not land"]);
    } finally {
      rmSync(lock, { recursive: true, force: true });
    }
    const ms = Date.now() - t0;
    check(r.code === 1, show(r));
    check(
      r.err.includes("loom memory: store busy (") && r.err.includes("— try again; nothing written"),
      show(r),
    );
    check(Buffer.compare(bytes, readFileSync(entriesPath)) === 0, "entries.jsonl bytes changed");
    return `exit 1 · ${JSON.stringify(shortT(r.err.trim()))} · bytes unchanged · ${(ms / 1000).toFixed(1)} s`;
  });

  step("⑫ rules list (bundled)", () => {
    const r = loom(["rules", "list"]);
    check(r.code === 0, show(r));
    const lines = r.out.trim().split("\n");
    check(
      lines[0] === "rules: bundled 1 · user 0 · overrides 0 · disabled 0 · invalid 0",
      `head ${lines[0]}`,
    );
    check(
      /^report-blockers {2}bundled {2}scope=all {2}priority=500 {2}\d+\/8192 B {2}bundled:report-blockers\.md$/.test(
        lines[1] ?? "",
      ),
      `row ${lines[1]}`,
    );
    return `${lines[0]} · ${lines[1]}`;
  });

  step("⑬ user rule override → rules list (overrides 1)", () => {
    mkdirSync(join(T, ".loom", "rules"), { recursive: true, mode: 0o700 });
    const p = join(T, ".loom", "rules", "report-blockers.md");
    writeFileSync(
      p,
      "---\nid: report-blockers\nscope: claude\npriority: 900\n---\nSmoke override.\n",
      { mode: 0o600 },
    );
    const r = loom(["rules", "list"]);
    check(r.code === 0, show(r));
    const lines = r.out.trim().split("\n");
    check(
      lines[0] === "rules: bundled 1 · user 1 · overrides 1 · disabled 0 · invalid 0",
      `head ${lines[0]}`,
    );
    check(
      (lines[1] ?? "").startsWith(
        "report-blockers  user (overrides bundled)  scope=claude  priority=900  ",
      ),
      `row ${lines[1]}`,
    );
    return `${lines[0]} · ${shortT(lines[1] ?? "")}`;
  });

  step("⑭ skills list (builtin)", () => {
    const r = loom(["skills", "list"]);
    check(r.code === 0, show(r));
    const row = r.out.split("\n").find((l) => l.startsWith("loom-card-report  "));
    check(
      row?.startsWith("loom-card-report  builtin  ") && !row.includes("user shadows builtin"),
      `row ${row} · ${show(r)}`,
    );
    return `${r.out.split("\n")[0]} · ${row.slice(0, 60)}…`;
  });

  step("⑮ user loom-card-report → skills list (user shadows builtin)", () => {
    const d = join(T, ".loom", "skills", "loom-card-report");
    mkdirSync(d, { recursive: true, mode: 0o700 });
    writeFileSync(
      join(d, "SKILL.md"),
      "---\nname: loom-card-report\ndescription: Smoke stand-in that shadows the builtin.\n---\n\n# Smoke\n",
      { mode: 0o600 },
    );
    const r = loom(["skills", "list"]);
    check(r.code === 0, show(r));
    const row = r.out.split("\n").find((l) => l.startsWith("loom-card-report  "));
    check(
      row?.startsWith("loom-card-report  user  ") && row.includes("  user shadows builtin"),
      `row ${row} · ${show(r)}`,
    );
    return row;
  });

  step("⑯ doctor (Memory section · exit code unchanged)", () => {
    const r = loom(["doctor"]);
    const lines = r.out.split("\n");
    const i = lines.indexOf("Memory");
    check(i >= 0, `no Memory section · ${show(r)}`);
    const sec: string[] = [];
    for (let k = i + 1; k < lines.length && lines[k] !== ""; k++) sec.push(lines[k]!);
    check(sec.length > 0, "empty Memory section");
    check(!sec.some((l) => /^ {2}fail /.test(l)), `fail in Memory: ${sec.join(" | ")}`);
    check(
      sec.some((l) => /^ {2}ok {3}memory\/ 0700/.test(l) || l.includes("claude.default")),
      `rows ${sec.join(" | ")}`,
    );
    const anyFail = lines.some((l) => /^ {2}fail /.test(l));
    check(r.code === doctorBaseline, `doctor exit ${r.code} ≠ baseline ${doctorBaseline}`);
    check(r.code === (anyFail ? 1 : 0), `doctor exit ${r.code} vs fail lines ${anyFail}`);
    return `${sec.length} rows · 0 fail · exit ${r.code} (baseline ${doctorBaseline}) · ${shortT(sec.map((l) => l.trim()).join(" | "))}`;
  });
} finally {
  cleanup();
}

// ---------------------------------------------------------------------------------------------
// zero persistence + real home
// ---------------------------------------------------------------------------------------------

step("zero persistence — temp home removed", () => {
  check(!existsSync(T), `${T} still exists`);
  return "removed";
});

step("real home untouched", () => {
  const diffs: string[] = [];
  STRICT_DIRS.forEach((d, i) => {
    const a = before.strict[i]!;
    const b = strictListing(join(REAL_HOME, d));
    for (const [p, m] of a) {
      if (!b.has(p)) diffs.push(`gone ${p}`);
      else if (b.get(p) !== m) diffs.push(`mtime ${p}`);
    }
    for (const p of b.keys()) if (!a.has(p)) diffs.push(`new ${p}`);
  });
  NAMES_ONLY_DIRS.forEach((d, i) => {
    const a = before.names[i]!;
    for (const n of topNames(join(REAL_HOME, d))) if (!a.has(n)) diffs.push(`new ~/${d}/${n}`);
  });
  check(diffs.length === 0, diffs.slice(0, 10).join(" · "));
  const n = before.strict.reduce((s, m) => s + m.size, 0);
  return `~/.loom · ~/.fable ${n} entries names+mtime identical · ~/.claude · ~/.codex · ~/.grok no new names`;
});

const failed = results.filter((r) => !r.ok);
console.log(
  `${failed.length === 0 ? "PASS" : "FAIL"} smoke:memory (${SOURCE ? "source" : "dist"}) — ${results.length - failed.length}/${results.length} steps`,
);
process.exit(failed.length === 0 ? 0 : 1);
