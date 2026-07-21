# 워커 pane 종료 인지 — 판정·바인딩 설계 (설계 전용 · 적용 없음)

| Field | Value |
|---|---|
| **Date** | 2026-07-20 |
| **Scope** | Loom bridge의 card/conv pane 종료 인지·완료 판정 |
| **Status** | **design only** — 제품 코드 변경 없음 |
| **원인 판정** | **부분 규명, 최종 원인은 미확정** — 오늘 로그의 `PaneDied for unknown pane`은 브릿지 메시지가 아니며, 관측 종료는 모두 `pane.close` 뒤에 발생했다 |
| **권고** | **B′ — 종료 펜스 + tombstone + bounded reconcile, 단 자동 `done` 커밋은 폐지 ((C) 전환 2026-07-21)** |
| **Wire** | card contract v1 유지; 완료 후보·종료를 모두 기존 `failed` + `reason`/`note`로 표현 |
| **Review gate** | **R{n} 필요** — 완료 권위·보드 전이 의미를 바꾸는 M-lock 인접 변경 |

> 이 문서는 `.loom-hookcache-E-brief.md`의 가설을 그대로 승인하지 않는다. 오늘 로그로 확정되는
> 것은 “herdr 내부 registry 경고”와 “Loom 완료 판정의 사각”이다. **자연사 pane의 실제
> `events.subscribe` push와 종료 payload는 아직 캡처되지 않았다.** 구현 전 그 빈칸을 스모크로
> 닫아야 한다.

## 0-bis. 평가 프레임 — 무엇을 코드로 잠글 수 있는가

선례 `HOOK-CACHE-FIX-DESIGN.md`와 같은 기준을 쓴다. ✅ 축을 운영 주의나 아키텍트 육안으로
미루는 안은 채택하지 않는다.

| 판정 축 | 코드+테스트로 잠글 수 있는가 | 설계 결론 |
|---|---|---|
| `agent.start`가 돌려준 `pane_id` ↔ card/conv 바인딩 | ✅ | 단일 registry와 명시적 phase로 잠근다 |
| **브릿지가 카드를 자동으로 `done` 커밋하지 않음** | ✅ | **(C) 전환** — 완료 후보는 `needs_verification`(board `blocked`)으로만 발행한다(§6.0) |
| 결과 커밋 전 terminal event 이후 `done` 금지 | ✅ | 위 항목의 부분집합 — 자동 `done` 경로가 아예 없으므로 terminal fence는 **중복·유실 방지**용으로 남는다 |
| 결과 ACK 후 Loom이 요청한 cleanup vs 선행 종료 구분 | ✅ | `relayAcceptedAt`·`cleanupRequestedAt` 순서로 구분 |
| **자동 `pane.close`를 사람 확정 전에 금지** | ✅ | cleanup은 **사람 확정 + tower receipt 뒤에만**(§6.0 E2 경계) |
| `pane.closed` 이벤트 유실 시 active pane 부재 탐지 | ✅ | 동일 노드의 `session.snapshot`/`pane.list` bounded reconcile |
| Codex `Working (11m • esc to interrupt)`를 진행 중으로 인식 | ✅ | agent-kind별 실측 패턴 + 음성 케이스 유닛 |
| `status=done`이 와도 실제 work-start 없으면 **완료 후보 승격** 거부 | ✅ | `sawWorking` 또는 동등한 제출-성사 증거를 필수 게이트로 |
| card result v1·M-1·L-2 불변 | ✅ | 신규 필수 필드 없이 기존 `failed/reason/note` 사용 |
| **센서별 증거 등급의 명제 단위 고정** | ✅ | 전역 우선순위 폐기, **증거 명제표**가 정본(§6.0-bis) |
| herdr v0.7.4가 자연사 시 내는 이벤트 종류·순서 | ⚠️ | 정적 schema만으로 불충분; 실제 pane kill 스모크 필요 |
| `needs_verification` 알림이 실제로 타워에 도달했는가 | ⚠️ | 현행 발행 경로 2개 모두 전달을 추적하지 않는다 — 요구사항으로 승격(§6.7) |
| exit code 0/SIGHUP/SIGKILL이 “작업 품질”을 뜻하는가 | ❌ | 뜻하지 않는다. cleanup 원인과 결과 커밋 순서만 기계 판정 |
| 종료 직전 남은 TUI 텍스트가 충분한 산출물인가 | ❌ | 사람/타워가 diff·테스트·artifact를 검증해 최종 결정 |
| **lifecycle 센서로 “의미상 완료”(P7)를 확정** | ❌ | 원리상 불가 — 결합 규칙 7(§6.0-bis). result/artifact + 독립 diff·test로만 |
| A/C의 산출물이 제품 요구를 정말 충족했는가 | ❌ | 오늘은 아키텍트 사후 검증 결과일 뿐, 범용 규칙으로 승격 금지 |

핵심 분리:

- **transport/lifecycle 판정**은 브릿지가 코드로 잠근다.
- **산출물 의미 판정**은 타워/사람에게 남긴다.
- 따라서 `pane 종료 전 최종처럼 보이는 텍스트`만으로 브릿지가 `done`을 만들지 않는다.
- **(C) 전환은 이 분리를 끝까지 밀어붙인다:** 브릿지는 `done`을 **어떤 경로로도** 만들지 않는다.
  “의미상 완료”는 lifecycle 센서 밖에 있으므로(P7), 브릿지가 낼 수 있는 최선은
  **검증 요청**(`needs_verification`)이다.

## 0. 요약 (3줄)

1. `PaneDied for unknown pane`은 **herdr 내부** `herdr::app::actions` 경고다. 브릿지가 card를
   못 찾았다는 로그가 아니며, 오늘 212–215·217은 모두 `pane.close` RPC가 먼저였다.
2. 실제 Loom 결함은 종료 통지 폐기라고 단정할 수 없다. 더 확실한 결함은 **완료 후보를 너무
   일찍 `done`으로 커밋하고 그 결과로 pane을 닫는 것**이다. 213의 exit는 원인이 아니라 결과다.
3. **(C) 전환 후의 권고 B′는 `done` 커밋점을 브릿지에서 없앤다.** 완료 후보든 커밋 전 pane
   종료든 브릿지가 내는 것은 **`needs_verification`(board `blocked`) 하나**이며, `done`은
   아키텍트가 워킹트리 독립 검증 뒤 확정한다. ACK는 여전히 **relay 수락 경계**를 표시하지만,
   더는 완료 커밋점이 아니라 **알림 전달 확인점**이다. cleanup(`pane.close`)은 사람 확정 뒤로
   미룬다.

## 1. 실측 재구성 — 로그가 말하는 것과 말하지 않는 것

### 1.1 출처

| 근거 | 좌표/내용 |
|---|---|
| herdr 서버 로그 | `~/.config/herdr/herdr-server.log:17431-17522`, `:17530-17541` |
| 브릿지 stderr | `~/.loom/bridge/mac-node.stderr.log` — 12줄, 종료 ingress 기록 없음 |
| relay result | `~/.loom/relay-state/693b8a0deca3d739.json`의 `loom-card-result` attachments |
| 보드 사후 기록 | `~/.loom/boards/693b8a0deca3d739.json` |
| 바인딩/판정 코드 | `packages/host/src/bridge-runtime.ts:580-591,1194-1203,1899-1916,1945-2001,2112-2197,2246-2324` |
| 구독 수명주기 | `packages/host/src/herdr-client.ts:544-566,589-760` |
| 0.23.4 선례 | `c7df503` + `packages/host/src/herdr-lifecycle.test.ts` |
| card contract v1 | `packages/protocol/src/card-contract.ts:10,33-57` |
| still-running | `packages/host/src/bridge-runtime.ts:123-134,397-435` |

### 1.2 `PaneDied` 발신자는 herdr다 — 확정

로그 namespace는 다음과 같다.

```text
WARN herdr::app::actions: PaneDied for unknown pane pane=213
```

Loom 소스에는 `PaneDied` 문자열이 없고, 브릿지 로그 접두사는 `[loom-bridge]`다. 따라서 브리프의
“브릿지가 `PaneDied for unknown pane`으로 버렸다”는 문장은 **발신 주체가 틀렸다.** 이 경고의
`unknown pane`은 herdr UI/app registry를 가리키며, Loom의 `flights` map을 가리키지 않는다.

### 1.3 오늘 관측한 종료는 모두 `pane.close` 뒤였다 — 확정

| pane | agent | 선행 이벤트 | child exit | 해석 |
|---:|---|---|---|---|
| 213 | Codex | 09:36:52.243 `pane.close` request | 09:36:52.252 code 0; 뒤이어 Hangup | close가 먼저. “자연사 후 통지” 아님 |
| 212 | Grok | 09:42:01.807 `pane.close` request | 09:42:02.033 code 129; Hangup | close가 먼저 |
| 214 | Claude | 09:42:41.136 `pane.close` request | 09:42:41.683 code 1/Killed:9 | close가 먼저 |
| 215 | Claude | 09:55:36.216 `pane.close` request | 09:55:36.815 code 1/Killed:9 | valid result 뒤 bridge cleanup과 시각상 정합 |
| 217 | Grok | 10:09:00.622 `pane.close` request | 10:09:00.856 code 129; Hangup | valid result 뒤 bridge cleanup과 시각상 정합 |

특히 두 건은 원인 방향을 고정한다.

- pane 215의 result `finishedAt=09:55:36.110Z`, `status=done`, summary는 실제
  `[HOOKCACHE-B-DONE] ...`; `pane.close`는 106ms 뒤다.
- pane 217의 result `finishedAt=10:09:00.618Z`, `status=done`; `pane.close`는 4ms 뒤다.

현행 `finishCard()`도 result 전송 성공 뒤 `pane.close`를 호출한다
(`bridge-runtime.ts:2310-2323`). 즉 **exit 129/SIGKILL은 정상 cleanup에서도 나온다.** 종료 코드나
signal만으로 `failed`를 정하면 오늘 215·217을 오탐한다.

### 1.4 “브릿지 로그에 종료 줄 0건”이 증명하지 않는 것

`onHerdrEvent()`는 paneId로 `flights`/`convFlights`를 찾고 둘 다 없으면 **로그 없이 return**한다
(`bridge-runtime.ts:1899-1916`). 정상 완료 경로는 result send 전에 flight를 dispose/prune하고,
send 성공 뒤 pane을 닫는다. 따라서 정상 cleanup의 `pane.closed`가 나중에 도착하면 map miss가
의도된 현재 거동이며 stderr 0줄도 예상 가능하다.

결론:

- 종료 이벤트가 **도착하지 않았다**: 미확정.
- 도착했지만 이미 dispose된 binding 때문에 **조용히 무시됐다**: 가능하나 미확정.
- 오늘 `PaneDied` 5건을 **브릿지가 버렸다**: 로그로는 기각.

이를 확정하려면 §7의 raw subscription 스모크가 필요하다.

## 2. 현행 pane ↔ 카드 바인딩 경로

### 2.1 등록·구독

```text
dispatch handoff claim
  → spawnWorkerAgent()/agent.start
  → agent.{pane_id,terminal_id}
  → Flight 생성
  → flights.set(agent.pane_id, flight)
  → eventsSubscribe(pane.agent_status_changed, pane_id)
  → prompt inject/submit
```

- 브릿지 시작 때 `pane.closed`를 global 1회 구독한다(`:580-591`).
- card pane은 `agent.start` 반환값을 `Flight.paneId`에 넣고 `flights`에 등록한 뒤, 같은 ID로
  status를 구독한다(`:1179-1203`).
- conv도 `convFlights: paneId→flight`, `convPaneByConvId: convId→paneId` 두 map을 쓴다.
- 이벤트 소비는 push의 `data.pane_id`로 위 map을 조회한다(`:1899-1916`).

따라서 등록 시점에서 pane↔card가 “애초에 연결되지 않는다”는 증거는 없다. 오히려 relay result에
`paneId=w3:p4X/w3:p4Y/w3:p4Z`가 실려 있어 등록 자체는 실증됐다.

### 2.2 바인딩이 끊기는 실제 지점

card 완료 후보에서 현행 순서는 다음이다.

```text
status done 또는 (idle && sawWorking)
  → beginCardCompletion
  → still-running 판정
  → disposeCardFlight (flights.delete)
  → eventsPrune
  → finishCard/read/result send
  → send 성공이면 pane.close
```

즉 binding은 **result가 ACK되기 전에** 끊긴다. 이 사이 pane이 닫히거나 result send가 실패하면,
terminal event가 어느 card에 속했는지 `onHerdrEvent()`가 더는 알 수 없다. 현재 설계에는
`completed/cleanupRequested` tombstone도 없다.

이것이 코드로 확인된 binding gap이다. 다만 오늘 `PaneDied` 경고의 직접 원인이라고 단정할 수는
없다. 경고는 herdr 내부이며, 215·217처럼 이미 정상 결과를 보낸 cleanup도 같은 경고를 냈기 때문이다.

### 2.3 pane 종료 소비 경로는 이미 있다

active card flight가 있는 상태에서 `pane.closed`가 들어오면 현행은:

1. flight dispose + status subscription prune
2. `status=failed`, `reason=pane_closed` result 전송
3. 타워 `applyCardResult()`가 board를 `blocked`로 전이

conv는 `blocked` turn(`note=pane_closed`)을 보내며, `CONV_SPEC.md §1.3-1.4`의 “원격은 제안,
타워가 확정/종료” 규약과 맞는다. **소비 로직이 없는 것이 아니라, 실제 자연사 이벤트 delivery와
결과-커밋 전후 phase가 관측되지 않는 것이 문제다.**

## 3. 0.23.4 `c7df503`과의 관계

### 판정: **별개가 우세**, 단 raw event capture 전까지 완전 배제는 금지

0.23.4의 원인은 `eventsSubscribe()` 증분 호출마다 이전 socket을 교체하면서 생긴 append-only
구독·pre-ACK close 정착 실패였다. 수정은:

- subscription set 병합·dedup
- 새 **subscription generation** ACK 후 연결 정착
- pre-ACK close/timeout reject
- 실패 호출의 신규 entry만 rollback
- closed pane subscription prune
- startup global `pane.closed`

> **동명이의 주의:** 여기의 "subscription generation"은 0.23.4의 **구독 소켓 세대**를 가리키며,
> §6.1의 **lifecycle generation**(매 `agent.start`마다 발급되는 bridge-local token)과 **무관**하다.

현재 코드는 그 구현을 그대로 유지하며, 이후 diff는 pane layout/resize 등 무관한 추가다. 오늘 로그도
각 `agent.start` 뒤 기존 subscription socket의 `stream_closed`를 반복 기록한다. 이는 set 확장을 위한
의도적 재open과 정합하며, 여러 뒤 카드가 status result를 실제 보냈다(215·217).

따라서 “두 번째+ 카드부터 event stream이 죽었다”는 0.23.4 회귀 증거는 없다. 반대로 다음은 아직
없다.

- real herdr에서 global `pane.closed` push 원문 fixture
- 자연사 시 `pane.closed`와 `pane.exited` 중 무엇이 어느 순서로 오는지
- event reconnect window에 종료가 났을 때 snapshot reconcile 결과

이 셋을 캡처하기 전에는 0.23.4 잔재 가능성을 0으로 쓰지 않는다.

## 4. 가짜 `card.done`의 별도 원인 — pane death와 인과를 뒤집지 말 것

### 4.1 pane 213: false completion → auto-close → exit

213은 spawn 6초 뒤 `pane.close`가 먼저였다. 현행 완료 조건은
`status === "done" || (status === "idle" && sawWorking)`이다. 즉 herdr detection이 초기 TUI를
`done`으로 오인하면 **`sawWorking=false`여도 완료**한다. 스크레이프에 still-running 문구가 없으면
바로 result를 보내고 pane을 닫는다.

따라서 가장 보수적인 인과는:

```text
초기 TUI → herdr completion-class status → no-indicator → 가짜 result
→ bridge auto pane.close → exit code 0/Hangup → herdr internal unknown-pane warning
```

“pane이 먼저 죽어서 초기화면이 done으로 갔다”는 순서는 로그와 맞지 않는다.

### 4.2 Codex Working: 0.23.7 still-running의 실제 coverage gap

`hasStillRunningIndicator()`가 아는 패턴은 현재 하나뿐이다.

```regex
\d+\s+commands?\s+still\s+running
```

따라서 Codex의 `Working (11m • esc to interrupt)`는 **결정론적으로 miss**한다. completion-class
status가 잘못 오면 유예가 발화하지 않고 finish로 간다. 이 관계는 브리프 지적대로 직접적인
방어 공백이다.

단 오늘 pane `w3:p4Y`의 보존 result payload는 `status=failed`, `reason=agent_blocked`다. body
헤더가 항상 `[DONE]/intent: card.done`이라 failed result도 운영상 “card.done 메시지”로 보이지만,
board 적용 의미는 `blocked`다. 정확히 어떤 status/hookHint 순서가 그 result를 만들었는지는 bridge
event ingress 로그가 없어 미확정이다. **Codex Working 패턴 누락은 확정, 해당 envelope의 단일
직접 원인이라는 서술은 미확정**으로 남긴다.

### 4.3 결론: 사망 인지와 still-running은 대체 관계가 아니다

- still-running은 **살아 있는 pane의 premature completion을 막는 앞단 게이트**다.
- terminal fence는 **pane이 실제로 끝났을 때의 late 발행을 막는 뒷단 게이트**다.
  *((C) 전환 후 이 펜스가 막는 것은 late `done`이 아니라 **late·중복 발행**이다 — 자동 `done`
  경로가 아예 없기 때문이다. §6.2 규칙 1.)*
- 둘 중 하나만 고치면 다른 실패가 남는다. 권고안은 병행한다.

## 5. 선택지

| 안 | 내용 | 비용 | 주 리스크 | 되돌리기 비용 | 판정 |
|---|---|---:|---|---:|---|
| **A — 패턴 보강만** | Codex `Working (…)`를 still-running에 추가, `done && !sawWorking` 거부 | 소 | 실제 종료 유실·binding gap은 그대로 | 소 | 불충분 |
| **B — 종료 펜스 + tombstone + reconcile** | 결과 ACK를 commit점으로, binding phase 유지, `pane.closed` + bounded snapshot reconcile, agent별 진행 패턴 | 중 | phase race 구현 복잡성; herdr 실제 event 순서 선실측 필요 | 중 | **부분 채택 → B′** |
| **B′ — B의 펜스·tombstone·generation 유지 + 자동 `done` 폐지** | 브릿지는 `done`을 만들지 않는다. 완료 후보는 `needs_verification`(board `blocked`)으로 단일 소유자가 발행하고, 사람이 워킹트리 검증 후 확정. cleanup은 확정 뒤 | 중 | 사람 개입 지연이 리드타임에 직접 반영; 알림 유실 시 카드가 `doing`에 잔존(§6.7) | 소 | **권고 ((C) 전환)** |
| **C — `pane.exited` 직접 구독 중심** | exit event·signal/code로 분류하고 final scrape 시도 | 중 | v0.7.4 subscribe surface/payload 미실측; code/signal 의미 오판 | 중 | 보조 센서만 가능 |
| **D — 워커 완료 마커/sidecar 필수화** | 워커가 bridge-readable 완료 marker/파일을 commit하고 종료 | 대 | untrusted echo 오탐, 3 agent 호환, 새 로컬 프로토콜·CONV 범위 확대 | 대 | 현 단계 비권고 |

### A — 패턴 보강만

장점은 213류·Codex Working류를 가장 싸게 줄인다는 점이다. 그러나 event delivery 자체를 증명하지
않고, result send 전 binding dispose도 남긴다. “pane 사망을 브릿지가 인지” 목표 ①을 만족하지
못하므로 단독 채택 불가다. B의 한 구성요소로만 쓴다.

### B′ — 종료 펜스 + tombstone + bounded reconcile, 자동 `done` 폐지 ★권고

기존 wire와 herdr op를 유지하면서 lifecycle을 명시한다. **(C) 전환으로 바뀐 것은 종착지다** —
어떤 분기도 `done`으로 가지 않고, 전부 `needs_verification`(board `blocked`)에서 멈춘다.

```text
spawned → submitted → running → completion_candidate → result_sending
    │                                    (needs_verification 후보)   │
    └─ (result_sending 미진입) terminal                        └─ (result_sending 진입 후) terminal
         → terminal_uncommitted                                    → terminalPending으로 latch만 하고
         → needs_verification (로컬 발행 1회)                         ACK 판정이 아래 3분기로 종결한다
                                                                        │
                                    ┌───────────────────────────────────┘
                                    ▼
                      relay accept 확인 → (사람) 워킹트리 독립 검증
                                    → done 확정 또는 재작업  → tower receipt → cleanup
```

