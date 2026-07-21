# HANDOFF-CHECKPOINT-DESIGN 적대 리뷰 (인라인, 비-R{n})

> **재리뷰 (2026-07-22, 개정판 대상): APPROVE** — 하단 [재리뷰 원장](#재리뷰-2026-07-22-개정판) 참조.
> 아래 본문은 1차 리뷰(PENDING-REVISION) 원장으로 보존한다. 사실관계 보정은
> [1차 리뷰 정오표](#1차-리뷰-정오표)를 따른다.
> **Owner adoption (2026-07-22):** bounded Phase B→C를 PANE-DEATH PATCH 1 전에 선행하고,
> 새 세션 복원 스모크 후 PATCH 1로 복귀한다. Phase D는 실제 PATCH 전환 2회 뒤로 유예한다.

| Field | Value |
|---|---|
| **Target** | [`HANDOFF-CHECKPOINT-DESIGN.md`](./HANDOFF-CHECKPOINT-DESIGN.md) |
| **Date** | 2026-07-22 |
| **Reviewer** | 아키텍트 세션 (Fable 5) — opus 증거 레인 실측 + fable-advisor 독립 리뷰 교차 대조 |
| **Advisor** | fable-advisor consulted: **yes** (read-only) |
| **성격** | 세션 인라인 적대 리뷰. `docs/plan_review.md` 미기록 — 정식 R{n} 승격은 claude-rev 경로 |

## Verdict

**PENDING-REVISION** — §14의 핵심 4원칙(체크포인트≠작업일지 · 이력 분리+손실 검증 · 4축 위치 구분 · 수동 안정화 후 자동화)은 현행 리포 구조와 정합하고 성립한다. 결함은 본문 원칙이 아니라 **검증 계획(V4/V5)의 커버리지 구멍과 마이그레이션 순서**에 집중돼 있다. High 1 · Medium 5 · Low 3.

## Findings

| Severity | ID | Finding | Evidence | Required change |
|---|---|---|---|---|
| **High** | F1 | **V4 동등성 집합·V5 복원 테스트 입력에 traps 채널 누락.** 자동 주입(`--part state`)은 `tasks/traps.md`의 "활성 함정·하지 말 것" 본문을 넣지만, V5 입력 3종(HANDOFF·status·AGENTS)과 V4 동등성 목록에는 traps가 없다. §6.1이 HANDOFF 내 함정 중복을 금지하므로, 무훅 세션과 V5 복원 모델은 "M-lock 인접 PATCH 무리뷰 착수 금지" 같은 게이트 오실행 방지 정보를 잃는다 — §0 severity 정의상 High("잘못된 게이트 실행") | 설계 :482-500 vs `scripts/session-context.ts:141-149,176` | V5 입력에 `tasks/traps.md` 추가, V4 동등성 집합에 traps 명시 |
| Medium | F2 | **섹션 헤딩 이원화 + fail-open이 조용한 주입 탈락을 만든다.** 현행 추출은 `## ⭐ Current action (read first)`를 하드코딩하는데 새 템플릿은 `## Current action` — 불일치 시 추출이 null이 되고 fail-open(exit 0 무출력)이라 핵심 섹션이 **무경고로 사라진다**. V6 주입 케이스에 "헤딩 개명→주입 누락"이 없고, Phase C("추출 동기화")와 D("대상 섹션 갱신")의 책임이 중복 | `session-context.ts:167-171,264-267` · 설계 :429-437, :505-513 | lint 섹션 목록·추출 헤딩을 단일 공유 상수로 강제, V6에 헤딩 개명 주입 추가, C/D 책임 단일화 |
| Medium | F3 | **중간 이력 수납처 공백.** §7 상태기계는 실행·실패·검증을 "WORKLOG/archive에 누적"하라지만, WORKLOG는 비목표+Open decision 3 미결이고 ARCHIVE의 현행 계약은 "종결 웨이브 이관"(L15)이지 진행 중 실패 로그가 아니다 — Phase C 전환 시 조용한 유실 경로 | 설계 :318-326, :130, :537 | Phase C 선행조건에 결정 3 종결 명시 + 잠정 수납처 계약 1줄 |
| Medium | F4 | **WORKFLOW.md 개정 누락 — 유일한 실질 SSOT 충돌.** WORKFLOW §0.3이 HANDOFF 형상을 "Where we are, next steps, resume prompt"로 규정하는데 새 템플릿은 이 섹션들을 폐지한다. Phase C 목록에 WORKFLOW 개정이 없어 채택 즉시 문서 간 충돌 | `docs/WORKFLOW.md:38` vs 설계 :426-430 | Phase C에 WORKFLOW 해당 조항 개정 추가 |
| Medium | F5 | **오너 결정 대기 채널 부재.** 현행 다음 액션 1·3·4(flake 트랙·RULE-ENFORCEABILITY·brief 처리)는 blocker도 current action도 아닌 "오너 결정 대기"인데, 새 필수 섹션과 V2 손실 검증 목록 어디에도 이 부류의 자리가 없다 — candidate 링크로 강등되면 결정 대기 salience 유실 | `HANDOFF.md:35-38` vs 설계 :169-180, :459-468 | Active checks 또는 별도 owner-pending 슬롯 규칙 + V2 목록 반영 |
| Medium | F9 | **state part 예산 산술 미검토.** HARD_CAP 9,500은 **파트별** 적용이다. V4가 요구하는 대로 HANDOFF 5개 섹션(최대 8,192B의 대부분) + traps 본문(현행 2,217B) + status를 전부 state part에 넣으면 산술상 9,500을 넘을 수 있고, 절단은 꼬리부터라 **주입 순서상 마지막인 traps가 먼저 조용히 잘린다**(F1의 자동 주입판). 현행 state는 4,363B라 여유가 있지만 설계는 이 합산을 검토하지 않았다 | `session-context.ts:32`(HARD_CAP)·`:176-177`(traps가 꼬리) · 설계 §8·V4 | Phase B fixture에 state part 합산 바이트 실측·상한 검사 추가 |
| Low | F6 | Blockers 템플릿이 빈 표 헤더와 `(none)`을 동시 예시 — §9.2 필수 실패 조건("(none)도 아니고 구조화도 아님") 판정 모호 | 설계 :242-247 vs :389 | 둘 중 하나로 정정 |
| Low | F7 | One-line resume에 PLAN version/status 인라인 — "정본 재서술 금지" 목표·§9.2 반복 경고와 자기긴장. V1 일치검사로 상쇄되나 lint 예외 미명시 | 설계 :208 vs :116, :396 | One-line의 lint 예외 규칙 1줄 |
| Low | F8 | Open decision 1 수치 부정확: "현행 top-80/16,384B 이중 한도" — 실제는 **top-80→8,192B / 전체→16,384B**. 제안 8,192B가 현행 top-80 예산과 같은 값이라는 사실이 결정 판단에 중요한데 누락 | `session-status.ts:11-13` vs 설계 :535 | 수치 교정 |

## SSOT conflicts

- F4 하나가 실질 충돌. §3 소유권 표 자체는 현행 구조와 정합 — `tasks/traps.md`·`todo.md` 실존, §9.1의 status 정보원 분리도 현행 `buildStatus` 구조와 일치(`session-status.ts:28-66`).

## Information-loss risks

- F1(무훅·V5 경로의 활성 함정) · F3(진행 중 실행·실패 서사) · F5(오너 결정 대기) · F9(자동 주입 절단).
- 추가: 현행 `<details>` 6개 안의 오너 구두 지시·기각 이력은 V2가 "비역사 핵심"만 매핑하므로 검증 범위 밖 — §6.1의 "독립 diff 리뷰"가 이를 명시적으로 포함해야 한다.

## Baseline 실측 (§1.1 요구 — 채택 여부와 별개 기록, 2026-07-22)

- 설계가 리뷰어에게 요구한 앵커 명령·파일은 **전부 실재** — `handoff:lint`·`session-context:lint`는 기존 명령이고(`package.json:23-24`) §9.2는 그 확장 제안이라 자기모순 아님.
- **baseline red 2건 (설계와 무관한 별도 수정 대상)**:
  1. `bun run handoff:lint` **exit 1** — top-80 = 14,754B > 8,192B. 전체 23,552B로 FILE_BUDGET 16,384B도 산술상 초과.
  2. `env -u LOOM_RELAY_TOKEN -u LOOM_RELAY_URL bun test scripts/session-context.test.ts` **34/35** — `6ccf49f`의 SOFT_CAP 8500→12750 완화가 테스트(`:371`)에 미반영.
- `bun run session-context:lint` PASS (SOFT_CAP 12,750 완화 하).
- **부수 발견(설계 §9.3 방향을 지지)**: 현행 `session-status.ts:41-46` openBlock 파서는 review 표 형상이 깨지면 `"없음"` 반환 — **거짓 no-blockers**. V6의 table→bullet 주입이 현행 코드에서 실제로 조용히 통과하므로 fail-loud 전환 주장이 실증됨.
- **provenance 주의**: 설계 문서 2본(`HANDOFF-CHECKPOINT-DESIGN.md`·`LOOM-DEVELOPMENT-FLYWHEEL.md`)이 untracked·커밋 이력 0 — rewind 유실 전례가 있으므로 개정 전이라도 커밋 권고.
- H7(전체 8,192B 한도 실행 가능성)은 **feasible 판정** — 현행 Current action 본문 실측 2,962B + resume 377B ≈ 3.3KB.

## Unverified

- Claude Code SessionStart 10,000자 플랫폼 절단의 현재 거동(문서 근거만, 재실측 안 함).
- V5 복원 테스트의 실효성(모델 의존 — 설계 문면으로 판정 불가).
- 무훅 Codex 실세션의 실제 읽기 경로(AGENTS 규칙 문면만 대조).

## Minimal revision set

1. V5 입력에 `tasks/traps.md` 추가 + V4 동등성 집합에 traps 명시 (F1)
2. lint/추출 헤딩 단일 공유 상수 + Phase C/D 책임 단일화 + V6에 헤딩 개명 케이스 (F2)
3. Phase C 선행조건 = Open decision 3 종결 + 잠정 수납처 1줄 (F3), Phase C에 WORKFLOW 개정 추가 (F4)
4. owner-pending 슬롯 규칙 + V2 반영 (F5), Phase B fixture에 state part 합산 실측 (F9)
5. 문면 정정 3건: Blockers 템플릿(F6) · One-line lint 예외(F7) · 결정 1 수치(F8)

---

## 1차 리뷰 정오표

1차 verdict와 finding 원문은 provenance를 위해 위에 보존하되, 다음 사실관계는 이 정오표가 우선한다.

- **F2 실행 거동:** heading 불일치는 예외를 던져 전체 stdout을 없애는 경로가 아니다. 해당 섹션
  추출만 `null`이 되어 `Current action`이 빠진 나머지 state payload가 exit 0으로 출력된다. 핵심
  섹션의 조용한 탈락이라는 위험과 처방은 그대로 유효하다.
- **F9 예산 수치·가시성:** 당시 `tasks/traps.md` 전체 파일은 2,217B였지만 실제 state 주입분은
  1,820B였다. 또한 자체 `truncateContext` 절단은 앞쪽 경고를 표시하므로 조용하지 않다. 다만
  꼬리의 traps 정보가 유실될 수 있다는 합산 예산 위험과 측정 게이트 처방은 그대로 유효하다.
- **provenance 시점:** 1차 리뷰의 “설계 문서 2본 untracked·커밋 이력 0”은 **리뷰 당시** 관측이다.
  이후 두 문서와 본 리뷰는 `2522442`에 커밋됐다.

---

# 재리뷰 2026-07-22 개정판

**Verdict: APPROVE**

**대상:** `2522442` 이후 워킹트리 개정판(+52/−14). **방법:** diff 전수 대조(F1~F9 요구 변경 ↔ 반영 지점) + 개정판이 새로 도입한 사실 주장 2건의 코드 실측.

## 반영 판정 (9/9 해소)

| ID | 판정 | 반영 지점 |
|---|---|---|
| F1 (High) | **해소** | V4에 traps 본문·무훅 traps 부분 읽기 명시, V5 입력 4번에 `tasks/traps.md` 추가 |
| F2 | **해소** | §9.2 `REQUIRED_HANDOFF_HEADINGS` 단일 공유 상수 · Phase C 원자 전환으로 책임 단일화(중복이던 Phase D "대상 섹션 갱신" 제거) · V6에 heading 개명 주입 2건 추가 |
| F3 | **해소** | §7 수납처를 "Open decision 3에서 확정"으로 결속 · Phase C 선행조건 + 전환기 잠정 수납처(`In progress evidence` 구획, 종결 이력과 분리) |
| F4 | **해소** | Phase C에 `docs/WORKFLOW.md` §0.3 형상 계약 개정 추가 |
| F5 | **해소** | `Owner pending` 필수 섹션 신설(계약·템플릿 표 `Safe default while pending` 포함) · §5.1에 현행 3건 명시 · V2 목록 반영 |
| F9 | **해소** | §8 예산 산술 명문화 + Phase B fixture에 state part 합산(문자열 길이·UTF-8 바이트) 실측 및 `truncateContext` 적용 전 `state.length <= HARD_CAP` 게이트 · V4에 절단 미발생 조건 |
| F6 | **해소** | Blockers `(none)` 단독 ↔ 표 교체 규칙 명문화(동시 표기 금지) |
| F7 | **해소** | One-line resume PLAN 1회 표기 = lint 탐색용 예외, 반복 시 경고로 정리 |
| F8 | **해소** | Open decision 1·§8 수치 교정(top-80 8,192B / 전체 16,384B) + 제안 8,192B와 현행 top-80 동치·범위 상이 명시 |

## 신규 사실 주장 실측 (개정판이 도입한 서술 — 둘 다 코드 일치)

1. **"HARD_CAP은 UTF-8 바이트가 아니라 JS 문자열 길이 적용"** — 일치. `truncateContext`는 `text.length` 기준(`session-context.ts:120-133`, HARD_CAP=9500 `:32`).
2. **"초과 시 절단 경고가 앞에 표시되지만 꼬리 유실"** — 일치. head에 `⚠ … 예산 초과` 프리픽스 후 `text.slice(0, keep)`로 꼬리 절단(`:131-133`).

## 신규 결함

**0건.** 1차 리뷰의 우려(축자 반영이 새 모순을 만드는 패턴)에 해당하는 지점 없음 — F2·F9 처방이 문안 덧대기가 아니라 공유 상수·측정 게이트(불변식형)로 반영됐다.

## 잔여 노트 (비차단, 코드 측)

- `truncateContext` 경고 문구가 `tasks/lessons.md 정리 필요`로 하드코딩(`:125,:132`) — state part 절단 시 오도 가능. Phase D 구현 시 part별 문구로 교정 권고.
- 1차 리뷰 baseline red 2건(handoff:lint top-80 초과 · test D4 SOFT_CAP 미동기)은 여전히 유효 — 본 설계와 무관한 별도 수정 대상.

## 한정

APPROVE는 **설계안으로서의 승인**이며 Owner는 2026-07-22 bounded Phase B→C rollout을 채택했다.
구체 결정 D1~D7과 실행 순서는 설계 §13이 정본이다. 본 리뷰는 제품 PLAN v0.28.0의 의미·락을
변경하거나 Phase D 조기 착수를 허가하지 않는다.
