# PANE-DEATH Codex 3차 적대적 검증

검증 리비전 `50d3417` (codex-cli 0.144.6, `--sandbox read-only`, reasoning=high).
좌표의 `:N`은 `docs/spikes/PANE-DEATH-DESIGN.md`의 행 번호다.

이후 커밋 `d9a0a98`(§9-bis 서문 산문 3줄 정확화)은 아래 6건 발견 어디에도 접점이 없다 — **판정 유지**.

## 1. Verdict

**reject** · `ready=no` — 영속화된 done + ACK 유실에서 두 번째 failed result로 가는 **직접적 normative 경로가 문서에 남아 있고** 하드 reject 조건을 발동시킨다. D7 편집은 **약 1분 이상 도는 모든 건강한 flight를 result-commit 불확실 전용 phase로 이동시킬 수 있는 새 모호성**을 도입했다. `generation`·ACK 경계는 실질 개선이나 terminal 분류·래치 의미론·복구·start evidence는 여전히 구현자 의존이다.

## 2. 2차 지적 8건 원장

| # | 항목 | 판정 | 근거 |
|---|---|---|---|
| F1 | 전이표 충돌 (2차 유일 High) | **NOT CLOSED** | `:49` 요약·`:521` 스모크 1이 여전히 pre-ACK terminal → failed/blocked 명령, `:689` 락 5와 정면 충돌 |
| F2 | lifecycle `generation` | **CLOSED** | `:308`, `:333` — agent.start별 불투명 bridge-local 토큰, pane/terminal/owner/seq 바인딩 + 비동기 콜백 재검증 |
| F3 | reconcile cadence/liveness | **NOT CLOSED** | `:728` — 실측 가시성 바운드 없음, 소진 시 result·보드 전이 무보장 |
| F4 | expected-terminal 조건 | **NOT CLOSED** | `:650` vs `:666` — 락 1과 락 3이 동일 terminal을 반대 분류 |
| F5 | `terminalPending` 전이 | **PARTIAL** | `:322`, `:386` — 필드와 3분기는 있으나 소비/해제 규칙 + 거절 후 failed result의 ACK 의미 미정의 |
| F6 | `commit_unknown` liveness/복구 | **NOT CLOSED** | `:471`, `:736` — 10분 보존 후 log+dispose는 관측이지 복구가 아님, 카드 영구 `doing` |
| F7 | ACK 보증 경계 | **CLOSED** | `:765` — relay-accept로 정의 확정, `result_relay_accepted`/`relayAcceptedAt` 인코딩 |
| F8 | status replay/완료 안전성 | **PARTIAL** | `:397`, `:617` — replay 독립성 주장이 거짓. start-evidence 게이트 `sawWorking` 자체가 status에서 쓰인 값 |

**D8 완전 통과** — normative live phase 값으로 쓰인 스테일 `result_committed` 참조 0건.

## 3. Findings

### High-1 — D3: 두 번째 result 경로 잔존 (하드 reject 조건 발동)

좌표: `:49`, `:354`, `:521` vs 락 5 `:689`

트레이스:

1. 완료가 CAS 획득 → `result_sending`
2. done result가 relay에 도달·영속화
3. **ACK 유실**
4. 호출자가 `sendResult` await 중 pane 종료
5. **구현 A**(락 5 준수) = `terminalPending` 래치 → `commit_unknown`, 추가 발행 없음
6. **구현 B**(`:49` 요약 + 스모크 1 준수) = "ACK 전 종료 → blocked"이므로 failed 발행
7. 타워 인박스에 **영속화된 done + 뒤이은 failed 2건**

배관상 실재: `packages/host/src/bridge-runtime.ts:2312` `finishCard()`가 result send를 await하는 동안 terminal 핸들러(`:2119`)가 독립적으로 failed를 쏠 수 있다.

### High-2 — D7이 새로 만든 모순: 12회 상한이 정상 장기 flight를 고아로 만듦

좌표: `:732`

