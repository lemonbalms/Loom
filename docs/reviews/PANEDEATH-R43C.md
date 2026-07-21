# PANE-DEATH R43c 검증 원장 (PLAN v0.27.0)

검증 리비전 `2b5a951` (R43b reject/pending-revision 반영 R43b 2차 개정본).
레인 = **2레인 병행 산출물** — in-harness Claude(Opus 4.8, 문서 검증 범위 지시) + 로컬
`codex-cli`(`codex exec --sandbox read-only`, reasoning=high). **두 레인은 서로의 산출물을 모르는
상태에서 독립 검증**했다 — claude 레인 verdict **pending-revision**(신규 High 0·Med 1·Low 3), codex
레인 verdict **reject**(High 1·Med 3·Low 3).
좌표의 `:N`은 별도 표기가 없으면 `packages/host/src/bridge-runtime.ts`의 행 번호다. PLAN 좌표는
`docs/PLAN.md:N`, 설계 좌표는 `docs/spikes/PANE-DEATH-DESIGN.md:N`으로 명시한다.

> **본 원장은 R43c 두 레인 산출물의 기록이며, 기존 리뷰 원장 5본
> (`PANEDEATH-CODEX-REVIEW*.md`·`PANEDEATH-R43.md`·`PANEDEATH-R43B.md`)은 수정하지 않는다.**
> 아키텍트 판정(§4)은 확정이며, 그 반영은 PLAN·설계 3차 개정에서 이뤄졌다(설계 §11 R43c 3차 문단 ·
> PLAN Status·changelog·D5·D8·U2 등).

## 1. Verdict

**종합 verdict: `pending-revision`** — codex 레인 **reject** ↔ claude 레인 **pending-revision** 중
아키텍트가 **pending-revision을 채택**했다.

**근거:**
- R43b 신규 지적 10건 해소는 **양 레인 독립 수렴**으로 견고하다(§2). 2차 개정본이 새로 쓴 좌표·문면
  (`:529`/`:452` 제목 · `:2429` 반환 · `dispatchCard` clobber · `:850` 열화 · `TaskItem.handoffId`
  존재)은 **양 레인 코드 재실측 결과 정확**하다.
- **신규 발견 전원이 문면·전파·표 분할이다**(§3). codex High 1건(H-new-1)조차 "새 결함"이 아니라
  H-new-4 해소가 (C)/pre-C 경계를 **demarcation하지 않은 채** (C) 의미론을 pre-C 구현에 남긴 문면
  미봉합이고, 나머지 Med·Low는 개명·태그드 키 파생 전파·표 1행 분할·좌표·게이트 도달성 서술이다.
  **설계 재론(락 개정·범위 재획정급)은 0건**이며, 수렴 High(시대 경계)도 **시대 매개변수화 명시**로
  닫혔다.
- **신규 High 0**(claude 레인 판정 · codex H-new-1도 문면 정정으로 닫힘) → 잔여가 문면 전파이므로
  **R43d는 경량 델타 검증(codex 단일 레인)** 후 종결한다.

**codex reject ↔ claude pending-revision 판정 차이:** codex는 H-new-1((C)/pre-C 경계 미봉합)을 High로
격상해 reject했고, claude는 동일 지적을 **Medium-1**(H-new-4·M-new-3 상호 미정합 — 국소 문면 정정)로
좁혀 pending-revision했다. 아키텍트는 두 레인이 **같은 seam**(H-new-4의 (C) 단계 순서 해소가 §6.7.2
전이표·락 5의 (C) 의미론과 미봉합)을 가리킴을 확인하고, 그것이 **시대 매개변수화 문면 정정으로 닫히는
demarcation 결함**이지 설계 재론이 아님을 판정해 pending-revision을 채택했다.

## 2. R43b 지적 해소 수렴 표 (10건 · 양 레인 판정 병기)

R43b 신규 지적(2차 개정본이 반영한 10건) — 양 레인이 **실질 해소로 수렴**했다. codex의 "partial"은 원
지적의 substance가 해소되되 **같은 영역에서 신규 문면 gap**(§3)을 발견했다는 뜻이다.

