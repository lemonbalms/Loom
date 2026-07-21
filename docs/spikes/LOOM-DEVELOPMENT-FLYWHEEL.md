# Loom Development Flywheel — 제품 개발 × 도그푸딩 × 에이전트 하네스

| Field | Value |
|---|---|
| **Status** | **proposal / non-normative** |
| **Date** | 2026-07-22 |
| **Scope** | Loom 제품 개발 과정과 그 과정에서 추출되는 에이전트 하네스의 통합 관리 모델 |
| **Does not override** | `docs/PLAN.md`, `docs/plan_review.md`, `docs/WORKFLOW.md`, `docs/DOGFOOD_LOOP.md`, `HANDOFF.md` |

> 이 문서는 향후 로드맵·핸드오프·컨텍스트·메모리·이력·권한 관리 체계를 정리하기 위한
> **설계 제안서**다. 현재 제품 게이트나 다음 액션을 변경하지 않는다. 정식 운영 규칙으로
> 채택하려면 Owner 방향 결정과 `docs/WORKFLOW.md` 갱신이 별도로 필요하다.

---

## 1. 목적

Loom 프로젝트는 단순히 협업 제품 하나를 만드는 데서 끝나지 않는다.

> **Loom을 만들고, Loom으로 Loom 개발을 수행하며, 그 과정에서 반복 검증된 개발·운영 방식을
> 재사용 가능한 에이전트 하네스로 축적한다.**

따라서 제품 개발과 하네스 개발은 서로 독립된 두 트랙이 아니라 하나의 순환 구조다.

```text
Loom 기능 개발
  → Loom으로 실제 개발·리뷰·검증 수행
  → 마찰·실패·재범을 관측
  → 규칙·도구·권한 계약으로 추출
  → 다음 Loom 개발에서 재사용
```

이 문서에서 이 순환의 관리 단위를 **학습 루프(learning loop)** 라고 부른다.

---

## 2. 기존 프로젝트와의 경계

이 설계가 채택되더라도 기존 SSOT의 권한은 다음과 같이 유지한다.

| 문서 | 계속 소유하는 것 | 이 설계가 침범하지 않는 것 |
|---|---|---|
| `docs/PLAN.md` | 현재 버전의 제품 변경·구현 범위·락·게이트 | 장기 방향을 이유로 현재 승인 PLAN을 재해석하지 않음 |
| `docs/plan_review.md`·리뷰 원장 | R{n} verdict·finding·blocking | 로드맵 상태로 리뷰를 우회하지 않음 |
| `docs/WORKFLOW.md` | 작업·리뷰·검증·ship 절차 | 본 제안만으로 새 의무를 만들지 않음 |
| `docs/DOGFOOD_LOOP.md` | Loom room을 통한 구현·리뷰 레인 절차 | 도그푸딩 실행 절차를 중복 서술하지 않음 |
| `HANDOFF.md` | 현재 세션 체크포인트와 다음 게이트 | 장기 로드맵이나 작업일지를 다시 적재하지 않음 |
| `tasks/lessons/*` | 재범 방지 교훈과 실증 경위 | 로드맵이 lessons를 요약 SSOT로 대체하지 않음 |

향후 `docs/ROADMAP.md`가 생기더라도 소유 범위는 **제품·하네스의 장기 결과와 현재 학습 루프의 위치**로
제한한다. 구체적인 PATCH·테스트·락은 PLAN에만 둔다.

---

## 3. 학습 루프 모델

각 루프는 세 가지 산출물과 하나의 재사용 판정을 가진다.

| 축 | 질문 | 대표 산출물 |
|---|---|---|
| **Product** | Loom 사용자에게 무엇이 달라지는가? | 제품 코드·계약·PLAN 게이트 |
| **Dogfood** | Loom으로 Loom을 만들며 무엇을 실제 검증했는가? | 라이브 실행·실패 재현·독립 검증 증거 |
| **Harness** | 어떤 개발·운영 능력으로 추출할 수 있는가? | lint·hook·runtime guard·상태/권한 계약 |
| **Reuse** | Loom 밖에서도 쓸 수 있다고 입증했는가? | 독립 fixture 또는 두 번째 프로젝트의 재사용 증거 |

