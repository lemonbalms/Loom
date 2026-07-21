# PANE-DEATH 통합 설계 — 두 노선의 단일 정본 (PLAN v0.28.0 입력)

| Field | Value |
|---|---|
| **Date** | 2026-07-21 |
| **Status** | **design only** — 제품 코드 변경 없음 · R{n} 게이트 필요 |
| **입력** | `PANE-DEATH-UNIFICATION-BRIEF.md`(증거 팩) · `PANE-DEATH-DESIGN.md`(main 노선) · `../fable-advisor-pane-death-authority/docs/spikes/PANE-DEATH-AUTHORITY-BOUNDARY.md`(브랜치 노선) · `docs/reviews/PANEDEATH-R43B.md` §4 |
| **Canonical** | 승인 시 이 문서가 v0.28.0 구현 판단의 유일한 설계 정본. `PANE-DEATH-DESIGN.md`의 관측·실험 기록(§1~§4·§9·OBSERVATIONS)은 역사 증거로 존속하고, 상태기계·락·체크리스트는 본 문서 §1·§6이 대체한다. `PANE-DEATH-AUTHORITY-BOUNDARY.md`의 A1~A6 의미론은 본 문서에 편입되고 그 인라인 구현(브랜치 `ec99b2c` 코드)은 폐기된다(§5) |
| **버전·게이트** | **v0.28.0 + 신규 R{n}** (§0 D9). 브랜치 §11의 "R43b author-close 허용" 주장은 출처 원장이 리포에 없어(브리프 §5) **승계하지 않는다** — 통합 PLAN의 승인 근거는 `PANEDEATH-R43B.md` §4(원장 실재)뿐이다 |
| **Wire** | card contract v1 · `done\|failed` enum · relay/conv wire · MCP 이름·입력 schema · herdr RPC 표면 **무변경**. 단 원격 result의 Tower 적용 의미는 **의도적으로 `done→blocked`로 변경**(브랜치 A2 승계) |

> **트랙 불변식 (모든 판정의 유도 원점):**
> **완료는 사람이 확정한다. 브릿지는 전달과 회복만 소유한다.**
> **비가역 행동은 결정적 증거 또는 멱등 경로에서만 허용된다.**
>
> 본 문서의 모든 절은 이 불변식에서 유도해 쓰고, 지적-목록 땜질로 쓰지 않는다(교훈 31).
> 좌표 표기: `:N`은 별도 표기 없으면 main HEAD(**`694e08c`** — 본 설계 커밋 시점. 초판이 적은
> `89dd931`은 증거 팩 커밋이었다, R44 Low 1 정정)의
> `packages/host/src/bridge-runtime.ts`. 브랜치 좌표는 `ec99b2c:<path>:N`으로 명시.
> **실측**(본 설계 작성자가 코드/커밋에서 직접 확인)과 **인용**(브리프·아키텍트 재실측 승계)을
> 구분해 표기한다.

---

## §0 판정 요약

### §0.1 골격 선택 — 브랜치 authority cut을 **의미론 골격**으로, main HEAD를 **코드 기질**로

**D1에 동의하되 한 문장을 정밀화한다: "골격 = 브랜치"는 git 기반 선택이 아니다.**

- **권한 의미론은 브랜치가 정본이다.** main의 자동 종결점은 실측으로 5곳이다 —
  `finishCard(flight, "done", …)` 호출 `:2171 :2197 :2256 :2288 :2315`(실측), 그리고 성공
  발행 뒤 `pane.close` `:2618`(실측). 이는 불변식 1문("완료는 사람이 확정")과 정면 충돌한다.
  브랜치 A1(자동 `done` 폐지)·A2(tower ingress fence)·A4(card 자동 close 3곳 제거)·A5(identity
  동결)·A6(관측 상태의 지위)은 불변식에서 그대로 유도되는 해이며, R43b §4가 이미 이 순서
  (pre-C 먼저 → (C) 본체가 기대를 교체)를 규정해 뒀다.
- **코드 기질은 main HEAD다.** 실측: merge-base `3961052`에는 `result-issuer.ts` ·
  `result-quarantine.ts` · `impl-0270.test.ts`가 **존재하지 않는다**(`git ls-tree` 0건). 두 커밋은
  형제이고, **브랜치는 pre-C 전달층을 거부한 것이 아니라 애초에 가진 적이 없다**(아키텍트
  재실측과 본 설계 재확인 일치). 따라서 "브랜치가 pre-C를 삭제/롤백했다"는 서술은 금지한다.
  main HEAD만이 issuer(`result-issuer.ts`) · durable quarantine(`result-quarantine.ts`) ·
  strict ACK 3분기(`:2670-2792`) · CAS/latch(`:419 :424`) · currency gate(`card-ops.ts:137-278`)를
  실코드로 가진다.
- **텍스트 병합은 불가능하다.** `git merge-tree` 충돌 16블록 · 교집합 함수 11개 전부 경쟁,
  상보 0건(브리프 §2.1 ✅). 따라서 **브랜치의 A1·A2·A4 의미론을 main HEAD 위에 재구현**하고,
  브랜치의 bridge-runtime 구현 텍스트는 폐기한다(취할 것/버릴 것 목록은 §5.1).

**제3안(main 골격 + authority 옵션) 기각 근거:** 자동 `done`을 config 옵션으로 남기면 락이
아니라 스위치가 된다 — 불변식이 "설정에 따라 참"이 되는 순간 §6 락 전부가 조건부가 되고,
rolling upgrade 표(브랜치 §8)의 fail-closed 보장이 성립하지 않는다. 권한 경계는 타입/경로
부재로 잠가야 한다(브랜치 §3 "Bridge 타입/API는 `status="done"`을 구성할 수 없다").

### §0.2 D1~D10 판정표

| # | 아키텍트 초안 | 판정 | 근거 (1줄) |
|---|---|---|---|
| **D1** | 골격 = 브랜치 authority cut | **동의(정밀화)** | 의미론=브랜치·기질=main HEAD·재구현(§0.1). git 병합·브랜치 코드 채택이 아님 |
| **D2** | 전달층 = main pre-C 전면 채택 | **동의(강화)** | 양 설계문 독립 합의(main §6.7 ↔ 브랜치 A6) + merge-base 실측으로 "노선 충돌" 자체가 부재 — 브랜치는 전달층을 미래의 자신(후속 A)으로 기술 |
| **D3** | 브랜치 인라인 issuer 폐기 | **동의** | 실측: 브랜치 issuer는 `issued: boolean` 단일 래치·seq 미소유(`ec99b2c:…:361-366`, `flight.seq` 사용 `:2377` 부근), main issuer는 `acquire(kind)`+seq 소유+`task_0` 키(`result-issuer.ts:8,26,46-57`) — 엄격한 상위집합 |
| **D4** | strict ACK 관측점 = quarantine `kind:"ack"` 양성 레코드 | **개정(기제 기각·방향 동의)** | `kind:"ack"` = **운영자 ack fold**(`result-quarantine.ts:294-315`, reason `operator_ack`, 기존 미해소 항목 필수 `:301`)이고 production 호출 **0곳**(실측 — 유일 호출은 `impl-0270.test.ts:217`). 사람-해소 기록과 전달-확인을 한 kind에 얹으면 불변식의 두 권한이 데이터 레벨에서 섞인다. 대체 관측점은 §4 |
| **D5** | `=== closesBefore` 부정 어서션 전량 재기술 | **동의(확장)** | 대상을 main `impl-0270` ①①b⑤(양성 close 어서션도 이전 필요)와 브랜치 ⑧·⑥b·`impl-02311` ⑤⑥·`inject-verify` ③까지 확장. 재기술 = 양성 pane-보존 + 분기별 양성 레코드(§4) |
| **D6** | 브랜치 테스트 헬퍼 + `test-setup.ts` env 삭제 채택 | **동의** | 실측(diffstat): `scripts/test-setup.ts` +10 · 구독-대기 헬퍼 3파일. 노선 무관 순이득 — §5.1 채택 목록에 편입 |
| **D7** | 락 8의 "연속 2회 absent → terminal 합성"만 개정 | **개정(범위 확대)** | 그 행만이 아니다 — issuer 단일 발행 모델에서 absent-합성 failed는 **initial 발행 예산을 소진**해 살아있는 pane의 진짜 결과를 영구 봉쇄한다(§0.3-3 · §1.3). 구 락 11의 "연속 absence = 결정적 부정 증거" 문구·구 락 3의 `terminal_uncommitted` 도착지도 함께 개정(교훈 27), §9-ter 항목 3을 본 설계가 **종결**한다 |
| **D8** | `applyCardResult` 합성 수동 검증 | **동의(본 설계에서 수행)** | 실측 완료: main은 `done→done` 잔존(`card-ops.ts:317-318`), 브랜치는 `blocked` 고정 + currency gate 부재(`ec99b2c:…card-ops.ts` — findTask miss 즉시 `{ok:false}`). 합성 사양 = §2.4 |
| **D9** | 버전 = v0.28.0 + 신규 R{n} | **동의** | 브랜치 §10 금지선("strict ACK…를 **v0.27.0에** 다시 합치지 않는다")과의 문안 모순을 버전으로 해소 — 금지선은 범위·순서 조항(§후속 A가 반증)이지 영구 거부가 아님. 양 노선 dist가 모두 0.27.0을 주장하는 충돌도 함께 해소 |
| **D10** | `pane_closed` 흡수 분기 재발화 확인 | **닫힘(코드 실측)** | 발행 중 = `flightSideEffectOwner \|\| resultPhase==="result_sending"` → latch만(`:2359-2366`); 발행 후 = `removeCardFlight`(`:2344 :2348`)로 map 삭제 → 이후 이벤트는 `onHerdrEvent` map miss로 inert. 재발화 경로 없음. 단 map miss가 **무로그**인 것은 §6.2 규칙 7 미구현 — §5 구현 항목으로 이관 |

### §0.3 아키텍트가 놓친 것 (본 설계의 추가 발견 — 전부 실측)

