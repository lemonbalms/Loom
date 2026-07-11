# Claude Fable 5 사용 가이드

작성일: 2026-07-11
근거 범위: 이 문서의 모든 내용은 Anthropic 공식 프롬프팅 가이드와 공식 블로그(Claude Code 팀 Field Guide)에서 원문으로 확인된 사항입니다. 복수 출처에서 교차 확인된 커뮤니티 실전 기법은 본문에 `(커뮤니티 교차 검증)`으로 별도 표시했습니다. 미확정 정보(사용량 포함 기한 등)와 검증되지 않은 개별 사례는 이 문서에서 제외했습니다.

영문 프롬프트 블록은 공식 가이드 원문 그대로 수록했습니다. 번역하지 않고 원문을 쓰는 이유는, 이 블록들이 Anthropic이 자체 테스트로 효과를 확인한 문구이기 때문입니다.

---

## 1. 이 모델은 무엇이 다른가

Fable 5는 사람이 몇 시간에서 몇 주에 걸쳐 수행하는 end-to-end 작업에 최적화된 모델입니다. 공식 가이드는 "가장 어려운 미해결 문제에 투입한 팀이 최고 성과를 보았고, 간단한 워크로드로만 테스트하면 능력 범위를 과소평가하게 된다"고 명시합니다. 간단한 작업도 안정적으로 처리하지만, 이 모델의 가치는 어려운 작업에서 나옵니다.

공식 문서가 확인한 개선 영역은 일곱 가지입니다. 장기 자율성(며칠 단위 목표 지향 실행과 지시 유지), 복잡하고 명세가 명확한 문제의 first-shot 정확성, 비전(밀도 높은 기술 이미지와 스크린샷 해석), 엔터프라이즈 워크플로우(재무 분석·스프레드시트·슬라이드·문서), 코드 리뷰와 디버깅(버그 발견 recall이 Opus 4.8보다 뚜렷이 높음), 모호성 탐색(복잡한 다중 스레드 요청에서 다음 단계 결정), 그리고 병렬 서브에이전트의 위임과 협업입니다.

운영상 가장 큰 변화는 **턴이 길어진다**는 점입니다. 높은 effort에서 개별 요청이 수 분간 실행될 수 있고, 자율 실행은 수 시간 지속될 수 있습니다. 공식 가이드는 마이그레이션 전에 클라이언트 타임아웃·스트리밍·진행 표시를 조정하고, 실행 완료를 블로킹으로 기다리는 대신 스케줄 잡 등으로 비동기 확인하는 구조를 권장합니다.

프롬프팅의 역할도 바뀝니다. 각 단계를 조종하는 것이 아니라, 방향을 설정하고 결과를 검증하는 것이 프롬프트의 일이 됩니다. 아래 다섯 원칙이 그 방법입니다.

---

## 2. 다섯 가지 운영 원칙

### 원칙 1. 단계가 아니라 이유를 준다

Fable 5는 요청 뒤의 의도를 이해할 때 성능이 좋아집니다. 맥락이 있으면 작업을 관련 정보에 연결할 수 있고, 없으면 스스로 의도를 추측해야 하기 때문입니다. 공식 템플릿:

```
I'm working on [the larger task] for [who it's for]. They need [what the output enables].
With that in mind: [request].
```

instruction following이 강해졌기 때문에, 행동을 하나하나 열거하는 대신 짧은 지시 하나로 대부분의 행동을 조종할 수 있습니다. 반대로 이전 모델을 위해 작성한 상세한 단계별 지시는 이제 부담이 됩니다. 공식 가이드 원문: 이전 모델용 스킬은 "often too prescriptive for Claude Fable 5 and can degrade output quality." 오래된 지시를 제거했을 때 기본 성능이 더 나은지 검토하라는 것이 공식 권고입니다.

모호한 작업에서 과잉 계획을 막는 공식 블록:

```
When you have enough information to act, act. Do not re-derive facts already established
in the conversation, re-litigate a decision the user has already made, or narrate options
you will not pursue in user-facing messages. If you are weighing a choice, give a
recommendation, not an exhaustive survey. This does not apply to thinking blocks.
```

### 원칙 2. Effort로 조절한다

Effort는 지능·지연·비용 트레이드오프의 1차 제어 수단입니다.

