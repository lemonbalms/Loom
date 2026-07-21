# HANDOFF Checkpoint Design — Loom 개발 플라이휠의 세션 복원 계약

| Field | Value |
|---|---|
| **Status** | **adopted / bounded Phase B→C rollout · Phase D deferred** |
| **Date** | 2026-07-22 |
| **Target** | Loom 아키텍트·구현·검증 세션의 세션 간 상태 복원 |
| **Related proposal** | [`LOOM-DEVELOPMENT-FLYWHEEL.md`](./LOOM-DEVELOPMENT-FLYWHEEL.md) |
| **Review** | [`HANDOFF-CHECKPOINT-REVIEW.md`](./HANDOFF-CHECKPOINT-REVIEW.md) — 1차 PENDING-REVISION 반영 · 재리뷰 APPROVE |
| **Owner decision** | 2026-07-22 — PANE-DEATH PATCH 1 전 bounded SESSION-CONTINUITY 웨이브 선행 |
| **Does not override** | `docs/PLAN.md`, `docs/plan_review.md`, `docs/WORKFLOW.md`, `docs/DOGFOOD_LOOP.md`, `HANDOFF.md` |

> Owner는 본 설계를 **Phase B→C의 bounded rollout**으로 채택했다. 제품 PLAN v0.28.0과 U1~U11
> 락은 바꾸지 않으며, PANE-DEATH PATCH 1 착수 직전 경계에서 잠시 멈춘다. Phase C 새 세션 복원
> 스모크가 통과하면 PATCH 1로 즉시 복귀하고, Phase D는 실제 PATCH 전환 2회 뒤에만 진행한다.

---

## 0. 독립 리뷰 계약 (`completed`)

독립 리뷰는 본 문서의 문안 품질보다 다음을 우선 검증했고, 개정판 재리뷰에서 APPROVE됐다.

1. 기존 SSOT와 새 HANDOFF 책임이 충돌하는가.
2. 다음 세션이 필요한 상태를 잃지 않고 복원할 수 있는가.
3. 완료 이력을 분리했을 때 provenance·재론 금지·활성 함정이 유실되지 않는가.
4. Loom 제품 개발 → 도그푸딩 → 하네스 일반화 루프의 현재 위치가 과장 없이 표현되는가.
5. 제안된 lint·status 자동화가 현재 코드 구조에서 구현 가능한가.
6. fail-open 동작이 중요한 상태의 조용한 유실을 만들지 않는가.

### 요청 verdict 형식

```markdown
## Verdict
APPROVE | PENDING-REVISION | REJECT

## Findings
| Severity | ID | Finding | Evidence | Required change |

## SSOT conflicts
- ...

## Information-loss risks
- ...

## Unverified
- ...

## Minimal revision set
1. ...
```

Severity 의미:

- **High:** 다음 세션이 잘못된 게이트를 실행하거나 제품·권한 상태를 거짓으로 복원할 수 있음
- **Medium:** 이력·검증·자동화가 드리프트하거나 운영 비용이 구조적으로 증가함
- **Low:** 명명·표현·확장성 문제이나 현재 복원 정확성은 유지됨

---

## 1. 문제 정의

현재 HANDOFF는 다음 역할을 동시에 수행한다.

- 현재 게이트와 다음 액션
- 직전 웨이브의 상세 서사
- 조사·실패·검증 provenance
- 장기 후보와 Owner 결정 대기
- 활성 함정과 재론 금지
- 세션 컨텍스트 주입 원본

이 역할이 한 파일에 누적되면서 다음 문제가 발생한다.

1. 체크포인트와 작업일지의 경계가 흐려진다.
2. PLAN·review·todo의 내용을 다시 서술해 드리프트가 생긴다.
3. 무훅 세션은 HANDOFF 상단을 직접 읽으므로 `<details>` 안 역사도 진입 비용이 된다.
4. 자동 주입은 `<details>`를 제거하므로 수동 읽기 경로와 자동 주입 경로가 서로 다른 정보를 본다.
5. 완료된 사실과 아직 검증되지 않은 가설이 같은 현재 액션 문맥에 남을 수 있다.

### 1.1 현재 저장소의 재검증 앵커

