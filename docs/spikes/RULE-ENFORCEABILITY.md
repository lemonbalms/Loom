# 운영 규칙 강제가능성 — 판별 기준 (설계 전용 · 적용 없음)

작성 2026-07-20 · 레인: codex 설계 · **제품 코드·hook 변경 없음**

> 이 문서는 2026-07-20 한 세션의 관측값을 입력으로 삼는다. 코드 가드 A 3건은 3/3 위반을
> 막았고, 문서 규칙 B 4건은 4/4 위반됐으며, 코드 가드 C 2건은 불충분했다. 표본이 작으므로
> 일반적인 성공률을 추정하지 않는다. 이 자료가 입증하는 것은 더 좁다. **실행 경로를 실제로
> 중개한 가드는 그 경로의 위반을 막았고, 읽었다는 사실만 있는 문서는 행동을 중개하지 못했다.
> 그러나 불완전한 중개와 조용한 미판정은 가짜 안전을 만들었다.**

관련 선례는 [`HOOK-CACHE-FIX-DESIGN.md`](./HOOK-CACHE-FIX-DESIGN.md) §0-bis다. 선례가 한
설계 안에서 “TS로 잠글 수 있는가”를 갈랐다면, 이 문서는 운영 규칙 전반에서 **무엇을 증거로,
어느 관문에서, 어떤 실패 의미론으로 잠글 수 있는가**까지 일반화한다.

---

## 0. 결론

“코드로 강제 가능”은 규칙 문장을 프로그램으로 번역할 수 있다는 뜻이 아니다. 다음 세 조건을
동시에 만족한다는 뜻이다.

1. 판정에 필요한 사실이 기계가 읽는 **증거 객체**로 존재한다.
2. 위반이 효과를 내기 전에 모든 관련 경로가 **같은 관문**을 지난다.
3. 관문이 판정하지 못한 상태를 성공과 구별해 **미확정으로 노출**한다.

셋 중 하나라도 없으면 hard lock이 아니라 보조 가드다. 보조 가드도 유용하지만 “규칙이
강제된다”고 표기하면 안 된다. 특히 검사 대상과 다른 경로를 재구현하거나, 앵커 미발견·읽기 실패를
exit 0으로 돌리는 가드는 문서보다 위험하다. 문서는 불확실성을 드러내지만 그런 가드는 불확실성을
PASS로 위장하기 때문이다.

### 0.1 판정 결과 네 가지

| 등급 | 의미 | 허용되는 주장 |
|---|---|---|
| **H — hard enforcement** | 완전 중개된 경로에서 결정적 판정으로 효과 전 차단 | “정의된 경로에서는 위반이 차단된다” |
| **G — guarded workflow** | 대부분 중개하지만 예외·외부 상태·휴리스틱이 남음 | “위반 확률을 낮추고 미확정을 드러낸다” |
| **A — audit/detection** | 실행 후 증거를 검사하거나 회귀를 막음 | “위반을 탐지한다”; “실행을 막는다” 금지 |
| **J — human judgment** | 의미·우선순위·상황 적합성 판단이 본체 | “사람 판정과 provenance를 요구한다” |

한 규칙이 한 등급에만 속할 필요는 없다. 예를 들어 pane 우선 규칙은 기본 경로 선택은 G로
코드화할 수 있지만, “pane이 정말 불가능했는가”라는 예외 판정은 J로 남는다.

---

## 1. 판정 축 — 6개

각 규칙을 아래 여섯 축으로 먼저 분해한다. 축은 점수를 더해 자동 결론을 내는 체크리스트가 아니다.
어느 한 축의 치명적 결손만으로도 hard enforcement가 탈락할 수 있는 **거부 조건**이다.

