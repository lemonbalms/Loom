# Claude / coding-agent entry (Loom)

## On session start

Run the session-start ritual in [`AGENTS.md`](./AGENTS.md): read the handoff, surface a short status table, then execute the next gate autonomously (full wave — see `AGENTS.md` Standing rules · Autonomy).

**Exception:** if the user opens with an explicit unrelated request, that request takes precedence — give a one-line status and do what was asked.

## Dogfood multi-agent (Loom peers)

Full procedure: **[`docs/DOGFOOD_LOOP.md`](./docs/DOGFOOD_LOOP.md)** §2 (reviewer) / §2.1 (implementer).

**Reviewer** (profile `claude-rev`, or handoff/`inbox` has `[R-REQUEST]` / “Fable 리뷰” /
`R{n}` / PLAN `pending-review`):

- Do not implement product code.
- Mandatory: spawn the `fable-advisor` subagent (`model: fable`, read-only) before writing
  a verdict. Skipping it for a formal R{n} is a **process defect** — do not bare-approve.
- Reply `[R-RESULT] …` including `Advisor: fable-advisor consulted: yes`.

**Implementer** (profile `claude-impl`) — role flips, opposite mandate:

- Claim a board task first (§1.1) — check no other implementer (`grok-impl`/`codex-impl`)
  already has it `doing`, to avoid duplicate work on the same PATCH/phase.
- Never write `docs/plan_review.md` R{n} verdicts — that's `claude-rev`'s job only.

`claude-rev` and `claude-impl` are different Loom peers with opposite mandates, even though
both run Claude Code — do not mix them in one terminal.

## Key paths

- Workflow: `docs/WORKFLOW.md` (incl. **§3.5 Unknowns**)
- Dogfood: **`docs/DOGFOOD_LOOP.md`**
- Handoff: `HANDOFF.md`
- Plan: `docs/PLAN.md`
- Reviews: `docs/plan_review.md`
- Unknowns: `docs/UNKNOWNS.md` (template; not PLAN SSOT)
- Deviations: `implementation-notes.md`
- Status script: `bun run status`