독립 리뷰 모델은 최소한 다음을 직접 실행·확인한다.

```bash
bun run status
bun run handoff:lint
bun run session-context:lint
bun test scripts/session-context.test.ts
```

그리고 다음 파일의 현재 구조를 대조한다.

- `AGENTS.md` — session start ritual · After finishing a gate
- `HANDOFF.md` — Current action · One-line resume · archive/traps 참조
- `scripts/session-status.ts` — 상태 조합·HANDOFF 예산
- `scripts/session-context.ts` — 주입 섹션·details 제거·fail-open
- `.claude/settings.json` — 실제 SessionStart 호출 형상
- `docs/WORKFLOW.md` — 문서 권한·완료 시 동기화
- `tasks/todo.md` — 비-SSOT 단기 체크리스트
- `tasks/traps.md` — 자동 주입되는 활성 함정
- `docs/HANDOFF_ARCHIVE.md` — 기존 완료 이력 보관

위 명령의 실패는 본 설계 채택 여부와 별개로 기록한다. 설계 문서가 기존 baseline red나 lint 실패를
가려서는 안 된다.

---

## 2. 설계 목표와 비목표

### 2.1 목표

HANDOFF의 목적은 다음 한 문장으로 제한한다.

> **다음 세션이 Loom 제품 개발·도그푸딩·하네스 일반화의 현재 위치를 복원하고, 하나의 검증 가능한
> 다음 게이트를 즉시 실행하게 한다.**

구체적 목표:

- 현재 PLAN과 리뷰 상태를 재서술하지 않고 정본으로 안내한다.
- Product·Dogfood·Harness·Reuse의 현재 위치를 과장 없이 보여준다.
- 다음 게이트를 정확히 하나만 제시한다.
- blocker는 해제 조건과 blocker 없이 가능한 검증을 함께 기록한다.
- 완료된 과정은 분리하되 근거 링크를 통해 복원 가능하게 한다.
- 자동 주입과 무훅 수동 읽기가 같은 핵심 상태를 보게 한다.
- 크기와 구조를 코드로 검증할 수 있게 한다.

### 2.2 비목표

- ROADMAP·PLAN·review의 새 SSOT가 되지 않는다.
- 작업 과정 전체를 보존하지 않는다.
- 장기 후보 우선순위를 결정하지 않는다.
- 테스트 결과·커밋·실패 서사를 모두 인라인하지 않는다.
- 본 설계만으로 `WORKLOG` 파일 형식이나 정식 ROADMAP을 확정하지 않는다.
- HANDOFF 문안만으로 완료 권한·역할 권한을 강제했다고 주장하지 않는다.
- Loom 저장소에서 작동한다는 이유만으로 portable harness를 주장하지 않는다.

---

## 3. 권한과 정보 소유권

| 정보 | 정본 | HANDOFF에 허용되는 표현 |
|---|---|---|
| 제품 버전·상태·구현 계약 | `docs/PLAN.md` | 버전과 앵커 링크 |
| 리뷰 verdict·blocking | `docs/plan_review.md`·리뷰 원장 | 최신 리뷰 링크·현재 blocking 요약 |
| 장기 제품/하네스 위치 | 향후 ROADMAP, 채택 전에는 관련 설계안 | 현재 loop ID·링크 |
| 다음 세션의 실행 게이트 | **`HANDOFF.md`** | 상세 current action 1개 |
| 실행·실패·테스트·커밋 이력 | 향후 WORKLOG 또는 기존 archive/원장 | 최신 증거 링크와 한 줄 결과 |
| 일반화된 교훈 | `tasks/lessons/*` | 활성 교훈 링크 |
| 즉시 재확인할 함정 | `tasks/traps.md` | 파일 링크, 자동 주입은 현행 유지 |
| 단기 잔여 작업 | `tasks/todo.md`(비-SSOT) | current action과 직접 관련된 항목만 링크 |

### 3.1 우선순위

충돌 시 다음을 따른다.

1. 제품 의미·락·버전 게이트는 PLAN
2. 리뷰·blocking은 review SSOT
3. 현재 세션의 다음 실행은 HANDOFF
4. HANDOFF와 todo가 다르면 HANDOFF
5. HANDOFF의 서술이 PLAN/review와 다르면 HANDOFF를 고치며 정본을 재해석하지 않음