| 축 | 묻는 질문 | 강한 상태 | hard lock 거부 신호 |
|---|---|---|---|
| **X1 증거 형태** | 판정 사실이 어디에, 어떤 형식으로 남는가? | 서명/스키마가 있는 ID·상태·tool input·receipt | 의도, “적절함”, 기억, 자연어 의미만 존재 |
| **X2 경로 폐쇄성** | 같은 효과를 내는 모든 경로가 이 관문을 지나는가? | 단일 API/트랜잭션/런타임 경계가 완전 중개 | 직접 CLI·다른 harness·수동 pane 등 우회가 미열거 |
| **X3 판정 경계** | 같은 입력에 같은 verdict를 내리는 닫힌 술어인가? | equality, schema, 상태 전이, 예산처럼 결정적 | “복잡한가”, “pane 불가인가”, “요약 의미가 보존됐나” |
| **X4 개입 시차** | 틀린 효과가 커밋되기 전에 멈출 수 있는가? | pre-action 또는 같은 원자 트랜잭션 | 로그/화면만 사후 관찰, 이미 공유 상태 변경 |
| **X5 미판정 의미** | 읽기 실패·앵커 미발견·hook 미기동은 무엇인가? | PASS/FAIL/UNKNOWN/SKIP이 구별되고 호출자가 정책 결정 | 예외·빈 결과·timeout을 exit 0 또는 무출력으로 환원 |
| **X6 기준원 결합** | 가드가 실제 실행과 같은 기준원을 쓰는가? | 실행 코드의 resolver/스키마/상수를 import하거나 실행 영수증 검사 | 경로 해석·정규식·버전 선택을 별도 복제, 외부 UI 추정 |

### 1.1 판정 절차

규칙 하나를 다음 순서로 판정한다.

1. **효과를 한 문장으로 고정한다.** “주의한다”가 아니라 “미허가 peer의 dispatch가 worker를
   spawn하지 못한다”처럼 위반 효과와 차단 시점을 쓴다.
2. **증거 객체를 적는다(X1).** 증거가 자연어 판단뿐이면 J다. 일부만 구조화할 수 있으면 규칙을
   기계 부분과 사람 부분으로 쪼갠다.
3. **우회 지도를 적는다(X2).** API, MCP, CLI, hook, 수동 pane, 외부 harness를 열거한다. 하나라도
   관문 밖이면 전체 규칙은 H가 아니다. 단, “Claude Code Agent 호출”처럼 범위를 명시해 그 경로만
   H라고 주장할 수는 있다.
4. **판정 함수를 적고 반례를 만든다(X3).** 같은 사실에 사람마다 verdict가 달라질 수 있으면 자동
   차단 대신 증거 요구·리뷰로 내린다.
5. **마지막 안전 시점을 찾는다(X4).** 그 시점의 가장 안쪽 관문을 우선한다. 사후 CI가 런타임
   오염을 되돌려 주지는 않는다.
6. **가드 자체의 실패표를 쓴다(X5).** `PASS`, `VIOLATION`, `UNKNOWN`, 정당한 `NOT_APPLICABLE`을
   모두 만든 뒤 각 호출자의 반응을 정한다.
7. **기준원 드리프트를 검사한다(X6).** 실행 경로를 복제해야만 검사할 수 있다면 H를 보류하고,
   공용 함수·실행 receipt·contract test 중 하나가 생길 때까지 G/A로 표기한다.

### 1.2 hard lock 합격선

H로 분류하려면 X1·X3이 결정적이고, X2가 주장 범위 안에서 완전하며, X4가 효과 전이고, X5의
UNKNOWN이 PASS와 구별되고, X6이 공유 기준원이거나 실행 결과 provenance로 묶여야 한다.
오탐 비용이 크다는 이유로 UNKNOWN을 PASS로 바꾸면 H 자격을 잃는다. 대신 적용 범위를 좁히거나
G로 낮춰야 한다.

---

## 2. 강제 수단 스펙트럼 — 6층

가장 강한 층이 항상 정답은 아니다. **위반 효과에 가장 가까우면서, 필요한 증거를 소유하고,
우회 경로를 가장 적게 남기는 층**을 고른다. 아래층 숫자는 우열이 아니라 실행 위치다.

