# PANE-DEATH — 완료 권한 경계 재설계

| Field | Value |
|---|---|
| **Date** | 2026-07-21 |
| **Status** | **approved — R43b author-close, 구현 없음** |
| **PLAN** | v0.27.0 revision A |
| **Canonical** | 이 문서가 v0.27.0 구현 판단의 유일한 설계 정본 |
| **Supersedes** | `PANE-DEATH-DESIGN.md`의 상태기계·락·체크리스트. 구 문서의 관측·실험 기록은 역사 증거로만 보존 |
| **Compatibility** | card contract v1과 `done|failed` enum, relay/conv wire, MCP **이름·입력 schema**, herdr RPC 표면 유지. remote `done`의 Tower 적용 의미는 의도적으로 `done→blocked`로 변경 |

## 1. 결론

v0.27.0은 ACK·seq·reconcile·cleanup을 한 상태기계에서 해결하지 않는다. 이번 버전은
**authority cut 하나만** 수행한다.

> 브릿지는 완료를 확정하지 않는다. 원격 result 적용 경로도 어떤 payload로부터 board `done`을
> 만들지 않는다. 제품이 강제하는 완료 경계는 **명시적 로컬 board mutation**이다. 그 mutation을
> 사람이 워킹트리 검증 뒤에만 수행한다는 것은 v0.27의 운영 규약이며 provenance로 강제되지 않는다.

불확실한 status, scrape, hook, terminal, presence, timeout은 정확도를 높이기 위한 관측일 뿐이다.
이 신호들은 되돌릴 수 있는 attention/verification 요청과 진단만 만들 수 있다. 자동 `done`과
자동 `pane.close`는 만들 수 없다.

## 2. 왜 기존 접근을 폐기하는가

기존 설계는 네 문제를 한 `Flight` 상태기계에 결합했다.

1. 작업 의미 판정: 정말 끝났는가.
2. result 전달: tower에 도착했는가.
3. 중복 억제: 같은 의미 이벤트인가.
4. pane 정리: 언제 닫아도 되는가.

이 결합 때문에 센서·relay ACK·`cardSeq`·TTL·dispose가 서로의 correctness 근거가 됐다.
R43은 그 결과로 PLAN 내부 모순, 락 8 자기모순, tower seq 소비자 파괴, Flight-less 경로,
죽은 latch, durable alert 매체 부재를 동시에 확인했다.

새 설계는 안전성, 전달 liveness, cleanup을 순서대로 분리한다.

1. **v0.27.0 — authority cut:** 거짓 자동 성공과 자동 pane 파괴를 불가능하게 한다.
2. **후속 A — durable delivery:** outbox, stable event ID, tower dedup, apply receipt를 설계한다.
3. **후속 B — verifier provenance + explicit cleanup:** 검증 provenance와 tower→bridge cleanup
   grant를 설계한다.

## 3. 권한 표

| 주체 | 소유하는 것 | 소유하지 않는 것 |
|---|---|---|
| Worker/pane | 산출물과 실행 흔적 | board 상태 |
| Bridge | 관측 수집, result proposal 1회 발행, 진단 | `done`, 최종 실패 판정, 자동 cleanup |
| Tower remote-result ingress | 원격 result를 `blocked`/attention으로 기록 | 원격 result 기반 `done` |
| 명시적 로컬 board mutation | `done` 또는 재작업 결정 | 사람/verifier provenance 증명 |
| Cleanup/GC | 향후 명시 grant 뒤 pane/레코드 정리 | 완료 판정 |

권한은 문구가 아니라 양쪽 실행 경로에서 잠근다.

- Bridge 타입/API는 `status="done"`을 구성할 수 없다.
- Tower의 remote-result ingress는 legacy `status="done"`도 `blocked`로 격리한다.
- MCP `update_task`, CLI `board set`, sticky RPC, board import 등 명시적 로컬 mutation의 `done`
  경로는 유지한다. v0.27은 이 호출자의 사람/verifier provenance를 증명하지 않는다.

## 4. v0.27.0 범위

### A1. Bridge completion API를 proposal 전용으로 축소

`finishCard(status, ...)`처럼 완료 상태를 입력받는 API를 없애고 completion 경로를
`proposeCardVerification(...)` 형태로 제한한다.

- wire 호환을 위해 payload status는 기존 enum의 `failed`를 사용한다.
- reason은 `needs_verification`으로 고정한다.
- 별도 proposal builder가 `failed` status에서도 관측 source와 실제 output summary를 보존한다.
  현행 failed-summary 치환(`failed reason=...`)을 그대로 재사용하지 않는다.
- bridge card 경로에서 `status="done"` 구성은 0곳이어야 한다.

