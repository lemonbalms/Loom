# 워커 pane 종료 인지 — 판정·바인딩 설계 (설계 전용 · 적용 없음)

| Field | Value |
|---|---|
| **Date** | 2026-07-20 |
| **Scope** | Loom bridge의 card/conv pane 종료 인지·완료 판정 |
| **Status** | **design only** — 제품 코드 변경 없음 |
| **원인 판정** | **부분 규명, 최종 원인은 미확정** — 오늘 로그의 `PaneDied for unknown pane`은 브릿지 메시지가 아니며, 관측 종료는 모두 `pane.close` 뒤에 발생했다 |
| **권고** | **B — 종료 펜스 + 결과-커밋 tombstone + bounded reconcile** |
| **Wire** | card contract v1 유지; 기존 `failed` + `reason`/`note`로 표현 |
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
| 결과 커밋 전 terminal event 이후 `done` 금지 | ✅ | terminal fence + exactly-once arbitration |
| 결과 ACK 후 Loom이 요청한 cleanup vs 선행 종료 구분 | ✅ | `resultCommittedAt`·`cleanupRequestedAt` 순서로 구분 |
| `pane.closed` 이벤트 유실 시 active pane 부재 탐지 | ✅ | 동일 노드의 `session.snapshot`/`pane.list` bounded reconcile |
| Codex `Working (11m • esc to interrupt)`를 진행 중으로 인식 | ✅ | agent-kind별 실측 패턴 + 음성 케이스 유닛 |
| `status=done`이 와도 실제 work-start 없으면 완료 거부 | ✅ | `sawWorking` 또는 동등한 제출-성사 증거를 필수 게이트로 |
| card result v1·M-1·L-2 불변 | ✅ | 신규 필수 필드 없이 기존 `failed/reason/note` 사용 |
| herdr v0.7.4가 자연사 시 내는 이벤트 종류·순서 | ⚠️ | 정적 schema만으로 불충분; 실제 pane kill 스모크 필요 |
| exit code 0/SIGHUP/SIGKILL이 “작업 품질”을 뜻하는가 | ❌ | 뜻하지 않는다. cleanup 원인과 결과 커밋 순서만 기계 판정 |
| 종료 직전 남은 TUI 텍스트가 충분한 산출물인가 | ❌ | 사람/타워가 diff·테스트·artifact를 검증해 최종 결정 |
| A/C의 산출물이 제품 요구를 정말 충족했는가 | ❌ | 오늘은 아키텍트 사후 검증 결과일 뿐, 범용 규칙으로 승격 금지 |

핵심 분리:

- **transport/lifecycle 판정**은 브릿지가 코드로 잠근다.
- **산출물 의미 판정**은 타워/사람에게 남긴다.
- 따라서 `pane 종료 전 최종처럼 보이는 텍스트`만으로 브릿지가 `done`을 만들지 않는다.

## 0. 요약 (3줄)

1. `PaneDied for unknown pane`은 **herdr 내부** `herdr::app::actions` 경고다. 브릿지가 card를
   못 찾았다는 로그가 아니며, 오늘 212–215·217은 모두 `pane.close` RPC가 먼저였다.
2. 실제 Loom 결함은 종료 통지 폐기라고 단정할 수 없다. 더 확실한 결함은 **완료 후보를 너무
   일찍 `done`으로 커밋하고 그 결과로 pane을 닫는 것**이다. 213의 exit는 원인이 아니라 결과다.
3. 권고 B는 `done` result ACK를 완료 커밋점으로 삼고, 그 전 pane 종료는 `blocked`용 failed
   result로 남긴다. 커밋 뒤 bridge cleanup의 SIGHUP/SIGKILL은 정상 cleanup으로 분류한다.

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
- 새 generation ACK 후 연결 정착
- pre-ACK close/timeout reject
- 실패 호출의 신규 entry만 rollback
- closed pane subscription prune
- startup global `pane.closed`

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
- terminal fence는 **pane이 실제로 끝났을 때 late `done`을 막는 뒷단 게이트**다.
- 둘 중 하나만 고치면 다른 실패가 남는다. 권고안은 병행한다.

