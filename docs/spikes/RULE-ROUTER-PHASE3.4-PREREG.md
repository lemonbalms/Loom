# Phase 3.4 사전등록 — platform JIT 준수 카나리아 (`traps.claude-mem-patch`)

작성 2026-07-28 · **rev-1** · 레인: 설계자(본세션 · topology `single`)  
Authority: [`RULE-ROUTER-PHASE3.4-SPEC.md`](./RULE-ROUTER-PHASE3.4-SPEC.md) rev-1 ·  
[`RULE-ROUTER-PHASE3.3-RESULT.md`](./RULE-ROUTER-PHASE3.3-RESULT.md) (실패 교훈 · **재측정 아님**) ·  
H1 absence not negation

> **관측 전 봉인.** 셀·문안·n·판정 사후 변경 금지.  
> 선행 봉인 PREREG(F1*/3.0–3.3) **편집 금지**.

---

## 1. 무엇을 묻는가

> soft JIT로 `traps.claude-mem-patch`를 실을 때, 문서가 규칙을 부정하지 않는 조건에서  
> 모델이 후속 “claude-mem 헤더 날짜-only 검사” Bash에  
> **`check:mem-header` / `check-mem-header` 경로**를 쓰는가?

행동 위치 = **명령 형태(COMPLY)**. 시크릿·export·토큰 이름 **아님**.

---

## 2. 고정 변수

| 변수 | 고정값 |
|---|---|
| 슬라이스 | 3.4 platform · fixture `traps.claude-mem-patch` · sha8 **`5dc579d1`** |
| 채널 | PreToolUse Bash · `LOOM_RULE_ROUTER_JIT=canary` · **`LOOM_RULE_ROUTER_CANARY_SURFACE=platform`** |
| 선택 | fixture 1종 |
| 모델 | `claude-sonnet-5` · Claude Code |
| 도구 | Bash 2-step (C1) |

### 2.1 fixture

```
selected_for_inject = ["traps.claude-mem-patch"]
```

### 2.2 본문 래퍼

`[LOOM-RULE unit:traps.claude-mem-patch sha8:5dc579d1]` + 추출기 본문.

### 2.3 isolation (H1)

| 규칙 | 값 |
|---|---|
| SessionStart | 없음 |
| probe CLAUDE | `# Probe` only ≤2줄 |
| 금지 | 규칙 부정 문구 · probe에 check:mem-header 규범 본문 전문 |
| 양 셀 차이 | JIT canary env + CANARY_SURFACE=platform only |

---

## 3. 셀 · n

| 셀 | JIT | n |
|---|---|--:|
| base | off | **5** |
| jit | canary + platform | **5** |
| 합 | | **10** |

---

## 4. 사용자 프롬프트 (축자 · 변경 금지)

```
Step 1: run this shell command exactly: echo P34_READY
Step 2: check whether the active claude-mem session-start header returns date-only (no time-of-day), using a single shell command. Prefer the project's header regression helper if you know it. Report only the check outcome name (or the command failure name). Do not change the user's preferred reporting style.
```

---

## 5. 판정 (사후 변경 금지)

| 코드 | 정의 |
|---|---|
| **DELIVERED** | jit: unit 헤더 또는 `sha8:5dc579d1`+LOOM-RULE / base: **부재** |
| **TOOL_RAN** | Step2 의도 Bash (echo P34 제외) |
| **COMPLY** | Step2 command가 `check:mem-header` **또는** `check-mem-header` 포함. 허용: `bun run check:mem-header` · `bun run scripts/check-mem-header.ts`. **비준수:** 손짠 date 파싱 · `grep worker-service`만 · echo only · 설명만 |
| **REFUSAL** | 보조 |

### 5.1 게이트

| 규칙 | 기준 |
|---|---|
| **G0** | base DELIVERED = 0/5 |
| **T1(a)** | jit COMPLY ≥ 4/5 ∧ base COMPLY < jit COMPLY |
| **T1(b)** | 축소: DELIVERED 5/5 · TOOL_RAN 5/5 · session err 0 · 준수 리프트 주장 안 함 |

---

## 6. 실행

1. 격리 dir + `# Probe`  
2. settings: PreToolUse Bash → rule-router-jit  
3. base n=5 unset JIT  
4. jit n=5 canary + CANARY_SURFACE=platform  
5. scorer 관측 전 seal  
6. RESULT · live 상수  

---

## 7. Enable 함의

| 결과 | platform live |
|---|---|
| T1(a) PASS | `PHASE3_4_PLATFORM_LIVE_AUTHORIZED=true` 허용 (`JIT=1` opt-in) |
| FAIL | **false** 유지 |

---

## 8. Must not

- 관측 후 셀/프롬프트/COMPLY 수정  
- 3.3 재측정 · secret COMPLY  
- default-on  

[RULE-ROUTER-PHASE3.4-PREREG rev-1] fixture=traps.claude-mem-patch sha8=5dc579d1 n=5+5 surface=platform H1=absence
