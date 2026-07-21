# PANE-DEATH R43b 검증 원장 (PLAN v0.27.0)

검증 리비전 `5cd070b` (R43 reject 반영 R43b 개정본).
레인 = **2레인 병행 산출물** — in-harness Claude(Opus 4.8, 문서 검증 범위 지시) + 로컬
`codex-cli 0.144.6`(`codex exec --sandbox read-only`, reasoning=high). **두 레인은 서로의 산출물을
모르는 상태에서 독립 검증**했다 — claude 레인 verdict **pending-revision**, codex 레인 verdict
**reject**.
좌표의 `:N`은 별도 표기가 없으면 `packages/host/src/bridge-runtime.ts`의 행 번호다. PLAN 좌표는
`docs/PLAN.md:N`, 설계 좌표는 `docs/spikes/PANE-DEATH-DESIGN.md:N`으로 명시한다.

> **본 원장은 R43·R43b 두 레인 산출물의 기록이며, 기존 리뷰 원장 4본
> (`PANEDEATH-CODEX-REVIEW*.md`·`PANEDEATH-R43.md`)은 수정하지 않는다.** 아키텍트 판정(§4)은
> 확정이며, 그 반영은 PLAN·설계 2차 개정에서 이뤄졌다(설계 §11 · PLAN changelog).

## 1. Verdict

**종합 verdict: `pending-revision`** — codex 레인 **reject** ↔ claude 레인 **pending-revision** 중
아키텍트가 **pending-revision을 채택**했다.

**근거:**
- R43 지적 12건(전제 P·Q · High 6 · Medium 5) 해소는 **양 레인 독립 수렴**으로 견고하다(§2). 3연속
  reject 원인이던 "좌표 드리프트 + 락 자기모순"은 이번에 실제로 닫혔고, 개정본이 새로 쓴 좌표
  (가드 5곳·dispose 15곳·발행 18개·Flight-less 3경로)는 **양 레인 코드 재실측 결과 정확**하다.
- 신규 결함(High 4·Medium 3·Low 3 — §3)은 전부 **국소 정밀화**(각주·전이표·폴백 규정·문면·좌표)로
  닫히며 **설계 재론(락 개정·범위 재획정급)이 불요**하다. 이 트랙의 "지적 반영이 새 모순을 낳는"
  3연속 패턴은 이번엔 재발하지 않았고, 잔여는 좁고 국소적이다.
- **High 4건이므로 수정 반영 후 R43c 재검증 필수 — author-close 불가.**

**codex reject ↔ claude pending-revision 판정 차이:** codex는 신규 High 4건(특히 H-new-1 불변식
반증 · H-new-4 (C) 배제·요구 모순)을 reject 근거로 삼았고, claude는 차단 사유를 H-new-1(§6.7.2↔
§6.7.3 seam의 조용한 strand) 하나로 좁혀 pending-revision했다. 아키텍트는 codex High 4건을 전부
검토해 **각각이 국소 정밀화로 닫힘**을 확인하고(§4) pending-revision을 채택했다.

## 2. R43 지적 해소 수렴 표

R43 원 지적(전제 P·Q · High 6 · Medium 5) — 양 레인이 **실질 해소로 수렴**했다. codex의 "partial"은
원 지적의 substance가 해소되되 **같은 영역에서 신규 gap**(§3의 H-new-2·H-new-3·M-new-2)을 발견했다는
뜻이다.

| # | R43 지적 | claude 레인 | codex 레인 | 수렴 |
|---|---|---|---|---|
| P | Flight 보편성 반증 | 해소(Flight-less 3경로 flight 이전 발행 실측) | partial(경로 인정·issuer 중앙화 명시, 단 `:850` 타워 매핑·락 5 sole-owner 잔여) | 실질 해소 |
| Q | `cardSeq`=attempt 카운터, 삭제 시 회귀 | 해소(선언·주석·소비 재실측, 유지 확정) | resolved(attempt use 코드 확인) | 수렴 |
| H1 | D4↔D7④ 상호배타 | 해소(만료 dispose 삭제로 모순 소멸) | resolved(타이머 dispose 0 일치) | 수렴 |
| H2 | 락 8 자기모순 + 만료 dispose | 해소(락 8 표 개정 — 재알림만) | resolved(만료 dispose 삭제) | 수렴 |
| H3 | tower 스칼라 dedup 파괴 | 부분 해소(currency 게이트 편입 · 단 findTask-miss 밖 → H-new-1) | resolved(정적 트레이스 통과) | 수렴 |
| H4 | Flight-less 3경로 미정의 | 부분 해소(issuer 중앙화·전이표 · 단 `:850` 라우팅 → H-new-1) | partial(issuer topology 명시 · 락 5·`:850` 잔여 → H-new-2·3) | 수렴 |
| H5 | 완료판정·가드 5·순서역전 15 | 해소(좌표) · 회귀 게이트 오인용 → M-new-2 | resolved(가드 5·dispose 15·발행 18 코드 확인) | 수렴 |
| H6 | durable 매체 미규정 | 해소(JSONL·키·flush·보존 · 단 flush 실패 → L-new-1) | partial(매체·키·보존 명시 · crash-durable flush·replay·ack 미정의 → M-new-2) | 수렴 |
| M1 | D1 전칭 명제 과장 | 해소(전칭 제거 + 코드 불변식) | resolved(전칭 제거·복구 가능 unknown) | 수렴 |
| M2 | D1-b vs D5 원자성 | 해소(완전 D5 집합 비교 재설계) | resolved(결정적 스텁 + D5 원자 집합) | 수렴 |
| M3 | conv 좌표 과소 | 해소(전수 열거) | resolved(헬퍼 3+void 4+await 1 확인) | 수렴 |
| M4 | conv 비가역 상태 전진 | 해소(scoping — U4 named follow-up) | resolved(card-only residual 명시) | 수렴 |
| M5 | reconcile 회수 소실 | 해소(out-of-scope + one-liner 과장 제거) | resolved(out-of-scope + liveness 축소) | 수렴 |

