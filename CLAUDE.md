# Claude / coding-agent entry (Loom)

## On session start

**Always** run the session-start ritual in [`AGENTS.md`](./AGENTS.md):

1. Read `HANDOFF.md` + `docs/WORKFLOW.md` + PLAN/plan_review headers  
   (or run `bun run status`).
2. **Surface a short status table to the user** (do not skip this).
3. Then wait for confirmation or follow their explicit command.

Do not bury the handoff; the user should see **where the project is** and **what the next gate is** on entry.

## Codex

OpenAI **Codex CLI** loads root **`AGENTS.md`** natively (same ritual).  
No separate CODEX.md required; keep AGENTS.md authoritative for both.

## Key paths

- Workflow: `docs/WORKFLOW.md`
- Handoff: `HANDOFF.md`
- Plan: `docs/PLAN.md`
- Reviews: `docs/plan_review.md`
- Deviations: `implementation-notes.md`
- Status script: `bun run status`