| # | R43b 지적 / 판정 반영 | claude 레인 | codex 레인 | 수렴 |
|---|---|---|---|---|
| 1 | `:850` strand — `dispatchHandoffId` 스캔 폴백 + cardId 교차검증 | 해소(§6.7.3:813-826 게이트보다 먼저 실행 · `TaskItem.handoffId` 존재로 실현 가능) | partial(폴백 도달성 서술 과장 → L-new-1) | 실질 해소 |
| 2 | Flight-less sole-owner — issuer acquisition = 보편 발행 권위 | 해소(락 5 각주 + §6.7.2 · 직교 축, 이중 소유권 충돌 없음) | resolved | 수렴 |
| 3 | (C) 단계 순서 (`:245` vs 락 11) | 부분(문자 그대로의 모순은 닫힘, 잔여 → Medium-1) | partial(pre-C 계약 미정의 → H-new-1) | 수렴(seam 지목 일치) |
| 4 | 불변식 주어 한정 + §9-ter 정직성 항목 | 해소(U3 주어 한정 · 락 11 재론 기각 · 항목 3 등재) | resolved | 수렴 |
| 5 | quarantine 태그드 키 + 해제 (c) | 해소(§6.0.2·락 8표·락 13 4곳 정합) | partial(파생 표면 미전파 → M-new-2) | 실질 해소 |
| 6 | 내구 세부(0600·fsync·replay·ack fold·fail-visible) | 해소(§6.7.1:707-722) | partial(M-new-2에 흡수) | 실질 해소 |
| 7 | 전이표 `logicalKind` + pre-Flight initial failed 직행 | 부분(표 신설, (C) 의미론 미봉합 → Medium-1) | partial(1행이 성공형/failed형 겸함 → M-new-3) | 수렴 |
| 8 | blocked 회귀 게이트 `:452`→`:529` | 해소(코드 실측: `:529`=blocked, `:452`=pane_closed · D5·D7 정정) | resolved | 수렴 |
| 9 | 좌표 `:2408-2434`/`:2429` (D3·one-liner) | 해소(함수 범위·`return true` 실측) | partial(`:113` 한 곳 잔재 → L-new-2) | 실질 해소 |
| 10 | §6.7.3 (i)(iv) "seq 리셋 유실" 서술 철회 | 해소(`dispatchCard` clobber 실측 확인) | partial(§10 어서션 잔재 → L-new-3) | 실질 해소 |

**공통 무회귀:** R43 원 지적 12건은 양 레인 모두 **되돌린 흔적 0건**(좌표·락 무회귀 확인).

## 3. 신규 발견 요약 (레인별 · 수렴 표기)

### High (codex 1건 · claude 0건 — 수렴 1건)

| ID | 발견 | 레인 | 수렴 |
|---|---|---|---|
| **(C)/pre-C 시대 경계** | H-new-4 해소가 "pre-C 현행 완료 경로 위"라 명시하면서도 §6.7.2 전이표(`initial`=needs_verification)·락 5("status는 needs_verification")·§7.1(done 0)의 **(C) 의미론을 pre-C 구현에 그대로 남김** — pre-C 계약을 정의하지 않음. `CardResultStatusSchema=z.enum(["done","failed"])`(스키마에 needs_verification 부재)와 정면 충돌 | codex **H-new-1** ≡ claude **Medium-1** | **양 레인 독립 수렴** |

### Medium (codex 3건 · claude 0건 신규 — 1건은 High와 수렴)

| ID | 발견 | 레인 | 수렴 |
|---|---|---|---|
| **D5 CAS 명명** | PLAN D5가 불리언을 "발행 소유권 불리언(CAS)"로 명명 — 락 5는 issuer acquisition이 "유일한 send 권위"이고 lifecycle CAS는 Flight-backed **부작용** 소유권일 뿐. 구현자가 lifecycle CAS를 발행 권위로 오인하면 Flight-less sole-owner gap 재생 | codex **M-new-1** | codex 단독 |
| **태그드 키·해제(c) 파생 미전파** | §6.7.1 본절은 정확하나 파생 표면(레코드 메타데이터 "cardId · seq · dispatchHandoffId" · PLAN U2 · §10 · 락 8 prose)이 **무태그 키·해제 2사유**로 잔존; 자동 해제(c)의 append-only fold 표현 미규정 | codex **M-new-2** ≈ claude **Low-1**(presence→send 전이 시 presence 레코드 운명) | **동일 영역 수렴** |
| **전이표 1행 status 겸용** | `initial` 1행이 성공형·failed형을 겸해 "명시적 거부→escalation" 엣지가 failed형에도 매치되는 것처럼 읽혀 pre-Flight 직행 문단과 충돌 | codex **M-new-3** | codex 단독(아키텍트 직접 교정의 불완전 지점) |

### Low (codex 3건 · claude 3건 — 수렴 2건)