| 작업 유형 | 권장 Effort | 비고 |
|-----------|-------------|------|
| 대부분의 작업 | `high` | 공식 기본 권장값 |
| 능력이 가장 중요한 워크로드 | `xhigh` | 가장 엄밀한 검증 행동과 출력. 루틴 작업에서는 과잉 탐색 가능 |
| 루틴 작업 | `medium` / `low` | 낮은 effort도 이전 모델의 xhigh 성능을 넘는 경우가 많음(공식 명시) |

운영 규칙 두 가지입니다. 작업이 완료되긴 하는데 불필요하게 오래 걸리면 effort를 낮춥니다. 더 빠른 대화형 작업 스타일을 원할 때도 낮춥니다.

API 사용 시 주의: thinking은 항상 켜져 있고 adaptive 모드만 지원됩니다. `budget_tokens`를 설정하면 400 에러가 반환됩니다. 비용 상한이 필요하면 effort를 낮추거나 `max_tokens`를 사용합니다.

### 원칙 3. 경계를 명시한다

Fable 5는 가끔 요청하지 않은 행동을 합니다. 공식 가이드가 든 예시는 요청 없는 이메일 초안 작성과 방어적 git 브랜치 백업 생성입니다. 두 가지 공식 블록으로 경계를 정의합니다.

범위 초과 방지(코딩에서 특히 중요):

```
Don't add features, refactor, or introduce abstractions beyond what the task requires.
A bug fix doesn't need surrounding cleanup and a one-shot operation usually doesn't need
a helper. Don't design for hypothetical future requirements: do the simplest thing that
works well. Avoid premature abstraction and half-finished implementations. Don't add
error handling, fallbacks, or validation for scenarios that cannot happen. Trust internal
code and framework guarantees. Only validate at system boundaries (user input, external
APIs). Don't use feature flags or backwards-compatibility shims when you can just change
the code.
```

분석과 수정의 구분(문제를 설명하거나 소리 내어 생각할 때 임의로 고치지 않게):

```
When the user is describing a problem, asking a question, or thinking out loud rather than
requesting a change, the deliverable is your assessment. Report your findings and stop.
Don't apply a fix until they ask for one. Before running a command that changes system
state (restarts, deletes, config edits), check that the evidence actually supports that
specific action. A signal that pattern-matches to a known failure may have a different cause.
```

멈춰야 할 때만 멈추게 하는 체크포인트 규칙:

```
Pause for the user only when the work genuinely requires them: a destructive or
irreversible action, a real scope change, or input that only they can provide. If you hit
one of these, ask and end the turn, rather than ending on a promise.
```

### 원칙 4. 증거로 검증시킨다

장시간 자율 실행에서 진행 주장을 실제 도구 결과에 대조시키는 것이 가장 중요한 안전장치입니다. Anthropic은 자체 테스트에서 아래 지시가 조작된 상태 보고를 유도하도록 설계된 과제에서조차 허위 보고를 거의 제거했다고 공식 명시했습니다.

```
Before reporting progress, audit each claim against a tool result from this session.
Only report work you can point to evidence for; if something is not yet verified, say so
explicitly. Report outcomes faithfully: if tests fail, say so with the output; if a step
was skipped, say that; when something is done and verified, state it plainly without hedging.
```

자기비판보다 검증자 서브에이전트가 낫습니다. 공식 가이드 원문: "Separate, fresh-context verifier subagents tend to outperform self-critique." 장기 실행 작업에는 다음을 지시합니다.

```
Establish a method for checking your own work at an interval of [X] as you build.
Run this every [X interval], verifying your work with subagents against the specification.
```

### 원칙 5. 메모리를 만든다

Fable 5는 이전 실행의 교훈을 기록하고 참조할 수 있을 때 특히 성능이 좋습니다. Markdown 파일 하나면 충분합니다. 기록 규칙의 공식 원문:

```
Store one lesson per file with a one-line summary at the top. Record corrections and
confirmed approaches alike, including why they mattered. Don't save what the repo or
chat history already records; update an existing note rather than creating a duplicate;
delete notes that turn out to be wrong.
```

기존 대화 이력에서 메모리를 처음 구축할 때:

```
Reflect on the previous sessions we've had together. Use subagents to identify core
themes and lessons, and store them in [X]. Make sure you know to reference [X] for future use.
```

