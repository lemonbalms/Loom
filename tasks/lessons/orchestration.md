# Lessons — orchestration

위임·model 명시·autonomy·next-action 테스트·PLAN 분업·오너 레인 지시. 인덱스는 `tasks/lessons.md`.

## 2026-07-10 — Autonomy, not approval-gated steps

**Mistake:** After each gate (design done, PATCH done, tests green) the implementer asked the Owner “이어서 할까요?” / “커밋할까요?” and stalled.

**Rule:** Owner wants **stepwise autonomous progress**. Status brief → execute next gate → chain the wave → commit/push at natural end. **Do not** ask permission between routine steps.

**Pause only for:** MAJOR product ambiguity, irreversible shared damage, human-only secrets/accounts, or explicit “멈춰 / 계획만 / 커밋 금지”.

**Where encoded:** `AGENTS.md` Standing rules · Autonomy; `docs/WORKFLOW.md` 「진행해」; `CLAUDE.md` session start; `HANDOFF.md` session entry.

## 2026-07-11 — Delegation split: cheap model edits, session model verifies

**Pattern (Owner-directed):** For bulk mechanical work (doc edits, boilerplate), spawn Sonnet subagents to apply changes; the session model (Fable) reviews the diffs itself afterward. Owner stated this explicitly mid-task ("편집은 sonnet5 서브에이전트, 확인은 현재 세션 모델").

**Also:** self-edits to `~/.claude/CLAUDE.md` that widen agent permissions get classifier-denied even when in-conversation approval exists — stop, surface the exact edit, and retry only after the Owner re-approves in their own words.

## 2026-07-11 — Impl is delegated; session model never hand-codes a locked spec

**Mistake:** With PLAN 0.20.0 approved (R21, all locks set), I started hand-coding `loom doctor` in the session model (Opus). Justification was a stale HANDOFF note: "grok CLI 인증 만료 — 기본 impl 레인 불가. (이번 세션은 아키텍트 직접 구현.)". I saw one lane down and jumped straight to hand-coding — without checking that `codex-impl` (the proven fallback used last session for 0.18.0) was available. It was.

**Rule (Owner-directed):** The architect (session model) authors specs, reviews, and verifies — it **does not write product code from an approved/locked spec**. Check available impl lanes and escalate **down** the chain: `grok-impl` → `codex-impl` → (both external CLIs down) a **lower-tier in-harness model** subagent (`Agent`, `model: sonnet`/`haiku`) given the full spec. "The default lane is down" means move down the chain — it is **never** a license for the session model to hand-code. Verify lane availability freshly; do not trust a stale HANDOFF note.

**Where encoded:** `AGENTS.md` Standing rules · Impl delegation; `docs/DOGFOOD_LOOP.md §1.2` (lane escalation).

## 2026-07-12 — Next-action selector: don't pick can't-fail actions to dodge the real gap

**Mistake (repeated within one session):** When the Owner gave explicit instructions I executed well, but every time I **self-chose** the next best action I dodged the one open high-value gap (does the real Claude Ink TUI accept the injected paste — runtime-unverified) and drifted to a **can't-fail** action instead: (a) defer to an owner blocker (VPS), (b) low-risk doc-sync, (c) **re-run already-green work** (Docker dry-run that HANDOFF itself marks "all green"). Corrected once, I repeated a variant. I even selectively inherited HANDOFF's "VPS = blocker" line while skipping the same doc's "remaining validation = live smoke" line.

**Root cause (Fable 5 verdict):** not frame-inheritance — a **selector** fault. The common denominator of all three dodges: they **cannot fail**. The real gap is interactive, can fail messily, and attributes to me. Pressure to "show progress" made me pick *executable* over *correct*.

**Rule — Next-action test:** Before any self-chosen action, answer *"if this fails, what do I newly learn?"* Can't-fail actions (already-green re-run, owner-blocked wait, doc paperwork) are **disqualified**. Cross-check HANDOFF's "don't redo" list; pick the **scariest still-verifiable** check. Handing the Owner a manual script is a **last resort** (only if genuinely irreproducible), never the default. Before deferring to an owner blocker, first state what is verifiable **without** it.

**Where encoded:** `AGENTS.md` Standing rules · Next-action test.

## 2026-07-18 (5) — 오너 레인 지시: 구현·자문 전부 herdr pane dispatch로 (headless 서브에이전트 대신)

