# Phase 3.2 착수 명세 — dispatch surface JIT (후보 A)

작성 2026-07-28 · **rev-1** · 레인: 본세션(topology `single`)  
Authority: [`RULE-ROUTER-PHASE3-SPEC.md`](./RULE-ROUTER-PHASE3-SPEC.md) rev-1 §2  
( surface 순서 고정 · **3.1 통과 후**) ·  
[`RULE-ROUTER-PHASE3.1b-RESULT.md`](./RULE-ROUTER-PHASE3.1b-RESULT.md) rev-1  
(ship soft live opt-in) · [`RULE-ENFORCEABILITY.md`](./RULE-ENFORCEABILITY.md) ·  
[`RULE-ROUTER-PHASE3.1-SPEC-REV.md`](./RULE-ROUTER-PHASE3.1-SPEC-REV.md) H1  
(isolation = **absence not negation**)

> **3.1 통과 ≠ 3.2 구현 권한 자동 승격.** 3.2는 **별 SPEC + PREREG 봉인** 후 코드·canary.  
> **3.2 카나리아 통과 전** dispatch surface live inject **금지**.  
> 기존 `LOOM_RULE_ROUTER_JIT=1` 은 delegation·ship(이미 게이트된 surface)만 —  
> dispatch를 몰래 켜지 않는다.  
> **default-on 금지.** 봉인 F1*/3.0/3.1/3.1b PREREG **재개방 금지**.

---

## 0. 한 줄

**Bash PreToolUse**에서 후보 A가 고른 **dispatch 프로세스 규범**을 append-only 주입한다.  
1차 카나리아 유닛 = **`traps.watch-card`** (관측 가능 명령 형태: `watch-card.ts` + `--pane`).  
pane/브릿지 **hard-lock 주장 금지** — soft JIT + 경로 맵 범위만.

---

## 1. 범위

| In | Out |
|---|---|
| surface=`dispatch` · matcher **실측 Bash** (watch-card / dispatch / herdr 키워드) | 3.0/3.1 PREREG 재개방 · ship/delegation 게이트 재협상 |
| canary fixture `traps.watch-card` · live non-pin `surface`∋`dispatch` | pin 유닛 JIT · pin=충돌 회피 (M-1) |
| opt-in 공유 플래그 · **surface별 live 게이트** | dispatch default-on · MCP 도구명 발명 매처 |
| C1–C3 · 추출기 본문 · receipt · H1 isolation | U2 · 형식-경쟁 해소기 · pane hard-lock 전칭 |

**Harness claim:** Claude Code only (3.0/3.1과 동일).

**실측 와이어 (발명 금지):**  
현행 `.claude/settings.json` PreToolUse = `Agent|Task` + `Bash` 만.  
MCP `dispatch_card` 등은 별 matcher 없으면 **이 슬라이스 Out**  
(문서·후속 슬라이스). 1차 관측 표면 = **Bash → `scripts/watch-card.ts` 형태**.

---

## 2. 유닛 집합 (inventory · non-pin · `surface`∋`dispatch`)

| id | grade | cost≈ | 1차 역할 |
|---|:---:|---:|---|
| `orch.lane-placement` | G | 734 | live 후보 (길·복합 — canary 비우선) |
| `orch.watch-card` | A | 318 | live 후보 (traps와 중복 취지) |
| `orch.card-done` | A | 594 | live 후보 |
| `agents.impl-delegation` | G | 439 | live (delegation∩dispatch) |
| **`traps.watch-card`** | **A** | **93** | **canary fixture** |
| `traps.card-done` | A | 122 | live |
| `traps.dispatch-marker` | A | 139 | live |
| `traps.terminal-replay` | A | 85 | live (bridge 인접) |
| `traps.pane-lane-death` | A | 76 | live |
| `traps.grok-readonly` | A | 114 | live (delegation∩dispatch) |

**pin 제외.** canary = fixture 1종 고정. live = route∩surface∩!pin + fitBudget.

---

## 3. C1 함정 (설계 강제)

PreToolUse `additionalContext`는 **그 도구 호출의 tool_result 이후**에 보인다.  
→ **같은 Bash command를 교정한다고 문서·로그에 쓰지 않는다.**

3.2 카나리아 = **2-step** (3.1 동형):

1. 무해 선행 Bash (`echo P32_READY`) → 주입 가시  
2. 후속 “워커 pane 감시” Bash에서 **명령 형태** 채점 (COMPLY)

---

## 4. 주입 계약 (3.0 §3 승계 + dispatch)

| # | 규칙 |
|---|---|
| 1 | `hookSpecificOutput.additionalContext` · exit 0 · 비차단 · JIT **exit 2 금지** |
| 2 | C1 준수 — “그 호출 교정” 금지 |
| 3 | C2 — 서브에이전트 요청에 규칙 인라인 금지 |
| 4 | C3 — 1이벤트 &lt;10k · 초과=전체 스킵 |
| 5 | Append-only · 본문 SSOT=추출기 · 하드코딩 금지 |
| 6 | Receipt: unit ids · sha8 · chars · **surface=dispatch** · slice=3.2 · router_version |
| 7 | pin 유닛 JIT 페이로드 제외 (M-1) |