`result_sending` 진입 후의 3분기:

| 조건 | 전이 | result |
|---|---|---|
| strict ACK 성공(`status ∈ {queued, delivered}` ∧ `recipientCount=1`) | `result_relay_accepted` → (**사람 확정 + tower receipt 대기**) → `cleanup_requested` → `terminal_expected` | 추가 발행 **없음** |
| 명시적 거부 | 단일 소유자가 `failed`로 종결 | failed 1회 |
| transport error / ACK 유실 | **`send_unknown`** | **두 번째 result 금지 · cleanup 금지** |

핵심은 active `Flight`를 result send 전에 삭제하지 않는 것이다. 발행 뒤에도 짧은 tombstone을 남겨
나중 `pane.closed`를 `expected cleanup`으로 분류한다. event가 유실되면 동일 herdr 노드의
`session.snapshot`/`pane.list`에서 **연속 2회 absent + grace**일 때 terminal로 합성한다. 한 번의
snapshot miss만으로 죽이지 않는다.

**B 대비 달라진 점 (B′):**

- `result_relay_accepted`는 더 이상 **완료 커밋점이 아니다.** relay가 검증 요청을 받았다는
  뜻뿐이며, board는 `blocked`에 머문다.
- `cleanup_requested`는 ACK 직후가 아니라 **사람 확정 + tower receipt 뒤**다.
- `commit_unknown`은 **`send_unknown`/`presence_unknown`으로 분리**한다(§6.0, E4).

비용은 phase arbitration과 타이머 테스트, 그리고 **사람 확정 지연이 리드타임에 직접 반영되는 것**이다.
되돌릴 때도 기존 delete-before-send로 돌아갈 수 있으나, 그 경우 오늘의 무관측 gap이 부활한다.

### C — `pane.exited` 직접 구독 중심

fixture schema의 general event에는 `pane.exited`/`pane_exited`가 있고 payload는 pane/workspace ID만
보인다. 그러나 기존 live fixture는 status 구독뿐이고, subscription event union에는
output/status/scroll만 나타나는 구간도 있다. exit code/signal도 event payload에 보이지 않는다.

따라서 먼저 raw probe로 지원 여부를 확인해야 한다. 지원된다면 B의 **추가 terminal sensor**로는
좋지만, code 0/SIGHUP/SIGKILL을 작업 성공 의미로 쓰면 215·217을 오분류하므로 단독 권위는 줄 수 없다.

### D — 완료 마커/sidecar 필수화

bridge가 발급한 nonce와 worker sidecar를 조합하면 더 강한 commit protocol을 만들 수 있다. 하지만
3개 TUI·원격 노드·prompt echo·artifact 규약을 동시에 바꾸며, `CONV_SPEC` 승인 범위를 넓힌다.
오늘 문제를 고치기 위한 최소 변경이 아니다. B 실증 후에도 결과 의미 검증 자동화가 필요하다는 통증이
남을 때 별도 MINOR로 재검토한다.

## 6. 권고 B′ 상세

### 6.0 (C) 전환 — 자동 `done` 커밋 폐지

**브릿지는 카드 완료를 자동으로 `done` 커밋하지 않는다.** 완료 후보는 단일 소유자가
**`needs_verification`**(타워 board `blocked`)으로 전달하고, **사람(아키텍트)이 워킹트리에서
독립 검증한 뒤 done 또는 재작업을 확정**한다.

**근거 1 — 조직은 이미 이 신호를 자문 등급으로 격하해 두었다.** `CLAUDE.md` 표준 규칙 7이
**“`card.done` 수신 ≠ 완료. 산출물은 아키텍트가 워킹트리에서 독립 검증해야 확정된다”**를 이미
선언하고 있다. 즉 우리는 **조직이 이미 자문 등급으로 내린 신호의 *정밀도*를 올리는 데 검증
3라운드를 쓰고 있었다.** 그 신호를 권위로 되돌릴 계획이 없다면 정밀도 투자에 남는 값이 없다.

**근거 2 — 불변식에서 유도되는 해다.** 결정적 완료 증거가 존재하지 않는 기질에서
“비가역 행동은 결정적 증거 또는 멱등 경로에서만”이라는 불변식을 적용하면, 자동 `done` 폐지가
**유도된다**. 이것은 **정확성 포기가 아니라 불변식의 퇴화하지만 올바른 해**다 — 권위를 갖지
못하는 행동을 아예 하지 않음으로써 불변식을 만족시킨다.

> **주의 — 기질 탓과 설계 탓을 분리하라.**
> “3연속 reject = 기질상 증명 불가능”은 **성립하지 않는다.** 세 번의 reject에는 설계자가 만든
> 결함이 섞여 있었다(문서 충돌 · 카운터 리셋 누락 — 3차 High-2는 **아키텍트 산출물 결함**이지
> 기질의 증거가 아니다). (C)를 채택하는 이유는 “증명이 불가능해서”가 아니라 위 근거 1·2 때문이다.

#### 6.0.1 자동 전이의 허용 경계 (E2)

| 신호 | 브릿지가 자동으로 할 수 있는 것 | 금지 |
|---|---|---|
| 결정적 **부정** 증거 (permission block, generation 결속된 연속 absence) | **자동 `blocked`** 허용 | — |
| 불확실한 status / scrape / timeout | **알림만** | result 확정 · `pane.close` · dispose |
| 사람 확정 + tower receipt | `cleanup`(`pane.close`) 수행 | — |
| 그 외 일체 | — | **자동 `done`** |

**자동 cleanup(`pane.close`)은 사람 확정 + tower receipt 뒤에만 수행한다.** 이 문서 §1.3이 보인
215·217의 “ACK 뒤 4~106ms cleanup”은 (C) 전환 후에는 성립하지 않는 순서다.

#### 6.0.2 `commit_unknown` 분리 (E4)

`commit_unknown`은 “result를 보냈는지도 모름”과 “애초에 만든 적도 없음”을 한 이름으로 덮어
의미가 과부하됐다. **둘로 나눈다.**

| 상태 | 의미 | 안전한 자동 출구 |
|---|---|---|
| **`send_unknown`** | result 전송을 **시도했으나** ACK가 불확실 | **없음.** 멱등성 없이 재발행 금지 — 출구는 relay idempotency PATCH 또는 운영자 |
| **`presence_unknown`** | result를 **구성한 적조차 없음**(presence 폴링 소진 등) | **있음.** 한 번도 보낸 적이 없으므로 늦게 단일 result를 내도 local single-issue가 깨지지 않는다 |

#### 6.0.3 규칙 7 완화는 보류이지 포기가 아니다 (E7)

`CLAUDE.md` 규칙 7은 **관측된 가짜 done 2건 때문에 세운 현재의 안전 가드**이며, 자동화가 영구히
불가능하다는 선언이 아니다. 자동 `done` 재도입은 원리상 도달 가능하되 **현행 status/scrape 증거표
만으로는 불가능**하고, 다음과 같은 새 결정적 증거가 필요하다.

- 카드·generation에 결속된 **verifier 결과**
- **artifact hash + 테스트 provenance**
- **durable/idempotent tower 적용**

재도입은 이 증거가 갖춰진 **좁은 경로에만** 허용한다. 증거 없이 “운영이 답답하다”를 사유로
되돌리지 않는다.

### 6.0-bis 증거 명제표 — 센서 판정의 정본 (E3)

`hookHint 우선` 같은 **전역 센서 우선순위는 폐기한다.** 센서는 서로 비교 가능한 단일 축 위에
있지 않다. 대신 **명제별 증거 등급표**를 설계 정본으로 삼는다.

**명제 7개**

| # | 명제 |
|---|---|
| **P1** | 이 카드의 프롬프트가 소비됐다 |
| **P2** | 턴이 종료됐다 |
| **P3** | 승인 대기 상태다 |
| **P4** | result가 relay 단일 inbox에 수락됐다 |
| **P5** | 현재 lifecycle의 pane이 죽었다 |
| **P6** | 추가 작업이 가능하다 |
| **P7** | 의미상 완료다 |

**등급:** `A`=authoritative · `C`=corroborating · `S`=suggestive · `N`=none
(`+`=지지 · `−`=반박 · `±`=양방향)

| 센서 | P1 | P2 | P3 | P4 | P5 | P6 | P7 |
|---|---|---|---|---|---|---|---|
| hook `UserPromptSubmit` | S+ | N | N | N | N | S+ | N |
| hook `Stop`/`StopFailure` | N | **C+** | N | N | N | S± | S+ |
| hook `Notification`/`PermissionRequest` | N | N | **C+** | N | N | C− | N |
| hook `SessionStart`/`SessionEnd` | N | S+〈End〉 | N | N | S+〈End〉 | S± | N |
| herdr screen status | S+〈working〉 | C± | C+〈blocked〉 | N | N | C± | S+〈done〉 |
| pane presence `pane.list` | N | N | N | N | C± | S± | N |
| strict relay ACK | N | N | N | **A+** | N | N | N |
| 브릿지 CAS/phase | S+ | S+〈candidate〉 | N | **A+\*** | N | N | N |

`A+*` = **동일 generation·owner CAS 승자가 strict ACK를 소비해 `result_relay_accepted`를 기록한
경우에만** 성립한다. 또한 ACK의 권위 범위는 **relay accept까지**이며, tower 적용이나 작업 품질을
포함하지 않는다(락 9의 ACK 보장 경계와 동일).

**결합 규칙 8건**

1. **P1은 현행 센서 조합으로 확정 불가.** 권위화하려면 카드·attempt nonce에 결속된
   **소비 receipt**라는 새 프로토콜이 필요하다(3차의 `sawWorking` 우회가 이를 실증했다).
2. **P2는 `Stop` 단독으로 확정 금지.** `Stop + screen non-working + indicator clear`는
   corroboration이며, 허용되는 행동은 **poll 가속 · settle read · 알림까지**다.
3. **P3는 hook+screen을 합쳐도 자동 승인·완료 권위가 아니다.** 같은 generation의 최신 `working`이
   stale hint를 해제한다.
4. **P4는 strict ACK + CAS만.** transport error나 ACK 유실은 `send_unknown`이며, 두 번째 result·
   cleanup·dispose를 **전부 금지**한다.
5. **P5는 단일 absence나 terminal push로 확정 금지.** terminal 봉투에 시각·seq·id·exit code가 없다.
   성공적 `present`가 스테일 terminal보다 우선한다.
6. **P6은 불확실하면 살아 있다고 취급한다** — 충돌 시 가용성 보존 방향으로 판정한다.
7. **P7은 lifecycle 센서로 절대 확정 불가.** result/artifact + 독립 diff·test로만 확정된다.
   이것이 §6.0의 자동 `done` 폐지가 유도되는 지점이다.
8. **CAS/phase는 진실 승격 장치가 아니라 side-effect 소유권 장치다.** CAS를 이겼다는 사실은
   “내 판정이 옳다”가 아니라 “부작용을 낼 권리가 나에게 있다”만 뜻한다.

**정본 문장:**

> 센서에는 전역 우선순위가 없다. 각 센서는 특정 명제에만 등급화된 증거를 준다. 비가역 행동은
> 해당 명제의 authoritative evidence와 동일 generation CAS를 **모두** 만족할 때만 허용된다.

*(이 표는 `AGENT-CLI-LIFECYCLE-HOOKS.md` §2 합류 규칙의 정본이기도 하다 — 그 문서의
`hookHint 있으면 우선`은 폐기되고 이 표를 참조한다.)*

### 6.1 binding/phase SSOT

card/conv 공통 terminal registry가 최소 다음을 가진다(이름은 구현 시 확정).

```ts
type PaneLifecycle = {
  paneId: string;
  terminalId: string;
  /** 매 `agent.start`마다 새로 발급되는 bridge-local 불투명 token;
   *  `paneId`·`terminalId`·owner에 결속된다. */
  generation: string;
  owner:
    | { kind: "card"; cardId: string; seq: number }
    | { kind: "conv"; convId: string; seq: number };
  phase: "spawned" | "submitted" | "running" | "completion_candidate" |
    "result_sending" | "result_relay_accepted" |
    /** 사람 확정 + tower receipt 대기. (C) 전환의 종착지 — `done`은 여기서 자동으로
     *  이어지지 않는다. */
    "awaiting_human_verification" |
    "cleanup_requested" |
    /** 구 `commit_unknown`의 분리(§6.0.2). */
    "send_unknown" | "presence_unknown" |
    "terminal_uncommitted" | "terminal_expected";
  sawWorking: boolean;
  /** phase가 아니다 — `result_sending`과 공존한다. */
  terminalPending?: {
    source: "pane.closed" | "pane.exited" | "reconcile";
    observedAt: string;
  };
  relayAcceptedAt?: string;
  cleanupRequestedAt?: string;
  terminalObservedAt?: string;
};
```

**`generation` 정의.** `generation`은 **매 `agent.start`마다 새로 생기는 bridge-local 불투명
token**이다.

- **발급 시점:** `agent.start`가 pane을 돌려준 직후, `flights.set()` 이전.
- **범위:** bridge-local. relay wire에 싣지 않으며 타워·다른 노드와 공유하지 않는다.
- **불투명성:** 구조·순서·인코딩에 의존하지 않는다. 비교는 **동일성 판정만** 허용한다.
- **결속:** `paneId`·`terminalId`·owner(`card`/`conv` + id + `seq`)에 묶인다. 같은 pane id가
  재사용되어도 generation이 다르면 **다른 lifecycle**이다.
- **재검증 의무:** 모든 async poll/TTL 콜백은 **시작 시점에 캡처한 token**을 콜백 실행 시점의
  현재 값과 대조하고, **불일치하면 응답 전체를 폐기**한다(락 8·락 7과 동일 규칙).

*(§3의 "subscription generation"은 herdr 구독 소켓 세대이며 이 lifecycle generation과 무관하다.)*

별도 relay wire 필드는 필요 없다. `Flight` 내부 필드 또는 bridge-local registry다. 프로세스 재시작
내구 저널은 이 PATCH의 범위 밖으로 남긴다. 즉 **bridge 자체 crash 뒤 active binding 복원은 여전히
미해결**이며, 본 설계가 그 문제까지 해결한다고 쓰지 않는다.

### 6.2 판정 규칙 초안

**전역 우선순위 목록이 아니다.** 각 규칙은 §6.0-bis의 특정 명제에 대한 행동 허용 범위를 규정하며,
규칙 간 충돌은 명제표와 결합 규칙 8건으로 해소한다.

1. **Terminal fence**: `pane.closed`/검증된 `pane.exited`/bounded reconcile absent가
   `result_relay_accepted` 전에 관측되면 completion task/poll을 취소한다. (C) 전환 후 브릿지는
   애초에 `done`을 만들지 않으므로, 이 펜스의 역할은 **late `done` 차단이 아니라 중복 발행 차단**
   으로 옮겨간다.
   → **bounded reconcile의 cadence 수치(초기 +1s · poll 5s · grace 3s · 연속 2회 · 최대 12회)의
   정본은 §9-bis 락 8.**
2. **Start evidence**: `status=done` 단독은 **완료 후보 승격**에도 충분하지 않다. `sawWorking=true`
   또는 구현 시 R에서 동등하다고 명시 승인한 제출-성사 증거가 없으면 `completion_without_start`로
   fail-visible 처리한다. (P1은 현행 센서로 확정 불가이므로 — 결합 규칙 1 — 이 게이트는
   authoritative가 아니라 **오탐 억제 게이트**다.)
   → **정본은 §9-bis 락 10.** 이 항목은 요약이며, 문구가 갈리면 락 10을 따른다.
3. **Activity fence**: agentKind별 active indicator가 남아 있으면 completion을 유예한다.
   - 공통/Grok: `N command(s) still running`
   - Codex: tail의 live `Working (<duration> …)`
   - Claude: 현행 status/hookHint와 실측 live indicator
   패턴은 tail·line anchor·TUI chrome 음성 케이스를 갖고, prompt echo 전체 검색은 금지한다.
   → **정본은 §9-bis 락 10.**
4. **Result 발행 (완료 후보)**: 위 게이트를 통과한 scrape로 v1 result를 만들되, **status는 언제나
   `needs_verification` 계열이다** — 즉 `status="failed"` + `reason="needs_verification"`으로
   싣는다(card contract v1 유지, board = `blocked` = 타워 검증 요청). `sendResult()`의 ACK가
   **strict 판정**(`status ∈ {queued, delivered}` ∧ `recipientCount=1`)을 통과하면
   `result_relay_accepted`이며, 이는 **완료가 아니라 검증 요청이 relay에 수락됐다**는 뜻이다.
   그다음 phase는 `awaiting_human_verification`이다.
   → **strict ACK 판정과 `send_unknown` 메커니즘의 정본은 §9-bis 락 5.**
5. **Cleanup**: **동일 generation의 lifecycle이 `result_relay_accepted → (사람 확정 + tower receipt)
   → cleanup_requested`를 먼저 완료한 경우에만** 뒤따르는 code 129/SIGKILL/`pane.closed`를
   `terminal_expected`로 분류하고 추가 result를 보내지 않는다. 그 밖의 모든 terminal은 uncommitted
   후보다(락 1). **ACK 수신만으로 `cleanup_requested`에 진입하지 않는다((C) 전환).**
6. **Uncommitted terminal**: `result_sending`에 **진입한 적 없는** flight의 uncommitted terminal은
   result를 **로컬 발행 1회**(local single-issue) 보낸다.
   - `status="failed"`
   - `reason="pane_terminated_before_commit"`
   - `note`에 `phase`, 관측 source(`pane.closed|pane.exited|reconcile`), final-output evidence 유무를
     500자 안에서 기록
   타워 board는 `blocked`가 된다. 사람은 diff/test/artifact를 검증해 done 또는 재작업을 결정한다.

   `result_sending`에 **진입한 후**의 terminal은 여기서 발행하지 않는다. `terminalPending`으로
   latch만 하고 ACK 판정이 다음 3분기로 종결한다(락 5).

   | 조건 | 전이 | result |
   |---|---|---|
   | strict ACK 성공(`status ∈ {queued, delivered}` ∧ `recipientCount=1`) | `result_relay_accepted` → `awaiting_human_verification` → (사람 확정 + receipt) → `cleanup_requested` → `terminal_expected` | 추가 발행 **없음** |
   | 명시적 거부 | 단일 소유자가 `failed`로 종결 | failed 1회 |
   | transport error / ACK 유실 | **`send_unknown`** | **두 번째 result 금지 · cleanup 금지** |

   "로컬 발행 1회"는 **이 브릿지가 같은 lifecycle에 대해 result를 두 번 만들지 않는다**는 뜻이며,
   **wire exactly-once 주장이 아니다**(락 9).
7. **Unknown pane event**: registry에 없는 terminal event는 최소 structured log/counter를 남긴다.
   오래된 tombstone과도 안 맞을 때만 `unbound_terminal`이다. 이 로그가 있어야 다음 실측에서 실제
   binding 유실을 증명할 수 있다.
8. **status event는 advisory다.** `pane.agent_status_changed`는 단독으로 완료 근거가 될 수 없다.
   **완료 후보 승격**은 **start evidence + activity fence(락 10)** 와 **result 발행(락 5)** 를
   함께 만족해야 성립하며, 그 종착지도 `done`이 아니라 `needs_verification`이다(§6.0).
   *근거:* herdr v0.7.4 실측 — 신규 구독자에게 status replay 없음(§9-8). **계약이 아니므로**
   상위 버전에서 달라질 수 있고, **본 설계의 안전성은 이 사실에 의존하지 않는다.** 따라서 이
   항목은 §9-bis 락으로 올리지 않는다.

### 6.3 오늘 세 케이스 대조