### 3.1 축별 성숙도

```text
Product : proposed → designed → implemented → verified
Dogfood : planned  → observed → validated
Harness : documented → repo-enforced → portable → reused
```

- `repo-enforced`는 Loom 저장소 안에서 코드로 강제된 상태다.
- `portable`은 Loom 전용 경로·이름·상태에 묶이지 않은 계약이 존재하는 상태다.
- `reused`는 Loom과 분리된 fixture 또는 다른 프로젝트에서 실제로 동작한 상태다.
- Loom 내부에서 한 번 성공한 규칙은 `portable`이나 `reused`로 간주하지 않는다.

### 3.2 루프 종료 조건

모든 제품 변경이 범용 하네스를 만들어야 하는 것은 아니다. 루프가 닫히려면 다음이 성립해야 한다.

1. Product 결과와 검증 증거가 PLAN의 완료 정의를 충족한다.
2. Dogfood에서 관측된 사실과 추정이 구분되어 기록된다.
3. 반복 가능한 교훈이 있으면 `tasks/lessons/*`에 남는다.
4. 하네스 일반화 여부를 다음 중 하나로 명시 판정한다.
   - 코드로 강제한다.
   - 문서 규칙으로 유지한다.
   - Loom 전용 구현으로 남긴다.
   - 일반화 가치가 없어 종결한다.
5. `portable`을 주장할 경우 Loom 독립 검증 증거가 있다.

---

## 4. 하네스 지식의 승격 경로

하네스는 처음부터 범용 프레임워크로 설계하지 않는다. Loom 도그푸딩에서 얻은 증거를 단계적으로
승격한다.

```text
실행 증거
  → 작업 이력(WORKLOG 후보)
  → 재사용 교훈(tasks/lessons)
  → 문서 규칙
  → lint / hook
  → runtime 권한·상태 가드
  → portable contract
  → 다른 프로젝트에서 reuse
```

권한 확대, 완료 확정, 데이터 삭제처럼 위반 비용이 큰 규칙은 문서만으로 끝내지 않는다. 재범 또는
다중 레인 실증이 생기면 `lint → hook → runtime guard` 순으로 강제 수준을 올린다. 반대로 단일 사례를
근거로 Loom의 현재 관례를 범용 계약으로 고정하지 않는다.

### 일반화 후보의 최소 조건

다음 중 하나 이상을 만족할 때만 하네스 일반화 후보로 승격한다.

- 같은 실패가 두 번 이상 재발했다.
- 서로 다른 모델·레인·플랫폼에서 같은 구조로 발생했다.
- 문서에 기록했지만 다시 위반됐다.
- 다음 Loom 개발 루프에서도 반복적으로 필요한 능력이다.
- 위반 시 권한 오용·거짓 완료·데이터 손실 같은 큰 피해가 발생한다.

---

## 5. 로드맵 관리 모델

정식 로드맵이 도입되면 기능 목록이 아니라 **학습 루프의 진행 상태**를 보여줘야 한다.

### 5.1 로드맵의 최소 구조

```markdown
# Loom Development Flywheel

## Mission
## Current position
## Primary loop
## Supporting harness loop
## Proven capabilities
## Candidate loops — ordering not committed
## Owner decision queue
```

운영 WIP는 다음을 기본으로 한다.

- **Primary loop:** 사용자 결과를 만드는 주 제품 루프 1개
- **Supporting harness loop:** primary의 실행 품질을 높이는 하네스 루프 최대 1개
- **Candidate loops:** 우선순위가 확정되지 않은 후보. `Next`로 부르지 않는다.

PATCH마다 로드맵을 갱신하지 않는다. 루프 시작·방향 변경·종결·Owner 우선순위 결정 시에만 갱신한다.

### 5.2 식별자

기존 R{n}, M-{n}, U{n}, G-{n}, Phase/Milestone 번호와 충돌하지 않도록 의미 기반 식별자를 쓴다.