| ID | 발견 | 레인 | 수렴 |
|---|---|---|---|
| **폴백 경로 의미론** | 폴백 성공 경로의 직후 불일치 게이트는 **구성상 항등이라 도달 불가** — 열화 `:850` stale은 게이트가 아니라 scan-miss로 걸러짐. "stale drop 게이트 도달" 서술 과장 | codex **L-new-1** ≈ claude **Low-3**(항등 비교 미문서화 · 비차단) | **수렴** |
| **좌표 잔재** | PLAN `:113`에 `bridge-runtime.ts:2423-2440` 잔존 — 함수 범위는 `:2408-2434`, handoff 호출만 `:2423-2428` | codex **L-new-2** | codex 단독(8번 partial) |
| **§10 재시작 어서션 잔재** | §6.7.3은 "seq 리셋 유실" 근거를 철회했으나 §10 체크리스트가 "브릿지 재시작 seq 리셋 유실도 함께 해소"를 여전히 어서션으로 요구 | codex **L-new-3** | codex 단독 |
| **D1-b `:529` 미편입** | PLAN D1-b 회귀 게이트 목록(`:452`·`:245`·`:816`)에 M-new-2가 D5/D7에 추가한 blocked 게이트 `:529` 누락 | claude **Low-2** | claude 단독 |
| **presence→send supersede** | presence_unknown 늦은 발행이 send 시도(→ send_unknown)로 전이 시 기존 "presence" 태그 레코드 운명 미규정(한 카드 2레코드) | claude **Low-1** | codex M-new-2와 수렴 |
| **스캔 충돌 처리** | 새 `dispatchHandoffId` 스캔의 중복 매치(비정상) 처리 미규정 | codex **UNVERIFIED 말미** | codex 단독 |

## 4. 아키텍트 판정 표 (확정 — 재논증 금지)

| Finding | 판정 | 반영 |
|---|---|---|
| **(C)/pre-C 시대 경계** (codex H-new-1 ≡ claude Med-1 — 수렴) | 수용 | **시대 매개변수화로 이원화**: 전이 구조(issuer 소유·채번·strict ACK 3분기·흡수·quarantine)는 시대 무관 동일하고, **initial 성공형 result status만 매개변수** — v0.27.0(pre-C) = `done`(현행 스키마 `done`/`failed`, wire 무변경) · (C) 본체 = `needs_verification`(= `status="failed"`+`reason="needs_verification"` 인코딩 — §10 기존 규정, 신규 스키마 값 아님). §6.7.2 전이표·D4의 "needs_verification→failed→흡수" 예시·락 5 (C) 각주에 **[v0.27.0]/[(C) 본체] 시대 표기**를 달아 어느 행·문장이 현 PATCH에서 live인지 명시. §7.1-0 "done 0건"은 (C) 본체 게이트임을 §7.1에 명시. D8 R43d 확인 항목의 해당 문구도 동기화. |
| **전이표 1행 status 분할** (codex M-new-3 — 아키텍트 직접 교정의 불완전 지점) | 수용 | §6.7.2 전이표 1행을 **initial(성공형)** / **initial(failed형)** 2행으로 분할: 성공형만 "명시적 거부 → rejection_escalation" 엣지 보유, failed형은 모든 비수락 ACK가 **escalation 없이 send_unknown 직행**(기존 직행 문단과 표를 일치 — 문단만 있고 표가 안 갈랐던 결함). |
| **D5 CAS 명명** (codex M-new-1) | 수용 | PLAN D5(+설계 해당부)의 "발행 소유권 불리언(CAS)"을 **"Flight 부작용 소유권 불리언(`flightSideEffectOwner` 상당)"**으로 개명하고 **접속 규칙 명시**: Flight-backed send = lifecycle CAS **그리고** issuer acquire, Flight-less send = issuer acquire 단독(락 5 각주와 동일 문구). D5·D7 완료 판정에 이 접속 규칙 어서션 추가. |
| **presence 태그드 키 파생 전파** (codex M-new-2 ≈ claude Low-1) | 수용 | 태그드 키·해제(c)를 파생 표면 전부에 전파: PLAN U2(레코드 키 서술) · §10 체크리스트(quarantine 항목의 무태그 키·해제 2사유 잔재) · 락 8 prose · §6.7.1 레코드 메타데이터 서술("cardId · seq · dispatchHandoffId"를 **판별 유니언**으로 — send_unknown은 seq 필수, presence_unknown은 "presence" 태그·seq 없음). **해제 (c)의 fold 표현 규정**: 자동 해소도 append-only **자동-해소 레코드**로 fold(운영자 ack 레코드와 동형). **presence→send 전이 시 supersede**(claude Low-1): 늦은 발행이 send 시도로 전이하면 presence 레코드는 seq 레코드로 supersede됨을 1줄 명시. |
| **폴백 경로 의미론** (codex L-new-1 ≈ claude Low-3 — 수렴) | 수용 | §6.7.3 폴백 서술 정정: 폴백 성공 경로에서 직후 handoffId 게이트는 **구성상 항등이라 도달 불가** — 폴백 성공 = per-dispatch seq dedup으로 직행, **폴백 miss = `handoff_unmapped_or_stale` 관측 레코드**(stale `:850` result는 이 경로로 걸러짐 — "stale drop 게이트 도달" 주장 제거). 일반 cardId 경로만 게이트의 불일치 분기 도달. |
| **§10 재시작 어서션 잔재** (codex L-new-3) | 수용 | §10의 "브릿지 재시작 seq 리셋 유실도 함께 해소" 삭제 — 철회된 근거의 잔재. stale-attempt 거부·per-dispatch dedup·스칼라 폴백만 유지. |
| **좌표 잔재** (codex L-new-2 + 8번 partial) | 수용 | PLAN `:113` 인근의 `bridge-runtime.ts:2423-2440` → `:2408-2434`(handoff 호출 별도 인용 시 `:2423-2428`). 전역 재스캔으로 동형 잔재 0 확인. |
| **D1-b `:529` 편입** (claude Low-2) | 수용 | PLAN D1-b 회귀 게이트 목록에 `still-running.test.ts:529` 추가(D5·D7과 동기). |
| **스캔 충돌 처리** (codex UNVERIFIED 말미) | 수용(1줄) | §6.7.3 폴백에 중복 handoffId 매치(비정상 — 보드 ≤200 유한) 시 **fail-visible drop**(적용하지 않고 관측 레코드) 1줄. |

