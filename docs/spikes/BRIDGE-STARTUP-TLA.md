# BRIDGE-STARTUP-TLA — 카드 시작 구간 status 유실 (TLA+ 스파이크)

> 상태: **스파이크 · 문서 전용 · 제품 코드 무변경.** 계기: Astra 0215 M#2 · 오너 지시 2026-10-23 ("TLA+로").
> **Round 3** (Astra 0222 FAIL: High 1 + Medium 3 반영 — §7.2). 코드 좌표는 모두 `main` @ `56a171a` 기준.
> **round-3 TLC 실행 기록:** 2026-10-23, TLC 1.8.0 (`TLC2 Version 2026.10.20.183001 (rev: d2e1472)`) · `tla2tools.jar`
> sha256 `5bd7b64d…b1e2` · Java 17 (Oracle 17.0.6, aarch64) · `-deadlock -workers 4` · **47 cfg 전부**, 아키텍트 실행, 각
> ≤ 3 s, 로그는 저장소 밖(scratchpad `runs3/<cfg>.log`). **판정 47/47이 round-3 수기 예상과 일치**(§3.5) — 반례 경로가
> 예상과 다른 cfg는 §3.5에 이유와 함께 적었다(결론을 바꾸는 것은 없음). 활성 위반(exit 13) cfg는 모두 "complete state
> space" 검사 뒤 보고됐으므로 같은 cfg의 불변식은 전체 도달 공간에서 성립한다. round-3 모델은 `ScrapeErr`·`AgentDone`·
> `Recon` 비교 모드를 더했고 기존 cfg도 `ScrapeFail = TRUE`이므로 round-2 distinct 수와는 직접 비교하지 않는다.
> **round-2 TLC 실행 기록(round-2 모델):** 2026-10-23, TLC 1.8.0 (`TLC2 Version 2026.10.20.183001 (rev: d2e1472)`) ·
> `tla2tools.jar` sha256 `5bd7b64d…b1e2` · Java 17 (Oracle 17.0.6, aarch64) · `-deadlock -workers 4` · 30 cfg, 아키텍트 실행,
> 로그는 저장소 밖(scratchpad `runs2/<cfg>.log`). 종료 코드 0 = No error · 12 = 불변식 위반 · 13 = 활성 속성 위반.
> round-2 판정은 §3 표의 "round-2 TLC" 열에 남긴다(모델이 바뀌었으므로 참고용) — **겹치는 30 cfg 모두 round-3 판정이
> round-2와 같다.** 모델 확인 ≠ 코드 확인.
> **herdr 버전:** 이 Mac의 herdr는 **0.9.5**(`herdr --version`, 아키텍트 확인)다. 이 문서의 버전 한정 근거는 모두 그보다
> 옛 버전이다 — replay 부재 관측 = **0.7.4 / protocol 16**, 이벤트 스키마(단조 마커 부재) = **0.7.5 스키마 픽스처**.
> **0.9.5에서는 어느 것도 확인하지 않았다**(§0.1-5).

## 0. 아키텍트 판단용 요약 (round 3 — TLC 47 cfg 실행, 판정 전부 예상 일치)

- **현재 설계에서 입증(모델 범위):** 다른 카드 subscribe 한 번이나 끊김 한 번이 `idle`을 버리면 **영구 정체 · 실패 보고 없음**(C5·C8); 같은 창에서 재주입 이중 실행(C6)·오실패(C7); 기동 status면 가짜 완료(C9·C10); `done`이 "프롬프트 뒤"면 가짜 완료(C15).
- **최소 수정 후보(검사 범위에서 통과, 최소성 미입증):** F1' make-before-break **+ drain** · F2' **연속 `agent.get` 폴링 + `qdirty` 폐기** · F3' 프롬프트 펜스 = F1 — O1·D1+QFail·Replay·Stall·`done=work`에서 검사 속성 통과(F1·F7·F13·F15·F31).
- 조각별 필요성(TLC): 폐기 없으면 가짜 완료(F25) · 연속성 없으면 정체(F27·F29) · drain 없으면 이중 실행(F18)·오실패(F4) · 1회 조회는 가짜 완료(F24)·정체(F10).
- **수용 한계(잔여):** 끊김 창에 `W`·`I`(또는 `W`만) 유실 → 이중 실행(F8·F20·F21) 또는 `inject_unconfirmed`(F9) · ACK~도착 창 기동 쌍 가짜 완료(F12·F16) · stall + 기동 쌍 프롬프트 없는 완료(F14) · `LatencyBound` 없으면 오실패(F2)·이중 실행(F17).
- **결론의 가정:** `LatencyBound` · `Replay = FALSE`(TRUE면 현재 설계 정체도 풀림, C11) · `Drain`은 herdr가 클라이언트 EOF에 구독을 닫는다는 전제 · `done`은 `never` 또는 `work` · 프롬프트당 working→idle 1회 · `MaxOthers`/`MaxDrops`/`MaxBoot` ≤ 1 · `ScrapeFail = TRUE`는 판정을 바꾸지 않았다.
- **라이브 herdr 0.9.5 확인 필요:** (a) 클라이언트 EOF → 구독 종료(drain) · (b) 프롬프트 전 기동 `working`/`idle` 보고(C9·F12·F14) · (c) status backlog replay · (d) `done` 시점(C15·F30) · (e) 이벤트 seq/revision(있으면 `qdirty` 대체).

### 0.1 상세 (round-3 TLC 반영)

1. **현재 설계(TLC 입증, 모델 범위):** 소켓 교체(다른 카드 subscribe)나 끊김이 `idle`을 버리면 카드가 **영구 정체,
   실패 보고 없음**(C5·C8). 같은 창에서 재주입 이중 실행(C6)·`inject_unconfirmed` 오실패(C7 — 반례엔 재주입 이중 실행도
   함께 나옴)도 난다. 기동 status가 있으면 프롬프트 전·ACK 전에도 가짜 완료(C9·C10). 정체는 `Replay = TRUE`(C11)나 운영자
   `pane.closed`(C13)로만 풀린다. `done`이 "프롬프트 이후"에만 와도 실제 working→idle 전이면 가짜 완료(C15).
