# PANE-DEATH R43d 검증 원장 (PLAN v0.27.0)

검증 리비전 `cb18350` (R43c 3차 개정본 — R43c 2레인 회수 + 원장 + 3차 정밀화 반영분).
레인 = **단일 레인**(로컬 `codex-cli`, `codex exec --sandbox read-only`, reasoning=high) —
**경량 델타 검증**. 사유: R43c 잔여 지적이 전원 문면·전파·표 분할이었고 설계 재론이 0이었으므로,
3차 정밀화가 그 문면 전파를 정확히 반영했는지만 확인하면 되는 델타 검증이다(R43c 원장 §4·§1 —
"다음 = R43d 경량 델타 검증(codex 단일 레인) 후 종결").
좌표의 `:N`은 별도 표기가 없으면 `packages/host/src/bridge-runtime.ts`의 행 번호다. PLAN 좌표는
`docs/PLAN.md:N`, 설계 좌표는 `docs/spikes/PANE-DEATH-DESIGN.md:N`으로 명시한다.

> **본 원장은 R43d 단일 레인 산출물의 기록이며, 기존 리뷰 원장 6본
> (`PANEDEATH-CODEX-REVIEW*.md`·`PANEDEATH-R43.md`·`PANEDEATH-R43B.md`·`PANEDEATH-R43C.md`)은
> 수정하지 않는다.** 아키텍트 판정(§1)은 확정이며, 잔여 3건의 반영은 **다음 세션 4차 개정**에서
> 이뤄진다(이 세션은 오너 지시로 여기서 종료 — 코드·설계 무변경).

## 1. Verdict

**codex 레인 verdict: `reject`** (ready: no). 9건 중 **7 resolved · 2 partial** — 수렴 종반.

**아키텍트 판정(확정 — 재논증 금지):** 잔여 3건은 전부 **시대 태그 전파·정밀화**(설계 재론 0)이다.
codex가 reject로 격상한 근거(H-new-1)조차 "새 결함"이 아니라, R43c에서 §7.1-0에 이미 시행한
**시대 매개변수화 문면 정정을 나머지 파생 표면(PLAN D6/D8·§6.7-bis 결정 원문·§7.1 항목·Smoke 1·§10)에
전파하지 못한** 미봉합이다. Med·Low도 각각 규칙 순서 1문단 확정·판별 유니언 좌표 1곳 정정으로,
락 개정·범위 재획정급 설계 재론은 **0건**이다.

따라서 **잔여 3건은 다음 세션에서 4차 반영 후 R43e**(경량 델타, codex 단일 레인)로 닫는다.
오너 지시(2026-07-21)로 이 세션은 여기서 종료한다.

## 2. R43c 지적 해소 수렴 표 (9건 · codex 단일 레인)

