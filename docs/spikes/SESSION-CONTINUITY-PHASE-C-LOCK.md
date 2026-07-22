# SESSION-CONTINUITY Phase C implementation lock

| Field | Locked value |
|---|---|
| Gate | SESSION-CONTINUITY Phase C only |
| Authority | `HANDOFF.md` Current action · `HANDOFF-CHECKPOINT-DESIGN.md` §§4–13 |
| Baseline | 2026-07-22, `059cd37` |
| Review | Existing adopted design/review; no new product surface and no R{n} |
| Owner | `codex-arch` specifies/verifies; implementation writer is a lower-tier in-harness fallback |
| Lane provenance | herdr 0.7.5/protocol 17 makes `mac-node` intentionally fail-closed; adapter PATCH stays out of this bounded wave |

This file is the locked five-part contract for the Phase C atomic transition. The default
`grok-impl` pane and `codex-impl` pane are unavailable because the shared herdr bridge is
offline by design under `docs/spikes/HERDR-0.7.5-COMPAT.md`. This is the documented
`DOGFOOD_LOOP.md` §1.2 final fallback, not permission for the architect to hand-code.

If a requirement below cannot be satisfied without changing a non-goal, stop and return
`[IMPL-C-BLOCKED]`; do not broaden scope or silently drop information.

## 1. Scope

Perform one atomic transition across the live checkpoint, its archive, shared heading
contract, extraction path, status budget gate, tests, and entry documentation.

1. Replace live `HANDOFF.md` with the canonical nine-section checkpoint:
   `One-line resume`, `Current loop`, `Current action`, `Active checks`, `Owner pending`,
   `Blockers`, `Invariants`, `Evidence`, and `Don't redo`.
   - Preserve the unique next gate and every non-history item required by design V2.
   - Keep Windows entry reachable through `Evidence` only.
   - Move completed narrative and detailed operational provenance out; do not copy-and-leave.
2. Extend `docs/HANDOFF_ARCHIVE.md` with a top-level `## In progress evidence` area that
   is separate from immutable completed-wave history. Move current execution/failure/
   verification detail there when it remains useful to the active checkpoint.
3. Add `scripts/handoff-headings.ts` as the single source for:
   - ordered `REQUIRED_HANDOFF_HEADINGS`;
   - anchored Markdown section extraction shared by production and tests.
4. Update `scripts/session-context.ts` to consume the shared contract and inject all nine
   HANDOFF sections plus the existing `tasks/traps.md` sections. Remove the legacy starred
   `⭐ Current action` extraction. Preserve current fail-open behavior.
5. Update `scripts/session-status.ts` to consume the shared One-line heading and enforce
   the D1 whole-file UTF-8 budget of 8,192 bytes. `bun run handoff:lint` must become green
   on the live checkpoint; do not add Phase D structural lint here.
6. Update `scripts/handoff-checkpoint.test.ts`:
   - import the shared heading/extraction contract rather than duplicating it;
   - retain the Phase B fixture as immutable historical coverage;
   - replace the live expected-red assertion with Phase C live-green coverage;
   - validate the live checkpoint's size, uniqueness, links, no-history/no-details shape,
     information map, and `handoff:lint` exit 0.
7. Update `scripts/session-context.test.ts` to use canonical headings and cover injection
   parity for all nine sections plus traps, including loud failure for renamed/missing
   required content and identity under `truncateContext`.
8. Synchronize `AGENTS.md` v2 partial-read instructions and `docs/WORKFLOW.md` §0.3 with
   the canonical checkpoint shape and explicit `tasks/traps.md` partial read.

Expected implementation files are limited to:

```text
HANDOFF.md
docs/HANDOFF_ARCHIVE.md
docs/WORKFLOW.md
AGENTS.md
scripts/handoff-headings.ts
scripts/session-context.ts
scripts/session-status.ts
scripts/handoff-checkpoint.test.ts
scripts/session-context.test.ts
```

The lock file itself is architect-authored provenance and is not an implementation-worker
edit. If another file is required, stop and report why before changing it.

## 2. Non-goals

- Do not change Loom product code under `packages/**` or generated `dist/**`.
- Do not change PLAN v0.28.0, U1–U11, R44/R45, review status, or PANE-DEATH semantics.
- Do not start PANE-DEATH PATCH 1 inside this card; it resumes only after the restoration
  smoke succeeds.
- Do not implement herdr 0.7.5 compatibility, change `herdrProtocol`, downgrade/pin herdr,
  or create a parallel 0.7.4 session. That is a separate product compatibility PATCH.
- Do not create WORKLOG, ROADMAP authority, front matter, strict metadata, or a new SSOT.
- Do not promote lint to CI, implement Phase D structural lint/status fail-loud automation,
  or change SessionStart fail-open policy.
- Do not edit `.claude/settings.json`; preserve its two-hook topology.
- Do not change `HARD_CAP=9500` or `SOFT_CAP=12750`.
- Do not rewrite the historical Phase B fixture to describe Phase C.
- Do not commit or push. Return the diff for architect verification; shipping is a separate
  step after independent verification.

## 3. Invariants