1. **명시적 거부(rejected) 분기가 조용한 정지다.** `sendResult`의 `rejected` 분기(`:2769-2781`)는
   **로그 한 줄 외에 아무것도 남기지 않는다** — quarantine 미진입, board 전이 없음, durable 기록
   0. 사람-확정 모델에서 이는 "알림 유실 = 카드 영구 정지"의 정확한 사례이며, 설계 자신의 결정 1
   ("비수락 결과는 **유실·명시 거절을 구분하지 않고** 단일 흡수 상태 `send_unknown`으로 보내고
   durable alert를 낸다" — `PANE-DEATH-DESIGN.md` §6.7-bis 결정 1)과 **코드가 어긋난다.**
   처방 = §2.3(비수락 단일 흡수로 통일, 취약한 메시지-정규식 분기 제거).
2. **`pane_exited`는 어디서도 처리되지 않는다.** 실측: `bridge-runtime.ts`에 `pane_exited` /
   `pane.exited` 0건(비테스트 소스 전체 grep 0건). 전역 구독도 `pane.closed`뿐(`:660`). 스파이크
   확정 사실(자연사 = `pane_exited`, API close = `pane_closed` — `PANE-DEATH-DESIGN.md` §9-1)과
   결합하면: **자연사한 pane은 양 노선 모두에서 관측되지 않는다.** "PANE-DEATH 인지"라는 트랙의
   원래 목표는 v0.28.0 이후에도 열려 있다 — §7 범위 표에 정직하게 등재하고 후속 C로 명명한다.
3. **absent-합성 failed는 issuer 발행 예산을 태운다.** local single-issue(락 U4)에서 initial은
   dispatch당 1회다. 합성 terminal이 failed를 발행하면 그 뒤 살아 돌아온 pane의 진짜 완료 후보는
   `issuer.acquire` 거부로 **영구히 발행 불가**가 된다. 따라서 presence 계열의 안전한 도착지는
   result를 **구성하지 않는** `presence_unknown`(늦은 단일 발행 출구 보존 — §6.0.2)뿐이다.
   이것이 D7 범위 확대의 유도 근거다.
4. **quarantine `process_exit` 레코드가 미해소를 지운다.** 실측: `foldQuarantineLines`가
   `process_exit`를 `ack`/`auto_resolve`와 동일하게 `open.delete`로 fold한다
   (`result-quarantine.ts:128-133`) — 정상 종료 시 `onProcessExit`(`:361-392`)가 전 미해소에
   `process_exit`를 append하므로, **재기동 replay가 미해소 카운트를 복원하지 못한다**(크래시
   경로만 복원됨). §6.7.1의 "기동 replay로 미해소 카운트 복원" 취지와 어긋난다. 카드는 여전히
   `doing`에 잔존하는데 알림만 사라진다. 처방 = §2.3(fold에서 `process_exit`를 해소가 아닌
   관측 주석으로 재분류).
5. **(소) issuer 생성 시점의 문서-코드 불일치.** 설계 §6.7.2는 "handoff **수신 시점**(파싱·spawn
   이전) 생성"을 규정하나 main 코드는 발행 시점 `issuers.getOrCreate`(`:2542` 부근 finishCard ·
   `:2634` sendFailedResult)다. 단일 프로세스 dedup으로는 기능 동등 — 문서를 코드에 맞춰 "발행
   진입 시 getOrCreate(키 안정성이 보장 조건)"로 정정한다(코드 = SSOT).
6. **(소) 미배선 껍데기 2곳.** `enterPresenceUnknown` 정의만 있고 `void` 봉인(`:2117-2139` —
   브리프 §2.2와 일치), `QuarantineStore.ack` 운영자 표면 미배선(production 호출 0). §2.5의
   배선/껍데기 표로 구현자 혼동을 차단하고, 운영자 ack 표면은 v0.28.0 범위에 넣는다(§2.3).

---

## §1 통합 상태기계

### §1.1 권한 경계 원칙

브랜치 §3 권한 표를 승계하고 전이 단위로 구체화한다. **모든 전이에는 소유 주체가 하나다.**

| 주체 | 소유 전이 | 소유하지 않는 것 |
|---|---|---|
| **브릿지** | dispatch 수락 → spawn → 관측 → 완료 후보 승격 → 제안(proposal) 구성·발행 → strict ACK 판정 → unknown 흡수·quarantine 기록·재알림 | board `done` · 최종 실패 확정 · card `pane.close` · 자동 회수 |
| **Tower(원격 result ingress)** | 원격 result의 `blocked` 격리 기록 · currency/stale drop | 원격 result 기반 `done` |
| **사람(명시적 로컬 board mutation)** | `blocked → done` 확정 · 재작업(re-dispatch) 결정 · quarantine 운영자 ack | — (v0.28.0은 사람/verifier provenance를 증명하지 않는다 — 운영 규약, 브랜치 §1 승계) |
| **Cleanup(후속 B)** | 명시 grant 뒤 pane/레코드 정리 | 완료 판정 |

### §1.2 전이도 — dispatch → 관측 → 제안 → 전달 → 사람 확정 → cleanup

```text
[브릿지 권한 ──────────────────────────────────────────────────────]
dispatch handoff 수신 (M-1 allowlist·claim 게이트 기존 유지)
  → issuer 키 확정 (cardId, dispatchHandoffId) — 실체는 발행 진입 시 registry
    getOrCreate로 물질화 (§0.3-5: 코드 = SSOT, 문서를 코드에 정렬)
  → spawn → spawned → submitted → running        (Flight = pane 관측 객체)
  → 완료 후보 승격 게이트 (락 U9: start evidence + activity fence)
  → completion_candidate
  → [CAS] flightSideEffectOwner 획득 ∧ issuer.acquire("initial")
  → result_sending — 발행물은 둘 중 하나:
      · 성공형 initial  = 제안(needs_verification):
          status="failed" + reason="needs_verification" (wire v1 무변경)
      · failed형 initial = 결정적 실패 관측:
          status="failed" + reason=<pane_closed|agent_blocked|inject_unconfirmed|…>
  → strict ACK 판정 (락 U5 — 2+1분기):
      ├─ accepted (status ∈ {queued,delivered} ∧ recipientCount=1)
      │    → result_relay_accepted   ← "전달 확인점"이지 완료가 아니다
      └─ 비수락 전부 (형상 불일치·명시 거부·transport 오류·ACK 유실)
           → send_unknown (흡수·종결) + durable quarantine enter 1건
             — 두 번째 result 금지 · 출구는 운영자 ack / relay idempotency(후속 A)

  (presence_unknown: result를 구성한 적 없는 presence 소진 경로.
   진입 배선은 후속 C — v0.28.0에서는 도달 불가 상태로 명시 유지. §7)

[tower 권한 ───────────────────────────────────────────────────────]
원격 result 수신 → applyCardResult (§2.4 가드 순서)
  → 어떤 payload status에서도 board는 `blocked`(격리)까지만    (A2)

[사람 권한 ────────────────────────────────────────────────────────]
board blocked = 검증 요청 → 사람이 워킹트리 독립 검증
  ├─ 명시적 로컬 board mutation → done          (MCP update_task · CLI board set · sticky · import)
  └─ 재작업 판단 → re-dispatch (dispatchCard가 handoffId·notes 갱신 — card-ops.ts:112-117)
  ※ 브릿지는 이 전이를 관측하지 않는다 — tower→bridge receipt 채널은 후속 B

[cleanup ──────────────────────────────────────────────────────────]
v0.28.0: card pane은 브릿지가 닫지 않는다 (자동 pane.close 0곳 — §3)
  → pane 보존 · 정리는 운영자 수동, 자동화는 후속 B의 명시 grant 뒤
```

### §1.3 흡수·종결 규칙

- **`result_relay_accepted`는 종결이다(브릿지 관점).** 이후 브릿지가 같은 dispatch에 대해 할 수
  있는 것은 없다 — 추가 발행 금지(issuer 소진), cleanup 금지(§3). Flight는 send 완료 후
  `removeCardFlight`(`:2344 :2348 :2051`)로 정리되고, 이후 그 pane의 이벤트는 inert다(D10).
- **`send_unknown`은 흡수 상태다.** 진입과 동시에 durable quarantine enter 1건
  (`result-quarantine.ts:222-254` — 레코드당 fsync `:191-196`), 10분 타이머는 **재알림만**
  (`:256-291` — dispose 없음), 해제는 운영자 ack(§2.3에서 표면 배선)뿐. 재발행은 멱등성 없이
  금지(후속 A).
- **발행 중 terminal은 latch만.** `terminalPending`(`:424`)에 기록하고 경쟁 failed를 만들지
  않는다(`:2359-2366 :2419-2429` — pane_closed·blocked 분기 실측). ACK 판정이 종결한다.
- **불확실 관측은 발행 예산을 태우지 않는다(§0.3-3).** presence 계열(연속 absent 등)은 initial
  발행이 아니라 `presence_unknown`(+quarantine+재알림)까지만 — 후속 C에서 배선될 때도 이 규칙이
  락이다(락 U8).

### §1.4 구 상태기계와의 대응 (참조 정합 — 교훈 27)

| 구 문서 규정 | 본 설계의 처리 |
|---|---|
| `PANE-DEATH-DESIGN.md` §6.1 12원소 `PaneLifecycle` | **채택하지 않음** — v0.28.0의 실상태는 main 코드의 최소 집합(`ResultSendPhase` 4원소 `:369-373` + CAS/latch 불리언)이면 충분하다. `awaiting_human_verification`은 브릿지 상태가 아니라 **board(`blocked`)와 사람의 상태**다 — 브릿지가 관측하지 않는 것을 브릿지 phase로 두지 않는다(브랜치 §5 "v0.27.0에는 통합 PaneLifecycle을 만들지 않는다" 승계) |
| 구 §6.2 규칙 5·§6.0.1 "cleanup은 사람 확정 + tower receipt 뒤" | **후속 B 조건으로 재해석** — §3 |
| 구 §6.2 규칙 6 uncommitted terminal 3분기 표 | 유지하되 도착지 이름을 본 §1.2로 갱신 — "명시적 거부" 행은 `send_unknown` 흡수에 합류(§2.3) |
| 구 §7.1-0 "done 0건" (C) 게이트 | **v0.28.0에서 live로 승격** — §5 회귀 게이트 G-1 |
| 시대 매개변수화(§6.7.2 [v0.27.0]=`done` 행) | pre-C 행은 **역사화** — v0.28.0부터 성공형 initial = `needs_verification` 단일. dormant `rejection_escalation` 행은 여전히 dormant(후속 — tower가 제안을 "거절"하는 계약 자체가 아직 없다) |