---

## 4. 제안 문서 구조

초기 도입은 새 YAML/JSON 파서를 추가하지 않는다. 현재 `session-context.ts`의 anchored Markdown
섹션 추출 방식을 유지해 blast radius를 제한한다. 구조가 두 번 이상의 루프 전환에서 안정된 뒤에만
strict metadata 또는 front matter를 별도 검토한다.

필수 섹션은 다음과 같다.

```markdown
# HANDOFF — Loom

## One-line resume
## Current loop
## Current action
## Active checks
## Owner pending
## Blockers
## Invariants
## Evidence
## Don't redo
```

### 4.1 섹션 계약

| 섹션 | 계약 |
|---|---|
| `One-line resume` | 현재 loop·PLAN·다음 게이트를 1~3문장으로 표현 |
| `Current loop` | Product·Dogfood·Harness·Reuse 위치만, 상세 역사는 금지 |
| `Current action` | 다음 게이트 정확히 1개·기대 결과·금지 변경·완료 판정 |
| `Active checks` | 아직 닫히지 않은 검증과 실질 기한 |
| `Owner pending` | blocker는 아니지만 Owner 결정 전 임의 착수하면 안 되는 후보·결정 질문·근거 링크 |
| `Blockers` | blocker·해제 조건·책임 주체·blocker 없이 가능한 검증 |
| `Invariants` | 현재 게이트가 지켜야 할 짧은 불변식 |
| `Evidence` | PLAN·review·설계·WORKLOG/archive 링크 |
| `Don't redo` | 이미 종결돼 재론·재실행하면 안 되는 항목 |

`Current action` 아래에 이전 완료 웨이브를 기록하지 않는다. 완료 시 기존 내용을 WORKLOG 후보 또는
archive로 이동하고 다음 action으로 **교체**한다.

---

## 5. 제안 템플릿

```markdown
# HANDOFF — Loom

**Updated:** YYYY-MM-DD
**Workspace:** <repo>

## One-line resume

> `<current-loop>` · PLAN `<version/status>` · 다음 = `<one gate>`.

## Current loop

| 축 | 현재 위치 | 정본 |
|---|---|---|
| Product | proposed/designed/implemented/verified | PLAN |
| Dogfood | planned/observed/validated | DOGFOOD evidence |
| Harness | documented/repo-enforced/portable/reused | lessons/code |
| Reuse | not-proven/fixture/second-project | evidence |

## Current action

### <single gate>

Goal:
- ...

Expected:
- red/green 또는 성공/실패 판정 기준

Must not change:
- ...

Done when:
- ...

## Active checks

| Check | Deadline | Impact | Evidence |
|---|---|---|---|

## Owner pending

| Decision | Why owner input is needed | Safe default while pending | Evidence |
|---|---|---|---|

## Blockers

`(none)`

## Invariants

- ...

## Evidence

- Product plan: ...
- Design/review: ...
- Latest work evidence: ...
- Lessons/traps: ...

## Don't redo

- ...
```

`Blockers`가 없으면 위처럼 `(none)`만 둔다. blocker가 하나라도 있으면 `(none)`을 제거하고
`Blocker | Clear condition | Owner | Verifiable without blocker` 표로 교체한다. 빈 표와 `(none)`을
동시에 두지 않는다.

`One-line resume`의 PLAN version/status 1회 표기는 §3 소유권 표가 허용하는 탐색용 예외다. lint는
이 한 번을 상태 복제로 판정하지 않되, 다른 섹션에 같은 PLAN/review 상태 문자열이 반복되면 경고한다.

### 5.1 현재 v0.28.0에 대입할 때의 범위

현재 action은 `PATCH 1 (M1) tests-only expected-red` 하나만 둔다. Product 축은 "v0.28.0 approved,
implementation pending", Dogfood 축은 "가짜 done·조기 close·ACK/quarantine 결함 observed",
Harness 축은 "완료 권한 계약 designed, code enforcement pending", Reuse 축은 "not proven"으로
표현한다.

다음은 HANDOFF가 과장하면 안 되는 항목이다.