**PLAN의 §6.7-bis 축자 인용은 개정된 원문과 일치**(codex 확인). currency-게이트 2-result 케이스도
정적 분석 통과(codex).

## 3. 신규 발견 요약 (레인별 · 수렴 표기)

### High (codex 4건 · claude 1건 — 수렴 2건)

| ID | 발견 | 레인 | 수렴 |
|---|---|---|---|
| **`:850` strand** | `:850` 열화 cardId(`"task_0"`)가 `findTask`를 통과 못 해 relay 수락되고도 타워에서 조용히 strand — §6.7.2 "유일 통과점"이 타워측에서 깨짐 | claude **H-new-1** ≡ codex **H-new-3** | **양 레인 독립 수렴** |
| **락 5 sole-owner vs Flight-less** | 락 5 "CAS 승자만 sendResult" ↔ Flight-less 3경로는 CAS 승자를 못 만듦 — issuer-level acquisition CAS 미정의 | codex **H-new-2** | codex 단독 |
| **(C) 배제·요구 모순** | v0.27.0이 (C) lifecycle을 out-of-scope로 배제하면서 D7이 `pane-cleanup.test.ts:245`("sendResult then pane.close")를 green으로 요구 — 락 11(자동 close 금지)·§7.1-0(done 0)과 동시 충족 불가 | codex **H-new-4** | codex 단독 |
| **불변식 "비가역 0" 반증** | PLAN U3 "불확실 관측→비가역 0" 전역 주장 ↔ 락 8·11이 연속 absence로 terminal 합성·자동 blocked 허용(가시성 지연 무제한) | codex **H-new-1** | codex 단독(부분 수용) |

### Medium (codex 3건 · claude 2건 — 수렴 2건)

| ID | 발견 | 레인 | 수렴 |
|---|---|---|---|
| **presence_unknown seq 부재** | quarantine 키 `(cardId, dispatchHandoffId, seq)`인데 `presence_unknown`은 result 미구성이라 seq 없음 — 키 불충족(조기 채번 시 issuer 규약 모순) | codex **M-new-1** | claude **M-new-1**(§6.0.2 자동 출구 ↔ 해제 규약 충돌)과 **동일 영역 수렴** |
| **quarantine 내구 미정의** | fsync/torn-line/replay/ack 인코딩/권한/ack 표면 미정의 — 버퍼드 append는 crash-durable 전 진입 관측 | codex **M-new-2** (H6 partial) | claude **L-new-1**(flush 실패 미규정)과 수렴 |
| **전이표 logicalKind 부재** | 한 dispatch에 논리 result 2건인데 전이표에 initial/rejection 구분 없음 — 중복 failed 위험 | codex **M-new-3** | codex 단독 |
| **blocked 회귀 게이트 오인용** | PLAN D5/D7이 blocked-분기 회귀 게이트로 `:452`(실제 "⑦ pane_closed") 인용 — 진짜 blocked 게이트는 `:529`(⑩) | claude **M-new-2** | claude 단독 |

### Low (codex 2건 · claude 3건 — 수렴 2건)

| ID | 발견 | 레인 | 수렴 |
|---|---|---|---|
| **좌표 잔재** | PLAN `:67`·D3 `sendResult:2415-2440`→`:2408-2434`, `:2437`→`:2429` | claude **L-new-2** ≡ codex **L-new-1** | **수렴** |
| **"아무도 모른다" 과장** | one-liner 전칭 부정 — 프로세스-로컬 log/counter는 존재(휘발) | codex **L-new-2** | codex 단독 |
| **§6.7.3 (iv) 부수이득 부정확** | "브릿지 재시작 seq 리셋 유실 해소" — 재dispatch notes clobber로 last_seq 이미 리셋, restart-resume out-of-scope라 메커니즘 불명 | claude **L-new-3** | claude 단독 |
| **flush 실패 미규정** | §6.7.1 append/flush 자체 IO 실패 동작 공란 | claude **L-new-1** | codex M-new-2와 수렴 |

## 4. 아키텍트 판정 표 (확정 — 재논증 금지)