| 케이스 | 관측 | 초안 판정 | 왜 맞는가 |
|---|---|---|---|
| **A — SIGHUP, 산출물 정상** | pane.close 뒤 exit 129; 결과/marker 회수 시점은 로그 불충분 | 동일 generation이 `result_relay_accepted → (사람 확정 + receipt) → cleanup_requested`를 먼저 완료했으면 `terminal_expected`(추가 발행 없음). `result_sending` 미진입이면 `failed/pane_terminated_before_commit` → board blocked. `result_sending` 진입 후면 `terminalPending` latch 뒤 ACK 3분기 — 명시적 거부는 failed 1회, transport error/ACK 유실은 `send_unknown`(두 번째 result·cleanup 금지) | SIGHUP 자체를 실패 의미로 쓰지 않으며, 정상 산출물을 자동 폐기하지도 않음. 커밋 여부가 불명일 때 실패로 단정하지도 않음 |
| **C — SIGKILL, 산출물 정상** | pane.close 뒤 Killed:9; 아키텍트가 diff/test로 사후 확인 | A와 동일(3분기 전부 승계) | SIGKILL도 bridge cleanup escalation일 수 있음(215 실증) |
| **213 — exit 0, 미착수 초기 TUI** | spawn 6초, `sawWorking` 근거 없음, 초기 화면 scrape, close가 exit보다 먼저 | `completion_without_start`; 완료 후보 승격 금지. cleanup 요청 전이면 blocked | exit 0과 “작업 완료”를 분리하고 초기 TUI false done 차단 |

이 표의 A/C는 일부러 “자동 done”으로 단정하지 않는다. 오늘 아키텍트의 품질 판정을 일반화하면
다음에는 prompt echo나 반제품을 성공으로 승인한다. **(C) 전환 후의 정확한 기계 분류는
`needs_verification`(검증 요청 발행 성공) · `uncommitted terminal` · `send_unknown`(전송 여부 미상
— 추가 발행도 cleanup도 금지) · `presence_unknown`(구성한 적 없음 — 늦은 단일 발행 허용)의 4분류**
이며, **`committed success`라는 기계 분류는 더 이상 존재하지 않는다.** board `blocked`는 실패
확정이 아니라 타워 검증 요청 상태이고, `done`은 사람이 워킹트리 검증 뒤 붙인다.

### 6.4 still-running 0.23.7과의 결합

현행 deferral ownership(`flight.stillRunningDeferral`)은 유지하되 terminal fence가 더 높은 우선순위다.

```text
completion-class status
  → terminal already observed? yes: no result_sending
  → sawWorking/start evidence? no: fail-visible
  → active indicator? yes: existing deferral poll
  → scrape stable: result_sending (needs_verification 후보)
```

- terminal event가 deferral 중 오면 timer를 취소한다. 이후 처리는 **`result_sending` 진입 여부로
  분기**한다(§6.2 규칙 6):
  - **미진입**(deferral은 정의상 `result_sending` 이전이므로 통상 이쪽) — uncommitted terminal로
    failed를 **로컬 발행 1회** 하고 끝낸다(현행 `still-running.test.ts` ⑦의 확장).
  - **진입 후**(deferral 취소와 `result_sending` CAS가 경합해 순서가 뒤집힌 경우) — 발행하지 않고
    `terminalPending`으로 latch만 한 뒤 ACK 3분기(strict ACK 성공 / 명시적 거부 / transport
    error·ACK 유실 → `send_unknown`)에 판정을 맡긴다.
- Codex `Working (…)`는 기존 패턴에 추가한다. death sensor가 이 유예를 대체하지 않는다.
- deferral 5분 상한에서 indicator가 여전히 live이면 현행처럼 `done`을 내는 정책은 **(C) 전환으로
  자동 소멸한다** — 브릿지는 어떤 경로로도 `done`을 내지 않는다. 상한 소진은 `needs_verification`
  발행 사유가 되며, 상한값 자체는 **정확성 근거가 아니라 운영 튜닝 파라미터**다(§6.6).

### 6.5 M-1·L-2·CONV_SPEC·원격 노드 정합

- **M-1**: dispatch allowlist/claim 순서는 건드리지 않는다. terminal event는 로컬 herdr socket에서
  오지만, 그것만으로 done을 만들지 않으므로 권한 확대가 없다.
- **L-2**: result `node`와 board assignee 대조를 그대로 둔다. terminal failure도 동일 v1 result를
  쓰므로 우회하지 않는다.
- **card-contract v1**: `status=failed`, optional `reason`/`note`가 이미 있다. 새 필수 필드나 version
  bump 불필요. `needs_verification`도 `status="failed"` + `reason="needs_verification"`으로 실어
  **wire 표면을 넓히지 않는다.** body가 `[DONE]/intent: card.done`인 것은 “result envelope 도착”
  의미로 유지하되, board 의미는 payload status가 정본이다 — (C) 전환 후 브릿지가 보내는 result의
  status는 **전부 `failed` 계열**이므로 이 헤더를 완료 신호로 읽으면 안 된다.
- **CONV_SPEC**: conv pane terminal은 기존처럼 `blocked` turn을 보내고 타워가 결정한다(§1.3-1.4,
  §3.4). worker가 terminal event로 일방 `done_proposal`/close하지 않는다.
- **WSL/VPS**: 판단 입력은 bridge와 같은 노드의 herdr socket event·snapshot·result ACK뿐이다.
  macOS PID/launchd/log path에 기대지 않는다. signal 이름은 observability일 뿐 권위가 아니다.

### 6.6 미실측 상수의 지위 (E5)

**타임아웃·재시도 횟수·grace·poll 간격은 정확성(correctness) 근거가 아니다. 운영 튜닝
파라미터일 뿐이다.**

- 이 상수들이 유발할 수 있는 행동은 **가역 행동뿐**이다 — 알림, 재평가 트리거, poll 가속.
- **result 확정 · board 확정 · `pane.close` · dispose · 비멱등 재발행은 상수 만료로 유발되지
  않는다.**
- **cadence 실측을 correctness 선결조건으로 삼지 않는다.** 실측은 **분포**를 줄 뿐 **상한**을
  주지 않는다 — 느린 것과 죽은 것을 원격에서 구별할 수 없다는 것은 분산시스템의 고전적 한계이지
  측정 부족이 아니다.

따라서 §9-bis 락 8의 cadence 표(초기 +1s · poll 5s · grace 3s · 연속 2회 · 최대 12회)와 락 7의
TTL 60s는 **삭제하지 않되 지위를 낮춰** 읽는다:

> 이 수치들은 **알림·재평가 전용 운영 기본값**이다. 값이 틀리면 알림이 이르거나 늦을 뿐,
> 카드가 잘못 확정되거나 pane이 잘못 닫히지 않는다.

**`present` 응답은 시도 카운터를 리셋한다.** 성공적 `pane.list` present를 받으면 absent strike는
물론 **episode 시도 카운터(최대 12회)도 0으로 되돌린다.** 그렇지 않으면 살아서 응답 중인 pane이
episode 상한만으로 `presence_unknown`에 빠진다.
*(3차 검증 High-2 — 카운터 리셋 누락은 아키텍트 산출물 결함이었다. §6.0 주의 참조.)*

### 6.7 result 발행 단일 소유권 + 전달 추적 (E6)

**아키텍트가 워킹트리에서 축자 확인한 코드 결함**을 설계에 명기하고 요구사항으로 올린다.
**좌표 재실측 2026-07-21** — 구 표의 `:2123`·`:2355`는 **둘 다 스테일**이었고, 그중 1행은
`2ca6748`에서 이미 해소됐다. 아래가 실측 정본이다.

| 좌표 | 현행 코드 | 상태 |
|---|---|---|
| `bridge-runtime.ts:2160` | `void sendFailedResult({...})` (`pane_closed` 분기) | **미해소** — fire-and-forget |
| `bridge-runtime.ts:2207` · `:2222` | `void finishCard(flight, "failed", …)` | **미해소 · 신규 발견** — 동형 결함 2건. `:2160`만 고치면 반쪽이 된다 |
| `bridge-runtime.ts:2349` (`finishCard` 말미) | `const sent = await sendResult(…)` | **부분 해소** — `sent`가 `pane.close` 게이팅에만 쓰이고, `sent === false`에서 `recordResultDeliveryUnconfirmed()`를 **호출하지 않는다**(대칭 위치 `sendFailedResult:2391`은 호출). **성공 경로의 전달 실패가 관측에서 빠져 있다** |
| `sendResult:2423` | `await client.handoff({…})` | **미해소** — 반환 봉투(`status` `recipientCount` `handoffId` `notified` `message`)를 **전량 폐기**하고 `boolean`으로 뭉갠다. 락 5의 strict 판정 입력이 바로 이 필드들이다. 동일 폐기가 conv 경로 `:1300` `:1319` `:1777`에도 존재 |

→ **발행 경로는 함수 기준 2개(`sendFailedResult`·`finishCard`)이나 호출지점 기준 18개**
(`sendFailedResult` 7 — `:850 :1114 :1204 :1245 :1270 :1910 :2160` · `finishCard` 11 —
`:2009 :2014 :2030 :2035 :2087 :2107 :2113 :2130 :2136 :2207 :2222`)로 흩어져 있다.
단일 소유권 기제는 현재 **`flights` 맵 삭제 하나뿐**이다.
*(좌표 재실측 2026-07-21 evidence-r43b — 구 표의 "17개(7·10)"는 `finishCard` 1건 누락이었다.)*

**이 결함은 자동 `done`을 폐지해도 그대로 남는다.** `done` 대신 `needs_verification`을 보내더라도
그것이 도착했는지 모르는 것은 똑같기 때문이다. (C) 전환은 **거짓 성공**을 없앨 뿐 **유실**을
없애지 않는다.

**요구사항 (R43b 개정 — 결정 ①③⑧⑨):**

1. **단일 소유자**가 카드 result를 **멱등하게** 발행한다. 이 소유자는 **dispatch-scoped result
   issuer**다 — handoff **수신 시점**(파싱·spawn 이전)에 `(cardId, dispatchHandoffId)` 키로
   생성되며, **모든 카드 result 발행(성공·실패·Flight-less 3경로 포함)이 통과하는 유일 지점**이다
   (§6.7.2 · §6.7-bis 결정 2 · 락 5).
2. **ACK를 추적**한다 — 반환값을 버리지 않고 strict 판정에 넣는다(락 5).
3. unknown 상태(`send_unknown`/`presence_unknown`) **진입 시점**에 **durable quarantine 레코드**를
   낸다 — 이것이 곧 durable alert다. 둘은 **동일 레코드 1건**이며 이중 기록을 금지한다. 매체·규약은
   **§6.7.1**. *(진입 시점 기록인 이유: 만료 시점 외부화는 진입~만료 10분 창의 브릿지 크래시에서
   레코드가 전멸한다 — 현행 대칭 위치가 모듈 `let` + `console.error`뿐이라는 실측이 근거 · 결정 ⑨.)*
4. **자동 reconcile 회수는 이번 PATCH 범위 밖이다**(§6.7 요구 4는 별도 PATCH — 결정 ⑧). 이 PATCH는
   유실·고아를 **관측 가능·회복 가능**하게 만들 뿐, **자동 회수는 하지 않는다.**

**tower currency 게이트(§6.7.3)**는 발행 표면이 아니라 tower-local 적용 판정이므로 **이번 PATCH
범위에 편입**한다(락 9 범위 개정 — 결정 ③).

**왜 durable quarantine이 필수인가:** 알림이 유실되거나 지연되면 카드는 계속 `doing`으로 남는다.
사람이 확정해야 done이 되는 설계에서, 사람에게 도달하지 않는 알림은 **카드를 영구히 멈춘다.**
따라서 **durable quarantine + ACK 추적이 없으면 (C) 전환의 liveness는 무해해지지 않는다.**

### 6.7.1 durable quarantine 레코드 — 매체·규약 (결정 ① · R43 H6 해소)

**진입 시점 기록.** unknown 상태 진입(`send_unknown`/`presence_unknown`)과 **동시에** durable
레코드를 남긴다. **만료 시점 외부화가 아니다** — 진입~만료 10분 창에서 브릿지가 크래시하면 만료
시점 기록은 전멸한다. 현행 대칭 위치 `recordResultDeliveryUnconfirmed`(`bridge-runtime.ts:490`
모듈 `let` 카운터 · `:506-522` `log()`=`console.error`)는 프로세스 종료 시 전량 소실되므로
**요구 3을 충족하지 못한다 — 재사용 금지**(결정 ⑨).

**매체 = 브릿지-로컬 append-only JSONL** (프로필 스코프 경로, 예 `~/.loom/bridge/<profile>-quarantine.jsonl`
— 구현이 경로를 정하되 프로필 스코프 필수).

**매체 선정 근거:** board는 tower-local이라 브릿지가 못 쓰고, tower 통지는 **의심 대상 채널 그
자체**다(전달 미상이 곧 이 상태의 정의). 의심 채널에 의존하지 않는 crash-durable 매체는
**브릿지-로컬 디스크뿐**이다.

- **레코드 내용 = 메타데이터만 · 판별 유니언(R43c — codex M-new-2 수용):** 공통 필드는
  `cardId · dispatchHandoffId · 상태 · 시각 · 사유 · 카운터`이고, **키 필드는 상태로 판별**한다 —
  `send_unknown`은 `seq`를 **필수**로 싣고(payload 각인 튜플과 동일), `presence_unknown`은 result
  payload를 구성한 적이 없어 `seq`가 없으므로 `seq` 대신 **`"presence"` 태그**를 싣는다(무태그
  `seq` 필드로 두 상태를 뭉개지 않는다). 워커 산출물 본문 금지(0.26.0 D6 계측 레코드 규약과 동형 —
  본문성 §5.1 · 간접 프롬프트 주입 표면 차단).
- **dedup 키 = 태그드(R43b-2차 — codex M-new-1 · claude M-new-1 수용):** `send_unknown`은
  `(cardId, dispatchHandoffId, seq)`(payload 각인 튜플과 동일 — 결정 2). **`presence_unknown`은 result
  payload를 구성한 적이 없어 seq가 없으므로 `(cardId, dispatchHandoffId, "presence")`** 태그드 키를 쓴다.
  seq는 §6.0.2가 허용하는 늦은 단일 발행을 **실제로 구성할 때** 비로소 채번된다(issuer 구성-시점 채번
  규약 — §6.7.2). 두 상태를 seq 유무로 뭉개지 않는다.
- **파일 모드 = `0600`**(loomDir 0600 소켓 선례와 동형 — 산출물 본문은 없으나 운영 메타데이터라 사용자
  스코프 고정).
- **flush = 레코드당 append 후 즉시 `fsync`(또는 `fdatasync`)** (R43b-2차 — codex M-new-2 · H6 partial ·
  claude L-new-1 수용). 버퍼드 append만으로는 레코드가 crash-durable해지기 전에 quarantine 진입이
  관측될 수 있다 — 진입 시점 기록의 존재 이유가 무너진다.
- **기동 replay + malformed tail 관용:** 브릿지 기동 시 JSONL을 replay해 미해소 카운트를 복원한다.
  마지막 레코드가 잘린(torn) 경우 **그 줄만 버리지 않고 카운트 + 로그**하고 나머지는 정상 복원한다
  (조용한 유실 금지).
- **운영자 ack = append-only 레코드:** ack는 원본 레코드를 수정하지 않고 **ack 레코드를 덧붙여
  fold**한다(원본 불변 · append-only 불변식 유지).
- **자동 해소(c)도 append-only fold (R43c — codex M-new-2 수용):** `presence_unknown`의 늦은 단일
  발행이 `relay_accepted`로 종결돼 자동 해소될 때도 원본 레코드를 수정하지 않고 **자동-해소 레코드를
  덧붙여 fold**한다(운영자 ack 레코드와 동형 — append-only 불변식 유지). 자동 해소를 in-place 수정으로
  표현하지 않는다.
- **append/fsync 실패는 fail-visible:** 디스크 IO 오류로 append나 fsync가 실패하면 **console + counter로
  표면화**한다 — 이 매체가 유일 잔여 수단이므로 조용한 유실을 금지한다(L-new-1). **compaction·보존 상한은
  운영 후속**으로 남긴다(이번 PATCH는 append + ack fold까지).
- **보존 = 운영자 ack까지.**
- **표면화:** 브릿지 상태 표면(`loom bridge status`·doctor 등)이 **미해소 quarantine 카운트를
  표시**한다(조용한 축적 금지 · 기동 replay 복원분 포함).

