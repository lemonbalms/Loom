# PANE-DEATH Codex 적대적 검증

## 1. Verdict

**reject** — 핵심 락 3은 replay를 식별하지 못하고 핵심 락 5의 사후 CAS는 wire 이중 발행과 ACK 불확실성을 막지 못하므로, 이 문구로 구현을 잠그면 권고 B의 완료 권위가 다시 깨진다.

## 2. Findings

| 심각도 | 대상 | 결함 | 구체적 실패 시나리오 |
|---|---|---|---|
| High | §9-bis 3 | “구독 시작 이후 도착”은 신규 구독에 replay된 과거 이벤트도 만족하고 terminal 봉투에는 사건 시각·seq·event id가 없으므로 replay 판별 조건이 아니다. | herdr가 재시작 또는 ID 재사용 뒤 현재 flight와 같은 `pane_id`의 10분 전 `pane_closed`를 새 소켓에 흘리면 두 조건이 모두 참이 되어 살아 있는 새 flight가 사망 처리된다(ID 재사용 여부 자체는 미확인). |
| High | §9-bis 5 · `bridge-runtime.ts:2312-2324` | `result_sending → committed` CAS는 `sendResult()` 뒤에 일어나므로 발행 소유권을 획득시키지 못하고, terminal 경로가 send 중 실패 result를 보내면 CAS 패자가 정해지기 전에 두 wire side effect가 끝날 수 있다. | done handoff가 relay에 저장된 뒤 ACK를 기다리는 동안 pane terminal이 오면 terminal 핸들러가 failed를 발행하고, 이후 done ACK가 돌아와 로컬 CAS 하나만 이겨도 tower inbox에는 done과 failed가 둘 다 남는다. |
| High | §6.2.4 · §9-bis 5 · `bridge-runtime.ts:2363-2388` | 현재 `sendResult()`의 `true`는 “예외 없이 `handoff.ack`를 받음”일 뿐 수신자 enqueue를 뜻하지 않으며, relay는 `peer_unknown`도 정상 ACK로 돌려주고 매 요청에 새 handoff id를 만들어 ACK 유실 후 중복을 reconcile할 키가 없다. | tower peer가 일시적으로 해석되지 않으면 `recipientCount=0/status=peer_unknown` ACK에도 committed로 전이하고 pane을 닫아 결과를 잃으며, 반대로 relay 저장 뒤 ACK만 유실되면 후속 failed/retry가 이미 저장된 done과 중복된다. |
| Medium | §9-3 · §9.3 | 원시 로그가 직접 입증하는 것은 close 요청과 유일한 `PaneDied` 경고의 139ms 시간 대응뿐인데, 내부 id `236`과 API id `w3:p5J`가 매칭되지 않은 상태에서 “우리 close가 유발”을 닫힌 사실로 승격했다. | 같은 11.4초 스크레이프 창에 다른 내부 pane 236이 우연히 사망했다면 관측 타임라인은 동일하며, 현재 raw에는 그 대안 설명을 제거할 id 대응이나 herdr 내부 trace가 없다. |
| Medium | §9-bis 1 | `pane_closed`를 곧바로 “우리가 닫음”으로 표현해 이벤트 종류와 로컬 lifecycle phase를 혼동했다; 관측은 API close를 보여줄 뿐 호출 주체가 bridge임을 event가 증명하지 않는다. | 사용자가 결과 commit 전에 pane을 수동 close하면 구현자가 타입만 보고 expected cleanup으로 무시하여 terminal fence가 발화하지 않고 late completion이 done을 만들 수 있다. |
| Medium | §9-bis 6 · `bridge-runtime.ts:1177-1203,1899-1916` | unknown terminal을 무조건 폐기하는 락에 flight 등록 직전 사망을 회수할 초기/주기 reconcile 의무가 결합되어 있지 않다. | `agent.start`가 pane id를 돌려주기 직전 프로세스가 끝나 global terminal이 `flights.set()` 전에 도착하면 이벤트는 inert로 사라지고, 후속 status도 없을 때 카드는 영구 doing에 남는다. |
| Medium | `herdr-client.ts:544-566,589-700` · `bridge-runtime.ts:1899-1916` | 증분 구독마다 전체 구독 소켓을 다시 열고 모든 push를 epoch 정보 없이 공용 callback으로 넘기지만 설계는 terminal 외 status/conv 경로의 replay 가능성을 검토하거나 시험하지 않았다. | herdr가 `pane.agent_status_changed`도 replay한다면 새 카드 한 장의 구독 추가가 기존 카드의 오래된 idle/done을 재실행해 조기 완료를 만들거나 기존 conv의 과거 done을 다시 보내며, 이번 프로브는 status push 0건이라 이 조건은 아직 미확인이다. |
| Medium | §9-bis 7 | 60초는 관측된 최대 live delivery bound가 아니고 백로그 상한도 미확정인데, 만료 후 “그래도 실패”의 판정 시점·재시도 후 대기·새 flight generation 보호가 문구에 없다. | 60초를 넘는 백로그에서 정상 cleanup terminal이 늦게 오면 tombstone이 먼저 사라져 unknown으로 오염되고, 그 사이 같은 pane id가 새 lifecycle에 귀속되면 무조건 close 재시도가 새 pane을 닫을 수 있다. |
| Medium | §9-bis 8 | “1 strike”만 정의하고 본문이 요구한 `연속 2회 absent + grace`, present/unknown에서의 reset, poll 간격, flight generation 일치를 락하지 않아 구현별 의미가 달라진다. | 첫 absent 뒤 RPC timeout을 건너뛰고 두 번째 absent를 누적하거나 오래된 poll 응답을 새 flight에 적용하면 실제로 연속 확인되지 않은 pane을 terminal로 합성한다. |