---

## §2 전달층 사양

### §2.1 원칙

**authority cut은 유실을 없애지 않는다** — 양 설계문의 독립 합의(main §6.7 "…(C) 전환은 거짓
성공을 없앨 뿐 유실을 없애지 않는다" ↔ 브랜치 A6 "proposal이 유실될 수 있다 … liveness debt").
자동 `done`이 사라진 세계에서 알림 유실은 곧 카드 영구 정지이므로, main pre-C 전달층은 그대로
**더 load-bearing해진다**(D2). 전달층의 4기둥과 그 실코드:

| 기둥 | 정본 코드 (실측) | v0.28.0 변경 |
|---|---|---|
| dispatch-scoped issuer | `result-issuer.ts` 전체 — `acquire("initial")` 원자 권위 `:46-50` · seq 소유 `:51-57` · `task_0` 열화 키 `:24-28` · registry `:61-86` | 무변경 (proposal builder가 위에 얹힘 — §2.2) |
| strict ACK | `classifyAck` `:2687-2699` · 3분기 `SendResultOutcome` `:2671-2679` · ACK 봉투 전량 소비 `:2728-2755` | ① **비수락 통일** — §2.3 ① ② **`classifyAck` 모듈 스코프 승격 + export**(현재 `startBridgeRuntime` `:566` 클로저 로컬 → 판정 로직에 양성 락을 걸 관측 가능성 확보 목적. 순수 함수 이동, 동작 무변경 — §4.3 신설 유닛 · G-11 · M3) |
| durable quarantine | `result-quarantine.ts` — enter 시점 기록+fsync `:222-254,187-216` · 태그드 키 `:24-27,72-77` · append-only fold `:96-140` · 재알림 `:256-291` · supersede `:349-359` · autoResolve(c) `:321-343` | **fold 정정 + 운영자 ack 표면** — §2.3 ②③ |
| tower currency gate | `card-ops.ts:137-278` — 스캔 폴백 `:189-254` · stale drop `:256-278` · fail-visible 카운터 3종 `:137-155` | **격리 매핑 합성** — §2.4 |

### §2.2 발행 표면 재구성 — proposal 전용 API (A1 × main issuer)

브랜치 A1의 API 축소를 main 발행 경로 위에 재구현한다.

- `finishCard(flight, status, …)`처럼 **완료 상태를 입력받는 API를 제거**하고
  `proposeCardVerification(flight, opts)`(성공형) / `finishCardFailure(flight, reason, opts)`
  (failed형)로 이원화한다 — 이름은 브랜치(`ec99b2c:…:2323,2330`)를 승계하되 **본체는 main의
  `finishCard`/`sendFailedResult`**(issuer acquire → seq 채번 → supersede → payload 각인 →
  `sendResult` 3분기 소비 — `:2540-2668`)를 재사용한다.
- 브랜치 proposal builder의 순이득 1건을 편입: 성공형 제안은 `failed` status에서도 **실제 output
  summary를 보존**한다(`ec99b2c:…:2380-2386` — `selectCardSummaryLine(stripTuiChrome(output))`).
  main의 현행 failed-summary 치환(`failed reason=…` **`:2575-2578`** — 삼항식 전체가 `const summary =`
  `:2575`에서 `.slice(0, 900)` `:2578`까지다. 초판 `:2578-2580`은 끝 2줄이 무관 영역이라 정정)을
  성공형 제안에 쓰지 않는다.
- **자동 `done` 구성 지점 5곳 제거:** `:2171 :2197 :2256 :2288 :2315`(실측). 제거 후 브릿지
  card 경로의 `status:"done"` 구성은 0곳이어야 한다(락 U1 · 브랜치 불변식 2).
- 발행 소유권 규약 무변경: Flight-backed = lifecycle CAS(`tryAcquireFlightSideEffect` `:2058-2063`)
  ∧ `issuer.acquire` · **Flight-less 3경로 = `:893`(payload_invalid) · `:1160`(agent_kind_not_allowed) ·
  `:1250`(herdr_spawn_failed)** — 셋 다 `await sendFailedResult({` 실측(main HEAD `694e08c`).
  `sendFailedResult`의 Flight 옵션 인자는 `:2627-2637`. = issuer 단독 acquire(구 락 5 R43b-2 각주 승계).
  > **좌표 정정 (R44 Medium 1):** 초판은 구 문서에서 `:850 :1114 :1204`을 승계했으나 **셋 다
  > `sendFailedResult`가 아니다**(각각 conv 라벨 비교 · pool tab `try {` · Stop hint). 구 좌표는
  > **역사 기록으로만** 두고 구현 탐색에 쓰지 마라 — 이 트랙 3연속 reject의 1차 원인이 좌표 드리프트였다.

**브랜치 인라인 issuer 폐기 절차(D3):** 브랜치 코드를 base로 쓰지 않으므로(§0.1) "제거 diff"는
발생하지 않는다. 폐기는 두 가지로 실행된다 — (i) §5 마이그레이션이 브랜치 bridge-runtime 텍스트를
채택 대상에서 제외(취사 목록 §5.1), (ii) 회귀 게이트에 "`DispatchResultIssuer`/`claimResultIssue`
식별자 리포 잔존 0건" 항목을 넣어 부분 이식을 차단한다(§5.3 G-7).

### §2.3 정정 3건 (본 설계의 코드-설계 불일치 해소)

① **비수락 ACK 단일 흡수 — rejected 분기 제거(§0.3-1).** `sendResult`의 메시지-정규식 분류
(`looksTransport`/`reject|denied|forbidden|invalid` `:2773-2778`)를 **행동 분기에서 제거**한다.
근거: (a) 결정 1 축자("유실·명시 거절을 구분하지 않고 단일 흡수 상태") 위반 상태의 해소,
(b) 정규식은 실측 없는 휴리스틱(relay 거부 봉투의 실제 형상 미실측 — §8), (c) rejected 분기는
현재 durable 기록 0으로 카드를 조용히 멈춘다. **비수락은 전부 `send_unknown` 흡수 + quarantine
enter**(reason에 `reject:`/`ack_<status>_rc<n>`/`transport:` 접두로 사유 각인 — 관측은 유지,
행동은 단일). `SendResultOutcome`에서 `rejected` variant를 제거한다.

② **quarantine `process_exit` fold 재분류(§0.3-4).** `foldQuarantineLines`에서 `process_exit`를
해소(`open.delete`)가 아니라 **관측 주석(no-op)** 으로 처리한다(`result-quarantine.ts:128-133`
정정). 이로써 정상 종료 후 재기동 replay가 미해소 카운트를 복원한다 — §6.7.1의 "기동 replay
복원" 취지 회복. `process_exit` append 자체(`:361-392`)는 유지(가시성 기록).

③ **운영자 ack 표면 배선(§0.3-6).** `QuarantineStore.ack`(`:294-315`)의 production 호출 표면을
만든다 — 최소 CLI(`loom bridge quarantine ack <cardId> <dispatchHandoffId> [--seq N|--presence]`)
+ `loom bridge status`의 미해소 카운트 표시. **주의: 이것은 "사람의 quarantine 해소" 기록이지
전달 확인이 아니다** — 관측점(§4)과 혼동 금지. 이 표면 없이는 미해소 레코드를 합법적으로 닫을
경로가 없다(현재는 ②의 정정 후 영구 잔존).

### §2.4 tower ingress 합성 사양 (A2 × currency gate — D8)

**두 노선의 합집합이 정답이고, 어느 한쪽만으로는 결함이 남는다.** 실측: main은 currency gate를
갖되 `done→done` 매핑 잔존(`card-ops.ts:317-318`), 브랜치는 `blocked` 고정을 갖되 currency
gate·스캔 폴백 부재(findTask miss 즉시 `{ok:false}` — H-new-1의 strand가 브랜치에서 재발한다).

**합성 가드 순서(정본):**

```text
schema parse                                    (card-ops.ts:175-184)
→ 태스크 해석: findTask(cardId) + miss/task_0 시 dispatchHandoffId 스캔 폴백
   (매치 1건 = 해석 · 2건+ = fail-visible drop · 0건 = handoff_unmapped_or_stale)
                                                (card-ops.ts:186-254)
→ currency stale gate: payload.dispatchHandoffId ≠ task.handoffId → drop(관측)
                                                (card-ops.ts:256-278)
→ L-2 authenticity (assignee/fromNode)          (card-ops.ts:280-299)
→ terminal-task guard (done/cancelled → no-op)  (card-ops.ts:301-304)
→ per-dispatch seq dedup (notes last_seq)       (card-ops.ts:309-315)
→ 격리 매핑 [v0.28.0 변경점]:
   done   → blocked, reason legacy_remote_done_requires_verification
   failed → blocked (기존)                       (브랜치 ec99b2c:…card-ops.ts 격리부 승계)
```

- 서술 정합 주의: 브랜치 A2는 "task lookup → authenticity → terminal → stale-seq" 순서를 축자
  규정하나, main 실코드는 currency 해석·stale drop이 L-2보다 앞이다. **합성 순서는 위 표가
  정본이다** — currency는 "태스크 해석" 단계의 일부이며, 해석된 태스크는 예외 없이 L-2를
  통과해야 하므로 authenticity 우회는 생기지 않는다(브랜치 A2의 경고 취지 보존).
- 공개 계약 갱신: MCP `apply_card_result` 설명 · `HERDR_DESIGN.md` · `DISPATCH-DEMO.md` ·
  관련 테스트의 `done→done` 기대를 `remote result→blocked`로 교체(브랜치 A2 목록 승계).
- rolling upgrade: 새 bridge→구 tower = `failed→blocked`(구 tower 기존 매핑), 구 bridge→새
  tower = `done→blocked`(fence). 양방향 fail-closed(브랜치 §8 표 승계) — 회귀 게이트 G-4.

### §2.5 배선 실태 표 — 구현자가 헛짚지 않기 위한 정본 (실측)

| 기제 | 상태 | 좌표 |
|---|---|---|
| issuer acquire/seq/registry | **배선·동작** | `result-issuer.ts` 전체 · 호출 `:2542-2548 :2634-2640` |
| strict ACK 3분기·봉투 소비 | **배선·동작** | `:2670-2792` |
| `send_unknown` 진입+quarantine enter | **배선·동작** | `enterSendUnknown :2094-2116` · 호출 `:2712 :2758 :2783` |
| presence supersede·autoResolve(c) | **배선·동작** | `:2583 :2644 :2743` |
| 재알림 타이머·process_exit append | **배선·동작** | `result-quarantine.ts:256-291,361-392` · stop 훅 `:2804-2808` |
| currency gate + 폴백 + 카운터 | **배선·동작** | `card-ops.ts:137-278` |
| ACK 주입 production seam | **배선·동작** | **정본 좌표** — 모듈 상태 `relay-client.ts:33` · setter `:40` · 주입 분기 `:359-383`(**early-return `return ack` `:382`가 wire send 우회의 핵심** — 프로덕션 경로 `await this.connect()`는 `:385`) · 등록 API `fake-herdr.ts:87 setHandoffAckInjection`. §6.7-bis 함정 3("relay 신규 주입 표면" 비용)은 이미 지불됨.<br>**좌표 정정:** 초판의 `:352-380`은 `:382` early-return을 범위 밖으로 잘라 우회 사실을 감췄다 — 구 좌표는 역사로만 두고 탐색에 쓰지 마라 |
| `enterPresenceUnknown` | **껍데기** — 정의만, `void` 봉인 | `:2117-2139` |
| `QuarantineStore.ack` 운영자 표면 | **껍데기** — production 호출 0 | `result-quarantine.ts:294-315` (§2.3 ③에서 배선) |
| bounded reconcile cadence | **전무** — 코드 0줄 | 브리프 §2.2 ✅ (`strike|reconcile|presenceGrace|absentCount` 0건) |
| `pane_exited` 구독·처리 | **전무** | §0.3-2 실측 |

---

## §3 cleanup 권한 — 두 노선이 갈라진 지점의 정밀 판정

### §3.1 판정: v0.28.0의 card `pane.close`는 **0곳**이다 (브랜치 A4 전면 승계)

제거 대상 3곳(실측, main HEAD): `:1305`(events_subscribe_failed) · `:1981`(inject_unconfirmed) ·
`:2618`(성공 발행 뒤 cleanup). 유지(무관 경로): pool-root `:1127` · conv 명시 close `:1532`.
`paneCleanup:"auto"`는 conv 명시 close만 제어하고 card worker에 무효과(브랜치 A4 문안 승계 —
config 설명·status 도움말·`pane-cleanup.test.ts` 의미 갱신 포함).

### §3.2 왜 "사람 확정 + tower receipt 뒤 자동 close"(main 락 11)가 아닌가

**두 노선은 종착지에서 대립하지 않는다 — 도달 가능성에서 갈린다.**

- main §6.0.1/구 락 11의 자동 cleanup 조건은 "사람 확정 + **tower receipt**"다. 그런데 그
  receipt를 브릿지에 전달할 **역방향 계약(tower→bridge)이 현재 존재하지 않는다** — 브랜치
  후속 B가 정확히 그 계약(attempt·proposal event·pane binding/generation에 결속된 cleanup
  grant)의 설계 자리다. 조건을 만족할 방법이 없는 자동화는 규정할수록 위험하다: 구현자가
  "확정 신호의 근사물"(예: board 폴링, 시간 경과)을 발명하게 된다 — 그 근사물이 바로 이
  트랙이 금지해온 "불확실 관측발 비가역 행동"이다.
- 따라서: **main 락 11의 cleanup 문구는 후속 B가 grant를 구현했을 때의 조건부 허용으로
  재해석**하고, v0.28.0의 규범은 "card 자동 close 0"으로 잠근다(락 U3). TTL은 이미 적격인
  레코드의 스캔 시점일 뿐 삭제 권한이 아니다(브랜치 후속 B 문안 승계).
- **운영 대가의 정직 기재:** pane이 쌓인다. v0.28.0의 완화는 (i) 사람 확정 후 **운영자 수동
  close**(허용 — 사람 권한), (ii) `loom bridge status`에 card pane 보존 수를 표시(관측만).
  자동 GC는 후속 B 전에 없다.

### §3.3 §1 전이표와의 정합 (자기 검증)

§1.2의 cleanup 블록 = "브릿지 자동 0 · 운영자 수동 · 후속 B grant" — 본 절과 동일. §1.1 권한
표의 Cleanup 행 = 후속 B — 동일. 락 U3 문안 = 동일. `terminal_expected`류의 "예상된 종료" 분류
(구 락 1·7)는 **브릿지가 close를 요청하는 일 자체가 없어졌으므로 v0.28.0에서 도달 불가** —
관련 tombstone·TTL 기제는 후속 B에서 grant와 함께 재도입한다(§7).

---

## §4 관측점 사양 — strict ACK 분기별 **양성** 어서션 (D4 개정의 본문)

### §4.1 원칙

> **명명 규약 (R44 Medium 4 · Low 3 반영 + 본 개정의 정밀화 — 문서 전역 적용).**
> **"strict ACK 3분기"는 `SendResultOutcome` 타입(`:2671-2679`)의 값 수를 가리키는 현행 코드
> 서술이다** — 그 타입이 `accepted`/`rejected`/`send_unknown` 3값을 갖는다. **판정 함수
> `classifyAck`(`:2687-2699`)는 이미 2값**(`"accepted" | "send_unknown"` — 실측)이고, 세 번째
> variant `rejected`는 분류기가 아니라 `sendResult`의 **catch 블록 상위 분기(`:2780` — 실측
> 재확인)** 에서만 구성된다. 따라서 **§2.3 ①의 실제 변경면은 분류기가 아니라 `SendResultOutcome`
> 층(variant 제거)과 그 catch 블록의 메시지-정규식 분기 제거(`:2773-2778`)다.**
> **v0.28.0 목표 상태는 "2+1"이다** — 행동 분기는
> **accepted vs 비수락 2갈래**이고, `rejected`는 **타입 층에서는 제거된다**(§2.3 ①: `SendResultOutcome`
> 에서 `rejected` variant 제거 — 축자). 살아남는 것은 **variant가 아니라 사유 문자열**이다: 명시 거절은
> quarantine `reason`의 **`reject:` 접두**로만 각인되고 **행동은 `send_unknown` 흡수와 동일**하다
> (§2.3 ①·락 U5). *(R45 Low 1 — 초판이 이 자리를 "`rejected`는 삭제되지 않되"로 적어 §2.3 ①의
> "variant를 제거한다"와 문면이 어긋났다. **§4.1 명명 규약이 SSOT**이며, 두 절의 실제 판정은
> 처음부터 동일했다 — 제거되는 것은 타입 variant, 남는 것은 reason 접두.)*
> 따라서 "3분기를 구별한다"는 표현은 **관측 목표가 아니다** — 관측이 구별해야
> 하는 것은 **accepted인가 아닌가** 2갈래뿐이고, 비수락 내부의 사유 구분은 quarantine `reason`
> 문자열의 몫이다. 이하 본문에서 "3분기"가 나오면 현행 코드, "2+1"이면 목표 상태를 가리킨다.

- **부정 어서션 단독 금지**(교훈 40): `pane.close` 제거 후 `closeCallsFor === closesBefore`는
  전 suite에서 자동 참이다. 각 분기는 "일어나야 할 일"의 양성 증거로 잠그고, 부정 어서션은
  보조로만 둔다.
- **quarantine JSONL에 성공 수신증을 쓰지 않는다.** quarantine은 **예외(unknown) 원장**이다 —
  매체 선정 근거 자체가 "의심 채널에 의존하지 않는 crash-durable **경보** 매체"(§6.7.1)다. 성공
  경로 레코드를 섞으면 (a) 원장 의미가 전달 저널로 바뀌고(그것은 후속 A outbox/apply receipt의
  자리), (b) 사람-해소(`ack`)와 전달-확인이 데이터 레벨에서 섞이며(불변식의 두 권한 경계 붕괴),
  (c) 성공 핫패스에 카드당 fsync가 추가된다. **신규 `kind:"relay_accepted"` 신설안도 같은
  이유로 기각한다.**
- **채택: 분기별 관측점은 이미 존재하는 양성 사실에 둔다** — accepted는 relay/tower 측 수신
  사실(전달의 정의 그 자체), 비수락은 quarantine enter 레코드(예외 원장의 본래 용도), pane 보존
  계약은 pane 목록의 양성 조회.

### §4.2 분기별 관측점 표 (정본)

| 분기 | 제품 측 기계 사실 (실측 좌표) | 테스트 양성 어서션 (필수) | 보조(부정 허용) |
|---|---|---|---|
| **accepted (a) 주입 seam 경로** — **오분류 부재 + 보존 계약 확인(음성 대조군)**. accepted 판정 로직 자체는 아래 `classifyAck` 유닛 행이 잠근다 | 테스트가 등록하는 ACK 주입기 `__ackInjector`(`relay-client.ts:33,40,359-383` — 호출 횟수는 **테스트 측 클로저**에서 계측 가능, 프로덕션 무변경) · pane 목록(`fake.listPaneIds()` — `fake-herdr.ts:863`). ⚠️ **`flight.resultPhase`/`relayAcceptedAt`은 관측 불가** — `type Flight`(`:375`)은 미export이고 `flights` 맵은 `startBridgeRuntime` 클로저 로컬이다. 락 U3가 그 `pane.close`를 제거하면 주입 경로에 accepted 양성 관측물이 **0**이 된다. ⚠️ **두 좌표의 역할 구분(R45 Low 2 — 초판이 혼용)**: **`:2610` = 게이트 판정** — `const sent = outcome.branch === "accepted"`(accepted 여부를 boolean으로 굳히는 자리, 제거 대상 아님) · **`:2618` = 게이트가 통과시킨 유일한 부수효과의 실행** — `await herdr.request("pane.close", { pane_id: flight.paneId })`(**U3의 제거 대상**, §5.1 A4 행의 `:2618`과 동일 좌표). 즉 accepted를 **관측 가능하게 만들던 것은 `:2610`의 판정이 아니라 `:2618`의 실행**이었고, U3가 지우는 것도 `:2618`뿐이다 — `:2610`의 판정 자체는 남되 **관측 불가**가 된다(`sent`는 로컬 변수이고 `outcome`은 외부로 새지 않는다) | ① **주입기 호출 정확 1건**(테스트 측 클로저 계측 — 발행이 1회임의 양성 증거. `toHaveLength`/정확 개수 규약 = 락 U7) ② **pane 보존 양성**: `fake.listPaneIds()`에 paneId 잔존 | ③ 이 cardId로 `kind:"enter"` 레코드 **0건** — 파일 fold 경유(`result-quarantine.ts`의 `quarantinePath()` `:67` → 파일 읽기 → `foldQuarantineLines()` `:96`, 또는 테스트 소유 store의 `load()` `:156`). **브릿지 내부 store 인스턴스의 `unresolvedCount()`는 테스트에서 직접 호출 불가**(클로저 로컬) |
| **ACK 판정 로직(순수 유닛)** [신설] — accepted 판정의 **양성 락**이 서는 진짜 자리 | `classifyAck`(`:2687-2699`) — 인자만 쓰는 **완전 순수 함수**, 반환 타입 이미 `"accepted" \| "send_unknown"` **2값**(코드가 이미 2+1) | 직접 어서션 4건: `queued/1` → `accepted` · `delivered/1` → `accepted` · `peer_unknown/0` → `send_unknown` · `delivered/2` → `send_unknown` | — |
| **accepted (b) 실 relay 경로** — 실제 wire 전송으로 **도달**을 검증 | relay가 payload 저장 | ① relay/tower가 `(cardId, dispatchHandoffId, seq≥1)` 각인 payload를 **정확 1건** 수신(`awaitCardResult` — `impl-0270.test.ts:768-794` ⑤의 기존 방식. ⚠️ **헬퍼 註**: `pane-cleanup.test.ts:92-109`의 `awaitCardResult`는 **첫 매치를 반환할 뿐 개수를 세지 않는다** — "정확 1건"을 쓰려면 필터 결과의 length를 반환하는 **헬퍼 변형이 선행 필요**하다. M4 구현 항목) ② payload가 `status="failed"`+`reason="needs_verification"`+실제 output summary 보존 ③ tower 적용 시 board `blocked` + notes `last_seq=N` ④ pane 보존 양성 | quarantine 미해소 증가 0 |
| **비수락(send_unknown)** | `resultPhase="send_unknown"`(`:2102`) + quarantine enter 1건(`:2105`) + 재알림 타이머 | ① quarantine JSONL에 `kind:"enter"`·`state:"send_unknown"`·해당 cardId 레코드 존재(`impl-0270.test.ts:707-732` ② 기존 방식 — ②b·③에도 동일 추가) ② **test-owned store 기준 미해소 ≥ 1** — 파일 fold 경유(`quarantinePath()` `result-quarantine.ts:67` → `foldQuarantineLines()` `:96`, 또는 테스트가 별도 `new QuarantineStore(...)`(`:142`) 후 `load()`(`:156`)한 뒤 `unresolvedCount()`(`:179`)). **브릿지 자신의 store 인스턴스는 `startBridgeRuntime`(`:566`) 클로저 로컬이라 테스트가 직접 호출할 수 없다** — (a) 행과 동형의 함정 ③ reason에 주입 사유 각인(`ack_…`/`transport:`/`reject:`) ④ pane 보존 양성 | relay 수신 payload ≤ 1(중복 발행 없음) |
| **presence_unknown** [후속 C] | 진입 배선 없음 — 도달 불가(§2.5) | v0.28.0 테스트 대상 아님 — **suite에 "도달 불가" 명시 주석**(교훈 40의 역형: 존재하지 않는 경로를 스킵 블록으로 위장하지 않는다) | — |
| **경쟁 패자(at-most-one)** | `issuer.acquire` 거부(`result-issuer.ts:46-50`) · latch(`:2361-2366`) | relay 수신 result **정확 1건**(`toHaveLength(1)` — 정확 개수, ≥/≤ 금지. 선례 패턴 = **`packages/relay/src/hetero.handoff.test.ts:70`** — `room.listInbox("p_codex")`에 `toHaveLength(1)` + `inbox[0]!.handoff…` 대조. **좌표 정정**: 초판이 적은 `herdr-lifecycle.test.ts:169`는 **구독 스냅샷 필터 개수**(`snap.filter(s => s.type === "pane.closed")`)이지 relay 수신 result 개수가 아니다 — 유형 불일치) | — |
| **A4 보존 계약** | card close 호출 경로 부재 | 분기 무관 공통: 결과 종결 후 `fake.listPaneIds()`에 paneId 잔존 + (선택) `bridge status`의 보존 pane 카운트 | fake 전역 close 호출 수 불변 |

> **⚠️ 주입 seam ≠ wire 도달 (R44 Medium 2 반영 — 락 U7 부속).**
> ACK 주입 경로는 **wire send를 하지 않고 early-return**한다 — `impl-0270.test.ts:669-671` 축자:
> *"Injection early-returns without wire send — assert termination branch only (tower inbox reach is
> covered by `pane-cleanup.test.ts` real-relay path)."*
> 따라서 **주입 seam 테스트에 relay 수신 payload 어서션을 요구하면 영구 red**다. accepted 행을
> (a)/(b)로 분리한 이유가 이것이다 — **(a)는 오분류 부재·보존 계약(음성 대조군), (b)는 도달.**
> 한 테스트에 둘을 동시 요구하지 마라. (초판은 (a)를 "판정 로직"이라 불렀으나 그 자리는 신설
> `classifyAck` 순수 유닛 행으로 옮겼다 — 아래 註.)
> **이는 재발이다:** v0.27.0 구현 검증에서 아키텍트가 발견한 유닛 결함 ⓑ가 정확히
> "①·①b가 주입 ACK(전송 우회)와 tower 도달을 동시 요구"였고, 그때 종결 분기 단언으로
> 재작성하며 위 주석을 남겼다. 설계 층에서 같은 요구가 되살아났다 — **심을 relay로 옮기는 안은
> 그때 이미 기각됐다**(ACK 위조 심을 신뢰 경계 안에 두는 자기모순).