| 층 | 수단 | 적합한 규칙 | 선택 조건 | 할 수 없는 주장 |
|---|---|---|---|---|
| **L0 제품 런타임 불변식** | 권한 검사, schema, 상태 전이 전 validation | 신뢰 경계·무결성·데이터 오염 방지 | 제품이 증거와 효과를 모두 소유, 모든 요청이 통과 | harness 밖의 작업 습관까지 보장 |
| **L1 워크플로 트랜잭션** | claim+dispatch, capability probe+route, 상태 머신 | 여러 정상 동작의 순서·원자성 | 동작을 하나의 canonical command/API로 수렴 가능 | 직접 우회 호출이 열려 있으면 H라고 주장 |
| **L2 하네스 pre-action hook/wrapper** | PreToolUse, tool wrapper, session receipt | 모델이 tool을 호출하기 직전의 형식·선행조건 | 하네스가 tool input과 세션 ID를 안정적으로 제공 | 다른 하네스·직접 CLI까지 보장 |
| **L3 정적 lint·테스트·CI gate** | config lint, contract/unit/adversarial test, pre-merge gate | 저장소 상태·결정론·회귀·배포 산출물 | 실행 전 고정 가능한 artifact이고 CI가 필수 경로 | 이미 실행된 라이브 위반을 되돌림 |
| **L4 관측기·사후 감사** | monitor, structured log consumer, anomaly detector | 외부 CLI/UI·장기 작업·완전 중개 불가 표면 | 신뢰할 독립 신호가 있고 UNKNOWN을 별도 보고 | 휴리스틱 hit를 완료/정합의 최종 증명으로 사용 |
| **L5 사람 게이트+증거 계약** | 체크리스트, 결정 기록, 2인 리뷰, 예외 만료, 문서 | 의미 보존·우선순위·상황 적합성 | 판단자를 없앨 수 없지만 입력·출력 형식은 고정 가능 | 문서 열람 자체를 준수 증거로 사용 |

### 2.1 층 선택 규칙

- 보안·보드 오염처럼 효과가 즉시 공유되면 L0/L1을 우선한다. L3 검사는 보조 회귀 방어다.
- 특정 모델 하네스의 tool input 규칙이면 L2가 맞다. 제품에 해당 정책을 넣으면 제품과 운영 정책을
  불필요하게 결합한다.
- 저장소 파일의 구조·예산·결정론이면 L3가 맞다. 다만 검사기가 실제 소비 경로를 복제하면 X6에서
  탈락한다.
- 외부 TUI처럼 원천적으로 provenance가 약하면 L4는 “완료 확인”이 아니라 “후보 신호”만 낸다.
- 의미 판단은 L5에 남기되 자유형 문서로 두지 않는다. 필요한 증거, verdict 어휘, reviewer,
  expiry를 구조화한다.
- 같은 규칙에 두 층을 쓸 수 있다. 권장 조합은 **가장 안쪽 차단 1개 + 그 가드의 회귀/건강을 보는
  바깥층 1개**다. 같은 잘못된 oracle을 두 번 복제하는 것은 이중 방어가 아니다.

---

## 3. 잘못 코드화된 가드를 막는 조건 — 침묵은 성공이 아니다

### 3.1 결과 프로토콜

모든 가드는 최소 다음 네 결과를 내야 한다.

| 결과 | 뜻 | 기본 반응 |
|---|---|---|
| `PASS` | 적용 대상과 기준원을 확인했고 규칙 충족을 증명 | 진행 |
| `VIOLATION` | 적용 대상이고 위반을 증명 | 차단 또는 명시적 실패 |
| `UNKNOWN` | 적용 대상일 가능성이 있으나 읽기/파싱/앵커/시간 내 판정 실패 | 안전 중요 경로는 차단; 그 외는 수동 리뷰로 라우팅 |
| `NOT_APPLICABLE` | 설치본 부재처럼 사전에 정의된 비적용 | 별도 집계; PASS 통계에 포함 금지 |

