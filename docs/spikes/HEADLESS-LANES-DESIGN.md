# Headless lanes — `scripts/lane.ts` owns every model pin

| Field | Value |
|---|---|
| **Status** | **draft — design only (owner request 2026-10-17)** · no code in this wave |
| **Date** | 2026-10-17 |
| **Scope** | Loom repository dev-process tooling — Claude **impl** + **advise** lanes move from in-harness `Agent` spawns to headless `claude -p` processes behind one wrapper `scripts/lane.ts`; **verify** stays `codex exec` (GPT-6 Astra high) behind the same wrapper |
| **Authority** | `CLAUDE.md` Orchestration standing rule 8 (model pins) · `docs/DOGFOOD_LOOP.md` §1.2 (full-topology impl lane) · rule 7 (architect independent verification) |
| **Advisor** | Opus 5.5 high (`loom-advisor` stand-in) — verdict **go-with-changes**; architect adopted all changes. Decisions below are the merged final form |
| **Freeze note** | Dev-process tooling, **outside** the Phase-3 soft-close freeze (`docs/spikes/RULE-ROUTER-PHASE3-SOFT-CLOSE.md` covers rule-router JIT surfaces). Must land in **commits separate from v0.37.0 P-steps** — never interleaved |
| **Preserves** | product `packages/*` · rule-router JIT 3.0–3.2 · topology `single`/`full` semantics (DOGFOOD §0.5) · `check-agent-model.ts` behaviour |

> Rule 8 pins models in **text** (CLAUDE.md = guidance). This design moves the pins into a
> **process boundary** (argv + env of a child process) and makes the evidence of the pin
> (`modelUsage`) a precondition of rule-7 acceptance. Hooks are speed bumps, not the fence.

---

## 1. Problem and evidence

### 1.1 Measured (this repo, 2026-10-17)

| # | Fact | Consequence |
|---|---|---|
| M1 | `PreToolUse(Agent)` hook (`check-agent-model.ts`) **does not fire** for Workflow `agent()` calls (probe 2026-10-17) | rule 3 Workflow waves bypass the rule-8 model guard entirely |
| M2 | `fork` subagents **ignore `model`** and run on the session model | already noted in rule 8 as a gap; unsafe whenever the session is not Opus 5.5 |
| M3 | Per-call `effort` is **not hook-visible** as an enforced value | "medium" for impl / "high" for advise cannot be checked by a hook |
| M4 | Headless probe: `CLAUDE_CODE_EFFORT_LEVEL=medium CLAUDE_CODE_SUBAGENT_MODEL=claude-opus-5-5 CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1 claude -p --model claude-opus-5-5 --output-format json` → `modelUsage` = `[claude-opus-5-5]` only · **$0.44 · 5.2 s** for a one-word reply | pin is observable after the fact; cost is dominated by SessionStart inject + CLAUDE.md (→ D4) |

### 1.2 Official documentation (Claude Code)

| Fact | Source |
|---|---|
| `CLAUDE.md` / memory is **guidance** loaded as context; hooks and settings are the **enforcement** layer | <https://code.claude.com/docs/en/memory> · <https://code.claude.com/docs/en/hooks> |
| Subagent model resolution order (since v2.1.251): per-invocation `model` → agent frontmatter `model` (`inherit` = session) → `CLAUDE_CODE_SUBAGENT_MODEL` (a default) → session model. `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` (v2.1.257+) overrides the first two. Installed: v2.1.302 | <https://code.claude.com/docs/en/sub-agents> · <https://code.claude.com/docs/en/model-config> |
| `CLAUDE_CODE_SUBAGENT_MODEL` + `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` reach `Agent` spawns, **workflow agents and teammates** — **not forks** | <https://code.claude.com/docs/en/model-config> · <https://code.claude.com/docs/en/workflows> |
| `CLAUDE_CODE_EFFORT_LEVEL` takes precedence over every other effort source | <https://code.claude.com/docs/en/model-config> |

### 1.3 Community (unverified by us)

- `anthropics/claude-code` issue **#79953** (opened 2026-07-21, open) — `PreToolUse` fires once for the outer `Workflow` call and never for inner `agent()` calls; a 2026-10-09 comment reports `SubagentStart` fires for workflow agents (no model field) and per-agent `meta.json` records `agentType`/`model`. **community · UNVERIFIED** (our M1 matches the first claim).
- `psford/claude-env` PR **#236** (merged 2026-10-09) — fail-closed `PreToolUse` on `Agent|Workflow` requiring a literal `model` on every Agent call and inline-script `agent()`, refusing forks and named/nested workflows, plus a session-log model/cost audit (`agent_usage.py`). **community · UNVERIFIED**. Closest prior art to the rejected "Workflow lint as primary" option (§10).

