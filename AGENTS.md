# Agent instructions — Loom

This file is loaded (or should be read) at **session entry**. Follow it before inventing a plan from scratch.

## Session start ritual (mandatory)

On the **first turn of a new session** (or when the user says “이어서”, “진행해”, “핸드오프”, “상태”), **before** large implementation:

1. **Read** (in order):
   - `HANDOFF.md` — current gate, next step, traps
   - `docs/WORKFLOW.md` — Plan → Review → Implement → Ship rules
   - `docs/PLAN.md` header only (Version + Status)
   - `docs/plan_review.md` header + Open (blocking) table
2. **Optionally** skim `implementation-notes.md` Deviations if the next task touches rename/compat/security.
3. **Tell the user immediately** (Korean if they write Korean) a short **status briefing**:

```markdown
## 세션 상태
| 항목 | 값 |
|------|-----|
| PLAN | vX.Y.Z (`status`) |
| Open blocking | … or 없음 |
| 다음 액션 | … (from HANDOFF) |
| 워크플로 | docs/WORKFLOW.md |
| 주의 | naming: Loom=제품, Fable 5=리뷰 에이전트 |

이어서 할까요? (예: R12 리뷰 / 구현 / 커밋 푸시)
```

4. **Do not** start a big feature until that briefing is delivered, unless the user already gave a precise command (e.g. only “커밋하고 푸시해”).

## Standing rules

| Topic | Rule |
|-------|------|
| Product name | **Loom** (`loom`, `@loom/*`) |
| Review agent | **fable-advisor / Fable 5** ≠ product |
| Plan SSOT | `docs/PLAN.md` |
| Reviews | `docs/plan_review.md` (target version required) |
| Deviations | `implementation-notes.md` → Deviations (conservative choice) |
| User “진행해” | Next gate step → test → docs → often commit/push |
| Verify | `bun test` green before claiming done |
| Remote | `https://github.com/lemonbalms/Loom.git` |

Full detail: **`docs/WORKFLOW.md`**.

## After finishing a gate

Update **`HANDOFF.md`** (and `tasks/todo.md`) so the *next* session’s ritual stays accurate.