**지시 (2026-07-18, 0.23.3 세션):** ① 자문(advisor)은 fable-advisor(Fable 5) 대신 **codex(GPT-5.6)** — 토큰 한도 절약. ② 구현·자문 모두 **herdr pane dispatch 레인**으로 진행(dogfood 겸). 실행 형태: 긴 스펙은 파일로 저장하고 pane엔 "파일 읽고 수행"의 짧은 프롬프트만 주입(레이스 유실 리스크 축소, 실증 유효). codex는 mac-node config에 opt-in 등록됨(fail-closed 검증용 미등록 상태 종료). **공식 R{n} 리뷰의 fable-advisor 필수 규정(DOGFOOD_LOOP §2)과 지시 ①이 충돌하면 오너에게 확인 또는 codex-review 레인 대체를 리뷰 기록에 명기.**

**갱신 (같은 날, 조사 카드):** codex를 기본 argv로 등록하면 **승인 프롬프트 모드**로 떠서, 명령 실행이 필요한 카드는 사람이 pane에서 승인하기 전까지 고착된다(오너가 수동 승인으로 해소 — R27 L-2 고지의 실증 사례). 무인 codex 워커가 필요하면 오퍼레이터가 argv에 자율성 플래그를 명시(예: `-a never -s workspace-write` — CLI help의 `loom run codex` 예시와 동일)하는 신뢰 결정이 선행돼야 한다. grok/claude는 기본 argv로도 자율 실행됨 — CLI별 기본 권한 모델 상이.

## 2026-07-19 (7) — 오너 지적: PLAN 작성 시 본세션 컨텍스트 최소화 위반

**지적 (2026-07-19, 0.23.12 세션):** 아키텍트 본세션이 PLAN 초안을 위해 코드 정독
(bridge-runtime 수백 줄)·구조 파악을 직접 수행 — 오케스트레이션 독트린(본세션 =
판단·게이트·디스패치만, 컨텍스트-무거운 작업은 위임) 위반. **교정 절차**: PLAN 작성은
2단 분리 — ① 서브에이전트(Explore/claude 레인)가 증거 팩 수집(대상 심볼 위치·현행
동작·락 인접 지점·라인 근거), ② 본세션은 그 증거 팩으로 판단-무거운 스펙 문안(락 경계
판단·보수성 트레이드오프·게이트 결정)만 작성. 라이브 프로브(RPC 의미론 실측)처럼
왕복-판단이 얽힌 것만 본세션 예외. 독립 검증(diff 육안 확인)도 서브에이전트 위임 대상.

**보강 (2026-07-19, R37 북키핑 세션):** 위임 대상 판단에 **"규모가 작아도" 예외 없음** —
20줄 디스패치/claim 스크립트·보드 북키핑·절차 조사(inbox accept 의미론 확인 등)도 전부 위임
대상이다. **"작아서 직접"은 오늘 세션에서 실증된 합리화 패턴(오너 지적 발)** — 소규모라는
이유가 본세션 직접 수행을 정당화하지 않는다(standing rule 1의 "전부 서브에이전트로 위임"에
규모 예외 조항이 없음). 판단은 작업 크기가 아니라 성격(판단·게이트·락-인접 교정 = 본세션 /
컨텍스트·볼륨·조사·스크립트 = 위임)으로 가른다.

## 2026-07-19 (8) — 오너 지적: 서브에이전트 model 명시 필수 (기본 상속 = Fable 함정)

**지적 (2026-07-19, 0.23.12 세션):** Agent 도구는 model 미지정 시 **본세션 모델(Fable)을
조용히 상속** — 검증·탐색 위임이 최고가 레인으로 나가는 사고가 기본값에서 발생한다.
**규칙**: ① 위임 직전 orchestration 스킬 로드가 선행 절차 ② 서브에이전트 스폰 시 **model
명시 필수** — **기본 = `opus`(오너 지시 2026-07-19 세션 점검: "복잡한 판단이 요구되는
어려운 작업을 제외하고 하위 모델 opus 사용")**, `fable`은 커밋먼트 경계 자문(fable-advisor)뿐.
미지정 스폰은 그 자체로 결함으로 취급. ③ 병렬화 기본 + 정형 다단계는 Workflow 도구
(오너 상비 옵트인 2026-07-19) — 전체 규칙은 CLAUDE.md "Orchestration standing rules"가 SSOT.
