# SESSION-CONTINUITY Phase B implementation lock

| Field | Locked value |
|---|---|
| Gate | SESSION-CONTINUITY Phase B only |
| Authority | `HANDOFF.md` Current action · `HANDOFF-CHECKPOINT-DESIGN.md` §10, §11, §13.1 |
| Baseline | 2026-07-22, `afdfff4` |
| Review | Existing adopted design/review; no new product surface and no R{n} |
| Owner | `codex-arch` specifies/verifies; `grok-impl` is the only implementation writer |

This file is the locked five-part contract for the Phase B board task. If a requirement
below cannot be satisfied without changing a non-goal, stop and return `[IMPL-BLOCKED]`;
do not broaden scope.

## 1. Scope

1. Add a repository-local Phase B HANDOFF checkpoint fixture under `scripts/fixtures/`.
   It models the §4/§5 target headings and the current v0.28.0 checkpoint without
   replacing the live `HANDOFF.md`.
2. Add test-only validation for design V1–V6. Keep the validator in test code; Phase B
   must not wire it into the production/session-start path.
3. In `scripts/session-context.test.ts`, change the stale D4 constant expectation from
   `SOFT_CAP=8500` to the current policy value `12750`. `HARD_CAP=9500` stays pinned.
4. Lock the live `bun run handoff:lint` capacity failure as an expected Phase B red.
   Baseline output at lock time is:

   ```text
   ⚠ HANDOFF top-80 = 12642B > 8192 — 종결 웨이브를 docs/HANDOFF_ARCHIVE.md로 이관(규칙 L15)
   ```

   The command output is the measurement SSOT. The test must require exit 1 and the
   `top-80 > 8192` capacity class without treating Phase B as failed. Phase C will flip
   this contract to green after the real HANDOFF transition.

## 2. Non-goals

- Do not change Loom product production code under `packages/**` or `dist/**`.
- Do not edit live `HANDOFF.md`, `docs/HANDOFF_ARCHIVE.md`, `AGENTS.md`,
  `docs/WORKFLOW.md`, `.claude/settings.json`, `scripts/session-context.ts`, or
  `scripts/session-status.ts`.
- Do not create the Phase C shared-heading constant, change extraction/runtime behavior,
  move history, or make `handoff:lint` green.
- Do not start PANE-DEATH PATCH 1, alter PLAN v0.28.0/U1–U11, or introduce front matter,
  CI lint promotion, ROADMAP authority, or a new WORKLOG.
- Do not commit or push. Return the implementation result for architect verification and
  wait for an explicit `[SHIP]` handoff.

## 3. Invariants

- Fixture UTF-8 size is at most 8,192 bytes; no `<details>`; no completed-history block.
- Exactly one each: `One-line resume`, `Current loop`, `Current action`, `Active checks`,
  `Owner pending`, `Blockers`, `Invariants`, `Evidence`, and `Don't redo`.
- Fixture state restores PLAN v0.28.0, current Phase B gate, expected red versus green,
  production/Phase C prohibitions, owner-pending items and conservative defaults,
  evidence links, and don't-redo items. Windows entry remains reachable through Evidence.
- V4 state assembly includes the fixture checkpoint plus the `tasks/traps.md` sections
  `활성 함정` and `하지 말 것`. Measure both JavaScript string length and UTF-8 bytes;
  the pre-truncation JS string length must be `<= HARD_CAP`, and
  `truncateContext(state) === state` with no warning/truncation marker.
- V1 does not create a second PLAN/review authority; a stale todo cannot override the
  fixture's unique next gate. V5 answers the six restoration questions in design §11.
- V6 injects drift/failure cases in test data and requires loud rejection: PLAN mismatch,
  missing Evidence target, duplicate/renamed Current action, malformed Blockers, renamed
  traps heading, inserted `<details>`, forbidden history heading, and ROADMAP authority
  without an adopted ROADMAP. No live source file is mutated for these cases.
- Existing fail-open SessionStart behavior remains unchanged. `HARD_CAP=9500` remains a
  platform boundary; `SOFT_CAP=12750` remains only the commit-gate policy value.

## 4. Verification

Worker must run and report exact outcomes:

```bash
env -u LOOM_RELAY_TOKEN -u LOOM_RELAY_URL bun test scripts/session-context.test.ts scripts/handoff-checkpoint.test.ts
bun run session-context:lint
bun run handoff:lint  # expected exit 1, capacity red only
git diff --check
git status --short
```

Architect runs the same focused checks independently after `[IMPL-RESULT]`, inspects every
changed file, then runs `env -u LOOM_RELAY_TOKEN -u LOOM_RELAY_URL bun test`. The full suite
is architect provenance and must not run concurrently with the worker suite.

## 5. Return and ship contract

Return to `@codex-architect` with:

```text
[IMPL-RESULT] SESSION-CONTINUITY Phase B
Lane: grok-impl (if identity differs, stop and disclose before editing)
Task: <board task id> claimed doing/grok-impl
Files: <complete changed-file list>
Tests: <focused counts>; session-context:lint=<exit>; handoff:lint=<exit + exact red>; diff-check=<result>
V1-V6: <one line each>
Scope audit: packages=unchanged, dist=unchanged, live HANDOFF=unchanged, Phase C=not started
Commit/push: none
```

If architect finds a defect, accept a `[FIX]` handoff and return a new result. Only after
an explicit `[SHIP]` may `grok-impl` commit and push; return the commit SHA and remote ref.