### 1.4 Deciding risk

A headless impl lane **silently loses permission prompts**: a denied `bun test` becomes a
"success" report without tests ever running. The design must make denials **loud** (exit 5)
and **evidence-gated** (§5.1). Every other choice is secondary to this.

---

## 2. Decisions (final, merged)

| ID | Decision | Rationale |
|---|---|---|
| **D1** | Claude **impl** + **advise** lanes run as headless `claude -p` processes. **verify** stays `codex exec` (already headless). In-harness `Agent` remains **only for read-only research/exploration** | process argv/env is the only place all of model + effort + tools are pinned together (M1–M3) |
| **D2** | One wrapper `scripts/lane.ts <impl\|advise\|verify>` owns every pin, stdin `/dev/null`, env scrubbing, run dir, `meta.json`, exit codes. Real restriction = `--disallowedTools` (`--allowedTools` only pre-approves). impl disallows `Agent,Task,Workflow`; advise disallows `Bash,Edit,Write,NotebookEdit,Agent,Task,Workflow` | single choke point; disallowing `Agent/Task/Workflow` inside lanes also closes the fork (M2) and effort (M3) gaps |
| **D3** | Bash `PreToolUse` gate = **speed bump**: per-segment scan for raw `claude -p\|--print` / `codex exec\|e`; deny unless `bun run scripts/lane.ts …`. With `LOOM_LANE` set, deny **any** `claude`/`codex`/`lane.ts` spawn (no nesting). Placed **before** `rule-router-jit.ts`. Residual bypasses documented (§5.5) | catches habit, not adversaries; HANDOFF invariant "Bash deny **before** JIT" |
| **D4** | Lanes set `LOOM_LANE=<lane>`; `session-context.ts` **and** `norms-receipt.ts` emit no inject when it is set. Wrapper appends a fixed **LANE PREAMBLE** (§4.6) + inlined `tasks/traps.md` active traps + HANDOFF "Must not" items | M4 cost is inject-dominated; a lane must not run the architect ritual or Template R |
| **D5** | impl allowlist uses the **exact env-prefixed forms** the hooks/invariants require; denylist covers git mutation, service registration, ssh/scp, real-CLI smokes (§6). Specs avoid compound commands | every segment of a compound command must be allowed; user/local settings allow `ssh` and load in `-p` |
| **D6** | Verification authority unchanged: `meta.json` is **evidence, not a verdict**. **Evidence gate**: no lane result is accepted under rule 7 unless `meta.json` shows resolved **main model == pin** AND **zero `permission_denials`**; architect still reads the diff and reruns tests | rule 7; closes the §1.4 deciding risk |
| **D7** | Default **one heavy lane at a time**. Lock covers every lane that runs `bun test` (impl; verify with `workspace-write`). `--parallel` allowed **only for read-only lanes** | owner fan-noise note · traps: concurrent suites starve → false positives |
| **D8** | v1 = repo script. Dispatching lanes through Loom bridge headless workers (`agentArgv` / `maxConcurrent`) as dogfood is a **later, separate owner decision** — not in this rollout | keep product surface out of process tooling |
| **D9** | Rollout P1 → P4 (§8). P4 live smoke includes a **tool-using impl run** asserting empty `permission_denials` and pinned main model | the deciding risk is only observable with real tool calls |

Resolved open questions (from the decision list):

| Q | Resolution |
|---|---|
| Q1 block in-harness write-capable `Agent` types by hook? | **No** — hook cannot tell impl from research; rule text + evidence gate (D6) |
| Q2 rule 3 Workflow for waves? | **Amend** — Workflow only for read-only fan-out; impl/verify/advise steps run via `lane.ts`, chained by the architect |
| Q3 `--agent loom-advisor` applies frontmatter? | **UNVERIFIED** — pass `--model` + tool restrictions explicitly, assert via `meta.json`; optional P4 check |
| Q4 herdr pane default (rule 5)? | Claude lanes go headless; herdr panes remain for **product dogfood** (fits traps "in-harness fallback first") |
| Q5 Phase-3 freeze? | **Outside** the freeze; separate commits from v0.37.0 P-steps |

---

## 3. Lane topology (after)

```text
architect session (Claude Code, interactive)
  ├─ Agent(Explore / general-purpose, read-only)      research only — check-agent-model.ts
  └─ Bash: bun run scripts/lane.ts <lane> --spec F    ← Bash gate allows only this form
        ├─ impl   → claude -p  (Opus 5.5 · medium · acceptEdits · LOOM_LANE=impl)
        ├─ advise → claude -p  (Opus 5.5 · high · read-only tools · LOOM_LANE=advise)
        └─ verify → codex exec (GPT-6 Astra · high · -s read-only|workspace-write)
              ↓
        .loom-lanes/<seq>-<lane>/meta.json  →  evidence gate (D6)  →  architect diff + rerun
```

