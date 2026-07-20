# PANE-DEATH Codex 2차 적대적 검증

## 1. Verdict

**reject** — relay ACK 엄격 판정 자체는 유의미하지만, `commit_unknown`의 새 락과 기존 §5~§7의 상태도·판정·테스트가 서로 모순되어 ACK 유실 뒤 이중 result를 다시 허용하고 lifecycle generation·reconcile 규약도 구현을 잠글 만큼 정의되지 않았다.

## 2. 반영 충실도

판정: **의미 반영은 8/8, 축자 일치는 6/7(교체 대상 기준)**이다. 락 3·4·5·6·7·8은 1차 보고서 §3의 대체 문구와 축자 일치한다. 락 1은 의미는 같지만 마지막 문장의 인용부호가 1차의 `“bridge가 닫음”`에서 §9-bis의 `"bridge가 닫음"`으로 바뀌어, 문서가 주장하는 “축자 그대로”는 문자 단위로는 거짓이다.

| 락 | 판정 | 불일치·문맥 유실 |
|---|---|---|
| 1 | **축자 불일치, 의미 일치** | 굽은 큰따옴표 `“…”`가 ASCII 큰따옴표 `"…"`로 변형됐다. |
| 2 | **원문 보존** | 교체 전의 결정 문장과 근거 2줄은 그대로이며, 뒤에 `검증 결과` 1줄만 추가됐다; 따라서 원문은 변형되지 않았지만 항목 전체의 byte identity는 아니다. |
| 3 | **축자 일치** | 누락·변형 없음. |
| 4 | **축자 일치** | 누락·변형 없음. |
| 5 | **축자 일치** | 누락·변형 없음. |
| 6 | **축자 일치** | 누락·변형 없음. |
| 7 | **축자 일치** | 누락·변형 없음. |
| 8 | **축자 일치** | 누락·변형 없음. |

가장 큰 문맥 유실은 복사 과정 자체가 아니라 **교체 뒤에도 상위 설계 문맥을 갱신하지 않은 것**이다. §6.1의 `PaneLifecycle.phase`에는 `commit_unknown`이 없고, §5 B 상태도·§6.2.1·§7.1 4·6은 여전히 “ACK 전 terminal/send false → failed result”를 요구한다. 이는 락 5·9의 “transport error/ACK 유실 → `commit_unknown`, cleanup·두 번째 result 금지”와 정면으로 충돌한다.

## 3. Findings