- delivery liveness 완결
- wire exactly-once
- 자연사 pane 관측
- 자동 cleanup
- conv 결과 경로 완결
- 하네스 portable/reused

후속 A/B/C는 `Next`가 아니라 우선순위 미확정 evidence/candidate 링크로만 둔다. 기존 Owner 결정
경계와 신규 기능 FREEZE를 유지한다. flake 트랙 선택·RULE-ENFORCEABILITY 적용·임시 brief 처리처럼
결정 전에도 salience를 유지해야 하는 항목은 candidate 링크로만 강등하지 않고 `Owner pending`에 둔다.

---

## 6. 이력 분리 계약

정식 WORKLOG 도입 전에는 `docs/HANDOFF_ARCHIVE.md`와 immutable review ledger를 그대로 보존한다.
새 설계 채택이 과거 문서를 재배치하거나 리뷰 좌표를 깨뜨리는 근거가 되어서는 안 된다.

향후 WORKLOG의 최소 책임 후보:

- 실행한 명령과 결과
- 실패·중단·재시도
- 테스트와 스모크 provenance
- 커밋·브랜치·트리 좌표
- 사실·추정·결정의 구분
- 다음 세션에 일반화할 교훈 후보

HANDOFF에는 다음만 남긴다.

- 최신 증거의 링크
- 현재 판정 한 줄
- 현재 action에 영향을 주는 미해결 검증

### 6.1 이동 규칙

- 완료 서사는 **복사 후 잔존**이 아니라 archive/WORKLOG로 이동한다.
- PLAN·review 문면은 HANDOFF에 축자 복제하지 않는다.
- `Don't redo`는 이유 전문 대신 정본 링크를 둔다.
- 활성 함정은 `tasks/traps.md`에 유지하고 HANDOFF에서 중복하지 않는다.
- 이동 후 링크 유효성과 정보 손실을 독립 리뷰가 확인한다.

---

## 7. 갱신 상태기계

```text
게이트 착수
  → Current action 기록
  → 실행·실패·검증은 Owner decision D3에서 확정한 HANDOFF_ARCHIVE 수납처에 누적
  → 게이트 판정
      ├─ 완료: evidence 링크 고정 → Current action 교체
      ├─ 수정 필요: 같은 action의 Expected/Active checks 갱신
      └─ true blocker: Blockers에 해제 조건 + 무블로커 검증 기록
```

### 7.1 갱신 시점

HANDOFF는 다음에만 갱신한다.

- 현재 게이트가 바뀔 때
- 새 true blocker가 생기거나 해소될 때
- 핵심 불변식·정본 링크가 바뀔 때
- 세션 종료 시 현재 action이 실행 중 상태와 다를 때

매 명령·테스트·커밋마다 갱신하지 않는다. 그것은 WORKLOG 책임이다.

### 7.2 완료 권한

HANDOFF의 `Done when`은 제품 완료 권한을 만들지 않는다. PLAN·review·테스트 게이트가 요구하는 완료
조건을 현재 세션에서 확인하기 쉽게 참조할 뿐이다. 특히 PANE-DEATH의 "완료는 사람이 확정" 불변식을
HANDOFF 작성자가 우회하거나 완화할 수 없다.

---

## 8. 크기와 구조 제약

초기 권고:

- 파일 전체 UTF-8 **8,192B 이하**
- 약 60~100줄 이내(바이트 한도가 정본)
- `<details>` 블록 금지
- `One-line resume` 정확히 1개
- `Current action` 정확히 1개
- 현재 action의 gate 제목 정확히 1개
- 완료 웨이브 서사·날짜별 작업일지 금지
- 모든 evidence 링크는 저장소 내부에서 해석 가능

현재 `session-status.ts`의 top-80/전체 예산과 바로 통합할지는 구현 리뷰에서 결정한다. 본 설계는
기존 상수를 조용히 바꾸지 않는다. 현행 한도는 **상단 80줄 8,192B 초과 시 실패 / 전체 파일
16,384B 이상 시 실패**의 이중 한도다. 제안하는 전체 8,192B는 현행 top-80 바이트 한도와 같은
값이지만 적용 범위가 다르다.