---

## 4. `scripts/lane.ts` interface

### 4.1 Synopsis

```text
bun run scripts/lane.ts <impl|advise|verify> --spec <file>
    [--cwd <dir>]                          # default: repo root
    [--timeout <s>]                        # default: UNSPECIFIED — proposal 1800 (= watch-card 30 min)
    [--sandbox read-only|workspace-write]  # verify only; default read-only
    [--parallel]                           # read-only lanes only (advise; verify read-only)
```

Output: one summary line on stdout (`lane=… exit=… mainModel=… denials=… dir=…`); full
streams live in the run dir. The wrapper never prints a verdict.

### 4.2 Per-lane pins

| | **impl** | **advise** | **verify** |
|---|---|---|---|
| Binary | `claude -p` | `claude -p` | `codex exec` |
| Model | `--model claude-opus-5-5` | `--model claude-opus-5-5` | `-m gpt-6-astra` |
| Effort | env `CLAUDE_CODE_EFFORT_LEVEL=medium` | env `CLAUDE_CODE_EFFORT_LEVEL=high` | `-c model_reasoning_effort=high` |
| Subagent pin | env `CLAUDE_CODE_SUBAGENT_MODEL=claude-opus-5-5` + `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` | same pair | n/a |
| Permissions | `--permission-mode acceptEdits` · `--allowedTools` §6.1 · `--disallowedTools` §6.2 + `Agent,Task,Workflow` | `--disallowedTools Bash,Edit,Write,NotebookEdit,Agent,Task,Workflow` (Read/Grep/Glob remain) | `-s <sandbox>` · `-C <dir>` |
| System prompt | `--append-system-prompt` LANE PREAMBLE (impl) | `--append-system-prompt` `.claude/agents/loom-advisor.md` body + LANE PREAMBLE (advise). `--agent loom-advisor` only after Q3 verified | LANE PREAMBLE prepended to the spec text |
| Output | `--output-format json` | `--output-format json` | codex stdout/stderr (raw) |
| `LOOM_LANE` | `impl` | `advise` | `verify` |
| Lock (D7) | **yes** | no (`--parallel` ok) | **yes** if `workspace-write`; no if `read-only` |

Common to all lanes:

- stdin is always `/dev/null` (rule 8: codex waits on open stdin — measured 2026-10-17).
- env strips `LOOM_RELAY_TOKEN` and `LOOM_RELAY_URL` (R48-H1 spirit: never inherit bridge env into workers), and every
  host-session `CLAUDE_CODE_*` key plus `CLAUDECODE` (P1 ruling 2026-10-17 — a lane must not inherit the parent's
  messaging socket/token or session id); the claude lanes then get only the three pin keys.
- verify that must run tests uses a `git archive` tree passed via `-C` with `-s workspace-write` (rule 8, unchanged).

### 4.3 Run dir

`.loom-lanes/<seq>-<lane>/` — gitignored (P1 adds the `.gitignore` entry). `<seq>` is a
zero-padded monotonic counter.

| File | Content |
|---|---|
| `spec.md` | byte copy of `--spec` |
| `argv.json` | final argv + the env keys set/unset (values of secrets never written) |
| `stdout` · `stderr` | raw child streams |
| `meta.json` | schema §4.4 |

### 4.4 `meta.json` schema

| Field | Type | Meaning |
|---|---|---|
| `lane` | `"impl" \| "advise" \| "verify"` | lane run |
| `pinnedModel` | `string` | `claude-opus-5-5` or `gpt-6-astra` |
| `resolvedModels` | `string[]` | keys of `modelUsage` (claude) / model parsed from codex output |
| `mainModel` | `string \| null` | largest/primary `modelUsage` entry — **the** value compared to the pin |
| `effort` | `"medium" \| "high"` | effort the wrapper set |
| `permissionDenials` | `unknown[] \| null` | `permission_denials` from claude JSON; `null` for codex |
| `diffEmpty` | `boolean \| null` | impl only: working-tree change set unchanged before/after |
| `exit` | `0 \| 1 \| 2 \| 3 \| 4 \| 5 \| 6` | §4.5 |
| `exitReason` | `string` | `ok` · `process-error` · `limit` · `timeout` · `model-mismatch` · `denied` · `refused-empty` |
| `durationMs` | `number` | wall time |
| `costUsd` | `number \| null` | cost field from claude JSON (`total_cost_usd` — read by the M4 probe); `null` if unreported (codex) |

### 4.5 Exit codes (aligned with `watch-card.ts`)

