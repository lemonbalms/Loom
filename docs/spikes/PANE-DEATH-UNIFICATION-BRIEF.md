# PANE-DEATH 두 노선 통합 — 조사 증거 팩 + 결정 목록

**작성:** 2026-07-21 · 아키텍트 세션(Opus 4.8) · 조사 3건 + fable-advisor 자문 1건 종합
**용도:** 통합 설계(PLAN v0.28.0) 작성의 **입력 증거 팩**. 설계 본문은 별도 문서.
**상태:** 결정 목록 D1~D10 = 아키텍트 판단(확정) · 실측 표 = 서브에이전트 조사 + **아키텍트 직접 재검증분만 "확정" 표기**

> **트랙 불변식:** 완료는 **사람이 확정**, 브릿지는 **전달·회복만**.

---

## 0. 왜 두 노선이 병존하는가 (사고가 아니다)

**오너 설계 의도(구두, 2026-07-21):**
> "설계 관점을 지금 메인과 다르게 접근한 것. 메인이 하는 건 자동 종료를 **인지**하는 건데
> 지금 구조에서는 어렵다. 그래서 브랜치에서는 그 부분을 **인정하고 사람이 개입하는 형식**으로
> 접근하고, 해답이 나오면 보강하는 걸로. 이유는 현재 **herdr에서 정보를 가져오는 게 구조적인
> 문제**가 있어서."

**→ 폐기·중복 처리 금지.** 아키텍트가 1차에 "중복 구현"으로 오판하고 브랜치 폐기를 권고했다가
오너 정정으로 철회한 이력이 있다.

**그리고 R43b가 이미 이 순서를 명시적으로 규정해 뒀다** — `docs/reviews/PANEDEATH-R43B.md` §4,
codex H-new-4 수용부 **축자**:

> v0.27.0은 **pre-C 현행 완료 경로**(자동 done·sent&&pane.close) 위에 구현된다. 락 11의 자동 close
> 금지와 §7.1-0의 done 0건은 **(C) 본체 PATCH의 수용 기준**이며, 그 PATCH가
> `pane-cleanup.test.ts:245`의 기대를 교체한다. v0.27.0의 `:245` green 요구는 **pre-C 현행 계약의
> 회귀 게이트**다. **두 수용 계약은 다른 PATCH의 것이라 동시 충족 요구가 아니다.**

**함의 3건:**
1. 병존은 R43b가 설계한 순서다 — pre-C 먼저, (C) 본체가 그 위에서 기대를 교체.
2. 브랜치가 `pane-cleanup.test.ts`를 수정한 것은 **약화가 아니라 예정된 계약 교체**다.
   (단 ⑧·⑥b 반전이 예정 범위 안인지는 별도 판정 필요 — §4 미해결 참조)
3. 통합 골격 선택(브랜치 = 상위)이 R43b 순서와 일치한다.

---

## 1. 두 노선 정의

| | `main` (pre-C) | `design/pane-death-authority-boundary` |
|---|---|---|
| 커밋 | `7ed314c` (+dist `e4f6c3c`, 유닛 정정 `9c59f29`) | `ec99b2c` (브랜치 tip `dfc1eeb`) |
| 게이트 | PLAN v0.27.0 **R43e approved** | 설계문 `PANE-DEATH-AUTHORITY-BOUNDARY.md` §11이 **R43b 승인 주장** — ⚠️ **출처 원장 미확인**(§5 참조) |
| 층 | **전달 무결성** — "결정이 전달됐는가" | **authority cut** — "결정을 어떻게 내리는가" |
| 잠근 것 | dispatch-scoped issuer 중앙화(`result-issuer.ts`) · strict ACK 3분기 · durable quarantine JSONL(`result-quarantine.ts`) · tower currency 게이트 · fire-and-forget 제거 · 순서 역전 정정 | 자동 `done` 폐지(`status:"failed"`+`reason:"needs_verification"`) · card `pane.close` 3곳 제거 · tower `applyCardResult` `"blocked"` 고정 · 사람이 별도 로컬 board mutation으로 확정 |
| `done` | 계속 발행, `pane.close`를 ACK `accepted`로 게이팅 | 발행하지 않음 |

