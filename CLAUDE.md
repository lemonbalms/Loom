# Claude / coding-agent entry (Loom)

@AGENTS.md

> Claude Code loads `CLAUDE.md`, not `AGENTS.md` by default. The import above pulls project agent norms into every session (SESSION-START-UNIFIED rev-1 · vendor A3). Claude-specific orchestration continues below.

## Orchestration standing rules (오너 지시 2026-07-19 — 세션 점검발)

1. **Topology `full`에서 본세션(아키텍트) = 판단·게이트·디스패치·verdict만.** 코드 정독·조사·증거 팩 수집·
   독립 검증·문서 초안과 적용·스크립트 작성은 전부 서브에이전트로 위임. 본세션 직접
   수행 예외는 복잡한 판단(락 경계·아키텍처·게이트 결정)과 왕복-판단이 얽힌 라이브
   프로브뿐. **Topology `single`은 예외가 아니라 별도 실행형**으로, 현재 세션이 bounded 구현 +
   objective-command 검증 + ship을 접는다(DOGFOOD §0.5). **Full에서 PLAN 등 장문 문서도 4단 분업**: 본세션 압축 결정 목록(판단) → opus
   서브에이전트가 선례 형식으로 문안 확장·파일 작성(볼륨) → 본세션 1회 검수(락-인접
   문구는 직접 교정 필수 — R35 M-1이 문안 오류발 M이었음) → R{n} 게이트.
2. **서브에이전트 model 명시 필수, 기본 = `opus`.** 미지정 = 본세션 모델(Fable) 조용한
   상속 = 결함. `fable`은 fable-advisor 자문뿐. (구현 레인은 종전대로 grok/codex CLI.)
3. **병렬화 기본.** 독립 태스크는 단일 메시지 다중 스폰. 정형 다단계(게이트→구현→검증
   팬아웃→스모크→docs)는 **Workflow 도구 사용 — 오너 상비 옵트인 성립(2026-07-19)**.
4. **세션 시작 리추얼에 `tasks/lessons.md`(인덱스) 정독 + 작업 유형 매칭 카테고리는
   착수 전 로드 의무**(`tasks/lessons/<category>.md` — handoff만으로 부족, 기록 교훈
   재범 2회 실증). 위임 시작 전 `fable-advisor:orchestration` 스킬 로드.
5. **Topology `full` 레인 배치 고정 (오너 지시 2026-07-20 — 구두 반복 4회발, 이제 규칙).**
   **구현 = `grok`** · **검증 = `codex`** · **자문 = `fable-advisor`**(read-only).
   검증을 구현자와 같은 레인에 주지 않는다 — 발견자와 수정자를 분리해야 교차 검증이 성립한다.
   **실작업 표면 = herdr pane 카드가 기본**이고 in-harness `Agent`는 pane 불가 시 폴백이다.
   조사·브리프 작성도 예외가 아니다(2026-07-20 오라우팅 실증). 디스패치 전
   **`docs/DOGFOOD_LOOP.md` §1.1 claim**(`board set doing` + `board assign`) 선행 의무 —
   생략 시 3 구현자 중복 착수 위험. 디스패처 신원은 로스터의 `claude-impl`(M-1 allowlist
   등록분), `mac-node`로 쏘면 브릿지가 M-1 deny한다.
6. **워커 감시는 `scripts/watch-card.ts`를 쓴다 — 임시 셸 스크립트 금지.**
   손으로 짠 감시는 2026-07-20에 **3연속 서로 다른 구멍**을 냈다(마커만 봄 → pane 소멸 뺌 →
   bash 3.2 연관배열 미지원으로 즉사하며 "35분 경과" **거짓 성공** 보고). `watch-card`는
   종료 사유를 exit code로 구분한다: `marker`=0 · `pane-gone`=1 · `limit`=2 · `timeout`=3.
   **완주와 사망을 같은 코드로 뭉개지 마라** — 그것이 거짓 성공의 근원이다.
7. **`card.done` 수신 ≠ 완료. 산출물은 아키텍트가 워킹트리에서 독립 검증해야 확정된다.**
   2026-07-20 가짜 done 2건 실증(codex TUI 초기화면 스크레이프 · `Working` 중 발행).
   **인과 주의(codex 교차검증 정정)**: pane이 죽어서 가짜 done이 나는 것이 아니라, **브릿지가
   완료 후보를 너무 일찍 `done`으로 커밋하고 그 결과로 `pane.close`를 호출**한다
   (`finishCard()` — `bridge-runtime.ts:2310-2323`). 따라서 **종료 코드·시그널만으로 실패를
   판정하지 마라**: 정상 cleanup에서도 exit 129/SIGKILL이 나온다(오늘 215·217은 `status=done`
   result 전송 뒤 106ms/4ms 만의 정상 정리였다). `PaneDied for unknown pane`은 **herdr 내부
   경고**이지 브릿지가 통지를 버렸다는 증거가 아니다 — 이 오독으로 아키텍트가 오늘 잘못된
   진단을 오너에게 보고했다. 설계 정본 `docs/spikes/PANE-DEATH-DESIGN.md`.

## On session start

**L0:** [`docs/SESSION-START.md`](./docs/SESSION-START.md). Ritual entry: AGENTS (imported above).

Run: `bun run status`, restore HANDOFF nine + traps + lessons index if SessionStart inject incomplete (need **BEGIN+matching END** per part), then brief the owner.

- Explicit **상태** / **핸드오프 확인해** → Template **S** / **A** only (**no** auto-wave).
- Explicit **이어서** / **진행해** / **단계적으로** / cold start with no read-only trigger → Template **R** (full wave — Autonomy).
- Composite “상태 확인하고 이어서 해” → Template **S** then **R** (ordered).
- Inject is an accelerator; **ritual is SSOT** if envelopes/sentinels are missing. Grok SessionStart stdout ≠ S full.
- N outer/pack envelopes are missing or incomplete → run `bun run norms:raw`; omission/head-tail marker means UNVERIFIED. Claude alone has the measured N accelerator; Codex/Grok use this ritual.

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
- Inject budget: `bun run handoff:budget` (draft) · `bun run session-context:lint` · ship: `bun run handoff:check` · guide: `docs/HANDOFF-AUTHORING.md`
- Inject design: `docs/spikes/SESSION-INJECT-VIEW-DESIGN.md`

## Health Stack

Used by `/health` (code quality dashboard). Each also has a `bun run` alias.

- typecheck: bun run --filter '*' typecheck
- test: bun test
- lint: biome lint .
- deadcode: knip
- shell: shellcheck scripts/*.sh