## 3. §9-bis 락 후보 8건별 의견

### 1) 종료 판별은 이벤트 타입으로 한다 — 수정

필요한 구분이지만 `pane_closed = 우리가 닫음`은 과도하다. 이벤트 타입은 terminal의 형태만 분류하고, expected cleanup 여부와 카드 성공 여부는 동일 flight generation의 로컬 phase로 판정해야 한다.

대체 문구:

> `pane_exited`와 `pane_closed`는 서로 다른 terminal source로 기록한다. `pane_closed`도 현재 lifecycle이 동일 generation의 `result_committed → cleanup_requested`를 먼저 완료한 경우에만 `terminal_expected`이며, 그 밖의 모든 terminal은 uncommitted 후보로 취급한다. 이벤트 타입만으로 작업 성공이나 “bridge가 닫음”을 판정하지 않는다.

### 2) 종료 코드·시그널 기반 판정 금지 — 유지

2라운드의 모든 terminal `data` 키는 `{pane_id,type,workspace_id}`였고 봉투도 `{data,event}`뿐이다. exit 0과 SIGKILL payload는 pane id 외 동일하므로 현재 문구가 필요하고 모호하지 않다. 이 락을 지켜도 결과 내용의 진실성은 자동 보장되지 않지만, 그 문제는 start/activity/result-commit fence의 몫이다.

### 3) replay 방어 이중 조건 — 수정

현재 두 번째 조건은 모든 live push와 replay push가 공통으로 만족하므로 삭제해야 한다. 수신 시각으로 과거 사건을 판별할 수 없는 이상 unexpected terminal은 단독 권위가 아니라 reconcile trigger여야 한다.

대체 문구:

> terminal push는 (a) `pane_id`와 현재 lifecycle generation이 일치하고 (b) 그 lifecycle이 아직 terminal latch를 소비하지 않았을 때만 advisory trigger로 받는다. `cleanup_requested`인 동일 generation은 expected로 latch한다. 그 밖의 unexpected terminal은 즉시 result를 내지 말고 bounded reconcile을 시작해, grace로 분리된 `pane.list` 성공 응답 두 번에서 연속 absent일 때만 `terminal_uncommitted`를 확정한다. present는 replay로 간주해 strike를 reset하고, unknown/RPC 오류는 확정 근거로 쓰지 않는다.

### 4) `PaneDied for unknown pane` 진단 금지 — 수정

