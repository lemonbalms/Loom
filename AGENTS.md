# Agent instructions — Loom

> **Codex CLI:** This file is the project instruction source Codex loads before work  
> (`AGENTS.md` discovery — OpenAI Codex). **Claude:** also see `CLAUDE.md`.  
> **All agents:** session-start ritual is mandatory.

---

## Session start ritual (mandatory)

On the **first turn of a new session** (or when the user says “이어서”, “진행해”, “핸드오프”, “상태”, “status”), **before** large implementation:

컨텍스트에 `[LOOM-SESSION-CONTEXT` 센티널이 보이면 아래 표의 ①status·②HANDOFF·
③lessons 인덱스 읽기는 **주입으로 대체됨 — 생략**한다(카테고리 lessons 로드·WORKFLOW
grep은 종전대로). 센티널이 없으면(훅 실패·Codex CLI 등 무훅 환경) 아래 v2 표 전체가 정본.

아키텍트 세션 bootstrap 주입(SessionStart stdout 주입)과 브릿지 워커 hook-sensor
(stdout 비움·소켓 송신)는 **반대 규약** — 혼동 금지.

### 1) Read — **v2 부분-읽기 관례 (오너 승인 2026-07-19: "덜 읽기"가 정답)**

먼저 실행 (LLM 0원 결정론 파서 — 상태표의 SSOT):

```bash
bun run status
```

그 다음 읽기는 **부분만**:

| # | What | How (v2) | Why |
|---|------|----------|-----|
| 1 | `HANDOFF.md` **전문** | canonical nine sections (`One-line resume` → `Don't redo`)만 읽는다(≤8,192B; 완료 이력·`<details>` 없음) | Current loop, one gate, checks, owner pending, invariants, evidence, don't-redo |
| 1b | `tasks/traps.md` **두 섹션** | `활성 함정` + `하지 말 것` 부분 읽기 (자동 주입이 없을 때 필수) | HANDOFF 밖의 gate safety knowledge |
| 2 | `tasks/lessons.md` (인덱스) | 인덱스 정독 + 작업 유형 매칭 카테고리는 착수 전 `tasks/lessons/<category>.md` 로드 (CLAUDE.md standing rules 4 — 재범 방지) | 기록 교훈 |
| 3 | `docs/WORKFLOW.md` | **전문 읽기 폐지** — 게이트 판단 시점에 해당 §만 grep (§5.1 표 등) | 필요 시점 로드 |
| 4 | `docs/PLAN.md` / `docs/plan_review.md` | `bun run status` 출력으로 대체 — 헤더 재독 불요, 본문은 게이트 판단 시 해당 섹션만 | Version·Status·Open |

Optional: `implementation-notes.md` (Deviations) if touching rename/compat/security.  
Optional: `docs/UNKNOWNS.md` if PLAN is **MINOR** / `pending-review` / new surface (see WORKFLOW §3.5).

대형 웨이브 예고 시(핸드오프에 R{n}·MINOR·새 표면): 부속 문서(plan_review 락 계보·UNKNOWNS 등)
선요약은 리추얼이 아니라 **웨이브 준비의 증거 팩 수집**으로 — opus 서브에이전트 위임
(CLAUDE.md Orchestration standing rules 1). 리추얼 자체는 에이전트 스폰 없이 위 부분-읽기로
끝낸다(스폰 레이턴시·요약 손실 리스크 > 절감 — 검토 2026-07-19).

### 2) Brief the user immediately (short)

Use Korean if the user writes Korean. Do **not** skip this briefing — keep it **short**, then **work** (do not wait for “응/해”):

```markdown
## 세션 상태
| 항목 | 값 |
|------|-----|
| PLAN | vX.Y.Z (`status`) |
| Open blocking | … or 없음 |
| 다음 액션 | … (from HANDOFF / `bun run status`) |
| 작업 라인 | HANDOFF Default: **topology** (`full`/`single`) + **vendor chain** (Codex/Claude/Grok/Other) |
| 워크플로 | docs/WORKFLOW.md |
| 주의 | Loom=제품 · Fable 5=리뷰 에이전트 (혼동 금지) |
```

`작업 라인`(**line**)은 구현자 하나가 아니라 **orchestrator → implementation → verification/advice 전체 연결**이다. **lane**은 그 line 안의 역할 자리(`grok-impl` 등)다. 선택은 **축 A 벤더 체인 × 축 B 토폴로지**(`full` = 역할 분리 교차검증 · `single` = 한 세션 구현+명령검증; 검증 생략 아님). 정의·승격 규칙 SSOT = `docs/DOGFOOD_LOOP.md` §0.5. 사용자가 새로 고르지 않으면 HANDOFF 승계 Default로 즉시 진행하고, 선택지는 작업 시작 전 브리핑 표로 보여준다.

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
| **Next-action test** | When **self-choosing** the next action, first answer *"if this fails, what do I newly learn?"* An action that **cannot fail** (already-green re-run, owner-blocked wait, doc-sync paperwork) is **disqualified** as a next action. Cross-check HANDOFF's "don't redo / already shipped" list, then pick the **scariest still-verifiable** check. Before deferring to an owner blocker, state in one line what is verifiable **without** that blocker — and do that first. |
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
   - **`codex-arch`** = architect. PLAN/spec, route locked work to `grok-impl`, review and independently verify. Never claim or hand-code locked-spec product implementation.
   - **`codex-impl`** = fallback implementer. Check inbox + board, claim an unclaimed locked task as `doing`, then code/test/docs/ship. Never author an R{n} verdict for its own work.
   - **`codex-rev`** = secondary/adversarial reviewer. Inspect security/races/fail-open/data-loss; do not take a task already claimed by an implementer.
6. `codex-arch`, `codex-impl`, and `codex-rev` are separate Loom peers. Never assume the MCP identity from the terminal label alone; verify `LOOM_PROFILE` and use the matching `--profile` when launching.
7. **Codex → Grok headless subagent invocation (canonical):** when `codex-arch` routes a
   locked implementation to Grok outside the unavailable pane lane, put the complete
   five-part spec in a file and invoke exactly:

   ```bash
   grok --prompt-file "$SPEC" -m grok-4.5 --permission-mode acceptEdits \
     --output-format plain --cwd "$(pwd)" > "$OUT" 2>&1
   ```

   Implementation uses `acceptEdits` **without `--sandbox`**. Never add
   `--always-approve`; Codex must inspect the diff and rerun verification independently.
   For read-only Grok verification, use the separate kernel-enforced form
   `--permission-mode dontAsk --sandbox read-only`. Prefer an external 600-second
   `gtimeout` wrapper when available. `grok agent headless` is not the repo workflow;
   the top-level `--prompt-file` form is the subagent entry point. Canonical upstream
   detail: `~/.claude/plugins/cache/fable-advisor/fable-advisor/3.1.0/agents/grok-implementer.md`.
   Do not mistake the first plain-output progress line for completion: wait for process
   exit, then inspect Grok's saved session/diff. Under `acceptEdits`, an approval-prone
   `run_terminal_command` can be cancelled headlessly and cancel sibling parallel tool
   calls; make the spec prefer dedicated read/search/edit tools and simple verification
   commands, while Codex remains the independent verification authority.

---

## After finishing a gate

Update **`HANDOFF.md`** and `tasks/todo.md` so the next session’s ritual stays accurate.