| Code | Reason | Trigger | Shared with watch-card |
|---|---|---|---|
| 0 | `ok` | child exit 0 · main model == pin · no denials · (impl) non-empty diff | `marker`=0 |
| 1 | `process-error` | child non-zero / unparsable JSON / spawn failure | `pane-gone`=1 (lane died) |
| 2 | `limit` | usage / auth / rate-limit signal in streams (reuse watch-card limit substrings) | `limit`=2 |
| 3 | `timeout` | `--timeout` exhausted; child killed | `timeout`=3 |
| 4 | `model-mismatch` | `mainModel` ≠ `pinnedModel` (auxiliary small models alone do not trip it) | lane-specific |
| 5 | `denied` | `permissionDenials` non-empty | lane-specific |
| 6 | `refused-empty` | impl finished with an empty diff (or an explicit refusal) | lane-specific |

Precedence when several apply: 3 > 2 > 1 > 4 > 5 > 6 (kill/limit first, then evidence
failures). **Never collapse a non-zero reason into 0** — same principle as rule 6.

### 4.6 Lock (D7) — kernel lock (TLC-verified 2026-10-17)

The first P1 lock (read owner pid → overwrite if dead) and the proposed fix (rename-reclaim + link-restore)
both **violate mutual exclusion**; so does any design where a process decides from the lock file's *content*
(read → check pid → unlink), even a single human `--break-stale-lock`. Files have no atomic
"delete only if content = X", so the check is always stale by the time it acts (TOCTOU). TLC models and
counterexamples: [`docs/spikes/tla/lane-lock/`](./tla/lane-lock/).

| Model | Design | TLC (3 procs) | Counterexample (shortest) |
|---|---|---|---|
| `LockCurrent` | read pid, overwrite if dead | **Mutex violated** · 7 states | p1 and p2 both read the dead owner `Dead`; p1 overwrites → holds; p2 overwrites → holds |
| `LockRename` | O_EXCL → rename stale → verify → link-restore / retry | **Mutex violated** · 10 states | p1 reclaims `Dead` and holds; p2 (which also saw `Dead`) renames **p1's live** lock away; in that gap p3's O_EXCL create succeeds → p1 and p3 hold |
| `LockFixed` | O_EXCL only, no auto-reclaim; one breaker reads pid → checks dead → unlinks | **LockOwned violated** · 11 states (1 breaker), 8 states (2 breakers) | breaker reads `p1`; p1 releases and exits; p2 acquires; breaker sees "p1 dead" from its stale read and unlinks **p2's** lock |
| `LockKernel` | `flock(fd, LOCK_EX\|LOCK_NB)`; kernel releases on close/death | **No error** · Mutex, LockOwned, NoStale, `[]<>(holder = None)` | — |

**Normative spec (replaces the earlier lock text):**

1. Heavy lanes (impl; verify `workspace-write`) open `<runs>/heavy.lock` (create if missing, `"a"` mode) and call
   `flock(fd, LOCK_EX | LOCK_NB)` through `bun:ffi` (`libc.dylib` on darwin, `libc.so.6` on linux; `LOCK_EX=2`,
   `LOCK_NB=4`). Return 0 → hold. −1 → **fail fast**: exit 1, stderr `[lane] another heavy lane holds the lock`
   plus the diagnostic pid line if readable, no spawn, no run dir.
2. Ownership is the **kernel lock on the open file description**, never the file content. After acquiring,
   truncate and write `pid` + start time for diagnostics only; no code path reads it to decide anything.
3. Keep the fd open for the whole run (module-scope reference, not GC-able). Release = `flock(fd, LOCK_UN)` +
   `close` in `finally` on every path (ok, error, timeout, signal). Process death (incl. SIGKILL) releases it
   automatically — there is **no stale state and no reclaim code**.
4. The fd is opened close-on-exec (Node/Bun default) so lane children never inherit the lock.
5. **Never unlink, rename or overwrite `heavy.lock`** (not on release, not on cleanup). After acquiring, compare
   `fstat(fd).ino` with `stat(path).ino`; if they differ (the file was deleted/replaced before we locked), release
   and fail fast with `[lane] lock file replaced`. Deleting it while held is outside the model (external actor) —
   documented residual: `.loom-lanes/` cleanup must skip `heavy.lock`.
6. FFI unavailable / unsupported platform → **fail closed** (exit 1 `[lane] lock unavailable`), never fall back
   to content-based locking.
7. `--parallel` stays accepted only for light lanes (advise; verify `read-only`) and is an arg error on heavy lanes.

Probe (2026-10-17, Bun on darwin): A `flock`=0 and sleeps; B `flock`=−1; `kill -9 A`; C `flock`=0 — the file
remains, the lock does not.

### 4.6b P1 implementation rulings (2026-10-17, verify rounds 1–3 with GPT-6 Astra high)