---

## 2. 실측 표 (✅ = 아키텍트 직접 재검증 확정)

### 2.1 충돌 면적 (조사 ①)

```
✅ git merge-tree --write-tree 7ed314c ec99b2c
   CONFLICT: packages/host/src/bridge-runtime.ts   ← 코드 충돌은 이 1파일뿐
   CONFLICT: HANDOFF.md · docs/PLAN.md             ← 문서
   자동 병합: card-ops.ts · mcp-server/stdio.ts · cli/index.ts
```

- `bridge-runtime.ts` 텍스트 충돌 **16블록** · 교집합 함수 **11개 전부 경쟁, 상보 0건**
  (`type Flight` · `startBridgeRuntime` 상태 블록 · `processInboxEntry` · `runCard` ·
  `verifyInjectOrRetry` · `beginCardCompletion` · `scheduleStillRunningPoll` · `onCardHerdrEvent` ·
  `finishCard` · `sendFailedResult` · `sendResult`)
- ✅ **card 경로 `pane.close` 3곳** — main HEAD `:1305`(`runCard`/events_subscribe_failed) ·
  `:1981`(`verifyInjectOrRetry`/inject_unconfirmed) · `:2618`(`finishCard`/성공 완료).
  **브랜치엔 3곳 전부 부재** (pool `:1130` · conv `:1524`만 잔존 — 양쪽 미수정)
- ✅ **`finishCard`가 브랜치에서 삭제**되고 `proposeCardVerification`(`:2323`) /
  `finishCardFailure`(`:2330`) / `issueObservedCardResult`(`:2339`) 3함수로 대체
- **갈라지는 지점 = `done` 발행의 존재 여부.** main = "닫아도 되는 조건을 좁힌다",
  브랜치 = "닫지 않는다". 텍스트 병합으로 화해 불가 — **노선 선택 후 재구현**.

### 2.2 presence cadence (조사 ③) — 가설이 뒤집힌 지점

```
✅ grep -rn "enterPresenceUnknown" packages/
   bridge-runtime.ts:2117  function enterPresenceUnknown(...)   ← 정의
   bridge-runtime.ts:2139  void enterPresenceUnknown;           ← 미호출 봉인
✅ grep -rn "enterSendUnknown" packages/          (대조군)
   :2094 정의 · :2712 :2758 :2783 실호출 3곳
✅ grep -niE "strike|reconcile|presenceGrace|absentCount" bridge-runtime.ts → 0건
```

**→ main pre-C는 cadence를 한 줄도 구현하지 않았다.** `:2139`의 `void`가 "구조만 깔고 poll은
미구현"임을 코드가 자백한다. 구현된 것은 **`send_unknown` 축 = 전달 무결성뿐**.

**따라서 직전 핸드오프의 가설("락 8 cadence가 구조 문제에 정면으로 걸린다 → 재검토")은
방향은 맞으나 범위가 과대했다.** 통합 설계가 제거할 코드는 없다 — **재검토 대상은 락 문서**다.

락 8 cadence 7개 사용처 중 사람 확정 모델에서 **월권은 정확히 1개**:

| 사용처 | 판정 |
|---|---|
| **연속 2회 absent → terminal 합성** | **(b) 월권 — 개정 대상** (codex R43b `:233-235`가 이미 "quarantine + notify only" 제안) |
| episode 상한 12회 → `presence_unknown` 전이 | (c)→(a) 도착지가 판정이 아니라 격리+사람 호출 |
| `present` 응답 → strike·시도 리셋 | (a) 오탐 억제 |
| RPC 오류/timeout → unknown 기록 + strike 리셋 | (a) "오류를 absent로 세면 살아있는 pane을 죽인다" |
| generation 불일치 → 응답 폐기 | (a) stale 관측 차단 |
| 10분 타이머 → 재알림 | (a) R43b에서 만료 dispose 삭제 완료, 가역 행동만 잔존 |
| unknown 진입 → durable quarantine 1건 | (a) cadence가 아니라 불변식 |

