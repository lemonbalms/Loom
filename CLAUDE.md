# Claude / coding-agent entry (Loom)

## On session start

Run the session-start ritual in [`AGENTS.md`](./AGENTS.md): read the handoff, surface a short status table, then execute the next gate autonomously (full wave — see `AGENTS.md` Standing rules · Autonomy).

**Exception:** if the user opens with an explicit unrelated request, that request takes precedence — give a one-line status and do what was asked.

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

### Claude as implementer (`claude-impl` profile)

When this Claude session's Loom peer identity is **`claude-impl`** (started with
`--profile claude-impl`), the role flips: **implementer, not reviewer**.
Full rules: **[`docs/DOGFOOD_LOOP.md` §2.1](./docs/DOGFOOD_LOOP.md#21-claude-code--as-implementer-claude-impl-profile)**.

1. Claim a board task first (§1.1) — check no other implementer (`grok-impl`)
   already has it `doing`, to avoid duplicate work on the same PATCH/phase.
2. Draft PLAN.md / apply PATCH lock rows / write product code / test / commit / push.
3. Handoff `[R-REQUEST]` to `@claude-review` (+ `@codex-review` if security-relevant).
4. Never write `docs/plan_review.md` R{n} verdicts — that's `claude-rev`'s job only.

A `claude-rev` session and a `claude-impl` session are different Loom peers with
opposite mandates, even though both run Claude Code — do not mix them in one terminal.

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
