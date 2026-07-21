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

**재범 실증 (2026-07-20, 0.26.0 세션 — 오너 지적 "왜 pane를 사용안하지?"):** IMPL-0260을
headless `grok-implementer` 서브에이전트로 오라우팅. 근인 = HANDOFF 실측 제약의 **스테일
문장**("herdr dispatch allowlist = claude만") 신뢰 — 실제로는 `DispatchAgentKindSchema`
(`card-contract.ts:20`)가 0.23.2부터 claude/codex/grok 3종 pane 카드를 지원하고 IMPL-0250이
grok pane으로 완주한 선례까지 있었다. 교정: headless 레인 중단(제품 코드 수정 전) → grok
pane 카드 재발사(task_0bcd589f7684ab76) + HANDOFF 스테일 문장 정정. **규칙 보강**: 구현
디스패치 전 "pane 레인 가능?"을 스키마·선례로 실측 확인 — headless 서브에이전트는 pane
레인 불가(원격 노드 CLI 부재 등)일 때만 폴백. verification (11) 힌트 교차검증의 동계열
(스테일 교훈도 힌트일 뿐 — 스키마가 SSOT).

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

## 2026-07-19 (18) — 전체 스위트 실행은 아키텍트 몫 (워커 DONE 보류 = 정상)

**실증 (2026-07-19, v0.25.0 IMPL-0250 grok pane 카드):** 구현 워커가 신규 유닛(25/0)은
완주했으나 **전체 `bun test` 스위트를 중도 중단**하고 이를 정직 보고하며 DONE 마커를 스스로
보류했다. **대응 = 재디스패치 불요.** 전체 스위트 독립 실행은 애초에 아키텍트 몫이다
(verification (4) "아키텍트 독립 `bun test`를 워커 검증 스위트와 동시 실행 금지"의 연장 —
전체 회귀 판정 provenance는 아키텍트 독립 실행이 SSOT). 워커 deliverable = 신규 유닛 +
구현 코드까지이고, 전체 스위트(538/0)는 아키텍트가 독립 실행으로 완결했다. 보드는 done
전이(구현 완료 + 신규 유닛 green이면 완주 — 전체 스위트 중도 중단은 워커 실패가 아니다).
워커의 정직한 중단 보고 + DONE 보류는 오히려 올바른 거동(과잉 완료 주장 회피). 재디스패치
하면 워커가 아키텍트 몫을 억지로 재시도하다 환경 차이로 헛돈다. cross-ref: verification (4)·workers.

## 2026-07-20 (20) — 코드 락 vs 문서 규칙 (같은 세션 3/3 vs 4/4)

**실증 (2026-07-20, hook 캐시 결함 해소 웨이브):** 한 세션 안에서 두 종류의 규칙이 정반대
결과를 냈다.

- **코드로 강제된 규칙 3건 → 3/3 전부 위반을 막았다**
  - M-1 dispatcher allowlist (브릿지가 미등록 신원의 디스패치를 deny)
  - L-2 `result.node` ↔ assignee 정합 검사
  - PreToolUse hook의 Agent `model` 필수 (미지정 스폰 자체를 차단)
- **문서에만 있던 규칙 4건 → 4/4 전부 위반됐다**
  - `fable-advisor:orchestration` 스킬 로드 (위임 전 선행)
  - `docs/DOGFOOD_LOOP.md` §1.1 board claim 선행
  - herdr pane 카드 우선(in-harness `Agent`는 폴백)
  - 마커 echo 오탐 주의

**핵심:** 마커 echo 오탐은 **lessons에 이미 기록이 있었는데도 재범**했다. 즉 "기록하면
다음에 안 틀린다"는 명제의 **반례**다. 기록은 필요조건이지 충분조건이 아니다.

**규칙:** 새 규칙을 만들 때 **문서에 쓸지 코드로 잠글지를 먼저 판별**한다. 위반 시 손실이
크거나 재범 이력이 있는 규칙은 문서로 끝내지 말고 실행 경로(hook·검증·CI)에 락을 건다.
판별 기준 정본 = **`docs/spikes/RULE-ENFORCEABILITY.md`** (§7 판별표 · §7.1 우선순위).

## 2026-07-20 (24) — 검증 레인 분리 (발견자 ≠ 수정자)

**규칙 (CLAUDE.md 규칙 5, 오너 지시):** **구현 = `grok`** · **검증 = `codex`** ·
**자문 = `fable-advisor`**(read-only). 검증을 구현자와 같은 레인에 주지 않는다 —
발견자와 수정자를 분리해야 교차 검증이 성립한다. 같은 레인이면 자기 산출물을 자기가
승인하는 구조라 결함이 그대로 통과한다.