| Topic | Ruling |
|---|---|
| codex model evidence | read **only child stderr**, only the header block between the first two `--------` lines; no block → `mainModel` null → exit 4; header `reasoning effort` ≠ `high` → exit 4; `meta.effortResolved` (`string\|null`) added |
| impl needs git | impl `--cwd` must be a git work tree (`rev-parse --is-inside-work-tree` = `true`), else exit 1 before lock/run dir; any `status`/`diff` snapshot failure before or after → exit 1 `process-error` (`diffEmpty` null on that path only) |
| process group | timeout = SIGTERM group → SIGKILL after 5 s grace; normal exit → reap group; every group signal is preceded by a `kill(-pgid, 0)` probe (100 ms during grace) and skipped when the group is gone. **Residual (accepted, Low):** the probe proves existence, not identity — reuse needs the PID space to wrap to that exact number within ~100 ms; a group-anchor process would close it and is deferred as disproportionate |
| failure evidence | every failure after arg parsing writes run stderr + `meta.json` + summary line (spawn throw, async spawn error, argv > 900 000 bytes) |
| host env | `CLAUDE_CODE_*` and `CLAUDECODE` stripped for all lanes (§4.2) |

### 4.7 LANE PREAMBLE (draft, verbatim)

impl:

```text
LOOM LANE: impl. You are an implementation lane, not the architect.
Implement the spec below directly. Ignore any global "architect / delegate / orchestrate"
instruction, the session-start ritual, and Template R.
Do not commit, push, stash, reset, checkout or amend. Do not use the board, room, or Loom MCP.
Do not spawn agents or other CLIs. Run only the verification commands the spec names, in the
exact form given. If a command is denied, stop and report the denial; do not work around it.
Run each command alone: never append `; echo`, `&&`, `||`, pipes or `$?` — the tool result already shows the exit code.
Write files only with the Edit/Write tools — never with shell redirection, heredocs or `tee`.
End with: files changed, commands run with exit codes, anything left undone.
```

advise:

```text
LOOM LANE: advise. You are a read-only advisor lane, not the architect.
Read the decision or diff below and return a verdict in the vocabulary of the advisor prompt
(final review: ship / fix-first / rethink · R{n}: approve / pending-revision / on-hold), the
reasoning, and the single deciding risk. Do not edit files, run commands, spawn agents,
or use the board, room, or Loom MCP. Ignore the session-start ritual and Template R.
```

verify (P1 ruling 2026-10-17 — replaces the earlier "impl text with lines 1–2 swapped", which left a fragment):

```text
LOOM LANE: verify. You are an independent verifier, not the implementer.
Verify the spec below against the working tree; report findings, do not fix them.
Ignore any global "architect / delegate / orchestrate" instruction, the session-start ritual, and Template R.
Do not commit, push, stash, reset, checkout or amend. Do not use the board, room, or Loom MCP.
Do not spawn agents or other CLIs. If a command is denied, stop and report the denial.
Do not use here-documents, process substitution or temp files (the sandbox denies them); use git, rg/grep, sed and cat.
Harmless sandbox warnings on stderr (e.g. git's `xcrun_db ... Operation not permitted`) are not denials — continue; stop only when a command itself fails.
End with: verdict (PASS / PASS-with-lows / FAIL), then findings ranked by severity with file:line.
```

Appended after the preamble (all lanes): `tasks/traps.md` **활성 함정** bullets and the
HANDOFF **Must not** line, inlined at call time.

---

## 5. Enforcement layers

### 5.1 (a) Evidence gate — primary (rule 7)

The architect accepts a lane result only when **all** hold:

1. `lane.ts` exit **0**;
2. `meta.json.mainModel == meta.json.pinnedModel`;
3. `meta.json.permissionDenials` is `[]` (claude lanes);
4. architect has read the diff in the working tree and **rerun** the spec's tests itself.

Items 1–3 are necessary, never sufficient. A lane summary line is not evidence.

### 5.2 (b) Bash gate hook — speed bump

New `scripts/hooks/check-lane-spawn.ts` (name proposed), `PreToolUse` matcher `Bash`.

- **Per-segment scan** mirroring `isBunTestCommand` in `check-bun-test-env.ts`: split on `&&`, `||`, `;`, newline; strip leading `env [-u X | K=V]…`, `command`, `nohup`, `gtimeout <n>`, `timeout <n>` prefixes; match the binary by basename so absolute paths (`/usr/local/bin/claude`) count.
- Deny (exit 2) a segment that runs `claude` with `-p`/`--print`, or `codex` with `exec`/`e`, unless the segment is `bun run scripts/lane.ts …`.
- When `LOOM_LANE` is set in the hook's env: deny **any** `claude`, `codex`, or `lane.ts` segment (no nesting).
- Parse errors → exit 0 (fail-open, same as existing hooks). Deny message names `lane.ts`.