---

## 3. 사용자 커뮤니케이션 규칙

긴 에이전트 세션에서 Fable 5는 읽기 어려운 텍스트를 만들 수 있습니다. 화살표 체인 shorthand, 깊은 구현 세부사항, 사용자가 본 적 없는 사고 과정에 대한 참조 등입니다. 공식 가이드의 해결책은 다음 원칙입니다: **내부 작업 중에는 간결한 shorthand를 써도 되지만, 사용자에게 보내는 최종 메시지는 그 어떤 작업 과정도 보지 않은 독자를 위해 작성해야 합니다.** 공식 블록 전문:

```
Terse shorthand is fine between tool calls (that's you thinking out loud, and brevity
there is good). Your final summary is different: it's for a reader who didn't see any of that.

If you've been working for a while without the user watching (overnight, across many tool
calls, since they last spoke), your final message is their first look at any of it. Write
it as a re-grounding, not a continuation of your working thread: the outcome first, then
the one or two things you need from them, each explained as if new. The vocabulary you
built up while working is yours, not theirs; leave it behind unless you re-introduce it.

When you write the summary at the end, drop the working shorthand. Write complete
sentences. Spell out terms. Don't use arrow chains, hyphen-stacked compounds, or labels
you made up earlier. When you mention files, commits, flags, or other identifiers, give
each one its own plain-language clause. Open with the outcome: one sentence on what
happened or what you found. Then the supporting detail. If you have to choose between
short and clear, choose clear.
```

간결성 자체도 짧은 지시 하나로 조종됩니다. 패턴별 금지 목록을 나열할 필요가 없습니다.

```
Lead with the outcome. Your first sentence after finishing should answer "what happened"
or "what did you find": the thing the user would ask for if they said "just give me the
TLDR." Supporting detail and reasoning come after. Being readable and being concise are
different things, and readability matters more.

The way to keep output short is to be selective about what you include (drop details that
don't change what the reader would do next), not to compress the writing into fragments,
abbreviations, arrow chains like A → B → fails, or jargon.
```

---

## 4. 상세 케이스

### 4.1 개발

**난이도 상단에서 시작합니다.** 공식 scaffolding 권고의 첫 항목입니다. 이전 모델에 맡길 수준보다 어려운 과제를 골라, Fable 5가 스스로 스코핑하고, 명확화 질문을 하고, 실행하게 합니다.

**코딩 프롬프트의 기본 골격**은 확인된 공식 블록의 조합입니다.

```
[목표와 이유: 무엇을, 누구를 위해, 왜 만드는지]
[현재 상태: 코드베이스, 문제, 기술 스택]
[구체적 요청]

When you have enough information to act, act.
Don't add features, refactor, or introduce abstractions beyond what the task requires.
Before reporting progress, audit each claim against a tool result from this session.
```

**미지(unknowns)를 관리합니다.** Claude Code 팀의 공식 Field Guide가 제시한 핵심 개념입니다. 출력 품질의 병목은 모델이 아니라, 요청한 것(map)과 실제 필요한 것(territory) 사이의 간극입니다. 지시가 너무 구체적이면 피벗이 더 적절한 상황에서도 지시를 따르고, 너무 모호하면 업계 관행에 기반한 추측을 합니다. 구현 전·중·후에 걸쳐 반복적으로 unknowns를 발견하는 것이 에이전틱 코딩의 기술입니다. Field Guide의 실전 기법:

```
Keep an implementation-notes.md file. If you hit an edge case that forces you to deviate
from the plan, pick the conservative option, log it under 'Deviations', and keep going.
```

작업 완료 후에는 이 노트·스펙·프로토타입을 하나의 문서로 패키징해 리뷰어의 승인 과정을 가속할 수 있습니다.

**병렬 서브에이전트를 적극 사용합니다.** 공식 권고는 세 가지입니다. 서브에이전트를 자주 쓰되 위임이 적절한 시점에 대한 명시적 가이드를 제공하고, 각 서브에이전트의 반환을 기다리며 블로킹하지 말고 비동기로 통신하며, 컨텍스트를 유지하는 장수명 서브에이전트로 캐시 읽기 절감과 병목 회피를 얻습니다. 기본 지시:

```
Delegate independent subtasks to subagents and keep working while they run.
Intervene if a subagent goes off track or is missing relevant context.
```

**모델 라우팅** (커뮤니티 교차 검증): Fable은 판단이 필요한 작업(아키텍처, 마이그레이션 계획, 복잡한 디버깅, 최종 리뷰)에 배치하고, 소규모 편집·보일러플레이트·기계적 구현은 저비용 모델에 맡기는 분업이 널리 권장됩니다. 큰 변경은 plan mode에서 시작해 explore, plan, execute, verify를 분리하는 흐름과 함께 쓰입니다.

### 4.2 스킬

**기존 스킬 재작성이 최우선 과제입니다.** 공식 가이드가 명시적으로 경고한 유일한 "기존 자산이 해가 되는" 항목입니다. 이전 모델용 스킬은 Fable 5에 과도하게 규범적이어서 출력 품질을 떨어뜨릴 수 있습니다. 마이그레이션 시 두 가지를 검토합니다.

첫째, 오래된 지시를 제거했을 때 기본 성능이 더 나은지 확인합니다. 약한 모델의 실패 모드를 보정하기 위한 가드레일, 이제 설명할 필요 없는 절차 레시피가 제거 후보입니다.

둘째, 추론 재현 지시를 감사합니다. 내부 추론을 응답 텍스트로 echo, transcribe, explain하라는 지시가 스킬·프롬프트·하네스에 남아 있으면 `reasoning_extraction` 거부를 유발해 Opus 4.8 폴백이 늘어납니다. 이것은 공식 가이드가 마이그레이션 시 감사하라고 명시한 항목입니다.

**스킬 유지보수를 위임할 수 있습니다.** 공식 가이드 원문: "Claude Fable 5 also does a good job of updating skills on the fly based on what it learns from the task at hand." 작업 중 배운 것으로 스킬을 갱신하게 하는 것이 공식적으로 권장되는 사용법입니다.

**스킬 감사 프롬프트** (커뮤니티 교차 검증, 공식의 too-prescriptive 근거와 결합): 새 모델에 실전 작업을 맡기기 전에 지시 파일 전체를 감사시키는 접근이 효과적입니다.

```
Read your own instruction files (CLAUDE.md, skills, rules, memory files) end to end.
1. Where do they contradict each other? Quote both sides.
2. Which rules exist to manage a weaker model: guardrails for failure modes you don't
   have, recipes for things you no longer need spelled out, hardcoded facts that have
   drifted? List them with file:line.
3. Which rules teach by bad example: documents that violate the patterns they prescribe?
4. What would you delete? What would you keep exactly as is, and why?
Don't fix anything yet. Report first. I decide what gets cut.
```

마지막 두 문장이 중요합니다. 감사는 모델의 판단이지만 삭제 결정은 사람이 내립니다.

**새 스킬 작성 원칙** (커뮤니티 교차 검증): 의도·경계·검증 훅을 기술하고 단계별 절차는 쓰지 않습니다. 행동을 바꾸지 않는 줄은 삭제해 한 화면 분량을 유지합니다. "조심하라"는 권고 대신 체크 가능한 검증 규칙(증거 규칙, diff 자가 점검)을 정의합니다. 이 원칙들은 공식 가이드의 프롬프트 블록들이 실제로 취하는 형태와 일치합니다.

### 4.3 커맨드 (Claude Code)

이 절은 커뮤니티 교차 검증 자료 기반이며, 세부 동작은 Claude Code 공식 문서(docs.claude.com/en/docs/claude-code)에서 최종 확인을 권장합니다.

`/init`은 새 프로젝트에서 코드베이스를 분석해 CLAUDE.md 초안을 생성합니다. 사람이 다듬는 시작점으로 씁니다. `/memory`는 Claude Code가 사용자의 교정을 바탕으로 리포별로 자동 축적한 메모리를 확인합니다. `/model`은 분류기 폴백 후 Fable로 복귀할 때 사용하지만, 폴백을 유발한 트리거가 컨텍스트에 남아 있으면 다음 요청에서 다시 폴백됩니다. 복귀는 가능하지만 원인이 남아 있는 한 머무를 수 없습니다.