HANDOFF 파일 바이트 한도만으로 SessionStart 안전성을 보장하지 않는다. `--part state`는 HANDOFF
선택 섹션 외에 status와 `tasks/traps.md` 주입 본문도 합치며, 런타임 `HARD_CAP`은 UTF-8 바이트가
아니라 현재 구현의 JavaScript 문자열 길이로 적용된다. 초과 시 자체 절단 경고가 앞에 표시되지만
꼬리 정보는 여전히 유실될 수 있으므로, 전환 fixture는 합산 문자열 길이와 UTF-8 바이트를 둘 다
기록하고 `truncateContext` 적용 전 `state.length <= HARD_CAP`을 만족해야 한다.

---

## 9. 자동화 설계

### 9.1 `bun run status`

장기적으로 status는 각 정본에서 한 종류의 정보만 읽는다.

```text
PLAN       → version / plan status
review     → latest verdict / blocking
ROADMAP    → current loop (정식 채택 후)
HANDOFF    → next gate / one-line resume
```

ROADMAP이 아직 proposal인 동안에는 HANDOFF의 `Current loop`를 사람이 작성하되 status가 이를 새
SSOT처럼 사용하지 않는다.

### 9.2 `handoff:lint` 제안

필수 heading은 `REQUIRED_HANDOFF_HEADINGS` 같은 단일 공유 상수에서만 정의한다. HANDOFF 추출기와
lint는 이 목록을 함께 소비하며, 문서 템플릿·추출기·lint에 서로 다른 heading 문자열을 중복
하드코딩하지 않는다.

필수 실패 조건:

- 크기 한도 초과
- 필수 섹션 누락 또는 중복
- `<details>` 존재
- `Current action` 복수
- `Blockers`가 `(none)`도 아니고 구조화된 해제 조건도 없음
- Evidence의 로컬 링크 대상 부재
- 금지 섹션명(`Done (recent)`, `History`, `직전 웨이브`) 존재

경고 조건:

- 한 문단이 과도하게 길어 정본 복제가 의심됨
- 같은 PLAN/review 상태 문자열이 여러 섹션에 반복됨
- `Next`로 표시한 후보에 Owner 결정 근거가 없음
- `portable`/`reused`에 독립 증거 링크가 없음

### 9.3 fail-open/fail-closed

- SessionStart 주입 실패는 세션 기동을 막지 않는 현행 fail-open을 유지할 수 있다.
- 그러나 실패 시 **무출력**만 남기는 것이 안전한지는 별도 검토가 필요하다.
- commit/CI lint는 fail-closed여야 한다.
- status 파서가 예상 형상을 읽지 못하면 `없음`으로 추정하지 말고 `unknown/malformed`로 표시한다.
- 자동 주입과 수동 읽기가 핵심 섹션 집합에서 동등해야 한다.

---

## 10. 마이그레이션 계획

### Phase A — 리뷰 전용 (`completed`)

- 본 문서만 추가
- 기존 HANDOFF·status·hook·WORKFLOW 무변경
- 독립 리뷰 verdict와 정보 손실 분석 수행

### Phase B — 수동 체크포인트 실험 (`current`)

- 별도 임시 파일 또는 테스트 fixture에 새 템플릿 적용
- 현재 HANDOFF와 병행 비교
- 다음 세션이 두 문서에서 동일한 next gate를 복원하는지 확인
- 기존 history를 아직 이동하지 않음
- stale D4 기대값을 현행 `SOFT_CAP=12,750`에 동기화해 session-context 단위 테스트를 green으로 복구
- 현행 `handoff:lint` 용량 실패는 **Phase B expected-red**로 측정·고정하고, 이 단계에서 실제
  HANDOFF를 줄여 억지로 green으로 만들지 않음
- fixture의 전체 HANDOFF 바이트뿐 아니라 status + 주입 대상 섹션 + traps를 합친 state part의
  문자열 길이·UTF-8 바이트를 실측하고, 런타임 절단 없이 `HARD_CAP` 아래인지 확인

### Phase C — HANDOFF 다이어트 (`next after Phase B green`)

- **선행조건:** Owner decision D3에 따라 진행 중 실행·실패·검증의 수납처를 확정
- WORKLOG를 새로 만들지 않았다면, 전환 기간에는 `docs/HANDOFF_ARCHIVE.md`에 `In progress evidence`
  구획을 두어 진행 중 기록을 보관하고 종결 웨이브 이력과 섞지 않음
