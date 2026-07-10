# Agent instructions — Loom

> **Codex CLI:** This file is the project instruction source Codex loads before work  
> (`AGENTS.md` discovery — OpenAI Codex). **Claude:** also see `CLAUDE.md`.  
> **All agents:** session-start ritual is mandatory.

---

## Session start ritual (mandatory)

On the **first turn of a new session** (or when the user says “이어서”, “진행해”, “핸드오프”, “상태”, “status”), **before** large implementation:

### 1) Read (in order)

| # | File | Why |
|---|------|-----|
| 1 | `HANDOFF.md` | Current gate, next action, traps |
| 2 | `docs/WORKFLOW.md` | Plan → Review → Implement → Ship (+ §3.5 Unknowns) |
| 3 | `docs/PLAN.md` (header) | Version + Status |
| 4 | `docs/plan_review.md` (header + Open) | Blocking reviews |

Optional: `implementation-notes.md` (Deviations) if touching rename/compat/security.  
Optional: `docs/UNKNOWNS.md` if PLAN is **MINOR** / `pending-review` / new surface (see WORKFLOW §3.5).

**Or run** (fast path for Codex/shell):

```bash
bun run status
```

### 2) Brief the user immediately

Use Korean if the user writes Korean. Do **not** skip this briefing:

```markdown
## 세션 상태
| 항목 | 값 |
|------|-----|
| PLAN | vX.Y.Z (`status`) |
| Open blocking | … or 없음 |
| 다음 액션 | … (from HANDOFF / `bun run status`) |
| 워크플로 | docs/WORKFLOW.md |
| 주의 | Loom=제품 · Fable 5=리뷰 에이전트 (혼동 금지) |

이어서 할까요? (예: R12 리뷰 / 구현 / 커밋 푸시)
```

### 3) Then work

Do not start a large feature until the briefing is delivered, unless the user gave a single precise command (e.g. only “커밋하고 푸시해”).

---

## Standing rules

| Topic | Rule |
|-------|------|
| Product | **Loom** — CLI `loom`, packages `@loom/*` |
| Review agent | **fable-advisor / Fable 5** ≠ product |
| Plan SSOT | `docs/PLAN.md` |
| Reviews | `docs/plan_review.md` R{n}; **when Fable 5 required → `docs/WORKFLOW.md` §5.0–5.1** |
| Author-close | Low only + label `(author-close, Low backlog)` + Changelog provenance |
| Deviations | `implementation-notes.md` → **Deviations** (pick conservative option) |
| Unknowns | `docs/WORKFLOW.md` §3.5 + `docs/UNKNOWNS.md` — MINOR/new surface before R{n}; not a PLAN SSOT |
| “진행해” | Next gate step → `bun test` → docs sync → often commit/push |
| Verify | `bun test` green before claiming done |
| Remote | `https://github.com/lemonbalms/Loom.git` (user lemonbalms) |
| Env (0.10+) | **`LOOM_*` only** — `FABLE_*` env is not read (warn only) |

Full workflow: **`docs/WORKFLOW.md`**.

---

## Codex-specific notes

1. Prefer project root as cwd so this `AGENTS.md` is discovered.
2. On `codex` / `codex exec` start: treat the ritual above as the **first tool/read actions**.
3. If Loom MCP is configured (`loom run codex` / `mcp_servers.loom`), still run the ritual — MCP tools do not replace HANDOFF.
4. Do not confuse **product** Loom MCP with this **repo process** guidance.

---

## After finishing a gate

Update **`HANDOFF.md`** and `tasks/todo.md` so the next session’s ritual stays accurate.
