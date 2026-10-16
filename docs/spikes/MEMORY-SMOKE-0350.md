# Loom v0.35.0 P5 smoke: `loom memory` · `rules` · `skills` · doctor Memory against the CLI

Date 2026-10-16. Repo main `c6b6ea5` (P4 verify green) plus the smoke script (`9e92375`); final run against the 0.35.0 dist rebuilt in the P5 docs commit (this file updated there). Authority: PLAN §0.35.0 P5 row + Done-when (i) (R53-M2), `UNKNOWNS.md` 0.35.0. Reproducible harness: `bun run smoke:memory` (= `scripts/smoke-memory.ts`; `--source` runs `packages/cli/src/index.ts` instead of `dist/loom.js`). Wall time ~6 s (4 s of it is the lock-wait step).

| Item | Value |
|---|---|
| OS | macOS (Darwin 25.6.0, arm64) |
| bun | 1.3.11 |
| CLI (final) | rebuilt 0.35.0 `dist/loom.js` (`bun run build:cli` twice → same sha256 `62069262ced8ea232d2bb4bd88975d40614ec91e75de08f9a1eef1c15b0710f3`) — **18/18 PASS** |
| CLI (red analogue, `9e92375`) | `--source` at `c6b6ea5` — **18/18 PASS**; the then-committed `dist/loom.js` (0.34.0 build) — **2/18, red** (see below) |
| Live gate | none — the smoke touches no OS service and starts no agent |

## Setup (R53-M2)

- **The smoke process reads the real environment only.** It writes nothing under the real home.
- **One temp home T** = `mkdtemp($TMPDIR/loom-smoke-memory-XXXXXX)`. Removed at exit, on failure, and on SIGINT/SIGTERM; the smoke prints `PASS zero persistence` only after checking T is gone.
- **Every child** (`bun dist/loom.js …`, or the source entry with `--source`) runs with `HOME=T` and `LOOM_TEST_HOME=T`, cwd T, and with every `LOOM_*` · `FABLE_*` · `XDG_*` variable of the parent removed (covers `LOOM_RELAY_TOKEN` · `LOOM_RELAY_URL` · `LOOM_PROFILE` · `LOOM_SESSION`). There is one spawn site; it builds the env and runs the guard on that exact object first.
- **Guard (before every spawn):** `HOME` and `LOOM_TEST_HOME` must be the same string, lie under `os.tmpdir()`, and differ from the real home, and none of the four named variables may be present. Otherwise the smoke removes T and exits 1.
- **Real home before/after** (`os.userInfo().homedir`): `~/.loom` and `~/.fable` **strict** — every path to depth 6 with its `lstat` mtime (1574 entries on this machine; `~/.fable` does not exist); `~/.claude` · `~/.codex` · `~/.grok` — **new top-level names only** (concurrent Claude sessions touch their mtimes). Outside the script, `ls -la ~/.loom` was saved before the first run and after every run; all identical.
- Profile in T: no session, no `LOOM_PROFILE` → `default` (`profile default (from default)`), agentKey `claude.default`.

## Results — 0.35.0 dist (final, 18/18)