진단 입력에서 배제하는 결정은 타당하지만 “우리 close가 유발”은 아직 식별자 대조 없는 강한 추론이다. 원인을 확정하지 않아도 이 로그가 card/pane 귀속 신호로 부적합하다는 결론은 유지된다.

대체 문구:

> `PaneDied for unknown pane`은 bridge의 lifecycle 판정·경보·통지 유실 진단 입력으로 사용하지 않는다. 이번 관측에서는 `pane.close` 요청 139ms 뒤이자 ACK 직전에 유일한 경고가 발생해 강한 시간 상관은 있으나, 내부 id `236`과 API pane id의 대응이 확인되지 않았으므로 호출 인과는 미확정으로 기록한다.

### 5) `result_sending → committed` 원자 CAS — 수정

현재 문구는 늦은 CAS라 발행을 직렬화하지 못하고, 원격 enqueue와 로컬 ACK 사이의 불확실성도 해결하지 못한다. 최소한 send 소유권 CAS와 in-flight terminal 보류가 필요하며, wire exactly-once를 주장하려면 relay idempotency/reconcile이 별도로 필요하다.

대체 문구:

> 오직 `completion_candidate → result_sending` CAS 승자만 `sendResult`를 호출한다. `result_sending` 동안 도착한 terminal은 `terminalPending`으로 latch할 뿐 경쟁 failed result를 보내지 않는다. ACK는 `status ∈ {queued, delivered}`이고 `recipientCount=1`일 때만 committed로 인정한다. 명시적 거부는 단일 소유자가 failed로 종결하고, transport error/ACK 유실은 `commit_unknown`으로 두어 cleanup·두 번째 result를 금지한다. 재발행이 필요하면 `(cardId, seq, dispatchHandoffId)` 기반 relay/tower idempotency 또는 inbox reconcile을 먼저 추가하며, 그것 없이는 wire exactly-once를 주장하지 않는다.

### 6) unknown terminal = inert — 수정

result 미발행 원칙은 필요하지만 등록 직전 사망 회수와 한 세트여야 한다.

대체 문구:

> 현재 lifecycle generation에 바인딩되지 않은 terminal은 structured counter/log만 남기고 result를 발행하지 않는다. 대신 모든 flight는 `flights.set()` 직후 초기 presence check와 주기 bounded reconcile을 시작해, 등록 전에 유실된 실제 terminal도 연속 absent 규칙으로 회수한다. unmatched terminal 자체를 나중 flight에 소급 바인딩하지 않는다.

### 7) cleanup TTL 60s — 수정

60초는 correctness bound가 아니라 조정 가능한 운영 기본값으로만 둘 수 있다. 만료 동작과 generation 보호를 완전하게 적어야 한다.

대체 문구:

> cleanup tombstone TTL 기본값은 60초인 운영 파라미터이며 live terminal 전달 상한으로 간주하지 않는다. 만료 시 동일 lifecycle generation임을 재확인한 뒤 `pane.list` 성공+absent이면 tombstone을 만료한다. 성공+present이면 `pane.close`를 정확히 1회 재시도하고 최종 bounded TTL 한 번만 더 유지한다. RPC 오류/timeout에서는 close하지 않고 counter를 남긴 뒤 정책상 만료하며, 어느 분기에서도 추가 result를 발행하지 않는다. 새 generation이 같은 pane id를 소유하면 재시도 close를 금지한다.

### 8) bounded reconcile strike — 수정

핵심 fail-closed 방향은 맞지만 연속성·reset·generation을 명시해야 한다.

대체 문구:

> 동일 lifecycle generation에 대해 grace 이상의 간격으로 수행한 `pane.list`의 성공 응답에서만 absent strike를 센다. `absent → absent` 두 번이 연속일 때 terminal을 합성한다. 성공 응답에서 present면 즉시 strike=0으로 reset하고, RPC 오류·timeout은 unknown으로 기록하면서 strike=0으로 reset한다. poll 시작 시 캡처한 generation이 현재와 다르면 응답 전체를 폐기한다.

## 4. 깨뜨리려 했으나 실패한 항목