- 완료 서사를 Owner decision D3에서 확정한 `docs/HANDOFF_ARCHIVE.md` 수납처로 이동
- 링크·좌표·`Don't redo` 보존 검증
- 새 구조로 `HANDOFF.md` 전환
- 실제 `HANDOFF.md` 전환 뒤 `bun run handoff:lint` green 확인 — 용량 red의 해소 시점은 여기임
- `docs/WORKFLOW.md` §0.3의 HANDOFF 형상 계약 개정
- 필수 heading 목록을 단일 공유 상수로 만들고 `HANDOFF.md`·session-context 추출·향후 lint가 같은
  상수를 사용하도록 계약한 뒤, `AGENTS.md` 부분 읽기 규칙과 함께 원자적으로 전환

### Phase D — 자동화 (`deferred until two real PATCH transitions`)

- Phase C의 공유 heading 상수를 사용하는 lint 구조 검사
- status 파서 fail-loud 전환
- 실제 SessionStart와 무훅 경로 동등성 테스트

### Phase E — flywheel 연동

- 정식 ROADMAP이 채택된 뒤에만 current loop를 roadmap에서 읽음
- Product·Dogfood·Harness·Reuse 성숙도 표기 검증
- portable/reused 증거 규칙 적용

각 Phase는 독립 커밋·검증 단위로 두며, 한 번에 전체 문서 체계를 교체하지 않는다.

---

## 11. 검증 계획

### V1 — SSOT 무충돌

- PLAN version/status와 HANDOFF 링크가 일치한다.
- review latest/blocking을 HANDOFF가 독자 판정하지 않는다.
- todo가 stale이어도 next gate는 HANDOFF에서 유일하게 복원된다.

### V2 — 정보 손실

현재 HANDOFF의 비역사 핵심 항목을 목록화하고 새 템플릿에 매핑한다.

- current action
- next action의 판정 기준
- active unverified와 실질 기한
- owner-pending 결정·보수 기본값·근거
- blockers
- invariants
- evidence
- don't redo
- Windows/플랫폼 진입 링크(해당 시)

이 중 하나라도 새 HANDOFF 또는 연결된 정본에서 찾을 수 없으면 전환 실패다.

### V3 — 크기·단일성

- 8,192B 이하
- 필수 섹션 각각 1개
- current action 1개
- `<details>` 0개
- 완료 이력 블록 0개

### V4 — 자동/수동 경로 동등성

- `session-context --part state`가 One-line·Current loop·Current action·Active checks·Owner pending·
  Blockers·Invariants·Evidence·Don't redo와 `tasks/traps.md`의 `활성 함정`·`하지 말 것` 본문을 포함한다.
- 무훅 리추얼의 상단 읽기 + `tasks/traps.md` 부분 읽기로 같은 항목을 얻는다.
- details 제거 여부에 따라 핵심 상태가 달라지지 않는다.
- 합산 state가 `HARD_CAP`을 넘지 않으며 `truncateContext` 경고·꼬리 절단이 발생하지 않는다.

### V5 — 복원 테스트

독립 모델에 다음 정보만 제공한다.

1. 새 HANDOFF
2. `bun run status` 출력
3. AGENTS 진입 규칙
4. `tasks/traps.md`의 `활성 함정`·`하지 말 것` 본문

모델이 다음을 정확히 답해야 한다.

- 현재 product loop는 무엇인가.
- 현재 PLAN과 다음 gate는 무엇인가.
- expected success/red는 무엇인가.
- 무엇을 변경하면 안 되는가.
- 어떤 검증은 지금 하고, 어떤 검증은 후속까지 미뤄도 되는가.
- 무엇을 재론하면 안 되는가.

### V6 — drift/failure injection

- PLAN version 불일치
- evidence 링크 삭제
- Current action 2개 삽입
- blocker 해제 조건 제거
- Current action heading 개명 또는 shared heading 상수와 불일치
- `tasks/traps.md` heading 개명으로 주입 본문 탈락
- `<details>`로 history 재삽입
- review 형상을 table→bullet로 변경
- ROADMAP 없는 상태에서 current loop 참조