| Finding | 판정 | 반영 내용 |
|---|---|---|
| **`:850` strand** (claude H-new-1 ≡ codex H-new-3 — 양 레인 독립 수렴) | **수용** | §6.7.3에 규정 추가: `applyCardResult`가 `findTask(payload.cardId)` miss(또는 cardId `"task_0"` 열화값) 시 **`task.handoffId === payload.dispatchHandoffId` 스캔 폴백**으로 태스크를 해석하고, 해석 후 payload cardId를 태스크와 **교차 검증**한다(불일치 시 drop + 관측 로그). 이로써 §6.7.2 "유일 통과점" 주장이 타워측에서도 성립. D6 완료 판정에 이 폴백 테스트 추가. |
| **codex H-new-2** (락 5 sole-owner CAS vs Flight-less 3경로) | **수용** | 락 5에 R43b-2 각주 신설: **issuer acquisition이 보편 발행 권위**다 — Flight-backed 완료 result는 lifecycle CAS 승자 **그리고** issuer 채번을 모두 통과, pre-Flight 실패 result는 issuer 단독 acquire. 락 5 본문 "CAS 승자만 sendResult 호출"은 Flight-backed 경로 한정임을 명시. §6.7.2에도 동일 규정. |
| **codex H-new-4** ((C) 배제·요구 동시 모순 — `:245` vs 락 11) | **수용(문면)** | PLAN out-of-scope "(C) 전환 본체" 항목과 D7에 **단계 순서 명시**: v0.27.0은 **pre-C 현행 완료 경로**(자동 done·sent&&pane.close) 위에 구현된다. 락 11의 자동 close 금지와 §7.1-0의 done 0건은 **(C) 본체 PATCH의 수용 기준**이며, 그 PATCH가 `pane-cleanup.test.ts:245`의 기대를 교체한다. v0.27.0의 `:245` green 요구는 **pre-C 현행 계약의 회귀 게이트**다. 두 수용 계약은 **다른 PATCH의 것**이라 동시 충족 요구가 아니다. |
| **codex H-new-1** (불변식 "비가역 0" 주장 반증) | **부분 수용** | 수용부: PLAN U3 소멸 문구의 "불확실한 관측이 유발하는 비가역 행동이 0" 주장의 **주어를 "이 PATCH가 다루는 흡수 상태·타이머 경로"로 한정**(전역 주장 제거). **기각부: 락 11 "동일 generation 결속 연속 absence = 결정적 부정 증거" 재론은 기각** — 근거: ① 락 11은 기결정(출처 = fable-advisor 자문 2026-07-21 + codex 검증 partially-correct 수용 — 락 블록 전체·출처 대조 완료) ② bounded reconcile·terminal 합성은 (C) 본체로 **이번 PATCH 범위 밖**이다. 단 이 긴장(absence의 증거 등급 C± vs "결정적" 명명)을 **§9-ter 정직성 항목에 1줄 등재**한다(숨기지 않음 — (C) 본체 PATCH의 R 게이트가 재확인할 지점). |
| **presence_unknown 정비** (claude M-new-1: §6.0.2 자동 출구 vs 해제 규약 충돌 + codex M-new-1: seq 부재로 dedup 키 불충족) | **수용** | §6.7.1 개정 2건: ① quarantine 키를 태그드로 — `send_unknown`은 `(cardId, dispatchHandoffId, seq)`, **`presence_unknown`은 `(cardId, dispatchHandoffId, "presence")`**(result 미구성이라 seq 없음; seq는 §6.0.2 허용 늦은 단일 발행을 실제 구성할 때 채번). ② 해제 사유에 **(c) `presence_unknown`의 늦은 단일 발행이 relay_accepted로 종결**될 때의 자동 해제를 추가(§6.0.2 자동 출구와 정합). 락 8 표·락 13 정합 각주도 동기화. |
| **quarantine 내구 세부** (claude L-new-1 + codex M-new-2 · H6 partial) | **수용** | §6.7.1에 락 추가: 파일 모드 **0600**(loomDir 선례) · **append 후 레코드당 fsync** · 기동 시 **malformed tail 관용**(버리지 않고 카운트+로그) · **기동 replay**로 미해소 카운트 복원 · **운영자 ack도 append-only 레코드**(원본 수정 없는 fold) · **append/fsync 실패는 fail-visible**(console+counter — 유일 잔여 수단, 조용한 유실 금지). compaction·보존 상한은 운영 후속으로 명시. |
| **codex M-new-3** (전이표 logicalKind 부재) | **수용** | §6.7.2 전이표에 **logicalKind ∈ {initial, rejection_escalation}** 도입: 논리 result는 dispatch당 initial 1건 + escalation 최대 1건, 각각 발행 1회. **pre-Flight initial failed는 "명시적 거부→재구성" 행을 거치지 않고 직행** send → {relay_accepted · send_unknown}. |
| **claude M-new-2** (blocked 회귀 게이트 좌표 오인용) | **수용** | PLAN D5·D7의 blocked-분기 회귀 게이트를 `still-running.test.ts:452` → **`:529`("⑩ M-1: blocked during deferral → timer cleanup + failed once")**로 정정. `:452`("⑦ pane_closed during deferral → timer cleanup + failed once")는 **pane_closed 게이트**로 별도 유지(양쪽 다 게이트 목록에). 코드에서 두 테스트 제목 재확인 완료. |
| **좌표 잔재** (claude L-new-2 ≡ codex L-new-1) | **수용** | PLAN `:67`·D3의 `sendResult:2415-2440`→**`:2408-2434`**, `:2437`→**`:2429`** 정정. "좌표 전면 정정" 주장(설계 §11)은 "R43 드리프트 표 반영"으로 완화. |
| **codex L-new-2** ("아무도 모른다" 과장) | **수용** | PLAN one-liner의 "알림이 도착했는지 아무도 모른다"를 **"호출부와 durable 회복 경로가 모른다(프로세스-로컬 log/counter는 존재하나 휘발)"**로 정정(교훈 33 동형 — 전칭 부정 제거). |
| **claude L-new-3** (§6.7.3 (iv) 부수이득 서술) | **수용(검증 후)** | 코드 실측 확인 결과 **`dispatchCard`(`card-ops.ts:112-117`)가 재dispatch 성공 시 `notes`를 `dispatched node=…`로 통째로 덮어써 `last_seq=` 토큰을 제거**한다(clobber 확정). 따라서 (iv) "브릿지 재시작 seq 리셋 유실 해소" **및 근거 (i)의 "재dispatch마다 재시작해 스칼라 게이트에 삼켜진다"를 둘 다 철회** — board 재dispatch는 스칼라 게이트에 삼켜지지 않고, 순수 "브릿지 재시작 후 재전송"은 active binding 복원이 §9-6 out-of-scope라 발생하지 않는다. currency 게이트의 load-bearing 근거는 (i)각인-판정자 분리 불가 · (ii)stale-attempt 늦은 result 거부로 한정. §6.7.3 전제·근거 및 PLAN D6·실측 표 정정. |

