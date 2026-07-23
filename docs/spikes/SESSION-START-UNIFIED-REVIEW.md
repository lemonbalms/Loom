# SESSION-START-UNIFIED-PROPOSE 적대 리뷰 (비-R{n})

| Field | Value |
|---|---|
| **Target** | [`SESSION-START-UNIFIED-PROPOSE.md`](./SESSION-START-UNIFIED-PROPOSE.md) |
| **Date** | 2026-07-23 |
| **Reviewer** | Codex architect session — 현행 코드·설치본 문서·공식 벤더 문서 교차 대조 |
| **성격** | owner 요청에 따른 spike 적대 리뷰. `docs/plan_review.md`의 정식 R{n} verdict가 아님 |
| **Scope** | 규범/상태 배달 동등성 · wire contract · trigger 안전성 · lane 불변식 · acceptance |

## Verdict

**PENDING-REVISION / REQUEST CHANGES** — 권고 패키지 **β는 현재 형태로 승인하면 안 된다.**
핵심 목표인 “Claude Code · Codex · Grok 어디서든 같은 복구 모델”이 Grok 배달 경로에서
성립하지 않으며, Norms Receipt는 실제 규범 적재를 증명하지 못해 `LOADED` false positive를
허용한다. 또한 bootstrap wire format, trigger precedence, architect delegation 계약이 닫히지
않았다.

Severity: **Critical 1 · High 5 · Medium 2**.

## Findings

