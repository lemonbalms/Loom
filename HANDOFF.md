# HANDOFF — Loom

**Updated:** 2026-07-22
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> `SESSION-CONTINUITY` Phase C is locally green but unshipped · next = commit/push reviewed diff in a git-writable session, then PATCH 1.

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | PANE-DEATH v0.28.0 approved; PATCH 1 waits for Phase C ship | `docs/PLAN.md` |
| Dogfood | mac-node is fail-closed while herdr 0.7.5 adapter is deferred | `docs/spikes/HERDR-0.7.5-COMPAT.md` |
| Harness | checkpoint contract is repo-enforced; independent restoration smoke passed | `docs/spikes/HANDOFF-CHECKPOINT-DESIGN.md` |
| Reuse | not proven | evidence below |

## Current action

### SESSION-CONTINUITY Phase C ship

Goal:
- Commit and push the already-reviewed Phase C 11-file diff in a git-writable session; only then release PATCH 1.

Expected:
- A commit SHA and remote push record exist for the reviewed diff; no Phase C implementation or verification is repeated.

Must not change:
- The reviewed implementation diff except final pre-ship diff/lint checks; production behavior, `dist/**`, PLAN/review locks, herdr adapter, or Phase D automation.

Done when:
- The reviewed Phase C diff is committed and pushed; then advance to PANE-DEATH PATCH 1 (M1) tests-only expected-red.

## Active checks

| Check | Deadline | Impact | Evidence |
|---|---|---|---|
| Phase C commit/push | this gate | releases PATCH 1 | `docs/HANDOFF_ARCHIVE.md` |
| PATCH 1 (M1) tests-only expected-red | after ship | product implementation boundary | `docs/PLAN.md` |
| Phase D automation | after two real PATCH transitions | deferred | `docs/spikes/HANDOFF-CHECKPOINT-DESIGN.md` §10 |

## Owner pending

| Decision | Why owner input is needed | Safe default while pending | Evidence |
|---|---|---|---|
| Integration-test flake track | diagnosis changes cost/scope | keep isolation recipe; do not expand scope | `tasks/todo.md` |
| HOOKCACHE-D-VERIFY resume | deferred cache verification | remain paused through this wave | `docs/spikes/HOOK-CACHE-FIX-DESIGN.md` |
| RULE-ENFORCEABILITY apply | code-enforcement layer is a product decision | document only; add no silent enforcement | `docs/spikes/RULE-ENFORCEABILITY.md` |

## Blockers

| Blocker | Owner/environment | Clear condition | Safe default |
|---|---|---|---|
| `fatal: Unable to create .../.git/index.lock: Operation not permitted` during `git add` and `git commit` | current environment has read-only `.git` | resume in a git-writable session | preserve the reviewed worktree; do not start PATCH 1 or alter the reviewed diff |

## Invariants

- HANDOFF alone owns the next session gate; PLAN and review remain linked SSOTs.
- All nine checkpoint headings occur once; completed narrative stays outside this file.
- `HARD_CAP=9500` is platform-pinned and `SOFT_CAP=12750` is policy-only.
- `tasks/traps.md` remains the injected source for active traps and do-not-do rules.
- Windows entry is evidence only; herdr 0.7.5 adapter work remains deferred and fail-closed.

## Evidence

- Product plan/review: `docs/PLAN.md` · `docs/plan_review.md` · `docs/reviews/PANEDEATH-R45.md`
- Continuity design/lock: `docs/spikes/HANDOFF-CHECKPOINT-DESIGN.md` · `docs/spikes/SESSION-CONTINUITY-PHASE-C-LOCK.md`
- Current execution and verification provenance: `docs/HANDOFF_ARCHIVE.md`
- Traps and lessons: `tasks/traps.md` · `tasks/lessons.md`
- Windows entry: `HANDOFF_WINDOWS.md`

## Don't redo

- Phase B fixture/SOFT_CAP/expected-red work shipped at `e281587`; do not rerun or reimplement it.
- Reopen PANE-DEATH U1–U11/R44/R45 locks or treat `card.done`/pane exit as completion authority.
- Raise `HARD_CAP`, create a WORKLOG/ROADMAP/front matter, or promote Phase D lint automation early.
- Downgrade herdr, run a parallel 0.7.4 session, or implement the 0.7.5 adapter in this wave.
- Reimplement or reverify Phase C; only the final pre-ship diff/lint check is permitted before commit/push.