## 5. UNVERIFIED 통합 (양 레인 — "없음"과 구별)

두 레인 모두 지시대로 테스트·라이브 프로브를 실행하지 않았다(문서 검증 범위). 미확인 항목:

- **테스트/라이브 프로브 미실행** (양 레인) — `bun test` 미실행. `:452`·`:529` 본문은 claude가
  정독했으나 순서-역전 패치가 없어 회귀 재현은 코드 추론.
- **D1 live ACK 매트릭스 · tower-before-join 타이밍** (양 레인) — 미확인.
- **D2 relay ACK 주입 seam 실현가능성·공수** (양 레인) — 존재하지 않는 표면이라 미확인.
- **issuer · currency 게이트 · quarantine journal · replay · operator-ack 동작** (codex) — `5cd070b`에서
  design-only, 실행할 런타임 구현 없음.
- **JSONL crash/SIGKILL/전원 손실/torn write 내구성** (codex) — 미확인.
- **`relay-client.ts:322-345` `handoff()` throw 조건** (claude) — R43 원장·PLAN 축자 신뢰, 직접
  재확인 안 함.
- **`findTask` 구현(dispatchHandoffId 폴백 인덱스 존재 여부)** (claude) — 호출은 확인, 폴백 인덱스
  기존 존재는 미확인(H-new-1 제안①의 실현가능성이 이에 걸림).
- **conv 경로 `:1930`·`:1300`·`:1319` 본문** (claude) — card 경로만 정독(U4 out-of-scope).
- **D2 주입 표면·`fake-herdr.ts` 구조** (claude) — "가장 과소평가되기 쉬운 비용" 경고 항목, 미검증.
- **`generateHandoffId()` 유일성/충돌** (claude) — 호출 확인, 구현체 미정독.

## 부록 A — claude 레인 축자 전문 (verdict: pending-revision)

전체 트랜스크립트(세션 스크래치패드 — 영속 저장소 아님):
`/private/tmp/claude-501/-Users-kyoungsiklee-projects-fable-advisor/0cb94fca-e745-4e18-8938-4490323e2d27/scratchpad/r43b-claude.txt`

---

[R-RESULT] R43b(claude 레인) — verdict: **pending-revision** · ready: **no** [1/3]

R43의 High 6·Medium 5·전제 2건은 **전부 실질 해소**됐고, 개정본이 새로 쓴 좌표(가드 5곳·dispose 15곳·발행 18개·Flight-less 3경로·room/card-ops/card-contract)는 **코드 재실측 결과 전부 정확**하다. 3연속 reject 원인이던 "좌표 드리프트 + 락 자기모순"은 이번에 실제로 닫혔다. 다만 개정이 새로 편입한 §6.7.1~3과 기존 경로 사이에 **신규 High 1·Medium 2**가 남아 approve는 이르다.

## R43 지적 해소 표
| # | 지적 | 판정 | 근거 좌표(재실측) |
|---|------|------|------|
| P | Flight 보편성 반증 | 해소 | Flight-less 3경로 `:850`(cardId 열화 `?? "task_0"`, `h.id` 가용)·`:1114`·`:1204` 모두 flight 생성(`:1214`) 이전. 시그니처 Flight 미수령 `:2364-2371`. issuer가 seq 소유(§6.7.2) |
| Q | cardSeq=attempt 카운터, 삭제 시 회귀 | 해소 | `:575` 선언·주석 `:1124-1127`·소비 `:1141 :1192 :1220 :2372-2373`. 삭제 철회·유지 확정 |
| H1 | D4↔D7④ 상호배타 | 해소 | 만료 dispose 삭제(결정①②)로 모순 소멸. D7④="타이머 dispose 0건"(PLAN:88), D4="만료는 재알림만"(PLAN:85) 일치 |
| H2 | 락 8 자기모순 | 해소 | 락 8 표(`:1265-1271`) 개정 — "만료 dispose" 행 삭제→"재알림만". §6.6·락 13 정합. 자기모순 0 |
| H3 | tower 스칼라 dedup 파괴 | **부분 해소** | currency 게이트(§6.7.3) 편입 — dispatchHandoffId 대조+seq dedup+stale drop. 재dispatch는 notes clobber(`card-ops.ts:112-116`)로 last_seq 리셋되어 seq-restart 삼킴 무력화. **단 findTask-miss 경로는 게이트 밖**(→High) |
| H4 | Flight-less 3경로 미정의 | **부분 해소** | issuer 중앙화+유한 전이표(§6.7.2). **단 `:850` 특례 타워측 라우팅 미정합**(→High) |
| H5 | 완료판정·가드 5·순서역전 15 | **해소(좌표)** | 가드 5곳 `:2003 :2019 :2067 :2080 :2096` 정확(`:2019`=beginCardCompletion 본류 방어)·dispose 15곳 정확(분류 (a)6·(b)4·(c)5, `:2219` 포함)·blocked 분기(`:2202-2208`) 가드 부재 확인. **단 회귀 게이트 좌표 오인용**(→Medium) |
| H6 | durable 매체 미규정 | 해소 | §6.7.1 매체(JSONL)·dedup 키·flush·보존·표면화 명시. `recordResultDeliveryUnconfirmed`(`:490` 모듈 let, `:506-522` log만=휘발) 재사용 금지. **단 flush 실패 미규정**(→Low) |
| M1 | D1 전칭 명제 과장 | 해소 | D1 완료판정(PLAN:81) 전칭 제거+관측 열거+코드 불변식(`room.ts:452-459` 정합) 무조건화 |
| M2 | D1-b vs D5 원자성 | 해소 | D1-b 재설계(PLAN:82) accepted 스텁→완전 D5 원자집합 비교→D3 재비교. 판별표 (a)(b)(c) |
| M3 | conv 좌표 과소 | 해소 | 전수 열거(PLAN:94) 헬퍼 3+void 4(`:1534 :2255 :2274 :2279`)+await-폐기 1(`:1930`) |
| M4 | conv 비가역 상태 전진 | 해소(scoping) | card-only 경계+U4 named follow-up+미해소 명기(PLAN:94,129) |
| M5 | 요구 4 reconcile 회수 소실 | 해소 | out-of-scope 명시(PLAN:93)+one-liner 과장 제거(PLAN:57) |