| 심각도 | 대상 | 결함 1문장 | 실패 시나리오 1문장 |
|---|---|---|---|
| **High** | §9-bis 5·9 ↔ §5 B 상태도·§6.1~6.2·§7.1 4·6 | 새 락은 ACK 유실을 `commit_unknown`으로 두고 두 번째 result를 금지하지만 기존 규범은 ACK 전 terminal 또는 send false 뒤 failed result를 보내라고 해 동일 문서가 반대 전이를 명령한다. | relay가 done을 persist한 뒤 ACK만 유실하고 terminal이 오면 구현자가 §7.1 6을 따라 failed를 재발행해 tower inbox에 done과 failed가 함께 남는다. |
| **Medium** | §9-bis 3·7·8 · §6.1 | `lifecycle generation`의 생성원·identity·저장 위치·교체 시점이 없고 terminal 봉투에도 generation이 없어서 “동일 generation” 검사가 구현 가능한 불변식으로 정의되지 않았다. | 구현자가 generation을 `paneId`로 간주하면 재사용된 pane id의 늦은 poll 응답이나 tombstone close가 새 pane에 적용되고, per-flight nonce로 간주하면 같은 입력이 폐기되어 구현별 안전성이 갈린다. |
| **Medium** | §9-bis 3·6·8 | `grace`, 주기 poll 간격, 한 reconcile의 최대 시도 수, 시작 phase와 중단 phase가 정해지지 않아 “주기 bounded reconcile”이 시간·부하·liveness 어느 것도 잠그지 못한다. | 구현 A가 `flights.set()` 직후 100ms 간격 두 번 absent로 terminal을 합성하면 list 가시성 지연을 사망으로 오판하고, 구현 B가 terminal push 때만 5초 간격 두 번 검사하면 등록 직전 사망을 다음 push 없이 영구 놓친다. |
| **Medium** | §9-bis 1 ↔ §9-bis 3 | 락 1은 phase 조건을 만족한 `pane_closed`만 expected이고 그 밖의 모든 terminal은 uncommitted 후보라 하지만 락 3은 `cleanup_requested`인 동일 generation의 terminal source 전부를 expected로 latch한다. | cleanup 요청 직후 자연 `pane_exited`가 오면 구현 A는 락 1에 따라 uncommitted reconcile을 시작하고 구현 B는 락 3에 따라 expected cleanup으로 끝낸다. |
| **Medium** | §9-bis 5 | `terminalPending`을 ACK 성공·명시적 거부·transport error 각각에서 어떻게 소비하는지와 “명시적 거부를 failed로 종결”이 로컬 phase인지 별도 wire result인지 전이표가 없다. | 구현 A는 strict ACK 성공이 오면 pending terminal을 expected로 흡수하지만 구현 B는 pending을 먼저 처리해 이미 enqueue된 done 뒤 failed를 보내거나, `peer_unknown`에 failed wire를 같은 unknown peer로 다시 보내며 서로 다른 결과를 낸다. |
| **Medium** | §9-bis 5·6·8·9 | `commit_unknown`의 보존 기간·reconcile 참여 여부·운영자 회수 신호·프로세스 종료 시 처리가 없어 안전을 위해 멈춘 flight의 liveness와 자원 상한이 정의되지 않았다. | 구현 A는 flight와 periodic timer를 무기한 유지해 누적 누수를 만들고 구현 B는 60초 뒤 dispose해 late ACK/terminal을 unbound로 버리며 tower의 doing을 영구화한다. |
| **Medium** | §9-bis 9 · `room.ts:489-557` · `relay-client.ts:322-344` | 엄격 ACK가 증명하는 범위는 현재 요청이 단일 roster target inbox에 **그 시점에** enqueue됐다는 것뿐인데 “committed 거짓 양성 없음”은 durable relay·향후 inbox 비퇴출·tower 적용까지 포함하는지 경계를 정의하지 않았다. | 구현 A는 ACK를 relay-accept commit으로만 기록하지만 구현 B는 tower-delivery commit으로 해석해 ephemeral 모드 crash나 pending inbox 100건 trim 뒤 결과가 사라져도 pane을 닫고 완료가 보존됐다고 판단한다. |
| **Medium** | §9-bis 3·6 · status completion 경로 | 1차 미확인인 `pane.agent_status_changed` replay 여부가 닫히지 않아 terminal만 reconcile로 방어해도 start/activity/completion event가 과거 generation에서 재생될 가능성이 남는다. | status도 replay된다면 구현 A는 현재처럼 per-pane status를 즉시 신뢰해 스테일 working→idle로 새 flight를 조기 완료하고 구현 B는 snapshot revision/flight token 대조 뒤에만 수용해 서로 다른 결과를 낸다. |

### 락 9 공격 결과 — 껍데기인가

**껍데기는 아니다.** 현행 relay 실행 경로를 따라 확인한 계약은 다음과 같다.

- `Room.resolveTargets()`는 결과 수신 peer id를 직접 찾으면 정확히 한 target을 만들고, target이 없으면 `peer_unknown`, `recipientCount=0`을 반환한다.
- `routeHandoff()`는 target마다 inbox entry를 먼저 만들고, durable registry에서는 `touchPersist()`를 동기 실행하며, persist 실패 시 entry를 rollback하고 error envelope를 내므로 ACK가 나오지 않는다.
- 그 뒤에만 `queued|delivered`와 `recipientCount=targets.length`가 ACK에 실린다; `delivered`는 socket notify 성공이지 tower claim/application 완료를 뜻하지 않는다.
- 현재 client/server는 `requestId`를 echo·대조하므로 해당 ACK가 다른 동시 handoff의 ACK일 가능성도 현행 protocol 경로에서는 제거된다.

따라서 strict ACK는 `peer_unknown`을 성공으로 오인해 pane을 닫는 기존 false positive를 실제로 막고, send-owner CAS와 `commit_unknown`은 로컬 이중 발행을 줄이는 유의미한 PATCH다. 다만 relay/tower idempotency와 inbox reconcile을 분리한 동안의 최대 보장은 **기본 durable relay에서 단일 target inbox가 ACK 시점에 결과를 수락했다**까지이며, tower 관측·적용이나 wire exactly-once는 아니다. 이 제한 자체는 범위 분리로 허용 가능하지만, 위 High 규범 충돌을 먼저 제거해야 그 제한된 보장도 구현에서 유지된다.

## 4. 1차 미확인 7건의 구현 전/후 분류

