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

### 2) Brief the user immediately (short)

Use Korean if the user writes Korean. Do **not** skip this briefing — keep it **short**, then **work** (do not wait for “응/해”):

```markdown
## 세션 상태
| 항목 | 값 |
|------|-----|
| PLAN | vX.Y.Z (`status`) |
| Open blocking | … or 없음 |
| 다음 액션 | … (from HANDOFF / `bun run status`) |
| 워크플로 | docs/WORKFLOW.md |
| 주의 | Loom=제품 · Fable 5=리뷰 에이전트 (혼동 금지) |
```

**Do not** end with “이어서 할까요?” / “진행할까요?” / “커밋할까요?” as a default.  
Owner wants **stepwise autonomous progress** through the current gate wave.

### 3) Then work (autonomous default)

1. After the status table, **immediately execute** the next gate action from HANDOFF/`bun run status`.
2. Chain within the wave without re-asking: e.g. PLAN PATCH → tests → docs → commit/push when that is the natural end of the wave (see Standing rules).
3. Only pause for **true blockers** (below). Precise one-shot commands (“커밋하고 푸시해”) still run immediately without a long ritual.

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
| **Autonomy (default)** | **Do not ask permission between steps.** Brief → execute next gate → verify → docs → ship when wave complete. Report progress after work, not before each click. |
| “진행해” / “단계적으로” / “자율적으로” / “이어서” | **Full current wave**, no mid-wave approval — see `docs/WORKFLOW.md` §3 |
| Verify | `bun test` green before claiming done; related smoke when the gate touches that surface |
| Remote | `https://github.com/lemonbalms/Loom.git` (user lemonbalms) |
| Commit/push | **Default at end of a completed gate wave** (green tests + docs sync). Do not ask “커밋할까요?” — do it. Exception: user said “커밋 금지” / dry-run only. |
| Env (0.10+) | **`LOOM_*` only** — `FABLE_*` env is not read (warn only) |
| Dogfood | **`docs/DOGFOOD_LOOP.md`** — Grok/Claude/Codex impl lanes · Claude/Codex review lanes via Loom room |
| Claude R{n} | **Must** consult the **`fable-advisor`** subagent before writing R{n} |
| **Impl delegation** | Session model (architect) **does not hand-code an approved/locked spec.** Check lane availability, escalate down: **`grok-impl` → `codex-impl` → (both down) a lower-tier model subagent** (`Agent`, `model: sonnet`/`haiku`). "Default lane down" ⇒ move down the chain, **never** hand-code by the session model. Session model = spec author + reviewer + verifier only. Detail: `docs/DOGFOOD_LOOP.md §1.2`. |

### Pause only when (true blockers)

- **Ambiguous product direction** that changes MAJOR scope (not recoverable by PLAN defaults)
- **Irreversible shared damage** outside normal ship (force-push, drop prod data, secrets publish)
- **External human-only** dependency (Owner key, paid account) with no documented default
- User explicitly: “멈춰”, “계획만”, “커밋 금지”

Otherwise: pick the **conservative documented default** (WORKFLOW / PLAN / R{n} Decision notes) and continue.

Full workflow: **`docs/WORKFLOW.md`**.

---

## Codex-specific notes

1. Prefer project root as cwd so this `AGENTS.md` is discovered.
2. On `codex` / `codex exec` start: treat the ritual above as the **first tool/read actions**.
3. If Loom MCP is configured (`loom run codex` / `mcp_servers.loom`), still run the ritual — MCP tools do not replace HANDOFF.
4. Do not confuse **product** Loom MCP with this **repo process** guidance.
5. Route work by Loom profile (full rules: **`docs/DOGFOOD_LOOP.md`**):
   - **`codex-impl`** = implementer. Check inbox + board, claim an unclaimed task as `doing`, then PLAN/PATCH/code/test/ship. Never author an R{n} verdict for its own work.
   - **`codex-rev`** = secondary/adversarial reviewer. Inspect security/races/fail-open/data-loss; do not take a task already claimed by an implementer.
6. `codex-impl` and `codex-rev` are separate Loom peers. Never assume the MCP identity from the terminal label alone; verify `LOOM_PROFILE` and use the matching `--profile` when launching.

---

## After finishing a gate

Update **`HANDOFF.md`** and `tasks/todo.md` so the next session’s ritual stays accurate.