자동 트리거에 의존하지 않는 것이 중요합니다. 과잉 계획 중인 모델은 그것을 교정하는 스킬을 스스로 호출하지 않으므로, 행동 교정용 규칙은 세션 시작 시 명시적으로 호출하거나 CLAUDE.md와 시스템 프롬프트에 본문을 직접 넣습니다. 공식 가이드 자체가 이 패턴들을 시스템 프롬프트용 블록으로 배포하는 방식과 같습니다.

반드시 지켜져야 하는 규칙은 프롬프트가 아니라 훅으로 강제합니다. 지시는 권고적이고 훅은 결정적입니다. 금지 경로 접근 차단, 위험 명령 차단 같은 항목이 여기에 해당합니다.

### 4.4 워크플로우

**기본 루프**는 확인된 공식 블록들의 순서 배치입니다.

| 단계 | 내용 | Effort |
|------|------|--------|
| 1 | 목표·이유·맥락 전달, 메모리 파일 참조 지시 | high |
| 2 | 스코핑과 명확화 질문 (난이도 상단 과제 선택) | high |
| 3 | 경계 블록과 함께 실행, 독립 서브태스크는 서브에이전트에 병렬 위임 | high / xhigh |
| 4 | 정한 간격마다 검증자 서브에이전트로 스펙 대비 검증 | — |
| 5 | 증거 기반 진행 보고 | — |
| 6 | 교훈을 메모리 파일에 기록 | — |

**장시간 자율 실행(overnight)** 에는 세 가지 공식 장치를 추가합니다.

첫째, 조기 종료 방지. 긴 세션 깊숙이에서 모델이 "이제 X를 실행하겠다"는 말만 남기고 도구 호출 없이 턴을 끝내거나, 진행해도 되는데 허락을 구하는 경우가 드물게 있습니다. 자율 파이프라인의 시스템 프롬프트에 다음 공식 블록을 넣습니다.

```
You are operating autonomously. The user is not watching in real time and cannot answer
questions mid-task, so asking "Want me to…?" or "Shall I…?" will block the work. For
reversible actions that follow from the original request, proceed without asking.
Offering follow-ups after the task is done is fine; asking permission after already
discussing with the user before doing the work is not. Before ending your turn, check
your last paragraph. If it is a plan, an analysis, a question, a list of next steps, or
a promise about work you have not done ("I'll…", "let me know when…"), do that work now
with tool calls. End your turn only when the task is complete or you are blocked on
input only the user can provide.
```

둘째, 컨텍스트 예산 불안 방지. 남은 토큰 카운트다운이 모델에 보이면 스스로 새 세션이나 요약 핸드오프를 제안하거나 작업을 줄일 수 있습니다. 가능하면 카운트를 노출하지 않고, 불가피하면 다음을 추가합니다.

```
You have ample context remaining. Do not stop, summarize, or suggest a new session on
account of context limits. Continue the work.
```

셋째, send_to_user 도구. 턴을 끝내지 않고 사용자가 원문 그대로 보아야 하는 콘텐츠(부분 산출물, 사용자 질문에 대한 직접 답변, 구체적 수치가 있는 진행 업데이트)를 전달하는 클라이언트 측 도구입니다. 도구 입력은 요약되지 않으므로 내용이 손실 없이 도착합니다. 단, 도구를 정의하는 것만으로는 부족합니다. 시스템 프롬프트에 호출 유도 문구가 없으면 거의 호출하지 않는다고 공식 명시되어 있습니다.

```
Between tool calls, when you have content the user must read verbatim (a partial
deliverable, a direct answer to their question), call the send_to_user tool with that
content. Use send_to_user only for user-facing content, not for narration or reasoning.
```

내레이션이나 내부 추론을 이 도구로 흘려보내면 목적이 훼손되므로 금지합니다.

**완료 보고**는 3절의 커뮤니케이션 규칙을 따릅니다. 결과 한 문장으로 시작하고, 작업 중 만든 어휘와 shorthand를 버리고, 처음 보는 독자를 위한 재접지(re-grounding)로 작성하게 합니다.

### 4.5 가이드 자산 (CLAUDE.md)

**짧게 유지합니다.** 근거는 공식 가이드의 too-prescriptive 경고입니다. Fable 5에서는 열거식 가드레일이 안전망이 아니라 비용이 됩니다. instruction following이 강하기 때문에 잘못된 규칙도 충실히 따르고, 불필요한 규칙은 판단력을 제약합니다.