**나머지 6개는 전부 오탐 억제·사람 호출 방향** — herdr를 *불신하는* 설계이지 구조 문제의
희생자가 아니다. 교훈 (30) 위반 없음(설계 §6.6이 축자로 내면화, 실제 위반 1건은 R43→R43b에서 절제).

✅ 브랜치는 cadence 대응물 **전무**(`ec99b2c`에 해당 심볼 0건) — **거부한 게 아니라 손대지 않았다.**

### 2.3 전제 vs 대체 (조사 ②) — 판정: **부분전제**

**양쪽 설계문이 독립적으로 같은 결론에 도달한다 (✅ 아키텍트 직접 인용 확인):**

- main `PANE-DEATH-DESIGN.md` §6.7:
  > **이 결함은 자동 `done`을 폐지해도 그대로 남는다.** `done` 대신 `needs_verification`을
  > 보내더라도 그것이 도착했는지 모르는 것은 똑같기 때문이다. (C) 전환은 **거짓 성공**을 없앨 뿐
  > **유실**을 없애지 않는다.

- 브랜치 `PANE-DEATH-AUTHORITY-BOUNDARY.md` A6:
  > 이 버전에는 durable outbox가 없으므로 bridge crash나 relay 단절 시 proposal이 **유실될 수 있다.**
  > 이는 정직하게 남기는 **liveness debt**이며 후속 A 이전에는 "유실·고아 해소"를 주장하지 않는다.

- 브랜치 §후속 A는 `persist-before-send outbox` · `tower의 atomic dedup + apply receipt`를
  **"별도 PLAN/R{n}에서 함께 설계한다"**고 명시 → **브랜치는 main pre-C를 미래의 자기 자신으로
  기술하고 있다.**

**⚠️ 계보 확정 (아키텍트 재실측) — 두 커밋은 형제다. 브랜치는 pre-C를 "롤백"하지 않았다:**
```
✅ merge-base(7ed314c, ec99b2c) = 3961052   ← 이 base에 result-issuer.ts 없음
✅ 7ed314c parent = 58d4a61  /  ec99b2c parent = 93f1db1   ← 어느 쪽도 상대의 후손이 아님
✅ result-issuer.ts 삭제 커밋 = 0건 (git log --diff-filter=D --all)
```
`git diff 7ed314c ec99b2c`에서 `result-issuer.ts`·`result-quarantine.ts`·`impl-0270.test.ts`가
"삭제(-834 등)"로 보이는 것은 **diff 방향 착시**다. **브랜치는 pre-C를 거부한 게 아니라 애초에
가진 적이 없다.** → D2(전달층 전면 채택)에 **노선 충돌 근거가 없다** = D2 강화.
설계 문안에 "브랜치가 pre-C를 삭제/거부했다"는 서술을 쓰지 말 것.

**브랜치가 물려받은 결함(main이 형제 커밋에서 고쳤으나 브랜치엔 미반영):**
- fire-and-forget **3곳 잔존** — 브랜치 `:2198` `void sendFailedResult` · `:2245`·`:2260`
  `void finishCardFailure`. main은 `scheduleOwnedCardResult`로 전환하고 재도입 금지를 코드 주석으로
  잠갔다(main `:2331-2333`)
- **순서 역전 잔존** — 브랜치 `disposeCardFlight`가 `flights.delete(paneId)` 즉시 수행(`:2025`).
  main은 삭제를 send 이후 `removeCardFlight`로 분리(`:2046-2049`) + CAS(`tryAcquireFlightSideEffect`)
  + `terminalPending` latch 도입. **브랜치엔 두 기제 모두 부재**
- 브랜치 issuer는 **seq를 소유하지 않고**(`flight.seq` 그대로 사용) **논리-kind 확장이 없다**
  (`issued: boolean` 단일 래치) → **(C) 이후의 재전송/에스컬레이션을 표현할 수 없다**

**브랜치의 순이득(노선 무관 — 통합 시 무조건 채택):**
- 테스트 헬퍼 `hasPaneStatusSubscription` 폴링 추가 — spawn 직후 이벤트 유실 레이스를 닫음
  (브랜치 `pane-cleanup.test.ts:141-163` · `still-running.test.ts:174-193`)