2. **검사 범위에서 통과한 후보 집합(최소성 미입증):** F1' make-before-break **+ drain** + F2' **연속 폴링 + `qdirty` 폐기** +
   F3' 펜스. 이 조합(F1)만이 소켓 교체에서 검사한 5개 속성을 모두 통과했다(round-3 TLC, 5467 distinct). 비교한
   변형 안에서 각 조각의 필요성은 다음처럼 읽힌다(§3.4 표 — 전부 TLC 확인):
   - **폐기 규칙:** 폐기 없는 연속 폴링(`pollraw`)은 **오래된 idle 스냅샷으로 가짜 완료**(F25) — 폐기는 *안전*에 필요.
   - **연속성:** 취소된 완료만 다시 조회하는 `restart`는 소켓 간 순서 역전(F27)·오래된 `working` 스냅샷(F29)에서 정체,
     같은 상수의 `pollraw`는 통과(F26) — 연속 조회는 *활성*에 필요.
   - **drain:** 없으면 `CompletesWhenAgentCompletes` 위반(F4)과 **재주입 이중 실행**(F18 — Astra 0222 #1).
   - 이 밖의 조합(예: 1회 조회 + 폐기, 순서 복원 버퍼)은 검사하지 않았다. "최소·유일"은 주장하지 않는다.
3. **수용 한계(잔여):** 끊김 창에 `W`·`I`가 모두 떨어지면 재주입 이중 실행(F8·F20·F21) 또는 명시적 `inject_unconfirmed`(F9).
   서버 ACK 쓰기 ~ 프롬프트 도착 사이 기동 쌍은 가짜 완료(F12·F16). stall + 기동 쌍은 프롬프트 없는 완료(F14 — 반환 시
   보류 작동 경로, §3.5). `LatencyBound` 없이는 수정안도 오실패(F2)·이중 실행(F17). **drain을 빼면** 정상적인 구독 교체만으로
   이중 실행(F18 — 실제 반례는 `W` 하나만 잃어도 충분).
4. **모든 결론의 가정:** `LatencyBound`(4 s가 프롬프트→`working` 지연을 넘김) · **herdr `done`은 실제 working→idle 뒤에만
   온다**(`DoneWhen = "work"`; "프롬프트 뒤"로는 부족 — C15·F30) — 그 밖의 완료 안전 판정은 모두 **`done` 완전 제외**
   (`DoneWhen = "never"`) 조건부 · agent는 프롬프트당 working→idle 1회(작업 중간 idle→working 재진입 미모델) ·
   `MaxOthers ≤ 1`·교란 ≤ 1인 유계 시나리오. scrape 실패 분기는 round 3부터 모든 cfg에 포함(`ScrapeFail = TRUE`).
5. **라이브 herdr 확인 필요 — 대상 버전 0.9.5:** (a) 구독 연결에 클라이언트 EOF를 보내면 herdr가 구독을 내리고 닫는가(drain
   전제) · (b) `interactive_ready` 뒤·프롬프트 전 `working`/`idle`을 보고하는가(C9·F12·F14) · (c) 새 구독자에게 status
   backlog를 replay하는가(0.7.4/16에선 안 함, 클라이언트 기대 protocol 17, **0.9.5 미확인**) · (d) `done` status를 언제
   내는가 — 특히 프롬프트 반환 뒤 실제 working→idle 전에 낼 수 있는가(C15·F30) · (e) `pane_agent_status_changed`에 seq/
   revision이 실렸는가(0.7.5 픽스처엔 없음 — 실리면 `qdirty` 근사를 대체).

## 1. 코드가 실제로 하는 일

### 1.1 카드 시작 순서 (`packages/host/src/bridge-runtime.ts`)

| # | 단계 | 좌표 | 비고 |
|---|---|---|---|
| 1 | `seq` 계산 · `agentTarget` 생성 | :1909-1923 | 표현 불가 이름 → `agent_name_unrepresentable` 실패 |
| 2 | (opt-in) hook listener 기동 | :1933-1977 | claude + `hookSensor`일 때만 |
| 3 | `spawnWorkerAgent` → `agent.start` | :1983 → :1632 → :1713 | `launch_pending`이면 `agent.get` 폴링으로 `interactive_ready` 대기(`herdr-client.ts:415-450`) — **agent는 이미 살아 있고 status를 낼 수 있다** |
| 4 | `Flight` 생성(`sawWorking: false`) · `flights.set` | :2006-2026 | |
| 5 | `herdr.eventsSubscribe([{pane.agent_status_changed, pane_id}])` (ACK까지 await) | :2030 | 실패 → `events_subscribe_failed` (:2031-2050) |
| 6 | `injectPromptAndSubmit` = `agent.prompt` 1회 | :2058 → `herdr-client.ts:668` | 비-stall 실패 → `prompt_inject_failed`; **`agent_prompt_stalled`는 불확실 제출로 계속 진행** (:2060-2062) |
| 7 | `verifyInjectOrRetry` | :2082 → :2618 | 마감 = **벽시계** `Date.now() + waitMs` (:2638) |

### 1.2 이벤트 소켓 (`packages/host/src/herdr-client.ts`)

- RPC(`request`, :302-361)는 호출마다 **별도 소켓**(:309)을 연다. `agent.get`도 그렇다 → 응답은 이벤트 소켓의 push와
  **독립적으로 순서가 정해진다**.
- `eventsSubscribe`(:683)는 구독 목록에 **병합** 후 `openEventConnection`(:726)으로 **새 소켓**을 연다(실소켓은 열린
  구독 연결에 두 번째 요청을 받지 않음, :676-679).
- `openEventConnection`은 **먼저 옛 소켓을 `destroy()`** 하고(:738-746) 새 소켓을 연다(:752). 옛 소켓 버퍼의 미독
  데이터도 버려진다. 따라서 **모든 `eventsSubscribe` = 진행 중인 모든 카드의 유실 창**(옛 소켓 파괴 ~ 새 소켓 서버 등록).
- **ACK·활성화·push 순서.** 새 소켓에서 서버는 구독을 등록(활성화)한 뒤 ACK를 쓴다. 등록 ~ ACK 쓰기 사이에 나온 push는
  같은 바이트 스트림에서 **ACK보다 앞**에 오고, `parseNdjsonLines` 루프가 **동기로** `onEvent`에 넘긴다(:807-830 —
  `settled` 전이라도 `isEventPush`면 처리). ACK 줄은 `finishLocal()` → deferred resolve → `eventsSubscribe` await의
  continuation(프롬프트 송신)은 **마이크로태스크**로 그 뒤에 돈다. 즉 **ACK 앞의 push는 프롬프트 송신 전에 반드시
  처리된다**. ACK 뒤의 push는 송신 뒤 처리될 수 있다.
- 공유 deferred(:705-724): 다른 카드의 `openEventConnection`이 끼면 세대가 바뀌고, 대기 중인 subscribe는 **새 세대의 ACK로**
  resolve된다(:764-776). ACK 전 close → reject(:853-858) → 대기 카드는 `events_subscribe_failed`.
- 수립된 소켓이 끊기면 `onClose` 후 백오프 재연결(:860-888, 500 ms → 최대 5 s). 그 사이 이벤트 유실.
- 브리지는 `HerdrClient`를 `onClose`/`onError` 없이 만든다(`bridge-runtime.ts:1025-1027`) → **재조정 경로가 없다.**
- **단조 마커 없음(0.7.5 픽스처 기준).** `pane_agent_status_changed` 이벤트에는 seq·revision·시각이 없다(`docs/spikes/
  fixtures/herdr-v0.7.5/schema.json:640-669`, 요청측 :2007-2026). `PaneInfo.revision`(:778, :844)은 있으나 이벤트에 실리지
  않으므로 "이 스냅샷이 저 이벤트보다 새것인가"를 herdr 정보로 비교할 수 없다. **로컬 herdr 0.9.5의 스키마는 미확인.**

### 1.3 브리지가 status에 반응하는 모든 곳

| 반응 | 좌표 | 동작 |
|---|---|---|
| 이벤트 진입 | `onHerdrEvent` :2758 | flight·convFlight 둘 다 miss면 `recordFlightMapMiss`만(:2776-2782) |
| `pane.closed` | :3091-3119 | 전역 구독(:1056); 카드 → `pane_closed` 실패. terminal 이벤트는 신규 구독자에 replay됨(traps) |
| `working` | :3127-3143 | `sawWorking = true`; **`stillRunningDeferral`이 서 있으면 취소**(:3130-3134) |
| `blocked` | :3146-3164 | `agent_blocked` 실패 |
| `done` 또는 (`idle` ∧ `sawWorking`) | :3165 | **`done`은 `sawWorking` 없이도 완료 계열** |
| └ deferral 중 | :3187 | no-op |
| └ 아니면 | :3192-3193 | `stillRunningDeferral = true` 후 `beginCardCompletion` |
| 완료 처리 — scrape 성공 | `beginCardCompletion` :2890 | **settle scrape를 await**(:2893) → `guardFlightCompletion(requireDeferral)`(:2918) — 그 사이 `working`이 deferral을 지웠으면 **결과 없이 return** |
| 완료 처리 — **scrape 실패** | catch :2894 | `guardFlightCompletion`을 **`requireDeferral` 없이** 검사(:2898 — flight 동일·소유자 없음·terminal 미대기만) → `proposeCardVerification`(:2912, 완료 계열 제안). **`working`이 deferral을 지웠어도 완료로 진행** |
| still-running 폴링 | :2953 | `requireDeferral` 가드(:2965); 읽기 실패 catch도 `requireDeferral`(:2980) — 취소 존중 |
| 제출 검증 | `verifyInjectOrRetry` :2618 | 벽시계 `waitMs`(4 s) 동안 `sawWorking` 폴링 → 프로브 → miss면 1회 재주입(:2691), 그 외 CR nudge(:2702); 소진 → `inject_unconfirmed`(:2719-2747) |
| 상태 조회 폴백 | — | **없다.** `agent.get`은 기동 준비에만(:427), `agentWait`(:575) 미사용 |
| 카드 전체 타임아웃 | — | **없다.** |

## 2. 모델

파일: [`docs/spikes/tla/bridge-startup/`](./tla/bridge-startup/). 두 모듈이 같은 뼈대를 공유한다.

### 2.1 시퀀스 (둘 다)

```text
Spawn(agent boot) → Register(flight) → Subscribe(새 소켓 conn)
  → SrvReg(서버 등록; Replay면 backlog 먼저) → [push…] → SrvAck(ACK 쓰기) → [push…]
  → ConsumeAck = continuation: (Fixed: F3' 펜스) + prompt 송신(bpc inflight)
  → PromptArrive → SubmitReturn | SubmitStall(Stall) → verify(wait) …
status push(W/I/D): ConsumeStatus/ConsumeCur/ConsumeOld → Gate
완료: (I∧sawWorking ∨ D)∧¬deferral → deferral:=T, cpc:=scrape → (W가 오면 deferral:=F)
  → ScrapeDone(성공): deferral면 completed, 아니면 return
  → ScrapeErr(실패, ScrapeFail): Alive면 completed (deferral 무관 — :2898)
```

### 2.2 모델 요약

- **`BridgeStartup.tla` — 현재 설계.** 소켓 1개(`sk` conn/reg/gone + FIFO `stream`, 메시지 `W`·`I`·`D`·`ack`).
  `Subscribe`·`OtherSubscribe`·`Reconnect`는 옛 소켓을 버퍼째 파괴하고 새 소켓을 연다. 서버 등록(`SrvReg`)과 ACK
  쓰기(`SrvAck`)는 별개 단계이고, 등록 후 push는 ACK 전이라도 스트림에 들어가 **FIFO 순서로** 처리된다.
  완료는 비원자: `Gate`가 deferral을 세우고 `cpc = "scrape"`. scrape 성공(`ScrapeDone`)은 `requireDeferral` 가드라
  `working`이 취소했으면 결과 없이 return. **scrape 실패(`ScrapeErr`, round 3)는 가드에 deferral이 없어 취소돼도 완료**
  (:2898/:2912). 검증 마감은 벽시계 이벤트(`VerifyTimeout`)이고 `LatencyBound`일 때만 `Plausible` 가드가 붙는다.
  `Stall`이면 `agent_prompt_stalled` 반환(프롬프트 지연 도착 또는 영구 유실 — 재주입만이 살림). `Replay`면 서버
  등록 시 이 pane의 status backlog를 먼저 보낸다. `CloseFair`면 운영자가 결국 pane을 닫는다(`pane.closed` → 실패).
- **`BridgeStartupFixed.tla` — 수정안 F1'+F2'+F3'.** 소켓 2개: 현재(`sk`/`stream`)와 이전(`ok`/`oStream`).
  - **F1' make-before-break:** 새 소켓을 열 때 수립된 현재 소켓을 이전 소켓으로 살려 둔다. 겹침 동안 두 소켓이 각자
    FIFO로 **같은 status 복사본**을 받고, 브리지는 두 스트림을 **임의로 교차**해 처리한다.
    새 ACK 처리 시: `Drain = TRUE`면 이전 소켓을 half-close(`end()`)하고 서버가 닫을 때까지 읽는다(`drain → flush →
    none`) — 서버에 쓰인 바이트는 잃지 않는다. `Drain = FALSE`면 미독 버퍼째 파괴.
  - **F2' 비동기 `agent.get`:** `q` = none → sent(요청) → snap(서버가 **그 시점** `ast`를 찍음, 응답 비행 중) → 적용 또는
    실패(`QFail`). 이벤트 처리와 독립 순서. 스냅샷은 working/idle만 보고(`done` 없음). `Recon` 모드:

    | `Recon` | 언제 조회 | 응답 적용 | 출처 |
    |---|---|---|---|
    | `"none"` | 안 함 | — | 비교 |
    | `"once"` | 끊긴 소켓 재ACK 후 1회 | 그대로 | round-1 F2 |
    | `"restart"` | `once` + 반환 뒤, `working`이 deferral/보류 완료를 지운 뒤 재시작 전까지 계속 | 그대로 | **round 3 비교** |
    | `"pollraw"` | 반환 뒤 flight가 살아 있는 동안 계속 | 그대로(**폐기 없음**) | **round 3 비교** |
    | `"poll"` | 반환 뒤 flight가 살아 있는 동안 계속 | 요청 뒤 status 이벤트가 처리됐으면(`qdirty`) **폐기** | F2' 재설계 |

    herdr에 단조 마커가 없어서(§1.2) "응답이 마지막 이벤트보다 새것"을 `qdirty` 규칙으로 근사한다.
  - **F3' 프롬프트 펜스:** ACK continuation에서 송신 직전 `sawWorking`·보류 완료 리셋. RPC 반환 전(정상·stall 모두) 본
    완료 계열 status(`idle`∧`sawWorking`, 또는 `done`)는 반환 시점까지 보류. round 3에서 `done`도 같은 펜스·보류에 넣었다.
- **herdr `done` (round 3, 두 모듈):** agent가 `done`을 최대 1회 낸다. `DoneWhen = "never"`(round-2와 같음 — `done` 완전
  제외) · `"prompt"`(프롬프트 도착 후 아무 때 — **반환 뒤·실제 working→idle 전 포함**) · `"work"`(실제 프롬프트 후
  working→idle 뒤에만). `done`은 `ast`를 바꾸지 않는다(스냅샷은 working/idle만).
- **추상화:** settle scrape와 still-running 폴링은 한 단계(`cpc = "scrape"`)로 접었다. 성공 분기(`ScrapeDone`)는 두 경로
  공통의 `requireDeferral` 가드, 실패 분기(`ScrapeErr`)는 **최초 settle의 catch(:2898)** 를 나타낸다 — 폴링의 읽기 실패
  catch(:2980)는 `requireDeferral`을 지키므로, 접힌 단계에 실패 분기를 붙인 것은 폴링 경우의 **과대 근사**다. `blocked`,
  hook 센서, conv 경로는 모델 밖. 재주입은 idle 또는 프롬프트 미도착 agent만 다시 돌린다(`runs`). 프로브 hit/miss는 비결정.
  **agent는 프롬프트당 working→idle 1회만** 낸다 — 작업 중간 idle 뒤 working 재진입(still-running deferral이 존재하는
  이유, PLAN 0.23.7)은 모델 밖이다. 그 경우 scrape 실패 분기는 재진입 `working`의 취소를 무시하고 작업 중에 완료 계열
  결과(`needs_verification`)를 낸다 — **모델 밖 위험으로 명시**.
- **범위 한정:** Fixed의 이전 소켓은 1개만 유지한다(모든 cfg `MaxOthers ≤ 1`). Fixed의 ACK 전 drop은 모델 밖(현재 설계
  모델에선 `events_subscribe_failed`로 명시적 실패).
- **공정성:** 브리지·서버 등록/ACK·소비·scrape 성공·프롬프트 이후 agent·재연결·조회·`VerifyTimeout`에 WF. `BootWork`,
  `SubmitStall`, `ScrapeErr`, `AgentDone`, `OtherSubscribe`, `Drop`, `QFail`은 비공정·유계(일어날 수 있으나 강제되지 않음).

### 2.3 상수

| 상수 | 모듈 | 의미 |
|---|---|---|
| `MaxBoot` | 둘 다 | 프롬프트 전 기동 `working→idle` 쌍 수 |
| `MaxOthers` · `MaxDrops` | 둘 다 | 다른 카드 subscribe(소켓 교체) · 계획 외 끊김 |
| `MaxRetries` | 둘 다 | `submitVerify.retries`(실제 3, 모델 2) |
| `LatencyBound` | 둘 다 | **TRUE = 명시적 지연 가정**: 4 s 마감이 (a) 프롬프트를 받고 아직 `working`을 안 낸 agent, (b) 배달 중인 `working`, (c) 아직 비행 중인 stall 프롬프트, (d, Fixed) `working` 스냅샷 응답을 앞지르지 않는다. **소켓 공백·재연결 백오프는 묶지 않는다.** FALSE = 마감이 아무 때나 온다 |
| `Replay` | 둘 다 | TRUE = 새 구독자에게 이 pane의 status backlog 재전달. herdr **0.7.4 / protocol 16** 관측은 FALSE(`PANE-DEATH-OBSERVATIONS.md:24`, :673, 한계 :728). 클라이언트 기대는 **protocol 17**(`herdr-client.ts:26`). **로컬 herdr 0.9.5에선 미확인** |
| `Stall` | 둘 다 | `agent_prompt_stalled` 반환 가능 |
| `ScrapeFail` | 둘 다 | **round 3.** TRUE = settle scrape 실패 분기(`ScrapeErr`) 가능. **모든 cfg에서 TRUE** |
| `DoneWhen` | 둘 다 | **round 3.** `"never"` · `"prompt"` · `"work"` (§2.2) |
| `CloseFair` | 현재 | 운영자가 결국 pane을 닫음(`pane.closed`, terminal replay) |
| `Drain` | Fixed | F1' 이전 소켓 drain(TRUE) / 파괴(FALSE) |
| `Recon` | Fixed | `"none"` · `"once"` · `"restart"` · `"pollraw"` · `"poll"` (§2.2 표) |
| `MaxQFail` | Fixed | `agent.get` 실패 수 |

### 2.4 속성

| 속성 | 종류 | 정의 |
|---|---|---|
| `NoEarlyCompletion` | 안전 | 완료 기록 ⇒ 프롬프트가 agent에 도착 |
| `NoFalseCompletion` | 안전 | 완료 기록 ⇒ agent가 프롬프트 이후 실제로 working→idle |
| `AtMostOneRun` | 안전 | agent가 프롬프트를 두 번 실행하지 않는다(재주입 이중 실행) |
| `EventuallyResolved` | 활성 | 프롬프트 송신(`inflight`/`post`) ~> 결과(완료 또는 명시적 실패) |
| `CompletesWhenAgentCompletes` | 활성(강) | agent가 프롬프트 이후 working→idle ~> 완료 기록 |

**"안전"이라는 말은 그 cfg가 실제로 검사한 불변식에만 쓴다.** 예: F3 = `NoEarly`·`NoFalse`·`EventuallyResolved`만 검사 —
`AtMostOneRun`은 F18에서 따로 본다(TLC 위반). 위반이 예상되는 불변식을 다른 불변식과 같은 cfg에 넣으면 TLC가 첫 위반에서
멈춰 나머지를 가리므로, 그런 경우 `…Run` 짝 cfg로 분리했다(§3.4).

## 3. 결과 — round-3 TLC (2026-10-23, 47 cfg) + round-2 TLC 참고

열: "round-3 TLC" = 판정 · exit · distinct states(이 라운드 실측) · "예상 일치?" = round-3 수기 예상(판정)과의 비교, 반례
경로가 예상과 다르면 "판정 일치 · 경로 다름(§3.5)" · "round-2 TLC" = round-2 모델에서의 판정 · exit · distinct(참고용,
`—` = round 3 신규) · "반례 (round-3 TLC)" = 이번 로그의 반례를 말로 옮긴 것(통과 cfg는 근거). **안전 위반(exit 12) 반례는
BFS라 최단**(같은 길이 중 어느 것이 나오는지는 임의), **활성 위반(exit 13) 반례는 TLC가 찾은 lasso**(최단 보장 없음)다.
표기: LB = `LatencyBound`, O/D/B = `MaxOthers`/`MaxDrops`/`MaxBoot`, `W`/`I`/`D` = working/idle/done push, "마감" =
`VerifyTimeout`, "정체" = 결과 없이 stuttering, "→" = 다음 단계. 모든 cfg: `ScrapeFail = TRUE`; `DoneWhen`은 표기 없으면
`"never"`. 반례 모두 서두의 `Spawn → Register → Subscribe → SrvReg → SrvAck → ConsumeAck` 등 공통 부분은 줄였다.

### 3.1 현재 설계 — `BridgeStartup.tla`

| # | cfg | 상수(기본: B0 O0 D0 · Retries 2 · LB T · Replay F · Stall F · Close F) | 속성 | round-3 TLC | 예상 일치? | round-2 TLC | 반례 (round-3 TLC) / 근거 |
|---|---|---|---|---|---|---|---|
| C1 | `BridgeStartup.cfg` | 기본 (**지연 가정 있음**) | 안전 3 + 활성 2 | No error · 0 · 25 | 일치 | No error · 0 · 25 | — |
| C2 | `BridgeStartup_NoLatency.cfg` | LB F | NoEarly · NoFalse · ER | No error · 0 · 179 | 일치 | No error · 0 · 167 | 마감은 결과를 앞당길 뿐 정체를 만들지 않음 |
| C3 | `BridgeStartup_NoLatencyRun.cfg` | LB F | AtMostOneRun | 위반 · 12 · 83 | 일치 | 위반 · 12 · 85 | ACK → 도착 → 반환 → agent `W`·`I`(스트림에 미소비) → 마감(가정 없음) **재주입** → agent 다시 `W` → runs = 2 |
| C4 | `BridgeStartup_NoLatencyCompletes.cfg` | LB F | Completes | 위반 · 13 · 179 | 일치 | 위반 · 13 · 167 | 도착 → agent `W` → 반환 → 마감 2회 → agent `I` → 마감 3회째 = `inject_unconfirmed` → 그 뒤 `W`·`I` 소비(결과 이후, 무시) → 정체 |
| C5 | `BridgeStartup_Gap.cfg` | O1 | NoEarly · NoFalse · ER | **ER 위반** · 13 · 370 (불변식 통과) | 일치 | ER 위반 · 13 · 370 | 도착 → `W`·`I` 방출(둘 다 버퍼) → 반환 → `W` 소비 → VerifyDone → **OtherSubscribe가 버퍼의 `I`째 소켓 파괴** → 새 소켓 등록·ACK → 정체 |
| C6 | `BridgeStartup_GapRun.cfg` | O1 | AtMostOneRun | 위반 · 12 · 189 | 일치 | 위반 · 12 · 186 | 도착 → 반환 → OtherSubscribe(새 소켓 미등록) → `W`·`I` 공백에 유실 → 마감(LB 통과: agent idle) 재주입 → runs = 2 |
| C7 | `BridgeStartup_GapCompletes.cfg` | O1 | Completes | 위반 · 13 · 370 | 판정 일치 · 경로 다름(§3.5) | 위반 · 13 · 370 | ACK → OtherSubscribe → 도착 → `W` 유실 → 반환 → 마감 1 → `I` 유실 → 마감 2 **재주입**(runs = 2) → 마감 3 = `inject_unconfirmed` → 2회차 `I`도 공백에 유실 |
| C8 | `BridgeStartup_Drop.cfg` | D1 | NoEarly · NoFalse · ER | **ER 위반** · 13 · 417 (불변식 통과) | 판정 일치 · 경로 다름(§3.5) | ER 위반 · 13 · 417 | 도착 → 반환 → `W` 방출·소비 → VerifyDone → Drop → Reconnect(미등록) → agent `I`가 **재연결 공백에 유실** → 등록·ACK → 정체 |
| C9 | `BridgeStartup_Boot.cfg` | B1 | NoEarly | 위반 · 12 · 99 | 일치 | 위반 · 12 · 92 | SrvReg → 기동 `W` 소비 → 기동 `I` 소비(완료 시작) → ScrapeDone = 완료. ACK도 프롬프트도 전 |
| C10 | `BridgeStartup_BootNoFalse.cfg` | B1 | NoFalse | 위반 · 12 · 76 | 판정 일치 · 경로 다름(§3.5) | 위반 · 12 · 82 | **C9와 같은 trace**(ACK 전 기동 쌍 → 완료) — 예상한 "ACK 처리(송신) 뒤 기동 쌍"보다 2단계 짧다 |
| C11 | `BridgeStartup_Replay.cfg` | O1 · Replay T | NoEarly · NoFalse · ER | No error · 0 · 676 | 일치 | No error · 0 · 621 | 공백에 잃은 `I`가 backlog로 재전달 → 완료 |
| C12 | `BridgeStartup_ReplayCompletes.cfg` | O1 · Replay T | Completes | 위반 · 13 · 676 | 일치 | 위반 · 13 · 621 | ACK → OtherSubscribe → 도착 → `W`(공백, backlog에만) → 반환 → 마감 3회 = `inject_unconfirmed` → 새 소켓 등록(backlog `W` 재전달)·`I` → 결과 이후라 무시 |
| C13 | `BridgeStartup_Close.cfg` | O1 · CloseFair T | ER | No error · 0 · 827 | 일치 | No error · 0 · 827 | C5 정체를 운영자 `pane.closed`가 해소 — **운영자 개입 조건부** |
| C14 | `BridgeStartup_Stall.cfg` | Stall T | 안전 3 + 활성 2 | No error · 0 · 52 | 일치 | No error · 0 · 52 | 유실 프롬프트는 재주입 또는 nudge 소진 실패 |
| C15 | `BridgeStartup_DonePrompt.cfg` | **DoneWhen prompt** | NoEarly · NoFalse | **NoFalse 위반** · 12 · 53 | 일치 | — | ACK → 도착 → agent `D`(실제 실행 전) → `D` 소비(`sawWorking` 불필요, :3165) → ScrapeDone = 완료, `agentDidWork = F`. NoEarly는 유지(`D`가 도착 뒤) |
| C16 | `BridgeStartup_DoneWork.cfg` | **DoneWhen work** | 안전 3 + 활성 2 | No error · 0 · 42 | 일치 | — | `D`는 실제 working→idle 뒤에만 → 완료 계열이 실제 완료와 일치 |

**scrape 실패 분기(`ScrapeFail = TRUE`)는 판정을 바꾸지 않았다(TLC 확인 — round-2와 겹치는 30 cfg 판정 전부 동일).** 수기 논증: `ScrapeErr`가 내는 완료는
같은 `cpc = "scrape"`에서 시작한다. 그 시작 시점에 `ScrapeDone`(WF)이 먼저 발화하면 deferral이 아직 서 있으므로 같은
완료가 **더 이른 상태**에서 기록된다 — 즉 `ScrapeErr`로만 도달하는 위반 상태는 없다(안전 판정 불변). 활성 쪽에선
`ScrapeErr`가 결과를 낼 뿐이고 비공정이라 기존 정체 경로는 그대로 남는다(활성 판정 불변). 따라서 round-2의 "취소된 완료는
결과 없이 return → 정체" 결론은 **scrape 성공 경로 조건부**이고, 실패 경로에선 취소가 무시되고 완료로 간다 — 이것은 정체를
줄이는 대신 §2.2의 모델 밖 위험(작업 중간 재진입 무시)을 만든다.

### 3.2 수정안 — `BridgeStartupFixed.tla`

기본: B0 O0 D0 · Retries 2 · QFail 0 · LB T · Replay F · Stall F · Drain T · Recon poll.

공통: 모든 Fixed 반례의 앞부분에는 "이 카드의 Subscribe가 다른 카드들의 기존 소켓(이 pane 미포함)을 이전 소켓으로 살려 두고,
ACK에서 drain(`OldSrvClose`·`OldClosed`)으로 은퇴시키는" 단계가 끼어 있다 — 이 pane의 이벤트와 무관하므로 줄였다.

| # | cfg | 상수 | 속성 | round-3 TLC | 예상 일치? | round-2 TLC | 반례 (round-3 TLC) / 근거 |
|---|---|---|---|---|---|---|---|
| F1 | `BridgeStartupFixed.cfg` | O1 (**지연 가정 있음**) | 안전 3 + 활성 2 | No error · 0 · 5467 | 일치 | No error · 0 · 4707 | drain으로 유실 없음; 역전된 `W`가 완료를 취소해도 poll이 재시작; 오래된 스냅샷은 `qdirty`로 폐기 |
| F2 | `BridgeStartupFixed_NoLatency.cfg` | LB F | Completes | 위반 · 13 · 8124 | 판정 일치 · 경로 다름(§3.5) | 위반 · 13 · 6696 | 도착 → 반환 → 마감 1(agent 아직 실행 전) → 조회 송신 → agent `W` → 스냅샷 `W` → agent `I` → 마감 2 **재주입** → agent 2회차 `W` → 마감 3 = `inject_unconfirmed` → 이후 status·스냅샷은 결과 뒤 |
| F3 | `BridgeStartupFixed_NoDrain.cfg` | O1 · Drain F | NoEarly · NoFalse · ER (**AtMostOneRun 미검사 → F18**) | No error · 0 · 4192 | 일치 | No error · 0 · 3630 | 이전 소켓 미독분 유실 → poll이 idle 유실 회수, `W` 유실은 명시적 실패. **이 셋만 통과 — "안전" 일반이 아님** |
| F4 | `BridgeStartupFixed_NoDrainCompletes.cfg` | O1 · Drain F | Completes | 위반 · 13 · 4192 | 일치 | 위반 · 13 · 3630 | ACK → OtherSubscribe → 도착 → `W` → 반환 → `I` — 둘 다 **이전 소켓에만**(새 소켓 미등록) → 새 소켓 등록·ACK가 **이전 소켓을 버퍼째 파괴** → 마감 3회 = `inject_unconfirmed` |
| F5 | `BridgeStartupFixed_NoDrainNoPoll.cfg` | O1 · Drain F · Recon none | ER | 위반 · 13 · 361 | 일치 | 위반 · 13 · 343 | ACK → OtherSubscribe → 도착 → `W`(이전 소켓) → 반환 → 이전 소켓 `W` 소비 → VerifyDone → `I`(이전 소켓에만) → 새 소켓 ACK가 이전 소켓을 `I`째 파괴 → 정체 |
| F6 | `BridgeStartupFixed_DupNoPoll.cfg` | O1 · Recon none | NoEarly · NoFalse · **AtMostOneRun(round 3 추가)** · ER | **ER 위반** · 13 · 557 (불변식 3개 통과) | 일치 | ER 위반 · 13 · 527 | 도착 → `W`(현재 소켓) → OtherSubscribe(현재 → 이전, `W` 보유) → 새 소켓 등록·ACK → 반환 → ACK 처리(이전 drain) → 서버 EOF 처리 → `I`(**새 소켓에만**) → 새 소켓 `I` 먼저 소비(`sawWorking = F` → 무시) → 이전 소켓 `W` 소비 → VerifyDone → 정체. **소켓 간 순서 역전**(§3.3) |
| F7 | `BridgeStartupFixed_Drop.cfg` | D1 · QFail 1 | NoEarly · NoFalse · ER | No error · 0 · 15374 | 일치 | No error · 0 · 13922 | poll이 정체 회수; 조회 1회 실패는 다음 조회가 대신 |
| F8 | `BridgeStartupFixed_DropRun.cfg` | D1 | AtMostOneRun | 위반 · 12 · 526 | 일치 | 위반 · 12 · 538 | 도착 → 반환 → Drop → `W`·`I` 공백에 유실 → 마감(LB 통과) **재주입** → runs = 2 (잔여) |
| F9 | `BridgeStartupFixed_DropCompletes.cfg` | D1 | Completes | 위반 · 13 · 7362 | 판정 일치 · 경로 다름(§3.5) | 위반 · 13 · 6646 | 도착 → `W`·`I` 방출(현재 소켓 버퍼, 미소비) → **Drop이 버퍼째 유실** → Reconnect·등록 → 반환 → 마감 3회 = `inject_unconfirmed` → ACK (잔여) |
| F10 | `BridgeStartupFixed_DropOnce.cfg` | D1 · Recon once | ER | 위반 · 13 · 1462 | 판정 일치 · 경로 다름(§3.5) | 위반 · 13 · 1440 | 도착 → `W`·`I` 방출(버퍼) → Drop(버퍼 유실) → Reconnect → 반환 → 마감 1 **재주입**(runs = 2) → 2회차 `W`는 공백에 유실 → 등록·ACK(재조정 예약) → 조회 → 스냅샷 `W` → agent `I` → `I` 소비(`sawWorking = F` → 무시) → **오래된 `W` 스냅샷 적용**(`sawWorking`만 세움) → VerifyDone → 정체 |
| F11 | `BridgeStartupFixed_Boot.cfg` | B1 | NoEarly · **AtMostOneRun(round 3 추가)** · ER | No error · 0 · 2637 | 일치 | No error · 0 · 2217 (AtMostOneRun 제외) | 펜스 뒤 `W`가 `sawWorking`을 세워 마감 차단; 유실 없음 → 재주입은 미도착 프롬프트에만 |
| F12 | `BridgeStartupFixed_BootNoFalse.cfg` | B1 | NoFalse | 위반 · 12 · 363 | 일치 | 위반 · 12 · 349 | ACK 처리(펜스) → 기동 `W` 소비 → 기동 `I` 소비(보류) → 도착 → 반환에서 보류 작동 → ScrapeDone = 완료, 실작업 없음 (잔여) |
| F13 | `BridgeStartupFixed_Stall.cfg` | Stall T | 안전 3 + 활성 2 | No error · 0 · 1665 | 일치 | No error · 0 · 1485 | B0이면 보류 idle은 실제 실행에서만 |
| F14 | `BridgeStartupFixed_StallBoot.cfg` | Stall T · B1 | NoEarly | 위반 · 12 · 746 | 판정 일치 · 경로 다름(§3.5) | 위반 · 12 · 927 | SrvAck → 기동 `W`(ACK 뒤 버퍼) → ACK 처리(펜스) → `W` 소비 → 기동 `I` 소비(**보류**) → **`SubmitStall`(프롬프트 미도착) 반환에서 보류 작동** → ScrapeDone = 완료, 프롬프트 없음 |
| F15 | `BridgeStartupFixed_Replay.cfg` | O1 · Replay T | 안전 3 + 활성 2 | No error · 0 · 5323 | 일치 | No error · 0 · 4563 | B0이면 backlog는 실제 실행의 status뿐 |
| F16 | `BridgeStartupFixed_ReplayBoot.cfg` | O1 · Replay T · B1 | NoFalse | 위반 · 12 · 622 | 일치 | 위반 · 12 · 651 | **F12와 같은 trace**(replay·OtherSubscribe 미사용) |
| F17 | `BridgeStartupFixed_NoLatencyRun.cfg` | LB F (F2 상수) | AtMostOneRun | 위반 · 12 · 319 | 일치 | — | 도착 → 반환 → agent `W`·`I`(미소비) → 마감(가정 없음) **재주입** → runs = 2 (C3와 같은 꼴) |
| F18 | `BridgeStartupFixed_NoDrainRun.cfg` | O1 · Drain F (F3/F4 상수) | AtMostOneRun | 위반 · 12 · 1154 | 판정 일치 · 경로 다름(§3.5) | — | 도착 → 반환 → OtherSubscribe(현재 → 이전 live, 새 소켓 미등록) → `W`(**이전 소켓에만**) → 새 소켓 등록·ACK → **이전 소켓을 `W`째 파괴** → `I`(새 소켓, 미소비) → 마감(LB 통과: agent idle, 어느 스트림에도 `W` 없음) **재주입** → runs = 2. `MaxDrops = 0`·LB T — **정상 구독 교체만으로 이중 실행**(Astra 0222 #1 확인) |
| F19 | `BridgeStartupFixed_NoDrainNoPollRun.cfg` | O1 · Drain F · Recon none | AtMostOneRun | 위반 · 12 · 325 | 판정 일치 · 경로 다름(§3.5) | — | F18과 같은 trace(조회 무관) |
| F20 | `BridgeStartupFixed_DropQFailRun.cfg` | D1 · QFail 1 (F7 상수) | AtMostOneRun | 위반 · 12 · 677 | 일치 | — | F8 꼴: Drop(도착 전) → 도착 → 반환 → `W`·`I` 공백에 유실 → 마감 재주입 → runs = 2 (QFail 미사용) |
| F21 | `BridgeStartupFixed_DropOnceRun.cfg` | D1 · Recon once (F10 상수) | AtMostOneRun | 위반 · 12 · 325 | 일치 | — | F8 trace(재조정은 재ACK 뒤라 개입 전) |
| F22 | `BridgeStartupFixed_StallBootRun.cfg` | Stall T · B1 (F14 상수) | AtMostOneRun | No error · 0 · 9735 | 일치 | — | 유실 없음: 실행한 agent의 `W`는 소비되거나(`sawWorking` → 마감 없음) 스트림에 있어(`Plausible` 차단) 재주입은 미도착·유실 프롬프트에만 |
| F23 | `BridgeStartupFixed_ReplayBootRun.cfg` | O1 · Replay T · B1 (F16 상수) | AtMostOneRun | No error · 0 · 36346 | 일치 | — | drain으로 공백 없음 — F22와 같은 근거 |
| F24 | `BridgeStartupFixed_DropOnceSafe.cfg` | D1 · Recon once | NoEarly · NoFalse | **NoFalse 위반** · 12 · 515 | 판정 일치 · 경로 세부 다름(§3.5) | — | **카드 기동 전** 기존 소켓 Drop(lossy) → Spawn·Subscribe·등록·ACK(재조정 예약) → **송신 중 조회** → 스냅샷 `I`(agent 아직 실행 전) → 도착 → `W` 소비 → 반환 → **오래된 `I` 적용** → 완료 시작 → ScrapeDone = 완료, `agentDidWork = F` |
| F25 | `BridgeStartupFixed_PollRaw.cfg` | Recon **pollraw** | 안전 3 | **NoFalse 위반** · 12 · 248 | 일치 | — | 도착 → 반환 → 조회 → 스냅샷 `I`(agent prompted, 아직 `W` 전) → agent `W` 소비 → **오래된 `I` 적용** → 완료 시작 → ScrapeDone = 완료, 실작업 없음. 교란 0 |
| F26 | `BridgeStartupFixed_PollRawLive.cfg` | O1 · Recon pollraw (F1 상수) | ER · Completes | No error · 0 · 7157 | 일치 | — | 연속 조회라 무시된 `I`(F6 역전)·오래된 `W` 취소 뒤에도 다음 `idle` 스냅샷이 완료를 재시작. agent가 idle이 된 뒤의 스냅샷은 모두 `I` |
| F27 | `BridgeStartupFixed_Restart.cfg` | O1 · Recon **restart** (F6/F26 상수) | 안전 3 · ER | **ER 위반** · 13 · 820 (불변식 통과) | 일치 | — | F6 trace: ACK → OtherSubscribe → 도착 → `W`(이전 소켓에만) → 등록 → 반환 → 새 ACK(이전 drain) → `I`(새 소켓에만) → 새 소켓 `I` 소비(`sawWorking = F` → **무시**, 취소 아님) → 이전 `W` 소비(deferral·보류 없음 → `cancelled` 미설정) → 조회 없음 → VerifyDone → 정체 |
| F28 | `BridgeStartupFixed_RestartDropOnce.cfg` | D1 · Recon restart | NoEarly · NoFalse | **NoFalse 위반** · 12 · 510 | 판정 일치 · 경로 세부 다름(§3.5) | — | F24와 같은 꼴(기동 전 Drop → 재ACK 조회 → 스냅샷 `I` → `W` 소비 → 오래된 `I` 적용 → 완료). 반환이 `W`보다 먼저인 점만 다름 |
| F29 | `BridgeStartupFixed_RestartDropOnceLive.cfg` | D1 · Recon restart | ER | **ER 위반** · 13 · 1635 | 판정 일치 · 경로 세부 다름(§3.5) | — | 도착 → 반환 → `W`(버퍼) → Drop(유실) → 마감 1 → Reconnect → `I` 공백 유실 → 마감 2 **재주입**(runs = 2) → 2회차 `W`도 공백 유실 → 등록·ACK(재조정 예약) → 조회 → 스냅샷 `W` → agent `I` → `I` 소비(무시) → **오래된 `W` 적용** = `sawWorking`만 세움(보류·deferral 없음 → `cancelled` 미설정) → VerifyDone → 정체 |
| F30 | `BridgeStartupFixed_DonePrompt.cfg` | **DoneWhen prompt** | NoEarly · NoFalse | **NoFalse 위반** · 12 · 163 | 일치 | — | 도착 → 반환 → agent `D`(실제 실행 전) → 일반 게이트로 완료 시작(펜스 뒤라 보류 아님) → ScrapeDone = 완료, 실작업 없음. **F3' 보류는 반환 전 `D`만 미룰 뿐 막지 못한다** |
| F31 | `BridgeStartupFixed_DoneWork.cfg` | O1 · **DoneWhen work** (F1 상수) | 안전 3 + 활성 2 | No error · 0 · 14929 | 일치 | — | `D`는 실제 완료 뒤에만 — 중복 사본·역전은 F1처럼 poll이 처리 |

### 3.3 round-2 TLC에서 예상과 달랐던 결과 (round-2 기록, 결론은 유지)

- **F6 (판정 불일치: 예상 No error → ER 위반).** 예상의 전제("유실이 없으면 각 스트림이 `W` 뒤에 자기 `I`를 가진다")가
  틀렸다. 소켓 교체 시점이 `W`와 `I` 사이에 오면 `W`는 이전 소켓에만, `I`는 새 소켓에만 실린다. 브리지가 두 소켓을 **임의
  순서로** 읽으므로 새 소켓의 `I`가 먼저 처리되면 무시되고, 뒤늦은 `W`는 완료를 일으키지 않는다. 현실성: 이벤트 루프가 막혀
  두 소켓이 같은 틱에 readable이 되면 콜백 순서는 보장되지 않는다 — 좁지만 실재하는 창. **결론:** drain은 유실을 없애도
  소켓 간 순서를 보존하지 않는다. 대안(미모델): drain 중인 이전 소켓을 다 읽기 전에는 새 소켓 이벤트를 버퍼링해 순서 복원.
- **F10 (경로 다름).** 이벤트를 하나도 잃지 않은 채 **오래된 `working` 스냅샷이 보류 idle을 지워** 정체. `"once"` 철회.
- **F14 (경로 다름).** 최단 반례는 **stall 반환 뒤에** 방출된 기동 쌍. "stall 반환에서 보류분 버리기"로는 닫히지 않는다.
- **F16 (경로 다름).** `MaxBoot = 1`이면 F12 trace가 replay 없이 이미 위반 — cfg가 replay 효과를 분리하지 못함. "Replay면
  F3' 잔여 창이 카드 전체로 넓어진다"는 **미입증 수기 주장**.
- **C7 (경로 차이, 경미).** `I`가 오기 전에 마감 3회 소진. 결론 불변.

### 3.4 round 3 — 조각별 필요성 (비교 변형 표, round-3 TLC)

| 변형 | 조회 시점 | 응답 폐기 | 안전(NoFalse) | ER — 소켓 교체 O1 (drain) | ER — 끊김 D1 |
|---|---|---|---|---|---|
| `none` | — | — | 통과 (F6) | **위반** (F6) | (미검사) |
| `once` | 재ACK 후 1회 | 없음 | **위반** (F24) | (미검사) | **위반** (F10) |
| `restart` | `once` + 취소 뒤 재시작까지 | 없음 | **위반** (F28) · O1에선 통과 (F27) | **위반** (F27) | **위반** (F29) |
| `pollraw` | 반환 뒤 연속 | 없음 | **위반** (F25) | 통과 (F26) | (미검사) |
| `poll` | 반환 뒤 연속 | `qdirty` | 통과 (F1·F7) | 통과 (F1) | 통과 (F7) |

(모든 칸 round-3 TLC. 예상과 다른 칸 없음.)

읽는 법: `pollraw`와 `poll`은 **폐기 규칙만** 다르다 → 폐기는 안전에 필요(F25 vs F1 — F1의 O1은 비공정이라 O0 행동을 포함).
`restart`와 `pollraw`는 **조회의 연속성만** 다르다(F27 vs F26, 같은 상수) → 연속 조회는 활성에 필요. 이것은 **이 다섯 변형
안에서의** 필요성이다 — "1회 조회 + 폐기", "restart + 폐기", 순서 복원 버퍼 등은 검사하지 않았으므로 `poll`이 최소라고
말하지 않는다.

`AtMostOneRun` 짝 cfg(Astra 0222 #1): 재주입 분기는 `MaxRetries = 2`인 모든 Fixed cfg에서 도달 가능하므로, 위반이
예상되는 상수 집합마다 `…Run` 짝을 두고(F17–F21), 통과가 예상되는 곳엔 같은 cfg에 넣거나(F6·F11) 짝을 둔다(F22·F23).
F1·F13·F15·F31·F25·F27은 원래 포함. F2/F4/F9/F12/F14/F16은 같은 상수의 짝(F17·F18·F8·F11·F22·F23)이 커버한다.

### 3.5 round-3 TLC vs 수기 예상 — 불일치 목록

**판정 불일치: 0 / 47.** 47개 cfg의 판정(No error / 어느 속성 위반)이 모두 round-3 수기 예상과 같고, round-2와 겹치는 30
cfg는 round-2 판정과도 같다. 아래는 **반례 경로**가 예상(대개 round-2 로그의 경로)과 다른 cfg다. 각 항목은 먼저 모델을
의심해 그 경로가 모델 결함에서 나온 것인지 따졌다.

| # | 예상 경로 | 실제 반례 | 왜 다른가 (모델 먼저 의심) | 결론 변화 |
|---|---|---|---|---|
| C7 | `W` 유실 → working인 채 마감 3회 | 마감 2에서 **재주입**(runs = 2) 뒤 마감 3 = 실패 | 모델 점검: 마감 2 시점에 agent는 첫 실행을 끝내 idle이고 `I`는 공백에 유실 — `VerifyTimeout`의 재주입 분기 조건(`apc = "idle"`)을 정당하게 만족. 결함 아님. 활성 lasso는 최단 보장이 없어 다른 분기를 골랐을 뿐 | 없음. 오히려 C6(이중 실행)과 C7(오실패)이 **한 실행에서 함께** 날 수 있음을 보여 준다 |
| C8 | `W` 소비 → Drop이 **버퍼의** `I` 유실 | Drop 뒤 **재연결 공백**(`sk = "conn"`, 미등록)에 `I` 방출·유실 | 두 경로 모두 모델에 있다(`Emit`은 등록된 소켓에만). 결함 아님 — lasso가 다른 쪽을 골랐다 | 없음 — 유실 지점만 다르고 정체는 같다 |
| C10 | ACK 처리(송신) 뒤 기동 쌍 → 완료(도착 전) | **C9와 같은 ACK 전 경로**(SrvReg → 기동 `W`·`I` → 완료) | 모델 점검: ACK 전 완료는 `submitted = F`이므로 `agentDidWork = F`도 함께 성립 — NoFalse 위반의 최단(10 상태) 경로가 원래 ACK 전에 있다. 예상한 ACK 뒤 경로는 2 상태 더 길어 BFS가 고르지 않는다. round-2에서 ACK 뒤 경로가 나온 이유는 round-2 로그를 다시 보지 않아 **미확인** | 없음. 다만 C10은 C9와 독립된 "ACK 뒤 창" 증거가 아니다 — 현재 설계의 ACK 뒤 기동 쌍 위험은 이 cfg로 따로 입증되지 않았다(같은 게이트 논리라 수기로는 명백) |
| F2 | 마감 3회가 working agent를 앞지름 | 마감 2에서 **재주입**(runs = 2) 동반 | C7과 같은 이유(LB F라 마감이 언제나 가능, agent가 idle인 시점에 재주입 분기). 결함 아님 | 없음 — F17(이중 실행)과 같은 실행에서 겹친다 |
| F9 | **재연결 공백**에 `W`·`I` 유실 | `W`·`I`가 **현재 소켓 버퍼**에 있다가 Drop으로 유실 | C8과 같은 대칭 — 두 경로 모두 모델에 있다 | 없음 |
| F10 | 오래된 `working` 스냅샷이 **보류 idle을 지움** → 정체 | Drop 버퍼 유실 → 마감 재주입(runs = 2) → 2회차 `W` 공백 유실 → 재ACK 조회 스냅샷 `W` → `I` 먼저 소비(`sawWorking = F`라 무시) → **오래된 `W` 적용** → 정체 | 모델 점검: (1) 재주입은 LB 아래에서도 정당(agent idle, 스트림에 `W` 없음 — F8과 같은 잔여). (2) `once`는 응답을 그대로 적용하므로 스냅샷 `W`가 `I`보다 늦게 적용되는 역순이 가능. 결함 아님. 이것은 F29의 경로와 같은 꼴이다 | 없음 — `once` 철회 유지. round-2 경로(보류 idle 소거)와 이 역순 경로 **둘 다** `once`를 깬다 |
| F14 | **stall 반환 뒤** 방출된 기동 쌍 → 일반 게이트로 완료 | 기동 쌍이 **펜스 뒤·stall 반환 전**에 와서 보류 → `SubmitStall` 반환에서 보류 작동 → 완료(프롬프트 미도착) | 모델 점검: round 3의 `ReturnEffects`는 stall 반환에서도 보류를 작동시킨다(§2.2, 코드 :2060이 stall도 검증으로 계속 진행하는 것과 일치). 결함 아님. 두 경로는 길이가 같거나 이 쪽이 짧아 BFS가 이쪽을 골랐다. round-2 경로(반환 뒤 기동 쌍)는 모델 논리가 그대로라 여전히 존재한다(이번 로그로 직접 보이진 않음) | 없음. §3.3의 "stall 반환에서 보류분 버리기로는 닫히지 않는다"는 유지되고, 이번 경로는 **"보류분을 버리는 것도 필요"**함을 보탠다 — 둘 중 하나로는 F14를 닫지 못한다 |
| F18 · F19 | `W`·`I`가 **둘 다** 이전 소켓에만 → 이전 소켓 파괴 → 재주입 | `W`만 이전 소켓과 함께 파괴, `I`는 새 소켓에 도착해 미소비인 채 마감 → 재주입 | 모델 점검: `Plausible`(LB)은 스트림의 `W`만 보고 `I`는 보지 않는다. 새 소켓의 `I`는 소비돼도 `sawWorking = F`라 무시되므로 결과는 같다 — 모델이 "`I`가 배달 중이면 마감하지 않는다"를 가정하지 않는 것은 보수적 선택. 결함 아님 | 없음 — 오히려 강해진다: **`W` 하나만 잃어도** drain 없는 make-before-break에서 이중 실행 |
| F24 · F28 | Subscribe 전 Drop | Drop이 **카드 기동(Spawn) 전**, 다른 카드들의 기존 소켓(이 pane 미포함)에서 일어남 → 이 카드의 첫 ACK가 재조정 예약. F24는 `QApply`가 반환 뒤라 보류가 아닌 일반 게이트로 완료 | 모델 점검: `lossy`는 소켓 단위 표식이라 이 pane을 싣지 않은 소켓의 끊김도 다음 ACK에 재조정을 예약한다. 실제 "재연결 ACK 뒤 진행 중 flight 전체를 1회 조회" 구현이면 ACK 시점에 등록된 이 카드도 포함되므로 현실적 해석이다. 결함 아님 | 없음 — 핵심(프롬프트 송신과 겹친 조회의 `idle` 스냅샷을 `W` 뒤에 그대로 적용)은 예상 그대로 |
| F29 | Drop → `W` 공백 유실 → 재ACK 스냅샷 `W` → `I` 무시 → 오래된 `W` 적용 → 정체 | 같은 꼴에 **마감 재주입(runs = 2)** 이 끼고, 스냅샷 `W`는 2회차 실행의 것 | F10과 같은 이유. 결함 아님 | 없음 |

나머지 35 cfg(통과 16 + 위반 19)는 판정과 경로 모두 예상과 같다(F16은 예상대로 F12와 같은 trace — replay 효과 미분리,
§3.3 F16 주석 유지).

## 4. 운영상 의미 (round 3 — TLC 확인)

1. **지연 가정은 결론의 일부다 — TLC 확인.** 4 s 벽시계 마감이 느린 agent를 앞지르면 `inject_unconfirmed`
   오실패(C4·F2)와 재주입 이중 실행(C3·F17)이 난다. "기준선 No error"(C1·F1)는 **`LatencyBound` 가정 아래에서만**.
   (현재 설계의 NoEarly·NoFalse·ER은 LB 없이도 통과 — C2.)
2. **현재 설계의 실제 위험은 소켓 교체다 — TLC 확인.** `idle`을 잃으면 **영구 정체, 실패 보고 없음**(C5·C8).
   `W`·`I`를 둘 다 잃으면 이중 실행(C6) 또는 오실패(C7) — 한 실행에서 둘 다 날 수도 있다(C7 반례). 정체 결론은
   **`Replay = FALSE` 조건부**(C11, 0.9.5 미확인).
3. **완료 취소는 scrape 성공 때만 성립한다(round 3).** 성공 경로에선 `working`이 완료를 취소해 정체를 만들 수 있고(F5·F6),
   실패 경로(:2898)에선 취소를 무시하고 완료를 제안한다. **TLC: `ScrapeFail = TRUE`는 어떤 판정도 바꾸지 않았다**(§3.1 끝).
   다만 모델 밖의 **작업 중간 idle→working 재진입**에서는 scrape 실패가 작업 중 완료 계열 결과를 낸다(미검사).
4. **drain 없는 make-before-break는 이중 실행을 남긴다(Astra 0222 #1 — TLC 확인).** F3이 통과한 것은 완료 불변식 2개와
   `EventuallyResolved`뿐이다. 정상적인 다른 카드 subscribe 한 번으로 이전 소켓이 `W`째 파괴되면 마감 → 재주입이
   idle agent를 다시 돌린다(F18·F19 — `W` 하나만 잃어도 충분). drain이 실패해 상한 타이머 + 파괴로 내려오면 **오실패(F4)와
   이중 실행(F18)** 이 함께 돌아온다.
5. **`done`(Astra 0222 #3 — TLC 확인).** 현재 코드는 `done`을 `sawWorking` 없이 완료로 받는다(:3165). "`done`은 프롬프트 뒤에만
   온다"는 가정으로는 부족하다 — 실제 working→idle 전 `done`이면 현재 설계(C15)·수정안(F30) 모두 가짜 완료.
   F3' 보류는 반환 전의 `done`만 미룬다. 안전 결론은 **`done` 완전 제외** 또는 **"`done`은 실제 working→idle 뒤에만"**
   (C16·F31 통과) 가정 아래에서만 성립한다.
6. **기동 status는 조건부 위험이다.** herdr(0.9.5)가 `interactive_ready` 뒤·프롬프트 도착 전에 `working`을 보고하는지는
   **관측되지 않았다**. 보고한다면 현재 설계는 ACK 전에도 가짜 완료(C9·C10), 수정안도 ACK 뒤 창(F12·F16)·stall 반환
   시점/뒤(F14). 수정안의 `AtMostOneRun`은 기동 쌍이 있어도 통과(F11·F22·F23).

## 5. 권고 — round 3 (PLAN 게이트 필요, 구현 지시 아님)

> **Recommendation, not a decision.** 근거는 round-3 TLC(47 cfg, 판정 전부 예상 일치 — §3.5). **모델 확인 ≠ 코드 확인**
> — §2.2 추상화·유계 상수·`LatencyBound`·`done` 가정(§0.1-4) 아래에서만 성립한다. 아래 조합은 **검사한 범위에서 통과한
> 후보 집합**이지 최소·유일한 해가 아니다(§3.4).

- **F2' 연속 `agent.get` 폴링 + `qdirty` 폐기.** 비교한 변형 중 폴링 없음(F5·F6)·1회(F10·F24)·취소 시만(F27–F29)·폐기
  없음(F25)이 모두 정체 또는 가짜 완료를 남겼다(TLC). 폴링 + 폐기는 소켓 교체(F1 — 5속성, F3 — 3속성)·끊김 + 조회 1회
  실패(F7 — NoEarly·NoFalse·ER)·Stall(F13)·Replay(F15)·`done = work`(F31)에서 검사한 속성을 통과했다. herdr가 status 이벤트에 revision/seq를 싣게 되면(0.9.5 미확인) 그것으로 폐기 규칙을 대체.
- **F1' make-before-break + drain.** drain 없이는 `CompletesWhenAgentCompletes` 위반(F4)과 **정상 구독 교체에 의한 재주입
  이중 실행**(F18·F19, TLC)이 남는다 — F3의 통과는 완료 불변식 2개 + `EventuallyResolved`로 한정. **전제(Unknown, herdr 0.9.5
  라이브 확인 필요):** 구독 연결의 클라이언트 EOF를 받으면 구독을 내리고 연결을 닫는다. 틀리면 F4·F18이 돌아온다.
  drain은 소켓 간 순서를 보존하지 않는다(F6) — 순서 복원 버퍼는 미모델 대안.
- **F3' 프롬프트 펜스 (한계 명시).** ACK 앞의 기동 쌍은 막는다(F11). `done`도 같은 펜스·보류에 넣었지만(round 3 모델) 반환
  뒤 `done`은 막지 못한다(F30) — `done`을 완료로 받으려면 **실제 실행의 양성 증거**(예: 펜스 뒤 `sawWorking` 요구)가 필요하다
  (미모델 변형 — PLAN에서 검토). stall + 기동 쌍(F14)도 펜스로 닫히지 않는다 — round-3 반례는 stall 반환 **시점에** 보류가
  작동하는 경로, round-2 반례는 반환 **뒤** 기동 쌍이라, 닫으려면 stall 반환에서 보류분 폐기 **와** 반환 뒤 기동 쌍 대책이
  둘 다 필요하다(§3.5).
- **scrape 실패 경로(:2898).** 취소를 무시한다. 작업 중간 재진입을 존중하려면 catch에도 `requireDeferral`을 걸지(그러면
  읽기 실패 시 정체 가능 — 카드 상한 타임아웃과 짝), 현 동작을 유지할지 PLAN에서 결정(모델 밖).
- **수용 한계 (잔여, TLC 확인):** F8·F9·F20·F21 — 끊김 창에 `W`·`I`가 모두 떨어지면 이중 실행 또는 명시적
  `inject_unconfirmed`(조회 방식·조회 실패와 무관). F12·F16 — 서버 ACK 쓰기 ~ 프롬프트 도착 사이 기동 쌍. F14 — stall + 기동
  쌍. F2·F17 — `LatencyBound` 없이는 오실패·이중 실행. F30 — `done`이 실제 실행 전에 오면 가짜 완료(`done = work` 가정 필요).
- **대안·보강(모델 밖):** 카드 전체 상한 타임아웃(정체를 명시적 실패로) — 현재 설계에선 C5·C8 정체를 명시적 실패로 바꾸는
  단기 완화책.

## 6. TLC 실행 (아키텍트)

모델 디렉터리(`docs/spikes/tla/bridge-startup/`) 안에서 cfg마다 따로:

```text
java -XX:+UseParallelGC -cp <scratchpad>/tools/tla/tla2tools.jar tlc2.TLC -deadlock -workers 4 -config <cfg> <tla>
```

모든 cfg는 2분 안에 끝나도록 상수를 작게 잡았다(`MaxRetries 2`, 교란 ≤ 1, `MaxBoot ≤ 1`). **round-3 실행 기록:** 2026-10-23,
TLC 1.8.0 (rev d2e1472) · jar sha256 `5bd7b64d…b1e2` · Java 17 · `-deadlock -workers 4` · 47 cfg 전부 아키텍트 실행, 각 ≤ 3 s
(최대 `BridgeStartupFixed_DoneWork` 3 s), `MaxRetries` 축소 없음. 로그 = scratchpad `runs3/<cfg>.log`(저장소 밖). 모든 cfg에
`ScrapeFail = TRUE`. "TLC 결과" = 판정 · exit · distinct states.

| # | cfg | tla | 상수(기본값과 다른 것) | 검사 | 예상 판정 (exit) | TLC 결과 | 예상 일치? |
|---|---|---|---|---|---|---|---|
| C1 | `BridgeStartup.cfg` | `BridgeStartup.tla` | — | INV TypeOK NoEarly NoFalse AtMostOneRun · PROP ER Completes | No error (0) | No error · 0 · 25 | 일치 |
| C2 | `BridgeStartup_NoLatency.cfg` | `BridgeStartup.tla` | LB F | INV TypeOK NoEarly NoFalse · PROP ER | No error (0) | No error · 0 · 179 | 일치 |
| C3 | `BridgeStartup_NoLatencyRun.cfg` | `BridgeStartup.tla` | LB F | INV TypeOK AtMostOneRun | 위반 (12) | AtMostOneRun 위반 · 12 · 83 | 일치 |
| C4 | `BridgeStartup_NoLatencyCompletes.cfg` | `BridgeStartup.tla` | LB F | PROP Completes | 위반 (13) | Completes 위반 · 13 · 179 | 일치 |
| C5 | `BridgeStartup_Gap.cfg` | `BridgeStartup.tla` | O1 | INV TypeOK NoEarly NoFalse · PROP ER | ER 위반 (13) | ER 위반 · 13 · 370 | 일치 |
| C6 | `BridgeStartup_GapRun.cfg` | `BridgeStartup.tla` | O1 | INV TypeOK AtMostOneRun | 위반 (12) | AtMostOneRun 위반 · 12 · 189 | 일치 |
| C7 | `BridgeStartup_GapCompletes.cfg` | `BridgeStartup.tla` | O1 | PROP Completes | 위반 (13) | Completes 위반 · 13 · 370 | 판정 일치 · 경로 다름 |
| C8 | `BridgeStartup_Drop.cfg` | `BridgeStartup.tla` | D1 | INV TypeOK NoEarly NoFalse · PROP ER | ER 위반 (13) | ER 위반 · 13 · 417 | 판정 일치 · 경로 다름 |
| C9 | `BridgeStartup_Boot.cfg` | `BridgeStartup.tla` | B1 | INV TypeOK NoEarly | 위반 (12) | NoEarly 위반 · 12 · 99 | 일치 |
| C10 | `BridgeStartup_BootNoFalse.cfg` | `BridgeStartup.tla` | B1 | INV TypeOK NoFalse | 위반 (12) | NoFalse 위반 · 12 · 76 | 판정 일치 · 경로 다름 |
| C11 | `BridgeStartup_Replay.cfg` | `BridgeStartup.tla` | O1 · Replay T | INV TypeOK NoEarly NoFalse · PROP ER | No error (0) | No error · 0 · 676 | 일치 |
| C12 | `BridgeStartup_ReplayCompletes.cfg` | `BridgeStartup.tla` | O1 · Replay T | PROP Completes | 위반 (13) | Completes 위반 · 13 · 676 | 일치 |
| C13 | `BridgeStartup_Close.cfg` | `BridgeStartup.tla` | O1 · CloseFair T | PROP ER | No error (0) | No error · 0 · 827 | 일치 |
| C14 | `BridgeStartup_Stall.cfg` | `BridgeStartup.tla` | Stall T | INV TypeOK NoEarly NoFalse AtMostOneRun · PROP ER Completes | No error (0) | No error · 0 · 52 | 일치 |
| C15 | `BridgeStartup_DonePrompt.cfg` | `BridgeStartup.tla` | DoneWhen prompt | INV TypeOK NoEarly NoFalse | NoFalse 위반 (12) | NoFalse 위반 · 12 · 53 | 일치 |
| C16 | `BridgeStartup_DoneWork.cfg` | `BridgeStartup.tla` | DoneWhen work | INV TypeOK NoEarly NoFalse AtMostOneRun · PROP ER Completes | No error (0) | No error · 0 · 42 | 일치 |
| F1 | `BridgeStartupFixed.cfg` | `BridgeStartupFixed.tla` | O1 | INV TypeOK NoEarly NoFalse AtMostOneRun · PROP ER Completes | No error (0) | No error · 0 · 5467 | 일치 |
| F2 | `BridgeStartupFixed_NoLatency.cfg` | `BridgeStartupFixed.tla` | LB F | PROP Completes | 위반 (13) | Completes 위반 · 13 · 8124 | 판정 일치 · 경로 다름 |
| F3 | `BridgeStartupFixed_NoDrain.cfg` | `BridgeStartupFixed.tla` | O1 · Drain F | INV TypeOK NoEarly NoFalse · PROP ER | No error (0) | No error · 0 · 4192 | 일치 |
| F4 | `BridgeStartupFixed_NoDrainCompletes.cfg` | `BridgeStartupFixed.tla` | O1 · Drain F | PROP Completes | 위반 (13) | Completes 위반 · 13 · 4192 | 일치 |
| F5 | `BridgeStartupFixed_NoDrainNoPoll.cfg` | `BridgeStartupFixed.tla` | O1 · Drain F · Recon none | PROP ER | 위반 (13) | ER 위반 · 13 · 361 | 일치 |
| F6 | `BridgeStartupFixed_DupNoPoll.cfg` | `BridgeStartupFixed.tla` | O1 · Recon none | INV TypeOK NoEarly NoFalse AtMostOneRun · PROP ER | ER 위반 (13) | ER 위반 · 13 · 557 | 일치 |
| F7 | `BridgeStartupFixed_Drop.cfg` | `BridgeStartupFixed.tla` | D1 · QFail 1 | INV TypeOK NoEarly NoFalse · PROP ER | No error (0) | No error · 0 · 15374 | 일치 |
| F8 | `BridgeStartupFixed_DropRun.cfg` | `BridgeStartupFixed.tla` | D1 | INV TypeOK AtMostOneRun | 위반 (12) | AtMostOneRun 위반 · 12 · 526 | 일치 |
| F9 | `BridgeStartupFixed_DropCompletes.cfg` | `BridgeStartupFixed.tla` | D1 | PROP Completes | 위반 (13) | Completes 위반 · 13 · 7362 | 판정 일치 · 경로 다름 |
| F10 | `BridgeStartupFixed_DropOnce.cfg` | `BridgeStartupFixed.tla` | D1 · Recon once | PROP ER | 위반 (13) | ER 위반 · 13 · 1462 | 판정 일치 · 경로 다름 |
| F11 | `BridgeStartupFixed_Boot.cfg` | `BridgeStartupFixed.tla` | B1 | INV TypeOK NoEarly AtMostOneRun · PROP ER | No error (0) | No error · 0 · 2637 | 일치 |
| F12 | `BridgeStartupFixed_BootNoFalse.cfg` | `BridgeStartupFixed.tla` | B1 | INV TypeOK NoFalse | 위반 (12) | NoFalse 위반 · 12 · 363 | 일치 |
| F13 | `BridgeStartupFixed_Stall.cfg` | `BridgeStartupFixed.tla` | Stall T | INV TypeOK NoEarly NoFalse AtMostOneRun · PROP ER Completes | No error (0) | No error · 0 · 1665 | 일치 |
| F14 | `BridgeStartupFixed_StallBoot.cfg` | `BridgeStartupFixed.tla` | Stall T · B1 | INV TypeOK NoEarly | 위반 (12) | NoEarly 위반 · 12 · 746 | 판정 일치 · 경로 다름 |
| F15 | `BridgeStartupFixed_Replay.cfg` | `BridgeStartupFixed.tla` | O1 · Replay T | INV TypeOK NoEarly NoFalse AtMostOneRun · PROP ER Completes | No error (0) | No error · 0 · 5323 | 일치 |
| F16 | `BridgeStartupFixed_ReplayBoot.cfg` | `BridgeStartupFixed.tla` | O1 · Replay T · B1 | INV TypeOK NoFalse | 위반 (12) | NoFalse 위반 · 12 · 622 | 일치 |
| F17 | `BridgeStartupFixed_NoLatencyRun.cfg` | `BridgeStartupFixed.tla` | LB F | INV TypeOK AtMostOneRun | 위반 (12) | AtMostOneRun 위반 · 12 · 319 | 일치 |
| F18 | `BridgeStartupFixed_NoDrainRun.cfg` | `BridgeStartupFixed.tla` | O1 · Drain F | INV TypeOK AtMostOneRun | 위반 (12) | AtMostOneRun 위반 · 12 · 1154 | 판정 일치 · 경로 다름 |
| F19 | `BridgeStartupFixed_NoDrainNoPollRun.cfg` | `BridgeStartupFixed.tla` | O1 · Drain F · Recon none | INV TypeOK AtMostOneRun | 위반 (12) | AtMostOneRun 위반 · 12 · 325 | 판정 일치 · 경로 다름 |
| F20 | `BridgeStartupFixed_DropQFailRun.cfg` | `BridgeStartupFixed.tla` | D1 · QFail 1 | INV TypeOK AtMostOneRun | 위반 (12) | AtMostOneRun 위반 · 12 · 677 | 일치 |
| F21 | `BridgeStartupFixed_DropOnceRun.cfg` | `BridgeStartupFixed.tla` | D1 · Recon once | INV TypeOK AtMostOneRun | 위반 (12) | AtMostOneRun 위반 · 12 · 325 | 일치 |
| F22 | `BridgeStartupFixed_StallBootRun.cfg` | `BridgeStartupFixed.tla` | Stall T · B1 | INV TypeOK AtMostOneRun | No error (0) | No error · 0 · 9735 | 일치 |
| F23 | `BridgeStartupFixed_ReplayBootRun.cfg` | `BridgeStartupFixed.tla` | O1 · Replay T · B1 | INV TypeOK AtMostOneRun | No error (0) | No error · 0 · 36346 | 일치 |
| F24 | `BridgeStartupFixed_DropOnceSafe.cfg` | `BridgeStartupFixed.tla` | D1 · Recon once | INV TypeOK NoEarly NoFalse | NoFalse 위반 (12) | NoFalse 위반 · 12 · 515 | 판정 일치 · 경로 세부 다름 |
| F25 | `BridgeStartupFixed_PollRaw.cfg` | `BridgeStartupFixed.tla` | Recon pollraw | INV TypeOK NoEarly NoFalse AtMostOneRun | NoFalse 위반 (12) | NoFalse 위반 · 12 · 248 | 일치 |
| F26 | `BridgeStartupFixed_PollRawLive.cfg` | `BridgeStartupFixed.tla` | O1 · Recon pollraw | PROP ER Completes | No error (0) | No error · 0 · 7157 | 일치 |
| F27 | `BridgeStartupFixed_Restart.cfg` | `BridgeStartupFixed.tla` | O1 · Recon restart | INV TypeOK NoEarly NoFalse AtMostOneRun · PROP ER | ER 위반 (13) | ER 위반 · 13 · 820 | 일치 |
| F28 | `BridgeStartupFixed_RestartDropOnce.cfg` | `BridgeStartupFixed.tla` | D1 · Recon restart | INV TypeOK NoEarly NoFalse | NoFalse 위반 (12) | NoFalse 위반 · 12 · 510 | 판정 일치 · 경로 세부 다름 |
| F29 | `BridgeStartupFixed_RestartDropOnceLive.cfg` | `BridgeStartupFixed.tla` | D1 · Recon restart | PROP ER | 위반 (13) | ER 위반 · 13 · 1635 | 판정 일치 · 경로 세부 다름 |
| F30 | `BridgeStartupFixed_DonePrompt.cfg` | `BridgeStartupFixed.tla` | DoneWhen prompt | INV TypeOK NoEarly NoFalse | NoFalse 위반 (12) | NoFalse 위반 · 12 · 163 | 일치 |
| F31 | `BridgeStartupFixed_DoneWork.cfg` | `BridgeStartupFixed.tla` | O1 · DoneWhen work | INV TypeOK NoEarly NoFalse AtMostOneRun · PROP ER Completes | No error (0) | No error · 0 · 14929 | 일치 |

반례 내용은 §3.1·§3.2, 경로 차이의 이유는 §3.5.

("Completes" = `CompletesWhenAgentCompletes`, "ER" = `EventuallyResolved`, "NoEarly"/"NoFalse" = `NoEarlyCompletion`/`NoFalseCompletion`.)

## 7. 라운드별 변경

### 7.1 Round 1 → Round 2 (Astra 0219 지적별)

| 지적 | round 1 | round 2 변경 | 결론 변화(round-2 TLC 확인) |
|---|---|---|---|
| **H1** F2가 비동기 조회를 원자 읽기로 모델 | `Reconcile`이 `ast`를 읽고 같은 전이에서 적용 | `q` none→sent→snap→적용/실패, 이벤트와 독립 순서. round-1 F2 = `Recon "once"`로 보존 | round-1 F2는 **정체를 남긴다**(F10). F2' = 지속 폴링 + `qdirty` 폐기로 재설계(F1·F7) |
| **H2** 완료가 원자적·중복이 인접 | `Complete`가 즉시 결과; Fixed `Emit`이 한 FIFO에 `<<e, e>>` | 완료 = deferral + `cpc "scrape"` → `ScrapeDone`의 `requireDeferral` 가드; 소켓 2개 임의 교차 | 중복 `W`는 완료를 취소한다. 꼬리 `I` 유실이면 정체(F5). **유실 없이도 소켓 간 순서 역전으로 정체(F6)** |
| **M3** 타임아웃이 agent/큐 상태에 묶임 | `TimeoutPlausible` 무조건 | `VerifyTimeout` 벽시계; `LatencyBound`일 때만 `Plausible` | 가정 없음(C2–C4·F2) / 있음(C1·F1) 분리 |
| **M4** 활성화·ACK·pre-ACK push 혼동 | 현재: ACK까지 전부 유실; Fixed: 구독 즉시 활성 | `SrvReg` ≠ `SrvAck` ≠ `ConsumeAck` | 현재 설계는 ACK 전에도 가짜 완료(C9). Fixed 잔여 창 = 서버 ACK 쓰기 ~ 프롬프트 도착(F12) |
| **M5** F3가 정상 제출·idle만 다룸 | ghost `submitted` 요구; `done` 미처리 | `Stall` + `SubmitStall`; `done`은 범위 제외 | stall + 기동 status면 프롬프트 없는 완료(F14) |
| **M6** no-replay가 버전 미한정 | replay 없음 고정 | `Replay` 상수, `CloseFair` | 정체는 `Replay = FALSE` 조건부(C11·C13) |
| (추가) | — | `AtMostOneRun` 추가 | C3·C6·F8 |

### 7.2 Round 2 → Round 3 (Astra 0222 지적별, 판정은 round-3 TLC로 확인 — 예상과 전부 일치)

| 지적 | round 2 | round 3 변경 | 결론 변화 |
|---|---|---|---|
| **#1 (H)** drain 없는 변형의 안전·수용 한계 과장 | F3이 `AtMostOneRun` 미검사인데 "안전"으로 서술; 수용 한계에 오실패(F4)만 | 재주입 분기에 닿는 모든 Fixed 상수 집합에 `AtMostOneRun`: 통과 예상은 같은 cfg(F6·F11), 위반 예상은 짝 cfg(F17–F21), 통과 예상 짝(F22·F23). §2.4에 "안전 = 검사한 불변식만" 규칙 | **drain이 없으면 정상 구독 교체만으로 재주입 이중 실행**(F18·F19 TLC 위반, `MaxDrops = 0`·LB T — 실제 반례는 `W` 하나만 잃는 경로). 통과 예상(F6·F11·F22·F23)도 TLC 통과. F3 서술을 완료 불변식 2개 + ER로 한정. drain 실패 시 대가 = 오실패(F4) **+ 이중 실행(F18)** |
| **#2 (M)** scrape 실패 경로 누락 | 모든 scrape 반환이 `requireDeferral` | 두 모델에 `ScrapeErr`(`ScrapeFail`, 비공정): 실패 시 deferral 없이 완료(:2898/:2912). **모든 cfg `ScrapeFail = TRUE`** | **모델 판정 불변 — TLC 확인**(round-2와 겹치는 30 cfg 판정 동일; §3.1 끝의 논증). "취소 보장"은 scrape 성공 조건부로 정정. 모델 밖: 작업 중간 재진입이 scrape 실패 시 무시됨(§2.2) |
| **#3 (M)** "done은 프롬프트 뒤에만"이 불충분 | `done` 범위 제외 + "프롬프트 이후 가정" | 두 모델에 `AgentDone`·`DoneWhen`(`never`/`prompt`/`work`). Fixed F3'는 `done`도 펜스·보류 | **`prompt` 가정으로는 가짜 완료**(C15·F30, TLC 위반; C16·F31 TLC 통과) — F3' 보류도 반환 뒤 `done`은 못 막음. 안전 결론은 `done` 완전 제외(`never`, 기존 cfg 전부) 또는 `work` 가정(C16·F31)으로 한정 |
| **#4 (M)** `poll + qdirty`의 최소·필수성 미입증 | `poll`이 연속 조회와 폐기를 한꺼번에 바꿈 | `Recon = "pollraw"`(연속, 폐기 없음)·`"restart"`(취소 뒤 재조회, 폐기 없음) 추가; F24–F29 | 폐기는 안전에 필요(F25 vs F1), 연속성은 활성에 필요(F27 vs F26) — **검사한 다섯 변형 안에서**, TLC 확인(F24–F29 판정 예상 일치). §0·§5 표현을 "검사 범위에서 통과한 후보 집합"으로 변경, 최소성 주장 철회. 덤: `once`도 오래된 `idle` 스냅샷으로 가짜 완료(F24) |
| **#5** herdr 버전 | 0.7.x 근거만 | 로컬 herdr **0.9.5** 명시(헤더·§0.1-5·§1.2·§2.3) | replay 부재(0.7.4/16)·단조 마커 부재(0.7.5 픽스처)는 **0.9.5 미확인** — 라이브 확인 목록 대상 = 0.9.5 |

## 8. 0.45.4 watchdog 오라클 (P0)

PLAN [§0.45.4](../PLAN.md) P0(D8 · R14 · R68-M1 · R68-M2)의 수용 오라클이다. 모델 = `docs/spikes/tla/bridge-startup/BridgeStartupWatchdog.tla` + cfg 일곱(R68 개정 `09ef503` — 요청 · 응답 분리 `WdGetReq` / `WdGetResp` · `wsnap` · `wregen` · 유예 중 `W` → `armed` · `ConsumeStatus` `WdReask`). TLC는 아키텍트가 실행했다(2026-10-23, 레인 안 Java 차단). 개정 전 판정(`015507b` — `_Gap` 891 · `_Drop` 990)은 대체된다.

| cfg | 기대 | 결과 | exit | distinct |
|---|---|---|---|---|
| `BridgeStartupWatchdog_Gap.cfg` | No error(INV `TypeOK NoEarlyCompletion NoFalseCompletion WatchdogSound` · PROP ER) | No error | 0 | 1,188 |
| `BridgeStartupWatchdog_Drop.cfg` | No error(같은 INV · PROP) | No error | 0 | 1,308 |
| `BridgeStartupWatchdog_GapReplay.cfg` | No error(같은 INV · PROP — R68-M1) | No error | 0 | 3,048 |
| `BridgeStartupWatchdog_GapCompletes.cfg` | `CompletesWhenAgentCompletes` 위반(설계대로 — watchdog는 완료가 아니라 실패로 끝낸다) | CWAC 위반 | 13 | — |
| `BridgeStartupWatchdog_GapRun.cfg` | `AtMostOneRun` 위반(기존 C6 · F8과 같은 판정 — R14 구조 주장) | `AtMostOneRun` 위반 | 12 | — |
| `BridgeStartupWatchdog_DropRun.cfg` | `AtMostOneRun` 위반(같음) | `AtMostOneRun` 위반 | 12 | — |
| `BridgeStartupWatchdog_GapVerified.cfg` | ER 위반(대상 술어 = "검증 완료"면 C5 창이 남는다 — R3 근거) | ER 위반 | 13 | — |

exit는 머리말 규약(0 = No error · 12 = 불변식 위반 · 13 = 활성 속성 위반)에 따른 판정 종류다. 위반 cfg의 distinct는 이 절에 기록하지 않았다.

**도달 확인(공허한 통과 배제):** `wdFired`(watchdog 발화) · `wq = "get"`(조회 진행 중) · `wregen`(재조회 표지) · `wregen ∧ wq = "get"`(조회 중 재조회 표지 — R68-M2) 모두 도달함을 확인했다. 따라서 `_Gap` · `_Drop` · `_GapReplay`의 No error는 발화 · 조회 · 재조회 경로를 실제로 지난 결과다.

**판정:** 일곱 판정 전부 PLAN P0 기대와 일치 → P0 done · P1 착수 가능(PLAN §0.45.4 Done (a)).

## 부록 A. Round-1 TLC 기록 (대체됨)

2026-10-23, TLC 1.8.0 (`TLC2 Version 2026.10.20.183001 (rev: d2e1472)`) · `tla2tools.jar` sha256 `5bd7b64d…b1e2` · Java 17
(Oracle 17.0.6, aarch64) · `-deadlock -workers 4`, 아키텍트 실행. round-1 모듈에 대한 판정:
현재 기준선 No error · `_Gap` EventuallyResolved 위반 · `_GapCompletes` 위반 · `_Boot` NoEarly 위반 · `_BootNoFalse` 위반 ·
Fixed 기준선 No error · `Fixed_Drop` No error · `Fixed_DropCompletes` 위반 · `Fixed_Boot` No error · `Fixed_BootNoFalse` 위반.
Astra 0219가 지적한 대로 Fixed의 No error 3건은 원자 조회(H1)·원자 완료/인접 중복(H2)·ghost 반환 조건(M5)에 기대므로
**round-2 판정으로 대체**했다(그리고 round-2 판정은 round-3 모델 TLC로 재확인됐다 — §3).