Hook order in `.claude/settings.json` `PreToolUse` `Bash`:

```text
check-bun-test-env.ts  →  check-lane-spawn.ts (new)  →  rule-router-jit.ts
```

Both deny hooks precede JIT (HANDOFF invariant "Bash deny **before** JIT; JIT never exit 2").


**P2 as built (2026-10-17, `scripts/hooks/check-lane-spawn.ts`).** After three verify rounds of
position-based bypasses (`&`, leading/attached redirections, `--`, `bash -o … -c`), detection is by
**token presence per segment**, not command position: segments split on unquoted `;` `&` `|` and newlines
(outside heredoc bodies; redirection operators kept intact); among unquoted tokens, `claude` + `-p`/`--print`
or `codex` + later `exec`/`e` → deny (even in a segment that also calls the wrapper); `bun` + later
`…scripts/lane.ts` = a lane call. Inside a lane (`LOOM_LANE` set) any `claude`, `codex` or lane call is denied.
Quoted tokens never match; one level of `bash|sh|zsh … -c` is recursed. Accepted false-denies: unquoted
mentions (`echo claude -p`), `codex exec --help`. Accepted residuals: `eval`, process substitution, aliases,
functions, deeper nesting, quoted names (`"claude" -p`). Verify loop closed by architect ruling after 4 real verify runs (last two Mediums fixed without a 5th run) —
the hook is a speed bump; `lane.ts` evidence (`meta.json`) is the enforcement.
Inject skip: under `LOOM_LANE`, `session-context.ts` emits nothing for every format incl. `raw` (so `session:bootstrap` is empty inside a lane; `--lint` unchanged) and `norms-receipt.ts` skips its hook formats (`--check` and `raw` unchanged);
emission tests strip `LOOM_LANE` so the suite passes inside a lane. FORCE env pair **not** added (owner, P2 scope).

### 5.3 (c) Agent hook — existing

`scripts/hooks/check-agent-model.ts` unchanged: blocks `fable-advisor` / `fable`, pins
`loom-advisor`, requires `model` elsewhere. It remains the guard for in-harness research spawns.

### 5.4 (d) FORCE pair in project settings — backstop

Add to `.claude/settings.json` `env`: `CLAUDE_CODE_SUBAGENT_MODEL=claude-opus-5-5`,
`CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1`.

- **Value:** pins Workflow agents and teammates (M1) that no hook sees.
- **Not covered:** forks (doc fact §1.2).
- **Documented cost:** every subagent in this repo becomes Opus 5.5 — including `Explore`, `claude-code-guide`, and subagents spawned from **owner pane sessions** opened in this repo. Accepted for the guarantee; revisit if cost re-measure (§9) says otherwise.

### 5.5 Known residual bypasses

| Bypass | Why it passes | Mitigation |
|---|---|---|
| `bash -c "claude -p …"` / `sh -c` / `eval` | segment scan sees `bash`, not `claude` | evidence gate (no `meta.json` → not accepted) |
| `$(which claude) -p …`, aliases, variables | binary not literal | same |
| arbitrary `bun`/`node` script that spawns `claude` | spawn happens below the hook | same; rule text |
| in-harness `general-purpose`/`claude` Agent doing impl | hook cannot tell impl from research (Q1) | rule text + FORCE pair + evidence gate |
| `fork` | ignores `model`, not FORCE-covered | rule 8 note stays; safe only when session is Opus 5.5 |
| owner manual shell outside Claude Code | no hook at all | out of scope |

---

## 6. Lane permissions (D5)

### 6.1 impl `--allowedTools` (exact forms)

| Pattern | Note |
|---|---|
| `Bash(bun run test:lane *)` | package script `scripts/lane-test.ts` sets temp HOME + LOOM_TEST_HOME + LOOM_PROFILE=smoke and drops relay env |
| `Bash(bun run typecheck:*)` | |
| `Bash(bunx biome:*)` | |
| `Bash(bun run handoff:check)` | |
| `Bash(git diff:*)` · `Bash(git status:*)` · `Bash(git log:*)` · `Bash(git rm:*)` | read + tracked delete |
| `Bash(rm:*)` within `--cwd` | wrapper refuses a `--cwd` outside the repo / temp fixture |
| `Read` · `Grep` · `Glob` · `Edit` · `Write` | `acceptEdits` covers edits |