**종합 verdict(원장): R43c = pending-revision** — codex reject ↔ claude pending-revision 중 아키텍트가
pending-revision 채택. 근거: 신규 지적 전원이 문면·전파·표 분할이고 설계 재론 0, 수렴 High(시대 경계)도
매개변수화 명시로 닫힘. **다음 = R43d 경량 델타 검증(codex 단일 레인) 후 종결.**

## 5. UNVERIFIED 통합 (양 레인 — "없음"과 구별)

두 레인 모두 지시대로 테스트·라이브 프로브를 실행하지 않았다(문서 검증 범위). 미확인 항목:

- **테스트/라이브 프로브 미실행** (양 레인) — `bun test` 미실행. `:452`·`:529`·`:245`·`:816` 본문은
  정독했으나 순서-역전 패치가 없어 회귀 재현은 코드 추론.
- **스캔 폴백 실 구현**(`loadTaskBoard` 순회) (claude) — design-only. `TaskItem.handoffId`(`task-board.ts:48`)
  존재로 실현 가능성만 확인, 배선 미작성. codex 보강: `findTask(taskId, roomId?)`에 handoff 조회 없음,
  `loadTaskBoard(roomId).tasks`는 ≤200 유한 보드 — 중복 handoff 충돌 처리 미규정(→ 판정 표 스캔 충돌 수용).
- **issuer · currency 게이트 · quarantine journal · replay · operator/자동 해소** (양 레인) — `2b5a951`에서
  design-only, 실행할 런타임 구현 없음.
- **JSONL crash/torn-write/SIGKILL/전원 손실 내구성** (양 레인) — 미확인.
- **D1 live ACK 매트릭스 · D2 relay-ACK 주입 표면 실현가능성** (양 레인) — 미확인.
- **Medium-1 저자 의도** (claude) — v0.27.0이 needs_verification을 실제 발행 의도인지 스키마+PLAN out-of-scope로
  pre-C=done 추론(저자 확인 필요 → 시대 매개변수화 판정으로 확정).
- **relay-client throw 조건 · `generateHandoffId()` 유일성** (양 레인) — 선행 원장 신뢰, 미재독.

## 부록 A — claude 레인 축자 전문 (verdict: pending-revision)

전체 트랜스크립트(세션 스크래치패드 — 영속 저장소 아님):
`/private/tmp/claude-501/-Users-kyoungsiklee-projects-fable-advisor/0cb94fca-e745-4e18-8938-4490323e2d27/scratchpad/r43c-claude.txt`

---

[R-RESULT] R43c(claude 레인) — verdict: **pending-revision**
ready: **no**
Advisor: 문서 검증 범위(테스트 미실행). 독립 실측 — 병행 레인 산출물 미참조.

대상: PLAN v0.27.0 R43b 2차 개정본(커밋 `2b5a951`). R43b 신규 지적 10건 델타 검증.