| 미확인 | 분류 | 이유 | 구현 전 필수라면 최소 실험 1줄 |
|---|---|---|---|
| 내부 숫자 id ↔ API pane id 대응 | **구현 후 가능** | 락 4가 인과를 미확정으로 낮추고 해당 로그를 판정 입력에서 제외했으므로 correctness 선행조건이 아니다. | — |
| `pane.agent_status_changed` replay 여부 | **구현 전 필수** | replay되면 terminal 락만으로는 조기 done을 막지 못해 status 수용 규칙 자체가 달라진다. | scratch agent에서 working→idle을 1회 만든 뒤 event socket을 재구독해 동일 pane의 과거 status push가 다시 오는지 raw envelope와 `PROBE_END`로 기록한다. |
| workspace/herdr 재시작 뒤 `pane_id` 재사용 | **구현 후 가능(조건부)** | generation을 `paneId`가 아닌 매 `agent.start`별 불투명 nonce와 `terminalId`로 정의하면 재사용 사실에 안전성을 의존하지 않는다; 그 정의를 거부하면 구현 전 실험으로 승격해야 한다. | — |
| 백로그 시간/개수 상한과 60초 충분성 | **구현 후 가능** | 락 7이 60초를 correctness bound가 아닌 운영 기본값으로 낮췄으므로 튜닝·원격 실측 문제다. | — |
| 실제 relay의 ACK 유실 재현 | **구현 후 가능** | enqueue→persist→ACK 코드 순서로 uncertainty window는 이미 성립하며 구현 중 fault-injection 단위 테스트로 `commit_unknown` 분기를 잠글 수 있고 live packet-cut은 사후 smoke여도 된다. | — |
| WSL/VPS의 terminal 종류·지연 | **구현 후 필수 smoke** | 로컬 상태기계의 선행 설계조건은 아니지만 배포 완료 주장은 원격 핵심 3경로 실증 전에는 할 수 없다. | — |
| 프로브 미재실행 | **구현 후 가능 / 재실행 자체는 불필요** | 기존 round 2 raw가 전 줄 parse되고 `PROBE_END`까지 있어 현재 락이 의존하는 terminal shape·replay 사실은 이미 회수됐다; status replay는 위 별도 최소 실험으로 닫아야 한다. | — |

“구현 후 가능”은 해당 사실이 참이라는 뜻이 아니라, **현재 PATCH의 보수적 규칙을 먼저 고정하면 그 사실의 어느 답에서도 안전성이 달라지지 않는다**는 분류다. 반대로 status replay는 아직 반증하지 못했고, push 0건은 “replay 없음”의 증거가 아니다.

## 5. 구현 착수 가능 여부와 조건

**현재 착수 불가 (`ready=no`).** 다음을 문서에서 잠근 뒤에만 구현 PATCH로 넘어갈 수 있다.

1. §5 B 상태도·§6.1 phase union·§6.2 판정·§7.1 race tests를 락 5·9에 맞춰 갱신해 `result_sending` 중 terminal과 ACK 유실에서 두 번째 result가 절대 나오지 않도록 하나의 전이표로 만든다.
2. generation을 매 `agent.start`마다 새로 생기는 bridge-local 불투명 token으로 정의하고 `paneId`·`terminalId`·owner(card/conv+id+seq)에 묶으며, 모든 async poll/TTL callback이 캡처 token을 재검증하도록 잠근다.
3. initial/periodic/terminal-trigger reconcile의 cadence, grace, 최대 시도 수, phase별 시작·중단 조건을 숫자와 전이로 정한다.
4. `pane_closed`/`pane_exited`의 expected 조건을 하나로 통일하고, `terminalPending × {strict ACK, explicit reject, transport unknown}` 전이표와 `commit_unknown`의 bounded 보존·운영자 회수 정책을 정한다.
5. 위 최소 status replay 실험을 완주 마커와 함께 실행해 status event 수용 규칙을 확정한다.
6. 락 1의 ASCII 인용부호를 1차 보고서의 굽은 인용부호로 되돌리거나 “축자 그대로” 주장을 “의미 그대로”로 낮춘다.

이 조건을 닫으면 relay/tower idempotency와 inbox reconcile은 별도 PATCH로 남겨도 된다. 그 경우 이번 PATCH의 정직한 보장은 **로컬 단일 발행 소유권 + replay terminal의 advisory화 + strict relay-accept commit + ACK 불명 시 fail-closed 정지**이며, tower 적용·재시도·wire exactly-once는 여전히 주장하면 안 된다.

[PANEDEATH-REVIEW2-DONE] verdict=reject high=1 med=7 ready=no