### 3.1 Live checkpoint shape and authority

- `HANDOFF.md` is at most 8,192 UTF-8 bytes in full, has no `<details>`, and has no
  completed-history block.
- It contains exactly one ordered `##` heading for each of the nine canonical sections.
- `Current action` contains exactly one `###` gate and states Goal, Expected, Must not
  change, and Done when.
- `Blockers` is either explicit `(none)` or gives a blocker, owner, clear condition, and
  safe default. No owner blocker is invented for the known herdr adapter deferral.
- HANDOFF uniquely owns the next gate. PLAN and review status remain links to their SSOTs;
  `tasks/todo.md`, archive history, and ROADMAP candidates cannot override the checkpoint.
- Owner-pending items retain their conservative default and evidence link. `Don't redo`
  preserves the Phase B ship boundary, PANE-DEATH review locks, and herdr no-downgrade rule.

### 3.2 Information preservation and archive

- Every design V2 item remains discoverable in the live checkpoint or a direct evidence
  target: current action/criteria, active unverified checks, owner pending, blockers,
  invariants, evidence, don't-redo, and Windows entry.
- Completed narrative is moved into existing archive history; active execution/failure/
  verification detail goes only under `In progress evidence`.
- Existing completed-wave archive content remains immutable. The new in-progress area has
  an explicit contract that it is separate from append-only completed history.
- Stale detailed numbers or old status prose are not promoted into a new authority merely
  to preserve text volume.

### 3.3 Shared heading and injection contract

- `REQUIRED_HANDOFF_HEADINGS` and the anchored extractor have one implementation source.
  `session-context`, `session-status`, and checkpoint tests consume it.
- `buildStateContext()` includes all nine canonical HANDOFF sections, in order, followed
  by both traps sections (`활성 함정`, `하지 말 것`) without silently dropping content.
- The assembled pre-truncation state satisfies `truncateContext(state) === state`, contains
  no warning/truncation marker, and remains within `HARD_CAP` by JavaScript length and
  UTF-8 bytes as already defined by the tests.
- Renaming or removing a required HANDOFF/traps heading is visible in tests; the migration
  must not leave the hook exiting green while `Current action` disappears.
- Existing SessionStart fail-open behavior, state/lessons split, and traps ownership remain
  unchanged.

### 3.4 Gate sequencing

- Phase B remains shipped at `e281587` and is not rerun or reimplemented.
- Phase D remains deferred until two real PATCH transitions.
- A restoration-smoke failure restores the previous HANDOFF shape and releases the bounded
  continuity gate; it must not delay PANE-DEATH again.

## 4. Verification

The implementation worker must run sequentially and report exact outcomes:

```bash
env -u LOOM_RELAY_TOKEN -u LOOM_RELAY_URL bun test scripts/handoff-checkpoint.test.ts scripts/session-context.test.ts
bun run handoff:lint
bun run session-context:lint
bun run status
git diff --check
git status --short
```

Expected focused result:

- both test files green;
- live `handoff:lint` exit 0 with full UTF-8 size at most 8,192 bytes;
- `session-context:lint` exit 0;
- status restores PLAN v0.28.0 and the Phase C/new-session-smoke next action without a
  malformed or capacity warning;
- diff-check clean and only the locked implementation files changed.

The worker must not run the full suite concurrently with the architect. After return, the
architect independently inspects every changed file, repeats the focused commands, then runs:

```bash
env -u LOOM_RELAY_TOKEN -u LOOM_RELAY_URL bun test
```

If the full suite has environment failures, compare the failure-name set against clean HEAD;
only a zero changed-tree delta can pass. Before shipping, run an independent restoration smoke
using only:

1. the new `HANDOFF.md`;
2. `bun run status` output;
3. the AGENTS entry rule;
4. `tasks/traps.md` sections `활성 함정` and `하지 말 것`.

The smoke must recover current loop, PLAN and next gate, expected green/red, must-not-change,
now-versus-deferred checks, Owner pending, and Don't redo. If it fails, restore the prior
HANDOFF shape and resume PANE-DEATH PATCH 1 without another continuity redesign.

## 5. Return and ship contract

Return to the architect with:

```text
[IMPL-C-RESULT] SESSION-CONTINUITY Phase C
Lane/model: <actual in-harness identity; disclose mismatch before editing>
Baseline: 059cd37
Files: <complete changed-file list>
Migration map: <old HANDOFF block -> live section/archive destination>
Metrics: HANDOFF chars=<n> bytes=<n>; assembled state chars=<n> bytes=<n>; truncation=identity
Tests: focused=<counts>; handoff:lint=<exit>; session-context:lint=<exit>; status=<summary>; diff-check=<result>
Invariants: <shape, authority, information, injection, archive, non-goal audit>
Commit/push: none
Remaining risks: <or none>
```

End with the unique line:

```text
[IMPL-C-DONE] baseline=059cd37 verdict=green
```

If blocked, make no speculative broadening and end with:

```text
[IMPL-C-BLOCKED] baseline=059cd37 reason=<concrete blocker>
```

The architect owns independent verification and ship. A successful implementation return is
not itself approval to commit or push.