## R43b 지적 해소 표 (10건)
| R43b 지적 | 판정 | 좌표·근거(재실측) |
|---|---|---|
| :850 strand (H-new-3≡H-new-1) | **해소** | §6.7.3:813-826 스캔 폴백 + cardId 교차검증, 게이트보다 먼저 실행. 코드 실측: `TaskItem.handoffId`(task-board.ts:48) 존재 → 폴백 실현 가능. `:851` `?? "task_0"` 열화 + `:853` `dispatchHandoffId:h.id` 확인. D6·D7⑨ 편입. |
| issuer acquisition 보편 권위 (H-new-2) | **해소** | 락5 각주 :1254-1261 + §6.7.2:762-769. lifecycle CAS=Flight-backed 부작용 소유권, issuer.acquire=상위 권위. **이중 소유권 충돌 없음** — 직교 축(가드 5곳은 Flight-based, Flight-less는 issuer 단독). |
| (C) 단계 순서 (H-new-4) | **부분** | out-of-scope L97: v0.27.0=pre-C 위, :245 green=pre-C 회귀게이트, 락11=(C)본체 수용기준=별도 PATCH. **codex가 지적한 문자 그대로의 모순(:245 vs 락11)은 닫힘.** 단 2차 잔여 미봉합 → 신규 Medium(아래). |
| 불변식 주어 한정 (H-new-1) | **해소** | U3 L130 주어를 "이 PATCH 흡수상태·타이머 경로"로 한정, 전역 명제 제거. §9-ter 항목3 락11 긴장 등재, 재론 기각. 판정표 정합. |
| quarantine 태그드 키+해제(c) (M-new-1) | **해소** | §6.7.1:702-706 태그드 `(cardId,dispatchHandoffId,"presence")` + 해제(c):725-729. §6.0.2:371-372·락8표:1329·락13:1507-1512 **4곳 전부 정합**(presence_unknown만 (c), send_unknown 배제). |
| 내구 세부 (M-new-2/L-new-1) | **해소** | §6.7.1:707-722 — 0600·레코드당 fsync·malformed tail 관용·기동 replay·ack append-only fold·append/fsync 실패 fail-visible. compaction 운영후속 명시. |
| 전이표 logicalKind (M-new-3) | **부분** | §6.7.2:773-788 표 + pre-Flight initial failed 직행 신설. 단 (C) 의미론 미봉합 → 신규 Medium(아래). |
| blocked 게이트 :452→:529 (M-new-2 claude) | **해소** | 코드 실측: `:529`="⑩ M-1: blocked during deferral"(`agent_status:"blocked"`), `:452`="⑦ pane_closed during deferral". D5(L88)·D7(L90) 정정, 둘 다 D7 회귀 목록 잔존. |
| 좌표 :2408-2434/:2429 (L-new-2) | **해소** | 코드 실측: `sendResult` 함수 :2408-2434, `return true` :2429(구 :2437=`stop()` 스테일). PLAN one-liner·D3 정정 확인. |
| "아무도 모른다" (L-new-2 codex) | **해소** | one-liner L55 "호출부와 durable 회복 경로가 모른다(프로세스-로컬 result_delivery_unconfirmed log/counter 존재하나 휘발)"로 교정. |
| §6.7.3 (i)(iv) 철회 (L-new-3) | **해소** | 코드 실측: `dispatchCard`(card-ops.ts:111-116)가 `notes: `dispatched node=${node}``로 통째 clobber → `last_seq=` 제거 확정. §6.7.3:798-805·841-846 철회 정확. |

R43 원 지적 12건: 되돌린 흔적 없음(좌표·락 무회귀 확인).

### 신규 발견

**Medium-1 — H-new-4 "pre-C" 해소가 §6.7.2 전이표·락5의 needs_verification (C)-의미론과 미봉합.**
좌표: PLAN L97(pre-C 위) vs §6.7.2:773-788 전이표(`initial`=needs_verification, 명시적 거부→rejection_escalation) · 락5:1241-1243 "(C) 전환 반영: status는 needs_verification" · §6.7.2:790 "재귀 깊이 2(needs_verification→failed→흡수)".
코드 실측: `CardResultStatusSchema=z.enum(["done","failed"])`(card-contract.ts:33) — **needs_verification 스키마 부재**. finishCard는 `done`/`failed`만 발행(:2014,2035,2331). applyCardResult(card-ops.ts:189)는 done→board done(자동 완료).
결함: H-new-4 해소가 "v0.27.0=pre-C(자동 done)·wire 무변경·payload 기존 필드 값뿐"으로 못박았는데, 같은 2차 개정이 M-new-3로 신설한 전이표는 **initial=needs_verification + rejection_escalation((C) 의미론)**으로 서술한다. 두 값 중 하나가 참이다: (a) v0.27.0이 needs_verification을 발행하면 스키마 추가 필요 = "wire 무변경" 위반 + H-new-4 pre-C 프레임 위반, (b) v0.27.0이 done을 발행(실제 스키마·L97)하면 전이표의 needs_verification/rejection_escalation 행·락5 (C)-서술은 v0.27.0에 없는 (C)-본체 동작이다. 어느 쪽이든 D6 issuer 구현자가 "issuer가 무슨 status를 내는가 / needs_verification을 스키마에 넣는가"를 판정 불가. "명시적 거부(needs_verification 거절)→rejection_escalation" 이벤트는 pre-C에 트리거가 없다(스키마에 needs_verification이 없어 거절될 대상 자체가 없음). 이것이 이 트랙이 경계하던 "지적 반영이 새 모순을 낳는" 패턴의 재발 — M-new-3 반영과 H-new-4 반영이 상호 미정합.
제안: §6.7.2 전이표·락5 (C)-서술에 **v0.27.0(pre-C)에서 live한 행 vs (C)-본체 행**을 명시 구분(예: "initial의 status는 v0.27.0에서 done/failed이고, needs_verification/rejection_escalation 행은 (C) 본체 PATCH 소관"). 국소 문면 정정 — 설계 재론 불요.

