# Claude / coding-agent entry (Loom)

## Orchestration standing rules (오너 지시 2026-07-19 — 세션 점검발)

1. **본세션(아키텍트) = 판단·게이트·디스패치·verdict만.** 코드 정독·조사·증거 팩 수집·
   독립 검증·문서 초안과 적용·스크립트 작성은 전부 서브에이전트로 위임. 본세션 직접
   수행 예외는 복잡한 판단(락 경계·아키텍처·스펙 문안·게이트 결정)과 왕복-판단이 얽힌
   라이브 프로브뿐.
2. **서브에이전트 model 명시 필수, 기본 = `opus`.** 미지정 = 본세션 모델(Fable) 조용한
   상속 = 결함. `fable`은 fable-advisor 자문뿐. (구현 레인은 종전대로 grok/codex CLI.)
3. **병렬화 기본.** 독립 태스크는 단일 메시지 다중 스폰. 정형 다단계(게이트→구현→검증
   팬아웃→스모크→docs)는 **Workflow 도구 사용 — 오너 상비 옵트인 성립(2026-07-19)**.
4. **세션 시작 리추얼에 `tasks/lessons.md` 정독 포함**(handoff만으로 부족 — 기록 교훈
   재범 2회 실증). 위임 시작 전 `fable-advisor:orchestration` 스킬 로드.

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

## Health Stack

Used by `/health` (code quality dashboard). Each also has a `bun run` alias.

- typecheck: bun run --filter '*' typecheck
- test: bun test
- lint: biome lint .
- deadcode: knip
- shell: shellcheck scripts/*.sh