exit code만 쓰면 네 상태를 서로 다른 코드로 내고, 상위 runner가 이를 다시 0/1로 뭉개지 않는지
contract test한다. “이 머신에는 플러그인이 없으니 통과”가 필요하면 그것은 PASS가 아니라
`NOT_APPLICABLE(plugin_absent)`다.

### 3.2 가드 승인 요건

코드 가드는 다음을 갖추기 전까지 H로 승격하지 않는다.

1. **적용 범위 선언** — 어떤 entry point와 버전을 중개하는지, 알려진 우회는 무엇인지 쓴다.
2. **공유 oracle** — 실행 resolver/스키마/상수를 import한다. 불가하면 실제 실행이 선택한 경로·버전·
   hash receipt를 검사한다. 독립 복제는 마지막 수단이며 contract test로 동치성을 증명한다.
3. **부정 경로 테스트** — 위반 입력뿐 아니라 앵커 없음, 구버전/신버전 동시 존재, parse error,
   timeout, permission error, 빈 출력, prompt echo를 fixture로 넣는다.
4. **mutation/canary** — 가드가 실제로 켜졌는지 알려진 위반을 안전한 fixture에서 주기적으로
   주입한다. “테스트가 green”보다 “가드가 위반을 잡는 것을 방금 봄”이 강하다.
5. **시작 건강 신호** — hook 등록 실패·관측기 즉사·오래된 버전을 heartbeat로 드러낸다.
   heartbeat 부재는 정상 대기가 아니라 UNKNOWN이다.
6. **판정 provenance** — `guard_version`, `policy_version`, `target_path/id`, `input_hash`, `reason`,
   `checked_at`을 남긴다. 경로와 버전을 숨긴 “OK”는 금지한다.
7. **원자적 실패** — 차단 가드는 효과를 커밋하기 전에 판정한다. 판정 뒤 상태가 바뀔 수 있으면
   같은 트랜잭션/lock/sequence receipt로 묶는다.
8. **주장 한계 테스트** — allowlist 통과가 작업 내용의 진실성까지 증명하지 않고, node 정합이
   scrape 내용의 완전성까지 증명하지 않는다는 경계를 문서와 API 결과에 유지한다.

### 3.3 두 C 사례에 바로 적용되는 교정 원칙

- `check-mem-header`류는 “내가 찾은 첫 파일”을 검사하면 안 된다. **실제 hook이 선택한 install
  root와 동일한 resolver**를 공유하거나, hook이 시작 때 발행한 선택 receipt를 검사해야 한다.
  소비처 앵커 미발견은 구조 변경이라는 강한 신호이므로 UNKNOWN/FAIL이지 SKIP이 아니다.
- `watch-card`류는 화면 문자열에 출처 provenance가 없음을 전제로 해야 한다. 프롬프트 echo와
  worker 출력이 같은 버퍼에 있으면 marker substring은 본질적으로 완료 증명이 아니다. baseline,
  exact-line grammar, placeholder 거부, working 전이, 시간 안정화는 오탐을 줄일 뿐 H로 만들지
  않는다. 최종 완료는 별도 structured event/artifact와 독립 산출물 검증으로 확정해야 한다.

> 검토 시점 작업 트리에는 다른 카드가 `scripts/check-mem-header.ts`와 `scripts/watch-card.ts` 및
> 테스트를 편집 중이며, 위 실패를 겨냥한 변경이 보인다. 이 문서는 해당 파일을 건드리지 않았고,
> uncommitted/in-flight 변경을 검증 완료나 현재 정본으로 간주하지 않는다.

---

## 4. 코드화 불가 규칙의 차선책

문서 단독은 마지막 층의 설명서일 뿐 완화책이 아니다. J가 남는 규칙에도 다음 장치를 조합한다.