> **註 — accepted (a) 재설계 근거와 기각된 대안 (R44 UNVERIFIED ⑥ 종결).**
> 초판 (a) 행은 `flight.resultPhase="result_relay_accepted"`/`relayAcceptedAt`을 "제품 측 기계
> 사실"로 적었으나, **락 U3(A4) 적용 후 이 둘은 어떤 테스트에서도 관측되지 않는다** — `type Flight`
> 미export(`:375`) · `flights` 맵은 `startBridgeRuntime` 클로저 로컬 · 외부 참조는
> `impl-0270.test.ts:811`의 **소스 문자열 락 1건뿐**(런타임 관측 아님) · accepted 판정(`:2610`)이
> 게이트하던 **유일한 양성 부수효과가 `:2618`의 `herdr.request("pane.close", …)`** 인데 U3가 그것을
> 제거한다(좌표 역할 구분은 위 (a) 행의 ⚠️ 註 — R45 Low 2). accepted 분기의
> `quarantine.autoResolve`(`:2743`)도 선행 open 엔트리가 없으면 **파일에 아무것도 쓰지 않는다**.
> 따라서 (a)는 **판정 로직의 양성 락이 될 수 없고**, 그 자리는 신설 `classifyAck` 유닛 행이 갖는다.
> (a)는 "오분류가 일어나지 않았음 + 보존 계약"의 **음성 대조군**으로 재명명한다.
> **기각: 안 1(관측 카운터 신설).** accepted 관측용 카운터를 제품 코드에 새로 두는 안은 §5.1이
> `recordResultDeliveryUnconfirmed`(`:540` — production 호출자 0)를 "휘발 카운터"로 **폐기한 것과
> 같은 종**이라 설계 자기모순이다. 재론 금지.
> **락 U7 정합:** (a)는 "pane 보존 양성 + 주입기 호출 정확 1건 양성"의 양성 2건을 갖고 quarantine
> 부재는 보조 열로만 두므로, U7의 "부정 어서션 단독 금지"를 위반하지 않는다 — **U7 문안 개정 불요.**

