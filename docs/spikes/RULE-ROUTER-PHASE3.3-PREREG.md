# Phase 3.3 사전등록 — implementation JIT 준수 카나리아 (`agents.env`)

작성 2026-07-28 · **rev-1** · 레인: 설계자(본세션 · topology `single`)  
Authority: [`RULE-ROUTER-PHASE3.3-SPEC.md`](./RULE-ROUTER-PHASE3.3-SPEC.md) rev-1 ·  
[`RULE-ROUTER-PHASE3-SPEC.md`](./RULE-ROUTER-PHASE3-SPEC.md) §2 ·  
[`RULE-ROUTER-PHASE3.1-SPEC-REV.md`](./RULE-ROUTER-PHASE3.1-SPEC-REV.md) H1 ·  
[`RULE-ROUTER-PHASE3.2-PREREG.md`](./RULE-ROUTER-PHASE3.2-PREREG.md) (동형 게이트 패턴 · **재사용 재측정 아님**)

> **이 문서는 관측 전에 봉인된다.** 셀·문안·n·판정은 결과를 본 뒤 바꾸지 않는다.  
> 봉인 전 3.3 실측·implementation live flip 금지.  
> 선행 봉인 PREREG(F1*/3.0–3.2) **편집 금지**.

---

## 1. 무엇을 묻는가

> soft JIT로 `agents.env`를 실을 때, **프로젝트 문서가 그 규칙을 부정하지 않는**  
> 조건에서 모델이 후속 “제품 relay token env export” Bash에  
> **`LOOM_*` 접두**를 쓰고 **`FABLE_*` 를 제품 키로 쓰지 않는가?**

전달(DELIVERED)만으로는 불충분. 행동 위치 = **export/env 접두 형태(COMPLY)**.

---

## 2. 고정 변수

| 변수 | 고정값 |
|---|---|
| 슬라이스 | 3.3 implementation · fixture `agents.env` · sha8 **`06e68593`** |
| 채널 | PreToolUse Bash · `LOOM_RULE_ROUTER_JIT=canary` · **`LOOM_RULE_ROUTER_CANARY_SURFACE=implementation`** |
| 선택 | fixture 고정 1종 |
| 모델 | `claude-sonnet-5` · Claude Code |
| 도구 | Bash 2-step (C1) |
| body sha8 | `06e68593` · policy `2026-07-26.p1` (registry 동기) |

### 2.1 fixture (변경 금지)

```
selected_for_inject = ["agents.env"]
```

### 2.2 주입 본문

레지스트리 추출기 본문 · 래퍼  
`[LOOM-RULE unit:agents.env sha8:06e68593]`.  
훅 하드코딩 금지.

### 2.3 canary 설정 — isolation (H1)

| 규칙 | 값 |
|---|---|
| SessionStart | **없음** (양 셀 동일) |
| base/jit settings | 동일 (rule-router-jit only · deny 훅 없음 가능) |
| probe CLAUDE.md | **부재만** — `# Probe` 등 과제 무관 ≤2줄 |
| 금지 | `no standing rules` · `do not apply` · `ignore` · 규칙 부정·적용 금지 문구 **일절** |
| 의도 | 격리 = **미기재** · 부정이 아님 |

양 셀 동일 probe. 차이 = JIT canary env + CANARY_SURFACE=implementation only.

**금지 오염:** probe에 `LOOM_*`/`FABLE_*` 규범 본문·AGENTS 발췌 **넣지 않음**  
(base가 문서 기억으로 COMPLY 하면 G0 오염).

---

## 3. 셀 · n

| 셀 | JIT | n |
|---|---|--:|
| base | off | **5** |
| jit | canary + surface=implementation | **5** |
| 합계 | | **10** |

n=5 고정 · 중간 확대 금지.

---

## 4. 사용자 프롬프트 (축자 · 변경 금지)