| Severity | ID | Finding | Evidence | Required change |
|---|---|---|---|---|
| **Critical** | F1 | **Grok `SessionStart` hook stdout은 모델 컨텍스트에 주입되지 않는다.** 제안은 `.grok/hooks/session-start.json`에서 동일 `session-context` 스크립트를 실행하면 state가 전달된다고 전제하고, §15.12에서는 세 벤더 모두 SessionStart 컨텍스트 주입이 가능하다고 결론낸다. 그러나 현재 설치본 Grok 0.2.111 문서는 `SessionStart`를 passive hook으로 분류하며 stdout을 무시한다고 명시한다. 이 경로는 스크립트만 실행하고 nine+traps를 모델에 전달하지 않으므로 β의 핵심 합격 조건이 깨진다. | 대상 `:129-137`, `:783-792` vs `~/.grok/docs/user-guide/10-hooks.md:258-260`; 같은 문서 `:14`는 SessionStart 용도를 환경/setup으로 한정 | Grok adapter를 **project rules(N) + ritual 또는 launcher/initial-rules(S)** 로 재설계한다. Grok SessionStart hook은 사전 계산·환경 설정만 담당하고, stdout 주입을 acceptance 근거로 쓰지 않는다. |
| **High** | F2 | **Norms Receipt는 규범 본문이 실제 컨텍스트에 있다는 사실을 증명하지 못한다.** receipt 생성기는 디스크 SSOT의 짧은 hash와 `loaded_via` 자기 주장을 출력할 뿐이다. receipt만 주입되고 hash 대상 AGENTS/lexicon/traps 바이트가 누락돼도 현재 알고리즘은 `LOADED`로 판정한다. 이는 “파일 존재 ≠ 창에 있음”을 해결하지 않고 manifest 존재를 load 증거로 오인한 것이다. | 대상 `:390-411`, `:450-477`, `:479-488` | (A) receipt와 실제 규범 payload를 **동일 원자적 주입**으로 묶고 주입 payload에서 hash를 계산하거나, (B) 이름/의미를 `norms manifest`로 낮추고 `LOADED`는 벤더별 load 증거로만 판정한다. `loaded_via`는 evidence가 아니라 claimed metadata로 분리한다. |
| **High** | F3 | **`session:bootstrap` wire format이 정의되지 않았다.** 제안은 state block → lessons block → plain Host footer를 순서대로 출력한다고 쓰지만 현행 `session-context.ts`는 raw block이 아니라 `hookSpecificOutput` JSON 한 개를 출력한다. 기존 명령 두 개의 stdout과 footer를 단순 결합하면 단일 hook JSON으로 invalid하고, 수동 ritual에서는 escaped JSON 노이즈가 된다. Grok에서는 F1 때문에 그 stdout 자체가 전달되지 않는다. | 대상 `:95-115`, `:129-137` vs `scripts/session-context.ts:431-445` | transport-neutral `buildRaw`와 adapter envelope를 분리하고 출력 계약을 명시한다. 최소 `--format raw`, `--format claude-json`, `--format codex-plain`, `--format grok-launch`처럼 **의미 동등성**과 **wire 동일성**을 구분한다. 두 hook 분할 시 각 envelope·예산·footer 위치도 고정한다. |
| **High** | F4 | **Codex hooks가 본문에서는 미래 기능, 부록에서는 현행 공식 기능으로 동시에 취급된다.** 본문/Decision/Open questions는 Codex를 ritual-first로 두고 hooks 가능 시점을 조사 대상으로 남기지만, §15.12는 공식 `SessionStart`·plain stdout/additionalContext 지원을 이미 확인했다. 현재 공식 문서도 이를 명시한다. 설계의 vendor routing 전제가 자기모순이며, 사용 가능한 primary delivery를 의도적으로 fallback으로 내린다. | 대상 `:129-135`, `:232-243`, `:287-293` vs `:750-791`; [Codex Hooks — SessionStart](https://learn.chatgpt.com/docs/hooks#sessionstart) | Codex 조사 질문을 닫고 **Codex hook primary + ritual fallback**으로 본문·phase·acceptance를 갱신한다. 지원 여부가 아니라 project trust/feature disabled/command failure를 negative-path로 검증한다. |
| **High** | F5 | **trigger precedence가 없어 조회가 실행 권한으로 변하거나 제한 요청이 과도하게 해석된다.** §5의 `상태`는 status echo만 요구하지만 Template R은 status 직후 Current action을 실행한다. 첫 턴의 “상태”가 어느 계약을 따르는지 없다. 또한 `멈춰`·`계획만`·`커밋 금지`를 모두 “즉시 pause”로 합쳤지만 각각 전체 중단·계획만 수행·commit/push만 금지로 의미가 다르다. | 대상 `:141-155`, `:181-191`; 현행 `AGENTS.md:11`, `:79-86`, `:110`, `:121` | trigger state machine과 precedence를 한 표에 고정한다. 특히 first-turn `상태`가 read-only인지 brief→wave인지 하나를 결정하고 Template S/R과 AGENTS를 동시에 맞춘다. `멈춰`, `계획만`, `커밋 금지`는 서로 다른 capability mask로 분리한다. |
| **High** | F6 | **Context map이 architect의 locked-spec 손코딩 금지를 topology `full`에만 한정해 상위 불변식을 약화한다.** W2는 `impl / single arch`를 허용하고 lane 표는 architect의 금지를 “full일 때”로 쓴다. 현행 규범은 single/full과 무관하게 session architect가 approved/locked spec을 손코딩하지 않고 impl chain으로 내려보내도록 한다. W3의 “impl 규범: claim·손코딩 금지” 문구도 금지 주체가 모호하다. | 대상 `:657-689`, `:691-700` vs `AGENTS.md:114` | W2를 “gate execution/orchestration”으로 한정한다. single/full 모두 locked implementation은 W3 impl lane만 수행하도록 하고, “손코딩 금지” 주어를 `session architect`로 명시한다. |
| **Medium** | F7 | **stated goal의 lessons와 lifecycle 복원이 acceptance에서 빠졌다.** Goal은 lessons 인덱스를 복구 모델에 포함하지만 equivalence·smoke는 nine+traps 중심이고 lessons 동등성을 검증하지 않는다. smoke는 cold start 1회뿐이며 resume/compact/hook timeout/disabled/untrusted에서 stale 또는 partial state가 생기는 경로를 다루지 않는다. 현행 Claude matcher도 `startup|clear`만 받아 공식 `resume|compact` 이벤트를 놓친다. | 대상 `:38-47`, `:108-115`, `:257-270`; `.claude/settings.json:14-27`; [Claude Code Hooks — SessionStart](https://code.claude.com/docs/en/hooks) | acceptance matrix를 host × `startup/resume/clear/compact` × delivery outcome으로 확장한다. lessons sentinel/index, hook timeout, hook disabled, untrusted project, malformed output, fallback 발화를 각각 검사한다. |
| **Medium** | F8 | **897줄 단일 초안 안에서 β의 의미와 approval surface가 변한다.** 본문 β는 bootstrap+hooks+lexicon이지만 부록은 N0+N1을 β에 추가한다. 결정도 §9, §15.9, §15.11.8, §15.12.5에 분산돼 Owner가 “β 승인”했을 때 receipt·context map·vendor decisions 중 무엇이 포함되는지 확정되지 않는다. L0를 짧게 유지한다는 원칙과 본 spike 자체를 lock 후 승격할 수 있다는 옵션도 긴장한다. | 대상 `:85-93`, `:195-205`, `:232-253`, `:606-625`, `:727-742`, `:869-875` | 승인 단위를 `SESSION-START-DELIVERY`, `NORMS-RECEIPT`, `CONTEXT-MAP`으로 분리한다. 본문에는 단일 decision table과 package manifest를 두고 β에 포함되는 항목을 고정한다. L0는 짧은 실행 계약만 소유하고 조사·근거·옵션은 spike에 남긴다. |

## SSOT conflicts

1. **F5:** 대상 §5/§6 내부의 status-only와 immediate-wave 계약이 충돌하고, 어느 쪽도 현행
   AGENTS first-turn 규칙과 완전히 결속되지 않는다.
2. **F6:** 대상 context map이 현행 AGENTS의 locked-spec delegation 불변식을 topology에 따라
   약화한다. 하위 문서가 상위 규범보다 더 넓은 손코딩 권한을 만들면 안 된다.
3. **F4:** 같은 문서 안에서 Codex hooks의 존재 여부가 open과 confirmed 두 상태로 공존한다.

## Correctness counterexamples

### C1 — Grok hook이 성공했지만 S는 absent

```text
1. trusted project에서 SessionStart hook 실행
2. session-context command exit 0 + stdout JSON 생성
3. Grok passive hook runner가 stdout 무시
4. 모델은 sentinel/nine/traps를 받지 못함
5. acceptance가 "hook command success"만 보면 거짓 PASS
```

### C2 — receipt만 주입돼도 N=LOADED

```text
context: [LOOM-NORMS v1] + core@hash receipt
disk:    AGENTS.md 존재, hash 일치
context: AGENTS Standing rules 본문은 없음
parser:  status=present + packs grammar valid -> LOADED
```

### C3 — first-turn `상태`가 mutation으로 승격

```text
owner intent: 현재 상태만 조회
Template S: status only
Template R / AGENTS first-turn: status 후 Current action 전 웨이브 실행
result: 조회 메시지가 구현·commit/push 권한으로 해석될 수 있음
```

## Minimal revision set

재리뷰 전에 다음을 모두 반영해야 한다.

1. **F1:** Grok state delivery를 hook stdout 밖의 실제 모델 전달 경로로 재설계.
2. **F2:** receipt와 payload 사이의 인과 결속 또는 `LOADED` 의미 격하.
3. **F3:** raw builder와 host envelope 분리, 각 stdout grammar·예산·footer 계약 고정.
4. **F4:** Codex hooks를 현행 기능으로 반영하고 primary/fallback matrix 갱신.
5. **F5:** trigger precedence 및 `멈춰/계획만/커밋 금지` capability 분리.
6. **F6:** single/full 공통 architect no-hand-code 불변식 복구.
7. **F7:** lessons와 resume/compact/failure/trust를 포함한 3-host acceptance matrix.
8. **F8:** delivery/receipt/context-map 승인 단위와 Decision log 분리.

## Re-review acceptance

개정판은 아래 질문에 문서만 읽고 모호성 없이 답할 수 있어야 한다.

- 각 host에서 **어떤 바이트가 어떤 API/wire를 통해 모델 컨텍스트에 들어가는가?**
- hook command가 성공했지만 context delivery가 실패한 경우를 어떻게 감지하는가?
- receipt가 가리키는 규범 본문이 receipt와 함께 실제로 적재됐음을 무엇이 증명하는가?
- `상태`, `핸드오프 확인해`, `이어서`, `계획만`, `커밋 금지`, `멈춰`가 각각 허용하는
  read/write/commit/push 범위는 무엇인가?
- single topology에서도 architect가 locked implementation을 직접 하지 않는가?
- startup/resume/clear/compact와 hook-disabled/untrusted 경로 모두에서 S 상태가
  `full|partial|absent`로 fail-loud 판정되는가?

## Evidence and method

- 대상 문서 897줄 전문 검토.
- 현행 실행 경로 대조: `scripts/session-context.ts`, `scripts/session-status.ts`,
  `.claude/settings.json`, `AGENTS.md`, `package.json`.
- 로컬 설치본 확인: Grok `0.2.111`, Codex CLI `0.144.6`, Claude Code `2.1.218`.
- Grok vendor-shipped docs:
  `~/.grok/docs/user-guide/10-hooks.md`, `12-project-rules.md`.
- 공식 문서:
  [Codex Hooks](https://learn.chatgpt.com/docs/hooks#sessionstart),
  [Codex AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md),
  [Claude Code Hooks](https://code.claude.com/docs/en/hooks).

## Unverified / bounded claims

- Grok의 향후 릴리스가 passive hook stdout 컨텍스트 주입을 추가할 가능성은 본 verdict에
  포함하지 않는다. 판정은 설치본 `0.2.111`의 vendor-shipped 문서 기준이다.
- 세 host의 실제 cold/resume/compact 라이브 스모크는 수행하지 않았다. 본 리뷰의 Critical/High는
  문서 계약과 현재 실행 표면의 정적 반례만으로 성립하며, 개정판 acceptance에서 라이브 실증해야 한다.
- 본 리뷰는 비-R{n} spike 리뷰다. 제품 PLAN 승인 또는 `docs/plan_review.md` verdict를 대체하지 않는다.

---

# Addendum A — 아키텍트 독립 검증 + fable-advisor 자문 (2026-07-23)

| Field | Value |
|---|---|
| **Added by** | Claude Code architect session (오너 지시: "리뷰 내용을 검증" → "fable-advisor 자문") |
| **Date** | 2026-07-23 |
| **성격** | 위 리뷰에 대한 **독립 검증 + 자문 기록**. 여전히 **비-R{n}** · 승인 아님 |
| **Verdict 변경** | **없음** — PENDING-REVISION 유지. 아래는 근거 강화·처방 정정·범위 추가 |
| **다음 행동** | **오너 결정 대기** (§A.6). 자문은 이 append만으로는 부족하다고 판정했음을 명기 |

## A.1 리뷰 8건 독립 검증 — 8/8 성립

아키텍트가 코드·설치본 vendor 문서·공식 문서로 직접 실측 대조했다. **전부 성립**한다.

| ID | 판정 | 아키텍트 실측 증거 |
|---|---|---|
| **F1** | **확정** | `~/.grok/docs/user-guide/10-hooks.md:260` 축자 — *"For events like `SessionStart` or `PostToolUse`, stdout is ignored. Just exit 0 on success."* 보강 3건: `:14`(용도 = env export·setup 한정) · `:85` 표(SessionStart block = No) · `:100`(*"every other event is passive"*). 설치본 `grok 0.2.111` 일치 |
| **F2** | **확정** | 대상 `:404-407`이 packs 지문 대상을 **"디스크 SSOT"**로 명시 → `:464-477` 알고리즘은 receipt 존재+grammar만으로 `LOADED`. 반례 C2 성립. §15.6은 역방향(문구만·영수증 없음 = `UNVERIFIED`)만 막고 정방향은 공백 |
| **F3** | **확정** | `scripts/session-context.ts:437-446` `emit()`은 **단일 `hookSpecificOutput` JSON 한 개**를 출력. 대상 §4.2의 "state block → lessons block → plain Host footer" 순차 결합은 유효 JSON이 아니고, 수동 ritual에서는 escaped JSON 노이즈 |
| **F4** | **확정·강화** | 공식 문서 실측(`https://developers.openai.com/codex/hooks`): Codex `SessionStart`는 **plain stdout = extra developer context**, JSON `additionalContext`도 지원, matcher = `startup`/`resume`/`clear`/`compact`, **hooks는 기본 enabled**(`[features].hooks = false`로 끄는 구조). 대상 본문 §4.4·§12와 부록 §15.12.1의 자기모순 실재 |
| **F5** | **확정**(귀속 1건 정정 — §A.2) | `AGENTS.md:11`이 "상태"를 first-turn 리추얼 트리거에 포함 + `:86` *"immediately execute the next gate action"* vs 대상 §5 "status echo만" → 충돌 실재 |
| **F6** | **확정**(+리뷰 미언급 모순) | `AGENTS.md:114` — *"Session model (architect) **does not hand-code an approved/locked spec**"*, topology 조건 **없음**. 대상 `:695`는 "(full일 때)"로 한정 → 상위 규범 약화. 추가: 대상 `:152`(§5 트리거 표)는 topology 무관하게 옳게 적혀 있어 **문서 내부에서도 모순** |
| **F7** | **확정** | `.claude/settings.json:16` matcher = `"startup\|clear"`. 공식 Claude 문서는 SessionStart를 *"when a session begins **or resumes**"*로 정의 — `resume`/`compact` 미커버 |
| **F8** | **확정**(등급 상향 권고 — §A.5) | 897줄 실측 일치. Decision table 4곳 분산(§9·§15.9·§15.11.8·§15.12.5) 확인. §15.8이 "N0+N1을 β에 포함"으로 **부록에서 β 의미를 확장** |

## A.2 리뷰 서술의 부정확 (결론 무영향)

| # | 리뷰 서술 | 실측 |
|---|---|---|
| 1 | F5가 `멈춰`/`계획만`/`커밋 금지` 뭉치기를 **제안의 결함**으로 서술 | 그 뭉치기는 `AGENTS.md:121`이 이미 한 줄로 묶은 것의 **상속**이다. `AGENTS.md:110`은 "커밋 금지"를 commit 예외로 **따로** 취급 → **이중성의 근원은 AGENTS**다. 지적은 유효하나(lexicon SSOT를 만드는 문서라면 여기서 분리해야 함) 귀속은 상위 문서로 확장해야 한다 |
| 2 | *"로컬 설치본 확인: … Codex CLI `0.144.6`"* | 현재 설치본은 **`codex-cli 0.145.0`**. 리뷰 작성 이후 갱신 추정 · 결론 무영향 |
| 3 | F4 인용 URL `learn.chatgpt.com/docs/hooks#sessionstart` | 정본은 `developers.openai.com/codex/hooks`(리다이렉트 · 내용 동일) |

## A.3 리뷰 미포함 — 아키텍트 추가 발견 3건

| # | 발견 | 증거 | 함의 |
|---|---|---|---|
| **A1** | **Codex는 모델 가시 hook 출력에 ~2,500 토큰 상한**을 둔다. 초과 시 `<temp_dir>/hook_outputs/…`에 저장하고 모델에는 head/tail 프리뷰만 전달. 이 제한이 **`SessionStart` additional context에 명시 적용**된다 | 공식 문서 "Large hook output" 절 (`developers.openai.com/codex/hooks`) | 대상 §4.2의 `HARD_CAP` 9500 **chars**는 Claude 플랫폼 캡(10,000자) 기준 단일 수치다. Codex 상한은 **토큰 기준**이라 이 방어가 통하지 않는다 → **예산 축에서도 "3-host 동일 복구 모델"이 깨진다.** F3의 wire 계약과 같은 절에서 닫아야 한다 |
| **A2** | **`grok inspect`가 로드된 project instructions를 보여준다.** 또 Grok project rules는 **캡·절단 없이 전량 로드**된다 | `~/.grok/docs/user-guide/12-project-rules.md:213`(inspect) · `:177`(*"loads each project instruction file in full; there is no character cap and no truncation"*) | 대상 §15.12.1의 *"Grok 별도 공식 inventory API 약함"*은 부정확. **단 §A.4-2 유보 참조** — 이는 harness load 증거이지 model-context 증거가 아니다. `:177`은 F1 처방(rules로 N 배달)의 실현 가능성을 뒷받침한다 |
| **A3** | **이 리포는 Claude에서 이미 AGENTS 갭 상태다.** `CLAUDE.md:43`은 `@AGENTS.md` import가 아니라 마크다운 링크(`[AGENTS.md](./AGENTS.md)`)뿐 | 본 세션 실증 — 주입된 CLAUDE.md 본문에 AGENTS 전문 부재 (fable-advisor 독립 확인) | 대상 §15.12.2 A가 **이론으로만** 지적했고 현행 리포 실태는 리뷰·초안 모두 실측하지 않았다. 대조: Grok은 호환 스캔으로 AGENTS+CLAUDE 둘 다 로드(`12-project-rules.md:26`) |

## A.4 fable-advisor 자문 (model: fable · read-only)

리뷰 + 초안 + 위 검증 결과를 전달하고, **아키텍트의 서술 자체를 검증 대상으로 명시**해 자문했다(교훈 33·37·39).

**자문 verdict:** 리뷰의 PENDING-REVISION 타당 · 아키텍트 8/8 판정 유지 · **F2 처방은 A·B 둘 다 틀렸다.**

### 1) F2 처방 재설계 (결정적)

| 처방 | 자문의 기각 사유 |
|---|---|
| (A) receipt+payload 원자 주입 후 **주입 payload에서 해시 계산** | **모델은 자기 컨텍스트의 SHA-256을 계산할 수 없다.** 원자성도 채널 절단(A1이 맞다면 head/tail 절단)을 견디지 못한다 |
| (B) `norms manifest`로 격하 + **벤더별 load 증거**로 `LOADED` 판정 | 대상 §15.3 자신의 기준(**harness load ≠ model context**)과 모순된다 |
| **(제3안 · 채택 권고)** payload 자체를 **begin/end 센티널로 감싸고**, `LOADED` = **양끝 마커 + 본문 가시** | 종단 마커가 있으면 **절단 자체가 fail-loud**가 된다 |

### 2) 자문 주장 1건 정정 (아키텍트 실측)

자문은 제3안의 근거로 *"현행 `truncateContext`는 front 마커뿐이라 채널 측 꼬리 절단이 무검출"*(`session-context.ts:118`)이라고 했다. **근거 서술은 부정확하다**:

- `session-context.ts:133`은 **자기 절단 시 꼬리 마커를 붙인다** — `…[truncated N chars — 원문 파일 참조]`.
- `:26-31` 주석이 설계 의도를 명시한다 — 플랫폼은 10,000자에서 **조용히** 자르므로 `HARD_CAP` 9500으로 낮춰 **우리 절단이 먼저 발동**하게 한다.

**그러나 결론은 유지되고 오히려 강화된다:**

1. 꼬리 마커는 **우리가 절단했을 때만** 붙는다. **정상 경로**(`:121` — `HARD_CAP` 이하는 그대로 return)에는 **종단 마커가 전혀 없다** → 채널이 뒤를 자르면 소비자가 알 수 없다.
2. 9500 < 10000 방어는 **문자 기준**이다. **A1의 Codex 상한은 토큰 기준**이라 이 방어가 통하지 않는다.

즉 결함의 위치는 "front 마커뿐"이 아니라 **"정상 경로에 종단 마커가 없다"**이며, A1과 정확히 맞물린다. (교훈 33의 자문판 — 지적은 존재의 증거이지 서술의 증거가 아니다.)

### 3) 구조 진단과 프레임 전환

- **누적이 맞다** — changelog가 하루 5회 부록 적층을 보여준다(교훈 31 패턴: 축자 반영이 새 모순을 만드는 구조).
- **질문의 틀도 틀렸다**(교훈 32 프레임). 물어야 할 것은 "세 CLI에 **어떻게 배달할까**"가 아니라 **"배달이 불확실해도 안전한 구조는 무엇인가"**다.

**자문 제안 불변식 (1개 · 나머지는 여기서 유도):**

> **리추얼(파일 읽기)이 전 호스트 정본이고 inject는 가속기일 뿐이다. 적재 판정은 창 내 봉투 증거로만 하며, 증거가 없으면 클래스별 금지 행동이 발동한다** — S 부재 → 게이트 짐작 금지 · N 무증거 → 자율 commit/push 웨이브 금지.

이 불변식이 서면 **F1은 아키텍처 치명상이 아니라 "Grok도 baseline"으로 흡수된다.**

## A.5 등급·범위 조정 권고

| 항목 | 권고 | 근거 |
|---|---|---|
| **F8 등급** | Medium → **상향** | 승인 표면 결함이므로 **다음 스텝을 결정하는 항목**이다(자문). 현 문서로 "β 승인"하면 **승인 대상 자체가 미정의** |
| **Minimal revision set** | 8항목 → **9항목** | **9. 호스트별 예산 계약** — Codex 토큰 상한(A1) · Claude 문자 캡 · Grok rules 무캡을 각각 명시하고, F3의 wire 계약과 **같은 절**에서 닫는다 |
| **F2 처방** | 리뷰 원문 (A)/(B) → **제3안(begin/end 센티널 봉투)** | §A.4-1·2 |
| **A1 수치** | 개정판에 **출처 고정 필수** | 자문이 독립 확인하지 못했다. "한국어 9.5k자 > 2.5k 토큰"은 **아키텍트 추정이며 토크나이저 실측 미수행** — 마진은 크나 미실측임을 명기(교훈 39) |

## A.6 오너 결정 대기 (구현·승인 없음)

| # | 결정 | 옵션 | 자문 권고 | Owner pick |
|---|---|---|---|---|
| 1 | 승인 단위 | 현행 단일 β / **`SESSION-START-DELIVERY` · `NORMS-RECEIPT` · `CONTEXT-MAP` 3분할** | **3분할**(F8 처방) | _TBD_ |
| 2 | 개정 방식 | 지적 축자 append / **불변식 1개에서 유도해 delivery 코어 짧게 재작성** | **재작성** — append만 하면 교훈 31의 비수렴 재현 | _TBD_ |
| 3 | 저위험 2건 즉시 적용 | 함께 대기 / **분리 착수** | **분리 착수** — 초안 승인과 무관하게 독립적으로 옳음: ① `CLAUDE.md`에 `@AGENTS.md` import(A3) ② SessionStart matcher를 `startup\|resume\|clear\|compact`로 확장(F7) | _TBD_ |
| 4 | 본 append 이후 | 여기서 대기 / 즉시 개정 착수 | 자문은 **이 append만으로는 부족**하다고 판정(승인 대상 미정의가 남음) | **대기** (오너 지시 2026-07-23) |

**Must not (이 addendum):** verdict 변경 · 초안 구현 착수 · `docs/plan_review.md` R{n} 기입 · β 승인 해석.