**Low-1 — presence_unknown→send_unknown 전이 시 "presence" 태그 레코드의 운명 미규정.**
좌표: §6.7.1:725-729(해제(c)는 relay_accepted 종결에만).
결함: presence_unknown의 늦은 단일 발행이 **ACK 불확실(send_unknown)**로 끝나면 seq 채번 후 `(cardId,dispatchHandoffId,seq)` 신규 레코드가 생기는데, 기존 "presence" 태그 레코드는 해제(c)(relay_accepted 요구)를 못 받아 운영자 ack까지 잔존 = 한 카드에 2 레코드. over-alert 방향이라 correctness 위반 아니나 규약 공란. 제안: (c)에 "늦은 발행이 send 시도로 전이하면 presence 레코드는 seq 레코드로 supersede" 한 줄.

**Low-2 — D1-b 순서 역전 회귀 게이트 목록에 :529 미편입.**
좌표: PLAN D1-b(L84)가 회귀 게이트 3개를 `still-running.test.ts:452 · pane-cleanup.test.ts:245·:816`로 열거 — M-new-2가 D5/D7에 추가한 blocked 게이트 `:529` 누락. D1-b는 "순서 역전 회귀 영향 실측"이므로 blocked-분기 게이트도 대상. 제안: D1-b 목록에 :529 추가(D5/D7과 동기). (:452는 pane_closed 게이트로 D1-b 잔존 정당.)

**Low-3 — 스캔 폴백 해석 태스크의 게이트 항등 비교 미문서화(관측).**
좌표: §6.7.3:818-832. 폴백이 `task.handoffId===payload.dispatchHandoffId`로 해석 → 직후 게이트 "dispatchHandoffId vs task.handoffId 불일치=drop"은 폴백-해석 태스크에 **항상 일치(항등)**. **결함 아님**(재실측 확인): 열화 :850 경로의 stale은 폴백 scan-miss(재dispatch로 handoffId 덮여 매칭 태스크 없음)→task not found+counter로 걸러지고, 비폴백(cardId 정상) 경로는 findTask 히트 후 게이트가 정상 작동. 즉 stale 거부가 게이트가 아닌 scan-miss로 이뤄짐이 정합적이나 설계가 명시 안 함. 혼동 방지 1줄 권고(비차단).

### UNVERIFIED
- 테스트 미실행(문서 범위). :452/:529/:245/:816 본문은 정독, 순서 역전 패치 부재로 회귀는 코드 추론.
- 스캔 폴백 실 구현(loadTaskBoard 순회) design-only — TaskItem.handoffId 존재로 실현 가능성만 확인, 배선 미작성.
- Medium-1의 저자 의도(v0.27.0이 needs_verification을 실제 발행 의도인지) — 스키마+L97로 pre-C=done 추론, 저자 확인 필요.
- relay-client throw 조건·generateHandoffId 유일성 — 선행 원장 신뢰, 미재독.

## 종합
2차 개정은 판정표 10건을 **정확히 반영**했고 좌표·코드 주장 전부 재실측 통과(:529/:452 제목·:2429 반환·dispatchCard clobber·:850 열화·TaskItem.handoffId 모두 확인). 신규 High 0. 차단 사유는 Medium-1(H-new-4·M-new-3 상호 미정합 — 국소 문면 정정) 하나로 좁으며 설계 재론 불요. reject 아닌 이유: R43 12건 무회귀, 신규 좌표 전부 정확, 잔여는 (C)/pre-C 경계 demarcation 1건 + Low 3으로 좁고 국소. approve 아닌 이유: Medium-1이 D6 issuer 구현자의 발행 status 판정을 막는 load-bearing 모호성.

## 부록 B — codex 레인 최종 [R-RESULT] 축자 전문 (verdict: reject)

전체 로그(세션 스크래치패드): `.../scratchpad/r43c-codex.txt`. 최종 `[R-RESULT]` 블록을 아래에 축자 전재한다.

---

[R-RESULT] R43c — verdict: reject
ready: no

Resolution table (10 items)