P4 measured (2026-10-17, run 0007): an env-prefixed allow rule never matched — `env` is not a stripped wrapper and allow rules do not match past non-safe `VAR=` assignments (code.claude.com/docs/en/permissions). Hence the package script.
Residual: the lane can Edit `package.json`, `scripts/lane-test.ts` or a test file and then `bun run test:lane` runs arbitrary
code outside `check-lane-spawn` — the same class as any lane-written test. Guard = architect diff review: flag any lane diff
touching `package.json` or `scripts/lane-test.ts`. Bare `bun run test:lane` (no args) matching the rule is UNVERIFIED (0013 passed an arg).

### 6.2 impl `--disallowedTools`

| Pattern | Reason |
|---|---|
| `Agent` · `Task` · `Workflow` | no nesting; closes fork/effort gaps |
| `Bash(git commit:*)` · `Bash(git push:*)` · `Bash(git stash:*)` · `Bash(git reset:*)` · `Bash(git checkout:*)` · `Bash(git commit --amend:*)` | architect ships |
| `Bash(launchctl:*)` · `Bash(systemctl:*)` | HANDOFF Must-not (live service registration) |
| `Bash(ssh:*)` · `Bash(scp:*)` | user/local settings allow ssh and load in `-p` |
| `Bash(*--real-cli*)` · `Bash(*smoke:service --live*)` | real-CLI / live smokes need explicit owner yes |

### 6.3 advise

Tools = Read / Grep / Glob only; disallow list per D2. No `--allowedTools` needed.

### 6.4 Spec-writer guidance

Every segment of a compound command must match an allowed pattern, or the whole call is
denied (→ exit 5). Specs **avoid** `cd x && …`, `| tail`, `2>&1 | grep`; use `--cwd` and
plain single commands in the exact §6.1 form.

---

## 7. Rule-text changes (applied in P3, 2026-10-17)

| Where | Change (one line) |
|---|---|
| `CLAUDE.md` rule 3 | Workflow tool = **read-only fan-out only**; impl/verify/advise steps run via `lane.ts`, chained by the architect |
| `CLAUDE.md` rule 5 | Claude impl/advise lanes = headless `lane.ts`; herdr panes stay the surface for **product dogfood** |
| `CLAUDE.md` rule 8 | pins are owned by `lane.ts`; in-harness `Agent` impl becomes a reported fallback (verify has none) and `loom-advisor` is an equal read-only advise option; acceptance requires the D6 evidence gate |
| `docs/DOGFOOD_LOOP.md` §1.2 | owner-pin box points to `bun run scripts/lane.ts impl` (and `verify`) instead of in-harness `Agent` / pane `claude-impl` |
| `AGENTS.md` **Impl delegation** row | `full` routes implementation through `lane.ts impl` and verifies through `lane.ts verify` + architect rerun |

---

## 8. Rollout

| Step | Work | Lane | Done when |
|---|---|---|---|
| **P1** | `scripts/lane.ts` + tests with **fake `claude`/`codex` binaries** (PATH shim); `.gitignore` entry | impl Opus 5.5 medium → verify Astra high | every exit code 0–6 has a test; `meta.json` schema asserted; relay env stripped; stdin `/dev/null`; lock + `--parallel` rejection tested; `bun test` green |
| **P2** | Bash gate hook + `LOOM_LANE` inject skip in `session-context.ts` and `norms-receipt.ts`; settings hook order + FORCE pair | impl Opus 5.5 medium → verify Astra high | per-segment deny/allow table tests (prefixes, absolute paths, nesting); inject empty under `LOOM_LANE`; `bun run handoff:check` green |
| **P3** | Rule text §7 | impl Opus 5.5 medium → verify Astra high | five edits land; `bun run handoff:check` green |
| **P4** | Live smoke, one real call per lane | architect runs `lane.ts`; advisor review at the end | assertions below all pass |

P4 live-smoke assertions:

1. **impl (tool-using)** in a temp fixture: runs one `bun test` in the §6.1 form **and** deletes a file → exit 0, `permissionDenials == []`, `mainModel == claude-opus-5-5`, diff shows the delete.
2. **impl negative**: spec asks for `git commit` → exit 5 (denied), not 0.
3. **advise**: returns a verdict; exit 0; `mainModel == claude-opus-5-5`; no files changed.
4. **verify**: `read-only` run → exit 0; `resolvedModels` contains `gpt-6-astra`.
5. Record `costUsd` / `durationMs` per lane vs M4 baseline ($0.44 / 5.2 s).
6. Optional: `--agent loom-advisor` frontmatter check (Q3).
7. **Hooks load inside a lane:** the impl spec asks the lane to run the allowlisted `git log --oneline -1 -- claude` → expect the Bash gate to deny it (allowlisted, so the denial can only come from the hook) (`permissionDenials` non-empty → exit 5), proving project hooks run in `-p` mode with `LOOM_LANE` set.
8. **Orphans:** after the impl run, no process from the lane's session survives (descendants that `setsid` leave the group — check by pid list).