| 수단 | 낮추는 위험 | 요구 산출물 |
|---|---|---|
| **결정 입력 고정** | 기억 누락·임의 기준 변경 | 선택지, 보수 default, 금지 조건이 있는 form |
| **선행 receipt** | 순서 생략 | session/task에 묶인 `loaded/claimed/probed/reviewed` 증거 |
| **예외 예산·만료** | “이번만”이 영구 우회가 됨 | reason, owner, expires_at, 재검증 조건 |
| **독립 reviewer** | 자기확증·로그 몇 줄의 과잉 인과 | 반례 1개 이상과 `confirmed/unknown/rejected` verdict |
| **artifact 계약** | 자유형 “완료” 주장 | 필수 필드, test provenance, 미확정 목록, 정확한 최종 marker |
| **사후 표본 감사** | 완전 중개 불가 경로의 반복 위반 | 위반률·UNKNOWN률·우회 경로를 주기적으로 집계 |
| **선택지 축소** | 매번 같은 판단을 다시 함 | canonical wrapper 한 개, 직접 경로는 break-glass 처리 |

핵심은 사람 판단을 없애는 것이 아니라, **판단 전 입력과 판단 후 책임 소재를 기계가 확인 가능한
형태로 좁히는 것**이다. 의미 판단 결과 자체를 코드가 대신했다고 주장하지 않는다.

---

## 5. 오늘 사례 전수 분류 — 9건

### 5.1 A — 코드가 실제 위반을 막은 3건

| 사례 | 축 판정 | 등급·권고 층 | 권고 |
|---|---|---|---|
| **A1 M-1 dispatcher allowlist** | peer ID와 allowlist가 구조화(X1), bridge가 spawn 전 중개(X2·X4), exact membership(X3), 제품 config와 같은 기준원(X6) | **H · L0**, L3 contract test 보조 | 현행 fail-closed membership을 유지한다. 단 현재 deny가 log+ignore라 호출자가 침묵을 대기로 오독할 수 있다. 불변식은 지켜졌지만 운영 신호는 별개이므로, protocol상 안전한 structured deny/metric과 가드 heartbeat를 권고한다. “허가된 발신자”만 증명하며 payload 진실성은 증명하지 않는다. |
| **A2 L-2 result.node ↔ assignee** | board assignee와 result node가 구조화(X1), `applyCardResult`가 board 변경 전 중개(X2·X4), equality(X3), 같은 task/result schema 사용(X6) | **H · L0**, L3 adversarial test 보조 | 현행 pre-mutation reject를 유지한다. assignee 없는 task는 이 술어의 적용 밖이므로, dispatch card는 assignee 필수를 별도 invariant로 둔다. node 정합은 가짜 scrape의 **출처 불일치**를 막았지만 내용 완전성을 증명하지 않는다. |
| **A3 Agent `model` 필수 PreToolUse** | Claude tool input의 `model`이 구조화(X1), 해당 harness Agent/Task 호출 직전 중개(X4), presence predicate(X3) | **H(Claude Code의 등록된 Agent/Task 경로 한정) · L2**, L3 hook fixture/registration test 보조 | hook 유지. 등록 여부 heartbeat, malformed hook input을 UNKNOWN으로 내는 정책, pinned-agent allowlist drift test를 추가 설계한다. Codex/직접 CLI/다른 harness까지 보장한다고 확장 주장하지 않는다. 관측 세션에서는 실제 누락 호출을 차단하고 출처·기본값까지 안내했다. |

세 건 모두 “코드라서” 성공한 것이 아니라, 문제의 효과 직전에 실제 경로를 중개했다. 동시에 A1의
caller-visible silence, A2의 내용 진실성 범위, A3의 harness 경계는 남는다. 3/3 성공은 이 경계를
넘는 보증이 아니다.

### 5.2 B — 문서에만 있어 4/4 위반된 규칙