## 5. 선택지

| 안 | 내용 | 비용 | 주 리스크 | 되돌리기 비용 | 판정 |
|---|---|---:|---|---:|---|
| **A — 패턴 보강만** | Codex `Working (…)`를 still-running에 추가, `done && !sawWorking` 거부 | 소 | 실제 종료 유실·binding gap은 그대로 | 소 | 불충분 |
| **B — 종료 펜스 + tombstone + reconcile** | 결과 ACK를 commit점으로, binding phase 유지, `pane.closed` + bounded snapshot reconcile, agent별 진행 패턴 | 중 | phase race 구현 복잡성; herdr 실제 event 순서 선실측 필요 | 중 | **권고** |
| **C — `pane.exited` 직접 구독 중심** | exit event·signal/code로 분류하고 final scrape 시도 | 중 | v0.7.4 subscribe surface/payload 미실측; code/signal 의미 오판 | 중 | 보조 센서만 가능 |
| **D — 워커 완료 마커/sidecar 필수화** | 워커가 bridge-readable 완료 marker/파일을 commit하고 종료 | 대 | untrusted echo 오탐, 3 agent 호환, 새 로컬 프로토콜·CONV 범위 확대 | 대 | 현 단계 비권고 |

### A — 패턴 보강만

장점은 213류·Codex Working류를 가장 싸게 줄인다는 점이다. 그러나 event delivery 자체를 증명하지
않고, result send 전 binding dispose도 남긴다. “pane 사망을 브릿지가 인지” 목표 ①을 만족하지
못하므로 단독 채택 불가다. B의 한 구성요소로만 쓴다.

### B — 종료 펜스 + 결과-커밋 tombstone + bounded reconcile ★권고

기존 wire와 herdr op를 유지하면서 lifecycle을 명시한다.

```text
spawned → submitted → running → completion_candidate → result_sending
                                               ├─ ACK → result_committed → cleanup_requested → terminal_expected
                                               └─ terminal before ACK → terminal_uncommitted → failed/blocked
```

핵심은 active `Flight`를 result send 전에 삭제하지 않는 것이다. 완료 뒤에도 짧은 tombstone을 남겨
나중 `pane.closed`를 `expected cleanup`으로 분류한다. event가 유실되면 동일 herdr 노드의
`session.snapshot`/`pane.list`에서 **연속 2회 absent + grace**일 때 terminal로 합성한다. 한 번의
snapshot miss만으로 죽이지 않는다.

비용은 phase arbitration과 타이머 테스트다. 되돌릴 때도 기존 delete-before-send로 돌아갈 수 있으나,
그 경우 오늘의 무관측 gap이 부활한다.

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

## 6. 권고 B 상세

### 6.1 binding/phase SSOT

card/conv 공통 terminal registry가 최소 다음을 가진다(이름은 구현 시 확정).

```ts
type PaneLifecycle = {
  paneId: string;
  owner: { kind: "card"; cardId: string } | { kind: "conv"; convId: string };
  phase: "spawned" | "submitted" | "running" | "completion_candidate" |
    "result_sending" | "result_committed" | "cleanup_requested" |
    "terminal_uncommitted" | "terminal_expected";
  sawWorking: boolean;
  resultCommittedAt?: string;
  cleanupRequestedAt?: string;
  terminalObservedAt?: string;
};
```

별도 relay wire 필드는 필요 없다. `Flight` 내부 필드 또는 bridge-local registry다. 프로세스 재시작
내구 저널은 이 PATCH의 범위 밖으로 남긴다. 즉 **bridge 자체 crash 뒤 active binding 복원은 여전히
미해결**이며, 본 설계가 그 문제까지 해결한다고 쓰지 않는다.

### 6.2 판정 규칙 초안

우선순위가 중요하다.

1. **Terminal fence**: `pane.closed`/검증된 `pane.exited`/bounded reconcile absent가
   `result_committed` 전에 관측되면 completion task/poll을 취소한다. 이후 어떤 late status/read도
   `done`을 만들 수 없다.
