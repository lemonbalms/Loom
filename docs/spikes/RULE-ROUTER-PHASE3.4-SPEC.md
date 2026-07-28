# Phase 3.4 착수 명세 — platform surface JIT (후보 A)

작성 2026-07-28 · **rev-1** · 레인: 본세션(topology `single`)  
Authority: [`RULE-ROUTER-PHASE3-SPEC.md`](./RULE-ROUTER-PHASE3-SPEC.md) rev-1 §2  
( **3.4+ 기타** · 3.3 RESULT 후) ·  
[`RULE-ROUTER-PHASE3.3-RESULT.md`](./RULE-ROUTER-PHASE3.3-RESULT.md) rev-1  
(T1 FAIL · secret-shaped COMPLY 교훈) ·  
[`RULE-ROUTER-PHASE3.1-SPEC-REV.md`](./RULE-ROUTER-PHASE3.1-SPEC-REV.md) H1  
(isolation = **absence not negation**)

> **3.3 FAIL ≠ 3.3 PREREG 재측정.** 3.4는 **별 SPEC + PREREG**.  
> **3.4 카나리아 통과 전** platform live inject **금지**.  
> 기존 live surfaces(delegation/ship/dispatch) 불변 · implementation live **false 유지**.  
> **default-on 금지.** 봉인 F1*/3.0–3.3 PREREG **재개방 금지**.  
> verification/review/gate = prefix 1차 유지 (**Out**).

---

## 0. 한 줄

**Bash PreToolUse**에서 후보 A가 고른 **platform 프로세스 규범**을 append-only 주입한다.  
1차 카나리아 유닛 = **`traps.claude-mem-patch`** (관측 가능 명령 형태:  
`check:mem-header` / `check-mem-header`).  
**시크릿·export·토큰 이름 COMPLY 금지** (3.3 실패 교훈).

---

## 1. 범위

| In | Out |
|---|---|
| surface=`platform` · matcher **실측 Bash** | 3.0–3.3 PREREG 재개방 · 3.3 remeasure |
| canary fixture `traps.claude-mem-patch` · live non-pin `surface`∋`platform` | pin JIT · pin=충돌 회피 (M-1) |
| opt-in 공유 플래그 · **surface별 live 게이트** | platform default-on · secret-shaped COMPLY |
| C1–C3 · 추출기 본문 · receipt · H1 | U2 · verification/review/gate JIT · implementation live flip |

**Harness claim:** Claude Code only.

**왜 platform (RESULT §5 채택):**  
3.3 COMPLY가 “relay-token export” 형태라 모델 방어와 충돌(시크릿 낚시 오판).  
`check:mem-header`는 **공개 회귀 검사 명령** · 3.1/3.2 동형의 **명령 형태** 채점.

---

## 2. 유닛 집합 (non-pin · `surface`∋`platform`)

| id | grade | cost≈ | 역할 |
|---|:---:|---:|---|
| **`traps.claude-mem-patch`** | **A** | **88** | **canary fixture** · live |

`bridge` 라벨 유닛은 이 슬라이스 선택 집합에 **넣지 않음** (`surface`∩`platform`만).

**본문 고정 (registry):**

```
- **claude-mem 패치 비영속**(`autoUpdate` 원복) — 방어선 `check:mem-header`, 재적용 lessons platform.
```

- sha8: **`5dc579d1`**  
- 훅 하드코딩 금지 · 추출기 SSOT

---

## 3. C1 함정

PreToolUse `additionalContext` = **tool_result 이후** 가시.  
→ 그 Bash를 교정했다고 쓰지 않는다.

3.4 카나리아 = **2-step**:

1. `echo P34_READY` → 주입 가시  
2. 후속 “claude-mem 헤더가 날짜만인지 검사” Bash에서 **명령 형태** COMPLY

---

## 4. 주입 계약

| # | 규칙 |
|---|---|
| 1–5 | 3.0 §3 승계 (exit 0 · C1–C3 · append-only · 추출기) |
| 6 | Receipt: **surface=platform** · slice=3.4 |
| 7 | pin 제외 (M-1) |

### 4.1 도구 레인

| 도구 | canary | dry-run / live |
|---|---|---|
| `Agent`\|`Task` | 3.0 fixture | delegation |
| `Bash` | 기본 ship · **`CANARY_SURFACE=platform` 시** 3.4 fixture | 키워드/발화 → platform · 우선순위 **dispatch > ship > implementation > platform** |
| `Edit` | 미사용 | platform Out (후순위) |

### 4.2 live platform command 키워드

대소문자 무시 부분 일치:

`check:mem-header` · `check-mem-header` · `claude-mem` · `worker-service.cjs` · `autoUpdate`

발화 폴백: `classifyTurn` 카테고리 `platform`.

### 4.3 선택 (live)

pin 제외 · `surface`∩`{platform}` · `route` 동일 함수 · `fitBudget`.

---

## 5. Enable

| 플래그 | … | **platform (3.4)** |
|---|---|---|
| unset | no-op | no-op |
| canary | … | **CANARY=platform** 시 fixture |
| live=`1` | … | **`PHASE3_4_PLATFORM_LIVE_AUTHORIZED` 없으면 스킵** |

보수 기본: RESULT 전 상수 **`false`**. default-on **금지**.

---

## 6. 강제가능성

| 효과 | 등급 |
|---|---|
| `check:mem-header` 명령 형태 | soft 측정 |
| autoUpdate 영속 / 패치 강제 | **주장 금지** (G/J) |

---

## 7. 준수 게이트

정본: [`RULE-ROUTER-PHASE3.4-PREREG.md`](./RULE-ROUTER-PHASE3.4-PREREG.md).  
전달 불충분 · 행동 위치 · H1 absence · **시크릿/export COMPLY 금지**.

---

## 8. 구현 산출물

| 산출 | 역할 |
|---|---|
| `scripts/rule-router-jit.ts` | platform 레인 · fixture · live gate |
| `scripts/rule-router-jit.test.ts` | canary/live blocked/priority |
| PHASE3.4-PREREG + RESULT | 준수 게이트 |

---

## 9. Must not

- 3.3 PREREG 재측정 · COMPLY 사후 완화  
- secret-shaped / export-token COMPLY  
- live platform pre-canary · default-on  
- reopen sealed PREREGs · JIT exit 2  

---

## 10. Done-when (명세 웨이브)

- [x] 본 SPEC rev-1  
- [x] PREREG 봉인 · 훅 · canary · RESULT (T1 FAIL · live false)

[RULE-ROUTER-PHASE3.4-SPEC rev-1] slice=3.4-platform fixture=traps.claude-mem-patch sha8=5dc579d1 wire=Bash c1=two-step no_secret_comply=yes