R43c 판정 표(9 finding — codex #1~#9)의 3차 개정 반영을 검증했다. 7건 resolved, 2건 partial.
codex의 "partial"은 원 지적의 substance는 해소되되 **같은 영역에서 시대 태그·판별 유니언 파생
표면에 잔재**가 남았다는 뜻이다(→ 잔여 3건, §3).

| # | R43c 지적 / 판정 반영 | 결과 | 좌표·근거 (codex 재실측) |
|---|---|---|---|
| 1 | 시대 매개변수화 (`initial` 성공형 status만 매개변수) | **partial** | 코어 매개변수화 정확: `DESIGN:788-831`·PLAN D4 `:89`·락 5 `:1292-1317`·§7.1-0 `:1023-1027`. 잔재: PLAN D6/D8(`:91,93`)이 여전히 "논리 result 2건·재귀 깊이 2"를 v0.27.0에 요구, §6.7-bis 결정 1·2 원문(`DESIGN:942-943,986-988`) 무태그, §7.1 항목 5/6a/12·Smoke 1·§10(`:1036-1059,1098-1105,1581-1585`)이 (C)-전용 거동을 무태그 강제 → **H-new-1** |
| 2 | 전이표 1행 status 분할 (성공형/failed형) | **resolved** | initial 성공형/failed형 분리 `DESIGN:810-816` · failed initial은 escalation 엣지 없이 모든 비수락 outcome이 `send_unknown` 직행 · 지지 prose 정합 `:818-826` |
| 3 | D5 CAS → `flightSideEffectOwner` 개명 + 접속 규칙 | **resolved** | PLAN D5가 lifecycle 불리언을 `flightSideEffectOwner` 상당으로 명명, Flight-backed = lifecycle CAS ∧ issuer acquire · Flight-less = issuer acquire 단독(`PLAN:90`) · 설계 전파 `DESIGN:777-784,1310-1317` |
| 4 | 태그드 판별 유니언 키·해제(c) 파생 전파 | **partial** | 태그드 키·해제(c)가 PLAN U2 `:131`·설계 메타데이터 `:699-709`·append-only fold `:718-723`·락 8 `:1384-1405`·락 13 `:1564-1569`·§10 `:1611-1624`에 도달. 잔재: 신규 presence→send 규칙이 outcome-ambiguous(`:731-742` → **M-new-1**), PLAN 보안 파생이 여전히 모든 레코드에 `seq` 서술(`PLAN:107` → **L-new-1**) |
| 5 | §6.7.3 폴백 도달성 (성공=seq dedup 직행·miss·중복) | **resolved** | 폴백 성공은 per-dispatch dedup 직행 · scan miss는 `handoff_unmapped_or_stale` 기록 · 중복 매치는 적용 없이 fail-visible(`DESIGN:852-886`·§10 `:1605-1610`) |
| 6 | §10 seq-리셋 잔재 삭제 | **resolved** | "브릿지 재시작 seq 리셋 유실은 해소됨" 스테일 어서션 삭제 확인 · 잔여 언급은 명시 철회 + 재시작 replay out-of-scope 유지(`DESIGN:835-844,893-898,1605-1610`) |
| 7 | 좌표 `:113`→`:2408-2434` | **resolved** | PLAN `:115`가 `bridge-runtime.ts:2408-2434` 인용, handoff는 `:2423-2428` · 소스 정확 일치 · `return true`는 `:2429` |
| 8 | D1-b `:529` 편입 | **resolved** | `still-running.test.ts:529`가 PLAN D1-b·D7에 등재(`PLAN:86,92`) · 소스 `packages/host/src/still-running.test.ts:529`가 blocked-during-deferral 회귀 테스트 |
| 9 | R43d 좌표 동기(status·D8·이력) | **resolved** | PLAN status·D8이 R43d 지시(`PLAN:7,53,59,93,135`) · 설계 이력 동형(`DESIGN:1676-1694`) · R43c 원장이 `next=R43d` 기록(`PANEDEATH-R43C.md:31,102,267`) |

**공통 무회귀:** R43·R43b·R43c 원 지적은 되돌린 흔적 0건(codex 정적 확인 — 상태 스키마
`card-contract.ts:33`·Flight-less 경로 `:850,1114,1204`·`sendResult` 좌표·`:529` 회귀 테스트·
`card-ops.ts:112-117,190-197` 재실측).

## 3. 잔여 3건 상세 (다음 세션 4차 반영 착수 지점)

전부 **문면 전파·정밀화**(fable-advisor 자문 불요 · 설계 재론 0).

### [High] H-new-1 — 시대 태그 전파 미완

- **좌표:** PLAN D6/D8(`docs/PLAN.md:91,93`) · §6.7-bis 결정 1·2 원문(`DESIGN:942-943,986-988`) ·
  §7.1 항목 5/6a/12·Smoke 1·§10 일부(`DESIGN:1036-1059,1098-1105,1581-1585`).
- **결함:** DESIGN §6.7.2는 pre-C 재귀 깊이 1·(C) 깊이 2로 올바르게 매개변수화됐으나(`:788-831`),
  PLAN D6/D8은 여전히 v0.27.0에 **논리 result 2건·재귀 깊이 2**를 요구한다. 정본 §6.7-bis 결정
  원문은 그 주장을 **시대 태그 없이** 반복하고, §7.1 항목 5/6a/12·Smoke 1·§10은 (C)-전용 거동
  (`needs_verification`·human-verification·no-close)을 **무태그로 강제**한다. 이는 PLAN이 명시한
  pre-C 계약(`:99`)과 충돌하며, 단일 정합적 v0.27.0 수용 타깃을 막는다.
- **반영 방향:** R43c가 §7.1-0에 시행한 것과 **동형의 시대 표기 전파** — 어느 행·문장이 [v0.27.0]에서
  live이고 어느 것이 [(C) 본체] 소관인지 태그. 설계 재론 불요.

### [Med] M-new-1 — presence supersede ↔ 자동 해제 (c) 순서 모호

- **좌표:** `DESIGN:720-742`.
- **결함:** 설계는 (a) 수락된 늦은 presence result가 presence 레코드를 자동 해소한다(`:720-723,731-736`)고
  하면서, (b) 늦은 send가 시도되는 즉시 그 레코드가 seq-키 레코드로 supersede된다(`:738-742`)고도 한다.
  수락된 send는 전부 먼저 시도된 것이므로 두 규칙이 겹친다. 문서는 presence 레코드가 supersede보다
  먼저 해소되는지, seq 레코드도 함께 해소되는지, 성공한 늦은 send가 **거짓 미해소 quarantine 항목을
  남기는지**를 규정하지 않는다.
- **반영 방향:** 해소 순서를 1문단으로 확정 — supersede가 선행하고, seq 레코드가 relay_accepted로
  종결되면 그 레코드를 자동-해소 fold하여 presence 레코드가 거짓 미해소로 잔존하지 않음을 명시. 문면.

### [Low] L-new-1 — quarantine 메타데이터 파생 1곳 무태그 잔재

- **좌표:** `docs/PLAN.md:107`.
- **결함:** PLAN 보안/신뢰 절이 여전히 durable 레코드가 무조건 `cardId · seq · dispatchHandoffId`를
  담는다고 서술 — U2·DESIGN §6.7.1의 판별 유니언(presence_unknown은 `seq` 없음·`"presence"` 태그)과 충돌.
- **반영 방향:** `:107`을 판별 유니언으로 정정(send_unknown = seq 필수 · presence_unknown = presence 태그·seq 없음). 문면.

## 4. UNVERIFIED (codex — "없음"과 구별)

- **테스트·라이브 프로브 미실행**(지시대로). 커밋 `cb18350`은 **문서만 변경**하므로 제안된 issuer·
  quarantine fold·폴백 스캔·currency 게이트의 런타임 거동은 검증 불가.
- 정적 코드 확인 통과: 상태 스키마(`card-contract.ts:33`)·Flight-less 경로(`:850,1114,1204`)·
  `sendResult` 좌표·`:529` 회귀 테스트·task `handoffId`/200-task 한계·`card-ops.ts:112-117,190-197`.

## 부록 A — codex 레인 최종 [R-RESULT] 축자 전문 (verdict: reject)

전체 로그(세션 스크래치패드 — 영속 저장소 아님, 이 원장으로 영속화):
`/private/tmp/claude-501/-Users-kyoungsiklee-projects-fable-advisor/0cb94fca-e745-4e18-8938-4490323e2d27/scratchpad/r43d-codex-last.txt`.
최종 `[R-RESULT]` 블록을 아래에 축자 전재한다.

---

[R-RESULT] R43d — verdict: reject
ready: no

Resolution table

| # | Result | Coordinates / rationale |
|---|---|---|
| 1 | **partial** | Core parameterization is correct at DESIGN `:788-831`, PLAN D4 `:89`, lock 5 `:1292-1317`, and §7.1-0 `:1023-1027`. However, pre-C PLAN D6/D8 still require two logical results and recursion depth 2 (`docs/PLAN.md:91,93`), while PLAN explicitly makes (C) out-of-scope (`:99`). Untagged (C)-only derivatives also remain at DESIGN `:942-943,986-988,1036-1059,1098-1105,1581-1585`. |
| 2 | **resolved** | Initial success/failed rows are separated at DESIGN `:810-816`; failed initial results have no escalation edge and every non-accepted outcome goes directly to `send_unknown`. Supporting prose is consistent at `:818-826`. |
| 3 | **resolved** | PLAN D5 names the lifecycle boolean as `flightSideEffectOwner`-equivalent and requires Flight-backed = lifecycle CAS ∧ issuer acquire, Flight-less = issuer acquire alone (`docs/PLAN.md:90`). DESIGN propagation is at `:777-784,1310-1317`. |
| 4 | **partial** | Tagged union keys and release (c) reached PLAN U2 `:131`, DESIGN metadata `:699-709`, append-only folds `:718-723`, lock 8 `:1384-1405`, lock 13 `:1564-1569`, and §10 `:1611-1624`. The newly added presence→send rule remains outcome-ambiguous (`:731-742`), and PLAN’s security derivative still describes every record as carrying `seq` (`docs/PLAN.md:107`). |
| 5 | **resolved** | Fallback success goes directly to per-dispatch dedup; scan miss records `handoff_unmapped_or_stale`; duplicate matches fail visibly without applying (`DESIGN:852-886`, §10 `:1605-1610`). |
| 6 | **resolved** | The stale “bridge-restart seq reset loss is fixed” assertion is gone. Remaining mentions explicitly retract it and retain restart replay as out-of-scope (`DESIGN:835-844,893-898,1605-1610`). |
| 7 | **resolved** | PLAN `:115` now cites `bridge-runtime.ts:2408-2434`, with handoff at `:2423-2428`. Source matches exactly; `return true` is `:2429`. |
| 8 | **resolved** | `still-running.test.ts:529` appears in PLAN D1-b and D7 (`docs/PLAN.md:86,92`). Source `packages/host/src/still-running.test.ts:529` is the claimed blocked-during-deferral regression test. |
| 9 | **resolved** | PLAN status and D8 point to R43d (`docs/PLAN.md:7,53,59,93,135`); DESIGN history does likewise (`:1676-1694`), and the R43c ledger records `next=R43d` (`PANEDEATH-R43C.md:31,102,267`). |

### High

- **H-new-1 — Era parameterization remains contradictory in implementation gates.** DESIGN §6.7.2 correctly says pre-C recursion depth 1 and (C) depth 2 (`:788-831`), but PLAN D6/D8 still require two logical results and depth 2 for v0.27.0 (`docs/PLAN.md:91,93`). The canonical §6.7-bis decisions repeat those claims without era tags (`DESIGN:942-943,986-988`), while §7.1 items 5/6a/12, Smoke 1, and §10 continue to mandate (C)-only `needs_verification`, `done 0`, human-verification, and no-close behavior (`:1036-1059,1098-1105,1581-1585`). This conflicts with PLAN’s explicit pre-C contract (`docs/PLAN.md:99`) and prevents a single coherent v0.27.0 acceptance target.

### Medium

- **M-new-1 — Presence supersession overlaps automatic release (c).** DESIGN says an accepted late presence result automatically resolves the presence record (`:720-723,731-736`), but also says the record is superseded by a seq-keyed record as soon as the late send is attempted (`:738-742`). Every accepted send was first attempted, so both rules match; the document does not specify whether the presence record is resolved before supersession, whether the seq record is also resolved, or whether a successful late send leaves a false unresolved quarantine entry.

### Low

- **L-new-1 — One untagged quarantine metadata derivative remains.** PLAN’s security/trust section still says durable records contain `cardId · seq · dispatchHandoffId` unconditionally (`docs/PLAN.md:107`), contradicting U2 and DESIGN §6.7.1, where `presence_unknown` has no `seq` and uses the `"presence"` tag.

### UNVERIFIED

- No tests were run, as requested.
- Static code checks confirmed the status schema (`packages/protocol/src/card-contract.ts:33`), Flight-less paths (`bridge-runtime.ts:850,1114,1204`), `sendResult` coordinates, the `:529` regression test, task `handoffId`/200-task bound, and `card-ops.ts:112-117,190-197`.
- Runtime behavior of the proposed issuer, quarantine fold, fallback scan, and currency gate remains unverified because commit `cb18350` changes documentation only.

---

[PANEDEATH-R43D-DONE] verdict=reject resolved=7of9 remaining=high1-med1-low1 lanes=1 next=R43e-after-4th-revision