2. **Start evidence**: `status=done` 단독은 충분하지 않다. `sawWorking=true` 또는 구현 시 R에서
   동등하다고 명시 승인한 제출-성사 증거가 없으면 `completion_without_start`로 fail-visible 처리한다.
3. **Activity fence**: agentKind별 active indicator가 남아 있으면 completion을 유예한다.
   - 공통/Grok: `N command(s) still running`
   - Codex: tail의 live `Working (<duration> …)`
   - Claude: 현행 status/hookHint와 실측 live indicator
   패턴은 tail·line anchor·TUI chrome 음성 케이스를 갖고, prompt echo 전체 검색은 금지한다.
4. **Result commit**: 위 게이트를 통과한 scrape로 v1 result를 만들고 `sendResult()` ACK가 true일 때만
   `result_committed`다. 그 전에는 board 관점 완료가 아니다.
5. **Cleanup**: committed 뒤에만 `cleanup_requested`를 기록하고 `pane.close`한다. 뒤따르는 code
   129/SIGKILL/pane.closed는 `terminal_expected`; 추가 failed result를 보내지 않는다.
6. **Uncommitted terminal**: failed result를 exactly once 보낸다.
   - `status="failed"`
   - `reason="pane_terminated_before_commit"`
   - `note`에 `phase`, 관측 source(`pane.closed|pane.exited|reconcile`), final-output evidence 유무를
     500자 안에서 기록
   타워 board는 `blocked`가 된다. 사람은 diff/test/artifact를 검증해 done 또는 재작업을 결정한다.
7. **Unknown pane event**: registry에 없는 terminal event는 최소 structured log/counter를 남긴다.
   오래된 tombstone과도 안 맞을 때만 `unbound_terminal`이다. 이 로그가 있어야 다음 실측에서 실제
   binding 유실을 증명할 수 있다.

### 6.3 오늘 세 케이스 대조

| 케이스 | 관측 | 초안 판정 | 왜 맞는가 |
|---|---|---|---|
| **A — SIGHUP, 산출물 정상** | pane.close 뒤 exit 129; 결과/marker 회수 시점은 로그 불충분 | result ACK가 선행했으면 `terminal_expected`; 아니면 `failed/pane_terminated_before_commit` → board blocked, 사람 검증 후 done | SIGHUP 자체를 실패 의미로 쓰지 않으며, 정상 산출물을 자동 폐기하지도 않음 |
| **C — SIGKILL, 산출물 정상** | pane.close 뒤 Killed:9; 아키텍트가 diff/test로 사후 확인 | A와 동일 | SIGKILL도 bridge cleanup escalation일 수 있음(215 실증) |
| **213 — exit 0, 미착수 초기 TUI** | spawn 6초, `sawWorking` 근거 없음, 초기 화면 scrape, close가 exit보다 먼저 | `completion_without_start`; `done` 금지. cleanup 요청 전이면 blocked | exit 0과 “작업 완료”를 분리하고 초기 TUI false done 차단 |

이 표의 A/C는 일부러 “자동 done”으로 단정하지 않는다. 오늘 아키텍트의 품질 판정을 일반화하면
다음에는 prompt echo나 반제품을 성공으로 승인한다. **정확한 기계 분류는 `committed success`와
`uncommitted/needs verification`의 구분**이다. board `blocked`는 실패 확정이 아니라 타워 검증
요청 상태다.

### 6.4 still-running 0.23.7과의 결합

현행 deferral ownership(`flight.stillRunningDeferral`)은 유지하되 terminal fence가 더 높은 우선순위다.

```text
completion-class status
  → terminal already observed? yes: no done
  → sawWorking/start evidence? no: fail-visible
  → active indicator? yes: existing deferral poll
  → scrape stable: result_sending
```

- terminal event가 deferral 중 오면 timer를 취소하고 uncommitted terminal로 단 한 번 끝낸다(현행
  `still-running.test.ts` ⑦의 확장).
