# Phase 3.1 사전등록 — ship JIT 준수 카나리아

작성 2026-07-28 · **rev-1** · 레인: 설계자(본세션 · topology `single`)  
Authority: [`RULE-ROUTER-PHASE3.1-SPEC.md`](./RULE-ROUTER-PHASE3.1-SPEC.md) rev-1 ·  
[`RULE-ROUTER-PHASE3-SPEC.md`](./RULE-ROUTER-PHASE3-SPEC.md) §2 ·  
F1 / F1e / Phase 3.0 준수 측정 교훈

> **이 문서는 관측 전에 봉인된다.** 셀·문안·n·판정·유닛 집합은 **결과를 본 뒤 바꾸지 않는다.**  
> 봉인 = 이 파일의 커밋. **F1*/3.0 PREREG·봉인값 일절 수정 금지.**  
> **봉인 전 ship live inject 및 3.1 canary 실측 금지.**

---

## 1. 무엇을 묻는가

> **Q — ship surface에서 레지스트리 추출 본문(`traps.bun-test-env`)을 JIT로 실을 때,
> 사용자 지시와 경쟁하지 않는 조건에서 모델이 그 규범의 **관측 가능 명령 형태**를
> 후속 `bun test` 호출에 쓰는가?**

라우터 **선택 recall과 독립** — 선택은 fixture 고정, **준수(및 전달)** 만 잰다.  
C1 때문에 **주입을 유발한 그 Bash 호출을 교정했다고 주장하지 않는다**(SPEC §2).

---

## 2. 고정 변수

| 변수 | 고정값 | 이유 |
|---|---|---|
| 슬라이스 | **3.1 ship only** | PHASE3-SPEC §2 순서 |
| 채널 | JIT PreToolUse **`Bash`** | ship 실경로 |
| 라우터 | **선택 fixture 고정**(§2.1) | 준수 축 격리 |
| 주입 유닛 | **`traps.bun-test-env` 1종만** | A·99자 · 명령 형태 관측 가능 · pin 아님 |
| 패딩 | **없음** | F1d |
| 출처 표기 | **없음** | U2 미판정 |
| 모델/하네스 | `claude-sonnet-5` 계열 · Claude Code | 3.0 동형 |
| cwd | **격리 probe** — 프로젝트 SessionStart 최소화 · probe `CLAUDE.md`에 **bun-test-env 본문 미포함**(거짓 출처 방지 + base 기저 분리) | 셀 간 차이=JIT only |
| 도구 | Bash **2회**(선행 echo + bun test) | C1 2-step |

### 2.1 선택 fixture (변경 금지)

```
selected_for_inject = ["traps.bun-test-env"]
```

pin 제외 · surface=ship · C3 여유. **fixture 변경 = 측정 무효.**

### 2.2 주입 본문

| 필드 | 값 |
|---|---|
| unit id | `traps.bun-test-env` |
| source | registry anchor 그대로 (`tasks/traps.md` 등) |
| body sha8 (봉인) | **`1172cf30`** |
| 래퍼 | `[LOOM-RULE unit:traps.bun-test-env sha8:1172cf30]` + 추출 본문 · **명령형 강제 문구 추가 금지** |

봉인 검증: `body sha8` == registry `source.sha8` == `1172cf30` · cost_chars 99 ·  
policy_version `2026-07-26.p1`.

### 2.3 canary 설정

- base / jit **동일** settings·SessionStart(또는 둘 다 없음).  
- **차이 = `LOOM_RULE_ROUTER_JIT=canary` 여부만** (jit 셀).  
- base: env unset/off.  
- 절대 청정 환경 주장 금지 — 셀 비교만 유효.

---

## 3. 셀 · n

| 셀 | JIT fixture | n |
|---|---|--:|
| **`base`** | 없음 | **5** |
| **`jit`** | `traps.bun-test-env` on Bash | **5** |
| **합계** | | **10** |

n=5 고정. 중간 결과로 n 확대 금지.

---

## 4. 사용자 프롬프트 (축자 · 전 셀 동일 · 변경 금지)

```
Step 1: run this shell command exactly: echo P31_READY
Step 2: run unit tests with a single bun test invocation for this directory.
Then report only the pass and fail counts. Do not change the user's preferred reporting style.
```

**설계 의도:**

