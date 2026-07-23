# HANDOFF — Loom

**Updated:** 2026-07-23
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> Loom v0.28.1 · next = **Handoff 확인·작성 최적화** (propose A→B) · inject ops green · `bun run status`.

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | v0.28.1 release close; adapter `6e2df8a` | `docs/PLAN.md` |
| Dogfood | unblocked (protocol 17 · live 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | inject ops **done**; handoff UX/authoring **next** | `SESSION-INJECT-VIEW-DESIGN.md` · propose below |
| Reuse | not proven | evidence |

## Current action

### Handoff 확인·작성 최적화 (propose A→B)

**Goal:** 오너 **확인**은 표로 읽고, 에이전트 **작성**은 9축·예산을 지키게 — 문맥 손실 없이.

**Propose (권고 채택):** `docs/spikes/HANDOFF-AUTHORING-OPT-PROPOSE.md`  
- **A (S):** “핸드오프 확인해” 응답 템플릿 = `bun run status` + Gate/Done/Must not 짧은 해석. inject 메트릭·해시 나열 금지(요청 시만).  
- **B (M):** 작성 도우미 — 섹션 예산 요약 커맨드/체크리스트 SSOT (기존 `session-context:lint`·`handoff:check` 위에).  
- **C:** A/B에 포함. **D** status 스키마 확장 = 1차 비권장.

**Session start:**

1. `bun run status` · `bun run handoff:check` (inject:full · omitted none).
2. Topology **`single`**. Read propose spike · implement **A then B**.
3. Verify: 확인 응답 샘플 + lint green · raw ≤ STATE_TARGET preferred.
4. Docs (AGENTS if template) → HANDOFF update → commit/push.

**Line:** topology **`single`** · full chain when needed = Codex→Grok→Codex.

**Done when:** A+B shipped; propose spike status → done/superseded; `handoff:check` green; owner-facing check path is table-first.

**Must not:** slim-delete nine axes; second status schema (D); product/herdr/card; Phase E; WP5 warm-base re-fork; dump full inject into owner chat; silent state mid-section cut.

## Active checks

| Check | Deadline | Impact | Evidence |
|---|---|---|---|
| Handoff 확인 템플릿 (A) | **this gate** | owner readability | propose spike · AGENTS |
| Handoff 작성 도우미 (B) | **this gate** | author budget safety | `handoff:check` · lint table |
| Inject ops (nine · omit · STATE_TARGET · handoff:check) | **done** | restore model | `b935969` · `240a0df` · `22eb76e` |
| Owner product track | after this gate | WP5-f / product / idle | Owner pending |

## Owner pending

| Decision | Why | Safe default | Evidence |
|---|---|---|---|
| After handoff-opt: WP5-followup / product / idle | product direction | **idle** until pick | todo · HOOK-CACHE |
| Integration-test flake | cost/scope | isolation recipe | todo |
| HOOKCACHE-D-VERIFY | with WP5-followup | paused | `HOOK-CACHE-FIX-DESIGN.md` |
| RULE-ENFORCEABILITY | product | document only | spike |

## Blockers

(none)

## Invariants

- HANDOFF: nine headings; D1 ≤8192B; no `<details>`; owns next gate.
- status = **view**; inject = **nine + traps** (model). No permanent slim-delete.
- Budget = **chars** (HARD_CAP 9500); drop = **whole section** + `inject omitted:`. Pinned: status · Current action · traps.
- Prefer raw ≤ **STATE_TARGET 7500**; ship handoff edits with `bun run handoff:check`.
- Owner brief ≠ inject dump. On `inject omitted:` → Read that section from disk.
- Fail-loud `unknown/malformed`; Open(blocking) markdown **table**.
- Topology **single** default; line ≠ lane. WP5 residual only (no warm-base re-fork). Protocol 17 / PANE-DEATH U1–U11 immutable.

## Evidence

- Propose: `docs/spikes/HANDOFF-AUTHORING-OPT-PROPOSE.md` (A→B)
- Inject ops: AGENTS · `handoff:check` · `inject:full` · `SESSION-INJECT-VIEW-DESIGN.md` · `359709d` · `b935969`
- Budget: `STATE_TARGET` · `fitPartsToBudget` · `22eb76e` · `240a0df`
- Product: PLAN 0.28.1 · R46 · adapter `6e2df8a` · Phase D `49b6a9d` · v1 `0001a94`
- `tasks/traps.md` · `HANDOFF_WINDOWS.md`

## Don't redo

- Permanent nine-axis slim-delete; silent **state** mid-section char-cut.
- Treat status cells as skip for Invariants / Don't redo / Evidence.
- Rely on omit instead of diet; dump full inject into owner chat.
- Expand status into second competing schema (propose D) before A/B.
- Dashboard v1 redesign from scratch; Phase B/C/D rewrite; warm-base re-spike; Phase E before ROADMAP.
- Drop fail-loud / Open table; inject full lessons into state; product/herdr without Owner track pick.