- Codex `Working (…)`는 기존 패턴에 추가한다. death sensor가 이 유예를 대체하지 않는다.
- deferral 5분 상한에서 indicator가 여전히 live이면 현행처럼 `done`을 내는 정책은 목표 ②와
  충돌 소지가 있다. 권고 B에서는 **상한 소진을 `done` 근거로 쓰지 않고 blocked/uncertain으로
  재검토**해야 한다. 이 변경은 R{n}에서 명시 승인받는다.

### 6.5 M-1·L-2·CONV_SPEC·원격 노드 정합

- **M-1**: dispatch allowlist/claim 순서는 건드리지 않는다. terminal event는 로컬 herdr socket에서
  오지만, 그것만으로 done을 만들지 않으므로 권한 확대가 없다.
- **L-2**: result `node`와 board assignee 대조를 그대로 둔다. terminal failure도 동일 v1 result를
  쓰므로 우회하지 않는다.
- **card-contract v1**: `status=failed`, optional `reason`/`note`가 이미 있다. 새 필수 필드나 version
  bump 불필요. body가 `[DONE]/intent: card.done`인 것은 “result envelope 도착” 의미로 유지하되,
  board 의미는 payload status가 정본이다.
- **CONV_SPEC**: conv pane terminal은 기존처럼 `blocked` turn을 보내고 타워가 결정한다(§1.3-1.4,
  §3.4). worker가 terminal event로 일방 `done_proposal`/close하지 않는다.
- **WSL/VPS**: 판단 입력은 bridge와 같은 노드의 herdr socket event·snapshot·result ACK뿐이다.
  macOS PID/launchd/log path에 기대지 않는다. signal 이름은 observability일 뿐 권위가 아니다.

## 7. 검증 계획

### 7.1 유닛/통합 — 제품 코드에서 반드시 잠글 것

1. `agent.start` 반환 paneId가 registry에 등록되고 status/terminal 모두 같은 owner로 demux된다.
2. `done` before `working` → `completion_without_start`, done result 0건.
3. Codex `Working (11m • esc to interrupt)` tail → deferral; brief echo/non-tail 동일 문자열 → 비매치.
4. terminal during settle/read/deferral/result-send 각 race → failed exactly once, late done 0건.
5. result ACK true → cleanupRequested → pane.closed/SIGHUP 상당 event → done exactly once, failed 0건.
6. result send false → cleanup 금지, terminal 도착 시 blocked; binding이 send 전에 사라지지 않음.
7. tombstone TTL 안 terminal → expected; TTL 뒤 unknown → structured `unbound_terminal` 1건.
8. event 누락 + snapshot absent 1회 → 유지; 연속 2회+grace → terminal 합성; pane 재등장 → 취소.
9. 순차 카드 3개에서 subscription snapshot/global terminal subscription 유지 — 0.23.4 회귀.
10. conv terminal → blocked turn, done_proposal/close 0건 — CONV_SPEC 회귀.
11. M-1 deny·L-2 mismatch 기존 테스트 green; terminal failure도 L-2를 통과해야만 board 반영.
12. still-running 상한 소진 정책을 R 결정대로 고정: 권고는 done 0건 + blocked 1건.

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
| submitted 뒤 work-start 전 exit 0 | failed/blocked 1, done 0 |
| working 중 HUP/KILL | failed/blocked 1, done 0, terminal source 기록 |
| valid result ACK 뒤 bridge auto-close | done 1, failed 0, expected cleanup log |
| final marker처럼 보이는 text 뒤 ACK 전 kill | auto done 0, `completion_evidence` note + blocked |
| Codex Working 화면에 completion-class status 주입 | deferral, result 0 |
| event stream 강제 disconnect 동안 pane 종료 | reconcile로 blocked, silent doing 잔존 0 |

Mac 1회 뒤 **WSL 또는 VPS 한 노드에서 동일 핵심 3경로**(working kill, committed cleanup, reconnect
reconcile)를 반복한다. 원격 검증은 같은 bridge-local socket/API를 써야 하며 Mac 로그 경로를 scp해
판정하는 방식은 금지한다.