구 tower도 `failed`를 `blocked`로 적용하므로 **새 bridge → 구 tower** 배포 순서가 안전하다.
새 status enum은 구 tower의 Zod parse를 깨뜨리므로 이번 버전에는 추가하지 않는다.

### A2. Tower ingress에 authority fence 추가

`applyCardResult`의 원격 card-result 경로는 payload가 legacy `status="done"`이어도 board `done`으로
전이시키지 않는다. 현행 적용 순서는 **schema parse → task lookup → assignee/fromNode authenticity
guard → terminal-task guard → stale-seq guard → 상태 매핑**이다. 앞의 다섯 단계를 그대로 통과한
fresh/non-terminal result에만 아래 격리 매핑을 적용한다. "terminal/stale guard가 먼저"라는 축약은
authenticity guard를 건너뛰는 구현을 허용하므로 사용하지 않는다.

- `done` → `blocked`, reason `legacy_remote_done_requires_verification`
- `failed` → 기존처럼 `blocked`
- 명시적 로컬 board mutation의 `done`은 이 ingress를 통과하지 않으므로 유지

이 의미 변경은 공개 계약에 반영한다. MCP `apply_card_result` 설명, `HERDR_DESIGN.md`,
`DISPATCH-DEMO.md`, card-ops/MCP 테스트의 `done→done` 기대를 `remote result→blocked`로 갱신한다.
`apply_card_result`는 “완료 적용”이 아니라 “verification proposal 기록” 표면이다.

따라서 **구 bridge → 새 tower**도 안전하다. rolling upgrade 어느 순서에서도 원격 자동 성공이 없다.

### A3. dispatch-scoped 단일 issuer

result 발행 소유자는 `Flight`가 아니라 dispatch-scoped issuer다.

1. M-1 dispatcher authorization과 `CARD_DISPATCH_LABEL` attachment 존재 확인 뒤, payload parse 전
   `dispatchHandoffId`·`fromPeerId`로 issuer를 만든다. `cardId`는 parse 결과 또는 issue 시점에 결속한다.
2. 기존 claim-success 게이트는 유지한다. claim 실패 시 issue를 금지하고 issuer를 폐기한다.
3. issuer는 `issue()` 진입 시 await 전에 동기 latch를 획득한다.
4. 한 dispatch가 원격 result를 구성·발행하는 횟수는 최대 1회다.
5. terminal/status/timeout이 경쟁해도 첫 proposal 뒤 두 번째 semantic result를 만들지 않는다.
6. issued tombstone은 Flight retirement와 분리해 기존 processed-handoff 수명 동안 유지한다.
   동일 `dispatchHandoffId` replay가 새 issuer를 만들어 재발행하지 못한다. 이 보장은 현재 bridge
   프로세스 수명에 한정되며 crash/restart dedup은 후속 A다.

이 경계는 R43의 Flight-less 세 경로에도 같은 소유권을 제공한다. `Flight`는 pane 관측 객체로만
남고 result 권한을 소유하지 않는다.

### A4. card 자동 pane cleanup 제거

card worker의 자동 `pane.close` 3경로를 제거한다.

- `events_subscribe_failed`
- `inject_unconfirmed`
- 정상 completion/result 발행 뒤 cleanup

status, scrape, hook, terminal, timeout, relay ACK는 어느 것도 pane을 닫을 권한이 없다.
v0.27.0에서는 pane을 보존하고 운영자가 수동 정리한다. root pool shell cleanup처럼 card worker
수명과 무관한 경로는 별도이며 이 변경 대상이 아니다.

`paneCleanup:"auto"`는 v0.27부터 **conv 명시 close만 제어하고 card worker에는 효과가 없다.**
pool-root close는 이 설정과 무관한 placement 내부 정리이며 동작을 바꾸지 않는다. config 설명,
bridge status 도움말, `pane-cleanup.test.ts`를 이 의미로 갱신한다.

### A5. identity와 전달 의미론 동결

이번 버전은 `cardSeq`를 삭제하거나 의미를 바꾸지 않는다.

- 현재 값은 agent name, hook socket, Flight/result에 함께 쓰이는 혼합 per-card ordinal이다.
- tower는 scalar `last_seq`를 소비한다.
- seq 변경과 tower dedup 변경을 분리하면 새 dispatch result가 조용히 유실될 수 있다.

따라서 v0.27.0은 기존 seq·`dispatchHandoffId`·wire 필드를 그대로 유지한다. relay ACK는 진단 입력일
뿐 tower 적용 증거나 cleanup 권한이 아니다. exactly-once와 재전송은 주장하지 않는다.

### A6. 로컬 관측 상태의 지위