### §4.3 재기술 대상 명세 (D5 확장 — §5의 입력)

| 파일:테스트 | 현재 어서션 | 재기술 |
|---|---|---|
| `impl-0270.test.ts` ①(:662-684) ①b(:686-705) | 양성이지만 **관측물이 close 횟수**(`closesBefore+1` — `:679`/`:700`) | **accepted (a) 주입 seam 행(음성 대조군)** 으로 이전 — 어서션 = ① **주입기 호출 정확 1건**(테스트 클로저 계측) ② **pane 보존 양성**(`fake.listPaneIds()`에 paneId 잔존) ③ 보조: 이 cardId의 `kind:"enter"` 레코드 0건(파일 fold 경유). **`flight.resultPhase`/`relayAcceptedAt`를 어서션하지 마라 — 관측 불가**(§4.2 註). **relay 수신 payload도 요구하지 마라**(주입은 wire send를 우회한다 — §4.2 ⚠️ 註). close 관측 폐기. accepted **판정 로직**은 이 두 테스트가 아니라 아래 신설 유닛이 잠근다 |
| **신설** — `classifyAck` 순수 유닛 | (없음 — 판정 로직의 양성 락 부재. 이것이 R44 UNVERIFIED ⑥의 근인) | **ACK 판정 로직 행 신설**: `queued/1`·`delivered/1` → `accepted`, `peer_unknown/0`·`delivered/2` → `send_unknown` 직접 어서션. **구현 전제**: `classifyAck`(`:2687-2699`)는 현재 `startBridgeRuntime`(`:566`) **클로저 내부 함수**이므로 **모듈 스코프 승격 + export가 선행**돼야 한다 — 인자만 쓰는 완전 순수 함수이고 외부 캡처 0(실측)이므로 이동 자체는 무해. **소속 = M3(production) 확정** — production 리팩터는 테스트가 요구해 발생하더라도 M3 소속이고 M4는 tests-only다(§5.2) |
| **신설** — 실 relay accepted 도달 | (없음 — 현재 accepted 도달은 close 횟수로만 간접 관측) | **accepted (b) 행 신설**: `pane-cleanup.test.ts`의 real-relay 경로에 payload 정확 1건 + 각인 + board `blocked` 양성. (b)가 없으면 "전달됐는가"가 **어떤 테스트로도 관측되지 않는다** |
| `impl-0270.test.ts` ②(:718) ②b(:744) ③(:761) | 부정 close + (②만) quarantine 양성 | 비수락 행 ①~④ — ②b·③에 quarantine 양성 추가 |
| `impl-0270.test.ts` ⑤(:785-790) | payload 각인 양성 + close 1회 | payload 각인 유지 + pane 보존 양성으로 교체 |
| 브랜치 ⑧(`ec99b2c:…pane-cleanup.test.ts:400-425`) ⑥b(:671-724) | payload 양성 + 부정 close (close-fail 주입은 no-op화) | 판정: **A4 명시 범위의 계약 교체 — 예정 범위 안**(브리프 §4-2 종결). 단 no-op 주입 제거 + pane 보존 양성 추가 |
| `impl-02311.test.ts` ⑤(:584-585) ⑥(:635-636) · `inject-verify.test.ts` ③(:369-375) | (아키텍트 실측 인용) 브랜치에서 `toBe(0)`/`toHaveLength(0)` 반전 — **진짜 약화 3건** | 감지력 복원: result 정확 1건 양성 + pane 보존 양성. inject-verify ③의 "누군가 정확히 1회 정리한다" 책임은 v0.28.0에서 **"아무도 정리하지 않는다(보존)"로 계약이 바뀌므로**, 어서션은 "result 정확 1건 + pane 잔존 + 회수 책임 주석(후속 B·운영자)"으로 재기술 |