**이번 웨이브 실증:** codex가 세 가지를 잡아냈다.
1. **아키텍트의 진단 오류** — `PaneDied for unknown pane`을 "브릿지가 통지를 버렸다"로
   오독한 것을 정정(실제로는 herdr 내부 경고). 이 오독은 이미 오너에게 보고된 뒤였다.
2. **감지기 결함 2건** — 임시 감시 로직의 구멍.

셋 다 구현 레인과 분리된 독립 검증자였기에 발견됐다. cross-ref: verification (23)·bridge-ops (21).

## 2026-07-20 (27) — 위임 범위를 좁히는 보호 지시가 정합성을 깰 수 있다

**실증 (2026-07-20, PANE-DEATH 락 문안 교체):** 아키텍트가 codex 1차 검증 reject를 수용해
`docs/spikes/PANE-DEATH-DESIGN.md` §9-bis 락 문안 교체를 위임하면서, 편집자의 과잉 수정을 막으려고
**"설계 본문 §5~§8은 건드리지 마라"**로 범위를 좁혔다.

**결과:** 교체된 락 5·9는 `commit_unknown` 도입과 **두 번째 result 발행 금지**를 규정했는데,
손대지 말라고 한 본문 §5 B 상태도·§6.2.1 판정·§7.1 race tests 4·6은 여전히 **failed result 발행을
요구**하고 있었다. **같은 문서가 반대 전이를 명령하는 자기모순**이 생겼고, 2차 검증에서 **High**로 잡혀
`ready=no` reject의 직접 근거가 됐다.

**핵심:** 보호 지시 자체는 합리적이었다 — 편집자가 승인 범위 밖을 임의로 고치는 것은 실제 위험이다.
틀린 것은 **범위의 경계 위치**다. 교체 대상이 **상태기계를 바꾸는 락**이었으므로, 그 상태기계를
참조하는 본문은 **바뀌는 것의 일부**이지 "건드리면 안 되는 남의 영역"이 아니었다.

**규칙:**
1. 위임 범위를 좁힐 때는 **"바뀌는 것이 무엇에 의존하는가"를 먼저 따져라.**
2. **상태기계·타입·계약을 바꾸는 변경은 그 참조처까지가 최소 범위다.** 참조처를 범위 밖에 두면
   축소가 아니라 **정합성 파괴**다.
3. 범위를 굳이 좁혀야 한다면 "건드리지 마라" 대신 **"본문 §5~§8 중 락과 충돌하는 지점을 목록으로
   보고하라(수정은 하지 마라)"**로 바꿔라 — 편집 권한은 막되 **불일치 탐지는 살린다**.

좌표: `docs/spikes/PANE-DEATH-DESIGN.md` §5·§6.1·§6.2·§7.1·§9-bis 5·9 ·
`docs/reviews/PANEDEATH-CODEX-REVIEW.md`(2차). cross-ref: orchestration (20)·verification (23).

**재범 3회차 (2026-07-21, PANE-DEATH 통합 패스) — 이번엔 조사 범위였다:** 2차 High(F1 전이표
충돌)를 닫으려고 아키텍트가 증거 팩 수집을 위임하면서 **스캔 범위를 "§5~§8"로 지정**했다.
그 결과 문서 **앞부분** §0-bis 요약 표(`:49`)와 스모크 표 일부가 **스캔 범위 밖**에 남았고,
통합 패스가 본문 9지점을 전부 고쳤음에도 **요약 표 1곳이 옛 전이를 그대로 서술**한 채 남아
2차의 유일한 High가 **닫히지 않았다** → **3차 reject**.

(27)이 이미 "범위 축소가 정합성을 깬다"를 기록했는데도 **같은 세션에서 같은 실수를 반복**했다.
다른 점은 하나뿐이다 — 1·2회차는 **편집 범위**를 좁혔고, 이번엔 **조사·스캔 범위**를 좁혔다.

**규칙 보강:**
4. 범위 축소 금지는 **편집뿐 아니라 조사·스캔 범위에도 적용된다.** "어떤 지점을 고쳐야 하는가"를
   찾는 스캔은 **문서·코드 전역이 기본**이고, 섹션 한정은 그 자체가 **결함 유입 경로**다.
5. **전이표·상태기계처럼 여러 곳에 흩어져 서술되는 대상**은 본문만이 아니라 **요약 표·체크리스트·
   스모크 표까지** 스캔 대상에 포함하라. 요약은 본문의 사본이므로 본문만 고치면 반드시 어긋난다.

cross-ref: verification (31).

## 2026-07-21 (34) — 레인 지정이 실제 레인을 보장하지 않는다

**실증 (2026-07-21, PANE-DEATH ACK 수정 디스패치):** 아키텍트가 `Agent` 도구에
`subagent_type: fable-advisor:grok-implementer`를 **명시**했는데, **실행된 것은 일반 Claude
서브에이전트**였다. 워커가 먼저 **정직하게 고지**했다 — *"나는 grok이 아니다 · grok CLI는
정상 설치돼 있으니 폴백이 아니라 오라우팅이다."*

