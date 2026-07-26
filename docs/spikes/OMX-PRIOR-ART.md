# OMX(oh-my-codex) 선행기술 조사 — 워커 오케스트레이션 대조 (조사 전용 · 적용 없음)

| Field | Value |
|---|---|
| **Date** | 2026-07-26 |
| **Scope** | oh-my-codex(OMX)의 tmux 팀 런타임을 Loom의 pane 워커·완료 판정·전달 규약과 대조 |
| **Status** | **research only** — 제품 코드 변경 없음 · 채택 결정 없음 |
| **좌표** | Loom `7bdd4b7` (main) · OMX 로컬 `0.11.11` · 상류 `main` / 최신 `0.18.1` |
| **결론** | **참고 가치 있음, 단 범위는 좁다.** Loom이 이미 닫은 축이 대부분이고, 미소유 축은 **claim 토큰 기반 소유권**과 **state-first 전달 규약** 둘 |
| **Review gate** | **불요(조사 문서)**. 단 §5 채택 후보는 M-lock 인접 → 착수 전 `R{n}` 필요 |

> **U11(과장 금지) 준수.** 이 문서는 OMX가 Loom보다 앞선다고 주장하지 않는다. 아래 §3에서
> 확인된 것은 **두 시스템이 같은 실패를 각자 겪었고, 세 축에서 Loom이 이미 더 보수적**이며,
> **두 축에서 OMX가 Loom에 없는 메커니즘을 갖는다**는 것뿐이다.

---

## 0. 요약 (3줄)

1. OMX는 Loom과 동일한 실패(가짜 완료·pane 주입 사고·감시 휴리스틱 오판)를 겪고 **코드 게이트로 굳혔다**.
2. Loom이 **이미 닫은** 축: 자동 `done` 커밋 폐지 · 완료 소유권 CAS/latch · terminal 이벤트 한계의 명시적 식별(후속 A).
3. Loom이 **아직 갖지 않은** 축: ① 태스크 **claim 토큰**(소유권을 워커 신원에 결속) ② **state-first 전달 규약**(이벤트를 nudge로 격하하고 상태 파일을 정본으로).

---

## 1. 조사 방법과 출처 구분 (혼동 금지)

이 문서의 모든 OMX 진술은 두 출처 중 하나이고, **라벨을 붙여 구분한다.**

| 라벨 | 출처 | 신뢰도 |
|---|---|---|
| **[로컬]** | `/opt/homebrew/lib/node_modules/oh-my-codex` **0.11.11** (2026-04-01 설치) 소스 직접 읽음 | 실측 |
| **[상류]** | GitHub `Yeachan-Heo/oh-my-codex` `main` · npm README · PR #846 · DeepWiki | 문서 독해 (코드 미실행) |