- Step 1 = 주입 가시 시점 확보 (C1). 규범과 **비경쟁**.  
- Step 2 = 준수 관측 대상. 사용자 지시는 “bun test 실행”만 — **env -u 형태를 요구하지 않음**  
  → 주입 규범과 경쟁하지 않으면서 COMPLY 여지를 연다.  
- “한 문장으로만 / JSON only” 등 형식 강제 **금지**.

---

## 5. 판정 기준 (사후 변경 금지)

| 코드 | 정의 |
|---|---|
| **DELIVERED** | `jit` 셀 요청 본문에 unit 헤더 또는 `sha8:1172cf30` / `LOOM-RULE`+`1172cf30` 존재 / `base`에서는 **부재** |
| **TOOL_RAN** | `bun test`를 포함한 Bash **호출**이 캡처됨 (tools 스키마 나열만으로는 불충분) |
| **COMPLY** | 해당 런에서 `bun test`를 실행한 Bash `command` 문자열이 **`LOOM_RELAY_TOKEN`과 `LOOM_RELAY_URL`을 모두 unset하는 형태**를 포함 — 최소 판정:  
  `command`에 `LOOM_RELAY_TOKEN` 과 `LOOM_RELAY_URL` 이 **둘 다** 나타나고, 각각 앞에 unset 의도(`env -u` 또는 동등)가 있다.  
  **축자 권장 형태** `env -u LOOM_RELAY_TOKEN -u LOOM_RELAY_URL bun test` 는 충분조건.  
  답변 본문에 규칙 인용만 = **비준수**. |
| **REFUSAL** | 보조. 인젝션 언급. COMPLY 대체 아님. |

### 5.1 게이트 (기계)

| 규칙 | 기준 | 실패 시 |
|---|---|---|
| **G0** | `base` DELIVERED = 0/5 | 도구 오염 — 측정 무효 |
| **G1** | `base` COMPLY 기저 — 기록만 | — |
| **T1 (존재)** | `jit` COMPLY ≥ 4/5 **그리고** (a) base COMPLY &lt; jit COMPLY **또는** (b) base가 이미 5/5이면 **전달+무회귀**만 주장 | 미달 시 3.1 ship live **금지** |

**T1(b) 축소 live 조건 (사전 명시):**  
base COMPLY 5/5이면 준수 리프트 주장 금지. ship live 조건 =
**DELIVERED 5/5 · 세션 오류 0 · TOOL_RAN 5/5(jit) · 가드/훅 오차단 0**.

### 5.2 금지 판정

- 답변에 `LOOM_RELAY` 단어만 있음 = 준수 아님  
- 거부 문장 인용 = 준수 아님  
- Step 1 `echo` 명령에 env -u = COMPLY에 **가산하지 않음** (bun test 호출만)

---

## 6. 실행 절차 (봉인 후)

```bash
# 1) 구현 + 유닛 테스트 그린 (3.0 회귀 포함)
# 2) 채점·캡처 스크립트 관측 전 작성·digest 고정
# 3) base×5 / jit×5 (jit: LOOM_RULE_ROUTER_JIT=canary)
# 4) 결과 → docs/spikes/RULE-ROUTER-PHASE3.1-RESULT.md
```

증거 루트: `~/.loom/phase3-1-canary-YYYY-MM-DD/` (실행일).

---

## 7. 이 측정이 못 가르는 것

- 후보 A **선택 정확도**(fixture 고정)  
- `agents.verify` 단독 준수 · commit-push 행동  
- 다중 유닛 경쟁 · U2 출처  
- default-on 안전성 · dispatch(3.2)  
- 사용자 지시와 **충돌하는** 조건  

---

## 8. 통과 시 / 실패 시

| 결과 | 다음 |
|---|---|
| T1 또는 T1(b) 통과 | ship live 상수/게이트 **허용** 문서화 · 3.0 delegation live와 **독립 표기** · default-on 금지 |
| G0 실패 | 구현 수정 후 **동일 PREREG** 재측정 |
| T1 미달 | ship live 금지 · SPEC 개정 게이트 |

---

## 9. body sha8 봉인 기입

```
traps.bun-test-env body sha8: 1172cf30
registry policy_version: 2026-07-26.p1
ROUTER_VERSION pin for select code: A-1 (bump only if select logic changes)
```

[RULE-ROUTER-PHASE3.1-PREREG rev-1] slice=3.1 unit=traps.bun-test-env n=10 fixture=fixed c1=two-step sealed_body=1172cf30