- 라운드 2 raw 382줄은 전 줄 JSON parse에 성공했고 마지막 382번째 줄에 `PROBE_END`가 있으며 `success=[a,b,c]`, 보호 pane 5/5 생존이 확인됐다. 라운드 1에는 `PROBE_END`가 없어서 관측 정본에서 제외한 판단이 맞다.
- §9-1은 **관측한 범위**에서 유지됐다. 라운드 1·2의 자연사 `p5D/p5G`와 SIGKILL `p5E/p5H`는 `pane_exited`만, API close `p5F/p5J`는 `pane_closed`만 보였고 여섯 pane에서 혼재가 없었다.
- §9-2는 raw로 직접 재확인됐다. terminal `data`와 봉투 키는 모든 표본에서 각각 `pane_id,type,workspace_id`와 `data,event`였고 exit code·signal·timestamp·seq가 없었다.
- §9-5를 “부분”으로 두고 불변식으로 잠그지 않은 판단은 옳다. 두 라운드가 요청→ACK→event 순서를 보였지만 ACK→event 22ms/211ms는 backlog tick과 같은 규모이며 n=2라 반대 순서를 배제하지 못한다.
- 현행 코드에서 close ACK가 terminal event보다 먼저여야만 하는 분기는 찾지 못했다. `HerdrClient`는 subscribe ACK 전후와 무관하게 push를 callback에 넘기고, `finishCard`는 result send 성공 뒤 close를 호출할 뿐 terminal handler는 별도 소켓에서 동작한다. 구현 시 `cleanup_requested`를 close RPC await **전에** 기록하고 event-before-ACK 테스트를 두면 §9-5 비의존성을 유지할 수 있다.
- unknown terminal에서 result를 발행하지 않는 방향은 깨뜨리지 못했다. `onHerdrEvent`의 현재 map miss가 inert이고, 이미 done인 board는 `applyCardResult`에서도 역전이를 무시한다. 다만 등록 전 사망 회수는 finding대로 별도 reconcile이 필요하다.
- 사용자 제시 좌표는 모두 현행 파일과 일치했다: `finishCard` 2246, `pane.close` 2320, `disposeCardFlight` 1946, card `pane_closed` 분기 2119, `eventsPrune` 274, `eventsSubscribe` 544-566, `onHerdrEvent` 1899-1916. 설계 문서의 관련 좌표 묶음(`580-591`, `1194-1203`, `1899-1916`, `1945-2001`, `2112-2197`, `2246-2324`, `herdr-client.ts:589-760`)도 현재 실행 코드와 맞았다.

## 5. 미확인으로 남긴 것

- 내부 숫자 id `pane=236`과 API id `w3:p5J`의 실제 대응. 따라서 §9-3은 강한 시간 상관까지 확인했고 인과 확정은 하지 않았다.
- herdr가 `pane.agent_status_changed`를 terminal/created/updated와 똑같이 replay하는지. 이번 plain bash 프로브의 status 전용 구독은 push 0건이었다.
- workspace 또는 herdr 재시작 뒤 `pane_id`가 재사용되는지. 락 3의 구체적 false positive가 이 조건 없이 현재 active flight에 곧바로 재현된다고 주장하지 않는다.
- 백로그의 시간/개수 상한과 60초 TTL의 충분성. raw는 최소 10분 보존과 약 110ms/건 드레인만 입증한다.
- ACK 직전 연결 단절을 실제 relay에서 재현했을 때 client가 어떤 오류를 보는지. 다만 relay가 enqueue/persist 뒤 ACK를 쓰고 서버가 매번 새 handoff id를 생성하는 코드 순서 때문에 commit-unknown 창 자체는 존재한다.
- WSL/VPS에서 terminal delivery 지연과 event 종류가 Mac과 같은지.
- close event가 ACK보다 먼저 전달될 수 있는지. n=2 결과는 이를 반증하지 못한다.
- 프로브를 이번 리뷰에서 재실행하지 않았다. 재실행은 scratch pane 생성과 SIGKILL/close를 포함하는 파괴적 동작이라, 완주 마커가 있는 기존 raw를 직접 검증하는 범위에 머물렀다.

[PANEDEATH-REVIEW-DONE] verdict=reject high=3 med=6 low=0
