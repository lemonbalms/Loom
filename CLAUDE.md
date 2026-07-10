# Claude / coding-agent entry (Loom)

## On session start

**Always** run the session-start ritual in [`AGENTS.md`](./AGENTS.md):

1. Read `HANDOFF.md` + `docs/WORKFLOW.md` + PLAN/plan_review headers  
   (or run `bun run status`).
2. **Surface a short status table to the user** (do not skip this).
3. **Then execute the next gate immediately** — do **not** wait for “이어서 할까요?”.  
   Autonomy default: full wave (work → test → docs → commit/push) without mid-step approval.  
   See **`AGENTS.md` Standing rules · Autonomy**.

Do not bury the handoff; the user should see **where the project is** and **what the next gate is** on entry — then keep moving.

## Dogfood multi-agent (Claude as reviewer)

Full loop: **[`docs/DOGFOOD_LOOP.md`](./docs/DOGFOOD_LOOP.md)**.

When this Claude session is the **reviewer** (profile `claude-rev`, or handoff/`inbox` contains
`[R-REQUEST]` / “Fable 리뷰” / `R{n}` / PLAN `pending-review`):

1. **Do not implement** product code.
2. **Mandatory:** run **`/advisor fable`** (Claude Code advisor with **Fable** model),  
   or spawn the **`fable-advisor`** subagent (`model: fable`, read-only).
3. Only then write **`docs/plan_review.md`** Review R{n} (WORKFLOW §5.2).
4. Reply via Loom handoff: `[R-RESULT] …` (include `Advisor: /advisor fable consulted: yes`).

Skipping `/advisor fable` for a formal R{n} is a **process defect** — do not bare-approve.

Requires plugin: `fable-advisor` (`claude plugin install fable-advisor`).

## Codex

OpenAI **Codex CLI** loads root **`AGENTS.md`** natively (same ritual).  
No separate CODEX.md required; keep AGENTS.md authoritative for both.  
Codex does **not** use `/advisor fable` (Claude-only); see DOGFOOD_LOOP §3.

## Key paths

- Workflow: `docs/WORKFLOW.md` (incl. **§3.5 Unknowns**)
- Dogfood: **`docs/DOGFOOD_LOOP.md`**
- Handoff: `HANDOFF.md`
- Plan: `docs/PLAN.md`
- Reviews: `docs/plan_review.md`
- Unknowns: `docs/UNKNOWNS.md` (template; not PLAN SSOT)
- Deviations: `implementation-notes.md`
- Status script: `bun run status`