**대응 판단 (채택함):** 산출물을 **버리지 않았다.** 근거는 **발견자≠수정자가 여전히
성립**했다는 것이다 — 결함은 **codex가 발견**했고 **Claude가 고쳤으며** 아키텍트가 **독립
검증**했다. 규칙 5(구현=grok)의 목적은 **자기 산출물 자기 승인 방지**인데 그 목적은 깨지지
않았다. 동일한 사소 수정을 재실행하는 것은 토큰 낭비다.

**규칙:**
1. `subagent_type` 지정 후에도 **워커에게 자기 신원을 보고하게 하라** — 스펙에
   **"레인이 다르면 먼저 고지하라"**를 넣는다. 지정은 요청이지 보장이 아니다.
2. 레인 불일치 발견 시 폐기 여부는 **"발견자≠수정자가 유지되는가"**로 판정한다 —
   유지되면 **채택 가능**하고, 깨지면 **재디스패치**다.
3. 어느 쪽이든 **위반 사실 자체는 기록한다** — 기록되지 않은 오라우팅은 다음 세션에서
   "레인 지시가 지켜졌다"는 잘못된 전제로 굳는다.

cross-ref: orchestration (24)·verification (33).

## 2026-07-21 (46) — 레인이 죽었을 때 재배정 기준은 규칙의 문자가 아니라 목적

**실증 (PANE-DEATH R44 게이트):** 표준 검증 레인 codex가 **계정 사용량 하드 한도**로 다운했다
(리셋 4일 후). 워커는 **임의 대체를 거부하고 구조화된 오류로 반환**했다 — *"이 태스크는 발견자≠
수정자 원칙에 따라 codex 레인에 배정된 독립 검증이고, 레인이 죽었을 때 조용히 Claude 레인으로
갈아타는 것은 교차 검증 자체를 무효화한다"*. **올바른 거동이다**(교훈 34의 실천형).

**아키텍트 재배정 판단:** 후보를 규칙 5의 문자("검증=codex")가 아니라 **규칙의 목적**으로 골랐다 —
*"발견자≠수정자와 벤더 다양성이 둘 다 성립하는가"*.

| 후보 | 벤더 다양성 | 발견자≠수정자 | 판정 |
|---|---|---|---|
| 4일 대기 | — | — | 비현실적 |
| Claude opus | ❌ 설계 작성자(Fable 5)와 동일 벤더 | ✅ | 차선 |
| **grok (xAI)** | ✅ | ✅ (후속 구현을 Claude로 돌리면) | **채택** |

설계 작성자가 Fable 5였으므로 grok이면 둘 다 성립했고, **구현 레인을 Claude로 옮겨** 발견자=수정자를
피했다. 결과: R44가 High 0·Medium 4를 냈고 그중 M2는 **v0.27.0 유닛 결함의 설계층 재발**이었다 —
독립 벤더 검증이 실제로 값을 했다.

**규칙:**
1. **레인 다운 시 워커가 임의 대체하면 그것은 결함이다.** 스펙에 "레인 불가 시 구조화된 오류로
   반환하라 — 네가 대신 수행하지 마라"를 명시하라.
2. **재배정은 문자가 아니라 목적으로 판정한다** — 규칙 5의 목적은 "자기 산출물 자기 승인 방지"다.
   그 목적이 유지되는 배치면 레인 이름이 달라도 성립한다. **단 벗어난 사실 자체는 기록한다.**
3. **레인 배치는 트랙 전체의 그래프로 보라** — 검증에 쓴 레인은 그 트랙의 구현에 쓸 수 없다.
   한 자리를 채우면 다른 자리가 비므로, 재배정은 **연쇄 결정**이다.

**grok 헤드리스 구동 실측(재현용):** 3회 실패 후 성공. ① `${T:+$T 600}` zsh 미분할 exit 127
② `--permission-mode acceptEdits`로 `run_terminal_command`가 `PermissionCancelled` — **헤드리스는 ask
프롬프트를 못 띄우고 즉시 취소** ③ `dontAsk`도 프로젝트 `.claude/settings.local.json`의 ask 정책을
못 넘김 → **④ 읽기 전용 커맨드 allowlist를 세션 스코프로 부여해야 뜬다.** git은
`log/show/diff/status/rev-parse/ls-files/merge-base/blame/grep/cat-file/branch/worktree list`만 허용해
커밋·푸시를 **권한 계층에서 차단**할 수 있다(read-only 검증의 표준 배치).

cross-ref: orchestration (24)·(34) · 원장 `docs/reviews/PANEDEATH-R44.md` §1.
