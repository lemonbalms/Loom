# 카테고리 표 초안 (Phase 1 산출물 · **오너 승인 대기**)

작성 2026-07-26 · 정본 근거: [`RULE-ROUTER-PROPOSE.md`](./RULE-ROUTER-PROPOSE.md) rev-6 §5.2.1 · §10 D9
상태: **draft — 오너 승인 전에는 어떤 라우팅도 이 표를 쓰지 않는다.**

> D9 확정(2026-07-26): **카테고리 정본은 오너 선포**이며, 초안은 기존 축에서 도출한다.
> 이 문서가 그 초안이다. **표 자체도 감사 대상**이다(§5.2.1 — 오너 저작이라고 평가 면제 없음).

---

## 0. 이 표가 하는 일과 하지 않는 일

라우팅 문제는 §5.2.1에서 둘로 쪼개졌다.

| 하위 문제 | 주체 | 이 문서의 위치 |
|---|---|---|
| **(a) 카테고리 → 기본 룰셋 매핑** | **오너 선포** | **이 문서가 다루는 것** |
| (b) 이 턴이 어느 카테고리인가 | 기계 (후보 A/B/C 경쟁) | Phase 2 이후 — 여기서 다루지 않음 |

**매핑은 손으로 적지 않는다.** 레지스트리의 `surface` 필드와 카테고리를 조인해 **자동 파생**하고,
오너는 **예외와 pinned만** 관리한다(§5.2.1 비용 완화). 아래 표의 “기본 룰셋” 열은 그래서 룰 목록이
아니라 **조인 키**다.

---

## 1. 카테고리 초안 — 10개

씨앗 축(§5.2.1): `tasks/lessons/` 5개 카테고리 · 트리거 lexicon 템플릿(S·A·R·plan·no-commit·review·impl) ·
DOGFOOD 역할(arch·impl·rev) · WORKFLOW 게이트 단계. 새로 창작한 축은 없다.

| # | 카테고리 | 언제 (트리거 씨앗) | 기본 룰셋 = `surface` 조인 | 씨앗 출처 |
|---|---|---|---|---|
| 1 | `session-start` | 세션 첫 턴 · 상태 · 핸드오프 확인 · 리추얼 | `session-start` | lexicon S/A/R |
| 2 | `gate` | 게이트 판단 · 다음 액션 선택 · 정지 조건 | `gate` | WORKFLOW 게이트 |
| 3 | `planning` | PLAN/스펙 작성 · UNKNOWNS · 범위 결정 | `planning` | lexicon plan |
| 4 | `delegation` | 위임 여부·레인 선택 · 스펙 작성 · topology 판단 | `delegation` | DOGFOOD arch · lessons orchestration |
| 5 | `dispatch` | 워커 디스패치 · pane · claim · 워커 감시 | `dispatch` | lessons workers · bridge-ops |
| 6 | `implementation` | 제품/하네스 코드 작성·수정 | `implementation` | DOGFOOD impl |
| 7 | `verification` | 테스트 · 독립 검증 · 차집합 판정 · 스모크 | `verification` | lessons verification |
| 8 | `review` | R{n} · verdict · 자문 · 좌표 대조 | `review` | DOGFOOD rev · lexicon review |
| 9 | `ship` | 커밋 · 푸시 · dist · 웨이브 종료 | `ship` | lexicon no-commit 마스크 |
| 10 | `platform` | 훅 · claude-mem · 환경변수 · 호스트 배선 | `platform` · `bridge` | lessons platform |

**현재 레지스트리 커버리지** (32유닛 기준, `bun run rules:check`):

| 카테고리 | 조인되는 유닛 수 | 그중 pinned |
|---|---:|---:|
| `session-start` | 3 | 1 |
| `gate` | 5 | 4 |
| `planning` | 3 | 3 |
| `delegation` | 8 | 3 |
| `dispatch` | 10 | 0 |
| `implementation` | 3 | 1 |
| `verification` | 8 | 0 |
| `review` | 6 | 5 |
| `ship` | 3 | 1 |
| `platform` | 2 | 0 |

합 51 > 32인 것은 유닛이 다중 `surface`를 갖기 때문이다 — **다중 라벨이 정상**이다(§5.2.1 원칙 1).
**어느 카테고리에도 조인되지 않는 유닛은 0건**이다(위 10개 축이 현재 `surface` 값 전체를 덮는다).
수치는 손으로 세지 않고 레지스트리에서 계산했다 — 재현: `bun run rules:check` 후 `surface` 조인.

---