(신규 High/Medium/Low·UNVERIFIED는 2/3, 3/3에서 계속)

---

[R-RESULT] R43b(claude 레인) [2/3] — 신규 발견

## High
### H-new-1 — `:850` 열화 cardId가 타워 findTask를 통과 못 해 조용히 strand — §6.7.2 "유일 통과점" 주장이 타워측에서 깨진다
좌표: `bridge-runtime.ts:850-855`(cardId `extractCardIdLoose(...) ?? "task_0"`)·`card-ops.ts:159`(`findTask(payload.cardId)`)·`:160-162`(miss→`{ok:false}`)·설계 §6.7.2 `:727-732`·§6.7.3 `:765-771`
축자: §6.7.2(`:731`) "모든 카드 result 발행(...Flight-less 3경로 포함)이 이 issuer를 **유일 통과점**으로". §6.7.3(`:765`) 게이트는 "applyCardResult에서" — 그런데 `card-ops.ts:159` `findTask(payload.cardId)`가 **먼저** 실행되고 miss면 `:160` `return {ok:false}`로 **게이트 도달 전 종결**. §6.7.3(`:768`)은 stale drop을 "**조용한 삼킴 금지**"로 못박으나 findTask-miss drop은 그 규칙 밖.
결함: `:850` payload_invalid는 cardId를 `"task_0"`로 열화 발행. relay가 정상 수락(recipientCount=1→strict 성공)하므로 **브릿지는 send 성공 판정→send_unknown 미진입→durable quarantine 미발화**. 타워는 `findTask("task_0")`로 원본 카드를 못 찾아 조용히 폐기. 결과: 실제 dispatch된 카드가 `doing`에 영구 잔존하는데 **브릿지 quarantine도 타워 게이트도 못 잡는다** — 지배 불변식 "카드가 조용히 멈추지 않는다"를 §6.7.2가 특례로 끌어들인 in-scope 경로에서 위반. 두 신설 섹션(§6.7.2 issuer↔§6.7.3 게이트) 사이 미봉합 seam(교훈 31 패턴).
제안: 셋 중 하나 명시 — ① 타워가 cardId miss 시 dispatchHandoffId로 findTask 폴백, ② 브릿지가 payload_invalid는 ACK 성공 무관하게 durable quarantine 강제 기록, ③ "`:850` unextractable-cardId 타워 라우팅 out-of-scope" 명시(단 §6.7.2 "유일 통과점" 축자 완화 필요).

## Medium
### M-new-1 — presence_unknown 해제 규약이 §6.0.2 ↔ §6.7.1/락8표/락13 사이에서 모순
좌표: §6.0.2 `:372`·§6.7.1 `:708-711`·락 8 표 `:1251-1252`·락 13 `:1414-1417`
축자: §6.0.2(`:372`) presence_unknown "안전한 자동 출구=**있음.** 늦게 단일 result 내도 local single-issue 안 깨짐". §6.7.1(`:708`) "해제는 (a)운영자 ack (b)프로세스 종료뿐" + 락8표(`:1251`)·락13(`:1416`)이 **양 unknown 공통** 적용.
결함: R43b가 quarantine 해제를 두 unknown 공통으로 규정하면서 presence_unknown이 §6.0.2에서 갖던 "늦은 단일 발행 자동 해소" 출구와 충돌. presence_unknown이 self-resolve(늦은 발행 성공→카드 전진)하면 in-memory 상태·레코드가 정리돼야 하나 해제 규약이 금지. 결과: (a)§6.0.2 자동 출구 사문화 or (b)해소된 카드 레코드가 운영자 ack까지 잔존(오탐 누적). 리뷰 지시 ①(신설 §6.7.1~3↔기존 락 모순)의 실제 충돌. over-alert 방향이라 correctness 위반은 아니나 두 섹션이 정반대 해제 규약.
제안: §6.7.1/락8표 해제 규칙에 "(c) presence_unknown의 §6.0.2 늦은 단일 발행 성공(relay_accepted)"을 세 번째 자동 해제 사유로 추가.

