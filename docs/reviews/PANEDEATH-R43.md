# PANE-DEATH R43 검증 원장 (PLAN v0.27.0)

검증 리비전 `f9084ce`.
레인 = **2레인 병행 산출물** — in-harness Claude(Opus 4.8) + 로컬 `codex-cli 0.144.6`
(`codex exec --sandbox read-only`, reasoning=high). **두 레인은 서로의 산출물을 모르는 상태에서
독립적으로 reject에 수렴**했다.
좌표의 `:N`은 별도 표기가 없으면 `packages/host/src/bridge-runtime.ts`의 행 번호다.
PLAN 좌표는 `docs/PLAN.md:N`, 설계 좌표는 `docs/spikes/PANE-DEATH-DESIGN.md:N`으로 명시한다.

## 1. Verdict

**reject** · `ready=no` — PLAN 내부에 상호 배타적 명제가 남아 있고(D4↔D7④), 설계 락 8이
**자기모순**이며(본문 금지 조항 ↔ 같은 락 표의 만료 dispose), D6의 seq 규약이 **현행 tower
소비자를 조용히 파괴**한다. 나아가 이 PLAN이 전제로 삼은 명제 2건(Flight 보편성 · `cardSeq`의
성질)이 **코드와 다르다** — 그 위에 세워진 D4·D5·D6이 동시에 무너진다.

## 2. 놓친 전제 2건

PLAN 서술 자체가 아니라 **PLAN이 참이라고 가정한 코드 사실**이 틀렸다. 이 2건은 개별 High보다
상위에 있다 — 아래 결함 다수의 공통 근인이다.

| # | 전제 | 실제 | 파급 |
|---|------|------|------|
| P | "모든 failed result는 Flight를 통해 발행된다" | `sendFailedResult` 호출자 7곳 중 **3곳(`:850` · `:1114` · `:1204`)에 Flight가 없다.** `sendFailedResult(opts)`는 Flight를 인자로 받지 않는다(`:2364-2370`) | **D4·D5·D6이 동시에 무너진다** — 흡수 상태·durable alert·10분 타이머·Flight-local seq 어느 것도 이 3경로에 얹을 자리가 없다 |
| Q | "전역 `cardSeq`는 result 시퀀스이며 누수다" | `cardSeq`는 **per-card dispatch attempt 카운터**다(`:1124-1127` 주석 "Fix 2 (live-measured)"). 소비처 3곳 = herdr agent name 유일성(`:1192`) · hook 소켓 경로(`:1141`) · `Flight.seq`(`:1220`→`:2333`) | PLAN이 "누수"라 부른 성질이 **요구사항**이다. 제거 시 agent name 충돌·소켓 경로 충돌이 발생한다 |

**P·Q의 공통 함의**: attempt-identity와 result-identity는 서로 다른 축인데 PLAN이 이를 한
카운터로 뭉갰다. 어느 안을 택하든 **두 축의 분리는 필수**다(H3 제안 참조).

## 3. Findings — High 6건

### High-1 — PLAN 내부 모순: D4 ↔ D7④ 상호 배타

좌표: `docs/PLAN.md:83` (D4) vs `docs/PLAN.md:86` (D7④), 설계 §7.1-6 `:853`

- D4 = "10분 만료 → dispose"
- D7④ = "dispose 0건"

두 명제는 **상호 배타**다. 동일 PLAN이 같은 경로에 대해 dispose를 규정하면서 동시에 dispose가
0건이라고 완료 판정한다. 설계 §7.1-6(`:853`)이 D4 편이므로 **틀린 쪽은 D7④**다.

**제안**: D7④를 시간 한정으로 교체 — "10분 이내 dispose 0건, 만료 후 1건".

### High-2 — 락 8 자기모순 + 불변식 위반 (락 개정 필요)

좌표: `docs/spikes/PANE-DEATH-DESIGN.md` 락 8 (`:1098-1101` 본문 vs `:1114` 표),
`docs/PLAN.md:57-59,83,118`, 충돌 락 11·13 (`:1220-1225` · `:1246-1253`)

축자:

- 락 8 **본문** — "`pane.close`·dispose·비멱등 재발행은 **상수 만료로 유발되지 않는다**"
- 같은 락 **표** — "10분. 만료 시 … dispose"

**같은 락 안에서 8줄 간격으로 정면 충돌한다.** 아키텍트는 **표 한 줄만 인용하고 본문 금지
조항을 보지 않은 채** 이 판단을 검증 레인에 위임했다 — 교훈 27(스캔 범위 축소)의 **재재범**이며,
이번엔 다른 문서도 다른 섹션도 아닌 **같은 문서 같은 락**이다.

**왜 결함인가**: 10분 경과는 ACK 불확실성을 **조금도 해소하지 않는다**. 로그는 관측이고
dispose는 **상태 파괴**다. 타이머가 만든 로그는 dispose를 복구 가능하게 만들지 못한다.
지배 불변식("불확실한 관측 ⇒ 복구 가능한 행동만")을 D4가 직접 위반한다.

**축의 대칭성**: D1은 "미실측 상수로 correctness를 닫지 말라"는 원칙을 correctness 축에서
세웠다. **D4는 같은 원칙을 liveness 축에서 위반한다.** 원칙이 축에 따라 달라질 근거가 PLAN에 없다.

**제안**: 만료 dispose 제거. 레코드를 durable quarantine/tombstone으로 이관하고, **운영자 ack
또는 멱등 reconcile로만** 해제한다. **락 8을 개정하라** — 이미 락이라는 이유로 따르지 마라.

### High-3 — tower 소비자 파괴: D6 seq 규약이 새 유실 경로를 만든다

좌표: `packages/host/src/card-ops.ts:190-197`, `docs/PLAN.md:85,90`,
`:1128-1129` · `:1214-1223` · `:2372-2384`, `packages/protocol/src/card-contract.ts:42-45`

`card-ops.ts:190-197`의 dedup은 **스칼라 `payload.seq <= last`** 단일 비교이고,
`dispatchHandoffId`를 **보지 않는다**(해당 필드는 optional).

seq를 Flight-local로 옮기면 **재dispatch마다 1부터 재시작**한다 → 새 Flight의 첫 result가
`last_seq=N` 게이트에 걸려 **조용히 삼켜진다**. **유실을 없애려는 PATCH가 새 유실 경로를 만든다.**

PLAN의 범위 경계("각인만 하고 판정은 별도 PATCH")는 **성립하지 않는다 — 각인 대상에 이미
현행 판정자가 붙어 있다.** 각인은 tower inbox로 영속되므로 비가역이다.

**제안**: dispatch-scoped issuer를 **파싱·spawn 이전에** 생성하고, **같은 PATCH에서** tower
멱등성을 `(cardId, dispatchHandoffId, resultSeq)` 튜플로 갱신한다. 또는 per-card durable
시퀀스를 유지한다. 어느 안이든 **attempt-identity와 result-identity의 분리는 필수**다(전제 Q).

### High-4 — 재귀깊이 2: 순환은 없으나 Flight-less 3경로가 정의되지 않았다

좌표: `docs/PLAN.md:83`, 설계 `:708-716`, `:850-855` · `:1114-1119` · `:1202-1211` ·
`:1244-1252` · `:1268-1277` · `:1908-1916` · `:2364-2402`

순환은 없다 — **검증됨**: `sendFailedResult`는 `finishCard`를 부르지 않는다.

**그러나** 전제 P의 Flight-less 3경로(`:850` · `:1114` · `:1204`)에 **흡수 상태·durable
alert·10분 타이머를 둘 곳이 없다.** 정리는 "정의되지 않았다"이지 "증명되지 않았다"가 아니다 —
정리는 서술된 완료 체인에 대해서만 성립하며, D4가 엄격 ACK를 적용한다고 말한 **모든**
failed-result 호출에 대해서는 성립하지 않는다.

**제안**: 모든 카드 result를 **하나의 dispatch-scoped issuer**로 중앙화하고 명시적 유한 전이표를
붙인다. spawn 이전 실패 · spawn 이후 실패 · 완료 거절 · failed-result 거절 · 전송 유실을 각각
독립 테스트한다.