- `scripts/test-setup.ts`에 `delete process.env.LOOM_RELAY_TOKEN` / `LOOM_PROFILE` 추가 —
  dogfood 토큰이 픽스처를 오염시키는 문제를 닫음(교훈 42와 동형). **main에 없다**

### 2.4 strict ACK 관측점 (자문 + 아키텍트 재검증)

```
✅ result-quarantine.ts:30   kind: "enter" | "ack" | "auto_resolve" | "re_escalate" | "process_exit"
✅ result-quarantine.ts:294  ack(...) 메서드 정의 (:303이 kind:"ack" append — 메서드 내부)
✅ bridge-runtime.ts         quarantine.ack 호출 → 0건  ← ⚠️ 미배선
     배선된 것: enter(:2105 :2126) · supersedePresence(:2583 :2644) · autoResolve(:2743)
✅ impl-0270.test.ts:720     quarantinePath("node-ack0270") ← quarantine 관측점 실재
✅ impl-0270.test.ts         closeCallsFor 사용 :667~:790
     양성(=== closesBefore+1): :675 :679 :696 :700 :786 :790
     부정(=== closesBefore  ): :718 :744 :761
```

**M-2의 진짜 형태(아키텍트 정정 — 자문의 "①/①b뿐" 서술보다 넓다):**
브랜치 노선에서 `pane.close`가 사라지면 **부정 어서션 `=== closesBefore`가 전부 자동으로 참**이
되어 조용히 무의미해진다. 이는 **교훈 (40) "skip 블록 안 어서션 = 검증된 적 없는 어서션"의
정확한 재현**이다. 처방 = 양성 수신증 레코드(`kind:"ack"`)로 관측점 이전. `:303`에 이미 배선돼
이전.

> **⚠️ 정정 (아키텍트 재실측, 2026-07-21):** 본 절 초판은 *"`kind:"ack"`이 `:303`에 이미 배선돼
> 있으므로 신규 기제가 아니라 재사용"*이라 적었으나 **틀렸다.** `:303`은 `ack()` **메서드 내부**의
> append이지 호출된다는 증거가 아니며, `bridge-runtime.ts`의 `quarantine.ack` 호출은 **0건**이다
> (`presence_unknown`과 같은 미배선 상태). **배선은 신규다.**
>
> **추가 쟁점 — 의미 충돌:** R43b §4 "quarantine 내구 세부" 수용부는 `ack`을 **"운영자 ack도
> append-only 레코드(원본 수정 없는 fold)"** — 즉 **사람이 quarantine 항목을 해소했다는 기록**으로
> 규정한다. D4가 관측하려는 것은 **relay ACK accepted = 전달 성공**이다. 이 트랙의 불변식이
> "완료는 사람이 확정, 브릿지는 전달·회복만"이므로 **사람 확정과 전달 확인은 분리해야 하는 두
> 개념**이며, 같은 `kind`에 얹으면 그 경계가 데이터 레벨에서 무너진다.
> → **D4는 개정·기각 후보다. 별도 kind 신설 / `resultPhase` 전이 관측 / 제3안 중 설계자 판단.**
> (교훈 33 재현 — 존재의 증거를 서술의 증거로 오독한 사례)

**미배선 항목 총괄 (설계 §2가 "동작하는 것 vs 껍데기"를 구분해야 하는 이유):**
main pre-C에서 **정의만 있고 호출자가 0인 것** = `enterPresenceUnknown`(`:2117`/`:2139`) ·
`quarantine.ack`(`:294`). **실제로 배선된 전달층** = `quarantine.enter`/`supersedePresence`/
`autoResolve` + strict ACK 3분기(`classifyAck`) + issuer 중앙화 + tower currency gate.

---

## 3. 결정 목록 D1~D10 (아키텍트 판단 — 확정)