## 2. 애매 구간 — 세 원칙 (변경 없이 그대로 적용)

1. **애매하면 판정하지 말고 합집합.** 카테고리는 배타 분류가 아니다(위임 + ship 동시 성립).
2. **어느 카테고리에도 안 맞으면 UNKNOWN → 전량**(P4). 임의 카테고리로 흡수하지 않는다.
3. **LLM의 자리는 “선택”이 아니라 “순위”** — 합집합이 예산을 넘을 때의 정렬뿐이다(D8 add-only와 정합).

**pinned는 카테고리와 무관하게 항상 포함된다.** 현재 pinned 13건은 전부 `grade-J` 자동 pin이며,
카테고리 매핑이 무엇이든 빠지지 않는다.

---

## 3. 오너가 결정할 것 — 3건

### 3.1 카테고리 목록 확정

위 10개를 그대로 선포할지, 통폐합할지(예: `gate`를 `session-start`에 흡수), 축을 더할지.
**권고: 10개 그대로.** 전부 리포에 이미 있는 축이고, `surface` 값과 1:1이라 조인이 자명하다.

### 3.2 재량 pin 선포 — 현재 **0건**

D3는 pin을 3원천으로 분해했고, 자동 pin(J·무성-deny H) 외의 pin은 **오너 선포 + 리뷰어 감사**가
필요하다. 코드가 이를 강제하므로(`derivePin`), 아래 후보는 **오너가 선포하지 않는 한 라우팅 대상**이다.

| 후보 유닛 | 현재 등급 | 선포를 검토할 이유 | 선포 안 하면 |
|---|---|---|---|
| `traps.card-done` | A | propose §5.1이 이 유닛을 `pin: true` 예시로 든다 — “완료 오판정은 치명” | 라우팅 가능 — dispatch/verification 턴에만 도달 |
| `orch.card-done` | A | 같은 규칙의 CLAUDE.md 판(인과 주의·종료 코드 오판정) | 동상 |
| `traps.watch-card` · `orch.watch-card` | A | 감시 도구 오용이 **거짓 성공 보고**를 낳은 실증(2026-07-20) | 동상 |
| `traps.coordinate-tree` | A | 좌표 오독이 R45에서 “옳은 것을 틀린 것으로” 보이게 함 | review/verification 턴에만 도달 |

**권고: 이번엔 선포하지 않는다.** 이유는 §6.5.3의 사전등록 정신과 같다 — 지금 pin을 늘리면
라우팅 대상이 줄어 **Phase 2 replay가 측정할 것이 없어진다**. 위 후보들은 전부 dispatch/verification
카테고리에 조인되므로, 그 턴에서는 어차피 도달한다. **측정 후에 pin을 늘리는 것이 순서다.**

### 3.3 예외 매핑

“이 카테고리에는 이 유닛을 추가로 넣어라 / 빼라”는 예외. **현재 제안 없음** — 조인만으로 충분하며,
예외는 M7 측정에서 미분류·누락이 실제로 나온 뒤 추가하는 것이 §5.2.1 유지보수 원칙에 맞다.

---

## 4. 미측정 — 이 표가 주장하지 않는 것

- **커버리지(M7)는 미측정이다.** §1의 유닛 수는 “등록된 32개가 어떻게 조인되는가”일 뿐,
  실제 턴의 몇 %를 덮는지가 아니다. M7 초기값은 Phase 2 replay에서만 나온다.
- **32유닛은 규범 자산의 전량이 아니다.** `tasks/lessons/*.md`(129KB) · `docs/WORKFLOW.md` ·
  `docs/DOGFOOD_LOOP.md`는 아직 유닛으로 등록되지 않았다. 파일 digest도 아직 걸려 있지 않으므로
  **그 파일들의 변경은 현재 `rules:check`가 잡지 못한다** — 등록 확대는 Phase 1 후속 작업이다.
- **합집합 예산 압력도 미측정이다**(§11). 조인 결과가 예산을 자주 넘는지는 Phase 2에서 안다.

---

## 5. 승인 후 무엇이 바뀌나

승인되어도 **주입 경로는 바뀌지 않는다.** 이 표는 Phase 2 replay의 **명세 ground truth**로 쓰인다
(§5.2.1 이득 1). 주입 변경은 Phase 3이고, 그 전에 PreToolUse 비차단 주입 PoC 실측이 선결이다(F1).

[RULE-CATEGORIES-DRAFT] categories=10 units=32 pinned=13 owner-pin-proposed=0 exceptions=0 status=draft