- `LOOP-COMPLETION-AUTHORITY`
- `LOOP-SESSION-CONTINUITY`
- `CAND-DELIVERY-RECOVERY`
- `CAND-PANE-CLEANUP`
- `CAND-PANE-LIFECYCLE`

번호는 순서를 암시하므로 Owner가 순서를 확정하지 않은 후보에는 사용하지 않는다.

---

## 6. 현재 프로젝트에 대입한 위치

이 절은 현재 상태를 설명하기 위한 **비규범 스냅샷**이다. 정본은 PLAN·HANDOFF다.

### 6.1 Primary — `LOOP-COMPLETION-AUTHORITY`

| 축 | 현재 위치 |
|---|---|
| **Product** | `docs/PLAN.md` v0.28.0 approved · PATCH 1 착수 전 |
| **Dogfood** | 가짜 `done`, pane 조기 정리, ACK·quarantine 경계 결함이 실제 Loom 개발 레인에서 관측됨 |
| **Harness** | 완료 권한·실행자/검증자 분리·불확실 관측의 회복 가능성 불변식이 설계됨; 코드 강제는 구현 예정 |
| **Reuse** | Loom 독립 검증 없음 · portable 주장 금지 |

**Product 결과:** 원격 워커와 브릿지는 완료를 제안할 수 있지만, 사람의 확인 없이 card가 `done`이
되거나 card pane이 자동 정리되지 않는다.

**Harness 추출 후보:**

- 실행자·검증자·완료 권한의 분리
- 미확정 결과의 durable unresolved 보존
- 불확실한 관측은 복구 가능한 행동만 유발
- 비가역 행동은 결정적 증거 또는 멱등 경로에서만 수행
- 결과 provenance와 상태 전이의 독립 검증

**이 루프가 주장하지 않는 것:** delivery liveness 완결, wire exactly-once, 자연사 pane 관측,
자동 cleanup, conv 결과 경로 완결. 이 경계는 PLAN v0.28.0의 정직성 절을 그대로 따른다.

### 6.2 Supporting — `LOOP-SESSION-CONTINUITY`

| 축 | 현재 위치 |
|---|---|
| **Trigger** | HANDOFF 팽창·stale todo/review pointer·컨텍스트 예산·hook 순서 문제 |
| **Dogfood** | Loom 개발 세션에서 상태 복원 비용과 드리프트가 반복 관측됨 |
| **Harness** | session status·부분 읽기·lessons/traps 주입·예산 lint가 존재하나 강제와 정합성은 부분 완성 |
| **Reuse** | Loom 저장소 전용 · portable 주장 금지 |

향후 역할 분리 후보:

- `HANDOFF.md` — 현재 체크포인트
- `WORKLOG` — 실행·실패·검증 이력
- `tasks/lessons/*` — 일반화된 기억
- context injector — 필요한 상태·기억의 선택적 주입
- lint/hook — 구조·예산·권한 규칙 강제

### 6.3 순서 미확정 후보

- `CAND-DELIVERY-RECOVERY` — durable outbox·재전송·apply receipt
- `CAND-PANE-CLEANUP` — cleanup grant·pane GC
- `CAND-PANE-LIFECYCLE` — 자연사 관측·reconcile
- `CAND-CONTEXT-MEMORY-PORTABILITY` — 프로젝트 독립 컨텍스트·메모리 계약
- `CAND-PERMISSION-PROFILES` — 역할·도구·변경 권한의 이식 가능한 프로필

이 목록은 우선순위가 아니다. 기존 `tasks/todo.md`의 "다음 대형 트랙 = Owner 결정"과 신규 기능
FREEZE를 유지한다.

---

## 7. 핸드오프·컨텍스트·메모리·이력·권한의 관계