| # | R43b finding / adjudicated fix | Status | Coordinates |
|---|---|---|---|
| 1 | `:850` strand — `dispatchHandoffId` scan fallback + cardId cross-check | partial | `PANE-DEATH-DESIGN.md:813-834`; `PLAN.md:89-90`; code feasibility: `card-ops.ts:148-162`, `task-board.ts:131-155,351-359` |
| 2 | Flight-less sole-owner — issuer acquisition as universal send authority | resolved | `PANE-DEATH-DESIGN.md:762-769,1254-1261` |
| 3 | `(C)` sequencing / `:245` versus lock 11 | partial | `PLAN.md:87,90,97`; `PANE-DEATH-DESIGN.md:971-994,1237-1243` |
| 4 | Invariant subject narrowing + honesty item | resolved | `PLAN.md:130`; `PANE-DEATH-DESIGN.md:1437-1445` |
| 5 | Tagged quarantine keys, release (c), durability | partial | Correct core: `PANE-DEATH-DESIGN.md:702-731,1328-1329,1502-1512`; contradictory derivatives: `PLAN.md:105,129`; `PANE-DEATH-DESIGN.md:699,1342-1348,1551-1562` |
| 6 | Issuer transition table with `logicalKind` and pre-Flight direct path | partial | `PANE-DEATH-DESIGN.md:771-790` |
| 7 | Blocked regression gate `:452→:529` | resolved | `PLAN.md:88,90`; code: `still-running.test.ts:452-478,529-557` |
| 8 | Stale `sendResult` coordinates | partial | Corrected at `PLAN.md:69,86`; stale residual at `PLAN.md:113`; code: `bridge-runtime.ts:2408-2434` |
| 9 | “Nobody knows” overstatement | resolved | `PLAN.md:59` |
| 10 | Seq-reset rationale retraction after notes-clobber measurement | partial | Corrected at `PLAN.md:89,90,125`; `PANE-DEATH-DESIGN.md:796-846`; stale assertion at `PANE-DEATH-DESIGN.md:1548-1550`; code: `card-ops.ts:112-117,190-197` |

### High

#### H-new-1 — The staged `(C)` fix still assigns `(C)` semantics to the pre-C v0.27.0 implementation

- **Coordinate:** `PLAN.md:87,90,97`; `PANE-DEATH-DESIGN.md:971-994,1237-1243`.
- **Verbatim evidence:** PLAN says v0.27.0 is implemented on the “**pre-C 현행 완료 경로**,” while `(C)`—including automatic-done removal and the `send_unknown`/`presence_unknown` split—is a separate PATCH. Yet D4 requires “`needs_verification` → `failed` → 흡수,” lock 5 says the emitted result “status는 `needs_verification`,” and §7.1 requires `status="done"` result 0.
- **Defect:** The sentence separating `:245` from lock 11 removes the literal simultaneous-test conflict, but it does not define a viable pre-C contract. v0.27.0 still normatively requires the result status and unknown-state behavior belonging to the excluded `(C)` body. A pre-C implementation cannot both preserve `pane-cleanup.test.ts:245`’s `done` result and satisfy the referenced D4/lock-5/§7.1 semantics.
- **Proposal:** Either make the minimal `(C)` lifecycle a predecessor dependency and replace `:245`, or split every normative table/test by stage and give v0.27.0 an explicit pre-C result/status transition contract. Remove all future-C acceptance clauses from the v0.27.0 gate if sequencing remains pre-C-first.

### Medium

#### M-new-1 — PLAN D5 still assigns send ownership to lifecycle CAS, conflicting with issuer acquisition

- **Coordinate:** `PLAN.md:88-90`; `PANE-DEATH-DESIGN.md:762-769,1245-1261`.
- **Verbatim evidence:** D5 is titled “**단일 소유권 = CAS/latch**” and calls its boolean “**발행 소유권 불리언(CAS)**.” Lock 5 instead says issuer `acquire(logicalKind)` is the “**유일한 send 권위**” and lifecycle CAS is only Flight-backed side-effect ownership.
- **Defect:** The lock footnote resolves Flight-less authority, but the PLAN’s implementation unit still names a second mechanism as publication ownership. An implementer following D5 can treat lifecycle CAS as sufficient, recreating the exact Flight-less sole-owner gap.
- **Proposal:** Rename D5’s CAS as `flightSideEffectOwner` or equivalent and state its conjunctive rule explicitly: Flight-backed send requires lifecycle CAS plus issuer acquire; Flight-less send requires issuer acquire alone. Add this assertion to D5/D7.

#### M-new-2 — Tagged-key and presence-release changes were not propagated through authoritative derivatives