### High-5 — 완료 판정이 틀린 명제를 잠근다 (좌표 정정 포함)

좌표: `docs/PLAN.md:84`, 가드 `:2019` · `:2003` · `:2067` · `:2080` · `:2096`,
`:2203-2208` · `:2226`, `packages/host/test/still-running.test.ts:452`

D5 완료 판정 "가드의 동기 갱신 가정이 깨지지 않았음"은 **mechanism을 잠그지만**, 순서 역전의
**정의상 효과**가 가드의 보호 효력을 소멸시킨다 — 역전 후에는 send 중에도
`flights.get(paneId) === flight`가 성립한다. 즉 **구현자가 CAS를 전혀 추가하지 않고도 이 판정을
통과할 수 있다.**

**좌표 정정**: 가드는 **4곳이 아니라 5곳**이다 — PLAN 목록에서 **`:2019`(`beginCardCompletion`
본류, 정상 완료 경로의 유일 방어)가 빠졌다.**

**구체적 회귀 예측**: `still-running.test.ts:452` — `blocked` 분기(`:2203-2208`)에
`stillRunningDeferral` 가드가 **없다**(done/idle `:2226`에만 있다). 지금 안전한 이유는 dispose가
먼저라 타이머가 죽기 때문뿐이다. **순서를 역전하면 두 번째 result가 나간다.**

**제안**:

1. 완료 판정을 "가드 **5곳 각각**이 CAS 소유권 불리언을 함께 검사 + `blocked` 분기에 latch
   검사 추가"로 교체.
2. **`disposeCardFlight`를 분할** — 타이머/리스너 정리(조기)와 `flights.delete`(지연)를 분리하고
   PLAN에 명시.

### High-6 — durable alert 저장 매체 미규정 (§6.7 논거 전체가 걸려 있다)

좌표: `docs/PLAN.md:83,117`, 설계 `:663-670`, 대칭 위치 `:483-485`

대칭 위치인 `recordResultDeliveryUnconfirmed`의 현행 구현은 **모듈 `let` 카운터 + `log()` =
`console.error`가 전부**다(`:483-485`). **프로세스 종료 시 전량 소실**된다.

구현자가 이 대칭 위치를 재사용하면 **유닛 테스트는 통과하고 요구 3은 미충족**된다.
§6.7 논거 전체가 durability에 걸려 있는데 **정확히 그 지점이 비어 있다.** 로컬 JSONL · 보드
상태 · tower 통지는 크래시 내구성과 운영자 도달성이 실질적으로 다르다 — 싱크가 미지정인 채로는
"조용히 멈추지 않는다"를 증명할 수 없다.

**제안**: **승인 전에** 저장 매체 · flush 의미론 · dedup 키 · 보존 기간 · 운영자 ack 절차를 락한다.

## 4. Findings — Medium 5건

### Medium-1 — D1은 하드 게이트로 기능하나 완료 증명이 과장됐다

좌표: `docs/PLAN.md:75,79,106-112`, `packages/relay/src/room.ts:452-459,510-558`,
`:827-869` · `:2408-2429`

D1은 D3를 명시적으로 블록하므로 **절차적으로 하드 게이트로 기능한다 — 형해화가 아니다.**
다만 **4표본은 전칭 명제를 세우지 못한다.** 정적 코드가 이미 비-broadcast 타깃의
recipient가 0 또는 1임을 증명하고, ⓒ(name 해석)·ⓓ(`to:"*"`)는 카드 경로에서 **구조적으로 도달
불가**로 보인다. 측정은 운영 호환성을 세우지 bound를 세우지 않는다.

**이 PATCH에서 correctness를 닫는 진짜 미실측 상수는 `recipientCount`가 아니라 D4의 10분**이다(H2).

**제안**: 안전성을 무조건화한다 — 모든 예상 밖 ACK는 복구 가능한 unknown 상태로 들어간다.
D1 측정은 liveness/호환성 증거로만 취급하고, "정상 경로 전부 증명"을 **관측된 사례 열거 + 코드
불변식**으로 교체한다.