각 경우 lint/status가 조용히 정상으로 판정하지 않아야 한다.

---

## 12. 예상 위험과 보수 기본값

| 위험 | 영향 | 보수 기본값 |
|---|---|---|
| WORKLOG 분리 후 핵심 경위 유실 | 잘못된 재작업·재론 | 이동 전 정보 매핑과 독립 diff 리뷰 |
| 새 필드가 또 다른 SSOT가 됨 | PLAN/review 드리프트 | 링크만 저장, 상세 상태 복제 금지 |
| current loop가 미래 우선순위를 암시 | Owner 결정 우회 | 후보는 `CAND-*`, `Next` 금지 |
| 과도한 구조화 | 핸드오프 작성 비용 증가 | 필수 섹션 최소화, 자유 서사는 WORKLOG |
| fail-open 무출력 | 자동 주입 누락 미인지 | status에 `unknown/malformed`와 fallback 안내 |
| Loom 관례를 범용 하네스로 과장 | 잘못된 portable 계약 | 독립 fixture/두 번째 프로젝트 전 `repo-enforced` 상한 |
| 매 PATCH 로드맵/핸드오프 동기화 | 운영 문서가 개발을 지배 | HANDOFF는 gate 전환, ROADMAP은 loop 전환 때만 |

---

## 13. Owner decisions (closed 2026-07-22)

| ID | 결정 | 보수 기본값·적용 시점 |
|---|---|---|
| D1 | HANDOFF 전체 UTF-8 **8,192B 이하** | 현행 top-80 한도를 전체 파일로 확대 |
| D2 | ROADMAP 채택 전에도 `Current loop` 포함 | HANDOFF가 장기 우선순위를 정하지 않고 현재 위치만 표시 |
| D3 | 새 WORKLOG를 만들지 않고 `docs/HANDOFF_ARCHIVE.md` 역할 확장 | `In progress evidence` 구획을 종결 이력과 분리 |
| D4 | SessionStart fail-open 누락을 status 경고로 표면화 | fail-open 기동은 유지, `unknown/malformed`를 거짓 정상으로 표시하지 않음 |
| D5 | anchored Markdown 유지 | strict metadata/front matter는 두 번의 실제 전환 전 도입 금지 |
| D6 | Windows 진입 링크는 `Evidence`에 배치 | 필수 최상위 섹션을 늘리지 않음 |
| D7 | lint는 먼저 commit gate에 강제 | 실제 PATCH 전환 2회 검증 후에만 CI 승격 검토 |

### 13.1 실행 순서 락

1. Phase B fixture + SOFT_CAP stale 테스트 해소 + 현 HANDOFF lint expected-red 고정
2. Phase B green일 때만 Phase C 원자 전환 + 실제 HANDOFF lint green
3. 새 세션 복원 스모크에서 PLAN·next gate·traps·Owner pending·Don't redo 복원 확인
4. 즉시 PANE-DEATH PATCH 1(M1 tests-only expected-red) 재개
5. 실제 PATCH 전환 2회 동안 수동 운영 검증
6. 그 증거가 green일 때만 Phase D 착수

Phase B/C 동안 제품 production 코드는 변경하지 않는다. Phase C 또는 복원 스모크가 실패하면 기존
HANDOFF 구조로 복귀하고 PANE-DEATH를 더 지연시키지 않는다.

---

## 14. 제안 판정

현재 제안의 최소 핵심은 다음 네 가지다.

1. HANDOFF는 작업일지가 아니라 현재 실행 체크포인트다.
2. 완료 이력은 분리하되 evidence 링크와 정보 손실 검증을 의무화한다.
3. 제품·도그푸딩·하네스·재사용 위치를 구분하되 기존 PLAN/review 권한을 침범하지 않는다.
4. 구조가 수동 운영에서 안정된 뒤에만 lint·status·SessionStart 자동화를 변경한다.

독립 리뷰는 이 네 가지가 현재 프로젝트에서 성립한다고 판정했다. Phase B/C가 이 전제를 깨는 새
정보손실·SSOT 충돌을 만들면 rollout을 중단하고 기존 HANDOFF 구조로 복귀한다.