---

## §5 마이그레이션 순서

### §5.1 취사 목록

**main HEAD에서 유지(전량):** `result-issuer.ts` · `result-quarantine.ts`(§2.3 ② 정정 포함) ·
strict ACK 3분기(§2.3 ① 정정 포함) · CAS/latch/removeCardFlight 순서 정정(`:2044-2076`) ·
`scheduleOwnedCardResult`(`:2335-2350` — fire-and-forget 재도입 금지 주석 포함) · currency
gate(`card-ops.ts:137-278`) · ACK 주입 seam(`relay-client.ts:33,40,359-383` — 정본 좌표는 §2.5) · `impl-0270.test.ts`
(§4.3 재기술 후).

**브랜치에서 채택(재구현·이식):**

| 항목 | 출처 | 방식 |
|---|---|---|
| A1 proposal 전용 API + output summary 보존 builder | `ec99b2c:…bridge-runtime.ts:2295-2420` | main 발행 경로 위 재구현(§2.2) |
| A2 tower fence(`blocked` 고정) | `ec99b2c:…card-ops.ts` 격리부 | main currency gate와 합성(§2.4) |
| A4 card close 3곳 제거 + config 의미 | 브랜치 설계문 §4 A4 | main `:1305 :1981 :2618` 제거 |
| A2 가드-순서 고정 테스트 · 로컬 done 가드 · at-most-one 3건 | `ec99b2c:…bridge.test.ts:244-300,344-346,802-906` (아키텍트 실측 인용) | 테스트 이식 |
| 구독-대기 헬퍼 `hasPaneStatusSubscription` | `ec99b2c:…pane-cleanup.test.ts:141-163` · `ec99b2c:…still-running.test.ts:174-193` · `ec99b2c:…impl-02311.test.ts:342-357` · `ec99b2c:…impl-02312.test.ts:252-267` · `ec99b2c:…impl-0239.test.ts:296-311` | 이식 |
| `test-setup.ts` env 오염 차단 | `ec99b2c:scripts/test-setup.ts:9-18` (diffstat +10 실측) | 이식 |
| reinject CR 관측 확장 · 픽스처 시딩 레이스 제거 · close 정확-개수 패턴 | `ec99b2c:…inject-verify.test.ts:260-275` · `ec99b2c:…scrape-delta.test.ts:527-529,548-549` · `ec99b2c:…herdr-lifecycle.test.ts:366-367` (인용) | 이식 |

> **⚠️ 좌표 트리 규약 (R45 Low 1 반영 — 접두 누락이 실제 오독을 유발했다).**
> **본 표(“브랜치에서 채택”)의 출처 열 좌표는 예외 없이 `ec99b2c:` 트리 기준이다.**
> 초판은 일부 셀에만 `ec99b2c:` 접두를 달아, R45 검증자가 접두 없는 셀
> (`inject-verify:260-275` · `scrape-delta:527-529,548-549` · `herdr-lifecycle:366-367`)을
> **main HEAD 트리로 대조해 “좌표가 패턴을 가리키지 않는다”는 Medium을 잘못 냈다**(기각 — R45 §3).
> 실측: `git show ec99b2c:packages/host/src/herdr-lifecycle.test.ts` 의 `:366-367`은 축자로
> `const closeCalls = fake.calls.filter((c) => c.method === "pane.close");` / `expect(closeCalls).toHaveLength(1);`
> = **close 정확-개수 패턴 그 자체**이며, 같은 좌표의 main HEAD는 `events_subscribe_failed`
> summary 어서션 + status fetch 주석이다. **좌표를 읽을 때 어느 트리인지를 먼저 고정하라** —
> 그것이 판정을 뒤집는다. `방식` 열의 좌표(예: A4 행 `:1305 :1981 :2618`)는 반대로 **main HEAD 기준**이다.

**브랜치에서 폐기:** 인라인 `DispatchResultIssuer`/`claimResultIssue`(`ec99b2c:…:361-366,605-618`)
· `disposeCardFlight` 즉시 `flights.delete`(`:2023-2026` — 순서 역전 회귀) · fire-and-forget 3곳
(`:2198 :2245 :2260` 실측) · `recordResultDeliveryUnconfirmed` 사용(`issueObservedCardResult` 말미
— §6.7.1이 재사용 금지한 휘발 카운터) · boolean `sendResult`.

### §5.2 커밋 순서 (red-test 선행 규율 — 브랜치 §8 승계)

```text
M0  본 설계 R{n} 승인 → PLAN v0.28.0 작성(pending-review) → 승인
M1  tests-only expected-red 커밋:
     · 브릿지 done 구성 0곳 (§7.1-0 게이트 — 현행 red)
     · tower done→blocked fence (bridge.test 이식분 — 현행 red)
     · card close 3경로 pane 보존 (§4.2 A4 양성 — 현행 red)
     · at-most-one 3건 · 가드 순서 고정 (이식 — green 확인용)
M2  tower A2 합성 (card-ops 격리 매핑 + 공개 계약 문서) — 구 bridge→새 tower 안전 먼저
M3  bridge A1+A4 (proposal API 재구성 · done 5곳 제거 · close 3곳 제거 ·
     §2.3 ①비수락 통일 ②fold 정정 ③ack 표면)
     · flight map miss inert 경로에 구조 로그/카운터 추가 (D10 이관분 — 구 §6.2 규칙 7, G-10)
     · `classifyAck`(`:2687-2699`) 모듈 스코프 승격 + export
       (`startBridgeRuntime` 클로저에서 순수 함수 이동 — 외부 캡처 0, 동작 무변경.
        §4.3 신설 유닛·G-11의 선행 조건이나 production 변경이므로 M4가 아닌 M3)
M4  테스트 재기술 (§4.3 표 전량) + 브랜치 테스트 순이득 이식
M5  dist 재번들 + 버전 0.28.0 + config/status/docs 문안
```

각 단계 production diff는 선행 red-test 커밋 해시를 증거로 남긴다(테스트·production 동일 커밋
혼합 금지 — 브랜치 §8 축자 승계).

### §5.3 회귀 게이트

| # | 게이트 | 판정 |
|---|---|---|
| G-1 | 브릿지 card 경로 `status:"done"` 구성 0곳 (소스 어서션 + 전수 경로 유닛) | 락 U1 |
| G-2 | fresh 원격 `done`/`failed` → board `blocked` · 명시적 로컬 mutation `done` 정상 · authenticity/terminal/stale 순서 보존 | 락 U2 |
| G-3 | card close 3경로 pane 보존 양성 · conv 명시 close/pool-root 불변 | 락 U3 |
| G-4 | rolling-upgrade fixture 양방향 `blocked` 수렴 | §2.4 |
| G-5 | 비수락 ACK 전형(peer_unknown/0 · delivered/2 · transport throw · 명시 거부 주입) 전부 quarantine enter 1건 + result 재발행 0 | 락 U5·U6 |
| G-6 | quarantine 재기동 replay가 정상-종료 이력 후에도 미해소 복원 (§2.3 ② 정정 게이트) · 운영자 ack fold 동작 | 락 U6 |
| G-7 | `DispatchResultIssuer`·`claimResultIssue`·`commit_unknown` 식별자 리포 잔존 0건 | §2.2 |
| G-8 | 기존 M-1 · L-2 · 0.23.4 · 0.23.7 · CONV_SPEC 회귀 green · 전체 `bun test` green | 기존 계약 |
| G-9 | at-most-one: 경쟁 3형(완료↔terminal · claimed 경로 · spawn 실패) relay 수신 정확 1건 | 락 U4 |
| G-10 | flight map miss inert 처리의 구조 로그: 발행 후 `removeCardFlight`로 map에서 사라진 pane의 herdr 이벤트가 `onHerdrEvent`에서 inert 처리될 때 structured log/counter 1건 (조용한 return 0건 — 소스 어서션 + 이벤트 주입 유닛) | §0.2 D10 · 구 §6.2 규칙 7 |
| G-11 | `classifyAck` 순수 유닛 4케이스 직접 어서션 통과: `queued/1` → `accepted` · `delivered/1` → `accepted` · `peer_unknown/0` → `send_unknown` · `delivered/2` → `send_unknown` (모듈 스코프 export 후 직접 호출 — G-5의 비수락 quarantine 레코드로는 덮이지 않는 **accepted의 양성 락**) | 락 U5·U7 |

