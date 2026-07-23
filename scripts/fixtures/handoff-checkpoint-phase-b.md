# HANDOFF — Loom

**Updated:** 2026-07-22
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> `SESSION-CONTINUITY` · PLAN `0.28.0`/`approved` · 다음 = Phase B fixture + SOFT_CAP green + handoff:lint expected-red.

## Current loop

| 축 | 현재 위치 | 정본 |
|---|---|---|
| Product | v0.28.0 approved · implementation pending (PATCH 1 paused) | `docs/PLAN.md` |
| Dogfood | 가짜 done·조기 close·ACK/quarantine 결함 observed | `docs/DOGFOOD_LOOP.md` · review ledgers |
| Harness | 완료 권한 계약 designed · code enforcement pending | `docs/spikes/PANE-DEATH-UNIFIED-DESIGN.md` |
| Reuse | not-proven | — |

## Current action

### SESSION-CONTINUITY Phase B — fixture V1–V6 + SOFT_CAP + lint expected-red

**Line:** topology **`single`** · execution **`current-session`** · verify **`objective-commands`** · full fallback Codex→Grok→Codex

Goal:
- 새 HANDOFF 체크포인트 템플릿을 **fixture**로 검증하고, stale D4 `SOFT_CAP` 기대를 12,750에 맞추며, live `handoff:lint` 용량 실패를 Phase B **expected-red**로 고정한다.

Expected:
- `scripts/handoff-checkpoint.test.ts` V1–V6 green
- `session-context.test.ts` D4 `SOFT_CAP=12750` green; `HARD_CAP=9500` pinned
- `bun run handoff:lint` exit 1 with `top-80 > 8192` capacity class (not treated as Phase B failure)
- `bun run session-context:lint` green

Must not change:
- Loom product production under `packages/**` or `dist/**`
- live `HANDOFF.md`, `docs/HANDOFF_ARCHIVE.md`, `AGENTS.md`, `docs/WORKFLOW.md`, `.claude/settings.json`, `scripts/session-context.ts`, `scripts/session-status.ts`
- Phase C shared-heading wiring, history move, or forcing live lint green
- PANE-DEATH PATCH 1, PLAN v0.28.0/U1–U11, front matter, CI lint promotion, ROADMAP authority, new WORKLOG

Done when:
- focused tests green; expected-red locked; `[IMPL-RESULT]` returned; no commit until `[SHIP]`

## Active checks

| Check | Deadline | Impact | Evidence |
|---|---|---|---|
| Phase B V1–V6 fixture validation | this gate | blocks Phase C | `scripts/handoff-checkpoint.test.ts` |
| SOFT_CAP stale D4 sync | this gate | unit red | `scripts/session-context.test.ts` |
| Live handoff:lint capacity red | this gate (measure only) | Phase C diet | `bun run handoff:lint` SSOT |
| Phase C atomic HANDOFF transition | after Phase B green | restore smoke | design §10 Phase C |
| PANE-DEATH PATCH 1 resume | after restore smoke | product gate | PLAN v0.28.0 |

## Owner pending

| Decision | Why owner input is needed | Safe default while pending | Evidence |
|---|---|---|---|
| Integration test flake track | multi-cause flake; track choice changes cost | keep isolation recipe; do not expand scope | HANDOFF Owner pending |
| HOOKCACHE-D-VERIFY resume | deferred cache-fix verification | leave paused until after continuity wave | design HOOKCACHE |
| RULE-ENFORCEABILITY apply | layer moves for doc-only rules | document only; no silent code enforcement | `docs/spikes/RULE-ENFORCEABILITY.md` |

## Blockers

(none)

## Invariants

- Fixture UTF-8 ≤ 8,192B; no details blocks; no completed-history block
- Exactly one each of the nine required headings; unique next gate = Phase B
- PLAN SSOT remains `docs/PLAN.md` v0.28.0; review SSOT remains `docs/plan_review.md` / ledgers
- `HARD_CAP=9500` platform pin; `SOFT_CAP=12750` policy only
- SessionStart fail-open unchanged; production path not rewired in Phase B
- Windows entry remains via Evidence only (D6)

## Evidence

- Product plan: `docs/PLAN.md` (v0.28.0 approved)
- Review: `docs/plan_review.md` (R45) · `docs/reviews/PANEDEATH-R45.md`
- Design: `docs/spikes/HANDOFF-CHECKPOINT-DESIGN.md` §4–§5 · §10–§11 · §13.1
- Lock: `docs/spikes/SESSION-CONTINUITY-PHASE-B-LOCK.md`
- Archive (not migrated yet): `docs/HANDOFF_ARCHIVE.md`
- Traps/lessons: `tasks/traps.md` · `tasks/lessons.md`
- Windows entry: `HANDOFF_WINDOWS.md`
- Live HANDOFF (parallel baseline, not replaced): `HANDOFF.md`

## Don't redo

- v0.27.0 pre-C issuer/ACK/quarantine/currency locks (R43e · `7ed314c` lineage)
- PANE-DEATH dual-route “discard branch” framing (owner: complementary, not duplicate)
- Raising `HARD_CAP` with SOFT_CAP (platform silent truncate)
- Regenerating removed `.loom-impl-0270-brief.md`
- Treating `card.done` or pane exit codes as completion authority
- Starting Phase C or PATCH 1 from this fixture wave