### 4.1 도구 레인

| 도구 | canary | dry-run / live |
|---|---|---|
| `Agent`\|`Task` | 3.0 fixture 유지 | surface=`delegation` (기존) |
| `Bash` | **기본 ship fixture**(3.1 회귀) · **`LOOM_RULE_ROUTER_CANARY_SURFACE=dispatch` 일 때만** 3.2 fixture | command 키워드 **또는** 발화 `dispatch` 분류 시 surface=`dispatch` · ship 키워드/분류는 기존 ship 레인 · **dispatch 키워드 우선** |
| `Edit` | canary 미사용 | 3.2 Out (후순위) |
| 기타 | no-op | no-op |

### 4.2 live dispatch command 키워드 (결정론 · 최소)

대소문자 무시 부분 일치:

`watch-card` · `watch:card` · `dispatch_card` · `dispatch-card` · `herdr ` · `loom dispatch`

(발화 폴백: `classifyTurn` 카테고리에 `dispatch` 포함.)

ship과의 경합: **dispatch 키워드가 command에 있으면 dispatch** · 없으면 ship 게이트 평가.

### 4.3 선택 (live · 후보 A)

1. pin 제외  
2. `surface` ∩ `{dispatch}`  
3. `route`/`classifyTurn` 동일 함수 (복사 금지)  
4. `fitBudget` · 등급 H>G>A · 초과 유닛 통째 drop  

---

## 5. Enable 정책 (surface-gated)

| 플래그 | delegation (3.0) | ship (3.1b) | **dispatch (3.2)** |
|---|---|---|---|
| unset/off | no-op | no-op | no-op |
| dry-run | 결정·receipt | 결정·receipt | 결정·receipt |
| canary | 3.0 fixture | 3.1 fixture (Bash 기본) | **CANARY_SURFACE=dispatch** 시 3.2 fixture |
| `1`/live | 허용 | 허용(opt-in) | **3.2 카나리아 통과 전 금지** → `dispatch_gate_blocked` |

**구현 의무:** `LOOM_RULE_ROUTER_JIT=1` 이어도 dispatch 레인 inject는  
`PHASE3_2_DISPATCH_LIVE_AUTHORIZED === true` 없이 **스킵**.  
보수 기본: RESULT 통과 문서화 전까지 상수 **`false`**.

default-on: **금지**.

---

## 6. 강제가능성 (사전 표기 · 주장 상한)

| 유닛/효과 | 사전 등급 | 비고 |
|---|---|---|
| `traps.watch-card` 명령 형태 | soft JIT 측정 대상 · 범위 한정 **H 후보**(Claude Bash only) 는 **후속** | 3.2는 soft canary first (HANDOFF) |
| card.done 의미 충분성 | **G/J** | 독립 검증은 사람/별 게이트 |
| pane/브릿지 전칭 hard-lock | **주장 금지** | path map 미폐쇄 |

RULE-ENFORCEABILITY: dispatch 다수 규칙은 **G/J** — soft 전달≠강제.

---

## 7. 준수 게이트

정본: [`RULE-ROUTER-PHASE3.2-PREREG.md`](./RULE-ROUTER-PHASE3.2-PREREG.md).  
전달 카나리아 불충분 · 임의 토큰 금지 · 행동 위치 판정 · 경쟁 프롬프트 금지 ·  
probe isolation = **absence not negation** (H1).

---

## 8. 구현 산출물

| 산출 | 역할 |
|---|---|
| `scripts/rule-router-jit.ts` | dispatch 레인 · 3.2 fixture · canary surface override · live gate |
| `scripts/rule-router-jit.test.ts` | Bash canary dispatch · keyword 우선 · live blocked · pin 제외 |
| `.claude/settings.json` | **변경 불요**(Bash matcher 이미 존재) — 문서화만 |
| PHASE3.2-PREREG + RESULT | 준수 게이트 |

**기존 훅 불변:** deny hooks **before** JIT · JIT never exit 2 · ship/delegation 회귀 0.

---

## 9. Must not

- live dispatch inject **pre-PREREG** 또는 canary 전  
- default-on · 봉인 PREREG 재측정/사후 완화 COMPLY  
- pin as conflict avoidance · 본문 하드코딩 · 10k truncate  
- “그 Bash 호출을 교정” · MCP/herdr 와이어 발명  
- claim pane/bridge hard-lock without path closure  
- JIT exit 2 · reopen 3.0/3.1/3.1b  

---

## 10. Done-when (이 명세 웨이브)

- [x] 본 SPEC rev-1  
- [x] PHASE3.2-PREREG 커밋 봉인  
- [x] 훅 dispatch 레인 + 유닛 테스트  
- [ ] 모델 n=10 canary → RESULT (측정 · PREREG 봉인 후)  
- [ ] HANDOFF 갱신 · ship  

[RULE-ROUTER-PHASE3.2-SPEC rev-1] slice=3.2-dispatch fixture=traps.watch-card wire=Bash c1=two-step dispatch_live=gated soft_first=yes