```
PASS ① memory add (project) — mem_44f110b30eae1f60 seq 1 · <T>/.loom/memory/claude.default/entries.jsonl
PASS ② memory add --room r1 — mem_de6ab6e96b838db4 seq 2 (room:82f3e9c695dc6b8d)
PASS ③ memory propose — mem_4d2ea3e8d26cb0a3 seq 3
PASS ④ memory approve — approved mem_4d2ea3e8d26cb0a3 (seq 4)
PASS ⑤ memory retire — retired mem_44f110b30eae1f60 (seq 5)
PASS ⑥ memory add --supersedes — mem_b8ec33e69dc68660 seq 6 supersedes mem_de6ab6e96b838db4
PASS ⑦ memory list --json (states) — visible [P, A4] · --all A1 retired · A2 hidden (room:82f3e9c695dc6b8d) · counts active 2 retired 1 · profile default (from default)
PASS ⑧ memory compact — moved 3 (A1 + its retire · hidden A2) · kept 3 · watermark seq 5 · archive 3 lines
PASS ⑨ memory list re-check — visible [P, A4] unchanged · archivedRefs 1 (info) · dangling 0 · next seq 7 after watermark
PASS ⑩ shuffle entries.jsonl → list --json identical — 10 permutations of 6 lines · list --json byte-identical
PASS ⑪ lock held → add exit 1 store busy — exit 1 · "loom memory: store busy (<T>/.loom/memory/claude.default/entries.jsonl.lock) — try again; nothing written" · bytes unchanged · 4.1 s
PASS ⑫ rules list (bundled) — rules: bundled 1 · user 0 · overrides 0 · disabled 0 · invalid 0 · report-blockers  bundled  scope=all  priority=500  223/8192 B  bundled:report-blockers.md
PASS ⑬ user rule override → rules list (overrides 1) — rules: bundled 1 · user 1 · overrides 1 · disabled 0 · invalid 0 · report-blockers  user (overrides bundled)  scope=claude  priority=900  72/8192 B  <T>/.loom/rules/report-blockers.md
PASS ⑭ skills list (builtin) — skills: worker.skills.enabled = no bridge config (profile default) · loom-card-report  builtin  available  Format the final repor…
PASS ⑮ user loom-card-report → skills list (user shadows builtin) — loom-card-report  user  available  user shadows builtin  Smoke stand-in that shadows the builtin.
PASS ⑯ doctor (Memory section · exit code unchanged) — 7 rows · 0 fail · exit 0 (baseline 0) · ok   memory/ 0700 · 1 agent stores (<T>/.loom/memory) | ok   claude.default: active 2/200 · proposed 0 · retired 1 · 2 KiB/1024 KiB | info claude.default: 1 supersedes point into the archive | info persona.md: 0 of 1 agent stores | info knowledge/INDEX.md: absent (<T>/.loom/knowledge/INDEX.md) | info guideline.md: 0 rooms | ok   rules: bundled 1 · user 1 · overrides 1
PASS zero persistence — temp home removed — removed
PASS real home untouched — ~/.loom · ~/.fable 1574 entries names+mtime identical · ~/.claude · ~/.codex · ~/.grok no new names
PASS smoke:memory (dist) — 18/18 steps
```

`ls -la ~/.loom` before the first run and after this one: every entry line identical (only the parent `..` = home directory mtime moved, from unrelated activity in `~`).

## Results — `--source` (18/18, at `9e92375`)