### Medium-2 — D1-b의 격리 상태는 D5가 "쪼갤 수 없다"고 한 미완 중간 상태다

좌표: `docs/PLAN.md:80,84`, `packages/host/test/pane-cleanup.test.ts:245-264`,
`packages/host/test/still-running.test.ts:452-478`

D1-b는 "순서 역전만"을 측정한다고 하지만, D5는 역전·CAS·latch **셋을 쪼갤 수 없다**고 말한다.
격리 상태는 **의도적으로 무효한 상태**다 — Flight를 노출한 채 CAS/latch가 없으면 D5가 통제하려던
바로 그 레이스가 들어온다. 따라서 거기서 나오는 실패는 **(c) 중간 상태의 산물**일 수 있는데,
판별표에는 **(a)(b) 두 칸뿐**이다.

**제안**: ACK 분류를 결정적 accepted 스텁으로 고정한 채 baseline ↔ **완전한 D5 원자 집합**을
비교하고, 그 다음 D3를 얹어 다시 비교한다.

### Medium-3 — out of scope conv 좌표 과소 기재

좌표: PLAN 기재 `:1300` · `:1319` · `:1777` (3곳)

동형 fire-and-forget이 **최소 4곳 더** 있다: `:1534` · `:2255`(`:2158-2163`의 축자적 쌍둥이) ·
`:2274` · `:2279`.

**conv를 범위에서 빼는 것 자체는 지지한다 — 목록만 정확히 하라.** 범위 경계는 열거가 정확할 때만
경계로 기능한다.

### Medium-4 — conv 비가역 상태 전진 (M3보다 무겁다)

좌표: `:1777-1797`

`client.handoff`가 throw하지 않으면 — **`peer_unknown`을 포함해** — `lastOwnSeq` ·
`emittedArtifacts` · `deltaAnchor`가 전진한다. 즉 **거짓 양성 위에서 turn이 영구 유실**된다.
같은 거짓 양성 경계가 conv에서도 비가역 손실을 만든다.

### Medium-5 — §6.7 요구 4(reconcile 회수)가 명시 없이 사라졌다

좌표: `docs/PLAN.md:91-92`, 설계 §6.7

요구 4가 out of scope에 **명시되지 않은 채** 사라졌다. 따라서 "liveness 축을 닫는다"는 one-liner는
**과장**이다. 이 PATCH가 실제로 하는 일은 **유실을 관측 가능하게 만드는 것**이지 회수가 아니다.

## 5. Findings — Low: 좌표 드리프트 표

PLAN/설계 기재 → 실측.

| 대상 | 기재 | 실측 |
|------|------|------|
| `sendResult` 범위 | `:2415-2440` | `:2408-2434` |
| "무조건 true 반환" | `:2437` | `:2429` |
| `sendFailedResult` | `:2391` | `:2395` |
| 호출지점 총계 | 17개 (7·10) | **18개 (7·11)** |
| 가드 개수 | 4곳 | **5곳 (+`:2019`)** |
| **D5 근거의 dispose→발행 순** | **6곳** | **`disposeCardFlight` 호출 실제 15곳** |

`disposeCardFlight` 15곳 = 기재된 6곳 + still-running poll `:2085` · `:2104` · `:2111` ·
`:2127` · `:2134` + 비-herdr `:1244` · `:1268` · `:1908`.

**마지막 항이 가장 무겁다** — 순서 역전 대상이 6곳인지 15곳인지 **PLAN이 답하지 않는다.**
부분 역전이면 latch가 일부 경로에서만 발화한다 = 죽은 코드의 부분판.

정확했던 것: `sendResult:2423` · `finishCard:2349`.

## 6. 미확인 (UNVERIFIED — "없음"과 구별)

이 절의 항목은 **읽지 않았거나 실행하지 않은 것**이다. 결함이 없다는 뜻이 아니다.