**설치본은 4개월 전 0.11.11이고 최신은 0.18.1이다.** 네이티브 hooks 통합(v0.13.1), incremental
worktree merge(PR #846, 2026-03-15), worker stall 휴리스틱 폐기는 **대부분 0.11.11 이후** 변경이다.
로컬 소스만 읽으면 낡은 그림을 본다 — 채택 검토 시 상류 `main`을 다시 읽어야 한다.

Loom 측 진술은 전부 `7bdd4b7` 워킹트리 실측이다. 좌표에 트리 접두를 붙이는 규범(R45 M1)에 따라
브랜치 좌표는 쓰지 않았다 — 모두 main 기준이다.

---

## 2. OMX가 가진 메커니즘

### 2.1 claim-safe lifecycle — 워커는 상태 필드를 직접 쓸 수 없다

**[로컬]** `dist/team/state.d.ts:309`:

```
transitionTaskStatus(teamName, taskId, from: TeamTask['status'], to: TeamTask['status'],
                     claimToken: string, cwd: string, terminalData?)
```

`from`(기대 현재 상태)과 `claimToken`을 **필수 인수**로 받는다. 즉 compare-and-swap이며,
스왑 조건에 **소유자 신원**이 함께 걸린다.

**[로컬]** `skills/worker/SKILL.md:65,69` — 워커 규약:

- *"Claim the task (do NOT start work without a claim)"* — claim 없이 착수 금지
- *"Do NOT directly write lifecycle fields (`status`, `owner`, `result`, `error`) in task files"*
- `release-task-claim`은 **롤백/재큐 전용**이며 완료 경로로 쓸 수 없다

### 2.2 state-first dispatch — tmux 키스트로크는 정본이 아니다

**[로컬]** `skills/worker/SKILL.md:102`:

> *"If a manual trigger arrives (for example `tmux send-keys` nudge), treat it only as a prompt to
> re-check state and continue through the normal claim-safe lifecycle."*

**[상류]** `skills/team/SKILL.md`: *"Do not rely on ad-hoc tmux keystrokes as a primary delivery
channel."* 정본은 상태 파일 — `dispatch/requests.json`(durable queue) · `mailbox/leader-fixed.json` ·
`workers/<id>/status.json` · `inbox.md`.

### 2.3 terminal-state shutdown 게이트

**[로컬]** `skills/team/SKILL.md:203,469`: shutdown 전 `pending=0` · `in_progress=0` · `failed=0`
확인 의무. 그리고 *"Do not claim clean completion if shutdown occurred with `in_progress>0`."*

### 2.4 워커 커밋 프로토콜

**[로컬]** `skills/team/SKILL.md:319-324`: 완료 보고 **전에** `git add -A && git commit -m "task: …"`
의무. 잊으면 런타임 auto-commit 폴백이 있으나 명시적 커밋을 선호.

### 2.5 pane 주입 안전 가드

**[상류]** `checkPaneReadyForTeamSendKeys` — `#{pane_current_command}`가 셸(zsh/bash)이면 주입 유예,
copy-mode/scroll-mode 확인. 실패는 조용히 넘기지 않고 `leader_notification_deferred` +
사유(`leader_pane_missing_no_injection` · `leader_pane_shell_no_injection`)로 기록.
**[로컬]** `dist/team/tmux-session.js:73`에 `pane_current_command` 조회 자체는 이미 존재.

### 2.6 nudge 택소노미 + 쿨다운

**[상류]** 깨우기 신호에 이름을 붙여 `events.ndjson`에 기록: `all_workers_idle` ·
`new_mailbox_message` · `stalled_team_progress` · `leader_stale` · `ack_without_start`.
쿨다운은 워커당 30초, `NudgeTracker` `maxCount=3` / `delayMs=10s`.

### 2.7 휴리스틱 폐기 — 확정 증거로 이동

**[상류]** worker stall/progress nudge를 **deprecated** 처리하고 확정 증거(resolved native worker
Stop · all-idle · mailbox · stale-leader)만 지원. `OMX_TEAM_PROGRESS_STALL_MS`는 *"legacy
호환/테스트 전용이며 운영 튜닝 노브로 권하지 말라"*고 명시.

### 2.8 조건부 프로토콜 활성화

**[상류]** 독립 태스크(공유 파일·의존·핸드오프 없음)는 경량 규약(ACK · claim · status · evidence)만.
의존·공유 파일·계약·핸드오프·통합·블록·가정 변경이 생기면 무거운 체크리스트(Team Big Five/ATEM) 활성.

### 2.9 incremental worktree merge

**[상류]** PR #846(2026-03-15) — 리더가 워커 브랜치를 증분 통합, `integrationByWorker`를 monitor
스냅샷에 영속, cherry-pick/rebase 이벤트 발행, 충돌을 `integration-report.md`로 표면화.
낮은 중첩 작업을 같은 레인에 유지하는 allocation 휴리스틱. PR 본문이 *"synthetic
`worker_rebase_conflict` 시나리오의 결정론적 커버리지는 아직 미완"*이라고 스스로 밝힌다.

---

## 3. Loom 현행과의 대조 — 이미 닫은 축이 대부분이다

**이 절이 이 문서의 본체다.** 조사 착수 시점의 가설(“OMX의 CAS가 Loom의 `finishCard()` 문제를
푼다”)은 **좌표 실측으로 기각됐다.**

| 축 | Loom 현행 (`7bdd4b7` 실측) | 판정 |
|---|---|---|
| 자동 `done` 커밋 | **폐지됨.** `finishCard()`는 존재하지 않는다. 완료 후보는 `proposeCardVerification`으로 `needs_verification`만 발행(`bridge-runtime.ts:2463 :2489 :2545 :2577`). 설계 정본 `PANE-DEATH-DESIGN.md` §6.0 “(C) 전환 2026-07-21” | **이미 해결 — OMX 참고 불요** |
| 완료 side-effect 소유권 | **CAS/latch로 잠금.** `scheduleOwnedCardResult` 주석(`bridge-runtime.ts:2618-2622`): *"Ownership is CAS/latch (not await on onHerdrEvent). ACK is consumed inside proposeCardVerification/finishCardFailure/sendFailedResult. Do NOT reintroduce fire-and-forget emission"* (PLAN 0.27.0) | **이미 해결 — 동일 기법 보유** |
| 자동 `pane.close` | 사람 확정 + tower receipt 뒤에만 (`PANE-DEATH-DESIGN.md` §6.0 E2 경계) | **Loom이 더 보수적** |
| terminal 이벤트 replay/live 구분 | **한계를 이미 식별했다.** `PANE-DEATH-UNIFIED-DESIGN.md:595` — durable outbox · stable eventId · 재전송 · tower atomic dedup+apply receipt는 **후속 A**이며 *"relay/wire 표면 변경 필요, 로컬 변경으로 닫히지 않음"* | **식별 완료 · 미구현** — OMX의 §2.2가 **회피 전략**으로 참고 가치 |
| 워커 감시 | `scripts/watch-card.ts` — 종료 사유를 exit code로 구분(`marker`0 / `pane-gone`1 / `limit`2 / `timeout`3) | **동형** — OMX §2.6이 더 세분화·이벤트 로깅 |
| 감시 휴리스틱 | 손으로 짠 감시 3연속 실패 후 `watch-card.ts`로 강제 (CLAUDE.md 규칙 6) | **동일 교훈 도달** — OMX §2.7과 같은 방향 |
| 산출물 검증 | 아키텍트가 워킹트리에서 독립 검증 (CLAUDE.md 규칙 7) | OMX §2.4가 **워커 측으로 앞당기는** 보완재 |
| claim 전이의 from-state 가드 · 소유자 토큰 | **없음.** `dispatchCard`(`card-ops.ts:40`)는 함수 전체에서 **task status 검사 0건**이며 `status:"doing"` + `assignee:node`를 **무조건 덮어쓴다**. `claimToken`/`expectedStatus` 심볼도 **0건** | **진짜 갭** → §4.1 |
| 이벤트 vs 상태 정본 규약 | 브릿지가 herdr terminal 이벤트를 소비하는 구조. “이벤트는 nudge일 뿐”이라는 명문 규약 없음 | **진짜 갭** → §4.2 |
| topology 이원화 | `single` / `full` (DOGFOOD §0.5) | OMX §2.8이 **트리거 조건을 더 구체화** |
| 워커 산출물 통합 | 아키텍트 수동 통합 | OMX §2.9가 선례 — 단 상류도 미완 자각 |

---

## 4. 진짜 갭 두 개

### 4.1 claim 전이에 from-state 가드와 소유자 토큰이 없다

Loom은 완료 side-effect **소유권**을 CAS/latch로 잠그지만(§3), 그것은 **완료 경로**의 프로세스 내부
래치다. **claim 경로**에는 대응물이 없다.

`docs/DOGFOOD_LOOP.md` §1.1은 claim을 이렇게 규정한다 — *"`dispatch_card` is the claim transition:
it moves the existing card to `doing` and assigns the bridge node. Do not pre-claim it under a peer
profile."* 즉 **전이 자체는 코드가 수행한다**(문서 규칙이 아니다).

문제는 그 전이가 **무조건적**이라는 것이다. `packages/host/src/card-ops.ts:40` `dispatchCard`를
함수 전체에서 실측한 결과:

- `task.status` / `status ===` / `status !==` 검사 **0건**
- 성공 경로에서 `status: "doing"` · `assignee: node`를 **그대로 덮어쓴다**
- 따라서 **이미 `doing`이고 다른 노드에 assign된 카드를 재dispatch하는 것을 코드가 막지 않는다**

중복 착수를 막는 것은 §1.1 규칙 1 — *"Before dispatching, run `check_handoffs` + `list_tasks` and
look for a card already `doing` whose scope overlaps"* — 이며 이것은 **에이전트가 지켜야 하는 문서
규칙**이다. lessons `orchestration` 2026-07-20(20)의 관측 *"코드 락 vs 문서 규칙: 코드 강제 3/3 준수 ·
문서만 4/4 위반"*이 정확히 적용되는 지점이고, CLAUDE.md 규칙 5가 *"생략 시 3 구현자 중복 착수 위험"*을
경고하는 이유이기도 하다.

OMX는 같은 문제를 `transitionTaskStatus(…, **from**, to, **claimToken**, …)`로 **코드 게이트**로
옮겼다 — 기대 현재 상태와 소유자 토큰이 스왑 조건이므로, 남이 claim한 태스크에 대한 전이는
런타임이 거부한다.

### 4.2 state-first — 이벤트를 정본으로 쓰지 않는 규약

Loom 트랩: *"terminal 이벤트는 신규 구독자에 재전달(백로그 ≥10분) · 봉투에 시각·seq·id 없음 →
replay/live 구분 불가."* Loom의 해법 방향은 **봉투를 고치는 것**(stable eventId · durable outbox)
이고, `PANE-DEATH-UNIFIED-DESIGN.md:595`가 *"relay/wire 표면 변경 필요"*로 후속 A에 넣었다.

OMX는 **봉투를 고치지 않고 우회한다.** 이벤트/키스트로크를 “상태를 다시 읽어라”는 nudge로
격하하고, 진실을 상태 파일에만 둔다(§2.2). replay든 live든 **결과가 같아진다** — 어느 쪽이든
상태 재조회를 유발할 뿐이므로 구분할 필요가 없어진다.

이것은 후속 A가 relay/wire 표면 변경을 요구하는 동안 **로컬 변경만으로 취할 수 있는 완화**일
가능성이 있다. 단 Loom의 완료 판정이 이벤트 페이로드(스크레이프·마커)에 의존하는 부분과
정합한지는 **미검증**이다 → O2.

---

## 5. 채택 후보와 관문

**어느 것도 지금 착수 대상이 아니다.** RULE-ROUTER rev-5가 리뷰 조건 0으로 걸려 있고,
아래는 전부 M-lock 인접(완료 권위·보드 전이 의미)이므로 `R{n}` 게이트가 선행한다.

| 후보 | 근거 | 관문 |
|---|---|---|
| **C1 · claim 토큰** | §4.1 · 문서 규칙 → 코드 게이트 이전 | `PANE-DEATH-UNIFIED-DESIGN` U1–U11 immutable과 정합 확인 · card contract v1 유지 가능한지 · board 전이 의미 변경 여부 → **R{n} 필수** |
| **C2 · state-first 규약 명문화** | §4.2 · 후속 A를 기다리지 않는 완화 | 완료 판정의 이벤트 의존 실측(O2) 선행 · 후속 A와 상충하지 않는지 |
| **C3 · nudge 사유 명명 + 이벤트 로깅** | §2.6 · `watch-card.ts` 보완 | 낮음 — 감시 도구 표면. 다만 exit code 계약(0/1/2/3) 변경 금지 |
| **C4 · 워커 커밋 프로토콜** | §2.4 · 독립 검증을 워커 측으로 앞당김 | 낮음 — 스펙 문안 변경. grok/codex 레인 스펙 5부 구성에 추가 |
| **C5 · 조건부 프로토콜 트리거** | §2.8 · `single`↔`full` 승격 기준 정밀화 | DOGFOOD §0.5가 SSOT · F6/P7 retraction 재현 금지(Don't redo) |

착수 우선순위 판단은 **오너 몫**이다. 조사자 의견으로는 C4·C3이 위험 대비 이득이 가장 좋고
(게이트 부담 낮음), C1은 이득이 크지만 M-lock 인접이라 리뷰 비용이 실질적이다.

---

## 6. 채택하지 않는 것

- **`omx team` 런타임 자체** — Loom이 만들고 있는 것이 바로 그것이다. 아키텍처 참고와 의존은 다르다.
- **`.omx/` 상태 레이아웃** — Loom은 HANDOFF nine + NORMS packs + board를 이미 갖췄다. 이중 상태는 SSOT 붕괴.
- **tmux 직접 제어** — Loom은 herdr를 경유한다. `PANE-DEATH-*` 계보가 그 경계를 전제로 설계됐다.

---

## 7. Unknowns

| # | 미지 | 닫는 방법 |
|---|---|---|
| **O1** | 0.11.11 → 0.18.1 사이 §2.5·2.6·2.7·2.9의 실제 구현 형태 | 상류 `main`의 `src/team/`·`scripts/notify-hook/` 직접 독해 (설치본으로는 불가) |
| **O2** | Loom 완료 판정이 이벤트 페이로드에 얼마나 의존하는가 (C2 실행 가능성의 관문) | `bridge-runtime.ts` 완료 경로에서 이벤트 페이로드 소비 지점 열거 |
| **O3** | claim 토큰이 card contract v1을 깨지 않고 들어갈 수 있는가 | wire 표면 대조 — `PANE-DEATH-DESIGN` “card contract v1 유지” 제약과 대조 |
| **O4** | OMX의 CAS가 다중 노드에서도 성립하는가 (파일 기반 상태의 원자성) | 상류 `state.ts` 잠금 구현 독해 — Loom relay는 노드 경계를 넘는다 |

---

## 8. 다음 액션

1. **없음(대기).** 현재 게이트는 RULE-ROUTER rev-5 fold-in이며 이 문서는 그것을 침범하지 않는다.
2. rev-5 + Owner D1 이후, 오너가 C1–C5 중 착수를 지시하면 해당 후보만 `R{n}` 준비로 승격한다.
3. O1은 착수 결정 **전에** 닫아야 한다 — 낡은 0.11.11 그림으로 설계하면 R{n}에서 좌표 오류로 되돌아온다.

---

## 부록 · 조사 중 정정한 것

정직성 기록. 이 조사는 두 번 틀렸고 좌표 실측으로 교정됐다.

1. **“Loom의 `finishCard()`가 완료 후보를 너무 일찍 done으로 커밋한다”** — CLAUDE.md 규칙 7과
   `tasks/traps.md`에 남은 2026-07-20 시점 진단을 현재형으로 읽은 오류. 실측하니 `finishCard()`는
   존재하지 않고 `proposeCardVerification`(needs_verification)로 대체됐다. **(C) 전환 2026-07-21에
   이미 닫힌 문제다.** → 규칙 7·traps 문구가 현행 코드와 어긋나므로 **문구 갱신을 오너에게 제안**한다
   (본 문서 범위 밖 · 락 인접 문구이므로 임의 수정하지 않았다).
2. **“OMX의 CAS 전이가 Loom에 없는 해법이다”** — Loom도 `scheduleOwnedCardResult`에서 CAS/latch를
   쓴다(PLAN 0.27.0). OMX와의 차이는 CAS 자체가 아니라 **스왑 조건에 from-state와 claim 토큰이
   걸리는지**였다. 갭을 §4.1로 좁혔다.
3. **“Loom의 claim은 `board set doing` + `board assign`이라는 문서 규칙이다”** — 두 번 틀렸다.
   ① 실제 §1.1 표현은 `dispatch_card` 단일 전이이며 `board set doing`이라는 문자열은
   `docs/DOGFOOD_LOOP.md`에 **존재하지 않는다**(CLAUDE.md 규칙 5의 문구가 실제 문서와 어긋난다 —
   **오너에게 문구 갱신 제안**). ② claim 전이는 문서 규칙이 아니라 **코드**다. 문서 규칙인 것은
   전이가 아니라 **중복 사전 점검**(§1.1 규칙 1)이다. 갭의 성격을 “문서 규칙이라 안 지켜진다”에서
   **“코드 전이에 from-state 가드가 없다”**로 교정했다.
