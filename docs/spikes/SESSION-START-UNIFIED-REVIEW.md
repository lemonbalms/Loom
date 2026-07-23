# SESSION-START-UNIFIED-PROPOSE 적대 리뷰 (비-R{n})

| Field | Value |
|---|---|
| **Target** | [`SESSION-START-UNIFIED-PROPOSE.md`](./SESSION-START-UNIFIED-PROPOSE.md) |
| **Date** | 2026-07-23 |
| **Reviewer** | Codex architect session — 현행 코드·설치본 문서·공식 벤더 문서 교차 대조 |
| **성격** | owner 요청에 따른 spike 적대 리뷰. `docs/plan_review.md`의 정식 R{n} verdict가 아님 |
| **Scope** | 규범/상태 배달 동등성 · wire contract · trigger 안전성 · lane 불변식 · acceptance |
| **Addressed in** | **rev-2** (2026-07-23) — F1–F8 · A1–A3 · D1–D7 반영. 승인/락 아님. 저위험 2건 적용: `CLAUDE.md` `@AGENTS.md` · SessionStart matcher `startup\|resume\|clear\|compact` |
| **Current verdict** | **[Addendum C](#addendum-c--rev-2-전체-독립-재리뷰-2026-07-23)** — rev-2 전체 재리뷰 **PENDING-REVISION** (Critical 0 · High 1 · Medium 4 · Low 4). 본문 F1–F8은 **폐쇄 확인**됨(§C.1) · **역사적 원장으로 읽을 것** |

## Verdict (본문 = initial 897줄 draft 대상 · 역사적 스냅샷)

**PENDING-REVISION / REQUEST CHANGES** — 권고 패키지 **β는 현재 형태로 승인하면 안 된다.**
*(→ rev-2에서 F1–F8 폐쇄 확인. 현재 유효 verdict는 **Addendum C**.)*
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

---

# Addendum B — rev-1 §11 Single Decision log 적대 리뷰 (2026-07-23)

| Field | Value |
|---|---|
| **Target** | `SESSION-START-UNIFIED-PROPOSE.md` rev-1 §11 (`:322-337`) |
| **Requested scope** | Decision log만 — 승인 원자성 · 선택 조합 · 구현 권한 · provenance |
| **Verdict** | **PENDING-REVISION** — 단일 표로 합친 방향은 옳지만 Owner sign-off용 계약으로는 아직 비폐쇄 |
| **Effect on prior verdict** | 없음. 본 addendum은 rev-1 전체 재승인이 아니며, §11 교정 조건만 추가한다 |

## B.1 Findings

Severity: **High 3 · Medium 4**.

| Severity | ID | Finding | Evidence / counterexample | Required change |
|---|---|---|---|---|
| **High** | D1 | **DELIVERY package 승인과 그 package의 필수 trigger split 유예를 동시에 허용한다.** §4는 DELIVERY가 trigger/precedence를 소유하고 §12 Phase 2도 DELIVERY 작업으로 둔다. 그런데 Decision #5는 `later`를 허용한다. | 대상 `:69-75`, `:326`, `:330`, `:347`; 허용 조합: `#1 DELIVERY=yes` + `#5 trigger split=later` → F5가 남은 package를 승인 | #5를 독립 결정에서 제거한다. **DELIVERY 승인/구현 시 trigger split은 package 필수 구성**으로 고정한다. 정말 optional이면 §4 package 정의에서 먼저 분리한다. |
| **High** | D2 | **design approval과 implementation authorization 상태가 섞였다.** #1–3은 package 승인, #6은 구현 여부를 별도로 묻지만 approval block은 `approved-for-implement | still draft` 두 상태뿐이다. | 대상 `:326-337`; 허용 조합: `#1=yes`, `#6=no`인데 기록 가능한 상태는 `approved-for-implement` 또는 `still draft`뿐 | 상태를 `design-approved`, `implementation-authorized`, `deferred`, `still-draft`로 분리하고 package별로 기록한다. design 승인만으로 구현 권한을 만들지 않는다. |
| **High** | D3 | **#6 `all packages`가 defer/changes 상태 package까지 구현하도록 허용한다.** 승인 집합과 구현 집합 사이 subset 제약이 없다. | 대상 `:326-331`; 허용 조합: `DELIVERY=yes`, `NORMS=defer`, `MAP=defer`, `Implement=all packages` | #6을 `Implementation set: none | <design-approved package IDs only>`로 바꾸고 **implementation set ⊆ design-approved set**을 문장 불변식으로 둔다. |
| Medium | D4 | **L0 `later`가 Phase 0과 SSOT 소유권을 깨뜨린다.** L0는 DELIVERY 계약의 소유자이고 Phase 0은 구현 전 L0 추출을 요구하지만 #4는 이를 미룰 수 있다. | 대상 `:89-95`, `:329`, `:343-347`; `DELIVERY=yes`, `L0=later`, `Implement=DELIVERY only`면 Phase 1–2가 정본 L0 없이 시작 가능 | #4를 선택지에서 제거하고 `DELIVERY implementation authorization prerequisite = docs/SESSION-START.md created`로 고정한다. design 승인 후 구현을 하지 않을 때만 L0 생성을 미룰 수 있다. |
| Medium | D5 | **NORMS 승인 질문이 BEGIN/END 형상만 묻고 실제 pack 계약은 잠그지 않는다.** §7은 “실제 규범 바이트”, “요약본 허용”, “범위는 pack 정의”라고 하지만 rev-1에는 pack별 source range·요약 생성 SSOT·예산·stale 규칙이 없다. | 대상 `:208-225`, `:327`; `Approve NORMS-RECEIPT (BEGIN/END)=yes`만으로는 envelope 안에 무엇을 넣을지 구현자가 결정해야 함 | #2를 `approve after pack contract`로 낮추거나, 승인 전에 pack registry(source bytes/range, regeneration, budget, stale rule)를 본문에 고정한다. |
| Medium | D6 | **“Single Decision log” 밖에서 이미 적용된 변경의 추인 상태가 없다.** Addendum A §A.6-3의 Owner pick은 TBD였으나 rev-1 §12는 `CLAUDE.md` import와 matcher 확장을 이미 applied로 기록하고 실제 working tree도 수정돼 있다. | 리뷰 `:212-219`; 대상 `:352-355`; 현행 `CLAUDE.md`, `.claude/settings.json` modified | Decision log에 `Ratify pre-applied A3/F7 changes: accept / revise / revert`를 추가하고 Owner pick을 남긴다. 독립 적용 근거가 별도 오너 지시라면 그 provenance를 기입한다. |
| Medium | D7 | **approval provenance가 mutable `rev-1` 문자열뿐이다.** 현재 대상은 미커밋 수정본이라 승인 후 같은 rev 표기 아래 내용이 바뀔 수 있고, approval block은 실제 선택 집합을 보존하지 않는다. | 대상 `:333-337`; working tree에서 대상 문서가 modified | approval record에 `target blob/commit`, design-approved set, implementation-authorized set, deferred set, pre-applied ratification, Owner, Date를 모두 기록한다. 내용 변경 시 재승인 규칙도 한 줄 둔다. |

## B.2 Invalid combinations currently representable

현재 §11 표는 아래 세 조합을 문법적으로 허용하지만 의미상 허용하면 안 된다.

```text
A. DELIVERY=yes · trigger split=later
   → DELIVERY가 소유한 F5 수정 없이 DELIVERY 승인

B. DELIVERY=yes · NORMS=defer · MAP=defer · Implement=all packages
   → 미승인 package 구현 권한 생성

C. DELIVERY=yes · L0=later · Implement=DELIVERY only
   → L0 SSOT 없이 adapter/AGENTS 구현 시작
```

Decision log의 합격 조건은 “선택지가 다 채워짐”이 아니라 **어떤 선택 조합도 package
불변식과 Phase 선행조건을 위반하지 않음**이다.

## B.3 Recommended replacement

§11은 아래처럼 승인 상태와 구현 권한을 분리하고, L0/trigger split은 선택지가 아니라
DELIVERY 구현 선행조건으로 이동하는 것이 가장 작고 안전하다.

```markdown
## 11. Single Decision log

**Constraint:** implementation-authorized ⊆ design-approved.
DELIVERY 구현 선행조건 = L0 생성 + AGENTS trigger split 반영.

| # | Decision | Options | Owner pick |
|---|---|---|---|
| 1 | DELIVERY design | approve rev-1 / changes / defer | _TBD_ |
| 2 | NORMS design | approve after pack contract / changes / defer | _TBD_ |
| 3 | CONTEXT-MAP M0 design | approve / defer | _TBD_ |
| 4 | Implementation authorization | none / approved package IDs | _TBD_ |
| 5 | Pre-applied A3/F7 | accept / revise / revert | _TBD_ |

Target revision: rev-1
Target blob/commit: <sha>
Design-approved: <package IDs | none>
Implementation-authorized: <subset | none>
Deferred/changes: <package IDs + reason>
Pre-applied A3/F7: <accepted | revise | reverted>
Owner: <name>
Date: YYYY-MM-DD
```

## B.4 Re-review acceptance

§11 재리뷰는 다음이 모두 참일 때 통과한다.

1. DELIVERY 승인과 trigger split 유예를 동시에 고를 수 없다.
2. design 승인만으로 `approved-for-implement` 상태가 생기지 않는다.
3. implementation set은 design-approved set의 부분집합으로만 표현된다.
4. DELIVERY 구현은 L0와 AGENTS trigger split 없이 시작할 수 없다.
5. NORMS 승인은 BEGIN/END뿐 아니라 pack payload 계약을 가리킨다.
6. 이미 적용된 A3/F7의 Owner 추인 또는 별도 지시 provenance가 한곳에 남는다.
7. 승인 대상의 immutable revision과 실제 package 선택 집합이 기록된다.

## B.5 Bounded conclusion

rev-1은 원안의 분산 Decision table을 한곳으로 합친 점에서 **F8 방향은 해소에 접근했다**.
그러나 현재 §11은 상호 모순 조합과 미승인 구현 권한을 표현할 수 있으므로 **Owner pick을
받기 전 위 D1–D7 교정이 필요하다.** 본 판정은 §11 approval surface에 한정하며 rev-1의
delivery/receipt/map 본문 전체에 대한 최종 APPROVE를 의미하지 않는다.

---

# Addendum C — rev-2 전체 독립 재리뷰 (2026-07-23)

| Field | Value |
|---|---|
| **Target** | `SESSION-START-UNIFIED-PROPOSE.md` **rev-2 전문 (479줄)** |
| **Target blob (D7)** | **`38202ff:docs/spikes/SESSION-START-UNIFIED-PROPOSE.md`** — 리뷰 수행 시점은 미커밋 워킹트리였고, 동일 내용이 `38202ff`로 freeze됨. 이후 내용 변경 시 본 addendum은 그 revision에 대한 판정이 아니다 |
| **Requested scope** | **전체** (§0–§15). Addendum B와 달리 §11 한정이 아님 |
| **Reviewer** | `fable-advisor` (model: fable · read-only) — 오너 지시에 따른 독립 재리뷰 · 아키텍트 실측 2건 병기 |
| **Verdict** | **PENDING-REVISION** — Critical 0 · **High 1** · Medium 4 · Low 4 |
| **Effect on prior verdict** | 초기 F1–F8 및 Addendum B D1–D7의 **폐쇄를 확인**한다(§C.1). 본 addendum이 **현재 유효 verdict**다 |
| **재리뷰 없는 오너 승인** | **불가** — rev-2 §11 자체 규칙(full rev-2 재리뷰 APPROVE라야 approve 유효)에 의해 무효 |
| **대조 범위** | rev-2 전문 · 본 리뷰 원장 3층 · `scripts/session-context.ts` · `.claude/settings.json` · `CLAUDE.md`(워킹트리) · `AGENTS.md` · `tasks/traps.md` · `scripts/handoff-headings.ts` · `~/.grok/docs/user-guide/10-hooks.md`·`12-project-rules.md` |

> **좌표 규약 (교훈 47):** 본 addendum의 `:n` 좌표는 **rev-2 워킹트리** 기준이다.
> F1–F8·Addendum A는 `ed90206c:docs/spikes/SESSION-START-UNIFIED-PROPOSE.md`(initial 897줄),
> Addendum B는 rev-1(미커밋·현존하지 않음) 기준이다. 층을 섞어 읽지 말 것.

## C.1 폐쇄 검증 — 20항목 중 19 verified-closed

`addressed`(저자 주장) ≠ `verified`(독립 확인)를 구분해 판정했다.

| 항목 | 판정 | 근거 |
|---|---|---|
| **F1** | **verified closed** | `10-hooks.md:260` 축자 재확인 · §5.3/§13/§14가 "Grok SessionStart stdout을 acceptance 근거로 쓰지 않는다"로 일관 |
| **F4** | verified closed | Codex hook primary + ritual fallback으로 본문·matrix 정합 |
| **F5** | verified closed | precedence + capability mask 분리 |
| **F6** | verified closed | 손코딩 금지 주어 = session architect · topology 조건 제거 |
| **F8** | verified closed | 3분할 + 단일 Decision log |
| **F2** | **verified closed (N 클래스 한정)** | Addendum A 제3안(BEGIN/END 봉투) 채택 · `loaded_via`를 claimed metadata로 격하 |
| **F3** | **부분 폐쇄** | 포맷 분리(raw/claude-json/codex-plain/grok-launch)는 닫혔으나 **S 봉투가 반쪽** → **H1** |
| **F7** | **부분 폐쇄** | acceptance 축은 정의됐고 셀 미기입 (구현 단계 몫으로 표기됨) |
| **A1** | **verified closed + 정직** | `:158`이 *"한국어 9.5k chars > 2.5k tokens는 추정·토크나이저 미실측"*을 명기 — 교훈 30·39 준수 |
| **A2 · A3** | verified | `12-project-rules.md:177`(무캡)·`:213`(`grok inspect`) 일치 · `CLAUDE.md:3`에 `@AGENTS.md` 실적용 확인 |
| **9번째 (호스트 예산 계약)** | closed | §5.4가 §5.2와 **같은 절(§5)**에서 동시에 닫힘 |
| **D1–D7** | **전부 verified closed** | B.3 교체안대로 구현 |

**B.2 invalid combination 3종 — 조합 직접 열거 결과 전부 표현 불가:**

| 조합 | rev-2 판정 |
|---|---|
| **A** `DELIVERY=yes` + `trigger split=later` | 선택지 **소멸** (package 필수 구성으로 이동) |
| **B** `NORMS=defer` + `Implement=all packages` | #4 옵션이 `design-approved IDs only`로 **문법 차단** + subset 제약 문장 |
| **C** `DELIVERY=yes` + `L0=later` | 선택지 **소멸** · Phase 1–2 시작 금지 명문 |

**사실 주장 대조:** §5.2 훅 2분할 · §5.4 Claude 10k/`HARD_CAP` 9500 · §7.3 pack source(AGENTS Standing rules 5행 + Pause 절 + `traps.md:20` `## 하지 말 것`) · §14 vendor 표 — **전부 실파일과 일치**.

## C.2 Findings (신규)

| Severity | ID | Finding | Evidence | Required change |
|---|---|---|---|---|
| **High** | **H1** | **S 봉투가 begin 센티널뿐 — §0의 "봉투 증거"가 S 클래스에서 미구현.** §5.2 builder 계약은 *"plain text **starting with** [센티널]"*로 시작만 규정하고 **END 마커가 없다**. §5.4는 *"prefer begin+end envelope on normal path too"*라고 **Defense 열의 소망 표현**으로만 적었다. 정상 경로에서 채널 측 꼬리 절단이 무검출로 남아(Addendum A §A.4-2 잔존) smoke **#2·#7이 기계적으로 판정 불가**하고, re-review Q2·Q6이 부분 답변에 그친다 | rev-2 `:120-124`(builder) vs `:152`(prefer) vs `:361-362`(smoke #2·#7); `session-context.ts:121`(캡 이하 무마커 return) | §5.2에 S `state`/`lessons` **END 마커를 규범으로 승격**하고, **"END 부재 → S ≠ full"** 판정 규칙을 §9(Template I)에 명문화 |
| Medium | M1 | **N 봉투의 호스트별 배달 배선이 패키지 사이 무주공산이다.** §5.3은 S 훅만 배선하고, NORMS 패키지는 "delivery adapters 비범위", DELIVERY 패키지는 "receipt deep-dive 비범위"로 서로 미룬다. Claude에서 N 봉투가 제3의 훅인지, 어느 wire grammar를 쓰는지 문서 어디에도 없다 | rev-2 `:89-91`, `:139-146`, `:282-289` | N accelerator 배선(호스트·훅·grammar·예산)을 DELIVERY §5.3에 1행 추가하고 NORMS는 그것을 참조하게 한다 |
| Medium | M2 | **§5.3의 "N primary" 채널은 §7.1 기준 전부 `UNVERIFIED`다** (rules·`CLAUDE.md` 평문 = 봉투 없음). §0에 따라 **모든 호스트가 매 세션 자율 commit/push 금지 상태로 시작**하는데, 해제 경로(`norms:raw` 리추얼 또는 봉투 accelerator)가 운영 절차로 명시돼 있지 않다. **델리버리 렌즈와 증거 렌즈가 봉합되지 않은 이음새** — "적층이 아니라 유도"라는 주장의 반례 | rev-2 `:139-143` vs `:243-249` | §5.3 각 행에 **"N=LOADED 도달 경로"** 열을 추가 (예: Grok = 세션당 `norms:raw` Read) |
| Medium | M3 | **Codex head/tail 프리뷰는 중간 생략이므로, 마커 8개가 전부 보이면서 본문만 빠지는 `LOADED` false positive가 가능하다.** enablement 실측 게이트는 켤 때만 막고, source(AGENTS/traps)는 살아있는 파일이라 **드리프트 재측정 게이트가 없다** | rev-2 `:257-259`(END 부재만 상정), `:286-288` | ① *"봉투 내부에 채널 생략 표식 발견 → `UNVERIFIED`"* 규칙 1줄 ② enabled host의 NORMS 예산을 commit gate(lint류)에 편입 |
| Medium | M4 | **강제력 등급(enforcement class)이 표기되지 않았다.** §6 capability mask·§13 must-not·§0 금지 행동이 전부 산문 규칙인데, 이 리포의 실증은 **문서 규칙 4/4 위반 · 코드 락 3/3 준수**다. 어느 규칙이 코드 락이고 어느 것이 산문인지 선언되지 않아 운영 시 **어디가 먼저 무너질지 예측 불가**하다 | rev-2 전반; 오너 제공 실증 | 각 규칙에 `code-lock / lint-gate / prose` 1열 표기. **새 락 인프라 요구가 아니라 현 상태의 선언**이다 |
| Low | L1 | **§5.2의 "센티널로 시작한다" 계약을 현행 코드가 이미 위반한다** — omit 경고줄과 truncation head가 센티널 **앞**에 붙는다 | `session-context.ts:181`(`${warn}\n\n${body}`)·`:132`(head) | 계약을 *"본문 첫 줄 = 센티널, **진단 줄 선행 허용**"*으로 완화 |
| Low | L2 | 복합 발화("상태 확인하고 이어서 해") 처리 미정. precedence 2>3이면 read-only로 귀결돼 오너 의도와 역행 (보수적이라 안전 방향이긴 하다) | rev-2 §6.1 | 복합 발화 1행 추가 |
| Low | L3 | **STALE 판정의 절차·주체가 미정**이고(모델은 해시를 계산할 수 없다 — 자문 자신의 F2 논거), `packs` digest가 per-pack인지 전체인지 문언이 모호하다 | rev-2 `:233` vs `:273` | 판정 주체를 스크립트/게이트로 고정하고 digest 단위를 한 문장으로 확정 |
| Low | L4 | Grok은 `0.2.111`로 버전 핀이 있으나 **Codex hooks 주장은 무핀**이다 (설치본 `0.145.0`, 원 리뷰는 `0.144.6` 기준) | rev-2 §5.3·§14 | Codex 주장에 버전 핀 부기 |

## C.3 아키텍트 실측 확인 (자문 주장의 독립 대조)

교훈 33에 따라 자문의 지적을 **서술까지** 대조했다. 두 건 모두 **성립**한다.

| ID | 대조 | 결과 |
|---|---|---|
| **H1** | rev-2 `:120-124` · `:152` · `:361-362` | 성립. builder 계약은 `starting with`만 규정하고 END 부재. `:152`의 `prefer begin+end`는 **Defense 열 소망 표현**이지 wire 규범이 아니다. smoke #2(*"hook exit 0 but no envelope → not full"*)·#7(*"over token budget → partial/fail-loud"*)은 **begin 마커만으로 판정 불가** — 뒤가 잘려도 begin은 살아남는다 |
| **L1** | `scripts/session-context.ts:150-183` | 성립. `pack()`이 `${omittedWarnLine(...)}\n\n${body}` 형태로 **경고줄을 body 앞에** 붙이고, `truncateContext:132`도 head를 앞에 붙인다. `starting with [LOOM-SESSION-CONTEXT v1 · state]` 계약은 **omit·절단 시 실제로 위반**된다 |

## C.4 §0 불변식 재검증 (자기 제안에 대한 자문의 자기 검증)

§0은 Addendum A에서 **fable-advisor 자신이 제안**한 불변식이다. 자기 제안이라는 이유로 통과시키지 않도록 명시 지시했고, 자문의 판정은 다음과 같다.

- **문안 이식은 옳다.** §5·§7·§10은 머리말 장식이 아니라 **실제 유도 관계**다.
- **그러나 rev-2는 불변식을 과소 적용했다.** "봉투 증거"를 **N에는 완전히, S에는 반쪽으로** 구현한 것이 **H1**이고, N 증거 규칙을 델리버리 매트릭스에 **되먹이지 않은** 것이 **M2**다.
- **불변식 자체의 충분성:** 문서 전체를 지탱하기에 **충분하다**. G 클래스에는 증거 규칙이 사실상 없으나(§9 "이번 세션 툴 로드만") **G는 저하중이라 결함이 아니다**.

## C.5 신뢰도 유보 (bounded claims)

1. **자문은 Codex 공식 문서를 이번 세션에서 재fetch하지 못했고**, Addendum A의 실측을 인용 근거로 삼았다. 다만 해당 상한은 **아키텍트가 1차 출처를 직접 읽은 것**이다(`developers.openai.com/codex/hooks` — "Large hook output"). 근거는 유지되나 **재확인 주체가 1인**임을 명기한다.
2. **M4는 아키텍트 프롬프트가 유도한 발견이다.** "문서 규칙 4/4 위반 vs 코드 락 3/3 준수" 실증을 예시로 제공했으므로 **독립 발견이 아니다.** 지적 자체의 타당성과는 별개로 이 provenance를 함께 읽어야 한다.
3. **라이브 멀티호스트 스모크는 여전히 미수행**이다. 본 addendum의 판정은 **문서 계약 + 현행 실행 표면의 정적 대조**로만 성립하며, rev-2 §10.2 자신이 "Live multi-host smoke = implement-phase"로 미룬 것과 일치한다.
4. 본 addendum은 **비-R{n}** spike 리뷰다. `docs/plan_review.md` verdict를 대체하지 않는다.

## C.6 rev-3 minimal revision set (좁음)

재개봉 **금지 구역: §0 · §6 · §8 · §11** — 이번 범위에서 하중을 받지 않는다(교훈 49: 락을 흔드는 처방은 범위 실측 후에만).

| # | 항목 | 수정 위치 | 규모 |
|---|------|-----------|------|
| 1 | **H1** — S END 마커 규범 승격 + "END 부재 → S≠full" 판정 | §5.2 · §9 · §10.2 | 약 6줄 |
| 2 | **M1·M2** — "N=LOADED 도달 경로" 열 추가 | §5.3 | 열 1개 |
| 3 | **M3** — 채널 생략 표식 → `UNVERIFIED` 규칙 + NORMS 예산 commit gate | §7 | 2줄 |
| 4 | **M4** — enforcement class 열 (`code-lock`/`lint-gate`/`prose`) | 규칙 표 전반 | 열 1개 |
| 5 | L1–L4 | §5.2 · §6.1 · §7 · §5.3·§14 | 동반 수정 · **blocker 아님** |

**이후 절차:** rev-3은 **delta 재리뷰**로 충분하다(전면 재리뷰 불요) — 변경된 절 + full-doc 무결성 diff 확인. 그것이 통과해야 rev-2 §11의 approve eligibility가 성립한다.

**선행 권고 (D7 잔존 리스크):** 현재 rev-2·`CLAUDE.md`·`.claude/settings.json`이 **전부 미커밋**이다. D7이 지적한 *"mutable 문자열이 승인 대상"* 문제가 실재하므로, 개정·승인 중 무엇을 하든 **immutable blob/commit freeze가 선행**되어야 한다.

**Must not (이 addendum):** rev-2 설계 승인으로 해석 · §0/§6/§8/§11 재개봉 · 구현 착수 · `docs/plan_review.md` R{n} 기입.