- **D1 ACK 매트릭스 ⓐ~ⓓ 미실행** — 정적 근거뿐. 환경 특정 값은 미확인.
- `packages/host/test/pane-cleanup.test.ts:245` · `:816` **미실행** — 읽기만 했다.
- **D2 주입 seam 실현가능성 미확인** — 존재하지 않는 표면이므로 비용·가능성 모두 미확인.
- **H5 회귀 예측은 코드 추론이지 실측이 아니다** — 순서 역전 패치가 없어 실행 불가.
  **D1-b 최우선 항목으로 올려라.**
- `Flight.seq` ↔ `dispatchHandoffId` **1:1 여부 미확인**.
- conv `onConvHerdrEvent` 전체 · `card-ops.ts` 나머지 **미정독**.
- **codex 단독 주장 미대조분** — 설계 `:1220-1225` · `:1246-1253` 락 11·13 충돌 주장, `:462-476`.

**기준선 실측**: `still-running.test.ts` **10 pass / 0 fail (14.32s)**.
전체 스위트 **미실행** — 아키텍트 몫.

## 7. 아키텍트 대조 확인

아래 2건은 **아키텍트가 축자 대조를 완료**했다:

- **H2** — 락 8 본문(`:1098-1101`) ↔ 같은 락 표(`:1114`)의 8줄 간격 자기모순. 축자 확인.
- **H3** — `packages/host/src/card-ops.ts:190-197`의 스칼라 dedup이 `dispatchHandoffId`를
  보지 않음. 축자 확인.

**나머지 전 항목은 미대조**다. 특히 §6의 codex 단독 주장분과 §5 좌표 드리프트 표의 개별 행은
아키텍트 재확인을 거치지 않았다.

## 8. 레인 수렴 기록

두 레인은 **서로의 산출물을 보지 않은 상태에서 독립적으로 reject에 수렴**했다. 수렴 지점:

| 논점 | in-harness Claude | codex 0.144.6 |
|------|-------------------|---------------|
| 락 8 만료 dispose | H2 — 락 개정 필요 | H1 — "lock 8 is wrong" |
| tower 스칼라 dedup 파괴 | H3 | H3 |
| Flight-less failed 경로 | 전제 P · H4 | H4 + PREMISES |
| durable alert 미규정 | H6 | M3 |
| D1은 형해화 아님 / 진짜 미실측 상수는 D4의 10분 | M1 | M1 |
| conv 비가역 상태 전진 | M4 | M4 |

**독립 수렴 자체가 증거**다 — 단일 레인 편향으로 설명되지 않는다.

## 부록 A — codex 레인 원문

전체 트랜스크립트(4847행):
`/private/tmp/claude-501/-Users-kyoungsiklee-projects-fable-advisor/dcdbabbc-63b6-45b6-8264-4d1d1dd9b94c/scratchpad/r43-codex.txt`
(세션 스크래치패드 — 영속 저장소가 아니다). 최종 `[R-RESULT]` 블록을 아래에 축자 전재한다.

---

[R-RESULT] R43 — verdict: reject
ready: no

### High

#### H1 — D4 violates the governing invariant; lock 8 is wrong

- **Coordinate:** `docs/PLAN.md:57-59,83,118`; `docs/spikes/PANE-DEATH-DESIGN.md:1098-1115,1220-1225,1246-1253`
- **Verbatim evidence:** "비가역 행동 … dispose는 결정적 증거 또는 멱등 경로에서만"; lock 8 simultaneously says constants may not cause "dispose" (`:1098-1101`) and "10분 … log + counter … 후 dispose" (`:1114`).
- **Defect:** ACK uncertainty remains unchanged after ten minutes. Logging does not make disposal recoverable or provide authoritative evidence. The timeout therefore destroys the only live ownership record because of an unmeasured constant. It also contradicts locks 11 and 13 (`:1220-1225`, `:1246-1253`).
- **Proposal:** Remove expiry-driven disposal. Transfer the record to a durable quarantine/tombstone and release it only after operator acknowledgement or durable idempotent reconciliation. Revise lock 8; do not "follow it" merely because it is already locked.

#### H2 — D5's "three-piece atomic set" is not self-contained and depends on the out-of-scope (C) state machine

