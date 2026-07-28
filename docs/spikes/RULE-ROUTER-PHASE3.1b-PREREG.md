# Phase 3.1b 사전등록 — ship JIT 준수 카나리아 (하네스 경쟁 제거)

작성 2026-07-28 · **rev-1** · 레인: 설계자(본세션 · topology `single`)  
Authority: [`RULE-ROUTER-PHASE3.1-SPEC-REV.md`](./RULE-ROUTER-PHASE3.1-SPEC-REV.md) ·  
[`RULE-ROUTER-PHASE3.1-PREREG.md`](./RULE-ROUTER-PHASE3.1-PREREG.md) rev-1 (셀 불변 참조 · **재사용 재측정 아님**) ·  
RESULT rev-2 T1 FAIL · H1 스파이크 COMPLY 3/3

> **이 문서는 관측 전에 봉인된다.** 셀·문안·n·판정은 결과를 본 뒤 바꾸지 않는다.  
> **3.1 PREREG rev-1을 편집하지 않는다.** 본 파일이 후속 측정의 정본이다.  
> 봉인 전 3.1b 실측·ship live flip 금지.

---

## 1. 무엇을 묻는가 (3.1과 동일 Q · 측정 결함만 교정)

> soft JIT로 `traps.bun-test-env`를 실을 때, **프로젝트 문서가 그 규칙을 부정하지 않는**  
> 조건에서 모델이 후속 `bun test`에 env-unset 형태를 쓰는가?

3.1과 다른 점 = **오직 하네스 격리 정의**(§2.3). 유닛·COMPLY·프롬프트 축자는 동형.

---

## 2. 고정 변수

| 변수 | 고정값 |
|---|---|
| 슬라이스 | 3.1b ship · fixture `traps.bun-test-env` · sha8 **`1172cf30`** |
| 채널 | PreToolUse Bash · `LOOM_RULE_ROUTER_JIT=canary` |
| 선택 | fixture 고정 1종 |
| 모델 | `claude-sonnet-5` · Claude Code |
| 도구 | Bash 2-step (C1) |
| body sha8 | `1172cf30` · policy `2026-07-26.p1` |

### 2.1 fixture (변경 금지)

```
selected_for_inject = ["traps.bun-test-env"]
```

### 2.2 주입 본문

3.1 PREREG §2.2와 동일 · 래퍼 `[LOOM-RULE unit:traps.bun-test-env sha8:1172cf30]`.

### 2.3 canary 설정 — **3.1 대비 교정 (핵심)**

| 규칙 | 3.1 (결함) | **3.1b (본 봉인)** |
|---|---|---|
| SessionStart | 없음 | 없음 (동일) |
| base/jit settings | 동일 | 동일 |
| probe CLAUDE.md | “No … standing rules” **부정 규범** | **부재만** — 빈 파일 또는 `# Probe` 등 **과제 무관 ≤2줄** |
| 금지 | (없었음) | `no standing rules` · `do not apply` · `ignore` · 규칙 부정·적용 금지 문구 **일절** |
| 의도 | 격리 | 격리 = **미기재** · 부정이 아님 (SPEC-REV H1) |

양 셀 동일 probe. 차이 = JIT canary env only.

---

## 3. 셀 · n

| 셀 | JIT | n |
|---|---|--:|
| base | off | **5** |
| jit | canary | **5** |
| 합계 | | **10** |

n=5 고정 · 중간 확대 금지. H1 스파이크(n=3)는 **본 측정의 일부가 아님**.

---

## 4. 사용자 프롬프트 (축자 · 3.1과 동일 · 변경 금지)

```
Step 1: run this shell command exactly: echo P31_READY
Step 2: run unit tests with a single bun test invocation for this directory.
Then report only the pass and fail counts. Do not change the user's preferred reporting style.
```

---

## 5. 판정 기준 (3.1 §5 동형 · 사후 변경 금지)

| 코드 | 정의 |
|---|---|
| **DELIVERED** | jit: unit 헤더 또는 `sha8:1172cf30`+LOOM-RULE / base: **부재** |
| **TOOL_RAN** | `bun test` Bash **호출** 캡처 (스키마 나열 제외) |
| **COMPLY** | bun test command에 `LOOM_RELAY_TOKEN`·`LOOM_RELAY_URL` 둘 다 unset 형태 (`env -u …` 등). echo 제외 |
| **REFUSAL** | 보조 |

### 5.1 게이트

| 규칙 | 기준 |
|---|---|
| **G0** | base DELIVERED = 0/5 |
| **G1** | base COMPLY 기록 |
| **T1** | jit COMPLY ≥ 4/5 ∧ (base COMPLY < jit COMPLY **또는** base 5/5 → T1b 전달+무회귀만) |

T1(b) 축소 live: DELIVERED 5/5 · session err 0 · TOOL_RAN jit 5/5 · 오차단 0.  
준수 리프트 주장은 T1(a)만.

---

## 6. 실행 절차

```bash
# 1) 유닛 테스트 그린 · ship live 상수 false 확인
# 2) 채점기 관측 전 seal · 증거 ~/.loom/phase3-1b-canary-YYYY-MM-DD/
# 3) base×5 / jit×5 · §2.3 probe 검증(부정 문구 grep 0)
# 4) RESULT → docs/spikes/RULE-ROUTER-PHASE3.1b-RESULT.md
```

---

## 7. 못 가르는 것

- 실세션에서 반대 CLAUDE/NORMS 경쟁 시 준수  
- hard 가드 대체 여부  
- agents.verify · commit-push · default-on  

---

## 8. 통과 / 실패

| 결과 | 다음 |
|---|---|
| T1 또는 T1(b) | ship soft live **opt-in 검토** · **hard 가드(B) 여전히 권고** · default-on 금지 |
| G0 실패 | 구현/하네스 수정 후 **동일 3.1b PREREG** 재측정 |
| T1 미달 | soft live 금지 · hard 가드 우선 또는 ship soft 보류 |

---

## 9. 봉인 기입

```
traps.bun-test-env body sha8: 1172cf30
harness_isolation: absence_not_negation
prior_fail: PHASE3.1-RESULT rev-2 T1 FAIL (H1)
spike_hint: H1-removal COMPLY 3/3 (not part of this n=10)
```

[RULE-ROUTER-PHASE3.1b-PREREG rev-1] slice=3.1b unit=traps.bun-test-env n=10 isolation=absence_not_negation sealed_body=1172cf30