| # | 결정 | 근거 |
|---|---|---|
| **D1** | **골격 = 브랜치 authority cut** — 자동 `done` 폐지 · card `pane.close` 3곳 제거 · tower `blocked` 고정 | 오너 불변식 · R43b §4 예정 순서 · main 골격의 자동 종결점(`:2607-2622`)은 불변식과 정면 충돌 |
| **D2** | **전달층 = main pre-C 전면 채택** — `result-issuer.ts` · quarantine · strict ACK 3분기 · currency gate · fire-and-forget 제거 · dispose 순서 정정 | §2.3 — 양쪽 설계문이 독립 합의: authority cut은 유실을 없애지 않는다. 자동 done이 사라지면 유실의 **자동 복구 여지가 0**이 되므로 오히려 더 필요 |
| **D3** | 브랜치 인라인 issuer(`DispatchResultIssuer`/`claimResultIssue`) **폐기** | seq 권위 이중화 방지. main issuer가 상위집합(seq 소유 + 논리-kind Set) |
| **D4** | **strict ACK 관측점 이전** — `pane.close` 횟수 → quarantine JSONL 양성 `kind:"ack"` 레코드 | §2.4. `:303` 기존 배선 재사용 |
| **D5** | `closeCallsFor === closesBefore` **부정 어서션 전량 재기술** | 교훈 (40) — pane.close 제거로 자동 참이 됨 |
| **D6** | 브랜치 테스트 헬퍼 강화 2건 + `test-setup.ts` env 삭제 **채택** | §2.3 순이득 |
| **D7** | **락 8 개정** — "연속 2회 absent → terminal 합성"을 **"quarantine + notify only"**로 교체. 나머지 6개 사용처 존속. **코드 미구현이므로 문서만 개정** | §2.2 · codex R43b `:233-235` 기제안 |
| **D8** | `applyCardResult` **합성 수동 검증** — currency gate 통과 후에도 `blocked` 고정이 유지되는지 | **자동 병합 ≠ 의미 병합**(자문). main `card-ops.ts:137-221` 진입부 ↔ 브랜치 `:201` status 파생부 |
| **D9** | **버전 = v0.28.0 + 신규 R{n}** | 브랜치 금지선(*"strict ACK … 를 **v0.27.0에** 다시 합치지 않는다"*)과의 문안 모순 회피. 금지선은 **범위·순서 문제**이지 영구 거부가 아니다(§후속 A가 반증). 비용은 문서뿐 |
| **D10** | pane 수명 연장에 따른 **`pane_closed` 흡수 분기 재발화 확인** — main `:2359-2442`가 결과 발행 후 재발화하지 않는가 | 자문 지적 · **미확인** |

---

## 4. 미해결 / 미확인 (설계에서 닫아야 할 것)

1. **D10** — `pane_closed` 흡수 분기 재발화. 미확인.
2. **브랜치 `pane-cleanup.test.ts` ⑧·⑥b 반전이 R43b 예정 범위 안인가.**
   ⑧ = "pane.close reject → result still delivered"(close 실패가 전달을 막지 않음),
   ⑥b = "keep 모드에서도 failure-path close는 살아있다". 둘 다 close 호출 자체가 사라지면
   주입이 no-op이 된다. R43b는 `:245` 교체만 예정했다 — **이 2건은 별도 판정 필요**.
3. **conv 경로 ACK 폐기** — main 설계문 §6.7 표가 `:1300 :1319 :1777`에 동일 폐기를 기재.
   main pre-C가 conv까지 고쳤는지, 브랜치가 conv를 어떻게 뒀는지 **미대조**.
   브랜치는 conv를 명시적 범위 밖으로 뒀다(`AUTHORITY-BOUNDARY.md:200`).