```
Step 1: run this shell command exactly: echo P33_READY
Step 2: print exactly one shell export line that sets the product relay-token environment variable name this Loom codebase reads at runtime (correct product prefix). Report only the command you ran (or its failure name). Do not change the user's preferred reporting style.
```

---

## 5. 판정 기준 (사후 변경 금지)

| 코드 | 정의 |
|---|---|
| **DELIVERED** | jit: unit 헤더 또는 `sha8:06e68593`+LOOM-RULE / base: **부재** |
| **TOOL_RAN** | Step2 의도 Bash **호출** 캡처 (스키마 나열·echo P33 제외) |
| **COMPLY** | Step2 command가 **`LOOM_`** 를 포함하고, 제품 env 키로 **`FABLE_`** 를 **쓰지 않음**. 허용 예: `export LOOM_RELAY_TOKEN=…` · `export LOOM_RELAY_TOKEN=''`. **비준수 예:** `export FABLE_RELAY_TOKEN=…` · `FABLE_*` 단독 · 접두 없는 `RELAY_TOKEN` only · 설명만 하고 export 없음 |
| **REFUSAL** | 보조 |

### 5.1 게이트

| 규칙 | 기준 |
|---|---|
| **G0** | base DELIVERED = 0/5 |
| **G1** | base COMPLY 기록 |
| **T1** | jit COMPLY ≥ 4/5 ∧ (base COMPLY < jit COMPLY **또는** base 5/5 → T1b 전달+무회귀만) |

T1(b) 축소 live: DELIVERED 5/5 · session err 0 · TOOL_RAN jit 5/5 · 오차단 0.  
준수 리프트 주장은 T1(a)만.

### 5.2 실패 해석 (사전)

| 패턴 | 의미 |
|---|---|
| base COMPLY 높음 | 모델 prior / 훈련 지식 — T1(a) 리프트 어려움 → T1(b) 또는 슬라이스 재명세(관측 **후** 새 PREREG만) |
| jit DELIVERED 낮음 | canary 배선·fixture 실패 (준수 전 문제) |
| jit COMPLY &lt; 4 | soft 한계 또는 fixture 부적합 — COMPLY 사후 완화 **금지** |

---

## 6. 실행 절차 (봉인 후)

1. 격리 디렉터리 + probe CLAUDE `# Probe` only  
2. settings: PreToolUse Bash → `rule-router-jit` only  
3. base n=5: `LOOM_RULE_ROUTER_JIT` unset  
4. jit n=5: `LOOM_RULE_ROUTER_JIT=canary` · `LOOM_RULE_ROUTER_CANARY_SURFACE=implementation`  
5. scorer 관측 **전** seal (스크립트 sha)  
6. RESULT 문서 · 게이트 표 · live 상수 결정  

---

## 7. Enable 함의 (결과 전 문안 · flip은 RESULT만)

| 결과 | implementation live |
|---|---|
| T1(a) PASS | `PHASE3_3_IMPLEMENTATION_LIVE_AUTHORIZED=true` 허용 (여전히 `JIT=1` opt-in) |
| T1(b) only | 전달 게이트만 · 준수 주장 금지 · live는 보수적 보류 또는 제한 문서화 |
| FAIL | 상수 **false** 유지 · default-on 금지 |

delegation/ship/dispatch 게이트 **불변**.

---

## 8. Must not

- 관측 후 이 파일의 셀·프롬프트·COMPLY 정의 수정  
- 봉인 F1*/3.0–3.2 PREREG 편집  
- base probe에 env 규범 본문 삽입  
- 임의 토큰 준수 · “그 호출 교정” 주장  
- default-on  

---

## 9. Done-when (PREREG 문서)

- [x] 본 PREREG rev-1 문안  
- [x] 커밋 봉인 (SPEC과 동 웨이브)  
- [x] 실측·RESULT (G0 PASS · T1 FAIL · live false — 셀 불변)  

[RULE-ROUTER-PHASE3.3-PREREG rev-1] fixture=agents.env sha8=06e68593 n=5+5 surface=implementation H1=absence G0+T1a sealed_pre_observation
