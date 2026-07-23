# HANDOFF — Loom

**Updated:** 2026-07-23
**Workspace:** `/Users/kyoungsiklee/projects/fable-advisor`

## One-line resume

> Loom v0.28.1 · next = **SESSION-START-DELIVERY Phase 0a→2** · rev-3 승인/구현 허용 · impl lane dispatch.

## Current loop

| Axis | Current position | Authority |
|---|---|---|
| Product | v0.28.1 release close; adapter `6e2df8a` | `docs/PLAN.md` |
| Dogfood | unblocked (protocol 17 · live 3-kind) | `HERDR-0.7.5-COMPAT.md` |
| Harness | inject ops **done**; SESSION-START DELIVERY **next**; handoff B queued | `SESSION-START-UNIFIED-PROPOSE.md` rev-3 |
| Reuse | not proven | evidence |

## Current action

### SESSION-START-DELIVERY Phase 0a→2 (owner-approved)

**Goal:** 3 CLI의 session-start 의미를 L0/AGENTS와 host adapter에 고정한다. ritual은 정본,
inject는 accelerator이며 S BEGIN/END 실패는 fail-loud다.

**Authority:** rev-3 frozen target `cc03474` · Addendum C+D · owner approval `5b14012`.
Design-approved = DELIVERY · NORMS · MAP; **implementation-authorized = DELIVERY only**.
Handoff authoring A는 DELIVERY Template A/S/R에 흡수하고, B 작성 도우미는 이 wave 뒤 queued.

**Session start:**

1. `bun run status` · `bun run handoff:check`; read rev-3 §5–§7·§9–§12 only.
2. Locked spec implementation은 `grok-impl → codex-impl` 순으로 dispatch; session architect 손코딩 금지.
3. **Phase 0a:** `docs/SESSION-START.md` L0 + AGENTS trigger split + composite lexicon rule.
4. **Phase 1–2:** S END adapter/fixtures · Codex plain wiring · Grok ritual · Template A/S/R tests.
5. Independently verify related tests + `bun test` + `handoff:check`; docs sync → commit/push.

**Line:** topology **`single`** · full chain when needed = Codex→Grok→Codex.

**Done when:** DELIVERY Phase 0a–2 shipped and fixture가 rev-3 wire/trigger 계약과 일치;
`bun test`·`handoff:check` green; NORMS/MAP implementation은 여전히 미착수.

**Must not:** architect locked-spec 손코딩; NORMS/MAP 구현; frozen rev-3 설계 재작성;
Grok SessionStart stdout을 S로 인정; S END 없는 full 판정; product/herdr/card; Phase E.

## Active checks

| Check | Deadline | Impact | Evidence |
|---|---|---|---|
| DELIVERY Phase 0a L0/trigger split | **this gate** | session SSOT | rev-3 §5.1 · §6 · §12 |
| DELIVERY Phase 1–2 adapters/tests | **this gate** | 3-host S equivalence | rev-3 §5 · §9–§10 |
| Handoff 확인 템플릿 (A) | **absorbed** | owner readability | DELIVERY Template A/S/R |
| Handoff 작성 도우미 (B) | **queued after wave** | author budget safety | `HANDOFF-AUTHORING-OPT-PROPOSE.md` |
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
- rev-3: design-approved DELIVERY/NORMS/MAP; implementation subset = **DELIVERY only** (`5b14012`).
- status = **view**; inject = **nine + traps** (model). No permanent slim-delete.
- Budget = **chars** (HARD_CAP 9500); drop = **whole section** + `inject omitted:`. Pinned: status · Current action · traps.
- Prefer raw ≤ **STATE_TARGET 7500**; ship handoff edits with `bun run handoff:check`.
- Owner brief ≠ inject dump. On `inject omitted:` → Read that section from disk.
- Fail-loud `unknown/malformed`; Open(blocking) markdown **table**.
- Topology **single** default; line ≠ lane. WP5 residual only (no warm-base re-fork). Protocol 17 / PANE-DEATH U1–U11 immutable.

## Evidence

- SESSION-START: rev-3 target `cc03474` · review C+D `3110e29` · owner approval `5b14012`.
- Handoff authoring: A absorbed by DELIVERY; B queued · `HANDOFF-AUTHORING-OPT-PROPOSE.md`.
- Inject ops: AGENTS · `handoff:check` · `inject:full` · `SESSION-INJECT-VIEW-DESIGN.md` · `359709d` · `b935969`
- Budget: `STATE_TARGET` · `fitPartsToBudget` · `22eb76e` · `240a0df`
- Product: PLAN 0.28.1 · R46 · adapter `6e2df8a` · Phase D `49b6a9d` · v1 `0001a94`
- `tasks/traps.md` · `HANDOFF_WINDOWS.md`

## Don't redo

- Permanent nine-axis slim-delete; silent **state** mid-section char-cut.
- Re-review rev-3 from scratch; implement NORMS/MAP without a new authorization decision.
- Session architect hand-code of the approved DELIVERY locked spec.
- Treat status cells as skip for Invariants / Don't redo / Evidence.
- Rely on omit instead of diet; dump full inject into owner chat.
- Expand status into second competing schema (propose D) before A/B.
- Dashboard v1 redesign from scratch; Phase B/C/D rewrite; warm-base re-spike; Phase E before ROADMAP.
- Drop fail-loud / Open table; inject full lessons into state; product/herdr without Owner track pick.
