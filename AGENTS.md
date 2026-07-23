# Agent instructions — Loom

> **Codex CLI:** This file is the project instruction source Codex loads before work  
> (`AGENTS.md` discovery — OpenAI Codex). **Claude:** also see `CLAUDE.md`.  
> **All agents:** session-start ritual is mandatory.

---

## Session start ritual (mandatory)

**L0 SSOT:** [`docs/SESSION-START.md`](./docs/SESSION-START.md) (triggers · templates · host matrix).  
This section is the L1 entry; do not diverge on trigger masks.

### When this ritual runs

| Owner utterance | Template | Wave? | Notes |
|-----------------|----------|:-----:|-------|
| **상태** / `status` | **S** | **no** | status table only |
| **핸드오프 확인해** | **A** | **no** | status + Gate brief + handoff:check line |
| **이어서** / **진행해** / **자율적으로** / **단계적으로** | **R** | **yes** | brief → Current action |
| First turn, no explicit trigger | **R** | **yes** | cold start default |
| “상태 확인하고 이어서 해” | **S then R** | yes after S | composite — not a conflict |
| **멈춰** / **계획만** / **커밋 금지** | masks | per L0 | higher precedence than continue |

**Must not:** treat bare **상태** / **status** as a wave trigger (F5).

On Template **R** turns (and cold start), **before** large implementation:

컨텍스트에 `[LOOM-SESSION-CONTEXT` 센티널 **BEGIN+matching END** 가 보이면 아래 표의
①status·②HANDOFF 9섹션·③lessons 인덱스는 **주입으로 대체됨 — 생략**한다(카테고리
lessons 로드·WORKFLOW grep은 종전대로). Hook inject = **Dashboard 표(뷰)** +
**nine HANDOFF sections(모델)** + traps — 표는 요약 뷰일 뿐 축 삭제가 아니다
(`docs/spikes/SESSION-INJECT-VIEW-DESIGN.md`). END 부재·omit/truncation 표식 →
S ≠ full → ritual 복구.

On Template **S** / **A** turns: run status (and Template A extras) only — **no** auto-wave.

**Inject 채널 vs 오너 보고 (섞지 말 것):**

| 채널 | 시점 | 소비자 | 하는 일 |
|------|------|--------|---------|
| SessionStart inject | 세션 켜질 때 | 에이전트 | 9축+traps 복구 (콜드스타트↓) |
| `bun run status` / “핸드오프 확인해” | 대화 중 | 오너 | **표만** 보고 — inject 전문 덤프 금지 |

센티널 본문에 `inject omitted:` 가 보이면 해당 섹션을 **파일에서 Read** 한다(문맥 복구).  
대형 웨이브·락 인접은 inject만 믿지 말고 HANDOFF 해당 섹션을 한 번 더 연다.  
센티널이 없으면(훅 실패·Codex CLI 등 무훅) 아래 v2 표 전체가 정본(HANDOFF nine 부분 읽기).

아키텍트 세션 bootstrap 주입(SessionStart stdout 주입)과 브릿지 워커 hook-sensor
(stdout 비움·소켓 송신)는 **반대 규약** — 혼동 금지.

### 1) Read — **v2 부분-읽기 관례 (오너 승인 2026-07-19: "덜 읽기"가 정답)**

먼저 실행 (LLM 0원 결정론 파서 — 상태표의 SSOT):

```bash
bun run status
```

컨텍스트에 `[LOOM-NORMS-BEGIN v1]`부터 outer END와 세 pack의 BEGIN/body/END가 모두
보이지 않으면 `bun run norms:raw`를 모델 가시 경로에서 실행해 N을 복구한다. omission/head-tail
표식이 있으면 marker가 모두 보여도 UNVERIFIED다. Template S/A의 read-only 보고는 가능하지만,
Template R의 자율 commit/push 전에는 N을 복구한다. Claude만 예산 검증된 SessionStart N
accelerator를 사용하며 Codex/Grok은 ritual이 정본이다.

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
(run `bun run status` — do not invent a second table)

## Loom · session
| Key | Value |
|-----|--------|
| Product | vX.Y.Z · `approved` |
| Review | R{n} · open **없음** |
| Gate | … (Current action ### title only) |
| Line | topology **single|full** · chain … |
| Loop | P… · D… · H… · R… |
| Blockers | (none) |
| Owner | … |
| Don't | … |
| Health | handoff:lint ✓ · parse ✓ |
```

브리핑 표 **스키마 SSOT = `bun run status` 출력**(Dashboard v1 · `scripts/session-status.ts`). 에이전트는 status를 실행해 그대로 보여 주고, 행을 재작성·장문 붙이지 않는다. **두 번째 status 표를 만들지 말 것** — 표는 정보 집합을 줄이는 것이 아니라 **같은 사실의 간결 뷰**. **line** = 전체 역할 연결 · **lane** = 그 안의 피어. 정의 = `docs/DOGFOOD_LOOP.md` §0.5. 무선택 시 HANDOFF Default로 즉시 진행.

**Do not** end with “이어서 할까요?” / “진행할까요?” / “커밋할까요?” as a default.  
Owner wants **stepwise autonomous progress** through the current gate wave.

### 3) Then work (Template **R** only — autonomous default)

**Skip this section** for Template **S** / **A** (read-only). After those templates, stop.

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
| **Inject ops** | Default = **all nine HANDOFF axes + traps** in state inject. Concision = HANDOFF diet (tables/bullets), not permanent slim-delete. While drafting: `bun run handoff:budget`. After HANDOFF/traps edits: `bun run session-context:lint` — **omitted must be (none)**; prefer raw ≤ `STATE_TARGET` 7500 (warn). Owner brief = `bun run status` only. Guide: `docs/HANDOFF-AUTHORING.md` · design: `docs/spikes/SESSION-INJECT-VIEW-DESIGN.md` |
| **HANDOFF ship check** | Before claiming handoff/docs wave done: `bun run handoff:check` (= `handoff:lint` + `session-context:lint`). Draft with `bun run handoff:budget`. |
| Remote | `https://github.com/lemonbalms/Loom.git` (user lemonbalms) |
| Commit/push | **Default at end of a completed gate wave** (green tests + docs sync). Do not ask “커밋할까요?” — do it. Exception: user said “커밋 금지” / dry-run only. |
| Env (0.10+) | **`LOOM_*` only** — `FABLE_*` env is not read (warn only) |
| Dogfood | **`docs/DOGFOOD_LOOP.md`** — Grok/Claude/Codex impl lanes · Claude/Codex review lanes via Loom room |
| Claude R{n} | **Must** consult the **`fable-advisor`** subagent before writing R{n} |
| **Impl delegation** | Execution routing SSOT = `docs/DOGFOOD_LOOP.md §0.5`. **`single`** = bounded current session implements + objective-command verifies + ships; lockedness alone does not force delegation. **`full`** = architect routes approved/locked product implementation down **`grok-impl` → `codex-impl` → lower-tier** and independently verifies (§1.2). New unresolved product/security/trust decisions promote `single` → `full`. |

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
   - **`codex-arch`** = architect under topology `full`: PLAN/spec, route locked product work to an impl lane, review and independently verify. Under `single`, the current Codex session folds bounded implementation + objective-command verification per DOGFOOD §0.5 without worker dispatch.
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