### M-new-2 — H5 blocked-분기 회귀 게이트가 엉뚱한 테스트를 지목(pane_closed 테스트)
좌표: PLAN D5 `:86`·D7 `:88`이 인용한 `still-running.test.ts:452` vs 실제 blocked-분기 테스트 `:529`(실경로 `packages/host/src/still-running.test.ts`)
축자: PLAN D5(`:86`) "회귀 게이트 `still-running.test.ts:452`(순서 역전 시 **blocked 분기**에서 두 번째 result가 나가는지)". 실측 test `:452` = 제목 "⑦ **pane_closed** during deferral", `fake.pushEvent("pane.closed")`, `expect(reason).toMatch(/pane_closed/)` — blocked 분기(`:2202-2208`) 아니라 pane_closed 분기(`:2156-2168`). 실측 test `:529` = 제목 "⑩ M-1: **blocked** during deferral → failed once", `agent_status:"blocked"`, `/agent_blocked/`+single-result assert = H5 blocked-분기 회귀의 진짜 게이트.
결함: H5 회귀 예측은 blocked 분기(가드 부재)가 순서 역전 후 두 번째 result를 내는 것. 그 회귀 게이트는 `:529`(⑩)인데 PLAN/D7이 `:452`(pane_closed)를 blocked 게이트로 인용. 구현자가 `:452` green을 "blocked 안전" 증거로 읽으면 blocked 분기는 실제로 미검증. 커버리지 자체는 `:529`로 이미 존재하므로 좌표만 정정하면 됨. R43 원장(`:115`)에서 전파된 오인용을 R43b가 답습.
제안: PLAN D5/D7의 blocked-분기 회귀 게이트를 `:452`→`:529`(⑩)로 정정. `:452`는 pane_closed 게이트로 별도 유지.

(Low·UNVERIFIED는 3/3)

---

[R-RESULT] R43b(claude 레인) [3/3] — Low + UNVERIFIED

## Low
- **L-new-1 — durable quarantine flush 실패 동작 미규정.** §6.7.1 `:703`("flush=레코드당 즉시 append"). crash-durability가 §6.7.1의 존재 근거인데 **append/flush 자체가 실패(디스크 IO 오류)할 때 동작이 비어 있다** — fail-visible(console+counter) 여부가 구현자 판단. 불변식이 load-bearing인 만큼 실패 경로 한 줄 명시 권고. 구현을 막지는 않으나 무언 유실 재도입 가능.
- **L-new-2 — PLAN D3 `sendResult:2415-2440` 잔여 드리프트.** PLAN `:84`("`sendResult:2415-2440`이 ACK 봉투 보존"). 실측 함수 범위 `:2408-2434`(무조건 `return true`는 `:2429`). R43 Low 표가 지적한 드리프트가 D3 한 줄에 잔존 — 단 §6.7 표(`:651`)는 `:2423`로 정확. "좌표 전면 정정" 주장의 미세 누락.
- **L-new-3 — §6.7.3 (iv) "브릿지 재시작 seq 리셋 유실 해소" 부수이득 서술 부정확.** §6.7.3 `:776-778`. 재dispatch는 notes clobber(`card-ops.ts:112-116`)로 last_seq 이미 리셋, restart-resume은 §9-6 out-of-scope 확정 — dispatchHandoffId 면역이 "seq 리셋 유실"을 어떻게 해소하는지 메커니즘 불명. 부수이득(iii까지가 핵심근거)이라 판정을 흔들지 않으나 서술 정정 권고.

## UNVERIFIED (읽지 않았거나 실행하지 않은 것 — "없음"과 구별)
- **테스트 미실행** — 문서 검증 범위 지시대로 `bun test` 미실행. `:452`·`:529` 본문은 정독했으나 순서-역전 패치가 없어 회귀 재현은 코드 추론(H5·M-new-2 동일 성질).
- **`relay-client.ts:322-345` `handoff()` throw 조건 미정독** — "error 봉투일 때만 throw"는 R43 원장·PLAN 축자 신뢰, 직접 재확인 안 함. `sendResult`가 peer_unknown에 true 반환한다는 명제의 relay-client 측 절반 미대조.
- **`findTask` 구현(cardId 인덱스 vs dispatchHandoffId 폴백 인덱스 존재 여부)** — `card-ops.ts:159` 호출은 확인, findTask가 dispatchHandoffId 폴백을 이미 갖는지는 미확인. H-new-1 제안①의 실현가능성이 이 미확인에 걸림.
- **conv 경로 `:1930`·`:1300`·`:1319` 본문** — card 경로 `:1908-1916`만 정독. U4 out-of-scope라 card-only 경계 정합만 확인, conv 내부 미정독.
- **D2 주입 표면 실현가능성·`fake-herdr.ts` 구조** — 설계가 "가장 과소평가되기 쉬운 비용"으로 경고한 항목, 미검증.
- **`generateHandoffId()` 유일성/충돌 가능성** — `room.ts:442` 호출은 확인, 구현체 미정독.
- **다른 검증 레인(codex 등) 산출물 미참조** — 지시대로 독립 유지. 본 판정은 claude 레인 단독 실측.

## 요약 판단
verdict=**pending-revision**, ready=**no**. R43 12개 지적 전부 해소(H3·H4·H5는 좌표/메커니즘 해소, 잔여는 신규 seam으로 분리). 신규 차단 사유는 H-new-1 하나(§6.7.2↔§6.7.3 seam의 조용한 strand). M-new-1·M-new-2는 in-place 정정 가능. reject가 아닌 이유: R43 High/Medium 해소가 견고하고 새 좌표가 전부 정확하다 — 이 트랙의 "지적 반영이 새 모순을 낳는" 3연속 패턴은 이번엔 재발하지 않았고, 잔여는 좁고 국소적이다.

## 부록 B — codex 레인 최종 [R-RESULT] 축자 전문 (verdict: reject)

전체 로그(세션 스크래치패드): `.../scratchpad/r43b-codex.txt`. 최종 `[R-RESULT]` 블록을 아래에
축자 전재한다.

---

[R-RESULT] R43b — verdict: reject
ready: no