## 8. R{n} 판정

**필요 (`rgate=needed`).** Wire version은 안 바뀌지만 다음 의미가 바뀐다.

- board `done`의 권위 조건(`status=done` 단독 허용 → start/activity/terminal/result-ACK fence)
- still-running 상한 소진의 done 처리
- pane 자동 cleanup과 terminal race arbitration
- conv pane terminal의 공통 registry 접점

이는 `WORKFLOW.md §5.1`의 단순 Low/문서 정리가 아니다. 새 MCP/wire 표면은 없지만 completion
attestation이라는 신뢰 경계와 기존 R29/R32/R33 M-lock에 인접한다. 따라서 PLAN PATCH를
`pending-review`로 올리고 Fable 5가 최소 다음을 검토해야 한다.

1. `result_committed` 정의가 relay ACK true로 충분한가
2. still-running 상한 소진을 blocked로 바꾸는 호환 영향
3. reconcile absent 2회+grace의 오탐/유실 경계
4. conv가 CONV_SPEC의 타워 확정 권한을 보존하는가
5. v1 optional `reason/note`만으로 운영자가 uncommitted terminal을 충분히 구분하는가

R 전에 구현하지 않는다. D처럼 sidecar/nonce protocol까지 확대하면 별도 MINOR + CONV_SPEC 개정
후 재리뷰가 필요하다.

## 9. 미확정 항목 — 구현자가 먼저 닫아야 할 것

1. **자연사 event**: real herdr v0.7.4가 process exit에 `pane.closed`와 `pane.exited` 중 무엇을
   subscribe push로 보내는가. 둘 다이면 순서는 무엇인가.
2. **payload**: exit code/signal이 socket event에 실제 포함되는가. fixture schema의 general
   `pane_exited`는 pane/workspace ID만 보인다.
3. **`PaneDied unknown` 의미**: 로그상 herdr 내부 registry miss까지는 확정했지만, 왜 API close마다
   이미 registry에서 제거된 child-exit callback이 뒤늦게 오는지는 upstream source/issue 또는 raw
   probe가 필요하다. Loom binding과 동일한 registry라고 쓰면 안 된다.
4. **213 status sequence**: 초기 TUI가 어떤 `pane_agent_status_changed` sequence로 completion을
   촉발했는지 bridge ingress 로그가 없어 미확정. 다음 스모크에는 event name/status/phase만
   구조 로그로 남겨야 한다(본문 금지).
5. **A/C commit timing**: 정상 산출물은 사후 확인됐지만 result ACK/marker/close의 정확한 순서가
   보존되지 않았다. signal만으로 역추론하지 않는다.
6. **bridge restart**: in-memory registry/tombstone은 bridge crash 후 사라진다. claim-after-crash
   저널/supervision은 기존 out-of-scope이며 본 PATCH가 해결하지 않는다.
7. **cleanup timeout**: result commit 뒤 `pane.close` ACK는 왔으나 terminal event가 영원히 안 오면
   tombstone TTL과 pane leak을 어떻게 처리할지 R에서 수치 확정이 필요하다.

## 10. 구현 게이트 체크리스트

- [ ] Smoke 0로 `pane.closed`/`pane.exited` 실 API shape·ordering 고정
- [ ] PLAN PATCH 작성, unknowns에 §9 반영
- [ ] Fable 5 R{n} approved
- [ ] B phase registry + terminal fence 구현
- [ ] Codex Working pattern + start evidence gate 구현
- [ ] bounded reconcile 구현(한 번의 miss로 terminal 판정 금지)
- [ ] unit/integration §7.1 green
- [ ] Mac Smoke 1 green
- [ ] WSL/VPS 한 노드 Smoke 1 핵심 경로 green
- [ ] 기존 M-1·L-2·0.23.4·0.23.7·CONV_SPEC 회귀 green
- [ ] HANDOFF/todo 동기화는 구현 웨이브에서 수행

[PANE-DEATH-DESIGN-DONE] cause=uncertain options=4 recommend=B-종료펜스 rgate=needed