- **Coordinate:** `PLAN.md:105,129`; `PANE-DEATH-DESIGN.md:699,702-731,1328-1348,1507-1512,1551-1562`.
- **Verbatim evidence:** §6.7.1 correctly says `presence_unknown` uses `(cardId, dispatchHandoffId, "presence")` and release (c) is permitted. Elsewhere the record is still defined as containing mandatory “`cardId · seq · dispatchHandoffId`”; PLAN U2 and §10 still require the untagged `(cardId, dispatchHandoffId, seq)` key; lock 8 prose and §10 still say release is only operator ack or process exit.
- **Defect:** The main clause correctly preserves `send_unknown`’s no-reissue rule, but implementation/checklist surfaces contradict it for `presence_unknown`. They also fail to define how automatic release (c) is represented in the append-only fold.
- **Proposal:** Use a discriminated record union throughout: `send_unknown` requires `seq`; `presence_unknown` requires `"presence"` and no seq. Add an append-only automatic-resolution record for release (c), and synchronize PLAN U2, lock 8 prose, §10, and metadata descriptions.

#### M-new-3 — `logicalKind=initial` still conflates `needs_verification` and initially-failed results

- **Coordinate:** `PANE-DEATH-DESIGN.md:773-788`.
- **Verbatim evidence:** Row 1 says every `initial` explicit rejection goes to the next row; row 2 narrows that transition to “명시적 거부(`needs_verification` 거절).” The prose below separately says pre-Flight `initial failed` bypasses that branch.
- **Defect:** The table’s first row also matches `initial failed`, so its explicit-rejection edge conflicts with the prose exception and can recreate a redundant failed escalation. `logicalKind` alone does not select the transition; initial result status is also required.
- **Proposal:** Split row 1 into `initial/needs_verification` and `initial/failed`, or add a `resultKind` column. The failed row must fold every non-accepted ACK directly to `send_unknown`, with no escalation edge.

### Low

#### L-new-1 — Currency comparison is degenerate after handoff-equality fallback

- **Coordinate:** `PANE-DEATH-DESIGN.md:813-834`; `PLAN.md:89-90`.
- **Verbatim evidence:** The fallback resolves a task only where `task.handoffId === payload.dispatchHandoffId`; immediately afterward the currency gate asks whether those same values mismatch.
- **Defect:** On the fallback-success path the mismatch branch is unreachable by construction. An old degraded `:850` result instead misses the scan and becomes an observed `task not found`, not the specified stale-attempt drop. The current `:850` strand is closed, and ordinary cardId lookup still reaches stale-drop, but the fallback-path semantics are overstated.
- **Proposal:** Specify separate outcomes: fallback equality success proceeds directly to per-dispatch seq dedup; fallback miss records `handoff_unmapped_or_stale`. Do not claim the later mismatch gate is reachable on that path.

#### L-new-2 — One stale `sendResult` range remains

- **Coordinate:** `PLAN.md:113`; code `bridge-runtime.ts:2408-2434`.
- **Verbatim evidence:** PLAN still cites “`bridge-runtime.ts:2423-2440`.”
- **Defect:** `:2423` is only the `client.handoff` call and `:2435-2440` belongs after `sendResult`; the function range is `:2408-2434`.
- **Proposal:** Replace the residual citation with `bridge-runtime.ts:2408-2434`, optionally citing the handoff call separately as `:2423-2428`.

#### L-new-3 — The retracted seq-reset benefit remains an implementation gate

- **Coordinate:** `PANE-DEATH-DESIGN.md:796-846,1548-1550`; code `card-ops.ts:112-117,190-197`.
- **Verbatim evidence:** §6.7.3 says the “브릿지 재시작 seq 리셋 유실” rationale is retracted, but §10 still requires “브릿지 재시작 seq 리셋 유실도 함께 해소.”
- **Defect:** The checklist can force implementation/testing against a mechanism the revision correctly disproved: redispatch clobbers `last_seq`, while restart-resume is out of scope.
- **Proposal:** Delete the §10 assertion and retain only stale-attempt rejection, per-dispatch dedup, and legacy scalar fallback.

### UNVERIFIED

- Tests and live probes were not run, per instruction.
- Issuer, currency fallback, quarantine journal/replay, and operator/automatic resolution are design-only at `2b5a951`; runtime behavior cannot yet be exercised.
- D1 live ACK matrix and D2 relay-ACK injection feasibility remain unverified.
- JSONL behavior under crash, torn write, SIGKILL, or power loss remains unverified.
- Code confirms scan feasibility: `findTask(taskId, roomId?)` has no handoff lookup, but `loadTaskBoard(roomId).tasks` exposes a bounded board of at most 200 tasks. Collision/duplicate-handoff handling for that new scan is not specified.

---

[PANEDEATH-R43C-DONE] verdict=pending-revision high_new=1 med_new=3 low_new=4 lanes=2 next=R43d