| Item | Status | Evidence |
|---|---|---|
| P | partial | Flight-less paths are recognized and issuer centralization is specified at `PANE-DEATH-DESIGN.md:713-749`; actual paths remain `bridge-runtime.ts:850,1114,1204`. However lock 5 still permits sending only to a Flight CAS winner, and `:850` cannot map back to a tower task. |
| Q | resolved | `PANE-DEATH-DESIGN.md:721-736,857-864` retains `cardSeq` for attempt identity and moves result seq to the issuer. Code confirms attempt use at `bridge-runtime.ts:1124-1129,1141,1192,1220`; only result use `:2372-2373` is slated for replacement. |
| H1 | resolved | D4 and D7 now consistently require timer-path dispose 0: `PLAN.md:85,88`; lock 8 `PANE-DEATH-DESIGN.md:1251-1271`. |
| H2 | resolved | Expiry disposal is deleted; 10 minutes causes re-escalation only: `PANE-DEATH-DESIGN.md:1235-1254,1265-1271,1414-1417`. A different invariant violation remains below. |
| H3 | resolved | The same PATCH now includes the tower currency gate: `PANE-DEATH-DESIGN.md:751-778`; `PLAN.md:87`. Static trace of `needs_verification(seq=1)` then `failed(seq=2)` does not swallow the second result: `applyCardResult` accepts blocked tasks and drops only `seq <= last` (`card-ops.ts:185-197`). |
| H4 | partial | Issuer topology is specified, but Flight-less send ownership contradicts lock 5, and the `:850` result remains unapplyable. See High-2 and High-3. |
| H5 | resolved | Code confirms five guards at `bridge-runtime.ts:2003,2019,2067,2080,2096`, 15 `disposeCardFlight` call sites, and 18 emitters (7 `sendFailedResult`, 11 `finishCard`). PLAN requires CAS checks at all five plus the blocked latch: `PLAN.md:86,88`. |
| H6 | partial | Medium, dedup key, retention, and nominal ack are specified at `PANE-DEATH-DESIGN.md:684-711`, but crash-durable flush, replay, and operator-ack mechanics remain undefined. |
| M1 | resolved | D1 removes the four-sample universal claim and makes unexpected ACKs recoverable unknowns: `PLAN.md:81`. |
| M2 | resolved | D1-b now compares baseline against the complete D5 atomic set under a deterministic accepted stub, then layers D3: `PLAN.md:82`. |
| M3 | resolved | Conv residual sites are fully enumerated at `PLAN.md:94`; code confirms three helper ACK-discard sites, four `void` callers, and one awaited-but-discarded caller. |
| M4 | resolved | Conv’s irreversible advancement is explicitly retained as a named card-only residual at `PLAN.md:94,129`, matching `bridge-runtime.ts:1777-1797`. |
| M5 | resolved | Automatic reconcile recovery is explicitly out of scope and the liveness claim is narrowed to observable/recoverable: `PLAN.md:93`; `PANE-DEATH-DESIGN.md:674-675`. |

The PLAN’s marked verbatim quotations from §6.7-bis match the amended source text. The currency-gate two-result case also passes static analysis as described above.

### High

#### H-new-1 — R43b falsely claims zero irreversible action from uncertain observation

- **Coordinate:** `PLAN.md:59-61,128`; `PANE-DEATH-DESIGN.md:407-415,440-443,505-510,533-548,1229-1250,1376-1381`.
- **Verbatim evidence:** pane presence is only `C±`; the governing rule says irreversible action requires “authoritative evidence”; lock 8 nevertheless says two successful absent observations “terminal을 합성한다,” and lock 11 treats “동일 generation 결속 연속 absence” as deterministic negative evidence permitting automatic blocked.
- **Defect:** Repeating a corroborating remote observation does not make it authoritative. Visibility delay has no proven bound. The synthesized terminal can therefore emit a failed result from uncertain observation, directly contradicting the invariant and R43b’s new assertion that such irreversible actions are zero.
- **Proposal:** Consecutive absence may enter `presence_unknown`, quarantine, and notify only. Require authoritative lifecycle evidence or operator action before emitting a failed result or changing board state.

#### H-new-2 — Flight-less issuer paths cannot satisfy lock 5’s sole-owner rule

- **Coordinate:** `PANE-DEATH-DESIGN.md:665-668,713-749,1164-1184`; `bridge-runtime.ts:842-855,1106-1120,1189-1211`.
- **Verbatim evidence:** lock 5 says, “오직 `completion_candidate → result_sending` CAS 승자만 `sendResult`를 호출한다.” Its R43b amendment simultaneously says that issuer centralization includes Flight-less paths `:850 :1114 :1204`.
- **Defect:** Those three paths have neither a Flight nor `completion_candidate`, so they cannot produce the required CAS winner. The amendment adds an issuer but never defines issuer-level acquisition as an alternative ownership CAS.
- **Proposal:** Make an atomic `issuer.acquire(logicalResultKind)` the universal send authority. Flight-backed completion must win both lifecycle CAS and issuer acquisition; pre-Flight failures use issuer acquisition alone. Amend lock 5 accordingly.

#### H-new-3 — The `:850` dispatchHandoffId-only special case cannot reach `applyCardResult`

- **Coordinate:** `PANE-DEATH-DESIGN.md:727-732,759-768`; `bridge-runtime.ts:842-855`; `card-contract.ts:16,36-44`; `card-ops.ts:148-162`.
- **Verbatim evidence:** “`:850` 특례 … `dispatchHandoffId` 단독 키”; the currency gate claims both comparison values exist after `applyCardResult` loads the task.
- **Defect:** The emitted payload still carries degraded `cardId="task_0"`. `applyCardResult` parses the payload and calls `findTask(payload.cardId)` before any proposed handoff-id comparison. It returns `task not found`, so the result can be relay-accepted yet never applied to the actual dispatched task. A loosely extracted invalid cardId may fail schema parsing even earlier.
- **Proposal:** For `payload_invalid`, resolve the task by unique persisted `task.handoffId` before cardId lookup, then validate any usable cardId against that task. Alternatively define a separate dispatch-error envelope that is keyed by server-generated handoff ID.