Flight retirement는 board 완료나 pane cleanup을 뜻하지 않는다. issuer 시도가 끝난 뒤 로컬 관측
객체를 정리할 수 있지만, 그 사실로 `done`, 추가 result, `pane.close`를 만들 수 없다. 전달 실패는
기존 delivery-unconfirmed 진단으로 남긴다.

이 버전에는 durable outbox가 없으므로 bridge crash나 relay 단절 시 proposal이 유실될 수 있다.
이는 정직하게 남기는 **liveness debt**이며 후속 A 이전에는 “유실·고아 해소”를 주장하지 않는다.

## 5. 상태와 전이

v0.27.0에는 통합 `PaneLifecycle`을 만들지 않는다.

```text
bridge observation
  └─ uncertain/deterministic signal
       └─ dispatch issuer (first issue wins)
            ├─ remote result accepted or unknown
            └─ no second semantic result

tower remote-result ingress
  └─ any remote result ──> blocked / needs verification

explicit local board mutation
  ├─ operator policy says verified ──> local board done
  └─ invalid/incomplete ──> rework / blocked

pane cleanup
  └─ manual only in v0.27.0
```

센서 관측과 전달 상태는 card 의미 상태를 전이시키지 않는다. timeout은 재관측·알림 주기를 정할 수
있지만 완료, 실패, close, destructive cleanup의 근거가 아니다.

## 6. 후속 경계

### 후속 A — Durable Delivery

별도 PLAN/R{n}에서 다음을 함께 설계한다.

- stable `attemptId=dispatchHandoffId`
- stable semantic `eventId`
- persist-before-send outbox와 crash durability
- 동일 event ID 재전송
- tower의 atomic dedup + apply receipt
- Flight-less 경로의 startup recovery

relay ACK는 relay 수락만 뜻하며 tower apply receipt를 대신하지 않는다. outbox가 구현되기 전에는
result delivery liveness를 완료로 표기하지 않는다.

### 후속 B — Explicit Cleanup/GC

검증 provenance와 별도 cleanup grant를 보내는 역방향 계약이 필요하다. grant는 attempt,
proposal event, pane binding/generation에 결속한다. 이 계약이 없으므로 v0.27.0 card 자동 cleanup은 0이다.

TTL은 이미 cleanup 적격인 레코드를 스캔하는 시점일 뿐 삭제 권한이 아니다. 사람 결정이나 receipt
없이 TTL만으로 close·GC·dispose하지 않는다.

### 범위 밖

- conv의 ACK 폐기와 비가역 state advance
- bridge restart 뒤 pane binding 복원
- 새 result status enum
- relay wire, MCP 도구 이름·입력 schema, herdr RPC 표면 변경. 단 MCP `apply_card_result`의
  remote `done` 적용 의미는 이 버전에서 의도적으로 바뀐다.
- 자동 verifier 재도입

## 7. R43 disposition

| R43 | 새 설계의 처리 |
|---|---|
| H1 D4↔D7 dispose 모순 | timeout dispose 요구를 삭제한다. v0.27에 card 자동 cleanup이 없다. |
| H2 락 8 자기모순 | 구 락 8을 비규범화한다. 상수는 권한을 만들지 않는다. |
| H3 seq가 tower 소비자 파괴 | seq 변경을 v0.27에서 제거한다. |
| H4 Flight-less 3경로 | issuer를 authorization+card attachment 확인 뒤·parse/spawn 전에 생성한다. |
| H5 죽은 latch/순서 역전 | result 권한을 Flight에서 제거하고 동기 first-issue latch 하나로 축소한다. |
| H6 durable alert 매체 부재 | durability 완료 주장을 삭제하고 후속 A의 명시적 게이트로 남긴다. |
| M1 ACK 완료 증명 과장 | ACK를 correctness 하드 게이트에서 진단 입력으로 격하한다. |
| M2 D1-b 미완 중간 상태 | 순서 역전 스파이크와 통합 phase 설계를 삭제한다. |
| M3/M4 conv 과소 범위 | conv 잔존 위험을 범위 밖에 명시하고 card-only 완료를 주장하지 않는다. |
| M5 reconcile 소실 | pane-death reconcile을 v0.27에서 제거한다. delivery reconcile은 후속 A다. |

R43의 기존 결함을 문장별로 봉합한 것이 아니라, 결함을 만들던 결합 자체를 제거했다. R43b는 기존
D1~D8 반영 충실도가 아니라 이 문서의 authority fence와 범위 분리가 실제 코드에서 강제 가능한지를
판정한다.

## 8. 구현 수용 기준

### 필수 불변식