| 사례 | 왜 문서에만 있었나 | 코드로 옮길 수 있는 부분 / 남는 판단 | 권고 층·구체 수단 |
|---|---|---|---|
| **B1 위임 전 orchestration 스킬 로드** | “읽었음”이 세션 상태에 receipt로 남지 않았고, Skill→Agent/pane dispatch 순서를 묶는 단일 관문이 없었다. 규칙 문장만 기억을 요구했다. | **순서는 코드화 가능**: session-scoped skill-load receipt가 없으면 위임 entry point를 막는다. **효과는 미확정**: 로드가 실제 이해·적용을 보장하지 않으며, 모든 작은 위임에 필요한지도 의미 판단이다. | **G · L2+L1**, L5 보조. canonical delegate wrapper가 `(session_id, skill_version, loaded_at)` receipt를 요구하고 Agent hook과 pane dispatcher가 공유한다. receipt 발급/세션 ID를 하네스가 안정 제공하지 못하면 차단 대신 UNKNOWN+review. 장기적으로는 필수 규칙을 wrapper default로 흡수해 “로드 의식” 의존을 줄인다. |
| **B2 dispatch 전 board claim** | board update와 dispatch가 별도 운영 단계였고 직접 dispatch 경로가 있었다. 현행 `dispatchCard()`도 성공 route 뒤 `doing+assignee`를 기록하므로 “발사 전 reservation”과는 순서가 다르다. | **대부분 완전 코드화 가능**: task 존재, `doing`, assignee=target, 중복 lease는 구조화·결정적이다. 다만 원격 send와 로컬 board의 완전 원자성은 분산 트랜잭션 문제라 lease/idempotency가 필요하다. | **H 목표 · L1**, L0/L3 보조. `claim(reservation/lease) → dispatch(idempotency key) → commit`, 실패 시 명시적 rollback/expired 상태를 한 API로 만든다. bridge도 유효한 claim receipt 없는 card를 spawn하지 않는다. direct send는 break-glass로 분리한다. |
| **B3 herdr pane 카드 기본, Agent는 폴백** | “pane 가능 여부”가 동적이고 여러 CLI/harness에 흩어져 있으며, 경로 선택을 모델 재량에 맡겼다. `agentKind` schema가 pane 3종을 지원한다는 사실과 실제 lane health도 문서에서만 연결됐다. | **기본 라우팅은 코드화 가능**: capability/health probe가 성공하면 pane만 선택. **예외는 부분 판단**: auth prompt, 순간 장애, remote CLI 부재가 진짜 “불가”인지와 기다릴 비용은 정책 판단이다. | **G · L1+L2**, L5 break-glass. delegate wrapper가 pane capability receipt를 먼저 얻고 성공 시 Agent 호출을 차단한다. Agent fallback은 최근 probe 실패 reason+TTL+task_id를 요구하고 예외 로그를 감사한다. 모델이 자유형 이유를 쓰는 것만으로는 receipt가 아니다. |
| **B4 marker echo 오탐 주의** | 경고가 lessons에만 있었고 임시 bash/화면 grep을 금지하거나 대체하는 canonical 관문이 없었다. prompt와 output이 같은 pane 버퍼라 단순 substring에는 provenance가 없다. | **오탐 감소는 코드화 가능**, 하지만 화면 marker만으로 완료의 H 판정은 불가. prompt echo·rerender·scrollback과 실제 출력의 출처를 평문에서 완전히 구별할 수 없다. | **A/G · L4**, L1/L3 보조. marker는 후보 신호로만 사용하고 structured `card.done`/completion artifact+board claim+워킹트리 독립검증으로 확정한다. watcher는 baseline·exact-line·placeholder reject·working 전이·UNKNOWN을 갖추고 adversarial echo fixture를 CI에 둔다. 임시 watcher 사용은 lint/운영 wrapper로 금지한다. |

따라서 B 네 건을 모두 “사람 규칙”으로 남길 이유는 없다. B2의 핵심은 H까지 올릴 수 있고, B1·B3은
기계 선행조건과 사람 예외로 분해할 수 있으며, B4는 관측기의 권한을 낮추고 구조화 신호로 옮길 수
있다. 문서에 남을 것은 목적·예외 기준·사람 verdict이지, 매번 기억해야 하는 순서 자체가 아니다.