**P4 result (2026-10-17, live — `.loom-lanes/0006`–`0019`):** all mandatory assertions pass after four fixes.

| # | Run | Result |
|---|---|---|
| 1 impl tool-using | 0013 | **PASS** — exit 0 · `permissionDenials []` · `mainModel claude-opus-5-5` · `bun run test:lane` 1 pass · `git rm` shown in status · $0.31 / 17.5 s. Earlier 0007 FAIL (env-prefixed allow rule never matches) and 0012 FAIL (lane appended `; echo "EXIT=$?"`) |
| 2 impl negative | 0009 | **PASS** — `git commit` denied → exit 5, HEAD unchanged |
| 3 advise | 0010 | **PASS** — exit 0 · `claude-opus-5-5` · denials `[]` · repo unchanged · $0.34 / 28.2 s |
| 4 verify | 0006 | **PASS** — exit 0 · `resolvedModels [gpt-6-astra]` · `effortResolved high` · 19 s (codex reports no cost) |
| 5 cost | — | impl $0.31 / 17.5 s · advise $0.34 / 28.2 s · verify 19.2 s (all wrapper `meta.json` `durationMs`; cost = CLI `total_cost_usd`) vs M4 baseline $0.44 / 5.2 s |
| 6 Q3 `--agent` | — | not run (optional) |
| 7 hooks in lane | 0008 | **PASS** — `git log -- claude` (allowlisted) denied by `check-lane-spawn.ts` → exit 5 |
| 8 orphans | all | **PASS** — architect `ps -axo pid,pgid,command` filtered on the fixture tree after every run showed none (session scratchpad output, not in `meta.json`) |

Fixes found only by live use: (a) `test:lane` package script replaces the env-prefixed allow rule (§6.1);
(b) preamble forbids appended `; echo`/`$?` and (c) shell-redirection file writes (both recurred); (d) `gitSnapshot`
hashes untracked file contents (0015 edited already-untracked files and read as `refused-empty`). Lane self-reports
twice claimed "no denials" while `meta.json` showed one — the D6 evidence gate, not the report, decides.
**Accepted exceptions — not a precedent:** fix runs 0011 and 0016 ended exit 5 (one denied `; echo $?` / heredoc command; the lane then
redid the step in an allowed form, contrary to the preamble's "stop and report", and 0016's report omitted the denial). Their output was
accepted only through architect diff review + test rerun + Astra 0014/0017/0019. Under rule 8 exit-5 output is otherwise rejected.
Astra 0019 PASS was a static review (it skipped the suites while another suite ran); the test rerun rests on the architect
(lane suites 98/0 + full suite).
Known false positive: an allowlisted command that merely names `claude` (`git log -- claude`) is denied inside a
lane — quote it (hook message says so).

Each step ships in its own commit(s), never interleaved with v0.37.0 P-steps. Final
deliverable gets the advisor (Opus 5.5 high) review before "done".

---

## 9. Open items / to verify

| Item | How |
|---|---|
| Q3 — does `claude -p --agent loom-advisor` apply frontmatter `model`/`effort`/`tools`? | P4 optional check; until then explicit flags |
| Auxiliary models in `modelUsage` on tool-using runs (small model for e.g. summaries) | P4 run 1; confirms "main model" rule in §4.5 |
| claude-mem plugin injecting/recording inside lane sessions (believed disabled in user `enabledPlugins`) | inspect P4 lane `stdout`/session; **UNVERIFIED** |
| Cost after inject skip vs $0.44 baseline | P4 assertion 5 |
| Is a Workflow-side PreToolUse hook still wanted once rule 3 is amended? | revisit after P3; FORCE pair covers the model axis meanwhile |
| Exact `--allowedTools` pattern syntax for env-prefixed Bash commands | P1 + P4 (§6.1 note) |
| `--timeout` default and lock wait-vs-fail-fast | P1 picks; conservative = 1800 s · fail fast |

---

## 10. Rejected alternatives

| Alternative | Why rejected |
|---|---|
| Regex lint of Workflow scripts as the primary guard | scripts can compute model/agent values; lint is bypassable and does not see effort |
| Managed `availableModels` / `deniedModels` policy | machine-wide/managed scope, blunt (also hits owner sessions), does not pin effort |
| FORCE pair alone | no forks, no effort pin, no tool restriction, no evidence; kept only as backstop (§5.4) |
| Blocking general-purpose `Agent` spawns by hook | hook cannot distinguish impl from research (Q1); would break read-only exploration |
| `codex:codex-rescue` plugin for verify | extra Claude hop and plugin-default model risk; `codex exec` with explicit `-m gpt-6-astra` is already the rule-8 form |