1. 모든 remote card result가 board `done`을 만들지 못한다.
2. bridge card 코드에서 `status="done"` 구성 0곳.
3. status/scrape/hook/timeout/result-send 경로의 card `pane.close` 0곳.
4. 명시적 로컬 board mutation만 `done`을 만든다. 사람/verifier provenance는 운영 규약이다.
5. 한 dispatch의 remote result는 최대 1건이다.
6. `cardSeq` 소비자와 relay/card contract v1 schema·enum은 무변경이다. remote `done` 적용 의미는
   의도적으로 변경된다.

### 회귀/호환 테스트

구현자는 production 코드보다 먼저 아래 실패 테스트를 커밋한다. 이 테스트들이 현행 코드에서
의도대로 red가 되는 것이 구현 착수 조건이다.

| 사전 커밋 테스트 | 고정할 실패 |
|---|---|
| `packages/host/src/bridge.test.ts` | fresh legacy remote `done`이 `done`이 아니라 `blocked`; authenticity mismatch·terminal·stale는 기존 no-op/거부 순서 보존 |
| bridge result 테스트 | completion 5경로가 `failed + needs_verification`을 만들고 실제 output summary 보존; dispatch 경쟁/Flight-less 3경로 모두 result 최대 1건 |
| `packages/host/src/pane-cleanup.test.ts` | card 자동 close 3경로가 pane을 보존; conv 명시 close와 pool-root 정리는 불변 |
| rolling-upgrade fixture | 새 bridge→구 tower와 구 bridge→새 tower가 모두 `blocked`로 수렴 |

production diff에는 위 red-test 커밋(또는 독립 선행 커밋)의 해시를 구현 증거로 남긴다. 테스트와
production 변경을 한 커밋에 섞어 사전 실패를 사후 추정하지 않는다.

- 새 bridge → 구 tower: completion proposal이 `blocked`로 적용된다.
- 구 bridge → 새 tower: legacy remote `done`이 `blocked`로 격리된다.
- 현행 가짜-done 재현: 결과는 `blocked + pane retained`다.
- relay down/peer unknown: `done` 0, `pane.close` 0, delivery-unconfirmed 진단.
- Flight-less 세 경로: issuer가 존재하고 claim 뒤 result 최대 1건.
- completion과 terminal 경쟁: result 최대 1건, 자동 close 0건.
- MCP/CLI/sticky/import의 명시적 로컬 board `done`: 정상 유지.
- proposal builder: `failed + needs_verification`에서도 실제 output summary 보존.
- `paneCleanup:"auto"`: card close 0, conv 명시 close는 기존 의미 유지. pool-root close는 설정과
  무관한 placement 내부 정리로 동작 불변.
- 전체 `bun test`와 관련 bridge/card/pane-cleanup 테스트 green.

## 9. R43b 질문

1. 저장소 내부 production producer는 bridge 한 곳뿐이다. 저장소 밖 producer와 `[DONE]` body만
   읽는 외부 자동화는 저장소 증거로 부재를 증명할 수 없다. 따라서 이를 일반 호환 보장으로 두지
   않고 **조건부 rollout gate**로 닫는다: 구현 착수 전 repo 전역 producer/consumer scan 결과를
   red-test 커밋에 기록하고, 배포 전 운영자가 관리하는 외부 consumer 목록을 확인한다. 외부 consumer가
   있으면 `failed + needs_verification`/remote `done→blocked`를 수용하도록 먼저 이행하거나 해당 배포를
   중단한다. 확인되지 않은 body-only 자동화는 지원 계약 밖이며 silent compatibility를 주장하지 않는다.
2. issuer의 claim-success 게이트가 Flight-less 세 경로 모두에서 유지되는가?
3. card 자동 `pane.close` 3곳 제거 목록이 완전한가?
4. 기존 status enum을 유지하는 rolling-upgrade 표가 실제 parser/apply 경로와 일치하는가?
5. v0.27.0 문안이 delivery liveness·exactly-once·자동 cleanup을 과장하는 곳이 0건인가?

## 10. 구현 금지선

- R43b 승인 전에 제품 코드 변경 금지.
- strict ACK, outbox, seq 재설계, tower receipt, cleanup grant를 v0.27.0에 다시 합치지 않는다.
- 구 `PANE-DEATH-DESIGN.md`의 락 3·5·6·8·9·10·13과 §10 체크리스트를 구현 정본으로 사용하지 않는다.
- timeout·absence·terminal을 완료 또는 pane cleanup 권한으로 승격하지 않는다.

## 11. R43b 승인 반영

R43b는 방향을 승인하고 세 문안 잠금을 조건으로 author-close를 허용했다. 이 문서에 (1) A2의
실제 guard 순서, (2) 외부 producer/body-only consumer의 조건부 rollout gate, (3) production 코드
선행 red-test 커밋 요구를 반영했다. Advisor: fable-advisor consulted: yes. 구현은 별도 lane이 위
사전 커밋 게이트를 충족한 뒤에만 시작한다.