- **Coordinate:** `docs/PLAN.md:84,92`; `packages/host/src/bridge-runtime.ts:1942-1945,2156-2166,2347-2349`; `docs/spikes/PANE-DEATH-DESIGN.md:462-476,529-548,1275-1286`
- **Verbatim evidence:** D5 says it needs only "불리언 1 + latch 레코드," while the PLAN excludes "phase registry · lifecycle generation … `send_unknown`/`presence_unknown` 분리 구현."
- **Defect:** Order inversion keeps the Flight visible during send. The boolean+latch can suppress a competing send only during that await. After ACK it cannot distinguish `result_relay_accepted`, `awaiting_human_verification`, `send_unknown`, or `terminal_expected`. Current terminal handling immediately disposes and sends failed (`bridge-runtime.ts:2156-2166`). Disposing after ACK violates the human-confirmation boundary; retaining the Flight without phases lets later terminal events re-enter the failure path. The design checklist itself requires the omitted phase registry (`PANE-DEATH-DESIGN.md:1275-1286`).
- **Proposal:** Bring the minimal (C) registry—generation, result-sending/accepted/unknown/cleanup phases and tombstone semantics—into 0.27.0, or postpone D5. The three mechanical edits alone are not atomic correctness.

#### H3 — D6's seq convention breaks the current tower consumer and cannot cover all result emitters

- **Coordinate:** `docs/PLAN.md:85,90`; `packages/host/src/bridge-runtime.ts:850-855,1114-1119,1128-1129,1202-1211,1214-1223,2372-2384`; `packages/host/src/card-ops.ts:190-197`; `packages/protocol/src/card-contract.ts:42-45`
- **Verbatim evidence:** D6 says "seq는 Flight에 산다," payload construction increments it, and global `cardSeq` is deleted; tower currently rejects solely when `payload.seq <= last`.
- **Defect:** Re-dispatches can restart a Flight-local result counter and be silently ignored by the existing scalar `last_seq` gate. `dispatchHandoffId` is optional and is not considered by that gate. Additionally, `payload_invalid`, `agent_kind_not_allowed`, and spawn failure emit results before any Flight exists, so "Flight-owned for every payload" is not implementable on actual paths. The existing Flight `seq` is also created before spawn and used as attempt identity (`bridge-runtime.ts:1128-1129,1214-1223`), not merely result identity.
- **Proposal:** Define a dispatch-scoped result issuer before parsing/spawn and update tower idempotency in this same patch to consume `(cardId, dispatchHandoffId, resultSeq)`. Alternatively retain a monotonic durable per-card sequence. Payload imprint and its current consumer cannot be separated.

#### H4 — The depth-two argument is valid abstractly but unverified on the actual emitter topology

- **Coordinate:** `docs/PLAN.md:83`; `docs/spikes/PANE-DEATH-DESIGN.md:708-716`; `packages/host/src/bridge-runtime.ts:850-855,1114-1119,1202-1211,1244-1252,1268-1277,1908-1916,2364-2402`
- **Verbatim evidence:** "재귀 깊이는 구조적으로 2에서 끝난다 (`needs_verification` → `failed` → 흡수)."
- **Defect:** `sendFailedResult` accepts no Flight/issuer state, and several callers execute before Flight creation or after `disposeCardFlight`. A Flight-local `send_unknown` cannot absorb those paths. The theorem holds only for the narrated completion chain, not for all failed-result calls to which D4 says strict ACK applies.
- **Proposal:** Centralize every card result through one dispatch-scoped issuer with an explicit finite transition table. Test pre-spawn failure, post-spawn failure, completion rejection, failed-result rejection, and transport loss independently.

### Medium

#### M1 — D1 is a sequencing gate, but its completion proof is overstated