담을 것: 프로젝트의 목표와 의도 맥락, 경계(하지 말 것), 검증 규칙, 메모리 파일의 위치와 참조 지시. 이 문서 2절의 공식 블록들이 그대로 후보입니다.

담지 말 것: 단계별 절차 레시피, 약한 모델의 실패 모드를 보정하던 지시, 추론 과정을 응답에 재현하라는 지시(폴백 유발), 저장소나 대화 이력이 이미 기록하고 있는 내용.

**더 강한 모델이 나올 때마다 지식 파일을 감사합니다** (커뮤니티 교차 검증). 에이전트가 자기 지시 파일을 편집하는 시스템에는 구조적 맹점이 있습니다. 모델 N이 추가한 모든 줄은 정의상 모델 N의 리뷰를 통과한 것이므로, 그 지식층은 모델 N이 보지 못하는 오류를 보존합니다. 4.2절의 감사 프롬프트를 새 모델 도입 시 표준 절차로 삼는 이유입니다.

---

## 5. 폴백과 거부를 피하는 법

Fable 5는 세 가지를 표적으로 하는 안전 분류기를 실행합니다. 공격적 사이버보안 기법(익스플로잇, 멀웨어, 공격 도구 제작), 생물학·생명과학 콘텐츠(실험 방법, 분자 메커니즘), 그리고 모델의 요약된 사고 과정 추출입니다. 공식 문서는 정상적인 사이버보안 작업과 유익한 생명과학 작업도 이 안전장치를 오탐으로 촉발할 수 있다고 인정합니다.

실무 대응은 세 가지입니다.

첫째, 거부된 요청의 자동 재라우팅이 필요하면 서버 측 또는 클라이언트 측 폴백을 Opus 4.8로 구성합니다. 이것이 공식 권장 처리 방식입니다.

둘째, 추론 재현 지시를 모든 지시 파일에서 제거합니다. 5절 서두의 세 번째 표적이 이것이며, 기존 스킬과 시스템 프롬프트에 "show your thinking"류 지시가 남아 있으면 폴백이 늘어납니다. 추론 가시성이 필요하면 adaptive thinking의 structured thinking 블록을 읽고, 장기 실행 중 진행 상황은 send_to_user 도구로 표시합니다.

셋째, 해당 도메인 작업은 애초에 이 모델에 맡기지 않습니다. 공식 문서의 표현: "Claude Fable 5 is not intended for offensive cybersecurity or biology and life sciences work." 이 영역의 요청은 `stop_reason: "refusal"`을 반환할 수 있습니다.

---

## 6. 요약

Fable 5 운영의 핵심은 다섯 문장으로 요약됩니다. 단계 대신 목표와 이유를 주고, effort로 지능·지연·비용을 조절합니다. 하지 말 것을 명시적 경계로 정의하고, 진행 주장은 도구 결과라는 증거에 대조시킵니다. 교훈은 메모리 파일에 쌓아 다음 실행이 더 나아지게 하고, 이전 모델을 위해 쓴 지시 파일은 새 모델의 눈으로 감사한 뒤 덜어냅니다. 마지막으로, 작업 중의 shorthand는 자유롭게 쓰되 사용자에게 보내는 최종 메시지는 결과부터, 완전한 문장으로, 처음 보는 독자를 위해 작성합니다.

---

## 출처

공식 문서 (본문 기본 근거):
- Prompting Claude Fable 5 — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5
- Prompting best practices — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
- A field guide to Claude Fable 5: Finding your unknowns (Claude Code 팀, 공식 블로그) — https://claude.com/blog/a-field-guide-to-claude-fable-finding-your-unknowns

커뮤니티 교차 검증 (본문에 표시된 항목의 출처):
- Fable Is Back: How to Actually Code With It — https://wavect.io/blog/coding-with-claude-fable-5/
- Claude Fable 5: What Changed (팩트체크) — https://kenhuangus.substack.com/p/claude-fable-5-what-changed-and-how
- Claude Fable 5 for PMs (지시 파일 감사 프롬프트) — https://www.productcompass.pm/p/claude-fable-5-guide
- Fable 5-native skills 저장소 — https://github.com/kpab/claude-fable-5-skills