#### H-new-4 — v0.27.0 simultaneously excludes and requires the (C) lifecycle semantics

- **Coordinate:** `PLAN.md:88,95`; `PANE-DEATH-DESIGN.md:903-923,1374-1381,1429-1438`.
- **Verbatim evidence:** PLAN declares the “(C) 전환 본체 … phase registry … 별도 PATCH,” while D7 requires `pane-cleanup.test.ts:245` to remain green as “sendResult then pane.close exactly once.” Lock 11 instead says automatic cleanup occurs only after human confirmation plus tower receipt; §7.1 requires `done` result 0 and pre-confirmation `pane.close` 0.
- **Defect:** There is no single implementation satisfying both acceptance contracts. Implementing R43b on current code preserves forbidden automatic close; following locks 11–13 necessarily invalidates the required legacy test.
- **Proposal:** Either include the minimal (C) lifecycle/receipt path in v0.27.0 and replace the old test expectation, or make v0.27.0 explicitly depend on an already implemented predecessor version containing (C). Do not leave that body out of scope while using its states and locks.

### Medium

#### M-new-1 — `presence_unknown` has no seq for the mandatory quarantine key

- **Coordinate:** `PANE-DEATH-DESIGN.md:686-703,733-736,924-926,1404-1417`.
- **Verbatim evidence:** quarantine dedup is `(cardId, dispatchHandoffId, seq)`; seq increments only when a result payload is newly constructed; `presence_unknown` means a result was never constructed.
- **Defect:** A `presence_unknown` record cannot satisfy the mandatory key without allocating seq early, which would contradict the issuer’s construction-time numbering rule.
- **Proposal:** Use a tagged journal key: `send_unknown` uses the payload tuple; `presence_unknown` uses `(cardId, dispatchHandoffId, "presence")` or an issuer-generation identifier. Allocate result seq only when the permitted late result is actually constructed.

#### M-new-2 — “Immediate append” does not define durable JSONL semantics

- **Coordinate:** `PANE-DEATH-DESIGN.md:692-710`; `PLAN.md:127`; checklist `PANE-DEATH-DESIGN.md:1456-1459`.
- **Verbatim evidence:** “flush = 레코드당 즉시 append,” “보존 = 운영자 ack까지,” and status/doctor must display unresolved counts.
- **Defect:** The design omits fsync/fdatasync behavior, torn-line recovery, startup replay/folding, ack-record encoding, permissions, and the operator ack surface. Plain buffered append can acknowledge entry into quarantine before the record is crash-durable.
- **Proposal:** Lock file mode and symlink protection, append-plus-durability semantics, malformed-tail recovery, startup replay, an append-only ack record, unresolved-count folding, and compaction/retention behavior.

#### M-new-3 — Issuer transitions and “local single-issue” disagree about two logical results

- **Coordinate:** `PANE-DEATH-DESIGN.md:738-748,866-875,1297-1300`; `PLAN.md:87,92`.
- **Verbatim evidence:** one dispatch may legally contain “논리 result 2건,” but lock 9 defines local single-issue as the bridge not making a result twice for the same lifecycle.
- **Defect:** The generic issuer table also does not state whether an initial pre-Flight `failed` result enters the “failed send” row directly or passes through “명시적 거부 → failed 재구성,” which could create a redundant second failed result.
- **Proposal:** Include `logicalKind` in issuer state. Define exactly one initial result and at most one rejection-escalation result, each issued once; initial failed results must go directly to `relay_accepted | send_unknown`.

### Low

#### L-new-1 — R43’s stale `sendResult` coordinates remain in PLAN

- **Coordinate:** `PLAN.md:67,84`; `bridge-runtime.ts:2408-2434`.
- **Verbatim evidence:** PLAN still cites `sendResult:2415-2440` and unconditional true at `:2437`.
- **Defect:** The current function is `:2408-2434`, and `return true` is `:2429`, exactly as R43’s drift table reported.
- **Proposal:** Replace the two stale coordinates and avoid claiming that all coordinates were corrected.

#### L-new-2 — “Nobody knows” remains an overstatement

- **Coordinate:** `PLAN.md:57`; `bridge-runtime.ts:487-522,2391-2399`.
- **Verbatim evidence:** PLAN says result arrival is something “아무도 모른다”; current code increments `result_delivery_unconfirmed` and logs correlated cardId/seq/reason on boolean failure.
- **Defect:** Caller control flow and durable correlation are missing, but process-local observability is not absent.
- **Proposal:** Say that no caller or durable recovery mechanism knows whether the result was accepted; retain the existing log/counter as weak observability.

### UNVERIFIED

- No tests or live probes were run, per instruction.
- D1’s live ACK matrix and tower-before-join timing remain unverified.
- D2’s relay ACK injection seam does not exist, so feasibility and cost remain unverified.
- Issuer, currency gate, quarantine journal, replay, and operator-ack behavior are design-only at commit `5cd070b`; no runtime implementation exists to exercise.
- JSONL durability under process crash, SIGKILL, power loss, or torn writes remains unverified.

---

[PANEDEATH-R43B-DONE] verdict=pending-revision high_new=4 med_new=3 low_new=3 lanes=2 next=R43c