---

## §6 락 목록 (구현자 이탈 금지 경계)

각 락 = 문안 + 근거. 구 문서 락과의 대응은 괄호 표기.

1. **U1 — 브릿지는 `done`을 구성하지 않는다** *(구 락 11 전반부 · 브랜치 불변식 1·2)*
   > card 경로 어디에서도 `status:"done"` result를 구성하지 않는다. 완료 후보의 발행물은
   > `failed`+`needs_verification` 제안뿐이고, 결정적 실패 관측은 `failed`+구체 reason이다.
   > board `done`은 명시적 로컬 board mutation으로만 생긴다(사람/verifier provenance는 v0.28.0
   > 운영 규약 — provenance 강제는 후속).
   *근거:* 불변식 1문 직접 유도. 제거 대상 실측 5곳(`:2171 :2197 :2256 :2288 :2315`).

2. **U2 — tower 원격 result ingress는 `done`을 만들지 않는다** *(브랜치 A2)*
   > `applyCardResult`의 원격 경로는 legacy `done` payload도 `blocked`
   > (`legacy_remote_done_requires_verification`)로 격리한다. 가드 순서는 §2.4 표가 정본 —
   > 태스크 해석(폴백 포함)과 currency drop은 L-2 앞이되, 해석된 태스크는 예외 없이 L-2를
   > 통과한다. 모든 drop은 fail-visible(카운터+구조 로그 — `card-ops.ts:137-155` 기존 배선).
   *근거:* 완료 권위의 유일 경로를 사람의 명시 mutation으로 좁히는 것이 authority cut의 정의.

3. **U3 — card 자동 `pane.close` 0곳** *(브랜치 A4 · 구 락 11 후반부의 후속 B 조건화)*
   > status·scrape·hook·terminal·timeout·relay ACK 어느 것도 card pane을 닫을 권한이 없다.
   > `:1305 :1981 :2618` 제거. pane은 보존되고 정리는 운영자 수동이다. 자동 cleanup 재도입은
   > 후속 B의 명시 grant(attempt·proposal·generation 결속) + 사람 확정 뒤에만 — grant 계약
   > 없이 "확정의 근사물"(board 폴링·시간 경과)로 close를 유발하는 구현을 금지한다(§3.2).
   *근거:* receipt 역방향 계약 부재 — 조건을 만족할 수 없는 자동화는 근사물 발명을 유도한다.

4. **U4 — 발행 권위 = issuer, dispatch당 원격 result 최대 1건** *(구 락 5 + R43b-2 각주)*
   > 모든 card result는 `issuer.acquire("initial")`을 유일 통과점으로 한다. Flight-backed 완료는
   > lifecycle CAS(`flightSideEffectOwner`) **와** issuer acquire를 모두 통과하고, Flight-less
   > 실패는 issuer 단독. seq는 issuer 소유(구성 시 +1 · 재전송 재사용), `cardSeq`는 attempt축
   > 소비만 유지(삭제 금지 — live-measured 회귀). 발행 중 terminal은 `terminalPending` latch만.
   *근거:* R43 H4·H5 계보 — main 실코드로 이미 잠김(`result-issuer.ts` · `:2361-2366`).

5. **U5 — strict ACK 소비 의무 + 비수락 단일 흡수** *(구 락 5 ACK부 + 결정 1 정합화)*
   > ACK 봉투를 boolean으로 뭉개지 않는다. accepted = `status ∈ {queued,delivered}` ∧
   > `recipientCount=1`뿐이며 이는 **relay-accept 확인**이지 완료·tower 적용 증거가 아니다
   > (구 락 9 보장 경계 승계). **비수락은 사유 불문 전부 `send_unknown` 흡수 + durable
   > quarantine enter 1건**이다 — 메시지 문자열 정규식을 행동 분기 근거로 쓰지 않는다(§2.3 ①).
   > 두 번째 result·재발행은 멱등성(후속 A) 없이 금지. wire exactly-once를 주장하지 않는다.
   *근거:* 결정 1 축자 + rejected 분기의 조용한 정지 실측(§0.3-1).

6. **U6 — quarantine JSONL = 예외 원장, 성공 수신증 기록 금지** *(구 §6.7.1 + §0.3-4 정정)*
   > 진입 시점 기록 · 레코드당 fsync · 태그드 키 · append-only fold · 재알림만(만료 dispose 0) ·
   > 메타데이터만(본문 금지). **성공 경로의 수신증을 이 파일에 쓰지 않는다** — `kind:"ack"`은
   > 운영자 해소 전용이고, `process_exit`는 해소로 fold하지 않는다(재기동 replay가 미해소를
   > 복원해야 한다 — §2.3 ②). 운영자 ack 표면은 §2.3 ③으로 배선한다.
   *근거:* 사람-해소와 전달-확인의 권한 분리(불변식) + fold 실측(`result-quarantine.ts:128-133`).

7. **U7 — 관측점은 양성으로 잠근다** *(신설 — 교훈 40)*
   > §4.2 표의 분기별 양성 어서션이 정본이다. `closeCallsFor === before`류 부정 어서션은 단독
   > 사용 금지(보조만). 도달 불가 경로(presence_unknown 등)는 스킵/부정으로 위장하지 않고
   > "도달 불가"를 명시한다. 개수 어서션은 정확 개수(`toHaveLength(1)`)로 쓴다.
   *근거:* close 제거로 부정 어서션 전량이 자동 참이 되는 실측(§4.3) — 교훈 40의 재현 차단.

8. **U8 — 불확실 관측은 발행 예산을 태우지 않는다** *(구 락 8 개정 + 구 락 11 문구 삭제 — D7 확대)*
   > presence 계열 관측(연속 absent 포함)은 terminal 합성·failed 발행·board 전이를 유발하지
   > 않는다 — 허용 도착지는 `presence_unknown`(+durable quarantine+재알림)까지다. 구 락 11의
   > "동일 generation 결속 연속 absence = 결정적 부정 증거" 명명은 **철회**한다(증거 등급 C±와의
   > 긴장 — §9-ter 항목 3을 본 설계가 종결). cadence 수치(구 락 8 표)는 후속 C 배선 시의 운영
   > 파라미터이며 가역 행동(알림·재평가·poll 가속)만 유발한다. `present`는 strike·episode
   > 카운터를 모두 리셋한다.
   *근거:* issuer 예산 소진의 비가역성(§0.3-3) + cadence 미구현 실측(문서만 개정 — 브리프 §2.2).
   나머지 6개 사용처(episode 상한·present 리셋·RPC 오류 처리·generation 대조·재알림·진입 기록)는
   오탐 억제·사람 호출 방향이므로 존속.

9. **U9 — start evidence + activity fence** *(구 락 10 무변경 승계)*
   > `status=done` 단독은 완료 후보 승격에 불충분 — `sawWorking` 또는 R 승인 동등 증거 필수,
   > agentKind별 live indicator 잔존 시 유예, prompt echo 전체 검색 금지. 게이트 실패의 결과는
   > 이제 board 오염이 아니라 불필요한 검증 요청으로 사람의 예산을 소모하는 것 — 취지·구현
   > 요구 전부 유지.
   *근거:* 최초 실증 결함 213(가짜 done)의 유일 방어선. authority cut이 이 게이트를 대체하지
   않는다(§4.3의 "still-running과 사망 인지는 대체 관계가 아니다" 승계).

10. **U10 — wire·identity 동결** *(브랜치 A5 · 구 §6.5)*
    > card contract v1 · `done|failed` enum · `cardSeq` 소비자 · relay/conv wire · MCP 이름·입력
    > schema · herdr RPC 표면 무변경. `(cardId, dispatchHandoffId, seq)` payload 각인은 유지
    > (tower inbox 영속 — 사후 정정 불가). 단 `apply_card_result`의 적용 의미 변경(U2)은 공개
    > 계약 문서에 명시한다.
    *근거:* seq 변경·tower dedup 변경 분리 시 조용한 유실(브랜치 A5) — 기결정 승계.

11. **U11 — 과장 금지** *(브랜치 A6·§8-5 승계)*
    > v0.28.0 문안은 delivery liveness 완결·exactly-once·유실/고아 해소·자연사 인지·자동
    > cleanup을 주장하지 않는다. liveness debt(§7·§8)를 명시 기재한다.
    *근거:* durable outbox·apply receipt·reconcile·pane_exited 전부 후속(§7) — 정직성이 곧
    다음 R 게이트의 전제.

---

## §7 범위 밖 + 후속

