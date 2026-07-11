# Lessons (agent self-improvement)

## 2026-07-10 — Autonomy, not approval-gated steps

**Mistake:** After each gate (design done, PATCH done, tests green) the implementer asked the Owner “이어서 할까요?” / “커밋할까요?” and stalled.

**Rule:** Owner wants **stepwise autonomous progress**. Status brief → execute next gate → chain the wave → commit/push at natural end. **Do not** ask permission between routine steps.

**Pause only for:** MAJOR product ambiguity, irreversible shared damage, human-only secrets/accounts, or explicit “멈춰 / 계획만 / 커밋 금지”.

**Where encoded:** `AGENTS.md` Standing rules · Autonomy; `docs/WORKFLOW.md` 「진행해」; `CLAUDE.md` session start; `HANDOFF.md` session entry.

## 2026-07-11 — Delegation split: cheap model edits, session model verifies

**Pattern (Owner-directed):** For bulk mechanical work (doc edits, boilerplate), spawn Sonnet subagents to apply changes; the session model (Fable) reviews the diffs itself afterward. Owner stated this explicitly mid-task ("편집은 sonnet5 서브에이전트, 확인은 현재 세션 모델").

**Also:** self-edits to `~/.claude/CLAUDE.md` that widen agent permissions get classifier-denied even when in-conversation approval exists — stop, surface the exact edit, and retry only after the Owner re-approves in their own words.

## 2026-07-11 — Verify provenance before calling a config change a bug

**Mistake:** After the GSD Core install, `statusLine` had changed; I claimed the installer "silently clobbered" the user's setting, reverted it, and put the claim in an upstream issue draft. In fact the installer had prompted (with a keep-existing option) and the Owner had chosen the change deliberately.

**Rule:** When a config/file differs from what I expect after a tool ran interactively for the user, ask what they chose before attributing it to the tool — and never revert a setting the Owner may have just picked without checking.