```
PASS ① memory add (project) — mem_3dd601f484bccbfd seq 1 · <T>/.loom/memory/claude.default/entries.jsonl
PASS ② memory add --room r1 — mem_28503b3f2e53eaad seq 2 (room:82f3e9c695dc6b8d)
PASS ③ memory propose — mem_ddbad1a7081cb99b seq 3
PASS ④ memory approve — approved mem_ddbad1a7081cb99b (seq 4)
PASS ⑤ memory retire — retired mem_3dd601f484bccbfd (seq 5)
PASS ⑥ memory add --supersedes — mem_9c15ef4866ce1fa0 seq 6 supersedes mem_28503b3f2e53eaad
PASS ⑦ memory list --json (states) — visible [P, A4] · --all A1 retired · A2 hidden (room:82f3e9c695dc6b8d) · counts active 2 retired 1 · profile default (from default)
PASS ⑧ memory compact — moved 3 (A1 + its retire · hidden A2) · kept 3 · watermark seq 5 · archive 3 lines
PASS ⑨ memory list re-check — visible [P, A4] unchanged · archivedRefs 1 (info) · dangling 0 · next seq 7 after watermark
PASS ⑩ shuffle entries.jsonl → list --json identical — 10 permutations of 6 lines · list --json byte-identical
PASS ⑪ lock held → add exit 1 store busy — exit 1 · "loom memory: store busy (<T>/.loom/memory/claude.default/entries.jsonl.lock) — try again; nothing written" · bytes unchanged · 4.1 s
PASS ⑫ rules list (bundled) — rules: bundled 1 · user 0 · overrides 0 · disabled 0 · invalid 0 · report-blockers  bundled  scope=all  priority=500  223/8192 B  bundled:report-blockers.md
PASS ⑬ user rule override → rules list (overrides 1) — rules: bundled 1 · user 1 · overrides 1 · disabled 0 · invalid 0 · report-blockers  user (overrides bundled)  scope=claude  priority=900  72/8192 B  <T>/.loom/rules/report-blockers.md
PASS ⑭ skills list (builtin) — skills: worker.skills.enabled = no bridge config (profile default) · loom-card-report  builtin  available  Format the final repor…
PASS ⑮ user loom-card-report → skills list (user shadows builtin) — loom-card-report  user  available  user shadows builtin  Smoke stand-in that shadows the builtin.
PASS ⑯ doctor (Memory section · exit code unchanged) — 7 rows · 0 fail · exit 0 (baseline 0) · ok   memory/ 0700 · 1 agent stores (<T>/.loom/memory) | ok   claude.default: active 2/200 · proposed 0 · retired 1 · 2 KiB/1024 KiB | info claude.default: 1 supersedes point into the archive | info persona.md: 0 of 1 agent stores | info knowledge/INDEX.md: absent (<T>/.loom/knowledge/INDEX.md) | info guideline.md: 0 rooms | ok   rules: bundled 1 · user 1 · overrides 1
PASS zero persistence — temp home removed — removed
PASS real home untouched — ~/.loom · ~/.fable 1574 entries names+mtime identical · ~/.claude · ~/.codex · ~/.grok no new names
PASS smoke:memory (source) — 18/18 steps
```

## Results — committed `dist/loom.js` (red analogue, 2/18)

The committed dist is still the 0.34.0 build (`bb70787`). Every memory/rules/skills step fails with `Unknown command: memory …` / `rules list` / `skills list` (exit 1, usage on stdout), steps ⑩ and ⑪ fail because no store path was produced, and ⑯ fails with `no Memory section` (doctor exit 0, `info version: 0.34.0`). Zero persistence and real-home checks PASS. `FAIL smoke:memory (dist) — 2/18 steps`, exit 1. This was the expected red; the P5 docs commit rebuilt dist at 0.35.0 and the final run above is green.

## What each step proves

- ①–⑥ the write verbs and their exact stdout (② strings), seq 1…6 under one store lock each.
- ⑦ the fold seen through the CLI: proposed→active by approve, retire, and R53-M1 hiding (A2 is active but hidden by the active A4).
- ⑧ compact moves the retired entry with its transition and the hidden entry (3 lines), keeps 3, writes one watermark `{"v":1,"kind":"compact","seq":5}` as the last line, archive first.
- ⑨ the visible set is the same after compact; A4's target is now in the archive → `archivedRefs 1` (info, not dangling); the next write gets seq 7 (watermark counted in max seq). That extra entry is retired again so ⑩ runs on a store with a retire transition left in place.
- ⑩ Done-when (b) through the dist CLI: 10 line orders (reverse + 9 seeded shuffles, watermark included) give byte-identical `list --json`; the file is restored afterwards.
- ⑪ class 1: a held lock (dir + live `owner.pid`) → exit 1 `store busy` after the 4 s wait, file bytes unchanged.
- ⑫–⑬ the bundled rule is in the single-file bundle (text import) and a user file with the same id replaces it.
- ⑭–⑮ skills list shows the builtin, then the user entry with `user shadows builtin`.
- ⑯ doctor Memory section rows (③ table), no `fail` among them, and the doctor exit code equals both the empty-home baseline and "any `fail` line anywhere".

## Not covered

- Windows (UK-6). Linux not run.
- Profiles other than `default` (the P4 unit tests cover `--profile` / `LOOM_PROFILE` / displayName fallback).
- The redaction refusal and the caps (1 MiB · 200 active · 200 proposed) — covered by P2/P4 tests, not by this smoke.