### 5.3 C — 코드화했으나 불충분했던 2건

| 사례 | 축에서 탈락한 이유 | 등급·권고 층 | 권고 |
|---|---|---|---|
| **C1 `check-mem-header` false OK/anchor silence** | 검사기가 실제 hook의 경로 선택을 복제하지 않아 X6 탈락. 앵커 미발견을 SKIP/exit 0으로 내어 X5 탈락. 검사한 파일이 실제 소비 파일이라는 증거가 없으므로 PASS의 전제가 성립하지 않았다. | 기존은 **A처럼 보이는 미자격 가드**. 목표는 **A · L3** | 실제 hook resolver를 공용 모듈로 쓰거나 hook 실행 receipt의 path+hash를 검사한다. `anchor_missing`, `read_error`, `multiple_candidates`는 UNKNOWN/비영 종료. plugin_absent만 명시적 NOT_APPLICABLE. 구/신버전 공존과 앵커 소실 mutation test를 필수화한다. |
| **C2 `watch-card` prompt echo 완료 오인** | pane 문자열은 출처 없는 혼합물이라 X1이 약하고, substring predicate가 실제 완료 의미를 닫지 못해 X3 탈락. 첫 구현이 echo 경로를 PASS로 만들었으므로 X5도 실패했다. | **A/G · L4**, 최종 완료는 L1 structured protocol | watcher 결과를 `candidate_marker`, `pane_gone`, `limit`, `timeout`, `unknown`으로만 보고한다. 완료 커밋 권한을 주지 않는다. 별도 event/artifact, assignee 정합, 산출물 검증이 모두 있어야 완료한다. 프롬프트 echo가 tail에 다시 나타나는 fixture도 둔다. |

C의 공통 결함은 검사 로직의 세부 버그가 아니라 **증거가 없는 경로를 PASS로 축약한 것**이다.
정규식을 더 정교하게 만드는 것만으로 해결되지 않는다.

---

## 6. 애매한 케이스 — 3개

### 6.1 “orchestration 스킬을 로드했는가”

tool 호출 순서는 receipt로 강제할 수 있지만, 규칙의 진짜 목적은 올바른 위임 판단이다. receipt는
문서를 열었다는 사실만 증명하고 이해·적용은 증명하지 않는다. 반대로 wrapper가 필요한 정책을
이미 내장했다면 별도 로드는 무의미한 의식이 될 수 있다. **행위 순서는 G, 판단 품질은 J**라서
규칙 문장 그대로는 깔끔히 H/J로 갈리지 않는다.

### 6.2 “pane이 불가능할 때만 Agent fallback”

프로세스 부재는 기계 판정 가능하지만, 승인 대기 10분·일시적 rate limit·원격 노드만 사용 가능 같은
상태는 “불가능”과 “비싸지만 가능” 사이에 있다. probe TTL도 레이스를 만든다. 너무 엄격한 lock은
정당한 복구를 막고, 느슨한 self-attestation은 원래 문서 규칙으로 돌아간다. **기본 경로는 G로
잠그되 break-glass의 정당성은 J+사후 감사**로 남겨야 한다.

### 6.3 “card.done은 진짜 완료인가”

node↔assignee, seq, schema는 기계적으로 잠글 수 있지만 오늘 가짜 `card.done`이 보여 준 것처럼
정상 발신 노드도 TUI 초기 화면이나 still-running 출력을 결과로 보낼 수 있다. 어떤 테스트와 artifact가
충분한지는 작업마다 다르다. 출처·전이 무결성은 H, 결과 내용의 충분성은 G/J다. 이 둘을 “완료” 한
단어로 합치면 A2 같은 성공 사례를 과대해석하게 된다.

이 모호함은 기준의 결함이 아니라 적용 대상 규칙이 서로 다른 술어를 한 문장에 묶었다는 신호다.
먼저 기계 술어와 사람 술어로 분해해야 한다.