| 능력 | 책임 | 저장해야 하는 것 | 저장하면 안 되는 것 |
|---|---|---|---|
| **로드맵** | 전체 루프와 장기 결과 | 현재 primary·후보·성숙도·증거 링크 | PATCH 상세·작업일지 |
| **핸드오프** | 다음 세션 부팅 | 현재 게이트·불변식·blocker·다음 액션 | 완료된 긴 역사 |
| **컨텍스트** | 현재 판단에 필요한 정보 공급 | 상태·선택된 교훈·활성 함정 | 전체 저장소 요약 |
| **메모리** | 반복되는 판단·교훈 보존 | 재범 조건·복구 절차·검증된 규칙 | 검증되지 않은 세션 서사 |
| **이력** | provenance와 조사 복원 | 실행·실패·테스트·커밋·판정 경위 | 현재 상태의 SSOT 주장 |
| **권한** | 비가역 행동과 완료 결정 통제 | 역할·허용 행동·승인·검증 경계 | 자연어 관례만으로 된 고위험 허가 |

이 능력들은 별도 문서 프로젝트가 아니라 학습 루프를 다음 세션과 다음 프로젝트로 전달하기 위한
하네스의 서로 다른 층이다.

---

## 8. 점진 적용안

기존 문서를 한 번에 이동하지 않는다.

1. **본 제안 검토:** Mission·학습 루프·식별자·일반화 기준을 Owner가 검토한다.
2. **정식 ROADMAP 초안:** 기존 PLAN을 수정하지 않고 얇은 `docs/ROADMAP.md`를 추가한다.
3. **수동 운영:** 두 번 이상의 루프 전환 동안 자동 파서 없이 문서 경계를 검증한다.
4. **이력 분리:** HANDOFF에서 완료 서사를 WORKLOG 후보로 이동하되 기존 archive와 리뷰 좌표를 보존한다.
5. **정책 승격:** 안정된 규칙만 `docs/WORKFLOW.md`에 반영한다.
6. **자동화:** 형식이 안정된 뒤 strict front matter·lint·`bun run status` 연동을 추가한다.
7. **이식 검증:** Loom 독립 fixture 또는 다른 프로젝트에서 검증된 능력만 portable/reused로 승격한다.

기존 PLAN의 오래된 Milestone map과 리뷰 좌표는 초기 도입에서 삭제하거나 이동하지 않는다. 필요 시
`legacy snapshot` 표기와 정식 ROADMAP 링크만 추가하고, 역사 좌표 보존을 우선한다.

---

## 9. 성공 조건과 실패 신호

### 성공 조건

- 새 세션이 제품 위치와 하네스 위치를 각각 한 줄로 설명할 수 있다.
- 제품 PATCH가 어느 dogfood 증거에서 출발했는지 추적할 수 있다.
- lessons의 반복 규칙이 언제 문서에서 코드 강제로 승격됐는지 보인다.
- Loom 전용 규칙과 portable harness 계약이 구분된다.
- 로드맵이 PLAN·HANDOFF·WORKLOG의 내용을 복제하지 않는다.

### 실패 신호

- ROADMAP이 버전별 changelog나 todo 목록으로 팽창한다.
- 후보를 Owner 결정 없이 `Next`로 고정한다.
- 한 번 관측한 Loom 관례를 portable 규격으로 선언한다.
- 하네스 작업이 사용자 결과 없이 장기간 primary loop를 점유한다.
- 같은 상태·다음 액션이 PLAN·ROADMAP·HANDOFF 세 곳에 중복된다.
- 문서 규칙 위반이 반복되는데도 실행 경로 강제로 승격하지 않는다.

---

## 10. Owner 결정이 필요한 항목

정식 채택 전에 다음만 결정하면 된다.

1. Mission 문구를 프로젝트 상위 목적으로 채택할지
2. Primary 1개 + Supporting harness 1개 WIP 제한을 적용할지
3. 하네스 portable 판정에 두 번째 프로젝트 실증을 필수로 둘지
4. 정식 문서명을 `docs/ROADMAP.md`로 할지, flywheel 성격을 이름에 드러낼지
5. 후속 A/B/C와 제품화 후보의 우선순위를 언제 결정할지

이 결정 전까지 본 문서는 proposal이며, 현재 v0.28.0 구현 순서와 HANDOFF의 PATCH 1 다음 액션은
그대로 유지한다.