**해제:** in-memory unknown 레코드의 해제는 (a) **운영자 ack** · (b) **프로세스 종료**(로그 필수) ·
**(c) `presence_unknown`의 늦은 단일 발행이 `relay_accepted`로 종결될 때**(R43b-2차 — claude M-new-1
수용)뿐이다. (c)는 §6.0.2가 명시한 `presence_unknown`의 안전한 자동 출구("한 번도 보낸 적이 없으므로
늦은 단일 result가 local single-issue를 깨지 않는다")와 정합하며, 이 자동 출구가 발화하면 in-memory
레코드와 그 태그드 quarantine 레코드가 함께 해소된다 — **`send_unknown`에는 (c)가 적용되지 않는다**
(전송을 이미 시도했으므로 멱등성 없이 재발행 금지).

**presence→send 전이 시 supersede (R43c — claude Low-1 수용).** `presence_unknown`의 늦은 발행이
`relay_accepted`가 아니라 **실제 send 시도로 전이하면**(그래서 issuer가 seq를 채번하면) 그 카드는 더
이상 presence 소진 상태가 아니다 — 기존 `"presence"` 태그 레코드는 새로 채번된
`(cardId, dispatchHandoffId, seq)` 레코드로 **supersede**되며(append-only 자동-해소 레코드로 fold),
이후 그 send 시도가 `send_unknown`으로 끝나도 (c) 자동 해제는 적용되지 않는다(전송을 시도했으므로).
한 카드에 `"presence"` 태그 레코드와 `seq` 레코드가 **동시에 미해소로 잔존하지 않는다.**

**해소 순서 확정 (R43d — codex M-new-1 수용).** 수락된 늦은 발행은 **예외 없이 먼저 send로 시도된 것**이므로
supersede와 (c) 자동 해소는 겹치지 않고 **순차 적용**된다. **① supersede가 선행한다** — `presence_unknown`의
늦은 단일 발행이 issuer 구성-시점 채번으로 seq를 얻는 순간 `"presence"` 태그 레코드는 append-only 자동-해소
fold로 `(cardId, dispatchHandoffId, seq)` 레코드에 흡수되어 **즉시 해소**된다(이 시점부터 presence 레코드는
미해소가 아니다). **② 그 seq 레코드가 뒤이어 `relay_accepted`로 종결되면** (c)는 이제 presence 레코드가
아니라 **그 seq 레코드**를 append-only fold로 해소한다. 따라서 성공한 늦은 발행은 presence·seq 어느
레코드도 미해소로 남기지 않아 **거짓 미해소 quarantine 항목이 잔존하지 않는다.** 그 send가 `send_unknown`으로
끝나면 seq 레코드만 미해소로 남고 (c)는 적용되지 않는다(전송을 시도했으므로 — 운영자 ack·프로세스 종료에서만
해제). 즉 위 (c) 조항의 "함께 해소"는 **presence 레코드는 supersede fold·seq 레코드는 `relay_accepted`
fold**의 순차로 읽으며, (c)의 종결 대상은 supersede 이후의 seq 레코드다.

durable 레코드가 진입 시점부터 존재하므로 in-memory 해제는 **정보 파괴가 아니다.** **타이머 유발 dispose는 금지** — 10분 타이머는 **재알림(re-escalate)만**
유발한다(가역 행동, 불변식 정합). *(자동 reconcile 회수는 여전히 범위 밖 — §6.7 요구 4 · 결정 ⑧.)*

### 6.7.2 dispatch-scoped result issuer (결정 ③ · R43 H4 중앙화)

**전제 교정 2건(R43):**

- **(P) Flight 보편성 반증** — `sendFailedResult` 호출자 7곳 중 **3곳에 Flight가 없다**:
  `:850`(payload_invalid) · `:1114`(agent_kind_not_allowed) · `:1204`(herdr_spawn_failed).
  `sendFailedResult(opts)`는 Flight를 인자로 받지 않는다(`:2364-2371`). 따라서 §6.7-bis 결정 2의
  "seq는 Flight에 산다"는 소유 주체가 이 3경로에서 **성립하지 않는다.**
- **(Q) `cardSeq`의 성질** — 전역 `cardSeq`(`:575`)는 result 시퀀스가 아니라 **per-card dispatch
  attempt 카운터**다(`:1124-1127` 주석 "Fix 2 (live-measured)"). 소비처 **4곳** = hook 소켓 경로
  (`:1141`) · herdr agent name 유일성(`:1192`) · `Flight.seq`(`:1220`) · `sendFailedResult` 채번
  (`:2372-2373`). **삭제하면 agent name·소켓 경로 충돌 = live-measured 수정의 회귀** → **삭제 요구를
  제거하고 유지한다.**

**issuer 신설.** handoff **수신 시점**(파싱·spawn 이전)에 `(cardId, dispatchHandoffId)` 키로 생성한다.

- **`:850` 특례:** cardId가 `extractCardIdLoose(att.content) ?? "task_0"`로 **열화**하므로(실측 확인),
  이 경로는 **`dispatchHandoffId` 단독 키**로 동작한다(`h.id`는 신뢰 가용). **타워측 정합 필수
  (R43b-2차 — codex H-new-3 ≡ claude H-new-1 수용):** 이 열화 cardId(`"task_0"`)는 `applyCardResult`의
  `findTask(payload.cardId)`를 통과하지 못하므로, §6.7.3의 **`dispatchHandoffId` 스캔 폴백**이 없으면
  "유일 통과점"이 **발행측에서만** 성립하고 타워측에서 카드가 조용히 strand된다. 그 폴백은 §6.7.3에
  규정한다.
- **모든 카드 result 발행(성공·실패·Flight-less 3경로 포함)이 이 issuer를 유일 통과점**으로 삼는다
  (H4의 중앙화 요구 해소).
- **seq는 issuer가 소유한다**(Flight 아님). result payload를 **새로 구성할 때 1회 증가**하고
  **재전송은 같은 seq 재사용**(§6.7-bis 결정 2의 채번 규약 유지 — **소유 주체만 Flight→issuer로
  개정**). `sendFailedResult`의 `cardSeq` 채번(`:2372-2373`)은 issuer 채번으로 대체된다 — cardSeq는
  **attempt축 소비 3곳(`:1141 :1192 :1220`)만 남긴 채 유지**한다.

**issuer acquisition = 보편 발행 권위 (R43b-2차 — codex H-new-2 수용).** 락 5 본문 *"오직
`completion_candidate → result_sending` CAS 승자만 `sendResult`를 호출한다"*는 **Flight-backed 완료
경로 한정**이다. Flight-less 3경로(`:850 :1114 :1204`)는 Flight도 `completion_candidate`도 없어 이
lifecycle CAS 승자를 만들 수 없다. 보편 규약은 **issuer의 원자적 `acquire(logicalKind)`가 유일한 send
권위**라는 것이다: Flight-backed 완료 result는 lifecycle CAS **그리고** issuer 채번을 **모두** 통과하고,
pre-Flight 실패 result는 **issuer acquire 단독**으로 발행 권위를 얻는다. 이로써 락 5의 sole-owner 규칙이
세 경로 모두에서 성립한다 — lifecycle CAS는 Flight-backed 완료의 부작용 소유권 장치로 유지되고, issuer
acquisition이 그 위·아래를 모두 덮는 상위 권위다(§9-bis 락 5 R43b-2 각주와 동일 규정).

**issuer의 유한 전이 집합** (작은 닫힌 집합 — 표로 문서화).

**시대 매개변수화 (R43c — codex H-new-1 ≡ claude Medium-1 수용).** 아래 전이 **구조**(issuer 소유·
채번 · strict ACK 3분기 · `send_unknown` 흡수 · quarantine)는 **시대 무관 동일**하다. 시대에 따라
달라지는 것은 **`initial` 성공형 result의 status 단 하나**다:

- **[v0.27.0 / pre-C]** 성공형 `initial`의 status는 **`done`**이다(현행 스키마 `done`/`failed`,
  `card-contract.ts:33` — **wire·스키마 무변경**). pre-C에는 `needs_verification`이 스키마에 없으므로
  **"명시적 거부(`needs_verification` 거절) → `rejection_escalation`" 전이는 트리거 자체가 없다**
  (거절될 대상이 존재하지 않는다) — 그 행은 **(C) 본체에서만 live**한 dormant 행이다.
- **[(C) 본체]** 성공형 `initial`의 status는 **`needs_verification`**(= `status="failed"` +
  `reason="needs_verification"` 인코딩 — §10 기존 규정, **신규 스키마 값 아님**)이고, 타워가 이를
  거절하면 `rejection_escalation`으로 이어진다.

이 매개변수화로, D4의 "`needs_verification` → `failed` → 흡수"·락 5 각주의 "status는
`needs_verification`"·§7.1-0의 "done 0건"은 **모두 [(C) 본체] 행의 서술**이며, v0.27.0(pre-C)에서
live한 것은 성공형 `initial=done`·failed형 직행·`send_unknown` 흡수뿐임을 명시한다.

**`logicalKind` 축 (R43b-2차 — codex M-new-3 수용):** 한 dispatch의 논리 result는 **`initial` 1건 +
`rejection_escalation` 최대 1건**뿐이며, 각각 정확히 **1회 발행**된다(락 9 local single-issue와 정합 —
"같은 lifecycle에 대해 result를 두 번 만들지 않는다"의 "두 번"은 같은 `logicalKind`의 재구성을 가리킨다).
전이는 `logicalKind` **와** `initial`의 **성공형/failed형**(resultKind) **둘 다**로 결정된다 —
`logicalKind` 단독으로는 성공형/failed형을 가르지 못한다(R43c — codex M-new-3).

| logicalKind · resultKind | 현 상태 | 이벤트 | 다음 |
|---|---|---|---|
| `initial`(성공형) — status = `done` [v0.27.0] / `needs_verification` [(C) 본체] | 구성 | send → strict ACK 3분기(락 5) | `relay_accepted`(종결) · **명시적 거부 → rejection 행 [(C) 본체만]** · `send_unknown`(흡수 · 종결) |
| `initial`(failed형 — Flight-less 3경로 `:850 :1114 :1204`) | 구성 | send → strict ACK | `relay_accepted`(종결) · **그 외 모든 비수락 ACK → `send_unknown` 직행**(escalation 엣지 없음 · 종결) |
| `initial` → `rejection_escalation` **[(C) 본체만]** | 명시적 거부(`needs_verification` 거절) | `rejection_escalation` 재구성 **1회** | ↓ |
| `rejection_escalation` **[(C) 본체만]** | failed send | strict ACK | `relay_accepted`(종결) · `send_unknown`(흡수 · 종결) |
| (양쪽) | transport/ACK 유실 | — | `send_unknown`(흡수 — 종결) |

**전이표 1행 분할 근거 (R43c — codex M-new-3 수용).** 구 1행은 성공형과 failed형을 겸해, "명시적 거부
→ rejection_escalation" 엣지가 failed형에도 매치되는 것처럼 읽혀 아래 pre-Flight 직행 서술과 충돌했다
(문단만 있고 표가 안 갈랐던 결함). **성공형만** rejection 엣지를 갖고, **failed형은 모든 비수락 ACK가
escalation 없이 `send_unknown` 직행**이다 — 표를 문단과 일치시킨다.

**pre-Flight `initial failed` 직행 (codex M-new-3 수용):** `:850 :1114 :1204`의 Flight-less 3경로가 내는
result는 `logicalKind=initial`이고 **처음부터 `status=failed`**다(시대 무관). 이 경로는 **"명시적 거부 →
`rejection_escalation` 재구성" 행을 거치지 않고** 직행으로 send → `{relay_accepted · send_unknown}`으로
종결한다 — 중복된 두 번째 failed를 만들지 않는다(초기 failed가 곧 그 dispatch의 유일 result).

재귀 깊이는 **[(C) 본체]**에서 구조적으로 **2**에서 끝나고(`needs_verification` → `failed` → 흡수),
**[v0.27.0]**에서는 성공형 `initial`이 `done`이라 거절 대상이 없어 깊이 **1**이다. ACK 판정은 send
단위이고 send 횟수가 유한하다. (C) 본체의 12원소 phase registry·lifecycle generation은 이번 범위가
아니다(락 11~13 유지).

### 6.7.3 tower currency 게이트 (결정 ③ · 락 9 범위 편입 · R43 H3 해소)

**전제(실측):** tower dedup(`card-ops.ts:190-197`)은 스칼라 `payload.seq <= last` 단일 비교이고
`dispatchHandoffId`를 **안 본다**. `last_seq`는 board JSON에 **디스크 영속**(notes → `writeAtomicJson`,
매 적용 시 fresh read)인 반면 브릿지 `cardSeq`/issuer seq는 **in-memory 휘발**이다. **단, board 재dispatch는
`dispatchCard`(`card-ops.ts:112-117`)가 `notes`를 `dispatched node=…`로 통째로 덮어써 `last_seq=` 토큰을
제거하므로**(R43b-2차 실측 확인 — claude L-new-3) 재dispatch 후 새 attempt의 seq는 **스칼라 게이트에
걸리지 않는다**(비교할 last_seq가 없다). 순수 "브릿지 재시작 후 재전송" 경로는 active binding 복원이
§9-6에서 **out-of-scope**라 애초에 발생하지 않는다. 따라서 currency 게이트의 load-bearing 동기는 "브릿지
재시작 seq 리셋"이 **아니라** 아래 **stale-attempt 늦은 result 거부**다: 순수 튜플 dedup으로 전환하면
서로 다른 attempt의 seq가 독립 네임스페이스가 되어, 현행 스칼라가 attempt-교차 단조성으로 우연히 막던
**옛 attempt의 늦은 result가 최신 상태를 덮는 것**이 새로 열린다 — 그래서 게이트가 필요하다.

**tower는 이미 `dispatchHandoffId`를 안다.** `dispatchCard`(`card-ops.ts:112-116`)가 `task.handoffId`로
디스크 영속하고 재dispatch마다 갱신한다. relay가 서버 생성 단일 id(`room.ts:442` `generateHandoffId()`)를
발신 ack·수신 inbox 양쪽에 동일 탑재 → `ack.handoffId` = 브릿지 `h.id` = `flight.dispatchHandoffId`
= `payload.dispatchHandoffId` **완전 동일 체인**. `applyCardResult`가 이미 `findTask`로 태스크를
로드하므로 **비교할 두 값이 같은 함수 스코프에 존재 — 새 저장소·전송 불요, 배선만 없다.**

**태스크 해석 폴백 (R43b-2차 — codex H-new-3 ≡ claude H-new-1 수용) — 게이트보다 먼저 실행한다.**
`applyCardResult`는 현재 `findTask(payload.cardId)`를 먼저 부르는데, `:850` 경로의 열화 cardId(`"task_0"`)나
그 밖의 miss는 여기서 `task not found`로 **게이트 도달 전 조용히 종결**된다 — §6.7.2가 issuer를 "유일
통과점"으로 세워도 타워측에서 카드가 strand된다. 따라서:

- `findTask(payload.cardId)` **miss**(또는 cardId가 `"task_0"` 등 열화값) → **`task.handoffId ===
  payload.dispatchHandoffId` 스캔 폴백**으로 태스크를 해석한다(`dispatchHandoffId`는 relay 서버 생성 단일
  id라 위조 불가 · 보드 영속이라 유일 — 위 전제).
- 해석 성공 시 payload의 cardId를 **해석된 태스크와 교차 검증**한다: 열화값이 아니면서 태스크 cardId와
  불일치하면 **drop + 관측 로그**(조용한 삼킴 금지 — 늦은 stale이나 위조 후보).
- **스캔 폴백 miss → `handoff_unmapped_or_stale` 관측 레코드 (R43c — codex L-new-1 수용).** 스캔이
  매칭 태스크를 못 찾으면(열화 `:850` result의 stale은 재dispatch가 `dispatchHandoffId`를 덮어
  여기로 걸러진다) 기존대로 종결하되 **`handoff_unmapped_or_stale` 관측 카운터**에 남긴다(조용한 폐기
  금지). 이것이 열화 stale이 걸러지는 실제 경로이며, "stale drop 게이트에 도달한다"가 **아니다**(아래
  게이트 도달성 참조).
- **중복 handoffId 매치 (비정상) → fail-visible drop (R43c — codex UNVERIFIED 말미 수용).** 스캔이
  같은 `dispatchHandoffId`에 **2개 이상**의 태스크를 매치하면(보드는 ≤200 유한이라 정상 상태에서
  발생 불가) 어느 태스크에도 적용하지 않고 **관측 레코드만 남긴다**(fail-visible drop — `applyCardResult`
  이 어느 후보에도 커밋하지 않는다).

이로써 §6.7.2의 "유일 통과점" 주장이 발행측(issuer)과 타워측(`applyCardResult`) **양쪽에서** 성립한다.
D6 완료 판정에 이 폴백 테스트를 추가한다(PLAN D7 ⑨ — tower currency 게이트 테스트에 편입).

**게이트(같은 PATCH) — 폴백 성공/일반 경로의 도달성 명시 (R43c — codex L-new-1 · claude Low-3 수용):**

- **폴백으로 해석된 태스크**는 정의상 `task.handoffId === payload.dispatchHandoffId`이므로(스캔 조건이
  곧 그 등식) **직후 불일치 게이트는 구성상 항등이라 도달 불가**다 → 폴백 성공은 **곧바로 per-dispatch
  `seq` dedup으로 직행**한다. 열화 `:850` result의 stale은 이 게이트가 아니라 위의 **폴백 scan-miss**
  (`handoff_unmapped_or_stale`)로 걸러진다. 따라서 "열화 stale이 stale-drop 게이트에 도달한다"는 서술은
  폴백 경로엔 성립하지 않는다(codex L-new-1 정정).
- **일반 경로(`findTask(payload.cardId)` 히트)만** 불일치 게이트에 도달한다: `payload.dispatchHandoffId`
  존재 ∧ `task.handoffId`(영속본)와 **불일치** → **stale attempt의 늦은 result로 drop**(관측 로그 +
  counter — 조용한 삼킴 금지) · 일치 → per-dispatch `seq` dedup.
- **필드 부재 → 현행 스칼라 폴백**(하위 호환 — `dispatchHandoffId`는 스키마 optional
  `card-contract.ts:42-45`, 단 브릿지 생성 result는 항상 채운다).

**근거:** (i) R43 H3 — **각인과 판정자는 분리 불가**다: 각인 대상(payload)에 이미 현행 스칼라
판정자(`card-ops.ts:190-197`, `payload.seq <= last`)가 붙어 있고, 각인은 tower inbox로 영속되므로
비가역이다 (ii) 순수 튜플 dedup은 현행 스칼라가 attempt-교차 단조성으로 우연히 막던 **stale-attempt
늦은 result 수용**을 새로 연다(fable-advisor 보정) — 그래서 currency 게이트가 **필요하다(이것이
load-bearing 근거다)** (iii) 비교 값 2개가 이미 같은 함수 스코프에 있어 새 저장소·전송 불요.
*(R43b-2차 정정 — claude L-new-3 수용: 초판은 (i)에 "issuer-local seq는 재dispatch마다 재시작해 현행
스칼라 게이트에 삼켜진다", (iv)에 "브릿지 재시작 seq 리셋 유실 해소"를 적었으나 **둘 다 실측과 어긋나
철회**한다. board 재dispatch는 `dispatchCard`(`:112-117`)가 `notes`를 덮어써 `last_seq`를 제거하므로
재dispatch 후 새 attempt의 seq는 스칼라 게이트에 **삼켜지지 않고**, 순수 "브릿지 재시작 후 재전송"은
§9-6 out-of-scope라 발생하지 않는다. currency 게이트의 참 근거는 (i)의 분리 불가성과 (ii)의
stale-attempt 거부이며, "seq 리셋 유실 해소"는 부수 이득으로 주장하지 않는다.)*

### 6.7-bis 착수 전 함정 3건 + 3차 리뷰 배관 서술 정정 (증거 팩 실측 2026-07-21)

**함정 1 — `void` → `await` 단순 승격 금지.** `:2160`을 `await`로 바꾸면 `onCardHerdrEvent`가
async가 된다. 그런데 호출자 `onHerdrEvent:1936`은 동기 `void` 함수이고 herdr 이벤트 디스패치의
핫패스다. 현행 이중 발행 방어(`flights.get(paneId) !== flight` 가드 **5곳** — `:2003 :2019 :2067
:2080 :2096`; `:2019`가 `beginCardCompletion` 본류(정상 완료 경로)의 유일 방어 · R43b 정정, 구
"4곳"은 `:2019` 누락이었다)는 **"이벤트 핸들러가 동기적으로 맵을 갱신한다"**는 가정에 기대고 있다.
이벤트 처리를 직렬화하면
그 가정이 깨져 **방어가 오히려 약화된다.** 단일 소유권은 `await` 승격이 아니라 CAS/latch로 얻어야 한다.

**함정 2 — strict ACK의 본체는 `sendResult` 시그니처 교체다.** `Promise<boolean>`을 유지하면
strict 판정이 원리적으로 불가능하다(봉투가 이미 버려진 뒤다). 바꾸면 `finishCard:2349`의
`sent &&` pane.close 게이팅과 `pane-cleanup.test.ts:245`("exactly once")·`:816`("relay down →
no pane.close")이 함께 움직인다. 이것이 이 PATCH의 진짜 blast radius다.

**함정 3 — `recipientCount=1` 조건을 실측 없이 켜지 마라.** `peer_unknown`도 정상 ACK로
반환됨이 실측 확인됐다(2026-07-21). strict 판정을 켜면 tower peer가 아직 붙지 않은 타이밍의
기존 통합 테스트가 `sent=false`로 뒤집혀 pane.close가 일어나지 않고 `:245`가 깨진다.
**relay 쪽 실제 `status`/`recipientCount` 값을 먼저 확인하는 것이 선결 조건이다.**

> **테스트 비용 경고:** `fake-herdr.ts`는 **herdr만 흉내내고 relay/ACK는 흉내내지 않는다.**
> 현행 테스트는 ACK 실패를 `relay.stop()`으로 만든다 — on/off뿐이라 `status`/`recipientCount`
> **조합**을 만들 수 없다. strict ACK를 테스트하려면 **relay 쪽 신규 주입 표면**이 필요하고,
> 이것이 이 PATCH에서 가장 과소평가되기 쉬운 비용이다.

**3차 리뷰 배관 서술 정정.** `PANEDEATH-CODEX-REVIEW3.md:43`의 트레이스 — *"`finishCard`가
result send를 await하는 동안 terminal 핸들러가 독립적으로 failed를 쏠 수 있다"* — 는
**현행 코드에서 성립하지 않는다.** 모든 완료 호출지점이 `disposeCardFlight` → `finishCard`
순이므로, `finishCard`가 await하는 동안 카드는 이미 `flights`에서 사라져 있고 이후 이벤트는
`onHerdrEvent:1936`의 맵 조회에서 걸러진다. **실제 증상은 "done + failed 2건"이 아니라
`result_sending` 중 terminal 증거의 완전 소실이다** — 이중 발행은 막았으나 그 대가로
락 5가 요구하는 `terminalPending` latch가 없어 terminal이 관측되지 않는다.
**결론(락 5 필요)은 그대로 유지되고 배관 서술만 정정된다.** 교훈 (33)의 적용례 —
검증자 지적은 결함 **존재**의 증거일 뿐 **서술**의 증거가 아니다.

**아키텍트 결정 2건 — 확정 2026-07-21** (fable-advisor 자문 + 아키텍트 채택. 자문이 두 질문의
**전제를 모두 교정**했으므로 그 교정을 먼저 적는다.)

#### 결정 1 — failed result 자체의 ACK: **strict 1회 적용 + 단일 흡수 상태** (구현 A 변형)

> **전제 교정:** "A는 무한 후퇴(ACK의 ACK) 위험"이라는 아키텍트의 반대 논거는 **성립하지 않는다.**
> `send_unknown`은 **흡수 상태**다 — failed send의 ACK가 유실되면 거기로 들어가고, 그 상태에서는
> **ACK를 요구하는 send가 더 이상 없다.** 재귀 깊이는 구조적으로 2에서 끝난다
> (`needs_verification` → `failed` → 흡수). ACK 판정은 send 단위이고 send 횟수가 유한하다.

**채택:** failed send에도 strict ACK를 **1회** 적용한다. 비수락 결과는 **유실·명시 거절을 구분하지
않고** 단일 흡수 상태 **`send_unknown`**(§6.0.2)으로 보내고 **durable alert**(§6.7 요구 3)를 낸다.

> **[시대 표기 (R43d — codex H-new-1 잔여)]** 이 결정의 전제 교정에 나오는 재귀 깊이 2
> (`needs_verification` → `failed` → 흡수)는 **[(C) 본체] 행**이다(§6.7.2 시대 매개변수화).
> **[v0.27.0 / pre-C]**에서는 성공형 `initial`이 현행 `done`을 발행해 거절 대상이 없으므로 재귀
> 깊이는 **1**이다(`initial=done` → 흡수/직행). **흡수 상태(`send_unknown`)·strict ACK 1회·진입
> 시점 durable alert 구조는 시대 무관 동일**하다 — failed send의 ACK·흡수·재알림은 pre-C에서도
> 그대로 성립한다(§6.7.2·D4 시대 표기와 동일).

> **R43b 개정 — durable alert = 진입 시점 quarantine 레코드 1건(결정 ①⑨).** 이 "durable alert"는
> **`send_unknown` 진입 시점에 기록되는 durable quarantine 레코드와 동일한 1건**이다(§6.7.1 — 이중
> 기록 금지). 매체는 **브릿지-로컬 append-only JSONL**이며, 대칭 위치 `recordResultDeliveryUnconfirmed`
> (`:490`·`:506-522`)는 **휘발이라 재사용 금지**다(R43 H6). **10분 보존 만료는 dispose가 아니라
> 재알림만 유발한다**(결정 ②로 락 8 개정 — 만료 dispose 삭제).

> **용어 정정 (아키텍트 자기 결함 · 2026-07-21).** 초판은 이 상태를 `commit_unknown`이라 적고
> "락 5의 용어이므로 자문의 `send_unknown`을 기각한다"는 근거를 달았다. **틀렸다.** 락 5 **본문**은
> 구 용어를 보존하지만 **바로 아래 주석(§9-bis 락 5 註 1)이 "위 문구의 `commit_unknown`은
> `send_unknown`으로 읽는다"고 명시**하고, §6.0.2가 구 용어를 `send_unknown`/`presence_unknown`으로
> **분리**했으며, §10 체크리스트는 *"`commit_unknown` 식별자 잔존 혼용 0건"*을 요구한다.
> 자문이 처음부터 옳았다. **근인 = 락 5 본문만 읽고 그 註·§6.0.2·§10을 안 본 스캔 범위 축소**
> (교훈 27의 재범). 이 결정에 해당하는 것은 **`send_unknown`**이다 — 이 경로는 전송을 **시도한**
> 뒤 ACK가 불확실한 경우이고, 구성조차 안 한 `presence_unknown`과는 출구가 다르다(§6.0.2).

**이 선택을 결정지은 리스크:** 구현 B는 **ACK 유실이라는 불확실한 관측에서 latch 해제 + dispose라는
비가역 행동을 실행한다** — 이 트랙의 불변식을 문면 그대로 위반한다. 게다가 그 경우 카드가 **알림 없이**
`doing`에 잔존한다. A의 잔존 리스크(카드 정지)도 실재하지만 durable alert로 운영자에게 보이므로
**"조용히 멈추지 않는다"**가 유지된다. 불변식이 이미 답을 정해둔 분기였다.

#### 결정 2 — seq: **Flight 소유 + payload 구성 시점 채번** (제시한 두 안 모두 기각)

> **전제 교정:** 아키텍트는 "`flight.seq`냐 `cardSeq`냐"로 물었으나 **둘 다 틀렸다.**
> `flight.seq`(스폰 고정)는 `dispatchHandoffId`와 **역할이 중복**이고, `cardSeq`(send마다 증가)는
> **재전송에 새 키를 부여해 멱등키를 스스로 무효화한다.**

**채택 규약:** **result payload를 새로 구성할 때 seq를 1회 증가**하고, **재전송은 같은 seq를
재사용**한다.

> **R43b 개정 — 소유 주체 Flight→issuer (결정 ③ · R43 전제 P).** 초판은 "seq는 **Flight에 산다**"·
> "전역 `cardSeq` 맵은 **삭제**한다"고 적었다. **둘 다 개정한다.** (P) `sendFailedResult` 7경로 중
> **Flight-less 3경로**(`:850 :1114 :1204`)가 있어 Flight는 seq 소유 주체가 될 수 없다 →
> **소유 주체는 dispatch-scoped result issuer**다(§6.7.2). (Q) 전역 `cardSeq`(`:575`)는 result
> 시퀀스가 아니라 **attempt 카운터**이고 소비처 4곳(`:1141 :1192 :1220 :2372-2373`)이 실재하므로
> **삭제하지 않고 유지**한다(삭제 시 agent name·소켓 경로 충돌 = live-measured 수정 회귀).
> **채번 규약(구성 시 +1 · 재전송 재사용)은 그대로**이고 **소유 주체만 이전**된다.
> `sendFailedResult`의 `cardSeq` 채번(`:2372-2373`)만 issuer 채번으로 대체된다.

**`(cardId, dispatchHandoffId)`만으로는 부족하다:** 결정 1의 구조상 한 dispatch 안에 서로 다른
**논리 result 2건**(거절된 `needs_verification`, 후속 `failed`)이 **합법적으로** 존재한다. 이 둘을
한 키로 뭉개면 relay의 **미실측 dedup 의미론에 correctness가 얹힌다** — 교훈 (30) 위반형이다.

> **[시대 표기 (R43d — codex H-new-1 잔여)]** 한 dispatch에 **논리 result 2건**(거절된
> `needs_verification` + 후속 `failed`)이 존재하는 것은 **[(C) 본체]** 구조다(§6.7.2 시대 매개변수화).
> **[v0.27.0 / pre-C]**에서는 성공형 `initial`이 `done`이라 거절·후속 failed가 없어 논리 result가
> **1건**이다. 그러나 `(cardId, dispatchHandoffId, seq)` **각인 자체는 시대 무관 이번 PATCH
> 의무**다 — payload는 tower inbox에 영속되어 사후 정정이 불가능하므로(§6.7.3 범위 경계), pre-C에서
> 논리 result가 1건이어도 seq는 payload 구성 시점에 각인된다. 즉 "2건 구분" 동기는 (C) 본체
> 소관이되 seq 각인 기제는 v0.27.0에서 이미 선다.

**이번 PATCH의 범위 경계 (R43b 개정 — 결정 ③):** payload에 `(cardId, dispatchHandoffId, seq)`를
각인하는 것은 이번 PATCH 의무다 — payload는 **tower inbox에 영속되므로 나중에 고칠 수 없다.**
**tower currency 게이트(§6.7.3)도 이번 PATCH에 편입**한다 — 이는 relay 표면이 아니라 tower-local
적용 판정(`card-ops.ts` — host 패키지)이기 때문이다(락 9 범위 개정). **별도 PATCH로 남는 것은
relay/wire idempotency와 inbox reconcile뿐**이며, 그것이 없는 동안 이 PATCH는 **wire exactly-once를
주장하지 않는다**(락 9).

### 6.8 herdr 등급의 지위 — 원칙 교정 (E8)

아키텍트가 이전에 세웠던 원칙

> ~~“Loom의 hook 신뢰 등급은 herdr가 그 벤더에 부여한 등급을 상회하지 않는다”~~

는 **과도(overreach)하므로 채택하지 않는다.** herdr의 integration 등급은
**(a) 구현된 integration 자산 (b) herdr의 wait/UI 모델 (c) coverage 검증 수준 (d) 제품 우선순위**
의 **혼합물**이며, 센서의 정보론적 신뢰도와는 다른 축이다. 실제로 Grok을 `none`으로 둔 사유에는
**“자산 미구현”·“파이프 미배선”** 같은 제품 사정이 포함되어 있다
(`AGENT-CLI-LIFECYCLE-HOOKS.md` §4.4.1의 3·4번).

**채택하는 대체 원칙:**

> Loom의 hook 신뢰도는 그 어댑터가 **독립 검증한 명제 coverage**를 상회할 수 없다.
> herdr 등급은 **보수적 prior**로 참고하되, 비가역 전이의 권위 근거로 수입하지 않는다.

**herdr 수렴의 증거 등급 = `B+`(중강).** herdr는 **외부 참조 구현 하나**이지 Loom 안전성의
명세가 아니다. 더욱이 **herdr의 authority 대상은 상태 표시·wait뿐인 반면 Loom은 result 발행 ·
board 전이 · pane cleanup까지 가진다** — 부작용의 범위가 넓으므로 **Loom이 herdr보다 강한
불변식을 요구한다.** “herdr도 그렇게 한다”는 Loom 결정의 충분근거가 될 수 없다.

## 7. 검증 계획

### 7.1 유닛/통합 — 제품 코드에서 반드시 잠글 것

0. **어떤 경로에서도 `status="done"` result가 0건이다** — **(C) 본체 게이트** (§6.7.2 시대
   매개변수화 · R43c). 완료 후보·terminal·상한 소진·ACK 성공 전 경로를 전수로 돌려 `done` 발행
   0건을 잠근다. **[v0.27.0 / pre-C]에는 적용되지 않는다** — pre-C의 성공형 `initial`은 현행 `done`을
   발행하며(§6.7.2 · PLAN out-of-scope "(C) 전환 본체"의 단계 순서), 이 "done 0건" 게이트는 (C)
   본체 PATCH가 `pane-cleanup.test.ts:245`의 `done` 기대를 교체할 때 비로소 live해진다.
1. `agent.start` 반환 paneId가 registry에 등록되고 status/terminal 모두 같은 owner로 demux된다.
2. `done` before `working` → `completion_without_start`, result 0건.
3. Codex `Working (11m • esc to interrupt)` tail → deferral; brief echo/non-tail 동일 문자열 → 비매치.
4. terminal race를 `result_sending` 진입 여부로 나눠 잠근다.
   - **미진입**(settle/read/deferral 중 terminal) → failed **로컬 발행 1회**(local single-issue),
     late `done` 0건.
   - **진입 후**(result-send 중 terminal) → 그 자리에서 failed 발행 0건; `terminalPending` latch 1건
     기록 후 ACK 판정으로만 종결.
5. strict ACK 성공(`status ∈ {queued, delivered}` ∧ `recipientCount=1`) → `result_relay_accepted` →
   **`awaiting_human_verification`**; **`cleanup_requested` 진입 0건**(사람 확정 + tower receipt
   전에는 `pane.close` 0건). 발행된 result는 `needs_verification` **1건**, `done` 0건.
   `terminalPending`이 latch돼 있어도 추가 발행 0건.
   또한 ACK가 **명시적 거부**면 단일 소유자가 failed로 종결(로컬 발행 1회)하고 cleanup을 하지 않는다.
   **[(C) 본체 게이트 (§7.1-0 · §6.7.2 시대 매개변수화)]** — 이 항목의 `awaiting_human_verification`
   진입·`needs_verification` 발행·`cleanup_requested`/`pane.close` 0건·명시적 거부 종결은 [(C) 본체]
   수용 기준이다. **[v0.27.0 / pre-C]**에서는 strict ACK 성공 시 성공형 `initial`이 현행 `done`을
   발행하고 `finishCard`의 `sent && pane.close`가 적용된다. `result_relay_accepted` 명명·`terminalPending`
   무추가발행·strict ACK 3분기 구조는 시대 무관 동일.
5a. 사람 확정 + tower receipt 주입 → 그때 비로소 `cleanup_requested` → `pane.close` 1회 →
   후속 terminal은 `terminal_expected`, 추가 발행 0건.
6. ACK가 **transport error / 유실** → **`send_unknown`**; 두 번째 result 0건, `pane.close` 0건,
   binding이 send 전에 사라지지 않음. (**`blocked` 아님** — 전송 여부가 미상이므로 실패로 단정하지
   않는다.) **진입 시점에 durable quarantine 레코드 1건**(§6.7.1) 기록; 10분 만료는 **재알림만**
   유발(dispose 0건 — 결정 ②); in-memory 해제는 운영자 ack·프로세스 종료에서만.
6a. result를 **구성한 적이 없는** presence 소진 경로 → **`presence_unknown`**; 늦은
   **단일** `needs_verification` 발행이 허용되고 local single-issue가 깨지지 않음을 잠근다
   (`send_unknown`과 출구가 다름 — §6.0.2).
   **[(C) 본체 (§7.1-0)]** 늦은 단일 발행의 status가 `needs_verification`인 것은 [(C) 본체]이며
   **[v0.27.0 / pre-C]**에서는 `done`이다 — `presence_unknown` 자동 출구(c)·local single-issue
   불변식은 시대 무관 동일.
7. tombstone TTL 안 terminal → expected; TTL 뒤 unknown → structured `unbound_terminal` 1건.
8. `flights.set()` +1s 초기 presence check 동작; event 누락 + `pane.list` absent 1회 → 유지;
   grace 3s 이상 간격의 연속 2회 absent → terminal 합성; **pane 재등장(present) → absent strike와
   episode 시도 카운터를 모두 reset**(§6.6); 한 episode 12회(≈60s) 초과 → 무한 폴링 없이
   `presence_unknown` 전이.
9. 순차 카드 3개에서 subscription snapshot/global terminal subscription 유지 — 0.23.4 회귀.
10. conv terminal → blocked turn, done_proposal/close 0건 — CONV_SPEC 회귀.
11. M-1 deny·L-2 mismatch 기존 테스트 green; terminal failure도 L-2를 통과해야만 board 반영.
12. still-running 상한 소진 → `needs_verification` 1건 + `done` 0건. 상한값은 correctness가 아니라
    운영 파라미터이므로 **값을 바꿔도 발행 status가 바뀌지 않음**을 함께 잠근다(§6.6).
    **[(C) 본체 (§7.1-0)]** `needs_verification` 발행·`done` 0건은 [(C) 본체] 기대이며 **[v0.27.0 /
    pre-C]**에서는 상한 소진 시 성공형 `initial=done`이 발행된다 — "값을 바꿔도 발행 status 불변"
    (운영 파라미터성)은 시대 무관 동일.
13. **발행 전달 추적(§6.7):** 두 발행 경로 모두 ACK 반환값을 소비한다 — fire-and-forget 0건.
    ACK 유실을 주입하면 durable alert 1건이 남고, 카드가 조용히 `doing`에 잔존하지 않는다.

Fake herdr에는 `pane.exited` 지원 여부를 먼저 실물에서 확정한 뒤 그 shape만 복제한다. 실물보다 먼저
test double API를 발명하지 않는다.

### 7.2 실제 pane을 죽이는 스모크가 필요한가 — **필요**

필요한 이유는 fake test가 다음을 증명하지 못하기 때문이다.

- v0.7.4 자연사 시 `pane.closed`/`pane.exited` 실제 event 종류·순서
- `pane.close`가 SIGHUP에서 SIGKILL로 escalation하는 조건
- close 직후 pane.read 가능 시간/실패 shape
- subscribe reconnect window의 event 유실 여부

단, 제품 구현부터 하지 않는다. 먼저 별도 scratch pane의 raw probe로 API 사실을 고정한다.

#### Smoke 0 — herdr API 증거팩 (구현 전)

1. 기존 워커 탭이 아닌 전용 scratch tab/pane을 만든다.
2. raw `events.subscribe`에 `pane.closed`, 가능하면 `pane.exited`, status를 함께 요청하고 ACK 원문을
   저장한다.
3. `READY`를 출력하고 signal을 기다리는 결정론적 fixture process를 쓴다. lessons에서 금지한
   bare `sleep N` 카드 페이로드는 쓰지 않는다.
4. 세 번 분리 실행:
   - process 자체 exit 0
   - process에 SIGHUP
   - process에 SIGKILL
5. 네 번째는 API `pane.close`를 호출해 의도된 cleanup과 대조한다.
6. push envelope·pane list/snapshot·server log의 ordering을 monotonic timestamp로 보존한다.

실제 process kill은 파괴적 동작이므로 **scratch pane ID를 출력해 확인한 뒤 명시 승인 하에** 수행한다.
기존 worker pane/PID에는 절대 실행하지 않는다.

#### Smoke 1 — Loom end-to-end (구현 후)

| 시나리오 | 기대 |
|---|---|
| submitted 뒤 work-start 전 exit 0 (`result_sending` 미진입) | failed/blocked 1(로컬 발행 1회), done 0 |
| working 중 HUP/KILL (`result_sending` 미진입) | failed/blocked 1, done 0, terminal source 기록 |
| 정상 완료 후보 + strict ACK 성공 | **`needs_verification` 1, done 0**, `awaiting_human_verification` 진입, **`pane.close` 0**(사람 확정 전) |
| 위 뒤에 사람 확정 + tower receipt 주입 | `cleanup_requested` 1, `pane.close` 1, 후속 terminal = expected, 추가 result 0 |
| final marker처럼 보이는 text 뒤 ACK 전 kill | auto done 0, `completion_evidence` note + blocked |
| `result_sending` 중 kill + 이후 strict ACK 성공 | `terminalPending` latch 1, **추가 result 0**, `needs_verification` 1, done 0 |
| `result_sending` 중 kill + ACK transport error/유실 | **`send_unknown` 1**, result 0(두 번째 발행 없음), `pane.close` 0, 10분 만료 시 운영자 가시 log+counter 1 |
| presence 폴링 소진(result 미구성) | **`presence_unknown` 1**, 늦은 단일 `needs_verification` 허용, 중복 0 |
| Codex Working 화면에 completion-class status 주입 | deferral, result 0 |
| event stream 강제 disconnect 동안 pane 종료 | reconcile로 blocked, silent doing 잔존 0 |
| 발행 ACK 유실 주입 (§6.7) | durable alert 1, 카드가 조용히 `doing`에 남지 않음 |

**[시대 표기 (R43d — codex H-new-1 잔여)]** 위 표에서 기대값이 **`needs_verification` 1·`done` 0·
`awaiting_human_verification` 진입·`pane.close` 0(사람 확정 전)**인 행(정상 완료 후보 + strict ACK
성공 · `result_sending` 중 kill 후 strict ACK 성공 · presence 폴링 소진)은 **[(C) 본체]** 게이트다
(§7.1-0 · §6.7.2 시대 매개변수화). **[v0.27.0 / pre-C]**에서는 성공형 완료가 현행 `done`을 발행하고
`sent && pane.close`가 적용된다 — 나머지 행(`send_unknown`·`terminalPending` latch·durable alert·
terminal source 기록·`presence_unknown` 자동 출구)의 기대는 시대 무관 동일.

Mac 1회 뒤 **WSL 또는 VPS 한 노드에서 동일 핵심 3경로**(working kill, committed cleanup, reconnect
reconcile)를 반복한다. 원격 검증은 같은 bridge-local socket/API를 써야 하며 Mac 로그 경로를 scp해
판정하는 방식은 금지한다.

## 8. R{n} 판정

**필요 (`rgate=needed`).** Wire version은 안 바뀌지만 다음 의미가 바뀐다.

- **브릿지의 `done` 발행 권한 자체를 제거한다((C) 전환)** — board `done`은 사람 확정으로만 생긴다
- still-running 상한 소진의 처리(→ `needs_verification`)
- pane 자동 cleanup 시점이 **ACK 뒤 → 사람 확정 + tower receipt 뒤**로 이동
- conv pane terminal의 공통 registry 접점

이는 `WORKFLOW.md §5.1`의 단순 Low/문서 정리가 아니다. 새 MCP/wire 표면은 없지만 completion
attestation이라는 신뢰 경계와 기존 R29/R32/R33 M-lock에 인접한다. 따라서 PLAN PATCH를
`pending-review`로 올리고 Fable 5가 최소 다음을 검토해야 한다.

1. `result_relay_accepted` 정의가 strict ACK 판정(`status ∈ {queued, delivered}` ∧
   `recipientCount=1`)으로 충분한가 — 그리고 이름이 보장 경계(relay-accept)를 정확히 표현하는가
2. still-running 상한 소진을 `needs_verification`으로 바꾸는 호환 영향
3. reconcile absent 2회+grace의 오탐/유실 경계
4. conv가 CONV_SPEC의 타워 확정 권한을 보존하는가
5. v1 optional `reason/note`만으로 운영자가 uncommitted terminal과 `needs_verification`을 충분히
   구분하는가
6. **(C) 전환의 liveness 대가가 수용 가능한가** — 사람 확정이 전 카드의 필수 경로가 되므로,
   §6.7의 durable alert + ACK 추적 없이는 알림 유실이 곧 카드 영구 정지다
7. **증거 명제표(§6.0-bis)가 `hookHint 우선` 등 잔존 전역 우선순위를 전부 대체했는가**

R 전에 구현하지 않는다. D처럼 sidecar/nonce protocol까지 확대하면 별도 MINOR + CONV_SPEC 개정
후 재리뷰가 필요하다.

## 9. 미확정 항목 — 스파이크 결과 (2026-07-20 종결)

> **스파이크 종결.** 관측 정본 = **`docs/spikes/PANE-DEATH-OBSERVATIONS.md`**(herdr v0.7.4 / protocol 16,
> raw NDJSON 소켓 프로브 2라운드, 프로브 소스 `scripts/probe-pane-death.ts`).
> 아래 판정은 그 문서의 §1 요약표·§9.1 사실표를 §9 항목별로 옮긴 것이다.
> **본 절은 §5~§7의 설계 본문(권고 B)을 변경하지 않는다** — 잠글 항목은 §9-bis로 분리했다.

| # | 주제 | 판정 |
|---|---|---|
| 1 | 자연사 event 종류 | **닫힘** |
| 2 | payload에 exit code/signal | **닫힘 (부정)** |
| 3 | `PaneDied unknown` 의미 | **닫힘(부분) — 시간 상관 확인, 인과 미확정** |
| 4 | 213 status sequence | **범위 밖** (구현 PATCH로 이관) |
| 5 | close 요청/ACK/event 순서 | **부분** — 불변식 금지 |
| 6 | bridge restart registry/tombstone | **out-of-scope 확정** |
| 7 | cleanup timeout / tombstone TTL | **결정 완료 — TTL 60s** |
| 8 | **status replay 여부** (`pane.agent_status_changed`) | **닫힘(조건부)** — replay 안 됨(v0.7.4 관측, 계약 아님) |

1. **자연사 event — 닫힘.** 프로세스 종료(exit 0)와 SIGKILL은 **`pane_exited`**, `pane.close` API는
   **`pane_closed`**를 보낸다. 한 pane에 두 종류가 섞이는 일은 없다 — 2라운드 6개 pane 전수 일치,
   혼재 **0건**. `pane.close` 후 10초를 계속 관측해도 늦은 `pane_exited`는 오지 않았다.
   → "프로세스가 죽었다" vs "우리가 닫았다"는 **이벤트 타입으로 구분 가능하다**.

2. **payload — 닫힘 (부정).** terminal event의 `data`는 2라운드 전수 예외 없이
   **`{pane_id, type, workspace_id}`가 전부**다. **exit code·signal 부재**이며, 봉투(`{data, event}`)에도
   **id·seq·timestamp가 없다**. exit 0(A)과 SIGKILL(B)의 payload는 `pane_id` 외 **완전히 동일**하다.
   → 종료 코드로 성패를 판정할 수 없는 것이 아니라, **이벤트에 종료 코드가 애초에 없다.**
   판정 근거는 이벤트 **외부**(결과 커밋 여부·marker·산출물)에서 와야 한다.

3. **`PaneDied unknown` 의미 — 닫힘(부분): 시간 상관 확인, 인과 미확정.** close 요청(11:51:18.625) →
   경고(18.764598, **+139ms**) → ACK(18.766) 순으로 이 경고는 close 처리 **한가운데** 끼어 있다.
   그러나 **"우리 close가 유발한다"는 확정이 아니다** — 경고의 `pane=236`은 herdr 내부 숫자 id이고 API의
   `w3:p5J`와 **매칭이 확인되지 않았으므로**, 같은 11.4초 스크레이프 창에서 **다른 내부 pane 236이 우연히
   사망한 대안 설명이 제거되지 않았다**. 원시 로그가 직접 입증하는 것은 **시간 대응**(창 전체에서 `PaneDied`
   1건·`pane.close` 1건, 시차 139ms)까지다.
   **결론은 유지된다:** 브릿지가 통지를 버렸다는 증거가 **아니며**, 진단 입력으로 쓰지 않는다(§9-bis 4).
   또한 replay와 **무관하다** — 스테일 terminal 20건이 유입되는 동안 `PaneDied`는 0건이었다.
   내부 id ↔ API `pane_id` 매핑 또는 herdr 내부 trace를 확보하면 인과가 확정된다.
   *(격하 근거: codex 적대적 검증 2026-07-20 Medium — `docs/reviews/PANEDEATH-CODEX-REVIEW.md` §2)*

4. **213 status sequence — 범위 밖.** herdr API 프로브로는 답할 수 없다 — bridge **ingress 구조 로그**가
   있어야 한다(제품 코드 변경). **구현 PATCH로 이관**하며, 그 PATCH가 event name/status/phase만
   구조 로그로 남긴다(본문 금지).

5. **close 요청/ACK/event 순서 — 부분.** 순서 `요청 → ACK → 이벤트`는 **2/2 보존**됐다.
   그러나 ACK→이벤트 마진이 **22ms ↔ 211ms로 약 10배 진동**하고, 두 값 모두 herdr의 ~110ms 전달
   양자와 같은 자릿수라 관측된 것은 **전달 순서**이지 **서버 내부 인과 순서가 아니다**. **n=2**.
   → **"ACK가 오면 이벤트가 뒤따른다"를 불변식으로 코드에 잠그지 말 것.**
   확정하려면 close 시점을 ~110ms tick에 대해 무작위 오프셋으로 **n≥20회** 반복해야 한다.

6. **bridge restart — out-of-scope 확정.** in-memory registry/tombstone은 bridge crash 후 사라지며,
   claim-after-crash 저널/supervision은 기존 out-of-scope다. 본 PATCH가 해결하지 않는다.
   **자문 근거(fable-advisor, 2026-07-20):** 브릿지가 재시작되면 tombstone이 방어하려던 **이벤트 경로
   자체가 사라진다** — 구독도 flight도 함께 소멸하므로 묘비가 막을 오발화 대상이 존재하지 않는다.
   따라서 이는 "나중에 풀 숙제"가 아니라 **본 PATCH의 설계 범위 밖**이다.

7. **cleanup timeout / tombstone TTL — 결정 완료: 60s.** result commit 뒤 `pane.close` ACK는 왔으나
   terminal event가 끝내 오지 않는 경우의 상한을 **60초**로 정한다.
   **자문 근거(fable-advisor, 2026-07-20), 확신 = 중간.** 근거: 이벤트 도착 시각은 사건 발생 시각이
   아니며(~110ms 양자화 + 백로그 드레인 지연), 이 지연을 예산에 포함해야 한다.
   **WSL/VPS 실측 후 재조정 여지 있음. 단 30s 이하로는 내리지 말 것** — 드레인 지연이 정상 케이스를
   타임아웃으로 오판한다. 만료 시 동작은 §9-bis 7에 락한다.

8. **status replay 여부 — 닫힘(조건부).** herdr v0.7.4는 `pane.agent_status_changed`를 신규 구독자에게
   **재전달하지 않는다.** 관측 정본 = `PANE-DEATH-OBSERVATIONS.md` **§D**(라이브 status push 4건 수신
   게이트 통과 → 새 소켓 동일 구독 35초 **0건** → 같은 소켓이 직후 라이브 push를 101ms에 수신해 구독 성립
   증명 → 같은 연결·같은 창에서 terminal은 replay 확인, 2회 실행 동일).
   **설계 함의:** 신규 구독 추가로 기존 카드의 스테일 `working→idle`이 재생돼 가짜 done이 되는 경로는
   **성립하지 않으며**, terminal만 방어하는 현재 설계(권고 B)는 **이 실패 모드에 한해** 충분하다.
   **조건부인 이유:** 이는 herdr가 보장한 계약이 아니라 **v0.7.4 구현의 관측된 성질**이다 —
   **불변식으로 코드에 잠그지 말 것**(업스트림이 replay를 추가하면 조용히 깨진다).
   **여전히 열려 있는 것:** `CLAUDE.md` §6.2 규칙 7의 **가짜 done 2건**(codex TUI 초기화면 스크레이프 ·
   `Working` 중 발행)은 replay와 **무관**하므로 이 항목이 닫아주지 않는다. 방어는 §6.2 규칙 2·3이 담당한다.

## 9-bis. R{n} 락 후보 — 구현 PATCH가 R 게이트에서 잠글 항목

> 스파이크가 닫은 사실과 자문 권고를 **구현 PATCH의 락 후보**로 정리한 것이다.
> 각 항목 = **결정 + 근거**. 출처는 각 항목 말미에 표기한다.
> 이 절은 후보 제시이며, 확정은 **R{n} 게이트**에서 이뤄진다(§8 `rgate=needed` 유지).
>
> **⚠️ 1차 R{n} 검증 결과 reject — 문안 전면 교체 (2026-07-20).** codex 적대적 검증
> (`docs/reviews/PANEDEATH-CODEX-REVIEW.md`, 정본·수정 금지)이 High 3건·Medium 6건을 냈고
> 아키텍트가 **전면 수용**했다. 아래 1·3·4·5·6·7·8은 그 §3의 **대체 문구를 옮긴 것으로,
> D8 식별자 개칭(`result_committed`→`result_relay_accepted`)을 제외하면 축자 그대로**다
> (2026-07-21 통합 패스 전까지는 무조건 축자였다 — 아래 2차 단서 참조).
> 2는 "유지" 판정이라 원문 그대로다. 9는 finding H3에 대한 아키텍트 범위 판정으로 신설했다.
>
> **⚠️ 2차 R{n} 검증 결과 reject — 통합 패스 (2026-07-21).** codex 2차 적대적 검증(High 1·Medium 7)과
> 독립 스켑틱 지적을 D1~D10으로 반영했다. 이번 패스에서 **락 10을 신설**(start evidence + activity
> fence 승격)하고, **락 5·9의 권위를 정리**(strict ACK·`commit_unknown` 정본 = 락 5)했으며,
> **락 8에 reconcile cadence 수치를 명기**했다. 또한 D8에 따라 phase명 `result_committed`를
> **`result_relay_accepted`로 개칭**했다 — 아래 축자 인용 문구 중 이 식별자만 개칭이 반영돼 있고,
> 나머지 문장은 codex 원문 그대로다.
>
> **⚠️ 3차 R{n} 검증 결과 reject — (C) 방향 전환 (2026-07-21).** codex 3차 검증 + 장기자문 2회 +
> fable-advisor 자문 2회를 받아 아키텍트가 **설계 방향을 전환**했다: **브릿지의 자동 `done` 커밋을
> 폐지**하고(§6.0), 센서 전역 우선순위를 **증거 명제표**로 대체하며(§6.0-bis),
> `commit_unknown`을 **`send_unknown`/`presence_unknown`으로 분리**한다(§6.0.2).
> **B의 종료 펜스·tombstone·generation 결속은 그대로 유지된다** — 바뀐 것은 result 발행의 종착지다.
> 아래 락 중 자동 `done`을 전제하던 항목(1·5·7·8·9·10)은 **삭제하지 않고 (C)에 맞춰 재서술**했으며,
> 각 항목 말미에 *(C) 전환 반영:* 각주로 변경 이유를 남긴다. codex 축자 인용 부분은 인용 표시를
> 유지하되, 전환으로 의미가 바뀐 문장은 각주에서 명시한다.

1. **종료 판별은 이벤트 타입으로 한다**

   > `pane_exited`와 `pane_closed`는 서로 다른 terminal source로 기록한다. `pane_closed`도 현재 lifecycle이 동일 generation의 `result_relay_accepted → cleanup_requested`를 먼저 완료한 경우에만 `terminal_expected`이며, 그 밖의 모든 terminal은 uncommitted 후보로 취급한다. 이벤트 타입만으로 작업 성공이나 “bridge가 닫음”을 판정하지 않는다.

   *(C) 전환 반영:* `result_relay_accepted → cleanup_requested` 사이에 **`awaiting_human_verification`
   (사람 확정 + tower receipt)이 삽입**된다. 따라서 `terminal_expected` 분류 조건은
   “ACK를 받았다”가 아니라 **“사람이 확정했고 그 결과로 우리가 close를 요청했다”**로 좁아진다.
   락의 취지(이벤트 타입만으로 성공·주체를 판정하지 않는다)는 **그대로 유지**된다.

   *변경 이유:* 구 문구는 `pane_closed`를 곧바로 "우리가 닫음"으로 표현해 **이벤트 종류와 로컬 lifecycle
   phase를 혼동**했다 — 관측은 API close를 보여줄 뿐 호출 주체가 bridge임을 증명하지 않으며, 사용자가
   result commit 전에 수동 close하면 구현자가 타입만 보고 expected cleanup으로 무시해 terminal fence가
   발화하지 않는다(§2 Medium·§9-bis 1행).
   *근거:* 2라운드 6개 pane 전수에서 타입이 사인과 1:1 대응했고 혼재 0건이었다. (이번 스파이크 관측)
   *출처:* codex 적대적 검증 2026-07-20 (`docs/reviews/PANEDEATH-CODEX-REVIEW.md`) 수용

2. **종료 코드·시그널 기반 판정 금지** — 성공/실패 판정에 exit code나 signal을 쓰지 않는다.
   *근거:* terminal 이벤트 payload는 `{pane_id, type, workspace_id}`뿐이라 그 정보가 **애초에 없다**;
   exit 0과 SIGKILL이 와이어에서 동일하다. (이번 스파이크 관측)
   *검증 결과:* **유지** — codex 적대적 검증에서 원문 그대로 통과했다(모호성 없음).

3. **replay 방어 — unexpected terminal은 단독 권위가 아니라 reconcile trigger다**

   > terminal push는 (a) `pane_id`와 현재 lifecycle generation이 일치하고 (b) 그 lifecycle이 아직 terminal latch를 소비하지 않았을 때만 advisory trigger로 받는다. `cleanup_requested`인 동일 generation은 expected로 latch한다. 그 밖의 unexpected terminal은 즉시 result를 내지 말고 bounded reconcile을 시작해, grace로 분리된 `pane.list` 성공 응답 두 번에서 연속 absent일 때만 `terminal_uncommitted`를 확정한다. present는 replay로 간주해 strike를 reset하고, unknown/RPC 오류는 확정 근거로 쓰지 않는다.

   *변경 이유:* 구 문구는 "구독 시작 이후 도착"을 replay 판별에 썼으나 **replay된 이벤트도 그 조건을
   만족한다** — terminal 봉투에 사건 시각·seq·event id가 없어 수신 시각으로 과거 사건을 판별할 수 없다;
   herdr 재시작·ID 재사용 뒤 10분 전 `pane_closed`가 새 소켓에 흘러들면 살아 있는 새 flight가 사망 처리된다
   (§2 High·§9-bis 3행, §9-2).
   *근거:* herdr는 신규 구독자에게 과거 terminal 이벤트를 **바이트 동일**로 재전달한다(슬라이딩 백로그,
   연결당 **~110ms에 1건** 드레인, 보존 **≥10분**, **클라이언트 프로세스 사망을 넘어 생존**). `HerdrClient`가
   증분 재구독을 하므로 **재구독마다 스테일 terminal이 유입**된다. (이번 스파이크 관측)
   *출처:* codex 적대적 검증 2026-07-20 (`docs/reviews/PANEDEATH-CODEX-REVIEW.md`) 수용

4. **`PaneDied for unknown pane`을 진단 신호로 쓰지 말 것**

   > `PaneDied for unknown pane`은 bridge의 lifecycle 판정·경보·통지 유실 진단 입력으로 사용하지 않는다. 이번 관측에서는 `pane.close` 요청 139ms 뒤이자 ACK 직전에 유일한 경고가 발생해 강한 시간 상관은 있으나, 내부 id `236`과 API pane id의 대응이 확인되지 않았으므로 호출 인과는 미확정으로 기록한다.

   *변경 이유:* 구 문구는 "우리 close가 유발"을 닫힌 사실로 승격했으나, 내부 id `236`과 API id `w3:p5J`의
   대응이 미확인이라 **같은 창에서 다른 내부 pane 236이 우연히 사망한 대안 설명이 제거되지 않았다**
   (§2 Medium·§9-3행). 결론(진단 입력으로 쓰지 않는다)은 그대로다.
   *출처:* codex 적대적 검증 2026-07-20 (`docs/reviews/PANEDEATH-CODEX-REVIEW.md`) 수용

5. **이중 발행 방지 — 발행 소유권 CAS + in-flight terminal 보류** *(strict ACK 판정과 unknown
   상태 메커니즘의 **정본**. 락 9는 이를 참조만 한다.)*

   > 오직 `completion_candidate → result_sending` CAS 승자만 `sendResult`를 호출한다. `result_sending` 동안 도착한 terminal은 `terminalPending`으로 latch할 뿐 경쟁 failed result를 보내지 않는다. ACK는 `status ∈ {queued, delivered}`이고 `recipientCount=1`일 때만 committed로 인정한다. 명시적 거부는 단일 소유자가 failed로 종결하고, transport error/ACK 유실은 `commit_unknown`으로 두어 cleanup·두 번째 result를 금지한다. 재발행이 필요하면 `(cardId, seq, dispatchHandoffId)` 기반 relay/tower idempotency 또는 inbox reconcile을 먼저 추가하며, 그것 없이는 wire exactly-once를 주장하지 않는다.

   *(C) 전환 반영 — 두 곳이 바뀐다:*
   1. 위 문구의 **`commit_unknown`은 `send_unknown`으로 읽는다**(§6.0.2). result를 **구성한 적조차
      없는** 경우는 별도 상태 `presence_unknown`이며, 그쪽은 **한 번도 보낸 적이 없으므로 늦은 단일
      발행이 허용**된다 — 재발행 금지는 `send_unknown`에만 적용된다.
   2. **“committed로 인정한다”는 relay accept까지의 인정이며 완료 커밋이 아니다.** CAS 승자가
      발행하는 성공형 result의 status는 **[(C) 본체]에서 `needs_verification`**이고(§6.7.2 시대
      매개변수화 — **[v0.27.0 / pre-C]에서는 `done`**), ACK 성공의 다음 phase는 **[(C) 본체]에서
      `awaiting_human_verification`**이다. `cleanup_requested`로 이어지지 않는다.

   *R43b 개정 반영 (결정 ③④) — 발행 소유권 = issuer 중앙화:* 위 CAS는 **부작용 소유권** 장치이고,
   그 CAS 승자가 발행에 쓰는 유일 통과점이 **dispatch-scoped result issuer**다(§6.7.2). issuer는
   handoff 수신 시점에 생성되어 **Flight-less 3경로(`:850 :1114 :1204`)를 포함한 모든 카드 result
   발행**을 중앙화한다(R43 H4·전제 P 해소 — "seq는 Flight에 산다"의 소유 주체를 Flight→issuer로
   이전). strict ACK 3분기·`send_unknown` 흡수 상태의 판정 규약 자체는 **무변경**이며, seq 채번 규약
   (구성 시 +1 · 재전송 재사용)도 **무변경**이다 — **바뀌는 것은 소유 주체와 통과점의 중앙화뿐**이다.
   가드는 **5곳**(`:2003 :2019 :2067 :2080 :2096` — `:2019` `beginCardCompletion` 본류 포함)이며,
   순서 역전 후 각 가드가 CAS 소유권 불리언을 함께 검사해야 방어가 성립한다(§6.7-bis 함정 1 정정).

   *R43b-2차 각주 (codex H-new-2 수용) — issuer acquisition = 보편 발행 권위:* 위 본문 *"오직
   `completion_candidate → result_sending` CAS 승자만 `sendResult`를 호출한다"*는 **Flight-backed 완료
   경로 한정**이다. Flight-less 3경로(`:850 :1114 :1204`)는 Flight도 `completion_candidate`도 없어 이
   lifecycle CAS 승자를 만들 수 없다 — 그래서 codex H-new-2가 "sole-owner 규칙을 만족 못 한다"고 지적했다.
   보편 규약은 **issuer의 원자적 `acquire(logicalKind)`가 유일한 send 권위**라는 것이다: Flight-backed
   완료 result는 lifecycle CAS **그리고** issuer 채번을 **모두** 통과하고, pre-Flight 실패 result는
   **issuer acquire 단독**으로 발행 권위를 얻는다(§6.7.2). lifecycle CAS는 Flight-backed 완료의 부작용
   소유권 장치로 유지되고, issuer acquisition이 그 위·아래를 모두 덮는 상위 권위다. §6.7.2에도 동일 규정.

   *변경 이유:* 구 문구의 `result_sending → committed` CAS는 **`sendResult()` 뒤에 일어나 발행 소유권을
   획득시키지 못한다** — done handoff가 relay에 저장된 뒤 ACK 대기 중 terminal이 오면 두 wire side effect가
   CAS 패자 결정 전에 끝나 tower inbox에 done과 failed가 둘 다 남는다. 더해 `sendResult()`의 `true`는 ACK
   수신일 뿐 수신자 enqueue가 아니며 relay는 `peer_unknown`도 정상 ACK로 반환한다(§2 High 2건·§9-bis 5행,
   §6.2.4, `bridge-runtime.ts:2312-2324,2363-2388`).
   *근거:* 권고 B는 `sendResult` 완료까지 flight를 살려두므로 `pane_closed` 핸들러가 **이미 커밋된 카드에도
   발화**한다. **이것이 이 PATCH의 핵심 테스트다.** (fable-advisor 자문, 2026-07-20)
   *출처:* codex 적대적 검증 2026-07-20 (`docs/reviews/PANEDEATH-CODEX-REVIEW.md`) 수용

6. **unknown terminal = inert, 단 등록 직전 사망 회수와 한 세트**

   > 현재 lifecycle generation에 바인딩되지 않은 terminal은 structured counter/log만 남기고 result를 발행하지 않는다. 대신 모든 flight는 `flights.set()` 직후 초기 presence check와 주기 bounded reconcile을 시작해, 등록 전에 유실된 실제 terminal도 연속 absent 규칙으로 회수한다. unmatched terminal 자체를 나중 flight에 소급 바인딩하지 않는다.

   *변경 이유:* 구 문구는 unknown terminal 폐기만 락하고 **flight 등록 직전 사망을 회수할 초기/주기
   reconcile 의무를 결합하지 않았다** — `agent.start`가 pane id를 돌려주기 직전 프로세스가 끝나 global
   terminal이 `flights.set()` 전에 도착하면 이벤트가 inert로 사라지고 카드가 영구 doing에 남는다
   (§2 Medium·§9-bis 6행, `bridge-runtime.ts:1177-1203,1899-1916`).
   *근거:* `unbound_terminal`을 failed result 발행으로 승격하면 **브릿지 재시작 후 이미 `done`인 카드에
   `blocked`가 덧붙는 정합성 버그**가 된다 — 락으로 그 승격을 사전 차단한다. (fable-advisor 자문, 2026-07-20)

   *(C) 전환 반영:* 위 근거의 “이미 `done`인 카드”는 이제 **사람이 확정해 `done`이 된 카드**를
   뜻한다. 브릿지가 스스로 `done`을 만들지 않으므로 경로는 하나 줄지만, **정합성 버그의 형태는
   동일하다** — 사람 확정으로 닫힌 카드에 늦은 `unbound_terminal`이 `blocked`를 덧붙이는 것이다.
   락은 **무변경으로 유지**한다.
   *출처:* codex 적대적 검증 2026-07-20 (`docs/reviews/PANEDEATH-CODEX-REVIEW.md`) 수용

7. **cleanup TTL 60s = 운영 파라미터, 만료 동작·generation 보호 명시**

   > cleanup tombstone TTL 기본값은 60초인 운영 파라미터이며 live terminal 전달 상한으로 간주하지 않는다. 만료 시 동일 lifecycle generation임을 재확인한 뒤 `pane.list` 성공+absent이면 tombstone을 만료한다. 성공+present이면 `pane.close`를 정확히 1회 재시도하고 최종 bounded TTL 한 번만 더 유지한다. RPC 오류/timeout에서는 close하지 않고 counter를 남긴 뒤 정책상 만료하며, 어느 분기에서도 추가 result를 발행하지 않는다. 새 generation이 같은 pane id를 소유하면 재시도 close를 금지한다.

   *(C) 전환 반영:* 이 tombstone은 **사람이 확정해 `cleanup_requested`에 진입한 이후**에만
   존재한다 — ACK 직후에는 생기지 않는다. 또한 §6.6에 따라 **60s는 correctness 근거가 아니라
   알림·재평가 전용 운영 기본값**임을 명시한다: 값이 틀려도 카드가 잘못 확정되거나 pane이 잘못
   닫히지 않고, 알림 시점만 이르거나 늦어진다.

   *변경 이유:* 구 문구는 60초를 correctness bound처럼 썼고(관측된 최대 live delivery bound도 백로그 상한도
   미확정) **만료 후 "그래도 실패"의 판정 시점·재시도 후 대기·새 flight generation 보호가 없었다** — 60초
   초과 백로그에서 정상 cleanup terminal이 늦게 오면 tombstone이 먼저 사라져 unknown으로 오염되고, 같은
   pane id가 새 lifecycle에 귀속되면 무조건 close 재시도가 새 pane을 닫는다(§2 Medium·§9-bis 7행).
   *근거:* 이벤트 도착 지연(~110ms 양자화 + 백로그 드레인)을 예산에 포함한 값이며, 확신 중간 ·
   WSL/VPS 실측 후 재조정 여지 · **30s 이하 금지**. (fable-advisor 자문, 2026-07-20)
   *출처:* codex 적대적 검증 2026-07-20 (`docs/reviews/PANEDEATH-CODEX-REVIEW.md`) 수용

8. **bounded reconcile strike — 연속성·reset·generation 명시**

   > 동일 lifecycle generation에 대해 grace 이상의 간격으로 수행한 `pane.list`의 성공 응답에서만 absent strike를 센다. `absent → absent` 두 번이 연속일 때 terminal을 합성한다. 성공 응답에서 present면 즉시 strike=0으로 reset하고, RPC 오류·timeout은 unknown으로 기록하면서 strike=0으로 reset한다. poll 시작 시 캡처한 generation이 현재와 다르면 응답 전체를 폐기한다.

   **cadence 수치 — 알림·재평가 전용 운영 기본값 (§6.6):**

   > **지위 명시 (E5).** 아래 수치는 **정확성(correctness) 근거가 아니다.** 이 상수들이 유발할 수
   > 있는 행동은 **가역 행동(알림 · 재평가 트리거 · poll 가속)뿐**이며, result 확정 · board 확정 ·
   > `pane.close` · dispose · 비멱등 재발행은 **상수 만료로 유발되지 않는다.** 따라서
   > **cadence 실측은 correctness 선결조건이 아니다** — 실측은 분포를 줄 뿐 상한을 주지 못한다
   > (느린 것과 죽은 것의 원격 구별 불가 = 분산시스템 고전 한계).

   | 파라미터 | 값 |
   |---|---|
   | initial presence check | `flights.set()` 직후 **+1s** (즉시 검사 금지 — list 가시성 지연을 사망으로 오판한다) |
   | periodic poll 간격 | **5s** |
   | strike 간 최소 grace | **3s** |
   | 확정 strike 수 | **연속 2회 absent** |
   | **`present` 응답의 효과** | **absent strike와 episode 시도 카운터를 모두 0으로 리셋한다** — 살아서 응답 중인 pane이 episode 상한만으로 unknown에 빠지면 안 된다 |
   | 한 reconcile episode 최대 시도 | **12회(≈60s)** — 초과 시 무한 폴링 대신 `presence_unknown`으로 전이 |
   | 시작 | `flights.set()` |
   | 중단 | `terminal_expected` · `terminal_uncommitted` 확정 · unknown 상태 진입 중 하나 |
   | unknown 상태(`send_unknown`/`presence_unknown`) **진입** | **durable quarantine 레코드 1건 즉시 기록**(§6.7.1 — durable alert와 동일 1건). 이후 10분 타이머는 **재알림(re-escalate)만** 유발한다 — **dispose 금지** |
   | unknown 상태 **해제** | (a) 운영자 ack · (b) 프로세스 종료(로그 필수) · **(c) `presence_unknown`의 늦은 단일 발행이 `relay_accepted`로 종결될 때**(R43b-2차 — §6.7.1; `send_unknown`엔 미적용)뿐. durable 레코드가 진입 시점부터 존재하므로 in-memory 해제는 정보 파괴가 아니다 |
   | unknown 상태의 reconcile 참여 | **없음**(이미 cleanup 금지 상태) — quarantine 레코드만 유지 |
   | 프로세스 종료 시 unknown 상태 | 운영자 가시 로그로 남긴다(조용한 소멸 금지). durable quarantine 레코드는 디스크에 잔존한다 |

   **이 수치는 아키텍트 제안이며 실측이 아니다.**
   *(제안 수치 — R{n} 검토 대상, 실측 후 조정 가능. 단 `30s 이하 TTL 금지`(§9 항목 7 · 락 7)는 유지)*

   *(C) 전환 반영:* ① episode 상한 초과의 도착지가 `commit_unknown` → **`presence_unknown`**으로
   바뀐다(§6.0.2) — 이 경로는 result를 **구성한 적이 없으므로** 늦은 단일 발행이 안전하다.
   ② **`present`가 시도 카운터를 리셋한다**는 규정을 명시했다 — 3차 검증 High-2로 지적된 누락이며,
   이는 **기질의 한계가 아니라 아키텍트 산출물 결함**이었다(§6.0 주의).
   ③ 수치 전체의 지위를 **운영 파라미터로 격하**했다(§6.6).

   *R43b 개정 (결정 ①② · 2026-07-21 · R43 H2 해소):* 구 표의 "unknown 상태 보존 10분. 만료 시
   log+counter 발행 후 **dispose**" 행은 이 락 본문·§6.6·락 13과 **정면 모순**이었다(R43 H2 — 두
   레인 독립 수렴; §6.6은 "dispose는 상수 만료로 유발되지 않는다"를 이미 명시한다). **만료 dispose를
   삭제**한다: (a) durable quarantine 레코드를 **진입 시점**에 기록하고(§6.7.1), (b) 10분 타이머는
   **재알림만** 유발하며(가역 행동), (c) in-memory 해제는 **운영자 ack 또는 프로세스 종료**
   (**+ `presence_unknown`의 늦은 단일 발행이 `relay_accepted`로 종결될 때의 자동 해제 — R43b-2차/R43c;
   append-only 자동-해소 레코드로 fold**)만 유발한다. 이로써 이 락 블록은 자기모순 0이 된다. **매체 = 브릿지-로컬 append-only JSONL**(§6.7.1
   — H6 해소; 대칭 위치 `recordResultDeliveryUnconfirmed` `:490`·`:506-522`는 휘발이라 재사용 금지).

   *변경 이유:* 구 문구는 "1 strike"만 정의하고 본문이 요구한 **`연속 2회 absent + grace`·present/unknown에서의
   reset·poll 간격·flight generation 일치를 락하지 않아** 구현별로 의미가 갈린다 — 첫 absent 뒤 RPC timeout을
   건너뛰고 두 번째 absent를 누적하거나 오래된 poll 응답을 새 flight에 적용하면 실제로 연속 확인되지 않은
   pane을 terminal로 합성한다(§2 Medium·§9-bis 8행).
   *근거:* 오류를 absent로 세면 **살아있는 pane을 죽인다** — 네트워크·부하 스파이크가 곧바로 오탐
   종료가 된다. (fable-advisor 자문, 2026-07-20)
   *출처:* codex 적대적 검증 2026-07-20 (`docs/reviews/PANEDEATH-CODEX-REVIEW.md`) 수용

9. **범위 판정 — 이번 PATCH 채택 범위 / wire exactly-once는 범위 밖 / ACK 보장 경계**

   **메커니즘 정본은 락 5다.** 이 항목은 그 메커니즘을 **참조만** 하고, 범위 판정과 보장 경계에 집중한다.

   락 5가 규정하는 unknown 상태(`send_unknown`/`presence_unknown`)와 strict ACK 판정은 로컬 변경으로
   저렴하므로 **이번 PATCH에 채택**한다.

   > **R43b 범위 개정 (결정 ③ · R43 H3 해소).** 구 문구는 `(cardId, seq, dispatchHandoffId)` 기반
   > **relay/tower idempotency**를 통째로 별도 PATCH로 밀었다. **분리선을 다시 긋는다.** **tower
   > apply-dedup(currency 게이트)은 이번 PATCH에 편입**한다 — 이는 relay 표면이 아니라 **tower-local
   > 적용 판정**(`applyCardResult` in `card-ops.ts` — host 패키지)이고, 비교할 `payload.dispatchHandoffId`
   > ↔ `task.handoffId`가 **이미 같은 함수 스코프에 존재**하기 때문이다(§6.7.3 — 새 저장소·전송 불요).
   > **각인과 판정자는 분리 불가**다: 각인 대상(payload)에 이미 현행 스칼라 판정자(`card-ops.ts:190-197`)가
   > 붙어 있고 각인은 tower inbox로 영속되므로 비가역이다(R43 H3). **별도 PATCH로 남는 것은 relay/wire
   > idempotency와 inbox reconcile뿐**이다(relay 표면 변경 필요).

   그것이 없는 동안 이 PATCH는 **wire exactly-once를 주장하지 않는다** — 최대 보장은 "committed 판정이
   거짓 양성을 내지 않는다 + tower가 stale attempt의 늦은 result를 조용히 삼키지 않는다"까지다.
   문서·테스트가 말하는 **"로컬 발행 1회"(local single-issue)** 는 이 브릿지가 같은 lifecycle에 대해
   result를 두 번 만들지 않는다는 뜻이며, **wire exactly-once와 별개 어휘**다.

   **ACK 보장 경계:**

   > ACK committed는 **relay-accept commit**이다 — durable relay의 단일 target inbox가 ACK 시점에
   > 수락했음까지만 증명하며, tower 관측·적용이나 향후 inbox 비퇴출(ephemeral crash · pending trim)을
   > 의미하지 않는다. **구현은 이 경계를 phase/타입 명명에 반영한다.**

   따라서 phase명을 `result_committed` → **`result_relay_accepted`** 로 개칭하고 commit 기록 시각을
   `relayAcceptedAt`으로 둔다(§6.1 union 및 이를 참조하는 전 지점 일괄 반영). 이름이 곧 불변식이 되어
   tower-delivery 오독이 코드 리뷰에서 자동으로 걸리게 한다.

   *(C) 전환 반영:* ACK 보장 경계는 **더 좁아진다.** `result_relay_accepted`는 이제
   **완료 커밋점이 아니라 “검증 요청이 relay에 수락됐다”는 알림 전달 확인점**이다. 완료 권위는
   브릿지에 존재하지 않으며(§6.0), 다음 phase는 `awaiting_human_verification`이다. 증거 명제표에서
   strict ACK가 `A+`를 갖는 명제는 **P4(“result가 relay 단일 inbox에 수락됐다”) 하나뿐**이고
   P7(의미상 완료)에 대해서는 `N`이다(§6.0-bis).
   또한 이 락이 요구하는 **“이름이 곧 불변식”** 원칙은 §6.7의 코드 결함 2건에도 적용된다 —
   전달을 추적하지 않는 `void sendFailedResult(...)`와 반환값을 버리는 `await sendResult(...)`는
   이름과 무관하게 ACK 경계를 지우므로, **락 9는 §6.7 요구사항 없이는 코드에서 성립하지 않는다.**
   *근거:* codex 검증 H3 — `sendResult()`의 `true`는 ACK 수신일 뿐 수신자 enqueue가 아니며, relay가
   `peer_unknown`도 정상 ACK로 반환한다. 문서 규칙은 이 프로젝트에서 4/4 위반됐고 코드 락은 3/3
   지켜졌다 — 경계는 산문이 아니라 이름에 실어야 한다.
   *출처:* 아키텍트 범위 판정 2026-07-20 / codex 2차 F7 · fable-advisor 판정 A (2026-07-21).

10. **start evidence + activity fence — 가짜 완료 차단**

    > `status=done` 단독은 완료 근거로 불충분하다. `sawWorking=true` 또는 R에서 동등하다고 명시 승인된 제출-성사 증거가 없으면 완료를 만들지 않고 `completion_without_start`로 fail-visible 처리한다. 또한 agentKind별 activity indicator가 남아 있으면 completion을 유예한다 — 공통/Grok `N command(s) still running`, Codex tail의 live `Working (<duration> …)`, Claude 현행 status/hookHint + 실측 live indicator. 패턴은 tail·line anchor와 TUI chrome 음성 케이스를 갖추며, **prompt echo 전체 검색은 금지**한다.

    *(C) 전환 반영:* 이 락이 막는 것은 이제 “가짜 `done` 커밋”이 아니라 **“가짜 완료 후보 승격”**
    이다. 자동 `done`이 폐지됐으므로 게이트 실패의 결과는 board `done` 오염이 아니라
    **불필요한 `needs_verification` 알림으로 사람의 검증 예산을 소모하는 것**이다. 락의 취지와
    구현 요구(패턴·음성 케이스·prompt echo 전체 검색 금지)는 **전부 그대로 유지**된다 —
    P1이 현행 센서로 확정 불가이므로(결합 규칙 1) 이 게이트는 authoritative가 아니라
    **오탐 억제 게이트**로 읽는다.

    *변경 이유:* 최초 관측 결함인 **213(초기 TUI 가짜 done)** 을 기존 락 1~9 중 **어느 것도 막지
    못한다** — 락들은 terminal 이벤트 이후의 arbitration을 다루는데, 213은 terminal 이전에
    **살아 있는 pane의 premature completion**이었다. 가장 실증된 결함이 락 밖에 있으면 구현자가
    §6.2 규칙 2·3을 "초안"으로 읽고 생략할 수 있다.
    *근거:* 213은 spawn 6초 뒤 `sawWorking=false` 상태에서 완료 판정이 났고(§4.1),
    `hasStillRunningIndicator()`는 Codex `Working (…)`를 결정론적으로 miss한다(§4.2).
    still-running 게이트(앞단)와 terminal fence(뒷단)는 대체 관계가 아니다(§4.3).
    *출처:* 독립 스켑틱(fable) 발견 2026-07-20 / 아키텍트 승격 판정 2026-07-21.

## 9-ter. (C) 전환 후 잔존 미해결 — 정직성 항목

(C) 채택으로 3차 검증의 지적 6건 중 **4건이 닫히고 2건이 남는다.** 남는 것을 숨기지 않는다.
**R43b-2차에서 codex H-new-1의 긴장 1건을 정직성 항목으로 추가 등재한다(항목 3).**

1. **두 번째 result 경로 — 미해결.**
   자동 `done` 폐지로 **done + failed 모순**은 사라진다. 그러나 **completion 후보의 `blocked`와
   terminal의 `failed`/`blocked`가 중복 발행**되는 경로는 남는다. 두 발행이 모두 board를 `blocked`로
   만들기 때문에 모순은 아니지만, **중복은 여전하다.** §6.7(단일 소유권 + ACK 추적)이 이를 겨냥한다.

2. **F5 · F6 — 무변화.**
   `terminalPending` 소비 규약과, `blocked` result 자체의 **ACK 유실·복구** 문제는 (C) 전환의
   영향을 받지 않는다. `done`을 `needs_verification`으로 바꿔도 **그 메시지가 도달했는지 모르는 것은
   똑같다.**

3. **"연속 absence = 결정적 부정 증거" 명명의 증거 등급 긴장 — 미해결 (R43b-2차 등재 · codex H-new-1).**
   락 11은 "동일 generation 결속 연속 absence"를 자동 `blocked`를 허용하는 **결정적 부정 증거**로 명명한다.
   그러나 §6.0-bis 증거 명제표에서 pane presence(`pane.list`)의 P5 등급은 `C±`(양방향 corroborating)이고
   가시성 지연에 증명된 상한이 없다 — corroboration의 반복이 그 자체로 authoritative가 되지는 않는다.
   이 긴장(명명 "결정적" vs 증거 등급 C±)은 **이번 PATCH 범위 밖**이다: bounded reconcile·terminal
   합성은 (C) 본체의 소관이고, 락 11은 fable-advisor 자문(2026-07-21) + codex 검증 `partially-correct`
   수용으로 **기결정**이다. 여기 **등재만** 하고 재론하지 않으며, **(C) 본체 PATCH의 R 게이트가 이 지점을
   재확인**한다(H-new-1의 수용부는 §6.7 흡수 상태·타이머 경로에 한정한 불변식 문구로 PLAN U3에 반영,
   기각부는 락 11 재론 불가).

**정확한 효과 한 줄:**

> **거짓 성공 제거, 중복·유실·고아 존속.**

(C)는 **correctness의 한 축(거짓 양성)만 닫는다.** liveness 축(유실·고아)은 §6.7의 durable alert +
ACK 추적 + reconcile이 별도로 닫아야 하며, 그 전까지 이 설계는 **“카드가 조용히 멈추지 않는다”를
주장하지 않는다.**

## 9-quater. (C) 전환 락 — 락 11·12·13

> **왜 락으로 올리는가:** 락 10 승격 때와 같은 논리다. **방향 전환의 본체가 락 밖 본문에만 있으면
> 구현자가 §6.0을 “초안”으로 읽고 생략할 수 있다.** 가장 실증된 결함(213 가짜 done)이 락 밖에 있어
> 락 10을 신설했듯, (C)의 본체도 락이어야 한다.
> *출처:* 아키텍트 승격 판정 2026-07-21 (문서 반영 워커 지적 수용).

11. **자동 `done` 커밋 금지 — 완료는 사람이 확정한다**

    > 브릿지는 카드를 자동으로 `done` 커밋하지 않는다. 완료 후보에 대해 브릿지가 내는 것은
    > **단일 소유자가 발행하는 멱등 `needs_verification`(board `blocked`) 하나**뿐이며, `done` 확정은
    > 사람(아키텍트)이 워킹트리 독립 검증 후 수행한다. 자동 `blocked`는 **결정적 부정 증거**
    > (permission block · 동일 generation 결속 연속 absence)에만 허용한다. 불확실한 status·scrape·
    > timeout은 **알림만** 유발하며 result 확정·`pane.close`·dispose를 호출하지 않는다. 자동 cleanup은
    > **사람 확정 + tower receipt 뒤에만** 한다.

    *변경 이유:* 결정적 완료 증거가 없는 기질에서 불변식을 적용하면 유도되는 해다. `CLAUDE.md` 규칙 7이
    이미 `card.done`을 자문 등급으로 격하해 두었으므로, 자동 판정의 정밀도를 올리는 것은 **이미 신뢰하지
    않는 신호를 다듬는 일**이었다.
    *경계:* 이 락은 **보류이지 영구 포기가 아니다**(§6.0.3) — 재도입 조건은 락 13.
    *출처:* fable-advisor 자문 2026-07-21 · codex 검증 `partially-correct` 수용.

12. **센서 전역 우선순위 금지 — 증거는 명제별이다**

    > `hookHint 우선` 같은 **전역 우선순위를 두지 않는다.** 각 센서는 §6.0-bis 증거 명제표가 정한
    > 명제(P1~P7)에 대해서만 등급화된 증거(`A`/`C`/`S`/`N`)를 제공한다. **비가역 행동은 해당 명제의
    > authoritative evidence와 동일 generation CAS를 모두 만족할 때만** 허용된다. hook 이벤트는
    > **완료 권위가 아니라 1급 관측 입력**이며, `Stop`은 P2(턴 종료)에 `C+`일 뿐 P7(의미상 완료)를
    > 확정하지 못한다. hook **부재는 `unknown`**이지 부정 증거가 아니다.

    *변경 이유:* `Stop`은 취소·에러 턴에도 발화하고, SIGKILL이면 발화 자체가 없으며, 발신자가 워커
    자신이라 오작동 워커를 완료 권위로 삼는 자기모순이 된다.
    *출처:* codex 장기자문 2026-07-21(가설 기각) · herdr 통합 등급 3단 수렴(등급 B+, 참조 구현이지
    명세는 아님).

13. **불확실성 2종 분리 + 상수의 지위**

    > `commit_unknown`을 **`send_unknown`**(result 전송을 시도했으나 ACK 불확실 — 멱등성 없이는
    > **재발행 금지**, 출구는 relay idempotency PATCH 또는 운영자)과 **`presence_unknown`**(result를
    > 구성한 적조차 없음 — 한 번도 보낸 적이 없으므로 늦은 **단일** 발행이 안전)으로 분리한다.
    > **타임아웃·재시도 횟수·grace·poll 간격은 correctness 근거가 아니다** — 운영 튜닝 파라미터이며
    > **가역 행동(알림·재평가·poll 가속)만** 유발한다. `present` 응답은 absent strike와 episode 시도
    > 카운터를 **모두 리셋**한다.
    >
    > **자동 `done` 재도입(락 11 완화)은** 카드·generation 결속 verifier 결과 · artifact hash + 테스트
    > provenance · durable/idempotent tower 적용이 **모두 갖춰진 좁은 경로에만** 허용한다.

    *R43b 정합 (결정 ①):* 두 unknown 상태는 **진입 시점에 durable quarantine 레코드 1건**을 남긴다
    (§6.7.1). `send_unknown`의 "출구 = relay idempotency PATCH 또는 운영자"는 유지되며, **10분 보존
    만료는 dispose가 아니라 재알림만** 유발한다(락 8 개정 — 결정 ②). durable 레코드가 진입 시점부터
    존재하므로 해제가 정보를 파괴하지 않는다.

    *R43b-2차 정합 (codex M-new-1 · claude M-new-1 수용):* quarantine 키는 **태그드**다 — `send_unknown`은
    `(cardId, dispatchHandoffId, seq)`, `presence_unknown`은 result를 구성한 적이 없어 seq가 없으므로
    `(cardId, dispatchHandoffId, "presence")`(§6.7.1). in-memory 해제 사유는 (a) 운영자 ack · (b) 프로세스
    종료 · **(c) `presence_unknown`의 늦은 단일 발행이 `relay_accepted`로 종결될 때**의 자동 해제다 —
    (c)는 §6.0.2가 규정한 `presence_unknown`의 안전한 자동 출구와 정합하며 `send_unknown`엔 적용되지 않는다
    (전송을 이미 시도했으므로 멱등성 없이 재발행 금지).

    *변경 이유:* 두 unknown은 안전 속성이 정반대인데 한 phase가 둘을 겸해 의미가 무너졌다. 그리고
    미실측 상수로 정확성 갭을 닫으려던 시도가 **3차 High-2를 직접 생성**했다(아키텍트 산출물 결함).
    실측으로도 못 닫는다 — 실측은 분포를 줄 뿐 상한을 주지 않는다.
    *출처:* codex 3차 검증 High-2 · fable-advisor 자문 2026-07-21.

## 10. 구현 게이트 체크리스트

> **[시대 표기 (R43d — codex H-new-1 잔여)]** 이 체크리스트는 v0.27.0(이 PATCH)과 **(C) 전환 본체**를
> 함께 나열한다. 아래에서 **자동 `done` 제거·`needs_verification` 발행·board `blocked` 전이·사람 확정
> no-close·phase registry·lifecycle `generation`** 항목은 **[(C) 본체]** 소관이며 **[v0.27.0 / pre-C]**
> 에서는 현행 `done` 발행·`sent && pane.close`가 유지된다(§7.1-0 · §6.7.2). v0.27.0이 실제로 잠그는
> 것은 **strict ACK 판정·`result_relay_accepted` 명명·issuer 중앙화·tower currency 게이트·durable
> quarantine** 항목이다.

- [ ] Smoke 0로 `pane.closed`/`pane.exited` 실 API shape·ordering 고정
- [ ] PLAN PATCH 작성, unknowns에 §9 반영
- [ ] Fable 5 R{n} approved
- [ ] **자동 `done` 발행 경로 제거 — 코드베이스 전역에서 브릿지가 `status="done"` result를 만드는
      지점 잔존 0건((C) 전환 · §6.0)**
- [ ] **[(C) 본체]** **완료 후보 → `needs_verification`(`status="failed"` + `reason="needs_verification"`) 발행 +
      board `blocked` 전이 구현. 사람 확정 경로(`awaiting_human_verification` → tower receipt) 배선**
- [ ] **[(C) 본체]** **`pane.close`가 ACK가 아니라 사람 확정 + tower receipt 뒤에만 호출됨을 잠근다(§6.0.1)**
- [ ] **증거 명제표(§6.0-bis)를 구현 판정의 참조 정본으로 사용 — `hookHint 우선` 등 전역 우선순위
      분기 잔존 0건**
- [ ] B phase registry + terminal fence 구현 — union에 `send_unknown`·`presence_unknown`·
      `awaiting_human_verification` 포함, `terminalPending`은 phase가 아닌 별도 필드(§6.1)
- [ ] lifecycle `generation` 발급·결속 구현 + 모든 async poll/TTL 콜백의 캡처 token 재검증(락 8)
- [ ] phase명 `result_relay_accepted` / 시각 `relayAcceptedAt`으로 명명 반영 — `result_committed`
      잔존 0건(락 9)
- [ ] strict ACK 판정(`status ∈ {queued, delivered}` ∧ `recipientCount=1`) + 3분기 종결
      (성공 / 명시적 거부 / `send_unknown`) 구현(락 5)
- [ ] **`commit_unknown` 분리 완료 — `send_unknown`(재발행 금지) / `presence_unknown`(늦은 단일
      발행 허용) 식별자 잔존 혼용 0건(§6.0.2)**
- [ ] **발행 단일 소유권 = dispatch-scoped result issuer 신설(§6.7.2) — handoff 수신 시점
      `(cardId, dispatchHandoffId)` 키 생성, `:850` 특례(cardId 열화 → dispatchHandoffId 단독 키),
      성공·실패·Flight-less 3경로(`:850 :1114 :1204`) 전부가 이 issuer를 유일 통과점으로 삼음.
      seq 소유 주체 Flight→issuer(채번 규약 무변경) · `cardSeq`(`:575`)는 attempt축 소비 3곳
      (`:1141 :1192 :1220`)만 남긴 채 유지(삭제 금지 — 회귀)**
- [ ] **전달 추적(§6.7) — `bridge-runtime.ts:2160`·`:2207`·`:2222` fire-and-forget 제거 ·
      `sendResult:2423`의 ACK 봉투 소비(`boolean` 시그니처 교체) · `finishCard:2349` 실패 경로 관측
      누락 보강. (자동 reconcile 회수는 범위 밖 — §6.7 요구 4)**
- [ ] **tower currency 게이트(§6.7.3) 편입 — `applyCardResult`에서 `payload.dispatchHandoffId` ↔
      `task.handoffId` 대조: 불일치=stale drop(관측 로그+counter) · 일치=per-dispatch seq dedup ·
      부재=현행 스칼라 폴백. `findTask` miss 시 dispatchHandoffId 스캔 폴백(성공=seq dedup 직행 ·
      miss=`handoff_unmapped_or_stale` 관측 · 중복 매치=fail-visible drop). (R43c — L-new-3: "브릿지
      재시작 seq 리셋 유실 해소"는 철회 — 재dispatch notes clobber로 last_seq 제거 · 재시작 재전송은
      §9-6 out-of-scope)**
- [ ] **durable quarantine 레코드(§6.7.1) — 브릿지-로컬 append-only JSONL, unknown 상태 **진입
      시점** 기록, **태그드 판별 유니언 키**(R43c — `send_unknown`=`(cardId, dispatchHandoffId, seq)` ·
      `presence_unknown`=`(cardId, dispatchHandoffId, "presence")` · seq 유무로 뭉개지 않음),
      메타데이터만(본문 금지), 보존=운영자 ack까지, 미해소 카운트 표면화. durable alert와 동일
      1건(이중 기록 0건). `recordResultDeliveryUnconfirmed`(휘발) 재사용 0건**
- [ ] Codex Working pattern + start evidence gate 구현(락 10) — prompt echo 전체 검색 금지,
      음성 케이스 유닛 포함
- [ ] bounded reconcile 구현(한 번의 miss로 terminal 판정 금지) — 초기 +1s · poll 5s · grace 3s ·
      연속 2회 · **`present` 시 strike·시도 카운터 동시 리셋** · episode 최대 12회(≈60s) 초과 시
      `presence_unknown`(락 8 · §6.6)
- [ ] unknown 상태 진입 시 durable quarantine 1건 + 10분 타이머는 **재알림만**(만료 dispose 0건 —
      결정 ②) + 해제는 운영자 ack·프로세스 종료 **· `presence_unknown`의 늦은 단일 발행 `relay_accepted`
      자동 해제(c) — append-only 자동-해소 레코드 fold(R43c)** + 프로세스 종료 시 운영자 가시
      log/counter(조용한 소멸 0건)
- [ ] **미실측 상수가 가역 행동만 유발함을 테스트로 잠근다 — 상수값을 바꿔도 발행 status·cleanup
      여부가 불변(§6.6)**
- [ ] unit/integration §7.1 green (특히 0의 `done` 0건, 4·5·6의 `result_sending` 진입 여부 분기)
- [ ] Mac Smoke 1 green
- [ ] WSL/VPS 한 노드 Smoke 1 핵심 경로 green
- [ ] 기존 M-1·L-2·0.23.4·0.23.7·CONV_SPEC 회귀 green
- [ ] HANDOFF/todo 동기화는 구현 웨이브에서 수행

## 11. 개정 이력

**2026-07-21 통합 패스** — codex 2차 검증(High 1·Medium 7) + 독립 스켑틱 지적을 D1~D10으로 반영했다.
락 10 신설, 락 5·9 권위 정리, 본문 §5~§8 9개 지점 전이표 통합, cadence 수치 확정(제안).

**2026-07-21 (C) 전환** — 자동 `done` 폐지, 증거 명제표 채택, `commit_unknown` 분리, 상수 지위 격하.
근거 = codex 3차 검증 + 장기자문 2회 + fable-advisor 자문 2회. 권고를 **B → B′**로 옮기고(B의 종료
펜스·tombstone·generation 결속은 유지, result 발행 부분만 대체), §6.0·§6.0-bis·§6.6·§6.7·§6.8·§9-ter를
신설했으며, §0-bis 요약 표 · §0 요약 · §5 선택지 표와 B 상태도 · §6.2 규칙 · §6.3 케이스 표 · §6.4 ·
§7.1 테스트 · §7.2 스모크 표 · §8 R 항목 · §9-bis 락 1·5·6·7·8·9·10 · §10 체크리스트를 전건 갱신했다.
herdr 등급 상회 금지 원칙은 과도 판정으로 **철회**하고 명제 coverage 기준으로 대체했다(§6.8).

**2026-07-21 R43b 개정** — PLAN v0.27.0이 R43에서 reject됐다(원장 `docs/reviews/PANEDEATH-R43.md`,
정본·수정 금지 · 2레인 독립 수렴). 아키텍트가 fable-advisor 자문 + 코드 실측(evidence-r43b)을 거쳐
결정 ①~⑩을 확정했고, 이를 설계에 반영했다: **(①)** 락 8의 만료 dispose를 삭제하고 unknown 상태
진입 시점 **durable quarantine 레코드**로 이관(§6.7.1 · 락 8 표 개정 · 락 13 정합 — R43 H2·H6 해소;
매체 = 브릿지-로컬 append-only JSONL, 타이머는 재알림만). **(③)** **dispatch-scoped result issuer**
신설(§6.7.2)로 Flight-less 3경로를 포함한 모든 result 발행을 중앙화하고 seq 소유 주체를 Flight→issuer로
이전(전제 P), **`cardSeq` 삭제 요구를 제거**(전제 Q — attempt 카운터, 소비처 4곳). **tower currency
게이트**(§6.7.3)를 락 9 범위에 편입(tower-local 판정 — R43 H3·H4 해소). **(④)** 가드 4곳→**5곳**
(`:2019` 추가), `disposeCardFlight` 순서 역전 대상 **15곳**(아키텍트 직접 재실측 확정 — `:2219` 포함; 분류 (a)완료 6·(b)실패 4·(c)poll 5) 명시
(락 5 정합). **(⑨)** durable alert 대칭 위치 `recordResultDeliveryUnconfirmed`(`:490`·`:506-522`)는
휘발이라 재사용 금지 명기. R43 드리프트 표 반영(발행 호출지점 17→**18** 등). 자동 reconcile 회수(§6.7
요구 4)는 범위 밖으로 명시. **본 개정은 R43 원장을 수정하지 않는다.**

**2026-07-21 R43b-2차 개정** — R43b 개정본(커밋 `5cd070b`)을 2레인이 독립 검증했다(claude 레인
pending-revision · codex 레인 reject; 원장 `docs/reviews/PANEDEATH-R43B.md`, 정본·수정 금지). R43 지적
12건 해소는 양 레인 수렴이나 신규 결함이 났고, 아키텍트가 판정(pending-revision 채택)해 국소 정밀화로
반영했다: **(H-new-3 ≡ H-new-1)** §6.7.3에 **`dispatchHandoffId` 스캔 폴백 + cardId 교차 검증** 신설 —
`:850` 열화 cardId가 `findTask` miss로 조용히 strand되던 것을 닫아 "유일 통과점"이 타워측에서도 성립
(§6.7.2 :850 특례 각주 동기화 · D6 완료 판정에 폴백 테스트 추가). **(H-new-2)** 락 5·§6.7.2에
**issuer acquisition = 보편 발행 권위** 각주 — 락 5 본문 "CAS 승자만 sendResult" 는 Flight-backed 한정,
pre-Flight 실패는 issuer 단독 acquire. **(H-new-1 부분)** 불변식 전역 주장을 흡수 상태·타이머 경로로
한정(PLAN U3), 락 11 재론은 기각하되 긴장을 §9-ter 정직성 항목 3으로 등재. **(M-new-1)** §6.7.1
quarantine 키 태그드화(`presence_unknown`=`(cardId, dispatchHandoffId, "presence")`) + 해제 사유 (c) 추가
(락 8 표·락 13 동기화). **(M-new-2 · H6 partial · L-new-1)** §6.7.1 내구 세부 락 — 0600 · 레코드당 fsync ·
malformed tail 관용 · 기동 replay · ack append-only fold · append/fsync fail-visible(compaction은 운영
후속). **(M-new-3)** §6.7.2 전이표에 `logicalKind` 도입 + pre-Flight initial failed 직행. **(L-new-3)**
§6.7.3 (i)(iv)의 "seq 리셋 유실" 서술 철회 — board 재dispatch가 `dispatchCard:112-117`의 notes clobber로
last_seq를 제거함을 코드 실측 확인, 게이트 근거를 stale-attempt 거부로 한정. 좌표 정정(설계 측 없음 —
PLAN D5·D7 blocked 게이트 `:452`→`:529` 등은 PLAN 개정). High 4건이라 **R43c 재검증 필수(author-close
불가)**. **본 개정은 R43·R43b 원장을 수정하지 않는다.**

**2026-07-21 R43c 3차 개정** — R43b 2차 개정본(커밋 `2b5a951`)을 R43c 2레인이 독립 검증했다(claude
레인 **pending-revision** — 신규 High 0·Med 1·Low 3 · codex 레인 **reject** — High 1·Med 3·Low 3;
원장 `docs/reviews/PANEDEATH-R43C.md`). R43b 신규 지적 10건 해소는 양 레인 수렴(신규 High 0)이고,
신규 지적 전원이 **문면·전파·표 분할**(설계 재론 0)이라 아키텍트가 **pending-revision**을 채택해 3차
정밀화로 반영했다: **(codex H-new-1 ≡ claude Med-1 — 수렴)** §6.7.2 전이표·D4·락 5 (C) 서술에 **시대
매개변수화** — 전이 구조는 시대 무관, `initial` 성공형 status만 매개변수([v0.27.0]=`done` · [(C)
본체]=`needs_verification`(= `status="failed"`+`reason="needs_verification"` 인코딩, 신규 스키마 값
아님)); §7.1-0 "done 0건"을 (C) 본체 게이트로 명시. **(codex M-new-3)** §6.7.2 전이표 1행을
`initial`(성공형)/`initial`(failed형)으로 **분할** — 성공형만 rejection 엣지, failed형은 비수락 ACK가
`send_unknown` 직행. **(codex M-new-1)** PLAN D5 CAS를 **`flightSideEffectOwner` 상당**으로 개명 +
접속 규칙(Flight-backed = lifecycle CAS ∧ issuer acquire · Flight-less = issuer acquire 단독). **(codex
M-new-2 ≈ claude Low-1)** 태그드 **판별 유니언 키·해제(c)**를 파생 표면 전부에 전파(§6.7.1 메타데이터
서술 · §10 체크리스트 · 락 8 정합 note · PLAN U2) + 자동-해소 append-only fold + presence→send
supersede. **(codex L-new-1 ≈ claude Low-3)** §6.7.3 폴백 성공 경로의 불일치 게이트 **도달 불가(항등)**
명시 — 폴백 성공=seq dedup 직행 · miss=`handoff_unmapped_or_stale`. **(codex L-new-3)** §10의 "브릿지
재시작 seq 리셋 유실 해소" 잔재 삭제. **(codex L-new-2)** PLAN `:113` 좌표 `2423-2440`→`2408-2434`.
**(claude Low-2)** PLAN D1-b 회귀 게이트에 `:529` 편입. **(codex UNVERIFIED)** §6.7.3에 중복
handoffId 매치 **fail-visible drop** 1줄. 신규 High 0이라 **R43d 필수(경량 델타 검증 — 잔여가 문면
전파였으므로 codex 단일 레인)**. **본 개정은 R43·R43b·R43c 원장을 수정하지 않는다.**

[PANE-DEATH-DESIGN-DONE] cause=uncertain options=4 recommend=B′-자동done폐지 rgate=needed