---

## 7. 적용용 판별표

새 규칙은 아래 한 행을 채운 뒤 층을 고른다. 빈 칸이 있으면 문서 규칙을 곧바로 hard lock으로
승격하지 않는다.

| 필드 | 기입 내용 |
|---|---|
| 위반 효과 / 마지막 안전 시점 | 무엇이 오염·실행·누락되며 언제까지 막아야 하는가 |
| 증거 객체(X1) | ID, state, receipt, artifact, 또는 사람 의미 판단 |
| 모든 entry point(X2) | 제품 API, MCP, CLI, harness, 수동 경로, break-glass |
| 판정 술어·반례(X3) | 결정 함수와 최소 양성/음성/경계 fixture |
| 개입 위치(X4) | pre-action, transaction, CI, audit 중 어디인가 |
| 4상태 실패표(X5) | PASS/VIOLATION/UNKNOWN/NOT_APPLICABLE와 호출자 반응 |
| 기준원·drift(X6) | 공용 import, receipt, contract test, 외부 버전 |
| 최종 등급 / 층 | H·G·A·J / L0..L5, 보조층 포함 |
| 주장 한계 | 이 가드가 증명하지 못하는 것 |
| 예외 계약 | reason, owner, TTL, review 및 감사 위치 |

### 7.1 우선순위

1. **완료 marker를 권위 신호에서 내린다.** B4/C2는 동일 실패 계열이다. 화면 marker는 hint,
   structured result+독립검증이 authority여야 한다.
2. **claim과 dispatch를 canonical transaction으로 묶는다.** B2는 판단이 아니라 구조화된 순서라
   hard enforcement의 수익이 가장 크다.
3. **모든 가드에 UNKNOWN을 도입한다.** C1의 앵커 미발견, C2의 provenance 없는 hit, A1의 caller
   무응답을 서로 다른 정상 대기로 보지 않는다.
4. **위임 경로를 wrapper로 수렴한다.** B1 skill receipt와 B3 pane probe/fallback receipt를 같은
   task-scoped delegation envelope에 넣는다. 예외는 만료되는 break-glass로 남긴다.
5. **가드 건강을 별도 테스트한다.** 실제 위반 fixture를 주기적으로 넣어 “가드가 켜져 있고 잡는다”를
   증명한다. green happy path만으로 강제를 주장하지 않는다.

---

## 8. 사실 범위와 미확정

- A/B/C의 사건 수와 결과는 이 카드의 2026-07-20 원자료를 그대로 사용했다. 일반 모집단의 위반률이나
  향후 성공률로 외삽하지 않았다.
- M-1은 `bridge-config.ts:isAuthorizedDispatcher`와 `bridge-runtime.ts` dispatch 경계,
  L-2는 `card-ops.ts:applyCardResult`, model 규칙은 `.claude/settings.json`의 PreToolUse와
  `scripts/hooks/check-agent-model.ts`에서 현재 배선을 확인했다.
- `dispatchCard()`는 route 성공 뒤 board를 `doing+assignee`로 갱신한다. 이것은 B2의 “발사 전 claim”을
  원자적으로 보장하지 않으며, 모든 직접 dispatch 경로의 폐쇄 여부도 이번 문서에서 확정하지 않았다.
- C 두 파일은 동시 편집 중이므로 현재 작업 트리 스냅샷의 보정이 실제 hook/TUI에서 충분한지는
  **미확정**이다. 이 문서의 분류 대상은 원자료에 기록된 첫 실패다.
- `HOOK-CACHE-FIX-DESIGN.md` §5가 잘못된 파일을 확신해 지목했던 전례처럼, source anchor 하나는
  활성 실행 경로의 증명이 아니다. 이 문서는 공용 resolver 또는 실행 receipt 없이는 그 주장을 H로
  올리지 않는다.

[ENFORCEABILITY-DONE] axes=6 layers=6 classified=9건 ambiguous=3