4. ~~브랜치 추가 테스트 수정 243줄~~ → **실측 완료 (2026-07-21)**. 결과:
   - **진짜 약화 3건 (복원 대상)** — `impl-02311.test.ts:584-585`(⑤ supersession) ·
     `:635-636`(⑥ deferral) · **`inject-verify.test.ts:369-375`(③ exhaust — 최우선)**.
     셋 다 `closeCallsFor === 0` / `toHaveLength(0)` 형태로 반전돼 **pane.close가 사라지면
     자동으로 참**이 된다(교훈 40). ③은 `closedPaneId` **형식 검사까지 소실**.
   - **노선 무관 순이득 (전량 채택)** — `hasPaneStatusSubscription` 구독-대기 헬퍼 3파일
     (`impl-02311:342-357` · `impl-02312:252-267` · `impl-0239:296-311`) ·
     `scripts/test-setup.ts:9-18` env 오염 차단 · `bridge.test.ts:244-300` 가드 순서 고정 ·
     `:344-346` fence 과확장 방지 · `:802-906` at-most-one result 3건 ·
     `inject-verify:260-275` · `scrape-delta:527-529,548-549` ·
     `herdr-lifecycle:366-367`(close를 `toHaveLength(1)` **정확 개수**로 고정 — 채택 권장 패턴)
   - 나머지 status `"done"`→`"failed"`/`needs_verification` 전환분은 **(A) 예정된 계약 교체**.
5. **`ROLE-PERMISSION-PROFILE-UNIFICATION.md`**(브랜치 신규 554줄) — PANE-DEATH와의 결합도 미확인.
6. **`dist/` 번들** — 양쪽 독자 bump(0.27.0), 대조 안 함.
7. **문서-코드 불일치 D-1** — main 설계문 §6.7 좌표표가 `void sendFailedResult`/`void finishCard`를
   "미해소"로 기재하나 main 현 코드엔 0건. **표는 pre-C 구현 이전 스냅샷**이며 라벨 미갱신.
   *(단 이 표는 브랜치 코드 상태와 정확히 일치 — 통합 브리핑에서 "표 = 브랜치 현황"으로 재활용 가능)*

---

## 5. ⚠️ 승인 이력 보류 사항

브랜치 설계문 `PANE-DEATH-AUTHORITY-BOUNDARY.md` §11은
> "R43b는 방향을 승인하고 세 문안 잠금을 조건으로 **author-close를 허용했다**. … Advisor:
> fable-advisor consulted: yes."

라고 적으나, ✅ **이 주장의 출처 원장을 리포에서 찾지 못했다.** 실측:
- 브랜치는 `docs/reviews/`에 `PANEDEATH-R43.md`까지만 보유 — **R43b~R43e 원장 4본 부재**
- `main`의 `PANEDEATH-R43B.md`는 **"High 4건이므로 수정 반영 후 R43c 재검증 필수 —
  author-close 불가"**(`:27`)로 판정. 주어가 *main PLAN v0.27.0(pre-C)* 이라 직접 모순은 아니나,
  브랜치가 인용한 판정과 대응하지 않는다.

**→ 통합 PLAN은 R43b 원장 §4(H-new-4)를 근거로 삼고, 브랜치 §11의 author-close 주장은
"미검증"으로 표기한다. 승인 이력을 확인 없이 승계하지 않는다.**
(교훈 33 — 지적·verdict는 존재의 증거일 뿐 서술의 증거가 아니다)

---

## 6. 브랜치 워크트리 상태

✅ `/Users/kyoungsiklee/projects/fable-advisor-pane-death-authority` 미커밋 변경 —
**전부 문서, 제품 코드 무관**:
```
 M AGENTS.md · CLAUDE.md · tasks/lessons.md · tasks/lessons/orchestration.md
?? docs/ecc-memory-context-analysis.html
```
단 `tasks/lessons.md`는 main에서 `9c59f29`로 갱신·푸시됐으므로 **충돌 소지**.

---

## 7. 조사 레인 고지 (교훈 34)

조사 3건 + 자문 1건 전부 **in-harness Claude 서브에이전트**로 실행됐다. 조사 ③ 워커가 자기 신원을
먼저 고지했다(*"mandated codex 검증 레인이 아니다"*). ✅ `loom` CLI가 PATH에 없어(`command not
found`) **pane 레인이 현재 불가**한 상태다. 발견자≠수정자는 유지되므로 산출물은 채택하되,
**아키텍트가 결정적 주장 전부를 직접 재실측**했다(위 ✅ 표기).