표가 reconcile 시작·5초 폴·12회 상한·소진 시 `commit_unknown`을 규정하면서 **`present` 응답이 시도 카운터를 리셋한다는 규정을 빠뜨렸다**(absent strike만 언급). 구현 A(문자 그대로) = 60초 넘게 `present`인 **건강한** 작업이 `commit_unknown` 진입 → reconcile 정지 → 문서상 어떤 전이로도 완료 불가 → 10분 후 dispose, 카드 `doing` 잔존. 구현 B = `present`를 리셋으로 해석해 정상 완료.

### Medium — D7 cadence 수치: 두 실패 모드 어느 쪽도 배제 못 함

좌표: `:702`, `:728`

- 구현 A(거짓 사망): `pane.list` 가시성 지연이 6초를 넘으면 방금 뜬 살아있는 pane이 +1s·+6s 연속 2회 absent → 사망 오판. **지연 상한이 실측되지 않아 6초 충분 근거 없음.**
- 구현 B(영구 미검출): 등록 직전 terminal 상실 시 12회 창 내내 오류/스테일 present → `commit_unknown` → 10분 후 로그+dispose, result 미발행 → 타워 무기한 `doing`.

**"수치는 확률을 낮출 뿐 불가능하게 만들지 못한다. 정확성 갭을 미실측 상수로 닫으려는 구조 자체가 문제다."**

### Medium — 락 1 ↔ 락 3 반대 분류 (2차 F4 무수정)

좌표: `:650` vs `:666`

`result_relay_accepted → cleanup_requested` 후 `pane.close` 완료 전 자연 `pane_exited` — 구현 A는 락 1의 "그 외 모든 terminal"로 uncommitted reconcile을 개시하고, 구현 B는 락 3으로 expected 즉시 소비한다.

### Medium — D2는 필드일 뿐 완전한 불변식 아님

좌표: `:318`, `:386`, `:736`

합법 phase/`terminalPending` 조합·래치 해제 시점·**명시적 거절 후 발행되는 failed result 자체의 ACK 처리**가 미정의다. 구현 A는 그 failed send에도 엄격 ACK를 재귀 적용해 ACK 유실 시 `commit_unknown`으로 가고, 구현 B는 로컬 최종으로 보고 래치 해제 후 dispose한다.

추가: **`commit_unknown` 의미 과부하** — 락 5는 "result 전송 시도 후 불확실"인데 락 8은 **result를 구성한 적조차 없는** presence 폴링 소진에도 진입시킨다. phase 이름이 인코딩하려던 의미가 무너진다.

### Medium — 락 10은 213 기록 트레이스만 막고 클래스를 막지 못함

좌표: `:359`, `:779`

기록된 213은 `sawWorking=false`라 게이트가 그 시퀀스는 차단한다. 그러나 `sawWorking`은 아무 `working` status에서나 서는 status 파생 불리언이지(`packages/host/src/bridge-runtime.ts:2144`) **이 카드의 프롬프트가 소비됐다는 증거가 아니다.**

우회: 기동 중 herdr 일시적 `working` 방출 → 프롬프트 제출 유실 → verifier가 `sawWorking` 수용 → 가짜 `done`. 초기 TUI엔 live indicator가 없어 구현 A는 done을 전송하고, 구현 B는 composer 클리어 등 프롬프트 특정 사후 증거를 요구해 거절한다.

## 4. 아키텍트 주석

- **F1 미닫힘의 근인**: 아키텍트 D3 지점 목록이 **9곳**이었으나 `:49`(§0-bis 요약 표)가 목록에 없었다. 증거 팩이 §5~§8만 스캔하고 문서 앞부분 요약 표를 범위 밖에 뒀고, 아키텍트 검수도 이를 잡지 못했다. **범위 축소가 정합성을 깬 패턴의 3회차 재범**(`tasks/lessons/orchestration.md` (27)).
- **High-2는 아키텍트 산출물 결함**: D7 cadence 표는 아키텍트가 직접 확정한 수치다. 위임 산출물이 아니라 아키텍트 판단이 새 모순을 만들었다.

[PANEDEATH-REVIEW3-DONE] verdict=reject high=2 med=4 ready=no