- **Coordinate:** `docs/PLAN.md:75,79,106-112`; `packages/relay/src/room.ts:452-459,510-558`; `packages/host/src/bridge-runtime.ts:827-869,2408-2429`
- **Verbatim evidence:** D1 blocks D3 and requires four measurements to establish that the strict predicate holds in "정상 경로 전부."
- **Defect:** The hard dependency is explicit, so D1 is not procedurally hollow. But four sampled executions cannot establish a universal timing claim. Static code already proves non-broadcast targets yield zero or one recipient; actual card results are addressed back to the dispatch sender. Measurement can establish operational compatibility, not a bound. The remaining correctness-closing unmeasured constant is D4's ten-minute disposal, not `recipientCount`.
- **Proposal:** Make safety unconditional: every unexpected ACK enters the recoverable unknown state. Treat D1 measurements only as liveness/compatibility evidence and replace "all normal paths proven" with enumerated observed cases plus code invariants.

#### M2 — D1-b contradicts D5's atomicity and cannot cleanly separate D3 from D5

- **Coordinate:** `docs/PLAN.md:80,84`; `packages/host/src/pane-cleanup.test.ts:245-264`; `packages/host/src/still-running.test.ts:452-478`
- **Verbatim evidence:** D1-b requires "순서 역전만" while D5 says the inversion, CAS, and latch "셋은 쪼갤 수 없다."
- **Defect:** The proposed isolated state is intentionally invalid: keeping the Flight visible without the CAS/latch introduces the race D5 is meant to control. Test `pane-cleanup:245` also asserts the old automatic close behavior, so its failure cannot diagnose ordering independently from ACK and later human-cleanup semantics.
- **Proposal:** Compare baseline against the complete D5 atomic set while holding ACK classification at a deterministic accepted stub; then layer D3 and compare again.

#### M3 — "durable alert" is a required liveness mechanism but remains undefined

- **Coordinate:** `docs/PLAN.md:83,117`; `docs/spikes/PANE-DEATH-DESIGN.md:663-670`
- **Verbatim evidence:** D4 requires "durable alert 1건," while U2 leaves the medium and "운영자 도달 보장 수준" unresolved.
- **Defect:** Local JSONL, board state, and tower notification have materially different crash durability and operator reach. An implementer cannot prove "조용히 멈추지 않는다" against an unspecified sink.
- **Proposal:** Lock the storage medium, write/flush semantics, dedup key, retention, and acknowledgement/recovery procedure before approval.

#### M4 — The (C) body is wrongly excluded; conv may be split only with an explicit residual-loss gate

- **Coordinate:** `docs/PLAN.md:91-92`; `packages/host/src/bridge-runtime.ts:1777-1797`
- **Verbatim evidence:** The PLAN excludes the phase registry required by D5 and separately defers all conv ACK handling.
- **Defect:** Excluding the (C) state machine is directly incompatible with H2. Conv is not atomically required for card correctness, but its handoff currently advances `lastOwnSeq`, artifact dedup, and delta anchor after any non-throwing ACK—including `peer_unknown`. Thus the same false-positive boundary can irreversibly lose a conv turn.
- **Proposal:** Include the minimal (C) phases now. Conv may remain a named follow-up only if 0.27.0 claims a card-only boundary; preferably share the strict ACK classifier and injection seam now and gate conv state advancement on it.

### Low

None.

### PREMISES THE ARCHITECT MISSED

- Tower idempotency presently consumes only scalar `seq`, not the proposed tuple (`packages/host/src/card-ops.ts:190-197`).
- Some failed results have no Flight from which to obtain seq or absorbing-state ownership (`packages/host/src/bridge-runtime.ts:850-855,1114-1119,1202-1211`).
- The current Flight `seq` is already attempt identity established before spawn (`packages/host/src/bridge-runtime.ts:1128-1129,1214-1223`).
- A timer-produced log does not turn disposal into a recoverable action; lock 8 contradicts its own prohibition (`docs/spikes/PANE-DEATH-DESIGN.md:1098-1115`).
- Conv's discarded ACK is followed by irreversible local state advancement (`packages/host/src/bridge-runtime.ts:1777-1797`).

### UNVERIFIED

- D1's requested live ACK matrix was not run; its environment-specific values remain unverified.
- No tests were run because there is no implementation diff to exercise; the cited regression tests were read only.
- D2's proposed ACK injection seam does not yet exist, so its feasibility and cost remain unverified.

---

[PANEDEATH-R43-DONE] verdict=reject high=6 med=5 low=1 ready=no lanes=2