| 항목 | 후속 | 왜 v0.28.0에 넣지 않는가 |
|---|---|---|
| durable outbox · stable eventId · 재전송 · tower atomic dedup+apply receipt · Flight-less startup recovery | **후속 A** (브랜치 §6 승계) | relay/wire 표면 변경 필요 — 로컬 변경으로 닫히지 않음. 그 전까지 U11의 과장 금지가 정직성 경계 |
| cleanup grant(tower→bridge 역방향 계약) · tombstone/TTL 재도입 · pane GC | **후속 B** (브랜치 §6 승계) | §3.2 — receipt 채널 부재. grant는 attempt·proposal·generation 결속으로 설계 |
| **자연사 관측**: `pane_exited` 구독·처리 + bounded reconcile cadence(구 락 8 수치) + replay 방어(구 락 3) | **후속 C (신설 명명)** | §0.3-2 실측 — 양 노선 공히 전무. 안전한 처리에는 replay 방어(구 락 3)와 reconcile이 선결인데 둘 다 미구현. pane 보존(U3) 하에서 자연사의 피해는 "카드가 doing에 잔존"으로 국한되며 이는 U6 quarantine·board 정체로 사람에게 보인다 — 급성 위험이 아니라 관측 부채 |
| conv 경로: ACK 폐기(실측 — `void sendWorkerTurnFromPane` `:1587 :2492 :2511 :2516` · 봉투 미소비 `:1353 :1372 :1830`) · 비가역 상태 전진 | **U4 후속** (기존 명명 승계) | 양 노선 공히 미수정(브리프 §4-3 종결 — main pre-C도 conv를 고치지 않았음을 실측 확정). card-only 완료를 주장하지 않는다(U11) |
| `rejection_escalation`(tower의 제안 거절 계약) | (C) 후속 | 거절을 표현할 계약 자체가 없음 — dormant 행 유지 |
| 사람/verifier provenance 강제 · 자동 `done` 재도입 | 후속 (구 락 13 조건 승계) | verifier 결과·artifact hash·durable 적용이 모두 갖춰진 좁은 경로에만 — 운영 답답함은 사유가 아님 |
| `ROLE-PERMISSION-PROFILE-UNIFICATION.md` | 독립 MINOR | 실측: 자기 선언 "PLAN SSOT 아님 · 독립 MINOR 후보", pane 결합 사실상 0 — PANE-DEATH와 무관(브리프 §4-5 종결) |
| bridge restart 후 binding 복원 | 기존 out-of-scope 유지 | 구 §9-6 기결정 |

---

## §8 미확인 / 정직성

**미확인(본 설계가 검증하지 못한 것 — "없음"과 구별):**

1. **relay 명시-거부 봉투의 실제 형상** — §2.3 ①은 정규식 휴리스틱(`:2773-2778`)이 실측 무근임을
   근거로 행동 분기를 제거했다. 어떤 형상이 오든 흡수로 수렴하므로 correctness에는 걸리지 않으나,
   reason 각인의 품질은 실측 후 개선 여지.
2. **`pane_exited`가 `pane.closed` 구독으로 전달되는지** — 구독 surface 실측 없음(후속 C 선결
   프로브). 본 설계는 "처리 코드 0건"만 실측했다.
3. **브랜치 `bridge.test.ts` +244줄의 전량 정독** — 이식 가치 판단은 아키텍트 실측 인용
   (:244-300, :344-346, :802-906) + diffstat 확인까지. 이식 시 M4에서 전량 정독 필수.
4. **dist/ 번들 대조** — 미수행. M5 재번들+버전 bump가 자연 해소하므로 대조 생략(양쪽 모두
   0.27.0을 주장하는 충돌 사실만 브리프에서 승계).
5. **quarantine `process_exit` fold의 구현 의도** — §0.3-4를 결함으로 판정했으나 구현자 의도
   기록은 찾지 못했다. 코드=SSOT 원칙상 "현 동작 = 정상 종료 시 미해소 소실"이 사실이고, §6.7.1
   취지와의 불일치 판정은 본 설계의 해석이다 — R 게이트에서 재확인 대상.
6. **테스트·라이브 프로브 미실행** — 지시대로 `bun test`·스모크 미실행. 모든 코드 주장은 정독
   기반.
7. **브랜치 워크트리 미커밋 문서 변경**(`tasks/lessons.md` 충돌 소지 — 브리프 §6) — 본 설계
   범위 밖, 통합 시 별도 처리 필요 사실만 전달.

**정직성(닫히지 않은 것을 숨기지 않는다):**

- **v0.28.0 이후에도 자연사 pane은 인지되지 않는다**(후속 C). 트랙 이름이 약속하는 것의 절반
  (거짓 성공 제거·전달 무결·권한 경계)만 닫히고, 관측 축은 부채로 남는다.
- **proposal 유실은 여전히 가능하다**(후속 A 전) — send_unknown 흡수와 quarantine이 이를
  "관측 가능"하게 만들 뿐 회수하지 않는다. 정확한 효과 한 줄은 구 §9-ter의 것을 승계한다:
  **"거짓 성공 제거, 유실·고아는 관측 가능하되 존속."**
- **pane 축적은 실재하는 운영 비용이다**(§3.2) — 후속 B 전까지 수동 정리.
- **사람 확정 리드타임**이 전 카드의 필수 경로가 된다 — (C) 전환의 알려진 대가(구 §5 B′ 비용
  표 승계). 이를 줄이는 자동화는 락 U1~U3의 재도입 조건(구 락 13)을 통해서만.

---

## 자기 검증 패스 (작성 후 1회 수행 기록)

- §1.2 전이표 ↔ §6 락: U1(발행물 2형)=§1.2 result_sending 분기와 일치 · U3(cleanup 0)=§1.2
  cleanup 블록·§3.1과 일치 · U5(2+1분기)=§1.2 ACK 분기와 일치(구 3분기 표의 "명시적 거부" 행은
  §1.4 대응표에서 흡수 합류로 명시) — 모순 없음.
- §3 ↔ §1: §1.1 권한 표 Cleanup 행 = 후속 B = §3.2 판정 — 일치. `terminal_expected` 도달 불가
  선언(§3.3)과 §1.2에 해당 상태 부재 — 일치.
- §4 ↔ §2: §4.1 "quarantine 성공 수신증 금지" = U6 = §2.3 ②③의 ack/process_exit 의미 구분과
  일치. §4.2 비수락 행 = §2.3 ① 단일 흡수와 일치(rejected 별도 행 없음).
- §4 ↔ §6 (R44 UNVERIFIED ⑥ 반영 후 재실행): §4.2 accepted (a)는 양성 2건(pane 보존 · 주입기
  호출 정확 1건) + 보조 1건(quarantine enter 0건) 구성이므로 **U7 "부정 어서션 단독 금지"를
  위반하지 않는다 — U7 문안 개정 불요**. 신설 `classifyAck` 유닛 행도 전량 양성 어서션이라 U7
  정합. 락 U1~U11 본문 문면 무변경.
- **참조처 정합 6건 마감(본 개정):** ① §4.3 신설 유닛의 선행 production 리팩터(`classifyAck` 모듈
  스코프 승격+export)를 **M3 확정**으로 §5.2에 등재 — M4는 tests-only라는 §5.2 규율과 일치.
  ② §5.3 **G-11 신설**(4케이스 순수 유닛) — G-5는 비수락만 덮으므로 accepted의 양성 락이 부재했다.
  판정 열 U5·U7이며 **락 문안 추가·개정은 없다**(표 행 추가일 뿐). ③ §2.1 strict ACK 기둥의
  v0.28.0 변경 열에 승격+export를 두 번째 변경으로 등재 — §5.2 M3·§4.3·G-11과 4중 일치.
  ④ §4.2 비수락 행의 미해소 어서션을 **test-owned store 한정**(파일 fold 또는 테스트 별도 `load()`)
  으로 정정 — accepted (a) 행과 동일한 클로저-로컬 함정 제거. ⑤ §4.2 표 구조 복구: `A4 보존 계약`
  행을 표 본체 마지막(경쟁 패자 다음)으로 이동하고 blockquote 2개를 표 종료 뒤로 재배치 — 행·註
  문면 무변경, 표 전 행 4열. ⑥ §4.1 명명 규약 정밀화: "3분기"는 `SendResultOutcome` 타입의 값 수,
  판정 함수 `classifyAck`는 이미 2값, §2.3 ①의 변경면은 타입 층 + catch 블록 정규식 분기.
- 좌표 실측(본 개정 재확인): `classifyAck` def `:2687` — 반환 타입 축자 `"accepted" | "send_unknown"` ·
  `SendResultOutcome` `:2671-2679` · `{ branch: "rejected", reason: msg }` 구성은 `sendResult`
  catch 블록 **`:2780` 1곳뿐**(직전 워커 보고 좌표 재확인 결과 **일치**) · `startBridgeRuntime`
  `:566`(리포 전체에 `createBridgeRuntime` 0건 — 문서에도 잔존 0) · `quarantinePath()` `:67` ·
  `foldQuarantineLines()` `:96` · `QuarantineStore` `:142` · `load()` `:156` ·
  `unresolvedCount()` `:179` · 주입 seam 파일 = `packages/host/src/relay-client.ts`(`packages/relay/`
  아님 — 문서 내 오경로 잔존 0).
- 좌표 재실측(본 개정): `type Flight` 미export(`:375`) · `classifyAck`(`:2687-2699`, 들여쓰기 2칸
  = `startBridgeRuntime`(`:566`) 클로저 내부, 반환 2값) · `const sent = outcome.branch ===
  "accepted"`(`:2610`)가 게이트하는 대상은 `herdr.request("pane.close")` 단 하나 ·
  `branch:"rejected"` 구성은 catch 블록(`:2780`) 1곳뿐(classifyAck 아님) ·
  `__ackInjector`(`relay-client.ts:33,40,359-383`) · `fake.listPaneIds()`(`fake-herdr.ts:863`) ·
  `hetero.handoff.test.ts:70` `toHaveLength(1)` · `pane-cleanup.test.ts:92-109` `awaitCardResult`는
  첫 매치 반환(개수 미계수) — 전부 실측 확인.
- §0.2 판정표 ↔ 본문: D4 개정=§4.1 · D7 확대=U8+§0.3-3 · D8=§2.4 · D10=§1.3·D10 항목 — 요약과
  본문 어긋남 없음.
- 좌표 재점검: `:2171 :2197 :2256 :2288 :2315`(done 5곳) · `:1305 :1981 :2618`(close 3곳) ·
  `ec99b2c:…:2198 :2245 :2260`(fire-and-forget 3곳) — 본문 인용 전부 grep 실측과 일치.

[PANE-DEATH-UNIFIED-DESIGN-DONE] skeleton=branch-semantics-on-main-substrate version=v0.28.0 rgate=needed locks=11 followups=A,B,C,U4
